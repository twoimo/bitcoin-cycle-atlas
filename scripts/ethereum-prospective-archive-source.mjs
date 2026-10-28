import {constants} from 'node:fs';
import {open,lstat,readdir,realpath} from 'node:fs/promises';
import {resolve,relative,isAbsolute} from 'node:path';
import {createHash} from 'node:crypto';
import {canonicalForecastJson} from '../dist/forecast-records.js';
import {verifyEthereumProspectiveRecord,ethereumProspectiveIndexEntry} from '../dist/ethereum-prospective-dispatch.js';
import {verifyEthereumResearchSnapshot} from '../dist/ethereum-prospective-prices.js';
import {verifyAssetOutcomeSnapshot,assetOutcomeSnapshotEntry,assetOutcomeEvaluationEntry,validateAssetOutcomeIndex} from '../dist/asset-outcome-records.js';
import {ETH_PROSPECTIVE_ARCHIVE_POLICY,ETH_PROSPECTIVE_ARCHIVE_FORMAT,
  normalizeEthereumProspectiveArchiveInputPath} from './ethereum-prospective-archive-core.mjs';

/** This reader streams original objects from a finite, immutable filesystem
 * inventory. It retains descriptors and small index entries, never the full
 * collection of raw buffers, parsed forecasts, or parsed price observations.
 * Its opaque tokens are process-local capabilities, not serialized approval.
 * Every visit authenticates the whole pinned inventory again, and every object
 * read authenticates all physical aliases. No archive, time, model, or asset
 * filter can conceal malformed evidence. The legacy flat reader is unchanged. */
export const ETH_PROSPECTIVE_ARCHIVE_SOURCE_POLICY=Object.freeze({
  maximumPhysicalFiles:40000,maximumPhysicalBytes:2*1024*1024*1024,
  maximumInputDirectories:64,maximumFilesystemPath:240,
  maximumDeltaRecords:2000,maximumDeltaProspectiveObservations:500,
  ...ETH_PROSPECTIVE_ARCHIVE_POLICY,
  version:'eth-prospective-archive-source-1',
  legacyReaderLimitsUnchanged:true,retainedParsedObservationCollections:0,
  providerAuthenticity:false,calibrationPruning:false,
});
const P=ETH_PROSPECTIVE_ARCHIVE_SOURCE_POLICY,F=ETH_PROSPECTIVE_ARCHIVE_FORMAT;
const json=canonicalForecastJson,HEX=/^[a-f0-9]{64}$/,sessions=new WeakMap();
const sha=value=>createHash('sha256').update(value).digest('hex');
const blob=value=>createHash('sha1').update('blob '+value.length+'\0').update(value).digest('hex');
const identity=value=>({bytes:value.length,sha256:sha(value),gitBlobSha:blob(value)});
const equal=(a,b)=>json(a)===json(b);
const fail=message=>{throw new Error(message);};
const copy=value=>JSON.parse(json(value));
function frozen(value){
  if(value&&typeof value==='object'){for(const item of Object.values(value))frozen(item);Object.freeze(value);}
  return value;
}
function safePath(path){
  if(typeof path!=='string'||!path||path.length>P.maximumFilesystemPath||
    !/^[a-zA-Z0-9_-]+(?:[./][a-zA-Z0-9_-]+)*$/.test(path)||
    path.split('/').some(part=>part==='.'||part==='..')||path.includes('\\'))throw new TypeError('Unsafe archive source filesystem path');
  return path;
}
function within(root,path){const part=relative(root,path);return part!==''&&!part.startsWith('..')&&!isAbsolute(part);}
async function regularLocation(root,path,{directory=false}={}){
  safePath(path);
  const rootInfo=await lstat(root);
  if(!rootInfo.isDirectory()||rootInfo.isSymbolicLink()||await realpath(root)!==root)
    fail('Archive source repository must remain a regular directory without symlink ancestors');
  let current=root;
  const parts=path.split('/');
  for(let i=0;i<parts.length;i++){
    current=resolve(current,parts[i]);
    const stat=await lstat(current);
    if(stat.isSymbolicLink()||await realpath(current)!==current||!within(root,current))fail('Archive source symlink or path escape');
    if(i<parts.length-1||directory){if(!stat.isDirectory())fail('Archive source parent must be a regular directory');}
    else if(!stat.isFile())fail('Archive source evidence must be a regular file');
  }
  return current;
}
async function inventory(root,directories){
  const files=new Map();let totalBytes=0;
  for(const directory of directories){
    await regularLocation(root,directory,{directory:true});
    async function visit(path){
      const location=await regularLocation(root,path,{directory:true});
      const children=await readdir(location,{withFileTypes:true});
      for(const child of children.sort((a,b)=>a.name.localeCompare(b.name))){
        const physicalPath=safePath(path+'/'+child.name),full=resolve(root,physicalPath),stat=await lstat(full);
        if(stat.isSymbolicLink()||await realpath(full)!==full)fail('Archive source symlink or path escape');
        if(stat.isDirectory()){await visit(physicalPath);continue;}
        if(!stat.isFile())fail('Archive source evidence must be a regular file');
        if(files.has(physicalPath))fail('Overlapping archive source input directories');
        if(files.size>=P.maximumPhysicalFiles||stat.size>P.maximumObjectBytes||
          (totalBytes+=stat.size)>P.maximumPhysicalBytes)throw new RangeError('Archive source physical byte or file budget exhausted');
        files.set(physicalPath,{bytes:stat.size,directory,path:physicalPath.slice(directory.length+1)});
      }
    }
    await visit(directory);
  }
  return files;
}
/** Bounded reads use a no-follow file descriptor and verify the file and its
 * parents on both sides of the read. A growing file cannot allocate unbounded
 * readFile memory before its limit is checked. */
