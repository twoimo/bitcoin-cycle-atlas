import React, { act, useState } from 'react';
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { renderToStaticMarkup } from 'react-dom/server';
import { parseHTML } from 'linkedom';
import { positiveFactorScenario } from '@atlas/domain/market-lab';
import { ObservedResearchChart, ResearchChartCard, ScenarioContributionChart, observedChartModel, observedPointMarkers } from '../../apps/web/src/components/ztd-research-charts.js';
import { DiagnosisPanel } from '../../apps/web/src/panels/diagnosis-panel.js';
import type { MarketSnapshot } from '@atlas/contracts/market-lab';

const points: readonly (readonly [string, number | null])[] = [
  ['2026-01-01', 10], ['2026-01-02', 11], ['2026-01-03', null],
  ['2026-01-04', 13], ['2026-01-05', 14], ['2026-01-06', Infinity], ['2026-01-07', 16],
];
const domFor = (content: React.ReactNode) => parseHTML(`<html><body>${renderToStaticMarkup(content)}</body></html>`).document;

test('observed Funnest markers follow pixel density without dropping path vertices or isolated observations', () => {
  const dense: readonly (readonly [string, number | null])[] = Array.from({ length: 150 }, (_, index) =>
    [`${2020 + Math.floor(index / 12)}-${String(index % 12 + 1).padStart(2, '0')}-01`, index + 1] as const);
  const denseModel = observedChartModel(dense), narrowPolicy = observedPointMarkers(denseModel, 390);
  assert.equal(typeof narrowPolicy, 'function', 'a dense narrow plot suppresses per-observation glyphs');
  const narrowMarker = typeof narrowPolicy === 'function' ? narrowPolicy : () => true;
  assert.equal(narrowMarker(0), false);
  assert.equal(observedPointMarkers(denseModel, 1333), true, 'the same series is sparse enough at a wider plot width');

  const denseWithSingleton = dense.map(([date, value], index) => [date, index === 74 || index === 76 ? null : value] as const);
  const singletonModel = observedChartModel(denseWithSingleton), singletonPolicy = observedPointMarkers(singletonModel, 390);
  assert.equal(typeof singletonPolicy, 'function');
  const singletonMarker = typeof singletonPolicy === 'function' ? singletonPolicy : () => true;
  assert.equal(singletonMarker(75), true, 'an isolated real observation remains marked in dense data');
  assert.equal(singletonMarker(73), false, 'ordinary dense observations do not regain marker clutter');

  const denseDocument = domFor(<ObservedResearchChart id="dense" points={dense} unit="USD" label="관측 종가" selected={149} onSelect={() => {}} />);
  assert.equal(denseDocument.querySelector('.atlas-funnest-observed-chart')?.getAttribute('data-source-count'), String(dense.length));
  assert.equal(denseDocument.querySelectorAll('.atlas-funnest-source-table tbody tr').length, dense.length, 'every original row remains in the accessible table');
  assert.equal(observedChartModel(dense).data.length, dense.length, 'the line input retains every source vertex for the SVG renderer');

  const singlePoints = [["2026-01-01", 12]] as const, singleModel = observedChartModel(singlePoints);
  assert.equal(observedPointMarkers(singleModel, 390), true, 'a single valid observation remains marked at any responsive width');
  const singleton = domFor(<ObservedResearchChart id="single" points={singlePoints} unit="USD" label="관측 종가" selected={0} onSelect={() => {}} />);
  assert.equal(singleton.querySelector('.atlas-funnest-observed-chart')?.getAttribute('data-source-count'), '1');
  assert.equal(singleton.querySelectorAll('.atlas-funnest-source-table tbody tr').length, 1);
});

test('ztd observed lines retain source gaps, straight geometry, raw selection and units', () => {
  const document = domFor(<ResearchChartCard title="관측"><ObservedResearchChart id="price" points={points} unit="USD" label="관측 종가" selected={3} onSelect={() => {}} /></ResearchChartCard>);
  const plot = document.querySelector('.atlas-funnest-observed-chart')!;
  assert.equal(plot.getAttribute('data-chart-engine'), 'funnest');
  assert.equal(plot.getAttribute('data-source-count'), String(points.length), 'source slots, including missing observations, remain on the chart');
  assert.equal(plot.querySelector('svg[role="img"]')?.getAttribute('aria-label'), '관측 종가 · 5개 관측');
  const sourceRows = [...plot.querySelectorAll('tbody tr')];
  assert.equal(sourceRows.length, points.length);
  assert.equal(sourceRows[2].querySelectorAll('td')[0].textContent, '관측값 없음');
  assert.equal(sourceRows[5].querySelectorAll('td')[0].textContent, '관측값 없음', 'non-finite source values remain missing, never rendered as Infinity');
  assert.equal(document.querySelector('[data-selected-date]')!.textContent, '2026-01-04 · 13.00 USD');
  assert.equal(document.querySelector('input')!.getAttribute('max'), '6', 'missing rows keep their original date slots');
  assert.equal(document.querySelector('input')!.getAttribute('value'), '3');
  assert.equal(document.querySelector('input')!.getAttribute('aria-valuetext'), '2026-01-04, 13.00 USD');
  assert.equal(document.querySelector('svg[role="img"]')?.getAttribute('tabindex'), '0', 'the Funnest chart is keyboard reachable');
  assert.match(document.querySelector('.atlas-funnest-source-table table caption')!.textContent!, /USD/);
  assert.doesNotMatch(document.body.innerHTML, /NaN|Infinity/);

  const percent = domFor(<ObservedResearchChart id="percent" points={[["2026-01-01", 33.5]]} unit="%" label="비율" selected={0} onSelect={() => {}} />);
  assert.equal(percent.querySelector('[data-selected-date]')!.textContent, '2026-01-01 · 33.50 %');
  assert.equal(percent.querySelector('input')!.hasAttribute('disabled'), true);
  const gap = domFor(<ObservedResearchChart id="price" points={points} unit="USD" label="관측 종가" selected={2} onSelect={() => {}} />);
  assert.equal(gap.querySelector('[data-selected-date]')!.textContent, '2026-01-03 · 관측값 없음 USD', 'a missing selected value is never replaced by a later close');
});

