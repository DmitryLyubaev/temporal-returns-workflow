import {Client,Connection} from '@temporalio/client';
import {Pool} from 'pg';
import {parseArgs} from 'node:util';
import {mkdir,writeFile} from 'node:fs/promises';
import {resolve,dirname,relative,isAbsolute} from 'node:path';
import {makeRequest,parseReturn,parseDecision,PermanentError} from './contracts';
import {seed} from './db/reservations';
import {openPool} from './db/pool';
import {inspectReturn} from './client';
export type CliDependencies={client:Client;pool:Pool;write(value:unknown):void};
export async function runCli(argv:string[],deps:CliDependencies):Promise<number>{
 try{
  const {values:v,positionals}=parseArgs({args:argv,allowPositionals:true,options:{capture:{type:'string'},return:{type:'string'},amount:{type:'string'},'workflow-id':{type:'string'},'decision-id':{type:'string'},choice:{type:'string'},reviewer:{type:'string'},output:{type:'string'}}});
  const command=positionals[0];if(positionals.length!==1)throw new PermanentError('invalid_command');
  if(command==='start'){
   if(v['workflow-id'])throw new PermanentError('workflow_id_override_forbidden');
   const amount=v.amount??'1000';if(!/^[1-9][0-9]*$/.test(amount))throw new PermanentError('invalid_amount');
   const r=makeRequest(parseReturn({captureId:v.capture,returnId:v.return,currency:'AUD',amountCents:Number(amount)}));
   await seed(deps.pool,r);
   const h=await deps.client.workflow.start('returnsWorkflow',{workflowId:`p28/${r.captureId}/${r.returnId}`,taskQueue:process.env.TASK_QUEUE??'p28-dev',args:[r],workflowIdReusePolicy:'REJECT_DUPLICATE'});
   deps.write({workflowId:h.workflowId,runId:h.firstExecutionRunId,status:'started'});return 0;
  }
  const id=v['workflow-id'];if(!id)throw new PermanentError('workflow_id_required');
  if(command==='inspect'){deps.write(await inspectReturn(deps.client,id));return 0;}
  const h=deps.client.workflow.getHandle(id);
  if(command==='decide'||command==='cancel'){
   if((await h.describe()).status.name!=='RUNNING'){deps.write({status:'closed',accepted:false});return 1;}
   if(command==='decide')await h.signal('reviewDecision',parseDecision({decisionId:v['decision-id'],returnId:v.return,reviewerId:v.reviewer,choice:v.choice}));
   else await h.cancel();
   deps.write({status:'submitted',accepted:null,workflowId:id});return 0;
  }
  if(command==='history'){
   if(!v.output)throw new PermanentError('output_required');
   const destination=resolve(v.output),root=resolve('.local'),rel=relative(root,destination);
   if(!rel||rel.startsWith('..')||isAbsolute(rel))throw new PermanentError('output_outside_evidence');
   const description=await h.describe(),history=await h.fetchHistory();
   await mkdir(dirname(destination),{recursive:true});await writeFile(destination,JSON.stringify({workflowId:id,runId:description.runId,history}),{flag:'wx'});
   deps.write({status:'exported',workflowId:id,runId:description.runId});return 0;
  }
  throw new PermanentError('invalid_command');
 }catch(e){deps.write({error:e instanceof PermanentError?e.code:(e as Error).name==='WorkflowExecutionAlreadyStartedError'?'workflow_already_exists':'cli_failed',accepted:false});return 1;}
}
async function main(){
 if(process.argv.length===2||process.argv.includes('--help')){console.log('Commands: start, decide, cancel, inspect, history. See README for local fixture arguments.');return;}
 const connection=await Connection.connect({address:process.env.TEMPORAL_ADDRESS??'temporal:7233'}),pool=openPool();
 try{process.exitCode=await runCli(process.argv.slice(2),{client:new Client({connection,namespace:'p28'}),pool,write:v=>console.log(JSON.stringify(v))});}
 finally{await pool.end();await connection.close();}
}
if(require.main===module)main().catch(()=>{console.error('cli_connection_failed');process.exitCode=1;});