async function readPhysical(state,path,maximumBytes=P.maximumObjectBytes){
  const listed=state.inventory.get(path);
  if(!listed)fail('Missing archive source file '+path);
  const full=await regularLocation(state.root,path),before=await lstat(full);
  if(before.size>maximumBytes||before.size!==listed.bytes)fail('Archive source byte limit or inventory changed '+path);
  const handle=await open(full,constants.O_RDONLY|constants.O_NOFOLLOW);
  let value;
  try{
    const start=await handle.stat();
    if(!start.isFile()||start.ino!==before.ino||start.dev!==before.dev||start.size!==before.size)
      fail('Archive source changed while opening '+path);
    const chunks=[];let length=0;
    while(true){
      const chunk=Buffer.alloc(Math.min(65536,maximumBytes-length+1));
      const {bytesRead}=await handle.read(chunk,0,chunk.length,null);
      if(!bytesRead)break;
      length+=bytesRead;if(length>maximumBytes)fail('Archive source byte limit exceeded while reading '+path);
      chunks.push(chunk.subarray(0,bytesRead));
    }
    const end=await handle.stat();
    if(end.ino!==start.ino||end.dev!==start.dev||end.size!==start.size||end.mtimeMs!==start.mtimeMs||end.ctimeMs!==start.ctimeMs||length!==start.size)
      fail('Archive source changed during read '+path);
    value=Buffer.concat(chunks,length);
  }finally{await handle.close();}
  await regularLocation(state.root,path);
  const after=await lstat(full);
  if(after.ino!==before.ino||after.dev!==before.dev||after.size!==before.size||after.mtimeMs!==before.mtimeMs||after.ctimeMs!==before.ctimeMs)
    fail('Archive source changed after read '+path);
  const current=identity(value),expected=state.inputFiles.get(path);
  if(expected&&!equal(current,expected))fail('Archive source raw-byte or Git-blob mismatch '+path);
  if(!expected)state.inputFiles.set(path,current);
  return value;
}
function addLogical(state,entry,physicalPath,{archivePageIndex=null,sourceKind='archive'}={}){
  F.checkDescriptor(entry);
  const existing=state.logical.get(entry.path);
  if(existing){
    if(!equal(existing.entry,entry))fail('Immutable archive source path conflict '+entry.path);
    if(!existing.aliases.includes(physicalPath))existing.aliases.push(physicalPath);
    if(archivePageIndex!==null&&existing.archivePageIndex!==archivePageIndex)fail('Duplicate archive source logical path');
    return;
  }
  state.logical.set(entry.path,{entry:copy(entry),aliases:[physicalPath],archivePageIndex,sourceKind});
}
async function readLogical(state,path){
  const item=state.logical.get(path);if(!item)fail('Missing archive logical file '+path);
  let result;
  for(const alias of item.aliases){
    const bytes=await readPhysical(state,alias,item.entry.bytes);
    if(!equal(identity(bytes),{bytes:item.entry.bytes,sha256:item.entry.sha256,gitBlobSha:item.entry.gitBlobSha}))
      fail('Archive raw-byte or Git-blob mismatch '+path);
    if(result&&!result.equals(bytes))fail('Conflicting archive logical aliases '+path);
    result=bytes;
  }
  return result;
}
async function loadArchive(state){
  const dir=state.archivePath,used=new Set(['manifest.json']);let metadataBytes=0;
  async function metadata(path,maximumBytes){
    const bytes=await readPhysical(state,dir+'/'+path,maximumBytes);
    if(!state.metadata.has(path)){state.metadata.add(path);metadataBytes+=bytes.length;}
    if(metadataBytes>P.maximumMetadataTotalBytes)throw new RangeError('Archive metadata-byte budget exceeded');
    return F.parse(bytes,path,{maximumBytes});
  }
  const manifest=await metadata('manifest.json',P.maximumManifestBytes);F.checkManifest(manifest);
  const chain=[],seen=new Set();let current=manifest;
  while(current){
    if(seen.has(current.id)||chain.length>=P.maximumHistory)fail('Invalid or cyclic archive history');
    seen.add(current.id);chain.push(current);
    const path='manifests/'+current.id+'.json',preserved=await metadata(path,P.maximumManifestBytes);
    F.checkManifest(preserved);used.add(path);
    if(!equal(preserved,current))fail('Archive manifest alias mismatch');
    if(current.previousManifestId===null){if(current.sequence!==1)fail('Archive history is incomplete');break;}
    const previous=await metadata('manifests/'+current.previousManifestId+'.json',P.maximumManifestBytes);F.checkManifest(previous);
    if(previous.id!==current.previousManifestId||previous.sequence!==current.sequence-1||previous.createdAt>current.createdAt||
      previous.pages.length>current.pages.length||!equal(current.pages.slice(0,previous.pages.length),previous.pages))
      fail('Archive manifest is not an exact append-only descendant');
    current=previous;
  }
  const counts=F.initialCounts(),objects=new Set(),prefixCounts=[copy(counts)];
  for(let pageIndex=0;pageIndex<manifest.pages.length;pageIndex++){
    const expected=manifest.pages[pageIndex],page=await metadata(expected.path,P.maximumPageBytes);
    F.keys(page,['id','schemaVersion','kind','entries'],'archive page');F.addressed(page,'ethereum-prospective-archive-page');
    if(!Array.isArray(page.entries)||!page.entries.length||page.entries.length>P.maximumEntriesPerPage||!equal(F.metadataDescriptor(page),expected))
      fail('Archive page descriptor mismatch');
    used.add(expected.path);let previousPath='';
    for(const entry of page.entries){
      F.checkDescriptor(entry);
      if(entry.path<=previousPath||state.logical.has(entry.path))fail('Duplicate or unordered archive logical file');
      previousPath=entry.path;used.add(entry.objectPath);
      const physical=state.inventory.get(dir+'/'+entry.objectPath);
      if(!physical||physical.bytes!==entry.bytes)fail('Archive raw-byte or Git-blob mismatch '+entry.path);
      addLogical(state,entry,dir+'/'+entry.objectPath,{archivePageIndex:pageIndex});
      F.addCounts(counts,entry,objects);
    }
    prefixCounts.push(copy(counts));
  }
  for(const ancestor of chain)if(!equal(ancestor.counts,prefixCounts[ancestor.pages.length]))fail('Archive manifest counts mismatch');
  const physical=[...state.inventory].filter(([,row])=>row.directory===dir).map(([,row])=>row.path);
  if(physical.length!==used.size||physical.some(path=>!used.has(path)))fail('Unlisted archive transport file');
  const limits=[];
  for(const ancestor of [...chain].reverse())while(limits.length<ancestor.pages.length)limits.push(ancestor.pages.length);
  Object.assign(state,{manifest,chain,metadataBytes,firstGenerationPageLimits:limits});
}
async function loadProspective(state,directory){
  const rows=[...state.inventory].filter(([,row])=>row.directory===directory);
  if(!rows.some(([,row])=>row.path==='index.json'))fail('Present prospective source directory has no index');
  if(rows.filter(([,row])=>row.path.startsWith('records/')).length>P.maximumDeltaRecords||
    rows.filter(([,row])=>row.path.startsWith('observations/')).length>P.maximumDeltaProspectiveObservations)
    throw new RangeError('Current prospective delta exceeds unchanged per-directory bounds');
  for(const [path,row]of rows){
    const bytes=await readPhysical(state,path,row.path==='index.json'?P.maximumActiveIndexBytes:P.maximumObjectBytes);
    const logical=normalizeEthereumProspectiveArchiveInputPath(row.path,bytes);
    addLogical(state,F.descriptor(logical,bytes),path,{sourceKind:'prospective-delta'});
  }
  const currentIndex=F.parse(await readPhysical(state,directory+'/index.json',P.maximumActiveIndexBytes),directory+'/index.json',{maximumBytes:P.maximumActiveIndexBytes});
  if(currentIndex.schemaVersion!==1||currentIndex.kind!=='ethereum-prospective-index'||!Array.isArray(currentIndex.entries)||currentIndex.entries.length>P.maximumActiveRecords)
    fail('Invalid current prospective delta index');
  const indexedPaths=new Set(currentIndex.entries.map(entry=>entry.recordPath));
  for(const [,row]of rows)if(row.path.startsWith('records/')&&!indexedPaths.has(row.path))
    fail('Unindexed current prospective delta record '+row.path);
}
async function loadOutcomes(state,directory){
  const indexPath=directory+'/index.json';
  const index=validateAssetOutcomeIndex(F.parse(await readPhysical(state,indexPath,P.maximumActiveIndexBytes),indexPath,{canonical:false,maximumBytes:P.maximumActiveIndexBytes}));
  const listed=new Set(['index.json']);
  for(const entry of index.observations){
    listed.add(entry.path);
    const physicalPath=directory+'/'+entry.path,bytes=await readPhysical(state,physicalPath),value=F.parse(bytes,physicalPath);
    // Validate foreign and future metadata and complete original source bytes
    // before deciding whether this snapshot belongs in ETH calibration.
    await verifyAssetOutcomeSnapshot(value);
    if(!equal(assetOutcomeSnapshotEntry(value),entry))fail('Outcome source index metadata mismatch');
    state.outcomeInputs.push({physicalPath,entry:copy(entry)});
    if(value.symbol==='ETHUSD')addLogical(state,F.descriptor('outcome-observations/'+value.id+'.json',bytes),physicalPath,{sourceKind:'outcome-delta'});
  }
  for(const entry of index.evaluations){
    listed.add(entry.path);
    const path=directory+'/'+entry.path,value=F.parse(await readPhysical(state,path),path);
    F.addressed(value,'atlas-asset-outcome-evaluation');
    if(!equal(assetOutcomeEvaluationEntry(value),entry)||!Array.isArray(value.observationSnapshotIds)||
      value.observationSnapshotIds.some(id=>!index.observations.some(observation=>observation.id===id)))
      fail('Outcome evaluation source index metadata mismatch');
  }
  for(const [path,row]of state.inventory){
    if(row.directory!==directory||listed.has(row.path))continue;
    if(!/^receipts\/[a-f0-9]{64}\.json$/.test(row.path))fail('Unlisted outcome source file '+row.path);
    const value=F.parse(await readPhysical(state,path),path,{canonical:false});
    if(!value||typeof value!=='object')fail('Invalid outcome source receipt');
  }
}
function checkReference(state,from,to){
  const origin=state.logical.get(from),target=state.logical.get(to);
  if(!target)fail('Missing archived immutable reference '+from+' -> '+to);
  if(origin.archivePageIndex!==null&&(target.archivePageIndex===null||
    target.archivePageIndex>=state.firstGenerationPageLimits[origin.archivePageIndex]))
    fail('Archive ancestor contains an unresolved immutable reference '+from+' -> '+to);
}
async function parseLogical(state,path){
  const type=F.category(path),value=await readLogical(state,path);
  return F.parse(value,path,{canonical:type!=='receipts',maximumBytes:type==='records'?P.maximumRecordBytes:type==='indexes'?P.maximumActiveIndexBytes:P.maximumObjectBytes});
}
async function validateLogical(state){
  const recordEntries=new Map(),observationPaths=new Map(),runs=new Map(),snapshots=new Map();
  const paths=[...state.logical.keys()].sort();
  for(const path of paths){
    const type=F.category(path),bytes=await readLogical(state,path),id=path.slice(path.lastIndexOf('/')+1,-5);
    if(type==='raw'){
      const digest=path.match(/^raw\/coinbase-tail-([a-f0-9]{64})\./)[1],text=bytes.toString('utf8');
      if(!Buffer.from(text,'utf8').equals(bytes))fail('Non-UTF-8 raw Coinbase evidence');
      if(path.endsWith('.json')){if(sha(bytes)!==digest)fail('Raw Coinbase body identity mismatch');}
      else if(!text||Buffer.from(text,'base64').toString('base64')!==text||sha(Buffer.from(text,'base64'))!==digest)
        fail('Raw Coinbase base64 body identity mismatch');
      continue;
    }
    const item=F.parse(bytes,path,{canonical:type!=='receipts',maximumBytes:type==='records'?P.maximumRecordBytes:type==='indexes'?P.maximumActiveIndexBytes:P.maximumObjectBytes});
    if(type==='indexes'||type==='receipts'){if(sha(bytes)!==id)fail('Archive checkpoint byte identity mismatch');continue;}
    if(type==='records'){
      if(item.id!==id)fail('Archived record filename mismatch');
      const snapshotPath='snapshots/'+item.snapshotId+'.json';checkReference(state,path,snapshotPath);
      const snapshot=await parseLogical(state,snapshotPath);await verifyEthereumProspectiveRecord(item,snapshot);
      if(runs.has(item.runKey))fail('Conflicting archived records for one economic run');
      runs.set(item.runKey,id);recordEntries.set(id,ethereumProspectiveIndexEntry(item));
    }else if(type==='snapshots'||type==='observations'){
      if(item.id!==id)fail('Archived snapshot filename mismatch');
      await verifyEthereumResearchSnapshot(item);
      const descriptor=state.logical.get(path).entry;
      if(snapshots.has(id)&&snapshots.get(id)!==descriptor.sha256)fail('Conflicting archived research snapshot');
      snapshots.set(id,descriptor.sha256);if(type==='observations')observationPaths.set(id,path);
    }else if(type==='outcome-observations'){
      if(item.id!==id||item.symbol!=='ETHUSD')fail('Only exact ETH outcome observation identities may enter the archive');
      await verifyAssetOutcomeSnapshot(item);
      if(observationPaths.has(id)&&observationPaths.get(id)!==path)fail('Conflicting archived observation identity');
      observationPaths.set(id,path);
    }else if(type==='evaluations'){
      F.addressed(item,'ethereum-prospective-evaluation');if(item.id!==id)fail('Archived evaluation filename mismatch');
    }else if(sha(Buffer.from(json(item)))!==id)fail('Archived acquisition or issuance identity mismatch');
  }
  for(const path of paths.filter(path=>path.startsWith('indexes/'))){
    const item=await parseLogical(state,path);
    if(item.schemaVersion!==1||item.kind!=='ethereum-prospective-index'||!Array.isArray(item.entries)||item.entries.length>P.maximumActiveRecords)
      fail('Invalid archived prospective index checkpoint');
    const ids=new Set(),indexRuns=new Set();
    for(const entry of item.entries){
      if(ids.has(entry.id)||indexRuns.has(entry.runKey))fail('Duplicate archived prospective index entry');
      ids.add(entry.id);indexRuns.add(entry.runKey);
      if(!recordEntries.has(entry.id)||!equal(recordEntries.get(entry.id),entry))fail('Archived index metadata mismatch');
      checkReference(state,path,'records/'+entry.id+'.json');
    }
  }
  state.recordEntries=recordEntries;state.observationPaths=observationPaths;
}
function descriptorInfo(item){
  const path=item.entry.path,category=F.category(path),candidate=path.slice(path.lastIndexOf('/')+1,-5);
  return {...copy(item.entry),logicalPath:path,kind:category,category,sourceKind:item.sourceKind,
    id:HEX.test(candidate)?candidate:null,archivePageIndex:item.archivePageIndex};
}
function issueToken(state){
  const logicalDescriptors=[...state.logical.values()].map(descriptorInfo).sort((a,b)=>a.path.localeCompare(b.path));
  const overlayFiles=[...state.inputFiles].filter(([path])=>!path.startsWith(state.archivePath+'/'));
  const sourceBody={version:P.version,archiveManifestId:state.manifest.id,
    logicalFiles:logicalDescriptors.map(({path,bytes,sha256,gitBlobSha})=>({path,bytes,sha256,gitBlobSha})),
    overlayFiles:state.ancestorView?[]:overlayFiles.map(([path,descriptor])=>({path,...descriptor})).sort((a,b)=>a.path.localeCompare(b.path))};
  const recordIds=[...state.recordEntries.keys()].sort(),observationIds=[...state.observationPaths.keys()].sort();
  const inputFiles=Object.fromEntries([...state.inputFiles].sort(([a],[b])=>a.localeCompare(b)));
  state.info=frozen(copy({id:sha(Buffer.from(json(sourceBody))),schemaVersion:1,kind:'ethereum-prospective-archive-source',
    archiveManifestId:state.manifest.id,archiveSequence:state.manifest.sequence,archivePath:state.archivePath,
    backingArchiveManifestId:state.chain[0].id,retainedAncestorView:state.ancestorView===true,
    physicalInventoryScope:'complete-current-backing-source',
    archiveAncestors:state.chain.filter(item=>item.sequence<=state.manifest.sequence).map(item=>({id:item.id,sequence:item.sequence,pages:item.pages.length,createdAt:item.createdAt})),
    archiveManifest:state.manifest,
    records:recordIds.length,observations:observationIds.length,recordIds,observationIds,obsIds:observationIds,
    recordEntries:[...state.recordEntries.values()].sort((a,b)=>a.id.localeCompare(b.id)),
    logicalDescriptors,inputFiles,
    archiveFiles:Object.fromEntries([...state.inputFiles].filter(([path])=>path.startsWith(state.archivePath+'/')).map(([path,value])=>[path.slice(state.archivePath.length+1),value])),
    overlayInputFiles:state.ancestorView?0:overlayFiles.length,
    overlayDirectories:state.ancestorView?[]:[...state.prospectivePaths,...state.outcomePaths],
    independentForeignObservations:state.ancestorView?0:state.outcomeInputs.filter(row=>row.entry.symbol!=='ETHUSD').length,
    foreignObservationIds:state.ancestorView?[]:[...new Set(state.outcomeInputs.filter(row=>row.entry.symbol!=='ETHUSD').map(row=>row.entry.id))].sort(),
    metadataBytes:state.metadataBytes,limits:P,allRawBytesVerified:true,allImmutableRecordsVerified:true,
    allAncestorReferenceClosuresVerified:true,completeInventoryVerified:true,
    retainedParsedObservationCollections:0,providerAuthenticity:false,calibrationPruning:false,
    productionPromoted:false,releaseAuthorized:false}));
  const token=Object.freeze(Object.create(null));sessions.set(token,state);return token;
}
function session(source){const state=sessions.get(source);if(!state)throw new TypeError('An opaque verified archive source is required');return state;}
async function assertStable(state){
  const current=await inventory(state.root,state.directories);
  if(current.size!==state.inventory.size||[...current].some(([path,row])=>!state.inventory.has(path)||state.inventory.get(path).bytes!==row.bytes))
    fail('Archive source complete physical inventory changed');
  for(const path of state.inputFiles.keys())await readPhysical(state,path);
}

