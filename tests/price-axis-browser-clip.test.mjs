import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {inspectPriceAxis, installCanvasDrawTap} from '../scripts/verify-price-axis-browser.mjs';
import {
  priceAxisHasEmptyInsetClip, priceAxisPaintStyleState, priceAxisOverlapEvidence, validatePriceAxisState,
} from '../scripts/price-axis-browser-contract.mjs';

test('empty inset proof accepts only closed opposing sides, including valid CSS shorthand and zero lengths',()=>{
  for(const value of ['inset(50%)','inset(100%)','inset(100% 0)','inset(0 50%)','inset(60% 0px 40%)',
    'inset(0 99% 0 1%)','inset(50% 0px 50% 0)','inset(.5% 0 99.5% 0px)',' INSET(+50% +0PX) ',
    'inset(0.0px 50% .0 50%)','inset(100.0000000000000000000000000000000001% 0)']){
    assert.equal(priceAxisHasEmptyInsetClip(value),true,value);
  }
  for(const value of ['inset(0)','inset(0px)','inset(49%)','inset(49% 49%)','inset(60% 60% 0 0)',
    'inset(99% 0 0 1%)','inset(40% 0 59.99%)','inset(0 49% 0 50%)']){
    assert.equal(priceAxisHasEmptyInsetClip(value),false,value);
  }
});

test('decimal boundaries do not round a tiny positive clipping area into an empty one',()=>{
  const below='49.'+'9'.repeat(60),above='50.'+'0'.repeat(59)+'1';
  assert.equal(Number(below),50,'this input deliberately defeats floating-point classification');
  for(const value of [`inset(${below}%)`,`inset(${below}% 0 50%)`,`inset(0 ${below}% 0 50%)`]){
    assert.equal(priceAxisHasEmptyInsetClip(value),false,value);
  }
  for(const value of [`inset(${below}% 0 ${above}%)`,`inset(0 ${below}% 0 ${above}%)`,`inset(${above}%)`]){
    assert.equal(priceAxisHasEmptyInsetClip(value),true,value);
  }
});

test('malformed, negative, nonzero lengths and unsupported clip grammars retain the strict path',()=>{
  for(const value of [null,undefined,50,{},'', 'none','inset()','inset(50.%)','inset(0. 50%)',
    'inset(50% 0 50% 0 0)','inset(50%, 0)','inset(-50%)','inset(-0 50%)','inset(50% 1px)',
    'inset(50% 0em)','inset(50% -1px)','inset(1e2% 0)','inset(Infinity%)','inset(NaN%)',
    'inset(calc(50%))','inset(50% round 0)','inset(50%) border-box','border-box inset(50%)',
    'circle(0 at 50% 50%)','polygon(0 0, 0 0, 0 0)','url(#empty-rect)',
    'inset(50%) garbage','prefix inset(50%)','inset(50%) inset(50%)','inset(50%) /* trailing */']){
    assert.equal(priceAxisHasEmptyInsetClip(value),false,String(value));
  }
});

// A deliberately small DOM/Range/computed-style model. All rectangles below
// are supplied inputs, not native browser geometry or a visual QA receipt.
const box=(left,top,width,height)=>({left,top,right:left+width,bottom:top+height,width,height});
const NodeValues={TEXT_NODE:3,DOCUMENT_POSITION_PRECEDING:2,DOCUMENT_POSITION_FOLLOWING:4};
const style={display:'block',visibility:'visible',opacity:'1',contentVisibility:'visible',clipPath:'none',
  overflowX:'visible',overflowY:'visible',backgroundColor:'transparent',fill:'#fff',fillOpacity:'1',stroke:'none',
  strokeOpacity:'1',strokeWidth:'0px',strokeDasharray:'none',vectorEffect:'non-scaling-stroke',pointerEvents:'none',
  position:'static',zIndex:'auto',content:'none',fontFamily:'Fixture'};
