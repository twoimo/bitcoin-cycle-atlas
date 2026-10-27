import test from 'node:test';
import assert from 'node:assert/strict';
import {utcDay,dateFromDay} from '../dist/cycle-engine.js';
import {buildSimpleEthereumBtcLink,buildEthereumRelativeBenchmarks} from '../dist/ethereum-model-comparison.js';

function fixture({ethAnchor=1e-300,btcDrift=.008,beta=2500}={}){
  const ethRows=[],btcRows=[],first=utcDay('2024-01-01');
  let e=Math.log(ethAnchor),b=Math.log(100);
  for(let i=0;i<=365;i++){
    if(i){const innovation=1e-6*Math.sin(i*.19);b+=btcDrift+innovation;e+=beta*innovation;}
    ethRows.push({date:dateFromDay(first+i),price:Math.exp(e)});
    btcRows.push({date:dateFromDay(first+i),price:Math.exp(b)});
  }
  return {ethRows,btcRows,asOf:ethRows.at(-1).date,horizons:[180]};
}

test('BTC-linked price remains available when only its intermediate exponential overflows',()=>{
  const inputs=fixture(),result=buildSimpleEthereumBtcLink(inputs);
  assert.equal(result.status,'ready');
  const logChange=result.assumptions.beta*result.assumptions.btcDrift*180;
  assert.equal(Math.exp(logChange),Infinity);
  const expected=Math.exp(Math.log(inputs.ethRows.at(-1).price)+logChange);
  assert.ok(Number.isFinite(expected)&&expected>0);
  assert.equal(result.predictions[0].price,expected);
  assert.ok(result.assumptions.beta>2000,'The beta estimate is not silently clipped');
});

test('BTC-linked price remains available when only its intermediate exponential underflows',()=>{
  const inputs=fixture({ethAnchor:1e300,btcDrift:-.008}),result=buildSimpleEthereumBtcLink(inputs);
  assert.equal(result.status,'ready');
  const logChange=result.assumptions.beta*result.assumptions.btcDrift*180;
  assert.equal(Math.exp(logChange),0);
  const expected=Math.exp(Math.log(inputs.ethRows.at(-1).price)+logChange);
  assert.ok(Number.isFinite(expected)&&expected>0);
  assert.equal(result.predictions[0].price,expected);
});

test('BTC-linked predictions preserve ordinary arithmetic and still reject final range failures',()=>{
  const inputs=fixture({ethAnchor:2000,btcDrift:.001,beta:1.4}),result=buildSimpleEthereumBtcLink(inputs);
  assert.equal(result.status,'ready');
  assert.equal(result.predictions[0].price,inputs.ethRows.at(-1).price*
    Math.exp(result.assumptions.beta*result.assumptions.btcDrift*180));
  for(const invalid of [fixture({ethAnchor:100}),fixture({ethAnchor:1,btcDrift:-.008})]){
    const rejected=buildSimpleEthereumBtcLink(invalid);
    assert.equal(rejected.status,'unavailable');
    assert.match(rejected.reason,/overflow/);assert.deepEqual(rejected.predictions,[]);
  }
});

test('unrepresentable ETH/BTC ratio anchors remain unavailable independently of USD exponent fallback',()=>{
  const first=utcDay('2024-01-01');
  for(const [ethPrice,btcPrice] of [[1e300,1e-300],[1e-300,1e300]]){
    const rows=Array.from({length:181},(_,i)=>({date:dateFromDay(first+i)}));
    const result=buildEthereumRelativeBenchmarks({ethRows:rows.map(r=>({...r,price:ethPrice})),
      btcRows:rows.map(r=>({...r,price:btcPrice})),asOf:rows.at(-1).date,horizons:[30]});
    assert.equal(result.status,'unavailable');assert.match(result.reason,/ratio/);
  }
});
