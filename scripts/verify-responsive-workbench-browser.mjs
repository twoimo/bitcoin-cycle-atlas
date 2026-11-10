#!/usr/bin/env node
/**
 * Independent, bounded responsive verification for the native chart workbench
 * (?legacy=1&page=outlook).
 *
 * Contract under test:
 *   phone   <=620 : one 48px heading row (bottom anchored by default), the
 *                   original secondary controls collapsed inside the heading's
 *                   own .shell-feature-panel, and the real footer
 *                   (.workbench-bottom-bar) reachable as an info sheet only;
 *   tablet 621-959: chart details open as an overlay, never a docked column;
 *   desktop >=960 : the right rail returns as a real split column;
 *   plus: original node identity survives phone -> desktop -> phone resizing,
 *   footer/control preservation, comparison navigation and back, no horizontal
 *   overflow, >=44px touch targets, and zero runtime errors.
 *
 * This script is self-contained. It launches its own Chrome process with its
 * own debugging port and throwaway profile, and it only talks to the owned
 * local base URL. It never attaches to the user's browser or Aside tabs. The
 * launch/CDP sequence reuses the proven path from
 * scripts/verify-eth-candidate-browser.mjs + scripts/verify-native-browser-suite.mjs
 * (headless=new, --remote-debugging-port=0, mkdtemp profile, DevToolsActivePort
 * handshake) without importing or modifying either file.
 *
 * Usage:
 *   node scripts/verify-responsive-workbench-browser.mjs
 * Env:
 *   ATLAS_RESPONSIVE_BASE_URL  default http://127.0.0.1:8161/bitcoin-cycle-atlas/
 *   ATLAS_RESPONSIVE_QUERY     default ?legacy=1&page=outlook
 *   ATLAS_RESPONSIVE_OUT       default build/responsive-workbench
 *   ATLAS_RESPONSIVE_HEADING   bottom|top (phone heading anchor; default bottom)
 *   ATLAS_BROWSER_PATH         Chrome/Chromium override
 * Exit: 0 passed, 1 failed, 2 blocked (no browser or target unreachable).
 */
import assert from 'node:assert/strict';
import {spawn,execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {mkdir,mkdtemp,readFile,rm,writeFile} from 'node:fs/promises';
import {resolve,relative} from 'node:path';
import {tmpdir} from 'node:os';
import {fileURLToPath} from 'node:url';

const root=resolve(fileURLToPath(new URL('..',import.meta.url)));
const out=resolve(root,process.env.ATLAS_RESPONSIVE_OUT??'build/responsive-workbench');
const base=(process.env.ATLAS_RESPONSIVE_BASE_URL??'http://127.0.0.1:8161/bitcoin-cycle-atlas/').replace(/\/?$/,'/');
const query=process.env.ATLAS_RESPONSIVE_QUERY??'?legacy=1&page=outlook';
const headingAnchor=(process.env.ATLAS_RESPONSIVE_HEADING??'bottom').toLowerCase();
assert.ok(['bottom','top'].includes(headingAnchor),'ATLAS_RESPONSIVE_HEADING must be bottom or top');
const targetUrl=base+query;
const MIN_TOUCH=44;

const viewports=Object.freeze([
  {label:'phone-320x568',width:320,height:568,touch:true},
  {label:'phone-390x844',width:390,height:844,touch:true},
  {label:'phone-456x800',width:456,height:800,touch:true},
  {label:'phone-620x900',width:620,height:900,touch:true},
  {label:'tablet-768x1024',width:768,height:1024,touch:true},
  {label:'desktop-1024x768',width:1024,height:768,touch:false},
  {label:'desktop-1440x900',width:1440,height:900,touch:false},
  {label:'phone-320x430-short',width:320,height:430,touch:true},
  {label:'phone-390x430-short',width:390,height:430,touch:true},
  {label:'tablet-900x430-short',width:900,height:430,touch:true},
]);
const band=width=>width<=620?'phone':width<=959?'tablet':'desktop';

const report={schemaVersion:1,kind:'atlas-responsive-workbench-browser',status:'running',startedAt:new Date().toISOString(),
  base,query,url:targetUrl,headingAnchor,viewports:viewports.map(v=>({...v,band:band(v.width)})),
  cases:[],failures:[],screenshots:[],
  scope:'Independent headless Chrome process against the owned local build. No Aside tab, user browser profile, deployment, Safari or physical-device claim.'};

let chrome=null,cdp=null,profile=null,browserSocket=null,chromeStderr='';
let currentRuntimeErrors=null;

const delay=ms=>new Promise(r=>setTimeout(r,ms));
const errorText=error=>error instanceof Error?(error.stack||error.message):String(error);
const hash=buffer=>createHash('sha256').update(buffer).digest('hex');

/* ---------------- CDP transport (same pattern as the existing harness) ---- */
class Cdp {
  constructor(ws){this.ws=ws;this.next=1;this.pending=new Map();this.listeners=new Map();
    ws.addEventListener('message',event=>{
      let message;try{message=JSON.parse(String(event.data));}catch{return;}
      if(message.id){const call=this.pending.get(message.id);if(!call)return;clearTimeout(call.timer);this.pending.delete(message.id);
        if(message.error)call.reject(new Error(call.method+': '+JSON.stringify(message.error)));else call.resolve(message.result||{});
      }else for(const listener of this.listeners.get(message.method)||[])listener(message.params||{});
    });
    ws.addEventListener('close',()=>this.fail(new Error('CDP socket closed')));
    ws.addEventListener('error',()=>this.fail(new Error('CDP socket error')));
  }
  static async connect(url){
    const ws=new WebSocket(url);
    await new Promise((accept,reject)=>{
      const timer=setTimeout(()=>{ws.close();reject(new Error('CDP connection timeout'));},15000);
      ws.addEventListener('open',()=>{clearTimeout(timer);accept();},{once:true});
      ws.addEventListener('error',()=>{clearTimeout(timer);reject(new Error('Cannot connect CDP'));},{once:true});
    });
    return new Cdp(ws);
  }
  on(method,fn){const list=this.listeners.get(method)||[];list.push(fn);this.listeners.set(method,list);}
  fail(error){for(const p of this.pending.values()){clearTimeout(p.timer);p.reject(error);}this.pending.clear();}
  send(method,params={}){
    const id=this.next++;
    return new Promise((resolve,reject)=>{
      const timer=setTimeout(()=>{this.pending.delete(id);reject(new Error('CDP command timeout: '+method));},30000);
      this.pending.set(id,{resolve,reject,timer,method});
      try{this.ws.send(JSON.stringify({id,method,params}));}catch(error){clearTimeout(timer);this.pending.delete(id);reject(error);}
    });
  }
  close(){try{this.ws.close();}catch{}}
}

async function until(fn,label,timeout=45000){
  const deadline=Date.now()+timeout;let last=null;
  while(Date.now()<deadline){
    try{const value=await fn();if(value)return value;last=null;}catch(error){last=error;}
    await delay(100);
  }
  throw new Error('Timed out: '+label+(last?'; last error: '+last.message:''));
}

async function evaluate(context,fn,...args){
  const expression='('+fn.toString()+')('+args.map(a=>JSON.stringify(a)).join(',')+')';
  let result;
  try{result=await context.send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});}
  catch(error){throw new Error('Browser evaluation transport failed in '+(fn.name||fn.toString().slice(0,120))+': '+error.message,{cause:error});}
  if(result.exceptionDetails)throw new Error('Browser evaluation failed: '+(result.exceptionDetails.exception?.description??JSON.stringify(result.exceptionDetails)));
  return result.result.value;
}

