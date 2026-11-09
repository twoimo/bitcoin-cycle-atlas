#!/usr/bin/env node
/** Focused WP6/T3/legend/replay evidence. Uses the same isolated native Chrome
 * and CDP inputs as the repository browser suite; never qualifies full CI. */
import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir, mkdtemp, rm } from 'node:fs/promises';
import { resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { spawn, execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readChartReplayFloatingGeometry } from './verify-chart-replay-browser.mjs';

const root=resolve(fileURLToPath(new URL('..',import.meta.url)));
const argv=process.argv.slice(2),arg=(key,fallback)=>{const i=argv.indexOf(key);return i<0?fallback:argv[i+1];};
const origin=arg('--origin','https://bitcoin-cycle-atlas.twoimo.workers.dev').replace(/\/$/,'');
const out=resolve(root,arg('--out','build/wp6-browser')),phase=arg('--phase',out.includes('before')?'before':'after');
const expectedSource=arg('--expected-source',null);
const symbols=arg('--symbols','BTCUSD,ETHUSD,MSTR,BMNR,TQQQ').split(',');
const viewports=[[390,844],[320,740],[768,1024],[1024,768],[1440,900],[1920,1080]];
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const delay=ms=>new Promise(accept=>setTimeout(accept,ms));
const git=args=>execFileSync('git',args,{cwd:root,encoding:'utf8'}).trim();
const report={schemaVersion:1,kind:'atlas-wp6-native-browser-evidence',qualifiesFullVerification:false,phase,origin,startedAt:new Date().toISOString(),status:'RUNNING',cases:[],failures:[],
  scope:'Five instruments and six explicit CSS viewports in isolated headless Chrome contexts. Native clicks and keyboard for replay and dialogs. Local or public origin is explicitly recorded; no Safari/physical-device or forecast-validity claim.'};
let chrome,browser,profile,stderr='';

async function until(fn,label,timeout=45000){const deadline=Date.now()+timeout;while(Date.now()<deadline){const value=await fn();if(value)return value;await delay(100);}throw new Error('Timed out: '+label);}
class Cdp{
  constructor(ws){this.ws=ws;this.next=1;this.pending=new Map();this.listeners=new Map();ws.addEventListener('message',event=>{const m=JSON.parse(String(event.data));if(m.id){const p=this.pending.get(m.id);if(!p)return;clearTimeout(p.timer);this.pending.delete(m.id);m.error?p.reject(new Error(p.method+': '+JSON.stringify(m.error))):p.accept(m.result||{});}else for(const listener of this.listeners.get(m.method)||[])listener(m.params||{});});ws.addEventListener('close',()=>this.fail(new Error('CDP closed')));ws.addEventListener('error',()=>this.fail(new Error('CDP error')));}
  static async connect(url){const ws=new WebSocket(url);await new Promise((accept,reject)=>{const timer=setTimeout(()=>reject(new Error('CDP connection timeout')),15000);ws.addEventListener('open',()=>{clearTimeout(timer);accept();},{once:true});ws.addEventListener('error',()=>{clearTimeout(timer);reject(new Error('CDP connection failed'));},{once:true});});return new Cdp(ws);}
  on(name,fn){const list=this.listeners.get(name)||[];list.push(fn);this.listeners.set(name,list);}
  fail(error){for(const p of this.pending.values()){clearTimeout(p.timer);p.reject(error);}this.pending.clear();}
  send(method,params={}){const id=this.next++;return new Promise((accept,reject)=>{const timer=setTimeout(()=>{this.pending.delete(id);reject(new Error('CDP timeout: '+method));},20000);this.pending.set(id,{accept,reject,timer,method});this.ws.send(JSON.stringify({id,method,params}));});}
  close(){this.ws.close();}
}
async function evaluate(cdp,fn,...args){const result=await cdp.send('Runtime.evaluate',{expression:'('+fn.toString()+')('+args.map(x=>JSON.stringify(x)).join(',')+')',awaitPromise:true,returnByValue:true});if(result.exceptionDetails)throw new Error('Browser evaluation failed: '+JSON.stringify(result.exceptionDetails));return result.result.value;}
async function settled(cdp){await evaluate(cdp,async()=>{await document.fonts.ready;await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));});}
async function publication(){try{const response=await fetch(origin+'/publication.json',{cache:'no-store',signal:AbortSignal.timeout(20000)});if(!response.ok)throw new Error('HTTP '+response.status);const bytes=Buffer.from(await response.arrayBuffer()),value=JSON.parse(bytes);if(expectedSource)assert.equal(value.sourceCommit,expectedSource);return {sourceCommit:value.sourceCommit,sourceTree:value.sourceTree,generatedAt:value.generatedAt,publishedAt:value.publishedAt,sha256:hash(bytes),checkedAt:new Date().toISOString()};}catch(error){if(expectedSource)throw error;return {error:String(error.message),checkedAt:new Date().toISOString()};}}
async function screenshot(cdp,name,receipt){const capture=await cdp.send('Page.captureScreenshot',{format:'png',fromSurface:true,captureBeyondViewport:false}),bytes=Buffer.from(capture.data,'base64');await writeFile(resolve(out,name),bytes);receipt.screenshots.push({file:name,bytes:bytes.length,sha256:hash(bytes)});}

