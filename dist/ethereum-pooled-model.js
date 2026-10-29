import {utcDay,dateFromDay} from './cycle-engine.js?v=1.29.0';
import {readAssetDailyRows} from './asset-daily-observations.js';

/** Independent research control. All continuous post-Merge returns enter the
 * variance/innovation fit; no threshold state or explicit future drift is used.
 * Zero explicit drift does not prove a conditional-zero mean or price martingale. */
export const ETH_POOLED_POLICY=Object.freeze({
  version:'eth-pooled-volatility-research-1',historyStart:'2022-09-15',
  minimumObservations:366,alpha:0.06,beta:0.92,blockDays:28,
  sampleCount:256,maximumHorizonDays:730,maximumSampleCount:2048,seed:20261027,
  explicitFutureLogDrift:0,
});
const mean=a=>a.reduce((s,x)=>s+x,0)/a.length;
function generator(seed){let state=seed>>>0;return()=>{state+=0x6D2B79F5;let n=Math.imul(state^(state>>>15),state|1);n^=n+Math.imul(n^(n>>>7),n|61);return((n^(n>>>14))>>>0)/4294967296;};}
function price(log){const value=Math.exp(log);if(!(Number.isFinite(value)&&value>0))throw new RangeError('ETH pooled price overflow or underflow; no clipping is applied');return value;}
function quantile(sorted,p){const at=(sorted.length-1)*p,lo=Math.floor(at);return sorted[lo]+(sorted[Math.ceil(at)]-sorted[lo])*(at-lo);}

export function fitEthereumPooledModel(history,asOf){
  utcDay(asOf);
  const p=ETH_POOLED_POLICY,raw=Array.isArray(history)?history:history?.dailyHistory?.candles??history?.candles;
  if(!Array.isArray(raw)||raw.length>100000)throw new RangeError('ETH pooled input must be bounded to 100000 observations');
  const observed=readAssetDailyRows(history,'ETH',asOf),era=observed.filter(r=>r.date>=p.historyStart);
  let start=0;
  for(let i=1;i<era.length;i++)if(era[i].epochDay!==era[i-1].epochDay+1)start=i;
  const rows=era.slice(start);
  if(rows.length<p.minimumObservations)throw new RangeError('ETH pooled model requires 366 consecutive post-Merge observations');
  const returns=rows.slice(1).map((r,i)=>Math.log(r.price)-Math.log(rows[i].price));
  const rawMean=mean(returns),longRunVariance=returns.reduce((s,r)=>s+(r-rawMean)**2,0)/(returns.length-1);
  if(!(Number.isFinite(longRunVariance)&&longRunVariance>1e-12))throw new RangeError('ETH pooled model needs positive observed return variance');
  let v=longRunVariance;const filtered=[];
  for(const r of returns){
    const shock=r-rawMean;
    filtered.push(shock/Math.sqrt(v));
    v=(1-p.alpha-p.beta)*longRunVariance+p.alpha*shock*shock+p.beta*v;
  }
  const center=mean(filtered),scale=Math.sqrt(mean(filtered.map(z=>(z-center)**2)));
  if(!(Number.isFinite(scale)&&scale>1e-9))throw new RangeError('ETH pooled innovations have no usable variation');
  const innovations=filtered.map(z=>(z-center)/scale),anchor=rows.at(-1);
  return {asOf,anchorPrice:anchor.price,anchorDay:anchor.epochDay,longRunVariance,currentVariance:v,innovations,
    training:{firstObservation:rows[0].date,informationThrough:asOf,maxSourceDate:asOf,
      observations:rows.length,returnCount:returns.length,innovationCount:innovations.length,
      excludedObservations:observed.length-rows.length,missingDaysInterpolated:false,
      stateConditioningUsed:false,unclassifiedReturnsExcluded:false,
      sampleMeanUsedForResidualCentering:rawMean,explicitFutureLogDrift:0,
      initialVariance:longRunVariance,longRunVariance,currentVariance:v,
      innovationPopulationMean:mean(innovations),innovationPopulationSecondMoment:mean(innovations.map(z=>z*z)),
      historicalVintagesVerified:false,independentMarketCycles:null,pricePredictionAccuracyProven:false}};
}

