import { readChartUrlState, writeChartUrlState } from '../../../dist/ui/chart-url-state.js';
import type { RsiChartView } from './rsi-chart-model.js';

type Capabilities = { frequencies: RsiChartView['frequency'][]; candles: boolean; embedded?: boolean };

/** Pure URL restoration: missing keys retain each source's existing defaults. */
export function applyChartUrlView(view: RsiChartView, query: URLSearchParams, capabilities: Capabilities): RsiChartView {
  const saved = readChartUrlState(query, { frequencies: capabilities.frequencies });
  const range = saved.range as { start: string; end: string } | null;
  const domain = saved.priceDomain;
  return { ...view,
    ...(capabilities.frequencies.includes(query.get('granularity') as RsiChartView['frequency']) ? { frequency: saved.frequency as RsiChartView['frequency'] } : {}),
    ...(['line', 'candles'].includes(query.get('type') || '') ? { chartType: capabilities.candles ? saved.chartType as RsiChartView['chartType'] : 'line' } : {}),
    ...(['linear', 'log'].includes(query.get('axis') || '') ? { scale: saved.scale as RsiChartView['scale'] } : {}),
    ...(range ? { start: range.start, end: range.end, selected: view.selected < range.start ? range.start : view.selected > range.end ? range.end : view.selected } : {}),
    ...(domain ? { domain, autoScale: false } : {}),
    ...(query.has('axis-inverted') ? { inverted: saved.invertScale } : {}),
    ...(query.has('magnet') ? { magnet: saved.magnet as RsiChartView['magnet'] } : {}),
  };
}

export function initialChartUrlView(symbol: string, view: RsiChartView, capabilities: Capabilities): RsiChartView {
  try {
    if (typeof window === 'undefined') return view;
    const owner = capabilities.embedded ? window.parent : window;
    if (owner.location.origin !== window.location.origin) return view;
    const query = new URLSearchParams(owner.location.search);
    if (query.get('symbol')?.toUpperCase() !== symbol) return view;
    return applyChartUrlView(view, query, capabilities);
  } catch { return view; }
}

export function chartUrlView(view: RsiChartView) {
  return { frequency: view.frequency, chartType: view.chartType, scale: view.scale, start: view.start, end: view.end,
    autoScale: view.autoScale, domain: view.autoScale ? null : view.domain, inverted: view.inverted, magnet: view.magnet };
}

/** Embedded charts publish through the existing scoped parent protocol. */
export function persistStandaloneChartUrl(symbol: string, view: RsiChartView, embedded: boolean) {
  if (embedded) return;
  try {
    const query = new URLSearchParams(location.search);
    if (query.has('symbol') && query.get('symbol')?.toUpperCase() !== symbol) return;
    query.set('symbol', symbol);
    const next = writeChartUrlState(query, chartUrlView(view), { explicit: true });
    if (next.toString() !== query.toString()) history.replaceState(history.state, '', `${location.pathname}?${next}${location.hash}`);
  } catch { /* A readonly/isolated preview still keeps its source-owned view. */ }
}
