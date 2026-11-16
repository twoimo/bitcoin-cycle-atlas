import assert from 'node:assert/strict';
import test from 'node:test';
import {readFile} from 'node:fs/promises';
import {parseHTML} from 'linkedom';
import {buildLongHorizonForecast} from '../dist/long-horizon-forecast.js';
import {createAtlasReplayContext,drawAtlasChartReplay} from '../dist/chart-replay-atlas.js';
import {svgFixture} from './replay-svg-fixture.mjs';

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

test('the Funnest render snapshot reports the frame cursor it discloses through and the source of each painted turn',async()=>{
  const h=await fixture();let chart;
  try{
    const cursor='2026-10-22';
    for(const selectionPreview of [false,true]){
      chart=drawAtlasChartReplay({svg:h.svg,session:{asOf:origin,mode:'current-chart-snapshot'},data:replayData(cursor),start:'2026-10-01',end:'2027-02-01',chartType:'line',context,selectionPreview});
      await waitForOverlay(h.svg,selectionPreview?0:3);
      const frame=chart.host.getAtlasBtcRenderSnapshot();
      assert.equal(frame.replay.selectionPreview,selectionPreview);
      assert.equal(frame.replay.cursorDate,cursor,'reselecting a start previews over a committed cursor, so a preview frame still reports the cursor it discloses through');
      assert.ok(frame.observed.rows.length>0&&frame.observed.rows.every(row=>row.date<=cursor));
      const observed=frame.paint.turns.filter(turn=>turn.replaySource==='observed'),assumed=frame.paint.turns.filter(turn=>turn.replaySource==='forecast');
      assert.equal(observed.length+assumed.length,frame.paint.turns.length,'every painted turn names its replay source');
      assert.ok(observed.length>0&&observed.every(turn=>turn.date<=origin),'observed turns end at the replay origin');
      assert.ok(assumed.length>0&&assumed.every(turn=>turn.date>context.forecastOrigin),'assumed turns belong to the fixed forecast');
    }
  }finally{chart?.destroy();h.restore();}
});

test('the Funnest replay labels the retrospective path at its own frozen input anchor',async()=>{
  const h=await fixture();let chart;
  try{
    const anchor=archive.prices.find(row=>row[0]===origin)[1],days=Math.round((dateMs(forecast.asOf)-dateMs(origin))/86_400_000);
    const record={kind:'atlas-replay-retrospective-forecast',schemaVersion:1,status:'ready',asOf:origin,displayEnd:forecast.asOf,createdAt:'2026-11-01T02:00:00.000Z',issuedAt:null,
      inputHash:'a'.repeat(64),outputHash:'b'.repeat(64),modelVersion:'renderer-fixture',modelOptions:{},publicationTimeProven:false,forecastScoringEnabled:false,
      path:Array.from({length:days+1},(_,i)=>{const price=anchor*(1+i*.003);return {date:new Date(dateMs(origin)+i*86_400_000).toISOString().slice(0,10),price,lower:price*.9,upper:price*1.12};})};
    const paint=async({start='2026-10-01',priceDomain={min:anchor*.5,max:anchor*2}}={})=>{
      const captured=createAtlasReplayContext({dataset:archive,forecast,presentation:{...presentation,priceDomain},originDate:origin,retrospectiveForecast:record});
      const data={...replayData('2026-10-22'),frame:{...replayData('2026-10-22').frame,forecast:captured.forecast.map(({date,price,lower,upper})=>({date,price,lower,upper})),retrospectiveForecast:record.path}};
      chart=drawAtlasChartReplay({svg:h.svg,session:{asOf:origin,mode:'current-chart-snapshot'},data,start,end:'2027-02-01',chartType:'line',context:captured});
      await waitForOverlay(h.svg,start>origin?2:3);
      return h.svg.querySelector('[data-replay-retrospective-origin-label]');
    };
    const marker=await paint(),label=marker?.querySelector('[data-replay-retrospective-input-date]');
    assert.ok(marker,'the fixed retrospective path discloses its input date on the chart');
    assert.equal(label.textContent,`회고 · 입력 ${origin}`);assert.equal(marker.dataset.inputThrough,origin);
    assert.equal(marker.getAttribute('pointer-events'),'none');assert.equal(marker.querySelector('rect'),null,'the input date is an annotation, not a price-difference badge');
    const first=chart.host.getAtlasBtcRenderSnapshot().paint.paths.retrospective.subpaths[0][0],axis=chart.getPriceScale();
    assert.equal(first.date,origin);
    assert.ok(Math.abs(Number(marker.dataset.anchorX)-chart.x(origin))<.011&&Math.abs(Number(marker.dataset.anchorX)-first.x)<.011,'the label anchors at the path origin date');
    assert.ok(Math.abs(Number(marker.dataset.anchorY)-first.y)<.011,'the label anchors at the path origin price');
    const tx=Number(label.getAttribute('x')),ty=Number(label.getAttribute('y'));
    assert.ok(tx>=axis.left+4&&tx<=axis.right-4);assert.ok(ty>=axis.top+14&&ty<=axis.bottom-4);
    assert.equal(label.getAttribute('font-size'),'11');
    assert.equal(await paint({start:'2026-10-21'}),null,'panning past the origin does not move its date label to another point');
    assert.ok(chart.host.getAtlasBtcRenderSnapshot().paint.paths.retrospective.subpaths.flat().length>1,'the path itself stays painted after the pan');
    assert.equal(await paint({priceDomain:{min:anchor*1.5,max:anchor*3}}),null,'an off-scale origin is not relabelled at an invented boundary price');
  }finally{chart?.destroy();h.restore();}
});

