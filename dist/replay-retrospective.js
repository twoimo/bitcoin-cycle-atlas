import {buildLongHorizonForecast,LONG_HORIZON_DEFAULTS,LONG_HORIZON_SCENARIOS} from './long-horizon-forecast.js';
import {DETAILED_FORECAST_DEFAULTS} from './detailed-forecast.js';
import {LONG_HORIZON_CLAIMS} from './long-horizon-evidence.js';
import {forecastHash} from './forecast-records.js';
import {normalizeForecastTimestamp} from './forecast-information-time.js';
import {utcDay,dateFromDay,validateDataset} from './cycle-engine.js';

export const REPLAY_RETROSPECTIVE_KIND='atlas-replay-retrospective-forecast';
const MODEL_VERSION='source-anchored-long-horizon-2';
const HEX=/^[a-f0-9]{64}$/;
const SETTINGS=[...Object.keys(LONG_HORIZON_DEFAULTS),'highZoneFraction','priceGrowthRetention','bearDrawdownPct','stressBelowCandidatePct','referenceTimezone'];
const OVERRIDDEN=new Set(['asOf','referenceDate','researchAsOf','horizonYears','displayEnd','includeSamplePaths']);
const MODEL_KEYS=new Set([...SETTINGS,...OVERRIDDEN,'claims']);
const clone=value=>structuredClone(value);
const nextDate=date=>dateFromDay(utcDay(date)+1);
function freeze(value){if(value&&typeof value==='object'&&!Object.isFrozen(value)){for(const child of Object.values(value))freeze(child);Object.freeze(value);}return value;}
function scope(asOf,displayEnd){
  utcDay(asOf);utcDay(displayEnd);
  if(displayEnd<asOf||utcDay(displayEnd)-utcDay(asOf)>36500)throw new RangeError('Retrospective display extent is invalid');
}
function pricePrefix(dataset,asOf){
  if(!Array.isArray(dataset?.prices)||dataset.prices.length>100000)throw new TypeError('Retrospective inputs require bounded dataset.prices');
  // Inspect dates before selecting. Suffix prices, OHLC, volume and other
  // dataset fields are never passed to the model or its input hash.
  const selected=[];
  for(const row of dataset.prices){const date=Array.isArray(row)?row[0]:row?.date;utcDay(date);if(date<=asOf)selected.push(Array.isArray(row)?[date,row[1]]:[date,row.price]);}
  return selected.length?validateDataset(selected).map(row=>[row.date,row.price]):[];
}
function eligibleClaims(asOf){
  return clone(LONG_HORIZON_CLAIMS.filter(item=>item.chartEligible&&item.sourceStatus==='verified-primary'&&
    /^\d{4}-\d{2}-\d{2}$/.test(item.publishedAt)&&item.publishedAt<=asOf&&Number.isSafeInteger(item.targetYear)&&item.prices));
}
function checkedSettings(options,asOf){
  if(!options||typeof options!=='object'||Array.isArray(options)||Object.keys(options).some(key=>!MODEL_KEYS.has(key)))throw new TypeError('Retrospective model options contain unsupported inputs');
  const ranges={seed:[0,4294967295,true],sampleCount:[16,512,true],blockDays:[7,84,true],volatilityWindowDays:[28,365,true],
    volatilityMultiplier:[.5,2],terminalVolatilityPct:[1,100],localTurnThreshold:[.05,.5],highZoneFraction:[.8,.99],
    priceGrowthRetention:[0,1.5],bearDrawdownPct:[10,85],stressBelowCandidatePct:[1,50]};
  for(const [key,[low,high,integer]] of Object.entries(ranges)){
    const value=options[key];if(!Number.isFinite(value)||value<low||value>high||integer&&!Number.isSafeInteger(value))throw new RangeError('Invalid retrospective model option: '+key);
  }
  for(const key of ['volatilityHalfLifeYears','residualHalfLifeDays'])if(!Number.isFinite(options[key])||options[key]<=0)throw new RangeError('Invalid retrospective model option: '+key);
  if(!LONG_HORIZON_SCENARIOS.some(item=>item.id===options.scenario)||typeof options.applyCycleCalibration!=='boolean'||typeof options.referenceTimezone!=='string'||!options.referenceTimezone||
    options.asOf!==asOf||options.referenceDate!==nextDate(asOf)||options.researchAsOf!==asOf||options.horizonYears!==3||options.includeSamplePaths!==false||Object.hasOwn(options,'displayEnd'))
    throw new RangeError('Retrospective model clocks or settings are inconsistent');
  if(!Array.isArray(options.claims)||options.claims.length>1000)throw new RangeError('Retrospective research claims must be bounded');
  const ids=new Set();
  for(const claim of options.claims){
    if(!claim||typeof claim.id!=='string'||ids.has(claim.id)||claim.chartEligible!==true||claim.sourceStatus!=='verified-primary'||!Number.isSafeInteger(claim.targetYear))throw new TypeError('Invalid retrospective research claim');
    utcDay(claim.publishedAt);if(claim.publishedAt>asOf)throw new RangeError('Retrospective research publication exceeds its cutoff');ids.add(claim.id);
    if(!claim.prices||!['low','base','high'].every(key=>Number.isFinite(claim.prices[key])&&claim.prices[key]>0)||claim.prices.low>claim.prices.base||claim.prices.base>claim.prices.high)
      throw new RangeError('Retrospective research valuations must be positive and ordered');
  }
  return options;
}
function modelSettings(forecast,provided,asOf){
  if(!provided||typeof provided!=='object'||Array.isArray(provided)||Object.keys(provided).some(key=>!SETTINGS.includes(key)&&!OVERRIDDEN.has(key)))throw new TypeError('Retrospective model options contain unsupported inputs');
  const assumptions=forecast?.assumptions??{},long=forecast?.longHorizon?.assumptions??{},near=forecast?.nearPhase?.assumptions??{};
  const captured={scenario:forecast?.scenario?.id??(typeof forecast?.scenario==='string'?forecast.scenario:undefined),
    seed:assumptions.seed,sampleCount:assumptions.shortTermSourceEnsembleCount,blockDays:assumptions.blockDays,
    volatilityWindowDays:forecast?.observables?.volatilityWindowDays,volatilityMultiplier:assumptions.volatilityMultiplier,
    terminalVolatilityPct:long.terminalVolatilityPct,volatilityHalfLifeYears:long.volatilityHalfLifeYears,residualHalfLifeDays:long.residualHalfLifeDays,
    localTurnThreshold:assumptions.localTurnThreshold,applyCycleCalibration:forecast?.cycleCalibration?.forecastApplication?.enabled,
    highZoneFraction:near.highZoneFraction,priceGrowthRetention:near.priceGrowthRetention,bearDrawdownPct:near.bearDrawdownPct,
    referenceTimezone:forecast?.referenceTimezone};
  const options={};
  for(const key of SETTINGS)options[key]=provided[key]??captured[key]??LONG_HORIZON_DEFAULTS[key]??DETAILED_FORECAST_DEFAULTS[key];
  // A captured live reference date or calibration is not a past-origin input.
  Object.assign(options,{asOf,referenceDate:nextDate(asOf),researchAsOf:asOf,horizonYears:3,includeSamplePaths:false,claims:eligibleClaims(asOf)});
  return checkedSettings(options,asOf);
}
function unavailable(prefix,asOf,options){
  if(!prefix.length)return {code:'no-price-history',label:'기준일 이전의 실제 일별 가격이 없어 회고 경로를 계산하지 못했습니다.'};
  if(prefix.at(-1)[0]!==asOf)return {code:'cutoff-not-observed',label:'기준일의 실제 종가가 없어 회고 경로를 계산하지 못했습니다.'};
  if(prefix.length<366)return {code:'insufficient-price-history',label:'회고 계산에는 기준일까지 366일 이상의 실제 일별 가격이 필요합니다.'};
  if(prefix.some((row,index)=>index&&utcDay(row[0])-utcDay(prefix[index-1][0])!==1))return {code:'nonconsecutive-price-history',label:'기준일 이전 일별 가격에 빈 날짜가 있어 회고 경로를 계산하지 못했습니다.'};
  if(asOf<'2012-11-28')return {code:'issuance-anchor-unavailable',label:'선택한 기준일은 현재 장기 모형의 공급 일정 지원 범위 이전입니다.'};
  if(!options.claims.some(item=>item.publisher==='WisdomTree'&&`${item.targetYear}-12-31`>asOf))return {code:'research-unavailable-at-origin',label:'기준일까지 발표된 장기 평가 기준 자료가 없어 회고 경로를 계산하지 못했습니다.'};
  return null;
}
function source(dataset,prefix,asOf){
  const meta=dataset?.meta??{};
  return {provider:meta.sourceName??null,sourceUrl:meta.source??null,priceDefinition:meta.priceDefinition??null,
    retrievedAt:meta.retrievedAt??null,firstObservation:prefix[0]?.[0]??null,lastObservation:prefix.at(-1)?.[0]??null,
    observations:prefix.length,informationThrough:asOf,inputField:'dataset.prices',historicalVintageAvailable:false,
    historicalPublicationTimeProven:false};
}
function checkedPath(path,{asOf,displayEnd,status,prefix}){
  if(!Array.isArray(path)||path.length>36501)throw new RangeError('Retrospective path must be bounded');
  if(status==='unavailable'){if(path.length)throw new RangeError('Unavailable retrospective cannot contain a path');return;}
  if(path.length!==utcDay(displayEnd)-utcDay(asOf)+1||path[0]?.date!==asOf||path.at(-1)?.date!==displayEnd||path[0]?.price!==prefix.at(-1)?.[1])throw new RangeError('Retrospective path origin or extent differs from its inputs');
  for(let index=0;index<path.length;index++){
    const row=path[index];if(row.date!==dateFromDay(utcDay(asOf)+index)||!['price','lower','upper','baselinePrice'].every(key=>Number.isFinite(row[key])&&row[key]>0)||row.lower>row.price||row.upper<row.price)
      throw new RangeError('Retrospective path values must be daily, positive and ordered');
  }
}

