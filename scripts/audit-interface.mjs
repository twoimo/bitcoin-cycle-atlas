// Optional manual browser audit. Supply Playwright and Chrome paths through the
// environment; production and the ordinary test suite need neither dependency.
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { resolve, dirname, extname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

const root = resolve(process.argv[2] || resolve(dirname(fileURLToPath(import.meta.url)), '..'));
const output = resolve(process.argv[3] || resolve(root, 'build/interface-audit'));
const baseline = process.argv.includes('--baseline');
const standalone = process.argv.includes('--standalone');
const tabletCases = [
  {name:'btc',query:''},
  {name:'data',query:'?page=data',data:true},
  ...['ETHUSD','MSTR','BMNR'].map(symbol=>({name:symbol.toLowerCase(),query:`?symbol=${symbol}`})),
].flatMap(test=>[
  {...test,name:`${test.name}-tablet-portrait`,width:768,height:1024,touch:true},
  {...test,name:`${test.name}-tablet-landscape`,width:1024,height:768,touch:true},
]);
const { chromium } = await import(process.env.ATLAS_PLAYWRIGHT_MODULE || 'playwright');
const types = { '.html':'text/html', '.js':'application/javascript', '.json':'application/json', '.css':'text/css', '.svg':'image/svg+xml', '.png':'image/png' };
const dist = resolve(root, 'dist');
const server = createServer(async (req, res) => {
  try {
    const path = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    const file = resolve(dist, '.' + (path === '/' ? '/index.html' : path));
    if (!file.startsWith(dist + sep)) { res.writeHead(403).end(); return; }
    res.setHeader('content-type', types[extname(file)] || 'application/octet-stream');
    res.end(await readFile(file));
  } catch { res.writeHead(404).end(); }
});
await new Promise(done => server.listen(0, '127.0.0.1', done));
const origin = `http://127.0.0.1:${server.address().port}`;
await mkdir(output, {recursive:true});
let browser;
const results = [];
const cases = baseline ? [{name:'before-font-failure',query:'',width:1440,height:900}] : standalone ? [
  {name:'standalone-btc-desktop',query:'',width:1440,height:900},
  {name:'standalone-data-phone',query:'?page=data',width:390,height:844,data:true,touch:true},
  {name:'standalone-btc-tablet',query:'',width:768,height:1024,touch:true},
  {name:'standalone-data-tablet',query:'?page=data',width:1024,height:768,data:true,touch:true},
] : [
  {name:'font-load-success',query:'?page=data',width:1440,height:900,data:true,fontSuccess:true},
  {name:'btc-desktop',query:'',width:1440,height:900,reader:true},
  {name:'btc-phone',query:'',width:390,height:844,touch:true},
  {name:'btc-landscape',query:'',width:844,height:390,touch:true},
  {name:'data-desktop',query:'?page=data',width:1440,height:900,data:true},
  {name:'data-phone',query:'?page=data',width:390,height:844,data:true,touch:true},
  {name:'data-landscape',query:'?page=data',width:844,height:390,data:true,touch:true},
  ...['ETHUSD','MSTR','BMNR'].flatMap(symbol => [
    {name:`${symbol.toLowerCase()}-desktop`,query:`?symbol=${symbol}`,width:1440,height:900},
    {name:`${symbol.toLowerCase()}-phone`,query:`?symbol=${symbol}`,width:390,height:844,touch:true},
  ]),
  ...tabletCases,
];
try {
  browser = await chromium.launch({headless:true, executablePath:process.env.ATLAS_BROWSER_PATH, args:['--no-sandbox','--disable-dev-shm-usage']});
  for (const test of cases) {
    const context = await browser.newContext({viewport:{width:test.width,height:test.height}, hasTouch:Boolean(test.touch), deviceScaleFactor:1});
    const page = await context.newPage(), errors = [], missing = [], blocked = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('response', response => {if(response.status() >= 400 && response.url().startsWith(origin))missing.push({url:response.url().replace(origin,''),status:response.status()});});
    await page.route('**/*', route => {
      const url = route.request().url();
      if(url.startsWith(origin)||url.startsWith('file:')||url.startsWith('data:'))return route.continue();
      if(test.fontSuccess&&new URL(url).hostname==='fonts.googleapis.com')return route.fulfill({contentType:'text/css',body:'/* Successful optional CSS response; Korean fallback font supplied by the test environment. */'});
      blocked.push(new URL(url).hostname);
      return route.abort();
    });
    const url=standalone?`file://${resolve(root,'build/Bitcoin_Cycles_Comparison.html')}${test.query}`:origin+'/'+test.query;
    await page.goto(url, {waitUntil:'domcontentloaded',timeout:60000});
    await page.waitForFunction(() => ['ready','error'].includes(document.documentElement.dataset.boot), undefined, {timeout:60000});
    if(test.fontSuccess)await page.waitForFunction(()=>document.querySelector('#atlas-optional-fonts').media==='all');
    await page.evaluate(() => new Promise(done => requestAnimationFrame(() => requestAnimationFrame(done))));
    const state = await page.evaluate(() => ({
      boot:document.documentElement.dataset.boot,
      symbol:document.documentElement.dataset.symbol,
      background:getComputedStyle(document.body).backgroundColor,
      width:innerWidth,height:innerHeight,
      documentWidth:document.documentElement.scrollWidth,documentHeight:document.documentElement.scrollHeight,
      fontCssOptional:document.querySelector('#atlas-optional-fonts')?.media ?? null,
      visibleSvgPaths:[...document.querySelectorAll('svg')].filter(n=>n.getBoundingClientRect().width>0&&n.getBoundingClientRect().height>0).reduce((sum,n)=>sum+n.querySelectorAll('path').length,0),
    }));
    assert.equal(state.boot, baseline ? 'error' : 'ready', `${test.name} boot`);
    assert.deepEqual(errors, [], `${test.name} uncaught browser errors`);
    assert.deepEqual(missing, [], `${test.name} missing local resources`);
    if(!baseline)assert(state.documentWidth <= test.width+1, `${test.name} page-level horizontal overflow`);
    if(test.data) {
      await page.locator('#data-body tr[data-asset-symbol]').last().waitFor();
      state.table = await page.evaluate(() => {
        const rows = [...document.querySelectorAll('#data-body tr[data-asset-symbol]')];
        const header = document.querySelector('.daily-heading').getBoundingClientRect();
        const dark = getComputedStyle(document.querySelector('.asset-comparison-table')).backgroundColor;
        return {symbols:rows.map(row=>row.dataset.assetSymbol),headerHeight:header.height,background:dark,contextHidden:document.querySelector('#asset-context').hidden,footerPresent:Boolean(document.querySelector('.asset-table-footer'))};
      });
      assert.equal(state.table.symbols.length,18); assert.equal(state.table.symbols[0],'BTC');
      assert(state.table.headerHeight <= 64, `${test.name} compact single-row header`);
      assert.equal(state.table.contextHidden,true);
      assert.equal(state.table.footerPresent,false,'Preserve the latest footer-removal change');
      await page.locator('#daily-method-open').click();
      assert(await page.locator('#daily-method-dialog').evaluate(dialog=>dialog.open));
      state.dialogBackground = await page.locator('#daily-method-dialog').evaluate(dialog=>getComputedStyle(dialog).backgroundColor);
      assert(!/^rgb\(2[0-5]\d, 2[0-5]\d, 2[0-5]\d\)$/.test(state.dialogBackground));
      await page.locator('#daily-method-close').click();
      if(await page.locator('#asset-scroll-end').isVisible())await page.locator('#asset-scroll-end').click();
      await page.locator('tr[data-asset-symbol="BTC"] .asset-judgment').click();
      assert.match(await page.locator('#daily-method-content').innerText(),/BTC/);
      await page.locator('#daily-method-close').click();
      if(await page.locator('#asset-scroll-start').isVisible())await page.locator('#asset-scroll-start').click();
      await page.locator('#asset-refresh').click();
      await page.waitForFunction(()=>!document.querySelector('#asset-refresh').disabled&&document.querySelectorAll('#data-body tr[data-asset-symbol]').length===18);
      state.table.pinnedHeading=[];
      for(const side of ['start','middle','end']) {
        await page.locator('#asset-table-scroll').evaluate((panel,side)=>{
          panel.scrollLeft=(panel.scrollWidth-panel.clientWidth)*(side==='start'?0:side==='middle'?0.5:1);
          panel.scrollTop=0;
        },side);
        await page.evaluate(()=>new Promise(done=>requestAnimationFrame(done)));
        const geometry=await page.evaluate(()=>{
          const panel=document.querySelector('#asset-table-scroll');
          const heading=document.querySelector('.asset-mobile-name-header');
          const cell=document.querySelector('tr[data-asset-symbol="BTC"] .asset-name');
          const h=heading.getBoundingClientRect(),c=cell.getBoundingClientRect();
          return {scrollLeft:panel.scrollLeft,headingLeft:h.left,cellLeft:c.left,headingWidth:h.width,cellWidth:c.width,
            visible:getComputedStyle(heading).display!=='none',
            topmost:document.elementFromPoint(h.left+h.width/2,h.top+h.height/2)?.closest('th')===heading};
        });
        assert(geometry.visible,`${test.name} ${side} identity heading must be visible`);
        assert(Math.abs(geometry.headingLeft-geometry.cellLeft)<=1,`${test.name} ${side} pinned identity heading must align with its body column`);
        assert(Math.abs(geometry.headingWidth-geometry.cellWidth)<=1,`${test.name} ${side} identity heading must span exactly its body column`);
        assert(geometry.topmost,`${test.name} ${side} pinned identity heading must cover scrolling headings`);
        state.table.pinnedHeading.push({side,...geometry});
      }
      await page.locator('#asset-table-scroll').evaluate(panel=>panel.scrollLeft=0);
    }
    if(test.reader) {
      await page.locator('[data-reader="guide"]').first().click();
      const handle = page.locator('.reader-resize'), rect = await handle.boundingBox();
      assert(rect);
      const start = await page.locator('#chart-reader').evaluate(el=>el.getBoundingClientRect().width);
      await page.mouse.move(rect.x+rect.width/2,rect.y+Math.min(80,rect.height/2));
      await page.mouse.down();
      await page.mouse.move(rect.x+rect.width/2-50,rect.y+Math.min(80,rect.height/2));
      await page.mouse.up();
      const end = await page.locator('#chart-reader').evaluate(el=>el.getBoundingClientRect().width);
      assert(Math.abs(end-Math.min(420,start+50))<=1, `Reader width ${start} -> ${end}`);
      await handle.focus();await page.keyboard.press('Home');
      assert.equal(await page.locator('#chart-reader').evaluate(el=>Math.round(el.getBoundingClientRect().width)),320);
      state.reader = {start,end,reset:320};
      await page.locator('#chart-reader .reader-heading button').click();
    }
    if(test.name==='btc-phone') {
      const svg=page.locator('#lab-chart');
      const rect=await svg.boundingBox();assert(rect);
      const session=await context.newCDPSession(page);
      const x=Math.round(rect.x+rect.width*.55),y=Math.round(rect.y+rect.height*.4);
      await session.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y}]});
      await page.waitForTimeout(500);
      for(let i=1;i<=12;i++)await session.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:x-i*3,y}]});
      await session.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
      await page.evaluate(()=>new Promise(done=>requestAnimationFrame(done)));
      state.touchReplay = 'native Chromium hold, 12 moves, release';
      assert.deepEqual(errors,[]);
    }
    await page.screenshot({path:resolve(output,`${test.name}.png`)});
    results.push({name:test.name,...state,blockedHosts:[...new Set(blocked)],pageErrors:errors,missingResources:missing});
    await context.close();
  }
  const sourceFiles = ['dist/index.html','dist/styles.css','dist/daily-data.css','dist/daily-data-view.js','dist/viewport-workspace.js','dist/chart-touch-tracking.js','dist/analysis-dock.js','dist/market-structure.js'];
  const hashes = Object.fromEntries(await Promise.all(sourceFiles.map(async file=>[file,createHash('sha256').update(await readFile(resolve(root,file))).digest('hex')])));
  if(standalone)hashes['build/Bitcoin_Cycles_Comparison.html']=createHash('sha256').update(await readFile(resolve(root,'build/Bitcoin_Cycles_Comparison.html'))).digest('hex');
  const receipt={browser:await browser.version(),baseline,standalone,policy:'External HTTP requests aborted, including market APIs. In font-load-success only, the optional font stylesheet receives a successful empty CSS response. Korean glyphs use a locally installed official Noto Sans KR fallback. Source snapshots provide deterministic market data.',hashes,cases:results};
  await writeFile(resolve(output,'interface.json'),JSON.stringify(receipt,null,2)+'\n');
  console.log(JSON.stringify({browser:receipt.browser,baseline,cases:results.length,passed:true,output}));
} finally {
  await browser?.close();
  await new Promise(done=>server.close(done));
}
