import {utcDay,dateFromDay} from '../dist/cycle-engine.js';
import {disjointEthereumCases} from '../dist/ethereum-model-comparison.js';
import {ETH_MC_STABILITY_POLICY,stabilityRange,scoreStabilityPoint} from './ethereum-monte-carlo-stability-core.mjs';

export const ETH_COMMON_COHORT_POLICY=Object.freeze({
  version:'eth-common-cohort-stability-1',monteCarloPolicyVersion:ETH_MC_STABILITY_POLICY.version,
  seeds:ETH_MC_STABILITY_POLICY.seeds,sampleCounts:ETH_MC_STABILITY_POLICY.sampleCounts,
  horizons:ETH_MC_STABILITY_POLICY.horizons,
  maximumInputCases:ETH_MC_STABILITY_POLICY.maximumInputCases,
  maximumSelectedOrigins:ETH_MC_STABILITY_POLICY.maximumSelectedOrigins,
  maximumDrawDays:ETH_MC_STABILITY_POLICY.maximumDrawDays,
  simulationModels:Object.freeze(['adaptiveEth','pooledEth','warmStartEth']),
  pointModels:Object.freeze(['adaptiveEth','pooledEth','warmStartEth','flat','shrunkenTrend']),
  intervalModels:Object.freeze(['adaptiveEth','pooledEth','warmStartEth','gaussian']),
  nominalPointwiseMass:.8,intersectionBeforeDisjointSelection:true,
  separatePointAndIntervalCohorts:true,policyPreregistered:false,tunePolicyFromResults:false,
  changeDefaultModel:false,changeDefaultSeed:false,productionPromoted:false,
});
const P=ETH_COMMON_COHORT_POLICY,positive=x=>Number.isFinite(x)&&x>0;
const mean=values=>values.length?values.reduce((sum,value)=>sum+value,0)/values.length:null;
const identity=row=>row.origin+'|'+row.horizonDays;
const simulated=model=>P.simulationModels.includes(model);
function pointPresent(row,model){
  const price=row.predictions?.[model];
  if(price==null)return false;
  if(!positive(price))throw new RangeError('Present forecast must be positive and finite: '+model);
  return true;
}
function intervalPresent(row,model){
  const band=row.simulatedIntervals?.[model];
  if(band==null)return false;
  if(!pointPresent(row,model)||![band.lower,band.upper].every(positive)||
    band.lower>row.predictions[model]||band.upper<row.predictions[model])throw new RangeError('Ordered positive candidate interval required: '+model);
  if(!Number.isFinite(band.nominalPointwiseMass)||Math.abs(band.nominalPointwiseMass-P.nominalPointwiseMass)>1e-12)
    throw new RangeError('Common interval cohort requires identical nominal mass');
  return true;
}

/** Membership uses existing default predictions before running any new seed.
 * Every horizon has a five-model point cohort and a separate four-model interval
 * cohort. The control's origin-only fit is supplied by the report builder. */
