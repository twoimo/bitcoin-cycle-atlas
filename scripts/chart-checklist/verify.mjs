#!/usr/bin/env node
/**
 * Focused, source-bound R0–R6 browser receipts. This is not canonical full CI.
 * Uses the repository's isolated Chrome/CDP approach. All measurements read
 * the rendered DOM; any future interactions must use native CDP input.
 * The local server serves exact dist bytes at / and /bitcoin-cycle-atlas/.
 */
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, writeFile, readdir, mkdir, mkdtemp, rm } from 'node:fs/promises';
import { resolve, relative, extname, sep } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { spawn, execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';

const scriptRoot = resolve(fileURLToPath(new URL('../..', import.meta.url)));
const argv = process.argv.slice(2);
const arg = (name, fallback) => argv.includes(name) ? argv[argv.indexOf(name) + 1] : fallback;
const source = resolve(arg('--source', scriptRoot));
const dist = resolve(source, 'dist');
const phase = arg('--phase', 'after');
const item = arg('--item', 'R0').toUpperCase();
const out = resolve(arg('--out', resolve(source, 'build/chart-checklist', item, phase)));
const defaultSymbols = ['BTCUSD', 'ETHUSD', 'MSTR', 'TQQQ', 'SOXL', '233740'];
const defaultViewports = [[390, 844], [320, 740], [768, 1024], [1024, 768], [1440, 900], [1920, 1080]];
const symbols = arg('--symbols', defaultSymbols.join(',')).split(',');
const viewports = arg('--viewports', defaultViewports.map(v => v.join('x')).join(',')).split(',').map(v => v.split('x').map(Number));
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
const git = args => execFileSync('git', args, { cwd: source, encoding: 'utf8' }).trim();
const report = {
  schemaVersion: 1, kind: 'atlas-chart-checklist-native-browser', item, phase,
  qualifiesFullVerification: false, productionDeployment: false,
  startedAt: new Date().toISOString(), status: 'RUNNING', cases: [], failures: [],
  sourceDirectory: source, viewports, symbols,
  completeRequestedMatrix: JSON.stringify(symbols) === JSON.stringify(defaultSymbols) && JSON.stringify(viewports) === JSON.stringify(defaultViewports),
  scope: 'Exact local dist bytes, six root symbol deep links, six explicit CSS viewports in isolated Chrome contexts. Local archive observations, not production or live provider verification. No Safari or physical-device claim.',
  networkPolicy: 'Only the local source server is permitted. External provider requests are explicitly blocked and recorded; no source observations are fabricated.',
};
let server, origin, chrome, browser, profile, stderr = '';
let sourceManifest;
const served = new Map();
const serverErrors = [];

async function until(fn, label, timeout = 45000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) { const result = await fn(); if (result) return result; await delay(100); }
  throw new Error('Timed out: ' + label);
}

