import {utcDay,dateFromDay} from './cycle-engine.js?v=1.29.0';
import {readAssetDailyRows} from './asset-daily-observations.js';

/** Research model: causal confirmation states, duration hazards and filtered
 * historical innovations. Simulated states are a semi-Markov proxy, not
 * guaranteed future threshold crossings or independent macroeconomic cycles. */
export const ETH_ADAPTIVE_POLICY=Object.freeze({
  version:'eth-adaptive-research-1',historyStart:'2022-09-15',minimumObservations:366,
  drawdownPct:40,reversalPct:20,confirmationDays:14,
  ageBounds:Object.freeze([30,90,180,365,730]),hazardPriorDays:182.5,
  hazardPriorEvents:0.5,bucketPriorDays:180,driftPriorDays:365,
  variancePriorDays:120,driftHalfLifeDays:180,alpha:0.06,beta:0.92,
  blockDays:28,sampleCount:256,maximumHorizonDays:730,seed:20261027,
});
const STATES=['up','down'];
const average=a=>a.reduce((s,v)=>s+v,0)/a.length;
const variance=(a,m=average(a))=>a.reduce((s,v)=>s+(v-m)**2,0)/(a.length-1);
const bin=age=>{const i=ETH_ADAPTIVE_POLICY.ageBounds.findIndex(n=>age<=n);return i<0?5:i;};
function quantile(sorted,p){const at=(sorted.length-1)*p,lo=Math.floor(at);return sorted[lo]+(sorted[Math.ceil(at)]-sorted[lo])*(at-lo);}
function generator(seed){let state=seed>>>0;return()=>{state+=0x6D2B79F5;let n=Math.imul(state^(state>>>15),state|1);n^=n+Math.imul(n^(n>>>7),n|61);return((n^(n>>>14))>>>0)/4294967296;};}
function price(log){const p=Math.exp(log);if(!(Number.isFinite(p)&&p>0))throw new RangeError('ETH adaptive price overflow or underflow; no clipping is applied');return p;}
function prepare(history,asOf){
  utcDay(asOf);
  const raw=Array.isArray(history)?history:history?.dailyHistory?.candles??history?.candles;
  if(!Array.isArray(raw)||raw.length>100000)throw new RangeError('ETH adaptive input must be bounded to 100000 observations');
  const observed=readAssetDailyRows(history,'ETH',asOf);
  const era=observed.filter(r=>r.date>=ETH_ADAPTIVE_POLICY.historyStart);
  let start=0;
  for(let i=1;i<era.length;i++)if(era[i].epochDay!==era[i-1].epochDay+1)start=i;
  const rows=era.slice(start);
  if(rows.length<ETH_ADAPTIVE_POLICY.minimumObservations)throw new RangeError('ETH adaptive model requires 366 consecutive post-Merge observations');
  return {rows,excludedObservations:observed.length-rows.length,missingDaysInterpolated:false};
}

/** A turn's extremum date is descriptive. Only knownAt changes the state. */
export function confirmedEthereumRegimes(rows){
  if(!Array.isArray(rows)||!rows.length)throw new TypeError('ETH regime rows are required');
  const p=ETH_ADAPTIVE_POLICY,events=[];
  let mode='high',high=rows[0],low=null,fallingLow=null,reboundHigh=null,run=0;
  for(let i=1;i<rows.length;i++){
    const r=rows[i];
    if(mode==='high'){
      if(r.price>high.price){high=r;fallingLow=null;run=0;}
      else{
        if(!fallingLow||r.price<fallingLow.price)fallingLow=r;
        run=r.price<=high.price*(1-p.drawdownPct/100)?run+1:0;
        if(run>=p.confirmationDays){
          events.push({state:'down',turnDate:high.date,knownAt:r.date,index:i,price:high.price});
          low=fallingLow;reboundHigh=r;run=0;mode='low';
        }
      }
    }else{
      if(r.price<low.price){low=r;reboundHigh=r;run=0;}
      else{
        if(!reboundHigh||r.price>reboundHigh.price)reboundHigh=r;
        run=r.price>=low.price*(1+p.reversalPct/100)?run+1:0;
        if(run>=p.confirmationDays){
          events.push({state:'up',turnDate:low.date,knownAt:r.date,index:i,price:low.price});
          high=reboundHigh;fallingLow=null;run=0;mode='high';
        }
      }
    }
  }
  return events;
}

