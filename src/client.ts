import {Client} from '@temporalio/client';
import type {ReturnResult} from './contracts';
export type Inspection={workflowId:string;runId:string;status:string;result?:ReturnResult;snapshot?:unknown};
export async function inspectReturn(client:Client,workflowId:string):Promise<Inspection>{
 const handle=client.workflow.getHandle(workflowId),description=await handle.describe();
 const info:Inspection={workflowId,runId:description.runId,status:description.status.name};
 if(info.status==='COMPLETED')info.result=await handle.result() as ReturnResult;
 else if(info.status==='RUNNING'){
  try{info.snapshot=await handle.query('returnState');}
  catch(queryError){
   return client.connection.withDeadline(Date.now()+2000,async()=>{
    const latest=await handle.describe();
    if(latest.status.name==='RUNNING')throw queryError;
    const closed:Inspection={workflowId,runId:latest.runId,status:latest.status.name};
    if(closed.status==='COMPLETED')closed.result=await handle.result() as ReturnResult;
    return closed;
   });
  }
 }
 return info;
}
