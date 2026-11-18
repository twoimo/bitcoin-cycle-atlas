import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const chromePath = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const url = process.argv[2] || 'http://127.0.0.1:8765/?page=outlook';
const width = Number(process.argv[3] || 1440);
const height = Number(process.argv[4] || 900);
const root = fileURLToRoot(import.meta.url);

class Cdp {
  constructor(ws) {
    this.ws = ws; this.id = 0; this.pending = new Map();
    ws.addEventListener('message', event => {
      const message = JSON.parse(String(event.data));
      const call = this.pending.get(message.id);
      if (!call) return;
      this.pending.delete(message.id); clearTimeout(call.timer);
      message.error ? call.reject(new Error(message.error.message)) : call.resolve(message.result || {});
    });
  }
  static async connect(address) {
    const ws = new WebSocket(address);
    await new Promise((done, reject) => {
      const timer = setTimeout(() => reject(new Error('cdp open timeout')), 10000);
      ws.addEventListener('open', () => { clearTimeout(timer); done(); }, {once: true});
      ws.addEventListener('error', () => { clearTimeout(timer); reject(new Error('cdp failed')); }, {once: true});
    });
    return new Cdp(ws);
  }
  send(method, params = {}, timeout = 8000) {
    const id = ++this.id;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { this.pending.delete(id); reject(new Error('timeout ' + method)); }, timeout);
      this.pending.set(id, {resolve, reject, timer});
      this.ws.send(JSON.stringify({id, method, params}));
    });
  }
  close() { this.ws.close(); }
}

function fileURLToRoot(href) {
  const path = new URL('..', href).pathname;
  return decodeURIComponent(path);
}

const expression = `(() => {
  const boot = document.documentElement?.dataset?.boot || '';
  const shell = document.getElementById('atlas-boot-shell');
  const host = document.querySelector('.atlas-funnest-canvas');
  if (host && !host.__trace) host.__trace = (window.__traceSeq = (window.__traceSeq || 0) + 1);
  const canvases = [...document.querySelectorAll('.atlas-funnest-canvas canvas')];
  for (const canvas of canvases) if (!canvas.__trace) canvas.__trace = (window.__traceSeq = (window.__traceSeq || 0) + 1);
  const sample = canvas => {
    if (!canvas?.width || !canvas.height) return null;
    const ctx = canvas.getContext('2d', {willReadFrequently: true});
    if (!ctx) return null;
    const colors = new Set();
    let transparent = 0, opaque = 0;
    for (let row = 0; row < 8; row += 1) {
      const y = Math.min(canvas.height - 1, Math.floor((row + 0.5) * canvas.height / 8));
      const strip = ctx.getImageData(0, y, canvas.width, 1).data;
      const step = Math.max(16, Math.floor(canvas.width / 36) * 4);
      for (let index = 0; index < strip.length; index += step) {
        if (strip[index + 3] < 16) transparent += 1; else opaque += 1;
        colors.add(strip[index] + ',' + strip[index + 1] + ',' + strip[index + 2] + ',' + strip[index + 3]);
      }
    }
    return {size: [canvas.width, canvas.height], colors: colors.size, transparent, opaque};
  };
  const plot = document.querySelector('.atlas-plot')?.getBoundingClientRect();
  const readout = document.querySelector('#lab-metrics')?.innerText || '';
  return {boot, failure: document.documentElement?.dataset?.bootFailure || null, shellHidden: Boolean(shell?.hidden), hostId: host?.__trace || 0, canvases: canvases.map(sample), plot: plot ? [Math.round(plot.width), Math.round(plot.height)] : null, readout: readout.slice(0, 180)};
})()`;

