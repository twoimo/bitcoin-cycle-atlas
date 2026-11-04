import React, { act } from 'react';
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { parseHTML } from 'linkedom';
import { renderToStaticMarkup } from 'react-dom/server';
import { initMarketLabView } from '../../dist/market-lab-view.js';
import type { MarketSnapshot, Region } from '@atlas/contracts/market-lab';
import { DiagnosisPanel } from '../../apps/web/src/panels/diagnosis-panel.js';
import { ScenarioPanel, initialScenario, type ScenarioState } from '../../apps/web/src/panels/scenario-panel.js';
import { EconomicsPanel, calculateEconomics, initialEconomics, type EconomicsState } from '../../apps/web/src/panels/economics-panel.js';
import { RsiPanel, initialRsi, type RsiState } from '../../apps/web/src/panels/rsi-panel.js';
import { SourceDisclosure } from '../../apps/web/src/components/source-disclosure.js';
import { MarketLabApp } from '../../apps/web/src/app.js';
import type { Root } from 'react-dom/client';

const snapshot = JSON.parse(await readFile(new URL('../../dist/data/market-lab.json', import.meta.url), 'utf8')) as MarketSnapshot;
// The retained OHLC snapshot was prepared on Nov3 after11:00 UTC.
const now = new Date('2026-11-04T06:00:00Z');
const noChange = () => {};

async function legacy(tab: string, doc: MarketSnapshot, state = {}, action?: (document: ReturnType<typeof parseHTML>['document']) => void, selector = '#ml-panel') {
  const { document } = parseHTML('<html><body><div id="market-header-slot"></div><section id="market-view"></section></body></html>');
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'document');
  Object.defineProperty(globalThis, 'document', { configurable: true, value: document });
  try {
    const view = initMarketLabView({ root: document.getElementById('market-view') as unknown as HTMLElement, embeddedData: doc, now: () => now });
    await view.render(); Object.assign(view.state, state); view.navigate({ tab });
    action?.(document);
    const html = document.querySelector(selector)!.innerHTML;
    view.destroy();
    return html;
  } finally {
    if (previous) Object.defineProperty(globalThis, 'document', previous);
    else Reflect.deleteProperty(globalThis, 'document');
  }
}
function meaningful(html: string) {
  const { document } = parseHTML(`<html><body><main>${html}</main></body></html>`);
  const root = document.querySelector('main')!;
  return {
    text: root.textContent!.replace(/\s+/g, ''),
    paths: [...root.querySelectorAll('svg path')].map(path => [path.getAttribute('class')?.trim(), path.getAttribute('d')]),
    chartText: [...root.querySelectorAll('svg title,svg desc')].map(element => element.textContent),
    geometry: [...root.querySelectorAll('svg line,svg circle,svg text')].map(element => ['x', 'y', 'x1', 'y1', 'x2', 'y2', 'cx', 'cy', 'r'].map(name => element.getAttribute(name))),
    controls: [...root.querySelectorAll('input,select')].map(element => ['id', 'type', 'min', 'max', 'step', 'value', 'aria-label', 'aria-valuetext', 'required', 'disabled'].map(name => element.hasAttribute(name) ? name === 'required' || name === 'disabled' ? 'true' : element.getAttribute(name) : null)),
    links: [...root.querySelectorAll('a')].map(element => ['href', 'target', 'rel'].map(name => element.getAttribute(name))),
  };
}
// The user explicitly requested shorter copy and a different page composition.
// Keep the old renderer as the independent oracle for calculations, form
// constraints, observations, clock labels, errors and fixed-width SVG geometry.
function calculations(html: string) {
  const presentation = parseHTML(`<html><body>${html}</body></html>`).document;
  for (const node of presentation.querySelectorAll('[data-presentation-control],.rsi-crossing')) node.remove();
  html = presentation.body.innerHTML;
  const { text: _copy, ...semantics } = meaningful(html);
  const { document } = parseHTML(`<html><body><main>${html}</main></body></html>`);
  const texts = (selector: string) => [...document.querySelectorAll(selector)].map(node => node.textContent!.replace(/\s+/g, ''));
  return { ...semantics,
    scores: texts('.ml-axis-value,.ml-axis-stats,.ml-score-total'),
    scenario: texts('.ml-index strong,#ml-scenario-output tbody'),
    economics: texts('.ml-results dd').slice(0, 4),
    rsi: texts('.ml-mini-results,#ml-thresholds tbody,#ml-thresholds .ml-warning'),
    errors: texts('[role=alert]'), empty: texts('.ml-empty'),
  };
}
for (const region of ['us', 'kr'] as Region[]) {
  test(`React diagnosis ${region}: values, controls and SVG coordinates match the previous renderer`, async () => {
    const before = await legacy('diagnosis', snapshot, { region });
    const after = renderToStaticMarkup(<DiagnosisPanel snapshot={snapshot} region={region} now={now} marketId={null} priceIndex={null} onMarket={noChange} onDate={noChange} />);
    assert.deepEqual(calculations(after), calculations(before));
  });
}
test('React diagnosis preserves selected market/date and source-error chart withholding', async () => {
  const cases = [
    { doc: snapshot, marketId: 'nasdaq', priceIndex: 10 },
    { doc: structuredClone(snapshot), marketId: 'spx', priceIndex: null },
    { doc: structuredClone(snapshot), marketId: 'spx', priceIndex: 0 },
  ];
  cases[1].doc.sources.find(source => source.id === 'market-spx')!.status = 'error';
  cases[1].doc.sources.find(source => source.id === 'market-spx')!.error = '원천 오류';
  cases[2].doc.markets.find(market => market.id === 'spx')!.prices = [];
  for (const { doc, marketId, priceIndex } of cases) {
    const before = await legacy('diagnosis', doc, { region: 'us', marketId, priceIndex });
    const after = renderToStaticMarkup(<DiagnosisPanel snapshot={doc} region="us" now={now} marketId={marketId} priceIndex={priceIndex} onMarket={noChange} onDate={noChange} />);
    assert.deepEqual(calculations(after), calculations(before));
  }
});

