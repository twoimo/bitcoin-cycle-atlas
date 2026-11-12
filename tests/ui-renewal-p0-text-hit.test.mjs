import assert from 'node:assert/strict';
import test from 'node:test';
import {runInNewContext} from 'node:vm';
import {inspectP0TextInk,verifyP0TextInk} from '../scripts/ui-renewal-p0-text-hit.mjs';
import {inspectP0Snapshot} from '../scripts/verify-ui-renewal-p0-browser.mjs';
import {validateP0Paint} from '../scripts/ui-renewal-p0-contract.mjs';

// These are deliberately controlled DOM/Range/style and CDP models. They run
// the production collector and orchestration functions but are NOT native
// browser geometry, screenshot or font-ink measurements.
const rect = (left,top,width,height) => ({left,top,right:left+width,bottom:top+height,width,height,x:left,y:top});
const containsPoint = (r,x,y) => r.width>0 && r.height>0 && x>=r.left && x<r.right && y>=r.top && y<r.bottom;
const union = boxes => boxes.length ? rect(Math.min(...boxes.map(r=>r.left)),Math.min(...boxes.map(r=>r.top)),Math.max(...boxes.map(r=>r.right))-Math.min(...boxes.map(r=>r.left)),Math.max(...boxes.map(r=>r.bottom))-Math.min(...boxes.map(r=>r.top))) : rect(0,0,0,0);
const styleDefaults = Object.freeze({display:'block',visibility:'visible',opacity:'1',position:'static',zIndex:'auto',pointerEvents:'auto',
  color:'rgb(25, 31, 40)',backgroundColor:'rgba(0, 0, 0, 0)',backgroundImage:'none',backgroundClip:'border-box',
  borderTopWidth:'0px',borderRightWidth:'0px',borderBottomWidth:'0px',borderLeftWidth:'0px',
  borderTopColor:'rgba(0, 0, 0, 0)',borderRightColor:'rgba(0, 0, 0, 0)',borderBottomColor:'rgba(0, 0, 0, 0)',borderLeftColor:'rgba(0, 0, 0, 0)',
  borderTopStyle:'none',borderRightStyle:'none',borderBottomStyle:'none',borderLeftStyle:'none',
  outlineWidth:'0px',outlineStyle:'none',outlineColor:'rgb(25, 31, 40)',boxShadow:'none',textShadow:'none',
  filter:'none',backdropFilter:'none',mixBlendMode:'normal',isolation:'auto',transform:'none',perspective:'none',
  clip:'auto',clipPath:'none',mask:'none',maskImage:'none',overflow:'visible',overflowX:'visible',overflowY:'visible',
  content:'normal',contain:'none',contentVisibility:'visible',fontSize:'12px',lineHeight:'14px',fontFamily:'Model Korean, sans-serif',
  textDecoration:'none',textDecorationLine:'none',textDecorationColor:'rgb(25, 31, 40)',textIndent:'0px',letterSpacing:'normal',
  webkitTextStrokeWidth:'0px',webkitTextStrokeColor:'rgb(25, 31, 40)',stroke:'none',strokeWidth:'0px',fill:'rgb(25, 31, 40)',
  fillOpacity:'1',strokeOpacity:'1',writingMode:'horizontal-tb',direction:'ltr',borderRadius:'0px'});
const NodeKinds = Object.freeze({ELEMENT_NODE:1,TEXT_NODE:3,DOCUMENT_NODE:9,DOCUMENT_POSITION_DISCONNECTED:1,DOCUMENT_POSITION_PRECEDING:2,
  DOCUMENT_POSITION_FOLLOWING:4,DOCUMENT_POSITION_CONTAINS:8,DOCUMENT_POSITION_CONTAINED_BY:16});

