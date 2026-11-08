import assert from 'node:assert/strict';
import test from 'node:test';
import {
  MODEL_FAMILIES,
  assertModelAvailable,
  horizonsFor,
  jumpDiffusionVariance,
  leveragedDecayLog,
  modelSpecFor,
  studentTVariance,
} from '../dist/forecast/forecast-models.js';

test('암호자산은 점프·Student-t 계열이고 반감기는 가정으로 분류한다', () => {
  for (const symbol of ['BTC', 'ETH']) {
    const spec = modelSpecFor(symbol);
    assert.equal(spec.family, MODEL_FAMILIES.cryptoJumpTail);
    assert.equal(spec.horizonUnit, 'calendar-day');
    assert.ok(spec.estimated.some((v) => v.includes('점프')));
    assert.ok(spec.assumed.some((v) => v.includes('반감기')), '반감기는 가정 칸에 있어야 한다');
  }
});

test('MSTR은 독립 주가 모형이 아니라 BTC 경로 × 프리미엄 구조 모형이다', () => {
  const spec = modelSpecFor('MSTR');
  assert.equal(spec.family, MODEL_FAMILIES.structuralNav);
  assert.ok(spec.assumed.some((v) => v.includes('프리미엄')));
  assert.ok(spec.note.includes('BTC 경로'));
});

test('레버리지 ETF는 배수를 사양에 담고 감쇄는 유도식으로 계산한다', () => {
  assert.equal(modelSpecFor('TQQQ').family, MODEL_FAMILIES.leveragedIndex);
  assert.equal(modelSpecFor('SOXL').family, MODEL_FAMILIES.leveragedIndex);
  const two = modelSpecFor('233740');
  assert.equal(two.family, MODEL_FAMILIES.leveragedIndex);
  assert.ok(two.assumed.some((v) => v.includes('2배')));

  const sigma = 0.02;
  const days = 250;
  const l3 = leveragedDecayLog(3, sigma, days);
  assert.ok(l3 < 0, '감쇄는 음수여야 한다');
  assert.ok(Math.abs(l3 - (-0.5 * 3 * 2 * sigma ** 2 * days)) < 1e-12);
  assert.ok(leveragedDecayLog(1, sigma, days) === 0, '1배는 감쇄가 없다');
  assert.ok(leveragedDecayLog(3, sigma, days) < leveragedDecayLog(2, sigma, days));
});

test('지수는 부트스트랩 계열이며 사이클 성분을 쓰지 않는다', () => {
  for (const symbol of ['SPX', 'NASDAQ', 'KOSPI', 'KOSDAQ', 'KODEX-KOSDAQ150']) {
    const spec = modelSpecFor(symbol);
    assert.equal(spec.family, MODEL_FAMILIES.indexBootstrap);
    assert.ok(spec.assumed.some((v) => v.includes('사이클 성분 없음')));
  }
});

test('부동산은 월별 AR 계열이고 일봉 변환을 금지한다', () => {
  const spec = modelSpecFor('HOUSING-SEOUL');
  assert.equal(spec.family, MODEL_FAMILIES.monthlyAutoregressive);
  assert.equal(spec.horizonUnit, 'month');
  assert.ok(spec.assumed.some((v) => v.includes('일봉 변환 금지')));
  assert.deepEqual(horizonsFor('HOUSING-SEOUL'), [3, 6, 12]);
});

test('T3 자산은 등록돼 있어도 모델 생성이 거부된다', () => {
  assert.equal(modelSpecFor('BMNR').family, MODEL_FAMILIES.structuralNav);
  assert.match(modelSpecFor('BMNR').note, /T3/);
  assert.throws(() => assertModelAvailable('BMNR', 'T3'), /표본 부족/);
  assert.equal(assertModelAvailable('BTC', 'T1').family, MODEL_FAMILIES.cryptoJumpTail);
  assert.throws(() => assertModelAvailable('UNKNOWN-XYZ', 'T1'), /등록되지 않은 자산/);
});

test('꼬리 두께와 점프 분산 계산', () => {
  assert.ok(studentTVariance(4) > 1);
  assert.equal(studentTVariance(1e9) > 1 && studentTVariance(1e9) < 1.0001, true);
  assert.throws(() => studentTVariance(2), /nu must be > 2/);
  const total = jumpDiffusionVariance(0.02, 5, 0.05);
  assert.ok(total > 0.02 ** 2);
});

test('잘못된 입력은 거부한다', () => {
  assert.throws(() => leveragedDecayLog(0.5, 0.01, 10), /leverage/);
  assert.throws(() => leveragedDecayLog(3, -0.01, 10), /dailyVol/);
  assert.throws(() => jumpDiffusionVariance(-1, 1, 1), /non-negative/);
});
