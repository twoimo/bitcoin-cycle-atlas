import assert from 'node:assert/strict';
import test from 'node:test';
import {captureChartExportSnapshot} from '../dist/chart-export-workbench.js';

class Node {
  constructor(tag,doc){this.tagName=tag;this.ownerDocument=doc;this.values=new Map();this.children=[];this.textContent='';this.style={removeProperty(){}};this.parentElement=null;}
  get attributes(){return [...this.values].map(([name,value])=>({name,value}));}
  getAttribute(name){return this.values.get(name)??null;}
  setAttribute(name,value){this.values.set(name,String(value));}
  removeAttribute(name){this.values.delete(name);}
  append(...nodes){for(const node of nodes){node.parentElement=this;this.children.push(node);}}
  remove(){if(this.parentElement)this.parentElement.children=this.parentElement.children.filter(node=>node!==this);}
  cloneNode(deep){const n=new Node(this.tagName,this.ownerDocument);n.values=new Map(this.values);if(deep)n.append(...this.children.map(child=>child.cloneNode(true)));return n;}
  querySelectorAll(){return [];}
}
function fixture({pixels=[0,0,0,255,220,30,40,255],tainted=false,canvasBox={left:0,top:0,width:800,height:400},svgBox={left:0,top:0,width:800,height:400}}={}){
  const serialize=n=>`<${n.tagName}${n.attributes.map(a=>` ${a.name}="${a.value}"`).join('')}>${n.textContent}${n.children.map(serialize).join('')}</${n.tagName}>`;
  const doc={defaultView:{getComputedStyle:()=>({getPropertyValue:()=>''}),XMLSerializer:class{serializeToString(n){return serialize(n);}}},createElementNS:(_ns,tag)=>new Node(tag,doc)};
  const svg=new Node('svg',doc);svg.setAttribute('viewBox','0 0 800 400');svg.getBoundingClientRect=()=>svgBox;
  const canvas={ownerDocument:doc,width:1600,height:800,getBoundingClientRect:()=>canvasBox,getContext:()=>({getImageData(){if(tainted)throw Error('tainted');return {data:new Uint8ClampedArray(pixels)};}}),toDataURL:()=>{if(tainted)throw Error('tainted');return 'data:image/png;base64,Y2hhcnQ=';}};
  return {svg,canvas};
}
test('Funnest canvas is embedded at exact viewport coordinates while overlays and source metadata remain vector',()=>{
  const f=fixture({canvasBox:{left:10,top:20,width:400,height:200},svgBox:{left:0,top:0,width:800,height:400}});
  const snap=captureChartExportSnapshot({svg:f.svg,canvas:f.canvas,range:{start:'2026-10-01',end:'2026-10-21'},rows:[{date:'2026-10-21',price:100}],asOf:'2026-10-21',imageOptions:{title:'BTCUSD',source:'Coin Metrics'}});
  const vector=snap.images.main;assert.match(vector,/data:image\/png;base64,Y2hhcnQ=/);assert.match(vector,/Funnest 캔버스 플롯은 현재 렌더된 픽셀 이미지/);assert.match(vector,/Coin Metrics/);assert.match(vector,/x="10" y="57" width="400" height="200"/);
  assert.doesNotMatch(vector,/<svg[^>]*viewBox="0 0 800 400"[^>]*>.*<svg[^>]*viewBox="0 0 800 400"/s);
});
test('unpainted, tainted and mismatched Funnest canvases are rejected as image failures, never empty successes',()=>{
  for(const f of [fixture({pixels:[10,10,10,255,10,10,10,255]}),fixture({tainted:true}),fixture({canvasBox:{left:0,top:0,width:400,height:100},svgBox:{left:0,top:0,width:800,height:400}})]){
    const snap=captureChartExportSnapshot({svg:f.svg,canvas:f.canvas,range:{start:'2026-10-01',end:'2026-10-21'},rows:[],imageOptions:{title:'BTCUSD'}});
    assert.equal(snap.images.main,null);assert.match(snap.imageErrors.main,/Funnest/);assert.equal(snap.images.workspace,null);
  }
});
