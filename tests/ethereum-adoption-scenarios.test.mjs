import test from 'node:test';
import assert from 'node:assert/strict';
import {ethereumAgentDemand} from '../dist/ethereum-adoption-scenarios.js';
const base={paidRequestsPerDay:1000000,ethereumShare:.25,settlementsPerRequest:.01,l1DirectShare:.05,
  l1GasPerSettlement:50000,l2L1GasPerSettlement:100,blobGasPerSettlement:500,
  executionBaseFeeGwei:1,blobBaseFeeGwei:.01,priorityFeeGwei:.1,ethPriceUsd:2500,workingBalanceDays:7};
test('AI accounting separates payment requests, L1 resource burn and validator tips with explicit units',()=>{
  const r=ethereumAgentDemand(base),N=365*1000000*.25*.01;
  assert.equal(r.annualSettlements,N);
  assert.equal(r.annualExecutionBurnEth,N*(.05*50000+.95*100)*1e-9);
  assert.equal(r.annualBlobBurnEth,N*.95*500*.01*1e-9);
  assert.equal(r.annualPriorityFeesEth,N*(.05*50000+.95*100)*.1*1e-9);
  assert.equal(r.workingBalanceEth,r.annualL1FeesEth*7/365);
  assert.equal(r.priceForecast,null);assert.equal(r.netSupplyChangeEth,null);assert.equal(r.observed,false);
});
test('request adoption and batching can exactly cancel while zero adoption creates no fabricated demand',()=>{
  const a=ethereumAgentDemand(base),b=ethereumAgentDemand({...base,paidRequestsPerDay:base.paidRequestsPerDay*10,settlementsPerRequest:base.settlementsPerRequest/10});
  for(const k of ['annualSettlements','annualBurnEth','workingBalanceEth'])assert.equal(a[k],b[k]);
  for(const key of ['paidRequestsPerDay','ethereumShare','settlementsPerRequest']){
    const zero=ethereumAgentDemand({...base,[key]:0});assert.equal(zero.annualBurnEth,0);assert.equal(zero.workingBalanceEth,0);
  }
  const double=ethereumAgentDemand({...base,paidRequestsPerDay:2*base.paidRequestsPerDay});
  assert.equal(double.annualBurnEth,2*a.annualBurnEth);
});
test('L1/L2 endpoint units and price denomination do not manufacture additional ETH',()=>{
  const l1=ethereumAgentDemand({...base,l1DirectShare:1}),l2=ethereumAgentDemand({...base,l1DirectShare:0});
  assert.equal(l1.annualBlobBurnEth,0);
  assert.equal(l2.annualExecutionBurnEth,l2.annualSettlements*base.l2L1GasPerSettlement*1e-9);
  const a=ethereumAgentDemand(base),b=ethereumAgentDemand({...base,ethPriceUsd:base.ethPriceUsd*2});
  assert.equal(a.annualBurnEth,b.annualBurnEth);assert.equal(a.workingBalanceEth,b.workingBalanceEth);
  assert.equal(b.annualL1FeesUsd,2*a.annualL1FeesUsd);
});
test('absent, invalid and unbounded economic assumptions are rejected instead of filled with zero',()=>{
  for(const key of Object.keys(base))for(const value of [undefined,null,-1,NaN,Infinity])assert.throws(()=>ethereumAgentDemand({...base,[key]:value}),/finite|positive/);
  for(const key of ['ethereumShare','l1DirectShare'])assert.throws(()=>ethereumAgentDemand({...base,[key]:1.01}),/\[0,1\]/);
  assert.throws(()=>ethereumAgentDemand({...base,ethPriceUsd:0}),/positive/);
  assert.throws(()=>ethereumAgentDemand({...base,paidRequestsPerDay:1e16}),/budget/);
});