export function selectEthereumCommonCohorts({cases,asOf,gaussianControls=[],warmOrigins=[]}={}){
  utcDay(asOf);
  if(!Array.isArray(cases)||cases.length>P.maximumInputCases)throw new RangeError('Bounded common-cohort cases required');
  if(!Array.isArray(gaussianControls)||gaussianControls.length>P.maximumInputCases||!Array.isArray(warmOrigins)||warmOrigins.length>P.maximumInputCases)
    throw new RangeError('Bounded control and availability rows required');
  const seen=new Set(),controls=new Map(),warm=new Map();
  for(const row of cases){
    utcDay(row.origin);utcDay(row.targetDate);
    if(!P.horizons.includes(row.horizonDays)||row.targetDate!==dateFromDay(utcDay(row.origin)+row.horizonDays))
      throw new RangeError('Common-cohort target identity mismatch');
    const key=identity(row);if(seen.has(key))throw new RangeError('Duplicate common-cohort origin/horizon');seen.add(key);
  }
  for(const control of gaussianControls){
    const key=identity(control);if(controls.has(key))throw new RangeError('Duplicate Gaussian origin/horizon');
    if(control.targetDate!==dateFromDay(utcDay(control.origin)+control.horizonDays))throw new RangeError('Gaussian target identity mismatch');
    controls.set(key,control);
  }
  for(const row of warmOrigins){if(warm.has(row.origin))throw new RangeError('Duplicate warm-start availability origin');warm.set(row.origin,row);}
  const cohorts=[];
  for(const horizonDays of P.horizons)for(const kind of ['point','interval']){
    const models=kind==='point'?P.pointModels:P.intervalModels,eligible=[],excluded=[];
    const source=cases.filter(row=>row.horizonDays===horizonDays).sort((a,b)=>a.origin.localeCompare(b.origin));
    for(const row of source){
      const reasons=[];
      if(row.origin>asOf||row.targetDate>asOf||row.status==='pending')reasons.push({code:'not-mature-at-cutoff'});
      else if(row.actual==null||row.status==='missing-observation')reasons.push({code:'missing-observation'});
      else{
        if(!positive(row.actual)||!positive(row.anchorPrice))throw new RangeError('Mature actual and origin anchor must be positive and finite');
        for(const model of models.filter(value=>value!=='gaussian')){
          if(!pointPresent(row,model))reasons.push({code:'point-unavailable',model,
            detail:model==='warmStartEth'?warm.get(row.origin)?.reason??null:row.unavailableModels?.[model]??null});
          else if(kind==='interval'&&!intervalPresent(row,model))reasons.push({code:'interval-unavailable',model});
        }
        if(kind==='point'&&pointPresent(row,'flat')&&row.predictions.flat!==row.anchorPrice)
          throw new RangeError('Flat control differs from its origin anchor');
        if(kind==='interval'){
          const control=controls.get(identity(row));
          if(control?.status!=='available')reasons.push({code:'gaussian-unavailable',model:'gaussian',detail:control?.reason??'No origin-only control'});
          else{
            if(![control.price,control.lower,control.upper].every(positive)||control.lower>control.price||control.price>control.upper||control.price!==row.anchorPrice)
              throw new RangeError('Gaussian control must have ordered positive bounds and the same anchor');
            if(control.nominalPointwiseMass!==P.nominalPointwiseMass)throw new RangeError('Common interval cohort requires identical nominal mass');
          }
        }
      }
      if(reasons.length){excluded.push({origin:row.origin,targetDate:row.targetDate,horizonDays,reasons});continue;}
      const frozen={origin:row.origin,targetDate:row.targetDate,horizonDays,anchorPrice:row.anchorPrice,actual:row.actual,
        predictions:Object.fromEntries(P.pointModels.filter(model=>row.predictions?.[model]!=null).map(model=>[model,row.predictions[model]])),
        simulatedIntervals:Object.fromEntries(P.simulationModels.filter(model=>row.simulatedIntervals?.[model]!=null).map(model=>{
          const value=row.simulatedIntervals[model];return [model,{lower:value.lower,upper:value.upper,nominalPointwiseMass:value.nominalPointwiseMass}];
        }))};
      if(kind==='interval'){
        const control=controls.get(identity(row));frozen.gaussian={median:control.price,lower:control.lower,upper:control.upper};
      }
      eligible.push(frozen);
    }
    const selected=disjointEthereumCases(eligible),used=new Set(selected.map(identity));
    for(const row of eligible)if(!used.has(identity(row)))excluded.push({origin:row.origin,targetDate:row.targetDate,horizonDays,
      reasons:[{code:'overlaps-earlier-common-window'}]});
    excluded.sort((a,b)=>a.origin.localeCompare(b.origin));
    const counts={};for(const row of excluded)for(const reason of row.reasons)counts[reason.code]=(counts[reason.code]??0)+1;
    cohorts.push({id:'common-'+kind+':'+horizonDays,kind,horizonDays,models:[...models],inputCases:source.length,
      eligibleBeforeDisjoint:eligible.length,n:selected.length,commonOrigins:eligible.map(row=>row.origin),
      disjointOrigins:selected.map(row=>row.origin),cases:selected,excluded,exclusionReasonCounts:counts,
      reasonCountsCanExceedExcludedCases:true,independentSampleSize:null});
  }
  if(new Set(cohorts.flatMap(cohort=>cohort.disjointOrigins)).size>P.maximumSelectedOrigins)throw new RangeError('Selected common-origin budget exceeded');
  return cohorts;
}

