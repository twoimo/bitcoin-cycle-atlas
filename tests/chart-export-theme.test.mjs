import assert from 'node:assert/strict';
import test from 'node:test';
import {chartExportTheme,createChartSvgExport,materializeChartPaint} from '../dist/chart-export.js';

// An explicit SVG/ComputedStyle boundary model, never a browser-paint receipt.
// Source colours below are supplied observations; this model does not resolve CSS.
class VectorNode {
  constructor(tagName,ownerDocument){this.tagName=tagName;this.ownerDocument=ownerDocument;this.values=new Map();this.children=[];this.parentElement=null;this.textContent='';}
  get attributes(){return [...this.values].map(([name,value])=>({name,value}));}
  get parentNode(){return this.parentElement;}
  get lastElementChild(){return this.children.at(-1)||null;}
  getAttribute(name){return this.values.get(name)??null;}
  setAttribute(name,value){this.values.set(name,String(value));}
  removeAttribute(name){this.values.delete(name);}
  get dataset(){return Object.fromEntries([...this.values].filter(([key])=>key.startsWith('data-')).map(([key,value])=>[key.slice(5).replace(/-([a-z])/g,(_,letter)=>letter.toUpperCase()),value]));}
  get style(){
    const entries=()=>new Map((this.getAttribute('style')||'').split(';').filter(value=>value.includes(':')).map(value=>{const index=value.indexOf(':');return [value.slice(0,index).trim(),value.slice(index+1).trim()];}));
    const save=values=>this.setAttribute('style',[...values].map(([name,value])=>`${name}:${value}`).join(';'));
    return {getPropertyValue:name=>entries().get(name)||'',setProperty:(name,value)=>{const values=entries();values.set(name,String(value));save(values);},removeProperty:name=>{const values=entries(),value=values.get(name)||'';values.delete(name);save(values);return value;}};
  }
  appendChild(node){node.remove();node.parentElement=this;this.children.push(node);return node;}
  append(...nodes){for(const node of nodes)this.appendChild(node);}
  remove(){if(this.parentElement)this.parentElement.children=this.parentElement.children.filter(node=>node!==this);this.parentElement=null;}
  cloneNode(deep){const copy=new VectorNode(this.tagName,this.ownerDocument);copy.values=new Map(this.values);copy.textContent=this.textContent;if(deep)copy.append(...this.children.map(node=>node.cloneNode(true)));return copy;}
  matches(selector){
    if(selector==='*')return true;
    const tag=selector.match(/^[a-zA-Z]+/)?.[0],className=selector.match(/\.([\w-]+)/)?.[1];
    if(tag&&tag!==this.tagName)return false;
    if(className&&!String(this.getAttribute('class')||'').split(/\s+/).includes(className))return false;
    const attribute=selector.match(/\[([\w-]+)(?:(\$?=)"([^"]*)")?\]/);
    if(attribute){const value=this.getAttribute(attribute[1]);if(!attribute[2]?value===null:attribute[2]==='$='?!value?.endsWith(attribute[3]):value!==attribute[3])return false;}
    return Boolean(tag||className||attribute);
  }
  querySelectorAll(selector){const selectors=selector.split(',').map(value=>value.trim()),found=[];for(const child of this.children){if(selectors.some(value=>child.matches(value)))found.push(child);found.push(...child.querySelectorAll(selector));}return found;}
  querySelector(selector){return this.querySelectorAll(selector)[0]||null;}
  closest(selector){for(let node=this;node;node=node.parentElement)if(node.matches(selector))return node;return null;}
}
const escape=value=>String(value).replaceAll('&','&amp;').replaceAll('"','&quot;').replaceAll('<','&lt;');
const serialize=node=>`<${node.tagName}${node.attributes.map(({name,value})=>` ${name}="${escape(value)}"`).join('')}>${escape(node.textContent)}${node.children.map(serialize).join('')}</${node.tagName}>`;
const palettes={
  light:{background:'rgb(255, 255, 255)',text:'rgb(25, 31, 40)',muted:'rgb(78, 89, 104)',subtle:'rgb(89, 101, 116)',border:'rgb(229, 232, 235)'},
  dark:{background:'rgb(16, 16, 19)',text:'rgb(242, 242, 244)',muted:'rgb(176, 176, 186)',subtle:'rgb(154, 154, 165)',border:'rgb(42, 42, 51)'},
};
function fixture(theme='light'){
  const paint=palettes[theme],observations=new WeakMap(),base={color:paint.text,fill:paint.text,stroke:'none','fill-opacity':'1','stroke-opacity':'1',opacity:'1','font-family':'"Pretendard Variable", sans-serif','font-size':'11px','font-variant':'tabular-nums','color-scheme':theme};
  const doc={URL:'https://atlas.example/index.html?symbol=BTCUSD',defaultView:{XMLSerializer:class{serializeToString(node){return serialize(node);}}}};
  const make=(tag,attrs={},text='')=>{const node=new VectorNode(tag,doc);for(const [key,value]of Object.entries(attrs))node.setAttribute(key,value);node.textContent=text;return node;};
  doc.createElementNS=(_ns,tag)=>make(tag);doc.createElement=tag=>make(tag);
  doc.documentElement=make('html',{'data-theme':theme});doc.body=make('body');doc.documentElement.append(doc.body);
  const computed=node=>{
    if(node.tagName==='span'){
      const token=node.style.getPropertyValue('color').match(/^var\((--[\w-]+),/)?.[1];
      const key={'--bg':'background','--text':'text','--muted':'muted','--subtle':'subtle','--border':'border'}[token];
      return {getPropertyValue:name=>name==='color'?paint[key]||'':''};
    }
    return {getPropertyValue:name=>({...base,...observations.get(node)})[name]||''};
  };
  doc.defaultView.getComputedStyle=computed;
  const svg=make('svg',{id:'live-chart',class:'live-chart-style',viewBox:'0 0 320 200',style:'background:var(--bg);font-family:var(--font)'});doc.body.append(svg);
  const defs=make('defs'),filter=make('filter',{id:'observed-shadow'});filter.append(make('feGaussianBlur',{stdDeviation:'0.5'}));defs.append(filter);
  const data=make('path',{class:'observed-series',d:'M12.25 32.5L80.125 18.75',transform:'translate(0 2)',stroke:'var(--data-gold)',fill:'none','data-source':'venue-close','data-price':'1164.46',filter:'url(#observed-shadow)',style:'stroke:var(--data-gold);stroke-width:2;cursor:crosshair'});
  observations.set(data,{fill:'none',stroke:'rgb(216, 181, 109)','stroke-width':'2px',filter:doc.URL+'#observed-shadow'});
  observations.get(data).filter=`url("${observations.get(data).filter}")`;
  const latest=make('g',{class:'chart-latest-price-tag',visibility:'hidden'}),badge=make('rect',{x:'260',y:'44',width:'60',height:'22'}),label=make('text',{x:'266',y:'59','font-size':'11'},'$1,164.46');latest.append(badge,label);
  observations.set(latest,{opacity:'.65',visibility:'hidden'});observations.set(badge,{fill:paint.border,visibility:'hidden'});observations.set(label,{fill:paint.text,'font-size':'11px',visibility:'hidden'});
  const cross=make('g',{id:'live-chart-cross'});cross.append(make('text',{},'TRANSIENT CURSOR'));
  const tick=make('text',{'data-price-axis-label':'tick',x:'266',y:'116','font-size':'10.5',fill:'var(--chart-axis-ink)'},'$1,000');observations.set(tick,{fill:paint.muted,'font-size':'10.5px'});
  svg.append(defs,data,latest,cross,tick);
  return {svg,doc,make,paint,observations,computed,data,latest,badge,label,tick};
}

for(const theme of ['light','dark'])test(`${theme}: vector export freezes current paint while keeping data, geometry and source tree intact`,()=>{
  const f=fixture(theme),before=serialize(f.svg),children=[...f.doc.body.children];
  const vector=createChartSvgExport(f.svg,{title:'BTCUSD · 가격',readout:'실제 관측 $1,164.46',source:'Venue · 2026-11-12 UTC',note:'완료 봉',countdown:'다음 구간'});
  assert.equal(serialize(f.svg),before,'export never changes the live chart or its style declarations');
  assert.deepEqual(f.doc.body.children,children,'the export colour probe is removed');
  assert.match(vector,new RegExp(`color-scheme:${theme}`));
  assert.ok(vector.includes(`width="100%" height="100%" fill="${f.paint.background}"`));
  assert.ok(vector.includes(`fill="${f.paint.text}" font-size="14"`),'title uses actual themed text');
  assert.ok(vector.includes(`fill="${f.paint.subtle}" font-size="10"`),'footer/countdown uses actual themed subtle ink');
  assert.match(vector,/stroke="rgb\(216, 181, 109\)"/,'data gold remains its resolved data colour in either theme');
  assert.match(vector,/d="M12\.25 32\.5L80\.125 18\.75" transform="translate\(0 2\)"/);
  assert.match(vector,/data-source="venue-close" data-price="1164\.46"/);
  assert.match(vector,/filter="url\(&quot;#observed-shadow&quot;\)"/);assert.match(vector,/stdDeviation="0\.5"/);
  assert.match(vector,/font-size="10\.5"/,'SVG font size remains numeric for the axis collision contract');
  assert.match(vector,/class="chart-latest-price-tag" visibility="visible"/,'cursor removal restores latest-price visibility');
  assert.match(vector,/opacity="\.65"/);assert.ok(vector.includes('$1,164.46'));
  assert.doesNotMatch(vector,/TRANSIENT CURSOR|var\(|light-dark\(|https:\/\//,'standalone paint has no page token or asset reference');
});

test('materialization keeps inherited visibility reversible and leaves independent clones independent',()=>{
  const f=fixture('dark'),clone=f.svg.cloneNode(true),other=f.svg.cloneNode(true),before=serialize(f.svg),otherBefore=serialize(other);
  materializeChartPaint(f.svg,clone);
  const latest=clone.querySelector('.chart-latest-price-tag');
  assert.equal(latest.getAttribute('visibility'),'hidden');
  assert.equal(latest.querySelector('rect').getAttribute('visibility'),null);
  assert.equal(latest.querySelector('text').getAttribute('visibility'),null);
  assert.equal(clone.querySelector('.observed-series').style.getPropertyValue('stroke'),'','resolved attributes cannot be overridden by stale inline var()');
  assert.equal(clone.querySelector('.observed-series').style.getPropertyValue('cursor'),'crosshair','unrelated inline presentation stays intact');
  assert.equal(serialize(f.svg),before);assert.equal(serialize(other),otherBefore);
  assert.throws(()=>materializeChartPaint(f.svg,f.svg),/독립 복제본/);
});

test('unsupported or unresolved live paint fails before mutating a clone',()=>{
  for(const invalid of ['var(--unresolved)','url("https://external.example/gradient.svg#price")']){
    const f=fixture(),clone=f.svg.cloneNode(true),before=serialize(clone);
    f.observations.set(f.data,{fill:'none',stroke:invalid});
    assert.throws(()=>materializeChartPaint(f.svg,clone),/차트 표시 색|외부 자산/);
    assert.equal(serialize(clone),before);
  }
  const f=fixture(),clone=f.svg.cloneNode(true);clone.append(f.make('path'));
  assert.throws(()=>materializeChartPaint(f.svg,clone),/구조/);
});

test('theme probe cleanup is guaranteed when computed style fails',()=>{
  const f=fixture(),children=[...f.doc.body.children],before=serialize(f.svg);
  assert.throws(()=>chartExportTheme(f.svg,{getComputedStyle:node=>{if(node.tagName==='span')throw new Error('computed paint unavailable');return f.computed(node);}}),/computed paint unavailable/);
  assert.deepEqual(f.doc.body.children,children);assert.equal(serialize(f.svg),before);
});

test('hosts without CSS computation retain source attributes and use scheme-aware system export chrome',()=>{
  const f=fixture('dark');delete f.doc.defaultView.getComputedStyle;
  const clone=f.svg.cloneNode(true),before=serialize(clone);
  assert.equal(materializeChartPaint(f.svg,clone),clone);assert.equal(serialize(clone),before);
  assert.deepEqual(chartExportTheme(f.svg),{background:'Canvas',text:'CanvasText',muted:'CanvasText',subtle:'CanvasText',border:'CanvasText',colorScheme:'dark',fontFamily:'sans-serif'});
});
