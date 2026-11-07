import assert from 'node:assert/strict';
import test from 'node:test';
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
