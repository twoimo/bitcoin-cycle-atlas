import type { Point } from '@atlas/contracts/market-lab';
import { weeklyRsiBars, weeklyRsiPrices, type RsiBar } from '@atlas/domain/rsi-bars';
import { panRange, zoomRange, type ChartRange } from '../../../dist/chart-navigation.js';
import { applyChartCommand, date, day, initialChartView, type RsiChartView } from './rsi-chart-model.js';

export interface InstrumentVolume {
  date: string;
  value: number | null;
  average?: number | null;
  state?: 'above' | 'neutral' | 'below' | 'warmup';
}
export interface InstrumentSeries {
  prices: Point[];
  bars: RsiBar[];
  timeline: string[];
  volumes: InstrumentVolume[];
  frequency: 'daily' | 'monthly';
}
export interface InstrumentChartCache {
  view?: RsiChartView;
  undo?: RsiChartView[];
  redo?: RsiChartView[];
}
export type ExternalInstrumentView = Pick<RsiChartView, 'start' | 'end' | 'selected' | 'chartType'>;

/** The calendar is independent of prices: an unpublished index stays missing. */
export function nearestObservation(dates: readonly string[], target: string): number {
  if (!dates.length || !Number.isFinite(day(target))) return -1;
  let left = 0, right = dates.length - 1;
  while (left < right) {
    const middle = (left + right) >> 1;
    if (dates[middle] < target) left = middle + 1; else right = middle;
  }
  return left > 0 && Math.abs(day(dates[left - 1]) - day(target)) < Math.abs(day(dates[left]) - day(target)) ? left - 1 : left;
}

export function initialInstrumentView(series: InstrumentSeries): RsiChartView {
  return {
    ...initialChartView(series.prices), start: series.timeline[0] || '', end: series.timeline.at(-1) || '',
    selected: series.timeline.at(-1) || '', frequency: series.frequency,
    chartType: series.bars.length ? 'candles' : 'line', scale: series.frequency === 'monthly' ? 'linear' : 'log',
    showRsi: false, showSignal: false, showLevels: false, showCrossings: false,
    showVolume: series.volumes.some(item => item.value !== null),
  };
}

export function instrumentRange(view: RsiChartView, series: InstrumentSeries): ChartRange | null {
  if (!series.timeline.length) return null;
  const min = series.timeline[0], max = series.timeline.at(-1)!;
  return { start: view.start, end: view.end, min, max, minSpan: series.frequency === 'monthly' ? 60 : 10,
    allowEmpty: true, maxSpan: Math.max(series.frequency === 'monthly' ? 60 : 10, day(max) - day(min) + 1) };
}

export function displayInstrumentSeries(series: InstrumentSeries, frequency: RsiChartView['frequency']): InstrumentSeries {
  if (series.frequency === 'monthly' || frequency !== 'weekly') return series;
  const bars = weeklyRsiBars(series.bars), prices = weeklyRsiPrices(series.prices);
  return { ...series, prices, bars, timeline: prices.map(point => point[0]),
    volumes: bars.map(bar => ({ date: bar[0], value: bar[5] })) };
}

export function boundedInstrumentDates(series: InstrumentSeries, start: string, end: string) {
  if (!series.timeline.length) return { start: '', end: '' };
  const min = day(series.timeline[0]), max = day(series.timeline.at(-1)!);
  if (!Number.isFinite(day(start)) || !Number.isFinite(day(end)) || day(end) < day(start)) throw new RangeError('표시할 날짜 범위를 확인하세요.');
  const minimum = series.frequency === 'monthly' ? 60 : 9;
  const span = Math.min(max - min, Math.max(minimum, day(end) - day(start)));
  const first = Math.max(min, Math.min(max - span, day(start)));
  return { start: date(first), end: date(first + span) };
}

export function applyInstrumentCommand(view: RsiChartView, series: InstrumentSeries, action: string, value?: unknown): RsiChartView {
  const range = instrumentRange(view, series);
  if (!range) return view;
  if (action === 'zoom' || action === 'pan') {
    const amount = Number(value); if (!Number.isFinite(amount) || action === 'zoom' && amount <= 0) return view;
    const next = action === 'zoom' ? zoomRange(range, amount) : panRange(range, amount);
    return { ...view, start: next.start, end: next.end };
  }
  if (action === 'fit') return { ...view, start: range.min, end: range.max, autoScale: true, domain: null };
  if (action === 'span') {
    const span = Number(value); if (!Number.isFinite(span) || span < 0) return view;
    return { ...view, ...boundedInstrumentDates(series, span ? date(day(range.max) - span) : range.min, range.max), autoScale: true, domain: null };
  }
  if (action === 'frequency') {
    const allowed = series.frequency === 'monthly' ? ['monthly'] : ['daily', 'weekly'];
    return allowed.includes(String(value)) ? { ...view, frequency: value as RsiChartView['frequency'], autoScale: true, domain: null, measurement: [] } : view;
  }
  if (action === 'type' && !series.bars.length) return view;
  if (action === 'date' && typeof value === 'string') {
    const timeline = displayInstrumentSeries(series, view.frequency).timeline;
    const at = nearestObservation(timeline, value); if (at < 0) return view;
    const selected = timeline[at], span = day(view.end) - day(view.start);
    return { ...view, selected, ...(selected < view.start || selected > view.end
      ? boundedInstrumentDates(series, date(day(selected) - span / 2), date(day(selected) + span / 2)) : {}) };
  }
  return applyChartCommand(view, series.prices, action, value);
}

/** Return separate paths across unpublished/missing observations. */
export function observedPricePath(prices: readonly Point[], timeline: readonly string[], x: (date: string) => number, y: (value: number) => number) {
  const positions = new Map(timeline.map((stamp, index) => [stamp, index]));
  return prices.map((point, index) => {
    const previous = prices[index - 1];
    const contiguous = previous && positions.get(point[0]) === (positions.get(previous[0]) ?? -2) + 1;
    return `${contiguous ? 'L' : 'M'}${x(point[0]).toFixed(2)},${y(point[1]).toFixed(2)}`;
  }).join(' ');
}
