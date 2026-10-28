import {createHash} from 'node:crypto';
import {canonicalForecastJson} from '../dist/forecast-records.js';
import {normalizeForecastTimestamp} from '../dist/forecast-information-time.js';
import {verifyEthereumProspectiveRecord,ethereumProspectiveIndexEntry} from '../dist/ethereum-prospective-dispatch.js';
import {verifyEthereumResearchSnapshot} from '../dist/ethereum-prospective-prices.js';
import {verifyAssetOutcomeSnapshot,assetOutcomeSnapshotEntry,validateAssetOutcomeIndex} from '../dist/asset-outcome-records.js';

/** An offline byte archive, not a calibration cache or provider attestation.
 * Each new manifest preserves every ancestor, page and original immutable file.
 * Finite storage and active-reader bounds are explicit; no selected evidence is
 * pruned to fit them. The filesystem caller separately enforces regular files,
 * symlink rejection, bounded reads and atomic publication. */
export const ETH_PROSPECTIVE_ARCHIVE_POLICY=Object.freeze({
  version:'eth-prospective-archive-1',maximumPages:4096,maximumEntriesPerPage:128,
  maximumManifestBytes:1024*1024,maximumPageBytes:1024*1024,
  maximumObjectBytes:8*1024*1024,maximumRecordBytes:2*1024*1024,
  maximumObjectTotalBytes:2*1024*1024*1024,maximumHistory:4096,
  maximumMetadataTotalBytes:64*1024*1024,
  maximumActiveRecords:2000,maximumActiveObservations:500,maximumActiveIndexBytes:1024*1024,
  missingEvidenceReplacement:false,calibrationPruning:false,providerAuthenticity:false,
});
const P=ETH_PROSPECTIVE_ARCHIVE_POLICY,json=canonicalForecastJson,HEX=/^[a-f0-9]{64}$/,COMMIT=/^[a-f0-9]{40}$/;
const bytes=value=>Buffer.from(json(value)+'\n','utf8');
const sha=value=>createHash('sha256').update(value).digest('hex');
const objectHash=value=>sha(Buffer.from(json(value),'utf8'));
const gitBlob=value=>createHash('sha1').update('blob '+value.length+'\0').update(value).digest('hex');
const categories=['records','snapshots','observations','outcome-observations','acquisitions','evaluations','issuances','raw','indexes','receipts'];
const mutable=new Set(['index.json','receipt.json','files.json','replay-receipt.json','replay-files.json','acquisition.json']);
const fail=message=>{throw new Error(message);};
function keys(value,expected,label){
  if(!value||Object.getPrototypeOf(value)!==Object.prototype||Object.keys(value).sort().join(',')!==[...expected].sort().join(','))
    throw new TypeError('Unexpected '+label+' fields');
}
function timestamp(value,label){
  if(normalizeForecastTimestamp(value,label)!==value)throw new TypeError(label+' must be a canonical UTC timestamp');
  return value;
}
function sourceIdentity(source){
  keys(source,['sourceCommit','sourceTree','runId'],'archive source');
  if(!COMMIT.test(source.sourceCommit)||!COMMIT.test(source.sourceTree)||
    source.runId!==null&&(typeof source.runId!=='string'||!/^\d{1,24}$/.test(source.runId)))
    throw new TypeError('Exact committed archive source identity required');
  return JSON.parse(json(source));
}
function safePath(path){
  if(typeof path!=='string'||path.length>200||!path||path.includes('\\')||path.startsWith('/')||
    path.split('/').some(part=>!part||part==='.'||part==='..')||/[\x00-\x20\x7f]/.test(path))
    throw new TypeError('Unsafe archive path');
  return path;
}
function category(path,{input=false}={}){
  safePath(path);
  if(input&&mutable.has(path))return path==='index.json'?'indexes':'receipts';
  if(input&&path==='raw/coinbase-tail.json')return 'raw';
  if(/^(records|snapshots|observations|outcome-observations|acquisitions|evaluations|issuances|indexes|receipts)\/[a-f0-9]{64}\.json$/.test(path))return path.split('/')[0];
  if(/^raw\/coinbase-tail-[a-f0-9]{64}\.(?:json|base64\.txt)$/.test(path))return 'raw';
  throw new TypeError('Unexpected archive logical path '+path);
}
/** Old committed collectors used two fixed acquisition names. Preserve their
 * original bytes in addressed checkpoints/body objects rather than treating
 * the filenames as overwriteable archive slots. Filesystem adapters use this
 * same explicit mapping; it does not widen immutable record path acceptance. */
