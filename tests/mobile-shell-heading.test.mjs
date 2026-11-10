import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {parseHTML} from 'linkedom';
import {mountMobileShellHeading,shellFeatureContainer} from '../dist/ui/mobile-shell-heading.js';
import {mountShellSlots} from '../dist/ui/shell-slots.js';
import {mountCenterWorkbench} from '../dist/center-workbench.js';

// 2026-11-10 user contract: the phone perimeter is ONE 44px control dock.
// The previous 390px two-row grid expectation is intentionally replaced by the
// phone-dock contract below; disclosure ownership, node identity, handlers,
// values, focus and protected source controls stay asserted at 320/390/456/620.

const settle=()=>new Promise(resolve=>setImmediate(resolve));
function fixture(t,width=390){
  const {document,window}=parseHTML('<html><head></head><body data-shell="chart"><main id="app"><header class="atlas-canvas-heading"><button class="workbench-symbol">ETHUSD</button><div id="workbench-frequency"><select id="workbench-interval-select"><option>1D</option></select></div><button id="workbench-chart-type">선</button><button id="atlas-mode-menu">지표</button><div class="shell-instrument-slot" data-shell-key="instrument"><select id="equity-scenario" aria-label="조건부 전망 시나리오"><option value="base">기준 가정</option><option value="bull">채택 확대</option></select><button data-equity-action="forecast">미래 전망과 근거</button></div><button id="workbench-workspace">검색</button><button id="mobile-tools-toggle" class="mobile-workbench-button">도구</button><button id="mobile-details-toggle" class="mobile-workbench-button">정보</button></header><svg id="source-chart"><path d="M0 0L1 1"/></svg></main></body></html>');
  let focused=null;
  Object.defineProperty(document,'activeElement',{configurable:true,get:()=>focused});
  const prototype=window.HTMLElement.prototype,priorFocus=prototype.focus;
  prototype.focus=function(){focused=this;this.dispatchEvent(new window.Event('focusin',{bubbles:true}));};
  t.after(()=>{prototype.focus=priorFocus;});
  const listeners=new Set(),media={query:null,matches:width<=620,addEventListener(type,fn){if(type==='change')listeners.add(fn);},removeEventListener(type,fn){if(type==='change')listeners.delete(fn);}};
  window.matchMedia=query=>{media.query=query;return media;};
  const heading=document.querySelector('.atlas-canvas-heading'),feature=heading.querySelector('.shell-instrument-slot');
  const click=selector=>{const node=document.querySelector(selector);assert(node,selector);node.dispatchEvent(new window.Event('click',{bubbles:true,cancelable:true}));return node;};
  const resize=value=>{media.matches=value<=620;for(const fn of listeners)fn({matches:media.matches});};
  return {document,window,heading,feature,click,resize,listeners,media};
}

