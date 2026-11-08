import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import {createChartRenderSnapshot,drawAtlasPriceChart,forecastValueSignature} from '../dist/atlas-price-chart.js';
import {drawIntradayChart} from '../dist/intraday-chart.js';
import {mountBtcRefreshStatus} from '../dist/btc-refresh-status.js';
import {createForecastComputation} from '../dist/forecast-computation.js';
import {svgFixture} from './replay-svg-fixture.mjs';

const source=readFileSync(new URL('../dist/lab-view.js',import.meta.url),'utf8');
const drawOutlook=source.match(/^  function drawOutlook\(\)\{[\s\S]*?^  \}/m)?.[0];
assert.ok(drawOutlook,'Execute the real pending-forecast branch of the BTC controller');
const rows=Object.freeze(Array.from({length:7},(_,i)=>Object.freeze({date:`2026-11-${String(i+4).padStart(2,'0')}`,price:100+i*5,lower:95+i*5,upper:105+i*5,kind:i<3?'observed':'simulated'})));
const forecast=Object.freeze(rows.slice(3));

function allocatedChart(width,height){
  const fixture=svgFixture(width,height),{svg}=fixture;
  svg.getBoundingClientRect=()=>({left:0,top:0,width:svg.clientWidth,height:svg.clientHeight});
  return fixture;
}
function refreshNotice(svg,fullHeight){
  const nodes=new Map(),values=new Map();
  for(const id of ['main','btc-refresh-notice','btc-refresh-summary','btc-refresh-detail','btc-refresh-retry','btc-refresh-announcement'])nodes.set(id,{hidden:true,dataset:{},textContent:'',setAttribute(){},addEventListener(){},removeEventListener(){},contains(){return false;}});
  const notice=nodes.get('btc-refresh-notice');notice.getBoundingClientRect=()=>({height:notice.hidden?0:svg.clientWidth<=620?53:45});
  const doc={getElementById:id=>nodes.get(id),documentElement:{style:{getPropertyValue:name=>values.get(name),setProperty(name,value){values.set(name,value);if(name==='--btc-refresh-height')svg.clientHeight=fullHeight-parseFloat(value);}}}};
  return {notice,nodes,status:mountBtcRefreshStatus({document:doc,now:()=>new Date('2026-11-08T15:00:00Z')})};
}
function pendingController(snapshot,svg,{centerTool,visible=true,replay=false}={}){
  let worker,promise;
  const computer=createForecastComputation({compute(){throw new Error('The new model must remain pending until the worker replies');},workerFactory:()=>worker={terminated:false,postMessage(message){this.message=message;},terminate(){this.terminated=true;},reply(model){this.onmessage({data:{...this.message,status:'ready',model}});}}});
  const nextDataset=Object.freeze({prices:Object.freeze([Object.freeze(['2026-11-07',777])])});
  const state={dataset:nextDataset,visible,scenario:'base',requestedScenario:'base',models:new Map(),priceController:snapshot?.controller};
  if(replay)svg.dataset.chartReplayActive='true';
  const paint=vm.runInNewContext('('+drawOutlook+')',{state,forecastComputer:computer,priceSnapshot:snapshot,document:{body:{dataset:centerTool?{centerTool}:{}}},$:()=>svg,
    requestForecast(scenario){promise??=computer.run(nextDataset,{scenario},{revision:2});},fail(error){throw error;}});
  return {state,paint,computer,get worker(){return worker;},get promise(){return promise;}};
}
const dailyOptions=svg=>({svg,rows,forecastIdentityRows:forecast,start:'2026-11-04',end:'2026-11-10',split:'2026-11-06',selectedDate:'2026-11-05',showDrawdown:false,showVolume:false,showTurns:false,headerInset:18});

