import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import {openPool} from '../src/db/pool';
import {migrate} from '../src/db/migrate';
import {makeRequest} from '../src/contracts';
import {startReceiver} from '../src/receiver/server';
const pool=openPool(); let receiver:Awaited<ReturnType<typeof startReceiver>>;
const request=(id:string)=>makeRequest({captureId:'receiverTests',returnId:id,currency:'AUD',amountCents:1000});
before(async()=>{await migrate(pool);await pool.query("DELETE FROM receiver_effects WHERE capture_id='receiverTests'");await pool.query("DELETE FROM receiver_outcomes WHERE capture_id='receiverTests'");receiver=await startReceiver({pool});});
after(async()=>{await receiver?.close();await pool.end();});
const post=(r:unknown)=>fetch(receiver.address+'/refunds',{method:'POST',body:JSON.stringify(r)});
test('duplicate_post_one_effect',async()=>{
 const r=request('duplicate');const [a,b]=await Promise.all([post(r),post(r)]);
 assert.equal(a.status,200);assert.equal(b.status,200);
 assert.equal((await a.json()).receiptId,(await b.json()).receiptId);
 assert.equal((await pool.query('SELECT * FROM receiver_effects WHERE refund_key=$1',[r.refundKey])).rowCount,1);
});
test('conflicting_post_no_extra_effect',async()=>{
 const r=request('conflict');assert.equal((await post(r)).status,200);
 assert.equal((await post(makeRequest({...r,amountCents:999}))).status,409);
 assert.equal((await pool.query('SELECT * FROM receiver_effects WHERE refund_key=$1',[r.refundKey])).rowCount,1);
});
test('lost_response_receipt_readback',async()=>{
 const r=request('lost');await pool.query('INSERT INTO fixture_control(refund_key,drop_response) VALUES($1,true) ON CONFLICT(refund_key) DO UPDATE SET drop_response=true',[r.refundKey]);
 await assert.rejects(()=>post(r));
 const response=await fetch(receiver.address+'/refunds/'+encodeURIComponent(r.refundKey));
 assert.equal(response.status,200);assert.equal((await response.json()).status,'committed');
});
test('permanent rejection is durable without effect',async()=>{
 const r=request('reject');await pool.query('INSERT INTO fixture_control(refund_key,reject_payment) VALUES($1,true) ON CONFLICT(refund_key) DO UPDATE SET reject_payment=true',[r.refundKey]);
 const res=await post(r); assert.equal(res.status,200);assert.equal((await res.json()).status,'rejected');
 assert.equal((await pool.query('SELECT * FROM receiver_effects WHERE refund_key=$1',[r.refundKey])).rowCount,0);
});
test('invalid JSON and oversized body produce no effect',async()=>{
 assert.equal((await fetch(receiver.address+'/refunds',{method:'POST',body:'{'})).status,400);
 assert.equal((await fetch(receiver.address+'/refunds',{method:'POST',body:'x'.repeat(9000)})).status,413);
});
