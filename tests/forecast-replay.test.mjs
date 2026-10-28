import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {utcDay,dateFromDay} from '../dist/cycle-engine.js';
import {sessionCloseUtc} from '../dist/data-freshness.js';
import {forecastHash,createForecastSnapshot,createForecastRecord,canonicalForecastJson} from '../dist/forecast-records.js';
import {createAssetForecastRecord} from '../dist/asset-forecast-records.js';
import {createRecordedReplaySession,createHistoricalReplaySession,buildReplayFrame} from '../dist/forecast-replay.js';
import {parseReplayPriceArchive} from '../dist/forecast-replay-sources.js';

const asOf='2025-12-31',origin=utcDay(asOf),evaluatedAt='2026-08-01T12:00:00.000Z';
const date=offset=>dateFromDay(origin+offset);
const prices=Array.from({length:400},(_,index)=>[date(index-399),100*Math.exp(index*.0004+Math.sin(index/11)*.04)]);
const snapshot=await createForecastSnapshot({meta:{sourceName:'Synthetic replay fixture',priceDefinition:'Completed UTC test close',retrievedAt:'2026-01-01T01:00:00.000Z'},prices},{asOf});
const files={'dist/synthetic-replay-model.js':'a'.repeat(64)},model={sourceCommit:'b'.repeat(40),sourceHash:await forecastHash(files),files};
const forecast={version:'synthetic-replay-only-1',asOf,displayEnd:date(200),scenario:{id:'base',label:'Synthetic replay test'},
  path:Array.from({length:201},(_,offset)=>({date:date(offset),price:prices.at(-1)[1]*Math.exp(offset*.001),lower:prices.at(-1)[1]*Math.exp(offset*.001)*.8,
    upper:prices.at(-1)[1]*Math.exp(offset*.001)*1.2,baselinePrice:prices.at(-1)[1],cycleDisplacement:0,residualLog:0})),longHorizon:{researchAsOf:asOf}};
const record=await createForecastRecord({snapshot,forecast,model,options:{synthetic:true},issuedAt:'2026-01-01T02:00:00.000Z'});
const actual=Array.from({length:200},(_,index)=>({date:date(index+1),price:prices.at(-1)[1]*Math.exp((index+1)*.0005)}));
const create=(observations=actual,options={})=>createRecordedReplaySession({record,snapshot,observations,evaluatedAt,...options});
function receipt(row,{at=new Date(Date.parse(sessionCloseUtc(row.date,'crypto'))+3600000).toISOString(),vintage='synthetic:'+row.date}={}){
  return {...row,collectedAt:at,publishedAt:null,sourceHash:'a'.repeat(64),sourceUrl:'https://example.invalid/replay-source',vintageId:vintage,sourceObservedThrough:row.date};
}

test('recorded replay preserves every verified path value and keeps caller inputs unchanged',async()=>{
  const before=canonicalForecastJson({record,snapshot,actual}),session=await create();
  assert.equal(session.id,record.id);assert.equal(session.identity.outputHash,record.outputHash);
  assert.equal(session.identity.pointMeaning,'preserved-conditional-btc-path');assert.equal(session.identity.bandMeaning,record.output.bandMeaning);
  assert.equal(session.forecast.length,181);assert.equal(session.inputPrices.length,91);
  for(let index=0;index<session.forecast.length;index++){
    assert.equal(session.forecast[index].price,record.output.path[index][1]);
    assert.equal(session.forecast[index].lower,record.output.path[index][2]);
  }
  assert.ok(Object.isFrozen(session)&&Object.isFrozen(session.forecast[0]));
  assert.throws(()=>{session.forecast[1].price=1;},TypeError);
  assert.equal(canonicalForecastJson({record,snapshot,actual}),before);
});

