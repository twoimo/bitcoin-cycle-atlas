import React, { act, Profiler } from 'react';
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { parseHTML } from 'linkedom';
import { InstrumentWorkbench } from '../../apps/web/src/components/instrument-workbench.js';
import { RsiWorkbench } from '../../apps/web/src/panels/rsi-workbench.js';
import type { InstrumentSeries } from '../../apps/web/src/instrument-chart-model.js';
import { createChartWorkbenchControls } from '../../dist/rsi-workbench-controls.js';

const snapshot = JSON.parse(await readFile(new URL('../../dist/data/market-lab.json', import.meta.url), 'utf8'));

async function mount(content: React.ReactNode, publicUrl: string) {
  const { document, window: dom } = parseHTML('<html><body><div id="root"></div></body></html>');
  Object.defineProperty(document, 'oninput', { value: null, configurable: true });
  const listeners = new Map<string, Set<(event: any) => void>>(), frames = new Map<number, FrameRequestCallback>();
  const posts: any[] = [], urlWrites: string[] = [], location = new URL(publicUrl);
  let frameId = 0;
  const parent = { document, location, postMessage: (message: unknown) => posts.push(message) };
  const window = { document, location, parent, HTMLIFrameElement: dom.HTMLIFrameElement,
    CustomEvent: dom.CustomEvent, Event: dom.Event,
    addEventListener(kind: string, listener: (event: any) => void) { if (!listeners.has(kind)) listeners.set(kind, new Set()); listeners.get(kind)!.add(listener); },
    removeEventListener: (kind: string, listener: (event: any) => void) => listeners.get(kind)?.delete(listener),
    requestAnimationFrame(callback: FrameRequestCallback) { frames.set(++frameId, callback); return frameId; },
    cancelAnimationFrame: (id: number) => frames.delete(id),
  };
  Object.defineProperty(document, 'defaultView', { value: window, configurable: true });
  const globals = { document, window, location, Element: dom.Element, CustomEvent: dom.CustomEvent, Event: dom.Event, IS_REACT_ACT_ENVIRONMENT: true,
    history: { state: { retained: true }, replaceState(state: unknown, _title: string, url: string) {
      assert.deepEqual(state, { retained: true }); urlWrites.push(url); location.href = new URL(url, location.href).href;
    } },
  };
  const previous = new Map(Object.keys(globals).map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  for (const [key, value] of Object.entries(globals)) Object.defineProperty(globalThis, key, { value, configurable: true });
  const prototype = dom.Element.prototype;
  const oldProperties = new Map(['clientWidth', 'clientHeight', 'getBoundingClientRect', 'focus'].map(key => [key, Object.getOwnPropertyDescriptor(prototype, key)]));
  for (const [key, value] of [['clientWidth', 900], ['clientHeight', 520]] as const)
    Object.defineProperty(prototype, key, { configurable: true, get() { return value; } });
  Object.defineProperty(prototype, 'getBoundingClientRect', { configurable: true, value(this: Element) {
    const width = Number(this.getAttribute('width')) || 900, height = Number(this.getAttribute('height')) || 520;
    return { x: 0, y: 0, left: 0, top: 0, right: width, bottom: height, width, height };
  } });
  Object.defineProperty(prototype, 'focus', { configurable: true, value() {} });
  const { createRoot } = await import('react-dom/client');
  const root = createRoot(document.getElementById('root')!);
  const cleanup = async () => {
    await act(async () => root.unmount()); frames.clear();
    for (const [key, descriptor] of oldProperties) if (descriptor) Object.defineProperty(prototype, key, descriptor); else Reflect.deleteProperty(prototype, key);
    for (const [key, descriptor] of previous) if (descriptor) Object.defineProperty(globalThis, key, descriptor); else Reflect.deleteProperty(globalThis, key);
  };
  try { await act(async () => root.render(content)); } catch (error) { await cleanup(); throw error; }
  const svg = () => document.querySelector('.rsi-chart-canvas svg') as unknown as SVGSVGElement;
  async function wheel(deltaY: number, x: number, y = 180, target = '.atlas-funnest-instrument-plot', modifiers: { ctrlKey?: boolean } = {}) { const node=document.querySelector(target)!; const event=new dom.Event('wheel',{bubbles:true,cancelable:true}); for(const [key,value] of Object.entries({deltaY,deltaX:0,deltaMode:0,clientX:x,clientY:y,ctrlKey:false,shiftKey:false,...modifiers})) Object.defineProperty(event,key,{value}); await act(async()=>node.dispatchEvent(event)); }
  function pointer(type: string, x: number, y: number, input: { pointerId?: number; pointerType?: string; isPrimary?: boolean } = {}) {
    const event = new dom.Event(type, { bubbles: true, cancelable: true });
    for (const [key, value] of Object.entries({ clientX: x, clientY: y, pointerId: 1, pointerType: 'mouse', button: 0, buttons: type === 'pointerup' ? 0 : 1, isPrimary: true, ...input }))
      Object.defineProperty(event, key, { value });
    if (type === 'pointerdown') svg().dispatchEvent(event);
    else for (const listener of listeners.get(type) || []) listener(event);
  }
  async function hover(x: number, y: number) {
    const event = new dom.Event('pointermove', { bubbles: true, cancelable: true });
    for (const [key, value] of Object.entries({ clientX: x, clientY: y, pointerId: 1, pointerType: 'mouse', buttons: 0, isPrimary: true })) Object.defineProperty(event, key, { value });
    await act(async () => svg().dispatchEvent(event));
  }
  async function press(key: string, modifiers: { shiftKey?: boolean; ctrlKey?: boolean; metaKey?: boolean; altKey?: boolean } = {}) {
    const event = new dom.Event('keydown', { bubbles: true, cancelable: true });
    for (const [name, value] of Object.entries({ key, code: '', shiftKey: false, ctrlKey: false, metaKey: false, altKey: false, ...modifiers })) Object.defineProperty(event, name, { value });
    await act(async () => svg().dispatchEvent(event));
  }
  async function doubleClick(x: number, y: number) {
    for (const type of ['click', 'click', 'dblclick']) {
      const event = new dom.Event(type, { bubbles: true, cancelable: true });
      for (const [key, value] of Object.entries({ clientX: x, clientY: y, button: 0, detail: type === 'dblclick' ? 2 : 1 })) Object.defineProperty(event, key, { value });
      await act(async () => svg().dispatchEvent(event));
    }
  }
  return { document, posts, urlWrites, location, cleanup, svg, pointer, hover, press, wheel, doubleClick,
    flushFrame() { const pending = [...frames.values()]; frames.clear(); for (const callback of pending) callback(0); },
    message: (message: unknown) => act(async () => { for (const listener of listeners.get('message') || []) listener({ data: message, origin: location.origin, source: parent }); }),
  };
}

// These prices only exercise view lifecycle and source capabilities.
const daily: InstrumentSeries = {
  frequency: 'daily', bars: [], volumes: [],
  prices: [['2025-01-01', 100], ['2026-01-01', 110], ['2026-12-31', 120]],
  timeline: ['2025-01-01', '2026-01-01', '2026-12-31'],
};
const monthly: InstrumentSeries = {
  frequency: 'monthly', bars: [], volumes: [],
  prices: [['2010-01-01', 100], ['2020-01-01', 110], ['2026-09-01', 120]],
  timeline: ['2010-01-01', '2020-01-01', '2026-09-01'],
};

for (const symbol of ['TQQQ', 'HYPE', 'HOUSING-BUSAN']) {
  test(`${symbol} Funnest zoom publishes the changed range and one undoable user revision`, async t => {
    const frequency = symbol === 'HOUSING-BUSAN' ? 'monthly' : 'daily';
    const start = symbol === 'HYPE' ? '2026-01-01' : symbol === 'TQQQ' ? '2022-01-01' : '2020-01-01';
    const end = symbol === 'HYPE' ? '2026-04-01' : '2024-01-01';
    const publicUrl = `https://example.test/market-lab/charts/?symbol=${symbol}&region=busan&granularity=${frequency}&type=line&axis=linear&view-start=${start}&view-end=${end}#price`;
    const market = snapshot.markets.find((entry: { symbol: string }) => entry.symbol === 'TQQQ');
    const content = symbol === 'TQQQ'
      ? <RsiWorkbench symbol={symbol} market={market} snapshot={snapshot} now={new Date(snapshot.generatedAt)} rows={[]} epoch={7} active embedded onDate={() => {}} comparison={null} references={null}/>
      : <InstrumentWorkbench symbol={symbol} unit={symbol === 'HYPE' ? 'USDC' : '지수'} timezone={symbol === 'HYPE' ? 'UTC' : 'Asia/Seoul'} series={symbol === 'HYPE' ? daily : monthly} epoch={7} active embedded volumeUnit={symbol === 'HYPE' ? 'HYPE' : '건'} description="View lifecycle fixture"/>;
    const fixture = await mount(content, publicUrl);
    const adapter = createChartWorkbenchControls({ send: () => {}, isActive: () => true });
    t.after(async () => { try { adapter.destroy(); } finally { await fixture.cleanup(); } });
    adapter.begin(symbol, 7);
    assert.equal(fixture.urlWrites.length, 0);
    const range = () => ({ start: fixture.svg().dataset.start!, end: fixture.svg().dataset.end! });
    const initial = range();
    await fixture.wheel(-120, 450);
    const final = range();
    assert.notDeepEqual(final, initial, 'Funnest wheel zoom updates the visible UTC range');
    const states = fixture.posts.filter(message => message.symbol === symbol && message.epoch === 7);
    assert.equal(states.at(-1).userViewRevision, 1, 'one zoom is one user edit');
    assert.deepEqual({ start: states.at(-1).start, end: states.at(-1).end }, final);
    for (const message of states) assert.equal(adapter.update(message), true);
    const query = new URLSearchParams(fixture.location.search);
    assert.equal(query.get('view-start'), final.start); assert.equal(query.get('view-end'), final.end);
    assert.equal(query.get('region'), 'busan'); assert.equal(fixture.location.hash, '#price');
    const writes = fixture.urlWrites.length;
    assert.equal(adapter.update(states.at(-1)), true); assert.equal(fixture.urlWrites.length, writes, 'same-revision deduplication remains active');
    await fixture.message({ kind: 'atlas:center-command', symbol, epoch: 7, action: 'undo' });
    assert.deepEqual(range(), initial, 'one undo restores the complete pre-zoom range');
    await fixture.message({ kind: 'atlas:center-command', symbol, epoch: 7, action: 'redo' });
    assert.deepEqual(range(), final, 'redo restores the committed range');
  });

  test(`${symbol} time-axis drag publishes the final view and its revision atomically before the host consumes it`, async t => {
    const frequency = symbol === 'HOUSING-BUSAN' ? 'monthly' : 'daily';
    // The ETF starts below its existing pixel-spacing limit so both native
    // drag positions can produce different ranges without altering that limit.
    const start = symbol === 'HYPE' ? '2026-01-01' : symbol === 'TQQQ' ? '2022-01-01' : '2020-01-01';
    const end = symbol === 'HYPE' ? '2026-04-01' : '2024-01-01';
    const publicUrl = `https://example.test/market-lab/charts/?symbol=${symbol}&region=busan&granularity=${frequency}&type=line&axis=linear&view-start=${start}&view-end=${end}#price`;
    const market = snapshot.markets.find((entry: { symbol: string }) => entry.symbol === 'TQQQ');
    const content = symbol === 'TQQQ'
      ? <RsiWorkbench symbol={symbol} market={market} snapshot={snapshot} now={new Date(snapshot.generatedAt)} rows={[]} epoch={7} active embedded onDate={() => {}} comparison={null} references={null}/>
      : <InstrumentWorkbench symbol={symbol} unit={symbol === 'HYPE' ? 'USDC' : '지수'} timezone={symbol === 'HYPE' ? 'UTC' : 'Asia/Seoul'} series={symbol === 'HYPE' ? daily : monthly} epoch={7} active embedded volumeUnit={symbol === 'HYPE' ? 'HYPE' : '건'} description="View lifecycle fixture"/>;
    let onCommit = () => {};
    const fixture = await mount(<Profiler id={symbol} onRender={() => onCommit()}>{content}</Profiler>, publicUrl);
    const adapter = createChartWorkbenchControls({ send: () => {}, isActive: () => true });
    t.after(async () => { try { adapter.destroy(); } finally { await fixture.cleanup(); } });
    adapter.begin(symbol, 7);
    assert.equal(fixture.urlWrites.length, 0);
    const range = () => ({ start: fixture.svg().dataset.start!, end: fixture.svg().dataset.end! });
    const initial = range(), y = Number(fixture.svg().dataset.timeAxisTop) + 14;
    let intermediate: ReturnType<typeof range> | null = null;

    // Profiler runs in the commit phase, after the intermediate SVG is painted
    // into the DOM but before its parent's pending passive publication effect.
    // The final native pointerup flushes a different range and ends the same
    // gesture here, deterministically exercising that publication ordering.
    onCommit = () => {
      if (range().start === initial.start && range().end === initial.end) return;
      intermediate = range(); onCommit = () => {};
      fixture.pointer('pointerup', 460, y);
    };
    await act(async () => {
      fixture.pointer('pointerdown', 300, y);
      fixture.pointer('pointermove', 350, y);
      fixture.flushFrame();
    });
    const final = range();
    assert(intermediate, 'the intermediate render must commit before final pointerup');
    assert.notDeepEqual(final, intermediate, 'the final pointer position must produce a distinct displayed range');
    const states = fixture.posts.filter(message => message.symbol === symbol && message.epoch === 7);
    assert.equal(states.at(-1).userViewRevision, 1, 'one drag is one user edit');
    assert.deepEqual({ start: states.at(-1).start, end: states.at(-1).end }, final);
    for (const message of states) assert.equal(adapter.update(message), true);
    const query = new URLSearchParams(fixture.location.search);
    assert.equal(query.get('view-start'), final.start, 'an intermediate view must not consume the final revision');
    assert.equal(query.get('view-end'), final.end, 'the host URL must retain the final SVG range');
    assert.equal(query.get('region'), 'busan'); assert.equal(fixture.location.hash, '#price');
    const writes = fixture.urlWrites.length;
    assert.equal(adapter.update(states.at(-1)), true); assert.equal(fixture.urlWrites.length, writes, 'same-revision deduplication remains active');

    await fixture.message({ kind: 'atlas:center-command', symbol, epoch: 7, action: 'undo' });
    assert.deepEqual(range(), initial, 'one undo restores the complete pre-gesture range');
    await fixture.message({ kind: 'atlas:center-command', symbol, epoch: 7, action: 'redo' });
    assert.deepEqual(range(), final, 'redo restores the committed final range');
  });
}

const observedDays = Array.from({ length: 120 }, (_, index) => new Date(Date.UTC(2026, 0, 1 + index)).toISOString().slice(0, 10));
const observed: InstrumentSeries = {
  frequency: 'daily', bars: [], volumes: [], timeline: observedDays,
  prices: observedDays.map((date, index) => [date, 100 + index]),
};
const visibleSpan = (start: string, end: string) => {
  const values = observed.prices.filter(([date]) => date >= start && date <= end).map(([, value]) => value);
  return Math.max(...values) - Math.min(...values);
};

async function hostedChart(t: { after: (fn: () => Promise<void>) => void }, query: string, symbol: 'HYPE' | 'TQQQ' = 'HYPE') {
  const market = snapshot.markets.find((entry: { symbol: string }) => entry.symbol === 'TQQQ');
  const fixture = symbol === 'HYPE'
    ? await mount(<InstrumentWorkbench symbol="HYPE" unit="USDC" timezone="UTC" series={observed} epoch={7} active embedded volumeUnit="HYPE" description="Gesture fixture"/>,
      `https://example.test/market-lab/charts/?symbol=HYPE&granularity=daily&type=line&axis=linear&view-start=2026-02-01&view-end=2026-03-15${query}`)
    : await mount(<RsiWorkbench symbol="TQQQ" market={market} snapshot={snapshot} now={new Date(snapshot.generatedAt)} rows={[]} epoch={7} active embedded onDate={() => {}} comparison={null} references={null}/>,
      `https://example.test/market-lab/charts/?symbol=TQQQ&granularity=daily&type=line&axis=linear&view-start=2022-01-03&view-end=2024-01-02${query}`);
  t.after(fixture.cleanup);
  const svg = fixture.svg(), box = (key: string) => Number(svg.dataset[key]);
  const width = Number(svg.getAttribute('width')), height = Number(svg.getAttribute('height'));
  const state = () => fixture.posts.filter(message => /^atlas:(chart|rsi)-state$/.test(message.kind) && message.symbol === symbol).at(-1);
  return { fixture, state, range: () => ({ start: fixture.svg().dataset.start!, end: fixture.svg().dataset.end! }),
    full: () => ({ start: state().first, end: state().last }),
    priceAxis: { x: (box('plotRight') + width) / 2, y: (box('plotTop') + box('plotBottom')) / 2, height: box('plotBottom') - box('plotTop') },
    timeAxis: { x: (box('plotLeft') + box('plotRight')) / 2, y: (box('plotBottom') + height) / 2 },
    plot: { x: (box('plotLeft') + box('plotRight')) / 2, y: (box('plotTop') + box('plotBottom')) / 2, left: box('plotLeft'), width: box('plotRight') - box('plotLeft') } };
}
const observedChart = (t: { after: (fn: () => Promise<void>) => void }, query: string) => hostedChart(t, query);
const command = (fixture: Awaited<ReturnType<typeof mount>>, action: string, symbol = 'HYPE') => fixture.message({ kind: 'atlas:center-command', symbol, epoch: 7, action });
const utcDay = (date: string) => Date.parse(`${date}T00:00:00Z`) / 86400000;
const daySpan = (range: { start: string; end: string }) => utcDay(range.end) - utcDay(range.start);
const manualPrice = (symbol: 'HYPE' | 'TQQQ') => symbol === 'HYPE' ? '&price-min=105&price-max=180' : '&price-min=20&price-max=60';

test('price-axis drag scales only the price domain as one undoable edit', async t => {
  const chart = await observedChart(t, '');
  const before = chart.range();
  assert.equal(chart.fixture.svg().dataset.priceMode, 'auto');
  await act(async () => {
    chart.fixture.pointer('pointerdown', chart.priceAxis.x, chart.priceAxis.y);
    chart.fixture.pointer('pointermove', chart.priceAxis.x, chart.priceAxis.y - chart.priceAxis.height / 4);
    chart.fixture.pointer('pointerup', chart.priceAxis.x, chart.priceAxis.y - chart.priceAxis.height / 2);
  });
  const domain = chart.state().urlView.domain;
  assert.equal(chart.fixture.svg().dataset.priceMode, 'manual', 'dragging the price axis fixes a manual price range');
  assert(domain && domain.max - domain.min < visibleSpan(before.start, before.end), `dragging up zooms the price axis in: ${JSON.stringify(domain)}`);
  assert.deepEqual(chart.range(), before, 'a price-axis drag leaves the dates alone');
  assert.equal(chart.state().userViewRevision, 1, 'one drag is one user edit');
  await command(chart.fixture, 'undo');
  assert.equal(chart.fixture.svg().dataset.priceMode, 'auto', 'one undo restores the automatic price range');
});

test('price-axis wheel scales only the price domain', async t => {
  const chart = await observedChart(t, '');
  const before = chart.range();
  await chart.fixture.wheel(-600, chart.priceAxis.x, chart.priceAxis.y, '.rsi-chart-canvas svg');
  const domain = chart.state().urlView.domain;
  assert.equal(chart.fixture.svg().dataset.priceMode, 'manual', 'the price-axis wheel fixes a manual price range');
  assert(domain && domain.max - domain.min < visibleSpan(before.start, before.end), `wheeling up zooms the price axis in: ${JSON.stringify(domain)}`);
  assert.deepEqual(chart.range(), before, 'the price-axis wheel leaves the dates alone');
  assert.equal(chart.state().userViewRevision, 1);
});

test('price-axis double-click restores only the automatic price range', async t => {
  const chart = await observedChart(t, '&price-min=105&price-max=180');
  const before = chart.range(), selected = chart.state().selected;
  assert.equal(chart.fixture.svg().dataset.priceMode, 'manual');
  await chart.fixture.doubleClick(chart.priceAxis.x, chart.priceAxis.y);
  assert.equal(chart.fixture.svg().dataset.priceMode, 'auto', 'double-clicking the price axis restores Auto');
  assert.equal(chart.state().urlView.domain, null);
  assert.deepEqual(chart.range(), before, 'the dates stay where they were');
  assert.equal(chart.state().selected, selected, 'clicks on the price axis do not pick a date');
  assert.equal(chart.state().userViewRevision, 1, 'the double-click is one user edit');
  await command(chart.fixture, 'undo');
  assert.equal(chart.fixture.svg().dataset.priceMode, 'manual', 'one undo restores the manual range');
});

for (const surface of ['plot', 'timeAxis'] as const) test(`${surface === 'plot' ? 'plot' : 'time-axis'} double-click restores the full range and the automatic price range`, async t => {
  const chart = await observedChart(t, '&price-min=105&price-max=180');
  await chart.fixture.doubleClick(chart[surface].x, chart[surface].y);
  assert.deepEqual(chart.range(), { start: observedDays[0], end: observedDays.at(-1) }, 'the full observed range is shown');
  assert.equal(chart.fixture.svg().dataset.priceMode, 'auto');
  assert.equal(chart.state().userViewRevision, 1, 'the double-click is one user edit');
});


for (const symbol of ['TQQQ', 'HYPE'] as const) {
  test(`${symbol} 0 restores the full range and the automatic price range`, async t => {
    const chart = await hostedChart(t, manualPrice(symbol), symbol);
    assert.equal(chart.fixture.svg().dataset.priceMode, 'manual');
    await chart.fixture.press('0');
    assert.deepEqual(chart.range(), chart.full(), '0 shows the full observed range');
    assert.equal(chart.fixture.svg().dataset.priceMode, 'auto', '0 restores price Auto');
    assert.equal(chart.state().userViewRevision, 1, 'the key is one user edit');
  });

  test(`${symbol} + and = zoom in about the last pointer position and - zooms out`, async t => {
    const chart = await hostedChart(t, '', symbol);
    const before = chart.range(), anchor = utcDay(before.start) + daySpan(before) * .25;
    await chart.fixture.hover(chart.plot.left + chart.plot.width * .25, chart.plot.y);
    await chart.fixture.press('+');
    const zoomed = chart.range();
    assert(Math.abs((daySpan(zoomed) + 1) - (daySpan(before) + 1) * .8) <= 1, `+ shows 80% of the days: ${JSON.stringify({ before, zoomed })}`);
    assert(Math.abs(anchor - (utcDay(zoomed.start) + daySpan(zoomed) * .25)) <= 1, `the date under the pointer stays under it: ${JSON.stringify({ before, zoomed })}`);
    await chart.fixture.press('=');
    const again = chart.range();
    assert(Math.abs((daySpan(again) + 1) - (daySpan(zoomed) + 1) * .8) <= 1, '= zooms in like +');
    await chart.fixture.press('-');
    assert(Math.abs((daySpan(chart.range()) + 1) - (daySpan(again) + 1) * 1.25) <= 1, '- shows 125% of the days');
    assert.equal(chart.state().userViewRevision, 3, 'each key is one user edit');
  });

  test(`${symbol} Ctrl+Up and Ctrl+Down zoom, Ctrl+Left and Ctrl+Right pan a quarter window`, async t => {
    const chart = await hostedChart(t, '', symbol);
    const before = chart.range();
    await chart.fixture.press('ArrowUp', { ctrlKey: true });
    const zoomed = chart.range();
    assert(Math.abs((daySpan(zoomed) + 1) - (daySpan(before) + 1) * .8) <= 1, `Ctrl+Up zooms in: ${JSON.stringify({ before, zoomed })}`);
    await chart.fixture.press('ArrowDown', { metaKey: true });
    const out = chart.range();
    assert(daySpan(out) > daySpan(zoomed), 'Cmd+Down zooms out');
    await chart.fixture.press('ArrowLeft', { ctrlKey: true });
    const left = chart.range();
    assert(Math.abs(utcDay(left.start) - (utcDay(out.start) - Math.round(daySpan(out) / 4))) <= 1, `Ctrl+Left pans a quarter window back: ${JSON.stringify({ out, left })}`);
    assert.equal(daySpan(left), daySpan(out), 'panning keeps the span');
    await chart.fixture.press('ArrowRight', { ctrlKey: true });
    assert.deepEqual(chart.range(), out, 'Ctrl+Right pans the same quarter forward');
  });

  test(`${symbol} the context-menu key and Shift+F10 open the chart menu`, async t => {
    const chart = await hostedChart(t, '', symbol);
    assert.equal(chart.fixture.document.querySelector('.atlas-funnest-context-menu'), null);
    await chart.fixture.press('ContextMenu');
    assert(chart.fixture.document.querySelector('.atlas-funnest-context-menu'), 'the context-menu key opens the chart menu');
    await chart.fixture.press('Escape');
    assert.equal(chart.fixture.document.querySelector('.atlas-funnest-context-menu'), null);
    await chart.fixture.press('F10', { shiftKey: true });
    assert(chart.fixture.document.querySelector('.atlas-funnest-context-menu'), 'Shift+F10 opens the chart menu');
  });
}

test('TQQQ Alt+R restores the full range and the automatic price range', async t => {
  const chart = await hostedChart(t, manualPrice('TQQQ'), 'TQQQ');
  await chart.fixture.press('r', { altKey: true });
  assert.deepEqual(chart.range(), chart.full());
  assert.equal(chart.fixture.svg().dataset.priceMode, 'auto');
  assert.equal(chart.state().userViewRevision, 1);
});

test('TQQQ Shift+Left and Shift+Right pan a quarter window without moving the selection', async t => {
  const chart = await hostedChart(t, '', 'TQQQ');
  await chart.fixture.message({ kind: 'atlas:center-command', symbol: 'TQQQ', epoch: 7, action: 'date', value: '2023-01-03' });
  const before = chart.range(), selected = chart.state().selected, revision = chart.state().userViewRevision;
  assert.equal(selected, '2023-01-03');
  await chart.fixture.press('ArrowLeft', { shiftKey: true });
  const left = chart.range();
  assert(Math.abs(utcDay(left.start) - (utcDay(before.start) - Math.round(daySpan(before) / 4))) <= 1, `Shift+Left pans a quarter window back: ${JSON.stringify({ before, left })}`);
  assert.equal(daySpan(left), daySpan(before));
  await chart.fixture.press('ArrowRight', { shiftKey: true });
  assert.deepEqual(chart.range(), before, 'Shift+Right pans the same quarter forward');
  assert.equal(chart.state().selected, selected, 'panning does not pick another date');
  assert.equal(chart.state().userViewRevision, revision + 2, 'each key is one user edit');
});

test('Escape stops a price-axis drag where it is', async t => {
  const chart = await hostedChart(t, '');
  await act(async () => {
    chart.fixture.pointer('pointerdown', chart.priceAxis.x, chart.priceAxis.y);
    chart.fixture.pointer('pointermove', chart.priceAxis.x, chart.priceAxis.y - chart.priceAxis.height / 4);
  });
  await chart.fixture.press('Escape');
  const stopped = chart.state().urlView.domain;
  assert(stopped, 'the drag had scaled the price axis before Escape');
  await act(async () => { chart.fixture.pointer('pointermove', chart.priceAxis.x, chart.priceAxis.y - chart.priceAxis.height / 2); chart.fixture.pointer('pointerup', chart.priceAxis.x, chart.priceAxis.y - chart.priceAxis.height / 2); });
  assert.deepEqual(chart.state().urlView.domain, stopped, 'pointer movement after Escape changes nothing');
  assert.equal(chart.state().userViewRevision, 1, 'the stopped drag is one user edit');
});

for (const tool of ['crosshair', 'pan'] as const) test(`two-finger pinch with the ${tool} tool zooms the dates about the pinch centre as one undoable edit`, async t => {
  const chart = await hostedChart(t, '');
  if (tool === 'pan') await chart.fixture.message({ kind: 'atlas:center-command', symbol: 'HYPE', epoch: 7, action: 'tool', value: 'pan' });
  const before = chart.range(), revision = chart.state().userViewRevision, y = chart.plot.y;
  const x = (fraction: number) => chart.plot.left + chart.plot.width * fraction;
  const touch = (pointerId: number) => ({ pointerId, pointerType: 'touch', isPrimary: pointerId === 1 });
  await act(async () => {
    chart.fixture.pointer('pointerdown', x(.4), y, touch(1));
    chart.fixture.pointer('pointerdown', x(.6), y, touch(2));
    chart.fixture.pointer('pointermove', x(.3), y, touch(1));
    chart.fixture.pointer('pointermove', x(.7), y, touch(2));
    chart.fixture.pointer('pointerup', x(.7), y, touch(2));
  });
  const zoomed = chart.range(), centre = utcDay(before.start) + daySpan(before) / 2;
  assert(Math.abs((daySpan(zoomed) + 1) - (daySpan(before) + 1) / 2) <= 1, `spreading two fingers to twice their distance shows half the days: ${JSON.stringify({ before, zoomed })}`);
  assert(Math.abs(centre - (utcDay(zoomed.start) + daySpan(zoomed) / 2)) <= 1, `the date under the pinch centre stays under it: ${JSON.stringify({ before, zoomed })}`);
  await act(async () => { chart.fixture.pointer('pointermove', x(.1), y, touch(1)); chart.fixture.pointer('pointerup', x(.1), y, touch(1)); });
  assert.deepEqual(chart.range(), zoomed, 'the finger left after a pinch does not pan');
  assert.equal(chart.state().userViewRevision, revision + 1, 'the pinch is one user edit');
  await command(chart.fixture, 'undo');
  assert.deepEqual(chart.range(), before, 'one undo restores the range before the pinch');
});

for (const symbol of ['TQQQ', 'HYPE'] as const) for (const ctrlKey of [false, true]) test(`${symbol} ${ctrlKey ? 'Ctrl+wheel' : 'wheel'} zoom keeps the date under the pointer`, async t => {
  const chart = await hostedChart(t, '', symbol);
  const before = chart.range(), fraction = .9, pointed = utcDay(before.start) + daySpan(before) * fraction;
  await chart.fixture.wheel(-120, chart.plot.left + chart.plot.width * fraction, chart.plot.y, '.rsi-chart-canvas svg', { ctrlKey });
  const zoomed = chart.range();
  assert(daySpan(zoomed) < daySpan(before), `the wheel zooms in: ${JSON.stringify({ before, zoomed })}`);
  assert(Math.abs(pointed - (utcDay(zoomed.start) + daySpan(zoomed) * fraction)) <= 1, `the date under the pointer stays under it: ${JSON.stringify({ before, zoomed })}`);
});

const chartHelp = [
  ['휠 / Ctrl + 휠', '가리킨 날짜를 유지하며 확대·축소'],
  ['+ / −', '시간 구간 확대 / 축소'],
  ['두 손가락 벌리기 / 모으기', '시간 구간 확대 / 축소'],
  ['이동 도구(H) 드래그', '날짜 위치 이동'],
  ['가격축 드래그 / 휠', '가격 눈금 조절'],
  ['가격축 두 번 클릭', '가격 자동 맞춤'],
  ['시간축 드래그', '표시 기간 조절'],
  ['C / H / M', '십자선 / 이동 / 두 점 측정'],
  ['← / →', '이전 / 다음 관측'],
  ['Shift + ← / →', '이전 / 다음 구간'],
  ['0 / Alt+R / 두 번 클릭', '전체 범위'],
  ['Alt+G / Alt+M', '날짜 이동 / 자석'],
  ['Ctrl/⌘ Z', '실행 취소'],
  ['Shift Ctrl/⌘ Z', '다시 실행'],
];
for (const symbol of ['TQQQ', 'HYPE'] as const) test(`${symbol} help lists the inputs the hosted chart handles`, async t => {
  const chart = await hostedChart(t, '', symbol);
  await chart.fixture.message({ kind: 'atlas:center-command', symbol, epoch: 7, action: 'pane', value: 'help' });
  const list = chart.fixture.document.querySelector('.rsi-workbench-panel .rsi-data-list');
  assert(list, 'the help pane is open');
  const rendered = [...list.querySelectorAll('dt')].map(term => [term.textContent, term.nextElementSibling?.textContent]);
  assert.deepEqual(rendered, chartHelp, 'each help line describes an input the chart handles, as the tests above check');
});

for (const symbol of ['TQQQ', 'HYPE'] as const) for (const pointed of [false, true]) test(`${symbol} + and - keep the right edge ${pointed ? 'after the pointer crossed the plot' : 'with no pointer over the plot'}`, async t => {
  const chart = await hostedChart(t, '', symbol);
  if (pointed) await chart.fixture.hover(chart.plot.left + chart.plot.width * .25, chart.plot.y);
  const before = chart.range();
  await chart.fixture.press('+');
  const zoomed = chart.range();
  assert.equal(zoomed.end, before.end, `+ keeps the right edge: ${JSON.stringify({ before, zoomed })}`);
  assert(zoomed.start > before.start, `+ narrows the range from the left: ${JSON.stringify({ before, zoomed })}`);
  await chart.fixture.press('-');
  const widened = chart.range();
  assert.equal(widened.end, before.end, `- keeps the right edge: ${JSON.stringify({ zoomed, widened })}`);
  assert(widened.start < zoomed.start, `- widens the range to the left: ${JSON.stringify({ zoomed, widened })}`);
});
