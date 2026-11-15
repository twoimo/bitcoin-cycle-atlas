import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { Point } from '@atlas/contracts/market-lab';
import type { RsiRow } from '@atlas/domain/market-lab';
import type { RsiBar } from '@atlas/domain/rsi-bars';
import { BarPlot, CartesianChart, CandlePlot, Line, Point as ChartPoint, ReferenceLine, Scrubber, XAxis, YAxis, useCartesianChart } from '@funnest/charts-react';
import type { InstrumentMarker } from './rsi-chart-canvas.js';
import type { RsiChartView } from '../rsi-chart-model.js';
import type { InstrumentSeries } from '../instrument-chart-model.js';
import type { RsiCrossing } from '../rsi-crossings.js';
import { axisNumber, type Pick } from './rsi-chart-canvas.js';
import { FunnestInstrumentMarkers } from './funnest-instrument-markers.js';

export interface NativePricePaneBounds { left: number; right: number; top: number; bottom: number }

/** Copy the public engine layout; no independently guessed chart margins. */
function NativePricePaneLayout({ host, onLayout }: { host: React.RefObject<HTMLDivElement | null>; onLayout?: (bounds: NativePricePaneBounds) => void }) {
  const chart = useCartesianChart();
  useLayoutEffect(() => {
    const svg = host.current?.querySelector('svg'), root = host.current?.closest('.rsi-chart-canvas');
    if (!svg || !root || !chart.width || !chart.height) return;
    for (const [key, value] of Object.entries({ plotLeft: chart.plot.left, plotRight: chart.plot.right, plotTop: chart.plot.top, plotBottom: chart.plot.bottom, timeAxisTop: chart.plot.bottom })) svg.dataset[key] = String(value);
    const box = svg.getBoundingClientRect(), origin = root.getBoundingClientRect();
    if (!(box.width > 0 && box.height > 0)) return;
    const sx = box.width / chart.width, sy = box.height / chart.height;
    onLayout?.({ left: box.left - origin.left + chart.plot.left * sx, right: box.left - origin.left + chart.plot.right * sx,
      top: box.top - origin.top + chart.plot.top * sy, bottom: box.top - origin.top + chart.plot.bottom * sy });
  }, [host, onLayout, chart.width, chart.height, chart.plot.left, chart.plot.right, chart.plot.top, chart.plot.bottom]);
  return null;
}

/** Preserve the original lower volume strip using Funnest's real value scale. */
export function instrumentVolumeScale(values: readonly (number | null)[], averages: readonly (number | null)[], paneHeight: number, instrument: boolean) {
  const height = Number.isFinite(paneHeight) && paneHeight > 0 ? paneHeight : 1;
  let maximum = 0;
  for (const value of [...values, ...averages]) if (typeof value === 'number' && Number.isFinite(value)) maximum = Math.max(maximum, value);
  const stripHeight = Math.min(height, instrument ? Math.min(96, Math.max(24, height * .17)) : 48);
  return { maximum, stripHeight, domain: { min: 0, max: Math.max(1, maximum) * height / stripHeight },
    ticks: maximum > 0 ? [0, ...(stripHeight >= 60 ? [maximum / 2] : []), maximum] : [0] };
}

interface Props {
  nativePricePane?: NativePricePaneBounds; onPlotGeometry?: (bounds: NativePricePaneBounds) => void;
  symbol: string; unit: string; prices: Point[]; bars: RsiBar[]; rows: RsiRow[]; view: RsiChartView; active: boolean;
  onPick: (pick: Pick) => void; onHover: (pick: Pick | null) => void; hover: Pick | null; onView: (view: RsiChartView) => void; onStart: () => void; onEnd: () => void; chartHeight: number; chartWidth: number; menuPulse?: number; onMarker?: () => void;
  series?: InstrumentSeries; markers?: InstrumentMarker[]; crossings?: RsiCrossing[]; volumeUnit?: string; description?: string; svgRef: React.RefObject<SVGSVGElement | null>;
}
const dateLabel = (value: string | number | undefined) => String(value ?? '').slice(0, 10);
const fmt = (value: number) => axisNumber(value);
const isPlotControlTarget = (target: EventTarget | null) => Boolean((target as Element | null)?.closest?.('.atlas-funnest-source-table,.atlas-funnest-context-menu,button,a,input,select,textarea,summary,[contenteditable="true"]'));
export function volumeAxisLabelWidth(values: readonly (number | null)[]) {
  const maximum = values.reduce<number>((largest, value) => typeof value === 'number' && Number.isFinite(value) ? Math.max(largest, Math.abs(value)) : largest, 0);
  return Math.max(72, Math.ceil((fmt(maximum).length + 1) * 6.2 + 12));
}
export function pointLabelWidth(label: string) {
  return [...label].reduce((total, character) => total + ((character.codePointAt(0) ?? 0) > 0x2fff ? 11 : 6), 0);
}

