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
  rail.append(heading, extras, tools, nav);
  document.querySelector('.workspace')!.append(rail);
  await settle();
  assert.equal(document.querySelector('.atlas-nav'), nav);
  assert.deepEqual([...rail.children], [heading, extras, nav, tools]);
  assert.deepEqual(selected(), ['market-us'], 'mounting the background price chart cannot select its destination');

  assert.equal(nav.querySelectorAll('[data-atlas-page="outlook"]').length, 1);
  assert.equal(nav.querySelector('[data-atlas-page="rsi"]'), null);
  for (const [workspace, destination] of [['rsi', 'outlook'], ['housing', 'outlook'], ['themes', 'outlook'], ['scenario', 'market-us'], ['cashflow', 'market-us'], ['data', 'data'], ['ipo', 'ipo'], ['evidence', 'evidence']]) {
    document.body.dataset.centerTool = workspace;
    await settle();
    assert.deepEqual(selected(), [destination], workspace);
  }
  delete document.body.dataset.centerTool;
  await settle();
  assert.deepEqual(selected(), ['outlook']);
  document.body.dataset.centerTool = 'housing';
  document.body.dataset.page = 'evidence';
  await settle();
  assert.equal(nav.parentElement, document.querySelector('.atlas-sidebar'));
  assert.deepEqual(selected(), ['evidence'], 'a direct dashboard page owns its current destination');
});
