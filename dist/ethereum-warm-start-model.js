import {utcDay} from './cycle-engine.js?v=1.29.0';
import {readAssetDailyRows} from './asset-daily-observations.js';
import {ETH_ADAPTIVE_POLICY,confirmedEthereumRegimes,simulateEthereumAdaptive} from './ethereum-adaptive-model.js';

/** Optional initialization sensitivity control. Earlier prices initialize the
 * full confirmation detector (extrema, streak, state and age); only completed
 * post-Merge return intervals enter fitted moments and hazard exposure. */
export const ETH_WARM_START_POLICY=Object.freeze({
  ...ETH_ADAPTIVE_POLICY,version:'eth-warm-start-initialization-research-1',
  initializationHistory:'Full contiguous price prefix through the origin',
  estimationHistory:'Return intervals whose two closes are on or after 2022-09-15',
  purpose:'Causal detector initialization and resulting classification/sample-composition sensitivity',
});
const STATES=['up','down'];
const mean=values=>values.reduce((sum,value)=>sum+value,0)/values.length;
const variance=(values,center=mean(values))=>values.reduce((sum,value)=>sum+(value-center)**2,0)/(values.length-1);
const ageBin=age=>{const index=ETH_WARM_START_POLICY.ageBounds.findIndex(bound=>age<=bound);return index<0?5:index;};

function prepare(history,asOf){
  utcDay(asOf);
  const raw=Array.isArray(history)?history:history?.dailyHistory?.candles??history?.candles;
  if(!Array.isArray(raw)||raw.length>100000)throw new RangeError('ETH warm-start input must be bounded to 100000 observations');
  const observed=readAssetDailyRows(history,'ETH',asOf);
  let start=0;
  for(let index=1;index<observed.length;index++)if(observed[index].epochDay!==observed[index-1].epochDay+1)start=index;
  const rows=observed.slice(start),estimationIndex=rows.findIndex(row=>row.date>=ETH_WARM_START_POLICY.historyStart);
  if(estimationIndex<0||rows.length-estimationIndex<ETH_WARM_START_POLICY.minimumObservations)
    throw new RangeError('ETH warm-start model requires 366 consecutive post-Merge observations');
  return {rows,estimationIndex,observedCount:observed.length,discardedBeforeContiguousPrefix:start};
}

function openSpell(state,knownAt,observationStartDate,entryAge){
  return {state,knownAt,observationStartDate,entryAge,exitAge:entryAge,
    firstReturnDate:null,lastReturnDate:null,observedRiskDays:0,leftTruncated:entryAge>0,
    rightCensored:true,endedAt:null};
}