for(const width of [320,390,456,620])test(`${width}px shell disclosure preserves real control handlers, values and keyboard focus`,t=>{
  const f=fixture(t,width),{document,window,heading,feature}=f;
  const originals=[...feature.children],source=document.querySelector('#source-chart').outerHTML;
  const headingOrder=[...heading.childNodes];
  let delegated=0,changed=0;
  document.querySelector('#app').addEventListener('click',event=>{if(event.target.closest('[data-equity-action="forecast"]'))delegated++;});
  originals[0].addEventListener('change',()=>changed++);
  const controller=mountMobileShellHeading(document);t.after(()=>controller.destroy());
  controller.update({heading,feature,symbol:'BMNR'});
  assert.equal(f.media.query,'(max-width:620px)','the phone contract starts at 620px');
  assert.equal(heading.getAttribute('data-mobile-heading'),'phone-dock','the phone perimeter is one dock row, not the removed two-row grid');
  assert.equal(heading.querySelectorAll('[data-mobile-secondary]').length>=2,true,'chart-type and workspace controls join the same docking row');
  const container=[...shellFeatureContainer(feature).children];
  assert.ok(originals.every((node,index)=>container[index]===node),'original feature nodes keep their identity and order inside the disclosure');
  const docked=container.slice(originals.length);
  assert.equal(docked.length>=2,true,'the docked secondary controls join the disclosure actions, not a new row');
  assert.ok(docked.every(node=>node.hasAttribute('data-mobile-secondary')),'only marked secondary controls are docked here');
  assert.equal(document.querySelector('#atlas-shell-features-toggle').getAttribute('aria-label'),'BMNR 종목 기능 더 보기');
  assert.equal(document.querySelector('#atlas-shell-features-panel').hidden,true);
  f.click('#atlas-shell-features-toggle');
  assert.equal(document.querySelector('#atlas-shell-features-panel').hidden,false);
  assert.equal(document.activeElement,originals[0]);
  f.click('[data-equity-action="forecast"]');assert.equal(delegated,1,'native delegated handlers still receive the original node inside app');
  originals[0].querySelector('[value="bull"]').selected=true;originals[0].dispatchEvent(new window.Event('change',{bubbles:true}));assert.equal(changed,1);
  originals[1].focus();const escape=new window.Event('keydown',{bubbles:true,cancelable:true});escape.key='Escape';originals[1].dispatchEvent(escape);
  assert.equal(escape.defaultPrevented,true);assert.equal(document.querySelector('#atlas-shell-features-panel').hidden,true);
  assert.equal(document.activeElement,document.querySelector('#atlas-shell-features-toggle'));
  f.click('#atlas-shell-features-toggle');f.click('[data-shell-feature-close]');
  assert.equal(document.querySelector('#atlas-shell-features-toggle').getAttribute('aria-expanded'),'false');
  assert.equal(document.activeElement,document.querySelector('#atlas-shell-features-toggle'));
  assert.equal(originals[0].value,'bull');assert.equal(document.querySelector('#source-chart').outerHTML,source);
  f.resize(1024);
  assert.equal(heading.hasAttribute('data-mobile-heading'),false,'widening removes the phone dock');
  assert.equal(originals[0].value,'bull','the selected scenario survives the desktop restore');
  assert.deepEqual([...heading.childNodes],headingOrder,'desktop returns every docked secondary control to its original slot');
  assert.equal(document.querySelectorAll('[data-mobile-secondary]').length,0);
  assert.equal(delegated,1);
  f.resize(width);
  assert.equal(heading.getAttribute('data-mobile-heading'),'phone-dock','re-entering the phone width re-docks the same nodes');
  assert.equal(f.click('#atlas-shell-features-toggle').getAttribute('aria-label'),'BMNR 종목 기능 더 보기');
  f.click('[data-shell-feature-close]');
});

test('hosted controls keep their portal host, full source text and detail-return focus until desktop restoration',t=>{
  const f=fixture(t),{document,window,heading,feature}=f;
  document.body.dataset.centerTool='rsi';document.body.dataset.chartControls='ready';
  const host=document.createElement('div');host.className='center-workspace-toolbar';
  host.innerHTML='<button data-toolbar-open="rsi-observation">선택 2026-10-30 51.415 USD −2.97%</button><button data-rsi-view="backtest">백테스트</button>';
  feature.append(host);const originals=[...feature.childNodes],sourceText=host.textContent;
  const controller=mountMobileShellHeading(document);t.after(()=>controller.destroy());
  controller.update({heading,feature,symbol:'TQQQ'});f.click('#atlas-shell-features-toggle');
  const observation=host.firstElementChild;observation.focus();
  const dialog=document.createElement('dialog');dialog.setAttribute('open','');dialog.innerHTML='<button>상세 닫기</button>';document.body.append(dialog);
  dialog.firstElementChild.focus();dialog.firstElementChild.dispatchEvent(new window.Event('pointerdown',{bubbles:true}));
  assert.equal(document.querySelector('#atlas-shell-features-panel').hidden,false,'a source-owned modal can return to its still-visible source trigger');
  dialog.remove();observation.focus();
  f.resize(768);
  assert.equal(heading.hasAttribute('data-mobile-heading'),false);assert.equal(document.querySelector('#atlas-shell-features-panel'),null);
  assert.deepEqual([...feature.childNodes],originals,'desktop restores exact original child nodes and order');
  assert.equal(host.textContent,sourceText);assert.equal(document.activeElement,observation);
  f.resize(320);assert.equal(host.parentElement,shellFeatureContainer(feature));
  f.click('#atlas-shell-features-toggle');
  heading.querySelector('#mobile-tools-toggle').dispatchEvent(new window.Event('pointerdown',{bubbles:true}));
  assert.equal(document.querySelector('#atlas-shell-features-panel').hidden,true,'another primary action closes the disclosure without consuming that action');
});