function model({width=320,top=4,text='가격 차트',pointerEvents='none',nested=false,headingStyle={},glyphBoxes=null,headingRect=null}={}) {
  let nextId=1;const all=[];
  class Element {
    constructor(tag,id,bounds,computed={}) {this.nodeType=1;this.tagName=this.nodeName=tag.toUpperCase();this.localName=tag;this.id=id;this.bounds=bounds;this.computed={...computed};this.pseudos={};this.childNodes=[];this.parentElement=this.parentNode=null;this.hidden=false;this.attrs=new Map(id?[['id',id]]:[]);this.nodeId=++nextId;this.backendNodeId=1000+this.nodeId;this.ownerDocument=null;this.isConnected=true;all.push(this);}
    get children(){return this.childNodes.filter(node=>node.nodeType===1);}
    get textContent(){return this.childNodes.map(node=>node.textContent).join('');}
    get className(){return this.attrs.get('class')||'';}
    get attributes(){return [...this.attrs].map(([name,value])=>({name,value}));}
    get childElementCount(){return this.children.length;}
    get clientLeft(){return 0;} get clientTop(){return 0;}
    get clientWidth(){return this.bounds.width;} get clientHeight(){return this.bounds.height;}
    get scrollWidth(){return this.bounds.width;} get scrollHeight(){return this.bounds.height;}
    append(...nodes){for(const node of nodes){node.parentElement=node.parentNode=this;this.childNodes.push(node);}}
    contains(other){return this===other||this.childNodes.some(node=>node===other||(node.contains?.(other)));}
    getAttribute(name){return this.attrs.get(name)??null;}
    hasAttribute(name){return this.attrs.has(name);}
    setAttribute(){throw new Error('collector must not mutate product attributes');}
    removeAttribute(){throw new Error('collector must not mutate product attributes');}
    getRootNode(){return document;}
    getBoundingClientRect(){for(let node=this;node;node=node.parentElement)if(node.computed.display==='none'||node.hidden)return rect(0,0,0,0);return {...this.bounds};}
    getClientRects(){const r=this.getBoundingClientRect();return r.width>0&&r.height>0?[r]:[];}
    matches(selector){return matches(this,selector);}
    closest(selector){for(let node=this;node;node=node.parentElement)if(matches(node,selector))return node;return null;}
    querySelectorAll(selector){return descendants(this).filter(node=>node.nodeType===1&&matches(node,selector));}
    querySelector(selector){return this.querySelectorAll(selector)[0]||null;}
    checkVisibility(){for(let node=this;node;node=node.parentElement)if(node.hidden||node.computed.display==='none'||node.computed.visibility==='hidden'||node.computed.opacity==='0')return false;return this.getClientRects().length>0;}
    compareDocumentPosition(other){if(this===other)return 0;if(this.contains(other))return 4|16;if(other.contains?.(this))return 2|8;return order().indexOf(other)>order().indexOf(this)?4:2;}
  }
  class Text {
    constructor(value,boxes){this.nodeType=3;this.nodeName='#text';this.data=this.nodeValue=this.textContent=value;this.boxes=boxes;this.parentElement=this.parentNode=null;this.ownerDocument=null;this.nodeId=++nextId;this.backendNodeId=1000+this.nodeId;this.isConnected=true;all.push(this);}
    get length(){return this.data.length;}
    getRootNode(){return document;}
    compareDocumentPosition(other){return order().indexOf(other)>order().indexOf(this)?4:2;}
  }
  const descendants=node=>node.childNodes?.flatMap(child=>[child,...descendants(child)])||[];
  const matches=(node,selector)=>{
    if(selector==='*'||selector==='body *')return selector==='*'||node!==body&&body.contains(node);
    if(selector.includes(','))return selector.split(',').some(part=>matches(node,part.trim()));
    if(selector==='[hidden]')return node.hidden;
    if(selector.startsWith('#'))return node.id===selector.slice(1).replace(/\\(.)/g,'$1');
    if(selector.includes('>')){const last=selector.split('>').at(-1).trim(), nth=last.match(/^([a-z\d]+):nth-child\((\d+)\)$/i);return nth&&node.localName===nth[1]&&node.parentElement?.children.indexOf(node)+1===Number(nth[2]);}
    return node.localName===selector.toLowerCase();
  };
  const document={nodeType:9,nodeName:'#document',nodeId:1,backendNodeId:1001};
  const root=new Element('html','',rect(0,0,width,900),{backgroundColor:'rgb(255, 255, 255)'});
  const body=new Element('body','',rect(0,0,width,900)), main=new Element('main','main',rect(0,0,width,900));
  const left=width===320?8:64, heading=new Element('h1','atlas-page-heading',headingRect||rect(left,top,width===320?304:1319,14),{pointerEvents,...headingStyle});
  root.append(body);body.append(main);main.append(heading);
  let owner=heading;if(nested){owner=new Element('span','heading-text-owner',rect(left,top,52,14),{pointerEvents});heading.append(owner);}
  let advance=left;const boxes=glyphBoxes||Array.from(text,char=>{const r=rect(advance,top,/\s/u.test(char)?4:12,14);advance+=r.width;return r;});
  const textNode=new Text(text,boxes);owner.append(textNode);const overlays=[],pseudoNodes=[];
  for(const node of all)node.ownerDocument=document;
  const order=()=>[root,...descendants(root)];
  const visible=node=>{for(let current=node;current;current=current.parentElement)if(current.hidden||current.computed?.display==='none'||current.computed?.opacity==='0')return false;return !['hidden','collapse'].includes(computed(node).visibility);};
  const charRanges=()=>{let offset=0;return Array.from(textNode.data,(char,index)=>{const value={char,start:offset,end:offset+char.length,rect:textNode.boxes[index]};offset+=char.length;return value;});};
  // Tests declare the expected native painted regions independently. No
  // production clip parser is used to decide mocked hit-test results.
  const paintedAt=(node,x,y)=>(node.paintRects??[node.bounds]).some(box=>containsPoint(box,x,y));
  function hit(x,y,{ignorePointerEventsNone=false,backend=false}={}) {
    for(const node of pseudoNodes.slice().reverse())if(node.painted&&visible(node.ownerElement)&&paintedAt(node,x,y)&&(ignorePointerEventsNone||computed(node.ownerElement,node.pseudo).pointerEvents!=='none'))return node;
    for(const node of overlays.slice().reverse())if(visible(node)&&paintedAt(node,x,y)&&(ignorePointerEventsNone||node.computed.pointerEvents!=='none'))return node;
    if(charRanges().some(item=>item.char.trim()&&item.rect&&containsPoint(item.rect,x,y))&&visible(owner)&&(ignorePointerEventsNone||owner.computed.pointerEvents!=='none'))return backend?textNode:owner;
    return main;
  }
  function computed(node,pseudo){
    const inheritedVisibility=node.parentElement?computed(node.parentElement).visibility:'visible';
    const value=pseudo?{...styleDefaults,visibility:computed(node).visibility,content:'none',...(node.pseudos[pseudo]||{})}:{...styleDefaults,visibility:inheritedVisibility,...node.computed};
    if(!Object.hasOwn(value,'webkitTextFillColor'))value.webkitTextFillColor=value.color;
    value.getPropertyValue=name=>value[name.replace(/-([a-z])/g,(_,letter)=>letter.toUpperCase())]??'';return value;
  }
  Object.assign(document,{documentElement:root,body,defaultView:null,URL:'http://fixture/index.html',
    querySelector:selector=>order().find(node=>node.nodeType===1&&matches(node,selector))||null,
    querySelectorAll:selector=>order().filter(node=>node.nodeType===1&&matches(node,selector)),
    createTreeWalker(node,whatToShow,filter){const nodes=descendants(node).filter(item=>whatToShow===4?item.nodeType===3:whatToShow===1?item.nodeType===1:true).filter(item=>!filter||((typeof filter==='function'?filter(item):filter.acceptNode(item))===1));let i=0;return {currentNode:node,nextNode(){this.currentNode=nodes[i++]||null;return this.currentNode;}};},
    createRange(){let a=null,b=null,start=0,end=0,whole=false;return {setStart(node,offset){a=node;start=offset;whole=false;},setEnd(node,offset){b=node;end=offset;whole=false;},
      selectNodeContents(node){a=b=node.nodeType===3?node:descendants(node).find(item=>item.nodeType===3);start=0;end=a?.data.length||0;whole=true;},
      getClientRects(){if(!a||a!==b||end<=start)return [];if(whole&&a.fullRangeRects)return a.fullRangeRects.map(r=>({...r}));let offset=0;return Array.from(a.data,(char,index)=>{const from=offset;offset+=char.length;return from<end&&offset>start?a.boxes[index]:null;}).filter(r=>r&&r.width>0&&r.height>0).map(r=>({...r}));},
      getBoundingClientRect(){return union(this.getClientRects());},detach(){}};},
    elementFromPoint:(x,y)=>hit(x,y),elementsFromPoint:(x,y)=>{const target=hit(x,y),nodes=[];for(let current=target;current;current=current.parentElement)nodes.push(current);return nodes;}});
  const globals={document,window:null,innerWidth:width,innerHeight:900,scrollX:0,scrollY:0,getComputedStyle:computed,
    Node:NodeKinds,NodeFilter:{SHOW_ALL:-1,SHOW_ELEMENT:1,SHOW_TEXT:4,FILTER_ACCEPT:1,FILTER_REJECT:2,FILTER_SKIP:3},
    Element,HTMLElement:Element,Text,CSS:{escape:value=>String(value).replace(/([^\w-])/g,'\\$1')},location:{href:document.URL},console};
  globals.window=globals;document.defaultView=globals;
  return {globals,document,root,body,main,heading,owner,textNode,all,overlays,pseudoNodes,hit,charRanges,
    addText(element,value,rangeRects){const text=new Text(value,[]);text.fullRangeRects=rangeRects;text.ownerDocument=document;element.append(text);return text;},
    addOverlay({bounds=rect(left+2,top+2,8,10),internal=false,parent=null,tag='div',pointerEvents='auto',style={},id=`overlay-${overlays.length}`}={}){
      const overlay=new Element(tag,id,bounds,{position:'absolute',zIndex:'100',backgroundColor:'rgb(0, 0, 0)',pointerEvents,...style});overlay.ownerDocument=document;
      (parent||(internal?heading:main)).append(overlay);overlays.push(overlay);return overlay;},
    addPseudo(element,{pseudo='::before',bounds=rect(200,200,10,10),painted=true,style={}}={}){
      element.pseudos[pseudo]={content:'""',position:'absolute',backgroundColor:painted?'rgb(0, 0, 0)':'rgba(0, 0, 0, 0)',...style};
      const node={nodeType:1,nodeName:pseudo,localName:pseudo,pseudoType:pseudo.slice(2),pseudo,ownerElement:element,bounds,painted,nodeId:++nextId,childNodes:[]};
      node.backendNodeId=1000+node.nodeId;pseudoNodes.push(node);all.push(node);return node;}};
}

