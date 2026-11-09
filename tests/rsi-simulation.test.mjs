import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {simulateRsiTranches} from '../packages/domain/src/rsi-simulation.js';
import {backtestRsi} from '../packages/domain/src/rsi-backtest.js';
import {calculateRsiSeries} from '../packages/domain/src/market-lab-math.js';

const points = values => values.map((close,index)=>[new Date(Date.UTC(2025,0,index+1)).toISOString().slice(0,10),close]);
const prices=points([...Array.from({length:20},(_,i)=>100+i),...Array.from({length:18},(_,i)=>116-i*3),...Array.from({length:20},(_,i)=>68+i*4)]);
const base={start:prices[0][0],end:prices.at(-1)[0],confirmedThrough:prices.at(-1)[0],capital:1000,feeBps:5,weights:[.5,.5],updatedAt:'2025-03-01T00:00:00Z'};
const near=(a,b)=>assert(Math.abs(a-b)<=1e-10*Math.max(1,Math.abs(b)),`${a} != ${b}`);
const economic = result => {
  const {excludedUnconfirmed,excludedAfterEnd,requestedEnd,confirmedThrough,...rest}=result;
  return rest;
};

test('split fills follow the ordered states at next completed close and cash reconciles both entry and exit costs',()=>{
  const result=simulateRsiTranches(prices,base),[b1,b2,s1,s2]=result.trades;
  assert.deepEqual(result.trades.map(t=>[t.side,t.tranche,t.signalDate,t.date]),[
    ['Buy',1,'2025-01-27','2025-01-28'],['Buy',2,'2025-01-28','2025-01-29'],
    ['Sell',1,'2025-02-11','2025-02-12'],['Sell',2,'2025-02-12','2025-02-13']]);
  // Independent cash arithmetic at the four actual observed fill prices.
  const q1=500/(95*1.0005),q2=500/(92*1.0005);
  const proceeds1=q1*84*.9995,proceeds2=q2*88*.9995;
  near(b1.quantity,q1);near(b2.quantity,q2);near(s1.fee,q1*84*.0005);near(s2.fee,q2*88*.0005);
  near(s1.pnl,proceeds1-500);near(s2.pnl,proceeds2-500);
  near(result.finalEquity,proceeds1+proceeds2);near(result.cash,result.finalEquity);
  near(result.metrics.realizedPnl,result.cash-base.capital);
  assert.equal(result.quantity,0);assert.equal(result.averageCost,null);assert.equal(result.state,'flat');
  assert.equal(result.metrics.closedTranches,2);assert.equal(result.metrics.losses,2);assert.equal(result.metrics.winRatePct,0);
  assert.equal(result.metrics.averageHoldingDays,15);assert.equal(result.metrics.profitFactor,0);
  let high=base.capital,mdd=0;
  for(const [,value] of result.equity){high=Math.max(high,value);mdd=Math.max(mdd,(high-value)/high*100);}
  near(result.metrics.maxDrawdownPct,mdd);
  for(const trade of result.trades){const index=prices.findIndex(([date])=>date===trade.date);assert.equal(prices[index-1][0],trade.signalDate);assert.equal(trade.price,prices[index][1]);}
});

test('unconfirmed suffix cannot generate signals, fills, valuation, scores or indicator warmup',()=>{
  for(const through of ['2025-01-27','2025-01-28','2025-01-29','2025-02-11','2025-02-12']){
    const prefix=prices.filter(([date])=>date<=through);
    const withTail=simulateRsiTranches(prices,{...base,confirmedThrough:through});
    const standalone=simulateRsiTranches(prefix,{...base,end:through,confirmedThrough:through});
    assert.deepEqual(economic(withTail),economic(standalone));
    const hostileTail=prices.map(([date,close])=>[date,date>through?close*1e10:close]);
    assert.deepEqual(economic(simulateRsiTranches(hostileTail,{...base,confirmedThrough:through})),economic(standalone));
    assert(withTail.trades.every(trade=>trade.date<=through));assert.equal(withTail.usedThrough,through);
    assert.equal(withTail.currentPrice,prefix.at(-1)[1]);assert(withTail.excludedUnconfirmed>0);
  }
  const finalSignal=simulateRsiTranches(prices,{...base,confirmedThrough:'2025-01-27'});
  assert.equal(finalSignal.trades.length,0);assert.equal(finalSignal.quantity,0);
  assert.deepEqual(finalSignal.pending,[{date:'2025-01-27',side:'Buy',tranche:1,level:33.5}]);
});

