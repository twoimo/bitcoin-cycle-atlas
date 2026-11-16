import test from 'node:test';
import assert from 'node:assert/strict';
import { mountAtlasFunnestChart } from '../src/charts/funnest-chart-runtime.js';
import { funnestTimeAxis, pointerAnchorDrift } from '../scripts/verify-chart-zoom-browser.mjs';
import { sessionBars, sessionDay, withNativeRuntime } from './helpers/funnest-native-fixture.mjs';

const times = sessionBars.map(bar => bar.time);
const range = { from: sessionBars[40].time, to: sessionBars.at(-1).time + 90 * sessionDay };

async function withEngine(run) {
  await withNativeRuntime(async ({ container, settle }) => {
    const mounted = mountAtlasFunnestChart(container, { bars: sessionBars, symbol: 'MSTR', range, volume: false });
    let coords = null;
    const overlay = mounted.addOverlay({ layer: 'above', render: frame => { coords = frame.coords; } });
    try {
      await settle(80);
      const state = () => { const visible = mounted.chart.getVisibleTimeRange(); return { first: visible.from, last: visible.to, intervalMs: sessionDay, plot: { left: 0, right: mounted.chart.layout.plotWidth } }; };
      await run({ mounted, settle, state, coords: () => coords });
    } finally { overlay?.remove?.(); mounted.destroy(); }
  });
}

test('the verifier time axis places every date where the pinned Funnest engine draws it', async () => {
  await withEngine(async ({ state, coords }) => {
    const axis = funnestTimeAxis(times), visible = state(), from = axis.indexOf(visible.first), to = axis.indexOf(visible.last);
    const friday = sessionBars[104].time, samples = [sessionBars[60].time, friday, friday + sessionDay, friday + 2.5 * sessionDay, times.at(-1), times.at(-1) + 30.25 * sessionDay];
    assert.equal(sessionBars[105].time - friday, 3 * sessionDay, 'the sample set crosses a real weekend gap');
    for (const time of samples) {
      const engineX = coords().timeToX(time), verifierX = (axis.indexOf(time) - from) / (to - from) * visible.plot.right;
      assert.ok(Math.abs(engineX - verifierX) < 1e-6, `x of ${new Date(time).toISOString()}: engine ${engineX}, verifier ${verifierX}`);
      assert.ok(Math.abs(axis.timeOf(axis.indexOf(time)) - time) < 1e-3, 'index and time are inverse on the bar-indexed axis');
    }
    assert.equal(axis.interval, sessionDay, 'weekday sessions give a one-day bar interval, so the gutter advances one calendar day per bar slot');
  });
});

test('an exact engine zoom keeps the pointer date, where a straight line between the edge dates reports weeks of drift', async () => {
  await withEngine(async ({ mounted, settle, state }) => {
    const axis = funnestTimeAxis(times), before = state(), pointerX = before.plot.right * .3;
    const anchored = mounted.chart.timeScale.xToIndexFloat(pointerX);
    mounted.chart.timeScale.zoom(pointerX, Math.exp(.24)); mounted.chart.invalidate(); await settle(40);
    const after = state();
    assert.equal(after.plot.right, before.plot.right, 'this zoom does not change the plot width');
    assert.ok(Math.abs(mounted.chart.timeScale.xToIndexFloat(pointerX) - anchored) < 1e-9, 'the engine kept the same bar under the pointer');
    const drift = pointerAnchorDrift({ axis, before, after, pointerX });
    assert.ok(drift.error <= drift.tolerance * 1e-3, 'the bar-indexed pointer date is unchanged: ' + JSON.stringify(drift));
    const straight = stateOf => stateOf.first + pointerX / stateOf.plot.right * (stateOf.last - stateOf.first);
    assert.ok(Math.abs(straight(before) - straight(after)) > drift.tolerance, 'the straight-line model calls the same exact zoom a drift beyond tolerance');
  });
});

test('a bar that slides under the pointer is still reported beyond one candle plus one pixel', async () => {
  await withEngine(async ({ mounted, settle, state }) => {
    const axis = funnestTimeAxis(times), before = state(), pointerX = before.plot.right * .3, spacing = mounted.chart.timeScale.barSpacing;
    assert.ok(spacing < 3.5, 'eight pixels cover more than one candle plus one pixel at this density: ' + spacing);
    mounted.chart.timeScale.pan(8); mounted.chart.invalidate(); await settle(40);
    const drift = pointerAnchorDrift({ axis, before, after: state(), pointerX });
    assert.ok(drift.error > drift.tolerance, 'an 8px slide exceeds the unchanged tolerance: ' + JSON.stringify(drift));
    assert.equal(drift.tolerance, sessionDay + (before.last - before.first) / before.plot.right, 'tolerance stays one candle plus one pixel of the earlier state');
  });
});
