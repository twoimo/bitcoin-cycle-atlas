import {readFile,writeFile,readdir,mkdir,lstat,realpath,mkdtemp,rename,rm} from 'node:fs/promises';
import {resolve,relative,isAbsolute,dirname} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {canonicalForecastJson} from '../dist/forecast-records.js';
import {validateAssetOutcomeIndex,verifyAssetOutcomeSnapshot,assetOutcomeSnapshotEntry} from '../dist/asset-outcome-records.js';
import {readEthereumCalibrationInputs} from './build-ethereum-prospective-calibration-readiness.mjs';
import {buildEthereumProspectiveArchive,verifyEthereumProspectiveArchive,restoreEthereumProspectiveArchive,
  normalizeEthereumProspectiveArchiveInputPath} from './ethereum-prospective-archive-core.mjs';
import {validateEthereumArchiveRemoteReadReceipt} from './ethereum-prospective-archive-remote.mjs';

const json=value=>canonicalForecastJson(value)+'\n',sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const HEX=/^[a-f0-9]{64}$/,COMMIT=/^[a-f0-9]{40}$/;
export const ETH_ARCHIVE_IO_PATHS=Object.freeze({
  seed:'research-data/ethereum-prospective-archive',remote:'build/ethereum-prospective-archive-remote',
  remoteReceipt:'build/ethereum-prospective-archive-remote-receipt.json',
  previous:'build/ethereum-prospective-archive-previous',output:'build/ethereum-prospective-archive',
  prospective:'build/ethereum-prospective-ledger',outcomes:'build/ethereum-prospective-archive-outcomes',
  restoreReceipt:'build/ethereum-prospective-archive-restore.json',appendReceipt:'build/ethereum-prospective-archive-append.json',
  verifyReceipt:'build/ethereum-prospective-archive-verify.json',
});
const P=ETH_ARCHIVE_IO_PATHS,MAX_FILE=8*1024*1024,MAX_TOTAL=2*1024*1024*1024,MAX_FILES=40000;
const safePath=path=>typeof path==='string'&&path.length<=240&&/^[a-zA-Z0-9_-]+(?:[./][a-zA-Z0-9_-]+)*$/.test(path)&&
  !path.split('/').some(part=>part==='.'||part==='..')&&!path.includes('\\');
const within=(root,path)=>{const rel=relative(root,path);return rel!==''&&!rel.startsWith('..')&&!isAbsolute(rel);};

/** No symbolic links, special files, recursive escape, oversized input, or
 * UTF-8 path normalization is accepted at the filesystem trust boundary. */
export async function readEthereumArchiveDirectory(directory,{optional=false}={}){
  if(typeof directory!=='string'||!isAbsolute(directory))throw new TypeError('Absolute archive directory required');
  let info;
  try{info=await lstat(directory);}catch(error){if(optional&&error.code==='ENOENT')return null;throw error;}
  if(!info.isDirectory()||info.isSymbolicLink())throw new Error('Archive root must be a regular directory without symlinks');
  const root=await realpath(directory),files=new Map();let totalBytes=0;
  if(root!==resolve(directory))throw new Error('Archive directory ancestors must not contain symlinks');
  async function visit(path=''){
    const entries=await readdir(resolve(root,path),{withFileTypes:true});
    for(const entry of entries.sort((a,b)=>a.name.localeCompare(b.name))){
      const logical=path?path+'/'+entry.name:entry.name;
      if(!safePath(logical))throw new Error('Unsafe archive filesystem path');
      const file=resolve(root,logical),st=await lstat(file),actual=await realpath(file);
      if(st.isSymbolicLink()||!within(root,actual))throw new Error('Archive evidence must remain inside its regular directory');
      if(st.isDirectory()){await visit(logical);continue;}
      if(!st.isFile())throw new Error('Archive evidence must be a regular file');
      if(files.size>=MAX_FILES||st.size>MAX_FILE||totalBytes+st.size>MAX_TOTAL)throw new Error('Archive filesystem byte or file budget exhausted');
      const bytes=await readFile(actual);
      if(bytes.length>MAX_FILE||totalBytes+bytes.length>MAX_TOTAL)throw new Error('Archive filesystem byte budget exhausted after read');
      totalBytes+=bytes.length;files.set(logical,bytes);
    }
  }
  await visit();return files;
}

