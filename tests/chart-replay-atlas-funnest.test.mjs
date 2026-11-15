import assert from 'node:assert/strict';
import test from 'node:test';
import {readFile} from 'node:fs/promises';
import {parseHTML} from 'linkedom';
import {buildLongHorizonForecast} from '../dist/long-horizon-forecast.js';
import {createAtlasReplayContext,drawAtlasChartReplay} from '../dist/chart-replay-atlas.js';

const archive=JSON.parse(await readFile(new URL('../dist/data/btc-daily.json',import.meta.url),'utf8'));
const forecast=buildLongHorizonForecast(archive,{scenario:'base'});
const origin='2026-10-20';
const presentation={band:true,scale:'log',unit:'usd',showCycleMarkers:true,showCycleIntervals:true,showTurns:true,showHistoricalEvents:true,showCycleTiming:true};
const context=createAtlasReplayContext({dataset:archive,forecast,presentation,originDate:origin});
const dateMs=date=>Date.parse(`${date}T00:00:00Z`);

async function fixture(){
  const {document,window}=parseHTML('<html><body><div id="stage"></div></body></html>');
  window.devicePixelRatio=1;
  const stage=document.getElementById('stage');stage.style.position='relative';stage.getBoundingClientRect=()=>({left:17,top:23,width:900,height:520});
  const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');svg.id='lab-chart';svg.getBoundingClientRect=()=>({left:17,top:23,width:900,height:520});stage.append(svg);
  const keys=['document','window','MutationObserver','ResizeObserver','matchMedia','getComputedStyle','requestAnimationFrame','cancelAnimationFrame'];
  const originals=new Map(keys.map(key=>[key,Object.getOwnPropertyDescriptor(globalThis,key)]));
  const originalCreate=document.createElement.bind(document);
  const context2d=new Proxy({canvas:null,measureText:value=>({width:String(value).length*6}),createLinearGradient:()=>({addColorStop(){}}),getImageData:()=>({data:new Uint8ClampedArray([1,2,3,255])})},{get:(target,key)=>key in target?target[key]:()=>{},set:(target,key,value)=>(target[key]=value,true)});
  document.createElement=(name,...args)=>{const node=originalCreate(name,...args);if(name==='div')node.getBoundingClientRect=()=>({left:17,top:23,width:900,height:520});if(name==='canvas')node.getContext=()=>{context2d.canvas=node;return context2d;};return node;};
  Object.assign(globalThis,{document,window,MutationObserver:window.MutationObserver,ResizeObserver:class{observe(){}disconnect(){}},matchMedia:()=>({addEventListener(){},removeEventListener(){}}),getComputedStyle:()=>({color:'',getPropertyValue:()=>''}),requestAnimationFrame:callback=>setTimeout(callback,0),cancelAnimationFrame:clearTimeout});
  return {stage,svg,restore(){for(const [key,descriptor] of originals)descriptor?Object.defineProperty(globalThis,key,descriptor):delete globalThis[key];}};
}
const observedRows=archive.prices.map(([date,price])=>({date,price}));
function replayData(cursorDate){return {originDate:origin,frequency:'daily',observedRows,observedCandles:[],priceSource:archive.meta.source,candleSource:archive.meta.source,
  frame:{cursorDate,inputVisible:true,forecastVisible:true,forecast:context.forecast.map(({date,price,lower,upper})=>({date,price,lower,upper}))}};}
