import test from 'node:test';
import assert from 'node:assert/strict';
import {ETH_MC_STABILITY_POLICY as policy,selectEthereumStabilityCohorts,scoreStabilityPoint,summarizeEthereumStabilityPanel} from '../scripts/ethereum-monte-carlo-stability-core.mjs';
const cohorts=[{id:'adaptive-vs-pooled:30',scope:'adaptive-vs-pooled',horizonDays:30,models:['adaptiveEth','pooledEth'],
  cases:[{origin:'2024-01-01',targetDate:'2024-01-31',actual:1,flat:Math.exp(.25)},{origin:'2024-02-01',targetDate:'2024-03-02',actual:1,flat:Math.exp(.25)}]}];
function panel(){
  return cohorts.flatMap(c=>c.models.flatMap(model=>policy.sampleCounts.flatMap(sampleCount=>policy.seeds.map(seed=>({
    cohortId:c.id,model,sampleCount,seed,points:c.cases.map(r=>({origin:r.origin,
      median:Math.exp(model==='adaptiveEth'?.25:seed===20261027?.2:.3),lower:1,upper:Math.exp(.5)})),
  })))));
}
const close=(a,b)=>assert.ok(Math.abs(a-b)<1e-12,a+' != '+b);
test('hand-calculated losses expose finite-seed ranking changes without claiming confidence',()=>{
  const result=summarizeEthereumStabilityPanel(cohorts,panel());
  const pooled=result.summaries.find(r=>r.model==='pooledEth'&&r.sampleCount===256);
  close(pooled.meanAbsoluteLogError.min,.2);close(pooled.meanAbsoluteLogError.max,.3);
  close(pooled.flatSkill.min,-.2);close(pooled.flatSkill.max,.2);
  const delta=result.comparisons.find(r=>r.sampleCount===256&&r.metric==='meanAbsoluteLogError');
  close(delta.crossSeedDeltaEnvelope.min,-.05);close(delta.crossSeedDeltaEnvelope.max,.05);
  assert.match(delta.status,/sensitive/);assert.equal(result.interpretation.confidenceInterval,false);
});
test('seed ordering and poisoned cached scores cannot change a complete panel',()=>{
  const original=panel(),poisoned=structuredClone(original).reverse();
  for(const r of poisoned)for(const p of r.points){p.covered=false;p.absoluteLogError=999;p.logIntervalScore=-999;}
  assert.deepEqual(summarizeEthereumStabilityPanel(cohorts,poisoned),summarizeEthereumStabilityPanel(cohorts,original));
});
test('missing seed, duplicate seed, missing fixed origin and failed simulation are explicit failures',()=>{
  assert.throws(()=>summarizeEthereumStabilityPanel(cohorts,panel().slice(1)),/Incomplete/);
  const duplicate=panel();duplicate.push(duplicate[0]);assert.throws(()=>summarizeEthereumStabilityPanel(cohorts,duplicate),/duplicated/);
  const missing=panel();missing[0].points.pop();assert.throws(()=>summarizeEthereumStabilityPanel(cohorts,missing),/fixed cohort/);
  const failed=panel();failed[0]={...failed[0],status:'failed',reason:'overflow'};
  assert.throws(()=>summarizeEthereumStabilityPanel(cohorts,failed),/no selective omission/);
});
test('zero flat error has undefined skill and interval width is penalized',()=>{
  const c=structuredClone(cohorts);for(const r of c[0].cases)r.flat=1;
  assert.ok(summarizeEthereumStabilityPanel(c,panel()).replicates.every(r=>r.flatSkill===null));
  const narrow=scoreStabilityPoint({median:1,lower:Math.exp(-.1),upper:Math.exp(.1)},1);
  const wide=scoreStabilityPoint({median:1,lower:Math.exp(-1),upper:Math.exp(1)},1);
  assert.equal(narrow.covered,wide.covered);assert.ok(wide.logIntervalScore>narrow.logIntervalScore);
  assert.throws(()=>scoreStabilityPoint({median:3,lower:1,upper:2},1),/Ordered/);
});
test('fixed cohorts exclude poisoned future actuals and reject date/duplicate identities',()=>{
  const row={origin:'2024-01-01',targetDate:'2024-01-31',horizonDays:30,actual:2,anchorPrice:1,status:'retrospective',predictions:{flat:1,adaptiveEth:2,pooledEth:2}};
  const future={...row,origin:'2024-03-01',targetDate:'2024-03-31',actual:1e100};
  const result=selectEthereumStabilityCohorts([row,future],'2024-02-01');
  assert.equal(result.find(c=>c.id==='adaptive-vs-pooled:30').cases.length,1);
  assert.throws(()=>selectEthereumStabilityCohorts([row,row],'2024-02-01'),/Duplicate/);
  assert.throws(()=>selectEthereumStabilityCohorts([{...row,targetDate:'2024-02-01'}],'2024-02-02'),/identity/);
});
