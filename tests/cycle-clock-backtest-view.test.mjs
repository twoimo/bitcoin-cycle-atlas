import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {parseHTML} from 'linkedom';
import {buildCycleClockBacktest} from '../dist/cycle-clock-backtest.js';
import {mountCycleClockBacktest} from '../dist/cycle-clock-backtest-view.js';

const dataset=JSON.parse(await readFile(new URL('../dist/data/btc-daily.json',import.meta.url),'utf8'));
const deferred=()=>{let resolve;return {promise:new Promise(r=>{resolve=r;}),resolve};};
function fixture(options={}){
  const {document}=parseHTML('<html><body><button id="trigger">백테스트</button><div id="plot"></div></body></html>');
  const trigger=document.querySelector('#trigger'),plot=document.querySelector('#plot');
  const computer={run:async(data,opts)=>({status:'ready',model:buildCycleClockBacktest(data,opts)}),cancel(){},destroy(){}};
  const mounted=mountCycleClockBacktest({plot,trigger,getDataset:()=>dataset,computer,...options});
  return {document,plot,mounted,q:key=>plot.querySelector('[data-cb="'+key+'"]')};
}

test('actual goal, exclusions, low selection and unscored conditional clock stay distinct',async()=>{
  const h=fixture();await h.mounted.open();assert.match(h.q('status').textContent,/보정 쌍비교 1 사이클.*9 \/ 65 원점.*무보정만 21.*기준점 없음 9.*미종료 26/);
  assert.match(h.q('target-meta').textContent,/2021-11-08.*2024-04-20.*쌍비교 9/);assert.match(h.q('rows').innerHTML,/-5일/);
  const conditional=h.q('current').querySelector('details');conditional.setAttribute('open','');
  for(const option of h.q('target').querySelectorAll('option'))option.removeAttribute('selected');
  h.q('target').querySelector('option[value="halving-2020:trough"]').setAttribute('selected','');h.q('target').onchange();
  assert.match(h.q('target-meta').textContent,/저점 2022-11-09/);assert.match(h.q('rows').innerHTML,/-6일/);assert.equal(h.q('current').querySelector('details'),conditional);assert.equal(conditional.hasAttribute('open'),true);
  h.q('excluded').onclick();assert.match(h.q('rows').textContent,/다음 반감기 구간 미종료/);assert.equal(h.q('target').disabled,true);assert.match(h.q('summary').textContent,/21.56/);
  assert.match(h.q('current').textContent,/채점 제외/);h.mounted.destroy();
});

test('corrupt worker results fail visibly without retaining an earlier score, then retry succeeds',async()=>{
  let corrupt=false;
  const computer={run:async(data,opts)=>{const model=structuredClone(buildCycleClockBacktest(data,opts));if(corrupt)model.summary[0].uniqueTargetCount=8;return {status:'ready',model};},cancel(){},destroy(){}};
  const h=fixture({computer});await h.mounted.open();assert.equal(h.plot.querySelector('.clock-backtest').dataset.state,'ready');
  corrupt=true;await h.mounted.open();assert.equal(h.plot.querySelector('.clock-backtest').dataset.state,'error');assert.match(h.q('status').textContent,/확인 실패/);assert.equal(h.q('summary').innerHTML,'');assert.equal(h.q('export').disabled,true);
  corrupt=false;await h.mounted.open();assert.match(h.q('status').textContent,/보정 쌍비교 1 사이클/);assert.equal(h.q('export').disabled,false);h.mounted.destroy();
});

test('a cancelled delayed dataset cannot replace a newer visible result or export',async()=>{
  const pending=deferred();let calls=0,blob;
  const newer={...dataset,prices:dataset.prices.filter(([date])=>date<='2024-04-20')};
  const h=fixture({getDataset:()=>++calls===1?pending.promise:newer});
  const prior=URL.createObjectURL;URL.createObjectURL=value=>{blob=value;return 'blob:clock-test';};
  try{
    const first=h.mounted.open();h.mounted.close({focus:false});await h.mounted.open();pending.resolve(dataset);await first;
    assert.match(h.q('clock').textContent,/2024-04-20/);h.q('export').onclick();const result=JSON.parse(await blob.text());assert.equal(result.asOf,'2024-04-20');assert.equal(result.evaluationPrices.at(-1)[0],'2024-04-20');
  }finally{URL.createObjectURL=prior;h.mounted.destroy();}
});

test('missing observed data remains an error; an empty eligible goal set is a genuine empty result',async()=>{
  let data=null;const h=fixture({getDataset:()=>data});await h.mounted.open();assert.equal(h.plot.querySelector('.clock-backtest').dataset.state,'error');assert.match(h.q('status').textContent,/관측 가격/);
  data={...dataset,prices:dataset.prices.filter(([date])=>date<='2016-07-08')};await h.mounted.open();assert.equal(h.plot.querySelector('.clock-backtest').dataset.state,'ready');assert.match(h.q('target-meta').textContent,/채점 가능한 종료 목표가 없습니다/);assert.match(h.q('rows').textContent,/검토 원점 없음/);h.mounted.destroy();
});


test('early targets show baseline-only and no-clock states without invented adjusted scores',async()=>{
  const h=fixture();await h.mounted.open();
  const pick=value=>{for(const o of h.q('target').querySelectorAll('option'))o.removeAttribute('selected');h.q('target').querySelector('option[value="'+value+'"]').setAttribute('selected','');h.q('target').onchange();};
  const details=h.q('coverage').querySelector('details');details.setAttribute('open','');
  pick('halving-2016:peak');assert.match(h.q('target-meta').textContent,/2017-12-16.*무보정 15.*쌍비교 0/);assert.match(h.q('rows').textContent,/종료된 참고 사이클 없음/);assert.match(h.q('rows').textContent,/무보정만/);
  assert.equal(h.q('rows').querySelectorAll('tr').length,15);assert.ok([...h.q('rows').querySelectorAll('tr')].every(r=>r.children[3].textContent.startsWith('—')&&r.children[5].textContent==='—'));
  pick('halving-2012:trough');assert.match(h.q('target-meta').textContent,/무보정 0.*쌍비교 0/);assert.match(h.q('rows').textContent,/観測|관측 반감기 이전/);assert.match(h.q('rows').textContent,/시계 없음/);
  assert.equal(h.q('coverage').querySelector('details'),details);assert.equal(details.hasAttribute('open'),true);assert.match(h.q('coverage').textContent,/과거 목표 3.*무보정 2.*쌍비교 1/);h.mounted.destroy();
});