function cdpFor(fixture,{snapshot=null,failMethod=null,hitOverride=null,geometryTransform=null,describeTransform=null}={}) {
  const calls=[];const serialize=(node,depth=1)=>({nodeId:node.nodeId,backendNodeId:node.backendNodeId,nodeType:node.nodeType,nodeName:node.nodeName,localName:node.localName||'',nodeValue:node.nodeType===3?node.data:'',
    ...(node.pseudoType?{pseudoType:node.pseudoType}:{}),
    ...(fixture.pseudoNodes.some(pseudo=>pseudo.ownerElement===node)?{pseudoElements:fixture.pseudoNodes.filter(pseudo=>pseudo.ownerElement===node).map(pseudo=>serialize(pseudo,0))}:{}),
    childNodeCount:node.childNodes?.length||0,...(depth>0&&node.childNodes?{children:node.childNodes.map(child=>serialize(child,depth-1))}:{})});
  return {calls,async send(method,params={}) {
    calls.push({method,params});if(method===failMethod)throw new Error(`fixture CDP failure: ${method}`);
    if(method==='Runtime.evaluate'){
      if(snapshot&&params.expression.includes('function inspectP0Page('))return {result:{type:'object',value:structuredClone(snapshot)}};
      let value=runInNewContext(params.expression,fixture.globals);if(value&&typeof value.then==='function')value=await value;
      return {result:{type:'object',value:geometryTransform?geometryTransform(value):value}};
    }
    if(method==='DOM.getDocument')return {root:{nodeId:1,backendNodeId:1001,nodeType:9,nodeName:'#document'}};
    if(method==='DOM.querySelector'){const node=fixture.document.querySelector(params.selector);return {nodeId:node?.nodeId||0};}
    if(method==='DOM.describeNode'){
      const node=fixture.all.find(item=>item.nodeId===params.nodeId||params.backendNodeId&&item.backendNodeId===params.backendNodeId);assert.ok(node,'CDP must describe an existing fixture node');
      const result=serialize(node,params.depth??1);return {node:describeTransform?describeTransform(result):result};
    }
    if(method==='DOM.getBoxModel'){
      const node=fixture.all.find(item=>item.backendNodeId===params.backendNodeId||params.nodeId&&item.nodeId===params.nodeId);assert.ok(node,'native quad model must identify an existing node');
      const r=node.bounds,quad=[r.left,r.top,r.right,r.top,r.right,r.bottom,r.left,r.bottom];
      return {model:{border:quad,padding:quad,content:quad,margin:quad,width:r.width,height:r.height}};
    }
    if(method==='DOM.getNodeForLocation'){
      const node=hitOverride?hitOverride(params,fixture):fixture.hit(params.x,params.y,{ignorePointerEventsNone:params.ignorePointerEventsNone,backend:true});
      return node?{backendNodeId:node.backendNodeId,nodeId:node.nodeId,frameId:'fixture-frame'}:{};
    }
    throw new Error(`Unmodelled CDP method ${method}`);
  }};
}
const collect=fixture=>runInNewContext(`(${inspectP0TextInk.toString()})('#atlas-page-heading')`,fixture.globals);
const probes=cdp=>cdp.calls.filter(call=>call.method==='DOM.getNodeForLocation').map(call=>call.params);