/** Static controls occur once, not sixteen times as spurious MC replications. */
export function staticCommonCohortReplicates(cohorts){
  return cohorts.flatMap(cohort=>cohort.models.filter(model=>!simulated(model)).map(model=>({
    cohortId:cohort.id,model,sampleCount:null,seed:null,
    points:cohort.cases.map(row=>({origin:row.origin,targetDate:row.targetDate,horizonDays:cohort.horizonDays,
      ...(model==='gaussian'?row.gaussian:{median:row.predictions[model]})})),
  })));
}

/** Recompute every loss from raw forecasts and frozen targets. A missing draw,
 * seed, control, or origin invalidates the panel; it never shrinks the cohort. */
export function summarizeEthereumCommonPanel(cohorts,replicates){
  if(!Array.isArray(cohorts)||!Array.isArray(replicates))throw new TypeError('Fixed cohorts and complete replicates required');
  const expectedIds=P.horizons.flatMap(horizon=>['point','interval'].map(kind=>'common-'+kind+':'+horizon));
  if(cohorts.length!==expectedIds.length||expectedIds.some(id=>!cohorts.some(cohort=>cohort.id===id)))throw new RangeError('Incomplete fixed horizon/cohort panel');
  const cohortIds=new Set(),seen=new Set(),rows=[];
  for(const cohort of cohorts){
    if(cohortIds.has(cohort.id))throw new RangeError('Duplicate fixed cohort');cohortIds.add(cohort.id);
    if(!['point','interval'].includes(cohort.kind)||!P.horizons.includes(cohort.horizonDays)||cohort.id!=='common-'+cohort.kind+':'+cohort.horizonDays)
      throw new RangeError('Unknown fixed cohort identity');
    const expected=cohort.kind==='point'?P.pointModels:P.intervalModels;
    if(JSON.stringify(cohort.models)!==JSON.stringify(expected))throw new RangeError('Fixed cohort model membership changed');
    if(new Set(cohort.cases.map(row=>row.origin)).size!==cohort.cases.length)throw new RangeError('Duplicate fixed cohort origin');
    if(cohort.n!==cohort.cases.length||cohort.cases.some(row=>row.horizonDays!==cohort.horizonDays||row.targetDate!==dateFromDay(utcDay(row.origin)+cohort.horizonDays)))
      throw new RangeError('Fixed cohort count or target identity changed');
    if(disjointEthereumCases(cohort.cases).length!==cohort.cases.length)throw new RangeError('Fixed common windows must be disjoint');
    for(const model of cohort.models){
      const settings=simulated(model)?P.sampleCounts.flatMap(sampleCount=>P.seeds.map(seed=>({sampleCount,seed}))):[{sampleCount:null,seed:null}];
      for(const {sampleCount,seed} of settings){
        const matches=replicates.filter(row=>row.cohortId===cohort.id&&row.model===model&&row.sampleCount===sampleCount&&row.seed===seed);
        if(matches.length!==1)throw new RangeError('Incomplete or duplicated common seed/draw/control panel');
        const replicate=matches[0];seen.add(replicate);
        if(replicate.status==='failed')throw new RangeError('Failed selected simulation; no selective omission: '+replicate.reason);
        if(!Array.isArray(replicate.points)||replicate.points.length!==cohort.cases.length||new Set(replicate.points.map(point=>point.origin)).size!==replicate.points.length)
          throw new RangeError('Simulation changed the fixed common cohort');
        const scored=cohort.cases.map(actual=>{
          const point=replicate.points.find(value=>value.origin===actual.origin);
          if(!point||point.targetDate!==actual.targetDate||point.horizonDays!==cohort.horizonDays)
            throw new RangeError('Simulation changed the fixed target identity');
          if(!positive(actual.actual)||!positive(point.median))throw new RangeError('Finite positive frozen target and forecast required');
          return cohort.kind==='interval'?scoreStabilityPoint(point,actual.actual):{absoluteLogError:Math.abs(Math.log(point.median)-Math.log(actual.actual))};
        });
        rows.push({cohortId:cohort.id,kind:cohort.kind,horizonDays:cohort.horizonDays,model,sampleCount,seed,n:scored.length,
          meanAbsoluteLogError:mean(scored.map(score=>score.absoluteLogError)),
          meanLogIntervalScore:cohort.kind==='interval'?mean(scored.map(score=>score.logIntervalScore)):null,
          meanLogWidth:cohort.kind==='interval'?mean(scored.map(score=>score.logWidth)):null,
          included:cohort.kind==='interval'?scored.filter(score=>score.covered).length:null,
          empiricalCoverage:cohort.kind==='interval'?mean(scored.map(score=>Number(score.covered))):null});
      }
    }
  }
  if(seen.size!==replicates.length)throw new RangeError('Unexpected extra common cohort/model/seed/draw/control');
  const summaries=[],comparisons=[];
  for(const cohort of cohorts)for(const sampleCount of P.sampleCounts){
    const groups={},metrics=cohort.kind==='point'?['meanAbsoluteLogError']:['meanAbsoluteLogError','meanLogIntervalScore'];
    const controls=Object.fromEntries(cohort.models.filter(model=>!simulated(model)).map(model=>[model,rows.find(row=>row.cohortId===cohort.id&&row.model===model)]));
    for(const model of cohort.models){
      const selected=rows.filter(row=>row.cohortId===cohort.id&&row.model===model&&(row.sampleCount===sampleCount||!simulated(model)));
      const ranges=Object.fromEntries([...metrics,...(cohort.kind==='interval'?['meanLogWidth','empiricalCoverage']:[])].map(metric=>
        [metric,stabilityRange(selected.map(row=>row[metric]).filter(value=>value!==null))]));
      const skills=Object.fromEntries(Object.entries(controls).map(([control,baseline])=>[control,
        stabilityRange(selected.filter(row=>row.meanAbsoluteLogError!==null&&baseline.meanAbsoluteLogError>0).map(row=>1-row.meanAbsoluteLogError/baseline.meanAbsoluteLogError))]));
      groups[model]=ranges;
      summaries.push({cohortId:cohort.id,kind:cohort.kind,horizonDays:cohort.horizonDays,model,sampleCount,n:cohort.cases.length,
        monteCarlo:simulated(model),replicateCount:selected.length,seedCount:simulated(model)?P.seeds.length:0,...ranges,pointSkillsAgainstStaticControls:skills});
    }
    for(let leftIndex=0;leftIndex<cohort.models.length;leftIndex++)for(let rightIndex=leftIndex+1;rightIndex<cohort.models.length;rightIndex++)for(const metric of metrics){
      const left=cohort.models[leftIndex],right=cohort.models[rightIndex],l=groups[left][metric],r=groups[right][metric];
      const min=l.count&&r.count?l.min-r.max:null,max=l.count&&r.count?l.max-r.min:null;
      comparisons.push({cohortId:cohort.id,horizonDays:cohort.horizonDays,sampleCount,n:cohort.cases.length,left,right,metric,
        leftMinusRightCrossSeedEnvelope:{min,max},
        status:min===null?'no-mature-common-cases':max<0?'all-declared-combinations-favor-left':min>0?'all-declared-combinations-favor-right':'ranking-sensitive-or-tied-in-declared-panel'});
    }
  }
  return {status:'complete',replicates:rows,summaries,comparisons,
    interpretation:{allModelsUseSameOriginsWithinCohort:true,pointAndIntervalCohortsMustNotBeMixed:true,
      monteCarloSensitivityOnly:true,confidenceInterval:false,independentSeedSamplingClaim:false,
      commonRandomNumbersAcrossModels:false,marketPredictionSignificance:false,policySelection:false,productionPromoted:false}};
}