test('open positions are valued separately, never force-closed or included in win-rate n',()=>{
  const both=simulateRsiTranches(prices,{...base,end:'2025-01-29'});
  assert.equal(both.state,'both');assert.equal(both.holdings.length,2);
  assert.equal(both.metrics.closedTranches,0);assert.equal(both.metrics.winRatePct,null);assert.equal(both.metrics.ongoingTranches,2);
  const qty=500/(95*1.0005)+500/(92*1.0005);
  near(both.quantity,qty);near(both.averageCost,1000/qty);
  near(both.averagePrice,(500/1.0005+500/1.0005)/qty);
  near(both.unrealizedPnl,qty*92*.9995-1000);
  near(both.finalEquity,qty*92);assert.equal(both.assumptions.unrealizedPnl,'net-of-entry-and-assumed-exit-cost');
  assert.equal(both.updatedAt,base.updatedAt);
  assert.deepEqual(both.nextTriggers.map(t=>[t.side,t.tranche,t.level]),[['Sell',1,40]]);
  near(both.nextTriggers[0].difference,40-both.currentRsi);
  const partial=simulateRsiTranches(prices,{...base,end:'2025-02-12'});
  assert.equal(partial.state,'remaining');assert.equal(partial.holdings[0].tranche,2);
  assert.equal(partial.metrics.closedTranches,1);assert.equal(partial.metrics.ongoingTranches,1);
  assert.equal(partial.pending[0].side,'Sell');assert.equal(partial.pending[0].tranche,2);
});

test('gaps crossing both levels retain one ordered signal per confirmed bar without waiting for a recross',()=>{
  const gap=points([...Array.from({length:20},(_,i)=>100+i),20,21,22,23,24,200,210,220]);
  const result=simulateRsiTranches(gap,{...base,end:gap.at(-1)[0],confirmedThrough:gap.at(-1)[0]});
  const rows=calculateRsiSeries(gap);
  assert(rows[20].rsi<29.5);assert(rows[21].rsi<29.5&&rows[21].rsi>rows[20].rsi);
  assert(rows[25].rsi>43);assert(rows[26].rsi>43);
  assert.deepEqual(result.trades.map(t=>[t.side,t.tranche,t.date]),[
    ['Buy',1,'2025-01-22'],['Buy',2,'2025-01-23'],['Sell',1,'2025-01-27'],['Sell',2,'2025-01-28']]);
  assert.equal(new Set(result.trades.map(t=>t.signalDate)).size,result.trades.length);
  assert.equal(result.metrics.winRatePct,100);assert.equal(result.metrics.profitFactor,null);
  assert.equal(result.metrics.profitFactorStatus,'no-losses');
});

test('allocation edits change real quantities and costs while identical signals retain their own sample counts',()=>{
  const halves=simulateRsiTranches(prices,base),weighted=simulateRsiTranches(prices,{...base,weights:[.7,.3]});
  near(weighted.trades[0].quantity,700/(95*1.0005));near(weighted.trades[1].quantity,300/(92*1.0005));
  assert.deepEqual(weighted.trades.map(t=>[t.date,t.side]),halves.trades.map(t=>[t.date,t.side]));
  assert.equal(weighted.metrics.closedTranches,halves.metrics.closedTranches);
  near(weighted.metrics.profitFactor,halves.metrics.profitFactor);
  assert.notEqual(weighted.finalEquity,halves.finalEquity);
  const noCost=simulateRsiTranches(prices,{...base,feeBps:0});assert(noCost.finalEquity>halves.finalEquity);
  assert(noCost.trades.every(trade=>trade.fee===0));
});