for(const [width,top] of [[320,4],[320,57],[1440,91]])test(`${width}px full-width heading samples its four Korean glyphs, including pointer-events:none`,async()=>{
  const f=model({width,top}), geometry=collect(f);
  assert.equal(geometry.text,'가격 차트');assert.equal(geometry.glyphs.length,4);assert.equal(geometry.rect.width,width===320?304:1319);
  assert.deepEqual(Array.from(geometry.glyphs,glyph=>glyph.text),['가','격','차','트']);
  const cdp=cdpFor(f), result=await verifyP0TextInk(cdp,'#atlas-page-heading');assert.equal(result.status,'passed',JSON.stringify(result));
  assert.ok(probes(cdp).length>=4);const wholeCentre=f.heading.bounds.left+f.heading.bounds.width/2;
  assert.ok(probes(cdp).every(point=>point.x!==wholeCentre),'the empty full-width centre cannot be the proof');
  for(const point of probes(cdp)){
    assert.equal(point.ignorePointerEventsNone,true);assert.equal(point.includeUserAgentShadowDOM,true);
    assert.ok(Number.isInteger(point.x)&&Number.isInteger(point.y));
    assert.ok(f.charRanges().some(glyph=>glyph.char.trim()&&containsPoint(glyph.rect,point.x,point.y)),'probe must be inside actual glyph geometry');
  }
});

test('the precise text owner and text backend are accepted; a parent or another same-looking element is rejected',async()=>{
  const f=model({nested:true});
  for(const expected of [f.owner,f.textNode])assert.equal((await verifyP0TextInk(cdpFor(f,{hitOverride:()=>expected}),'#atlas-page-heading')).status,'passed');
  for(const outsider of [f.heading,f.main,f.addOverlay({bounds:rect(200,200,10,10),id:'unrelated'})]){
    const result=await verifyP0TextInk(cdpFor(f,{hitOverride:()=>outsider}),'#atlas-page-heading');assert.equal(result.status,'failed',JSON.stringify(result));
  }
});

for(const [label,options] of [['external',{}],['internal',{internal:true}],['pointer-events-none',{pointerEvents:'none'}]])test(`${label} painted glyph overlay remains a failure`,async()=>{
  const f=model();f.addOverlay(options);const geometry=collect(f);assert.ok(geometry.intersections.length>0);
  const cdp=cdpFor(f), result=await verifyP0TextInk(cdp,'#atlas-page-heading');assert.equal(result.status,'failed',JSON.stringify(result));
  assert.ok(probes(cdp).some(point=>f.overlays.some(node=>containsPoint(node.bounds,point.x,point.y))));
});

test('a one-pixel partial stripe is probed rather than overlooked by the glyph centre',async()=>{
  const f=model();const stripe=f.addOverlay({bounds:rect(14.1,5,1,12)});const cdp=cdpFor(f), result=await verifyP0TextInk(cdp,'#atlas-page-heading');
  assert.equal(result.status,'failed',JSON.stringify(result));assert.ok(probes(cdp).some(point=>containsPoint(stripe.bounds,point.x,point.y)));
});

test('a positive 0.2px occlusion with no integer probe is unverified, never rounded away',async()=>{
  const f=model();f.addOverlay({bounds:rect(14.2,5,.2,12)});const geometry=collect(f);
  assert.ok(geometry.intersections.some(item=>item.area>0&&item.rect.width<1));
  const result=await verifyP0TextInk(cdpFor(f),'#atlas-page-heading');assert.equal(result.status,'unverified',JSON.stringify(result));
});

test('a distant opaque positioned pseudo uses its native quad without invalidating unrelated text',async()=>{
  const f=model(), owner=f.addOverlay({bounds:rect(200,200,20,20),style:{backgroundColor:'transparent'}});
  f.addPseudo(owner,{bounds:rect(210,210,10,10)});
  const cdp=cdpFor(f),result=await verifyP0TextInk(cdp,'#atlas-page-heading');
  assert.equal(result.status,'passed',JSON.stringify(result));
  assert.equal(result.geometry.unmeasuredPseudos.length,1);
  assert.ok(cdp.calls.some(call=>call.method==='DOM.getBoxModel'),'pseudo bounds must come from native quad evidence');
  assert.equal(result.geometry.intersections.length,0);
  const missing=await verifyP0TextInk(cdpFor(f,{failMethod:'DOM.getBoxModel'}),'#atlas-page-heading');
  assert.equal(missing.status,'unverified','missing native quad is not evidence of a distant pseudo');
});

test('an empty transparent hit-area pseudo adds no painted candidate or unsupported geometry',async()=>{
  const f=model(),owner=f.addOverlay({bounds:rect(200,200,20,20),style:{backgroundColor:'transparent'}});
  f.addPseudo(owner,{painted:false,bounds:rect(200,200,44,44),style:{content:'""',pointerEvents:'auto'}});
  const geometry=collect(f),cdp=cdpFor(f),result=await verifyP0TextInk(cdp,'#atlas-page-heading');
  assert.equal(geometry.overlappingPaintCandidates.length,0);assert.equal(geometry.unmeasuredPseudos.length,0);
  assert.equal(result.status,'passed',JSON.stringify(result));
  assert.ok(!cdp.calls.some(call=>call.method==='DOM.getBoxModel'));
});

