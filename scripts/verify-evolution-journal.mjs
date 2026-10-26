import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import { pathToFileURL } from 'node:url';
import { isDeepStrictEqual } from 'node:util';
import { createHash } from 'node:crypto';

// Independent browser regression. Override paths rather than install browser dependencies.
const args = process.argv.slice(2);
const option = name => args.find(arg => arg.startsWith(name + '='))?.slice(name.length + 1);
const root = resolve(option('--root') || '.');
const out = resolve(option('--output') || 'docs/evolution-2026-10-26/ui');
const standalone = option('--standalone');
const probeCloseRace = args.includes('--probe-close-race');
const selectedCases = option('--cases')?.split(',');
const selectedChecks = option('--checks')?.split(',');
const { chromium } = await import(process.env.ATLAS_PLAYWRIGHT_MODULE || 'playwright');
const json = async path => JSON.parse(await readFile(resolve(root, path), 'utf8'));
const index = await json('dist/data/forecast-ledger/index.json');
const records = new Map(await Promise.all(index.entries.map(async entry => [entry.id, await json('dist/data/forecast-ledger/' + entry.recordPath)])));
const snapshots = new Map(await Promise.all(index.entries.map(async entry => [entry.snapshotId, await json('dist/data/forecast-ledger/' + entry.snapshotPath)])));
const publication = await json('dist/publication.json');
let servedPublication = publication;
const evaluation = await json('dist/data/forecast-ledger/evaluation.json');
const experiments = await json('dist/data/forecast-ledger/experiments.json');
const observed = await json('dist/data/btc-daily.json');
const sourceIdentities = await Promise.all(['dist/forecast-journal.js', 'dist/forecast-journal.css', 'dist/forecast-records.js', 'dist/atlas-price-chart.js', 'dist/eth-view.js', 'dist/equity-view.js', 'dist/daily-data-view.js', 'dist/site-entry.js', 'dist/workspace-tools.js', 'scripts/verify-evolution-journal.mjs', ...(standalone ? [standalone] : [])].map(async path => { const body = await readFile(resolve(root, path)); return { path, bytes: body.length, sha256: createHash('sha256').update(body).digest('hex') }; }));
const money = value => '$' + value.toLocaleString('en-US', { maximumFractionDigits: 2 });
const dateAfter = (date, days) => new Date(Date.parse(date + 'T00:00:00Z') + days * 86400000).toISOString().slice(0, 10);
await mkdir(out, { recursive: true });
const dist = resolve(root, 'dist');
const server = createServer(async (req, res) => {
  try {
    const name = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    const file = resolve(dist, '.' + (name === '/' ? '/index.html' : name));
    assert.ok(file.startsWith(dist + sep));
    res.setHeader('Content-Type', ({ '.html': 'text/html', '.js': 'application/javascript', '.json': 'application/json', '.css': 'text/css', '.svg': 'image/svg+xml' })[extname(file)] || 'application/octet-stream');
    const bytes = await readFile(file);
    if (file === resolve(dist, 'publication.json')) servedPublication = JSON.parse(bytes);
    res.end(bytes);
  } catch { res.writeHead(404).end(); }
});
await new Promise((done, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', done); });
const origin = 'http://127.0.0.1:' + server.address().port;
const browser = await chromium.launch({ headless: true, executablePath: process.env.ATLAS_BROWSER_PATH, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
const cases = [
  { name: 'desktop', width: 1440, height: 900 },
  { name: 'phone320', width: 320, height: 740, touch: true },
  { name: 'tablet768', width: 768, height: 1024, touch: true },
  { name: 'zoom200-reflow', width: 720, height: 450, scale: 2 },
  ...(standalone ? [{ name: 'standalone320', width: 320, height: 740, touch: true, offline: true }] : []),
].filter(item => !selectedCases || selectedCases.includes(item.name));
const report = {
  status: 'RUNNING', generatedAt: new Date().toISOString(), browser: browser.version(),
  scope: 'Actual Chromium DOM, keyboard, downloads and rendered screenshots. Touch viewports are emulation. 200% case uses a half-size viewport and DPR2 reflow proxy, not browser chrome zoom or physical-device/Safari evidence. Root CSS zoom is not a browser-zoom equivalent and is excluded.',
  sourceIdentities,
  closeRaceProbe: probeCloseRace,
  cases: [],
};
const saveReport = async () => writeFile(resolve(out, 'report.json'), JSON.stringify(report, null, 2) + '\n');
const screenshot = async (page, item, name) => page.screenshot({ path: resolve(out, item.name + '-' + name + '.png') });
const dimensions = async (page, selector) => page.locator(selector).evaluate(element => {
  const r = element.getBoundingClientRect(), body = element.querySelector('.journal-body,#eth-data-content,#equity-detail-content');
  return { x: r.x, y: r.y, right: r.right, bottom: r.bottom, width: r.width, height: r.height, innerWidth, innerHeight, documentWidth: document.documentElement.scrollWidth, clientWidth: element.clientWidth, scrollWidth: element.scrollWidth, bodyClient: body?.clientWidth, bodyScroll: body?.scrollWidth };
});
const assertFit = box => {
  assert.ok(box.x >= -1 && box.y >= -1 && box.right <= box.innerWidth + 1 && box.bottom <= box.innerHeight + 1, 'Dialog must fit the viewport: ' + JSON.stringify(box));
  assert.ok(box.documentWidth <= box.innerWidth + 1, 'Document must not overflow horizontally: ' + JSON.stringify(box));
  assert.ok(!box.bodyClient || box.bodyScroll <= box.bodyClient + 1, 'Dialog content must wrap; only its tables may scroll horizontally: ' + JSON.stringify(box));
};
async function downloadJson(page, selector, expected) {
  const pending = page.waitForEvent('download');
  await page.locator(selector).click();
  const download = await pending;
  const parsed = JSON.parse(await readFile(await download.path(), 'utf8'));
  if (expected) assert.ok(isDeepStrictEqual(parsed, expected), 'Downloaded ' + download.suggestedFilename() + ' must equal its served source JSON');
  return { filename: download.suggestedFilename(), kind: parsed.kind || parsed.record?.kind || null };
}
async function readyJournal(page, tab) {
  const selectors = { records: '[data-journal-record]', evaluation: '[data-evaluation-export]', changes: '[data-journal-compare]', data: '[data-publication-export]', experiments: '[data-experiments-export]', performance: '[data-performance-export]' };
  await page.locator('#forecast-journal ' + selectors[tab]).waitFor({ timeout: 30000 });
  assert.equal(await page.locator('#forecast-journal [role="alert"]').count(), 0);
}
async function openJournal(page, { wait = true } = {}) {
  // Use the genuine command palette entry; tests never import/open the journal directly.
  const opener = page.locator('[data-open-forecast-journal="records"]:visible').first();
  if (await opener.count()) {
    await opener.click();
  } else {
    if (await page.locator('[data-view="outlook"]:visible').count()) await page.locator('[data-view="outlook"]:visible').first().click();
    await page.locator('#workbench-workspace').waitFor({ state: 'attached', timeout: 30000 });
    await page.locator('svg[tabindex="0"]:visible').first().focus();
    await page.keyboard.press('Control+k');
    await page.locator('.workspace-command-search').fill('예측 기록');
    await page.locator('.workspace-command').filter({ hasText: '예측 기록과 누적 평가' }).click();
  }
  if (wait) await readyJournal(page, 'records');
}
try {
  for (const item of cases) {
    const entry = { name: item.name, viewport: [item.width, item.height], checks: [], failures: [], downloads: [], errors: [], missing: [], blockedExternal: [] };
    report.cases.push(entry);
    const context = await browser.newContext({ viewport: { width: item.width, height: item.height }, hasTouch: Boolean(item.touch), deviceScaleFactor: item.scale || 1, acceptDownloads: true });
    const page = await context.newPage();
    page.setDefaultTimeout(12000);
    page.on('pageerror', error => entry.errors.push(error.message));
    page.on('response', response => { if (response.url().startsWith(origin) && response.status() >= 400) entry.missing.push(response.url()); });
    await page.route('**/*', route => {
      const url = route.request().url();
      if (url.startsWith(origin) || /^(file|data|blob):/.test(url)) return route.continue();
      entry.blockedExternal.push(url);
      return route.abort();
    });
    const url = query => item.offline ? pathToFileURL(resolve(standalone)).href + query : origin + '/' + query;
    async function visit(query) {
      await page.goto(url(query));
      await page.waitForFunction(() => document.documentElement.dataset.boot === 'ready', null, { timeout: 30000 });
      if (item.zoom) await page.evaluate(zoom => { document.documentElement.style.zoom = String(zoom); }, item.zoom);
    }
    async function check(name, body) {
      if (selectedChecks && !selectedChecks.includes(name)) return;
      try { await body(); entry.checks.push(name); console.log('PASS ' + item.name + ' ' + name); }
      catch (error) { const failure = { name, error: error.message, url: page.url() }; entry.failures.push(failure); console.log('FAIL ' + item.name + ' ' + name + ': ' + error.message.slice(0, 1600)); await screenshot(page, item, 'failure-' + name.replace(/[^a-z0-9]+/gi, '-')).catch(() => {}); }
      await saveReport();
    }
    await check('comparison-and-existing-history', async () => {
      await visit('?page=data');
      await page.locator('#data-body tr[data-asset-symbol]').first().waitFor();
      const symbols = await page.locator('#data-body tr[data-asset-symbol]').evaluateAll(rows => rows.map(row => row.dataset.assetSymbol));
      assert.equal(symbols.length, 18); assert.equal(symbols[0], 'BTC');
      await page.locator('#asset-history-open').click();
      await page.waitForFunction(() => document.querySelectorAll('#history-body [data-history-asset]').length === 18, null, { timeout: 60000 });
      await page.locator('#asset-history-close').click();
      assert.equal(await page.locator('#asset-history-dialog').evaluate(el => el.open), false);
      entry.symbols = symbols;
    });
    await check('data-method-journal-touch-entry', async () => {
      await visit('?page=data');
      await page.locator('#asset-history-open:enabled').waitFor();
      const activate = selector => item.touch ? page.locator(selector).tap() : page.locator(selector).click();
      await activate('#daily-method-open');
      await activate('#daily-method-dialog [data-open-forecast-journal="data"]');
      await readyJournal(page, 'data');
      assertFit(await dimensions(page, '#forecast-journal'));
      await activate('[data-journal-tab="records"]'); await readyJournal(page, 'records');
      await activate('[data-journal-close]');
      assert.equal(await page.locator('#forecast-journal').evaluate(el => el.open), false);
      const active = await page.evaluate(() => ({ tag: document.activeElement?.tagName, visible: !!document.activeElement?.getClientRects().length, hiddenDialog: !!document.activeElement?.closest('dialog:not([open])') }));
      assert.ok(active.visible && !active.hiddenDialog && active.tag !== 'BODY', 'Comparison journal handoff must return visible focus: ' + JSON.stringify(active));
      if (await page.locator('#daily-method-dialog[open]').count()) await activate('#daily-method-close');
    });
    await check('journal-records-keyboard-and-exact-values', async () => {
      await visit('?page=data');
      await page.locator('#asset-history-open:enabled').waitFor();
      await openJournal(page);
      assert.equal(await page.locator('#forecast-journal [data-journal-tab]').count(), 6);
      assert.equal(await page.locator('[data-journal-record] option').count(), index.entries.length);
      assertFit(await dimensions(page, '#forecast-journal'));
      const selected = await page.locator('[data-journal-record]').inputValue();
      const record = records.get(selected), snapshot = snapshots.get(record.snapshotId);
      assert.equal(record.scenario.id, 'base');
      const renderedRows = await page.locator('#forecast-journal tbody tr').evaluateAll(rows => rows.map(row => [...row.cells].map(cell => cell.textContent)));
      assert.deepEqual(renderedRows, record.targets.map(t => [t.horizonDays + '일', t.targetDate, money(t.price), money(t.flat), money(t.shrunkenTrend)]));
      for (const range of ['90', '365', '0']) {
        await page.locator('[data-journal-range]').selectOption(range); await readyJournal(page, 'records');
        await page.locator('#journal-price-chart').press('End');
        const end = range === '0' ? record.output.path.at(-1) : record.output.path[Number(range)];
        assert.equal(await page.locator('#journal-selection').textContent(), end[0] + ' · 보존한 가정 ' + money(end[1]));
        await page.locator('#journal-price-chart').press('Home');
        const start = dateAfter(record.asOf, -90), anchor = snapshot.prices.find(row => row[0] === start);
        assert.equal(await page.locator('#journal-selection').textContent(), start + ' · 당시 관측 ' + money(anchor[1]));
        await page.locator('#journal-price-chart').press('ArrowRight');
        const next = snapshot.prices.find(row => row[0] === dateAfter(start, 1));
        assert.equal(await page.locator('#journal-selection').textContent(), next[0] + ' · 당시 관측 ' + money(next[1]));
      }
      entry.downloads.push(await downloadJson(page, '[data-journal-export]', { record, snapshot }));
      for (const candidate of index.entries) {
        await page.locator('[data-journal-record]').selectOption(candidate.id); await readyJournal(page, 'records');
        await page.locator('#journal-price-chart').press('End');
        const expected = records.get(candidate.id).output.path.at(-1);
        assert.equal(await page.locator('#journal-selection').textContent(), expected[0] + ' · 보존한 가정 ' + money(expected[1]));
      }
      await page.locator('[data-journal-range]').selectOption('180'); await readyJournal(page, 'records');
      await screenshot(page, item, 'journal-records');
    });
    await check('journal-selection-survives-resize', async () => {
      await page.locator('#journal-price-chart').press('End');
      const before = await page.locator('#journal-selection').textContent();
      await page.setViewportSize({ width: item.width + 20, height: item.height });
      await page.evaluate(() => new Promise(done => requestAnimationFrame(() => requestAnimationFrame(done))));
      const after = await page.locator('#journal-selection').textContent();
      await page.setViewportSize({ width: item.width, height: item.height });
      entry.resizeSelection = { before, after };
      assert.equal(after, before, 'A chart resize must keep the selected exact date/value');
    });
    await check('journal-range-keyboard-focus', async () => {
      await page.locator('[data-journal-range]').focus();
      await page.locator('[data-journal-range]').press('ArrowUp');
      await readyJournal(page, 'records');
      entry.focusAfterRangeChange = await page.evaluate(() => ({ tag: document.activeElement?.tagName, range: document.activeElement?.hasAttribute('data-journal-range'), value: document.querySelector('[data-journal-range]')?.value }));
      assert.equal(entry.focusAfterRangeChange.range, true, 'Native keyboard range changes must retain focus: ' + JSON.stringify(entry.focusAfterRangeChange));
    });
    await check('journal-six-tabs-and-downloads', async () => {
      if (!await page.locator('#forecast-journal[open]').count()) await openJournal(page);
      for (const tab of ['evaluation', 'changes', 'data', 'experiments', 'performance']) {
        await page.locator('[data-journal-tab="' + tab + '"]').click(); await readyJournal(page, tab);
        assert.equal(await page.locator('[data-journal-tab][aria-pressed="true"]').getAttribute('data-journal-tab'), tab);
        assertFit(await dimensions(page, '#forecast-journal'));
        if (tab === 'evaluation') {
          const text = await page.locator('.journal-body').textContent();
          assert.ok(text.includes('확정 결과 ' + evaluation.maturedTargets + '개'));
          if (evaluation.maturedTargets === 0) assert.ok(text.includes('미평가'));
          entry.downloads.push(await downloadJson(page, '[data-evaluation-export]', evaluation));
        } else if (tab === 'changes') {
          assert.equal(await page.locator('[data-journal-compare] option').count(), index.entries.length - 1);
          const old = records.get(await page.locator('[data-journal-compare]').inputValue()), current = records.get(await page.locator('[data-journal-record]').inputValue());
          const actual = await page.locator('#forecast-journal tbody tr').evaluateAll(rows => rows.map(row => [...row.cells].map(cell => cell.textContent)));
          for (let i = 0; i < actual.length; i++) { const t = current.targets[i], prior = old.output.path.find(row => row[0] === t.targetDate); assert.equal(actual[i][1], money(prior[1])); assert.equal(actual[i][2], money(t.price)); assert.equal(actual[i][3], (Math.log(t.price) - Math.log(prior[1])).toFixed(4)); }
        } else if (tab === 'data') {
          const expectedPublication = item.offline ? await page.locator('#atlas-publication').evaluate(el => JSON.parse(el.textContent)) : servedPublication;
          entry.publicationManifest = expectedPublication.manifestSha256;
          const counts = await page.locator('#forecast-journal table').evaluateAll(tables => tables.map(table => table.tBodies[0].rows.length));
          assert.deepEqual(counts, [expectedPublication.assets.length, expectedPublication.alignment.rows.length]);
          assert.equal(counts[0], 22);
          entry.downloads.push(await downloadJson(page, '[data-publication-export]', expectedPublication));
        } else if (tab === 'experiments') {
          assert.equal((await page.locator('#forecast-journal h3').allTextContents()).filter(t => t.includes('미채택')).length, 3);
          entry.downloads.push(await downloadJson(page, '[data-experiments-export]', experiments));
        } else {
          assert.ok((await page.locator('.journal-body').textContent()).includes('외부로 자동 전송하지 않습니다'));
          entry.downloads.push(await downloadJson(page, '[data-performance-export]'));
        }
        await screenshot(page, item, 'journal-' + tab);
      }
    });
    await check('journal-close-reopen-race-and-focus', async () => {
      await page.locator('[data-journal-close]').click();
      entry.focusAfterClose = await page.evaluate(() => ({ tag: document.activeElement?.tagName, id: document.activeElement?.id, visible: !!document.activeElement?.getClientRects().length, insideClosedDialog: !!document.activeElement?.closest('dialog:not([open])') }));
      assert.ok(entry.focusAfterClose.visible && !entry.focusAfterClose.insideClosedDialog && entry.focusAfterClose.tag !== 'BODY', 'Focus must return to a visible outside control: ' + JSON.stringify(entry.focusAfterClose));
      await openJournal(page);
      await page.evaluate(() => { for (const name of ['records', 'evaluation', 'changes', 'data', 'experiments', 'performance']) document.querySelector('[data-journal-tab="' + name + '"]').click(); });
      await readyJournal(page, 'performance');
      assert.ok((await page.locator('.journal-body h3').first().textContent()).includes('성능'));
      await page.locator('[data-journal-close]').focus(); await page.keyboard.press('Escape');
      assert.equal(await page.locator('#forecast-journal').evaluate(el => el.open), false);
      await openJournal(page);
      assert.equal(await page.locator('#forecast-journal').count(), 1);
      await page.evaluate(() => { document.querySelector('[data-journal-tab="data"]').click(); document.querySelector('[data-journal-close]').click(); });
      await openJournal(page);
      assert.equal(await page.locator('[data-journal-tab][aria-pressed="true"]').getAttribute('data-journal-tab'), 'records');
      await page.locator('[data-journal-close]').click();
    });
    if (item.name === 'desktop' && !item.offline) await check('journal-test-only-observed-overlay', async () => {
      await visit('?page=data'); await openJournal(page);
      const selected = await page.locator('[data-journal-record]').inputValue(), record = records.get(selected);
      await page.locator('[data-journal-range]').selectOption('90'); await readyJournal(page, 'records');
      await page.locator('[data-journal-close]').click();
      const nextDate = dateAfter(record.asOf, 1), followingDate = dateAfter(record.asOf, 2);
      const fixtureActual = observed.prices.at(-1)[1] * 1.01;
      const fixture = { ...observed, prices: [...observed.prices, [nextDate, fixtureActual], [followingDate, fixtureActual * 1.01]] };
      const routePattern = '**/data/btc-daily.json*';
      await page.route(routePattern, route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(fixture) }));
      try {
        await openJournal(page);
        await page.locator('#journal-price-chart [data-journal-actual]').waitFor({ state: 'attached' });
        assert.ok((await page.locator('[data-journal-actual]').getAttribute('d')).includes('L'));
        await page.locator('#journal-price-chart').press('Home');
        for (let i = 0; i < 91; i++) await page.keyboard.press('ArrowRight');
        assert.equal(await page.locator('#journal-selection').textContent(), nextDate + ' · 보존한 가정 ' + money(record.output.path[1][1]) + ' · 이후 실제 ' + money(fixtureActual));
        entry.syntheticObservationFixture = { scope: 'Test route only; no data file changed and not a real matured observation', selectedDate: nextDate, actualValue: fixtureActual };
      } finally { await page.unroute(routePattern); }
      await page.locator('[data-journal-close]').click();
    });
    if (item.name === 'desktop' && !item.offline) await check('journal-tamper-rejection-and-retry', async () => {
      await visit('?page=data');
      const routePattern = '**/data/forecast-ledger/records/*.json';
      await page.route(routePattern, route => {
        const id = new URL(route.request().url()).pathname.split('/').at(-1).slice(0, -5);
        const modified = structuredClone(records.get(id));
        modified.output.path[1][1] *= 1.00001;
        return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(modified) });
      });
      try {
        await openJournal(page, { wait: false });
        await page.locator('#forecast-journal [role="alert"]').waitFor();
        assert.ok((await page.locator('#forecast-journal [role="alert"]').textContent()).includes('hash mismatch'));
        assert.equal(await page.locator('#journal-price-chart').count(), 0);
      } finally { await page.unroute(routePattern); }
      await page.locator('[data-journal-retry]').click(); await readyJournal(page, 'records');
      assert.equal(await page.locator('#forecast-journal [role="alert"]').count(), 0);
      await page.locator('[data-journal-close]').click();
    });
    await check('eth-future-controls', async () => {
      await visit('?symbol=ETHUSD');
      await page.waitForFunction(() => document.querySelector('#eth-price')?.textContent !== '—' && document.querySelector('#eth-chart')?.dataset.plotRight);
      await page.locator('[data-eth-action="forecast"]').click();
      await page.locator('#eth-scenario').waitFor();
      assertFit(await dimensions(page, '#eth-data-dialog'));
      for (const value of ['stress', 'bull', 'base']) { await page.locator('#eth-scenario').selectOption(value); await page.waitForFunction(value => new URLSearchParams(location.search).get('eth-scenario') === (value === 'base' ? null : value), value); }
      await page.locator('#eth-forecast-visible').uncheck();
      await page.waitForFunction(() => document.querySelector('#eth-forecast-note').hidden);
      await page.locator('#eth-forecast-visible').check();
      await page.waitForFunction(() => !document.querySelector('#eth-forecast-note').hidden);
      await screenshot(page, item, 'eth-future');
      await page.locator('#eth-data-dialog [data-open-forecast-journal="data"]').click();
      await readyJournal(page, 'data');
      assert.equal(await page.locator('#eth-data-dialog').evaluate(el => el.open), false);
      await page.locator('[data-journal-close]').click();
      const active = await page.evaluate(() => ({ tag: document.activeElement?.tagName, visible: !!document.activeElement?.getClientRects().length, hiddenDialog: !!document.activeElement?.closest('dialog:not([open])') }));
      assert.ok(active.visible && !active.hiddenDialog && active.tag !== 'BODY', 'ETH journal must restore visible focus: ' + JSON.stringify(active));
      await page.locator('#eth-chart').press('End');
      assert.ok((await page.locator('#eth-kind').textContent()).includes('가정'));
      const after = await page.locator('#eth-price').textContent();
      await page.locator('#eth-chart').press('ArrowLeft');
      assert.notEqual(await page.locator('#eth-price').textContent(), after);
    });
    for (const symbol of ['MSTR', 'BMNR']) await check(symbol.toLowerCase() + '-capital-modal', async () => {
      await visit('?symbol=' + symbol);
      await page.waitForFunction(() => document.querySelector('#equity-price')?.textContent !== '—' && document.querySelector('#equity-chart')?.dataset.plotRight, null, { timeout: 60000 });
      await page.locator('[data-equity-action="forecast"]').click();
      const selector = symbol === 'MSTR' ? '#equity-capital-policy' : '#equity-exit-delay';
      await page.locator(selector).waitFor();
      assertFit(await dimensions(page, '#equity-detail-dialog'));
      const options = await page.locator(selector + ' option').evaluateAll(items => items.map(item => item.value));
      for (const value of [options.at(-1), options[0]]) {
        await page.locator(selector).selectOption(value);
        await page.waitForFunction(selector => !document.querySelector(selector)?.disabled && !document.querySelector('#equity-detail-content [role="status"]'), selector, { timeout: 60000 });
        assert.equal(await page.locator(selector).inputValue(), value);
      }
      assert.ok((await page.locator('#equity-detail-content').textContent()).includes('자본·유동성 가정'));
      await screenshot(page, item, symbol.toLowerCase() + '-capital');
      await page.evaluate(() => {
        window.__equityCloseObserved = false;
        window.__equityKeyAudit = [];
        document.querySelector('#equity-detail-dialog').addEventListener('close', () => { window.__equityCloseObserved = true; window.__equityKeyAudit.push({ event: 'close', active: document.activeElement?.id || document.activeElement?.getAttribute('data-equity-action') }); }, { once: true });
        document.addEventListener('keydown', event => window.__equityKeyAudit.push({ event: 'keydown', key: event.key, target: event.target.id || event.target.getAttribute('data-equity-action'), active: document.activeElement?.id, kind: document.querySelector('#equity-kind')?.textContent }));
      });
      await page.locator('#equity-detail-dialog header button').click();
      await page.waitForFunction(probe => (probe || window.__equityCloseObserved) && document.activeElement?.matches('[data-equity-action="forecast"]'), probeCloseRace);
      await page.locator('#equity-chart').press('End');
      const keyAudit = await page.evaluate(() => ({ events: window.__equityKeyAudit, kind: document.querySelector('#equity-kind').textContent, date: document.querySelector('#equity-bar-time').textContent, active: document.activeElement?.id }));
      (entry.equityKeyboardAudit ||= {})[symbol] = keyAudit;
      assert.ok(keyAudit.kind.includes('조건부'), 'End must select a future path point after close event: ' + JSON.stringify(keyAudit));
      await page.locator('[data-equity-action="info"]').click();
      await page.locator('#equity-detail-dialog [data-open-forecast-journal="data"]').click();
      await readyJournal(page, 'data');
      assert.equal(await page.locator('#equity-detail-dialog').evaluate(el => el.open), false);
      await page.locator('[data-journal-close]').click();
      const active = await page.evaluate(() => ({ tag: document.activeElement?.tagName, visible: !!document.activeElement?.getClientRects().length, hiddenDialog: !!document.activeElement?.closest('dialog:not([open])') }));
      assert.ok(active.visible && !active.hiddenDialog && active.tag !== 'BODY', symbol + ' journal must restore visible focus: ' + JSON.stringify(active));
    });
    await check('no-unhandled-errors-or-local-missing-resources', async () => { assert.deepEqual(entry.errors, []); assert.deepEqual(entry.missing, []); });
    await context.close();
  }
  report.status = report.cases.some(item => item.failures.length) ? 'FAIL' : 'PASS';
  await saveReport();
  console.log(JSON.stringify({ status: report.status, cases: report.cases.map(c => ({ name: c.name, passed: c.checks.length, failures: c.failures.map(f => ({ name: f.name, error: f.error.slice(0, 1600) })) })) }, null, 2));
  process.exitCode = report.status === 'PASS' ? 0 : 1;
} finally { await browser.close(); await new Promise(done => server.close(done)); }
