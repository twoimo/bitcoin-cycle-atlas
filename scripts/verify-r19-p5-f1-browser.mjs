#!/usr/bin/env node
// F1 only: native body-text D-1 evidence and six product screenshots. No media gate.
import {spawn, execFileSync} from 'node:child_process';
import {createServer} from 'node:http';
import {createHash} from 'node:crypto';
import {mkdtemp, readFile, writeFile, mkdir, rm, realpath, stat} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {extname, resolve, sep} from 'node:path';
import {fileURLToPath} from 'node:url';
import {headlessWindowArgument, verifyHeadlessWindowEnvelope} from './headless-browser-window.mjs';

const root=fileURLToPath(new URL('..',import.meta.url)), site=resolve(root,'dist'), prefix='/bitcoin-cycle-atlas/';
const args=process.argv.slice(2), option=(name,fallback)=>args.includes(name)?args[args.indexOf(name)+1]:fallback;
const out=resolve(root,option('--out','build/r19-p5-f1-browser'));
const git=(...args)=>execFileSync('git',args,{cwd:root,encoding:'utf8',maxBuffer:64*1024*1024}).trim();
const baselineArg=option('--baseline-ref',null), baseline=baselineArg?git('rev-parse','--verify',baselineArg+'^{commit}'):null;
const bin=process.env.ATLAS_BROWSER_PATH||(process.platform==='darwin'?'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome':'/usr/bin/chromium');
const sha=bytes=>createHash('sha256').update(bytes).digest('hex'), delay=ms=>new Promise(done=>setTimeout(done,ms));
const specs=['conference','outlook','relay'].flatMap(page=>[320,1440].map(width=>({id:`${page}-${width}`,page,width,height:900})));
const contentExclusions=[
  '.conference-caption-text','.conference-transcript-text','.relay-room-name','.relay-room-sub',
  '.relay-peer>h2','.relay-peer-sub','.relay-msg-text','.relay-msg-quote','.relay-reply-text',
  '.relay-reply-name','.relay-msg-author','.relay-preview','.relay-article-title','.relay-article-excerpt',
  '.relay-reader-head h2','.relay-body','.relay-reader-figure figcaption','#lab-chart-stage>svg',
];
const sourcePaths=['dist/index.html','dist/atlas-shell.js','dist/atlas-shell.css','dist/styles.css',
  'dist/ui/shell-layout.css','dist/site-before-shell.css','dist/site-after-shell.css'];
async function identity(){return {commit:git('rev-parse','HEAD'),tree:git('rev-parse','HEAD^{tree}'),
  trackedChanges:git('status','--porcelain','--untracked-files=no'),
  hashes:Object.fromEntries(await Promise.all(sourcePaths.map(async path=>[path,sha(await readFile(resolve(root,path)))])))};}
