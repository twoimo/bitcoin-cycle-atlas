import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import * as vm from 'node:vm';

export async function verifyReplayViewFailure(sourceUrl=new URL('../../dist/forecast-replay-view.js',import.meta.url)){
  if(typeof vm.SourceTextModule!=='function')return JSON.parse(execFileSync(process.execPath,
    ['--experimental-vm-modules',fileURLToPath(import.meta.url)],{encoding:'utf8',timeout:20000,stdio:['ignore','pipe','pipe']}));
  const source=await readFile(sourceUrl,'utf8');
  class Element{
    constructor(){this.dataset={};this.attributes={};this.children=[];this.listeners=new Map();this.hidden=false;this.value='';this.innerHTML='';this.textContent='';this.clientWidth=800;this.clientHeight=250;}
    setAttribute(key,value){this.attributes[key]=String(value);}
    addEventListener(key,value){this.listeners.set(key,value);}
    removeEventListener(key,value){if(this.listeners.get(key)===value)this.listeners.delete(key);}
    replaceChildren(...children){this.children=children;}
    append(...children){this.children.push(...children);}
    focus(){}
  }
  async function harness(failureAt){
    const elements=new Map(),node=key=>{if(!elements.has(key))elements.set(key,new Element());return elements.get(key);};
    const panel=node('panel'),host=new Element(),svg=node('svg'),timers=new Map();
    const state={failureAt,exports:0,createdObservers:0,disconnectedObservers:0,renderCalls:0};
    host.isConnected=true;host.querySelector=()=>panel;panel.querySelector=node;
    node('[data-replay-mode]').value='recorded';node('[data-replay-horizon]').value='30';
    node('[data-replay-clock]').value='observed-date';node('[data-replay-clock]').querySelector=node;
    node('[data-replay-speed]').value='1';node('[data-replay-display]').value='line';
    svg.parentElement=new Element();
    const document=new Element(),window=new Element();
    document.createElementNS=()=>new Element();document.createElement=()=>({click(){state.exports++;}});
    const timeline=['2026-01-01','2026-01-02','2026-01-03','2026-01-04'];
    const session={timeline,asOf:timeline[0],endDate:timeline.at(-1),mode:'recorded',
      identity:{symbol:'BTCUSD',recordId:'fixture',outputHash:'fixed-output',pointLabel:'Synthetic',modelVersion:'fixture'},
      observationProvenance:{informationTimeAvailable:true}};
    const archive={observedAt:'2026-01-05T00:00:00Z',observedThrough:timeline.at(-1),source:{},observations:[{date:timeline[0],price:100}]};
    const metrics={matchedCount:0,scoredTargetCount:0,retrospectiveTargetCount:0,pendingTargetCount:0,missingTargetCount:0};
    const api={createRecordedReplaySession:async()=>session,createHistoricalReplaySession:async()=>session,
      buildReplayFrame:(_session,{cursorIndex})=>{
        if(cursorIndex===state.failureAt)throw new RangeError('Ambiguous <unsafe> revision');
        state.renderCalls++;
        return {cursorDate:timeline[cursorIndex],priceDomain:null,inputPrices:[],forecast:[],actual:[],targets:[],metrics};
      }};
    let timerId=0;
    const context=vm.createContext({document,window,AbortController,Date,Blob,
      URL:{createObjectURL:()=> 'blob:test',revokeObjectURL(){}},
      setTimeout:(callback,delay)=>{const id=++timerId;timers.set(id,{callback,delay});return id;},
      clearTimeout:id=>timers.delete(id),
      ResizeObserver:class{constructor(){state.createdObservers++;}observe(){}disconnect(){state.disconnectedObservers++;}}});
    async function module(exports){
      const result=new vm.SyntheticModule(Object.keys(exports),function(){for(const [key,value]of Object.entries(exports))this.setExport(key,value);},{context});
      await result.link(()=>{throw new Error('Unexpected stub dependency');});await result.evaluate();return result;
    }
    const engine=await module(api),sources=await module({loadReplayPriceArchive:async()=>archive}),chart=await module({drawAtlasPriceChart(){throw new Error('Unexpected visible-chart rendering in hidden-input fixture');}});
    const view=new vm.SourceTextModule(source,{context,identifier:sourceUrl.href,importModuleDynamically:specifier=>{
      if(specifier.startsWith('./forecast-replay-sources.js'))return sources;
      if(specifier.startsWith('./forecast-replay.js'))return engine;
      throw new Error('Unexpected view dependency '+specifier);
    }});
    await view.link(specifier=>{assert.ok(specifier.startsWith('./atlas-price-chart.js'));return chart;});await view.evaluate();
    const mounted=view.namespace.mountForecastReplay(host,{record:{symbol:'BTCUSD',asOf:timeline[0]},snapshot:{}});
    const flush=async()=>{for(let i=0;i<3;i++)await new Promise(setImmediate);};
    const click=selector=>panel.listeners.get('click')({target:{closest:value=>value===selector}});
    const tick=()=>{const entry=[...timers].find(([,value])=>value.delay===700);assert.ok(entry,'A live playback timer must exist');timers.delete(entry[0]);entry[1].callback();};
    await flush();
    return {state,panel,svg,node,timers,mounted,click,tick,flush};
  }
  const first=await harness(0);
  assert.equal(first.panel.dataset.state,'error');assert.equal(first.node('[data-replay-content]').hidden,true);
  assert.equal(first.state.createdObservers,0);assert.equal(first.timers.size,0);
  assert.doesNotThrow(()=>first.click('[data-replay-play]'));first.click('[data-replay-export]');assert.equal(first.state.exports,0);
  first.mounted.destroy();

  const running=await harness(2);
  assert.equal(running.panel.dataset.state,'ready');assert.equal(running.state.createdObservers,1);
  running.click('[data-replay-play]');running.tick();assert.equal(running.panel.dataset.cursor,'2026-01-02');
  running.tick();assert.equal(running.panel.dataset.state,'error');assert.equal(running.timers.size,0);
  assert.equal(running.state.disconnectedObservers,1);assert.equal(running.node('[data-replay-content]').hidden,true);
  assert.equal(running.node('[data-replay-error]').hidden,false);
  assert.ok(running.node('[data-replay-error]').innerHTML.includes('&lt;unsafe&gt;'));
  for(const key of ['cursor','outputHash','playback'])assert.equal(running.panel.dataset[key],undefined);
  for(const key of ['onpointermove','onpointerleave','onkeydown','onclick'])assert.equal(running.svg[key],null);
  running.click('[data-replay-export]');assert.equal(running.state.exports,0);
  assert.doesNotThrow(()=>running.click('[data-replay-next]'));

  running.state.failureAt=null;running.click('[data-replay-retry]');await running.flush();
  assert.equal(running.panel.dataset.state,'ready');assert.equal(running.node('[data-replay-error]').hidden,true);
  assert.equal(running.node('[data-replay-content]').hidden,false);assert.equal(running.panel.dataset.cursor,'2026-01-01');
  running.click('[data-replay-export]');assert.equal(running.state.exports,1);
  running.click('[data-replay-retry]');running.click('[data-replay-export]');assert.equal(running.state.exports,1);
  await running.flush();running.mounted.destroy();assert.equal(running.state.createdObservers,running.state.disconnectedObservers);
  return {status:'passed',checks:['initial-frame-failure','mid-playback-failure','retry','stale-export-during-loading'],
    sourceSha256:createHash('sha256').update(source).digest('hex'),surface:'Node VM with DOM, rendering and source-loader doubles; not native browser evidence'};
}
if(process.argv[1]===fileURLToPath(import.meta.url))console.log(JSON.stringify(await verifyReplayViewFailure()));
