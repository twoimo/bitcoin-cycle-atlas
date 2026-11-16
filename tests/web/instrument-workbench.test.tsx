import React, { act, useState } from 'react';
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { parseHTML } from 'linkedom';
import { renderToStaticMarkup } from 'react-dom/server';
import { analyzeHousing, type HousingRow } from '@atlas/domain/housing';
import { calculateRsiSeries } from '@atlas/domain/market-lab';
import { weeklyRsiPrices } from '@atlas/domain/rsi-bars';
import { InstrumentWorkbench } from '../../apps/web/src/components/instrument-workbench.js';
import { RsiChartCanvas, readRsiSignalLabelBounds, type ChartQuote, type InstrumentMarker } from '../../apps/web/src/components/rsi-chart-canvas.js';
import { instrumentVolumeScale, compactLegendLabelRange, edgeSafePointLabelPosition, pointLabelWidth, rsiCrossingMarkerKey, selectedPointLabelNeedsSuppression, sparseRsiCrossingLabelKeys, volumeAxisLabelWidth } from '../../apps/web/src/components/funnest-instrument-plot.js';
import { rsiCrossings } from '../../apps/web/src/rsi-crossings.js';
import { RsiWorkbench } from '../../apps/web/src/panels/rsi-workbench.js';
import { HousingChart, housingChartSeries } from '../../apps/web/src/panels/housing-chart.js';
import { HousingPanel, type HousingCache } from '../../apps/web/src/panels/housing-panel.js';
import { ThemePanel, type ThemeCache } from '../../apps/web/src/panels/theme-panel.js';
import { applyInstrumentCommand, displayInstrumentSeries, initialInstrumentView, instrumentRange, observedPricePath,
  type InstrumentChartCache, type InstrumentSeries } from '../../apps/web/src/instrument-chart-model.js';
import { day } from '../../apps/web/src/rsi-chart-model.js';

const plotSource = await readFile(new URL('../../apps/web/src/components/funnest-instrument-plot.tsx', import.meta.url), 'utf8');
const housing = JSON.parse(await readFile(new URL('../../dist/data/housing.json', import.meta.url), 'utf8'));
const themes = JSON.parse(await readFile(new URL('../../dist/data/themes.json', import.meta.url), 'utf8'));
const marketSnapshot = JSON.parse(await readFile(new URL('../../dist/data/market-lab.json', import.meta.url), 'utf8'));
const options = { region: 'busan', window: 36, band: 10, lag: 2, start: '2006-01', end: '2026-09' };
const monthlyRows: HousingRow[] = Array.from({ length: 9 }, (_, index) => ({
  month: `2025-${String(index + 1).padStart(2, '0')}`, price: index === 3 || index === 8 ? null : 100 + index,
  volume: index === 5 ? null : index * 10, average: index < 2 ? null : 40, deviation: null, state: 'neutral', priceChange: null, volumeChange: null,
}));

test('Funnest crossing labels move inward at both mobile and desktop plot widths', () => {
  const label = 'Buy 33.5 / 29.5';
  assert.equal(edgeSafePointLabelPosition(64, label, 1333, 4206, 12, 136), 'right', 'the observed early signal no longer begins outside the plot');
  assert.equal(edgeSafePointLabelPosition(64, label, 390, 4206, 12, 136), 'right', 'the same annotation remains inside a mobile plot');
  assert.equal(edgeSafePointLabelPosition(4205, label, 1333, 4206, 12, 136), 'top', 'interior and late labels keep their usual placement');
});

test('Funnest RSI signal labels stay sparse around the selected date without removing crossing identities', () => {
  const dates = Array.from({ length: 121 }, (_, index) => new Date(Date.UTC(2026, 0, index + 1)).toISOString().slice(0, 10));
  const crossings = [0, 4, 11, 20, 30, 48, 70, 85, 120].map((index, order) => ({
    date: dates[index], side: order % 2 ? 'Sell' as const : 'Buy' as const,
    level: order % 2 ? '40 / 43' : '33.5 / 29.5', rsi: 30 + order,
  }));
  const original = structuredClone(crossings);
  const mobile = sparseRsiCrossingLabelKeys(crossings, dates, dates[50], 390, 64, 68);
  assert(mobile.has(rsiCrossingMarkerKey(crossings.find(row => row.date === dates[48])!)), 'the nearest observed crossing anchors the mobile labels');
  assert.ok(mobile.size >= 1 && mobile.size <= 2, 'the narrow plot keeps only unobstructed labels that can clear the 136px spacing guard');
  const mobileXs = crossings.filter(row => mobile.has(rsiCrossingMarkerKey(row))).map(row => dates.indexOf(row.date) / (dates.length - 1) * (390 - 64 - 68));
  if (mobileXs.length > 1) assert.ok(Math.abs(mobileXs[0] - mobileXs[1]) >= 136, 'mobile labels cannot collide horizontally');
  const desktop = sparseRsiCrossingLabelKeys(crossings, dates, dates[70], 1333, 64, 68);
  assert(desktop.has(rsiCrossingMarkerKey(crossings.find(row => row.date === dates[70])!)), 'an exact selected-date crossing wins label priority');
  assert(selectedPointLabelNeedsSuppression(crossings, desktop, dates, dates[70], 1333, 64, 68), 'the selected-point annotation yields to a crossing label at the same x position');
  assert.ok(desktop.size > mobile.size && desktop.size <= crossings.length, 'a wider plot admits more, but still only a sparse subset');
  assert.equal(new Set(crossings.map(rsiCrossingMarkerKey)).size, crossings.length, 'crossing keys preserve date, side and threshold identity');
  assert.deepEqual(crossings, original, 'label selection never mutates source crossing data');
});

