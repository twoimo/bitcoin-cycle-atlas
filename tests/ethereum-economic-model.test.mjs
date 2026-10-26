import test from 'node:test';
import assert from 'node:assert/strict';
import {buildEthereumEconomicCandidate,ETH_ECONOMIC_FEATURES,ETH_ECONOMIC_INPUT_SCHEMA} from '../dist/ethereum-economic-model.js';
import {runEthereumModelComparison} from '../dist/ethereum-model-comparison.js';

// Explicitly synthetic mechanism fixtures. These are not published network data,
// observed forecast accuracy, vintage-validation receipts or a calibration sample.
function fixture(count=3000){
  const day=86400000,start=Date.parse('2018-01-01T00:00:00Z'),date=i=>new Date(start+i*day).toISOString().slice(0,10);
  const sourceUrl='https://fixtures.invalid/synthetic-eth-economics';
  const ethRows=[],btcRows=[],economicSnapshots=[];
  for(let i=0;i<count;i++){
    const stamp=new Date(start+(i+1)*day).toISOString(),provenance={publishedAt:stamp,collectedAt:stamp,vintageId:'synthetic-'+i,sourceHash:'a'.repeat(64),sourceUrl};
    ethRows.push({date:date(i),price:1000*Math.exp(i*.00015+.1*Math.sin(i/47)+.03*Math.cos(i/17)),...provenance});
    btcRows.push({date:date(i),price:15000*Math.exp(i*.0001+.06*Math.sin(i/61)),...provenance});
    if(i>=27&&i%7===0){
      const metrics={
        l1GasUsed:1e9*(1+.2*Math.sin(i/33)),l2Transactions:4e7*(1+.3*Math.cos(i/51)),blobGasUsed:2e9*(1+.1*Math.sin(i/65)),
        executionFeesEth:20000*(1+.1*Math.cos(i/87)),executionBurnEth:10000*(1+.1*Math.cos(i/87)),blobFeesEth:1000*(1+.2*Math.sin(i/42)),blobBurnEth:1000*(1+.2*Math.sin(i/42)),
        consensusNetIssuanceEth:25000*(1+.1*Math.sin(i/79)),executionPowIssuanceEth:0,supplyEth:120e6,stakedEth:30e6+5e5*Math.sin(i/107),exitQueueEth:1e5*(1+.1*Math.sin(i/19)),
        l2UserFeesEth:5000*(1+.1*Math.cos(i/23)),l2SettlementFeesEth:3000*(1+.1*Math.sin(i/29)),
        stakingConsensusRewardsEth:10000*(1+.2*Math.sin(i/83)),stakingConsensusPenaltiesEth:200*(1+.1*Math.cos(i/37)),
        stakingPriorityFeesEth:2400*(1+.15*Math.sin(i/33)),stakingMevExcludingPriorityEth:900*(1+.2*Math.cos(i/57)),
        stakingServiceFeesEth:700*(1+.1*Math.sin(i/107)),stakingOperatingCostsEth:200*(1+.05*Math.cos(i/29)),
        averageRewardEligibleStakeEth:12e6+2e5*Math.sin(i/97),completedExitCount:50+i%17,completedExitMedianWaitDays:2+.8*Math.sin(i/71),
        uniqueNativeCollateralEth:8e6+5e5*Math.sin(i/43),uniqueStakingClaimCollateralEth:4e6+3e5*Math.cos(i/67),
      };
      economicSnapshots.push({
        metricDefinitionVersion:'eth-economic-input-3',l2UniverseId:'synthetic-rollups-fixed',
        stakingCohortId:'synthetic-staking-fixed',stakingRewardAccounting:'earned-disjoint-28d-v1',
        exitTimingUniverseId:'synthetic-completed-exits-fixed',exitTimingBasis:'completed-request-to-execution-28d-v1',
        collateralUniverseId:'synthetic-collateral-fixed',collateralAccounting:'unique-underlying-disjoint-v1',
        observedThrough:date(i),windowDays:28,completeWindow:true,...provenance,metrics,
        metricSourceUrls:Object.fromEntries(Object.keys(metrics).map(k=>[k,sourceUrl])),
      });
    }
  }
  return {ethRows,btcRows,economicSnapshots,asOf:date(count-1),horizons:[30,90,180]};
}

