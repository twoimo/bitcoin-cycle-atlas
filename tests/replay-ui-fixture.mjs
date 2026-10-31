import {readFile} from 'node:fs/promises';
import * as vm from 'node:vm';
import * as stateModule from '../dist/chart-replay-state.js';
import * as realEngine from '../dist/forecast-replay.js';
import * as snapshotHelpers from '../dist/chart-replay-snapshot.js';
import {PROJECT_REPLAY_ORIGIN} from '../dist/project-replay-baseline.js';
import {SvgNode} from './replay-svg-fixture.mjs';
import {createAtlasReplayContext,drawAtlasChartReplay} from '../dist/chart-replay-atlas.js';
import {forecastValueSignature} from '../dist/atlas-price-chart.js';
const {version:releaseVersion}=JSON.parse(await readFile(new URL('../package.json',import.meta.url),'utf8'));
export const flush=async()=>{for(let i=0;i<8;i++)await new Promise(setImmediate);};
export const until=async(predicate,label='UI state')=>{const deadline=Date.now()+15000;while(!predicate()){if(Date.now()>deadline)throw new Error('Timed out waiting for '+label);await new Promise(resolve=>setTimeout(resolve,2));}};
export const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return {promise,resolve,reject};};
export async function uiFixture({captured,archive,storedText=null,getAtlasContext=()=>captured,actualPainter=false,loadArchive=async()=>archive,buildCurrent=realEngine.createCurrentChartReplaySession,loadBaseline=async()=>{throw new Error('Historical baseline not needed');}}){
  const source=await readFile(new URL('../dist/chart-replay.js',import.meta.url),'utf8');
  const controls=new Map(),draws=[],frames=[],controllers=[],calls={baseline:0,current:0};let doc;
  class Element{
    constructor(tag='div'){this.tag=tag;this.ownerDocument=doc;this.dataset={};this.attributes={};this.children=[];this.listeners=new Map();this.hidden=false;this.value='';this.inert=false;this.textContent='';this.style={setProperty(){},removeProperty(){}};this.classList={add(){},remove(){}};this.disabled=false;this.checked=false;}
    setAttribute(k,v){this.attributes[k]=String(v);}getAttribute(k){return this.attributes[k]??null;}
    append(...nodes){this.children.push(...nodes);nodes.forEach(n=>n.parentElement=this);}insertBefore(n){this.append(n);}replaceChildren(...ns){this.children=[];this.append(...ns);}
    contains(n){return n===this||this.children.some(c=>c.contains(n));}
    querySelector(selector){const key=selector.match(/^\[data-cr="([^"]+)"\]$/)?.[1];if(key){if(key==='model')return null;if(!controls.has(key)){const n=new Element(['date','scrub','exit-save'].includes(key)?'input':['mode','horizon','speed','record','display','update-interval'].includes(key)?'select':'button');n.value=({mode:'historical-reconstruction',horizon:'180',speed:'1',display:'candles',scrub:'0','update-interval':'daily'})[key]??'';n.hidden=['pick-cancel','record','detail-panel','select-panel','date-view','forecast-view','menu-back','entry-dialog','exit-dialog'].includes(key);n.disabled=key==='update-interval';n.checked=key==='exit-save';controls.set(key,n);}return controls.get(key);}if(selector==='[value="candles"]')return this.candleOption??=new Element('option');return null;}
    querySelectorAll(){return [];}closest(selector){return ['input','select','textarea'].includes(this.tag)&&selector.includes(this.tag)?this:null;}
    addEventListener(t,fn){this.listeners.set(t,[...this.listeners.get(t)??[],fn]);}removeEventListener(t,fn){this.listeners.set(t,(this.listeners.get(t)??[]).filter(f=>f!==fn));}
    dispatchEvent(e){for(const fn of this.listeners.get(e.type)??[]){fn(e);if(e.stopped)break;}return true;}
    getBoundingClientRect(){return {left:0,top:0,width:1000,height:700};}focus(){doc.activeElement=this;}remove(){if(this.parentElement)this.parentElement.children=this.parentElement.children.filter(c=>c!==this);}click(){if(!this.disabled)return this.onclick?.({target:this});}
  }
  doc=new Element('document');doc.documentElement=new Element('html');doc.createElement=t=>new Element(t);doc.createElementNS=(_,t)=>actualPainter?new SvgNode(t,doc):new Element(t);
  const win=new Element('window');doc.defaultView=win;win.navigator={locks:{request:async(_name,_options,work)=>work({name:_name})}};const writes=[];win.localStorage={getItem:()=>storedText,setItem:(k,v)=>{writes.push([k,v]);storedText=v;}};win.requestAnimationFrame=()=>1;win.cancelAnimationFrame=()=>{};win.CustomEvent=class{constructor(type){this.type=type;}};win.setTimeout=()=>0;
  const svg=actualPainter?new SvgNode('svg',doc):new Element('svg');
  if(actualPainter)Object.assign(svg,{id:'lab-chart',clientWidth:1440,clientHeight:760,focus(){doc.activeElement=svg;},getBoundingClientRect:()=>({left:0,top:0,width:1440,height:760})});
  const plot=new Element('div'),toolbar=new Element('nav');plot.append(svg);const axis={min:1,max:1e6,left:8,right:900,top:18,bottom:650};
  const render=options=>{draws.push(options);if(actualPainter)return drawAtlasChartReplay(options);svg.replaceChildren(new Element('path'));svg.dataset.forecastValueSignature=forecastValueSignature(options.data.frame.forecast);svg.dataset.replayActualThrough=options.data.observedRows.at(-1)?.date??'';return {axis,x:()=>100,dateAt:()=>PROJECT_REPLAY_ORIGIN.startDate,getPriceScale:()=>axis,destroy(){}};};
  const context=vm.createContext({Date,Math,structuredClone,AbortController,URL,Blob,console,ResizeObserver:class{observe(){}disconnect(){}}});
  async function mod(exports){const m=new vm.SyntheticModule(Object.keys(exports),function(){for(const [k,v]of Object.entries(exports))this.setExport(k,v);},{context});await m.link(()=>{throw new Error('Unexpected fixture import');});await m.evaluate();return m;}
  const atlas=await mod({createAtlasReplayContext,drawAtlasChartReplay:render});
  const imports={
    './chart-replay-snapshot.js':await mod(snapshotHelpers),
    ['./chart-replay-state.js?v='+releaseVersion]:await mod({...stateModule,createChartReplayController:options=>{const c=stateModule.createChartReplayController({...options,setTimer:()=>1,clearTimer:()=>{}});controllers.push(c);return c;}}),
    ['./forecast-replay.js?v='+releaseVersion]:await mod({...realEngine,createCurrentChartReplaySession:options=>{calls.current++;return buildCurrent({...options,createdAt:options.createdAt??'2026-10-31T02:00:00.000Z',evaluatedAt:options.evaluatedAt??'2026-10-31T02:00:00.000Z'});}}),
    './chart-replay-renderer.js':await mod({}),
    './chart-replay-sources.js':await mod({loadChartReplayArchive:loadArchive}),
    './project-replay-baseline.js':await mod({PROJECT_REPLAY_ORIGIN,loadProjectReplayBaseline:()=>{calls.baseline++;return loadBaseline();}}),
  };
  const view=new vm.SourceTextModule(source,{context,identifier:'chart-replay-view',importModuleDynamically:s=>{if(!imports[s])throw new Error('Unexpected dynamic import '+s);return imports[s];}});await view.link(s=>imports[s]);await view.evaluate();
  const mounted=view.namespace.mountChartReplay({svg,plot,toolbar,symbol:'BTCUSD',getAtlasContext,getChartState:()=>({frequency:'weekly',chartType:'candles',window:'focus'}),getChartRenderer:()=>({getPriceScale:()=>axis}),loadAtlasRenderer:()=>atlas.namespace,onAtlasFrame:f=>frames.push(f)});
  const trigger=toolbar.children.find(n=>n.id==='workbench-replay');const panel=plot.children.find(n=>n.className==='chart-replay-controls');for(const m of panel.innerHTML.matchAll(/data-cr="([^"]+)"/g))panel.querySelector('[data-cr="'+m[1]+'"]');
  const ready=()=>until(()=>controllers[0].getState().status==='error'||controllers[0].getState().status==='selecting'&&Boolean(draws.at(-1)?.session?.identity?.outputHash),'fully drawn replay selection');
  return {ready,mounted,svg,controls,draws,frames,calls,writes,controllers,panel,trigger,
    savedText:()=>storedText,externalSave(text,{notify=true}={}){storedText=text;if(notify)win.dispatchEvent({type:'storage',key:'atlas-chart-replay-v1:BTCUSD'});},win,doc,
    state:()=>controllers[0].getState(),lastDraw:()=>draws.at(-1),
    async open(){trigger.click();await ready();},
    async start(date,{pending=false}={}){controls.get('date').value=date;controls.get('start').onclick();await until(()=>pending?controllers[0].getState().status==='loading':['paused','error'].includes(controllers[0].getState().status),'selected-start '+(pending?'loading':'completion'));},
    key(key,shiftKey=true){const e={type:'keydown',key,shiftKey,target:svg,preventDefault(){},stopImmediatePropagation(){this.stopped=true;}};doc.dispatchEvent(e);},
  };
}
