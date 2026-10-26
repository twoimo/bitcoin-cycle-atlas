import {utcDay, dateFromDay} from './cycle-engine.js?v=1.29.0';
import {readAssetDailyRows} from './asset-daily-observations.js';
import {buildIndependentBenchmarks, absoluteLogError, intervalScore} from './forecast-evaluation.js';
import {calibrateLogInterval} from './forecast-experiments.js';
import {buildEthereumAssetScenarioPaths} from './ethereum-forecast.js';
import {buildEthereumCycleCandidates} from './ethereum-cycle-models.js';
import {buildEthereumEconomicCandidate} from './ethereum-economic-model.js';

export const ETH_COMPARISON_POLICY = Object.freeze({
  version: 'eth-locked-candidate-comparison-1', horizons: Object.freeze([30,90,180]),
  minimumHistoryDays: 730, originStrideDays: 28, betaLookbackDays: 365,
  legacySeed: 20261022, minimumBlendCases: 12, intervalAlpha: 0.2,
  minimumCalibrationCases: 12, minimumDisjointPromotionCases: 30,
  prospectiveEvidenceRequired: true, externalReviewRequired: true,
});
export const ETH_COMPARISON_MODELS = Object.freeze([
  'flat','shrunkenTrend','btcLinked','btcTransfer','ethRefit','legacyEth','economic','combined',
]);
const mean = values => values.length ? values.reduce((a,b)=>a+b,0)/values.length : null;
const closeAt = date => new Date((utcDay(date)+1)*86400000).toISOString();
function unavailable(reason, extra={}) { return {status:'unavailable', reason, predictions:[], ...extra}; }
function positive(value) { return Number.isFinite(value)&&value>0; }

/** Disjoint intervals reduce target overlap; they are not independent markets. */
export function disjointEthereumCases(cases) {
  let boundary = -Infinity;
  return [...cases].sort((a,b)=>a.origin.localeCompare(b.origin)||a.targetDate.localeCompare(b.targetDate)).filter(item=>{
    if(utcDay(item.origin)<boundary)return false;
    boundary=utcDay(item.targetDate);
    return true;
  });
}
function continuousSuffix(rows) {
  let start=0; const gaps=[];
  for(let i=1;i<rows.length;i++)if(rows[i].epochDay!==rows[i-1].epochDay+1){
    gaps.push({after:rows[i-1].date,before:rows[i].date,missingDays:rows[i].epochDay-rows[i-1].epochDay-1});start=i;
  }
  return {rows:rows.slice(start),discardedObservations:start,gaps,interpolation:false};
}
function withPriceProvenance(rows,history,asset) {
  const raw=Array.isArray(history)?history:asset==='BTC'?history?.prices:history?.dailyHistory?.candles??history?.candles;
  const original=new Map((raw??[]).filter(r=>!Array.isArray(r)).map(r=>[r.date?.slice(0,10),r]));
  return rows.map(row=>{
    const source=original.get(row.date)??{};
    return {...row,availableAt:source.availableAt,publishedAt:source.publishedAt,
      collectedAt:source.collectedAt??source.retrievedAt,vintageId:source.vintageId,sourceUrl:source.sourceUrl,sourceHash:source.sourceHash};
  });
}
function readyPredictions(targets,key) {
  return {status:'ready',predictions:targets.map(t=>({horizonDays:t.horizonDays,targetDate:t.targetDate,price:t[key]}))};
}
function rowPrediction(candidate,horizonDays) {
  const row=candidate?.predictions?.find(p=>p.horizonDays===horizonDays);
  return ['ready','available'].includes(candidate?.status)&&row&&row.status!=='unavailable'&&positive(row.price)?row:null;
}
export function buildSimpleEthereumBtcLink({ethRows,btcRows,asOf,horizons=ETH_COMPARISON_POLICY.horizons}={}) {
  let e,b;
  try { e=readAssetDailyRows(ethRows,'ETH',asOf); b=readAssetDailyRows(btcRows,'BTC',asOf); }
  catch(error) {
    if(error instanceof TypeError||error instanceof RangeError)return unavailable('BTC-linked input unavailable: '+error.message);
    throw error;
  }
  const first=utcDay(asOf)-ETH_COMPARISON_POLICY.betaLookbackDays;
  const eb=new Map(e.map(r=>[r.epochDay,r.price])),bb=new Map(b.map(r=>[r.epochDay,r.price]));
  const pairs=[];
  for(let day=first+1;day<=utcDay(asOf);day++){
    if(![eb.get(day),eb.get(day-1),bb.get(day),bb.get(day-1)].every(positive))return unavailable('BTC beta needs 365 consecutive aligned completed return days');
    pairs.push([Math.log(bb.get(day)/bb.get(day-1)),Math.log(eb.get(day)/eb.get(day-1))]);
  }
  const mx=mean(pairs.map(p=>p[0])),my=mean(pairs.map(p=>p[1]));
  const xx=pairs.reduce((s,p)=>s+(p[0]-mx)**2,0);
  if(!(xx>1e-12))return unavailable('BTC return variance is insufficient to estimate beta');
  const beta=pairs.reduce((s,p)=>s+(p[0]-mx)*(p[1]-my),0)/xx;
  const benchmark=buildIndependentBenchmarks(b,{asOf,horizons});
  const anchor=e.at(-1).price;
  const predictions=benchmark.targets.map(t=>({horizonDays:t.horizonDays,targetDate:t.targetDate,price:anchor*Math.exp(beta*benchmark.dailyLogDrift*t.horizonDays)}));
  if(!predictions.every(p=>positive(p.price)))return unavailable('BTC-linked prediction overflow');
  return {status:'ready',predictions,assumptions:{
    formula:'log(P_ETH[t+h]/P_ETH[t]) = beta[t] * h * BTC_shrunken_daily_log_trend[t]',
    beta,estimatedBeta:true,alphaIncluded:false,btcFutureRealizationUsed:false,
    btcDrift:benchmark.dailyLogDrift,btcTrendPolicy:benchmark.policy,
  },training:{observations:pairs.length,firstReturnDate:dateFromDay(first+1),informationThrough:asOf}};
}