test('pseudo native quads expose a one-pixel stripe even when the owning element is far away',async()=>{
  const f=model(),owner=f.addOverlay({bounds:rect(200,200,20,20),style:{backgroundColor:'transparent'}});
  const stripe=f.addPseudo(owner,{bounds:rect(14.1,5,1,12)}),cdp=cdpFor(f),result=await verifyP0TextInk(cdp,'#atlas-page-heading');
  assert.equal(result.status,'failed',JSON.stringify(result));
  assert.ok(probes(cdp).some(point=>containsPoint(stripe.bounds,point.x,point.y)));
  const own=model();own.addPseudo(own.heading,{bounds:rect(14.1,5,1,12)});
  const ambiguous=await verifyP0TextInk(cdpFor(own,{hitOverride:()=>own.owner}),'#atlas-page-heading');
  assert.equal(ambiguous.status,'unverified','an owner hit cannot distinguish its own pseudo paint from text');
});

test('a visible one-pixel child overlay remains paint evidence under a visibility-hidden ancestor',async()=>{
  const f=model(),parent=f.addOverlay({bounds:rect(0,0,320,100),style:{visibility:'hidden',backgroundColor:'transparent'}});
  const stripe=f.addOverlay({parent,bounds:rect(14.1,5,1,12),style:{visibility:'visible'}});
  const geometry=collect(f),cdp=cdpFor(f),result=await verifyP0TextInk(cdp,'#atlas-page-heading');
  assert.ok(geometry.overlappingPaintCandidates.some(item=>item.selector==='#'+stripe.id));
  assert.equal(result.status,'failed',JSON.stringify(result));assert.ok(probes(cdp).some(point=>containsPoint(stripe.bounds,point.x,point.y)));
});

test('a one-pixel replaced image has paint evidence without a CSS background or border',async()=>{
  const f=model(),stripe=f.addOverlay({tag:'img',bounds:rect(14.1,5,1,12),style:{backgroundColor:'transparent'}});
  const geometry=collect(f),cdp=cdpFor(f),result=await verifyP0TextInk(cdp,'#atlas-page-heading');
  assert.ok(geometry.overlappingPaintCandidates.some(item=>item.kind==='replaced'&&item.selector==='#'+stripe.id));
  assert.equal(result.status,'failed',JSON.stringify(result));assert.ok(probes(cdp).some(point=>containsPoint(stripe.bounds,point.x,point.y)));
});

for(const [label,options] of [
  ['empty text',{text:''}],['whitespace only',{text:'   '}],['zero glyph rect',{glyphBoxes:Array(5).fill(rect(8,4,0,14))}],['zero heading rect',{headingRect:rect(8,4,0,0)}],
  ['viewport clipped glyph',{glyphBoxes:[rect(-2,4,12,14),rect(20,4,12,14),rect(32,4,4,14),rect(36,4,12,14),rect(48,4,12,14)]}],
  ['hidden',{headingStyle:{visibility:'hidden'}}],['display none',{headingStyle:{display:'none'}}],['transparent text',{headingStyle:{color:'rgba(25, 31, 40, 0)'}}],
  ['zero opacity',{headingStyle:{opacity:'0'}}],['unsupported clip geometry',{headingStyle:{clipPath:'circle(50%)'}}],
])test(`${label} cannot become passing native text-ink evidence`,async()=>{
  const result=await verifyP0TextInk(cdpFor(model(options)),'#atlas-page-heading');assert.notEqual(result.status,'passed',JSON.stringify(result));
  if(label==='unsupported clip geometry')assert.equal(result.status,'unverified');
});

test('missing geometry, missing hit evidence and CDP errors cannot qualify a heading',async()=>{
  for(const options of [{geometryTransform:()=>null},{geometryTransform:value=>({...value,glyphs:[]})},{hitOverride:()=>null},
    {failMethod:'Runtime.evaluate'},{failMethod:'DOM.getDocument'},{failMethod:'DOM.querySelector'},{failMethod:'DOM.describeNode'},{failMethod:'DOM.getNodeForLocation'}]){
    const result=await verifyP0TextInk(cdpFor(model(),options),'#atlas-page-heading');assert.notEqual(result.status,'passed',JSON.stringify({options,result}));
  }
});

test('replaced or missing TEXT_NODE evidence cannot be substituted by its old element owner',async()=>{
  for(const describeTransform of [node=>({...node,children:[]}),node=>({...node,children:node.children?.map(child=>child.nodeType===3?{...child,nodeValue:'다른 글자'}:child)})]){
    const result=await verifyP0TextInk(cdpFor(model(),{describeTransform}),'#atlas-page-heading');assert.notEqual(result.status,'passed',JSON.stringify(result));
  }
});

const snapshotFor=(f,extraIssues=[])=>({stage:'chart',samples:[{id:'page-heading',kind:'text',selector:'#atlas-page-heading',actualSelector:'#atlas-page-heading',text:'가격 차트',
  visible:true,rect:{...f.heading.bounds},foreground:'rgb(25, 31, 40)',backgrounds:['transparent','#fff'],issues:['native heading text ink hit evidence pending',...extraIssues]}]});
test('main snapshot integration removes only the pending sentinel after actual helper proof',async()=>{
  const f=model(), cdp=cdpFor(f,{snapshot:snapshotFor(f)}), result=await inspectP0Snapshot(cdp,{symbol:'BTCUSD',width:320,theme:'light'},'chart',[],[]);
  assert.equal(validateP0Paint(result.samples[0]).status,'passed');assert.ok(probes(cdp).length>=4);
  const problem='existing unrelated paint limitation';const other=await inspectP0Snapshot(cdpFor(f,{snapshot:snapshotFor(f,[problem])}),{symbol:'BTCUSD',width:320,theme:'light'},'chart',[],[]);
  assert.ok(other.samples[0].issues.includes(problem));assert.notEqual(validateP0Paint(other.samples[0]).status,'passed');
});

