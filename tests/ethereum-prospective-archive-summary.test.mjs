import {frozenMarketText} from './helpers/frozen-market-fixture.mjs';
import test,{after} from 'node:test';
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir,mkdtemp,rm,cp} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFileSync} from 'node:child_process';
import {canonicalForecastJson,forecastHash} from '../dist/forecast-records.js';
import {ETH_PROSPECTIVE_PRICE_POLICY} from '../dist/ethereum-prospective-prices.js';
import {createEthereumProspectiveRecord,ethereumProspectiveIndexEntry} from '../dist/ethereum-prospective-dispatch.js';
import {createAssetOutcomeSnapshot,assetOutcomeSnapshotEntry} from '../dist/asset-outcome-records.js';
import {readEthereumArchiveDirectory,writeEthereumArchiveDirectory} from '../scripts/manage-ethereum-prospective-archive.mjs';
import {collectEthereumArchiveModelIdentities} from '../scripts/ethereum-prospective-archive-issuer.mjs';
import {ETH_ARCHIVE_OPERATION_PATHS as P,restoreEthereumArchiveOperations,issueEthereumArchiveOperations,
  replayEthereumArchiveOperations,openEthereumActiveArchiveSource} from '../scripts/ethereum-prospective-archive-operations.mjs';
import {ethereumProspectiveArchiveSourceInfo} from '../scripts/ethereum-prospective-archive-source.mjs';
import {captureEthereumResearchTail} from '../scripts/ethereum-prospective-collector-core.mjs';
import {readEthereumProspectiveArchiveSummary as summary} from '../scripts/ethereum-prospective-archive-summary.mjs';
import {ethereumOperationJson as encoded,ethereumOperationSha as sha} from '../scripts/ethereum-prospective-operation-io.mjs';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..'),json=canonicalForecastJson;
const read=async(repositoryRoot,path)=>JSON.parse(await readFile(resolve(repositoryRoot,path),'utf8'));
async function put(repositoryRoot,path,bytes){const full=resolve(repositoryRoot,path);await mkdir(dirname(full),{recursive:true});await writeFile(full,bytes);}
async function signed(value){const {id,...body}=value;return {id:await forecastHash(body),...body};}
const summarize=f=>summary({repositoryRoot:f.repositoryRoot,...f.sourceIdentity});
let preparedPromise,preparedRoot;
after(async()=>{if(preparedRoot)await rm(preparedRoot,{recursive:true,force:true});});
async function prepared(){
  return preparedPromise??=(async()=>{
    preparedRoot=await mkdtemp(resolve(tmpdir(),'eth-summary-template-'));
    const repositoryRoot=preparedRoot,identities=await collectEthereumArchiveModelIdentities(root);
    for(const path of new Set([...Object.keys(identities.evaluator.files),...Object.keys(identities.warmStartEvaluator.files),ETH_PROSPECTIVE_PRICE_POLICY.basePath]))
      await put(repositoryRoot,path,path===ETH_PROSPECTIVE_PRICE_POLICY.basePath?await frozenMarketText('eth-ohlc'):await readFile(resolve(root,path)));
    const git=(...args)=>execFileSync('git',args,{cwd:repositoryRoot,encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim();
    git('init','--initial-branch=main');git('config','user.name','Synthetic summary test');git('config','user.email','synthetic@example.invalid');
    git('add','dist');git('commit','-m','Synthetic fixture with exact preserved model and base bytes');
    const sourceIdentity={sourceCommit:git('rev-parse','HEAD'),sourceTree:git('rev-parse','HEAD^{tree}'),runId:null};
    for(const path of [P.seed,'research-data/ethereum-prospective-ledger','research-data/asset-outcome-ledger'])
      await writeEthereumArchiveDirectory({repositoryRoot,path,files:await readEthereumArchiveDirectory(resolve(root,path))});
    await restoreEthereumArchiveOperations({repositoryRoot,now:()=> '2026-10-28T05:00:00.000Z'});
    // Prices and execution clocks are SYNTHETIC; model graphs and committed
    // historical records are exact. No actual provider request is made.
    let ms=Date.parse('2026-10-28T05:00:00.000Z');const now=()=>new Date(ms+=1000).toISOString();
    const capture=({baseText})=>captureEthereumResearchTail({baseText,clock:now,fetchImpl:async url=>{
      const parsed=new URL(url),start=Date.parse(parsed.searchParams.get('start'))/1000,end=Date.parse(parsed.searchParams.get('end'))/1000;
      const rows=Array.from({length:(end-start)/86400},(_,i)=>[start+i*86400,2900,3100,3000,3001,10]);
      rows.push([end,2900,3200,3000,3050,20]);
      return new Response(JSON.stringify(rows.reverse()),{status:200,headers:{'Content-Type':'application/json'}});
    }});
    const issue=await issueEthereumArchiveOperations({repositoryRoot,sourceIdentity,now,capture});
    assert.equal(issue.status,'issued-or-reused',json(issue.errors));assert.equal(issue.newRecords,3);
    await replayEthereumArchiveOperations({repositoryRoot});
    return {repositoryRoot,sourceIdentity,issue};
  })();
}
async function fixture(t){
  const template=await prepared(),repositoryRoot=await mkdtemp(resolve(tmpdir(),'eth-summary-case-'));
  t.after(()=>rm(repositoryRoot,{recursive:true,force:true}));await cp(template.repositoryRoot,repositoryRoot,{recursive:true});
  return {...template,repositoryRoot};
}
async function reportCheckpoint(repositoryRoot,path,value){
  const bytes=encoded(value);await put(repositoryRoot,path,bytes);
  await put(repositoryRoot,P.prospective+'/receipts/'+sha(bytes)+'.json',bytes);
}
async function saveEvaluation(f,value,{bindIssuance=false,updateLatest=true}={}){
  const report=await signed(value),bytes=encoded(report),hash=sha(bytes),checkpoint={path:'receipts/'+hash+'.json',bytes:bytes.length,sha256:hash};
  await put(f.repositoryRoot,P.prospective+'/'+checkpoint.path,bytes);
  if(updateLatest)await put(f.repositoryRoot,P.evaluation,bytes);
  if(bindIssuance){
    const receipt=await read(f.repositoryRoot,P.prospective+'/receipt.json');
    receipt.evaluation={id:report.id,evaluatedAt:report.evaluatedAt,pending:report.pending,missingObservations:report.missingObservations,scored:report.scored,checkpoint};
    receipt.prospectiveScoredTargets=report.scored;await put(f.repositoryRoot,P.prospective+'/receipt.json',encoded(receipt));
  }
  return report;
}
async function saveReplay(f,value){
  const report=await signed(value);await reportCheckpoint(f.repositoryRoot,P.prospective+'/replay-receipt.json',report);return report;
}
async function changedPage(f,report,key,change){
  const descriptor=report[key][0],page=await read(f.repositoryRoot,P.prospective+'/'+descriptor.path);
  await change(page);const bytes=encoded(page),hash=sha(bytes),next={path:'receipts/'+hash+'.json',bytes:bytes.length,sha256:hash,entries:page.entries.length};
  await put(f.repositoryRoot,P.prospective+'/'+next.path,bytes);report[key][0]=next;return report;
}

test('an absent active marker leaves the legacy readiness reader selected',async t=>{
  const repositoryRoot=await mkdtemp(resolve(tmpdir(),'eth-summary-legacy-'));t.after(()=>rm(repositoryRoot,{recursive:true,force:true}));
  assert.equal(await summary({repositoryRoot}),null);
});

test('summary independently replays all archived and current records, consumes complete component pages, and preserves model counts',async t=>{
  const f=await fixture(t),delta=await read(f.repositoryRoot,P.prospective+'/index.json');assert.equal(delta.entries.length,3);
  const evaluation=await read(f.repositoryRoot,P.evaluation),replay=await read(f.repositoryRoot,P.prospective+'/replay-receipt.json');
  const receipt=await read(f.repositoryRoot,P.prospective+'/receipt.json');
  assert.notEqual(receipt.evaluation.id,evaluation.id);assert.ok(receipt.evaluation.evaluatedAt<evaluation.evaluatedAt);
  const originalCheckpoint=await readFile(resolve(f.repositoryRoot,P.prospective,receipt.evaluation.checkpoint.path));
  // Further truthful receipts change the whole source ID without changing a
  // forecast, its input vintages, or any exact evaluation/replay page.
  const checkpoint=encoded({kind:'synthetic-summary-checkpoint',note:'no new records or observations'});
  await put(f.repositoryRoot,P.prospective+'/receipts/'+sha(checkpoint)+'.json',checkpoint);
  const current=ethereumProspectiveArchiveSourceInfo(await openEthereumActiveArchiveSource(f));
  assert.notEqual(evaluation.inputSource.id,current.id);assert.notEqual(replay.inputSource.id,current.id);
  const result=await summarize(f);
  assert.equal(result.records.length,6);assert.equal(result.records.length,current.records);
  assert.deepEqual(result.records.map(record=>record.id),current.recordIds);assert.ok(result.records.every(record=>!Object.hasOwn(record,'output')));
  assert.deepEqual(result.modelEvidence.map(row=>[row.modelKey,row.recordCount,row.pending,row.scored]),
    [['adaptive',2,6,0],['pooled',2,6,0],['warmStart',2,6,0]]);
  assert.equal(result.evaluation.pending,18);assert.equal(result.evaluation.scored,0);
  assert.equal(result.replayReceipt.reusedRecords,6);assert.equal(result.replayReceipt.newRecords,0);
  assert.equal(result.verification.allOriginalRecordsActuallyReexecuted,true);
  assert.equal(result.verification.globalVintageEvaluationActuallyReexecuted,true);
  assert.equal(result.verification.completeSemanticInventoryMatched,true);
  assert.equal(result.verification.replayedRecords,6);assert.equal(result.verification.evaluatedRecords,6);
  assert.equal(result.verification.inputSourceId,current.id);assert.equal(result.verification.releaseAuthorized,false);
  assert.equal(result.verification.originalIssuanceEvaluationId,receipt.evaluation.id);
  assert.equal(result.verification.originalIssuanceEvaluationPagesVerified,true);
  assert.equal(result.verification.originalIssuanceEvaluationActuallyReexecuted,true);
  assert.deepEqual(await readFile(resolve(f.repositoryRoot,P.prospective,receipt.evaluation.checkpoint.path)),originalCheckpoint);
  assert.ok(result.inputSha256[P.evaluation]);assert.ok(result.inputSha256[P.prospective+'/replay-receipt.json']);
  assert.ok(result.verification.evaluationComponentPages.length);assert.ok(result.verification.replayPages.length);
  await assert.rejects(readFile(resolve(f.repositoryRoot,P.prospective,'evaluations',evaluation.id+'.json')),error=>error.code==='ENOENT');
});

test('mutable latest aggregate counters remain untrusted even when the report ID is recomputed',async t=>{
  const f=await fixture(t),evaluation=await read(f.repositoryRoot,P.evaluation);evaluation.scored=1;evaluation.pending--;
  await saveEvaluation(f,evaluation);
  await assert.rejects(()=>summarize(f),/Aggregate evaluation counts differ/);
});

test('complete-page validation rejects a subset relabeled as the whole archive and omitted ignored observation IDs',async t=>{
  for(const kind of ['records','observations'])await t.test(kind,async t=>{
    const f=await fixture(t),evaluation=await read(f.repositoryRoot,P.evaluation);
    if(kind==='records'){evaluation.inputSource.recordIds=evaluation.inputSource.recordIds.slice(3);evaluation.inputSource.records=3;evaluation.records=3;}
    else {evaluation.inputSource.observationIds.pop();evaluation.inputSource.observations--;}
    await saveEvaluation(f,evaluation);
    await assert.rejects(()=>summarize(f),/complete current semantic inventory/);
  });
});

test('missing pages, wrong offsets, false entry counts and oversized descriptors are rejected before using summaries',async t=>{
  for(const mode of ['missing','offset','entries','bytes'])await t.test(mode,async t=>{
    const f=await fixture(t),evaluation=await read(f.repositoryRoot,P.evaluation);
    if(mode==='missing')await rm(resolve(f.repositoryRoot,P.prospective,evaluation.componentPages[0].path));
    if(mode==='offset'){await changedPage(f,evaluation,'componentPages',page=>{page.offset=1;});await saveEvaluation(f,evaluation);}
    if(mode==='entries'){evaluation.componentPages[0].entries++;await saveEvaluation(f,evaluation);}
    if(mode==='bytes'){evaluation.componentPages[0].bytes=8*1024*1024+1;await saveEvaluation(f,evaluation);}
    await assert.rejects(()=>summarize(f),/checkpoint|page|descriptor/i);
  });
});

test('duplicate full components cannot replace a missing original even after page and report hashes are updated',async t=>{
  const f=await fixture(t),evaluation=await read(f.repositoryRoot,P.evaluation);
  await changedPage(f,evaluation,'componentPages',page=>{page.entries[1]=structuredClone(page.entries[0]);});
  await saveEvaluation(f,evaluation);
  await assert.rejects(()=>summarize(f),/component identity or original record coverage/);
});

test('a forged original evaluator row with unchanged aggregate counts fails actual global-vintage reexecution',async t=>{
  const f=await fixture(t),evaluation=await read(f.repositoryRoot,P.evaluation);
  await changedPage(f,evaluation,'componentPages',async page=>{
    page.entries[0].rows[0].actual=999999;
    page.entries[0]=await signed(page.entries[0]);
  });
  await saveEvaluation(f,evaluation);
  await assert.rejects(()=>summarize(f),/original-source reexecution|global-vintage reexecution/);
});

test('a forged original issuance numeric row cannot be authenticated by an untouched valid later evaluation',async t=>{
  const f=await fixture(t),receipt=await read(f.repositoryRoot,P.prospective+'/receipt.json');
  const latestBytes=await readFile(resolve(f.repositoryRoot,P.evaluation));
  const original=await read(f.repositoryRoot,P.prospective+'/'+receipt.evaluation.checkpoint.path);
  assert.notEqual(original.id,JSON.parse(latestBytes.toString('utf8')).id);
  await changedPage(f,original,'componentPages',async page=>{
    page.entries[0].rows[0].actual=999999;
    page.entries[0]=await signed(page.entries[0]);
  });
  await saveEvaluation(f,original,{bindIssuance:true,updateLatest:false});
  assert.deepEqual(await readFile(resolve(f.repositoryRoot,P.evaluation)),latestBytes);
  await assert.rejects(()=>summarize(f),/Original issuance evaluation.*original-source reexecution|Original issuance evaluation page.*global-vintage reexecution/);
  assert.deepEqual(await readFile(resolve(f.repositoryRoot,P.evaluation)),latestBytes);
});

test('replay counts, original output hashes and frozen source graphs must all agree with actual records',async t=>{
  for(const mode of ['count','output','graph'])await t.test(mode,async t=>{
    const f=await fixture(t),replay=await read(f.repositoryRoot,P.prospective+'/replay-receipt.json');
    if(mode==='count')replay.replayedRecords--;
    if(mode==='output')await changedPage(f,replay,'replayPages',page=>{page.entries[0].outputHash='0'.repeat(64);});
    if(mode==='graph')replay.sourceGraphs.adaptive.sourceHash='0'.repeat(64);
    await saveReplay(f,replay);
    await assert.rejects(()=>summarize(f),/Replay summary|frozen source graphs|exact original output/);
  });
});

test('a schema-valid altered 731-point forecast cannot impersonate actual model replay using matching rehashed pages',async t=>{
  const f=await fixture(t),index=await read(f.repositoryRoot,P.prospective+'/index.json');
  const position=index.entries.findIndex(row=>row.modelKey==='adaptive'),entry=index.entries[position];
  const record=await read(f.repositoryRoot,P.prospective+'/'+entry.recordPath),snapshot=await read(f.repositoryRoot,P.prospective+'/'+entry.snapshotPath);
  const forecast={symbol:record.symbol,asOf:record.asOf,researchModel:record.modelKey,probability:null,calibrated:false,
    displayEnd:record.output.path.at(-1)[0],metadata:record.output.simulation,training:record.output.training,
    assumptions:record.output.assumptions,warnings:record.output.warnings,
    path:record.output.path.map((row,i)=>({date:row[0],baselinePrice:row[1],low:row[2],high:row[3],price:row[4]*(i===10?1.01:1)}))};
  const changed=await createEthereumProspectiveRecord({...record,snapshot,forecast});
  assert.equal(changed.runKey,record.runKey);assert.notEqual(changed.outputHash,record.outputHash);
  await rm(resolve(f.repositoryRoot,P.prospective,entry.recordPath));
  await put(f.repositoryRoot,P.prospective+'/records/'+changed.id+'.json',encoded(changed));
  index.entries[position]=ethereumProspectiveIndexEntry(changed);await put(f.repositoryRoot,P.prospective+'/index.json',encoded(index));
  const replaceIds=input=>{input.recordIds=input.recordIds.map(id=>id===record.id?changed.id:id).sort();};
  const evaluation=await read(f.repositoryRoot,P.evaluation);replaceIds(evaluation.inputSource);
  await changedPage(f,evaluation,'componentPages',async page=>{
    for(let i=0;i<page.entries.length;i++)if(page.entries[i].recordIds.includes(record.id)){
      const component=page.entries[i];component.recordIds=[changed.id];component.rows=component.rows.map(row=>({...row,recordId:changed.id}));
      page.entries[i]=await signed(component);
    }
    page.entries.sort((a,b)=>a.recordIds[0].localeCompare(b.recordIds[0]));
  });
  await saveEvaluation(f,evaluation);
  const replay=await read(f.repositoryRoot,P.prospective+'/replay-receipt.json');replaceIds(replay.inputSource);
  await changedPage(f,replay,'replayPages',page=>{
    for(const result of page.entries)if(result.id===record.id){result.id=changed.id;result.outputHash=changed.outputHash;}
    page.entries.sort((a,b)=>a.id.localeCompare(b.id));
  });
  await saveReplay(f,replay);
  const receipt=await read(f.repositoryRoot,P.prospective+'/receipt.json');
  const original=await read(f.repositoryRoot,P.prospective+'/'+receipt.evaluation.checkpoint.path);replaceIds(original.inputSource);
  await changedPage(f,original,'componentPages',async page=>{
    for(let i=0;i<page.entries.length;i++)if(page.entries[i].recordIds.includes(record.id)){
      const component=page.entries[i];component.recordIds=[changed.id];component.rows=component.rows.map(row=>({...row,recordId:changed.id}));
      page.entries[i]=await signed(component);
    }
    page.entries.sort((a,b)=>a.recordIds[0].localeCompare(b.recordIds[0]));
  });
  await saveEvaluation(f,original,{bindIssuance:true,updateLatest:false});
  const changedReceipt=await read(f.repositoryRoot,P.prospective+'/receipt.json');
  for(const decision of changedReceipt.decisions)if(decision.id===record.id)decision.id=changed.id;
  await put(f.repositoryRoot,P.prospective+'/receipt.json',encoded(changedReceipt));
  await assert.rejects(()=>summarize(f),/differs from re-execution on its preserved raw inputs/);
});

test('a later observation requires a fresh issuance evaluation even after latest replay and evaluation are refreshed',async t=>{
  const f=await fixture(t),sourceDocument=JSON.stringify({source:'Coinbase Exchange',product:'ETH-USD',dailyHistory:{
    source:'Coinbase Exchange',product:'ETH-USD',completedOnly:true,candles:[
      {date:'2024-01-01T00:00:00.000Z',open:100,high:110,low:90,close:100,volume:1},
      {date:'2024-01-02T00:00:00.000Z',open:100,high:110,low:90,close:100,volume:1},
    ]}});
  const observation=await createAssetOutcomeSnapshot({symbol:'ETHUSD',sourceDocument,
    sourceUrl:'https://example.invalid/synthetic-summary-later-observation',collectedAt:'2026-10-28T06:00:00.000Z'});
  await put(f.repositoryRoot,P.outcomes+'/observations/'+observation.id+'.json',encoded(observation));
  await put(f.repositoryRoot,P.outcomes+'/index.json',encoded({schemaVersion:1,kind:'atlas-asset-outcome-index',
    observations:[assetOutcomeSnapshotEntry(observation)],evaluations:[],latestEvaluationId:null}));
  await replayEthereumArchiveOperations({repositoryRoot:f.repositoryRoot});
  await assert.rejects(()=>summarize(f),/Original issuance evaluation.*fresh issuance\/evaluation run/);
});

test('the original issuance checkpoint and its counts stay binding after a later replay evaluation',async t=>{
  for(const mode of ['missing','count'])await t.test(mode,async t=>{
    const f=await fixture(t),receipt=await read(f.repositoryRoot,P.prospective+'/receipt.json');
    if(mode==='missing')await rm(resolve(f.repositoryRoot,P.prospective,receipt.evaluation.checkpoint.path));
    else {receipt.evaluation.scored++;await put(f.repositoryRoot,P.prospective+'/receipt.json',encoded(receipt));}
    await assert.rejects(()=>summarize(f),/issuance evaluation|immutable summary checkpoint/i);
  });
});

test('a mutable aggregate needs its immutable checkpoint, and current Git source provenance cannot be forged',async t=>{
  const f=await fixture(t),evaluation=await read(f.repositoryRoot,P.evaluation),changed=await signed({...evaluation,scored:1});
  await put(f.repositoryRoot,P.evaluation,encoded(changed));
  await assert.rejects(()=>summarize(f),/Missing immutable summary checkpoint/);
  await assert.rejects(()=>summary({repositoryRoot:f.repositoryRoot,sourceCommit:'f'.repeat(40),sourceTree:f.sourceIdentity.sourceTree}),/exact current committed source identity/);
});
