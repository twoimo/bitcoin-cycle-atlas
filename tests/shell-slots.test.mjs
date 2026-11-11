import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {parseHTML} from 'linkedom';
import {mountShellSlots, refreshShellSlots, SHELL_SLOT_KEYS} from '../dist/ui/shell-slots.js';

const settle = () => new Promise(resolve => setImmediate(resolve));
function fixture() {
  const {document, window} = parseHTML(`<html><body data-shell="chart"><main class="atlas-workbench">
    <header class="atlas-canvas-heading"><button class="workbench-symbol">BTCUSD</button><div id="workbench-frequency"><select id="workbench-interval-select"></select></div><button id="workbench-chart-type">type</button><button id="atlas-mode-menu">indicators</button><button id="workbench-scenario">scenario</button><button id="atlas-cycle-panel">cycle</button><span class="workbench-spacer"></span><button id="workbench-workspace">workspace</button><button id="workbench-chart-menu">menu</button><button id="lab-svg">export</button><button id="atlas-display-options">settings</button><button class="mobile-workbench-button">mobile</button></header>
    <div class="atlas-plot"><svg id="source-chart" aria-label="source chart"><path d="M0 0L10 10"/></svg></div>
    <footer class="workbench-bottom-bar"><div class="workbench-range-controls"><button data-chart-span="focus">4년</button></div><button id="workbench-go-date">date</button><div class="workbench-event-slot"><button id="history-journal-toggle">records</button></div><span id="workbench-range-label">range</span><div class="workbench-axis"><button id="workbench-scale">scale</button><button id="workbench-auto-scale">auto</button><button id="workbench-fit">fit</button></div><div class="workbench-status">source clock</div><button id="workbench-bottom-more">more</button></footer>
    </main><nav class="workbench-tools"><button data-chart-tool="crosshair">crosshair</button><button data-chart-tool="pan">pan</button><button data-chart-tool="measure">measure</button><button id="workbench-magnet">magnet</button><button id="workbench-clear" disabled>clear</button><div id="workbench-navigation"><div class="chart-navigation">${['left','out','in','right','reset'].map(action => `<button data-chart-navigation="${action}">${action}</button>`).join('')}</div></div><button id="workbench-annotations">annotations</button></nav>
    <aside class="workbench-rail"><nav class="atlas-nav">${['outlook','market-us','evidence','data','ipo','relay','conference'].map(page => `<a data-atlas-page="${page}" href="/?page=${page}">${page}</a>`).join('')}</nav><nav class="workbench-detail-tools">${['selection','layers','math','events'].map(kind => `<button data-reader="${kind}">${kind}</button>`).join('')}</nav><button class="workbench-help">help</button></aside></body></html>`);
  return {document, window};
}

test('all 12 symbols retain the same ordered slots and original command nodes', () => {
  const {document, window} = fixture();
  const original = new Map([...document.querySelectorAll('button,a,select,svg,path')].map(node => [node, node.parentElement]));
  const source = document.querySelector('#source-chart').outerHTML;
  let changes = 0;
  const scenario = document.querySelector('#workbench-scenario');
  scenario.addEventListener('click', () => changes++);
  const history = document.createElement('div'); history.className = 'workspace-history-controls';
  history.innerHTML = '<button id="workbench-undo" disabled>undo</button><button id="workbench-redo" disabled>redo</button>';
  document.querySelector('.atlas-canvas-heading').append(history);
  for (const symbol of ['BTCUSD','ETHUSD','MSTR','BMNR','TQQQ','SOXL','233740','HYPE','HOUSING-BUSAN','HOUSING-SEOUL','HOUSING-GYEONGGI','HOUSING-NATIONAL']) {
    refreshShellSlots(document, {symbol});
    for (const region of ['top','bottom','left','right']) {
      const slots = [...document.querySelectorAll(`[data-shell-region="${region}"] [data-shell-owner="${region}"]`)];
      assert.deepEqual(slots.map(node => node.dataset.shellKey), SHELL_SLOT_KEYS[region], `${symbol} ${region}`);
      assert.deepEqual(slots.map(node => Number(node.dataset.shellSlot)), SHELL_SLOT_KEYS[region].map((_, index) => index + 1));
    }
    assert.equal(document.querySelector('.atlas-workbench').getAttribute('aria-label'), `${symbol} 가격 차트`);
    assert.equal(scenario.closest('[data-shell-slot="5"]').dataset.shellKey, 'instrument');
    scenario.dispatchEvent(new window.Event('click'));
  }
  assert.equal(changes, 12, 'moving a real control preserves its handler');
  for (const node of original.keys()) assert.ok(node.isConnected, 'no source-owned node is replaced');
  assert.equal(document.querySelector('#source-chart').outerHTML, source, 'the source chart and its disclosure remain untouched');
  assert.equal(document.querySelector('#workbench-clear').disabled, true, 'slot normalization cannot grant a disabled action');
});