test('late source controls enter the same disclosure and repeated shell refreshes settle without replacing hosts',async t=>{
  const f=fixture(t),{document,window:dom,heading,feature}=f;
  const controller=mountShellSlots(document);t.after(()=>controller.destroy());
  await settle();await settle();
  const trigger=document.querySelector('#atlas-shell-features-toggle'),panel=document.querySelector('#atlas-shell-features-panel');
  const replay=document.createElement('button');replay.id='workbench-replay';replay.textContent='리플레이';heading.append(replay);
  await settle();await settle();
  assert.equal(replay.parentElement,shellFeatureContainer(feature));
  assert.equal(document.querySelectorAll('#atlas-shell-features-panel').length,1);
  controller.refresh({symbol:'ETHUSD'});controller.refresh({symbol:'ETHUSD'});
  await settle();assert.equal(document.querySelector('#atlas-shell-features-toggle'),trigger);assert.equal(document.querySelector('#atlas-shell-features-panel'),panel);
  assert.equal(heading.getAttribute('aria-label'),'ETHUSD 차트 조작 도구');
  f.click('#atlas-shell-features-toggle');
  const host=document.createElement('div');host.className='center-workspace-toolbar';heading.append(host);
  document.body.dataset.centerTool='data';delete document.body.dataset.chartControls;controller.refresh();
  assert.equal(heading.getAttribute('data-mobile-heading'),'phone-dock','nonchart centers keep the same single phone dock');
  assert.equal(document.querySelector('#atlas-shell-features-panel'),panel,'protected source controls retain their exact disclosure owner');
  assert.equal(panel.hidden,true,'a chart disclosure closes when the nonchart center takes ownership');
  assert.equal(host.parentElement,heading,'the independent center toolbar remains a direct shell child');
});

