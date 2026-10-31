import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir,mkdtemp} from 'node:fs/promises';
import {spawn,execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {pathToFileURL} from 'node:url';
const expected=process.env.EXPECTED_SOURCE,out=resolve('build/public-overlay');
const base='https://twoimo.github.io/bitcoin-cycle-atlas/';
const hash=b=>createHash('sha256').update(b).digest('hex');
const delay=ms=>new Promise(r=>setTimeout(r,ms));
async function until(f,label){for(let n=0;n<450;n++){if(await f())return;await delay(100);}throw Error('Timeout '+label);}
const report={version:'1.29.7',source:expected,status:'running',startedAt:new Date().toISOString(),http:[],states:[],screenshots:[],runtimeErrors:[]};
await mkdir(out,{recursive:true});
// Reuse the exact committed native CDP transport, not application state setters.
const native=await readFile('scripts/verify-eth-candidate-browser.mjs','utf8');
const helpers=native.slice(native.indexOf('class Cdp {'),native.indexOf('async function bounds('));
const dir=await mkdtemp(resolve(tmpdir(),'atlas-public-'));
await writeFile(resolve(dir,'cdp.mjs'),`import {writeFile} from 'node:fs/promises';import {resolve} from 'node:path';import {createHash} from 'node:crypto';const out=${JSON.stringify(out)},imageLogMode='failures-only';const hash=b=>createHash('sha256').update(b).digest('hex');const delay=ms=>new Promise(r=>setTimeout(r,ms));\n${helpers}\nexport {Cdp,evaluate,settled,screenshot,click};`);
const {Cdp,evaluate,settled,screenshot,click}=await import(pathToFileURL(resolve(dir,'cdp.mjs')));
let chrome,browser,cdp;
async function read(label){const s=await evaluate(cdp,()=>{
 const svg=document.querySelector('#lab-chart'),panel=document.querySelector('.chart-replay-controls'),q=k=>panel?.querySelector('[data-cr="'+k+'"]');
 const visible=n=>!!n?.getClientRects().length&&getComputedStyle(n).display!=='none';
 const f=svg?.querySelector('[data-replay-forecast-path]'),box=svg?.getBoundingClientRect();
 const candles=[...svg?.querySelectorAll('.observed-candle')??[]].map(n=>({...n.dataset,x:n.querySelector('line')?.getAttribute('x1')}));
 return {url:location.href,modules:[...document.querySelectorAll('script[type="module"][src]')].map(n=>n.getAttribute('src')),data:{...svg?.dataset},candles,
 disabled:['play','next','live'].map(k=>q(k)?.disabled),interval:q('update-interval')?.value,
 band:!!svg?.querySelector('[data-indicator-layer="range"]'),path:!!f?.getAttribute('d'),pointer:f?.getAttribute('pointer-events'),
 above:f?[...svg.querySelectorAll('.observed-candle,.observed-candles-batched,.observed-close-line')].every(n=>!!(n.compareDocumentPosition(f)&Node.DOCUMENT_POSITION_FOLLOWING)):false,
 menu:q('select-panel')?.dataset.menuView,items:['select-chart','select-date','select-random','select-first'].map(k=>visible(q(k))),inputs:[...q('select-panel')?.querySelectorAll('input,select')??[]].filter(visible).length,
 controls:[...document.querySelectorAll('.chart-replay-actions > *')].map(n=>n.dataset.cr),barWidth:document.querySelector('.chart-replay-bar')?.getBoundingClientRect().width,
 viewWidth:svg?.viewBox.baseVal.width,box:box?{x:box.x,y:box.y,width:box.width,height:box.height}:null};
 });report.states.push({label,at:new Date().toISOString(),...s});return s;}
async function move(x,y){await cdp.send('Input.dispatchMouseEvent',{type:'mouseMoved',x,y});await settled(cdp);}
async function at(x,y){await move(x,y);for(const type of ['mousePressed','mouseReleased'])await cdp.send('Input.dispatchMouseEvent',{type,x,y,button:'left',clickCount:1});await settled(cdp);}
async function key(key,n){for(const type of ['keyDown','keyUp'])await cdp.send('Input.dispatchKeyEvent',{type,key,code:key,modifiers:8,windowsVirtualKeyCode:n,nativeVirtualKeyCode:n});await settled(cdp);}
try{
 assert.match(expected,/^[a-f0-9]{40}$/);assert.equal(execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),expected);
 async function get(path){const r=await fetch(base+path+'?verification='+expected,{headers:{'Cache-Control':'no-cache'},signal:AbortSignal.timeout(20000)});assert.equal(r.status,200,path);return Buffer.from(await r.arrayBuffer());}
 const raw=await get('publication.json'),manifest=JSON.parse(raw);assert.equal(manifest.sourceCommit,expected);assert.equal(manifest.sourceTree.status,'clean');report.publication=manifest;await writeFile(resolve(out,'served-publication.json'),raw);
 for(const path of ['index.html','site-entry.js','app.js','lab-view.js','chart-replay.js','chart-replay-atlas.js','atlas-price-chart.js','chart-replay-state.js','styles.css','data/btc-daily.json','data/btc-volume.json']){
  const b=await get(path),local=await readFile('dist/'+path),entry=manifest.files.find(f=>f.path===path);assert.equal(hash(b),hash(local),path);assert.equal(hash(b),entry.sha256);report.http.push({path,sha256:hash(b),bytes:b.length});
 }
 chrome=spawn('google-chrome',['--headless=new','--no-sandbox','--disable-dev-shm-usage','--disable-background-networking','--no-first-run','--remote-debugging-port=0','--user-data-dir='+dir,'about:blank'],{stdio:'ignore'});
 let active;await until(async()=>{try{active=(await readFile(resolve(dir,'DevToolsActivePort'),'utf8')).trim().split('\n');return true;}catch{return false;}},'Chrome');
 const debug='http://127.0.0.1:'+active[0];browser=await Cdp.connect('ws://127.0.0.1:'+active[0]+active[1]);report.browser=await browser.send('Browser.getVersion');
 const {targetId}=await browser.send('Target.createTarget',{url:'about:blank'});let target;await until(async()=>{target=(await(await fetch(debug+'/json/list')).json()).find(t=>t.id===targetId&&t.webSocketDebuggerUrl);return !!target;},'page');cdp=await Cdp.connect(target.webSocketDebuggerUrl);
 cdp.on('Runtime.exceptionThrown',e=>report.runtimeErrors.push(e));for(const m of ['Page.enable','Runtime.enable','Network.enable'])await cdp.send(m);
 await cdp.send('Network.setCacheDisabled',{cacheDisabled:true});await cdp.send('Emulation.setDeviceMetricsOverride',{width:1440,height:900,deviceScaleFactor:1,mobile:false});
 await cdp.send('Page.navigate',{url:base+'?symbol=BTCUSD&granularity=weekly&type=candles&view-start=2024-10-29&view-end=2028-10-29'});
 const ready=()=>evaluate(cdp,()=>!!document.querySelector('#workbench-replay')&&!!document.querySelector('#lab-chart')?.dataset.forecastValueSignature);
 await until(ready,'initial chart');await settled(cdp);let loads=0;cdp.on('Page.loadEventFired',()=>loads++);await cdp.send('Page.reload',{ignoreCache:true});await until(()=>loads>0,'hard reload');await until(ready,'reloaded chart');await settled(cdp);report.hardReload={ignoreCache:true,loadEvents:loads};
 const before=await read('before');assert.ok(before.modules.includes('./site-entry.js?v=1.29.7')||before.modules.some(s=>s.endsWith('/site-entry.js?v=1.29.7')));
 const signature=before.data.forecastValueSignature;await click(cdp,'#workbench-replay');await until(()=>evaluate(cdp,()=>document.querySelector('#lab-chart')?.dataset.replaySelecting==='true'),'selection');await settled(cdp);
 const g=await read('selecting'),day=d=>Date.parse(d+'T00:00:00Z')/86400000;
 const x=d=>g.box.x+(Number(g.data.plotLeft)+(day(d)-day(g.data.replayViewStart))/(day(g.data.replayViewEnd)-day(g.data.replayViewStart))*(Number(g.data.plotRight)-Number(g.data.plotLeft)))*g.box.width/g.viewWidth,y=g.box.y+g.box.height*.45;
 for(const date of ['2025-07-07','2026-08-17']){await move(x(date),y);const s=await read('preview-'+date);assert.equal(s.data.pickerDate,date);assert.ok(!s.data.replayOrigin&&!s.data.replayCursor);assert.deepEqual(s.disabled,[true,true,true]);assert.equal(s.data.forecastValueSignature,signature);}
 await screenshot(cdp,'public-preview.png',report);await at(x('2026-08-17'),y);await until(()=>evaluate(cdp,()=>document.querySelector('#lab-chart')?.dataset.replayCursor==='2026-08-16'),'start');await settled(cdp);
 const rows=JSON.parse(await readFile('dist/data/btc-volume.json','utf8')).bars;
 for(const [index,date] of ['2026-08-17','2026-08-18'].entries()){
  if(index===0)await click(cdp,'[data-cr="next"]');else await key('ArrowRight',39);
  await until(()=>evaluate(cdp,d=>document.querySelector('#lab-chart')?.dataset.replayCursor===d&&[...document.querySelectorAll('#lab-chart .observed-candle')].at(-1)?.dataset.date===d,date),'drawn '+date);await settled(cdp);
  const s=await read(date),c=s.candles.at(-1),raw=rows.filter(r=>r.date>='2026-08-17'&&r.date<=date);
  assert.equal(s.data.replayFrequency,'weekly');assert.equal(s.interval,'daily');assert.equal(c.periodStart,'2026-08-17');assert.equal(+c.daysIncluded,index+1);assert.equal(+c.open,raw[0].open);assert.equal(+c.high,Math.max(...raw.map(r=>r.high)));assert.equal(+c.low,Math.min(...raw.map(r=>r.low)));assert.equal(+c.close,raw.at(-1).close);
  assert.equal(s.data.forecastValueSignature,signature);assert.equal(s.above,true);assert.equal(s.pointer,'none');assert.ok(s.path&&s.band);assert.equal(s.data.cycleMarkerCount,before.data.cycleMarkerCount);assert.equal(s.data.cycleIntervalCount,before.data.cycleIntervalCount);await screenshot(cdp,'public-weekly-'+date+'.png',report);
 }
 const a=report.states.find(s=>s.label==='2026-08-17').candles.at(-1),b=report.states.find(s=>s.label==='2026-08-18').candles.at(-1);assert.equal(a.open,b.open);assert.equal(a.x,b.x);
 await key('ArrowLeft',37);assert.equal((await read('no-backward-shortcut')).data.replayCursor,'2026-08-18');await click(cdp,'[data-cr="select-menu"]');const menu=await read('menu');assert.equal(menu.menu,'start');assert.ok(menu.items.every(Boolean));assert.equal(menu.inputs,0);assert.deepEqual(menu.controls,['first','select-menu','pick','play','next','speed','update-interval','live']);assert.ok(menu.barWidth<500);await screenshot(cdp,'public-menu.png',report);
 assert.equal(report.runtimeErrors.length,0);report.status='pass';
}catch(e){report.status='fail';report.failure=String(e.stack??e);if(cdp)try{await read('failure');await screenshot(cdp,'public-failure.png',report);}catch{}process.exitCode=1;
}finally{report.finishedAt=new Date().toISOString();await writeFile(resolve(out,'verification.json'),JSON.stringify(report,null,2)+'\n');try{await browser?.send('Browser.close');}catch{}cdp?.close();browser?.close();chrome?.kill();console.log(JSON.stringify({status:report.status,http:report.http.length,states:report.states.length,screenshots:report.screenshots.length,failure:report.failure??null}));}