const identity={a:1,b:0,c:0,d:1,e:0,f:0};

class Element {
  constructor(localName,attrs={},bounds=box(0,0,1,1),css={}){
    this.nodeType=1;this.localName=localName;this.attrs={...attrs};this.rect=bounds;this.css={...style,...css};
    this.childNodes=[];this.parentElement=null;this.dataset={};this.hidden=false;this.scrollWidth=320;
    for(const [name,value] of Object.entries(attrs))if(name.startsWith('data-'))this.dataset[name.slice(5).replace(/-([a-z])/g,(_,letter)=>letter.toUpperCase())]=value;
  }
  get id(){return this.attrs.id||'';}
  get children(){return this.childNodes.filter(node=>node.nodeType===1);}
  get lastElementChild(){return this.children.at(-1)||null;}
  get ownerSVGElement(){return this.parentElement?.closest('svg')||null;}
  get textContent(){return this.childNodes.map(node=>node.textContent).join('');}
  getAttribute(name){return this.attrs[name]??null;}
  hasAttribute(name){return Object.hasOwn(this.attrs,name);}
  append(node){node.parentElement=this;this.childNodes.push(node);return node;}
  text(value){return this.append({nodeType:3,textContent:value,parentElement:null});}
  insertBefore(node,before){node.parentElement=this;this.childNodes.splice(this.childNodes.indexOf(before),0,node);return node;}
  contains(node){for(let current=node;current;current=current.parentElement)if(current===this)return true;return false;}
  getBoundingClientRect(){return {...this.rect};}
  getScreenCTM(){return this.localName==='svg'?this.matrix||identity:this.ownerSVGElement?.matrix||identity;}
  descendants(){return this.children.flatMap(node=>[node,...node.descendants()]);}
  matches(selectors){return selectors.split(',').some(selector=>this.matchesChain(selector.trim().split(/\s+/)));}
  matchesChain(parts){
    if(!this.matchesSimple(parts.at(-1)))return false;
    let parent=this.parentElement;
    for(let index=parts.length-2;index>=0;index--){while(parent&&!parent.matchesSimple(parts[index]))parent=parent.parentElement;if(!parent)return false;parent=parent.parentElement;}
    return true;
  }
  matchesSimple(selector){
    if(selector==='*')return true;
    const atoms=selector.match(/^[\w-]+|#[\w-]+|\.[\w-]+|\[[^\]]+\]/g)||[];
    assert.equal(atoms.join(''),selector,'extend the explicit fixture selector model if the collector needs new syntax');
    return atoms.every(atom=>{
      if(atom[0]==='#')return this.id===atom.slice(1);
      if(atom[0]==='.')return (this.attrs.class||'').split(/\s+/).includes(atom.slice(1));
      if(atom[0]==='['){const match=/^\[([\w:-]+)(?:=(?:"([^"]*)"|'([^']*)'|([^\]]+)))?\]$/.exec(atom);assert.ok(match);return atom.includes('=')?this.getAttribute(match[1])===(match[2]??match[3]??match[4]):this.hasAttribute(match[1]);}
      return this.localName===atom;
    });
  }
  closest(selector){for(let current=this;current;current=current.parentElement)if(current.matches(selector))return current;return null;}
  querySelectorAll(selector){return this.descendants().filter(node=>node.matches(selector));}
  querySelector(selector){return this.querySelectorAll(selector)[0]||null;}
  compareDocumentPosition(other){let root=this;while(root.parentElement)root=root.parentElement;const nodes=[root,...root.descendants()];return nodes.indexOf(other)<nodes.indexOf(this)?2:4;}
}

const expected={symbol:'BTCUSD',source:'Coin Metrics',date:'2026-11-06',rawValue:75826.5258667446,text:'$75,826.53'};
const lastTime=Date.UTC(2026,10,6),W=320,H=500,gutterLeft=256,mainHeight=450,hostTop=100,glyph=5;
const tickRows=[['100,000.00',60],['50,000.00',130],['25,000.00',300],['10,000.00',390]],tagRect={x:258,y:190,w:60,h:20};
// Synthetic engine output: the draw calls the Funnest painter makes for the axis and the pixels they leave. They are
// inputs to the collector, not a browser paint receipt.
function engine({ticks=tickRows,latest=['75,826.53',200],rule=true,bottom=true,extra=()=>{}}={}){
  const texts=[...ticks.map(([text,y],index)=>[text,y,index+1]),[...latest,100]].map(([text,y,order])=>({order,text,x:gutterLeft+8,y,font:'12px Fixture',align:'left',baseline:'middle',fill:'#7e7e87',alpha:1,width:text.length*glyph,ascent:7,descent:7}));
  const rects=[{order:90,...tagRect,fill:'#d53544',alpha:1}];
  const data=new Uint8ClampedArray(W*H*4),set=(x,y,color)=>data.set(color,(y*W+x)*4);
  for(let y=0;y<H;y++)for(let x=0;x<W;x++)set(x,y,[20,20,21,255]);
  if(rule)for(let y=0;y<mainHeight;y++)set(gutterLeft,y,[48,48,52,255]);
  if(bottom)for(let x=0;x<W;x++)set(x,mainHeight,[48,48,52,255]);
  for(let y=tagRect.y;y<tagRect.y+tagRect.h;y++)for(let x=tagRect.x;x<tagRect.x+tagRect.w;x++)set(x,y,[213,53,68,255]);
  for(const {text,x,y} of texts)for(let px=x;px<x+text.length*glyph;px+=2)set(px,Math.round(y),[200,200,205,255]);
  extra(set);
  return {texts,rects,data};
}
function surface(data,css={}){
  const el=new Element('canvas',{},box(0,hostTop,W,H),css);el.width=W;el.height=H;
  el.getContext=()=>({getImageData(x,y,width,height){
    const out=new Uint8ClampedArray(width*height*4);
    for(let row=0;row<height;row++)out.set(data.subarray(((y+row)*W+x)*4,((y+row)*W+x+width)*4),row*width*4);
    return {data:out};
  }});
  return el;
}
function fixture(options={}){
  const html=new Element('html',{'data-boot':'ready'},box(0,0,320,900)),body=html.append(new Element('body',{'data-page':'outlook'},box(0,0,320,900)));
  const plot=body.append(new Element('div',{class:'atlas-plot'},box(0,hostTop,W,H)));
  const host=plot.append(new Element('div',{class:'atlas-funnest-canvas'},box(0,hostTop,W,H)));
  const drawn=engine(options),base=host.append(surface(drawn.data)),top=host.append(surface(new Uint8ClampedArray(W*H*4)));
  const bars=[{time:lastTime-86400000,open:1,high:1,low:1,close:1},{time:lastTime,open:expected.rawValue,high:expected.rawValue,low:expected.rawValue,close:expected.rawValue}];
  host.getAtlasFunnestSnapshot=()=>({engine:'funnest',state:'ready',painted:true,legacy:{priceNodes:0},chartType:'line',sourceMode:'close-only',currency:'USD',timeUnit:'UTC milliseconds',source:{name:'Coin Metrics'},engineBars:bars,
    layout:{width:W,height:H,plotWidth:gutterLeft,panesHeight:mainHeight,timeAxisHeight:28,panes:[{id:'main',kind:'main',top:0,height:mainHeight}]}});
  const svg=plot.append(new Element('svg',{id:'lab-chart',viewBox:'0 0 320 500'},box(0,hostTop,W,H),{overflowX:'hidden',overflowY:'hidden'}));
  svg.matrix={...identity,f:hostTop};svg.viewBox={baseVal:{x:0,y:0,width:W,height:H}};
  const manager=plot.append(new Element('div',{id:'chart-indicator-manager'},box(10,150,200,60)));
  const clock=manager.append(new Element('p',{id:'indicator-readout-date','aria-hidden':'true'},box(270,155,1,1),{clipPath:'inset(50%)'}));clock.text('2026-11-06');
  const child=clock.append(new Element('span',{id:'clock-child'},box(270,155,1,1)));child.text('clock descendant');
  const sibling=manager.append(new Element('span',{id:'visible-overlay'},box(20,150,80,14)));sibling.text('visible legend');
  const metrics=body.append(new Element('div',{id:'lab-metrics','data-kind':'observed'},box(0,700,100,14)));
  metrics.append(new Element('div',{class:'readout-main'})).append(new Element('strong')).text(expected.text);
  const calls=new Map([[base,{sequence:2,texts:drawn.texts,rects:drawn.rects}]]);
  const document={documentElement:html,body,fonts:{status:'loaded'},
    querySelectorAll:selector=>[html,...html.descendants()].filter(node=>node.matches(selector)),
    querySelector(selector){return this.querySelectorAll(selector)[0]||null;},
    getElementById:id=>[html,...html.descendants()].find(node=>node.id===id)||null,
    elementFromPoint:(x,y)=>f.hitOverride?.(x,y)??top,elementsFromPoint:()=>[top,host],
    createRange(){let text;return {selectNodeContents(node){text=node;},getClientRects(){return [{...(text.rect||text.parentElement.rangeRect||text.parentElement.rect)}];}};},
  };
  const environment={document,Node:NodeValues,URLSearchParams,innerWidth:320,innerHeight:900,
    getComputedStyle:(node,pseudo)=>pseudo?{...style,display:'none',content:'none'}:node.css,
    DOMPoint:class{constructor(x,y){this.x=x;this.y=y;}matrixTransform(m){return {x:m.a*this.x+m.c*this.y+m.e,y:m.b*this.x+m.d*this.y+m.f};}},
    window:{__atlasPriceAxisReadout:{price:expected.rawValue,date:expected.date,kind:'observed'},...(options.tap===false?{}:{__atlasCanvasDraws:canvas=>calls.get(canvas)||null})},
    location:{href:'http://fixture.invalid/?page=outlook',search:'?page=outlook'},
  };
  const f={environment,html,body,plot,host,base,top,svg,manager,clock,child,sibling,calls,hitOverride:null};
  return f;
}

// Exercise the real evaluate() serialization path. The target VM deliberately
// has neither helper in its globals, so a missing helper injection must fail.
const harness=readFileSync(new URL('../scripts/verify-price-axis-browser.mjs',import.meta.url),'utf8');
const evaluateStart=harness.indexOf('async function evaluate('),evaluateEnd=harness.indexOf('\nasync function until(',evaluateStart);
assert.ok(evaluateStart>=0&&evaluateEnd>evaluateStart);
const evaluate=runInNewContext('('+harness.slice(evaluateStart,evaluateEnd)+')',{inspectPriceAxis,priceAxisPaintStyleState,priceAxisHasEmptyInsetClip});
async function inspect(f){
  let count=0;
  const state=await evaluate({async send(method,params){
    count++;assert.equal(method,'Runtime.evaluate');assert.equal(params.returnByValue,true);assert.equal(params.awaitPromise,true);
    return {result:{value:runInNewContext(params.expression,f.environment)}};
  }},inspectPriceAxis,'BTCUSD');
  assert.equal(count,1);return JSON.parse(JSON.stringify(state));
}
const failures=state=>validatePriceAxisState(state,expected,{width:320,height:900});
const clockObstacles=state=>state.obstacles.filter(item=>/indicator-readout-date|clock-child/.test(item.element));
const has=(state,pattern)=>assert.ok(failures(state).some(issue=>pattern.test(issue)),String(pattern)+' in '+JSON.stringify(failures(state)));

test('serialized collector reads each label box, the tag, the rule and the bottom line from the recorded draws and pixels',async()=>{
  const state=await inspect(fixture()),{labels,ink}=state.canvas;
  assert.deepEqual(failures(state),[]);
  assert.deepEqual(state.canvas.axisRect,{left:256,top:100,right:320,bottom:550,width:64,height:450});
  assert.deepEqual(labels.ticks.map(tick=>[tick.text,tick.anchor.x,tick.anchor.y]),tickRows.map(([text,y])=>[text,264,hostTop+y]));
  assert.deepEqual(labels.ticks[0].box,{left:264,top:153,right:314,bottom:167,width:50,height:14});
  assert.deepEqual([labels.ticks[0].hit.insideHost,labels.ticks[0].hit.x,labels.ticks[0].hit.y,labels.ticks[0].hit.target],[true,289,160,'canvas']);
  assert.ok(labels.ticks.every(tick=>tick.ink>0&&tick.fill==='#7e7e87'&&tick.alpha===1));
  assert.equal(labels.latest.text,'75,826.53');assert.deepEqual(labels.latest.badge.rect,{left:258,top:290,right:318,bottom:310,width:60,height:20});
  assert.equal(labels.countdown,null);assert.equal(labels.badgeCount,1);assert.equal(labels.frame.sequence,2);
  assert.deepEqual([ink.readable,ink.modal,ink.ruleColumns,ink.strayInkPixels],[true,'20,20,21,255',[0],0]);
  assert.deepEqual(ink.rule.rect,{left:256,top:100,right:257,bottom:550,width:1,height:450});
  assert.deepEqual([ink.bottomLine.row,ink.bottomLine.rect.top,ink.bottomLine.rect.right],[450,550,320]);
  assert.deepEqual([state.canvas.lastBar.close,state.canvas.lastIntervalMs,state.canvas.legacyPriceNodes,state.canvas.tapInstalled],[expected.rawValue,86400000,0,true]);
  assert.deepEqual([state.readout.priceText,state.readout.date,state.readout.kind],[expected.text,expected.date,'observed']);
});

test('without the draw recorder the collector reports it instead of guessing labels from pixels',async()=>{
  const state=await inspect(fixture({tap:false}));
  assert.equal(state.canvas.tapInstalled,false);assert.equal(state.canvas.labels,null);
  has(state,/draw recorder is not installed/);has(state,/no price-axis draw calls were recorded/);
});

test('a label wider than its gutter, a colliding label and a wrong tag text fail the collected state',async()=>{
  has(await inspect(fixture({ticks:[['1,000,000,000.00',60],...tickRows.slice(1)]})),/tick-0: (?:clipped or outside chart\/viewport|clipped painted bounds)/);
  has(await inspect(fixture({ticks:[tickRows[0],['50,000.00',65],...tickRows.slice(2)]})),/tick-0\/tick-1: labels overlap/);
  has(await inspect(fixture({latest:['75,826.54',200]})),/latest label "75,826.54" does not match Coin Metrics 2026-11-06 75,826.53/);
  has(await inspect(fixture({ticks:[tickRows[0],['50,000.00',195],...tickRows.slice(2)]})),/tick-1\/latest-tag: labels overlap/);
  has(await inspect(fixture({ticks:[tickRows[0],tickRows[0],...tickRows.slice(2)]})),/duplicate painted tick text/);
});

test('ink that no label, tag or rule accounts for, and a broken rule or bottom line, fail the collected state',async()=>{
  const stray=await inspect(fixture({extra:set=>{for(let y=240;y<246;y++)for(let x=280;x<284;x++)set(x,y,[232,196,109,255]);}}));
  assert.equal(stray.canvas.ink.strayInkPixels,24);has(stray,/canvas paint covers the price axis outside its labels \(24 pixels\)/);
  has(await inspect(fixture({rule:false})),/axis: does not span the complete frame/);
  has(await inspect(fixture({extra:set=>set(gutterLeft,200,[232,196,109,255])})),/axis: does not span the complete frame/);
  has(await inspect(fixture({bottom:false})),/bottom: the frame line does not meet the left frame and price axis/);
  has(await inspect(fixture({extra:set=>set(100,mainHeight,[20,20,21,255])})),/bottom: the frame line does not meet/);
  const invisible=await inspect(fixture({extra:set=>{for(let x=264;x<314;x++)set(x,60,[20,20,21,255]);}}));
  has(invisible,/tick-0: price text has no visible/);
});

test('a covered label center hit and an overlay over a tick, the tag or the rule all fail',async()=>{
  const covered=fixture();covered.hitOverride=(x,y)=>x>=264&&x<=314&&y>=153&&y<=167?covered.manager:null;
  has(await inspect(covered),/tick-0: center hit is not the chart \(div#chart-indicator-manager\)/);
  const over=fixture();over.manager.rect=box(250,150,70,30);over.manager.css.backgroundColor='rgb(32, 32, 39)';
  const state=await inspect(over);
  has(state,/tick-0: legend .*occludes/);has(state,/frame-axis: legend .*occludes/);
  assert.ok(priceAxisOverlapEvidence(state).intrudedArea>0);
  const tag=fixture();tag.manager.rect=box(300,295,10,10);tag.manager.css.backgroundColor='rgb(32, 32, 39)';
  has(await inspect(tag),/latest-tag: legend .*occludes 100 square CSS pixels/);
});

test('event, forecast and other SVG overlay marks are classified, and canvas forecast paint is counted',async()=>{
  const f=fixture(),painted={fill:'#e8c46d',stroke:'none'};
  f.svg.append(new Element('g',{'data-history-event-label':'e1'})).append(new Element('rect',{},box(20,300,20,10),painted));
  f.svg.append(new Element('g',{'data-cycle-marker':'m1'})).append(new Element('text',{},box(60,300,20,10),painted));
  f.svg.append(new Element('g',{'data-forecast-evidence':'true'})).append(new Element('circle',{},box(100,300,10,10),painted));
  f.svg.append(new Element('g')).append(new Element('path',{d:'M0 0'},box(140,300,10,10),painted));
  const state=await inspect(f),count=category=>state.overlays.paintObjectCounts[category];
  assert.deepEqual([count('event'),count('forecast'),state.obstacles.filter(item=>item.surface==='svg'&&item.category==='hud').length],[2,1,1]);
  assert.deepEqual(failures(state),[]);
  f.plot.inspectAtlasOverlayRender=()=>({forecastSegments:{count:7}});
  const painter=await inspect(f);
  assert.deepEqual([painter.overlays.forecastPaint,painter.overlays.paintObjectCounts.forecast,painter.overlays.observations.forecast.renderedCount],[{source:'funnest overlay painter',segments:7},8,7]);
  const g=fixture();g.host.getAtlasBtcRenderSnapshot=()=>({paint:{paths:{forecast:{subpaths:[[{x:1},{x:2},{x:3}],[{x:4},{x:5}]]}}}});
  const btc=await inspect(g);
  assert.deepEqual([btc.overlays.forecastPaint,btc.overlays.paintObjectCounts.forecast],[{source:'btc funnest render',segments:3},3]);
  const absent=await inspect(fixture());
  assert.equal(absent.overlays.forecastPaint,null);assert.deepEqual(absent.overlays.unobservedCategories,['event','forecast']);
});

test('serialized collector excludes proven-empty sr-only text and descendants while keeping a painted sibling',async()=>{
  for(const clip of ['inset(50%)','inset(0 50%)','inset(60% 0 40% 0)']){
    const f=fixture();f.clock.css.clipPath=clip;const state=await inspect(f);
    assert.equal(clockObstacles(state).length,0);assert.equal(state.geometryIssues.length,0);
    assert.ok(state.obstacles.some(item=>item.element==='span#visible-overlay'));
    assert.deepEqual(failures(state),[]);assert.equal(f.clock.css.clipPath,clip,'inspection remains read-only');
  }
});

test('the same ID, aria-hidden, pointer-events:none and a 1px box cannot hide visible clock ink',async()=>{
  for(const clip of ['none','inset(49.9999%)','inset(49.'+'9'.repeat(60)+'%)']){
    const f=fixture();f.clock.css.clipPath=clip;const state=await inspect(f);
    assert.equal(f.clock.getAttribute('aria-hidden'),'true');assert.equal(f.clock.css.pointerEvents,'none');assert.equal(f.clock.rect.width,1);
    assert.ok(clockObstacles(state).some(item=>item.element==='p#indicator-readout-date'));
    assert.ok(clockObstacles(state).some(item=>item.element==='span#clock-child'));
    has(state,/occludes/);
    if(clip==='none')assert.equal(state.geometryIssues.length,0);
    else assert.ok(state.geometryIssues.some(issue=>issue.includes('unsupported clip geometry')&&issue.includes(clip)));
  }
});

test('an unknown descendant clip is irrelevant only when an ancestor box proves zero paint area',async()=>{
  const f=fixture();f.child.css.clipPath='circle(50%)';
  const hidden=await inspect(f);assert.equal(clockObstacles(hidden).length,0);assert.equal(hidden.geometryIssues.length,0);assert.deepEqual(failures(hidden),[]);
  f.clock.css.clipPath='none';const visible=await inspect(f);
  assert.ok(clockObstacles(visible).some(item=>item.element==='span#clock-child'));
  assert.ok(visible.geometryIssues.some(issue=>issue.includes('span#clock-child: circle(50%)')));
  has(visible,/^geometry:/);
});

test('display:contents does not supply an empty clipping box for its visible descendants',async()=>{
  const f=fixture();f.clock.css.display='contents';f.clock.rect=box(270,155,0,0);f.clock.rangeRect=box(270,155,1,1);
  const state=await inspect(f);
  assert.ok(clockObstacles(state).some(item=>item.element==='span#clock-child'));
  assert.ok(state.geometryIssues.some(issue=>issue.includes('p#indicator-readout-date: inset(50%)')));
  has(state,/^geometry:/);
});

test('empty clipping of the chart host leaves no painted gutter and never counts as a pass',async()=>{
  const f=fixture();f.host.css.clipPath='inset(50%)';
  const state=await inspect(f);assert.equal(state.geometryIssues.length,0);assert.equal(state.canvas.paintRect,null);
  has(state,/missing host, plot or price-axis geometry/);
});

test('visible unsupported CSS clips remain explicit geometry failures',async()=>{
  for(const clip of ['circle(50%)','inset(calc(50%))','inset(50% round 0)','inset(50%) border-box','url(#missing)',
    'inset(-50%)','inset(50% 1px)','inset(50.%)','inset(0. 50%)']){
    const f=fixture();f.clock.css.clipPath=clip;const state=await inspect(f);
    assert.ok(clockObstacles(state).length>0,clip);
    assert.ok(state.geometryIssues.some(issue=>issue.includes('unsupported clip geometry')&&issue.includes(clip)),clip);
    has(state,/^geometry:/);
  }
});

test('nonrectangular SVG clip paths preserve the original unsupported-geometry failure',async()=>{
  for(const shape of ['path','circle']){
    const f=fixture(),defs=f.svg.append(new Element('defs'));
    const clip=defs.append(new Element('clipPath',{id:'original-clip'}));clip.append(new Element(shape));
    const event=f.svg.append(new Element('g',{'data-history-event':'source-event'}));
    event.append(new Element('path',{d:'M270 155h2v2z'},box(270,155,2,2),{clipPath:'url(#original-clip)'}));
    const state=await inspect(f);
    assert.ok(state.obstacles.some(item=>item.category==='event'&&item.surface==='svg'));
    assert.ok(state.geometryIssues.some(issue=>issue.includes('unsupported clip geometry on path: url(#original-clip)')));
    has(state,/^geometry:/);
  }
});

test('transparent SVG hit targets paint nothing and cannot cover a label',async()=>{
  const f=fixture(),hits=f.svg.append(new Element('g'));
  hits.append(new Element('circle',{},box(264,153,20,20),{fill:'rgba(0, 0, 0, 0)',stroke:'rgba(0, 0, 0, 0)'}));
  const state=await inspect(f);
  assert.ok(!state.obstacles.some(item=>item.surface==='svg'));
  assert.deepEqual(failures(state),[]);
});

test('excluding the sr-only clock does not forgive a separate visible 13-square-pixel label occlusion',async()=>{
  const f=fixture(),readout=f.plot.append(new Element('div',{class:'eth-readout'},box(313,153,1,13)));
  readout.append(new Element('time',{id:'eth-bar-time'},box(313,153,1,13))).text('2026-11-06');
  const state=await inspect(f),evidence=priceAxisOverlapEvidence(state);
  assert.equal(clockObstacles(state).length,0);assert.equal(state.geometryIssues.length,0);
  const obstruction=evidence.occlusions.find(item=>item.target==='tick-0'&&item.obstacle.includes('time#eth-bar-time'));
  assert.ok(obstruction);assert.equal(obstruction.area,13);
  has(state,/time#eth-bar-time.*occludes 13 square CSS pixels/);
});

test('the draw recorder calls through and keeps only the latest frame of each canvas',()=>{
  const calls=[];
  class Context{constructor(canvas){this.canvas=canvas;this.font='12px Fixture';this.textAlign='left';this.textBaseline='middle';this.fillStyle='#fff';this.globalAlpha=1;}
    getTransform(){return {a:1,d:1};}fillRect(...args){calls.push(['fillRect',...args]);}fillText(...args){calls.push(['fillText',...args]);}roundRect(...args){calls.push(['roundRect',...args]);}
    measureText(text){return {width:(this.font==='12px Fixture'?6:8)*text.length,fontBoundingBoxAscent:9,fontBoundingBoxDescent:3};}}
  const window={},canvas={width:100,height:50},other={width:100,height:50},context=new Context(canvas),second=new Context(other);
  runInNewContext(`(${installCanvasDrawTap})()`,{CanvasRenderingContext2D:Context,window});
  context.fillRect(0,0,100,50);context.fillText('old',1,2);context.roundRect(3,4,5,6,2);
  context.fillRect(0,0,100,50);context.fillText('55,000.00',70,20);context.font='12px Wider';context.fillText('cut',70,40,10);context.font='12px Fixture';context.fillRect(10,10,5,5);context.roundRect(60,30,36,20,4);second.fillText('other',1,1);
  const read=target=>JSON.parse(JSON.stringify(window.__atlasCanvasDraws(target))),frame=read(canvas);
  assert.deepEqual([frame.sequence,frame.texts.map(item=>item.text),frame.rects.map(item=>[item.order,item.x,item.w,item.fill])],[2,['55,000.00','cut'],[[3,60,36,'#fff']]]);
  assert.deepEqual(frame.texts[0],{order:1,text:'55,000.00',x:70,y:20,font:'12px Fixture',align:'left',baseline:'middle',fill:'#fff',alpha:1,width:54,ascent:9,descent:3});
  assert.deepEqual([frame.texts[1].font,frame.texts[1].width],['12px Wider',10],'metrics come from the drawing context in its current font, capped by maxWidth');
  assert.deepEqual(read(other).texts.map(item=>item.text),['other']);
  assert.equal(window.__atlasCanvasDraws({}),null);
  assert.equal(calls.filter(call=>call[0]==='fillText').length,4,'every call still reaches the real context');
  assert.equal(calls.filter(call=>call[0]==='roundRect').length,2);assert.equal(calls.filter(call=>call[0]==='fillRect').length,3);
});
