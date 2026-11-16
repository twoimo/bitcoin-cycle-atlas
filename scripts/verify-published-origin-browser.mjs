#!/usr/bin/env node
// Explicit post-deployment diagnostic. This report never qualifies a release.
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir,mkdtemp,rm} from 'node:fs/promises';
import {resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {fileURLToPath} from 'node:url';
import {spawn,execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {bootstrapCloudflareBuild} from './bootstrap-cloudflare-build.mjs';
import {checkPublicationMetadata} from './build-publication.mjs';
import {emitBrowserEvidenceChunks,emitCompressedBrowserReport} from './browser-evidence-transport.mjs';
import {drainVerificationOutput,installVerificationSignalHandlers} from './cloudflare-gate-runner.mjs';
import {verifyChartZoomBrowser} from './verify-chart-zoom-browser.mjs';

const root=resolve(fileURLToPath(new URL('..',import.meta.url)));
const origin='https://bitcoin-cycle-atlas.twoimo.workers.dev';
const instruments=[
  {symbol:'BTCUSD',id:'lab-chart',product:'BTC-USD'},
  {symbol:'ETHUSD',id:'eth-chart',product:'ETH-USD'},
  {symbol:'MSTR',id:'equity-chart',product:'MSTR'},
  {symbol:'BMNR',id:'equity-chart',product:'BMNR'},
  ...['TQQQ','SOXL','233740'].map(symbol=>({symbol,center:'rsi'})),
  {symbol:'HYPE',center:'themes'},
  ...['busan','seoul','gyeonggi','national'].map(region=>({symbol:'HOUSING-'+region.toUpperCase(),center:'housing',region})),
];
const instrumentUrl=instrument=>origin+(instrument.center?'/market-lab/charts/?symbol='+instrument.symbol+(instrument.region?'&region='+instrument.region:'')
  :'/'+(instrument.symbol==='BTCUSD'?'?axis=linear':'?symbol='+instrument.symbol+'&granularity=daily&type=line&axis=linear'));
export const publishedOriginCases=Object.freeze([{width:1440,height:900},{width:390,height:844},{width:390,height:430}]
  .flatMap(viewport=>instruments.map(instrument=>Object.freeze({...instrument,...viewport,
    name:instrument.symbol.toLowerCase()+'-'+viewport.width+'x'+viewport.height,url:instrumentUrl(instrument),
    zoom:['BTCUSD','TQQQ'].includes(instrument.symbol)||viewport.width===1440&&['ETHUSD','MSTR','HYPE','HOUSING-BUSAN'].includes(instrument.symbol),
    roundTrip:['ETHUSD','MSTR'].includes(instrument.symbol)}))));
const out=resolve(root,'build/published-origin-smoke');
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const errorText=error=>String(error?.stack||error?.message||error).slice(0,12000);
const delay=ms=>new Promise(accept=>setTimeout(accept,ms));
const controller=new AbortController();
const report={schemaVersion:1,kind:'atlas-published-origin-browser-smoke',status:'RUNNING',
  qualifiesFullVerification:false,origin,startedAt:new Date().toISOString(),cases:[],failures:[],
  scope:'36 cold HTTPS browser contexts: twelve instruments at 1440x900, 390x844 and 390x430; representative native zoom and ETH/MSTR symbol round trips. No model, full-suite, live-price freshness, Safari or physical-device claim.'};
let browser,chrome,profile,removeSignals,deadlineTimer,chromeStderr='',expectedSource,expectedManifest;
const headerNames=['content-type','content-security-policy','content-security-policy-report-only','x-content-type-options',
  'referrer-policy','cache-control','etag','cf-cache-status','location'];
const headersOf=value=>Object.fromEntries(Object.entries(value instanceof Headers?Object.fromEntries(value):value||{})
  .map(([key,value])=>[key.toLowerCase(),String(value)]).filter(([key])=>headerNames.includes(key)));
const checkpoint=()=>controller.signal.throwIfAborted();
async function until(fn,label,timeout=45000){
  const end=Date.now()+timeout;
  while(Date.now()<end){checkpoint();const value=await fn();if(value)return value;await delay(100);}
  throw new Error('Timed out: '+label);
}
class Cdp{
  constructor(ws){
    this.ws=ws;this.next=1;this.pending=new Map();this.listeners=new Map();this.closed=false;
    ws.addEventListener('message',event=>{
      try{
        const message=JSON.parse(String(event.data));
        if(message.id){const p=this.pending.get(message.id);if(!p)return;clearTimeout(p.timer);this.pending.delete(message.id);
          message.error?p.reject(new Error(p.method+': '+JSON.stringify(message.error))):p.accept(message.result||{});
        }else for(const listener of this.listeners.get(message.method)||[])listener(message.params||{});
      }catch(error){this.fail(error);}
    });
    ws.addEventListener('close',()=>this.fail(new Error('CDP socket closed')));
    ws.addEventListener('error',()=>this.fail(new Error('CDP socket error')));
  }
  static async connect(url){
    const ws=new WebSocket(url);
    await new Promise((accept,reject)=>{
      const timer=setTimeout(()=>{ws.close();reject(new Error('CDP connection timeout'));},15000);
      ws.addEventListener('open',()=>{clearTimeout(timer);accept();},{once:true});
      ws.addEventListener('error',()=>{clearTimeout(timer);reject(new Error('CDP connection failed'));},{once:true});
    });
    return new Cdp(ws);
  }
  on(name,listener){const list=this.listeners.get(name)||[];list.push(listener);this.listeners.set(name,list);}
  fail(error){this.closed=true;for(const p of this.pending.values()){clearTimeout(p.timer);p.reject(error);}this.pending.clear();}
  send(method,params={}){
    checkpoint();if(this.closed)return Promise.reject(new Error('CDP closed before '+method));
    const id=this.next++;
    return new Promise((accept,reject)=>{
      const timer=setTimeout(()=>{this.pending.delete(id);reject(new Error('CDP timeout: '+method));},15000);
      this.pending.set(id,{accept,reject,timer,method});
      try{this.ws.send(JSON.stringify({id,method,params}));}catch(error){clearTimeout(timer);this.pending.delete(id);reject(error);}
    });
  }
  close(){this.fail(new Error('CDP client closed'));this.ws.close();}
}
async function evaluate(cdp,fn,...args){
  const result=await cdp.send('Runtime.evaluate',{expression:'('+fn.toString()+')('+args.map(x=>JSON.stringify(x)).join(',')+')',
    awaitPromise:true,returnByValue:true});
  assert.equal(result.exceptionDetails,undefined,'Browser evaluation failed: '+JSON.stringify(result.exceptionDetails));
  return result.result.value;
}
async function settled(cdp){await evaluate(cdp,async()=>{await document.fonts.ready;await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));});}
async function publication(){
  checkpoint();const response=await fetch(origin+'/publication.json',{redirect:'error',cache:'no-store',
    signal:AbortSignal.any([controller.signal,AbortSignal.timeout(20000)])});
  assert.equal(response.status,200,'Public publication manifest must return HTTP200');
  const headers=headersOf(response.headers);assert.match(headers['content-type']||'',/^application\/json\b/i);
  assert.match(headers['cache-control']||'',/(?:^|,)\s*no-store(?:\s|,|$)/i);
  const reader=response.body.getReader(),parts=[];let length=0;
  try{while(true){const item=await reader.read();if(item.done)break;length+=item.value.length;
    assert.ok(length<=4*1024*1024,'Publication manifest exceeds its bounded size');parts.push(item.value);
  }}finally{await reader.cancel().catch(()=>{});}
  const bytes=Buffer.concat(parts),manifest=JSON.parse(bytes.toString('utf8'));
  const metadataFileCount=checkPublicationMetadata(manifest);
  assert.equal(manifest.manifestSha256,expectedManifest,'Public canonical manifest identity differs from explicit expected deployment');
  assert.equal(manifest.kind,'atlas-publication');assert.equal(manifest.sourceCommit,expectedSource);
  assert.equal(manifest.sourceTree?.status,'clean','Public deployment must identify committed source');
  assert.equal(manifest.checkedOutCommit,expectedSource);
  return {checkedAt:new Date().toISOString(),url:response.url,bytes:bytes.length,rawSha256:sha(bytes),metadataFileCount,
    sourceCommit:manifest.sourceCommit,manifestSha256:manifest.manifestSha256,headers};
}
function inspectPage(){
  if(!document.documentElement||!document.body)return null;
  const painted=node=>Boolean(node?.checkVisibility({checkOpacity:true,checkVisibilityCSS:true}));
  const frames=[...document.querySelectorAll('.atlas-center-frame')].filter(painted),frame=frames[0],child=frame?.contentDocument;
  const box=node=>{if(!node)return null;const r=node.getBoundingClientRect(),offset=node.ownerDocument===document?{left:0,top:0}:frame.getBoundingClientRect();
    return {left:r.left+offset.left,right:r.right+offset.left,top:r.top+offset.top,bottom:r.bottom+offset.top,width:r.width,height:r.height,painted:painted(node)};};
  const primary=[...document.querySelectorAll('svg#lab-chart,svg#eth-chart,svg#equity-chart')].filter(painted)
    .concat(frames.flatMap(owner=>[...owner.contentDocument?.querySelectorAll('.rsi-chart-canvas > svg')||[]].filter(painted))),svg=primary[0];
  const paths=svg?[...svg.querySelectorAll('path[d]')].map(node=>node.getAttribute('d').trim()):[];
  const pricePaths=svg?.ownerDocument===document?paths:[...svg?.querySelectorAll('path.rsi-price-line[d]')||[]].map(node=>node.getAttribute('d').trim());
  const candles=svg?[...svg.querySelectorAll('[data-candle]')]:[];
  const invalidCandle=candles.some(node=>{
    const line=node.querySelector('line'),body=node.querySelector('rect');
    return [[line,['x1','x2','y1','y2']],[body,['x','y','width','height']]].some(([shape,attributes])=>
      !shape||attributes.some(name=>!shape.hasAttribute(name)||!Number.isFinite(Number(shape.getAttribute(name)))))||
      Number(body?.getAttribute('width'))<=0||Number(body?.getAttribute('height'))<0;
  });
  const nativeActions=[...document.querySelectorAll('.atlas-canvas-heading #eth-history-trigger,.atlas-canvas-heading [data-eth-action],.atlas-canvas-heading [data-equity-action],.atlas-canvas-heading #equity-scenario')]
    .map(node=>({id:node.id,action:node.dataset.ethAction||node.dataset.equityAction,hidden:node.hidden,disabled:node.disabled,painted:painted(node)}));
  const chart=svg?{id:svg.id,ownerSymbol:svg.querySelector('title')?.textContent.match(/^(\S+) (?:1D|1W|1M) 관측 차트$/)?.[1],dataset:{...svg.dataset},box:box(svg),viewBox:svg.getAttribute('viewBox'),
    observedCount:svg.ownerDocument===document?Number(svg.dataset.observedCandleCount||0)+Number(svg.dataset.observedLineCount||0)
      :Number(svg.querySelector('desc')?.textContent.match(/(\d+)개 가격 관측/)?.[1]||0),
    pathCount:pricePaths.filter(Boolean).length,invalidPath:paths.some(value=>/NaN|Infinity/.test(value)),candleCount:candles.length,invalidCandle,allocation:box(document.querySelector('.atlas-plot')),
    renderAllocation:box(svg.closest('.rsi-chart-canvas,.atlas-plot'))}:null;
  return {url:location.href,origin:location.origin,title:document.title,boot:document.documentElement.dataset.boot,
    bootHidden:document.querySelector('#atlas-boot-shell')?.hidden===true,
    blockedContent:[...document.querySelectorAll('[data-boot-content]')].some(node=>node.inert||node.getAttribute('aria-hidden')==='true'),
    symbol:document.documentElement.dataset.symbol,shell:document.body.dataset.shell,page:document.body.dataset.page,
    center:document.body.dataset.centerTool||null,controls:document.body.dataset.chartControls||null,
    frameCount:frames.length,frame:frame?{url:child?.URL,source:frame.src,box:box(frame),width:child?.defaultView.innerWidth,height:child?.defaultView.innerHeight,documentWidth:child?.documentElement.scrollWidth}:null,
    rangeLabel:document.querySelector('#workbench-range-label')?.title,nativeActions,
    priceDestinations:[...document.querySelectorAll('[data-atlas-page=outlook]')].map(node=>({tag:node.tagName,current:node.getAttribute('aria-current'),disabled:node.disabled===true})),
    priceLinks:[...document.querySelectorAll('a[data-atlas-page=outlook]')].map(node=>node.href),
    width:innerWidth,height:innerHeight,rootWidth:document.documentElement.scrollWidth,bodyWidth:document.body.scrollWidth,
    primaryCount:primary.length,chart,
    ownerCounts:Object.fromEntries(['.atlas-canvas-heading','.workbench-tools','.workbench-rail','.workbench-bottom-bar'].map(selector=>[selector,document.querySelectorAll(selector).length])),
    nav:[...document.querySelectorAll('.workbench-rail .atlas-nav [data-atlas-page]')].map(node=>node.dataset.atlasPage),
    top:box(document.querySelector('.atlas-canvas-heading')),headingLayout:document.querySelector('.atlas-canvas-heading')?.dataset.mobileHeading||null,
    headingScroll:{width:document.querySelector('.atlas-canvas-heading')?.scrollWidth,client:document.querySelector('.atlas-canvas-heading')?.clientWidth},bottom:box(document.querySelector('.workbench-bottom-bar')),
    refreshNotice:box(document.querySelector('#btc-refresh-notice')),
    left:box(document.querySelector('.atlas-sidebar')),right:box(document.querySelector('.workbench-rail')),
    trayOpen:document.querySelector('.workbench-rail')?.hasAttribute('data-mobile-open')===true,
    cspMeta:[...document.querySelectorAll('meta[http-equiv]')].filter(node=>node.httpEquiv.toLowerCase()==='content-security-policy').map(node=>node.content),
    cspViolations:[...(window.__atlasPublishedSmoke?.cspViolations||[]),
      ...frames.flatMap(owner=>owner.contentWindow.__atlasPublishedSmoke?.cspViolations||[])]};
}
export function validatePage(state,spec){
  const actual=new URL(state.url),requested=new URL(spec.url);
  assert.equal(state.origin,origin);assert.equal(actual.origin,origin);assert.equal(actual.pathname,requested.pathname);assert.equal(actual.hash,'');
  const target=instruments.find(instrument=>instrument.symbol===spec.symbol);assert.ok(target,'Unsupported diagnostic instrument');
  assert.equal(actual.searchParams.get('symbol')||'BTCUSD',spec.symbol,'App query normalization must retain the requested instrument');
  assert.equal(actual.searchParams.getAll('symbol').length,spec.symbol==='BTCUSD'?0:1,'Instrument query must be unambiguous');
  if(target.center){
    assert.equal(actual.pathname,'/market-lab/charts/','Embedded charts must retain their canonical price route');
    assert.deepEqual([...actual.searchParams].sort(),[...new URL(instrumentUrl(target)).searchParams].sort(),'Embedded instrument query contains stale asset state');
  }else{
    for(const [key,fallback]of [['granularity','daily'],['type','line'],['axis','log']])
      assert.equal(actual.searchParams.get(key)||fallback,requested.searchParams.get(key)||fallback,'Presentation query changed: '+key);
    assert.equal(actual.searchParams.has('region'),false,'Native instrument cannot retain a housing region');
  }
  assert.equal(state.boot,'ready');assert.equal(state.bootHidden,true);
  assert.equal(state.blockedContent,false);
  assert.deepEqual([state.shell,state.page],['chart','outlook']);
  assert.equal(state.primaryCount,1,'Exactly one painted primary price chart is required');
  if(target.center){
    assert.equal(state.center,target.center);assert.equal(state.controls,'ready');assert.equal(state.frameCount,1);
    assert.equal(state.chart.ownerSymbol,spec.symbol,'The painted frame chart must belong to the selected instrument');
    assert.equal(new URL(state.frame.url).origin,origin,'Embedded document must keep the published origin');
    assert.equal(state.frame.url,state.frame.source,'The selected iframe document has not committed');
    assert.ok(state.rangeLabel?.startsWith(spec.symbol+' /'),'Outer chart controls still belong to another instrument');
    assert.ok(state.nativeActions.every(node=>node.hidden&&node.disabled&&!node.painted),'Ancestor native asset actions remain exposed over the embedded chart');
    assert.ok(state.frame.documentWidth<=state.frame.width+1,'Embedded document overflows');
  }else{
    assert.equal(state.symbol,spec.symbol);assert.equal(state.center,null);assert.equal(state.frameCount,0);
    assert.equal(state.chart.id,target.id,'Painted native chart belongs to the wrong controller');
    if(spec.symbol!=='BTCUSD')assert.equal(state.chart.dataset.product,target.product,'Native controller contains another instrument’s observations');
  }
  assert.ok((state.chart.pathCount>0||state.chart.candleCount>0)&&!state.chart.invalidPath&&!state.chart.invalidCandle,'Actual SVG price paths or candles must be finite and present');
  assert.ok(state.chart.observedCount>0,'The displayed chart must contain actual observations');
  if(!target.center)assert.deepEqual([state.chart.dataset.interval,state.chart.dataset.chartType],[requested.searchParams.get('granularity')||'daily',requested.searchParams.get('type')||'line']);
  assert.equal(state.priceDestinations.length,1,'The current instrument must retain one price destination');
  assert.ok(state.priceDestinations.every(node=>['A','BUTTON'].includes(node.tag)&&node.current==='page'&&!node.disabled),'The current price destination must remain selected and available');
  for(const href of state.priceLinks){const link=new URL(href);assert.equal(link.origin,origin);
    assert.equal(link.searchParams.get('symbol')||'BTCUSD',spec.symbol,'Price navigation link lost the selected instrument');
    assert.equal(link.pathname,target.center?'/market-lab/charts/':'/');
    if(target.region)assert.equal(link.searchParams.get('region'),target.region,'Price link lost the selected housing region');}
  assert.deepEqual(Object.values(state.ownerCounts),[1,1,1,1],'The four workbench owners must remain unique');
  assert.deepEqual(state.nav,['outlook','market-us','evidence','data','ipo','relay']);
  assert.ok(Math.max(state.rootWidth,state.bodyWidth)<=spec.width+1,'Page overflows the viewport');
  const inside=(box,label)=>assert.ok(box?.painted&&box.width>0&&box.height>0&&box.left>=-1&&box.right<=spec.width+1&&box.top>=-1&&box.bottom<=spec.height+1,label+' exceeds or is absent from the viewport');
  inside(state.top,'Top controls');inside(state.bottom,'Bottom controls');inside(state.chart.allocation,'Price plot');inside(state.chart.box,'Price SVG');
  // A persistent source-status notice legitimately occupies space on a short
  // screen. Require all remaining height, rather than a viewport percentage
  // that would mistake a visible, correctly disclosed fetch failure for a gap.
  let plotTop=state.top.bottom;
  if(state.refreshNotice?.painted){
    inside(state.refreshNotice,'Source status notice');
    assert.ok(state.refreshNotice.top>=state.top.bottom-1&&state.refreshNotice.bottom<=state.chart.allocation.top+1,'Source status notice overlaps controls or price plot');
    plotTop=state.refreshNotice.bottom;
  }
  assert.ok(state.chart.allocation.top>=plotTop-1&&state.chart.allocation.top<=plotTop+5&&
    state.chart.allocation.bottom>=state.bottom.top-5&&state.chart.allocation.bottom<=state.bottom.top+1,
    'Price plot must fill the remaining viewport between the source notice and fixed controls');
  inside(state.chart.renderAllocation,'Rendered price allocation');
  for(const dimension of ['width','height'])assert.ok(Math.abs(state.chart.box[dimension]-state.chart.renderAllocation[dimension])<=1,'Price SVG must fill its actual allocated '+dimension);
  assert.ok(state.chart.box.height>=state.chart.allocation.height*.75,'The active price chart must fill the outer price allocation');
  const vb=state.chart.viewBox?.trim().split(/\s+/).map(Number);
  assert.ok(vb?.length===4&&vb.every(Number.isFinite)&&Math.abs(vb[3]-state.chart.box.height)<=1&&Math.abs(vb[2]-state.chart.box.width)<=1,'SVG viewBox must remain pixel-sized');
  const axes=['plotLeft','plotRight','plotTop','priceBottom','timeAxisTop'].map(key=>Number(state.chart.dataset[key]));
  assert.ok(axes.every(Number.isFinite),'Price/time axis geometry must be available');
  const [left,right,top,priceBottom,timeTop]=axes;
  assert.ok(left>=0&&right>left&&right<vb[2]&&top>=0&&priceBottom>top&&timeTop>=priceBottom&&timeTop<vb[3],
    'Price/time axes must stay inside the SVG and keep separate space from the plot');
  assert.ok(state.chart.allocation.top>=state.top.bottom-1&&state.chart.allocation.bottom<=state.bottom.top+1,'Controls overlap the price plot');
  if(spec.width>620){
    inside(state.left,'Left rail');inside(state.right,'Right rail');
    assert.ok(Math.abs(state.left.width-52)<1&&Math.abs(state.right.width-45)<1,'Desktop rail widths must remain 52px / 45px');
    assert.ok(state.chart.allocation.left>=state.left.right-1&&state.chart.allocation.right<=state.right.left+1,'Plot overlaps the side rails');
  }else{assert.equal(state.left.painted,false);assert.equal(state.right.painted,false);}
  assert.equal(state.top.height,spec.width>620?38:spec.width<=390?92:48,'The top controls must retain their fixed-height row layout');
  if(spec.width<=390){assert.equal(state.headingLayout,'two-row');assert.ok(state.headingScroll.width<=state.headingScroll.client,'Narrow primary controls cannot require horizontal scrolling');}
  if(target.center){inside(state.frame.box,'Active iframe');assert.ok(Math.abs(state.frame.box.width-state.frame.width)<=1&&Math.abs(state.frame.box.height-state.frame.height)<=1,'Iframe coordinates must map one-to-one');}
  assert.deepEqual(state.cspViolations,[],'Actual document emitted a CSP violation');
}
async function click(cdp,selector){
  if(await evaluate(cdp,s=>Boolean(document.querySelector(s)?.closest('.shell-feature-panel[hidden]')),selector)){
    await click(cdp,'#atlas-shell-features-toggle');await settled(cdp);
  }
  const point=await evaluate(cdp,selector=>{
    const node=document.querySelector(selector);if(!node||node.disabled)throw new Error('Missing or disabled native target '+selector);
    const b=node.getBoundingClientRect(),x=b.left+b.width/2,y=b.top+b.height/2,hit=document.elementFromPoint(x,y);
    if(!b.width||!b.height||b.left<0||b.right>innerWidth||b.top<0||b.bottom>innerHeight||!hit||!(node===hit||node.contains(hit)))throw new Error('Native target is clipped or occluded '+selector);
    return {x,y};
  },selector);
  for(const type of ['mouseMoved','mousePressed','mouseReleased'])await cdp.send('Input.dispatchMouseEvent',{type,...point,...(type==='mouseMoved'?{}:{button:'left',clickCount:1})});
}
async function ready(cdp,spec){
  await until(async()=>{
    const state=await evaluate(cdp,inspectPage);if(state?.boot==='error')throw new Error('Published app entered boot error');
    return state?.boot==='ready'&&state.chart?.observedCount>0&&(state.chart.pathCount>0||state.chart.candleCount>0)&&
      (spec.center?state.chart.ownerSymbol===spec.symbol&&state.controls==='ready'&&state.rangeLabel?.startsWith(spec.symbol+' /')
        :!state.center&&state.symbol===spec.symbol&&state.chart.id===spec.id);
  },'actual published chart '+spec.symbol);
  await settled(cdp);const state=await evaluate(cdp,inspectPage);validatePage(state,spec);return state;
}
async function selectSymbol(cdp,symbol){
  await click(cdp,'.atlas-canvas-heading .symbol-selector-trigger');
  await until(()=>evaluate(cdp,()=>document.querySelector('#symbol-search-dialog')?.open),'native symbol search',5000);
  await click(cdp,'#symbol-search-dialog input');
  await cdp.send('Input.insertText',{text:symbol});await settled(cdp);
  await click(cdp,'#symbol-option-'+symbol);
}
async function verifyZoom(cdp,spec,receipt){
  let context=cdp,parentPoint=async point=>point;
  if(spec.center){
    const state=await evaluate(cdp,inspectPage),tree=await cdp.send('Page.getFrameTree');
    const matches=(tree.frameTree.childFrames||[]).filter(node=>node.frame.url===state.frame.url);
    assert.equal(matches.length,1,'Exactly one same-origin frame owns the zoom target');
    const world=await cdp.send('Page.createIsolatedWorld',{frameId:matches[0].frame.id,worldName:'atlas-published-origin-zoom'});
    context={send:(method,params={})=>cdp.send(method,method==='Runtime.evaluate'?{...params,contextId:world.executionContextId}:params)};
    parentPoint=async point=>{
      const current=await evaluate(cdp,inspectPage);validatePage(current,spec);
      return {x:current.frame.box.left+point.x,y:current.frame.box.top+point.y};
    };
  }
  await verifyChartZoomBrowser({cdp,context,parentPoint,receipt,evaluate,until,settled,
    svgSelector:spec.center?'.rsi-chart-canvas > svg':'#'+spec.id,allocationSelector:spec.center?'.rsi-chart-canvas':'.atlas-plot',label:spec.symbol});
}
async function screenshot(cdp,name,receipt){
  const result=await cdp.send('Page.captureScreenshot',{format:'png',fromSurface:true,captureBeyondViewport:false});
  const bytes=Buffer.from(result.data,'base64');assert.ok(bytes.length>0,'Native screenshot is empty');
  await writeFile(resolve(out,name),bytes);
  const evidence=emitBrowserEvidenceChunks('ETH_BROWSER_IMAGE_CHUNK',bytes,{name:'published-origin/'+name});
  await drainVerificationOutput();receipt.screenshots.push(evidence);
}
async function runCase(spec,debugBase){
  const receipt={...spec,status:'RUNNING',startedAt:new Date().toISOString(),screenshots:[],runtimeErrors:[],consoleErrors:[],securityLogs:[],responses:[],coreResponses:[],resourceErrors:[]};
  report.cases.push(receipt);let cdp,targetId,browserContextId;
  try{
    checkpoint();({browserContextId}=await browser.send('Target.createBrowserContext',{}));
    ({targetId}=await browser.send('Target.createTarget',{url:'about:blank',browserContextId}));receipt.browserContextId=browserContextId;receipt.targetId=targetId;
    const target=await until(async()=>{const response=await fetch(debugBase+'/json/list',{signal:AbortSignal.timeout(5000)});const targets=await response.json();return targets.find(item=>item.id===targetId&&item.webSocketDebuggerUrl);},'page CDP target',15000);
    cdp=await Cdp.connect(target.webSocketDebuggerUrl);const requests=new Map();
    cdp.on('Runtime.exceptionThrown',event=>receipt.runtimeErrors.push(event.exceptionDetails));
    cdp.on('Runtime.consoleAPICalled',event=>{if(event.type==='error')receipt.consoleErrors.push(event.args.map(arg=>String(arg.value??arg.description??arg.type)).join(' ').slice(0,4000));});
    cdp.on('Log.entryAdded',({entry})=>{if(entry.source==='security')receipt.securityLogs.push({level:entry.level,text:entry.text,url:entry.url});});
    cdp.on('Network.requestWillBeSent',event=>requests.set(event.requestId,{url:event.request.url,type:event.type,frameId:event.frameId}));
    cdp.on('Network.responseReceived',event=>{
      if(new URL(event.response.url).origin===origin)receipt.coreResponses.push({url:event.response.url,type:event.type,status:event.response.status,mimeType:event.response.mimeType,headers:headersOf(event.response.headers)});
      if(event.type==='Document')receipt.responses.push({url:event.response.url,status:event.response.status,frameId:event.frameId,headers:headersOf(event.response.headers)});
      if(event.response.status>=400)receipt.resourceErrors.push({url:event.response.url,type:event.type,status:event.response.status});
    });
    cdp.on('Network.loadingFailed',event=>receipt.resourceErrors.push({...requests.get(event.requestId),error:event.errorText,blockedReason:event.blockedReason||null,canceled:event.canceled||false}));
    for(const method of ['Page.enable','Runtime.enable','Network.enable','Log.enable'])await cdp.send(method);
    await cdp.send('Page.addScriptToEvaluateOnNewDocument',{source:"window.__atlasPublishedSmoke={cspViolations:[]};document.addEventListener('securitypolicyviolation',e=>window.__atlasPublishedSmoke.cspViolations.push({directive:e.effectiveDirective,blockedURI:e.blockedURI,disposition:e.disposition,sourceFile:e.sourceFile,lineNumber:e.lineNumber}));"});
    await cdp.send('Network.setCacheDisabled',{cacheDisabled:true});
    await cdp.send('Emulation.setDeviceMetricsOverride',{width:spec.width,height:spec.height,deviceScaleFactor:1,mobile:spec.width<=620});
    await cdp.send('Emulation.setTouchEmulationEnabled',{enabled:spec.width<=620,maxTouchPoints:1});
    await cdp.send('Emulation.setEmulatedMedia',{features:[{name:'prefers-color-scheme',value:'dark'},{name:'prefers-reduced-motion',value:'reduce'}]});
    const navigation=await cdp.send('Page.navigate',{url:spec.url});assert.equal(navigation.errorText,undefined,'HTTPS navigation failed');
    // Navigation can resolve before the new root or active iframe commits.
    receipt.initial=await ready(cdp,spec);
    const tree=await cdp.send('Page.getFrameTree'),frameId=tree.frameTree.frame.id;
    receipt.document=receipt.responses.findLast(item=>item.frameId===frameId);
    assert.ok(receipt.document,'Actual main document response was not observed');assert.equal(receipt.document.url,spec.url);assert.equal(receipt.document.status,200);
    assert.match(receipt.document.headers['content-type']||'',/^text\/html\b/i);
    assert.equal(receipt.document.headers['x-content-type-options'],'nosniff');
    assert.equal(receipt.document.headers['referrer-policy'],'strict-origin-when-cross-origin');
    await screenshot(cdp,spec.name+'.png',receipt);
    if(spec.zoom){await verifyZoom(cdp,spec,receipt);receipt.afterZoom=await ready(cdp,spec);await screenshot(cdp,spec.name+'-zoom.png',receipt);}
    if(spec.roundTrip){
      receipt.transitions=[];
      for(const symbol of ['TQQQ','HYPE',spec.symbol]){
        const instrument=instruments.find(item=>item.symbol===symbol),next={...spec,...instrument,symbol,
          url:symbol===spec.symbol?receipt.initial.url:instrumentUrl(instrument)};
        await selectSymbol(cdp,symbol);const state=await ready(cdp,next);receipt.transitions.push({symbol,state});
        await screenshot(cdp,spec.name+'-switch-'+symbol.toLowerCase()+'.png',receipt);
      }
      assert.deepEqual(receipt.transitions.at(-1).state.nativeActions,receipt.initial.nativeActions,'Returning to the native asset must restore its exact header actions');
    }
    if(spec.width<=620&&['BTCUSD','ETHUSD','TQQQ'].includes(spec.symbol)){
      await click(cdp,'#mobile-details-toggle');
      await until(()=>evaluate(cdp,()=>document.querySelector('.workbench-rail')?.dataset.mobileOpen==='true'),'native mobile details tray',5000);
      await settled(cdp);receipt.mobileTray=await evaluate(cdp,inspectPage);const b=receipt.mobileTray.right;
      assert.ok(b.painted&&b.left>=0&&b.right<=spec.width&&b.top>=0&&b.bottom<=spec.height,'Mobile tray must be fully inside the viewport');
      assert.equal(receipt.mobileTray.primaryCount,1,'Opening the tray must not create another price chart');
      await screenshot(cdp,spec.name+'-details.png',receipt);
      await click(cdp,'.workbench-rail .mobile-tray-heading button');
      await until(()=>evaluate(cdp,()=>!document.querySelector('.workbench-rail')?.hasAttribute('data-mobile-open')),'native mobile tray close',5000);
      await settled(cdp);
    }
    receipt.final=await evaluate(cdp,inspectPage);validatePage(receipt.final,spec);
    receipt.coreResourceErrors=receipt.resourceErrors.filter(item=>{try{return new URL(item.url).origin===origin;}catch{return true;}});
    receipt.externalResourceErrors=receipt.resourceErrors.filter(item=>!receipt.coreResourceErrors.includes(item));
    assert.deepEqual(receipt.runtimeErrors,[]);assert.deepEqual(receipt.consoleErrors,[]);
    assert.deepEqual(receipt.coreResourceErrors,[],'Published application resource failed');
    assert.deepEqual(receipt.securityLogs.filter(item=>item.level==='error'),[],'Browser reported a security error');
    receipt.status='PASS';
  }catch(error){receipt.status='FAIL';receipt.error=errorText(error);
    if(cdp)try{await screenshot(cdp,spec.name+'-failure.png',receipt);}catch(failure){receipt.screenshotError=errorText(failure);}
  }finally{
    cdp?.close();
    for(const [method,params]of [[targetId&&'Target.closeTarget',{targetId}],[browserContextId&&'Target.disposeBrowserContext',{browserContextId}]])if(method)try{await browser.send(method,params);}
    catch(error){receipt.status='FAIL';receipt.cleanupError=[receipt.cleanupError,errorText(error)].filter(Boolean).join('\n');}
    receipt.completedAt=new Date().toISOString();if(receipt.status!=='PASS')report.failures.push({case:spec.name,error:receipt.error,cleanupError:receipt.cleanupError});
    console.log('ATLAS_PUBLISHED_ORIGIN_CASE '+JSON.stringify({name:spec.name,status:receipt.status,error:receipt.error,cleanupError:receipt.cleanupError}));
  }
}
async function main(){
  await mkdir(out,{recursive:true});
  await writeFile(resolve(root,'build/cloudflare-verification.json'),JSON.stringify({schemaVersion:1,kind:report.kind,status:'DIAGNOSTIC_ONLY',qualifiesFullVerification:false,startedAt:report.startedAt})+'\n');
  const args=process.argv.slice(2),values=new Map();
  for(const arg of args){const match=/^--(expected-source|expected-manifest)=(.+)$/.exec(arg);assert.ok(match&&!values.has(match[1]),'Use unique --expected-source and --expected-manifest');values.set(match[1],match[2]);}
  expectedSource=values.get('expected-source');expectedManifest=values.get('expected-manifest');
  assert.match(expectedSource||'',/^[a-f0-9]{40}$/);assert.match(expectedManifest||'',/^[a-f0-9]{64}$/);assert.equal(values.size,2);
  const git=args=>execFileSync('git',args,{cwd:root,encoding:'utf8'}).trim();
  assert.equal(git(['status','--porcelain','--untracked-files=no']),'','Inspector tracked source must be clean');
  assert.equal(git(['ls-files','--error-unmatch','scripts/verify-published-origin-browser.mjs']),'scripts/verify-published-origin-browser.mjs');
  report.inspector={sourceCommit:git(['rev-parse','HEAD']),sourceTree:git(['rev-parse','HEAD^{tree}']),
    scriptSha256:sha(await readFile(fileURLToPath(import.meta.url))),buildId:process.env.WORKERS_CI_BUILD_UUID,branch:process.env.WORKERS_CI_BRANCH};
  assert.equal(report.inspector.sourceCommit,expectedSource,'Inspector HEAD must equal explicitly expected deployed source');
  assert.equal(process.env.WORKERS_CI_COMMIT_SHA,expectedSource,'Diagnostic Build checkout must equal expected source');
  assert.match(report.inspector.buildId||'',/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/);assert.ok(report.inspector.branch);
  report.expected={sourceCommit:expectedSource,manifestSha256:expectedManifest};
  report.publicationBefore=await publication();
  const runtime=await bootstrapCloudflareBuild({root,timeoutMs:180000,log:line=>process.stdout.write(line)});
  report.runtime=runtime.receipt;controller.signal.addEventListener('abort',()=>chrome?.kill('SIGTERM'),{once:true});removeSignals=installVerificationSignalHandlers(controller);
  deadlineTimer=setTimeout(()=>{controller.abort(new Error('Published-origin diagnostic exceeded fifteen browser minutes'));chrome?.kill('SIGTERM');},900000);
  profile=await mkdtemp(resolve(tmpdir(),'atlas-published-origin-'));checkpoint();
  chrome=spawn(runtime.environment.ATLAS_BROWSER_PATH,['--headless=new','--no-sandbox','--disable-dev-shm-usage','--no-first-run',
    '--no-default-browser-check','--disable-component-update','--disable-sync','--remote-debugging-port=0','--user-data-dir='+profile,'about:blank'],
    {env:{...process.env,...runtime.environment},stdio:['ignore','ignore','pipe']});
  let spawnError;chrome.once('error',error=>{spawnError=error;});chrome.stderr.on('data',bytes=>{chromeStderr=(chromeStderr+bytes.toString()).slice(-12000);});
  const active=await until(async()=>{if(spawnError)throw spawnError;if(chrome.exitCode!==null)throw new Error('Chrome exited: '+chromeStderr);
    try{return (await readFile(resolve(profile,'DevToolsActivePort'),'utf8')).trim().split('\n');}catch{return null;}},'Chrome DevToolsActivePort',20000);
  const debugBase='http://127.0.0.1:'+active[0];browser=await Cdp.connect('ws://127.0.0.1:'+active[0]+active[1]);report.browser=await browser.send('Browser.getVersion');
  for(const spec of publishedOriginCases){checkpoint();await runCase(spec,debugBase);}
  report.publicationAfter=await publication();assert.equal(report.publicationAfter.rawSha256,report.publicationBefore.rawSha256);
  assert.equal(report.publicationAfter.bytes,report.publicationBefore.bytes);
  assert.equal(git(['rev-parse','HEAD']),expectedSource);assert.equal(git(['rev-parse','HEAD^{tree}']),report.inspector.sourceTree);
  assert.equal(git(['status','--porcelain','--untracked-files=no']),'','Inspector source changed during the smoke');
  assert.equal(report.cases.length,publishedOriginCases.length);assert.equal(new Set(report.cases.map(item=>item.browserContextId)).size,publishedOriginCases.length,'Each viewport and symbol must use a fresh browser context');
  assert.equal(report.failures.length,0,'Published-origin browser smoke failed');report.status='PASS';
}
async function runDiagnostic(){
try{await main();}catch(error){report.status='FAIL';report.error=errorText(error);process.exitCode=1;}
finally{
  if(report.publicationBefore&&!report.publicationAfter&&!controller.signal.aborted)try{report.publicationAfter=await publication();}catch(error){report.status='FAIL';report.publicationAfterError=errorText(error);}
  clearTimeout(deadlineTimer);
  try{if(browser){try{await browser.send('Browser.close');}catch{}browser.close();}
    if(chrome&&chrome.exitCode===null&&chrome.signalCode===null){chrome.kill('SIGTERM');await Promise.race([new Promise(r=>chrome.once('close',r)),delay(1500)]);
      if(chrome.exitCode===null&&chrome.signalCode===null){chrome.kill('SIGKILL');await Promise.race([new Promise(r=>chrome.once('close',r)),delay(1500)]);}
      assert.ok(chrome.exitCode!==null||chrome.signalCode!==null,'Chrome did not stop during bounded cleanup');
    }
    if(profile)await rm(profile,{recursive:true,force:true});
  }catch(error){report.status='FAIL';report.cleanupError=errorText(error);}
  if(controller.signal.aborted){report.status='FAIL';report.cancellation=errorText(controller.signal.reason);}
  removeSignals?.();report.completedAt=new Date().toISOString();report.chromeStderrTail=chromeStderr.slice(-3000);
  if(report.status!=='PASS')process.exitCode=1;
  try{
    await mkdir(out,{recursive:true});const bytes=Buffer.from(JSON.stringify(report,null,2)+'\n');await writeFile(resolve(out,'report.json'),bytes);
    const evidence=emitCompressedBrowserReport(bytes,{name:'published-origin/report.json'});
    console.log('ATLAS_PUBLISHED_ORIGIN_SMOKE '+JSON.stringify({status:report.status,qualifiesFullVerification:false,
      expected:report.expected,inspector:report.inspector,cases:report.cases.map(item=>({name:item.name,status:item.status})),report:evidence,error:report.error}));
    await drainVerificationOutput();
  }catch(error){process.exitCode=1;report.status='FAIL';report.transportError=errorText(error);
    await writeFile(resolve(out,'report.json'),JSON.stringify(report,null,2)+'\n').catch(()=>{});console.error('Published-origin evidence transport failed: '+errorText(error));}
}
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))await runDiagnostic();
