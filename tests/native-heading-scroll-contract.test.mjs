import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import {parseHTML} from 'linkedom';
import {refreshShellSlots} from '../dist/ui/shell-slots.js';
import {readNativeInteractiveTarget} from '../scripts/verify-workspace-browser.mjs';
import {readNativeHorizontalScrollOwner,planNativeHorizontalScrollGesture,planNativeHorizontalScrollWheel} from '../scripts/native-heading-scroll-contract.mjs';

const source=readFileSync(new URL('../scripts/verify-eth-candidate-browser.mjs',import.meta.url),'utf8');

// A deterministic layout/input boundary, not a claim about Chrome scrolling.
// The real product reparenting creates the owners. The input fixture locks to
// the nearest actual scroll ancestor at touchStart, independent of the planner.
function fixture(symbol='ETHUSD',{leak=null,overlay=false,innerWidth=240}={}){
  const eth=symbol==='ETHUSD',attribute=eth?'data-eth-action':'data-equity-action',dialogId=eth?'eth-data-dialog':'equity-detail-dialog';
  const {document,window}=parseHTML(`<html><body data-shell="chart"><main class="eth-app native-chart-workbench"><header class="eth-topbar atlas-canvas-heading">
    <button class="workbench-symbol">${symbol}</button><div id="workbench-frequency"><select><option>1D</option></select></div><button id="workbench-chart-type"><svg><path/></svg></button><button id="atlas-mode-menu"><svg><path/></svg></button>
    <button ${attribute}="forecast">모형</button><button ${attribute}="history">기록</button><button ${attribute}="research">자료</button><button ${attribute}="info">정보</button><button id="workbench-scenario">조건</button><button id="workbench-monthly-backtest">월말</button><button id="workbench-replay">Replay</button>
    <button id="workbench-workspace">작업</button><button id="workbench-chart-menu">메뉴</button><button id="lab-svg">저장</button><button id="atlas-display-options">설정</button>
    </header><div class="atlas-plot"></div></main><div id="cover"></div><dialog id="${dialogId}"><header><button>닫기</button></header><a href="http://atlas.test/data/${eth?'eth':symbol.toLowerCase()}-ohlc.json" target="_blank" rel="noopener noreferrer">보존한 일별 원자료(JSON) ↗</a><a href="http://atlas.test/?page=data">20개 자산 비교표 ↗</a></dialog></body></html>`);
  refreshShellSlots(document,{symbol});
  const bar=document.querySelector('.eth-topbar'),inner=document.querySelector('.shell-instrument-slot'),app=document.querySelector('.eth-app');
  const info=document.querySelector(`[${attribute}="info"]`),dialog=document.getElementById(dialogId),cover=document.getElementById('cover');
  const offsets=new WeakMap(),programmatic=[],inputs=[];let nativeWrite=false;
  const size=node=>node===inner?innerWidth:node.classList.contains('shell-history-slot')?0:node.classList.contains('workbench-symbol')?64:node.id==='workbench-frequency'?60:44;
  const barChildren=[...bar.children],innerChildren=[...inner.children];
  const total=nodes=>8+nodes.reduce((sum,node)=>sum+size(node)+1,0);
  const rect=(left,top,width,height)=>({left,top,right:left+width,bottom:top+height,width,height});
  function bounds(node){
    if(node===bar)return rect(0,0,320,48);
    if(node===app||node===document.body||node===document.documentElement)return rect(0,0,320,900);
    if(node===cover)return overlay?rect(0,0,320,48):rect(0,0,0,0);
    if(barChildren.includes(node))return rect(8+barChildren.slice(0,barChildren.indexOf(node)).reduce((sum,entry)=>sum+size(entry)+1,0)-bar.scrollLeft,0,size(node),48);
    if(innerChildren.includes(node))return rect(bounds(inner).left+innerChildren.slice(0,innerChildren.indexOf(node)).reduce((sum,entry)=>sum+size(entry)+1,0)-inner.scrollLeft,2,size(node),44);
    if(node.closest('button,select'))return bounds(node.closest('button,select')===node?node.parentElement:node.closest('button,select'));
    if(node.closest('svg'))return bounds(node.closest('svg').parentElement);
    return rect(0,0,0,0);
  }
  for(const node of document.querySelectorAll('*')){
    node.getBoundingClientRect=()=>bounds(node);node.getClientRects=()=>bounds(node).width?[bounds(node)]:[];
    node.checkVisibility=()=>!node.closest('[hidden]')&&bounds(node).width>0&&bounds(node).height>0;
    node.scrollIntoView=()=>{throw new Error('Programmatic reveal cannot supply native toolbar evidence');};
    Object.defineProperties(node,{clientLeft:{configurable:true,get:()=>0},clientTop:{configurable:true,get:()=>0},
      clientWidth:{configurable:true,get:()=>bounds(node).width},clientHeight:{configurable:true,get:()=>bounds(node).height},
      scrollWidth:{configurable:true,get:()=>node===bar?total(barChildren):node===inner?total(innerChildren):node===app&&leak==='app'?400:bounds(node).width},
      scrollLeft:{configurable:true,get:()=>offsets.get(node)||0,set(value){offsets.set(node,Math.max(0,Math.min(value,node.scrollWidth-node.clientWidth)));if(!nativeWrite)programmatic.push({node,value});}},
      scrollTop:{configurable:true,value:0,writable:true}});
  }
  for(const anchor of document.querySelectorAll('a'))Object.defineProperty(anchor,'relList',{get:()=>new Set((anchor.getAttribute('rel')||'').trim().split(/\s+/).filter(Boolean))});
  const style=node=>({overflowX:node===bar||node===inner?'auto':node===app?'hidden':'visible',overflowY:node===bar||node===inner||node===app?'hidden':'visible',
    touchAction:node===bar||node===inner?'pan-x pinch-zoom':'auto',display:node.hidden?'none':'block',visibility:'visible',outlineStyle:'none',outlineWidth:'0px',outlineColor:'rgb(0,0,0)'});
  const clip=node=>{
    const b={...bounds(node)};
    for(let owner=node.parentElement;owner;owner=owner.parentElement){const r=bounds(owner),css=style(owner);if(/auto|scroll|hidden|clip/.test(css.overflowX)){b.left=Math.max(b.left,r.left);b.right=Math.min(b.right,r.right);}if(/auto|scroll|hidden|clip/.test(css.overflowY)){b.top=Math.max(b.top,r.top);b.bottom=Math.min(b.bottom,r.bottom);}}
    b.left=Math.max(0,b.left);b.right=Math.min(320,b.right);b.top=Math.max(0,b.top);b.bottom=Math.min(900,b.bottom);b.width=Math.max(0,b.right-b.left);b.height=Math.max(0,b.bottom-b.top);return b;
  };
  const contains=(b,x,y)=>b.width>0&&b.height>0&&x>=b.left&&x<b.right&&y>=b.top&&y<b.bottom;
  document.elementFromPoint=(x,y)=>{
    if(overlay&&contains(bounds(cover),x,y))return cover;
    if(!contains(bounds(bar),x,y))return document.body;
    for(const node of [...innerChildren,...barChildren.filter(node=>node!==inner)])if(contains(clip(node),x,y))return node.querySelector('path,svg')||node;
    return contains(clip(inner),x,y)?inner:bar;
  };
  const context={document,innerWidth:320,innerHeight:900,scrollX:0,scrollY:0,getComputedStyle:style,URL,setTimeout,clearTimeout,
    location:new URL('http://atlas.test/'),
    IntersectionObserver:class{constructor(callback){this.callback=callback;}observe(node){queueMicrotask(()=>this.callback([{target:node,boundingClientRect:bounds(node),intersectionRect:clip(node)}]));}disconnect(){}},
    fetch:async url=>({ok:true,status:200,url,json:async()=>eth?{product:'ETH-USD',dailyHistory:{candles:[{}]}}:{product:symbol,candles:[{}]}})};
  const evaluate=async(_cdp,fn,...args)=>vm.runInNewContext('('+fn.toString()+')(...args)',{...context,args});
  let active=null,previousX=0;
  const nearest=node=>{for(let owner=node;owner;owner=owner.parentElement)if(/^(auto|scroll)$/.test(style(owner).overflowX)&&owner.scrollWidth>owner.clientWidth)return owner;return null;};
  const cdp={async send(method,params){
    if(method==='Input.dispatchTouchEvent'){
      const point=params.touchPoints[0];
      if(params.type==='touchStart'){active=nearest(document.elementFromPoint(point.x,point.y));previousX=point.x;inputs.push({owner:active,point:{...point},moves:0});}
      if(params.type==='touchMove'){
        nativeWrite=true;try{if(active)active.scrollLeft+=previousX-point.x;if(leak==='app')app.scrollLeft=1;if(leak==='other'&&active)(active===bar?inner:bar).scrollLeft+=1;}finally{nativeWrite=false;}
        previousX=point.x;inputs.at(-1).moves++;
      }
      if(params.type==='touchEnd')active=null;
    }
    if(method==='Input.dispatchMouseEvent'&&params.type==='mouseReleased'&&document.elementFromPoint(params.x,params.y)?.closest('button')===info)dialog.open=true;
    return {};
  }};
  const read=selector=>evaluate(cdp,readNativeHorizontalScrollOwner,selector);
  return {document,window,bar,inner,app,info,dialog,inputs,programmatic,context,evaluate,cdp,read};
}

