import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { utcDay, dateFromDay } from '../dist/cycle-engine.js';
import {
  aggregateCloseBars, computeRollingStates, detectDirectionalChanges, getMacroCycles,
  theilSenTrend, fibonacciLevels, confirmedSwingRetracement, evaluateFibonacci,
  analyzeMarketStructure, STATES,
} from '../dist/market-structure.js';

const data = JSON.parse(await readFile(new URL('./fixtures/btc-daily-2026-10-20.json', import.meta.url), 'utf8'));
const rows = (prices, start = '2020-01-01') => prices.map((price, index) => [dateFromDay(utcDay(start) + index), price]);
const close = (a, b, tolerance = 1e-10) => assert.ok(Math.abs(a - b) <= tolerance * Math.max(1, Math.abs(b)), `${a} != ${b}`);

test('calendar MDD and period return carry in the previous close', () => {
  const periods = aggregateCloseBars([
    ['2023-12-31', 100], ['2024-01-01', 80], ['2024-01-02', 90],
  ], { frequency: 'monthly' });
  assert.equal(periods[0].returnPct, null);
  const january = periods[1];
  close(january.returnPct, -10);
  close(january.firstToLastReturnPct, 12.5);
  close(january.maxDrawdownPct, -20);
  assert.equal(january.drawdownPeakDate, '2023-12-31');
  assert.equal(january.drawdownTroughDate, '2024-01-01');
  assert.equal(january.drawdownSeededWithPriorClose, true);
  assert.equal(january.open, 80);
  assert.equal(january.high, 90);
  assert.equal(january.low, 80);
  assert.equal(january.close, 90);
  assert.match(january.ohlcDefinition, /not intraday/);
  assert.equal(january.complete, false);
  const quarter = aggregateCloseBars([
    ['2024-03-31', 100], ['2024-04-01', 90], ['2024-04-02', 70], ['2024-04-03', 105],
  ], { frequency: 'quarterly' })[1];
  close(quarter.maxDrawdownPct, -30);
  close(quarter.returnPct, 5);
  assert.equal(quarter.newHighDays, 1);
});

test('UTC calendar bins honor leap days and exclude partial weekly runtime samples', () => {
  const input = rows([100, 101, 102, 103, 104, 105, 106, 107, 108], '2024-02-26');
  const bars = aggregateCloseBars(input, { frequency: 'weekly' });
  assert.equal(bars.length, 2);
  assert.equal(bars[0].startDate, '2024-02-26');
  assert.equal(bars[0].endDate, '2024-03-03');
  assert.equal(bars[0].observations, 7);
  assert.equal(bars[0].complete, true);
  assert.equal(bars[1].rightCensored, true);
  assert.equal(bars[1].observations, 2);
  assert.equal(computeRollingStates(input, { frequency: 'weekly' }).points.length, 1);
  assert.equal(computeRollingStates(input, { frequency: 'weekly' }).current.date, '2024-03-03');
  const february = aggregateCloseBars(rows(Array(29).fill(100), '2024-02-01'), { frequency: 'monthly' })[0];
  assert.equal(february.expectedDays, 29);
  assert.equal(february.complete, true);
  assert.equal(february.realizedVolPct, 0);
  const gap = aggregateCloseBars([['2024-02-01', 100], ['2024-02-03', 90]], { frequency: 'monthly' })[0];
  assert.equal(gap.missingDays, 1);
  assert.equal(gap.continuous, false);
  assert.equal(gap.realizedVolPct, null);
});

test('A missing period cannot turn a multi-period change into a monthly return or drawdown', () => {
  const input = [['2024-01-31', 200], ...rows(Array(31).fill(100), '2024-03-01')];
  const march = aggregateCloseBars(input, { frequency: 'monthly' }).at(-1);
  assert.equal(march.complete, true);
  assert.equal(march.priorCloseDate, '2024-01-31');
  assert.equal(march.priorCloseContiguous, false);
  assert.equal(march.returnPct, null);
  assert.equal(march.maxDrawdownPct, 0);
  assert.equal(march.drawdownSeededWithPriorClose, false);
  const comparison = analyzeMarketStructure(input, { includeFibonacciSensitivity: false }).periodComparisons;
  assert.equal(comparison.calendarBlocks[0].monthly.completedPeriods, 0);
});