class Cdp {
  constructor(ws){this.ws=ws;this.id=0;this.pending=new Map();this.errors=[];ws.addEventListener('message',event=>{
    const message=JSON.parse(String(event.data));
    if(message.method==='Runtime.exceptionThrown')this.errors.push(message.params.exceptionDetails?.exception?.description||message.params.exceptionDetails?.text);
    const call=this.pending.get(message.id);if(!call)return;this.pending.delete(message.id);clearTimeout(call.timer);
    message.error?call.reject(new Error(message.error.message)):call.resolve(message.result||{});
  });}
  static async connect(url){const ws=new WebSocket(url);await new Promise((done,reject)=>{
    const timer=setTimeout(()=>reject(new Error('CDP connection timeout')),15000);
    ws.addEventListener('open',()=>{clearTimeout(timer);done();},{once:true});
    ws.addEventListener('error',()=>{clearTimeout(timer);reject(new Error('CDP connection failed'));},{once:true});
  });return new Cdp(ws);}
  send(method,params={}){const id=++this.id;return new Promise((resolve,reject)=>{
    const timer=setTimeout(()=>{this.pending.delete(id);reject(new Error('CDP timeout: '+method));},30000);
    this.pending.set(id,{resolve,reject,timer});this.ws.send(JSON.stringify({id,method,params}));
  });}
  close(){this.ws.close();for(const call of this.pending.values()){clearTimeout(call.timer);call.reject(new Error('CDP closed'));}this.pending.clear();}
}
async function evaluate(cdp,fn,...args){const value=await cdp.send('Runtime.evaluate',{
  expression:`(${fn.toString()})(${args.map(arg=>JSON.stringify(arg)).join(',')})`,awaitPromise:true,returnByValue:true,
});if(value.exceptionDetails)throw new Error(JSON.stringify(value.exceptionDetails));return value.result.value;}
async function until(fn,label){const deadline=Date.now()+45000;while(Date.now()<deadline){
  try{const value=await fn();if(value)return value;}catch(error){if(!/Execution context was destroyed|Cannot find context/.test(error.message))throw error;}
  await delay(100);
}throw new Error('Timed out: '+label);}
function inspect(exclusions){
  const pattern=/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/gu, matches=[],excluded=[];
  const path=node=>{const parts=[];for(let el=node;el&&el!==document.body;el=el.parentElement){
    parts.unshift(el.tagName.toLowerCase()+(el.id?'#'+el.id:el.classList.length?'.'+[...el.classList].join('.'):''));
  }return 'body > '+parts.join(' > ');};
  const walker=document.createTreeWalker(document.body,NodeFilter.SHOW_TEXT);
  for(let node=walker.nextNode();node;node=walker.nextNode()){
    const owner=node.parentElement;if(!owner||owner.closest('script,style,template,noscript'))continue;
    const found=[...node.data.matchAll(pattern)];if(!found.length)continue;
    const content=exclusions.find(selector=>owner.closest(selector));
    for(const match of found)(content?excluded:matches).push({glyph:match[0],codePoint:'U+'+match[0].codePointAt(0).toString(16).toUpperCase(),path:path(owner),...(content?{contentSelector:content}:{})});
  }
  const menus=[...document.querySelectorAll('.atlas-sidebar-toggle')].map(button=>{
    const svg=button.querySelector('svg'),css=getComputedStyle(button),box=button.getBoundingClientRect();
    const painted=button.checkVisibility({checkOpacity:true,checkVisibilityCSS:true})&&box.width>0&&box.height>0;
    return {name:button.getAttribute('aria-label'),expanded:button.getAttribute('aria-expanded'),text:button.textContent,
      svg:svg?{icon:svg.getAttribute('data-icon'),viewBox:svg.getAttribute('viewBox'),hidden:svg.getAttribute('aria-hidden'),focusable:svg.getAttribute('focusable'),pathCount:svg.querySelectorAll('path').length}:null,
      painted,box:{width:box.width,height:box.height},css:{width:css.width,height:css.height,minWidth:css.minWidth,minHeight:css.minHeight},
      renderedTargetVerified:painted?box.width>=44&&box.height>=44:false,
      focusPaintVerified:false,focusNote:'Focus paint is not measured for the pre-existing hidden header toggle.'};
  });
  const focusRules=[];const visit=rules=>{for(const rule of rules){if(rule.cssRules)visit(rule.cssRules);
    if(rule.selectorText?.replace(/\s+/g,'').includes(':where(button,a,input,select,textarea,summary,[tabindex]):focus-visible'))focusRules.push({selector:rule.selectorText,outline:rule.style.outline,offset:rule.style.outlineOffset});}};
  for(const sheet of document.styleSheets)try{visit(sheet.cssRules);}catch{}
  return {boot:document.documentElement.dataset.boot,page:document.body.dataset.page,
    conferenceState:document.querySelector('.conference-player')?.dataset.state||null,
    relayRoomCount:document.querySelectorAll('.relay-rooms .relay-room-item').length,
    viewport:{width:innerWidth,height:innerHeight},h1Count:document.querySelectorAll('h1').length,
    overflow:Math.max(0,document.documentElement.scrollWidth-innerWidth,document.body.scrollWidth-innerWidth),
    d1:{count:matches.length,matches,excludedContentCount:excluded.length,excluded},menus,focusRules};
}

await mkdir(out,{recursive:true});
const report={kind:'r19-p5-f1-native-capture',startedAt:new Date().toISOString(),
  scope:'D-1, header SVG/name, declared target size, and product screenshots only; not a P4/P5 full gate.',
  d1:{range:'[\\u{1F300}-\\u{1FAFF}\\u{2600}-\\u{27BF}]',includesHiddenUI:true,contentExclusions},
  harnessSha256:sha(await readFile(fileURLToPath(import.meta.url))),sourceBefore:await identity(),lanes:[],failures:[]};
