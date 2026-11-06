import test from 'node:test';
import assert from 'node:assert/strict';
import { backtestRsi } from '@atlas/domain/rsi-backtest';
import { calculateRsiSeries } from '@atlas/domain/market-lab';
import type { Point } from '@atlas/contracts/market-lab';
import { searchSymbols,createSymbolUrl } from '../../dist/symbol-selector.js';
const values=[...Array.from({length:20},(_,i)=>100+i),...Array.from({length:18},(_,i)=>116-i*3),...Array.from({length:20},(_,i)=>68+i*4)];
const prices:Point[]=values.map((v,i)=>[new Date(Date.UTC(2025,0,i+1)).toISOString().slice(0,10),v]);
const options={start:prices[0][0],end:prices.at(-1)![0],capital:1000,buy:33.5,sell:43,feeBps:10};
test('backtest fills only the next observed close and independently reconciles cash, fees and open valuation',()=>{
  const result=backtestRsi(prices,options), rows=calculateRsiSeries(prices);
  assert.equal(result.trades.length,2);
  const [buy,sell]=result.trades;
  assert.equal(buy.side,'Buy');assert.equal(sell.side,'Sell');
  for(const trade of result.trades) {
    const at=prices.findIndex(p=>p[0]===trade.date);assert.equal(prices[at-1][0],trade.signalDate);assert.equal(trade.price,prices[at][1]);
    const signal=rows[at-1],before=rows[at-2];
    if(trade.side==='Buy')assert(before.rsi!>33.5 && signal.rsi!<=33.5);else assert(before.rsi!<43 && signal.rsi!>=43);
  }
  const qty=1000/1.001/buy.price, final=qty*sell.price*.999;
  assert.equal(buy.quantity,qty);assert.equal(result.finalEquity,final);assert.equal(result.cash,final);assert.equal(result.quantity,0);
  assert.equal(sell.pnl,final-1000);assert.equal(result.closedTrades,1);
  const max=Math.max(1000,...result.equity.map(p=>p[1]));assert(result.maxDrawdownPct>0 && result.maxDrawdownPct<100);assert(max>=1000);
});
test('period end never fills a pending signal or closes an open position; future rows cannot rewrite a prefix',()=>{
  const full=backtestRsi(prices,options), buy=full.trades[0],buyIndex=prices.findIndex(p=>p[0]===buy.date);
  const pending=backtestRsi(prices,{...options,end:buy.signalDate});assert.equal(pending.trades.length,0);assert.deepEqual(pending.pending,{date:buy.signalDate,side:'Buy'});
  const end=prices[buyIndex+3][0], retained=backtestRsi(prices,{...options,end}),prefix=backtestRsi(prices.slice(0,buyIndex+4),{...options,end});
  assert.deepEqual(retained,prefix);assert.equal(retained.quantity,buy.quantity);assert.equal(retained.closedTrades,0);assert.equal(retained.winRatePct,null);
  assert.equal(retained.finalEquity,buy.quantity*prices[buyIndex+3][1]);
});
test('invalid dates, inverted thresholds, missing warmup and unsupported symbols fail explicitly',()=>{
  for(const changed of [{start:'2025-02-30'},{buy:50,sell:40},{capital:0},{feeBps:-1},{start:'2030-01-01'},{end:'2024-01-01'}])assert.throws(()=>backtestRsi(prices,{...options,...changed}));
  assert.throws(()=>backtestRsi(prices.slice(0,10),options));
  assert.deepEqual(searchSymbols('삼플레').map(s=>s.symbol),['TQQQ','SOXL','233740']);
  assert.equal(searchSymbols('속쓸')[0].symbol,'SOXL');assert.equal(searchSymbols('코스닥150')[0].symbol,'233740');
  assert.equal(new URL(createSymbolUrl('https://example.com/?page=outlook&axis=log','SOXL')).pathname,'/market-lab/charts/');
  assert.equal(createSymbolUrl('https://example.com/market-lab/rsi/?symbol=TQQQ','BTCUSD'),'https://example.com/');
});
