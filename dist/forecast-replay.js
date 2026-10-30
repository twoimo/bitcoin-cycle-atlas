import {forecastHash,verifyForecastRecord,restoreForecastPath} from './forecast-records.js';
import {verifyAssetForecastRecord,restoreAssetForecastPath} from './asset-forecast-records.js';
import {normalizeForecastTimestamp,selectPriceVintages} from './forecast-information-time.js';
import {sessionCloseUtc,isEquitySession} from './data-freshness.js';
import {utcDay,dateFromDay} from './cycle-engine.js';
import {buildIndependentBenchmarks,BENCHMARK_POLICY} from './forecast-evaluation.js';

export const FORECAST_REPLAY_VERSION='forecast-replay-2';
const SYMBOLS=new Set(['BTCUSD','ETHUSD','MSTR','BMNR']);
const HEX=/^[a-f0-9]{64}$/;
const sessions=new WeakSet();
const chartHistories=new WeakMap();
const marketFor=symbol=>{
  if(!SYMBOLS.has(symbol))throw new RangeError('Unsupported replay symbol');
  return symbol.endsWith('USD')?'crypto':'equity';
};
function freeze(value){
  if(value&&typeof value==='object'&&!Object.isFrozen(value)){
    for(const item of Object.values(value))freeze(item);
    Object.freeze(value);
  }
  return value;
}
function copy(value){return structuredClone(value);}
function horizon(value){
  if(!Number.isSafeInteger(value)||value<1||value>730)throw new RangeError('Replay horizon must be 1 through 730 calendar days');
  return value;
}
function observationRows(rows,{symbol,observedAt,observedThrough,source}={}){
  const market=marketFor(symbol);
  if(!Array.isArray(rows)||rows.length>100000)throw new RangeError('A bounded observation list is required');
  const captured=observedAt===null||observedAt===undefined?null:normalizeForecastTimestamp(observedAt,'observedAt');
  let previous=null;
  const seen=new Set();
  const normalized=rows.map(item=>{
    const row=Array.isArray(item)?{date:item[0],price:item[1]}:item;
    if(!row||typeof row.date!=='string')throw new TypeError('Replay observation date is required');
    const date=row.date.slice(0,10);utcDay(date);
    if(row.date!==date&&!/^\d{4}-\d{2}-\d{2}T00:00:00(?:\.000)?Z$/.test(row.date))throw new TypeError('Replay observations require daily labels');
    if(previous!==null&&date<previous)throw new RangeError('Replay observations must be chronological');
    previous=date;
    const price=row.price??row.close;
    if(!Number.isFinite(price)||price<=0)throw new RangeError('Replay observed prices must be positive and finite');
    const eventAt=sessionCloseUtc(date,market);
    if(row.eventAt!==undefined&&row.eventAt!==null&&normalizeForecastTimestamp(row.eventAt,'eventAt')!==eventAt)throw new RangeError('Replay event time differs from the market close');
    const collectedAt=row.collectedAt??captured;
    const collection=collectedAt===null||collectedAt===undefined?null:normalizeForecastTimestamp(collectedAt,'collectedAt');
    const publishedAt=row.publishedAt??source?.publishedAt??null;
    const publication=publishedAt===null?null:normalizeForecastTimestamp(publishedAt,'publishedAt');
    if(eventAt!==null&&collection!==null&&collection<eventAt||publication!==null&&(eventAt!==null&&publication<eventAt||collection!==null&&publication>collection))throw new RangeError('Replay observation clocks are out of order');
    const sourceHash=row.sourceHash??source?.sourceHash??null,sourceUrl=row.sourceUrl??source?.sourceUrl??null;
    const vintageId=row.vintageId??source?.vintageId??(sourceHash&&collection?'archive:'+sourceHash+':'+collection:null);
    const key=date+'\0'+(vintageId??'unversioned');
    if(seen.has(key))throw new RangeError('Duplicate replay observation vintage');
    seen.add(key);
    const value={date,price,eventAt,collectedAt:collection,publishedAt:publication,sourceHash,sourceUrl,vintageId,
      sourceObservedThrough:row.sourceObservedThrough??observedThrough??date};
    utcDay(value.sourceObservedThrough);
    if(value.sourceObservedThrough<date)throw new RangeError('Replay observation exceeds its archive');
    const fields=['open','high','low','close'];
    if(fields.some(key=>row[key]!==undefined)){
      if(!fields.every(key=>Number.isFinite(row[key])&&row[key]>0)||row.close!==price||row.low>Math.min(row.open,row.close)||row.high<Math.max(row.open,row.close)||row.low>row.high)throw new RangeError('Replay OHLC must contain genuine consistent observed values');
      for(const key of fields)value[key]=row[key];
      if(row.volume!==undefined){if(!Number.isFinite(row.volume)||row.volume<0)throw new RangeError('Invalid replay volume');value.volume=row.volume;}
    }
    return value;
  });
  if(observedThrough!==null&&observedThrough!==undefined){utcDay(observedThrough);if(normalized.some(row=>row.date>observedThrough))throw new RangeError('Replay observations exceed declared coverage');}
  return normalized;
}
function receiptComplete(row){
  if(!row.eventAt||!row.collectedAt||!HEX.test(row.sourceHash)||!row.vintageId||!row.sourceUrl)return false;
  try{const url=new URL(row.sourceUrl);return url.protocol==='https:'&&!url.username&&!url.password;}catch{return false;}
}
function currentObservations(rows,cutoff){
  const times=new Map(),dates=new Map(),families=new Map();
  const signature=row=>JSON.stringify([row.price,row.open??null,row.high??null,row.low??null,
    row.close??null,row.volume??null,row.sourceHash??null]);
  for(const row of rows){
    if(row.eventAt!==null&&row.eventAt>cutoff||row.collectedAt!==null&&row.collectedAt>cutoff||
      row.publishedAt!==null&&row.publishedAt>cutoff)continue;
    const value=signature(row),key=row.date+'\0'+(row.collectedAt??'unversioned'),sameTime=times.get(key);
    if(sameTime!==undefined&&sameTime!==value)throw new RangeError('Ambiguous equally timed replay revisions');
    times.set(key,value);
    const prior=dates.get(row.date),family=families.get(row.date);
    if(family&&(family.undated||row.collectedAt===null)&&(family.mixed||family.value!==value))
      throw new RangeError('Replay needs an unambiguous current observation vintage');
    families.set(row.date,{value:family?.value??value,mixed:Boolean(family?.mixed||family&&family.value!==value),
      undated:Boolean(family?.undated||row.collectedAt===null)});
    if(!prior||(row.collectedAt??'')>(prior.collectedAt??'')||
      row.collectedAt===prior.collectedAt&&(row.vintageId??'')>(prior.vintageId??''))dates.set(row.date,row);
  }
  return [...dates.values()].sort((a,b)=>a.date.localeCompare(b.date));
}
function visiblePath(path,asOf,horizonDays){
  const end=dateFromDay(utcDay(asOf)+horizonDays);
  return path.filter(row=>row.date>=asOf&&row.date<=end).map(row=>({date:row.date,price:row.price,
    lower:row.lower??null,upper:row.upper??null,baselinePrice:row.baselinePrice??null,
    ...(row.representativePrice===undefined?{}:{representativePrice:row.representativePrice})}));
}
function preservedPathMeaning(record){
  const sampledEth=record.output.metadata?.assetPath?.method==='eth-post-merge-historical-blocks';
  const bandMeaning=typeof record.output.bandMeaning==='string'?record.output.bandMeaning:null;
  if(record.symbol==='ETHUSD'&&sampledEth)return {pointMeaning:'preserved-sampled-eth-example',
    pointLabel:'고정한 seed로 추출한 ETH 무작위 예시 1개',bandMeaning};
  if(record.symbol==='BMNR'&&sampledEth)return {pointMeaning:'preserved-sampled-eth-treasury-valuation',
    pointLabel:'ETH 무작위 예시 1개를 보유량·현금·선순위 청구권·희석 계산에 전달한 조건부 주당 평가 경로',bandMeaning};
  return {pointMeaning:record.symbol==='BTCUSD'?'preserved-conditional-btc-path':'preserved-conditional-asset-valuation',
    pointLabel:record.symbol==='BTCUSD'?'보존한 BTC 조건부 경로':'보존한 자산의 조건부 평가 경로',bandMeaning};
}
function finishSession({identity,mode,prices,path,targets,observations,observedAt,observedThrough,source,horizonDays,evaluatedAt,historicalModel=null,training=null}){
  const {symbol,asOf}=identity,market=marketFor(symbol);
  const normalized=observationRows(observations,{symbol,observedAt,observedThrough,source});
  const forecast=visiblePath(path,asOf,horizonDays);
  if(!forecast.length||forecast[0].date!==asOf)throw new RangeError('Replay path must begin at its origin');
  const startDate=dateFromDay(Math.max(utcDay(prices[0].date),utcDay(asOf)-90));
  const inputPrices=prices.filter(row=>row.date>=startDate&&row.date<=asOf).map(row=>({date:row.date,price:row.price}));
  const endDate=forecast.at(-1).date;
  const evaluation=normalizeForecastTimestamp(evaluatedAt,'evaluatedAt');
  const relevant=normalized.filter(row=>row.date>asOf&&row.date<=endDate);
  const informationTimeAvailable=relevant.every(receiptComplete);
  const timeline=forecast.filter(row=>row.date<=evaluation.slice(0,10)&&(row.date===asOf||market==='crypto'||sessionCloseUtc(row.date,market)!==null)).map(row=>row.date);
  if(!timeline.length)throw new RangeError('Replay origin is later than the evaluation clock');
  const session={version:FORECAST_REPLAY_VERSION,id:identity.recordId,identity:copy(identity),mode,market,asOf,startDate,endDate,evaluatedAt:evaluation,
    timeline,inputPrices,forecast,observations:relevant,targets:copy(targets),historicalModel,training,
    observationProvenance:{observedAt:observedAt??null,observedThrough:observedThrough??normalized.at(-1)?.date??null,
      source:source===null||source===undefined?null:copy(source),informationTimeAvailable,
      historicalAvailabilityProven:false,providerAuthenticityProven:false},
    policy:{forecastNeverRecomputedDuringReplay:true,missingValuesImputed:false,calibrated:false,
      dailyErrorsAreIndependentSamples:false,releaseAuthorized:false,productionPromoted:false}};
  chartHistories.set(session,{prices:freeze(prices.map(row=>({date:row.date,price:row.price}))),
    observations:freeze(normalized.filter(row=>row.date<=asOf)),current:null});
  sessions.add(session);return freeze(session);
}

