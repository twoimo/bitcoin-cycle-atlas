const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const http = require('node:http');
const fs = require('node:fs/promises');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { execFileSync } = require('node:child_process');

const assert = require('node:assert/strict');
const root = path.resolve(process.env.ATLAS_REPO_ROOT || path.join(__dirname, '../../..'));
const browserPath = process.env.ATLAS_BROWSER_PATH;
assert.ok(browserPath, 'Set ATLAS_BROWSER_PATH to native Chromium; missing rendering is blocked, not a pass.');
const label = process.argv[2] || 'candidate';
const output = path.resolve(process.env.ATLAS_PROBE_OUT || path.join(root, 'build/data-board-probe-' + label));
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml' };
const report = { status: 'running', startedAt: new Date().toISOString(), runtime: {node: process.version, browserPath, launchArgs: ['--no-sandbox','--no-zygote','--disable-gpu']}, label, sourceCommit: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim(), sourceHashes: {}, cases: [], scope: 'Focused native geometry and return navigation probe; not the full browser or Hallmark gate.' };
let server, browser;
(async () => {
  await fs.mkdir(output, { recursive: true });
  for (const file of ['dist/daily-data.css', 'dist/atlas-shell.css', 'dist/daily-data-view.js', 'dist/atlas-shell.js', 'dist/market-lab.css']) {
    report.sourceHashes[file] = createHash('sha256').update(await fs.readFile(path.join(root, file))).digest('hex');
  }
  server = http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url, 'http://local');
      const file = path.join(root, 'dist', url.pathname === '/' ? 'index.html' : url.pathname);
      const bytes = await fs.readFile(file);
      res.writeHead(200, { 'Content-Type': mime[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
      res.end(bytes);
    } catch { res.writeHead(404); res.end('Not found'); }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = 'http://127.0.0.1:' + server.address().port;
  browser = await chromium.launch({ executablePath: browserPath, headless: true, args: ['--no-sandbox', '--no-zygote', '--disable-gpu'] });
  report.browser = browser.version();
  for (const spec of [{ width: 320, height: 900, touch: true }, { width: 900, height: 430, touch: true }, { width: 1440, height: 900, touch: false }]) {
    const context = await browser.newContext({ viewport: { width: spec.width, height: spec.height }, hasTouch: spec.touch, isMobile: spec.touch, reducedMotion: 'reduce', colorScheme: 'dark' });
    await context.route('**/*', route => route.request().url().startsWith(base) ? route.continue() : route.abort('blockedbyclient'));
    const page = await context.newPage();
    const row = { ...spec, runtimeErrors: [], requestFailures: [] }; report.cases.push(row);
    page.on('pageerror', error => row.runtimeErrors.push(error.message));
    page.on('requestfailed', req => row.requestFailures.push({ url: req.url(), error: req.failure()?.errorText }));
    await page.goto(base + '/?indicator-hide=volume&indicator-list=open&indicator-settings=%7B%7D&page=data');
    await page.waitForFunction(() => document.querySelectorAll('#data-body tr[data-asset-symbol]').length === 18);
    await page.evaluate(async () => { await document.fonts.ready; await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))); });
    row.geometry = await page.evaluate(() => {
      const rect = el => { const r = el.getBoundingClientRect(), s = getComputedStyle(el); return { left: r.left, right: r.right, top: r.top, bottom: r.bottom, width: r.width, height: r.height, display: s.display, visible: el.checkVisibility(), name: el.getAttribute('aria-label') || el.textContent.trim(), outline: s.outline, position: s.position }; };
      return { shell: document.body.dataset.shell, page: document.body.dataset.page, viewport: { width: innerWidth, height: innerHeight }, documentWidth: document.documentElement.scrollWidth, toolbar: rect(document.querySelector('.daily-heading')), actions: [...document.querySelectorAll('.daily-heading .daily-action')].map(el => ({ id: el.id, ...rect(el) })), shellTitle: rect(document.querySelector('.atlas-shell-heading')), returnAction: rect(document.querySelector('.atlas-sidebar .atlas-brand')), oldBack: rect(document.querySelector('.daily-back')), oldTitle: rect(document.querySelector('.daily-heading h1')), tableRows: [...document.querySelectorAll('#data-body tr[data-asset-symbol]')].map(r => r.dataset.assetSymbol), panel: rect(document.querySelector('#asset-table-scroll')) };
    });
    if (label !== 'baseline') {
      assert.ok(row.geometry.toolbar.height <= 64, 'Compact action toolbar');
      if (spec.touch) {
        assert.ok(row.geometry.actions.every(action => action.width >= 44 && action.height >= 44), 'Full action touch targets');
        assert.ok(row.geometry.returnAction.width >= 44 && row.geometry.returnAction.height >= 44, 'Full return touch target');
      }
    }
    await page.screenshot({ path: output + '/data-' + spec.width + 'x' + spec.height + '.png' });
    await page.locator('#daily-method-open').click();
    await page.locator('#daily-method-dialog').evaluate(dialog => { dialog.scrollTop = dialog.scrollHeight; });
    row.scrolledDialog = await page.evaluate(() => {
      const dialog = document.querySelector('#daily-method-dialog'), close = document.querySelector('#daily-method-close'), data = document.querySelector('#data-view');
      const box = el => { const r = el.getBoundingClientRect(); return { left: r.left, right: r.right, top: r.top, bottom: r.bottom, width: r.width, height: r.height }; };
      const c = box(close), hit = document.elementFromPoint(c.left + c.width / 2, c.top + c.height / 2);
      return { modal: dialog.matches(':modal'), scrollTop: dialog.scrollTop, maxScroll: dialog.scrollHeight - dialog.clientHeight, dialog: box(dialog), close: c, dataAncestor: box(data), topmost: hit === close || close.contains(hit) };
    });
    await page.screenshot({ path: output + '/method-' + spec.width + 'x' + spec.height + '.png' });
    await page.locator('#daily-method-close').click();
    row.nativeCloseSucceeded = !(await page.locator('#daily-method-dialog').evaluate(dialog => dialog.open));
    assert.ok(row.nativeCloseSucceeded && row.scrolledDialog.topmost, 'Native scrolled-modal close');
    if (spec.width === 320) {
      const cdp = await context.newCDPSession(page);
      const gesture = await page.locator('#asset-table-scroll').evaluate(panel => { const r = panel.getBoundingClientRect(); return { x: r.right - 30, y: r.top + 85, before: panel.scrollLeft }; });
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: gesture.x, y: gesture.y, id: 1 }] });
      for (let step = 1; step <= 12; step++) {
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: gesture.x - step * 12, y: gesture.y, id: 1 }] });
        await page.waitForTimeout(16);
      }
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      await page.waitForTimeout(400);
      row.nativeScroll = { ...gesture, after: await page.locator('#asset-table-scroll').evaluate(panel => panel.scrollLeft) };
      assert.ok(row.nativeScroll.after > row.nativeScroll.before, 'Actual native horizontal gesture');
      const back = page.locator('.atlas-sidebar .atlas-brand');
      await back.focus();
      await page.keyboard.press('Tab');
      await page.keyboard.press('Shift+Tab');
      row.returnFocus = await page.evaluate(() => ({ onBrand: document.activeElement.matches('.atlas-sidebar .atlas-brand'), label: document.activeElement.getAttribute('aria-label'), outline: getComputedStyle(document.activeElement).outline, focusVisible: document.activeElement.matches(':focus-visible') }));
      assert.ok(row.returnFocus.onBrand && row.returnFocus.focusVisible && row.returnFocus.outline.includes('2px'), 'Visible keyboard focus on chart return');
      await page.keyboard.press('Enter');
      await page.waitForFunction(() => document.body.dataset.page === 'outlook' && document.body.dataset.shell === 'chart');
      await page.waitForSelector('#lab-chart path', { state: 'attached' });
      const readPerimeter = () => Object.fromEntries(['.atlas-canvas-heading','.workbench-bottom-bar','.atlas-sidebar','.workbench-rail'].map(selector => {
        const el=document.querySelector(selector),r=el.getBoundingClientRect();return [selector,{connected:el.isConnected,left:r.left,right:r.right,top:r.top,bottom:r.bottom,width:r.width,height:r.height}];
      }));
      const readScrollOwners = () => ['html','body','.workspace','#main','#outlook-view','#lab-chart-stage','.atlas-plot','.atlas-center-frame:not([hidden])'].map(selector=>{
        const el=document.querySelector(selector);if(!el)return {selector,present:false};const r=el.getBoundingClientRect(),css=getComputedStyle(el);return {selector,left:r.left,right:r.right,width:r.width,scrollLeft:el.scrollLeft,scrollWidth:el.scrollWidth,clientWidth:el.clientWidth,overflowX:css.overflowX};
      });
      row.perimeterBeforeCenter = await page.evaluate(readPerimeter);
      row.returnedChart = await page.evaluate(() => ({ page: document.body.dataset.page, shell: document.body.dataset.shell, dataHidden: document.querySelector('#data-view').hidden, headerHidden: document.querySelector('.atlas-dashboard-header').hidden, paths: document.querySelectorAll('#lab-chart path').length, detailsToggle: document.querySelector('#mobile-details-toggle')?.getAttribute('aria-label') }));
      await page.locator('#mobile-details-toggle').click();
      await page.locator('.atlas-nav [data-atlas-page="data"]').click();
      await page.waitForFunction(() => document.body.dataset.centerTool === 'data' && [...document.querySelectorAll('.atlas-center-frame:not([hidden])')].some(frame => frame.contentDocument?.querySelectorAll('#data-body tr[data-asset-symbol]').length === 18));
      row.perimeterOnCenterEntry=await page.evaluate(readPerimeter);
      row.scrollOwnersOnCenterEntry=await page.evaluate(readScrollOwners);
      row.returnedData = await page.evaluate(async () => {
        const frame = document.querySelector('.atlas-center-frame:not([hidden])'), doc = frame.contentDocument;
        const rect = el => { const r=el.getBoundingClientRect(),css=doc.defaultView.getComputedStyle(el);return {left:r.left,right:r.right,top:r.top,bottom:r.bottom,width:r.width,height:r.height,position:css.position,overflow:css.overflow,maxWidth:css.maxWidth}; };
        const childActions=await Promise.all([...doc.querySelectorAll('.daily-heading .daily-action')].map(async el=>{
          const box=rect(el),hit=doc.elementFromPoint((box.left+box.right)/2,(box.top+box.bottom)/2);
          const clip=await new Promise(resolve=>{const observer=new doc.defaultView.IntersectionObserver(entries=>{observer.disconnect();const r=entries[0].intersectionRect;resolve({left:r.left,right:r.right,top:r.top,bottom:r.bottom,width:r.width,height:r.height});});observer.observe(el);});
          return {id:el.id,...box,clip,disabled:el.disabled,name:el.getAttribute('aria-label'),topmost:Boolean(hit&&(hit===el||el.contains(hit)))};
        }));
        return { page: document.body.dataset.page, shell: document.body.dataset.shell, center: document.body.dataset.centerTool, frameTitle: frame.title, frameSrc: frame.src, frameRows: doc.querySelectorAll('#data-body tr[data-asset-symbol]').length, active: document.querySelector('.atlas-nav [data-atlas-page="data"]')?.getAttribute('aria-current'),
          embedded:doc.body.dataset.embedded,childShell:doc.body.dataset.shell||null,childViewport:{width:doc.defaultView.innerWidth,height:doc.defaultView.innerHeight},childOwner:rect(doc.querySelector('#data-view')),childToolbar:rect(doc.querySelector('.daily-heading')),childActions };
      });
      assert.equal(row.returnedData.center, 'data'); assert.equal(row.returnedData.frameRows, 18); assert.equal(row.returnedData.active, 'page');
      await page.screenshot({ path: output + '/return-navigation.png' });
      if (label !== 'baseline') {
        assert.deepEqual(row.returnedData.childActions.map(action=>action.id),['asset-refresh','asset-history-open','daily-method-open','export-raw']);
        assert.ok(row.returnedData.childToolbar.height<=64&&row.returnedData.childToolbar.width===row.returnedData.childOwner.width,'Embedded toolbar fills its own compact row');
        assert.ok(row.returnedData.childToolbar.left>=0&&row.returnedData.childToolbar.right<=row.returnedData.childViewport.width,'Embedded toolbar stays within its iframe viewport');
        for (const action of row.returnedData.childActions) {
          assert.ok(action.width>=44&&action.height>=44&&action.name&&!action.disabled&&action.topmost,'Embedded action is named, enabled, touch-sized and hit-testable');
          assert.ok(action.left>=action.clip.left-1&&action.right<=action.clip.right+1&&action.top>=action.clip.top-1&&action.bottom<=action.clip.bottom+1,'Embedded action is fully inside the actual painted clip');
        }
        const child=page.frameLocator('.atlas-center-frame:not([hidden])');
        const nativeChildClick=async selector=>{
          const box=await child.locator(selector).boundingBox(),frameBox=await page.locator('.atlas-center-frame:not([hidden])').boundingBox();
          assert.ok(box&&box.x>=frameBox.x&&box.x+box.width<=frameBox.x+frameBox.width&&box.y>=frameBox.y&&box.y+box.height<=frameBox.y+frameBox.height,'Actual iframe target fits mapped parent bounds');
          const point={x:box.x+box.width/2,y:box.y+box.height/2};
          assert.equal(await page.evaluate(({x,y})=>document.elementFromPoint(x,y)?.matches('.atlas-center-frame:not([hidden])'),point),true,'Parent hit target is the active iframe');
          await page.mouse.click(point.x,point.y);
        };
        await nativeChildClick('#daily-method-open');
        await child.locator('#daily-method-dialog').evaluate(dialog=>{dialog.scrollTop=dialog.scrollHeight;});
        row.embeddedMethod=await child.locator('#daily-method-dialog').evaluate(dialog=>{
          const doc=dialog.ownerDocument,close=doc.querySelector('#daily-method-close'),r=close.getBoundingClientRect(),hit=doc.elementFromPoint(r.left+r.width/2,r.top+r.height/2),h=dialog.querySelector('h2').getBoundingClientRect();
          return {open:dialog.open,modal:dialog.matches(':modal'),scrollTop:dialog.scrollTop,maxScroll:dialog.scrollHeight-dialog.clientHeight,close:{left:r.left,right:r.right,top:r.top,bottom:r.bottom,width:r.width,height:r.height},heading:{left:h.left,right:h.right,top:h.top,bottom:h.bottom},viewport:{width:doc.defaultView.innerWidth,height:doc.defaultView.innerHeight},topmost:hit===close||close.contains(hit)};
        });
        assert.ok(row.embeddedMethod.open&&row.embeddedMethod.modal&&row.embeddedMethod.topmost&&row.embeddedMethod.close.width>=44&&row.embeddedMethod.close.height>=44);
        for (const box of [row.embeddedMethod.close,row.embeddedMethod.heading]) assert.ok(box.left>=0&&box.right<=row.embeddedMethod.viewport.width&&box.top>=0&&box.bottom<=row.embeddedMethod.viewport.height);
        await page.screenshot({path:output+'/embedded-method.png'});
        await nativeChildClick('#daily-method-close');
        assert.equal(await child.locator('#daily-method-dialog').evaluate(dialog=>dialog.open),false);
        row.perimeterAfterCenter=await page.evaluate(readPerimeter);
        row.scrollOwnersAfterCenter=await page.evaluate(readScrollOwners);
        assert.deepEqual(row.perimeterAfterCenter,row.perimeterBeforeCenter,'Center board must preserve all four parent perimeter regions');
        await page.locator('#mobile-details-toggle').click();
        await page.locator('.atlas-nav [data-atlas-page="outlook"]').click();
        await page.waitForFunction(()=>!document.body.dataset.centerTool&&document.querySelector('.atlas-center-frame').hidden);
        row.returnFromCenter=await page.evaluate(()=>({page:document.body.dataset.page,shell:document.body.dataset.shell,center:document.body.dataset.centerTool||null,chartPaths:document.querySelectorAll('#lab-chart path').length,visibleFrames:document.querySelectorAll('.atlas-center-frame:not([hidden])').length}));
        assert.equal(row.returnFromCenter.page,'outlook');assert.equal(row.returnFromCenter.shell,'chart');assert.equal(row.returnFromCenter.visibleFrames,0);assert.ok(row.returnFromCenter.chartPaths>0);
      }
    }
    assert.deepEqual(row.runtimeErrors, [], 'No browser runtime errors');
    await page.close();
  }
  report.status = 'passed';
})().catch(error => { report.status = 'failed'; report.error = error.stack; process.exitCode = 1; }).finally(async () => {
  await browser?.close();
  if (server) await new Promise(resolve => server.close(resolve));
  report.finishedAt = new Date().toISOString();
  report.probeSha256 = createHash('sha256').update(await fs.readFile(__filename)).digest('hex');
  await fs.writeFile(output + '/report.json', JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify(report, null, 2));
});
