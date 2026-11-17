import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { HorizontalBarChart, CartesianChart, Line, Scrubber, XAxis, YAxis } from '@funnest/charts-react';
import { axes, Empty, finite, fmt } from './common.js';
import { CompactToolbar, CompactToolbarMenu } from './compact-toolbar.js';

const chartTitleStyle = { fontSize: 14, fontWeight: 600, letterSpacing: 0 } as const;
const observedNumber = (value: number) => fmt(value, 2);
const contributionNumber = (value: number) => fmt(value, 3);
const dateText = (value: string | number | undefined) => String(value ?? '').slice(0, 10);

export function ResearchChartCard({ title, actions, children, className = '' }: {
  title: ReactNode; actions?: ReactNode; children: ReactNode; className?: string;
}) {
  return <section className={`ml-ztd-card ${className}`} aria-label={typeof title === 'string' ? title : '시장 분석 차트'}>
    <header className="ml-chart-card-header"><strong style={chartTitleStyle}>{title}</strong>{actions}</header>{children}
  </section>;
}

type Observation = readonly [string, number | null];
interface ObservedDatum { date: string; value: number; segment: string; segmentIndex: number; sourceIndex: number }

/** Retain source-index accounting for callers/tests; Funnest gets the original positional array. */
export function observedChartModel(points: readonly Observation[]) {
  let segment = 0, validCount = 0;
  const indexByDate = new Map<string, number>(), runLengths = new Map<number, number>();
  const data: ObservedDatum[] = points.map(([date, value], sourceIndex) => {
    if (sourceIndex > 0 && finite(value) && !finite(points[sourceIndex - 1][1])) segment++;
    if (finite(value)) { validCount++; runLengths.set(segment, (runLengths.get(segment) ?? 0) + 1); }
    indexByDate.set(date, sourceIndex);
    return { date, value: finite(value) ? value : NaN, segment: `관측 ${segment + 1}`, segmentIndex: segment, sourceIndex };
  });
  const isolatedSegments = new Set([...runLengths].filter(([, count]) => count === 1).map(([id]) => id));
  const isolatedIndices = new Set(data.filter(row => finite(row.value) && isolatedSegments.has(row.segmentIndex)).map(row => row.sourceIndex));
  return { data, indexByDate, validCount, isolatedIndices, hasIsolatedObservation: isolatedSegments.size > 0 };
}

/** Show point glyphs only while their 8px footprint can fit; preserve singleton runs in dense data. */
export function observedPointMarkers(model: Pick<ReturnType<typeof observedChartModel>, 'validCount' | 'isolatedIndices'>, plotWidth: number) {
  const capacity = Math.max(1, Math.floor(Math.max(1, plotWidth) / 8));
  if (model.validCount <= capacity) return true;
  return (index: number) => model.isolatedIndices.has(index);
}