async function settled(target=cdp){
  await evaluate(target,async()=>{await document.fonts.ready;});
  await evaluate(target,async()=>{await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));});
  await delay(120);
}

async function shot(name){
  const result=await cdp.send('Page.captureScreenshot',{format:'png',fromSurface:true,captureBeyondViewport:false});
  const bytes=Buffer.from(result.data,'base64');
  await writeFile(resolve(out,name),bytes);
  const entry={file:name,bytes:bytes.length,sha256:hash(bytes)};
  report.screenshots.push(entry);
  return entry;
}

/* ---------------- native pointer/keyboard -------------------------------- */
async function readTarget(selector){
  return evaluate(cdp,s=>{
    const el=document.querySelector(s);
    if(!el)throw new Error('Missing interactive target '+s);
    const box=el.getBoundingClientRect(),style=getComputedStyle(el);
    const viewport={width:innerWidth,height:innerHeight};
    const x=Math.min(Math.max(box.left+Math.min(box.width/2,24),1),viewport.width-1);
    const y=Math.min(Math.max(box.top+Math.min(box.height/2,18),1),viewport.height-1);
    const hit=document.elementFromPoint(x,y);
    return {selector:s,box:{left:box.left,right:box.right,top:box.top,bottom:box.bottom,width:box.width,height:box.height},
      x,y,viewport,disabled:Boolean(el.disabled),tag:el.tagName,
      painted:el.checkVisibility({checkOpacity:true,checkVisibilityCSS:true}),
      topmost:Boolean(hit&&(hit===el||el.contains(hit))),
      label:(el.getAttribute('aria-label')||el.textContent||'').trim().slice(0,80),
      expanded:el.getAttribute('aria-expanded'),controls:el.getAttribute('aria-controls'),
      outline:style.outlineStyle,outlineWidth:parseFloat(style.outlineWidth)};
  },selector);
}

function assertTarget(target,label,{touch=false}={}){
  assert.ok(target.painted,'Target is not painted: '+label);
  assert.ok(target.topmost,'Target is occluded: '+label+' at '+target.x+','+target.y+' label='+target.label);
  assert.equal(target.disabled,false,'Target is disabled: '+label);
  assert.ok(target.box.width>0&&target.box.height>0,'Target has no hit area: '+label);
  assert.ok(target.box.left>=-1&&target.box.right<=target.viewport.width+1&&target.box.top>=-1&&target.box.bottom<=target.viewport.height+1,
    'Target exceeds its viewport: '+label+' '+JSON.stringify({box:target.box,viewport:target.viewport}));
  if(touch)assert.ok(target.box.width>=MIN_TOUCH-0.5&&target.box.height>=MIN_TOUCH-0.5,
    'Hit target below '+MIN_TOUCH+'px: '+label+' '+JSON.stringify({width:target.box.width,height:target.box.height}));
}

async function click(selector,{label=selector,touch=false}={}){
  const target=await readTarget(selector);
  assertTarget(target,label,{touch});
  await cdp.send('Input.dispatchMouseEvent',{type:'mouseMoved',x:target.x,y:target.y});
  await cdp.send('Input.dispatchMouseEvent',{type:'mousePressed',button:'left',clickCount:1,x:target.x,y:target.y});
  await cdp.send('Input.dispatchMouseEvent',{type:'mouseReleased',button:'left',clickCount:1,x:target.x,y:target.y});
  await settled(cdp);
  return target;
}

async function press(name,code){
  for(const type of ['keyDown','keyUp'])await cdp.send('Input.dispatchKeyEvent',{type,key:name,code:name,
    windowsVirtualKeyCode:code,nativeVirtualKeyCode:code,...(type==='keyDown'&&name==='Enter'?{text:'\r',unmodifiedText:'\r'}:{})});
  await settled(cdp);
}
const pressEscape=()=>press('Escape',27);
const pressArrowDown=()=>press('ArrowDown',40);

/* ---------------- in-page probes ---------------------------------------- */
const probe=()=>({
  url:location.href,shell:document.body.dataset.shell??null,page:document.body.dataset.page??null,
  center:document.body.dataset.centerTool??null,headingMode:document.querySelector('.atlas-canvas-heading')?.dataset.mobileHeading??null,
  innerWidth,innerHeight,documentWidth:document.documentElement.scrollWidth,bodyWidth:document.body.scrollWidth,
  active:{tag:document.activeElement?.tagName??null,id:document.activeElement?.id??null,
    label:document.activeElement?.getAttribute?.('aria-label')??null},
});

/** Tags every interactive control in the shell regions with a JS property plus
 * an attribute. A clone copies the attribute but never the property, so a
 * property mismatch means the original node was re-created. */
function harvest(regions){
  window.__atlasResponsiveSeq=window.__atlasResponsiveSeq||0;
  const selector='button,select,input,textarea,a[href],[role="button"],[role="link"],summary,[tabindex]:not([tabindex="-1"])';
  const records=[],seen=new Set();
  for(const region of regions){
    const owner=document.querySelector(region);
    for(const el of owner?.querySelectorAll(selector)||[]){
      if(seen.has(el))continue;
      seen.add(el);
      if(el.closest('[data-shell-measuring="true"]'))continue;
      // These two disclosure-only buttons are created by the responsive owner,
      // not original source controls. Every original source node stays tagged.
      if(el.matches('.shell-feature-toggle,[data-shell-feature-close]'))continue;
      // cycle-period-comparison.js regenerates these readout descendants on
      // chart render. Their unchanged source values are asserted separately.
      if(el.closest('.cycle-reference-comparison'))continue;
      if(!el.__atlasResponsiveToken)el.__atlasResponsiveToken='rt'+(++window.__atlasResponsiveSeq);
      el.setAttribute('data-responsive-token',el.__atlasResponsiveToken);
      const box=el.getBoundingClientRect();
      records.push({token:el.__atlasResponsiveToken,id:el.id||null,tag:el.tagName,
        label:(el.getAttribute('aria-label')||el.textContent||'').trim().slice(0,60),
        insideHeading:Boolean(el.closest('.atlas-canvas-heading')),
        insideFeaturePanel:Boolean(el.closest('.shell-feature-panel')),
        insideFooter:Boolean(el.closest('.workbench-bottom-bar')),
        width:box.width,height:box.height,
        painted:el.checkVisibility({checkOpacity:true,checkVisibilityCSS:true})});
    }
  }
  return records;
}