test('React RSI preserves both exact SVG series, reference tables, selected dates and manual values', async () => {
  const cases: RsiState[] = [initialRsi(), { ...initialRsi(), manualRsi: '33.5' }, { ...initialRsi(), manualRsi: '101' },
    { ...initialRsi(), rsiIndex: 4204, rsiOscIndex: 4190 },
    { ...initialRsi(), rsiIndex: 0, rsiUnmatchedDate: '2010-02-11', manualRsi: '40' }];
  for (const state of cases) {
    const before = await legacy('rsi', snapshot, state);
    const after = renderToStaticMarkup(<RsiPanel initialRangeDays={0} snapshot={snapshot} now={now} state={state} onChange={noChange} />);
    assert.deepEqual(calculations(after), calculations(before));
  }
});
test('React RSI never substitutes missing, errored or future observations for a valid computed value', async () => {
  const failed = structuredClone(snapshot), future = structuredClone(snapshot), missing = structuredClone(snapshot), empty = structuredClone(snapshot);
  failed.sources.find(source => source.id === 'market-tqqq')!.status = 'error';
  failed.sources.find(source => source.id === 'market-tqqq')!.error = '원천을 읽을 수 없습니다.';
  future.generatedAt = new Date(+now + 86400000).toISOString();
  missing.markets = missing.markets.filter(market => market.id !== 'tqqq');
  empty.markets.find(market => market.id === 'tqqq')!.prices = [];
  for (const doc of [failed, future, missing, empty]) {
    const state = { ...initialRsi(), manualRsi: '40' };
    const before = await legacy('rsi', doc, state);
    const after = renderToStaticMarkup(<RsiPanel initialRangeDays={0} snapshot={doc} now={now} state={state} onChange={noChange} />);
    assert.deepEqual(calculations(after), calculations(before));
    assert(!after.includes('계산 RSI와 원문 기준선의 거리'));
    assert(after.includes('수기 키움 RSI와 원문 기준선의 거리'));
  }
});
test('React source disclosure preserves all source clocks, links, caveats and withheld notes', async () => {
  for (const region of ['us', 'kr'] as const) {
    const before = await legacy('diagnosis', snapshot, { region }, undefined, '.ml-sources');
    const after = renderToStaticMarkup(<SourceDisclosure snapshot={snapshot} region={region} now={now} />);
    assert.deepEqual(meaningful(after), meaningful(before));
  }
});

