import { assertModelAvailable, modelSpecFor } from './forecast-models.js';
import { classifySufficiency, horizonUnit } from './forecast-sufficiency.js';

/** Derive the UI gate from the same completed daily observations as the chart.
 * Evaluation sample count matches evaluate-forecasts.mjs: the training window
 * and longest declared horizon must both fit before an origin is scored.
 * This is data availability, not a claim that a model passed validation. */
export function forecastAvailabilityForSeries(symbol, series) {
  if (series?.completedOnly !== true || series?.interval !== 'daily') {
    throw new TypeError('Forecast availability requires parsed completed daily observations');
  }
  const rows = series.candles;
  if (!Array.isArray(rows) || !rows.length) throw new TypeError('Forecast availability requires observations');
  let previous = -Infinity;
  for (const row of rows) {
    if (!Number.isSafeInteger(row.time) || row.time <= previous || !(row.close > 0) || !Number.isFinite(row.close)) {
      throw new TypeError('Invalid forecast availability observations');
    }
    previous = row.time;
  }
  const { window, horizons, label: unitLabel } = horizonUnit(modelSpecFor(symbol).horizonUnit);
  const observations = rows.length;
  const years = (rows.at(-1).time - rows[0].time) / (365.25 * 86400);
  const evalSamples = Math.max(0, observations - window - Math.max(...horizons));
  const sufficiency = classifySufficiency({ observations, years, evalSamples });
  const sampleLabel = `${sufficiency.tier} · 관측 ${observations.toLocaleString('en-US')}${unitLabel} · ${years.toFixed(1)}년`;
  try {
    const model = assertModelAvailable(symbol, sufficiency.tier);
    return { ...sufficiency, allowed: true, observations, years, evalSamples, sampleLabel, message: '', model };
  } catch (error) {
    return { ...sufficiency, allowed: false, observations, years, evalSamples, sampleLabel,
      message: '표본 부족으로 미래 경로를 제공하지 않습니다', reason: error.message, model: null };
  }
}