const profile = await mkdtemp(join(tmpdir(), 'atlas-first-paint-'));
const chrome = spawn(chromePath, [
  '--headless=new', '--disable-gpu', '--disable-dev-shm-usage', '--no-first-run', '--window-size=2048,1600',
  '--remote-debugging-port=0', `--user-data-dir=${profile}`, 'about:blank',
], {stdio: ['ignore', 'ignore', 'pipe']});
const port = await new Promise((resolve, reject) => {
  let text = '';
  const timer = setTimeout(() => reject(new Error('chrome port timeout')), 12000);
  chrome.stderr.on('data', chunk => {
    text += chunk;
    const match = text.match(/DevTools listening on ws:\/\/127\.0\.0\.1:(\d+)\//);
    if (match) { clearTimeout(timer); resolve(match[1]); }
  });
});
const samples = [];
const failed = [];
try {
  const version = await (await fetch(`http://127.0.0.1:${port}/json/version`)).json();
  const browser = await Cdp.connect(version.webSocketDebuggerUrl);
  const {targetId} = await browser.send('Target.createTarget', {url: 'about:blank'});
  const targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
  const page = await Cdp.connect(targets.find(target => target.id === targetId).webSocketDebuggerUrl);
  const urls = new Map();
  await page.send('Page.enable');
  await page.send('Network.enable');
  await page.send('Runtime.enable');
  page.ws.addEventListener('message', event => {
    const message = JSON.parse(String(event.data));
    if (message.method === 'Network.requestWillBeSent') urls.set(message.params.requestId, message.params.request.url);
    if (message.method === 'Network.loadingFailed') failed.push(urls.get(message.params.requestId) || message.params.errorText);
  });
  await page.send('Network.setCacheDisabled', {cacheDisabled: true});
  await page.send('Emulation.setDeviceMetricsOverride', {width, height, deviceScaleFactor: 1, mobile: width <= 620});
  let started = Date.now();
  for (let attempt = 1; attempt <= 4; attempt += 1) {
    failed.length = 0; samples.length = 0; started = Date.now();
    await page.send('Page.navigate', {url});
    const deadline = started + 800;
    while (Date.now() < deadline) {
      await new Promise(done => setTimeout(done, 40));
      const read = await page.send('Runtime.evaluate', {expression, returnByValue: true});
      if (read.result?.value) samples.push({at: Date.now() - started, ...read.result.value});
      if (samples.at(-1)?.boot === 'ready') break;
    }
    if (samples.some(row => row.boot === 'ready')) break;
    if (!failed.length) break;
    await new Promise(done => setTimeout(done, 300));
  }
  while (Date.now() - started < 3200 && samples.at(-1)?.boot === 'ready') {
    await new Promise(done => setTimeout(done, 40));
    const read = await page.send('Runtime.evaluate', {expression, returnByValue: true});
    if (read.result?.value) samples.push({at: Date.now() - started, ...read.result.value});
  }
  page.close(); browser.close();
} finally {
  chrome.kill('SIGKILL');
}

const mainPaint = row => row.canvases?.[0] || null;
const painted = row => { const canvas = mainPaint(row); return Boolean(canvas && canvas.opaque > 0 && canvas.colors > 1); };
const cleared = row => { const canvas = mainPaint(row); return Boolean(canvas && canvas.opaque === 0 && canvas.transparent > 0); };
const revealed = samples.filter(row => row.boot === 'ready' && row.shellHidden);
const first = revealed[0] || null;
const blanks = [];
let seenPaint = false;
for (const row of revealed) {
  if (painted(row)) seenPaint = true;
  else if (seenPaint && cleared(row)) blanks.push(row.at);
}
const readout = revealed.map(row => row.readout).find(text => /\d/.test(text) && !text.includes('계산하고')) || '';
const receipt = {
  url, width, height, samples: samples.length,
  firstRevealed: first ? {at: first.at, plot: first.plot, paint: mainPaint(first), hostId: first.hostId} : null,
  blankAfterPaint: blanks,
  hosts: [...new Set(revealed.map(row => row.hostId))],
  plotSizes: [...new Set(revealed.map(row => JSON.stringify(row.plot)))],
  readout,
  failedLoads: failed.slice(0, 8),
};
const evidenceDir = join(root, 'build/verification-evidence/2026-11-18');
await mkdir(evidenceDir, {recursive: true});
await writeFile(join(evidenceDir, 'first-paint.json'), JSON.stringify(receipt, null, 2) + '\n');
assert.equal(first?.boot, 'ready', 'The outlook chart did not finish booting');
assert.ok(painted(first), 'The first revealed chart canvas was not already painted');
assert.deepEqual(blanks, [], 'A replacement chart was presented with a cleared canvas');
assert.ok(readout && !readout.includes('계산하고') && /\d/.test(readout), 'The price readout was not the loaded Bitcoin chart');
console.log(JSON.stringify({status: 'passed', ...receipt}, null, 2));
