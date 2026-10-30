import {drawAtlasPriceChart} from './atlas-price-chart.js?v=1.29.3';
import {buildCycleMilestones} from './cycle-milestones.js?v=1.29.0';
import {validateDataset,utcDay,dateFromDay} from './cycle-engine.js?v=1.29.0';
import {detectDirectionalChanges,computeRollingStates} from './market-structure.js?v=1.29.0';
import {BITCOIN_EVENTS} from './bitcoin-events.js?v=1.29.0';
import {clearChartHover} from './chart-hover.js?v=1.29.0';
import {retainPriceViewport} from './empty-price-chart.js?v=1.29.0';

const renderers=new WeakMap();
const positive=value=>Number.isFinite(value)&&value>0;
const clone=value=>JSON.parse(JSON.stringify(value));
function freeze(value){if(value&&typeof value==='object'&&!Object.isFrozen(value)){for(const child of Object.values(value))freeze(child);Object.freeze(value);}return value;}
const money=value=>positive(value)?'$'+new Intl.NumberFormat('en-US',{maximumFractionDigits:2}).format(value):'—';
const sourceLabel=value=>typeof value==='string'?value:value?.name??value?.label??value?.provider??'관측 자료';
const canonicalRows=values=>values.map(row=>Array.isArray(row)?{date:row[0],price:row[1]}:{...row});
function drawdown(rows,initialPeak=0){let peak=initialPeak;return rows.map(row=>{peak=Math.max(peak,row.price);return {...row,drawdownPct:(row.price/peak-1)*100};});}
function signature(value){let hash=2166136261;for(const char of JSON.stringify(value)){hash^=char.charCodeAt(0);hash=Math.imul(hash,16777619);}return (hash>>>0).toString(16).padStart(8,'0');}

/** Freeze presentation annotations from the already preserved model and its
 * consumed price prefix. The current model is never run to recreate an old
 * prediction. Labels are a present-day visualization of those preserved bytes,
 * not a claim that the annotation code existed when the model was published. */
export function createAtlasReplayContext({dataset,forecast,presentation={},originDate=forecast?.asOf}={}){
  if(!forecast||typeof forecast.asOf!=='string'||!Array.isArray(forecast.path))throw new TypeError('A preserved Atlas forecast and its input dataset are required');
  utcDay(forecast.asOf);utcDay(originDate);
  if(originDate>forecast.asOf)throw new RangeError('Replay origin cannot follow the captured forecast origin');
  const prefix=validateDataset(dataset).filter(row=>row.date<=forecast.asOf).map(row=>({date:row.date,price:row.price}));
  const replayPrefix=prefix.filter(row=>row.date<=originDate);
  const path=canonicalRows(forecast.path).map(row=>({...row,lower:row.lower??row.low??row.price,upper:row.upper??row.high??row.price}));
  if(!prefix.length||prefix.at(-1).date!==forecast.asOf||path[0]?.date!==forecast.asOf||path[0]?.price!==prefix.at(-1).price)throw new RangeError('Preserved chart model and consumed input must share the exact origin');
  if(path.some((row,index)=>!positive(row.price)||!positive(row.lower)||!positive(row.upper)||row.lower>row.price||row.upper<row.price||index&&row.date<=path[index-1].date))throw new RangeError('Preserved chart path is not a valid ordered price path');
  path.forEach(row=>utcDay(row.date));
  const normalized={...clone(forecast),path,nominalClock:clone(forecast.nominalClock??forecast.timing??null)};
  const futureMilestones=buildCycleMilestones(prefix,{forecast:normalized,asOf:forecast.asOf});
  // Selecting the first available venue bar puts the replay origin on the
  // preceding day. A missing earlier observation remains empty; it must not be
  // fabricated just to position the replay cursor.
  const pastMilestones=originDate===forecast.asOf?futureMilestones:replayPrefix.length?buildCycleMilestones(replayPrefix,{asOf:originDate}):{markers:[],intervals:[]};
  const markerMap=new Map(pastMilestones.markers.filter(marker=>marker.kind==='observed').map(marker=>[marker.id,marker]));
  for(const marker of futureMilestones.markers)if(marker.kind==='scenario'||marker.selectionKind==='scenario'){
    if(!markerMap.has(marker.id))markerMap.set(marker.id,marker);
  }
  const intervalMap=new Map(pastMilestones.intervals.filter(interval=>interval.selectionKind!=='scenario').map(interval=>[interval.id,interval]));
  for(const interval of futureMilestones.intervals)if(interval.selectionKind==='scenario')intervalMap.set(interval.id,interval);
  const milestones={markers:[...markerMap.values()],intervals:[...intervalMap.values()]};
  const pastTurns=(replayPrefix.length?detectDirectionalChanges(replayPrefix,{threshold:.12}).pivots:[]).filter(point=>point.confirmationDate<=originDate)
    .map(point=>({date:point.eventDate,price:point.eventPrice,type:point.type,confirmationDate:point.confirmationDate,replaySource:'observed'}));
  const complete=[...prefix,...path.filter(row=>row.date>forecast.asOf)];
  const futureTurns=detectDirectionalChanges(complete,{threshold:.12}).pivots.filter(point=>point.eventDate>forecast.asOf)
    .map(point=>({date:point.eventDate,price:point.eventPrice,type:point.type,confirmationDate:point.confirmationDate,replaySource:'forecast'}));
  const frozenPath=drawdown(path,Math.max(...prefix.map(row=>row.price)));
  // This signature identifies an unchanged annotation set during one replay.
  // Source authenticity uses the engine's cryptographic source/output hashes.
  const annotationSignature=signature({origin:originDate,forecastOrigin:forecast.asOf,markers:milestones.markers,intervals:milestones.intervals});
  return freeze({originDate,forecastOrigin:forecast.asOf,forecast:frozenPath,cycleMarkers:milestones.markers,cycleIntervals:milestones.intervals,
    turns:[...pastTurns,...futureTurns],events:(forecast.events??[]).filter(event=>event.inHorizon!==false&&event.date>=forecast.asOf),
    cycleCalibration:forecast.cycleCalibration?clone(forecast.cycleCalibration):null,
    states:presentation.showStates?computeRollingStates(complete).points.filter(row=>row.date>forecast.asOf):[],
    presentation:clone(presentation),annotationSignature,annotationMeaning:'Current visualization rules applied to the preserved input and forecast path; not an original issued annotation record.'});
}

