import { calendarDate, validateSeries } from './market-lab-math.js';

export function validateRsiBars(input,prices) {
  validateSeries(prices,{positive:true});
  if(!Array.isArray(input)||input.length>20000)throw new TypeError('OHLC history is invalid');
  const closes=new Map(prices);let previous='';
  for(const row of input) {
    if(!Array.isArray(row)||row.length!==6)throw new TypeError('OHLC row is invalid');
    const [date,open,high,low,close,volume]=row;
    if(typeof date!=='string'||date<=previous||!closes.has(date)||close!==closes.get(date)||![open,high,low,close].every(v=>Number.isFinite(v)&&v>0)
      ||low>Math.min(open,close)||high<Math.max(open,close)||high<low||!(volume===null||Number.isSafeInteger(volume)&&volume>=0))throw new RangeError('OHLC identity, bounds or close mismatch');
    previous=date;
  }
  return input;
}
export function yahooRsiBars(payload,market,{now=new Date()}={}) {
  const item=payload?.chart?.result?.[0],q=item?.indicators?.quote?.[0];
  if(payload?.chart?.error||item?.meta?.symbol!==market.symbol||item.meta.dataGranularity!=='1d'||item.meta.currency!==market.unit||!q||!Array.isArray(item.timestamp))throw new Error('OHLC provider identity mismatch');
  const zone=item.meta.exchangeTimezoneName;
  if(zone!==market.timezone)throw new Error('OHLC exchange clock mismatch');
  const today=calendarDate(now,zone);if(!today)throw new Error('OHLC exchange clock missing');
  const closes=new Map(market.prices),bars=[],omitted=[];
  for(let i=0;i<item.timestamp.length;i++) {
    const date=calendarDate(item.timestamp[i]*1000,zone);if(!date||date>=today||!closes.has(date))continue;
    const row=[date,q.open?.[i],q.high?.[i],q.low?.[i],q.close?.[i],q.volume?.[i]??null];
    try {validateRsiBars([row],[[date,closes.get(date)]]);bars.push(row);}catch {omitted.push(date);}
  }
  validateRsiBars(bars,market.prices);
  return {bars,omitted,timezone:zone};
}
export function weeklyRsiPrices(prices) {
  const groups=new Map();
  for(const point of prices) {
    const day=new Date(point[0]+'T00:00:00Z');day.setUTCDate(day.getUTCDate()-((day.getUTCDay()+6)%7));groups.set(day.toISOString().slice(0,10),point);
  }
  return [...groups.values()];
}
export function weeklyRsiBars(bars) {
  const groups=new Map();
  for(const row of bars) {
    const day=new Date(row[0]+'T00:00:00Z');day.setUTCDate(day.getUTCDate()-((day.getUTCDay()+6)%7));const key=day.toISOString().slice(0,10),before=groups.get(key);
    groups.set(key,before?[row[0],before[1],Math.max(before[2],row[2]),Math.min(before[3],row[3]),row[4],before[5]===null||row[5]===null?null:before[5]+row[5]]:[...row]);
  }
  return [...groups.values()];
}