test('real preserved ETH and BMNR exports retain sampled-example semantics without changing any saved price',async()=>{
  const dir=new URL('../dist/data/asset-forecast-ledger/',import.meta.url),index=JSON.parse(await readFile(new URL('index.json',dir)));
  for(const [symbol,meaning]of [['ETHUSD','preserved-sampled-eth-example'],['BMNR','preserved-sampled-eth-treasury-valuation']]){
    const entry=index.entries.find(row=>row.symbol===symbol&&row.scenario==='base');
    const saved=JSON.parse(await readFile(new URL(entry.recordPath,dir))),input=JSON.parse(await readFile(new URL(entry.snapshotPath,dir)));
    assert.equal(saved.output.metadata.assetPath.method,'eth-post-merge-historical-blocks');
    const session=await createRecordedReplaySession({record:saved,snapshot:input,evaluatedAt:'2026-10-28T15:20:00Z'});
    assert.equal(session.identity.pointMeaning,meaning);assert.match(session.identity.pointLabel,/무작위 예시 1개/);
    assert.equal(session.identity.bandMeaning,saved.output.bandMeaning);assert.equal(session.identity.outputHash,saved.outputHash);
    assert.deepEqual(session.forecast.map(row=>[row.date,row.price]),saved.output.path.slice(0,181).map(row=>row.slice(0,2)));
    const exported=JSON.parse(JSON.stringify({identity:session.identity,frame:buildReplayFrame(session)}));
    assert.equal(exported.identity.pointMeaning,meaning);assert.match(exported.identity.pointLabel,/무작위 예시 1개/);
    assert.equal(exported.identity.bandMeaning,saved.output.bandMeaning);
  }
});

test('future actual price mutation cannot change an earlier frame, axis or scores',async()=>{
  const original=await create(),changed=await create(actual.map(row=>row.date>date(30)?{...row,price:row.price*100000}:row));
  assert.deepEqual(buildReplayFrame(original,{cursorIndex:30}),buildReplayFrame(changed,{cursorDate:date(30)}));
  const first=buildReplayFrame(original,{cursorIndex:0});
  assert.equal(first.actual.length,0);assert.equal(first.metrics.matchedCount,0);assert.equal(first.metrics.meanAbsoluteLogError,null);
  assert.ok(first.targets.every(row=>row.status==='pending'&&row.actual===null));
});

test('stepping, direct seeking and seeking backwards produce identical frozen outputs',async()=>{
  const session=await create(),frames=[];
  for(let index=0;index<=60;index++)frames.push(buildReplayFrame(session,{cursorIndex:index}));
  assert.deepEqual(frames[60],buildReplayFrame(session,{cursorDate:date(60)}));
  assert.deepEqual(frames[5],buildReplayFrame(session,{cursorIndex:5}));
  assert.equal(frames[5].metrics.matchedCount,5);assert.equal(frames[60].metrics.matchedCount,60);
  assert.equal(session.identity.outputHash,record.outputHash);
});

test('current-vintage market-bar comparisons never become prospective scores',async()=>{
  const session=await create(),frame=buildReplayFrame(session,{cursorIndex:30});
  assert.equal(frame.targets[0].status,'retrospective');assert.equal(frame.metrics.retrospectiveTargetCount,1);
  assert.equal(frame.metrics.scoredTargetCount,0);assert.equal(frame.metrics.pendingTargetCount,2);
  assert.equal(frame.policy.prospectiveScoringEligible,false);assert.equal(frame.metrics.independentSampleCount,null);
  assert.equal(frame.metrics.calibrated,false);
  assert.equal(frame.metrics.directionAccuracy,1);
});