export function normalizeEthereumProspectiveArchiveInputPath(path,value){
  const type=category(path,{input:true});
  if((!Buffer.isBuffer(value)&&!(value instanceof Uint8Array))||value.byteLength>P.maximumObjectBytes)
    throw new TypeError('Bounded original archive input bytes required');
  if(path==='raw/coinbase-tail.json')return 'raw/coinbase-tail-'+sha(value)+'.json';
  if(mutable.has(path))return (type==='indexes'?'indexes/':'receipts/')+sha(value)+'.json';
  return path;
}
function captureMap(input,label){
  if(!(input instanceof Map)||input.size>P.maximumPages*P.maximumEntriesPerPage+P.maximumHistory+P.maximumPages+1)
    throw new TypeError('Bounded '+label+' file Map required');
  const captured=new Map();let totalBytes=0;
  for(const [path,value]of input){
    safePath(path);
    if(!Buffer.isBuffer(value)&&!(value instanceof Uint8Array))throw new TypeError(label+' bytes required');
    if(value.byteLength>P.maximumObjectBytes)throw new RangeError('Archive file exceeds byte limit '+path);
    totalBytes+=value.byteLength;
    if(totalBytes>P.maximumObjectTotalBytes+P.maximumMetadataTotalBytes)throw new RangeError('Archive input byte budget exceeded');
    captured.set(path,Buffer.from(value));
  }
  return captured;
}
function parse(input,path,{canonical=true,maximumBytes=P.maximumObjectBytes}={}){
  if(!Buffer.isBuffer(input)||input.length>maximumBytes)throw new RangeError('Archive bytes missing or too large '+path);
  const text=input.toString('utf8');
  if(!Buffer.from(text,'utf8').equals(input))throw new TypeError('Non-UTF-8 archive evidence '+path);
  const value=JSON.parse(text);
  if(canonical&&!bytes(value).equals(input))throw new Error('Noncanonical archive evidence '+path);
  return value;
}
function descriptor(path,value){return {path,objectPath:'objects/'+sha(value)+'.blob',bytes:value.length,sha256:sha(value),gitBlobSha:gitBlob(value)};}
function checkDescriptor(entry){
  keys(entry,['path','objectPath','bytes','sha256','gitBlobSha'],'archive entry');
  const type=category(entry.path),maximum=type==='records'?P.maximumRecordBytes:type==='indexes'?P.maximumActiveIndexBytes:P.maximumObjectBytes;
  if(!HEX.test(entry.sha256)||!COMMIT.test(entry.gitBlobSha)||entry.objectPath!=='objects/'+entry.sha256+'.blob'||
    !Number.isSafeInteger(entry.bytes)||entry.bytes<1||entry.bytes>maximum)throw new Error('Invalid archive object descriptor');
}
function signed(body){return {id:objectHash(body),...body};}
function addressed(value,kind){
  if(value.kind!==kind||value.schemaVersion!==1||!HEX.test(value.id))throw new TypeError('Invalid '+kind);
  const {id,...body}=value;
  if(objectHash(body)!==id)throw new Error(kind+' identity mismatch');
}
function initialCounts(){return {files:0,objects:0,objectBytes:0,...Object.fromEntries(categories.map(key=>[key,0]))};}
function addCounts(counts,entry,seenObjects){
  counts.files++;counts[category(entry.path)]++;
  if(!seenObjects.has(entry.objectPath)){seenObjects.add(entry.objectPath);counts.objects++;counts.objectBytes+=entry.bytes;}
  if(counts.objectBytes>P.maximumObjectTotalBytes)throw new RangeError('Archive total raw-byte budget exceeded');
}
function checkManifest(value){
  keys(value,['id','schemaVersion','kind','policyVersion','sequence','previousManifestId','createdAt','source','pages','counts'],'archive manifest');
  addressed(value,'ethereum-prospective-archive-manifest');
  if(value.policyVersion!==P.version||!Number.isSafeInteger(value.sequence)||value.sequence<1||value.sequence>P.maximumHistory||
    value.previousManifestId!==null&&!HEX.test(value.previousManifestId)||!Array.isArray(value.pages)||value.pages.length>P.maximumPages)
    throw new TypeError('Invalid archive manifest policy or bounds');
  timestamp(value.createdAt,'archive createdAt');sourceIdentity(value.source);
  for(const page of value.pages){
    keys(page,['id','path','bytes','sha256','gitBlobSha','entries'],'archive page descriptor');
    if(!HEX.test(page.id)||page.path!=='pages/'+page.id+'.json'||!HEX.test(page.sha256)||!COMMIT.test(page.gitBlobSha)||
      !Number.isSafeInteger(page.bytes)||page.bytes<1||page.bytes>P.maximumPageBytes||
      !Number.isSafeInteger(page.entries)||page.entries<1||page.entries>P.maximumEntriesPerPage)
      throw new TypeError('Invalid archive page descriptor');
  }
  if(new Set(value.pages.map(page=>page.path)).size!==value.pages.length)throw new Error('Duplicate archive page');
}
function metadataDescriptor(value){
  const encoded=bytes(value);
  return {id:value.id,path:'pages/'+value.id+'.json',bytes:encoded.length,sha256:sha(encoded),gitBlobSha:gitBlob(encoded),entries:value.entries.length};
}
async function validateLogicalFiles(logicalFiles){
  const values=new Map(),records=[],snapshots=new Map(),observations=new Set(),runs=new Set(),outcomes=[],references=[];
  for(const [path,value]of logicalFiles){
    const type=category(path);
    if(type==='raw'){
      const digest=path.match(/^raw\/coinbase-tail-([a-f0-9]{64})\./)[1];
      if(path.endsWith('.json')){
        if(sha(value)!==digest)fail('Raw Coinbase body identity mismatch');
        // The collector preserves complete failed HTTP bodies under this
        // historical filename too. HTML and malformed JSON are truthful raw
        // failure evidence, never validated market observations.
        if(!Buffer.from(value.toString('utf8'),'utf8').equals(value))fail('Non-UTF-8 raw Coinbase body requires its base64 receipt');
      }
      else{
        const text=value.toString('utf8');
        if(!Buffer.from(text,'utf8').equals(value)||!text||Buffer.from(text,'base64').toString('base64')!==text||sha(Buffer.from(text,'base64'))!==digest)
          fail('Raw Coinbase base64 body identity mismatch');
      }
      continue;
    }
    // Receipt checkpoints are exact byte-addressed historical documents, not
    // trusted routing or forecast inputs. Legacy receipt formatting is kept;
    // typed records, observations, acquisitions and indexes remain canonical.
    const item=parse(value,path,{canonical:type!=='receipts',maximumBytes:type==='records'?P.maximumRecordBytes:type==='indexes'?P.maximumActiveIndexBytes:P.maximumObjectBytes});
    values.set(path,item);
    const id=path.slice(path.lastIndexOf('/')+1,-5);
    if(type==='indexes'||type==='receipts'){
      if(sha(value)!==id)fail('Archive checkpoint byte identity mismatch');
      continue;
    }
    if(type==='records'){
      if(item.id!==id)fail('Archived record filename mismatch');
      records.push(item);
    }else if(type==='snapshots'||type==='observations'){
      if(item.id!==id)fail('Archived snapshot filename mismatch');
      await verifyEthereumResearchSnapshot(item);
      if(snapshots.has(id)&&json(snapshots.get(id))!==json(item))fail('Conflicting archived research snapshot');
      snapshots.set(id,item);if(type==='observations')observations.add(id);
    }else if(type==='outcome-observations'){
      if(item.id!==id||item.symbol!=='ETHUSD')fail('Only exact ETH outcome observation identities may enter the archive');
      await verifyAssetOutcomeSnapshot(item);observations.add(id);outcomes.push(item);
    }else if(type==='evaluations'){
      addressed(item,'ethereum-prospective-evaluation');
      if(item.id!==id)fail('Archived evaluation filename mismatch');
    }else if(objectHash(item)!==id)fail('Archived acquisition or issuance identity mismatch');
  }
  for(const record of records){
    const snapshot=values.get('snapshots/'+record.snapshotId+'.json');
    if(!snapshot)fail('Missing archived forecast snapshot');
    await verifyEthereumProspectiveRecord(record,snapshot);
    references.push({from:'records/'+record.id+'.json',to:'snapshots/'+record.snapshotId+'.json'});
    if(runs.has(record.runKey))fail('Conflicting archived records for one economic run');
    runs.add(record.runKey);
  }
  for(const [path,item]of values){
    if(!path.startsWith('indexes/'))continue;
    if(item.schemaVersion!==1||item.kind!=='ethereum-prospective-index'||!Array.isArray(item.entries)||item.entries.length>P.maximumActiveRecords)
      fail('Invalid archived prospective index checkpoint');
    const ids=new Set(),indexRuns=new Set();
    for(const entry of item.entries){
      if(ids.has(entry.id)||indexRuns.has(entry.runKey))fail('Duplicate archived prospective index entry');
      ids.add(entry.id);indexRuns.add(entry.runKey);
      const record=values.get('records/'+entry.id+'.json');
      if(!record||json(ethereumProspectiveIndexEntry(record))!==json(entry))fail('Archived index metadata mismatch');
      references.push({from:path,to:'records/'+entry.id+'.json'});
    }
  }
  return {records:records.sort((a,b)=>a.id.localeCompare(b.id)),outcomes:outcomes.sort((a,b)=>a.id.localeCompare(b.id)),observationCount:observations.size,references};
}

