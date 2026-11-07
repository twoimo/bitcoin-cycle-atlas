import { useMemo, type ReactNode } from 'react';
import { evidenceAvailableAt, type ThemeBar, type ThemeEvidence, type ThemeJudgment } from '@atlas/domain/themes';
import { InstrumentWorkbench } from './instrument-workbench.js';
import type { InstrumentChartCache, InstrumentSeries } from '../instrument-chart-model.js';
import type { InstrumentMarker } from './rsi-chart-canvas.js';

export type ThemeChartView = { start: string; end: string; selected: string; style: 'line' | 'candles' };
const day = (stamp: string) => Date.parse(stamp.slice(0, 10) + 'T00:00:00Z') / 86400000;
export const themeDate = (value: number) => new Date(value * 86400000).toISOString().slice(0, 10);
export function initialThemeView(bars: ThemeBar[]): ThemeChartView {
  return { start: themeDate(day(bars.at(-1)![0]) - 365), end: themeDate(day(bars.at(-1)![0]) + 4), selected: bars.at(-1)![0], style: 'candles' };
}
interface Props {
  bars: ThemeBar[]; evidence: ThemeEvidence[]; judgments: ThemeJudgment[];
  view: ThemeChartView; onView: (view: ThemeChartView) => void; onEvidence: (id: string) => void; onJudgment: (id: string) => void;
  selectedEvidence: string; selectedJudgment: string; active: boolean;
  cache?: InstrumentChartCache; embedded?: boolean; epoch?: number; visible?: boolean; currentTab?: string;
  onShowChart?: () => void; onRecords?: () => void; details?: ReactNode; method?: ReactNode; revision?: string;
}
export function ThemeChart(props: Props) {
  const series = useMemo<InstrumentSeries>(() => ({ frequency: 'daily', prices: props.bars.map(bar => [bar[0], bar[4]]), bars: props.bars,
    timeline: props.bars.map(bar => bar[0]), volumes: props.bars.map(bar => ({ date: bar[0], value: bar[5] })) }), [props.bars]);
  const markers: InstrumentMarker[] = [
    ...props.evidence.map(item => ({ id: item.id, date: evidenceAvailableAt(item).slice(0, 10), label: 'E', title: item.title,
      kind: 'evidence' as const, selected: item.id === props.selectedEvidence, onSelect: () => props.onEvidence(item.id) })),
    ...props.judgments.map(item => ({ id: item.id, date: item.asOf.slice(0, 10), label: 'J', title: item.title,
      kind: 'judgment' as const, selected: item.id === props.selectedJudgment, onSelect: () => props.onJudgment(item.id) })),
  ];
  return <InstrumentWorkbench symbol="HYPE" unit="USDC" timezone="UTC" series={series} cache={props.cache} revision={props.revision}
    embedded={props.embedded} epoch={props.epoch} active={props.active} visible={props.visible} currentTab={props.currentTab}
    onShowChart={props.onShowChart} onRecords={props.onRecords} recordsLabel="판정 기록" details={props.details} method={props.method}
    externalView={{ start: props.view.start, end: props.view.end, selected: props.view.selected, chartType: props.view.style }}
    onView={view => props.onView({ start: view.start, end: view.end, selected: view.selected, style: view.chartType })}
    markers={markers} volumeUnit="HYPE" description="HYPE 현물 가격과 근거·판정 표식" chartClassName="theme-price-chart"/>;
}
