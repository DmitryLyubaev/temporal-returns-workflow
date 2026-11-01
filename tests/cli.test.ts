import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import {Worker,Runtime,DefaultLogger} from '@temporalio/worker';
import {TestWorkflowEnvironment} from '@temporalio/testing';
import {makeRequest,ReturnResult} from '../src/contracts';
import {inspectReturn} from '../src/client';
import {runCli} from '../src/cli';
import {openPool} from '../src/db/pool';
Runtime.install({logger:new DefaultLogger('ERROR')});
let env:TestWorkflowEnvironment;const pool=openPool();const capture='cli'+Date.now();
before(async()=>{env=await TestWorkflowEnvironment.createFromExistingServer({address:process.env.TEMPORAL_ADDRESS??'temporal:7233',namespace:'p28'});});
after(async()=>{await env?.teardown();await pool.end();});
test('closed_inspection_uses_result and closed_signal_not_claimed_accepted',async()=>{
 const q=makeRequest({captureId:capture,returnId:'closed',currency:'AUD',amountCents:1000}),queue='cli-'+Date.now();
 const worker=await Worker.create({connection:env.nativeConnection,namespace:'p28',taskQueue:queue,workflowsPath:require.resolve('../src/workflows'),activities:{}});
 await worker.runUntil(async()=>{
  const h=await env.client.workflow.start('returnsWorkflow',{workflowId:queue,taskQueue:queue,args:[q]});
  await h.query('returnState');await h.signal('reviewDecision',{decisionId:'reject',returnId:q.returnId,reviewerId:'reviewer-demo',choice:'reject'});
  assert.equal((await h.result() as ReturnResult).outcome,'rejected');
  const inspection=await inspectReturn(env.client,queue);assert.equal(inspection.result?.outcome,'rejected');assert.equal(inspection.status,'COMPLETED');
  const output:any[]=[];
  const exit=await runCli(['decide','--workflow-id',queue,'--decision-id','late','--return','closed','--reviewer','reviewer-demo','--choice','approve'],{client:env.client,pool,write:v=>output.push(v)});
  assert.equal(exit,1);assert.equal(output[0].accepted,false);
 });
});
test('workflow_id_reuse_rejected',async()=>{
 const q=makeRequest({captureId:capture,returnId:'reuse',currency:'AUD',amountCents:1000}),queue='reuse-'+Date.now(),workflowId=`p28/${capture}/reuse`;
 const worker=await Worker.create({connection:env.nativeConnection,namespace:'p28',taskQueue:queue,workflowsPath:require.resolve('../src/workflows'),activities:{}});
 await worker.runUntil(async()=>{
  const h=await env.client.workflow.start('returnsWorkflow',{workflowId,taskQueue:queue,args:[q]});
  await h.signal('reviewDecision',{decisionId:'reject',returnId:q.returnId,reviewerId:'reviewer-demo',choice:'reject'});await h.result();
  const output:any[]=[];
  const exit=await runCli(['start','--capture',capture,'--return','reuse'],{client:env.client,pool,write:v=>output.push(v)});
  assert.equal(exit,1);assert.equal(output[0].error,'workflow_already_exists');
 });
});