export async function createRecordedReplaySession({record,snapshot,observations=[],observedAt=null,observedThrough=null,source=null,horizonDays=180,evaluatedAt=new Date().toISOString()}={}){
  horizon(horizonDays);
  let prices,path;
  if(record?.kind==='atlas-forecast-record'){
    await verifyForecastRecord(record,snapshot);
    if(!snapshot)throw new TypeError('A verified input snapshot is required');
    prices=snapshot.prices;path=restoreForecastPath(record);
  }else if(record?.kind==='atlas-asset-forecast-record'){
    await verifyAssetForecastRecord(record,snapshot);
    if(!snapshot)throw new TypeError('A verified input snapshot is required');
    prices=snapshot.inputs.primaryPrices;path=restoreAssetForecastPath(record);
  }else throw new TypeError('Unsupported preserved replay record');
  // Asset snapshots bind every consumed input to a verified acquisition clock.
  // The older BTC record format has no equivalent complete input receipt set;
  // conservatively reveal that snapshot only once its record has been issued.
  const inputAvailableAt=record.kind==='atlas-asset-forecast-record'?snapshot.informationClock.latestCollectionAt:record.issuedAt;
  const identity={symbol:record.symbol,recordId:record.id,recordKind:record.recordKind,asOf:record.asOf,issuedAt:record.issuedAt,
    snapshotId:record.snapshotId,outputHash:record.outputHash,modelVersion:record.model.version,
    sourceCommit:record.model.sourceCommit,sourceHash:record.model.sourceHash,
    informationCutoffAt:record.informationCutoffAt??snapshot.observedAt,
    inputAvailableAt,inputAvailabilityBasis:record.kind==='atlas-asset-forecast-record'?'verified-complete-input-acquisition':'conservative-record-issuance',
    historicalModelExistedAtOrigin:record.recordKind==='issued',...preservedPathMeaning(record)};
  const targets=record.targets.map(target=>({...target,eventAt:target.eventAt??sessionCloseUtc(target.targetDate,'crypto')}));
  return finishSession({identity,mode:'recorded',prices:prices.map(([date,price])=>({date,price})),path,targets,
    observations,observedAt,observedThrough,source,horizonDays,evaluatedAt});
}