function readRegistry(){
  const nodes=[...document.querySelectorAll('[data-responsive-token]')];
  const counts=new Map();
  for(const el of nodes){const token=el.getAttribute('data-responsive-token');counts.set(token,(counts.get(token)||0)+1);}
  return {total:counts.size,
    duplicates:[...counts].filter(([,count])=>count>1).map(([token,count])=>({token,count})),
    propertyMismatch:nodes.filter(el=>el.getAttribute('data-responsive-token')!==el.__atlasResponsiveToken).map(el=>el.getAttribute('data-responsive-token')),
    tokens:[...counts.keys()],
    inHeadingRow:[...document.querySelectorAll('.atlas-canvas-heading [data-responsive-token]')].filter(el=>!el.closest('.shell-feature-panel')).map(el=>el.getAttribute('data-responsive-token')),
    inFeaturePanel:[...document.querySelectorAll('.atlas-canvas-heading .shell-feature-panel [data-responsive-token]')].map(el=>el.getAttribute('data-responsive-token')),
    inFooter:[...document.querySelectorAll('.workbench-bottom-bar [data-responsive-token]')].map(el=>el.getAttribute('data-responsive-token'))};
}

function discoverSheetTrigger(){
  const footer=document.querySelector('.workbench-bottom-bar');
  if(!footer)return {found:false,reason:'no .workbench-bottom-bar'};
  for(const selector of ['#atlas-shell-footer-toggle','[data-shell-info-sheet-toggle]','[data-shell-footer-sheet-toggle]','#atlas-shell-info-sheet-toggle','#workbench-footer-toggle']){
    if(document.querySelector(selector))return {found:true,selector,strategy:'explicit'};
  }
  const ownsFooter=node=>{
    const id=node.getAttribute('aria-controls');
    if(!id)return false;
    const target=document.getElementById(id);
    return Boolean(target&&(target===footer||target.contains(footer)||footer.contains(target)));
  };
  const candidates=[...document.querySelectorAll('button,[role="button"],a[href]')].filter(ownsFooter);
  if(candidates.length===1){
    const node=candidates[0];
    if(!node.id)node.id='atlas-shell-footer-toggle';
    return {found:true,selector:'#'+node.id,strategy:'aria-controls'};
  }
  return {found:false,reason:'footer info-sheet trigger is not identifiable',candidateCount:candidates.length,
    candidates:candidates.map(node=>({id:node.id||null,label:(node.getAttribute('aria-label')||node.textContent||'').trim().slice(0,40),controls:node.getAttribute('aria-controls')}))};
}

function assertNoOverflow(state,label){
  assert.ok(state.documentWidth<=state.innerWidth+1,'Horizontal overflow: '+label+' document '+state.documentWidth+' > '+state.innerWidth);
  assert.ok(state.bodyWidth<=state.innerWidth+1,'Horizontal overflow: '+label+' body '+state.bodyWidth+' > '+state.innerWidth);
}

/* ---------------- checks -------------------------------------------------- */
async function waitForReady(){
  const ready=await until(()=>evaluate(cdp,()=>document.documentElement.dataset.boot==='error'?'error':document.readyState==='complete'&&document.documentElement.dataset.boot==='ready'&&
    Boolean(document.querySelector('.atlas-canvas-heading'))&&
    Boolean(document.querySelector('.workbench-bottom-bar'))&&
    Boolean(document.querySelector('.workbench-rail'))),'shell perimeter');
  assert.notEqual(ready,'error','Chart initialization failed: '+JSON.stringify(currentRuntimeErrors));
  await settled(cdp);
}

async function verifyPhoneHeading(receipt){
  const heading=await evaluate(cdp,()=>{
    const node=document.querySelector('.atlas-canvas-heading');
    if(!node)return null;
    const box=node.getBoundingClientRect(),style=getComputedStyle(node);
    const children=[...node.children].filter(child=>{
      const r=child.getBoundingClientRect();
      return r.width>0&&r.height>0&&getComputedStyle(child).display!=='none';
    });
    const centers=children.map(child=>{const r=child.getBoundingClientRect();return r.top+r.height/2;});
    return {mode:node.dataset.mobileHeading??null,
      box:{left:box.left,right:box.right,top:box.top,bottom:box.bottom,width:box.width,height:box.height},
      cssHeight:parseFloat(style.height),position:style.position,innerHeight,
      centerSpread:centers.length?Math.max(...centers)-Math.min(...centers):0,
      children:children.map(child=>{const r=child.getBoundingClientRect();return {id:child.id||null,
        className:String(child.className).slice(0,40),top:r.top,bottom:r.bottom,left:r.left,right:r.right,width:r.width,height:r.height,center:r.top+r.height/2};})};
  });
  assert.ok(heading,'Missing .atlas-canvas-heading on phone');
  receipt.heading=heading;
  assert.equal(heading.mode,'phone-dock','Phone heading must expose data-mobile-heading=phone-dock, observed '+(heading.mode??'none'));
  assert.ok(Math.abs(heading.box.height-48)<=1.5,'Phone heading must be one 48px row, measured '+heading.box.height.toFixed(1));
  assert.ok(heading.centerSpread<=2,'Phone heading controls wrapped: vertical center spread '+heading.centerSpread.toFixed(1)+'px');
  for(const child of heading.children)
    assert.ok(child.top>=heading.box.top-1.5&&child.bottom<=heading.box.bottom+1.5,'Heading child escapes the single row: '+JSON.stringify(child));
  if(headingAnchor==='bottom')assert.ok(heading.box.bottom>=heading.innerHeight-2,'Phone heading must sit on the bottom edge, bottom='+heading.box.bottom+' viewport='+heading.innerHeight);
  else assert.ok(heading.box.top<=2,'Phone heading must sit on the top edge, top='+heading.box.top);
  const small=heading.children.filter(item=>item.width<MIN_TOUCH-0.5||item.height<MIN_TOUCH-0.5)
    .map(item=>({id:item.id,className:item.className,width:item.width,height:item.height}));
  receipt.headingTargets=heading.children.map(item=>({id:item.id,width:item.width,height:item.height}));
  assert.deepEqual(small,[],'Phone heading controls below 44px: '+JSON.stringify(small));
}

