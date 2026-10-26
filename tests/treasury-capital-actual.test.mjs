import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {buildTreasuryAssetPaths} from '../dist/treasury-asset-paths.js';
import {buildTreasuryForecasts} from '../dist/treasury-model.js';
import {REVIEWED_MSTR_INSTRUMENTS} from '../dist/treasury-instruments.js';

test('current MSTR paths reconcile converted claims, actual reviewed shares and coupon cessation under all capital policies',async()=>{
  const read=async name=>JSON.parse(await readFile(new URL(`../dist/data/${name}.json`,import.meta.url),'utf8'));
  const history=await read('mstr-ohlc'),btcHistory=await read('btc-daily'),asOf=history.candles.at(-1).date.slice(0,10);
  const assets=buildTreasuryAssetPaths({symbol:'MSTR',btcHistory,asOf}),coinAnchor={date:asOf,price:assets.scenarios.base.path[0].price};
  const near=(a,b)=>assert.ok(Math.abs(a-b)<=1e-7+1e-10*Math.max(1,Math.abs(a),Math.abs(b)),`${a} != ${b}`);
  let conversions=0;
  for(const capitalPolicy of ['cash-at-put','hold-to-maturity','convert-at-window']){
    const forecasts=buildTreasuryForecasts({symbol:'MSTR',history,asOf,endYear:2035,assetPaths:assets,coinAnchor,capitalPolicy});
    for(const forecast of Object.values(forecasts)){
      const events=forecast.instrumentEvents,settlement=new Map(events.map(event=>[event.id,event]));
      assert.equal(settlement.size,events.length,'each instrument settles at most once');
      for(const event of events.filter(item=>item.kind==='converted')){
        const terms=REVIEWED_MSTR_INSTRUMENTS.find(item=>item.id===event.id);
        assert.ok(event.date>=terms.conversion.from&&event.date<=terms.conversion.modelWindowEnd);
        near(event.shares,terms.conversion.sharesAtSnapshot);conversions++;
      }
      for(let index=0;index<forecast.path.length;index++){
        const point=forecast.path[index],prior=forecast.path[index-1];
        const settled=events.filter(event=>event.date<=point.date);
        near(point.components.debtUsd,6_713_659_000-settled.reduce((sum,event)=>sum+event.faceUsd,0));
        near(point.components.convertedShares,settled.reduce((sum,event)=>sum+(event.shares||0),0));
        if(!prior||prior.valuationState==='absorbed')continue;
        const expectedCarry=forecast.instruments.residualAnnualCarry+REVIEWED_MSTR_INSTRUMENTS.filter(item=>!settlement.has(item.id)||settlement.get(item.id).date>prior.date).reduce((sum,item)=>sum+item.faceUsd*item.couponRate,0);
        near(point.components.totalFinancingCost-prior.components.totalFinancingCost,expectedCarry/365.25);
      }
    }
  }
  assert.ok(conversions>0,'the actual input scenario exercises eligible conversions, not only synthetic fixtures');
});
