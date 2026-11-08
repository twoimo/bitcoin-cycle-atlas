import test from 'node:test';
import assert from 'node:assert/strict';
import { parseHTML } from 'linkedom';
import { mountCenterWorkbench } from '../dist/center-workbench.js';
import { CENTER_LOADING_TIMEOUT_MS } from '../dist/ui/center-loading.js';

const settle = () => new Promise(resolve => setImmediate(resolve));

async function fixture(t) {
  const { document, window: dom } = parseHTML('<html><head><meta name="atlas-service-base" content="/market-lab/"></head><body><header class="atlas-canvas-heading"><button class="symbol-selector-trigger">BTCUSD</button><button id="workbench-chart-type">선</button></header><nav><button data-atlas-page="outlook">가격 차트</button><button data-atlas-page="scenario">조건 실험</button><button data-atlas-page="data">자산 비교</button></nav></body></html>');
  const descriptors = new Map(['document', 'window', 'location', 'MutationObserver', 'CustomEvent'].map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  const listeners = new Map(), posts = [], histories = [], timers = new Map();
  let now = 0, timerId = 0;
  t.mock.method(globalThis, 'setTimeout', (callback, delay) => { const id = ++timerId; timers.set(id, { callback, due: now + delay }); return id; });
  t.mock.method(globalThis, 'clearTimeout', id => timers.delete(id));
  const window = { parent: null, addEventListener: (type, listener) => listeners.set(type, listener), history: {
    pushState: (_state, _title, url) => histories.push(url), replaceState: (_state, _title, url) => histories.push(url),
  } };
  window.parent = window;
  const location = new URL('https://atlas.example/?symbol=BTCUSD');
  for (const [key, value] of Object.entries({ document, window, location, MutationObserver: dom.MutationObserver, CustomEvent: dom.CustomEvent })) Object.defineProperty(globalThis, key, { value, configurable: true });
  t.after(() => {
    listeners.get('pagehide')?.();
    for (const [key, descriptor] of descriptors) { if (descriptor) Object.defineProperty(globalThis, key, descriptor); else Reflect.deleteProperty(globalThis, key); }
  });
  const create = document.createElement.bind(document);
  document.createElement = tag => {
    const node = create(tag);
    if (tag === 'iframe') {
      const child = parseHTML('<html data-boot="loading"><body></body></html>');
      Object.defineProperty(node, 'contentDocument', { value: child.document, configurable: true });
      Object.defineProperty(node, 'contentWindow', { value: { postMessage: message => posts.push(message) } });
    }
    return node;
  };
  mountCenterWorkbench();
  const plot = create('section'); plot.className = 'atlas-plot'; plot.innerHTML = '<svg id="native-chart"></svg>'; document.body.append(plot);
  await settle();
  const selectedFrame = () => [...document.querySelectorAll('iframe')].find(node => !node.hidden);
  const click = page => document.querySelector(`[data-atlas-page="${page}"]`).dispatchEvent(new dom.Event('click', { bubbles: true, cancelable: true }));
  const select = symbol => document.dispatchEvent(new dom.CustomEvent('atlas:symbol-select', { cancelable: true, detail: { symbol } }));
  const receive = (data, { source = selectedFrame()?.contentWindow, origin = location.origin } = {}) => listeners.get('message')({ data, source, origin });
  const ready = (symbol, epoch, overrides = {}) => ({
    kind: 'atlas:chart-state', ready: true, symbol, epoch, unit: symbol === 'HYPE' ? 'USDC' : 'USD', timezone: 'America/New_York',
    start: '2025-01-01', end: '2026-01-01', first: '2010-02-11', last: '2026-01-01', selected: '2026-01-01', close: 50,
    frequency: 'daily', frequencies: ['daily', 'weekly'], scale: 'log', chartType: 'line', tool: 'crosshair', magnet: 'off',
    autoScale: true, candles: true, canUndo: false, canRedo: false, measurement: false, ...overrides,
  });
  const advance = milliseconds => { now += milliseconds; for (const [id, timer] of [...timers]) if (timer.due <= now) { timers.delete(id); timer.callback(); } };
  const lifecycle = (type, persisted) => listeners.get(type)?.({ persisted });
  return { document, dom, plot, selectedFrame, click, select, receive, ready, advance, lifecycle, location, posts, histories, timers };
}

test('a frame load or route acknowledgement cannot expose a previous instrument as the requested chart', async t => {
  const f = await fixture(t);
  f.select('TQQQ');
  const frame = f.selectedFrame(), toolbar = f.document.getElementById(frame.dataset.toolbarId);
  const assertPending = () => {
    assert.equal(frame.dataset.centerStatus, 'loading');
    assert.equal(frame.inert, true);
    assert.equal(frame.getAttribute('aria-hidden'), 'true');
    assert.equal(toolbar.inert, true);
    assert.ok(f.plot.querySelector('.atlas-skeleton'));
  };
  assertPending();
  frame.dispatchEvent(new f.dom.Event('load'));
  assertPending();
  f.receive({ kind: 'atlas:center-state', page: 'rsi', symbol: 'TQQQ', epoch: 1 });
  assertPending();
  for (const packet of [f.ready('SOXL', 1), f.ready('TQQQ', 0), f.ready('TQQQ', 1, { unit: 'KRW' }), f.ready('TQQQ', 1, { ready: false })]) {
    f.receive(packet); assertPending();
  }
  f.receive(f.ready('TQQQ', 1), { origin: 'https://foreign.example' }); assertPending();
  f.receive(f.ready('TQQQ', 1), { source: {} }); assertPending();
  f.receive(f.ready('TQQQ', 1));
  assert.equal(frame.dataset.centerStatus, 'ready');
  assert.equal(frame.inert, false);
  assert.equal(frame.hasAttribute('aria-hidden'), false);
  assert.equal(toolbar.inert, false);
  assert.equal(f.plot.querySelector('.atlas-center-loading'), null);
  assert.equal(f.timers.size, 0);

  f.select('SOXL');
  assert.equal(f.selectedFrame(), frame, 'navigation retains the existing React/data owner');
  assertPending();
  assert.equal(frame.title, 'SOXL 가격 차트');
  f.receive(f.ready('TQQQ', 1)); assertPending();
  f.receive(f.ready('SOXL', 1)); assertPending();
  f.receive(f.ready('SOXL', 2));
  assert.equal(frame.dataset.centerStatus, 'ready');
});

test('silent frame failure ends with retry and rejects late readiness from the failed document', async t => {
  const f = await fixture(t);
  f.select('HYPE');
  const oldFrame = f.selectedFrame();
  f.advance(CENTER_LOADING_TIMEOUT_MS - 1);
  assert.equal(oldFrame.dataset.centerStatus, 'loading');
  f.advance(1);
  assert.equal(oldFrame.dataset.centerStatus, 'error');
  assert.equal(oldFrame.inert, true);
  assert.equal(f.plot.querySelector('.atlas-skeleton'), null, 'terminal failure removes every loading placeholder');
  assert.match(f.plot.querySelector('[role="alert"]').textContent, /화면을 불러오지 못했습니다/);
  const retry = f.plot.querySelector('.atlas-center-error button');
  assert.equal(retry.disabled, false);
  assert.equal(retry.textContent, '재시도');
  const historyCount = f.histories.length;
  f.receive(f.ready('HYPE', 1));
  assert.equal(oldFrame.dataset.centerStatus, 'error', 'late success cannot resurrect a failed scope');
  assert.equal(f.document.body.dataset.chartControls, 'loading', 'late failure acknowledgements cannot enable controls');
  retry.click();
  const nextFrame = f.selectedFrame();
  assert.notEqual(nextFrame, oldFrame);
  assert.equal(oldFrame.isConnected, false);
  assert.equal(nextFrame.dataset.centerEpoch, '2');
  assert.equal(nextFrame.dataset.centerStatus, 'loading');
  assert.equal(f.document.querySelectorAll('.center-workspace-toolbar').length, 1, 'old portals are discarded with their failed document');
  assert.equal(f.histories.length, historyCount, 'retry does not rewrite chart settings or create a history entry');
  f.receive(f.ready('HYPE', 2), { source: oldFrame.contentWindow });
  oldFrame.dispatchEvent(new f.dom.Event('load'));
  retry.click();
  assert.equal(f.selectedFrame(), nextFrame, 'a detached retry cannot restart the new request');
  assert.equal(nextFrame.dataset.centerStatus, 'loading');
  f.receive(f.ready('HYPE', 1));
  assert.equal(nextFrame.dataset.centerStatus, 'loading');
  f.receive(f.ready('HYPE', 2));
  assert.equal(nextFrame.dataset.centerStatus, 'ready');
  assert.equal(f.plot.querySelector('.atlas-center-error'), null);
  f.advance(CENTER_LOADING_TIMEOUT_MS * 2);
  assert.equal(nextFrame.dataset.centerStatus, 'ready');
});

test('restoring the native chart cancels the failed/pending frame owner and its timeout', async t => {
  const f = await fixture(t);
  f.select('TQQQ'); const oldFrame = f.selectedFrame();
  f.select('BTCUSD');
  assert.equal(oldFrame.hidden, true);
  assert.equal(f.plot.querySelector('.atlas-center-loading'), null);
  assert.equal(f.timers.size, 0);
  f.advance(CENTER_LOADING_TIMEOUT_MS * 2);
  f.receive(f.ready('TQQQ', 1), { source: oldFrame.contentWindow });
  assert.equal(f.document.body.dataset.centerTool, undefined);
  assert.equal(f.plot.querySelector('#native-chart').hasAttribute('aria-hidden'), false);
  assert.equal(f.plot.querySelector('.atlas-center-error'), null);
});

test('non-chart workspaces acknowledge their actual page while legacy documents wait for ready or visible error', async t => {
  const f = await fixture(t);
  f.click('scenario'); const appFrame = f.selectedFrame();
  appFrame.dispatchEvent(new f.dom.Event('load'));
  assert.equal(appFrame.dataset.centerStatus, 'loading');
  f.receive({ kind: 'atlas:center-state', page: 'market-us', symbol: 'TQQQ', epoch: 1 });
  assert.equal(appFrame.dataset.centerStatus, 'loading');
  f.receive({ kind: 'atlas:center-state', page: 'scenario', symbol: 'TQQQ', epoch: 1 });
  assert.equal(appFrame.dataset.centerStatus, 'ready');
  f.click('data'); const legacy = f.selectedFrame();
  assert.notEqual(legacy, appFrame);
  legacy.dispatchEvent(new f.dom.Event('load'));
  assert.equal(legacy.dataset.centerStatus, 'loading');
  legacy.contentDocument.documentElement.dataset.boot = 'error';
  legacy.contentDocument.dispatchEvent(new f.dom.Event('atlas:boot-error'));
  assert.equal(legacy.dataset.centerStatus, 'ready', 'the child error and its retry must remain reachable');
  assert.equal(f.plot.querySelector('.atlas-center-loading'), null);
});

for (const phase of ['loading', 'error', 'ready']) test(`BFCache restoration rebinds a ${phase} chart without accepting stale readiness or writing URL state`, async t => {
  const f = await fixture(t);
  assert.equal(f.histories.length, 0, 'initial setup does not write URL state');
  f.lifecycle('pageshow', false);
  assert.equal(f.histories.length, 0, 'ordinary initial pageshow is not a chart edit');
  f.select('TQQQ');
  const frame = f.selectedFrame();
  if (phase === 'error') f.advance(CENTER_LOADING_TIMEOUT_MS);
  if (phase === 'ready') f.receive(f.ready('TQQQ', 1));
  assert.equal(frame.dataset.centerStatus, phase);
  // The browser restores this exact entry, including user-owned chart keys.
  f.location.href = 'https://atlas.example/market-lab/charts/?symbol=TQQQ&granularity=weekly&axis=linear&view-start=2023-01-01&view-end=2026-01-01';
  const restoredUrl = f.location.href, writes = f.histories.length;
  f.lifecycle('pagehide', true);
  assert.equal(f.timers.size, 0);
  assert.equal(f.plot.querySelector('.atlas-center-loading'), null);
  f.receive(f.ready('TQQQ', 1));
  assert.equal(frame.dataset.centerStatus, phase, 'messages queued during suspension do not change the retired owner');
  f.lifecycle('pageshow', true);
  assert.equal(f.selectedFrame(), frame, 'BFCache keeps the actual child and its cached view');
  assert.equal(frame.dataset.centerEpoch, '2');
  assert.equal(frame.dataset.centerStatus, 'loading');
  assert.equal(frame.inert, true);
  assert.equal(f.timers.size, 1, 'the restored owner has a fresh finite deadline');
  assert.ok(f.plot.querySelector('.atlas-skeleton'));
  assert.deepEqual(f.posts.at(-1), { kind: 'atlas:center-navigate', page: 'rsi', symbol: 'TQQQ', epoch: 2 });
  f.receive(f.ready('TQQQ', 1));
  assert.equal(frame.dataset.centerStatus, 'loading', 'pre-cache acknowledgements cannot release the restored gate');
  f.receive(f.ready('TQQQ', 2));
  assert.equal(frame.dataset.centerStatus, 'ready');
  assert.equal(frame.inert, false);
  assert.equal(f.plot.querySelector('.atlas-center-loading'), null);
  assert.equal(f.histories.length, writes);
  assert.equal(f.location.href, restoredUrl);
  f.lifecycle('pageshow', true);
  assert.equal(frame.dataset.centerEpoch, '2', 'a repeated pageshow cannot restart an already restored owner');
  assert.equal(f.histories.length, writes);
});

test('a BFCache-restored silent failure still exposes retry and retires its previous epoch', async t => {
  const f = await fixture(t);
  f.select('HYPE'); const retained = f.selectedFrame();
  f.advance(CENTER_LOADING_TIMEOUT_MS);
  const oldRetry = f.plot.querySelector('.atlas-center-error button');
  const writes = f.histories.length;
  f.lifecycle('pagehide', true);
  f.lifecycle('pageshow', true);
  oldRetry.click();
  assert.equal(f.selectedFrame(), retained, 'the removed error action cannot revive the pre-cache request');
  f.advance(CENTER_LOADING_TIMEOUT_MS);
  assert.equal(retained.dataset.centerStatus, 'error');
  const retry = f.plot.querySelector('.atlas-center-error button');
  assert.ok(retry);
  retry.click(); const current = f.selectedFrame();
  assert.notEqual(current, retained);
  assert.equal(current.dataset.centerEpoch, '3');
  f.receive(f.ready('HYPE', 3), { source: retained.contentWindow });
  assert.equal(current.dataset.centerStatus, 'loading');
  f.receive(f.ready('HYPE', 3));
  assert.equal(current.dataset.centerStatus, 'ready');
  assert.equal(f.histories.length, writes, 'automatic recovery and explicit retry preserve the current URL entry');
});

test('BFCache restoration cannot replace a newer chart selection or restart a native chart', async t => {
  const f = await fixture(t);
  f.lifecycle('pageshow', true);
  assert.equal(f.selectedFrame(), undefined);
  assert.equal(f.histories.length, 0);
  f.select('TQQQ');
  f.lifecycle('pagehide', true);
  f.select('SOXL');
  const frame = f.selectedFrame(), writes = f.histories.length;
  f.lifecycle('pageshow', true);
  assert.equal(frame.dataset.centerEpoch, '2');
  assert.equal(frame.title, 'SOXL 가격 차트');
  assert.equal(f.histories.length, writes);
  f.receive(f.ready('SOXL', 2));
  assert.equal(frame.dataset.centerStatus, 'ready');
  f.lifecycle('pagehide', true);
  f.select('BTCUSD');
  f.lifecycle('pageshow', true);
  assert.equal(f.document.body.dataset.centerTool, undefined);
  assert.equal(frame.hidden, true);
  assert.equal(f.timers.size, 0);
  assert.equal(f.plot.querySelector('.atlas-center-loading'), null);
});
