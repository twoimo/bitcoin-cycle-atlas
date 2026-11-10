#!/usr/bin/env node
/** Focused 320px TQQQ analysis-dialog probe. Isolated headless Chrome only.
 * Opens the real 삼플레 dialog from the embedded center workbench, then measures
 * the opened dialog, its own scroll body, native wheel scrolling, the definition
 * lists inside the scroll clip, the sticky header and the close action.
 * Run: ATLAS_BROWSER_PATH=/path/to/chrome node scripts/probe-tqqq-320-dialog.mjs */
import assert from 'node:assert/strict';
import { writeFile, mkdir, mkdtemp, rm, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { spawn, execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const argv = process.argv.slice(2), arg = (k, f) => { const i = argv.indexOf(k); return i < 0 ? f : argv[i + 1]; };
const origin = arg('--origin', 'http://127.0.0.1:8199/bitcoin-cycle-atlas').replace(/\/$/, '');
const out = resolve(root, arg('--out', 'build/probe-tqqq-320'));
const symbol = arg('--symbol', 'TQQQ');
const viewports = (arg('--viewports', '320x740,320x430,390x844')).split(',').map(v => v.split('x').map(Number));
const hash = b => createHash('sha256').update(b).digest('hex');
const delay = ms => new Promise(r => setTimeout(r, ms));
const report = { schemaVersion: 1, kind: 'atlas-tqqq-dialog-320-probe', origin, symbol, startedAt: new Date().toISOString(), status: 'RUNNING', cases: [], failures: [] };
let chrome, browser, profile, stderr = '';

async function until(fn, label, timeout = 45000) { const end = Date.now() + timeout; while (Date.now() < end) { const v = await fn(); if (v) return v; await delay(100); } throw new Error('Timed out: ' + label); }
class Cdp {
  constructor(ws) { this.ws = ws; this.next = 1; this.pending = new Map(); this.listeners = new Map(); ws.addEventListener('message', e => { const m = JSON.parse(String(e.data)); if (m.id) { const p = this.pending.get(m.id); if (!p) return; clearTimeout(p.timer); this.pending.delete(m.id); m.error ? p.reject(new Error(p.method + ': ' + JSON.stringify(m.error))) : p.accept(m.result || {}); } else for (const l of this.listeners.get(m.method) || []) l(m.params || {}); }); ws.addEventListener('close', () => this.fail(new Error('CDP closed'))); }
  static async connect(url) { const ws = new WebSocket(url); await new Promise((a, r) => { const t = setTimeout(() => r(new Error('CDP connection timeout')), 15000); ws.addEventListener('open', () => { clearTimeout(t); a(); }, { once: true }); ws.addEventListener('error', () => { clearTimeout(t); r(new Error('CDP connection failed')); }, { once: true }); }); return new Cdp(ws); }
  on(n, f) { const l = this.listeners.get(n) || []; l.push(f); this.listeners.set(n, l); }
  fail(e) { for (const p of this.pending.values()) { clearTimeout(p.timer); p.reject(e); } this.pending.clear(); }
  send(method, params = {}) { const id = this.next++; return new Promise((a, r) => { const t = setTimeout(() => { this.pending.delete(id); r(new Error('CDP timeout: ' + method)); }, 20000); this.pending.set(id, { accept: a, reject: r, timer: t, method }); this.ws.send(JSON.stringify({ id, method, params })); }); }
  close() { this.ws.close(); }
}
async function evaluate(cdp, fn, ...args) { const r = await cdp.send('Runtime.evaluate', { expression: '(' + fn.toString() + ')(' + args.map(x => JSON.stringify(x)).join(',') + ')', awaitPromise: true, returnByValue: true }); if (r.exceptionDetails) throw new Error('Browser evaluation failed: ' + JSON.stringify(r.exceptionDetails)); return r.result.value; }
async function settled(cdp) { await evaluate(cdp, async () => { await document.fonts.ready; await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))); }); }
async function screenshot(cdp, name, receipt) { const c = await cdp.send('Page.captureScreenshot', { format: 'png', fromSurface: true, captureBeyondViewport: false }), bytes = Buffer.from(c.data, 'base64'); await writeFile(resolve(out, name), bytes); receipt.screenshots.push({ file: name, bytes: bytes.length, sha256: hash(bytes) }); }