function svgNode(svg,tag,attributes={},text){const node=svg.ownerDocument.createElementNS('http://www.w3.org/2000/svg',tag);for(const [name,value]of Object.entries(attributes))node.setAttribute(name,String(value));if(text!==undefined)node.textContent=text;return node;}

/** The ordinary Atlas chart renderer owns the primary SVG in replay too.
 * Only its input prefix and frozen forecast layer change. */
export function drawAtlasChartReplay({svg,session,data,start,end,chartType='line',context,selectionPreview=false,onInspect=()=>{}}={}){
  if(!svg||!data?.frame||!context)throw new TypeError('A main chart, replay frame and frozen Atlas context are required');
  const frequency=data.frequency??'daily';
  if(!['daily','weekly'].includes(frequency))throw new RangeError('Atlas replay requires genuine daily or weekly observations; intraday candles cannot be made from daily closes');
  const frame=data.frame,origin=session?.asOf??data.originDate;
  if(context.originDate!==origin)throw new RangeError('Atlas chart context belongs to a different forecast origin');
  if(frame.inputVisible===false||frame.forecastVisible===false)throw new RangeError('The Atlas replay view requires visible preserved input and forecast');
  const firstDay=utcDay(start),lastDay=utcDay(end);if(lastDay<firstDay)throw new RangeError('Replay viewport ends before it starts');
  const cursorDate=frame.cursorDate;utcDay(cursorDate);
  renderers.get(svg)?.destroy();clearChartHover(svg);
  const p=context.presentation;
  const actual=drawdown(canonicalRows(data.observedRows??[]).filter(row=>row.date<=cursorDate&&positive(row.price)).sort((a,b)=>a.date.localeCompare(b.date)))
    .map(row=>({...row,replaySource:'observed'}));
  // The fixed path is never replaced by the latest view's model or by actuals.
  // The frame supplies the permitted horizon and information-time gate.
  const dates=new Set(frame.forecast.map(row=>row.date));
  const fixed=context.forecast.filter(row=>dates.has(row.date)).map(row=>({...row,replaySource:'forecast'}));
  const fixedByDate=new Map(fixed.map(row=>[row.date,row]));
  if(frame.forecast.some(row=>{const frozen=fixedByDate.get(row.date);return !frozen||['price','lower','upper'].some(key=>row[key]!==undefined&&row[key]!==null&&row[key]!==frozen[key]);}))throw new RangeError('Displayed Atlas path does not match the scored replay forecast');
  const actualByDate=new Map(actual.map(row=>[row.date,row]));
  const predictionByDate=new Map(fixed.map(row=>[row.date,row]));
  const observedCandles=(data.observedCandles??[]).filter(row=>{
    const date=row.endDate??row.date;return date<=cursorDate&&['open','high','low','close'].every(key=>positive(row[key]))&&row.low<=Math.min(row.open,row.close)&&row.high>=Math.max(row.open,row.close);
  }).map(row=>({...row,date:row.endDate??row.date,startDate:row.startDate??row.date,endDate:row.endDate??row.date}));
  const candleByDate=new Map(observedCandles.map(row=>[row.endDate,row]));
  // The inspection series uses actuals where available. Missing actual dates
  // keep a labelled forecast point and can never become a fabricated close.
  const rows=[...actual,...fixed.filter(row=>!actualByDate.has(row.date))].sort((a,b)=>a.date.localeCompare(b.date));
  if(!rows.some(row=>row.date>=start&&row.date<=end))retainPriceViewport(svg,{min:1,max:10});
  const inspection=date=>{const actualPoint=actualByDate.get(date),predicted=predictionByDate.get(date),candle=chartType==='candles'?candleByDate.get(date):null;
    return {date,actual:actualPoint?.price??null,predicted:predicted?.price??null,price:actualPoint?.price??predicted?.price??null,
      candle:candle??null,kind:actualPoint?'observed':predicted?'forecast':'missing',source:sourceLabel(data.priceSource??data.candleSource),candleSource:sourceLabel(data.candleSource),forecastOrigin:context.forecastOrigin,replayOrigin:origin};};
  let selected=cursorDate;
  const inspect=value=>{if(!value?.date)return;selected=value.date;onInspect(inspection(value.date));};
  const forecastThrough=fixed.at(-1)?.date??origin;
  const visibleMarker=marker=>marker.kind==='observed'?marker.date<=cursorDate:marker.date<=forecastThrough;
  const cycleMarkers=context.cycleMarkers.filter(visibleMarker);
  const markerIds=new Set(cycleMarkers.map(marker=>marker.id));
  const cycleIntervals=context.cycleIntervals.filter(interval=>markerIds.has(interval.fromId)&&markerIds.has(interval.toId));
  const states=p.showStates?[...(actual.length?computeRollingStates(actual).points:[]),...context.states.filter(row=>row.date>cursorDate&&row.date<=forecastThrough)]:[];
  const calibration=context.cycleCalibration?{...context.cycleCalibration,series:(context.cycleCalibration.series??[]).filter(row=>row.date<=cursorDate)}:null;
  const chart=drawAtlasPriceChart({svg,rows,start,end,split:cursorDate,fixedForecast:fixed,forecastOrigin:context.forecastOrigin,
    frequency,chartType,observedCandles,candleSource:sourceLabel(data.candleSource),
    volumeBars:observedCandles.filter(row=>Number.isFinite(row.volume)),showVolume:Boolean(p.showVolume),volumeSource:sourceLabel(data.candleSource),
    historicalEvents:BITCOIN_EVENTS.filter(event=>event.date<=cursorDate),showHistoricalEvents:p.showHistoricalEvents!==false,
    scale:p.scale??'log',unit:p.unit??'usd',invertScale:Boolean(p.invertScale),priceOnlyAuto:Boolean(p.priceOnlyAuto),
    // An automatic scale must depend only on revealed actuals and the fixed
    // assumptions. It must never inherit today's live automatic price domain.
    priceDomain:p.priceDomain??null,denominator:actual.findLast(row=>row.date<=origin)?.price??1,
    headerInset:18,band:p.band!==false,showTurns:p.showTurns!==false,turns:context.turns.filter(turn=>turn.date<=forecastThrough),
    cycleMarkers,showCycleMarkers:p.showCycleMarkers!==false,
    cycleIntervals,showCycleIntervals:p.showCycleIntervals!==false,cycleRelation:p.cycleRelation??'all',
    cycleCalibration:calibration,showCycleTiming:Boolean(p.showCycleTiming&&calibration),
    states,showStates:Boolean(p.showStates),showDrawdown:Boolean(p.showDrawdown),
    events:context.events.filter(event=>event.date<=forecastThrough),tool:'crosshair',onHover:inspect,onInspect:inspect,
    onCycleMarker:id=>{const marker=cycleMarkers.find(row=>row.id===id);if(marker)inspect(marker);},
    onCycleInterval:id=>{const interval=cycleIntervals.find(row=>row.id===id);if(interval)inspect({date:interval.endDate});},
    selectedDate:cursorDate});
  if(selectionPreview)svg.querySelector('.observed-split-boundary')?.remove();
  const axis=chart.getPriceScale(),width=Math.max(1,Math.round(svg.clientWidth||svg.parentElement?.clientWidth||1100));
  const span=Math.max(1,lastDay-firstDay),x=date=>axis.left+(utcDay(typeof date==='string'?date:date.date)-firstDay)/span*(axis.right-axis.left);
  const dateAt=clientX=>{const rect=svg.getBoundingClientRect();if(!(rect.width>0)||!Number.isFinite(clientX))return null;const local=(clientX-rect.left)/rect.width*width;return dateFromDay(Math.round(firstDay+Math.max(0,Math.min(1,(local-axis.left)/Math.max(1,axis.right-axis.left)))*(lastDay-firstDay)));};
  const overlay=svgNode(svg,'g',{'data-chart-replay-overlay':'true','data-replay-overlay':'true','pointer-events':'none'});
  const boundary=(date,name,label,color)=>{if(date<start||date>end)return;const line=svgNode(svg,'line',{x1:x(date),x2:x(date),y1:axis.top,y2:axis.bottom,[name]:'true',stroke:color,'stroke-width':1,'stroke-dasharray':'3 5'});line.append(svgNode(svg,'title',{},label+' '+date));overlay.append(line);};
  if(!selectionPreview){
    boundary(origin,'data-replay-origin-boundary','봉 리플레이 시작 기준일','var(--muted)');
    if(context.forecastOrigin!==origin)boundary(context.forecastOrigin,'data-replay-forecast-origin','현재 고정 가정의 입력 기준일','var(--accent)');
    boundary(cursorDate,'data-replay-cursor-line','실제 가격 공개일','var(--text)');
  }
  svg.append(overlay);
  Object.assign(svg.dataset,{replayRenderer:'atlas',replayViewStart:start,replayViewEnd:end,replayAnnotationSignature:context.annotationSignature,
    replayActualThrough:actual.at(-1)?.date??origin,replayObservedCount:String(actual.length),replayActualCount:String(actual.filter(row=>row.date>origin).length),replayForecastPoints:String(fixed.length),
    replayForecastCandleCount:'0',replayOhlcAvailable:String(observedCandles.length>0),replayPriceHidden:'false',replayScale:axis.scale,
    replayFrequency:frequency,replayPriceMin:String(axis.min),replayPriceMax:String(axis.max),
    replayFormingWeekCount:String(observedCandles.filter(row=>row.complete===false).length),replayMissingWeekCount:String(data.missingWeekCount??0)});
  const title=svg.querySelector('title'),description=svg.querySelector('desc');
  if(title)title.textContent='비트코인 사이클 아틀라스 · 현재 차트 봉 리플레이';
  if(description)description.textContent='주황색 미래 가정은 시작할 때의 현재 차트 값 그대로 고정하고, 실제 봉만 재생 시점까지 공개합니다. 현재 가정은 과거에 발행한 예측 성적이 아닙니다. 사이클 표식과 기간선은 보존된 경로의 표시이며 당시 발행된 표식 기록이 아닙니다.';
  const nativeHandlers=Object.fromEntries(['onpointermove','onpointerleave','onclick','onkeydown','onkeyup','onblur'].map(key=>[key,svg[key]]));
  let destroyed=false;
  const controller={axis,x,dateAt,getPriceScale:()=>axis,previewPointer:event=>!destroyed&&chart.previewPointer?.(event),
    selectDate(date){if(destroyed)return;utcDay(date);chart.selectDate?.(date);selected=date;onInspect(inspection(date));},
    getSelection(){const value=inspection(selected);return {...value,copyText:`${selected}\n실제: ${money(value.actual)}\n고정 예측: ${money(value.predicted)}`};},
    destroy(){if(destroyed)return;destroyed=true;if(renderers.get(svg)!==controller)return;clearChartHover(svg);for(const [key,handler]of Object.entries(nativeHandlers))if(svg[key]===handler)svg[key]=null;overlay.remove();renderers.delete(svg);}};
  renderers.set(svg,controller);return controller;
}
