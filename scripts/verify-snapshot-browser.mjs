import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile,mkdir,writeFile,readdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {validateSnapshot} from '../dist/market-lab-math.js';

// Run after build:web. This is a real-browser check with explicitly synthetic
// HTTP responses; it does not connect to the user's service or publish data.
const root=fileURLToPath(new URL('../',import.meta.url));
const output=path.resolve(root,process.argv[2]??'build/snapshot-browser');
const {chromium}=await import(process.env.ATLAS_PLAYWRIGHT_MODULE??'playwright');
const snapshot=validateSnapshot(JSON.parse(await readFile(path.join(root,'dist/data/market-lab.json'),'utf8')));
const revision=createHash('sha256').update(JSON.stringify(snapshot)).digest('hex');
const older=structuredClone(snapshot);older.generatedAt=new Date(Date.parse(snapshot.generatedAt)-86400000).toISOString();older.markets=[];
for(const region of Object.values(older.regions))for(const axis of Object.values(region.axes))axis.values=[];
validateSnapshot(older);
let mode='api',pending=null,backtest=null;
const report={kind:'native-snapshot-provenance',status:'running',startedAt:new Date().toISOString(),syntheticResponses:true,revision,checks:[],runtimeErrors:[],sourceHashes:{}};
const json=(response,value,status=200)=>{response.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store'});response.end(JSON.stringify(value));};
const server=createServer(async(request,response)=>{
  try{
    const url=new URL(request.url,'http://localhost');
    if(url.pathname==='/api/v1/market-lab'){
      if(mode==='pending'){pending=response;return;}
      return mode==='api'?json(response,{schemaVersion:1,revision,evaluatedAt:new Date().toISOString(),snapshot}):json(response,{error:'synthetic API interruption'},503);
    }
    if(url.pathname==='/api/v1/market-lab/collection')return json(response,{schemaVersion:1,evaluatedAt:new Date().toISOString(),schedule:{enabled:false,running:false,intervalMs:900000,nextDueAt:null},latest:null,lastSuccess:null});
    if(url.pathname==='/data/market-lab.json')return mode==='failed'?json(response,{error:'synthetic saved-copy interruption'},503):json(response,older);
    if(url.pathname==='/api/v1/market-lab/backtest'){
      let body='';for await(const chunk of request)body+=chunk;backtest=JSON.parse(body);
      return json(response,{error:'synthetic request captured; no backtest service invoked'},503);
    }
    if(url.pathname.startsWith('/market-lab/assets/')){
      const name=path.basename(url.pathname),bytes=await readFile(path.join(root,'build/web/assets',name));
      response.writeHead(200,{'Content-Type':name.endsWith('.js')?'text/javascript':'text/css'});return response.end(bytes);
    }
    if(url.pathname.startsWith('/market-lab/')){response.writeHead(200,{'Content-Type':'text/html'});return response.end(await readFile(path.join(root,'build/web/index.html')));}
    response.writeHead(404);response.end();
  }catch(error){json(response,{error:String(error)},500);}
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const base='http://127.0.0.1:'+server.address().port;
let browser;
try{
  await mkdir(output,{recursive:true});
  browser=await chromium.launch({headless:true,...(process.env.ATLAS_BROWSER_PATH?{executablePath:process.env.ATLAS_BROWSER_PATH}:{}),args:['--no-sandbox','--no-zygote','--single-process','--disable-gpu']});
  report.browserVersion=browser.version();
  const context=await browser.newContext({viewport:{width:1440,height:900}});
  await context.route('**/*',route=>new URL(route.request().url()).origin===base?route.continue():route.abort());
  const page=await context.newPage();page.on('pageerror',error=>report.runtimeErrors.push(String(error)));
  await page.goto(base+'/market-lab/');
  await page.locator('.ml-axis-value').first().waitFor();
  const value=await page.locator('.ml-axis-value').first().textContent();
  mode='older';await page.locator('.ml-collection-line button').click();
  await page.locator('.ml-delivery').filter({hasText:'직전 자료 유지'}).waitFor();
  assert.equal(await page.locator('.ml-axis-value').first().textContent(),value);
  assert.equal(await page.getByText('스냅샷은 읽었지만 관측 자료가 없습니다.',{exact:false}).count(),0);
  report.checks.push('older empty fallback retains populated API observations and accurate notice');
  await page.locator('[data-atlas-page="outlook"]').click();
  await page.locator('.rsi-chart-canvas svg').waitFor();
  const chart=await page.locator('.rsi-chart-canvas svg').elementHandle();
  const range=await chart.evaluate(node=>[node.dataset.start,node.dataset.end]);
  const dialog=page.locator('dialog[data-rsi-dialog="backtest"]');
  async function openBacktest(){
    await page.locator('[data-rsi-view="backtest"]').click();
    await page.locator('dialog[data-rsi-dialog="backtest"][open]').waitFor();
    assert.equal(await chart.evaluate(node=>node===document.querySelector('.rsi-chart-canvas svg')),true,'opening details retains the same chart canvas');
    assert.deepEqual(await chart.evaluate(node=>[node.dataset.start,node.dataset.end]),range,'opening details preserves the observed chart range');
    assert.equal(await page.locator('.rsi-chart-canvas svg').count(),1,'details keep one primary chart');
  }
  async function closeBacktest(){
    await dialog.locator('[data-rsi-dialog-close]').click();
    await dialog.waitFor({state:'hidden'});
    assert.equal(await page.locator('[data-rsi-view="backtest"]').evaluate(node=>node===document.activeElement),true,'closing details returns focus to its chart toolbar trigger');
  }
  await openBacktest();
  const submit=dialog.locator('.rsi-backtest-form button[type="submit"]');
  assert.equal(await submit.isEnabled(),true);await submit.click();
  for(let i=0;i<100&&!backtest;i++)await new Promise(resolve=>setTimeout(resolve,20));
  assert.equal(backtest?.revision,revision);
  report.checks.push('real RSI request retains the revision of its displayed API observations');
  await closeBacktest();
  mode='pending';await page.locator('.ml-delivery button').click();
  await page.locator('#market-view[aria-busy="true"]').waitFor();
  await openBacktest();
  assert.equal(await submit.isEnabled(),true);
  for(let i=0;i<100&&!pending;i++)await new Promise(resolve=>setTimeout(resolve,20));
  assert(pending,'replacement request entered the pending HTTP boundary');
  mode='failed';json(pending,{error:'synthetic interrupted replacement'},503);pending=null;
  await page.locator('.ml-status').filter({hasText:'자료 오류'}).waitFor();
  assert.equal(await submit.isEnabled(),true);
  assert.match(await page.locator('.ml-delivery').textContent(),/직전 자료 유지/);
  report.checks.push('pending and failed retries retain the accepted revision and available backtest action');
  report.checks.push('backtest details open and close as a modal while preserving the chart canvas and observed range');
  assert.deepEqual(report.runtimeErrors,[]);
  await page.screenshot({path:path.join(output,'retained-snapshot.png')});
  report.status='passed';
}catch(error){report.status='failed';report.error=String(error);throw error;}
finally{
  for(const file of ['apps/web/src/app.tsx','apps/web/src/snapshot-state.ts','scripts/verify-snapshot-browser.mjs',...(await readdir(path.join(root,'build/web/assets'))).filter(name=>name.endsWith('.js')).map(name=>'build/web/assets/'+name)])report.sourceHashes[file]=createHash('sha256').update(await readFile(path.join(root,file))).digest('hex');
  report.finishedAt=new Date().toISOString();await mkdir(output,{recursive:true});await writeFile(path.join(output,'report.json'),JSON.stringify(report,null,2)+'\n');
  if(pending)pending.end();await browser?.close();await new Promise(resolve=>server.close(resolve));
  console.log(JSON.stringify(report));
}