for(const width of [320,390,456,620])test(`${width}px BTC, acknowledged TQQQ and data transitions retain the shell and control owners`,async t=>{
  const f=fixture(t,width),{document,window:dom,heading}=f;
  document.querySelector('#workbench-interval-select').remove();
  document.head.innerHTML='<meta name="atlas-service-base" content="/market-lab/">';
  const listeners=new Map(),posts=[];
  const hostWindow={parent:null,addEventListener:(type,handler)=>listeners.set(type,handler),history:{pushState(){},replaceState(){}}};hostWindow.parent=hostWindow;
  const globals={document,window:hostWindow,location:new URL('http://localhost/?page=outlook'),MutationObserver:dom.MutationObserver,CustomEvent:dom.CustomEvent};
  const prior=new Map(Object.keys(globals).map(key=>[key,Object.getOwnPropertyDescriptor(globalThis,key)]));
  for(const [key,value]of Object.entries(globals))Object.defineProperty(globalThis,key,{value,configurable:true});
  const create=document.createElement.bind(document);
  document.createElement=name=>{const node=create(name);if(name==='iframe')Object.defineProperty(node,'contentWindow',{value:{postMessage:message=>posts.push(message)}});return node;};
  const slots=mountShellSlots(document);
  t.after(async()=>{
    if(document.body.dataset.centerTool)document.dispatchEvent(new dom.CustomEvent('atlas:symbol-select',{cancelable:true,detail:{symbol:'BTCUSD'}}));
    await settle();slots.destroy();await settle();
    for(const [key,value]of prior){if(value)Object.defineProperty(globalThis,key,value);else Reflect.deleteProperty(globalThis,key);}
  });
  await settle();
  mountCenterWorkbench();
  const plot=create('div');plot.className='atlas-plot';plot.append(document.querySelector('#source-chart'));document.querySelector('#app').append(plot);await settle();
  document.dispatchEvent(new dom.CustomEvent('atlas:symbol-select',{cancelable:true,detail:{symbol:'TQQQ'}}));
  const frame=document.querySelector('iframe');assert(frame);
  const host=document.getElementById(frame.dataset.toolbarId),originalAction=document.querySelector('[data-equity-action="forecast"]');
  const backtest=create('button');backtest.dataset.rsiView='backtest';backtest.textContent='백테스트';host.append(backtest);
  assert.equal(document.querySelector('#atlas-shell-features-toggle').disabled,true,'background protection suspends the previous source controls during loading');
  listeners.get('message')({source:frame.contentWindow,origin:'http://localhost',data:{
    kind:'atlas:chart-state',symbol:'TQQQ',epoch:Number(frame.dataset.centerEpoch),ready:true,unit:'USD',timezone:'America/New_York',
    start:'2025-01-01',end:'2026-01-01',first:'2010-02-11',last:'2026-01-01',selected:'2026-01-01',close:50,
    frequency:'daily',frequencies:['daily','weekly'],scale:'log',chartType:'line',tool:'crosshair',magnet:'off',autoScale:true,
    candles:true,canUndo:false,canRedo:false,measurement:false,records:true,nextSignal:true,pane:null,
  }});
  await settle();await settle();
  const toggle=document.querySelector('#atlas-shell-features-toggle'),close=document.querySelector('[data-shell-feature-close]');
  assert.equal(toggle.disabled,false);assert.equal(close.disabled,false);assert.equal(host.inert,false);
  assert.equal(originalAction.disabled,true);assert.equal(originalAction.hidden,true,'enabling shell disclosures cannot expose the ancestor native asset action');
  assert.equal(heading.getAttribute('aria-label'),'TQQQ 차트 조작 도구');
  f.click('#atlas-shell-features-toggle');backtest.focus();
  const before=posts.filter(message=>message.action==='close-pane').length;
  const escape=new dom.Event('keydown',{bubbles:true,cancelable:true});escape.key='Escape';backtest.dispatchEvent(escape);
  assert.equal(document.querySelector('#atlas-shell-features-panel').hidden,true);assert.equal(document.activeElement,toggle);
  assert.equal(posts.filter(message=>message.action==='close-pane').length,before,'Escape belongs to the open shell feature disclosure');
  const panel=document.querySelector('#atlas-shell-features-panel');
  f.click('#atlas-shell-features-toggle');
  const dataLink=create('a');dataLink.dataset.atlasPage='data';document.querySelector('#app').append(dataLink);dataLink.click();await settle();await settle();
  assert.equal(document.body.dataset.centerTool,'data');assert.equal(document.body.dataset.chartControls,undefined);
  assert.equal(heading.getAttribute('data-mobile-heading'),'phone-dock','center data keeps the same single phone dock as the native and RSI charts');
  assert.equal(document.querySelector('#atlas-shell-features-toggle'),toggle);assert.equal(document.querySelector('#atlas-shell-features-panel'),panel);
  assert.equal(panel.hidden,true);assert.equal(originalAction.disabled,true);assert.equal(originalAction.hidden,true);
  const dataFrame=document.querySelector('.atlas-center-frame:not([hidden])'),dataHost=document.getElementById(dataFrame.dataset.toolbarId);
  assert.equal(dataHost.parentElement,heading,'data controls use their existing direct toolbar host, outside the hidden chart disclosure');
  assert.equal(host.hidden,true);assert.equal(dataHost.inert,true,'the current center loader retains its pending toolbar protection');
  const child=parseHTML('<html data-boot="ready"><head></head><body data-page="data"></body></html>').document;
  Object.defineProperty(dataFrame,'contentDocument',{value:child});dataFrame.dispatchEvent(new dom.Event('load'));await settle();await settle();
  assert.equal(dataHost.inert,false,'only the accepted child ready state enables its toolbar');
  const dataAction=create('button');dataAction.textContent='자료 읽는 법';let dataCalls=0;dataAction.addEventListener('click',()=>dataCalls++);dataHost.append(dataAction);
  await settle();await settle();dataAction.click();dataAction.focus();
  assert.equal(dataCalls,1);assert.equal(document.activeElement,dataAction);assert.equal(dataAction.parentElement,dataHost);
  document.dispatchEvent(new dom.CustomEvent('atlas:symbol-select',{cancelable:true,detail:{symbol:'BTCUSD'}}));await settle();await settle();
  assert.equal(frame.hidden,true);assert.equal(dataFrame.hidden,true);assert.equal(dataHost.hidden,true);assert.equal(originalAction.disabled,false);assert.equal(originalAction.hidden,false);
  assert.equal(heading.getAttribute('data-mobile-heading'),'phone-dock');assert.equal(document.querySelector('#atlas-shell-features-toggle'),toggle);assert.equal(toggle.disabled,false);
  assert.equal(heading.getAttribute('aria-label'),'BTCUSD 차트 조작 도구');
});

