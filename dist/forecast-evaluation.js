import { utcDay, dateFromDay, validateDataset } from './cycle-engine.js?v=1.29.0';

export const FORECAST_HORIZONS = Object.freeze([30, 90, 180]);
export const BENCHMARK_POLICY = Object.freeze({ version: 'independent-price-baselines-1', lookbackDays: 180, trendShrinkage: 0.25, maximumAnnualLogDrift: Math.log(2) });

export function forecastPricePrefix(input, asOf) {
  utcDay(asOf);
  const prices = Array.isArray(input) ? input : input?.prices;
  if (!Array.isArray(prices) || !prices.length || prices.length > 100000) throw new TypeError('A bounded daily price series is required');
  const included = [];
  for (const row of prices) {
    const date = Array.isArray(row) ? row[0] : row?.date;
    utcDay(date);
    if (date <= asOf) included.push(row);
  }
  return validateDataset(included);
}

export function buildIndependentBenchmarks(input, { asOf, horizons = FORECAST_HORIZONS } = {}) {
  const rows = forecastPricePrefix(input, asOf);
  const last = rows.at(-1);
  if (last.date !== asOf) throw new RangeError('Benchmark origin must have an observed close');
  const first = rows.find(row => row.epochDay >= last.epochDay - BENCHMARK_POLICY.lookbackDays) ?? rows[0];
  const elapsed = last.epochDay - first.epochDay;
  const rawDrift = elapsed ? Math.log(last.price / first.price) / elapsed : 0;
  const limit = BENCHMARK_POLICY.maximumAnnualLogDrift / 365.25;
  const dailyLogDrift = Math.max(-limit, Math.min(limit, rawDrift * BENCHMARK_POLICY.trendShrinkage));
  if (!Array.isArray(horizons) || !horizons.length || new Set(horizons).size !== horizons.length) throw new TypeError('Unique horizons are required');
  const targets = horizons.map(horizonDays => {
    if (!Number.isSafeInteger(horizonDays) || horizonDays < 1 || horizonDays > 3650) throw new RangeError('Invalid forecast horizon');
    const targetDate = dateFromDay(last.epochDay + horizonDays);
    const shrunkenTrend = last.price * Math.exp(dailyLogDrift * horizonDays);
    if (!Number.isFinite(shrunkenTrend) || shrunkenTrend <= 0) throw new RangeError('Benchmark overflow');
    return { horizonDays, targetDate, flat: last.price, shrunkenTrend };
  });
  return { policy: { ...BENCHMARK_POLICY }, asOf, anchorPrice: last.price, lookbackStart: first.date, dailyLogDrift, targets };
}

export function absoluteLogError(predicted, actual) {
  if (![predicted, actual].every(value => Number.isFinite(value) && value > 0)) throw new RangeError('Scored prices must be positive and finite');
  return Math.abs(Math.log(predicted) - Math.log(actual));
}

export function intervalScore(lower, upper, actual, alpha = 0.2) {
  if (![lower, upper, actual].every(Number.isFinite) || lower > upper || !Number.isFinite(alpha) || alpha <= 0 || alpha >= 1) throw new RangeError('Invalid scoring interval');
  return upper - lower + (actual < lower ? 2 / alpha * (lower - actual) : actual > upper ? 2 / alpha * (actual - upper) : 0);
}

function mean(values) { return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null; }

