import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {parseHTML} from 'linkedom';
import {createContentShell} from '../dist/content-shell.js';

const shellCss=readFileSync(new URL('../dist/ui/shell-layout.css',import.meta.url),'utf8').replace(/\/\*[\s\S]*?\*\//g,'');
const navRule=shellCss.match(/body\[data-shell=dashboard\] \.atlas-dashboard-nav > \.atlas-nav\s*\{([^}]+)\}/)?.[1];
assert.ok(navRule,'the actual dashboard scroll owner must have an authored rule');
const paddingDeclaration=navRule.match(/(?:^|;)\s*padding\s*:\s*([^;]+)/)?.[1].trim();
assert.match(paddingDeclaration,/^(?:0|\d+(?:\.\d+)?px)(?:\s+(?:0|\d+(?:\.\d+)?px)){0,3}$/,'the model reads the authored physical padding');
const paddingValues=paddingDeclaration.split(/\s+/).map(Number.parseFloat);
const sourcePaddingRight=paddingValues[1]??paddingValues[0];
const sourcePaddingLeft=paddingValues[3]??sourcePaddingRight;
assert.equal(sourcePaddingLeft,sourcePaddingRight,'the model expects the authored symmetric navigation edge space');

// DOM lifecycle and scroll-geometry models, not native browser measurements.
// The unchanged P1 gate still owns trusted Tab/pointer, paint and clipping proof.
function fixture({left=60, width=200, total=1000, padding=sourcePaddingRight}={}) {
  const names=['outlook','market-us','evidence','data','ipo','relay','conference'];
  const {document,window}=parseHTML(`<html><body data-shell="dashboard" data-page="relay">
    <header class="atlas-dashboard-header"><h1>릴레이 콘텐츠</h1></header>
    <aside class="atlas-sidebar"><nav class="atlas-nav">${names.map(id=>`<button data-atlas-page="${id}">${id}</button>`).join('')}</nav><span id="next"></span></aside>
    <div class="workspace"><main id="main"><section id="relay-view"></section><footer class="footer"></footer></main></div>
    <button id="outside">다른 조작</button></body></html>`);
  const nav=document.querySelector('.atlas-nav'), home=nav.parentElement;
  const moves=[], restoredFocus=[], positions=new Map(), observed=new Set();
  let scrollLeft=0, active=document.getElementById('outside'), resizeCallback;
  Object.defineProperty(document,'activeElement',{get:()=>active});
  Object.defineProperties(nav,{
    clientLeft:{get:()=>0}, clientWidth:{get:()=>width}, scrollWidth:{get:()=>total},
    scrollLeft:{get:()=>scrollLeft},
  });
  nav.getBoundingClientRect=()=>({left,right:left+width,top:60,bottom:104,width,height:44});
  window.getComputedStyle=node=>node===nav?{paddingLeft:`${padding}px`,paddingRight:`${padding}px`}:{};
  const scroll=amount=>{
    scrollLeft=Math.max(0,Math.min(total-width,scrollLeft+amount));
    nav.dispatchEvent(new window.Event('scroll'));
  };
  nav.scrollBy=options=>{moves.push({...options});scroll(options.left);};
  for (const node of [document.body,document.querySelector('.workspace'),document.getElementById('relay-view')]) {
    node.scrollBy=()=>assert.fail('navigation reveal must not move another scroll owner');
    node.scrollIntoView=()=>assert.fail('navigation reveal must not scroll ancestors');
  }
  for (const [index,node] of [...nav.children].entries()) {
    positions.set(node,{offset:4+index*130,width:122});
    node.getBoundingClientRect=()=>{
      const position=positions.get(node), start=left+position.offset-scrollLeft;
      return {left:start,right:start+position.width,top:60,bottom:104,width:position.width,height:44};
    };
    node.scrollIntoView=()=>assert.fail('reveal must stay inside the navigation owner');
    node.focus=options=>{restoredFocus.push(options);active=node;};
  }
  window.ResizeObserver=class {
    constructor(callback){resizeCallback=callback;}
    observe(node){observed.add(node);}
    disconnect(){observed.clear();}
  };
  const shell=createContentShell({document});
  const target=id=>nav.querySelector(`[data-atlas-page="${id}"]`);
  const place=(id,offset,itemWidth)=>{positions.set(target(id),{offset,width:itemWidth});return target(id);};
  const focus=node=>{active=node;node.dispatchEvent(new window.Event('focusin',{bubbles:true}));};
  shell.setActive(true);
  return {document,window,nav,home,shell,moves,restoredFocus,observed,target,place,focus,scroll,
    resize(value){width=value;resizeCallback();},
    box:node=>node.getBoundingClientRect(),
    fullyExposed(node){const box=node.getBoundingClientRect(),owner=nav.getBoundingClientRect();return box.left>=owner.left&&box.right<=owner.right;},
  };
}

test('the scroll model uses real physical edge padding from the product stylesheet',()=>{
  assert.equal(sourcePaddingRight,4);
  assert.match(navRule,/(?:^|;)\s*box-sizing\s*:\s*border-box\s*;/);
  assert.match(navRule,/(?:^|;)\s*scroll-padding-inline\s*:\s*4px\s*;/);
});