export async function createHistoricalReplaySession({symbol,observations,asOf,horizonDays=180,modelKey,
  observedAt=null,observedThrough=null,source=null,generatedAt=new Date().toISOString()}={}){
  if(!['BTCUSD','ETHUSD'].includes(symbol))throw new RangeError('Historical replay supports price-only BTC and ETH models');
  horizon(horizonDays);utcDay(asOf);
  const at=normalizeForecastTimestamp(generatedAt,'generatedAt');
  if(sessionCloseUtc(asOf,'crypto')>at)throw new RangeError('Historical replay origin has not completed');
  const rows=observationRows(observations,{symbol,observedAt,observedThrough,source});
  const prefix=currentObservations(rows.filter(row=>row.date<=asOf),at).map(row=>[row.date,row.price]);
  if(prefix.at(-1)?.[0]!==asOf)throw new RangeError('Historical replay requires an observed close at the exact origin');
  if(prefix.length<181)throw new RangeError('Historical replay requires at least 181 observed closes');
  const horizons=[30,90,180,365,730].filter(value=>value<=horizonDays);
  if(!horizons.includes(horizonDays))horizons.push(horizonDays);
  const benchmarks=buildIndependentBenchmarks(prefix,{asOf,horizons});
  let path,modelVersion,historicalModel,training;
  if(symbol==='BTCUSD'){
    modelKey??='shrunken-trend';
    if(modelKey!=='shrunken-trend')throw new RangeError('BTC historical replay uses the independent shrunken-trend baseline');
    modelVersion=BENCHMARK_POLICY.version;
    historicalModel={key:modelKey,label:'가격만 사용한 축소 추세 기준모형',pointMeaning:'shrunken-trend-baseline',bandMeaning:'none'};
    path=Array.from({length:horizonDays+1},(_,offset)=>({date:dateFromDay(utcDay(asOf)+offset),
      price:benchmarks.anchorPrice*Math.exp(benchmarks.dailyLogDrift*offset),lower:null,upper:null,baselinePrice:null}));
    training={informationThrough:asOf,firstObservation:prefix[0][0],observations:prefix.length,
      lookbackStart:benchmarks.lookbackStart,dailyLogDrift:benchmarks.dailyLogDrift};
  }else{
    modelKey??='pooled';
    if(!['pooled','adaptive'].includes(modelKey))throw new RangeError('Unsupported ETH historical replay model');
    const module=modelKey==='pooled'?await import('./ethereum-pooled-model.js'):await import('./ethereum-adaptive-model.js');
    const build=modelKey==='pooled'?module.buildEthereumPooledForecast:module.buildEthereumAdaptiveForecast;
    const model=build({ethHistory:prefix,asOf,horizonDays,sampleCount:256,seed:20261027});
    modelVersion=modelKey==='pooled'?module.ETH_POOLED_POLICY.version:module.ETH_ADAPTIVE_POLICY.version;
    historicalModel={key:modelKey,label:modelKey==='pooled'?'ETH pooled 가격 모형 중앙 경로':'ETH adaptive 가격 모형 중앙 경로',
      pointMeaning:'simulation-median',bandMeaning:'uncalibrated-raw-simulation-quantiles-10-90',sampleCount:256,seed:20261027};
    path=model.path.map(row=>({date:row.date,price:row.baselinePrice,lower:row.low,upper:row.high,
      baselinePrice:row.baselinePrice,representativePrice:row.price}));
    training=copy(model.training);
  }
  const inputHash=await forecastHash(prefix),outputHash=await forecastHash(path);
  const recordId=await forecastHash({version:FORECAST_REPLAY_VERSION,symbol,asOf,modelVersion,modelKey,horizonDays,inputHash,outputHash});
  const identity={symbol,recordId,recordKind:'reconstructed',asOf,issuedAt:null,createdAt:at,snapshotId:inputHash,outputHash,
    modelVersion,sourceCommit:null,sourceHash:null,informationCutoffAt:sessionCloseUtc(asOf,'crypto'),historicalModelExistedAtOrigin:false,
    pointMeaning:historicalModel.pointMeaning,pointLabel:symbol==='BTCUSD'?'가격만 사용한 축소 추세 기준모형 경로':'ETH 시뮬레이션의 날짜별 중앙값',
    bandMeaning:historicalModel.bandMeaning};
  const targetMap=new Map(path.map(row=>[row.date,row]));
  const targets=benchmarks.targets.map(target=>({...target,price:targetMap.get(target.targetDate).price,eventAt:sessionCloseUtc(target.targetDate,'crypto')}));
  return finishSession({identity,mode:'historical-reconstruction',prices:prefix.map(([date,price])=>({date,price})),path,targets,
    observations,observedAt,observedThrough,source,horizonDays,evaluatedAt:at,historicalModel,training});
}