/** One present-day reconstruction from the selected price prefix. Its original
 * live forecast is kept elsewhere; this record never becomes an issued score. */
export async function createReplayRetrospectiveForecast({dataset,forecast,asOf,displayEnd=forecast?.asOf,createdAt,originalOutputHash,modelOptions={}}={}){
  scope(asOf,displayEnd);
  const created=normalizeForecastTimestamp(createdAt,'retrospective createdAt');
  if(created<nextDate(asOf)+'T00:00:00.000Z'||!HEX.test(originalOutputHash))throw new RangeError('Retrospective creation clock or original forecast identity is invalid');
  const prefix=pricePrefix(dataset,asOf),options=modelSettings(forecast,clone(modelOptions),asOf),priceSource=clone(source(dataset,prefix,asOf));
  let absence=unavailable(prefix,asOf,options),model=null,path=[];
  if(!absence){
    try{model=buildLongHorizonForecast(prefix,options);}
    catch(error){
      if(!(error instanceof RangeError)||!/^Positive (recent realized volatility|historical return variation) is required$/.test(error.message))throw error;
      absence={code:'insufficient-price-variation',label:'기준일 이전 가격 변동 자료가 부족하여 회고 경로를 계산하지 못했습니다.'};
    }
    if(model)path=model.path.filter(row=>row.date>=asOf&&row.date<=displayEnd).map(row=>({date:row.date,price:row.price,lower:row.lower,upper:row.upper,baselinePrice:row.baselinePrice}));
  }
  const status=absence?'unavailable':'ready';checkedPath(path,{asOf,displayEnd,status,prefix});
  const [inputHash,outputHash,modelOptionsHash,researchClaimsHash]=await Promise.all([forecastHash(prefix),forecastHash(path),forecastHash(options),forecastHash(options.claims)]);
  const body={schemaVersion:1,kind:REPLAY_RETROSPECTIVE_KIND,symbol:'BTCUSD',status,asOf,displayEnd,createdAt:created,issuedAt:null,
    modelVersion:model?.version??MODEL_VERSION,modelOptions:options,modelOptionsHash,inputHash,outputHash,originalOutputHash,path,
    unavailableReason:absence?.code??null,reason:absence?.label??null,
    provenance:{prices:priceSource,researchAsOf:asOf,researchClaimsHash,modelModule:'dist/long-horizon-forecast.js',
      currentModelReconstruction:true,historicalModelExistedAtOrigin:false,historicalSourceAvailabilityProven:false,
      futurePriceRowsConsumed:false,originalForecastRecomputed:false},
    publicationTimeProven:false,forecastScoringEnabled:false,prospectiveScoringEligible:false,calibrated:false,
    meaning:'current-model-retrospective-from-cutoff-prices-not-an-issued-forecast',
    bandMeaning:'conditional-economic-assumptions-not-calibrated-probability'};
  return freeze({id:await forecastHash(body),...body});
}