test('information-time replay hides an unissued forecast and waits for real acquisition',async()=>{
  const session=await create(actual.map(row=>receipt(row)));
  const pre=buildReplayFrame(session,{cursorIndex:0,clockMode:'information-time'});
  assert.equal(pre.forecastVisible,false);assert.equal(pre.forecast.length,0);assert.ok(pre.targets.every(row=>row.status==='not-issued'&&row.predicted===null));
  const targetAt=sessionCloseUtc(date(30),'crypto');
  const missing=buildReplayFrame(session,{cursorIndex:30,clockMode:'information-time',cursorAt:targetAt});
  assert.equal(missing.targets[0].status,'missing-observation');assert.equal(missing.targets[0].actual,null);
  const ready=buildReplayFrame(session,{cursorIndex:30,clockMode:'information-time',cursorAt:new Date(Date.parse(targetAt)+3600000).toISOString()});
  assert.equal(ready.targets[0].status,'scored');assert.equal(ready.metrics.scoredTargetCount,1);
  assert.equal(ready.targets[0].actual,actual[29].price);assert.equal(ready.targets[0].actualCollectedAt,receipt(actual[29]).collectedAt);
});

test('BTC strict frames hide the entire input snapshot until conservative issuance',async()=>{
  const session=await create(actual.map(row=>receipt(row)));
  assert.equal(session.identity.inputAvailableAt,record.issuedAt);
  assert.equal(session.identity.inputAvailabilityBasis,'conservative-record-issuance');
  const before=buildReplayFrame(session,{cursorIndex:0,clockMode:'information-time',cursorAt:new Date(Date.parse(record.issuedAt)-1).toISOString()});
  assert.equal(before.inputVisible,false);assert.deepEqual(before.inputPrices,[]);assert.deepEqual(before.rows,[]);
  assert.equal(before.selected.flat,null);assert.equal(before.priceDomain,null);assert.equal(before.scale,null);
  assert.ok(!JSON.stringify(before).includes(String(prices.at(-1)[1])));
  assert.equal(before.metrics.matchedCount,0);assert.ok(before.targets.every(row=>row.predicted===null&&row.flat===null));
  const issued=buildReplayFrame(session,{cursorIndex:0,clockMode:'information-time',cursorAt:record.issuedAt});
  assert.equal(issued.inputVisible,true);assert.deepEqual(issued.inputPrices,session.inputPrices);
  assert.equal(issued.forecastVisible,true);assert.equal(issued.selected.flat,prices.at(-1)[1]);assert.ok(issued.priceDomain);
  assert.deepEqual(buildReplayFrame(session,{cursorIndex:0}).inputPrices,session.inputPrices);
});

for(const symbol of ['ETHUSD','BMNR','MSTR'])test(symbol+' strict frames disclose real preserved inputs only at the complete acquisition boundary',async()=>{
  const dir=new URL('../dist/data/asset-forecast-ledger/',import.meta.url),index=JSON.parse(await readFile(new URL('index.json',dir)));
  const entry=index.entries.find(row=>row.symbol===symbol&&row.scenario==='base');
  const saved=JSON.parse(await readFile(new URL(entry.recordPath,dir))),input=JSON.parse(await readFile(new URL(entry.snapshotPath,dir)));
  const session=await createRecordedReplaySession({record:saved,snapshot:input,evaluatedAt:'2026-10-28T15:20:00Z'});
  const boundary=input.informationClock.latestCollectionAt;
  assert.equal(session.identity.inputAvailableAt,boundary);assert.equal(session.identity.inputAvailabilityBasis,'verified-complete-input-acquisition');
  assert.ok(input.informationClock.inputs.every(row=>row.collectedAt<=boundary));
  assert.ok(boundary<saved.issuedAt);
  const originalInput=structuredClone(session.inputPrices),origin=buildReplayFrame(session,{clockMode:'information-time'});
  const before=buildReplayFrame(session,{clockMode:'information-time',cursorAt:new Date(Date.parse(boundary)-1).toISOString()});
  for(const frame of [origin,before]){
    assert.equal(frame.inputVisible,false);assert.equal(frame.forecastVisible,false);
    assert.deepEqual(frame.inputPrices,[]);assert.deepEqual(frame.rows,[]);assert.deepEqual(frame.forecast,[]);assert.deepEqual(frame.actual,[]);
    assert.equal(frame.selected.flat,null);assert.equal(frame.selected.predicted,null);assert.equal(frame.selected.actual,null);
    assert.equal(frame.priceDomain,null);assert.equal(frame.scale,null);assert.equal(frame.metrics.matchedCount,0);
    assert.ok(frame.targets.every(row=>row.predicted===null&&row.actual===null&&row.flat===null&&row.shrunkenTrend===null));
    assert.ok(!JSON.stringify({identity:session.identity,frame}).includes(String(input.inputs.primaryPrices.at(-1)[1])));
  }
  const known=buildReplayFrame(session,{clockMode:'information-time',cursorAt:boundary});
  assert.equal(known.inputVisible,true);assert.equal(known.forecastVisible,false);
  assert.deepEqual(known.inputPrices,originalInput);assert.deepEqual(known.rows,originalInput);
  assert.equal(known.selected.flat,input.inputs.primaryPrices.at(-1)[1]);assert.ok(known.priceDomain);
  assert.ok(known.targets.every(row=>row.status==='not-issued'&&row.predicted===null));
  const issued=buildReplayFrame(session,{clockMode:'information-time',cursorAt:saved.issuedAt});
  assert.equal(issued.forecastVisible,true);assert.deepEqual(issued.forecast,session.forecast);
  assert.deepEqual(buildReplayFrame(session).inputPrices,originalInput);assert.deepEqual(session.inputPrices,originalInput);
});

