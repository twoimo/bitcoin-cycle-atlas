import test from 'node:test';
import assert from 'node:assert/strict';
import {parseHTML} from 'linkedom';
import {mountMonthlyBacktest} from '../dist/monthly-backtest-view.js';
import {frozenReplayArchive} from './helpers/frozen-replay-fixture.mjs';
import {createCutoffBacktestForecast} from '../dist/replay-cutoff-forecast.js';
import {forecastHash} from '../dist/forecast-records.js';

const evaluatedAt='2026-11-04T00:00:00Z';
const archive=await frozenReplayArchive();
const files={'test-model.js':'a'.repeat(64)},identity={files,hash:await forecastHash(files)};
function fixture(options={}){
  const {document}=parseHTML('<html><body><button id="trigger">月</button><div id="plot"></div></body></html>');
  const records=new Map(),store={get:async k=>records.get(k),putIfAbsent:async(k,v)=>{if(!records.has(k))records.set(k,v);return records.get(k);}};
  const computer={run:async p=>({status:'ready',model:await createCutoffBacktestForecast(p)}),cancel(){},destroy(){}};
  const trigger=document.querySelector('#trigger'),plot=document.querySelector('#plot');
  const mounted=mountMonthlyBacktest({plot,trigger,loadArchive:async()=>archive,loadIdentity:async()=>identity,storeFactory:()=>store,computer,openReplay:async()=>{},...options});
  const q=name=>plot.querySelector('[data-mb="'+name+'"]');
  q('metric').querySelector('option').setAttribute('selected','');
  return {document,mounted,q,plot};
}

test('a late cancelled archive cannot replace the current export or source clock',async()=>{
  let resolveOld,calls=0,exported;
  const old=new Promise(resolve=>{resolveOld=resolve;});
  const acquiredAt=new Date().toISOString();
  const newer={...archive,observedAt:acquiredAt,observedThrough:'2026-11-01',source:{...archive.source,collectedAt:acquiredAt,sourceObservedThrough:'2026-11-01'},observations:[...archive.observations,{...archive.observations.at(-1),date:'2026-11-01',open:50000,high:50000,low:50000,close:50000,price:50000}]};
  const h=fixture({loadArchive:()=>++calls===1?old:Promise.resolve(newer)}),priorUrl=URL.createObjectURL;
  URL.createObjectURL=blob=>{exported=blob;return 'blob:monthly-test';};
  try{
    const pending=h.mounted.open();h.mounted.close({focus:false});
    await h.mounted.open();resolveOld(archive);await pending;
    assert.match(h.q('clock').textContent,/2026-11-01/);assert.match(h.q('status').textContent,/실패 0/);
    h.q('export').onclick();const payload=JSON.parse(await exported.text());
    assert.equal(payload.observedThrough,'2026-11-01');assert.equal(payload.evaluationPrices.at(-1)[0],'2026-11-01');
  }finally{URL.createObjectURL=priorUrl;h.mounted.destroy();}
});

test('unavailable persistence remains an error and a retry can create and retain valid records',async()=>{
  let fail=true;
  const h=fixture({storeFactory:()=>{if(fail)throw new Error('storage unavailable');const records=new Map();return {get:async k=>records.get(k),putIfAbsent:async(k,v)=>{if(!records.has(k))records.set(k,v);return records.get(k);}};}});
  await h.mounted.open();assert.equal(h.plot.querySelector('.monthly-backtest').dataset.state,'error');assert.match(h.q('status').textContent,/storage unavailable/);assert.equal(h.q('export').disabled,true);
  fail=false;await h.mounted.open();assert.equal(h.plot.querySelector('.monthly-backtest').dataset.state,'ready');assert.match(h.q('status').textContent,/실패 0/);assert.equal(h.q('export').disabled,false);h.mounted.destroy();
});
