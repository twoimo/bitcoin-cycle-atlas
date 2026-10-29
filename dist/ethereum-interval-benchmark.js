import {utcDay,dateFromDay} from './cycle-engine.js?v=1.29.0';
import {readAssetDailyRows} from './asset-daily-observations.js';

/** A deliberately simple distribution control. This is a log random walk with
 * constant trailing volatility, not a claim that ETH returns are Gaussian. */
export const ETH_INTERVAL_BENCHMARK_POLICY=Object.freeze({
  version:'eth-gaussian-interval-control-1',lookbackReturnDays:180,
  normal90Percentile:1.2815515655446004,nominalPointwiseMass:.8,alpha:.2,
  explicitDailyLogDrift:0,maximumHorizonDays:730,
  horizons:Object.freeze([30,90,180]),models:Object.freeze(['adaptiveEth','pooledEth']),
  additionalResearchModels:Object.freeze(['warmStartEth']),
  retrospective:true,policyPreregistered:false,calibrated:false,coverageGuarantee:false,
});
const P=ETH_INTERVAL_BENCHMARK_POLICY,positive=x=>Number.isFinite(x)&&x>0;
const mean=values=>values.length?values.reduce((sum,v)=>sum+v/values.length,0):null;
function median(values){
  if(!values.length)return null;
  const a=[...values].sort((x,y)=>x-y),i=Math.floor(a.length/2);
  return a.length%2?a[i]:a[i-1]+(a[i]-a[i-1])/2;
}
function horizonsChecked(horizons){
  if(!Array.isArray(horizons)||!horizons.length||horizons.length>12||new Set(horizons).size!==horizons.length||
    horizons.some(h=>!Number.isSafeInteger(h)||h<1||h>P.maximumHorizonDays))throw new RangeError('Unique ETH interval-control horizons must be 1–730 days');
  return horizons;
}
function archive(history,asOf){
  utcDay(asOf);
  const raw=Array.isArray(history)?history:history?.dailyHistory?.candles??history?.candles;
  if(!Array.isArray(raw)||raw.length>100000)throw new TypeError('ETH interval control needs at most 100000 daily observations');
  return new Map(readAssetDailyRows(history,'ETH',asOf).map(row=>[row.epochDay,row]));
}
function fitAt(prices,origin){
  const last=utcDay(origin),first=last-P.lookbackReturnDays,rows=[];
  for(let day=first;day<=last;day++){
    const row=prices.get(day);
    if(!row)return {status:'unavailable',reason:'The control requires 181 consecutive completed closes through its origin',missingDate:dateFromDay(day)};
    rows.push(row);
  }
  const returns=rows.slice(1).map((row,i)=>Math.log(row.price)-Math.log(rows[i].price));
  const average=mean(returns),variance=returns.reduce((sum,r)=>sum+(r-average)**2/(returns.length-1),0);
  if(!Number.isFinite(variance)||variance<0)throw new RangeError('ETH interval-control sample variance is outside finite range');
  return {status:'available',origin,anchorPrice:rows.at(-1).price,variance,
    training:{firstObservation:rows[0].date,informationThrough:origin,observations:rows.length,returnCount:returns.length,
      sampleLogReturnMean:average,sampleLogReturnVariance:variance,varianceDenominator:returns.length-1,
      sampleMeanExtrapolated:false,missingDaysInterpolated:false}};
}
function prediction(fit,horizonDays){
  const radius=P.normal90Percentile*Math.sqrt(fit.variance*horizonDays),center=Math.log(fit.anchorPrice);
  const lower=radius===0?fit.anchorPrice:Math.exp(center-radius),upper=radius===0?fit.anchorPrice:Math.exp(center+radius);
  const targetDate=dateFromDay(utcDay(fit.origin)+horizonDays);
  if(!positive(lower)||!positive(upper)||lower>fit.anchorPrice||upper<fit.anchorPrice)return {
    status:'unavailable',horizonDays,targetDate,reason:'Control interval endpoints exceed finite positive numeric range; no clipping applied'};
  return {status:'available',horizonDays,targetDate,price:fit.anchorPrice,lower,upper,logRadius:radius,
    nominalPointwiseMass:P.nominalPointwiseMass,calibrated:false,coverageGuarantee:false};
}