/** Exposes fitted primitives for mathematical invariants and independent review. */
export function fitEthereumAdaptiveModel(ethHistory,asOf){
  const {rows,excludedObservations}=prepare(ethHistory,asOf),p=ETH_ADAPTIVE_POLICY;
  const events=confirmedEthereumRegimes(rows),byIndex=new Map(events.map(e=>[e.index,e]));
  const groups=Object.fromEntries(STATES.map(s=>[s,{returns:[],exposure:Array(6).fill(0),events:Array(6).fill(0),completedDurations:[]}]));
  const samples=[];let state=null,age=0,knownAt=null;
  for(let i=1;i<rows.length;i++){
    const next=byIndex.get(i),r=Math.log(rows[i].price)-Math.log(rows[i-1].price);
    if(state!==null){
      const g=groups[state],riskAge=age+1,k=bin(riskAge);
      g.returns.push(r);g.exposure[k]++;
      samples.push({date:rows[i].date,return:r,state,age:riskAge});
      if(next&&next.state!==state){g.events[k]++;g.completedDurations.push(riskAge);}
      age=riskAge;
    }
    if(next){state=next.state;age=0;knownAt=next.knownAt;}
  }
  if(state===null||STATES.some(s=>groups[s].returns.length<30))throw new RangeError('ETH adaptive model needs at least 30 causally classified returns in each state');
  const all=samples.map(s=>s.return),pooledMean=average(all),pooledVariance=variance(all,pooledMean);
  if(!(pooledVariance>1e-12))throw new RangeError('ETH adaptive model needs positive observed return variance');
  const states={};
  for(const s of STATES){
    const g=groups[s],n=g.returns.length,rawMean=average(g.returns),rawVariance=variance(g.returns,rawMean);
    const exposure=g.exposure.reduce((a,b)=>a+b,0),switches=g.events.reduce((a,b)=>a+b,0);
    const pooledHazard=(switches+p.hazardPriorEvents)/(exposure+p.hazardPriorDays);
    states[s]={
      returnCount:n,rawMean,mean:rawMean*n/(n+p.driftPriorDays),
      longRunVariance:(n*rawVariance+p.variancePriorDays*pooledVariance)/(n+p.variancePriorDays),
      riskDays:exposure,switches,completedDurations:g.completedDurations,
      hazard:g.exposure.map((e,i)=>(g.events[i]+p.bucketPriorDays*pooledHazard)/(e+p.bucketPriorDays)),
      riskByAge:g.exposure,eventsByAge:g.events,pooledHazard,
    };
  }
  let v=pooledVariance;const rawInnovations=[];
  for(const sample of samples){
    const g=states[sample.state],shock=sample.return-g.rawMean;
    rawInnovations.push(shock/Math.sqrt(v)); // lagged variance, never same-return variance
    v=(1-p.alpha-p.beta)*g.longRunVariance+p.alpha*shock*shock+p.beta*v;
  }
  const innovationMean=average(rawInnovations);
  const innovationScale=Math.sqrt(rawInnovations.reduce((sum,z)=>sum+(z-innovationMean)**2,0)/rawInnovations.length);
  if(!(Number.isFinite(innovationScale)&&innovationScale>1e-9))throw new RangeError('ETH adaptive innovations have no usable variation');
  const innovations=rawInnovations.map(z=>(z-innovationMean)/innovationScale);
  const current=rows.at(-1);
  return {asOf,anchorPrice:current.price,anchorDay:current.epochDay,states,innovations,currentVariance:v,currentState:state,currentAge:age,
    training:{firstObservation:rows[0].date,informationThrough:asOf,maxSourceDate:asOf,observations:rows.length,excludedObservations,
      missingDaysInterpolated:false,classifiedReturns:samples.length,unclassifiedReturns:rows.length-1-samples.length,
      events:events.map(({index,...e})=>e),currentState:state,currentStateKnownAt:knownAt,currentAge:age,currentRightCensored:true,
      states,innovationCount:innovations.length,innovationPopulationMean:average(innovations),
      innovationPopulationSecondMoment:average(innovations.map(z=>z*z)),initialVariance:pooledVariance,currentVariance:v,
      historicalVintagesVerified:false,independentMarketCycles:null,pricePredictionAccuracyProven:false}};
}

