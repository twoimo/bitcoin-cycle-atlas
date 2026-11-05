const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const fs = require('node:fs/promises');
const { createHash } = require('node:crypto');
const { execFileSync } = require('node:child_process');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const root = path.resolve(process.env.ATLAS_REPO_ROOT || path.join(__dirname, '../../..'));
const browserPath = process.env.ATLAS_BROWSER_PATH;
assert.ok(browserPath, 'Set ATLAS_BROWSER_PATH to native Chromium; missing rendering is blocked, not a pass.');
const baseline = '4dc877ad0fdeabf7f01057e7f64ac11f9a8cbedc';
const file = 'scripts/verify-eth-candidate-browser.mjs';
const out = path.resolve(process.env.ATLAS_PROBE_OUT || path.join(root, 'build/click-modal-negative-control.json'));
const hash = text => createHash('sha256').update(text).digest('hex');
const report = { status: 'running', startedAt: new Date().toISOString(), runtime: {node: process.version, browserPath, launchArgs: ['--no-sandbox','--no-zygote','--disable-gpu']}, baseline, file, cases: [], scope: 'Actual native click helper extracted without edits from each source; controlled DOM fixtures test modal/ancestor clipping and occlusion. Production data dialog is verified separately by the nine-case data suite.' };
let browser;
function helper(source, readNativeInteractiveTarget) {
  const utilities = source.slice(source.indexOf('async function evaluate(cdp,fn,...args){'), source.indexOf('async function screenshot(cdp,name,receipt){'));
  const click = source.slice(source.indexOf('async function click(cdp,selector){'), source.indexOf('async function bounds(cdp,selector){'));
  assert.ok(utilities.startsWith('async function evaluate') && click.startsWith('async function click'));
  return { click: new Function('delay', 'readNativeInteractiveTarget', utilities + '\n' + click + '\nreturn click;')(ms => new Promise(resolve => setTimeout(resolve, ms)), readNativeInteractiveTarget), utilitiesSha256: hash(utilities), helperSha256: hash(click) };
}
(async () => {
  const oldSource = execFileSync('git', ['show', baseline + ':' + file], { cwd: root, encoding: 'utf8' });
  const newSource = await fs.readFile(root + '/' + file, 'utf8');
  const geometryPath = 'scripts/verify-workspace-browser.mjs';
  const { readNativeInteractiveTarget } = await import(pathToFileURL(path.join(root, geometryPath)).href);
  const old = helper(oldSource), current = helper(newSource, readNativeInteractiveTarget);
  report.sources = { baseline: { sourceSha256: hash(oldSource), helperSha256: old.helperSha256 }, candidate: { sourceSha256: hash(newSource), helperSha256: current.helperSha256, geometryPath, geometrySourceSha256: hash(await fs.readFile(path.join(root, geometryPath))), geometryFunctionSha256: hash(readNativeInteractiveTarget.toString()) } };
  browser = await chromium.launch({ executablePath: browserPath, headless: true, args: ['--no-sandbox', '--no-zygote', '--disable-gpu'] });
  report.browser = browser.version();
  const context = await browser.newContext({ viewport: { width: 800, height: 600 } });
  const page = await context.newPage(), cdp = await context.newCDPSession(page);
  const fixture = `<!doctype html><meta charset="utf-8"><style>
    * {box-sizing:border-box} body {margin:0;background:#0b0e14;color:#e6ebf2}
    #owner {position:absolute;left:120px;top:180px;width:320px;height:120px;overflow:hidden}
    dialog {position:fixed;margin:0;inset:20px auto auto 20px;width:420px;height:260px;padding:16px;overflow:auto;background:#131922;color:inherit}
    button {height:44px;width:80px;white-space:nowrap}
    .clip {width:50px;height:50px;overflow:hidden;margin-top:12px}
    #outside {position:absolute;left:40px;top:380px}
    #occluded {position:absolute;left:300px;top:400px}
    #cover {position:absolute;left:300px;top:400px;width:80px;height:44px;z-index:20;background:#202a39}
  </style><main id="owner"><dialog id="modal"><button id="modal-free" aria-label="Modal return">Return</button><div class="clip"><button id="modal-clipped" aria-label="Clipped modal action">Clipped</button></div></dialog></main>
  <div id="outside" class="clip"><button id="ordinary-clipped" aria-label="Clipped page action">Clipped</button></div><button id="occluded" aria-label="Covered page action">Covered</button><div id="cover"></div>`;
  report.fixtureSha256 = hash(fixture);
  async function run(label, implementation, selector, modal, expectedError, markup = fixture) {
    await page.setContent(markup);
    await page.evaluate(open => { globalThis.clicks = []; document.querySelectorAll('button').forEach(button => button.addEventListener('click', () => globalThis.clicks.push(button.id))); if (open) document.querySelector('#modal').showModal(); }, modal);
    const row = { label, selector, modal, expectedError: expectedError || null, fixtureSha256: hash(markup) }; report.cases.push(row);
    try { await implementation.click(cdp, selector); } catch (error) { row.error = error.message; }
    row.observed = await page.evaluate(selector => {
      const target = document.querySelector(selector), r = target.getBoundingClientRect(), hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      return { clicks: globalThis.clicks, target: { left: r.left, right: r.right, top: r.top, bottom: r.bottom, width: r.width, height: r.height }, centerTopmost: hit === target || target.contains(hit), modal: Boolean(document.querySelector('#modal')?.matches(':modal')) };
    }, selector);
    if (expectedError) { assert.match(row.error || '', new RegExp(expectedError), label); assert.deepEqual(row.observed.clicks, [], label + ' must not click'); }
    else { assert.equal(row.error, undefined, label); assert.deepEqual(row.observed.clicks, [selector.slice(1)], label); }
    row.status = 'passed';
  }
  await run('baseline incorrectly clips visible top-layer target', old, '#modal-free', true, 'Click target clipped');
  await run('candidate clicks visible top-layer target outside DOM ancestor bounds', current, '#modal-free', true);
  await run('candidate rejects genuinely internally clipped modal target', current, '#modal-clipped', true, 'Click target clipped');
  await run('candidate rejects nonmodal clipped target', current, '#ordinary-clipped', false, 'Click target clipped');
  await run('candidate rejects nonmodal occluded target', current, '#occluded', false, 'Click target occluded');
  const fixedFixture = (body, markup) => '<!doctype html><style>*{box-sizing:border-box}body{margin:0;' + body + '}button{width:80px;height:44px}</style>' + markup;
  await run('candidate clicks viewport-fixed return above shifted clipped body', current, '#fixed-return', false, null,
    fixedFixture('margin-top:56px;height:calc(100vh - 56px);overflow:hidden', '<aside style="position:fixed;left:0;top:12px;width:44px;height:44px"><button id="fixed-return" style="width:44px">Back</button></aside>'));
  await run('candidate rejects fixed target clipped by transformed containing block', current, '#fixed-clipped', false, 'Click target clipped',
    fixedFixture('', '<section style="position:absolute;left:200px;top:200px;width:50px;height:60px;overflow:hidden;transform:translateZ(0)"><button id="fixed-clipped" style="position:fixed;left:0;top:0">Clipped</button></section>'));
  await run('candidate clicks fixed target escaping untransformed overflow ancestor', current, '#fixed-free', false, null,
    fixedFixture('', '<section style="position:absolute;left:200px;top:200px;width:50px;height:60px;overflow:hidden"><button id="fixed-free" style="position:fixed;left:40px;top:40px">Visible</button></section>'));
  await run('candidate rejects viewport-clipped fixed target', current, '#viewport-clipped', false, 'Click target clipped',
    fixedFixture('', '<button id="viewport-clipped" style="position:fixed;left:-20px;top:40px">Clipped</button>'));
  await run('candidate rejects CSS-hidden target with nonzero layout bounds', current, '#css-hidden', false, 'hidden',
    fixedFixture('', '<button id="css-hidden" style="position:fixed;left:40px;top:40px;visibility:hidden">Hidden</button>'));
  report.status = 'passed';
})().catch(error => { report.status = 'failed'; report.error = error.stack; process.exitCode = 1; }).finally(async () => {
  await browser?.close();
  report.finishedAt = new Date().toISOString();
  report.probeSha256 = hash(await fs.readFile(__filename));
  await fs.mkdir(path.dirname(out), {recursive:true});
  await fs.writeFile(out, JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify(report, null, 2));
});
