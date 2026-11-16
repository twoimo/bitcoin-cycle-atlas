import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {inspectPriceAxis} from '../scripts/verify-price-axis-browser.mjs';
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
const lastTime=Date.UTC(2026,10,6),W=320,H=500,gutterLeft=256,mainHeight=450,labelRows=[[40,52,8,52],[150,162,8,52],[290,308,2,61]];
// Synthetic engine pixels: a bounding background, one full-height rule at the plot
// boundary and label ink rows. They are inputs to the collector, not a browser paint receipt.
function pixels({rule=true,rows=labelRows,extra=()=>{}}={}){
  const data=new Uint8ClampedArray(W*H*4),set=(x,y,color)=>{const index=(y*W+x)*4;data.set(color,index);};
  for(let y=0;y<H;y++)for(let x=0;x<W;x++)set(x,y,[20,20,21,255]);
  if(rule)for(let y=0;y<mainHeight;y++)set(gutterLeft,y,[48,48,52,255]);
  for(const [top,bottom,left,right] of rows)for(let y=top;y<=bottom;y++)for(let x=left;x<=right;x++)set(gutterLeft+x,y,(x+y)%3?[200,200,205,255]:[120,120,130,255]);
  extra(set);
  return data;
}
function surface(data,css={}){
  const el=new Element('canvas',{},box(0,100,W,H),css);el.width=W;el.height=H;
  el.getContext=()=>({getImageData(x,y,width,height){
    const out=new Uint8ClampedArray(width*height*4);
    for(let row=0;row<height;row++)out.set(data.subarray(((y+row)*W+x)*4,((y+row)*W+x+width)*4),row*width*4);
    return {data:out};
  }});
  return el;
}
function fixture(options={}){
  const html=new Element('html',{'data-boot':'ready'},box(0,0,320,900)),body=html.append(new Element('body',{'data-page':'outlook'},box(0,0,320,900)));
  const plot=body.append(new Element('div',{class:'atlas-plot'},box(0,100,320,500)));
  const host=plot.append(new Element('div',{class:'atlas-funnest-canvas'},box(0,100,320,500)));
  const base=host.append(surface(pixels(options))),top=host.append(surface(new Uint8ClampedArray(W*H*4)));
  const bars=[{time:lastTime-86400000,open:1,high:1,low:1,close:1},{time:lastTime,open:expected.rawValue,high:expected.rawValue,low:expected.rawValue,close:expected.rawValue}];
  host.getAtlasFunnestSnapshot=()=>({engine:'funnest',state:'ready',painted:true,legacy:{priceNodes:0},chartType:'line',sourceMode:'close-only',currency:'USD',timeUnit:'UTC milliseconds',source:{name:'Coin Metrics'},engineBars:bars,
    layout:{width:W,height:H,plotWidth:gutterLeft,panesHeight:472,timeAxisHeight:28,panes:[{id:'main',kind:'main',top:0,height:mainHeight}]}});
  const svg=plot.append(new Element('svg',{id:'lab-chart',viewBox:'0 0 320 500'},box(0,100,320,500),{overflowX:'hidden',overflowY:'hidden'}));
  svg.matrix={...identity,f:100};svg.viewBox={baseVal:{x:0,y:0,width:320,height:500}};
  const manager=plot.append(new Element('div',{id:'chart-indicator-manager'},box(10,150,200,60)));
  const clock=manager.append(new Element('p',{id:'indicator-readout-date','aria-hidden':'true'},box(270,142,1,1),{clipPath:'inset(50%)'}));clock.text('2026-11-06');
  const child=clock.append(new Element('span',{id:'clock-child'},box(270,142,1,1)));child.text('clock descendant');
  const sibling=manager.append(new Element('span',{id:'visible-overlay'},box(20,150,80,14)));sibling.text('visible legend');
  const metrics=body.append(new Element('div',{id:'lab-metrics','data-kind':'observed'},box(0,700,100,14)));
  metrics.append(new Element('div',{class:'readout-main'})).append(new Element('strong')).text(expected.text);
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
    window:{__atlasPriceAxisReadout:{price:expected.rawValue,date:expected.date,kind:'observed'}},
    location:{href:'http://fixture.invalid/?page=outlook',search:'?page=outlook'},
  };
  const f={environment,html,body,plot,host,base,top,svg,manager,clock,child,sibling,hitOverride:null};
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
const rows=state=>state.canvas.ink.surfaces[0].bands.map(band=>[band.top,band.bottom,band.left,band.right]);

