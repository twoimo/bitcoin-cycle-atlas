import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import * as vm from 'node:vm';
import * as snapshotHelpers from '../dist/chart-replay-snapshot.js';
import {createChartReplayController,CHART_REPLAY_SPEEDS} from '../dist/chart-replay-state.js';

const FIXED_OUTPUT='c'.repeat(64);
const sourceUrl=new URL('../dist/chart-replay.js',import.meta.url);
const {version:releaseVersion}=JSON.parse(await readFile(new URL('../package.json',import.meta.url),'utf8'));
const dateAt=offset=>new Date(Date.UTC(2024,0,1+offset)).toISOString().slice(0,10);
const dateAfter=(date,days)=>new Date(Date.parse(date+'T00:00:00Z')+days*86400000).toISOString().slice(0,10);
const evaluatedAt='2026-10-30T12:00:00.000Z';
const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return {promise,resolve,reject};};
const snapshotOperations=new Set();
const trackSnapshot=operation=>(...args)=>{
  const pending=operation(...args);snapshotOperations.add(pending);
  void pending.finally(()=>snapshotOperations.delete(pending)).catch(()=>{});return pending;
};
// Drain real SHA-256 work, not a fixed wall-clock sleep or an assumed tick count.
const flush=async()=>{for(let i=0;i<5;i++){await new Promise(setImmediate);await Promise.allSettled([...snapshotOperations]);}};
const archive=(name,{missing=[],length=185}={})=>({observations:Array.from({length},(_,i)=>({date:dateAt(i),price:100+i,
  open:99+i,high:102+i,low:98+i,close:100+i,volume:10+i})).filter((_,i)=>!missing.includes(i)),
  observedThrough:dateAt(length-1),observedAt:dateAt(length)+'T00:00:00Z',source:{provider:name,sourceHash:name,ohlcAvailable:true}});

async function harness(source,{symbol='BTCUSD',loadArchive=async()=>archive('current'),loadRecord,stored=null,storedText=null,buildSession,
  getAtlasContext=null,getChartState=null,resolveAtlasRange=null,loadBaseline,random=()=>.5,storageFailure=false,rendererAxis=null,rendererBarDateAt=null}={}){
  const storageKey='atlas-chart-replay-v1:'+symbol;
  const controls=new Map(),saved=new Map(storedText!==null?[[storageKey,storedText]]:stored?[[storageKey,JSON.stringify(stored)]]:[]),timers=new Map(),frames=new Map();
  const builds=[],factories=[],draws=[],controllers=[],atlasContexts=[],chartCalls=[],displayCalls=[],frameEvents=[],writes=[],capabilityCalls=[];
  let doc,timerId=0,rafId=0,restores=0,clock=0,pointerDate=dateAt(180);
  class Element{
    constructor(tag='div'){this.tag=tag;this.ownerDocument=doc;this.dataset={};this.attributes={};this.children=[];this.listeners=new Map();this.hidden=false;this.value='';this.inert=false;this.textContent='';this.style={setProperty(){},removeProperty(){}};this.classList={add(){},remove(){}};this.disabled=false;this.checked=false;}
    setAttribute(key,value){this.attributes[key]=String(value);}getAttribute(key){return this.attributes[key]??null;}
    append(...nodes){this.children.push(...nodes);for(const node of nodes)node.parentElement=this;}
    insertBefore(node){this.append(node);}replaceChildren(...nodes){this.children=[];this.append(...nodes);}
    contains(node){return this===node||this.children.some(child=>child.contains(node));}
    querySelector(selector){
      const key=selector.match(/^\[data-cr="([^"]+)"\]$/)?.[1];
      if(key){if(key==='model'&&symbol!=='ETHUSD')return null;if(!controls.has(key)){
        const item=new Element(['date','scrub','exit-save'].includes(key)?'input':['mode','model','horizon','record','speed','display','update-interval'].includes(key)?'select':'button');
        item.value=({mode:'historical-reconstruction',model:'adaptive',horizon:'180',speed:'1',display:'candles',scrub:'0','update-interval':'daily'})[key]??'';
        item.hidden=['pooled-retry','pick-cancel','record','detail-panel','select-panel','date-view','forecast-view','menu-back','entry-dialog','exit-dialog'].includes(key);
        item.disabled=key==='update-interval';item.checked=key==='exit-save';controls.set(key,item);
      }return controls.get(key);}
      if(selector==='[value="candles"]'){this.candleOption??=new Element('option');return this.candleOption;}
      const attribute=selector.match(/^\[([^=\]]+)\]$/)?.[1];
      return this.children.find(child=>attribute&&Object.hasOwn(child.attributes,attribute))??this.children.map(child=>child.querySelector(selector)).find(Boolean)??null;
    }
    querySelectorAll(){return [];}
    closest(selector){return selector.includes(this.tag)&&['input','select','textarea'].includes(this.tag)?this:null;}
    addEventListener(type,callback){const list=this.listeners.get(type)??[];list.push(callback);this.listeners.set(type,list);}
    removeEventListener(type,callback){this.listeners.set(type,(this.listeners.get(type)??[]).filter(fn=>fn!==callback));}
    dispatchEvent(event){for(const callback of this.listeners.get(event.type)??[]){callback(event);if(event.immediatePropagationStopped)break;}return true;}
    getBoundingClientRect(){return {left:0,top:0,width:800,height:400};}
    focus(){doc.activeElement=this;}remove(){if(this.parentElement)this.parentElement.children=this.parentElement.children.filter(child=>child!==this);this.parentElement=null;}
    click(){if(!this.disabled)return this.onclick?.({target:this});}
  }
  doc=new Element('document');doc.documentElement=new Element('html');doc.createElement=tag=>new Element(tag);doc.createElementNS=(_,tag)=>new Element(tag);
  const win=new Element('window');doc.defaultView=win;win.localStorage={getItem:key=>saved.get(key)??null,setItem:(key,value)=>{
    if(storageFailure)throw new Error('Storage quota denied');writes.push({key,value});saved.set(key,value);
  }};
  win.requestAnimationFrame=callback=>{frames.set(++rafId,callback);return rafId;};win.cancelAnimationFrame=id=>frames.delete(id);
  win.CustomEvent=class{constructor(type,{detail}={}){this.type=type;this.detail=detail;}};win.setTimeout=()=>0;
  const svg=new Element('svg'),plot=new Element('div'),toolbar=new Element('nav');plot.append(svg);
  const frequencyControl=new Element('fieldset'),typeControl=new Element('fieldset'),liveControl=new Element('button');
  frequencyControl.id='workbench-frequency';typeControl.id='workbench-chart-type';liveControl.id='unowned-live-setting';toolbar.append(frequencyControl,typeControl,liveControl);
  function makeSession(options,factory){
    builds.push(options);factories.push(factory);
    const asOf=options.asOf??options.record?.asOf??options.baseline?.forecast.asOf;
    const session={asOf,evaluatedAt,timeline:Array.from({length:5},(_,i)=>dateAfter(asOf,i)),fixtureObservations:options.observations,
      identity:{outputHash:FIXED_OUTPUT,pointLabel:'fixture'},mode:options.record?'recorded':'historical-reconstruction',
      observationProvenance:{source:options.source},forecast:[],inputPrices:[]};
    if(factory==='current'||factory==='project'){
      if(factory==='current')assert.equal(options.playbackStartDate,dateAfter(asOf,1),'the coordinator must preserve the engine origin/playback contract');
      session.mode=factory==='current'?'current-chart-snapshot':'project-baseline';
      session.chartDataset=options.dataset??options.baseline.dataset;
      session.chartForecast=options.forecast??options.baseline.forecast;
      session.forecast=session.chartForecast.path;
      session.identity.forecastOriginDate=session.chartForecast.asOf;
      if(factory==='current')Object.assign(session.identity,{asOf,currentChartSnapshot:true,issuedAt:null,createdAt:options.createdAt??evaluatedAt});
    }
    return buildSession?buildSession(options,session):session;
  }
  const candles=rows=>rows.filter(row=>['open','high','low','close'].every(key=>Number.isFinite(row[key])))
    .map(row=>({...row,time:Date.parse(row.date+'T00:00:00Z')/1000,startDate:row.date,endDate:row.date,complete:true}));
  const engine={createHistoricalReplaySession:async options=>makeSession(options,'historical'),createRecordedReplaySession:async options=>makeSession(options,'recorded'),
    createCurrentChartReplaySession:async options=>makeSession(options,'current'),createProjectReplaySession:async options=>makeSession(options,'project'),
    getReplayIntervalCapabilities(options){capabilityCalls.push(options);const dates=options.observations.filter(row=>['open','high','low','close'].every(key=>Number.isFinite(row[key]))).map(row=>row.date),firstWeekly=dates.find(date=>new Date(date+'T00:00:00Z').getUTCDay()===1)??null;
      return {availableDates:dates,intervals:{daily:{supported:dates.length>0,firstReplayDate:dates[0]},weekly:{supported:firstWeekly!==null,firstReplayDate:firstWeekly}}};},
    buildReplayObservedCandles(options){displayCalls.push(options);const rows=options.observations.filter(row=>row.date<=options.cursorDate);
      return {candles:candles(rows),metadata:{frequency:options.frequency,ohlcAvailable:rows.length>0,formingWeekCount:options.frequency==='weekly'?1:0}};},
    buildReplayChartData(session,options){chartCalls.push({session,...options});const {cursorDate,frequency}=options;
      const rows=session.fixtureObservations.filter(row=>row.date<=cursorDate),actual=rows.filter(row=>row.date>session.asOf);
      return {frequency,ohlcAvailable:candles(rows).length>0,observedRows:rows.map(({date,price})=>({date,price})),observedCandles:candles(rows),frame:{actual,inputPrices:[],forecast:session.forecast,cursorDate,
        evaluationAt:dateAfter(cursorDate,1)+'T00:00:00.000Z',selected:{actual:actual.at(-1)?.price??null,predicted:session.forecast.find(row=>row.date===cursorDate)?.price??null},
        metrics:{matchedCount:1,meanAbsolutePercentageError:.01,pendingTargetCount:0,missingTargetCount:0}}};}};
  const axis=rendererAxis??{top:0,bottom:400,left:0,right:800};
  const renderer=kind=>options=>{draws.push({...options,renderer:kind});return {axis,
    x:date=>axis.left+(Date.parse(date)-Date.parse(options.start))/Math.max(1,Date.parse(options.end)-Date.parse(options.start))*(axis.right-axis.left),
    dateAt:()=>pointerDate,...(rendererBarDateAt?{barDateAt:()=>rendererBarDateAt(pointerDate)}:{}),getPriceScale:()=>axis,destroy(){}};};
  const math=Object.create(Math);math.random=random;
  const context=vm.createContext({Date,Math:math,AbortController,URL,Blob,console,ResizeObserver:class{observe(){}disconnect(){}}});
  async function module(exports){const result=new vm.SyntheticModule(Object.keys(exports),function(){for(const [key,value]of Object.entries(exports))this.setExport(key,value);},{context});await result.link(()=>{throw new Error('Unexpected test-module import');});await result.evaluate();return result;}
  const state=await module({CHART_REPLAY_SPEEDS,createChartReplayController:options=>{
    const result=createChartReplayController({...options,now:()=>clock,setTimer:(callback,delay)=>{timers.set(++timerId,{callback,delay,due:clock+delay});return timerId;},clearTimer:id=>timers.delete(id)});controllers.push(result);return result;
  }});
  const snapshotModule=await module({...snapshotHelpers,sealReplaySnapshot:trackSnapshot(snapshotHelpers.sealReplaySnapshot),restoreReplaySnapshot:trackSnapshot(snapshotHelpers.restoreReplaySnapshot)});
  const imports={
    ['./forecast-replay.js?v='+releaseVersion]:await module(engine),
    './chart-replay-renderer.js':await module({drawReplaySelection:renderer('selection'),drawChartReplay:renderer('replay')}),
    './chart-replay-sources.js':await module({loadChartReplayArchive:loadArchive,loadChartReplayRecord:loadRecord??(async()=>{throw new Error('Unexpected recorded load');})}),
    './project-replay-baseline.js':await module({loadProjectReplayBaseline:loadBaseline??(async()=>{throw new Error('Unexpected project baseline load');})}),
    './chart-replay-atlas.js':await module({createAtlasReplayContext:options=>{atlasContexts.push(options);return {...options,forecast:options.forecast.path,forecastOrigin:options.forecast.asOf};},drawAtlasChartReplay:renderer('atlas')}),
  };
  const view=new vm.SourceTextModule(source,{context,identifier:sourceUrl.href,importModuleDynamically:specifier=>{assert.ok(imports[specifier],specifier);return imports[specifier];}});
  await view.link(specifier=>{
    if(specifier==='./chart-replay-snapshot.js')return snapshotModule;
    assert.equal(specifier,'./chart-replay-state.js?v='+releaseVersion);return state;
  });await view.evaluate();
  const mounted=view.namespace.mountChartReplay({svg,plot,toolbar,symbol,getAtlasContext,getChartState,resolveAtlasRange,
    getChartRenderer:()=>({getPriceScale:()=>axis}),onAtlasFrame:detail=>frameEvents.push(detail),
    loadAtlasRenderer:()=>imports['./chart-replay-atlas.js'].namespace,restore:()=>{restores++;}});
  const trigger=toolbar.children.find(node=>node.id==='workbench-replay');
  const panel=plot.children.find(node=>node.className==='chart-replay-controls');
  for(const match of panel.innerHTML.matchAll(/data-cr="([^"]+)"/g))panel.querySelector('[data-cr="'+match[1]+'"]');
  return {mounted,svg,plot,toolbar,doc,win,controls,builds,factories,draws,timers,controllers,atlasContexts,chartCalls,displayCalls,frameEvents,writes,capabilityCalls,
    trigger,frequencyControl,typeControl,liveControl,axis,
    saved:()=>JSON.parse(saved.get(storageKey)??'null'),restores:()=>restores,
    savedText:()=>saved.get(storageKey)??null,
    notice:()=>plot.children.find(node=>node.className==='chart-replay-notice'),
    status:()=>plot.children.find(node=>node.className==='chart-replay-hud')?.children[0]?.textContent??'',
    inspection:()=>plot.children.find(node=>node.className==='chart-replay-hud')?.children[1]?.textContent??'',
    tick(){const item=[...timers][0];if(!item)return;timers.delete(item[0]);clock=Math.max(clock,item[1].due);item[1].callback();},
    pointer(type,date=pointerDate){pointerDate=date;const event={type,target:svg,button:0,pointerId:1,clientX:100,clientY:100,preventDefault(){},stopImmediatePropagation(){}};plot.dispatchEvent(event);},
    repaint(){for(const [id,callback]of [...frames]){frames.delete(id);callback();}},
    async start(date=dateAt(180)){controls.get('date').value=date;controls.get('start').onclick();await flush();},
  };
}

