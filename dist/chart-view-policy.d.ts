export interface ChartSpacingBounds {scope:string;minSpan:number;maxSpan:number;sourceLimit:number}
export interface SpacingRange {start:string|number;end:string|number;min:string|number;max:string|number;unit?:'seconds'|'days';step?:number;minSpan?:number;maxSpan?:number;allowEmpty?:boolean;contextKey?:string;spacingBounds?:ChartSpacingBounds}
export interface ChartSpacingOptions {frequency?:string;plotWidth:number;minBarSpacing?:number;maxBarSpacing?:number;maxBars?:number}
export const CHART_SPACING:Readonly<{minBarSpacing:number;maxBarSpacing:number;maxBars:number}>;
export function candleBodyWidth(plotWidth:number,span:number,interval?:number):number;
export function withChartSpacing<T extends SpacingRange>(range:T,options:ChartSpacingOptions):T;
export function withChartSpacing<T extends SpacingRange>(range:T|null,options:ChartSpacingOptions):T|null;
export function retargetChartRange<T extends SpacingRange>(range:SpacingRange|null,target:T,options?:{maxBars?:number;minBars?:number}):T;