test('main integration never clears a missing, occluded, changed-text or changed-rect proof into a pass',async()=>{
  const cases=[{hitOverride:()=>null},{failMethod:'DOM.getNodeForLocation'},{geometryTransform:value=>({...value,text:'다른 제목'})},
    {geometryTransform:value=>({...value,rect:{...value.rect,left:value.rect.left+1}})}];
  for(const options of cases){const f=model();const result=await inspectP0Snapshot(cdpFor(f,{snapshot:snapshotFor(f),...options}),{symbol:'BTCUSD',width:320,theme:'light'},'chart',[],[]);assert.notEqual(validateP0Paint(result.samples[0]).status,'passed');}
  const covered=model();covered.addOverlay();const result=await inspectP0Snapshot(cdpFor(covered,{snapshot:snapshotFor(covered)}),{symbol:'BTCUSD',width:320,theme:'light'},'chart',[],[]);
  assert.notEqual(validateP0Paint(result.samples[0]).status,'passed');
});

test('main integration retains a hidden heading as failed evidence instead of dropping the required sample',async()=>{
  const f=model(), snapshot=snapshotFor(f);snapshot.samples[0].visible=false;
  const result=await inspectP0Snapshot(cdpFor(f,{snapshot}),{symbol:'BTCUSD',width:320,theme:'light'},'chart',[],[]);
  assert.equal(result.samples.length,1);assert.equal(result.samples[0].visible,false);
  assert.equal(result.samples[0].nativeTextHit.status,'failed');assert.notEqual(validateP0Paint(result.samples[0]).status,'passed');
});

test('the recorded Mac description Range overlap is proved empty after its measured inset clip',async()=>{
  // Q-R19P0-2 Mac receipt: four title glyphs x8..52.421875, y57..71;
  // description text Range x24..397.59375, y70..83 overlaps by 1 CSS px.
  const advances=[10.53515625,10.53515625,2.28125,10.53515625,10.53515625];let left=8;
  const glyphBoxes=advances.map(width=>{const r=rect(left,57,width,14);left+=width;return r;});
  const f=model({width:320,top:57,glyphBoxes});
  // The raw description extends past the viewport. Its own proven zero clip
  // still wins when a positioned containing block sits inside root overflow.
  f.main.computed.position='relative';
  for(const node of [f.root,f.body])Object.assign(node.computed,{overflow:'hidden',overflowX:'hidden',overflowY:'hidden'});
  const description=f.addOverlay({id:'atlas-page-description',tag:'p',bounds:rect(24,70,1,1),style:{backgroundColor:'transparent',
    position:'absolute',overflow:'hidden',overflowX:'hidden',overflowY:'hidden',clipPath:'inset(50%)'}});
  f.addText(description,'스크린리더 전용 설명',[rect(24,70,373.59375,13)]);description.paintRects=[];
  const cdp=cdpFor(f),result=await verifyP0TextInk(cdp,'#atlas-page-heading');
  assert.equal(result.status,'passed',JSON.stringify(result));
  const receipt=result.geometry.clippedPaintCandidates.find(item=>item.selector==='#atlas-page-description'&&item.kind==='text');
  assert.ok(receipt,'a measured empty clip must have evidence; the description ID is not an exemption');
  assert.equal(receipt.rawRect.left,24);assert.equal(receipt.rawRect.right,397.59375);
  assert.equal(receipt.rawRect.top,70);assert.equal(receipt.rawRect.bottom,83);
  assert.equal(receipt.paintRect,null);assert.equal(receipt.status,'empty');
  const inset=receipt.clips.find(item=>item.value==='inset(50%)');
  assert.ok(inset);assert.equal(inset.referenceRect.width,1);assert.equal(inset.referenceRect.height,1);
  assert.equal(result.geometry.glyphs.length,4);
  assert.deepEqual([...new Set(result.probes.map(point=>point.glyphIndex))].sort(),[0,1,2,3]);
  assert.equal(result.geometry.intersections.length,0);
});

test('empty rectangular clipping is geometry based, independent of sr-only ID, class or box size',async()=>{
  for(const [id,bounds,clipPath]of [
    ['ordinary-overlay',rect(8,4,80,14),'inset(50%)'],
    ['atlas-page-description',rect(8,4,30,14),'inset(100% 0)'],
    ['arbitrary-description',rect(8,4,30,14),'inset(0 50%)'],
  ]){
    const f=model(),node=f.addOverlay({id,bounds,style:{clipPath}});node.paintRects=[];
    const result=await verifyP0TextInk(cdpFor(f),'#atlas-page-heading');
    assert.equal(result.status,'passed',JSON.stringify({clipPath,result}));
    assert.ok(result.geometry.clippedPaintCandidates.some(item=>item.selector==='#'+id&&item.status==='empty'&&item.paintRect===null));
    assert.equal(result.geometry.intersections.length,0);assert.ok(result.probes.length>=4);
  }
});

test('a positive clipped rectangle disjoint from the title is measured before it is discarded',async()=>{
  for(const clipPath of ['inset(0 0 0 64px)','inset(0 0 0 80%)','inset(0 0 0 64px) border-box']){
    const f=model(),node=f.addOverlay({bounds:rect(8,4,80,14),style:{clipPath}});node.paintRects=[rect(72,4,16,14)];
    const result=await verifyP0TextInk(cdpFor(f),'#atlas-page-heading');assert.equal(result.status,'passed',JSON.stringify(result));
    const receipt=result.geometry.clippedPaintCandidates.find(item=>item.selector==='#'+node.id);
    assert.ok(receipt);assert.equal(receipt.paintRect.left,72);assert.equal(receipt.paintRect.right,88);
    assert.equal(result.geometry.intersections.length,0);assert.ok(result.probes.length>=4);
  }
});

test('visible clipped paint retains failure even on the same description ID',async()=>{
  for(const [clipPath,paintRect]of [
    ['inset(0)',rect(8,4,30,14)],['inset(0 16px 0 6px)',rect(14,4,8,14)],
    ['inset(0 0 0 20%)',rect(14,4,24,14)],
  ]){
    const f=model(),node=f.addOverlay({id:'atlas-page-description',bounds:rect(8,4,30,14),style:{clipPath}});node.paintRects=[paintRect];
    const result=await verifyP0TextInk(cdpFor(f),'#atlas-page-heading');
    assert.equal(result.status,'failed',JSON.stringify({clipPath,result}));
    assert.ok(result.geometry.intersections.length>0);assert.ok(result.probes.some(point=>!point.accepted&&containsPoint(paintRect,point.x,point.y)));
  }
});

