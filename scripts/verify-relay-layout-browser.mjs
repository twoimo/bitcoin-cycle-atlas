#!/usr/bin/env node
// Native Chrome check of the Telegram-style relay: list and room panes, the `room` URL param,
// browser Back, keyboard rows and Esc, and the loading, error, empty and ready states.
// Real input only (CDP mouse, keys and history traversal); no DOM, style or state overrides.
import {spawn} from 'node:child_process';
import {createServer} from 'node:http';
import {createHash} from 'node:crypto';
import {mkdtemp,mkdir,readFile,rm,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {extname,resolve,sep} from 'node:path';
import {fileURLToPath} from 'node:url';
import {headlessWindowArgument,verifyHeadlessWindowEnvelope} from './headless-browser-window.mjs';

const root=fileURLToPath(new URL('..',import.meta.url)),dist=resolve(root,'dist');
const arg=name=>process.argv.includes(name)?process.argv[process.argv.indexOf(name)+1]:null;
const out=resolve(root,arg('--out')||'build/relay-layout-browser');
const chromePath=process.env.ATLAS_BROWSER_PATH||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const VIEWPORTS=[{width:1440,height:900},{width:1024,height:768},{width:820,height:1180},{width:390,height:844}];
const EXPECTED_LAYOUT={1440:'split',1024:'split',820:'stack',390:'stack'};
const ROUTES={embedded:'?page=outlook&center=relay',standalone:'?page=relay'};
const delay=ms=>new Promise(done=>setTimeout(done,ms));
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const SOURCES=['dist/relay-room.js','dist/relay-room.css','dist/site-after-shell.css','dist/relay-topics.js','dist/data/relay/index.json'];
const identity=async()=>Object.fromEntries(await Promise.all(SOURCES.map(async path=>[path,sha(await readFile(resolve(root,path)))])));

class Cdp{
  constructor(ws){this.ws=ws;this.id=0;this.pending=new Map();this.errors=[];this.handlers=new Set();ws.addEventListener('message',event=>{
    const message=JSON.parse(String(event.data));
    if(message.method==='Runtime.exceptionThrown')this.errors.push(message.params.exceptionDetails?.exception?.description||message.params.exceptionDetails?.text);
    if(message.method)for(const handler of this.handlers)handler(message);
    const call=this.pending.get(message.id);if(!call)return;this.pending.delete(message.id);clearTimeout(call.timer);
    message.error?call.reject(new Error(message.error.message)):call.resolve(message.result||{});
  });}
  static async connect(url){const ws=new WebSocket(url);await new Promise((done,reject)=>{const timer=setTimeout(()=>reject(new Error('CDP connection timeout')),15000);ws.addEventListener('open',()=>{clearTimeout(timer);done();},{once:true});ws.addEventListener('error',()=>{clearTimeout(timer);reject(new Error('CDP connection failed'));},{once:true});});return new Cdp(ws);}
  send(method,params={}){const id=++this.id;return new Promise((resolve,reject)=>{const timer=setTimeout(()=>{this.pending.delete(id);reject(new Error('CDP timeout: '+method));},30000);this.pending.set(id,{resolve,reject,timer});this.ws.send(JSON.stringify({id,method,params}));});}
  close(){this.ws.close();for(const call of this.pending.values()){clearTimeout(call.timer);call.reject(new Error('CDP closed'));}this.pending.clear();}
}

const MIME={'.html':'text/html;charset=utf-8','.js':'text/javascript','.mjs':'text/javascript','.json':'application/json','.css':'text/css','.svg':'image/svg+xml','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.webp':'image/webp','.woff2':'font/woff2','.webmanifest':'application/manifest+json'};
function serve(){
  const server=createServer(async(request,response)=>{
    try{
      const path=decodeURIComponent(new URL(request.url,'http://local').pathname);
      let file=resolve(dist,'.'+path);if(file!==dist&&!file.startsWith(dist+sep))throw Error('outside dist');
      if(path.endsWith('/'))file=resolve(file,'index.html');
      const body=await readFile(file);response.writeHead(200,{'content-type':MIME[extname(file)]||'application/octet-stream','cache-control':'no-store'});response.end(body);
    }catch{response.writeHead(404,{'content-type':'text/plain'});response.end('not found');}
  });
  return new Promise((done,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',()=>done(server));});
}

// Runs in the page. Finds the relay document (the visible center frame, else the page itself)
// and measures geometry, scroll owners, URL and focus without changing anything.
function snapshot(){
  const frame=document.querySelector('.atlas-center-frame:not([hidden])');
  const doc=frame?.contentDocument||document,win=doc.defaultView,relay=doc.querySelector('.relay-room');
  if(!relay)return null;
  const offset=frame?frame.getBoundingClientRect():{x:0,y:0};
  const box=el=>{if(!el)return null;const r=el.getBoundingClientRect(),s=win.getComputedStyle(el);const shown=r.width>0&&r.height>0&&s.display!=='none'&&s.visibility==='visible';return {x:Math.round(r.x+offset.x),y:Math.round(r.y+offset.y),width:Math.round(r.width),height:Math.round(r.height),shown};};
  const q=selector=>relay.querySelector(selector);
  const scrollers=[['top document',document.scrollingElement],['relay document',frame?doc.scrollingElement:null],['.relay-rooms',q('.relay-rooms')],['.relay-room-list',q('.relay-room-list')],['.relay-detail-body',q('.relay-detail-body')]]
    .filter(([,el])=>el).map(([name,el])=>{const s=win.getComputedStyle(el);return {name,overflowY:el===document.scrollingElement||el===doc.scrollingElement?'document':s.overflowY,scrollHeight:el.scrollHeight,clientHeight:el.clientHeight,scrollTop:Math.round(el.scrollTop),scrolls:el.scrollHeight>el.clientHeight+1&&(el===document.scrollingElement||el===doc.scrollingElement||/auto|scroll/.test(s.overflowY))};});
  const active=doc.activeElement,activeOutline=active?win.getComputedStyle(active):null;
  const panes=q('.relay-panes'),rows=[...relay.querySelectorAll('.relay-room-item')];
  const body=q('.relay-detail-body');
  return {
    url:location.search,frameUrl:frame?doc.location.search:null,center:document.body.dataset.centerTool||null,
    centerStatus:frame?.dataset.centerStatus||null,
    viewport:{width:innerWidth,height:innerHeight},
    state:relay.dataset.relayState,pane:relay.dataset.relayPane||null,mode:relay.dataset.relayMode||null,
    layout:panes?win.getComputedStyle(panes).getPropertyValue('--relay-layout').trim():null,
    relay:box(relay),list:box(q('.relay-rooms')),room:box(q('.relay-detail')),backdrop:box(q('.relay-backdrop')),
    column:box(q('.relay-chat')||q('.relay-feed')||q('.relay-reader')||q('.relay-paper')),
    search:box(q('[name="query"]')),refresh:box(q('.relay-refresh')),roomBack:box(q('[data-relay-action="room-back"]')),
    rows:rows.map(row=>({room:row.dataset.room,current:row.getAttribute('aria-current')==='true',tabindex:row.getAttribute('tabindex'),...box(row),time:row.querySelector('time')?.getAttribute('datetime')||null,timeText:row.querySelector('time')?.textContent||null,sub:row.querySelector('.relay-room-sub')?.textContent||''})),
    roomTitle:q('.relay-detail-head h2')?.textContent||null,roomSub:q('.relay-peer-sub')?.textContent||null,
    messages:relay.querySelectorAll('[data-message-id]').length,articles:relay.querySelectorAll('[data-article]').length,
    atLatest:body?Math.abs(body.scrollHeight-body.clientHeight-body.scrollTop)<=2:null,
    statuses:[...relay.querySelectorAll('[role="status"]')].length,
    visibleStatuses:[...relay.querySelectorAll('[role="status"]')].filter(el=>el.checkVisibility()).length,
    visibleReload:[...relay.querySelectorAll('[data-relay-action="reload"]')].filter(el=>el.checkVisibility()).map(el=>el.className),
    imagesInList:relay.querySelectorAll('.relay-rooms img').length,
    smallTargets:[...relay.querySelectorAll('button,a[href]:not(.relay-msg-inline-link):not(.relay-reader-link),input,select,summary')].filter(el=>el.checkVisibility()).map(el=>[el,el.getBoundingClientRect()]).filter(([,r])=>r.width>0&&(r.width<44||r.height<44)).map(([el,r])=>`${el.tagName.toLowerCase()}.${el.className||el.getAttribute('aria-label')||''} ${Math.round(r.width)}x${Math.round(r.height)}`).slice(0,12),
    overflowX:{top:Math.max(0,document.documentElement.scrollWidth-innerWidth),relay:Math.max(0,doc.documentElement.scrollWidth-win.innerWidth)},
    focus:active&&active!==doc.body?{tag:active.tagName,room:active.dataset?.room||null,action:active.dataset?.relayAction||null,className:typeof active.className==='string'?active.className:'',outline:`${activeOutline.outlineStyle} ${activeOutline.outlineWidth}`}:null,
    scrollers,
  };
}

let server,profile,chrome,browser,cdp,stderr='';
const report={kind:'relay-telegram-layout',startedAt:new Date().toISOString(),sourceBefore:await identity(),viewports:VIEWPORTS,cases:[],failures:[]};
async function evaluate(fn,...args){const result=await cdp.send('Runtime.evaluate',{expression:`(${fn.toString()})(${args.map(value=>JSON.stringify(value)).join(',')})`,awaitPromise:true,returnByValue:true});if(result.exceptionDetails)throw Error(JSON.stringify(result.exceptionDetails).slice(0,600));return result.result.value;}
async function until(label,predicate,timeout=30000){const end=Date.now()+timeout;let last;while(Date.now()<end){last=await evaluate(snapshot).catch(()=>null);if(last&&predicate(last))return last;await delay(80);}throw Error(`${label} timed out; last ${JSON.stringify(last)?.slice(0,700)}`);}
const settle=()=>evaluate(async()=>{const frame=document.querySelector('.atlas-center-frame:not([hidden])'),doc=frame?.contentDocument||document;await doc.fonts?.ready;await document.fonts?.ready;await new Promise(done=>requestAnimationFrame(()=>requestAnimationFrame(done)));});
async function point(selector){return evaluate(sel=>{const frame=document.querySelector('.atlas-center-frame:not([hidden])'),doc=frame?.contentDocument||document,el=doc.querySelector(sel);if(!el)throw Error('missing '+sel);el.scrollIntoView({block:'nearest'});const r=el.getBoundingClientRect(),f=frame?frame.getBoundingClientRect():{x:0,y:0};return {x:Math.round(r.x+r.width/2+f.x),y:Math.round(r.y+r.height/2+f.y)};},selector);}
async function click(selector){const at=await point(selector);for(const type of ['mouseMoved','mousePressed','mouseReleased'])await cdp.send('Input.dispatchMouseEvent',{type,...at,button:'left',clickCount:type==='mouseMoved'?0:1});}
const KEYS={ArrowDown:40,ArrowUp:38,Home:36,End:35,Enter:13,Escape:27,Tab:9};
async function key(name){await cdp.send('Input.dispatchKeyEvent',{type:'keyDown',key:name,code:name,windowsVirtualKeyCode:KEYS[name],...(name==='Enter'?{text:'\r',unmodifiedText:'\r'}:{})});await cdp.send('Input.dispatchKeyEvent',{type:'keyUp',key:name,code:name,windowsVirtualKeyCode:KEYS[name]});}
async function historyBack(){const {currentIndex,entries}=await cdp.send('Page.getNavigationHistory');if(currentIndex<1)throw Error('no history entry to go back to');await cdp.send('Page.navigateToHistoryEntry',{entryId:entries[currentIndex-1].id});}
async function shot(name){const bytes=Buffer.from((await cdp.send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false})).data,'base64');await writeFile(resolve(out,name),bytes);return {file:name,bytes:bytes.length,sha256:sha(bytes)};}
const ready=s=>s.state==='ready'&&(!s.centerStatus||s.centerStatus==='ready');

async function openTarget(viewport){
  const context=(await browser.send('Target.createBrowserContext')).browserContextId;
  const {targetId}=await browser.send('Target.createTarget',{url:'about:blank',browserContextId:context});
  const targets=await(await fetch(`http://127.0.0.1:${browser.port}/json/list`)).json();
  cdp=await Cdp.connect(targets.find(target=>target.id===targetId).webSocketDebuggerUrl);
  await cdp.send('Page.enable');await cdp.send('Runtime.enable');await cdp.send('Network.enable');await cdp.send('Network.setCacheDisabled',{cacheDisabled:true});
  const envelope=await verifyHeadlessWindowEnvelope(cdp,viewport);
  await cdp.send('Emulation.setDeviceMetricsOverride',{...viewport,deviceScaleFactor:1,mobile:false});
  return {context,envelope};
}
async function closeTarget(context){cdp?.close();cdp=null;if(context)await browser.send('Target.disposeBrowserContext',{browserContextId:context}).catch(()=>{});}

function check(row,condition,message){if(!condition)row.failures.push(message);}
function geometry(row,s,label){
  check(row,s.overflowX.top===0&&s.overflowX.relay===0,`${label}: horizontal overflow ${JSON.stringify(s.overflowX)}`);
  check(row,!s.scrollers.find(item=>item.name==='top document')?.scrolls,`${label}: the page itself scrolls`);
  check(row,!s.scrollers.find(item=>item.name==='relay document')?.scrolls,`${label}: the relay document scrolls`);
  check(row,s.imagesInList===0,`${label}: the room list contains images`);
  check(row,s.statuses===1,`${label}: ${s.statuses} status regions`);
  check(row,s.smallTargets.length===0,`${label}: targets under 44px ${s.smallTargets.join(', ')}`);
}

async function layoutCase(route,viewport){
  const row={route,viewport,failures:[],steps:{}};report.cases.push(row);let context;
  try{
    ({context}=await openTarget(viewport).then(result=>{row.window=result.envelope;return result;}));
    const expected=EXPECTED_LAYOUT[viewport.width],name=`${route}-${viewport.width}x${viewport.height}`;
    await cdp.send('Page.navigate',{url:base+ROUTES[route]});
    let s=await until('ready',ready);await settle();s=await evaluate(snapshot);
    row.steps.list={...s,screenshot:await shot(`${name}-1-list.png`)};
    if(route==='embedded')check(row,s.layout===expected,`layout ${s.layout}, expected ${expected} (relay box ${s.relay.width}px)`);
    geometry(row,s,'list');
    check(row,s.pane==='list'&&!/[?&]room=/.test(s.url),'first load is not the list address');
    check(row,s.list.shown&&s.refresh.shown&&s.search.shown,'list, refresh or search hidden on first load');
    check(row,s.visibleReload.length===1,`visible reload controls ${s.visibleReload.length}`);
    if(s.layout==='split'){
      check(row,s.room.shown&&s.list.x+s.list.width<=s.room.x+1,'split panes overlap or room hidden');
      check(row,s.list.width>=320&&s.list.width<=361,`split list width ${s.list.width}`);
      check(row,s.column&&s.column.width<=696,`chat column ${s.column?.width}`);
      check(row,s.rows.find(item=>item.room==='telegram')?.current,'default room not marked current');
      check(row,s.atLatest===true,'default chat not scrolled to the latest message');
    }else{
      check(row,!s.room.shown,'stacked list shows the room pane');
      check(row,s.relay.width<600?Math.abs(s.list.width-s.relay.width)<=1:(s.list.width===360&&s.backdrop.shown),`stacked list width ${s.list.width} in a ${s.relay.width}px box`);
    }
    await click('[data-room="naver"]');
    s=await until('room open',v=>/[?&]room=naver/.test(v.url)&&v.roomTitle==='인생의 방');await settle();s=await evaluate(snapshot);
    row.steps.room={...s,screenshot:await shot(`${name}-2-room.png`)};
    geometry(row,s,'room');
    check(row,s.pane==='room'&&s.articles===8,`room pane ${s.pane}, ${s.articles} articles`);
    check(row,s.atLatest===true,'post stream not scrolled to the newest post');
    if(s.layout==='split'){
      check(row,s.list.shown&&s.room.shown,'split room hides the list');
      check(row,s.focus?.room==='naver','split: focus left the opened row');
    }else{
      check(row,!s.list.shown&&s.room.shown&&Math.abs(s.room.width-s.relay.width)<=1&&Math.abs(s.room.height-s.relay.height)<=1,`stacked room does not fill the relay box ${JSON.stringify([s.room,s.relay])}`);
      check(row,s.roomBack.shown,'stacked room has no back button');
      check(row,s.focus?.className.includes('relay-detail-body'),'stacked: focus not in the room content');
    }
    if(route==='embedded')check(row,s.center==='relay'&&/center=relay/.test(s.url),'center=relay lost');
    await historyBack();
    s=await until('back',v=>!/[?&]room=/.test(v.url)&&v.pane==='list');await settle();await delay(120);s=await evaluate(snapshot);
    row.steps.back={...s,screenshot:await shot(`${name}-3-back.png`)};
    geometry(row,s,'back');
    if(s.layout==='stack')check(row,s.list.shown&&!s.room.shown&&s.focus?.room==='naver','stacked Back did not return to the list with focus on the row');
    else check(row,s.room.shown&&s.rows.find(item=>item.room==='telegram')?.current&&s.roomTitle==='소수의견(26년 4분기)','split Back did not restore the default room');
    if(route==='embedded'){
      await cdp.send('Page.navigate',{url:base+ROUTES.embedded+'&room=hankyung'});
      s=await until('deep link',v=>ready(v)&&v.roomTitle==='모바일한경');await settle();s=await evaluate(snapshot);
      row.steps.deepLink={url:s.url,pane:s.pane,roomTitle:s.roomTitle,room:s.room,list:s.list,screenshot:await shot(`${name}-4-deep-link.png`)};
      check(row,s.pane==='room'&&s.room.shown,'deep link did not open the room');
      if(s.layout==='stack'){
        await click('[data-relay-action="room-back"]');
        s=await until('in-app back',v=>v.pane==='list'&&!/[?&]room=/.test(v.url));
        row.steps.inAppBack={url:s.url,pane:s.pane,listShown:s.list.shown,focus:s.focus};
        check(row,s.list.shown&&s.focus?.room==='hankyung','in-app back did not return to the list');
      }
      await keyboardCase(row,s.layout);
    }
  }catch(error){row.failures.push(String(error.stack||error));try{row.lastState=await evaluate(snapshot);await shot(`failure-${route}-${viewport.width}.png`);}catch{}}
  finally{row.failures.push(...(cdp?.errors||[]).map(error=>'page error: '+error));await closeTarget(context);}
  row.status=row.failures.length?'failed':'passed';report.failures.push(...row.failures.map(failure=>`${route} ${viewport.width}: ${failure}`));
  console.log(JSON.stringify({route,width:viewport.width,status:row.status,failures:row.failures}));
}

async function keyboardCase(row,layout){
  await cdp.send('Page.navigate',{url:base+ROUTES.embedded});await until('keyboard ready',ready);await settle();
  await click('[name="query"]');
  const steps=[];let s;
  for(let i=0;i<8;i++){await key('Tab');s=await evaluate(snapshot);if(s.focus?.room)break;}
  steps.push({entered:s.focus});check(row,s.focus?.room==='telegram','Tab did not reach the current room row');
  await key('ArrowDown');s=await evaluate(snapshot);steps.push({arrowDown:s.focus,url:s.url});
  check(row,s.focus?.room==='naver'&&!/[?&]room=/.test(s.url),'ArrowDown did not move focus without opening');
  check(row,/solid 2px/.test(s.focus?.outline||''),`row focus ring ${s.focus?.outline}`);
  await key('End');s=await evaluate(snapshot);check(row,s.focus?.room==='hankyung','End did not reach the last row');
  await key('Home');s=await evaluate(snapshot);check(row,s.focus?.room==='telegram','Home did not reach the first row');
  await key('ArrowDown');await key('Enter');
  s=await until('Enter opens',v=>/[?&]room=naver/.test(v.url));await settle();s=await evaluate(snapshot);steps.push({enter:s.focus,url:s.url,pane:s.pane});
  check(row,layout==='stack'?s.focus?.className.includes('relay-detail-body'):s.focus?.room==='naver',`Enter focus ${JSON.stringify(s.focus)}`);
  if(layout==='split')await click('.relay-detail-body');
  await key('Escape');await delay(150);s=await evaluate(snapshot);steps.push({escape:s.focus,url:s.url,pane:s.pane});
  if(layout==='stack')check(row,s.pane==='list'&&!/[?&]room=/.test(s.url)&&s.focus?.room==='naver','Esc did not return to the list');
  else check(row,s.focus?.room==='naver'&&/[?&]room=naver/.test(s.url),'Esc in the split room did not return focus to the row');
  row.steps.keyboard=steps;
}

// Loading, error, empty and ready states of the embedded relay, with the data request held or failed.
async function stateCase(viewport){
  const row={route:'embedded-states',viewport,failures:[],steps:{}};report.cases.push(row);let context,requests=0,held=null;
  const name=`states-${viewport.width}x${viewport.height}`;
  try{
    ({context}=await openTarget(viewport));
    await cdp.send('Fetch.enable',{patterns:[{urlPattern:'*data/relay/index.json*'}]});
    cdp.handlers.add(async message=>{
      if(message.method!=='Fetch.requestPaused')return;const id=message.params.requestId;requests+=1;
      try{
        if(requests===1)await cdp.send('Fetch.fulfillRequest',{requestId:id,responseCode:503,body:Buffer.from('unavailable fixture').toString('base64')});
        else if(requests===2)held=id;
        else await cdp.send('Fetch.continueRequest',{requestId:id});
      }catch(error){row.failures.push(String(error));}
    });
    await cdp.send('Page.navigate',{url:base+ROUTES.embedded});
    let s=await until('error',v=>v.state==='error');await settle();s=await evaluate(snapshot);
    row.steps.error={...s,screenshot:await shot(`${name}-error.png`)};
    check(row,s.visibleStatuses===1&&s.visibleReload.length===1&&s.visibleReload[0].includes('relay-retry'),'error state status/retry');
    await click('.relay-retry');
    s=await until('loading',v=>v.state==='loading'&&held!==null);
    row.steps.loading={...s,screenshot:await shot(`${name}-loading.png`)};
    check(row,s.visibleStatuses===1&&s.visibleReload.length===0,'loading state status/retry');
    await cdp.send('Fetch.fulfillRequest',{requestId:held,responseCode:200,responseHeaders:[{name:'content-type',value:'application/json'}],body:Buffer.from('{"rooms":[]}').toString('base64')});
    s=await until('empty',v=>v.state==='empty');await settle();s=await evaluate(snapshot);
    row.steps.empty={...s,screenshot:await shot(`${name}-empty.png`)};
    check(row,s.visibleStatuses===1&&s.visibleReload.length===1,'empty state status/retry');
    await click('.relay-retry');
    s=await until('populated',v=>v.state==='ready');await settle();s=await evaluate(snapshot);
    row.steps.populated={...s,screenshot:await shot(`${name}-populated.png`)};
    check(row,s.visibleStatuses===1&&s.visibleReload.length===1&&s.visibleReload[0].includes('relay-refresh')&&s.messages===60,'populated state status/refresh/messages');
    for(const [label,state] of Object.entries(row.steps))check(row,state.overflowX.top===0&&state.overflowX.relay===0,`${label}: horizontal overflow`);
  }catch(error){row.failures.push(String(error.stack||error));try{row.lastState=await evaluate(snapshot);await shot(`failure-states-${viewport.width}.png`);}catch{}}
  finally{row.failures.push(...(cdp?.errors||[]).map(error=>'page error: '+error));await closeTarget(context);}
  row.status=row.failures.length?'failed':'passed';report.failures.push(...row.failures.map(failure=>`states ${viewport.width}: ${failure}`));
  console.log(JSON.stringify({route:'states',width:viewport.width,status:row.status,failures:row.failures}));
}

let base;
try{
  await mkdir(out,{recursive:true});
  server=await serve();base=`http://127.0.0.1:${server.address().port}/`;
  profile=await mkdtemp(resolve(tmpdir(),'atlas-relay-layout-'));
  chrome=spawn(chromePath,['--headless=new','--disable-gpu','--disable-dev-shm-usage','--disable-background-networking','--no-first-run','--hide-scrollbars',headlessWindowArgument,'--remote-debugging-port=0',`--user-data-dir=${profile}`,'about:blank'],{stdio:['ignore','ignore','pipe']});
  chrome.stderr.on('data',bytes=>{stderr=(stderr+bytes).slice(-4000);});
  report.chromePid=chrome.pid;
  let port;for(let i=0;i<150&&!port;i++){try{port=(await readFile(resolve(profile,'DevToolsActivePort'),'utf8')).trim().split('\n');}catch{await delay(100);}}
  if(!port)throw Error('Chrome did not start: '+stderr);
  browser=await Cdp.connect(`ws://127.0.0.1:${port[0]}${port[1]}`);browser.port=port[0];
  report.browser=await browser.send('Browser.getVersion');
  for(const viewport of VIEWPORTS)for(const route of Object.keys(ROUTES))await layoutCase(route,viewport);
  for(const viewport of VIEWPORTS)await stateCase(viewport);
}catch(error){report.failures.push(String(error.stack||error));}
finally{
  cdp?.close();browser?.close();if(chrome&&chrome.exitCode===null)chrome.kill('SIGTERM');server?.close();
  if(profile)await rm(profile,{recursive:true,force:true}).catch(()=>{});
  report.sourceAfter=await identity();report.sourceStable=JSON.stringify(report.sourceAfter)===JSON.stringify(report.sourceBefore);
  if(!report.sourceStable)report.failures.push('relay sources changed during the run');
  report.complete=report.cases.length===VIEWPORTS.length*(Object.keys(ROUTES).length+1);
  report.status=report.complete&&!report.failures.length?'passed':'failed';report.finishedAt=new Date().toISOString();
  await writeFile(resolve(out,'report.json'),JSON.stringify(report,null,2)+'\n');
  console.log(JSON.stringify({status:report.status,complete:report.complete,cases:report.cases.length,failures:report.failures.length,out}));
  if(report.status!=='passed')process.exitCode=1;
}