test('saved TQQQ crossings stay complete while the label set scales with the viewport', () => {
  const market = marketSnapshot.markets.find((item: { id: string }) => item.id === 'tqqq')!;
  const rows = calculateRsiSeries(market.prices, 14, 9), crossings = rsiCrossings(rows), dates: string[] = market.prices.map((point: [string, number]) => point[0]);
  const original = structuredClone(crossings), selectedDate = dates.at(-1)!, selectedIndex = dates.length - 1;
  const mobile = sparseRsiCrossingLabelKeys(crossings, dates, selectedDate, 390, 64, 68);
  const mobileNarrow = sparseRsiCrossingLabelKeys(crossings, dates, selectedDate, 388, 64, 68);
  const desktop = sparseRsiCrossingLabelKeys(crossings, dates, selectedDate, 1333, 64, 68);
  const observedDesktop = sparseRsiCrossingLabelKeys(crossings, dates, selectedDate, 1226, 64, 68);
  assert.equal(crossings.length, 331, 'the saved TQQQ series has 331 observed RSI crossing rows');
  assert.ok(mobile.size >= 1 && mobile.size <= 2, 'mobile displays only the labels that fit its 258px plot');
  assert.ok(desktop.size > mobile.size && desktop.size <= 9, 'desktop admits more sparse labels without adding a marker cap');
  assert(selectedPointLabelNeedsSuppression(crossings, observedDesktop, dates, selectedDate, 1226, 64, 68), 'the measured TQQQ desktop label set reserves the overlapping selected-date text');
  const compactRange = compactLegendLabelRange(388)!;
  assert.ok(mobileNarrow.size >= 1 && mobileNarrow.size <= 2, 'mobile still keeps a small visible label subset around the selected date');
  const unobstructed = crossings.filter(row => {
    const index = dates.indexOf(row.date), label = `${row.side} ${row.level}`, pointX = 64 + index / (dates.length - 1) * (388 - 64 - 68);
    const position = edgeSafePointLabelPosition(index, label, 388, dates.length, 64, 136), width = pointLabelWidth(label);
    const left = position === 'right' ? pointX + 10 : pointX - width / 2, right = position === 'right' ? left + width : pointX + width / 2;
    return right <= compactRange[0] || left >= compactRange[1];
  });
  const nearestUnobstructed = unobstructed.reduce((best, row) => {
    const index = dates.indexOf(row.date), bestIndex = dates.indexOf(best.date);
    return Math.abs(index - selectedIndex) < Math.abs(bestIndex - selectedIndex) ||
      Math.abs(index - selectedIndex) === Math.abs(bestIndex - selectedIndex) && index > bestIndex ? row : best;
  });
  assert(mobileNarrow.has(rsiCrossingMarkerKey(nearestUnobstructed)), 'mobile anchors to the nearest crossing whose text is not covered by the compact legend');
  assert(selectedPointLabelNeedsSuppression(crossings, mobileNarrow, dates, selectedDate, 388, 64, 68), 'the selected-date annotation yields to the compact legend control on mobile');
  for (const row of crossings.filter(candidate => mobileNarrow.has(rsiCrossingMarkerKey(candidate)))) {
    const index = dates.indexOf(row.date), label = `${row.side} ${row.level}`, pointX = 64 + index / (dates.length - 1) * (388 - 64 - 68);
    const position = edgeSafePointLabelPosition(index, label, 388, dates.length, 64, 136), width = pointLabelWidth(label);
    const left = position === 'right' ? pointX + 10 : pointX - width / 2, right = position === 'right' ? left + width : pointX + width / 2;
    assert.ok(right <= compactRange[0] || left >= compactRange[1], `${label} avoids the compact legend overlay`);
  }
  assert.equal(new Set(crossings.map(rsiCrossingMarkerKey)).size, crossings.length, 'all crossing rows retain distinct marker keys');
  assert.deepEqual(crossings, original, 'viewport label selection leaves every saved crossing unchanged');
});

test('Funnest volume axis reserves full-width grouped numeric ticks', () => {
  assert.equal(volumeAxisLabelWidth([null, 0]), 72, 'zero and missing volume retain the minimum legible axis gutter');
  assert.equal(volumeAxisLabelWidth([null, 0, 1_000_000]), 74, 'million-scale labels reserve enough width without reducing their font');
  assert.ok(volumeAxisLabelWidth([1_000_000_000_000]) > volumeAxisLabelWidth([1_000_000]), 'large volume units grow the gutter with the actual labels');
});

test('instrument toolbar preserves full-history spacing allowance across a narrow zoom round trip',()=>{
  const series:InstrumentSeries={frequency:'daily',prices:[['2020-01-01',100],['2026-11-07',200]],bars:[],timeline:['2020-01-01','2026-11-07'],volumes:[]};
  const initial=initialInstrumentView(series),inward=applyInstrumentCommand(initial,series,'zoom',Math.exp(-.24),250);
  const outward=applyInstrumentCommand(inward,series,'zoom',Math.exp(.4),250);
  assert(day(inward.end)-day(inward.start)<day(initial.end)-day(initial.start));
  assert.equal(outward.start,initial.start);assert.equal(outward.end,initial.end);
});

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

