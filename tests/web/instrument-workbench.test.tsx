import React, { act, useState } from 'react';
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { parseHTML } from 'linkedom';
import { renderToStaticMarkup } from 'react-dom/server';
import { analyzeHousing, type HousingRow } from '@atlas/domain/housing';
import { InstrumentWorkbench } from '../../apps/web/src/components/instrument-workbench.js';
import { HousingChart, housingChartSeries } from '../../apps/web/src/panels/housing-chart.js';
import { HousingPanel, type HousingCache } from '../../apps/web/src/panels/housing-panel.js';
import { ThemePanel, type ThemeCache } from '../../apps/web/src/panels/theme-panel.js';
import { applyInstrumentCommand, displayInstrumentSeries, initialInstrumentView, instrumentRange, observedPricePath,
  type InstrumentChartCache, type InstrumentSeries } from '../../apps/web/src/instrument-chart-model.js';
import { day } from '../../apps/web/src/rsi-chart-model.js';

const housing = JSON.parse(await readFile(new URL('../../dist/data/housing.json', import.meta.url), 'utf8'));
const themes = JSON.parse(await readFile(new URL('../../dist/data/themes.json', import.meta.url), 'utf8'));
const options = { region: 'busan', window: 36, band: 10, lag: 2, start: '2006-01', end: '2026-09' };
const monthlyRows: HousingRow[] = Array.from({ length: 9 }, (_, index) => ({
  month: `2025-${String(index + 1).padStart(2, '0')}`, price: index === 3 || index === 8 ? null : 100 + index,
  volume: index === 5 ? null : index * 10, average: index < 2 ? null : 40, deviation: null, state: 'neutral', priceChange: null, volumeChange: null,
}));

test('all four housing chart calendars retain original values, volume-only tail months and monthly capabilities', () => {
  const source = structuredClone(housing);
  for (const region of housing.regions) {
    const rows = analyzeHousing(housing, { ...options, region: region.id }).rows;
    const series = housingChartSeries(rows), view = initialInstrumentView(series);
    assert.deepEqual(series.prices, region.price.map(([stamp, value]: [string, number]) => [`${stamp}-01`, value]));
    assert.deepEqual(series.volumes.filter(point => point.value !== null).map(point => [point.date.slice(0, 7), point.value]), region.volume);
    assert.equal(series.prices.at(-1)?.[0], '2026-08-01'); assert.equal(series.timeline.at(-1), '2026-09-01');
    assert.equal(view.frequency, 'monthly'); assert.equal(view.chartType, 'line');
    assert.equal(instrumentRange(view, series)?.max, '2026-09-01');
    for (const frequency of ['daily', 'weekly', 'hourly']) assert.equal(applyInstrumentCommand(view, series, 'frequency', frequency), view);
    assert.equal(applyInstrumentCommand(view, series, 'type'), view, 'no synthetic OHLC for an index');
    assert.equal(displayInstrumentSeries(series, 'weekly'), series, 'monthly observations are never resampled into weekly prices');
    const selected = applyInstrumentCommand(view, series, 'date', '2026-09-15');
    assert.equal(selected.selected, '2026-09-01'); assert.equal(series.prices.find(point => point[0] === selected.selected), undefined);
    const zoomed = applyInstrumentCommand(view, series, 'zoom', .5);
    assert(day(zoomed.end) - day(zoomed.start) < day(view.end) - day(view.start));
    const restored = applyInstrumentCommand(zoomed, series, 'fit');
    assert.equal(restored.start, series.timeline[0]); assert.equal(restored.end, series.timeline.at(-1));
  }
  assert.deepEqual(housing, source, 'display commands leave the source snapshot and analytical inputs untouched');
});

test('housing canvas breaks missing index segments and distinguishes real zero volume from absence', () => {
  const series = housingChartSeries(monthlyRows), view = initialInstrumentView(series);
  const path = observedPricePath(series.prices, series.timeline, stamp => day(stamp), value => value);
  assert.equal((path.match(/M/g) || []).length, 2, 'the unpublished April index interrupts the price path');
  assert.equal((path.match(/L/g) || []).length, 5);
  const html = renderToStaticMarkup(<HousingChart rows={monthlyRows} start={0} end={8} selected="2025-09" onSelect={() => {}} onRange={() => {}}/>);
  const document = parseHTML(`<html><body>${html}</body></html>`).document;
  const svg = document.querySelector('.housing-chart > svg')!;
  assert.equal(svg.getAttribute('data-end'), view.end);
  assert.equal(document.querySelectorAll('[data-candle]').length, 0);
  assert.equal(document.querySelector('[data-volume="2025-01-01"]')?.getAttribute('height'), '0', 'a reported zero remains a zero-height observation');
  assert.equal(document.querySelector('[data-volume="2025-06-01"]'), null, 'a missing transaction count produces no bar');
  assert.equal(document.querySelectorAll('[data-volume-average]').length, 1);
  assert.equal(document.querySelector('.rsi-price-badge'), null, 'the volume-only September selection has no invented price badge');
  assert.match(document.body.textContent!, /미공표/); assert.doesNotMatch(html, /NaN|Infinity/);
});