export function fitEthereumWarmStartModel(ethHistory,asOf){
  const {rows,estimationIndex,observedCount,discardedBeforeContiguousPrefix}=prepare(ethHistory,asOf);
  const p=ETH_WARM_START_POLICY,estimationRows=rows.slice(estimationIndex),boundary=estimationRows[0];
  const events=confirmedEthereumRegimes(rows),byIndex=new Map(events.map(event=>[event.index,event]));
  const initializationEvent=events.filter(event=>event.index<=estimationIndex).at(-1)??null;
  let state=initializationEvent?.state??null,knownAt=initializationEvent?.knownAt??null;
  let age=knownAt===null?0:boundary.epochDay-utcDay(knownAt);
  const initialAge=age,initialState=state;
  const groups=Object.fromEntries(STATES.map(name=>[name,{returns:[],exposure:Array(6).fill(0),events:Array(6).fill(0),
    completedDurations:[],completedObservedDurations:[],leftTruncatedCompletedSpells:[]}]));
  const samples=[],spells=[];
  let active=state===null?null:openSpell(state,knownAt,boundary.date,age);
  if(active)spells.push(active);

  // The boundary close initializes the state. Its crossing return is excluded:
  // the first fitted return has both endpoints in the estimation era.
  for(let index=estimationIndex+1;index<rows.length;index++){
    const row=rows[index],next=byIndex.get(index);
    if(state!==null){
      const riskAge=age+1,k=ageBin(riskAge),group=groups[state];
      const value=Math.log(row.price)-Math.log(rows[index-1].price);
      group.returns.push(value);group.exposure[k]++;
      samples.push({date:row.date,return:value,state,knownAt,age:riskAge});
      active.firstReturnDate??=row.date;active.lastReturnDate=row.date;
      active.exitAge=riskAge;active.observedRiskDays++;
      if(next&&next.state!==state){
        group.events[k]++;group.completedObservedDurations.push(active.observedRiskDays);
        active.rightCensored=false;active.endedAt=next.knownAt;
        if(active.leftTruncated)group.leftTruncatedCompletedSpells.push({...active});
        else group.completedDurations.push(riskAge);
        active=null;
      }
      age=riskAge;
    }
    // The return ending today uses the state known at yesterday's close.
    if(next){
      state=next.state;age=0;knownAt=next.knownAt;
      active=openSpell(state,knownAt,row.date,0);spells.push(active);
    }
  }
  if(state===null||STATES.some(name=>groups[name].returns.length<30))
    throw new RangeError('ETH warm-start model needs at least 30 causally classified post-Merge returns in each state');
  const all=samples.map(sample=>sample.return),pooledMean=mean(all),pooledVariance=variance(all,pooledMean);
  if(!(Number.isFinite(pooledVariance)&&pooledVariance>1e-12))throw new RangeError('ETH warm-start model needs positive observed return variance');
  const states={};
  for(const name of STATES){
    const group=groups[name],n=group.returns.length,rawMean=mean(group.returns),rawVariance=variance(group.returns,rawMean);
    const riskDays=group.exposure.reduce((sum,value)=>sum+value,0),switches=group.events.reduce((sum,value)=>sum+value,0);
    const pooledHazard=(switches+p.hazardPriorEvents)/(riskDays+p.hazardPriorDays);
    states[name]={returnCount:n,rawMean,mean:rawMean*n/(n+p.driftPriorDays),
      longRunVariance:(n*rawVariance+p.variancePriorDays*pooledVariance)/(n+p.variancePriorDays),
      riskDays,switches,completedDurations:group.completedDurations,
      completedObservedDurations:group.completedObservedDurations,leftTruncatedCompletedSpells:group.leftTruncatedCompletedSpells,
      hazard:group.exposure.map((exposure,index)=>(group.events[index]+p.bucketPriorDays*pooledHazard)/(exposure+p.bucketPriorDays)),
      riskByAge:group.exposure,eventsByAge:group.events,pooledHazard};
  }
  let v=pooledVariance;const rawInnovations=[];
  for(const sample of samples){
    const group=states[sample.state],shock=sample.return-group.rawMean;
    rawInnovations.push(shock/Math.sqrt(v));
    v=(1-p.alpha-p.beta)*group.longRunVariance+p.alpha*shock*shock+p.beta*v;
  }
  const center=mean(rawInnovations),scale=Math.sqrt(mean(rawInnovations.map(value=>(value-center)**2)));
  if(!(Number.isFinite(scale)&&scale>1e-9))throw new RangeError('ETH warm-start innovations have no usable variation');
  const innovations=rawInnovations.map(value=>(value-center)/scale),anchor=rows.at(-1);
  return {model:p.version,asOf,anchorPrice:anchor.price,anchorDay:anchor.epochDay,states,innovations,
    currentVariance:v,currentState:state,currentAge:age,
    training:{firstObservation:boundary.date,informationThrough:asOf,maxSourceDate:asOf,
      observations:estimationRows.length,excludedObservations:observedCount-estimationRows.length,
      missingDaysInterpolated:false,discardedBeforeContiguousPrefix,
      classifiedReturns:samples.length,unclassifiedReturns:estimationRows.length-1-samples.length,
      firstClassifiedReturn:samples[0].date,lastClassifiedReturn:samples.at(-1).date,
      preMergeReturnsUsed:0,preMergeRiskDaysUsed:0,
      initialization:{method:'Causal confirmation detector from the full contiguous price prefix (state, extrema, streak and age)',
        firstObservation:rows[0].date,observationsThroughBoundary:estimationIndex+1,
        preMergeObservations:rows.filter(row=>row.date<p.historyStart).length,
        boundaryDate:boundary.date,state:initialState,knownAt:initializationEvent?.knownAt??null,
        age:initialAge,leftTruncated:initialState!==null&&initialAge>0,
        stateKnown:initialState!==null,unknownStateAssigned:false},
      events:events.map(({index,...event})=>event),spells,
      currentState:state,currentStateKnownAt:knownAt,currentAge:age,
      currentObservedRiskDays:active.observedRiskDays,currentRightCensored:true,
      states,innovationCount:innovations.length,innovationPopulationMean:mean(innovations),
      innovationPopulationSecondMoment:mean(innovations.map(value=>value*value)),
      initialVariance:pooledVariance,currentVariance:v,historicalVintagesVerified:false,
      independentMarketCycles:null,pricePredictionAccuracyProven:false,
      interpretation:'Earlier prices initialize the full detector, including extrema and confirmation streaks, and can change post-Merge classifications. No pre-Merge return or risk day enters the fitted moments/exposure. Left-truncated exposure starts at its observed risk age; completedDurations excludes left-truncated spells.'}};
}

