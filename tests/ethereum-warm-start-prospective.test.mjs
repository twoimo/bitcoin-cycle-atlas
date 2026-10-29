import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {resolve,dirname,relative} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {canonicalForecastJson,forecastHash} from '../dist/forecast-records.js';
import {createEthereumResearchSnapshot,rebuildEthereumResearchPrices} from '../dist/ethereum-prospective-prices.js';
import * as legacy from '../dist/ethereum-prospective-records.js';
import * as dispatch from '../dist/ethereum-prospective-dispatch.js';
import {
  ETH_WARM_START_PROSPECTIVE_POLICY,ETH_WARM_START_PROSPECTIVE_ENTRY,
  buildEthereumWarmStartProspectiveForecast,createEthereumWarmStartProspectiveRecord,
} from '../dist/ethereum-warm-start-prospective.js';
import {decideEthereumProspectiveIssue} from '../scripts/ethereum-prospective-reuse.mjs';
import {parseEthereumProspectiveArguments} from '../scripts/ethereum-prospective-options.mjs';

const root=fileURLToPath(new URL('..',import.meta.url)),stored=resolve(root,'research-data/ethereum-prospective-ledger');
const json=canonicalForecastJson,sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const blob=bytes=>createHash('sha1').update('blob '+Buffer.byteLength(bytes)+'\0').update(bytes).digest('hex');
const ORIGINALS={
  '563d087f19a5062981714ed6fee1f96dd5afe77a87a4c435979b000451189a9b':'28aee2d90c339465d759f84997ff07cfbd694745',
  'f1f0bf98496c1d6e9339ae9410a51c904571524d3ade88fc935cf6f58df3fed1':'b2693e3ddbd87232b52c14d5cdf3c13e578540d1',
};
const ORIGINAL_SNAPSHOT='bda159c9e30ad2f8977969d6d5f589d31cbbf60d904866807ab7216e3d023a59';
async function sourceIdentity(entry,version){
  // Test-only source receipt; this does not issue or persist a real candidate.
  const files={};
  async function visit(path){
    const key=relative(root,path).replaceAll('\\','/');if(files[key])return;
    const bytes=await readFile(path),text=bytes.toString('utf8');files[key]=sha(bytes);
    for(const match of text.matchAll(/(?:from\s*|import\s*)['"](\.[^'"]+)['"]/g))await visit(resolve(dirname(path),match[1].split('?')[0]));
  }
  await visit(resolve(root,entry));return {version,sourceCommit:'d'.repeat(40),files,sourceHash:await forecastHash(files)};
}
async function retained(){
  const index=JSON.parse(await readFile(resolve(stored,'index.json'),'utf8')),records=[],snapshots={};
  for(const entry of index.entries){
    const record=JSON.parse(await readFile(resolve(stored,entry.recordPath),'utf8'));
    snapshots[record.snapshotId]??=JSON.parse(await readFile(resolve(stored,entry.snapshotPath),'utf8'));
    records.push(record);
  }
  return {index,records,snapshots};
}
let fixturePromise;
async function fixture(){
  fixturePromise??=(async()=>{
    const original=await retained(),snapshot=original.snapshots[ORIGINAL_SNAPSHOT];
    const prices=rebuildEthereumResearchPrices({baseText:snapshot.base.text,tailText:snapshot.tail.text,
      requestStartedAt:snapshot.tail.requestStartedAt,bodyCompletedAt:snapshot.tail.bodyCompletedAt,sourceUrl:snapshot.tail.sourceUrl});
    const model=await sourceIdentity(ETH_WARM_START_PROSPECTIVE_ENTRY,ETH_WARM_START_PROSPECTIVE_POLICY.modelVersion);
    const forecast=buildEthereumWarmStartProspectiveForecast({ethHistory:prices.archive,asOf:snapshot.asOf});
    const timestamp=offset=>new Date(Date.parse(snapshot.informationCutoffAt)+offset).toISOString();
    const args={snapshot,forecast,model,modelKey:'warmStart',generationStartedAt:timestamp(1000),generatedAt:timestamp(2000),issuedAt:timestamp(3000)};
    return {...original,snapshot,model,forecast,args,record:await dispatch.createEthereumProspectiveRecord(args),
      evaluator:await sourceIdentity('dist/ethereum-prospective-records.js','eth-prospective-evaluator-1'),
      warmStartEvaluator:{...model,version:'eth-warm-start-prospective-evaluator-1'}};
  })();return fixturePromise;
}
async function variant(f,{offset=60000,editCompleted,excluded=true,forecast=f.forecast,model=f.model}={}){
  const rows=JSON.parse(f.snapshot.tail.text).filter(row=>row[0]<f.snapshot.request.requestedEnd);
  if(editCompleted)editCompleted(rows);
  if(excluded){
    const price=f.snapshot.primaryPrices.at(-1)[1];
    rows.unshift([f.snapshot.request.requestedEnd,price*.99,price*1.01,price,price,17]);
  }
  const shift=time=>new Date(Date.parse(time)+offset).toISOString();
  const tail={...f.snapshot.tail,text:JSON.stringify(rows),requestStartedAt:shift(f.snapshot.tail.requestStartedAt),bodyCompletedAt:shift(f.snapshot.tail.bodyCompletedAt)};
  const snapshot=await createEthereumResearchSnapshot({base:f.snapshot.base,tail});
  const record=await dispatch.createEthereumProspectiveRecord({...f.args,snapshot,forecast,model,
    generationStartedAt:shift(f.args.generationStartedAt),generatedAt:shift(f.args.generatedAt),issuedAt:shift(f.args.issuedAt)});
  return {snapshot,record};
}

