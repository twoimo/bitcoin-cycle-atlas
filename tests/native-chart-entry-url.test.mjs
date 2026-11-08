import test from 'node:test';
import assert from 'node:assert/strict';
import {ethPayload, ethViewFixture} from './helpers/eth-view-fixture.mjs';
import {equityPayload, equityViewFixture} from './helpers/equity-view-fixture.mjs';

// Execute each complete production initializer, then its real delegated period
// and frequency controls. The fixtures only inject DOM/network/timer boundaries.
for (const symbol of ['ETHUSD', 'MSTR', 'BMNR']) test(`${symbol} first entry retains the supplied URL; explicit chart edits still serialize`, async () => {
  const nativeSpan = symbol === 'ETHUSD' ? 'eth-span' : 'equity-span';
  const query = `&page=outlook&granularity=weekly&type=candles&axis=linear&${nativeSpan}=6m&forecast=off`;
  const f = symbol === 'ETHUSD' ? await ethViewFixture({query}) : await equityViewFixture(symbol, {query});
  const supplied = `/?symbol=${symbol}${query}`;
  assert.equal(f.location.pathname + f.location.search, supplied);
  assert.deepEqual(f.urlWrites, [], 'loading is not a user edit');
  if (symbol === 'ETHUSD') f.reply(0, ethPayload());
  else {
    f.reply(0, equityPayload(symbol, 1));
    await f.microtasks();
    f.reply(1, {revision:1});
  }
  await f.settle(); await f.initialization;
  assert.ok(f.latest()?.series?.candles.length, 'the check reaches a rendered observed chart');
  assert.equal(f.location.pathname + f.location.search, supplied, 'ready/paint leaves the supplied URL untouched');
  assert.deepEqual(f.urlWrites, [], 'initial observation loading cannot create URL state');

  f.span('1y'); await f.settle();
  assert.equal(f.urlWrites.length, 1, 'an explicit period choice still persists');
  const period = new URLSearchParams(f.location.search);
  assert.equal(period.get('symbol'), symbol);
  assert.equal(period.get('span'), '1y');
  assert.equal(period.has(nativeSpan), false, 'legacy span is accepted on entry and canonicalized only after an explicit edit');
  assert.equal(period.get('granularity'), 'weekly');
  assert.equal(period.get('type'), 'candles');
  assert.equal(period.get('axis'), 'linear');
  assert.equal(period.get('forecast'), 'off');

  f.interval('daily'); await f.settle();
  assert.equal(f.urlWrites.length, 2, 'an explicit interval choice remains a separate edit');
  const interval = new URLSearchParams(f.location.search);
  assert.equal(interval.has('granularity'), false, 'the existing default-value omission policy is retained');
  assert.equal(interval.get('span'), '1y');
  assert.equal(interval.get('symbol'), symbol);
});

for (const symbol of ['ETHUSD', 'MSTR', 'BMNR']) test(`${symbol} restores shared viewport keys without first-entry URL or history writes`, async () => {
  const query='&granularity=daily&type=candles&axis=linear&span=1y&view-start=2026-09-07&view-end=2026-10-19&price-min=70&price-max=180&axis-inverted=1&magnet=weak&forecast=off';
  const f=symbol==='ETHUSD'?await ethViewFixture({query}):await equityViewFixture(symbol,{query});
  if(symbol==='ETHUSD')f.reply(0,ethPayload());
  else{f.reply(0,equityPayload(symbol,1));await f.microtasks();f.reply(1,{revision:1});}
  await f.settle();await f.initialization;
  const view=f.latest();
  assert.equal(new Date(view.range.start*1000).toISOString().slice(0,10),'2026-09-07');
  assert.equal(new Date(view.range.end*1000).toISOString().slice(0,10),'2026-10-19');
  assert.deepEqual(view.priceDomain,{min:70,max:180});assert.equal(view.invertScale,true);assert.equal(view.magnet,'weak');
  assert.deepEqual(f.urlWrites,[],'restoring a shared URL is initialization, not an edit');
  assert.equal(f.location.pathname+f.location.search,`/?symbol=${symbol}${query}`);
  f.interval('weekly');await f.settle();
  const edited=new URLSearchParams(f.location.search);
  assert.equal(edited.get('granularity'),'weekly');assert.equal(edited.get('view-start'),'2026-09-07');
  assert.equal(edited.get('view-end'),'2026-10-19');assert.equal(edited.get('span'),'1y');
  assert.equal(edited.get('price-min'),'70');assert.equal(edited.get('axis-inverted'),'1');
});