test('React scenario matches the previous neutral, negative, weighted and sensitivity results', async () => {
  const cases: ScenarioState[] = [initialScenario(), { ...initialScenario(), alpha: -2, beta: -2 },
    { alpha: 2.5, beta: -1, gamma: 0.3, weights: ['2', '0.5', '0'], sensitivity: '0.25' },
    { ...initialScenario(), alpha: 3, beta: -3, sensitivity: '0' }, { ...initialScenario(), gamma: 3, sensitivity: '1' }];
  for (const state of cases) {
    const scenario = { ...state, weights: state.weights.map(Number), sensitivity: Number(state.sensitivity) };
    const before = await legacy('scenario', snapshot, { scenario });
    const after = renderToStaticMarkup(<ScenarioPanel state={state} onChange={noChange} />);
    assert.deepEqual(calculations(after), calculations(before));
  }
});
test('React scenario withholds the result for missing, zero, negative and out-of-range inputs', async () => {
  for (const state of [
    { ...initialScenario(), weights: ['', '1', '1'] }, { ...initialScenario(), weights: ['0', '0', '0'] },
    { ...initialScenario(), weights: ['-1', '1', '1'] }, { ...initialScenario(), weights: ['101', '1', '1'] },
    { ...initialScenario(), sensitivity: '' }, { ...initialScenario(), sensitivity: '1.1' },
  ]) {
    const scenario = { ...state, weights: state.weights.map(value => value === '' ? NaN : Number(value)), sensitivity: state.sensitivity === '' ? NaN : Number(state.sensitivity) };
    const before = await legacy('scenario', snapshot, { scenario });
    const after = renderToStaticMarkup(<ScenarioPanel state={state} onChange={noChange} />);
    assert.deepEqual(calculations(after).errors, calculations(before).errors);
    assert(!after.includes('class="ml-index"'));
  }
});
test('React economics keeps the initial blank form and all original form constraints', async () => {
  const before = await legacy('ai', snapshot);
  const after = renderToStaticMarkup(<EconomicsPanel state={initialEconomics()} onChange={noChange} />);
  assert.deepEqual(calculations(after), calculations(before));
});
test('React economics independently submits the same cash flows, terminal recovery and invalid inputs as the previous form', async () => {
  const cases: EconomicsState[] = [
    { ...initialEconomics(), inputs: { costBasis: '100000', residual: '10000', lifeYears: '5', annualRevenue: '40000', annualOpex: '15000', discountRate: '8' }, hypothetical: true },
    { ...initialEconomics(), inputs: { costBasis: '100', residual: '80', lifeYears: '2', annualRevenue: '20', annualOpex: '10', discountRate: '0' } },
    { ...initialEconomics(), inputs: { costBasis: '100', residual: '0', lifeYears: '2', annualRevenue: '10', annualOpex: '30', discountRate: '10' } },
    { ...initialEconomics(), inputs: { costBasis: '100', residual: '', lifeYears: '2', annualRevenue: '10', annualOpex: '30', discountRate: '10' } },
    { ...initialEconomics(), inputs: { costBasis: '100', residual: '101', lifeYears: '2', annualRevenue: '10', annualOpex: '30', discountRate: '10' } },
  ];
  for (const state of cases) {
    const before = await legacy('ai', snapshot, { economics: state.inputs, hypothetical: state.hypothetical }, document => {
      document.getElementById('ml-economics-form')!.dispatchEvent(new document.defaultView!.Event('submit', { bubbles: true, cancelable: true }));
    });
    const after = renderToStaticMarkup(<EconomicsPanel state={calculateEconomics(state)} onChange={noChange} />);
    assert.deepEqual(calculations(after), calculations(before));
  }
});

