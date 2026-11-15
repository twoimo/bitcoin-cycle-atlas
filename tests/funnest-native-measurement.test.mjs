import assert from 'node:assert/strict';
import test from 'node:test';
import { mountObservedPriceChart } from '../dist/funnest-observed-price-adapter.js';
import { sessionBars, withNativeRuntime } from './helpers/funnest-native-fixture.mjs';

const candles = sessionBars.map(bar => ({ time: bar.time / 1000, open: bar.open, high: bar.high, low: bar.low, close: bar.close, volume: 10, date: new Date(bar.time).toISOString().slice(0, 10) }));

async function withMeasureChart(run) {
  await withNativeRuntime(async ({ container, settle, PointerEvent }) => {
    const measured = [];
    const mounted = mountObservedPriceChart(container, { series: { candles }, symbol: 'MSTR', range: { start: candles[100].time, end: candles[200].time }, tool: 'measure', magnet: 'strong', onMeasure: value => measured.push(value), onViewport() {}, onError() {} });
    let coords = null;
    const probe = mounted.chart.addOverlay({ layer: 'above', render: frame => { coords = frame.coords; } });
    try {
      await settle(80);
      const layout = mounted.chart.layout, main = layout.panes.find(pane => pane.kind === 'main'), rect = mounted.host.getBoundingClientRect();
      const press = (x, paneY) => {
        const clientX = rect.left + x * rect.width / layout.width, clientY = rect.top + (main.top + paneY) * rect.height / layout.height;
        for (const type of ['pointerdown', 'pointerup']) mounted.host.dispatchEvent(new PointerEvent(type, { clientX, clientY, pointerId: 7, button: 0, buttons: type === 'pointerdown' ? 1 : 0 }));
        mounted.chart.render();
      };
      await run({ mounted, measured, coords: () => coords, layout, main, press });
    } finally { probe.remove(); mounted.destroy(); }
  });
}

test('plot clicks pass the runtime time-axis listeners and the receipt names the completed source-bar measurement it painted', async () => {
  await withMeasureChart(async ({ mounted, measured, coords, press }) => {
    const first = sessionBars[120], second = sessionBars[170];
    press(coords().timeToX(first.time), coords().priceToY(first.close));
    let painted = mounted.inspectAtlasInteractionRender().measurement;
    assert.equal(painted.pending, true, 'one anchor is a pending measurement');
    assert.equal(painted.start.time, first.time);
    press(coords().timeToX(second.time), coords().priceToY(second.high));
    assert.equal(measured.length, 2, 'both in-plot presses reached the adapter through the host capture listeners');
    painted = mounted.inspectAtlasInteractionRender().measurement;
    assert.equal(painted.pending, false);
    assert.deepEqual([painted.start.time, painted.end.time], [first.time, second.time], 'the painted anchors are the clicked source bars');
    assert.deepEqual([painted.start.date, painted.end.date], [candles[120].date, candles[170].date]);
    assert.deepEqual([painted.start.price, painted.start.field, painted.end.price, painted.end.field], [first.close, 'C', second.high, 'H'], 'strong magnet keeps genuine OHLC values');
    assert.deepEqual([painted.start.x, painted.end.x], [coords().timeToX(first.time), coords().timeToX(second.time)]);
    assert.match(painted.label, /^Δ 52\.00 \(/);
    assert.deepEqual(mounted.inspectAtlasInteractionRender().measurementSegments[0].from, { x: painted.start.x, y: painted.start.y });

    mounted.setAtlasInteraction({ measurement: null }); mounted.chart.render();
    assert.equal(mounted.inspectAtlasInteractionRender().measurement, null, 'a cleared measurement leaves no painted measurement');
  });
});

test('a press in the native time-axis band belongs to the runtime axis drag, never to a measurement anchor', async () => {
  await withMeasureChart(async ({ mounted, measured, coords, layout, main, press }) => {
    press(coords().timeToX(sessionBars[150].time), layout.panesHeight + 4 - main.top);
    assert.equal(measured.length, 0);
    assert.equal(mounted.inspectAtlasInteractionRender().measurement, null);
  });
});