function cursor(session,{cursorIndex=0,cursorDate,cursorAt}={}){
  if(cursorDate!==undefined){utcDay(cursorDate);cursorIndex=session.timeline.indexOf(cursorDate);}
  if(!Number.isSafeInteger(cursorIndex)||cursorIndex<0||cursorIndex>=session.timeline.length)throw new RangeError('Replay cursor is outside the session timeline');
  const date=session.timeline[cursorIndex];
  const at=cursorAt===undefined?sessionCloseUtc(date,session.market):normalizeForecastTimestamp(cursorAt,'cursorAt');
  if(at===null)throw new RangeError('Replay market close is outside the reviewed calendar');
  return {cursorIndex,cursorDate:date,cursorAt:at};
}
function selectedObservations(session,position,clockMode){
  const eligible=session.observations.filter(row=>row.date<=position.cursorDate&&
    (row.collectedAt===null||row.collectedAt<=session.evaluatedAt)&&(row.publishedAt===null||row.publishedAt<=session.evaluatedAt));
  if(clockMode==='information-time'){
    if(!session.observationProvenance.informationTimeAvailable)throw new RangeError('Replay information time requires complete acquisition receipts');
    currentObservations(eligible,position.cursorAt);
    const selected=selectPriceVintages(eligible,{symbol:session.identity.symbol,market:session.market,informationCutoffAt:position.cursorAt}).rows;
    const originals=new Map(eligible.map(row=>[row.date+'\0'+row.vintageId,row]));
    return selected.map(row=>originals.get(row.date+'\0'+row.vintageId));
  }
  return currentObservations(eligible,session.evaluatedAt);
}
function errors(predicted,actual,flat){
  const relative=Math.abs(predicted-actual)/actual;
  return {absoluteError:Math.abs(predicted-actual),absolutePercentageError:Number.isFinite(relative)?relative:null,
    absoluteLogError:predicted>0?Math.abs(Math.log(predicted)-Math.log(actual)):null,
    flatAbsoluteLogError:Math.abs(Math.log(flat)-Math.log(actual))};
}
function average(values){return values.length?values.reduce((sum,value,index)=>sum+(value-sum)/(index+1),0):null;}
function bounds(rows){
  if(!rows.length)return {priceDomain:null,scale:null};
  let min=Infinity,max=-Infinity;
  for(const row of rows)for(const key of ['price','lower','upper','baselinePrice','open','high','low','close']){
    const value=row[key];if(Number.isFinite(value)){min=Math.min(min,value);max=Math.max(max,value);}
  }
  if(!Number.isFinite(min)||!Number.isFinite(max))throw new RangeError('Replay has no visible chart prices');
  const upper=Math.min(Number.MAX_VALUE,max*1.05);
  if(min===0)return {priceDomain:{min:0,max:max>0?upper:1},scale:'linear'};
  return {priceDomain:{min:Math.max(Number.MIN_VALUE,min*.95),max:upper},scale:'log'};
}
export function buildReplayFrame(session,options={}){
  if(!sessions.has(session))throw new TypeError('Create and verify a replay session before rendering');
  const clockMode=options.clockMode??'observed-date';
  if(!['observed-date','information-time'].includes(clockMode))throw new RangeError('Unknown replay clock mode');
  if(session.mode==='historical-reconstruction'&&clockMode!=='observed-date')throw new RangeError('Historical reconstruction is a current-vintage bar replay');
  const position=cursor(session,options),evaluationAt=position.cursorAt<session.evaluatedAt?position.cursorAt:session.evaluatedAt;
  const inputVisible=clockMode==='observed-date'||evaluationAt>=session.identity.inputAvailableAt;
  const inputPrices=inputVisible?session.inputPrices:[];
  const forecastVisible=clockMode==='observed-date'||session.identity.issuedAt!==null&&evaluationAt>=session.identity.issuedAt;
  const forecast=forecastVisible?session.forecast:[];
  const actual=selectedObservations(session,{...position,cursorAt:evaluationAt},clockMode).filter(row=>row.eventAt===null||row.eventAt<=evaluationAt);
  const byDate=new Map(forecast.map(row=>[row.date,row])),actualByDate=new Map(actual.map(row=>[row.date,row]));
  const flat=inputPrices.at(-1)?.price??null;
  const daily=actual.flatMap(row=>{
    const predicted=byDate.get(row.date);
    if(!predicted||row.date<=session.asOf)return [];
    return [{date:row.date,predicted:predicted.price,actual:row.price,flat,...errors(predicted.price,row.price,flat),
      directionCorrect:Math.sign(predicted.price-flat)===Math.sign(row.price-flat)}];
  });
  const targets=session.targets.map(target=>{
    const visible=actualByDate.get(target.targetDate);
    const mature=target.targetDate<=position.cursorDate&&target.eventAt<=evaluationAt;
    const prospective=clockMode==='information-time'&&session.mode==='recorded'&&session.identity.recordKind==='issued'&&target.eventAt>session.identity.issuedAt;
    const status=!forecastVisible?'not-issued':!mature?'pending':!visible?'missing-observation':prospective?'scored':'retrospective';
    const actual=status==='scored'||status==='retrospective'?visible.price:null;
    return {horizonDays:target.horizonDays,targetDate:target.targetDate,eventAt:target.eventAt,
      predicted:forecastVisible?target.price:null,actual,flat:forecastVisible?target.flat:null,shrunkenTrend:forecastVisible?target.shrunkenTrend:null,
      status,prospective,absoluteLogError:actual===null||target.price===0?null:errors(target.price,actual,target.flat).absoluteLogError,
      flatAbsoluteLogError:actual===null?null:errors(target.price,actual,target.flat).flatAbsoluteLogError,
      actualVintage:actual===null?null:visible.vintageId,actualCollectedAt:actual===null?null:visible.collectedAt};
  });
  const logged=daily.filter(row=>row.absoluteLogError!==null);
  const percentageScored=daily.filter(row=>row.absolutePercentageError!==null);
  const meanAbsoluteLogError=average(logged.map(row=>row.absoluteLogError));
  const flatMeanAbsoluteLogError=average(logged.map(row=>row.flatAbsoluteLogError));
  const skill=flatMeanAbsoluteLogError>0?1-meanAbsoluteLogError/flatMeanAbsoluteLogError:null;
  const metrics={matchedCount:daily.length,meanAbsoluteError:average(daily.map(row=>row.absoluteError)),
    meanAbsolutePercentageError:average(percentageScored.map(row=>row.absolutePercentageError)),percentageScoredCount:percentageScored.length,meanAbsoluteLogError,flatMeanAbsoluteLogError,
    logScoredCount:logged.length,skillVersusFlat:Number.isFinite(skill)?skill:null,
    directionCorrectCount:daily.filter(row=>row.directionCorrect).length,directionCount:daily.length,
    directionAccuracy:daily.length?daily.filter(row=>row.directionCorrect).length/daily.length:null,
    scoredTargetCount:targets.filter(row=>row.status==='scored').length,retrospectiveTargetCount:targets.filter(row=>row.status==='retrospective').length,
    pendingTargetCount:targets.filter(row=>row.status==='pending').length,missingTargetCount:targets.filter(row=>row.status==='missing-observation').length,
    independentSampleCount:null,calibrated:false};
  const point=byDate.get(position.cursorDate),observed=actualByDate.get(position.cursorDate);
  const selected={date:position.cursorDate,predicted:point?.price??null,actual:observed?.price??null,flat,
    absoluteError:null,absolutePercentageError:null,absoluteLogError:null};
  if(point&&observed)Object.assign(selected,errors(point.price,observed.price,flat));
  const rows=[...inputPrices.filter(row=>row.date<session.asOf||!forecastVisible),...forecast];
  return freeze({version:FORECAST_REPLAY_VERSION,sessionId:session.id,mode:session.mode,clockMode,...position,evaluationAt,
    inputVisible,forecastVisible,inputPrices,forecast,actual,rows,selected,dailyComparisons:daily,targets,metrics,
    ...bounds([...rows,...actual]),policy:{...session.policy,
      observationClock:clockMode==='observed-date'?'current-vintage-market-bar-reconstruction':'recorded-acquisition-cutoff',
      prospectiveScoringEligible:clockMode==='information-time'&&session.mode==='recorded'&&session.identity.recordKind==='issued',
      historicalAvailabilityProven:false,dailyMetricMeaning:'Overlapping errors along one fixed origin path; not independent forecast trials.'}});
}