test('ztd chart keyboard selection reports original indices across missing observations', async t => {
  const { document, window } = parseHTML('<html><head></head><body><div id="root"></div></body></html>');
  Object.defineProperty(document, 'oninput', { value: null, configurable: true });
  const globals = { document, window, IS_REACT_ACT_ENVIRONMENT: true };
  const previous = new Map(Object.keys(globals).map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  for (const [key, value] of Object.entries(globals)) Object.defineProperty(globalThis, key, { value, configurable: true });
  const { createRoot } = await import('react-dom/client');
  const root = createRoot(document.getElementById('root')!);
  t.after(async () => {
    await act(async () => root.unmount());
    for (const [key, descriptor] of previous) if (descriptor) Object.defineProperty(globalThis, key, descriptor); else Reflect.deleteProperty(globalThis, key);
  });
  const chosen: number[] = [];
  function Harness() {
    const [selected, setSelected] = useState<number | null>(null);
    return <ObservedResearchChart id="price" points={points} unit="USD" label="관측 종가" selected={selected}
      onSelect={index => { chosen.push(index); setSelected(index); }} />;
  }
  await act(async () => root.render(<Harness />));
  async function key(key: string) {
    const event = new window.Event('keydown', { bubbles: true, cancelable: true });
    Object.defineProperty(event, 'key', { value: key });
    await act(async () => document.querySelector('.atlas-funnest-observed-chart svg')!.dispatchEvent(event));
  }
  await key('Home'); await key('ArrowRight'); await key('ArrowRight');
  assert.deepEqual(chosen, [0, 1, 2]);
  assert.equal(document.querySelector('input')!.getAttribute('value'), '2');
  assert.equal(document.querySelector('[data-selected-date]')!.textContent, '2026-01-03 · 관측값 없음 USD');
  await key('ArrowRight');
  assert.equal(chosen.at(-1), 3, 'the first point after a gap retains source index 3, not filtered index 2');
  await key('End');
  assert.equal(chosen.at(-1), 6);
  assert.equal(document.querySelector('[data-selected-date]')!.textContent, '2026-01-07 · 16.00 USD');
});

test('ztd scenario uses signed result contributions with a shared zero baseline', () => {
  const result = positiveFactorScenario({ alpha: -2, beta: 2, gamma: 0, weights: [1, 1, 1], sensitivity: 0.1 });
  const document = domFor(<ScenarioContributionChart contributions={result.contributions} />);
  assert.deepEqual([...document.querySelectorAll('.atlas-funnest-source-table td')].map(node => node.textContent), ['-0.667', '0.667', '0.000']);
  assert.equal(document.querySelector('[data-presentation-chart="scenario-contributions"]')?.getAttribute('data-chart-engine'), 'funnest');
  assert.match(document.querySelector('[aria-label="축별 정규화 기여도, 0 기준"]')?.getAttribute('aria-label')!, /0 기준/);
  assert.doesNotMatch(document.querySelector('.atlas-funnest-source-table table')!.textContent!, /%/);
});

test('ztd diagnosis source gating and exact selected observation survive the renderer change', async () => {
  const snapshot = JSON.parse(await readFile(new URL('../../dist/data/market-lab.json', import.meta.url), 'utf8')) as MarketSnapshot;
  const now = new Date('2026-11-04T06:00:00Z');
  for (const region of ['us', 'kr'] as const) {
    const market = snapshot.markets.find(market => market.region === region)!;
    const document = domFor(<DiagnosisPanel snapshot={snapshot} region={region} now={now} marketId={market.id} priceIndex={10} onMarket={() => {}} onDate={() => {}} />);
    assert(document.querySelector('.ml-price-card .atlas-funnest-observed-chart svg[role="img"]'));
    assert.equal(document.querySelector('[data-selected-date]')!.getAttribute('data-selected-date'), market.prices[10][0]);
      assert.equal(document.querySelector('[data-selected-date]')!.getAttribute('data-selected-index'), '10');
    assert.equal(document.querySelector('input[data-date=price]')!.getAttribute('max'), String(market.prices.length - 1));
  }
  const failed = structuredClone(snapshot);
  failed.sources.find(source => source.id === 'market-spx')!.status = 'error';
  const withheld = domFor(<DiagnosisPanel snapshot={failed} region="us" now={now} marketId="spx" priceIndex={0} onMarket={() => {}} onDate={() => {}} />);
  assert.equal(withheld.querySelector('[data-chart=price] svg[role="img"]'), null);
  assert.match(withheld.querySelector('[data-chart=price]')!.textContent!, /가격 차트는 숨깁니다/);
  const empty = domFor(<ObservedResearchChart id="price" points={[]} unit="USD" label="관측 종가" selected={null} onSelect={() => {}} />);
  assert.equal(empty.querySelector('svg[role="img"]'), null);
  assert.match(empty.body.textContent!, /관측 자료 없음/);
});

test('compact observation charts resize without changing the selected source and release their viewport observer', async t => {
  const { document, window } = parseHTML('<html><head></head><body><div id="root"></div></body></html>');
  let allocatedHeight = 620;
  const observers: ViewportObserver[] = [];
  class ViewportObserver {
    target: Element | null = null;
    disconnected = false;
    constructor(private callback: ResizeObserverCallback) { observers.push(this); }
    observe(target: Element) { this.target = target; }
    disconnect() { this.disconnected = true; }
    fire() { this.callback([], this as unknown as ResizeObserver); }
  }
  const prototype = window.HTMLElement.prototype;
  const previousBounds = Object.getOwnPropertyDescriptor(prototype, 'getBoundingClientRect');
  Object.defineProperty(prototype, 'getBoundingClientRect', {
    configurable: true,
    value(this: HTMLElement) {
      const height = this.classList.contains('atlas-funnest-observed-plot-slot') ? allocatedHeight : 0;
      return { x: 0, y: 0, top: 0, left: 0, right: 640, bottom: height, width: 640, height };
    },
  });
  const globals = { document, window, ResizeObserver: ViewportObserver, IS_REACT_ACT_ENVIRONMENT: true };
  const previous = new Map(Object.keys(globals).map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  for (const [key, value] of Object.entries(globals)) Object.defineProperty(globalThis, key, { value, configurable: true });
  const { createRoot } = await import('react-dom/client');
  const root = createRoot(document.getElementById('root')!);
  let mounted = true;
  t.after(async () => {
    if (mounted) await act(async () => root.unmount());
    if (previousBounds) Object.defineProperty(prototype, 'getBoundingClientRect', previousBounds);
    else Reflect.deleteProperty(prototype, 'getBoundingClientRect');
    for (const [key, descriptor] of previous) if (descriptor) Object.defineProperty(globalThis, key, descriptor); else Reflect.deleteProperty(globalThis, key);
  });
  const chosen: number[] = [];
  const render = async (series: typeof points) => {
    await act(async () => root.render(<ObservedResearchChart compactToolbar id="price" points={series}
      unit="USD" label="관측 종가" selected={3} onSelect={index => chosen.push(index)} />));
  };
  const height = () => Number(document.querySelector('.atlas-funnest-observed-chart svg[role="img"]')!.getAttribute('height'));
  await render([]);
  assert.equal(document.querySelector('.ml-viewport-chart'), null);
  await render(points);
  assert.equal(height(), 620, 'a populated chart uses its allocated height instead of scaling a fixed SVG');
  const observer = observers.find(item => item.target?.classList.contains('atlas-funnest-observed-plot-slot'))!;
  assert(observer);
  for (const [allocated, expected] of [[420, 420], [0, 420], [170, 180]]) {
    allocatedHeight = allocated;
    await act(async () => observer.fire());
    assert.equal(height(), expected, 'shrinking and a hidden frame retain a readable drawing size');
    assert.equal(document.querySelector('[data-selected-date]')!.getAttribute('data-selected-date'), '2026-01-04');
    assert.equal(document.querySelector('[data-selected-index]')!.getAttribute('data-selected-index'), '3');
    assert.equal(document.querySelectorAll('.atlas-funnest-source-table tbody tr').length, points.length, 'resizing retains every source slot');
  }
  assert.deepEqual(chosen, [], 'layout changes cannot select a different observation');
  await render([]);
  assert.equal(observer.disconnected, true, 'an empty replacement releases the old drawing observer');
  allocatedHeight = 350;
  await render(points);
  const remounted = observers.findLast(item => item.target?.classList.contains('atlas-funnest-observed-plot-slot'))!;
  assert.equal(height(), 350);
  await act(async () => root.unmount());
  mounted = false;
  assert.equal(remounted.disconnected, true, 'unmount cannot retain a viewport observer');
});
