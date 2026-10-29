import {utcDay,dateFromDay} from '../dist/cycle-engine.js';
import {disjointEthereumCases} from '../dist/ethereum-model-comparison.js';
export const ETH_MC_STABILITY_POLICY=Object.freeze({
  version:'eth-monte-carlo-stability-1',
  seeds:Object.freeze([20261027,1,104729,130363,155921,196613,262147,524287]),
  sampleCounts:Object.freeze([256,1024]),horizons:Object.freeze([30,90,180]),
  maximumSelectedOrigins:64,maximumInputCases:512,maximumDrawDays:196608000,
  rawSimulationOnly:true,tunePolicyFromResults:false,changeDefaultModel:false,changeDefaultSeed:false,
});
const positive=x=>Number.isFinite(x)&&x>0;
const mean=a=>a.length?a.reduce((s,x)=>s+x,0)/a.length:null;
export function stabilityRange(values){
  if(!Array.isArray(values)||values.some(v=>!Number.isFinite(v)))throw new TypeError('Finite numerical panel required');
  if(!values.length)return {count:0,min:null,median:null,max:null};
  const sorted=[...values].sort((a,b)=>a-b),middle=(sorted.length-1)/2;
  return {count:sorted.length,min:sorted[0],median:(sorted[Math.floor(middle)]+sorted[Math.ceil(middle)])/2,max:sorted.at(-1)};
}
export function selectEthereumStabilityCohorts(cases,asOf){
  utcDay(asOf);
  if(!Array.isArray(cases)||cases.length>ETH_MC_STABILITY_POLICY.maximumInputCases)throw new RangeError('Bounded comparison cases required');
  const seen=new Set(),eligible=[];
  for(const r of cases){
    utcDay(r.origin);utcDay(r.targetDate);
    if(!ETH_MC_STABILITY_POLICY.horizons.includes(r.horizonDays)||r.targetDate!==dateFromDay(utcDay(r.origin)+r.horizonDays))throw new RangeError('Comparison target identity mismatch');
    const key=r.origin+'|'+r.horizonDays;if(seen.has(key))throw new RangeError('Duplicate comparison origin/horizon');seen.add(key);
    if(r.targetDate>asOf||r.status==='pending'||r.actual===null)continue;
    if(!positive(r.actual))throw new RangeError('Mature actual must be positive and finite');
    if(positive(r.predictions?.pooledEth)&&positive(r.predictions?.flat)){
      if(r.predictions.flat!==r.anchorPrice)throw new RangeError('Flat control differs from the origin anchor');
      eligible.push(r);
    }
  }
  const cohorts=[];
  for(const horizonDays of ETH_MC_STABILITY_POLICY.horizons)for(const scope of ['adaptive-vs-pooled','pooled-vs-flat']){
    const used=disjointEthereumCases(eligible.filter(r=>r.horizonDays===horizonDays&&(scope==='pooled-vs-flat'||positive(r.predictions?.adaptiveEth))));
    cohorts.push({id:scope+':'+horizonDays,scope,horizonDays,models:scope==='adaptive-vs-pooled'?['adaptiveEth','pooledEth']:['pooledEth'],
      cases:used.map(r=>({origin:r.origin,targetDate:r.targetDate,actual:r.actual,flat:r.predictions.flat}))});
  }
  if(new Set(cohorts.flatMap(c=>c.cases.map(r=>r.origin))).size>ETH_MC_STABILITY_POLICY.maximumSelectedOrigins)throw new RangeError('Selected origin budget exceeded');
  return cohorts;
}
export function scoreStabilityPoint(point,actual){
  if(![point?.median,point?.lower,point?.upper,actual].every(positive)||point.lower>point.median||point.median>point.upper)throw new RangeError('Ordered positive simulation quantiles required');
  const y=Math.log(actual),l=Math.log(point.lower),u=Math.log(point.upper);
  return {absoluteLogError:Math.abs(Math.log(point.median)-y),logWidth:u-l,
    logIntervalScore:u-l+10*Math.max(0,l-y)+10*Math.max(0,y-u),covered:actual>=point.lower&&actual<=point.upper};
}
/** Complete fixed panel, no seed selection, no dropping an inconvenient case. */
export function summarizeEthereumStabilityPanel(cohorts,replicates){
  if(!Array.isArray(cohorts)||!Array.isArray(replicates))throw new TypeError('Cohorts and replicates required');
  const seen=new Set(),rows=[];
  for(const c of cohorts){
    if(new Set(c.cases.map(r=>r.origin)).size!==c.cases.length)throw new RangeError('Duplicate fixed cohort origin');
    const baseline=mean(c.cases.map(r=>Math.abs(Math.log(r.flat)-Math.log(r.actual))));
    for(const model of c.models)for(const sampleCount of ETH_MC_STABILITY_POLICY.sampleCounts)for(const seed of ETH_MC_STABILITY_POLICY.seeds){
      const matches=replicates.filter(r=>r.cohortId===c.id&&r.model===model&&r.sampleCount===sampleCount&&r.seed===seed);
      if(matches.length!==1)throw new RangeError('Incomplete or duplicated fixed seed/draw panel');
      const r=matches[0];seen.add(r);
      if(r.status==='failed')throw new RangeError('Selected simulation failed; no selective omission: '+r.reason);
      if(!Array.isArray(r.points)||r.points.length!==c.cases.length||new Set(r.points.map(p=>p.origin)).size!==r.points.length)throw new RangeError('Simulation changed the fixed cohort');
      const scored=c.cases.map(actual=>{
        const point=r.points.find(p=>p.origin===actual.origin);
        if(!point)throw new RangeError('Simulation omitted a fixed origin');
        return scoreStabilityPoint(point,actual.actual);
      });
      const loss=mean(scored.map(s=>s.absoluteLogError));
      rows.push({cohortId:c.id,model,horizonDays:c.horizonDays,sampleCount,seed,n:scored.length,
        meanAbsoluteLogError:loss,meanLogIntervalScore:mean(scored.map(s=>s.logIntervalScore)),
        meanLogWidth:mean(scored.map(s=>s.logWidth)),included:scored.filter(s=>s.covered).length,
        flatMeanAbsoluteLogError:baseline,flatSkill:baseline>0?1-loss/baseline:null});
    }
  }
  if(seen.size!==replicates.length)throw new RangeError('Unexpected extra seed/draw/cohort/model');
  const summaries=[],comparisons=[];
  for(const c of cohorts)for(const sampleCount of ETH_MC_STABILITY_POLICY.sampleCounts){
    const groups={};
    for(const model of c.models){
      const group=rows.filter(r=>r.cohortId===c.id&&r.model===model&&r.sampleCount===sampleCount);
      groups[model]=Object.fromEntries(['meanAbsoluteLogError','meanLogIntervalScore','meanLogWidth','flatSkill'].map(key=>[key,stabilityRange(group.map(r=>r[key]).filter(v=>v!==null))]));
      summaries.push({cohortId:c.id,model,horizonDays:c.horizonDays,sampleCount,n:c.cases.length,...groups[model]});
    }
    if(c.scope==='adaptive-vs-pooled')for(const metric of ['meanAbsoluteLogError','meanLogIntervalScore']){
      const a=groups.adaptiveEth[metric],p=groups.pooledEth[metric];
      const lo=p.count?p.min-a.max:null,hi=p.count?p.max-a.min:null;
      comparisons.push({cohortId:c.id,sampleCount,metric,crossSeedDeltaEnvelope:{min:lo,max:hi},
        status:lo===null?'no-mature-cases':hi<0?'all-declared-seed-pairs-favor-pooled':lo>0?'all-declared-seed-pairs-favor-adaptive':'ranking-sensitive-or-tied-in-declared-panel'});
    }
  }
  return {status:'complete',replicates:rows,summaries,comparisons,
    interpretation:{monteCarloSensitivityOnly:true,confidenceInterval:false,independentSeedSamplingClaim:false,
      commonRandomNumbersAcrossModels:false,marketPredictionSignificance:false,policySelection:false,productionPromoted:false}};
}
