import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import * as vm from 'node:vm';
import {createChartReplayController,CHART_REPLAY_SPEEDS} from '../dist/chart-replay-state.js';

const sourceUrl=new URL('../dist/chart-replay.js',import.meta.url);
const dateAt=offset=>new Date(Date.UTC(2024,0,1+offset)).toISOString().slice(0,10);
const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return {promise,resolve,reject};};
const flush=async()=>{for(let i=0;i<5;i++)await new Promise(setImmediate);};
const archive=(name,{missing=[],length=185}={})=>({observations:Array.from({length},(_,i)=>({date:dateAt(i),price:100+i})).filter((_,i)=>!missing.includes(i)),
  observedThrough:dateAt(length-1),observedAt:dateAt(length)+'T00:00:00Z',source:{provider:name,sourceHash:name}});

async function harness(source,{symbol='BTCUSD',loadArchive=async()=>archive('current'),loadRecord,stored=null,buildSession,getAtlasContext=null,loadBaseline}={}){
  const storageKey='atlas-chart-replay-v1:'+symbol;
  const controls=new Map(),saved=new Map(stored?[[storageKey,JSON.stringify(stored)]]:[]),timers=new Map(),frames=new Map();
  const builds=[],factories=[],draws=[],controllers=[],atlasContexts=[];let doc,timerId=0,rafId=0,restores=0;
  class Element{
    constructor(tag='div'){this.tag=tag;this.ownerDocument=doc;this.dataset={};this.attributes={};this.children=[];this.listeners=new Map();this.hidden=false;this.value='';this.inert=false;this.textContent='';this.style={setProperty(){},removeProperty(){}};this.classList={add(){},remove(){}};}
    setAttribute(key,value){this.attributes[key]=String(value);}getAttribute(key){return this.attributes[key]??null;}
    append(...nodes){this.children.push(...nodes);for(const node of nodes)node.parentElement=this;}
    insertBefore(node){this.append(node);}replaceChildren(...nodes){this.children=[];this.append(...nodes);}
    contains(node){return this===node||this.children.some(child=>child.contains(node));}
    querySelector(selector){
      const key=selector.match(/^\[data-cr="([^"]+)"\]$/)?.[1];
      if(key){if(key==='model'&&symbol!=='ETHUSD')return null;if(!controls.has(key)){
        const item=new Element(['date','scrub'].includes(key)?'input':['mode','model','horizon','record','speed','display'].includes(key)?'select':'button');
        item.value=({mode:'historical-reconstruction',model:'adaptive',horizon:'180',speed:'1',display:'candles',scrub:'0'})[key]??'';controls.set(key,item);
      }return controls.get(key);}
      if(selector==='[value="candles"]'){this.candleOption??=new Element('option');return this.candleOption;}
      return this.children.find(child=>selector==='[data-chart-replay-picker]'&&Object.hasOwn(child.attributes,'data-chart-replay-picker'))??null;
    }
    querySelectorAll(){return [];}
    closest(selector){return selector.includes(this.tag)&&['input','select','textarea'].includes(this.tag)?this:null;}
    addEventListener(type,callback){const list=this.listeners.get(type)??[];list.push(callback);this.listeners.set(type,list);}
    removeEventListener(type,callback){this.listeners.set(type,(this.listeners.get(type)??[]).filter(fn=>fn!==callback));}
    dispatchEvent(event){for(const callback of this.listeners.get(event.type)??[])callback(event);return true;}
    getBoundingClientRect(){return {left:0,top:0,width:800,height:400};}
    focus(){}remove(){}click(){this.onclick?.({target:this});}
  }
  doc=new Element('document');doc.documentElement=new Element('html');doc.createElement=tag=>new Element(tag);doc.createElementNS=(_,tag)=>new Element(tag);
  const win=new Element('window');doc.defaultView=win;win.localStorage={getItem:key=>saved.get(key)??null,setItem:(key,value)=>saved.set(key,value)};
  win.requestAnimationFrame=callback=>{frames.set(++rafId,callback);return rafId;};win.cancelAnimationFrame=id=>frames.delete(id);
  win.CustomEvent=class{constructor(type,{detail}={}){this.type=type;this.detail=detail;}};win.setTimeout=()=>0;
  const svg=new Element('svg'),plot=new Element('div'),toolbar=new Element('nav');plot.append(svg);
  function makeSession(options,factory){
    builds.push(options);factories.push(factory);
    const asOf=options.asOf??options.record?.asOf??options.baseline?.forecast.asOf;
    const session={asOf,timeline:Array.from({length:5},(_,i)=>new Date(Date.parse(asOf+'T00:00:00Z')+i*86400000).toISOString().slice(0,10)),
      identity:{outputHash:'fixed-output',pointLabel:'fixture'},mode:options.record?'recorded':'historical-reconstruction',
      observationProvenance:{source:options.source},forecast:[],inputPrices:[]};
    if(factory==='current'||factory==='project'){
      session.mode=factory==='current'?'current-chart-snapshot':'project-baseline';
      session.chartDataset=options.dataset??options.baseline.dataset;
      session.chartForecast=options.forecast??options.baseline.forecast;
      session.forecast=session.chartForecast.path;
      session.identity.forecastOriginDate=session.chartForecast.asOf;
    }
    return buildSession?buildSession(options,session):session;
  }
  const engine={createHistoricalReplaySession:async options=>makeSession(options,'historical'),createRecordedReplaySession:async options=>makeSession(options,'recorded'),
    createCurrentChartReplaySession:async options=>makeSession(options,'current'),createProjectReplaySession:async options=>makeSession(options,'project'),
    buildReplayChartData(session,{cursorDate}){const actual=[{date:cursorDate,price:123}];return {ohlcAvailable:true,observedRows:actual,observedCandles:[],frame:{actual,inputPrices:[],forecast:session.forecast,cursorDate,
      selected:{actual:123,predicted:124},metrics:{matchedCount:1,meanAbsolutePercentageError:.01,pendingTargetCount:0,missingTargetCount:0}}};}};
  const renderer=kind=>options=>{draws.push({...options,renderer:kind});return {axis:{top:0,bottom:400},x:()=>100,dateAt:()=>dateAt(180),destroy(){}};};
  const context=vm.createContext({Date,AbortController,URL,Blob,console,ResizeObserver:class{observe(){}disconnect(){}}});
  async function module(exports){const result=new vm.SyntheticModule(Object.keys(exports),function(){for(const [key,value]of Object.entries(exports))this.setExport(key,value);},{context});await result.link(()=>{throw new Error('Unexpected test-module import');});await result.evaluate();return result;}
  const state=await module({CHART_REPLAY_SPEEDS,createChartReplayController:options=>{
    const result=createChartReplayController({...options,setTimer:(callback,delay)=>{timers.set(++timerId,{callback,delay});return timerId;},clearTimer:id=>timers.delete(id)});controllers.push(result);return result;
  }});
  const imports={
    './forecast-replay.js?v=1.29.2':await module(engine),
    './chart-replay-renderer.js':await module({drawReplaySelection:renderer('selection'),drawChartReplay:renderer('replay')}),
    './chart-replay-sources.js':await module({loadChartReplayArchive:loadArchive,loadChartReplayRecord:loadRecord??(async()=>{throw new Error('Unexpected recorded load');})}),
    './project-replay-baseline.js':await module({loadProjectReplayBaseline:loadBaseline??(async()=>{throw new Error('Unexpected project baseline load');})}),
    './chart-replay-atlas.js':await module({createAtlasReplayContext:options=>{atlasContexts.push(options);return {...options,forecast:options.forecast.path};},drawAtlasChartReplay:renderer('atlas')}),
  };
  const view=new vm.SourceTextModule(source,{context,identifier:sourceUrl.href,importModuleDynamically:specifier=>{assert.ok(imports[specifier],specifier);return imports[specifier];}});
  await view.link(specifier=>{assert.equal(specifier,'./chart-replay-state.js');return state;});await view.evaluate();
  const mounted=view.namespace.mountChartReplay({svg,plot,toolbar,symbol,getAtlasContext,loadAtlasRenderer:()=>imports['./chart-replay-atlas.js'].namespace,restore:()=>{restores++;}});
  return {mounted,svg,plot,toolbar,doc,win,controls,builds,factories,draws,timers,controllers,atlasContexts,
    saved:()=>JSON.parse(saved.get(storageKey)??'null'),restores:()=>restores,
    status:()=>plot.children.find(node=>node.className==='chart-replay-hud')?.children[0]?.textContent??'',
    inspection:()=>plot.children.find(node=>node.className==='chart-replay-hud')?.children[1]?.textContent??'',
    async start(date=dateAt(180)){controls.get('date').value=date;controls.get('start').onclick();await flush();},
  };
}

