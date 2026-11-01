import {createServer,IncomingMessage} from 'node:http';
import {Pool} from 'pg';
import {PermanentError,validateRequest} from '../contracts';
import {applyRefund,receiptFromRow} from './store';
import {openPool} from '../db/pool';
class HttpError extends Error{constructor(public status:number){super(String(status));}}
async function body(req:IncomingMessage):Promise<unknown>{return new Promise((resolve,reject)=>{
 const chunks:Buffer[]=[];let bytes=0;const timer=setTimeout(()=>reject(new HttpError(408)),2000);
 req.on('data',(chunk:Buffer)=>{bytes+=chunk.length;if(bytes<=8192)chunks.push(chunk);});
 req.on('error',e=>{clearTimeout(timer);reject(e);});
 req.on('end',()=>{clearTimeout(timer);if(bytes>8192){reject(new HttpError(413));return;}try{resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')));}catch{reject(new HttpError(400));}});
});}
export type ReceiverConfig={pool:Pool;host?:string;port?:number};
export async function startReceiver(config:ReceiverConfig):Promise<{address:string;close():Promise<void>}>{
  const server=createServer(async(req,res)=>{
   const send=(status:number,value:unknown)=>{if(!res.destroyed){res.writeHead(status,{'Content-Type':'application/json'});res.end(JSON.stringify(value));}};
   try{
    if(req.method==='POST'&&req.url==='/refunds'){
     const r=validateRequest(await body(req));
     await config.pool.query('INSERT INTO wire_attempts(refund_key,method) VALUES($1,\'POST\')',[r.refundKey]);
     const receipt=await applyRefund(config.pool,r),deadline=Date.now()+3000;
     for(;;){
      const ctl=(await config.pool.query('SELECT * FROM fixture_control WHERE refund_key=$1',[r.refundKey])).rows[0];
      if(ctl?.drop_response){req.socket.destroy();return;}
      if(!ctl?.hold_payment||ctl.release_payment||Date.now()>=deadline)break;
      await new Promise(resolve=>setTimeout(resolve,25));
     }
     send(200,receipt);return;
    }
    if(req.method==='GET'&&req.url?.startsWith('/refunds/')){
     const key=decodeURIComponent(req.url.slice('/refunds/'.length));
     await config.pool.query('INSERT INTO wire_attempts(refund_key,method) VALUES($1,\'GET\')',[key]);
     const ctl=(await config.pool.query('SELECT deny_lookup FROM fixture_control WHERE refund_key=$1',[key])).rows[0];
     if(ctl?.deny_lookup){send(503,{error:'receipt_unavailable'});return;}
     const row=(await config.pool.query('SELECT * FROM receiver_outcomes WHERE refund_key=$1',[key])).rows[0];
     send(row?200:404,row?receiptFromRow(row):{error:'receipt_absent'});return;
    }
    send(404,{error:'not_found'});
   }catch(e){send(e instanceof HttpError?e.status:e instanceof PermanentError?(e.code==='identity_conflict'?409:400):500,{error:e instanceof PermanentError?e.code:'request_failed'});}
  });
  server.requestTimeout=3000;server.headersTimeout=3000;
  await new Promise<void>(resolve=>server.listen(config.port??0,config.host??'127.0.0.1',resolve));
  const port=(server.address() as {port:number}).port;
  return {address:`http://127.0.0.1:${port}`,close:()=>new Promise((resolve,reject)=>{server.close(e=>e?reject(e):resolve());server.closeAllConnections();})};
}
if(require.main===module){const p=openPool('p28_receiver');startReceiver({pool:p,host:'0.0.0.0',port:8080}).then(s=>{console.log('receiver_ready');process.on('SIGTERM',()=>s.close().then(()=>p.end()));}).catch(e=>{console.error(e.message);process.exitCode=1;void p.end();});}