/** Reads the dialog and its scroll owner inside the embedded center document. */
function readDialog(selector) {
  const frames = [...document.querySelectorAll('.atlas-center-frame')].filter(f => f.getClientRects().length && f.contentDocument);
  let doc = document, frame = null, dialog = document.querySelector(selector);
  if (!dialog) { frame = frames.find(f => f.contentDocument.querySelector(selector)); doc = frame?.contentDocument; dialog = doc?.querySelector(selector); }
  if (!dialog) return null;
  const offset = frame ? frame.getBoundingClientRect() : { left: 0, top: 0 };
  const r = n => { if (!n) return null; const b = n.getBoundingClientRect(); return { left: b.left + offset.left, right: b.right + offset.left, top: b.top + offset.top, bottom: b.bottom + offset.top, width: b.width, height: b.height }; };
  const inner = n => { const b = n.getBoundingClientRect(); return { left: b.left, right: b.right, top: b.top, bottom: b.bottom, width: b.width, height: b.height }; };
  const header = dialog.querySelector('.compact-toolbar-dialog-header'), body = dialog.querySelector('.rsi-detail-body, .compact-toolbar-dialog-body'), close = dialog.querySelector('[data-rsi-dialog-close]');
  const style = n => n ? doc.defaultView.getComputedStyle(n) : null;
  const scrollOf = n => n ? { scrollTop: n.scrollTop, scrollHeight: n.scrollHeight, clientHeight: n.clientHeight, overflowY: style(n).overflowY, flex: style(n).flex, minHeight: style(n).minHeight, maxScroll: n.scrollHeight - n.clientHeight } : null;
  const bodyBox = body ? inner(body) : null;
  const clip = bodyBox ? { left: Math.max(0, bodyBox.left) + offset.left, right: Math.min(innerWidth - offset.left, bodyBox.right) + offset.left, top: Math.max(0, bodyBox.top) + offset.top, bottom: Math.min(innerHeight - offset.top, bodyBox.bottom) + offset.top } : null;
  const dls = [...dialog.querySelectorAll('dl')].map((n, index) => {
    const b = r(n);
    return { index, className: n.className, rect: b, insideClip: clip ? b.left >= clip.left - 1 && b.right <= clip.right + 1 && b.top >= clip.top - 1 && b.bottom <= clip.bottom + 1 : null, overlapsClip: clip ? b.bottom > clip.top && b.top < clip.bottom : null };
  });
  const closeVisible = close ? (() => { const b = r(close), ib = inner(close), hit = doc.elementFromPoint((ib.left + ib.right) / 2, (ib.top + ib.bottom) / 2); return { rect: b, topmost: Boolean(hit && (hit === close || close.contains(hit))), focusVisible: close.matches(':focus-visible') }; })() : null;
  return {
    open: dialog.open, modal: dialog.matches(':modal'), rect: r(dialog), innerRect: inner(dialog), computed: { maxHeight: style(dialog).maxHeight, overflowY: style(dialog).overflowY, display: style(dialog).display, height: style(dialog).height },
    dialogScroll: scrollOf(dialog), header: header ? { rect: r(header), position: style(header).position, stickyTop: style(header).top } : null,
    body: { ...scrollOf(body), rect: r(body) },
    clip, dls, close: closeVisible, text: dialog.textContent.trim().slice(0, 160)
  };
}
function framePoint(selector) {
  const frames = [...document.querySelectorAll('.atlas-center-frame')].filter(f => f.getClientRects().length && f.contentDocument);
  const frame = frames.find(f => f.contentDocument.querySelector(selector)), doc = frame?.contentDocument;
  const node = doc?.querySelector(selector); if (!node) return null;
  const b = node.getBoundingClientRect(), f = frame.getBoundingClientRect();
  return { x: f.left + (b.left + b.right) / 2, y: f.top + (b.top + b.bottom) / 2, rect: { left: b.left, right: b.right, top: b.top, bottom: b.bottom }, scrollTop: node.scrollTop, text: node.textContent.trim().slice(0, 60) };
}
function frameBodyPoint(selector) {
  const frames = [...document.querySelectorAll('.atlas-center-frame')].filter(f => f.getClientRects().length && f.contentDocument);
  const frame = frames.find(f => f.contentDocument.querySelector(selector));
  const doc = frame ? frame.contentDocument : document;
  const dialog = doc.querySelector(selector); if (!dialog) return null;
  const body = dialog.querySelector('.rsi-detail-body, .compact-toolbar-dialog-body'); if (!body) return null;
  const b = body.getBoundingClientRect(), f = frame ? frame.getBoundingClientRect() : { left: 0, top: 0 };
  return { x: f.left + (b.left + b.right) / 2, y: f.top + Math.min(b.bottom - 6, (b.top + b.bottom) / 2), scrollTop: body.scrollTop, maxScroll: body.scrollHeight - body.clientHeight };
}