test('HYPE weekly display aggregates its actual USDC candles and keeps the underlying observations immutable', () => {
  const bars = structuredClone(themes.asset.bars);
  const series: InstrumentSeries = { frequency: 'daily', bars, prices: bars.map((bar: any) => [bar[0], bar[4]]), timeline: bars.map((bar: any) => bar[0]), volumes: bars.map((bar: any) => ({ date: bar[0], value: bar[5] })) };
  const weekly = displayInstrumentSeries(series, 'weekly');
  assert(weekly.bars.length < bars.length); assert.equal(weekly.prices.at(-1)?.[1], bars.at(-1)[4]);
  assert.equal(weekly.volumes.reduce((total, point) => total + (point.value ?? 0), 0).toFixed(4), bars.reduce((total: number, bar: any) => total + bar[5], 0).toFixed(4));
  assert.deepEqual(series.bars, themes.asset.bars);
  const view = applyInstrumentCommand(initialInstrumentView(series), series, 'frequency', 'weekly');
  assert.equal(view.frequency, 'weekly'); assert.equal(applyInstrumentCommand(view, series, 'frequency', 'monthly'), view);
});

async function mount(content: React.ReactNode, fetchSource?: typeof fetch) {
  const { document, window: dom } = parseHTML('<html><body><div id="root"></div></body></html>');
  Object.defineProperty(document, 'oninput', { value: null, configurable: true });
  const listeners = new Map<string, Set<(event: any) => void>>(), posts: any[] = [];
  const parent = { document, postMessage: (message: unknown) => posts.push(message) };
  const window = { document, parent, HTMLIFrameElement: dom.HTMLIFrameElement,
    addEventListener: (kind: string, listener: (event: any) => void) => { if (!listeners.has(kind)) listeners.set(kind, new Set()); listeners.get(kind)!.add(listener); },
    removeEventListener: (kind: string, listener: (event: any) => void) => listeners.get(kind)?.delete(listener) };
  const globals = { document, window, location: new URL('https://example.test/market-lab/charts/'), Element: dom.Element, IS_REACT_ACT_ENVIRONMENT: true,
    ...(fetchSource ? { fetch: fetchSource } : {}) };
  const previous = new Map(Object.keys(globals).map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  for (const [key, value] of Object.entries(globals)) Object.defineProperty(globalThis, key, { value, configurable: true });
  const { createRoot } = await import('react-dom/client'); const root = createRoot(document.getElementById('root')!);
  const elementPrototype = dom.Element.prototype as Element & { focus?: () => void };
  const focus = elementPrototype.focus;
  elementPrototype.focus = function () {};
  const cleanup = async () => {
    await act(async () => root.unmount()); elementPrototype.focus = focus;
    for (const [key, descriptor] of previous) if (descriptor) Object.defineProperty(globalThis, key, descriptor); else Reflect.deleteProperty(globalThis, key);
  };
  try { await act(async () => root.render(content)); } catch (error) { await cleanup(); throw error; }
  return { document, posts, parent, cleanup,
    ready: async (selector: string) => { const deadline=Date.now()+5000; while(!document.querySelector(selector)&&Date.now()<deadline) await act(async()=>new Promise(resolve=>setImmediate(resolve))); assert(document.querySelector(selector),`${selector}: ${document.body.textContent}`); },
    render: (content: React.ReactNode) => act(async () => root.render(content)),
    message: (message: unknown, origin = 'https://example.test', source: unknown = parent) => act(async () => { for (const listener of listeners.get('message') || []) listener({ data: message, origin, source }); }),
    key: (selector: string, key: string) => act(async () => { const event = new dom.Event('keydown', { bubbles: true, cancelable: true }); Object.defineProperty(event, 'key', { value: key }); document.querySelector(selector)!.dispatchEvent(event); }),
    click: (selector: string) => act(async () => { const target = document.querySelector(selector); assert(target, selector); target.dispatchEvent(new dom.Event('click', { bubbles: true, cancelable: true })); }),
  };
}

test('instrument commands reject stale scopes, preserve nullable monthly quotes and reopen the common chart from records', async t => {
  const series = housingChartSeries(monthlyRows), cache: InstrumentChartCache = {};
  function Harness() {
    const [tab, setTab] = useState('chart');
    return <InstrumentWorkbench symbol="HOUSING-SEOUL" unit="지수" timezone="Asia/Seoul" series={series} volumeUnit="건" description="월별 가격" cache={cache}
      embedded epoch={7} active visible={tab === 'chart'} currentTab={tab} onRecords={() => setTab('history')} recordsLabel="월별 기록" onShowChart={() => setTab('chart')}/>;
  }
  const fixture = await mount(<Harness/>); t.after(fixture.cleanup);
  const message = (action: string, value?: unknown, extra = {}) => fixture.message({ kind: 'atlas:center-command', epoch: 7, symbol: 'HOUSING-SEOUL', action, value, ...extra });
  const state = () => fixture.posts.filter(post => post.kind === 'atlas:chart-state').at(-1);
  assert.equal(state().close, null); assert.equal(state().last, '2025-09-01'); assert.equal(state().priceLast, '2025-08-01');
  assert.equal(state().volumeLast, '2025-09-01'); assert.deepEqual(state().frequencies, ['monthly']);
  const initial = structuredClone(cache.view);
  await message('scale', undefined, { epoch: 6 }); await message('scale', undefined, { symbol: 'HOUSING-BUSAN' });
  await fixture.message({ kind: 'atlas:center-command', epoch: 7, symbol: 'HOUSING-SEOUL', action: 'scale' }, 'https://foreign.test');
  await fixture.message({ kind: 'atlas:center-command', epoch: 7, symbol: 'HOUSING-SEOUL', action: 'scale' }, undefined, {});
  assert.deepEqual(cache.view, initial);
  await message('scale'); assert.equal(cache.view?.scale, 'log'); assert.equal(state().canUndo, true);
  await message('undo'); assert.equal(cache.view?.scale, 'linear');
  await message('redo'); assert.equal(cache.view?.scale, 'log');
  await message('frequency', 'daily'); await message('type'); assert.equal(cache.view?.frequency, 'monthly'); assert.equal(cache.view?.chartType, 'line');
  await message('date', '2025-04-01'); assert.equal(state().selected, '2025-04-01'); assert.equal(state().close, null, 'an internal gap cannot borrow the next available index');
  await message('tab', 'records'); assert.equal(fixture.document.querySelector('.instrument-workbench')!.hasAttribute('hidden'), true);
  assert.equal(state().tab, 'history');
  await message('pane', 'settings'); assert.equal(fixture.document.querySelector('.instrument-workbench')!.hasAttribute('hidden'), false);
  assert.match(fixture.document.querySelector('.rsi-workbench-panel')!.getAttribute('aria-label')!, /HOUSING-SEOUL 차트 설정/);
  assert.equal(fixture.document.querySelectorAll('.rsi-workbench-panel select').item(0).querySelectorAll('option').length, 1);
  await fixture.key('.rsi-workbench-panel header button', 'Escape'); assert.equal(fixture.document.querySelector('.rsi-workbench-panel'), null, 'Escape closes a drawer while its close control has focus');
});

test('instrument cache restores each housing region range, settings and undo history without crossing identities', async t => {
  const series = housingChartSeries(monthlyRows), seoul: InstrumentChartCache = {}, busan: InstrumentChartCache = {};
  const content = (symbol: string, cache: InstrumentChartCache, epoch: number, active = true) => <InstrumentWorkbench key={symbol} symbol={symbol} unit="지수" timezone="Asia/Seoul" series={series} volumeUnit="건" description="월별 가격" cache={cache} embedded epoch={epoch} active={active}/>;
  const fixture = await mount(content('HOUSING-SEOUL', seoul, 1)); t.after(fixture.cleanup);
  await fixture.message({ kind: 'atlas:center-command', epoch: 1, symbol: 'HOUSING-SEOUL', action: 'zoom', value: .5 });
  await fixture.message({ kind: 'atlas:center-command', epoch: 1, symbol: 'HOUSING-SEOUL', action: 'scale' });
  const saved = structuredClone(seoul.view), savedUndo = structuredClone(seoul.undo);
  await fixture.render(content('HOUSING-BUSAN', busan, 2)); assert.equal(busan.view?.scale, 'linear'); assert.notEqual(busan.view?.start, seoul.view?.start);
  await fixture.message({ kind: 'atlas:center-command', epoch: 2, symbol: 'HOUSING-SEOUL', action: 'fit' }); assert.deepEqual(seoul.view, saved);
  await fixture.render(content('HOUSING-SEOUL', seoul, 3)); assert.deepEqual(seoul.view, saved); assert.deepEqual(seoul.undo, savedUndo);
  await fixture.message({ kind: 'atlas:center-command', epoch: 3, symbol: 'HOUSING-SEOUL', action: 'undo' }); assert.equal(seoul.view?.scale, 'linear'); assert.equal(seoul.view?.start, saved?.start);
  const beforeInactive = structuredClone(seoul.view); await fixture.render(content('HOUSING-SEOUL', seoul, 4, false));
  await fixture.message({ kind: 'atlas:center-command', epoch: 4, symbol: 'HOUSING-SEOUL', action: 'fit' }); assert.deepEqual(seoul.view, beforeInactive);
});

const savedSource: typeof fetch = async url => new Response(JSON.stringify(String(url).endsWith('/data/housing.json') ? housing : String(url).endsWith('/data/themes.json') ? themes : {}), { status: String(url).includes('/api/') ? 503 : 200 });

test('housing parent initializes each newly selected region independently and restores its own chart after other analyses', async t => {
  const cache: HousingCache = {}, fixture = await mount(<HousingPanel cache={cache} selectedRegion="busan" embedded epoch={1}/>, savedSource); t.after(fixture.cleanup);
  await fixture.ready('.housing-chart');
  const message = (symbol: string, epoch: number, action: string, value?: unknown) => fixture.message({ kind: 'atlas:center-command', symbol, epoch, action, value });
  const defaultStart = cache.charts?.busan.view?.start;
  assert.equal(defaultStart, '2016-10-01');
  await message('HOUSING-BUSAN', 1, 'zoom', .4); const busanStart = cache.charts?.busan.view?.start; assert.notEqual(busanStart, defaultStart);
  await fixture.render(<HousingPanel cache={cache} selectedRegion="seoul" embedded epoch={2}/>);
  assert.equal(cache.charts?.seoul.view?.start, defaultStart, 'a first visit cannot inherit another region’s pan or zoom');
  await message('HOUSING-SEOUL', 2, 'tab', 'records'); assert.equal(fixture.document.querySelector('.housing-workbench')?.getAttribute('data-view'), 'history');
  assert(fixture.document.querySelector('.housing-ledger'), 'existing monthly records remain available');
  await message('HOUSING-SEOUL', 2, 'pane', 'method'); assert.match(fixture.document.querySelector('.rsi-workbench-panel')!.textContent!, /신고월/);
  assert.match(fixture.document.querySelector('.rsi-workbench-panel')!.textContent!, /계약월/);
  await fixture.render(<HousingPanel cache={cache} selectedRegion="busan" embedded epoch={3}/>);
  assert.equal(cache.charts?.busan.view?.start, busanStart);
  assert.equal(fixture.document.querySelector('.instrument-workbench')?.getAttribute('data-symbol'), 'HOUSING-BUSAN');
  await message('HOUSING-BUSAN', 3, 'undo'); assert.equal(cache.charts?.busan.view?.start, defaultStart);
});

test('HYPE parent shares chart settings and retains evidence selection without a permanent inspector', async t => {
  const cache: ThemeCache = {}, fixture = await mount(<ThemePanel cache={cache} embedded epoch={9}/>, savedSource); t.after(fixture.cleanup);
  await fixture.ready('.theme-price-chart');
  const message = (action: string, value?: unknown) => fixture.message({ kind: 'atlas:center-command', symbol: 'HYPE', epoch: 9, action, value });
  assert(fixture.document.querySelector('.theme-price-chart')); assert.equal(fixture.document.querySelector('.theme-inspector'), null);
  await message('zoom', .6); assert.equal(cache.view?.start, cache.chart?.view?.start, 'theme event navigation and the shared range have one retained value');
  await message('frequency', 'weekly'); assert.equal(cache.chart?.view?.frequency, 'weekly');
  await message('tab', 'records'); assert(fixture.document.querySelector('[aria-label="연기신 판정 기록 표"]'));
  await message('pane', 'data'); assert(fixture.document.querySelector('[aria-label="선택 근거와 판정"]'));
  await message('fit');
  await fixture.click('.theme-event-mark.evidence'); const selected = cache.evidence;
  assert(selected, 'the evidence marker keeps its real source owner'); assert(fixture.document.querySelector('.rsi-workbench-panel'), 'another marker does not close the inspector');
  await fixture.key('.rsi-workbench-panel header button', 'Escape'); assert.equal(fixture.document.querySelector('.theme-inspector'), null);
  await message('pane', 'method'); assert.match(fixture.document.querySelector('.rsi-workbench-panel')!.textContent!, /HYPE\/USDC 현물/);
  assert.match(fixture.document.querySelector('.rsi-workbench-panel')!.textContent!, /마지막 주는 제공된 일봉까지/);
});
