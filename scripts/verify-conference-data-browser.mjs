#!/usr/bin/env node
// P1b: the committed real transcript, without generated media or timeline overrides.
// Keep the independent P1a/R13 fixture suite unchanged.
import assert from 'node:assert/strict';
import {spawn, execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {createServer} from 'node:http';
import {mkdir, mkdtemp, readFile, realpath, rm, stat, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {resolve, relative, sep, extname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {gzipSync, brotliCompressSync} from 'node:zlib';
import {headlessWindowArgument, verifyHeadlessWindowEnvelope} from './headless-browser-window.mjs';
import {selectNativeOptionByKeyboard} from './native-select-keyboard.mjs';
import {replaceNativeInputText} from './native-input-keyboard.mjs';

const root = fileURLToPath(new URL('..', import.meta.url)), dist = resolve(root, 'dist');
const args = process.argv.slice(2);
const option = (name, fallback) => args.includes(name) ? args[args.indexOf(name) + 1] : fallback;
const out = resolve(root, option('--out', 'build/conference-data-browser'));
const browser = process.env.ATLAS_BROWSER_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const profileName = option('--profile', 'fast4g'), encoding = option('--encoding', 'gzip');
// Pinned Chromium DevTools presets, including their CDP adjustment factors:
// https://chromium.googlesource.com/devtools/devtools-frontend/+/b2cbf557e71b23f634a169ca7bc782efeb29b6a5/front_end/core/sdk/NetworkManager.ts
const profiles = {
  fast4g:{label:'Chrome DevTools Fast 4G', offline:false, latency:165, downloadThroughput:1012500, uploadThroughput:168750, connectionType:'cellular4g'},
  slow4g:{label:'Chrome DevTools Slow 4G', offline:false, latency:562.5, downloadThroughput:180000, uploadThroughput:84375, connectionType:'cellular4g'},
  unthrottled:{label:'Local unthrottled diagnostic', offline:false, latency:0, downloadThroughput:-1, uploadThroughput:-1, connectionType:'none'},
};
assert.ok(profiles[profileName], 'Unknown --profile');
assert.ok(['gzip', 'identity'].includes(encoding), 'Unknown --encoding');
const viewports = [{width:390,height:844},{width:320,height:740},{width:768,height:1024},
  {width:1024,height:768},{width:1440,height:900},{width:1920,height:1080}];
const casePrefix = option('--case', '');
const delay = ms => new Promise(accept => setTimeout(accept, ms));
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const timelineBytes = await readFile(resolve(dist, 'conference/timeline.json'));
const timeline = JSON.parse(timelineBytes);
assert.notEqual(timeline.synthetic, true, 'This suite must use committed real data');
assert.equal(timeline.event.id, 'plspo-2026-10-31');
assert.ok(timeline.audio.every(clip => clip.available === false), 'P1b has no published audio');
assert.ok(timeline.decks.every(deck => deck.imagesAvailable === false), 'P1b has no published page images');
const mappedPages = [...new Set(timeline.segments.map(segment=>segment.page?.[timeline.decks[0].id]).filter(Number.isInteger))];
const sampleEligible = (segment,index) => timeline.segments[index+1]?.t0 !== segment.t0 &&
  Number.isInteger(segment.page?.[timeline.decks[0].id]) &&
  mappedPages.filter(page=>page>segment.page[timeline.decks[0].id]).length>=5;
const sampleIndex = timeline.segments.findIndex((segment,index) => sampleEligible(segment,index) && !segment.page?.[timeline.decks[1].id]);
const initialIndex = sampleIndex >= 0 ? sampleIndex : timeline.segments.findIndex(sampleEligible);
assert.ok(initialIndex >= 0, 'At least one real mapped subtitle is required');
const initial = timeline.segments[initialIndex];
const report = {schemaVersion:1,kind:'atlas-conference-p1b-data-browser',status:'failed',
  startedAt:new Date().toISOString(),sourceCommit:execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim(),
  workingChanges:execFileSync('git',['status','--porcelain'],{cwd:root,encoding:'utf8'}).trim(),
  syntheticFixture:false,productionDeployment:false,realAudioSync:false,realSlideImages:false,
  timeline:{file:'dist/conference/timeline.json',bytes:timelineBytes.length,sha256:sha(timelineBytes),
    gzipBytes:gzipSync(timelineBytes,{level:9}).length,brotliBytes:brotliCompressSync(timelineBytes).length,
    segments:timeline.segments.length,talks:timeline.talks.length},
  network:{...profiles[profileName],serverEncoding:encoding,cacheDisabled:true,cpuThrottling:1},
  budgets:{initialPaintedReadyMs:2500,pageTransitionMs:150},cases:[],failures:[]};

class Cdp {
  constructor(ws) {
    this.ws=ws;this.id=0;this.pending=new Map();this.listeners=new Map();
    ws.addEventListener('message',event=>{
      const data=JSON.parse(String(event.data));
      if(!data.id){for(const listener of this.listeners.get(data.method)||[])listener(data.params||{});return;}
      const call=this.pending.get(data.id);if(!call)return;this.pending.delete(data.id);clearTimeout(call.timer);
      data.error?call.reject(new Error(JSON.stringify(data.error))):call.resolve(data.result||{});
    });
  }
  static async connect(url){const ws=new WebSocket(url);await new Promise((accept,reject)=>{ws.addEventListener('open',accept,{once:true});ws.addEventListener('error',reject,{once:true});});return new Cdp(ws);}
  on(method,listener){this.listeners.set(method,[...(this.listeners.get(method)||[]),listener]);}
  send(method,params={}){return new Promise((accept,reject)=>{const id=++this.id;const timer=setTimeout(()=>{this.pending.delete(id);reject(new Error('CDP timeout: '+method));},30000);this.pending.set(id,{resolve:accept,reject,timer});this.ws.send(JSON.stringify({id,method,params}));});}
  close(){this.ws.close();for(const item of this.pending.values()){clearTimeout(item.timer);item.reject(new Error('CDP closed'));}this.pending.clear();}
}
async function evaluate(cdp,fn,...values){const response=await cdp.send('Runtime.evaluate',{expression:`(${fn.toString()})(${values.map(value=>JSON.stringify(value)).join(',')})`,returnByValue:true,awaitPromise:true});if(response.exceptionDetails)throw new Error('Browser evaluation: '+JSON.stringify(response.exceptionDetails));return response.result.value;}
async function until(read,label,timeout=120000){const deadline=Date.now()+timeout;let last;while(Date.now()<deadline){last=await read();if(last)return last;await delay(50);}throw new Error('Timed out: '+label+'; last='+JSON.stringify(last));}
async function settled(cdp){await evaluate(cdp,async()=>{await document.fonts.ready;await new Promise(accept=>requestAnimationFrame(()=>requestAnimationFrame(accept)));});}
async function click(cdp,selector){
  const locate=async block=>{
    await evaluate(cdp,(selector,block)=>{const node=document.querySelector(selector);if(!node||node.disabled||node.closest('[hidden]'))throw Error('Unavailable '+selector);node.scrollIntoView({block,inline:'nearest'});},selector,block);
    await settled(cdp);
    return evaluate(cdp,selector=>{const node=document.querySelector(selector),r=node.getBoundingClientRect(),x=r.left+r.width/2,y=r.top+r.height/2,hit=document.elementFromPoint(x,y);return {x,y,hitTarget:Boolean(hit&&node.contains(hit)),fixedHeader:Boolean(hit?.closest('.atlas-dashboard-header')&&getComputedStyle(hit.closest('.atlas-dashboard-header')).position==='fixed'),scrollY};},selector);
  };
  let point=await locate('nearest');
  if(!point.hitTarget)point=await locate('center');
  if(!point.hitTarget&&point.fixedHeader&&point.scrollY>0){
    await cdp.send('Input.dispatchMouseEvent',{type:'mouseWheel',x:point.x,y:point.y,deltaX:0,deltaY:-point.scrollY});
    await until(()=>evaluate(cdp,()=>scrollY===0),'native document scroll before '+selector);
    point=await locate('nearest');
  }
  assert.ok(point.hitTarget,'Covered '+selector+' '+JSON.stringify(point));
  await cdp.send('Input.dispatchMouseEvent',{type:'mousePressed',x:point.x,y:point.y,button:'left',clickCount:1});
  await cdp.send('Input.dispatchMouseEvent',{type:'mouseReleased',x:point.x,y:point.y,button:'left',clickCount:1});
}
function inspect(){
  const root=document.querySelector('.conference-player'),role=name=>root?.querySelector('[data-role="'+name+'"]');
  const rectangle=node=>{if(!node)return null;const r=node.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height};};
  return {url:location.href,state:root?{...root.dataset}:null,h1Count:document.querySelectorAll('h1').length,
    overflow:Math.max(document.documentElement.scrollWidth,document.body.scrollWidth)-innerWidth,
    stage:rectangle(root?.querySelector('.conference-stage')),caption:rectangle(root?.querySelector('.conference-caption')),
    stateTitle:role('state-title')?.textContent,notice:role('notice')?.textContent,pageStatus:role('page-status')?.textContent,
    imageSource:root?.querySelector('img')?.getAttribute('src'),audioSource:root?.querySelector('audio')?.getAttribute('src'),
    transcriptRows:root?.querySelectorAll('.conference-transcript-row').length,
    transcriptOpen:Boolean(root?.querySelector('.conference-transcript')?.open),fontStatus:document.fonts.status,
    time:performance.now(),ready:window.__conferenceDataReady||null};
}
function installReadyObserver(){
  performance.setResourceTimingBufferSize(4000);
  let scheduled=false;
  const observe=new MutationObserver(()=>{
    if(scheduled||document.querySelector('.conference-player')?.dataset.state!=='ready')return;
    scheduled=true;
    const record=()=>{
      const player=document.querySelector('.conference-player');
      const visible=node=>Boolean(node?.checkVisibility({checkOpacity:true,checkVisibilityCSS:true})&&node.getBoundingClientRect().width>0&&node.getBoundingClientRect().height>0);
      const h1=document.querySelector('h1'),stage=player?.querySelector('.conference-stage'),caption=player?.querySelector('.conference-caption');
      if(!visible(player)||!visible(h1)||!visible(stage)||!visible(caption)||caption.disabled){requestAnimationFrame(record);return;}
      window.__conferenceDataReady={paintedMs:performance.now(),state:player?.dataset.state,
        transcriptRows:player?.querySelectorAll('.conference-transcript-row').length,fontStatus:document.fonts.status,
        h1Count:document.querySelectorAll('h1').length,visibleStage:true,visibleCaption:true,captionEnabled:!caption.disabled,
        overflow:Math.max(document.documentElement.scrollWidth,document.body.scrollWidth)-innerWidth};
      observe.disconnect();
    };
    requestAnimationFrame(()=>requestAnimationFrame(record));
  });
  observe.observe(document,{subtree:true,childList:true,attributes:true,attributeFilter:['data-state']});
}

let server,child,browserCdp,browserProfile,origin,debugOrigin,stderr='';
const assetCache=new Map();
const mime={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8',
  '.json':'application/json; charset=utf-8','.svg':'image/svg+xml','.png':'image/png','.webp':'image/webp','.ico':'image/x-icon',
  '.woff2':'font/woff2','.woff':'font/woff','.mjs':'text/javascript; charset=utf-8'};
const requests=[];
async function sources(){
  const files=execFileSync('git',['ls-files','--cached','--others','--exclude-standard','--','dist',
    'scripts/verify-conference-data-browser.mjs','scripts/native-input-keyboard.mjs','scripts/native-select-keyboard.mjs','scripts/headless-browser-window.mjs'],{cwd:root,encoding:'utf8'}).trim().split('\n').filter(Boolean);
  return Object.fromEntries(await Promise.all([...new Set(files)].sort().map(async file=>[file,sha(await readFile(resolve(root,file)))])));
}
async function createPage(viewport){
  const {browserContextId}=await browserCdp.send('Target.createBrowserContext');
  const {targetId}=await browserCdp.send('Target.createTarget',{url:'about:blank',browserContextId});
  const target=await until(async()=>{const targets=await (await fetch(debugOrigin+'/json/list')).json();return targets.find(item=>item.id===targetId);},'new isolated target');
  const cdp=await Cdp.connect(target.webSocketDebuggerUrl);
  await cdp.send('Page.enable');await cdp.send('Runtime.enable');await cdp.send('Network.enable');await cdp.send('Log.enable');
  const nativeWindow=await verifyHeadlessWindowEnvelope(cdp,viewport);
  await cdp.send('Emulation.setDeviceMetricsOverride',{...viewport,deviceScaleFactor:1,mobile:false});
  await cdp.send('Network.setCacheDisabled',{cacheDisabled:true});
  const {label,...conditions}=profiles[profileName];await cdp.send('Network.emulateNetworkConditions',conditions);
  await cdp.send('Page.addScriptToEvaluateOnNewDocument',{source:`(${installReadyObserver.toString()})()`});
  return {cdp,nativeWindow,async dispose(){cdp.close();await browserCdp.send('Target.disposeBrowserContext',{browserContextId});}};
}
async function interactions(cdp,entry){
  // Physical key dispatch uses the existing trusted native select helper.
  if(entry.width<=767)await click(cdp,'[data-action=settings]');
  const before=await evaluate(cdp,inspect);
  entry.deckSelection=await selectNativeOptionByKeyboard({cdp,evaluate,context:cdp,settled,
    selector:'[data-role=deck]',value:timeline.decks[1].id,viewport:{width:entry.width,height:entry.height,mobile:false}});
  const after=await evaluate(cdp,inspect);
  assert.equal(Number(after.state.time),Number(before.state.time),'Deck change preserves event time');
  assert.equal(after.state.deck,timeline.decks[1].id);
  if(!initial.page?.[timeline.decks[1].id])assert.match(after.pageStatus,/장표 없음/);
  entry.deckSwitch={before:before.state,after:after.state,badge:after.pageStatus};
  await selectNativeOptionByKeyboard({cdp,evaluate,context:cdp,settled,selector:'[data-role=deck]',value:timeline.decks[0].id,viewport:{width:entry.width,height:entry.height,mobile:false}});
  if(entry.width<=767)await click(cdp,'[data-action=settings]');
  await evaluate(cdp,()=>document.activeElement?.blur());
  await evaluate(cdp,()=>{
    window.__conferencePageTransitions=[];
    let started=null,oldPage=null;
    // Window capture runs before the player's document capture handler.
    window.addEventListener('keydown',event=>{if(event.key===']'){started=performance.now();oldPage=document.querySelector('.conference-player').dataset.page;}},true);
    const observer=new MutationObserver(()=>{const page=document.querySelector('.conference-player').dataset.page;if(started===null||page===oldPage)return;const at=started;started=null;requestAnimationFrame(()=>requestAnimationFrame(()=>window.__conferencePageTransitions.push({milliseconds:performance.now()-at,page})));});
    observer.observe(document.querySelector('.conference-player'),{attributes:true,attributeFilter:['data-page']});
  });
  for(let i=0;i<5;i++){
    const count=await evaluate(cdp,()=>window.__conferencePageTransitions.length);
    await cdp.send('Input.dispatchKeyEvent',{type:'keyDown',key:']',code:'BracketRight',windowsVirtualKeyCode:221});
    await cdp.send('Input.dispatchKeyEvent',{type:'keyUp',key:']',code:'BracketRight',windowsVirtualKeyCode:221});
    await until(()=>evaluate(cdp,count=>window.__conferencePageTransitions.length>count,count),'painted page transition');
  }
  entry.pageTransitions=await evaluate(cdp,()=>window.__conferencePageTransitions);
  const openAt=await evaluate(cdp,()=>performance.now());
  await click(cdp,'.conference-caption');
  await until(()=>evaluate(cdp,count=>document.querySelectorAll('.conference-transcript-row').length===count,timeline.segments.length),'full source row inventory');
  await settled(cdp);
  entry.transcriptOpenMs=(await evaluate(cdp,()=>performance.now()))-openAt;
  const rows=await evaluate(cdp,()=>[...document.querySelectorAll('.conference-transcript-row')].map(row=>({index:Number(row.dataset.segment),text:row.querySelector('.conference-transcript-text').textContent})));
  assert.equal(rows.length,timeline.segments.length);
  for(let i=0;i<rows.length;i++){assert.equal(rows[i].index,i);assert.equal(rows[i].text,timeline.segments[i].text,'Exact source text at '+i);}
  const last=timeline.segments.at(-1),query=last.text.trim();
  entry.search=await replaceNativeInputText({cdp,evaluate,context:cdp,settled,until,selector:'[data-role=transcript-search]',text:query});
  assert.equal(await evaluate(cdp,()=>document.querySelector('[data-role=transcript-search]').value),query);
  await click(cdp,'[data-segment="'+(timeline.segments.length-1)+'"]');
  const lastState=await evaluate(cdp,inspect);
  assert.equal(Number(lastState.state.time),last.t0);
  assert.equal(await evaluate(cdp,()=>document.querySelector('.conference-caption-text').textContent),last.text);
  entry.sourceReachability={rows:rows.length,changedText:0,lastSource:last.source,lastEventTime:lastState.state.time};
  await click(cdp,'[data-action=close-transcript]');
}
try{
  // Receipts are append-only by directory: a failed attempt cannot be overwritten.
  await mkdir(out,{recursive:false});
  report.sourceHashes=await sources();
  server=createServer(async(req,res)=>{const request={url:req.url,status:null};requests.push(request);try{
    let path=new URL(req.url,'http://127.0.0.1').pathname.replace(/^\/bitcoin-cycle-atlas(?=\/)/,'');
    if(path.endsWith('/'))path+='index.html';
    const file=await realpath(resolve(dist,'.'+decodeURIComponent(path))),rel=relative(dist,file);
    assert.ok(rel!=='..'&&!rel.startsWith('..'+sep)&&(await stat(file)).isFile());
    if(!assetCache.has(file)){const bytes=await readFile(file),compress=encoding==='gzip'&&/\.(?:html|css|js|mjs|json|svg)$/.test(file);assetCache.set(file,{bytes:compress?gzipSync(bytes,{level:9}):bytes,compress});}
    const asset=assetCache.get(file);request.status=200;request.bytes=asset.bytes.length;
    res.writeHead(200,{'Content-Type':mime[extname(file)]||'application/octet-stream','Content-Length':asset.bytes.length,
      'Cache-Control':'no-store',...(asset.compress?{'Content-Encoding':'gzip','Vary':'Accept-Encoding'}:{})});
    res.end(req.method==='HEAD'?undefined:asset.bytes);
  }catch(error){request.status=404;res.writeHead(404);res.end(String(error.message));}});
  await new Promise(accept=>server.listen(0,'127.0.0.1',accept));origin='http://127.0.0.1:'+server.address().port;report.origin=origin;
  browserProfile=await mkdtemp(resolve(tmpdir(),'atlas-conference-data-browser-'));
  child=spawn(browser,['--headless=new','--disable-gpu','--disable-dev-shm-usage','--disable-background-networking','--no-first-run','--hide-scrollbars',headlessWindowArgument,'--remote-debugging-port=0','--user-data-dir='+browserProfile,'about:blank'],{stdio:['ignore','ignore','pipe']});
  child.stderr.on('data',bytes=>stderr+=bytes);
  const endpoint=await until(()=>{if(child.exitCode!==null)throw new Error('Chrome exited '+child.exitCode+': '+stderr.slice(-2000));return stderr.match(/DevTools listening on (ws:\/\/127\.0\.0\.1:\d+\/[^\s]+)/)?.[1];},'Chrome CDP');
  debugOrigin=new URL(endpoint).origin.replace('ws:','http:');browserCdp=await Cdp.connect(endpoint);report.browserVersion=await browserCdp.send('Browser.getVersion');
  for(const viewport of viewports){
    const id=viewport.width+'x'+viewport.height;if(casePrefix&&!id.startsWith(casePrefix))continue;
    const entry={id,...viewport,status:'failed',runtimeErrors:[],networkErrors:[],failures:[]};report.cases.push(entry);let page;
    try{
      page=await createPage(viewport);entry.nativeWindow=page.nativeWindow;const cdp=page.cdp;
      cdp.on('Runtime.exceptionThrown',event=>entry.runtimeErrors.push(event.exceptionDetails));
      cdp.on('Runtime.consoleAPICalled',event=>{if(event.type==='error')entry.runtimeErrors.push(event.args);});
      cdp.on('Network.loadingFailed',event=>{if(!event.canceled)entry.networkErrors.push(event);});
      await cdp.send('Page.navigate',{url:origin+'/bitcoin-cycle-atlas/?page=conference&t='+initial.t0+'&deck='+timeline.decks[0].id});
      await until(()=>evaluate(cdp,()=>window.__conferenceDataReady),'painted real timeline ready');
      entry.initial=await evaluate(cdp,inspect);
      assert.equal(entry.initial.h1Count,1);assert.equal(entry.initial.overflow,0);
      assert.equal(entry.initial.ready.h1Count,1);assert.equal(entry.initial.ready.overflow,0);
      assert.equal(entry.initial.state.state,'ready');assert.equal(Number(entry.initial.state.time),initial.t0);
      assert.equal(entry.initial.state.deck,timeline.decks[0].id);assert.equal(Number(entry.initial.state.page),initial.page[timeline.decks[0].id]);
      assert.equal(entry.initial.transcriptRows,0,'Large transcript is lazy');
      assert.match(entry.initial.stateTitle,/장표 이미지 없음/);assert.match(entry.initial.notice,/오디오 없음/);
      assert.equal(entry.initial.imageSource,null);assert.equal(entry.initial.audioSource,null);
      if(profileName!=='unthrottled'&&entry.initial.ready.paintedMs>report.budgets.initialPaintedReadyMs)entry.failures.push('Initial painted ready '+entry.initial.ready.paintedMs+'ms exceeds 2500ms');
      await settled(cdp);entry.settled=await evaluate(cdp,inspect);
      assert.equal(entry.settled.h1Count,1);assert.equal(entry.settled.overflow,0);
      const shot=await cdp.send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});
      await writeFile(resolve(out,id+'.png'),Buffer.from(shot.data,'base64'));entry.screenshot=id+'.png';
      if([320,1440].includes(viewport.width))await interactions(cdp,entry);
      entry.resources=await evaluate(cdp,()=>performance.getEntriesByType('resource').map(item=>({name:item.name,startTime:item.startTime,duration:item.duration,transferSize:item.transferSize,encodedBodySize:item.encodedBodySize,decodedBodySize:item.decodedBodySize,initiatorType:item.initiatorType})));
      entry.timelineResource=entry.resources.find(item=>new URL(item.name).pathname.endsWith('/conference/timeline.json'));
      assert.ok(entry.timelineResource,'Canonical timeline was fetched');
      assert.deepEqual(entry.runtimeErrors,[],'No unhandled JavaScript or console errors');
      assert.deepEqual(entry.networkErrors,[],'No unexpected network failures');
      entry.functionalStatus='passed';
      if(entry.pageTransitions?.some(item=>item.milliseconds>report.budgets.pageTransitionMs))entry.failures.push('A page transition exceeds 150ms');
      entry.status=entry.failures.length?'failed':'passed';
    }catch(error){entry.failures.push(String(error.stack||error));}
    finally{
      if(page){
        try{
          entry.resources=await evaluate(page.cdp,()=>performance.getEntriesByType('resource').map(item=>({name:item.name,startTime:item.startTime,duration:item.duration,transferSize:item.transferSize,encodedBodySize:item.encodedBodySize,decodedBodySize:item.decodedBodySize,initiatorType:item.initiatorType})));
          entry.timelineResource=entry.resources.find(item=>new URL(item.name).pathname.endsWith('/conference/timeline.json'));
          if(entry.status==='failed')entry.finalState=await evaluate(page.cdp,inspect);
        }catch(error){entry.receiptError=String(error.message);}
      }
      await page?.dispose();for(const error of entry.failures)report.failures.push({id,error});console.log(JSON.stringify({id,status:entry.status,functionalStatus:entry.functionalStatus,readyMs:entry.initial?.ready?.paintedMs,failures:entry.failures.map(item=>item.split('\n')[0])}));await writeFile(resolve(out,'report.json'),JSON.stringify(report,null,2)+'\n');
    }
  }
  assert.ok(report.cases.length>0,'At least one real-data case');
  if(!casePrefix)assert.equal(report.cases.length,6);
  const mediaRequests=requests.filter(item=>/\/conference\/(audio|pages)\//.test(item.url));
  report.absentMediaRequests=mediaRequests;assert.deepEqual(mediaRequests,[],'No requests for known absent media');
  report.httpErrors=requests.filter(item=>item.status>=400);assert.deepEqual(report.httpErrors,[],'No failed local HTTP responses');
  const after=await sources();report.sourceIntegrity={unchangedDuringRun:JSON.stringify(after)===JSON.stringify(report.sourceHashes)};
  assert.deepEqual(after,report.sourceHashes,'Conference sources did not change during the run');
  report.status=report.failures.length?'failed':'passed';
}catch(error){report.failures.push({id:'harness',error:String(error.stack||error)});}
finally{
  browserCdp?.close();child?.kill('SIGTERM');if(server){server.closeAllConnections();await new Promise(accept=>server.close(accept));}
  if(browserProfile)await rm(browserProfile,{recursive:true,force:true}).catch(()=>{});
  report.finishedAt=new Date().toISOString();report.requests=requests;
  // mkdir above must succeed before any receipt path is written.
  if(report.sourceHashes){await writeFile(resolve(out,'chrome.stderr.log'),stderr);await writeFile(resolve(out,'report.json'),JSON.stringify(report,null,2)+'\n');}
  console.log(JSON.stringify({status:report.status,cases:report.cases.length,passed:report.cases.filter(item=>item.status==='passed').length,functionalPassed:report.cases.filter(item=>item.functionalStatus==='passed').length,failures:report.failures.length,output:out}));
  process.exitCode=report.status==='passed'?0:1;
}