function atlasFixture({frequency='daily',chartType='line',missing=[]}={}){
  const observed=archive('Bitstamp fixture',{missing}),dataset={prices:observed.observations.map(row=>[row.date,row.price])};
  const forecast={asOf:dateAt(184),referenceDate:dateAt(181),path:[
    {date:dateAt(184),price:284,lower:284,upper:284},{date:dateAt(185),price:300,lower:250,upper:350}]};
  const captured={dataset,forecast,start:dateAt(90),end:dateAt(700),chartType,frequency,window:'focus',presentation:{scale:'log',unit:'usd',band:true}};
  const baseline={dataset,forecast:{asOf:dateAt(180),referenceDate:dateAt(181),path:[{date:dateAt(180),price:280},{date:dateAt(181),price:290}]}};
  return {observed,dataset,forecast,captured,baseline,options:{getAtlasContext:()=>captured,loadArchive:async()=>observed,loadBaseline:async()=>baseline}};
}
function savedFixture(extra={}){
  return {version:1,symbol:'BTCUSD',mode:'atlas-chart',horizon:180,model:null,recordId:null,
    origin:dateAt(180),startDate:dateAt(181),cursorIndex:2,cursorDate:dateAt(182),sourceHash:'previous-source',outputHash:FIXED_OUTPUT,
    speed:.5,frequency:'weekly',chartType:'candles',window:'near',customRange:true,range:{start:dateAt(80),end:dateAt(400)},...extra};
}
const keyEvent=(h,key,extra={})=>{const event={type:'keydown',key,target:h.svg,preventDefault(){this.prevented=true;},stopImmediatePropagation(){this.stopped=true;this.immediatePropagationStopped=true;},...extra};h.doc.dispatchEvent(event);return event;};

