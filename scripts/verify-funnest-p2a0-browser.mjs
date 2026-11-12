#!/usr/bin/env node
// P2A0-6ffbdda: isolated package spike. No product state setter, DOM focus,
// scroll or style repair is allowed to stand in for actual native input.
import assert from 'node:assert/strict';
import {spawn, execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {constants} from 'node:fs';
import {access, mkdir, mkdtemp, readFile, readdir, realpath, rm, stat, writeFile} from 'node:fs/promises';
import {createServer} from 'node:http';
import {tmpdir} from 'node:os';
import {dirname, extname, resolve, sep} from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {gzipSync} from 'node:zlib';
import {headlessWindowArgument, verifyHeadlessWindowEnvelope} from './headless-browser-window.mjs';
import {createP1NetworkInterception} from './verify-ui-renewal-p1-browser.mjs';
import {readNativeInteractiveTarget} from './verify-workspace-browser.mjs';

const root=fileURLToPath(new URL('..',import.meta.url));
const sha256=bytes=>createHash('sha256').update(bytes).digest('hex');
const delay=ms=>new Promise(ok=>setTimeout(ok,ms));
export const p2a0Network=Object.freeze({offline:false,latency:165,downloadThroughput:1012500,uploadThroughput:168750,connectionType:'cellular4g'});
export const p2a0Budgets=Object.freeze({initialPaintedReadyMs:2500,pageTransitionMs:150,targetPx:44,focusRingPx:2,textContrast:4.5,iconContrast:3});
export const p2a0Viewports=Object.freeze([{width:390,height:844},{width:320,height:740},{width:768,height:1024},{width:1024,height:768},{width:1440,height:900},{width:1920,height:1080}].map(Object.freeze));
export const p2a0FeatureIds=Object.freeze(['candles','log','percent','indicator-ma','drawing-trendline','symbol-search','korean-colors']);
export const p2a0KeyboardWidths=Object.freeze([320,390,768,1440]);
export const p2a0TouchIds=Object.freeze([320,390].flatMap(width=>['pan','pinch'].map(gesture=>`${gesture}-${width}`)));

export function parseP2a0Arguments(argv,cwd=root){
  const result={out:null,site:resolve(cwd,'build/p2a0/site'),bin:process.env.CHROME_PATH||(process.platform==='darwin'?'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome':'/usr/bin/chromium')};
  for(let i=0;i<argv.length;i++){
    if(argv[i]==='--help'){result.help=true;continue;}
    if(!['--out','--site','--browser'].includes(argv[i])||!argv[i+1]||argv[i+1].startsWith('--'))throw new Error(`Unknown or incomplete argument: ${argv[i]}`);
    result[{'--out':'out','--site':'site','--browser':'bin'}[argv[i]]]=resolve(cwd,argv[++i]);
  }
  if(!result.help&&!result.out)throw new Error('--out NEW_DIRECTORY is required');
  if(result.out&&(result.out===result.site||result.out.startsWith(result.site+sep)))throw new Error('Evidence output must be outside the served site');
  return result;
}

/** Root directory is in scope before index rewriting; sibling paths and
 * symlinks are never in scope. Gzip is fixed at the unchanged A-9 level 9. */
export function createP2a0StaticServer(directory,requests=[]){
  const site=resolve(directory),within=path=>path===site||path.startsWith(site+sep);
  return createServer(async(req,res)=>{
    const receipt={url:req.url,method:req.method,status:null,bytes:null,encoding:null};requests.push(receipt);
    try{
      if(!['GET','HEAD'].includes(req.method))throw new Error('unsupported method');
      const path=decodeURIComponent(String(req.url||'/').split('?')[0]);
      if(!path.startsWith('/')||path.includes('\0')||path.includes('\\'))throw new Error('invalid path');
      let file=resolve(site,'.'+path);
      if(!within(file))throw new Error('outside site');
      if((await stat(file)).isDirectory())file=resolve(file,'index.html');
      file=await realpath(file);
      if(!within(file)||!(await stat(file)).isFile())throw new Error('outside site');
      const raw=await readFile(file),extension=extname(file),compress=/\bgzip\b/.test(req.headers['accept-encoding']||'')&&['.html','.js','.mjs','.json','.css','.svg','.txt'].includes(extension);
      const bytes=compress?gzipSync(raw,{level:9}):raw;
      receipt.status=200;receipt.bytes=bytes.length;receipt.encoding=compress?'gzip':'identity';receipt.sourceSha256=sha256(raw);
      const type={'.html':'text/html;charset=utf-8','.js':'text/javascript;charset=utf-8','.mjs':'text/javascript;charset=utf-8','.json':'application/json','.css':'text/css','.svg':'image/svg+xml','.txt':'text/plain;charset=utf-8','.woff2':'font/woff2'}[extension]||'application/octet-stream';
      res.writeHead(200,{'content-type':type,'content-length':bytes.length,'cache-control':'no-store','vary':'Accept-Encoding',...(compress?{'content-encoding':'gzip'}:{})});res.end(req.method==='HEAD'?undefined:bytes);
    }catch{receipt.status=404;receipt.bytes=9;res.writeHead(404,{'content-type':'text/plain;charset=utf-8','cache-control':'no-store'});res.end('not found');}
  });
}

export function p2a0FinalStatus(report){
  const groups={startup:p2a0Viewports.map(v=>`${v.width}x${v.height}`),features:[...p2a0FeatureIds],keyboard:p2a0KeyboardWidths.map(String),touch:[...p2a0TouchIds]};
  const counts={},coverage=Object.entries(groups).map(([group,expected])=>{
    const cases=report[group]||[];
    counts[group]={required:expected.length,attempted:cases.filter(c=>c.attempted===true).length,passed:cases.filter(c=>c.attempted===true&&c.status==='passed').length,failed:cases.filter(c=>c.status==='failed').length};
    return JSON.stringify(cases.map(c=>c.id).sort())===JSON.stringify(expected.slice().sort())&&cases.every(c=>c.attempted===true);
  });
  const complete=coverage.every(Boolean),qualifies=complete&&Object.values(counts).every(c=>c.passed===c.required)&&report.sourceStable===true&&Array.isArray(report.failures)&&report.failures.length===0;
  return {status:qualifies?'passed':Object.values(counts).some(c=>c.failed)?'failed':'unverified',qualifiesP2a0NativeVerification:qualifies,complete,counts};
}

export function validateP2a0Target(target,{keyboard=false,minimumSize=false}={}){
  const failures=[],b=target?.box,c=target?.clip;
  if(!b||!c||![b.left,b.right,b.top,b.bottom,b.width,b.height,c.left,c.right,c.top,c.bottom].every(Number.isFinite))return ['native geometry is missing or nonfinite'];
  if(!target.painted||target.disabled||!target.topmost)failures.push('native target is hidden, disabled or covered');
  if(b.width<=0||b.height<=0||b.left<c.left-.01||b.right>c.right+.01||b.top<c.top-.01||b.bottom>c.bottom+.01)failures.push('native target is clipped or empty');
  if(minimumSize&&(b.width<p2a0Budgets.targetPx||b.height<p2a0Budgets.targetPx))failures.push(`native target below 44px: ${b.width}x${b.height}`);
  if(keyboard&&(!target.inside||target.outline==='none'||!(target.outlineWidth>=p2a0Budgets.focusRingPx)))failures.push('native focus lacks an exposed 2px ring');
  return failures;
}

export function validateP2a0Ready(state,expected,{budget=true}={}){
  const failures=[],o=state?.observer,c=o?.chart,s=o?.source;
  if(o?.status!=='ready'||!Array.isArray(o.errors)||o.errors.length)failures.push('observer is not ready or reports errors');
  if(!s||s.sha256!==expected.sha256)failures.push('loaded BTC source digest differs from the served canonical bytes');
  if(c?.symbol!=='BTCUSD'||c?.resolution!=='1D'||c?.type!=='candles')failures.push('actual BTC daily candle chart is missing');
  const first=expected.times.indexOf(c?.firstTime),last=expected.times.indexOf(c?.lastTime);
  if(first<0||last<first||c?.barCount!==last-first+1||c.barCount<2)failures.push('loaded candle range/count is not a contiguous canonical data slice');
  if(expected.bars)for(const [name,index]of [['firstBar',first],['lastBar',last]]){
    const observed=c?.[name],canonical=expected.bars[index];
    if(!observed||!canonical||['time','open','high','low','close','volume'].some(key=>observed[key]!==canonical[key]))failures.push(`${name} OHLCV differs from canonical BTC source data`);
  }
  if(!state?.canvas?.visible||!(state.canvas.width>0)||!(state.canvas.height>0)||!(state.canvas.paintedPixels>0))failures.push('visible painted chart canvas is missing');
  if(state?.overflow!==0)failures.push(`horizontal overflow: ${state?.overflow}`);
  const ms=o?.metrics?.initialPaintedReadyMs;
  if(!Number.isFinite(ms)||ms<=0)failures.push('initial painted readiness was not measured');
  else if(budget&&ms>p2a0Budgets.initialPaintedReadyMs)failures.push(`initial painted readiness ${ms}ms exceeds 2500ms`);
  return failures;
}

class Cdp{
  constructor(ws){this.ws=ws;this.id=0;this.pending=new Map();this.listeners=new Map();ws.addEventListener('message',e=>{const m=JSON.parse(String(e.data));if(!m.id){this.listeners.get(m.method)?.(m.params||{});return;}const p=this.pending.get(m.id);if(!p)return;this.pending.delete(m.id);clearTimeout(p.timer);m.error?p.reject(new Error(m.error.message)):p.resolve(m.result||{});});}
  static async connect(url){const ws=new WebSocket(url);await new Promise((ok,no)=>{const timer=setTimeout(()=>no(new Error('CDP connection timeout')),15000);ws.addEventListener('open',()=>{clearTimeout(timer);ok();},{once:true});ws.addEventListener('error',()=>{clearTimeout(timer);no(new Error('CDP connection failed'));},{once:true});});return new Cdp(ws);}
  send(method,params={}){const id=++this.id;return new Promise((ok,no)=>{const timer=setTimeout(()=>{this.pending.delete(id);no(new Error(`CDP timeout: ${method}`));},30000);this.pending.set(id,{resolve:ok,reject:no,timer});this.ws.send(JSON.stringify({id,method,params}));});}
  close(){for(const p of this.pending.values()){clearTimeout(p.timer);p.reject(new Error('CDP closed'));}this.pending.clear();this.ws.close();}
}
async function evaluate(cdp,fn,...args){const r=await cdp.send('Runtime.evaluate',{expression:`(${fn.toString()})(${args.map(a=>JSON.stringify(a)).join(',')})`,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw new Error(`Browser evaluation: ${JSON.stringify(r.exceptionDetails).slice(0,1200)}`);return r.result.value;}
async function until(fn,label,timeout=45000){const end=Date.now()+timeout;while(Date.now()<end){try{const value=await fn();if(value)return value;}catch(e){if(!/Execution context was destroyed|Cannot find context with specified id/.test(e.message))throw e;}await delay(100);}throw new Error(`Timed out: ${label}`);}
async function painted(cdp){await evaluate(cdp,()=>new Promise(ok=>requestAnimationFrame(()=>requestAnimationFrame(ok))));}
const readObserver=()=>window.__atlasFunnestSpike?.read()||null;

/** Read-only canvas and source observer diagnostics. A mount constructor or
 * positive canvas box alone cannot pass: real candle data and pixels are needed. */
export function inspectP2a0Page(){
  const observer=window.__atlasFunnestSpike?.read()||null,host=document.querySelector('.fnc-chart-host'),canvas=host?.querySelector('canvas'),r=canvas?.getBoundingClientRect();
  let paintedPixels=0,error=null;
  const layout=observer?.chart?.layout,main=layout?.panes?.find(p=>p.kind==='main');let crop=null;
  if(canvas&&main&&layout.width>0&&layout.height>0)try{const sx=canvas.width/layout.width,sy=canvas.height/layout.height;crop={x:0,y:Math.ceil(main.top*sy),width:Math.floor(layout.plotWidth*sx),height:Math.floor(main.height*sy)};const ctx=canvas.getContext('2d'),data=ctx?.getImageData(crop.x,crop.y,crop.width,crop.height).data;if(data){const first=[data[0],data[1],data[2],data[3]];for(let i=0;i<data.length;i+=4)if(data[i+3]>0&&(data[i]!==first[0]||data[i+1]!==first[1]||data[i+2]!==first[2]||data[i+3]!==first[3]))paintedPixels++;}}catch(e){error=String(e.message);}
  return {observer,readyState:document.readyState,visibility:document.visibilityState,
    overflow:Math.max(0,document.documentElement.scrollWidth-innerWidth,document.body.scrollWidth-innerWidth),
    canvas:{visible:Boolean(canvas&&canvas.checkVisibility({checkOpacity:true,checkVisibilityCSS:true})&&r.width>0&&r.height>0),width:canvas?.width||0,height:canvas?.height||0,paintedPixels,crop,error,rect:r?{left:r.left,right:r.right,top:r.top,bottom:r.bottom,width:r.width,height:r.height}:null}};
}
async function ready(cdp,expected){await until(()=>evaluate(cdp,()=>['ready','error'].includes(window.__atlasFunnestSpike?.read()?.status)),'real BTC chart readiness');await painted(cdp);const state=await evaluate(cdp,inspectP2a0Page);assert.deepEqual(validateP2a0Ready(state,expected,{budget:false}),[]);return state;}
async function key(cdp,name,inputs,modifiers=0){const keys={Tab:['Tab',9],Enter:['Enter',13],Escape:['Escape',27],ArrowDown:['ArrowDown',40],ArrowUp:['ArrowUp',38],Backspace:['Backspace',8],a:['KeyA',65]};const [code,virtual]=keys[name]||[name,name.toUpperCase().charCodeAt(0)];inputs.push({kind:'native-key',key:name,modifiers});await cdp.send('Input.dispatchKeyEvent',{type:'rawKeyDown',key:name,code,windowsVirtualKeyCode:virtual,nativeVirtualKeyCode:virtual,modifiers});await cdp.send('Input.dispatchKeyEvent',{type:'keyUp',key:name,code,windowsVirtualKeyCode:virtual,nativeVirtualKeyCode:virtual,modifiers});await painted(cdp);}
async function pointer(cdp,selector,inputs){const target=await evaluate(cdp,readNativeInteractiveTarget,selector);assert.deepEqual(validateP2a0Target(target),[],`pointer ${selector}: ${JSON.stringify(target)}`);inputs.push({kind:'native-pointer',selector,target});await point(cdp,{x:target.x,y:target.y});await painted(cdp);return target;}
async function point(cdp,{x,y}){await cdp.send('Input.dispatchMouseEvent',{type:'mouseMoved',x,y});await cdp.send('Input.dispatchMouseEvent',{type:'mousePressed',button:'left',clickCount:1,x,y});await cdp.send('Input.dispatchMouseEvent',{type:'mouseReleased',button:'left',clickCount:1,x,y});}
async function tabTo(cdp,selector,inputs){for(let i=0;i<100;i++){if(await evaluate(cdp,s=>Boolean(document.querySelector(s)?.contains(document.activeElement)),selector))return evaluate(cdp,readNativeInteractiveTarget,selector,true);await key(cdp,'Tab',inputs);}throw new Error(`Native Tab did not reach ${selector}`);}
async function targetByText(cdp,selector,text){const target=await until(()=>evaluate(cdp,(selector,text)=>{const nodes=[...document.querySelectorAll(selector)];const node=nodes.find(n=>(n.textContent.trim()===text||n.textContent.trim().startsWith(text))&&n.checkVisibility({checkOpacity:true,checkVisibilityCSS:true}));if(!node)return null;const parent=node.parentElement;return `${selector}:nth-child(${[...parent.children].indexOf(node)+1})`;},selector,text),`visible ${text}`);return target;}

function colorEvidence(columnX=null){
  const root=document.querySelector('.fnc-root'),style=root&&getComputedStyle(root),observer=window.__atlasFunnestSpike.read(),settings=observer.chart.settings||{};
  const parse=color=>{if(/^#[0-9a-f]{6}$/i.test(color))return [1,3,5].map(i=>parseInt(color.slice(i,i+2),16));const n=String(color).match(/[\d.]+/g)?.map(Number);return n?.length>=3?n.slice(0,3):null;};
  const up=parse(settings.upColor||style?.getPropertyValue('--fnc-up').trim()),down=parse(settings.downColor||style?.getPropertyValue('--fnc-down').trim());
  const canvas=document.querySelector('.fnc-chart-host canvas'),layout=observer.chart.layout,main=layout?.panes.find(p=>p.kind==='main');
  const crop=canvas&&main?{x:0,y:Math.ceil(main.top*canvas.height/layout.height),width:Math.floor(layout.plotWidth*canvas.width/layout.width),height:Math.floor(main.height*canvas.height/layout.height)}:null;
  const data=crop?canvas.getContext('2d')?.getImageData(crop.x,crop.y,crop.width,crop.height).data:null;
  let upPixels=0,downPixels=0;if(data)for(let i=0;i<data.length;i+=4){if(data[i+3]<250)continue;if(up&&up.every((v,k)=>Math.abs(v-data[i+k])<=1))upPixels++;if(down&&down.every((v,k)=>Math.abs(v-data[i+k])<=1))downPixels++;}
  let column=null;if(crop&&Number.isFinite(columnX)){const x=Math.round(columnX*canvas.width/layout.width),pixels=canvas.getContext('2d').getImageData(x,crop.y,1,crop.height).data;let rise=0,fall=0;for(let i=0;i<pixels.length;i+=4){if(pixels[i+3]<250)continue;if(up?.every((v,k)=>Math.abs(v-pixels[i+k])<=1))rise++;if(down?.every((v,k)=>Math.abs(v-pixels[i+k])<=1))fall++;}column={x,upPixels:rise,downPixels:fall};}
  return {up,down,upPixels,downPixels,crop,column,type:observer.chart.type,indicators:observer.chart.indicators,drawings:observer.chart.drawings,
    legend:document.querySelector('.fnc-legend')?.textContent||'',ohlc:[...document.querySelectorAll('.fnc-legend-values span b')].slice(0,4).map(n=>({text:n.textContent,className:n.className,color:getComputedStyle(n).color})),
    interpretation:'Configured up/down candle colors plus actual price-pane pixels, excluding volume and axes; independent screenshot retained.'};
}

/** Conservative CSS contrast for actual focused controls. Unsupported paint
 * is unverified, never a passing contrast measurement. Existing P0 samples are
 * not replaced by these additional spike diagnostics. */
export function inspectP2a0Contrast(selector){
  const node=document.querySelector(selector),issues=[];
  const parse=s=>{const m=String(s).match(/^rgba?\(([^)]+)\)$/);if(!m)return null;const v=m[1].replace(/\//g,' ').split(/[\s,]+/).filter(Boolean).map(Number);return v.length>=3&&v.every(Number.isFinite)?[...v.slice(0,3),v[3]??1]:null;};
  const over=(f,b)=>[0,1,2].map(i=>f[i]*f[3]+b[i]*(1-f[3]));
  let background=[255,255,255];const ancestors=[];for(let n=node;n;n=n.parentElement)ancestors.push(n);
  for(const n of ancestors.reverse()){const s=getComputedStyle(n);if(s.backgroundImage!=='none'||Number(s.opacity)!==1||s.filter!=='none'||s.mixBlendMode!=='normal')issues.push('unsupported background/opacity/filter/blend paint');if(s.clipPath!=='none'||s.maskImage!=='none')issues.push('unsupported clip/mask paint');const c=parse(s.backgroundColor);if(!c)issues.push('unsupported background color');else background=over(c,background);}
  const luminance=rgb=>rgb.map(v=>v/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4).reduce((sum,v,i)=>sum+v*[.2126,.7152,.0722][i],0);
  const ratio=color=>{const c=parse(color);if(!c)return null;const a=luminance(over(c,background)),b=luminance(background);return (Math.max(a,b)+.05)/(Math.min(a,b)+.05);};
  const s=node&&getComputedStyle(node),svg=node?.querySelector('svg'),shape=svg?.querySelector('path,line,polyline,rect,circle'),shapeStyle=shape&&getComputedStyle(shape);
  const iconColor=shapeStyle?(shapeStyle.stroke!=='none'?shapeStyle.stroke:shapeStyle.fill):null;
  const rect=node?.getBoundingClientRect(),extent=s?Math.max(0,parseFloat(s.outlineWidth)+parseFloat(s.outlineOffset)):NaN;
  const ring=rect&&Number.isFinite(extent)?{left:rect.left-extent,right:rect.right+extent,top:rect.top-extent,bottom:rect.bottom+extent}:null;
  const ringClip={left:0,right:innerWidth,top:0,bottom:innerHeight};
  for(let n=node?.parentElement;n;n=n.parentElement){const st=getComputedStyle(n),r=n.getBoundingClientRect();if(/hidden|clip|auto|scroll/.test(st.overflowX)){ringClip.left=Math.max(ringClip.left,r.left+n.clientLeft);ringClip.right=Math.min(ringClip.right,r.left+n.clientLeft+n.clientWidth);}if(/hidden|clip|auto|scroll/.test(st.overflowY)){ringClip.top=Math.max(ringClip.top,r.top+n.clientTop);ringClip.bottom=Math.min(ringClip.bottom,r.top+n.clientTop+n.clientHeight);}}
  if(!ring||ring.left<ringClip.left||ring.right>ringClip.right||ring.top<ringClip.top||ring.bottom>ringClip.bottom)issues.push('focus outline extent is clipped or unmeasured');
  return {background,issues,ring,ringClip,hasText:Boolean(node?.textContent.trim()),text:s?ratio(s.color):null,hasIcon:Boolean(svg),icon:iconColor?ratio(iconColor):null,focus:s?ratio(s.outlineColor):null};
}

async function sourceInventory(site){const entries=[];async function walk(directory){for(const item of (await readdir(directory,{withFileTypes:true})).sort((a,b)=>a.name.localeCompare(b.name))){const path=resolve(directory,item.name);if(item.isSymbolicLink())throw new Error(`Unexpected served source symlink: ${path}`);if(item.isDirectory())await walk(path);else if(item.isFile()){const bytes=await readFile(path);entries.push({path:path.slice(site.length+1),bytes:bytes.length,sha256:sha256(bytes)});}}}await walk(site);for(const file of ['scripts/verify-funnest-p2a0-browser.mjs','scripts/verify-ui-renewal-p1-browser.mjs','scripts/verify-workspace-browser.mjs','scripts/headless-browser-window.mjs']){const bytes=await readFile(resolve(root,file));entries.push({path:file,bytes:bytes.length,sha256:sha256(bytes)});}return entries;}

export async function verifyFunnestP2a0Browser(argv=process.argv.slice(2)){
  const report={schemaVersion:1,kind:'atlas-funnest-p2a0-native',request:'P2A0-6ffbdda',recordedAt:new Date().toISOString(),package:'@funnest/charts-ui@0.6.16',
    scope:'Isolated BTC package spike only. Unchanged conference A-9 and closed P1 gates are separate.',methodology:'Native CDP pointer/key/touch inputs; read-only observer, pixels and native intersection diagnostics; no product setters/focus/scroll/style repair.',
    network:{...p2a0Network,serverEncoding:'gzip',cacheDisabled:true,cpuThrottling:1},budgets:p2a0Budgets,startup:[],features:[],keyboard:[],touch:[],networkInterception:[],failures:[],qualifiesP2a0NativeVerification:false};
  let options,ownsOut=false,server,profile,chrome,browser,stderr='',stage='arguments';
  const requests=[];
  try{
    options=parseP2a0Arguments(argv);if(options.help){console.log('Usage: node scripts/verify-funnest-p2a0-browser.mjs --out NEW_DIRECTORY [--site build/p2a0/site] [--browser CHROME_PATH]\nSix fixed Fast4G startup cases; seven native features; four keyboard cases; four touch cases. 0 attempts never pass. Existing P1/P0 and conference A-9 remain separate and unchanged.');return report;}
    await mkdir(dirname(options.out),{recursive:true});await mkdir(options.out,{recursive:false});ownsOut=true;
    report.testedHead=execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim();report.workingTree=execFileSync('git',['status','--short'],{cwd:root,encoding:'utf8'}).trim().split('\n').filter(Boolean);
    options.site=await realpath(options.site);report.site=options.site;report.sourceHashes=await sourceInventory(options.site);
    const sourceBytes=await readFile(resolve(options.site,'data/btc-volume.json')),source=JSON.parse(sourceBytes);
    assert.equal(source.provider,'Bitstamp');assert.equal(source.interval,'daily');assert.ok(source.bars.length>1);
    const expected={sha256:sha256(sourceBytes),times:source.bars.map(b=>b.time*1000),bars:source.bars.map(b=>({...b,time:b.time*1000}))};
    report.data={file:'data/btc-volume.json',sha256:expected.sha256,bytes:sourceBytes.length,totalBars:expected.times.length,firstTime:expected.times[0],lastTime:expected.times.at(-1),provider:source.provider,asOf:source.asOf};
    stage='browser executable';await access(options.bin,constants.X_OK);
    server=createP2a0StaticServer(options.site,requests);stage='static server';await new Promise((ok,no)=>{server.once('error',no);server.listen(0,'127.0.0.1',ok);});const origin=`http://127.0.0.1:${server.address().port}`;
    profile=await mkdtemp(resolve(tmpdir(),'atlas-p2a0-'));stage='Chromium launch';chrome=spawn(options.bin,['--headless=new','--disable-gpu','--disable-dev-shm-usage','--disable-background-networking','--no-first-run',headlessWindowArgument,'--remote-debugging-port=0',`--user-data-dir=${profile}`,'about:blank'],{stdio:['ignore','ignore','pipe']});
    let launchError;chrome.once('error',e=>launchError=e);chrome.stderr.on('data',b=>stderr=(stderr+b).slice(-12000));
    const port=await until(async()=>{if(launchError)throw launchError;if(chrome.exitCode!==null||chrome.signalCode!==null)throw new Error(`Chromium exited ${chrome.exitCode}/${chrome.signalCode}: ${stderr}`);try{return(await readFile(resolve(profile,'DevToolsActivePort'),'utf8')).trim().split('\n');}catch{return null;}},'Chromium debugging endpoint');
    browser=await Cdp.connect(`ws://127.0.0.1:${port[0]}${port[1]}`);report.browser=await browser.send('Browser.getVersion');
    async function page(viewport,id){
      const {browserContextId}=await browser.send('Target.createBrowserContext'),{targetId}=await browser.send('Target.createTarget',{url:'about:blank',browserContextId});
      const targets=await(await fetch(`http://127.0.0.1:${port[0]}/json/list`)).json(),cdp=await Cdp.connect(targets.find(t=>t.id===targetId).webSocketDebuggerUrl);
      for(const domain of ['Page','Runtime','Network'])await cdp.send(`${domain}.enable`);
      const errors=[];cdp.listeners.set('Runtime.exceptionThrown',p=>errors.push(p.exceptionDetails?.exception?.description||p.exceptionDetails?.text||'runtime error'));cdp.listeners.set('Runtime.consoleAPICalled',p=>{if(p.type==='error')errors.push('console: '+p.args.map(a=>a.value||a.description||'').join(' '));});
      const nativeWindowEnvelope=await verifyHeadlessWindowEnvelope(cdp,viewport);
      await cdp.send('Emulation.setDeviceMetricsOverride',{...viewport,deviceScaleFactor:1,mobile:viewport.width<621});await cdp.send('Emulation.setTouchEmulationEnabled',{enabled:viewport.width<621,maxTouchPoints:2});
      await cdp.send('Network.setCacheDisabled',{cacheDisabled:true});await cdp.send('Network.emulateNetworkConditions',p2a0Network);await cdp.send('Emulation.setCPUThrottlingRate',{rate:1});
      const diagnostic={};report.networkInterception.push(diagnostic);const interception=createP1NetworkInterception(cdp,{origin,pageId:id,failures:report.failures,diagnostic});await interception.start();
      return {cdp,errors,nativeWindowEnvelope,close:()=>interception.close(()=>browser.send('Target.disposeBrowserContext',{browserContextId}))};
    }
    async function run(group,id,viewport,fn){
      const receipt={id,viewport,status:'unverified',attempted:false,inputs:[],failures:[],initialPaintedReadyMs:null};report[group].push(receipt);let owned;
      try{owned=await page(viewport,`${group}-${id}`);receipt.nativeWindowEnvelope=owned.nativeWindowEnvelope;await owned.cdp.send('Page.navigate',{url:origin+'/'});receipt.attempted=true;const initial=await ready(owned.cdp,expected);receipt.initialPaintedReadyMs=initial.observer.metrics.initialPaintedReadyMs;receipt.initial=initial;await fn(owned.cdp,receipt);
        receipt.resources=await evaluate(owned.cdp,()=>[...performance.getEntriesByType('navigation'),...performance.getEntriesByType('resource')].map(x=>({name:x.name,startTime:x.startTime,duration:x.duration,transferSize:x.transferSize,encodedBodySize:x.encodedBodySize,decodedBodySize:x.decodedBodySize,initiatorType:x.initiatorType||x.entryType})));
        receipt.resourceTotals=receipt.resources.reduce((s,r)=>({requests:s.requests+1,transferSize:s.transferSize+r.transferSize,encodedBodySize:s.encodedBodySize+r.encodedBodySize,decodedBodySize:s.decodedBodySize+r.decodedBodySize}),{requests:0,transferSize:0,encodedBodySize:0,decodedBodySize:0});
        receipt.failures.push(...owned.errors);const shot=await owned.cdp.send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});receipt.screenshot=`${group}-${id}.png`;await writeFile(resolve(options.out,receipt.screenshot),Buffer.from(shot.data,'base64'));
        receipt.status=receipt.failures.length?'failed':'passed';
      }catch(e){receipt.failures.push(e.stack||String(e));receipt.status=receipt.attempted?'failed':'unverified';}
      finally{try{await owned?.close();}catch(e){receipt.failures.push(`page cleanup: ${e.message}`);receipt.status=receipt.attempted?'failed':'unverified';}if(owned){receipt.runtimeErrors=[...owned.errors];for(const error of owned.errors)if(!receipt.failures.includes(error))receipt.failures.push(error);if(receipt.failures.length&&receipt.attempted)receipt.status='failed';}}
      report.failures.push(...receipt.failures.map(f=>`${group}/${id}: ${f}`));await writeFile(resolve(options.out,'report.json'),JSON.stringify({...report,...p2a0FinalStatus(report)},null,2)+'\n');console.log(JSON.stringify({group,id,status:receipt.status,attempted:receipt.attempted,initialPaintedReadyMs:receipt.initialPaintedReadyMs,failures:receipt.failures.length}));
    }
    stage='startup matrix';for(const v of p2a0Viewports)await run('startup',`${v.width}x${v.height}`,v,async(cdp,r)=>{r.failures.push(...validateP2a0Ready(r.initial,expected));});
    stage='native feature cases';for(const id of p2a0FeatureIds)await run('features',id,{width:1440,height:900},async(cdp,r)=>{
      if(id==='candles'){
        await pointer(cdp,'.fnc-btn-tools',r.inputs);await pointer(cdp,'.fnc-tools-menu [data-type="line"]',r.inputs);await until(async()=>((await evaluate(cdp,readObserver))?.chart.type==='line'),'native line selection');
        if(!await evaluate(cdp,()=>Boolean(document.querySelector('.fnc-tools-menu'))))await pointer(cdp,'.fnc-btn-tools',r.inputs);
        await pointer(cdp,'.fnc-tools-menu [data-type="candles"]',r.inputs);await until(async()=>((await evaluate(cdp,readObserver))?.chart.type==='candles'),'native candle selection');await key(cdp,'Escape',r.inputs);r.after=await evaluate(cdp,inspectP2a0Page);assert.ok(r.after.canvas.paintedPixels>0);
      }else if(['log','percent'].includes(id)){
        await pointer(cdp,'.fnc-btn-tools',r.inputs);const selector=await targetByText(cdp,'.fnc-tools-menu [role="radiogroup"][aria-label="가격 축"] [role="radio"]',id==='log'?'로그':'%');await pointer(cdp,selector,r.inputs);
        r.after=await until(async()=>{const state=await evaluate(cdp,readObserver);return (state.chart.priceScale||state.chart.settings?.priceScale)===id?state:null;},`native ${id} price scale`);
        r.radio=await evaluate(cdp,s=>({checked:document.querySelector(s)?.getAttribute('aria-checked'),text:document.querySelector(s)?.textContent}),selector);assert.equal(r.radio.checked,'true');await key(cdp,'Escape',r.inputs);
      }else if(id==='indicator-ma'){
        await pointer(cdp,'.fnc-btn-indicators',r.inputs);const selector=await targetByText(cdp,'[role="dialog"] button.fnc-sr-row','이동평균선');await pointer(cdp,selector,r.inputs);
        r.after=await until(async()=>{const state=await evaluate(cdp,readObserver);return state.chart.indicators?.some(i=>i.type==='ma')?state:null;},'native moving average');r.legend=await evaluate(cdp,()=>document.querySelector('.fnc-legend')?.textContent||'');assert.match(r.legend,/MA|이동평균/);
      }else if(id==='drawing-trendline'){
        await pointer(cdp,'.fnc-drawbar button[aria-label="추세선"]',r.inputs);const box=(await evaluate(cdp,inspectP2a0Page)).canvas.rect;
        for(const [x,y]of [[.30,.55],[.65,.35]]){const p={x:box.left+box.width*x,y:box.top+box.height*y};r.inputs.push({kind:'native-drawing-point',...p});await point(cdp,p);await painted(cdp);}
        r.after=await until(async()=>{const state=await evaluate(cdp,readObserver);return state.chart.drawings?.some(d=>d.type==='trendline')?state:null;},'native trendline points');
      }else if(id==='symbol-search'){
        r.before=await evaluate(cdp,readObserver);await pointer(cdp,'.fnc-symbol',r.inputs);const target=await tabTo(cdp,'.fnc-search-dialog [role="combobox"]',r.inputs);assert.equal(target.inside,true);
        r.inputs.push({kind:'native-text',text:'BTC'});await cdp.send('Input.insertText',{text:'BTC'});await until(()=>evaluate(cdp,()=>[...document.querySelectorAll('.fnc-sr-row[role="option"]')].some(n=>/BTC|비트코인/.test(n.textContent))),'BTC search result');
        r.search=await evaluate(cdp,()=>({query:document.querySelector('.fnc-search-dialog [role="combobox"]')?.value,options:[...document.querySelectorAll('.fnc-sr-row[role="option"]')].map(n=>({text:n.textContent,selected:n.getAttribute('aria-selected')}))}));assert.equal(r.search.query,'BTC');await key(cdp,'ArrowDown',r.inputs);await key(cdp,'Enter',r.inputs);
        await until(()=>evaluate(cdp,()=>!document.querySelector('.fnc-search-dialog')),'search selection closes dialog');
        r.after=await until(async()=>{const state=await evaluate(cdp,readObserver),before=r.before.datafeed?.calls,after=state?.datafeed?.calls;return state?.status==='ready'&&before&&after&&after.searchSymbols>before.searchSymbols&&after.resolveSymbol>before.resolveSymbol&&after.getBars>before.getBars?state:null;},'native search selection reloads canonical BTC through the Datafeed');
        const loaded=await evaluate(cdp,inspectP2a0Page);assert.deepEqual(validateP2a0Ready(loaded,expected,{budget:false}),[]);assert.ok(r.after.events.some(e=>e.type==='datafeed:bars'&&e.at>Math.max(0,...r.before.events.map(e=>e.at))),'search selection must create a new datafeed bars receipt');
      }else if(id==='korean-colors'){
        const chart=r.initial.observer.chart,box=r.initial.canvas.rect,main=chart.layout.panes.find(p=>p.kind==='main'),first=expected.times.indexOf(chart.firstTime),spacing=chart.view?.barSpacing,offset=chart.view?.rightOffset;
        assert.ok(Number.isFinite(spacing)&&spacing>0&&Number.isFinite(offset),'actual time-scale view is required for native candle hover');
        const visible=expected.bars.slice(first,first+chart.barCount).map((bar,index)=>({bar,x:chart.layout.plotWidth-(chart.barCount-1+offset-index+.5)*spacing})).filter(item=>item.x>20&&item.x<chart.layout.plotWidth-20);
        r.directionalSamples=[];
        for(const direction of ['up','down']){
          const sample=visible.find(item=>direction==='up'?item.bar.close>item.bar.open:item.bar.close<item.bar.open);assert.ok(sample,`a visible real ${direction} candle is required`);
          const before=await evaluate(cdp,readObserver),lastEvent=Math.max(0,...before.events.map(e=>e.at)),p={x:box.left+sample.x,y:box.top+main.top+main.height*.6};r.inputs.push({kind:'native-chart-hover',direction,time:sample.bar.time,...p});
          await cdp.send('Input.dispatchMouseEvent',{type:'mouseMoved',...p});await painted(cdp);
          const event=await until(async()=>{const state=await evaluate(cdp,readObserver);return state.events.findLast(e=>e.type==='crosshairMove'&&e.at>lastEvent&&e.detail?.source==='mouse'&&e.detail?.bar?.time===sample.bar.time);},`native ${direction} candle crosshair`);
          for(const field of ['time','open','high','low','close','volume'])assert.equal(event.detail.bar[field],sample.bar[field],`native hovered ${field} matches Atlas data`);
          const colors=await evaluate(cdp,colorEvidence,sample.x);assert.equal(colors.ohlc.length,4);assert.ok(colors.ohlc.every(item=>item.className.split(/\s+/).includes(`fnc-${direction}`)),`${direction} candle OHLC legend follows actual close minus open`);
          assert.ok(colors.column?.[direction==='up'?'upPixels':'downPixels']>0,`${direction} candle column paints its direction color`);
          r.directionalSamples.push({direction,expectedBar:sample.bar,event,colors});
        }
        r.colors=await evaluate(cdp,colorEvidence);assert.equal(r.colors.type,'candles');assert.ok(r.colors.up&&r.colors.up[0]>r.colors.up[1]&&r.colors.up[0]>r.colors.up[2],'up candle color must be red');assert.ok(r.colors.down&&r.colors.down[2]>r.colors.down[0]&&r.colors.down[2]>r.colors.down[1],'down candle color must be blue');assert.ok(r.colors.upPixels>0&&r.colors.downPixels>0,'both red and blue candle pixels must be observed');
      }
    });
    stage='native keyboard accessibility';for(const width of p2a0KeyboardWidths)await run('keyboard',String(width),p2a0Viewports.find(v=>v.width===width),async(cdp,r)=>{
      r.targets=[];const selectors=['.fnc-symbol','.fnc-btn-indicators','.fnc-btn-tools',width<621?'.fnc-btn-drawbar':'.fnc-drawbar button[aria-label="추세선"]'];
      for(const selector of selectors){const entry={selector,failures:[]};r.targets.push(entry);try{entry.target=await tabTo(cdp,selector,r.inputs);entry.failures.push(...validateP2a0Target(entry.target,{keyboard:true,minimumSize:true}));entry.contrast=await evaluate(cdp,inspectP2a0Contrast,selector);const c=entry.contrast;if(c.issues.length)entry.failures.push(...c.issues);if(c.hasText&&!(c.text>=4.5))entry.failures.push(`text contrast ${c.text} below 4.5`);if(c.hasIcon&&!(c.icon>=3))entry.failures.push(`icon contrast ${c.icon} below 3`);if(!(c.focus>=3))entry.failures.push(`focus contrast ${c.focus} below 3`);}catch(e){entry.failures.push(e.message);}r.failures.push(...entry.failures.map(f=>`${selector}: ${f}`));}
      // Keyboard opens the actual symbol dialog; Escape must restore its trigger.
      await tabTo(cdp,'.fnc-symbol',r.inputs);await key(cdp,'Enter',r.inputs);await until(()=>evaluate(cdp,()=>Boolean(document.querySelector('.fnc-search-dialog'))),'keyboard symbol dialog');r.dialogFocus=await evaluate(cdp,()=>({inside:document.querySelector('.fnc-search-dialog')?.contains(document.activeElement),role:document.activeElement?.getAttribute('role')}));if(!r.dialogFocus.inside)r.failures.push('symbol dialog did not own keyboard focus');
      await tabTo(cdp,'.fnc-search-dialog [role="combobox"]',r.inputs);await key(cdp,'Tab',r.inputs,8);r.dialogReverseTab=await evaluate(cdp,()=>({inside:document.querySelector('.fnc-search-dialog')?.contains(document.activeElement),tag:document.activeElement?.tagName,label:document.activeElement?.getAttribute('aria-label')||document.activeElement?.textContent?.slice(0,80)}));if(!r.dialogReverseTab.inside)r.failures.push('Shift+Tab escaped the modal symbol dialog');
      await tabTo(cdp,'.fnc-search-dialog [role="combobox"]',r.inputs);
      await key(cdp,'Escape',r.inputs);await until(()=>evaluate(cdp,()=>!document.querySelector('.fnc-search-dialog')),'Escape closes symbol dialog');r.escapeReturn=await evaluate(cdp,()=>document.querySelector('.fnc-symbol')===document.activeElement);if(!r.escapeReturn)r.failures.push('Escape did not return focus to the symbol trigger');
    });
    stage='native mobile gestures';for(const id of p2a0TouchIds){const [gesture,widthText]=id.split('-'),width=Number(widthText);await run('touch',id,p2a0Viewports.find(v=>v.width===width),async(cdp,r)=>{
      const box=r.initial.canvas.rect;r.before=await evaluate(cdp,readObserver);const x=box.left+box.width*.5,y=box.top+box.height*.55;
      const points=gesture==='pan'?[{id:1,x:x+box.width*.20,y}]:[{id:1,x:x-box.width*.10,y},{id:2,x:x+box.width*.10,y}];
      r.inputs.push({kind:'native-touch-start',touchPoints:points});await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:points});
      for(let step=1;step<=12;step++){const touchPoints=gesture==='pan'?[{id:1,x:points[0].x-box.width*.35*step/12,y}]:[{id:1,x:x-box.width*(.10+.15*step/12),y},{id:2,x:x+box.width*(.10+.15*step/12),y}];r.inputs.push({kind:'native-touch-move',touchPoints});await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints});await delay(20);}
      await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});r.inputs.push({kind:'native-touch-end'});await painted(cdp);
      r.after=await until(async()=>{const state=await evaluate(cdp,readObserver);return JSON.stringify(state.chart.visibleRange)!==JSON.stringify(r.before.chart.visibleRange)?state:null;},`native touch ${gesture} changes the visible range`);
      const before=r.before.chart.visibleRange,after=r.after.chart.visibleRange;assert.ok(before&&after,'both actual visible ranges are required');const span=range=>range.to-range.from;
      assert.ok([before.from,before.to,after.from,after.to].every(Number.isFinite),'finite time-range evidence required');
      if(gesture==='pinch')assert.ok(span(after)<span(before),'outward native pinch must zoom in');else assert.ok(Math.abs(after.from-before.from)>0,'native pan must change time origin');
      const final=await evaluate(cdp,inspectP2a0Page);assert.equal(final.overflow,0);assert.ok(final.canvas.paintedPixels>0);
    });}
  }catch(e){report.failures.push(`${stage}: ${e.stack||String(e)}`);report.blockedAt=stage;}
  finally{
    if(chrome)report.browserProcess={exitCode:chrome.exitCode,signalCode:chrome.signalCode,stderr};browser?.close();chrome?.kill('SIGKILL');if(server?.listening){server.closeAllConnections();await new Promise(ok=>server.close(ok));}if(profile)await rm(profile,{recursive:true,force:true}).catch(e=>report.failures.push(`profile cleanup: ${e.message}`));
    if(!options?.help){if(report.sourceHashes)try{report.sourceHashesAfter=await sourceInventory(options.site);report.sourceStable=JSON.stringify(report.sourceHashes)===JSON.stringify(report.sourceHashesAfter);if(!report.sourceStable)report.failures.push('served source bytes changed during verification');}catch(e){report.sourceStable=false;report.failures.push(`source recheck: ${e.message}`);}
      report.requests=requests;report.httpErrors=requests.filter(r=>r.status>=400);if(report.httpErrors.length)report.failures.push('local HTTP errors occurred');
      report.externalRequests=report.networkInterception.flatMap(d=>d.requests||[]).filter(r=>r.command==='Fetch.failRequest');if(report.externalRequests.length)report.failures.push('isolated spike attempted an external request');
      report.timings={initialPaintedReadyMs:report.startup.some(c=>Number.isFinite(c.initialPaintedReadyMs))?Object.fromEntries(report.startup.map(c=>[c.id,c.initialPaintedReadyMs])):null,conferenceInitialPaintedReadyMs:null,conferencePageTransitionMs:null,conferenceGate:'separate unchanged gate; not measured by this runner'};
      report.finishedAt=new Date().toISOString();Object.assign(report,p2a0FinalStatus(report));if(ownsOut)await writeFile(resolve(options.out,'report.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({status:report.status,qualifiesP2a0NativeVerification:report.qualifiesP2a0NativeVerification,counts:report.counts,blockedAt:report.blockedAt||null,failures:report.failures.length,out:options?.out||null}));if(report.status!=='passed')process.exitCode=1;
    }
  }
  return report;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href)await verifyFunnestP2a0Browser();