async function trustedLocation(root,path){
  if(!safePath(path))throw new Error('Unsafe fixed archive output path');
  root=await realpath(root);
  const target=resolve(root,path);
  if(!within(root,target))throw new Error('Archive output leaves the repository');
  let current=root;
  for(const part of path.split('/').slice(0,-1)){
    current=resolve(current,part);
    try{const stat=await lstat(current);if(!stat.isDirectory()||stat.isSymbolicLink())throw new Error('Archive output parent must be a regular directory');}
    catch(error){if(error.code!=='ENOENT')throw error;await mkdir(current);}
  }
  return target;
}
function identicalMaps(a,b){return a.size===b.size&&[...a].every(([path,bytes])=>b.has(path)&&bytes.equals(b.get(path)));}

export async function writeEthereumArchiveDirectory({repositoryRoot,path,files}){
  if(!(files instanceof Map)||files.size>MAX_FILES)throw new TypeError('Bounded exact archive file map required');
  const target=await trustedLocation(repositoryRoot,path),existing=await readEthereumArchiveDirectory(target,{optional:true});
  if(existing){if(!identicalMaps(existing,files))throw new Error('Refusing to replace existing archive or ledger bytes: '+path);return;}
  const temporary=await mkdtemp(resolve(dirname(target),'.eth-archive-stage-'));
  try{
    let total=0;
    for(const [file,bytes]of files){
      if(!safePath(file)||!Buffer.isBuffer(bytes)||bytes.length>MAX_FILE||(total+=bytes.length)>MAX_TOTAL)
        throw new Error('Invalid bounded archive output bytes');
      const full=resolve(temporary,file);await mkdir(dirname(full),{recursive:true});await writeFile(full,bytes,{flag:'wx'});
    }
    // A fresh directory is promoted only after every file has been written.
    await rename(temporary,target);
  }finally{await rm(temporary,{recursive:true,force:true});}
}
async function writeReceipt(root,path,value){
  const target=await trustedLocation(root,path);
  try{const info=await lstat(target);if(!info.isFile()||info.isSymbolicLink())throw new Error('Archive receipt must be a regular file');}
  catch(error){if(error.code!=='ENOENT')throw error;}
  const temporary=target+'.tmp-'+process.pid;
  try{await writeFile(temporary,json(value),{flag:'wx'});await rename(temporary,target);}
  finally{await rm(temporary,{force:true});}
}
async function readReceipt(root,path,{optional=false}={}){
  const file=resolve(root,path);let info;
  try{info=await lstat(file);}catch(error){if(optional&&error.code==='ENOENT')return null;throw error;}
  if(!info.isFile()||info.isSymbolicLink()||info.size>1024*1024||await realpath(file)!==resolve(file)||!within(await realpath(root),await realpath(file)))
    throw new Error('Invalid archive receipt file');
  const bytes=await readFile(file),text=bytes.toString('utf8');
  if(bytes.length>1024*1024||!Buffer.from(text,'utf8').equals(bytes))throw new Error('Invalid archive receipt bytes');
  return JSON.parse(text);
}
function preserveInputs(target,input){
  for(let [path,bytes]of input){
    path=normalizeEthereumProspectiveArchiveInputPath(path,bytes);
    if(target.has(path)&&!target.get(path).equals(bytes))throw new Error('Conflicting immutable ledger bytes: '+path);
    target.set(path,bytes);
  }
}
function assertPrefix(previous,current){
  for(const [path,bytes]of previous)if(path!=='manifest.json'&&(!current.has(path)||!bytes.equals(current.get(path))))
    throw new Error('Archive continuation removes or changes a retained file: '+path);
}
function inventory(files){return Object.fromEntries([...files].sort(([a],[b])=>a.localeCompare(b)).map(([path,bytes])=>[path,{bytes:bytes.length,sha256:sha(bytes)}]));}