for(const [width,fullHeight,noticeHeight]of [[1335,820,45],[390,752,53],[320,648,53],[390,338,53]]){
  test(`pending dataset refresh reflows its previous complete chart after the ${noticeHeight}px notice closes at ${width}×${fullHeight}`,async t=>{
    const {svg,flush}=allocatedChart(width,fullHeight),refresh=refreshNotice(svg,fullHeight);
    refresh.status.update({phase:'refreshing',asOf:'2026-11-06'});
    assert.equal(svg.clientHeight,fullHeight-noticeHeight);
    const calls=[],hover=[],inspect=[],presentations=[];
    const input={...dailyOptions(svg),onHover:value=>hover.push(value),onInspect:value=>inspect.push(value)};
    const snapshot=createChartRenderSnapshot(options=>{calls.push(options);return drawAtlasPriceChart(options);},input,()=>presentations.push('previous-indicators'));
    snapshot.controller.selectDate('2026-11-05');
    const before={...svg.dataset},selection=snapshot.controller.getDate(),published=[hover.length,inspect.length];
    const pending=pendingController(snapshot,svg);t.after(()=>pending.computer.destroy());pending.paint();
    assert.equal(pending.computer.pending(),true);assert.equal(calls.length,1,'Unchanged allocation does not redraw');
    refresh.status.update({phase:'checked',asOf:'2026-11-07'});
    assert.equal(refresh.notice.hidden,true);assert.match(refresh.nodes.get('btc-refresh-announcement').textContent,/2026\.11\.07 UTC/,'The new provider timestamp stays truthful while its model computes');
    assert.equal(svg.clientHeight,fullHeight);assert.notEqual(svg.getAttribute('viewBox'),`0 0 ${width} ${fullHeight}`,'Reproduce the actual post-notice, pre-reflow mismatch');
    pending.paint();
    assert.equal(pending.computer.pending(),true,'Reflow must not wait for or compute the new model');
    assert.equal(svg.getAttribute('viewBox'),`0 0 ${width} ${fullHeight}`);
    assert.equal(calls.length,2);assert.equal(pending.state.priceController,snapshot.controller);
    assert.equal(calls[1].rows,rows);assert.equal(calls[1].forecastIdentityRows,forecast);assert.equal(calls[1].split,'2026-11-06');
    for(const name of ['start','end','interval','forecastValueSignature','observedLineCount','priceMin','priceMax'])assert.equal(svg.dataset[name],before[name],name+' must remain owned by the displayed snapshot');
    assert.equal(svg.dataset.forecastValueSignature,forecastValueSignature(forecast));
    assert.equal(snapshot.controller.getDate(),selection);assert.deepEqual([hover.length,inspect.length],published,'Repaint cannot publish into the pending dataset owner');
    assert.deepEqual(presentations,['previous-indicators']);
    pending.paint();assert.equal(calls.length,2,'Repeated pending notifications at the same size do not repaint');
    svg.onpointermove({clientX:Number(svg.dataset.plotLeft)+30,clientY:100,pointerType:'mouse',target:svg});flush();
    assert.ok(hover.length>published[0],'Real pointer callbacks remain active after the geometry-only repaint');
    snapshot.controller.selectDate('2026-11-06');assert.ok(inspect.length>published[1]);
    const completed=Object.freeze({asOf:'2026-11-07',scenario:{id:'base'},path:Object.freeze([Object.freeze({date:'2026-11-08',price:900})])});
    pending.worker.reply(completed);const result=await pending.promise;
    assert.equal(result.status,'ready');assert.equal(result.model,completed);assert.equal(pending.worker.terminated,true,'Completed workers release their transport and timer');
    const nextRows=Object.freeze([Object.freeze({date:'2026-11-07',price:777,kind:'observed'}),Object.freeze({date:'2026-11-08',price:900,kind:'simulated'})]);
    const next=createChartRenderSnapshot(drawAtlasPriceChart,{...dailyOptions(svg),rows:nextRows,forecastIdentityRows:completed.path,split:'2026-11-07',start:'2026-11-07',end:'2026-11-08',selectedDate:'2026-11-07',onHover:value=>hover.push(value)});
    assert.equal(svg.dataset.forecastValueSignature,forecastValueSignature(completed.path));assert.equal(next.controller.getDate(),'2026-11-07');assert.equal(hover.at(-1).price,777,'A completed replacement publishes its own new observation/model pair');
    pending.computer.destroy();
  });
}

