import assert from 'node:assert/strict';
import test from 'node:test';
import { equityPayload,equityViewFixture } from './helpers/equity-view-fixture.mjs';
import { DAY,preserved } from './helpers/interval-viewport.mjs';

for(const symbol of ['MSTR','BMNR'])test(`${symbol} weekly switch and scale mode retain the source-correct manual viewport`,async()=>{
  const f=await equityViewFixture(symbol);f.reply(0,equityPayload(symbol,1));await f.microtasks();f.reply(1,{revision:1});await f.settle();await f.initialization;
  const original=structuredClone(f.latest().series.candles),initial=f.latest().range,domain={min:80,max:130};
  f.pan({...initial,start:initial.min-30*DAY,end:initial.min+180*DAY,allowEmpty:true,maxSpan:6000});f.priceRange(domain);await f.frame();const daily=f.snapshot();
  f.interval('weekly');await f.settle();const weekly=f.snapshot();preserved(daily,weekly,domain);assert.match(weekly.range.contextKey,new RegExp(`${symbol}:weekly:`));
  f.interval('daily');await f.settle();preserved(weekly,f.latest(),domain);assert.deepEqual(f.latest().series.candles,original);
  f.action('scale');await f.frame();assert.equal(f.latest().scale,'normal','Funnest names the linear price axis normal');assert.deepEqual(f.latest().priceDomain,domain);
  f.priceRange({min:-20,max:130});await f.frame();f.action('scale');await f.frame();assert.equal(f.latest().scale,'log');assert.equal(f.latest().priceDomain,null,'log mode cannot retain a nonpositive domain');
});