async function waitForOverlay(svg,boundaryCount=null){
  for(let attempt=0;attempt<80;attempt++){
    if(svg.dataset.chartEngine==='funnest'&&(boundaryCount===null||Number(svg.dataset.replayBoundaryCount)===boundaryCount))return;
    await new Promise(resolve=>setTimeout(resolve,10));
  }
  assert.fail('Funnest replay overlay did not settle'+(boundaryCount===null?'':` with ${boundaryCount} boundaries`));
}

 test('active BTC replay mounts Funnest over a cursor-limited source, keeps frozen forecast and actual PaneCoords, then destroys/recreates cleanly',async()=>{
  const h=await fixture();let first,second;
  const liveHost=h.stage.ownerDocument.createElement('div');liveHost.className='atlas-funnest-canvas';liveHost.style.visibility='visible';h.stage.append(liveHost);
  const liveStatus=h.stage.ownerDocument.createElement('span');liveStatus.className='atlas-funnest-status';h.stage.append(liveStatus);
  try{
    const cursor='2026-10-22',data=replayData(cursor),before=observedRows.filter(row=>row.date<=cursor);
    first=drawAtlasChartReplay({svg:h.svg,session:{asOf:origin,mode:'current-chart-snapshot'},data,start:'2026-10-01',end:'2027-02-01',chartType:'line',context});
    await waitForOverlay(h.svg,3);
    assert.equal(first.engine,'funnest');assert.equal(h.svg.dataset.replayRenderer,'funnest');assert.equal(h.svg.dataset.chartEngine,'funnest');
    assert.equal(liveHost.style.visibility,'hidden');assert.equal(liveHost.getAttribute('aria-hidden'),'true');assert.equal(liveStatus.hidden,true);
    assert.equal(h.svg.querySelectorAll('.price-series-layer').length,0,'no legacy observed-price path remains active');
    assert.equal(first.chart.store.bars.length,before.length,'only prices visible through the current replay cursor are mounted');
    assert.deepEqual(first.chart.store.bars.map(row=>row.time),before.map(row=>dateMs(row.date)));
    assert.equal(h.svg.dataset.replayObservedCount,String(before.length));
    assert.equal(h.svg.dataset.replayForecastPoints,String(data.frame.forecast.length));
    const forecastRow=context.forecast.find(row=>row.date>cursor);assert.ok(forecastRow);
    assert.equal(h.svg.querySelectorAll('[data-replay-boundary]').length,3);
    assert.ok(Number(h.svg.dataset.replayCycleTimingCount)>0);
    const x=first.x(cursor),rect=h.svg.getBoundingClientRect(),viewWidth=Number(h.svg.getAttribute('viewBox').split(/\s+/)[2]);
    assert.ok(Number.isFinite(x)&&x>=0&&x<first.getPriceScale().right);
    const clientX=rect.left+x/viewWidth*rect.width;
    assert.equal(first.dateAt(clientX),cursor,'pixel input maps to the nearest real observed Funnest time');
    assert.equal(first.barDateAt(clientX),cursor);
    const descriptor=Object.getOwnPropertyDescriptor(first.host,'getAtlasFunnestSnapshot');
    assert.equal(descriptor.writable,false);assert.equal(descriptor.configurable,true);
    const snapshot=first.host.getAtlasFunnestSnapshot();assert.equal(snapshot.engine,'funnest');assert.notEqual(snapshot,first.chart);
    assert.equal(snapshot.chartType,'line');assert.equal(snapshot.settings.priceScale,'log');assert.equal(snapshot.settings.volume,false);
    assert.ok(snapshot.layout.panes.some(pane=>pane.kind==='main'&&Number.isFinite(pane.top)&&Number.isFinite(pane.height)));
    const savedClose=snapshot.engineBars.at(0).close;snapshot.engineBars[0].close=0;snapshot.settings.volume=true;
    const freshSnapshot=first.host.getAtlasFunnestSnapshot();
    assert.equal(freshSnapshot.engineBars[0].close,savedClose,'inspection is a detached copy, not the live engine state');
    assert.equal(freshSnapshot.settings.volume,false,'public settings are copied rather than exposed by reference');
    first.selectDate(forecastRow.date);
    assert.equal(first.getSelection().actual,null);assert.equal(first.getSelection().originalPredicted,forecastRow.price);
    assert.equal(first.getSelection().predictedKind,'original','inspection identifies the unchanged captured path, not a recomputed value');
    const oldHost=first.host;
    second=drawAtlasChartReplay({svg:h.svg,session:{asOf:origin,mode:'current-chart-snapshot'},data:replayData('2026-10-23'),start:'2026-10-01',end:'2027-02-01',chartType:'line',context});
    await waitForOverlay(h.svg,3);
    assert.equal(oldHost.isConnected,false,'recreate removes the prior Funnest chart host');assert.equal(second.host.isConnected,true);
    first.destroy();assert.equal(second.host.isConnected,true,'stale destroy cannot tear down its replacement');
    second.destroy();assert.equal(second.host.isConnected,false);assert.equal(Object.hasOwn(second.host,'getAtlasFunnestSnapshot'),false);assert.equal(h.svg.querySelector('[data-funnest-hit-targets]'),null);
    assert.equal(liveHost.style.visibility,'visible');assert.equal(liveHost.getAttribute('aria-hidden'),null);assert.equal(liveStatus.hidden,false,'returning to live restores its prior mounted host/status state');
  }finally{first?.destroy();second?.destroy();h.restore();}
});

