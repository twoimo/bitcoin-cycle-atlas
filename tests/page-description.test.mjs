import test from 'node:test';
import assert from 'node:assert/strict';
import {parseHTML} from 'linkedom';
import {atlasNavigationPages} from '../dist/atlas-navigation.js';
import {atlasPageDescription, mountPageDescription} from '../dist/ui/page-description.js';

const settle = () => new Promise(resolve => setImmediate(resolve));
function fixture({page='outlook', center, embedded=false, toolbar=true, beforeMount} = {}) {
  const {document, window} = parseHTML(`<html><body data-page="${page}"${center ? ` data-center-tool="${center}"` : ''}${embedded ? ' data-embedded="true"' : ''}>
    <header class="atlas-dashboard-header"><button id="sidebar-toggle">목록</button><h1 class="atlas-shell-heading"></h1></header>
    <div class="workspace"><main><section class="atlas-chart-stage">${toolbar ? '<header class="atlas-canvas-heading" style="height:48px"><button id="symbol" class="symbol-selector-trigger" aria-label="TQQQ 종목 선택" aria-haspopup="dialog" aria-controls="symbol-search-dialog" aria-expanded="false"><span class="symbol-selector-label">삼플레</span></button><select id="interval" aria-label="TQQQ 가격 간격"><option value="daily">일봉</option></select></header>' : ''}<div class="atlas-plot"><svg aria-label="관측 가격"></svg></div></section></main></div></body></html>`);
  const header = document.querySelector('.atlas-dashboard-header');
  const heading = header.querySelector('h1');
  beforeMount?.({document, window});
  const controller = mountPageDescription(document, {header, heading});
  return {document, window, header, heading, controller};
}

test('the registered destinations and saved comparison page describe their actual basis without a shared refresh promise', () => {
  assert.deepEqual(atlasNavigationPages.map(page => atlasPageDescription(page).title), ['가격 차트','시장 분석','리서치','자산 비교','공모주','릴레이 콘텐츠','컨퍼런스 복습']);
  for (const page of [...atlasNavigationPages, {id:'compare'}]) {
    const info = atlasPageDescription(page);
    assert.ok(info.description.length > 15);
    assert.doesNotMatch(info.description, /15분|실시간/);
  }
  assert.match(atlasPageDescription('compare').description, /반감일.*일별 종가\(UTC\)/);
  for (const page of ['rsi','housing','themes']) assert.equal(atlasPageDescription(page), atlasPageDescription('outlook'));
  for (const page of ['market-kr','scenario','cashflow']) assert.equal(atlasPageDescription(page), atlasPageDescription('market-us'));
});

// Linkedom has no layout observer or rendering loop. Deliver only notifications
// from subscribed elements, then advance one explicit animation frame.
function observedCompareFixture() {
  const globals = Object.fromEntries(['ResizeObserver','requestAnimationFrame','cancelAnimationFrame'].map(name => [name, Object.getOwnPropertyDescriptor(globalThis, name)]));
  const frames = new Map(), cancelled = [];
  let nextFrame = 0, observer;
  let anchorBox = {left:124, top:905.5, width:196, height:48};
  let toolbarBox = {left:0, top:905, right:320, width:320, height:48};
  const restoreGlobals = () => {
    for (const [name, descriptor] of Object.entries(globals)) {
      if (descriptor) Object.defineProperty(globalThis, name, descriptor);
      else delete globalThis[name];
    }
  };
  let f;
  try {
    f = fixture({page:'compare', beforeMount({document, window}) {
      window.ResizeObserver = class {
        constructor(callback) { this.callback = callback; this.targets = new Map(); observer = this; }
        observe(target, options) { this.targets.set(target, options); }
        disconnect() { this.targets.clear(); }
        notify(target) {
          if (!this.targets.has(target)) return false;
          this.callback([{target}]);
          return true;
        }
      };
      window.requestAnimationFrame = callback => { const id = ++nextFrame; frames.set(id, callback); return id; };
      window.cancelAnimationFrame = id => { cancelled.push(id); frames.delete(id); };
      const toolbar = document.querySelector('.atlas-canvas-heading');
      const anchor = document.createElement('div');
      anchor.className = 'lab-toolbar';
      anchor.getBoundingClientRect = () => anchorBox;
      toolbar.getBoundingClientRect = () => toolbarBox;
      toolbar.append(anchor);
    }});
  } catch (error) { restoreGlobals(); throw error; }
  return {
    ...f, observer, frames, cancelled,
    moveAnchor(next) { anchorBox = {...anchorBox, ...next}; },
    moveToolbar(next) { toolbarBox = {...toolbarBox, ...next}; },
    flushFrame() {
      const pending = [...frames.values()];
      frames.clear();
      for (const callback of pending) callback();
    },
    cleanup() { f.controller.destroy(); restoreGlobals(); },
  };
}

