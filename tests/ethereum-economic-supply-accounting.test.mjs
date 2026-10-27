import test from 'node:test';
import assert from 'node:assert/strict';
import {ETH_ECONOMIC_VERSION,ETH_ECONOMIC_INPUT_SCHEMA,ETH_ECONOMIC_SOURCES,buildEthereumEconomicCandidate,
  ethereumEconomicNetSupplyRate,inspectEthereumEconomicSnapshots} from '../dist/ethereum-economic-model.js';
import {inspectEthereumEconomicEvidence} from '../dist/ethereum-economic-evidence-coverage.js';
import {fixture} from './helpers/eth-economic-fixture.mjs';

test('input-4 separates non-fee destruction from fees, consensus penalties and funded inaccessible balances',()=>{
  assert.equal(ETH_ECONOMIC_VERSION,'eth-economic-ridge-6');
  assert.equal(ETH_ECONOMIC_INPUT_SCHEMA.snapshot.metricDefinitionVersion,'eth-economic-input-4');
  assert.equal(Object.keys(ETH_ECONOMIC_INPUT_SCHEMA.metrics).length,26);
  assert.match(ETH_ECONOMIC_INPUT_SCHEMA.metrics.otherExecutionBurnEth.definition,/transfers to funded addresses/);
  assert.equal(ETH_ECONOMIC_SOURCES.find(s=>s.id==='eip-6780').blobSha,'1b6a0e94cc47e859b9866e570391cf37dc55059a');
  const metrics={consensusNetIssuanceEth:12,executionPowIssuanceEth:3,executionBurnEth:2,blobBurnEth:1,otherExecutionBurnEth:4,supplyEth:100};
  assert.equal(ethereumEconomicNetSupplyRate(metrics),.08);
  metrics.consensusNetIssuanceEth=-12;
  assert.equal(ethereumEconomicNetSupplyRate(metrics),-.16);
});

test('missing, null, negative or nonfinite destruction is not a measured zero',()=>{
  const m=fixture(64).economicSnapshots.at(-1).metrics;
  for(const value of [undefined,null,-1,NaN,Infinity]){
    assert.throws(()=>ethereumEconomicNetSupplyRate({...m,otherExecutionBurnEth:value}),/otherExecutionBurnEth/);
  }
  const explicitZero=ethereumEconomicNetSupplyRate({...m,otherExecutionBurnEth:0});
  assert.equal(explicitZero,(m.consensusNetIssuanceEth+m.executionPowIssuanceEth-m.executionBurnEth-m.blobBurnEth)/m.supplyEth);
});

test('full input-3 snapshots cannot obtain input-4 eligibility by adding a default zero',()=>{
  const f=fixture(64),legacy=structuredClone(f.economicSnapshots.at(-1));
  legacy.metricDefinitionVersion='eth-economic-input-3';
  const r=inspectEthereumEconomicSnapshots({economicSnapshots:[legacy],asOf:f.asOf});
  assert.equal(r.status,'invalid-input');assert.match(r.reason,/cannot be silently upgraded/);
  legacy.metricDefinitionVersion='eth-economic-input-4';delete legacy.metrics.otherExecutionBurnEth;
  assert.match(inspectEthereumEconomicSnapshots({economicSnapshots:[legacy],asOf:f.asOf}).reason,/otherExecutionBurnEth/);
  legacy.metrics.otherExecutionBurnEth=0;delete legacy.metricSourceUrls.otherExecutionBurnEth;
  assert.match(inspectEthereumEconomicSnapshots({economicSnapshots:[legacy],asOf:f.asOf}).reason,/source URL missing/);
});

test('measured destruction changes net supply without creating fee revenue or changing the calibration sample',()=>{
  const f=fixture(),prior=buildEthereumEconomicCandidate(f),changed=structuredClone(f);
  changed.economicSnapshots.at(-1).metrics.otherExecutionBurnEth=12345;
  const next=buildEthereumEconomicCandidate(changed),value=(r,id)=>r.contributions[0].features.find(x=>x.id===id).value;
  assert.equal(prior.status,'ready');assert.equal(next.status,'ready');
  assert.deepEqual(next.training,prior.training);assert.deepEqual(next.coefficients,prior.coefficients);
  assert.equal(value(next,'netSupplyRate'),ethereumEconomicNetSupplyRate(changed.economicSnapshots.at(-1).metrics));
  assert(value(next,'netSupplyRate')<value(prior,'netSupplyRate'));
  for(const id of ['l1FeeYield','l2CaptureRatio','netStakingYield','stakedShare'])assert.equal(value(next,id),value(prior,id));
  assert(next.predictions.some((p,i)=>p.price!==prior.predictions[i].price));
});

test('provider absence remains a twenty-sixth missing measurement rather than an equation-only correction',()=>{
  const r=inspectEthereumEconomicEvidence({asOf:'2026-10-26',issuedAt:'2026-10-27T12:00:00Z'});
  const other=r.metrics.find(m=>m.metric==='otherExecutionBurnEth');
  assert.equal(r.version,'eth-economic-evidence-coverage-2');assert.equal(r.metricDefinitionVersion,'eth-economic-input-4');
  assert.equal(other.status,'not-observed');assert.equal(other.evidence.length,0);
  assert(other.gaps.gapCodes.includes('fork-aware-trace-state-reconciliation'));
  assert.equal(r.fullModelSnapshotReady,false);assert.equal(r.modelInputActivated,false);
});
