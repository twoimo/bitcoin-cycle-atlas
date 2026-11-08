import test from 'node:test';
import assert from 'node:assert/strict';
import { parseHTML } from 'linkedom';
import { createChartWorkbenchControls, createRsiWorkbenchControls } from '../../dist/rsi-workbench-controls.js';
test('perimeter commands belong to the acknowledged instrument and epoch, and BTC labels/listeners restore exactly',async t=>{
  const {document,window}=parseHTML('<html><body><header class="atlas-canvas-heading"><button id="workbench-chart-type" aria-label="BTC candles">line</button><fieldset id="workbench-frequency"><button data-lab-frequency="daily">1D</button><button data-lab-frequency="weekly">1W</button></fieldset></header><aside class="workbench-tools"><button data-chart-tool="pan">H</button></aside><nav class="workbench-detail-tools"><button data-reader="selection">data</button></nav><footer class="workbench-bottom-bar"><button data-chart-span="focus">4년</button><span id="workbench-range-label">BTC range</span><button id="workbench-scale">로그</button><button id="atlas-update-status" aria-label="BTC update">BTC clock</button><button id="atlas-display-options" data-reader="settings">settings</button><button id="workbench-go-date" aria-label="UTC date">date</button></footer></body></html>');
  const previous=Object.getOwnPropertyDescriptor(globalThis,'document');Object.defineProperty(globalThis,'document',{value:document,configurable:true});
  const oldObserver=Object.getOwnPropertyDescriptor(globalThis,'MutationObserver');Object.defineProperty(globalThis,'MutationObserver',{value:window.MutationObserver,configurable:true});
  let active=true,legacyClicks=0;const sent:unknown[]=[];const adapter=createRsiWorkbenchControls({send:(value:unknown)=>sent.push(value),isActive:()=>active});
  t.after(()=>{adapter.destroy();if(oldObserver)Object.defineProperty(globalThis,'MutationObserver',oldObserver);else Reflect.deleteProperty(globalThis,'MutationObserver');if(previous)Object.defineProperty(globalThis,'document',previous);else Reflect.deleteProperty(globalThis,'document');});
  // Linkedom does not model native capture-before-target ordering. Test the
  // document command boundary here; actual target interception is checked in IAB.
  const button=document.querySelector('#workbench-chart-type')!;document.addEventListener('click',event=>{if(event.target===button)legacyClicks++;});
  const nativeClock=document.createElement('span');nativeClock.textContent='BTC clock';document.querySelector('#atlas-update-status')!.replaceChildren(nativeClock);
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
  assert.equal(document.querySelector('#atlas-update-status')!.firstChild,nativeClock,'restoration preserves source-owned descendants and their listeners');
});

