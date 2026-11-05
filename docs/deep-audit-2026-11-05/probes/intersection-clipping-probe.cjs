const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const fs = require('node:fs/promises');
const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const path = require('node:path');
const browserPath = process.env.ATLAS_BROWSER_PATH;
assert.ok(browserPath, 'Set ATLAS_BROWSER_PATH; missing native rendering cannot pass.');
const out = path.resolve(process.env.ATLAS_PROBE_OUT || path.join(__dirname, '../../../build/intersection-clipping-probe.json'));
const report = { status: 'running', scope: 'Prospective native IntersectionObserver clipping experiment; no shared helper implementation changed by this probe.', cases: [] };
let browser;
(async () => {
  browser = await chromium.launch({ executablePath: browserPath, headless: true, args: ['--no-sandbox', '--no-zygote', '--disable-gpu'] });
  report.browser = browser.version();
  const page = await browser.newPage({ viewport: { width: 800, height: 600 } });
  const cases = [
    { label: 'modal outside clipped DOM ancestor', accept: true, modal: true, html: '<main style="position:absolute;left:120px;top:180px;width:320px;height:120px;overflow:hidden"><dialog><button id="target">Return</button></dialog></main>' },
    { label: 'modal internally clipped target', accept: false, modal: true, html: '<main style="position:absolute;left:120px;top:180px;width:320px;height:120px;overflow:hidden"><dialog><div style="width:50px;height:50px;overflow:hidden"><button id="target">Clipped</button></div></dialog></main>' },
    { label: 'ordinary internally clipped target', accept: false, html: '<div style="position:absolute;left:40px;top:380px;width:50px;height:50px;overflow:hidden"><button id="target">Clipped</button></div>' },
    { label: 'ordinary occluded target', accept: false, html: '<button id="target" style="position:absolute;left:300px;top:400px">Covered</button><div style="position:absolute;left:300px;top:400px;width:80px;height:44px;z-index:20;background:black"></div>' },
    { label: 'viewport-fixed sidebar above shifted clipped body', accept: true, body: 'margin-top:56px;height:calc(100vh - 56px);overflow:hidden', html: '<aside style="position:fixed;left:0;top:12px;width:44px;height:44px"><button id="target" style="width:44px">Back</button></aside>' },
    { label: 'fixed child clipped by transformed containing block', accept: false, html: '<section style="position:absolute;left:200px;top:200px;width:50px;height:60px;overflow:hidden;transform:translateZ(0)"><button id="target" style="position:fixed;left:0;top:0">Clipped</button></section>' },
    { label: 'fixed child escaping untransformed overflow ancestor', accept: true, html: '<section style="position:absolute;left:200px;top:200px;width:50px;height:60px;overflow:hidden"><button id="target" style="position:fixed;left:40px;top:40px">Visible</button></section>' },
    { label: 'viewport-clipped fixed target', accept: false, html: '<button id="target" style="position:fixed;left:-20px;top:40px">Clipped</button>' }
  ];
  for (const spec of cases) {
    const html = '<!doctype html><style>*{box-sizing:border-box}body{margin:0;' + (spec.body || '') + '}button{width:80px;height:44px}dialog{position:fixed;margin:0;inset:20px auto auto 20px;width:420px;height:260px;padding:16px;overflow:auto}</style>' + spec.html;
    await page.setContent(html);
    if (spec.modal) await page.evaluate(() => document.querySelector('dialog').showModal());
    const observed = await page.evaluate(async () => {
      const el = document.querySelector('#target');
      el.scrollIntoView({ behavior: 'instant', block: 'nearest', inline: 'nearest' });
      const entry = await new Promise(resolve => { const observer = new IntersectionObserver(entries => { observer.disconnect(); resolve(entries[0]); }); observer.observe(el); });
      const box = r => ({ left: r.left, right: r.right, top: r.top, bottom: r.bottom, width: r.width, height: r.height });
      const b = el.getBoundingClientRect(), c = entry.intersectionRect, hit = document.elementFromPoint(b.left + b.width / 2, b.top + b.height / 2);
      const fullBounds = b.width > 0 && b.height > 0 && c.width > 0 && c.height > 0 && b.left >= c.left - 1 && b.right <= c.right + 1 && b.top >= c.top - 1 && b.bottom <= c.bottom + 1;
      const topmost = Boolean(hit && (hit === el || el.contains(hit)));
      return { target: box(b), intersection: box(c), root: box(entry.rootBounds), ratio: entry.intersectionRatio, isIntersecting: entry.isIntersecting, fullBounds, topmost, accept: fullBounds && topmost };
    });
    const row = { label: spec.label, expectedAccept: spec.accept, observed, fixtureSha256: createHash('sha256').update(html).digest('hex') }; report.cases.push(row);
    assert.equal(observed.accept, spec.accept, spec.label);
    row.status = 'passed';
  }
  report.status = 'passed';
})().catch(error => { report.status = 'failed'; report.error = error.stack; process.exitCode = 1; }).finally(async () => {
  await browser?.close();
  report.probeSha256 = createHash('sha256').update(await fs.readFile(__filename)).digest('hex');
  await fs.mkdir(path.dirname(out), {recursive:true});
  await fs.writeFile(out, JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify(report, null, 2));
});
