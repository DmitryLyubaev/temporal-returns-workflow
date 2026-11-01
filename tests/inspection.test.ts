import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import {Client} from '@temporalio/client';
import {Worker,Runtime,DefaultLogger} from '@temporalio/worker';
import {TestWorkflowEnvironment} from '@temporalio/testing';
import {makeRequest} from '../src/contracts';
import {inspectReturn} from '../src/client';
Runtime.install({logger:new DefaultLogger('ERROR')});
let env:TestWorkflowEnvironment,n=0;
before(async()=>{env=await TestWorkflowEnvironment.createFromExistingServer({address:process.env.TEMPORAL_ADDRESS??'temporal:7233',namespace:'p28'});});
after(async()=>{await env?.teardown();});
async function race(mode:'completed'|'terminated'|'running',action:(client:Client,id:string,error:Error,reads:()=>number)=>Promise<void>){
 const queue='inspect'+Date.now()+'-'+(++n),request=makeRequest({captureId:queue,returnId:'R01',currency:'AUD',amountCents:1000});
 const worker=await Worker.create({connection:env.nativeConnection,namespace:'p28',taskQueue:queue,workflowsPath:require.resolve('../src/workflows'),activities:{}});
 await worker.runUntil(async()=>{
  const h=await env.client.workflow.start('returnsWorkflow',{workflowId:queue,taskQueue:queue,args:[request]});await h.query('returnState');
  const running=await h.describe();assert.equal(running.status.name,'RUNNING');
  if(mode==='completed'){await h.signal('reviewDecision',{decisionId:'reject',returnId:'R01',reviewerId:'reviewer-demo',choice:'reject'});await h.result();}
  if(mode==='terminated')await h.terminate('isolated inspection race test');
  let reads=0;const error=Error('query_failed_during_transition');
  // Both descriptions and result are genuine SDK/server data. Only the query
  // failure and delivery of the earlier description are controlled at the edge.
  const edge={describe:async()=>++reads===1?running:h.describe(),query:async()=>{throw error;},result:()=>h.result()};
  const client={workflow:{getHandle:()=>edge},connection:env.connection} as unknown as Client;
  try{await action(client,queue,error,()=>reads);}finally{if((await h.describe()).status.name==='RUNNING')await h.terminate('inspection test cleanup');}
 });
}
test('inspection recovers a completed result after a running query fails',async()=>{
 await race('completed',async(client,id,_error,reads)=>{const info=await inspectReturn(client,id);assert.equal(info.status,'COMPLETED');assert.equal(info.result?.outcome,'rejected');assert.equal(reads(),2);});
});
test('inspection returns closed non-completed status after a query race',async()=>{
 await race('terminated',async(client,id)=>{const info=await inspectReturn(client,id);assert.equal(info.status,'TERMINATED');assert.equal(info.result,undefined);});
});
test('inspection confirms still-running once and preserves the original query error',async()=>{
 await race('running',async(client,id,error,reads)=>{await assert.rejects(()=>inspectReturn(client,id),e=>e===error);assert.equal(reads(),2);});
});
