const {writeManifest,checkManifest,archiveCapture}=require('../src/acceptance/archive.ts');
const fs=require('node:fs');
const path=require('node:path');
(async()=>{
  const dir=path.resolve(process.argv[2]);
  if(!fs.existsSync(path.join(dir,'manifest.json')))await writeManifest(dir);
  await checkManifest(dir);
  if(process.argv[3]){const target=path.resolve(process.argv[3]);fs.mkdirSync(path.dirname(target),{recursive:true});await archiveCapture(dir,target);}
  console.log('capture_manifest_verified');
})().catch(e=>{console.error(e.message);process.exitCode=1;});
