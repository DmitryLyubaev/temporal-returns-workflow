import {Client,Connection} from '@temporalio/client';
import {Runtime,DefaultLogger} from '@temporalio/worker';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import assert from 'node:assert/strict';
import {RefundRequest,ReturnResult,makeRequest} from '../contracts';
import {openPool} from '../db/pool';
import {seed} from '../db/reservations';
import {sha256} from './archive';
import {DockerControl,dockerText,shouldStartCase} from './control';
import {copyReplayBundles,replayCapture} from './replay';
import {encodeHistory} from './history';
import {finishResources} from './lifecycle';
export type CaptureConfig={captureId:string;source:string;deadline:number;project:string;smoke:boolean};
type CaseEvidence={id:string;status:'pass'|'error'|'unrun';workflowId:string;runId:string;result?:ReturnResult;durationMs:number;error?:string};
export type CaptureReport={version:number;captureId:string;source:string;smoke:boolean;cases:CaseEvidence[];errors:string[];[key:string]:any};
const sleep=(ms:number)=>new Promise(resolve=>setTimeout(resolve,ms));
async function waitFor<T>(fn:()=>Promise<T|false|undefined>,ms=2500):Promise<T>{
 const end=Date.now()+ms;while(Date.now()<end){const v=await fn();if(v)return v as T;await sleep(25);}throw Error('bounded_barrier_not_reached');
}
const writeJson=(dir:string,name:string,value:unknown)=>writeFile(join(dir,name),JSON.stringify(value,null,2),{flag:'wx'});
async function runtimeFacts():Promise<{node:string;sdk:string;workflowHash:string;lockHash:string}>{return {node:process.version,sdk:JSON.parse(await readFile('node_modules/@temporalio/worker/package.json','utf8')).version,workflowHash:sha256(await readFile('build/src/workflows/returns.js')),lockHash:sha256(await readFile('package-lock.json'))};}
export async function runAcceptance(config:CaptureConfig):Promise<CaptureReport>{
 assert.match(config.captureId,/^[a-z0-9_-]{1,48}$/);assert.match(config.source,/^[a-f0-9]{40}$/);assert.equal(config.project,'p28-'+config.captureId);
 const dir=resolve('.local/captures',config.captureId),startedAt=config.deadline-300000;
 const fixtureBytes=await readFile('fixtures/acceptance.json'),fixture=JSON.parse(fixtureBytes.toString());
 const report:CaptureReport={version:1,captureId:config.captureId,source:config.source,smoke:config.smoke,fixtureHash:sha256(fixtureBytes),sourceBundleHash:sha256(await readFile(join(dir,'source.bundle'))),cases:fixture.cases.map((c:any)=>({id:c.id,status:'unrun',workflowId:`p28/${config.captureId}/${c.returnId}`,runId:'',durationMs:0})),errors:[],cleanup:{servicesStopped:false}};
 const admin=openPool(),reader=openPool('p28_reader'),docker=new DockerControl(config.project);
 admin.on('error',e=>report.errors.push('admin_idle_connection:'+e.message));reader.on('error',e=>report.errors.push('reader_idle_connection:'+e.message));
 let connection:Connection|undefined,services:Record<string,string>|undefined;
 async function snapshot(){
  const c=await reader.connect();try{
   await c.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
   const reservations=(await c.query('SELECT * FROM reservations WHERE capture_id=$1 ORDER BY refund_key',[config.captureId])).rows;
   const outcomes=(await c.query('SELECT * FROM receiver_outcomes WHERE capture_id=$1 ORDER BY refund_key',[config.captureId])).rows;
   const effects=(await c.query('SELECT * FROM receiver_effects WHERE capture_id=$1 ORDER BY refund_key',[config.captureId])).rows;
   const activities=(await c.query("SELECT * FROM activity_attempts WHERE split_part(refund_key,'/',2)=$1 ORDER BY at,id",[config.captureId])).rows;
   const wires=(await c.query("SELECT * FROM wire_attempts WHERE split_part(refund_key,'/',2)=$1 ORDER BY at,id",[config.captureId])).rows;
   await c.query('COMMIT');return {reservations,outcomes,effects,activities,wires};
  }catch(e){await c.query('ROLLBACK');throw e;}finally{c.release();}
 }
 async function stopService(name:string){if(!services)return;const info=await docker.inspect(services[name]);if(info.State.Running)await docker.mutate(services[name],'stop');}
 try{
  await mkdir(join(dir,'histories'),{recursive:true});await mkdir(join(dir,'snapshots'),{recursive:true});await mkdir(join(dir,'logs'),{recursive:true});
  await copyReplayBundles(dir);report.workflowBundleHash=sha256(await readFile(join(dir,'bundles/original.js')));
  await writeFile(join(dir,'runtime-workflow.js'),await readFile('build/src/workflows/returns.js'),{flag:'wx'});await writeFile(join(dir,'runtime-lock.json'),await readFile('package-lock.json'),{flag:'wx'});
  services=await docker.services();
  await waitFor(async()=>dockerText(await docker.logs(services!.worker)).includes('worker_ready')||false,20000);
  const worker=await docker.inspect(services.worker),receiver=await docker.inspect(services.receiver),temporal=await docker.inspect(services.temporal);
  assert.equal(worker.Image,receiver.Image);
  const image=JSON.parse((await docker.request('/images/'+worker.Image+'/json')).toString());report.image={id:worker.Image,revision:image.Config.Labels['org.opencontainers.image.revision']};assert.equal(report.image.revision,config.source);
  const metadataCode="const f=require('fs'),c=require('crypto'),h=p=>c.createHash('sha256').update(f.readFileSync(p)).digest('hex');console.log(JSON.stringify({node:process.version,sdk:JSON.parse(f.readFileSync('/app/node_modules/@temporalio/worker/package.json')).version,workflowHash:h('/app/build/src/workflows/returns.js'),lockHash:h('/app/package-lock.json')}));";
  const workerFacts=JSON.parse((await docker.exec(services.worker,['node','-e',metadataCode])).trim()),toolsFacts=await runtimeFacts();assert.deepEqual(workerFacts,toolsFacts);
  report.runtime={worker:workerFacts,tools:toolsFacts,postgresVersionNum:Number((await admin.query('SHOW server_version_num')).rows[0].server_version_num),temporalImage:temporal.Config.Image};
  connection=await Connection.connect({address:process.env.TEMPORAL_ADDRESS??'temporal:7233',connectTimeout:10000});
  report.runtime.serverVersion=(await connection.workflowService.getSystemInfo({})).serverVersion;
  const client=new Client({connection,namespace:'p28'});
  for(const item of fixture.cases){
   const request=makeRequest({captureId:config.captureId,returnId:item.returnId,currency:'AUD',amountCents:1000});await seed(admin,request);
   await admin.query('INSERT INTO fixture_control(refund_key,reserve_failures,hold_reservation,reject_payment,drop_response,deny_lookup,hold_payment) VALUES($1,$2,$3,$4,$5,$6,$7)',[request.refundKey,item.id==='A6'?2:0,['A3','A5'].includes(item.id),item.id==='A7',['A8','A9'].includes(item.id),item.id==='A9',['A10','A11'].includes(item.id)]);
  }
  for(const item of fixture.cases){
   if(config.smoke&&!['A1','A10','A11'].includes(item.id))continue;
   if(!shouldStartCase(startedAt,Date.now(),config.deadline)){report.errors.push('deadline_stopped_new_cases');break;}
   const evidence=report.cases.find(c=>c.id===item.id)!,caseStarted=Date.now();
   const request=makeRequest({captureId:config.captureId,returnId:item.returnId,currency:'AUD',amountCents:1000});
   const runCase=async()=>{
    const h=await client.workflow.start('returnsWorkflow',{workflowId:evidence.workflowId,taskQueue:config.project,args:[request],workflowIdReusePolicy:'REJECT_DUPLICATE'});
    evidence.runId=h.firstExecutionRunId;await h.query('returnState');
    const decision=(decisionId='approve',reviewerId='reviewer-demo',choice='approve')=>h.signal('reviewDecision',{decisionId,returnId:item.returnId,reviewerId,choice});
    const reached=(column:'reservation_reached'|'payment_reached')=>waitFor(async()=>((await admin.query(`SELECT ${column} AS reached FROM fixture_control WHERE refund_key=$1`,[request.refundKey])).rows[0]?.reached)||false);
    if(item.id==='A2'){
     evidence.result=await h.result() as ReturnResult;
     try{await decision('late');}catch{/* rejection is an allowed late-signal disposition */}
     assert.equal((await h.describe()).status.name,'COMPLETED');
    }else if(item.id==='A4'){await h.cancel();}
    else{
     if(item.id==='A3')await decision('intruder','intruder','reject');
     await decision();
     if(item.id==='A3'){
      await decision();await decision('conflicting','reviewer-demo','reject');await reached('reservation_reached');
      await waitFor(async()=>((await h.query('returnState') as any).ignoredDecisions>=3)||false);
      await admin.query('UPDATE fixture_control SET hold_reservation=false WHERE refund_key=$1',[request.refundKey]);
     }
     if(item.id==='A5'){await reached('reservation_reached');await h.cancel();}
     if(item.id==='A10'){
      await reached('payment_reached');const killStarted=Date.now(),old=await docker.inspect(services!.worker),serverBefore=await docker.inspect(services!.temporal);
      const history=await h.fetchHistory();
      const scheduled=history.events?.find(e=>e.activityTaskScheduledEventAttributes?.activityType?.name==='dispatchPayment');assert.ok(scheduled);
      assert.equal(history.events?.some(e=>{
       const terminal=e.activityTaskCompletedEventAttributes??e.activityTaskFailedEventAttributes??e.activityTaskTimedOutEventAttributes??e.activityTaskCanceledEventAttributes;
       return terminal?.scheduledEventId?.toString()===scheduled.eventId?.toString();
      }),false);
      // The held receiver has not returned; require the workflow still waiting on payment.
      assert.equal((await h.query('returnState') as any).stage,'payment_started');
      await docker.mutate(services!.worker,'kill');
      const dead=await waitFor(async()=>{const state=await docker.inspect(services!.worker);return !state.State.Running?state:false;},1000);
      const elapsedMs=Date.now()-killStarted;assert.ok(elapsedMs<1000);assert.equal(dead.State.ExitCode,137);assert.equal(dead.State.OOMKilled,false);
      await writeFile(join(dir,'logs/worker-before-restart.log'),dockerText(await docker.logs(services!.worker)),{flag:'wx'});
      await docker.mutate(services!.worker,'start');const fresh=await docker.inspect(services!.worker);
      const serverAfter=await docker.inspect(services!.temporal);assert.equal(serverBefore.State.StartedAt,serverAfter.State.StartedAt);assert.equal(serverBefore.State.Pid,serverAfter.State.Pid);
      report.kill={containerId:services!.worker,exitCode:dead.State.ExitCode,oomKilled:dead.State.OOMKilled,elapsedMs,oldPid:old.State.Pid,newPid:fresh.State.Pid,oldStartedAt:old.State.StartedAt,newStartedAt:fresh.State.StartedAt,temporalIdBefore:serverBefore.Id,temporalIdAfter:serverAfter.Id,temporalStartedBefore:serverBefore.State.StartedAt,temporalStartedAfter:serverAfter.State.StartedAt,temporalPidBefore:serverBefore.State.Pid,temporalPidAfter:serverAfter.State.Pid,beforeCompletion:true};
      await writeJson(dir,'kill.json',report.kill);
     }
     if(item.id==='A11'){await reached('payment_reached');await h.cancel();await admin.query('UPDATE fixture_control SET release_payment=true WHERE refund_key=$1',[request.refundKey]);}
    }
    evidence.result??=await h.result() as ReturnResult;
    const history=await h.fetchHistory();await writeJson(dir,'histories/'+item.id+'.json',{workflowId:evidence.workflowId,runId:evidence.runId,history:encodeHistory(history)});
    assert.equal(evidence.result.outcome,item.outcome);assert.equal(evidence.result.reservation,item.reservation);evidence.status='pass';
   };
   let timer:NodeJS.Timeout|undefined;
   try{await Promise.race([runCase(),new Promise<never>((_,reject)=>{timer=setTimeout(()=>reject(Error('case_deadline')),Math.min(30000,config.deadline-Date.now()-30000));})]);}
   catch(e){evidence.status='error';evidence.error=(e as Error).message;report.errors.push(item.id+':'+evidence.error);break;}
   finally{if(timer)clearTimeout(timer);evidence.durationMs=Date.now()-caseStarted;}
   console.log(JSON.stringify({event:'case_finished',id:item.id,status:evidence.status,durationMs:evidence.durationMs}));
  }
  await stopService('worker');await stopService('receiver');
  const before=await snapshot();await writeJson(dir,'snapshots/before.json',before);report.sqlBeforeHash=sha256(await readFile(join(dir,'snapshots/before.json')));
  if(report.cases.find(c=>c.id==='A1')?.status==='pass'){
   const replay=await replayCapture(dir);if(!replay.original.every(r=>r.pass)||!replay.compatible.every(r=>r.pass)||!replay.incompatible.expectedFailure)report.errors.push('history_replay_failed');
  }
  const after=await snapshot();await writeJson(dir,'snapshots/after.json',after);report.sqlAfterHash=sha256(await readFile(join(dir,'snapshots/after.json')));assert.equal(report.sqlBeforeHash,report.sqlAfterHash);
 }catch(e){report.errors.push((e as Error).message);}
 finally{
  await finishResources(async()=>{
   const closed=await Promise.allSettled([connection?.close(),admin.end(),reader.end()]);
   if(closed.some(r=>r.status==='rejected'))throw Error('capture_connection_close_failed');
  },async()=>{if(services){
   for(const name of ['worker','receiver','temporal','postgres']){
    try{await writeFile(join(dir,'logs',name+'.log'),dockerText(await docker.logs(services[name])),{flag:'wx'});}catch(e){report.errors.push('log:'+name+':'+(e as Error).message);}
    try{await stopService(name);}catch(e){report.errors.push('cleanup:'+name+':'+(e as Error).message);}
   }
   report.cleanup.servicesStopped=(await Promise.all(Object.values(services).map(id=>docker.inspect(id)))).every(v=>!v.State.Running);
  }},async()=>{report.durationMs=Date.now()-startedAt;await writeJson(dir,'report.json',report);},e=>report.errors.push('finalize:'+(e as Error).message));
 }
 return report;
}
if(require.main===module){Runtime.install({logger:new DefaultLogger('WARN')});runAcceptance({captureId:process.env.P28_CAPTURE_ID!,source:process.env.P28_SOURCE_SHA!,deadline:Number(process.env.P28_DEADLINE),project:process.env.P28_PROJECT!,smoke:process.argv.includes('--smoke')}).then(report=>{console.log(JSON.stringify({captureId:report.captureId,smoke:report.smoke,passed:report.cases.filter(c=>c.status==='pass').length,unrun:report.cases.filter(c=>c.status==='unrun').length,errors:report.errors}));if(report.errors.length)process.exitCode=1;}).catch(e=>{console.error(e.message);process.exitCode=1;});}