async function verifyFeaturePanel(receipt){
  const structure=await evaluate(cdp,()=>{
    const heading=document.querySelector('.atlas-canvas-heading');
    const slot=heading?.querySelector('.shell-instrument-slot');
    const panel=heading?.querySelector('.shell-instrument-slot .shell-feature-panel');
    const actions=panel?.querySelector('.shell-feature-actions');
    const trigger=heading?.querySelector('#atlas-shell-features-toggle,.shell-feature-toggle')??null;
    if(trigger&&!trigger.id)trigger.id='atlas-shell-features-toggle';
    return {slot:Boolean(slot),panel:Boolean(panel),actions:Boolean(actions),
      panelHidden:panel?Boolean(panel.hidden):null,trigger:Boolean(trigger),
      triggerSelector:trigger?'#'+trigger.id:null,triggerExpanded:trigger?.getAttribute('aria-expanded')??null,
      panelInsideHeading:Boolean(panel&&heading.contains(panel)),
      panelInsideSlot:Boolean(panel&&slot&&slot.contains(panel)),
      controlsInPanel:actions?actions.querySelectorAll('button,select,input,a[href]').length:0,
      openPanels:document.querySelectorAll('.shell-feature-panel:not([hidden])').length};
  });
  receipt.featurePanel=structure;
  assert.ok(structure.slot,'Phone heading must retain .shell-instrument-slot');
  assert.ok(structure.panel,'Secondary controls must live in .shell-instrument-slot > .shell-feature-panel');
  assert.ok(structure.actions,'The feature panel must expose .shell-feature-actions');
  assert.ok(structure.panelInsideHeading&&structure.panelInsideSlot,'The feature panel must belong to the heading shell');
  assert.ok(structure.trigger,'Missing the shell feature disclosure trigger');
  assert.equal(structure.panelHidden,true,'The feature panel must start collapsed');
  assert.equal(structure.triggerExpanded,'false','The collapsed trigger must report aria-expanded=false');
  assert.ok(structure.controlsInPanel>0,'The feature panel must own the original secondary controls');

  await click(structure.triggerSelector,{label:'feature disclosure trigger',touch:true});
  const opened=await evaluate(cdp,()=>{
    const panel=document.querySelector('.atlas-canvas-heading .shell-feature-panel');
    const trigger=document.querySelector('#atlas-shell-features-toggle,.shell-feature-toggle');
    const controls=[...panel.querySelectorAll('button,select,input,a[href]')]
      .filter(node=>node.checkVisibility({checkOpacity:true,checkVisibilityCSS:true}));
    const box=panel.getBoundingClientRect();
    return {hidden:panel.hidden,expanded:trigger.getAttribute('aria-expanded'),
      box:{left:box.left,right:box.right,top:box.top,bottom:box.bottom,width:box.width,height:box.height},
      viewport:{width:innerWidth,height:innerHeight},controlCount:controls.length,
      small:controls.map(node=>{const r=node.getBoundingClientRect();return {id:node.id||null,width:r.width,height:r.height};})
        .filter(item=>item.width<44-0.5||item.height<44-0.5),
      focusInside:panel.contains(document.activeElement)};
  });
  receipt.featurePanelOpen=opened;
  assert.equal(opened.hidden,false,'The feature panel did not open');
  assert.equal(opened.expanded,'true','The open trigger must report aria-expanded=true');
  assert.ok(opened.controlCount>0,'The open feature panel exposed no controls');
  assert.ok(opened.box.left>=-1&&opened.box.right<=opened.viewport.width+1&&opened.box.top>=-1&&opened.box.bottom<=opened.viewport.height+1,
    'The open feature panel escapes the viewport: '+JSON.stringify(opened.box));
  assert.deepEqual(opened.small,[],'Feature panel controls below 44px: '+JSON.stringify(opened.small));
  await shot(receipt.label+'-feature-panel-open.png');

  await pressEscape();
  const closed=await evaluate(cdp,()=>{
    const panel=document.querySelector('.atlas-canvas-heading .shell-feature-panel');
    const trigger=document.querySelector('#atlas-shell-features-toggle,.shell-feature-toggle');
    return {hidden:panel.hidden,expanded:trigger.getAttribute('aria-expanded'),focusIsTrigger:document.activeElement===trigger,focusId:document.activeElement?.id??null};
  });
  receipt.featurePanelClose=closed;
  assert.equal(closed.hidden,true,'Escape must close the feature panel');
  assert.equal(closed.expanded,'false','The closed trigger must report aria-expanded=false');
  assert.ok(closed.focusIsTrigger,'Escape must return focus to the feature trigger, focus='+closed.focusId);

  await evaluate(cdp,()=>document.querySelector('#atlas-shell-features-toggle,.shell-feature-toggle').focus());
  await pressArrowDown();
  const keyboard=await evaluate(cdp,()=>{
    const panel=document.querySelector('.atlas-canvas-heading .shell-feature-panel');
    return {hidden:panel.hidden,focusInside:panel.contains(document.activeElement)};
  });
  receipt.featurePanelKeyboard=keyboard;
  assert.equal(keyboard.hidden,false,'ArrowDown must open the secondary-control disclosure');
  assert.ok(keyboard.focusInside,'ArrowDown must move focus into the disclosure');
  await pressEscape();
  await until(()=>evaluate(cdp,()=>document.querySelector('.atlas-canvas-heading .shell-feature-panel').hidden),'feature panel keyboard close');
}