test('ancestor-only size changes refresh a fixed compare heading after unchanged controls move', () => {
  const f = observedCompareFixture();
  try {
    const {document, heading, observer, frames} = f;
    const copy = heading.parentElement;
    const toolbar = document.querySelector('.atlas-canvas-heading');
    const anchor = toolbar.querySelector('.lab-toolbar');
    const stage = document.querySelector('.atlas-chart-stage');
    const workspace = document.querySelector('.workspace');
    assert.deepEqual([copy.style.left, copy.style.top, copy.style.width], ['48px','922.5px','68px']);
    f.moveAnchor({left:80, top:852});
    f.moveToolbar({top:852});
    observer.notify(stage);
    observer.notify(workspace);
    observer.notify(document.documentElement);
    const scheduledFrames = frames.size;
    assert.equal(copy.style.top, '922.5px', 'the pending frame has not painted yet');
    f.flushFrame();
    assert.deepEqual([copy.style.left, copy.style.top, copy.style.width], ['4px','869px','68px']);
    assert.equal(scheduledFrames, 1, 'one layout batch schedules one frame');
    assert.equal(frames.size, 0, 'placement does not start a polling loop');
    for (const target of [anchor, toolbar, stage, workspace, document.body, document.documentElement]) {
      assert.equal(observer.targets.get(target)?.box, 'border-box', `${target.className || target.tagName} must report changes to its layout box`);
    }
    assert.equal(observer.targets.has(copy), false, 'fixed paint must not become its own resize source');
    assert.equal(toolbar.nextElementSibling, copy);
    assert.equal(copy.closest('.atlas-canvas-heading'), null);
    assert.equal(document.querySelectorAll('h1').length, 1);
    assert.equal(heading.hidden, false);
  } finally { f.cleanup(); }
});

test('the same toolbar follows a new scroll owner and drops its detached ancestor subscriptions', async () => {
  const f = observedCompareFixture();
  try {
    const {document, heading, observer} = f;
    const copy = heading.parentElement;
    const workspace = document.querySelector('.workspace');
    const stage = document.querySelector('.atlas-chart-stage');
    const oldParent = stage.parentElement;
    const toolbar = document.querySelector('.atlas-canvas-heading');
    const nextParent = document.createElement('main');
    nextParent.style.overflow = 'auto';
    workspace.append(nextParent);
    nextParent.append(stage);
    oldParent.remove();
    await settle();
    assert.equal(observer.targets.has(oldParent), false, 'detached owner must stop retaining the heading observer');
    assert.equal(observer.targets.has(nextParent), true, 'reparenting keeps the same controls but changes their scroll owner');
    f.flushFrame();
    f.moveAnchor({left:80, top:852});
    f.moveToolbar({top:852});
    assert.equal(observer.notify(nextParent), true);
    f.flushFrame();
    assert.equal(copy.style.top, '869px');
    assert.equal(toolbar.nextElementSibling, copy);
    assert.equal(document.getElementById('atlas-page-heading'), heading);
    assert.equal(document.querySelectorAll('h1').length, 1);
    const nextStage = document.createElement('section');
    nextParent.append(nextStage);
    nextStage.append(toolbar);
    await settle();
    assert.equal(toolbar.nextElementSibling, copy, 'moving only the toolbar must move the existing heading sibling too');
    assert.equal(copy.parentElement, nextStage);
    assert.equal(observer.targets.has(stage), false);
    assert.equal(observer.targets.has(nextStage), true);
    assert.equal(document.getElementById('atlas-page-heading'), heading);
    assert.equal(document.querySelectorAll('h1').length, 1);
  } finally { f.cleanup(); }
});

