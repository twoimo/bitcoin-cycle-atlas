import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {parseHTML} from 'linkedom';
import {mountMobileShellHeading,shellFeatureContainer} from '../dist/ui/mobile-shell-heading.js';
import {mountShellSlots} from '../dist/ui/shell-slots.js';

// DOM ownership/focus-model checks only. Native clipping, pointer hit, contrast
// and keyboard Tab order remain the unchanged P0/P1 browser gates' evidence.
function fixture(t,width=320) {
  const {document,window}=parseHTML(`<html><body data-shell="chart"><main>
    <header class="atlas-canvas-heading">
      <button class="workbench-symbol">BTCUSD</button>
      <fieldset id="workbench-frequency"><select id="workbench-interval-select"><option>1D</option></select></fieldset>
      <button id="workbench-chart-type" class="workbench-icon">캔들</button>
      <button id="atlas-mode-menu" class="workbench-icon" aria-haspopup="dialog"><span id="atlas-mode-name">지표</span></button>
      <div class="shell-instrument-slot" data-shell-key="instrument"><button id="workbench-scenario">가정</button></div>
      <button id="workbench-workspace" class="workbench-icon">검색</button>
      <button id="atlas-display-options" class="workbench-icon" aria-label="차트 설정"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M5 3v18M12 3v18M19 3v18M2 8h6m1 8h6m1-10h6"/></svg></button>
      <button id="mobile-tools-toggle" class="mobile-workbench-button">도구</button>
      <button id="mobile-details-toggle" class="mobile-workbench-button">정보</button>
    </header>
    <aside id="chart-reader" class="chart-details-panel" hidden><button id="reader-close">닫기</button></aside>
    <dialog id="indicator-library"><button id="indicator-close">지표 닫기</button></dialog>
    <svg id="price-chart"><path d="M1 2L3 4"/></svg>
  </main></body></html>`);
  let focused=null;
  Object.defineProperty(document,'activeElement',{configurable:true,get:()=>focused});
  const prototype=window.HTMLElement.prototype,priorFocus=prototype.focus;
  prototype.focus=function(){focused=this;this.dispatchEvent(new window.Event('focusin',{bubbles:true}));};
  t.after(()=>{prototype.focus=priorFocus;});
  const listeners=new Set(),media={matches:width<=620,addEventListener(type,fn){if(type==='change')listeners.add(fn);},removeEventListener(type,fn){if(type==='change')listeners.delete(fn);}};
  window.matchMedia=()=>media;
  const heading=document.querySelector('.atlas-canvas-heading'),feature=heading.querySelector('.shell-instrument-slot');
  const settings=document.querySelector('#atlas-display-options'),indicators=document.querySelector('#atlas-mode-menu');
  const click=node=>node.dispatchEvent(new window.Event('click',{bubbles:true,cancelable:true}));
  const resize=value=>{media.matches=value<=620;for(const fn of listeners)fn({matches:media.matches});};
  return {document,window,heading,feature,settings,indicators,click,resize};
}

