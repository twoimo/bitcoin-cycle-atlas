import { useMemo, type ReactNode } from 'react';
import { BarChart, ChartCard, LineChart, ThemeProvider, type ChartEvent, type ChartTheme } from 'ztd-charts';
import { axes, Empty, finite, fmt } from './common.js';
import { CompactToolbar,CompactToolbarMenu } from './compact-toolbar.js';

// ztd-charts 0.2.1 is a direct runtime dependency. Its MIT notice and reviewed
// upstream identity are recorded in docs/design-system/ztd-charts.md.
const atlasChartTheme: Partial<ChartTheme> = {
  name: 'atlas', bg: 'var(--bg)', panel: 'var(--surface)', ink: 'var(--text)',
  muted: 'var(--muted)', dim: 'var(--subtle)', accent: 'var(--accent)',
  accentText: 'var(--accent)', onAccent: 'var(--on-accent)', onInk: 'var(--bg)',
  line: 'var(--border)', line2: 'var(--border-soft)', neutral: 'var(--muted)',
  neutralStrong: 'var(--text)', onNeutralStrong: 'var(--bg)',
  neutralSoft: 'var(--surface-raised)', lift: 'var(--surface-hover)',
  tint: 'var(--accent-soft)', fontFamily: 'var(--font)', monoFamily: 'var(--font-mono)',
  radius: 8, radiusCode: 4, radiusMark: 2,
};
const chartTitleStyle = { fontSize: 14, fontWeight: 600, letterSpacing: 0 } as const;
const allSeries = () => true;
const observedNumber = (value: number) => fmt(value, 2);
const contributionNumber = (value: number) => fmt(value, 3);

export function ResearchChartCard({ title, actions, children, className = '' }: {
  title: ReactNode; actions?: ReactNode; children: ReactNode; className?: string;
}) {
  return <ThemeProvider theme={atlasChartTheme} locale="ko-KR">
    <ChartCard title={<span style={chartTitleStyle}>{title}</span>} actions={actions}
      className={`ml-ztd-card ${className}`} style={{ padding: 16, gap: 12 }}>
      {children}
    </ChartCard>
  </ThemeProvider>;
}

type Observation = readonly [string, number | null];
interface ObservedDatum { date: string; value: number; segment: string; sourceIndex: number }

/** Keep every source slot; a missing observation starts a new, unjoined line. */
export function observedChartModel(points: readonly Observation[]) {
  let segment = 0, validCount = 0;
  const indexByDate = new Map<string, number>();
  const runLengths = new Map<number, number>();
  const data: ObservedDatum[] = points.map(([date, value], sourceIndex) => {
    if (sourceIndex > 0 && finite(value) && !finite(points[sourceIndex - 1][1])) segment++;
    if (finite(value)) { validCount++; runLengths.set(segment, (runLengths.get(segment) ?? 0) + 1); }
    indexByDate.set(date, sourceIndex);
    // ztd 0.2.1 joins finite values within one series. Separate contiguous runs
    // prevent interpolation across explicit null/NaN/Infinity observations.
    return { date, value: finite(value) ? value : NaN, segment: `관측 ${segment + 1}`, sourceIndex };
  });
  return { data, indexByDate, validCount, hasIsolatedObservation: [...runLengths.values()].some(count => count === 1) };
}

