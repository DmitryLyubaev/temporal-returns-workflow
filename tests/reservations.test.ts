import {test, before, after} from 'node:test';
import assert from 'node:assert/strict';
import {Pool} from 'pg';
import {migrate} from '../src/db/migrate';
import {makeRequest, parseReturn} from '../src/contracts';
import {reserve,release,consume,seed} from '../src/db/reservations';
const pool=new Pool({connectionString:process.env.DATABASE_URL});
const request=(id:string)=>makeRequest(parseReturn({captureId:'dbtests',returnId:id,currency:'AUD',amountCents:1000}));
before(async()=>{await migrate(pool); await pool.query("DELETE FROM reservations WHERE capture_id='dbtests'");});
after(()=>pool.end());
test('same_key_conflict',async()=>{
  const r=request('conflict'); await seed(pool,r); await reserve(pool,r);
  await assert.rejects(()=>reserve(pool,makeRequest({...r,amountCents:999})));
  assert.equal((await pool.query('SELECT state FROM reservations WHERE refund_key=$1',[r.refundKey])).rows[0].state,'held');
});
test('release_fences_late_reserve',async()=>{
  const r=request('fence'); await seed(pool,r); await release(pool,r);
  await assert.rejects(()=>reserve(pool,r));
  assert.equal((await pool.query('SELECT state FROM reservations WHERE refund_key=$1',[r.refundKey])).rows[0].state,'released');
});
test('consume_requires_committed_matching_receipt',async()=>{
  const r=request('consume'); await seed(pool,r); await reserve(pool,r);
  await assert.rejects(()=>consume(pool,r,{refundKey:r.refundKey,inputHash:r.inputHash,status:'rejected',receiptId:'no'}));
  await assert.rejects(()=>consume(pool,r,{refundKey:r.refundKey,inputHash:'0'.repeat(64),status:'committed',receiptId:'bad'}));
});
test('concurrent reserve release preserves terminal fence',async()=>{
  const r=request('race'); await seed(pool,r);
  await Promise.allSettled([reserve(pool,r),release(pool,r)]);
  assert.equal((await pool.query('SELECT state FROM reservations WHERE refund_key=$1',[r.refundKey])).rows[0].state,'released');
});
