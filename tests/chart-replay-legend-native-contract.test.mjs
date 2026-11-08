import assert from 'node:assert/strict';
import test from 'node:test';
import { parseHTML } from 'linkedom';
import { priceLegendMarkup } from '../dist/price-legend.js';
import { cycleLegendMarkup } from '../dist/cycle-milestones-view.js';
import { assertChartReplayLegendSemantics } from '../scripts/verify-chart-replay-browser.mjs';
import { assertPriceLegendScrollSurface } from '../scripts/verify-workspace-browser.mjs';

// Use the actual markup producers with the two explicit lab-view compositions.
// Geometry is only a boundary fixture; real dialog/input layout remains in Chrome.
function rendered(context) {
  const markup = priceLegendMarkup({ compact: true, observed: true, forecast: true, band: true, turns: true,
    replayMode: context === 'replay' ? 'current-chart-snapshot' : null }) + cycleLegendMarkup()
    + (context === 'live' ? '<span class="cycle-reference-key">◇ 거시 시계 · ○ 예시 경로</span>' : '');
  const { document } = parseHTML('<html><body>' + markup + '</body></html>');
  const names = selector => [...document.querySelectorAll(selector)].map(node => node.textContent.replace(/\s+/g, ' ').trim());
  return { items: names('.price-legend-item,.cycle-legend-item'), statusItems: names('.cycle-style-sample,.cycle-reference-key') };
}

test('native Replay accepts the actual atlas frame markup with ten entries and two line meanings', () => {
  const replay = rendered('replay');
  assert.equal(replay.items.length, 10);assert.equal(replay.statusItems.length, 2);
  assert.doesNotThrow(() => assertChartReplayLegendSemantics(replay));
});

test('native Replay rejects missing, reordered or relabeled price and cycle entries', () => {
  const replay = rendered('replay');
  for (let index = 0; index < replay.items.length; index++) {
    const damaged = structuredClone(replay);damaged.items.splice(index, 1);
    assert.throws(() => assertChartReplayLegendSemantics(damaged), /original price\/cycle semantic entry/);
  }
  const swapped = structuredClone(replay);[swapped.items[0], swapped.items[1]] = [swapped.items[1], swapped.items[0]];
  assert.throws(() => assertChartReplayLegendSemantics(swapped), /original price\/cycle semantic entry/);
  const relabeled = structuredClone(replay);relabeled.items[1] = '관측 수익';
  assert.throws(() => assertChartReplayLegendSemantics(relabeled), /original price\/cycle semantic entry/);
});

test('native Replay rejects absent, altered, reordered and live-only status meanings', () => {
  const replay = rendered('replay');
  for (const statusItems of [[], [replay.statusItems[0]], [replay.statusItems[1]],
    [...replay.statusItems].reverse(), ['실선 · 예측', replay.statusItems[1]], rendered('live').statusItems]) {
    assert.throws(() => assertChartReplayLegendSemantics({ ...replay, statusItems }), /exact provisional\/retrospective meanings/);
  }
});

test('the separate live native oracle still requires all three meanings and every full-sheet entry', () => {
  const live = rendered('live');
  const state = { width: 320, height: 900, scrollX: 0, scrollY: 0, pageWidth: 320, url: '/',
    range: { start: '2024-01-01', end: '2028-01-01', interval: 'daily' }, observed: { line: 100, candles: 0 },
    price: { min: 100, max: 200, mode: 'auto', scale: 'log', unit: 'usd', inverted: 'false' },
    pricePane: { left: 8, right: 240, top: 18, bottom: 700 },
    legend: { left: 160, right: 228, top: 30, bottom: 74, width: 68, height: 44, clientWidth: 68, maximum: 0, mode: 'chip',
      items: live.items.map(name => ({ name, painted: false, width: 0, height: 0 })), statusItems: live.statusItems.map(name => ({ name })),
      trigger: { name: '범례', painted: true, width: 68, height: 44 } },
    sheet: { left: 0, right: 320, top: 0, bottom: 900, width: 320, height: 900, clientHeight: 820, maximum: 500,
      horizontalOverflow: 0, overflowY: 'auto', items: [...live.items, ...live.statusItems].map(name => ({ name, painted: true, width: 200, height: 20 })) } };
  assert.equal(live.statusItems.length, 3);assert.equal(state.sheet.items.length, 13);
  assert.doesNotThrow(() => assertPriceLegendScrollSurface(state));
  const missingKey = structuredClone(state);missingKey.legend.statusItems.pop();
  assert.throws(() => assertPriceLegendScrollSurface(missingKey), /lost provisional\/retrospective meanings/);
  const missingSheetMeaning = structuredClone(state);missingSheetMeaning.sheet.items.pop();
  assert.throws(() => assertPriceLegendScrollSurface(missingSheetMeaning), /every original meaning/);
});