/** Verify every reachable byte, every ancestor append relation, every immutable
 * record/snapshot, and every independent ETH outcome. No serialized "verified"
 * flag or prior receipt can skip the checks. */
export async function verifyEthereumProspectiveArchive({files}={}){
  const captured=captureMap(files,'archive transport');
  return verifyCaptured(captured);
}
async function verifyCaptured(captured){
  const manifest=parse(captured.get('manifest.json'),'manifest.json',{maximumBytes:P.maximumManifestBytes});
  checkManifest(manifest);
  const used=new Set(['manifest.json']),chain=[],seenManifests=new Set();
  let current=manifest,metadataBytes=captured.get('manifest.json').length;
  while(current){
    if(seenManifests.has(current.id)||chain.length>=P.maximumHistory)fail('Invalid or cyclic archive history');
    seenManifests.add(current.id);chain.push(current);
    const path='manifests/'+current.id+'.json',encoded=captured.get(path);
    const preserved=parse(encoded,path,{maximumBytes:P.maximumManifestBytes});checkManifest(preserved);
    if(json(preserved)!==json(current))fail('Archive manifest alias mismatch');
    used.add(path);metadataBytes+=encoded.length;
    if(current.previousManifestId===null){if(current.sequence!==1)fail('Archive history is incomplete');break;}
    const previousPath='manifests/'+current.previousManifestId+'.json';
    const previous=parse(captured.get(previousPath),previousPath,{maximumBytes:P.maximumManifestBytes});checkManifest(previous);
    if(previous.id!==current.previousManifestId||previous.sequence!==current.sequence-1||previous.createdAt>current.createdAt||
      previous.pages.length>current.pages.length||json(current.pages.slice(0,previous.pages.length))!==json(previous.pages))
      fail('Archive manifest is not an exact append-only descendant');
    current=previous;
  }
  const entries=[],logicalFiles=new Map(),objects=new Set(),counts=initialCounts(),prefixCounts=[JSON.parse(json(counts))],pagePositions=new Map();
  for(const expected of manifest.pages){
    const encoded=captured.get(expected.path),page=parse(encoded,expected.path,{maximumBytes:P.maximumPageBytes});
    keys(page,['id','schemaVersion','kind','entries'],'archive page');addressed(page,'ethereum-prospective-archive-page');
    if(!Array.isArray(page.entries)||!page.entries.length||page.entries.length>P.maximumEntriesPerPage||json(metadataDescriptor(page))!==json(expected))
      fail('Archive page descriptor mismatch');
    used.add(expected.path);metadataBytes+=encoded.length;
    let previousPath='';
    for(const entry of page.entries){
      checkDescriptor(entry);
      if(entry.path<=previousPath||logicalFiles.has(entry.path))fail('Duplicate or unordered archive logical file');
      previousPath=entry.path;
      const value=captured.get(entry.objectPath);
      if(!value||value.length!==entry.bytes||sha(value)!==entry.sha256||gitBlob(value)!==entry.gitBlobSha)
        fail('Archive raw-byte or Git-blob mismatch '+entry.path);
      used.add(entry.objectPath);addCounts(counts,entry,objects);entries.push(entry);logicalFiles.set(entry.path,Buffer.from(value));
      pagePositions.set(entry.path,prefixCounts.length-1);
    }
    prefixCounts.push(JSON.parse(json(counts)));
  }
  for(const item of chain)if(json(item.counts)!==json(prefixCounts[item.pages.length]))fail('Archive manifest counts mismatch');
  if(metadataBytes>P.maximumMetadataTotalBytes)throw new RangeError('Archive metadata-byte budget exceeded');
  if(used.size!==captured.size||[...captured.keys()].some(path=>!used.has(path)))fail('Unlisted archive transport file');
  const semantics=await validateLogicalFiles(logicalFiles);
  // Validating only the final union could let a forged early manifest omit a
  // record's snapshot, or checkpoint a not-yet-present record, then appear
  // repaired by a later generation. Every reference must already be closed
  // in the first ancestor containing it. Raw semantics are parsed once;
  // immutable page positions make this check linear in pages and references.
  const firstGenerationPageLimits=[];
  for(const ancestor of [...chain].reverse())while(firstGenerationPageLimits.length<ancestor.pages.length)
    firstGenerationPageLimits.push(ancestor.pages.length);
  for(const reference of semantics.references){
    const from=pagePositions.get(reference.from),to=pagePositions.get(reference.to);
    if(from===undefined||to===undefined||to>=firstGenerationPageLimits[from])
      fail('Archive ancestor contains an unresolved immutable reference '+reference.from+' -> '+reference.to);
  }
  return {manifest,entries,logicalFiles,files:captured,semantics,receipt:{
    status:'verified',manifestId:manifest.id,sequence:manifest.sequence,ancestorManifests:chain.length,
    pages:manifest.pages.length,...counts,metadataBytes,recordIds:semantics.records.map(record=>record.id),
    originalIssuedAt:Object.fromEntries(semantics.records.map(record=>[record.id,record.issuedAt])),
    observationCount:semantics.observationCount,allRawBytesVerified:true,allImmutableRecordsVerified:true,
    allAncestorReferenceClosuresVerified:true,
    providerAuthenticity:false,calibrationPruning:false,productionPromoted:false,releaseAuthorized:false,
  }};
}