test('conference clears fixed placement and disposal rejects queued resize work', () => {
  const f = observedCompareFixture();
  try {
    const {document, controller, heading, header, observer, frames} = f;
    const copy = heading.parentElement;
    observer.notify(document.querySelector('.workspace'));
    document.body.dataset.page = 'conference';
    controller.sync();
    assert.equal(copy.parentElement, header);
    assert.equal(copy.className, 'atlas-shell-copy');
    assert.equal(copy.hidden, false);
    assert.equal(copy.hasAttribute('style'), false);
    assert.equal(copy.dataset.headingPlacement, undefined);
    assert.equal(heading.textContent, '컨퍼런스 복습');
    assert.equal(document.querySelectorAll('h1').length, 1);
    assert.equal(observer.targets.size, 0);
    f.flushFrame();
    assert.equal(copy.hasAttribute('style'), false, 'an already queued chart frame must not repaint the conference header');
    document.body.dataset.page = 'compare';
    controller.sync();
    observer.notify(document.querySelector('.workspace'));
    assert.equal(frames.size, 1);
    controller.sync();
    assert.equal(frames.size, 1, 'immediate chart sync must retain the pending frame handle for disposal');
    const [pendingId, lateFrame] = [...frames.entries()][0];
    controller.destroy();
    assert.equal(observer.targets.size, 0);
    assert.equal(frames.size, 0);
    assert.ok(f.cancelled.includes(pendingId));
    observer.callback([]);
    lateFrame();
    assert.equal(frames.size, 0, 'a delivered resize notification cannot restart a disposed controller');
    assert.equal(document.getElementById('atlas-page-heading'), null);
  } finally { f.cleanup(); }
});

test('one described h1 follows chart and dashboard destinations while original controls retain their listeners and labels', () => {
  const f = fixture();
  try {
    const {document, window, controller, header, heading} = f;
    const toolbar = document.querySelector('.atlas-canvas-heading');
    const controls = [...toolbar.children];
    const initialToolbar = toolbar.outerHTML;
    const copy = heading.parentElement;
    const description = document.getElementById(heading.getAttribute('aria-describedby'));
    let clicks = 0;
    controls[0].addEventListener('click', () => clicks++);
    for (const page of ['outlook','market-us','rsi','evidence','data','ipo','relay','housing','conference']) {
      document.body.dataset.centerTool = page;
      controller.sync();
      assert.equal(heading.textContent, atlasPageDescription(page).title);
      assert.equal(description.textContent, atlasPageDescription(page).description);
      assert.equal(document.querySelectorAll('#atlas-page-description').length, 1);
      assert.equal(toolbar.nextElementSibling, copy);
      assert.equal(copy.closest('.atlas-plot'), null, 'page introduction cannot obscure chart observations');
      assert.equal(copy.hidden, false);
      assert.equal(toolbar.outerHTML, initialToolbar);
      assert.deepEqual([...toolbar.children], controls);
    }
    controls[0].dispatchEvent(new window.Event('click'));
    assert.equal(clicks, 1);
    document.body.dataset.page = 'compare';
    controller.sync();
    assert.equal(copy.parentElement === toolbar.parentElement, true, 'compare stays in the shared chart frame');
    assert.equal(toolbar.nextElementSibling === copy, true, 'one introduction follows the real compare toolbar');
    assert.equal(copy.parentElement === header, false, 'compare no longer uses the dashboard composition');
    assert.equal(heading.textContent, '사이클 비교', 'direct page owns the introduction even with a stale center id');
    assert.match(description.textContent, /일별 종가\(UTC\)/);
    assert.equal(document.querySelectorAll('h1[aria-describedby="atlas-page-description"]').length, 1);
  } finally {f.controller.destroy();}
});

test('late BTC construction and native replacement move the same introduction after the new toolbar', async () => {
  const f = fixture({center:'rsi', toolbar:false});
  try {
    const {document, controller, heading} = f;
    const copy = heading.parentElement;
    assert.equal(copy.hidden, true);
    const stage = document.querySelector('.atlas-chart-stage');
    const toolbar = document.createElement('header');toolbar.className = 'atlas-canvas-heading';
    toolbar.innerHTML = '<button aria-label="TQQQ 종목 선택">삼플레</button>';
    stage.prepend(toolbar);
    await settle();
    assert.equal(toolbar.nextElementSibling, copy);
    assert.equal(copy.hidden, false);
    const app = document.createElement('main');app.className = 'native-chart-workbench';
    app.innerHTML = '<header class="eth-topbar atlas-canvas-heading"><button aria-label="ETHUSD 종목 선택">이더리움</button></header><div class="eth-plot atlas-plot"></div>';
    document.querySelector('.workspace').replaceChildren(app);
    delete document.body.dataset.centerTool;
    await settle();
    const nextToolbar = app.querySelector('.atlas-canvas-heading');
    assert.equal(nextToolbar.nextElementSibling, copy);
    assert.equal(document.querySelector('#atlas-page-heading'), heading);
    assert.equal(document.querySelectorAll('[data-page-intro]').length, 1);
    controller.destroy();
    assert.equal(document.querySelector('[data-page-intro]'), null);
    app.replaceChildren(toolbar);
    await settle();
    assert.equal(document.querySelector('[data-page-intro]'), null, 'disposal does not resurrect the intro');
  } finally {f.controller.destroy();}
});

