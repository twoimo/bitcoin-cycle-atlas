import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {forecastHash,canonicalForecastJson} from '../dist/forecast-records.js';
import {createEthereumResearchSnapshot,verifyEthereumResearchSnapshot,rebuildEthereumResearchPrices,planEthereumResearchPriceRequest} from '../dist/ethereum-prospective-prices.js';
import {createEthereumProspectiveRecord,verifyEthereumProspectiveRecord,decideEthereumProspectiveAppend,evaluateEthereumProspectiveRecords} from '../dist/ethereum-prospective-records.js';
import {prospectiveFixture} from './helpers/eth-prospective-fixture.mjs';
const copy=structuredClone;
test('typed raw quantiles preserve a representative trajectory outside the band and exact immutable replay',async()=>{
  const f=await prospectiveFixture();
  assert.equal(f.record.output.path.length,731);
  assert.equal(f.record.output.path[1][4],180);assert.equal(f.record.output.path[1][3],120);
  assert.equal(f.record.output.representativeContainmentRequired,false);
  assert.equal(f.record.targets[0].median,100);assert.equal(f.record.targets[0].representative,180);
  assert.equal(f.record.targets[0].flat,100);
  assert.equal(f.record.calibrated,false);assert.equal(f.record.productionAdopted,false);
  assert.equal(f.record.informationClock.allPublicationTimesKnown,false);
  await verifyEthereumProspectiveRecord(f.record,f.snapshot);
});
test('changed primary prices cannot pass with an unchanged base/tail source even after readdressing',async()=>{
  const f=await prospectiveFixture(),bad=copy(f.snapshot);bad.primaryPrices.at(-1)[1]=101;
  bad.primaryPricesHash=await forecastHash(bad.primaryPrices);
  const {id,...body}=bad;bad.id=await forecastHash(body);
  await assert.rejects(verifyEthereumResearchSnapshot(bad),/mismatch/);
  const base=copy(f.base);base.text=base.text.replace('"close":100','"close":101');
  await assert.rejects(createEthereumResearchSnapshot({base,tail:f.tail}),/Git blob/);
});
test('record dates, anchors, medians, source hash, simulation options and target cache are binding',async()=>{
  const f=await prospectiveFixture();
  for(const mutate of [
    x=>x.path[1].date=x.path[2].date,x=>x.path[0].price=101,x=>x.path[1].baselinePrice=121,
    x=>x.metadata.sampleCount=1024,x=>x.metadata.calibrated=true,
  ]){
    const forecast=copy(f.forecast);mutate(forecast);
    await assert.rejects(createEthereumProspectiveRecord({...f.args,forecast}),/candidate|Candidate|anchor|quantile|policy/i);
  }
  await assert.rejects(createEthereumProspectiveRecord({...f.args,model:{...f.model,sourceHash:'d'.repeat(64)}}),/hash/);
  const bad=copy(f.record);bad.targets[0].median=999;
  const {id,...body}=bad;bad.id=await forecastHash(body);
  await assert.rejects(verifyEthereumProspectiveRecord(bad,f.snapshot),/mismatch/);
});
test('new acquisition clocks do not manufacture a second economic run and reuse keeps old issue time',async()=>{
  const f=await prospectiveFixture(),shift=ms=>new Date(Date.parse(ms)+60000).toISOString();
  const base={...f.base,collectedAt:shift(f.base.collectedAt)},tail={...f.tail,requestStartedAt:shift(f.tail.requestStartedAt),bodyCompletedAt:shift(f.tail.bodyCompletedAt)};
  const snapshot=await createEthereumResearchSnapshot({base,tail});
  assert.notEqual(snapshot.id,f.snapshot.id);assert.equal(snapshot.economicInputHash,f.snapshot.economicInputHash);
  const later=await createEthereumProspectiveRecord({...f.args,snapshot,generationStartedAt:shift(f.args.generationStartedAt),
    generatedAt:shift(f.args.generatedAt),issuedAt:shift(f.args.issuedAt)});
  assert.equal(later.runKey,f.record.runKey);
  const decision=decideEthereumProspectiveAppend([f.record],later);
  assert.equal(decision.action,'reuse');assert.equal(decision.record.issuedAt,f.record.issuedAt);
  assert.throws(()=>decideEthereumProspectiveAppend([f.record],{...later,outputHash:'e'.repeat(64)}),/different output/);
});
test('actual generation and UTC freshness forbid future inputs and backdated or next-day issuance',async()=>{
  const f=await prospectiveFixture();
  await assert.rejects(createEthereumProspectiveRecord({...f.args,issuedAt:f.tail.bodyCompletedAt}),/order/);
  const rollover=new Date(Date.parse(f.args.issuedAt)+86400000).toISOString();
  await assert.rejects(createEthereumProspectiveRecord({...f.args,issuedAt:rollover}),/current completed/);
  const base=copy(f.base);base.collectedAt=f.args.issuedAt;
  await assert.rejects(createEthereumResearchSnapshot({base,tail:f.tail}),/order/);
});
test('single-page raw parsing requires all requested completed days and exact endpoint',async()=>{
  const f=await prospectiveFixture(),args={baseText:f.base.text,tailText:f.tail.text,requestStartedAt:f.tail.requestStartedAt,bodyCompletedAt:f.tail.bodyCompletedAt,sourceUrl:f.tail.sourceUrl};
  const raw=JSON.parse(f.tail.text);
  assert.throws(()=>rebuildEthereumResearchPrices({...args,tailText:JSON.stringify(raw.slice(1))}),/missing/);
  assert.throws(()=>rebuildEthereumResearchPrices({...args,tailText:JSON.stringify([...raw,raw[0]])}),/Duplicate/);
  assert.throws(()=>rebuildEthereumResearchPrices({...args,sourceUrl:f.tail.sourceUrl.replace('ETH-USD','BTC-USD')}),/URL/);
  const future=[f.snapshot.request.requestedEnd,90,110,100,100,10];
  const result=rebuildEthereumResearchPrices({...args,tailText:JSON.stringify([...raw,future])});
  assert.equal(result.merge.excludedOutOfWindow,1);assert.equal(result.primaryPrices.at(-1)[0],f.snapshot.asOf);
  assert.throws(()=>planEthereumResearchPriceRequest(f.base.text,new Date(Date.parse(f.tail.requestStartedAt)+291*86400000).toISOString()),/290/);
});
test('no target score exists before maturity or without collected actuals; future snapshots are excluded',async()=>{
  const f=await prospectiveFixture(),common={records:[f.record],snapshots:{[f.snapshot.id]:f.snapshot},evaluator:f.evaluator};
  const pending=await evaluateEthereumProspectiveRecords({...common,observations:[f.snapshot],evaluatedAt:f.args.issuedAt});
  assert.equal(pending.pending,3);assert.equal(pending.scored,0);assert.ok(pending.rows.every(r=>r.actual===null&&r.scores===null));
  const matureAt=f.record.targets[0].eventAt;
  const missing=await evaluateEthereumProspectiveRecords({...common,observations:[f.snapshot],evaluatedAt:matureAt});
  assert.equal(missing.missingObservations,1);assert.equal(missing.pending,2);assert.equal(missing.scored,0);
  await assert.rejects(evaluateEthereumProspectiveRecords({...common,evaluatedAt:f.tail.bodyCompletedAt}),/before actual issuance/);
});
test('mature score uses observed price and immutable raw bounds, never the representative or cached claims',async()=>{
  const f=await prospectiveFixture(),target=f.record.targets[0],began=new Date(Date.parse(target.eventAt)+3600000).toISOString();
  const request=planEthereumResearchPriceRequest(f.base.text,began),n=(request.requestedEnd-request.requestedStart)/86400;
  const raw=Array.from({length:n},(_,i)=>[request.requestedStart+i*86400,90,110,100,100,10]);
  raw.at(-1)[1]=40;raw.at(-1)[4]=50;
  const observed=await createEthereumResearchSnapshot({base:{...f.base,collectedAt:new Date(Date.parse(began)-1000).toISOString()},
    tail:{text:JSON.stringify(raw),requestStartedAt:began,bodyCompletedAt:new Date(Date.parse(began)+1000).toISOString(),sourceUrl:request.sourceUrl}});
  const common={records:[f.record],snapshots:{[f.snapshot.id]:f.snapshot},observations:[observed],evaluator:f.evaluator};
  const tooEarly=await evaluateEthereumProspectiveRecords({...common,evaluatedAt:target.eventAt});
  assert.equal(tooEarly.scored,0);assert.equal(tooEarly.missingObservations,1);assert.ok(tooEarly.futureObservationVintagesExcluded>0);
  const result=await evaluateEthereumProspectiveRecords({...common,evaluatedAt:new Date(Date.parse(began)+2000).toISOString()});
  const score=result.rows[0];assert.equal(score.status,'scored');assert.equal(score.actual,50);
  assert.ok(Math.abs(score.scores.absoluteLogError-Math.LN2)<1e-12);
  assert.ok(Math.abs(score.scores.logIntervalScore-(Math.log(120)-Math.log(80)+10*(Math.log(80)-Math.log(50))))<1e-12);
  assert.equal(score.scores.covered,false);assert.equal(score.source.snapshotId,observed.id);
  assert.equal(result.uniqueOrigins,1);assert.equal(result.scored,1);
});
