import assert from 'node:assert/strict';

// These functions run in the actual document (or its active iframe). They only
// read rendered geometry/state. All gestures below enter through native CDP.
export async function readChart({svgSelector,allocationSelector}) {
  const svg=document.querySelector(svgSelector),owner=document.querySelector(allocationSelector),plot=svg?.closest('.atlas-plot'),host=plot?.querySelector('.atlas-funnest-canvas');
  if(!svg||!owner||!host||typeof host.getAtlasFunnestSnapshot!=='function')return null;
  const snapshot=host.getAtlasFunnestSnapshot(),layout=snapshot.layout,range=snapshot.range,bars=snapshot.engineBars||[],rect=node=>{const b=node.getBoundingClientRect();return {left:b.left,top:b.top,width:b.width,height:b.height,right:b.right,bottom:b.bottom};};
  const box=rect(host),overlayBox=rect(svg),hostBox=box,frequency=document.querySelector('#workbench-interval-select')?.value||document.querySelector('[data-lab-frequency][aria-pressed="true"]')?.dataset.labFrequency||'daily';
  const timeSpan=range&&Number(range.to)-Number(range.from),first=Number(range?.from),last=Number(range?.to),plotWidth=Number(layout?.plotWidth),layoutWidth=Number(layout?.width),layoutHeight=Number(layout?.height),panes=layout?.panes||[],main=panes.find(pane=>pane.kind==='main'),timeAxisHeight=Number(layout?.timeAxisHeight);
  const mapX=value=>hostBox.left+value/layoutWidth*hostBox.width,mapY=value=>hostBox.top+value/layoutHeight*hostBox.height;
  const mainTop=Number(main?.top),mainBottom=mainTop+Number(main?.height),timeTop=Number(layout?.panesHeight),timeBottom=timeTop+timeAxisHeight;
  const hit=point=>{if(!Number.isFinite(point.x)||!Number.isFinite(point.y))return false;const node=document.elementFromPoint(point.x,point.y);return Boolean(node&&(node===svg||svg.contains(node)||node===host||host.contains(node))&&!node.closest('button,a,input,select,textarea,[role="button"],[role="menuitem"]'));};
  const pick=points=>points.find(hit)||null,plotLeft=mapX(0),plotRight=mapX(plotWidth),plotTop=mapY(mainTop),plotBottom=mapY(mainBottom);
  const points={
    plot:pick([.3,.45,.6].flatMap(fx=>[.45,.6,.3].map(fy=>({x:mapX(plotWidth*fx),y:mapY(mainTop+(mainBottom-mainTop)*fy)})))),
    price:pick([.4,.6,.3].map(fy=>({x:mapX(plotWidth+(layoutWidth-plotWidth)*.55),y:mapY(mainTop+(mainBottom-mainTop)*fy)}))),
    time:pick([.38,.28,.48].map(fx=>({x:mapX(plotWidth*fx),y:mapY(timeTop+(timeBottom-timeTop)*.5)}))),
  };
  const canvases=[...host.querySelectorAll('canvas')].map(canvas=>{
    const r=rect(canvas),context=canvas.getContext('2d');let readable=false,opaque=0,colors=new Set(),hash=2166136261,image=null,mainHash=2166136261,axisHash=2166136261,axisOpaque=0,axisColors=new Set();
    try{image=context?.getImageData(0,0,canvas.width,canvas.height)||null;if(image){const data=image.data;readable=true;const stride=Math.max(4,Math.floor(data.length/16000/4)*4);for(let i=0;i<data.length;i+=stride){const color=`${data[i]},${data[i+1]},${data[i+2]},${data[i+3]}`;colors.add(color);if(data[i+3])opaque++;for(let j=0;j<4;j++){hash^=data[i+j]||0;hash=Math.imul(hash,16777619);}}const x1=Math.min(canvas.width,Math.max(0,Math.round(plotWidth/layoutWidth*canvas.width))),y0=Math.min(canvas.height,Math.max(0,Math.round(mainTop/layoutHeight*canvas.height))),y1=Math.min(canvas.height,Math.max(y0+1,Math.round(mainBottom/layoutHeight*canvas.height))),step=Math.max(4,Math.floor(((x1*4)*(y1-y0))/16000/4)*4);for(let y=y0;y<y1;y++)for(let x=0;x<x1;x+=Math.max(1,step/4)){const i=(y*canvas.width+x)*4;for(let j=0;j<4;j++){mainHash^=data[i+j]||0;mainHash=Math.imul(mainHash,16777619);}}const axisStep=Math.max(1,Math.floor((canvas.width-x1)*(y1-y0)/12000));for(let y=y0;y<y1;y++)for(let x=x1;x<canvas.width;x+=axisStep){const i=(y*canvas.width+x)*4;axisColors.add(`${data[i]},${data[i+1]},${data[i+2]},${data[i+3]}`);if(data[i+3])axisOpaque++;for(let j=0;j<4;j++){axisHash^=data[i+j]||0;axisHash=Math.imul(axisHash,16777619);}}}}catch{}
    return {width:canvas.width,height:canvas.height,box:r,visible:Boolean(canvas.isConnected&&r.width>0&&r.height>0),readable,opaquePixels:opaque,sampledColors:colors.size,pixelHash:(hash>>>0).toString(16),mainPanePixelHash:image?(mainHash>>>0).toString(16):null,axisGutterPixelHash:image?(axisHash>>>0).toString(16):null,axisGutterOpaquePixels:axisOpaque,axisGutterColors:axisColors.size};
  });
  const symbolStem=String(snapshot.symbol||'').toLowerCase().replace(/-?usd$/i,'');
  const archiveUrl=snapshot.symbol==='BTCUSD'?(snapshot.sourceMode==='ohlc'?'./data/btc-ohlc.json':'./data/btc-daily.json'):`./data/${symbolStem}-ohlc.json`;
  const response=await fetch(new URL(archiveUrl,location.href),{credentials:'omit',cache:'force-cache'});if(!response.ok)throw new Error('Chart source archive HTTP '+response.status+' '+archiveUrl);
  const archive=await response.json();let sourceRows=[];
  if(snapshot.symbol==='BTCUSD'&&snapshot.sourceMode==='close-only')sourceRows=(archive.prices||[]).map(([date,close])=>({time:Date.parse(`${date}T00:00:00Z`),close}));
  else if(snapshot.symbol==='BTCUSD')sourceRows=archive.intervals?.[frequency]?.candles||[];
  else sourceRows=archive.dailyHistory?.candles||archive.candles||archive.intervals?.daily?.candles||[];
  const sourceTime=row=>{const time=Number(row.time);return Number.isFinite(time)?time>100_000_000_000?time:time*1000:Date.parse(`${String(row.date).slice(0,10)}T00:00:00Z`);};
  const sourceMap=new Map(sourceRows.map(row=>[sourceTime(row),row]));
  const ratios=[],missing=[],volumeMismatches=[],valueMismatches=[];
  for(const bar of bars){const original=sourceMap.get(Number(bar.time));if(!original){missing.push(bar.time);continue;}
    for(const key of ['open','high','low','close'])if(Number.isFinite(original[key])&&Number.isFinite(bar[key]))ratios.push({key,ratio:bar[key]/original[key],source:original[key],rendered:bar[key]});
    if(Number.isFinite(original.volume)&&bar.volume!==undefined&&bar.volume!==original.volume)volumeMismatches.push({time:bar.time,source:original.volume,rendered:bar.volume});
  }
  let priceScale=null,priceOffset=null,scaleConsistent=ratios.length>1;
  if(ratios.length){const close=ratios.find(row=>row.key==='close')||ratios[0],second=ratios.find(row=>row.key===close.key&&row.source!==close.source);if(second){priceScale=(second.rendered-close.rendered)/(second.source-close.source);priceOffset=close.rendered-priceScale*close.source;for(const item of ratios){const expected=priceScale*item.source+priceOffset,tolerance=Math.max(1e-7,Math.abs(expected)*1e-9);if(Math.abs(item.rendered-expected)>tolerance){scaleConsistent=false;valueMismatches.push({key:item.key,source:item.source,rendered:item.rendered,expected});}}}}
  let closeSourceMismatches=[],volumeSourceMismatches=[];
  if(snapshot.sourceMode==='close-only'){
    for(const observation of snapshot.observations||[]){const source=sourceMap.get(Number(observation.time));if(!source||source.close!==observation.close)closeSourceMismatches.push(observation.time);}
    if(bars.some(bar=>bar.volume!==undefined)){
      const volumeResponse=await fetch(new URL('./data/btc-volume.json',location.href),{credentials:'omit',cache:'force-cache'});if(!volumeResponse.ok)throw new Error('BTC volume archive HTTP '+volumeResponse.status);
      const volumeArchive=await volumeResponse.json(),volumeMap=new Map((volumeArchive.bars||[]).map(row=>[Number(row.time)*1000,row.volume]));
      for(const bar of bars)if(bar.volume!==undefined&&volumeMap.get(bar.time)!==bar.volume)volumeSourceMismatches.push(bar.time);
    }
  }
  const barIdentity=JSON.stringify(bars.map(bar=>[bar.time,bar.open,bar.high,bar.low,bar.close,bar.volume??null]));let barHash=2166136261;for(let i=0;i<barIdentity.length;i++){barHash^=barIdentity.charCodeAt(i);barHash=Math.imul(barHash,16777619);}
  const gaps=bars.slice(1).map((bar,index)=>bar.time-bars[index].time).filter(value=>value>0),intervalMs=frequency==='weekly'?604_800_000:frequency==='daily'?86_400_000:Math.min(...gaps);
  const sourceCheck={archiveUrl,archiveProduct:archive.product||archive.meta?.product||archive.symbol||null,sourceRows:sourceRows.length,engineBars:bars.length,matched:bars.length-missing.length,missing,volumeMismatches,volumeSourceMismatches,valueMismatches,closeSourceMismatches,priceScale,priceOffset,scaleConsistent,barHash:(barHash>>>0).toString(16)};
  return {engine:snapshot.engine,version:snapshot.version,state:snapshot.state,painted:snapshot.painted,symbol:snapshot.symbol,sourceMode:snapshot.sourceMode,source:snapshot.source,legacy:snapshot.legacy,
    first,last,timeSpan,frequency,intervalMs,chartType:snapshot.chartType,settings:snapshot.settings,layout,range,barCount:bars.length,barHash:sourceCheck.barHash,sourceCheck,
    canvases:snapshot.canvases,actualCanvases:canvases,visible:host.checkVisibility({checkOpacity:true,checkVisibilityCSS:true}),box,hostBox,
    overlayBox,allocation:{box:rect(owner),width:owner.clientWidth,height:owner.clientHeight},plot:{left:plotLeft,right:plotRight,top:plotTop,bottom:plotBottom,timeTop:mapY(timeTop),timeBottom:mapY(timeBottom)},points,
    viewport:{width:innerWidth,height:innerHeight},documentWidth:Math.max(document.documentElement.scrollWidth,document.body.scrollWidth)};
}

