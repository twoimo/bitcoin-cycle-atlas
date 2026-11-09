import test from 'node:test';
import assert from 'node:assert/strict';
import { parseHTML } from 'linkedom';
import { initAtlasShell } from '../../dist/atlas-shell.js';

test('current navigation follows the open workspace through first chart construction, switches and return', async t => {
  const { document, window } = parseHTML('<html><body data-page="outlook" data-center-tool="market-us"><aside class="atlas-sidebar"><button class="atlas-brand"><div>Cycle Atlas</div></button><nav class="atlas-nav"><button data-view="outlook"><span>가격 차트</span></button><button data-view="market"><span>시장 분석</span></button></nav></aside><div class="workspace"><main></main></div></body></html>');
  const originals = new Map(['document', 'MutationObserver', 'Element'].map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  Object.defineProperty(globalThis, 'document', { configurable: true, value: document });
  Object.defineProperty(globalThis, 'MutationObserver', { configurable: true, value: window.MutationObserver });
  Object.defineProperty(globalThis, 'Element', { configurable: true, value: window.Element });
  const nav = document.querySelector('.atlas-nav')!;
  const stop = initAtlasShell();
  t.after(() => { stop?.(); for (const [key, old] of originals) { if (old) Object.defineProperty(globalThis, key, old); else Reflect.deleteProperty(globalThis, key); } });
  const settle = () => new Promise(resolve => setImmediate(resolve));
  const selected = () => [...nav.querySelectorAll('[aria-current="page"]')].map(node => (node as HTMLElement).dataset.atlasPage);
  assert.deepEqual(selected(), ['market-us']);

  // The price-chart chrome is mounted after the shell and reuses this same nav.
  const rail = document.createElement('aside'); rail.className = 'workbench-rail';
  const heading = document.createElement('header'); heading.className = 'mobile-tray-heading';
  const extras = document.createElement('nav'); extras.className = 'mobile-extra-actions';
  const tools = document.createElement('nav'); tools.className = 'workbench-detail-tools';
  const stage = document.createElement('section'); stage.className = 'atlas-chart-stage';
  stage.innerHTML = '<header class="atlas-canvas-heading"><button id="original-symbol" aria-label="TQQQ 종목 선택">삼플레</button></header><div class="atlas-plot"></div>';
  document.querySelector('.workspace main')!.append(stage);
  const toolbar = stage.querySelector('.atlas-canvas-heading')!;
  const symbol = toolbar.firstElementChild;
  const toolbarMarkup = toolbar.outerHTML;
  rail.append(heading, extras, tools, nav);
  document.querySelector('.workspace')!.append(rail);
  await settle();
  assert.equal(document.querySelector('.atlas-nav'), nav);
  assert.deepEqual([...rail.children], [heading, extras, nav, tools]);
  assert.deepEqual(selected(), ['market-us'], 'mounting the background price chart cannot select its destination');
  const intro = stage.querySelector('[data-page-intro]')!;
  const description = intro.querySelector('p')!;
  const descriptionFields = [...description.children];
  assert.equal(toolbar.nextElementSibling, intro);
  assert.equal(intro.querySelector('h1')!.textContent, '시장 분석');
  assert.match(description.textContent!, /FRED/);assert.match(description.textContent!, /수동/);
  assert.equal(descriptionFields.length, 2);

  assert.equal(nav.querySelectorAll('[data-atlas-page="outlook"]').length, 1);
  assert.equal(nav.querySelector('[data-atlas-page="rsi"]'), null);
  for (const [workspace, destination, context] of [
    ['rsi', 'outlook', /Yahoo/], ['housing', 'outlook', /한국부동산원/], ['themes', 'outlook', /Hyperliquid/],
    ['scenario', 'market-us', /입력.*재계산/], ['cashflow', 'market-us', /입력.*재계산/],
    ['data', 'data', /자산별|종목별/], ['ipo', 'ipo', /KST|한국 날짜/], ['evidence', 'evidence', /게시/],
  ] as const) {
    document.body.dataset.centerTool = workspace;
    await settle();
    assert.deepEqual(selected(), [destination], workspace);
    assert.equal(toolbar.nextElementSibling, intro);
    assert.equal(intro.getAttribute('data-page-intro'), destination === 'market-us' ? 'market' : destination);
    assert.equal(intro.querySelector('h1')!.getAttribute('aria-describedby'), intro.querySelector('p')!.id);
    assert.match(description.textContent!, context, workspace);
    assert.deepEqual([...description.children], descriptionFields, 'context updates retain the two description fields');
    assert.equal(toolbar.firstElementChild, symbol);
    assert.equal(toolbar.outerHTML, toolbarMarkup);
  }
  delete document.body.dataset.centerTool;
  await settle();
  assert.deepEqual(selected(), ['outlook']);
  assert.match(description.textContent!, /Coin Metrics/);assert.match(description.textContent!, /공개본 6시간 확인/);
  document.dispatchEvent(new window.CustomEvent('atlas:workbench-state', {detail:{frequency:'1h',chartType:'line',marketSeries:{source:'Coinbase Exchange'}}}));
  assert.match(description.textContent!, /Coinbase/);assert.match(description.textContent!, /수동/);assert.doesNotMatch(description.textContent!, /6시간/);
  document.body.dataset.market = 'MSTR';await settle();
  assert.match(description.textContent!, /Yahoo/);assert.match(description.textContent!, /수동/);
  document.body.dataset.centerTool = 'housing';
  document.body.dataset.page = 'evidence';
  await settle();
  assert.equal(nav.parentElement, document.querySelector('.atlas-sidebar'));
  assert.deepEqual(selected(), ['evidence'], 'a direct dashboard page owns its current destination');
  assert.equal(intro.parentElement, document.querySelector('.atlas-dashboard-header'));
  assert.match(description.textContent!, /게시/);
  const directDescription = description.textContent;
  document.dispatchEvent(new window.CustomEvent('atlas:active-symbol', {detail:{symbol:'ETHUSD'}}));
  document.dispatchEvent(new window.CustomEvent('atlas:workbench-state', {detail:{frequency:'daily',marketSeries:{source:'Coinbase Exchange'}}}));
  assert.equal(description.textContent, directDescription, 'late background chart events cannot replace a direct research page context');
});
