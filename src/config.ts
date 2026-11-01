export type Inventory={freeRamGiB:number;freeHostRamGiB:number;freeDiskGiB:number;busyPorts:number[]};
export function requireReady(i:Inventory,profile:'full'|'database'='full'):void{
 if(!Number.isFinite(i.freeRamGiB)||i.freeRamGiB<(profile==='full'?6:3)||!Number.isFinite(i.freeHostRamGiB)||i.freeHostRamGiB<0.5||!Number.isFinite(i.freeDiskGiB)||i.freeDiskGiB<10)throw Error('insufficient_local_resources');
 if(i.busyPorts.length)throw Error('ports_in_use');
}
export function requireOwned(info:any,project:string,id:string):void{
 if(!/^p28-[a-zA-Z0-9_-]+$/.test(project)||info?.Id!==id||info?.Config?.Labels?.['com.docker.compose.project']!==project)throw Error('container_ownership_mismatch');
}
