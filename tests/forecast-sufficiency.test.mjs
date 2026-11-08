import assert from 'node:assert/strict';
import test from 'node:test';
import {
  SUFFICIENCY_THRESHOLDS,
  allowedHorizons,
  assertForecastAllowed,
  classifySufficiency,
  horizonUnit,
} from '../dist/forecast-sufficiency.js';

test('충분한 이력은 T1로 분류한다', () => {
  const r = classifySufficiency({ observations: 5956, years: 16.3, evalSamples: 5686 });
  assert.equal(r.tier, 'T1');
});

test('10년 미만이거나 표본이 적으면 T2로 내린다', () => {
  assert.equal(classifySufficiency({ observations: 2633, years: 10.9, evalSamples: 2363 }).tier, 'T1');
  assert.equal(classifySufficiency({ observations: 2633, years: 8.4, evalSamples: 2363 }).tier, 'T2');
  assert.equal(classifySufficiency({ observations: 900, years: 12, evalSamples: 600 }).tier, 'T2');
});

test('BMNR 실측값은 T3이며 경로 생성을 거부한다', () => {
  const bmnr = classifySufficiency({ observations: 359, years: 1.4, evalSamples: 89 });
  assert.equal(bmnr.tier, 'T3');
  assert.match(bmnr.reasons.join(' '), /평가표본 89개/);
  assert.throws(() => assertForecastAllowed(bmnr.tier, 'BMNR'), /표본 부족/);
});

test('T1/T2는 경로 생성을 허용한다', () => {
  assert.equal(assertForecastAllowed('T1'), true);
  assert.equal(assertForecastAllowed('T2', 'KODEX'), true);
});

test('T2는 90일 이하 지평만 허용한다', () => {
  assert.deepEqual(allowedHorizons('T2', 'session'), [30, 90]);
  assert.deepEqual(allowedHorizons('T1', 'month'), [3, 6, 12]);
});

test('단위별 지평과 창을 고정한다', () => {
  assert.deepEqual(horizonUnit('calendar-day').horizons, [30, 90, 180, 365]);
  assert.equal(horizonUnit('month').window, 12);
  assert.throws(() => horizonUnit('year'), /unknown horizon unit/);
});

test('잘못된 입력은 거부한다', () => {
  assert.throws(() => classifySufficiency({ observations: -1, years: 5, evalSamples: 100 }), TypeError);
  assert.equal(SUFFICIENCY_THRESHOLDS.minEvalSamplesT2, 100);
});
