import { utcDay, dateFromDay } from './cycle-engine.js?v=1.29.0';
import { buildLongHorizonForecast, LONG_HORIZON_DEFAULTS } from './long-horizon-forecast.js?v=1.29.0';
import { LONG_HORIZON_CLAIMS, LONG_HORIZON_REVIEW_DATE } from './long-horizon-evidence.js?v=1.29.0';
import { forecastPricePrefix, buildIndependentBenchmarks, absoluteLogError, intervalScore, FORECAST_HORIZONS } from './forecast-evaluation.js';
import { forecastHash } from './forecast-records.js';

export const FORECAST_EXPERIMENT_POLICY = Object.freeze({
  version: 'locked-retrospective-experiments-1', minimumHistoryDays: 730, originStrideDays: 28,
  horizons: FORECAST_HORIZONS, intervalAlpha: 0.2, minimumCalibrationErrors: 12, maximumCalibrationErrors: 64,
  normal80Percentile: 1.2815515655446004, pointImprovementThreshold: 0.05,
  pointGateBaseline: 'Best of flat and shrunken trend on disjoint target intervals',
  minimumDisjointEvaluationCases: 30, requiredImprovedHorizons: 2, prospectiveEvidenceRequired: true,
});

function mean(values) { return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null; }

function logReturnVolatility(rows, lookback) {
  const selected = rows.slice(-lookback - 1), values = [];
  for (let index = 1; index < selected.length; index++) {
    if (selected[index].epochDay !== selected[index - 1].epochDay + 1) throw new RangeError('Volatility experiment needs consecutive UTC observations');
    values.push(Math.log(selected[index].price / selected[index - 1].price));
  }
  const average = mean(values) ?? 0;
  return values.length > 1 ? Math.sqrt(values.reduce((sum, value) => sum + (value - average) ** 2, 0) / (values.length - 1)) : 0;
}

function disjointCases(cases) {
  let boundary = Infinity;
  return [...cases].sort((a, b) => b.targetDate.localeCompare(a.targetDate) || b.origin.localeCompare(a.origin)).filter(item => {
    if (utcDay(item.targetDate) > boundary) return false;
    boundary = utcDay(item.origin);
    return true;
  });
}

export function calibrateLogInterval(cases, { origin, predicted, horizonDays, alpha = 0.2, minCount = 12, maxCount = 64 } = {}) {
  utcDay(origin);
  if (!Number.isFinite(predicted) || predicted <= 0 || !Number.isSafeInteger(horizonDays) || horizonDays < 1 || !Number.isFinite(alpha) || alpha <= 0 || alpha >= 1 || !Number.isSafeInteger(minCount) || minCount < 1 || !Number.isSafeInteger(maxCount) || maxCount < minCount) throw new RangeError('Invalid interval calibration settings');
  const mature = [];
  for (const item of cases) {
    utcDay(item.origin); utcDay(item.targetDate);
    if (item.horizonDays !== horizonDays || item.targetDate > origin || item.origin >= origin) continue;
    if (utcDay(item.targetDate) - utcDay(item.origin) !== horizonDays) throw new RangeError('Calibration case horizon mismatch');
    mature.push({ ...item, error: absoluteLogError(item.predicted, item.actual) });
  }
  const used = disjointCases(mature).slice(0, maxCount);
  const rank = Math.ceil((used.length + 1) * (1 - alpha));
  const common = { origin, horizonDays, alpha, eligibleMaturedCount: mature.length, usedCount: used.length,
    usedOrigins: used.map(item => item.origin), latestOutcomeUsed: used.length ? used.map(item => item.targetDate).sort().at(-1) : null,
    nonoverlappingTargetIntervals: true, independentSampleSize: null, calibratedForProduction: false,
    guarantee: 'No individual or conditional coverage guarantee; this is a retrospective empirical-error experiment.' };
  if (used.length < minCount || rank > used.length) return { ...common, status: 'insufficient-matured-errors', lower: null, upper: null, logRadius: null };
  const errors = used.map(item => item.error).sort((a, b) => a - b), logRadius = errors[rank - 1];
  const lower = predicted * Math.exp(-logRadius), upper = predicted * Math.exp(logRadius);
  if (![lower, upper].every(value => Number.isFinite(value) && value > 0)) throw new RangeError('Calibration interval overflow');
  return { ...common, status: 'experimental', lower, upper, logRadius };
}

