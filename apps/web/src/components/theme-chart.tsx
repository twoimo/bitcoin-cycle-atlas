import {Fragment,useEffect,useLayoutEffect,useRef,useState} from 'react';
import { bindChartNavigation } from '../../../../dist/chart-navigation.js';
import { evidenceAvailableAt,type ThemeBar,type ThemeEvidence,type ThemeJudgment } from '@atlas/domain/themes';
import {CompactToolbar,CompactToolbarMenu} from './compact-toolbar.js';
export type ThemeChartView={start:string;end:string;selected:string;style:'line'|'candles'};
const day=(s:string)=>Date.parse(s.slice(0,10)+'T00:00:00Z')/86400000;
export const themeDate=(n:number)=>new Date(n*86400000).toISOString().slice(0,10);
export function initialThemeView(bars:ThemeBar[]):ThemeChartView{return {start:themeDate(day(bars.at(-1)![0])-365),end:themeDate(day(bars.at(-1)![0])+4),selected:bars.at(-1)![0],style:'candles'};}
export function ThemeChart(props:{bars:ThemeBar[];evidence:ThemeEvidence[];judgments:ThemeJudgment[];view:ThemeChartView;onView:(v:ThemeChartView)=>void;onEvidence:(id:string)=>void;onJudgment:(id:string)=>void;selectedEvidence:string;selectedJudgment:string;active:boolean}){
  const host=useRef<HTMLDivElement>(null),[width,setWidth]=useState(800),live=useRef(props),nav=useRef<ReturnType<typeof bindChartNavigation>|null>(null);live.current=props;
  useLayoutEffect(()=>{const n=host.current;if(!n)return;const measure=()=>setWidth(Math.max(260,n.clientWidth));measure();const r=new ResizeObserver(measure);r.observe(n);return()=>r.disconnect();},[]);
  useEffect(()=>{if(!host.current)return;const range=()=>{const p=live.current;return p.active?{start:p.view.start,end:p.view.end,min:p.bars[0][0],max:themeDate(day(p.bars.at(-1)![0])+32),minSpan:10,allowEmpty:true}:null;};
    nav.current=bindChartNavigation({element:host.current,getRange:range,getTool:()=> 'pan',onRangeChange:r=>{const p=live.current,v={...p.view,start:r.start,end:r.end};live.current={...p,view:v};p.onView(v);},onReset:()=>{const p=live.current;p.onView(initialThemeView(p.bars));},getContext:()=>({label:'HYPE/USDC',copyText:`HYPE/USDC ${live.current.view.start} ~ ${live.current.view.end}`})});return()=>{nav.current?.destroy();nav.current=null;};},[]);
  useEffect(()=>nav.current?.update(),[props.view,props.active,width]);
  const {view,bars}=props,visible=bars.filter(b=>b[0]>=view.start&&b[0]<=view.end),left=44,right=width-62,span=Math.max(1,day(view.end)-day(view.start)),x=(date:string)=>left+(day(date)-day(view.start))/span*(right-left),top=68,bottom=300,height=420;
  const min=Math.min(...visible.map(b=>view.style==='candles'?b[3]:b[4]),100000),max=Math.max(...visible.map(b=>view.style==='candles'?b[2]:b[4]),0),spread=Math.max(1,max-min),lo=min-spread*.08,hi=max+spread*.08,y=(v:number)=>top+(hi-v)/(hi-lo)*(bottom-top),volumeMax=Math.max(1,...visible.map(b=>b[5]));
  const barWidth=Math.max(1,Math.min(12,(right-left)/(span+1)*.65)),selected=bars.find(b=>b[0]===view.selected)??visible.at(-1),tickCount=Math.max(2,Math.floor((right-left)/100));
  const events=[...props.evidence.map(e=>({id:e.id,date:evidenceAvailableAt(e).slice(0,10),title:e.title,type:'evidence'})),...props.judgments.map(j=>({id:j.id,date:j.asOf.slice(0,10),title:j.title,type:'judgment'}))].filter(e=>e.date>=view.start&&e.date<=view.end);
  const groups=new Map<string,typeof events>();for(const e of events){const key=`${e.type}:${e.date}`;groups.set(key,[...(groups.get(key)??[]),e]);}
  const laneEnds:number[]=[];
  const marks=[...groups.entries()].sort(([,a],[,b])=>a[0].date.localeCompare(b[0].date)).map(([key,items])=>{const first=items[0],px=x(first.date);let lane=laneEnds.findIndex(end=>end+28<px);if(lane<0)lane=laneEnds.length;laneEnds[lane]=px;return {key,items,first,px,cy:10+lane*18};});
  return <div className="theme-price-chart" ref={host}>
    <CompactToolbar label="선택 HYPE 일봉" order={30}>
      <CompactToolbarMenu name="theme-candle" title="선택 HYPE 일봉" label={<span className="compact-toolbar-summary">선택 <time>{selected?.[0]??'—'}</time><b>{selected?.[4].toFixed(3)??'—'}</b> USDC</span>}>
        <div className="theme-chart-readout compact-toolbar-summary"><time>{selected?.[0]??'—'} UTC</time><span>O {selected?.[1].toFixed(3)??'—'}</span><span>H {selected?.[2].toFixed(3)??'—'}</span><span>L {selected?.[3].toFixed(3)??'—'}</span><span>C {selected?.[4].toFixed(3)??'—'}</span><span>USDC</span></div>
        <p>HYPE 현물 · 거래량 HYPE · E 근거 / J 판정</p><p className="compact-toolbar-muted">표시 구간 {view.start} ~ {view.end}</p>
      </CompactToolbarMenu>
      <button className="compact-toolbar-action" type="button" onClick={()=>props.onView({...view,start:themeDate(day(bars.at(-1)![0])-180),end:themeDate(day(bars.at(-1)![0])+4)})}>6개월</button><button className="compact-toolbar-action" type="button" onClick={()=>props.onView({...view,start:bars[0][0],end:themeDate(day(bars.at(-1)![0])+4)})}>전체</button><button className="compact-toolbar-action" type="button" aria-pressed={view.style==='candles'} onClick={()=>props.onView({...view,style:view.style==='candles'?'line':'candles'})}>{view.style==='candles'?'캔들':'선'}</button>
    </CompactToolbar>
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} role="img" tabIndex={0} aria-label="HYPE 현물 가격과 근거·판정 표식. 휠 확대 축소, 드래그 과거 이동" data-plot-left={left} data-plot-right={right} data-plot-top={top} data-plot-bottom={376} data-time-axis-top={376} data-start={view.start} data-end={view.end}
      onPointerMove={e=>{if(e.buttons)return;const b=e.currentTarget.getBoundingClientRect(),target=themeDate(day(view.start)+(e.clientX-b.left-left)/(right-left)*span),nearest=visible.reduce<ThemeBar|undefined>((best,b)=>!best||Math.abs(day(b[0])-day(target))<Math.abs(day(best[0])-day(target))?b:best,undefined);if(nearest&&nearest[0]!==view.selected)props.onView({...view,selected:nearest[0]});}}>
      {[0,.25,.5,.75,1].map(t=><g key={t}><line className="theme-grid" x1={left} x2={right} y1={top+t*(bottom-top)} y2={top+t*(bottom-top)}/><text x={right+8} y={top+t*(bottom-top)+4}>{visible.length?(hi-t*(hi-lo)).toFixed(2):'—'}</text></g>)}
      {visible.length===0&&<text x={left+12} y={top+40}>이 구간의 완료 일봉 없음</text>}
      {view.style==='line'?<path className="theme-price-line" d={visible.map((b,i)=>`${i?'L':'M'}${x(b[0])},${y(b[4])}`).join(' ')}/>:visible.map(b=><g key={b[0]} className={b[4]>=b[1]?'theme-up':'theme-down'}><line x1={x(b[0])} x2={x(b[0])} y1={y(b[2])} y2={y(b[3])}/><rect x={x(b[0])-barWidth/2} y={Math.min(y(b[1]),y(b[4]))} width={barWidth} height={Math.max(1,Math.abs(y(b[1])-y(b[4])))}/></g>)}
      <text x={left} y={326}>거래량 / HYPE</text>
      {visible.map(b=><rect className={`theme-volume ${b[4]>=b[1]?'theme-up':'theme-down'}`} key={b[0]} x={x(b[0])-barWidth/2} y={374-b[5]/volumeMax*40} width={barWidth} height={b[5]/volumeMax*40}/>)}
      {selected&&selected[0]>=view.start&&selected[0]<=view.end&&<line className="theme-crosshair" x1={x(selected[0])} x2={x(selected[0])} y1={top} y2={376}/>}
      {Array.from({length:tickCount},(_,i)=>themeDate(day(view.start)+Math.round(span*i/(tickCount-1)))).map(d=><text key={d} x={x(d)} y={402} textAnchor="middle">{d.slice(0,span<90?10:7)}</text>)}
      {marks.map(({key,items,first:e,px,cy})=>{const selectedId=e.type==='judgment'?props.selectedJudgment:props.selectedEvidence,selected=items.some(i=>i.id===selectedId),target=items.find(i=>i.id===selectedId)??items.at(-1)!;const choose=()=>e.type==='judgment'?props.onJudgment(target.id):props.onEvidence(target.id);return <Fragment key={key}><line className={`theme-event-guide ${e.type}`} x1={px} x2={px} y1={cy+8} y2={bottom}/><g className={`theme-event-mark ${e.type} ${selected?'selected':''}`} role="button" tabIndex={0} aria-label={`${e.type==='judgment'?'판정':'근거'} ${items.length>1?`${items.length}건`:e.title} ${e.date}`} onClick={choose} onKeyDown={event=>{if(['Enter',' '].includes(event.key)){event.preventDefault();choose();}}}><title>{items.map(i=>i.title).join(' / ')} / {e.date}</title><rect x={px-12} y={cy-7} width={24} height={16} rx={2}/><text x={px} y={cy+5} textAnchor="middle">{e.type==='judgment'?'J':'E'}{items.length>1?items.length:''}</text></g></Fragment>;})}
    </svg>
    <div className="theme-chart-tools"><span>E 근거 / J 판정</span></div>
  </div>;
}