test('serialized collector reads the engine gutter, its rule and every label row from canvas pixels',async()=>{
  const f=fixture(),state=await inspect(f),[base,overlay]=state.canvas.ink.surfaces;
  assert.deepEqual(failures(state),[]);
  assert.deepEqual(state.canvas.axisRect,{left:256,top:100,right:320,bottom:550,width:64,height:450});
  assert.deepEqual(state.canvas.plotRect,{left:0,top:100,right:256,bottom:550,width:256,height:450});
  assert.deepEqual([base.readable,base.modal,base.ruleColumns,base.width,base.height],[true,'20,20,21,255',[0],64,450]);
  assert.deepEqual(rows(state),labelRows);
  assert.deepEqual(base.bands[0].rect,{left:264,top:140,right:309,bottom:153,width:45,height:13});
  assert.deepEqual(base.bands[0].hit,{x:286.5,y:146.5,target:'canvas',insideHost:true});
  assert.deepEqual([overlay.modal,overlay.ruleColumns,overlay.bands],['0,0,0,0',[],[]]);
  assert.deepEqual([state.canvas.lastBar.close,state.canvas.lastIntervalMs,state.canvas.legacyPriceNodes],[expected.rawValue,86400000,0]);
  assert.deepEqual([state.readout.priceText,state.readout.date,state.readout.kind],[expected.text,expected.date,'observed']);
});

test('a label pushed onto the plot boundary or the canvas edge fails the collected state',async()=>{
  const pushed=fixture({extra:set=>{for(let y=150;y<=162;y++)for(let x=0;x<=20;x++)set(gutterLeft+x,y,[200,200,205,255]);}}),state=await inspect(pushed);
  assert.equal(state.canvas.ink.surfaces[0].ruleColumns.length,0,'ink over the rule leaves no continuous rule');
  assert.ok(failures(state).some(issue=>/axis rule is not one continuous column/.test(issue)));
  assert.ok(failures(state).some(issue=>/touches the plot boundary/.test(issue)),'a rule broken by ink merges the gutter into one band that touches the boundary');
  const clippedLabel=fixture({extra:set=>{for(let y=150;y<=162;y++)set(gutterLeft+63,y,[200,200,205,255]);}});
  assert.ok(failures(await inspect(clippedLabel)).some(issue=>/label row 150-162 touches the canvas edge/.test(issue)));
});

test('an erased gutter, a missing rule or a single label row cannot count as a pass',async()=>{
  assert.ok(failures(await inspect(fixture({rows:[]}))).some(issue=>/fewer than two painted label rows/.test(issue)));
  assert.ok(failures(await inspect(fixture({rows:[labelRows[0]]}))).some(issue=>/fewer than two painted label rows/.test(issue)));
  assert.ok(failures(await inspect(fixture({rule:false}))).some(issue=>/axis rule is not one continuous column/.test(issue)));
});