function readWp6(){
  const frame=[...document.querySelectorAll('.atlas-center-frame')].find(f=>f.getClientRects().length),child=frame?.contentDocument;
  const docs=[document,...(child?[child]:[])],find=selector=>docs.flatMap(d=>[...d.querySelectorAll(selector)]).find(n=>n.getClientRects().length)||null;
  const painted=n=>Boolean(n&&!n.hidden&&!n.closest('[hidden]')&&n.getClientRects().length&&n.ownerDocument.defaultView.getComputedStyle(n).visibility!=='hidden');
  const box=n=>{if(!n)return null;const r=n.getBoundingClientRect(),offset=n.ownerDocument===document?{left:0,top:0}:frame.getBoundingClientRect();return {left:r.left+offset.left,right:r.right+offset.left,top:r.top+offset.top,bottom:r.bottom+offset.top,width:r.width,height:r.height,painted:painted(n),scrollWidth:n.scrollWidth,clientWidth:n.clientWidth};};
  const plot=document.querySelector('.atlas-plot'),svg=find('#lab-chart,#eth-chart,#equity-chart,.rsi-chart-canvas > svg');
  const dock=plot?.querySelector('.chart-legend-dock'),legend=dock?.querySelector('.lab-legend'),badge=find('[data-rsi-win-badge]'),hud=find('.rsi-simulation-hud');
  const controls=[...document.querySelectorAll('.chart-replay-controls [data-cr]')].filter(n=>['play','next','speed','live','transport-more','update-interval'].includes(n.dataset.cr)).map(n=>{const owner=n.closest('.chart-replay-actions'),r=box(n),o=box(owner);return {name:n.dataset.cr,rect:r,disabled:n.disabled,owner:owner?'bar':'menu',inOwner:Boolean(r?.painted&&(!o||r.left>=o.left-1&&r.right<=o.right+1)),label:n.getAttribute('aria-label'),text:n.textContent.trim(),value:n.value};});
  const notice=document.querySelector('#equity-forecast-unavailable');
  return {url:location.href,width:innerWidth,height:innerHeight,boot:document.documentElement.dataset.boot,symbol:plot?.dataset.chartSymbol,rootWidth:document.documentElement.scrollWidth,bodyWidth:document.body.scrollWidth,
    title:document.title,plot:box(plot),chart:svg?{rect:box(svg),id:svg.id,dataset:{...svg.dataset},paths:svg.querySelectorAll('path[d]').length,observedCount:Number(svg.dataset.observedCandleCount||svg.dataset.observedLineCount||0),rsiCandles:svg.querySelectorAll('[data-candle]').length,description:svg.querySelector('desc')?.textContent}:null,
    frame:frame?{url:frame.src,status:frame.dataset.centerStatus,loaded:frame.dataset.centerLoaded,rect:box(frame)}:null,
    legend:dock?{rect:box(dock),mode:dock.dataset.legendMode,sourceRect:box(legend),text:legend?.textContent.trim(),priceWidth:Number(svg?.dataset.plotRight)-Number(svg?.dataset.plotLeft),items:[...legend?.querySelectorAll('.chart-legend-entry')||[]].map(n=>({text:n.textContent.trim(),rect:box(n)})),chip:box(dock.querySelector('.chart-legend-open'))}:null,
    inlineLegend:[...document.querySelectorAll('#eth-forecast-note,.equity-legend')].map(n=>({text:n.textContent.trim(),rect:box(n)})),
    badge:badge?{text:badge.textContent.trim(),rect:box(badge),dataset:{...badge.dataset}}:null,
    hud:hud?{text:hud.textContent.trim(),rect:box(hud),fields:[...hud.querySelectorAll('[data-rsi-hud]')].map(n=>({key:n.dataset.rsiHud,text:n.textContent.trim(),rect:box(n)})),ongoing:hud.querySelector('[data-rsi-ongoing]')?.textContent.trim()}:null,
    forecastGate:{tier:plot?.dataset.forecastTier,allowed:plot?.dataset.forecastAllowed,observations:plot?.dataset.forecastObservations,notice:notice?{text:notice.textContent.trim(),rect:box(notice)}:null,paths:svg?.querySelectorAll('.equity-forecast-line,.replay-forecast-path').length,labels:[...svg?.querySelectorAll('.equity-forecast-evidence text')||[]].map(n=>n.textContent.trim())},
    replay:{active:svg?.dataset.chartReplayActive,bar:box(document.querySelector('.chart-replay-bar')),actions:box(document.querySelector('.chart-replay-actions')),controls,cursor:svg?.dataset.replayCursor,mode:svg?.dataset.replayMode},
    loading:[...docs.flatMap(d=>[...d.querySelectorAll('[data-atlas-skeleton]')])].filter(painted).length,
    dialogs:[...docs.flatMap(d=>[...d.querySelectorAll('dialog[open]')])].map(n=>({id:n.id,dataset:{...n.dataset},text:n.textContent.trim(),rect:box(n)}))};
}
async function locate(cdp,selector){return evaluate(cdp,selector=>{const frames=[...document.querySelectorAll('.atlas-center-frame')].filter(f=>f.getClientRects().length),owners=[{doc:document,offset:{left:0,top:0}},...frames.map(f=>({doc:f.contentDocument,offset:f.getBoundingClientRect()}))];for(const {doc,offset} of owners){if(!doc)continue;for(const node of doc.querySelectorAll(selector)){const r=node.getBoundingClientRect();if(node.hidden||node.closest('[hidden]')||!r.width||!r.height)continue;const x=r.left+r.width/2,y=r.top+r.height/2,hit=doc.elementFromPoint(x,y);return {x:x+offset.left,y:y+offset.top,width:r.width,height:r.height,visible:Boolean(hit&&(node===hit||node.contains(hit))),disabled:node.disabled};}}return null;},selector);}
async function click(cdp,selector){const target=await locate(cdp,selector);assert.ok(target?.visible,'Native target is not reachable: '+selector+' '+JSON.stringify(target));assert.ok(!target.disabled,'Native target is disabled: '+selector);await cdp.send('Input.dispatchMouseEvent',{type:'mousePressed',button:'left',clickCount:1,x:target.x,y:target.y});await cdp.send('Input.dispatchMouseEvent',{type:'mouseReleased',button:'left',clickCount:1,x:target.x,y:target.y});await settled(cdp);}
async function key(cdp,key,code,n){for(const type of ['keyDown','keyUp'])await cdp.send('Input.dispatchKeyEvent',{type,key,code,windowsVirtualKeyCode:n,nativeVirtualKeyCode:n});await settled(cdp);}