const clone=value=>structuredClone(value);
const afterDay=(date,days)=>new Date(Date.parse(date+'T00:00:00.000Z')+days*86400000).toISOString().slice(0,10);
const featureValue=(output,id)=>output.contributions[0].features.find(f=>f.id===id).value;
const model=buildEthereumEconomicCandidate;
const base=fixture();
const result=model(base);

test('missing economic observations and missing actual publication provenance cannot activate the candidate',()=>{
  const empty=model({...base,economicSnapshots:[]});
  assert.equal(empty.status,'unavailable');assert.equal(empty.predictions.length,0);
  assert.match(empty.reason,/No point-in-time/);
  const noPublication=clone(base);delete noPublication.ethRows[300].publishedAt;
  assert.equal(model(noPublication).status,'unavailable');
  const noMetric=clone(base);delete noMetric.economicSnapshots.at(-1).metrics.executionBurnEth;
  assert.equal(model(noMetric).status,'unavailable');
  assert.ok(ETH_ECONOMIC_INPUT_SCHEMA.snapshot.required.includes('publishedAt'));
});

test('direct horizons use mature, disjoint labels and preserve the distinction between ETHUSD and ETHBTC',()=>{
  assert.equal(result.status,'ready');
  assert.equal(result.predictions.length,3);
  assert.equal(result.method.alphaOrigin,'fixed analyst regularization, not selected using future performance');
  for(const train of result.training){
    assert.ok(train.eligibleOrigins>=16);
    assert.equal(train.publicAndCollectedByOrigin,true);
    assert.equal(train.labelWindowsOverlap,false);
    assert.equal(train.independentMarketRegimes,null);
    assert.ok(train.maximumLabelDate<=base.asOf);
    for(let i=1;i<train.origins.length;i++)assert.ok(train.origins[i-1].targetDate<=train.origins[i].originDate);
  }
  for(const p of result.predictions){
    assert.equal(p.status,'ready');assert.ok(p.price>0&&p.ethBtcRatio>0);
    assert.notEqual(p.logReturn,p.relativeLogReturn);
    assert.equal(p.interval,null);assert.equal(p.probability,null);assert.equal(p.calibrated,false);assert.equal(p.defaultEligible,false);
  }
});

test('future prices, future economic bytes and revisions unavailable at their historical origin cannot alter this forecast',()=>{
  const next=clone(base),futureDate=afterDay(base.asOf,1),futureTime=afterDay(base.asOf,2)+'T00:00:00.000Z';
  next.ethRows.push({...next.ethRows.at(-1),date:futureDate,price:-1,publishedAt:futureTime,collectedAt:futureTime});
  next.btcRows.push({...next.btcRows.at(-1),date:futureDate,price:Infinity,publishedAt:futureTime,collectedAt:futureTime});
  next.economicSnapshots.push({...clone(next.economicSnapshots.at(-1)),observedThrough:futureDate,metrics:{},publishedAt:futureTime,collectedAt:futureTime});
  assert.deepEqual(model(next),result);
  const late=clone(base),lastOrigin=result.training.find(t=>t.horizonDays===30).lastOrigin;
  const prior=clone(late.economicSnapshots.filter(s=>s.observedThrough<=lastOrigin).at(-1));
  prior.vintageId='synthetic-later-revision';prior.sourceHash='b'.repeat(64);
  prior.publishedAt=result.issuedAt;prior.collectedAt=result.issuedAt;prior.metrics.executionFeesEth*=2;
  late.economicSnapshots.push(prior);
  assert.deepEqual(model(late),result);
});