/** Each draw has its own RNG. Extending a horizon or draw count cannot alter an
 * existing simulated path prefix. Circular blocks give uniform marginal weights;
 * wraparound is a modelling assumption, not an observed end-to-start return. */
export function simulateEthereumAdaptive(fit,{horizonDays=730,sampleCount=256,seed=20261027}={}){
  const p=ETH_ADAPTIVE_POLICY;
  if(!Number.isSafeInteger(horizonDays)||horizonDays<1||horizonDays>p.maximumHorizonDays)throw new RangeError('ETH adaptive horizon must be 1–730 days');
  if(!Number.isSafeInteger(sampleCount)||sampleCount<64||sampleCount>2048)throw new RangeError('ETH adaptive draws must be 64–2048');
  if(!Number.isSafeInteger(seed)||seed<0||seed>4294967295)throw new RangeError('ETH adaptive seed must be uint32');
  const logs=Array.from({length:horizonDays+1},()=>new Float64Array(sampleCount));
  const representative=[];const logAnchor=Math.log(fit.anchorPrice);
  for(let draw=0;draw<sampleCount;draw++){
    const random=generator((seed^Math.imul(draw+1,0x9e3779b1))>>>0);
    let state=fit.currentState,age=fit.currentAge,v=fit.currentVariance,l=logAnchor,block=0,offset=p.blockDays;
    logs[0][draw]=l;if(draw===0)representative.push({price:fit.anchorPrice,state,age,variance:v});
    for(let h=1;h<=horizonDays;h++){
      const g=fit.states[state];
      if(offset===p.blockDays){block=Math.floor(random()*fit.innovations.length);offset=0;}
      const z=fit.innovations[(block+offset++)%fit.innovations.length],shock=Math.sqrt(v)*z;
      const drift=g.mean*Math.exp(-Math.LN2*h/p.driftHalfLifeDays);
      l+=drift+shock;price(l);logs[h][draw]=l;
      v=(1-p.alpha-p.beta)*g.longRunVariance+p.alpha*shock*shock+p.beta*v;
      age++;
      if(random()<g.hazard[bin(age)]){state=state==='up'?'down':'up';age=0;}
      if(draw===0)representative.push({price:price(l),state,age,variance:v});
    }
  }
  const path=logs.map((values,h)=>{
    values.sort();
    return {date:dateFromDay(fit.anchorDay+h),price:h?representative[h].price:fit.anchorPrice,
      baselinePrice:h?price(quantile(values,.5)):fit.anchorPrice,
      low:h?price(quantile(values,.1)):fit.anchorPrice,high:h?price(quantile(values,.9)):fit.anchorPrice,
      kind:h?'conditional-adaptive-path':'observed-anchor'};
  });
  return {path,representative,metadata:{version:p.version,seed,sampleCount,horizonDays,blockDays:p.blockDays,probability:null,calibrated:false,
    nominalPointwiseMass:.8,bandMeaning:'Conditional Monte Carlo 10th–90th percentiles, not validated 80% coverage or a simultaneous path band',
    centerMeaning:'Pointwise median; generally not an individually realizable trajectory',representativePathIndex:0,
    sharedBlockLaw:'Circular standardized return blocks; wraparound boundary assumed',historicalDriftExtrapolated:false,
    parametersEstimatedFrom:'Current observation prefix only',policyParametersValidated:false,parameterUncertaintyIncluded:false,
    deterministicFourYearCycle:false,bitcoinHalvingApplied:false,futureThresholdCrossingsGuaranteed:false,
    historicalVintageBacktest:false,ohlcClaim:false,productionPromoted:false}};
}

