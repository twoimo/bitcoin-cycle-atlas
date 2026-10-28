import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdtemp,mkdir,writeFile,readFile,rm,symlink,truncate} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {canonicalForecastJson} from '../dist/forecast-records.js';
import {createEthereumProspectiveRecord,ethereumProspectiveIndexEntry} from '../dist/ethereum-prospective-dispatch.js';
import {createAssetOutcomeSnapshot,assetOutcomeSnapshotEntry} from '../dist/asset-outcome-records.js';
import {buildEthereumProspectiveArchive as build,verifyEthereumProspectiveArchive as verify,
  restoreEthereumProspectiveArchive as restore,ETH_PROSPECTIVE_ARCHIVE_FORMAT as F} from '../scripts/ethereum-prospective-archive-core.mjs';
import {readEthereumArchiveDirectory} from '../scripts/manage-ethereum-prospective-archive.mjs';
import {ETH_PROSPECTIVE_ARCHIVE_SOURCE_POLICY as P,
  openEthereumProspectiveArchiveSource as openSource,ethereumProspectiveArchiveSourceInfo as info,
  visitEthereumProspectiveArchiveRecords as visitRecords,visitEthereumProspectiveArchiveObservations as visitObservations,
  readEthereumProspectiveArchiveFile as readSource,openEthereumProspectiveArchiveSourceAtManifest as ancestorSource,
} from '../scripts/ethereum-prospective-archive-source.mjs';
import {prospectiveFixture} from './helpers/eth-prospective-fixture.mjs';
import {writeSyntheticEthereumProspectiveGrowthArchive,syntheticProspectiveRecordWithSourceGraph} from './helpers/eth-prospective-growth-fixture.mjs';
import {buildEthereumProspectivePagedCalibrationReadiness} from '../scripts/ethereum-prospective-calibration-paged.mjs';

// All generated growth and clock examples in this file are SYNTHETIC schema
// evidence. They are never represented as actual retained market history.
const repositoryRoot=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const encode=value=>Buffer.from(canonicalForecastJson(value)+'\n');
const decode=value=>JSON.parse(value.toString('utf8'));
const sha=value=>createHash('sha256').update(value).digest('hex');
const signed=value=>{const {id,...body}=value;return {id:sha(Buffer.from(canonicalForecastJson(body))),...body};};
const source={sourceCommit:'a'.repeat(40),sourceTree:'b'.repeat(40),runId:'1234'};
const createdAt='2026-10-28T00:00:00.000Z',later='2026-10-28T01:00:00.000Z';
const fixture=await prospectiveFixture();
const index={schemaVersion:1,kind:'ethereum-prospective-index',entries:[ethereumProspectiveIndexEntry(fixture.record)]};
const emptyIndex={schemaVersion:1,kind:'ethereum-prospective-index',entries:[]};
const original=new Map([
  ['records/'+fixture.record.id+'.json',encode(fixture.record)],
  ['snapshots/'+fixture.snapshot.id+'.json',encode(fixture.snapshot)],
  ['observations/'+fixture.snapshot.id+'.json',encode(fixture.snapshot)],
  ['index.json',encode(index)],
]);
const initial=await build({files:original,source,createdAt});
const tinyDocument=JSON.stringify({source:'Coinbase Exchange',product:'ETH-USD',dailyHistory:{
  source:'Coinbase Exchange',product:'ETH-USD',completedOnly:true,candles:[
    {date:'2024-01-01T00:00:00.000Z',open:100,high:110,low:90,close:100,volume:1},
    {date:'2024-01-02T00:00:00.000Z',open:100,high:110,low:90,close:100,volume:1},
  ]}});
async function outcome(seconds=0){return createAssetOutcomeSnapshot({symbol:'ETHUSD',sourceDocument:tinyDocument,
  sourceUrl:'https://example.invalid/synthetic-growth-only',collectedAt:new Date(Date.parse(createdAt)+seconds*1000).toISOString()});}