for(const width of [320,390])test(`${width}: settings retains its original dock action while indicators use the existing disclosure`,t=>{
  const f=fixture(t,width),{document,window,heading,feature,settings,indicators,click}=f;
  const originalHeading=[...heading.childNodes],settingsPath=settings.querySelector('svg path'),price=document.querySelector('#price-chart').outerHTML;
  const reader=document.querySelector('#chart-reader'),dialog=document.querySelector('#indicator-library');
  let settingsCalls=0,indicatorCalls=0;
  settings.addEventListener('click',()=>{settingsCalls++;reader.hidden=false;reader.querySelector('button').focus();});
  reader.querySelector('button').addEventListener('click',()=>{reader.hidden=true;settings.focus();});
  indicators.addEventListener('click',()=>{indicatorCalls++;dialog.setAttribute('open','');dialog.querySelector('button').focus();});
  dialog.querySelector('button').addEventListener('click',()=>{dialog.removeAttribute('open');indicators.focus();});
  const controller=mountMobileShellHeading(document);t.after(()=>controller.destroy());
  controller.update({heading,feature,symbol:'BTCUSD'});
  const panel=document.querySelector('#atlas-shell-features-panel'),trigger=document.querySelector('#atlas-shell-features-toggle');
  assert.equal(panel.hidden,true);
  assert.equal(settings.parentElement,heading,'the original settings button stays outside the initially hidden sheet');
  assert.equal(settings.closest('[hidden]'),null);
  assert.equal(settings.hasAttribute('data-mobile-secondary'),false);
  assert.equal(settings.querySelector('svg path'),settingsPath,'the fixed P0 icon is neither cloned nor substituted');
  assert.equal(document.querySelectorAll('#atlas-display-options').length,1);
  assert.equal(indicators.parentElement,shellFeatureContainer(feature));
  assert.equal(indicators.dataset.mobileSecondary,'true');
  assert.equal(indicators.getAttribute('aria-haspopup'),'dialog');
  assert.equal([...heading.children].filter(node=>node.matches('button,.shell-instrument-slot,#workbench-frequency')).length,6,
    'settings replaces the direct indicator slot without adding a seventh primary dock control');
  click(settings);assert.equal(settingsCalls,1);assert.equal(reader.hidden,false);assert.equal(panel.hidden,true);
  click(reader.querySelector('button'));assert.equal(document.activeElement,settings);assert.equal(settings.closest('[hidden]'),null);
  click(trigger);assert.equal(panel.hidden,false);
  click(indicators);assert.equal(indicatorCalls,1);assert.equal(dialog.hasAttribute('open'),true);
  assert.equal(panel.hidden,false,'the original indicator dialog keeps its disclosure opener visible');
  click(dialog.querySelector('button'));assert.equal(document.activeElement,indicators);
  const escape=new window.Event('keydown',{bubbles:true,cancelable:true});escape.key='Escape';indicators.dispatchEvent(escape);
  assert.equal(escape.defaultPrevented,true);assert.equal(panel.hidden,true);assert.equal(document.activeElement,trigger);
  f.resize(1440);
  assert.deepEqual([...heading.childNodes],originalHeading,'desktop restores every marker and original node order');
  assert.equal(document.querySelectorAll('[data-mobile-secondary]').length,0);
  f.resize(width);controller.update({heading,feature,symbol:'ETHUSD'});
  assert.equal(settings.parentElement,heading);assert.equal(indicators.parentElement,shellFeatureContainer(feature));
  click(settings);assert.equal(settingsCalls,2,'the same settings listener survives source identity and width updates');
  assert.equal(settings.querySelector('svg path'),settingsPath);assert.equal(document.querySelector('#price-chart').outerHTML,price);
});

test('a focused indicator keeps its original focus and a settings opener stays in the dock across width changes',t=>{
  const f=fixture(t,1440),{document,heading,feature,settings,indicators}=f;
  const controller=mountMobileShellHeading(document);t.after(()=>controller.destroy());controller.update({heading,feature,symbol:'BTCUSD'});
  indicators.focus();f.resize(320);
  assert.equal(document.activeElement,indicators);assert.equal(document.querySelector('#atlas-shell-features-panel').hidden,false);
  assert.equal(indicators.closest('#atlas-shell-features-panel')?.hidden,false);
  f.resize(1440);settings.focus();f.resize(390);
  assert.equal(document.activeElement,settings);assert.equal(settings.parentElement,heading);
  assert.equal(document.querySelector('#atlas-shell-features-panel').hidden,true,'a focused visible settings action does not open an unrelated feature sheet');
});

test('shell refreshes preserve settings and indicator slot identities without duplicated buttons',async t=>{
  const f=fixture(t),{document,heading,feature,settings,indicators}=f;
  const slots=mountShellSlots(document);t.after(()=>slots.destroy());
  await new Promise(resolve=>setImmediate(resolve));
  for(const symbol of ['BTCUSD','ETHUSD','MSTR','BMNR']) {
    slots.refresh({symbol});slots.refresh({symbol});await new Promise(resolve=>setImmediate(resolve));
    assert.equal(settings.parentElement,heading);assert.equal(settings.dataset.shellKey,'settings');assert.equal(settings.dataset.shellSlot,'10');
    assert.equal(indicators.parentElement,shellFeatureContainer(feature));assert.equal(indicators.dataset.shellKey,'indicators');assert.equal(indicators.dataset.shellSlot,'4');
    assert.equal(document.querySelectorAll('#atlas-display-options').length,1);assert.equal(document.querySelectorAll('#atlas-mode-menu').length,1);
    assert.equal(document.querySelectorAll('#atlas-shell-features-panel').length,1);
  }
  f.resize(1440);slots.refresh({symbol:'BMNR'});
  assert.equal(indicators.parentElement,heading);assert.equal(settings.parentElement,heading);
  f.resize(320);slots.refresh({symbol:'BMNR'});
  assert.equal(settings.parentElement,heading);assert.equal(indicators.parentElement,shellFeatureContainer(feature));
});

