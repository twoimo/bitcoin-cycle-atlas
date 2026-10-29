import test from 'node:test';
import assert from 'node:assert/strict';
import {runEthereumEconomicAblations} from '../dist/ethereum-economic-ablation.js';
import {buildEthereumEconomicCandidate} from '../dist/ethereum-economic-model.js';
import {fixture} from './helpers/eth-economic-fixture.mjs';
const base=fixture(900),origins=[580,620,660,899].map(i=>base.ethRows[i].date);
const run=options=>runEthereumEconomicAblations({...base,horizons:[30],origins,...options});
test('missing authentic snapshots never produce a scored economic ablation',()=>{
  const r=run({economicSnapshots:[]});
  assert.equal(r.status,'unavailable');assert.equal(r.prospectiveScoredTargets,0);
  assert.equal(r.summaries.length,26);
  assert.ok(r.summaries.every(s=>s.disjoint.n===0&&s.disjoint.fullMeanAbsoluteLogError===null));
});
test('synthetic full and reduced fits use the actual candidate and identical future targets',()=>{
  const r=run(),origin=origins[0],c=buildEthereumEconomicCandidate({...base,asOf:origin,horizons:[30]});
  const first=r.cases.find(x=>x.origin===origin&&x.feature==='l1Usage'&&x.target==='ETH/USD');
  assert.equal(first.fullPrediction,c.predictions[0].price);
  assert.equal(first.reducedPrediction,c.currentInput.observedEthUsd*Math.exp(c.ablations[0].features[0].logReturnWithoutFeature));
  const relative=r.cases.find(x=>x.origin===origin&&x.feature==='l1Usage'&&x.target==='ETH/BTC');
  assert.equal(relative.fullPrediction,c.predictions[0].ethBtcRatio);
  assert.ok(r.summaries.every(s=>s.overlapping.n===3&&s.disjoint.n===3&&s.pending===1));
  assert.equal(r.defaultEligible,false);assert.equal(r.prospectiveScoredTargets,0);
  assert.equal(r.cases.filter(x=>x.status==='pending').length,26);
});
test('changed future target changes loss but cannot change the origin full or reduced prediction',()=>{
  const before=run({origins:[origins[0]]}),changed=structuredClone(base);
  changed.ethRows[610].price*=2;
  const after=runEthereumEconomicAblations({...changed,origins:[origins[0]],horizons:[30]});
  for(let i=0;i<before.cases.length;i++){
    assert.equal(before.cases[i].fullPrediction,after.cases[i].fullPrediction);
    assert.equal(before.cases[i].reducedPrediction,after.cases[i].reducedPrediction);
    assert.notEqual(before.cases[i].fullAbsoluteLogError,after.cases[i].fullAbsoluteLogError);
  }
});
test('unpublished targets are missing outcomes rather than zero error',()=>{
  const changed=structuredClone(base);changed.ethRows[610].publishedAt='2030-01-01T00:00:00Z';changed.ethRows[610].collectedAt='2030-01-01T00:00:00Z';
  const r=runEthereumEconomicAblations({...changed,origins:[origins[0]],horizons:[30]});
  assert.ok(r.cases.every(x=>x.status==='target-unavailable'&&x.actual===null&&x.fullAbsoluteLogError===null));
  assert.ok(r.summaries.every(s=>s.disjoint.n===0));
});
test('later target revisions are selected by eligible receipts and conflicting vintages fail',()=>{
  const changed=structuredClone(base),revision={...changed.ethRows[610],price:changed.ethRows[610].price*1.2,vintageId:'synthetic-revision',
    publishedAt:changed.ethRows[700].publishedAt,collectedAt:changed.ethRows[700].collectedAt,sourceHash:'b'.repeat(64)};
  changed.ethRows.push(revision);
  const r=runEthereumEconomicAblations({...changed,origins:[origins[0]],horizons:[30]});
  assert.equal(r.cases.find(x=>x.target==='ETH/USD').actual,revision.price);
  const conflict=structuredClone(base);conflict.ethRows.push({...conflict.ethRows[610],price:1});
  assert.throws(()=>runEthereumEconomicAblations({...conflict,origins:[origins[0]],horizons:[30]}),/Conflicting target vintage/);
});
test('overlapping cases are reported separately and future issue dates are rejected',()=>{
  const r=run({origins:[580,590,620].map(i=>base.ethRows[i].date)});
  assert.ok(r.summaries.every(s=>s.overlapping.n===3&&s.disjoint.n===2));
  assert.throws(()=>run({issuedAtByOrigin:{[origins[0]]:'2030-01-01T00:00:00Z'}}),/exceeds evaluation/);
  assert.throws(()=>run({origins:[origins[0],origins[0]]}),/distinct/);
  assert.throws(()=>run({evaluatedAt:'2020-02-31T00:00:00Z'}));
});