async function verifyFooterSheet(receipt){
  const footer=await evaluate(cdp,()=>{
    const node=document.querySelector('.workbench-bottom-bar');
    if(!node)return null;
    const box=node.getBoundingClientRect(),style=getComputedStyle(node);
    const controls=[...node.querySelectorAll('button,select,input,a[href]')];
    const tray=node.closest('#mobile-chart-details,.workbench-rail');
    return {region:node.dataset.shellRegion??null,tag:node.tagName,hidden:Boolean(node.hidden),
      box:{left:box.left,right:box.right,top:box.top,bottom:box.bottom,width:box.width,height:box.height},
      display:style.display,visibility:style.visibility,position:style.position,
      painted:node.checkVisibility({checkOpacity:true,checkVisibilityCSS:true}),
      trayId:tray?.id??null,trayOpen:tray?.dataset.mobileOpen??null,
      controlCount:controls.length,
      paintedControls:controls.filter(el=>el.checkVisibility({checkOpacity:true,checkVisibilityCSS:true})).length};
  });
  assert.ok(footer,'Missing .workbench-bottom-bar');
  receipt.footer=footer;
  assert.equal(footer.region,'bottom','Footer must keep its bottom shell region');
  assert.ok(footer.controlCount>0,'The real footer must keep its original controls');
  assert.equal(footer.trayId,'mobile-chart-details','Phone info sheet must be the owned #mobile-chart-details tray');

  const discovery=await evaluate(cdp,discoverSheetTrigger);
  receipt.footerSheetDiscovery=discovery;
  assert.ok(discovery.found,'Footer info-sheet trigger is not identifiable: '+JSON.stringify(discovery));

  const stateOf=selector=>evaluate(cdp,selector=>{
    const footer=document.querySelector('.workbench-bottom-bar');
    const trigger=document.querySelector(selector);
    const tray=footer.closest('#mobile-chart-details,.workbench-rail');
    const controls=[...footer.querySelectorAll('button,select,input,a[href]')];
    const painted=controls.filter(el=>el.checkVisibility({checkOpacity:true,checkVisibilityCSS:true}));
    const box=footer.getBoundingClientRect();
    return {painted:footer.checkVisibility({checkOpacity:true,checkVisibilityCSS:true}),
      trayOpen:tray?.dataset.mobileOpen??null,
      footerBox:{left:box.left,right:box.right,top:box.top,bottom:box.bottom,width:box.width,height:box.height},
      viewport:{width:innerWidth,height:innerHeight},
      paintedControls:painted.length,
      triggerExpanded:trigger?.getAttribute('aria-expanded')??null,
      triggerPainted:Boolean(trigger?.checkVisibility({checkOpacity:true,checkVisibilityCSS:true})),
      small:painted.map(el=>{const r=el.getBoundingClientRect();return {id:el.id||null,width:r.width,height:r.height};})
        .filter(item=>item.width<44-0.5||item.height<44-0.5)};
  },selector);

  const closedState=await stateOf(discovery.selector);
  receipt.footerSheetClosed=closedState;
  assert.ok(closedState.triggerPainted,'The footer info-sheet trigger is not visible at rest');
  assert.notEqual(closedState.trayOpen,'true','The footer info sheet must start closed');
  assert.equal(closedState.paintedControls,0,'The footer must not keep a persistent bar on phone; painted controls='+closedState.paintedControls);
  assert.equal(closedState.painted,false,'The footer must not stay painted behind a closed info sheet');

  await click(discovery.selector,{label:'footer info sheet trigger',touch:true});
  const openState=await stateOf(discovery.selector);
  receipt.footerSheetOpen=openState;
  assert.equal(openState.trayOpen,'true','Opening the info sheet must mark its owned tray open');
  assert.equal(openState.painted,true,'The real footer must be painted inside the open info sheet');
  assert.ok(openState.paintedControls>0,'Footer info sheet exposed no controls after opening');
  assert.ok(openState.footerBox.width>0&&openState.footerBox.height>0,'Footer info sheet has no painted surface');
  assert.ok(openState.footerBox.left>=-1&&openState.footerBox.right<=openState.viewport.width+1&&
    openState.footerBox.top>=-1&&openState.footerBox.bottom<=openState.viewport.height+1,
    'Footer info sheet escapes the viewport: '+JSON.stringify(openState.footerBox));
  assert.deepEqual(openState.small,[],'Footer sheet controls below 44px: '+JSON.stringify(openState.small));
  assert.equal(openState.triggerExpanded,'true','Open footer sheet must report aria-expanded=true');
  await shot(receipt.label+'-footer-sheet-open.png');

  await pressEscape();
  const restored=await stateOf(discovery.selector);
  receipt.footerSheetClosedAgain=restored;
  assert.notEqual(restored.trayOpen,'true','Escape must close the footer info sheet');
  assert.equal(restored.paintedControls,0,'Escape must remove the footer controls from view again');
  const focusReturned=await evaluate(cdp,selector=>document.activeElement===document.querySelector(selector),discovery.selector);
  assert.ok(focusReturned,'Closing the footer info sheet must return focus to its trigger');
}

const plotSelector='#lab-chart-stage .atlas-plot, #lab-chart-stage, .atlas-plot';

async function readDetailPanel(){
  return evaluate(cdp,plotSelector=>{
    const rect=node=>{if(!node)return null;const b=node.getBoundingClientRect();return {left:b.left,right:b.right,top:b.top,bottom:b.bottom,width:b.width,height:b.height};};
    const reader=document.querySelector('#chart-reader');
    const plot=document.querySelector(plotSelector);
    const rail=document.querySelector('.workbench-rail');
    const trigger=document.querySelector('#atlas-display-options');
    if(trigger&&!trigger.id)trigger.id='atlas-display-options';
    const style=reader?getComputedStyle(reader):null;
    return {reader:reader?{hidden:Boolean(reader.hidden),painted:reader.checkVisibility({checkOpacity:true,checkVisibilityCSS:true}),
        position:style.position,box:rect(reader),width:reader.getBoundingClientRect().width,
        closeId:(()=>{const button=reader.querySelector('.reader-heading button');if(button&&!button.id)button.id='atlas-responsive-reader-close';return button?.id??null;})()}:null,
      plot:rect(plot),rail:rect(rail),railPosition:rail?getComputedStyle(rail).position:null,
      railPainted:Boolean(rail?.checkVisibility({checkOpacity:true,checkVisibilityCSS:true})),
      trigger:trigger?{id:trigger.id,painted:Boolean(trigger.checkVisibility({checkOpacity:true,checkVisibilityCSS:true}))}:null,
      viewport:{width:innerWidth,height:innerHeight},documentWidth:document.documentElement.scrollWidth};
  },plotSelector);
}

async function openDetailPanel(){
  const before=await readDetailPanel();
  assert.ok(before.trigger?.painted,'Missing a visible chart settings trigger (#atlas-display-options)');
  await click('#'+before.trigger.id,{label:'chart settings trigger'});
  const opened=await until(async()=>{const state=await readDetailPanel();return state.reader&&!state.reader.hidden&&state.reader.painted?state:null;},'chart detail panel');
  return {before,opened};
}

async function verifyTabletOverlay(receipt){
  const {before,opened}=await openDetailPanel();
  receipt.tabletBefore=before;
  receipt.tabletOpen=opened;
  assert.equal(opened.reader.position,'fixed','Tablet detail panel must overlay, position='+opened.reader.position);
  assert.ok(opened.reader.box.left>=-1&&opened.reader.box.right<=opened.viewport.width+1&&
    opened.reader.box.top>=-1&&opened.reader.box.bottom<=opened.viewport.height+1,
    'Tablet detail overlay escapes the viewport: '+JSON.stringify(opened.reader.box));
  assert.ok(Math.abs(opened.plot.width-before.plot.width)<=4,
    'Tablet detail overlay must not resize the chart: plot '+before.plot.width+' -> '+opened.plot.width);
  await shot(receipt.label+'-tablet-details-open.png');
  assert.ok(opened.reader.closeId,'Tablet detail overlay must expose a close control');
  await click('#'+opened.reader.closeId,{label:'detail overlay close',touch:true});
  const closed=await until(async()=>{const state=await readDetailPanel();return state.reader.hidden?state:null;},'detail overlay close');
  receipt.tabletClosed=closed;
  assert.ok(Math.abs(closed.plot.width-before.plot.width)<=4,'Closing the tablet overlay changed the plot width');
  const focusReturned=await evaluate(cdp,id=>document.activeElement?.id===id,before.trigger.id);
  receipt.tabletFocusReturned=focusReturned;
  assert.ok(focusReturned,'Closing the tablet detail overlay must return focus to its trigger');
}