test('the phone dock CSS keeps its 48px row, 44px primary controls and every distinct disclosure function',t=>{
  const {document}=fixture(t);const style=document.createElement('style');style.textContent=readFileSync(new URL('../dist/atlas-shell.css',import.meta.url),'utf8');document.head.append(style);
  const entries=[...style.sheet.cssRules].flatMap(rule=>rule.type===4
    ?[...rule.cssRules].map(child=>({media:rule.media.mediaText,rule:child}))
    :[{media:null,rule}]);
  const normalized=value=>value.replace(/["\s]/g,'');
  const read=(part,{media='(max-width:620px)',within='phone-dock'}={})=>entries.find(entry=>entry.media===media&&entry.rule.selectorText
    &&normalized(entry.rule.selectorText).includes(normalized(part))
    &&(!within||normalized(entry.rule.selectorText).includes(normalized(within))))?.rule.style;
  const dock=read('[data-mobile-heading=phone-dock]');
  assert(dock,'the one-row phone dock replaced the two-row grid');
  assert.match(normalized(dock.getPropertyValue('height')),/48px\+var\(--mobile-bottom,0px\)/);
  assert.match(normalized(dock.getPropertyValue('min-height')),/48px/);
  assert.match(normalized(dock.getPropertyValue('max-height')),/48px/);
  assert.equal(dock.getPropertyValue('order'),'100');
  assert.equal(normalized(dock.getPropertyValue('border-top')),'1pxsolidvar(--border)');
  assert.equal(normalized(dock.getPropertyValue('flex-wrap')),'nowrap');
  const symbol=read('is(.symbol-selector-trigger,.workbench-symbol)');
  assert.equal(symbol.getPropertyValue('height'),'44px');
  assert.equal(symbol.getPropertyValue('min-width'),'80px','the symbol stays a stable 80px primary target');
  const trayButtons=read('is(.workbench-icon,.mobile-workbench-button)');
  assert.equal(trayButtons.getPropertyValue('width'),'44px','the tools/details tray buttons keep their reserved 44px');
  assert.equal(trayButtons.getPropertyValue('height'),'44px');
  const secondary=read('[data-mobile-secondary]');
  assert.equal(secondary.getPropertyValue('min-height'),'44px','docked secondary controls stay tappable');
  assert.equal(normalized(secondary.getPropertyValue('border-radius')),'0');
  const historyButton=read('.workspace-history-controls>button');
  assert.equal(historyButton.getPropertyValue('width'),'44px','undo/redo keep their own 44px contract');
  const panel=read('.shell-feature-panel');
  assert.equal(panel.getPropertyValue('position'),'fixed');
  assert.match(normalized(panel.getPropertyValue('max-height')),/calc\(100dvh-64px/,'the disclosure panel scrolls inside short viewports');
  assert.equal(normalized(panel.getPropertyValue('border-radius')),'0','the dock panel is not a rounded card');
  const panelSelect=read('.shell-feature-panel select');
  assert.equal(panelSelect.getPropertyValue('font-size'),'16px','16px keeps iOS from zooming disclosure selects');
  const anyRule=(part,within)=>entries.find(entry=>entry.rule.selectorText
    &&normalized(entry.rule.selectorText).includes(normalized(part))
    &&(!within||normalized(entry.rule.selectorText).includes(normalized(within))))?.rule.style;
  const wrapping=anyRule('.center-workspace-toolbar','.shell-feature-panel');
  assert(wrapping,'long source toolbar text keeps its wrapping owner');
  assert.equal(normalized(wrapping.getPropertyValue('white-space')),'normal');
  assert.equal(normalized(wrapping.getPropertyValue('flex-wrap')),'wrap');
  assert.equal(normalized(wrapping.getPropertyValue('box-sizing')),'border-box');
  const overflow=anyRule('[data-toolbar-open]','.shell-feature-panel');
  assert.equal(overflow.getPropertyValue('max-height'),'none','observed source text cannot be clipped by a fixed row height');
  assert.equal(normalized(overflow.getPropertyValue('text-overflow')),'clip');
  const focusRing=entries.find(entry=>entry.rule.selectorText&&normalized(entry.rule.selectorText).includes('shell-feature-toggle:focus-visible'))?.rule.style;
  assert.equal(focusRing.getPropertyValue('outline-offset'),'-2px','focus rings stay inside the dock row');
});

test('closing the disclosure from inside the panel returns focus to the visible dock trigger',t=>{
  const f=fixture(t,390),{document,heading,feature}=f;
  const controller=mountMobileShellHeading(document);t.after(()=>controller.destroy());
  controller.update({heading,feature,symbol:'BMNR'});
  const trigger=document.querySelector('#atlas-shell-features-toggle'),panel=document.querySelector('#atlas-shell-features-panel');
  const original=shellFeatureContainer(feature).querySelector('#equity-scenario');
  f.click('#atlas-shell-features-toggle');
  original.focus();
  assert.ok(document.activeElement===original);
  controller.update({heading,feature,symbol:'ETHUSD'});
  assert.equal(panel.hidden,true,'a symbol change still closes the panel');
  assert.ok(document.activeElement===trigger,'focus leaves the now-hidden panel for the dock trigger');
  assert.ok(heading.contains(trigger)&&trigger.isConnected);
  // The same rule holds for a secondary control that now lives in the panel.
  f.click('#atlas-shell-features-toggle');
  const docked=shellFeatureContainer(feature).querySelector('#workbench-chart-type');
  assert(docked,'the secondary control is inside the panel actions');
  docked.focus();
  controller.update({heading,feature,symbol:'TQQQ'});
  assert.equal(panel.hidden,true);
  assert.ok(document.activeElement===trigger,'a focused in-panel secondary never stays behind a hidden panel');
});

test('a focused secondary control re-docks with the panel open and keeps its exact focus',t=>{
  const f=fixture(t,1024),{document,window,heading,feature}=f;
  const controller=mountMobileShellHeading(document);t.after(()=>controller.destroy());
  controller.update({heading,feature,symbol:'BMNR'});
  assert.equal(heading.hasAttribute('data-mobile-heading'),false,'desktop starts without the phone dock');
  const secondary=heading.querySelector('#workbench-chart-type');
  secondary.focus();
  f.resize(390);
  let panel=document.querySelector('#atlas-shell-features-panel');
  assert.equal(heading.getAttribute('data-mobile-heading'),'phone-dock');
  assert.equal(panel.hidden,false,'the panel opens so the focused secondary control stays reachable');
  assert.ok(document.activeElement===secondary,'the same node keeps focus across the re-dock');
  assert.ok(panel.contains(secondary),'the focused control is now inside the dock disclosure');
  assert.ok(secondary.hasAttribute('data-mobile-secondary'));
  f.resize(1024);
  assert.equal(heading.hasAttribute('data-mobile-heading'),false);
  assert.ok(heading.contains(secondary),'desktop returns the control to the heading');
  assert.ok(document.activeElement===secondary,'desktop restore does not drop focus');
  f.resize(456);
  panel=document.querySelector('#atlas-shell-features-panel');
  assert.equal(panel.hidden,false,'re-entering a phone width re-opens the panel for that focus');
  assert.ok(document.activeElement===heading.querySelector('#workbench-chart-type'));
  assert.equal(document.querySelector('#atlas-shell-features-toggle').getAttribute('aria-expanded'),'true');
});
