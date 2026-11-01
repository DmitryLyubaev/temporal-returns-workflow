import {NativeConnection,Worker,Runtime,DefaultLogger} from '@temporalio/worker';
import {createActivities} from './activities';
import {openPool} from './db/pool';
Runtime.install({logger:new DefaultLogger('WARN')});
async function main(){
 const pool=openPool('p28_worker'),connection=await NativeConnection.connect({address:process.env.TEMPORAL_ADDRESS??'temporal:7233'});
 try{
  const worker=await Worker.create({connection,namespace:process.env.TEMPORAL_NAMESPACE??'p28',taskQueue:process.env.TASK_QUEUE??'p28-dev',workflowsPath:require.resolve('./workflows'),activities:createActivities(pool,process.env.RECEIVER_URL??'http://receiver:8080'),maxCachedWorkflows:16,maxConcurrentActivityTaskExecutions:4});
  process.on('SIGTERM',()=>worker.shutdown());
  console.log(JSON.stringify({event:'worker_ready',pid:process.pid,at:new Date().toISOString()}));await worker.run();
 }finally{await pool.end();await connection.close();}
}
main().catch(e=>{console.error(e.message);process.exitCode=1;});