let chrome,browser,profile,stderr='',launchError,server,cdp;
try{
  profile=await mkdtemp(resolve(tmpdir(),'atlas-f1-'));
  const flags=['--headless=new','--disable-gpu','--disable-dev-shm-usage','--disable-background-networking','--no-first-run',headlessWindowArgument,'--remote-debugging-port=0',`--user-data-dir=${profile}`,'about:blank'];
  if(process.platform==='linux'&&process.getuid?.()===0)flags.unshift('--no-sandbox');
  chrome=spawn(bin,flags,{stdio:['ignore','ignore','pipe']});
  chrome.stderr.on('data',bytes=>{stderr=(stderr+bytes).slice(-6000);});chrome.once('error',error=>{launchError=error;});
  const port=await until(async()=>{if(launchError)throw launchError;
    try{return (await readFile(resolve(profile,'DevToolsActivePort'),'utf8')).trim().split('\n');}
    catch{if(chrome.exitCode!==null||chrome.signalCode)throw new Error(`Chrome exited (${chrome.exitCode??chrome.signalCode}): ${stderr}`);return null;}
  },'Chrome debugging port');
  browser=await Cdp.connect(`ws://127.0.0.1:${port[0]}${port[1]}`);report.browser=await browser.send('Browser.getVersion');
  for(const laneSpec of [...(baseline?[{name:'before',ref:baseline}]:[]),{name:'after',ref:null}]){
    const lane={...laneSpec,cases:[],servedFiles:{},sourceStable:null};report.lanes.push(lane);
    const cache=new Map();
    const load=async file=>lane.ref?(cache.has(file)?cache.get(file):cache.set(file,execFileSync('git',['show',`${lane.ref}:dist/${file}`],{cwd:root,maxBuffer:64*1024*1024,stdio:['ignore','pipe','pipe']})).get(file)):readFile(resolve(site,file));
    const mime={'.html':'text/html;charset=utf-8','.js':'text/javascript','.css':'text/css','.json':'application/json','.woff2':'font/woff2','.svg':'image/svg+xml','.png':'image/png'};
    server=createServer(async(req,res)=>{try{
      const url=new URL(req.url,'http://localhost'),pathname=decodeURIComponent(url.pathname);if(!pathname.startsWith(prefix))throw new Error('route');
      let file=pathname.slice(prefix.length);if(!file||file.endsWith('/'))file+='index.html';
      const full=resolve(site,file);if(!full.startsWith(site+sep))throw new Error('scope');
      if(!lane.ref){if((await stat(full)).isDirectory())file+='/index.html';if(!(await realpath(resolve(site,file))).startsWith(site+sep))throw new Error('scope');}
      const bytes=await load(file),hash=sha(bytes);if(lane.servedFiles[file]&&lane.servedFiles[file]!==hash)throw new Error('source changed during requests');
      lane.servedFiles[file]=hash;res.writeHead(200,{'content-type':mime[extname(file)]||'application/octet-stream','cache-control':'no-store'});res.end(bytes);
    }catch{res.writeHead(404);res.end('not found');}});
    await new Promise((done,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',done);});
    const base=`http://127.0.0.1:${server.address().port}${prefix}`;
    await mkdir(resolve(out,lane.name),{recursive:true});
    for(const spec of specs){
      const result={...spec,status:'failed',failures:[]};lane.cases.push(result);let contextId;
      try{
        ({browserContextId:contextId}=await browser.send('Target.createBrowserContext'));
        const {targetId}=await browser.send('Target.createTarget',{url:'about:blank',browserContextId:contextId});
        const targets=await (await fetch(`http://127.0.0.1:${port[0]}/json/list`)).json();
        cdp=await Cdp.connect(targets.find(target=>target.id===targetId).webSocketDebuggerUrl);
        await cdp.send('Page.enable');await cdp.send('Runtime.enable');
        result.nativeWindowEnvelope=await verifyHeadlessWindowEnvelope(cdp,{width:spec.width,height:spec.height});
        await cdp.send('Emulation.setDeviceMetricsOverride',{width:spec.width,height:spec.height,deviceScaleFactor:1,mobile:spec.width<=620});
        await cdp.send('Page.navigate',{url:base+`?page=${spec.page}`});
        await until(()=>evaluate(cdp,page=>{
          if(document.documentElement.dataset.boot==='error')throw new Error('product boot error');
          if(document.documentElement.dataset.boot!=='ready'||document.body.dataset.page!==page)return false;
          return page==='conference'?Boolean(document.querySelector('.conference-player[data-state="ready"]')):page==='relay'?Boolean(document.querySelector('.relay-rooms .relay-room-item')):Boolean(document.querySelector('#lab-chart path'));
        },spec.page),spec.id+' product ready');
        await evaluate(cdp,async()=>{await document.fonts.ready;await new Promise(done=>requestAnimationFrame(()=>requestAnimationFrame(done)));});
        result.state=await evaluate(cdp,inspect,contentExclusions);
        const png=Buffer.from((await cdp.send('Page.captureScreenshot',{format:'png',fromSurface:true,captureBeyondViewport:false})).data,'base64');
        if(png.length<24||png.subarray(0,8).toString('hex')!=='89504e470d0a1a0a'||png.readUInt32BE(16)!==spec.width||png.readUInt32BE(20)!==spec.height)throw new Error('Invalid PNG or capture dimensions');
        const screenshot={file:`${lane.name}/${spec.id}.png`,sha256:sha(png),bytes:png.length};
        await writeFile(resolve(out,screenshot.file),png);result.screenshot=screenshot;
        if(result.state.h1Count!==1)result.failures.push('h1 count must be 1');
        if(result.state.overflow!==0)result.failures.push('horizontal overflow must be 0');
        if(result.state.viewport.width!==spec.width||result.state.viewport.height!==spec.height)result.failures.push('viewport mismatch');
        if(!lane.ref){
          if(result.state.d1.count!==0)result.failures.push('D-1 UI glyph count must be 0');
          if(result.state.menus.length!==1)result.failures.push('expected one shared header menu button');
          for(const menu of result.state.menus){
            if(!/^(탐색 메뉴 펼치기|탐색 메뉴 접기)$/.test(menu.name)||menu.text.trim()||!menu.svg||menu.svg.icon!=='phosphor-list'||menu.svg.viewBox!=='0 0 256 256'||menu.svg.hidden!=='true'||menu.svg.focusable!=='false'||menu.svg.pathCount<1)result.failures.push('menu needs its existing accessible name and decorative Phosphor List SVG');
            if(['width','height','minWidth','minHeight'].some(key=>!Number.isFinite(parseFloat(menu.css[key]))||parseFloat(menu.css[key])<44))result.failures.push('menu CSS target floor below 44px or unmeasured');
            if(menu.painted&&!menu.renderedTargetVerified)result.failures.push('painted menu target below 44px');
          }
          if(!result.state.focusRules.some(rule=>/^2px solid /.test(rule.outline)))result.failures.push('shared 2px button focus rule missing');
        }
        result.failures.push(...cdp.errors.map(error=>'runtime: '+error));result.status=result.failures.length?'failed':'passed';
      }catch(error){result.failures.push(error.stack||String(error));}
      finally{cdp?.close();cdp=null;if(contextId)await browser.send('Target.disposeBrowserContext',{browserContextId:contextId}).catch(()=>{});}
      report.failures.push(...result.failures.map(message=>`${lane.name}/${spec.id}: ${message}`));
      console.log(JSON.stringify({lane:lane.name,id:spec.id,status:result.status,d1:result.state?.d1.count,screenshot:result.screenshot?.file}));
    }
    lane.sourceStable=lane.ref?true:(await Promise.all(Object.entries(lane.servedFiles).map(async([file,hash])=>sha(await readFile(resolve(site,file)))===hash))).every(Boolean);
    if(!lane.sourceStable)report.failures.push(lane.name+': served source changed');
    await new Promise(done=>server.close(done));server=null;
  }
}catch(error){report.failures.push('harness: '+(error.stack||String(error)));}
finally{
  cdp?.close();browser?.close();chrome?.kill('SIGKILL');if(server)await new Promise(done=>server.close(done));
  if(profile)await rm(profile,{recursive:true,force:true}).catch(()=>{});
  report.sourceAfter=await identity();report.workingTreeStable=JSON.stringify(report.sourceBefore)===JSON.stringify(report.sourceAfter);
  report.sourceStable=report.workingTreeStable&&report.lanes.length===(baseline?2:1)&&report.lanes.every(lane=>lane.sourceStable===true);
  const after=report.lanes.find(lane=>lane.name==='after');report.completedCases=after?.cases.filter(item=>item.state&&item.screenshot).length||0;
  report.complete=report.completedCases===specs.length;report.d1After=report.complete?after.cases.reduce((sum,item)=>sum+item.state.d1.count,0):null;
  const before=report.lanes.find(lane=>lane.name==='before');report.d1Before=before?.cases.length===specs.length&&before.cases.every(item=>item.state)?before.cases.reduce((sum,item)=>sum+item.state.d1.count,0):null;
  report.status=report.complete&&report.sourceStable&&report.failures.length===0?'passed':report.completedCases?'failed':'blocked';
  report.finishedAt=new Date().toISOString();report.chromeStderr=stderr;
  await writeFile(resolve(out,'report.json'),JSON.stringify(report,null,2)+'\n');
  console.log(JSON.stringify({status:report.status,complete:report.complete,completedCases:report.completedCases,d1Before:report.d1Before,d1After:report.d1After,sourceStable:report.sourceStable,failures:report.failures.length,out}));
  if(report.status!=='passed')process.exitCode=1;
}