test('explicit null issue times fail and policy fallback never claims actual issuance',()=>{
  const origin=origins[0],completedAt=Date.parse(origin+'T00:00:00Z')+86400000;
  const evaluate=issuedAtByOrigin=>run({origins:[origin],economicSnapshots:[],issuedAtByOrigin});
  for(const supplied of [null,0,false]){
    assert.throws(()=>evaluate({[origin]:supplied}),/Explicit origin issue time must be a timestamp string/);
  }
  for(const issueMap of [{},{[origin]:undefined}]){
    const r=evaluate(issueMap);
    assert.equal(r.originStates[0].issuedAt,new Date(completedAt).toISOString());
    assert.equal(r.originStates[0].actualIssueTimeSupplied,false);
    assert.ok(r.cases.every(row=>row.actualIssueTimeSupplied===false));
  }
  const explicit=new Date(completedAt+3600000).toISOString(),r=evaluate({[origin]:explicit});
  assert.equal(r.originStates[0].issuedAt,explicit);
  assert.equal(r.originStates[0].actualIssueTimeSupplied,true);
  assert.ok(r.cases.every(row=>row.actualIssueTimeSupplied===true));
  for(const invalid of [completedAt-1,completedAt+86400000]){
    assert.throws(()=>evaluate({[origin]:new Date(invalid).toISOString()}),/within the UTC day after its completed close/);
  }
});

test('synthetic extreme finite outcomes retain finite log losses when quotients underflow',()=>{
  const scaled=structuredClone(base);
  for(const row of scaled.ethRows)row.price*=1e-280;
  const origin=origins[0],before=runEthereumEconomicAblations({...scaled,origins:[origin],horizons:[30]});
  const changed=structuredClone(scaled);
  changed.ethRows[610].price=1e300;
  const after=runEthereumEconomicAblations({...changed,origins:[origin],horizons:[30]});
  assert.equal(after.cases.length,26);
  assert.ok(after.cases.every(row=>row.status==='scored'));
  for(let i=0;i<after.cases.length;i++){
    const prior=before.cases[i],row=after.cases[i];
    assert.equal(row.fullPrediction,prior.fullPrediction);
    assert.equal(row.reducedPrediction,prior.reducedPrediction);
    assert.ok(Number.isFinite(row.actual)&&row.actual>0);
    assert.equal(row.fullPrediction/row.actual,0);
    assert.equal(row.reducedPrediction/row.actual,0);
    assert.ok(Number.isFinite(row.fullAbsoluteLogError)&&row.fullAbsoluteLogError>1000);
    assert.ok(Number.isFinite(row.reducedAbsoluteLogError)&&row.reducedAbsoluteLogError>1000);
  }
  for(const summary of after.summaries)for(const group of ['overlapping','disjoint']){
    const metrics=summary[group];
    assert.equal(metrics.n,1);
    assert.ok(Number.isFinite(metrics.fullMeanAbsoluteLogError));
    assert.ok(Number.isFinite(metrics.reducedMeanAbsoluteLogError));
    assert.ok(Number.isFinite(metrics.meanAbsoluteLogErrorReduction));
    assert.ok(Number.isFinite(metrics.addedFeatureSkill));
  }
});