/** Append immutable logical bytes. Existing checkpoints and original raw bytes
 * remain reachable. Mutable run documents receive their own byte-addressed
 * checkpoint names; index checkpoints can describe earlier inventory subsets. */
export async function buildEthereumProspectiveArchive({files,previous=null,source,createdAt}={}){
  const incoming=captureMap(files,'logical input'),identity=sourceIdentity(source),at=timestamp(createdAt,'archive createdAt');
  const previousBytes=previous===null?null:captureMap(previous instanceof Map?previous:previous?.files,'previous archive');
  const prior=previousBytes?await verifyCaptured(previousBytes):null;
  if(prior&&at<prior.manifest.createdAt)fail('Archive append clock precedes its retained predecessor');
  if(prior&&prior.manifest.sequence>=P.maximumHistory)throw new RangeError('Archive history budget exceeded');
  const logicalFiles=new Map(prior?.logicalFiles??[]),newEntries=[],normalizedInputPaths=[];
  for(const [originalPath,value]of incoming){
    const path=normalizeEthereumProspectiveArchiveInputPath(originalPath,value);
    if(path!==originalPath)normalizedInputPaths.push({inputPath:originalPath,archivePath:path,bytes:value.length,sha256:sha(value),gitBlobSha:gitBlob(value)});
    category(path);
    const present=logicalFiles.get(path);
    if(present&&!present.equals(value))fail('Immutable archive path conflict '+path);
    if(!present){logicalFiles.set(path,Buffer.from(value));const entry=descriptor(path,value);checkDescriptor(entry);newEntries.push(entry);}
  }
  await validateLogicalFiles(logicalFiles);
  const transport=new Map(prior?.files??[]),pages=[...(prior?.manifest.pages??[])];
  const sorted=newEntries.sort((a,b)=>a.path.localeCompare(b.path));
  if(pages.length+Math.ceil(sorted.length/P.maximumEntriesPerPage)>P.maximumPages)throw new RangeError('Archive page budget exceeded');
  for(let offset=0;offset<sorted.length;offset+=P.maximumEntriesPerPage){
    const page=signed({schemaVersion:1,kind:'ethereum-prospective-archive-page',entries:sorted.slice(offset,offset+P.maximumEntriesPerPage)}),encoded=bytes(page),desc=metadataDescriptor(page);
    if(encoded.length>P.maximumPageBytes)throw new RangeError('Archive page byte budget exceeded');
    transport.set(desc.path,encoded);pages.push(desc);
  }
  for(const entry of newEntries){
    const value=logicalFiles.get(entry.path),existing=transport.get(entry.objectPath);
    if(existing&&!existing.equals(value))fail('Content-addressed archive object collision');
    transport.set(entry.objectPath,value);
  }
  const counts=initialCounts(),objects=new Set();
  for(const entry of [...(prior?.entries??[]),...newEntries])addCounts(counts,entry,objects);
  const manifest=signed({schemaVersion:1,kind:'ethereum-prospective-archive-manifest',policyVersion:P.version,
    sequence:(prior?.manifest.sequence??0)+1,previousManifestId:prior?.manifest.id??null,createdAt:at,
    source:identity,pages,counts});
  const encoded=bytes(manifest);
  if(encoded.length>P.maximumManifestBytes)throw new RangeError('Archive manifest byte budget exceeded');
  transport.set('manifests/'+manifest.id+'.json',encoded);transport.set('manifest.json',encoded);
  const verified=await verifyCaptured(transport);
  return {manifest,files:transport,receipt:{...verified.receipt,newLogicalFiles:newEntries.length,
    retainedLogicalFiles:prior?.entries.length??0,previousManifestId:prior?.manifest.id??null,normalizedInputPaths,
    networkRequests:0,newForecastsCreated:0,newObservationsCreated:0}};
}