test('an embedded child leaves page context to its parent and keeps existing content intact', () => {
  const f = fixture({embedded:true});
  const before = f.document.body.innerHTML;
  f.controller.sync();f.controller.destroy();
  assert.equal(f.document.body.innerHTML, before);
  assert.equal(f.document.querySelector('[data-page-intro]'), null);
  assert.equal(f.heading.hasAttribute('aria-describedby'), false);
});

test('the normal-flow label and fixed compare title reuse one h1 without changing the symbol control or its event handlers', () => {
  const f = fixture();
  try {
    const {document, window, controller, heading, header} = f;
    const toolbar = document.querySelector('.atlas-canvas-heading');
    const symbol = document.getElementById('symbol');
    let symbolMeasurements = 0, clicks = 0;
    const keys = [];
    symbol.getBoundingClientRect = () => { symbolMeasurements++; return {left:56, top:1, width:128, height:36}; };
    symbol.addEventListener('click', () => clicks++);
    symbol.addEventListener('keydown', event => keys.push(event.key));
    toolbar.getBoundingClientRect = () => ({left:52, top:0, right:1440, width:1388, height:38});
    const before = toolbar.outerHTML;
    controller.sync();
    const copy = heading.parentElement;
    assert.equal(copy.dataset.headingPlacement, 'label');
    assert.equal(copy.hasAttribute('style'), false, 'normal flow must not inherit symbol coordinates or clipping');
    assert.equal(symbolMeasurements, 0, 'the label no longer measures or paints inside the symbol button');
    assert.equal(toolbar.outerHTML, before);
    assert.equal(toolbar.nextElementSibling === copy, true);
    const compare = document.createElement('div');
    compare.className = 'lab-toolbar';
    compare.getBoundingClientRect = () => ({left:132, top:0, width:1256, height:38});
    toolbar.append(compare);
    document.body.dataset.page = 'compare';
    const compareBefore = toolbar.outerHTML;
    controller.sync();
    assert.equal(copy.dataset.headingPlacement, 'compare');
    assert.deepEqual([copy.style.left, copy.style.top, copy.style.width], ['56px','12px','68px']);
    assert.equal(toolbar.outerHTML, compareBefore);
    assert.equal(document.querySelectorAll('h1').length, 1);
    assert.equal(heading.textContent, '사이클 비교');
    document.body.dataset.page = 'outlook';
    controller.sync();
    assert.equal(copy.dataset.headingPlacement, 'label');
    assert.equal(copy.hasAttribute('style'), false, 'returning from fixed compare removes every inline placement property');
    assert.equal(copy.closest('.atlas-plot'), null);
    assert.equal(copy.closest('.symbol-selector-trigger'), null);
    assert.equal(document.getElementById('symbol'), symbol);
    assert.equal(symbol.disabled, false);
    assert.equal(symbol.getAttribute('aria-label'), 'TQQQ 종목 선택');
    assert.equal(symbol.getAttribute('aria-haspopup'), 'dialog');
    assert.equal(symbol.getAttribute('aria-controls'), 'symbol-search-dialog');
    assert.equal(symbol.getAttribute('aria-expanded'), 'false');
    assert.equal(toolbar.outerHTML, compareBefore, 'the label changes no source controls, attributes or child order');
    symbol.dispatchEvent(new window.Event('click'));
    for (const key of ['Enter', ' ', 'Escape']) {
      const event = new window.Event('keydown', {bubbles:true, cancelable:true}); event.key = key;
      symbol.dispatchEvent(event); assert.equal(event.defaultPrevented, false, 'heading placement does not consume source keyboard input');
    }
    assert.equal(clicks, 1); assert.deepEqual(keys, ['Enter', ' ', 'Escape']);
    document.body.dataset.page = 'data';
    controller.sync();
    assert.equal(copy.parentElement === header, true);
    assert.equal(copy.className, 'atlas-shell-copy');
    assert.equal(copy.hasAttribute('style'), false, 'fixed coordinates cannot leak into the dashboard header');
    assert.equal(copy.dataset.headingPlacement, undefined);
  } finally {f.controller.destroy();}
});