export function runSequentialPriceExperiment(input, { asOf, policy = FORECAST_EXPERIMENT_POLICY } = {}) {
  const rows = forecastPricePrefix(input, asOf), firstDay = rows[0].epochDay, lastDay = rows.at(-1).epochDay;
  const prices = new Map(rows.map(row => [row.date, row.price]));
  const cases = [], calibrationHistory = new Map(policy.horizons.map(horizon => [horizon, []]));
  for (let index = 0; index < rows.length; index++) {
    const current = rows[index];
    if (current.epochDay < firstDay + policy.minimumHistoryDays || (current.epochDay - firstDay - policy.minimumHistoryDays) % policy.originStrideDays !== 0) continue;
    const prefix = rows.slice(0, index + 1), benchmarks = buildIndependentBenchmarks(prefix, { asOf: current.date, horizons: policy.horizons });
    const vol30 = logReturnVolatility(prefix, 30), vol180 = logReturnVolatility(prefix, 180);
    const volatilityShrinkage = vol180 > 0 ? 1 / (1 + vol30 / vol180) : 0;
    for (const target of benchmarks.targets) {
      const interval = calibrateLogInterval(calibrationHistory.get(target.horizonDays), { origin: current.date, predicted: target.flat,
        horizonDays: target.horizonDays, alpha: policy.intervalAlpha, minCount: policy.minimumCalibrationErrors, maxCount: policy.maximumCalibrationErrors });
      if (utcDay(target.targetDate) > lastDay || !prices.has(target.targetDate)) continue;
      const actual = prices.get(target.targetDate);
      const volatilityTrend = current.price * Math.exp(benchmarks.dailyLogDrift * volatilityShrinkage * target.horizonDays);
      const radius = policy.normal80Percentile * vol180 * Math.sqrt(target.horizonDays);
      const baselineInterval = { lower: target.flat * Math.exp(-radius), upper: target.flat * Math.exp(radius) };
      const pointErrors = { flat: absoluteLogError(target.flat, actual), shrunkenTrend: absoluteLogError(target.shrunkenTrend, actual), volatilityTrend: absoluteLogError(volatilityTrend, actual) };
      const logActual = Math.log(actual);
      const intervalResult = interval.status === 'experimental' ? {
        ...interval, covered: actual >= interval.lower && actual <= interval.upper,
        logWidth: Math.log(interval.upper) - Math.log(interval.lower),
        logIntervalScore: intervalScore(Math.log(interval.lower), Math.log(interval.upper), logActual, policy.intervalAlpha),
        baselineLogIntervalScore: intervalScore(Math.log(baselineInterval.lower), Math.log(baselineInterval.upper), logActual, policy.intervalAlpha),
      } : interval;
      cases.push({ origin: current.date, targetDate: target.targetDate, horizonDays: target.horizonDays, actual,
        flat: target.flat, shrunkenTrend: target.shrunkenTrend, volatilityTrend, volatilityShrinkage, pointErrors, interval: intervalResult });
      calibrationHistory.get(target.horizonDays).push({ origin: current.date, targetDate: target.targetDate, horizonDays: target.horizonDays, predicted: target.flat, actual });
    }
  }
  const summaries = policy.horizons.map(horizonDays => {
    const group = cases.filter(item => item.horizonDays === horizonDays), disjoint = disjointCases(group);
    const intervals = group.filter(item => item.interval.status === 'experimental');
    const pointErrors = Object.fromEntries(['flat', 'shrunkenTrend', 'volatilityTrend'].map(model => [model, mean(group.map(item => item.pointErrors[model]))]));
    const disjointPointErrors = Object.fromEntries(['flat', 'shrunkenTrend', 'volatilityTrend'].map(model => [model, mean(disjoint.map(item => item.pointErrors[model]))]));
    return { horizonDays, completedCases: group.length, uniqueOrigins: new Set(group.map(item => item.origin)).size,
      disjointTargetIntervals: disjoint.length, overlappingTargets: group.length > disjoint.length, independentSampleSize: null,
      meanAbsoluteLogErrors: pointErrors, disjointMeanAbsoluteLogErrors: disjointPointErrors,
      intervalCases: intervals.length, empiricalCoverage: mean(intervals.map(item => Number(item.interval.covered))),
      meanLogWidth: mean(intervals.map(item => item.interval.logWidth)), meanLogIntervalScore: mean(intervals.map(item => item.interval.logIntervalScore)),
      baselineMeanLogIntervalScore: mean(intervals.map(item => item.interval.baselineLogIntervalScore)) };
  });
  const improved = summaries.filter(summary => {
    const baseline = Math.min(summary.disjointMeanAbsoluteLogErrors.flat, summary.disjointMeanAbsoluteLogErrors.shrunkenTrend);
    return summary.disjointTargetIntervals >= policy.minimumDisjointEvaluationCases && baseline > 0 && summary.disjointMeanAbsoluteLogErrors.volatilityTrend <= baseline * (1 - policy.pointImprovementThreshold);
  }).length;
  const intervalImproved = summaries.filter(summary => summary.intervalCases > 0 && summary.meanLogIntervalScore < summary.baselineMeanLogIntervalScore).length;
  return { policy: JSON.parse(JSON.stringify(policy)), candidate: 'volatility-damped-shrunken-trend',
    candidateDefinition: 'The fixed shrunken log trend is multiplied by 1 / (1 + sd30 / sd180); no parameter is optimized on evaluation outcomes.',
    intervalCandidate: 'Trailing nonoverlapping matured absolute log errors of the flat forecast, with a fixed finite-sample order statistic.',
    baselineInterval: 'Fixed normal 80% band using only the previous 180 daily log returns and square-root-time scaling; an assumption, not guaranteed coverage.',
    retrospective: true, policyPreregistered: false, policyStatus: 'Defined during development and versioned for future runs; not an untouched historical holdout.',
    historicalVintagesAvailable: false, actualHistoricalModelExistenceClaim: false,
    cases, summaries, intervalAdoption: { status: 'not-adopted', improvedScoreHorizons: intervalImproved, prospectiveGatePassed: false,
      reason: 'Coverage must be considered with interval width and proper score; no prospective evidence supports production calibration.' },
    adoption: { status: 'not-adopted', qualifyingRetrospectiveHorizons: improved,
      retrospectivePointGatePassed: improved >= policy.requiredImprovedHorizons, prospectiveGatePassed: false,
      reasons: ['No matured prospective trial for this candidate', 'Current-source retrospective data cannot establish historical vintage performance'],
      existingScenarioBandChanged: false } };
}