export function readEngineBarTimes({svgSelector}) {
  const host=document.querySelector(svgSelector)?.closest('.atlas-plot')?.querySelector('.atlas-funnest-canvas');
  return host?.getAtlasFunnestSnapshot?.().engineBars?.map(bar=>bar.time)??null;
}

/** Funnest's time axis is bar-indexed. A time between two bars is interpolated
 * between their indices, and a time past either end is extrapolated by the
 * engine's bar interval, the smallest gap among its last 20 bars. Session gaps
 * and the forecast gutter therefore make screen x non-linear in time. */
export function funnestTimeAxis(times) {
  assert.ok(Array.isArray(times)&&times.length>1&&times.every((time,index)=>Number.isFinite(time)&&(index===0||time>times[index-1])),'Funnest bar times must be finite and strictly increasing');
  const last=times.length-1;let interval=Infinity;
  for(let index=Math.max(1,times.length-20);index<times.length;index++)interval=Math.min(interval,times[index]-times[index-1]);
  const indexOf=time=>{
    if(time<=times[0])return (time-times[0])/interval;
    if(time>=times[last])return last+(time-times[last])/interval;
    let low=0,high=last;
    while(low+1<high){const middle=(low+high)>>1;if(times[middle]<=time)low=middle;else high=middle;}
    return low+(time-times[low])/(times[high]-times[low]);
  };
  const timeOf=index=>{
    if(index<=0)return times[0]+index*interval;
    if(index>=last)return times[last]+(index-last)*interval;
    const whole=Math.floor(index);
    return times[whole]+(index-whole)*(times[whole+1]-times[whole]);
  };
  return {interval,indexOf,timeOf};
}

