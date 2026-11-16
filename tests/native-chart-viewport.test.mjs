import assert from 'node:assert/strict';
import test from 'node:test';
import {readFile} from 'node:fs/promises';
import {accumulateWheelRange,zoomRange} from '../dist/chart-navigation.js';
import { ethPayload,ethViewFixture } from './helpers/eth-view-fixture.mjs';
import { equityViewFixture } from './helpers/equity-view-fixture.mjs';
import { DAY,preserved } from './helpers/interval-viewport.mjs';

test('ETH daily/weekly switch keeps manual time and price through the actual async initializer',async()=>{
  const f=await ethViewFixture({query:'&forecast=off'});f.reply(0,ethPayload());await f.settle();await f.initialization;
  const original=structuredClone(f.latest().series.candles),initial=f.latest().range,domain={min:80,max:130};
  f.pan({...initial,start:initial.end-90*DAY,end:initial.end+30*DAY,allowEmpty:true,maxSpan:6000});f.priceRange(domain);await f.frame();const daily=f.latest();
  f.interval('weekly');await f.settle();const weekly=f.latest();preserved(daily,weekly,domain);assert.equal(weekly.range.step,7*DAY);assert.match(weekly.range.contextKey,/weekly/);
  f.interval('daily');await f.settle();preserved(weekly,f.latest(),domain);assert.deepEqual(f.latest().series.candles,original);
  f.span('1m');await f.settle();assert.deepEqual(f.latest().priceDomain,domain,'a time preset does not silently reset a manual price axis');
});

for(const [symbol,slug]of [['ETHUSD','eth'],['MSTR','mstr'],['BMNR','bmnr']])test(`${symbol} real-source initializer keeps the right endpoint when zoom expands before its first observation`,async()=>{
  const payload=JSON.parse(await readFile(new URL(`../dist/data/${slug}-ohlc.json`,import.meta.url),'utf8'));
  const f=symbol==='ETHUSD'?await ethViewFixture({query:'&forecast=off'}):await equityViewFixture(symbol);
  f.reply(0,payload);
  if(symbol!=='ETHUSD'){await f.microtasks();f.reply(1,{revision:1});}
  await f.settle();await f.initialization;
  const original=structuredClone(f.latest().series.candles);
  // Start each native range at its real source boundary so expansion crosses
  // into empty history without mutating the observations.
  {const range=f.latest().range;f.pan({...range,start:range.min,end:range.min+120*DAY,allowEmpty:true,maxSpan:6000});await f.frame();}
  // Use Funnest's public chart layout/range surface, not the retired SVG
  // renderer's plotLeft/plotRight datasets.
  assert.ok(Number.isFinite(f.latest().chart.layout.plotWidth)&&f.latest().chart.layout.plotWidth>0,'viewport integration reads the Funnest public layout width');
  const initial=f.latest().range;
  const inward=accumulateWheelRange(initial,null,{factor:Math.exp(-.24),anchor:1});
  f.pan(inward.range);await f.frame();
  assert.ok(f.latest().range.start>initial.start);assert.equal(f.latest().range.end,initial.end);
  f.pan(accumulateWheelRange(f.latest().range,null,{factor:Math.exp(.4),anchor:1}).range);await f.frame();
  const expanded=f.latest().range;
  assert.equal(expanded.end,initial.end,'Source-boundary clamping cannot move the right-anchored date');
  assert.ok(expanded.start<initial.min,'The same BTC navigation permits genuine empty space before the source begins');
  assert.equal(expanded.allowEmpty,true);assert.ok(expanded.maxSpan<=6000);
  assert.ok(Number.isInteger((expanded.start-expanded.min)/expanded.step));assert.ok(Number.isInteger((expanded.end-expanded.min)/expanded.step));
  assert.deepEqual(f.latest().series.candles,original,'Viewport freedom must not create or modify source candles');
});