export function runCycleAblation(input, { asOf, maxOrigins = 12, sampleCount = LONG_HORIZON_DEFAULTS.sampleCount } = {}) {
  if (!Number.isSafeInteger(maxOrigins) || maxOrigins < 1 || maxOrigins > 24) throw new RangeError('Ablation origin count must be an integer in [1, 24]');
  const rows = forecastPricePrefix(input, asOf), prices = new Map(rows.map(row => [row.date, row.price]));
  const firstPublication = LONG_HORIZON_CLAIMS.filter(claim => claim.chartEligible && claim.publisher === 'WisdomTree').map(claim => claim.publishedAt).sort().at(-1);
  const candidates = rows.filter(row => row.date >= firstPublication && utcDay(asOf) - row.epochDay >= 30 && dateFromDay(row.epochDay + 1).slice(0, 7) !== row.date.slice(0, 7)).slice(-maxOrigins);
  const cases = [], skipped = [];
  for (const origin of candidates) {
    const researchAsOf = origin.date < LONG_HORIZON_REVIEW_DATE ? origin.date : LONG_HORIZON_REVIEW_DATE;
    const options = { ...LONG_HORIZON_DEFAULTS, asOf: origin.date, referenceDate: dateFromDay(origin.epochDay + 1), researchAsOf, sampleCount, scenario: 'base' };
    let adaptive, fixed;
    try { adaptive = buildLongHorizonForecast(input, options); fixed = buildLongHorizonForecast(input, { ...options, applyCycleCalibration: false }); }
    catch (error) { skipped.push({ origin: origin.date, reason: error.message }); continue; }
    const benchmarks = buildIndependentBenchmarks(rows.slice(0, rows.findIndex(row => row.date === origin.date) + 1), { asOf: origin.date });
    for (const target of benchmarks.targets) {
      if (target.targetDate > asOf || !prices.has(target.targetDate)) continue;
      const actual = prices.get(target.targetDate), a = adaptive.path[target.horizonDays], f = fixed.path[target.horizonDays];
      const withoutCycleComponent = Math.exp(Math.log(a.price) - a.cycleDisplacement);
      cases.push({ origin: origin.date, targetDate: target.targetDate, horizonDays: target.horizonDays,
        actual, predictions: { adaptive: a.price, fixedClock: f.price, withoutCycleComponent, flat: target.flat, shrunkenTrend: target.shrunkenTrend },
        absoluteLogErrors: { adaptive: absoluteLogError(a.price, actual), fixedClock: absoluteLogError(f.price, actual), withoutCycleComponent: absoluteLogError(withoutCycleComponent, actual), flat: absoluteLogError(target.flat, actual), shrunkenTrend: absoluteLogError(target.shrunkenTrend, actual) },
        researchAsOf, appliedTimingShiftDays: adaptive.cycleCalibration.forecastApplication.appliedShiftDays });
    }
  }
  return { status: skipped.length ? 'incomplete' : cases.length ? 'completed' : 'unavailable', candidateOrigins: candidates.length,
    retrospective: true, originRule: 'Last at most 12 completed month ends after the required published valuation source existed; at least one 30-day outcome must be mature.',
    sampleCount, cases, skipped, uniqueOrigins: new Set(cases.map(item => item.origin)).size,
    summaries: FORECAST_HORIZONS.map(horizonDays => {
      const group = cases.filter(item => item.horizonDays === horizonDays);
      return { horizonDays, completedCases: group.length, disjointTargetIntervals: disjointCases(group).length,
        meanAbsoluteLogErrors: Object.fromEntries(['adaptive', 'fixedClock', 'withoutCycleComponent', 'flat', 'shrunkenTrend'].map(model => [model, mean(group.map(item => item.absoluteLogErrors[model]))])) };
    }),
    componentAblationMeaning: 'Remove only the additive cycle displacement in log price. The illustrative residual remains shared; this is not an independently trained no-cycle model.',
    timingHypothesisStatus: 'Not a test of universal 3–5-month cycle acceleration. Event definitions and more distinct completed market cycles are required.',
    historicalVintagesAvailable: false, actualHistoricalModelExistenceClaim: false,
    adoption: { status: 'not-adopted', reason: 'Retrospective ablation does not establish prospective improvement or a general cycle law', productionClockChanged: false } };
}

export async function runForecastExperiments(input, { asOf, sourceCommit = null, sourceHash = null, experimentSourceHash = null, experimentSourceFiles = null } = {}) {
  const rows = forecastPricePrefix(input, asOf), prices = rows.map(row => [row.date, row.price]);
  return { schemaVersion: 1, kind: 'atlas-forecast-experiments', asOf, sourceCommit, sourceHash, experimentSourceHash, experimentSourceFiles,
    observationHash: await forecastHash(prices), policyHash: await forecastHash(FORECAST_EXPERIMENT_POLICY),
    sequential: runSequentialPriceExperiment({ prices }, { asOf }), cycleAblation: runCycleAblation({ prices }, { asOf }),
    scope: 'Locked retrospective experiments on the available current-source price series. No prospective validation, probability guarantee or model promotion is claimed.' };
}
