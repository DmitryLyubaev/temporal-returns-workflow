import {Pool} from 'pg';
import {RefundRequest,Receipt,PermanentError,validateRequest} from '../contracts';
export async function seed(pool:Pool,r:RefundRequest):Promise<void>{
  validateRequest(r);
  await pool.query(`INSERT INTO reservations(refund_key,capture_id,return_id,input_hash,currency,amount_cents,state)
    VALUES($1,$2,$3,$4,$5,$6,'open') ON CONFLICT DO NOTHING`,[r.refundKey,r.captureId,r.returnId,r.inputHash,r.currency,r.amountCents]);
  const row=(await pool.query('SELECT input_hash FROM reservations WHERE refund_key=$1',[r.refundKey])).rows[0];
  if(row?.input_hash!==r.inputHash)throw new PermanentError('identity_conflict');
}
async function transition(pool:Pool,r:RefundRequest,target:string,allowed:string[],receiptId?:string):Promise<void>{
  validateRequest(r);
  const c=await pool.connect();
  try {
    await c.query('BEGIN'); await c.query("SET LOCAL statement_timeout='1s'"); await c.query("SET LOCAL lock_timeout='500ms'");
    const row=(await c.query('SELECT * FROM reservations WHERE refund_key=$1 FOR UPDATE',[r.refundKey])).rows[0];
    if(!row||row.input_hash!==r.inputHash)throw new PermanentError('identity_conflict');
    if(row.state===target){if(receiptId && row.receipt_id!==receiptId)throw new PermanentError('receipt_conflict');}
    else {
      if(!allowed.includes(row.state))throw new PermanentError('terminal_reservation');
      await c.query('UPDATE reservations SET state=$2,receipt_id=$3 WHERE refund_key=$1',[r.refundKey,target,receiptId??null]);
    }
    await c.query('COMMIT');
  }catch(e){await c.query('ROLLBACK');throw e;}finally{c.release();}
}
export async function reserve(pool:Pool,r:RefundRequest):Promise<'held'>{await transition(pool,r,'held',['open']);return 'held';}
export async function release(pool:Pool,r:RefundRequest):Promise<'released'>{await transition(pool,r,'released',['open','held']);return 'released';}
export async function consume(pool:Pool,r:RefundRequest,receipt:Receipt):Promise<'consumed'>{
  if(receipt.status!=='committed'||receipt.refundKey!==r.refundKey||receipt.inputHash!==r.inputHash||!receipt.receiptId)throw new PermanentError('invalid_receipt');
  const row=(await pool.query('SELECT receipt_id,status,input_hash FROM receiver_outcomes WHERE refund_key=$1',[r.refundKey])).rows[0];
  if(row?.status!=='committed'||row.receipt_id!==receipt.receiptId||row.input_hash!==r.inputHash)throw new PermanentError('unsupported_receipt');
  await transition(pool,r,'consumed',['held'],receipt.receiptId);return 'consumed';
}
