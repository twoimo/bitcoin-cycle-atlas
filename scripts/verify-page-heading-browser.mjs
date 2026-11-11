#!/usr/bin/env node
// Focused H1 paint/geometry regression. Own Chrome/profile/server; no deployment.
import {spawn, execFileSync} from 'node:child_process';
import {createServer} from 'node:http';
import {createHash} from 'node:crypto';
import {mkdtemp, readFile, writeFile, mkdir, rm, stat, realpath} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {extname, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {headlessWindowArgument, verifyHeadlessWindowEnvelope} from './headless-browser-window.mjs';

const root = fileURLToPath(new URL('..', import.meta.url)), site = resolve(root, 'dist');
const argv = process.argv.slice(2), arg = (name, fallback) => argv.includes(name) ? argv[argv.indexOf(name) + 1] : fallback;
const out = resolve(root, arg('--out', 'build/page-heading-browser'));
const baselinePath = arg('--baseline', null), baseline = baselinePath ? JSON.parse(await readFile(resolve(root, baselinePath), 'utf8')) : null;
const bin = process.env.ATLAS_BROWSER_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const prefix = '/bitcoin-cycle-atlas', delay = ms => new Promise(resolve => setTimeout(resolve, ms));
const instruments = ['BTCUSD', 'ETHUSD', 'MSTR', 'BMNR', 'compare'];
const specs = [320, 768, 1440].flatMap(width => instruments.map(instrument => ({id:`${instrument}-${width}`, instrument, width, height:900})));
// Preserve the original 15-case matrix as its own result. R12 also covers the
// adjacent phone width and the dashboard-owned conference heading.
const supplementalSpecs = [
  ...instruments.map(instrument => ({id:`${instrument}-390`, instrument, width:390, height:900})),
  ...[320, 390, 768, 1440].map(width => ({id:`conference-${width}`, instrument:'conference', width, height:900})),
];

class Cdp {
  constructor(ws) {
    this.ws = ws; this.id = 0; this.pending = new Map(); this.listeners = new Map();
    ws.addEventListener('message', event => {
      const message = JSON.parse(String(event.data));
      if (!message.id) { this.listeners.get(message.method)?.(message.params || {}); return; }
      const call = this.pending.get(message.id); if (!call) return;
      this.pending.delete(message.id); clearTimeout(call.timer);
      message.error ? call.reject(new Error(message.error.message)) : call.resolve(message.result || {});
    });
  }
  static async connect(url) {
    const ws = new WebSocket(url);
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('CDP connection timeout')), 15000);
      ws.addEventListener('open', () => { clearTimeout(timer); resolve(); }, {once:true});
      ws.addEventListener('error', () => { clearTimeout(timer); reject(new Error('CDP connection failed')); }, {once:true});
    });
    return new Cdp(ws);
  }
  send(method, params = {}) {
    const id = ++this.id;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { this.pending.delete(id); reject(new Error(`CDP timeout: ${method}`)); }, 30000);
      this.pending.set(id, {resolve, reject, timer}); this.ws.send(JSON.stringify({id, method, params}));
    });
  }
}
async function evaluate(cdp, fn, ...args) {
  const result = await cdp.send('Runtime.evaluate', {expression:`(${fn.toString()})(${args.map(value => JSON.stringify(value)).join(',')})`, awaitPromise:true, returnByValue:true});
  if (result.exceptionDetails) throw new Error(`Browser evaluation: ${JSON.stringify(result.exceptionDetails).slice(0, 400)}`);
  return result.result.value;
}
async function until(fn, label) {
  const deadline = Date.now() + 45000;
  while (Date.now() < deadline) {
    try { const value = await fn(); if (value) return value; }
    catch (error) { if (!/Execution context was destroyed|Cannot find context with specified id/.test(error.message)) throw error; }
    await delay(100);
  }
  throw new Error(`Timed out: ${label}`);
}

