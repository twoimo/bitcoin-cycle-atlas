#!/usr/bin/env node
// HANDOFF-R19P1-1-595c365: shell-only native evidence. Existing P0/R17 gates
// retain their own fixed samples and thresholds. No browser install or product
// DOM/style/focus/scroll override is used to manufacture navigation reach.
import assert from 'node:assert/strict';
import {spawn, execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {createServer} from 'node:http';
import {access, mkdir, mkdtemp, readFile, realpath, rm, stat, writeFile} from 'node:fs/promises';
import {constants} from 'node:fs';
import {tmpdir} from 'node:os';
import {dirname, extname, resolve} from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {headlessWindowArgument, verifyHeadlessWindowEnvelope} from './headless-browser-window.mjs';
import {ensureOwnedVisibleForPaint} from './browser-paint-readiness.mjs';
import {readNativeInteractiveTarget} from './verify-workspace-browser.mjs';
import {verifyP0TextInk} from './ui-renewal-p0-text-hit.mjs';

const root = fileURLToPath(new URL('..', import.meta.url)), site = resolve(root, 'dist'), prefix = '/bitcoin-cycle-atlas';
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
export const p1Widths = Object.freeze([320, 390, 768, 1440]);
export const p1Destinations = Object.freeze([
  {id:'outlook', page:'outlook', path:'?page=outlook&symbol=BTCUSD', title:'가격 차트', limit:null},
  // The canonical static market route is hosted inside the existing chart
  // perimeter. It remains in the matrix, with its child viewport measured.
  {id:'market-us', page:'market', path:'market-lab/', title:'시장 분석', limit:null, hosted:true},
  {id:'evidence', page:'evidence', path:'?page=evidence', title:'리서치', limit:1140},
  {id:'data', page:'data', path:'?page=data', title:'자산 비교', limit:1280},
  {id:'ipo', page:'ipo', path:'?page=ipo', title:'공모주', limit:1140},
  {id:'relay', page:'relay', path:'?page=relay', title:'릴레이 콘텐츠', limit:1280},
  {id:'conference', page:'conference', path:'?page=conference', title:'컨퍼런스 복습', limit:1280},
].map(Object.freeze));
export const p1Cases = Object.freeze(p1Widths.flatMap(width => p1Destinations.map(destination => Object.freeze({...destination, width, height:900, caseId:`${destination.id}-${width}`}))));

export function parseP1Arguments(argv, cwd=root) {
  const result = {out:null, bin:process.env.CHROME_PATH || (process.platform === 'darwin' ? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' : '/usr/bin/chromium')};
  for (let i=0; i<argv.length; i++) {
    if (argv[i] === '--help') {result.help=true;continue;}
    if (!['--out', '--browser'].includes(argv[i]) || !argv[i+1] || argv[i+1].startsWith('--')) throw new Error(`Unknown or incomplete argument: ${argv[i]}`);
    result[argv[i] === '--out' ? 'out' : 'bin'] = resolve(cwd, argv[++i]);
  }
  if (!result.help && !result.out) throw new Error('--out NEW_DIRECTORY is required');
  return result;
}

export function validateP1Target(target, {keyboard=false}={}) {
  const failures=[], b=target?.box, c=target?.clip;
  if (!b || !c || ![b.left,b.right,b.top,b.bottom,b.width,b.height,c.left,c.right,c.top,c.bottom].every(Number.isFinite)) return ['native target geometry is missing'];
  if (!target.painted || target.disabled || !target.topmost) failures.push('native target is hidden, disabled or covered');
  if (b.width<44 || b.height<44) failures.push(`target is smaller than 44px: ${b.width}x${b.height}`);
  if (b.left<c.left-.01 || b.right>c.right+.01 || b.top<c.top-.01 || b.bottom>c.bottom+.01) failures.push('native target is clipped');
  if (keyboard && (!target.inside || target.outline === 'none' || !(target.outlineWidth>=2))) failures.push('keyboard focus lacks an exposed 2px ring');
  return failures;
}

/** Read only: the browser's paint/scroll geometry is evidence, not repaired. */
export function inspectP1Page(spec) {
  const rect = n => {if (!n) return null;const r=n.getBoundingClientRect();return {left:r.left,right:r.right,top:r.top,bottom:r.bottom,width:r.width,height:r.height};};
  const painted = n => Boolean(n && !n.closest('[hidden],[inert],[aria-hidden="true"]') && n.checkVisibility({checkOpacity:true,checkVisibilityCSS:true}) && n.getBoundingClientRect().width>1 && n.getBoundingClientRect().height>1);
  const details = n => {if (!n) return null;const s=getComputedStyle(n);return {rect:rect(n),painted:painted(n),maxWidth:s.maxWidth,paddingLeft:s.paddingLeft,paddingRight:s.paddingRight,
    borderLeftWidth:s.borderLeftWidth,borderRightWidth:s.borderRightWidth,radii:[s.borderTopLeftRadius,s.borderTopRightRadius,s.borderBottomRightRadius,s.borderBottomLeftRadius],background:s.backgroundColor,overflowX:s.overflowX,overflowY:s.overflowY};};
  const h1=[...document.querySelectorAll('h1')], heading=document.getElementById('atlas-page-heading');
  const range=document.createRange();if (heading) range.selectNodeContents(heading);
  const glyphs=heading?[...range.getClientRects()].filter(r=>r.width>0&&r.height>0).map(r=>({left:r.left,right:r.right,top:r.top,bottom:r.bottom})):[];
  const viewport={width:innerWidth,height:innerHeight}, frame=document.querySelector('.atlas-center-frame:not([hidden])'), child=frame?.contentDocument;
  const nav=[...document.querySelectorAll('.atlas-nav [data-atlas-page]')].map(n=>({id:n.dataset.atlasPage,label:n.getAttribute('aria-label'),active:n.getAttribute('aria-current'),...details(n)}));
  const current=document.body.dataset.centerTool || document.body.dataset.page;
  return {url:location.href,boot:document.documentElement.dataset.boot,page:document.body.dataset.page,center:document.body.dataset.centerTool||null,shell:document.body.dataset.shell,current,viewport,
    overflow:Math.max(0,document.documentElement.scrollWidth-innerWidth,document.body.scrollWidth-innerWidth),
    documentWidths:{root:document.documentElement.scrollWidth,body:document.body.scrollWidth},
    headings:{count:h1.length,paintedCount:h1.filter(painted).length,title:heading?.textContent.trim()||'',rect:rect(heading),glyphs,
      describedBy:heading?.getAttribute('aria-describedby'),description:document.getElementById(heading?.getAttribute('aria-describedby'))?.textContent.trim()||'',
      inHeader:Boolean(heading?.closest('.atlas-dashboard-header')),
      duplicateTitles:[...document.querySelectorAll('h1,h2,h3')].filter(n=>n!==heading&&painted(n)&&n.textContent.trim()===heading?.textContent.trim()).map(n=>n.id||n.tagName)},
    workspace:details(document.querySelector('.workspace')),container:details(document.querySelector('#main')),section:details(document.querySelector(`#${spec.page}-view`)),
    nav,navOwners:document.querySelectorAll('.atlas-nav').length,
    child:child?{boot:child.documentElement.dataset.boot,page:child.body?.dataset.page,url:child.location.href,
      viewport:{width:child.defaultView.innerWidth,height:child.defaultView.innerHeight},
      overflow:Math.max(0,child.documentElement.scrollWidth-child.defaultView.innerWidth,(child.body?.scrollWidth||0)-child.defaultView.innerWidth)}:null};
}

/** Reuse P0's unchanged native text proof: positive layout boxes alone cannot
 * establish that a heading's glyphs escape clipping and covering paint. */
export async function inspectP1Snapshot(cdp, spec) {
  const state=await evaluate(cdp,inspectP1Page,spec);
  const proof=await verifyP0TextInk(cdp,'#atlas-page-heading');
  if (proof.status==='passed' && (proof.geometry?.text?.trim()!==state.headings?.title ||
    ['left','top','right','bottom'].some(key=>proof.geometry?.rect?.[key]!==state.headings?.rect?.[key]))) {
    proof.status='unverified';proof.reason='heading text/geometry changed during native hit verification';
  }
  state.headings.nativeTextHit=proof;
  return state;
}

export function validateP1Layout(state, spec) {
  const failures=[];
  if (state.overflow!==0) failures.push(`horizontal overflow ${state.overflow}px`);
  if (spec.hosted ? state.page!=='outlook'||state.center!==spec.id||state.shell!=='chart' : state.page!==spec.page||state.center) failures.push(`route did not own its requested page: ${state.page}/${state.center}`);
  if (spec.hosted && (!state.child || state.child.overflow!==0)) failures.push('hosted market child is missing or horizontally overflows');
  if (state.headings?.count!==1 || state.headings?.paintedCount!==1) failures.push('expected exactly one DOM and painted h1');
  if (state.headings?.title!==spec.title) failures.push(`wrong h1: ${state.headings?.title}`);
  if (!state.headings?.describedBy || !state.headings?.description) failures.push('h1 source description is missing');
  if (state.headings?.duplicateTitles?.length) failures.push('duplicate visible section/header title');
  if (!state.headings?.glyphs?.length || !state.headings.glyphs.every(r=>r.left>=0&&r.right<=spec.width&&r.top>=0&&r.bottom<=spec.height)) failures.push('h1 text lies outside the viewport');
  if (state.headings?.nativeTextHit?.status!=='passed') failures.push(`h1 native text paint is ${state.headings?.nativeTextHit?.status||'missing'}: ${state.headings?.nativeTextHit?.reason||'complete native hit evidence is required'}`);
  if (state.navOwners!==1 || JSON.stringify(state.nav?.map(n=>n.id))!==JSON.stringify(p1Destinations.map(n=>n.id))) failures.push('navigation identities are missing, duplicated or reordered');
  if (JSON.stringify(state.nav?.filter(n=>n.active==='page').map(n=>n.id))!==JSON.stringify([spec.id])) failures.push('active navigation identity differs from the direct route');
  if (spec.limit) {
    const c=state.container,w=state.workspace;
    if (state.shell!=='dashboard' || !state.headings.inHeader) failures.push('dashboard header does not own the h1');
    if (!c?.painted || Number.parseFloat(c.maxWidth)!==spec.limit) failures.push(`container max-width is not ${spec.limit}px`);
    const finiteRect=r=>Boolean(r && ['left','right','top','bottom','width','height'].every(key=>Number.isFinite(r[key])) &&
      r.width>0 && r.height>0 && r.right>r.left && r.bottom>r.top && Math.abs(r.right-r.left-r.width)<=.1 && Math.abs(r.bottom-r.top-r.height)<=.1);
    const insets=['paddingLeft','paddingRight','borderLeftWidth','borderRightWidth'].map(key=>Number.parseFloat(w?.[key]));
    if (finiteRect(c?.rect) && finiteRect(w?.rect) && insets.every(value=>Number.isFinite(value)&&value>=0)) {
      const [paddingLeft,paddingRight,borderLeft,borderRight]=insets;
      const left=w.rect.left+paddingLeft+borderLeft,right=w.rect.right-paddingRight-borderRight;
      const expected=Math.min(spec.limit,right-left);
      if (!(expected>0)) failures.push('container available width is not positive');
      if (Math.abs(c.rect.width-expected)>.1) failures.push(`container actual width ${c.rect.width} differs from ${expected}`);
      if (Math.abs((c.rect.left+c.rect.right)/2-(left+right)/2)>.1) failures.push('container is not centered in its available width');
    } else failures.push('container/workspace geometry or padding/border evidence is missing, nonfinite or invalid');
    if (!state.section?.painted || !state.section.radii.every(value=>[12,16,20].includes(Number.parseFloat(value))) || /^(?:transparent|rgba\(0, 0, 0, 0\))$/.test(state.section.background)) failures.push('outer section does not paint the shared card surface/radius');
  }
  for (const n of state.nav||[]) if (n.painted && !n.radii.every(value=>Number.parseFloat(value)>=n.rect.height/2)) failures.push(`navigation ${n.id} is not pill shaped`);
  return failures;
}

export function p1FinalStatus(report) {
  const layouts=report.layouts||[],journeys=report.journeys||[], expectedLayout=p1Cases.map(s=>s.caseId).sort();
  const expectedJourney=p1Widths.flatMap(width=>['pointer','keyboard'].map(mode=>`${mode}-${width}`)).sort();
  const complete=JSON.stringify(layouts.map(s=>s.caseId).sort())===JSON.stringify(expectedLayout) && JSON.stringify(journeys.map(s=>s.id).sort())===JSON.stringify(expectedJourney) &&
    journeys.every(j=>JSON.stringify(j.steps?.map(s=>s.destination).sort())===JSON.stringify(p1Destinations.map(s=>s.id).sort()));
  const passedLayouts=layouts.filter(s=>s.status==='passed').length,steps=journeys.flatMap(j=>j.steps||[]),passedSteps=steps.filter(s=>s.status==='passed').length;
  const chartReturns=journeys.map(j=>j.chartReturn).filter(Boolean),passedChartReturns=chartReturns.filter(s=>s.status==='passed').length;
  const qualified=complete && passedLayouts===28 && passedSteps===56 && passedChartReturns===8 && journeys.every(j=>j.status==='passed') && report.sourceStable===true && !(report.failures||[]).length;
  const failed=layouts.some(s=>s.status==='failed')||journeys.some(s=>s.status==='failed');
  return {status:qualified?'passed':failed?'failed':'unverified',qualifiesP1Verification:qualified,counts:{requiredLayouts:28,attemptedLayouts:layouts.length,passedLayouts,requiredNavigationActivations:56,attemptedNavigationActivations:steps.length,passedNavigationActivations:passedSteps,requiredChartReturns:8,attemptedChartReturns:chartReturns.length,passedChartReturns},complete};
}

class Cdp {
  constructor(ws) {this.ws=ws;this.id=0;this.pending=new Map();this.listeners=new Map();ws.addEventListener('message',e=>{const m=JSON.parse(String(e.data));if(!m.id){this.listeners.get(m.method)?.(m.params||{});return;}const p=this.pending.get(m.id);if(!p)return;this.pending.delete(m.id);clearTimeout(p.timer);m.error?p.reject(new Error(m.error.message)):p.resolve(m.result||{});});}
  static async connect(url) {const ws=new WebSocket(url);await new Promise((accept,reject)=>{const t=setTimeout(()=>reject(new Error('CDP connection timeout')),15000);ws.addEventListener('open',()=>{clearTimeout(t);accept();},{once:true});ws.addEventListener('error',()=>{clearTimeout(t);reject(new Error('CDP failed'));},{once:true});});return new Cdp(ws);}
  send(method,params={}) {const id=++this.id;return new Promise((accept,reject)=>{const timer=setTimeout(()=>{this.pending.delete(id);reject(new Error(`CDP timeout: ${method}`));},30000);this.pending.set(id,{resolve:accept,reject,timer});this.ws.send(JSON.stringify({id,method,params}));});}
  close(){for(const p of this.pending.values()){clearTimeout(p.timer);p.reject(new Error('CDP closed'));}this.pending.clear();this.ws.close();}
}
async function evaluate(cdp,fn,...args) {const r=await cdp.send('Runtime.evaluate',{expression:`(${fn.toString()})(${args.map(v=>JSON.stringify(v)).join(',')})`,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw new Error(`Browser evaluation: ${JSON.stringify(r.exceptionDetails).slice(0,1000)}`);return r.result.value;}
async function until(fn,label,timeout=45000) {const end=Date.now()+timeout;while(Date.now()<end){try{const value=await fn();if(value)return value;}catch(error){if(!/Execution context was destroyed|Cannot find context with specified id/.test(error.message))throw error;}await delay(100);}throw new Error(`Timed out: ${label}`);}
async function settle(cdp){await ensureOwnedVisibleForPaint(cdp,evaluate,until);await evaluate(cdp,async()=>{await document.fonts.ready;await new Promise(ok=>requestAnimationFrame(()=>requestAnimationFrame(ok)));});}
/** React's embedded market does not use the legacy data-boot attribute. Its
 * current host acknowledgement and populated, non-loading market panel must
 * both be observed; an iframe or a stale ready document is insufficient. */
export function readP1RouteReadiness({id}) {
  const expected=id==='market-us'?'market':id;
  const painted=n=>Boolean(n && !n.closest('[hidden],[inert],[aria-hidden="true"]') && n.checkVisibility({checkOpacity:true,checkVisibilityCSS:true}) && n.getBoundingClientRect().width>0 && n.getBoundingClientRect().height>0);
  const content=n=>({painted:painted(n),populated:Boolean(n?.childElementCount && n.textContent.trim()),busy:n?.getAttribute('aria-busy')==='true',
    loading:Boolean(n && [...n.querySelectorAll('[data-atlas-skeleton],.atlas-inline-loading,.ml-loading-skeleton')].some(painted))});
  const frames=[...document.querySelectorAll('.atlas-center-frame:not([hidden])')],frame=frames[0];
  let child=null;
  try {const d=frame?.contentDocument;if(d){const workspace=d.querySelector('#root main[data-workspace]');child={readyState:d.readyState,boot:d.documentElement?.dataset.boot||null,page:d.body?.dataset.page||null,
    workspace:workspace?.dataset.workspace||null,workspacePainted:painted(workspace),loadingKind:workspace?.dataset.loadingKind||null,
    section:content(d.getElementById(`${expected}-view`)),panel:content(d.getElementById('ml-panel'))};}}catch{/* An inaccessible frame cannot prove destination readiness. */}
  return {boot:document.documentElement?.dataset.boot||null,readyState:document.readyState,page:document.body?.dataset.page||null,center:document.body?.dataset.centerTool||null,
    activeNavigation:[...document.querySelectorAll('.atlas-nav [data-atlas-page][aria-current="page"]')].map(n=>n.dataset.atlasPage),section:content(document.getElementById(`${expected}-view`)),frameCount:frames.length,
    frame:frame?{painted:painted(frame),status:frame.dataset.centerStatus||null,loaded:frame.dataset.centerLoaded==='true',epoch:Number(frame.dataset.centerEpoch),busy:frame.getAttribute('aria-busy')==='true',child}:null};
}
export function isP1RouteReady(state,id,{direct=false}={}) {
  const expected=id==='market-us'?'market':id;
  const contentReady=section=>Boolean(section?.painted && section.populated && section.busy===false && section.loading===false);
  if(state?.boot!=='ready' || state.readyState!=='complete' || JSON.stringify(state.activeNavigation)!==JSON.stringify([id]))return false;
  if(!state.center)return state.page===expected && state.frameCount===0 && contentReady(state.section);
  if(direct || state.page!=='outlook' || state.center!==id || state.frameCount!==1)return false;
  const frame=state.frame,child=frame?.child;
  if(!frame?.painted || frame.status!=='ready' || frame.busy!==false || !Number.isSafeInteger(frame.epoch) || frame.epoch<=0 || child?.readyState!=='complete' || child.page!==expected || !contentReady(child.section))return false;
  if(id==='market-us')return frame.loaded===true && child.workspace==='market' && child.workspacePainted===true && child.loadingKind===null && contentReady(child.panel);
  return child.boot==='ready';
}
async function ready(cdp, id, {direct=false}={}) {
  let last;
  await until(async()=>{last=await evaluate(cdp,readP1RouteReadiness,{id});if(last.boot==='error'||last.frame?.child?.boot==='error')throw new Error(`product boot error: ${JSON.stringify(last)}`);return isP1RouteReady(last,id,{direct});},`${id} product route ready`);
  await settle(cdp);return last;
}
async function nativeKey(cdp,key,reverse=false) {const code=key==='Enter'?13:key==='Escape'?27:9;for(const type of ['keyDown','keyUp'])await cdp.send('Input.dispatchKeyEvent',{type,key,code:key,windowsVirtualKeyCode:code,nativeVirtualKeyCode:code,modifiers:reverse?8:0,...(key==='Enter'&&type==='keyDown'?{text:'\r',unmodifiedText:'\r'}:{})});}
async function nativePointer(cdp,selector,record,{navigation=false}={}) {const target=await evaluate(cdp,readNativeInteractiveTarget,selector);assert.deepEqual(validateP1Target(target),[],`Pointer target ${selector}: ${JSON.stringify(target)}`);record.push({kind:'pointer',selector,target});for(const type of ['mousePressed','mouseReleased'])await cdp.send('Input.dispatchMouseEvent',{type,x:target.x,y:target.y,button:'left',clickCount:1});if(!navigation)await settle(cdp);return target;}
async function keyboardTarget(cdp,selector,record) {
  for(let i=0;i<280;i++){
    const focused=await evaluate(cdp,s=>document.activeElement===document.querySelector(s),selector);
    if(focused){const target=await evaluate(cdp,readNativeInteractiveTarget,selector,true);assert.deepEqual(validateP1Target(target,{keyboard:true}),[],`Keyboard target ${selector}: ${JSON.stringify(target)}`);record.push({kind:'keyboard-focus',selector,target});return target;}
    await nativeKey(cdp,'Tab');
    const focusedNode=await evaluate(cdp,()=>({id:document.activeElement?.id||null,tag:document.activeElement?.tagName||null,nav:document.activeElement?.dataset?.atlasPage||null}));
    record.push({kind:'Tab',focus:focusedNode});
  }
  throw new Error(`Native Tab never reached ${selector}`);
}
export function planP1NativeReveal(scroll,{previousArrowDirection=null,wheelOnly=false}={}) {
  if(!scroll)return null;
  const delta=(start,end,clipStart,clipEnd,position,maximum,enabled)=>{
    if(!enabled || ![start,end,clipStart,clipEnd,position,maximum].every(Number.isFinite) || position<0 || maximum<position)return 0;
    const required=start<clipStart?start-clipStart:end>clipEnd?end-clipEnd:0;
    return Math.max(-position,Math.min(maximum-position,required));
  };
  const deltaX=delta(scroll.target.left,scroll.target.right,scroll.clip.left,scroll.clip.right,scroll.before.left,scroll.maximum.left,scroll.horizontal);
  const deltaY=delta(scroll.target.top,scroll.target.bottom,scroll.clip.top,scroll.clip.bottom,scroll.before.top,scroll.maximum.top,scroll.vertical);
  if(!deltaX&&!deltaY)return null;
  const direction=deltaX<0?'previous':deltaX>0?'next':null;
  const reversed=Boolean(previousArrowDirection && direction && previousArrowDirection!==direction);
  const next={previousArrowDirection,wheelOnly:wheelOnly||reversed};
  if(scroll.button?.direction===direction && !next.wheelOnly){next.previousArrowDirection=direction;return {kind:'arrow',selector:scroll.button.selector,next};}
  return {kind:'wheel',x:scroll.x,y:scroll.y,deltaX,deltaY,owner:scroll.owner,before:scroll.before,maximum:scroll.maximum,overshoot:reversed,next};
}
async function revealPointerNavigation(cdp, selector, record) {
  const closed=await evaluate(cdp,s=>{const n=document.querySelector(s);return Boolean(n&&!n.checkVisibility({checkOpacity:true,checkVisibilityCSS:true})&&document.body.dataset.shell==='chart');},selector);
  if(closed)await nativePointer(cdp,'#mobile-details-toggle',record);
  let history={};
  for(let i=0;i<24;i++){
    const t=await evaluate(cdp,readNativeInteractiveTarget,selector);if(!validateP1Target(t).length)return;
    const scroll=await evaluate(cdp,s=>{
      const n=document.querySelector(s),r=n?.getBoundingClientRect();if(!r)return null;
      for(let p=n.parentElement;p;p=p.parentElement){const style=getComputedStyle(p),b=p.getBoundingClientRect();
        const horizontal=/(auto|scroll)/.test(style.overflowX)&&p.scrollWidth>p.clientWidth;
        const vertical=/(auto|scroll)/.test(style.overflowY)&&p.scrollHeight>p.clientHeight;
        if(!horizontal&&!vertical)continue;
        const left=Math.max(0,b.left+p.clientLeft),right=Math.min(innerWidth,b.left+p.clientLeft+p.clientWidth),top=Math.max(0,b.top+p.clientTop),bottom=Math.min(innerHeight,b.top+p.clientTop+p.clientHeight);
        if(!(right>left&&bottom>top))continue;const x=(left+right)/2,y=(top+bottom)/2,hit=document.elementFromPoint(x,y);if(!hit||!(hit===p||p.contains(hit)))continue;
        const direction=r.left<left?'previous':r.right>right?'next':null,selector=direction&&`.atlas-dashboard-nav [data-shell-nav-scroll="${direction}"]`,button=p.matches('.atlas-nav')&&selector&&document.querySelector(selector);
        return {x,y,horizontal,vertical,target:{left:r.left,right:r.right,top:r.top,bottom:r.bottom},clip:{left,right,top,bottom},owner:p.id||p.className,before:{left:p.scrollLeft,top:p.scrollTop},maximum:{left:Math.max(0,p.scrollWidth-p.clientWidth),top:Math.max(0,p.scrollHeight-p.clientHeight)},
          button:button&&!button.disabled&&button.checkVisibility({checkOpacity:true,checkVisibilityCSS:true})?{direction,selector}:null};
      }return null;
    },selector);
    const action=planP1NativeReveal(scroll,history);
    if(!action)throw new Error(`No exposed native scroll owner can reveal ${selector}: ${JSON.stringify(t)}`);
    history=action.next;
    if(action.kind==='arrow')await nativePointer(cdp,action.selector,record);
    else {record.push(action);await cdp.send('Input.dispatchMouseEvent',{type:'mouseWheel',x:action.x,y:action.y,deltaX:action.deltaX,deltaY:action.deltaY});}
    await delay(140);await settle(cdp);
  }
  throw new Error(`Native wheel never exposed ${selector}`);
}
export async function activateP1Navigation(cdp,destination,mode,step){
  const selector=`.atlas-nav [data-atlas-page="${destination.id}"]`;
  if(mode==='pointer'){await revealPointerNavigation(cdp,selector,step.inputs);step.target=await nativePointer(cdp,selector,step.inputs,{navigation:true});}
  else{
    const closed=await evaluate(cdp,s=>{const n=document.querySelector(s);return Boolean(n&&!n.checkVisibility({checkOpacity:true,checkVisibilityCSS:true})&&document.body.dataset.shell==='chart');},selector);
    if(closed){await keyboardTarget(cdp,'#mobile-details-toggle',step.inputs);await nativeKey(cdp,'Enter');step.inputs.push({kind:'Enter',selector:'#mobile-details-toggle'});await settle(cdp);}
    step.target=await keyboardTarget(cdp,selector,step.inputs);await nativeKey(cdp,'Enter');step.inputs.push({kind:'Enter',selector});
  }
  step.readiness=await ready(cdp,destination.id);step.state=await evaluate(cdp,inspectP1Page,destination);assert.equal(step.state.overflow,0,'navigation caused horizontal overflow');assert.deepEqual(step.state.nav.filter(n=>n.active==='page').map(n=>n.id),[destination.id],'destination did not become active');if(step.state.child)assert.equal(step.state.child.overflow,0,'embedded destination overflows its viewport');step.status='passed';
}
async function sourceInventory() {
  const files=execFileSync('git',['ls-files','-z','--cached','--others','--exclude-standard','--','dist'],{cwd:root,encoding:'utf8'}).split('\0').filter(Boolean);
  files.push('scripts/verify-ui-renewal-p1-browser.mjs','scripts/verify-workspace-browser.mjs','scripts/headless-browser-window.mjs','scripts/browser-paint-readiness.mjs','scripts/ui-renewal-p0-text-hit.mjs');
  return Object.fromEntries(await Promise.all([...new Set(files)].sort().map(async f=>[f,sha256(await readFile(resolve(root,f)))])));
}
async function screenshot(cdp,out,name) {const result=await cdp.send('Page.captureScreenshot',{format:'png',fromSurface:true,captureBeyondViewport:false}),bytes=Buffer.from(result.data,'base64');await writeFile(resolve(out,name),bytes);return {file:name,bytes:bytes.length,sha256:sha256(bytes)};}

// The browser gate and transport regression use this same server. The optional
// root lets the regression exercise path boundaries without touching dist.
export function createP1StaticServer(siteDirectory=site) {
  const servedSite=resolve(siteDirectory);
  const mime={'.html':'text/html;charset=utf-8','.js':'text/javascript','.mjs':'text/javascript','.json':'application/json','.css':'text/css','.svg':'image/svg+xml','.woff2':'font/woff2','.webp':'image/webp','.png':'image/png'};
  return createServer(async(req,res)=>{
    try {
      const p=decodeURIComponent(new URL(req.url,'http://localhost').pathname);
      if(!p.startsWith(prefix+'/'))throw new Error('route');
      let f=resolve(servedSite,'.'+p.slice(prefix.length));
      // The site directory itself is valid only before its index rewrite.
      // The resolved file must still be a strict descendant below.
      if(f!==servedSite&&!f.startsWith(servedSite+'/'))throw new Error('scope');
      if((await stat(f)).isDirectory())f=resolve(f,'index.html');
      f=await realpath(f);
      if(!f.startsWith(servedSite+'/'))throw new Error('scope');
      res.writeHead(200,{'content-type':mime[extname(f)]||'application/octet-stream','cache-control':'no-store'});
      res.end(await readFile(f));
    } catch {res.writeHead(404);res.end('not found');}
  });
}

export async function verifyUiRenewalP1Browser(argv=process.argv.slice(2)) {
  const report={schemaVersion:1,kind:'atlas-ui-renewal-p1',request:'HANDOFF-R19P1-1-595c365',recordedAt:new Date().toISOString(),qualifiesP1Verification:false,qualifiesFullVerification:false,
    scope:'28 route shell layouts, 56 native pointer/keyboard destination activations and 8 chart-to-content returns at 320/390/768/1440. Canonical market keeps its authored chart-hosted owner. Existing P0 contrast/settings-icon gate remains independent and unchanged.',
    methodology:'read-only DOM/IntersectionObserver evidence and unchanged P0 native glyph/paint proof; native CDP key/pointer/wheel inputs; isolated profile/static origin; no product focus/scroll/style mutation, threshold relaxation or hidden-item omission',layouts:[],journeys:[],failures:[]};
  let settings,ownsOut=false,server,profile,chrome,browser,stderr='',stage='arguments';
  try {
    settings=parseP1Arguments(argv);if(settings.help){console.log('Usage: node scripts/verify-ui-renewal-p1-browser.mjs --out NEW_DIRECTORY [--browser CHROME_PATH]\n28 direct shell layouts; 56 actual nav activations. Native failure/partial coverage never qualifies P1. Existing P0 must be run separately.');return report;}
    await mkdir(dirname(settings.out),{recursive:true});await mkdir(settings.out,{recursive:false});ownsOut=true;
    report.testedHead=execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim();report.workingTree=execFileSync('git',['status','--short'],{cwd:root,encoding:'utf8'}).trim().split('\n').filter(Boolean);
    report.sourceHashes=await sourceInventory();stage='browser executable';await access(settings.bin,constants.X_OK);
    server=createP1StaticServer();
    stage='static server';await new Promise((ok,no)=>{server.once('error',no);server.listen(0,'127.0.0.1',ok);});const origin=`http://127.0.0.1:${server.address().port}`,base=origin+prefix+'/';
    profile=await mkdtemp(resolve(tmpdir(),'atlas-ui-p1-'));stage='Chromium launch';
    chrome=spawn(settings.bin,['--headless=new','--disable-gpu','--disable-dev-shm-usage','--disable-background-networking','--no-first-run','--hide-scrollbars',headlessWindowArgument,'--remote-debugging-port=0',`--user-data-dir=${profile}`,'about:blank'],{stdio:['ignore','ignore','pipe']});
    let launchError;chrome.once('error',e=>launchError=e);chrome.stderr.on('data',b=>stderr=(stderr+b).slice(-6000));
    const port=await until(async()=>{if(launchError)throw launchError;if(chrome.exitCode!==null||chrome.signalCode!==null)throw new Error(`Chromium exited ${chrome.exitCode}/${chrome.signalCode}: ${stderr}`);try{return(await readFile(resolve(profile,'DevToolsActivePort'),'utf8')).trim().split('\n');}catch{return null;}},'Chromium debugging endpoint');
    browser=await Cdp.connect(`ws://127.0.0.1:${port[0]}${port[1]}`);report.browser=await browser.send('Browser.getVersion');
    async function newPage(width){const {browserContextId}=await browser.send('Target.createBrowserContext'),{targetId}=await browser.send('Target.createTarget',{url:'about:blank',browserContextId});const targets=await(await fetch(`http://127.0.0.1:${port[0]}/json/list`)).json(),cdp=await Cdp.connect(targets.find(t=>t.id===targetId).webSocketDebuggerUrl);for(const d of ['Page','Runtime','Network','DOM','CSS'])await cdp.send(`${d}.enable`);
      const runtimeErrors=[];cdp.listeners.set('Runtime.exceptionThrown',p=>runtimeErrors.push(p.exceptionDetails?.exception?.description||p.exceptionDetails?.text||'runtime exception'));
      const nativeWindowEnvelope=await verifyHeadlessWindowEnvelope(cdp,{width,height:900});await cdp.send('Emulation.setDeviceMetricsOverride',{width,height:900,deviceScaleFactor:1,mobile:width<621});
      // Static deterministic data remain local. Explicit external requests are
      // denied as in P0; no local error or incomplete product readiness is hidden.
      cdp.listeners.set('Fetch.requestPaused',p=>{const u=new URL(p.request.url);cdp.send(u.origin===origin||['data:','blob:'].includes(u.protocol)?'Fetch.continueRequest':'Fetch.failRequest',{requestId:p.requestId,...(u.origin===origin||['data:','blob:'].includes(u.protocol)?{}:{errorReason:'BlockedByClient'})}).catch(e=>report.failures.push(`network interception: ${e.message}`));});await cdp.send('Fetch.enable',{patterns:[{urlPattern:'*'}]});
      return {cdp,nativeWindowEnvelope,runtimeErrors,close:async()=>{cdp.close();await browser.send('Target.disposeBrowserContext',{browserContextId});}};
    }
    stage='direct shell matrix';
    for(const spec of p1Cases){const result={...spec,status:'unverified',failures:[]};report.layouts.push(result);let page;try{page=await newPage(spec.width);result.nativeWindowEnvelope=page.nativeWindowEnvelope;await page.cdp.send('Page.navigate',{url:new URL(spec.path,base).href});await ready(page.cdp,spec.id,{direct:!spec.hosted});result.state=await inspectP1Snapshot(page.cdp,spec);result.failures.push(...validateP1Layout(result.state,spec));result.screenshot=await screenshot(page.cdp,settings.out,`${spec.caseId}.png`);result.failures.push(...page.runtimeErrors.map(e=>`runtime: ${e}`));result.status=result.failures.length?'failed':'passed';}catch(e){result.failures.push(e.stack||String(e));}finally{await page?.close();}report.failures.push(...result.failures.map(f=>`${spec.caseId}: ${f}`));console.log(JSON.stringify({case:spec.caseId,status:result.status,failures:result.failures}));}
    stage='native navigation journeys';
    for(const width of p1Widths)for(const mode of ['pointer','keyboard']){const journey={id:`${mode}-${width}`,width,mode,status:'unverified',steps:[],failures:[]};report.journeys.push(journey);let page;try{page=await newPage(width);journey.nativeWindowEnvelope=page.nativeWindowEnvelope;
      // Each destination starts from the same direct relay shell. It is a real
      // route change, including price -> dashboard ownership. Resetting the
      // document between destinations cannot synthesize any focus/hit result.
      for(const destination of [...p1Destinations.filter(d=>d.id!=='relay'),p1Destinations.find(d=>d.id==='relay')]){
        const start=destination.id==='relay'?'conference':'relay';await page.cdp.send('Page.navigate',{url:base+`?page=${start}`});await ready(page.cdp,start,{direct:true});
        const step={destination:destination.id,status:'unverified',inputs:[],failures:[]};journey.steps.push(step);
        try{await activateP1Navigation(page.cdp,destination,mode,step);
          if(destination.id==='outlook'){
            const back={destination:'relay',status:'unverified',inputs:[],failures:[]};journey.chartReturn=back;
            try{await activateP1Navigation(page.cdp,p1Destinations.find(d=>d.id==='relay'),mode,back);}
            catch(e){back.failures.push(e.stack||String(e));journey.failures.push(`chart-return: ${e.message}`);}
          }
        }catch(e){step.failures.push(e.stack||String(e));journey.failures.push(`${destination.id}: ${e.message}`);}
      }journey.screenshot=await screenshot(page.cdp,settings.out,`${journey.id}.png`);journey.failures.push(...page.runtimeErrors.map(e=>`runtime: ${e}`));journey.status=journey.failures.length?'failed':'passed';
    }catch(e){journey.failures.push(e.stack||String(e));}finally{await page?.close();}report.failures.push(...journey.failures.map(f=>`${journey.id}: ${f}`));console.log(JSON.stringify({journey:journey.id,status:journey.status,steps:journey.steps.filter(s=>s.status==='passed').length,failures:journey.failures}));}
  }catch(error){report.failures.push(`${stage}: ${error.stack||String(error)}`);report.blockedAt=stage;}
  finally{if(chrome)report.browserProcess={exitCode:chrome.exitCode,signalCode:chrome.signalCode,stderr};browser?.close();chrome?.kill('SIGKILL');if(server?.listening)await new Promise(ok=>server.close(ok));if(profile)await rm(profile,{recursive:true,force:true}).catch(e=>report.failures.push(`profile cleanup: ${e.message}`));
    if(!settings?.help){if(report.sourceHashes){try{report.sourceHashesAfter=await sourceInventory();report.sourceStable=JSON.stringify(report.sourceHashes)===JSON.stringify(report.sourceHashesAfter);if(!report.sourceStable)report.failures.push('served source bytes changed during verification');}catch(e){report.sourceStable=false;report.failures.push(`source recheck: ${e.message}`);}}
      Object.assign(report,p1FinalStatus(report));if(ownsOut)await writeFile(resolve(settings.out,'report.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({status:report.status,qualifiesP1Verification:report.qualifiesP1Verification,counts:report.counts,blockedAt:report.blockedAt||null,failures:report.failures.length,out:settings?.out||null}));if(report.status!=='passed')process.exitCode=1;
    }
  }return report;
}
if(process.argv[1] && import.meta.url===pathToFileURL(resolve(process.argv[1])).href)await verifyUiRenewalP1Browser();
