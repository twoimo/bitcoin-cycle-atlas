import assert from 'node:assert/strict';
import test from 'node:test';
import {
  CALIBRATION_DEFAULTS,
  applyCalibration,
  estimateFactors,
  scoreHoldout,
  splitResiduals,
  summarizeResiduals,
  withinTolerance,
} from '../dist/forecast/forecast-calibration.js';

const synthetic = (n, drift, scale, seed = 1) => {
  let x = seed;
  const rnd = () => { x = (x * 16807) % 2147483647; return x / 2147483647; };
  return Array.from({ length: n }, () => drift + scale * (rnd() * 2 - 1) * 1.732);
};

test('잔차 요약이 편향과 폭을 계산한다', () => {
  const z = synthetic(2000, 0.5, 1.5);
  const s = summarizeResiduals(z);
  assert.ok(Math.abs(s.zMean - 0.5) < 0.1, `zMean=${s.zMean}`);
  assert.ok(s.widthScale80 > 1.2, `k80=${s.widthScale80}`);
  assert.equal(s.n, 2000);
});

test('표본이 부족하면 보정하지 않는다', () => {
  const f = estimateFactors(synthetic(50, 0.5, 1.2));
  assert.equal(f.calibrated, false);
  assert.match(f.reason, /적합 표본 50개/);
});

test('보정은 중앙값을 이동하고 구간을 넓힌다', () => {
  const factors = estimateFactors(synthetic(2000, 0.6, 1.6));
  const raw = applyCalibration({ sigma: 0.04, horizon: 90, factors: null });
  const adj = applyCalibration({ sigma: 0.04, horizon: 90, factors });
  assert.equal(raw.calibrated, false);
  assert.ok(adj.medianLog > 0, '양의 드리프트는 중앙값을 위로 옮긴다');
  assert.ok((adj.upper - adj.lower) > (raw.upper - raw.lower), '구간 폭이 넓어져야 한다');
});

test('분할 검증에서 보정 후 커버리지가 명목에 가까워진다', () => {
  const z = synthetic(4000, 0.7, 1.7, 7);
  const { fit, holdout } = splitResiduals(z);
  const factors = estimateFactors(fit);
  assert.equal(factors.calibrated, true);
  const score = scoreHoldout(holdout.map((v) => ({ z: v })), factors);
  assert.ok(score.coverage80After > score.coverage80Before, `${score.coverage80Before} → ${score.coverage80After}`);
});

test('허용 오차 판정 경계', () => {
  assert.equal(withinTolerance(80), true);
  assert.equal(withinTolerance(75), true);
  assert.equal(withinTolerance(74.9), false);
  assert.equal(CALIBRATION_DEFAULTS.coverageTolerancePctPoints, 5);
});

test('빈 잔차는 거부한다', () => {
  assert.throws(() => summarizeResiduals([]), /empty/);
});