function chartHistory(session,frame){
  if(!frame.inputVisible)return [];
  const history=chartHistories.get(session);
  if(frame.clockMode==='observed-date'&&history.current)return history.current;
  const cutoff=frame.clockMode==='information-time'?frame.evaluationAt:session.evaluatedAt;
  const archive=frame.clockMode==='information-time'?history.observations.filter(receiptComplete):history.observations;
  const observations=new Map(currentObservations(archive,cutoff).map(row=>[row.date,row]));
  // Preserve the consumed input close. A later archive's candle is usable only
  // when its close agrees with that frozen input and its own clock permits it.
  const result=freeze(history.prices.map(row=>{
    const candle=observations.get(row.date);
    return candle?.price===row.price?candle:row;
  }));
  if(frame.clockMode==='observed-date')history.current=result;
  return result;
}

function weeklyReplayCandles(rows,market,{cursorDate,evaluationAt}){
  const groups=new Map();
  for(const row of rows){
    const day=utcDay(row.date),monday=day-((day+3)%7+7)%7;
    if(!groups.has(monday))groups.set(monday,[]);
    groups.get(monday).push(row);
  }
  const candles=[];let incompleteGroups=0,unreviewedGroups=0;
  for(const [monday,days]of groups){
    const week=Array.from({length:7},(_,offset)=>dateFromDay(monday+offset));
    if(market==='equity'&&week.some(date=>isEquitySession(date)===null)){unreviewedGroups++;continue;}
    const expected=market==='crypto'?week:week.filter(date=>isEquitySession(date));
    const last=expected.at(-1);
    if(!last||last>cursorDate||sessionCloseUtc(last,market)>evaluationAt||days.length!==expected.length||
      days.some((row,index)=>row.date!==expected[index])){incompleteGroups++;continue;}
    const volume=days.every(row=>Number.isFinite(row.volume))?days.reduce((sum,row)=>sum+row.volume,0):null;
    if(volume!==null&&!Number.isFinite(volume))throw new RangeError('Weekly replay volume overflow');
    candles.push({time:monday*86400,date:last,startDate:expected[0],endDate:last,
      open:days[0].open,high:Math.max(...days.map(row=>row.high)),low:Math.min(...days.map(row=>row.low)),
      close:days.at(-1).close,...(volume===null?{}:{volume}),daysIncluded:days.length,complete:true});
  }
  return {candles,incompleteGroups,unreviewedGroups};
}