async function openReplay(cdp){
  const trigger=await locate(cdp,'#workbench-replay');
  if(!trigger?.visible){await click(cdp,'#mobile-details-toggle');await click(cdp,'[data-mobile-target="#workbench-replay"]');}
  else await click(cdp,'#workbench-replay');
  await until(()=>evaluate(cdp,()=>document.querySelector('.chart-replay-controls')?.hidden===false),'replay controls');
  await until(()=>evaluate(cdp,()=>!document.querySelector('[data-cr="select-menu"]')?.disabled),'replay source ready');
  if(!await locate(cdp,'[data-cr="select-first"]'))await click(cdp,'[data-cr="select-menu"]');
  await click(cdp,'[data-cr="select-first"]');
  await until(()=>evaluate(cdp,()=>Boolean(document.querySelector('#lab-chart')?.dataset.replayCursor)&&!document.querySelector('[data-cr="next"]')?.disabled),'replay first source bar');
  await settled(cdp);
}
function assertViewport(state){assert.ok(Math.max(state.rootWidth,state.bodyWidth)<=state.width+1,'Horizontal page overflow');assert.equal(state.loading,0,'Persistent loading skeleton');assert.ok(state.chart?.rect.painted&&state.chart.paths>0,'No painted source chart');}
function assertLegend(state){assert.ok(state.legend?.rect.painted,'No shared legend');const b=state.legend.rect;assert.ok(b.left>=-1&&b.right<=state.width+1);assert.ok(b.scrollWidth<=b.clientWidth+1,'Legend overflow');if(Number.isFinite(state.legend.priceWidth))assert.ok(b.width<=state.legend.priceWidth*.42+1,'Legend exceeds 42%');if(state.width<=390)assert.equal(state.legend.mode,'chip');}