export async function runToolbarFixture(runnerSource=source,symbol='ETHUSD',options={}){
  const f=fixture(symbol,options),start=runnerSource.includes('async function verifyNativeInfoToolbarScroll(')?runnerSource.indexOf('async function verifyNativeInfoToolbarScroll('):runnerSource.indexOf('async function verifyInfoDataLinks(');
  const block=runnerSource.slice(start,runnerSource.indexOf('async function equityCase(',start));
  assert.ok(start>=0&&block.includes('async function verifyInfoDataLinks('));
  let context;
  const evaluate=async(_cdp,fn,...args)=>{context.args=args;return vm.runInContext('('+fn.toString()+')(...args)',context);};
  context=vm.createContext({...f.context,assert,readNativeHorizontalScrollOwner,planNativeHorizontalScrollGesture,readNativeInteractiveTarget,
    evaluate,delay:async()=>{},settled:async()=>{},until:async fn=>{for(let i=0;i<30;i++){const result=await fn();if(result)return result;}throw new Error('Boundary fixture did not settle');},
    click:async(_cdp,selector)=>{assert.equal(selector,'#'+f.dialog.id+' > header > button');f.dialog.open=false;}});
  const api=vm.runInContext(block+'\n({verifyInfoDataLinks});',context);
  const result=await api.verifyInfoDataLinks(f.cdp,symbol);return {f,result:JSON.parse(JSON.stringify(result))};
}

