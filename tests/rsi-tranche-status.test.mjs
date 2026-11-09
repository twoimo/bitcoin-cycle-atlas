import test from 'node:test';
import assert from 'node:assert/strict';
import {simulateRsiTranches} from '../packages/domain/src/rsi-simulation.js';
import {rsiTrancheStatus} from '../dist/ui/rsi-tranche-status.js';

const points = values => values.map((close, index) => [new Date(Date.UTC(2025, 0, index + 1)).toISOString().slice(0, 10), close]);
const movement = [...Array.from({length:20}, (_, i) => 100 + i), ...Array.from({length:18}, (_, i) => 116 - i * 3), ...Array.from({length:20}, (_, i) => 68 + i * 4)];
const prices = points(movement);
const base = {start:prices[0][0], end:prices.at(-1)[0], confirmedThrough:prices.at(-1)[0], capital:1000, feeBps:5, weights:[.5, .5]};
const resultAt = (end, extra = {}) => simulateRsiTranches(prices, {...base, end, confirmedThrough:end, ...extra});
const statuses = rows => rows.map(row => row.status);
const freeze = value => {if(value && typeof value === 'object'){Object.values(value).forEach(freeze);Object.freeze(value);}return value;};

test('first and second buy signals retain pending ownership and distinct signal and execution dates', () => {
  const first = rsiTrancheStatus(resultAt('2025-01-27'));
  assert.deepEqual(Object.keys(first).sort(), ['buy', 'recent', 'sell']);
  assert.deepEqual(statuses(first.buy), ['pending', 'blocked']);
  assert.deepEqual(statuses(first.sell), ['blocked', 'blocked']);
  assert.equal(first.buy[0].level, 33.5);assert.equal(first.buy[1].level, 29.5);
  assert.equal(first.buy[0].active, true);assert.equal(first.buy[0].eligible, true);
  assert.equal(first.buy[0].signalDate, '2025-01-27');assert.equal(first.buy[0].executionDate, null);
  assert.deepEqual(first.recent.map(row => [row.status, row.signalDate, row.executionDate, row.price]), [['pending', '2025-01-27', null, null]]);
  const second = rsiTrancheStatus(resultAt('2025-01-28'));
  assert.deepEqual(statuses(second.buy), ['holding', 'pending']);
  assert.equal(second.buy[0].signalDate, '2025-01-27');assert.equal(second.buy[0].executionDate, '2025-01-28');
  assert.equal(second.buy[0].active, false);assert.equal(second.buy[1].active, true);
  assert.deepEqual(second.sell.map(row => [row.status, row.eligible, row.active]), [['waiting', true, false], ['blocked', false, false]]);
});

test('both and remaining states expose only the eligible sell stage and current-cycle completion', () => {
  const both = rsiTrancheStatus(resultAt('2025-01-29'));
  assert.deepEqual(statuses(both.buy), ['holding', 'holding']);
  assert.deepEqual(both.sell.map(row => [row.level, row.status, row.eligible]), [[40, 'waiting', true], [43, 'blocked', false]]);
  assert(both.buy.concat(both.sell).every(row => !row.active));
  const firstSell = rsiTrancheStatus(resultAt('2025-02-11'));
  assert.equal(firstSell.sell[0].status, 'pending');assert.equal(firstSell.sell[0].active, true);
  assert.equal(firstSell.sell[0].signalDate, '2025-02-11');assert.equal(firstSell.sell[0].executionDate, null);
  const result = resultAt('2025-02-12'), remaining = rsiTrancheStatus(result);
  assert.equal(result.state, 'remaining');
  assert.deepEqual(statuses(remaining.buy), ['closed', 'holding']);
  assert.deepEqual(statuses(remaining.sell), ['closed', 'pending']);
  assert.equal(remaining.buy[0].label, '청산 완료');assert.equal(remaining.sell[0].label, '완료');
  assert.equal(remaining.sell[0].signalDate, '2025-02-11');assert.equal(remaining.sell[0].executionDate, '2025-02-12');
  assert.equal(remaining.sell[1].signalDate, '2025-02-12');assert.equal(remaining.sell[1].active, true);
  assert.equal(remaining.recent.length, result.trades.length + result.pending.length);
});

