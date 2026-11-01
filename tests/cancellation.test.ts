import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import {Worker,Runtime,DefaultLogger} from '@temporalio/worker';
import {TestWorkflowEnvironment} from '@temporalio/testing';
import {openPool} from '../src/db/pool';
import {migrate} from '../src/db/migrate';
import {makeRequest,ReturnResult,RefundRequest} from '../src/contracts';
import {seed} from '../src/db/reservations';
import {startReceiver} from '../src/receiver/server';
import {createActivities} from '../src/activities';
Runtime.install({logger:new DefaultLogger('ERROR')});
const pool=openPool(),workerPool=openPool('p28_worker'),receiverPool=openPool('p28_receiver');
let env:TestWorkflowEnvironment,receiver:Awaited<ReturnType<typeof startReceiver>>,n=0;
const capture='cancel-'+Date.now();
before(async()=>{
 await migrate(pool);receiver=await startReceiver({pool:receiverPool});
 env=process.env.P28_REAL==='1'
  ? await TestWorkflowEnvironment.createFromExistingServer({address:process.env.TEMPORAL_ADDRESS??'temporal:7233',namespace:'p28'})
  : await TestWorkflowEnvironment.createTimeSkipping({server:{executable:{type:'existing-path',path:'/app/.local/tools/temporal-test-server_1.40.0_linux_amd64/temporal-test-server'}}});
});
after(async()=>{await env?.teardown();await receiver?.close();await Promise.all([pool.end(),workerPool.end(),receiverPool.end()]);});
async function reached(key:string,column:'reservation_reached'|'payment_reached'){
 const end=Date.now()+2500;
 while(Date.now()<end){if((await pool.query(`SELECT ${column} AS reached FROM fixture_control WHERE refund_key=$1`,[key])).rows[0]?.reached)return;await new Promise(resolve=>setTimeout(resolve,10));}
 throw Error('barrier_not_reached');
}
async function run(control:string,action:(h:any,r:RefundRequest)=>Promise<void>,override?:any):Promise<ReturnResult>{
 const r=makeRequest({captureId:capture,returnId:'R'+(++n),currency:'AUD',amountCents:1000});await seed(pool,r);
 await pool.query(`INSERT INTO fixture_control(refund_key${control?', '+control:''}) VALUES($1${control?', true':''})`,[r.refundKey]);
 const queue=capture+'-'+n;
 const worker=await Worker.create({connection:env.nativeConnection,namespace:env.namespace??'default',taskQueue:queue,workflowsPath:require.resolve('../src/workflows'),activities:{...createActivities(workerPool,receiver.address),...override}});
 return worker.runUntil(async()=>{
  const h=await env.client.workflow.start('returnsWorkflow',{workflowId:queue,taskQueue:queue,args:[r]});
  await h.query('returnState');await action(h,r);return await h.result() as ReturnResult;
 });
}
const approve=(h:any,r:RefundRequest)=>h.signal('reviewDecision',{decisionId:'approve',returnId:r.returnId,reviewerId:'reviewer-demo',choice:'approve'});
test('native cancellation while awaiting approval releases open reservation',async()=>{
 const result=await run('',h=>h.cancel());assert.equal(result.outcome,'cancelled');assert.equal(result.reservation,'released');
});
test('cancel_reserve_fenced',async()=>{
 const result=await run('hold_reservation',async(h,r)=>{await approve(h,r);await reached(r.refundKey,'reservation_reached');await h.cancel();});
 assert.equal(result.outcome,'cancelled');assert.equal(result.reservation,'released');
 assert.equal((await pool.query('SELECT state FROM reservations WHERE refund_key=$1',[result.request.refundKey])).rows[0].state,'released');
 assert.equal((await pool.query('SELECT * FROM receiver_effects WHERE refund_key=$1',[result.request.refundKey])).rowCount,0);
});
test('native cancellation after committed payment never releases or reverses',async()=>{
 const result=await run('hold_payment',async(h,r)=>{await approve(h,r);await reached(r.refundKey,'payment_reached');await h.cancel();await pool.query('UPDATE fixture_control SET release_payment=true WHERE refund_key=$1',[r.refundKey]);});
 assert.equal(result.outcome,'refunded');assert.equal(result.reservation,'consumed');assert.equal(result.cancellationRequested,true);
 assert.equal((await pool.query('SELECT * FROM receiver_effects WHERE refund_key=$1',[result.request.refundKey])).rowCount,1);
});
test('activity start-to-close timeout reconciles without scheduling another dispatch',async()=>{
 let dispatch=0;
 const result=await run('',approve,{dispatchPayment:async()=>{dispatch++;await new Promise(resolve=>setTimeout(resolve,7000));throw Error('late dispatch failure');}});
 assert.equal(result.outcome,'uncertain');assert.equal(result.reservation,'held');assert.equal(dispatch,1);
});
