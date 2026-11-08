import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import { parseHTML } from 'linkedom';
import { priceLegendMarkup } from '../dist/price-legend.js';
import { cycleLegendMarkup } from '../dist/cycle-milestones-view.js';
import { assertChartReplayLegendSemantics } from '../scripts/verify-chart-replay-browser.mjs';
import { assertPriceLegendScrollSurface } from '../scripts/verify-workspace-browser.mjs';

const source = readFileSync(new URL('../dist/lab-view.js', import.meta.url), 'utf8');
const frameStart = source.indexOf('    onAtlasFrame:'), frameEnd = source.indexOf('\n    }});', frameStart);
assert.ok(frameStart >= 0 && frameEnd > frameStart, 'Exercise the actual Atlas replay frame callback');
const callback = source.slice(frameStart, frameEnd).replace(/^\s*onAtlasFrame:/, '') + '\n}';

// Replay executes the actual frame callback, including its reference key.
// Geometry is only a boundary fixture; real dialog/input layout remains in Chrome.
function rendered(context, mode = 'current-chart-snapshot') {
  const { document, window } = parseHTML('<html><body><svg id="lab-chart"></svg><div id="atlas-chart-legend"></div><span id="atlas-chart-caveat"></span><span id="lab-chart-title"></span><span id="lab-asof"></span><span id="atlas-chart-note"></span><input id="lab-window"></body></html>');
  if (context === 'replay') {
    const frame = vm.runInNewContext('(' + callback + ')', { document, CustomEvent: window.CustomEvent, $: selector => document.querySelector(selector),
      priceLegendMarkup, cycleLegendMarkup, dateLabel: value => value, chartInterval: () => ({ label: '1D' }), state: { scenario: 'base' }, DEFAULT_CHART_SPAN: 'focus' });
    frame({ session: { mode, asOf: '2026-05-30', identity: { recordKind: 'reconstructed' } },
      data: { frequency: 'daily', observedRows: [{ date: '2026-05-30' }], observedCandles: [], priceSource: 'Coin Metrics', candleSource: 'Bitstamp', frame: { cursorDate: '2026-06-01', forecast: [{ lower: 1, upper: 3 }] } },
      context: { presentation: { band: true, showTurns: true, showCycleMarkers: true, showCycleIntervals: true } },
      start: '2026-01-01', end: '2028-01-01', chartType: 'line', window: 'focus' });
  } else {
    document.querySelector('#atlas-chart-legend').innerHTML = priceLegendMarkup({ compact: true, observed: true, forecast: true, band: true, turns: true })
      + cycleLegendMarkup() + '<span class="cycle-reference-key">◇ 거시 시계 · ○ 예시 경로</span>';
  }
  const names = selector => [...document.querySelectorAll(selector)].map(node => node.textContent.replace(/\s+/g, ' ').trim());
  const priceSamples = [...document.querySelectorAll('.price-legend-item')].map(node => ({ title: node.getAttribute('title'),
    path: node.querySelector('path')?.getAttribute('stroke'), fill: node.querySelector('rect')?.getAttribute('fill') }));
  return { items: names('.price-legend-item,.cycle-legend-item'), statusItems: names('.cycle-style-sample,.cycle-reference-key'), priceSamples };
}

test('native Replay accepts the actual atlas frame markup with ten entries and three explicit meanings', () => {
  const replay = rendered('replay');
  assert.equal(replay.items.length, 10);assert.equal(replay.statusItems.length, 3);
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

test('native Replay rejects missing, altered, reordered or extra status meanings', () => {
  const replay = rendered('replay');
  const missing = replay.statusItems.map((_, index) => replay.statusItems.filter((_, itemIndex) => itemIndex !== index));
  for (const statusItems of [[], ...missing, [...replay.statusItems].reverse(),
    ['실선 · 예측', ...replay.statusItems.slice(1)], [...replay.statusItems, replay.statusItems[2]]]) {
    assert.throws(() => assertChartReplayLegendSemantics({ ...replay, statusItems }), /exact provisional\/retrospective\/reference meanings/);
  }
});

test('the actual Replay frame keeps mode-specific colors and range explanations alongside all three cycle meanings', () => {
  const current = rendered('replay'), cutoff = rendered('replay', 'cutoff-backtest');
  assert.deepEqual(cutoff.statusItems, current.statusItems);
  assert.deepEqual(cutoff.items, ['실제 가격', '고정 예측', '모형 범위', ...current.items.slice(3)]);
  assert.equal(current.priceSamples[1].path, '#f2b960');assert.equal(current.priceSamples[2].fill, '#f2aa4c25');
  assert.match(current.priceSamples[2].title, /경제 가정.*통계적 확률구간이 아닙니다/);
  assert.equal(cutoff.priceSamples[1].path, 'var(--replay-cutoff-ink,#74a7ee)');
  assert.equal(cutoff.priceSamples[2].fill, cutoff.priceSamples[1].path);
  assert.match(cutoff.priceSamples[1].title, /현재 재구성.*당시 발행된 예측 기록이나 실제 거래 가격이 아닙니다/);
  assert.match(cutoff.priceSamples[2].title, /기준시점 모형.*고정.*보정된 확률구간이 아닙니다/);
  assert.deepEqual(cutoff.priceSamples[0], current.priceSamples[0]);assert.deepEqual(cutoff.priceSamples[3], current.priceSamples[3]);
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