async function runCase(spec,debugBase){
  const {symbol,width,height}=spec,id=symbol.toLowerCase()+'-'+width+'x'+height,receipt={...spec,id,status:'RUNNING',screenshots:[],runtimeErrors:[],resourceErrors:[],startedAt:new Date().toISOString()};report.cases.push(receipt);
  let cdp,contextId,targetId;
  try{
    ({browserContextId:contextId}=await browser.send('Target.createBrowserContext'));
    ({targetId}=await browser.send('Target.createTarget',{url:'about:blank',browserContextId:contextId}));
    const target=await until(async()=>{const list=await(await fetch(debugBase+'/json/list')).json();return list.find(t=>t.id===targetId&&t.webSocketDebuggerUrl);},'page target');
    cdp=await Cdp.connect(target.webSocketDebuggerUrl);receipt.contextId=contextId;
    cdp.on('Runtime.exceptionThrown',event=>receipt.runtimeErrors.push(event.exceptionDetails));
    cdp.on('Network.responseReceived',event=>{if(event.response.status>=400)receipt.resourceErrors.push({url:event.response.url,status:event.response.status});});
    await cdp.send('Page.enable');await cdp.send('Runtime.enable');await cdp.send('Network.enable');await cdp.send('Network.setCacheDisabled',{cacheDisabled:true});
    await cdp.send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:false});
    await cdp.send('Emulation.setTouchEmulationEnabled',{enabled:width<=768,maxTouchPoints:5});
    receipt.url=origin+(symbol==='TQQQ'?'/market-lab/charts/?symbol=TQQQ':'/?symbol='+symbol+'&granularity=daily&type=line');
    await cdp.send('Page.navigate',{url:receipt.url});
    await until(async()=>{const state=await evaluate(cdp,readWp6);return state.boot==='ready'&&state.chart?.rect.painted&&state.chart.paths>0&&(!state.frame||state.frame.status==='ready')?state:null;},id+' usable chart',60000);
    if(['ETHUSD','MSTR','BMNR'].includes(symbol))await until(async()=>{const state=await evaluate(cdp,readWp6);return state.chart?.dataset.forecastPointCount!=='0'||state.forecastGate.allowed==='false'?state:null;},id+' resolved model',60000);
    await settled(cdp);receipt.initial=await evaluate(cdp,readWp6);assertViewport(receipt.initial);
    if(phase==='after')assertLegend(receipt.initial);
    await screenshot(cdp,id+'-chart.png',receipt);
    if(symbol==='BMNR'&&phase==='after'){
      assert.equal(receipt.initial.forecastGate.tier,'T3');assert.equal(receipt.initial.forecastGate.allowed,'false');assert.equal(receipt.initial.forecastGate.paths,0);
      assert.match(receipt.initial.forecastGate.notice.text,/표본 부족으로 미래 경로를 제공하지 않습니다/);assert.match(receipt.initial.forecastGate.notice.text,/관측 \d+거래일/);
    }
    if(symbol==='TQQQ'&&phase==='after'){
      assert.match(receipt.initial.badge?.text||'',/승률.*n\s*=\s*\d+/);
      assert.deepEqual(receipt.initial.hud?.fields.map(x=>x.key).sort(),['holdings','quantity','average-cost','current-price','pnl','next-trigger','updated-at'].sort());
      await click(cdp,'[data-rsi-win-badge]');await until(()=>evaluate(cdp,()=>Boolean(document.querySelector('[data-rsi-dialog="simulation"][open]'))),'statistics modal');
      receipt.simulationDialog=await evaluate(cdp,readWp6);
      for(const text of ['PF','기대값','보유','낙폭','bp','기간','체결'])assert.ok(receipt.simulationDialog.dialogs.some(d=>d.text.includes(text)),'Statistics modal missing '+text);
      assert.ok((await locate(cdp,'[data-rsi-dialog="simulation"] [data-rsi-dialog-close]'))?.visible,'Statistics close is clipped');
      await screenshot(cdp,id+'-statistics.png',receipt);await click(cdp,'[data-rsi-dialog="simulation"] [data-rsi-dialog-close]');
      assert.ok((await evaluate(cdp,readWp6)).chart?.rect.painted,'Chart unmounted while closing statistics');
    }
    if(symbol==='BTCUSD'){
      await openReplay(cdp);receipt.replay=await evaluate(cdp,readWp6);receipt.replayGeometry=await evaluate(cdp,readChartReplayFloatingGeometry,{chartSelector:'#lab-chart',panel:'.chart-replay-controls'});
      await screenshot(cdp,id+'-replay.png',receipt);
      if(phase==='after'){
        const actions=receipt.replay.replay.actions;assert.ok(actions.scrollWidth<=actions.clientWidth+1,'Replay depends on horizontal scrolling');
        for(const name of ['play','next'])assert.ok(receipt.replay.replay.controls.find(c=>c.name===name)?.inOwner,'Core replay control is clipped: '+name);
        const cursor=receipt.replay.replay.cursor;await click(cdp,'[data-cr="next"]');await until(()=>evaluate(cdp,cursor=>document.querySelector('#lab-chart').dataset.replayCursor!==cursor,cursor),'one revealed next candle');
        receipt.afterNext=await evaluate(cdp,readWp6);
        if(!(await locate(cdp,'[data-cr="speed"]'))?.visible){await click(cdp,'[data-cr="transport-more"]');receipt.overflow=await evaluate(cdp,readWp6);await screenshot(cdp,id+'-replay-menu.png',receipt);}
        for(const name of ['speed','live'])assert.ok((await locate(cdp,'[data-cr="'+name+'"]'))?.visible,'Core replay action is unreachable: '+name);
        await click(cdp,'[data-cr="speed"]');await key(cdp,'ArrowDown','ArrowDown',40);await key(cdp,'Enter','Enter',13);
        receipt.speed=await evaluate(cdp,()=>document.querySelector('[data-cr="speed"]').value);
        await click(cdp,'[data-cr="live"]');await until(()=>evaluate(cdp,()=>!document.querySelector('[data-cr="exit-dialog"]').hidden),'latest navigation confirmation');
        receipt.latestAction=await evaluate(cdp,readWp6);await click(cdp,'[data-cr="exit-confirm"]');await settled(cdp);receipt.returned=await evaluate(cdp,readWp6);
        assert.notEqual(receipt.returned.replay.active,'true','Latest navigation did not exit replay');
      }
    }
    assert.equal(receipt.runtimeErrors.length,0,'Unhandled browser exceptions');receipt.status='PASS';
  }catch(error){receipt.status='FAIL';receipt.error=String(error.stack||error);report.failures.push({id,error:receipt.error});if(cdp)try{await screenshot(cdp,id+'-failure.png',receipt);}catch{}}
  finally{cdp?.close();if(contextId)try{await browser.send('Target.disposeBrowserContext',{browserContextId:contextId});}catch{}receipt.finishedAt=new Date().toISOString();await writeFile(resolve(out,'report.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({id,status:receipt.status,error:receipt.error?.split('\n')[0],screenshots:receipt.screenshots.length}));}
}

try{
  await mkdir(out,{recursive:true});assert.ok(['before','after'].includes(phase));
  report.inspector={sourceCommit:git(['rev-parse','HEAD']),sourceTree:git(['rev-parse','HEAD^{tree}']),workingChanges:git(['status','--short'])};
  report.publicationBefore=await publication();
  const binary=process.env.ATLAS_BROWSER_PATH;assert.ok(binary,'ATLAS_BROWSER_PATH is required; no browser case may be reported as passed without Chrome');
  report.browserBinary=binary;report.koreanFonts=execFileSync('fc-list',[':lang=ko'],{encoding:'utf8'}).trim().split('\n').slice(0,8);assert.ok(report.koreanFonts[0],'Korean fonts are unavailable');
  profile=await mkdtemp(resolve(tmpdir(),'atlas-wp6-browser-'));
  chrome=spawn(binary,['--headless=new','--no-sandbox','--disable-dev-shm-usage','--disable-background-networking','--disable-component-update','--disable-sync','--no-first-run','--no-default-browser-check','--remote-debugging-port=0','--user-data-dir='+profile,'about:blank'],{stdio:['ignore','ignore','pipe']});
  let spawnError;chrome.on('error',error=>{spawnError=error;});chrome.stderr.on('data',bytes=>{stderr=(stderr+bytes.toString()).slice(-12000);});
  const active=await until(async()=>{if(spawnError)throw spawnError;if(chrome.exitCode!==null||chrome.signalCode!==null)throw new Error('Chrome launch failed ('+(chrome.exitCode??chrome.signalCode)+'): '+stderr);try{return(await readFile(resolve(profile,'DevToolsActivePort'),'utf8')).trim().split('\n');}catch{return null;}},'Chrome inspector',20000);
  const debugBase='http://127.0.0.1:'+active[0];browser=await Cdp.connect('ws://127.0.0.1:'+active[0]+active[1]);report.browser=await browser.send('Browser.getVersion');
  for(const [width,height] of viewports)for(const symbol of symbols)await runCase({symbol,width,height},debugBase);
  report.publicationAfter=await publication();if(expectedSource)assert.equal(report.publicationAfter.sha256,report.publicationBefore.sha256,'Publication changed during captures');
  report.status=report.failures.length?'FAIL':'PASS';
}catch(error){report.status='FAIL';report.error=String(error.stack||error);}
finally{
  if(browser){try{await browser.send('Browser.close');}catch{}browser.close();}
  if(chrome?.exitCode===null){chrome.kill('SIGTERM');await Promise.race([new Promise(r=>chrome.once('close',r)),delay(1500)]);if(chrome.exitCode===null)chrome.kill('SIGKILL');}
  if(stderr)report.chromeStderr=stderr;
  if(profile)await rm(profile,{recursive:true,force:true});report.finishedAt=new Date().toISOString();await mkdir(out,{recursive:true});await writeFile(resolve(out,'report.json'),JSON.stringify(report,null,2)+'\n');
  console.log(JSON.stringify({status:report.status,phase,origin,cases:report.cases.length,failures:report.failures.length,report:resolve(out,'report.json'),error:report.error?.split('\n')[0]}));process.exitCode=report.status==='PASS'?0:1;
}