export function pointerAnchorDrift({axis,before,after,pointerX}) {
  const at=state=>{const from=axis.indexOf(state.first),to=axis.indexOf(state.last);return axis.timeOf(from+(pointerX-state.plot.left)/(state.plot.right-state.plot.left)*(to-from));};
  const candle=before.intervalMs,pixel=(before.last-before.first)/(before.plot.right-before.plot.left);
  return {error:Math.abs(at(before)-at(after)),tolerance:candle+pixel,pointerX,before:at(before),after:at(after)};
}

function readPerimeter() {
  const selectors={top:'.atlas-canvas-heading',left:'.atlas-sidebar',right:'.workbench-rail',bottom:'.workbench-bottom-bar'};
  return Object.fromEntries(Object.entries(selectors).map(([name,selector])=>{
    const nodes=document.querySelectorAll(selector),node=nodes[0],b=node?.getBoundingClientRect();
    return [name,{count:nodes.length,visible:Boolean(node?.checkVisibility({checkOpacity:true,checkVisibilityCSS:true})),
      left:b?.left,top:b?.top,width:b?.width,height:b?.height}];
  }));
}

/** Shared browser contract for BTC, the native controllers and embedded price
 * charts. `context` reads the active frame; `cdp` always sends native input to
 * the real top-level target. `parentPoint` maps an iframe point without mutating
 * the page. This helper cannot pass without an actual browser/controller. */