/** Rebuild a complete legacy working set only when unchanged reader limits
 * admit every item. Archive pages are not permission to hide old or invalid
 * records, drop observations, alter the first twelve windows, or raise limits. */
export async function restoreEthereumProspectiveArchive({files}={}){
  const verified=await verifyEthereumProspectiveArchive({files});
  const {records,outcomes,observationCount}=verified.semantics;
  if(records.length>P.maximumActiveRecords)throw new RangeError('Archive exceeds unchanged active record limit; bounded selection is not implemented');
  if(observationCount>P.maximumActiveObservations)throw new RangeError('Archive exceeds unchanged active observation limit; bounded selection is not implemented');
  const index={schemaVersion:1,kind:'ethereum-prospective-index',entries:records.map(ethereumProspectiveIndexEntry)};
  const indexBytes=bytes(index);
  if(indexBytes.length>P.maximumActiveIndexBytes)throw new RangeError('Archive exceeds unchanged active index byte limit');
  const restored=new Map();
  for(const [path,value]of verified.logicalFiles)if(!/^(?:indexes|receipts|outcome-observations)\//.test(path))restored.set(path,Buffer.from(value));
  restored.set('index.json',indexBytes);
  const outcomeFiles=new Map(outcomes.map(snapshot=>['observations/'+snapshot.id+'.json',
    Buffer.from(verified.logicalFiles.get('outcome-observations/'+snapshot.id+'.json'))]));
  const outcomeIndex={schemaVersion:1,kind:'atlas-asset-outcome-index',observations:outcomes.map(assetOutcomeSnapshotEntry),evaluations:[],latestEvaluationId:null};
  validateAssetOutcomeIndex(outcomeIndex);
  const outcomeIndexBytes=bytes(outcomeIndex);
  if(outcomeIndexBytes.length>P.maximumActiveIndexBytes)throw new RangeError('Archive exceeds active outcome index byte limit');
  outcomeFiles.set('index.json',outcomeIndexBytes);
  return {files:restored,outcomeFiles,receipt:{...verified.receipt,status:'restored',indexBytes:indexBytes.length,
    outcomeIndexBytes:outcomeIndexBytes.length,restoredRecords:records.length,restoredProspectiveObservations:verified.manifest.counts.observations,
    restoredIndependentObservations:outcomes.length,newForecastsCreated:0,newObservationsCreated:0,
    retainedCheckpointFiles:verified.manifest.counts.indexes+verified.manifest.counts.receipts,
    unchangedReaderLimits:{records:P.maximumActiveRecords,observations:P.maximumActiveObservations,indexBytes:P.maximumActiveIndexBytes},
  }};
}