/** Bootstrap and every restored remote archive must contain the committed
 * archive's exact immutable history. A denied/corrupt remote is never treated
 * as an absent branch. The reader command records that distinction. */
export async function restoreEthereumArchiveIntoRepository({repositoryRoot,now=()=>new Date().toISOString()}={}){
  const seed=await readEthereumArchiveDirectory(resolve(repositoryRoot,P.seed));
  const seedVerified=await verifyEthereumProspectiveArchive({files:seed});
  const remoteReceipt=await readReceipt(repositoryRoot,P.remoteReceipt,{optional:true});
  const remoteFiles=await readEthereumArchiveDirectory(resolve(repositoryRoot,P.remote),{optional:true});
  if(remoteFiles&&remoteReceipt?.status!=='restored')throw new Error('Remote archive bytes have no successful matching read receipt; seed fallback denied');
  if(remoteReceipt)validateEthereumArchiveRemoteReadReceipt({receipt:remoteReceipt,files:remoteFiles??new Map()});
  let selected=seed,basis='committed-seed';
  if(remoteReceipt){
    if(remoteReceipt.status==='restored'){
      if(!COMMIT.test(remoteReceipt.expectedHead))throw new Error('A restored remote requires its exact selected Git head');
      if(!remoteFiles)throw new Error('Successful remote archive receipt has no preserved bytes');
      selected=remoteFiles;
      assertPrefix(seed,selected);basis='verified-remote-branch';
    }else if(remoteReceipt.status==='absent'&&remoteReceipt.expectedHead===null){basis='explicitly-absent-remote-with-committed-seed';}
    else throw new Error('Unknown or failed remote archive receipt; seed fallback denied');
  }
  const verified=await verifyEthereumProspectiveArchive({files:selected});
  if(remoteReceipt?.status==='restored'&&remoteReceipt.manifestId!==verified.manifest.id)
    throw new Error('Remote archive receipt and selected manifest disagree');
  const restored=await restoreEthereumProspectiveArchive({files:selected});
  // Reject collisions in every destination before promoting any recovered file.
  for(const [path,files]of [[P.previous,selected],[P.prospective,restored.files],[P.outcomes,restored.outcomeFiles]]){
    const destination=await trustedLocation(repositoryRoot,path),existing=await readEthereumArchiveDirectory(destination,{optional:true});
    if(existing&&!identicalMaps(existing,files))throw new Error('Restore destination already contains different evidence: '+path);
  }
  await writeEthereumArchiveDirectory({repositoryRoot,path:P.previous,files:selected});
  await writeEthereumArchiveDirectory({repositoryRoot,path:P.prospective,files:restored.files});
  await writeEthereumArchiveDirectory({repositoryRoot,path:P.outcomes,files:restored.outcomeFiles});
  const input=await readEthereumCalibrationInputs({repositoryRoot});
  const receipt={schemaVersion:1,kind:'ethereum-prospective-archive-restore',status:'restored',completedAt:now(),basis,
    manifestId:verified.manifest.id,sequence:verified.manifest.sequence,seedManifestId:seedVerified.manifest.id,
    expectedRemoteHead:remoteReceipt?.expectedHead??null,archive:verified.receipt,restoration:restored.receipt,
    preservedRecordIds:input.records.map(value=>value.id),preservedObservationIds:input.observations.map(value=>value.id),
    originalIssuedAt:Object.fromEntries(input.records.map(value=>[value.id,value.issuedAt])),
    restoredFiles:inventory(restored.files),restoredOutcomeFiles:inventory(restored.outcomeFiles),
    existingRecordsChanged:false,archiveBytesRevalidated:true,productionPromoted:false,releaseAuthorized:false};
  await writeReceipt(repositoryRoot,P.restoreReceipt,receipt);return receipt;
}