export async function verifyChartZoomBrowser({cdp,context=cdp,receipt,evaluate,until,settled,parentPoint=async point=>point,
  svgSelector,allocationSelector,label}) {
  const record={label,svgSelector,input:'native CDP wheel, pointer drag and double-click',status:'running',inputs:[],states:[]};
  (receipt.chartZoom??=[]).push(record);
  const read=()=>evaluate(context,readChart,{svgSelector,allocationSelector});
  const span=state=>state.timeSpan,canvasSignature=state=>state.actualCanvases.map(canvas=>canvas.mainPanePixelHash).join('|');
  const near=(a,b)=>Math.abs(a-b)<=1;
  const valid=state=>state?.engine==='funnest'&&state.painted&&state.legacy?.priceNodes===0&&state.visible&&state.box.width>0&&state.box.height>0&&
    [state.first,state.last,span(state),state.intervalMs,state.layout?.plotWidth,state.layout?.panesHeight,state.layout?.width,state.layout?.timeAxisHeight].every(Number.isFinite)&&span(state)>0&&state.barCount>0&&
    state.layout.width>state.layout.plotWidth&&state.layout.timeAxisHeight>0&&state.points?.plot&&state.points?.price&&state.points?.time&&
    state.actualCanvases.some(canvas=>canvas.visible&&canvas.readable&&canvas.opaquePixels>0&&canvas.sampledColors>1&&canvas.mainPanePixelHash)&&
    state.sourceCheck?.missing.length===0&&state.sourceCheck?.volumeMismatches.length===0&&state.sourceCheck?.volumeSourceMismatches.length===0&&state.sourceCheck?.valueMismatches.length===0&&
    state.sourceCheck?.closeSourceMismatches.length===0&&state.sourceCheck?.scaleConsistent;
  let baseline,perimeter;
  function assertGeometry(state,chrome,stage) {
    assert.ok(valid(state),label+': rendered chart metadata is invalid during '+stage+': '+JSON.stringify(state));
    assert.ok(near(state.box.top,state.allocation.box.top)&&near(state.box.left,state.allocation.box.left),label+': Funnest host must share the allocated plot origin during '+stage);
    assert.ok(near(state.box.width,state.allocation.width)&&state.box.height>0&&state.box.bottom<=state.allocation.box.bottom+1,label+': Funnest host must occupy the allocated plot during '+stage+': '+JSON.stringify({canvas:state.box,allocation:state.allocation}));
    assert.ok(state.actualCanvases.some(canvas=>canvas.box.width>0&&canvas.box.height>0),label+': actual Funnest canvas elements are missing during '+stage);
    assert.ok(state.sourceCheck.matched===state.barCount&&state.sourceCheck.scaleConsistent,label+': source archive bars do not match the rendered Funnest bars during '+stage+': '+JSON.stringify(state.sourceCheck));
    assert.ok(state.documentWidth<=state.viewport.width+1,label+': chart introduced horizontal page overflow during '+stage);
    for(const [name,box]of Object.entries(chrome)){
      assert.equal(box.count,1,label+': exactly one '+name+' perimeter owner');
      if(perimeter){assert.equal(box.visible,perimeter[name].visible,label+': '+name+' visibility changed during '+stage);
        for(const dimension of ['left','top','width','height'])assert.ok(near(box[dimension],perimeter[name][dimension]),label+': '+name+' '+dimension+' changed during '+stage);}
    }
    if(baseline){for(const dimension of ['left','top','width','height'])assert.ok(near(state.box[dimension],baseline.box[dimension]),label+': canvas '+dimension+' changed during '+stage);
      assert.equal(state.barHash,baseline.barHash,label+': native input changed the archived source bars during '+stage);}
  }
  async function capture(stage) {
    const state=await read(),chrome=await evaluate(cdp,readPerimeter);
    record.states.push({stage,...state,perimeter:chrome});assertGeometry(state,chrome,stage);return state;
  }
  async function pointFor(state,kind) {
    const local=state.points[kind];assert.ok(local,label+': '+kind+' axis/plot has no unobscured native target');
    const point=await parentPoint(local);
    assert.ok(Number.isFinite(point.x)&&Number.isFinite(point.y),label+': invalid mapped native target');
    return point;
  }
  async function wheel(state,kind) {
    const point=await pointFor(state,kind);
    record.inputs.push({kind:'mouseWheel',surface:kind,...point,deltaY:-160});
    await cdp.send('Input.dispatchMouseEvent',{type:'mouseMoved',...point});
    await cdp.send('Input.dispatchMouseEvent',{type:'mouseWheel',...point,deltaX:0,deltaY:-160});
  }
  const sameRange=(a,b)=>a.first===b.first&&a.last===b.last;
  function sameTime(a,b,stage) {
    assert.equal(a.first,b.first,label+': '+stage+' changed the actual Funnest range start');
    assert.equal(a.last,b.last,label+': '+stage+' changed the actual Funnest range end');
  }
  let axis;
  function samePointerTime(before,after,pointerX,stage){
    const drift=pointerAnchorDrift({axis,before,after,pointerX});
    assert.ok(drift.error<=drift.tolerance,label+': '+stage+' moved the pointer time beyond candle/pixel rounding: '+JSON.stringify(drift));
    (record.pointerAnchors??=[]).push({stage,...drift});
  }
  try{
    await until(async()=>valid(await read()),label+' rendered zoom metadata',10000);
    await settled(context);
    baseline=await read();perimeter=await evaluate(cdp,readPerimeter);
    record.states.push({stage:'initial',...baseline,perimeter});assertGeometry(baseline,perimeter,'initial');
    const barTimes=await evaluate(context,readEngineBarTimes,{svgSelector});
    assert.equal(barTimes?.length,baseline.barCount,label+': the engine bar times must be the bars the initial state counted');
    axis=funnestTimeAxis(barTimes);

    await wheel(baseline,'plot');
    await until(async()=>{const next=await read();return valid(next)&&span(next)<span(baseline);},label+' native plot-wheel zoom',5000);
    await settled(context);const zoomed=await capture('plot-wheel');
    assert.ok(span(zoomed)<span(baseline),label+': wheel-up must reduce the visible time span');
    samePointerTime(baseline,zoomed,baseline.points.plot.x,'ordinary plot-wheel zoom');

    await wheel(zoomed,'price');
    await until(async()=>{const next=await read();return valid(next)&&sameRange(next,zoomed)&&canvasSignature(next)!==canvasSignature(zoomed);},label+' native price-axis wheel',5000);
    await settled(context);const priceZoomed=await capture('price-wheel');
    sameTime(priceZoomed,zoomed,'price-axis wheel');
    assert.notEqual(canvasSignature(priceZoomed),canvasSignature(zoomed),label+': price-axis wheel must repaint actual main-pane pixels while retaining the same time range');

    const pricePoint=await pointFor(priceZoomed,'price');
    record.inputs.push({kind:'doubleClick',surface:'price',...pricePoint});
    await cdp.send('Input.dispatchMouseEvent',{type:'mouseMoved',...pricePoint});
    for(const clickCount of [1,2])for(const type of ['mousePressed','mouseReleased'])await cdp.send('Input.dispatchMouseEvent',{type,button:'left',clickCount,...pricePoint});
    await until(async()=>{const next=await read();return valid(next)&&canvasSignature(next)!==canvasSignature(priceZoomed);},label+' price-axis double-click Auto',5000);
    await settled(context);const automatic=await capture('price-auto');
    sameTime(automatic,priceZoomed,'price-axis double-click');

    const start=await pointFor(automatic,'time'),distance=Math.min(160,(automatic.plot.right-automatic.plot.left)*.2);
    assert.ok(distance>=12,label+': time axis must have enough physical width for a drag');
    const finish=await parentPoint({x:automatic.points.time.x+distance,y:automatic.points.time.y});
    record.inputs.push({kind:'drag',surface:'time',from:start,to:finish});
    await cdp.send('Input.dispatchMouseEvent',{type:'mouseMoved',...start});
    await cdp.send('Input.dispatchMouseEvent',{type:'mousePressed',button:'left',clickCount:1,...start});
    for(let step=1;step<=4;step++)await cdp.send('Input.dispatchMouseEvent',{type:'mouseMoved',button:'left',buttons:1,x:start.x+(finish.x-start.x)*step/4,y:start.y+(finish.y-start.y)*step/4});
    await cdp.send('Input.dispatchMouseEvent',{type:'mouseReleased',button:'left',clickCount:1,...finish});
    await until(async()=>{const next=await read();return valid(next)&&span(next)>span(automatic);},label+' native rightward time-axis drag',5000);
    await settled(context);const expanded=await capture('time-axis-drag');
    assert.ok(span(expanded)>span(automatic),label+': dragging the time axis right must expand the visible time span');
    samePointerTime(automatic,expanded,automatic.points.time.x,'time-axis drag');
    record.status='passed';return record;
  }catch(error){
    record.status='failed';record.error=error instanceof Error?error.message:String(error);
    // Keep the actual coordinates/domains readable in bounded CI log pages;
    // the complete case receipt can be larger than a provider's log line cap.
    console.error('ATLAS_CHART_ZOOM_FAILURE '+JSON.stringify({label,width:receipt.width,height:receipt.height,error:record.error,inputs:record.inputs,
      states:record.states.map(({stage,first,last,timeSpan,barCount,sourceCheck,box,overlayBox,allocation,plot,actualCanvases})=>({stage,first,last,timeSpan,barCount,sourceCheck,box,overlayBox,allocation,plot,actualCanvases}))}));
    throw error;
  }
}