test('hourly selection, source bars and callbacks survive pending-model reflow without adopting a new interval',async t=>{
  const {svg}=allocatedChart(390,699),start=Date.parse('2026-11-06T00:00:00Z')/1000;
  const candles=Object.freeze(Array.from({length:5},(_,i)=>Object.freeze({time:start+i*3600,date:new Date((start+i*3600)*1000).toISOString(),open:100+i,high:105+i,low:99+i,close:102+i,volume:10+i})));
  const series=Object.freeze({candles,interval:'1h',source:'Coinbase Exchange',product:'BTC-USD',retrievedAt:'2026-11-07T00:00:00Z'}),calls=[],hover=[];
  const snapshot=createChartRenderSnapshot(options=>{calls.push(options);return drawIntradayChart(options);},{svg,series,selectedTime:candles[2].time,showVolume:false,onHover:value=>hover.push(value)});
  snapshot.controller.selectDate(candles[1].date);const before={...svg.dataset},count=hover.length;
  const pending=pendingController(snapshot,svg);t.after(()=>pending.computer.destroy());pending.paint();svg.clientHeight=752;pending.paint();
  assert.equal(svg.getAttribute('viewBox'),'0 0 390 752');assert.equal(snapshot.controller.getDate(),candles[1].date);
  assert.equal(calls.at(-1).series,series);assert.equal(calls.at(-1).selectedTime,candles[1].date);
  for(const key of ['start','end','interval','product','observedCandleCount','priceMin','priceMax'])assert.equal(svg.dataset[key],before[key]);
  assert.equal(hover.length,count);snapshot.controller.selectDate(candles[4].date);assert.equal(hover.at(-1).time,candles[4].time);
  pending.computer.cancel();assert.equal((await pending.promise).status,'superseded');assert.equal(pending.worker.terminated,true);pending.computer.destroy();
});

test('weekly reflow retains its original scenario and focused evidence while another scenario computes',async t=>{
  const {svg}=allocatedChart(390,699),hover=[],evidence=Object.freeze([{id:'original-evidence',date:'2026-11-08',price:120,title:'원래 근거',description:'완료된 모형의 근거'}]);
  const input={...dailyOptions(svg),frequency:'weekly',scenarioId:'base',forecastEvidence:evidence,onHover:value=>hover.push(value)};
  const draws=[],snapshot=createChartRenderSnapshot(options=>{
    draws.push(options);const controller=drawAtlasPriceChart(options);
    for(const node of svg.querySelectorAll('[tabindex]'))node.focus=()=>{svg.ownerDocument.activeElement=node;};
    return controller;
  },input);
  const original=svg.querySelector('[data-forecast-evidence="original-evidence"]');assert.ok(original);original.focus();
  const pending=pendingController(snapshot,svg);t.after(()=>pending.computer.destroy());pending.state.requestedScenario='stress';pending.paint();
  assert.equal(pending.worker.message.options.scenario,'stress');svg.clientHeight=752;pending.paint();
  assert.equal(draws.at(-1).scenarioId,'base');assert.equal(draws.at(-1).forecastEvidence,evidence);assert.equal(svg.dataset.interval,'weekly');
  const restored=svg.ownerDocument.activeElement;assert.notEqual(restored,original);assert.equal(restored,svg.querySelector('[data-forecast-evidence="original-evidence"]'));
  input.onHover=()=>{throw new Error('Mutating the caller options must not replace captured callbacks');};
  snapshot.controller.selectDate('2026-11-06');assert.ok(hover.length>1);
  pending.computer.cancel();await pending.promise;pending.computer.destroy();
});

test('pending geometry never redraws replay, an inactive owner, a hidden or zero-size SVG, or a missing snapshot',async t=>{
  for(const state of [{replay:true},{visible:false},{centerTool:'rsi'}]){
    const {svg}=allocatedChart(390,699);let paints=0;
    const snapshot=createChartRenderSnapshot(options=>{paints++;return drawAtlasPriceChart(options);},dailyOptions(svg));
    svg.clientHeight=752;const pending=pendingController(snapshot,svg,state);t.after(()=>pending.computer.destroy());pending.paint();
    assert.equal(paints,1,JSON.stringify(state));pending.computer.cancel();if(pending.promise)await pending.promise;pending.computer.destroy();
  }
  for(const blocked of ['hidden','inert','zero','css-hidden']){
    const {svg}=allocatedChart(390,699);let paints=0;
    const snapshot=createChartRenderSnapshot(options=>{paints++;return drawAtlasPriceChart(options);},dailyOptions(svg));svg.clientHeight=752;
    if(blocked==='zero')svg.clientHeight=0;else if(blocked==='css-hidden')svg.ownerDocument.defaultView.getComputedStyle=()=>({visibility:'hidden'});else svg[blocked]=true;
    assert.equal(snapshot.reflow(),false);assert.equal(paints,1,blocked);
  }
  const {svg}=allocatedChart(390,752),pending=pendingController(null,svg);t.after(()=>pending.computer.destroy());pending.paint();assert.equal(svg.getAttribute('viewBox'),null);
  pending.computer.cancel();await pending.promise;pending.computer.destroy();
});