/** A separate ETH/BTC target; no future BTC value enters either benchmark. */
export function buildEthereumRelativeBenchmarks({ethRows,btcRows,asOf,horizons=ETH_COMPARISON_POLICY.horizons}={}) {
  let e,b;
  try { e=readAssetDailyRows(ethRows,'ETH',asOf); b=readAssetDailyRows(btcRows,'BTC',asOf); }
  catch(error) {
    if(error instanceof TypeError||error instanceof RangeError)return unavailable('ETH/BTC benchmark input unavailable: '+error.message);
    throw error;
  }
  const em=new Map(e.map(r=>[r.epochDay,r.price])),bm=new Map(b.map(r=>[r.epochDay,r.price])),ratios=[];
  for(let day=utcDay(asOf)-180;day<=utcDay(asOf);day++){
    if(![em.get(day),bm.get(day)].every(positive))return unavailable('ETH/BTC benchmark requires 181 consecutive aligned closes');
    const price=em.get(day)/bm.get(day);
    if(!positive(price))return unavailable('ETH/BTC ratio is not finite and positive');
    ratios.push({date:dateFromDay(day),epochDay:day,price});
  }
  const result=buildIndependentBenchmarks(ratios,{asOf,horizons});
  return {status:'ready',anchorRatio:ratios.at(-1).price,targets:result.targets,
    assumptions:{target:'ETH/BTC',policy:result.policy,futureBtcRealizationUsed:false}};
}

