import assert from 'node:assert/strict';
import test from 'node:test';
import {readFile} from 'node:fs/promises';
import {accumulateWheelRange,zoomRange} from '../dist/chart-navigation.js';
import { ethPayload,ethViewFixture } from './helpers/eth-view-fixture.mjs';
import { equityPayload,equityViewFixture } from './helpers/equity-view-fixture.mjs';

const DAY=86400;
const center=range=>(range.start+range.end+range.step)/2;
function preserved(before,after,domain){
  assert.ok(Math.abs(center(after.range)-center(before.range))<=after.range.step/2,'interval conversion keeps the UTC center within the target grid');
  assert.ok(Math.abs((after.range.end-after.range.start+after.range.step)-(before.range.end-before.range.start+before.range.step))<after.range.step,'time duration changes by less than one target interval');
  assert.deepEqual(after.priceDomain,domain);assert.ok(Number.isInteger((after.range.start-after.range.min)/after.range.step));assert.ok(Number.isInteger((after.range.end-after.range.min)/after.range.step));
}

test('ETH daily/weekly switch keeps manual time and price through the actual async initializer',async()=>{
  const f=await ethViewFixture({query:'&forecast=off'});f.reply(0,ethPayload());await f.settle();await f.initialization;
  const original=structuredClone(f.latest().series.candles),initial=f.latest().range,domain={min:80,max:130};
  f.pan({...initial,start:initial.end-90*DAY,end:initial.end+30*DAY,allowEmpty:true,maxSpan:6000});f.priceRange(domain);await f.frame();const daily=f.latest();
  f.interval('weekly');await f.settle();const weekly=f.latest();preserved(daily,weekly,domain);assert.equal(weekly.range.step,7*DAY);assert.match(weekly.range.contextKey,/weekly/);
  f.interval('daily');await f.settle();preserved(weekly,f.latest(),domain);assert.deepEqual(f.latest().series.candles,original);
  f.span('1m');await f.settle();assert.deepEqual(f.latest().priceDomain,domain,'a time preset does not silently reset a manual price axis');
});

for(const symbol of ['MSTR','BMNR'])test(`${symbol} weekly switch and scale mode retain the source-correct manual viewport`,async()=>{
  const f=await equityViewFixture(symbol);f.reply(0,equityPayload(symbol,1));await f.microtasks();f.reply(1,{revision:1});await f.settle();await f.initialization;
  const original=structuredClone(f.latest().series.candles),initial=f.latest().range,domain={min:80,max:130};
  f.pan({...initial,start:initial.min-30*DAY,end:initial.min+180*DAY,allowEmpty:true,maxSpan:6000});f.priceRange(domain);await f.frame();const daily=f.latest();
  f.interval('weekly');await f.settle();const weekly=f.latest();preserved(daily,weekly,domain);assert.match(weekly.range.contextKey,new RegExp(`${symbol}:weekly:`));
  f.interval('daily');await f.settle();preserved(weekly,f.latest(),domain);assert.deepEqual(f.latest().series.candles,original);
  f.action('scale');await f.frame();assert.equal(f.latest().scale,'linear');assert.deepEqual(f.latest().priceDomain,domain);
  f.priceRange({min:-20,max:130});await f.frame();f.action('scale');await f.frame();assert.equal(f.latest().scale,'log');assert.equal(f.latest().priceDomain,null,'log mode cannot retain a nonpositive domain');
});

for(const [symbol,slug]of [['ETHUSD','eth'],['MSTR','mstr'],['BMNR','bmnr']])test(`${symbol} real-source initializer keeps the right endpoint when zoom expands before its first observation`,async()=>{
  const payload=JSON.parse(await readFile(new URL(`../dist/data/${slug}-ohlc.json`,import.meta.url),'utf8'));
  const f=symbol==='ETHUSD'?await ethViewFixture({query:'&forecast=off'}):await equityViewFixture(symbol);
  f.reply(0,payload);
  if(symbol!=='ETHUSD'){await f.microtasks();f.reply(1,{revision:1});}
  await f.settle();await f.initialization;
  const original=structuredClone(f.latest().series.candles);
  // BMNR's default4y view already reaches its first observation; long-history
  // sources use a real early window to exercise the same source boundary.
  if(symbol!=='BMNR'){const range=f.latest().range;f.pan({...range,start:range.min,end:range.min+120*DAY});await f.frame();}
  Object.assign(f.latest().svg.dataset,{plotLeft:'12',plotRight:'566'});
  const initial=f.navigationRange();
  f.pan(accumulateWheelRange(initial,null,{factor:Math.exp(-.24),anchor:1}).range);await f.frame();
  const inward=f.navigationRange();assert.ok(inward.start>initial.start);assert.equal(inward.end,initial.end);
  f.pan(zoomRange(inward,Math.exp(.4),1));await f.frame();
  const expanded=f.latest().range;
  assert.equal(expanded.end,initial.end,'Source-boundary clamping cannot move the right-anchored date');
  assert.ok(expanded.start<initial.min,'The same BTC navigation permits genuine empty space before the source begins');
  assert.equal(expanded.allowEmpty,true);assert.ok(expanded.maxSpan<=expanded.spacingBounds.sourceLimit);
  assert.ok(Number.isInteger((expanded.start-expanded.min)/expanded.step));assert.ok(Number.isInteger((expanded.end-expanded.min)/expanded.step));
  assert.deepEqual(f.latest().series.candles,original,'Viewport freedom must not create or modify source candles');
});
