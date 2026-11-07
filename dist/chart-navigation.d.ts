import type { ChartSpacingBounds } from './chart-view-policy.js';
export interface ChartRange {start:string;end:string;min:string;max:string;minSpan?:number;allowEmpty?:boolean;maxSpan?:number;contextKey?:string;spacingBounds?:ChartSpacingBounds}
export function fitRange(range:ChartRange):ChartRange;
export function zoomRange(range:ChartRange,factor:number,anchor?:number):ChartRange;
export function panRange(range:ChartRange,fraction:number):ChartRange;
export interface WheelViewport {range:ChartRange;start:number;length:number}
export function accumulateWheelRange(range:ChartRange,previous?:WheelViewport|null,movement?:{factor?:number;pan?:number;anchor?:number}):WheelViewport;
export function bindChartNavigation(options:{element:HTMLElement;getRange:()=>ChartRange|null;getTool?:()=>string;onRangeChange:(range:ChartRange)=>void;onReset:()=>void;getPriceAxis?:()=>({min:number;max:number;scale:string;top:number;bottom:number;right:number;inverted?:boolean}|null);onPriceRangeChange?:((domain:{min:number;max:number})=>void)|null;onPriceReset?:(()=>void)|null;getContext?:(()=>{label:string;copyText:string}|null);onAnnounce?:(text:string)=>void;onGestureStart?:((label:string)=>void)|null;onGestureEnd?:(()=>void)|null;onMenuOpen?:(()=>void)|null;zoomAnchor?:'right'|'pointer'|'center';signal?:AbortSignal}):{toolbar:HTMLElement;menu:HTMLElement;update:()=>void;openMenu:(point?:{clientX:number;clientY:number})=>void;cancelGesture:()=>void;destroy:()=>void};