async function runCase(width, height, debugBase) {
  const id = symbol.toLowerCase() + '-' + width + 'x' + height;
  const receipt = { id, width, height, status: 'RUNNING', screenshots: [], inputs: [], runtimeErrors: [], startedAt: new Date().toISOString() };
  report.cases.push(receipt);
  let cdp, contextId;
  try {
    ({ browserContextId: contextId } = await browser.send('Target.createBrowserContext'));
    const { targetId } = await browser.send('Target.createTarget', { url: 'about:blank', browserContextId: contextId });
    const target = await until(async () => { const list = await (await fetch(debugBase + '/json/list')).json(); return list.find(t => t.id === targetId && t.webSocketDebuggerUrl); }, 'page target');
    cdp = await Cdp.connect(target.webSocketDebuggerUrl); receipt.contextId = contextId;
    cdp.on('Runtime.exceptionThrown', e => receipt.runtimeErrors.push(e.exceptionDetails));
    await cdp.send('Page.enable'); await cdp.send('Runtime.enable'); await cdp.send('Network.enable'); await cdp.send('Network.setCacheDisabled', { cacheDisabled: true });
    await cdp.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false });
    await cdp.send('Emulation.setTouchEmulationEnabled', { enabled: width <= 768, maxTouchPoints: 5 });
    receipt.url = origin + '/market-lab/charts/?symbol=' + symbol;
    await cdp.send('Page.navigate', { url: receipt.url });
    await until(() => evaluate(cdp, () => document.documentElement.dataset.boot === 'ready' && Boolean([...document.querySelectorAll('.atlas-center-frame')].find(f => f.contentDocument?.querySelector('.rsi-trading-criteria, [data-rsi-win-badge]')))), id + ' usable RSI workbench', 60000);
    await settled(cdp);
    const trigger = (await evaluate(cdp, framePoint, '[data-rsi-win-badge]')) || (await evaluate(cdp, framePoint, '.rsi-trading-criteria'));
    receipt.trigger = trigger;
    assert.ok(trigger, 'No native trigger for the analysis dialog');
    await cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', button: 'left', clickCount: 1, x: trigger.x, y: trigger.y });
    await cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', button: 'left', clickCount: 1, x: trigger.x, y: trigger.y });
    await until(() => evaluate(cdp, () => {
      const frames = [...document.querySelectorAll('.atlas-center-frame')].filter(f => f.contentDocument);
      return Boolean(document.querySelector('[data-rsi-dialog][open]')) || frames.some(f => f.contentDocument.querySelector('[data-rsi-dialog][open]'));
    }), 'analysis dialog');
    await settled(cdp);
    const selector = '[data-rsi-dialog][open]';
    receipt.dialogOwner = await evaluate(cdp, selector => {
      const frames = [...document.querySelectorAll('.atlas-center-frame')].filter(f => f.contentDocument);
      if (document.querySelector(selector)) return { owner: 'outer', name: document.querySelector(selector).dataset.rsiDialog };
      const frame = frames.find(f => f.contentDocument.querySelector(selector));
      return frame ? { owner: 'frame', name: frame.contentDocument.querySelector(selector).dataset.rsiDialog } : null;
    }, '[data-rsi-dialog][open]');
    receipt.opened = await evaluate(cdp, readDialog, selector);
    await screenshot(cdp, id + '-opened.png', receipt);

    const bodyPoint = await evaluate(cdp, frameBodyPoint, selector);
    receipt.wheelTarget = bodyPoint;
    let wheel = null;
    if (bodyPoint) {
      await cdp.send('Input.dispatchMouseEvent', { type: 'mouseWheel', x: bodyPoint.x, y: bodyPoint.y, deltaX: 0, deltaY: 260 });
      await delay(400); await settled(cdp);
      const after = await evaluate(cdp, frameBodyPoint, selector);
      wheel = { before: bodyPoint.scrollTop, after: after.scrollTop, maxScroll: after.maxScroll };
      receipt.inputs.push({ kind: 'native-wheel', deltaY: 260, ...wheel });
      receipt.afterWheel = await evaluate(cdp, readDialog, selector);
      await screenshot(cdp, id + '-wheel.png', receipt);
      for (let i = 0; i < 40; i++) {
        const state = await evaluate(cdp, frameBodyPoint, selector);
        if (state.scrollTop >= state.maxScroll - 2) break;
        await cdp.send('Input.dispatchMouseEvent', { type: 'mouseWheel', x: state.x, y: state.y, deltaX: 0, deltaY: 1200 });
        await delay(60);
      }
      await settled(cdp);
      receipt.scrollEnd = await evaluate(cdp, readDialog, selector);
      await screenshot(cdp, id + '-scroll-end.png', receipt);
    }

    // Real keyboard traversal: CDP Tab leaves the reader body, Shift+Tab walks back
    // to the heading close action. No programmatic focus() is used as proof.
    const pressTab = async shift => {
      for (const type of ['keyDown', 'keyUp']) {
        await cdp.send('Input.dispatchKeyEvent', { type, key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9, nativeVirtualKeyCode: 9, ...(shift ? { modifiers: 8 } : {}) });
      }
      await settled(cdp);
    };
    const readFocus = () => evaluate(cdp, selector => {
      const frames = [...document.querySelectorAll('.atlas-center-frame')].filter(f => f.contentDocument);
      const doc = frames.map(f => f.contentDocument).find(d => d.querySelector(selector)) || document;
      const dialog = doc.querySelector(selector), close = dialog.querySelector('[data-rsi-dialog-close]'), active = doc.activeElement;
      const b = close.getBoundingClientRect(), hit = doc.elementFromPoint((b.left + b.right) / 2, (b.top + b.bottom) / 2), style = doc.defaultView.getComputedStyle(close);
      return { activeIsClose: active === close, active: active ? (active.getAttribute('data-rsi-dialog-close') !== null ? 'close' : (active.tagName + '.' + String(active.className || '').split(' ')[0])) : null,
        activeInsideDialog: Boolean(active && dialog.contains(active)), topmost: Boolean(hit && (hit === close || close.contains(hit))), focusVisible: close.matches(':focus-visible'),
        outlineStyle: style.outlineStyle, outlineWidth: parseFloat(style.outlineWidth) || 0, outlineColor: style.outlineColor,
        rect: { left: b.left, right: b.right, top: b.top, bottom: b.bottom }, headerTop: dialog.querySelector('.compact-toolbar-dialog-header').getBoundingClientRect().top,
        bodyScrollTop: dialog.querySelector('.rsi-detail-body, .compact-toolbar-dialog-body').scrollTop };
    }, selector);
    receipt.focusStart = await readFocus();
    await pressTab(false);
    receipt.focusAfterTab = await readFocus();
    receipt.keyboard = { shiftTabSteps: 0 };
    for (let step = 0; step < 24 && !(await readFocus()).activeIsClose; step++) { await pressTab(true); receipt.keyboard.shiftTabSteps++; }
    receipt.keyboard.after = await readFocus();
    receipt.keyboard.reachedByTabOutThenShiftTabIn = !receipt.focusStart.activeIsClose && !receipt.focusAfterTab.activeIsClose;

    // Reopen retention: a dialog that returns mid-content hides its own first block.
    const closePoint = await evaluate(cdp, selector => {
      const frames = [...document.querySelectorAll('.atlas-center-frame')].filter(f => f.contentDocument);
      const doc = frames.map(f => f.contentDocument).find(d => d.querySelector(selector)) || document;
      const dialog = doc.querySelector(selector), close = dialog.querySelector('[data-rsi-dialog-close]');
      const frame = frames.find(f => f.contentDocument === doc), b = close.getBoundingClientRect(), f = frame ? frame.getBoundingClientRect() : { left: 0, top: 0 };
      return { x: f.left + (b.left + b.right) / 2, y: f.top + (b.top + b.bottom) / 2 };
    }, selector);
    await cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', button: 'left', clickCount: 1, x: closePoint.x, y: closePoint.y });
    await cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', button: 'left', clickCount: 1, x: closePoint.x, y: closePoint.y });
    await until(() => evaluate(cdp, () => ![...document.querySelectorAll('.atlas-center-frame')].some(f => f.contentDocument?.querySelector('[data-rsi-dialog][open]')) && !document.querySelector('[data-rsi-dialog][open]')), 'dialog closed', 10000);
    await settled(cdp);
    const retrigger = (await evaluate(cdp, framePoint, '[data-rsi-win-badge]')) || (await evaluate(cdp, framePoint, '.rsi-trading-criteria'));
    await cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', button: 'left', clickCount: 1, x: retrigger.x, y: retrigger.y });
    await cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', button: 'left', clickCount: 1, x: retrigger.x, y: retrigger.y });
    await until(() => evaluate(cdp, () => Boolean(document.querySelector('[data-rsi-dialog][open]')) || [...document.querySelectorAll('.atlas-center-frame')].some(f => f.contentDocument?.querySelector('[data-rsi-dialog][open]'))), 'dialog reopened', 15000);
    await settled(cdp);
    receipt.reopened = await evaluate(cdp, readDialog, selector);
    await screenshot(cdp, id + '-reopened.png', receipt);

    const opened = receipt.opened;
    assert.ok(opened, 'Analysis dialog did not stay open');
    assert.ok(opened.rect.top >= -0.5 && opened.rect.bottom <= height + 0.5, 'Dialog box leaves the viewport: ' + JSON.stringify(opened.rect));
    assert.ok(opened.dialogScroll.scrollTop === 0, 'Dialog itself carries a stale internal scroll offset: ' + JSON.stringify(opened.dialogScroll));
    assert.ok(opened.body.maxScroll > 0, 'The dialog body is not the scroll owner here: ' + JSON.stringify(opened.body));
    assert.ok(opened.dls.length > 0, 'No definition list in the dialog');
    assert.ok(opened.dls[0].insideClip, 'Opening view does not contain the first definition list: ' + JSON.stringify({ clip: opened.clip, dl: opened.dls[0], header: opened.header }));
    assert.ok(opened.close?.topmost, 'Close action is occluded: ' + JSON.stringify(opened.close));
    if (bodyPoint) {
      assert.ok(wheel && wheel.after > wheel.before, 'Native wheel did not move the dialog body: ' + JSON.stringify(wheel));
      const end = receipt.scrollEnd;
      assert.ok(Math.abs(end.body.scrollTop - end.body.maxScroll) <= 2, 'Native wheel never reached the dialog body end: ' + JSON.stringify(end.body));
      assert.ok(end.close?.topmost, 'Scrolled close action is occluded: ' + JSON.stringify(end.close));
      assert.ok(end.header && Math.abs(end.header.rect.top - opened.header.rect.top) <= 1, 'Sticky header moved while scrolling: ' + JSON.stringify({ start: opened.header, end: end.header }));
      const kb = receipt.keyboard;
      assert.ok(kb.after.activeIsClose, 'Native keyboard traversal never reached the close action: ' + JSON.stringify({ start: receipt.focusStart, afterTab: receipt.focusAfterTab, after: kb.after }));
      assert.ok(kb.after.topmost, 'Keyboard-focused close action is occluded: ' + JSON.stringify(kb.after));
      assert.ok(kb.after.focusVisible && kb.after.outlineStyle !== 'none' && kb.after.outlineWidth >= 2, 'Keyboard-focused close action lacks a visible focus ring: ' + JSON.stringify(kb.after));
      assert.ok(receipt.keyboard.reachedByTabOutThenShiftTabIn || receipt.focusAfterTab.activeInsideDialog, 'Keyboard traversal proof is degenerate: ' + JSON.stringify({ start: receipt.focusStart, afterTab: receipt.focusAfterTab }));
      assert.ok(Math.abs(kb.after.headerTop - opened.header.rect.top) <= 1, 'Keyboard traversal moved the reader heading: ' + JSON.stringify({ opened: opened.header.rect, after: kb.after }));
      const reopened = receipt.reopened;
      assert.ok(reopened.body.scrollTop <= 2, 'Reopened dialog keeps a stale scroll offset: ' + JSON.stringify(reopened.body));
      assert.ok(reopened.dls[0]?.insideClip, 'Reopened dialog hides its own first block: ' + JSON.stringify({ clip: reopened.clip, dl: reopened.dls[0] }));
    }
    assert.equal(receipt.runtimeErrors.length, 0, 'Unhandled browser exceptions');
    receipt.status = 'PASS';
  } catch (error) {
    receipt.status = 'FAIL'; receipt.error = String(error.stack || error); report.failures.push({ id, error: receipt.error.split('\n')[0] });
    if (cdp) { try { await screenshot(cdp, id + '-failure.png', receipt); } catch {} }
  } finally { cdp?.close(); if (contextId) try { await browser.send('Target.disposeBrowserContext', { browserContextId: contextId }); } catch {} receipt.finishedAt = new Date().toISOString(); await writeFile(resolve(out, 'report.json'), JSON.stringify(report, null, 2) + '\n'); console.log(JSON.stringify({ id, status: receipt.status, error: receipt.error?.split('\n')[0] })); }
}