/** Fit a convex blend only on matured, disjoint paired prior forecasts. */
export function buildEthereumCombinedCandidate({origin,horizons,cycle,economic,history=[],minimumCases=ETH_COMPARISON_POLICY.minimumBlendCases}={}) {
  utcDay(origin);
  if(!Number.isSafeInteger(minimumCases)||minimumCases<2)throw new RangeError('Blend requires at least two matured cases');
  const predictions=[],fits=[];
  for(const h of horizons){
    const c=rowPrediction(cycle,h),e=rowPrediction(economic,h);
    if(c&&e&&c.targetDate!==e.targetDate)throw new RangeError('Blend candidate target dates differ');
    if(!c||!e){fits.push({horizonDays:h,status:'unavailable',reason:'Both ETH-refitted cycle and economic candidates must be available'});continue;}
    const mature=history.filter(r=>r.horizonDays===h&&r.origin<origin&&r.targetDate<=origin&&positive(r.actual)&&positive(r.predictions?.ethRefit)&&positive(r.predictions?.economic));
    const used=disjointEthereumCases(mature);
    if(used.length<minimumCases){fits.push({horizonDays:h,status:'unavailable',reason:'Insufficient matured disjoint paired errors',usedCount:used.length});continue;}
    let denominator=0,numerator=0;
    for(const r of used){const d=(Math.log(r.predictions.economic)-Math.log(r.predictions.ethRefit));denominator+=d*d;numerator+=d*(Math.log(r.actual)-Math.log(r.predictions.ethRefit));}
    if(!(denominator>1e-12)){fits.push({horizonDays:h,status:'unavailable',reason:'Candidate difference has no identifying variation',usedCount:used.length});continue;}
    const unconstrainedWeight=numerator/denominator,economicWeight=Math.max(0,Math.min(1,unconstrainedWeight));
    const price=Math.exp((1-economicWeight)*Math.log(c.price)+economicWeight*Math.log(e.price));
    if(!positive(price)){fits.push({horizonDays:h,status:'unavailable',reason:'Blend overflow'});continue;}
    predictions.push({horizonDays:h,targetDate:c.targetDate,price,economicWeight});
    fits.push({horizonDays:h,status:'ready',usedCount:used.length,usedOrigins:used.map(r=>r.origin),latestOutcomeUsed:used.at(-1).targetDate,economicWeight,unconstrainedWeight,
      formula:'log(P_combined) = (1-w)*log(P_cycle) + w*log(P_economic); w fitted by prior matured log-error least squares then constrained to [0,1]'});
  }
  return {status:predictions.length?'ready':'unavailable',predictions,fits,reason:predictions.length?null:'No horizon has eligible economic and cycle evidence',productionPromoted:false};
}

function legacyCandidate(ethRows,asOf,horizons) {
  try{
    const scenarios=buildEthereumAssetScenarioPaths(ethRows,asOf,dateFromDay(utcDay(asOf)+Math.max(...horizons)),ETH_COMPARISON_POLICY.legacySeed);
    return {status:'ready',predictions:horizons.map(h=>{
      const row=scenarios.base.path[h];return {horizonDays:h,targetDate:row.date,price:row.price,
        scenarioLow:Math.min(...Object.values(scenarios).map(s=>s.path[h].price)),
        scenarioHigh:Math.max(...Object.values(scenarios).map(s=>s.path[h].price))};
    }),assumptions:{seed:ETH_COMPARISON_POLICY.legacySeed,sourceDate:'2024-06-05',point:'Existing base single historical-block illustration',scenarioRangeIsProbability:false}};
  }catch(error){
    if(error instanceof TypeError||error instanceof RangeError)return unavailable(error.message);
    throw error;
  }
}

