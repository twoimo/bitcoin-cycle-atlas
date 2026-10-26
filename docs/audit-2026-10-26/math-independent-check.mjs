import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { computeRollingStates } from '../../dist/market-structure.js';

// Independent bounded review of the performance implementation's actual API.
// The oracle recomputes each window directly; it does not copy rolling queues,
// compensated sums, log-comparison policy, or two-stack Welford aggregates.
const date = index => new Date(Date.UTC(2024, 0, 1 + index)).toISOString().slice(0, 10);
let state = 834382, comparisons = 0, maxRelativeMeanError = 0, maxRelativeVolError = 0;
const random = () => (state = Math.imul(state, 1664525) + 1013904223 >>> 0) / 2 ** 32;
for (let trial = 0; trial < 80; trial++) {
  const prices = Array.from({ length: 200 }, () => Math.exp(-3 + 6 * random()));
  const settings = { shortWindow: 2 + Math.floor(random() * 31), longWindow: 50 + Math.floor(random() * 80) };
  const base = computeRollingStates(prices.map((price, index) => [date(index), price]), settings);
  for (const scale of [1e-250, 1e-100, 1e100, 1e250]) {
    const scaled = computeRollingStates(prices.map((price, index) => [date(index), price * scale]), settings);
    assert.deepEqual(scaled.points.map(point => point.state), base.points.map(point => point.state));
    comparisons++;
  }
  for (let index = settings.longWindow; index < prices.length; index++) {
    for (const key of ['short', 'long']) {
      const window = settings[`${key}Window`], values = prices.slice(index - window, index + 1);
      const expected = Math.exp(values.reduce((sum, price) => sum + Math.log(price), 0) / values.length);
      const error = Math.abs(base.points[index][`${key}MA`] / expected - 1);
      maxRelativeMeanError = Math.max(maxRelativeMeanError, error);
      assert.ok(error < 1e-12, `${key} geometric mean disagreement`);
    }
    const returns = prices.slice(index - settings.shortWindow + 1, index + 1)
      .map((price, offset) => Math.log(price / prices[index - settings.shortWindow + offset]));
    const mean = returns.reduce((sum, value) => sum + value, 0) / returns.length;
    const expected = Math.sqrt(returns.reduce((sum, value) => sum + (value - mean) ** 2, 0) / (returns.length - 1)) * Math.sqrt(365) * 100;
    const error = Math.abs(base.points[index].realizedVolPct / expected - 1);
    maxRelativeVolError = Math.max(maxRelativeVolError, error);
    assert.ok(error < 1e-12, 'sample standard deviation disagreement');
  }
}
for (const scale of [1e-300, 1e-100, 0.01, 1, 10, 100, 1e100, 1e300]) {
  const result = computeRollingStates([1, 4, 2].map((price, index) => [date(index), price * scale]), { shortWindow: 2, longWindow: 2 });
  assert.equal(result.current.state, 'pullback');
}
for (const price of [Number.MIN_VALUE, Number.MAX_VALUE]) {
  const result = computeRollingStates(Array.from({ length: 300 }, (_, index) => [date(index), price]));
  assert.equal(result.current.shortMA, price);
  assert.equal(result.current.longMA, price);
  assert.equal(result.current.realizedVolPct, 0);
}
for (const prices of [[1e-200, 1e106, 1e-100], [1e300, 1e301, 1e300], [1e-300, 4e-300, 2e-300]]) {
  const result = computeRollingStates(prices.map((price, index) => [date(index), price]), { shortWindow: 2, longWindow: 2 });
  assert.ok(Number.isFinite(result.current.realizedVolPct));
  assert.ok(Number.isFinite(result.current.longMA));
}
console.log(JSON.stringify({
  status: 'PASS', node: process.version,
  sourceSha256: createHash('sha256').update(await readFile(new URL('../../dist/market-structure.js', import.meta.url))).digest('hex'),
  seed: 834382, randomTrials: 80, rowsPerTrial: 200, unitScaleComparisons: comparisons,
  equalityScales: 8, constantExtremes: 2, mixedExtremeCases: 3,
  maxRelativeMeanError, maxRelativeVolError,
  scope: 'Bounded real-code arithmetic and unit-invariance checks; not an unbounded floating-point proof or validation of a profitable trading rule.',
}, null, 2));