test('default issuer remains the original two candidates; warm-start is an explicit combinable opt-in',()=>{
  assert.deepEqual(parseEthereumProspectiveArguments(),{verifyOnly:false,includeWarmStart:false,modelKeys:['adaptive','pooled']});
  assert.deepEqual(parseEthereumProspectiveArguments(['--verify-preserved-only']).modelKeys,['adaptive','pooled']);
  assert.deepEqual(parseEthereumProspectiveArguments(['--include-warm-start']).modelKeys,['adaptive','pooled','warmStart']);
  const combined=parseEthereumProspectiveArguments(['--verify-preserved-only','--include-warm-start']);
  assert.equal(combined.verifyOnly,true);assert.equal(combined.includeWarmStart,true);
  for(const flags of [['--warm'],['--include-warm-start','--include-warm-start'],['--verify-preserved-only','--verify-preserved-only']])
    assert.throws(()=>parseEthereumProspectiveArguments(flags),/Unsupported|duplicate/);
});

test('original two records, snapshot and 14-file model graph remain exact after optional extension',async()=>{
  const f=await fixture(),old=f.records.filter(record=>Object.hasOwn(ORIGINALS,record.id));
  assert.equal(old.length,2); // The two original IDs, not the total growing ledger size.
  assert.equal(blob(await readFile(resolve(stored,'snapshots/'+ORIGINAL_SNAPSHOT+'.json'))),'15e6fffea29b75ff69c2763f8264823cff0d3115');
  for(const record of old){
    assert.equal(blob(await readFile(resolve(stored,'records/'+record.id+'.json'))),ORIGINALS[record.id]);
    assert.equal(record.issuedAt,'2026-10-27T07:44:13.396Z');
    const model=await sourceIdentity('dist/ethereum-prospective-records.js',record.model.version);
    assert.equal(model.sourceHash,'cb316276ae79f90cd44d31d7ef4ad7d404c9ced4bb49d957bb4f6f94ed030491');
    assert.deepEqual(model.files,record.model.files);assert.equal(Object.keys(model.files).length,14);
    assert.equal(await dispatch.verifyEthereumProspectiveRecord(record,f.snapshots[record.snapshotId]),record);
    assert.deepEqual(await dispatch.replayEthereumProspectiveRecord({record,snapshot:f.snapshots[record.snapshotId],currentModel:model}),
      await legacy.replayEthereumProspectiveRecord({record,snapshot:f.snapshots[record.snapshotId],currentModel:model}));
  }
});

test('separate warm-start record binds its full 731-point forecast, initial detector state and unchanged baselines',async()=>{
  const f=await fixture(),r=f.record;
  assert.equal(r.modelKey,'warmStart');assert.equal(r.recordPolicy,ETH_WARM_START_PROSPECTIVE_POLICY.version);
  assert.notEqual(r.model.sourceHash,f.evaluator.sourceHash);assert.equal(r.output.path.length,731);
  assert.deepEqual(r.output.columns,['date','median','q10','q90','representative']);
  assert.equal(r.output.training.preMergeReturnsUsed,0);assert.equal(r.output.training.preMergeRiskDaysUsed,0);
  assert.equal(r.output.training.initialization.stateKnown,true);assert.equal(r.output.training.unclassifiedReturns,0);
  assert.deepEqual(r.targets.map(target=>target.horizonDays),[30,90,180]);
  const original=f.records.find(record=>record.id===Object.keys(ORIGINALS)[0]);
  assert.deepEqual(r.benchmarks,original.benchmarks);
  assert.equal(r.legacyEvidenceTransferred,false);assert.equal(r.prospectiveAccuracyProven,false);
  assert.equal(r.productionAdopted,false);assert.equal(r.calibrated,false);
  assert.equal(r.output.representativeContainmentRequired,false);
  assert.ok(r.model.files['dist/ethereum-warm-start-model.js']);assert.ok(r.model.files[ETH_WARM_START_PROSPECTIVE_ENTRY]);
  assert.ok(!Object.hasOwn(ORIGINALS,r.id));assert.ok(!f.records.some(record=>record.runKey===r.runKey));
});

