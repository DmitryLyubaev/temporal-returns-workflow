export async function finishResources(close:()=>Promise<void>,stop:()=>Promise<void>,persist:()=>Promise<void>,record:(e:unknown)=>void):Promise<void>{
 try{await close();}catch(e){record(e);}
 try{await stop();}catch(e){record(e);}
 finally{await persist();}
}
