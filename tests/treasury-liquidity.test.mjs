import test from 'node:test';
import assert from 'node:assert/strict';
import {createTreasuryLiquidity,advanceTreasuryLiquidity,requestTreasuryExit,sellLiquidCoins,addTreasuryCoins,liquidityUnits} from '../dist/treasury-liquidity.js';
import {fundCashOutflow,treasuryResidual} from '../dist/treasury-model.js';

const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-9*Math.max(1,Math.abs(b)),`${a} != ${b}`);
const initial=()=>createTreasuryLiquidity({coinUnits:100,stakedFraction:.8,asOf:'2026-10-23',exitDelayDays:7,rewardDelayDays:7});
test('a withdrawal request changes availability but preserves total assets',()=>{
  const pool=initial(),queued=requestTreasuryExit(pool,30);
  near(liquidityUnits(queued),100);near(queued.liquidUnits,20);near(queued.stakedUnits,50);
  assert.equal(queued.exitQueue[0].availableAt,'2026-10-30');
  assert.deepEqual(requestTreasuryExit(queued,30),queued,'repeated funding need does not duplicate the exit');
  const before=advanceTreasuryLiquidity(queued,{to:'2026-10-29'}),after=advanceTreasuryLiquidity(before,{to:'2026-10-30'});
  near(before.liquidUnits,20);near(after.liquidUnits,50);near(liquidityUnits(after),100);
  assert.equal(after.exitQueue.length,0);assert.equal(pool.stakedUnits,80);
});
test('net rewards multiply fees and remain unavailable until their declared sweep',()=>{
  const earned=advanceTreasuryLiquidity(initial(),{to:'2026-10-24',grossAnnualYield:.03,advisoryFee:.015,otherFee:.1});
  const expected=80*Math.expm1(Math.log1p(.03*.985*.9)/365.25);
  near(earned.rewardUnits,expected);near(earned.liquidUnits,20);
  assert.equal(earned.rewardAvailableAt,'2026-10-31');
  const released=advanceTreasuryLiquidity(earned,{to:'2026-10-31'});
  near(released.liquidUnits,20+expected);assert.equal(released.rewardUnits,0);
});
test('cash funding cannot sell locked units even when common residual is positive',()=>{
  const liquidity=initial(),state={coinUnits:100,cashUsd:0,shares:1,debtUsd:0,preferredUsd:0,otherLiabilitiesUsd:0,liquidity};
  const payment=fundCashOutflow(state,3000,100,0);
  near(payment.coinsSold,20);near(payment.shortfall,1000);near(payment.state.coinUnits,80);
  near(payment.state.liquidityArrearsUsd,1000);
  assert.equal(treasuryResidual(payment.state,100).insolvent,false);
  assert.throws(()=>sellLiquidCoins(liquidity,21),/Cannot sell/);
});
test('full coin funding cannot create a phantom arrear from floating-point round trips',()=>{
  const liquidity=createTreasuryLiquidity({coinUnits:1_000_000,stakedFraction:.8,asOf:'2026-10-23'});
  const state={coinUnits:1_000_000,cashUsd:0,shares:1,otherLiabilitiesUsd:0,liquidity};
  for(const price of [2.03,123.45,2326.75,1600.12,10000]){
    const payment=fundCashOutflow(state,83_250_000/365.25,price,.005);
    assert.equal(payment.shortfall,0,`available liquid units fully fund the cost at ${price}`);
    assert.equal(payment.state.liquidityArrearsUsd,0);
  }
  const empty={...state,coinUnits:0,liquidity:createTreasuryLiquidity({coinUnits:0,asOf:'2026-10-23'})};
  assert.equal(fundCashOutflow(empty,1e-12,1).shortfall,1e-12,'a real small deficit is not erased by a monetary epsilon');
});
test('purchases, reward releases and slash stresses conserve units with explicit losses',()=>{
  const bought=addTreasuryCoins(initial(),10,.8);near(liquidityUnits(bought),110);
  const queued=requestTreasuryExit(bought,20);
  const next=advanceTreasuryLiquidity(queued,{to:'2026-10-24',slashingFraction:.05});
  near(next.slashedUnits,88*.05);near(liquidityUnits(next),110-next.slashedUnits);
  near(next.liquidUnits,22);
});
test('liquidity parameters and time cannot silently introduce invalid state',()=>{
  assert.throws(()=>createTreasuryLiquidity({coinUnits:100,stakedFraction:1.1,asOf:'2026-10-23'}));
  assert.throws(()=>createTreasuryLiquidity({coinUnits:100,asOf:'2026-10-23',exitDelayDays:0}));
  assert.throws(()=>advanceTreasuryLiquidity(initial(),{to:'2026-10-22'}));
  assert.throws(()=>advanceTreasuryLiquidity(initial(),{to:'2026-10-24',advisoryFee:1.5}));
});
test('the shared treasury boundary rejects conflicting or malformed liquidity ledgers before any mutation',()=>{
  const liquidity=initial(),state={coinUnits:10,cashUsd:0,shares:1,debtUsd:0,otherLiabilitiesUsd:0,liquidity};
  assert.throws(()=>treasuryResidual(state,1),/liquidity|pool|reconcile/i);
  assert.throws(()=>fundCashOutflow(state,1,1),/liquidity|pool|reconcile/i);
  for(const bad of [{...liquidity,liquidUnits:-1},{...liquidity,rewardUnits:NaN},{...liquidity,exitQueue:[{units:1,requestedAt:'2026-10-23',availableAt:'2026-10-22'}]}])
    assert.throws(()=>treasuryResidual({...state,coinUnits:100,liquidity:bad},1));
});
test('unrestaked reward accrual is invariant to splitting the same fixed-principal elapsed period',()=>{
  const options={grossAnnualYield:.0258,advisoryFee:.015,otherFee:.1},start=Date.parse('2026-10-23');
  const once=advanceTreasuryLiquidity(initial(),{to:'2027-10-23',...options});
  let daily=initial();for(let i=1;i<=365;i++)daily=advanceTreasuryLiquidity(daily,{to:new Date(start+i*86400000).toISOString().slice(0,10),...options});
  near(once.totalRewards,daily.totalRewards);near(liquidityUnits(once),liquidityUnits(daily));
  near(once.stakedUnits,daily.stakedUnits);
  near(once.liquidUnits,daily.liquidUnits);near(once.rewardUnits,daily.rewardUnits);
  assert.equal(once.rewardAvailableAt,daily.rewardAvailableAt);
});