export async function openEthereumProspectiveArchiveSource({repositoryRoot,archivePath,prospectivePaths=[],outcomePaths=[],expectedManifestId=null}={}){
  if(typeof repositoryRoot!=='string'||!isAbsolute(repositoryRoot))throw new TypeError('Absolute repository root required');
  const root=resolve(repositoryRoot);
  if(await realpath(root)!==root)fail('Archive source repository ancestors must not contain symlinks');
  safePath(archivePath);
  if(!Array.isArray(prospectivePaths)||!Array.isArray(outcomePaths))throw new TypeError('Bounded archive source directory lists required');
  const directories=[archivePath,...prospectivePaths,...outcomePaths].map(safePath);
  if(directories.length>P.maximumInputDirectories||new Set(directories).size!==directories.length||directories.some((a,i)=>directories.some((b,j)=>i!==j&&b.startsWith(a+'/'))))
    throw new TypeError('Unique non-overlapping bounded archive source directories required');
  if(expectedManifestId!==null&&!HEX.test(expectedManifestId))throw new TypeError('Exact expected archive manifest identity required');
  const state={root,archivePath,prospectivePaths:[...prospectivePaths],outcomePaths:[...outcomePaths],directories,
    inventory:await inventory(root,directories),inputFiles:new Map(),logical:new Map(),metadata:new Set(),outcomeInputs:[]};
  await loadArchive(state);
  if(expectedManifestId!==null&&state.manifest.id!==expectedManifestId)fail('Archive source expected manifest identity mismatch');
  for(const path of prospectivePaths)await loadProspective(state,path);
  for(const path of outcomePaths)await loadOutcomes(state,path);
  await validateLogical(state);
  if(state.inputFiles.size!==state.inventory.size)fail('Archive source contains unread physical evidence');
  // Recheck after asynchronous semantic validation, before issuing a token.
  await assertStable(state);
  return issueToken(state);
}

