import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,writeFile,mkdir,readdir,rm} from 'node:fs/promises';
import {join,relative} from 'node:path';
import {tmpdir} from 'node:os';
import {createHash} from 'node:crypto';
import {verifyCapture} from '../src/acceptance/verify';
import {archiveCapture} from '../src/acceptance/archive';
import {shouldStartCase} from '../src/acceptance/control';
const sha=(v:string|Buffer)=>createHash('sha256').update(v).digest('hex');
async function put(dir:string,path:string,value:any){const p=join(dir,path);await mkdir(join(p,'..'),{recursive:true});await writeFile(p,JSON.stringify(value));}
async function get(dir:string,path:string){return JSON.parse(await readFile(join(dir,path),'utf8'));}
async function seal(dir:string){
 const files:any[]=[];
 async function visit(folder:string){for(const entry of await readdir(folder,{withFileTypes:true})){const full=join(folder,entry.name);if(entry.isDirectory())await visit(full);else if(entry.name!=='manifest.json'){const bytes=await readFile(full);files.push({path:relative(dir,full).replaceAll('\\','/'),size:bytes.length,sha256:sha(bytes)});}}}
 await visit(dir);files.sort((a,b)=>a.path.localeCompare(b.path));await put(dir,'manifest.json',{version:1,files});
}
// Entirely generated software fixtures, not captured workflows or measured outcomes.
async function packet(){
 const dir=await mkdtemp(join(tmpdir(),'p28-verifier-')),capture='softwareFixture',source='1'.repeat(40),bundle='software bundle '+source;
 const expected=[['refunded','consumed','committed',true],['expired','open',null,false],['refunded','consumed','committed',true],['cancelled','released',null,false],['cancelled','released',null,false],['refunded','consumed','committed',true],['failed_compensated','released','rejected',false],['refunded','consumed','committed',true],['uncertain','held','committed',true],['refunded','consumed','committed',true],['refunded','consumed','committed',true]];
 const snapshot:any={reservations:[],outcomes:[],effects:[],activities:[],wires:[]},cases:any[]=[];
 for(let i=0;i<11;i++){
  const id='A'+(i+1),returnId='R'+String(i+1).padStart(2,'0'),key=`refund/${capture}/${returnId}`;
  const input={captureId:capture,returnId,currency:'AUD',amountCents:1000},inputHash=sha(JSON.stringify(input));
  const request={...input,refundKey:key,inputHash},row={refund_key:key,input_hash:inputHash,capture_id:capture,return_id:returnId,currency:'AUD',amount_cents:'1000'};
  const [outcome,state,receiver,effect]=expected[i];
  snapshot.reservations.push({...row,state,receipt_id:state==='consumed'?'receipt-'+id:null});
  if(receiver)snapshot.outcomes.push({...row,status:receiver,receipt_id:'receipt-'+id});
  if(effect)snapshot.effects.push({refund_key:key,capture_id:capture,amount_cents:'1000',currency:'AUD'});
  const payment=['A1','A3','A6','A7','A8','A9','A10','A11'].includes(id);
  if(payment){snapshot.activities.push({refund_key:key,activity:'dispatchPayment',attempt:1});snapshot.wires.push({refund_key:key,method:'POST'});}
  if(id==='A6')for(let n=1;n<=3;n++)snapshot.activities.push({refund_key:key,activity:'reserveRefund',attempt:n});
  for(let n=0;n<(id==='A9'?3:['A8','A10'].includes(id)?1:0);n++){snapshot.activities.push({refund_key:key,activity:'lookupReceipt',attempt:n+1});snapshot.wires.push({refund_key:key,method:'GET'});}
  const result={outcome,request,reservation:state,receiver:receiver&&id!=='A9'?{refundKey:key,inputHash,status:receiver,receiptId:'receipt-'+id}:null,cancellationRequested:['A4','A5','A11'].includes(id),decision:id==='A2'||id==='A4'?null:{decisionId:'approve',returnId,reviewerId:'reviewer-demo',choice:'approve'},ignoredDecisions:id==='A3'?3:0};
  const workflowId=`p28/${capture}/${returnId}`,runId='run-'+id;
  cases.push({id,status:'pass',workflowId,runId,result,durationMs:id==='A2'?10000:100});
  const payload=(v:any)=>({metadata:{encoding:'anNvbi9wbGFpbg=='},data:Buffer.from(JSON.stringify(v)).toString('base64')});
  const events:any[]=[{eventId:'1',workflowExecutionStartedEventAttributes:{originalExecutionRunId:runId,workflowType:{name:'returnsWorkflow'},taskQueue:{name:'p28-'+capture},input:{payloads:[payload(request)]}}}];
  if(id==='A10')events.push({eventId:'2',activityTaskTimedOutEventAttributes:{scheduledEventId:'1'}});
  events.push({eventId:String(events.length+1),workflowExecutionCompletedEventAttributes:{result:{payloads:[payload(result)]}}});
  await put(dir,'histories/'+id+'.json',{workflowId,runId,history:{events}});
 }
 await writeFile(join(dir,'source.bundle'),bundle);
 await put(dir,'snapshots/before.json',snapshot);await put(dir,'snapshots/after.json',snapshot);
 const hashes:any={};
 for(const kind of ['original','compatible','incompatible']){await put(dir,'bundles/'+kind+'.js',{softwareFixture:kind});hashes[kind]=sha(await readFile(join(dir,'bundles/'+kind+'.js')));}
 const replay={original:cases.map(c=>({id:c.id,pass:true})),compatible:cases.map(c=>({id:c.id,pass:true})),incompatible:{id:'A1',expectedFailure:true,errorType:'DeterminismViolationError'},bundleHashes:hashes};
 await put(dir,'replay.json',replay);
 await writeFile(join(dir,'runtime-workflow.js'),'generated software compiled fixture');await put(dir,'runtime-lock.json',{softwareFixture:true});
 const runtime={node:'v24.22.2',sdk:'1.25.0',workflowHash:sha(await readFile(join(dir,'runtime-workflow.js'))),lockHash:sha(await readFile(join(dir,'runtime-lock.json')))};
 await put(dir,'report.json',{version:1,captureId:capture,source,image:{revision:source,id:'sha256:'+'5'.repeat(64)},runtime:{worker:runtime,tools:runtime,postgresVersionNum:170009,temporalImage:'temporalio/temporal:1.9.1@sha256:150d6208d7b24371e4080f49780e6061611f6279cd6908236e9a34ae5746c1b5'},workflowBundleHash:hashes.original,fixtureHash:sha(await readFile('fixtures/acceptance.json')),sourceBundleHash:sha(bundle),cases,sqlBeforeHash:sha(await readFile(join(dir,'snapshots/before.json'))),sqlAfterHash:sha(await readFile(join(dir,'snapshots/after.json'))),kill:{containerId:'worker',exitCode:137,oomKilled:false,elapsedMs:100,oldPid:1,newPid:2,oldStartedAt:'old',newStartedAt:'new',temporalIdBefore:'server',temporalIdAfter:'server',beforeCompletion:true},cleanup:{servicesStopped:true},errors:[]});
 await put(dir,'kill.json',(await get(dir,'report.json')).kill);
 await put(dir,'wrapper.json',{captureId:capture,source,durationMs:20000,withinDeadline:true,cleanup:true,error:null});await seal(dir);return dir;
}
test('valid generated software packet passes structural verifier only',async()=>{assert.equal((await verifyCapture(await packet())).pass,true);});
test('missing_history_fails',async()=>{const d=await packet();await rm(join(d,'histories/A1.json'));await seal(d);assert.equal((await verifyCapture(d)).pass,false);});
test('wrong_run_id_fails',async()=>{const d=await packet(),r=await get(d,'report.json');r.cases[0].runId='wrong';await put(d,'report.json',r);await seal(d);assert.equal((await verifyCapture(d)).pass,false);});
test('extra_effect_fails',async()=>{const d=await packet(),s=await get(d,'snapshots/after.json');s.effects.push({...s.effects[0],refund_key:'extra'});await put(d,'snapshots/after.json',s);await seal(d);assert.equal((await verifyCapture(d)).pass,false);});
test('wrong_kill_boundary_fails',async()=>{const d=await packet(),r=await get(d,'report.json');r.kill.beforeCompletion=false;await put(d,'report.json',r);await seal(d);assert.equal((await verifyCapture(d)).pass,false);});
test('deadline_marks_unrun',async()=>{assert.equal(shouldStartCase(0,210000,300000),false);const d=await packet(),r=await get(d,'report.json');r.cases[10].status='unrun';await put(d,'report.json',r);await seal(d);assert.equal((await verifyCapture(d)).pass,false);});
test('cleanup_failure_is_retained',async()=>{const d=await packet(),r=await get(d,'wrapper.json');r.cleanup=false;await put(d,'wrapper.json',r);await seal(d);assert.equal((await verifyCapture(d)).pass,false);});
test('archive_hash_mismatch_fails',async()=>{const d=await packet();await writeFile(join(d,'source.bundle'),'corrupt');await assert.rejects(()=>archiveCapture(d,d+'-archive'));});
test('wrong image revision fails despite resealed evidence',async()=>{const d=await packet(),r=await get(d,'report.json');r.image.revision='0'.repeat(40);await put(d,'report.json',r);await seal(d);assert.equal((await verifyCapture(d)).pass,false);});
test('worker compiled bytes must match replay tooling',async()=>{const d=await packet(),r=await get(d,'report.json');r.runtime.worker.workflowHash='0'.repeat(64);await put(d,'report.json',r);await seal(d);assert.equal((await verifyCapture(d)).pass,false);});
test('bundle identity must match retained code',async()=>{const d=await packet(),r=await get(d,'replay.json');r.bundleHashes.compatible='0'.repeat(64);await put(d,'replay.json',r);await seal(d);assert.equal((await verifyCapture(d)).pass,false);});
test('missing persisted kill proof cannot pass',async()=>{const d=await packet();await rm(join(d,'kill.json'));await seal(d);assert.equal((await verifyCapture(d)).pass,false);});
test('archive destination cannot be a child whose name begins with dots',async()=>{const d=await packet();await assert.rejects(()=>archiveCapture(d,join(d,'..nested')));});
