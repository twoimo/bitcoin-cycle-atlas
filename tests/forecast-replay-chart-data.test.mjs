import test from 'node:test';
import assert from 'node:assert/strict';
import {utcDay,dateFromDay} from '../dist/cycle-engine.js';
import {sessionCloseUtc} from '../dist/data-freshness.js';
import {forecastHash,createForecastSnapshot,createForecastRecord} from '../dist/forecast-records.js';
import {createHistoricalReplaySession,createRecordedReplaySession,buildReplayFrame,buildReplayChartData} from '../dist/forecast-replay.js';

const asOf='2025-12-31',origin=utcDay(asOf),at='2026-08-01T12:00:00.000Z';
const date=offset=>dateFromDay(origin+offset);
const observations=Array.from({length:440},(_,index)=>{
  const price=100+index*.5;
  return {date:date(index-399),price,open:price-1,high:price+2,low:price-2,close:price,volume:index+1};
});
const historical=(rows=observations)=>createHistoricalReplaySession({symbol:'BTCUSD',observations:rows,asOf,horizonDays:30,generatedAt:at});
const prices=observations.filter(row=>row.date<=asOf).map(row=>[row.date,row.price]);
const snapshot=await createForecastSnapshot({meta:{sourceName:'Synthetic chart replay fixture',priceDefinition:'Completed UTC test close',retrievedAt:'2026-01-01T01:00:00.000Z'},prices},{asOf});
const files={'dist/synthetic-chart-replay.js':'a'.repeat(64)};
const model={sourceCommit:'b'.repeat(40),sourceHash:await forecastHash(files),files};
const forecast={version:'synthetic-chart-replay-1',asOf,displayEnd:date(200),scenario:{id:'base',label:'Synthetic test'},
  path:Array.from({length:201},(_,offset)=>({date:date(offset),price:prices.at(-1)[1]+offset,lower:200,upper:600,
    baselinePrice:prices.at(-1)[1],cycleDisplacement:0,residualLog:0})),longHorizon:{researchAsOf:asOf}};
const record=await createForecastRecord({snapshot,forecast,model,options:{synthetic:true},issuedAt:'2026-01-01T02:00:00.000Z'});
const receipt=(row,extra={})=>({...row,collectedAt:row.date<=asOf?'2026-01-01T01:00:00.000Z':new Date(Date.parse(sessionCloseUtc(row.date,'crypto'))+3600000).toISOString(),
  sourceHash:'a'.repeat(64),sourceUrl:'https://example.invalid/chart-replay',vintageId:'base:'+row.date,...extra});

test('main-chart replay retains full consumed history and genuine pre-origin candles',async()=>{
  const session=await historical(),data=buildReplayChartData(session);
  assert.equal(session.inputPrices.length,91);
  assert.equal(data.frame.inputPrices.length,91);
  assert.equal(data.observedRows.length,400);
  assert.equal(data.observedCandles.length,400);
  assert.equal(data.observedRows[0].date,date(-399));
  assert.equal(data.observedRows.at(-1).date,asOf);
  assert.equal(data.observedCandles.at(-1).open,observations[399].open);
  assert.equal(data.ohlcAvailable,true);assert.equal(data.completeOhlcCoverage,true);
  assert.equal(data.originDate,asOf);assert.ok(Object.isFrozen(data.observedCandles[0]));
});

test('future candle extremes cannot change an earlier main chart or its scale',async()=>{
  const changed=observations.map(row=>row.date>date(5)?{...row,price:row.price*1000,open:row.open*1000,high:row.high*1000,low:row.low*1000,close:row.close*1000}:row);
  const original=await historical(),future=await historical(changed);
  const before=buildReplayChartData(original,{cursorIndex:5});
  assert.deepEqual(before,buildReplayChartData(future,{cursorIndex:5}));
  assert.equal(before.observedRows.at(-1).date,date(5));
  assert.equal(before.observedCandles.at(-1).endDate,date(5));
  assert.equal(original.identity.outputHash,future.identity.outputHash);
  buildReplayChartData(original,{cursorIndex:30});
  assert.deepEqual(buildReplayChartData(original,{cursorIndex:5}),before);
  assert.equal(before.frame.metrics.matchedCount,5);
});