test('remaining second tranche blocks a fresh first entry and unused cash survives a first-only cycle',()=>{
  const recovery=points([...Array.from({length:20},(_,i)=>100+i),...Array.from({length:18},(_,i)=>116-i*3),68,72,76,80,80.5,50,51,100,101]);
  const blocked=simulateRsiTranches(recovery,{...base,end:recovery.at(-1)[0],confirmedThrough:recovery.at(-1)[0]});
  const rows=calculateRsiSeries(recovery);
  assert(rows.find(row=>row.date==='2025-02-13').rsi<29.5);
  assert.deepEqual(blocked.trades.map(t=>[t.side,t.tranche]),[['Buy',1],['Buy',2],['Sell',1],['Sell',2]]);
  const remaining=simulateRsiTranches(recovery,{...base,end:'2025-02-14',confirmedThrough:'2025-02-14'});
  assert.equal(remaining.state,'remaining');assert.deepEqual(remaining.pending,[]);
  assert.deepEqual(remaining.nextTriggers.map(t=>[t.side,t.tranche]),[['Sell',2]]);
  const firstOnly=points([...Array.from({length:20},(_,i)=>100+i),...Array.from({length:7},(_,i)=>116-i*3),100,104,108]);
  const single=simulateRsiTranches(firstOnly,{...base,end:firstOnly.at(-1)[0],confirmedThrough:firstOnly.at(-1)[0]});
  assert.equal(single.metrics.closedTranches,1);assert.equal(single.closed[0].tranche,1);
  near(single.cash,500+(500/(100*1.0005))*108*.9995);
  assert.equal(single.state,'flat');assert.equal(single.quantity,0);
});

test('dates, confirmed boundary, allocation, cost and missing history fail safely',()=>{
  for(const change of [{start:'2025-02-30'},{end:'2024-01-01'},{confirmedThrough:undefined},{confirmedThrough:'bad'},
    {capital:0},{feeBps:-1},{feeBps:1001},{weights:[.5,.6]},{weights:[0,1]},{updatedAt:'not-a-date'}]){
    assert.throws(()=>simulateRsiTranches(prices,{...base,...change}),RangeError);
  }
  const result=simulateRsiTranches(prices.slice(0,10),base);
  assert.equal(result.status,'insufficient');assert.equal(result.metrics.winRatePct,null);assert.equal(result.metrics.maxDrawdownPct,null);
  assert.deepEqual(result.trades,[]);assert.equal(result.finalEquity,base.capital);
});

test('retained TQQQ reference matches single-entry51/70.6/PF2.77 and declares the split-state interpretation',()=>{
  const snapshot=JSON.parse(readFileSync(new URL('../dist/data/market-lab.json',import.meta.url),'utf8'));
  const input=snapshot.markets.find(market=>market.id==='tqqq').prices.filter(([date])=>date<='2026-10-30');
  const options={start:'2010-02-11',end:'2026-10-30',confirmedThrough:'2026-10-30',capital:10000,feeBps:5};
  const single=backtestRsi(input,{...options,buy:33.5,sell:40});
  let entryCost=0;const returns=[];
  for(const trade of single.trades){if(trade.side==='Buy')entryCost=trade.quantity*trade.price+trade.fee;else returns.push(trade.pnl/entryCost);}
  const gain=returns.filter(value=>value>0).reduce((a,b)=>a+b,0),loss=-returns.filter(value=>value<0).reduce((a,b)=>a+b,0);
  assert.equal(single.closedTrades,51);assert.equal(single.winRatePct.toFixed(1),'70.6');assert.equal((gain/loss).toFixed(2),'2.77');
  const split=simulateRsiTranches(input,options);
  assert.equal(split.assumptions.signal,'initial-down-cross-then-active-state-level');
  assert.equal(split.assumptions.gapPolicy,'one-state-per-confirmed-bar');
  // The supplied 63 / 68.3 reference lacks a gap/recross ledger. Keep the
  // explicit strategy's independently reproducible result; never force it.
  assert.equal(split.metrics.closedTranches,66);assert.equal(split.metrics.wins,48);
  assert.equal(split.metrics.winRatePct.toFixed(1),'72.7');
  assert.equal(split.metrics.profitFactor.toFixed(2),'3.38');
  assert.equal(split.holdings.length,0);
});
