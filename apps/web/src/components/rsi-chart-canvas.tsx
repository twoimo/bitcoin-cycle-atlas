import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { Point } from '@atlas/contracts/market-lab';
import type { RsiRow } from '@atlas/domain/market-lab';
import type { RsiBar } from '@atlas/domain/rsi-bars';
import { mountInstrumentChartLegend } from '../../../../dist/ui/instrument-chart-legend.js';
import { mountQuoteHud } from '../../../../dist/ui/quote-hud.js';
import type { RsiChartView } from '../rsi-chart-model.js';
import { rsiCrossings } from '../rsi-crossings.js';
import type { InstrumentSeries } from '../instrument-chart-model.js';
import { FunnestInstrumentPlot, type NativePricePaneBounds } from './funnest-instrument-plot.js';
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
/** Real painted signal-label boxes in the overlay owner's CSS coordinates. */
export function readRsiSignalLabelBounds(root: Element): NonNullable<ChartOverlayGeometry['protectedAnchors']> {
  const origin = root.getBoundingClientRect();
  return [...root.querySelectorAll('.atlas-funnest-instrument-plot svg text')].filter(node => /^(Buy|Sell)\s/.test(node.textContent || '')).flatMap(node => {
    const box = node.getBoundingClientRect();
    return box.width > 0 && box.height > 0 && [box.left, box.top, box.width, box.height].every(Number.isFinite)
      ? [{ x: box.left - origin.left, y: box.top - origin.top, width: box.width, height: box.height }] : [];
  });
}
interface Props {menuPulse:number;symbol:string;unit:string;prices:Point[];bars:RsiBar[];rows:RsiRow[];view:RsiChartView;active:boolean;
  onView:(view:RsiChartView)=>void;onStart:()=>void;onEnd:()=>void;onPick:(pick:Pick)=>void;onHover:(pick:Pick|null)=>void;hover:Pick|null;svgRef:React.RefObject<SVGSVGElement|null>;
  series?:InstrumentSeries;markers?:InstrumentMarker[];onMarker?:()=>void;volumeUnit?:string;description?:string;className?:string;revision?:string;quote?:ChartQuote;overlay?:(geometry:ChartOverlayGeometry)=>React.ReactNode}

/**
 * The former bespoke SVG price/RSI renderer is replaced by Funnest React chart primitives.
 * Atlas still owns source data, view state, quote HUD, evidence labels and overlay integrations.
 */
