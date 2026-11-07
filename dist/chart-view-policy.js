import { utcDay, dateFromDay } from './cycle-engine.js?v=1.29.0';
import { chartInterval, isIntradayInterval } from './ohlc-data.js?v=1.29.0';
import { normalizePriceDomain } from './price-axis.js?v=1.29.0';

const DAY = 86400;
const FIRST = Date.parse('1800-01-01T00:00:00Z') / 1000;
const AFTER = Date.parse('2401-01-01T00:00:00Z') / 1000;
const iso = seconds => new Date(seconds * 1000).toISOString();
const positiveInteger = value => Number.isSafeInteger(value) && value > 0;
const selectedSeconds = value => typeof value === 'number' ? value : typeof value === 'string' ? Date.parse(value.length === 10 ? `${value}T00:00:00Z` : value) / 1000 : NaN;

// Atlas rendering guardrails, not measurements claimed from a reference UI.
// A weekly interval is seven days even when its navigation range uses days.
export const CHART_SPACING = Object.freeze({ minBarSpacing:.5, maxBarSpacing:64, maxBars:6000 });
/** One candle body policy for every source; zoom changes spacing, never data. */
export function candleBodyWidth(plotWidth,span,interval=1) {
  if(![plotWidth,span,interval].every(value=>Number.isFinite(value)&&value>0))return .7;
  return Math.max(.7,Math.min(CHART_SPACING.maxBarSpacing,plotWidth*interval/span)*.68);
}
export function withChartSpacing(range,{frequency='daily',plotWidth,minBarSpacing=CHART_SPACING.minBarSpacing,maxBarSpacing=CHART_SPACING.maxBarSpacing,maxBars=CHART_SPACING.maxBars}={}) {
  if (!range) return range;
  if (![minBarSpacing,maxBarSpacing].every(value=>Number.isFinite(value)&&value>0) || maxBarSpacing<minBarSpacing || !positiveInteger(maxBars) || maxBars<2) throw new RangeError('Invalid chart spacing budget');
  if (!Number.isFinite(plotWidth)||plotWidth<=0) return range;
  const seconds=range.unit==='seconds',step=seconds?range.step:DAY;
  if (!positiveInteger(step)) throw new RangeError('Invalid viewport interval');
  // Monthly observations retain their real dates. This nominal duration only
  // limits screen density; it never produces monthly observations or candles.
  const interval=frequency==='monthly'?DAY*365.2425/12:chartInterval(frequency).seconds;
  const unitsPerBar=Math.max(1,interval/step),read=value=>seconds?value:selectedSeconds(value);
  const start=read(range.start),end=read(range.end),min=read(range.min),max=read(range.max);
  if (![start,end,min,max].every(Number.isFinite)||end<start||max<min) throw new RangeError('Invalid viewport bounds');
  const count=Math.round((end-start)/step)+1,available=Math.round((max-min)/step)+1;
  const minBars=Math.max(2,Math.ceil(plotWidth/maxBarSpacing)+1),visibleBudget=Math.max(minBars,Math.min(maxBars,Math.floor(plotWidth/minBarSpacing)+1));
  const minimum=Math.ceil((minBars-1)*unitsPerBar)+1,maximum=Math.floor((visibleBudget-1)*unitsPerBar)+1;
  const scope=JSON.stringify([seconds?'seconds':'days',step,frequency,min,max,range.allowEmpty===true,minBarSpacing,maxBarSpacing,maxBars]);
  const previous=range.spacingBounds;
  const retained=previous?.scope===scope&&[previous.minSpan,previous.maxSpan,previous.sourceLimit].every(positiveInteger)&&previous.maxSpan>=previous.minSpan;
  const sourceLimit=retained?previous.sourceLimit:range.allowEmpty===true?(range.maxSpan??Math.max(available,count)):Math.min(range.maxSpan??available,available);
  // Explicit Fit/date windows may exceed the usual density bounds. Retain
  // those exceptions with the viewport, so a zoom-in followed by zoom-out can
  // return to the fitted range. Recomputing from only the latest count would
  // ratchet the limit inward on every gesture. This is UI state, never data.
  const spacingBounds={scope,minSpan:Math.min(retained?previous.minSpan:count,count),maxSpan:Math.max(retained?previous.maxSpan:count,count),sourceLimit};
  const minSpan=Math.max(1,Math.min(minimum,spacingBounds.minSpan,sourceLimit));
  const maxSpan=Math.max(minSpan,Math.min(sourceLimit,Math.max(maximum,spacingBounds.maxSpan)));
  return {...range,minSpan,maxSpan,spacingBounds};
}

