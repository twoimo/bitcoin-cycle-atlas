import assert from 'node:assert/strict';
import test from 'node:test';
import {buildReplayObservedCandles} from '../dist/forecast-replay.js';
import {utcDay} from '../dist/cycle-engine.js';

const observations=[
  {date:'2026-01-05',open:62832,high:63500,low:62690,close:63200,volume:10},
  {date:'2026-01-06',open:63200,high:64000,low:63000,close:63800,volume:20},
  {date:'2026-01-07',open:63800,high:64551,low:63700,close:64485,volume:30},
  {date:'2026-01-08',open:64485,high:65000,low:64000,close:64686,volume:40},
  {date:'2026-01-09',open:64686,high:90000,low:50000,close:70000,volume:500},
];
const evaluatedAt='2026-01-20T12:00:00.000Z';
const source={provider:'Synthetic source fixture',sourceHash:'a'.repeat(64),sourceUrl:'https://example.invalid/replay-ohlc',
  vintageId:'test-source',historicalAvailabilityProven:false};
const options={observations,source,evaluatedAt,frequency:'weekly'};

test('independent display candles form the same weekly prefix without borrowing forecast or scoring prices',()=>{
  const before=buildReplayObservedCandles({...options,cursorDate:'2026-01-07'});
  const after=buildReplayObservedCandles({...options,cursorDate:'2026-01-08'});
  const values=row=>[row.open,row.high,row.low,row.close,row.volume,row.daysIncluded,row.complete];
  assert.deepEqual(values(before.candles[0]),[62832,64551,62690,64485,60,3,false]);
  assert.deepEqual(values(after.candles[0]),[62832,65000,62690,64686,100,4,false]);
  assert.equal(before.candles[0].time,utcDay('2026-01-05')*86400);assert.equal(after.candles[0].time,before.candles[0].time);
  assert.equal(after.metadata.formingWeekCount,1);assert.equal(after.metadata.missingWeekCount,0);
  assert.equal(after.metadata.displayOnly,true);assert.equal(after.metadata.observedThrough,'2026-01-08');
  assert.deepEqual(after.metadata.source,source);assert.notEqual(after.metadata.source,source);
  assert.equal(Object.hasOwn(after,'forecast'),false);assert.equal(Object.hasOwn(after,'metrics'),false);
  assert.ok(Object.isFrozen(after.candles[0]));assert.ok(Object.isFrozen(after.metadata.source));
});

test('future display-source prices and volumes cannot affect an earlier weekly prefix',()=>{
  const before=buildReplayObservedCandles({...options,cursorDate:'2026-01-08'});
  const changed=observations.map(row=>row.date>'2026-01-08'?{...row,open:1e10,high:1e20,low:1e-10,close:1e15,volume:1e100}:row);
  assert.deepEqual(buildReplayObservedCandles({...options,observations:changed,cursorDate:'2026-01-08'}),before);
  const atMondayOpen=buildReplayObservedCandles({...options,cursorDate:'2026-01-05',cursorAt:'2026-01-05T00:00:00.000Z'});
  assert.deepEqual(atMondayOpen.candles,[]);assert.equal(atMondayOpen.metadata.observedThrough,null);
  const beforeCompletion=buildReplayObservedCandles({...options,cursorDate:'2026-01-08',evaluatedAt:'2026-01-08T12:00:00.000Z'});
  assert.equal(beforeCompletion.candles[0].endDate,'2026-01-07');assert.equal(beforeCompletion.candles[0].close,64485);
});

test('separate candle sources cannot fill missing completed days or create OHLC from closes',()=>{
  const missing=observations.filter(row=>row.date!=='2026-01-06');
  const weekly=buildReplayObservedCandles({...options,observations:missing,cursorDate:'2026-01-08'});
  assert.deepEqual(weekly.candles,[]);assert.equal(weekly.metadata.missingWeekCount,1);
  const daily=buildReplayObservedCandles({...options,observations:missing,cursorDate:'2026-01-08',frequency:'daily'});
  assert.deepEqual(daily.candles.map(row=>row.date),['2026-01-05','2026-01-07','2026-01-08']);
  const closes=buildReplayObservedCandles({...options,observations:observations.map(({date,close})=>({date,price:close})),cursorDate:'2026-01-08'});
  assert.deepEqual(closes.candles,[]);assert.equal(closes.metadata.ohlcAvailable,false);assert.equal(closes.metadata.completeOhlcCoverage,false);
  assert.throws(()=>buildReplayObservedCandles({...options,cursorDate:'2026-01-08',frequency:'1m'}),/daily or weekly/);
});

test('display source revisions respect the selected current-vintage or information-time clock',()=>{
  const original={...observations[0],collectedAt:'2026-01-06T01:00:00.000Z',vintageId:'original'};
  const revised={...original,high:99999,collectedAt:'2026-01-07T01:00:00.000Z',vintageId:'revised'};
  const input={...options,observations:[original,revised],cursorDate:'2026-01-05',cursorAt:'2026-01-06T02:00:00.000Z',frequency:'daily'};
  const current=buildReplayObservedCandles(input),strict=buildReplayObservedCandles({...input,clockMode:'information-time'});
  assert.equal(current.candles[0].high,99999);assert.equal(strict.candles[0].high,63500);
  assert.equal(current.metadata.observationClock,'current-vintage-market-bar-reconstruction');
  assert.equal(strict.metadata.observationClock,'recorded-acquisition-cutoff');
  const unavailable=buildReplayObservedCandles({...input,clockMode:'information-time',cursorAt:'2026-01-06T00:00:00.000Z'});
  assert.deepEqual(unavailable.candles,[]);
  assert.throws(()=>buildReplayObservedCandles({...options,cursorDate:'2026-01-08',clockMode:'information-time'}),/complete acquisition receipts/);
});
