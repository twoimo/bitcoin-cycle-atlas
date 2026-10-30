import assert from 'node:assert/strict';
import test from 'node:test';
import {getReplayIntervalCapabilities} from '../dist/forecast-replay.js';
import {utcDay,dateFromDay} from '../dist/cycle-engine.js';

const beginning=utcDay('2026-03-03'); // Tuesday: the archive does not contain this week's Monday.
const bars=Array.from({length:9},(_,index)=>({date:dateFromDay(beginning+index),
  open:100+index,high:104+index,low:99+index,close:102+index,price:102+index,volume:index}));
const evaluation='2026-03-11T12:00:00.000Z';

test('replay interval capabilities expose real completed daily coverage and the first available weekly open',()=>{
  const result=getReplayIntervalCapabilities({observations:bars,evaluatedAt:evaluation});
  assert.equal(result.sourceFrequency,'daily');assert.equal(result.forwardFrequency,'daily');assert.equal(result.weekStartsOn,'monday-utc');
  assert.equal(result.firstObservationDate,'2026-03-03');assert.equal(result.lastObservationDate,'2026-03-10');
  assert.equal(result.firstOhlcDate,'2026-03-03');assert.equal(result.lastOhlcDate,'2026-03-10');
  assert.deepEqual(result.availableDates,bars.slice(0,8).map(row=>row.date));
  assert.deepEqual(result.intervals.daily,{supported:true,reason:null,firstDate:'2026-03-03',lastDate:'2026-03-10',firstReplayDate:'2026-03-03'});
  assert.deepEqual(result.intervals.weekly,{supported:true,reason:null,firstDate:'2026-03-09',lastDate:'2026-03-10',firstReplayDate:'2026-03-09'});
  for(const id of ['1m','5m','15m','30m','1h','4h'])assert.deepEqual(result.intervals[id],{
    supported:false,reason:'intraday-source-unavailable',firstDate:null,lastDate:null,firstReplayDate:null,
  },id+' must not be manufactured from daily prices');
  assert.ok(Object.isFrozen(result));assert.ok(Object.isFrozen(result.availableDates));assert.ok(Object.isFrozen(result.intervals.daily));
});

test('a source that starts midweek cannot pretend to contain that weekly opening observation',()=>{
  const result=getReplayIntervalCapabilities({observations:bars.slice(0,6),evaluatedAt:evaluation});
  assert.equal(result.intervals.daily.supported,true);
  assert.deepEqual(result.intervals.weekly,{supported:false,reason:'weekly-opening-observation-unavailable',
    firstDate:null,lastDate:null,firstReplayDate:null});
  assert.equal(result.intervals.daily.firstReplayDate,'2026-03-03');
});

test('closing-price-only archives do not acquire fabricated daily or weekly candle capabilities',()=>{
  const result=getReplayIntervalCapabilities({observations:bars.map(({date,price})=>({date,price})),evaluatedAt:evaluation});
  assert.equal(result.firstObservationDate,'2026-03-03');assert.equal(result.lastObservationDate,'2026-03-10');
  assert.equal(result.firstOhlcDate,null);assert.equal(result.lastOhlcDate,null);assert.deepEqual(result.availableDates,[]);
  assert.equal(result.intervals.daily.supported,false);assert.equal(result.intervals.daily.reason,'genuine-ohlc-unavailable');
  assert.equal(result.intervals.weekly.supported,false);
});

test('capability dates obey daily completion and acquisition clocks without extending coverage',()=>{
  const rows=bars.slice(0,3).map((row,index)=>({...row,
    collectedAt:index===0?'2026-03-04T01:00:00.000Z':'2026-03-08T01:00:00.000Z'}));
  const result=getReplayIntervalCapabilities({observations:rows,evaluatedAt:'2026-03-06T12:00:00.000Z'});
  assert.equal(result.firstOhlcDate,'2026-03-03');assert.equal(result.lastOhlcDate,'2026-03-03');
  assert.deepEqual(result.availableDates,['2026-03-03']);
  const empty=getReplayIntervalCapabilities({observations:bars,evaluatedAt:'2026-03-03T12:00:00.000Z'});
  assert.equal(empty.firstObservationDate,null);assert.equal(empty.intervals.daily.supported,false);
  assert.throws(()=>getReplayIntervalCapabilities({observations:[{...bars[0],high:1}],evaluatedAt:evaluation}),/genuine consistent/);
});
