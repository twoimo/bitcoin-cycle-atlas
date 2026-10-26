import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,rm,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {canonicalForecastJson} from '../dist/forecast-records.js';
import {verifyAssetOutcomeArchive} from '../dist/asset-outcome-records.js';
import {collectAssetOutcomes,appendAssetOutcomeEvaluation,writeAssetOutcomeArchive,readAssetOutcomeArchive,
  mergeAssetOutcomeArchives,assetOutcomeTransport,emitAssetOutcomeFiles} from '../scripts/evaluate-asset-forecasts.mjs';
import {syntheticIssuedRecord,syntheticOutcomeSource,syntheticOutcomeEvaluator,emptyOutcomeArchive} from './helpers/asset-outcome-fixture.mjs';
const json=value=>canonicalForecastJson(value)+'\n';
const eth=await syntheticIssuedRecord(),bmnr=await syntheticIssuedRecord('BMNR');
const records=[eth.record,bmnr.record],recordMap=Object.fromEntries(records.map(r=>[r.id,r]));
const symbolRecord=symbol=>symbol==='ETHUSD'?eth.record:bmnr.record;
const source=(symbol,price,collectedAt)=>({
  sourceDocument:syntheticOutcomeSource(symbol,[[symbolRecord(symbol).targets[0].targetDate,price]],{retrievedAt:collectedAt}),
  sourceUrl:'https://github.com/twoimo/bitcoin-cycle-atlas/blob/'+'c'.repeat(40)+'/dist/data/'+(symbol==='ETHUSD'?'eth':'bmnr')+'-ohlc.json',
  publishedAt:null,collectedAt,
});
test('one failed asset and a stale archive cannot block another already matured forecast evaluation',async()=>{
  const before=json(records),calls=[];
  const result=await collectAssetOutcomes({records,evaluator:syntheticOutcomeEvaluator,clock:()=> '2027-01-27T02:00:00.000Z',
    sourceReader:async symbol=>{calls.push(symbol);if(symbol==='BMNR')throw new Error('synthetic provider timeout');return source(symbol,2100,'2026-11-25T01:00:00.000Z');}});
  assert.equal(result.status,'partial');assert.deepEqual(calls.sort(),['BMNR','ETHUSD']);
  const first=result.evaluation.result.rows.find(r=>r.symbol==='ETHUSD'&&r.horizonDays===30);
  assert.equal(first.status,'scored');assert.equal(first.actual,2100);
  assert.equal(result.evaluation.result.rows.find(r=>r.symbol==='BMNR'&&r.horizonDays===30).status,'missing-observation');
  assert.match(result.evaluation.acquisitionFailures[0].reason,/timeout/);
  assert.equal(json(records),before);assert.equal(result.evaluation.forecastRecordsChanged,false);
});

test('same bytes reuse their first retained receipt while a corrected source appends immutable evaluation history',async t=>{
  const directory=await mkdtemp(join(tmpdir(),'atlas-outcome-'));
  t.after(()=>rm(directory,{recursive:true,force:true}));
  let archive=emptyOutcomeArchive();
  const original=source('ETHUSD',2100,'2026-11-25T01:00:00.000Z');
  const first=await collectAssetOutcomes({records:[eth.record],evaluator:syntheticOutcomeEvaluator,
    clock:()=> '2026-11-25T02:00:00.000Z',sourceReader:async()=>original});
  appendAssetOutcomeEvaluation(archive,first);
  await writeAssetOutcomeArchive(directory,archive,recordMap);
  const oldEntry=archive.index.evaluations[0],oldBytes=await readFile(join(directory,oldEntry.path),'utf8');
  const oldSnapshot=archive.index.observations[0],snapshotBytes=await readFile(join(directory,oldSnapshot.path),'utf8');
  const repeat=await collectAssetOutcomes({records:[eth.record],priorSnapshots:archive.snapshots,evaluator:syntheticOutcomeEvaluator,
    clock:()=> '2026-11-25T03:00:00.000Z',sourceReader:async()=>({...original,collectedAt:'2026-11-25T02:30:00.000Z'})});
  assert.equal(repeat.attempts[0].status,'reused');assert.equal(repeat.attempts[0].retainedCollectedAt,original.collectedAt);
  appendAssetOutcomeEvaluation(archive,repeat);
  assert.equal(archive.index.observations.length,1);assert.equal(archive.index.evaluations.length,2);
  const same=await collectAssetOutcomes({records:[eth.record],priorSnapshots:archive.snapshots,evaluator:syntheticOutcomeEvaluator,
    clock:()=> '2026-11-25T03:00:00.000Z',sourceReader:async()=>({...original,collectedAt:'2026-11-25T02:30:00.000Z'})});
  appendAssetOutcomeEvaluation(archive,same);assert.equal(archive.index.evaluations.length,2);
  const revision=await collectAssetOutcomes({records:[eth.record],priorSnapshots:archive.snapshots,evaluator:syntheticOutcomeEvaluator,
    clock:()=> '2026-11-26T02:00:00.000Z',sourceReader:async()=>source('ETHUSD',2150,'2026-11-26T01:00:00.000Z')});
  appendAssetOutcomeEvaluation(archive,revision);
  await writeAssetOutcomeArchive(directory,archive,recordMap);
  archive=await readAssetOutcomeArchive(directory,recordMap);
  assert.equal(archive.index.observations.length,2);assert.equal(archive.index.evaluations.length,3);
  assert.equal(archive.evaluations[first.evaluation.id].result.rows[0].actual,2100);
  assert.equal(archive.evaluations[revision.evaluation.id].result.rows[0].actual,2150);
  assert.equal(await readFile(join(directory,oldEntry.path),'utf8'),oldBytes);
  assert.equal(await readFile(join(directory,oldSnapshot.path),'utf8'),snapshotBytes);
  assert.equal((await verifyAssetOutcomeArchive(archive.index,archive.snapshots,archive.evaluations,recordMap)).status,'verified');
});