export function simulateEthereumWarmStart(fit,options={}){
  if(fit?.model!==ETH_WARM_START_POLICY.version)throw new TypeError('ETH warm-start simulation requires its own fitted candidate');
  const simulation=simulateEthereumAdaptive(fit,options);
  return {...simulation,metadata:{...simulation.metadata,version:ETH_WARM_START_POLICY.version,
    simulationLawReusedFrom:ETH_ADAPTIVE_POLICY.version,
    parametersEstimatedFrom:'Post-Merge return intervals and risk exposure; causal classification detector initialized from earlier contiguous prices',
    preMergeReturnsEstimated:false,preMergeHazardExposureIncluded:false,
    leftTruncatedEntryAgeIncluded:true,initializationChangesClassification:true,initializationChangesSampleComposition:true,
    singleComponentCausalEffectIdentified:false,
    limitation:'This control changes the causal detector initialization, resulting classifications and estimation sample; it does not isolate a hazard improvement or prove fixed market-cycle durations.'}};
}

export function buildEthereumWarmStartCandidate({ethRows,asOf,horizons=[30,90,180],sampleCount=256,seed=20261027}={}){
  if(!Array.isArray(horizons)||!horizons.length||horizons.length>12||new Set(horizons).size!==horizons.length||
    horizons.some(horizon=>!Number.isSafeInteger(horizon)||horizon<1||horizon>ETH_WARM_START_POLICY.maximumHorizonDays))
    throw new RangeError('ETH warm-start unique horizons must be 1–730 days');
  try{
    const fit=fitEthereumWarmStartModel(ethRows,asOf);
    const simulation=simulateEthereumWarmStart(fit,{horizonDays:Math.max(...horizons),sampleCount,seed});
    return {status:'available',model:ETH_WARM_START_POLICY.version,asOf,
      predictions:horizons.map(horizon=>({horizonDays:horizon,targetDate:simulation.path[horizon].date,
        price:simulation.path[horizon].baselinePrice,simulatedLower:simulation.path[horizon].low,
        simulatedUpper:simulation.path[horizon].high,nominalPointwiseMass:.8})),
      training:fit.training,assumptions:{policy:ETH_WARM_START_POLICY,simulation:simulation.metadata,
        stateClock:'Confirmation knownAt; return at t uses state known at t−1',
        ageClock:'Full known state age, with only post-Merge days at risk in the hazard denominator',
        initializationChangesClassification:true,initializationChangesSampleComposition:true,singleComponentCausalEffectIdentified:false,
        economicInputsUsed:false,institutionalTargetsUsed:false},
      probability:null,calibrated:false,productionEligible:false};
  }catch(error){
    if(!(error instanceof RangeError||error instanceof TypeError))throw error;
    return {status:'unavailable',model:ETH_WARM_START_POLICY.version,reason:error.message,predictions:[],
      probability:null,calibrated:false,productionEligible:false};
  }
}
