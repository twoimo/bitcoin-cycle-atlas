import {frozenMarketText} from './helpers/frozen-market-fixture.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir,mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFileSync} from 'node:child_process';
import {canonicalForecastJson} from '../dist/forecast-records.js';
import {planEthereumResearchPriceRequest,createEthereumResearchSnapshot,ETH_PROSPECTIVE_PRICE_POLICY} from '../dist/ethereum-prospective-prices.js';
import {evaluateEthereumProspectiveRecords} from '../dist/ethereum-prospective-dispatch.js';
import {createAssetOutcomeSnapshot} from '../dist/asset-outcome-records.js';
import {buildEthereumProspectiveArchive} from '../scripts/ethereum-prospective-archive-core.mjs';
import {ETH_ARCHIVE_IO_PATHS as P,readEthereumArchiveDirectory,writeEthereumArchiveDirectory} from '../scripts/manage-ethereum-prospective-archive.mjs';
import {openEthereumProspectiveArchiveSource,ethereumProspectiveArchiveSourceInfo,visitEthereumProspectiveArchiveRecords,
  visitEthereumProspectiveArchiveObservations,readEthereumProspectiveArchiveFile} from '../scripts/ethereum-prospective-archive-source.mjs';
import {collectEthereumArchiveModelIdentities,replayEthereumArchiveSource,evaluateEthereumArchiveSource} from '../scripts/ethereum-prospective-archive-issuer.mjs';
import {restoreEthereumArchiveOperations,openEthereumActiveArchiveSource,issueEthereumArchiveOperations,
  readinessEthereumArchiveOperations,appendEthereumArchiveOperations,verifyEthereumArchiveOperations,preflightEthereumArchiveDelta} from '../scripts/ethereum-prospective-archive-operations.mjs';
import {captureEthereumResearchTail} from '../scripts/ethereum-prospective-collector-core.mjs';
import {ethereumOperationJson as encoded,readEthereumOperationJson} from '../scripts/ethereum-prospective-operation-io.mjs';
import {prospectiveFixture} from './helpers/eth-prospective-fixture.mjs';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..'),DAY=86400000;
const sourceIdentity={sourceCommit:'a'.repeat(40),sourceTree:'b'.repeat(40),runId:null};
const json=canonicalForecastJson;
async function temporary(t,prefix='eth-archive-issuer-'){
  const repositoryRoot=await mkdtemp(resolve(tmpdir(),prefix));t.after(()=>rm(repositoryRoot,{recursive:true,force:true}));return repositoryRoot;
}
function componentEvaluations(result){return result.report.componentPages.flatMap(page=>JSON.parse(result.files.get(page.path).toString('utf8')).entries);}
async function syntheticSource(t,{observations=[],independent=[]}={}){
  const fixture=await prospectiveFixture(),repositoryRoot=await temporary(t);
  const files=new Map([['records/'+fixture.record.id+'.json',encoded(fixture.record)],['snapshots/'+fixture.snapshot.id+'.json',encoded(fixture.snapshot)]]);
  for(const value of observations)files.set('observations/'+value.id+'.json',encoded(value));
  for(const value of independent)files.set('outcome-observations/'+value.id+'.json',encoded(value));
  const archive=await buildEthereumProspectiveArchive({files,source:sourceIdentity,createdAt:'2026-10-28T05:00:00.000Z'});
  await writeEthereumArchiveDirectory({repositoryRoot,path:'archive',files:archive.files});
  return {...fixture,repositoryRoot,source:await openEthereumProspectiveArchiveSource({repositoryRoot,archivePath:'archive'})};
}
async function syntheticObservation(fixture,price=125,offset=0){
  const at=Date.parse(fixture.record.targets.at(-1).eventAt)+7200000+offset;
  const requestStartedAt=new Date(at).toISOString(),bodyCompletedAt=new Date(at+1000).toISOString();
  const request=planEthereumResearchPriceRequest(fixture.base.text,requestStartedAt);
  const rows=Array.from({length:(request.requestedEnd-request.requestedStart)/86400},(_,i)=>[
    request.requestedStart+i*86400,price*.9,price*1.1,price,price,10]).reverse();
  return createEthereumResearchSnapshot({base:fixture.base,tail:{text:JSON.stringify(rows),requestStartedAt,bodyCompletedAt,sourceUrl:request.sourceUrl}});
}