/** Preserve the UTC center/duration when a native chart changes candle grid. */
export function retargetChartRange(range,target,{maxBars=CHART_SPACING.maxBars,minBars=2}={}) {
  if (!range||!target) return target;
  if (range.unit!=='seconds'||target.unit!=='seconds'||![range.step,target.step,maxBars,minBars].every(positiveInteger)||maxBars<minBars) throw new RangeError('Invalid native viewport grid');
  if (![range.start,range.end,target.min,target.max].every(Number.isSafeInteger)||range.end<range.start||target.max<target.min) throw new RangeError('Invalid native viewport bounds');
  const duration=range.end-range.start+range.step,center=range.start+duration/2,step=target.step;
  const count=Math.max(minBars,Math.min(maxBars,Math.ceil(duration/step)));
  const first=target.min+Math.round((center-count*step/2-target.min)/step)*step;
  const earliest=target.min+Math.ceil((FIRST-target.min)/step)*step,latest=target.min+Math.floor((AFTER-count*step-target.min)/step)*step;
  const start=Math.max(earliest,Math.min(latest,first)),end=start+(count-1)*step;
  const allowEmpty=range.allowEmpty===true||start<target.min||end>target.max;
  return {...target,start,end,allowEmpty,minSpan:Math.min(target.minSpan??minBars,count),maxSpan:Math.max(target.maxSpan??Math.round((target.max-target.min)/step)+1,count)};
}

/** Preserve UTC center, duration and raw USD Y. Only the target grid/budget changes. */
export function transitionViewport({ fromFrequency, toFrequency, range, selectedDate = null, selectedTime = null, priceDomain = null, scale = 'log', maxBars = 6000, minBars = 12, minDays = 30 } = {}) {
  const from = chartInterval(fromFrequency), to = chartInterval(toFrequency), intraday = isIntradayInterval(toFrequency);
  if (![maxBars,minBars,minDays].every(positiveInteger) || maxBars < minBars) throw new RangeError('Invalid viewport budget');
  if (!range) return { frequency: toFrequency, unit: intraday ? 'seconds' : 'days', range: null, selectedDate, selectedTime, priceDomain: normalizePriceDomain(priceDomain,{scale}), limited: false, notice: '' };
  const sourceIntraday = isIntradayInterval(fromFrequency);
  const first = sourceIntraday ? range.start : utcDay(range.start) * DAY;
  const after = sourceIntraday ? range.end + from.seconds : (utcDay(range.end) + 1) * DAY;
  if (![first,after].every(Number.isSafeInteger) || after <= first) throw new RangeError('Invalid source viewport');
  const center = first + (after-first)/2, step = intraday ? to.seconds : DAY;
  const requested = Math.max(1,Math.ceil((after-first)/step));
  const count = Math.min(Math.floor((AFTER-FIRST)/step),intraday ? Math.max(minBars,Math.min(maxBars,requested)) : Math.max(minDays,requested));
  const centeredStart = Math.round((center - count*step/2)/step)*step;
  const start = Math.max(FIRST,Math.min(AFTER-count*step,centeredStart)), end = start + (count-1)*step;
  const selection = selectedSeconds(sourceIntraday ? selectedTime : selectedDate);
  const alignedSelection = Number.isFinite(selection) ? Math.floor(selection/step)*step : null;
  const limited = count !== requested || start !== centeredStart;
  const notice = limited ? `간격을 바꾸며 ${start===centeredStart?'UTC 중심은 유지하고 ':''}표시 기간을 ${count.toLocaleString('en-US')}${intraday?'봉':'일'}로 조정했습니다.${start!==centeredStart?' 지원 날짜는 1800–2400년입니다.':''} 수동 가격 범위는 유지됩니다.` : '';
  return { frequency: toFrequency, unit: intraday ? 'seconds' : 'days',
    range: intraday ? {start,end} : {start:dateFromDay(start/DAY),end:dateFromDay(end/DAY)},
    selectedDate: alignedSelection === null ? null : dateFromDay(Math.floor(alignedSelection/DAY)),
    selectedTime: alignedSelection === null ? null : iso(alignedSelection),
    priceDomain: normalizePriceDomain(priceDomain,{scale}), limited, notice };
}

