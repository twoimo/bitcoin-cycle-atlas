import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';
import {parseHTML} from 'linkedom';
import {mountMobileWorkspace} from '../dist/mobile-workspace.js';
import {openEthForecastReplayJournal} from '../scripts/verify-forecast-replay-browser.mjs';

// Exercise the shipped mobile menu's event route. This fixture supplies its
// visibility boundary; pixel geometry and native pointer input remain the job
// of the unchanged real-Chrome click contract and the four replay cases.
function fixture(t,{mobile=false}={}){
  const {document,window}=parseHTML(`<html><body>
    <aside class="atlas-sidebar"><button class="atlas-brand">가격 차트</button></aside>
    <main class="workspace"><section class="stage">
      <header class="atlas-canvas-heading"><button id="workbench-scenario" data-eth-action="forecast">미래 가정</button></header>
      <div class="atlas-plot"></div>
    </section><aside class="workbench-rail"></aside></main>
    <aside id="chart-reader" hidden></aside>
    <dialog id="eth-data-dialog"><button data-open-asset-forecast-journal="ETHUSD">보존한 연구 발행본</button></dialog>
    <dialog id="asset-forecast-journal"></dialog>
  </body></html>`);
  const original=Object.getOwnPropertyDescriptor(globalThis,'matchMedia');
  Object.defineProperty(globalThis,'matchMedia',{configurable:true,value:()=>({matches:mobile,addEventListener(){},removeEventListener(){}})});
  const workspace=document.querySelector('.workspace'),stage=document.querySelector('.stage'),plot=document.querySelector('.atlas-plot');
  const reader=document.querySelector('#chart-reader'),rail=document.querySelector('.workbench-rail');
  const forecast=document.querySelector('[data-eth-action="forecast"]'),research=document.querySelector('#eth-data-dialog'),journal=document.querySelector('#asset-forecast-journal');
  const calls=[],opened=[];
  function painted(node){
    if(!node?.isConnected||node.closest('[hidden],[inert],[aria-hidden="true"]'))return false;
    if(node===forecast)return !mobile;
    if(node.id==='mobile-details-toggle')return mobile;
    if(rail.contains(node))return mobile&&rail.dataset.mobileOpen==='true';
    const owner=node.closest('dialog');return !owner||owner.hasAttribute('open');
  }
  forecast.checkVisibility=()=>painted(forecast);
  function openResearch(opener){
    opened.push(opener);
    document.dispatchEvent(new window.CustomEvent('atlas:modal-open',{detail:{id:research.id}}));
    research.setAttribute('open','');
  }
  forecast.onclick=()=>openResearch(forecast);
  document.addEventListener('atlas:open-detail',event=>{
    assert.equal(event.detail.kind,'scenarios');
    openResearch(event.detail.opener);
  });
  research.querySelector('button').onclick=()=>{research.removeAttribute('open');journal.setAttribute('open','');};
  const controller=mountMobileWorkspace({workspace,stage,plot,reader,closeReader(){reader.hidden=true;}});
  t.after(()=>{
    controller.destroy();
    if(original)Object.defineProperty(globalThis,'matchMedia',original);else Reflect.deleteProperty(globalThis,'matchMedia');
  });
  const api={cdp:{},
    async evaluate(_cdp,fn,...args){return vm.runInNewContext(`(${fn.toString()})(...args)`,{document,args});},
    async until(read,label){const value=await read();assert.ok(value,label);return value;},
    async click(_cdp,selector){
      const node=document.querySelector(selector);
      assert.ok(painted(node),'Native click cannot reach hidden control '+selector);
      assert.ok(!node.disabled,'Native click cannot reach disabled control '+selector);
      calls.push(selector);node.click();
    }
  };
  return {document,window,api,rail,forecast,research,journal,calls,opened};
}

test('desktop replay entry reaches the saved journal through its visible research button',async t=>{
  const f=fixture(t),entry=await openEthForecastReplayJournal(f.api);
  assert.equal(entry.route,'toolbar');
  assert.deepEqual(entry.controls,['[data-eth-action="forecast"]','#eth-data-dialog[open] [data-open-asset-forecast-journal="ETHUSD"]']);
  assert.deepEqual(f.calls,entry.controls);assert.deepEqual(f.opened,[f.forecast]);
  assert.equal(f.journal.hasAttribute('open'),true);assert.equal(f.research.hasAttribute('open'),false);
});

test('phone replay entry and reopen use the actual details tray while the desktop hook stays hidden',async t=>{
  const f=fixture(t,{mobile:true}),toggle=f.document.querySelector('#mobile-details-toggle');
  await assert.rejects(f.api.click(f.api.cdp,'[data-eth-action="forecast"]'),/hidden control/);
  for(let attempt=0;attempt<2;attempt++){
    const entry=await openEthForecastReplayJournal(f.api);
    assert.equal(entry.route,'mobile-details');
    assert.deepEqual(entry.controls,['#mobile-details-toggle','[data-mobile-target="#workbench-scenario"]','#eth-data-dialog[open] [data-open-asset-forecast-journal="ETHUSD"]']);
    assert.equal(f.opened.at(-1),toggle,'The shipped menu supplies a visible return-focus owner');
    assert.equal(f.journal.hasAttribute('open'),true);assert.equal(f.research.hasAttribute('open'),false);
    assert.equal(toggle.getAttribute('aria-expanded'),'false');assert.equal(f.rail.dataset.mobileOpen,undefined);
    assert.equal(f.forecast.checkVisibility(),false,'The checker must not expose the hidden desktop control');
    f.journal.removeAttribute('open');
  }
  assert.equal(f.opened.length,2);assert.equal(f.calls.length,6);
  assert.ok(!f.calls.includes('[data-eth-action="forecast"]'));
});

test('an unavailable forecast action fails native entry instead of bypassing the mobile capability gate',async t=>{
  const f=fixture(t,{mobile:true});
  f.document.dispatchEvent(new f.window.CustomEvent('atlas:workbench-state',{detail:{intraday:true}}));
  await assert.rejects(openEthForecastReplayJournal(f.api),/hidden control/);
  assert.deepEqual(f.calls,['#mobile-details-toggle']);assert.deepEqual(f.opened,[]);
  assert.equal(f.journal.hasAttribute('open'),false);
});

test('entry still waits for the real ETH forecast owner before choosing either visible route',async t=>{
  const f=fixture(t,{mobile:true});f.forecast.remove();
  await assert.rejects(openEthForecastReplayJournal(f.api),/ETH forecast action/);
  assert.deepEqual(f.calls,[]);assert.deepEqual(f.opened,[]);
});