async function mountedApp(load: typeof import('../../apps/web/src/load-snapshot.js').loadSnapshot) {
  const { window, document } = parseHTML('<html><body><div id="root"></div></body></html>');
  const globals = { document, window, IS_REACT_ACT_ENVIRONMENT: true };
  const previous = new Map(Object.keys(globals).map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  for (const [key, value] of Object.entries(globals)) Object.defineProperty(globalThis, key, { configurable: true, value });
  const { createRoot } = await import('react-dom/client');
  let root: Root | null = createRoot(document.getElementById('root')!);
  try { await act(async () => root!.render(<MarketLabApp load={load} clock={() => now} />)); }
  catch (error) { await cleanup(); throw error; }
  async function cleanup() {
    if (root) { await act(async () => root!.unmount()); root = null; }
    for (const [key, descriptor] of previous) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor); else Reflect.deleteProperty(globalThis, key);
    }
  }
  async function click(selector: string) {
    const target = document.querySelector(selector); assert(target, selector);
    await act(async () => target.dispatchEvent(new window.Event('click', { bubbles: true })));
  }
  return { document, cleanup, click };
}
test('React app keeps calculation controls usable while loading and preserves results across tab switches', async t => {
  let resolve!: (doc: MarketSnapshot) => void;
  const fixture = await mountedApp(() => new Promise(ready => { resolve = ready; }));
  t.after(fixture.cleanup);
  assert.match(fixture.document.querySelector('.atlas-inline-loading')!.textContent!, /자료를 읽고 있습니다/);
  assert(fixture.document.querySelector('[data-atlas-skeleton=diagnosis]'),'pending market data gets neutral skeleton geometry');
  await fixture.click('[data-atlas-page="scenario"]'); await fixture.click('[data-action="negative"]');
  assert.equal(fixture.document.querySelector('.ml-index strong')!.textContent, '87.52');
  await fixture.click('[data-atlas-page="cashflow"]'); await fixture.click('[data-action="economics-example"]');
  assert.match(fixture.document.querySelector('#ml-economics-output')!.textContent!, /6,623\.58/);
  await fixture.click('[data-atlas-page="scenario"]');
  assert.equal(fixture.document.querySelector('.ml-index strong')!.textContent, '87.52');
  await act(async () => resolve(snapshot));
  await fixture.click('[data-atlas-page="market-us"]');
  assert.equal(fixture.document.querySelector('.ml-axis-value')!.textContent, '0.52');
  await fixture.click('[data-atlas-page="cashflow"]');
  assert.match(fixture.document.querySelector('#ml-economics-output')!.textContent!, /6,623\.58/);
  await fixture.click('[data-atlas-page="rsi"]');
  const selectedRange = [...fixture.document.querySelectorAll('.rsi-toolbar button[aria-pressed="true"]')].map(node => node.textContent);
  assert(selectedRange.includes('전체'), 'all retained history is initially visible');
  assert.equal(fixture.document.querySelectorAll('[role=tablist]').length, 0, 'tools are distinct sidebar pages');
  assert.match(fixture.document.querySelector('[data-chart="rsi"] .rsi-axis')!.textContent!, /33\.95/);
});
test('React app renders empty and error states distinctly and retries without discarding scenario input', async t => {
  let attempts = 0;
  const empty = structuredClone(snapshot); empty.markets = [];
  for (const region of Object.values(empty.regions)) for (const axis of Object.values(region.axes)) axis.values = [];
  const fixture = await mountedApp(async () => { attempts++; if (attempts === 1) throw new Error('원천 연결 오류'); return empty; });
  t.after(fixture.cleanup);
  assert.match(fixture.document.querySelector('.ml-status')!.textContent!, /자료 오류 · 원천 연결 오류/);
  await fixture.click('[data-atlas-page="scenario"]'); await fixture.click('[data-action="negative"]');
  await fixture.click('[data-action="retry"]');
  assert.match(fixture.document.querySelector('.ml-status')!.textContent!, /관측 자료가 없습니다/);
  assert.equal(fixture.document.querySelector('.ml-index strong')!.textContent, '87.52');
  assert.equal(attempts, 2);
});
test('React app aborts an unmounted load and ignores its late completion', async () => {
  let signal: AbortSignal | undefined, resolve!: (doc: MarketSnapshot) => void;
  const fixture = await mountedApp(options => { signal = options?.signal; return new Promise(ready => { resolve = ready; }); });
  await fixture.cleanup(); assert(signal?.aborted);
  await act(async () => resolve(snapshot));
  assert.equal(fixture.document.getElementById('root')!.childNodes.length, 0);
});