export function ObservedResearchChart({ id, points, unit, label, selected, onSelect, compactToolbar = false }: {
  id: string; points: readonly Observation[]; unit: string; label: string;
  selected: number | null; onSelect: (sourceIndex: number) => void; compactToolbar?: boolean;
}) {
  const model = useMemo(() => observedChartModel(points), [points]);
  if (!model.validCount) return <div data-chart={id}><Empty>{label}에 유효한 수치가 없습니다.</Empty></div>;
  const index = selected == null || !Number.isFinite(selected) ? points.length - 1
    : Math.max(0, Math.min(points.length - 1, Math.trunc(selected)));
  const [date, value] = points[index];
  const readout = `${date} · ${finite(value) ? `${fmt(value)} ${unit}` : '관측값 없음'}`;
  const selectEvent = (event: ChartEvent<ObservedDatum> | null) => {
    if (!event) return;
    // Chart indices can be reordered by a renderer. Our state always belongs
    // to the source observations, including explicit missing rows.
    const sourceIndex = model.indexByDate.get(event.key);
    if (sourceIndex !== undefined && sourceIndex !== index) onSelect(sourceIndex);
  };
  const dateControl = <label className={compactToolbar ? 'compact-toolbar-field' : 'ml-date-selector'}>관측일 선택 <input type="range" min="0" max={points.length - 1} step="1" value={index} data-date={id}
    aria-label={`${label} 관측일`} aria-valuetext={`${date}, ${finite(value) ? `${fmt(value)} ${unit}` : '관측값 없음'}`}
    disabled={points.length === 1} onChange={event => onSelect(Number(event.currentTarget.value))} /></label>;
  return <div data-chart={id} data-ztd-chart="observed" data-source-count={points.length}>
    {compactToolbar && <CompactToolbar label="선택 관측" order={20}><span className="compact-toolbar-summary" data-selected-date={date} data-selected-index={index}>{readout}</span><CompactToolbarMenu name="market-date" label="관측일" title={`${label} 관측일 선택`}><p className="compact-toolbar-summary">{readout}</p>{dateControl}</CompactToolbarMenu></CompactToolbar>}
    <figure className="ml-chart">
      {compactToolbar ? <figcaption className="atlas-sr-only">{label} · {readout}</figcaption> : <figcaption><strong>{label}</strong><span data-selected-date={date} data-selected-index={index}>{readout}</span></figcaption>}
      <LineChart data={model.data} x="date" y="value" series="segment" xType="band"
        curve="linear" zero={false} endLabels={false} colorMode="highlight" highlight={allSeries} dots={model.hasIsolatedObservation ? true : 'auto'}
        height={290} animate={false} locale="ko-KR" format={observedNumber} unit={` ${unit}`} yLabel={unit}
        ariaLabel={`${label} · ${model.validCount}개 관측`}
        description={`${points[0][0]}부터 ${points.at(-1)![0]}. 선택일 ${readout}. 관측 순서대로 표시하며 누락된 관측값은 연결하지 않습니다.`}
        onHover={selectEvent} onClick={selectEvent}
        tooltip={event => {
          const sourceIndex = model.indexByDate.get(event.key);
          const point = sourceIndex === undefined ? null : points[sourceIndex];
          return point ? <span>{point[0]} · {finite(point[1]) ? `${fmt(point[1])} ${unit}` : '관측값 없음'}</span> : null;
        }} />
      {!compactToolbar && dateControl}
    </figure>
  </div>;
}

export function ScenarioContributionChart({ contributions }: { contributions: readonly number[] }) {
  const data = axes.map(([, symbol, name], index) => ({ axis: `${symbol} ${name}`, value: contributions[index] }));
  if (data.some(row => !finite(row.value))) return null;
  return <div data-presentation-chart="scenario-contributions" data-ztd-chart="contributions" style={{ marginBlock: 16 }}>
    <ThemeProvider theme={atlasChartTheme} locale="ko-KR">
      <ChartCard as="h4" title={<span style={chartTitleStyle}>축별 기여도</span>} subtitle="기준 0 · 무차원"
        className="ml-ztd-contributions" style={{ padding: 12, gap: 8, background: 'var(--bg)' }}>
        <BarChart data={data} x="axis" y="value" layout="grouped" orientation="horizontal" sort={false}
          height={184} animate={false} highlight={allSeries} format={contributionNumber}
          ariaLabel="축별 정규화 기여도"
          description={`가정 입력의 정규화 기여도. 기준 0. ${data.map(row => `${row.axis} ${fmt(row.value, 3)}`).join(', ')}. 퍼센트나 수익률이 아닙니다.`} />
      </ChartCard>
    </ThemeProvider>
  </div>;
}
