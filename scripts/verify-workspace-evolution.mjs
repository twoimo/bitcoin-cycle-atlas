import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';

const root = resolve(process.argv[2] || '.'), output = resolve(process.argv[3] || 'build/workspace-evolution');
const standalone = process.argv.find(value => value.startsWith('--standalone='))?.slice('--standalone='.length);
const { chromium } = await import(process.env.ATLAS_PLAYWRIGHT_MODULE || 'playwright');
const dist = resolve(root, 'dist');
const server = createServer(async (req, res) => {
  try {
    const path = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    const file = resolve(dist, '.' + (path === '/' ? '/index.html' : path));
    assert.ok(file.startsWith(dist + sep));
    res.setHeader('Content-Type', ({ '.html':'text/html','.js':'application/javascript','.json':'application/json','.css':'text/css','.svg':'image/svg+xml','.png':'image/png' })[extname(file)] || 'application/octet-stream');
    res.end(await readFile(file));
  } catch { res.writeHead(404).end(); }
});
await mkdir(output, { recursive: true }); await new Promise(done => server.listen(0,'127.0.0.1',done));
const origin = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({ headless:true,executablePath:process.env.ATLAS_BROWSER_PATH,args:['--no-sandbox','--disable-dev-shm-usage'] });
const cases = [
  { name:'desktop', width:1440,height:900 },
  { name:'phone',width:390,height:844,touch:true },
  { name:'tablet-split',width:540,height:900,touch:true },
  { name:'worker-unavailable',width:390,height:844,touch:true,blockWorker:true },
];
if (standalone) cases.push({name:'standalone',width:390,height:844,touch:true,standalone:true});
const results = [];
try {
  for (const item of cases) {
    const context = await browser.newContext({viewport:{width:item.width,height:item.height},hasTouch:Boolean(item.touch)}),page=await context.newPage(),errors=[],missing=[];
    page.on('pageerror',error=>errors.push(error.message));
    page.on('response',response=>{if(response.url().startsWith(origin)&&response.status()>=400)missing.push(response.url());});
    await page.route('**/*',route=>{
      const url=route.request().url();
      if(item.blockWorker&&/\/forecast-worker\.js/.test(url))return route.abort();
      return url.startsWith(origin)||/^(file|data|blob):/.test(url)?route.continue():route.abort();
    });
    await page.addInitScript(()=>{
      window.__evolutionStates=[];
      document.addEventListener('atlas:workbench-state',event=>window.__evolutionStates.push({...event.detail,time:performance.now()}));
    });
    await page.goto(item.standalone?`file://${resolve(standalone)}?page=data`:`${origin}/?page=data`);
    await page.waitForFunction(()=>document.documentElement.dataset.boot==='ready');
    const initial = await page.evaluate(()=>({rows:[...document.querySelectorAll('#data-body tr[data-asset-symbol]')].map(row=>row.dataset.assetSymbol),resources:performance.getEntriesByType('resource').map(r=>r.name),chartControllers:document.querySelectorAll('#workbench-annotations').length}));
    assert.equal(initial.rows.length,18);assert.equal(initial.rows[0],'BTC');
    assert.equal(initial.chartControllers,0,'The table must not initialize the hidden chart controller');
    assert.ok(!initial.resources.some(url=>/\/lab-view\.js/.test(url)),'The table must not fetch its hidden chart module');
    await page.locator('[data-view="outlook"]:visible').first().click();
    await page.waitForFunction(()=>window.__evolutionStates.some(state=>state.scenario==='base'));
    assert.equal(await page.locator('#workbench-annotations').count(),1);
    const hiddenVolume = await page.evaluate(()=>window.AtlasPerformance.snapshot().actions.entries.filter(e=>e.name==='volume-projection'));
    assert.equal(hiddenVolume.length,0,'A hidden volume indicator must not fit/project future volume');
    await page.evaluate(()=>{
      window.__evolutionStates=[];window.__heartbeat=[];
      window.__heartbeatTimer=setInterval(()=>window.__heartbeat.push(performance.now()),16);
      for(const scenario of ['stress','accelerated','wait']){const select=document.querySelector('#lab-scenario');select.value=scenario;select.dispatchEvent(new Event('change',{bubbles:true}));}
      document.dispatchEvent(new CustomEvent('atlas:chart-command',{detail:{action:'frequency',value:'weekly'}}));
    });
    await page.waitForFunction(()=>window.__evolutionStates.some(state=>state.scenario==='wait'&&state.frequency==='weekly'));
    const latest = await page.evaluate(()=>{clearInterval(window.__heartbeatTimer);return {states:window.__evolutionStates.map(s=>({scenario:s.scenario,frequency:s.frequency})),ticks:window.__heartbeat.length,diagnostics:window.AtlasPerformance.snapshot(),value:document.querySelector('#lab-scenario').value};});
    assert.equal(latest.value,'wait');
    assert.ok(!latest.states.some(state=>['stress','accelerated'].includes(state.scenario)),'Superseded worker results must never publish');
    assert.ok(latest.diagnostics.actions.entries.some(e=>e.name==='forecast-compute'&&e.details.status==='complete'||e.name==='forecast-compute'&&e.details.status==='ready'));
    const modes=latest.diagnostics.actions.entries.filter(e=>e.name==='forecast-compute').map(e=>e.details.mode);
    assert.ok(modes.includes(item.standalone||item.blockWorker?'main-thread-fallback':'worker'));
    await page.locator('#workbench-undo').click();
    await page.waitForFunction(()=>window.__evolutionStates.at(-1)?.scenario==='base');
    await page.locator('[data-view="data"]').first().evaluate(button=>button.click());
    await page.waitForFunction(()=>document.body.dataset.page==='data');
    await page.locator('[data-view="outlook"]:visible').first().click();
    await page.waitForFunction(()=>document.body.dataset.page==='outlook');
    assert.equal(await page.locator('#workbench-annotations').count(),1,'Reopening must not duplicate chart mounts');
    const dimensions=await page.evaluate(()=>({width:innerWidth,scrollWidth:document.documentElement.scrollWidth}));
    assert.ok(dimensions.scrollWidth<=dimensions.width+1);
    assert.deepEqual(errors,[]);assert.deepEqual(missing,[]);
    await page.screenshot({path:resolve(output,`${item.name}.png`)});
    results.push({name:item.name,initial:{rows:initial.rows.length,chartControllers:initial.chartControllers},latest:{states:latest.states,ticks:latest.ticks,modes},dimensions,errors,missing});
    await context.close();
  }
  await writeFile(resolve(output,'report.json'),JSON.stringify({status:'PASS',browser:browser.version(),scope:'Real Chromium routes/DOM, module workers, offline fallback, cancellation and undo. Touch viewport emulation, not physical Safari/iOS.',results},null,2));
  console.log(JSON.stringify({status:'PASS',cases:results.map(r=>r.name)},null,2));
}finally{await browser.close();await new Promise(done=>server.close(done));}