test('tampered retained bytes and a missing referenced snapshot are refused before replacing the index',async t=>{
  const directory=await mkdtemp(join(tmpdir(),'atlas-outcome-negative-'));t.after(()=>rm(directory,{recursive:true,force:true}));
  const archive=emptyOutcomeArchive(),result=await collectAssetOutcomes({records:[eth.record],evaluator:syntheticOutcomeEvaluator,
    clock:()=> '2026-11-25T02:00:00.000Z',sourceReader:async()=>source('ETHUSD',2100,'2026-11-25T01:00:00.000Z')});
  appendAssetOutcomeEvaluation(archive,result);await writeAssetOutcomeArchive(directory,archive,recordMap);
  const path=archive.index.evaluations[0].path,indexBefore=await readFile(join(directory,'index.json'),'utf8');
  await writeFile(join(directory,path),'tampered bytes');
  await assert.rejects(writeAssetOutcomeArchive(directory,archive,recordMap),/Refusing to replace immutable/);
  assert.equal(await readFile(join(directory,'index.json'),'utf8'),indexBefore);
  await assert.rejects(verifyAssetOutcomeArchive(archive.index,{},archive.evaluations,recordMap),/Invalid atlas-asset-outcome-snapshot/);
  const different={...archive,texts:new Map(archive.texts)};different.texts.set(path,json(result.evaluation)+' ');
  await assert.rejects(mergeAssetOutcomeArchives(recordMap,archive,different),/byte conflict/);
});

test('outcome transport binds original file bytes and emits reconstructable source references',async()=>{
  const archive=emptyOutcomeArchive(),result=await collectAssetOutcomes({records:[eth.record],evaluator:syntheticOutcomeEvaluator,
    clock:()=> '2026-11-25T02:00:00.000Z',sourceReader:async()=>source('ETHUSD',2100,'2026-11-25T01:00:00.000Z')});
  appendAssetOutcomeEvaluation(archive,result);
  const entry=archive.index.observations[0],original=archive.texts.get(entry.path),transport=assetOutcomeTransport(entry.path,original);
  assert.ok(transport);assert.equal(transport.snapshotId,entry.id);
  const restored={...transport.snapshotTemplate,sourceDocument:archive.snapshots[entry.id].sourceDocument};
  assert.equal(json(restored),original);
  const lines=[];emitAssetOutcomeFiles(archive.texts,line=>lines.push(line));
  const chunks=lines.filter(l=>l.startsWith('ASSET_OUTCOME_SNAPSHOT_TRANSPORT_CHUNK ')).map(l=>JSON.parse(l.slice(l.indexOf(' ')+1))).sort((a,b)=>a.part-b.part);
  assert.equal(chunks.length,chunks[0].total);
  assert.deepEqual(JSON.parse(chunks.map(c=>c.text).join('')),transport);
  assert.ok(lines.some(l=>l.startsWith('ASSET_OUTCOME_FILE_MANIFEST ')));
});