export function simulateEthereumPooled(fit,{horizonDays=730,sampleCount=256,seed=20261027}={}){
  const p=ETH_POOLED_POLICY;
  if(!Number.isSafeInteger(horizonDays)||horizonDays<1||horizonDays>p.maximumHorizonDays)throw new RangeError('ETH pooled horizon must be 1–730 days');
  if(!Number.isSafeInteger(sampleCount)||sampleCount<64||sampleCount>p.maximumSampleCount)throw new RangeError('ETH pooled draws must be 64–2048');
  if(!Number.isSafeInteger(seed)||seed<0||seed>4294967295)throw new RangeError('ETH pooled seed must be uint32');
  if(!fit||![fit.anchorPrice,fit.longRunVariance,fit.currentVariance].every(x=>Number.isFinite(x)&&x>0)||
    !Number.isSafeInteger(fit.anchorDay)||!Array.isArray(fit.innovations)||fit.innovations.length<365||
    fit.innovations.length>99999||!fit.innovations.every(Number.isFinite))throw new TypeError('Invalid ETH pooled fit');
  const logs=Array.from({length:horizonDays+1},()=>new Float64Array(sampleCount)),representative=[];
  const logAnchor=Math.log(fit.anchorPrice);
  for(let draw=0;draw<sampleCount;draw++){
    const random=generator((seed^Math.imul(draw+1,0x9e3779b1))>>>0);
    let v=fit.currentVariance,l=logAnchor,block=0,offset=p.blockDays;
    logs[0][draw]=l;if(draw===0)representative.push({price:fit.anchorPrice,variance:v});
    for(let h=1;h<=horizonDays;h++){
      if(offset===p.blockDays){block=Math.floor(random()*fit.innovations.length);offset=0;}
      const z=fit.innovations[(block+offset++)%fit.innovations.length],shock=Math.sqrt(v)*z;
      l+=shock;price(l);logs[h][draw]=l;
      v=(1-p.alpha-p.beta)*fit.longRunVariance+p.alpha*shock*shock+p.beta*v;
      if(draw===0)representative.push({price:price(l),variance:v});
    }
  }
  const path=logs.map((values,h)=>{
    values.sort();
    return {date:dateFromDay(fit.anchorDay+h),price:h?representative[h].price:fit.anchorPrice,
      baselinePrice:h?price(quantile(values,.5)):fit.anchorPrice,
      low:h?price(quantile(values,.1)):fit.anchorPrice,high:h?price(quantile(values,.9)):fit.anchorPrice,
      kind:h?'conditional-pooled-path':'observed-anchor'};
  });
  return {path,representative,metadata:{version:p.version,seed,sampleCount,horizonDays,blockDays:p.blockDays,
    probability:null,calibrated:false,nominalPointwiseMass:.8,
    bandMeaning:'Conditional Monte Carlo 10th–90th percentiles, not validated 80% coverage or a simultaneous path band',
    centerMeaning:'Pointwise simulated median, not forced to the anchor and not an individually realizable trajectory',
    representativePathIndex:0,sharedBlockLaw:'Circular standardized return blocks; wraparound boundary assumed',
    stateConditioningUsed:false,explicitFutureLogDrift:0,historicalMeanAppliedToFuture:false,
    conditionalMeanZeroGuaranteed:false,priceMartingaleGuaranteed:false,
    parametersEstimatedFrom:'All continuous post-Merge observations through the current origin only',
    policyParametersValidated:false,policyPreregistered:false,parameterUncertaintyIncluded:false,
    deterministicFourYearCycle:false,bitcoinHalvingApplied:false,historicalVintageBacktest:false,
    ohlcClaim:false,productionPromoted:false}};
}