class Cdp {
  constructor(ws) {
    this.ws = ws; this.next = 1; this.pending = new Map(); this.listeners = new Map();
    ws.addEventListener('message', event => {
      const message = JSON.parse(String(event.data));
      if (message.id) {
        const pending = this.pending.get(message.id); if (!pending) return;
        clearTimeout(pending.timer); this.pending.delete(message.id);
        if (message.error) pending.reject(new Error(pending.method + ': ' + JSON.stringify(message.error)));
        else pending.accept(message.result || {});
      } else for (const listener of this.listeners.get(message.method) || []) listener(message.params || {});
    });
    ws.addEventListener('close', () => this.fail(new Error('CDP closed')));
    ws.addEventListener('error', () => this.fail(new Error('CDP error')));
  }
  static async connect(url) {
    const ws = new WebSocket(url);
    await new Promise((accept, reject) => {
      const timer = setTimeout(() => reject(new Error('CDP connection timeout')), 15000);
      ws.addEventListener('open', () => { clearTimeout(timer); accept(); }, { once: true });
      ws.addEventListener('error', () => { clearTimeout(timer); reject(new Error('CDP connection failed')); }, { once: true });
    });
    return new Cdp(ws);
  }
  on(method, listener) { const list = this.listeners.get(method) || []; list.push(listener); this.listeners.set(method, list); }
  fail(error) { for (const pending of this.pending.values()) { clearTimeout(pending.timer); pending.reject(error); } this.pending.clear(); }
  send(method, params = {}) {
    const id = this.next++;
    return new Promise((accept, reject) => {
      const timer = setTimeout(() => { this.pending.delete(id); reject(new Error('CDP timeout: ' + method)); }, 20000);
      this.pending.set(id, { method, accept, reject, timer });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }
  close() { this.ws.close(); }
}

async function evaluate(cdp, fn, ...args) {
  const result = await cdp.send('Runtime.evaluate', {
    expression: '(' + fn.toString() + ')(' + args.map(value => JSON.stringify(value)).join(',') + ')',
    awaitPromise: true, returnByValue: true,
  });
  if (result.exceptionDetails) throw new Error('Browser evaluation failed: ' + JSON.stringify(result.exceptionDetails));
  return result.result.value;
}

async function settled(cdp) {
  await evaluate(cdp, async () => {
    await document.fonts.ready;
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  });
}

async function manifest(directory) {
  const files = {};
  async function walk(path) {
    for (const entry of await readdir(path, { withFileTypes: true })) {
      const full = resolve(path, entry.name);
      if (entry.isDirectory()) await walk(full);
      else if (entry.isFile()) { const bytes = await readFile(full); files[relative(source, full).split(sep).join('/')] = { bytes: bytes.length, sha256: hash(bytes) }; }
      else throw new Error('Dist contains a non-regular file: ' + full);
    }
  }
  await walk(directory);
  const ordered = Object.fromEntries(Object.entries(files).sort(([a], [b]) => a.localeCompare(b)));
  return { sha256: hash(JSON.stringify(ordered)), files: ordered };
}

function mappedPath(pathname) {
  if (pathname.startsWith('/bitcoin-cycle-atlas/')) pathname = pathname.slice('/bitcoin-cycle-atlas'.length);
  const path = resolve(dist, '.' + decodeURIComponent(pathname.endsWith('/') ? pathname + 'index.html' : pathname));
  const rel = relative(dist, path);
  if (rel === '..' || rel.startsWith('..' + sep)) throw new Error('Path escaped dist');
  return path;
}

async function startServer() {
  const mime = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.woff2': 'font/woff2', '.ico': 'image/x-icon' };
  server = createServer(async (request, response) => {
    try {
      const url = new URL(request.url, 'http://localhost');
      const path = mappedPath(url.pathname), name = relative(source, path).split(sep).join('/');
      if (!sourceManifest.files[name]) { response.writeHead(404); response.end('Not found in local dist'); return; }
      const bytes = await readFile(path), digest = hash(bytes);
      assert.equal(digest, sourceManifest.files[name].sha256, 'Source bytes changed during capture: ' + name);
      served.set(name, { path: name, sha256: digest, bytes: bytes.length });
      response.writeHead(200, { 'Content-Type': mime[extname(path)] || 'application/octet-stream', 'Cache-Control': 'no-store', 'X-Atlas-Source-SHA256': digest });
      response.end(bytes);
    } catch (error) { serverErrors.push(String(error)); response.writeHead(500); response.end('Local source server error'); }
  });
  await new Promise((accept, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', accept); });
  origin = 'http://127.0.0.1:' + server.address().port;
  report.origin = origin;
}

async function archiveExpectations() {
  const load = async name => JSON.parse(await readFile(resolve(dist, 'data', name), 'utf8'));
  const [btc, eth, mstr, market] = await Promise.all(['btc-daily.json', 'eth-ohlc.json', 'mstr-ohlc.json', 'market-lab.json'].map(load));
  const result = {};
  const entry = (symbol, file, product, unit, prices) => ({ symbol, file: 'dist/data/' + file, sourceFileSha256: sourceManifest.files['dist/data/' + file].sha256, product, unit, observations: prices.length, first: prices[0], last: prices.at(-1), prices });
  result.BTCUSD = entry('BTCUSD', 'btc-daily.json', 'BTC-USD', 'USD', btc.prices);
  result.ETHUSD = entry('ETHUSD', 'eth-ohlc.json', 'ETH-USD', 'USD', eth.dailyHistory.candles.map(row => [row.date.slice(0, 10), row.close]));
  result.MSTR = entry('MSTR', 'mstr-ohlc.json', 'MSTR', 'USD', mstr.candles.map(row => [row.sessionDate || row.date.slice(0, 10), row.close]));
  for (const [symbol, id] of [['TQQQ', 'tqqq'], ['SOXL', 'soxl'], ['233740', 'kodex-kosdaq150']]) {
    const row = market.markets.find(row => row.id === id);
    assert.ok(row?.prices?.length, symbol + ' source archive is unavailable');
    result[symbol] = { ...entry(symbol, 'market-lab.json', row.symbol, row.unit, row.prices), marketId: id, timezone: row.timezone, sourceId: row.sourceId };
  }
  report.archives = Object.fromEntries(Object.entries(result).map(([symbol, { prices, ...value }]) => [symbol, value]));
  return result;
}

/** DOM-only measurement, intentionally independent of application JS state. */
function readMeasurements() {
  const visible = node => Boolean(node && !node.closest('[hidden],[inert],[aria-hidden="true"]') && node.getClientRects().length && node.ownerDocument.defaultView.getComputedStyle(node).visibility !== 'hidden');
  const frame = [...document.querySelectorAll('.atlas-center-frame')].find(visible);
  const child = frame?.contentDocument;
  const documents = [...(child ? [child] : []), document];
  const find = selector => documents.flatMap(doc => [...doc.querySelectorAll(selector)]).find(visible);
  const text = node => node?.textContent?.replace(/\s+/g, ' ').trim() || '';
  const box = node => {
    if (!node) return null;
    const r = node.getBoundingClientRect(), offset = node.ownerDocument === document ? { left: 0, top: 0 } : frame.getBoundingClientRect();
    return { left: r.left + offset.left, right: r.right + offset.left, top: r.top + offset.top, bottom: r.bottom + offset.top, width: r.width, height: r.height, visible: visible(node), scrollWidth: node.scrollWidth, clientWidth: node.clientWidth };
  };
  const plot = document.querySelector('.atlas-plot');
  const svg = find('#lab-chart,#eth-chart,#equity-chart,.rsi-chart-canvas > svg');
  const pricePath = svg?.querySelector('.observed-close-line,.market-close-line,.rsi-price-line');
  const pathData = pricePath?.getAttribute('d') || '';
  const points = [...pathData.matchAll(/[ML]\s*(-?[\d.e+]+)[,\s]+(-?[\d.e+]+)/gi)].map(match => [Number(match[1]), Number(match[2])]);
  const candleNodes = [...(svg?.querySelectorAll('.observed-candle,.market-candle,[data-candle]') || [])];
  const count = Math.max(Number(svg?.dataset.observedCandleCount || 0), Number(svg?.dataset.observedLineCount || 0), candleNodes.length, svg?.closest('.rsi-chart-canvas') ? points.length : 0);
  const readout = find('.atlas-quote-hud,#lab-metrics,.eth-readout');
  const priceNode = find('.atlas-quote-hud [data-quote-field="price"],#lab-metrics .readout-main > strong,#eth-price,#equity-price,[data-rsi-hud="current-price"],.rsi-price-text');
  const dateNode = find('.atlas-quote-hud [data-quote-field="time"],#lab-metrics .atlas-observation-date,#eth-bar-time,#equity-bar-time,[data-rsi-hud="updated-at"],.rsi-date-text');
  const heading = document.querySelector('.atlas-canvas-heading');
  const dock = svg?.closest('.atlas-plot')?.querySelector('.chart-legend-dock');
  const controlRows = [...(heading?.querySelectorAll('button,select,input') || [])].filter(visible).map(node => ({ id: node.id, label: node.getAttribute('aria-label'), text: node.tagName === 'SELECT' ? text(node.selectedOptions[0]) : text(node), rect: box(node), value: node.value, inDisclosure: Boolean(node.closest('#atlas-shell-features-panel')) }));
  return {
    url: location.href, width: innerWidth, height: innerHeight, boot: document.documentElement.dataset.boot,
    title: document.title, headingText: text(document.getElementById('outlook-heading')),
    owner: plot?.dataset.chartSymbol || null, rootHostSymbol: document.documentElement.dataset.symbol || null,
    centerTool: document.body.dataset.centerTool || null, rootWidth: document.documentElement.scrollWidth, bodyWidth: document.body.scrollWidth,
    plot: box(plot), frame: frame ? { url: frame.src, title: frame.title, status: frame.dataset.centerStatus, loaded: frame.dataset.centerLoaded, rect: box(frame) } : null,
    chart: svg ? { id: svg.id, label: svg.getAttribute('aria-label'), title: text(svg.querySelector('title')), description: text(svg.querySelector('desc')), rect: box(svg), dataset: { ...svg.dataset }, embedded: svg.ownerDocument !== document, observedCount: count, pathCount: svg.querySelectorAll('path[d]').length, observedPath: { className: pricePath?.getAttribute('class') || '', pointCount: points.length, samples: [...new Set([0, Math.floor(points.length / 2), points.length - 1])].filter(index => index >= 0 && index < points.length).map(index => ({ index, point: points[index] })), bytes: pathData.length }, candles: candleNodes.length, latestTag: text(svg.querySelector('.chart-latest-price-tag text,.rsi-price-text')), latestTagTitle: text(svg.querySelector('.market-last-price title')) } : null,
    readout: { text: text(readout), price: text(priceNode), date: text(dateNode), priceRect: box(priceNode), symbolButton: text(document.querySelector('.symbol-selector-trigger')) },
    heading: { rect: box(heading), controls: controlRows, scrollWidth: heading?.scrollWidth, clientWidth: heading?.clientWidth, mode: heading?.dataset.mobileHeading },
    legend: dock ? { rect: box(dock), mode: dock.dataset.legendMode, text: text(dock), entries: [...dock.querySelectorAll('.chart-legend-entry')].filter(visible).map(node => ({ text: text(node), rect: box(node) })) } : null,
    loading: documents.flatMap(doc => [...doc.querySelectorAll('[data-atlas-skeleton]')]).filter(visible).length,
    warnings: documents.flatMap(doc => [...doc.querySelectorAll('.ml-warning,.eth-empty,.center-loading-error')]).filter(visible).map(text),
  };
}

function r0Checks(measured, expected) {
  const chart = measured.chart, symbol = expected.symbol, embedded = ['TQQQ', 'SOXL', '233740'].includes(symbol);
  const label = [measured.title, measured.headingText, chart?.title, chart?.label, measured.readout.symbolButton].join(' ');
  const displayed = Number(measured.readout.price.replace(/,/g, '').match(/-?\d+(?:\.\d+)?/)?.[0]);
  const observedDate = measured.readout.date.replace(/\.\s*/g, '-');
  const checks = {
    ownerMatches: measured.owner === symbol,
    titleMatches: symbol === 'BTCUSD' ? /BTCUSD|BTC-USD|비트코인/.test(label) : symbol === 'ETHUSD' ? /ETHUSD|ETH-USD|Ethereum|이더리움/.test(label) : label.includes(symbol),
    correctRenderer: embedded ? Boolean(chart?.embedded && measured.frame?.title === symbol + ' 가격 차트' && measured.frame?.status === 'ready') : Boolean(chart && !chart.embedded && chart.id === ({ BTCUSD: 'lab-chart', ETHUSD: 'eth-chart', MSTR: 'equity-chart' })[symbol]),
    observedSeries: Boolean(chart?.rect.visible && chart.observedCount > 0 && (chart.observedPath.pointCount > 1 || chart.candles > 0)),
    latestPriceMatchesArchive: Number.isFinite(displayed) && Math.abs(displayed - expected.last[1]) <= .011,
    observedDateMatchesArchive: observedDate.includes(expected.last[0]),
    sourceProductMatches: embedded ? (chart?.title || '').startsWith(symbol + ' ') : symbol === 'BTCUSD' ? chart?.observedPath.className === 'observed-close-line' : chart?.dataset.product === expected.product,
    sourceArchiveLoaded: false,
  };
  const dataIdentity = { expected: { file: expected.file, sha256: expected.sourceFileSha256, product: expected.product, last: expected.last, observations: expected.observations }, displayedPrice: Number.isFinite(displayed) ? displayed : null, displayedDate: measured.readout.date, renderedObservedCount: chart?.observedCount || 0 };
  if (embedded && chart?.observedPath.pointCount) {
    const d = chart.dataset, visible = expected.prices.filter(point => point[0] >= d.start && point[0] <= d.end);
    const left = Number(d.plotLeft), right = Number(d.plotRight), top = Number(d.plotTop), bottom = Number(d.priceBottom), min = Number(d.priceMin), max = Number(d.priceMax);
    const span = Math.max(86400000, Date.parse(d.end) - Date.parse(d.start));
    dataIdentity.visibleArchiveCount = visible.length;
    dataIdentity.pathSamples = chart.observedPath.samples.map(sample => {
      const sourcePoint = visible[sample.index];
      const expectedPoint = sourcePoint ? [left + (Date.parse(sourcePoint[0]) - Date.parse(d.start)) / span * (right - left), bottom - (Math.log(sourcePoint[1]) - Math.log(min)) / (Math.log(max) - Math.log(min)) * (bottom - top)] : null;
      return { ...sample, sourcePoint, expectedPoint, maxErrorPx: expectedPoint ? Math.max(...expectedPoint.map((value, i) => Math.abs(value - sample.point[i]))) : null };
    });
    checks.sourceSeriesGeometryMatches = visible.length === chart.observedPath.pointCount && dataIdentity.pathSamples.every(sample => sample.maxErrorPx !== null && sample.maxErrorPx <= .02);
  }
  return { checks, dataIdentity };
}

const handlers = { R0: { read: readMeasurements, check: r0Checks } };

async function screenshot(cdp, receipt, suffix = 'chart') {
  const capture = await cdp.send('Page.captureScreenshot', { format: 'png', fromSurface: true, captureBeyondViewport: false });
  const bytes = Buffer.from(capture.data, 'base64'), file = receipt.id + '-' + suffix + '.png';
  await writeFile(resolve(out, file), bytes);
  receipt.screenshots.push({ file, bytes: bytes.length, sha256: hash(bytes), width: receipt.width, height: receipt.height });
}

async function runCase(spec, debugBase, expected) {
  const { width, height, symbol } = spec;
  const receipt = { ...spec, id: symbol.toLowerCase() + '-' + width + 'x' + height, status: 'RUNNING', startedAt: new Date().toISOString(), runtimeErrors: [], consoleErrors: [], resourceErrors: [], blockedExternalRequests: [], resources: [], navigations: [], screenshots: [], inputs: [] };
  report.cases.push(receipt);
  let cdp, contextId;
  try {
    ({ browserContextId: contextId } = await browser.send('Target.createBrowserContext'));
    const { targetId } = await browser.send('Target.createTarget', { url: 'about:blank', browserContextId: contextId });
    const target = await until(async () => (await (await fetch(debugBase + '/json/list')).json()).find(target => target.id === targetId && target.webSocketDebuggerUrl), 'page target');
    cdp = await Cdp.connect(target.webSocketDebuggerUrl); receipt.contextId = contextId;
    cdp.on('Runtime.exceptionThrown', event => receipt.runtimeErrors.push(event.exceptionDetails));
    cdp.on('Runtime.consoleAPICalled', event => { if (event.type === 'error') receipt.consoleErrors.push(event.args.map(value => value.description || value.value).join(' ')); });
    cdp.on('Page.frameNavigated', event => { if (!event.frame.parentId) receipt.navigations.push(event.frame.url); });
    cdp.on('Network.responseReceived', event => {
      const response = event.response, url = new URL(response.url);
      if (response.status >= 400) receipt.resourceErrors.push({ url: response.url, status: response.status });
      if (url.origin === origin && response.status === 200) {
        const file = relative(source, mappedPath(url.pathname)).split(sep).join('/');
        receipt.resources.push({ url: response.url, file, status: response.status, sha256: response.headers['X-Atlas-Source-SHA256'] || response.headers['x-atlas-source-sha256'] || null });
      }
    });
    cdp.on('Fetch.requestPaused', event => {
      const url = event.request.url;
      if (/^https?:/.test(url) && new URL(url).origin !== origin) {
        receipt.blockedExternalRequests.push(url);
        void cdp.send('Fetch.failRequest', { requestId: event.requestId, errorReason: 'BlockedByClient' }).catch(() => {});
      } else void cdp.send('Fetch.continueRequest', { requestId: event.requestId }).catch(() => {});
    });
    await cdp.send('Page.enable'); await cdp.send('Runtime.enable'); await cdp.send('Network.enable');
    await cdp.send('Network.setCacheDisabled', { cacheDisabled: true });
    await cdp.send('Fetch.enable', { patterns: [{ urlPattern: '*', requestStage: 'Request' }] });
    await cdp.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false });
    await cdp.send('Emulation.setTouchEmulationEnabled', { enabled: width <= 768, maxTouchPoints: 5 });
    receipt.entryUrl = origin + '/?symbol=' + symbol;
    await cdp.send('Page.navigate', { url: receipt.entryUrl });
    await until(async () => {
      const state = await evaluate(cdp, handlers[item].read); receipt.lastLoadingState = state;
      if (state.boot === 'error') throw new Error('Chart entered explicit boot error');
      return state.boot === 'ready' && state.chart?.rect.visible && state.chart.observedCount > 0 && (!state.frame || state.frame.status === 'ready');
    }, receipt.id + ' ready observed chart', 60000);
    await settled(cdp);
    receipt.measured = await evaluate(cdp, handlers[item].read);
    const { checks, dataIdentity } = handlers[item].check(receipt.measured, expected);
    checks.sourceArchiveLoaded = receipt.resources.some(resource => resource.file === expected.file && resource.sha256 === expected.sourceFileSha256);
    receipt.checks = checks; receipt.dataIdentity = dataIdentity;
    receipt.mismatches = Object.entries(checks).filter(([, passes]) => !passes).map(([name]) => name);
    await screenshot(cdp, receipt);
    delete receipt.lastLoadingState;
    assert.deepEqual(receipt.runtimeErrors, [], 'Unhandled browser exceptions');
    if (phase === 'after') assert.deepEqual(receipt.mismatches, [], 'Deep link does not display its own source-bound instrument');
    receipt.status = phase === 'before' ? 'OBSERVED' : 'PASS';
  } catch (error) {
    receipt.status = 'FAIL'; receipt.error = String(error.stack || error); report.failures.push({ id: receipt.id, error: receipt.error });
    if (cdp) try { receipt.failureState = await evaluate(cdp, handlers[item].read); await screenshot(cdp, receipt, 'failure'); } catch (captureError) { receipt.captureError = String(captureError); }
  } finally {
    cdp?.close(); if (contextId) try { await browser.send('Target.disposeBrowserContext', { browserContextId: contextId }); } catch {}
    receipt.finishedAt = new Date().toISOString();
    await writeFile(resolve(out, 'report.json'), JSON.stringify(report, null, 2) + '\n');
    console.log(JSON.stringify({ id: receipt.id, status: receipt.status, owner: receipt.measured?.owner, mismatches: receipt.mismatches, error: receipt.error?.split('\n')[0] }));
  }
}

try {
  assert.ok(['before', 'after'].includes(phase), '--phase must be before or after');
  assert.ok(handlers[item], 'Unsupported checklist item: ' + item);
  assert.ok(symbols.every(symbol => defaultSymbols.includes(symbol)), 'Unsupported symbol filter');
  assert.ok(viewports.every(v => v.length === 2 && v.every(n => Number.isInteger(n) && n > 0)), 'Invalid --viewports');
  assert.ok(Number(process.versions.node.split('.')[0]) >= 24, 'Node 24 or newer is required');
  await mkdir(out, { recursive: true });
  report.sourceIdentity = { sourceCommit: git(['rev-parse', 'HEAD']), sourceTree: git(['rev-parse', 'HEAD^{tree}']), dirty: Boolean(git(['status', '--porcelain=v1'])), workingChanges: git(['status', '--short']) };
  report.inspector = { file: fileURLToPath(import.meta.url), sha256: hash(await readFile(fileURLToPath(import.meta.url))), node: process.version };
  sourceManifest = await manifest(dist);
  report.sourceIdentity.distTreeSha256 = sourceManifest.sha256;
  await writeFile(resolve(out, 'source-manifest.json'), JSON.stringify(sourceManifest, null, 2) + '\n');
  report.sourceManifest = { file: 'source-manifest.json', fileCount: Object.keys(sourceManifest.files).length, sha256: hash(await readFile(resolve(out, 'source-manifest.json'))) };
  try {
    const publicationBytes = await readFile(resolve(dist, 'publication.json'));
    report.bundledPublication = { ...JSON.parse(publicationBytes), sha256: hash(publicationBytes), role: 'Historical bundled metadata only. Not proof of the local checked-out source or current production deployment.' };
  } catch { report.bundledPublication = null; }
  const expected = await archiveExpectations();
  await startServer();
  const binary = process.env.ATLAS_BROWSER_PATH;
  assert.ok(binary, 'ATLAS_BROWSER_PATH is required. Missing Chrome is blocked, never passed.');
  report.browserBinary = binary;
  report.koreanFonts = execFileSync('fc-list', [':lang=ko'], { encoding: 'utf8' }).trim().split('\n').slice(0, 8);
  assert.ok(report.koreanFonts[0], 'Korean fonts unavailable');
  profile = await mkdtemp(resolve(tmpdir(), 'atlas-checklist-'));
  chrome = spawn(binary, ['--headless=new', '--no-sandbox', '--disable-dev-shm-usage', '--disable-background-networking', '--disable-component-update', '--disable-sync', '--no-first-run', '--no-default-browser-check', '--remote-debugging-port=0', '--user-data-dir=' + profile, 'about:blank'], { stdio: ['ignore', 'ignore', 'pipe'] });
  let spawnError; chrome.on('error', error => { spawnError = error; });
  chrome.stderr.on('data', bytes => { stderr = (stderr + bytes.toString()).slice(-12000); });
  const active = await until(async () => {
    if (spawnError) throw spawnError;
    if (chrome.exitCode !== null || chrome.signalCode !== null) throw new Error('Chrome launch failed: ' + stderr);
    try { return (await readFile(resolve(profile, 'DevToolsActivePort'), 'utf8')).trim().split('\n'); } catch { return null; }
  }, 'Chrome inspector', 20000);
  const debugBase = 'http://127.0.0.1:' + active[0];
  browser = await Cdp.connect('ws://127.0.0.1:' + active[0] + active[1]);
  report.browser = await browser.send('Browser.getVersion');
  for (const [width, height] of viewports) for (const symbol of symbols) await runCase({ symbol, width, height }, debugBase, expected[symbol]);
  const afterManifest = await manifest(dist);
  report.sourceIdentity.afterDistTreeSha256 = afterManifest.sha256;
  assert.equal(afterManifest.sha256, sourceManifest.sha256, 'Dist changed while the browser evidence was captured');
  assert.deepEqual(serverErrors, [], 'Exact local source server reported errors');
  report.status = report.failures.length ? 'FAIL' : phase === 'before' ? 'OBSERVED' : 'PASS';
} catch (error) { report.status = 'FAIL'; report.error = String(error.stack || error); }
finally {
  if (browser) { try { await browser.send('Browser.close'); } catch {} browser.close(); }
  if (chrome?.exitCode === null) { chrome.kill('SIGTERM'); await Promise.race([new Promise(resolve => chrome.once('close', resolve)), delay(1500)]); if (chrome.exitCode === null) chrome.kill('SIGKILL'); }
  if (profile) await rm(profile, { recursive: true, force: true });
  if (server) { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
  report.servedFiles = [...served.values()].sort((a, b) => a.path.localeCompare(b.path));
  report.serverErrors = serverErrors;
  if (stderr) report.chromeStderr = stderr;
  report.finishedAt = new Date().toISOString();
  await mkdir(out, { recursive: true }); await writeFile(resolve(out, 'report.json'), JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify({ status: report.status, item, phase, cases: report.cases.length, failures: report.failures.length, report: resolve(out, 'report.json'), error: report.error?.split('\n')[0] }));
  process.exitCode = report.status === 'FAIL' ? 1 : 0;
}