test('housing Funnest plot retains missing price months, zero versus absent volume, and the index unit', () => {
  const series = housingChartSeries(monthlyRows), view = initialInstrumentView(series);
  const html = renderToStaticMarkup(<HousingChart rows={monthlyRows} start={0} end={8} selected="2025-09" onSelect={() => {}} onRange={() => {}}/>);
  const document = parseHTML(`<html><body>${html}</body></html>`).document;
  const plot = document.querySelector('.housing-chart .atlas-funnest-instrument-plot')!;
  assert.equal(plot.getAttribute('data-chart-engine'), 'funnest');
  assert.equal(plot.getAttribute('data-range-end'), view.end);
  assert.equal(document.querySelectorAll('[data-candle]').length, 0, 'monthly close-only data is never turned into candles');
  assert.equal(document.querySelector('.atlas-funnest-axis-unit')?.textContent, '지수');
  const table = document.querySelector('.housing-chart .atlas-funnest-source-table table')!;
  const zero = [...table.querySelectorAll('tbody tr')].find(row => row.textContent?.includes('2025-01-01'))!;
  const missing = [...table.querySelectorAll('tbody tr')].find(row => row.textContent?.includes('2025-06-01'))!;
  assert.match(zero.textContent!, /0(?:\.00)?/,'a reported zero remains a real observation');
  assert.match(missing.textContent!, /미공표/,'an absent transaction count stays distinct from zero');
  assert.match(table.textContent!, /과거 평균/);
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

async function mount(content: React.ReactNode, fetchSource?: typeof fetch, publicUrl = 'https://example.test/market-lab/charts/', chartSize?: { width: number; height: number }) {
  const { document, window: dom } = parseHTML('<html><body><div id="root"></div></body></html>');
  Object.defineProperty(document, 'oninput', { value: null, configurable: true });
  const listeners = new Map<string, Set<(event: any) => void>>(), posts: any[] = [], urlWrites: string[] = [], storageWrites: string[] = [];
  const location = new URL(publicUrl);
  const parent = { document, location, postMessage: (message: unknown) => posts.push(message) };
  const window = { document, location, parent, HTMLIFrameElement: dom.HTMLIFrameElement,
    addEventListener: (kind: string, listener: (event: any) => void) => { if (!listeners.has(kind)) listeners.set(kind, new Set()); listeners.get(kind)!.add(listener); },
    removeEventListener: (kind: string, listener: (event: any) => void) => listeners.get(kind)?.delete(listener) };
  const globals = { document, window, location, Element: dom.Element, IS_REACT_ACT_ENVIRONMENT: true,
    history: { state: null, replaceState(_state: unknown, _title: string, url: string) { urlWrites.push(url); location.href = new URL(url, location.href).href; } },
    sessionStorage: { getItem: () => null, setItem(key: string) { storageWrites.push(key); }, removeItem(key: string) { storageWrites.push(key); } },
    ...(fetchSource ? { fetch: fetchSource } : {}) };
  const previous = new Map(Object.keys(globals).map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  for (const [key, value] of Object.entries(globals)) Object.defineProperty(globalThis, key, { value, configurable: true });
  const { createRoot } = await import('react-dom/client'); const root = createRoot(document.getElementById('root')!);
  const elementPrototype = dom.Element.prototype as Element & { focus?: () => void };
  const focus = elementPrototype.focus;
  const dimensions = new Map(['clientWidth','clientHeight'].map(key=>[key,Object.getOwnPropertyDescriptor(elementPrototype,key)]));
  if(chartSize)for(const [key,value]of [['clientWidth',chartSize.width],['clientHeight',chartSize.height]] as const)
    Object.defineProperty(elementPrototype,key,{configurable:true,get(this:Element){return this.classList.contains('rsi-chart-canvas')?value:0;}});
  elementPrototype.focus = function () {};
  const cleanup = async () => {
    await act(async () => root.unmount()); elementPrototype.focus = focus;
    if(chartSize)for(const [key,descriptor]of dimensions)if(descriptor)Object.defineProperty(elementPrototype,key,descriptor);else Reflect.deleteProperty(elementPrototype,key);
    for (const [key, descriptor] of previous) if (descriptor) Object.defineProperty(globalThis, key, descriptor); else Reflect.deleteProperty(globalThis, key);
  };
  try { await act(async () => root.render(content)); } catch (error) { await cleanup(); throw error; }
  return { document, posts, parent, cleanup, urlWrites, storageWrites,
    ready: async (selector: string) => { const deadline=Date.now()+5000; while(!document.querySelector(selector)&&Date.now()<deadline) await act(async()=>new Promise(resolve=>setImmediate(resolve))); assert(document.querySelector(selector),`${selector}: ${document.body.textContent}`); },
    render: (content: React.ReactNode) => act(async () => root.render(content)),
    message: (message: unknown, origin = 'https://example.test', source: unknown = parent) => act(async () => { for (const listener of listeners.get('message') || []) listener({ data: message, origin, source }); }),
    key: (selector: string, key: string) => act(async () => { const event = new dom.Event('keydown', { bubbles: true, cancelable: true }); Object.defineProperty(event, 'key', { value: key }); document.querySelector(selector)!.dispatchEvent(event); }),
    dispatch: (selector: string, kind: string, values: Record<string, unknown> = {}) => { let prevented = false; act(() => { const event = new dom.Event(kind, { bubbles: true, cancelable: true }); for (const [key,value] of Object.entries(values)) Object.defineProperty(event,key,{value}); document.querySelector(selector)!.dispatchEvent(event); prevented=event.defaultPrevented; }); return prevented; },
    dispatchWindow: (kind: string, values: Record<string, unknown> = {}) => act(() => { const event = new dom.Event(kind,{bubbles:true,cancelable:true}); for (const [key,value] of Object.entries(values)) Object.defineProperty(event,key,{value}); dom.dispatchEvent(event); }),
    click: (selector: string) => act(async () => { const target = document.querySelector(selector); assert(target, selector); target.dispatchEvent(new dom.Event('click', { bubbles: true, cancelable: true })); }),
  };
}

test('the React chart mounts one common legend and cleans up its dialog when the active instrument changes',async()=>{
  const series:InstrumentSeries={frequency:'daily',prices:[['2025-01-01',10],['2025-12-31',20]],bars:[],timeline:['2025-01-01','2025-12-31'],volumes:[]};
  const props={symbol:'HYPE',unit:'USDC',series,prices:series.prices,bars:[],rows:[],view:initialInstrumentView(series),active:true,menuPulse:0,hover:null,svgRef:{current:null},
    onView:()=>{},onStart:()=>{},onEnd:()=>{},onHover:()=>{},onPick:()=>{}};
  const fixture=await mount(<RsiChartCanvas {...props}/>,undefined,undefined,{width:390,height:600});
  try{
    const original=fixture.document.querySelector('#chart-legend-dialog');assert.ok(original);
    assert.equal(fixture.document.querySelectorAll('.chart-legend-dock').length,1);
    assert.equal(fixture.document.querySelector('.rsi-chart-canvas')?.getAttribute('data-legend-dock'),'top-right');
    assert.match(fixture.document.querySelector('.lab-legend')?.textContent||'',/실제 가격/);
    await fixture.render(<RsiChartCanvas {...props} symbol="HOUSING-SEOUL" unit="지수" series={{...series,frequency:'monthly'}}/>);
    assert.equal(original.isConnected,false);assert.equal(fixture.document.querySelectorAll('#chart-legend-dialog').length,1);
    assert.match(fixture.document.querySelector('.lab-legend')?.textContent||'',/실제 지수/);
    assert.equal(fixture.document.querySelectorAll('.chart-legend-dock').length,1);
  }finally{await fixture.cleanup();}
  assert.equal(fixture.document.querySelector('#chart-legend-dialog'),null);
});

test('the price SVG publishes its plot box on first mount when the measured size equals the initial size',async()=>{
  const series:InstrumentSeries={frequency:'daily',prices:[['2025-01-01',10],['2025-12-31',20]],bars:[],timeline:['2025-01-01','2025-12-31'],volumes:[]};
  const props={symbol:'HYPE',unit:'USDC',series,prices:series.prices,bars:[],rows:[],view:initialInstrumentView(series),active:true,menuPulse:0,hover:null,svgRef:{current:null},
    onView:()=>{},onStart:()=>{},onEnd:()=>{},onHover:()=>{},onPick:()=>{}};
  const fixture=await mount(<RsiChartCanvas {...props}/>,undefined,undefined,{width:900,height:520});
  try{
    const svg=fixture.document.querySelector('.atlas-funnest-instrument-plot svg')!;
    assert.deepEqual(['data-plot-left','data-plot-right','data-plot-top','data-plot-bottom','data-time-axis-top'].map(key=>svg.getAttribute(key)),['12','832','20','394','394'],
      'the drawn plot box is published without waiting for a resize');
  }finally{await fixture.cleanup();}
});

test('the React quote HUD keeps the shared field nodes across updates and reserves the price plot header',async()=>{
  const series:InstrumentSeries={frequency:'daily',prices:[['2025-01-01',10],['2025-12-31',20]],bars:[],timeline:['2025-01-01','2025-12-31'],volumes:[]};
  const props={symbol:'HYPE',unit:'USDC',series,prices:series.prices,bars:[],rows:[],view:initialInstrumentView(series),active:true,menuPulse:0,hover:null,svgRef:{current:null},
    onView:()=>{},onStart:()=>{},onEnd:()=>{},onHover:()=>{},onPick:()=>{}};
  const fixture=await mount(<RsiChartCanvas {...props}/>,undefined,undefined,{width:390,height:600});
  try{
    const hud=fixture.document.querySelector('.atlas-quote-hud')!;
    const fields=[...hud.querySelectorAll('[data-quote-field]')],price=hud.querySelector('[data-quote-field=price]')!;
    assert.equal(hud.querySelectorAll('.quote-hud-row').length,2);
    assert.equal(price.textContent,'—','a direct canvas without a source quote cannot invent its own close');
    assert.equal(hud.querySelector('[data-quote-field=time]')?.textContent,'—');
    const quote:ChartQuote={symbol:'HYPE',name:'HYPE',fullName:'Hyperliquid HYPE/USDC',interval:'1D',kind:'observed',
      priceText:'20 USDC',changePct:100,dateTime:'2025-12-31',timezone:'UTC',rsi:62.4,source:'Hyperliquid',sourceDescription:'Hyperliquid spot candle source'};
    await fixture.render(<RsiChartCanvas {...props} quote={quote} hover={{date:'2025-12-31',panel:'rsi',value:3}}/>);
    assert.equal(fixture.document.querySelector('.atlas-quote-hud'),hud);
    assert.deepEqual([...hud.querySelectorAll('[data-quote-field]')],fields,'hover updates retain the same field layout');
    assert.equal(price.textContent,'20 USDC','an oscillator cursor value is never a price quote');
    assert.equal(hud.querySelector('[data-quote-rsi-value]')?.textContent,'62.4');
    assert.match(hud.getAttribute('aria-label')||'',/Hyperliquid HYPE\/USDC/);
    const svg=fixture.document.querySelector('.rsi-chart-canvas svg')!;
    assert.equal(Number(svg.getAttribute('data-plot-top')),20);
    assert.equal(Number(svg.getAttribute('width')),390,'the fixture supplies its measured width to the actual Funnest context');
    assert.equal(390-Number(svg.getAttribute('data-plot-right')),68,'the real Funnest right axis reserves 68px once, without a duplicate inset');
    await fixture.render(<RsiChartCanvas {...props} symbol="HOUSING-SEOUL" unit="지수" quote={{symbol:'HOUSING-SEOUL',name:'서울',fullName:'서울 아파트 실거래가격지수',interval:'1M',kind:'unavailable'}}/>);
    assert.equal(fixture.document.querySelectorAll('.atlas-quote-hud').length,1);
    assert.equal(fixture.document.querySelector('.atlas-quote-hud'),hud);
    assert.deepEqual([...hud.querySelectorAll('[data-quote-field]')],fields);
    assert.equal(price.textContent,'—');assert.equal(hud.querySelector('[data-quote-rsi-value]')?.textContent,'—');
  }finally{await fixture.cleanup();}
  assert.equal(fixture.document.querySelector('.atlas-quote-hud'),null);
});

test('all ETF HUDs follow the actual selected daily or weekly observation, canonical RSI and source calendar',async()=>{
  for(const [symbol,id,lastPrice,zone]of [['TQQQ','tqqq','$62.01','NY'],['SOXL','soxl','$68.17','NY'],['233740','kodex-kosdaq150','₩4,990','KST']]){
    const market=marketSnapshot.markets.find((item:{id:string})=>item.id===id),original=structuredClone(market.prices);
    const rows=calculateRsiSeries(market.prices,14,9),source=marketSnapshot.sources.find((item:{id:string})=>item.id===market.sourceId);
    const fixture=await mount(<RsiWorkbench symbol={symbol} market={market} snapshot={marketSnapshot} now={new Date('2026-11-09T12:00:00Z')}
      rows={rows} epoch={9} active embedded onDate={()=>{}} comparison={null} references={null}/>);
    try{
      const hud=fixture.document.querySelector('.atlas-quote-hud')!,field=(name:string)=>hud.querySelector(`[data-quote-field=${name}]`)!;
      const criteria=fixture.document.querySelector(`[data-rsi-criteria="${symbol}"]`)!;
      assert(criteria);assert.equal(criteria.parentElement,hud.parentElement,'quote and criteria share the actual price canvas');
      assert.equal(fixture.document.querySelector('.rsi-workbench>.rsi-simulation-hud'),null,'full-width holdings are available from the details, leaving plot height intact');
      const wholeCriteria=criteria.textContent;
      const send=(action:string,value:unknown)=>fixture.message({kind:'atlas:center-command',epoch:9,symbol,action,value});
      assert.equal(field('name').textContent,({TQQQ:'삼플레',SOXL:'속쓸','233740':'코스닥150 2배'} as Record<string,string>)[symbol]);
      assert.ok(field('name').getAttribute('aria-label')?.includes(symbol));
      assert.ok(hud.getAttribute('aria-label')?.includes(symbol));
      assert.equal(field('interval').textContent,'1D');assert.equal(field('price').textContent,lastPrice);
      assert.equal(field('time').getAttribute('datetime'),market.prices.at(-1)[0]);
      assert.equal(field('time').textContent,`${market.prices.at(-1)[0].replaceAll('-','.')} ${zone}`);
      assert.equal(Number(hud.querySelector('[data-quote-rsi-value]')?.textContent),Math.round(rows.at(-1)!.rsi!*10)/10);
      assert.equal(field('source').textContent,'Yahoo Finance');assert.ok(field('source').getAttribute('title')?.includes(source.label));
      assert.ok(field('source').getAttribute('title')?.includes(source.retrievedAt));
      assert.ok(field('source').getAttribute('title')?.includes(source.url));
      await send('frequency','weekly');
      const weekly=weeklyRsiPrices(market.prices),weeklyRows=calculateRsiSeries(weekly,14,9);
      assert.equal(field('interval').textContent,'1W');assert.equal(field('time').getAttribute('datetime'),weekly.at(-1)![0]);
      assert.equal(Number(hud.querySelector('[data-quote-rsi-value]')?.textContent),Math.round(weeklyRows.at(-1)!.rsi!*10)/10);
      await send('frequency','daily');await send('date',market.prices[0][0]);
      assert.equal(field('time').getAttribute('datetime'),market.prices[0][0]);
      assert.equal(hud.querySelector('[data-quote-rsi-value]')?.textContent,'—');assert.equal(field('change').textContent,'전봉 —');
      assert.equal(fixture.document.querySelector('.atlas-quote-hud'),hud,'commands update the source-owned shared fields');
      assert.equal(criteria.textContent,wholeCriteria,'daily/weekly and selected past dates do not relabel the full-history current criteria');
      assert.equal(criteria.getAttribute('data-criteria-through'),market.prices.at(-1)[0]);
      assert.deepEqual(market.prices,original);
    }finally{await fixture.cleanup();}
  }
});

test('standalone RSI criteria summaries own keyboard input while the chart shortcuts resume after closing',async()=>{
  const market=marketSnapshot.markets.find((item:{id:string})=>item.id==='tqqq'),rows=calculateRsiSeries(market.prices,14,9);
  const fixture=await mount(<RsiWorkbench symbol="TQQQ" market={market} snapshot={marketSnapshot} now={new Date('2026-11-09T12:00:00Z')}
    rows={rows} epoch={1} active embedded={false} onDate={()=>{}} comparison={null} references={null}/>);
  try{
    const dialog=fixture.document.querySelector('.rsi-detail-dialog')!,dom=fixture.document.defaultView!;
    Object.defineProperty(dialog,'open',{configurable:true,get:()=>dialog.hasAttribute('open')});
    Object.assign(dialog,{showModal(){dialog.setAttribute('open','');},close(){if(dialog.hasAttribute('open')){dialog.removeAttribute('open');dialog.dispatchEvent(new dom.Event('close'));}}});
    const quoteDate=()=>fixture.document.querySelector('[data-quote-field=time]')?.getAttribute('datetime'),before=quoteDate();
    const sourceTable=fixture.document.querySelector('.atlas-funnest-source-table table')!;
    assert.equal(sourceTable.querySelectorAll('tbody tr').length,market.prices.length,'the complete daily table is still rendered for keyboard/readout users');
    assert.match(sourceTable.textContent||'',/RSI14/);
    await fixture.click('[data-rsi-criteria]');assert(dialog.hasAttribute('open'));
    for(const key of ['ArrowLeft','ArrowRight','c','h','m']){
      await fixture.key('.rsi-criteria-details summary',key);
      assert(dialog.hasAttribute('open'),`${key} must not dismiss the criteria dialog`);
      assert.equal(quoteDate(),before,`${key} must not change the underlying selection`);
      assert.equal(fixture.document.querySelector('.rsi-chart-canvas')?.getAttribute('data-tool'),'crosshair');
    }
    const scrollBody=dialog.querySelector('.rsi-detail-body') as HTMLElement;
    scrollBody.scrollTop=360;await fixture.click('[data-rsi-dialog-close]');assert.equal(dialog.hasAttribute('open'),false);
    await fixture.click('[data-rsi-criteria]');assert(dialog.hasAttribute('open'));
    assert.equal(scrollBody.scrollTop,0,'a reopened dialog restarts at its own top instead of keeping a stale offset');
    scrollBody.scrollTop=240;await fixture.click('[data-rsi-view="backtest"]');
    assert.equal(dialog.getAttribute('data-rsi-dialog'),'backtest','the open dialog switches to the requested tab');
    assert.equal(scrollBody.scrollTop,0,'a dialog that changes tab restarts at its own top');
    await fixture.click('[data-rsi-dialog-close]');assert.equal(dialog.hasAttribute('open'),false);
    await fixture.key('.rsi-chart-canvas svg','ArrowLeft');assert.notEqual(quoteDate(),before,'normal chart navigation resumes');
  }finally{await fixture.cleanup();}
});

test('HYPE HUD uses canonical daily and weekly USDC RSI without enabling an oscillator or changing retained prices',async()=>{
  const bars=structuredClone(themes.asset.bars);
  const series:InstrumentSeries={frequency:'daily',bars,prices:bars.map((bar:any)=>[bar[0],bar[4]]),timeline:bars.map((bar:any)=>bar[0]),volumes:bars.map((bar:any)=>({date:bar[0],value:bar[5]}))};
  const fixture=await mount(<InstrumentWorkbench symbol="HYPE" unit="USDC" timezone="UTC" series={series} volumeUnit="HYPE" description="HYPE/USDC 현물 관측" embedded epoch={4}/>);
  try{
    const hud=fixture.document.querySelector('.atlas-quote-hud')!,field=(name:string)=>hud.querySelector(`[data-quote-field=${name}]`)!;
    assert.equal(field('name').textContent,'하이퍼리퀴드');
    assert.equal(field('source').textContent,'Hyperliquid');assert.equal(field('time').getAttribute('datetime'),bars.at(-1)[0]);
    assert.match(field('price').textContent||'',/ USDC$/);assert.doesNotMatch(field('price').textContent||'',/\$/);
    assert.equal(Number(hud.querySelector('[data-quote-rsi-value]')?.textContent),Math.round(calculateRsiSeries(series.prices).at(-1)!.rsi!*10)/10);
    await fixture.message({kind:'atlas:center-command',epoch:4,symbol:'HYPE',action:'frequency',value:'weekly'});
    const weekly=displayInstrumentSeries(series,'weekly');
    assert.equal(field('interval').textContent,'1W');assert.equal(field('time').getAttribute('datetime'),weekly.prices.at(-1)![0]);
    assert.equal(Number(hud.querySelector('[data-quote-rsi-value]')?.textContent),Math.round(calculateRsiSeries(weekly.prices).at(-1)!.rsi!*10)/10);
    assert.equal(fixture.document.querySelector('svg [data-chart=rsi]'),null,'the quote summary does not manufacture HYPE oscillator controls');
    assert.doesNotMatch(fixture.document.querySelector('.lab-legend')?.textContent||'',/RSI14|SMA9/);
    assert.deepEqual(series.bars,themes.asset.bars);
  }finally{await fixture.cleanup();}
});

test('every housing HUD preserves an unpublished selected month with missing price and RSI slots',async()=>{
  for(const region of housing.regions){
    const rows=analyzeHousing(housing,{...options,region:region.id}).rows,series=housingChartSeries(rows),symbol=`HOUSING-${region.id.toUpperCase()}`;
    const fixture=await mount(<InstrumentWorkbench symbol={symbol} unit="지수" timezone="Asia/Seoul" series={series} volumeUnit="건" description="월별 아파트 실거래가격지수" embedded epoch={5}/>);
    try{
      const hud=fixture.document.querySelector('.atlas-quote-hud')!,field=(name:string)=>hud.querySelector(`[data-quote-field=${name}]`)!;
      assert.equal(field('interval').textContent,'1M');assert.equal(field('price').textContent,'—');assert.equal(field('change').textContent,'전봉 —');
      assert.equal(field('time').textContent,'2026.09 KST');assert.equal(field('time').getAttribute('datetime'),'2026-09-01');
      assert.equal(field('source').textContent,'한국부동산원');assert.equal(hud.querySelector('[data-quote-rsi-value]')?.textContent,'—');
      assert.match(field('rsi').getAttribute('aria-label')||'',/월별 실거래가격지수 RSI 미제공/);
      assert.match(hud.getAttribute('aria-label')||'',/아파트 실거래가격지수/);
      await fixture.message({kind:'atlas:center-command',epoch:5,symbol,action:'date',value:'2026-08-01'});
      assert.equal(field('time').textContent,'2026.08 KST');assert.equal(field('kind').textContent,'지수');
      assert.equal(Number(field('price').textContent?.replaceAll(',','')),Number(region.price.at(-1)[1].toFixed(2)));
      assert.equal(hud.querySelector('[data-quote-rsi-value]')?.textContent,'—');assert.equal(hud.getAttribute('data-kind'),'observed');
      assert.equal(fixture.document.querySelector('.atlas-quote-hud'),hud);assert.equal(fixture.document.querySelectorAll('.quote-hud-row').length,2);
    }finally{await fixture.cleanup();}
  }
});

test('Funnest annotation list retains all dated evidence and judgment actions across viewport sizes', async () => {
  const series:InstrumentSeries={frequency:'daily',prices:[['2025-01-01',10],['2025-12-31',20]],bars:[],timeline:['2025-01-01','2025-12-31'],volumes:[]};
  for(const [width,height] of [[320,808],[390,338],[1335,820]]){
    const selected:string[]=[],opened:string[]=[];
    const marker=(id:string,date:string,kind:'evidence'|'judgment',chosen=false):InstrumentMarker=>({id,date,kind,label:kind==='evidence'?'E':'J',title:id,selected:chosen,onSelect:()=>selected.push(id)});
    const markers=[marker('left-selected','2025-01-01','evidence',true),marker('left-other','2025-01-01','evidence'),marker('left-judgment','2025-01-01','judgment'),marker('near-left','2025-01-02','evidence'),
      marker('near-right','2025-12-30','evidence'),marker('right-selected','2025-12-31','evidence',true),marker('right-other','2025-12-31','evidence'),marker('right-judgment','2025-12-31','judgment')];
    const fixture=await mount(<RsiChartCanvas symbol="HYPE" unit="USDC" series={series} prices={series.prices} bars={[]} rows={[]}
      view={initialInstrumentView(series)} active menuPulse={0} hover={null} svgRef={{current:null}} markers={markers}
      onView={()=>{}} onStart={()=>{}} onEnd={()=>{}} onHover={()=>{}} onPick={()=>{}} onMarker={()=>opened.push('details')}/>,undefined,undefined,{width,height});
    try{
      const list=fixture.document.querySelector('[aria-label="차트 근거·판정 표식"]')!;
      const buttons=[...list.querySelectorAll('button')];
      assert.equal(buttons.length,8,`${width}px: all annotations, including dates without an exact plotted slot, remain available`);
      assert(buttons.some(button=>button.textContent?.includes('2025-01-02 · 근거 · near-left')));
      assert(buttons.some(button=>button.textContent?.includes('2025-12-30 · 근거 · near-right')));
      assert.equal(buttons.filter(button=>button.getAttribute('aria-pressed')==='true').length,2);
      await fixture.click('[aria-label="차트 근거·판정 표식"] button');
      assert.deepEqual(selected,['left-selected']);assert.deepEqual(opened,['details']);
    }finally{await fixture.cleanup();}
  }
});

test('ETF price axes expose the original snapshot USD and KRW units above the plot',()=>{
  for(const [symbol,id,unit]of [['TQQQ','tqqq','USD'],['SOXL','soxl','USD'],['233740','kodex-kosdaq150','KRW']]){
    const market=marketSnapshot.markets.find((item:{id:string})=>item.id===id);assert.equal(market.unit,unit);
    const html=renderToStaticMarkup(<RsiWorkbench symbol={symbol} market={market} snapshot={marketSnapshot} now={new Date(marketSnapshot.generatedAt)}
      rows={[]} epoch={1} active embedded={false} onDate={()=>{}} comparison={null} references={null}/>);
    const document=parseHTML(`<html><body>${html}</body></html>`).document,label=document.querySelector('.atlas-funnest-axis-unit');
    assert(label,`${symbol}: a unit is required without opening a disclosure`);assert.equal(label.textContent,unit);
  }
});

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
  // The short monthly fixture is already beyond the maximum candle spacing, and
  // its full range cannot pan. A 90-day span is a distinct viewport inside the data.
  await fixture.message({ kind: 'atlas:center-command', epoch: 1, symbol: 'HOUSING-SEOUL', action: 'span', value: 90 });
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

test('HYPE restores a common URL through its real parent without initial edits or journal writes', async t => {
  const cache: ThemeCache = {}, publicUrl='https://example.test/market-lab/charts/?symbol=HYPE&granularity=weekly&type=line&axis=linear&view-start=2025-01-01&view-end=2026-01-01&price-min=0&price-max=120&axis-inverted=1&magnet=weak';
  const fixture=await mount(<ThemePanel cache={cache} embedded epoch={9}/>,savedSource,publicUrl);t.after(fixture.cleanup);
  await fixture.ready('.theme-price-chart');
  const states=()=>fixture.posts.filter(post=>post.kind==='atlas:chart-state');
  const restored=states().at(-1);
  assert.equal(restored.frequency,'weekly');assert.equal(restored.chartType,'line');assert.equal(restored.scale,'linear');
  assert.equal(restored.start,'2025-01-01');assert.equal(restored.end,'2026-01-01');assert.deepEqual(restored.urlView.domain,{min:0,max:120});
  assert.equal(restored.urlView.inverted,true);assert.equal(restored.magnet,'weak');assert.equal(restored.canUndo,false);
  assert(states().every(state=>state.userViewRevision===0),'parent synchronization is initialization, not a user edit');
  assert.equal(cache.view?.start,cache.chart?.view?.start,'legacy event navigation receives the restored chart range');
  assert.equal(cache.view?.style,'line');assert.equal(fixture.urlWrites.length,0);assert.equal(fixture.storageWrites.length,0);
  assert.equal(location.href,publicUrl);
  await fixture.message({kind:'atlas:center-command',symbol:'HYPE',epoch:9,action:'magnet'});
  assert.equal(states().at(-1).userViewRevision,1);assert.equal(states().at(-1).magnet,'strong');assert.equal(states().at(-1).canUndo,true);
  assert.equal(fixture.urlWrites.length,0,'the embedded child publishes its edit for its scoped host to serialize');
  assert.equal(fixture.storageWrites.length,0,'view edits do not create a research judgment');
});

test('monthly housing restores shared keys and keeps first-entry controls and history source-faithful', async t => {
  const cache: HousingCache = {}, publicUrl='https://example.test/market-lab/charts/?symbol=HOUSING-SEOUL&granularity=weekly&type=candles&axis=log&view-start=2020-01-01&view-end=2026-09-01&magnet=strong';
  const fixture=await mount(<HousingPanel cache={cache} selectedRegion="seoul" embedded epoch={3}/>,savedSource,publicUrl);t.after(fixture.cleanup);
  await fixture.ready('.housing-chart');
  const states=fixture.posts.filter(post=>post.kind==='atlas:chart-state'),restored=states.at(-1);
  assert.equal(restored.frequency,'monthly');assert.equal(restored.chartType,'line');assert.equal(restored.candles,false);
  assert.equal(restored.start,'2020-01-01');assert.equal(restored.end,'2026-09-01');assert.equal(restored.scale,'log');assert.equal(restored.magnet,'strong');
  assert.equal(restored.canUndo,false);assert(states.every(state=>state.userViewRevision===0));
  assert.equal(fixture.urlWrites.length,0);assert.equal(fixture.storageWrites.length,0);assert.equal(location.href,publicUrl);
});

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
  assert.equal(fixture.document.querySelector('.theme-price-chart .atlas-funnest-axis-unit')?.textContent,'USDC');
  const message = (action: string, value?: unknown) => fixture.message({ kind: 'atlas:center-command', symbol: 'HYPE', epoch: 9, action, value });
  assert(fixture.document.querySelector('.theme-price-chart')); assert.equal(fixture.document.querySelector('.theme-inspector'), null);
  const sourceDisclosure = fixture.document.querySelector('.atlas-funnest-source-table')!;
  assert.equal(sourceDisclosure.firstElementChild?.tagName.toLowerCase(), 'summary', 'native disclosure summary remains its first semantic child');
  assert(sourceDisclosure.querySelector('.atlas-funnest-source-body .atlas-funnest-marker-list'), 'evidence and judgment markers live in the same bounded disclosure as source data');
  assert(sourceDisclosure.querySelector('.atlas-funnest-source-body .atlas-funnest-table-scroll table tbody tr'), 'complete source rows remain in the disclosure body');
  assert.equal(fixture.document.querySelectorAll(':scope > .atlas-funnest-marker-list').length, 0, 'the unbounded standalone marker list is removed');
  await message('zoom', .6); assert.equal(cache.view?.start, cache.chart?.view?.start, 'theme event navigation and the shared range have one retained value');
  await message('frequency', 'weekly'); assert.equal(cache.chart?.view?.frequency, 'weekly');
  await message('tab', 'records'); assert(fixture.document.querySelector('[aria-label="연기신 판정 기록 표"]'));
  await message('pane', 'data'); assert(fixture.document.querySelector('[aria-label="선택 근거와 판정"]'));
  await message('fit');
  const disclosure = fixture.document.querySelector('.atlas-funnest-source-table')!; disclosure.setAttribute('open','');
  const rangeBeforePanelInput = [cache.chart?.view?.start,cache.chart?.view?.end];
  assert.equal(fixture.dispatch('.atlas-funnest-source-body','wheel',{deltaY:-120,clientX:240}),false,'drawer wheel remains available for native scrolling');
  for (const key of ['ArrowUp','ArrowDown','Home','End',' ']) await fixture.key('.atlas-funnest-source-body',key);
  assert.deepEqual([cache.chart?.view?.start,cache.chart?.view?.end],rangeBeforePanelInput,'wheel and keyboard navigation inside the disclosure do not alter the chart range');
  await message('tool','pan');
  const panRange=[cache.chart?.view?.start,cache.chart?.view?.end];
  fixture.dispatch('.atlas-funnest-table-scroll','pointerdown',{button:0,clientX:20});
  await fixture.dispatchWindow('pointermove',{clientX:220}); await fixture.dispatchWindow('pointerup');
  assert.deepEqual([cache.chart?.view?.start,cache.chart?.view?.end],panRange,'horizontal table-drag input cannot start chart panning');
  await fixture.click('.atlas-funnest-marker-list button'); const selected = cache.evidence;
  assert(selected, 'the evidence marker keeps its real source owner'); assert(fixture.document.querySelector('.rsi-workbench-panel'), 'another marker does not close the inspector');
  await fixture.key('.rsi-workbench-panel header button', 'Escape'); assert.equal(fixture.document.querySelector('.theme-inspector'), null);
  await message('pane', 'method'); assert.match(fixture.document.querySelector('.rsi-workbench-panel')!.textContent!, /HYPE\/USDC 현물/);
  assert.match(fixture.document.querySelector('.rsi-workbench-panel')!.textContent!, /마지막 주는 제공된 일봉까지/);
});


test('selected-point label is suppressed at a real marker while selected index/date remain intact',()=>{
  assert.match(plotSource, /markersAt\.some\(marker => marker\.at === selectedIndex\)/);
  assert.match(plotSource, /labelPosition=\{selectedLabelPosition\}/);
  assert.match(plotSource, /const selectedLabelPosition = edgeSafePointLabelPosition\(selectedIndex/);
  assert.match(plotSource, /const dateTickSpacing = chartWidth <= 500 \? 105 : 120/);
  assert.match(plotSource, /<YAxis axisId="price" width=\{68\}/);
});

test('source disclosure is a bounded independently scrollable overlay with a reachable 44px summary and marker targets', async () => {
  const css = await readFile(new URL('../../apps/web/src/instrument-workbench.css', import.meta.url), 'utf8');
  assert.match(css, /(?:^|\n)\.atlas-funnest-instrument-plot\s*\{[^}]*position:\s*relative/);
  assert.doesNotMatch(css, /\.instrument-workbench\s+\.atlas-funnest-instrument-plot\s*\{/);
  assert.match(css, /\.atlas-funnest-instrument-plot\s+\.atlas-funnest-source-table\s*\{[^}]*position:\s*absolute[^}]*inset:\s*auto 0 0[^}]*max-height:\s*100%/);
  assert.match(css, /\.atlas-funnest-instrument-plot\s+\.atlas-funnest-source-table\[open\]\s*\{\s*height:\s*min\(420px, 100%\)/);
  assert.match(css, /\.atlas-funnest-instrument-plot\s+\.atlas-funnest-source-table\s*>\s*summary\s*\{[^}]*position:\s*absolute[^}]*inset:\s*auto 0 0[^}]*height:\s*44px/);
  assert.match(css, /\.atlas-funnest-instrument-plot\s+\.atlas-funnest-source-body\s*\{[^}]*position:\s*absolute[^}]*inset:\s*0 0 44px[^}]*overflow:\s*auto/);
  const panelHeight = Number(css.match(/\.atlas-funnest-instrument-plot\s+\.atlas-funnest-source-table\[open\]\s*\{\s*height:\s*min\((\d+)px, 100%\)/)?.[1]);
  const closeHeight = Number(css.match(/\.atlas-funnest-instrument-plot\s+\.atlas-funnest-source-table\s*>\s*summary\s*\{[^}]*height:\s*(\d+)px/)?.[1]);
  assert.equal(panelHeight - closeHeight, 376, 'the 420px panel reserves the close bar, leaving a finite 376px body');
  assert.match(css, /\.atlas-funnest-instrument-plot\s+\.atlas-funnest-table-scroll\s*\{[^}]*overflow:\s*auto/);
  assert.match(css, /\.atlas-funnest-instrument-plot\s+\.atlas-funnest-marker-list button\s*\{[^}]*min-height:\s*44px/);
  assert.match(css, /\.atlas-funnest-instrument-plot\s+\.atlas-funnest-source-table\s*>\s*summary:focus-visible[^}]*outline:/);
  assert.doesNotMatch(css, /(?:^|\n)\.atlas-funnest-source-table\s*\{/);
  assert.match(css, /\.atlas-funnest-instrument-plot\s*\{[^}]*position:\s*relative/);
  assert.match(plotSource, /const isPlotControlTarget = \(target: EventTarget \| null\)/);
  assert.match(plotSource, /onWheel=\{event => \{ if \(isPlotControlTarget\(event\.target\)\) return; event\.preventDefault\(\)/);
  assert.match(plotSource, /onPointerDown=\{event => \{ if \(isPlotControlTarget\(event\.target\) \|\| !active/);
  assert.match(plotSource, /onClick=\{event => \{ if \(isPlotControlTarget\(event\.target\)\) return;/);
  assert.match(plotSource, /onContextMenu=\{event => \{ if \(isPlotControlTarget\(event\.target\)\) return;/);
  assert.match(plotSource, /onKeyDown=\{event => \{ if \(isPlotControlTarget\(event\.target\)\) return;/);
});

test('native volume scaling preserves the original lower strip without changing observations or filling gaps',()=>{
  const values=[null,0,9_000_000],averages=[null,4_000_000,10_000_000],original=structuredClone({values,averages});
  for(const height of [180,478,900])for(const instrument of [false,true]){
    const result=instrumentVolumeScale(values,averages,height,instrument);
    const expected=Math.min(height,instrument?Math.min(96,Math.max(24,height*.17)):48);
    assert.equal(result.maximum,10_000_000);assert.equal(result.stripHeight,expected);
    assert.ok(Math.abs(result.maximum/result.domain.max*height-expected)<1e-9,'Funnest maps the actual maximum into the preserved volume-strip height');
    assert(result.ticks.every(value=>value>=0&&value<=result.maximum));
  }
  assert.deepEqual({values,averages},original);
  assert.deepEqual(instrumentVolumeScale([null,0],[],478,true).ticks,[0],'no nonzero observation or label is invented');
});

test('RSI HUD obstacles come from actual signal-label DOMRects in the plot owner coordinate space',()=>{
  const {document}=parseHTML('<div id="plot"><div class="atlas-funnest-instrument-plot"><svg><text>Buy 33.5</text><text>Sell 43</text><text>9,000,000</text><text>Buy 29.5</text></svg></div></div>');
  const root=document.querySelector('#plot')!,labels=[...root.querySelectorAll('text')];
  Object.defineProperty(root,'getBoundingClientRect',{value:()=>({left:100,top:60,width:917,height:600})});
  for(const [index,node]of labels.entries())Object.defineProperty(node,'getBoundingClientRect',{value:()=>({left:600+index*80,top:100+index*15,width:index===3?0:44,height:13})});
  assert.deepEqual(readRsiSignalLabelBounds(root),[{x:500,y:40,width:44,height:13},{x:580,y:55,width:44,height:13}]);
});


test('Funnest axis units align to the price gutter without requiring a housing/theme-only ancestor', async () => {
  const css = await readFile(new URL('../../apps/web/src/instrument-workbench.css', import.meta.url), 'utf8');
  const rule = css.match(/(?:^|\n)\.atlas-funnest-instrument-plot\s*>\s*\.atlas-funnest-axis-unit\s*\{([^}]+)\}/);
  assert.ok(rule, 'RSI mounts share the plot class, but not the instrument-workbench ancestor');
  assert.match(rule[1], /text-align:\s*right/);
  assert.match(rule[1], /width:\s*100%/);
  assert.match(rule[1], /box-sizing:\s*border-box/);
});


test('full-date axes reserve edge-anchor spacing while retaining narrow-chart ticks', async () => {
  const source = await readFile(new URL('../../apps/web/src/components/funnest-instrument-plot.tsx', import.meta.url), 'utf8');
  assert.match(plotSource, /const dateTickSpacing = chartWidth <= 500 \? 105 : 120/);
  assert.equal([...source.matchAll(/<XAxis minTickSpacing=\{dateTickSpacing\}/g)].length, 3, 'price candles, price line, and RSI share date-label spacing');
});