/** Horizontal plot space occupied by the compact legend button in narrow chart frames. */
export function compactLegendLabelRange(svgWidth: number): readonly [number, number] | null {
  if (!Number.isFinite(svgWidth) || svgWidth > 500) return null;
  return [Math.max(0, svgWidth - 148), Math.max(0, svgWidth - 80)];
}

function labelBoundsX(x: number, label: string, position: 'top' | 'right') {
  const width = pointLabelWidth(label);
  const left = position === 'right' ? x + 10 : x - width / 2;
  return [left, position === 'right' ? left + width : x + width / 2] as const;
}

function labelOverlapsCompactLegend(x: number, label: string, svgWidth: number, position: 'top' | 'right') {
  const range = compactLegendLabelRange(svgWidth);
  if (!range) return false;
  const [left, right] = labelBoundsX(x, label, position);
  return left < range[1] && range[0] < right;
}

export function edgeSafePointLabelPosition(index: number, label: string, svgWidth: number, dataCount: number, plotLeft: number, plotRight: number, banded = false): 'top' | 'right' {
  const availableWidth = Math.max(1, svgWidth - plotLeft - plotRight);
  const fraction = dataCount <= 1 ? 0.5 : banded ? (index + 0.5) / dataCount : index / (dataCount - 1);
  const x = plotLeft + Math.max(0, Math.min(1, fraction)) * availableWidth;
  return x < pointLabelWidth(label) / 2 + 4 ? 'right' : 'top';
}

export function rsiCrossingMarkerKey(row: RsiCrossing): string {
  return `${row.date}:${row.side}:${row.level}`;
}

/** Keep every crossing point, but label only a viewport-spaced subset around the selected date. */
export function sparseRsiCrossingLabelKeys(
  crossings: readonly RsiCrossing[], dates: readonly string[], selectedDate: string,
  svgWidth: number, plotLeft: number, plotRight: number, banded = false, minimumSpacing = 136,
): Set<string> {
  const dateIndex = new Map(dates.map((date, index) => [date, index]));
  const spacing = Number.isFinite(minimumSpacing) ? Math.max(1, minimumSpacing) : 136;
  const left = Number.isFinite(plotLeft) ? plotLeft : 0;
  const width = Number.isFinite(svgWidth) ? Math.max(0, svgWidth) : 0;
  const right = Number.isFinite(plotRight) ? Math.max(0, plotRight) : 0;
  const plotWidth = Math.max(0, width - left - right);
  const candidates = crossings.flatMap(row => {
    const index = dateIndex.get(row.date);
    if (index === undefined) return [];
    const fraction = dates.length <= 1 ? 0.5 : banded ? (index + 0.5) / dates.length : index / (dates.length - 1);
    const x = left + fraction * plotWidth, label = `${row.side} ${row.level}`;
    const position = edgeSafePointLabelPosition(index, label, width, dates.length, left, right, banded);
    if (labelOverlapsCompactLegend(x, label, width, position)) return [];
    return [{ row, index, key: rsiCrossingMarkerKey(row), x }];
  });
  if (!candidates.length) return new Set();
  const targetIndex = dateIndex.get(selectedDate) ?? Math.max(0, dates.length - 1);
  const anchor = candidates.reduce((best, candidate) => {
    const distance = Math.abs(candidate.index - targetIndex), bestDistance = Math.abs(best.index - targetIndex);
    return distance < bestDistance || distance === bestDistance && candidate.index > best.index ? candidate : best;
  });
  const chosen = [anchor];
  const labelBudget = Math.max(1, Math.min(candidates.length, Math.ceil(plotWidth / spacing)));
  while (chosen.length < labelBudget) {
    const chosenSides = new Set(chosen.map(candidate => candidate.row.side));
    let best: typeof candidates[number] | undefined, bestAddsSide = -1, bestDistance = -1;
    for (const candidate of candidates) {
      if (chosen.some(item => item.key === candidate.key)) continue;
      const distance = Math.min(...chosen.map(item => Math.abs(item.x - candidate.x)));
      if (distance < spacing) continue;
      const addsSide = chosenSides.has(candidate.row.side) ? 0 : 1;
      if (addsSide > bestAddsSide || addsSide === bestAddsSide && distance > bestDistance ||
          addsSide === bestAddsSide && distance === bestDistance && candidate.index < (best?.index ?? Infinity)) {
        best = candidate; bestAddsSide = addsSide; bestDistance = distance;
      }
    }
    if (!best) break;
    chosen.push(best);
  }
  return new Set(chosen.map(candidate => candidate.key));
}