test('later corrected vintages do not rewrite earlier information cutoffs',async()=>{
  const early=receipt(actual[0]),late=receipt({...actual[0],price:actual[0].price*2},{at:'2026-01-05T02:00:00Z',vintage:'synthetic:correction'});
  const baseline=await create([early]),both=await create([early,late]);
  const options={cursorIndex:1,clockMode:'information-time',cursorAt:early.collectedAt};
  assert.deepEqual(buildReplayFrame(both,options),buildReplayFrame(baseline,options));
  assert.equal(buildReplayFrame(both,{...options,cursorAt:late.collectedAt}).actual[0].price,late.price);
});

test('future navigation cannot declare an unfinished real-world target missing or scored',async()=>{
  const session=await create([],{evaluatedAt:'2026-01-02T12:00:00Z'});
  assert.equal(session.timeline.at(-1),'2026-01-02');
  assert.throws(()=>buildReplayFrame(session,{cursorIndex:180}),/outside/);
  const future=buildReplayFrame(session,{cursorIndex:session.timeline.length-1});
  assert.equal(future.evaluationAt,'2026-01-02T12:00:00.000Z');
  assert.equal(future.metrics.pendingTargetCount,3);assert.equal(future.metrics.missingTargetCount,0);
  const forgedFuture=await create([receipt(actual[29])],{evaluatedAt:'2026-01-02T12:00:00Z'});
  assert.equal(buildReplayFrame(forgedFuture,{cursorIndex:forgedFuture.timeline.length-1}).actual.length,0);
});

test('missing dates are not imputed and undefined denominators remain null',async()=>{
  const session=await create(actual.filter(row=>row.date!==date(30)));
  const frame=buildReplayFrame(session,{cursorIndex:30});
  assert.equal(frame.actual.length,29);assert.equal(frame.metrics.matchedCount,29);
  assert.equal(frame.selected.actual,null);assert.equal(frame.targets[0].status,'missing-observation');
  const flat=await create(actual.map(row=>({...row,price:prices.at(-1)[1]})));
  assert.equal(buildReplayFrame(flat,{cursorIndex:30}).metrics.skillVersusFlat,null);
  const tiny=await create([{date:date(1),price:Number.MIN_VALUE}]);
  const edge=buildReplayFrame(tiny,{cursorIndex:1});
  assert.equal(edge.selected.absolutePercentageError,null);assert.equal(edge.metrics.percentageScoredCount,0);
  assert.equal(edge.metrics.meanAbsolutePercentageError,null);assert.ok(Number.isFinite(edge.metrics.meanAbsoluteLogError));
  assert.ok(edge.priceDomain.min>0&&Number.isFinite(edge.priceDomain.max));
});

