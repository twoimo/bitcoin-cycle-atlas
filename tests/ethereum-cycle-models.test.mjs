import test from 'node:test';
import {shortCycleFixture} from './helpers/eth-cycle-short-fixture.mjs';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { utcDay, dateFromDay } from '../dist/cycle-engine.js';
import { buildDetailedForecast } from '../dist/detailed-forecast.js';
import { calibrateCycleTiming } from '../dist/cycle-calibration.js';
import { buildEthereumCycleCandidates, ETHEREUM_CYCLE_COMPARISON_POLICY } from '../dist/ethereum-cycle-models.js';

const close = (actual, expected, tolerance = 1e-10) => {
  assert.ok(Math.abs(actual - expected) <= tolerance * Math.max(1, Math.abs(expected)),
    String(actual) + ' differs from ' + String(expected));
};

// A deliberately non-four-year generator: 800-day peak intervals, 250-day
// declines and 70% drawdowns. These are independently known fixture parameters.
function fixture(endDay = 3700) {
  const anchors = [[0,50],[200,100],[450,30],[1000,180],[1250,54],
    [1800,270],[2050,81],[2600,350],[2850,105],[3400,420],[3650,126],[4200,480]];
  const first = utcDay('2015-01-01'), rows = [];
  let segment = 1;
  for (let day = 0; day <= endDay; day++) {
    while (anchors[segment][0] < day) segment++;
    const [leftDay,leftPrice] = anchors[segment - 1], [rightDay,rightPrice] = anchors[segment];
    const fraction = (day - leftDay) / (rightDay - leftDay);
    rows.push({ date: dateFromDay(first + day), epochDay: first + day,
      price: Math.exp((1 - fraction) * Math.log(leftPrice) + fraction * Math.log(rightPrice)) });
  }
  return rows;
}

const ethRows = fixture(), asOf = ethRows.at(-1).date;
const options = { ethRows, btcRows: [], asOf, horizons: [30,90,180] };

test('ETH refit estimates the shared anchor equation without imposing a 48-month period', () => {
  const result = buildEthereumCycleCandidates(options).ethRefit;
  assert.equal(result.status, 'available');
  assert.equal(result.training.completedPeakIntervals, 4);
  assert.equal(result.training.growthTransitionCount, 3);
  assert.equal(result.training.independentMarketCycles, null);
  assert.equal(result.assumptions.coefficients.periodDays, 800);
  assert.equal(result.assumptions.coefficients.bearDays, 250);
  assert.equal(result.assumptions.coefficients.riseDays, 550);
  close(result.assumptions.coefficients.bearDrawdownPct, 70);
  assert.notEqual(result.assumptions.coefficients.growthRetention, 0.75);
  assert.equal(result.assumptions.bitcoinHalvingApplied, false);
  assert.equal(result.assumptions.periodFixedAt48Months, false);
  assert.equal(result.calibrated, false);
  assert.equal(result.probability, null);
  assert.equal(result.productionEligible, false);
  assert.equal(result.anchors[0].date, asOf);
  assert.equal(result.anchors[0].price, ethRows.at(-1).price);
  assert.ok(result.predictions.every(point => Number.isFinite(point.price) && point.price > 0));
  for (const turn of result.training.confirmedTurns) {
    assert.ok(turn.date < turn.knownAt);
    assert.ok(turn.knownAt <= asOf);
  }
  assert.ok(result.training.growthTransitions.every(item => item.knownAt <= asOf));
});

test('future prices, including invalid future values, cannot rewrite a fixed-origin ETH comparison', () => {
  const before = JSON.stringify(ethRows), baseline = buildEthereumCycleCandidates(options);
  const day = utcDay(asOf);
  const changed = [...ethRows,
    { date: dateFromDay(day + 1), price: 1e100 },
    { date: dateFromDay(day + 2), price: 0 },
    { date: dateFromDay(day + 3), price: NaN }];
  assert.deepEqual(buildEthereumCycleCandidates({ ...options, ethRows: changed }), baseline);
  assert.equal(JSON.stringify(ethRows), before);
});