export async function verifyChartReplayUi(){
  if(typeof vm.SourceTextModule!=='function')return JSON.parse(execFileSync(process.execPath,
    ['--experimental-vm-modules',fileURLToPath(import.meta.url),'--replay-ui-child'],{encoding:'utf8',timeout:30000,stdio:['ignore','pipe','pipe']}));
  const source=await readFile(sourceUrl,'utf8'),checks=[];
  {
    const old=deferred(),fresh=deferred();let calls=0;
    const h=await harness(source,{loadArchive:()=>++calls===1?old.promise:fresh.promise});
    const first=h.mounted.open();await flush();const second=h.mounted.open();await flush();
    fresh.resolve(archive('fresh'));await second;old.resolve(archive('stale'));await first;
    await h.start();assert.equal(h.builds.at(-1).source.provider,'fresh','revoked archive must not replace the selected source');
    assert.equal(h.controls.get('source').textContent.startsWith('fresh'),true);h.mounted.destroy();checks.push('late archive completion');
  }
  {
    const old=deferred(),fresh=deferred();let calls=0;
    const bundle=name=>({record:{id:name,asOf:dateAt(180)},snapshot:{},entries:[{id:name,asOf:dateAt(180),scenario:'base'}]});
    const h=await harness(source,{loadRecord:()=>++calls===1?old.promise:fresh.promise});
    h.controls.get('mode').value='recorded';const first=h.mounted.open();await flush();const second=h.mounted.open();await flush();
    fresh.resolve(bundle('fresh-record'));await second;old.resolve(bundle('old-record'));await first;
    await h.start();assert.equal(h.builds.at(-1).record.id,'fresh-record','revoked record must not replace the selected forecast');
    h.mounted.destroy();checks.push('late record completion');
  }
  {
    const waiting=deferred();let calls=0;const h=await harness(source,{loadArchive:()=>++calls===1?archive('initial'):waiting.promise});
    await h.mounted.open();await h.start();assert.equal(h.saved().horizon,180);
    h.controls.get('horizon').value='365';h.controls.get('horizon').onchange();await flush();
    assert.equal(h.saved().horizon,180,'changing a select must not relabel the previously fixed session');
    h.mounted.exit();waiting.resolve(archive('later'));await flush();assert.equal(h.mounted.isActive(),false);assert.equal(h.restores(),1);
    assert.equal(h.svg.dataset.chartReplayActive,undefined);h.mounted.destroy();checks.push('settings identity and exit during load');
  }
  {
    let calls=0;const h=await harness(source,{loadArchive:()=>++calls===1?archive('first',{missing:[182]}):archive('second')});
    await h.mounted.open();await h.start();h.controls.get('next').onclick();h.controls.get('next').onclick();
    assert.equal(h.svg.dataset.replayCursor,dateAt(183));const saved=h.saved();assert.equal(saved.cursorDate,dateAt(183));
    h.mounted.exit();await h.mounted.open({resume:saved});
    assert.equal(h.svg.dataset.replayCursor,dateAt(183),'filled archive gaps must not move a saved replay date');
    assert.equal(h.controllers[0].getState().status,'paused');h.mounted.destroy();checks.push('resume by calendar date after outcome revision');
  }
  {
    const h=await harness(source);await h.mounted.open();await h.start();let stopped=0;
    const event={type:'keydown',key:'ArrowRight',shiftKey:true,target:h.controls.get('mode'),preventDefault(){stopped++;},stopImmediatePropagation(){stopped++;}};
    h.doc.dispatchEvent(event);assert.equal(stopped,0,'native select keys must remain native');
    assert.equal(h.svg.dataset.replayCursor,dateAt(180));event.target=h.svg;h.doc.dispatchEvent(event);
    assert.equal(h.svg.dataset.replayCursor,dateAt(181));assert.equal(stopped,2);
    h.controls.get('play').onclick();assert.equal(h.timers.size,1);h.doc.hidden=true;h.doc.dispatchEvent({type:'visibilitychange'});
    assert.equal(h.timers.size,0);assert.equal(h.controllers[0].getState().status,'paused');h.mounted.destroy();checks.push('keyboard controls and visibility pause');
  }
  {
    const current=archive('ETH preserved observations',{length:370});let archiveLoads=0,recordLoads=0;
    const unsupported='ETH adaptive model needs at least 30 causally classified returns in each state';
    const h=await harness(source,{symbol:'ETHUSD',
      loadArchive:async()=>{archiveLoads++;return current;},
      loadRecord:async()=>{recordLoads++;throw new Error('Historical replay must not substitute a later issued record');},
      buildSession:(options,session)=>{if(options.modelKey==='adaptive')throw new Error(unsupported);return session;},
    });
    await h.mounted.open();
    assert.equal(h.controls.get('date').min,dateAt(365),'ETH needs its own 366-observation minimum');
    assert.equal(h.controls.get('date').value,dateAt(365));
    assert.equal(h.controls.get('model').value,'adaptive');
    assert.equal(h.controls.get('pooled-retry').hidden,true);
    h.controls.get('horizon').value='90';
    const chosen=dateAt(367);await h.start(chosen);
    assert.equal(h.controllers[0].getState().status,'error');
    assert.equal(h.controllers[0].getState().error,unsupported,'the engine error contract remains intact');
    assert.equal(h.controllers[0].getState().session,null);
    assert.equal(h.mounted.isActive(),true);assert.equal(h.controls.get('date').value,chosen);
    assert.equal(h.controls.get('model').value,'adaptive');assert.equal(h.controls.get('mode').value,'historical-reconstruction');
    assert.match(h.status(),/선택 기준일.*상승.*하락.*30개/);
    assert.doesNotMatch(h.status(),/causally classified|needs at least/);
    assert.equal(h.controls.get('pooled-retry').hidden,false);
    assert.equal(h.controls.get('play').disabled,true);
    assert.equal(h.saved(),null);assert.equal(h.draws.filter(draw=>draw.session).length,0);
    await flush();assert.equal(h.builds.length,1,'an unsupported origin cannot silently change the date or model');
    h.controls.get('pooled-retry').click();await flush();
    assert.equal(h.builds.length,2);assert.deepEqual(h.builds.map(options=>options.modelKey),['adaptive','pooled']);
    assert.deepEqual(h.builds.map(options=>options.asOf),[chosen,chosen]);
    assert.deepEqual(h.builds.map(options=>options.horizonDays),[90,90]);
    assert.equal(h.builds[0].observations,h.builds[1].observations);assert.equal(h.builds[0].source,h.builds[1].source);
    assert.equal(archiveLoads,1,'the explicit comparison keeps the verified source already selected');assert.equal(recordLoads,0);
    assert.equal(h.controllers[0].getState().status,'paused');
    assert.equal(h.controls.get('model').value,'pooled');assert.equal(h.controls.get('date').value,chosen);
    assert.equal(h.svg.dataset.replayOrigin,chosen);assert.equal(h.svg.dataset.replayCursor,chosen);
    assert.equal(h.controls.get('pooled-retry').hidden,true);assert.equal(h.saved().model,'pooled');assert.equal(h.saved().origin,chosen);
    h.mounted.destroy();checks.push('unsupported ETH adaptive origin requires explicit pooled comparison at the same date');
  }
  {
    const dataset={prices:archive('current').observations.map(row=>[row.date,row.price])};
    const forecast={asOf:dateAt(184),referenceDate:dateAt(181),path:[{date:dateAt(184),price:284,lower:284,upper:284},{date:dateAt(185),price:300,lower:250,upper:350}]};
    const captured={dataset,forecast,start:dateAt(90),end:dateAt(700),chartType:'line',presentation:{scale:'log',unit:'usd'}};
    const baseline={dataset,forecast:{asOf:dateAt(180),referenceDate:dateAt(181),path:[{date:dateAt(180),price:280},{date:dateAt(181),price:290}]}};
    const h=await harness(source,{getAtlasContext:()=>captured,loadBaseline:async()=>baseline});
    await h.mounted.open();
    assert.equal(h.controls.get('mode').value,'atlas-chart');assert.equal(h.controls.get('display').value,'candles');
    assert.equal(h.controllers[0].getState().status,'paused');assert.equal(h.controls.get('date').value,dateAt(181));
    assert.deepEqual(h.factories,['current'],'one-click entry must capture the currently displayed forecast without reconstructing an earlier model');
    assert.equal(h.builds[0].dataset,dataset);assert.equal(h.builds[0].forecast,forecast);
    assert.equal(h.atlasContexts[0].originDate,dateAt(180));assert.equal(h.atlasContexts[0].forecast.asOf,dateAt(184));
    assert.equal(h.draws.at(-1).renderer,'atlas');assert.equal(h.draws.at(-1).start,captured.start);assert.equal(h.draws.at(-1).end,captured.end);
    const path=JSON.stringify(h.draws.at(-1).data.frame.forecast);
    h.controls.get('next').onclick();assert.equal(h.svg.dataset.replayCursor,dateAt(181));
    await h.start(dateAt(183));assert.equal(h.svg.dataset.replayCursor,dateAt(182));
    h.controls.get('play').onclick();assert.equal(h.timers.size,1);const timer=[...h.timers][0];h.timers.delete(timer[0]);timer[1].callback();h.controls.get('play').onclick();
    assert.equal(h.svg.dataset.replayCursor,dateAt(183));assert.deepEqual(h.factories,['current','current']);
    assert.equal(JSON.stringify(h.draws.at(-1).data.frame.forecast),path,'start-date changes and playback keep exactly the captured orange values');
    h.draws.at(-1).onInspect({date:dateAt(185),actual:null,price:300,predicted:300});
    assert.match(h.inspection(),/실제 — · 고정 예측 \$300/,'a forecast-only hover cannot label the prediction as an actual price');
    h.draws.at(-1).onInspect({date:dateAt(181),actual:84176.08,predicted:82967.49,source:'Coin Metrics',candleSource:'Bitstamp',candle:{close:84023.24}});
    assert.match(h.inspection(),/평가 종가 \(Coin Metrics\) \$84,176\.08 · 캔들 종가 \(Bitstamp\) \$84,023\.24/,'a separately sourced candle must not relabel the comparison close');
    const saved=h.saved();h.mounted.exit();await h.mounted.open({resume:saved});
    assert.equal(h.svg.dataset.replayCursor,dateAt(183));assert.equal(h.controllers[0].getState().status,'paused');
    assert.ok(h.factories.every(factory=>factory==='current'));assert.equal(JSON.stringify(h.draws.at(-1).data.frame.forecast),path);
    h.mounted.destroy();checks.push('current-chart entry, changed start date, playback and resume retain the original forecast and distinguish unknown actuals');
  }
  {
    const dataset={prices:archive('current').observations.map(row=>[row.date,row.price])};
    const forecast={asOf:dateAt(184),path:[{date:dateAt(184),price:284},{date:dateAt(185),price:300}]};
    const captured={dataset,forecast,start:dateAt(90),end:dateAt(700),chartType:'line',presentation:{scale:'log'}};
    const baseline={dataset,forecast:{asOf:dateAt(180),referenceDate:dateAt(181),path:[{date:dateAt(180),price:280},{date:dateAt(181),price:290}]}};
    const waiting=deferred();let baselineCalls=0;
    const h=await harness(source,{getAtlasContext:()=>captured,loadBaseline:()=>++baselineCalls===2?waiting.promise:baseline});
    await h.mounted.open();h.controls.get('next').onclick();
    const before=h.draws.length;
    h.controls.get('mode').value='project-baseline';h.controls.get('mode').onchange();await flush();
    assert.equal(h.controllers[0].getState().status,'selecting');
    assert.equal(h.draws.length,before,'pending mode changes must retain the last cutoff drawing instead of painting every row from the prior archive');
    assert.equal(h.controls.get('export').disabled,true);
    waiting.resolve(baseline);await flush();assert.equal(h.controllers[0].getState().status,'paused');
    assert.equal(h.draws.at(-1).renderer,'atlas');assert.deepEqual(h.factories,['current','project']);
    h.controls.get('mode').value='historical-reconstruction';h.controls.get('mode').onchange();await flush();
    assert.equal(h.draws.at(-1).renderer,'selection','only the explicit historical mode may present its newly loaded selection archive');
    await h.start();assert.equal(h.factories.at(-1),'historical');
    h.controls.get('mode').value='atlas-chart';h.controls.get('mode').onchange();await flush();
    assert.equal(h.factories.at(-1),'current');assert.equal(h.draws.at(-1).renderer,'atlas');
    assert.equal(h.builds.at(-1).forecast,forecast);assert.deepEqual(h.factories,['current','project','historical','current']);
    h.mounted.destroy();checks.push('asynchronous mode changes keep the prior cutoff until the newly selected source is ready');
  }
  {
    const dataset={prices:archive('current').observations.map(row=>[row.date,row.price])};
    const baseline={dataset,forecast:{asOf:dateAt(180),referenceDate:dateAt(181),path:[{date:dateAt(180),price:280},{date:dateAt(181),price:290}]}};
    const captured={dataset,forecast:baseline.forecast,start:dateAt(90),end:dateAt(700),chartType:'line',presentation:{scale:'log'}};
    const waiting=deferred();let candleLoads=0;
    const h=await harness(source,{getAtlasContext:()=>captured,loadBaseline:async()=>baseline,
      loadArchive:async(_symbol,{mode})=>{if(mode==='historical-reconstruction'){candleLoads++;return waiting.promise;}return archive('Coin Metrics');}});
    h.controls.get('mode').value='project-baseline';await h.mounted.open();
    assert.equal(h.controls.get('display').value,'line');assert.equal(h.controllers[0].getState().status,'paused');
    const original=h.controllers[0].getState().session;
    h.controls.get('display').value='candles';const pending=h.controls.get('display').onchange();await flush();assert.equal(candleLoads,1);
    h.controls.get('display').value='line';await h.controls.get('display').onchange();
    waiting.reject(new Error('Obsolete OHLC request failed'));await pending;await flush();
    assert.equal(h.controllers[0].getState().status,'paused');assert.equal(h.controllers[0].getState().session,original);
    assert.equal(h.controls.get('display').value,'line');assert.equal(h.controls.get('export').disabled,false);
    h.controls.get('next').onclick();assert.equal(h.svg.dataset.replayCursor,dateAt(181));
    assert.equal(h.draws.at(-1).chartType,'line');assert.deepEqual(h.factories,['project']);
    h.mounted.destroy();checks.push('an obsolete candle-request failure cannot invalidate the resumed line display');
  }
  return {status:'pass',checks,sourceSha256:createHash('sha256').update(source).digest('hex'),
    scope:'Actual coordinator and lifecycle controller with deterministic DOM, loader, forecast and renderer doubles; not native browser verification'};
}

if(process.argv.includes('--replay-ui-child'))console.log(JSON.stringify(await verifyChartReplayUi()));
else test('main replay coordinator guards source identity, exact resume, input boundaries and explicit model comparison',async t=>{
  const result=await verifyChartReplayUi();assert.equal(result.status,'pass');assert.equal(result.checks.length,9);
  for(const check of result.checks)t.diagnostic(check);
});
