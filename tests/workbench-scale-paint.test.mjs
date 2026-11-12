import assert from 'node:assert/strict';
import test from 'node:test';
import {readFile} from 'node:fs/promises';
import {SITE_STYLE_GROUPS,SITE_STYLE_SOURCES} from '../scripts/build-site-styles.mjs';
import {p0CssDeclarations,p0SplitArguments,readP0RootTokens,resolveP0Token,validateP0Paint,validateP0PaintRole} from '../scripts/ui-renewal-p0-contract.mjs';

// This is a bounded source/cascade contract, not a browser style measurement.
// The native P0 gate still measures the original controls at its original time.
const read = file => readFile(new URL('../dist/'+file,import.meta.url),'utf8');
const base = await read('styles.css'), tokens = readP0RootTokens(base);
const source = await Promise.all(SITE_STYLE_SOURCES.map(read));
const shipped = await Promise.all(SITE_STYLE_GROUPS.map(group=>read(group.file)));
const paint = foreground => ({visible:true,kind:'text',foreground,backgrounds:['rgb(229, 232, 235)'],issues:[]});

function button(id,{symbol='ETHUSD',theme='light',pressed=true,hover=false,focus=false}={}) {
  const html={tag:'html',id:'',classes:[],attrs:{'data-theme':theme,'data-symbol':symbol},parent:null};
  const body={tag:'body',id:'',classes:[],attrs:{'data-shell':'chart','data-symbol':symbol},parent:html};
  const bottom={tag:'div',id:'',classes:['workbench-bottom','workbench-bottom-bar'],attrs:{},parent:body};
  const scroll={tag:'div',id:'',classes:['workbench-bottom-scroll'],attrs:{},parent:bottom};
  const axis={tag:'div',id:'',classes:['workbench-axis'],attrs:{},parent:scroll};
  return {tag:'button',id,classes:id==='workbench-auto-scale'?['workbench-auto']:[],attrs:{'aria-pressed':String(pressed)},states:{hover,'focus-visible':focus},parent:axis};
}