test('warm-start replay recomputes its model from preserved raw bytes and rejects a rehashed output cache',async()=>{
  const f=await fixture(),inputBefore=json(f.snapshot);
  const replay=await dispatch.replayEthereumProspectiveRecord({record:f.record,snapshot:f.snapshot,currentModel:f.model});
  assert.equal(replay.points,731);assert.equal(replay.id,f.record.id);assert.equal(replay.recordIdentityEqual,true);
  assert.equal(json(f.snapshot),inputBefore);
  const forecast=structuredClone(f.forecast);forecast.path[17].price*=1.01;
  const forged=await dispatch.createEthereumProspectiveRecord({...f.args,forecast});
  await dispatch.verifyEthereumProspectiveRecord(forged,f.snapshot); // Byte/schema verification is distinct from model re-execution.
  await assert.rejects(dispatch.replayEthereumProspectiveRecord({record:forged,snapshot:f.snapshot,currentModel:f.model}),/re-execution/);
  const snapshot=structuredClone(f.snapshot);snapshot.primaryPrices[0][1]*=2;
  await assert.rejects(dispatch.verifyEthereumProspectiveRecord(f.record,snapshot),/snapshot source|mismatch/);
});

test('warm identity, clocks, policy and initialization claims are fail-closed',async()=>{
  const f=await fixture();
  const files={...f.model.files};delete files['dist/ethereum-warm-start-model.js'];
  await assert.rejects(dispatch.createEthereumProspectiveRecord({...f.args,model:{...f.model,files,sourceHash:await forecastHash(files)}}),/graph/);
  await assert.rejects(dispatch.createEthereumProspectiveRecord({...f.args,model:{...f.model,version:'eth-adaptive-research-1'}}),/identity/);
  await assert.rejects(dispatch.createEthereumProspectiveRecord({...f.args,modelKey:'unknown'}),/identity/);
  await assert.rejects(createEthereumWarmStartProspectiveRecord({...f.args,modelKey:'adaptive'}),/own model key/);
  await assert.rejects(dispatch.createEthereumProspectiveRecord({...f.args,issuedAt:f.snapshot.informationCutoffAt}),/order/);
  await assert.rejects(dispatch.createEthereumProspectiveRecord({...f.args,issuedAt:new Date(Date.parse(f.args.issuedAt)+86400000).toISOString()}),/current completed/);
  for(const mutate of [x=>x.metadata.seed++,x=>x.metadata.calibrated=true,x=>x.training.preMergeReturnsUsed=1,
    x=>x.metadata.initializationChangesClassification=false,x=>x.path[0].price*=2,x=>x.path[30].baselinePrice=x.path[30].high*2]){
    const forecast=structuredClone(f.forecast);mutate(forecast);
    await assert.rejects(dispatch.createEthereumProspectiveRecord({...f.args,forecast}),/policy|initialization|anchor|quantile|training/i);
  }
});

test('same completed warm input reuses its earliest issue; completed OHLCV and model revisions remain separate',async()=>{
  const f=await fixture(),v=await variant(f),records=[f.record],snapshots={[f.snapshot.id]:f.snapshot};
  assert.notEqual(v.snapshot.tail.sourceHash,f.snapshot.tail.sourceHash);assert.notEqual(v.record.runKey,f.record.runKey);
  const decision=await decideEthereumProspectiveIssue({records,snapshots,candidate:v.record,candidateSnapshot:v.snapshot});
  assert.equal(decision.action,'reuse');assert.equal(decision.record.id,f.record.id);assert.equal(decision.record.issuedAt,f.record.issuedAt);
  assert.equal(decision.record.snapshotId,f.snapshot.id);assert.equal(decision.reason,'same-completed-input-excluded-rows-may-differ');
  const changed=await variant(f,{editCompleted:rows=>{rows[0][5]+=1;}});
  assert.equal((await decideEthereumProspectiveIssue({records,snapshots,candidate:changed.record,candidateSnapshot:changed.snapshot})).action,'append');
  const files={...f.model.files,'dist/ethereum-warm-start-model.js':'e'.repeat(64)},model={...f.model,files,sourceHash:await forecastHash(files)};
  const revised=await variant(f,{model});
  assert.equal((await decideEthereumProspectiveIssue({records,snapshots,candidate:revised.record,candidateSnapshot:revised.snapshot})).action,'append');
  await assert.rejects(decideEthereumProspectiveIssue({records:[v.record],snapshots:{[v.snapshot.id]:v.snapshot},candidate:f.record,candidateSnapshot:f.snapshot}),/issued after/);
});