test('the phone settings display rule outranks the legacy ID hide without changing its 44px slot',t=>{
  const {document,heading,feature,settings}=fixture(t);
  const controller=mountMobileShellHeading(document);t.after(()=>controller.destroy());controller.update({heading,feature,symbol:'BTCUSD'});
  const rules=file=>{
    const style=document.createElement('style');style.textContent=readFileSync(new URL(file,import.meta.url),'utf8');document.head.append(style);
    return [...style.sheet.cssRules].filter(rule=>rule.type===4&&rule.media.mediaText.replace(/\s/g,'')==='(max-width:620px)')
      .flatMap(rule=>[...rule.cssRules]);
  };
  const legacy=rules('../dist/mobile-workspace.css').find(rule=>rule.selectorText?.includes('#atlas-display-options')&&rule.style.getPropertyValue('display')==='none');
  const override=rules('../dist/ui/shell-layout.css').find(rule=>rule.selectorText?.includes('#atlas-display-options')&&rule.style.getPropertyValue('display')==='inline-flex');
  assert.ok(legacy,'exercise the actual legacy ID hide, not an assumed generic rule');
  assert.ok(override,'a connected button still needs a paintable display rule');
  const hiddenBranch=legacy.selectorText.split(',').find(selector=>selector.includes('#atlas-display-options')).trim();
  assert.equal(settings.matches(hiddenBranch),true);
  assert.equal(settings.matches(override.selectorText),true);
  assert.equal(legacy.style.getPropertyPriority('display'),'');assert.equal(override.style.getPropertyPriority('display'),'');
  // Deliberately bounded to these plain selectors. Unsupported selector syntax
  // must fail this static cascade proof rather than receive an invented score.
  const specificity=selector=>{
    const attributes=[...selector.matchAll(/\[[^\]]+\]/g)].length;
    let rest=selector.replace(/\[[^\]]+\]/g,'');
    const ids=[...rest.matchAll(/#[\w-]+/g)].length,classes=[...rest.matchAll(/\.[\w-]+/g)].length;
    rest=rest.replace(/#[\w-]+|\.[\w-]+/g,'');
    const tags=rest.match(/[a-zA-Z][\w-]*/g)||[];
    assert.match(rest.replace(/[a-zA-Z][\w-]*/g,''),/^[\s>+~]*$/,'only the measured plain ID/class/attribute selectors are supported');
    return [ids,classes+attributes,tags.length];
  };
  const before=specificity(hiddenBranch),after=specificity(override.selectorText);
  assert.deepEqual(before,[1,1,0]);
  assert.ok(after.some((value,index)=>value>before[index]&&after.slice(0,index).every((part,i)=>part===before[i])),
    `phone display specificity ${after} must outrank original hide ${before}`);
  assert.deepEqual(Array.from({length:override.style.length},(_,index)=>override.style[index]),['display'],
    'the override changes paint eligibility only, retaining the existing dock geometry');
  const geometry=rules('../dist/atlas-shell.css').find(rule=>rule.selectorText?.replace(/["'\s]/g,'').includes('[data-mobile-heading=phone-dock]')
    &&rule.selectorText.includes('.workbench-icon')&&rule.style.getPropertyValue('width')==='44px'&&settings.matches(rule.selectorText));
  assert.ok(geometry);
  for(const property of ['width','min-width','max-width','height','min-height'])assert.equal(geometry.style.getPropertyValue(property),'44px');
  document.body.dataset.shell='dashboard';assert.equal(settings.matches(override.selectorText),false,'dashboard controls cannot inherit the chart-only override');
  document.body.dataset.shell='chart';delete heading.dataset.mobileHeading;
  assert.equal(settings.matches(override.selectorText),false,'the override is limited to the mounted phone dock');
});