test('shared chart perimeter respects HYPE units and monthly housing capabilities and restores native options',t=>{
  const {document,window}=parseHTML('<html><body><header class="atlas-canvas-heading"><button id="workbench-chart-type">line</button><select id="workbench-interval-select"><option value="hourly">1H</option><option value="daily">1D</option><option value="weekly">1W</option></select></header><nav class="workbench-detail-tools"><button id="history-journal-toggle">history</button><button id="workbench-next-turn">signal</button></nav><footer class="workbench-bottom-bar"><span id="workbench-range-label">BTC</span><span class="workbench-zone">UTC</span><button id="workbench-go-date">date</button><button id="atlas-update-status">BTC clock</button></footer></body></html>');
  const previous=new Map(['document','MutationObserver'].map(key=>[key,Object.getOwnPropertyDescriptor(globalThis,key)]));
  Object.defineProperty(globalThis,'document',{value:document,configurable:true});Object.defineProperty(globalThis,'MutationObserver',{value:window.MutationObserver,configurable:true});
  // Linkedom exposes a getter-only select.value; native selection is covered
  // by the browser suite. Keep the value slot faithful for the host protocol.
  const interval=document.querySelector('#workbench-interval-select') as HTMLSelectElement;
  Object.defineProperty(interval,'value',{value:'hourly',writable:true,configurable:true});
  const sent:Record<string,unknown>[]=[];
  const adapter=createChartWorkbenchControls({send:(value:Record<string,unknown>)=>sent.push(value),isActive:()=>true});
  t.after(()=>{adapter.destroy();for(const [key,value]of previous){if(value)Object.defineProperty(globalThis,key,value);else Reflect.deleteProperty(globalThis,key);}});
  const ready={kind:'atlas:chart-state',symbol:'HYPE',epoch:2,ready:true,unit:'USDC',timezone:'UTC',start:'2025-01-01',end:'2026-01-01',first:'2024-11-29',last:'2026-01-01',selected:'2026-01-01',close:24.2,frequency:'daily',frequencies:['daily','weekly'],scale:'log',chartType:'candles',tool:'crosshair',magnet:'off',autoScale:true,candles:true,volume:true,canUndo:false,canRedo:false,measurement:false,records:true,recordsLabel:'판정 기록',nextSignal:false,pane:null};
  adapter.begin('HYPE',2);
  assert.equal(adapter.update({...ready,unit:'USD'}),false,'USDC cannot silently become USD');
  assert.equal(adapter.update({...ready,frequencies:['daily','hourly']}),false,'unsupported intraday data cannot become a display option');
  assert.equal(adapter.update(ready),true);assert.equal(interval.value,'daily');
  assert.equal((document.querySelector('#history-journal-toggle') as HTMLButtonElement).hidden,false,'HYPE keeps its only textual record action');
  assert.equal(document.querySelector('.workbench-zone')!.textContent,'UTC');
  assert.equal((document.querySelector('#workbench-next-turn') as HTMLButtonElement).disabled,true);
  assert.equal(document.querySelector('#history-journal-toggle')!.getAttribute('aria-label'),'HYPE 판정 기록');
  adapter.command('frequency','hourly');assert.equal(sent.length,0);
  adapter.command('frequency','weekly');assert.equal(sent.at(-1)?.value,'weekly');
  adapter.command('next-signal');assert.equal(sent.length,1,'there is no fabricated RSI signal for HYPE');

  adapter.begin('HOUSING-SEOUL',3);
  const housing={...ready,symbol:'HOUSING-SEOUL',epoch:3,unit:'지수',timezone:'Asia/Seoul',frequency:'monthly',frequencies:['monthly'],first:'2006-01-01',last:'2026-09-01',end:'2026-09-01',selected:'2026-09-01',close:null,priceLast:'2026-08-01',volumeLast:'2026-09-01',chartType:'line',candles:false,recordsLabel:'월별 기록'};
  assert.equal(adapter.update({...housing,candles:true}),false);
  assert.equal(adapter.update(housing),true,'a volume-only month keeps its missing price');
  assert.equal(interval.value,'monthly');assert.equal(interval.querySelector('[value=monthly]')!.textContent,'1M');
  assert.equal((document.querySelector('#workbench-chart-type') as HTMLButtonElement).disabled,true);
  assert.match(document.querySelector('#workbench-chart-type')!.getAttribute('aria-description')||'',/OHLC 자료가 없어/,'the retained unsupported slot explains its disabled state');
  assert.equal(document.querySelector('#atlas-update-status')!.getAttribute('aria-label'),'HOUSING-SEOUL 가격지수 2026-08 · 거래량 2026-09 · 자료 출처');
  assert.equal(document.querySelector('#workbench-range-label')!.textContent,'2025-01 ~ 2026-09');
  assert.equal(adapter.update({...housing,symbol:'HOUSING-BUSAN'}),false,'another region cannot acquire this perimeter');
  adapter.command('frequency','daily');adapter.command('type');assert.equal(sent.length,1);
  adapter.command('tab','records');assert.deepEqual(sent.at(-1),{kind:'atlas:center-command',symbol:'HOUSING-SEOUL',epoch:3,action:'tab',value:'records'});
  const tray=document.createElement('button');tray.className='mobile-workbench-button';tray.setAttribute('aria-expanded','true');document.body.append(tray);
  tray.onclick=()=>tray.setAttribute('aria-expanded','false');
  adapter.command('pane','date');assert.equal(tray.getAttribute('aria-expanded'),'false','keyboard/command panes close the mobile tray before taking focus');
  adapter.restore();assert.equal(interval.querySelector('[value=monthly]'),null);assert.equal(interval.value,'hourly');
  assert.equal(document.querySelector('#atlas-update-status')!.textContent,'BTC clock');assert.equal(document.body.dataset.chartControls,undefined);
});