test('weekly replay updates one forming candle from completed daily prefixes, then opens the next week',async()=>{
  const session=await historical(),options={frequency:'weekly',startDate:'2025-12-29'};
  const thursday=buildReplayChartData(session,{...options,cursorIndex:1});
  assert.equal(thursday.observedCandles.length,1);
  assert.ok(thursday.partialWeekCount>0);
  assert.equal(thursday.formingWeekCount,1);
  assert.equal(thursday.observedRows.at(-1).date,'2026-01-01');
  const forming=thursday.observedCandles[0],prefix=observations.filter(row=>row.date>='2025-12-29'&&row.date<='2026-01-01');
  assert.equal(forming.time,utcDay('2025-12-29')*86400);
  assert.equal(forming.periodStartDate,'2025-12-29');assert.equal(forming.periodEndDate,'2026-01-04');
  assert.equal(forming.startDate,'2025-12-29');assert.equal(forming.endDate,'2026-01-01');
  assert.equal(forming.open,prefix[0].open);assert.equal(forming.high,prefix.at(-1).high);
  assert.equal(forming.low,prefix[0].low);assert.equal(forming.close,prefix.at(-1).close);
  assert.equal(forming.volume,prefix.reduce((sum,row)=>sum+row.volume,0));
  assert.equal(forming.daysIncluded,4);assert.equal(forming.complete,false);
  const sunday=buildReplayChartData(session,{...options,cursorIndex:4}),week=sunday.observedCandles[0];
  assert.equal(sunday.observedCandles.length,1);
  assert.equal(week.startDate,'2025-12-29');assert.equal(week.endDate,'2026-01-04');
  assert.equal(week.time,forming.time);assert.equal(week.open,forming.open);
  assert.equal(week.daysIncluded,7);assert.equal(week.complete,true);
  const days=observations.filter(row=>row.date>=week.startDate&&row.date<=week.endDate);
  assert.equal(week.open,days[0].open);assert.equal(week.close,days.at(-1).close);
  assert.equal(week.high,days.at(-1).high);assert.equal(week.low,days[0].low);
  assert.equal(week.volume,days.reduce((sum,row)=>sum+row.volume,0));
  const monday=buildReplayChartData(session,{...options,cursorIndex:5});
  assert.equal(monday.observedCandles.length,2);
  assert.deepEqual(monday.observedCandles[0],week);
  assert.equal(monday.observedCandles[1].startDate,'2026-01-05');
  assert.equal(monday.observedCandles[1].daysIncluded,1);assert.equal(monday.observedCandles[1].complete,false);
  const mondayOpen=buildReplayChartData(session,{...options,cursorIndex:5,cursorAt:'2026-01-05T00:00:00.000Z'});
  assert.deepEqual(mondayOpen.observedCandles,[week],'Monday OHLC remains hidden until its daily close');
  assert.deepEqual(buildReplayChartData(session,{...options,cursorIndex:1}),thursday);
  assert.deepEqual(monday.frame.forecast,thursday.frame.forecast);
});

test('forming weekly OHLC uses the real first open and only revealed highs, lows, closes and volume',async()=>{
  const sample=new Map([
    ['2025-12-29',{open:62832,high:63500,low:62690,close:63200,volume:10}],
    ['2025-12-30',{open:63200,high:64000,low:63000,close:63800,volume:20}],
    ['2025-12-31',{open:63800,high:64551,low:63700,close:64485,volume:30}],
    ['2026-01-01',{open:64485,high:65000,low:64000,close:64686,volume:40}],
  ]);
  const rows=observations.map(row=>sample.has(row.date)?{...row,...sample.get(row.date),price:sample.get(row.date).close}:row);
  const session=await historical(rows),options={frequency:'weekly',startDate:'2025-12-29'};
  const before=buildReplayChartData(session,options),after=buildReplayChartData(session,{...options,cursorIndex:1});
  const values=bar=>[bar.open,bar.high,bar.low,bar.close,bar.volume,bar.daysIncluded,bar.complete];
  assert.deepEqual(values(before.observedCandles[0]),[62832,64551,62690,64485,60,3,false]);
  assert.deepEqual(values(after.observedCandles[0]),[62832,65000,62690,64686,100,4,false]);
  assert.equal(before.observedCandles[0].time,after.observedCandles[0].time);
  const poisoned=rows.map(row=>row.date>'2026-01-01'?{...row,price:row.price*1e8,open:row.open*1e8,high:row.high*1e8,low:row.low/1e8,close:row.close*1e8,volume:1e100}:row);
  assert.deepEqual(buildReplayChartData(await historical(poisoned),{...options,cursorIndex:1}),after,
    'future OHLC, volume and extrema cannot change the visible weekly candle or its price domain');
  buildReplayChartData(session,{...options,cursorIndex:30});
  assert.deepEqual(buildReplayChartData(session,options),before);
});