export function summarizeEthereumComparison(cases,{horizons=ETH_COMPARISON_POLICY.horizons,models=ETH_COMPARISON_MODELS,baselineModels=['flat','shrunkenTrend','btcLinked']}={}) {
  const summaries=[];
  for(const horizonDays of horizons)for(const model of models){
    const all=cases.filter(r=>r.horizonDays===horizonDays);
    const used=all.filter(r=>positive(r.actual)&&positive(r.predictions?.[model]));
    const disjoint=disjointEthereumCases(used);
    const intervalCases=used.filter(r=>r.intervals?.[model]?.status==='experimental');
    const intervalDisjoint=disjointEthereumCases(intervalCases);
    const score=group=>({
      meanAbsoluteLogError:mean(group.map(r=>absoluteLogError(r.predictions[model],r.actual))),
      rootMeanSquaredLogError:group.length?Math.sqrt(mean(group.map(r=>(Math.log(r.predictions[model])-Math.log(r.actual))**2))):null,
      directionAccuracy:mean(group.map(r=>Number(Math.sign((Math.log(r.predictions[model])-Math.log(r.anchorPrice)))===Math.sign((Math.log(r.actual)-Math.log(r.anchorPrice)))))),
      predictedDirectionCounts:Object.fromEntries([-1,0,1].map(sign=>[String(sign),group.filter(r=>Math.sign((Math.log(r.predictions[model])-Math.log(r.anchorPrice)))===sign).length])),
      directionalCallCoverage:group.length?group.filter(r=>r.predictions[model]!==r.anchorPrice).length/group.length:null,
      directionAccuracyAmongDirectionalCalls:mean(group.filter(r=>r.predictions[model]!==r.anchorPrice).map(r=>Number(Math.sign(Math.log(r.predictions[model])-Math.log(r.anchorPrice))===Math.sign(Math.log(r.actual)-Math.log(r.anchorPrice))))),
    });
    const pairedBaselines=Object.fromEntries(baselineModels.map(baseline=>{
      const paired=used.filter(r=>positive(r.predictions[baseline])),pd=disjointEthereumCases(paired);
      const candidate=mean(pd.map(r=>absoluteLogError(r.predictions[model],r.actual)));
      const baselineError=mean(pd.map(r=>absoluteLogError(r.predictions[baseline],r.actual)));
      return [baseline,{sameOriginCases:paired.length,disjointCases:pd.length,candidateMeanAbsoluteLogError:candidate,baselineMeanAbsoluteLogError:baselineError,
        skill:baselineError>0?1-candidate/baselineError:null,origins:pd.map(r=>r.origin)}];
    }));
    summaries.push({model,horizonDays,candidateOrigins:all.length,availableOrigins:all.filter(r=>positive(r.predictions?.[model])).length,
      completedOutcomes:used.length,pendingTargets:all.filter(r=>r.actual===null&&positive(r.predictions?.[model])).length,
      uniqueOrigins:new Set(used.map(r=>r.origin)).size,distinctTargetDates:new Set(used.map(r=>r.targetDate)).size,
      disjointTargetIntervals:disjoint.length,overlappingTargets:used.length>disjoint.length,independentMarketRegimes:null,independentSampleSize:null,
      allEligible:score(used),disjoint:score(disjoint),pairedBaselines,
      experimentalInterval:{alpha:ETH_COMPARISON_POLICY.intervalAlpha,cases:intervalCases.length,disjointCases:intervalDisjoint.length,
        empiricalCoverage:mean(intervalCases.map(r=>Number(r.intervals[model].covered))),
        meanLogWidth:mean(intervalCases.map(r=>r.intervals[model].logWidth)),
        meanLogIntervalScore:mean(intervalCases.map(r=>r.intervals[model].logIntervalScore)),
        disjointEmpiricalCoverage:mean(intervalDisjoint.map(r=>Number(r.intervals[model].covered))),
        disjointMeanLogWidth:mean(intervalDisjoint.map(r=>r.intervals[model].logWidth)),
        disjointMeanLogIntervalScore:mean(intervalDisjoint.map(r=>r.intervals[model].logIntervalScore)),
        calibratedForProduction:false,coverageGuarantee:false},
      productionPromoted:false});
  }
  const readyCore=['flat','shrunkenTrend','btcLinked','btcTransfer','ethRefit','legacyEth'].filter(model=>models.includes(model));
  const common=horizons.map(horizonDays=>{
    const group=cases.filter(r=>r.horizonDays===horizonDays&&positive(r.actual));
    const subset=group.filter(r=>readyCore.every(m=>positive(r.predictions[m])));
    const allRequested=group.filter(r=>models.every(m=>positive(r.predictions[m])));
    const disjoint=disjointEthereumCases(subset);
    return {horizonDays,coreModels:readyCore,coreCommonCases:subset.length,coreDisjointCases:disjoint.length,
      allRequestedCommonCases:allRequested.length,
      coreDisjointMeanAbsoluteLogErrors:Object.fromEntries(readyCore.map(m=>[m,mean(disjoint.map(r=>absoluteLogError(r.predictions[m],r.actual)))])),
      coreDisjointOrigins:disjoint.map(r=>r.origin)};
  });
  // Pairwise candidate comparisons retain their exact common origin set.
  // Empty intersections are evidence gaps, never a license to compare unrelated means.
  const pairwise=[];
  for(const horizonDays of horizons)for(let i=0;i<models.length;i++)for(let j=i+1;j<models.length;j++){
    const left=models[i],right=models[j];
    const same=cases.filter(r=>r.horizonDays===horizonDays&&positive(r.actual)&&positive(r.predictions?.[left])&&positive(r.predictions?.[right]));
    const disjoint=disjointEthereumCases(same),commonOrigins=same.map(r=>r.origin).sort();
    const scoreFor=(group,model)=>({
      meanAbsoluteLogError:mean(group.map(r=>absoluteLogError(r.predictions[model],r.actual))),
      rootMeanSquaredLogError:group.length?Math.sqrt(mean(group.map(r=>(Math.log(r.predictions[model])-Math.log(r.actual))**2))):null,
      directionAccuracy:mean(group.map(r=>Number(Math.sign(Math.log(r.predictions[model])-Math.log(r.anchorPrice))===Math.sign(Math.log(r.actual)-Math.log(r.anchorPrice))))),
    });
    const leftScore=scoreFor(disjoint,left),rightScore=scoreFor(disjoint,right);
    pairwise.push({horizonDays,left,right,sameOriginCases:same.length,disjointCases:disjoint.length,
      firstCommonOrigin:commonOrigins[0]??null,lastCommonOrigin:commonOrigins.at(-1)??null,
      disjointOrigins:disjoint.map(r=>r.origin),leftScore,rightScore,
      leftSkillAgainstRight:rightScore.meanAbsoluteLogError>0?1-leftScore.meanAbsoluteLogError/rightScore.meanAbsoluteLogError:null,
      independentMarketRegimes:null,independentSampleSize:null});
  }
  return {summaries,common,pairwise,rankingAcrossDifferentOriginSets:false};
}