export function ObservedResearchChart({ id, points, unit, label, selected, onSelect, compactToolbar = false, fit = false }: {
  id: string; points: readonly Observation[]; unit: string; label: string;
  selected: number | null; onSelect: (sourceIndex: number) => void; compactToolbar?: boolean; fit?: boolean;
}) {
  const model = useMemo(() => observedChartModel(points), [points]);
  const figure = useRef<HTMLElement>(null), plotSlot = useRef<HTMLDivElement>(null), scrubIndex = useRef<number | null>(null), lastScrub = useRef<number | null>(null);
  const [plotHeight, setPlotHeight] = useState(290), [plotWidth, setPlotWidth] = useState(640), [current, setCurrent] = useState<number | null>(null);
  useEffect(() => { lastScrub.current = null; scrubIndex.current = null; setCurrent(null); }, [points, selected]);
  useEffect(() => {
    const node = figure.current;
    if (!node) return;
    const slot = plotSlot.current;
    if (!slot) return;
    // Observe the allocated slot, never the figure that contains the SVG. Measuring
    // the figure height made its own SVG feed back into the next SVG height.
    const measure = () => {
      const bounds = slot.getBoundingClientRect();
      if (bounds.width > 0) setPlotWidth(previous => { const next = Math.max(1, Math.round(bounds.width)); return previous === next ? previous : next; });
      if ((compactToolbar || fit) && bounds.height > 0) setPlotHeight(previous => { const next = Math.max(compactToolbar ? 180 : 96, Math.round(bounds.height)); return previous === next ? previous : next; });
    };
    measure();
    if (typeof ResizeObserver !== 'undefined') { const observer = new ResizeObserver(measure); observer.observe(slot); return () => observer.disconnect(); }
    const view = node.ownerDocument.defaultView; view?.addEventListener('resize', measure); return () => view?.removeEventListener('resize', measure);
  }, [compactToolbar, fit, model.validCount]);
  if (!model.validCount) return <div data-chart={id} className="atlas-funnest-observed-chart"><Empty>{label}에 유효한 수치가 없습니다.</Empty></div>;
  const index = selected == null || !Number.isFinite(selected) ? points.length - 1 : Math.max(0, Math.min(points.length - 1, Math.trunc(selected)));
  const activeIndex = current ?? index, [date, value] = points[activeIndex];
  const readout = `${date} · ${finite(value) ? `${fmt(value)} ${unit}` : `관측값 없음 ${unit}`}`;
  const selectEvent = (sourceIndex: number | null) => { if (lastScrub.current === sourceIndex) return; lastScrub.current = sourceIndex; scrubIndex.current = sourceIndex; queueMicrotask(() => setCurrent(sourceIndex)); };
  const pointMarkers = observedPointMarkers(model, plotWidth);
  const dateControl = <label className={compactToolbar ? 'compact-toolbar-field' : 'ml-date-selector'}>관측일 선택 <input type="range" min="0" max={points.length - 1} step="1" value={index} data-date={id}
    aria-label={`${label} 관측일`} aria-valuetext={`${date}, ${finite(value) ? `${fmt(value)} ${unit}` : `관측값 없음 ${unit}`}`} disabled={points.length === 1} onChange={event => onSelect(Number(event.currentTarget.value))}/></label>;
  return <div data-chart={id} data-chart-engine="funnest" data-source-count={points.length} className="atlas-funnest-observed-chart" onKeyDownCapture={event => { if ((event.target as Element).closest('input')) return; const step = event.shiftKey ? 10 : 1; const base = index; let next: number | null = null; if (event.key === 'Home') next = 0; else if (event.key === 'End') next = points.length - 1; else if (event.key === 'ArrowLeft') next = Math.max(0, base - step); else if (event.key === 'ArrowRight') next = Math.min(points.length - 1, base + step); else if (event.key === 'Escape') next = null; if (next !== null) { event.preventDefault(); scrubIndex.current = next; lastScrub.current = next; setCurrent(next); onSelect(next); } }}>
    {compactToolbar && <CompactToolbar label="선택 관측" order={20}><span className="compact-toolbar-summary" data-selected-date={date} data-selected-index={activeIndex}>{readout}</span><CompactToolbarMenu name="market-date" label="관측일" title={`${label} 관측일 선택`}><p className="compact-toolbar-summary">{readout}</p>{dateControl}</CompactToolbarMenu></CompactToolbar>}
    <figure ref={figure} className={`ml-chart${compactToolbar || fit ? ' ml-viewport-chart' : ''}`} onClick={event => { if ((event.target as Element).closest('button,a,input,summary')) return; const at = scrubIndex.current ?? index; if (at >= 0 && at < points.length) onSelect(at); }}>
      {compactToolbar ? <figcaption className="atlas-sr-only">{label} · {readout}</figcaption> : <figcaption className={fit ? 'ml-axis-readout' : undefined}>{fit ? null : <strong>{label}</strong>}<span data-selected-date={date} data-selected-index={activeIndex}>{readout}</span></figcaption>}
      <div ref={plotSlot} className={compactToolbar || fit ? 'atlas-funnest-observed-plot-slot' : undefined}>
          <CartesianChart series={[{ id: 'observed', label, data: points.map(([, amount]) => finite(amount) ? amount : null), color: 'var(--data-gold)' }]}
            xAxis={{ data: points.map(point => point[0]), scaleType: 'linear' }} height={plotHeight} inset={{ left: 64, right: 20, top: 20, bottom: 36 }} enableScrubbing animate={false}
            onScrubberPositionChange={selectEvent} aria-label={`${label} · ${model.validCount}개 관측`} getScrubberAccessibilityLabel={(i: number) => { const row = points[i]; return row ? `${row[0]} · ${finite(row[1]) ? `${fmt(row[1])} ${unit}` : `관측값 없음 ${unit}`}` : ''; }}>
            <XAxis minTickSpacing={85} tickLabelFormatter={dateText} showGrid/><YAxis width={64} tickLabelFormatter={observedNumber}/><Line seriesId="observed" curve="linear" strokeWidth={2} points={pointMarkers}/><Scrubber dimFuture={false} showValues valueFormatter={observedNumber} label={dateText}/>
          </CartesianChart>
        </div>
      <details className="atlas-funnest-source-table"><summary>관측 원자료 표 · {points.length}행</summary><div className="atlas-funnest-table-scroll"><table><caption>{label} ({unit}), 날짜별 원자료</caption><thead><tr><th scope="col">날짜</th><th scope="col">{label} ({unit})</th></tr></thead><tbody>{points.map(([stamp, amount], sourceIndex) => <tr key={`${stamp}:${sourceIndex}`}><th scope="row">{stamp}</th><td>{finite(amount) ? fmt(amount) : '관측값 없음'}</td></tr>)}</tbody></table></div></details>
      {!compactToolbar && dateControl}
    </figure>
  </div>;
}

export function ScenarioContributionChart({ contributions }: { contributions: readonly number[] }) {
  const data = axes.map(([, symbol, name], index) => ({ axis: `${symbol} ${name}`, value: contributions[index] }));
  if (data.some(row => !finite(row.value))) return null;
  return <section data-presentation-chart="scenario-contributions" data-chart-engine="funnest" className="ml-ztd-contributions atlas-funnest-contributions" style={{ marginBlock: 16 }}>
    <header><h4 style={chartTitleStyle}>축별 기여도</h4><p>기준 0 · 무차원</p></header>
    <HorizontalBarChart categories={data.map(row => row.axis)} series={[{ id: 'contribution', label: '정규화 기여도', data: data.map(row => row.value), color: 'var(--accent)' }]}
      height={184} showValueAxis showCategoryAxis enableScrubbing={false} valueFormatter={contributionNumber} aria-label="축별 정규화 기여도, 0 기준" style={{ width: '100%' }}/>
    <details className="atlas-funnest-source-table"><summary>축별 기여도 표</summary><table><caption>가정 입력의 정규화 기여도. 퍼센트나 수익률이 아님</caption><thead><tr><th scope="col">축</th><th scope="col">무차원 기여도</th></tr></thead><tbody>{data.map(row => <tr key={row.axis}><th scope="row">{row.axis}</th><td>{fmt(row.value, 3)}</td></tr>)}</tbody></table></details>
  </section>;
}
