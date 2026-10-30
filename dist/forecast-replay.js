import {forecastHash,verifyForecastRecord,restoreForecastPath} from './forecast-records.js';
import {verifyAssetForecastRecord,restoreAssetForecastPath} from './asset-forecast-records.js';
import {normalizeForecastTimestamp,selectPriceVintages} from './forecast-information-time.js';
import {sessionCloseUtc,isEquitySession} from './data-freshness.js';
import {utcDay,dateFromDay,validateDataset} from './cycle-engine.js';
import {buildIndependentBenchmarks,BENCHMARK_POLICY} from './forecast-evaluation.js';
import {requireVerifiedProjectReplayBaseline,PROJECT_REPLAY_ORIGIN} from './project-replay-baseline.js';

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
function finishSession({identity,mode,prices,path,targets,observations,observedAt,observedThrough,source,horizonDays,evaluatedAt,historicalModel=null,training=null,chartDataset=null,chartForecast=null,forecastOriginDate=identity.asOf,timelineDates=null,scorePolicy=null}){
  const {symbol,asOf}=identity,market=marketFor(symbol);
  const normalized=observationRows(observations,{symbol,observedAt,observedThrough,source});
  const forecast=visiblePath(path,forecastOriginDate,horizonDays);
  if(!forecast.length||forecast[0].date!==forecastOriginDate)throw new RangeError('Replay path must begin at its forecast origin');
  const startDate=dateFromDay(Math.max(utcDay(prices[0]?.date??asOf),utcDay(asOf)-90));
  const inputPrices=prices.filter(row=>row.date>=startDate&&row.date<=asOf).map(row=>({date:row.date,price:row.price}));
  const endDate=forecast.at(-1).date;
  const evaluation=normalizeForecastTimestamp(evaluatedAt,'evaluatedAt');
  const relevant=normalized.filter(row=>row.date>asOf&&row.date<=endDate);
  const informationTimeAvailable=relevant.every(receiptComplete);
  const timeline=timelineDates??forecast.filter(row=>row.date<=evaluation.slice(0,10)&&(row.date===asOf||market==='crypto'||sessionCloseUtc(row.date,market)!==null)).map(row=>row.date);
  if(!timeline.length)throw new RangeError('Replay origin is later than the evaluation clock');
  const session={version:FORECAST_REPLAY_VERSION,id:identity.recordId,identity:copy(identity),mode,market,asOf,startDate,endDate,evaluatedAt:evaluation,
    timeline,inputPrices,forecast,observations:relevant,targets:copy(targets),historicalModel,training,
    ...(chartDataset?{chartDataset}:{}),...(chartForecast?{chartForecast}:{}),
    ...(forecastOriginDate!==asOf?{forecastOriginDate}:{}),
    observationProvenance:{observedAt:observedAt??null,observedThrough:observedThrough??normalized.at(-1)?.date??null,
      source:source===null||source===undefined?null:copy(source),informationTimeAvailable,
      historicalAvailabilityProven:false,providerAuthenticityProven:false},
    policy:{forecastNeverRecomputedDuringReplay:true,missingValuesImputed:false,calibrated:false,
      dailyErrorsAreIndependentSamples:false,releaseAuthorized:false,productionPromoted:false,
      ...(scorePolicy??{})}};
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

/** Replay the first saved Atlas artifact unchanged. Its original three-year
 * extent is fixed; the 730-day reconstruction/ledger contract is unaffected. */
export async function createProjectReplaySession({baseline,observations=[],observedAt=null,observedThrough=null,source=null,evaluatedAt=new Date().toISOString()}={}){
  requireVerifiedProjectReplayBaseline(baseline);
  const origin=PROJECT_REPLAY_ORIGIN,prices=baseline.dataset.prices.map(([date,price])=>({date,price}));
  const path=baseline.forecast.path,horizonDays=utcDay(path.at(-1).date)-utcDay(origin.asOf);
  if(horizonDays!==1097||prices.at(-1)?.date!==origin.asOf)throw new RangeError('The preserved project replay extent must remain unchanged');
  const horizons=[30,90,180,365,730,1097];
  const benchmarks=buildIndependentBenchmarks(baseline.dataset.prices,{asOf:origin.asOf,horizons});
  const byDate=new Map(path.map(row=>[row.date,row]));
  const targets=benchmarks.targets.map(target=>({...target,price:byDate.get(target.targetDate).price,eventAt:sessionCloseUtc(target.targetDate,'crypto')}));
  const identity={symbol:'BTCUSD',recordId:baseline.id,recordKind:'archived-project-baseline',
    asOf:origin.asOf,issuedAt:null,preservedAt:origin.preservedAt,preservationBasis:origin.preservationBasis,
    projectStartDate:origin.startDate,playbackStartDate:origin.startDate,referenceTimezone:origin.timezone,
    snapshotId:baseline.inputHash,outputHash:baseline.outputHash,modelVersion:origin.modelVersion,
    sourceCommit:origin.sourceCommit,sourceHash:origin.sourceArtifactSha256,
    informationCutoffAt:sessionCloseUtc(origin.asOf,'crypto'),inputAvailableAt:origin.preservedAt,
    inputAvailabilityBasis:'conservative-first-commit-preservation',historicalModelExistedAtOrigin:false,
    modelPreservedOnProjectStartDate:true,
    pointMeaning:'preserved-initial-project-conditional-path',pointLabel:'프로젝트 시작 당시 보존한 3년 기본 경로',
    bandMeaning:'user-assumption-sensitivity-not-calibrated',publicationTimeProven:false,
    provenance:baseline.provenance};
  return finishSession({identity,mode:'project-baseline',prices,path,targets,observations,observedAt,observedThrough,source,
    horizonDays,evaluatedAt,chartDataset:baseline.dataset,chartForecast:baseline.forecast});
}

/** Keep the current chart's orange curve exactly as captured while revealing
 * genuine past bars. A current snapshot is not a forecast issued in the past,
 * and its Coin Metrics curve is not scored against another provider's candles. */
export async function createCurrentChartReplaySession({dataset,forecast,asOf=PROJECT_REPLAY_ORIGIN.asOf,
  playbackStartDate=PROJECT_REPLAY_ORIGIN.startDate,observations=[],observedAt=null,observedThrough=null,source=null,
  createdAt=new Date().toISOString(),evaluatedAt=createdAt}={}){
  utcDay(asOf);utcDay(playbackStartDate);
  const created=normalizeForecastTimestamp(createdAt,'createdAt'),evaluation=normalizeForecastTimestamp(evaluatedAt,'evaluatedAt');
  const forecastOriginDate=forecast?.asOf;utcDay(forecastOriginDate);
  if(asOf>forecastOriginDate||playbackStartDate!==dateFromDay(utcDay(asOf)+1)||created>evaluation)throw new RangeError('Current-chart replay clocks are inconsistent');
  const input=validateDataset(dataset).filter(row=>row.date<=forecastOriginDate);
  if(input.at(-1)?.date!==forecastOriginDate||sessionCloseUtc(forecastOriginDate,'crypto')>created)throw new RangeError('The current forecast needs its completed input anchor');
  if(!Array.isArray(forecast.path)||forecast.path.length<2||forecast.path.length>36501)throw new RangeError('A bounded current-chart forecast path is required');
  let prior=null;
  for(const row of forecast.path){
    utcDay(row.date);if(prior!==null&&row.date<=prior)throw new RangeError('Current-chart forecast dates must be strictly increasing');prior=row.date;
    if(!Number.isFinite(row.price)||row.price<=0)throw new RangeError('Current-chart forecast prices must be positive and finite');
    for(const key of ['lower','upper','baselinePrice','representativePrice'])if(row[key]!==undefined&&row[key]!==null&&(!Number.isFinite(row[key])||row[key]<0))throw new RangeError('Invalid current-chart forecast value');
    if(row.lower!==undefined&&row.lower!==null&&row.upper!==undefined&&row.upper!==null&&row.lower>row.upper)throw new RangeError('Current-chart forecast band is reversed');
  }
  if(forecast.path[0].date!==forecastOriginDate||forecast.path[0].price!==input.at(-1).price)throw new RangeError('Current-chart forecast must preserve its original input anchor');
  const horizonDays=utcDay(forecast.path.at(-1).date)-utcDay(forecastOriginDate);
  if(horizonDays<1||horizonDays>36500)throw new RangeError('Current-chart forecast extent exceeds its limit');
  const normalized=observationRows(observations,{symbol:'BTCUSD',observedAt,observedThrough,source});
  const current=currentObservations(normalized,evaluation),prices=current.filter(row=>row.date<=asOf).map(row=>({date:row.date,price:row.price}));
  // The very first real source bar has no preceding observation. Its empty
  // cutoff is valid: do not manufacture an anchor close before source coverage.
  const startsAtFirstObservation=current[0]?.date===playbackStartDate&&prices.length===0;
  if(prices.at(-1)?.date!==asOf&&!startsAtFirstObservation)throw new RangeError('Current-chart replay requires an observed bar immediately before its start date or the first available observation');
  const fixedForecast=copy(forecast),fixedDataset=copy(dataset);
  const output=visiblePath(fixedForecast.path,forecastOriginDate,horizonDays);
  const outputHash=await forecastHash(output),originalPathHash=await forecastHash(fixedForecast.path),inputHash=await forecastHash(input.map(row=>[row.date,row.price]));
  const recordId=await forecastHash({kind:'current-chart-snapshot',asOf,playbackStartDate,forecastOriginDate,inputHash,outputHash});
  const timeline=[asOf,...current.filter(row=>row.date>asOf&&row.date<=fixedForecast.path.at(-1).date&&row.eventAt<=evaluation).map(row=>row.date)];
  const identity={symbol:'BTCUSD',recordId,recordKind:'current-chart-snapshot',asOf,issuedAt:null,createdAt:created,
    playbackStartDate,projectStartDate:PROJECT_REPLAY_ORIGIN.startDate,forecastOriginDate,
    snapshotId:inputHash,outputHash,originalPathHash,modelVersion:forecast.version??'current-chart-conditional-model',sourceCommit:null,sourceHash:null,
    informationCutoffAt:sessionCloseUtc(forecastOriginDate,'crypto'),inputAvailableAt:created,inputAvailabilityBasis:'current-chart-capture',
    historicalModelExistedAtOrigin:false,currentChartSnapshot:true,
    pointMeaning:'current-chart-conditional-path-fixed-at-replay-open',pointLabel:'현재 차트의 미래 가정 고정',
    bandMeaning:'current-chart-conditional-range-not-calibrated',publicationTimeProven:false,
    forecastSource:{provider:dataset?.meta?.sourceName??null,sourceUrl:dataset?.meta?.source??null,
      priceDefinition:dataset?.meta?.priceDefinition??null,asOf:forecastOriginDate,inputHash},
    observationSource:{provider:source?.provider??null,sourceHash:source?.sourceHash??null,priceMeaning:source?.priceMeaning??null}};
  return finishSession({identity,mode:'current-chart-snapshot',prices,path:fixedForecast.path,targets:[],observations,observedAt,observedThrough,source,
    horizonDays,evaluatedAt:evaluation,chartDataset:fixedDataset,chartForecast:fixedForecast,forecastOriginDate,timelineDates:timeline,
    scorePolicy:{forecastScoringEnabled:false,forecastScoringReason:'current-chart-snapshot-not-issued-at-replay-origin-and-different-observation-source',
      currentForecastPreservedWithoutBackdating:true}});
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
  const forecastAvailableAt=session.identity.issuedAt??(session.mode==='project-baseline'?session.identity.preservedAt:session.mode==='current-chart-snapshot'?session.identity.createdAt:null);
  const forecastVisible=clockMode==='observed-date'||forecastAvailableAt!==null&&evaluationAt>=forecastAvailableAt;
  const forecast=forecastVisible?session.forecast:[];
  const actual=selectedObservations(session,{...position,cursorAt:evaluationAt},clockMode).filter(row=>row.eventAt===null||row.eventAt<=evaluationAt);
  const byDate=new Map(forecast.map(row=>[row.date,row])),actualByDate=new Map(actual.map(row=>[row.date,row]));
  const flat=inputPrices.at(-1)?.price??null;
  const scoringEnabled=session.policy.forecastScoringEnabled!==false;
  const daily=scoringEnabled?actual.flatMap(row=>{
    const predicted=byDate.get(row.date);
    if(!predicted||row.date<=session.asOf)return [];
    return [{date:row.date,predicted:predicted.price,actual:row.price,flat,...errors(predicted.price,row.price,flat),
      directionCorrect:Math.sign(predicted.price-flat)===Math.sign(row.price-flat)}];
  }):[];
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
  if(scoringEnabled&&point&&observed)Object.assign(selected,errors(point.price,observed.price,flat));
  const rows=[...inputPrices.filter(row=>row.date<(session.forecastOriginDate??session.asOf)||!forecastVisible),...forecast];
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

function replayWeekStart(date){const day=utcDay(date);return day-((day+3)%7+7)%7;}
function replayWeekSessions(monday,market){
  const week=Array.from({length:7},(_,offset)=>dateFromDay(monday+offset));
  if(market==='equity'&&week.some(date=>isEquitySession(date)===null))return null;
  return market==='crypto'?week:week.filter(date=>isEquitySession(date));
}
function dailyReplayCandles(rows){
  return rows.filter(row=>['open','high','low','close'].every(key=>Number.isFinite(row[key]))).map(row=>({
    date:row.date,time:utcDay(row.date)*86400,startDate:row.date,endDate:row.date,
    open:row.open,high:row.high,low:row.low,close:row.close,...(row.volume===undefined?{}:{volume:row.volume}),complete:true}));
}
function weeklyReplayCandles(rows,market,{cursorDate,evaluationAt}){
  const groups=new Map();
  for(const row of rows){
    const monday=replayWeekStart(row.date);
    if(!groups.has(monday))groups.set(monday,[]);
    groups.get(monday).push(row);
  }
  const candles=[];let incompleteGroups=0,formingGroups=0,missingGroups=0,unreviewedGroups=0;
  for(const [monday,days]of groups){
    const expected=replayWeekSessions(monday,market);
    if(expected===null){unreviewedGroups++;continue;}
    // A forming week uses every completed daily observation from its actual
    // opening session through this cursor. Missing completed sessions are not
    // partial future days, and may never produce a manufactured weekly candle.
    const disclosed=expected.filter(date=>date<=cursorDate&&sessionCloseUtc(date,market)<=evaluationAt);
    if(!disclosed.length||days.length!==disclosed.length||days.some((row,index)=>row.date!==disclosed[index])){
      incompleteGroups++;missingGroups++;continue;
    }
    const complete=disclosed.length===expected.length,last=disclosed.at(-1);
    if(!complete){incompleteGroups++;formingGroups++;}
    const volume=days.every(row=>Number.isFinite(row.volume))?days.reduce((sum,row)=>sum+row.volume,0):null;
    if(volume!==null&&!Number.isFinite(volume))throw new RangeError('Weekly replay volume overflow');
    candles.push({time:monday*86400,date:last,startDate:expected[0],endDate:last,
      periodStartDate:dateFromDay(monday),periodEndDate:dateFromDay(monday+6),
      open:days[0].open,high:Math.max(...days.map(row=>row.high)),low:Math.min(...days.map(row=>row.low)),
      close:days.at(-1).close,...(volume===null?{}:{volume}),daysIncluded:days.length,complete});
  }
  return {candles,incompleteGroups,formingGroups,missingGroups,unreviewedGroups};
}

/** Independently sourced display candles for a preserved forecast comparison.
 * The caller's forecast/scoring series is never replaced by this OHLC layer. */
export function buildReplayObservedCandles({symbol='BTCUSD',observations=[],observedAt=null,observedThrough=null,
  source=null,cursorDate,frequency='daily',evaluatedAt=new Date().toISOString(),clockMode='observed-date',cursorAt}={}){
  if(!['daily','weekly'].includes(frequency))throw new RangeError('Replay supports daily or weekly observations');
  if(!['observed-date','information-time'].includes(clockMode))throw new RangeError('Unknown replay clock mode');
  utcDay(cursorDate);
  const market=marketFor(symbol),evaluation=normalizeForecastTimestamp(evaluatedAt,'evaluatedAt');
  const at=cursorAt===undefined?sessionCloseUtc(cursorDate,market):normalizeForecastTimestamp(cursorAt,'cursorAt');
  if(at===null)throw new RangeError('Replay market close is outside the reviewed calendar');
  const evaluationAt=at<evaluation?at:evaluation;
  const normalized=observationRows(observations,{symbol,observedAt,observedThrough,source}).filter(row=>row.date<=cursorDate);
  if(clockMode==='information-time'&&!normalized.every(receiptComplete))throw new RangeError('Replay information time requires complete acquisition receipts');
  const visible=currentObservations(normalized,clockMode==='information-time'?evaluationAt:evaluation)
    .filter(row=>row.eventAt!==null&&row.eventAt<=evaluationAt);
  const daily=dailyReplayCandles(visible),weekly=frequency==='weekly'?weeklyReplayCandles(daily,market,{cursorDate,evaluationAt}):null;
  const candles=weekly?.candles??daily;
  return freeze({candles,metadata:{frequency,sourceFrequency:'daily',forwardFrequency:'daily',weekStartsOn:'monday-utc',
    cursorDate,evaluationAt,observedThrough:daily.at(-1)?.date??null,firstOhlcDate:daily[0]?.date??null,
    ohlcAvailable:candles.length>0,completeOhlcCoverage:visible.length>0&&daily.length===visible.length,
    partialWeekCount:weekly?.incompleteGroups??0,formingWeekCount:weekly?.formingGroups??0,
    missingWeekCount:weekly?.missingGroups??0,unreviewedWeekCount:weekly?.unreviewedGroups??0,
    observationClock:clockMode==='observed-date'?'current-vintage-market-bar-reconstruction':'recorded-acquisition-cutoff',
    displayOnly:true,historicalAvailabilityProven:false,providerAuthenticityProven:false,
    source:source===null?null:copy(source)}});
}

/** Source capability, not an instruction to change the selected interval.
 * Daily OHLC can form a weekly prefix; it cannot reconstruct intraday bars.
 * Dates describe acquired, completed observations without exposing their prices. */
export function getReplayIntervalCapabilities({symbol='BTCUSD',observations=[],observedAt=null,observedThrough=null,
  source=null,evaluatedAt=new Date().toISOString()}={}){
  const market=marketFor(symbol),evaluation=normalizeForecastTimestamp(evaluatedAt,'evaluatedAt');
  const normalized=observationRows(observations,{symbol,observedAt,observedThrough,source});
  const current=currentObservations(normalized,evaluation).filter(row=>row.eventAt!==null&&row.eventAt<=evaluation);
  const candles=current.filter(row=>['open','high','low','close'].every(key=>Number.isFinite(row[key])));
  const firstOhlcDate=candles[0]?.date??null,lastOhlcDate=candles.at(-1)?.date??null;
  const firstWeeklyDate=candles.find(row=>replayWeekSessions(replayWeekStart(row.date),market)?.[0]===row.date)?.date??null;
  const capability=(firstDate,lastDate,reason)=>({supported:firstDate!==null,reason:firstDate===null?reason:null,
    firstDate,lastDate:firstDate===null?null:lastDate,firstReplayDate:firstDate});
  const intervals=Object.fromEntries(['1m','5m','15m','30m','1h','4h'].map(id=>[id,capability(null,null,'intraday-source-unavailable')]));
  intervals.daily=capability(firstOhlcDate,lastOhlcDate,'genuine-ohlc-unavailable');
  intervals.weekly=capability(firstWeeklyDate,lastOhlcDate,'weekly-opening-observation-unavailable');
  return freeze({sourceFrequency:'daily',forwardFrequency:'daily',weekStartsOn:'monday-utc',
    firstObservationDate:current[0]?.date??null,lastObservationDate:current.at(-1)?.date??null,
    firstOhlcDate,lastOhlcDate,availableDates:candles.map(row=>row.date),intervals});
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
  const dailyCandles=dailyReplayCandles(visible);
  const weekly=frequency==='weekly'?weeklyReplayCandles(dailyCandles,session.market,frame):null;
  const observedCandles=(weekly?.candles??dailyCandles).filter(inRange);
  const availableDailyDates=new Set(dailyCandles.map(row=>row.date));
  return freeze({frame,frequency,originDate:session.asOf,observedRows,observedCandles,
    ohlcAvailable:observedCandles.length>0,
    completeOhlcCoverage:observedRows.length>0&&observedRows.every(row=>availableDailyDates.has(row.date)),
    partialWeekCount:weekly?.incompleteGroups??0,formingWeekCount:weekly?.formingGroups??0,
    missingWeekCount:weekly?.missingGroups??0,unreviewedWeekCount:weekly?.unreviewedGroups??0,
    ...bounds([...observedRows,...observedCandles,...frame.forecast.filter(inRange)])});
}