export function RsiChartCanvas(props:Props) {
  const {symbol,unit,prices,bars,rows,view,active,onPick,onHover,hover,svgRef}=props;
  const root=useRef<HTMLDivElement>(null),quoteHost=useRef<HTMLDivElement>(null),legend=useRef<ReturnType<typeof mountInstrumentChartLegend>|null>(null),quoteHud=useRef<ReturnType<typeof mountQuoteHud>|null>(null);
  const [size,setSize]=useState({width:900,height:520,viewportWidth:900});
  const [nativeLayout,setNativeLayout]=useState<{symbol:string;bounds:NativePricePaneBounds}|null>(null);
  const [signalLayout,setSignalLayout]=useState<{symbol:string;boxes:NonNullable<ChartOverlayGeometry['protectedAnchors']>}>({symbol,boxes:[]});
  const onPlotGeometry=useCallback((bounds:NativePricePaneBounds)=>setNativeLayout(previous=>previous?.symbol===symbol&&JSON.stringify(previous.bounds)===JSON.stringify(bounds)?previous:{symbol,bounds}),[symbol]);
  const nativePricePane=nativeLayout?.symbol===symbol?nativeLayout.bounds:undefined;
  const protectedAnchors=signalLayout.symbol===symbol?signalLayout.boxes:[];
  const crossing=useMemo(()=>view.showCrossings?rsiCrossings(rows).filter(item=>item.date>=view.start&&item.date<=view.end):[],[rows,view.showCrossings,view.start,view.end]);
  const chartDates=useMemo(()=>{const timeline=props.series?.timeline??prices.map(point=>point[0]);const first=timeline.findIndex(stamp=>stamp>=view.start),last=timeline.findLastIndex(stamp=>stamp<=view.end);return timeline.slice(first<0?0:first,last<0?timeline.length:last+1);},[props.series?.timeline,prices,view.start,view.end]);
  const overlayBounds:ChartOverlayGeometry={width:size.width,height:size.height,left:64,right:Math.max(64,size.width-68),top:20,bottom:Math.max(120,size.height-30),viewportWidth:size.viewportWidth,...nativePricePane,protectedAnchors};
  useLayoutEffect(()=>{
    if(!quoteHost.current)return;
    const controller=mountQuoteHud(quoteHost.current);quoteHud.current=controller;
    return()=>{controller.destroy();quoteHud.current=null;};
  },[]);
  useLayoutEffect(()=>{
    quoteHud.current?.update(props.quote||{symbol,name:symbol,interval:({daily:'1D',weekly:'1W',monthly:'1M'})[view.frequency],kind:'unavailable',rsiReason:'관측 계기판 자료 없음',description:props.description});
  },[props.quote,symbol,view.frequency,props.description]);
  useLayoutEffect(()=>{
    if(!root.current)return;
    const measure=()=>{const node=root.current;if(!node)return;const width=node.clientWidth||900,height=node.clientHeight||520,viewportWidth=node.ownerDocument.defaultView?.innerWidth||width;setSize(previous=>previous.width===width&&previous.height===height&&previous.viewportWidth===viewportWidth?previous:{width,height,viewportWidth});};
    measure();const observer=typeof ResizeObserver==='undefined'?null:new ResizeObserver(measure);if(root.current)observer?.observe(root.current);
    const win=root.current?.ownerDocument.defaultView;win?.addEventListener('resize',measure);
    return()=>{observer?.disconnect();win?.removeEventListener('resize',measure);};
  },[]);
  useLayoutEffect(()=>{
    if(!root.current)return;
    const controller=mountInstrumentChartLegend({plot:root.current});legend.current=controller;
    return()=>{controller.destroy();legend.current=null;};
  },[symbol]);
  useLayoutEffect(()=>{
    legend.current?.update({...props,prices,bars,rows,view},overlayBounds);
  },[symbol,unit,prices,bars,rows,view,active,size,props.series,props.markers,props.volumeUnit,nativeLayout,signalLayout]);
  useLayoutEffect(()=>{
    if(!root.current)return;
    const boxes=readRsiSignalLabelBounds(root.current);
    setSignalLayout(previous=>previous.symbol===symbol&&JSON.stringify(previous.boxes)===JSON.stringify(boxes)?previous:{symbol,boxes});
  });
  return <div className={`atlas-plot rsi-chart-canvas ${props.className||''}`} ref={root} data-tool={view.tool} data-chart={props.series?'instrument-price':'rsi-price'} data-chart-engine="funnest"
    onKeyDownCapture={event=>{if((event.target as Element).closest('button,input,summary,textarea,select'))return;const step=event.shiftKey?10:1;const selected=props.hover?.date??view.selected;const base=Math.max(0,chartDates.indexOf(selected));let next:number|null=null;if(event.key==='Home')next=0;else if(event.key==='End')next=chartDates.length-1;else if(event.key==='ArrowLeft')next=Math.max(0,base-step);else if(event.key==='ArrowRight')next=Math.min(chartDates.length-1,base+step);if(next===null||!chartDates[next])return;const stamp=chartDates[next],panel=(event.target as Element).closest('[data-panel="rsi"]')?'rsi':'price',value=panel==='rsi'?rows.find(row=>row.date===stamp)?.rsi:prices.find(point=>point[0]===stamp)?.[1];if(typeof value==='number'&&Number.isFinite(value)){event.preventDefault();props.onPick({date:stamp,value,panel});}}}>
    <div ref={quoteHost}/>
    <FunnestInstrumentPlot symbol={symbol} unit={unit} prices={prices} bars={bars} rows={rows} view={view} active={active} onPick={onPick} onHover={onHover} hover={hover} onView={props.onView} onStart={props.onStart} onEnd={props.onEnd} chartHeight={Math.max(300,size.height-72)} chartWidth={size.width} menuPulse={props.menuPulse} onMarker={props.onMarker}
      series={props.series} markers={props.markers} crossings={crossing} volumeUnit={props.volumeUnit} description={props.description} svgRef={svgRef} nativePricePane={nativePricePane} onPlotGeometry={onPlotGeometry}/>
    {active&&props.overlay?.(overlayBounds)}
  </div>;
}
