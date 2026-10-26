import { utcDay } from './cycle-engine.js?v=1.29.0';
import { buildLongHorizonForecasts } from "./long-horizon-forecast.js?v=1.29.0";
import {readAssetDailyRows} from './asset-daily-observations.js';
import {buildEthereumAssetScenarioPaths} from './ethereum-forecast.js';
import { LONG_HORIZON_REVIEW_DATE } from './long-horizon-evidence.js?v=1.29.0';

const SCENARIOS = ['stress', 'base', 'bull'];
const BTC_SCENARIOS = { stress: 'stress', base: 'base', bull: 'accelerated' };
const CLOCK_WARNING = '코인 기준은 같은 날짜의 UTC 일말 관측이며 뉴욕 주식 종가와 동시 체결된 가격이 아닙니다. 주식 기준일 이후의 코인 관측은 사용하지 않습니다.';
const RANGE_WARNING = '세 조건은 서로 다른 경제·재무 가정입니다. 대표 경로와 조건 범위는 확률 예측·분위수·가능한 손실의 전체 범위가 아닙니다.';

export const TREASURY_ASSET_PATH_DEFAULTS = Object.freeze({
  seed: 20261022, endYear: 2035, blockDays: 28, volatilityWindowDays: 90,
  minimumEthObservations: 366, ethHistoryStart: '2022-09-15', residualHalfLifeDays: 730,
});

function bitcoinPaths(rows, asOf, endDate, seed) {
  const researchAsOf = asOf < LONG_HORIZON_REVIEW_DATE ? asOf : LONG_HORIZON_REVIEW_DATE;
  const source = { prices: rows.map(row => [row.date, row.price]) };
  const scenarios = {};
  const models = buildLongHorizonForecasts(source, { asOf, seed, scenarios: SCENARIOS.map(id => BTC_SCENARIOS[id]), researchAsOf });
  for (const id of SCENARIOS) {
    const model = models[BTC_SCENARIOS[id]];
    if (model.displayEnd < endDate) throw new RangeError('BTC source horizon does not cover the requested treasury horizon');
    const sourceIds = [...model.longHorizon.assumptions.valuationSourceIds.map(value => `long-${value}`), 'mstr-model-method'];
    const path = model.path.filter(point => point.date <= endDate).map(point => ({
      date: point.date, price: point.price, baselinePrice: point.baselinePrice,
      kind: point.date === asOf ? 'observed-anchor' : 'conditional-asset-path', sourceIds,
    }));
    scenarios[id] = {
      id, asset: 'BTC', asOf, endDate, path, sourceIds, method: 'btc-shared-long-horizon-engine',
      anchors: model.events.map(event => ({ date: event.date, price: event.price, sourceIds: [`long-${event.sourceId}`], origin: event.valuationOrigin })),
      training: { ...model.training, maxSourceDate: asOf, researchAsOf },
      metadata: {
        engine: model.version, engineScenario: model.scenario.id, seed, sampleCount: 1,
        shortTermSourceEnsembleCount: model.assumptions.shortTermSourceEnsembleCount,
        representativeRule: model.assumptions.representativeRule,
        sourceDisplayEnd: model.displayEnd, displayedPathIsExactEnginePrefix: true,
        repeatedFourYearWaves: false, cycleComponent: model.longHorizon.cycleDecay,
        targetPricesAreBaselineConditions: true, terminalPriceForced: false,
        managementTargetAppliedToPath: false, historicalVintageBacktest: false,
        probability: null, calibrated: false, ohlcClaim: false,
      },
      warnings: [...model.warnings, CLOCK_WARNING, 'MSTR 연동 경로는 BTC 화면의 같은 조건·seed 경로입니다. 세일러의 별도 목표 가격을 이 경로에 강제로 맞추지 않습니다.'],
    };
  }
  return scenarios;
}

export function buildTreasuryAssetPaths({ symbol, btcHistory, ethHistory, asOf, endYear = TREASURY_ASSET_PATH_DEFAULTS.endYear, seed = TREASURY_ASSET_PATH_DEFAULTS.seed } = {}) {
  if (!['MSTR', 'BMNR'].includes(symbol)) throw new RangeError('Treasury asset paths require MSTR or BMNR');
  utcDay(asOf);
  if (!Number.isSafeInteger(endYear) || endYear < 2027 || endYear > 2050) throw new RangeError('Treasury asset horizon must be 2027–2050');
  if (!Number.isSafeInteger(seed) || seed < 0 || seed > 4294967295) throw new RangeError('seed must be an unsigned 32-bit integer');
  const endDate = `${endYear}-12-31`;
  if (asOf >= endDate) throw new RangeError('Treasury asset horizon must follow its observation cutoff');
  const asset = symbol === 'MSTR' ? 'BTC' : 'ETH';
  const rows = readAssetDailyRows(asset === 'BTC' ? btcHistory : ethHistory, asset, asOf);
  const scenarios = asset === 'BTC' ? bitcoinPaths(rows, asOf, endDate, seed) : buildEthereumAssetScenarioPaths(rows, asOf, endDate, seed);
  return {
    asset, asOf, endDate, scenarios,
    metadata: { version: 'treasury-asset-paths-1', symbol, seed, maximumObservationDate: asOf, calendar: 'UTC daily simulation dates', scenarioCount: 3, sampleCountPerScenario: 1, probability: null, calibrated: false, ohlcClaim: false },
    warnings: [CLOCK_WARNING, RANGE_WARNING],
  };
}
