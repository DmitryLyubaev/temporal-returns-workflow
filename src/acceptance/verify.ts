import {readFile} from 'node:fs/promises';
import {join} from 'node:path';
import {checkManifest,sha256} from './archive';
export type VerificationResult={pass:boolean;failures:string[]};
const json=async(dir:string,path:string)=>JSON.parse(await readFile(join(dir,path),'utf8'));
function must(condition:unknown,reason:string):asserts condition{if(!condition)throw Error(reason);}
function decode(payload:any):any{must(typeof payload?.data==='string','missing_json_payload');return JSON.parse(Buffer.from(payload.data,'base64').toString('utf8'));}
export async function verifyCapture(dir:string):Promise<VerificationResult>{
 try{
  await checkManifest(dir);
  const [report,wrapper,before,after,replay]=await Promise.all(['report.json','wrapper.json','snapshots/before.json','snapshots/after.json','replay.json'].map(p=>json(dir,p)));
  const fixtureBytes=await readFile('fixtures/acceptance.json'),fixture=JSON.parse(fixtureBytes.toString());
  must(report.version===1&&/^[a-f0-9]{40}$/.test(report.source)&&/^[A-Za-z0-9_-]{1,48}$/.test(report.captureId),'invalid_capture_identity');
  must(report.fixtureHash===sha256(fixtureBytes),'fixture_identity_mismatch');
  must(report.sourceBundleHash===sha256(await readFile(join(dir,'source.bundle'))),'source_bundle_mismatch');
  must(report.image?.revision===report.source&&/^sha256:[a-f0-9]{64}$/.test(report.image.id),'image_source_mismatch');
  const runtime=report.runtime;
  must(runtime?.tools?.node==='v24.22.2'&&runtime.tools.sdk==='1.25.0'&&JSON.stringify(runtime.worker)===JSON.stringify(runtime.tools),'worker_toolchain_mismatch');
  must(runtime.tools.workflowHash===sha256(await readFile(join(dir,'runtime-workflow.js')))&&runtime.tools.lockHash===sha256(await readFile(join(dir,'runtime-lock.json'))),'runtime_bytes_mismatch');
  must(runtime.postgresVersionNum===170009&&runtime.temporalImage==='temporalio/temporal:1.9.1@sha256:150d6208d7b24371e4080f49780e6061611f6279cd6908236e9a34ae5746c1b5','service_version_mismatch');
  must(wrapper.source===report.source&&wrapper.captureId===report.captureId,'wrapper_identity_mismatch');
  must(wrapper.cleanup===true&&wrapper.withinDeadline===true&&wrapper.error===null&&Number.isFinite(wrapper.durationMs)&&wrapper.durationMs>0&&wrapper.durationMs<=300000,'cleanup_or_deadline_failed');
  must(report.cleanup?.servicesStopped===true&&Array.isArray(report.errors)&&report.errors.length===0,'runtime_cleanup_or_errors');
  must(report.cases.length===11&&fixture.cases.length===11&&new Set(report.cases.map((c:any)=>c.id)).size===11,'case_count_mismatch');
  const beforeBytes=await readFile(join(dir,'snapshots/before.json')),afterBytes=await readFile(join(dir,'snapshots/after.json'));
  must(report.sqlBeforeHash===sha256(beforeBytes)&&report.sqlAfterHash===sha256(afterBytes)&&report.sqlBeforeHash===report.sqlAfterHash,'replay_changed_business_state');
  must(before.reservations.length===11&&after.reservations.length===11&&after.effects.length===7&&after.outcomes.length===8,'business_row_counts');
  must(after.effects.reduce((sum:number,e:any)=>sum+Number(e.amount_cents),0)===7000,'business_amount_total');
  for(const expected of fixture.cases){
   const c=report.cases.find((v:any)=>v.id===expected.id),key=`refund/${report.captureId}/${expected.returnId}`,workflowId=`p28/${report.captureId}/${expected.returnId}`;
   must(c?.status==='pass'&&c.workflowId===workflowId&&typeof c.runId==='string'&&c.runId.length>0,'case_identity_or_status:'+expected.id);
   must(c.result?.outcome===expected.outcome&&c.result.reservation===expected.reservation,'business_outcome:'+expected.id);
   const input={captureId:report.captureId,returnId:expected.returnId,currency:'AUD',amountCents:1000};
   const hash=sha256(JSON.stringify(input)),request={...input,refundKey:key,inputHash:hash};
   must(JSON.stringify(c.result.request)===JSON.stringify(request),'result_input_binding:'+expected.id);
   const rows=after.reservations.filter((r:any)=>r.refund_key===key);
   must(rows.length===1&&rows[0].state===expected.reservation&&rows[0].input_hash===hash&&rows[0].capture_id===report.captureId&&rows[0].return_id===expected.returnId&&rows[0].currency==='AUD'&&Number(rows[0].amount_cents)===1000,'reservation_binding:'+expected.id);
   const effects=after.effects.filter((r:any)=>r.refund_key===key),outcomes=after.outcomes.filter((r:any)=>r.refund_key===key);
   must(effects.length===(expected.effect?1:0)&&effects.every((r:any)=>r.currency==='AUD'&&Number(r.amount_cents)===1000&&r.capture_id===report.captureId),'effect_binding:'+expected.id);
   must(outcomes.length===(expected.receiver?1:0),'receiver_count:'+expected.id);
   if(expected.receiver)must(outcomes[0].status===expected.receiver&&outcomes[0].input_hash===hash&&Number(outcomes[0].amount_cents)===1000&&outcomes[0].currency==='AUD'&&outcomes[0].capture_id===report.captureId,'receipt_binding:'+expected.id);
   if(expected.reservation==='consumed')must(rows[0].receipt_id===outcomes[0].receipt_id&&c.result.receiver?.receiptId===outcomes[0].receipt_id,'consumption_receipt:'+expected.id);
   if(['A4','A5','A11'].includes(expected.id))must(c.result.cancellationRequested===true,'cancellation_missing:'+expected.id);
   if(expected.id==='A2')must(c.durationMs>=10000,'expiry_not_actual_time');
   if(expected.id==='A3')must(c.result.decision?.decisionId==='approve'&&c.result.ignoredDecisions>=3,'decision_policy_not_observed');
   if(expected.id==='A9')must(c.result.receiver===null,'uncertainty_hidden');
   const dispatch=after.activities.filter((a:any)=>a.refund_key===key&&a.activity==='dispatchPayment');
   const posts=after.wires.filter((a:any)=>a.refund_key===key&&a.method==='POST');
   must(dispatch.length===(expected.receiver?1:0)&&posts.length===(expected.receiver?1:0)&&dispatch.every((a:any)=>a.attempt===1),'duplicate_dispatch:'+expected.id);
   const lookup=after.activities.filter((a:any)=>a.refund_key===key&&a.activity==='lookupReceipt');
   if(expected.id==='A9')must(lookup.length===3&&lookup.every((a:any,i:number)=>a.attempt===i+1),'lookup_retry_limit');
   if(expected.id==='A6')must(after.activities.filter((a:any)=>a.refund_key===key&&a.activity==='reserveRefund').length===3,'reservation_retry_missing');
   const file=await json(dir,'histories/'+expected.id+'.json');
   must(file.workflowId===c.workflowId&&file.runId===c.runId&&Array.isArray(file.history?.events)&&file.history.events.length>=2,'history_identity:'+expected.id);
   const events=file.history.events;must(events.every((e:any,i:number)=>String(e.eventId)===String(i+1)),'incomplete_history:'+expected.id);
   const start=events[0].workflowExecutionStartedEventAttributes,last=events.at(-1).workflowExecutionCompletedEventAttributes;
   must(start?.originalExecutionRunId===c.runId&&start.workflowType?.name==='returnsWorkflow'&&start.taskQueue?.name==='p28-'+report.captureId,'history_start_binding:'+expected.id);
   must(JSON.stringify(decode(start.input?.payloads?.[0]))===JSON.stringify(request),'history_input:'+expected.id);
   must(JSON.stringify(decode(last?.result?.payloads?.[0]))===JSON.stringify(c.result),'history_result:'+expected.id);
   if(expected.id==='A10')must(events.some((e:any)=>e.activityTaskTimedOutEventAttributes),'kill_without_activity_timeout');
  }
  for(const kind of ['original','compatible'])must(Array.isArray(replay[kind])&&replay[kind].length===11&&new Set(replay[kind].map((r:any)=>r.id)).size===11&&replay[kind].every((r:any)=>r.pass===true&&fixture.cases.some((c:any)=>c.id===r.id)),'replay_failed:'+kind);
  must(replay.incompatible?.expectedFailure===true&&replay.incompatible.errorType==='DeterminismViolationError','negative_replay_not_nondeterminism');
  for(const kind of ['original','compatible','incompatible'])must(replay.bundleHashes?.[kind]===sha256(await readFile(join(dir,'bundles/'+kind+'.js'))),'replay_bundle_mismatch:'+kind);
  must(report.workflowBundleHash===replay.bundleHashes.original,'original_bundle_mismatch');
  const k=report.kill;must(JSON.stringify(k)===JSON.stringify(await json(dir,'kill.json')),'kill_proof_mismatch');
  must(k?.exitCode===137&&k.oomKilled===false&&k.beforeCompletion===true&&k.elapsedMs>=0&&k.elapsedMs<1000&&k.oldPid!==k.newPid&&k.oldStartedAt!==k.newStartedAt&&k.temporalIdBefore===k.temporalIdAfter,'worker_kill_boundary');
  return {pass:true,failures:[]};
 }catch(e){return {pass:false,failures:[(e as Error).message]};}
}
if(require.main===module){const dir=process.argv[process.argv.indexOf('--capture')+1];verifyCapture(dir).then(result=>{console.log(JSON.stringify(result));process.exitCode=result.pass?0:1;});}
