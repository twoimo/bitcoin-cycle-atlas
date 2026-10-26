import test from 'node:test';
import assert from 'node:assert/strict';
import {canonicalForecastJson,forecastHash} from '../dist/forecast-records.js';
import {createAssetOutcomeSnapshot,verifyAssetOutcomeSnapshot,createAssetOutcomeEvaluation,verifyAssetOutcomeEvaluation,validateAssetOutcomeIndex} from '../dist/asset-outcome-records.js';
import {syntheticIssuedRecord,syntheticOutcomeSource,syntheticOutcomeEvaluator} from './helpers/asset-outcome-fixture.mjs';
const json=canonicalForecastJson;
const original=await syntheticIssuedRecord(),equity=await syntheticIssuedRecord('BMNR');
const eth=original.record,bmnr=equity.record;
const capture=async(symbol,price,collectedAt,extra={})=>{
  const date=symbol==='ETHUSD'?eth.targets[0].targetDate:bmnr.targets[0].targetDate;
  return createAssetOutcomeSnapshot({symbol,sourceDocument:syntheticOutcomeSource(symbol,[[date,price]],{retrievedAt:collectedAt}),
    sourceUrl:'https://example.invalid/synthetic-outcomes/'+symbol,publishedAt:null,collectedAt,...extra});
};
const resign=async(value)=>{const {id,...body}=value;return {id:await forecastHash(body),...body};};
const evaluate=(records,snapshots,evaluatedAt)=>createAssetOutcomeEvaluation({records,observationSnapshots:snapshots,evaluatedAt,evaluator:syntheticOutcomeEvaluator});

test('separate actual acquisitions move unchanged forecasts from pending through missing to scored',async()=>{
  const before=json({record:eth,snapshot:original.snapshot});
  const outcome=await capture('ETHUSD',2100,'2026-11-25T01:00:00.000Z');
  const pending=await evaluate([eth],[outcome],'2026-11-24T23:59:59.999Z');
  assert.equal(pending.result.rows[0].status,'pending');assert.equal(pending.result.scoredTargets,0);
  const missing=await evaluate([eth],[outcome],'2026-11-25T00:00:00.000Z');
  assert.equal(missing.result.rows[0].status,'missing-observation');assert.equal(missing.result.missingObservationTargets,1);
  const scored=await evaluate([eth],[outcome],'2026-11-25T01:00:00.000Z');
  assert.equal(scored.result.rows[0].status,'scored');assert.equal(scored.result.rows[0].actual,2100);
  assert.equal(scored.result.scoredTargets,1);assert.equal(scored.result.pendingTargets,2);
  const source=scored.result.rows[0].actualSource;
  assert.equal(source.snapshotId,outcome.id);assert.equal(source.sourceHash,outcome.sourceReceipt.sourceHash);
  assert.equal(source.publishedAt,null);assert.equal(source.availabilityBasis,'collection-upper-bound');
  assert.equal(source.eventAt,'2026-11-25T00:00:00.000Z');
  assert.equal(json({record:eth,snapshot:original.snapshot}),before);
  await verifyAssetOutcomeEvaluation(scored,{[eth.id]:eth},{[outcome.id]:outcome});
});

test('later price corrections create distinct immutable results and cannot rewrite an earlier cutoff',async()=>{
  const a=await capture('ETHUSD',2100,'2026-11-25T01:00:00.000Z');
  const b=await capture('ETHUSD',2150,'2026-11-26T01:00:00.000Z');
  const saved=json(a),cutoff='2026-11-25T12:00:00.000Z';
  const first=await evaluate([eth],[a,b],cutoff);
  const reordered=await evaluate([eth],[b,a],cutoff);
  assert.deepEqual(first,reordered);assert.equal(first.result.rows[0].actual,2100);
  const later=await evaluate([eth],[a,b],'2026-11-26T02:00:00.000Z');
  assert.equal(later.result.rows[0].actual,2150);assert.notEqual(later.id,first.id);
  assert.notEqual(a.sourceReceipt.vintageId,b.sourceReceipt.vintageId);assert.equal(json(a),saved);
  assert.equal(first.result.rows[0].actualSource.snapshotId,a.id);
  await verifyAssetOutcomeEvaluation(first,{[eth.id]:eth},{[a.id]:a,[b.id]:b});
});

test('raw source prices and outcome metadata remain bound even after recomputing the outer hash',async()=>{
  const snapshot=await capture('ETHUSD',2100,'2026-11-25T01:00:00.000Z');
  const wrong=structuredClone(snapshot);wrong.sourceDocument=syntheticOutcomeSource('ETHUSD',[[eth.targets[0].targetDate,9999]],{retrievedAt:'2026-11-25T01:00:00.000Z'});
  await assert.rejects(verifyAssetOutcomeSnapshot(await resign(wrong)),/raw-source binding/);
  const count=structuredClone(snapshot);count.observationCount++;
  await assert.rejects(verifyAssetOutcomeSnapshot(await resign(count)),/raw-source binding/);
  const report=await evaluate([eth],[snapshot],'2026-11-25T02:00:00.000Z');
  const falsified=structuredClone(report);falsified.result.rows[0].actual=9999;
  await assert.rejects(verifyAssetOutcomeEvaluation(await resign(falsified),{[eth.id]:eth},{[snapshot.id]:snapshot}),/replay exactly/);
});