test('weekly candle replay maps bar picking to the source period opening date and selection preview suppresses Funnest hit targets',async()=>{
  const h=await fixture();let chart;
  try{
    const weeks=new Map();
    for(const [date,price] of archive.prices)if(date>='2026-10-01'&&date<='2026-11-01'){
      const epoch=Date.parse(`${date}T00:00:00Z`),monday=new Date(epoch-((new Date(epoch).getUTCDay()+6)%7)*86_400_000).toISOString().slice(0,10);
      weeks.set(monday,{monday,date,price});
    }
    const weekly=[...weeks.values()].map(({monday,date,price})=>{const open=price*.98,close=price,high=price*1.03,low=price*.96;
      return {time:Math.floor(Date.parse(`${monday}T00:00:00Z`)/1000),date,startDate:monday,endDate:date,periodStartDate:monday,open,high,low,close,volume:0};});
    const cursor='2026-10-25',rows=weekly.map(row=>({date:row.date,price:row.close}));
    const data={...replayData(cursor),frequency:'weekly',observedRows:rows,observedCandles:weekly.map(row=>({...row,complete:true})),
      frame:{...replayData(cursor).frame,forecast:context.forecast.map(({date,price,lower,upper})=>({date,price,lower,upper}))}};
    let inspected=0;
    chart=drawAtlasChartReplay({svg:h.svg,session:{asOf:origin},data,start:'2026-10-01',end:'2027-02-01',chartType:'candles',context,selectionPreview:true,onInspect:()=>inspected++});
    await waitForOverlay(h.svg,0);
    assert.equal(h.svg.dataset.observedMode,'ohlc');assert.equal(h.svg.dataset.replaySelectionPreview,'true');
    assert.equal(h.svg.querySelectorAll('[data-replay-boundary]').length,0);
    assert.equal(h.svg.querySelectorAll('[data-btc-overlay-target]').length,0,'start selection does not expose chart-specific click targets');
    const visibleBar=weekly.filter(row=>row.endDate<=cursor).at(-1),date=visibleBar.endDate,x=chart.x(visibleBar.startDate),rect=h.svg.getBoundingClientRect(),viewWidth=Number(h.svg.getAttribute('viewBox').split(/\s+/)[2]);
    const clientX=rect.left+x/viewWidth*rect.width;
    assert.equal(chart.dateAt(clientX),date);assert.equal(chart.barDateAt(clientX),visibleBar.startDate,'weekly candle picking uses the actual period-open coordinate');
    chart.previewPointer({clientX,clientY:rect.top+100,pointerId:1,pointerType:'mouse'});
    assert.equal(inspected,0,'selection preview leaves interaction ownership with the replay coordinator');
  }finally{chart?.destroy();h.restore();}
});