export function ethereumProspectiveArchiveSourceInfo(source){return frozen(copy(session(source).info));}

export async function readEthereumProspectiveArchiveFile(source,logicalPath){
  const state=session(source);F.category(logicalPath);
  return readLogical(state,logicalPath);
}

export async function visitEthereumProspectiveArchiveRecords(source,visitor){
  const state=session(source);if(typeof visitor!=='function')throw new TypeError('Archive record visitor required');
  await assertStable(state);
  for(const id of [...state.recordEntries.keys()].sort()){
    const path='records/'+id+'.json',record=await parseLogical(state,path),snapshot=await parseLogical(state,'snapshots/'+record.snapshotId+'.json');
    await verifyEthereumProspectiveRecord(record,snapshot);
    await visitor(record,snapshot,frozen(descriptorInfo(state.logical.get(path))));
  }
  await assertStable(state);
}

export async function visitEthereumProspectiveArchiveObservations(source,visitor){
  const state=session(source);if(typeof visitor!=='function')throw new TypeError('Archive observation visitor required');
  await assertStable(state);
  // Foreign assets are deliberately checked on every pass before ETH routing.
  for(const row of state.outcomeInputs){
    const value=F.parse(await readPhysical(state,row.physicalPath),row.physicalPath);
    await verifyAssetOutcomeSnapshot(value);
    if(!equal(assetOutcomeSnapshotEntry(value),row.entry))fail('Outcome source index metadata mismatch');
  }
  for(const id of [...state.observationPaths.keys()].sort()){
    const path=state.observationPaths.get(id),snapshot=await parseLogical(state,path);
    if(path.startsWith('outcome-observations/'))await verifyAssetOutcomeSnapshot(snapshot);
    else await verifyEthereumResearchSnapshot(snapshot);
    await visitor(snapshot,frozen(descriptorInfo(state.logical.get(path))));
  }
  await assertStable(state);
}

/** Select only the complete exact prefix of a retained immutable manifest.
 * Current overlays cannot be relabeled as historical inputs. The full current
 * source is reauthenticated before an ancestor capability is issued. */
export async function openEthereumProspectiveArchiveSourceAtManifest(source,manifestId){
  const current=session(source);if(!HEX.test(manifestId))throw new TypeError('Exact ancestor manifest identity required');
  await assertStable(current);
  const manifest=current.chain.find(item=>item.id===manifestId);
  if(!manifest)fail('Archive source does not retain the requested ancestor manifest');
  const logical=new Map([...current.logical].filter(([,item])=>item.archivePageIndex!==null&&item.archivePageIndex<manifest.pages.length)
    .map(([path,item])=>[path,{...item,entry:copy(item.entry),aliases:[current.archivePath+'/'+item.entry.objectPath],sourceKind:'archive'}]));
  const state={...current,manifest,logical,outcomeInputs:[],prospectivePaths:[],outcomePaths:[],ancestorView:true};
  await validateLogical(state);await assertStable(state);
  return issueToken(state);
}