async function writeDirectory(root,path,files){
  await mkdir(resolve(root,path),{recursive:true});
  for(const [name,bytes]of files){const destination=resolve(root,path,name);await mkdir(dirname(destination),{recursive:true});await writeFile(destination,bytes);}
}
async function temporary(t,archive=initial){
  const root=await mkdtemp(resolve(tmpdir(),'eth-archive-source-'));
  t.after(()=>rm(root,{recursive:true,force:true}));
  await writeDirectory(root,'archive',archive.files??archive);
  return root;
}
const openAt=(root,extra={})=>openSource({repositoryRoot:root,archivePath:'archive',...extra});
const clone=files=>new Map([...files].map(([path,value])=>[path,Buffer.from(value)]));
function replaceHead(files,change){
  files=clone(files);const head=decode(files.get('manifest.json')),next=signed(change(head));
  files.delete('manifests/'+head.id+'.json');files.set('manifest.json',encode(next));files.set('manifests/'+next.id+'.json',encode(next));
  return files;
}
function replacePage(files,index,change){
  files=clone(files);const head=decode(files.get('manifest.json')),prior=head.pages[index];
  const page=signed(change(decode(files.get(prior.path))));files.delete(prior.path);
  const descriptor=F.metadataDescriptor(page);files.set(descriptor.path,encode(page));
  return replaceHead(files,value=>({...value,pages:value.pages.map((row,i)=>i===index?descriptor:row)}));
}
function delayedSnapshotArchive(){
  const entries=initial.manifest.pages.flatMap(row=>decode(initial.files.get(row.path)).entries);
  const groups=[entries.filter(row=>row.path.startsWith('records/')),entries.filter(row=>!row.path.startsWith('records/'))];
  const pages=groups.map(entries=>signed({schemaVersion:1,kind:'ethereum-prospective-archive-page',entries}));
  const descriptors=pages.map(F.metadataDescriptor),counts=F.initialCounts(),seen=new Set();
  for(const row of groups[0])F.addCounts(counts,row,seen);
  const earlier=signed({...initial.manifest,pages:descriptors.slice(0,1),counts});
  const head=signed({...initial.manifest,sequence:2,previousManifestId:earlier.id,createdAt:later,pages:descriptors});
  const files=new Map([...initial.files].filter(([path])=>path.startsWith('objects/')));
  pages.forEach((page,i)=>files.set(descriptors[i].path,encode(page)));
  files.set('manifests/'+earlier.id+'.json',encode(earlier));files.set('manifests/'+head.id+'.json',encode(head));files.set('manifest.json',encode(head));
  return files;
}
function uncheckedSyntheticArchive(logical){
  const files=new Map(),entries=[...logical].map(([path,bytes])=>{const entry=F.descriptor(path,bytes);files.set(entry.objectPath,bytes);return entry;})
    .sort((a,b)=>a.path.localeCompare(b.path));
  const counts=F.initialCounts(),objects=new Set();entries.forEach(entry=>F.addCounts(counts,entry,objects));
  const page=signed({schemaVersion:1,kind:'ethereum-prospective-archive-page',entries}),descriptor=F.metadataDescriptor(page);
  const manifest=signed({...initial.manifest,pages:[descriptor],counts});
  files.set(descriptor.path,encode(page));files.set('manifest.json',encode(manifest));files.set('manifests/'+manifest.id+'.json',encode(manifest));
  return files;
}

test('actual committed archive matches legacy verification and restores every original record and observation byte',async()=>{
  const archivePath='research-data/ethereum-prospective-archive';
  const files=await readEthereumArchiveDirectory(resolve(repositoryRoot,archivePath));
  const legacy=await verify({files}),restored=await restore({files});
  const token=await openSource({repositoryRoot,archivePath,expectedManifestId:legacy.manifest.id}),summary=info(token);
  assert.equal(summary.archiveManifestId,legacy.manifest.id);assert.deepEqual(summary.recordIds,legacy.receipt.recordIds);
  assert.equal(summary.observations,legacy.receipt.observationCount);
  assert.equal(summary.overlayInputFiles,0);assert.equal(summary.retainedParsedObservationCollections,0);
  const visitedRecords=[],visitedObservations=[];
  await visitRecords(token,async(record,snapshot,descriptor)=>{
    assert.deepEqual(await readSource(token,descriptor.logicalPath),restored.files.get(descriptor.logicalPath));
    assert.equal(record.id,descriptor.id);assert.equal(snapshot.id,record.snapshotId);
    assert.equal(record.issuedAt,legacy.receipt.originalIssuedAt[record.id]);assert.equal(record.output.path.length,731);
    visitedRecords.push(record.id);
  });
  await visitObservations(token,async(snapshot,descriptor)=>{
    assert.deepEqual(await readSource(token,descriptor.logicalPath),legacy.logicalFiles.get(descriptor.logicalPath));
    visitedObservations.push(snapshot.id);
  });
  assert.deepEqual(visitedRecords,summary.recordIds);assert.deepEqual(visitedObservations,summary.observationIds);
  assert.equal(summary.releaseAuthorized,false);assert.equal(summary.providerAuthenticity,false);
});