/** datetime-local inputs are explicitly UTC; browser/local timezone is unused. */
export function parseUtcInput(value, { intraday = false } = {}) {
  if (typeof value !== 'string') return null;
  if (!intraday) { try { const time=utcDay(value)*DAY;return time>=FIRST&&time<AFTER?time:null; } catch { return null; } }
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2})?$/.test(value)) return null;
  const canonical = value.length === 16 ? `${value}:00` : value;
  const time = Date.parse(`${canonical}Z`);
  if (!Number.isFinite(time) || time<FIRST*1000 || time>=AFTER*1000 || new Date(time).toISOString().slice(0,19) !== canonical) return null;
  return time / 1000;
}

/** Validate a requested view without creating or claiming any missing candle. */
export function parseGoToRequest({ frequency = 'daily', mode = 'point', start, end, currentRange = null, now = Date.now(), loadedStart = null, loadedEnd = null, maxBars = 6000, maxDays = 36600 } = {}) {
  const interval = chartInterval(frequency), intraday = isIntradayInterval(frequency), step = intraday ? interval.seconds : DAY;
  const fail = (code,message) => ({ok:false,code,message});
  if (!['point','range'].includes(mode)) return fail('invalid-mode','이동 방식을 선택해 주세요.');
  const first = parseUtcInput(start,{intraday}), last = mode === 'range' ? parseUtcInput(end,{intraday}) : first;
  if (first === null || last === null) return fail('invalid-date',`1800–2400년 안의 유효한 UTC ${intraday?'날짜와 시각':'날짜'}를 입력해 주세요.`);
  if (last < first) return fail('reversed','끝은 시작보다 앞설 수 없습니다.');
  if (intraday && (first % step !== 0 || last % step !== 0)) return fail('off-grid',`${interval.label} 봉 시작 격자에 맞는 UTC 시각을 입력해 주세요. 현재 간격은 ${interval.seconds/60}분입니다.`);
  const latestCompleted = Math.floor(now/1000/step)*step-step;
  if (intraday && last > latestCompleted) return fail('unfinished',`아직 완료되지 않은 봉은 선택할 수 없습니다. 마지막 완료 봉 시작은 ${iso(latestCompleted).slice(0,16).replace('T',' ')} UTC입니다.`);
  let viewStart=first,viewEnd=last;
  const limit = intraday ? maxBars : maxDays;
  if (mode === 'range' && (last-first)/step+1 > limit) return fail('too-wide',`한 화면에는 최대 ${limit.toLocaleString('en-US')}${intraday?'봉':'일'}까지 직접 지정할 수 있습니다. 범위를 줄여 주세요.`);
  if (mode === 'point') {
    const oldStart=intraday ? currentRange?.start : selectedSeconds(currentRange?.start), oldEnd=intraday ? currentRange?.end : selectedSeconds(currentRange?.end);
    const count=Number.isFinite(oldStart)&&Number.isFinite(oldEnd)&&oldEnd>=oldStart ? Math.round((oldEnd-oldStart)/step)+1 : intraday ? 120 : 180;
    const bounded=Math.max(intraday?12:30,Math.min(limit,count));
    viewStart=first-Math.floor((bounded-1)/2)*step;viewEnd=viewStart+(bounded-1)*step;
    if(viewStart<FIRST){viewEnd+=FIRST-viewStart;viewStart=FIRST;}
    if(viewEnd>=AFTER){viewStart-=viewEnd-(AFTER-step);viewEnd=AFTER-step;}
  }
  const low=selectedSeconds(loadedStart),high=selectedSeconds(loadedEnd),outside=Number.isFinite(low)&&Number.isFinite(high)&&(first<low||last>high);
  return {ok:true,code:outside?'outside-loaded':'ready',message:outside?'현재 불러온 자료 밖입니다. 조회 결과의 실제 봉만 표시하며, 없는 구간은 비워 둡니다.':'입력한 UTC 범위로 이동합니다.',
    unit:intraday?'seconds':'days',frequency,
    range:intraday?{start:viewStart,end:viewEnd}:{start:dateFromDay(viewStart/DAY),end:dateFromDay(viewEnd/DAY)},
    selectedDate:dateFromDay(Math.floor(first/DAY)),selectedTime:iso(first)};
}