export async function collectEthereumArchiveLogicalInputs({repositoryRoot,extraProspectiveDirectories=[]}={}){
  if(!Array.isArray(extraProspectiveDirectories)||extraProspectiveDirectories.some(path=>!safePath(path)))throw new Error('Unsafe bootstrap input paths');
  const files=new Map();
  for(const path of ['research-data/ethereum-prospective-ledger',P.prospective,...extraProspectiveDirectories]){
    const input=await readEthereumArchiveDirectory(resolve(repositoryRoot,path),{optional:path===P.prospective});
    if(input)preserveInputs(files,input);
  }
  for(const path of ['research-data/asset-outcome-ledger','build/asset-outcome-ledger',P.outcomes]){
    const input=await readEthereumArchiveDirectory(resolve(repositoryRoot,path),{optional:path.startsWith('build/')});
    if(!input)continue;
    const bytes=input.get('index.json');if(!bytes)throw new Error('Present outcome archive has no index');
    if(bytes.length>1024*1024)throw new Error('Outcome index exceeds unchanged 1 MiB limit');
    const index=validateAssetOutcomeIndex(JSON.parse(bytes.toString('utf8')));
    for(const entry of index.observations){
      const raw=input.get(entry.path);if(!raw)throw new Error('Missing indexed ETH outcome observation');
      const value=JSON.parse(raw.toString('utf8'));
      await verifyAssetOutcomeSnapshot(value);
      if(json(value)!==raw.toString('utf8')||json(assetOutcomeSnapshotEntry(value))!==json(entry))throw new Error('ETH outcome source bytes/index mismatch');
      if(value.symbol!=='ETHUSD')continue;
      preserveInputs(files,new Map([['outcome-observations/'+entry.id+'.json',raw]]));
    }
  }
  return files;
}

