import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {canonicalForecastJson,forecastHash} from '../dist/forecast-records.js';
import {ethereumProspectiveIndexEntry} from '../dist/ethereum-prospective-dispatch.js';
import {createEthereumResearchSnapshot} from '../dist/ethereum-prospective-prices.js';
import {createAssetOutcomeSnapshot,assetOutcomeSnapshotEntry} from '../dist/asset-outcome-records.js';
import {prospectiveFixture} from './helpers/eth-prospective-fixture.mjs';
import {ETH_PROSPECTIVE_ARCHIVE_POLICY as P,buildEthereumProspectiveArchive as build,
  verifyEthereumProspectiveArchive as verify,restoreEthereumProspectiveArchive as restore} from '../scripts/ethereum-prospective-archive-core.mjs';

// Synthetic schema inputs below never become retained market observations.
const encode=value=>Buffer.from(canonicalForecastJson(value)+'\n');
const decode=value=>JSON.parse(value.toString('utf8'));
const hash=value=>createHash('sha256').update(value).digest('hex');
const blob=value=>createHash('sha1').update('blob '+value.length+'\0').update(value).digest('hex');
const signed=value=>{const {id,...body}=value;return {id:hash(Buffer.from(canonicalForecastJson(body))),...body};};
const source={sourceCommit:'a'.repeat(40),sourceTree:'b'.repeat(40),runId:'1234'};
const createdAt='2026-10-28T00:00:00.000Z',later='2026-10-28T01:00:00.000Z';
const f=await prospectiveFixture();
const index={schemaVersion:1,kind:'ethereum-prospective-index',entries:[ethereumProspectiveIndexEntry(f.record)]};
const initialFiles=new Map([
  ['records/'+f.record.id+'.json',encode(f.record)],
  ['snapshots/'+f.snapshot.id+'.json',encode(f.snapshot)],
  ['observations/'+f.snapshot.id+'.json',encode(f.snapshot)],
  ['index.json',encode(index)],
  ['receipt.json',encode({kind:'synthetic-test-receipt',status:'test-only'})],
]);
const initial=await build({files:initialFiles,source,createdAt});
const duplicate=map=>new Map([...map].map(([path,value])=>[path,Buffer.from(value)]));
const input=(files,extra={})=>({files,source,createdAt,...extra});
const firstObject=archive=>decode(archive.get(decode(archive.get('manifest.json')).pages[0].path)).entries[0].objectPath;
function changeHead(archive,change){
  const copy=duplicate(archive),prior=decode(copy.get('manifest.json')),next=signed(change(structuredClone(prior)));
  copy.delete('manifests/'+prior.id+'.json');copy.set('manifest.json',encode(next));copy.set('manifests/'+next.id+'.json',encode(next));
  return copy;
}
function changeFirstPage(archive,change){
  const copy=duplicate(archive),head=decode(copy.get('manifest.json')),desc=head.pages[0];
  const page=signed(change(decode(copy.get(desc.path)))),encoded=encode(page);
  copy.delete(desc.path);copy.set('pages/'+page.id+'.json',encoded);
  return changeHead(copy,current=>({...current,pages:[{id:page.id,path:'pages/'+page.id+'.json',bytes:encoded.length,
    sha256:hash(encoded),gitBlobSha:blob(encoded),entries:page.entries.length},...current.pages.slice(1)]}));
}
function archiveWithDelayedReference(firstPath,{singleGeneration=false}={}){
  const entries=initial.manifest.pages.flatMap(desc=>decode(initial.files.get(desc.path)).entries);
  const groups=[entries.filter(entry=>entry.path===firstPath),entries.filter(entry=>entry.path!==firstPath)];
  const pages=groups.map(entries=>signed({schemaVersion:1,kind:'ethereum-prospective-archive-page',entries}));
  const descriptors=pages.map(page=>{const encoded=encode(page);return {id:page.id,path:'pages/'+page.id+'.json',
    bytes:encoded.length,sha256:hash(encoded),gitBlobSha:blob(encoded),entries:page.entries.length};});
  const counts=Object.fromEntries(Object.keys(initial.manifest.counts).map(key=>[key,0])),seen=new Set();
  for(const entry of groups[0]){
    counts.files++;counts[entry.path.split('/')[0]]++;
    if(!seen.has(entry.objectPath)){seen.add(entry.objectPath);counts.objects++;counts.objectBytes+=entry.bytes;}
  }
  const earlier=signed({...initial.manifest,pages:descriptors.slice(0,1),counts});
  const head=signed({...initial.manifest,sequence:singleGeneration?1:2,previousManifestId:singleGeneration?null:earlier.id,
    createdAt:later,pages:descriptors});
  const files=new Map([...initial.files].filter(([path])=>path.startsWith('objects/')));
  pages.forEach((page,i)=>files.set(descriptors[i].path,encode(page)));
  if(!singleGeneration)files.set('manifests/'+earlier.id+'.json',encode(earlier));
  files.set('manifests/'+head.id+'.json',encode(head));files.set('manifest.json',encode(head));
  return files;
}