test('focus exposes whole Mac-sized clipped pills synchronously without moving focus or other owners',()=>{
  for (const sample of [
    {id:'data',left:60,width:200,right:303.39,itemWidth:100},
    {id:'relay',left:60,width:200,right:323.67,itemWidth:150},
    {id:'evidence',left:60,width:270,right:348.5,itemWidth:100},
    {id:'ipo',left:60,width:270,right:380.25,itemWidth:100},
    {id:'conference',left:60,width:270,right:440.5,itemWidth:160},
    {id:'relay',left:72,width:624,right:785.86,itemWidth:170},
  ]) {
    const f=fixture(sample),node=f.place(sample.id,sample.right-sample.left-sample.itemWidth,sample.itemWidth);
    assert.equal(f.fullyExposed(node),false,'the input must represent a clipped whole pill');
    f.focus(node);
    assert.equal(f.document.activeElement,node);
    assert.equal(f.fullyExposed(node),true,`${sample.id} at owner width ${sample.width}`);
    assert.equal(f.moves.length,1,'the focus event itself repairs the local scroll');
    assert.equal(f.moves[0].behavior,'instant');
    assert.deepEqual(f.restoredFocus,[],'reveal does not synthesize another focus');
    assert.equal(f.document.querySelectorAll('.atlas-nav').length,1);
    assert.equal(f.nav.children.length,7);
  }
});

test('the same focused target is rechecked after a native-like focus default scroll',async()=>{
  const f=fixture(),node=f.place('data',143.39,100);
  f.focus(node);
  assert.equal(f.fullyExposed(node),true,'synchronous focusin reveal is retained');
  f.scroll(-f.nav.scrollLeft);
  assert.equal(f.fullyExposed(node),false,'model the platform finishing its default focus scroll after focusin');
  await Promise.resolve();
  assert.equal(f.document.activeElement,node);
  assert.equal(f.fullyExposed(node),true);
  assert.equal(f.moves.length,2);
  assert.deepEqual(f.restoredFocus,[]);
});

test('the deferred focus check ignores a stale target and an unmounted owner',async()=>{
  for (const exit of ['different-focus','unmounted']) {
    const f=fixture(),node=f.place('relay',113.67,150);
    f.focus(node);
    assert.equal(f.fullyExposed(node),true);
    if (exit==='different-focus') f.focus(f.document.getElementById('outside'));
    else f.shell.setActive(false);
    f.scroll(-f.nav.scrollLeft);
    await Promise.resolve();
    assert.equal(f.nav.scrollLeft,0,exit);
    assert.equal(f.moves.length,1,exit);
  }
});

test('reverse focus reveals the leading edge, while an already exposed target does not move',()=>{
  const f=fixture(),node=f.place('evidence',100,100);
  f.scroll(200);
  assert.equal(f.fullyExposed(node),false);
  f.focus(node);
  assert.equal(f.fullyExposed(node),true);
  assert.ok(f.moves[0].left<0);
  const position=f.nav.scrollLeft;
  f.focus(node);
  assert.equal(f.nav.scrollLeft,position);
  assert.equal(f.moves.length,1);
  f.focus(f.document.getElementById('outside'));
  assert.equal(f.moves.length,1);
});

test('physical end padding leaves the fractional final pill inside the clip at maximum scroll',()=>{
  // The 768 Mac receipt ends 0.31px outside an integer client clip. Scroll
  // commands cannot exceed the real maximum; actual CSS edge space must exist.
  const bare=fixture({left:72,width:624,total:760,padding:0});
  const bareLast=bare.place('conference',600.31,160);
  bare.focus(bareLast);
  assert.equal(bare.nav.scrollLeft,136);
  assert.equal(bare.fullyExposed(bareLast),false,'negative control: no padding cannot reveal the fractional tail');
  const padded=fixture({left:72,width:624,total:Math.round(760.31+sourcePaddingRight)});
  const paddedLast=padded.place('conference',600.31,160);
  padded.focus(paddedLast);
  assert.equal(padded.nav.scrollLeft,140);
  assert.equal(padded.fullyExposed(paddedLast),true);
  assert.ok(padded.box(paddedLast).right<696,'padding keeps the target physically inside the unchanged clip');
});

test('resizing the owner exposes its focused pill without scrolling when focus is elsewhere',()=>{
  const f=fixture({width:624,left:72}),node=f.place('relay',350,170);
  f.focus(node);
  assert.equal(f.moves.length,0);
  f.resize(270);
  assert.equal(f.fullyExposed(node),true);
  assert.equal(f.moves.length,1);
  f.focus(f.document.getElementById('outside'));
  f.resize(200);
  assert.equal(f.moves.length,1);
});

test('pointer arrows and native scrolling are not snapped back to a previously focused pill',async()=>{
  const f=fixture(),node=f.place('outlook',4,100);
  f.focus(node);
  await Promise.resolve();
  f.document.querySelector('[data-shell-nav-scroll=next]').dispatchEvent(new f.window.Event('click',{bubbles:true}));
  assert.equal(f.nav.scrollLeft,150);
  assert.equal(f.moves.length,1);
  f.scroll(80);
  assert.equal(f.nav.scrollLeft,230);
  assert.equal(f.moves.length,1,'scroll events update arrows without recentering focus');
});

test('unmount removes reveal listeners and repeated re-entry retains the original navigation',()=>{
  const f=fixture(),node=f.place('data',180,100),original=[...f.nav.children];
  f.shell.setActive(false);
  assert.equal(f.nav.parentElement,f.home);
  assert.equal(f.observed.size,0);
  f.focus(node);
  assert.equal(f.moves.length,0,'restored sidebar/chart ownership has no dashboard reveal listener');
  f.shell.setActive(true);
  assert.equal(f.fullyExposed(node),true,'re-entry preserves and exposes the original focused target');
  assert.deepEqual([...f.nav.children],original);
  const before=f.moves.length;
  f.shell.setActive(true);
  f.scroll(-f.nav.scrollLeft);
  f.focus(node);
  assert.equal(f.moves.length,before+1,'re-entry does not add duplicate reveal listeners');
  f.shell.setActive(false);
  f.scroll(-f.nav.scrollLeft);
  f.focus(node);
  assert.equal(f.moves.length,before+1);
});
