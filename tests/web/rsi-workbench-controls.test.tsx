import test from 'node:test';
import assert from 'node:assert/strict';
import { parseHTML } from 'linkedom';
import { createRsiWorkbenchControls } from '../../dist/rsi-workbench-controls.js';
test('perimeter commands belong to the acknowledged instrument and epoch, and BTC labels/listeners restore exactly',async t=>{
  const {document,window}=parseHTML('<html><body><header class="atlas-canvas-heading"><button id="workbench-chart-type" aria-label="BTC candles">line</button><fieldset id="workbench-frequency"><button data-lab-frequency="daily">1D</button><button data-lab-frequency="weekly">1W</button></fieldset></header><aside class="workbench-tools"><button data-chart-tool="pan">H</button></aside><nav class="workbench-detail-tools"><button data-reader="selection">data</button></nav><footer class="workbench-bottom-bar"><button data-chart-span="focus">4년</button><span id="workbench-range-label">BTC range</span><button id="workbench-scale">로그</button><button id="atlas-update-status" aria-label="BTC update">BTC clock</button><button id="atlas-display-options" data-reader="settings">settings</button><button id="workbench-go-date" aria-label="UTC date">date</button></footer></body></html>');
  const previous=Object.getOwnPropertyDescriptor(globalThis,'document');Object.defineProperty(globalThis,'document',{value:document,configurable:true});
  const oldObserver=Object.getOwnPropertyDescriptor(globalThis,'MutationObserver');Object.defineProperty(globalThis,'MutationObserver',{value:window.MutationObserver,configurable:true});
  let active=true,legacyClicks=0;const sent:unknown[]=[];const adapter=createRsiWorkbenchControls({send:(value:unknown)=>sent.push(value),isActive:()=>active});
  t.after(()=>{adapter.destroy();if(oldObserver)Object.defineProperty(globalThis,'MutationObserver',oldObserver);else Reflect.deleteProperty(globalThis,'MutationObserver');if(previous)Object.defineProperty(globalThis,'document',previous);else Reflect.deleteProperty(globalThis,'document');});
  // Linkedom does not model native capture-before-target ordering. Test the
  // document command boundary here; actual target interception is checked in IAB.
  const button=document.querySelector('#workbench-chart-type')!;document.addEventListener('click',event=>{if(event.target===button)legacyClicks++;});
  const ready={kind:'atlas:rsi-state',symbol:'TQQQ',epoch:9,ready:true,unit:'USD',timezone:'America/New_York',start:'2025-01-01',end:'2026-01-01',first:'2010-02-11',last:'2026-01-01',selected:'2026-01-01',close:62.01,frequency:'daily',scale:'log',chartType:'line',tool:'crosshair',magnet:'off',autoScale:true,candles:true,canUndo:false,canRedo:false,measurement:false,pane:null};
  adapter.begin('TQQQ',9);assert.equal(adapter.update({...ready,epoch:8}),false);assert.equal(adapter.update({...ready,symbol:'SOXL'}),false);
  assert.equal(adapter.update({...ready,start:'2025-02-30'}),false);assert.equal(adapter.update({...ready,close:Infinity}),false);
  assert.equal(adapter.update(ready),true);assert.equal(document.querySelector('[data-chart-span=focus]')!.textContent,'1년');
  assert.equal(document.querySelector('#atlas-update-status')!.getAttribute('aria-label'),'TQQQ 마지막 제공 관측 2026-01-01 · 자료 출처');
  assert.equal(document.querySelector('#workbench-go-date')!.getAttribute('aria-label'),'TQQQ 뉴욕 거래일·기간으로 이동 · Alt+G');
  document.querySelector('[data-chart-tool=pan]')!.dispatchEvent(new window.Event('click',{bubbles:true,cancelable:true}));
  assert.deepEqual(sent.at(-1),{kind:'atlas:center-command',symbol:'TQQQ',epoch:9,action:'tool',value:'pan'});
  button.dispatchEvent(new window.Event('click',{bubbles:true,cancelable:true}));assert.equal(legacyClicks,0);
  document.querySelector('#atlas-display-options')!.dispatchEvent(new window.Event('click',{bubbles:true,cancelable:true}));assert.deepEqual(sent.at(-1),{kind:'atlas:center-command',symbol:'TQQQ',epoch:9,action:'pane',value:'settings'});
  document.querySelector('#atlas-update-status')!.setAttribute('aria-label','late BTC paint');await new Promise(resolve=>setTimeout(resolve,0));assert.equal(document.querySelector('#atlas-update-status')!.getAttribute('aria-label'),'TQQQ 마지막 제공 관측 2026-01-01 · 자료 출처');
  adapter.begin('SOXL',10);assert.equal(adapter.update(ready),false);assert.equal(document.querySelector('[data-chart-span=focus]')!.textContent,'4년');
  assert.equal(document.querySelector('#workbench-chart-type'),button,'the original node and attached listener survive');
  active=false;adapter.restore();assert.equal(document.querySelector('#atlas-update-status')!.getAttribute('aria-label'),'BTC update');assert.equal(document.querySelector('#atlas-update-status')!.textContent,'BTC clock');assert.equal(button.getAttribute('aria-label'),'BTC candles');button.dispatchEvent(new window.Event('click',{bubbles:true}));assert.equal(legacyClicks,1);
});