test('archive restores the exact original issued bytes, identity, clocks and 731 points',async()=>{
  const result=await restore(initial),record=decode(result.files.get('records/'+f.record.id+'.json'));
  assert.deepEqual(result.files.get('records/'+f.record.id+'.json'),initialFiles.get('records/'+f.record.id+'.json'));
  assert.equal(record.id,f.record.id);assert.equal(record.issuedAt,f.record.issuedAt);
  assert.equal(record.output.path.length,731);
  assert.deepEqual(decode(result.files.get('index.json')),index);
  assert.equal(result.receipt.observationCount,1);assert.equal(result.receipt.providerAuthenticity,false);
  assert.equal(result.receipt.newForecastsCreated,0);assert.equal(result.receipt.calibrationPruning,false);
  assert.deepEqual(result.receipt.unchangedReaderLimits,{records:2000,observations:500,indexBytes:1048576});
});

test('snapshot and observation logical paths share one exact object without losing either inventory entry',async()=>{
  const result=await verify(initial),entries=result.entries.filter(entry=>/^(snapshots|observations)\//.test(entry.path));
  assert.equal(entries.length,2);assert.equal(entries[0].objectPath,entries[1].objectPath);
  assert.equal(result.receipt.files,5);assert.equal(result.receipt.objects,4);
  assert.equal(result.receipt.allRawBytesVerified,true);assert.equal(result.receipt.allImmutableRecordsVerified,true);
});

test('a later acquisition appends exact previous manifests, pages and objects without replacing the original index checkpoint',async()=>{
  const snapshot=await createEthereumResearchSnapshot({base:f.base,tail:{...f.tail,
    requestStartedAt:new Date(Date.parse(f.tail.requestStartedAt)+10000).toISOString(),
    bodyCompletedAt:new Date(Date.parse(f.tail.bodyCompletedAt)+10000).toISOString()}});
  const next=await build(input(new Map([['observations/'+snapshot.id+'.json',encode(snapshot)],
    ['receipt.json',encode({kind:'synthetic-test-receipt',status:'second-run'})],['index.json',encode(index)]]),
    {previous:initial,createdAt:later}));
  assert.equal(next.manifest.previousManifestId,initial.manifest.id);assert.equal(next.manifest.sequence,2);
  for(const [path,value]of initial.files)if(path!=='manifest.json')assert.deepEqual(next.files.get(path),value,path);
  assert.deepEqual(next.manifest.pages.slice(0,initial.manifest.pages.length),initial.manifest.pages);
  const result=await restore(next);assert.equal(result.receipt.observationCount,2);
  assert.equal(result.receipt.restoredRecords,1);assert.equal(next.receipt.newLogicalFiles,2);
  assert.equal(result.receipt.retainedCheckpointFiles,3);
});

test('a repeat capture preserves inventory while recording a linked execution manifest',async()=>{
  const next=await build(input(initialFiles,{previous:initial,createdAt:later}));
  assert.equal(next.receipt.newLogicalFiles,0);assert.equal(next.receipt.objects,initial.receipt.objects);
  assert.equal(next.manifest.pages.length,initial.manifest.pages.length);assert.equal(next.manifest.sequence,2);
});

test('independent ETH raw outcomes restore to the existing outcome-index format',async()=>{
  const outcome=await createAssetOutcomeSnapshot({symbol:'ETHUSD',sourceDocument:f.base.text,
    sourceUrl:'https://example.invalid/synthetic-eth-outcome',collectedAt:createdAt});
  const next=await build(input(new Map([['outcome-observations/'+outcome.id+'.json',encode(outcome)]]),{previous:initial,createdAt:later}));
  const result=await restore(next),path='observations/'+outcome.id+'.json';
  assert.deepEqual(result.outcomeFiles.get(path),encode(outcome));
  assert.deepEqual(decode(result.outcomeFiles.get('index.json')).observations,[assetOutcomeSnapshotEntry(outcome)]);
  assert.equal(result.receipt.observationCount,2);assert.equal(result.receipt.restoredIndependentObservations,1);
});

test('unknown traversal absolute backslash and control-character logical paths are rejected',async()=>{
  for(const path of ['../outside.json','/tmp/a.json','records\\a.json','records/../index.json','a\nb.json','unexpected.json'])
    await assert.rejects(()=>build(input(new Map([[path,encode({})]]))),/path/i);
});

test('same immutable path with changed bytes cannot be appended under a prior archive',async()=>{
  const changed=structuredClone(f.record);changed.issuedAt=later;
  await assert.rejects(()=>build(input(new Map([['records/'+f.record.id+'.json',encode(changed)]]),{previous:initial,createdAt:later})),/Immutable archive path conflict/);
});

test('a missing object blocks restoration even when every manifest is intact',async()=>{
  const copy=duplicate(initial.files);copy.delete(firstObject(copy));
  await assert.rejects(()=>restore({files:copy}),/raw-byte or Git-blob mismatch/);
});

test('one changed raw byte and a forged cached success flag cannot bypass verification',async()=>{
  const copy=duplicate(initial.files),path=firstObject(copy);copy.get(path)[0]^=1;
  await assert.rejects(()=>restore({files:copy,verified:true,receipt:{status:'verified'}}),/raw-byte or Git-blob mismatch/);
});

test('missing ancestor and unrelated extra transport files both block restoration',async()=>{
  const next=await build(input(new Map(),{previous:initial,createdAt:later}));
  const missing=duplicate(next.files);missing.delete('manifests/'+initial.manifest.id+'.json');
  await assert.rejects(()=>verify({files:missing}),/missing or too large/);
  const extra=duplicate(initial.files);extra.set('objects/'+'f'.repeat(64)+'.blob',Buffer.from('{}'));
  await assert.rejects(()=>verify({files:extra}),/Unlisted archive transport file/);
});

test('altered sequence predecessor clock policy and summary cannot be legitimized by rehashing the manifest',async()=>{
  for(const change of [value=>({...value,sequence:2}),value=>({...value,policyVersion:'relaxed'}),
    value=>({...value,counts:{...value.counts,records:0}}),value=>({...value,createdAt:'not-a-date'})])
    await assert.rejects(()=>verify({files:changeHead(initial.files,change)}));
  await assert.rejects(()=>build(input(new Map(),{previous:initial,createdAt:'2026-10-27T00:00:00.000Z'})),/append clock/);
});

test('an archive cannot drop a previous page and still call itself a later generation',async()=>{
  const next=await build(input(new Map([['receipt.json',encode({status:'synthetic-second-run'})]]),{previous:initial,createdAt:later}));
  const changed=changeHead(next.files,value=>({...value,pages:value.pages.slice(1)}));
  await assert.rejects(()=>verify({files:changed}),/exact append-only descendant/);
});

test('a later generation cannot retroactively supply an ancestor record snapshot or index reference',async()=>{
  const indexPath=initial.manifest.pages.flatMap(desc=>decode(initial.files.get(desc.path)).entries).find(entry=>entry.path.startsWith('indexes/')).path;
  for(const firstPath of ['records/'+f.record.id+'.json',indexPath]){
    const files=archiveWithDelayedReference(firstPath);
    await assert.rejects(()=>verify({files}),/ancestor contains an unresolved immutable reference/);
  }
});

test('cross-page references are valid when every dependency arrives in the same generation',async()=>{
  const files=archiveWithDelayedReference('records/'+f.record.id+'.json',{singleGeneration:true});
  const result=await restore({files});
  assert.equal(result.receipt.restoredRecords,1);assert.equal(result.receipt.pages,2);
  assert.equal(result.receipt.allAncestorReferenceClosuresVerified,true);
});

test('duplicate logical paths fail even when the page and manifest are rehashed',async()=>{
  const changed=changeFirstPage(initial.files,value=>({...value,entries:[...value.entries,value.entries[0]]}));
  await assert.rejects(()=>verify({files:changed}),/Duplicate or unordered/);
});

test('forged object byte count and Git blob identity are independently rejected',async()=>{
  for(const change of [entry=>({...entry,bytes:entry.bytes+1}),entry=>({...entry,gitBlobSha:'0'.repeat(40)})]){
    const changed=changeFirstPage(initial.files,value=>({...value,entries:value.entries.map((entry,i)=>i?entry:change(entry))}));
    await assert.rejects(()=>verify({files:changed}),/raw-byte or Git-blob mismatch/);
  }
});

test('index checkpoint cannot rename a record origin or point outside the archive',async()=>{
  for(const entry of [{...index.entries[0],asOf:'2000-01-01'},{...index.entries[0],recordPath:'../record.json'}]){
    const files=duplicate(initialFiles);files.set('index.json',encode({...index,entries:[entry]}));
    await assert.rejects(()=>build(input(files)),/index metadata mismatch/);
  }
});

test('historical subset indexes are retained while the restored index contains every verified record',async()=>{
  const older=encode({...index,entries:[]}),files=duplicate(initialFiles);
  files.set('indexes/'+hash(older)+'.json',older);
  const result=await restore(await build(input(files)));
  assert.equal(result.receipt.retainedCheckpointFiles,3);assert.deepEqual(decode(result.files.get('index.json')),index);
});

test('missing record snapshots fail before an archive checkpoint is issued',async()=>{
  const files=duplicate(initialFiles);files.delete('snapshots/'+f.snapshot.id+'.json');
  await assert.rejects(()=>build(input(files)),/Missing archived forecast snapshot/);
});

test('modified record routing metadata cannot hide behind a recomputed object digest',async()=>{
  const record=structuredClone(f.record);record.model.sourceHash='f'.repeat(64);
  const files=duplicate(initialFiles);files.set('records/'+f.record.id+'.json',encode(record));
  await assert.rejects(()=>build(input(files)),/hash|identity|mismatch/i);
});

test('observation filenames and semantic clocks remain validated independently of archive hashes',async()=>{
  const files=duplicate(initialFiles),changed=structuredClone(f.snapshot);changed.informationCutoffAt='2000-01-01T00:00:00.000Z';
  files.set('observations/'+f.snapshot.id+'.json',encode(changed));
  await assert.rejects(()=>build(input(files)),/hash|identity|mismatch/i);
  files.delete('observations/'+f.snapshot.id+'.json');files.set('observations/'+'a'.repeat(64)+'.json',encode(f.snapshot));
  await assert.rejects(()=>build(input(files)),/filename mismatch/);
});

test('noncanonical immutable JSON and non-UTF-8 bytes cannot enter a valid archive',async()=>{
  for(const value of [Buffer.from(JSON.stringify(f.record)),Buffer.from([0xff,0xfe,0xfd])]){
    const files=duplicate(initialFiles);files.set('records/'+f.record.id+'.json',value);
    await assert.rejects(()=>build(input(files)),/Noncanonical|Non-UTF-8/);
  }
});

test('raw Coinbase bodies retain their exact whitespace and fail when their filename digest disagrees',async()=>{
  const raw=Buffer.from(' [ [1,2,3] ]\n'),files=new Map([['raw/coinbase-tail-'+hash(raw)+'.json',raw]]);
  const result=await restore(await build(input(files)));
  assert.deepEqual(result.files.get([...files.keys()][0]),raw);
  const incorrect=new Map([['raw/coinbase-tail-'+'0'.repeat(64)+'.json',raw]]);
  await assert.rejects(()=>build(input(incorrect)),/body identity mismatch/);
});

test('acquisition and issuance filenames must match canonical receipt identities',async()=>{
  const value={status:'synthetic-failed-capture',kind:'synthetic-test-only'},id=await forecastHash(value);
  const built=await build(input(new Map([['acquisitions/'+id+'.json',encode(value)],['issuances/'+id+'.json',encode(value)]])));
  assert.equal(built.receipt.acquisitions,1);assert.equal(built.receipt.issuances,1);
  await assert.rejects(()=>build(input(new Map([['acquisitions/'+'a'.repeat(64)+'.json',encode(value)]]))),/identity mismatch/);
});

test('complete failed HTTP text is retained byte-for-byte without treating malformed JSON as an observation',async()=>{
  const body=Buffer.from('<html>rate limit or unavailable</html>\n'),path='raw/coinbase-tail-'+hash(body)+'.json';
  const built=await build(input(new Map([[path,body]]))),result=await restore(built);
  assert.deepEqual(result.files.get(path),body);assert.equal(result.receipt.observationCount,0);
  assert.equal(result.receipt.restoredRecords,0);assert.equal(result.receipt.newObservationsCreated,0);
});

test('captured caller maps and Buffers cannot race an asynchronous semantic validation',async()=>{
  const files=duplicate(initialFiles),promise=build(input(files));
  files.get('records/'+f.record.id+'.json').fill(0);files.clear();
  const built=await promise,result=await restore(built);
  assert.deepEqual(result.files.get('records/'+f.record.id+'.json'),initialFiles.get('records/'+f.record.id+'.json'));
});

test('per-file and record byte bounds fail before parsing untrusted evidence',async()=>{
  await assert.rejects(()=>build(input(new Map([['receipt.json',Buffer.alloc(P.maximumObjectBytes+1)]]))),/exceeds byte limit/);
  await assert.rejects(()=>build(input(new Map([['records/'+'a'.repeat(64)+'.json',Buffer.alloc(P.maximumRecordBytes+1)]]))),/descriptor/);
});

test('inventory pages split at the finite descriptor bound and restore all checkpoint bytes in the archive',async()=>{
  const files=new Map();
  for(let i=0;i<P.maximumEntriesPerPage+1;i++){
    const value=encode({kind:'synthetic-checkpoint',number:i});files.set('receipts/'+hash(value)+'.json',value);
  }
  const result=await build(input(files));
  assert.deepEqual(result.manifest.pages.map(page=>page.entries),[128,1]);
  assert.equal((await verify(result)).logicalFiles.size,129);
});

test('501 valid actual-format observations remain archived but cannot be silently pruned into a 500-observation working set',async()=>{
  const document=JSON.stringify({source:'Coinbase Exchange',product:'ETH-USD',dailyHistory:{source:'Coinbase Exchange',product:'ETH-USD',
    completedOnly:true,candles:[{date:'2024-01-01T00:00:00.000Z',open:100,high:110,low:90,close:100,volume:1},
      {date:'2024-01-02T00:00:00.000Z',open:100,high:110,low:90,close:100,volume:1}]}});
  const files=new Map();
  for(let i=0;i<501;i++){
    const outcome=await createAssetOutcomeSnapshot({symbol:'ETHUSD',sourceDocument:document,
      sourceUrl:'https://example.invalid/synthetic-only',collectedAt:new Date(Date.parse(createdAt)+i*1000).toISOString()});
    files.set('outcome-observations/'+outcome.id+'.json',encode(outcome));
  }
  const built=await build(input(files));
  assert.equal(built.receipt.observationCount,501);assert.equal(built.manifest.counts['outcome-observations'],501);
  await assert.rejects(()=>restore(built),/unchanged active observation limit/);
  assert.equal((await verify(built)).logicalFiles.size,501);
});
