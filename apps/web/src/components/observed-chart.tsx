import { Fragment, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { Point } from '@atlas/contracts/market-lab';
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

export function ObservedChart({ id, points, unit, label, caption, selected, onSelect, lines = noLines, rsi = false, signal = noSignal, markers = [], plotHeight }: Props) {
  const container = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(640);
  useLayoutEffect(() => {
    const measure = () => setWidth(Math.max(200, Math.round(container.current?.clientWidth || 640)));
    measure();
    if (typeof ResizeObserver === 'undefined' || !container.current) return;
    const observer = new ResizeObserver(measure);
    observer.observe(container.current);
    return () => observer.disconnect();
  }, []);
  const geometry = useMemo(() => {
    const pts = points.filter(point => point && finite(point[1]));
    if (!pts.length) return null;
    const height = plotHeight ?? (rsi ? 220 : 290), pad = { l: 64, r: 20, t: 24, b: 36 };
    const values = pts.map(point => point[1]).concat(signal.filter(point => finite(point[1])).map(point => point[1] as number));
    let low = rsi ? 0 : Math.min(...values), high = rsi ? 100 : Math.max(...values);
    if (low === high) { const extra = Math.max(Math.abs(low) * 0.02, 1); low -= extra; high += extra; }
    else if (!rsi) { const extra = (high - low) * 0.1; low -= extra; high += extra; }
    if (!rsi) low = Math.max(0, low);
    const x = (index: number) => pad.l + (pts.length === 1 ? 0.5 : index / (pts.length - 1)) * (width - pad.l - pad.r);
    const y = (value: number) => pad.t + (high - value) / (high - low) * (height - pad.t - pad.b);
    const path = pts.map((point, index) => `${index ? 'L' : 'M'}${x(index).toFixed(2)},${y(point[1]).toFixed(2)}`).join(' ');
    const signalPath = signal.map((point, index) => finite(point[1])
      ? `${index && finite(signal[index - 1]?.[1]) ? 'L' : 'M'}${x(index).toFixed(2)},${y(point[1]).toFixed(2)}` : '').join(' ');
    return { pts, height, pad, low, high, x, y, path, signalPath };
  }, [points, signal, width, rsi, plotHeight]);
  if (!geometry) return <div data-chart={id} ref={container}><Empty>{label}에 유효한 수치가 없습니다.</Empty></div>;
  const { pts, height, pad, low, high, x, y, path, signalPath } = geometry;
  const index = selected == null ? pts.length - 1 : Math.max(0, Math.min(pts.length - 1, selected));
  const point = pts[index], last = pts[pts.length - 1];
  const dates = new Map(pts.map((point, index) => [point[0], index]));
  const annotations = markers.flatMap(marker => {
    const at = dates.get(marker.date);
    return at == null ? [] : [{ ...marker, px: x(at), py: y(pts[at][1]) }];
  });
  const labels = new Set<string>();
  const occupied: Record<'Buy' | 'Sell', number[]> = { Buy: [], Sell: [] };
  const priority = [...annotations.filter(marker => marker.date === point[0]), ...annotations.toReversed().filter(marker => marker.date !== point[0])];
  for (const marker of priority) {
    if (occupied[marker.side].some(px => Math.abs(px - marker.px) < 40)) continue;
    labels.add(`${marker.date}:${marker.side}`); occupied[marker.side].push(marker.px);
  }
  return <div data-chart={id} ref={container}><figure className="ml-chart">
    <figcaption><strong>{caption || label}</strong><span>{point[0]} · {fmt(point[1])} {unit}</span></figcaption>
    <svg viewBox={`0 0 ${width} ${height}`} width={width} height={height} role="img" aria-labelledby={`ml-chart-${id}-title ml-chart-${id}-desc`}
      onPointerDown={event => { if (event.button > 0) return; const bounds = event.currentTarget.getBoundingClientRect(); const fraction = (event.clientX - bounds.left) / bounds.width; onSelect(Math.max(0, Math.min(pts.length - 1, Math.round((fraction * width - pad.l) / (width - pad.l - pad.r) * (pts.length - 1))))); }}>
      <title id={`ml-chart-${id}-title`}>{`${label} · ${pts.length}개 관측`}</title>
      <desc id={`ml-chart-${id}-desc`}>{pts[0][0]}부터 {last[0]}. 선택일 {point[0]}, {fmt(point[1])} {unit}. 실제 관측만 연결하며 끝과 시작을 닫지 않습니다.</desc>
      {Array.from({ length: 5 }, (_, i) => {
        const value = low + (high - low) * i / 4;
        return <Fragment key={i}><line className="ml-grid-line" x1={pad.l} x2={width - pad.r} y1={y(value)} y2={y(value)} />
          <text className="ml-axis-label" x={pad.l - 8} y={y(value) + 4} textAnchor="end">{fmt(value, rsi ? 0 : 1)}</text></Fragment>;
      })}
      {lines.map((value, i) => <Fragment key={value}><line className="ml-threshold-line" x1={pad.l} x2={width - pad.r} y1={y(value)} y2={y(value)} />
        <text className="ml-threshold-label" x={pad.l + 20 + i * (width - pad.l - pad.r - 40) / 3} y={y(value) - 4} textAnchor="middle">{value}</text></Fragment>)}
      <path className={`ml-observed-line ${rsi ? 'ml-rsi-line' : ''}`} d={path} />
      {signalPath && <path className="ml-signal-line" d={signalPath} />}
      {annotations.map(marker => {
        const up = marker.side === 'Buy', { px, py } = marker;
        return <g key={`${marker.date}:${marker.side}`} className={`rsi-crossing rsi-crossing-${marker.side.toLowerCase()}`} role="img" aria-label={`${marker.date} ${marker.side} 기준선 통과 ${marker.level}`}>
          <title>{`${marker.date} · ${marker.side} ${marker.level} · 기준선 통과`}</title>
          <polygon points={up ? `${px},${py+5} ${px-4},${py+12} ${px+4},${py+12}` : `${px},${py-5} ${px-4},${py-12} ${px+4},${py-12}`} />
          {labels.has(`${marker.date}:${marker.side}`) && <text x={Math.max(pad.l+16,Math.min(width-pad.r-16,px))} y={Math.max(pad.t+12,Math.min(height-pad.b-8,py+(up?23:-16)))} textAnchor="middle">{marker.side}</text>}
        </g>;
      })}
      <line className="ml-crosshair" x1={x(index)} x2={x(index)} y1={pad.t} y2={height - pad.b} />
      <circle className="ml-chart-point" cx={x(index)} cy={y(point[1])} r="4" />
      <text className="ml-axis-label" x={pad.l} y={height - 10}>{pts[0][0]}</text>
      <text className="ml-axis-label" x={width - pad.r} y={height - 10} textAnchor="end">{last[0]}</text>
    </svg>
    <label className="ml-date-selector">관측일 선택 <input type="range" min="0" max={pts.length - 1} step="1" value={index} data-date={id}
      aria-label={`${label} 관측일`} aria-valuetext={`${point[0]}, ${fmt(point[1])} ${unit}`} disabled={pts.length === 1}
      onChange={event => onSelect(Number(event.currentTarget.value))} /></label>
    {rsi && <p className="ml-chart-legend"><span>Wilder RSI14</span><span>SMA9 신호</span> · 점선은 원문 기준</p>}
  </figure></div>;
}
