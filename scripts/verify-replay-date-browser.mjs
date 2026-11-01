// Issue #50 acceptance: real native date segments, visible controls, no app state setters.
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir,mkdtemp,readdir} from 'node:fs/promises';
import {spawn,execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {pathToFileURL} from 'node:url';
const {version}=JSON.parse(await readFile('package.json','utf8'));
const source=process.env.EXPECTED_SOURCE??execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim();
const out=resolve(process.env.QA_OUT??'build/replay-date-qa');
const base=process.env.ATLAS_QA_URL??'https://twoimo.github.io/bitcoin-cycle-atlas/';
const local=!!process.env.ATLAS_QA_URL,hash=b=>createHash('sha256').update(b).digest('hex');
const delay=ms=>new Promise(r=>setTimeout(r,ms));
async function until(fn,label){for(let i=0;i<200;i++){if(await fn())return;await delay(100);}throw Error('Timeout: '+label);}
const report={version,source,url:base,scope:local?'local candidate, not deployed':'deployed public site',startedAt:new Date().toISOString(),checks:[],http:[],screenshots:[],runtimeErrors:[]};
await mkdir(out,{recursive:true});
const dir=await mkdtemp(resolve(tmpdir(),'atlas-date-qa-'));
const native=await readFile('scripts/verify-eth-candidate-browser.mjs','utf8');
const helpers=native.slice(native.indexOf('class Cdp {'),native.indexOf('async function bounds('));
assert.ok(helpers.includes('async function click'));
await writeFile(resolve(dir,'cdp.mjs'),`import {writeFile} from 'node:fs/promises';import {resolve} from 'node:path';import {createHash} from 'node:crypto';const out=${JSON.stringify(out)},imageLogMode='none';const hash=b=>createHash('sha256').update(b).digest('hex');const delay=ms=>new Promise(r=>setTimeout(r,ms));\n${helpers}\nexport {Cdp,evaluate,settled,screenshot,click};`);
const {Cdp,evaluate,settled,screenshot,click}=await import(pathToFileURL(resolve(dir,'cdp.mjs')));
let chrome,browser,cdp;
async function snap(){return evaluate(cdp,async()=>{
 const s=document.querySelector('#lab-chart'),p=document.querySelector('.chart-replay-controls'),q=k=>p.querySelector('[data-cr="'+k+'"]');
 const saved=localStorage.getItem('atlas-chart-replay-v1:BTCUSD')??'';
 const savedHash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(saved))),b=>b.toString(16).padStart(2,'0')).join('');
 return {origin:s.dataset.replayOrigin,cursor:s.dataset.replayCursor,signature:s.dataset.forecastValueSignature,snapshot:s.dataset.replaySnapshotHash,
 capturedAt:s.dataset.replaySnapshotCapturedAt,viewStart:s.dataset.replayViewStart,viewEnd:s.dataset.replayViewEnd,
 savedHash,interval:q('update-interval').value,frequency:s.dataset.replayFrequency,
 value:q('date').value,invalid:q('date').getAttribute('aria-invalid'),hint:q('date-hint').textContent,menuVisible:!q('select-panel').hidden,
 band:!!s.querySelector('[data-indicator-layer="range"]'),path:!!s.querySelector('[data-replay-forecast-path]')?.getAttribute('d'),
 candles:[...s.querySelectorAll('.observed-candle')].map(n=>({...n.dataset})).slice(-1),
 foreground:[...s.querySelectorAll('.observed-candle,.observed-candles-batched')].every(n=>!!(s.querySelector('[data-replay-forecast-path]')?.compareDocumentPosition(n)&Node.DOCUMENT_POSITION_FOLLOWING))};
});}
function invariants(s){return Object.fromEntries(['origin','cursor','signature','snapshot','capturedAt','viewStart','viewEnd','savedHash'].map(k=>[k,s[k]]));}
async function key(key,code,number,modifiers=0){for(const type of ['keyDown','keyUp'])await cdp.send('Input.dispatchKeyEvent',{type,key,code,windowsVirtualKeyCode:number,nativeVirtualKeyCode:number,modifiers});await settled(cdp);}
async function segment(name,text){
 const {nodes}=await cdp.send('Accessibility.getFullAXTree');
 const n=nodes.find(n=>n.role?.value==='spinbutton'&&new RegExp(name,'i').test(n.name?.value??''));
 assert.ok(n,'native '+name+' date segment');await cdp.send('DOM.focus',{backendNodeId:n.backendDOMNodeId});
 if(text===''){await key('Backspace','Backspace',8);return;}
 for(const digit of text){for(const type of ['keyDown','keyUp'])await cdp.send('Input.dispatchKeyEvent',{type,key:digit,code:'Digit'+digit,windowsVirtualKeyCode:48+Number(digit),...(type==='keyDown'?{text:digit,unmodifiedText:digit}:{})});}
 await settled(cdp);
}
async function dateView(){await click(cdp,'[data-cr="select-menu"]');await click(cdp,'[data-cr="select-date"]');}
async function typeDate(date){const [y,m,d]=date.split('-');await segment('year',y);await segment('month',m);await segment('day',d);assert.equal((await snap()).value,date);}
async function closeDate(){await click(cdp,'[data-cr="select-close"]');}
async function selectDate(date){await dateView();await typeDate(date);await click(cdp,'[data-cr="start"]');const before=new Date(Date.parse(date+'T00:00:00Z')-86400000).toISOString().slice(0,10);await until(async()=>(await snap()).cursor===before,'selected '+date);await settled(cdp);}
async function check(id,run){try{const result=await run();report.checks.push({id,status:'pass',result});}catch(e){report.checks.push({id,status:'fail',error:String(e.stack??e)});await screenshot(cdp,id+'-error.png',report);throw e;}}
try{
 assert.match(source,/^[a-f0-9]{40}$/);
 if(!local){
  const manifestResponse=await fetch(base+'publication.json?qa50='+source,{headers:{'Cache-Control':'no-cache'},signal:AbortSignal.timeout(20000)});assert.equal(manifestResponse.status,200);
  const manifest=await manifestResponse.json();assert.equal(manifest.sourceCommit,source);assert.equal(manifest.sourceTree.status,'clean');report.publication=manifest;
  for(const path of ['index.html','site-entry.js','chart-replay.js','chart-replay.css','chart-replay-snapshot.js','chart-replay-atlas.js','atlas-price-chart.js','chart-replay-state.js','data/btc-volume.json']){
   const r=await fetch(base+path+'?qa50='+source,{headers:{'Cache-Control':'no-cache'},signal:AbortSignal.timeout(20000)});assert.equal(r.status,200);
   const bytes=Buffer.from(await r.arrayBuffer());assert.equal(hash(bytes),hash(await readFile('dist/'+path)),path);assert.equal(hash(bytes),manifest.files.find(f=>f.path===path)?.sha256);
   report.http.push({path,bytes:bytes.length,sha256:hash(bytes)});
  }
 }
 chrome=spawn(process.env.CHROME_BIN??'google-chrome',['--headless=new','--no-sandbox','--disable-dev-shm-usage','--lang=en-US','--disable-background-networking','--no-first-run','--remote-debugging-port=0','--user-data-dir='+dir,'about:blank'],{stdio:'ignore'});
 let active;await until(async()=>{try{active=(await readFile(resolve(dir,'DevToolsActivePort'),'utf8')).trim().split('\n');return true;}catch{return false;}},'Chrome');
 const debug='http://127.0.0.1:'+active[0];browser=await Cdp.connect('ws://127.0.0.1:'+active[0]+active[1]);report.browser=await browser.send('Browser.getVersion');
 const {targetId}=await browser.send('Target.createTarget',{url:'about:blank'});let t;await until(async()=>{t=(await(await fetch(debug+'/json/list')).json()).find(t=>t.id===targetId&&t.webSocketDebuggerUrl);return !!t;},'target');
 cdp=await Cdp.connect(t.webSocketDebuggerUrl);for(const method of ['Page.enable','Runtime.enable','Network.enable','Accessibility.enable'])await cdp.send(method);
 cdp.on('Runtime.exceptionThrown',e=>report.runtimeErrors.push(e));await cdp.send('Network.setCacheDisabled',{cacheDisabled:true});
 await cdp.send('Emulation.setDeviceMetricsOverride',{width:1440,height:900,deviceScaleFactor:1,mobile:false});
 await cdp.send('Page.navigate',{url:base+'?symbol=BTCUSD&granularity=weekly&type=candles&view-start=2024-10-29&view-end=2028-10-29'});
 const ready=()=>evaluate(cdp,()=>!!document.querySelector('#workbench-replay')&&!!document.querySelector('#lab-chart')?.dataset.forecastValueSignature);
 await until(ready,'chart');let loads=0;cdp.on('Page.loadEventFired',()=>loads++);await cdp.send('Page.reload',{ignoreCache:true});await until(()=>loads>0,'hard reload');await until(ready,'reload chart');await settled(cdp);
 report.hardReload={ignoreCache:true,loadEvents:loads};
 assert.ok(await evaluate(cdp,v=>[...document.querySelectorAll('script[type="module"][src]')].some(n=>n.src.endsWith('/site-entry.js?v='+v)),version));
 await click(cdp,'#workbench-replay');await until(()=>evaluate(cdp,()=>document.querySelector('#lab-chart')?.dataset.replaySelecting==='true'),'picker');await settled(cdp);
 await check('unconfirmed-controls-and-compact-menu',async()=>{
  assert.deepEqual(await evaluate(cdp,()=>['play','next','live'].map(k=>document.querySelector('[data-cr="'+k+'"]').disabled)),[true,true,true]);
  await click(cdp,'[data-cr="select-menu"]');const menu=await evaluate(cdp,()=>({keys:[...document.querySelectorAll('.chart-replay-actions>*')].map(n=>n.dataset.cr),width:document.querySelector('.chart-replay-bar').getBoundingClientRect().width,view:document.querySelector('[data-cr="select-panel"]').dataset.menuView,fields:[...document.querySelectorAll('[data-cr="select-panel"] input,[data-cr="select-panel"] select')].filter(n=>n.getClientRects().length).length}));
  assert.deepEqual(menu.keys,['first','select-menu','pick','play','next','speed','update-interval','live']);assert.equal(menu.view,'start');assert.equal(menu.fields,0);assert.ok(menu.width<500);await closeDate();return menu;
 });
 await selectDate('2026-08-24');await key('ArrowRight','ArrowRight',39,8);assert.equal((await snap()).cursor,'2026-08-24');
 await click(cdp,'[data-cr="exit"]');await click(cdp,'[data-cr="exit-confirm"]');await until(()=>evaluate(cdp,()=>document.querySelector('.chart-replay-controls').hidden),'saved exit');
 await click(cdp,'#workbench-replay');await click(cdp,'[data-cr="entry-continue"]');await until(async()=>(await snap()).cursor==='2026-08-24','Continue');await settled(cdp);
 const fixed=await snap();assert.match(fixed.snapshot,/^[a-f0-9]{64}$/);report.initial=invariants(fixed);
 for(const year of ['2099','1900'])for(const submit of ['button','Enter'])await check('native-'+year+'-'+submit,async()=>{
  await dateView();await segment('year',year);const typed=await snap();assert.ok(typed.value.startsWith(year+'-'));
  assert.equal(await evaluate(cdp,()=>document.querySelector('[data-cr="date"]').checkValidity()),false);
  if(submit==='button')await click(cdp,'[data-cr="start"]');else await key('Enter','Enter',13);
  await settled(cdp);const after=await snap();assert.deepEqual(invariants(after),invariants(fixed));assert.equal(after.value,typed.value);assert.equal(after.invalid,'true');assert.equal(after.menuVisible,true);assert.match(after.hint,/선택 가능한 날짜/);
  if(year==='2099'&&submit==='button')await screenshot(cdp,'rejected-future-date.png',report);
  if(year==='1900'&&submit==='Enter')await screenshot(cdp,'rejected-past-enter.png',report);
  await closeDate();return {typed:typed.value,after:invariants(after),error:after.hint};
 });
 for(const submit of ['button','Enter'])await check('native-empty-'+submit,async()=>{
  await dateView();await segment('year','');assert.equal((await snap()).value,'');
  if(submit==='button')await click(cdp,'[data-cr="start"]');else await key('Enter','Enter',13);
  const after=await snap();assert.deepEqual(invariants(after),invariants(fixed));assert.equal(after.invalid,'true');await closeDate();return {error:after.hint};
 });
 await check('native-impossible-calendar-day',async()=>{
  await dateView();await segment('month','02');await segment('day','30');
  assert.equal(await evaluate(cdp,()=>document.querySelector('[data-cr="date"]').checkValidity()),false);
  await key('Enter','Enter',13);const after=await snap();assert.deepEqual(invariants(after),invariants(fixed));assert.equal(after.invalid,'true');await closeDate();return {error:after.hint};
 });
 await check('invalid-draft-cancel-and-correction',async()=>{
  await dateView();await segment('year','2099');await click(cdp,'[data-cr="start"]');await click(cdp,'[data-cr="menu-back"]');await click(cdp,'[data-cr="select-date"]');
  assert.equal((await snap()).value,'2026-08-24');assert.equal((await snap()).invalid,'false');
  await segment('year','2099');await key('Enter','Enter',13);await segment('year','2026');assert.equal((await snap()).invalid,'false');await key('Enter','Enter',13);
  await until(async()=>(await snap()).cursor==='2026-08-23','corrected date');assert.equal((await snap()).signature,fixed.signature);return invariants(await snap());
 });
 await check('weekly-D-actual-prefix-and-fixed-layer-order',async()=>{
  await selectDate('2026-08-17');const raw=JSON.parse(await readFile('dist/data/btc-volume.json','utf8')).bars,steps=[];
  for(const date of ['2026-08-17','2026-08-18','2026-08-19']){
   await key('ArrowRight','ArrowRight',39,8);await until(async()=>(await snap()).cursor===date,date);const s=await snap(),c=s.candles.at(-1),rs=raw.filter(r=>r.date>='2026-08-17'&&r.date<=date);
   assert.equal(s.frequency,'weekly');assert.equal(s.interval,'daily');assert.equal(c.periodStart,'2026-08-17');assert.equal(+c.open,rs[0].open);assert.equal(+c.high,Math.max(...rs.map(r=>r.high)));assert.equal(+c.low,Math.min(...rs.map(r=>r.low)));assert.equal(+c.close,rs.at(-1).close);assert.equal(s.signature,fixed.signature);assert.ok(s.band&&s.path&&s.foreground);steps.push(c);
  }
  await screenshot(cdp,'fixed-forecast-weekly.png',report);return steps;
 });
 await check('confirmed-daily-26-preserves-future-assumptions',async()=>{
  await click(cdp,'[data-lab-frequency="daily"]');await until(async()=>(await snap()).frequency==='daily','daily interval');await settled(cdp);
  await selectDate('2026-10-26');const before=await snap();assert.equal(before.cursor,'2026-10-25');
  const future=()=>evaluate(cdp,()=>{const s=document.querySelector('#lab-chart');return {
   markers:[...s.querySelectorAll('[data-cycle-marker]')].filter(n=>n.dataset.date>'2026-10-26').map(n=>({id:n.dataset.cycleMarker,date:n.dataset.date,type:n.dataset.milestoneType,label:n.getAttribute('aria-label')})),
   periods:[...s.querySelectorAll('[data-cycle-interval]')].filter(n=>n.dataset.endDate>'2026-10-26').map(n=>({id:n.dataset.cycleInterval,start:n.dataset.startDate,end:n.dataset.endDate,days:n.dataset.days})),
   mode:document.querySelector('[data-cr="mode"]').value,
   disclosure:document.querySelector('[data-cr="evaluation-meaning"]').textContent};});
  const annotations=await future();assert.equal(annotations.mode,'atlas-chart');assert.ok(annotations.markers.some(n=>n.type==='mid-top'||n.label?.includes('MID-TOP')));assert.ok(annotations.periods.length>0);assert.match(annotations.disclosure,/발행한 예측 성적으로 평가하지 않습니다/);
  await key('ArrowRight','ArrowRight',39,8);await until(async()=>(await snap()).cursor==='2026-10-26','user-confirmed October 26');const after=await snap();
  assert.equal(after.signature,before.signature);assert.equal(after.snapshot,before.snapshot);assert.ok(after.band&&after.path&&after.foreground);assert.deepEqual(await future(),annotations);
  // The four-year daily view intentionally batches SVG candles. Read the
  // actual native download rather than narrowing the viewport to inspect it.
  const downloads=await mkdtemp(resolve(out,'daily26-export-'));await browser.send('Browser.setDownloadBehavior',{behavior:'allow',downloadPath:downloads,eventsEnabled:true});
  await click(cdp,'[data-cr="select-menu"]');await click(cdp,'[data-cr="menu-settings"]');await click(cdp,'[data-cr="details"]');await click(cdp,'[data-cr="export"]');
  let filename;await until(async()=>{filename=(await readdir(downloads)).find(n=>n.endsWith('.json'));return !!filename;},'native daily JSON download');
  const payload=JSON.parse(await readFile(resolve(downloads,filename),'utf8'));await closeDate();
  assert.equal(payload.frame.cursorDate,'2026-10-26');assert.ok(payload.frame.actual.length>0);assert.ok(payload.frame.actual.every(r=>r.date<='2026-10-26'));
  assert.equal(payload.identity.currentChartSnapshot,true);assert.equal(payload.identity.publicationTimeProven,false);assert.equal(payload.identity.issuedAt,null);assert.equal(payload.frame.metrics.independentSampleCount,null);
  const c=payload.frame.actual.at(-1),source=JSON.parse(await readFile('dist/data/btc-volume.json','utf8')).bars.find(n=>n.date==='2026-10-26');assert.ok(source);
  assert.ok(await evaluate(cdp,()=>document.querySelector('#lab-chart .observed-candles-batched')||document.querySelector('#lab-chart .observed-candle')));
  for(const name of ['open','high','low','close'])assert.equal(+c[name],source[name]);
  assert.deepEqual(['open','high','low','close'].map(k=>+c[k]),[80047.79,80696.96,79260.02,80005.52]);
  assert.ok(await evaluate(cdp,()=>[...document.querySelectorAll('#lab-chart .observed-candle')].every(n=>n.dataset.date<='2026-10-26')));
  await screenshot(cdp,'confirmed-daily-26-fixed-forecast.png',report);
  await dateView();await segment('year','2099');await click(cdp,'[data-cr="start"]');assert.deepEqual(invariants(await snap()),invariants(after));assert.deepEqual(await future(),annotations);await closeDate();
  return {before:invariants(before),after:invariants(after),ohlc:c,future:annotations};
 });
 const bounds=await evaluate(cdp,()=>{const n=document.querySelector('[data-cr="date"]');return {min:n.min,max:n.max};});
 for(const [name,date] of Object.entries(bounds))await check('exact-'+name+'-boundary',async()=>{
  await selectDate(date);await key('ArrowRight','ArrowRight',39,8);assert.equal((await snap()).cursor,date);assert.equal((await snap()).signature,fixed.signature);return {date};
 });
 await check('narrow-invalid-date-visible-and-cancellable',async()=>{
  await selectDate('2026-08-24');await dateView();await segment('year','2099');await click(cdp,'[data-cr="start"]');const before=invariants(await snap());
  await cdp.send('Emulation.setDeviceMetricsOverride',{width:320,height:568,deviceScaleFactor:1,mobile:true});await settled(cdp);
  const status=await evaluate(cdp,()=>{const n=document.querySelector('[data-cr="date-hint"]');n.scrollIntoView({block:'nearest'});const r=n.getBoundingClientRect();return {text:n.textContent,top:r.top,bottom:r.bottom,height:innerHeight};});assert.match(status.text,/선택 가능한 날짜/);assert.ok(status.top>=0&&status.bottom<=status.height);await screenshot(cdp,'narrow-date-validation.png',report);
  await closeDate();const after=await snap();assert.deepEqual(invariants(after),before);return status;
 });
 assert.equal(report.runtimeErrors.length,0);report.status='pass';
}catch(e){report.status='fail';report.error=String(e.stack??e);try{await screenshot(cdp,'browser-error.png',report);}catch{};process.exitCode=1;}
finally{
 report.completedAt=new Date().toISOString();report.summary={passed:report.checks.filter(c=>c.status==='pass').length,failed:report.checks.filter(c=>c.status==='fail').length};
 await writeFile(resolve(out,'verification.json'),JSON.stringify(report,null,2));console.log(JSON.stringify({status:report.status,source,summary:report.summary,error:report.error??null}));
 try{await browser?.send('Browser.close');}catch{};cdp?.close();browser?.close();chrome?.kill('SIGTERM');
}