test('current economic inputs change price predictions while training scaling and fitted coefficients remain frozen',()=>{
  const changed=clone(base);changed.economicSnapshots.at(-1).metrics.executionFeesEth*=1.2;
  const next=model(changed);
  assert.equal(next.status,'ready');
  assert.deepEqual(next.coefficients,result.coefficients);
  assert.deepEqual(next.training,result.training);
  assert.ok(next.predictions.some((p,i)=>Math.abs(p.price-result.predictions[i].price)>1e-6));
  for(const contribution of next.contributions){
    const p=next.predictions.find(x=>x.horizonDays===contribution.horizonDays);
    const absolute=contribution.intercept+contribution.features.reduce((sum,f)=>sum+f.logReturnContribution,0);
    const relative=contribution.relativeIntercept+contribution.features.reduce((sum,f)=>sum+f.relativeLogReturnContribution,0);
    assert.ok(Math.abs(absolute-p.logReturn)<1e-12);
    assert.ok(Math.abs(relative-p.relativeLogReturn)<1e-12);
    assert.ok(Math.abs(p.price-next.currentInput.observedEthUsd*Math.exp(absolute))<1e-9);
  }
});

test('fee capture, burn and issuance reach different mathematical features without adding rollup L1 payments twice',()=>{
  const changed=clone(base);changed.economicSnapshots.at(-1).metrics.l2SettlementFeesEth*=1.1;
  const next=model(changed),before=result.contributions[0].features,after=next.contributions[0].features;
  const value=(features,id)=>features.find(f=>f.id===id).value;
  assert.equal(value(before,'l1FeeYield'),value(after,'l1FeeYield'));
  assert.equal(value(before,'netSupplyRate'),value(after,'netSupplyRate'));
  assert.ok(value(after,'l2CaptureRatio')>value(before,'l2CaptureRatio'));
  const m=base.economicSnapshots.at(-1).metrics;
  assert.equal(value(before,'netSupplyRate'),(m.consensusNetIssuanceEth+m.executionPowIssuanceEth-m.executionBurnEth-m.blobBurnEth)/m.supplyEth);
  assert.equal(value(before,'l1FeeYield'),(m.executionFeesEth+m.blobFeesEth)/m.supplyEth);
  const inconsistent=clone(base);inconsistent.economicSnapshots.at(-1).metrics.blobBurnEth=0;
  assert.equal(model(inconsistent).status,'unavailable');
});

test('missing days, delayed current releases and ambiguous revisions fail closed',()=>{
  const gap=clone(base);gap.ethRows.splice(gap.ethRows.length-8,1);
  assert.equal(model(gap).status,'unavailable');
  const delayed=clone(base),latest=delayed.economicSnapshots.at(-1);
  latest.publishedAt=afterDay(base.asOf,2)+'T00:00:00.000Z';latest.collectedAt=latest.publishedAt;
  assert.equal(model(delayed).status,'unavailable');
  const conflicting=clone(base),duplicate=clone(conflicting.economicSnapshots.at(-1));
  duplicate.metrics.executionFeesEth*=1.1;conflicting.economicSnapshots.push(duplicate);
  assert.equal(model(conflicting).status,'unavailable');
  const universe=clone(base);universe.economicSnapshots.at(-1).l2UniverseId='different-universe';
  assert.equal(model(universe).status,'unavailable');
});

test('refit ablations and conditional sensitivities are finite and a constant feature has no attributed effect',()=>{
  const constant=clone(base);
  for(const s of constant.economicSnapshots)s.metrics.l1GasUsed=1e9;
  const next=model(constant);
  assert.equal(next.status,'ready');
  for(const c of next.coefficients){
    const f=c.ethUsd.features.find(f=>f.id==='l1Usage');
    assert.ok(Math.abs(f.coefficientPerTrainingSd)<1e-10);
  }
  for(const a of next.ablations){
    assert.equal(a.features.length,ETH_ECONOMIC_FEATURES.length);
    assert.match(a.interpretation,/not out-of-sample/);
    assert.ok(Math.abs(a.features.find(f=>f.id==='l1Usage').logReturnDifference)<1e-10);
    assert.ok(a.features.every(f=>Number.isFinite(f.logReturnDifference)&&Number.isFinite(f.relativeLogReturnDifference)));
  }
});

test('short data and unsupported long-horizon extrapolation remain unavailable',()=>{
  const short=model(fixture(300));
  assert.equal(short.status,'unavailable');
  assert.ok(short.predictions.every(p=>p.status==='unavailable'));
  assert.equal(model({...base,horizons:[365]}).status,'unavailable');
  assert.equal(model({...base,issuedAt:base.asOf+'T12:00:00.000Z'}).status,'unavailable');
  assert.equal(model({...base,issuedAt:'2025-02-31T00:00:00Z'}).status,'unavailable');
});