test('late symbol replacement and scroll leave the normal-flow label unpositioned and disposal schedules no label frames', async () => {
  const frameGlobals = Object.fromEntries(['requestAnimationFrame','cancelAnimationFrame'].map(name => [name, Object.getOwnPropertyDescriptor(globalThis, name)]));
  const f = fixture();
  try {
    const {document, window, controller, heading} = f;
    const toolbar = document.querySelector('.atlas-canvas-heading');
    const copy = heading.parentElement;
    document.getElementById('symbol').remove();
    const symbol = document.createElement('button');
    symbol.className = 'symbol-selector-trigger';
    symbol.getBoundingClientRect = () => ({left:4, top:854, width:88, height:44});
    toolbar.prepend(symbol);
    await settle();
    assert.equal(copy.dataset.headingPlacement, 'label');
    assert.equal(copy.hasAttribute('style'), false);
    const next = symbol.cloneNode();
    next.getBoundingClientRect = () => ({left:56, top:2, width:128, height:44});
    symbol.replaceWith(next);
    await settle();
    assert.equal(copy.hasAttribute('style'), false);
    assert.equal(document.getElementById('atlas-page-heading'), heading);
    next.getBoundingClientRect = () => ({left:-24, top:2, width:128, height:44});
    toolbar.getBoundingClientRect = () => ({left:52, top:0, right:768, width:716, height:48});
    document.dispatchEvent(new window.Event('scroll'));
    assert.equal(copy.hasAttribute('style'), false, 'scrolling the symbol cannot clip or reposition the outside label');
    let cancelled = null, scheduled = 0;
    window.requestAnimationFrame = () => { scheduled++; return 19; };
    window.cancelAnimationFrame = id => { cancelled = id; };
    window.dispatchEvent(new window.Event('resize'));
    controller.destroy();
    assert.equal(scheduled, 0, 'a normal-flow label never schedules fixed placement work');
    assert.equal(cancelled, null);
    assert.equal(document.querySelector('#atlas-page-heading'), null);
  } finally {
    f.controller.destroy();
    for (const [name, descriptor] of Object.entries(frameGlobals)) {
      if (descriptor) Object.defineProperty(globalThis, name, descriptor);
      else delete globalThis[name];
    }
  }
});

test('label ownership is invariant for the four requested viewport reference boxes without measuring symbol geometry', () => {
  // Supplied boxes are model inputs only; Linkedom does not render these widths.
  for (const {width, box} of [
    {width:320, box:{left:4, top:854, width:88, height:44}},
    {width:390, box:{left:4, top:854, width:106, height:44}},
    {width:768, box:{left:56, top:2, width:128, height:44}},
    {width:1440, box:{left:56, top:1, width:128, height:36}},
  ]) {
    let measurements = 0;
    const f = fixture({beforeMount({document}) {
      document.querySelector('.symbol-selector-trigger').getBoundingClientRect = () => { measurements++; return box; };
    }});
    try {
      const {document, controller, heading} = f, copy = heading.parentElement;
      controller.sync(); controller.sync();
      const toolbar = document.querySelector('.atlas-canvas-heading');
      assert.equal(copy.dataset.headingPlacement, 'label', width + ': normal-flow placement');
      assert.equal(toolbar.nextElementSibling, copy);
      assert.equal(copy.hasAttribute('style'), false);
      assert.equal(copy.closest('.atlas-plot,.symbol-selector-trigger'), null);
      assert.equal(copy.hidden, false); assert.equal(heading.hidden, false);
      assert.equal(document.querySelectorAll('h1').length, 1);
      assert.equal(document.querySelectorAll('.symbol-selector-trigger').length, 1);
      assert.equal(heading.getAttribute('aria-describedby'), 'atlas-page-description');
      assert.equal(document.querySelectorAll('#atlas-page-description').length, 1);
      assert.equal(measurements, 0, width + ': the old symbol-overlap coordinates cannot be regenerated');
    } finally {f.controller.destroy();}
  }
});

test('returning from compare to the label releases resize owners and rejects queued fixed placement', () => {
  const f = observedCompareFixture();
  try {
    const {document, controller, heading, observer, frames} = f, copy = heading.parentElement;
    observer.notify(document.querySelector('.workspace'));
    assert.equal(frames.size, 1);
    document.body.dataset.page = 'outlook'; controller.sync();
    assert.equal(copy.dataset.headingPlacement, 'label');
    assert.equal(copy.hasAttribute('style'), false);
    assert.equal(observer.targets.size, 0, 'normal-flow labels have no fixed-placement observers');
    f.flushFrame();
    assert.equal(copy.hasAttribute('style'), false, 'an old compare frame cannot position the label');
    assert.equal(frames.size, 0);
    assert.equal(document.querySelectorAll('h1').length, 1);
    document.body.dataset.page = 'compare'; controller.sync();
    assert.equal(copy.dataset.headingPlacement, 'compare');
    assert.deepEqual([copy.style.left, copy.style.top, copy.style.width], ['48px','922.5px','68px']);
    assert.ok(observer.targets.has(document.querySelector('.lab-toolbar')));
    assert.equal(document.getElementById('atlas-page-heading'), heading);
  } finally {f.cleanup();}
});
