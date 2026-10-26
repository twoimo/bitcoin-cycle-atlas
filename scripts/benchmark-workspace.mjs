import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import { createHash } from 'node:crypto';

const before = resolve(process.argv[2]);
const after = resolve(process.argv[3]);
const output = resolve(process.argv[4] || 'build/workspace-benchmark');
const samples = Number(process.env.ATLAS_BENCH_SAMPLES || 5);
assert.ok(Number.isInteger(samples) && samples >= 1);
const { chromium } = await import(process.env.ATLAS_PLAYWRIGHT_MODULE || 'playwright');
const types = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png' };
const roots = { before, after };
const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://localhost');
    const [, side, ...parts] = decodeURIComponent(url.pathname).split('/');
    assert.ok(Object.hasOwn(roots, side));
    const dir = resolve(roots[side], 'dist');
    const file = resolve(dir, parts.join('/') || 'index.html');
    assert.ok(file.startsWith(dir + sep));
    res.setHeader('Content-Type', types[extname(file)] || 'application/octet-stream');
    res.setHeader('Cache-Control', 'no-store');
    res.end(await readFile(file));
  } catch { res.writeHead(404).end(); }
});
await mkdir(output, { recursive: true });
await new Promise(done => server.listen(0, '127.0.0.1', done));
const origin = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({ headless: true, executablePath: process.env.ATLAS_BROWSER_PATH, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
const runs = [];
const scenarios = [{ route: 'data', query: '?page=data' }, { route: 'btc', query: '' }];
async function run(side, route, profile = false) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, deviceScaleFactor: 1 });
  const page = await context.newPage(), errors = [], missing = [];
  const cdp = await context.newCDPSession(page);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
  page.on('pageerror', e => errors.push(e.message));
  page.on('response', response => { if (response.url().startsWith(origin) && response.status() >= 400) missing.push(response.url()); });
  await page.route('**/*', route => route.request().url().startsWith(origin) || /^(data|blob):/.test(route.request().url()) ? route.continue() : route.abort());
  await page.addInitScript(() => {
    window.__workspaceBench = { tasks: [], ready: null, readyFrame: null, states: [], readyCount: 0 };
    try { new PerformanceObserver(list => window.__workspaceBench.tasks.push(...list.getEntries().map(e => ({ start: e.startTime, duration: e.duration })))).observe({ type: 'longtask', buffered: true }); } catch {}
    document.addEventListener('atlas:ready', () => {
      const b = window.__workspaceBench;
      if (b.ready !== null) return;
      b.ready = performance.now();
      requestAnimationFrame(() => requestAnimationFrame(() => { b.readyFrame = performance.now(); }));
    });
    document.addEventListener('atlas:page-ready', () => window.__workspaceBench.readyCount++);
    document.addEventListener('atlas:workbench-state', e => {
      window.__workspaceBench.states.push({ time: performance.now(), scenario: e.detail?.scenario, frequency: e.detail?.frequency });
    });
  });
  if (profile) { await cdp.send('Profiler.enable'); await cdp.send('Profiler.start'); }
  await page.goto(`${origin}/${side}/${route.query}`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.__workspaceBench.readyFrame !== null, undefined, { timeout: 60000 });
  const initial = await page.evaluate(() => ({
    ...window.__workspaceBench,
    symbol: document.documentElement.dataset.symbol,
    boot: document.documentElement.dataset.boot,
    rows: [...document.querySelectorAll('#data-body tr[data-asset-symbol]')].map(row => row.dataset.assetSymbol),
    chartPaths: document.querySelectorAll('#lab-chart path').length,
    scriptResources: performance.getEntriesByType('resource').filter(r => /\.js(?:\?|$)/.test(r.name)).map(r => ({ name: new URL(r.name).pathname.split('/').at(-1), bytes: r.encodedBodySize })),
    scrollWidth: document.documentElement.scrollWidth,
  }));
  assert.equal(initial.boot, 'ready');
  assert.ok(initial.scrollWidth <= 391);
  if (route.route === 'data') { assert.equal(initial.rows.length, 18); assert.equal(initial.rows[0], 'BTC'); }
  else assert.ok(initial.chartPaths > 0);
  let scenario = null;
  if (route.route === 'btc') {
    await page.waitForTimeout(400);
    await page.evaluate(() => { window.__workspaceBench.actionStart = performance.now(); window.__workspaceBench.actionFrame = null; });
    await page.locator('#lab-scenario').evaluate(el => { el.value = 'stress'; el.dispatchEvent(new Event('change', { bubbles: true })); });
    await page.waitForFunction(() => window.__workspaceBench.states.some(s => s.scenario === 'stress' && s.time >= window.__workspaceBench.actionStart), undefined, { timeout: 60000 });
    await page.evaluate(() => new Promise(done => requestAnimationFrame(() => requestAnimationFrame(done))));
    scenario = await page.evaluate(() => ({ duration: performance.now() - window.__workspaceBench.actionStart, tasks: window.__workspaceBench.tasks.filter(t => t.start >= window.__workspaceBench.actionStart), scenario: document.querySelector('#lab-scenario').value, paths: document.querySelectorAll('#lab-chart path').length }));
    assert.equal(scenario.scenario, 'stress'); assert.ok(scenario.paths > 0);
  }
  if (profile) {
    const { profile: result } = await cdp.send('Profiler.stop');
    await writeFile(resolve(output, `${side}-${route.route}.cpuprofile`), JSON.stringify(result));
    const counts = new Map();
    const nodes = new Map(result.nodes.map(n => [n.id, n.callFrame]));
    result.samples.forEach((id, i) => { const f = nodes.get(id), key = `${f.url.split('/').at(-1)}:${f.functionName || '(anonymous)'}`; counts.set(key, (counts.get(key) || 0) + result.timeDeltas[i]); });
    await writeFile(resolve(output, `${side}-${route.route}-profile-summary.json`), JSON.stringify([...counts.entries()].sort((a,b) => b[1] - a[1]).slice(0, 35), null, 2));
  }
  assert.deepEqual(errors, []); assert.deepEqual(missing, []);
  await context.close();
  return { side, route: route.route, initial, scenario, errors, missing };
}
try {
  for (let i = 0; i < samples; i++) for (const route of scenarios) for (const side of ['before', 'after']) {
    const result = await run(side, route); runs.push(result);
    console.log(JSON.stringify({ sample: i + 1, side, route: route.route, readyFrameMs: result.initial.readyFrame, scenarioMs: result.scenario?.duration, scripts: result.initial.scriptResources.length }));
  }
  if (process.env.ATLAS_BENCH_PROFILE === '1') for (const side of ['before', 'after']) for (const route of scenarios) await run(side, route, true);
  const summary = [];
  const stats = values => { const s = values.toSorted((a,b)=>a-b); return { median: s[Math.floor(s.length/2)], min: s[0], max: s.at(-1), samples: s.length }; };
  for (const route of scenarios) for (const side of ['before', 'after']) {
    const r = runs.filter(r => r.side === side && r.route === route.route);
    summary.push({ side, route: route.route, readyFrameMs: stats(r.map(r => r.initial.readyFrame)), scenarioMs: r[0].scenario ? stats(r.map(r => r.scenario.duration)) : null, scriptCount: r[0].initial.scriptResources.length, scriptBytes: r[0].initial.scriptResources.reduce((sum,r) => sum + r.bytes, 0) });
  }
  const hashes = {};
  for (const [side, root] of Object.entries(roots)) for (const name of ['app.js','site-entry.js','lab-view.js','data/btc-daily.json','data/asset-comparison.json']) hashes[`${side}/${name}`] = createHash('sha256').update(await readFile(resolve(root,'dist',name))).digest('hex');
  const report = { baselineCommit: '35300332a629ead03f6f365a32fda4669390f72f', measuredAt: new Date().toISOString(), browser: browser.version(), method: 'Fresh contexts, local static server, external requests blocked, 390x844 touch viewport, 4x CPU throttle, five alternating samples per route; ready event plus two animation frames. Synthetic mobile emulation, not physical-phone or field CWV evidence. Scenario time includes test command round trips.', hashes, samples, summary, runs };
  await writeFile(resolve(output,'report.json'), JSON.stringify(report,null,2));
  console.log(JSON.stringify(summary,null,2));
} finally { await browser.close(); await new Promise(done => server.close(done)); }
