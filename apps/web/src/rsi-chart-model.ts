import type { Point } from '@atlas/contracts/market-lab';
import type { RsiBar } from '@atlas/domain/rsi-bars';
import type { RsiRow } from '@atlas/domain/market-lab';
import { zoomRange,panRange, type ChartRange } from '../../../dist/chart-navigation.js';
import { rsiChartLayout } from '../../../dist/rsi-chart-layout.js';
import { createPriceScale } from '../../../dist/chart-math.js';
import { withChartSpacing,type ChartSpacingBounds } from '../../../dist/chart-view-policy.js';
export type Tool='crosshair'|'pan'|'measure';
export type Pane='data'|'indicators'|'settings'|'method'|'help'|'export'|'date'|'search'|null;
export interface Anchor {date:string;value:number;panel:'price'|'rsi'}
export interface RsiChartView {
  start:string;end:string;selected:string;frequency:'daily'|'weekly'|'monthly';scale:'log'|'linear';chartType:'line'|'candles';tool:Tool;
  autoScale:boolean;domain:{min:number;max:number}|null;inverted:boolean;magnet:'off'|'weak'|'strong';
  showRsi:boolean;showSignal:boolean;showLevels:boolean;showCrossings:boolean;showVolume:boolean;measurement:Anchor[];
  spacingBounds?:ChartSpacingBounds;
}
export interface RsiChartCache {view:RsiChartView;undo:RsiChartView[];redo:RsiChartView[]}
export const day=(date:string)=>Date.parse(date+'T00:00:00Z')/86400000;
export const date=(value:number)=>new Date(Math.round(value)*86400000).toISOString().slice(0,10);
export function initialChartView(prices:readonly Point[]):RsiChartView {
  return {start:prices[0]?.[0]||'',end:prices.at(-1)?.[0]||'',selected:prices.at(-1)?.[0]||'',frequency:'daily',scale:'log',chartType:'line',tool:'crosshair',autoScale:true,domain:null,inverted:false,magnet:'off',showRsi:true,showSignal:true,showLevels:true,showCrossings:true,showVolume:false,measurement:[]};
}
export function chartRange(view:RsiChartView,prices:readonly Point[]):ChartRange|null {
  if(!prices.length)return null;
  return {start:view.start||prices[0][0],end:view.end||prices.at(-1)![0],min:prices[0][0],max:prices.at(-1)![0],minSpan:10,allowEmpty:true,maxSpan:Math.max(10,day(prices.at(-1)![0])-day(prices[0][0])+1),...(view.spacingBounds?{spacingBounds:view.spacingBounds}:{})};
}
export function boundedDates(prices:readonly Point[],start:string,end:string) {
  if(!prices.length)return {start:'',end:''};
  const min=day(prices[0][0]),max=day(prices.at(-1)![0]);
  if(!Number.isFinite(day(start))||!Number.isFinite(day(end))||day(end)<day(start))throw new RangeError('표시할 날짜 범위를 확인하세요.');
  const length=Math.min(max-min,Math.max(9,day(end)-day(start))),first=Math.max(min,Math.min(max-length,day(start)));
  return {start:date(first),end:date(first+length)};
}
export function nearestPoint(prices:readonly Point[],target:string):number {
  if(!prices.length)return -1;let left=0,right=prices.length-1;
  while(left<right){const mid=(left+right)>>1;if(prices[mid][0]<target)left=mid+1;else right=mid;}
  if(left>0&&Math.abs(day(prices[left-1][0])-day(target))<Math.abs(day(prices[left][0])-day(target)))return left-1;
  return left;
}
export function applyChartCommand(view:RsiChartView,prices:readonly Point[],action:string,value?:unknown,plotWidth=800):RsiChartView {
  const sourceRange=chartRange(view,prices);if(!sourceRange)return view;
  const range=withChartSpacing(sourceRange,{frequency:view.frequency,plotWidth});
  if(action==='zoom'){const next=zoomRange(range,Number(value),1);return {...view,start:next.start,end:next.end,spacingBounds:next.spacingBounds};}
  if(action==='pan'){const next=panRange(range,Number(value));return {...view,start:next.start,end:next.end,spacingBounds:next.spacingBounds};}
  if(action==='fit')return {...view,start:range.min,end:range.max,domain:null,autoScale:true};
  if(action==='span'){const days=Number(value);return {...view,...boundedDates(prices,days?date(day(range.max)-days):range.min,range.max),domain:null,autoScale:true};}
  if(action==='tool'&&['crosshair','pan','measure'].includes(String(value)))return {...view,tool:value as Tool};
  if(action==='scale')return {...view,scale:view.scale==='log'?'linear':'log',autoScale:true,domain:null};
  if(action==='auto-scale')return {...view,autoScale:true,domain:null};
  if(action==='invert-scale')return {...view,inverted:!view.inverted};
  if(action==='type')return {...view,chartType:view.chartType==='line'?'candles':'line'};
  if(action==='frequency'&&(value==='daily'||value==='weekly'))return {...view,frequency:value,measurement:[]};
  if(action==='magnet')return {...view,magnet:value==='off'||value==='weak'||value==='strong'?value:view.magnet==='off'?'weak':view.magnet==='weak'?'strong':'off'};
  if(action==='clear-measurement')return {...view,measurement:[]};
  if(action==='toggle'&&typeof value==='string'&&['showRsi','showSignal','showLevels','showCrossings','showVolume'].includes(value))return {...view,[value]:!view[value as keyof RsiChartView]};
  if(action==='date'&&typeof value==='string'){
    const at=nearestPoint(prices,value);if(at<0||!Number.isFinite(day(value)))return view;const picked=prices[at][0],span=day(view.end)-day(view.start);
    return {...view,selected:picked,...(picked<view.start||picked>view.end?boundedDates(prices,date(day(picked)-span/2),date(day(picked)+span/2)): {})};
  }
  return view;
}
export function chartGeometry(prices:readonly Point[],bars:readonly RsiBar[],rows:readonly RsiRow[],view:RsiChartView,width:number,height:number,axisGutter?:number) {
  const {left,right,top,bottom,priceBottom,rsiTop}=rsiChartLayout(width,height,view.showRsi,axisGutter);
  const visible=prices.filter(p=>p[0]>=view.start&&p[0]<=view.end),visibleBars=bars.filter(p=>p[0]>=view.start&&p[0]<=view.end);
  const values=visible.length?(view.chartType==='candles'&&visibleBars.length?visibleBars.flatMap(b=>[b[2],b[3]]):visible.map(p=>p[1])):prices.map(p=>p[1]);
  const axis=createPriceScale(values.length?values:[1,2],{scale:view.scale,top,bottom:priceBottom,inverted:view.inverted,
    tickCount:Math.max(2,Math.min(width<600?5:7,Math.floor((priceBottom-top)/38)+1)),domain:view.autoScale?null:view.domain});
  const {min,max,y,invert:fromY,ticks}=axis,span=Math.max(1,day(view.end)-day(view.start));
  const x=(d:string)=>left+(day(d)-day(view.start))/span*(right-left);
  const rsiY=(v:number)=>bottom-v/100*(bottom-rsiTop);
  return {left,right,top,bottom,priceBottom,rsiTop,x,y,fromY,rsiY,ticks,min,max,axis,visible,visibleBars,visibleRows:rows.filter(r=>r.date>=view.start&&r.date<=view.end)};
}