test('unknown collection times cannot be fabricated by strict replay',async()=>{
  const session=await create();
  assert.equal(session.observationProvenance.informationTimeAvailable,false);
  assert.throws(()=>buildReplayFrame(session,{cursorIndex:1,clockMode:'information-time'}),/complete acquisition receipts/);
  assert.equal(buildReplayFrame(session,{cursorIndex:1}).actual[0].collectedAt,null);
});

test('record and snapshot tampering is rejected before building a replay session',async()=>{
  const changedRecord=structuredClone(record);changedRecord.output.path[1][1]++;
  await assert.rejects(createRecordedReplaySession({record:changedRecord,snapshot}),/hash/);
  const changedSnapshot=structuredClone(snapshot);changedSnapshot.prices[0][1]++;
  await assert.rejects(createRecordedReplaySession({record,snapshot:changedSnapshot}),/hash/);
  const session=await create();
  assert.throws(()=>buildReplayFrame(structuredClone(session)),/Create and verify/);
});

test('duplicates, invalid clocks, unsupported calendars and incomplete OHLC fail explicitly',async()=>{
  await assert.rejects(create([actual[0],actual[0]]),/Duplicate/);
  await assert.rejects(create([actual[1],actual[0]]),/chronological/);
  await assert.rejects(create([{...actual[0],collectedAt:'2025-01-01T00:00:00Z'}]),/out of order/);
  await assert.rejects(create([{...actual[0],open:10}]),/OHLC/);
  const session=await create();
  assert.throws(()=>buildReplayFrame(session,{cursorIndex:-1}),/outside/);
  assert.throws(()=>buildReplayFrame(session,{cursorDate:'2026-02-30'}));
  assert.throws(()=>buildReplayFrame(session,{clockMode:'guessed-availability'}),/clock mode/);
});

test('equity zero forecast uses a linear scale and excludes undefined log errors without losing price errors',async()=>{
  const dir=new URL('../dist/data/asset-forecast-ledger/',import.meta.url),index=JSON.parse(await readFile(new URL('index.json',dir)));
  const entry=index.entries.find(row=>row.symbol==='BMNR');
  const saved=JSON.parse(await readFile(new URL(entry.recordPath,dir))),input=JSON.parse(await readFile(new URL(entry.snapshotPath,dir)));
  const start=utcDay(input.asOf),anchor=input.inputs.primaryPrices.at(-1)[1];
  const synthetic={symbol:'BMNR',asOf:input.asOf,scenario:{id:'base',label:'Synthetic zero test'},displayEnd:dateFromDay(start+200),
    path:Array.from({length:201},(_,offset)=>({date:dateFromDay(start+offset),price:offset===3?0:anchor,low:0,high:anchor*2,baselinePrice:anchor}))};
  const zero=await createAssetForecastRecord({snapshot:input,forecast:synthetic,model:saved.model,options:{synthetic:true}});
  const observed=[{date:'2026-10-26',price:anchor*1.1,open:anchor,high:anchor*1.2,low:anchor*.9,close:anchor*1.1}];
  const session=await createRecordedReplaySession({record:zero,snapshot:input,observations:observed,evaluatedAt:'2026-10-28T12:00:00Z'});
  assert.ok(!session.timeline.includes('2026-10-24')&&!session.timeline.includes('2026-10-25'));
  const frame=buildReplayFrame(session,{cursorDate:'2026-10-26'});
  assert.equal(frame.scale,'linear');assert.equal(frame.priceDomain.min,0);
  assert.equal(frame.selected.predicted,0);assert.equal(frame.selected.absolutePercentageError,1);
  assert.equal(frame.selected.absoluteLogError,null);assert.equal(frame.metrics.logScoredCount,0);
  assert.equal(frame.metrics.matchedCount,1);assert.equal(frame.metrics.meanAbsoluteLogError,null);
});