try {
  await mkdir(out, { recursive: true });
  report.sourceCommit = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();
  report.sourceTree = execFileSync('git', ['rev-parse', 'HEAD^{tree}'], { cwd: root, encoding: 'utf8' }).trim();
  report.workingChanges = execFileSync('git', ['status', '--short'], { cwd: root, encoding: 'utf8' }).trim();
  const binary = process.env.ATLAS_BROWSER_PATH;
  assert.ok(binary, 'ATLAS_BROWSER_PATH is required; no browser case may be reported as passed without Chrome');
  report.browserBinary = binary;
  profile = await mkdtemp(resolve(tmpdir(), 'atlas-tqqq-dialog-'));
  chrome = spawn(binary, ['--headless=new', '--no-sandbox', '--disable-dev-shm-usage', '--disable-background-networking', '--disable-component-update', '--disable-sync', '--no-first-run', '--no-default-browser-check', '--remote-debugging-port=0', '--user-data-dir=' + profile, 'about:blank'], { stdio: ['ignore', 'ignore', 'pipe'] });
  let spawnError; chrome.on('error', e => { spawnError = e; }); chrome.stderr.on('data', b => { stderr = (stderr + b.toString()).slice(-8000); });
  const active = await until(async () => { if (spawnError) throw spawnError; if (chrome.exitCode !== null) throw new Error('Chrome launch failed (' + chrome.exitCode + '): ' + stderr); try { return (await readFile(resolve(profile, 'DevToolsActivePort'), 'utf8')).trim().split('\n'); } catch { return null; } }, 'Chrome inspector', 20000);
  const debugBase = 'http://127.0.0.1:' + active[0];
  browser = await Cdp.connect('ws://127.0.0.1:' + active[0] + active[1]);
  report.browser = (await browser.send('Browser.getVersion')).product;
  for (const [width, height] of viewports) await runCase(width, height, debugBase);
  report.status = report.failures.length ? 'FAIL' : 'PASS';
} catch (error) { report.status = 'FAIL'; report.error = String(error.stack || error); }
finally {
  if (browser) { try { await browser.send('Browser.close'); } catch {} browser.close(); }
  if (chrome?.exitCode === null) { chrome.kill('SIGTERM'); await Promise.race([new Promise(r => chrome.once('close', r)), delay(1500)]); if (chrome.exitCode === null) chrome.kill('SIGKILL'); }
  if (profile) await rm(profile, { recursive: true, force: true });
  report.finishedAt = new Date().toISOString();
  await mkdir(out, { recursive: true });
  await writeFile(resolve(out, 'report.json'), JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify({ status: report.status, cases: report.cases.length, failures: report.failures, report: resolve(out, 'report.json'), error: report.error?.split('\n')[0] }));
  process.exitCode = report.status === 'PASS' ? 0 : 1;
}
