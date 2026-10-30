import assert from 'node:assert/strict';
import test from 'node:test';
import {readFile} from 'node:fs/promises';
import {buildLongHorizonForecast} from '../dist/long-horizon-forecast.js';
import {parseBitcoinReplayCandles} from '../dist/chart-replay-sources.js';
import {createCurrentChartReplaySession,buildReplayFrame,buildReplayChartData} from '../dist/forecast-replay.js';
import {forecastHash} from '../dist/forecast-records.js';
import {dateFromDay,utcDay} from '../dist/cycle-engine.js';

const dataset=JSON.parse(await readFile(new URL('../dist/data/btc-daily.json',import.meta.url),'utf8'));
const sourceText=await readFile(new URL('../dist/data/btc-volume.json',import.meta.url),'utf8');
const at=new Date(Math.max(Date.now(),Date.parse('2026-10-30T08:00:00.000Z'),
  Date.parse(dataset.meta.retrievedAt)+86400000,Date.parse(JSON.parse(sourceText).retrievedAt)+86400000)).toISOString();
const archive=await parseBitcoinReplayCandles(sourceText,{now:Date.parse(at)});
const asOf=dataset.prices.at(-1)[0];
const forecast=buildLongHorizonForecast(dataset,{asOf,referenceDate:dateFromDay(utcDay(asOf)+1),scenario:'base',seed:20261022,sampleCount:128,blockDays:28});
const create=(options={})=>createCurrentChartReplaySession({dataset,forecast,...archive,createdAt:at,...options});

test('current chart replay retains every point of the actual displayed model at its own origin',async()=>{
  const session=await create();
  assert.equal(session.mode,'current-chart-snapshot');assert.equal(session.asOf,'2026-10-20');
  assert.equal(session.identity.playbackStartDate,'2026-10-21');
  assert.equal(session.forecastOriginDate,asOf);assert.equal(session.identity.forecastOriginDate,asOf);
  assert.equal(session.endDate,'2050-12-31');
  assert.equal(session.forecast.length,forecast.path.length);
  assert.deepEqual(session.chartForecast,forecast);
  assert.deepEqual(session.chartDataset,dataset);
  assert.equal(session.identity.originalPathHash,await forecastHash(forecast.path));
  assert.deepEqual(session.forecast,forecast.path.map(row=>({date:row.date,price:row.price,lower:row.lower??null,upper:row.upper??null,baselinePrice:row.baselinePrice??null})));
  assert.equal(session.identity.outputHash,await forecastHash(session.forecast));
  assert.equal(session.forecast[0].date,asOf,'no forecast is backfilled between replay start and the current curve');
  assert.ok(session.forecast.every(row=>row.date>=asOf));
  assert.equal(session.identity.currentChartSnapshot,true);assert.equal(session.identity.issuedAt,null);
  assert.equal(session.identity.historicalModelExistedAtOrigin,false);
  assert.equal(session.identity.forecastSource.provider,'Coin Metrics Community API');
  assert.equal(session.identity.observationSource.provider,'Bitstamp');
});

test('the first next bar reveals genuine October 21 OHLC while the orange curve stays frozen',async()=>{
  const session=await create(),initial=buildReplayChartData(session),next=buildReplayChartData(session,{cursorIndex:1});
  assert.equal(initial.observedRows.at(-1).date,'2026-10-20');
  assert.equal(initial.observedCandles.at(-1).date,'2026-10-20');
  assert.equal(next.observedRows.at(-1).date,'2026-10-21');
  assert.equal(next.observedCandles.length,initial.observedCandles.length+1);
  const candle=next.observedCandles.at(-1);
  assert.equal(candle.open,82946.02);assert.equal(candle.high,84842.65);
  assert.equal(candle.low,82552.76);assert.equal(candle.close,84023.24);assert.equal(candle.volume,2217.41055708);
  assert.deepEqual(next.frame.forecast,initial.frame.forecast);
  assert.equal(next.frame.selected.predicted,null);
  assert.equal(next.frame.selected.actual,84023.24);
  assert.equal(next.frame.selected.absoluteError,null);
  assert.equal(next.frame.policy.forecastScoringEnabled,false);
  assert.equal(next.frame.policy.prospectiveScoringEligible,false);
  assert.deepEqual(next.frame.dailyComparisons,[]);
  assert.equal(next.frame.metrics.matchedCount,0);assert.equal(next.frame.metrics.meanAbsolutePercentageError,null);
});

