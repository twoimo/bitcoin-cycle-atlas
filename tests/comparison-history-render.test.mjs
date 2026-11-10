import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {parseComparisonUrl,comparisonUrlChanged} from '../dist/comparison-url-state.js';
const source=readFileSync(new URL('../dist/app.js',import.meta.url),'utf8');
const part=(start,end)=>{const a=source.indexOf(start),b=source.indexOf(end,a);assert.ok(a>=0&&b>a);return source.slice(a,b);};
const persist=part('function persistUrl() {',"document.documentElement.dataset.theme = 'dark';");
const pop=part("window.addEventListener('popstate'",'function render(recalculate');
const draw=part('function render(recalculate','function renderTiming()');
function fixture(destination,{late=false,mutated=false}={}){
 const callbacks={},frames=[],pending=[],writes=[],nodes=new Map();let draws=0;
 const data={prices:[['2024-01-01',100],['2024-01-02',110]]};
 const initial=parseComparisonUrl('?page=compare&mode=halving');
 const state={...initial,hidden:new Set(initial.hidden),dataset:late?null:data,comparison:null};
 const node=selector=>{if(!nodes.has(selector))nodes.set(selector,{value:'',setAttribute(){},addEventListener(type,fn){this[type]=fn;}});return nodes.get(selector);};
 const context={state,location:{pathname:'/bitcoin-cycle-atlas/',search:destination},URLSearchParams,Set,parseComparisonUrl,comparisonUrlChanged,
  history:{pushState(...args){writes.push({kind:'push',args});},replaceState(...args){writes.push({kind:'replace',args});}},
  window:{addEventListener(type,fn){callbacks[type]=fn;}},requestAnimationFrame(fn){frames.push(fn);},
  ensureDataset(){if(!state.dataset)pending.push(()=>{state.dataset=data;context.render();});return Promise.resolve();},syncPage(){frames.push(()=>context.render());},
  $:node,$$:()=>[],document:{dispatchEvent(){}},CustomEvent:class{},outlookController:{setDataset(){}},btcRefreshStatus:{update(){}},finishInitialPage(){draws++;},
  getAnchors:()=>[{date:'2024-01-01'}],utcDay:date=>Math.floor(Date.parse(date)/86400000),palette:['red'],
  buildComparison:()=>({horizon:730,currentDays:45,series:[{id:'2012',current:true}]}),
  renderLegend(){},renderChart(){},renderTable(){},renderMethod(){},renderResearch(){},syncCursorInputs(){},renderData(){},toast(){},setCursor(){},
 };
 const renderer=mutated?draw.replace("$('#loading-state').hidden = true;","$('#loading-state').hidden = true; persistUrl();"):draw;
 runInNewContext(persist+'\n'+renderer+'\n'+pop,context);
 return {context,state,writes,node,nodes,restore(){callbacks.popstate();while(frames.length)frames.shift()();while(pending.length)pending.shift()();while(frames.length)frames.shift()();return {writes,draws,state};}};
}
for(const [name,url,late]of [
 ['explicit outlook history','?page=outlook&mode=bottom&center=price&unit=usd&view-start=1700000000',false],
 ['same-page compare query','?page=compare&mode=top&compare-unit=indexed&range=730&day=45',false],
 ['late dataset after history restore','?page=outlook&mode=bottom',true],
])test(name+' performs zero history writes after scheduled and delayed renders',()=>{const f=fixture(url,{late}),r=f.restore();assert.ok(r.draws>0,'real production render was executed');assert.equal(r.writes.length,0);assert.equal(f.context.location.search,url);assert.equal(r.state.mode,parseComparisonUrl(url).mode);});
test('negative control catches the old indirect render-to-persist mutation',()=>{const r=fixture('?page=outlook&mode=bottom',{mutated:true}).restore();assert.ok(r.writes.some(w=>w.kind==='push'),'the old render creates history during Back');});
test('explicit comparison controls still persist their user intent',()=>{
 const selectors=['#compare-view .anchor-tab[data-mode]','[data-unit]','[data-scale]'];
 for(const [selector,data,expected]of [[selectors[0],{mode:'bottom'},'mode=bottom'],[selectors[1],{unit:'indexed'},'compare-unit=indexed'],[selectors[2],{scale:'linear'},'scale=linear']]){
  const f=fixture('?page=compare&center=price&unit=usd&view-start=1700000000'),button={dataset:data,classList:{toggle(){}},setAttribute(){},addEventListener(type,fn){this[type]=fn;}};
  f.context.$$=query=>query===selector?[button]:[];
  const handlers=part("$$('#compare-view .anchor-tab[data-mode]').forEach(b=>b.addEventListener('click'",'function download(');
  runInNewContext(handlers,f.context);button.click();assert.equal(f.writes.length,1);const url=f.writes[0].args[2];assert.ok(url.includes(expected));assert.ok(url.includes('center=price')&&url.includes('unit=usd')&&url.includes('view-start=1700000000'));
 }
});
