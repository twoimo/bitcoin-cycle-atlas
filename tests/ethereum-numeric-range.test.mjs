import test from 'node:test';
import assert from 'node:assert/strict';
import {buildEthereumEconomicCandidate} from '../dist/ethereum-economic-model.js';
import {buildSimpleEthereumBtcLink} from '../dist/ethereum-model-comparison.js';
import {fixture} from './helpers/eth-economic-fixture.mjs';

// Deliberately synthetic extreme finite prices: numerical-domain checks only.
function constantFeatures(){
  const input=fixture(600);input.horizons=[30];
  const m={...input.economicSnapshots[0].metrics};
  for(const snapshot of input.economicSnapshots)snapshot.metrics={...m};
  return input;
}
test('finite 30-day log targets survive an intermediate ratio outside Number range',()=>{
  const input=constantFeatures();
  input.ethRows.forEach((r,i)=>{r.price=Math.floor(i/30)%2===0?1e-200:1e200;input.btcRows[i].price=r.price;});
  const result=buildEthereumEconomicCandidate(input);
  assert.equal(result.status,'ready',result.reason);
  assert.equal(result.training[0].eligibleOrigins,19);
  const p=result.predictions[0];
  assert.ok(Math.abs(p.logReturn-400*Math.LN10/19)<1e-10);
  assert.equal(p.relativeLogReturn,0);assert.equal(p.ethBtcRatio,1);
  assert.ok(Number.isFinite(p.price)&&p.price>0);
});
test('equal extreme ETH and BTC changes retain zero relative momentum',()=>{
  const input=constantFeatures();
  input.ethRows.forEach((r,i)=>{r.price=i===599?1e200:1e-200;input.btcRows[i].price=r.price;});
  const result=buildEthereumEconomicCandidate(input);
  assert.equal(result.status,'ready',result.reason);
  assert.equal(result.training[0].eligibleOrigins,19);
  const features=result.contributions[0].features;
  const values=features.map(f=>f.value);
  assert.equal(values[8],0);assert.ok(Math.abs(values[9]-400*Math.LN10)<1e-10);
  assert.equal(result.predictions[0].relativeLogReturn,0);
});
for(const [scale,desired]of [[1e-200,800],[1e200,-800]]){
  test('finite final price survives intermediate exponential range failure '+desired,()=>{
    const input=fixture(600);input.horizons=[30];
    for(const r of input.ethRows)r.price*=scale;
    for(const r of input.btcRows)r.price=1;
    const before=buildEthereumEconomicCandidate(input);assert.equal(before.status,'ready',before.reason);
    const coefficient=before.coefficients[0].ethUsd.features.find(f=>f.id==='netSupplyRate').coefficientPerTransformedUnit;
    assert.ok(Math.abs(coefficient)>1e-8,'Synthetic identifying feature must have nonzero slope');
    const metrics=input.economicSnapshots.at(-1).metrics;
    metrics.consensusNetIssuanceEth+=(desired-before.predictions[0].logReturn)/coefficient*metrics.supplyEth;
    const after=buildEthereumEconomicCandidate(input);
    assert.equal(after.status,'ready',after.reason);
    assert.deepEqual(after.training,before.training);assert.deepEqual(after.coefficients,before.coefficients);
    const p=after.predictions[0];
    assert.ok(Math.abs(p.logReturn-desired)<1e-7);
    assert.ok(Number.isFinite(p.price)&&p.price>0&&Number.isFinite(p.ethBtcRatio)&&p.ethBtcRatio>0);
    assert.ok(Math.abs(Math.log(p.price)-Math.log(after.currentInput.observedEthUsd)-p.logReturn)<1e-10);
    metrics.consensusNetIssuanceEth+=(2000-desired)/coefficient*metrics.supplyEth;
    const impossible=buildEthereumEconomicCandidate(input);
    assert.equal(impossible.status,'unavailable');
    assert.match(impossible.predictions[0].reason,/finite positive numeric range/);
  });
}
test('identical ETH and BTC finite log returns identify beta one despite an overflowing ratio',()=>{
  const first=Date.parse('2025-01-01T00:00:00Z');
  const rows=Array.from({length:366},(_,i)=>({date:new Date(first+i*86400000).toISOString().slice(0,10),
    price:i===0?1e-300:i===1?1e300:10000*Math.exp(.001*Math.sin(i))}));
  const result=buildSimpleEthereumBtcLink({ethRows:rows,btcRows:rows,asOf:rows.at(-1).date});
  assert.equal(result.status,'ready',result.reason);assert.equal(result.assumptions.beta,1);
  assert.ok(result.predictions.every(p=>Number.isFinite(p.price)&&p.price>0));
});