test('synthetic 501-observation growth crosses four pages without raising legacy limits or pruning any vintage',async t=>{
  const files=new Map(),ids=[];
  for(let i=0;i<501;i++){const snapshot=await outcome(i);ids.push(snapshot.id);files.set('outcome-observations/'+snapshot.id+'.json',encode(snapshot));}
  const archive=await build({files,source,createdAt}),root=await temporary(t,archive),token=await openAt(root);
  const summary=info(token),visited=[];await visitObservations(token,snapshot=>visited.push(snapshot.id));
  assert.equal(summary.archiveManifest.pages.length,4);assert.equal(summary.observations,501);
  assert.deepEqual(visited,ids.sort());assert.equal(summary.logicalDescriptors.length,501);
  assert.equal(summary.limits.maximumActiveObservations,500);assert.equal(summary.limits.retainedParsedObservationCollections,0);
  assert.equal(summary.limits.maximumPhysicalBytes,2*1024*1024*1024);
  await assert.rejects(()=>restore(archive),/unchanged active observation limit/);
});

test('a current partial index can reference archived records without materializing the historical ledger',async t=>{
  const root=await temporary(t);
  await writeDirectory(root,'delta',new Map([['index.json',encode(index)],['receipt.json',encode({synthetic:true})]]));
  const token=await openAt(root,{prospectivePaths:['delta']}),summary=info(token);
  assert.equal(summary.records,1);assert.equal(summary.overlayInputFiles,2);
  assert.deepEqual(summary.recordIds,[fixture.record.id]);assert.equal(summary.recordEntries[0].snapshotId,fixture.snapshot.id);
  const bytes=await readSource(token,'snapshots/'+fixture.snapshot.id+'.json');assert.deepEqual(bytes,encode(fixture.snapshot));
});

test('a new bounded delta record can reference an unchanged archived snapshot',async t=>{
  const root=await temporary(t),record=syntheticProspectiveRecordWithSourceGraph(fixture,1);
  await writeDirectory(root,'delta',new Map([['index.json',encode({...index,entries:[ethereumProspectiveIndexEntry(record)]})],
    ['records/'+record.id+'.json',encode(record)]]));
  const token=await openAt(root,{prospectivePaths:['delta']});
  assert.deepEqual(info(token).recordIds,[fixture.record.id,record.id].sort());
  assert.equal(info(token).logicalDescriptors.filter(row=>row.category==='snapshots').length,1);
  let visited=0;await visitRecords(token,()=>visited++);assert.equal(visited,2);
});

test('every physical current delta record must appear in its own current index',async t=>{
  const onlyReceipt=await build({files:new Map([['receipt.json',encode({synthetic:true})]]),source,createdAt});
  const root=await temporary(t,onlyReceipt);
  await writeDirectory(root,'delta',new Map([['index.json',encode(emptyIndex)],
    ['records/'+fixture.record.id+'.json',encode(fixture.record)],['snapshots/'+fixture.snapshot.id+'.json',encode(fixture.snapshot)]]));
  await assert.rejects(()=>openAt(root,{prospectivePaths:['delta']}),/Unindexed current prospective delta record/);
});

test('new bounded delta records reuse archived snapshots and are checked against every old run',async t=>{
  const root=await temporary(t);
  const second=await createEthereumProspectiveRecord({...fixture.args,issuedAt:new Date(Date.parse(fixture.record.issuedAt)+1000).toISOString()});
  assert.notEqual(second.id,fixture.record.id);assert.equal(second.runKey,fixture.record.runKey);
  await writeDirectory(root,'delta',new Map([['index.json',encode({...index,entries:[ethereumProspectiveIndexEntry(second)]})],['records/'+second.id+'.json',encode(second)]]));
  await assert.rejects(()=>openAt(root,{prospectivePaths:['delta']}),/one economic run/);
});

test('same-ID altered bytes cannot hide in a prospective alias even with a partial empty index',async t=>{
  const root=await temporary(t),changed={...fixture.record,issuedAt:later};
  await writeDirectory(root,'delta',new Map([['index.json',encode(emptyIndex)],['records/'+fixture.record.id+'.json',encode(changed)]]));
  await assert.rejects(()=>openAt(root,{prospectivePaths:['delta']}),/path conflict/);
});

