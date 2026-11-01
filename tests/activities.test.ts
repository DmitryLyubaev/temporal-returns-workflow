import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {openPool} from '../src/db/pool';
import {makeRequest} from '../src/contracts';
import {createActivities} from '../src/activities';
const pool=openPool();
const r=makeRequest({captureId:'activityTests',returnId:'wire',currency:'AUD',amountCents:1000});
const runtime={attempt:()=>1,heartbeat:()=>{},cancelled:()=>false};
let mode='redirect';let server:ReturnType<typeof createServer>;let address:string;
before(async()=>{server=createServer((_req,res)=>{if(mode==='redirect'){res.writeHead(307,{Location:'/other'});res.end();}else{res.end(JSON.stringify({...r,refundKey:'wrong',status:'committed',receiptId:'bad'}));}});await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));address=`http://127.0.0.1:${(server.address() as {port:number}).port}`;});
after(async()=>{await new Promise<void>(resolve=>server.close(()=>resolve()));await pool.end();});
test('reject_redirect',async()=>{mode='redirect';await assert.rejects(()=>createActivities(pool,address,runtime).dispatchPayment(r));});
test('mismatched_receipt_not_success',async()=>{mode='mismatch';await assert.rejects(()=>createActivities(pool,address,runtime).dispatchPayment(r));});
test('permanent_failure_not_retryable',async()=>{
 await assert.rejects(()=>createActivities(pool,address,runtime).reserveRefund({...r,inputHash:'bad'}), (e:any)=>e.nonRetryable===true);
});
