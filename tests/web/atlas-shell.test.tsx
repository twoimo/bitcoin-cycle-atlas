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
  assert.equal(exportButton.parentElement, document.querySelector('.daily-heading'));
  const rail = document.createElement('aside'); rail.className = 'workbench-rail'; document.querySelector('.workspace')!.append(rail);
  document.body.dataset.page = 'outlook'; await new Promise(resolve => setImmediate(resolve));
  assert.equal(nav.parentElement, rail); assert.equal(document.body.dataset.shell, 'chart');
  nav.querySelector('button')!.dispatchEvent(new window.Event('click', { bubbles: true })); assert.equal(clicks, 1);
  document.body.dataset.page = 'evidence'; await new Promise(resolve => setImmediate(resolve));
  assert.equal(nav.parentElement, document.querySelector('.atlas-sidebar'));
  assert.equal(document.querySelector('.atlas-shell-heading')!.textContent, '리서치');
  const pageHeading = document.querySelector('.atlas-shell-heading')!;
  assert.equal(document.getElementById(pageHeading.getAttribute('aria-describedby')!)!.textContent, atlasPageDescription('evidence').description);
  assert.equal(exportButton.parentElement, document.querySelector('.daily-heading'));
});

test('the React standalone shell keeps its actual title and current destination with the shared description', () => {
  const cases: Array<{page:string;title:string;symbol:string;destination:string;basis:RegExp[];context?:Parameters<typeof atlasPageDescription>[1]}> = [
    {page:'rsi', title:'삼플레 · 가격 차트', symbol:'TQQQ', destination:'outlook', basis:[/Yahoo/, /수동/]},
    {page:'rsi', title:'속쓸 · 가격 차트', symbol:'SOXL', destination:'outlook', basis:[/Yahoo/, /수동/], context:{symbol:'BTCUSD'}},
    {page:'rsi', title:'코스닥150 2배 · 가격 차트', symbol:'233740', destination:'outlook', basis:[/Yahoo/, /수동/]},
    {page:'outlook', title:'비트코인 · 가격 차트', symbol:'BTCUSD', destination:'outlook', basis:[/Coin Metrics/, /공개본 6시간 확인/]},
    {page:'outlook', title:'비트코인 보존본', symbol:'BTCUSD', destination:'outlook', basis:[/Coin Metrics/, /보존/], context:{retained:true}},
    {page:'outlook', title:'이더리움 · 가격 차트', symbol:'ETHUSD', destination:'outlook', basis:[/Coinbase/, /수동/]},
    {page:'outlook', title:'스트래티지 · 가격 차트', symbol:'MSTR', destination:'outlook', basis:[/Yahoo/, /수동/]},
    {page:'housing', title:'서울 아파트 · 가격 차트', symbol:'HOUSING-SEOUL', destination:'outlook', basis:[/한국부동산원/, /월별|월간/, /수동/]},
    {page:'themes', title:'하이퍼리퀴드 · 가격 차트', symbol:'HYPE', destination:'outlook', basis:[/Hyperliquid/, /현물/, /수동/]},
    {page:'market-kr', title:'국내 시장 진단', symbol:'TQQQ', destination:'market-us', basis:[/FRED/, /한은|한국은행/, /Yahoo/, /수동/]},
    {page:'market-us', title:'미국 시장 진단', symbol:'TQQQ', destination:'market-us', basis:[/FRED/, /1분 재조회/], context:{refreshMode:'poll',refreshIntervalMs:60000}},
    {page:'scenario', title:'조건 실험', symbol:'TQQQ', destination:'market-us', basis:[/입력/, /재계산/]},
    {page:'cashflow', title:'현금흐름', symbol:'TQQQ', destination:'market-us', basis:[/입력/, /재계산/]},
  ];
  for (const {page,title,symbol,destination,basis,context} of cases) {
    const html = renderToStaticMarkup(<DashboardChrome title={title} currentPage={page} chartSymbol={symbol} descriptionContext={context} onNavigate={() => {}}/>);
    const {document} = parseHTML(`<html><body>${html}</body></html>`);
    const heading = document.querySelector('h1')!;
    const description = document.getElementById(heading.getAttribute('aria-describedby')!)!;
    const info = atlasPageDescription(page, {...context,symbol});
    assert.equal(heading.textContent, title);
    assert.equal(description.textContent, info.description);
    assert.deepEqual([...description.children].map(node => node.textContent), [info.purpose,info.basis]);
    for (const token of basis) assert.match(description.textContent!, token, `${page}/${symbol}`);
    assert.doesNotMatch(description.textContent!, /15분|실시간/);
    if (context?.retained) assert.doesNotMatch(description.textContent!, /공개본 6시간 확인/);
    assert.equal(document.querySelectorAll('#atlas-page-description').length, 1);
    assert.equal(document.querySelector('[aria-current="page"]')!.getAttribute('data-atlas-page'), destination);
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
