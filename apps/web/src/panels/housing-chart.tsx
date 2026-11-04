import { useEffect,useRef,useState } from 'react';
import type { HousingRow } from '@atlas/domain/housing';
export const stateName={above:'상회',neutral:'중립',below:'하회',warmup:'산정 전'};
const number=(n:number|null,digits=0)=>n===null?'—':n.toLocaleString('ko-KR',{maximumFractionDigits:digits,minimumFractionDigits:digits});
export function HousingChart({rows,start,end,selected,onRange,onSelect}:{rows:HousingRow[];start:number;end:number;selected:string;onRange:(start:number,end:number)=>void;onSelect:(month:string)=>void}){
  const host=useRef<HTMLDivElement>(null),drag=useRef<{x:number;start:number;end:number}|null>(null),[width,setWidth]=useState(800);
  useEffect(()=>{const node=host.current;if(!node)return;const resize=new ResizeObserver(([e])=>setWidth(Math.max(260,Math.round(e.contentRect.width))));resize.observe(node);return()=>resize.disconnect();},[]);
  const visible=rows.slice(start,end+1),left=44,right=width-58,plotWidth=right-left,height=390;
  const prices=visible.flatMap(r=>r.price===null?[]:[r.price]),maxPrice=Math.max(...prices,1),minPrice=Math.min(...prices,maxPrice),spread=Math.max(maxPrice-minPrice,1),lo=minPrice-spread*.1,hi=maxPrice+spread*.1;
  const maxVolume=Math.max(...visible.flatMap(r=>[r.volume??0,r.average??0]),1)*1.12;
  const x=(i:number)=>left+(i+.5)/visible.length*plotWidth,py=(v:number)=>24+(hi-v)/(hi-lo)*196,vy=(v:number)=>352-v/maxVolume*100;
  const line=(key:'price'|'average',y:(n:number)=>number)=>visible.map((r,i)=>r[key]===null?'':`${i===0||visible[i-1][key]===null?'M':'L'}${x(i).toFixed(2)},${y(r[key]!).toFixed(2)}`).join(' ');
  const selectedIndex=visible.findIndex(r=>r.month===selected),selectedRow=selectedIndex<0?visible.at(-1):visible[selectedIndex],cursorIndex=selectedIndex<0?visible.length-1:selectedIndex;
  function zoom(factor:number,anchor=.5){const n=Math.min(rows.length,Math.max(12,Math.round((end-start+1)*factor))),center=start+(end-start+1)*anchor,a=Math.max(0,Math.min(rows.length-n,Math.round(center-n*anchor)));onRange(a,a+n-1);}
  useEffect(()=>{const node=host.current;if(!node)return;const wheel=(e:WheelEvent)=>{e.preventDefault();const b=node.getBoundingClientRect();zoom(e.deltaY>0?1.18:.85,Math.max(0,Math.min(1,(e.clientX-b.left-left)/plotWidth)));};node.addEventListener('wheel',wheel,{passive:false});return()=>node.removeEventListener('wheel',wheel);});
  return <div className="housing-chart" ref={host}>
    <div className="housing-chart-readout" aria-live="off"><time>{selectedRow?.month}</time><span>실거래지수 <b>{number(selectedRow?.price??null,2)}</b></span><span>매매 <b>{number(selectedRow?.volume??null)}</b>건</span><span>평균 <b>{number(selectedRow?.average??null)}</b></span><strong className={`housing-state ${selectedRow?.state}`}>{selectedRow?stateName[selectedRow.state]:'—'}</strong></div>
    <svg width={width} height={height} role="application" aria-label="아파트 실거래지수·거래량 차트. 휠 확대 축소, 드래그 이동, 방향키 월 선택, 더하기 빼기 확대 축소, Home 전체" tabIndex={0}
      onKeyDown={e=>{if(e.key==='+'||e.key==='='){e.preventDefault();zoom(.8);}if(e.key==='-'){e.preventDefault();zoom(1.25);}if(e.key==='Home'){e.preventDefault();onRange(0,rows.length-1);}if(['ArrowLeft','ArrowRight'].includes(e.key)){e.preventDefault();const i=Math.max(0,Math.min(rows.length-1,rows.findIndex(r=>r.month===selected)+(e.key==='ArrowLeft'?-1:1)));onSelect(rows[i].month);if(i<start)onRange(i,Math.min(rows.length-1,i+end-start));if(i>end)onRange(Math.max(0,i-(end-start)),i);}}}
      onPointerDown={e=>{drag.current={x:e.clientX,start,end};e.currentTarget.setPointerCapture(e.pointerId);}}
      onPointerUp={e=>{drag.current=null;e.currentTarget.releasePointerCapture(e.pointerId);}}
      onPointerCancel={()=>{drag.current=null;}}
      onPointerMove={e=>{if(drag.current){const d=drag.current,n=d.end-d.start+1,delta=Math.round((d.x-e.clientX)/plotWidth*n),a=Math.max(0,Math.min(rows.length-n,d.start+delta));onRange(a,a+n-1);}else{const box=e.currentTarget.getBoundingClientRect(),i=Math.max(0,Math.min(visible.length-1,Math.floor((e.clientX-box.left-left)/plotWidth*visible.length)));if(visible[i])onSelect(visible[i].month);}}}>
      {[0,.25,.5,.75,1].map(t=><g key={t}><line className="housing-grid" x1={left} x2={right} y1={24+t*196} y2={24+t*196}/><text x={right+8} y={28+t*196}>{number(hi-t*(hi-lo),1)}</text></g>)}
      {[0,.5,1].map(t=><g key={t}><line className="housing-grid" x1={left} x2={right} y1={352-t*100} y2={352-t*100}/><text textAnchor="end" x={left-6} y={356-t*100}>{number(t*maxVolume/1000,1)}k</text></g>)}
      <text className="housing-axis-title" x={left} y={15}>실거래가격지수</text><text className="housing-axis-title" x={left} y={242}>매매 거래량 · 건 / 신고월</text>
      {prices.length?<path className="housing-price" d={line('price',py)}/>:<text x={left+20} y={110}>이 구간의 가격지수 미공표</text>}
      {visible.map((r,i)=>r.volume===null?null:<rect key={r.month} className={`housing-bar ${r.state}`} x={x(i)-Math.max(1,plotWidth/visible.length*.32)} y={vy(r.volume)} width={Math.max(1,plotWidth/visible.length*.64)} height={352-vy(r.volume)}><title>{r.month} · {number(r.volume)}건 · {stateName[r.state]}</title></rect>)}
      <path className="housing-average" d={line('average',vy)}/>
      {visible.filter((_,i)=>i%Math.max(1,Math.ceil(visible.length/Math.max(2,Math.floor(plotWidth/95))))===0).map(r=>{const i=visible.indexOf(r);return <text key={r.month} x={x(i)} y={376} textAnchor="middle">{r.month}</text>;})}
      {selectedRow&&<g><line className="housing-cursor" x1={x(cursorIndex)} x2={x(cursorIndex)} y1={20} y2={352}/>{selectedRow.price!==null&&<circle className="housing-price-dot" cx={x(cursorIndex)} cy={py(selectedRow.price)} r={4}/>}</g>}
    </svg>
    <div className="housing-chart-controls"><div className="housing-legend"><span className="above">상회</span><span className="neutral">중립</span><span className="below">하회</span><span className="average">과거 평균</span></div><button type="button" onClick={()=>zoom(.75)} aria-label="부동산 차트 확대">＋</button><button type="button" onClick={()=>zoom(1.3)} aria-label="부동산 차트 축소">−</button><button type="button" onClick={()=>onRange(Math.max(0,rows.length-60),rows.length-1)}>5년</button><button type="button" onClick={()=>onRange(0,rows.length-1)}>전체</button></div>
    <label className="housing-pan">{visible[0]?.month} ~ {visible.at(-1)?.month}<input type="range" aria-label="부동산 차트 과거 구간 이동" min={0} max={Math.max(0,rows.length-(end-start+1))} value={start} onChange={e=>{const n=end-start;onRange(Number(e.target.value),Number(e.target.value)+n);}}/></label>
  </div>;
}
export function HousingScatter({rows}:{rows:HousingRow[]}){
  const pairs=rows.filter(r=>r.deviation!==null&&r.priceChange!==null),maxX=Math.max(20,...pairs.map(r=>Math.abs(r.deviation!))),maxY=Math.max(1,...pairs.map(r=>Math.abs(r.priceChange!)));
  return <svg className="housing-scatter" viewBox="0 0 540 260" role="img" aria-label="거래량 평균 대비 편차와 같은 달 가격 전월비 산점도"><title>수평축: 거래량 평균 대비 편차 %, 수직축: 가격 전월비 %</title><line className="housing-grid" x1={40} x2={510} y1={125} y2={125}/><line className="housing-grid" x1={275} x2={275} y1={20} y2={230}/>{pairs.map(r=><circle key={r.month} className={`housing-scatter-dot ${r.state}`} cx={275+r.deviation!/maxX*225} cy={125-r.priceChange!/maxY*100} r={3}><title>{r.month} · 거래량 편차 {number(r.deviation,1)}% · 가격 전월비 {number(r.priceChange,2)}%</title></circle>)}<text x={40} y={252}>−{number(maxX)}%</text><text x={260} y={252}>0</text><text x={460} y={252}>+{number(maxX)}%</text><text x={5} y={25}>+{number(maxY,1)}%</text><text x={5} y={230}>−{number(maxY,1)}%</text></svg>;
}