test('unsupported clip grammar remains unverified even when every native hit would be the heading',async()=>{
  for(const clipPath of ['circle(50%)','url(#missing)','inset(calc(50%))','inset(50% round 2px)','inset(50%) content-box']){
    const f=model();f.addOverlay({bounds:rect(8,4,30,14),style:{clipPath}});
    const result=await verifyP0TextInk(cdpFor(f,{hitOverride:()=>f.textNode}),'#atlas-page-heading');
    assert.equal(result.status,'unverified',JSON.stringify({clipPath,result}));
    assert.match(result.reason,/clip|reference|geometry/i);
  }
});

test('missing, fragmented or non-box clipping references cannot prove empty paint',async()=>{
  for(const variant of ['missing-client-rect','fragmented-client-rect','display-contents','nonfinite-box']){
    const f=model(),node=f.addOverlay({bounds:rect(8,4,1,1),style:{backgroundColor:'transparent',clipPath:'inset(50%)'}});
    f.addText(node,'설명',[rect(8,4,30,14)]);node.paintRects=[];
    if(variant==='missing-client-rect')node.getClientRects=()=>[];
    if(variant==='fragmented-client-rect')node.getClientRects=()=>[rect(8,4,1,1),rect(10,4,1,1)];
    if(variant==='display-contents')node.computed.display='contents';
    if(variant==='nonfinite-box')node.getBoundingClientRect=()=>rect(NaN,4,1,1);
    const result=await verifyP0TextInk(cdpFor(f,{hitOverride:()=>f.textNode}),'#atlas-page-heading');
    assert.equal(result.status,'unverified',JSON.stringify({variant,result}));
  }
});

test('ancestor clip-path clips descendant paint including a fixed-position descendant',async()=>{
  for(const position of ['static','absolute','fixed']){
    const f=model(),parent=f.addOverlay({bounds:rect(8,4,80,14),style:{backgroundColor:'transparent',clipPath:'inset(0 0 0 64px)'}});
    parent.paintRects=[];
    const child=f.addOverlay({parent,bounds:rect(8,4,30,14),style:{position}});child.paintRects=[];
    const result=await verifyP0TextInk(cdpFor(f),'#atlas-page-heading');assert.equal(result.status,'passed',JSON.stringify({position,result}));
    const receipt=result.geometry.clippedPaintCandidates.find(item=>item.selector==='#'+child.id);
    assert.ok(receipt);assert.equal(receipt.paintRect,null);assert.ok(receipt.clips.some(item=>item.selector==='#'+parent.id));
  }
});

test('own overflow clips overflowing text using the measured box without suppressing its heading proof',async()=>{
  const f=model(),node=f.addOverlay({bounds:rect(72,4,2,14),style:{backgroundColor:'transparent',overflow:'hidden',overflowX:'hidden',overflowY:'hidden'}});
  f.addText(node,'내용',[rect(8,4,30,14)]);node.paintRects=[];
  const result=await verifyP0TextInk(cdpFor(f),'#atlas-page-heading');assert.equal(result.status,'passed',JSON.stringify(result));
  assert.ok(result.geometry.clippedPaintCandidates.some(item=>item.kind==='text'&&item.selector==='#'+node.id&&item.status==='empty'));
  assert.equal(result.geometry.intersections.length,0);
});

test('overflow clips descendants but not the clipping element own border paint',async()=>{
  const f=model(),node=f.addOverlay({bounds:rect(8,4,30,14),style:{backgroundColor:'transparent',overflow:'hidden',overflowX:'hidden',overflowY:'hidden',
    borderLeftWidth:'3px',borderLeftColor:'rgb(0, 0, 0)',borderLeftStyle:'solid'}});
  Object.defineProperty(node,'clientLeft',{get:()=>3});Object.defineProperty(node,'clientWidth',{get:()=>27});
  node.paintRects=[rect(8,4,3,14)];
  const result=await verifyP0TextInk(cdpFor(f),'#atlas-page-heading');assert.equal(result.status,'failed',JSON.stringify(result));
  assert.ok(result.geometry.overlappingPaintCandidates.some(item=>item.selector==='#'+node.id&&item.kind==='border'));
});

test('an absolute or fixed descendant cannot be falsely removed by an unrelated overflow ancestor',async()=>{
  for(const position of ['absolute','fixed']){
    const f=model(),parent=f.addOverlay({bounds:rect(200,200,10,10),style:{position:'static',backgroundColor:'transparent',overflow:'hidden',overflowX:'hidden',overflowY:'hidden'}});
    parent.paintRects=[];
    const child=f.addOverlay({parent,bounds:rect(14.1,5,1,12),style:{position}});child.paintRects=[child.bounds];
    const result=await verifyP0TextInk(cdpFor(f),'#atlas-page-heading');
    assert.notEqual(result.status,'passed',JSON.stringify({position,result}));
    assert.ok(['failed','unverified'].includes(result.status));
  }
});

test('a positive subpixel inset remnant is not rounded into an empty sr-only exception',async()=>{
  const f=model(),node=f.addOverlay({bounds:rect(14,5,1,12),style:{clipPath:'inset(0 49% 0 49%)'}});
  node.paintRects=[rect(14.49,5,.02,12)];
  const result=await verifyP0TextInk(cdpFor(f),'#atlas-page-heading');
  assert.equal(result.status,'unverified',JSON.stringify(result));
  const receipt=result.geometry.clippedPaintCandidates.find(item=>item.selector==='#'+node.id);
  assert.ok(receipt?.paintRect?.width>0);assert.ok(result.geometry.intersections.some(hit=>hit.area>0&&hit.rect.width<1));
});

