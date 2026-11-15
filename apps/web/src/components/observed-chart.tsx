import { useEffect, useMemo, useRef, useState } from 'react';
import type { Point } from '@atlas/contracts/market-lab';
import { BarPlot, CartesianChart, Line, Point as ChartPoint, ReferenceLine, Scrubber, XAxis, YAxis } from '@funnest/charts-react';
import { Empty, finite, fmt } from './common.js';

interface Props {
  id: string;
  points: readonly Point[];
  unit: string;
  label: string;
  caption?: string;
  selected: number | null;
  onSelect: (index: number) => void;
  lines?: readonly number[];
  rsi?: boolean;
  signal?: readonly [string, number | null][];
  markers?: readonly { date: string; side: 'Buy' | 'Sell'; level: string }[];
  plotHeight?: number;
}
const noLines: readonly number[] = [];
const noSignal: readonly [string, number | null][] = [];
const showDate = (value: string | number | undefined) => String(value ?? '').slice(0, 10);
const number = (value: number) => fmt(value, 4);

/** Funnest owns the axes, gaps, marks and keyboard scrubber; Atlas retains source-index selection. */
export function ObservedChart({ id, points, unit, label, caption, selected, onSelect, lines = noLines, rsi = false, signal = noSignal, markers = [], plotHeight = 290 }: Props) {
  const chart = useRef<HTMLDivElement>(null);
  const scrubIndex = useRef<number | null>(null);
  const [current, setCurrent] = useState<number | null>(null), lastScrub = useRef<number | null>(null);
  const valid = points.some(point => point && finite(point[1]));
  const values = useMemo(() => points.map(point => point && finite(point[1]) ? point[1] : null), [points]);
  const signalValues = useMemo(() => points.map(([date]) => {
    const value = signal.find(row => row[0] === date)?.[1];
    return finite(value) ? value : null;
  }), [points, signal]);
  const markerRows = useMemo(() => markers.flatMap(marker => {
    const index = points.findIndex(point => point[0] === marker.date);
    const value = index < 0 ? null : values[index];
    return value === null || value === undefined ? [] : [{ ...marker, index, value }];
  }), [markers, points, values]);
  useEffect(() => { lastScrub.current = null; scrubIndex.current = null; setCurrent(null); }, [selected, points]);
  if (!valid) return <div data-chart={id} className="atlas-funnest-observed-chart"><Empty>{label}에 유효한 수치가 없습니다.</Empty></div>;
  const safeSelected = selected == null || !Number.isFinite(selected) ? points.length - 1 : Math.max(0, Math.min(points.length - 1, Math.trunc(selected)));
  const readIndex = current ?? safeSelected;
  const [date, value] = points[readIndex] ?? ['', null];
  const readableValue = finite(value) ? `${fmt(value)} ${unit}` : `관측값 없음 · ${unit}`;
  const selectCurrent = () => { const at = scrubIndex.current ?? safeSelected; if (at >= 0 && at < points.length) onSelect(at); };
  return <div ref={chart} data-chart={id} data-chart-engine="funnest" data-source-count={points.length} className="atlas-funnest-observed-chart"
    onClick={event => { if ((event.target as Element).closest('button,a,input,summary')) return; selectCurrent(); }}
    onKeyDownCapture={event => { if ((event.target as Element).closest('button,input,summary,textarea,select')) return; const step=event.shiftKey?10:1; let next:number|null=null; if(event.key==='Home')next=0; else if(event.key==='End')next=points.length-1; else if(event.key==='ArrowLeft')next=Math.max(0,safeSelected-step); else if(event.key==='ArrowRight')next=Math.min(points.length-1,safeSelected+step); if(next!==null){event.preventDefault();scrubIndex.current=next;lastScrub.current=next;setCurrent(next);onSelect(next);} }}>
    <figure className="ml-chart">
      <figcaption><strong>{caption || label}</strong><span data-selected-date={date} data-selected-index={readIndex}>{date} · {readableValue}</span></figcaption>
      <CartesianChart series={[
        { id: 'observed', label, data: values, color: 'var(--data-gold)' },
        ...(rsi && signal.some(row => finite(row[1])) ? [{ id: 'signal', label: 'SMA9', data: signalValues, color: 'var(--ml-gamma)', lineStyle: 'dashed' as const }] : []),
      ]} xAxis={{ data: points.map(point => point[0]), scaleType: 'linear' }} yAxis={{ includeZero: rsi, domain: rsi ? { min: 0, max: 100 } : undefined }} height={plotHeight} inset={{ left: 64, right: 20, top: 20, bottom: 36 }}
        enableScrubbing onScrubberPositionChange={(index: number | null) => { if (lastScrub.current === index) return; lastScrub.current = index; scrubIndex.current = index; queueMicrotask(() => setCurrent(index)); }} aria-label={`${label} · ${points.length}개 원자료 행`}
        getScrubberAccessibilityLabel={(index: number) => { const row = points[index]; return row ? `${row[0]} · ${finite(row[1]) ? `${fmt(row[1])} ${unit}` : `관측값 없음 ${unit}`}` : ''; }}>
        <XAxis minTickSpacing={85} tickLabelFormatter={showDate} showGrid/>
        <YAxis width={64} tickLabelFormatter={number}/>
        <Line seriesId="observed" curve="linear" strokeWidth={2} points={true}/>
        {rsi && signal.some(row => finite(row[1])) && <Line seriesId="signal" curve="linear" strokeWidth={1.4}/>}
        {lines.map(line => <ReferenceLine key={line} dataY={line} label={String(line)} color="var(--subtle)" dash="3 4"/>) }
        {markerRows.map(marker => <ChartPoint key={`${marker.date}:${marker.side}`} dataX={marker.index} dataY={marker.value} color={marker.side === 'Buy' ? 'var(--green)' : 'var(--red)'} label={`${marker.side} ${marker.level}`} labelPosition={marker.side === 'Buy' ? 'bottom' : 'top'}/>) }
        <Scrubber dimFuture={false} showValues valueFormatter={number} label={showDate}/>
      </CartesianChart>
      <details className="atlas-funnest-source-table"><summary>관측 원자료 표 · {points.length}행</summary><div className="atlas-funnest-table-scroll"><table><caption>{label} ({unit}), 날짜별 원자료</caption><thead><tr><th scope="col">날짜</th><th scope="col">{label} ({unit})</th>{rsi && signal.length > 0 && <th scope="col">SMA9 ({unit})</th>}</tr></thead><tbody>{points.map(([stamp, amount], index) => <tr key={`${stamp}:${index}`}><th scope="row">{stamp}</th><td>{finite(amount) ? fmt(amount) : '관측값 없음'}</td>{rsi && signal.length > 0 && <td>{finite(signalValues[index]) ? fmt(signalValues[index]!) : '산출 불가'}</td>}</tr>)}</tbody></table></div></details>
      <label className="ml-date-selector">관측일 선택 <input type="range" min="0" max={points.length-1} step="1" value={safeSelected} data-date={id} aria-label={`${label} 관측일`} aria-valuetext={`${date}, ${finite(value)?`${fmt(value)} ${unit}`:`관측값 없음 ${unit}`}`} disabled={points.length===1} onChange={event=>onSelect(Number(event.currentTarget.value))}/></label>
    </figure>
  </div>;
}
