import {buildLongHorizonForecast} from './long-horizon-forecast.js';
import {cutoffBacktestSettings} from './replay-retrospective.js';
import {LONG_HORIZON_CLAIMS} from './long-horizon-evidence.js';
import {forecastHash} from './forecast-records.js';
import {normalizeForecastTimestamp} from './forecast-information-time.js';
import {utcDay,dateFromDay,validateDataset} from './cycle-engine.js';

const KIND='atlas-cutoff-backtest-forecast';
const HEX=/^[a-f0-9]{64}$/;
function freeze(value){if(value&&typeof value==='object'&&!Object.isFrozen(value)){for(const item of Object.values(value))freeze(item);Object.freeze(value);}return value;}
export function firstCutoffBacktestStart(observations){
  const published=LONG_HORIZON_CLAIMS.filter(row=>row.publisher==='WisdomTree'&&row.chartEligible&&row.sourceStatus==='verified-primary').map(row=>row.publishedAt).sort()[0];
  const rows=observations.filter(row=>(Array.isArray(row)?row[0]:row.date)>=published);
  const first=rows.find(row=>observations.indexOf(row)>=365);
  if(!first)throw new RangeError('발표 시점이 확인된 장기 평가 자료와 완료 종가가 부족합니다.');
  return dateFromDay(utcDay(Array.isArray(first)?first[0]:first.date)+1);
}
function inputs(prices,asOf,horizonDays,source){
  utcDay(asOf);
  if(!Number.isSafeInteger(horizonDays)||horizonDays<1||horizonDays>730)throw new RangeError('Backtest horizon must be 1–730 days');
  if(!Array.isArray(prices)||prices.length>100000)throw new TypeError('Bounded cutoff prices required');
  const prefix=[];
  for(const row of prices){const date=Array.isArray(row)?row[0]:row?.date;utcDay(date);if(date<=asOf)prefix.push(Array.isArray(row)?[date,row[1]]:[date,row.price]);}
  const rows=validateDataset(prefix).map(row=>[row.date,row.price]);
  if(rows.at(-1)?.[0]!==asOf||rows.length<366)throw new RangeError('기준일까지 366개 이상의 완료 종가가 필요합니다.');
  if(rows.some((row,i)=>i&&utcDay(row[0])-utcDay(rows[i-1][0])!==1))throw new RangeError('기준일까지의 일별 종가에 빈 날짜가 있습니다.');
  if(!source||source.provider!=='Bitstamp'||typeof source.priceMeaning!=='string')throw new TypeError('BTC backtest requires the same Bitstamp close source for input and evaluation');
  return rows;
}
function pathCheck(path,prefix,asOf,horizonDays){
  if(!Array.isArray(path)||path.length!==horizonDays+1||path[0]?.price!==prefix.at(-1)[1])throw new RangeError('Backtest forecast anchor/length mismatch');
  for(let i=0;i<path.length;i++)if(path[i].date!==dateFromDay(utcDay(asOf)+i)||!['price','lower','upper','baselinePrice'].every(key=>Number.isFinite(path[i][key])&&path[i][key]>0)||path[i].lower>path[i].price||path[i].upper<path[i].price)throw new RangeError('Invalid fixed backtest path');
}
export async function createCutoffBacktestForecast({prices,asOf,horizonDays=180,source,createdAt,modelOptions={}}={}){
  const prefix=inputs(prices,asOf,horizonDays,source),created=normalizeForecastTimestamp(createdAt,'createdAt');
  if(created<dateFromDay(utcDay(asOf)+1)+'T00:00:00.000Z')throw new RangeError('Backtest creation precedes its completed input');
  const settings=cutoffBacktestSettings(modelOptions,asOf),model=buildLongHorizonForecast(prefix,settings);
  const end=dateFromDay(utcDay(asOf)+horizonDays);
  const path=model.path.filter(row=>row.date>=asOf&&row.date<=end).map(({date,price,lower,upper,baselinePrice})=>({date,price,lower,upper,baselinePrice}));
  pathCheck(path,prefix,asOf,horizonDays);
  const body={schemaVersion:1,kind:KIND,symbol:'BTCUSD',asOf,horizonDays,createdAt:created,issuedAt:null,modelVersion:model.version,
    modelOptions:settings,modelOptionsHash:await forecastHash(settings),researchClaimsHash:await forecastHash(settings.claims),
    inputHash:await forecastHash(prefix),outputHash:await forecastHash(path),path,
    source:{provider:source.provider,priceMeaning:source.priceMeaning,sourceHash:source.sourceHash??null},
    provenance:{trainingThrough:asOf,trainingCount:prefix.length,firstObservation:prefix[0][0],lastObservation:prefix.at(-1)[0],futurePriceRowsConsumed:false,
      currentForecastConsumed:false,historicalVintageAvailable:false,historicalModelExistedAtOrigin:false},
    forecastScoringEnabled:true,prospectiveScoringEligible:false,publicationTimeProven:false,calibrated:false,
    meaning:'fixed-cutoff-price-comparison-current-model-reconstruction',bandMeaning:'conditional-assumptions-not-calibrated-probability'};
  return freeze({id:await forecastHash(body),...body});
}
export async function restoreCutoffBacktestForecast(record,{prices,asOf,horizonDays,source,evaluatedAt}={}){
  const prefix=inputs(prices,asOf,horizonDays,source),r=structuredClone(record),evaluation=normalizeForecastTimestamp(evaluatedAt,'evaluatedAt');
  if(!r||r.kind!==KIND||r.schemaVersion!==1||r.symbol!=='BTCUSD'||r.asOf!==asOf||r.horizonDays!==horizonDays||r.issuedAt!==null||r.forecastScoringEnabled!==true||r.prospectiveScoringEligible!==false||r.publicationTimeProven!==false||r.calibrated!==false||r.meaning!=='fixed-cutoff-price-comparison-current-model-reconstruction'||r.source?.provider!==source.provider||r.source?.priceMeaning!==source.priceMeaning)throw new TypeError('저장된 백테스트의 모드·자료 정의가 다릅니다.');
  const created=normalizeForecastTimestamp(r.createdAt,'createdAt');
  if(created>evaluation||created<dateFromDay(utcDay(asOf)+1)+'T00:00:00.000Z')throw new RangeError('Saved backtest creation clock is invalid');
  pathCheck(r.path,prefix,asOf,horizonDays);
  const p=r.provenance;
  if(p?.trainingThrough!==asOf||p.trainingCount!==prefix.length||p.firstObservation!==prefix[0][0]||p.lastObservation!==asOf||p.futurePriceRowsConsumed!==false||p.currentForecastConsumed!==false||p.historicalVintageAvailable!==false||p.historicalModelExistedAtOrigin!==false)throw new TypeError('Saved backtest cutoff provenance is invalid');
  const {id,...body}=r;
  const hashes=await Promise.all([forecastHash(body),forecastHash(prefix),forecastHash(r.path),forecastHash(r.modelOptions),forecastHash(r.modelOptions?.claims)]);
  if([id,r.inputHash,r.outputHash,r.modelOptionsHash,r.researchClaimsHash].some((hash,i)=>!HEX.test(hash??'')||hash!==hashes[i]))throw new Error('저장된 백테스트 또는 기준일까지의 가격이 변경됐습니다.');
  if(r.modelOptions.asOf!==asOf||r.modelOptions.researchAsOf!==asOf||r.modelOptions.referenceDate!==dateFromDay(utcDay(asOf)+1)||!Array.isArray(r.modelOptions.claims)||r.modelOptions.claims.some(claim=>claim.publishedAt>asOf))throw new RangeError('Saved backtest model clock is invalid');
  return freeze(r);
}