export function buildEthereumAdaptiveCandidate({ethRows,asOf,horizons=[30,90,180],sampleCount=256,seed=20261027}={}){
  if(!Array.isArray(horizons)||!horizons.length||horizons.length>12||new Set(horizons).size!==horizons.length||
    horizons.some(h=>!Number.isSafeInteger(h)||h<1||h>730))throw new RangeError('ETH adaptive unique horizons must be 1–730 days');
  try{
    const fit=fitEthereumAdaptiveModel(ethRows,asOf),simulation=simulateEthereumAdaptive(fit,{horizonDays:Math.max(...horizons),sampleCount,seed});
    return {status:'available',model:ETH_ADAPTIVE_POLICY.version,asOf,
      predictions:horizons.map(h=>({horizonDays:h,targetDate:simulation.path[h].date,price:simulation.path[h].baselinePrice,
        simulatedLower:simulation.path[h].low,simulatedUpper:simulation.path[h].high,nominalPointwiseMass:.8})),
      training:fit.training,assumptions:{policy:ETH_ADAPTIVE_POLICY,simulation:simulation.metadata,
        stateClock:'Confirmation knownAt; return at t uses state known at t−1',
        durationFormula:'h_s(a) = (events_s,bin(a) + 180 * pooledHazard_s) / (riskDays_s,bin(a) + 180)',
        driftFormula:'mu_s = n_s/(n_s+365)*mean(r_s); future drift decays with 180-day half-life',
        varianceFormula:'v_next = 0.02*stateVariance + 0.06*shock² + 0.92*v',
        economicInputsUsed:false,institutionalTargetsUsed:false},
      probability:null,calibrated:false,productionEligible:false};
  }catch(error){
    if(!(error instanceof RangeError||error instanceof TypeError))throw error;
    return {status:'unavailable',model:ETH_ADAPTIVE_POLICY.version,reason:error.message,predictions:[],probability:null,calibrated:false,productionEligible:false};
  }
}

export function buildEthereumAdaptiveForecast({ethHistory,asOf,horizonDays=730,sampleCount=256,seed=20261027}={}){
  const fit=fitEthereumAdaptiveModel(ethHistory,asOf),simulation=simulateEthereumAdaptive(fit,{horizonDays,sampleCount,seed});
  const warnings=[
    'ETH에서 확인된 상태의 기간과 변동성을 추정합니다. 3년 상승·1년 하락이나 고저점 날짜를 고정하지 않습니다.',
    '음영은 가정한 모형의 10–90% 모의 분위수입니다. 실제 80% 적중률·신뢰구간·전 경로 보장은 아닙니다.',
    '금색 경로는 동일 모형의 예시 1개이며 파란 중앙값도 실제로 실현되는 한 경로는 아닐 수 있습니다.',
    '소수의 Merge 이후 상태와 현재 판본으로 적합했습니다. 계수 불확실성·새로운 위기·프로토콜 변화는 모두 반영되지 않습니다.',
    'AI 채택·기관 목표가격을 가격 상승률로 자동 변환하지 않습니다. 미래 OHLC와 거래량은 만들지 않습니다.',
  ];
  return {symbol:'ETHUSD',asOf,displayEnd:simulation.path.at(-1).date,pathMode:'crypto-conditional-daily',
    researchModel:'adaptive',scenario:{id:'base',label:'ETH 기간·변동성 연구 모형'},probability:null,calibrated:false,
    path:simulation.path,milestones:[],training:fit.training,metadata:simulation.metadata,warnings,
    displaySemantics:{baselineLabel:'모형 중앙값',envelopeLabel:'모의 10–90% 분위수',sampleLabel:'모형 예시 1개',
      inspectionNote:'ETH 자체 가격에서 추정한 기간·변동성 모형의 조건부 모의 분포입니다. 음영의 실제 적중률은 보장되지 않으며 미래 OHLC가 아닙니다.'},
    assetPath:{id:'base',asset:'ETH',asOf,endDate:simulation.path.at(-1).date,path:simulation.path,anchors:[],
      method:ETH_ADAPTIVE_POLICY.version,training:fit.training,metadata:simulation.metadata,warnings},
    assumptions:{policy:ETH_ADAPTIVE_POLICY,seed}};
}