export function buildEthereumGaussianIntervalBenchmark({ethHistory,asOf,horizons=P.horizons}={}){
  horizonsChecked(horizons);
  const prices=archive(ethHistory,asOf),fit=fitAt(prices,asOf);
  if(fit.status==='unavailable')return {...fit,asOf,policy:P,predictions:[]};
  const predictions=horizons.map(h=>prediction(fit,h));
  return {status:predictions.some(row=>row.status==='available')?'available':'unavailable',asOf,policy:P,
    predictions,training:fit.training,assumptions:{
      formula:'log(P[t+h]) = log(P[t]) + sqrt(h)*sd180*Z; Z assumed standard normal',
      sampleVariance:'180 completed daily log returns, demeaned, divided by 179',
      medianEqualsObservedAnchor:true,meanPriceEqualsObservedAnchor:false,
      independentGaussianReturnsAssumed:true,constantFutureVarianceAssumed:true,
      estimatedMeanAppliedToFuture:false,parameterUncertaintyIncluded:false,
      probability:null,calibrated:false,coverageGuarantee:false,historicalVintagesVerified:false,
      purpose:'Simple uncalibrated distribution control; no production adoption or evidence of Gaussian ETH returns'},
  };
}

function band(row,model){
  const value=row.simulatedIntervals?.[model],point=row.predictions?.[model];
  if(value==null||point==null)return null;
  if(!positive(point)||!positive(value.lower)||!positive(value.upper)||value.lower>point||point>value.upper)
    throw new RangeError('Candidate median and interval must be ordered, positive and finite');
  if(!Number.isFinite(value.nominalPointwiseMass)||Math.abs(value.nominalPointwiseMass-P.nominalPointwiseMass)>1e-12)
    throw new RangeError('Candidate and control must use the same nominal interval mass');
  return {price:point,lower:value.lower,upper:value.upper};
}
function scores(forecast,actual){
  const {price,lower,upper}=forecast,y=Math.log(actual),l=Math.log(lower),u=Math.log(upper);
  const width=upper-lower,usdScore=width+(2/P.alpha)*Math.max(0,lower-actual)+(2/P.alpha)*Math.max(0,actual-upper);
  return {absoluteLogError:Math.abs(Math.log(price)-y),squaredLogError:(Math.log(price)-y)**2,
    covered:actual>=lower&&actual<=upper,lowerMiss:actual<lower,upperMiss:actual>upper,
    logWidth:u-l,usdWidth:width,logIntervalScore:u-l+(2/P.alpha)*Math.max(0,l-y)+(2/P.alpha)*Math.max(0,y-u),
    usdIntervalScore:Number.isFinite(usdScore)?usdScore:null,usdScoreStatus:Number.isFinite(usdScore)?'finite':'out-of-range'};
}
function summarize(rows,key){
  const selected=rows.map(row=>row.scores[key]),usd=selected.filter(s=>s.usdScoreStatus==='finite');
  return {n:selected.length,meanAbsoluteLogError:mean(selected.map(s=>s.absoluteLogError)),
    rootMeanSquaredLogError:selected.length?Math.sqrt(mean(selected.map(s=>s.squaredLogError))):null,
    empiricalCoverage:mean(selected.map(s=>Number(s.covered))),lowerMisses:selected.filter(s=>s.lowerMiss).length,
    upperMisses:selected.filter(s=>s.upperMiss).length,meanLogWidth:mean(selected.map(s=>s.logWidth)),
    medianLogWidth:median(selected.map(s=>s.logWidth)),meanUsdWidth:mean(selected.map(s=>s.usdWidth)),
    medianUsdWidth:median(selected.map(s=>s.usdWidth)),meanLogIntervalScore:mean(selected.map(s=>s.logIntervalScore)),
    medianLogIntervalScore:median(selected.map(s=>s.logIntervalScore)),
    meanUsdIntervalScore:usd.length===selected.length?mean(usd.map(s=>s.usdIntervalScore)):null,
    usdScoreCount:usd.length,usdScoreUnavailable:selected.length-usd.length};
}
function disjoint(rows){
  let boundary=-Infinity;
  return rows.filter(row=>{
    if(utcDay(row.origin)<boundary)return false;
    boundary=utcDay(row.targetDate);return true;
  });
}

/** Source prices supply outcomes, and every cached case anchor/outcome must match
 * them. Fits see exactly 181 observations at their own origin. Candidate and
 * control scores always use the identical common target set before thinning. */