const interactionCases=[
  {name:'Continue restores the exact saved yellow path after the live model changes, without backdated scoring',async run(source){
    const fixture=atlasFixture({frequency:'weekly'});
    const identify=(options,session)=>{if(session.identity.currentChartSnapshot)session.identity.outputHash=createHash('sha256').update(JSON.stringify(session.chartForecast.path)).digest('hex');return session;};
    const first=await harness(source,{...fixture.options,buildSession:identify});await first.mounted.open();
    first.controls.get('next').click();first.controls.get('next').click();
    const original=first.controllers[0].getState().session,path=JSON.stringify(original.forecast),origin=original.asOf;
    first.mounted.exit({saveSession:true});const saved=first.saved(),bytes=first.savedText();
    assert.ok(saved.forecastSnapshot,'explicit save must keep the entire curve, not only an output hash');
    assert.equal(saved.forecastSnapshot.meaning,'local-visual-comparison-not-issued-forecast');
    assert.equal(saved.forecastSnapshot.publicationTimeProven,false);
    assert.equal(JSON.stringify(saved.forecastSnapshot.view.forecast.path),path);first.mounted.destroy();
    fixture.forecast.path[1].price=310;fixture.forecast.path[1].upper=360;fixture.captured.presentation.band=false;
    const resumed=await harness(source,{...fixture.options,storedText:bytes,buildSession:identify});
    resumed.trigger.click();resumed.controls.get('entry-continue').click();await flush();
    const session=resumed.controllers[0].getState().session;assert.ok(session,resumed.status());
    assert.equal(resumed.controllers[0].getState().status,'paused');assert.equal(resumed.svg.dataset.replayCursor,saved.cursorDate);
    assert.equal(session.asOf,origin);assert.equal(session.identity.issuedAt,null);
    assert.equal(session.identity.outputHash,saved.outputHash);assert.equal(JSON.stringify(session.forecast),path);
    assert.equal(session.atlasContext.presentation.band,true);assert.equal(session.replaySnapshot.digest,saved.forecastSnapshot.digest);
    assert.equal(session.identity.createdAt,saved.forecastSnapshot.capturedAt);assert.equal(resumed.writes.length,0);assert.equal(resumed.savedText(),bytes);
    resumed.mounted.handleChartCommand({action:'frequency',value:'daily'});resumed.controls.get('next').click();
    assert.equal(JSON.stringify(resumed.draws.at(-1).data.frame.forecast),path);assert.equal(session.replaySnapshot.digest,saved.forecastSnapshot.digest);
    await resumed.start(dateAt(183));
    assert.equal(JSON.stringify(resumed.controllers[0].getState().session.forecast),path);
    assert.equal(resumed.controllers[0].getState().session.identity.createdAt,saved.forecastSnapshot.capturedAt);
    assert.equal(resumed.savedText(),bytes);assert.equal(resumed.writes.length,0);resumed.mounted.destroy();
  }},
  {name:'a live mutation during archive loading cannot change the captured forecast or band',async run(source){
    const fixture=atlasFixture(),waiting=deferred(),path=JSON.stringify(fixture.forecast.path);
    const h=await harness(source,{...fixture.options,loadArchive:()=>waiting.promise});
    const opening=h.mounted.open();await flush();fixture.forecast.path[1].price=333;fixture.captured.presentation.band=false;
    waiting.resolve(fixture.observed);await opening;
    assert.equal(h.controllers[0].getState().status,'paused');
    assert.equal(JSON.stringify(h.controllers[0].getState().session.forecast),path);
    assert.equal(h.controllers[0].getState().session.atlasContext.presentation.band,true);
    assert.equal(h.writes.length,0);h.mounted.destroy();
  }},
  {name:'a changed saved snapshot fails closed without replacing the stored bytes or curve with the live model',async run(source){
    const fixture=atlasFixture(),first=await harness(source,fixture.options);await first.mounted.open();first.mounted.exit({saveSession:true});
    const saved=first.saved();saved.forecastSnapshot.view.forecast.path[1].price+=1;const raw=JSON.stringify(saved);first.mounted.destroy();
    const h=await harness(source,{...fixture.options,storedText:raw});h.trigger.click();h.controls.get('entry-continue').click();await flush();
    assert.equal(h.controllers[0].getState().status,'error');assert.equal(h.controllers[0].getState().session,null);
    assert.match(h.status(),/값·범위·표식이 변경/);assert.equal(h.builds.length,0);
    for(const name of ['play','next','live'])assert.equal(h.controls.get(name).disabled,true);
    assert.equal(h.writes.length,0);assert.equal(h.savedText(),raw);h.mounted.destroy();
  }},
  {name:'saved snapshots resume even when no newest live forecast is ready',async run(source){
    const fixture=atlasFixture({frequency:'weekly'}),first=await harness(source,fixture.options);await first.mounted.open();
    first.controls.get('next').click();first.mounted.exit({saveSession:true});const saved=first.saved(),raw=first.savedText();first.mounted.destroy();
    const h=await harness(source,{...fixture.options,getAtlasContext:()=>null,storedText:raw});
    h.trigger.click();h.controls.get('entry-continue').click();await flush();
    assert.equal(h.controllers[0].getState().status,'paused');assert.equal(h.svg.dataset.replayCursor,saved.cursorDate);
    assert.equal(h.svg.dataset.replayFrequency,'weekly');assert.equal(h.controllers[0].getState().session.replaySnapshot.digest,saved.forecastSnapshot.digest);
    assert.equal(h.writes.length,0);h.mounted.destroy();
  }},
  {name:'invalid live capture is caught before requests and cannot wipe a previous saved session',async run(source){
    const fixture=atlasFixture(),raw=JSON.stringify(savedFixture()),h=await harness(source,{...fixture.options,storedText:raw,getChartState:()=>({frequency:'daily'}),getAtlasContext:()=>({forecast:{asOf:'invalid'}})});
    await h.mounted.open();assert.equal(h.controllers[0].getState().status,'error');assert.equal(h.builds.length,0);
    assert.match(h.status(),/차트 구성이 올바르지/);assert.equal(h.savedText(),raw);assert.equal(h.writes.length,0);h.mounted.destroy();
  }},
  {name:'first weekly replay entry waits for an explicit start while keeping the project default date',async run(source){
    const fixture=atlasFixture({frequency:'weekly'}),h=await harness(source,fixture.options);
    h.trigger.click();await flush();
    assert.equal(h.controls.get('entry-dialog').hidden,true);assert.equal(h.controllers[0].getState().status,'selecting');
    assert.equal(h.controllers[0].getState().session,null);assert.equal(h.draws.at(-1).selectionPreview,true);
    assert.equal(h.svg.dataset.replayCursor,undefined);assert.equal(h.svg.dataset.replayOrigin,undefined);
    assert.equal(h.controls.get('date').value,fixture.baseline.forecast.referenceDate,'the project date remains an available default, not an implicit commitment');
    for(const name of ['play','next','live'])assert.equal(h.controls.get(name).disabled,true,name+' waits for confirmation on first entry');
    h.controls.get('select-menu').click();h.controls.get('select-date').click();
    assert.equal(h.controls.get('date').value,fixture.baseline.forecast.referenceDate);assert.equal(h.controllers[0].getState().session,null);
    h.controls.get('start').click();await flush();
    assert.equal(h.svg.dataset.replayStartDate,fixture.baseline.forecast.referenceDate);assert.equal(h.svg.dataset.replayCursor,dateAt(180));
    assert.equal(h.svg.dataset.replayFrequency,'weekly');assert.equal(h.controls.get('live').disabled,false);
    assert.equal(h.saved(),null);assert.equal(h.writes.length,0);h.mounted.destroy();
  }},
  {name:'saved replay entry requires Continue or Start new and restores the original origin separately from its selected date',async run(source){
    const fixture=atlasFixture(),saved=savedFixture({startDate:dateAt(183),cursorIndex:3,cursorDate:dateAt(183)}),raw=JSON.stringify(saved,null,2)+'\n';
    let loads=0;const h=await harness(source,{...fixture.options,storedText:raw,loadArchive:async()=>{loads++;return fixture.observed;}});
    h.trigger.click();await flush();assert.equal(h.controls.get('entry-dialog').hidden,false);assert.equal(h.controllers[0].getState().session,null);
    assert.equal(h.builds.length,0);assert.equal(loads,0);assert.equal(h.controls.get('play').disabled,true);
    assert.equal(h.doc.activeElement,h.controls.get('entry-continue'));assert.equal(h.savedText(),raw);
    keyEvent(h,'Tab');assert.equal(h.doc.activeElement,h.controls.get('entry-new'));
    h.controls.get('entry-cancel').click();assert.equal(h.mounted.isActive(),false);assert.equal(h.savedText(),raw);assert.equal(h.writes.length,0);
    h.trigger.click();h.controls.get('entry-continue').click();await flush();
    assert.equal(h.controllers[0].getState().status,'paused');assert.equal(h.svg.dataset.replayCursor,saved.cursorDate);
    assert.equal(h.svg.dataset.replayStartDate,saved.startDate);assert.equal(h.svg.dataset.replayOrigin,saved.origin);
    assert.equal(h.builds[0].playbackStartDate,dateAt(181),'legacy saved UI start dates cannot change the original engine anchor');
    assert.equal(h.svg.dataset.replayFrequency,'weekly');assert.equal(h.controls.get('speed').value,'0.5');
    assert.equal(h.draws.at(-1).start,saved.range.start);assert.equal(h.draws.at(-1).end,saved.range.end);
    assert.match(h.status(),/일시정지/);assert.match(h.status(),/판본.*갱신/);
    assert.equal(h.savedText(),raw);assert.equal(h.writes.length,0);h.mounted.destroy();
  }},
  {name:'Start new, scissors hover, selection cancellation and unconfirmed exit preserve saved bytes without a fake cutoff',async run(source){
    const fixture=atlasFixture(),raw=JSON.stringify(savedFixture(),null,2)+'\n',h=await harness(source,{...fixture.options,storedText:raw});
    h.trigger.click();h.controls.get('entry-new').click();await flush();
    assert.equal(h.controllers[0].getState().status,'selecting');assert.equal(h.controllers[0].getState().session,null);
    assert.equal(h.draws.at(-1).selectionPreview,true);assert.equal(h.svg.dataset.replayOrigin,undefined);assert.equal(h.svg.dataset.replayCursor,undefined);
    assert.equal(h.svg.dataset.replaySelecting,'true');assert.equal(h.svg.querySelector('[data-chart-replay-picker]'),null);
    const builds=h.builds.length;h.pointer('pointermove',dateAt(182));
    assert.equal(h.svg.dataset.pickerDate,dateAt(182));assert.equal(h.builds.length,builds);
    assert.equal(h.svg.dataset.replayOrigin,undefined);assert.equal(h.svg.dataset.replayCursor,undefined);
    assert.match(h.svg.querySelector('[data-chart-replay-scissors]').textContent,/✂.*선택 전/);
    assert.equal(h.svg.querySelector('[data-chart-replay-picker]').getAttribute('aria-label'),'시작점 미리보기 · 아직 확정하지 않음');
    assert.equal(h.savedText(),raw);h.pointer('pointerleave');assert.equal(h.svg.dataset.pickerDate,undefined);assert.equal(h.svg.querySelector('[data-chart-replay-picker]'),null);
    h.controls.get('pick-cancel').click();assert.equal(h.mounted.isActive(),false);assert.equal(h.savedText(),raw);assert.equal(h.writes.length,0);
    h.trigger.click();h.controls.get('entry-new').click();await flush();h.controls.get('exit').click();
    assert.equal(h.controls.get('exit-dialog').hidden,false);assert.equal(h.controls.get('exit-save').disabled,true);assert.equal(h.controls.get('exit-save').checked,false);
    h.controls.get('exit-confirm').click();assert.equal(h.mounted.isActive(),false);assert.equal(h.savedText(),raw);assert.equal(h.writes.length,0);h.mounted.destroy();
  }},
  {name:'weekly start preview blocks Play, Forward and Jump to real-time until a clicked bar is confirmed',async run(source){
    const fixture=atlasFixture({frequency:'weekly'}),raw=JSON.stringify(savedFixture(),null,2)+'\n';
    const h=await harness(source,{...fixture.options,storedText:raw,
      rendererBarDateAt:date=>dateAfter(date,-((new Date(date+'T00:00:00Z').getUTCDay()+6)%7))});
    const assertBlocked=()=>{
      for(const name of ['play','next','live'])assert.equal(h.controls.get(name).disabled,true,name+' must be disabled before confirmation');
      h.controls.get('live').click();assert.equal(h.controls.get('exit-dialog').hidden,true,'unconfirmed live jump must not open the exit/save choice');
    };
    h.trigger.click();h.controls.get('entry-new').click();await flush();
    assert.equal(h.controllers[0].getState().session,null);assertBlocked();
    const builds=h.builds.length,path=JSON.stringify(fixture.forecast.path),positions=[];
    for(const [hover,date] of [[dateAt(99),dateAt(98)],[dateAt(143),dateAt(140)],[dateAt(106),dateAt(105)]]){
      h.pointer('pointermove',hover);assert.equal(h.svg.dataset.pickerDate,date,'use the actual chart bar date instead of the continuous calendar coordinate');
      assert.match(h.svg.querySelector('[data-chart-replay-scissors]').textContent,new RegExp(date));
      positions.push(h.svg.querySelector('[data-chart-replay-picker]').children[0].getAttribute('x1'));
      assert.equal(h.controllers[0].getState().session,null);assert.equal(h.svg.dataset.replayCursor,undefined);
      assert.equal(h.builds.length,builds);assert.equal(h.savedText(),raw);assertBlocked();
    }
    assert.equal(new Set(positions).size,3,'each hovered weekly bar moves the scissors line');
    h.pointer('pointerdown',dateAt(106));h.pointer('pointerup',dateAt(106));
    assert.equal(h.controllers[0].getState().status,'loading');assertBlocked();await flush();
    assert.equal(h.controllers[0].getState().status,'paused');assert.equal(h.svg.dataset.replayStartDate,dateAt(105));
    assert.equal(h.svg.dataset.replayCursor,dateAt(104));assert.equal(h.svg.dataset.replayFrequency,'weekly');
    for(const name of ['play','next','live'])assert.equal(h.controls.get(name).disabled,false,name+' is available after confirmation');
    const session=h.controllers[0].getState().session;
    h.controls.get('next').click();assert.equal(h.svg.dataset.replayCursor,dateAt(105));
    h.controls.get('pick').click();assertBlocked();assert.equal(h.draws.at(-1).selectionPreview,true);h.pointer('pointermove',dateAt(140));
    assert.equal(h.controllers[0].getState().session,session);assert.equal(h.svg.dataset.replayCursor,dateAt(105));
    h.controls.get('pick-cancel').click();assert.equal(h.controls.get('live').disabled,false);assert.equal(h.draws.at(-1).selectionPreview,false);
    assert.equal(h.controllers[0].getState().session,session);assert.equal(h.svg.dataset.replayCursor,dateAt(105));
    assert.equal(JSON.stringify(fixture.forecast.path),path);assert.equal(h.savedText(),raw);assert.equal(h.writes.length,0);h.mounted.destroy();
  }},
  {name:'only checked confirmed exit persists a draft and a saved line chart resumes with its actual archive',async run(source){
    const fixture=atlasFixture(),raw=JSON.stringify(savedFixture(),null,2)+'\n';
    const near={start:dateAt(20),end:dateAt(360)};
    const h=await harness(source,{...fixture.options,storedText:raw,resolveAtlasRange:()=>near});
    h.trigger.click();h.controls.get('entry-continue').click();await flush();
    h.controls.get('next').click();h.controls.get('speed').value='.3';h.controls.get('speed').onchange();
    h.mounted.handleChartCommand({action:'span',value:'near'});h.mounted.handleChartCommand({action:'chart-type',value:'line'});await flush();
    assert.equal(h.svg.dataset.replayCursor,dateAt(183));assert.equal(h.controls.get('display').value,'line');assert.equal(h.savedText(),raw);assert.equal(h.writes.length,0);
    h.controls.get('exit').click();assert.equal(h.controls.get('exit-save').checked,true);assert.equal(h.controllers[0].getState().status,'paused');
    h.controls.get('exit-cancel').click();assert.equal(h.mounted.isActive(),true);assert.equal(h.savedText(),raw);assert.equal(h.controls.get('exit-dialog').hidden,true);
    h.controls.get('exit').click();h.controls.get('exit-save').checked=false;h.controls.get('exit-confirm').click();
    assert.equal(h.mounted.isActive(),false);assert.equal(h.savedText(),raw);assert.equal(h.writes.length,0);
    h.trigger.click();h.controls.get('entry-continue').click();await flush();h.controls.get('next').click();
    h.controls.get('speed').value='.3';h.controls.get('speed').onchange();h.mounted.handleChartCommand({action:'span',value:'near'});
    h.mounted.handleChartCommand({action:'chart-type',value:'line'});await flush();h.controls.get('exit').click();h.controls.get('exit-confirm').click();
    assert.equal(h.mounted.isActive(),false);assert.equal(h.writes.length,1);
    const saved=h.saved();assert.equal(saved.cursorDate,dateAt(183));assert.equal(saved.origin,dateAt(180));assert.equal(saved.startDate,dateAt(181));
    assert.equal(saved.speed,.3);assert.equal(saved.frequency,'weekly');assert.equal(saved.chartType,'line');assert.equal(saved.window,'near');assert.equal(saved.customRange,false);
    assert.deepEqual(saved.range,near);assert.equal(saved.sourceHash,fixture.observed.source.sourceHash);assert.equal(saved.outputHash,FIXED_OUTPUT);
    const written=h.savedText();h.trigger.click();h.controls.get('entry-continue').click();await flush();
    assert.equal(h.controllers[0].getState().status,'paused');assert.equal(h.controls.get('display').value,'line');assert.equal(h.svg.dataset.replayCursor,dateAt(183));
    assert.equal(h.svg.dataset.replayFrequency,'weekly');assert.equal(h.builds.at(-1).source,fixture.observed.source);
    assert.equal(h.savedText(),written);assert.equal(h.writes.length,1);h.mounted.destroy();
  }},
  {name:'reselecting during playback previews independently and pointer confirmation cuts actual data before the selected bar',async run(source){
    const fixture=atlasFixture(),h=await harness(source,fixture.options);await h.mounted.open();h.controls.get('next').click();
    const original=h.controllers[0].getState().session,hash=h.svg.dataset.replayOutputHash,path=JSON.stringify(fixture.forecast.path),builds=h.builds.length;
    h.controls.get('play').click();assert.equal(h.timers.size,1);h.controls.get('pick').click();
    assert.equal(h.controllers[0].getState().status,'paused');assert.equal(h.timers.size,0);assert.equal(h.controls.get('next').disabled,true);
    h.pointer('pointermove',dateAt(183));assert.equal(h.svg.dataset.pickerDate,dateAt(183));assert.equal(h.svg.dataset.replayCursor,dateAt(181));
    assert.equal(h.controllers[0].getState().session,original);assert.equal(h.builds.length,builds);assert.equal(h.writes.length,0);
    h.controls.get('pick-cancel').click();assert.equal(h.svg.dataset.pickerDate,undefined);assert.equal(h.svg.querySelector('[data-chart-replay-picker]'),null);
    assert.equal(h.controllers[0].getState().session,original);assert.equal(h.svg.dataset.replayCursor,dateAt(181));assert.equal(h.controls.get('next').disabled,false);
    h.controls.get('pick').click();h.pointer('pointermove',dateAt(183));h.pointer('pointerdown',dateAt(183));h.pointer('pointerup',dateAt(183));
    assert.equal(h.controllers[0].getState().status,'loading');assert.equal(h.svg.dataset.replayCursor,undefined,'a newly confirmed cutoff cannot leave stale actuals active while loading');
    await flush();assert.equal(h.controllers[0].getState().status,'paused');assert.equal(h.svg.dataset.replayOrigin,dateAt(182));assert.equal(h.svg.dataset.replayCursor,dateAt(182));
    assert.equal(h.builds.at(-1).asOf,dateAt(182));assert.equal(h.builds.at(-1).playbackStartDate,dateAt(183));
    assert.equal(h.draws.at(-1).data.observedRows.at(-1).date,dateAt(182));assert.ok(h.draws.at(-1).data.observedCandles.every(row=>row.date<dateAt(183)));
    assert.equal(h.svg.dataset.replayOutputHash,hash);assert.equal(JSON.stringify(h.draws.at(-1).data.frame.forecast),path);assert.equal(h.writes.length,0);
    h.controls.get('next').click();assert.equal(h.svg.dataset.replayCursor,dateAt(183));h.mounted.destroy();
  }},
  {name:'Select date, Random bar and First available day use the real capability range including an empty first cutoff',async run(source){
    const fixture=atlasFixture({missing:[0]}),h=await harness(source,fixture.options);await h.mounted.open();
    assert.equal(h.controls.get('date').min,dateAt(1));h.controls.get('select-menu').click();
    assert.equal(h.controls.get('select-panel').hidden,false);assert.equal(h.controls.get('select-menu').getAttribute('aria-expanded'),'true');
    h.controls.get('select-date').click();assert.equal(h.doc.activeElement,h.controls.get('date'));assert.equal(h.controls.get('select-panel').hidden,false,'the date editor stays visible inside Select bar');
    h.controls.get('date').value=dateAt(50);h.controls.get('date').onkeydown({key:'Enter',preventDefault(){}});await flush();
    assert.equal(h.svg.dataset.replayStartDate,dateAt(50));assert.equal(h.svg.dataset.replayCursor,dateAt(49));
    h.controls.get('select-menu').click();h.controls.get('select-random').click();await flush();
    const randomDate=fixture.observed.observations[Math.floor(fixture.observed.observations.length*.5)].date;
    assert.equal(h.svg.dataset.replayStartDate,randomDate);assert.equal(h.svg.dataset.replayCursor,dateAfter(randomDate,-1));
    h.controls.get('select-menu').click();h.controls.get('select-first').click();await flush();
    assert.equal(h.svg.dataset.replayStartDate,dateAt(1));assert.equal(h.svg.dataset.replayOrigin,dateAt(0));assert.equal(h.svg.dataset.replayCursor,dateAt(0));
    assert.deepEqual(h.draws.at(-1).data.observedRows,[]);assert.deepEqual(h.draws.at(-1).data.observedCandles,[]);
    h.controls.get('next').click();assert.equal(h.svg.dataset.replayCursor,dateAt(1));assert.equal(h.draws.at(-1).data.observedCandles[0].close,fixture.observed.observations[0].close);
    h.mounted.handleChartCommand({action:'frequency',value:'weekly'});assert.equal(h.controls.get('date').min,dateAt(7));
    h.controls.get('select-first').click();await flush();assert.equal(h.svg.dataset.replayStartDate,dateAt(7));assert.equal(h.svg.dataset.replayCursor,dateAt(6));
    assert.equal(h.svg.dataset.replayFrequency,'weekly');assert.equal(h.svg.dataset.replayUpdateInterval,'daily');assert.equal(h.writes.length,0);h.mounted.destroy();
  }},
  {name:'Select bar opens only starting actions, keeps forecast settings separate and selects a chart bar without mutating saved state',async run(source){
    const fixture=atlasFixture(),raw=JSON.stringify(savedFixture()),h=await harness(source,{...fixture.options,storedText:raw});
    await h.mounted.open();const session=h.controllers[0].getState().session,hash=h.svg.dataset.replayOutputHash;
    h.controls.get('select-menu').click();
    assert.equal(h.controls.get('select-panel').dataset.menuView,'start');assert.equal(h.controls.get('start-view').hidden,false);
    assert.equal(h.controls.get('date-view').hidden,true);assert.equal(h.controls.get('forecast-view').hidden,true);assert.equal(h.doc.activeElement,h.controls.get('select-chart'));
    for(const expected of ['select-date','select-random','select-first','select-chart']){
      h.controls.get('select-panel').dispatchEvent({type:'keydown',key:'ArrowDown',preventDefault(){},stopPropagation(){}});
      assert.equal(h.doc.activeElement,h.controls.get(expected));
    }
    h.controls.get('menu-settings').click();assert.equal(h.controls.get('select-panel').dataset.menuView,'forecast');
    assert.equal(h.controls.get('start-view').hidden,true);assert.equal(h.controls.get('date-view').hidden,true);assert.equal(h.controls.get('forecast-view').hidden,false);
    h.controls.get('details').click();assert.equal(h.controls.get('detail-panel').hidden,false);
    h.controls.get('menu-back').click();assert.equal(h.controls.get('select-panel').dataset.menuView,'start');assert.equal(h.controls.get('detail-panel').hidden,true);
    h.controls.get('select-chart').click();assert.equal(h.controls.get('select-panel').hidden,true);assert.equal(h.svg.dataset.replaySelecting,'true');
    h.pointer('pointermove',dateAt(183));assert.equal(h.svg.dataset.pickerDate,dateAt(183));
    assert.equal(h.controllers[0].getState().session,session);assert.equal(h.svg.dataset.replayOutputHash,hash);assert.equal(h.savedText(),raw);assert.equal(h.writes.length,0);
    h.controls.get('pick-cancel').click();assert.equal(h.svg.dataset.replaySelecting,undefined);h.mounted.destroy();
  }},
  {name:'the date selection editor follows the restored visible cursor and discards unapplied drafts without changing the session start',async run(source){
    const fixture=atlasFixture(),saved=savedFixture({startDate:dateAt(184),cursorIndex:3,cursorDate:dateAt(183),frequency:'daily'}),raw=JSON.stringify(saved,null,2)+'\n';
    const h=await harness(source,{...fixture.options,storedText:raw});h.trigger.click();h.controls.get('entry-continue').click();await flush();
    const session=h.controllers[0].getState().session,hash=h.svg.dataset.replayOutputHash,builds=h.builds.length;
    for(const close of ['menu-back','select-close','escape','outside']){
      if(h.controls.get('select-panel').hidden)h.controls.get('select-menu').click();
      h.controls.get('select-date').click();assert.equal(h.controls.get('select-panel').dataset.menuView,'date');
      assert.equal(h.controls.get('date').value,saved.cursorDate);assert.equal(h.controls.get('date').getAttribute('aria-label'),'새 시작점 날짜');
      assert.equal(h.controls.get('date-context').textContent,'현재 공개: '+dateAt(183)+' · 다음 봉: '+dateAt(184));
      h.controls.get('date').value=dateAt(184);
      if(close==='escape')h.controls.get('select-panel').dispatchEvent({type:'keydown',key:'Escape',preventDefault(){},stopPropagation(){}});
      else if(close==='outside')h.doc.dispatchEvent({type:'pointerdown',target:h.svg});else h.controls.get(close).click();
      assert.equal(h.controls.get('date').value,saved.startDate,'the hidden editor restores its original non-draft value');
      assert.equal(h.controllers[0].getState().session,session);assert.equal(h.svg.dataset.replayCursor,saved.cursorDate);assert.equal(h.svg.dataset.replayStartDate,saved.startDate);
      assert.equal(h.svg.dataset.replayOutputHash,hash);assert.equal(h.builds.length,builds);assert.equal(h.savedText(),raw);assert.equal(h.writes.length,0);
    }
    h.controls.get('select-menu').click();h.controls.get('select-date').click();h.controls.get('date').value=dateAt(182);
    h.controls.get('next').click();assert.equal(h.controls.get('date').value,dateAt(182),'transport must not overwrite an in-progress date draft');
    assert.equal(h.controls.get('date-context').textContent,'현재 공개: '+dateAt(184)+' · 다음 봉: 확보한 자료 끝');
    h.controls.get('first').click();assert.equal(h.controls.get('date').value,dateAt(182));
    assert.equal(h.controls.get('date-context').textContent,'현재 공개: '+dateAt(180)+' · 다음 봉: '+dateAt(181));
    h.controls.get('select-close').click();for(let i=0;i<3;i++)h.controls.get('next').click();
    h.controls.get('select-menu').click();h.controls.get('select-date').click();h.controls.get('start').click();await flush();
    assert.equal(h.svg.dataset.replayStartDate,dateAt(183));assert.equal(h.svg.dataset.replayCursor,dateAt(182));
    assert.equal(h.svg.dataset.replayOutputHash,hash);h.controls.get('next').click();assert.equal(h.svg.dataset.replayCursor,dateAt(183));
    assert.equal(h.savedText(),raw);assert.equal(h.writes.length,0);h.mounted.destroy();
  }},
  {name:'date editing preserves the default first candle and reports empty cutoffs and actual gaps truthfully',async run(source){
    const fixture=atlasFixture({missing:[182]}),h=await harness(source,fixture.options);await h.mounted.open();
    assert.equal(h.svg.dataset.replayStartDate,dateAt(181));assert.equal(h.svg.dataset.replayCursor,dateAt(180));
    h.controls.get('select-menu').click();h.controls.get('select-date').click();assert.equal(h.controls.get('date').value,dateAt(180));
    h.controls.get('date').value=dateAt(183);h.controls.get('select-close').click();h.controls.get('next').click();
    assert.equal(h.svg.dataset.replayCursor,dateAt(181));assert.equal(h.svg.dataset.replayStartDate,dateAt(181));
    h.controls.get('select-menu').click();h.controls.get('select-date').click();
    assert.equal(h.controls.get('date-context').textContent,'현재 공개: '+dateAt(181)+' · 다음 봉: '+dateAt(183),'next is a real archive date, not cursor plus one day');
    h.controls.get('menu-back').click();h.controls.get('select-first').click();await flush();
    h.controls.get('select-menu').click();h.controls.get('select-date').click();
    assert.equal(h.controls.get('date').value,dateAt(0));assert.equal(h.controls.get('date-context').textContent,'현재 공개: 없음 · 다음 봉: '+dateAt(0));
    h.mounted.exit();await h.mounted.open({selectOnly:true});const initial=h.controls.get('date').value;
    h.controls.get('select-menu').click();h.controls.get('select-date').click();h.controls.get('date').value=dateAt(183);h.controls.get('menu-back').click();
    assert.equal(h.controls.get('date').value,initial);h.controls.get('select-date').click();assert.equal(h.controls.get('date').value,initial);
    assert.match(h.controls.get('date-context').textContent,/시작점 미확정/);assert.equal(h.controllers[0].getState().session,null);assert.equal(h.writes.length,0);h.mounted.destroy();
  }},
  {name:'compact transport returns to its original start and opens the explicit save choice before jumping to the live chart',async run(source){
    const fixture=atlasFixture({frequency:'weekly'}),h=await harness(source,fixture.options);await h.mounted.open();
    const session=h.controllers[0].getState().session,hash=h.svg.dataset.replayOutputHash,builds=h.builds.length;
    assert.equal(h.controls.get('first').disabled,true);h.controls.get('next').click();h.controls.get('next').click();
    h.controls.get('play').click();assert.equal(h.timers.size,1);assert.equal(h.controls.get('first').disabled,false);
    h.controls.get('first').click();assert.equal(h.svg.dataset.replayCursor,dateAt(180));assert.equal(h.controllers[0].getState().status,'paused');assert.equal(h.timers.size,0);
    assert.equal(h.controllers[0].getState().session,session);assert.equal(h.svg.dataset.replayOutputHash,hash);assert.equal(h.builds.length,builds);assert.equal(h.svg.dataset.replayFrequency,'weekly');
    h.controls.get('speed').value='10';h.controls.get('speed').onchange();assert.match(h.controls.get('speed-meaning').textContent,/10×.*초당 10업데이트/);
    h.controls.get('next').click();h.controls.get('live').click();assert.equal(h.mounted.isActive(),true);assert.equal(h.restores(),0);assert.equal(h.controls.get('exit-dialog').hidden,false);
    assert.equal(h.controls.get('first').disabled,true);assert.equal(h.controls.get('live').disabled,true);assert.equal(h.controls.get('exit-save').checked,true);assert.equal(h.writes.length,0);
    h.controls.get('exit-cancel').click();assert.equal(h.svg.dataset.replayCursor,dateAt(181));assert.equal(h.svg.dataset.replayOutputHash,hash);
    h.controls.get('live').click();h.controls.get('exit-save').checked=false;h.controls.get('exit-confirm').click();
    assert.equal(h.mounted.isActive(),false);assert.equal(h.restores(),1);assert.equal(h.writes.length,0);h.mounted.destroy();
  }},
  {name:'Select bar retains native form keys and closes through Escape, its close action and an outside pointer',async run(source){
    const fixture=atlasFixture(),h=await harness(source,fixture.options);await h.mounted.open();
    const session=h.controllers[0].getState().session,hash=h.svg.dataset.replayOutputHash,builds=h.builds.length;
    h.controls.get('select-menu').click();h.controls.get('select-date').click();assert.equal(h.controls.get('select-panel').hidden,false);
    for(const key of ['Tab','ArrowUp','ArrowDown','Home','End']){
      const event={type:'keydown',key,target:h.controls.get('date'),preventDefault(){this.prevented=true;},stopPropagation(){this.stopped=true;}};
      h.controls.get('select-panel').dispatchEvent(event);assert.equal(event.prevented,undefined,'date input owns '+key);
    }
    h.controls.get('select-panel').dispatchEvent({type:'keydown',key:'Escape',target:h.controls.get('date'),preventDefault(){},stopPropagation(){}});
    assert.equal(h.controls.get('select-panel').hidden,true);assert.equal(h.doc.activeElement,h.controls.get('select-menu'));
    h.controls.get('select-menu').click();h.controls.get('menu-settings').click();h.controls.get('details').click();assert.equal(h.controls.get('detail-panel').hidden,false);
    h.controls.get('select-close').click();assert.equal(h.controls.get('select-panel').hidden,true);assert.equal(h.controls.get('detail-panel').hidden,true);
    assert.equal(h.controls.get('details').getAttribute('aria-expanded'),'false');assert.equal(h.doc.activeElement,h.controls.get('select-menu'));
    h.controls.get('select-menu').click();h.doc.dispatchEvent({type:'pointerdown',target:h.svg});assert.equal(h.controls.get('select-panel').hidden,true);
    assert.equal(h.controllers[0].getState().session,session);assert.equal(h.svg.dataset.replayOutputHash,hash);assert.equal(h.builds.length,builds);assert.equal(h.writes.length,0);h.mounted.destroy();
  }},
  {name:'weekly replay and all existing viewport periods route without rebuilding or changing the current orange forecast',async run(source){
    const fixture=atlasFixture({frequency:'weekly'}),ranges={focus:{start:dateAt(90),end:dateAt(700)},near:{start:dateAt(170),end:dateAt(350)},all:{start:dateAt(0),end:dateAt(900)},history:{start:dateAt(0),end:dateAt(184)}};
    const rangeCalls=[],h=await harness(source,{...fixture.options,resolveAtlasRange:(span,captured)=>{rangeCalls.push({span,captured});return ranges[span];}});
    await h.mounted.open();const original=h.controllers[0].getState().session,path=JSON.stringify(fixture.forecast.path);
    assert.equal(h.svg.dataset.replayFrequency,'weekly');assert.equal(h.chartCalls.at(-1).frequency,'weekly');assert.equal(h.frameEvents.at(-1).frequency,'weekly');
    assert.equal(h.controls.get('update-interval').disabled,true);assert.equal(h.controls.get('update-interval').value,'daily');
    assert.equal(h.frequencyControl.inert,false);assert.equal(h.typeControl.inert,false);assert.equal(h.liveControl.inert,true);
    for(const span of ['near','all','history','focus']){
      assert.equal(h.mounted.handleChartCommand({action:'span',value:span}),true);assert.equal(h.draws.at(-1).start,ranges[span].start);assert.equal(h.draws.at(-1).end,ranges[span].end);
      assert.equal(h.frameEvents.at(-1).window,span);assert.equal(h.frameEvents.at(-1).customRange,false);
    }
    for(const call of rangeCalls){assert.deepEqual(call.captured,fixture.captured);assert.notEqual(call.captured,fixture.captured,'range commands use the owned capture');}
    for(const frequency of ['daily','weekly']){h.mounted.handleChartCommand({action:'frequency',value:frequency});assert.equal(h.chartCalls.at(-1).frequency,frequency);}
    h.mounted.handleChartCommand({action:'frequency',value:'1h'});assert.equal(h.svg.dataset.replayFrequency,'weekly');assert.match(h.notice().textContent,/실제 분봉.*주봉 간격을 유지/);
    h.mounted.handleChartCommand({action:'scenario',value:'stress'});assert.equal(h.controllers[0].getState().session,original);assert.deepEqual(h.factories,['current']);
    assert.equal(JSON.stringify(h.draws.at(-1).data.frame.forecast),path);assert.equal(JSON.stringify(fixture.forecast.path),path);assert.equal(h.svg.dataset.replayOutputHash,FIXED_OUTPUT);
    assert.equal(h.writes.length,0);h.mounted.destroy();assert.equal(h.frequencyControl.inert,false);assert.equal(h.typeControl.inert,false);assert.equal(h.liveControl.inert,false);
  }},
  {name:'unsupported intraday entry stays on the selected interval and displays the missing-source reason',async run(source){
    const fixture=atlasFixture(),state={frequency:'1h',window:'near'},h=await harness(source,{...fixture.options,getChartState:()=>state});
    h.trigger.click();await flush();assert.equal(h.mounted.isActive(),false);assert.equal(h.builds.length,0);assert.equal(state.frequency,'1h');
    assert.equal(h.notice().hidden,false);assert.match(h.notice().textContent,/1시간봉.*실제 분봉.*1시간봉 간격을 유지/);assert.equal(h.frequencyControl.inert,false);
    await h.mounted.open();assert.equal(h.mounted.isActive(),false);assert.equal(h.builds.length,0);
    state.frequency='weekly';h.trigger.click();await flush();assert.equal(h.mounted.isActive(),true);assert.equal(h.controllers[0].getState().status,'selecting');
    assert.equal(h.draws.at(-1).data.frequency,'weekly');assert.equal(h.frameEvents.at(-1).frequency,'weekly');assert.equal(h.chartCalls.at(-1).frequency,'weekly');
    await h.start(h.controls.get('date').value);assert.equal(h.svg.dataset.replayFrequency,'weekly');assert.equal(h.notice().hidden,true);assert.equal(h.writes.length,0);h.mounted.destroy();
  }},
  {name:'Shift replay shortcuts retain native input behavior and never persist on blur or page hide',async run(source){
    const fixture=atlasFixture(),h=await harness(source,fixture.options);await h.mounted.open();const initial=h.svg.dataset.replayCursor;
    const native=keyEvent(h,'ArrowRight',{shiftKey:true,target:h.controls.get('date')});assert.equal(native.prevented,undefined);assert.equal(h.svg.dataset.replayCursor,initial);
    const play=keyEvent(h,'ArrowDown',{shiftKey:true});assert.equal(play.prevented,true);assert.equal(play.stopped,true);assert.equal(h.controllers[0].getState().status,'playing');
    assert.equal(h.timers.size,1);assert.equal([...h.timers.values()][0].delay,1000);h.tick();assert.equal(h.svg.dataset.replayCursor,dateAt(181));
    keyEvent(h,'ArrowDown',{shiftKey:true});assert.equal(h.controllers[0].getState().status,'paused');assert.equal(h.timers.size,0);
    keyEvent(h,'ArrowRight',{shiftKey:true});assert.equal(h.svg.dataset.replayCursor,dateAt(182));
    const session=h.controllers[0].getState().session,hash=h.svg.dataset.replayOutputHash,builds=h.builds.length;
    for(const extra of [{},{shiftKey:true}]){keyEvent(h,'ArrowLeft',extra);assert.equal(h.svg.dataset.replayCursor,dateAt(182));}
    assert.equal(h.controls.has('previous'),false);assert.equal(h.controllers[0].getState().session,session);assert.equal(h.svg.dataset.replayOutputHash,hash);assert.equal(h.builds.length,builds);
    const nativeLeft=keyEvent(h,'ArrowLeft',{shiftKey:true,target:h.controls.get('date')});assert.equal(nativeLeft.prevented,undefined);assert.equal(nativeLeft.stopped,undefined);
    h.controls.get('speed').value='.3';h.controls.get('speed').onchange();keyEvent(h,'ArrowDown',{shiftKey:true});assert.equal([...h.timers.values()][0].delay,3000);
    h.win.dispatchEvent({type:'blur'});h.win.dispatchEvent({type:'pagehide'});assert.equal(h.controllers[0].getState().status,'paused');assert.equal(h.timers.size,0);assert.equal(h.saved(),null);assert.equal(h.writes.length,0);
    h.controls.get('pick').click();const cursor=h.svg.dataset.replayCursor;keyEvent(h,'ArrowRight',{shiftKey:true});assert.equal(h.svg.dataset.replayCursor,cursor);
    keyEvent(h,'Escape');assert.equal(h.svg.dataset.replaySelecting,undefined);assert.equal(h.mounted.isActive(),true);
    keyEvent(h,'Escape');assert.equal(h.controls.get('exit-dialog').hidden,false);keyEvent(h,'Escape');assert.equal(h.controls.get('exit-dialog').hidden,true);
    assert.equal(h.mounted.isActive(),true);assert.equal(h.writes.length,0);h.mounted.destroy();
  }},
  {name:'baseline close-only scoring dates and separate weekly candles retain distinct source and evaluation clocks',async run(source){
    const fixture=atlasFixture({frequency:'weekly',chartType:'candles'}),scoring=archive('Coin Metrics fixture');
    scoring.observations=scoring.observations.map(({date,price})=>({date,price}));scoring.source.ohlcAvailable=false;
    const h=await harness(source,{...fixture.options,loadArchive:async(_symbol,{mode})=>mode==='recorded'?scoring:fixture.observed});
    h.controls.get('mode').value='project-baseline';await h.mounted.open();
    assert.equal(h.controllers[0].getState().status,'paused');assert.equal(h.svg.dataset.replayCursor,dateAt(180));assert.deepEqual(h.factories,['project']);
    assert.equal(h.builds[0].observations,scoring.observations);assert.equal(h.builds[0].source,scoring.source);
    assert.equal(h.draws.at(-1).data.priceSource,'Coin Metrics fixture');assert.equal(h.draws.at(-1).data.candleSource,'Bitstamp fixture');
    assert.equal(h.displayCalls.at(-1).observations,fixture.observed.observations);assert.equal(h.displayCalls.at(-1).frequency,'weekly');
    assert.equal(h.displayCalls.at(-1).evaluatedAt,evaluatedAt,'acquisition uses the current session clock; the helper separately applies the replay close cutoff');
    assert.notEqual(h.displayCalls.at(-1).evaluatedAt,h.draws.at(-1).data.frame.evaluationAt);
    await h.start(dateAt(183));assert.equal(h.svg.dataset.replayCursor,dateAt(182));assert.equal(h.controllers[0].getState().session.asOf,dateAt(180));
    assert.equal(h.builds.at(-1).baseline,fixture.baseline);
    h.mounted.handleChartCommand({action:'frequency',value:'daily'});assert.equal(h.svg.dataset.replayFrequency,'daily');
    h.mounted.handleChartCommand({action:'frequency',value:'weekly'});assert.equal(h.svg.dataset.replayFrequency,'weekly');
    h.controls.get('select-random').click();await flush();assert.ok(h.svg.dataset.replayStartDate>=dateAt(181));
    h.controls.get('select-first').click();await flush();assert.equal(h.svg.dataset.replayStartDate,dateAt(181));assert.equal(h.svg.dataset.replayCursor,dateAt(180));
    assert.ok(h.factories.every(kind=>kind==='project'));assert.equal(h.writes.length,0);h.mounted.destroy();
  }},
  {name:'a changed forecast hash rejects Continue while preserving the exact previous saved session',async run(source){
    const fixture=atlasFixture(),raw=JSON.stringify(savedFixture({outputHash:'previous-forecast-output'}),null,2)+'\n';
    const h=await harness(source,{...fixture.options,storedText:raw});h.trigger.click();h.controls.get('entry-continue').click();await flush();
    assert.equal(h.controllers[0].getState().status,'error');assert.equal(h.controllers[0].getState().session,null);assert.equal(h.controls.get('export').disabled,true);
    assert.match(h.status(),/예측이 달라.*기존 저장은 유지/);assert.equal(h.draws.filter(draw=>draw.session&&!draw.selectionPreview).length,0);
    assert.equal(h.savedText(),raw);assert.equal(h.writes.length,0);h.mounted.exit();h.trigger.click();
    assert.equal(h.controls.get('entry-dialog').hidden,false);h.controls.get('entry-new').click();await flush();
    assert.equal(h.controllers[0].getState().status,'selecting');assert.equal(h.savedText(),raw);h.controls.get('pick-cancel').click();assert.equal(h.savedText(),raw);h.mounted.destroy();
  }},
  {name:'entry and exit choices stop pointer, click, wheel and keyboard propagation to the chart behind the modal',async run(source){
    const fixture=atlasFixture(),raw=JSON.stringify(savedFixture(),null,2)+'\n',h=await harness(source,{...fixture.options,storedText:raw});
    const leaked=[];
    for(const type of ['pointerdown','pointermove','pointerup','click','wheel'])h.plot.addEventListener(type,()=>leaked.push(type));
    h.doc.addEventListener('keydown',()=>leaked.push('keydown'));
    const blocked=()=>{
      const cursor=h.svg.dataset.replayCursor,session=h.controllers[0].getState().session,draws=h.draws.length;
      for(const type of ['pointerdown','pointermove','pointerup','click','wheel']){
        const event={type,target:h.svg,button:0,pointerId:1,clientX:120,clientY:100,deltaX:0,deltaY:100,
          preventDefault(){this.prevented=true;},stopImmediatePropagation(){this.immediatePropagationStopped=true;}};
        h.plot.dispatchEvent(event);assert.equal(event.immediatePropagationStopped,true,type+' must not reach the underlying canvas handler');
      }
      for(const key of ['ArrowRight','ArrowDown','Home',' ']){
        const event=keyEvent(h,key,{shiftKey:key.startsWith('Arrow')});assert.equal(event.immediatePropagationStopped,true,key+' must not reach the underlying chart');
      }
      assert.deepEqual(leaked,[]);assert.equal(h.svg.dataset.replayCursor,cursor);assert.equal(h.controllers[0].getState().session,session);
      assert.equal(h.draws.length,draws);assert.equal(h.savedText(),raw);assert.equal(h.writes.length,0);
    };
    h.trigger.click();assert.equal(h.controls.get('entry-dialog').hidden,false);blocked();
    const button=keyEvent(h,'Enter',{target:h.controls.get('entry-continue')});assert.equal(button.immediatePropagationStopped,true);assert.equal(button.prevented,undefined,'the dialog button retains its native keyboard activation');
    h.controls.get('entry-continue').click();await flush();h.controls.get('exit').click();assert.equal(h.controls.get('exit-dialog').hidden,false);blocked();
    const checkbox=keyEvent(h,' ',{target:h.controls.get('exit-save')});assert.equal(checkbox.immediatePropagationStopped,true);assert.equal(checkbox.prevented,undefined,'the save checkbox retains its native keyboard toggle');
    h.controls.get('exit-cancel').click();keyEvent(h,'ArrowRight',{shiftKey:true});assert.equal(h.svg.dataset.replayCursor,dateAt(183));
    assert.deepEqual(leaked,[]);assert.equal(h.writes.length,0);h.mounted.destroy();
  }},
  {name:'a close-only recorded visit cannot overwrite the saved line display when Continue reloads genuine candles',async run(source){
    const fixture=atlasFixture(),saved=savedFixture({chartType:'line'}),raw=JSON.stringify(saved,null,2)+'\n';
    const closes=archive('Recorded close-only fixture');closes.observations=closes.observations.map(({date,price})=>({date,price}));closes.source.ohlcAvailable=false;
    const h=await harness(source,{...fixture.options,storedText:raw,
      loadArchive:async(_symbol,{mode})=>mode==='recorded'?closes:fixture.observed,
      loadRecord:async()=>({record:{id:'close-only-record',asOf:dateAt(180)},snapshot:{},entries:[{id:'close-only-record',asOf:dateAt(180),scenario:'base'}]}),
    });
    await h.mounted.open();h.controls.get('mode').value='recorded';h.controls.get('mode').onchange();await flush();
    assert.equal(h.controllers[0].getState().status,'paused');assert.equal(h.controls.get('display').value,'line');
    assert.equal(h.controls.get('display').querySelector('[value="candles"]').disabled,true,'the previous close-only mode must actually leave a disabled candle option');
    h.mounted.exit();assert.equal(h.savedText(),raw);assert.equal(h.writes.length,0);
    h.trigger.click();h.controls.get('entry-continue').click();await flush();
    assert.equal(h.controllers[0].getState().status,'paused');assert.equal(h.controls.get('mode').value,'atlas-chart');
    assert.equal(h.controls.get('display').value,'line','Continue must honor its explicit saved chart type when genuine OHLC becomes available');
    assert.equal(h.draws.at(-1).chartType,'line');assert.equal(h.controls.get('display').querySelector('[value="candles"]').disabled,false);
    assert.equal(h.svg.dataset.replayCursor,saved.cursorDate);assert.equal(h.builds.at(-1).source,fixture.observed.source);
    assert.equal(h.savedText(),raw);assert.equal(h.writes.length,0);h.mounted.destroy();
  }},
  {name:'generic BTC Continue synchronizes a live weekly header with the actual daily renderer and recorded line fallback',async run(source){
    for(const mode of ['historical-reconstruction','recorded']){
      const fixture=atlasFixture({frequency:'weekly'}),path=JSON.stringify(fixture.forecast.path);
      const saved=savedFixture({mode,frequency:'daily',chartType:'candles',range:null,customRange:false,recordId:mode==='recorded'?'generic-close-record':null});
      delete saved.startDate;
      const raw=JSON.stringify(saved,null,2)+'\n',observed=archive(mode==='recorded'?'Recorded close-only fixture':'Bitstamp generic fixture');
      if(mode==='recorded'){observed.observations=observed.observations.map(({date,price})=>({date,price}));observed.source.ohlcAvailable=false;}
      const axis={top:8,bottom:350,left:20,right:780,scale:'linear',min:0,max:500};
      const h=await harness(source,{...fixture.options,storedText:raw,loadArchive:async()=>observed,rendererAxis:axis,
        loadRecord:async()=>({record:{id:'generic-close-record',asOf:dateAt(180)},snapshot:{},entries:[{id:'generic-close-record',asOf:dateAt(180),scenario:'base'}]}),
      });
      h.trigger.click();assert.equal(h.controls.get('entry-dialog').hidden,false);h.controls.get('entry-continue').click();await flush();
      assert.equal(h.controllers[0].getState().status,'paused');assert.equal(h.svg.dataset.replayCursor,saved.cursorDate);
      const assertFrame=()=>{
        const rendered=h.draws.at(-1),event=h.frameEvents.at(-1);
        assert.ok(event,'every ready BTC renderer must publish its actual display state to the shared header');
        assert.equal(rendered.renderer,'replay');assert.equal(event.session,rendered.session);assert.equal(event.data,rendered.data);
        assert.equal(event.frequency,rendered.data.frequency);assert.equal(event.frequency,h.svg.dataset.replayFrequency);
        assert.equal(event.chartType,rendered.chartType);assert.equal(event.chartType,h.controls.get('display').value);
        assert.equal(event.data.frame.cursorDate,h.svg.dataset.replayCursor);assert.equal(event.axis,axis);
        assert.equal(event.context.presentation.scale,'linear');assert.equal(event.context.presentation.unit,'usd');
        assert.equal(event.context.presentation.showCycleMarkers,false);assert.equal(event.context.presentation.showCycleIntervals,false);
        assert.equal(event.start,rendered.start);assert.equal(event.end,rendered.end);assert.equal(event.customRange,true);
      };
      assertFrame();assert.equal(h.frameEvents.at(-1).frequency,'daily');
      assert.equal(h.frameEvents.at(-1).chartType,mode==='recorded'?'line':'candles');
      if(mode==='historical-reconstruction')assert.equal(h.draws.find(draw=>draw.renderer==='selection').frequency,'daily');
      assert.deepEqual(h.factories,[mode==='recorded'?'recorded':'historical']);
      h.controls.get('next').click();assert.equal(h.svg.dataset.replayCursor,dateAt(183));assertFrame();
      h.repaint();assertFrame();assert.equal(h.builds.length,1,'header synchronization and repaint must not recreate the selected model');
      assert.equal(JSON.stringify(fixture.forecast.path),path);assert.equal(h.savedText(),raw);assert.equal(h.writes.length,0);h.mounted.destroy();
    }
  }},
];

