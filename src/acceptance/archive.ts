import {readFile,writeFile,readdir,mkdir,copyFile,lstat} from 'node:fs/promises';
import {join,relative,resolve,isAbsolute,sep} from 'node:path';
import {createHash} from 'node:crypto';
import {constants} from 'node:fs';
export type ArchiveManifest={version:number;files:{path:string;size:number;sha256:string}[]};
export const sha256=(bytes:Buffer|string)=>createHash('sha256').update(bytes).digest('hex');
export async function captureFiles(dir:string):Promise<string[]>{
 const paths:string[]=[];
 async function visit(folder:string){
  for(const entry of await readdir(folder,{withFileTypes:true})){
   const p=join(folder,entry.name);if(entry.isSymbolicLink())throw Error('symlink_evidence_rejected');
   if(entry.isDirectory())await visit(p);else if(entry.isFile()&&relative(dir,p)!=='manifest.json')paths.push(relative(dir,p).replaceAll('\\','/'));
   else if(!entry.isFile())throw Error('non_file_evidence_rejected');
  }
 }
 await visit(dir);return paths.sort();
}
export async function writeManifest(dir:string):Promise<ArchiveManifest>{
 const files=[];
 for(const path of await captureFiles(dir)){const bytes=await readFile(join(dir,path));files.push({path,size:bytes.length,sha256:sha256(bytes)});}
 const manifest={version:1,files};await writeFile(join(dir,'manifest.json'),JSON.stringify(manifest,null,2),{flag:'wx'});return manifest;
}
export async function checkManifest(dir:string):Promise<ArchiveManifest>{
 const manifest:ArchiveManifest=JSON.parse(await readFile(join(dir,'manifest.json'),'utf8'));
 if(manifest.version!==1||!Array.isArray(manifest.files))throw Error('invalid_manifest');
 const actual=await captureFiles(dir),seen=new Set<string>();
 for(const item of manifest.files){
  if(typeof item.path!=='string'||!item.path||item.path.includes('\\')||item.path.split('/').some(p=>p==='..'||p==='.'||!p)||isAbsolute(item.path)||item.path.includes(':')||seen.has(item.path))throw Error('unsafe_manifest_path');
  seen.add(item.path);const p=join(dir,item.path),stat=await lstat(p);if(!stat.isFile()||stat.isSymbolicLink())throw Error('invalid_evidence_file');
  const bytes=await readFile(p);if(item.size!==bytes.length||item.sha256!==sha256(bytes))throw Error('evidence_hash_mismatch:'+item.path);
 }
 if(actual.length!==seen.size||actual.some(p=>!seen.has(p)))throw Error('manifest_coverage_mismatch');return manifest;
}
export async function archiveCapture(dir:string,destination:string):Promise<ArchiveManifest>{
 const source=resolve(dir),target=resolve(destination),rel=relative(source,target);
 if(!(rel==='..'||rel.startsWith('..'+sep)||isAbsolute(rel)))throw Error('archive_inside_capture');
 const manifest=await checkManifest(source);await mkdir(target,{recursive:false});
 for(const path of [...manifest.files.map(f=>f.path),'manifest.json']){
  const dst=join(target,path);await mkdir(join(dst,'..'),{recursive:true});await copyFile(join(source,path),dst,constants.COPYFILE_EXCL);
 }
 await checkManifest(target);return manifest;
}
