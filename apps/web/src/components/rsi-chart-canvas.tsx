import { Fragment,useEffect,useId,useLayoutEffect,useMemo,useRef,useState } from 'react';
import type { Point } from '@atlas/contracts/market-lab';
import type { RsiRow } from '@atlas/domain/market-lab';
import type { RsiBar } from '@atlas/domain/rsi-bars';
import { bindChartNavigation } from '../../../../dist/chart-navigation.js';
import { withChartSpacing,candleBodyWidth } from '../../../../dist/chart-view-policy.js';
import { createPriceAxisLayout,createPriceAxisFormatter } from '../../../../dist/price-axis.js';
import { mountInstrumentChartLegend } from '../../../../dist/ui/instrument-chart-legend.js';
import { mountQuoteHud } from '../../../../dist/ui/quote-hud.js';
import { chartGeometry,chartRange,date,day,nearestPoint,type Anchor,type RsiChartView } from '../rsi-chart-model.js';
import { rsiCrossings } from '../rsi-crossings.js';
import { instrumentRange,nearestObservation,observedPricePath,type InstrumentSeries } from '../instrument-chart-model.js';
export const axisNumber=(value:number)=>Math.abs(value)>0&&Math.abs(value)<.001?value.toPrecision(3):new Intl.NumberFormat('en-US',{maximumFractionDigits:Math.abs(value)<1?4:2}).format(value);
export interface Pick {date:string;value:number;panel:'price'|'rsi'}
export interface InstrumentMarker {id:string;date:string;label:string;title:string;kind:'evidence'|'judgment';selected:boolean;onSelect:()=>void}
export interface ChartQuote {
  symbol:string;name?:string;fullName?:string;interval:string;
  kind:'observed'|'simulated'|'forecast'|'unavailable';kindLabel?:string;
  priceText?:string;priceLabel?:string;changePct?:number|null;changeText?:string;
  dateTime?:string;timestampText?:string;timezone?:string;rsi?:number|null;rsiReason?:string;
  description?:string;detailText?:string;source?:string;sourceDescription?:string;sourceVisible?:boolean;
}
export interface ChartOverlayGeometry {width:number;height:number;left:number;right:number;top:number;bottom:number;viewportWidth:number;protectedAnchors?:Array<{x:number;y:number;width:number;height:number}>}
interface Props {menuPulse:number;symbol:string;unit:string;prices:Point[];bars:RsiBar[];rows:RsiRow[];view:RsiChartView;active:boolean;
  onView:(view:RsiChartView)=>void;onStart:()=>void;onEnd:()=>void;onPick:(pick:Pick)=>void;onHover:(pick:Pick|null)=>void;hover:Pick|null;svgRef:React.RefObject<SVGSVGElement|null>;
  series?:InstrumentSeries;markers?:InstrumentMarker[];onMarker?:()=>void;volumeUnit?:string;description?:string;className?:string;revision?:string;quote?:ChartQuote;overlay?:(geometry:ChartOverlayGeometry)=>React.ReactNode}