async function verifyDesktopSplit(receipt){
  const {before,opened}=await openDetailPanel();
  receipt.desktopBefore=before;
  receipt.desktopOpen=opened;
  assert.notEqual(opened.reader.position,'fixed','Desktop detail panel must stay in the grid split, position='+opened.reader.position);
  assert.ok(opened.reader.width>=260,'Desktop split detail panel is too narrow: '+opened.reader.width);
  assert.ok(opened.plot.width<=before.plot.width-240,
    'Desktop split must give width to the detail column: plot '+before.plot.width+' -> '+opened.plot.width);
  assert.ok(opened.plot.right<=opened.reader.box.left+2,'Desktop split must keep the plot left of the detail column');
  assert.ok(opened.railPainted&&['static','relative','sticky'].includes(opened.railPosition),'Desktop must keep a docked right rail');
  assert.ok(opened.rail.width>=40&&opened.rail.width<=120,'Desktop rail width out of range: '+opened.rail.width);
  assert.ok(opened.documentWidth<=opened.viewport.width+1,'Desktop split overflows horizontally');
  assert.ok(opened.reader.closeId,'Desktop detail panel must expose a close control');
  await click('#'+opened.reader.closeId,{label:'detail panel close',touch:false});
  const closed=await until(async()=>{const state=await readDetailPanel();return state.reader.hidden?state:null;},'desktop detail close');
  receipt.desktopClosed=closed;
  assert.ok(closed.plot.width>=before.plot.width-4,'Closing the desktop detail column did not restore the plot width');
}

async function verifyCompareRoundTrip(receipt,width){
  const findEntry=()=>evaluate(cdp,()=>{
    const nodes=[...document.querySelectorAll('[data-atlas-page="data"],a[href*="page=data"]')]
      .filter(item=>item.checkVisibility({checkOpacity:true,checkVisibilityCSS:true}));
    const node=nodes[0];
    if(!node)return null;
    if(!node.id)node.id='atlas-responsive-compare-entry';
    return {selector:'#'+node.id,label:(node.getAttribute('aria-label')||node.textContent||'').trim().slice(0,40),
      insideTray:Boolean(node.closest('#mobile-chart-details,.atlas-sidebar'))};
  });
  let entry=await findEntry();
  if(!entry&&width<=620){
    // The phone rail owns both the navigation and the real footer; open it
    // with its own trigger before reaching the comparison entry.
    const trayTrigger=await evaluate(cdp,()=>{
      const node=document.querySelector('#mobile-details-toggle');
      return node?{id:node.id,painted:Boolean(node.checkVisibility({checkOpacity:true,checkVisibilityCSS:true}))}:null;
    });
    assert.ok(trayTrigger?.painted,'Phone must expose the info tray trigger for comparison navigation');
    await click('#'+trayTrigger.id,{label:'info tray trigger',touch:true});
    entry=await findEntry();
  }
  assert.ok(entry,'Comparison navigation entry is not reachable from the chart perimeter');
  await click(entry.selector,{label:'comparison navigation',touch:width<=620});
  const arrived=await until(()=>evaluate(cdp,()=>{
    const page=document.body.dataset.centerTool||document.body.dataset.page;
    if(page!=='data')return null;
    return {page,headingMode:document.querySelector('.atlas-canvas-heading')?.dataset.mobileHeading??null,
      documentWidth:document.documentElement.scrollWidth,innerWidth};
  }),'comparison page');
  receipt.compareNavigation={entry,arrived};
  assert.ok(arrived.documentWidth<=arrived.innerWidth+1,'Comparison page overflows horizontally: '+arrived.documentWidth+' > '+arrived.innerWidth);

  const findBack=()=>evaluate(cdp,()=>{
    const nodes=[...document.querySelectorAll('.atlas-brand,[data-atlas-page="outlook"],[data-view="outlook"],#mobile-chart-home')]
      .filter(item=>item.checkVisibility({checkOpacity:true,checkVisibilityCSS:true}));
    const node=nodes[0];
    if(!node)return null;
    if(!node.id)node.id='atlas-responsive-compare-back';
    return {selector:'#'+node.id,label:(node.getAttribute('aria-label')||node.textContent||'').trim().slice(0,40)};
  });
  let back=await findBack();
  if(!back&&width<=620){
    await click('#mobile-details-toggle',{label:'open navigation for chart return',touch:true});
    back=await findBack();
  }
  assert.ok(back,'Comparison page must expose a visible back control to the chart');
  await click(back.selector,{label:'comparison back',touch:width<=620});
  const returned=await until(()=>evaluate(cdp,()=>{
    if(document.body.dataset.page!=='outlook'||document.body.dataset.centerTool)return null;
    const heading=document.querySelector('.atlas-canvas-heading'),footer=document.querySelector('.workbench-bottom-bar');
    return {page:document.body.dataset.page,headingMode:heading?.dataset.mobileHeading??null,
      headingHeight:heading?heading.getBoundingClientRect().height:null,
      footerConnected:Boolean(footer?.isConnected),footerControls:footer?footer.querySelectorAll('button,select,input,a[href]').length:0,
      documentWidth:document.documentElement.scrollWidth,innerWidth};
  }),'return to outlook');
  receipt.compareReturned=returned;
  assert.ok(returned.footerConnected&&returned.footerControls>0,'Returning from the comparison page dropped the real footer controls');
  assert.ok(returned.documentWidth<=returned.innerWidth+1,'Returning to the chart introduced horizontal overflow');
  if(width<=620){
    assert.equal(returned.headingMode,'phone-dock','Returned phone heading lost its phone-dock variant');
    assert.ok(Math.abs(returned.headingHeight-48)<=1.5,'Returned phone heading height changed: '+returned.headingHeight);
  }
}

