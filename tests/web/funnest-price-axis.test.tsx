import React, { act, createRef } from 'react';
import test from 'node:test';
import assert from 'node:assert/strict';
import { parseHTML } from 'linkedom';
import { renderToStaticMarkup } from 'react-dom/server';
import type { Point } from '@atlas/contracts/market-lab';
import type { RsiBar } from '@atlas/domain/rsi-bars';
import { FunnestInstrumentPlot } from '../../apps/web/src/components/funnest-instrument-plot.js';
import { axisNumber } from '../../apps/web/src/components/rsi-chart-canvas.js';
import { initialChartView, type RsiChartView } from '../../apps/web/src/rsi-chart-model.js';

const day = (index: number) => new Date(Date.UTC(2026, 0, 1 + index)).toISOString().slice(0, 10);
const narrow: Point[] = Array.from({ length: 60 }, (_, index) => [day(index), 100 + index * 2]);
const wide: Point[] = Array.from({ length: 60 }, (_, index) => [day(index), Number((10 * 1.08 ** index).toFixed(4))]);
const bars: RsiBar[] = narrow.map(([date, close], index) => {
  const open = close + (index % 2 ? 3 : -3);
  return [date, open, Math.max(open, close) + 4, Math.min(open, close) - 4, close, 1000 + index];
});
const datasets = [
  { name: 'one decade', prices: narrow, domain: { min: 90, max: 230 } },
  { name: 'two decades', prices: wide, domain: { min: 8, max: 1200 } },
];
const axisModes = (['linear', 'log'] as const).flatMap(scale => [false, true].map(manual => ({ scale, manual })));

const props = (prices: Point[], candles: RsiBar[], view: RsiChartView) => ({
  symbol: 'TEST', unit: 'USD', prices, bars: candles, rows: [], view, active: true, hover: null,
  onPick() {}, onHover() {}, onView() {}, onStart() {}, onEnd() {}, chartHeight: 520, chartWidth: 900, svgRef: createRef<SVGSVGElement>(),
});
const viewFor = (prices: Point[], scale: RsiChartView['scale'], domain: RsiChartView['domain'], inverted: boolean, chartType: RsiChartView['chartType'] = 'line'): RsiChartView =>
  ({ ...initialChartView(prices), showRsi: false, scale, chartType, inverted, ...(domain ? { autoScale: false, domain } : {}) });
const render = (prices: Point[], candles: RsiBar[], view: RsiChartView) => renderToStaticMarkup(<FunnestInstrumentPlot {...props(prices, candles, view)}/>);