export function RsiChartCanvas(props:Props) {
  const {symbol,unit,prices,bars,rows,view,active,onPick,onHover,hover,svgRef}=props,root=useRef<HTMLDivElement>(null);
  const [size,setSize]=useState(()=>({width:900,height:520,viewportWidth:typeof window==='undefined'?900:window.innerWidth||900,axis:createPriceAxisLayout({svg:null,width:900,left:12,minRight:64})})),live=useRef(props),navigation=useRef<ReturnType<typeof bindChartNavigation>|null>(null);
  const source=useRef({prices,bars,version:0});
  const legend=useRef<ReturnType<typeof mountInstrumentChartLegend>|null>(null);
  const quoteHost=useRef<HTMLDivElement>(null),quoteHud=useRef<ReturnType<typeof mountQuoteHud>|null>(null);
  if(source.current.prices!==prices||source.current.bars!==bars)source.current={prices,bars,version:source.current.version+1};
  const clipId=useId().replaceAll(':',''),priceClip=`${clipId}-price`,oscClip=`${clipId}-osc`;
  const geometry=useMemo(()=>chartGeometry(prices,bars,rows,view,size.width,size.height,size.axis.right),[prices,bars,rows,view,size]);
  const geom=useRef(geometry);live.current=props;geom.current=geometry;
  useLayoutEffect(()=>{
    if(!quoteHost.current)return;
    const controller=mountQuoteHud(quoteHost.current);quoteHud.current=controller;
    return()=>{controller.destroy();quoteHud.current=null;};
  },[]);
  useLayoutEffect(()=>{
    quoteHud.current?.update(props.quote||{symbol,name:symbol,interval:({daily:'1D',weekly:'1W',monthly:'1M'})[view.frequency],
      kind:'unavailable',rsiReason:'관측 계기판 자료 없음',description:props.description});
  },[props.quote,symbol,view.frequency,props.description]);
  useLayoutEffect(()=>{
    let disposed=false;
    const measure=()=>{if(disposed||!root.current)return;const width=root.current.clientWidth,height=root.current.clientHeight;if(!Number.isFinite(width)||!Number.isFinite(height)||width<=0||height<=0)return;
      const axis=createPriceAxisLayout({svg:svgRef.current,width,left:Math.min(12,width*.05),minRight:64});
      const viewportWidth=root.current.ownerDocument.defaultView?.innerWidth||width;
      setSize(previous=>previous.width===width&&previous.height===height&&previous.viewportWidth===viewportWidth&&previous.axis.right===axis.right&&previous.axis.metricKey===axis.metricKey?previous:{width,height,viewportWidth,axis});};
    measure();const observer=typeof ResizeObserver==='undefined'?null:new ResizeObserver(measure);if(root.current)observer?.observe(root.current);
    const win=root.current?.ownerDocument.defaultView;win?.addEventListener('resize',measure);
    void root.current?.ownerDocument.fonts?.ready.then(measure);
    return()=>{disposed=true;observer?.disconnect();win?.removeEventListener('resize',measure);};
  },[]);
  useEffect(()=>{
    if(!root.current)return;
    // A native gesture flushes price and time changes in the same frame.
    // Compose them immediately, before React publishes the next render.
    const change=(update:(view:RsiChartView)=>RsiChartView)=>{const next=update(live.current.view);live.current={...live.current,view:next};live.current.onView(next);};
    const currentRange=()=>{const p=live.current,range=p.series?instrumentRange(p.view,p.series):chartRange(p.view,p.prices);return range?withChartSpacing({...range,contextKey:`${p.symbol}:${p.view.frequency}:${p.revision||''}:${source.current.version}`},{frequency:p.view.frequency,plotWidth:geom.current.right-geom.current.left}):null;};
    const controller=bindChartNavigation({element:root.current,getRange:()=>live.current.active?currentRange():null,
      getTool:()=>live.current.view.tool,onRangeChange:range=>change(view=>({...view,start:range.start,end:range.end,spacingBounds:range.spacingBounds})),onReset:()=>{const range=currentRange();if(range)change(view=>({...view,start:range.min,end:range.max,autoScale:true,domain:null}));},
      getPriceAxis:()=>live.current.active?{min:geom.current.min,max:geom.current.max,scale:live.current.view.scale,top:geom.current.top,bottom:geom.current.priceBottom,right:geom.current.right,inverted:live.current.view.inverted}:null,
      onPriceRangeChange:domain=>change(view=>({...view,autoScale:false,domain})),onPriceReset:()=>change(view=>({...view,autoScale:true,domain:null})),
      onGestureStart:()=>live.current.onStart(),onGestureEnd:()=>live.current.onEnd(),getContext:()=>{const p=live.current.hover?.date||live.current.view.selected,at=nearestPoint(live.current.prices,p),value=live.current.prices[at],stamp=live.current.series?.frequency==='monthly'?p.slice(0,7):p;return {label:`${live.current.symbol} ${stamp}`,copyText:`${live.current.symbol}\n${stamp}\nC ${value?.[0]===p?value[1]:'미공표'} ${live.current.unit}`};}});
    // The existing perimeter owns the visible navigation controls; the same
    // controller still owns wheel, pointer capture, pinch and axis gestures.
    const store=document.createElement('div');store.hidden=true;root.current.append(store);store.append(controller.toolbar);navigation.current=controller;
    return()=>{controller.destroy();store.remove();navigation.current=null;};
  },[]);
  useLayoutEffect(()=>navigation.current?.update(),[view,active,size,prices,bars,props.revision,symbol]);
  useEffect(()=>{if(props.menuPulse&&root.current){const r=root.current.getBoundingClientRect();navigation.current?.openMenu({clientX:r.left+r.width*.5,clientY:r.top+r.height*.4});}},[props.menuPulse]);
  const rowByDate=useMemo(()=>new Map(rows.map(row=>[row.date,row])),[rows]);
  const barByDate=useMemo(()=>new Map(bars.map(bar=>[bar[0],bar])),[bars]);
  const timeline=props.series?.timeline||prices.map(point=>point[0]);
  const g=geometry,picked=hover?.date||view.selected,at=props.series?nearestObservation(timeline,picked):nearestPoint(prices,picked),selectedDate=props.series?timeline[at]:prices[at]?.[0],selected=props.series?prices.find(point=>point[0]===selectedDate):prices[at],selectedRsi=rowByDate.get(selected?.[0]||'');
  const labels=createPriceAxisFormatter({axis:g.axis,layout:size.axis,display:{factor:1,offset:0,unit:unit==='USD'?'usd':'native'}});
  const axisText=(label:string,badge=false)=>({textLength:Math.min(size.axis.labelWidth,Math.max(.01,size.axis.measure(label,badge?size.axis.badgeFontSize:size.axis.fontSize))),lengthAdjust:'spacingAndGlyphs' as const,style:{fontSize:badge?size.axis.badgeFontSize:size.axis.fontSize},'data-price-axis-label':badge?'badge':'tick'});
  const crossing=useMemo(()=>view.showCrossings?rsiCrossings(rows).filter(m=>m.date>=view.start&&m.date<=view.end):[],[view.showCrossings,rows,view.start,view.end]);
  const markerLabels=new Set<number>(),lastLabel={Buy:-Infinity,Sell:-Infinity};
  crossing.forEach((marker,index)=>{const x=g.x(marker.date);if(x-lastLabel[marker.side]>56){markerLabels.add(index);lastLabel[marker.side]=x;}});
  const line=props.series?observedPricePath(g.visible,timeline,g.x,g.y):g.visible.map((p,i)=>`${i?'L':'M'}${g.x(p[0]).toFixed(2)},${g.y(p[1]).toFixed(2)}`).join(' ');
  const timelinePositions=new Map(timeline.map((stamp,index)=>[stamp,index]));
  const isolated=props.series?g.visible.filter((point,index)=>{const at=timelinePositions.get(point[0])!,before=g.visible[index-1],after=g.visible[index+1];return (!before||timelinePositions.get(before[0])!==at-1)&&(!after||timelinePositions.get(after[0])!==at+1);}):[];
  const rsiPath=(field:'rsi'|'signal')=>g.visibleRows.map((row,i,a)=>row[field]==null?'':`${i&&a[i-1][field]!=null?'L':'M'}${g.x(row.date).toFixed(2)},${g.rsiY(row[field]!).toFixed(2)}`).join(' ');
  const visibleVolumes=props.series?.volumes.filter(point=>point.date>=view.start&&point.date<=view.end);
  const maxVolume=Math.max(1,...(visibleVolumes?visibleVolumes.flatMap(point=>[point.value??0,point.average??0]):g.visibleBars.map(b=>b[5]||0)));
  const intervalDays=view.frequency==='monthly'?365.2425/12:view.frequency==='weekly'?7:1;
  const barWidth=candleBodyWidth(g.right-g.left,Math.max(1,day(view.end)-day(view.start)),intervalDays);
  const volumeHeight=Math.min(g.priceBottom-g.top,props.series?Math.min(96,Math.max(24,(g.priceBottom-g.top)*.17)):48);
  const timeTickCount=Math.max(2,Math.min(16,Math.floor((g.right-g.left)/92)+1));
  const volumeY=(value:number)=>g.priceBottom-value/maxVolume*volumeHeight;
  const averagePath=visibleVolumes?.map((point,index)=>point.average==null?'':`${index&&visibleVolumes[index-1].average!=null?'L':'M'}${g.x(point.date).toFixed(2)},${volumeY(point.average).toFixed(2)}`).join(' ');
  const markerGroups=new Map<string,InstrumentMarker[]>();
  for(const marker of props.markers||[])if(marker.date>=view.start&&marker.date<=view.end){const key=`${marker.kind}:${marker.date}`;markerGroups.set(key,[...markerGroups.get(key)||[],marker]);}
  const laneEnds:number[]=[];
  const marks=[...markerGroups.entries()].sort(([,a],[,b])=>a[0].date.localeCompare(b[0].date)).map(([key,items])=>{
    const marker=items.find(item=>item.selected)||items.at(-1)!,x=g.x(marker.date);
    // Keep the full 24px badge and selected stroke inside the price plot.
    // The original date still owns its guide; only the label is displaced.
    const labelX=Math.max(g.left+14,Math.min(g.right-14,x));
    let lane=laneEnds.findIndex(end=>end+30<labelX);if(lane<0)lane=laneEnds.length;laneEnds[lane]=labelX;
    return {key,items,marker,x,labelX,y:g.top+10+lane*20};
  });
  const overlayBounds={width:size.width,height:size.height,left:g.left,right:g.right,top:g.top,bottom:g.priceBottom,viewportWidth:size.viewportWidth,
    protectedAnchors:marks.map(mark=>({x:mark.labelX-13,y:mark.y-9,width:26,height:18}))};
  useLayoutEffect(()=>{
    if(!root.current)return;
    const controller=mountInstrumentChartLegend({plot:root.current});legend.current=controller;
    return()=>{controller.destroy();legend.current=null;};
  },[symbol]);
  useLayoutEffect(()=>{
    legend.current?.update({...props,prices,bars,rows,view},overlayBounds);
  },[symbol,unit,prices,bars,rows,view,active,size,props.series,props.markers,props.volumeUnit]);
  function pointer(event:React.PointerEvent<SVGSVGElement>|React.MouseEvent<SVGSVGElement>):Pick|null {
    const rect=event.currentTarget.getBoundingClientRect(),px=(event.clientX-rect.left)/rect.width*size.width,py=(event.clientY-rect.top)/rect.height*size.height;
    if(px<g.left||px>g.right||py<g.top||py>g.bottom)return null;
    const target=date(day(view.start)+(px-g.left)/(g.right-g.left)*(day(view.end)-day(view.start))),index=nearestObservation(timeline,target),stamp=timeline[index],point=props.series?prices.find(point=>point[0]===stamp):prices[index];
    if(!stamp||stamp<view.start||stamp>view.end)return null;
    const panel=view.showRsi&&py>=g.rsiTop?'rsi':'price';let value=panel==='rsi'?Math.max(0,Math.min(100,(g.bottom-py)/(g.bottom-g.rsiTop)*100)):g.fromY(py);
    const bar=barByDate.get(stamp),row=rowByDate.get(stamp);
    const candidates=(panel==='rsi'?[row?.rsi,...(view.showSignal?[row?.signal]:[])]:view.chartType==='candles'&&bar?bar.slice(1,5):[point?.[1]]).filter((v):v is number=>typeof v==='number'&&Number.isFinite(v));
    const snap=candidates.toSorted((a,b)=>Math.abs((panel==='rsi'?g.rsiY(a):g.y(a))-py)-Math.abs((panel==='rsi'?g.rsiY(b):g.y(b))-py))[0],snapY=snap==null?Infinity:panel==='rsi'?g.rsiY(snap):g.y(snap);
    if(snap!=null&&(view.magnet==='strong'||view.magnet==='weak'&&Math.abs(snapY-py)<=8))value=snap;
    return {date:stamp,value,panel};
  }
  const color=(bar:RsiBar)=>bar[4]>=bar[1]?'var(--green)':'var(--red)';
  const anchorY=(a:Anchor)=>a.panel==='rsi'?g.rsiY(a.value):g.y(a.value);
  const measurement=view.measurement.length===1&&hover?.panel===view.measurement[0].panel?[...view.measurement,hover]:view.measurement;
  return <div className={`atlas-plot rsi-chart-canvas ${props.className||''}`} ref={root} data-tool={view.tool} data-chart={props.series?'instrument-price':'rsi-price'}>
    <div ref={quoteHost}/>
    <svg ref={svgRef} width={size.width} height={size.height} viewBox={`0 0 ${size.width} ${size.height}`} role="img" tabIndex={0} aria-label={`${props.description||`${symbol} 가격·RSI 차트`}, 휠 확대·축소, 드래그 이동, C 십자선, H 이동, M 측정`}
      data-plot-left={g.left} data-plot-right={g.right} data-plot-top={g.top} data-plot-bottom={g.bottom} data-price-bottom={g.priceBottom} data-time-axis-top={g.bottom} data-start={view.start} data-end={view.end} data-price-min={g.min} data-price-max={g.max} data-price-mode={view.autoScale?'auto':'manual'}
      onPointerMove={event=>{if(active&&!event.buttons)onHover(pointer(event));}} onPointerLeave={()=>onHover(null)} onClick={event=>{if(!active||event.defaultPrevented)return;const p=pointer(event);if(p)onPick(p);}}>
      <title>{`${symbol} ${({daily:'1D',weekly:'1W',monthly:'1M'})[view.frequency]} 관측 차트`}</title><desc>{`${view.start}부터 ${view.end}, ${g.visible.length}개 가격 관측.${props.series?' 미공표 가격과 거래량은 생성하지 않습니다.':' 가격과 RSI는 같은 날짜 축을 사용합니다.'}`}</desc>
      <defs><clipPath id={priceClip}><rect x={g.left} y={g.top} width={g.right-g.left} height={g.priceBottom-g.top}/></clipPath><clipPath id={oscClip}><rect x={g.left} y={g.rsiTop} width={g.right-g.left} height={Math.max(0,g.bottom-g.rsiTop)}/></clipPath></defs>
      <text className="rsi-axis rsi-price-unit" x={g.right+size.axis.inset} y={g.top-5} aria-label={`가격 단위 ${unit}`}>{unit}</text>
      {!g.visible.length&&<text className="rsi-axis" x={(g.left+g.right)/2} y={(g.top+g.priceBottom)/2} textAnchor="middle">표시 구간에 관측 자료 없음</text>}
      {g.ticks.map(value=><g key={value}><line className="rsi-grid" x1={g.left} x2={g.right} y1={g.y(value)} y2={g.y(value)}/><text className="rsi-axis" x={g.right+size.axis.inset} y={g.y(value)+4} {...axisText(labels.tick(value))}>{labels.tick(value)}</text></g>)}
      {Array.from({length:timeTickCount},(_,i)=>{const value=date(day(view.start)+(day(view.end)-day(view.start))*i/(timeTickCount-1)),x=g.x(value);return <g key={i}><line className="rsi-grid" x1={x} x2={x} y1={g.top} y2={g.bottom}/><text className="rsi-axis" x={x} y={size.height-8} textAnchor={i===0?'start':i===timeTickCount-1?'end':'middle'}>{view.frequency==='monthly'||day(view.end)-day(view.start)>730?value.slice(0,7):value.slice(5)}</text></g>;})}
      <g clipPath={`url(#${priceClip})`}>
        {view.showVolume&&(visibleVolumes?visibleVolumes.filter(point=>point.value!==null).map(point=><rect className={`instrument-volume theme-volume ${point.state?`housing-bar ${point.state}`:''}`} data-volume={point.date} key={point.date} x={g.x(point.date)-barWidth/2} y={volumeY(point.value!)} width={barWidth} height={g.priceBottom-volumeY(point.value!)} fill={point.state==='above'?'var(--green)':point.state==='below'?'var(--red)':barByDate.has(point.date)?color(barByDate.get(point.date)!):'var(--muted)'} opacity=".3"><title>{`${point.date} 거래량 ${axisNumber(point.value!)} ${props.volumeUnit||''}`}</title></rect>):g.visibleBars.filter(b=>b[5]!==null).map(b=><rect key={b[0]} x={g.x(b[0])-barWidth/2} y={volumeY(b[5]!)} width={barWidth} height={g.priceBottom-volumeY(b[5]!)} fill={color(b)} opacity=".2"/>))}
        {view.showVolume&&averagePath&&<path className="housing-average" data-volume-average="true" d={averagePath}/>}
        {view.chartType==='candles'?g.visibleBars.map(b=><g key={b[0]} data-candle={b[0]} stroke={color(b)} fill={color(b)}><line x1={g.x(b[0])} x2={g.x(b[0])} y1={g.y(b[2])} y2={g.y(b[3])}/><rect x={g.x(b[0])-barWidth/2} y={Math.min(g.y(b[1]),g.y(b[4]))} width={barWidth} height={Math.max(1,Math.abs(g.y(b[1])-g.y(b[4])))}/></g>):<path className="rsi-price-line" d={line}/>}
        {view.chartType==='line'&&isolated.map(point=><circle key={point[0]} data-price-observation={point[0]} cx={g.x(point[0])} cy={g.y(point[1])} r={2.5} fill="var(--accent)"/>)}
        {crossing.map((m,i)=>{const point=prices[nearestPoint(prices,m.date)],x=g.x(m.date),y=g.y(point[1]),buy=m.side==='Buy';return <g key={m.date+m.side} className={`rsi-trade-mark ${buy?'is-buy':'is-sell'}`}><title>{`${m.date} ${m.side} ${m.level}, 기준선 통과`}</title><polygon points={buy?`${x},${y+5} ${x-4},${y+12} ${x+4},${y+12}`:`${x},${y-5} ${x-4},${y-12} ${x+4},${y-12}`}/>{markerLabels.has(i)&&<text x={Math.max(g.left+16,Math.min(g.right-16,x))} y={Math.max(g.top+12,Math.min(g.priceBottom-8,y+(buy?23:-16)))} textAnchor="middle">{m.side}</text>}</g>;})}
        {selected&&<line className="rsi-current-price" x1={g.left} x2={g.right} y1={g.y(selected[1])} y2={g.y(selected[1])}/>}
        {view.showVolume&&props.series&&<><line className="rsi-separator" x1={g.left} x2={g.right} y1={g.priceBottom} y2={g.priceBottom}/><text className="rsi-axis instrument-volume-label" x={g.left+4} y={g.priceBottom-volumeHeight-6}>{`거래량 / ${props.volumeUnit||unit}${averagePath?' · 과거 평균':''}`}</text></>}
      </g>
      {view.showRsi&&<g data-chart="rsi"><title>{`${symbol} RSI14`}</title><desc>{`선택일 ${selected?.[0]}, RSI ${selectedRsi?.rsi??'미산출'}`}</desc>
        <line className="rsi-separator" x1={0} x2={size.width} y1={g.priceBottom+12} y2={g.priceBottom+12}/><text className="rsi-axis" x={g.left} y={g.rsiTop-7}>{`RSI14 ${selectedRsi?.rsi?.toFixed(2)??'—'}${view.showSignal?` / SMA9 ${selectedRsi?.signal?.toFixed(2)??'—'}`:''}`}</text>
        {[0,25,50,75,100].map(v=><g key={v}><line className="rsi-grid" x1={g.left} x2={g.right} y1={g.rsiY(v)} y2={g.rsiY(v)}/><text className="rsi-axis" x={g.right+8} y={g.rsiY(v)+4}>{v}</text></g>)}
        <g clipPath={`url(#${oscClip})`}>{view.showLevels&&[29.5,33.5,40,43].map(v=><line key={v} className="rsi-reference" x1={g.left} x2={g.right} y1={g.rsiY(v)} y2={g.rsiY(v)}/>)}<path className="rsi-osc-line" d={rsiPath('rsi')}/>{view.showSignal&&<path className="rsi-signal-line" d={rsiPath('signal')}/>}</g>
      </g>}
      {selectedDate&&g.x(selectedDate)>=g.left&&g.x(selectedDate)<=g.right&&<g><line className="rsi-crosshair" x1={g.x(selectedDate)} x2={g.x(selectedDate)} y1={g.top} y2={g.bottom}/><rect className="rsi-date-badge" x={Math.max(g.left,Math.min(g.right-94,g.x(selectedDate)-47))} y={g.bottom+2} width="94" height="22"/><text className="rsi-date-text" x={Math.max(g.left+47,Math.min(g.right-47,g.x(selectedDate)))} y={g.bottom+17} textAnchor="middle">{view.frequency==='monthly'?selectedDate.slice(0,7):selectedDate}</text>{selected&&<><rect className="rsi-price-badge" x={g.right+1} y={Math.max(g.top,Math.min(g.priceBottom-18,g.y(selected[1])-9))} width={size.width-g.right-2} height="18"/><text className="rsi-price-text" x={g.right+size.axis.inset} y={Math.max(g.top+13,Math.min(g.priceBottom-5,g.y(selected[1])+4))} {...axisText(labels.price(selected[1]),true)}>{labels.price(selected[1])}</text></>}</g>}
      {hover&&<line className="rsi-crosshair" x1={g.left} x2={g.right} y1={hover.panel==='rsi'?g.rsiY(hover.value):g.y(hover.value)} y2={hover.panel==='rsi'?g.rsiY(hover.value):g.y(hover.value)}/>}
      {measurement.length===2&&<g className="rsi-measurement"><rect x={Math.min(g.x(measurement[0].date),g.x(measurement[1].date))} y={Math.min(anchorY(measurement[0]),anchorY(measurement[1]))} width={Math.max(1,Math.abs(g.x(measurement[0].date)-g.x(measurement[1].date)))} height={Math.max(1,Math.abs(anchorY(measurement[0])-anchorY(measurement[1])))}/><line x1={g.x(measurement[0].date)} x2={g.x(measurement[1].date)} y1={anchorY(measurement[0])} y2={anchorY(measurement[1])}/><text x={Math.max(g.left,Math.min(g.right-190,g.x(measurement[1].date)))} y={Math.max(g.top+16,Math.min(g.bottom-8,anchorY(measurement[1])-10))}>{`${axisNumber(measurement[1].value-measurement[0].value)} ${measurement[0].panel==='rsi'?'RSI pt':unit} (${measurement[0].value===0?'비율 미산출':((measurement[1].value/measurement[0].value-1)*100).toFixed(2)+'%'}) / ${Math.abs(day(measurement[1].date)-day(measurement[0].date))}일`}</text></g>}
      {marks.map(({key,items,marker,x,labelX,y})=><Fragment key={key}>
        <line className={`theme-event-guide ${marker.kind}`} data-date={marker.date} x1={x} x2={x} y1={y+8} y2={g.priceBottom} pointerEvents="none" aria-hidden="true"/>
        {labelX!==x&&<line className={`theme-event-guide theme-event-connector ${marker.kind}`} x1={labelX} x2={x} y1={y+8} y2={y+8} pointerEvents="none" aria-hidden="true"/>}
        <g className={`theme-event-mark ${marker.kind} ${items.some(item=>item.selected)?'selected':''}`} data-date={marker.date} data-anchor-x={x}
          role="button" tabIndex={active?0:-1} aria-label={`${marker.kind==='judgment'?'판정':'근거'} ${items.length>1?`${items.length}건`:marker.title} ${marker.date}`}
          onClick={event=>{event.stopPropagation();if(active){marker.onSelect();props.onMarker?.();}}}
          onKeyDown={event=>{if(active&&['Enter',' '].includes(event.key)){event.preventDefault();event.stopPropagation();marker.onSelect();props.onMarker?.();}}}>
          <title>{`${items.map(item=>item.title).join(' / ')} / ${marker.date}`}</title><rect x={labelX-12} y={y-8} width={24} height={16} rx={2}/><text x={labelX} y={y+4} textAnchor="middle">{marker.label}{items.length>1?items.length:''}</text>
        </g>
      </Fragment>)}
      <g data-price-axis="true"><title>가격축 · 드래그·휠로 확대·축소 · 두 번 눌러 자동 맞춤</title><rect x={g.right} y={g.top} width={Math.max(1,size.width-g.right)} height={Math.max(1,g.priceBottom-g.top)} fill="transparent" pointerEvents="all" style={{cursor:'ns-resize',touchAction:'none'}}/></g>
      <g data-time-axis="true"><title>시간축 · 좌우 드래그하여 시간 간격 확대·축소 · 두 번 눌러 전체 범위</title><rect x={g.left} y={g.bottom} width={g.right-g.left} height={Math.max(1,size.height-g.bottom)} fill="transparent" pointerEvents="all" style={{cursor:'ew-resize',touchAction:'none'}}/></g>
    </svg>
    {active&&props.overlay?.(overlayBounds)}
  </div>;
}