test('earned staking return has measured deductions and reaches a fitted channel separate from issuance',()=>{
  const m=base.economicSnapshots.at(-1).metrics;
  assert.equal(featureValue(result,'netStakingYield'),(m.stakingConsensusRewardsEth-m.stakingConsensusPenaltiesEth+m.stakingPriorityFeesEth+m.stakingMevExcludingPriorityEth-m.stakingServiceFeesEth-m.stakingOperatingCostsEth)/m.averageRewardEligibleStakeEth);
  const costs=clone(base);costs.economicSnapshots.at(-1).metrics.stakingOperatingCostsEth=30000;
  const next=model(costs);
  assert.equal(next.status,'ready');assert.ok(featureValue(next,'netStakingYield')<0);
  assert.equal(featureValue(next,'netSupplyRate'),featureValue(result,'netSupplyRate'));
  assert.deepEqual(next.coefficients,result.coefficients);
  assert.ok(next.predictions.some((p,i)=>Math.abs(p.price-result.predictions[i].price)>1e-6));
  const missing=clone(base);delete missing.economicSnapshots.at(-1).metrics.stakingMevExcludingPriorityEth;
  assert.equal(model(missing).status,'unavailable');
  const duplicatePolicy=clone(base);duplicatePolicy.economicSnapshots.at(-1).stakingRewardAccounting='gross-builder-payments-plus-priority';
  assert.equal(model(duplicatePolicy).status,'unavailable');
});

test('completed exit duration and unique underlying collateral are separate fitted channels',()=>{
  for(const [metric,id] of [['completedExitMedianWaitDays','completedExitWait'],['uniqueStakingClaimCollateralEth','uniqueCollateralShare']]){
    const changed=clone(base);changed.economicSnapshots.at(-1).metrics[metric]*=1.2;
    const next=model(changed);
    assert.equal(next.status,'ready');assert.ok(featureValue(next,id)>featureValue(result,id));
    for(const unchanged of ['exitQueueShare','stakedShare','netSupplyRate','netStakingYield'])assert.equal(featureValue(next,unchanged),featureValue(result,unchanged));
    assert.deepEqual(next.coefficients,result.coefficients);
    assert.ok(next.predictions.some((p,i)=>Math.abs(p.price-result.predictions[i].price)>1e-6));
  }
  const m=base.economicSnapshots.at(-1).metrics;
  assert.equal(featureValue(result,'completedExitWait'),Math.log1p(m.completedExitMedianWaitDays));
  assert.equal(featureValue(result,'uniqueCollateralShare'),(m.uniqueNativeCollateralEth+m.uniqueStakingClaimCollateralEth)/m.supplyEth);
  const noCompleted=clone(base);noCompleted.economicSnapshots.at(-1).metrics.completedExitCount=0;
  assert.equal(model(noCompleted).status,'unavailable');
  const impossible=clone(base);impossible.economicSnapshots.at(-1).metrics.uniqueNativeCollateralEth=m.supplyEth;
  assert.equal(model(impossible).status,'unavailable');
  const policy=clone(base);policy.economicSnapshots.at(-1).collateralAccounting='gross-receipt-tvl';
  assert.equal(model(policy).status,'unavailable');
  const changedUniverse=clone(base);changedUniverse.economicSnapshots.at(-1).stakingCohortId='different-cohort';
  assert.equal(model(changedUniverse).status,'unavailable');
});

test('same-vintage receipt timestamp conflicts fail identically in either array order',()=>{
  for(const key of ['ethRows','economicSnapshots']){
    const observedKey=key==='ethRows'?'date':'observedThrough';
    for(const field of ['publishedAt','collectedAt']){
      const original=clone(base[key][100]),duplicate=clone(original);
      const later=afterDay(original[observedKey],2)+'T00:00:00.000Z';
      duplicate[field]=later;
      if(field==='publishedAt')duplicate.collectedAt=later;
      for(const versions of [[original,duplicate],[duplicate,original]]){
        const changed=clone(base);
        changed[key].splice(100,1,...versions);
        const output=model(changed);
        assert.equal(output.status,'unavailable');assert.match(output.reason,/Conflicting .*vintage identity/);
      }
    }
  }
});

