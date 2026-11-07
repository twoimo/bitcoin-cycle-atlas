export interface PriceScale {
  scale:'linear'|'log';min:number;max:number;top:number;bottom:number;inverted:boolean;mode:'auto'|'manual';
  y:(price:number)=>number;invert:(pixel:number)=>number;ticks:number[];
}
export function createPriceScale(values:readonly number[],options?:{
  scale?:'linear'|'log';top?:number;bottom?:number;tickCount?:number;factor?:number;offset?:number;inverted?:boolean;
  paddingRatio?:number|null;domain?:{min:number;max:number}|null;
}):PriceScale;
export function barPriceChange(close:number,previousClose:number|null,open?:number|null):{
  changeBasis:'previous-close';previousClose:number|null;changePrice:number|null;changePct:number|null;
  previousCloseChangePct:number|null;fromOpenChangePrice:number|null;fromOpenChangePct:number|null;
};
export function nearestDailyIndex(rows:readonly {date:string}[],day:string|number):number;
export function measureDailyRange(rows:readonly {date:string;price:number}[],measurement:{startDate:string;endDate?:string}|null,split?:string|null):{
  startDate:string;endDate:string|null;startPrice:number;endPrice:number|null;deltaDays:number|null;
  changePrice:number|null;changePct:number|null;includesSimulated:boolean;kind:'simulated'|'observed';
}|null;
