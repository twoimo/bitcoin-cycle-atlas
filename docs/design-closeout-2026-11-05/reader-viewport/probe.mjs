import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {verifyLegacyMethodReader,readNativeInteractiveTarget} from '../../../scripts/verify-workspace-browser.mjs';

const root=fileURLToPath(new URL('../../../',import.meta.url));
const arg=name=>process.argv.find(value=>value.startsWith('--'+name+'='))?.split('=').slice(1).join('=');
const reference=arg('reference')||null,output=path.resolve(root,arg('out')||'docs/design-closeout-2026-11-05/reader-viewport/after');
const {chromium}=await import(process.env.ATLAS_PLAYWRIGHT_MODULE||'/opt/codex/runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs');
const binary=process.env.ATLAS_BROWSER_PATH||'/workspace/scratch/82e52cfd9693/browser-native/chromium-audit-multiprocess';
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const files=new Map(),served=new Map();
async function source(file){
  if(files.has(file))return files.get(file);
  const bytes=reference?execFileSync('git',['show',reference+':'+file],{cwd:root,maxBuffer:50*1024*1024,stdio:['ignore','pipe','ignore']}):await readFile(path.join(root,file));files.set(file,bytes);return bytes;
}
const report={status:'running',baseline:'624888270fcb539ab08d505e5affab5f5d435776',sourceReference:reference||'working-tree',startedAt:new Date().toISOString(),method:'Actual legacy app, body wheel and native pointer/keyboard input; invokes the same new regression behavior inside the existing 49-case workspace gate. Source documents and chart data are unmodified.',cases:[],sourceHashes:{},servedHashes:{},runtimeErrors:[],resourceFailures:[]};
const mime={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.svg':'image/svg+xml','.png':'image/png','.woff2':'font/woff2','.ico':'image/x-icon','.csv':'text/csv'};
const server=createServer(async(req,res)=>{
  try{let p=decodeURIComponent(new URL(req.url,'http://localhost').pathname).replace(/^\/bitcoin-cycle-atlas(?=\/|$)/,'');if(p.endsWith('/'))p+='index.html';if(!p)p='/index.html';const file=path.posix.normalize('dist'+p);if(!file.startsWith('dist/'))throw Error('Invalid path');const bytes=await source(file);served.set(file,sha(bytes));res.writeHead(200,{'Content-Type':mime[path.extname(file)]||'application/octet-stream','Cache-Control':'no-store'});res.end(bytes);}catch{res.writeHead(404);res.end('Not found');}
});
const pause=ms=>new Promise(r=>setTimeout(r,ms));
let browser;
try{
  await mkdir(output,{recursive:true});
  for(const file of ['dist/viewport-workspace.js','dist/chart-details-panel.css','dist/viewport.css','dist/index.html','dist/atlas-shell.css','dist/compact.css','dist/lab-view.js','dist/styles.css'])report.sourceHashes[file]=sha(await source(file));
  for(const file of ['scripts/verify-workspace-browser.mjs','docs/design-closeout-2026-11-05/reader-viewport/probe.mjs'])report.sourceHashes[file]=sha(await readFile(path.join(root,file)));
  await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port+'/bitcoin-cycle-atlas/';
  browser=await chromium.launch({headless:true,executablePath:binary,args:['--no-sandbox','--disable-dev-shm-usage']});report.browserVersion=browser.version();
  const sizes=[{width:1440,height:900},{width:1440,height:360},{width:320,height:900},{width:320,height:360}].filter(size=>(!arg('width')||size.width===Number(arg('width')))&&(!arg('height')||size.height===Number(arg('height'))));
  for(const size of sizes){
    const receipt={page:'workspace-legacy',...size,touch:size.width===320,status:'running',workspace:{legacy:{}},screenshots:[]};report.cases.push(receipt);
    const context=await browser.newContext({viewport:size,hasTouch:size.width===320});
    await context.route('**/*',route=>new URL(route.request().url()).origin===new URL(base).origin?route.continue():route.abort());
    const page=await context.newPage(),cdp=await context.newCDPSession(page);
    page.on('pageerror',error=>report.runtimeErrors.push({size,error:String(error)}));page.on('requestfailed',request=>report.resourceFailures.push({size,url:request.url(),error:request.failure()?.errorText}));
    const evaluate=(_cdp,fn,...args)=>page.evaluate(({source,args})=>(0,eval)('('+source+')')(...args),{source:fn.toString(),args});
    const settled=async()=>{await page.evaluate(async()=>{await document.fonts.ready;await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));});await pause(100);};
    const until=async(fn,label,timeout=30000)=>{const end=Date.now()+timeout;while(Date.now()<end){if(await fn())return;await pause(100);}throw Error('Timed out: '+label);};
    const screenshot=async(_cdp,name,result)=>{await page.screenshot({path:path.join(output,name)});result.screenshots.push({file:name,sha256:sha(await readFile(path.join(output,name)))});};
    try{
      await page.goto(base+'?page=compare&legacy=1');await page.waitForFunction(()=>document.documentElement.dataset.boot==='ready'&&document.body.dataset.page==='compare'&&document.querySelectorAll('#structure-chart path').length>0);await settled();
      await verifyLegacyMethodReader({cdp,receipt,evaluate,until,settled,screenshot});receipt.status='passed';
    }catch(error){receipt.status='failed';receipt.error=String(error.stack||error);await screenshot(cdp,`failure-${size.width}x${size.height}.png`,receipt);throw error;}
    finally{await context.close();}
  }
  // The chart shell keeps its original dock and all four working regions.
  if(!reference){
    const context=await browser.newContext({viewport:{width:1440,height:360}});await context.route('**/*',route=>new URL(route.request().url()).origin===new URL(base).origin?route.continue():route.abort());
    const page=await context.newPage();await page.goto(base+'?symbol=BTCUSD&granularity=daily&type=line');await page.waitForFunction(()=>document.documentElement.dataset.boot==='ready'&&document.querySelectorAll('#lab-chart path').length>0);
    const read=()=>page.evaluate(()=>{const box=el=>{const b=el.getBoundingClientRect();return {left:b.left,right:b.right,top:b.top,bottom:b.bottom,width:b.width,height:b.height,connected:el.isConnected};};return{shell:document.body.dataset.shell,grid:getComputedStyle(document.querySelector('.workspace')).display,columns:getComputedStyle(document.querySelector('.workspace')).gridTemplateColumns,readerPosition:getComputedStyle(document.querySelector('#chart-reader')).position,perimeter:Object.fromEntries(['.atlas-canvas-heading','.workbench-bottom-bar','.atlas-sidebar','.workbench-rail'].map(s=>[s,box(document.querySelector(s))]))};});
    const before=await read();const target=await page.evaluate(readNativeInteractiveTarget,'.workbench-detail-tools [data-reader=math]');assert.ok(target.topmost&&target.painted);await page.mouse.click(target.x,target.y);await page.waitForFunction(()=>!document.querySelector('#chart-reader').hidden);const opened=await read();
    assert.equal(opened.shell,'chart');assert.equal(opened.grid,'grid');assert.equal(opened.readerPosition,'relative');
    for(const region of Object.values(opened.perimeter))assert.ok(region.connected&&region.width>0&&region.height>0&&region.top>=0&&region.bottom<=361);
    const close=await page.evaluate(readNativeInteractiveTarget,'#chart-reader .reader-heading button');assert.ok(close.topmost&&close.painted&&close.box.bottom<=360);await page.mouse.click(close.x,close.y);await page.waitForFunction(()=>document.querySelector('#chart-reader').hidden);const closed=await read();assert.deepEqual(closed.perimeter,before.perimeter);assert.equal(closed.columns,before.columns);
    report.chartShell={before,opened,closed,restored:true};await context.close();
  }
  assert.equal(report.runtimeErrors.length,0,'Browser runtime errors');report.status='passed';
}catch(error){report.status='failed';report.error=String(error.stack||error);process.exitCode=1;}
finally{
  await browser?.close();await new Promise(r=>server.close(r));report.servedHashes=Object.fromEntries([...served].sort());
  report.finishedAt=new Date().toISOString();await writeFile(path.join(output,'report.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({status:report.status,cases:report.cases.map(c=>({width:c.width,height:c.height,status:c.status,error:c.error})),error:report.error,output}));
}
