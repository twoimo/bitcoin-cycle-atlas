import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const argument = (name, fallback) => {
  const index = process.argv.indexOf(name);
  return index < 0 ? fallback : process.argv[index + 1];
};
const baseURL = argument('--url', 'http://127.0.0.1:8765/');
const output = resolve(argument('--output', '/tmp/atlas-browser-audit'));
const label = argument('--label', 'working-tree');
const fontMode = argument('--fonts', 'blocked');
const selectedSizes = argument('--sizes', '').split(',').filter(Boolean);
assert.ok(['blocked', 'available'].includes(fontMode), '--fonts must be blocked or available');
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const browser = await chromium.launch({
  executablePath: process.env.CHROME_PATH || undefined,
  headless: true,
  args: ['--no-sandbox', '--disable-dev-shm-usage'],
});
await mkdir(output, { recursive: true });
const reports = [];
const sizes = [
  ['desktop', 1440, 900, false],
  ['laptop', 1280, 720, false],
  ['tablet-landscape', 1024, 768, true],
  ['tablet-portrait', 768, 1024, true],
  ['phone', 390, 844, true],
  ['small-phone', 320, 568, true],
  ['phone-landscape', 844, 390, true],
];
const settle = page => page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));

try {
  for (const [name, width, height, touch] of sizes) {
    if (selectedSizes.length && !selectedSizes.includes(name)) continue;
    const context = await browser.newContext({
      viewport: { width, height }, hasTouch: touch, isMobile: touch,
      deviceScaleFactor: 1, ignoreHTTPSErrors: true,
    });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    // The failure is intentional: system fonts must keep the app usable.
    if (fontMode === 'blocked') await page.route('https://fonts.googleapis.com/**', route => route.abort('failed'));
    await page.addInitScript(() => {
      window.__atlasAudit = { events: [], updates: 0 };
      document.addEventListener('atlas:workbench-state', event => {
        const { frequency, chartType, marketStatus, navigationAvailable, start, end } = event.detail;
        Object.assign(window.__atlasAudit, { frequency, chartType, marketStatus, navigationAvailable, start, end });
        window.__atlasAudit.updates++;
      });
      for (const name of ['atlas:ready', 'atlas:boot-error']) {
        document.addEventListener(name, () => window.__atlasAudit.events.push(name));
      }
    });
    try {
      await page.goto(baseURL, { waitUntil: 'domcontentloaded', timeout: 45000 });
      await page.waitForFunction(() => document.documentElement.dataset.boot !== 'loading', null, { timeout: 45000 });
      if (fontMode === 'available') await page.waitForLoadState('networkidle');
      await settle(page);
      const result = await page.evaluate(() => {
        const box = selector => document.querySelector(selector)?.getBoundingClientRect().toJSON();
        const visible = selector => {
          const element = document.querySelector(selector);
          return Boolean(element && element.getBoundingClientRect().width && element.getBoundingClientRect().height && getComputedStyle(element).visibility !== 'hidden');
        };
        return {
          boot: document.documentElement.dataset.boot,
          viewport: { width: innerWidth, height: innerHeight },
          document: { width: document.documentElement.scrollWidth, height: document.documentElement.scrollHeight },
          chart: box('#lab-chart'), bottomBar: box('.chart-bottom-bar'),
          volumeChecked: document.querySelector('#atlas-volume')?.checked,
          indicatorsExpanded: document.querySelector('#indicator-legend-toggle')?.getAttribute('aria-expanded'),
          priceLegendVisible: visible('#atlas-chart-legend'),
          readout: document.querySelector('#lab-metrics')?.textContent,
          observedCount: document.querySelector('#lab-chart')?.dataset.observedLineCount,
          fontFaces: [...new Set([...document.fonts].filter(font => font.status === 'loaded').map(font => font.family))],
          ...window.__atlasAudit,
        };
      });
      await page.screenshot({ path: resolve(output, `${name}.png`) });
      reports.push({ name, label, ...result, errors });
      console.log(JSON.stringify({ name, boot: result.boot, chart: result.chart, errors }));
      assert.equal(result.boot, 'ready', `${name}: optional font failure blocked startup`);
      assert.ok(result.chart.width > 200 && result.chart.height > 120, `${name}: chart has usable geometry`);
      assert.ok(result.document.width <= result.viewport.width + 1, `${name}: horizontal document overflow`);
      assert.ok(result.document.height <= result.viewport.height + 1, `${name}: vertical document overflow`);
      assert.equal(result.volumeChecked, false, `${name}: fresh default keeps volume hidden`);
      assert.deepEqual(errors, [], `${name}: runtime errors`);
      if (fontMode === 'available') assert.ok(result.fontFaces.includes('Noto Sans KR'), `${name}: Korean font actually loaded`);
      if (width <= 620 || width <= 950 && height <= 500) {
        assert.equal(result.priceLegendVisible, false, `${name}: compact legend stays hidden`);
        assert.equal(result.indicatorsExpanded, 'false', `${name}: indicator list starts folded`);
      }

      await page.locator('#atlas-mode-menu').click();
      await page.waitForSelector('#indicator-library[open]');
      const dialog = await page.locator('#indicator-library').boundingBox();
      assert.ok(dialog.x >= -1 && dialog.y >= -1 && dialog.x + dialog.width <= width + 1 && dialog.y + dialog.height <= height + 1, `${name}: indicator dialog remains in viewport`);
      await page.keyboard.press('Escape');
      await page.locator('#workbench-chart-type').click();
      await page.waitForFunction(() => window.__atlasAudit.chartType === 'candles');
      await settle(page);
      await page.locator('#workbench-chart-type').click();
      await page.waitForFunction(() => window.__atlasAudit.chartType === 'line');
      reports.at(-1).interactions = ['indicator dialog opens and closes', 'line to candles to line'];
      if (name === 'desktop') {
        await page.locator('[data-reader="guide"]').click();
        await page.waitForSelector('#chart-reader:not([hidden])');
        await settle(page);
        const handle = page.locator('.reader-resize'), box = await handle.boundingBox();
        const initial = await page.locator('#chart-reader').evaluate(node => node.getBoundingClientRect().width);
        const x = box.x + box.width / 2, y = box.y + box.height / 2;
        await page.mouse.move(x, y); await page.mouse.down();
        await page.mouse.move(x - 30, y); await settle(page);
        const cdp = await context.newCDPSession(page);
        // No move event at the last coordinate: release must still commit it.
        await cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: x - 70, y, button: 'left', buttons: 0, clickCount: 1 });
        await settle(page);
        const final = Number(await handle.getAttribute('aria-valuenow'));
        assert.equal(final, Math.min(420, initial + 70), 'reader commits the release coordinate');
        await handle.focus(); await page.keyboard.press('Home');
        assert.equal(await handle.getAttribute('aria-valuenow'), '320', 'reader keyboard reset');
        await page.getByRole('button', { name: '상세 패널 닫기', exact: true }).click();
        reports.at(-1).interactions.push('native mouse reader resize applies final release', 'reader keyboard reset and close');
        await cdp.detach();
      }
      if (name === 'phone') {
        await settle(page);
        const start = await page.evaluate(() => {
          const svg = document.querySelector('#lab-chart'), box = svg.getBoundingClientRect(), view = svg.viewBox.baseVal;
          const x = Number(svg.dataset.plotLeft) + (Number(svg.dataset.plotRight) - Number(svg.dataset.plotLeft)) * .35;
          const y = Number(svg.dataset.plotTop) + (Number(svg.dataset.priceBottom) - Number(svg.dataset.plotTop)) * .15;
          return { x: box.left + x / view.width * box.width, y: box.top + y / view.height * box.height, range: [window.__atlasAudit.start, window.__atlasAudit.end] };
        });
        const cdp = await context.newCDPSession(page);
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: start.x, y: start.y, id: 1 }] });
        await page.waitForFunction(() => document.querySelector('.atlas-plot').dataset.touchTracking === 'true');
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: start.x + 50, y: start.y + 5, id: 1 }] });
        await settle(page);
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
        assert.equal(await page.locator('.atlas-plot').getAttribute('data-touch-tracking'), 'true', 'hold tracking remains active after release');
        assert.deepEqual(await page.evaluate(() => [window.__atlasAudit.start, window.__atlasAudit.end]), start.range, 'tracking cannot pan the chart');
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: start.x + 50, y: start.y + 5, id: 2 }] });
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
        await page.waitForFunction(() => document.querySelector('.atlas-plot').dataset.touchTracking === 'false');
        reports.at(-1).interactions.push('Chromium touch hold, move and release retain tracking without panning', 'next touch tap exits tracking');
        await cdp.detach();
      }
      assert.deepEqual(errors, [], `${name}: interaction runtime errors`);
    } catch (error) {
      if (!reports.length || reports.at(-1).name !== name) reports.push({ name, label, errors });
      reports.at(-1).failure = error.message;
      await page.screenshot({ path: resolve(output, `${name}-failure.png`) }).catch(() => {});
    } finally {
      await context.close();
    }
  }
} finally {
  const result = {
    label, browser: browser.version(), fontMode,
    scope: 'Headless Chromium viewport/touch emulation and local immutable market snapshots. Font mode is recorded separately. No physical device, Safari, or browser-native pinch validation.',
    results: reports,
  };
  await writeFile(resolve(output, 'results.json'), `${JSON.stringify(result, null, 2)}\n`);
  await browser.close();
}
assert.ok(reports.length && reports.every(result => !result.failure), 'See results.json for failing viewport cases');
