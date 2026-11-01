import {ApplicationFailure,CancelledFailure} from '@temporalio/common';
import {Pool} from 'pg';
import {RefundRequest,Receipt,PermanentError,validateRequest} from '../contracts';
import {reserve,release,consume} from '../db/reservations';
export type ActivityRuntime={attempt():number;heartbeat():void;cancelled():boolean};
export async function logged<T>(pool:Pool,r:RefundRequest,name:string,runtime:ActivityRuntime,fn:()=>Promise<T>):Promise<T>{
 try{validateRequest(r);await pool.query('INSERT INTO activity_attempts(refund_key,activity,attempt) VALUES($1,$2,$3)',[r.refundKey,name,runtime.attempt()]);return await fn();}
 catch(e){if(e instanceof PermanentError)throw ApplicationFailure.nonRetryable(e.code,e.code);throw e;}
}
export function reservationActivities(pool:Pool,runtime:ActivityRuntime){return {
 async reserveRefund(r:RefundRequest):Promise<void>{return logged(pool,r,'reserveRefund',runtime,async()=>{
  const ctl=(await pool.query('UPDATE fixture_control SET reserve_attempts=reserve_attempts+1 WHERE refund_key=$1 RETURNING *',[r.refundKey])).rows[0];
  if(ctl&&ctl.reserve_attempts<=ctl.reserve_failures)throw new Error('fixture_transient_reserve');
  await reserve(pool,r);await pool.query('UPDATE fixture_control SET reservation_reached=true WHERE refund_key=$1',[r.refundKey]);
  const end=Date.now()+3000;let heartbeat=0;
  while((await pool.query('SELECT hold_reservation FROM fixture_control WHERE refund_key=$1',[r.refundKey])).rows[0]?.hold_reservation){
   if(runtime.cancelled())throw new CancelledFailure('reservation_cancelled');
   if(Date.now()>=end)throw new Error('reservation_gate_timeout');
   if(Date.now()-heartbeat>=250){runtime.heartbeat();heartbeat=Date.now();}
   await new Promise(resolve=>setTimeout(resolve,25));
  }
 });},
 async releaseRefund(r:RefundRequest):Promise<void>{await logged(pool,r,'releaseRefund',runtime,()=>release(pool,r));},
 async finalizeRefund(r:RefundRequest,receipt:Receipt):Promise<void>{await logged(pool,r,'finalizeRefund',runtime,()=>consume(pool,r,receipt));}
};}