test('unexpected internal errors propagate instead of becoming unavailable economic data',()=>{
  const input=clone(base),sentinel=new Error('sentinel internal failure');
  Object.defineProperty(input.economicSnapshots[0],'metrics',{get(){throw sentinel;}});
  assert.throws(()=>model(input),error=>error===sentinel);
});

test('comparator preserves synthetic source receipts and scores the separately predicted ETHBTC target',()=>{
  const issuedAtByOrigin=Object.fromEntries(base.ethRows.map(row=>[row.date,afterDay(row.date,1)+'T00:05:00.000Z']));
  const report=runEthereumModelComparison({
    ethHistory:base.ethRows,btcHistory:base.btcRows,economicSnapshots:base.economicSnapshots,issuedAtByOrigin,
  },{asOf:base.asOf});
  const economic=report.current.candidates.economic;
  assert.equal(economic.status,'ready');
  assert.equal(economic.currentInput.sourceHash,base.economicSnapshots.at(-1).sourceHash);
  assert.equal(economic.issuedAt,issuedAtByOrigin[base.asOf]);
  assert.ok(economic.predictions.some(p=>Number.isFinite(p.ethBtcRatio)&&p.ethBtcRatio>0));
  const scored=report.relativeStrength.cases.filter(c=>Number.isFinite(c.predictions.economic)&&c.actual>0);
  assert.ok(scored.length>0);
  for(const c of scored){
    assert.equal(c.unit,'BTC per ETH');assert.ok(c.predictions.economic>0);
    assert.ok(c.targetDate<=base.asOf);assert.ok(c.actual>0);
  }
  const pending=report.relativeStrength.cases.filter(c=>Number.isFinite(c.predictions.economic)&&c.targetDate>base.asOf);
  assert.ok(pending.length>0);
  assert.ok(pending.every(c=>c.actual===null&&c.status==='pending'));
  assert.ok(report.relativeStrength.summaries.some(s=>s.model==='economic'&&s.completedOutcomes>0));
});

test('PoW issuance is required, retained in early supply flows and zero in fully post-Merge windows',()=>{
  const missing=clone(base);delete missing.economicSnapshots.at(-1).metrics.executionPowIssuanceEth;
  assert.equal(model(missing).status,'unavailable');
  const postMerge=clone(base);postMerge.economicSnapshots.at(-1).metrics.executionPowIssuanceEth=1;
  const rejected=model(postMerge);
  assert.equal(rejected.status,'unavailable');assert.match(rejected.reason,/fully post-Merge/);
  const early={...clone(base),asOf:'2021-12-31',horizons:[30]};
  const before=model(early);
  assert.equal(before.status,'ready');
  const m=early.economicSnapshots.filter(s=>s.observedThrough<=early.asOf).at(-1).metrics;
  m.executionPowIssuanceEth=12345;
  const after=model(early);
  assert.equal(after.status,'ready');
  assert.ok(featureValue(after,'netSupplyRate')>featureValue(before,'netSupplyRate'));
  assert.equal(featureValue(after,'netSupplyRate'),(m.consensusNetIssuanceEth+m.executionPowIssuanceEth-m.executionBurnEth-m.blobBurnEth)/m.supplyEth);
  assert.deepEqual(after.coefficients,before.coefficients);
  // The transition day is mixed; reject only windows wholly after that UTC day.
  for(const [asOf,expected] of [['2022-10-12','ready'],['2022-10-13','unavailable']]){
    const input={...clone(base),asOf,horizons:[30]};
    const snapshot=clone(input.economicSnapshots.filter(x=>x.observedThrough<=asOf).at(-1));
    snapshot.observedThrough=asOf;snapshot.vintageId='synthetic-transition-'+asOf;
    snapshot.publishedAt=afterDay(asOf,1)+'T00:00:00.000Z';snapshot.collectedAt=snapshot.publishedAt;
    snapshot.metrics.executionPowIssuanceEth=1;
    input.economicSnapshots=input.economicSnapshots.filter(x=>x.observedThrough!==asOf);
    input.economicSnapshots.push(snapshot);
    assert.equal(model(input).status,expected,'28-day transition boundary '+asOf);
  }
});