/** Hide only the decorative selected-point annotation when it would overlap signal text or the compact legend. */
export function selectedPointLabelNeedsSuppression(
  crossings: readonly RsiCrossing[], labelKeys: ReadonlySet<string>, dates: readonly string[], selectedDate: string,
  svgWidth: number, plotLeft: number, plotRight: number, banded = false,
): boolean {
  const dateIndex = new Map(dates.map((date, index) => [date, index]));
  const selectedIndex = dateIndex.get(selectedDate);
  if (selectedIndex === undefined) return false;
  const plotWidth = Math.max(0, (Number.isFinite(svgWidth) ? svgWidth : 0) - Math.max(0, plotLeft) - Math.max(0, plotRight));
  const xAt = (index: number) => plotLeft + (dates.length <= 1 ? 0.5 : banded ? (index + 0.5) / dates.length : index / (dates.length - 1)) * plotWidth;
  const selectedLabel = `${selectedDate} · 선택`, selectedX = xAt(selectedIndex);
  if (labelOverlapsCompactLegend(selectedX, selectedLabel, svgWidth, 'top')) return true;
  const selectedWidth = pointLabelWidth(selectedLabel);
  return crossings.some(row => {
    const index = dateIndex.get(row.date);
    if (index === undefined || !labelKeys.has(rsiCrossingMarkerKey(row))) return false;
    const signalWidth = pointLabelWidth(`${row.side} ${row.level}`);
    return Math.abs(xAt(index) - selectedX) < (selectedWidth + signalWidth) / 2 + 12;
  });
}
const statusColor = (state?: string) => state === 'above' ? 'var(--housing-above,var(--green))' : state === 'below' ? 'var(--housing-below,var(--red))' : 'var(--housing-neutral,var(--muted))';
function boundedWindow(start: number, end: number, timeline: readonly string[]) {
  const min = Date.parse(`${timeline[0]}T00:00:00Z`), max = Date.parse(`${timeline.at(-1)}T00:00:00Z`);
  if (!Number.isFinite(min) || !Number.isFinite(max) || max <= min || end <= start) return null;
  const span = Math.min(end - start, max - min); start = Math.max(min, Math.min(max - span, start)); end = start + span;
  return { start: new Date(start).toISOString().slice(0, 10), end: new Date(end).toISOString().slice(0, 10) };
}