test('React app retains a newer populated document when an older empty fallback arrives', async t => {
  const older=structuredClone(snapshot);older.generatedAt=new Date(Date.parse(snapshot.generatedAt)-86400000).toISOString();older.markets=[];
  for(const region of Object.values(older.regions))for(const axis of Object.values(region.axes))axis.values=[];
  let calls=0;
  const fixture=await mountedApp(async options=>{
    calls++;options?.onDelivery?.(calls===1?{kind:'api',revision:'a'.repeat(64)}:{kind:'saved',reason:'API unavailable'});
    return calls===1?snapshot:older;
  });t.after(fixture.cleanup);
  const score=fixture.document.querySelector('.ml-axis-value')!.textContent;
  await fixture.click('.ml-collection-line button');
  assert.equal(fixture.document.querySelector('.ml-axis-value')!.textContent,score);
  assert.doesNotMatch(fixture.document.body.textContent!,/스냅샷은 읽었지만 관측 자료가 없습니다/);
  assert.match(fixture.document.querySelector('.ml-delivery')!.textContent!,/연결 실패 · 직전 자료 유지/);
  assert.doesNotMatch(fixture.document.querySelector('.ml-delivery')!.textContent!,/저장본 표시/);
  await fixture.click('[data-atlas-page="rsi"]');
  await fixture.click('.rsi-workbench-tabs button:nth-child(2)');
  assert.equal(fixture.document.querySelector('.rsi-backtest-form button[type=submit]')!.hasAttribute('disabled'),false,'retained API revision still owns the retained observations');
});

test('React retry retains accepted RSI revision while replacement is pending and after failure', async t => {
  let calls=0,reject!: (error:Error)=>void;
  const fixture=await mountedApp(options=>{
    calls++;
    if(calls===1){options?.onDelivery?.({kind:'api',revision:'a'.repeat(64)});return Promise.resolve(snapshot);}
    return new Promise((_,fail)=>{reject=fail;});
  });t.after(fixture.cleanup);
  await fixture.click('.ml-collection-line button');
  assert(fixture.document.querySelector('.atlas-inline-loading'));
  await fixture.click('[data-atlas-page="rsi"]');
  await fixture.click('.rsi-workbench-tabs button:nth-child(2)');
  const enabled=()=>assert.equal(fixture.document.querySelector('.rsi-backtest-form button[type=submit]')!.hasAttribute('disabled'),false);
  enabled();
  await act(async()=>reject(new Error('second request failed')));
  enabled();
  assert.match(fixture.document.querySelector('.ml-delivery')!.textContent!,/연결 실패 · 직전 자료 유지/);
});