const linePoints = (html: string) => {
  const path = html.match(/<path d="(M[^"]+)"[^>]*style="stroke:var\(--data-gold\)"/)?.[1];
  assert(path, 'the observed price line is drawn');
  return path.split(/[ML]/).filter(Boolean).map(pair => { const [x, y] = pair.split(',').map(Number); return { x, y }; });
};
const priceTicks = (html: string) => new Map([...html.matchAll(/<text x="840" y="([^"]+)"[^>]*>([^<]+)<\/text>/g)].map(match => [match[2], Number(match[1])]));
const selectedPoint = (html: string) => Number(html.match(/<circle cx="[^"]+" cy="([^"]+)" r="4" stroke-width="2" style="fill:var\(--accent\)/)?.[1]);
const candleMarks = (html: string) => [...html.matchAll(/<line x1="[^"]+" x2="[^"]+" y1="([^"]+)" y2="([^"]+)" stroke-width="1" style="stroke:([^"]+)"><\/line><rect x="[^"]+" y="([^"]+)" width="[^"]+" height="([^"]+)"[^>]*style="fill:([^"]+)"/g)]
  .map(([, y1, y2, wickColor, top, height, bodyColor]) => ({
    wick: [Math.min(Number(y1), Number(y2)), Math.max(Number(y1), Number(y2))], body: [Number(top), Number(top) + Number(height)], wickColor, bodyColor,
  }));
const near = (actual: number, expected: number, message: string) => assert(Math.abs(actual - expected) < 0.02, `${message}: ${actual} vs ${expected}`);

/** An inverted axis is the same scale drawn upside down, so every price mirrors about the plot's horizontal centre line. */
function mirrorCentre(upright: string, inverted: string, label: string) {
  const before = priceTicks(upright), after = priceTicks(inverted);
  assert(before.size >= 2, `${label}: the upright axis draws price ticks`);
  assert.deepEqual([...after.keys()].sort(), [...before.keys()].sort(), `${label}: the inverted axis labels the same observed prices`);
  const [first] = before.keys(), centre = before.get(first)! + after.get(first)! - 8;
  for (const [text, y] of before) near(y + after.get(text)!, centre + 8, `${label}: tick ${text} mirrors`);
  return centre;
}

for (const { name, prices, domain } of datasets) for (const { scale, manual } of axisModes) {
  const label = `${name} ${scale} ${manual ? 'manual' : 'auto'} line`;
  test(`${label}: the inverted price axis puts the highest price lowest and mirrors every observed point`, () => {
    const upright = render(prices, [], viewFor(prices, scale, manual ? domain : null, false));
    const inverted = render(prices, [], viewFor(prices, scale, manual ? domain : null, true));
    const before = linePoints(upright), after = linePoints(inverted);
    assert.equal(after.length, prices.length, `${label}: every observation is drawn`);
    for (let index = 1; index < prices.length; index++) {
      assert(before[index].y < before[index - 1].y, `${label}: the upright axis draws a higher price higher`);
      assert(after[index].y > after[index - 1].y, `${label}: the inverted axis keeps the observed order with the highest price lowest`);
    }
    const centre = mirrorCentre(upright, inverted, label);
    before.forEach((point, index) => { assert.equal(after[index].x, point.x); near(point.y + after[index].y, centre, `${label}: ${prices[index][0]} mirrors`); });
    near(selectedPoint(upright) + selectedPoint(inverted), centre, `${label}: the selected observation mirrors`);
  });
}

for (const { scale, manual } of axisModes) {
  const label = `${scale} ${manual ? 'manual' : 'auto'} candles`;
  test(`${label}: inverted candles mirror their wicks and bodies and keep the observed direction colour`, () => {
    const upright = render(narrow, bars, viewFor(narrow, scale, manual ? { min: 85, max: 235 } : null, false, 'candles'));
    const inverted = render(narrow, bars, viewFor(narrow, scale, manual ? { min: 85, max: 235 } : null, true, 'candles'));
    const before = candleMarks(upright), after = candleMarks(inverted), centre = mirrorCentre(upright, inverted, label);
    assert.equal(after.length, bars.length, `${label}: every observed candle is drawn`);
    before.forEach((candle, index) => {
      const date = bars[index][0], up = bars[index][4] >= bars[index][1];
      assert.equal(after[index].bodyColor, `var(--chart-candle-${up ? 'up' : 'down'})`, `${label}: ${date} keeps its observed direction`);
      assert.equal(after[index].wickColor, candle.wickColor);
      near(after[index].wick[0], centre - candle.wick[1], `${label}: ${date} wick top mirrors`);
      near(after[index].wick[1], centre - candle.wick[0], `${label}: ${date} wick bottom mirrors`);
      near(after[index].body[0], centre - candle.body[1], `${label}: ${date} body top mirrors`);
      near(after[index].body[1], centre - candle.body[0], `${label}: ${date} body bottom mirrors`);
    });
    assert(after.at(-1)!.wick[1] > after[0].wick[1], `${label}: the highest candle sits lowest`);
  });
}

async function mount(element: React.ReactElement) {
  const { document, window: dom } = parseHTML('<html><body><div id="root"></div></body></html>');
  const globals = { document, window: dom, Element: dom.Element, IS_REACT_ACT_ENVIRONMENT: true };
  const previous = new Map(Object.keys(globals).map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  for (const [key, value] of Object.entries(globals)) Object.defineProperty(globalThis, key, { value, configurable: true });
  const { createRoot } = await import('react-dom/client');
  const root = createRoot(document.getElementById('root')!);
  await act(async () => root.render(element));
  return {
    document,
    key: (selector: string, key: string) => act(async () => { const event = new dom.Event('keydown', { bubbles: true, cancelable: true }); Object.defineProperty(event, 'key', { value: key }); document.querySelector(selector)!.dispatchEvent(event); }),
    cleanup: async () => {
      await act(async () => root.unmount());
      for (const [key, descriptor] of previous) if (descriptor) Object.defineProperty(globalThis, key, descriptor); else Reflect.deleteProperty(globalThis, key);
    },
  };
}

async function scrubbedText(element: React.ReactElement) {
  const fixture = await mount(element);
  try {
    await fixture.key('.atlas-funnest-instrument-plot svg', 'End');
    return { text: [...fixture.document.querySelectorAll('.atlas-funnest-instrument-plot svg text')].map(node => node.textContent ?? ''),
      spoken: fixture.document.querySelector('.atlas-sr-only')?.textContent };
  } finally { await fixture.cleanup(); }
}

for (const { scale, manual } of axisModes) test(`${scale} ${manual ? 'manual' : 'auto'}: the inverted scrubber and labels report observed prices`, async () => {
  const line = await scrubbedText(<FunnestInstrumentPlot {...props(narrow, [], viewFor(narrow, scale, manual ? { min: 90, max: 230 } : null, true))}/>);
  assert(line.text.includes(axisNumber(218)), `the scrubber shows the observed last close: ${line.text.join(' | ')}`);
  assert(line.text.every(text => !/^-|^0\.0/.test(text)), `no reflected coordinate is shown as a price: ${line.text.join(' | ')}`);
  assert.equal(line.spoken, `${day(59)} · ${axisNumber(218)} USD`);

  const candles = await scrubbedText(<FunnestInstrumentPlot {...props(narrow, bars, viewFor(narrow, scale, manual ? { min: 85, max: 235 } : null, true, 'candles'))}/>);
  const [, , high, low] = bars.at(-1)!;
  const range = candles.text.find(text => text.includes('\u2013'));
  assert(range, `the scrubber shows the observed candle range: ${candles.text.join(' | ')}`);
  assert.deepEqual(range.split('\u2013').map(part => part.trim()).sort(), [axisNumber(high), axisNumber(low)].sort(), 'the range holds the observed high and low');
});
