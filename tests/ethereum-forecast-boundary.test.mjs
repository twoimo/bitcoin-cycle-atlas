import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {utcDay,dateFromDay} from '../dist/cycle-engine.js';
import {readAssetDailyRows} from '../dist/asset-daily-observations.js';
import {buildEthereumAssetScenarioPaths,buildEthereumForecasts} from '../dist/ethereum-forecast.js';
import {buildTreasuryAssetPaths} from '../dist/treasury-asset-paths.js';

const AS_OF='2024-06-05', END_DATE='2024-06-12', SEED=20261022;
const firstDay=utcDay('2022-09-14'), cutoffDay=utcDay(AS_OF);
const observed=Array.from({length:cutoffDay-firstDay+1},(_,index)=>({
  date:dateFromDay(firstDay+index),
  price:1500*Math.exp(0.0003*index+0.04*Math.sin(index*0.23)+0.02*Math.cos(index*0.11)),
  epochDay:firstDay+index,
}));
const expected=buildEthereumAssetScenarioPaths(observed,AS_OF,END_DATE,SEED);

test('direct ETH engine excludes future prices and keeps truthful training and anchor identities',()=>{
  for(const futurePrice of [1,1e15,0,-1,NaN,Infinity,undefined]){
    const extended=[...observed,...Array.from({length:3},(_,index)=>({
      date:dateFromDay(cutoffDay+index+1),price:futurePrice,epochDay:cutoffDay+index+1,
    }))];
    const before=structuredClone(extended);
    const result=buildEthereumAssetScenarioPaths(extended,AS_OF,END_DATE,SEED);
    assert.deepEqual(result,expected);
    assert.deepEqual(extended,before);
    for(const model of Object.values(result)){
      assert.equal(model.path[0].date,AS_OF);
      assert.equal(model.path[0].price,observed.at(-1).price);
      assert.equal(model.path.at(-1).date,END_DATE);
      assert.equal(model.training.observations,observed.length-1);
      assert.equal(model.training.excludedPreMergeObservations,1);
      assert.equal(model.training.maxSourceDate,AS_OF);
      assert.ok(model.training.representativeBlocks.every(block=>block.sourceEndDate<=AS_OF));
    }
  }
});

test('direct ETH engine derives days from dates and accepts the shared normalized candle contract',()=>{
  const wrongDays=observed.map(row=>({...row,epochDay:-1}));
  assert.deepEqual(buildEthereumAssetScenarioPaths(wrongDays,AS_OF,END_DATE,SEED),expected);
  assert.ok(wrongDays.every(row=>row.epochDay===-1));
  const candles=observed.map(row=>({
    date:row.date+'T00:00:00.000Z',close:row.price,time:row.epochDay*86400,epochDay:Infinity,
  }));
  assert.deepEqual(buildEthereumAssetScenarioPaths(candles,AS_OF,END_DATE,SEED),expected);
  const conflicting=structuredClone(candles);
  conflicting.at(-1).time+=86400;
  assert.throws(()=>buildEthereumAssetScenarioPaths(conflicting,AS_OF,END_DATE,SEED),/timestamp conflicts/);
});

test('direct ETH engine rejects missing exact origins, duplicate/reversed dates and post-Merge gaps',()=>{
  assert.throws(()=>buildEthereumAssetScenarioPaths(observed.slice(0,-1),AS_OF,END_DATE,SEED),/exact asOf/);
  const reversed=structuredClone(observed);
  [reversed[100],reversed[101]]=[reversed[101],reversed[100]];
  assert.throws(()=>buildEthereumAssetScenarioPaths(reversed,AS_OF,END_DATE,SEED),/chronological/);
  const duplicate=structuredClone(observed);
  duplicate.splice(100,0,{...duplicate[100]});
  assert.throws(()=>buildEthereumAssetScenarioPaths(duplicate,AS_OF,END_DATE,SEED),/chronological/);
  const gap=structuredClone(observed);gap.splice(100,1);
  assert.throws(()=>buildEthereumAssetScenarioPaths(gap,AS_OF,END_DATE,SEED),/consecutive/);
  const futureDate=dateFromDay(cutoffDay+1);
  assert.throws(()=>buildEthereumAssetScenarioPaths([...observed,
    {date:futureDate,price:NaN},{date:futureDate,price:NaN},
  ],AS_OF,END_DATE,SEED),/chronological/);
});

test('direct ETH engine validates observed prices rather than concealing invalid prefix values',()=>{
  for(const price of [0,-1,NaN,Infinity,undefined]){
    const invalid=structuredClone(observed);
    invalid.at(-1).price=price;
    assert.throws(()=>buildEthereumAssetScenarioPaths(invalid,AS_OF,END_DATE,SEED),/positive and finite/);
  }
});

test('direct ETH engine validates both calendar labels, strict future horizon and uint32 seed',()=>{
  for(const date of [undefined,null,'2024-02-30','2024-06-05T00:00:00Z','2024-6-5']){
    assert.throws(()=>buildEthereumAssetScenarioPaths(observed,date,END_DATE,SEED),/date|calendar/i);
    assert.throws(()=>buildEthereumAssetScenarioPaths(observed,AS_OF,date,SEED),/date|calendar/i);
  }
  for(const date of [AS_OF,'2024-06-04']){
    assert.throws(()=>buildEthereumAssetScenarioPaths(observed,AS_OF,date,SEED),/horizon/);
  }
  for(const seed of [undefined,null,-1,0.5,4294967296,NaN,Infinity,'20261022']){
    assert.throws(()=>buildEthereumAssetScenarioPaths(observed,AS_OF,END_DATE,seed),/seed/);
  }
  for(const seed of [0,4294967295]){
    assert.equal(buildEthereumAssetScenarioPaths(observed,AS_OF,END_DATE,seed).base.metadata.seed,seed);
  }
});

test('chart and BMNR wrappers retain identical actual-archive paths, settings and source identities',async()=>{
  const ethHistory=JSON.parse(await readFile(new URL('../dist/data/eth-ohlc.json',import.meta.url),'utf8'));
  const asOf='2026-10-23',endYear=2035,seed=SEED;
  const rows=readAssetDailyRows(ethHistory,'ETH',asOf);
  const engine=buildEthereumAssetScenarioPaths(rows,asOf,endYear+'-12-31',seed);
  const chart=buildEthereumForecasts({ethHistory,asOf,endYear,seed});
  const treasury=buildTreasuryAssetPaths({symbol:'BMNR',ethHistory,asOf,endYear,seed});
  for(const id of ['stress','base','bull']){
    assert.deepEqual(chart.forecasts[id].assetPath,engine[id]);
    assert.deepEqual(treasury.scenarios[id],engine[id]);
    assert.equal(engine[id].metadata.blockDays,28);
    assert.equal(engine[id].metadata.residualHalfLifeDays,730);
    assert.equal(engine[id].metadata.sampleCount,1);
    assert.equal(engine[id].metadata.probability,null);
    assert.equal(engine[id].metadata.calibrated,false);
    assert.deepEqual(engine[id].sourceIds,['model-eth-valuation','bmnr-model-method','eth-merge-eip-3675']);
  }
  assert.equal(engine.stress.anchors[0].price,360);
  assert.equal(engine.base.anchors[0].price,rows.at(-1).price);
  assert.equal(engine.bull.anchors[0].price,22000);
});