test('same completed input with altered warm output or targets cannot be accepted as a replay',async()=>{
  const f=await fixture(),forecast=structuredClone(f.forecast);forecast.path[30].price*=1.01;
  const changed=await variant(f,{forecast});
  await assert.rejects(decideEthereumProspectiveIssue({records:[f.record],snapshots:{[f.snapshot.id]:f.snapshot},
    candidate:changed.record,candidateSnapshot:changed.snapshot}),/Same completed-input/);
  const corrupted=structuredClone(f.record);corrupted.targets[0].median*=2;
  const {id,...body}=corrupted;corrupted.id=await forecastHash(body);
  await assert.rejects(dispatch.verifyEthereumProspectiveRecord(corrupted,f.snapshot),/mismatch/);
});

test('legacy-only evaluation remains byte-for-byte the original and mixed evaluation preserves its component unchanged',async()=>{
  const f=await fixture(),old=f.records.filter(record=>Object.hasOwn(ORIGINALS,record.id));
  const common={snapshots:f.snapshots,observations:[f.snapshot],evaluatedAt:f.args.issuedAt,evaluator:f.evaluator,warmStartEvaluator:f.warmStartEvaluator};
  const expected=await legacy.evaluateEthereumProspectiveRecords({...common,records:old});
  assert.deepEqual(await dispatch.evaluateEthereumProspectiveRecords({...common,records:old}),expected);
  const records=[old[0],f.record,old[1]],mixed=await dispatch.evaluateEthereumProspectiveRecords({...common,records});
  assert.deepEqual(mixed.componentEvaluations[0],expected);
  assert.deepEqual(mixed.rows.map(row=>row.recordId),records.flatMap(record=>Array(3).fill(record.id)));
  assert.equal(mixed.records,3);assert.equal(mixed.uniqueOrigins,1);assert.equal(mixed.pending,9);assert.equal(mixed.scored,0);
  assert.equal(mixed.legacyEvidenceTransferred,false);assert.equal(mixed.futureObservationVintagesExcluded,0);
  assert.ok(mixed.rows.every(row=>row.actual===null&&row.scores===null));
  const {id,...body}=mixed;assert.equal(id,await forecastHash(body));
});

test('warm evaluation cannot borrow old issuance or create scores at an uncollected future target',async()=>{
  const f=await fixture(),old=f.records.filter(record=>Object.hasOwn(ORIGINALS,record.id));
  const common={records:[...old,f.record],snapshots:f.snapshots,observations:[f.snapshot],evaluator:f.evaluator,warmStartEvaluator:f.warmStartEvaluator};
  await assert.rejects(dispatch.evaluateEthereumProspectiveRecords({...common,evaluatedAt:old[0].issuedAt}),/before actual issuance/);
  await assert.rejects(dispatch.evaluateEthereumProspectiveRecords({...common,evaluatedAt:f.args.issuedAt,warmStartEvaluator:f.evaluator}),/identity/);
  const missing=await dispatch.evaluateEthereumProspectiveRecords({...common,evaluatedAt:f.record.targets[0].eventAt});
  assert.equal(missing.missingObservations,3);assert.equal(missing.pending,6);assert.equal(missing.scored,0);
  assert.ok(missing.rows.every(row=>row.actual===null&&row.scores===null));
  await assert.rejects(dispatch.evaluateEthereumProspectiveRecords({...common,records:[f.record,f.record],evaluatedAt:f.args.issuedAt}),/Unique bounded/);
});

test('the retained growing ledger accepts warm entries without weakening original record invariants',async()=>{
  const f=await fixture();
  for(const entry of f.index.entries){
    assert.ok(['adaptive','pooled','warmStart'].includes(entry.modelKey));
    const record=f.records.find(record=>record.id===entry.id),snapshot=f.snapshots[entry.snapshotId];
    await dispatch.verifyEthereumProspectiveRecord(record,snapshot);
    assert.deepEqual(dispatch.ethereumProspectiveIndexEntry(record),entry);
    if(record.modelKey==='warmStart'){
      assert.equal(record.legacyEvidenceTransferred,false);
      const replay=await dispatch.replayEthereumProspectiveRecord({record,snapshot,currentModel:f.model});
      assert.equal(replay.recordIdentityEqual,true);assert.equal(replay.points,731);
    }
  }
  for(const id of Object.keys(ORIGINALS))assert.ok(f.index.entries.some(entry=>entry.id===id));
});
