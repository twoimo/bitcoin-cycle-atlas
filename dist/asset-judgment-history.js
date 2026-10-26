import { utcDay, dateFromDay, validateDataset } from './cycle-engine.js?v=1.19.0';
import { ASSET_JUDGMENTS, ASSET_COMPARISON_VERSION, comparisonAsOf, comparisonPercentage as pct, comparisonMean as mean, classifyAssetComparison as classify, comparisonCoverageSummary } from './asset-comparison.js?v=1.28.0';

export const HISTORY_KIND = 'reconstructed';
export const HISTORY_NOTE = '현재 보관 원자료 버전으로 재계산한 이력입니다. 당시 운영 판단·당시 공급자 원본·거래 가능 시점을 복원한 기록이 아닙니다.';
export function yieldHistoryTask() {
  if (globalThis.scheduler?.yield) return globalThis.scheduler.yield();
  if (typeof MessageChannel === 'function') return new Promise(resolve => { const {port1,port2}=new MessageChannel(); port1.onmessage=()=>{port1.close();port2.close();resolve();};port2.postMessage(null); });
  return new Promise(resolve => setTimeout(resolve, 0));
}
const yearOf = date => Number(date.slice(0, 4));
function upper(values, value, get = x => x) {
  let lo = 0, hi = values.length;
  while (lo < hi) { const mid = (lo + hi) >>> 1; if (get(values[mid]) <= value) lo = mid + 1; else hi = mid; }
  return lo;
}
export async function fingerprintComparisonBundle(bundle) {
  if (!globalThis.crypto?.subtle) throw new Error('이 브라우저에서 원자료 버전을 검증할 수 없습니다.');
  const bytes = new TextEncoder().encode(JSON.stringify(bundle));
  return [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].map(v => v.toString(16).padStart(2, '0')).join('');
}

