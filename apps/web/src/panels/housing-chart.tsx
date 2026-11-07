import { useMemo, type ReactNode } from 'react';
import type { HousingRow } from '@atlas/domain/housing';
import { InstrumentWorkbench } from '../components/instrument-workbench.js';
import type { InstrumentChartCache, InstrumentSeries } from '../instrument-chart-model.js';
export const stateName={above:'상회',neutral:'중립',below:'하회',warmup:'산정 전'};
const number=(n:number|null,digits=0)=>n===null?'—':n.toLocaleString('ko-KR',{maximumFractionDigits:digits,minimumFractionDigits:digits});
interface Props {
  rows: HousingRow[]; start: number; end: number; selected: string;
  onRange: (start: number, end: number) => void; onSelect: (month: string) => void;
  symbol?: string; cache?: InstrumentChartCache; embedded?: boolean; epoch?: number; active?: boolean;
  visible?: boolean; currentTab?: string; onShowChart?: () => void; onRecords?: () => void;
  method?: ReactNode; revision?: string;
}
export function housingChartSeries(rows: HousingRow[]): InstrumentSeries {
  return { frequency: 'monthly', prices: rows.flatMap(row => row.price === null ? [] : [[`${row.month}-01`, row.price]]), bars: [],
    timeline: rows.map(row => `${row.month}-01`), volumes: rows.map(row => ({ date: `${row.month}-01`, value: row.volume, average: row.average, state: row.state })) };
}
export function HousingChart(props: Props) {
  const series = useMemo(() => housingChartSeries(props.rows), [props.rows]);
  if (!series.timeline.length) return <p role="status">표시할 월별 관측 자료가 없습니다.</p>;
  const {rows,start,end,selected} = props;
  return <InstrumentWorkbench symbol={props.symbol || 'HOUSING-BUSAN'} unit="지수" timezone="Asia/Seoul" series={series}
    cache={props.cache} embedded={props.embedded} epoch={props.epoch} active={props.active} visible={props.visible} currentTab={props.currentTab}
    onShowChart={props.onShowChart} onRecords={props.onRecords} recordsLabel="월별 기록" method={props.method} revision={props.revision}
    initialView={{start:series.timeline[start] || series.timeline[0],end:series.timeline[end] || series.timeline.at(-1),selected:`${selected}-01`}}
    onView={view => {props.onSelect(view.selected.slice(0,7));const first=rows.findIndex(row=>`${row.month}-01`>=view.start),last=rows.findLastIndex(row=>`${row.month}-01`<=view.end);if(first>=0&&last>=first)props.onRange(first,last);}}
    volumeUnit="건" description="아파트 실거래지수·거래량 차트" chartClassName="housing-chart"
    data={stamp => {const row=rows.find(row=>row.month===stamp.slice(0,7));return row?<><dl className="rsi-data-list"><dt>과거 월평균</dt><dd>{number(row.average)}건</dd><dt>평균 대비</dt><dd>{number(row.deviation,1)}%</dd><dt>거래량 상태</dt><dd className={`housing-state ${row.state}`}>{stateName[row.state]}</dd><dt>가격 전월비</dt><dd>{number(row.priceChange,2)}%</dd></dl><p className="compact-toolbar-muted">가격지수: 계약월 · 거래량: 신고월</p></>:null;}}/>;
}
export function HousingScatter({rows}:{rows:HousingRow[]}){
  const pairs=rows.filter(r=>r.deviation!==null&&r.priceChange!==null),maxX=Math.max(20,...pairs.map(r=>Math.abs(r.deviation!))),maxY=Math.max(1,...pairs.map(r=>Math.abs(r.priceChange!)));
  return <svg className="housing-scatter" viewBox="0 0 540 260" role="img" aria-label="거래량 평균 대비 편차와 같은 달 가격 전월비 산점도"><title>수평축: 거래량 평균 대비 편차 %, 수직축: 가격 전월비 %</title><line className="housing-grid" x1={40} x2={510} y1={125} y2={125}/><line className="housing-grid" x1={275} x2={275} y1={20} y2={230}/>{pairs.map(r=><circle key={r.month} className={`housing-scatter-dot ${r.state}`} cx={275+r.deviation!/maxX*225} cy={125-r.priceChange!/maxY*100} r={3}><title>{r.month} · 거래량 편차 {number(r.deviation,1)}% · 가격 전월비 {number(r.priceChange,2)}%</title></circle>)}<text x={40} y={252}>−{number(maxX)}%</text><text x={260} y={252}>0</text><text x={460} y={252}>+{number(maxX)}%</text><text x={5} y={25}>+{number(maxY,1)}%</text><text x={5} y={230}>−{number(maxY,1)}%</text></svg>;
}
