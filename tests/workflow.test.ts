import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import {Worker,Runtime,DefaultLogger} from '@temporalio/worker';
import {TestWorkflowEnvironment} from '@temporalio/testing';
import {ApplicationFailure} from '@temporalio/common';
import {makeRequest} from '../src/contracts';
import type {ReturnResult,RefundRequest,Receipt} from '../src/contracts';
Runtime.install({logger:new DefaultLogger('ERROR')});
let env:TestWorkflowEnvironment,number=0;
const r=()=>makeRequest({captureId:'workflowTests',returnId:'R'+(++number),currency:'AUD',amountCents:1000});
const receipt=(q:RefundRequest):Receipt=>({refundKey:q.refundKey,inputHash:q.inputHash,status:'committed',receiptId:'test-receipt'});
before(async()=>{env=await TestWorkflowEnvironment.createTimeSkipping({server:{executable:{type:'existing-path',path:'/app/.local/tools/temporal-test-server_1.40.0_linux_amd64/temporal-test-server'}}});});
after(async()=>{await env?.teardown();});
const base={reserveRefund:async()=>{},releaseRefund:async()=>{},finalizeRefund:async()=>{},dispatchPayment:async(q:RefundRequest)=>receipt(q),lookupReceipt:async(q:RefundRequest)=>receipt(q)};
async function run(activities:Partial<typeof base>,action?: (h:any,q:RefundRequest)=>Promise<void>):Promise<ReturnResult>{
 const q=r(),queue='test-'+q.returnId;
 const w=await Worker.create({connection:env.nativeConnection,taskQueue:queue,workflowsPath:require.resolve('../src/workflows'),activities:{...base,...activities}});
 return w.runUntil(async()=>{
  const h=await env.client.workflow.start('returnsWorkflow',{workflowId:queue,taskQueue:queue,args:[q]});
  await h.query('returnState');
  if(action)await action(h,q);else await h.signal('reviewDecision',{decisionId:'approve',returnId:q.returnId,reviewerId:'reviewer-demo',choice:'approve'});
  return await h.result() as ReturnResult;
 });
}
test('first_valid_before_deadline_wins',async()=>{
 const result=await run({},async(h,q)=>{
  await h.signal('reviewDecision',{decisionId:'wrong',returnId:q.returnId,reviewerId:'intruder',choice:'reject'});
  await h.signal('reviewDecision',{decisionId:'approve',returnId:q.returnId,reviewerId:'reviewer-demo',choice:'approve'});
 });
 assert.equal(result.outcome,'refunded');assert.equal(result.decision?.decisionId,'approve');
});
test('deadline_rejects_late_signal',async()=>{
 const result=await run({},async(h,q)=>{await env.sleep(10000);try{await h.signal('reviewDecision',{decisionId:'late',returnId:q.returnId,reviewerId:'reviewer-demo',choice:'approve'});}catch{/* closed run is allowed */}});
 assert.equal(result.outcome,'expired');assert.equal(result.reservation,'open');
});
test('unknown_payment_keeps_reservation',async()=>{
 let dispatch=0,release=0,lookup=0;
 const result=await run({dispatchPayment:async()=>{dispatch++;throw Error('lost');},lookupReceipt:async()=>{lookup++;throw Error('unavailable');},releaseRefund:async()=>{release++;}});
 assert.equal(result.outcome,'uncertain');assert.equal(result.reservation,'held');assert.equal(dispatch,1);assert.equal(lookup,3);assert.equal(release,0);
});
test('cleanup_failure_not_cancelled',async()=>{
 const result=await run({releaseRefund:async()=>{throw Error('db unavailable');}},async h=>{await h.cancel();});
 assert.equal(result.outcome,'reconciliation_required');assert.equal(result.reservation,'unconfirmed');
});
test('committed_finalize_failure_is_known_payment',async()=>{
 const result=await run({finalizeRefund:async()=>{throw Error('db unavailable');}});
 assert.equal(result.outcome,'reconciliation_required');assert.equal(result.receiver?.status,'committed');assert.equal(result.reservation,'unconfirmed');
});
test('permanent activity failure does not exhaust three attempts',async()=>{
 let attempts=0;
 const result=await run({reserveRefund:async()=>{attempts++;throw ApplicationFailure.nonRetryable('conflict','identity_conflict');}});
 assert.equal(attempts,1);assert.equal(result.outcome,'failed_compensated');
});
