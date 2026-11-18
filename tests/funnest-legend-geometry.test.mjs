import assert from 'node:assert/strict';
import test from 'node:test';
import { mountObservedPriceChart } from '../dist/funnest-observed-price-adapter.js';
import { mountChartLegend } from '../dist/ui/chart-legend.js?v=1.36.4';
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
      return { priceWidth, gap: `${Math.round((bounds.width - priceWidth + 7) * 100) / 100}px`, dock: { right: `${Math.round((bounds.width - priceWidth + 4) * 100) / 100}px`, top: '4px' } };
    };
    try {
      await settle(80);
      const before = expected();
      const beforeWidth = parseFloat(dock().width);
      assert.equal(dock().right, before.dock.right, 'the legend right edge sits 4px in from the price scale');
      assert.equal(dock().top, before.dock.top, 'the legend sits 4px from the plot top');
      assert.ok(beforeWidth > 0 && beforeWidth <= before.priceWidth * .42 + .01, 'the legend is no wider than its content, capped at 42% of the price pane');
      assert.equal(container.style.getPropertyValue('--plot-right-gap'), before.gap, 'readouts and notes get the measured axis width plus 7px, as the SVG renderers set it');
      await relayout(mounted, 16);
      const after = expected();
      assert.ok(after.priceWidth < before.priceWidth, 'labels wider than the shared minimum grew the held native price axis');
      const afterWidth = parseFloat(dock().width);
      assert.equal(dock().right, after.dock.right, 'a native plot-width change keeps the legend against the price scale');
      assert.equal(dock().top, after.dock.top);
      assert.ok(afterWidth > 0 && afterWidth <= after.priceWidth * .42 + .01);
      assert.equal(container.style.getPropertyValue('--plot-right-gap'), after.gap, 'the gap follows the axis when it grows');
    } finally { mounted.destroy(); legend.destroy(); }
  });
});