function inspectHeading() {
  const rect = node => { if (!node) return null; const r = node.getBoundingClientRect(); return {left:r.left, top:r.top, right:r.right, bottom:r.bottom, width:r.width, height:r.height}; };
  const inBox = (a, b) => Boolean(a && b && a.left >= b.left - .01 && a.top >= b.top - .01 && a.right <= b.right + .01 && a.bottom <= b.bottom + .01);
  const intersects = (a, b) => Boolean(a && b && Math.min(a.right, b.right) > Math.max(a.left, b.left) + .01 && Math.min(a.bottom, b.bottom) > Math.max(a.top, b.top) + .01);
  const textBoxes = node => {
    if (!node) return []; const range = document.createRange(); range.selectNodeContents(node);
    return [...range.getClientRects()].filter(r => r.width > 0 && r.height > 0).map(r => ({left:r.left, top:r.top, right:r.right, bottom:r.bottom, width:r.width, height:r.height}));
  };
  const painted = node => Boolean(node && !node.closest('[hidden],[inert],[aria-hidden="true"]') && node.checkVisibility({checkOpacity:true, checkVisibilityCSS:true}) && rect(node).width > 1 && rect(node).height > 1);
  const heading = document.getElementById('atlas-page-heading'), copy = heading?.parentElement;
  const toolbar = document.querySelector('.atlas-canvas-heading'), plot = document.querySelector('.atlas-plot');
  const allHeadings = [...document.querySelectorAll('h1')], headingBox = rect(heading), glyphs = textBoxes(heading), viewport = {left:0, top:0, right:innerWidth, bottom:innerHeight};
  const style = heading ? getComputedStyle(heading) : null, paintIssues = [];
  let fixedEscape = false;
  for (let node = heading; node; node = node.parentElement) {
    const css = getComputedStyle(node), label = node.id || node.className || node.tagName;
    if (css.display === 'none' || css.visibility === 'hidden' || Number(css.opacity) === 0 || node.hidden || node.inert) paintIssues.push(`hidden ancestor: ${label}`);
    if (css.clipPath !== 'none') paintIssues.push(`clip-path: ${label} ${css.clipPath}`);
    // A fixed overlay escapes ordinary ancestor overflow. Transform/paint
    // containment establishes its containing block and restores clipping.
    if (fixedEscape && (css.transform !== 'none' || css.filter !== 'none' || css.perspective !== 'none' || /paint|strict|content/.test(css.contain))) fixedEscape = false;
    if (!fixedEscape && /(hidden|clip|scroll|auto)/.test(css.overflowX + css.overflowY)) {
      const box = rect(node);
      for (const glyph of glyphs) {
        if (/(hidden|clip|scroll|auto)/.test(css.overflowX) && (glyph.left < box.left - .01 || glyph.right > box.right + .01)) paintIssues.push(`horizontal clipping: ${label}`);
        if (/(hidden|clip|scroll|auto)/.test(css.overflowY) && (glyph.top < box.top - .01 || glyph.bottom > box.bottom + .01)) paintIssues.push(`vertical clipping: ${label}`);
      }
    }
    if (css.position === 'fixed') fixedEscape = true;
  }
  const readout = document.querySelector('.eth-readout,.atlas-quote-hud,.atlas-readout');
  const source = document.querySelector('.eth-readout-source,.workbench-market-info');
  const overlays = [...document.querySelectorAll('.eth-readout,.eth-readout-source,.atlas-quote-hud,.atlas-readout,.workbench-market-info,#chart-indicator-manager,.chart-legend-dock')].filter(painted);
  const symbolButton = toolbar?.querySelector('.symbol-selector-trigger'), buttonStyle = symbolButton && getComputedStyle(symbolButton);
  const symbolLabel = toolbar?.querySelector('.symbol-selector-label');
  const symbolGlyphs = textBoxes(symbolLabel);
  const text = heading?.textContent.trim() || '';
  const duplicates = [...document.querySelectorAll('h1,h2,h3')].filter(node => node !== heading && painted(node) && node.textContent.trim() === text).map(node => node.id || node.tagName);
  const pseudo = toolbar && getComputedStyle(toolbar, '::after');
  if (pseudo && pseudo.display !== 'none' && pseudo.visibility !== 'hidden' && pseudo.content.replace(/^["']|["']$/g, '') === text) duplicates.push('toolbar::after');
  const descriptionId = heading?.getAttribute('aria-describedby'), description = descriptionId && document.getElementById(descriptionId);
  const anchor = toolbar?.querySelector(copy?.dataset.headingPlacement === 'compare' ? '.lab-toolbar' : '.symbol-selector-trigger');
  const anchorBox = rect(anchor), comparison = copy?.dataset.headingPlacement === 'compare';
  const expected = anchorBox && {left:comparison ? anchorBox.left - 76 : anchorBox.left + 4, top:comparison ? anchorBox.top + (anchorBox.height - 14) / 2 : anchorBox.top + 2};
  const notice = document.getElementById('btc-refresh-notice');
  return {
    title:text, h1Count:allHeadings.length, paintedH1Count:allHeadings.filter(painted).length, heading:headingBox, glyphs,
    headingInViewport:inBox(headingBox, viewport), glyphsInViewport:glyphs.length > 0 && glyphs.every(box => inBox(box, viewport)),
    headingInToolbar:inBox(headingBox, rect(toolbar)), glyphsInToolbar:glyphs.length > 0 && glyphs.every(box => inBox(box, rect(toolbar))),
    painted:painted(heading), paintIssues:[...new Set(paintIssues)], color:style?.color, fontSize:style?.fontSize, lineHeight:style?.lineHeight, fontFamily:style?.fontFamily,
    describedBy:descriptionId, description:description?.textContent.trim() || '', descriptionCount:descriptionId ? document.querySelectorAll(`[id="${descriptionId}"]`).length : 0,
    followsToolbar:Boolean(toolbar && toolbar.nextElementSibling === copy), outsidePlot:Boolean(copy && !copy.closest('.atlas-plot')),
    inDashboardHeader:Boolean(copy?.classList.contains('atlas-shell-copy') && copy.closest('.atlas-dashboard-header')),
    placement:{anchor:anchorBox, expected, delta:expected && headingBox ? {left:headingBox.left - expected.left, top:headingBox.top - expected.top} : null},
    layout:{workspace:rect(document.querySelector('.workspace')), stage:rect(document.querySelector('.atlas-chart-stage'))},
    btcRefreshNotice:notice ? {state:notice.dataset.state || null, hidden:notice.hidden, busy:notice.getAttribute('aria-busy') === 'true',
      rect:rect(notice), compareReservedHeight:document.documentElement.style.getPropertyValue('--btc-compare-notice-height')} : null,
    overflow:Math.max(0, document.documentElement.scrollWidth - innerWidth), duplicateTitles:duplicates,
    overlayCollisions:overlays.filter(node => intersects(headingBox, rect(node)) || glyphs.some(box => intersects(box, rect(node)))).map(node => node.id || node.className),
    symbolGlyphs, symbolGlyphsInToolbar:symbolGlyphs.every(box => inBox(box, rect(toolbar)) && inBox(box, viewport)), symbolCollision:glyphs.some(a => symbolGlyphs.some(b => intersects(a, b))),
    symbolButton:rect(symbolButton), symbolButtonStyle:buttonStyle && Object.fromEntries(['height','minHeight','maxHeight','paddingTop','paddingBottom','marginTop','marginBottom','fontSize','lineHeight'].map(key => [key, buttonStyle[key]])),
    pointer:Object.fromEntries(['fine','coarse','none'].map(value => [value, matchMedia(`(pointer:${value})`).matches])),
    geometry:{toolbar:rect(toolbar), plot:rect(plot), bottom:rect(document.querySelector('.workbench-bottom-bar')), readout:painted(readout) ? rect(readout) : null, source:painted(source) ? rect(source) : null},
  };
}

function validate(state, previous, expectedTitle) {
  const failures = [], check = (condition, message) => { if (!condition) failures.push(message); };
  const conference = expectedTitle === '컨퍼런스 복습';
  check(state.h1Count === 1 && state.paintedH1Count === 1 && state.painted, `h1 total=${state.h1Count}, painted=${state.paintedH1Count}`);
  check(state.title === expectedTitle, `unexpected title ${state.title}`);
  check(state.describedBy === 'atlas-page-description' && state.descriptionCount === 1 && state.description.length > 15, 'description connection missing');
  check(state.headingInViewport && state.glyphsInViewport && (conference || state.headingInToolbar && state.glyphsInToolbar), conference ? 'heading/glyphs outside viewport' : 'heading/glyphs outside visible toolbar');
  check(state.paintIssues.length === 0, `heading paint: ${state.paintIssues.join('; ')}`);
  check(state.color !== 'transparent' && !/rgba\([^)]*,\s*0\)/.test(state.color || ''), 'transparent heading text');
  check((conference ? state.inDashboardHeader : state.followsToolbar) && state.outsidePlot, 'heading lost shell ownership');
  if (!conference) check(state.placement.delta && Math.abs(state.placement.delta.left) <= .01 && Math.abs(state.placement.delta.top) <= .01, `stale anchor coordinates: ${JSON.stringify(state.placement.delta)}`);
  check(state.overflow === 0, `horizontal overflow ${state.overflow}px`);
  check(state.duplicateTitles.length === 0, `duplicate titles: ${state.duplicateTitles.join(', ')}`);
  check(state.overlayCollisions.length === 0 && !state.symbolCollision, `text overlap: ${state.overlayCollisions.join(', ')} symbol=${state.symbolCollision}`);
  check(state.symbolGlyphsInToolbar, 'symbol glyphs outside visible toolbar');
  if (previous) {
    check(state.description === previous.description, 'page description changed');
    for (const [name, current] of Object.entries(state.geometry)) {
      const before = previous.geometry[name];
      if (!current || !before) { check(current === before, `${name} visibility changed`); continue; }
      for (const field of ['left','top','width','height']) check(Math.abs(current[field] - before[field]) <= .01, `${name}.${field} ${before[field]} -> ${current[field]}`);
    }
  }
  return failures;
}

async function settledHeading(cdp, label, {waitForBtcRefresh = false} = {}) {
  let last = '', steady = 0, state;
  await until(async () => {
    state = await evaluate(cdp, inspectHeading);
    // The provider request can leave the notice stationary for seconds before
    // completing. Geometry alone must not qualify that transient baseline.
    if (waitForBtcRefresh && (state.btcRefreshNotice?.busy || state.btcRefreshNotice?.state === 'refreshing')) {
      last = ''; steady = 0; return false;
    }
    const key = JSON.stringify([state.geometry, state.heading, state.placement, state.layout, state.btcRefreshNotice]);
    steady = key === last ? steady + 1 : 0; last = key;
    return steady >= 3;
  }, label);
  return state;
}

async function verifyAncestorResize(cdp, spec) {
  const result = {id:`${spec.id}-ancestor-resize`, status:'failed', failures:[]};
  try {
    // Compare readiness precedes the asynchronous BTC refresh. Wait for its
    // terminal notice state and stable geometry before measuring the 72px move.
    result.before = await settledHeading(cdp, `${result.id} before`, {waitForBtcRefresh:true});
    // Change a real layout/scroll owner after initial rendering, without a window
    // resize, synthetic scroll event, or changing the toolbar/anchor dimensions.
    const saved = await evaluate(cdp, () => {
      const owner = document.querySelector('.atlas-chart-stage');
      const original = {value:owner.style.getPropertyValue('max-height'), priority:owner.style.getPropertyPriority('max-height')};
      owner.style.setProperty('max-height', `${owner.getBoundingClientRect().height - 72}px`, 'important');
      return original;
    });
    try {
      result.shifted = await settledHeading(cdp, `${result.id} shifted`);
      for (const [label, before, after] of [
        ['toolbar', result.before.geometry.toolbar, result.shifted.geometry.toolbar],
        ['anchor', result.before.placement.anchor, result.shifted.placement.anchor],
      ]) {
        if (!before || !after) { result.failures.push(`${label} missing`); continue; }
        for (const field of ['width','height']) if (Math.abs(before[field] - after[field]) > .01) result.failures.push(`${label}.${field} changed; invalid regression trigger`);
        if (Math.abs(after.top - before.top + 72) > .01) result.failures.push(`${label} did not move up exactly 72px`);
      }
      result.failures.push(...validate(result.shifted, null, '사이클 비교').map(value => `shifted: ${value}`));
    } catch (error) { result.failures.push(error.stack || String(error)); }
    finally {
      await evaluate(cdp, original => {
        const owner = document.querySelector('.atlas-chart-stage');
        if (original.value) owner.style.setProperty('max-height', original.value, original.priority);
        else owner.style.removeProperty('max-height');
      }, saved);
      result.restored = await settledHeading(cdp, `${result.id} restored`);
      result.failures.push(...validate(result.restored, result.before, '사이클 비교').map(value => `restored: ${value}`));
    }
  } catch (error) { result.failures.push(error.stack || String(error)); }
  result.status = result.failures.length ? 'failed' : 'passed';
  return result;
}

await mkdir(out, {recursive:true});
const report = {schemaVersion:2, kind:'atlas-page-heading-browser', qualifiesFullVerification:false, recordedAt:new Date().toISOString(), testedHead:null, sourceFiles:{}, chrome:null, baseline:baselinePath, cases:[], supplementalCases:[], layoutShiftCases:[], failures:[]};
let server, chrome, profile, browser, cdp;
try {
  report.testedHead = execFileSync('git', ['rev-parse','HEAD'], {cwd:root, encoding:'utf8'}).trim();
  for (const path of [
    'dist/atlas-shell.css', 'dist/ui/page-description.js', 'dist/index.html', 'dist/app.js', 'dist/btc-refresh-status.js',
    'dist/daily-data-view.js', 'dist/daily-data.css',
    'dist/research-reader.js', 'dist/research-reader.css', 'dist/editorial-ledgers.css',
    'dist/relay-room.js', 'dist/relay-room.css', 'scripts/verify-page-heading-browser.mjs',
    'dist/conference/route.js', 'dist/conference/player.js', 'dist/conference/player.css',
  ]) report.sourceFiles[path] = createHash('sha256').update(await readFile(resolve(root, path))).digest('hex');
  const mime = {'.html':'text/html;charset=utf-8','.js':'text/javascript','.json':'application/json','.css':'text/css','.svg':'image/svg+xml','.png':'image/png','.woff2':'font/woff2'};
  server = createServer(async (request, response) => {
    try {
      const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
      if (!pathname.startsWith(prefix + '/')) throw new Error('route');
      let file = resolve(site, '.' + pathname.slice(prefix.length));
      if (!file.startsWith(site + '/')) throw new Error('scope');
      if ((await stat(file)).isDirectory()) file = resolve(file, 'index.html');
      file = await realpath(file); if (!file.startsWith(site + '/')) throw new Error('scope');
      response.writeHead(200, {'content-type':mime[extname(file)] || 'application/octet-stream','cache-control':'no-store'}); response.end(await readFile(file));
    } catch { response.writeHead(404); response.end('not found'); }
  });
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  const base = `http://127.0.0.1:${server.address().port}${prefix}/index.html`;
  profile = await mkdtemp(resolve(tmpdir(), 'atlas-page-heading-'));
  chrome = spawn(bin, ['--headless=new','--disable-gpu','--disable-dev-shm-usage','--disable-background-networking','--no-first-run','--hide-scrollbars',headlessWindowArgument,'--remote-debugging-port=0',`--user-data-dir=${profile}`,'about:blank'], {stdio:['ignore','ignore','pipe']});
  let stderr = '', launchError = null; chrome.stderr.on('data', data => { stderr = (stderr + data).slice(-3000); });
  chrome.once('error', error => { launchError = error; });
  const port = await until(async () => {
    if (launchError) throw launchError;
    try { return (await readFile(resolve(profile, 'DevToolsActivePort'), 'utf8')).trim().split('\n'); }
    catch { if (chrome.exitCode !== null) throw new Error(`Chrome exited: ${stderr}`); return null; }
  }, 'Chrome debugging port');
  browser = await Cdp.connect(`ws://127.0.0.1:${port[0]}${port[1]}`);
  report.chrome = (await browser.send('Browser.getVersion')).product;
  const {targetId} = await browser.send('Target.createTarget', {url:'about:blank'});
  const targets = await (await fetch(`http://127.0.0.1:${port[0]}/json/list`)).json();
  cdp = await Cdp.connect(targets.find(target => target.id === targetId).webSocketDebuggerUrl);
  await cdp.send('Page.enable'); await cdp.send('Runtime.enable');
  report.nativeWindowEnvelope = await verifyHeadlessWindowEnvelope(cdp, {width:1440,height:900});
  let errors = []; cdp.listeners.set('Runtime.exceptionThrown', event => errors.push(event.exceptionDetails?.exception?.description || event.exceptionDetails?.text || 'runtime exception'));
  for (const spec of [...specs, ...supplementalSpecs]) {
    const supplemental = supplementalSpecs.includes(spec);
    const result = {...spec, status:'failed', failures:[]}; (supplemental ? report.supplementalCases : report.cases).push(result); errors = [];
    try {
      await cdp.send('Emulation.setDeviceMetricsOverride', {width:spec.width,height:spec.height,deviceScaleFactor:1,mobile:spec.width <= 620});
      await cdp.send('Page.navigate', {url:base + (spec.instrument === 'conference' ? '?page=conference' : spec.instrument === 'compare' ? '?page=compare&legacy=1&compare-unit=rebased' : `?symbol=${spec.instrument}`)});
      await until(() => evaluate(cdp, instrument => {
        const boot = document.documentElement?.dataset.boot;
        if (boot === 'error') throw new Error('boot error');
        if (boot !== 'ready') return false;
        if (instrument === 'conference') return document.body?.dataset.page === 'conference' && document.querySelector('.conference-player')?.dataset.state === 'empty';
        if (instrument === 'compare') return document.body?.dataset.page === 'compare' && document.querySelectorAll('#structure-periods tr').length > 0;
        if (document.documentElement.dataset.symbol !== instrument || document.body?.dataset.page !== 'outlook') return false;
        const svg = document.querySelector(instrument === 'ETHUSD' ? '#eth-chart' : instrument === 'BTCUSD' ? '#lab-chart' : '#equity-chart');
        return Boolean(svg && (instrument === 'BTCUSD' ? svg.querySelector('path') : Number(svg.dataset.observedCandleCount) > 0));
      }, spec.instrument), `${spec.id} ready data`);
      await evaluate(cdp, async () => { await document.fonts.ready; await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))); });
      // Match a stable rendered frame, including native source/readout placement.
      result.state = await settledHeading(cdp, `${spec.id} geometry settled`);
      const before = baseline?.cases.find(item => item.id === spec.id)?.state;
      if (baseline && !before && !supplemental) result.failures.push('missing baseline case');
      result.failures.push(...validate(result.state, before, spec.instrument === 'conference' ? '컨퍼런스 복습' : spec.instrument === 'compare' ? '사이클 비교' : '가격 차트'), ...errors.map(error => `runtime: ${error}`));
      const shot = await cdp.send('Page.captureScreenshot', {format:'png',fromSurface:true,captureBeyondViewport:false});
      const bytes = Buffer.from(shot.data, 'base64'); result.screenshot = {file:`${spec.id}.png`,sha256:createHash('sha256').update(bytes).digest('hex'),bytes:bytes.length};
      await writeFile(resolve(out, result.screenshot.file), bytes);
      result.status = result.failures.length ? 'failed' : 'passed';
      if (spec.instrument === 'compare' && spec.width <= 390) {
        const shifted = await verifyAncestorResize(cdp, spec);
        report.layoutShiftCases.push(shifted);
        report.failures.push(...shifted.failures.map(message => `${shifted.id}: ${message}`));
        console.log(JSON.stringify({id:shifted.id,status:shifted.status,failures:shifted.failures}));
      }
    } catch (error) { result.status = 'failed'; result.failures.push(error.stack || String(error)); }
    report.failures.push(...result.failures.map(message => `${spec.id}: ${message}`));
    console.log(JSON.stringify({id:result.id,status:result.status,failures:result.failures}));
  }
} catch (error) { report.failures.push(`harness: ${error.stack || error}`); }
finally {
  cdp?.ws.close(); browser?.ws.close(); chrome?.kill('SIGKILL');
  if (server) await new Promise(resolve => server.close(resolve));
  if (profile) await rm(profile, {recursive:true,force:true}).catch(() => {});
  report.status = report.cases.length === specs.length && report.supplementalCases.length === supplementalSpecs.length && report.layoutShiftCases.length === 2 && report.failures.length === 0 ? 'passed' : 'failed';
  report.counts = Object.fromEntries(['cases','supplementalCases','layoutShiftCases'].map(key => [key, {total:report[key].length,passed:report[key].filter(item => item.status === 'passed').length}]));
  await writeFile(resolve(out, 'report.json'), JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify({status:report.status,cases:report.cases.length,passed:report.counts.cases.passed,supplemental:report.counts.supplementalCases,layoutShifts:report.counts.layoutShiftCases,failures:report.failures.length,out}));
  if (report.status !== 'passed') process.exitCode = 1;
}