test('actual shell reparenting makes the former outer-edge input belong to the inner owner',async()=>{
  const f=fixture(),outer=await f.read('.eth-topbar'),inner=await f.read('.shell-instrument-slot');
  assert.equal(f.info.parentElement,f.inner,'use the product shell transformation');
  const oldStart=outer.clip.right-16;
  assert.equal(f.document.elementFromPoint(oldStart,24).closest('.shell-instrument-slot'),f.inner);
  const point=planNativeHorizontalScrollGesture(outer,1,{maxDistance:160,inset:16});
  assert.ok(point.x<inner.box.left,'outer input must avoid the nested owner');
  assert.equal(point.nearestOwner,'header.eth-topbar.atlas-canvas-heading');
  assert.ok(point.distance>=44);assert.ok(point.endX>=outer.clip.left+16);
});

test('the reader clips to its real parent and rejects occlusion and insufficient exposed swipe space',async()=>{
  const f=fixture(),inner=await f.read('.shell-instrument-slot');
  assert.ok(inner.box.right>320);assert.equal(inner.clip.right,320);
  const point=planNativeHorizontalScrollGesture(inner,1,{maxDistance:160,inset:16});
  assert.equal(point.nearestOwner,'div.shell-instrument-slot');assert.ok(point.x<320&&point.endX>=inner.clip.left+16);
  const covered=await fixture('ETHUSD',{overlay:true}).read('.eth-topbar');
  assert.throws(()=>planNativeHorizontalScrollGesture(covered,1),/No exposed/);
  const narrow={...inner,clip:{...inner.clip,right:inner.clip.left+60}};
  assert.throws(()=>planNativeHorizontalScrollGesture(narrow,1,{inset:16}),/sufficient swipe space/);
});