test('missing genuine candles remain missing and cannot become a manufactured week',async()=>{
  const rows=observations.map(row=>row.date==='2026-01-01'?{date:row.date,price:row.price}:row);
  const session=await historical(rows),daily=buildReplayChartData(session,{cursorIndex:4,startDate:'2025-12-29'});
  assert.equal(daily.observedRows.length,7);assert.equal(daily.observedCandles.length,6);
  assert.equal(daily.completeOhlcCoverage,false);
  assert.ok(!daily.observedCandles.some(row=>row.date==='2026-01-01'));
  const weekly=buildReplayChartData(session,{cursorIndex:4,startDate:'2025-12-29',frequency:'weekly'});
  assert.equal(weekly.observedCandles.length,0);assert.ok(weekly.missingWeekCount>0);
  const earlier=buildReplayChartData(session,{cursorIndex:0,startDate:'2025-12-29',frequency:'weekly'});
  assert.equal(earlier.observedCandles.length,1,'not-yet-disclosed Thursday is not a missing completed session on Wednesday');
  const closes=await historical(observations.map(({date,price})=>({date,price})));
  const line=buildReplayChartData(closes,{cursorIndex:4});
  assert.equal(line.ohlcAvailable,false);assert.equal(line.completeOhlcCoverage,false);
  assert.deepEqual(line.observedCandles,[]);assert.equal(line.observedRows.length,404);
});

test('weekly volume stays unknown if a disclosed day lacks volume and preserves genuine zeroes',async()=>{
  const options={cursorIndex:1,startDate:'2025-12-29',frequency:'weekly'};
  const missing=observations.map(row=>row.date==='2025-12-30'?Object.fromEntries(Object.entries(row).filter(([key])=>key!=='volume')):row);
  const unknown=buildReplayChartData(await historical(missing),options).observedCandles[0];
  assert.equal(Object.hasOwn(unknown,'volume'),false);
  const zeroes=observations.map(row=>row.date>='2025-12-29'&&row.date<='2026-01-01'?{...row,volume:0}:row);
  const zero=buildReplayChartData(await historical(zeroes),options).observedCandles[0];
  assert.equal(zero.volume,0);assert.equal(zero.complete,false);
});

test('strict replay hides pre-origin OHLC revisions until their actual collection clock',async()=>{
  const rows=observations.map(row=>receipt(row));
  const original=rows.find(row=>row.date===asOf);
  rows.push({...original,high:9999,collectedAt:'2026-01-05T01:00:00.000Z',vintageId:'revised-origin'});
  rows.sort((a,b)=>a.date.localeCompare(b.date));
  const session=await createRecordedReplaySession({record,snapshot,observations:rows,evaluatedAt:at,horizonDays:30});
  const hidden=buildReplayChartData(session,{clockMode:'information-time'});
  assert.equal(hidden.observedRows.length,0);assert.equal(hidden.observedCandles.length,0);
  assert.equal(hidden.priceDomain,null);
  const earlier={clockMode:'information-time',cursorIndex:1,cursorAt:'2026-01-02T01:00:00.000Z'};
  const before=buildReplayChartData(session,earlier);
  assert.equal(before.observedRows.length,401);
  assert.equal(before.observedCandles.find(row=>row.date===asOf).high,original.high);
  assert.ok(before.priceDomain.max<9999);
  const later=buildReplayChartData(session,{clockMode:'information-time',cursorIndex:4,cursorAt:'2026-01-05T01:00:00.000Z'});
  assert.equal(later.observedCandles.find(row=>row.date===asOf).high,9999);
  assert.deepEqual(buildReplayChartData(session,earlier),before);
  assert.equal(session.identity.outputHash,record.outputHash);
});

test('recorded close inputs are never replaced by a differing current-vintage candle',async()=>{
  const rows=observations.map(row=>row.date===asOf?{...row,price:800,close:800,high:900}:row);
  const session=await createRecordedReplaySession({record,snapshot,observations:rows,evaluatedAt:at,horizonDays:30});
  const data=buildReplayChartData(session);
  assert.equal(data.observedRows.at(-1).price,prices.at(-1)[1]);
  assert.ok(!data.observedCandles.some(row=>row.date===asOf));
  assert.equal(data.completeOhlcCoverage,false);
  assert.equal(buildReplayFrame(session).inputPrices.at(-1).price,prices.at(-1)[1]);
});

test('chart range filters historical prices and candles without changing forecast scores',async()=>{
  const session=await historical(),frame=buildReplayFrame(session,{cursorIndex:5});
  const data=buildReplayChartData(session,{cursorIndex:5,startDate:date(-2),endDate:date(3)});
  assert.equal(data.observedRows.length,6);assert.equal(data.observedCandles.length,6);
  assert.equal(data.observedRows[0].date,date(-2));assert.equal(data.observedRows.at(-1).date,date(3));
  assert.deepEqual(data.frame,frame);
  assert.throws(()=>buildReplayChartData(session,{frequency:'1m'}),/daily or weekly/);
  assert.throws(()=>buildReplayChartData(session,{startDate:date(2),endDate:date(1)}),/reversed/);
});