test('a start before the first disclosed bar paints the empty price viewport instead of failing the replay',()=>{
  const {svg}=svgFixture(1440,760),empty={...replayData(origin),observedRows:[],observedCandles:[]};
  const chart=drawAtlasChartReplay({svg,session:{asOf:origin,mode:'current-chart-snapshot'},data:empty,start:'2026-10-01',end:'2026-10-25',chartType:'candles',context});
  try{
    assert.equal(chart.engine,undefined,'no Funnest chart is mounted without an observed bar');
    assert.equal(svg.dataset.replayRenderer,'atlas');assert.equal(svg.dataset.observedCandleCount,'0');assert.equal(svg.dataset.replayActualCount,'0');
    assert.ok(svg.querySelector('.chart-empty-message'),'the empty viewport says that no price row is shown');
    assert.equal(svg.querySelectorAll('.observed-candle,.observed-close-line,.market-close-line').length,0,'no price row is invented');
    const axis=chart.getPriceScale();
    assert.ok(Number.isFinite(axis.min)&&Number.isFinite(axis.max)&&axis.min<axis.max&&axis.right>axis.left&&axis.bottom>axis.top,'the empty viewport keeps a real price axis');
    assert.equal(svg.querySelectorAll('[data-replay-origin-boundary]').length,1);assert.equal(svg.querySelectorAll('[data-replay-cursor-line]').length,1);
    const x=chart.x(origin);assert.ok(Number.isFinite(x)&&x>axis.left&&x<axis.right,'the committed origin stays on the real time axis');
  }finally{chart.destroy();}
});

test('the Funnest replay host stacks as one layer below the SVG replay input surface',async()=>{
  const h=await fixture();let chart;
  try{
    chart=drawAtlasChartReplay({svg:h.svg,session:{asOf:origin,mode:'current-chart-snapshot'},data:replayData('2026-10-22'),start:'2026-10-01',end:'2027-02-01',chartType:'line',context,selectionPreview:true});
    await waitForOverlay(h.svg,0);
    const inputCanvas=[...chart.host.querySelectorAll('canvas')].at(-1),svgLayer=Number(h.svg.style.zIndex),hostLayer=Number(chart.host.style.zIndex);
    assert.ok(inputCanvas&&Number(inputCanvas.style.zIndex)>svgLayer,'the pinned runtime raises its input canvas above the SVG layer number inside the host');
    assert.equal(chart.host.style.position,'absolute');
    assert.ok(chart.host.style.zIndex!==''&&Number.isInteger(hostLayer),'the replay host owns a stacking context, so its raised input canvas cannot cover the replay SVG');
    assert.ok(svgLayer>hostLayer,'the replay coordinator accepts pointers on the SVG, so the SVG stacks above the whole Funnest replay host');
  }finally{chart?.destroy();h.restore();}
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
