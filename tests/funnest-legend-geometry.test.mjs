import assert from 'node:assert/strict';
import test from 'node:test';
import { mountObservedPriceChart } from '../dist/funnest-observed-price-adapter.js';
import { mountChartLegend } from '../dist/ui/chart-legend.js?v=1.36.1';
import { sessionBars, withNativeRuntime } from './helpers/funnest-native-fixture.mjs';

const candles = sessionBars.map(bar => ({ time: bar.time / 1000, open: bar.open, high: bar.high, low: bar.low, close: bar.close, volume: 10, date: new Date(bar.time).toISOString().slice(0, 10) }));

test('the shared legend follows the native price-plot width when the Funnest price axis grows', async () => {
  await withNativeRuntime(async ({ container, bounds, settle, relayout }) => {
    container.innerHTML = '<div class="lab-chart-foot"><div id="atlas-chart-legend" class="lab-legend"><span class="price-legend-item">실제 가격</span></div></div>';
    const legend = mountChartLegend({ plot: container }), foot = container.querySelector('.lab-chart-foot');
    const mounted = mountObservedPriceChart(container, { series: { candles }, symbol: 'MSTR', onViewport() {}, onError() {} });
    const dock = () => ({ width: foot.style.getPropertyValue('--chart-legend-width'), right: foot.style.getPropertyValue('--chart-legend-right'), top: foot.style.getPropertyValue('--chart-legend-top') });
    const expected = () => {
      const priceWidth = mounted.chart.layout.plotWidth * bounds.width / mounted.chart.layout.width;
      return { priceWidth, dock: { width: `${Math.round(priceWidth * .42 * 100) / 100}px`, right: `${Math.round((bounds.width - priceWidth + 12) * 100) / 100}px`, top: '30px' } };
    };
    try {
      await settle(80);
      const before = expected();
      assert.deepEqual(dock(), before.dock, 'the legend is laid out against the painted native plot, below the default 30px band');
      await relayout(mounted, 11);
      const after = expected();
      assert.ok(after.priceWidth < before.priceWidth, 'wider tick labels grew the held native price axis');
      assert.deepEqual(dock(), after.dock, 'a native plot-width change re-lays out the legend at 42% of the new price pane');
    } finally { mounted.destroy(); legend.destroy(); }
  });
});