export function buildEthereumPooledCandidate({ethRows,asOf,horizons=[30,90,180],sampleCount=256,seed=20261027}={}){
  if(!Array.isArray(horizons)||!horizons.length||horizons.length>12||new Set(horizons).size!==horizons.length||
    horizons.some(h=>!Number.isSafeInteger(h)||h<1||h>730))throw new RangeError('ETH pooled unique horizons must be 1–730 days');
  try{
    const fit=fitEthereumPooledModel(ethRows,asOf),simulation=simulateEthereumPooled(fit,{horizonDays:Math.max(...horizons),sampleCount,seed});
    return {status:'available',model:ETH_POOLED_POLICY.version,asOf,
      predictions:horizons.map(h=>({horizonDays:h,targetDate:simulation.path[h].date,price:simulation.path[h].baselinePrice,
        simulatedLower:simulation.path[h].low,simulatedUpper:simulation.path[h].high,nominalPointwiseMass:.8})),
      training:fit.training,assumptions:{policy:ETH_POOLED_POLICY,simulation:simulation.metadata,
        innovationSource:'All post-Merge returns in the continuous origin prefix, including observations with no confirmed threshold state',
        driftFormula:'Explicit future log drift = 0; historical mean is used only to center fitted shocks',
        varianceFormula:'v_next = 0.02*pooledVariance + 0.06*shock² + 0.92*v',
        comparisonScope:'State conditioning and drift policy both differ from adaptiveEth; not a one-component causal ablation',
        economicInputsUsed:false,institutionalTargetsUsed:false},
      probability:null,calibrated:false,productionEligible:false};
  }catch(error){
    if(!(error instanceof RangeError||error instanceof TypeError))throw error;
    return {status:'unavailable',model:ETH_POOLED_POLICY.version,reason:error.message,predictions:[],probability:null,calibrated:false,productionEligible:false};
  }
}

export function buildEthereumPooledForecast({ethHistory,asOf,horizonDays=730,sampleCount=256,seed=20261027}={}){
  const fit=fitEthereumPooledModel(ethHistory,asOf),simulation=simulateEthereumPooled(fit,{horizonDays,sampleCount,seed});
  const warnings=[
    '상태 확인 여부와 관계없이 Merge 이후의 연속 수익률 전체를 변동성·충격 추정에 사용한 비교 후보입니다.',
    '미래에 더하는 명시적 평균 수익률은 0입니다. 가격 기대수익률 0·조건부 평균 0·중앙값 고정을 보장하지 않습니다.',
    '음영은 모의 10–90% 분위수이며 실제 80% 적중률·동시 경로 보장이 아닙니다.',
    '상태 모형 제거와 평균 정책이 함께 달라져 어느 한 요소의 단독 효과를 입증하지 않습니다.',
    '기관 목표가격·AI 채택을 가격 상승률로 변환하지 않으며 미래 OHLC·거래량을 만들지 않습니다.',
  ];
  return {symbol:'ETHUSD',asOf,displayEnd:simulation.path.at(-1).date,pathMode:'crypto-conditional-daily',
    researchModel:'pooled',scenario:{id:'base',label:'ETH 전체 수익률·변동성 비교 후보'},probability:null,calibrated:false,
    path:simulation.path,milestones:[],training:fit.training,metadata:simulation.metadata,warnings,
    displaySemantics:{baselineLabel:'모형 중앙값',envelopeLabel:'모의 10–90% 분위수',sampleLabel:'모형 예시 1개',
      inspectionNote:'Merge 이후의 연속 수익률 전체에서 추정한 변동성 비교 후보입니다. 점별 모의 분위수는 실제 적중률이 보장된 구간이나 미래 OHLC가 아닙니다.'},
    assetPath:{id:'base',asset:'ETH',asOf,endDate:simulation.path.at(-1).date,path:simulation.path,anchors:[],
      method:ETH_POOLED_POLICY.version,training:fit.training,metadata:simulation.metadata,warnings},
    assumptions:{policy:ETH_POOLED_POLICY,seed}};
}
