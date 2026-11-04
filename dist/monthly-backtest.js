import * as cutoffModel from './replay-cutoff-forecast.js';
import {cutoffBacktestSettings} from './replay-retrospective.js';
import {createCutoffBacktestReplaySession,buildReplayFrame} from './forecast-replay.js';
import {forecastHash} from './forecast-records.js';
import {utcDay,dateFromDay,validateDataset} from './cycle-engine.js';
import {normalizeForecastTimestamp} from './forecast-information-time.js';

export const MONTHLY_HORIZONS=Object.freeze([30,90,180,365]);
const KIND='atlas-monthly-cutoff-forecast';
const HEX=/^[a-f0-9]{64}$/;
const clone=value=>structuredClone(value);
function freeze(value){if(value&&typeof value==='object'&&!Object.isFrozen(value)){Object.values(value).forEach(freeze);Object.freeze(value);}return value;}
const next=date=>dateFromDay(utcDay(date)+1);
const average=values=>values.length?values.reduce((a,b)=>a+b,0)/values.length:null;
const sign=value=>Math.sign(value);

export function monthlyOrigins(archive,{evaluatedAt=new Date().toISOString()}={}){
  const at=normalizeForecastTimestamp(evaluatedAt,'evaluatedAt');
  if(archive?.symbol!=='BTCUSD'||archive.source?.provider!=='Bitstamp'||!Array.isArray(archive.observations))throw new TypeError('Monthly BTC backtests require the Bitstamp replay archive');
  const rows=validateDataset(archive.observations.map(r=>[r.date,r.price]));
  const completed=dateFromDay(utcDay(at.slice(0,10))-1),through=archive.observedThrough;
  utcDay(through);
  if(rows.at(-1)?.date!==through||rows.some(r=>r.date>completed))throw new RangeError('Monthly archive includes incomplete observations');
  const first= dateFromDay(utcDay(cutoffModel.firstCutoffBacktestStart(rows))-1);
  const origins=[];
  let year=Number(first.slice(0,4)),month=Number(first.slice(5,7));
  for(let count=0;count<600;count++){
    const end=dateFromDay(utcDay(`${month===12?year+1:year}-${String(month===12?1:month+1).padStart(2,'0')}-01`)-1);
    if(end>completed)break;if(end>=first)origins.push(end);
    if(month===12){year++;month=1;}else month++;
    if(count===599)throw new RangeError('Monthly origin limit exceeded');
  }
  return origins;
}

export async function monthlyOriginKey({archive,asOf,modelOptions={},modelIdentity}){
  utcDay(asOf);
  if(next(asOf).slice(0,7)===asOf.slice(0,7))throw new RangeError('A completed calendar month-end is required');
  if(!HEX.test(modelIdentity?.hash??'')||!modelIdentity.files||await forecastHash(modelIdentity.files)!==modelIdentity.hash)throw new TypeError('Verified calculation source identity required');
  const prefix=archive.observations.filter(r=>r.date<=asOf).map(r=>[r.date,r.price]);
  const settings=cutoffBacktestSettings(modelOptions,asOf);
  const body={kind:KIND,version:1,asOf,horizonDays:365,provider:archive.source.provider,priceMeaning:archive.source.priceMeaning,
    inputHash:await forecastHash(prefix),modelOptionsHash:await forecastHash(settings),modelSourceHash:modelIdentity.hash};
  return {key:await forecastHash(body),...body};
}

async function verifyEnvelope(envelope,request,archive,evaluatedAt){
  if(envelope?.kind!==KIND||envelope.version!==1||envelope.key!==request.key||envelope.modelSourceHash!==request.modelSourceHash)throw new Error('월말 고정본의 계산 소스·식별자가 다릅니다. 기존 기록은 보존합니다.');
  const {digest,...body}=envelope;
  if(!HEX.test(digest??'')||await forecastHash(body)!==digest)throw new Error('월말 고정본의 무결성을 확인하지 못했습니다. 기존 기록은 보존합니다.');
  const record=await cutoffModel.restoreCutoffBacktestForecast(envelope.record,{prices:archive.observations,asOf:request.asOf,horizonDays:365,source:archive.source,evaluatedAt});
  if(record.inputHash!==request.inputHash||record.modelOptionsHash!==request.modelOptionsHash)throw new Error('월말 고정본의 입력·설정이 일치하지 않습니다.');
  return record;
}

/** A short replay uses the exact prefix of the stored 365-day path, never a new model run. */
export async function monthlyReplayForecast(record,horizonDays){
  if(!MONTHLY_HORIZONS.includes(horizonDays)||record?.horizonDays!==365)throw new RangeError('Unsupported monthly replay horizon');
  if(horizonDays===365)return record;
  const {id,...body}=clone(record);
  body.horizonDays=horizonDays;body.path=body.path.slice(0,horizonDays+1);body.outputHash=await forecastHash(body.path);
  return freeze({id:await forecastHash(body),...body});
}

