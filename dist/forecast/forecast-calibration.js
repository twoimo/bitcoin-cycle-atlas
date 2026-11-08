/**
 * 캘리브레이션 계층: 워크포워드 잔차로 편향·폭을 추정하고 예측 구간에 적용한다.
 *
 * 원칙
 *  - 계수는 앞쪽 70%(적합 구간)에서만 추정하고, 뒤쪽 30%(검증 구간)에서 커버리지를 다시 잰다.
 *  - 표본이 부족하면 보정하지 않고 이유를 돌려준다(억지 보정 금지).
 *  - 이 모듈은 확률을 주장하지 않는다. 구간 폭과 중심을 조정할 뿐이다.
 */

export const CALIBRATION_DEFAULTS = Object.freeze({
  fitRatio: 0.7,
  minFitSamples: 200,
  minHoldoutSamples: 80,
  coverageTolerancePctPoints: 5,
  z80: 1.2815515655446004,
  z50: 0.6744897501960817,
});

const mean = (a) => a.reduce((x, y) => x + y, 0) / a.length;

export function summarizeResiduals(zValues) {
  if (!zValues.length) throw new Error('residuals are empty');
  const m = mean(zValues);
  const variance = mean(zValues.map((v) => (v - m) ** 2));
  const kurtosis = variance === 0 ? 0 : mean(zValues.map((v) => (v - m) ** 4)) / variance ** 2;
  const abs = [...zValues].map(Math.abs).sort((a, b) => a - b);
  const at = (p) => abs[Math.min(abs.length - 1, Math.floor(p * abs.length))];
  return {
    n: zValues.length,
    zMean: m,
    kurtosis,
    widthScale80: at(0.8) / CALIBRATION_DEFAULTS.z80,
    widthScale50: at(0.5) / CALIBRATION_DEFAULTS.z50,
  };
}

export function splitResiduals(zValues, ratio = CALIBRATION_DEFAULTS.fitRatio) {
  const cut = Math.floor(zValues.length * ratio);
  return { fit: zValues.slice(0, cut), holdout: zValues.slice(cut) };
}

/**
 * 적합 구간 잔차로 계수를 추정한다. 표본이 모자라면 calibrated:false.
 * @returns {{calibrated:boolean, reason?:string, n?:number, driftLogPerSqrtH?:number, widthScale80?:number, widthScale50?:number, kurtosis?:number}}
 */
export function estimateFactors(zFit, opts = {}) {
  const cfg = { ...CALIBRATION_DEFAULTS, ...opts };
  if (!Array.isArray(zFit) || zFit.length < cfg.minFitSamples) {
    return { calibrated: false, reason: `적합 표본 ${zFit ? zFit.length : 0}개 < ${cfg.minFitSamples}개` };
  }
  const s = summarizeResiduals(zFit);
  return {
    calibrated: true,
    n: s.n,
    driftLogPerSqrtH: s.zMean,
    widthScale80: +s.widthScale80.toFixed(3),
    widthScale50: +s.widthScale50.toFixed(3),
    kurtosis: +s.kurtosis.toFixed(2),
  };
}

/**
 * 보정된 구간을 만든다. 단위는 로그수익률.
 * @param {{sigma:number, horizon:number, factors:object}} input
 */
export function applyCalibration({ sigma, horizon, factors }) {
  const sqrtH = Math.sqrt(horizon);
  const base = sigma * sqrtH;
  if (!factors || !factors.calibrated) {
    return { calibrated: false, medianLog: 0, lower: -base * CALIBRATION_DEFAULTS.z80, upper: base * CALIBRATION_DEFAULTS.z80 };
  }
  const medianLog = factors.driftLogPerSqrtH * base;
  const width = base * factors.widthScale80;
  return {
    calibrated: true,
    medianLog,
    lower: medianLog - width * CALIBRATION_DEFAULTS.z80,
    upper: medianLog + width * CALIBRATION_DEFAULTS.z80,
  };
}

/** 검증 구간에서 커버리지와 폭 배율을 잰다. */
export function scoreHoldout(pairs, factors) {
  let in80 = 0;
  let in80Corrected = 0;
  const abs = [];
  for (const { z } of pairs) {
    if (Math.abs(z) <= CALIBRATION_DEFAULTS.z80) in80 += 1;
    abs.push(Math.abs(z));
    const corrected = factors && factors.calibrated
      ? Math.abs(z - factors.driftLogPerSqrtH) / factors.widthScale80
      : Math.abs(z);
    if (corrected <= CALIBRATION_DEFAULTS.z80) in80Corrected += 1;
  }
  const n = pairs.length;
  return {
    n,
    coverage80Before: +(100 * in80 / n).toFixed(1),
    coverage80After: +(100 * in80Corrected / n).toFixed(1),
  };
}

/** 커버리지가 명목 대비 허용 오차 안에 들었는지 판정한다. */
export function withinTolerance(coveragePct, nominal = 80, tolerance = CALIBRATION_DEFAULTS.coverageTolerancePctPoints) {
  return Math.abs(coveragePct - nominal) <= tolerance;
}