export async function appendEthereumArchiveFromRepository({repositoryRoot,source,now=()=>new Date().toISOString()}={}){
  const priorReceipt=await readReceipt(repositoryRoot,P.restoreReceipt),previous=await readEthereumArchiveDirectory(resolve(repositoryRoot,P.previous));
  const prior=await verifyEthereumProspectiveArchive({files:previous});
  if(priorReceipt.status!=='restored'||priorReceipt.manifestId!==prior.manifest.id)throw new Error('Append requires the exact successful previous restore');
  // This loader independently validates raw files again; an old restore
  // receipt never substitutes for validation of the current working bytes.
  const input=await readEthereumCalibrationInputs({repositoryRoot});
  const files=await collectEthereumArchiveLogicalInputs({repositoryRoot});
  for(const [path,bytes]of prior.logicalFiles){
    if(/^(indexes|receipts)\//.test(path))continue;
    if(!files.has(path)||!bytes.equals(files.get(path)))throw new Error('Current evidence omitted or changed a restored immutable archive input: '+path);
  }
  const next=await buildEthereumProspectiveArchive({files,previous,source,createdAt:now()});
  assertPrefix(previous,next.files);
  const restored=await restoreEthereumProspectiveArchive({files:next.files});
  const priorRestored=await restoreEthereumProspectiveArchive({files:previous});
  for(const [path,bytes]of priorRestored.files)if(path!=='index.json'&&(!restored.files.has(path)||!bytes.equals(restored.files.get(path))))
    throw new Error('Round-trip changed original prospective evidence: '+path);
  for(const [path,bytes]of priorRestored.outcomeFiles)if(path!=='index.json'&&(!restored.outcomeFiles.has(path)||!bytes.equals(restored.outcomeFiles.get(path))))
    throw new Error('Round-trip changed original independent outcome evidence: '+path);
  for(const record of input.records){
    const raw=restored.files.get('records/'+record.id+'.json');
    if(!raw||raw.toString('utf8')!==json(record))throw new Error('Round-trip lost an actual issued record');
  }
  // The predecessor's verified raw inventory determines novelty. Mutable
  // receipt counts cannot relabel an old record or observation as new.
  const priorRecordIds=new Set(prior.semantics.records.map(value=>value.id));
  const priorObservationIds=new Set([...prior.logicalFiles.keys()].filter(path=>/^(observations|outcome-observations)\//.test(path))
    .map(path=>path.slice(path.lastIndexOf('/')+1,-5)));
  const newRecordIds=input.records.map(value=>value.id).filter(id=>!priorRecordIds.has(id));
  const newObservationIds=input.observations.map(value=>value.id).filter(id=>!priorObservationIds.has(id));
  await writeEthereumArchiveDirectory({repositoryRoot,path:P.output,files:next.files});
  const receipt={schemaVersion:1,kind:'ethereum-prospective-archive-append',status:'appended-and-restored',completedAt:now(),source,
    previousManifestId:prior.manifest.id,manifestId:next.manifest.id,sequence:next.manifest.sequence,archive:next.receipt,
    restoration:restored.receipt,newRecordIds,newObservationIds,preservedRecordIds:input.records.map(value=>value.id),
    preservedObservationIds:input.observations.map(value=>value.id),originalIssuedAt:Object.fromEntries(input.records.map(value=>[value.id,value.issuedAt])),
    exactPreviousFilesRetained:true,roundTripOriginalBytesMatched:true,existingRecordsChanged:false,
    remotePublished:false,productionPromoted:false,releaseAuthorized:false};
  await writeReceipt(repositoryRoot,P.appendReceipt,receipt);return receipt;
}

async function sourceIdentity(root){
  const git=(...args)=>execFileSync('git',args,{cwd:root,encoding:'utf8',timeout:10000}).trim();
  const paths=['scripts/manage-ethereum-prospective-archive.mjs','scripts/ethereum-prospective-archive-core.mjs',
    'scripts/ethereum-prospective-archive-remote.mjs',
    'scripts/build-ethereum-prospective-calibration-readiness.mjs','scripts/ethereum-prospective-calibration-core.mjs',P.seed];
  if(git('status','--porcelain','--',...paths))throw new Error('Archive continuation requires committed source and seed archive');
  return {sourceCommit:git('rev-parse','HEAD'),sourceTree:git('rev-parse','HEAD^{tree}'),runId:process.env.GITHUB_RUN_ID??null};
}
async function main(){
  const root=fileURLToPath(new URL('..',import.meta.url)),[command,...extra]=process.argv.slice(2);
  if(extra.length||!['restore','append','verify'].includes(command))throw new Error('Use one fixed archive command: restore, append, verify');
  const source=await sourceIdentity(root);let result;
  if(command==='restore')result=await restoreEthereumArchiveIntoRepository({repositoryRoot:root});
  if(command==='append')result=await appendEthereumArchiveFromRepository({repositoryRoot:root,source});
  if(command==='verify'){
    const files=await readEthereumArchiveDirectory(resolve(root,P.output));
    const verified=await verifyEthereumProspectiveArchive({files}),restored=await restoreEthereumProspectiveArchive({files});
    result={schemaVersion:1,kind:'ethereum-prospective-archive-verification',status:'verified',source,completedAt:new Date().toISOString(),
      manifestId:verified.manifest.id,archive:verified.receipt,restoration:restored.receipt,networkRequests:0,
      remotePublished:false,productionPromoted:false,releaseAuthorized:false};
    await writeReceipt(root,P.verifyReceipt,result);
  }
  console.log('ETH_PROSPECTIVE_ARCHIVE_'+command.toUpperCase()+'_RECEIPT '+JSON.stringify(result));
}
if(process.argv[1]&&pathToFileURL(resolve(process.argv[1])).href===import.meta.url)await main();