async function verifyInteractionCase(index){
  const item=interactionCases[index];assert.ok(item,'A named UI interaction case is required');
  if(typeof vm.SourceTextModule!=='function')return JSON.parse(execFileSync(process.execPath,
    ['--experimental-vm-modules',fileURLToPath(import.meta.url),'--replay-ui-extra',String(index)],{encoding:'utf8',timeout:30000,stdio:['ignore','pipe','pipe']}));
  const source=await readFile(sourceUrl,'utf8');await item.run(source);
  return {status:'pass',name:item.name,sourceSha256:createHash('sha256').update(source).digest('hex'),
    scope:'Actual coordinator and lifecycle controller with deterministic DOM, source, capability and renderer doubles; weekly aggregation and native browser behavior are verified separately'};
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
    await h.mounted.open();await h.start();assert.equal(h.saved(),null);assert.equal(h.writes.length,0);
    h.controls.get('horizon').value='365';h.controls.get('horizon').onchange();await flush();
    assert.equal(h.saved(),null,'changing a select must not persist or relabel the previously fixed session');
    h.mounted.exit({saveSession:true});assert.equal(h.saved().horizon,180,'explicit save preserves the fixed session settings, not the edited select');
    waiting.resolve(archive('later'));await flush();assert.equal(h.mounted.isActive(),false);assert.equal(h.restores(),1);
    assert.equal(h.svg.dataset.chartReplayActive,undefined);h.mounted.destroy();checks.push('settings identity and exit during load');
  }
  {
    let calls=0;const h=await harness(source,{loadArchive:()=>++calls===1?archive('first',{missing:[182]}):archive('second')});
    await h.mounted.open();await h.start();h.controls.get('next').onclick();h.controls.get('next').onclick();
    assert.equal(h.svg.dataset.replayCursor,dateAt(183));assert.equal(h.saved(),null);h.mounted.exit({saveSession:true});
    const saved=h.saved();assert.equal(saved.cursorDate,dateAt(183));await h.mounted.open({resume:saved});
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
    assert.equal(h.controls.get('pooled-retry').hidden,true);assert.equal(h.saved(),null);
    h.mounted.exit({saveSession:true});assert.equal(h.saved().model,'pooled');assert.equal(h.saved().origin,chosen);
    h.mounted.destroy();checks.push('unsupported ETH adaptive origin requires explicit pooled comparison at the same date');
  }
  {
    const dataset={prices:archive('current').observations.map(row=>[row.date,row.price])};
    const forecast={asOf:dateAt(184),referenceDate:dateAt(181),path:[{date:dateAt(184),price:284,lower:284,upper:284},{date:dateAt(185),price:300,lower:250,upper:350}]};
    const captured={dataset,forecast,start:dateAt(90),end:dateAt(700),chartType:'line',frequency:'daily',presentation:{scale:'log',unit:'usd'}};
    const baseline={dataset,forecast:{asOf:dateAt(180),referenceDate:dateAt(181),path:[{date:dateAt(180),price:280},{date:dateAt(181),price:290}]}};
    const h=await harness(source,{getAtlasContext:()=>captured,loadBaseline:async()=>baseline});
    await h.mounted.open();
    assert.equal(h.controls.get('mode').value,'atlas-chart');assert.equal(h.controls.get('display').value,'candles');
    assert.equal(h.controllers[0].getState().status,'paused');assert.equal(h.controls.get('date').value,dateAt(181));
    assert.deepEqual(h.factories,['current'],'one-click entry must capture the currently displayed forecast without reconstructing an earlier model');
    assert.deepEqual(h.builds[0].dataset,dataset);assert.deepEqual(h.builds[0].forecast,forecast);
    assert.notEqual(h.builds[0].dataset,dataset,'the replay owns a copy before async loading');assert.notEqual(h.builds[0].forecast,forecast);
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
    assert.equal(h.saved(),null);h.mounted.exit({saveSession:true});const saved=h.saved();await h.mounted.open({resume:saved});
    assert.equal(h.svg.dataset.replayCursor,dateAt(183));assert.equal(h.controllers[0].getState().status,'paused');
    assert.ok(h.factories.every(factory=>factory==='current'));assert.equal(JSON.stringify(h.draws.at(-1).data.frame.forecast),path);
    h.mounted.destroy();checks.push('current-chart entry, changed start date, playback and resume retain the original forecast and distinguish unknown actuals');
  }
  {
    const dataset={prices:archive('current').observations.map(row=>[row.date,row.price])};
    const forecast={asOf:dateAt(184),path:[{date:dateAt(184),price:284},{date:dateAt(185),price:300}]};
    const captured={dataset,forecast,start:dateAt(90),end:dateAt(700),chartType:'line',frequency:'daily',presentation:{scale:'log'}};
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
    assert.deepEqual(h.builds.at(-1).forecast,forecast);assert.deepEqual(h.factories,['current','project','historical','current']);
    h.mounted.destroy();checks.push('asynchronous mode changes keep the prior cutoff until the newly selected source is ready');
  }
  {
    const dataset={prices:archive('current').observations.map(row=>[row.date,row.price])};
    const baseline={dataset,forecast:{asOf:dateAt(180),referenceDate:dateAt(181),path:[{date:dateAt(180),price:280},{date:dateAt(181),price:290}]}};
    const captured={dataset,forecast:baseline.forecast,start:dateAt(90),end:dateAt(700),chartType:'line',frequency:'daily',presentation:{scale:'log'}};
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

if(process.argv.includes('--replay-ui-extra'))console.log(JSON.stringify(await verifyInteractionCase(Number(process.argv[process.argv.indexOf('--replay-ui-extra')+1]))));
else if(process.argv.includes('--replay-ui-child'))console.log(JSON.stringify(await verifyChartReplayUi()));
else{
  test('main replay coordinator guards source identity, exact resume, input boundaries and explicit model comparison',async t=>{
    const result=await verifyChartReplayUi();assert.equal(result.status,'pass');assert.equal(result.checks.length,9);
    for(const check of result.checks)t.diagnostic(check);
  });
  for(const [index,item]of interactionCases.entries())test(item.name,async()=>{
    const result=await verifyInteractionCase(index);assert.equal(result.status,'pass');assert.equal(result.name,item.name);assert.match(result.sourceSha256,/^[a-f0-9]{64}$/);
  });
}