export async function evaluateMonthlyOrigin(record,archive,{evaluatedAt=new Date().toISOString()}={}){
  const session=await createCutoffBacktestReplaySession({...archive,asOf:record.asOf,playbackStartDate:next(record.asOf),horizonDays:365,forecastRecord:record,evaluatedAt,cutoffModel});
  const actual=new Map(session.observations?.map(r=>[r.date,r])??archive.observations.map(r=>[r.date,r]));
  const completed=dateFromDay(utcDay(normalizeForecastTimestamp(evaluatedAt,'evaluatedAt').slice(0,10))-1);
  const evaluations=MONTHLY_HORIZONS.map(horizonDays=>{
    const targetDate=dateFromDay(utcDay(record.asOf)+horizonDays),cursorDate=session.timeline.findLast(date=>date<=targetDate);
    const frame=buildReplayFrame(session,{cursorDate,clockMode:'observed-date'});
    const count=frame.metrics.matchedCount;
    const status=targetDate>completed?'immature':targetDate>archive.observedThrough?'awaiting-data':count!==horizonDays?'missing-observations':'complete';
    const endActual=actual.get(targetDate)?.price,estimate=record.path[horizonDays].price,anchor=record.path[0].price;
    return {horizonDays,targetDate,status,observedDays:count,missingDays:horizonDays-count,metrics:status==='complete'?{...frame.metrics,
      endpointActual:endActual,endpointForecast:estimate,endpointAbsolutePercentageError:Math.abs(estimate-endActual)/endActual,
      endpointReturn:endActual/anchor-1,predictedReturn:estimate/anchor-1,endpointDirectionCorrect:sign(endActual-anchor)===sign(estimate-anchor)}:null};
  });
  return freeze({asOf:record.asOf,recordId:record.id,inputHash:record.inputHash,outputHash:record.outputHash,evaluations});
}

/** Store writes are atomic first-writer-wins. Cancellation retains accepted prior records. */
export async function runMonthlyBacktests({archive,modelOptions={},modelIdentity,store,evaluatedAt=new Date().toISOString(),signal,onProgress=()=>{},computeForecast=cutoffModel.createCutoffBacktestForecast}={}){
  const origins=monthlyOrigins(archive,{evaluatedAt});
  if(origins.length>600)throw new RangeError('Monthly origin limit exceeded');
  if(typeof store?.get!=='function'||typeof store?.putIfAbsent!=='function')throw new TypeError('An immutable monthly forecast store is required');
  const rows=[];let restoredCount=0,createdCount=0;
  for(const asOf of origins){
    signal?.throwIfAborted();
    const request=await monthlyOriginKey({archive,asOf,modelOptions,modelIdentity});
    const existing=await store.get(request.key);signal?.throwIfAborted();
    try{
      let record;
      if(existing){record=await verifyEnvelope(existing,request,archive,evaluatedAt);restoredCount++;}
      else{
        record=await computeForecast({prices:archive.observations.filter(r=>r.date<=asOf),asOf,horizonDays:365,source:archive.source,createdAt:evaluatedAt,modelOptions},{signal});
        signal?.throwIfAborted();
        // Validate a worker result before accepting it at the persistence boundary.
        const body={kind:KIND,version:1,key:request.key,modelSourceHash:modelIdentity.hash,record};
        const envelope={...body,digest:await forecastHash(body)};
        await verifyEnvelope(envelope,request,archive,evaluatedAt);signal?.throwIfAborted();
        let accepted;
        try{accepted=await store.putIfAbsent(request.key,envelope);}
        catch(cause){throw Object.assign(new Error('월말 고정본 저장 실패 · 다시 확인하면 수락된 기록부터 복원합니다.',{cause}),{name:'MonthlyStorageError'});}
        record=await verifyEnvelope(accepted,request,archive,evaluatedAt);
        if(accepted.digest===envelope.digest)createdCount++;else restoredCount++;
      }
      signal?.throwIfAborted();
      rows.push({...await evaluateMonthlyOrigin(record,archive,{evaluatedAt}),record,status:'ready'});
    }catch(error){signal?.throwIfAborted();if(error.name==='MonthlyStorageError')throw error;rows.push({asOf,status:'error',error:error.message??String(error),record:null,evaluations:[]});}
    signal?.throwIfAborted();onProgress({rows:[...rows],completed:rows.length,total:origins.length,createdCount,restoredCount});
  }
  return freeze({version:1,kind:'atlas-monthly-backtest-result',symbol:'BTCUSD',evaluatedAt,observedThrough:archive.observedThrough,source:archive.source,modelIdentity,modelOptions:clone(modelOptions),origins,rows,createdCount,restoredCount,
    meaning:'current-model-month-end-reconstruction-not-contemporaneously-issued',historicalVintageAvailable:false,prospectiveScoringEligible:false});
}

export function summarizeMonthlyBacktests(rows,{commonOrigins=false}={}){
  const ready=rows.filter(r=>r.status==='ready'),common=ready.filter(r=>MONTHLY_HORIZONS.every(h=>r.evaluations.find(e=>e.horizonDays===h)?.status==='complete'));
  return MONTHLY_HORIZONS.map(horizonDays=>{
    const cohort=(commonOrigins?common:ready).map(r=>({asOf:r.asOf,...r.evaluations.find(e=>e.horizonDays===horizonDays)})).filter(e=>e.status==='complete');
    const meanLog=average(cohort.map(e=>e.metrics.meanAbsoluteLogError)),flat=average(cohort.map(e=>e.metrics.flatMeanAbsoluteLogError));
    return {horizonDays,originCount:cohort.length,origins:cohort.map(e=>e.asOf),totalOrigins:rows.length,errorOrigins:rows.filter(r=>r.status==='error').length,
      immatureOrigins:ready.filter(r=>r.evaluations.find(e=>e.horizonDays===horizonDays)?.status!=='complete').length,
      meanAbsolutePercentageError:average(cohort.map(e=>e.metrics.meanAbsolutePercentageError)),meanAbsoluteError:average(cohort.map(e=>e.metrics.meanAbsoluteError)),
      endpointAbsolutePercentageError:average(cohort.map(e=>e.metrics.endpointAbsolutePercentageError)),meanAbsoluteLogError:meanLog,flatMeanAbsoluteLogError:flat,
      skillVersusFlat:flat>0?1-meanLog/flat:null,endpointDirectionCorrectCount:cohort.filter(e=>e.metrics.endpointDirectionCorrect).length,
      commonOrigins,overlappingOutcomes:true,independentCycleCount:null};
  });
}
