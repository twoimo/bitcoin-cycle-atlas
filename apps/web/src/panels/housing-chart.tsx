import { useMemo, type ReactNode } from 'react';
import type { HousingRow } from '@atlas/domain/housing';
import { InstrumentWorkbench } from '../components/instrument-workbench.js';
import type { InstrumentChartCache, InstrumentSeries } from '../instrument-chart-model.js';
import { linearScale, ticks as niceTicks } from '@funnest/charts-viz';
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
  const left=54,right=520,top=18,bottom=226;
  const x=linearScale([-maxX,maxX],[left,right]),y=linearScale([-maxY,maxY],[bottom,top]);
  const xTicks=niceTicks(-maxX,maxX,5),yTicks=niceTicks(-maxY,maxY,5);
  if(!pairs.length)return <p className="housing-scatter" role="status">산점도에 사용할 거래량 편차와 가격 변화가 모두 있는 월이 없습니다.</p>;
  return <div className="housing-scatter atlas-funnest-scatter" data-chart-engine="funnest">
    <svg viewBox="0 0 540 260" role="img" aria-label="거래량 평균 대비 편차와 같은 달 가격 전월비 산점도">
      <title>수평축: 거래량 평균 대비 편차 %, 수직축: 가격 전월비 % · Funnest 선형 축</title>
      {xTicks.map((value:number)=><g key={`x${value}`}><line className="housing-grid" x1={x(value)} x2={x(value)} y1={top} y2={bottom}/><text x={x(value)} y={bottom+18} textAnchor="middle">{number(value,0)}%</text></g>)}
      {yTicks.map((value:number)=><g key={`y${value}`}><line className="housing-grid" x1={left} x2={right} y1={y(value)} y2={y(value)}/><text x={left-6} y={y(value)+4} textAnchor="end">{number(value,1)}%</text></g>)}
      <line className="housing-grid" x1={x(0)} x2={x(0)} y1={top} y2={bottom}/><line className="housing-grid" x1={left} x2={right} y1={y(0)} y2={y(0)}/>
      {pairs.map(row=><circle key={row.month} className={`housing-scatter-dot ${row.state}`} cx={x(row.deviation!)} cy={y(row.priceChange!)} r={4} tabIndex={0} aria-label={`${row.month} · 거래량 평균 대비 ${number(row.deviation,1)}% · 가격 전월비 ${number(row.priceChange,2)}%`}><title>{row.month} · 거래량 평균 대비 {number(row.deviation,1)}% · 가격 전월비 {number(row.priceChange,2)}%</title></circle>)}
      <text x={(left+right)/2} y={258} textAnchor="middle">거래량 평균 대비 편차 (%)</text>
    </svg>
    <details className="atlas-funnest-source-table"><summary>산점도 원자료 표 · {pairs.length}행</summary><div className="atlas-funnest-table-scroll"><table><caption>같은 달 거래량 평균 대비 편차와 가격 전월비</caption><thead><tr><th scope="col">월</th><th scope="col">거래량 평균 대비 편차 (%)</th><th scope="col">가격 전월비 (%)</th><th scope="col">거래량 상태</th></tr></thead><tbody>{pairs.map(row=><tr key={row.month}><th scope="row">{row.month}</th><td>{number(row.deviation,1)}</td><td>{number(row.priceChange,2)}</td><td>{stateName[row.state]}</td></tr>)}</tbody></table></div></details>
  </div>;
}