export function evaluateEthereumGaussianIntervalBenchmark({ethHistory,cases,asOf,models=P.models,horizons=P.horizons}={}){
  horizonsChecked(horizons);
  if(!Array.isArray(models)||!models.length||new Set(models).size!==models.length||models.some(model=>![...P.models,...P.additionalResearchModels].includes(model)))
    throw new TypeError('ETH interval controls require unique supported research model keys');
  if(!Array.isArray(cases)||cases.length>30000)throw new TypeError('A bounded ETH comparison case array is required');
  const prices=archive(ethHistory,asOf),cutoff=utcDay(asOf),fits=new Map(),seen=new Set(),rows=[],excluded=[];
  for(const row of cases){
    if(!horizons.includes(row.horizonDays))continue;
    const originDay=utcDay(row.origin),targetDay=utcDay(row.targetDate);
    if(targetDay-originDay!==row.horizonDays)throw new RangeError('ETH interval-control target clock mismatch');
    if(originDay>cutoff||targetDay>cutoff||row.status==='pending')continue;
    const key=row.origin+'|'+row.horizonDays;
    if(seen.has(key))throw new RangeError('Duplicate ETH interval-control origin/horizon case');
    seen.add(key);
    const actual=prices.get(targetDay)?.price,anchor=prices.get(originDay)?.price;
    if(row.actual==null||actual==null){excluded.push({origin:row.origin,horizonDays:row.horizonDays,reason:'missing-observation'});continue;}
    if(!positive(row.actual)||row.actual!==actual)throw new RangeError('Cached comparison outcome differs from the source close');
    if(!positive(row.anchorPrice)||row.anchorPrice!==anchor)throw new RangeError('Cached comparison anchor differs from the source close');
    if(!fits.has(row.origin))fits.set(row.origin,fitAt(prices,row.origin));
    const fit=fits.get(row.origin),control=fit.status==='available'?prediction(fit,row.horizonDays):fit;
    for(const model of models){
      const candidate=band(row,model);
      if(!candidate){excluded.push({model,origin:row.origin,horizonDays:row.horizonDays,reason:'candidate-unavailable'});continue;}
      if(control.status!=='available'){excluded.push({model,origin:row.origin,horizonDays:row.horizonDays,reason:control.reason});continue;}
      const benchmark={price:control.price,lower:control.lower,upper:control.upper};
      rows.push({model,origin:row.origin,targetDate:row.targetDate,horizonDays:row.horizonDays,anchorPrice:anchor,actual,
        candidate,benchmark,training:fit.training,scores:{candidate:scores(candidate,actual),benchmark:scores(benchmark,actual)}});
    }
  }
  rows.sort((a,b)=>a.origin.localeCompare(b.origin)||a.horizonDays-b.horizonDays||a.model.localeCompare(b.model));
  const summaries=[];
  for(const horizonDays of horizons)for(const model of models){
    const common=rows.filter(row=>row.model===model&&row.horizonDays===horizonDays),used=disjoint(common);
    const candidate=summarize(used,'candidate'),benchmark=summarize(used,'benchmark');
    summaries.push({model,horizonDays,status:common.length?'evaluated':'unavailable',sameOriginCases:common.length,
      disjointCases:used.length,commonOrigins:common.map(row=>row.origin),disjointOrigins:used.map(row=>row.origin),
      allEligible:{candidate:summarize(common,'candidate'),benchmark:summarize(common,'benchmark')},disjoint:{candidate,benchmark},
      pointSkillAgainstFlat:benchmark.meanAbsoluteLogError>0?1-candidate.meanAbsoluteLogError/benchmark.meanAbsoluteLogError:null,
      intervalSkillAgainstControl:benchmark.meanLogIntervalScore>0?1-candidate.meanLogIntervalScore/benchmark.meanLogIntervalScore:null,
      candidateMinusControlLogScore:used.length?candidate.meanLogIntervalScore-benchmark.meanLogIntervalScore:null,
      candidateMinusControlUsdScore:used.length&&candidate.meanUsdIntervalScore!==null&&benchmark.meanUsdIntervalScore!==null?
        candidate.meanUsdIntervalScore-benchmark.meanUsdIntervalScore:null,
      independentSampleSize:null,coverageGuarantee:false});
  }
  return {kind:'ethereum-gaussian-interval-control-comparison',status:rows.length?'evaluated':'unavailable',asOf,policy:P,
    candidateForecastsChanged:false,sourceOutcomeMatchingRequired:true,fitCount:fits.size,cases:rows,excluded,summaries,
    allPairingsUseCommonOrigins:true,adjacentDisjointWindowsMayShareEndpoint:true,historicalOutcomeAvailabilityProven:false,
    historicalVintagesVerified:false,productionPromoted:false,calibrated:false,coverageGuarantee:false,
    interpretation:'Retrospective current-vintage comparison against a fixed zero-log-drift Gaussian control. Score comparisons do not validate Gaussian returns, nominal 80% coverage, or future superiority.'};
}
