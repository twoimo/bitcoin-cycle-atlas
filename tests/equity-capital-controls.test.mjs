import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {buildTreasuryProjection} from '../dist/treasury-projection.js';
import {equityViewFixture} from './helpers/equity-view-fixture.mjs';

for(const symbol of ['MSTR','BMNR'])test(`${symbol} live capital controls recalculate current snapshots without refetching or changing OHLC`,async()=>{
  const read=async name=>JSON.parse(await readFile(new URL(`../dist/data/${name}.json`,import.meta.url),'utf8'));
  const history=await read(`${symbol.toLowerCase()}-ohlc`),underlying=await read(symbol==='MSTR'?'btc-daily':'eth-ohlc'),calls=[];
  const f=await equityViewFixture(symbol,{project:options=>{calls.push(options);return buildTreasuryProjection(options);}});
  f.reply(0,history);await f.microtasks();f.reply(1,underlying);await f.settle();await f.initialization;
  const before=structuredClone(f.latest().series.candles),baseline=f.latest().forecast;
  const markup=f.forecastDialog();
  assert.match(markup,/금융상품 원장/);
  if(symbol==='MSTR'){
    assert.match(markup,/만기 30일 전/);
    f.capitalSetting('equity-capital-policy','hold-to-maturity');await f.settle();
    assert.equal(calls.at(-1).capitalPolicy,'hold-to-maturity');
    assert.ok(f.latest().forecast.instrumentEvents.every(item=>item.date>='2028-09-15'));
    assert.notEqual(f.latest().forecast.path.at(-1).price,baseline.path.at(-1).price);
    f.capitalSetting('equity-capital-policy','cash-at-put');await f.settle();
    assert.equal(calls.length,2,'an already computed policy reuses its input-specific bundle');
    assert.equal(f.latest().forecast,baseline);
  }else{
    assert.match(markup,/스테이킹 중 ETH/);
    f.capitalSetting('equity-exit-delay','30');await f.settle();
    assert.equal(calls.at(-1).exitDelayDays,30);
    assert.equal(f.latest().forecast.path[0].components.liquidity.exitDelayDays,30);
  }
  assert.equal(f.requests.length,2);assert.deepEqual(f.latest().series.candles,before);
});