test('directional changes separate event date from first knowable confirmation', () => {
  const input = rows([100, 110, 125, 124, 111, 105, 118, 120, 100, 90, 100, 103]);
  const result = detectDirectionalChanges(input, { threshold: 0.10 });
  assert.deepEqual(result.pivots.map((p) => [p.type, p.eventDate, p.confirmationDate]), [
    ['low', '2020-01-01', '2020-01-02'],
    ['high', '2020-01-03', '2020-01-05'],
    ['low', '2020-01-06', '2020-01-07'],
    ['high', '2020-01-08', '2020-01-09'],
    ['low', '2020-01-10', '2020-01-11'],
  ]);
  assert.equal(result.pivots[0].leftCensored, true);
  assert.equal(result.pivots[1].lagDays, 2);
  assert.equal(result.pivots[1].knownAt, '2020-01-05');
  assert.equal(result.pivots[1].earliestKnowableUtc, '2020-01-06T00:00:00.000Z');
  assert.equal(result.current.unconfirmedCandidate.confirmed, false);
  assert.equal(result.current.unconfirmedCandidate.eventDate, '2020-01-12');
  assert.equal(detectDirectionalChanges(input.slice(0, 4), { threshold: .10 }).pivots.some((p) => p.type === 'high'), false);
  for (const pivot of result.pivots) assert.ok(pivot.eventDate <= pivot.confirmationDate);
});

test('appending future prices cannot rewrite causal labels or confirmed pivots', () => {
  for (const frequency of ['daily', 'weekly']) {
    const fullStates = computeRollingStates(data, { frequency });
    const fullPivots = detectDirectionalChanges(data, { frequency });
    for (const cutoff of ['2011-06-09', '2013-04-10', '2020-03-15', '2021-05-01', '2026-08-01']) {
      const prefix = data.prices.filter(([date]) => date <= cutoff);
      const states = computeRollingStates(prefix, { frequency });
      const pivots = detectDirectionalChanges(prefix, { frequency });
      assert.deepEqual(states.points, fullStates.points.filter((p) => p.date <= cutoff));
      assert.deepEqual(pivots.pivots, fullPivots.pivots.filter((p) => p.confirmationDate <= cutoff));
      const mutatedFuture = data.prices.map(([date, price], i) => [date, date > cutoff ? (i % 2 ? 1 : 1e8) : price]);
      assert.deepEqual(computeRollingStates(mutatedFuture, { frequency, asOf: cutoff }).points, states.points);
      assert.deepEqual(detectDirectionalChanges(mutatedFuture, { frequency, asOf: cutoff }).pivots, pivots.pivots);
    }
  }
});

test('tuple and normalized object inputs agree, gaps force fresh state warmup', () => {
  const input = rows([100, 101, 102, 103, 102, 100, 99, 101, 104, 103]);
  const objects = input.map(([date, price]) => ({ date, price }));
  assert.deepEqual(computeRollingStates(input, { shortWindow: 2, longWindow: 4 }), computeRollingStates(objects, { shortWindow: 2, longWindow: 4 }));
  const gap = input.filter((_, i) => i !== 6);
  const gapResult = computeRollingStates(gap, { shortWindow: 2, longWindow: 4 });
  const state = gapResult.points.at(-1);
  assert.equal(state.state, 'warmup');
  assert.equal(gapResult.episodes.find((e) => e.endDate === '2020-01-06').rightCensored, true);
  assert.equal(gapResult.episodes.find((e) => e.startDate === '2020-01-08').leftCensored, true);
  assert.throws(() => computeRollingStates(input, { threshold: 0 }), /threshold/);
  assert.throws(() => detectDirectionalChanges(input, { threshold: 1 }), /threshold/);
  assert.throws(() => aggregateCloseBars(input, { frequency: 'intraday' }), /frequency/);
  assert.throws(() => computeRollingStates([['2024-02-30', 1]]), /calendar/);
});

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

test('centered logarithms recover finite means and volatility when a price ratio overflows or underflows', () => {
  const current = computeRollingStates(rows([1e-300, 1e300, 1e-300, 1e300]), { shortWindow: 2, longWindow: 3 }).current;
  assert.ok(Number.isFinite(current.shortMA) && current.shortMA > 0);
  assert.ok(Number.isFinite(current.longMA) && current.longMA > 0);
  close(current.longMA, 1, 1e-12);
  assert.ok(Number.isFinite(current.realizedVolPct) && current.realizedVolPct > 0);
});

test('subnormal anchor ratios do not quantize the mean of later quiet prices', () => {
  for (const anchor of [Number.MAX_VALUE, 1e308]) {
    const result = computeRollingStates(rows([anchor, ...Array(10).fill(1e-15)]), { shortWindow: 2, longWindow: 3 }).current;
    for (const key of ['shortMA', 'longMA']) assert.ok(Math.abs(result[key] / 1e-15 - 1) < 1e-12, `${key}: ${result[key]}`);
    assert.equal(result.realizedVolPct, 0);
  }
});