test('low RSI alone cannot manufacture a new entry in either flat or remaining state', () => {
  const flat = resultAt('2025-01-29', {start:'2025-01-28'}), status = rsiTrancheStatus(flat);
  assert.equal(flat.status, 'ready');assert.equal(flat.state, 'flat');assert(flat.currentRsi < 29.5);assert.deepEqual(flat.pending, []);
  assert.equal(status.buy[0].status, 'waiting');assert.equal(status.buy[0].eligible, true);assert.equal(status.buy[0].active, false);
  assert.equal(status.buy[1].status, 'blocked');
  const recovery = points([...movement.slice(0, 38), 68, 72, 76, 80, 80.5, 50, 51, 100, 101]);
  const result = simulateRsiTranches(recovery, {...base, end:'2025-02-14', confirmedThrough:'2025-02-14'}), remaining = rsiTrancheStatus(result);
  assert.equal(result.state, 'remaining');assert(result.currentRsi < 29.5);assert.deepEqual(result.pending, []);
  assert.deepEqual(statuses(remaining.buy), ['closed', 'holding']);assert(remaining.buy.every(row => !row.active && !row.eligible));
  assert.deepEqual(remaining.sell.map(row => [row.status, row.eligible]), [['closed', false], ['waiting', true]]);
});

test('insufficient and error results disable all stages even when the ledger contains a pending signal', () => {
  const short = resultAt('2025-01-27', {start:'2025-01-27'});
  assert.equal(short.status, 'insufficient');assert.equal(short.pending.length, 1);assert(Number.isFinite(short.currentRsi));
  for (const status of [rsiTrancheStatus(null), rsiTrancheStatus(short), rsiTrancheStatus(resultAt('2025-01-27'), {error:'설정 오류'})]) {
    assert(status.buy.concat(status.sell).every(row => row.status === 'unavailable' && row.label === '—' && !row.active && !row.eligible));
  }
  assert.equal(rsiTrancheStatus(short).recent[0].status, 'pending');assert.equal(rsiTrancheStatus(short).recent[0].executionDate, null);
});

test('flat and new cycles never inherit an earlier cycle completion', () => {
  const completed = simulateRsiTranches(prices, base), flat = rsiTrancheStatus(completed);
  assert.equal(completed.state, 'flat');assert.equal(completed.closed.length, 2);
  assert.deepEqual(statuses(flat.buy), ['waiting', 'blocked']);assert.deepEqual(statuses(flat.sell), ['blocked', 'blocked']);
  const repeated = points([...movement, ...movement]);
  const all = simulateRsiTranches(repeated, {...base, end:repeated.at(-1)[0], confirmedThrough:repeated.at(-1)[0]});
  const date = all.trades.find(row => row.cycle === 2 && row.side === 'Buy' && row.tranche === 1).date;
  const result = simulateRsiTranches(repeated, {...base, end:date, confirmedThrough:date}), next = rsiTrancheStatus(result);
  assert(result.closed.some(row => row.cycle === 1));assert(result.holdings.every(row => row.cycle === 2));
  assert.equal(next.buy[0].status, 'holding');assert.equal(next.sell[0].status, 'waiting');assert.equal(next.sell[0].executionDate, null);
});

test('recent signals are newest-first, bounded at five, and leave frozen source arrays intact', () => {
  const repeated = points([...movement, ...movement]);
  const result = simulateRsiTranches(repeated, {...base, end:repeated.at(-1)[0], confirmedThrough:repeated.at(-1)[0]});
  assert(result.trades.length > 5);
  const before = JSON.stringify(result), status = rsiTrancheStatus(freeze(result));
  assert.equal(JSON.stringify(result), before);assert.equal(status.recent.length, 5);
  assert.deepEqual(status.recent.map(row => row.signalDate), result.trades.slice(-5).reverse().map(row => row.signalDate));
  assert.equal(new Set(status.recent.map(row => row.id)).size, 5);
  for (const row of status.recent) {assert(row.signalDate < row.executionDate);assert(Number.isFinite(row.price));}
});