test('all independently indexed foreign observations are validated before ETH routing',async t=>{
  const root=await temporary(t),path='research-data/asset-outcome-ledger';
  const foreign=decode(await readFile(resolve(repositoryRoot,path,'observations/24ad59d1d0a798e0e16d118707e54cd007b93bd361ebaf3ea354dc4f43c9643f.json')));
  const bad=signed({...foreign,observedFrom:'2099-01-01'});
  const foreignIndex={schemaVersion:1,kind:'atlas-asset-outcome-index',observations:[assetOutcomeSnapshotEntry(bad)],evaluations:[],latestEvaluationId:null};
  await writeDirectory(root,'outcomes',new Map([['index.json',encode(foreignIndex)],['observations/'+bad.id+'.json',encode(bad)]]));
  await assert.rejects(()=>openAt(root,{outcomePaths:['outcomes']}),/metadata or raw-source binding mismatch/);
});

test('valid foreign inventory is bound to source identity, counted separately, and never passed as ETH observations',async t=>{
  const root=await temporary(t),files=await readEthereumArchiveDirectory(resolve(repositoryRoot,'research-data/asset-outcome-ledger'));
  await writeDirectory(root,'outcomes',files);
  const token=await openAt(root,{outcomePaths:['outcomes']}),summary=info(token),visited=[];
  await visitObservations(token,(snapshot,descriptor)=>{visited.push(snapshot.id);if(descriptor.kind==='outcome-observations')assert.equal(snapshot.symbol,'ETHUSD');});
  assert.equal(summary.foreignObservationIds.length,2);assert.equal(summary.independentForeignObservations,2);
  assert.equal(visited.length,2);assert.ok(summary.foreignObservationIds.every(id=>!visited.includes(id)));
  const foreignPath=summary.foreignObservationIds[0],file=resolve(root,'outcomes/observations/'+foreignPath+'.json');
  const changed=await readFile(file);changed[changed.length-2]^=1;await writeFile(file,changed);
  await assert.rejects(()=>visitObservations(token,()=>{}),/raw-byte or Git-blob mismatch/);
});

test('a future foreign source and an unindexed foreign file cannot bypass complete inventory validation',async t=>{
  const root=await temporary(t),snapshot=await outcome(365*86400);
  const mislabeled=signed({...snapshot,symbol:'MSTR',market:'equity'});
  const outcomeIndex={schemaVersion:1,kind:'atlas-asset-outcome-index',observations:[assetOutcomeSnapshotEntry(mislabeled)],evaluations:[],latestEvaluationId:null};
  await writeDirectory(root,'outcomes',new Map([['index.json',encode(outcomeIndex)],['observations/'+mislabeled.id+'.json',encode(mislabeled)]]));
  await assert.rejects(()=>openAt(root,{outcomePaths:['outcomes']}));
  await writeFile(resolve(root,'outcomes/index.json'),encode({...outcomeIndex,observations:[]}));
  await assert.rejects(()=>openAt(root,{outcomePaths:['outcomes']}),/Unlisted outcome source file/);
});

test('later reads rehash original objects and every equal alias instead of trusting the open-time token',async t=>{
  const root=await temporary(t),recordPath='records/'+fixture.record.id+'.json';
  await writeDirectory(root,'delta',new Map([['index.json',encode(index)],[recordPath,encode(fixture.record)]]));
  const token=await openAt(root,{prospectivePaths:['delta']});
  assert.deepEqual(await readSource(token,recordPath),encode(fixture.record));
  const file=resolve(root,'delta',recordPath),changed=await readFile(file);changed[changed.length-2]^=1;await writeFile(file,changed);
  await assert.rejects(()=>readSource(token,recordPath),/raw-byte or Git-blob mismatch/);
  await assert.rejects(()=>visitRecords(token,()=>{}),/raw-byte or Git-blob mismatch/);
});

test('callback mutation and forged serialized verification flags never mutate or authorize a source',async t=>{
  const root=await temporary(t),token=await openAt(root),first=info(token);
  assert.ok(Object.isFrozen(first));assert.ok(Object.isFrozen(first.logicalDescriptors));
  assert.throws(()=>first.recordIds.push('forged'),TypeError);
  await visitRecords(token,(record,snapshot)=>{record.issuedAt='2099-01-01T00:00:00.000Z';snapshot.primaryPrices[0][1]=-1;});
  await visitRecords(token,(record,snapshot)=>{assert.equal(record.issuedAt,fixture.record.issuedAt);assert.ok(snapshot.primaryPrices[0][1]>0);});
  await assert.rejects(()=>readSource({verified:true,...first},'records/'+fixture.record.id+'.json'),/opaque verified archive source/);
  assert.throws(()=>info(JSON.parse(JSON.stringify(token))),/opaque verified archive source/);
});

