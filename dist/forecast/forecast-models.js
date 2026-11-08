/**
 * 자산군별 미래 경로 모델 정의.
 *
 * 원칙
 *  - 자산마다 모델 계열이 다르다. 하나의 GBM을 전 자산에 쓰지 않는다.
 *  - 어떤 파라미터가 데이터에서 추정되는지, 어떤 것이 사람이 정한 가정인지 명시한다.
 *  - 표본이 부족한 자산(T3)은 모델 생성을 거부한다.
 *  - 이 모듈은 가격을 예측하지 않는다. 모델의 구조·파라미터 출처·게이트만 정의한다.
 */
import { assertForecastAllowed, horizonUnit } from './forecast-sufficiency.js';

export const MODEL_FAMILIES = Object.freeze({
  /** 점프 성분 + Student-t 분포, 레짐 전환 변동성. 24/7 거래 자산. */
  cryptoJumpTail: 'crypto-jump-tail',
  /** 기초자산(BTC) 경로 × mNAV 프리미엄(평균회귀) 구조 모형. */
  structuralNav: 'structural-nav',
  /** 기초지수 모형 + 레버리지 감쇄 유도식. */
  leveragedIndex: 'leveraged-index',
  /** 블록 부트스트랩 또는 GARCH(1,1)-t. 사이클 성분 없음. */
  indexBootstrap: 'index-bootstrap',
  /** 월별 AR(1)+계절성, 공표 지연 반영. */
  monthlyAutoregressive: 'monthly-ar',
  /** 모델 없음(T3). */
  none: 'none',
});

const CRYPTO = ['BTC', 'ETH'];
const LEVERAGED = { TQQQ: 3, SOXL: 3, '233740': 2 };
const INDICES = ['SPX', 'NASDAQ', 'KOSPI', 'KOSDAQ', 'KODEX-KOSDAQ150'];
const HOUSING_PREFIX = 'HOUSING-';

/**
 * 자산별 모델 사양.
 * @returns {{symbol:string, family:string, horizonUnit:string, estimated:string[], assumed:string[], note:string}}
 */
export function modelSpecFor(symbol) {
  const id = String(symbol || '').toUpperCase();

  if (CRYPTO.includes(id)) {
    return {
      symbol: id,
      family: MODEL_FAMILIES.cryptoJumpTail,
      horizonUnit: 'calendar-day',
      estimated: ['변동성(레짐별)', '점프 강도', '점프 크기', 'Student-t 자유도'],
      assumed: ['반감기 사이클 효과(n=3)', '거래일 연속성(24/7)'],
      note: '반감기 효과는 관측 사이클이 3개뿐이라 추정 계수가 아니라 가정으로 표시한다.'
    };
  }

  if (id === 'MSTR' || id === 'BMNR') {
    return {
      symbol: id,
      family: MODEL_FAMILIES.structuralNav,
      horizonUnit: 'session',
      estimated: id === 'MSTR'
        ? ['mNAV 프리미엄 평균회귀 속도', 'BTC 베타', '변동성']
        : ['mNAV 프리미엄 평균회귀 속도', 'ETH 베타', '변동성'],
      assumed: ['프리미엄 장기 평균', '희석·자금조달 계획', '비용 구조'],
      note: id === 'MSTR'
        ? '독립 주가 모형을 쓰지 않는다. BTC 경로를 입력으로 받아 재무 구조를 적용한다.'
        : 'ETH 경로를 입력으로 받는 구조 모형이지만 관측이 1.4년뿐이라 T3로 경로 생성을 거부한다.'
    };
  }

  if (id in LEVERAGED) {
    return {
      symbol: id,
      family: MODEL_FAMILIES.leveragedIndex,
      horizonUnit: 'session',
      estimated: ['기초지수 변동성'],
      assumed: ['일별 리밸런싱', '무비용 차입 가정', `레버리지 배수 ${LEVERAGED[id]}배`],
      note: '감쇄는 자유 파라미터가 아니라 -½·L(L−1)·σ²·t 유도식으로 계산한다.'
    };
  }

  if (INDICES.includes(id)) {
    return {
      symbol: id,
      family: MODEL_FAMILIES.indexBootstrap,
      horizonUnit: 'session',
      estimated: ['변동성', '드리프트(구간 추정)'],
      assumed: ['과거 블록 재사용', '사이클 성분 없음'],
      note: '경기·금리 사이클을 모형 성분으로 넣지 않는다.'
    };
  }

  if (id.startsWith(HOUSING_PREFIX)) {
    return {
      symbol: id,
      family: MODEL_FAMILIES.monthlyAutoregressive,
      horizonUnit: 'month',
      estimated: ['AR(1) 계수', '계절성', '잔차 분산'],
      assumed: ['가격 공표월과 거래량 공표월의 분리', '일봉 변환 금지'],
      note: '지평은 3·6·12개월이며 일별 OHLC로 변환하지 않는다.'
    };
  }

  return {
    symbol: id,
    family: MODEL_FAMILIES.none,
    horizonUnit: 'session',
    estimated: [],
    assumed: [],
    note: '등록되지 않은 자산이다. 모델을 만들지 않는다.'
  };
}

/**
 * 레버리지 ETF의 일별 리밸런싱 감쇄(로그 기준).
 * @param {number} leverage 배수(2 또는 3)
 * @param {number} dailyVol 일별 변동성(표준편차)
 * @param {number} days 보유 일수
 */
export function leveragedDecayLog(leverage, dailyVol, days) {
  if (!(leverage >= 1)) throw new RangeError('leverage must be >= 1');
  if (!(dailyVol >= 0)) throw new RangeError('dailyVol must be >= 0');
  if (!(days >= 0)) throw new RangeError('days must be >= 0');
  return -0.5 * leverage * (leverage - 1) * dailyVol * dailyVol * days;
}

/** Student-t 분산(자유도 nu > 2). 정규분포 대비 꼬리 두께를 반영한다. */
export function studentTVariance(nu) {
  if (!(nu > 2)) throw new RangeError('nu must be > 2');
  return nu / (nu - 2);
}

/** 점프 성분을 포함한 총 분산(단위시간). */
export function jumpDiffusionVariance(diffusionVol, jumpIntensity, jumpVol) {
  if (!(diffusionVol >= 0) || !(jumpIntensity >= 0) || !(jumpVol >= 0)) throw new RangeError('non-negative inputs required');
  return diffusionVol * diffusionVol + jumpIntensity * jumpVol * jumpVol;
}

/**
 * 이 자산의 미래 경로 모델을 만들 수 있는지 확인한다.
 * T3(표본 부족)이면 오류를 던진다.
 */
export function assertModelAvailable(symbol, tier) {
  const spec = modelSpecFor(symbol);
  if (spec.family === MODEL_FAMILIES.none) throw new Error(`등록되지 않은 자산이다: ${spec.symbol}`);
  assertForecastAllowed(tier, spec.symbol);
  return spec;
}

/** 지평 단위와 허용 지평을 자산 사양에서 바로 얻는다. */
export function horizonsFor(symbol) {
  return horizonUnit(modelSpecFor(symbol).horizonUnit).horizons;
}
