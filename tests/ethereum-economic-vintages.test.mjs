import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile,cp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {resolve,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {inspectEthereumEconomicEvidence} from '../dist/ethereum-economic-evidence-coverage.js';
import {ETH_ECONOMIC_INPUT_SCHEMA} from '../dist/ethereum-economic-model.js';
import {sha256,contentId,createEconomicVintageRecord,validateEconomicVintageRecord,appendEconomicVintages,selectEconomicVintages} from '../scripts/ethereum-economic-vintages-core.mjs';
import {buildEconomicVintageLedgerFiles} from '../scripts/ethereum-economic-vintages.mjs';

const ROOT=fileURLToPath(new URL('..',import.meta.url));
const recordedAt='2026-10-27T11:00:00.000Z',asOf='2026-10-26';
function fixture({value=100,collectedAt='2026-10-27T08:00:00.000Z',recording=recordedAt,publishedAt=null,networkBody=null,failed=false,observedThrough='2026-05-23'}={}){
  const end=Date.parse(observedThrough+'T00:00:00Z'),observedFrom=new Date(end-27*86400000).toISOString().slice(0,10);
  const receipt={status:failed?'capture-failed':'success',sourceSha256:'a'.repeat(64),publishedAt,collectedAt,
    startedAt:'2026-10-27T07:50:00.000Z',finishedAt:collectedAt,sourceCommit:'c'.repeat(40),sourceTree:'d'.repeat(40),sourceHashes:{'scripts/capture.mjs':'e'.repeat(64)},
    network:networkBody?[{startedAt:'2026-10-27T07:50:00.000Z',bodyReceivedAt:networkBody,finishedAt:networkBody}]:[],
    source:{repository:'coinmetrics/data',commit:'b'.repeat(40),path:'csv/eth.csv'},summary:{latestCompleteWindow:{completeWindow:true,
      observedFrom,observedThrough,providerCompletedAt:new Date(end+86400000+3*3600000).toISOString(),
      aggregate:{totalFeesIncludingBlobEth:value,grossIssuanceEth:200,l1TransactionCount:300,providerLedgerSupplyEth:1000000}}}};
  const receiptBytes=Buffer.from(JSON.stringify(receipt)),source={kind:'coinmetrics',receipt,receiptPath:'captures/a/receipt.json',receiptSha256:sha256(receiptBytes),rawAudit:{status:'verified',replayed:true,verifiedFiles:1}};
  const report=inspectEthereumEconomicEvidence({asOf,issuedAt:recording,sources:[source]}),raw=Buffer.from('synthetic fixture raw');
  const input={source:report.sources[0],observations:report.observations,metrics:report.metrics,metricDefinitionVersion:report.metricDefinitionVersion,receipt,
    files:[{path:source.receiptPath,sha256:sha256(receiptBytes),bytes:receiptBytes.length},{path:'captures/a/data.csv',sha256:sha256(raw),bytes:raw.length}],recordedAt:recording};
  return {input,record:createEconomicVintageRecord(input)};
}
const fees=selection=>selection.selections.find(x=>x.sourceField==='FeeTotNtv');

test('freshness uses the latest completed UTC day and preserves exact zero seven eight day boundaries',()=>{
  const {record}=fixture({observedThrough:'2026-10-26'});
  for(const [cutoff,ageDays,freshness]of [['2026-10-27T08:00:00Z',0,'within-policy'],['2026-11-03T08:00:00Z',7,'within-policy'],['2026-11-04T08:00:00Z',8,'stale']]){
    const selected=fees(selectEconomicVintages([record],{cutoff}));assert.equal(selected.ageDays,ageDays);assert.equal(selected.freshness,freshness);
  }
  assert.equal(fees(selectEconomicVintages([record],{cutoff:'2026-10-27T08:00:00Z',maximumAgeDays:0})).freshness,'within-policy');
});

test('a retained archive starts availability at actual acquisition, not its old event/completion/commit date',()=>{
  const {record}=fixture();assert(validateEconomicVintageRecord(record));
  assert.equal(selectEconomicVintages([record],{cutoff:'2026-05-25T12:00:00Z'}).summary.selectedFieldWindows,0);
  assert.equal(selectEconomicVintages([record],{cutoff:'2026-10-27T07:59:59.999Z'}).summary.selectedFieldWindows,0);
  const at=selectEconomicVintages([record],{cutoff:'2026-10-27T08:00:00Z'});assert.equal(at.summary.selectedFieldWindows,4);
  assert.equal(at.summary.staleSelectedFieldWindows,4);assert.equal(fees(at).firstObservedAvailableAt,'2026-10-27T08:00:00.000Z');
  assert.equal(fees(at).publicationTimeKnown,false);assert.equal(at.summary.eligibleModelSnapshotCount,0);assert.equal(at.policy.historicalPointInTimeReady,false);
});

test('same capture is idempotent and preserves the first immutable recorded timestamp and ID',()=>{
  const first=fixture().record,later=fixture({recording:'2026-10-27T12:00:00Z'}).record;
  assert.equal(first.captureKey,later.captureKey);assert.notEqual(first.id,later.id);
  const append=appendEconomicVintages([first],[later]);assert.equal(append.newCaptureCount,0);assert.equal(append.reusedCaptureCount,1);
  assert.equal(append.records.length,1);assert.deepEqual(append.records[0],first);
});

test('later collection of unchanged data is another receipt, not a new value version or independent sample',()=>{
  const first=fixture().record,later=fixture({collectedAt:'2026-10-27T09:00:00Z'}).record;
  assert.notEqual(first.captureKey,later.captureKey);assert.equal(first.observations[0].dataVersionId,later.observations[0].dataVersionId);
  const selection=selectEconomicVintages(appendEconomicVintages([first],[later]).records,{cutoff:recordedAt});
  assert.equal(fees(selection).captureEvidenceCount,2);assert.equal(fees(selection).distinctValueVersionCount,1);
  assert.equal(fees(selection).firstObservedAvailableAt,'2026-10-27T08:00:00.000Z');assert(selection.policy.repeatedCaptureIsNotIndependentSample);
});

test('same-window revisions stay present and are selected only after their own actual collection',()=>{
  const first=fixture().record,revised=fixture({value:101,collectedAt:'2026-10-27T09:00:00Z'}).record;
  const records=appendEconomicVintages([first],[revised]).records;assert.equal(records.length,2);
  assert.equal(fees(selectEconomicVintages(records,{cutoff:'2026-10-27T08:59:59Z'})).value,100);
  const after=fees(selectEconomicVintages(records,{cutoff:'2026-10-27T09:00:00Z'}));assert.equal(after.value,101);assert.equal(after.distinctValueVersionCount,2);
  assert.equal(after.firstObservedAvailableAt,'2026-10-27T09:00:00.000Z');assert.equal(fees(selectEconomicVintages(records,{cutoff:'2026-10-27T08:00:00Z'})).value,100);
});

test('equal-clock conflicting observations are explicitly ambiguous independent of input order',()=>{
  const a=fixture().record,b=fixture({value:101}).record;
  const x=selectEconomicVintages([a,b],{cutoff:recordedAt}),y=selectEconomicVintages([b,a],{cutoff:recordedAt});
  assert.deepEqual(x,y);assert.equal(fees(x).status,'ambiguous-same-collection-clock');assert.equal(fees(x).value,undefined);
  assert.equal(x.summary.ambiguousFieldWindows,1);assert.equal(x.summary.selectedFieldWindows,3);
});

test('collection cannot precede any required response, publication, full window, or follow recording',()=>{
  assert.throws(()=>fixture({networkBody:'2026-10-27T08:01:00Z'}),/raw response/);
  const headers=fixture();headers.input.receipt.network=[{requestedAt:'2026-10-27T07:50:00Z',responseReceivedAt:'2026-10-27T07:59:59Z',completedAt:'2026-10-27T08:00:01Z',complete:true}];
  assert.throws(()=>createEconomicVintageRecord(headers.input),/raw response/);
  assert.throws(()=>fixture({publishedAt:'2026-10-27T09:00:00Z'}),/Collection predates publication/);
  assert.throws(()=>fixture({collectedAt:'2026-05-23T23:00:00Z'}),/Collection predates/);
  assert.throws(()=>fixture({collectedAt:'2026-10-27T12:00:00Z'}),/recording/);
  const f=fixture();f.input.observations[0].clocks.collectedAt='2026-10-27T08:00:01Z';assert.throws(()=>createEconomicVintageRecord(f.input),/differs from receipt/);
  const g=fixture();g.input.observations[0].clocks.providerGeneratedAt='2026-10-27T09:00:00Z';assert.throws(()=>createEconomicVintageRecord(g.input),/Provider clock/);
});

test('failed receipts remain failure evidence and cannot mint partial or complete observations',()=>{
  const {record}=fixture({failed:true});assert.equal(record.observations.length,0);assert.equal(record.collectorStatus,'capture-failed');
  assert.equal(selectEconomicVintages([record],{cutoff:recordedAt}).summary.selectedFieldWindows,0);
  const f=fixture();f.input.source.collectorStatus='capture-failed';f.input.receipt.status='capture-failed';assert.throws(()=>createEconomicVintageRecord(f.input),/Unverified\/failed/);
});

test('unverified bytes, non-replayed data, unsafe paths, duplicate files, and raw identity tampering fail',()=>{
  for(const mutate of [f=>{f.source.rawAudit.replayed=false;},f=>{f.observations[0].replayedFromRaw=false;},
    f=>{f.files[0].path='../receipt.json';},f=>{f.files.push(f.files[0]);},f=>{f.files[0].sha256='1'.repeat(64);}]){
    const f=fixture();mutate(f.input);assert.throws(()=>createEconomicVintageRecord(f.input));
  }
  for(const mutate of [r=>{r.observations[0].value++;},r=>{r.recordedAt='2026-10-27T12:00:00Z';},r=>{r.rawFiles[0].sha256='1'.repeat(64);}]){
    const r=structuredClone(fixture().record);mutate(r);assert.throws(()=>validateEconomicVintageRecord(r),/identity/);
  }
});

test('known publication does not replace actual collected time and no input schema is activated',()=>{
  const {record}=fixture({publishedAt:'2026-10-27T01:00:00Z'});
  assert.equal(selectEconomicVintages([record],{cutoff:'2026-10-27T07:00:00Z'}).summary.selectedFieldWindows,0);
  assert.equal(fees(selectEconomicVintages([record],{cutoff:recordedAt})).publicationTimeKnown,true);
  assert.equal(record.metricDefinitionVersion,ETH_ECONOMIC_INPUT_SCHEMA.snapshot.metricDefinitionVersion);
  for(const o of record.observations)assert.equal(o.modelInputActivated,false);
});

test('real pinned raw CSV produces a ledger and independent file verification rejects changed raw bytes',async()=>{
  const temp=await mkdtemp(join(tmpdir(),'eth-vintage-'));
  try{
    const capture='research-data/eth-economic-captures/20261026T121240869Z-coinmetrics';await mkdir(resolve(temp,capture),{recursive:true});
    for(const name of ['eth.csv','receipt.json'])await cp(resolve(ROOT,capture,name),resolve(temp,capture,name));
    const result=await buildEconomicVintageLedgerFiles({repositoryRoot:temp,recordedAt});
    assert.equal(result.networkRequests,0);assert.equal(result.newCaptureCount,1);assert.equal(result.distinctDataVersions,4);assert.equal(result.selection.summary.selectedFieldWindows,4);
    assert.equal(result.modelInputActivated,false);assert.equal(result.coverageVersion.startsWith('eth-economic-evidence-coverage-'),true);
    const replay=await buildEconomicVintageLedgerFiles({repositoryRoot:temp,recordedAt,verifyPreservedOnly:true});assert.equal(replay.recordCount,1);assert.equal(replay.newCaptureCount,0);assert.equal(replay.verifiedInputFiles,2);
    const csv=resolve(temp,capture,'eth.csv');await writeFile(csv,Buffer.concat([await readFile(csv),Buffer.from('\n')]));
    await assert.rejects(buildEconomicVintageLedgerFiles({repositoryRoot:temp,recordedAt,verifyPreservedOnly:true}),/raw bytes differ|raw hash differs/);
  }finally{await rm(temp,{recursive:true,force:true});}
});

test('explicit same-hash relocation preserves record identity and repeat captures reuse the committed seed',async()=>{
  const temp=await mkdtemp(join(tmpdir(),'eth-vintage-seed-'));
  try{
    const capture='research-data/eth-economic-captures/20261026T121240869Z-coinmetrics',out='build/ethereum-economic-vintages',seed='research-data/ethereum-economic-vintages';
    await mkdir(resolve(temp,capture),{recursive:true});for(const name of ['eth.csv','receipt.json'])await cp(resolve(ROOT,capture,name),resolve(temp,capture,name));
    const first=await buildEconomicVintageLedgerFiles({repositoryRoot:temp,recordedAt});await cp(resolve(temp,out),resolve(temp,seed),{recursive:true});
    const manifest=JSON.parse(await readFile(resolve(temp,seed,'files.json'))),target=manifest.files.find(f=>f.location.endsWith('eth.csv'));
    await mkdir(resolve(temp,'preserved'),{recursive:true});await cp(resolve(temp,target.location),resolve(temp,'preserved/eth.csv'));target.location='preserved/eth.csv';
    await writeFile(resolve(temp,seed,'files.json'),JSON.stringify(manifest));
    const second=await buildEconomicVintageLedgerFiles({repositoryRoot:temp,recordedAt:'2026-10-27T12:00:00Z',outputDirectory:'build/ethereum-economic-vintages-second'});
    assert.equal(second.ledgerId,first.ledgerId);assert.equal(second.newCaptureCount,0);assert.equal(second.reusedCaptureCount,1);assert.equal(second.distinctDataVersions,4);
    const oldIndex=JSON.parse(await readFile(resolve(temp,seed,'index.json'))),newIndex=JSON.parse(await readFile(resolve(temp,'build/ethereum-economic-vintages-second/index.json')));assert.deepEqual(oldIndex,newIndex);
    const oldId=oldIndex.recordIds[0];assert.deepEqual(await readFile(resolve(temp,seed,'records/'+oldId+'.json')),await readFile(resolve(temp,'build/ethereum-economic-vintages-second/records/'+oldId+'.json')));
    manifest.files.push({...manifest.files[0]});await writeFile(resolve(temp,seed,'files.json'),JSON.stringify(manifest));
    await assert.rejects(buildEconomicVintageLedgerFiles({repositoryRoot:temp,recordedAt,outputDirectory:'build/third'}),/Duplicate vintage locator/);
  }finally{await rm(temp,{recursive:true,force:true});}
});

test('seed index tampering and record omission are not silently treated as a successful replay',async()=>{
  const temp=await mkdtemp(join(tmpdir(),'eth-vintage-index-'));
  try{
    const dir='research-data/eth-economic-captures/20261026T121240869Z-coinmetrics';await mkdir(resolve(temp,dir),{recursive:true});
    for(const name of ['eth.csv','receipt.json'])await cp(resolve(ROOT,dir,name),resolve(temp,dir,name));
    await buildEconomicVintageLedgerFiles({repositoryRoot:temp,recordedAt});
    const indexPath=resolve(temp,'build/ethereum-economic-vintages/index.json'),index=JSON.parse(await readFile(indexPath));index.recordIds=[];
    await writeFile(indexPath,JSON.stringify(index));await assert.rejects(buildEconomicVintageLedgerFiles({repositoryRoot:temp,recordedAt,verifyPreservedOnly:true}),/index identity/);
    index.ledgerId=contentId([]);await writeFile(indexPath,JSON.stringify(index));await assert.rejects(buildEconomicVintageLedgerFiles({repositoryRoot:temp,recordedAt,verifyPreservedOnly:true}),/Unused raw locator/);
  }finally{await rm(temp,{recursive:true,force:true});}
});


test('rehashing changed observation values cannot defeat replay from preserved receipt and CSV',async()=>{
  const temp=await mkdtemp(join(tmpdir(),'eth-vintage-forged-'));
  try{
    const dir='research-data/eth-economic-captures/20261026T121240869Z-coinmetrics',out='build/ethereum-economic-vintages';await mkdir(resolve(temp,dir),{recursive:true});
    for(const name of ['eth.csv','receipt.json'])await cp(resolve(ROOT,dir,name),resolve(temp,dir,name));
    await buildEconomicVintageLedgerFiles({repositoryRoot:temp,recordedAt});
    const indexPath=resolve(temp,out,'index.json'),index=JSON.parse(await readFile(indexPath)),old=index.recordIds[0],record=JSON.parse(await readFile(resolve(temp,out,'records',old+'.json')));
    const o=record.observations[0];o.value+=1;const {series,sourceField,observedFrom,observedThrough,metricDefinitionVersion,value,valueRepresentation,relations}=o;
    o.dataVersionId=contentId({series,sourceField,observedFrom,observedThrough,metricDefinitionVersion,value,valueRepresentation,relations});
    const {id,kind,version,captureKey,recordedAt:clock,...capture}=record;record.captureKey=contentId(capture);const {id:unused,...body}=record;record.id=contentId(body);
    assert(validateEconomicVintageRecord(record));index.recordIds=[record.id];index.ledgerId=contentId(index.recordIds);
    await writeFile(resolve(temp,out,'records',record.id+'.json'),JSON.stringify(record));await writeFile(indexPath,JSON.stringify(index));
    await assert.rejects(buildEconomicVintageLedgerFiles({repositoryRoot:temp,recordedAt,verifyPreservedOnly:true}),/do not replay/);
  }finally{await rm(temp,{recursive:true,force:true});}
});


test('standalone selection rejects rehashed semantic clock/verification violations without filesystem IO',()=>{
  for(const mutate of [r=>{r.observations[0].clocks.collectedAt='2026-05-23T23:00:00Z';r.observations[0].availabilityUpperBound='2026-05-23T23:00:00Z';},
    r=>{r.observations[0].replayedFromRaw=false;},r=>{r.observations[0].publicationTimeKnown=true;},r=>{r.observations[0].clocks.observedFrom='2026-04-25';}]){
    const record=structuredClone(fixture().record);mutate(record);const {id,kind,version,captureKey,recordedAt:clock,...capture}=record;record.captureKey=contentId(capture);const {id:unused,...body}=record;record.id=contentId(body);
    assert.throws(()=>selectEconomicVintages([record],{cutoff:recordedAt}),/window|verification|Publication/);
  }
});