test('ancestor views prove the complete retained prefix and exclude overlays while preserving stable source identity',async t=>{
  const nextObservation=await outcome(),next=await build({files:new Map([['outcome-observations/'+nextObservation.id+'.json',encode(nextObservation)]]),previous:initial,source,createdAt:later});
  const root=await temporary(t,next),oldRoot=await temporary(t,initial);
  await writeDirectory(root,'delta',new Map([['index.json',encode(emptyIndex)]]));
  const current=await openAt(root,{prospectivePaths:['delta']}),ancestor=await ancestorSource(current,initial.manifest.id),originalSource=await openAt(oldRoot);
  assert.equal(info(ancestor).id,info(originalSource).id);assert.equal(info(ancestor).overlayInputFiles,0);
  assert.equal(info(ancestor).archiveManifestId,initial.manifest.id);assert.equal(info(ancestor).retainedAncestorView,true);
  assert.deepEqual(info(ancestor).observationIds,[fixture.snapshot.id]);assert.equal(info(current).observations,2);
  await assert.rejects(()=>readSource(ancestor,'outcome-observations/'+nextObservation.id+'.json'),/Missing archive logical file/);
  await assert.rejects(()=>ancestorSource(current,'f'.repeat(64)),/does not retain/);
});

test('an ancestor cannot be repaired by a later snapshot',async t=>{
  const root=await temporary(t,delayedSnapshotArchive());
  await assert.rejects(()=>openAt(root),/ancestor contains an unresolved immutable reference/);
});

test('a malformed old record is validated before model or future issuance routing',async t=>{
  const bad=signed({...fixture.record,modelKey:'unknown-old-model',issuedAt:'2099-01-01T00:00:00.000Z'});
  const root=await temporary(t,uncheckedSyntheticArchive(new Map([
    ['records/'+bad.id+'.json',encode(bad)],['snapshots/'+fixture.snapshot.id+'.json',encode(fixture.snapshot)],
  ])));
  await assert.rejects(()=>openAt(root));
});

test('current overlay snapshots cannot repair an unresolved reference in an immutable ancestor',async t=>{
  const root=await temporary(t,uncheckedSyntheticArchive(new Map([['records/'+fixture.record.id+'.json',encode(fixture.record)]])));
  await writeDirectory(root,'delta',new Map([['index.json',encode(emptyIndex)],['snapshots/'+fixture.snapshot.id+'.json',encode(fixture.snapshot)]]));
  await assert.rejects(()=>openAt(root,{prospectivePaths:['delta']}),/ancestor contains an unresolved immutable reference/);
});

test('missing objects, extra files, invalid manifest expectations and oversized metadata fail closed',async t=>{
  const root=await temporary(t),token=await openAt(root),descriptor=info(token).logicalDescriptors[0];
  await assert.rejects(()=>openAt(root,{expectedManifestId:'f'.repeat(64)}),/expected manifest identity mismatch/);
  await rm(resolve(root,'archive',descriptor.objectPath));
  await assert.rejects(()=>openAt(root),/raw-byte or Git-blob mismatch/);
  await writeFile(resolve(root,'archive',descriptor.objectPath),initial.files.get(descriptor.objectPath));
  await writeFile(resolve(root,'archive/extra.json'),Buffer.from('{}'));
  await assert.rejects(()=>openAt(root),/Unlisted archive transport file/);
  await assert.rejects(()=>visitRecords(token,()=>{}),/complete physical inventory changed/);
  await rm(resolve(root,'archive/extra.json'));
  await truncate(resolve(root,'archive/manifest.json'),P.maximumManifestBytes+1);
  await assert.rejects(()=>openAt(root),/byte limit/);
});

test('reordered entries and duplicate pages cannot be authorized by recalculating content addresses',async t=>{
  const reordered=replacePage(initial.files,0,page=>({...page,entries:[...page.entries].reverse()}));
  const root=await temporary(t,reordered);await assert.rejects(()=>openAt(root),/Duplicate or unordered/);
  const duplicate=replaceHead(initial.files,head=>({...head,pages:[...head.pages,head.pages[0]]}));
  const duplicateRoot=await temporary(t,duplicate);await assert.rejects(()=>openAt(duplicateRoot),/Duplicate archive page/);
  const next=await build({files:new Map([['receipt.json',encode({synthetic:true})]]),previous:initial,source,createdAt:later});
  const reorderedPages=replaceHead(next.files,head=>({...head,pages:[...head.pages].reverse()}));
  const reorderedRoot=await temporary(t,reorderedPages);await assert.rejects(()=>openAt(reorderedRoot),/exact append-only descendant/);
});