export function evaluateForecastRecords(records, observedInput, { asOf } = {}) {
  if (!Array.isArray(records)) throw new TypeError('Forecast records must be an array');
  const observed = forecastPricePrefix(observedInput, asOf);
  const prices = new Map(observed.map(row => [row.date, row.price]));
  const rows = [];
  for (const record of records) {
    if (record?.kind !== 'atlas-forecast-record' || !Array.isArray(record.targets)) throw new TypeError('Invalid forecast record');
    for (const target of record.targets) {
      utcDay(target.targetDate);
      const issueLagDays = (Date.parse(record.issuedAt) - (utcDay(record.asOf) + 1) * 86400000) / 86400000;
      const actualLeadDays = ((utcDay(target.targetDate) + 1) * 86400000 - Date.parse(record.issuedAt)) / 86400000;
      const prospective = record.recordKind === 'issued' && issueLagDays >= 0 && issueLagDays < 1 && actualLeadDays > 0;
      const status = target.targetDate > asOf ? 'pending' : !prices.has(target.targetDate) ? 'missing-observation' : prospective ? 'scored' : 'retrospective';
      const actual = status === 'scored' || status === 'retrospective' ? prices.get(target.targetDate) : null;
      const errors = actual === null ? null : {
        forecast: absoluteLogError(target.price, actual),
        flat: absoluteLogError(target.flat, actual),
        shrunkenTrend: absoluteLogError(target.shrunkenTrend, actual),
      };
      rows.push({ recordId: record.id, recordKind: record.recordKind, scenario: record.scenario.id, scenarioLabel: record.scenario.label,
        modelVersion: record.model.version, modelSourceHash: record.model.sourceHash, benchmarkVersion: record.benchmarks.policy.version,
        asOf: record.asOf, issuedAt: record.issuedAt, horizonDays: target.horizonDays, targetDate: target.targetDate, issueLagDays, actualLeadDays,
        status, prospective, predicted: target.price, flat: target.flat, shrunkenTrend: target.shrunkenTrend,
        actual, absoluteLogErrors: errors, absolutePercentageError: actual === null ? null : Math.abs(target.price / actual - 1) * 100,
        probabilisticScore: null, probabilityStatus: 'conditional-scenario-not-probability' });
    }
  }
  const groups = new Map();
  for (const row of rows) {
    const key = [row.scenario, row.horizonDays, row.modelSourceHash, row.benchmarkVersion].join(':');
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(row);
  }
  const summaries = [...groups.values()].map(group => {
    const scored = group.filter(row => row.status === 'scored');
    const forecast = mean(scored.map(row => row.absoluteLogErrors.forecast));
    const flat = mean(scored.map(row => row.absoluteLogErrors.flat));
    const shrunkenTrend = mean(scored.map(row => row.absoluteLogErrors.shrunkenTrend));
    const origins = [...new Set(scored.map(row => row.asOf))].sort();
    return { scenario: group[0].scenario, scenarioLabel: group[0].scenarioLabel, horizonDays: group[0].horizonDays,
      modelVersion: group[0].modelVersion, modelSourceHash: group[0].modelSourceHash, benchmarkVersion: group[0].benchmarkVersion,
      recordCount: group.length, issuedCount: group.filter(row => row.recordKind === 'issued').length,
      scoredCount: scored.length, pendingCount: group.filter(row => row.status === 'pending').length,
      missingObservationCount: group.filter(row => row.status === 'missing-observation').length,
      retrospectiveCount: group.filter(row => row.status === 'retrospective').length,
      uniqueOrigins: origins.length, distinctTargetDates: new Set(scored.map(row => row.targetDate)).size,
      overlappingTargets: origins.some((date, index) => index > 0 && utcDay(date) - utcDay(origins[index - 1]) < group[0].horizonDays),
      meanAbsoluteLogError: forecast, flatMeanAbsoluteLogError: flat, trendMeanAbsoluteLogError: shrunkenTrend,
      skillVersusFlat: flat > 0 ? 1 - forecast / flat : null, skillVersusTrend: shrunkenTrend > 0 ? 1 - forecast / shrunkenTrend : null,
      independentSampleSize: null, calibrated: false };
  });
  return { schemaVersion: 1, kind: 'atlas-forecast-evaluation', asOf, observationThrough: observed.at(-1).date,
    records: records.length, uniqueOrigins: new Set(records.map(record => record.asOf)).size,
    maturedTargets: rows.filter(row => row.status === 'scored').length, rows, summaries,
    scope: 'Only actually generated and preserved records issued during the next UTC day enter prospective summaries. Horizons start at the last completed close; actualLeadDays separately reports time from generation to the target close. Publication evidence is separate. Overlapping forecast errors are not independent market experiments.',
    longHorizonAccuracyClaim: false, calibrated: false };
}
