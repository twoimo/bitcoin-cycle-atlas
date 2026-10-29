import assert from 'node:assert/strict';
import test from 'node:test';
import {utcDay,dateFromDay} from '../dist/cycle-engine.js';
import {computeRollingStates,detectDirectionalChanges,aggregateCloseBars} from '../dist/market-structure.js';
const rows=(prices,start='2020-01-01')=>prices.map((price,index)=>[dateFromDay(utcDay(start)+index),price]);
const close=(a,b,tolerance=1e-10)=>assert.ok(Math.abs(a-b)<=tolerance*Math.max(1,Math.abs(b)),`${a} != ${b}`);

test('rolling statistics match direct window definitions across scales, gaps and window sizes', () => {
  const prices = Array.from({ length: 950 }, (_, i) => 100 * Math.exp(i / 7000 + 0.2 * Math.sin(i / 19) + 0.03 * Math.cos(i / 3)));
  for (const scale of [1e-100, 1, 1e100]) for (const [shortWindow, longWindow] of [[1, 1], [2, 5], [28, 91], [100, 365]]) {
    const input = rows(prices.map(price => price * scale)).filter((_, i) => i !== 432);
    const points = computeRollingStates(input, { shortWindow, longWindow }).points;
    for (const i of [longWindow, 431, 432, 450, 800, input.length - 1]) {
      const point = points[i];
      const window = input.slice(i - shortWindow, i + 1);
      const complete = i >= shortWindow && utcDay(window.at(-1)[0]) - utcDay(window[0][0]) === shortWindow;
      if (!complete) { assert.equal(point.shortMA, null); assert.equal(point.realizedVolPct, null); continue; }
      const logs = window.map(row => Math.log(row[1]));
      const logAverage = logs.reduce((a, b) => a + b, 0) / logs.length;
      assert.ok(Math.abs(Math.log(point.shortMA) - logAverage) < 2e-12, 'geometric window mean');
      const returns = window.slice(1).map((row, j) => Math.log(row[1] / window[j][1]));
      const average = returns.reduce((a, b) => a + b, 0) / returns.length;
      const volatility = returns.length > 1 ? Math.sqrt(returns.reduce((sum, value) => sum + (value - average) ** 2, 0) / (returns.length - 1)) * Math.sqrt(365) * 100 : null;
      if (volatility === null) assert.equal(point.realizedVolPct, null);
      else close(point.realizedVolPct, volatility, 1e-10);
      close(point.rollingRangePct, (Math.max(...window.map(row => row[1])) / Math.min(...window.map(row => row[1])) - 1) * 100);
      close(point.rollingReturnPct, (window.at(-1)[1] / window[0][1] - 1) * 100);
    }
  }
  const constant = computeRollingStates(rows(Array(4000).fill(60000)));
  assert.ok(constant.points.slice(91).every(point => point.state === 'range' && point.realizedVolPct === 0));
  const shockThenQuiet = computeRollingStates(rows([100, 10000, ...Array(200).fill(100)]));
  assert.ok(shockThenQuiet.points.slice(30).every(point => point.realizedVolPct === 0), 'expired shocks leave no residual variance');
});

test('rolling statistics compute each observation log only a bounded number of times', () => {
  const input = rows(Array.from({ length: 4000 }, (_, i) => 100 + i % 17));
  const original = Math.log;
  let reads = 0;
  Math.log = value => { reads++; return original(value); };
  try {
    const result = computeRollingStates(input, { shortWindow: 200, longWindow: 1000 });
    assert.equal(result.points.length, input.length);
    assert.ok(result.current.shortMA > 0 && Number.isFinite(result.current.realizedVolPct));
    assert.ok(reads <= input.length * 3, `${reads} logarithms for ${input.length} rows`);
  } finally { Math.log = original; }
});

test('out-of-cutoff invalid values cannot make an already observable state history unavailable', () => {
  const prefix = rows(Array.from({ length: 400 }, (_, i) => 100 + i % 23));
  const cutoff = prefix.at(-1)[0];
  const poisonedFuture = [...prefix, [dateFromDay(utcDay(cutoff) + 1), NaN]];
  assert.deepEqual(computeRollingStates(poisonedFuture, { asOf: cutoff }), computeRollingStates(prefix));
  assert.deepEqual(detectDirectionalChanges(poisonedFuture, { asOf: cutoff }), detectDirectionalChanges(prefix));
  assert.deepEqual(aggregateCloseBars(poisonedFuture, { asOf: cutoff }), aggregateCloseBars(prefix));
  assert.throws(() => computeRollingStates(poisonedFuture), /positive finite price/);
});

test('geometric-mean equality has the same regime in every quote unit', () => {
  // 50×100×25×50 = 50^4. The last price is exactly the four-point GMA,
  // while its short-window drawdown is 50%; equality belongs to pullback.
  for (const scale of [0.1, 1, 2, 10, 100, 60000, 1e-50, 1e50, 1e-100, 1e100]) {
    const result = computeRollingStates(rows([50, 100, 25, 50].map(value => value * scale)), { shortWindow: 2, longWindow: 3 });
    assert.equal(result.current.state, 'pullback', `quote scale ${scale}`);
  }
  for (const initial of [[], [7]]) for (const scale of [1e-100, 1, 1e100]) for (const delta of [1e-8, 1e-12]) {
    for (const [direction, multiplier] of [['correction', 1 - delta], ['pullback', 1 + delta], ['pullback', 1]]) {
      const result = computeRollingStates(rows([...initial, 50, 100, 25, 50 * multiplier].map(value => value * scale)), { shortWindow: 2, longWindow: 3 });
      assert.equal(result.current.state, direction, `quote scale ${scale}, initial ${initial}, relative change ${multiplier - 1}`);
    }
  }
});

test('legacy cross-range fixtures respect the current finite-output boundary',()=>{
  const fixtures=[
    [1e-300,1e300,1e-300,1e300],
    ...[Number.MAX_VALUE,1e308].map(anchor=>[anchor,...Array(10).fill(1e-15)]),
    [1e-100,...Array(10).fill(Number.MAX_VALUE)],
    [1e100,...Array(10).fill(Number.MIN_VALUE)],
  ];
  for(const prices of fixtures)assert.throws(()=>computeRollingStates(rows(prices),{shortWindow:2,longWindow:3}),/finite numeric range/);
});

test('constant representable extreme prices preserve exact finite means and zero volatility',()=>{
  for(const [anchor,price] of [[1e-100,Number.MIN_VALUE],[1e100,Number.MAX_VALUE]]){
    const result=computeRollingStates(rows([anchor,...Array(10).fill(price)]),{shortWindow:2,longWindow:3}).current;
    assert.equal(result.shortMA,price);assert.equal(result.longMA,price);assert.equal(result.realizedVolPct,0);
  }
  for(const price of [Number.MIN_VALUE,1e-300,1,1e300,Number.MAX_VALUE]){
    const result=computeRollingStates(rows(Array(20).fill(price)),{shortWindow:2,longWindow:3}).current;
    assert.equal(result.shortMA,price);assert.equal(result.longMA,price);assert.equal(result.realizedVolPct,0);
  }
});
