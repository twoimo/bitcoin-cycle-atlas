import {open,mkdir,mkdtemp,lstat,readdir,realpath,rename,rm} from 'node:fs/promises';
import {constants} from 'node:fs';
import {resolve,relative,isAbsolute,sep} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {ETH_BASE_ROLLOVER_POLICY,buildEthereumBaseRolloverCandidate} from './ethereum-base-rollover-core.mjs';

const ROOT=fileURLToPath(new URL('..',import.meta.url));
const sha=value=>createHash('sha256').update(value).digest('hex');
const inside=(parent,child)=>{const path=relative(parent,child);return path===''||!isAbsolute(path)&&path!=='..'&&!path.startsWith('..'+sep);};

async function readRegular(path,maximum){
  if(await realpath(path)!==path)throw new Error('Rollover input or artifact path must not traverse symbolic links');
  const handle=await open(path,constants.O_RDONLY|constants.O_NOFOLLOW);
  try{
    const info=await handle.stat();
    if(!info.isFile()||info.size===0||info.size>maximum)throw new RangeError('Rollover input or artifact must be a bounded nonempty regular file');
    const bytes=await handle.readFile();
    if(bytes.length>maximum)throw new RangeError('Rollover input grew beyond its byte limit');
    const text=new TextDecoder('utf-8',{fatal:true}).decode(bytes);
    if(!Buffer.from(text).equals(bytes))throw new Error('Rollover input must be lossless UTF-8');
    return {text,bytes:bytes.length,sha256:sha(bytes)};
  }finally{await handle.close();}
}

async function checkedDirectory(path){
  try{await mkdir(path);}catch(error){if(error.code!=='EEXIST')throw error;}
  const info=await lstat(path);
  if(!info.isDirectory()||info.isSymbolicLink()||await realpath(path)!==path)throw new Error('Rollover output directories must not traverse symbolic links');
}

async function verifySaved(directory,built){
  const info=await lstat(directory);
  if(!info.isDirectory()||info.isSymbolicLink()||await realpath(directory)!==directory)throw new Error('Rollover candidate directory must not be a symbolic link');
  const files=(await readdir(directory)).sort();
  if(files.join(',')!=='candidate.json,receipt.json')throw new Error('Existing rollover candidate directory has conflicting contents');
  for(const [name,expected,limit]of [['candidate.json',built.candidateText,ETH_BASE_ROLLOVER_POLICY.maximumCandidateBytes],
    ['receipt.json',built.receiptText,ETH_BASE_ROLLOVER_POLICY.maximumSnapshotBytes]]){
    const actual=await readRegular(resolve(directory,name),limit);
    if(actual.text!==expected)throw new Error('Refusing to replace immutable rollover artifact: '+name);
  }
}

async function writeDurable(path,text){
  const handle=await open(path,'wx');
  try{await handle.writeFile(text,'utf8');await handle.sync();}finally{await handle.close();}
}

export function parseEthereumBaseRolloverArguments(args){
  if(args.length===1&&args[0]==='--help')return {help:true};
  if(args.length!==2||args[0]!=='--snapshot'||!args[1]||args[1].startsWith('--'))
    throw new TypeError('Usage: node scripts/prepare-ethereum-base-rollover.mjs --snapshot <preserved-snapshot.json>');
  return {snapshotPath:args[1]};
}

export async function prepareEthereumBaseRollover({repositoryRoot=ROOT,snapshotPath,clock=()=>new Date().toISOString()}={}){
  if(typeof repositoryRoot!=='string'||!isAbsolute(repositoryRoot)||typeof snapshotPath!=='string'||!snapshotPath.trim())
    throw new TypeError('An absolute repository root and a preserved snapshot path are required');
  const root=resolve(repositoryRoot);
  if(await realpath(root)!==root)throw new Error('Repository root must not traverse symbolic links');
  const source=resolve(root,snapshotPath),input=await readRegular(source,ETH_BASE_ROLLOVER_POLICY.maximumSnapshotBytes);
  const preparedAt=clock(),built=await buildEthereumBaseRolloverCandidate({snapshot:JSON.parse(input.text),preparedAt});
  const parent=resolve(root,ETH_BASE_ROLLOVER_POLICY.outputParent),destination=resolve(parent,built.snapshotId);
  if(!inside(root,parent)||!inside(parent,destination)||inside(destination,source))throw new Error('Rollover output would contain its preserved source input');
  await checkedDirectory(resolve(root,'build'));
  await checkedDirectory(parent);
  const lock=resolve(parent,'.lock-'+built.snapshotId);
  await mkdir(lock).catch(error=>{if(error.code==='EEXIST')throw new Error('A rollover writer already owns this snapshot');throw error;});
  let staging=null,reused=false;
  try{
    let exists=true;
    try{await lstat(destination);}catch(error){if(error.code!=='ENOENT')throw error;exists=false;}
    if(exists){await verifySaved(destination,built);reused=true;}
    else{
      staging=await mkdtemp(resolve(parent,'.stage-'+built.snapshotId+'-'));
      await writeDurable(resolve(staging,'candidate.json'),built.candidateText);
      await writeDurable(resolve(staging,'receipt.json'),built.receiptText);
      await verifySaved(staging,built);
      if(await realpath(parent)!==parent)throw new Error('Rollover output parent changed during preparation');
      await rename(staging,destination);staging=null;
      await verifySaved(destination,built);
    }
    return {status:reused?'candidate-reused':'candidate-prepared',snapshotId:built.snapshotId,preparedAt,
      source:{path:source,bytes:input.bytes,sha256:input.sha256},
      outputDirectory:relative(root,destination).split(sep).join('/'),
      candidate:built.report.candidate,changes:built.report.changes,capacity:built.report.capacity,
      operatingBaseChanged:false,newForecastRecords:0,newObservations:0,newCalibrationCases:0,
      networkRequests:0,releaseAuthorized:false,productionPromoted:false};
  }finally{
    if(staging)await rm(staging,{recursive:true,force:true});
    await rm(lock,{recursive:true});
  }
}

if(process.argv[1]&&pathToFileURL(resolve(process.argv[1])).href===import.meta.url){
  try{
    const args=parseEthereumBaseRolloverArguments(process.argv.slice(2));
    if(args.help)console.log('Usage: node scripts/prepare-ethereum-base-rollover.mjs --snapshot <preserved-snapshot.json>\nCreates a review candidate under build/ethereum-base-rollover/<snapshot-id> without replacing the operating base.');
    else console.log(JSON.stringify(await prepareEthereumBaseRollover(args),null,2));
  }catch(error){console.error(JSON.stringify({status:'failed',error:{name:error.name,message:error.message},operatingBaseChanged:false,releaseAuthorized:false}));process.exitCode=1;}
}
