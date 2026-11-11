import { CHART_INTERVALS, chartInterval, isIntradayInterval } from './ohlc-data.js?v=1.29.0';
import { readChartUrlState, writeChartUrlState } from './ui/chart-url-state.js';

export function readEthView(params) {
  const { frequency, chartType, scale, span } = readChartUrlState(params, { frequencies: ['daily', ...CHART_INTERVALS.filter(item => item.id !== 'daily').map(item => item.id)], spanAliases: ['eth-span'] });
  return { frequency, chartType, scale, span };
}

export function ethViewQuery(state) {
  const params = writeChartUrlState(new URLSearchParams({symbol:'ETHUSD'}), state);
  if (state.forecastVisible === false) params.set('forecast', 'off');
  if (state.showVolume === false) params.set('vol', '0');
  if (['pooled','valuation'].includes(state.ethModel)) params.set('eth-model', state.ethModel);
  if (state.ethModel === 'valuation' && ['stress','bull'].includes(state.ethScenario)) params.set('eth-scenario', state.ethScenario);
  return params.toString();
}

/** Observed bounds by default; an explicit conditional horizon enables future navigation. */
export function ethHistoryRange(series, span = '4y', previous = null, forecastEnd = null) {
  const step = chartInterval(series.interval).seconds;
  const first = series.candles[0]?.time, last = series.candles.at(-1)?.time;
  if (!Number.isSafeInteger(first) || !Number.isSafeInteger(last)) return null;
  const min = first - step;
  const future = forecastEnd ? Date.parse(`${forecastEnd}T00:00:00Z`) / 1000 : last;
  if (!Number.isSafeInteger(future)) throw new RangeError('Invalid ETH future horizon');
  const ceil = value => min + Math.ceil((value - min) / step) * step;
  const max = ceil(Math.max(last, future) + step);
  const days = {'1m':30, '6m':183, '1y':365, '4y':1461};
  const count = span === 'all' ? Math.round((max - min) / step) : Math.ceil((days[span] || 1461) * 86400 / step);
  const defaultEnd = forecastEnd && span !== 'all'
    ? Math.min(max, ceil(last + (span === '4y' ? 548 : Math.max(10, Math.round((days[span] || 1461) * .25))) * 86400)) : max;
  const end = previous?.end ?? defaultEnd;
  const start = previous?.start ?? Math.max(min, end - count * step);
  return {unit:'seconds', start, end, min, max, step, minSpan:Math.min(12, Math.round((max-min)/step)+1), contextKey:`ETH-USD:${series.interval}:${series.retrievedAt}`,
    ...(previous?.allowEmpty?{allowEmpty:true,maxSpan:Math.max(previous.maxSpan??Math.round((max-min)/step)+1,Math.round((end-start)/step)+1)}:{})};
}

export function ethRangeLabel(frequency, span) {
  if (isIntradayInterval(frequency)) return '최근 구간';
  return {'1m':'1개월', '6m':'6개월', '1y':'1년', '4y':'4년', all:'전체'}[span] || '4년';
}