/** Validate once, index prefix activations, cache ordered prior-year means only. */
export function createAssetJudgmentHistory(bundle, { endDate, sourceVersion = '' } = {}) {
  if (!bundle || bundle.version !== 1 || !Array.isArray(bundle.assets) || !bundle.assets.length) throw new TypeError('Invalid asset comparison bundle');
  const end = comparisonAsOf(bundle, endDate), endDay = utcDay(end), symbols = new Set();
  let globalErrorDay = Infinity, firstDay = endDay;
  const series = bundle.assets.map(asset => {
    if (!asset || typeof asset.symbol !== 'string' || !asset.symbol || symbols.has(asset.symbol)) throw new TypeError('Invalid or duplicate comparison asset');
    symbols.add(asset.symbol);
    const meta = asset.meta ?? {};
    if (typeof meta !== 'object' || Array.isArray(meta)) throw new TypeError('Invalid metadata');
    const calendar = meta.calendar ?? 'sessions';
    if (!['sessions', 'calendar-days'].includes(calendar)) throw new TypeError('Unsupported calendar');
    for (const g of [meta.dataGranularity, meta.granularity]) if (g !== undefined && g !== '1d') throw new TypeError('Daily observations required');
    if (meta.adjustment !== undefined && meta.adjustment !== 'split-adjusted-close' && !(calendar === 'calendar-days' && meta.adjustment === 'none')) throw new TypeError('Unsupported price adjustment');
    const all = validateDataset(asset.prices), prices = all.filter(p => p.epochDay <= endDay), observed = new Set(all.map(p => p.date));
    const missing = meta.missingDates ?? [];
    if (!Array.isArray(missing)) throw new TypeError('missingDates must be an array');
    const missingDays = [], seen = new Set();
    for (const date of missing) {
      const day = utcDay(date);
      if (seen.has(date)) throw new TypeError('Duplicate missing date');
      seen.add(date); missingDays.push(day);
      if (observed.has(date)) globalErrorDay = Math.min(globalErrorDay, day);
    }
    missingDays.sort((a,b) => a-b);
    if (prices.length) firstDay = Math.min(firstDay, prices[0].epochDay);
    const periods = [], gapEnds = [], bands = new Map(); let period, prior;
    for (const point of prices) {
      if (prior && (calendar === 'calendar-days' ? point.epochDay - prior.epochDay !== 1 : point.epochDay - prior.epochDay > 7)) gapEnds.push(point.epochDay);
      const y = yearOf(point.date);
      if (!period || period.year !== y) { period = { year:y, first:point, last:point, high:point, low:point, peak:point, mddPct:0 }; periods.push(period); }
      period.last = point;
      if (point.price > period.high.price) period.high = point;
      if (point.price < period.low.price) period.low = point;
      if (point.price > period.peak.price) period.peak = point;
      try {
        period.mddPct = Math.min(period.mddPct, pct(point.price, period.peak.price));
        period.risePct = pct(period.high.price, period.first.price);
        period.fallPct = pct(period.low.price, period.first.price);
      } catch { globalErrorDay = Math.min(globalErrorDay, point.epochDay); }
      prior = point;
    }
    const info = Object.freeze({ symbol:asset.symbol, name:asset.name, group:asset.group, category:asset.category, currency:asset.currency || 'USD', firstDate:prices[0]?.date ?? null, lastDate:prices.at(-1)?.date ?? null, calendar,
      source:Object.freeze({name:meta.sourceName || '',url:meta.sourcePage || meta.sourceUrl || '',retrievedAt:meta.retrievedAt || bundle.retrievedAt || '',priceDefinition:meta.priceDefinition || ''}) });
    function at(day, date) {
      const pos = upper(prices, day, p=>p.epochDay)-1, latest = prices[pos] ?? null, year = yearOf(date);
      let b = bands.get(year);
      if (!b) {
        const priorPeriods = periods.filter(p=>p.year<year);
        b={sampleYears:priorPeriods.length,sampleStartYear:priorPeriods[0]?.year ?? null,sampleEndYear:priorPeriods.at(-1)?.year ?? null,meanRisePct:mean(priorPeriods.map(p=>p.risePct)),meanFallPct:mean(priorPeriods.map(p=>p.fallPct)),meanMddPct:mean(priorPeriods.map(p=>p.mddPct))};
        bands.set(year,b);
      }
      const currentPeriod=periods.find(p=>p.year===year), current=currentPeriod && currentPeriod.first.epochDay<=day ? currentPeriod : null;
      const first=pos>=0 ? prices[0] : null;
      const knownMissing=first ? missingDays.slice(upper(missingDays,first.epochDay-1),upper(missingDays,day)).map(dateFromDay) : [];
      const years=new Set(periods.filter(p=>p.first.epochDay<=day).map(p=>p.year)), missingYears=[];
      if(first)for(let y=yearOf(first.date);y<year;y++)if(!years.has(y))missingYears.push(y);
      const coverage=comparisonCoverageSummary({first,current:current ? {startDate:current.first.date} : null,calendar,missingDates:knownMissing,missingYears,gapCount:upper(gapEnds,day)});
      const ytdPct=current && latest ? pct(latest.price,current.first.price) : null;
      const judgment=classify({...b,ytdPct,current:current?.first??null,latest,year,asOfDay:day,coverage});
      return {...info,...b,asOf:date,year,firstDate:first?.date??null,lastDate:latest?.date??null,latestDate:latest?.date ?? null,latestPrice:latest?.price ?? null,yearStartDate:current?.first.date ?? null,yearStartPrice:current?.first.price ?? null,ytdPct,judgment,coverage,samplePartialFirstYear:Boolean(b.sampleYears&&coverage.firstYearPartial),firstPartialStartDate:b.sampleYears?coverage.firstPartialStartDate:null};
    }
    return {info,at};
  });
  function check(date) {const day=utcDay(date);if(day>endDay)throw new RangeError('Date exceeds reconstruction source cutoff');if(day>=globalErrorDay)throw new RangeError('이 기준일의 원자료 계산 또는 결측 메타데이터를 검증할 수 없습니다.');return day;}
  function snapshot(date) {const day=check(date);return {kind:HISTORY_KIND,sourceVersion,version:ASSET_COMPARISON_VERSION,asOf:date,year:yearOf(date),rows:series.map(s=>s.at(day,date))};}
  async function runs({startDate=dateFromDay(firstDay),endDate=end,signal,onProgress}={}) {
    const start=utcDay(startDate),stop=utcDay(endDate);if(start>stop||stop>endDay)throw new RangeError('Invalid history range');
    const output=series.map(s=>({...s.info,runs:[]}));
    for(let day=start;day<=stop;day++) {
      if(signal?.aborted)throw new DOMException('History cancelled','AbortError');
      const date=dateFromDay(day);
      for(let i=0;i<series.length;i++) {
        let result;
        if(day>=globalErrorDay)result={id:'calculation-error',label:'계산 확인 필요',reason:'이 기준일의 원자료 계산 검증 실패'};
        else result=series[i].at(day,date).judgment;
        const list=output[i].runs,last=list.at(-1),key=result.id+'|'+result.reason;
        if(last?.key===key){last.end=date;last.days++;}else list.push({key,start:date,end:date,days:1,id:result.id,label:result.label,reason:result.reason});
      }
      if((day-start)%128===0){onProgress?.((day-start+1)/(stop-start+1));await yieldHistoryTask();}
    }
    return {kind:HISTORY_KIND,sourceVersion,startDate,endDate,assets:output};
  }
  function* dailyRows({startDate=dateFromDay(firstDay),endDate=end,group='all',symbol}={}) {
    const start=utcDay(startDate),stop=utcDay(endDate);if(start>stop||stop>endDay)throw new RangeError('Invalid history range');
    for(let day=start;day<=stop;day++){const date=dateFromDay(day);check(date);for(const s of series)if((group==='all'||s.info.group===group)&&(!symbol||symbol===s.info.symbol))yield s.at(day,date);}
  }
  return Object.freeze({kind:HISTORY_KIND,sourceVersion,startDate:dateFromDay(firstDay),endDate:end,assets:Object.freeze(series.map(s=>s.info)),snapshot,runs,dailyRows,labels:ASSET_JUDGMENTS});
}
