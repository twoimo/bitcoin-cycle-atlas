import test from 'node:test';
import assert from 'node:assert/strict';
import { parseHTML } from 'linkedom';
import { initAtlasShell } from '../../dist/atlas-shell.js';
import { readShellPreference, writeShellPreference, SHELL_STORAGE_KEY } from '../../dist/atlas-shell-state.js';
import { renderToStaticMarkup } from 'react-dom/server';
import { DashboardChrome } from '../../apps/web/src/components/app-shell.js';
import { atlasPageDescription } from '../../dist/ui/page-description.js';

test('dashboard/chart shell moves the existing navigation without replacing handlers or owner controls', async t => {
  const { document, window } = parseHTML('<html><body data-page="data"><aside class="atlas-sidebar"><button class="atlas-brand"><div>Cycle Atlas</div></button><nav class="atlas-nav"><button data-view="outlook">통합 차트</button><button data-view="market">세 축 연구실</button></nav></aside><div class="workspace"><main><div class="daily-heading"><button id="export">CSV</button></div></main></div></body></html>');
  const originals = new Map(['document', 'MutationObserver', 'Element'].map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  Object.defineProperty(globalThis, 'document', { configurable: true, value: document });
  Object.defineProperty(globalThis, 'MutationObserver', { configurable: true, value: window.MutationObserver });
  Object.defineProperty(globalThis, 'Element', { configurable: true, value: window.Element });
  const nav = document.querySelector('.atlas-nav')!, exportButton = document.getElementById('export')!;
  let clicks = 0; nav.querySelector('button')!.addEventListener('click', () => clicks++);
  const stop = initAtlasShell();
  t.after(() => { stop?.(); for (const [key, old] of originals) { if (old) Object.defineProperty(globalThis, key, old); else Reflect.deleteProperty(globalThis, key); } });
  assert.equal(document.body.dataset.shell, 'dashboard');
  assert.equal(nav.parentElement, document.querySelector('.atlas-dashboard-nav'));
  assert.equal(document.body.dataset.shellWidth, 'wide');
  assert.equal(exportButton.parentElement, document.querySelector('.daily-heading'));
  const rail = document.createElement('aside'); rail.className = 'workbench-rail'; document.querySelector('.workspace')!.append(rail);
  document.body.dataset.page = 'outlook'; await new Promise(resolve => setImmediate(resolve));
  assert.equal(nav.parentElement, rail); assert.equal(document.body.dataset.shell, 'chart');
  nav.querySelector('button')!.dispatchEvent(new window.Event('click', { bubbles: true })); assert.equal(clicks, 1);
  document.body.dataset.page = 'evidence'; await new Promise(resolve => setImmediate(resolve));
  assert.equal(nav.parentElement, document.querySelector('.atlas-dashboard-header > .atlas-dashboard-nav'));
  assert.equal(document.querySelectorAll('.atlas-nav').length, 1);
  assert.equal(document.querySelector('.atlas-nav'), nav);
  assert.equal(document.body.dataset.shellWidth, 'standard');
  nav.querySelector('button')!.dispatchEvent(new window.Event('click', { bubbles: true })); assert.equal(clicks, 2);
  assert.equal(document.querySelector('.atlas-shell-heading')!.textContent, '리서치');
  const pageHeading = document.querySelector('.atlas-shell-heading')!;
  assert.equal(document.getElementById(pageHeading.getAttribute('aria-describedby')!)!.textContent, atlasPageDescription('evidence').description);
  assert.equal(exportButton.parentElement, document.querySelector('.daily-heading'));
  document.body.dataset.page = 'outlook'; await new Promise(resolve => setImmediate(resolve));
  assert.equal(nav.parentElement, rail);
  assert.equal(document.body.dataset.shellWidth, undefined);
  assert.equal(document.querySelector('.atlas-dashboard-nav'), null);
  nav.querySelector('button')!.dispatchEvent(new window.Event('click', { bubbles: true })); assert.equal(clicks, 3);
});

test('the React standalone shell keeps its actual title and current destination with the shared description', () => {
  for (const [page, title] of [['rsi','삼플레 · 가격 차트'], ['market-kr','국내 시장 진단'], ['scenario','조건 실험']]) {
    const html = renderToStaticMarkup(<DashboardChrome title={title} currentPage={page} chartSymbol="TQQQ" onNavigate={() => {}}/>);
    const {document} = parseHTML(`<html><body>${html}</body></html>`);
    const heading = document.querySelector('h1')!;
    assert.equal(heading.textContent, title);
    assert.equal(document.getElementById(heading.getAttribute('aria-describedby')!)!.textContent, atlasPageDescription(page).description);
    assert.equal(document.querySelectorAll('#atlas-page-description').length, 1);
    assert.equal(document.querySelector('[aria-current="page"]')!.getAttribute('data-atlas-page'), page === 'rsi' ? 'outlook' : 'market-us');
  }
});
test('sidebar preference uses one versioned bounded key and remains optional', () => {
  const data = new Map<string, string>();
  const storage = { getItem: (key: string) => data.get(key) ?? null, setItem: (key: string, value: string) => data.set(key, value) };
  assert.equal(readShellPreference(storage), false);
  writeShellPreference(storage, true); assert.equal(readShellPreference(storage), true);
  assert.deepEqual([...data.keys()], [SHELL_STORAGE_KEY]);
  data.set(SHELL_STORAGE_KEY, '{broken'); assert.equal(readShellPreference(storage), false);
  assert.equal(readShellPreference({ getItem() { throw new Error('readonly'); } }), false);
});