/** Verify saved bytes against this session's consumed prefix without invoking
 * any forecast model. Later defaults and research revisions cannot repaint it. */
export async function restoreReplayRetrospectiveForecast(record,{dataset,asOf,displayEnd,originalOutputHash,evaluatedAt}={}){
  scope(asOf,displayEnd);
  const owned=clone(record),prefix=pricePrefix(dataset,asOf),evaluation=normalizeForecastTimestamp(evaluatedAt,'evaluatedAt');
  if(!owned||owned.kind!==REPLAY_RETROSPECTIVE_KIND||owned.schemaVersion!==1||owned.symbol!=='BTCUSD'||!['ready','unavailable'].includes(owned.status)||
    owned.asOf!==asOf||owned.displayEnd!==displayEnd||owned.originalOutputHash!==originalOutputHash||owned.modelVersion!==MODEL_VERSION||
    owned.issuedAt!==null||owned.publicationTimeProven!==false||owned.forecastScoringEnabled!==false||owned.prospectiveScoringEligible!==false||owned.calibrated!==false||
    owned.meaning!=='current-model-retrospective-from-cutoff-prices-not-an-issued-forecast'||
    ![owned.id,owned.inputHash,owned.outputHash,owned.modelOptionsHash,owned.provenance?.researchClaimsHash,originalOutputHash].every(value=>HEX.test(value)))throw new TypeError('Invalid saved retrospective forecast record');
  const created=normalizeForecastTimestamp(owned.createdAt,'retrospective createdAt');
  if(created!==owned.createdAt||created>evaluation||created<nextDate(asOf)+'T00:00:00.000Z')throw new RangeError('Saved retrospective creation clock is inconsistent');
  checkedSettings(owned.modelOptions,asOf);checkedPath(owned.path,{asOf,displayEnd,status:owned.status,prefix});
  if(owned.status==='ready'&&unavailable(prefix,asOf,owned.modelOptions))throw new RangeError('Saved retrospective cannot be ready without its required inputs');
  const p=owned.provenance,priceSource=p.prices;
  if(p.researchAsOf!==asOf||p.currentModelReconstruction!==true||p.historicalModelExistedAtOrigin!==false||p.historicalSourceAvailabilityProven!==false||p.futurePriceRowsConsumed!==false||p.originalForecastRecomputed!==false||
    priceSource?.informationThrough!==asOf||priceSource.inputField!=='dataset.prices'||priceSource.observations!==prefix.length||priceSource.firstObservation!==(prefix[0]?.[0]??null)||priceSource.lastObservation!==(prefix.at(-1)?.[0]??null)||
    priceSource.historicalVintageAvailable!==false||priceSource.historicalPublicationTimeProven!==false)throw new RangeError('Saved retrospective input provenance differs from its cutoff');
  if(owned.status==='ready'&&(owned.reason!==null||owned.unavailableReason!==null)||owned.status==='unavailable'&&(typeof owned.reason!=='string'||!owned.reason||typeof owned.unavailableReason!=='string'||!owned.unavailableReason))throw new TypeError('Saved retrospective availability reason is invalid');
  const {id,...body}=owned;
  const hashes=await Promise.all([forecastHash(body),forecastHash(prefix),forecastHash(owned.path),forecastHash(owned.modelOptions),forecastHash(owned.modelOptions.claims)]);
  if(hashes.some((hash,index)=>hash!==[id,owned.inputHash,owned.outputHash,owned.modelOptionsHash,p.researchClaimsHash][index]))throw new Error('Saved retrospective forecast content hash mismatch');
  return freeze(owned);
}
