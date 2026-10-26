import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {buildEthereumForecasts} from '../dist/ethereum-forecast.js';
import {buildTreasuryAssetPaths} from '../dist/treasury-asset-paths.js';
import {ethViewFixture} from './helpers/eth-view-fixture.mjs';

const ethHistory=JSON.parse(await readFile(new URL('../dist/data/eth-ohlc.json',import.meta.url),'utf8'));
const asOf='2026-10-23';
const direct=buildEthereumForecasts({ethHistory,asOf});

test('standalone ETH and BMNR use identical dated prices at the same cutoff and seed',()=>{
  const treasury=buildTreasuryAssetPaths({symbol:'BMNR',ethHistory,asOf});
  for(const id of ['stress','base','bull']){
    const forecast=direct.forecasts[id];
    assert.deepEqual(forecast.path.map(({date,price,baselinePrice})=>({date,price,baselinePrice})),treasury.scenarios[id].path.map(({date,price,baselinePrice})=>({date,price,baselinePrice})));
    assert.equal(forecast.pathMode,'crypto-conditional-daily');
    assert.equal(forecast.probability,null);assert.equal(forecast.calibrated,false);
    assert.ok(forecast.path.every(point=>!('open' in point)&&!('volume' in point)));
    assert.ok(forecast.milestones.every(item=>item.kind==='valuation-condition'));
  }
  for(let i=0;i<direct.forecasts.base.path.length;i++){
    const points=Object.values(direct.forecasts).map(item=>item.path[i]);
    assert.ok(points.every(point=>point.low===Math.min(...points.map(row=>row.price))&&point.high===Math.max(...points.map(row=>row.price))));
  }
});

test('ETH forecast cutoff and source eligibility are strict and future observations do not leak',()=>{
  const before=JSON.stringify(ethHistory);
  const altered=structuredClone(ethHistory);
  for(const row of altered.dailyHistory.candles)if(row.date.slice(0,10)>asOf)row.close=1e15;
  assert.deepEqual(buildEthereumForecasts({ethHistory:altered,asOf}),direct);
  assert.equal(JSON.stringify(ethHistory),before);
  assert.throws(()=>buildEthereumForecasts({ethHistory,asOf:'2030-12-31'}),/exact.*asOf/);
  assert.throws(()=>buildEthereumForecasts({ethHistory,asOf,endYear:2026}),/horizon/);
  assert.throws(()=>buildEthereumForecasts({ethHistory,asOf,seed:-1}),/seed/);
});

test('the production ETH view exposes scenarios, preserves exact observed candles and omits intraday futures',async()=>{
  const f=await ethViewFixture({query:'&eth-model=valuation'});f.reply(0,ethHistory);await f.settle();await f.initialization;
  const observed=structuredClone(f.latest().series.candles),anchor=observed.at(-1);
  assert.equal(f.latest().forecast.asOf,anchor.date.slice(0,10));
  assert.equal(f.latest().forecast.path[0].price,anchor.close);
  assert.ok(f.latest().range.max>anchor.time);
  const dialog=f.forecastDialog();
  assert.match(dialog.querySelector('#eth-data-content').innerHTML,/ETH와 BMNR/);
  assert.match(dialog.querySelector('#eth-data-content').innerHTML,/조건 기준선과 무작위 예시 1개/);
  assert.match(dialog.querySelector('#eth-data-content').innerHTML,/관측 자료에 적합한 경제 모형의 결과가 아닙니다/);
  f.forecastSetting('eth-scenario','stress');await f.settle();
  assert.equal(f.latest().forecast.scenario.id,'stress');
  assert.deepEqual(f.latest().series.candles,observed);
  f.forecastSetting('eth-forecast-visible',false);await f.settle();
  assert.equal(f.latest().forecast,null);assert.equal(f.latest().range.max,anchor.time+86400);
  f.forecastSetting('eth-forecast-visible',true);await f.settle();
  f.interval('1h');await f.settle();
  if(f.requests.length>1){for(let i=1;i<f.requests.length;i++)f.replyCandles(i);await f.settle();}
  assert.equal(f.latest().forecast,null);
  f.interval('daily');await f.settle();
  assert.equal(f.latest().forecast.scenario.id,'stress');
  assert.deepEqual(f.latest().series.candles,observed);
});