function compoundMatches(selector,node) {
  const parts=selector.match(/\[[^\]]+\]|[#.][\w-]+|:[\w-]+|\*|^[a-z][\w-]*/gi)||[];
  assert.equal(parts.join(''),selector,`Unmodelled transition selector: ${selector}`);
  return parts.every(part=>{
    if(part==='*')return true;
    if(part[0]==='#')return node.id===part.slice(1);
    if(part[0]==='.')return node.classes.includes(part.slice(1));
    if(part[0]===':')return part===':root'?node.tag==='html':Boolean(node.states?.[part.slice(1)]);
    if(part[0]==='['){const match=/^\[([\w-]+)(?:=["']?([^"'\]]+)["']?)?\]$/.exec(part);assert.ok(match,`Unmodelled transition attribute: ${part}`);return match[2]===undefined?Object.hasOwn(node.attrs,match[1]):node.attrs[match[1]]===match[2];}
    return node.tag===part.toLowerCase();
  });
}
function matches(selector,node) {
  const parts=selector.trim().split(/\s+/);if(!compoundMatches(parts.pop(),node))return false;
  for(const part of parts.reverse()){let ancestor=node.parent;while(ancestor&&!compoundMatches(part,ancestor))ancestor=ancestor.parent;if(!ancestor)return false;node=ancestor;}
  return true;
}
function mediaApplies(ancestors,width) {
  return ancestors.every(value=>{
    const query=value.replace(/\s+/g,'');
    if(query==='@media(prefers-reduced-motion:reduce)')return false;
    if(query==='@media(prefers-reduced-motion:no-preference)')return true;
    const match=/^@media\((max|min)-width:(\d+)px\)$/.exec(query);assert.ok(match,`Unmodelled transition condition: ${value}`);
    return match[1]==='max'?width<=Number(match[2]):width>=Number(match[2]);
  });
}
const seconds = text => {const match=/^(-?(?:\d+(?:\.\d+)?|\.\d+))(ms|s)$/.exec(text);assert.ok(match,`Unmodelled transition time: ${text}`);return Number(match[1])/(match[2]==='ms'?1000:1);};
const inventories=new Map();
function transitionDeclarations(css) {
  if(inventories.has(css))return inventories.get(css);
  const rows=(Array.isArray(css)?css:[css]).flatMap(sheet=>{const parsed=p0CssDeclarations(sheet);assert.deepEqual(parsed.issues,[]);return parsed.declarations.filter(declaration=>/^transition(?:$|-)/.test(declaration.property));});
  inventories.set(css,rows);return rows;
}
function transitionState(declarations,node,width) {
  const winners=new Map();let order=0;
  for(const declaration of declarations){
    order++;if(!mediaApplies(declaration.ancestors,width))continue;
    for(const selector of p0SplitArguments(declaration.selector)){
      if(!matches(selector,node))continue;
      const important=/!important\s*$/i.test(declaration.value),value=declaration.value.replace(/\s*!important\s*$/i,'');
      const ids=(selector.match(/#[\w-]+/g)||[]).length,classes=(selector.match(/\.[\w-]+|\[[^\]]+\]|:[\w-]+/g)||[]).length;
      const tags=(selector.replace(/#[\w-]+|\.[\w-]+|\[[^\]]+\]|:[\w-]+/g,'').match(/[a-z][\w-]*/gi)||[]).length;
      const priority=[Number(important),ids,classes,tags,order];
      const set=(property,result)=>{const previous=winners.get(property),difference=previous?priority.findIndex((n,index)=>n!==previous.priority[index]):-1;if(!previous||difference>=0&&priority[difference]>previous.priority[difference])winners.set(property,{value:result,priority,selector});};
      if(declaration.property==='transition'){
        const rows=value==='none'?[{property:'none',duration:0,delay:0}]:p0SplitArguments(value).map(part=>{
          const pieces=part.trim().split(/\s+/),times=pieces.filter(piece=>/^-?(?:\d|\.)/.test(piece));
          const property=pieces.find(piece=>/^[-a-z]+$/i.test(piece)&&!['ease','ease-in','ease-out','ease-in-out','linear','step-start','step-end','normal','allow-discrete'].includes(piece))||'all';
          assert.ok(times.length<=2);return {property,duration:times.length?seconds(times[0]):0,delay:times.length>1?seconds(times[1]):0};
        });
        for(const name of ['property','duration','delay'])set(name,rows.map(row=>row[name]));
      }else if(['transition-property','transition-duration','transition-delay'].includes(declaration.property)){
        const name=declaration.property.slice('transition-'.length);set(name,p0SplitArguments(value).map(part=>name==='property'?part.trim():seconds(part.trim())));
      }
    }
  }
  const properties=winners.get('property')?.value||['all'],durations=winners.get('duration')?.value||[0],delays=winners.get('delay')?.value||[0];
  return properties.map((property,index)=>({property,duration:durations[index%durations.length],delay:delays[index%delays.length]}));
}
const critical = new Set(['all','color','-webkit-text-fill-color','background','background-color']);
const interpolatedPaint = state => state.filter(row=>critical.has(row.property)&&row.duration+row.delay>0);

test('scale controls retain the exact existing light role endpoints and alias provenance',()=>{
  assert.deepEqual(resolveP0Token(tokens,'--chrome-active','light').chain,['--chrome-active','--ui-link','--accent-ink']);
  assert.deepEqual(resolveP0Token(tokens,'--chrome-active','light').color,[90,59,240,1]);
  assert.deepEqual(resolveP0Token(tokens,'--text','light').color,[25,31,40,1]);
  assert.deepEqual(resolveP0Token(tokens,'--chart-bottom-bar-ink','light').color,[78,89,104,1]);
  assert.deepEqual(resolveP0Token(tokens,'--chart-bottom-bar-surface','light').color,[229,232,235,1]);
});

test('the recorded ETH intermediate channels still fail role validation despite sufficient contrast',()=>{
  const start=[78,89,104],progress=.984;
  const tween=destination=>start.map((channel,index)=>Math.round(channel+(destination[index]-channel)*progress));
  assert.deepEqual(tween([90,59,240]),[90,59,238]);assert.deepEqual(tween([25,31,40]),[26,32,41]);
  for(const [observed,exact]of [['rgb(90, 59, 238)','rgb(90, 59, 240)'],['rgb(26, 32, 41)','rgb(25, 31, 40)']]){
    assert.equal(validateP0Paint(paint(observed)).status,'passed');
    assert.equal(validateP0PaintRole(paint(observed),tokens,'light').status,'failed','a 1–2 channel mismatch must not acquire tolerance');
    assert.equal(validateP0PaintRole(paint(exact),tokens,'light').status,'passed');
  }
  const inherited=transitionState(transitionDeclarations(base),button('workbench-scale'),1440);
  assert.ok(interpolatedPaint(inherited).some(row=>row.property==='color'&&row.duration===.16),'the shared base rule reproduces the interpolation opportunity');
});

for(const [label,css]of [['authored cascade',source],['shipped stylesheet cascade',shipped]])test(`${label} keeps both scale controls at exact paint endpoints without waiting for transitions`,()=>{
  const declarations=transitionDeclarations(css);
  for(const symbol of ['BTCUSD','ETHUSD'])for(const theme of ['light','dark'])for(const width of [320,390,768,1440])
    for(const state of [{pressed:false},{pressed:true},{pressed:false,hover:true},{pressed:true,hover:true,focus:true}])for(const id of ['workbench-scale','workbench-auto-scale']){
      const actual=transitionState(declarations,button(id,{symbol,theme,...state}),width);
      assert.deepEqual(interpolatedPaint(actual),[],JSON.stringify({label,symbol,theme,width,id,state,actual}));
    }
});

test('a later higher-specificity transition regression is detected instead of accepting an earlier opt-out',()=>{
  for(const declaration of ['transition:color 160ms','transition-property:background-color;transition-duration:.16s','transition-property:color;transition-duration:0s;transition-delay:.16s']){
    const injected=[...transitionDeclarations(source),...transitionDeclarations(`#workbench-scale#workbench-scale{${declaration}}`)];
    assert.ok(interpolatedPaint(transitionState(injected,button('workbench-scale'),1440)).length>0,declaration);
  }
});
