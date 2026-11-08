import { isIntradayInterval } from '../ohlc-data.js';
import { normalizeWorkspaceRange } from '../workspace-state.js';
import { normalizePriceDomain } from '../price-axis.js';

// These keys describe presentation only. Model assumptions, source identities
// and saved research records stay with their original controllers.
export const CHART_URL_KEYS = Object.freeze(['granularity', 'type', 'axis', 'span', 'view-start', 'view-end', 'price-min', 'price-max', 'axis-inverted', 'magnet']);

export function readChartUrlState(params, { frequencies = ['daily', 'weekly'], spans = ['1m', '6m', '1y', '4y', 'all'], spanAliases = [], defaultSpan = '4y' } = {}) {
  const query = params instanceof URLSearchParams ? params : new URLSearchParams(params);
  const frequency = frequencies.includes(query.get('granularity')) ? query.get('granularity') : frequencies[0];
  const scale = query.get('axis') === 'linear' ? 'linear' : 'log';
  const span = ['span', ...spanAliases].map(key => query.get(key)).find(value => spans.includes(value)) || defaultSpan;
  const read = key => isIntradayInterval(frequency) ? (/^-?\d{1,11}$/.test(query.get(key) || '') ? Number(query.get(key)) : NaN) : query.get(key);
  const range = normalizeWorkspaceRange({ start: read('view-start'), end: read('view-end') }, frequency);
  const price = key => query.has(key) && query.get(key).trim() !== '' ? Number(query.get(key)) : NaN;
  return { frequency, chartType: query.get('type') === 'candles' ? 'candles' : 'line', scale, span, range,
    priceDomain: normalizePriceDomain({ min: price('price-min'), max: price('price-max') }, { scale }),
    invertScale: query.get('axis-inverted') === '1', magnet: ['weak', 'strong'].includes(query.get('magnet')) ? query.get('magnet') : 'off' };
}

/** Native charts use seconds internally; shared daily links use calendar dates. */
export function chartUrlRange(range, frequency = 'daily') {
  if (!range) return null;
  try {
    const value = key => !isIntradayInterval(frequency) && Number.isSafeInteger(range[key]) ? new Date(range[key] * 1000).toISOString().slice(0, 10) : range[key];
    return normalizeWorkspaceRange({ start: value('start'), end: value('end') }, frequency);
  } catch { return null; }
}

export function writeChartUrlState(params, state, { defaultSpan = '4y', explicit = false } = {}) {
  const query = new URLSearchParams(params);
  const field = (key, value, fallback) => value != null && (explicit || value !== fallback) ? query.set(key, String(value)) : query.delete(key);
  field('granularity', state.frequency, 'daily');
  field('type', state.chartType, 'line');
  field('axis', state.scale, 'log');
  field('span', state.span, defaultSpan);
  query.delete('eth-span'); query.delete('equity-span');
  const range = chartUrlRange(state.range || { start: state.start, end: state.end }, state.frequency);
  for (const key of ['start', 'end']) range ? query.set(`view-${key}`, String(range[key])) : query.delete(`view-${key}`);
  const domain = normalizePriceDomain(state.priceDomain ?? (state.autoScale === false ? state.domain : null), { scale: state.scale });
  for (const key of ['min', 'max']) domain ? query.set(`price-${key}`, String(domain[key])) : query.delete(`price-${key}`);
  const inverted = state.invertScale ?? state.inverted;
  inverted ? query.set('axis-inverted', '1') : query.delete('axis-inverted');
  ['weak', 'strong'].includes(state.magnet) ? query.set('magnet', state.magnet) : query.delete('magnet');
  return query;
}
