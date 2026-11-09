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
    addEventListener(kind: string, listener: (event: any) => void) { if (!listeners.has(kind)) listeners.set(kind, new Set()); listeners.get(kind)!.add(listener); },
    removeEventListener: (kind: string, listener: (event: any) => void) => listeners.get(kind)?.delete(listener),
    requestAnimationFrame(callback: FrameRequestCallback) { frames.set(++frameId, callback); return frameId; },
    cancelAnimationFrame: (id: number) => frames.delete(id),
  };
  Object.defineProperty(document, 'defaultView', { value: window, configurable: true });
  const globals = { document, window, location, Element: dom.Element, IS_REACT_ACT_ENVIRONMENT: true,
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
  Object.defineProperty(prototype, 'getBoundingClientRect', { configurable: true, value() { return { x: 0, y: 0, left: 0, top: 0, right: 900, bottom: 520, width: 900, height: 520 }; } });
  Object.defineProperty(prototype, 'focus', { configurable: true, value() {} });
  const { createRoot } = await import('react-dom/client');
  const root = createRoot(document.getElementById('root')!);
  const cleanup = async () => {
    await act(async () => root.unmount()); frames.clear();
    for (const [key, descriptor] of oldProperties) if (descriptor) Object.defineProperty(prototype, key, descriptor); else Reflect.deleteProperty(prototype, key);
    for (const [key, descriptor] of previous) if (descriptor) Object.defineProperty(globalThis, key, descriptor); else Reflect.deleteProperty(globalThis, key);
  };
  try { await act(async () => root.render(content)); } catch (error) { await cleanup(); throw error; }
  const svg = () => document.querySelector('.rsi-chart-canvas > svg') as unknown as SVGSVGElement;
  function pointer(type: string, x: number, y: number) {
    const event = new dom.Event(type, { bubbles: true, cancelable: true });
    for (const [key, value] of Object.entries({ clientX: x, clientY: y, pointerId: 1, pointerType: 'mouse', button: 0, buttons: type === 'pointerup' ? 0 : 1, isPrimary: true }))
      Object.defineProperty(event, key, { value });
    if (type === 'pointerdown') document.querySelector('.rsi-chart-canvas')!.dispatchEvent(event);
    else for (const listener of listeners.get(type) || []) listener(event);
  }
  return { document, posts, urlWrites, location, cleanup, svg, pointer,
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
  test(`${symbol} publishes the final native drag view and its revision atomically before the host consumes it`, async t => {
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