test('finite positive window means stay representable at the floating-point price boundaries', () => {
  for (const anchor of [1e-100, 1e100]) for (const price of [Number.MAX_VALUE, Number.MIN_VALUE]) {
    const result = computeRollingStates(rows([anchor, ...Array(10).fill(price)]), { shortWindow: 2, longWindow: 3 }).current;
    for (const key of ['shortMA', 'longMA']) {
      assert.ok(Number.isFinite(result[key]) && result[key] > 0, `${key}: ${result[key]}`);
      assert.ok(Math.abs(result[key] / price - 1) < 1e-12, `${key} must preserve a constant window at ${price}`);
    }
  }
});

test('retrospective macro windows preserve early history and censor the latest trough', () => {
  const cycles = getMacroCycles(data).cycles;
  assert.deepEqual(cycles.map((c) => [c.peakYear, c.bullDays, c.bearDays]), [
    [2011, 325, 163], [2013, 747, 406], [2017, 1067, 364], [2021, 1059, 366], [2025, 1062, 267],
  ]);
  assert.equal(cycles[0].leftCensored, true);
  assert.equal(cycles[0].complete, false);
  assert.equal(cycles.at(-1).rightCensored, true);
  assert.equal(cycles.at(-1).endIsCandidate, true);
  assert.equal(cycles.at(-1).recoverySinceCandidateDays, 112);
  assert.equal(cycles.at(-1).start.date, '2022-11-09');
  assert.equal(cycles.at(-1).end.date, '2026-06-30');
  assert.ok(cycles.every((c) => c.boundariesRetrospective));
  for (const cycle of cycles) {
    close(cycle.troughAtNominalMonth, 48 * cycle.cycleDays / cycle.nominal48MonthDays);
    assert.equal(cycle.bullDays + cycle.bearDays, cycle.cycleDays);
  }
});

test('Theil–Sen uses cycles and exposes leave-one-cycle sign instability', () => {
  const trend = theilSenTrend([{ id: '2017', value: 1067 }, { id: '2021', value: 1059 }, { id: '2025', value: 1062 }]);
  assert.equal(trend.nCycles, 3);
  assert.equal(trend.slopeDaysPerCycle, -2.5);
  assert.equal(trend.leaveOneOutMin, -8);
  assert.equal(trend.leaveOneOutMax, 3);
  assert.equal(trend.leaveOneOutDirectionStable, false);
  assert.equal(trend.inferentialPValue, null);
  assert.equal(trend.confidenceInterval, null);
  assert.equal(theilSenTrend([{ id: 'one', value: 100 }]).slopeDaysPerCycle, null);
  assert.throws(() => theilSenTrend([{ value: 100, x: 0 }, { value: 90, x: 0 }]), /distinct/);
});

test('linear and log retracements use the last confirmed swing only', () => {
  close(fibonacciLevels(100, 200).find((p) => p.ratio === .5).price, 150);
  close(fibonacciLevels(100, 200, { scale: 'log' }).find((p) => p.ratio === .5).price, Math.sqrt(20000));
  close(fibonacciLevels(200, 100).find((p) => p.ratio === .5).price, 150);
  const input = rows([120, 100, 112, 150, 200, 178, 160, 149, 158]);
  const pivots = detectDirectionalChanges(input, { threshold: .10 }).pivots;
  const before = confirmedSwingRetracement(pivots, '2020-01-05', 200);
  assert.equal(before.end.date, '2020-01-02');
  const after = confirmedSwingRetracement(pivots, '2020-01-06', 178);
  assert.equal(after.end.date, '2020-01-05');
  assert.equal(after.knownAt, '2020-01-06');
  assert.equal(after.linear.find((p) => p.ratio === .5).price, 150);
  assert.throws(() => fibonacciLevels(0, 100), /positive/);
  assert.throws(() => fibonacciLevels(100, 100), /distinct/);
});

test('Fibonacci evaluation excludes preconfirmation crossings and incomplete follow-up wins', () => {
  const prices = [120, 100, 112, 150, 200, 178, 160, 149, 158, ...Array(61).fill(160)];
  const input = rows(prices);
  const target = (analysis) => analysis.trials.find((t) => t.group === 'fibonacci' && t.ratio === .5 && t.anchorEndDate === '2020-01-05');
  const full = evaluateFibonacci(input, { threshold: .10, includeTrials: true });
  assert.equal(target(full).touchDate, '2020-01-08');
  assert.equal(target(full).status, 'rejected');
  assert.equal(target(full).outcomeDate, '2020-01-09');
  const truncated = evaluateFibonacci(input.slice(0, 10), { threshold: .10, includeTrials: true });
  assert.equal(target(truncated).status, 'followup-censored');
  assert.equal(target(truncated).outcomeDate, null);
  const slowConfirmation = evaluateFibonacci(input, { threshold: .20, includeTrials: true });
  const crossed = slowConfirmation.trials.find((t) => t.group === 'fibonacci' && t.ratio === .236 && t.anchorEndDate === '2020-01-05');
  assert.equal(crossed.status, 'crossed-before-confirmation');
  assert.equal(full.parameters.fullFollowupRequiredEvenIfBarrierHitEarly, true);
  assert.equal(full.inference.pValue, null);
  assert.equal(full.inference.controlsArePlacebosNotAStatisticalNullDistribution, true);
  for (const group of [full.fibonacci, full.control]) {
    assert.equal(group.completedTouches, group.rejected + group.failed + group.unresolved);
    assert.equal(Object.values(group.counts).reduce((a, b) => a + b, 0), group.totalLevels);
  }
});