export function runEthereumModelComparison({ethHistory,btcHistory,economicSnapshots=[],issuedAtByOrigin={}}={}, {asOf}={}) {
  utcDay(asOf);
  if(!issuedAtByOrigin||typeof issuedAtByOrigin!=='object'||Array.isArray(issuedAtByOrigin))throw new TypeError('issuedAtByOrigin must map UTC origins to actual issue timestamps');
  const e=continuousSuffix(readAssetDailyRows(ethHistory,'ETH',asOf)),b=continuousSuffix(readAssetDailyRows(btcHistory,'BTC',asOf));
  const rows=withPriceProvenance(e.rows,ethHistory,'ETH'),btcRows=withPriceProvenance(b.rows,btcHistory,'BTC'),horizons=ETH_COMPARISON_POLICY.horizons;
  if(rows.length<ETH_COMPARISON_POLICY.minimumHistoryDays+1)throw new RangeError('ETH comparison needs 730 contiguous completed history days');
  const firstOrigin=rows[0].epochDay+ETH_COMPARISON_POLICY.minimumHistoryDays;
  const origins=rows.filter(r=>r.epochDay>=firstOrigin&&(r.epochDay-firstOrigin)%ETH_COMPARISON_POLICY.originStrideDays===0).map(r=>r.date);
  if(origins.at(-1)!==asOf)origins.push(asOf);
  const ethByDate=new Map(rows.map(r=>[r.date,r.price])),btcByDate=new Map(btcRows.map(r=>[r.date,r.price])),cases=[],relativeCases=[],originsMetadata=[];
  const calibration=new Map(ETH_COMPARISON_MODELS.map(m=>[m,new Map(horizons.map(h=>[h,[]]))]));
  let current=null;
  for(const origin of origins){
    const issuedAt=issuedAtByOrigin[origin];
    if(issuedAt!==undefined){
      const observedEnd=Date.parse(closeAt(origin)),issue=Date.parse(issuedAt);
      if(typeof issuedAt!=='string'||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/.test(issuedAt)||!Number.isFinite(issue)||issue<observedEnd||issue>=observedEnd+86400000)throw new RangeError('Explicit issue timestamp must be within the UTC day after the origin close');
    }
    const informationCutoffAt=issuedAt??closeAt(origin);
    const ep=rows.filter(r=>r.date<=origin),bp=btcRows.filter(r=>r.date<=origin),anchorPrice=ep.at(-1).price;
    const simple=buildIndependentBenchmarks(ep,{asOf:origin,horizons});
    const relativeBenchmarks=buildEthereumRelativeBenchmarks({ethRows:ep,btcRows:bp,asOf:origin,horizons});
    const cycle=buildEthereumCycleCandidates({ethRows:ep,btcRows:bp,asOf:origin,horizons});
    const economic=buildEthereumEconomicCandidate({ethRows:ep,btcRows:bp,asOf:origin,horizons,economicSnapshots,issuedAt});
    const candidates={
      flat:readyPredictions(simple.targets,'flat'),shrunkenTrend:readyPredictions(simple.targets,'shrunkenTrend'),
      btcLinked:buildSimpleEthereumBtcLink({ethRows:ep,btcRows:bp,asOf:origin,horizons}),
      btcTransfer:cycle.btcTransfer,ethRefit:cycle.ethRefit,legacyEth:legacyCandidate(ep,origin,horizons),economic,
    };
    candidates.combined=buildEthereumCombinedCandidate({origin,horizons,cycle:candidates.ethRefit,economic,history:cases});
    originsMetadata.push({origin,informationCutoffAt,issuedAt:issuedAt??null,observationThroughAt:closeAt(origin),models:Object.fromEntries(Object.entries(candidates).map(([id,c])=>[id,{
      status:c.status,reason:c.reason??null,training:c.training??null,assumptions:c.assumptions??null,
      perHorizonAvailability:horizons.map(h=>({horizonDays:h,available:Boolean(rowPrediction(c,h))})),
    }]))});
    for(const h of horizons){
      const targetDate=dateFromDay(utcDay(origin)+h),actual=ethByDate.get(targetDate)??null,predictions={},intervals={},unavailableModels={};
      for(const model of ETH_COMPARISON_MODELS){
        const p=rowPrediction(candidates[model],h);
        if(!p){unavailableModels[model]=candidates[model].reason??'Insufficient horizon-specific evidence';continue;}
        if(p.targetDate!==targetDate)throw new RangeError('Candidate target clock differs from the evaluation target');
        predictions[model]=p.price;
        const prior=calibration.get(model).get(h);
        const interval=calibrateLogInterval(prior,{origin,predicted:p.price,horizonDays:h,alpha:ETH_COMPARISON_POLICY.intervalAlpha,minCount:ETH_COMPARISON_POLICY.minimumCalibrationCases});
        intervals[model]=interval.status==='experimental'&&actual!==null?{...interval,covered:actual>=interval.lower&&actual<=interval.upper,
          logWidth:(Math.log(interval.upper)-Math.log(interval.lower)),logIntervalScore:intervalScore(Math.log(interval.lower),Math.log(interval.upper),Math.log(actual),ETH_COMPARISON_POLICY.intervalAlpha)}:interval;
        // Future outcomes may be stored for offline scoring, but calibrateLogInterval
        // independently rejects outcomes whose target date is after its origin.
        if(actual!==null)prior.push({origin,targetDate,horizonDays:h,predicted:p.price,actual});
      }
      const rb=relativeBenchmarks.targets?.find(t=>t.horizonDays===h),re=rowPrediction(economic,h);
      const anchorBtc=btcByDate.get(origin),targetBtc=btcByDate.get(targetDate);
      const anchorRatio=positive(anchorBtc)?anchorPrice/anchorBtc:null;
      const actualRatio=positive(actual)&&positive(targetBtc)?actual/targetBtc:null;
      const ratioPredictions={};
      if(rb){ratioPredictions.flat=rb.flat;ratioPredictions.shrunkenTrend=rb.shrunkenTrend;}
      if(positive(re?.ethBtcRatio))ratioPredictions.economic=re.ethBtcRatio;
      relativeCases.push({origin,targetDate,horizonDays:h,informationCutoffAt,issuedAt:issuedAt??null,
        anchorPrice:positive(anchorRatio)?anchorRatio:null,actual:positive(actualRatio)?actualRatio:null,
        predictions:ratioPredictions,intervals:{},target:'ETH/BTC',unit:'BTC per ETH',
        status:targetDate>asOf?'pending':positive(actualRatio)?'retrospective':'missing-paired-close'});
      const legacy=rowPrediction(candidates.legacyEth,h);
      cases.push({origin,informationCutoffAt,issuedAt:issuedAt??null,observationThroughAt:closeAt(origin),targetDate,targetObservationEndAt:closeAt(targetDate),targetAvailableAt:null,horizonDays:h,
        anchorPrice,actual,status:actual===null?'pending':'retrospective',predictions,unavailableModels,intervals,
        legacyScenarioEnvelope:legacy?{low:legacy.scenarioLow,high:legacy.scenarioHigh,empiricallyCovered:actual===null?null:actual>=legacy.scenarioLow&&actual<=legacy.scenarioHigh,
          logWidth:(Math.log(legacy.scenarioHigh)-Math.log(legacy.scenarioLow)),probability:null,confidenceInterval:false}:null});
    }
    if(origin===asOf)current={asOf,informationCutoffAt,issuedAt:issuedAt??null,candidates};
  }
  const summary=summarizeEthereumComparison(cases);
  return {schemaVersion:1,kind:'ethereum-candidate-comparison',asOf,policy:ETH_COMPARISON_POLICY,
    data:{ethFirstObservation:rows[0].date,btcFirstObservation:btcRows[0].date,ethObservations:rows.length,btcObservations:btcRows.length,
      ethGaps:e.gaps,discardedEarlyEthObservations:e.discardedObservations,btcGaps:b.gaps,discardedEarlyBtcObservations:b.discardedObservations,interpolation:false,
      ethArchiveCollectedAt:ethHistory?.retrievedAt??null,ethArchiveFirstCollectedAt:ethHistory?.dailyHistory?.firstCollectedAt??ethHistory?.firstCollectedAt??null,
      historicalVintagesAvailable:false,economicSnapshotCount:economicSnapshots.length,
      explicitIssueTimeCount:origins.filter(origin=>issuedAtByOrigin[origin]!==undefined).length,
      priceVintageIntegration:'One selected frozen price row per date; raw multi-publication price ledgers require selection before this evaluator. Unknown historical issue/publication timestamps are not invented.'},
    uniqueOrigins:origins.length,maturedTargets:cases.filter(r=>r.actual!==null).length,
    prospectiveScoredTargets:0,independentMarketRegimes:null,independentCycleCount:null,
    origins:originsMetadata,cases,...summary,current,
    relativeStrength:{target:'ETH/BTC',unit:'BTC per ETH',cases:relativeCases,
      ...summarizeEthereumComparison(relativeCases,{horizons,models:['flat','shrunkenTrend','economic'],baselineModels:['flat','shrunkenTrend']}),
      scope:'ETH/BTC is scored independently from ETH/USD; observed future BTC enters only the realized target, never a predictor. Missing paired closes and absent economic forecasts are not fabricated.',
      economicSnapshotsProvided:economicSnapshots.length,
      economicPredictionsAvailable:relativeCases.some(r=>positive(r.predictions.economic)),prospectiveScoredTargets:0},
    adoption:{status:'not-adopted',productionModelChanged:false,externalGeminiReview:'pending-unavailable-through-github',
      reasons:['Current-vintage retrospective price replay is not prospective performance','Economic point-in-time network inputs are not manufactured','Few macro cycles and overlapping outcomes do not establish a fixed cycle law','External source-read Gemini opposition and ChatGPT reverse review are not completed'],
      longHorizonValidation:false,calibratedForProduction:false},
    scope:'Historical dates restrict all predictor prefixes and matured error fitting. Prices are the current stored archive, not recovered historical publication vintages. 30/90/180-day errors do not validate 2030–2035 paths. Interval results are retrospective experiments, not forecast probabilities.'};
}
