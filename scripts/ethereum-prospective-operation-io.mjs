import {constants} from 'node:fs';
import {open,lstat,realpath,mkdir,rename,link,rm} from 'node:fs/promises';
import {resolve,dirname,isAbsolute} from 'node:path';
import {createHash,randomBytes} from 'node:crypto';
import {canonicalForecastJson} from '../dist/forecast-records.js';

export const ethereumOperationJson=value=>Buffer.from(canonicalForecastJson(value)+'\n');
export const ethereumOperationSha=bytes=>createHash('sha256').update(bytes).digest('hex');
const MAX=8*1024*1024;
const safe=path=>typeof path==='string'&&path.length<=240&&/^(?:\.github\/)?[a-zA-Z0-9_-]+(?:[./][a-zA-Z0-9_-]+)*$/.test(path)&&
  !path.split('/').some(part=>part==='.'||part==='..')&&!path.includes('\\');
async function location(root,path,{create=false}={}){
  if(typeof root!=='string'||!isAbsolute(root)||!safe(path)||await realpath(root)!==resolve(root))throw new Error('Regular repository and safe operation path required');
  const rootStat=await lstat(root);if(!rootStat.isDirectory()||rootStat.isSymbolicLink())throw new Error('Operation root must be a regular directory');
  let parent=resolve(root);
  for(const part of path.split('/').slice(0,-1)){
    parent=resolve(parent,part);
    try{const stat=await lstat(parent);if(!stat.isDirectory()||stat.isSymbolicLink()||await realpath(parent)!==parent)throw new Error('Operation parent must be a regular directory');}
    catch(error){if(!create||error.code!=='ENOENT')throw error;await mkdir(parent);}
  }
  return resolve(root,path);
}
export async function readEthereumOperationFile(root,path,{optional=false,maximumBytes=MAX}={}){
  if(!Number.isSafeInteger(maximumBytes)||maximumBytes<1||maximumBytes>MAX)throw new Error('Bounded operation read required');
  let file;
  try{file=await location(root,path);}
  catch(error){if(optional&&error.code==='ENOENT')return null;throw error;}
  let handle;
  try{
    handle=await open(file,constants.O_RDONLY|constants.O_NOFOLLOW);
    const before=await handle.stat();if(!before.isFile()||before.size>maximumBytes)throw new Error('Operation input must be a bounded regular file');
    const chunks=[];let total=0;
    while(true){
      const buffer=Buffer.alloc(Math.min(65536,maximumBytes-total+1)),result=await handle.read(buffer,0,buffer.length,null);
      if(!result.bytesRead)break;
      total+=result.bytesRead;if(total>maximumBytes)throw new Error('Operation input exceeded its bound during read');
      chunks.push(buffer.subarray(0,result.bytesRead));
    }
    const bytes=Buffer.concat(chunks,total),after=await handle.stat();
    if(bytes.length>maximumBytes||before.size!==bytes.length||after.size!==before.size||after.mtimeMs!==before.mtimeMs||after.ctimeMs!==before.ctimeMs)
      throw new Error('Operation input changed during read');
    await location(root,path);
    const named=await lstat(file);
    if(named.isSymbolicLink()||!named.isFile()||named.dev!==before.dev||named.ino!==before.ino||
      named.size!==after.size||named.mtimeMs!==after.mtimeMs||named.ctimeMs!==after.ctimeMs)
      throw new Error('Operation input path changed during read');
    return bytes;
  }catch(error){if(optional&&error.code==='ENOENT'&&!handle)return null;throw error;}
  finally{await handle?.close();}
}
export async function readEthereumOperationJson(root,path,options={}){
  const bytes=await readEthereumOperationFile(root,path,options);if(bytes===null)return null;
  const text=bytes.toString('utf8');if(!Buffer.from(text).equals(bytes))throw new Error('Operation JSON must be lossless UTF-8');
  const value=JSON.parse(text);if(!ethereumOperationJson(value).equals(bytes))throw new Error('Operation JSON must be canonical');return value;
}
export async function writeEthereumOperationFile(root,path,bytes,{immutable=true}={}){
  if(!Buffer.isBuffer(bytes)||bytes.length>MAX)throw new Error('Bounded operation bytes required');
  const file=await location(root,path,{create:true}),prior=await readEthereumOperationFile(root,path,{optional:true});
  if(prior){
    if(prior.equals(bytes))return;
    if(immutable)throw new Error('Immutable operation bytes conflict: '+path);
  }
  const temporary=resolve(dirname(file),'.eth-operation-'+randomBytes(12).toString('hex'));
  const parentBefore=await lstat(dirname(file));
  async function unchangedParent(){
    await location(root,path);
    const current=await lstat(dirname(file));
    if(current.isSymbolicLink()||!current.isDirectory()||current.dev!==parentBefore.dev||current.ino!==parentBefore.ino)
      throw new Error('Operation output parent changed before publication');
  }
  let handle;
  try{
    handle=await open(temporary,constants.O_CREAT|constants.O_EXCL|constants.O_WRONLY|constants.O_NOFOLLOW,0o600);
    await handle.writeFile(bytes);await handle.close();handle=null;
    await unchangedParent();
    // Mutable receipts use a same-directory atomic rename. An exclusive hard
    // link publishes complete immutable bytes without replacing another writer.
    if(immutable){
      try{
        await link(temporary,file);
      }catch(error){
        if(error.code!=='EEXIST'||!(await readEthereumOperationFile(root,path)).equals(bytes))throw error;
      }
    }else{
      const latest=await readEthereumOperationFile(root,path,{optional:true});
      if(prior===null?latest!==null:!latest?.equals(prior))throw new Error('Operation receipt changed before replacement');
      await rename(temporary,file);
    }
    if(!(await readEthereumOperationFile(root,path)).equals(bytes))throw new Error('Operation output changed during publication');
  }finally{
    await handle?.close();
    // Never follow a replaced parent while cleaning up a staging filename.
    try{await unchangedParent();await rm(temporary,{force:true});}catch{}
  }
}
export const writeEthereumOperationJson=(root,path,value,options)=>writeEthereumOperationFile(root,path,ethereumOperationJson(value),options);