test('native disabled commands explain the unavailable state and clear only shell-owned hints', () => {
  const {document} = fixture();
  const clear = document.querySelector('#workbench-clear');
  refreshShellSlots(document, {symbol:'MSTR'});
  assert.equal(clear.getAttribute('aria-description'), '완료한 측정이 없습니다.');
  assert.equal(clear.dataset.disabledReason, '완료한 측정이 없습니다.');
  assert.equal(clear.disabled, true);
  clear.disabled = false;
  refreshShellSlots(document);
  assert.equal(clear.hasAttribute('aria-description'), false);
  assert.equal(clear.hasAttribute('data-disabled-reason'), false);
  clear.disabled = true;
  clear.setAttribute('data-disabled-reason', '자료 제공자가 이 기능을 지원하지 않습니다.');
  clear.setAttribute('aria-description', '자료 제공자가 이 기능을 지원하지 않습니다.');
  refreshShellSlots(document);
  assert.equal(clear.dataset.disabledReason, '자료 제공자가 이 기능을 지원하지 않습니다.', 'source-specific capability reasons remain authoritative');
});

test('late native identity, history and replay mounts settle without duplicate slots or URL writes', async t => {
  const {document, window} = fixture();
  let writes = 0;
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'history');
  Object.defineProperty(globalThis, 'history', {configurable:true, value:{pushState(){writes++;},replaceState(){writes++;}}});
  const controller = mountShellSlots(document);
  t.after(() => {controller.destroy(); if (previous) Object.defineProperty(globalThis, 'history', previous); else Reflect.deleteProperty(globalThis, 'history');});
  // site-entry sets this after initAtlasShell, before its native chart loads.
  document.documentElement.dataset.symbol = 'ETHUSD';
  await settle();
  assert.equal(document.querySelector('.atlas-workbench').getAttribute('aria-label'), 'ETHUSD 가격 차트');
  const heading = document.querySelector('.atlas-canvas-heading');
  const history = document.createElement('div'); history.className = 'workspace-history-controls';
  history.innerHTML = '<button id="workbench-undo">undo</button><button id="workbench-redo">redo</button>';
  heading.insertBefore(history, document.querySelector('#workbench-workspace'));
  const replay = document.createElement('button'); replay.id = 'workbench-replay';
  heading.insertBefore(replay, heading.querySelector('.workbench-spacer'));
  await settle();
  assert.equal(heading.querySelectorAll('[data-shell-owner="top"]').length, 10);
  assert.equal(Boolean(heading.querySelector('.shell-history-slot')), false);
  assert.equal(history.dataset.shellSlot, '6');
  assert.equal(replay.parentElement.dataset.shellSlot, '5');
  assert.equal(heading.lastElementChild.className, 'mobile-workbench-button');
  document.dispatchEvent(new window.CustomEvent('atlas:active-symbol', {detail:{symbol:'TQQQ'}}));
  await settle();
  assert.equal(document.querySelector('.atlas-workbench').getAttribute('aria-label'), 'TQQQ 가격 차트');
  assert.equal(writes, 0, 'initial boot and symbol announcements do not record navigation or URL state');
});

