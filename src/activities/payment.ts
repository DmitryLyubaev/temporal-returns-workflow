import {Pool} from 'pg';
import {RefundRequest,Receipt,PermanentError} from '../contracts';
import {ActivityRuntime,logged} from './reservations';
function receipt(value:any,r:RefundRequest):Receipt{
 if(!value||value.refundKey!==r.refundKey||value.inputHash!==r.inputHash||!['committed','rejected'].includes(value.status)||typeof value.receiptId!=='string'||!value.receiptId)throw new PermanentError('invalid_receipt');
 return {refundKey:value.refundKey,inputHash:value.inputHash,status:value.status,receiptId:value.receiptId};
}
export function paymentActivities(pool:Pool,base:string,runtime:ActivityRuntime){return {
 async dispatchPayment(r:RefundRequest):Promise<Receipt>{return logged(pool,r,'dispatchPayment',runtime,async()=>{
  console.log(JSON.stringify({event:'payment_http_started',refundKey:r.refundKey,at:new Date().toISOString()}));
  const res=await fetch(base+'/refunds',{method:'POST',body:JSON.stringify(r),headers:{'Content-Type':'application/json'},redirect:'error',signal:AbortSignal.timeout(2000)});
  if(!res.ok)throw new Error('payment_http_'+res.status);return receipt(await res.json(),r);
 });},
 async lookupReceipt(r:RefundRequest):Promise<Receipt>{return logged(pool,r,'lookupReceipt',runtime,async()=>{
  const res=await fetch(base+'/refunds/'+encodeURIComponent(r.refundKey),{redirect:'error',signal:AbortSignal.timeout(2000)});
  if(!res.ok)throw new Error('receipt_http_'+res.status);return receipt(await res.json(),r);
 });}
};}
