import {bundleWorkflowCode,Worker,Runtime,DefaultLogger} from '@temporalio/worker';
import {readFile,writeFile,mkdir,copyFile,readdir} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {sha256} from './archive';
export type ReplayReport={original:{id:string;pass:boolean;error?:string}[];compatible:{id:string;pass:boolean;error?:string}[];incompatible:{id:string;expectedFailure:boolean;errorType:string;message?:string};bundleHashes:Record<string,string>};
export async function prepareReplayBundles():Promise<void>{
 const dir=resolve('build/replay');await mkdir(dir,{recursive:true});
 const base=await readFile('build/src/workflows/returns.js','utf8');
 if((base.match(/payment\.dispatchPayment\(/g)??[]).length!==1)throw Error('incompatible_variant_boundary_not_unique');
 await writeFile(join(dir,'compatible-entry.js'),"const wf=require('@temporalio/workflow');const base=require('../src/workflows/returns');exports.returnsWorkflow=async function(request){wf.setHandler(wf.defineQuery('compatibilityInfo'),()=>({version:2}));return base.returnsWorkflow(request);};\n");
 await writeFile(join(dir,'incompatible-entry.js'),base.replace('payment.dispatchPayment(','payment.dispatchPaymentV2('));
 for(const [kind,path] of [['original','build/src/workflows/index.js'],['compatible','build/replay/compatible-entry.js'],['incompatible','build/replay/incompatible-entry.js']]){
  const bundle=await bundleWorkflowCode({workflowsPath:resolve(path)});await writeFile(join(dir,kind+'.js'),bundle.code);
 }
 console.log('three_replay_bundles_prepared');
}
export async function replayCapture(dir:string):Promise<ReplayReport>{
 const result:ReplayReport={original:[],compatible:[],incompatible:{id:'A1',expectedFailure:false,errorType:'not_run'},bundleHashes:{}};
 const histories=(await readdir(join(dir,'histories'))).filter(p=>/^A\d+\.json$/.test(p)).sort((a,b)=>Number(a.slice(1,-5))-Number(b.slice(1,-5)));
 for(const kind of ['original','compatible','incompatible'])result.bundleHashes[kind]=sha256(await readFile(join(dir,'bundles',kind+'.js')));
 for(const kind of ['original','compatible'] as const){
  const code=await readFile(join(dir,'bundles',kind+'.js'),'utf8');
  for(const filename of histories){
   const packet=JSON.parse(await readFile(join(dir,'histories',filename),'utf8')),id=filename.slice(0,-5);
   try{await Worker.runReplayHistory({workflowBundle:{code}},packet.history);result[kind].push({id,pass:true});}
   catch(e){result[kind].push({id,pass:false,error:(e as Error).name+': '+(e as Error).message});}
  }
 }
 const first=JSON.parse(await readFile(join(dir,'histories/A1.json'),'utf8'));
 try{await Worker.runReplayHistory({workflowBundle:{code:await readFile(join(dir,'bundles/incompatible.js'),'utf8')}},first.history);result.incompatible.errorType='unexpected_success';}
 catch(e){const error=e as Error;result.incompatible={id:'A1',expectedFailure:error.name==='DeterminismViolationError',errorType:error.name,message:error.message};}
 await writeFile(join(dir,'replay.json'),JSON.stringify(result,null,2),{flag:'wx'});return result;
}
export async function copyReplayBundles(dir:string):Promise<void>{
 await mkdir(join(dir,'bundles'),{recursive:true});await mkdir(join(dir,'variants'),{recursive:true});
 for(const kind of ['original','compatible','incompatible'])await copyFile('build/replay/'+kind+'.js',join(dir,'bundles',kind+'.js'));
 for(const kind of ['compatible','incompatible'])await copyFile('build/replay/'+kind+'-entry.js',join(dir,'variants',kind+'-entry.js'));
}
if(require.main===module){Runtime.install({logger:new DefaultLogger('WARN')});(process.argv.includes('--prepare')?prepareReplayBundles():replayCapture(process.argv[process.argv.indexOf('--capture')+1]).then(r=>{console.log(JSON.stringify(r));if(!r.original.every(v=>v.pass)||!r.compatible.every(v=>v.pass)||!r.incompatible.expectedFailure)process.exitCode=1;})).catch(e=>{console.error(e.message);process.exitCode=1;});}