test('hosted chart tools share instrument slot; nonchart portals remain direct and usable', () => {
  const {document} = fixture();
  const heading = document.querySelector('.atlas-canvas-heading');
  const host = document.createElement('div'); host.className = 'center-workspace-toolbar';
  const action = document.createElement('button'); action.textContent = 'Actual hosted action'; host.append(action); heading.append(host);
  document.body.dataset.centerTool = 'rsi'; document.body.dataset.chartControls = 'ready';
  refreshShellSlots(document, {symbol:'TQQQ'});
  assert.equal(host.parentElement.dataset.shellSlot, '5');
  assert.equal(host.firstChild, action);
  delete document.body.dataset.chartControls; document.body.dataset.centerTool = 'data';
  refreshShellSlots(document);
  assert.equal(host.parentElement, heading, 'existing nonchart direct-child visibility contract survives');
  assert.equal(host.firstChild, action, 'the React portal owner is never replaced');
});

test('mobile BTC, native and hosted feature groups leave horizontal gestures to the outer toolbar', () => {
  const css = readFileSync(new URL('../dist/atlas-shell.css', import.meta.url), 'utf8');
  for (const symbol of ['BTCUSD', 'ETHUSD', 'MSTR', 'BMNR', 'TQQQ']) {
    const {document} = fixture();
    const heading = document.querySelector('.atlas-canvas-heading');
    if (['ETHUSD', 'MSTR', 'BMNR'].includes(symbol)) {
      heading.classList.add('eth-topbar');
      heading.parentElement.classList.add('native-chart-workbench');
    }
    if (symbol === 'TQQQ') {
      document.body.dataset.centerTool = 'rsi';
      document.body.dataset.chartControls = 'ready';
    }
    const action = document.querySelector('#workbench-scenario');
    action.classList.add('workbench-icon');
    refreshShellSlots(document, {symbol});
    const group = heading.querySelector('.shell-instrument-slot');
    const style = document.createElement('style'); style.textContent = css; document.head.append(style);
    // Inspect the actual mobile override rules. Native Chrome remains the
    // authority for hit testing and touch scrolling; this guards the nested
    // scroll structure that previously trapped the 320px toolbar gesture.
    const mobileRules = [...style.sheet.cssRules]
      .filter(rule => rule.type === 4 && rule.media.mediaText === '(max-width:620px)')
      .flatMap(rule => [...rule.cssRules]);
    const mobileStyle = node => Object.assign({}, ...mobileRules
      .filter(rule => rule.selectorText && !rule.selectorText.includes('::') && node.matches(rule.selectorText))
      .map(rule => Object.fromEntries(Array.from({length:rule.style.length}, (_, i) => [rule.style[i], rule.style.getPropertyValue(rule.style[i])]))));
    const outer = mobileStyle(heading), feature = mobileStyle(group), control = mobileStyle(action);
    assert.equal(action.parentElement, group, `${symbol}: original action remains in slot 5`);
    assert.equal(group.dataset.shellSlot, '5');
    assert.equal(outer['overflow-x'], 'auto', `${symbol}: outer row owns horizontal scrolling`);
    assert.equal(outer['max-width'], '100%', `${symbol}: outer row stays within the viewport`);
    assert.equal(outer['touch-action'], 'pan-x pinch-zoom');
    assert.equal(feature['flex-grow'], '0');
    assert.equal(feature['flex-shrink'], '0', `${symbol}: feature contents retain their width in the row`);
    assert.equal(feature['flex-basis'], 'auto');
    assert.equal(feature['max-width'], 'none', `${symbol}: no nested narrow scroll viewport`);
    assert.equal(feature['overflow-x'], 'visible', `${symbol}: touch can reach the outer scroll owner`);
    assert.equal(feature['overflow-y'], 'visible', `${symbol}: no implicit horizontal scroll container`);
    assert.equal(feature['overscroll-behavior-x'], 'auto', `${symbol}: group cannot contain the outer gesture`);
    assert.equal(control['min-width'], '44px');
    assert.equal(control['min-height'], '44px');
  }
});
