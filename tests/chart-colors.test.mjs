import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';
import { CHART_COLORS_STORAGE_KEY, readChartColors, applyChartColors, initChartColors, createChartColorsControl } from '../dist/ui/chart-colors.js';

// Preference/event ownership fixture only. Browser geometry, native select
// input, paint contrast and the existing native gates remain separate checks.
class ElementFixture extends EventTarget {
  constructor(tag, document) { super();this.tagName=tag.toUpperCase();this.ownerDocument=document;this.children=[];this.attributes=new Map();this.dataset={}; }
  setAttribute(name,value) { this.attributes.set(name,String(value)); }
  getAttribute(name) { return this.attributes.get(name)??null; }
  hasAttribute(name) { return this.attributes.has(name); }
  append(...nodes) { this.children.push(...nodes); }
  focus() { this.ownerDocument.activeElement=this; }
}
function storage(value=null) {
  const values=new Map(value===null?[]:[[CHART_COLORS_STORAGE_KEY,value]]),writes=[];
  return {values,writes,getItem:key=>values.get(key)??null,setItem(key,value){writes.push([key,value]);values.set(key,String(value));}};
}
function fixture(t,{preference=storage(),parent,origin='https://atlas.example'}={}) {
  const document=new EventTarget(),view=new EventTarget();
  view.location={origin};view.parent=parent||view;view.localStorage=preference;document.defaultView=view;
  document.createElement=tag=>new ElementFixture(tag,document);
  document.documentElement=document.createElement('html');document.body=document.createElement('body');document.documentElement.append(document.body);
  const all=node=>node.children.flatMap(child=>[child,...all(child)]);
  document.querySelectorAll=selector=>{
    assert.ok(['[data-chart-colors-select]','iframe'].includes(selector),'preference synchronization never selects chart data or model nodes');
    return all(document.documentElement).filter(node=>selector==='iframe'?node.tagName==='IFRAME':node.hasAttribute('data-chart-colors-select'));
  };
  const boot=()=>initChartColors({document});
  t.after(()=>boot()?.destroy());
  return {document,view,preference,boot,root:document.documentElement};
}
function emit(target,type,properties={}) {
  const event=new Event(type);
  for(const [key,value]of Object.entries(properties))Object.defineProperty(event,key,{value});
  target.dispatchEvent(event);
}
function control(f) {
  const row=createChartColorsControl(f.document);f.document.body.append(row);
  return {row,select:row.children.find(node=>node.tagName==='SELECT')};
}
function frame(f) {
  const node=f.document.createElement('iframe'),calls=[];
  node.contentWindow={postMessage:(message,origin)=>calls.push({message,origin})};f.document.body.append(node);
  return {node,source:node.contentWindow,calls};
}

test('Korean is the explicit fallback and a saved valid palette restores without a write',t=>{
  assert.equal(CHART_COLORS_STORAGE_KEY,'atlas-chart-colors');
  for(const value of [null,'','red','KOREAN','{"value":"korean"}'])assert.equal(readChartColors(storage(value)),'korean');
  assert.equal(readChartColors(storage('international')),'international');
  assert.equal(readChartColors({getItem(){throw Error('blocked');}}),'korean');
  const f=fixture(t,{preference:storage('international')});f.boot();
  assert.equal(f.root.dataset.chartColors,'international');assert.deepEqual(f.preference.writes,[]);
  assert.equal(f.boot(),f.boot(),'one listener owner per document');
});

test('a labelled native select changes only paint preference, synchronizes controls, and retains focus',t=>{
  const f=fixture(t),chart=f.document.createElement('svg');chart.dataset.plotRight='256';chart.dataset.priceMax='1200';f.document.body.append(chart);
  const first=control(f),second=control(f);
  assert.equal(first.row.tagName,'LABEL');assert.equal(first.row.className,'chart-colors-setting');
  assert.equal(first.select.getAttribute('aria-label'),'캔들·등락 색');
  assert.deepEqual(first.select.children.map(option=>[option.value,option.textContent]),[['korean','상승 빨강 · 하락 파랑'],['international','상승 초록 · 하락 빨강']]);
  let commands=0,resizes=0;f.document.addEventListener('atlas:chart-command',()=>commands++);f.view.addEventListener('resize',()=>resizes++);
  first.select.focus();first.select.value='international';emit(first.select,'change');
  assert.equal(f.root.dataset.chartColors,'international');assert.equal(second.select.value,'international');
  assert.equal(f.document.activeElement,first.select);assert.equal(f.document.body.children[0],chart);
  assert.deepEqual(chart.dataset,{plotRight:'256',priceMax:'1200'});assert.equal(commands,0);assert.equal(resizes,0);
  second.select.value='korean';emit(second.select,'change');assert.equal(first.select.value,'korean');
  assert.deepEqual(f.preference.writes,[[CHART_COLORS_STORAGE_KEY,'international'],[CHART_COLORS_STORAGE_KEY,'korean']]);
});