test('equity close, crypto UTC close, late acquisition and reconstructed forecasts stay separate',async()=>{
  const outcome=await capture('BMNR',25,'2026-11-24T01:00:00.000Z');
  const pending=await evaluate([bmnr],[outcome],'2026-11-23T20:59:59.999Z');
  const missing=await evaluate([bmnr],[outcome],'2026-11-23T21:00:00.000Z');
  const scored=await evaluate([bmnr],[outcome],'2026-11-24T01:00:00.000Z');
  assert.equal(pending.result.rows[0].status,'pending');assert.equal(missing.result.rows[0].status,'missing-observation');
  assert.equal(scored.result.rows[0].actualSource.eventAt,'2026-11-23T21:00:00.000Z');
  const {record}=await syntheticIssuedRecord('BMNR',{recordKind:'reconstructed'});
  const retro=await evaluate([record],[outcome],'2026-11-24T01:00:00.000Z');
  assert.equal(retro.result.rows[0].status,'retrospective');assert.equal(retro.result.scoredTargets,0);
});

test('malformed clocks, forged metadata, duplicate records and ambiguous same-time revisions fail closed',async()=>{
  await assert.rejects(capture('ETHUSD',2100,'2026-11-24T23:59:59.999Z'),/out of order/);
  await assert.rejects(capture('ETHUSD',2100,'2026-11-25T01:00:00.000Z',{publishedAt:'2026-11-24T20:00:00.000Z'}),/out of order/);
  const a=await capture('ETHUSD',2100,'2026-11-25T01:00:00.000Z');
  const b=await capture('ETHUSD',2200,'2026-11-25T01:00:00.000Z');
  await assert.rejects(evaluate([eth],[a,b],'2026-11-25T02:00:00.000Z'),/Ambiguous equally timed/);
  await assert.rejects(evaluate([eth,eth],[a],'2026-11-25T02:00:00.000Z'),/Unique bounded/);
  await assert.rejects(evaluate([eth],[a],'2026-10-26T09:59:59.999Z'),/precede actual forecast issuance/);
  assert.throws(()=>validateAssetOutcomeIndex({schemaVersion:1,kind:'atlas-asset-outcome-index',observations:[],evaluations:[],latestEvaluationId:'a'.repeat(64)}),/latest pointer/);
});

test('source receipt normalization is canonical and unsupported provider identity is rejected',async()=>{
  const sourceDocument=syntheticOutcomeSource('ETHUSD',[[eth.targets[0].targetDate,2100]]);
  const snapshot=await createAssetOutcomeSnapshot({symbol:'ETHUSD',sourceDocument,sourceUrl:'https://example.invalid',collectedAt:'2026-11-25T01:00:00Z'});
  await verifyAssetOutcomeSnapshot(snapshot);
  assert.equal(snapshot.sourceReceipt.sourceUrl,'https://example.invalid/');
  const wrong=JSON.parse(sourceDocument);wrong.product='BTC-USD';
  await assert.rejects(createAssetOutcomeSnapshot({symbol:'ETHUSD',sourceDocument:JSON.stringify(wrong),sourceUrl:'https://example.invalid',collectedAt:'2026-11-25T01:00:00Z'}),/Coinbase ETH/);
});


test('outcome evaluation cannot conceal earlier simultaneous conflicts behind a later snapshot',async()=>{
  const orders=[[0,1,2],[0,2,1],[1,0,2],[1,2,0],[2,0,1],[2,1,0]];
  for(const [symbol,record]of [['ETHUSD',eth],['BMNR',bmnr]])for(const conflict of ['price','source']){
    const time='2026-11-25T01:00:00.000Z';
    const a=await capture(symbol,2100,time);
    const b=conflict==='price'?await capture(symbol,2200,time):await capture(symbol,2100,time,{sourceDocument:a.sourceDocument+'\n'});
    const later=await capture(symbol,2300,'2026-11-26T01:00:00.000Z');
    assert.notEqual(a.sourceReceipt.sourceHash,b.sourceReceipt.sourceHash);
    assert.notEqual(a.sourceReceipt.vintageId,b.sourceReceipt.vintageId);
    const snapshots=[a,b,later],saved=json({record,snapshots}),cutoff='2026-11-25T00:59:59.999Z';
    const expected=await evaluate([record],snapshots,cutoff);
    assert.equal(expected.result.rows[0].status,'missing-observation');
    assert.equal(expected.result.scoredTargets,0);assert.equal(expected.result.missingObservationTargets,1);
    for(const order of orders){
      const rows=order.map(index=>snapshots[index]);
      assert.deepEqual(await evaluate([record],rows,cutoff),expected);
      for(const evaluatedAt of [time,'2026-11-26T02:00:00.000Z']){
        await assert.rejects(evaluate([record],rows,evaluatedAt),/Ambiguous equally timed/);
      }
    }
    await verifyAssetOutcomeEvaluation(expected,{[record.id]:record},Object.fromEntries(snapshots.map(snapshot=>[snapshot.id,snapshot])));
    assert.equal(json({record,snapshots}),saved);
  }
});