test('late page bytes and forged object descriptors are checked even when no forecast references them',async t=>{
  const additions=new Map();for(let i=0;i<130;i++){const value=await outcome(i);additions.set('outcome-observations/'+value.id+'.json',encode(value));}
  const next=await build({files:additions,previous:initial,source,createdAt:later}),root=await temporary(t,next);
  const page=decode(next.files.get(next.manifest.pages.at(-1).path)),objectPath=page.entries.at(-1).objectPath;
  const bytes=await readFile(resolve(root,'archive',objectPath));bytes[bytes.length-2]^=1;await writeFile(resolve(root,'archive',objectPath),bytes);
  await assert.rejects(()=>openAt(root),/raw-byte or Git-blob mismatch/);
  const changed=replacePage(initial.files,0,page=>({...page,entries:page.entries.map((entry,i)=>i?entry:{...entry,bytes:entry.bytes+1})}));
  const changedRoot=await temporary(t,changed);await assert.rejects(()=>openAt(changedRoot),/raw-byte or Git-blob mismatch/);
});

test('symlinked files, directories, root ancestors, traversal and overlapping input roots are rejected',async t=>{
  const root=await temporary(t),outside=await temporary(t),path='records/'+fixture.record.id+'.json';
  await writeDirectory(root,'delta',new Map([['index.json',encode(index)],[path,encode(fixture.record)]]));
  const file=resolve(root,'delta',path);await rm(file);await symlink(resolve(outside,'archive/manifest.json'),file);
  await assert.rejects(()=>openAt(root,{prospectivePaths:['delta']}),/symlink/);
  await assert.rejects(()=>openAt(root,{archivePath:'../archive'}),/Unsafe/);
  await assert.rejects(()=>openAt(root,{prospectivePaths:['archive/objects']}),/non-overlapping/);
  await symlink(root,resolve(outside,'alias'),'dir');
  await assert.rejects(()=>openSource({repositoryRoot:resolve(outside,'alias'),archivePath:'archive'}),/symlink ancestors|ancestors must not contain symlinks/);
  await symlink(resolve(outside,'archive'),resolve(root,'linked'),'dir');
  await assert.rejects(()=>openAt(root,{archivePath:'linked'}),/symlink/);
});

test('synthetic 2001-record growth is fully visited without a global flat index; synthetic source graph replay is not claimed',async t=>{
  const root=await mkdtemp(resolve(tmpdir(),'eth-archive-record-growth-'));t.after(()=>rm(root,{recursive:true,force:true}));
  const growth=await writeSyntheticEthereumProspectiveGrowthArchive({repositoryRoot:root});
  const token=await openSource({repositoryRoot:root,archivePath:growth.archivePath}),summary=info(token);
  assert.equal(growth.synthetic,true);assert.equal(growth.actualModelReplayClaimed,false);
  assert.equal(summary.records,2001);assert.equal(summary.limits.maximumActiveRecords,2000);
  assert.deepEqual(summary.recordIds,growth.recordIds);assert.equal(summary.observations,1);
  assert.equal(summary.logicalDescriptors.filter(row=>row.category==='snapshots').length,1);
  assert.ok(summary.archiveManifest.pages.length>1);assert.ok(summary.archiveManifest.counts.objectBytes<P.maximumPhysicalBytes);
  const checkpoint=summary.logicalDescriptors.find(row=>row.category==='indexes');
  assert.deepEqual(decode(await readSource(token,checkpoint.logicalPath)).entries,[]);
  const record=growth.fixture.record;
  const checked=await buildEthereumProspectivePagedCalibrationReadiness({source:token,informationCutoffAt:summary.archiveManifest.createdAt,
    binding:{modelKey:record.modelKey,modelVersion:record.model.version,modelSourceHash:record.model.sourceHash,options:record.options,horizonDays:30}});
  assert.deepEqual(checked.inputRecordIds,growth.recordIds);assert.equal(checked.excludedRecords.length,2000);
  assert.equal(checked.slots.length,1);assert.equal(checked.slots[0].recordId,record.id);assert.equal(checked.slots[0].snapshotId,growth.snapshotId);
  assert.equal(checked.status,'insufficient-calibration-cases');
});
