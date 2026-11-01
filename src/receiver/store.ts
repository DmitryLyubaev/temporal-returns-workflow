import {randomUUID} from 'node:crypto';
import {Pool} from 'pg';
import {Receipt,PermanentError,validateRequest} from '../contracts';
export function receiptFromRow(row:any):Receipt{return {refundKey:row.refund_key,inputHash:row.input_hash,status:row.status,receiptId:row.receipt_id};}
export async function applyRefund(pool:Pool,value:unknown):Promise<Receipt>{
 const r=validateRequest(value),c=await pool.connect();
 try{
  await c.query('BEGIN');await c.query("SET LOCAL statement_timeout='1s'");await c.query("SET LOCAL lock_timeout='500ms'");
  await c.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[r.refundKey]);
  const old=(await c.query('SELECT * FROM receiver_outcomes WHERE refund_key=$1',[r.refundKey])).rows[0];
  if(old){if(old.input_hash!==r.inputHash)throw new PermanentError('identity_conflict');await c.query('COMMIT');return receiptFromRow(old);}
  const ctl=(await c.query('SELECT * FROM fixture_control WHERE refund_key=$1',[r.refundKey])).rows[0];
  const receipt:Receipt={refundKey:r.refundKey,inputHash:r.inputHash,status:ctl?.reject_payment?'rejected':'committed',receiptId:randomUUID()};
  await c.query('INSERT INTO receiver_outcomes(refund_key,input_hash,capture_id,return_id,amount_cents,currency,status,receipt_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8)',[r.refundKey,r.inputHash,r.captureId,r.returnId,r.amountCents,r.currency,receipt.status,receipt.receiptId]);
  if(receipt.status==='committed')await c.query('INSERT INTO receiver_effects(refund_key,amount_cents,currency,capture_id) VALUES($1,$2,$3,$4)',[r.refundKey,r.amountCents,r.currency,r.captureId]);
  await c.query('UPDATE fixture_control SET payment_reached=true,reached_at=clock_timestamp() WHERE refund_key=$1',[r.refundKey]);
  await c.query('COMMIT');return receipt;
 }catch(e){await c.query('ROLLBACK');throw e;}finally{c.release();}
}