test('directional boundaries and a descendant-owned input cannot masquerade as native outer movement',async()=>{
  const f=fixture(),state=await f.read('.eth-topbar');
  assert.throws(()=>planNativeHorizontalScrollGesture(state,-1),/directional boundary/);
  assert.throws(()=>planNativeHorizontalScrollGesture({...state,maximum:0},1),/actually overflow/);
  assert.throws(()=>planNativeHorizontalScrollGesture({...state,hits:state.hits.filter(hit=>!hit.owned)},1),/No exposed/);
});

test('a wheel can use a genuinely exposed owner without borrowing touch travel or a descendant hit',async()=>{
  const state=await fixture().read('.shell-instrument-slot');
  const narrow={...state,clip:{...state.clip,right:state.clip.left+60}};
  assert.throws(()=>planNativeHorizontalScrollGesture(narrow,1,{inset:16}),/sufficient swipe space/);
  const point=planNativeHorizontalScrollWheel(narrow,1);
  assert.equal(point.nearestOwner,'div.shell-instrument-slot');assert.ok(point.x>=narrow.clip.left&&point.x<narrow.clip.right);
  assert.throws(()=>planNativeHorizontalScrollWheel({...narrow,hits:narrow.hits.map(hit=>({...hit,owned:false}))},1),/No exposed/);
  assert.throws(()=>planNativeHorizontalScrollWheel(narrow,-1),/directional boundary/);
});

for(const symbol of ['ETHUSD','BMNR','MSTR'])test(symbol+' verifier proves both independent native owners and reveals the real info target',async()=>{
  const {f,result}=await runToolbarFixture(source,symbol);
  const proofs=result.gesture.gestures.filter(row=>row.label.endsWith('owner-proof'));
  assert.deepEqual(proofs.map(row=>row.owner),['outer','inner']);
  for(const proof of proofs){assert.ok(proof.after[proof.owner].scrollLeft>proof.before[proof.owner].scrollLeft);const other=proof.owner==='outer'?'inner':'outer';assert.equal(proof.after[other].scrollLeft,proof.before[other].scrollLeft);}
  assert.equal(f.programmatic.length,2,'only the two recorded fixture initializations may write scrollLeft');
  assert.ok(f.programmatic.every(row=>row.value===0));assert.ok(f.inputs.every(row=>row.moves===6));
  assert.ok(result.toolbarAccess.target.topmost);assert.equal(result.product,symbol==='ETHUSD'?'ETH-USD':symbol);assert.equal(f.dialog.open,false);
});

test('the actual verifier rejects scroll leakage into either the other owner or the app',async()=>{
  await assert.rejects(runToolbarFixture(source,'ETHUSD',{leak:'other'}),/must not move the inner scroll owner/);
  await assert.rejects(runToolbarFixture(source,'ETHUSD',{leak:'app'}),/must not scroll the clipped app shell/);
});