test('opening the same one-pixel description clip cannot retain its empty-paint exception',async()=>{
  const f=model({top:57}),node=f.addOverlay({id:'atlas-page-description',bounds:rect(24,70,1,1),style:{backgroundColor:'transparent',clipPath:'inset(0)',overflow:'hidden',overflowX:'hidden',overflowY:'hidden'}});
  f.addText(node,'설명',[rect(24,70,373.59375,13)]);node.paintRects=[rect(24,70,1,1)];
  const result=await verifyP0TextInk(cdpFor(f),'#atlas-page-heading');
  assert.equal(result.status,'unverified',JSON.stringify(result));
  assert.ok(result.geometry.intersections.some(hit=>hit.area>0));
  assert.match(result.reason,/interior integer probe/);
});

test('CSS zoom with px clipping does not use an unscaled box as an empty proof',async()=>{
  const f=model(),node=f.addOverlay({bounds:rect(8,4,30,14),style:{clipPath:'inset(10px)',zoom:'2'}});node.paintRects=[];
  const result=await verifyP0TextInk(cdpFor(f,{hitOverride:()=>f.textNode}),'#atlas-page-heading');
  assert.equal(result.status,'unverified',JSON.stringify(result));
});

test('native pseudo quads are clipped by their own computed clip before intersection testing',async()=>{
  for(const [clipPath,paintRects,status]of [
    ['inset(50%)',[],'passed'],['inset(0)',[rect(14.1,5,1,12)],'failed'],['circle(50%)',[],'unverified'],
  ]){
    const f=model(),owner=f.addOverlay({bounds:rect(200,200,20,20),style:{backgroundColor:'transparent'}});owner.paintRects=[];
    const pseudo=f.addPseudo(owner,{bounds:rect(14.1,5,1,12),style:{clipPath}});pseudo.paintRects=paintRects;
    const cdp=cdpFor(f),result=await verifyP0TextInk(cdp,'#atlas-page-heading');assert.equal(result.status,status,JSON.stringify({clipPath,result}));
    if(status==='passed'){
      assert.ok(cdp.calls.some(call=>call.method==='DOM.getBoxModel'),'a pseudo clip must use its own native box');
      assert.equal(result.geometry.intersections.length,0);
      assert.ok(result.geometry.clippedPaintCandidates.some(item=>item.kind==='pseudo'&&item.paintRect===null));
    }
  }
});

test('a pseudo outside its owner still inherits the owner clip, and missing quad never passes',async()=>{
  const f=model(),owner=f.addOverlay({bounds:rect(200,200,20,20),style:{backgroundColor:'transparent',clipPath:'inset(50%)'}});owner.paintRects=[];
  const pseudo=f.addPseudo(owner,{bounds:rect(14.1,5,1,12)});pseudo.paintRects=[];
  const result=await verifyP0TextInk(cdpFor(f),'#atlas-page-heading');assert.equal(result.status,'passed',JSON.stringify(result));
  assert.ok(result.geometry.clippedPaintCandidates.some(item=>item.kind==='pseudo'&&item.paintRect===null));
  const missing=await verifyP0TextInk(cdpFor(f,{failMethod:'DOM.getBoxModel'}),'#atlas-page-heading');
  assert.equal(missing.status,'unverified');
});

test('a positioned pseudo escaping its owner overflow remains an occlusion candidate',async()=>{
  for(const position of ['absolute','fixed']){
    const f=model(),owner=f.addOverlay({bounds:rect(200,200,20,20),style:{position:'static',backgroundColor:'transparent',overflow:'hidden',overflowX:'hidden',overflowY:'hidden'}});owner.paintRects=[];
    const pseudo=f.addPseudo(owner,{bounds:rect(14.1,5,1,12),style:{position}});pseudo.paintRects=[pseudo.bounds];
    const result=await verifyP0TextInk(cdpFor(f),'#atlas-page-heading');
    assert.notEqual(result.status,'passed',JSON.stringify({position,result}));
  }
});

test('a changed pseudo quad or clip between measurements cannot reuse old empty-paint evidence',async()=>{
  for(const change of ['quad','clip']){
    const f=model(),owner=f.addOverlay({bounds:rect(200,200,20,20),style:{backgroundColor:'transparent'}});owner.paintRects=[];
    const pseudo=f.addPseudo(owner,{bounds:rect(14.1,5,1,12),style:{clipPath:'inset(50%)'}});pseudo.paintRects=[];
    const cdp=cdpFor(f),send=cdp.send.bind(cdp);let measurements=0;
    cdp.send=async(method,params)=>{
      const result=await send(method,params);
      if(method==='DOM.getBoxModel'){
        measurements++;
        if(change==='clip'&&measurements===1)owner.pseudos['::before'].clipPath='inset(0)';
        if(change==='quad'&&measurements===2)result.model.border=result.model.border.map((coordinate,index)=>coordinate+(index%2===0?1:0));
      }
      return result;
    };
    const result=await verifyP0TextInk(cdp,'#atlas-page-heading');
    assert.equal(result.status,'unverified',JSON.stringify({change,result}));
    assert.match(result.reason,/chang|differ|stable|quad/i);
  }
});

test('clipping required heading ink never makes the required title vacuously visible',async()=>{
  for(const clipPath of ['inset(50%)','inset(0 0 0 80%)']){
    const f=model({headingStyle:{clipPath}}),result=await verifyP0TextInk(cdpFor(f,{hitOverride:()=>f.textNode}),'#atlas-page-heading');
    assert.notEqual(result.status,'passed',JSON.stringify({clipPath,result}));assert.match(result.reason,/clipp|ink|glyph/i);
    const snapshot=await inspectP0Snapshot(cdpFor(f,{snapshot:snapshotFor(f),hitOverride:()=>f.textNode}),{symbol:'BTCUSD',width:320,theme:'light'},'chart',[],[]);
    assert.notEqual(validateP0Paint(snapshot.samples[0]).status,'passed');
  }
});