test('BTC historical baseline consumes only the prefix and records reconstruction identity honestly',async()=>{
  const observations=[...prices.map(([date,price])=>({date,price})),...actual];
  const options={symbol:'BTCUSD',observations,asOf,horizonDays:180,generatedAt:evaluatedAt};
  const a=await createHistoricalReplaySession(options);
  const b=await createHistoricalReplaySession({...options,observations:observations.map(row=>row.date>asOf?{...row,price:row.price*100}:row)});
  assert.equal(a.id,b.id);assert.deepEqual(a.forecast,b.forecast);assert.deepEqual(a.training,b.training);
  assert.equal(a.mode,'historical-reconstruction');assert.equal(a.identity.issuedAt,null);
  assert.equal(a.identity.historicalModelExistedAtOrigin,false);assert.equal(a.historicalModel.key,'shrunken-trend');
  assert.equal(a.identity.pointMeaning,'shrunken-trend-baseline');assert.equal(a.identity.bandMeaning,'none');
  assert.match(a.identity.pointLabel,/축소 추세 기준모형/);
  const frame=buildReplayFrame(a,{cursorIndex:180});
  assert.equal(frame.metrics.matchedCount,180);assert.equal(frame.metrics.scoredTargetCount,0);
  assert.equal(frame.metrics.retrospectiveTargetCount,3);
  assert.throws(()=>buildReplayFrame(a,{clockMode:'information-time'}),/current-vintage/);
  await assert.rejects(createHistoricalReplaySession({...options,symbol:'MSTR'}),/price-only/);
});

test('ETH historical median is prefix-causal, deterministic and separate from the representative simulation',async()=>{
  const data=await parseReplayPriceArchive('ETHUSD',await readFile(new URL('../dist/data/eth-ohlc.json',import.meta.url),'utf8'),{archivePath:'data/eth-ohlc.json'});
  const options={...data,asOf:'2026-04-28',horizonDays:30,generatedAt:'2026-10-28T15:00:00Z'};
  const first=await createHistoricalReplaySession(options);
  const changed=await createHistoricalReplaySession({...options,observations:data.observations.map(row=>row.date>options.asOf?{...row,price:row.price*100,open:row.open*100,high:row.high*100,low:row.low*100,close:row.close*100}:row)});
  assert.deepEqual(first.forecast,changed.forecast);assert.equal(first.id,changed.id);
  assert.equal(first.training.informationThrough,options.asOf);assert.equal(first.historicalModel.pointMeaning,'simulation-median');
  assert.equal(first.identity.pointMeaning,'simulation-median');assert.match(first.identity.pointLabel,/날짜별 중앙값/);
  assert.equal(first.identity.bandMeaning,'uncalibrated-raw-simulation-quantiles-10-90');
  assert.ok(first.forecast.every(row=>row.price===row.baselinePrice&&row.lower<=row.price&&row.price<=row.upper));
  assert.ok(first.forecast.slice(1).some(row=>row.representativePrice!==row.price));
  assert.equal(buildReplayFrame(first,{cursorIndex:30}).metrics.scoredTargetCount,0);
});

test('strict clock bounds full OHLC, targets, hover and exported frames together',async()=>{
  const row=receipt({...actual[0],open:100,high:Math.max(200,actual[0].price),low:80,close:actual[0].price});
  const session=await create([row]),before=buildReplayFrame(session,{cursorIndex:1,clockMode:'information-time',cursorAt:sessionCloseUtc(row.date,'crypto')});
  assert.equal(before.actual.length,0);assert.equal(before.selected.actual,null);
  const exported=JSON.stringify(before);
  assert.ok(!exported.includes('"high":200'));assert.equal(before.metrics.matchedCount,0);
  const after=buildReplayFrame(session,{cursorIndex:1,clockMode:'information-time',cursorAt:row.collectedAt});
  assert.equal(after.actual[0].open,100);assert.equal(after.actual[0].high,row.high);
});
