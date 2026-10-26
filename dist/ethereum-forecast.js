import {utcDay,dateFromDay} from './cycle-engine.js?v=1.29.0';
import {readAssetDailyRows} from './asset-daily-observations.js';

const SCENARIOS=['stress','base','bull'];
const LABELS={stress:'스트레스',base:'현재 가격 기준선',bull:'채택 확대'};
const ETH_SOURCE_IDS=['model-eth-valuation','bmnr-model-method','eth-merge-eip-3675'];
const ETH_TARGET_DATE='2030-12-31';
const ETH_SOURCE_DATE='2024-06-05';
export const ETHEREUM_FORECAST_DEFAULTS=Object.freeze({
  seed:20261022,endYear:2035,blockDays:28,volatilityWindowDays:90,
  minimumEthObservations:366,ethHistoryStart:'2022-09-15',residualHalfLifeDays:730,
});

function positive(value, label) {
  if (!Number.isFinite(value) || value <= 0) throw new RangeError(`${label} must be positive and finite`);
  return value;
}

function stats(values) {
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  return { mean, sd: Math.sqrt(values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / (values.length - 1)) };
}

function randomGenerator(seed) {
  let state = seed >>> 0;
  return () => {
    state += 0x6D2B79F5;
    let value = Math.imul(state ^ (state >>> 15), state | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

export function buildEthereumAssetScenarioPaths(allRows, asOf, endDate, seed) {
  if (asOf < ETH_SOURCE_DATE) throw new RangeError('ETH valuation conditions were not published at the observation cutoff');
  if (asOf >= ETH_TARGET_DATE) throw new RangeError('ETH valuation conditions have expired and require a new reviewed source');
  const settings = ETHEREUM_FORECAST_DEFAULTS;
  const rows = allRows.filter(row => row.date >= settings.ethHistoryStart);
  if (rows.length < settings.minimumEthObservations) throw new RangeError('ETH requires at least 366 post-Merge completed daily observations');
  for (let index = 1; index < rows.length; index++) {
    if (rows[index].epochDay !== rows[index - 1].epochDay + 1) throw new RangeError('ETH post-Merge history must be consecutive; missing dates are not interpolated');
  }
  const returns = rows.slice(1).map((row, index) => Math.log(row.price / rows[index].price));
  const sourceStats = stats(returns), recent = stats(returns.slice(-settings.volatilityWindowDays));
  if (!(sourceStats.sd > 1e-9 && recent.sd > 1e-9)) throw new RangeError('ETH history requires positive realized return variation');
  const current = rows.at(-1), horizonDays = utcDay(endDate) - current.epochDay;
  const targetDays = utcDay(ETH_TARGET_DATE) - current.epochDay;
  const targets = { stress: 360, base: current.price, bull: 22000 };
  const random = randomGenerator((seed ^ 0x455448) >>> 0);
  const persistence = Math.exp(-Math.LN2 / settings.residualHalfLifeDays);
  const blocks = [], residuals = [0];
  let residual = 0, blockStart = 0, blockOffset = settings.blockDays;
  for (let index = 1; index <= horizonDays; index++) {
    if (blockOffset === settings.blockDays) {
      blockStart = Math.floor(random() * (returns.length - settings.blockDays + 1));
      blockOffset = 0;
      const used = Math.min(settings.blockDays, horizonDays - index + 1);
      blocks.push({
        sourceStartDate: rows[blockStart].date, sourceReturnStartDate: rows[blockStart + 1].date,
        sourceEndDate: rows[blockStart + used].date, targetStartDate: dateFromDay(current.epochDay + index),
        targetEndDate: dateFromDay(current.epochDay + index + used - 1), days: used,
      });
    }
    const innovation = (returns[blockStart + blockOffset++] - sourceStats.mean) / sourceStats.sd;
    residual = persistence * residual + innovation * recent.sd;
    residuals.push(residual);
  }
  const training = {
    firstObservation: rows[0].date, informationThrough: asOf, maxSourceDate: asOf,
    observations: rows.length, excludedPreMergeObservations: allRows.length - rows.length,
    sourceReturnStartDate: rows[1].date, sourceReturnCount: returns.length,
    sourceDailyLogMean: sourceStats.mean, sourceDailyLogSd: sourceStats.sd,
    recentDailyLogSd: recent.sd, volatilityWindowDays: settings.volatilityWindowDays,
    representativeBlocks: blocks, sourceBlockEndpointsAtOrBeforeAsOf: true,
    overlappingBlocksAreIndependent: false, historicalForecastAccuracyClaim: false,
    researchAsOf: ETH_SOURCE_DATE,
  };
  return Object.fromEntries(SCENARIOS.map(id => {
    const priceTarget = targets[id];
    const path = residuals.map((residualLog, index) => {
      const fraction = Math.min(1, index / targetDays);
      const baselinePrice = index ? positive(Math.exp(Math.log(current.price) + fraction * Math.log(priceTarget / current.price)), 'ETH baseline price') : current.price;
      const price = index ? positive(baselinePrice * Math.exp(residualLog), 'ETH simulated price') : current.price;
      return { date: dateFromDay(current.epochDay + index), price, baselinePrice, kind: index ? 'conditional-asset-path' : 'observed-anchor', sourceIds: ETH_SOURCE_IDS };
    });
    return [id, {
      id, asset: 'ETH', asOf, endDate, path, sourceIds: ETH_SOURCE_IDS, method: 'eth-post-merge-historical-blocks',
      anchors: [{ date: ETH_TARGET_DATE, price: priceTarget, sourceIds: id === 'base' ? ['bmnr-model-method'] : ['model-eth-valuation'], origin: id === 'base' ? 'analyst-flat-price' : 'published-valuation-condition' }],
      training,
      metadata: {
        seed, sampleCount: 1, blockDays: settings.blockDays, repeatedFourYearWaves: false,
        representativeRule: 'One seeded post-Merge historical-block residual path shared by the three economic conditions.',
        historicalDriftExtrapolated: false, baselineAfter2030: 'flat',
        recentAnnualizedVolatilityPct: recent.sd * Math.sqrt(365) * 100,
        futureInnovationScale: 'Latest 90-day realized daily log-return standard deviation held constant; not an estimated future volatility forecast.',
        residualHalfLifeDays: settings.residualHalfLifeDays, residualMeanReversionEstimated: false,
        residualFormula: 'R[t] = exp(-ln(2)/730) * R[t-1] + standardized historical block return * latest 90-day daily sigma',
        targetPricesAreBaselineConditions: true, terminalPriceForced: false,
        historicalVintageBacktest: false, probability: null, calibrated: false, ohlcClaim: false,
      },
      warnings: [
        'ETH 경로는 Merge 이후 과거 수익률 블록으로 만든 조건부 예시입니다. BTC의 4년 주기를 적용하지 않습니다.',
        '2030년 $360·$22,000은 외부 평가 조건이며, 현재 가격 유지는 앱 가정입니다. 2030년 이후 기준선 유지도 앱 가정입니다.',
        '최근 90일 변동성의 미래 유지와 잔차의 730일 반감 평균회귀는 검증된 예측 계수가 아닙니다.',
        '과거 블록의 중복 추출은 독립적인 시장 사례를 늘리지 않습니다. 세 경제 조건에는 같은 예시 잔차를 사용합니다.',
        '일별 모의 가격은 실제 미래 시가·고가·저가·종가를 제공하지 않습니다.',
      ],
    }];
  }));
}

/** The ETH chart and BMNR treasury consume this identical post-Merge path model.
 * These are economic conditions with one shared historical residual, not quantiles. */
export function buildEthereumForecasts({ethHistory,asOf,endYear=2035,seed=20261022}={}){
  utcDay(asOf);
  if(!Number.isSafeInteger(endYear)||endYear<2027||endYear>2050)throw new RangeError('ETH horizon must be 2027–2050');
  if(!Number.isSafeInteger(seed)||seed<0||seed>4294967295)throw new RangeError('seed must be an unsigned 32-bit integer');
  const endDate=`${endYear}-12-31`;
  if(asOf>=endDate)throw new RangeError('ETH horizon must follow its observation cutoff');
  const rows=readAssetDailyRows(ethHistory,'ETH',asOf);
  const scenarios=buildEthereumAssetScenarioPaths(rows,asOf,endDate,seed);
  const bounds=scenarios.base.path.map((point,index)=>({
    low:Math.min(...SCENARIOS.map(id=>scenarios[id].path[index].price)),
    high:Math.max(...SCENARIOS.map(id=>scenarios[id].path[index].price)),
  }));
  const forecasts=Object.fromEntries(SCENARIOS.map(id=>{
    const model=scenarios[id];
    return [id,{
      symbol:'ETHUSD',asOf,displayEnd:endDate,pathMode:'crypto-conditional-daily',
      scenario:{id,label:LABELS[id]},probability:null,calibrated:false,
      path:model.path.map((point,index)=>({...point,...bounds[index]})),
      milestones:model.anchors.filter(item=>item.date<=endDate).map(item=>({
        id:`eth-${id}-${item.date}`,date:item.date,price:model.path.find(point=>point.date===item.date)?.price,
        title:`${item.date} · ETH 기준선 조건`,kind:'valuation-condition',sourceIds:item.sourceIds,
        description:`${LABELS[id]} 기준선 $${item.price.toLocaleString('en-US')} 조건입니다. 잔차가 더해진 경로의 도착 가격이나 예측 사건일이 아닙니다.`,
      })),
      assetPath:model,assumptions:{anchors:model.anchors,seed},
      warnings:[...model.warnings,'음영은 세 조건의 최소·최대입니다. 확률·신뢰구간이나 가능한 손실의 전체 범위가 아닙니다.'],
    }];
  }));
  return {asOf,endDate,forecasts,metadata:{version:'ethereum-forecast-1',seed,scenarioCount:3,probability:null,ohlcClaim:false}};
}