test('a storage exception keeps a live selection across reader reopening',t=>{
  const f=fixture(t,{preference:{getItem(){throw Error('blocked');},setItem(){throw Error('blocked');}}});
  const {select}=control(f);select.value='international';assert.doesNotThrow(()=>emit(select,'change'));
  assert.equal(control(f).select.value,'international');
});

test('cross-tab storage ignores other keys and storage owners, then updates without echo writes',t=>{
  const f=fixture(t),{select}=control(f);
  emit(f.view,'storage',{key:'other',newValue:'international',storageArea:f.preference});
  emit(f.view,'storage',{key:CHART_COLORS_STORAGE_KEY,newValue:'international',storageArea:storage()});
  assert.equal(select.value,'korean');
  emit(f.view,'storage',{key:CHART_COLORS_STORAGE_KEY,newValue:'international',storageArea:f.preference});
  assert.equal(select.value,'international');
  emit(f.view,'storage',{key:null,newValue:null,storageArea:f.preference});assert.equal(select.value,'korean');
  assert.deepEqual(f.preference.writes,[]);
});

test('frame messages accept only exact-origin parent or owned frames and never echo to the sender',t=>{
  const parentCalls=[],parent={postMessage:(message,origin)=>parentCalls.push({message,origin})};
  const f=fixture(t,{parent}),a=frame(f),b=frame(f),{select}=control(f);
  assert.deepEqual(parentCalls,[{message:{type:'atlas:chart-colors-request'},origin:'https://atlas.example'}]);
  a.calls.length=0;b.calls.length=0;
  const valid={type:'atlas:chart-colors',value:'international'};
  for(const [origin,source,data]of [['https://other.example',a.source,valid],['null',a.source,valid],['https://atlas.example',{},valid],['https://atlas.example',a.source,{...valid,value:'invalid'}]])emit(f.view,'message',{origin,source,data});
  assert.equal(select.value,'korean');assert.equal(a.calls.length,0);assert.equal(b.calls.length,0);
  emit(f.view,'message',{origin:'https://atlas.example',source:a.source,data:valid});
  assert.equal(select.value,'international');assert.equal(a.calls.length,0);assert.equal(b.calls.length,1);
  assert.deepEqual(parentCalls.at(-1),{message:valid,origin:'https://atlas.example'});assert.deepEqual(f.preference.writes,[]);
  const before=b.calls.length;emit(f.view,'message',{origin:'https://atlas.example',source:b.source,data:{type:'atlas:chart-colors-request'}});
  assert.equal(b.calls.length,before+1);assert.deepEqual(b.calls.at(-1),{message:valid,origin:'https://atlas.example'});
  emit(f.view,'message',{origin:'https://atlas.example',source:parent,data:{type:'atlas:chart-colors',value:'korean'}});assert.equal(select.value,'korean');
});

test('destroy removes synchronization listeners while direct application remains paint-only',t=>{
  const f=fixture(t),child=frame(f),controller=f.boot();child.calls.length=0;controller.destroy();
  emit(f.view,'storage',{key:CHART_COLORS_STORAGE_KEY,newValue:'international',storageArea:f.preference});
  emit(f.document,'load',{target:child.node});
  assert.equal(f.root.dataset.chartColors,'korean');assert.deepEqual(child.calls,[]);
  applyChartColors('international',{document:f.document,persist:false});assert.equal(f.root.dataset.chartColors,'international');
  const replacement=f.boot();controller.destroy();assert.equal(f.boot(),replacement,'old teardown cannot remove the new preference owner');
});

for(const path of ['../dist/index.html','../apps/web/index.html'])test(`${path}: first paint restores only validated theme and candle colors without storage writes`,async()=>{
  const html=await readFile(new URL(path,import.meta.url),'utf8');
  const match=html.match(/<script id="atlas-theme-preference">([\s\S]*?)<\/script>/);
  assert.ok(match,'the actual early bootstrap is present');
  for(const [savedTheme,savedPalette,expectedTheme,expectedPalette,blocked]of [
    ['dark','international','dark','international',false],['light','korean','light','korean',false],
    ['dark','unexpected','dark','korean',false],['unexpected','international','light','international',false],
    [null,null,'light','korean',false],['dark','international','light','korean',true],
  ]){
    const root={dataset:{},style:{}},reads=[],writes=[];
    const context={document:{documentElement:root},localStorage:{getItem(key){reads.push(key);if(blocked)throw Error('blocked');return key==='atlas-ui-theme'?savedTheme:savedPalette;},setItem(...args){writes.push(args);}}};
    assert.doesNotThrow(()=>runInNewContext(match[1],context));
    assert.deepEqual(root.dataset,{theme:expectedTheme,chartColors:expectedPalette});assert.equal(root.style.colorScheme,expectedTheme);
    assert.deepEqual(reads,blocked?['atlas-ui-theme']:['atlas-ui-theme',CHART_COLORS_STORAGE_KEY]);assert.deepEqual(writes,[]);
  }
});
