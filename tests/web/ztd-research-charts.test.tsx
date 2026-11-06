import React, { act, useState } from 'react';
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { renderToStaticMarkup } from 'react-dom/server';
import { parseHTML } from 'linkedom';
import { positiveFactorScenario } from '@atlas/domain/market-lab';
import { ObservedResearchChart, ResearchChartCard, ScenarioContributionChart } from '../../apps/web/src/components/ztd-research-charts.js';
import { DiagnosisPanel } from '../../apps/web/src/panels/diagnosis-panel.js';
import type { MarketSnapshot } from '@atlas/contracts/market-lab';

const points: readonly (readonly [string, number | null])[] = [
  ['2026-01-01', 10], ['2026-01-02', 11], ['2026-01-03', null],
  ['2026-01-04', 13], ['2026-01-05', 14], ['2026-01-06', Infinity], ['2026-01-07', 16],
];
const domFor = (content: React.ReactNode) => parseHTML(`<html><body>${renderToStaticMarkup(content)}</body></html>`).document;

test('ztd observed lines retain source gaps, straight geometry, raw selection and units', () => {
  const document = domFor(<ResearchChartCard title="관측"><ObservedResearchChart id="price" points={points} unit="USD" label="관측 종가" selected={3} onSelect={() => {}} /></ResearchChartCard>);
  const paths = [...document.querySelectorAll('.ztd-svg path[fill="none"]')].map(path => path.getAttribute('d')!);
  assert.equal(paths.length, 3, 'explicit missing values split the observation into three independent paths');
  const strokes = [...document.querySelectorAll('.ztd-svg path[fill="none"]')].map(path => path.getAttribute('stroke'));
  assert.equal(new Set(strokes).size, 1, 'segments remain one asset with one shared color');
  assert.match(strokes[0]!, /--ztd-accent/);
  assert.deepEqual(paths.map(path => (path.match(/L/g) || []).length), [1, 1, 0]);
  assert(paths.every(path => !/[CQSZ]/.test(path)), 'observations are straight and never closed or smoothed');
  assert.equal(document.querySelectorAll('.ztd-svg circle').length, 5, 'the isolated final observation remains visible');
  assert.equal(document.querySelector('[data-selected-date]')!.textContent, '2026-01-04 · 13.00 USD');
  assert.equal(document.querySelector('input')!.getAttribute('max'), '6', 'missing rows keep their original date slots');
  assert.equal(document.querySelector('input')!.getAttribute('value'), '3');
  assert.equal(document.querySelector('input')!.getAttribute('aria-valuetext'), '2026-01-04, 13.00 USD');
  assert.match(document.querySelector('[data-ztd-theme]')!.getAttribute('style')!, /--ztd-panel:var\(--surface\)/);
  assert.doesNotMatch(document.body.innerHTML, /NaN|Infinity/);

  const percent = domFor(<ObservedResearchChart id="percent" points={[["2026-01-01", 33.5]]} unit="%" label="비율" selected={0} onSelect={() => {}} />);
  assert.equal(percent.querySelector('[data-selected-date]')!.textContent, '2026-01-01 · 33.50 %');
  assert.equal(percent.querySelector('input')!.hasAttribute('disabled'), true);
  const gap = domFor(<ObservedResearchChart id="price" points={points} unit="USD" label="관측 종가" selected={2} onSelect={() => {}} />);
  assert.equal(gap.querySelector('[data-selected-date]')!.textContent, '2026-01-03 · 관측값 없음', 'a missing selected value is never replaced by a later close');
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
    await act(async () => document.querySelector('.ztd-root')!.dispatchEvent(event));
  }
  await key('Home'); await key('ArrowRight'); await key('ArrowRight');
  assert.deepEqual(chosen, [0, 1, 2]);
  assert.equal(document.querySelector('input')!.getAttribute('value'), '2');
  assert.equal(document.querySelector('[data-selected-date]')!.textContent, '2026-01-03 · 관측값 없음');
  await key('ArrowRight');
  assert.equal(chosen.at(-1), 3, 'the first point after a gap retains source index 3, not filtered index 2');
  await key('End');
  assert.equal(chosen.at(-1), 6);
  assert.equal(document.querySelector('[data-selected-date]')!.textContent, '2026-01-07 · 16.00 USD');
});

test('ztd scenario uses signed result contributions with a shared zero baseline', () => {
  const result = positiveFactorScenario({ alpha: -2, beta: 2, gamma: 0, weights: [1, 1, 1], sensitivity: 0.1 });
  const document = domFor(<ScenarioContributionChart contributions={result.contributions} />);
  assert.deepEqual([...document.querySelectorAll('.ztd-sr td')].map(node => node.textContent), ['-0.667', '0.667', '0.000']);
  const marks = [...document.querySelectorAll('.ztd-mark path')].map(path => path.getAttribute('d')!);
  assert.equal(marks.length, 3);
  // The negative bar ends at the exact x where the positive bar starts. A zero
  // contribution has no painted length. This detects absolute-value/percent
  // conversion or a truncated value baseline in the actual vendor rendering.
  const negativeEnd = Number(marks[0].match(/H([\d.]+)/)![1]);
  const positiveStart = Number(marks[1].match(/^M([\d.]+),/)![1]);
  const negativeStart = Number(marks[0].match(/^M([\d.]+),/)![1]);
  const positiveEnd = Number(marks[1].match(/H([\d.]+)/)![1]);
  assert.equal(negativeEnd, positiveStart);
  assert(negativeStart < negativeEnd && positiveEnd > positiveStart);
  assert.equal(marks[2], '');
  assert.match(document.querySelector('.ztd-svg desc')!.textContent!, /기준 0/);
  assert.doesNotMatch(document.querySelector('.ztd-sr table')!.textContent!, /%/);
});

test('ztd diagnosis source gating and exact selected observation survive the renderer change', async () => {
  const snapshot = JSON.parse(await readFile(new URL('../../dist/data/market-lab.json', import.meta.url), 'utf8')) as MarketSnapshot;
  const now = new Date('2026-11-04T06:00:00Z');
  for (const region of ['us', 'kr'] as const) {
    const market = snapshot.markets.find(market => market.region === region)!;
    const document = domFor(<DiagnosisPanel snapshot={snapshot} region={region} now={now} marketId={market.id} priceIndex={10} onMarket={() => {}} onDate={() => {}} />);
    assert(document.querySelector('.ml-price-card.ztd-card .ztd-svg'));
    assert.equal(document.querySelector('[data-selected-date]')!.getAttribute('data-selected-date'), market.prices[10][0]);
    assert.equal(document.querySelector('[data-selected-date]')!.getAttribute('data-selected-index'), '10');
    assert.equal(document.querySelector('input[data-date=price]')!.getAttribute('max'), String(market.prices.length - 1));
  }
  const failed = structuredClone(snapshot);
  failed.sources.find(source => source.id === 'market-spx')!.status = 'error';
  const withheld = domFor(<DiagnosisPanel snapshot={failed} region="us" now={now} marketId="spx" priceIndex={0} onMarket={() => {}} onDate={() => {}} />);
  assert.equal(withheld.querySelector('[data-chart=price] .ztd-svg'), null);
  assert.match(withheld.querySelector('[data-chart=price]')!.textContent!, /가격 차트는 숨깁니다/);
  const empty = domFor(<ObservedResearchChart id="price" points={[]} unit="USD" label="관측 종가" selected={null} onSelect={() => {}} />);
  assert.equal(empty.querySelector('.ztd-svg'), null);
  assert.match(empty.body.textContent!, /관측 자료 없음/);
});
