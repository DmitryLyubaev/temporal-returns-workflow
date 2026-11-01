import {request} from 'node:http';
import {requireOwned} from '../config';
export function shouldStartCase(startedAt:number,now:number,deadline:number):boolean{return Number.isFinite(startedAt)&&Number.isFinite(now)&&Number.isFinite(deadline)&&now-startedAt<210000&&now<deadline-90000;}
export class DockerControl {
 constructor(readonly project:string){if(!/^p28-[a-z0-9_-]{1,48}$/.test(project))throw Error('invalid_owned_project');}
 async request(path:string,method='GET',data?:unknown):Promise<Buffer>{
  return new Promise((resolve,reject)=>{
   const req=request({socketPath:'/var/run/docker.sock',path,method,headers:data?{'Content-Type':'application/json'}:{}},res=>{
    const chunks:Buffer[]=[];let bytes=0;
    res.on('data',chunk=>{bytes+=chunk.length;if(bytes>4*1024*1024){req.destroy(Error('docker_response_too_large'));return;}chunks.push(chunk);});
    res.on('end',()=>{if((res.statusCode??500)>=300)reject(Error('docker_http_'+res.statusCode));else resolve(Buffer.concat(chunks));});
   });
   req.setTimeout(10000,()=>req.destroy(Error('docker_timeout')));req.on('error',reject);if(data)req.write(JSON.stringify(data));req.end();
  });
 }
 async inspect(id:string):Promise<any>{
  if(!/^[a-f0-9]{64}$/.test(id))throw Error('invalid_container_id');
  const info=JSON.parse((await this.request('/containers/'+id+'/json')).toString());requireOwned(info,this.project,id);return info;
 }
 async services():Promise<Record<string,string>>{
  const filter=encodeURIComponent(JSON.stringify({label:['com.docker.compose.project='+this.project]}));
  const rows=JSON.parse((await this.request('/containers/json?all=1&filters='+filter)).toString()),result:Record<string,string>={};
  for(const row of rows){if(row.Labels['com.docker.compose.oneoff']==='True')continue;const service=row.Labels['com.docker.compose.service'];if(['worker','receiver','postgres','temporal'].includes(service)){await this.inspect(row.Id);result[service]=row.Id;}}
  for(const service of ['worker','receiver','postgres','temporal'])if(!result[service])throw Error('owned_service_missing:'+service);return result;
 }
 async mutate(id:string,action:'kill'|'start'|'stop'):Promise<void>{await this.inspect(id);await this.request('/containers/'+id+'/'+action+(action==='kill'?'?signal=KILL':action==='stop'?'?t=3':''),'POST');}
 async logs(id:string):Promise<Buffer>{await this.inspect(id);return this.request('/containers/'+id+'/logs?stdout=1&stderr=1&timestamps=1&tail=500');}
 async exec(id:string,cmd:string[]):Promise<string>{
  await this.inspect(id);
  const created=JSON.parse((await this.request('/containers/'+id+'/exec','POST',{AttachStdout:true,AttachStderr:true,Cmd:cmd})).toString());
  const output=await this.request('/exec/'+created.Id+'/start','POST',{Detach:false,Tty:false});
  const status=JSON.parse((await this.request('/exec/'+created.Id+'/json')).toString());if(status.ExitCode!==0)throw Error('owned_exec_failed');return dockerText(output);
 }
}
export function dockerText(buffer:Buffer):string{
 const chunks:Buffer[]=[];let offset=0;
 while(offset+8<=buffer.length&&[1,2].includes(buffer[offset])&&buffer[offset+1]===0){const length=buffer.readUInt32BE(offset+4);if(offset+8+length>buffer.length)throw Error('truncated_docker_stream');chunks.push(buffer.subarray(offset+8,offset+8+length));offset+=8+length;}
 return offset===buffer.length?Buffer.concat(chunks).toString('utf8'):buffer.toString('utf8');
}