test('actual preserved model replay is exact and page evaluation matches original bounded evaluator rows',async()=>{
  const source=await openEthereumProspectiveArchiveSource({repositoryRoot:root,archivePath:P.seed,
    prospectivePaths:['research-data/ethereum-prospective-ledger'],outcomePaths:['research-data/asset-outcome-ledger']});
  const identities=await collectEthereumArchiveModelIdentities(root),replay=await replayEthereumArchiveSource({source,models:identities.models});
  assert.equal(replay.report.replayedRecords,3);assert.equal(replay.report.networkRequests,0);assert.equal(replay.report.originalRecordsChanged,false);
  const records=[],snapshots={},observations=[];
  await visitEthereumProspectiveArchiveRecords(source,(record,snapshot)=>{records.push(record);snapshots[snapshot.id]=snapshot;});
  await visitEthereumProspectiveArchiveObservations(source,snapshot=>{if(snapshot.kind==='ethereum-prospective-input')observations.push(snapshot);});
  const evaluatedAt='2026-10-28T06:00:00.000Z';
  const old=await evaluateEthereumProspectiveRecords({records,snapshots,observations,evaluatedAt,...identities});
  const result=await evaluateEthereumArchiveSource({source,evaluatedAt,...identities}),components=componentEvaluations(result);
  assert.deepEqual(components.flatMap(value=>value.rows),old.rows);
  assert.equal(result.report.records,3);assert.equal(result.report.pending,9);assert.equal(result.report.scored,0);
  assert.equal(result.report.kind,'ethereum-prospective-paged-evaluation');assert.notEqual(result.report.id,old.id);
  assert.ok([...result.files.keys()].every(path=>path.startsWith('receipts/')),'complete original component receipts are packed, not one Git file per retained forecast');
  assert.ok(result.report.observationSelection.ignoredObservationIds.length>0);
});

test('synthetic mature targets have identical exact scores and future-vintage exclusion under original evaluator',async t=>{
  // Synthetic clocks/prices prove scorer equality; they are not market history.
  const fixture=await prospectiveFixture(),observed=await syntheticObservation(fixture),future=await syntheticObservation(fixture,140,3600000);
  const rows=fixture.record.targets.map(target=>({date:target.targetDate+'T00:00:00.000Z',open:999,high:1000,low:998,close:999,volume:1}));
  const independent=await createAssetOutcomeSnapshot({symbol:'ETHUSD',sourceDocument:JSON.stringify({source:'Coinbase Exchange',product:'ETH-USD',
    dailyHistory:{source:'Coinbase Exchange',product:'ETH-USD',completedOnly:true,candles:rows}}),
    sourceUrl:'https://example.invalid/synthetic-ignored-independent',collectedAt:observed.informationCutoffAt});
  const f=await syntheticSource(t,{observations:[observed,future],independent:[independent]}),evaluatedAt=observed.informationCutoffAt;
  const old=await evaluateEthereumProspectiveRecords({records:[f.record],snapshots:{[f.snapshot.id]:f.snapshot},observations:[observed,future],evaluatedAt,evaluator:f.evaluator});
  const result=await evaluateEthereumArchiveSource({source:f.source,evaluatedAt,evaluator:f.evaluator});
  assert.deepEqual(componentEvaluations(result).flatMap(value=>value.rows),old.rows);
  assert.equal(result.report.scored,3);assert.equal(result.report.pending,0);
  assert.deepEqual(result.report.observationSelection.futureObservationIds,[future.id]);
  assert.deepEqual(result.report.observationSelection.ignoredObservationIds,[independent.id]);
  for(const row of old.rows){assert.equal(row.actual,125);assert.equal(row.source.snapshotId,observed.id);}
});