test('future bars do not affect earlier candles, y bounds or the fixed current forecast',async()=>{
  const session=await create(),before=buildReplayChartData(session,{cursorIndex:1});
  const changed=archive.observations.map(row=>row.date>'2026-10-21'?{...row,price:row.price*100,open:row.open*100,high:row.high*100,low:row.low*100,close:row.close*100}:row);
  const altered=await create({observations:changed});
  assert.deepEqual(buildReplayChartData(altered,{cursorIndex:1}),before);
  assert.equal(altered.identity.outputHash,session.identity.outputHash);
  buildReplayChartData(session,{cursorIndex:session.timeline.length-1});
  assert.deepEqual(buildReplayChartData(session,{cursorIndex:1}),before);
});

test('the current capture cannot be shown as a historically issued prediction in strict clock mode',async()=>{
  const session=await create();
  const historical=buildReplayFrame(session,{cursorIndex:1,clockMode:'information-time'});
  assert.equal(historical.forecastVisible,false);assert.equal(historical.inputVisible,false);
  assert.deepEqual(historical.forecast,[]);assert.equal(historical.selected.predicted,null);
  const captured=buildReplayFrame(session,{cursorIndex:1,clockMode:'information-time',cursorAt:at});
  assert.equal(captured.forecastVisible,true);assert.equal(captured.policy.forecastScoringEnabled,false);
  assert.equal(captured.policy.prospectiveScoringEligible,false);
});

test('the replay owns an immutable copy while later live model edits remain independent',async()=>{
  const mutableForecast=structuredClone(forecast),mutableData=structuredClone(dataset);
  const session=await create({forecast:mutableForecast,dataset:mutableData});
  mutableForecast.path[1].price*=2;mutableData.prices.at(-1)[1]*=2;
  assert.equal(session.chartForecast.path[1].price,forecast.path[1].price);
  assert.equal(session.chartDataset.prices.at(-1)[1],dataset.prices.at(-1)[1]);
  assert.throws(()=>{session.chartForecast.path[1].price=1;},TypeError);
  assert.throws(()=>{session.chartDataset.prices.at(-1)[1]=1;},TypeError);
  assert.notEqual(mutableForecast.path[1].price,session.chartForecast.path[1].price);
});

test('missing observed dates are skipped without manufacturing candles or scoring another source',async()=>{
  const observations=archive.observations.filter(row=>row.date!=='2026-10-22');
  const session=await create({observations});
  assert.equal(session.timeline[1],'2026-10-21');assert.equal(session.timeline[2],'2026-10-23');
  const end=buildReplayChartData(session,{cursorIndex:session.timeline.length-1});
  assert.ok(!end.observedRows.some(row=>row.date==='2026-10-22'));
  assert.ok(!end.observedCandles.some(row=>row.date==='2026-10-22'));
  assert.equal(end.frame.metrics.matchedCount,0);
  assert.equal(end.frame.selected.absolutePercentageError,null);
});

test('inconsistent current-curve anchors and replay clocks are rejected instead of silently joined',async()=>{
  const changed=structuredClone(forecast);changed.path[0].price+=1;
  await assert.rejects(create({forecast:changed}),/original input anchor/);
  await assert.rejects(create({playbackStartDate:'2026-10-22'}),/clocks/);
  await assert.rejects(create({asOf:'2027-01-01',playbackStartDate:'2027-01-02'}),/clocks/);
  await assert.rejects(create({observations:archive.observations.filter(row=>row.date!=='2026-10-20')}),/immediately before/);
  const reversed=structuredClone(forecast);reversed.path[2].date=reversed.path[1].date;
  await assert.rejects(create({forecast:reversed}),/strictly increasing/);
});