/* ---------------- per-viewport case -------------------------------------- */
async function runViewport(spec){
  const receipt={...spec,band:band(spec.width),status:'running',screenshots:[],runtimeErrors:[]};
  currentRuntimeErrors=receipt.runtimeErrors;
  await cdp.send('Emulation.setDeviceMetricsOverride',{width:spec.width,height:spec.height,deviceScaleFactor:1,mobile:spec.touch});
  await cdp.send('Emulation.setTouchEmulationEnabled',{enabled:spec.touch,maxTouchPoints:1});
  await cdp.send('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'},{name:'prefers-color-scheme',value:'dark'}]});
  await cdp.send('Page.navigate',{url:targetUrl});
  try{
    await waitForReady();
    const state=await evaluate(cdp,probe);
    receipt.state=state;
    assertNoOverflow(state,spec.label);
    assert.equal(state.page,'outlook','Expected the outlook chart route, observed '+state.page);

    const controls=await evaluate(cdp,harvest,['.atlas-canvas-heading','.workbench-bottom-bar','.shell-feature-panel']);
    receipt.controls=controls;
    const census=await evaluate(cdp,readRegistry);
    receipt.registry={total:census.total,duplicates:census.duplicates,propertyMismatch:census.propertyMismatch,
      headingRow:census.inHeadingRow.length,featurePanel:census.inFeaturePanel.length,footer:census.inFooter.length};
    assert.deepEqual(census.duplicates,[],'Shell controls are duplicated in the document');
    assert.ok(census.inFooter.length>0,'The real footer lost its original controls');
    if(!report.registryBaseline)report.registryBaseline={label:spec.label,count:census.total,tokens:census.tokens};
    else receipt.registryDelta={missing:report.registryBaseline.tokens.filter(token=>!census.tokens.includes(token)),
      added:census.tokens.filter(token=>!report.registryBaseline.tokens.includes(token))};

    if(receipt.band==='phone'){
      await verifyPhoneHeading(receipt);
      await verifyFeaturePanel(receipt);
      await verifyFooterSheet(receipt);
    }else if(receipt.band==='tablet'){
      await verifyTabletOverlay(receipt);
    }else{
      await verifyDesktopSplit(receipt);
    }

    await verifyCompareRoundTrip(receipt,spec.width);
    const finalState=await evaluate(cdp,probe);
    receipt.finalState=finalState;
    assertNoOverflow(finalState,spec.label+' (after navigation)');
    assert.deepEqual(receipt.runtimeErrors,[],'Browser runtime errors: '+JSON.stringify(receipt.runtimeErrors.slice(0,4)));
    receipt.screenshots.push(await shot(spec.label+'-layout.png'));
    receipt.status='passed';
  }catch(error){
    receipt.status='failed';receipt.error=errorText(error);
    report.failures.push({viewport:spec.label,width:spec.width,height:spec.height,band:receipt.band,error:errorText(error)});
    try{receipt.screenshots.push(await shot(spec.label+'-failure.png'));}catch{}
  }finally{
    currentRuntimeErrors=null;
    report.cases.push(receipt);
    console.log('RESPONSIVE_VIEWPORT '+JSON.stringify({viewport:spec.label,band:receipt.band,status:receipt.status,
      error:receipt.error?String(receipt.error).split('\n')[0]:null}));
  }
}

/* ---------------- identity round trip ----------------------------------- */
async function runIdentityRoundTrip(){
  const receipt={label:'identity-phone-desktop-phone',width:390,height:844,touch:true,band:'phone',
    status:'running',screenshots:[],runtimeErrors:[]};
  currentRuntimeErrors=receipt.runtimeErrors;
  await cdp.send('Page.navigate',{url:targetUrl});
  try{
    await waitForReady();
    const phases=[{width:390,height:844,touch:true,phase:'phone-initial'},
      {width:1024,height:768,touch:false,phase:'desktop'},
      {width:390,height:844,touch:true,phase:'phone-restored'}];
    const states=[];
    for(const size of phases){
      await cdp.send('Emulation.setDeviceMetricsOverride',{width:size.width,height:size.height,deviceScaleFactor:1,mobile:size.touch});
      await cdp.send('Emulation.setTouchEmulationEnabled',{enabled:size.touch,maxTouchPoints:1});
      await settled(cdp);
      await until(()=>evaluate(cdp,()=>document.body.dataset.page==='outlook'&&Boolean(document.querySelector('.atlas-canvas-heading'))),'identity phase ready');
      await until(()=>evaluate(cdp,()=>{const readout=document.querySelector('.cycle-reference-comparison');return !readout||readout.dataset.status==='ready';}),'source-owned period sensitivity ready');
      await settled(cdp);
      const harvested=await evaluate(cdp,harvest,['.atlas-canvas-heading','.workbench-bottom-bar','.shell-feature-panel']);
      const census=await evaluate(cdp,readRegistry);
      const dom=await evaluate(cdp,()=>{
        const heading=document.querySelector('.atlas-canvas-heading'),footer=document.querySelector('.workbench-bottom-bar');
        const box=heading.getBoundingClientRect();
        return {mode:heading.dataset.mobileHeading??null,headingHeight:box.height,headingBottom:box.bottom,innerHeight,
          footerConnected:footer.isConnected,footerControls:footer.querySelectorAll('button,select,input,a[href]').length,
          documentWidth:document.documentElement.scrollWidth,innerWidth,
          generatedReadout:document.querySelector('.cycle-reference-comparison')?.textContent??null};
      });
      states.push({phase:size.phase,width:size.width,height:size.height,dom,
        registry:{total:census.total,duplicates:census.duplicates,propertyMismatch:census.propertyMismatch},
        tokens:harvested.map(item=>item.token),controls:harvested.map(({token,id,label})=>({token,id,label}))});
    }
    receipt.identity=states;
    const first=states[0],desktop=states[1],restored=states[2];
    assert.deepEqual(restored.registry.duplicates,[],'Restored phone duplicated shell controls');
    assert.deepEqual(restored.registry.propertyMismatch,[],'Shell controls lost their original node identity across resizes');
    assert.deepEqual([...restored.tokens].sort(),[...first.tokens].sort(),'Phone round-trip did not restore the same original control nodes');
    assert.equal(restored.dom.generatedReadout,first.dom.generatedReadout,'Source-owned generated period values changed during resize');
    assert.equal(restored.dom.mode,'phone-dock','Restored phone heading lost its phone-dock contract');
    assert.ok(Math.abs(restored.dom.headingHeight-48)<=1.5,'Restored phone heading height changed: '+restored.dom.headingHeight);
    assert.ok(restored.dom.documentWidth<=restored.dom.innerWidth+1,'Restored phone introduced horizontal overflow');
    assert.equal(desktop.dom.footerConnected,true,'Footer was detached during the resize round trip');
    assert.ok(desktop.dom.footerControls>0,'Footer controls were lost during the resize round trip');
    assert.deepEqual(receipt.runtimeErrors,[],'Browser runtime errors during resize: '+JSON.stringify(receipt.runtimeErrors.slice(0,4)));
    receipt.screenshots.push(await shot('identity-phone-desktop-phone-restored.png'));
    receipt.status='passed';
  }catch(error){
    receipt.status='failed';receipt.error=errorText(error);
    report.failures.push({viewport:'identity-phone-desktop-phone',error:errorText(error)});
    try{receipt.screenshots.push(await shot('identity-failure.png'));}catch{}
  }finally{
    currentRuntimeErrors=null;
    report.cases.push(receipt);
    console.log('RESPONSIVE_IDENTITY '+JSON.stringify({status:receipt.status,error:receipt.error?String(receipt.error).split('\n')[0]:null}));
  }
}