/** Main-chart prices and genuine OHLC at the replay cursor. The full consumed
 * history is retained privately; the journal frame keeps its 90-day contract.
 * Cut daily observations before aggregating weeks, never the other way round. */
export function buildReplayChartData(session,options={}){
  const frequency=options.frequency??'daily';
  if(!['daily','weekly'].includes(frequency))throw new RangeError('Replay supports daily or weekly observations');
  const frame=buildReplayFrame(session,options);
  const start=options.startDate===undefined?-Infinity:utcDay(options.startDate);
  const end=options.endDate===undefined?Infinity:utcDay(options.endDate);
  if(start>end)throw new RangeError('Replay chart range is reversed');
  const inRange=row=>{const day=utcDay(row.endDate??row.date);return day>=start&&day<=end;};
  const visible=[...chartHistory(session,frame),...frame.actual];
  const observedRows=visible.filter(inRange).map(row=>({date:row.date,price:row.price}));
  const dailyCandles=visible.filter(row=>['open','high','low','close'].every(key=>Number.isFinite(row[key]))).map(row=>({
    date:row.date,time:utcDay(row.date)*86400,startDate:row.date,endDate:row.date,
    open:row.open,high:row.high,low:row.low,close:row.close,...(row.volume===undefined?{}:{volume:row.volume}),complete:true}));
  const weekly=frequency==='weekly'?weeklyReplayCandles(dailyCandles,session.market,frame):null;
  const observedCandles=(weekly?.candles??dailyCandles).filter(inRange);
  const availableDailyDates=new Set(dailyCandles.map(row=>row.date));
  return freeze({frame,frequency,originDate:session.asOf,observedRows,observedCandles,
    ohlcAvailable:observedCandles.length>0,
    completeOhlcCoverage:observedRows.length>0&&observedRows.every(row=>availableDailyDates.has(row.date)),
    partialWeekCount:weekly?.incompleteGroups??0,unreviewedWeekCount:weekly?.unreviewedGroups??0,
    ...bounds([...observedRows,...observedCandles,...frame.forecast.filter(inRange)])});
}