/** Funnest SVG chart components render the source slots directly; no synthetic candle values. */
export function FunnestInstrumentPlot(props: Props) {
  const { symbol, unit, prices, bars, rows, view, active, onPick, onHover, hover, onView, onStart, onEnd, chartHeight, chartWidth, menuPulse = 0, onMarker, series, markers = [], crossings = [], volumeUnit = '', description = '', svgRef, nativePricePane, onPlotGeometry } = props;
  const host = useRef<HTMLDivElement>(null), current = useRef<number | null>(null);
  const [index, setIndex] = useState<number | null>(null), [menuOpen, setMenuOpen] = useState(false), currentPanel = useRef<Pick['panel']>('price');
  const timeline = series?.timeline ?? prices.map(point => point[0]);
  const low = timeline.findIndex(stamp => stamp >= view.start), high = timeline.findLastIndex(stamp => stamp <= view.end);
  const from = low < 0 ? 0 : low, to = high < from ? timeline.length - 1 : high;
  const dates = timeline.slice(from, to + 1);
  const priceByDate = useMemo(() => new Map(prices.map(([stamp, value]) => [stamp, value])), [prices]);
  const barByDate = useMemo(() => new Map(bars.map(bar => [bar[0], bar])), [bars]);
  const volumeByDate = useMemo(() => new Map((series?.volumes ?? []).map(row => [row.date, row])), [series?.volumes]);
  const rowByDate = useMemo(() => new Map(rows.map(row => [row.date, row])), [rows]);
  const candleData = dates.map(stamp => {
    const bar = barByDate.get(stamp);
    return bar ? { open: bar[1], high: bar[2], low: bar[3], close: bar[4], ...(bar[5] === null ? {} : { volume: bar[5] }) } : null;
  });
  const priceData = dates.map(stamp => { const value = priceByDate.get(stamp); return typeof value === 'number' && Number.isFinite(value) ? value : null; });
  const volumes = dates.map(stamp => { const value = volumeByDate.get(stamp)?.value ?? barByDate.get(stamp)?.[5] ?? null; return typeof value === 'number' && Number.isFinite(value) ? value : null; });
  const averages = dates.map(stamp => { const value = volumeByDate.get(stamp)?.average; return typeof value === 'number' && Number.isFinite(value) ? value : null; });
  const hasVolume = view.showVolume && volumes.some(value => value !== null);
  const hasAverage = hasVolume && averages.some(value => value !== null);
  const volumeAxisWidth = volumeAxisLabelWidth([...volumes, ...averages]);
  const volumeScale = instrumentVolumeScale(volumes, averages, nativePricePane ? nativePricePane.bottom - nativePricePane.top : Math.max(1, chartHeight - (view.showRsi ? 120 : 0) - 78), Boolean(series));
  const selectedIndex = index ?? Math.max(0, Math.min(dates.length - 1, dates.indexOf(view.selected) >= 0 ? dates.indexOf(view.selected) : dates.length - 1));
  const selectedDate = dates[selectedIndex] ?? view.selected;
  const markersAt = markers.flatMap(marker => {
    if (marker.date < view.start || marker.date > view.end || !dates.length) return [];
    let at = dates.indexOf(marker.date);
    if (at < 0) {
      const target = Date.parse(`${marker.date}T00:00:00Z`);
      at = dates.reduce((best, stamp, i) => Math.abs(Date.parse(`${stamp}T00:00:00Z`) - target) < Math.abs(Date.parse(`${dates[best]}T00:00:00Z`) - target) ? i : best, 0);
    }
    const value = priceData[at];
    return value == null ? [] : [{ ...marker, at, value }];
  });
  const visibleCrossings = view.showCrossings ? crossings.filter(row => dates.includes(row.date)) : [];
  const crossingPlotLeft = nativePricePane?.left ?? 12 + (hasVolume ? volumeAxisWidth : 0);
  const crossingPlotRight = Math.max(0, chartWidth - (nativePricePane?.right ?? chartWidth - 68));
  const crossingBanded = hasVolume || bars.length > 0 && view.chartType === 'candles';
  const crossingLabelKeys = sparseRsiCrossingLabelKeys(visibleCrossings, dates, selectedDate, chartWidth,
    crossingPlotLeft, crossingPlotRight, crossingBanded);
  const selectedLabelConflict = selectedPointLabelNeedsSuppression(visibleCrossings, crossingLabelKeys, dates, selectedDate,
    chartWidth, crossingPlotLeft, crossingPlotRight, crossingBanded) || markersAt.some(marker => marker.at === selectedIndex);
  const selectedLabelPosition = edgeSafePointLabelPosition(selectedIndex, `${selectedDate} · 선택`, chartWidth, dates.length,
    crossingPlotLeft, crossingPlotRight, crossingBanded);
  const dateTickSpacing = chartWidth <= 500 ? 105 : 120;
  const plotHeight = Math.max(180, chartHeight - (view.showRsi ? 120 : 0));
  const priceDomain = view.domain ? { min: view.inverted ? view.domain.max : view.domain.min, max: view.inverted ? view.domain.min : view.domain.max } : undefined;
  const priceAxis = { id: 'price', includeZero: false, nice: view.autoScale, scaleType: view.scale, ...(priceDomain ? { domain: priceDomain } : {}) } as const;
  useEffect(() => {
    const node = host.current?.querySelector('svg') ?? null;
    (svgRef as { current: SVGSVGElement | null }).current = node;
    if (node) {
      node.dataset.start = view.start; node.dataset.end = view.end;
      node.dataset.priceMode = view.autoScale ? 'auto' : 'manual';
      node.setAttribute('aria-label', `${description || `${symbol} 가격 차트`} · ${unit} · ${view.start} ~ ${view.end}`);
    }
    return () => { (svgRef as { current: SVGSVGElement | null }).current = null; };
  }, [svgRef, dates.length, view.chartType, view.start, view.end, view.autoScale, description, symbol, unit, chartWidth, chartHeight, hasVolume, volumeAxisWidth]);
  useEffect(() => { if (menuPulse > 0) setMenuOpen(true); }, [menuPulse]);
  const drag = useRef<{ x: number; start: string; end: string; width: number } | null>(null);
  useEffect(() => {
    const win = host.current?.ownerDocument.defaultView;
    if (!win) return;
    const move = (event: PointerEvent) => {
      const state = drag.current;
      if (!state) return;
      const elapsed = Date.parse(state.end) - Date.parse(state.start);
      const shift = -(event.clientX - state.x) / Math.max(1, state.width) * elapsed;
      const next = boundedWindow(Date.parse(state.start) + shift, Date.parse(state.end) + shift, timeline);
      if (next) onView({ ...view, ...next });
    };
    const up = () => { if (drag.current) { drag.current = null; onEnd(); } };
    win.addEventListener('pointermove', move as EventListener); win.addEventListener('pointerup', up as EventListener); win.addEventListener('pointercancel', up as EventListener);
    return () => { win.removeEventListener('pointermove', move as EventListener); win.removeEventListener('pointerup', up as EventListener); win.removeEventListener('pointercancel', up as EventListener); };
  }, [view, onView, onEnd]);
  useEffect(() => { current.current = null; setIndex(null); onHover(null); }, [view.selected, view.start, view.end]);
  const updateIndex = (next: number | null, panel: Pick['panel'] = 'price') => {
    if (current.current === next && currentPanel.current === panel) return;
    current.current = next; currentPanel.current = panel;
    queueMicrotask(() => {
      setIndex(next);
      if (next === null) { onHover(null); return; }
      const stamp = dates[next];
      if (!stamp) return;
      const value = panel === 'rsi' ? rowByDate.get(stamp)?.rsi : priceByDate.get(stamp);
      if (typeof value === 'number' && Number.isFinite(value)) onHover({ date: stamp, value, panel });
      else onHover(null);
    });
  }
  const choose = (at = current.current ?? selectedIndex, panel: Pick['panel'] = 'price') => {
    const stamp = dates[at]; if (!stamp) return;
    const p = priceByDate.get(stamp), r = rowByDate.get(stamp);
    const value = panel === 'rsi' ? r?.rsi : p;
    if (typeof value !== 'number' || !Number.isFinite(value)) return;
    const pick: Pick = { date: stamp, value, panel };
    if (view.tool === 'measure') {
      const anchor = { ...pick }, measurement = view.measurement.length === 1 && view.measurement[0].panel === panel ? [view.measurement[0], anchor] : [anchor];
      onView({ ...view, measurement });
    } else onPick(pick);
  };
  return <div ref={host} className="atlas-funnest-instrument-plot" data-chart-engine="funnest" data-symbol={symbol} data-range-start={view.start} data-range-end={view.end}
    role="group" aria-label={`${description || `${symbol} 가격 차트`} · ${view.start}부터 ${view.end}`}
    onWheel={event => { if (isPlotControlTarget(event.target)) return; event.preventDefault(); const first = Date.parse(view.start), last = Date.parse(view.end), duration = last - first; if (!Number.isFinite(duration) || duration <= 0) return; const rect = event.currentTarget.getBoundingClientRect(); const factor = event.deltaY < 0 ? 0.82 : 1.22; const anchor = Math.max(0, Math.min(1, (event.clientX - rect.left) / Math.max(1, rect.width))); const nextDuration = Math.max(86400000, duration * factor); const point = first + duration * anchor; const next = boundedWindow(point - nextDuration * anchor, point + nextDuration * (1-anchor), timeline); if (!next) return; onStart(); onView({ ...view, ...next }); onEnd(); }}
    onPointerDown={event => { if (isPlotControlTarget(event.target) || !active || view.tool !== 'pan' || event.button !== 0) return; const rect = event.currentTarget.getBoundingClientRect(); drag.current = { x: event.clientX, start: view.start, end: view.end, width: rect.width }; onStart(); }}
    onClick={event => { if (isPlotControlTarget(event.target)) return; choose(current.current ?? selectedIndex, (event.target as Element).closest('[data-panel="rsi"]') ? 'rsi' : 'price'); }}
    onContextMenu={event => { if (isPlotControlTarget(event.target)) return; event.preventDefault(); setMenuOpen(true); }}
    onKeyDown={event => { if (isPlotControlTarget(event.target)) return; if (event.key === 'Escape' && menuOpen) { event.preventDefault(); setMenuOpen(false); } else if (event.key === 'Enter' && !(event.target as Element).closest('button,a,input,select,textarea,summary,[contenteditable="true"]')) { event.preventDefault(); choose(); } }}>
    <div className="atlas-funnest-axis-unit" aria-label={`가격 단위 ${unit}`}>{unit}</div>
    {bars.length > 0 && view.chartType === 'candles' ? <CartesianChart width={chartWidth} series={[
      { id: 'price', label: '관측 OHLC', data: candleData.map(bar => bar ? [bar.low, bar.high] as const : null), yAxisId: 'price', color: 'var(--chart-candle-up)' },
      ...(hasVolume ? [{ id: 'volume', label: `거래량 (${volumeUnit || '단위 미제공'})`, data: volumes, yAxisId: 'volume', color: 'var(--muted)' }] : []),
    ]} xAxis={{ data: dates, scaleType: 'band', bandPadding: 0.2 }} yAxis={[priceAxis, ...(hasVolume ? [{ id: 'volume', domain: volumeScale.domain, nice: false }] : [])]} height={plotHeight} inset={{ left: 12, right: 0, top: 20, bottom: 30 }} enableScrubbing onScrubberPositionChange={updateIndex}
      getScrubberAccessibilityLabel={(i: number) => { const bar = candleData[i]; return bar ? `${dates[i]} · 시가 ${fmt(bar.open)} · 고가 ${fmt(bar.high)} · 저가 ${fmt(bar.low)} · 종가 ${fmt(bar.close)} ${unit} · 거래량 ${bar.volume == null ? '미공표' : `${fmt(bar.volume)} ${volumeUnit}`}` : `${dates[i]} · 관측값 없음`; }} aria-label={`${symbol} 실제 OHLC ${unit}`}>
      <NativePricePaneLayout host={host} onLayout={onPlotGeometry}/><XAxis minTickSpacing={dateTickSpacing} tickLabelFormatter={dateLabel} showGrid/><YAxis axisId="price" width={68} tickLabelFormatter={fmt}/>
      {hasVolume && <YAxis axisId="volume" position="left" width={volumeAxisWidth} ticks={volumeScale.ticks} tickLabelFormatter={fmt} showGrid={false}/>}
      {hasVolume && <BarPlot seriesIds={['volume']} radius={0} highlightScrubbed={false} getBarColor={(_value: number, i: number) => statusColor(volumeByDate.get(dates[i])?.state)}/>}
      <CandlePlot data={candleData} yAxisId="price" upColor="var(--chart-candle-up)" downColor="var(--chart-candle-down)" tooltip={false} valueFormatter={fmt}/>
      <FunnestInstrumentMarkers markers={markersAt} active={active} onMarker={onMarker}/>
      {visibleCrossings.map(row => { const index = dates.indexOf(row.date), label = `${row.side} ${row.level}`, key = rsiCrossingMarkerKey(row); return <ChartPoint key={key} dataX={index} dataY={priceByDate.get(row.date) ?? undefined} color={row.side === 'Buy' ? 'var(--green)' : 'var(--red)'} label={crossingLabelKeys.has(key) ? label : undefined} labelPosition={edgeSafePointLabelPosition(index, label, chartWidth, dates.length, crossingPlotLeft, crossingPlotRight, hasVolume || bars.length > 0 && view.chartType === 'candles')}/>; }) }
      {priceData[selectedIndex] != null && <ChartPoint dataX={selectedIndex} dataY={priceData[selectedIndex]!} color="var(--accent)" label={selectedLabelConflict ? undefined : `${dates[selectedIndex]} · 선택`} labelPosition={selectedLabelPosition} />}
      <Scrubber dimFuture={false} showValues valueFormatter={fmt} label={dateLabel}/>
    </CartesianChart> : <CartesianChart width={chartWidth} series={[
      { id: 'price', label: series?.frequency === 'monthly' ? '월별 가격지수' : '관측 종가', data: priceData, color: 'var(--data-gold)' },
      ...(hasVolume ? [{ id: 'volume', label: `거래량 (${volumeUnit || '단위 미제공'})`, data: volumes, yAxisId: 'volume', color: 'var(--muted)' }] : []),
      ...(hasAverage ? [{ id: 'volume-average', label: '과거 평균 거래량', data: averages, yAxisId: 'volume', color: 'var(--text)', lineStyle: 'dashed' as const }] : []),
    ]} xAxis={{ data: dates, scaleType: hasVolume ? 'band' : 'linear', bandPadding: 0.2 }} yAxis={[priceAxis, ...(hasVolume ? [{ id: 'volume', domain: volumeScale.domain, nice: false }] : [])]} height={plotHeight} inset={{ left: 12, right: 0, top: 20, bottom: 30 }} enableScrubbing onScrubberPositionChange={updateIndex}
      getScrubberAccessibilityLabel={(i: number) => `${dates[i] ?? ''} · ${priceData[i] == null ? '관측값 없음' : `${fmt(priceData[i]!)} ${unit}`} · 거래량 ${volumes[i] == null ? '미공표' : `${fmt(volumes[i]!)} ${volumeUnit}`}`} aria-label={`${symbol} 관측 종가 ${unit}`}>
      <NativePricePaneLayout host={host} onLayout={onPlotGeometry}/><XAxis minTickSpacing={dateTickSpacing} tickLabelFormatter={dateLabel} showGrid/><YAxis axisId="price" width={68} tickLabelFormatter={fmt}/>
      {hasVolume && <YAxis axisId="volume" position="left" width={volumeAxisWidth} ticks={volumeScale.ticks} tickLabelFormatter={fmt} showGrid={false}/>}
      {hasVolume && <BarPlot seriesIds={['volume']} radius={0} highlightScrubbed={false} getBarColor={(_value: number, i: number) => statusColor(volumeByDate.get(dates[i])?.state)}/>}
      <Line seriesId="price" curve="linear" strokeWidth={2}/>{hasAverage && <Line seriesId="volume-average" curve="linear" strokeWidth={1.2}/>}
      <FunnestInstrumentMarkers markers={markersAt} active={active} onMarker={onMarker}/>
      {visibleCrossings.map(row => { const index = dates.indexOf(row.date), label = `${row.side} ${row.level}`, key = rsiCrossingMarkerKey(row); return <ChartPoint key={key} dataX={index} dataY={priceByDate.get(row.date) ?? undefined} color={row.side === 'Buy' ? 'var(--green)' : 'var(--red)'} label={crossingLabelKeys.has(key) ? label : undefined} labelPosition={edgeSafePointLabelPosition(index, label, chartWidth, dates.length, crossingPlotLeft, crossingPlotRight, hasVolume || bars.length > 0 && view.chartType === 'candles')}/>; }) }
      {priceData[selectedIndex] != null && <ChartPoint dataX={selectedIndex} dataY={priceData[selectedIndex]!} color="var(--accent)" label={selectedLabelConflict ? undefined : `${dates[selectedIndex]} · 선택`} labelPosition={selectedLabelPosition} />}
      {view.measurement.filter(anchor => anchor.panel === 'price').map((anchor,i) => <ChartPoint key={`measure${i}`} dataX={dates.indexOf(anchor.date)} dataY={anchor.value} color="var(--text)" label={`측정 ${i+1}`}/>)}
      <Scrubber dimFuture={false} showValues valueFormatter={fmt} label={dateLabel}/>
    </CartesianChart>}
    {view.showRsi && rows.length > 0 && <div className="atlas-funnest-rsi" data-panel="rsi"><CartesianChart width={chartWidth} series={[
      { id: 'rsi', label: 'RSI14', data: dates.map(stamp => rowByDate.get(stamp)?.rsi ?? null), color: 'var(--ml-beta)' },
      ...(view.showSignal ? [{ id: 'signal', label: 'SMA9', data: dates.map(stamp => rowByDate.get(stamp)?.signal ?? null), color: 'var(--ml-gamma)' }] : []),
    ]} xAxis={{ data: dates, scaleType: 'linear' }} yAxis={{ domain: { min: 0, max: 100 } }} height={120} inset={{ left: 12, right: 0, top: 12, bottom: 28 }} enableScrubbing onScrubberPositionChange={(index: number | null) => updateIndex(index,'rsi')} aria-label={`${symbol} RSI14 보조 차트`}>
      <XAxis minTickSpacing={dateTickSpacing} tickLabelFormatter={dateLabel}/><YAxis width={68} ticks={[0,25,50,75,100]}/>
      {view.showLevels && [29.5,33.5,40,43].map(level => <ReferenceLine key={level} dataY={level} color="var(--subtle)" dash="3 4"/>)}
      <Line seriesId="rsi" curve="linear" strokeWidth={1.5}/>{view.showSignal && <Line seriesId="signal" curve="linear" strokeWidth={1.2}/>}
      {view.measurement.filter(anchor => anchor.panel === 'rsi').map((anchor,i) => <ChartPoint key={`rsi-measure${i}`} dataX={dates.indexOf(anchor.date)} dataY={anchor.value} color="var(--text)" label={`측정 ${i+1}`}/>)}
      <Scrubber dimFuture={false} label={dateLabel}/>
    </CartesianChart></div>}
    {view.measurement.length > 0 && <div className="atlas-funnest-measurement" role="status">{view.measurement.length === 1 ? `측정 시작 · ${view.measurement[0].date} · ${fmt(view.measurement[0].value)} ${view.measurement[0].panel === 'rsi' ? 'RSI pt' : unit}` : (() => { const [a,b] = view.measurement; const days = Math.abs(Date.parse(`${b.date}T00:00:00Z`) - Date.parse(`${a.date}T00:00:00Z`)) / 86400000; const delta=b.value-a.value; return `${a.date} → ${b.date} · 변화 ${fmt(delta)} ${a.panel === 'rsi' ? 'RSI pt' : unit}${a.value ? ` (${((delta/a.value)*100).toFixed(2)}%)` : ''} · ${days}일`; })()}</div>}
    {menuOpen && <div className="atlas-funnest-context-menu" role="menu" aria-label="차트 메뉴"><button type="button" role="menuitem" onClick={() => { onView({ ...view, start: timeline[0] ?? view.start, end: timeline.at(-1) ?? view.end, autoScale: true, domain: null }); setMenuOpen(false); }}>전체 기간</button>{(['crosshair','pan','measure'] as const).map(tool => <button key={tool} type="button" role="menuitemradio" aria-checked={view.tool===tool} onClick={() => { onView({ ...view, tool }); setMenuOpen(false); }}>{tool==='crosshair'?'십자선':tool==='pan'?'이동':'두 점 측정'}</button>)}<button type="button" role="menuitem" onClick={() => setMenuOpen(false)}>닫기</button></div>}
    <details className="atlas-funnest-source-table"><summary>차트 원자료 표 · {dates.length}행</summary><div className="atlas-funnest-source-body">{markersAt.length > 0 && <ul className="atlas-funnest-marker-list" aria-label="차트 근거·판정 표식">{markersAt.map(marker => <li key={marker.id}><button type="button" onClick={() => { marker.onSelect(); onMarker?.(); }} aria-pressed={marker.selected}>{marker.date} · {marker.kind === 'judgment' ? '판정' : '근거'} · {marker.title}</button></li>)}</ul>}<div className="atlas-funnest-table-scroll"><table><caption>{symbol} · {unit} · 날짜별 관측 원자료</caption><thead><tr><th scope="col">날짜</th><th scope="col">종가 / 지수 ({unit})</th>{bars.length > 0 && <><th scope="col">시가</th><th scope="col">고가</th><th scope="col">저가</th></>}{view.showVolume && <><th scope="col">거래량 ({volumeUnit})</th>{hasAverage && <th scope="col">과거 평균 ({volumeUnit})</th>}{series?.frequency === 'monthly' && <th scope="col">평균 대비 상태</th>}</>}{view.showRsi && <th scope="col">RSI14</th>}</tr></thead><tbody>{dates.map((stamp, i) => { const bar = barByDate.get(stamp), row = rowByDate.get(stamp); return <tr key={`${stamp}:${i}`}><th scope="row">{stamp}</th><td>{priceData[i] === null ? '관측값 없음' : fmt(priceData[i]!)}</td>{bars.length > 0 && <><td>{bar ? fmt(bar[1]) : '관측값 없음'}</td><td>{bar ? fmt(bar[2]) : '관측값 없음'}</td><td>{bar ? fmt(bar[3]) : '관측값 없음'}</td></>}{view.showVolume && <><td>{volumes[i] === null ? '미공표' : fmt(volumes[i]!)}</td>{hasAverage && <td>{averages[i] === null ? '산정 전' : fmt(averages[i]!)}</td>}{series?.frequency === 'monthly' && <td>{volumeByDate.get(stamp)?.state ?? '상태 없음'}</td>}</>}{view.showRsi && <td>{row?.rsi == null ? '산출 불가' : fmt(row.rsi)}</td>}</tr>; })}</tbody></table></div></div></details>
    <span className="atlas-sr-only" aria-live="polite">{selectedDate} · {priceByDate.get(selectedDate) == null ? '관측값 없음' : `${fmt(priceByDate.get(selectedDate)!)} ${unit}`}</span>
  </div>;
}