/* ---------------- launch / teardown ------------------------------------- */
function resolveBrowser(){
  if(process.env.ATLAS_BROWSER_PATH)return process.env.ATLAS_BROWSER_PATH;
  for(const candidate of ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome','/Applications/Chromium.app/Contents/MacOS/Chromium']){
    try{execFileSync('test',['-x',candidate]);return candidate;}catch{}
  }
  for(const name of ['google-chrome','google-chrome-stable','chromium','chromium-browser']){
    try{const found=execFileSync('which',[name],{encoding:'utf8'}).trim();if(found)return found;}catch{}
  }
  return null;
}

async function probeTarget(){
  try{
    const response=await fetch(targetUrl,{redirect:'follow'});
    return {ok:response.ok,status:response.status,bytes:(await response.arrayBuffer()).byteLength};
  }catch(error){return {ok:false,error:errorText(error)};}
}

async function launch(){
  const reachable=await probeTarget();
  report.target={url:targetUrl,...reachable};
  const binary=resolveBrowser();
  report.browser={binary:binary??null};
  if(!reachable.ok||!binary){
    report.status='blocked';
    report.blockedReason=!reachable.ok
      ?('Target URL unreachable: '+targetUrl+' '+(reachable.error??'HTTP '+reachable.status))
      :'No Chrome/Chromium binary available (set ATLAS_BROWSER_PATH); verification is blocked, not skipped';
    return false;
  }
  profile=await mkdtemp(resolve(tmpdir(),'atlas-responsive-workbench-'));
  chrome=spawn(binary,['--headless=new','--no-sandbox','--disable-dev-shm-usage','--disable-background-networking',
    '--disable-component-update','--disable-sync','--no-first-run','--no-default-browser-check',
    '--remote-debugging-port=0','--user-data-dir='+profile,'about:blank'],{stdio:['ignore','ignore','pipe']});
  report.browser.pid=chrome.pid;report.browser.profile=profile;
  let spawnError=null;
  chrome.once('error',error=>{spawnError=error;});
  chrome.stderr.on('data',chunk=>{chromeStderr=(chromeStderr+chunk.toString()).slice(-12000);});
  const active=await until(async()=>{
    if(spawnError)throw spawnError;
    if(chrome.exitCode!==null)throw new Error('Browser exited before readiness: '+chromeStderr);
    try{return (await readFile(resolve(profile,'DevToolsActivePort'),'utf8')).trim().split('\n');}catch{return null;}
  },'Chromium DevToolsActivePort',25000);
  const debugBase='http://127.0.0.1:'+active[0];
  browserSocket=await Cdp.connect('ws://127.0.0.1:'+active[0]+active[1]);
  report.browser.version=await browserSocket.send('Browser.getVersion');
  const {targetId}=await browserSocket.send('Target.createTarget',{url:'about:blank'});
  const target=await until(async()=>{
    const list=await (await fetch(debugBase+'/json/list')).json();
    return list.find(item=>item.id===targetId&&item.webSocketDebuggerUrl);
  },'page CDP target');
  cdp=await Cdp.connect(target.webSocketDebuggerUrl);
  cdp.on('Runtime.exceptionThrown',event=>{if(currentRuntimeErrors)currentRuntimeErrors.push(event.exceptionDetails?.exception?.description??JSON.stringify(event.exceptionDetails));});
  cdp.on('Runtime.consoleAPICalled',event=>{
    if(event.type!=='error'||!currentRuntimeErrors)return;
    currentRuntimeErrors.push({consoleError:event.args.map(arg=>arg.value??arg.description??arg.type)});
  });
  await cdp.send('Page.enable');
  await cdp.send('Runtime.enable');
  await cdp.send('Network.enable');
  await cdp.send('Network.setBlockedURLs',{urls:['https://*']});
  return true;
}

async function teardown(){
  if(browserSocket){try{await browserSocket.send('Browser.close');}catch{}browserSocket.close();}
  if(cdp)cdp.close();
  if(chrome&&chrome.exitCode===null){chrome.kill('SIGTERM');await delay(300);if(chrome.exitCode===null)chrome.kill('SIGKILL');}
  if(profile)try{await rm(profile,{recursive:true,force:true});}catch(error){report.cleanupError=errorText(error);}
}

try{
  await mkdir(out,{recursive:true});
  if(await launch()){
    for(const spec of viewports)await runViewport(spec);
    await runIdentityRoundTrip();
    const failed=report.cases.filter(item=>item.status!=='passed');
    assert.deepEqual(failed.map(item=>({label:item.label,error:item.error})),[],'Responsive verification failed; inspect report.json and screenshots');
    report.status='passed';
  }else process.exitCode=2;
}catch(error){
  report.status='failed';report.error=errorText(error);report.failures.push({error:errorText(error)});
  process.exitCode=1;
}finally{
  await teardown();
  report.finishedAt=new Date().toISOString();
  report.chromeStderrTail=chromeStderr.slice(-4000);
  if(report.status==='running')report.status='failed';
  await mkdir(out,{recursive:true});
  const bytes=Buffer.from(JSON.stringify(report,null,2)+'\n');
  await writeFile(resolve(out,'report.json'),bytes);
  const summary={status:report.status,url:targetUrl,
    viewports:report.cases.map(item=>({viewport:item.label,band:item.band,status:item.status,error:item.error?String(item.error).split('\n')[0]:null})),
    failures:report.failures.length,screenshots:report.screenshots.length,
    report:relative(root,resolve(out,'report.json')),reportBytes:bytes.length,reportSha256:hash(bytes),
    ...(report.blockedReason?{blockedReason:report.blockedReason}:{})};
  console.log('RESPONSIVE_WORKBENCH_RECEIPT '+JSON.stringify(summary));
  if(report.status==='blocked')console.error('BLOCKED: '+report.blockedReason);
  if(report.status==='failed')for(const failure of report.failures)console.error('FAILURE '+failure.viewport+': '+String(failure.error).split('\n')[0]);
}