test('an older same-clock conflict remains fatal even when a newer valid snapshot wins every target',async t=>{
  const fixture=await prospectiveFixture(),a=await syntheticObservation(fixture,125),b=await syntheticObservation(fixture,126),latest=await syntheticObservation(fixture,130,3600000);
  const f=await syntheticSource(t,{observations:[a,b,latest]});
  await assert.rejects(evaluateEthereumArchiveSource({source:f.source,evaluatedAt:latest.informationCutoffAt,evaluator:f.evaluator}),/globally retained.*Ambiguous/);
  await assert.rejects(evaluateEthereumProspectiveRecords({records:[f.record],snapshots:{[f.snapshot.id]:f.snapshot},observations:[a,b,latest],
    evaluatedAt:latest.informationCutoffAt,evaluator:f.evaluator}),/Ambiguous/);
});

test('a schema-valid synthetic graph cannot impersonate an actual committed model replay',async t=>{
  const f=await syntheticSource(t),identities=await collectEthereumArchiveModelIdentities(root);
  await assert.rejects(replayEthereumArchiveSource({source:f.source,models:identities.models}),/same committed model source/);
});

async function committedOperationFixture(t){
  const repositoryRoot=await temporary(t,'eth-archive-operation-git-'),identities=await collectEthereumArchiveModelIdentities(root);
  const paths=new Set([...Object.keys(identities.evaluator.files),...Object.keys(identities.warmStartEvaluator.files),ETH_PROSPECTIVE_PRICE_POLICY.basePath]);
  for(const path of paths){const output=resolve(repositoryRoot,path);await mkdir(dirname(output),{recursive:true});await writeFile(output,path===ETH_PROSPECTIVE_PRICE_POLICY.basePath?await frozenMarketText('eth-ohlc'):await readFile(resolve(root,path)));}
  const git=(...args)=>execFileSync('git',args,{cwd:repositoryRoot,encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim();
  git('init','--initial-branch=main');git('config','user.name','Synthetic operations test');git('config','user.email','synthetic@example.invalid');
  git('add','dist');git('commit','-m','Synthetic isolated fixture with exact committed model and base bytes');
  const identity={sourceCommit:git('rev-parse','HEAD'),sourceTree:git('rev-parse','HEAD^{tree}'),runId:null};
  for(const path of [P.seed,'research-data/ethereum-prospective-ledger','research-data/asset-outcome-ledger'])
    await writeEthereumArchiveDirectory({repositoryRoot,path,files:await readEthereumArchiveDirectory(resolve(root,path))});
  await restoreEthereumArchiveOperations({repositoryRoot,now:()=> '2026-10-28T05:00:00.000Z'});
  let ms=Date.parse('2026-10-28T05:00:00.000Z'),liveClose=3050;
  const now=()=>new Date(ms+=1000).toISOString();
  const capture=({baseText})=>captureEthereumResearchTail({baseText,clock:now,fetchImpl:async url=>{
    const parsed=new URL(url),start=Date.parse(parsed.searchParams.get('start'))/1000,end=Date.parse(parsed.searchParams.get('end'))/1000;
    const rows=Array.from({length:(end-start)/86400},(_,i)=>[start+i*86400,2900,3100,3000,3001,10]);
    rows.push([end,2900,3200,3000,liveClose++,20]);
    return new Response(JSON.stringify(rows.reverse()),{status:200,headers:{'Content-Type':'application/json'}});
  }});
  return {repositoryRoot,sourceIdentity:identity,now,capture};
}

test('isolated real-model operations issue once, reuse same completed input, replay, report and append original clocks exactly',async t=>{
  // Acquisition rows and advancing clocks are synthetic; the frozen model code
  // and committed base bytes are exact. No real provider request occurs.
  const f=await committedOperationFixture(t);
  const first=await issueEthereumArchiveOperations(f);assert.equal(first.status,'issued-or-reused',json(first.errors));assert.equal(first.newRecords,3);assert.equal(first.reusedRecords,0);
  const firstSource=await openEthereumActiveArchiveSource(f),saved=new Map();
  for(const decision of first.decisions)saved.set(decision.id,await readEthereumProspectiveArchiveFile(firstSource,'records/'+decision.id+'.json'));
  const second=await issueEthereumArchiveOperations(f);assert.equal(second.status,'issued-or-reused',json(second.errors));assert.equal(second.newRecords,0);assert.equal(second.reusedRecords,3);
  assert.deepEqual(second.recordIssuedAt,first.recordIssuedAt);assert.deepEqual(second.decisions.map(row=>row.id),first.decisions.map(row=>row.id));
  assert.notEqual(second.actualCaptureSnapshotId,first.actualCaptureSnapshotId);assert.equal(second.totalRecords,6);
  const source=await openEthereumActiveArchiveSource(f),identities=await collectEthereumArchiveModelIdentities(f.repositoryRoot);
  for(const [id,bytes]of saved)assert.deepEqual(await readEthereumProspectiveArchiveFile(source,'records/'+id+'.json'),bytes);
  const replay=await replayEthereumArchiveSource({source,models:identities.models});assert.equal(replay.report.replayedRecords,6);
  const readiness=await readinessEthereumArchiveOperations({...f,informationCutoffAt:f.now()});
  assert.equal(readiness.report.actualSourceReplay.replayedRecords,6);assert.equal(readiness.report.readiness.readyBindings,0);
  assert.equal(readiness.report.actualFreezesCreated,0);assert.ok(readiness.report.readiness.results.every(row=>row.status==='insufficient-calibration-cases'));
  const appended=await appendEthereumArchiveOperations(f);assert.equal(appended.newRecordIds.length,3);assert.equal(appended.newObservationIds.length,2);
  assert.equal(appended.existingRecordsChanged,false);assert.equal((await verifyEthereumArchiveOperations(f)).records,6);
  const delta=await readEthereumOperationJson(f.repositoryRoot,P.prospective+'/index.json');assert.equal(delta.entries.length,3,'current delta never duplicates all archived records');
});

test('a failed complete HTTP body is preserved without a new record, observation, or successful issuance',async t=>{
  const f=await committedOperationFixture(t),before=ethereumProspectiveArchiveSourceInfo(await openEthereumActiveArchiveSource(f));
  const capture=({baseText})=>captureEthereumResearchTail({baseText,clock:f.now,fetchImpl:async()=>new Response('<html>synthetic unavailable</html>',{status:503})});
  const result=await issueEthereumArchiveOperations({...f,capture});assert.equal(result.status,'blocked');assert.equal(result.newRecords,0);assert.equal(result.prospectiveScoredTargets,0);
  const after=ethereumProspectiveArchiveSourceInfo(await openEthereumActiveArchiveSource(f));assert.deepEqual(after.recordIds,before.recordIds);assert.deepEqual(after.observationIds,before.observationIds);
  const files=await readEthereumArchiveDirectory(resolve(f.repositoryRoot,P.prospective));
  assert.equal([...files.keys()].filter(path=>path.startsWith('acquisitions/')).length,1);
  const raw=[...files].find(([path])=>path.startsWith('raw/'));assert.equal(raw[1].toString(),'<html>synthetic unavailable</html>');
  const receipt=await readEthereumOperationJson(f.repositoryRoot,P.prospective+'/receipt.json');assert.equal(receipt.status,'blocked');
  const appended=await appendEthereumArchiveOperations(f);assert.deepEqual(appended.newRecordIds,[]);assert.deepEqual(appended.newObservationIds,[]);
});

test('preflight rejects a conflicting immutable input without writing a candidate file',async t=>{
  const f=await committedOperationFixture(t),source=await openEthereumActiveArchiveSource(f),info=ethereumProspectiveArchiveSourceInfo(source);
  const path='records/'+info.recordIds[0]+'.json',bad=Buffer.from(await readEthereumProspectiveArchiveFile(source,path));bad[bad.length-2]^=1;
  await assert.rejects(preflightEthereumArchiveDelta({...f,files:new Map([[path,bad]])}),/conflicts with original evidence/);
  const files=await readEthereumArchiveDirectory(resolve(f.repositoryRoot,P.prospective));assert.deepEqual([...files.keys()],['index.json']);
});
