#!/usr/bin/env node
/**
 * WP-C compare-shell browser acceptance: route inventory (C-1b), viewport
 * contract 320-1920 (C-5), and real user input (C-1..C-4, C-6).
 *
 * Own headless Chrome, own temp profile, own loopback static server. Writes
 * only to --out. Focused compare/shell probe: does not qualify full CI, build,
 * deployment or release.
 */
import { spawn, execFileSync } from 'node:child_process';
import { headlessWindowArgument, verifyHeadlessWindowEnvelope } from './headless-browser-window.mjs';
import { createServer } from 'node:http';
import { mkdtemp, readFile, writeFile, mkdir, rm, stat, realpath } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { extname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const argv = process.argv.slice(2);
const arg = (key, fallback) => { const i = argv.indexOf(key); return i < 0 ? fallback : argv[i + 1]; };
const BIN = process.env.ATLAS_BROWSER_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const OUT = resolve(root, arg('--out', 'build/wp-c-compare-shell'));
const SITE = resolve(root, 'dist');
const PREFIX = '/bitcoin-cycle-atlas';
const sleep = ms => new Promise(r => setTimeout(r, ms));

const viewports = [[320, 740], [390, 844], [456, 900], [620, 900], [768, 1024], [1024, 768], [1280, 800], [1440, 900], [1920, 1080]];
const phoneMax = 620, tabletMax = 959;

const routes = [
  ['outlook', 'index.html?page=outlook', 'page'],
  ['market-us', 'market-lab/us/index.html', 'page'],
  ['market-kr', 'market-lab/kr/index.html', 'page'],
  ['scenario', 'market-lab/scenario/index.html', 'page'],
  ['cashflow', 'market-lab/cashflow/index.html', 'page'],
  ['rsi', 'market-lab/rsi/index.html', 'page'],
  ['housing', 'market-lab/housing/index.html', 'page'],
  ['themes', 'market-lab/themes/index.html', 'page'],
  ['evidence', 'index.html?page=evidence', 'page'],
  ['data', 'index.html?page=data', 'page'],
  ['ipo', 'index.html?page=ipo', 'page'],
  ['relay', 'index.html?page=relay', 'page'],
  ['compare+legacy', 'index.html?page=compare&legacy=1&compare-unit=rebased', 'compare'],
  ['compare+bare', 'index.html?page=compare', 'compare'],
  ['compare+legacy-unit-alias', 'index.html?page=compare&legacy=1&unit=indexed', 'compare'],
].map(([route, url, kind]) => ({ route, url, kind }));

class Cdp {
  constructor(ws) {
    this.ws = ws; this.id = 0; this.pending = new Map(); this.handlers = new Map();
    ws.addEventListener('message', e => {
      const m = JSON.parse(String(e.data));
      if (m.method) { const h = this.handlers.get(m.method); if (h) h(m.params || {}); return; }
      const h = this.pending.get(m.id); if (!h) return; this.pending.delete(m.id);
      m.error ? h.reject(new Error(m.error.message)) : h.resolve(m.result || {});
    });
  }
  static async connect(url) {
    const ws = new WebSocket(url);
    await new Promise((ok, no) => { const t = setTimeout(() => no(new Error('CDP timeout')), 15000); ws.addEventListener('open', () => { clearTimeout(t); ok(); }, { once: true }); ws.addEventListener('error', () => { clearTimeout(t); no(new Error('CDP failed')); }, { once: true }); });
    return new Cdp(ws);
  }
  on(name, fn) { this.handlers.set(name, fn); }
  send(method, params = {}) {
    const id = ++this.id;
    return new Promise((res, rej) => {
      const timer = setTimeout(() => { this.pending.delete(id); rej(new Error('CDP timeout: ' + method)); }, 30000);
      this.pending.set(id, { resolve: v => { clearTimeout(timer); res(v); }, reject: e => { clearTimeout(timer); rej(e); } });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }
}

const evaluate = async (cdp, fn, ...args) => {
  const run = () => cdp.send('Runtime.evaluate', { expression: `(${fn.toString()})(${args.map(a => JSON.stringify(a)).join(',')})`, awaitPromise: true, returnByValue: true });
  let r;
  try { r = await run(); } catch (first) { await sleep(700); r = await run(); }
  if (r.exceptionDetails) throw new Error('eval failed: ' + JSON.stringify(r.exceptionDetails).slice(0, 400));
  return r.result.value;
};

const readState = () => {
  const painted = n => {
    if (!n) return false;
    if (n.closest('[hidden],[inert]')) return false;
    if (n.getAttribute('aria-hidden') === 'true') return false;
    const cs = getComputedStyle(n);
    if (cs.display === 'none' || cs.visibility === 'hidden') return false;
    const r = n.getBoundingClientRect();
    return r.width > 1 && r.height > 1;
  };
  const box = n => { if (!n) return null; const r = n.getBoundingClientRect(); return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) }; };
  const exists = sel => Boolean(document.querySelector(sel));
  const show = sel => { const n = document.querySelector(sel); return n ? (painted(n) ? 'visible' : 'collapsed') : 'absent'; };
  const headings = [...document.querySelectorAll('h1')].filter(n => painted(n)).map(n => ({ id: n.id || null, text: n.textContent.trim().slice(0, 40), parent: n.parentElement?.className || n.parentElement?.tagName || null }));
  const compare = document.querySelector('#compare-view');
  const duplicates = ['atlas-page-heading', 'compare-view', 'structure-chart', 'cycle-chart', 'structure-scope'].filter(id => document.querySelectorAll('#' + id).length > 1);
  const MAJOR = '.atlas-canvas-heading button,.atlas-canvas-heading select,.workbench-rail button,.workbench-rail select,.workbench-tools button,.workbench-bottom-bar button,.workbench-bottom-bar select,.atlas-sidebar button,.atlas-sidebar-toggle,#compare-view button,#compare-view select,dialog button,.chart-replay-controls button';
  const interactive = [...document.querySelectorAll(MAJOR)]
    .filter(n => painted(n) && !n.disabled)
    .map(n => ({ name: (n.getAttribute('aria-label') || n.textContent || n.id || '').trim().slice(0, 30), ...box(n) }));
  const tiny = interactive.filter(n => n.w < 44 || n.h < 44);
  const othersSmall = [...document.querySelectorAll('button,select,a[href],input')]
    .filter(n => painted(n) && !n.disabled && !n.matches(MAJOR))
    .map(n => ({ name: (n.getAttribute('aria-label') || n.textContent || n.id || '').trim().slice(0, 26), ...box(n) }))
    .filter(n => n.w < 44 || n.h < 44);
  const covered = interactive.filter(item => {
    const n = document.elementFromPoint(item.x + item.w / 2, item.y + item.h / 2);
    return !n || !(n === document.elementFromPoint(item.x + item.w / 2, item.y + item.h / 2));
  });
  const centers = interactive.map(item => ({ name: item.name, x: item.x + item.w / 2, y: item.y + item.h / 2 }));
  const coveredControls = centers.filter(c => {
    if (c.y < 0 || c.y > innerHeight || c.x < 0 || c.x > innerWidth) return false;
    const hit = document.elementFromPoint(c.x, c.y);
    const target = interactive.find(i => i.name === c.name);
    return !hit || hit === document.documentElement || hit === document.body;
  });
  const heading = document.querySelector('.atlas-canvas-heading');
  return {
    href: location.href, search: location.search, title: document.title,
    shell: document.body?.dataset.shell || null, page: document.body?.dataset.page || null,
    boot: document.documentElement?.dataset.boot || null,
    regions: { top: show('.atlas-canvas-heading'), left: show('.atlas-sidebar'), right: show('.workbench-rail'), bottom: show('.workbench-bottom-bar') },
    present: {
      top: exists('.atlas-canvas-heading'), left: exists('.atlas-sidebar'), right: exists('.workbench-rail'),
      bottom: exists('.workbench-bottom-bar'), pageHeading: exists('#atlas-page-heading'),
    },
    headings, duplicates,
    compare: {
      exists: Boolean(compare), visible: compare ? painted(compare) : false, hidden: compare ? Boolean(compare.hidden) : null,
      parent: compare?.parentElement ? (compare.parentElement.id || compare.parentElement.className || compare.parentElement.tagName) : null,
      rows: compare ? compare.querySelectorAll('tbody tr').length : 0,
      unitPressed: [...document.querySelectorAll('#compare-view [data-unit], .chart-toolbar [data-unit]')].filter(b => b.getAttribute('aria-pressed') === 'true').map(b => b.dataset.unit),
      structureChart: Boolean(document.querySelector('#structure-chart')),
      structureRows: document.querySelectorAll('#structure-periods tr').length,
    },
    heading: heading ? { ...box(heading), dock: heading.dataset.mobileHeading || null } : null,
    docWidth: document.documentElement.scrollWidth, winWidth: innerWidth,
    overflow: Math.max(0, (document.documentElement.scrollWidth || 0) - innerWidth),
    docHeight: document.documentElement.scrollHeight, bodyHeight: document.body?.scrollHeight || 0,
    dockInViewport: (() => { const n = document.querySelector('.atlas-canvas-heading'); if (!n) return null; const r = n.getBoundingClientRect(); return r.top >= 0 && r.bottom <= innerHeight + 1; })(),
    coveredCount: coveredControls.length, coveredSample: coveredControls.slice(0, 4).map(c => c.name),
    coveredNote: 'advisory center hit-test only; not a clipping proof',
    tinyCount: tiny.length, tinySample: tiny.slice(0, 6), interactiveCount: interactive.length,
    otherSmallCount: othersSmall.length, otherSmallSample: othersSmall.slice(0, 6),
    sidebarToggle: painted(document.querySelector('.atlas-sidebar-toggle')),
  };
};

const staticServer = async () => {
  const mime = { '.html': 'text/html;charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.png': 'image/png', '.webp': 'image/webp', '.jpg': 'image/jpeg', '.map': 'application/json' };
  const server = createServer(async (req, res) => {
    try {
      const p = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
      if (!p.startsWith(PREFIX + '/')) throw new Error('route');
      let f = resolve(SITE, '.' + p.slice(PREFIX.length));
      if (f !== SITE && !f.startsWith(SITE + '/')) throw new Error('scope');
      if ((await stat(f)).isDirectory()) f = resolve(f, 'index.html');
      f = await realpath(f);
      if (!f.startsWith(SITE + '/')) throw new Error('scope');
      const body = await readFile(f);
      res.writeHead(200, { 'content-type': mime[extname(f)] || 'application/octet-stream', 'cache-control': 'no-store' });
      res.end(body);
    } catch { res.writeHead(404); res.end('not found'); }
  });
  await new Promise(ok => server.listen(0, '127.0.0.1', ok));
  return { server, base: `http://127.0.0.1:${server.address().port}${PREFIX}/` };
};

const main = async () => {
  await mkdir(OUT, { recursive: true });
  const { server, base } = await staticServer();
  const profile = await mkdtemp(resolve(tmpdir(), 'atlas-wpc-shell-'));
  const chrome = spawn(BIN, ['--headless=new', '--disable-gpu', '--disable-dev-shm-usage', '--disable-background-networking', '--no-first-run', '--hide-scrollbars', headlessWindowArgument, '--remote-debugging-port=0', '--user-data-dir=' + profile, 'about:blank'], { stdio: ['ignore', 'ignore', 'pipe'], env: { ...process.env, PATH: `/opt/homebrew/bin:${process.env.PATH}` } });
  let stderr = '';
  chrome.stderr.on('data', b => { stderr = (stderr + b).slice(-4000); });
  const report = {
    schemaVersion: 1, kind: 'atlas-wp-c-compare-shell-browser', qualifiesFullVerification: false,
    scope: 'Route inventory (C-1b), viewport contract 320-1920 (C-5), real user input for the compare route (C-1, C-2, C-3, C-4, C-6) in isolated headless Chrome. No build, deploy or release claim.',
    testedHead: null, chrome: null, base, recordedAt: new Date().toISOString(),
    inventory: [], widths: [], interactions: {}, failures: [], findings: [], assertions: {},
  };
  let failed = 0;
  const fail = (where, message) => { failed++; report.failures.push(`${where}: ${message}`); };

  try {
    report.testedHead = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();
    let port = null;
    for (let i = 0; i < 140; i++) {
      try { const t = (await readFile(resolve(profile, 'DevToolsActivePort'), 'utf8')).trim().split('\n'); if (t[0]) { port = t; break; } } catch { }
      await sleep(150);
    }
    if (!port) throw new Error('no debugging port: ' + stderr);
    const browser = await Cdp.connect(`ws://127.0.0.1:${port[0]}${port[1]}`);
    report.chrome = (await browser.send('Browser.getVersion')).product;
    const { targetId } = await browser.send('Target.createTarget', { url: 'about:blank' });
    const list = await (await fetch(`http://127.0.0.1:${port[0]}/json/list`)).json();
    const cdp = await Cdp.connect(list.find(t => t.id === targetId).webSocketDebuggerUrl);
    await cdp.send('Page.enable'); await cdp.send('Runtime.enable'); await cdp.send('Log.enable');
    // Verified before the first emulation: the phone-to-1920 journey must fit in
    // the native client, not only in the emulated viewport.
    report.nativeWindowEnvelope = await verifyHeadlessWindowEnvelope(cdp, { width: 1920, height: 1080 });
    let errors = [];
    cdp.on('Runtime.exceptionThrown', p => errors.push('EXC ' + String(p.exceptionDetails?.exception?.description || p.exceptionDetails?.text).slice(0, 200)));
    cdp.on('Runtime.consoleAPICalled', p => { if (p.type === 'error') errors.push('console ' + p.args.map(a => a.value ?? a.description ?? '').join(' ').slice(0, 200)); });
    cdp.on('Log.entryAdded', p => { if (p.entry.level === 'error') errors.push('log ' + String(p.entry.text).slice(0, 200)); });

    const setViewport = (w, h) => cdp.send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile: w <= phoneMax });
    const boot = async () => {
      for (let i = 0; i < 90; i++) {
        const v = await cdp.send('Runtime.evaluate', { expression: 'document.documentElement.dataset.boot', returnByValue: true });
        if (['ready', 'error'].includes(v.result.value)) return v.result.value;
        await sleep(300);
      }
      return 'timeout';
    };
    const goto = async (path, w, h) => {
      await setViewport(w, h); errors = [];
      await cdp.send('Page.navigate', { url: base + path });
      const state = await boot();
      await evaluate(cdp, async () => { await document.fonts.ready; await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))); });
      await sleep(600);
      return state;
    };


    // Reach the control with real wheel input inside its scroll owners instead of
    // assigning scrollTop. A synthetic assignment proves layout, not that a user
    // can scroll the control into reach; the wheel deltas are recorded as evidence.
    const scrollOwners = async selector => evaluate(cdp, sel => {
      const n = document.querySelector(sel);
      if (!n) return { found: false, owners: [] };
      const owners = [];
      let x = n.parentElement;
      while (x && x !== document.documentElement) {
        const cs = getComputedStyle(x);
        if (/(auto|scroll)/.test(cs.overflowY) && x.scrollHeight > x.clientHeight + 4) {
          const r = x.getBoundingClientRect();
          owners.push({ index: owners.length, tag: x.tagName, id: x.id || null,
            point: [Math.round(r.left + r.width / 2), Math.round(Math.max(r.top, 0) + Math.min(r.height, innerHeight) / 2)],
            scrollTop: Math.round(x.scrollTop), maxScroll: Math.round(x.scrollHeight - x.clientHeight) });
        }
        x = x.parentElement;
      }
      const r = n.getBoundingClientRect();
      return { found: true, owners, rect: [Math.round(r.x), Math.round(r.y), Math.round(r.width), Math.round(r.height)],
        inViewport: r.top >= 0 && r.left >= 0 && r.bottom <= innerHeight && r.right <= innerWidth };
    }, selector);
    const revealInOwners = async selector => {
      const discovered = await scrollOwners(selector);
      const wheel = [];
      for (let attempt = 0; attempt < 24 && discovered.owners.length; attempt++) {
        const state = await scrollOwners(selector);
        if (!state.found) return { found: false, wheel };
        if (state.inViewport) return { found: true, wheel, rect: state.rect, owners: state.owners };
        const owner = state.owners[0];
        const target = await evaluate(cdp, sel => {
          const n = document.querySelector(sel);
          const r = n.getBoundingClientRect();
          return { top: r.top, bottom: r.bottom, vh: innerHeight };
        }, selector);
        const delta = target.top < 0 ? Math.max(-480, target.top - 40) : Math.min(480, target.bottom - target.vh + 40);
        if (!delta) return { found: true, wheel, rect: state.rect, owners: state.owners };
        for (const type of ['mouseMoved', 'mouseWheel'])
          await cdp.send('Input.dispatchMouseEvent', { type, x: owner.point[0], y: owner.point[1], deltaX: 0, deltaY: type === 'mouseWheel' ? delta : 0 }).catch(() => { });
        await sleep(160);
        wheel.push({ owner: owner.id || owner.tag, deltaY: Math.round(delta) });
      }
      const final = await scrollOwners(selector);
      return { found: final.found, wheel, rect: final.rect, owners: final.owners, reached: Boolean(final.inViewport) };
    };

    const domClick = async selector => {
      await revealInOwners(selector);
      await sleep(200);
      const { root: domRoot } = await cdp.send('DOM.getDocument', { depth: -1 });
      const { nodeId } = await cdp.send('DOM.querySelector', { nodeId: domRoot.nodeId, selector });
      if (!nodeId) return { ok: false, reason: 'not found' };
      await cdp.send('DOM.scrollIntoViewIfNeeded', { nodeId }).catch(() => { });
      await sleep(300);
      const model = await cdp.send('DOM.getBoxModel', { nodeId }).catch(() => null);
      if (!model?.model) return { ok: false, reason: 'no box model' };
      const q = model.model.content;
      const x = (q[0] + q[2] + q[4] + q[6]) / 4, y = (q[1] + q[3] + q[5] + q[7]) / 4;
      const hit = await evaluate(cdp, (x, y, sel) => {
        const n = document.elementFromPoint(x, y), t = document.querySelector(sel);
        // The hit must be the control or a descendant of it. Accepting an ancestor
        // let a covered control pass because the wrapper received the click.
        return { tag: n?.tagName || null, id: n?.id || null, inside: Boolean(t && n && (n === t || t.contains(n))) };
      }, x, y, selector);
      if (!hit || !hit.inside) return { ok: false, reason: 'unreachable point', x: Math.round(x), y: Math.round(y), hit };
      for (const type of ['mousePressed', 'mouseReleased']) await cdp.send('Input.dispatchMouseEvent', { type, x, y, button: 'left', clickCount: 1 });
      return { ok: true, x: Math.round(x), y: Math.round(y), hit };
    };


    if (arg('--probe', null)) {
      const sel = arg('--probe', null);
      const vpw = Number(arg('--probe-w', '1440')), vph = Number(arg('--probe-h', '900'));
      await goto(arg('--probe-url', 'index.html?page=compare&legacy=1&compare-unit=rebased'), vpw, vph);
      const preClick = arg('--probe-click', null);
      const clickReceipt = preClick ? await domClick(preClick) : null;
      if (preClick) await sleep(900);
      const reveal = await revealInOwners(sel);
      const info = await evaluate(cdp, sel => {
        const n = document.querySelector(sel);
        if (!n) return { found: false };
        const chain = [];
        for (let x = n; x && chain.length < 8; x = x.parentElement) {
          const r = x.getBoundingClientRect(), cs = getComputedStyle(x);
          chain.push({ tag: x.tagName, id: x.id || null, cls: String(x.className || '').slice(0, 60), rect: [Math.round(r.x), Math.round(r.y), Math.round(r.width), Math.round(r.height)], overflow: cs.overflow + '/' + cs.overflowY, position: cs.position, display: cs.display });
        }
        const r = n.getBoundingClientRect();
        const cx = r.x + r.width / 2, cy = r.y + r.height / 2;
        const hit = document.elementFromPoint(cx, cy);
        return {
          found: true, inTopDocument: n.ownerDocument === document,
          rect: [Math.round(r.x), Math.round(r.y), Math.round(r.width), Math.round(r.height)],
          center: [Math.round(cx), Math.round(cy)], viewport: [innerWidth, innerHeight],
          scrollY: scrollY, hit: hit ? { tag: hit.tagName, id: hit.id, cls: String(hit.className || '').slice(0, 40), inside: hit === n || n.contains(hit) || hit.contains(n) } : null,
          chain,
          allUnits: [...document.querySelectorAll('[data-unit]')].map(b => ({ unit: b.dataset.unit, pressed: b.getAttribute('aria-pressed'), rect: (() => { const q = b.getBoundingClientRect(); return [Math.round(q.x), Math.round(q.y), Math.round(q.width), Math.round(q.height)]; })() })),
        };
      }, sel);
      info.clickReceipt = clickReceipt; info.reveal = reveal;
      info.diag = await evaluate(cdp, () => {
        const rect = n => { if (!n) return null; const r = n.getBoundingClientRect(); return [Math.round(r.x), Math.round(r.y), Math.round(r.width), Math.round(r.height)]; };
        const heads = [...document.querySelectorAll('.atlas-canvas-heading')].map(n => ({ rect: rect(n), dock: n.dataset.mobileHeading || null, parent: n.parentElement?.className || n.parentElement?.tagName, buttons: n.querySelectorAll('button').length }));
        const toggle = document.querySelector('#mobile-details-toggle');
        const details = document.querySelector('#mobile-chart-details');
        const navs = [...document.querySelectorAll('#mobile-chart-details [data-view], .atlas-nav [data-view]')].map(n => ({ view: n.dataset.view, rect: rect(n), visible: n.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true }) }));
        const before = { scrollY, docH: document.documentElement.scrollHeight, bodyH: document.body.scrollHeight, innerH: innerHeight, bodyOverflow: getComputedStyle(document.body).overflow, htmlOverflow: getComputedStyle(document.documentElement).overflow };
        window.scrollTo(0, 400);
        const afterScroll = { scrollY, toggleRect: rect(document.querySelector('#mobile-details-toggle')) };
        const home = document.querySelector('#mobile-chart-home');
        const homeInfo = home ? { rect: rect(home), visible: home.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true }), label: home.getAttribute('aria-label'), parent: home.parentElement?.className || home.parentElement?.tagName, inHeading: Boolean(home.closest('.atlas-canvas-heading')), disabled: Boolean(home.disabled) } : null;
        return { homeInfo, before, afterScroll, heads, detailsToggle: toggle ? { rect: rect(toggle), visible: toggle.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true }), label: toggle.getAttribute('aria-label') } : null, details: details ? { rect: rect(details), open: details.dataset.mobileOpen || null } : null, navs: navs.slice(0, 8), bodyShell: document.body.dataset.shell, page: document.body.dataset.page };
      });
      info.headingChildren = await evaluate(cdp, () => [...(document.querySelector('.atlas-canvas-heading')?.children || [])].map(n => ({ tag: n.tagName, id: n.id || null, aria: n.getAttribute('aria-label'), controls: n.getAttribute('aria-controls'), expanded: n.getAttribute('aria-expanded'), cls: String(n.className || '').slice(0, 26), rect: (() => { const r = n.getBoundingClientRect(); return [Math.round(r.x), Math.round(r.y), Math.round(r.width), Math.round(r.height)]; })() })));
      info.sidebarState = await evaluate(cdp, () => { const sb = document.querySelector('.atlas-sidebar'); return sb ? { open: sb.dataset.mobileOpen || null, inert: sb.hasAttribute('inert'), ariaHidden: sb.getAttribute('aria-hidden'), rect: (() => { const r = sb.getBoundingClientRect(); return [Math.round(r.x), Math.round(r.y), Math.round(r.width), Math.round(r.height)]; })() } : null; });
      await writeFile(resolve(OUT, 'probe.json'), JSON.stringify(info, null, 2) + '\n');
      console.log(JSON.stringify(info, null, 1));
      chrome.kill('SIGKILL'); server.close(); await rm(profile, { recursive: true, force: true }).catch(() => { });
      return;
    }

    // Phase A: route inventory at 1440x900
    for (const item of routes) {
      const bootState = await goto(item.url, 1440, 900);
      const state = await evaluate(cdp, readState);
      const entry = { route: item.route, url: item.url, ...state, bootState, errors: [...errors] };
      report.inventory.push(entry);
      const where = 'inventory ' + item.route;
      if (bootState !== 'ready') fail(where, 'boot ' + bootState);
      // Every registered route owns the same four perimeter regions. A content
      // route keeps its page header, sidebar, page information rail and source
      // bar; the price-chart frame keeps the chart toolbar and its own rails.
      entry.shellRegions = state.regions;
      for (const key of ['top', 'left', 'right', 'bottom']) if (!state.present[key]) fail(where, `missing shell region ${key}`);
      if (!state.present.pageHeading) fail(where, 'missing #atlas-page-heading');
      if (state.headings.length !== 1) fail(where, `visible h1 count ${state.headings.length} (${state.headings.map(h => h.id || h.text).join(' | ')})`);
      if (state.duplicates.length) fail(where, 'duplicate ids: ' + state.duplicates.join(','));
      if (state.overflow > 1) fail(where, `horizontal overflow ${state.overflow}px`);
      if (errors.length) fail(where, 'console/runtime errors: ' + errors.slice(0, 2).join(' | '));
      if (item.kind === 'compare') {
        if (!state.compare.visible) fail(where, 'compare view not visible');
        if (!state.compare.structureChart) fail(where, 'structure chart missing');
        if (state.compare.rows < 1) fail(where, 'compare rows 0');
        if (state.page !== 'compare') fail(where, 'body data-page=' + state.page);
      }
      if (item.route === 'compare+legacy' && !state.compare.unitPressed.includes('rebased')) fail(where, 'compare-unit=rebased not applied: ' + state.compare.unitPressed.join(','));
      if (item.route === 'compare+legacy-unit-alias' && !state.compare.unitPressed.includes('indexed')) fail(where, 'legacy unit alias not applied: ' + state.compare.unitPressed.join(','));
      if (item.route === 'outlook' && state.compare.visible) fail(where, 'compare view visible on outlook route');
    }

    // Phase B: width contract for the legacy compare route
    for (const [w, h] of viewports) {
      const bootState = await goto('index.html?page=compare&legacy=1&compare-unit=rebased', w, h);
      const state = await evaluate(cdp, readState);
      report.widths.push({
        viewport: `${w}x${h}`, klass: w <= phoneMax ? 'phone' : w <= tabletMax ? 'tablet' : 'desktop',
        boot: bootState, dock: state.heading?.dock || null, headingHeight: state.heading?.h ?? null,
        regions: state.regions, present: state.present, overflow: state.overflow,
        rows: state.compare.rows, structureRows: state.compare.structureRows, unitPressed: state.compare.unitPressed,
        tiny: state.tinyCount, tinySample: state.tinySample, interactive: state.interactiveCount,
        covered: state.coveredCount, coveredSample: state.coveredSample,
        docHeight: state.docHeight, bodyHeight: state.bodyHeight, dockInViewport: state.dockInViewport, errors: [...errors],
      });
      const where = `width ${w}x${h}`;
      if (bootState !== 'ready') fail(where, 'boot ' + bootState);
      if (state.overflow > 1) fail(where, `horizontal overflow ${state.overflow}px`);
      if (!state.compare.visible) fail(where, 'compare view not visible');
      if (state.compare.rows < 1) fail(where, 'compare rows 0');
      if (state.duplicates.length) fail(where, 'duplicate ids ' + state.duplicates.join(','));
      if (state.regions.top !== 'visible') fail(where, 'top region ' + state.regions.top);
      if (state.headings.length !== 1) fail(where, `visible h1 count ${state.headings.length}`);
      if (w <= phoneMax) {
        if (state.heading?.dock !== 'phone-dock') fail(where, 'phone dock missing (dock=' + state.heading?.dock + ')');
        if (state.tinyCount) fail(where, `${state.tinyCount} interactive targets below 44px: ` + state.tinySample.map(t => `${t.name} ${t.w}x${t.h}`).join('; '));
      }
      if (w > phoneMax && w <= tabletMax && state.regions.right !== 'visible') fail(where, 'right region ' + state.regions.right);
      if (w >= 960 && (state.regions.left !== 'visible' || state.regions.right !== 'visible' || state.regions.bottom !== 'visible')) fail(where, 'shell region collapsed: ' + JSON.stringify(state.regions));
      if (w === 1920) report.assertions.explicit1920 = { viewport: `${w}x${h}`, overflow: state.overflow, regions: state.regions, resultRows: state.compare.rows, structureRows: state.compare.structureRows, dock: state.heading?.dock ?? null, headingHeight: state.heading?.h ?? null, tiny: state.tinyCount, units: state.compare.unitPressed };
      if (errors.length) fail(where, 'console/runtime errors: ' + errors.slice(0, 2).join(' | '));
    }

    // Phase C: real user input at 390 and 1440
    for (const [w, h] of [[390, 844], [456, 900], [620, 900], [1440, 900]]) {
      const label = `${w}x${h}`;
      await goto('index.html?page=compare&legacy=1&compare-unit=rebased', w, h);
      await evaluate(cdp, () => {
        window.__wpcMarks = {
          compare: document.querySelector('#compare-view'), chart: document.querySelector('#structure-chart'),
          heading: document.querySelector('.atlas-canvas-heading'), foot: document.querySelector('.workbench-bottom-bar'),
        };
        window.__wpcMarksAt = {
          compareParent: document.querySelector('#compare-view')?.parentElement?.tagName || null,
          headingParent: document.querySelector('.atlas-canvas-heading')?.parentElement?.tagName || null,
          footParent: document.querySelector('.workbench-bottom-bar')?.parentElement?.tagName || null,
        };
        return true;
      });
      const before = await evaluate(cdp, readState);
      // Phone returns with the compare-owned home control that the shell moves
      // into the heading (atlas-shell.css: chart + data-page=compare -> 44x44).
      // Desktop has no home control and uses the real navigation instead.
      const homeState = () => evaluate(cdp, () => {
        const n = document.querySelector('#mobile-chart-home');
        if (!n) return null;
        const r = n.getBoundingClientRect();
        return {
          w: Math.round(r.width), h: Math.round(r.height), top: Math.round(r.top), bottom: Math.round(r.bottom),
          painted: n.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true }),
          inHeading: Boolean(n.closest('.atlas-canvas-heading')), label: n.getAttribute('aria-label'), disabled: Boolean(n.disabled),
        };
      });
      let openedDrawer = null;
      let returnControl = null;
      const home = await homeState();
      if (home?.painted) returnControl = { selector: '#mobile-chart-home', kind: 'home', state: home };
      else {
        const navReady = () => evaluate(cdp, () => {
          const n = document.querySelector('.atlas-nav button[data-view="outlook"]');
          if (!n) return false;
          const r = n.getBoundingClientRect(); const cs = getComputedStyle(n);
          return r.width > 1 && r.height > 1 && cs.display !== 'none' && cs.visibility !== 'hidden' && !n.closest('[inert]');
        });
        if (!(await navReady())) {
          const traySelector = '#mobile-details-toggle';
          const tray = await evaluate(cdp, sel => {
            const n = document.querySelector(sel);
            if (!n) return null;
            const r = n.getBoundingClientRect();
            return { painted: n.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true }), w: Math.round(r.width), h: Math.round(r.height) };
          }, traySelector);
          if (tray?.painted) { openedDrawer = { trigger: traySelector, receipt: await domClick(traySelector) }; await sleep(1000); }
        }
        returnControl = { selector: '.atlas-nav button[data-view="outlook"]', kind: 'nav', state: null };
      }
      const navClick = await domClick(returnControl.selector);
      const navBox = { text: returnControl.kind === 'home' ? (home?.label || '통합 차트로 돌아가기') : '가격 차트' };
      if (!navClick.ok) {
        const dock = await evaluate(cdp, () => {
          const n = document.querySelector('.atlas-canvas-heading');
          const t = document.querySelector('#mobile-details-toggle');
          const r = n?.getBoundingClientRect(); const tr = t?.getBoundingClientRect();
          return { dockTop: r ? Math.round(r.top) : null, dockBottom: r ? Math.round(r.bottom) : null, innerHeight, docHeight: document.documentElement.scrollHeight, toggleVisible: Boolean(t && t.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true })) };
        });
        report.findings.push(`input ${label}: canonical price-chart nav unreachable (${JSON.stringify(navClick)}); dock=${JSON.stringify(dock)}; phone return path unverified, not a pass`);
      }
      else {
        await sleep(1000);
        const afterNav = await evaluate(cdp, readState);
        const identity = await evaluate(cdp, () => {
          const m = window.__wpcMarks;
          const now = { compare: document.querySelector('#compare-view'), chart: document.querySelector('#structure-chart'), heading: document.querySelector('.atlas-canvas-heading'), foot: document.querySelector('.workbench-bottom-bar') };
          return {
            compareSame: m.compare === now.compare, chartSame: m.chart === now.chart,
            headingSame: m.heading === now.heading, footSame: m.foot === now.foot,
            compareParentNow: now.compare?.parentElement?.tagName || null, compareParentAt: window.__wpcMarksAt.compareParent,
            headingParentNow: now.heading?.parentElement?.tagName || null, headingParentAt: window.__wpcMarksAt.headingParent,
            footParentNow: now.foot?.parentElement?.tagName || null, footParentAt: window.__wpcMarksAt.footParent,
            chartConnected: Boolean(now.chart?.isConnected), compareHidden: Boolean(now.compare?.hidden),
          };
        });
        await cdp.send('Runtime.evaluate', { expression: 'history.back()', returnByValue: true });
        await sleep(1500);
        const afterBack = await evaluate(cdp, readState);
        const backIdentity = await evaluate(cdp, () => {
          const m = window.__wpcMarks;
          const now = { compare: document.querySelector('#compare-view'), chart: document.querySelector('#structure-chart') };
          return { compareSame: m.compare === now.compare, chartSame: m.chart === now.chart, compareVisible: now.compare ? !now.compare.hidden : false };
        });
        report.interactions[label] = {
          openedDrawer, returnControl, navClick, nav: navBox.text,
          before: { search: before.search, page: before.page, compareVisible: before.compare.visible },
          afterNav: { search: afterNav.search, page: afterNav.page, compareVisible: afterNav.compare.visible, headings: afterNav.headings },
          nodeIdentityAfterNav: identity,
          afterBack: { search: afterBack.search, page: afterBack.page, compareVisible: afterBack.compare.visible, unitPressed: afterBack.compare.unitPressed, headings: afterBack.headings },
          nodeIdentityAfterBack: backIdentity,
        };
        const where = `input ${label} ${returnControl.kind}`;
        if (w <= 620) {
          if (returnControl.kind !== 'home') fail(where, 'phone return used ' + returnControl.kind + ' instead of the compare home control');
          else if (!home.inHeading || home.w < 44 || home.h < 44) fail(where, 'home control geometry/owner wrong: ' + JSON.stringify(home));
        }
        if (afterNav.page !== 'outlook') fail(where, 'canonical page not reached: body data-page=' + afterNav.page + ' ' + afterNav.search);
        if (!/compare-unit=rebased/.test(afterNav.search)) fail(where, 'context params lost on canonical page: ' + afterNav.search);
        if (afterNav.compare.visible) fail(where, 'compare view still visible on canonical page');
        if (!identity.compareSame || !identity.chartSame) fail(where, 'compare/chart nodes replaced instead of preserved');
        if (!/page=compare/.test(afterBack.search)) fail(where, 'back did not restore compare route: ' + afterBack.search);
        if (!/compare-unit=rebased/.test(afterBack.search)) fail(where, 'back lost compare-unit context: ' + afterBack.search);
        if (!afterBack.compare.visible) fail(where, 'compare view not restored after back');
        if (!backIdentity.compareSame || !backIdentity.chartSame) fail(where, 'nodes not preserved after return');
        if (w <= 620) {
          if (afterNav.heading?.dock !== 'phone-dock') fail(where, 'returned phone heading lost the dock: ' + (afterNav.heading?.dock ?? 'none'));
          if (afterBack.heading?.dock !== 'phone-dock') fail(where, 'restored compare dock missing on phone');
        }
      }

      // Compare's own controls. The nested price card keeps its unit control
      // locked while the compare route owns the centre.
      const freqSelector = '.atlas-canvas-heading [data-structure-frequency="daily"]';
      const freqBefore = await evaluate(cdp, sel => {
        const b = document.querySelector(sel);
        return b ? { pressed: b.getAttribute('aria-pressed'), rows: document.querySelectorAll('#structure-periods tr').length } : null;
      }, freqSelector);
      const freqClick = freqBefore ? await domClick(freqSelector) : { ok: false, reason: 'frequency toggle not found' };
      await sleep(900);
      const freqAfter = await evaluate(cdp, () => ({
        group: [...document.querySelectorAll('[data-structure-frequency]')].map(b => b.dataset.structureFrequency + '=' + b.getAttribute('aria-pressed')),
        rows: document.querySelectorAll('#structure-periods tr').length,
        firstRow: document.querySelector('#structure-periods tr')?.textContent?.trim().slice(0, 30) || null,
      }));
      const pagerSelector = '#structure-next';
      const rowsBeforePager = await evaluate(cdp, () => document.querySelector('#structure-periods tr')?.textContent?.trim().slice(0, 24) || null);
      const tabClick = await domClick(pagerSelector);
      await sleep(900);
      const tabAfter = await evaluate(cdp, () => ({
        firstRow: document.querySelector('#structure-periods tr')?.textContent?.trim().slice(0, 24) || null,
        countLabel: document.querySelector('#structure-period-count')?.textContent?.trim() || null,
        rows: document.querySelectorAll('#compare-view tbody tr').length,
        search: location.search,
      }));
      await cdp.send('Page.reload', { ignoreCache: false });
      const reloadBoot = await boot();
      await evaluate(cdp, async () => { await document.fonts.ready; await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))); });
      const afterReload = await evaluate(cdp, readState);
      const modeAfterReload = await evaluate(cdp, () => ({ firstRow: document.querySelector('#structure-periods tr')?.textContent?.trim().slice(0, 24) || null, freq: [...document.querySelectorAll('[data-structure-frequency]')].map(b => b.dataset.structureFrequency + '=' + b.getAttribute('aria-pressed')) }));
      report.interactions[label] = report.interactions[label] || {};
      report.interactions[label].compareControls = {
        priceCardUnitControl: 'locked by the compare route (not a user target here)',
        frequency: { before: freqBefore, click: freqClick, after: freqAfter },
        pager: { beforeFirstRow: rowsBeforePager, click: tabClick, after: tabAfter },
        reloadBoot, searchAfterReload: afterReload.search, modeAfterReload, rowsAfterReload: afterReload.compare.rows,
      };
      const where = `input ${label} compare-controls`;
      if (!freqClick.ok) report.findings.push(`${where}: daily frequency toggle not clickable (${JSON.stringify(freqClick)})`);
      else {
        if (!freqAfter.group.includes('daily=true')) fail(where, 'frequency toggle did not apply: ' + JSON.stringify(freqAfter.group));
        if (freqAfter.rows < 1) fail(where, 'period table empty after frequency change');
      }
      if (!tabClick.ok) report.findings.push(`${where}: period pager not clickable (${JSON.stringify(tabClick)})`);
      else if (tabAfter.firstRow === rowsBeforePager && !/총|전체/.test(tabAfter.countLabel || '')) report.findings.push(`${where}: pager click did not change the period page (first row unchanged: ${tabAfter.firstRow})`);
      if (reloadBoot !== 'ready') fail(where, 'reload boot ' + reloadBoot);
      if (afterReload.compare.rows < 1) fail(where, 'compare rows lost after reload');
      if (errors.length) fail(where, 'console/runtime errors: ' + errors.slice(0, 2).join(' | '));
    }

    // Phase D: the four content routes keep the shell's perimeter at every width.
    const contentRoutes = [
      ['evidence', 'index.html?page=evidence'],
      ['data', 'index.html?page=data'],
      ['ipo', 'index.html?page=ipo'],
      ['relay', 'index.html?page=relay'],
    ];
    report.contentWidths = [];
    for (const [name, url] of contentRoutes) {
      for (const [w, h] of [[320, 740], [390, 844], [768, 1024], [1024, 768], [1440, 900], [1920, 1080]]) {
        const bootState = await goto(url, w, h);
        const state = await evaluate(cdp, readState);
        const shellTargets = await evaluate(cdp, () => {
          const painted = n => {
            if (!n || n.closest('[hidden],[inert]')) return false;
            if (n.getAttribute('aria-hidden') === 'true') return false;
            const cs = getComputedStyle(n);
            if (cs.display === 'none' || cs.visibility === 'hidden') return false;
            const r = n.getBoundingClientRect();
            return r.width > 1 && r.height > 1;
          };
          // The navigation owner differs by width, so its real host is collected
          // instead of only the chart's own rail.
          const navHost = document.querySelector('.content-rail .atlas-nav') ? '.content-rail'
            : document.querySelector('.atlas-sidebar .atlas-nav') ? '.atlas-sidebar' : '.workbench-rail';
          const regions = ['.atlas-canvas-heading', navHost, '.workbench-bottom-bar'];
          const nodes = [...document.querySelectorAll(regions.map(s => s + ' button,' + s + ' a[href],' + s + ' select,' + s + ' summary').join(','))];
          const targets = nodes.filter(n => painted(n) && !n.disabled).map(n => {
            const r = n.getBoundingClientRect();
            return { name: (n.getAttribute('aria-label') || n.textContent || '').trim().slice(0, 24), w: Math.round(r.width), h: Math.round(r.height) };
          });
          const rail = document.querySelector('.workbench-rail');
          const nav = document.querySelector('.atlas-nav');
          return {
            shellTargets: targets.length,
            tiny: targets.filter(t => t.w < 44 || t.h < 44),
            railOwnsNav: Boolean(rail && nav && rail.contains(nav)),
            navItems: nav ? nav.querySelectorAll('[data-atlas-page],[data-view]').length : 0,
            navLabelled: nav ? [...nav.querySelectorAll('[data-atlas-page],[data-view]')].filter(n => n.getAttribute('aria-label') || n.getAttribute('title')).length : 0,
            headerIsTop: Boolean(document.querySelector('.atlas-canvas-heading')?.matches('.atlas-dashboard-header')),
            sidebarRendered: Boolean(document.querySelector('.atlas-sidebar')?.getClientRects().length),
            sidebarOwnsNav: Boolean(document.querySelector('.atlas-sidebar')?.contains(nav)),
            railPainted: Boolean(rail?.getClientRects().length),
            bottomOwnsFooter: Boolean(document.querySelector('.workbench-bottom-bar .footer')),
          };
        });
        const entry = {
          route: name, viewport: `${w}x${h}`, klass: w <= phoneMax ? 'phone' : w <= tabletMax ? 'tablet' : 'desktop',
          boot: bootState, regions: state.regions, present: state.present, overflow: state.overflow,
          headings: state.headings.length, duplicates: state.duplicates,
          ...shellTargets, errors: [...errors],
        };
        report.contentWidths.push(entry);
        const where = `content ${name} ${w}x${h}`;
        if (bootState !== 'ready') fail(where, 'boot ' + bootState);
        for (const key of ['top', 'left', 'right', 'bottom']) if (!state.present[key]) fail(where, `missing shell region ${key}`);
        if (state.regions.top !== 'visible') fail(where, 'top region ' + state.regions.top);
        // The dashboard composition keeps the navigation in its sidebar; the right
        // icon rail is the phone-width host for the same node, never a second copy.
        if (shellTargets.sidebarRendered && (state.regions.right === 'visible' || shellTargets.railPainted)) fail(where, 'dashboard kept a right rail beside the rendered sidebar');
        if (!shellTargets.sidebarRendered && state.regions.right !== 'visible') fail(where, 'right region ' + state.regions.right);
        if (w > phoneMax && state.regions.bottom !== 'visible') fail(where, 'bottom region ' + state.regions.bottom);
        if (w >= 960 && state.regions.left !== 'visible') fail(where, 'left region ' + state.regions.left);
        if (state.overflow > 1) fail(where, `horizontal overflow ${state.overflow}px`);
        if (state.headings.length !== 1) fail(where, 'visible h1 count ' + state.headings.length + ' (' + state.headings.map(h => h.id || h.text).join(' | ') + ')');
        if (state.duplicates.length) fail(where, 'duplicate ids ' + state.duplicates.join(','));
        if (shellTargets.sidebarRendered && !shellTargets.sidebarOwnsNav) fail(where, 'the rendered dashboard sidebar does not own the navigation');
        if (!shellTargets.sidebarRendered && !shellTargets.railOwnsNav) fail(where, 'phone content route lost its navigation host');
        if (!shellTargets.bottomOwnsFooter) fail(where, 'the source footer is not owned by the bottom bar');
        if (shellTargets.navLabelled < shellTargets.navItems) fail(where, `${shellTargets.navItems - shellTargets.navLabelled} rail links without an accessible name`);
        if (w <= 1100 && shellTargets.tiny.length) fail(where, `${shellTargets.tiny.length} shell targets below 44px: ` + shellTargets.tiny.map(t => `${t.name} ${t.w}x${t.h}`).join('; '));
        if (errors.length) fail(where, 'console/runtime errors: ' + errors.slice(0, 2).join(' | '));
      }
      // The bottom bar keeps the source information sheet as its real control.
      // Whether that control is usable is a property of the price owner, not the
      // route: routes that load the price dataset publish readiness and keep the
      // control live, and the other routes keep their original node with a
      // feature-scoped disabled state and the exact reason instead of opening an
      // empty sheet.
      await goto(url, 1440, 900);
      const opener = await evaluate(cdp, () => {
        const b = document.querySelector(".content-bottom-bar [data-method]");
        if (!b) return { found: false };
        return {
          found: true, sameNode: Boolean(b.closest(".workbench-bottom-bar")), label: (b.textContent || "").trim().slice(0, 40),
          readiness: document.body.dataset.comparison || "unset",
          disabled: b.disabled === true, ariaDisabled: b.getAttribute("aria-disabled"),
          reason: b.getAttribute("data-disabled-reason"), description: b.getAttribute("aria-description"),
        };
      });
      const sourceReady = opener.found && opener.readiness === "ready";
      const sheetClick = opener.found && !opener.disabled ? await domClick(".content-bottom-bar [data-method]") : null;
      await sleep(700);
      const sheet = await evaluate(cdp, () => {
        const d = document.getElementById("method-dialog");
        const reader = document.querySelector("#chart-reader");
        return {
          open: Boolean(d?.open), chars: (document.getElementById("method-content")?.textContent || "").length,
          readerOpen: Boolean(reader && !reader.hidden), readerKind: reader?.dataset.kind || null,
          readerChars: reader && !reader.hidden ? reader.textContent.length : 0,
        };
      });
      report.contentWidths.push({ route: name, infoSheet: { opener, sourceReady, click: sheetClick, dialog: sheet } });
      if (!opener.found) fail(`content ${name} bottom-bar control`, "the source control left the bottom bar");
      else if (sourceReady) {
        if (opener.disabled || opener.ariaDisabled === "true") fail(`content ${name} bottom-bar control`, "a prepared price owner left its source control disabled: " + JSON.stringify(opener));
        if (opener.reason) fail(`content ${name} bottom-bar control`, "a prepared price owner kept a disabled reason: " + JSON.stringify(opener));
        if (!sheetClick?.ok) fail(`content ${name} bottom-bar control`, "the prepared source control is unreachable: " + JSON.stringify(sheetClick));
        const shown = (sheet.readerOpen && sheet.readerKind === "method" && sheet.readerChars > 400)
          || (sheet.open && sheet.chars > 400);
        if (!shown) fail(`content ${name} bottom-bar control`, "a prepared source sheet did not open with real content: " + JSON.stringify(sheet));
      } else {
        if (opener.readiness !== "unset" && opener.readiness !== "unavailable") fail(`content ${name} bottom-bar control`, "unexpected readiness value: " + opener.readiness);
        if (opener.disabled !== true || opener.ariaDisabled !== "true") fail(`content ${name} bottom-bar control`, "source control is not exactly disabled: " + JSON.stringify(opener));
        if (!opener.reason || opener.reason !== opener.description) fail(`content ${name} bottom-bar control`, "missing or unclear disabled reason: " + JSON.stringify(opener));
        if (sheet.open || sheet.readerOpen) fail(`content ${name} bottom-bar control`, "a source sheet was shown for a route without price data");
      }
      if (sheet.open) { await evaluate(cdp, () => document.getElementById("method-dialog")?.close()); await sleep(250); }
      if (sheet.readerOpen) { await evaluate(cdp, () => document.dispatchEvent(new CustomEvent("atlas:close-detail"))); await sleep(250); }
    }

    // The compare structure toolbar scrolls horizontally on phones. Its threshold
    // select and JSON export were observed painted past the viewport edge, so the
    // reachability is asserted with real wheel input instead of left unverified.
    for (const [w, h] of [[320, 844], [390, 844]]) {
      const where = `compare structure toolbar ${w}x${h}`;
      await goto('index.html?page=compare&legacy=1&compare-unit=rebased', w, h);
      const measure = () => evaluate(cdp, () => {
        const bar = document.querySelector('.lab-toolbar');
        const read = selector => {
          const node = document.querySelector(selector);
          if (!node) return null;
          const r = node.getBoundingClientRect();
          const cx = Math.min(Math.max(r.left + r.width / 2, 1), innerWidth - 1);
          const cy = Math.min(Math.max(r.top + r.height / 2, 1), innerHeight - 1);
          const hit = document.elementFromPoint(cx, cy);
          return { left: Math.round(r.left), right: Math.round(r.right), width: Math.round(r.width),
            inViewport: r.left >= 0 && r.right <= innerWidth && r.top >= 0 && r.bottom <= innerHeight,
            hit: Boolean(hit && (hit === node || node.contains(hit))) };
        };
        const barRect = bar?.getBoundingClientRect();
        return { scrollWidth: bar?.scrollWidth ?? 0, clientWidth: bar?.clientWidth ?? 0,
          scrollLeft: Math.round(bar?.scrollLeft ?? 0), viewport: innerWidth,
          point: barRect ? { x: Math.round(barRect.left + barRect.width / 2), y: Math.round(barRect.top + barRect.height / 2) } : null,
          threshold: read('#structure-threshold'), json: read('#structure-json') };
      });
      const initial = await measure();
      if (!initial.threshold || !initial.json) fail(where, 'structure toolbar controls are missing: ' + JSON.stringify(initial));
      else if (!(initial.scrollWidth > initial.clientWidth + 4)) fail(where, 'toolbar reports no horizontal overflow: ' + JSON.stringify(initial));
      else if (!initial.point) fail(where, 'toolbar has no measurable box');
      else {
        await cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: initial.point.x, y: initial.point.y });
        await cdp.send('Input.dispatchMouseEvent', { type: 'mouseWheel', x: initial.point.x, y: initial.point.y,
          deltaX: initial.scrollWidth - initial.clientWidth + 24, deltaY: 0 });
        await sleep(450);
        const scrolled = await measure();
        if (!(scrolled.scrollLeft > initial.scrollLeft)) fail(where, 'wheel did not scroll the toolbar: ' + JSON.stringify({ initial, scrolled }));
        for (const key of ['threshold', 'json'])
          if (!scrolled[key]?.inViewport || !scrolled[key].hit) fail(where, key + ' is not reachable after scrolling: ' + JSON.stringify(scrolled[key]));
        report.structureToolbar = report.structureToolbar || [];
        report.structureToolbar.push({ viewport: `${w}x${h}`, initial, scrolled });
      }
    }

    // Phase E: leaving a content route must hand the chart frame back its own
    // regions, and coming back must restore the same content nodes.
    for (const [name, url] of [["evidence", "index.html?page=evidence"], ["relay", "index.html?page=relay"]]) {
      for (const [w, h] of [[1440, 900], [390, 844]]) {
        await goto(url, w, h);
        await evaluate(cdp, () => {
          window.__wpcContent = {
            rail: document.querySelector(".content-rail"),
            bottom: document.querySelector(".content-bottom-bar"),
            header: document.querySelector(".atlas-dashboard-header"),
            nav: document.querySelector(".atlas-nav"),
            footer: document.querySelector(".footer"),
            source: document.querySelector(".content-bottom-bar [data-method]") || document.querySelector("#main > .footer [data-method]"),
          };
          return true;
        });
        const before = await evaluate(cdp, () => {
          const marks = window.__wpcContent;
          const source = marks.source;
          const painted = n => {
            if (!n || !n.isConnected || n.hidden) return false;
            const cs = getComputedStyle(n);
            if (cs.display === "none" || cs.visibility === "hidden") return false;
            const r = n.getBoundingClientRect();
            return r.width > 1 && r.height > 1;
          };
          return {
            page: document.body.dataset.page, shell: document.body.dataset.shell,
            railInDoc: Boolean(marks.rail?.isConnected), bottomInDoc: Boolean(marks.bottom?.isConnected),
            railHidden: marks.rail ? marks.rail.hidden : null,
            navInRail: Boolean(marks.rail?.contains(marks.nav)), footerInBottom: Boolean(marks.bottom?.contains(marks.footer)),
            navInSidebar: Boolean(document.querySelector(".atlas-sidebar")?.contains(marks.nav)),
            sidebarRendered: Boolean(document.querySelector(".atlas-sidebar")?.getClientRects().length),
            railCount: [...document.querySelectorAll(".workbench-rail")].filter(painted).length,
            bottomCount: [...document.querySelectorAll(".workbench-bottom-bar")].filter(painted).length,
            sourceReadiness: document.body.dataset.comparison || "unset",
            sourceDisabled: source ? source.disabled === true : null,
            sourceReason: source?.getAttribute("data-disabled-reason") || null,
          };
        });
        const navClick = await domClick('.atlas-nav [data-atlas-page="outlook"]');
        await sleep(1400);
        const onChart = await evaluate(cdp, () => {
          const marks = window.__wpcContent;
          const canvasHeading = document.querySelector(".atlas-canvas-heading");
          const nativeRail = document.querySelector(".workbench-rail");
          const source = document.querySelector("#main .footer [data-method]");
          return {
            page: document.body.dataset.page, shell: document.body.dataset.shell,
            contentRailPresent: Boolean(document.querySelector(".content-rail")),
            contentBottomPresent: Boolean(document.querySelector(".content-bottom-bar")),
            railCount: [...document.querySelectorAll(".workbench-rail")].filter(n => n.getClientRects().length && getComputedStyle(n).display !== "none").length,
            bottomCount: [...document.querySelectorAll(".workbench-bottom-bar")].filter(n => n.getClientRects().length && getComputedStyle(n).display !== "none").length,
            railIsNative: Boolean(nativeRail) && !nativeRail.classList.contains("content-rail"),
            nativeRailOwnsNav: Boolean(nativeRail?.contains(document.querySelector(".atlas-nav"))),
            topIsChartToolbar: Boolean(canvasHeading) && !canvasHeading.classList.contains("atlas-dashboard-header"),
            headerHidden: Boolean(document.querySelector(".atlas-dashboard-header")?.hidden),
            sourceDisabled: source ? source.disabled === true : null,
            sourceReason: source?.getAttribute("data-disabled-reason") || null,
            footerInMain: Boolean(document.querySelector("#main > .footer")),
            nodesPreserved: {
              nav: marks.nav === document.querySelector(".atlas-nav"),
              footer: marks.footer === document.querySelector(".footer"),
              source: marks.source === source,
            },
          };
        });
        await cdp.send("Runtime.evaluate", { expression: "history.back()", returnByValue: true });
        await sleep(1500);
        const back = await evaluate(cdp, () => {          const marks = window.__wpcContent;
          const rail = document.querySelector(".content-rail");
          const item = document.querySelector('.atlas-nav [data-atlas-page="outlook"]');
          let hit = null;
          if (item) {
            const r = item.getBoundingClientRect();
            const target = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
            hit = { inside: Boolean(target && (target === item || item.contains(target))), w: Math.round(r.width), h: Math.round(r.height) };
          }
          const source = document.querySelector(".content-bottom-bar [data-method]");
          return {
            page: document.body.dataset.page, shell: document.body.dataset.shell,
            sameRail: marks.rail === rail, sameBottom: marks.bottom === document.querySelector(".content-bottom-bar"),
            navInRail: Boolean(rail?.contains(document.querySelector(".atlas-nav"))),
            navInSidebar: Boolean(document.querySelector(".atlas-sidebar")?.contains(document.querySelector(".atlas-nav"))),
            footerInBottom: Boolean(document.querySelector(".content-bottom-bar")?.contains(document.querySelector(".footer"))),
            railCount: [...document.querySelectorAll(".workbench-rail")].filter(n => n.isConnected && !n.hidden && getComputedStyle(n).display !== "none").length,
            bottomCount: [...document.querySelectorAll(".workbench-bottom-bar")].filter(n => n.isConnected && !n.hidden && getComputedStyle(n).display !== "none").length,
            railVisible: Boolean(rail) && !rail.hidden && Boolean(rail.getClientRects().length),
            sidebarRendered: Boolean(document.querySelector(".atlas-sidebar")?.getClientRects().length),
            navHit: hit,
            sourceReadiness: document.body.dataset.comparison || "unset",
            sourceDisabled: source ? source.disabled === true : null,
            sourceReason: source?.getAttribute("data-disabled-reason") || null,
          };
        });
        // The price owner published readiness when the chart loaded its data in
        // this document, so the same control that was locked on entry must now be
        // live and open the real sheet. The node, its host and its label are the
        // ones the route mounted, not a replacement.
        const backSourceClick = back.sourceDisabled === false && w > 620 ? await domClick(".content-bottom-bar [data-method]") : null;
        await sleep(800);
        const backSourceSheet = await evaluate(cdp, () => {
          const reader = document.querySelector("#chart-reader");
          const dialog = document.getElementById("method-dialog");
          return {
            readerOpen: Boolean(reader && !reader.hidden), readerKind: reader?.dataset.kind || null,
            readerChars: reader && !reader.hidden ? reader.textContent.length : 0,
            dialogOpen: Boolean(dialog?.open), chars: (document.getElementById("method-content")?.textContent || "").length,
          };
        });
        if (backSourceSheet.readerOpen) { await evaluate(cdp, () => document.dispatchEvent(new CustomEvent("atlas:close-detail"))); await sleep(250); }
        if (backSourceSheet.dialogOpen) { await evaluate(cdp, () => document.getElementById("method-dialog")?.close()); await sleep(250); }
        report.contentTrips = report.contentTrips || [];
        report.contentTrips.push({ route: name, viewport: `${w}x${h}`, navClick, before, onChart, back, backSourceClick, backSourceSheet });
        const where = `trip ${name} ${w}x${h}`;
        const railOwnsNav = before.sidebarRendered === false;
        if (!before.bottomInDoc || before.bottomCount !== 1) fail(where, "content bottom region not owned once on entry: " + JSON.stringify(before));
        if (railOwnsNav) {
          if (!before.railInDoc || before.railHidden || !before.navInRail || before.railCount !== 1) fail(where, "phone content rail did not take the navigation: " + JSON.stringify(before));
        } else if (!before.railInDoc || !before.railHidden || before.navInRail || !before.navInSidebar || before.railCount !== 0) {
          fail(where, "rendered dashboard sidebar must own the navigation without a painted rail: " + JSON.stringify(before));
        }
        if (!before.footerInBottom) fail(where, "footer not owned by the content bottom region: " + JSON.stringify(before));
        if (before.sourceReadiness === "ready") {
          if (before.sourceDisabled === true || before.sourceReason) fail(where, "a prepared price owner left the content source control locked: " + JSON.stringify(before));
        } else if (before.sourceReadiness === "unset" || before.sourceReadiness === "unavailable") {
          if (before.sourceDisabled !== true || !before.sourceReason) fail(where, "source control not disabled with a reason: " + JSON.stringify(before));
        } else fail(where, "unexpected source readiness on entry: " + before.sourceReadiness);
        if (!navClick.ok) fail(where, "chart navigation unreachable from the content rail: " + JSON.stringify(navClick));
        if (onChart.page !== "outlook") fail(where, "navigation did not reach the price chart: " + onChart.page);
        if (onChart.contentRailPresent || onChart.contentBottomPresent) fail(where, "content regions survived the chart return");
        if (w > phoneMax && (onChart.railCount !== 1 || onChart.bottomCount !== 1)) fail(where, "duplicate shell regions on the chart: " + onChart.railCount + "/" + onChart.bottomCount);
        if (w <= phoneMax && (onChart.railCount > 1 || onChart.bottomCount > 1)) fail(where, "duplicate shell regions on the phone chart: " + onChart.railCount + "/" + onChart.bottomCount);
        if (!onChart.railIsNative || !onChart.nativeRailOwnsNav) fail(where, "chart rail did not take the navigation back: " + JSON.stringify(onChart));
        if (!onChart.topIsChartToolbar || !onChart.headerHidden) fail(where, "top region identity wrong on the chart: " + JSON.stringify(onChart));
        if (onChart.sourceReason) fail(where, "source control kept the content disabled reason on the chart: " + onChart.sourceReason);
        if (!onChart.footerInMain) fail(where, "source footer did not return to the page");
        if (Object.values(onChart.nodesPreserved).some(v => !v)) fail(where, "shell nodes were replaced instead of preserved: " + JSON.stringify(onChart.nodesPreserved));
        if (back.page !== name) fail(where, "back did not restore the content route: " + back.page);
        const expectedRails = back.sidebarRendered ? 0 : 1;
        if (back.railCount !== expectedRails || back.bottomCount !== 1) fail(where, "shell regions after return: " + back.railCount + "/" + back.bottomCount);
        if (!back.sameRail || !back.sameBottom) fail(where, "content regions were re-created after the return");
        if (back.sidebarRendered === false) {
          if (!back.railVisible || !back.navInRail) fail(where, "phone content rail stopped owning the navigation after the return");
        } else if (back.railVisible || back.navInRail || !back.navInSidebar) {
          fail(where, "dashboard sidebar lost the navigation or the rail reappeared: " + JSON.stringify(back));
        }
        if (!back.footerInBottom) fail(where, "footer ownership not restored");
        if (!back.navHit?.inside) fail(where, "navigation is not hit-testable after the return: " + JSON.stringify(back.navHit));
        if (w <= 1100 && (back.navHit.w < 44 || back.navHit.h < 44)) fail(where, "rail navigation is not a 44px target after the return: " + JSON.stringify(back.navHit));
        if (back.sourceReadiness !== "ready") fail(where, "the price owner did not publish readiness after loading in this document: " + JSON.stringify({ before: before.sourceReadiness, back: back.sourceReadiness }));
        if (back.sourceDisabled !== false) fail(where, "source control state not restored on the content route: " + JSON.stringify(back));
        if (back.sourceReason) fail(where, "source control kept a disabled reason after readiness: " + JSON.stringify(back));
        if (w > 620) {
          if (!backSourceClick?.ok) fail(where, "the prepared source control is unreachable after the return: " + JSON.stringify(backSourceClick));
          const shown = (backSourceSheet.readerOpen && backSourceSheet.readerKind === "method" && backSourceSheet.readerChars > 400)
            || (backSourceSheet.dialogOpen && backSourceSheet.chars > 400);
          if (!shown) fail(where, "the prepared source sheet did not open with real content: " + JSON.stringify(backSourceSheet));
        }
      }
    }

    for (const [w, h] of [[390, 844], [1280, 800], [1920, 1080]]) {
      await goto('index.html?page=compare&legacy=1&compare-unit=rebased', w, h);
      const shot = await cdp.send('Page.captureScreenshot', { format: 'png', fromSurface: true }).catch(() => null);
      if (shot?.data) await writeFile(resolve(OUT, `compare-${w}x${h}.png`), Buffer.from(shot.data, 'base64'));
    }

    report.assertions.widthsCovered = report.widths.map(r => r.viewport);
    report.assertions.widthsWithOverflow = report.widths.filter(r => r.overflow > 1).map(r => r.viewport);
    report.assertions.routesWithAllRegions = report.inventory.filter(r => Object.values(r.present).every(Boolean)).map(r => r.route);
    report.assertions.contentWidthsCovered = report.contentWidths.filter(e => e.viewport).map(e => e.route + ' ' + e.viewport);
    report.assertions.contentWidthsWithOverflow = report.contentWidths.filter(e => e.overflow > 1).map(e => e.route + ' ' + e.viewport);
    report.assertions.failureCount = failed;
    report.status = failed ? 'FAILED' : 'PASSED';
  } catch (error) {
    report.status = 'ERROR';
    report.failures.push('harness: ' + String(error.message || error));
    report.stack = String(error.stack || '');
    report.stderr = stderr.slice(-1500);
  } finally {
    chrome.kill('SIGKILL');
    server.close();
    await rm(profile, { recursive: true, force: true }).catch(() => { });
  }
  await writeFile(resolve(OUT, 'compare-shell-verify.json'), JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify({
    status: report.status, chrome: report.chrome, testedHead: report.testedHead,
    inventory: report.inventory.map(r => ({ route: r.route, boot: r.bootState, present: r.present, regions: r.regions, h1: r.headings, compare: r.compare.visible, rows: r.compare.rows, err: r.errors.length })),
    widths: report.widths.map(r => ({ vp: r.viewport, overflow: r.overflow, rows: r.rows, tiny: r.tiny, dock: r.dock, docH: r.docHeight, dockInView: r.dockInViewport, top: r.regions.top, left: r.regions.left, right: r.regions.right, bottom: r.regions.bottom })),
    interactions: report.interactions, failures: report.failures, findings: report.findings, explicit1920: report.assertions.explicit1920,
  }, null, 1));
  process.exit(report.status === 'PASSED' ? 0 : 1);
};
main();
