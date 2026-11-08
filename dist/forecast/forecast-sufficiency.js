/**
 * 데이터 충분성 등급(T1/T2/T3)과 지평 단위 규칙.
 *
 * 목적: 표본이 부족한 종목에 장기 예측 경로를 그리지 않도록 코드에서 막는다.
 * 이 모듈은 데이터 판정만 하며, 가격을 계산하거나 화면을 그리지 않는다.
 */

export const SUFFICIENCY_LABELS = Object.freeze({
  T1: '충분',
  T2: '제한',
  T3: '부족',
});

/** 등급 경계. 이 값은 docs/EVALUATION_METRICS.md 와 함께 바뀌어야 한다. */
export const SUFFICIENCY_THRESHOLDS = Object.freeze({
  minYearsT1: 10,
  minObservationsT1: 2500,
  minEvalSamplesT1: 500,
  minYearsT2: 3,
  minEvalSamplesT2: 100,
});

/** 종목별 지평 단위. 암호자산은 달력일, 주식·ETF는 거래일, 부동산은 월. */
export const HORIZON_UNITS = Object.freeze({
  'calendar-day': Object.freeze({ label: '달력일', horizons: Object.freeze([30, 90, 180, 365]), window: 90 }),
  session: Object.freeze({ label: '거래일', horizons: Object.freeze([30, 90, 180, 365]), window: 90 }),
  month: Object.freeze({ label: '개월', horizons: Object.freeze([3, 6, 12]), window: 12 }),
});

export function horizonUnit(unit) {
  const found = HORIZON_UNITS[unit];
  if (!found) throw new Error(`unknown horizon unit: ${unit}`);
  return found;
}

/**
 * 표본 규모로 등급을 정한다.
 * @param {{observations:number, years:number, evalSamples:number}} input
 * @returns {{tier:'T1'|'T2'|'T3', label:string, reasons:string[]}}
 */
export function classifySufficiency({ observations, years, evalSamples }) {
  for (const [name, value] of Object.entries({ observations, years, evalSamples })) {
    if (!Number.isFinite(value) || value < 0) throw new TypeError(`${name} must be a non-negative finite number`);
  }
  const t = SUFFICIENCY_THRESHOLDS;
  const reasons = [];
  if (years < t.minYearsT2) reasons.push(`기간 ${years.toFixed(1)}년 < ${t.minYearsT2}년`);
  if (evalSamples < t.minEvalSamplesT2) reasons.push(`평가표본 ${evalSamples}개 < ${t.minEvalSamplesT2}개`);
  if (reasons.length) return { tier: 'T3', label: SUFFICIENCY_LABELS.T3, reasons };

  if (years < t.minYearsT1) reasons.push(`기간 ${years.toFixed(1)}년 < ${t.minYearsT1}년`);
  if (observations < t.minObservationsT1) reasons.push(`관측 ${observations}개 < ${t.minObservationsT1}개`);
  if (evalSamples < t.minEvalSamplesT1) reasons.push(`평가표본 ${evalSamples}개 < ${t.minEvalSamplesT1}개`);
  if (reasons.length) return { tier: 'T2', label: SUFFICIENCY_LABELS.T2, reasons };

  return { tier: 'T1', label: SUFFICIENCY_LABELS.T1, reasons: ['기준 충족'] };
}

/**
 * 예측 경로 생성 허용 여부. T3는 경로를 만들지 않는다.
 * 호출부는 이 함수가 던진 오류를 화면의 "표본 부족" 안내로 바꾼다.
 */
export function assertForecastAllowed(tier, context = '') {
  if (tier === 'T1' || tier === 'T2') return true;
  const where = context ? ` (${context})` : '';
  throw new Error(`표본 부족으로 미래 경로를 제공하지 않습니다${where}: tier=${tier}`);
}

/** T2는 짧은 지평만 허용한다. */
export function allowedHorizons(tier, unit) {
  const { horizons } = horizonUnit(unit);
  if (tier === 'T2') return horizons.filter((h) => h <= 90);
  return [...horizons];
}