test('ETH refit is quote-scale invariant and does not silently clamp estimated growth retention', () => {
  const base = buildEthereumCycleCandidates(options).ethRefit;
  const scaled = buildEthereumCycleCandidates({ ...options,
    ethRows: ethRows.map(row => ({ ...row, price: row.price * 100 })) }).ethRefit;
  assert.equal(scaled.status, 'available');
  assert.equal(scaled.assumptions.coefficientEstimation.growthRetentionClamped, false);
  close(scaled.assumptions.coefficients.growthRetention, base.assumptions.coefficients.growthRetention);
  for (let index = 0; index < base.predictions.length; index++) {
    assert.equal(scaled.predictions[index].targetDate, base.predictions[index].targetDate);
    close(scaled.predictions[index].price, base.predictions[index].price * 100);
  }
});

test('an ETH peak is not usable before the fourteenth qualifying drawdown close', () => {
  const start = utcDay('2020-01-01');
  const prices = [50,100,...Array(14).fill(55)];
  const rows = prices.map((price,index) => ({date:dateFromDay(start + index),price}));
  const before = buildEthereumCycleCandidates({ ethRows: rows, btcRows: [],
    asOf: rows.at(-2).date, horizons:[30] }).ethRefit;
  const confirmed = buildEthereumCycleCandidates({ ethRows: rows, btcRows: [],
    asOf: rows.at(-1).date, horizons:[30] }).ethRefit;
  assert.equal(ETHEREUM_CYCLE_COMPARISON_POLICY.confirmationDays, 14);
  assert.equal(before.training.confirmedTurns.length, 0);
  assert.equal(confirmed.training.confirmedTurns.length, 1);
  assert.equal(confirmed.training.confirmedTurns[0].date, rows[1].date);
  assert.equal(confirmed.training.confirmedTurns[0].knownAt, rows.at(-1).date);
  assert.equal(confirmed.status, 'unavailable');
  assert.match(confirmed.reason, /Insufficient confirmed/);
});

test('missing days, an absent origin and timestamp conflicts remain explicit unavailable states', () => {
  const gap = buildEthereumCycleCandidates({ ...options, ethRows:ethRows.filter((row,index) => index !== 500) });
  assert.equal(gap.ethRefit.status, 'unavailable');
  assert.match(gap.ethRefit.reason, /missing days/);
  assert.deepEqual(gap.ethRefit.predictions, []);
  const missing = buildEthereumCycleCandidates({ ...options, asOf:dateFromDay(utcDay(asOf) + 1) });
  assert.match(missing.ethRefit.reason, /exact completed close/);
  const conflict = buildEthereumCycleCandidates({ ...options,
    ethRows:ethRows.map((row,index) => index === 400 ? {...row,epochDay:row.epochDay+1} : row) });
  assert.match(conflict.ethRefit.reason, /epochDay conflicts/);
});

test('an expired ETH clock does not manufacture another wave or optimize a new origin', () => {
  const extended = [...ethRows], first = ethRows[0].epochDay;
  for (let day = 3701; day <= 5000; day++) {
    extended.push({ date:dateFromDay(first + day), epochDay:first + day, price:ethRows.at(-1).price });
  }
  const result = buildEthereumCycleCandidates({ ...options, ethRows:extended,
    asOf:extended.at(-1).date }).ethRefit;
  assert.equal(result.status, 'unavailable');
  assert.match(result.reason, /expired.*no additional cycle/);
  assert.deepEqual(result.predictions, []);
});

test('BTC missing data does not suppress an independently available ETH refit', () => {
  const result = buildEthereumCycleCandidates(options);
  assert.equal(result.btcTransfer.status, 'unavailable');
  assert.match(result.btcTransfer.reason, /BTC requires/);
  assert.equal(result.ethRefit.status, 'available');
  assert.throws(() => buildEthereumCycleCandidates({...options,horizons:[30,30]}), /Unique/);
  assert.throws(() => buildEthereumCycleCandidates({...options,horizons:[0]}), /Unique/);
  assert.throws(() => buildEthereumCycleCandidates({...options,horizons:[1121]}), /Unique/);
});