test('a covered label center hit and an overlay over a label row both fail',async()=>{
  const covered=fixture();covered.hitOverride=(x,y)=>x>=264&&x<=309&&y>=140&&y<=153?covered.manager:null;
  assert.ok(failures(await inspect(covered)).some(issue=>/label row 40-52: center hit is not the chart \(div#chart-indicator-manager\)/.test(issue)));
  const over=fixture();over.manager.rect=box(260,138,60,40);over.manager.css.backgroundColor='rgb(32, 32, 39)';
  const state=await inspect(over);
  assert.ok(failures(state).some(issue=>/label-40-52: legend .*occludes/.test(issue)));
  assert.ok(priceAxisOverlapEvidence(state).intrudedArea>0);
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
    assert.ok(failures(state).some(issue=>issue.includes('occludes')),'every positive intersection still fails');
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
  assert.ok(failures(visible).some(issue=>issue.startsWith('geometry:')));
});

test('display:contents does not supply an empty clipping box for its visible descendants',async()=>{
  const f=fixture();f.clock.css.display='contents';f.clock.rect=box(270,142,0,0);f.clock.rangeRect=box(270,142,1,1);
  const state=await inspect(f);
  assert.ok(clockObstacles(state).some(item=>item.element==='span#clock-child'));
  assert.ok(state.geometryIssues.some(issue=>issue.includes('p#indicator-readout-date: inset(50%)')));
  assert.ok(failures(state).some(issue=>issue.startsWith('geometry:')));
});

test('empty clipping of the chart host leaves no painted gutter and never counts as a pass',async()=>{
  const f=fixture();f.host.css.clipPath='inset(50%)';
  const state=await inspect(f);assert.equal(state.geometryIssues.length,0);assert.equal(state.canvas.paintRect,null);
  assert.ok(failures(state).some(issue=>/missing host, plot or price-axis geometry/.test(issue)));
});

test('visible unsupported CSS clips remain explicit geometry failures',async()=>{
  for(const clip of ['circle(50%)','inset(calc(50%))','inset(50% round 0)','inset(50%) border-box','url(#missing)',
    'inset(-50%)','inset(50% 1px)','inset(50.%)','inset(0. 50%)']){
    const f=fixture();f.clock.css.clipPath=clip;const state=await inspect(f);
    assert.ok(clockObstacles(state).length>0,clip);
    assert.ok(state.geometryIssues.some(issue=>issue.includes('unsupported clip geometry')&&issue.includes(clip)),clip);
    assert.ok(failures(state).some(issue=>issue.startsWith('geometry:')),clip);
  }
});

test('nonrectangular SVG clip paths preserve the original unsupported-geometry failure',async()=>{
  for(const shape of ['path','circle']){
    const f=fixture(),defs=f.svg.append(new Element('defs'));
    const clip=defs.append(new Element('clipPath',{id:'original-clip'}));clip.append(new Element(shape));
    const event=f.svg.append(new Element('g',{'data-history-event':'source-event'}));
    event.append(new Element('path',{d:'M270 142h2v2z'},box(270,142,2,2),{clipPath:'url(#original-clip)'}));
    const state=await inspect(f);
    assert.ok(state.obstacles.some(item=>item.category==='annotation'&&item.surface==='svg'));
    assert.ok(state.geometryIssues.some(issue=>issue.includes('unsupported clip geometry on path: url(#original-clip)')));
    assert.ok(failures(state).some(issue=>issue.startsWith('geometry:')));
  }
});

test('transparent SVG hit targets paint nothing and cannot cover a label',async()=>{
  const f=fixture(),hits=f.svg.append(new Element('g'));
  hits.append(new Element('circle',{},box(260,142,20,20),{fill:'rgba(0, 0, 0, 0)',stroke:'rgba(0, 0, 0, 0)'}));
  const state=await inspect(f);
  assert.ok(!state.obstacles.some(item=>item.surface==='svg'));
  assert.deepEqual(failures(state),[]);
});

test('excluding the sr-only clock does not forgive a separate visible 13-square-pixel label occlusion',async()=>{
  const f=fixture(),readout=f.plot.append(new Element('div',{class:'eth-readout'},box(308,140,1,13)));
  readout.append(new Element('time',{id:'eth-bar-time'},box(308,140,1,13))).text('2026-11-06');
  const state=await inspect(f),evidence=priceAxisOverlapEvidence(state);
  assert.equal(clockObstacles(state).length,0);assert.equal(state.geometryIssues.length,0);
  const obstruction=evidence.occlusions.find(item=>item.target==='label-40-52'&&item.obstacle.includes('time#eth-bar-time'));
  assert.ok(obstruction);assert.equal(obstruction.area,13);
  assert.ok(failures(state).some(issue=>issue.includes('time#eth-bar-time')&&issue.includes('occludes 13 square CSS pixels')));
});