test('combined analysis reconciles durations, schema, partial periods and sensitivity', () => {
  const result = analyzeMarketStructure(data, { includeFibonacciSensitivity: false });
  assert.equal(result.coverage.observations, 5939);
  assert.equal(result.coverage.missingDayCount, 0);
  assert.equal(result.monthly.length, 196);
  assert.equal(result.quarterly.length, 66);
  assert.equal(result.currentState.date, '2026-10-20');
  assert.equal(result.currentWeeklyState.date, '2026-10-18');
  assert.equal(result.monthly.at(-1).complete, false);
  assert.equal(result.quarterly.at(-1).expectedDays, 92);
  assert.equal(result.monthly.at(-1).fibonacciAnchor.knownAt, '2026-07-21');
  assert.equal(result.calendarBlocks.length, 5);
  assert.ok(result.calendarBlocks.every((b) => b.isMarketCycleClaim === false));
  assert.equal(result.calendarBlocks[0].leftCensored, true);
  assert.equal(result.calendarBlocks.at(-1).rightCensored, true);
  assert.equal(result.periodComparisons.calendarBlocks.at(-1).monthly.completedPeriods, 9);
  assert.equal(result.periodComparisons.calendarBlocks.at(-1).quarterly.completedPeriods, 3);
  for (const cycle of result.macroCycles) {
    const count = (phase) => Object.values(phase.stateCounts).reduce((a, b) => a + b, 0);
    assert.equal(count(cycle.stateSummary.bull), cycle.bullDays);
    assert.equal(count(cycle.stateSummary.bear), cycle.bearDays);
    assert.equal(count(cycle.stateSummary.allObserved), cycle.observedWindowDays);
    if (cycle.stateSummary.recovery) assert.equal(count(cycle.stateSummary.recovery), cycle.recoverySinceCandidateDays);
  }
  assert.ok(result.dailyStates.every((p) => STATES.includes(p.state) && p.knownAt === p.date));
  assert.deepEqual(result.sensitivity.map((s) => s.confirmedPivotCount), [418, 248, 126, 153, 115, 71]);
  assert.equal(result.doublePeakExamples[1].firstHalfPeak.date, '2021-04-13');
  close(result.doublePeakExamples[1].interimDrawdownPct, -53.08320869786175);
  const latest = result.macroCycles.at(-1);
  close(latest.risk.bullMaxDrawdownPct, -28.049027604886778);
});

test('Fibonacci first-touch outcomes are censored when the search contains an unobserved day', () => {
  const input = rows([120, 100, 112, 150, 200, 178, 160, 149, 158, ...Array(61).fill(160)]);
  const target = analysis => analysis.trials.find(trial => trial.group === 'fibonacci'
    && trial.ratio === .5 && trial.anchorEndDate === '2020-01-05');
  const complete = evaluateFibonacci(input, { threshold: .10, includeTrials: true });
  assert.equal(target(complete).status, 'rejected');
  const missingBeforeTouch = input.filter(([date]) => date !== '2020-01-07');
  const censored = target(evaluateFibonacci(missingBeforeTouch, { threshold: .10, includeTrials: true }));
  assert.equal(censored.status, 'search-censored');
  assert.equal(censored.touchDate, null);
  assert.equal(censored.outcomeDate, null);
});

test('Fibonacci preconfirmation gaps cannot prove a level was untouched', () => {
  const input = rows([120, 100, 112, 150, 200, 195, 190, 178, 160, 149, 158, ...Array(61).fill(160)])
    .filter(([date]) => date !== '2020-01-06');
  const result = evaluateFibonacci(input, { threshold: .10, includeTrials: true });
  const target = result.trials.find(trial => trial.group === 'fibonacci'
    && trial.ratio === .5 && trial.anchorEndDate === '2020-01-05');
  assert.equal(target.status, 'search-censored');
  assert.equal(target.touchDate, null);
});
