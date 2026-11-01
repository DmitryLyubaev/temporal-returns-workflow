import {defineSignal,defineQuery,setHandler,condition,proxyActivities,CancellationScope,CancelledFailure,workflowInfo,isCancellation} from '@temporalio/workflow';
import type {RefundRequest,Decision,ReturnResult} from '../contracts';
import type {createActivities} from '../activities';
export const reviewDecision=defineSignal<[Decision]>('reviewDecision');
export const returnState=defineQuery<unknown>('returnState');
export async function returnsWorkflow(request:RefundRequest):Promise<ReturnResult>{
 const root=CancellationScope.current();let decision:Decision|null=null,stage='awaiting_approval';
 let cancellationRequested=false,ignoredDecisions=0;
 let reservation:ReturnResult['reservation']='open',receiver:ReturnResult['receiver']=null;
 const deadline=workflowInfo().startTime.getTime()+10000;
 root.cancelRequested.catch(()=>{cancellationRequested=true;});
 const a=proxyActivities<ReturnType<typeof createActivities>>({startToCloseTimeout:5000,scheduleToCloseTimeout:20000,heartbeatTimeout:1000,retry:{maximumAttempts:3,initialInterval:1000,backoffCoefficient:2,maximumInterval:2000}});
 const payment=proxyActivities<Pick<ReturnType<typeof createActivities>,'dispatchPayment'>>({startToCloseTimeout:5000,scheduleToCloseTimeout:15000,retry:{maximumAttempts:1}});
 const finish=(outcome:ReturnResult['outcome']):ReturnResult=>({outcome,request,decision,cancellationRequested,receiver,reservation,ignoredDecisions});
 setHandler(reviewDecision,(d:Decision)=>{
  if(decision||Date.now()>=deadline||!d||d.returnId!==request.returnId||d.reviewerId!=='reviewer-demo'||!['approve','reject'].includes(d.choice)||typeof d.decisionId!=='string'||!/^[A-Za-z0-9_-]{1,48}$/.test(d.decisionId)){
   ignoredDecisions++;return;
  }
  decision=d;
 });
 setHandler(returnState,()=>({stage,...finish('uncertain')}));
 const compensate=async(outcome:'cancelled'|'failed_compensated')=>CancellationScope.nonCancellable(async()=>{
  stage='compensating';try{await a.releaseRefund(request);reservation='released';stage=outcome;return finish(outcome);}
  catch{reservation='unconfirmed';stage='reconciliation_required';return finish('reconciliation_required');}
 });
 try{
  if(!await condition(()=>decision!==null,Math.max(0,deadline-Date.now()))){stage='expired';return finish('expired');}
  if((decision as Decision|null)?.choice==='reject'){stage='rejected';return finish('rejected');}
  stage='reserving';await a.reserveRefund(request);reservation='held';stage='reserved';
  if(root.consideredCancelled)throw new CancelledFailure('cancel_before_dispatch');
  return await CancellationScope.nonCancellable(async()=>{
   stage='payment_started';
   try{receiver=await payment.dispatchPayment(request);}
   catch{
    stage='reconciling';try{receiver=await a.lookupReceipt(request);}catch{stage='uncertain';return finish('uncertain');}
   }
   if(receiver.status==='rejected')return compensate('failed_compensated');
   stage='finalizing';try{await a.finalizeRefund(request,receiver);reservation='consumed';stage='refunded';return finish('refunded');}
   catch{reservation='unconfirmed';stage='reconciliation_required';return finish('reconciliation_required');}
  });
 }catch(e){if(isCancellation(e)||root.consideredCancelled){cancellationRequested=true;return compensate('cancelled');}return compensate('failed_compensated');}
}