test('BTC transfer is the actual dated BTC baseline normalized to ETH, independent of residual draws', async () => {
  const btc = JSON.parse(await readFile(new URL('../dist/data/btc-daily.json',import.meta.url),'utf8'));
  const origin = '2026-10-23', originDay = utcDay(origin);
  const btcRows = btc.prices.map(([date,price]) => ({date,price}));
  const horizons = [30,90,180], ethAnchor = 2000;
  const result = buildEthereumCycleCandidates({ btcRows,
    ethRows:[{date:origin,price:ethAnchor}],asOf:origin,horizons }).btcTransfer;
  assert.equal(result.status, 'available', result.reason);
  const clock = calibrateCycleTiming(btcRows,{asOf:origin});
  // A different draw count and seed must preserve the deterministic baseline.
  const actualBtc = buildDetailedForecast(btcRows,{asOf:origin,
    referenceDate:dateFromDay(originDay+1),displayEnd:dateFromDay(originDay+180),
    scenario:'base',timingCalibration:clock.current,sampleCount:32,seed:17});
  const btcAnchor = actualBtc.observables.current.price;
  for (const prediction of result.predictions) {
    const source = actualBtc.path.find(point => point.date === prediction.targetDate);
    close(prediction.price / ethAnchor, source.baselinePrice / btcAnchor);
    close(prediction.sourceBtcBaselinePrice, source.baselinePrice);
  }
  assert.equal(result.assumptions.residualAdded,false);
  assert.equal(result.assumptions.bitcoinAbsoluteUsdTargetTransferred,false);
  assert.equal(result.assumptions.btcPhaseAndRelativeAmplitudeTransferredAsHypothesis,true);
  assert.equal(result.probability,null);
  assert.equal(result.productionEligible,false);
});


test('ETH refit retains each valid short horizon when another requested horizon crosses the final anchor',()=>{
  const rows=shortCycleFixture(),origin=rows.at(-1).date;
  const run=horizons=>buildEthereumCycleCandidates({ethRows:rows,btcRows:[],asOf:origin,horizons}).ethRefit;
  const mixed=run([30,90,180]),reordered=run([180,90,30]);
  assert.equal(mixed.status,'available');assert.equal(reordered.status,'available');
  for(const h of [30,90]){
    const single=run([h]);assert.equal(single.status,'available');
    assert.deepEqual(mixed.predictions.find(p=>p.horizonDays===h),single.predictions[0]);
    assert.deepEqual(reordered.predictions.find(p=>p.horizonDays===h),single.predictions[0]);
  }
  const missing=mixed.predictions.find(p=>p.horizonDays===180);
  assert.equal(missing.status,'unavailable');assert.equal(missing.price,undefined);
  assert.match(missing.reason,/next estimated low/);
  assert.deepEqual(mixed.anchors,reordered.anchors);
  assert.equal(mixed.calibrated,false);assert.equal(mixed.productionEligible,false);
  assert.equal(run([180]).status,'unavailable');
});
test('the last ETH low anchor is inclusive and the next day cannot invent another wave',()=>{
  const rows=shortCycleFixture(),origin=rows.at(-1).date;
  const result=buildEthereumCycleCandidates({ethRows:rows,btcRows:[],asOf:origin,horizons:[150,151]}).ethRefit;
  assert.equal(result.status,'available');
  const low=result.anchors.at(-1),at=result.predictions[0],after=result.predictions[1];
  assert.equal(low.epochDay-utcDay(origin),150);
  assert.equal(at.targetDate,low.date);close(at.price,low.price);
  assert.equal(after.status,'unavailable');assert.equal(after.price,undefined);
  assert.equal(after.targetDate,dateFromDay(low.epochDay+1));
});
