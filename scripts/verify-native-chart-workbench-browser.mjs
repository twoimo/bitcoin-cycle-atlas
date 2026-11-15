import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {parseEthArchive} from '../dist/eth-market-data.js';
import {parseEquityArchive} from '../dist/equity-market-data.js';
import {readChart as readFunnestChart,verifyChartZoomBrowser} from './verify-chart-zoom-browser.mjs';
import {assertNativeObservedEvidence,assertNativeOverlayEvidence,readNativeFunnestEvidence} from './funnest-browser-evidence.mjs';

export function readNativeMeasurementTargets(svgSelector){
  const svg=document.querySelector(svgSelector),plot=svg?.closest('.atlas-plot'),host=plot?.querySelector('.atlas-funnest-canvas');
  if(!host||typeof host.getAtlasFunnestSnapshot!=='function')throw new Error('Native measurement requires the actual Funnest host');
  const snapshot=host.getAtlasFunnestSnapshot(),bars=snapshot.engineBars||[],layout=snapshot.layout,range=snapshot.range,main=layout.panes.find(pane=>pane.kind==='main');
  if(!bars.length||!range||!main)throw new Error('Native Funnest source bars or pane range are missing');
  const gaps=bars.slice(1).map((bar,index)=>bar.time-bars[index].time).filter(value=>value>0),interval=Math.min(...gaps);
  const indexAt=time=>{
    if(time<=bars[0].time)return(time-bars[0].time)/interval;
    if(time>=bars.at(-1).time)return bars.length-1+(time-bars.at(-1).time)/interval;
    let lo=0,hi=bars.length-1;while(lo<=hi){const mid=(lo+hi)>>1;if(bars[mid].time<=time)lo=mid+1;else hi=mid-1;}
    const left=bars[hi],right=bars[hi+1];return hi+(time-left.time)/(right.time-left.time);
  };
  const from=indexAt(Number(range.from)),to=indexAt(Number(range.to)),span=to-from,box=host.getBoundingClientRect();
  if(!(span>1&&layout.plotWidth>0&&layout.width>layout.plotWidth))throw new Error('Native Funnest visible index range cannot support source-bar selection');
  return [.2,.75].map((fraction,order)=>{
    const index=Math.max(0,Math.min(bars.length-1,Math.max(Math.ceil(from),Math.min(Math.floor(to),Math.round(from+span*fraction))))),bar=bars[index],localX=(index-from)/span*layout.plotWidth;
    if(!bar||localX<=0||localX>=layout.plotWidth)throw new Error('Native Funnest source bar lies outside the measured plot');
    const x=Math.round(box.left+localX/layout.width*box.width),ys=[.35,.65,.5].map(value=>Math.round(box.top+(main.top+main.height*value)/layout.height*box.height));
    const y=ys.find(value=>{const hit=document.elementFromPoint(x,value);return Boolean(hit&&(host.contains(hit)||hit===host||svg.contains(hit)||hit===svg)&&!hit.closest('button,a,input,select,textarea,[role="button"]'));});
    if(y===undefined)throw new Error('Native source-bar coordinate is obstructed');
    return {x,y,index,time:bar.time,date:new Date(bar.time).toISOString().slice(0,10),fraction,barCenter:x,selectionCell:{left:box.left+(index-.5-from)/span*layout.plotWidth/layout.width*box.width,right:box.left+(index+.5-from)/span*layout.plotWidth/layout.width*box.width},spacing:layout.plotWidth/span};
  });
}

/** The checked-out native controllers run in the candidate browser. All state
 * changes below use real pointer/keyboard input; evaluation only reads DOM or
 * the same-origin published source archive. No mock controller is installed. */
export async function verifyNativeChartWorkbench(api) {
  const {cdp,receipt,evaluate,until,settled,click:rawClick,bounds,screenshot}=api;
  const {width,height}=receipt,phone=width<=620;
  async function click(context,selector){
    if(phone&&await evaluate(context,s=>Boolean(document.querySelector(s)?.closest('.workbench-bottom-bar'))&&document.querySelector('#mobile-details-toggle').getAttribute('aria-expanded')!=='true',selector))await rawClick(context,'#mobile-details-toggle');
    if(await evaluate(context,s=>Boolean(document.querySelector(s)?.closest('.shell-feature-panel[hidden]')),selector))await rawClick(context,'#atlas-shell-features-toggle');
    await rawClick(context,selector);
  }
  const symbol=await evaluate(cdp,()=>document.body.dataset.market);
  assert.ok(['ETHUSD','MSTR','BMNR'].includes(symbol),'Native parity verification requires an actual native instrument');
  const eth=symbol==='ETHUSD',svg=eth?'#eth-chart':'#equity-chart',prefix=eth?'eth':'equity',product=eth?'ETH-USD':symbol;
  const archiveName=eth?'eth-ohlc.json':`${symbol.toLowerCase()}-ohlc.json`,sourceArchive=JSON.parse(await readFile(new URL('../dist/data/'+archiveName,import.meta.url),'utf8')),
    sourceSeries=eth?parseEthArchive(sourceArchive,'daily'):parseEquityArchive(sourceArchive,{symbol,interval:'daily'});
  assert.ok(Array.isArray(sourceSeries.candles)&&sourceSeries.candles.length>0,'Native symbol archive must contain source OHLCV bars');
  const record=receipt.nativeWorkbench={symbol,states:[],input:'native CDP pointer and keyboard'};
  const state=async()=>{
    const chart=await evaluate(cdp,readFunnestChart,{svgSelector:svg,allocationSelector:'.atlas-plot'});
    const ui=await evaluate(cdp,({svg,prefix,symbol})=>{
      const node=document.querySelector(svg),plot=node.closest('.atlas-plot'),host=plot.querySelector('.atlas-funnest-canvas'),snapshot=host.getAtlasFunnestSnapshot(),layout=snapshot.layout;
      const pane=layout.panes.find(item=>item.kind==='volume'),main=layout.panes.find(item=>item.kind==='main'),canvas=host.querySelector('canvas');
      let volumePixels={readable:false,opaquePixels:0,sampledColors:0,pixelHash:null};
      if(pane&&canvas){try{const data=canvas.getContext('2d').getImageData(0,0,canvas.width,canvas.height).data,x0=0,x1=Math.min(canvas.width,Math.round(layout.plotWidth/layout.width*canvas.width)),y0=Math.round(pane.top/layout.height*canvas.height),y1=Math.min(canvas.height,Math.round((pane.top+pane.height)/layout.height*canvas.height));let hash=2166136261;const colors=new Set();volumePixels.readable=true;const step=Math.max(1,Math.floor(x1*(y1-y0)/12000));for(let y=y0;y<y1;y++)for(let x=x0;x<x1;x+=step){const i=(y*canvas.width+x)*4;colors.add(`${data[i]},${data[i+1]},${data[i+2]},${data[i+3]}`);if(data[i+3])volumePixels.opaquePixels++;for(let j=0;j<4;j++){hash^=data[i+j]||0;hash=Math.imul(hash,16777619);}}volumePixels.sampledColors=colors.size;volumePixels.pixelHash=(hash>>>0).toString(16);}catch{}}
      const measure=node.querySelector('.chart-measurement'),bars=snapshot.engineBars||[],overlay=plot.inspectAtlasOverlayRender?.()||null;
      return {product:symbol==='ETHUSD'?'ETH-USD':symbol,interval:document.querySelector('#workbench-interval-select')?.value||'daily',type:snapshot.chartType,scale:snapshot.settings?.priceScale,invert:String(Boolean(snapshot.inverted)),
        observed:bars.length,latest:document.querySelector('#'+prefix+'-price').textContent,latestTitle:document.querySelector('#'+prefix+'-bar-time').textContent,
        price:document.querySelector('#'+prefix+'-price').textContent,date:document.querySelector('#'+prefix+'-bar-time').textContent,
        range:`${snapshot.range?.from}/${snapshot.range?.to}`,tool:plot.dataset.tool,overlay,layout,
        volume:{enabled:Boolean(snapshot.settings?.volume&&pane),painted:Boolean(pane&&volumePixels.readable&&volumePixels.opaquePixels>0&&volumePixels.sampledColors>1),unit:symbol==='ETHUSD'?'ETH':'주',clock:symbol==='ETHUSD'?'UTC':'뉴욕 세션',count:bars.filter(bar=>Number.isFinite(bar.volume)).length,projected:0,title:snapshot.source?.product||symbol,pixels:volumePixels},
        measurement:measure&&measure.getAttribute('display')!=='none'?{pending:measure.dataset.pending,start:{...measure.querySelector('.measurement-start')?.dataset},end:{...measure.querySelector('.measurement-end')?.dataset},text:measure.querySelector('.measurement-label')?.textContent}:null};
    },{svg,prefix,symbol});
    return {...chart,...ui};
  };
  async function key(key,code,number,modifiers=0) {
    for(const type of ['keyDown','keyUp'])await cdp.send('Input.dispatchKeyEvent',{type,key,code,windowsVirtualKeyCode:number,nativeVirtualKeyCode:number,modifiers,...(type==='keyDown'&&key==='Enter'?{text:'\r',unmodifiedText:'\r'}:{})});
    await settled(cdp);
  }
  async function choose(selector,value) {
    const option=await evaluate(cdp,({selector,value})=>{const node=document.querySelector(selector);return {value:node.value,index:[...node.options].filter(option=>!option.disabled).findIndex(option=>option.value===value)};},{selector,value});
    assert.ok(option.index>=0,'Missing supported option '+selector+' '+value);if(option.value===value)return;
    await click(cdp,selector);await key('Home','Home',36);
    for(let i=0;i<option.index;i++)await key('ArrowDown','ArrowDown',40);
    await key('Enter','Enter',13);
    assert.equal(await evaluate(cdp,s=>document.querySelector(s).value,selector),value,'Native selection did not reach '+value);
  }
  async function action(selector,mobileTarget) {
    if(phone&&mobileTarget){if(await evaluate(cdp,()=>document.querySelector('#mobile-details-toggle').getAttribute('aria-expanded')!=='true'))await click(cdp,'#mobile-details-toggle');await click(cdp,`[data-mobile-target="${mobileTarget}"]`);}
    else await click(cdp,selector);
  }
  async function tool(selector) {
    if(phone)await click(cdp,'#mobile-tools-toggle');
    await click(cdp,selector);
    if(phone&&await evaluate(cdp,()=>Boolean(document.querySelector('.atlas-sidebar[data-mobile-open=true]'))))await click(cdp,'.atlas-sidebar .mobile-tray-heading button[aria-label="차트 도구 닫기"]');
  }
  async function shot(name){await screenshot(cdp,`native-${symbol.toLowerCase()}-${width}x${height}-${name}.png`,receipt);}
  function inside(box,label){assert.ok(box.width>0&&box.height>0&&box.display!=='none'&&box.visibility!=='hidden',label+' is not painted');assert.ok(box.left>=-1&&box.right<=width+1&&box.top>=-1&&box.bottom<=height+1,label+' exceeds the viewport '+JSON.stringify({...box,text:undefined}));}

  await until(()=>evaluate(cdp,s=>{const host=document.querySelector(s)?.closest('.atlas-plot')?.querySelector('.atlas-funnest-canvas'),snapshot=host?.getAtlasFunnestSnapshot?.();return Boolean(snapshot?.painted&&snapshot.engineBars?.length>0&&snapshot.canvases?.some(canvas=>canvas.readable&&canvas.opaquePixels>0&&canvas.sampledColors>1));},svg),symbol+' painted Funnest observations');
  await settled(cdp);
  record.shell=await evaluate(cdp,()=>({
    shell:document.body.dataset.shell,page:document.body.dataset.page,centerTool:document.body.dataset.centerTool||null,
    headings:document.querySelectorAll('.atlas-canvas-heading').length,left:document.querySelectorAll('.workbench-tools').length,
    right:document.querySelectorAll('.workbench-rail').length,bottom:document.querySelectorAll('.workbench-bottom-bar').length,
    nav:[...document.querySelectorAll('.workbench-rail .atlas-nav [data-atlas-page]')].map(node=>node.dataset.atlasPage),
    legacyVisible:[...document.querySelectorAll('.eth-tools,.eth-bottom,.eth-chart-types')].some(node=>node.getClientRects().length>0),
    staleBtc:['#lab-chart','#atlas-cycle-panel','#btc-refresh-notice'].filter(selector=>document.querySelector(selector)),
    intervalOptions:[...document.querySelector('#workbench-interval-select').options].map(option=>option.value),
    rootWidth:document.documentElement.scrollWidth,bodyWidth:document.body.scrollWidth,coarse:matchMedia('(pointer:coarse)').matches,
  }));
  assert.deepEqual([record.shell.shell,record.shell.page,record.shell.centerTool],['chart','outlook',null]);
  assert.deepEqual([record.shell.headings,record.shell.left,record.shell.right,record.shell.bottom],[1,1,1,1],'The native symbol must retain one owner for each shared perimeter');
  assert.deepEqual(record.shell.nav,['outlook','market-us','evidence','data','ipo','relay','conference']);
  assert.deepEqual(record.shell.staleBtc,[]);assert.equal(record.shell.legacyVisible,false);
  assert.deepEqual(record.shell.intervalOptions,eth?['1m','5m','15m','30m','1h','4h','daily','weekly']:['daily','weekly']);
  assert.ok(Math.max(record.shell.rootWidth,record.shell.bodyWidth)<=width+1,'Native perimeter causes page overflow');
  record.geometry={};
  for(const [name,selector]of [['top','.atlas-canvas-heading'],['plot','.atlas-plot'],...(!phone?[['bottom','.workbench-bottom-bar']]:[])]){const box=await bounds(cdp,selector);inside(box,name);record.geometry[name]={...box,text:undefined};}
  assert.ok(record.geometry.plot.height>=height*.75,'Native plot must use the full-height workspace');
  if(phone)assert.ok(record.geometry.plot.bottom<=record.geometry.top.top+1&&Math.abs(record.geometry.top.bottom-height)<=1,'The single phone dock overlaps the canvas or escapes its bottom edge');
  else assert.ok(record.geometry.plot.top>=record.geometry.top.bottom-1&&record.geometry.plot.bottom<=record.geometry.bottom.top+1,'Native controls overlap the price canvas');
  if(!phone){
    for(const [name,selector,expected]of [['left','.atlas-sidebar',52],['right','.workbench-rail',45]]){const box=await bounds(cdp,selector);inside(box,name);assert.ok(Math.abs(box.width-expected)<1,'Native '+name+' rail diverged from BTC width');record.geometry[name]={...box,text:undefined};}
    assert.equal(record.geometry.top.height,record.shell.coarse||width<=1100?48:38,'Compact windows retain 44px targets inside the 48px header');
    assert.ok(record.geometry.plot.left>=record.geometry.left.right&&record.geometry.plot.right<=record.geometry.right.left,'Canvas overlaps side rails');
  }else{
    assert.equal(record.geometry.top.height,48,'Phones retain one complete 48px control row');
    for(const [trigger,selector]of [['#mobile-tools-toggle','.atlas-sidebar'],['#mobile-details-toggle','.workbench-rail']]){
      await click(cdp,trigger);inside(await bounds(cdp,selector),selector+' tray');
      if(trigger==='#mobile-details-toggle'){const footer=await bounds(cdp,'.workbench-bottom-bar');inside(footer,'original footer in information sheet');record.geometry.bottomInSheet={...footer,text:undefined};}
      await click(cdp,selector+' .mobile-tray-heading button');
      assert.equal(await evaluate(cdp,s=>document.querySelector(s).hasAttribute('data-mobile-open'),selector),false);
    }
  }
  record.initial=await state();assert.equal(record.initial.product,product);
  assert.equal(record.initial.engine,'funnest');assert.equal(record.initial.painted,true);assert.equal(record.initial.sourceCheck.matched,record.initial.barCount);
  assert.deepEqual([record.initial.sourceCheck.missing.length,record.initial.sourceCheck.valueMismatches.length,record.initial.sourceCheck.volumeMismatches.length],[0,0,0],'Native Funnest OHLCV bars must match the symbol-specific archive');
  const renderer=await evaluate(cdp,readNativeFunnestEvidence,'.atlas-plot');
  record.renderer=assertNativeObservedEvidence(renderer,sourceSeries,{symbol:product,chartType:record.initial.type});
  const overlay=renderer.overlay,overlayProof=assertNativeOverlayEvidence(overlay,{forecast:eth||symbol==='MSTR',baseline:eth});
  record.overlay=overlayProof;
  // BMNR has no forecast/baseline by contract (assertNativeOverlayEvidence just
  // asserted zero segments), so the in-plot proof uses the painted geometry
  // each symbol actually owns: forecast/baseline segments where expected, and
  // the real event lines everywhere.
  const insidePlot=point=>point.x>=0&&point.x<=renderer.snapshot.layout.plotWidth&&point.y>=-12&&point.y<=renderer.snapshot.layout.panesHeight+12;
  const forecastPoints=[...overlay.forecastSegments.coordinates,...overlay.baselineSegments.coordinates].flatMap(segment=>[segment.from,segment.to]);
  if(eth||symbol==='MSTR')assert.ok(forecastPoints.some(insidePlot),'Native painter coordinates have no rendered forecast segment inside the actual Funnest plot');
  const eventPoints=(overlay.eventLines||[]).flatMap(line=>[{x:line.x,y:line.y1},{x:line.x,y:line.y2}]);
  assert.ok([...forecastPoints,...eventPoints].some(insidePlot),'Native painter coordinates have no rendered segment inside the actual Funnest plot');
  await verifyChartZoomBrowser({...api,svgSelector:svg,allocationSelector:'.atlas-plot',label:symbol});
  await shot('layout');

  // A six-month window keeps each real volume bar individually inspectable.
  await choose('#workbench-interval-select','daily');
  if(phone)await click(cdp,'#mobile-details-toggle');
  const rangeSelect=await evaluate(cdp,()=>document.querySelector('#workbench-range-select').getClientRects().length>0);
  if(rangeSelect)await choose('#workbench-range-select','near');else await click(cdp,'[data-chart-span="near"]');
  await action('#atlas-display-options','#atlas-display-options');
  await until(()=>evaluate(cdp,()=>!document.querySelector('#chart-reader').hidden),'native chart settings');
  inside(await bounds(cdp,'#chart-reader'),'native settings');
  assert.ok((await bounds(cdp,'#chart-reader')).text.includes(symbol),'Settings belong to a stale symbol');
  // Volume now starts visible on native ETH/equity charts, so the setting is
  // exercised in both directions and the lane always ends with real bars.
  const volumeBefore=(await state()).volume.enabled;
  await click(cdp,'[data-native-setting="showVolume"]');
  await until(()=>evaluate(cdp,([s,b])=>{const host=document.querySelector(s)?.closest('.atlas-plot')?.querySelector('.atlas-funnest-canvas'),snapshot=host?.getAtlasFunnestSnapshot?.();return Boolean(snapshot?.settings?.volume&&snapshot.layout.panes.some(pane=>pane.kind==='volume'))!==b;},[svg,volumeBefore]),'native Funnest volume pane toggled');
  if(volumeBefore){await click(cdp,'[data-native-setting="showVolume"]');await until(()=>evaluate(cdp,s=>{const host=document.querySelector(s)?.closest('.atlas-plot')?.querySelector('.atlas-funnest-canvas'),snapshot=host?.getAtlasFunnestSnapshot?.();return Boolean(snapshot?.settings?.volume&&snapshot.layout.panes.some(pane=>pane.kind==='volume'));},svg),'native Funnest source volume pane');}
  const volume=await state();record.states.push({action:'source-volume',...volume});
  assert.equal(volume.product,product);assert.equal(volume.volume.enabled,true);assert.equal(volume.volume.unit,eth?'ETH':'주');assert.equal(volume.volume.clock,eth?'UTC':'뉴욕 세션');
  assert.ok(volume.volume.count>0&&volume.volume.count<=volume.observed&&volume.volume.painted&&volume.volume.pixels.readable&&volume.volume.pixels.opaquePixels>0&&volume.volume.pixels.sampledColors>1);
  assert.equal(volume.volume.projected,0);assert.doesNotMatch(volume.volume.title,/BTC/);
  record.sourceVolumes={product:volume.sourceCheck.archiveProduct,count:volume.volume.count,sourceCount:volume.sourceCheck.sourceRows,mismatches:volume.sourceCheck.volumeMismatches,archiveUrl:volume.sourceCheck.archiveUrl};
  assert.equal(record.sourceVolumes.product,product);assert.deepEqual(record.sourceVolumes.mismatches,[],'Native volume changed the archived source quantities');
  const scaleBefore=volume.scale,scalePixels=volume.actualCanvases.map(canvas=>canvas.mainPanePixelHash).join('|');
  await click(cdp,'#chart-reader .native-reader-action');
  const scaleChanged=await state();assert.notEqual(scaleChanged.scale,scaleBefore,'Settings must alter this symbol’s actual price scale');
  assert.notEqual(scaleChanged.actualCanvases.map(canvas=>canvas.mainPanePixelHash).join('|'),scalePixels,'Native price-scale setting did not repaint the real Funnest canvas');
  await click(cdp,'#chart-reader .native-reader-action');
  const invertBefore=await state(),invertPixels=invertBefore.actualCanvases.map(canvas=>canvas.mainPanePixelHash).join('|');
  await click(cdp,'[data-native-setting="invertScale"]');const inverted=await state();assert.equal(inverted.invert,'true');
  assert.notEqual(inverted.actualCanvases.map(canvas=>canvas.mainPanePixelHash).join('|'),invertPixels,'Native invert setting did not repaint the actual Funnest canvas');
  await click(cdp,'[data-native-setting="invertScale"]');assert.equal((await state()).invert,'false');
  await click(cdp,'#chart-reader .reader-heading button');await shot('volume');

  await tool('[data-chart-tool="measure"]');assert.equal((await state()).tool,'measure');
  for(let step=0;step<2;step++)await tool('#workbench-magnet');
  assert.equal(await evaluate(cdp,()=>document.querySelector('.workbench-magnet-badge').textContent),'강');
  const points=await evaluate(cdp,readNativeMeasurementTargets,svg);
  record.measurementInputs=points;
  for(const point of points){assert.ok(Number.isFinite(point.x)&&Number.isFinite(point.y));for(const type of ['mouseMoved','mousePressed','mouseReleased'])await cdp.send('Input.dispatchMouseEvent',{type,x:point.x,y:point.y,...(type==='mouseMoved'?{}:{button:'left',clickCount:1})});await settled(cdp);}
  const measured=await state();assert.equal(measured.measurement?.pending,'false');
  for(const [index,side]of ['start','end'].entries())assert.equal(Date.parse(measured.measurement[side].measureDate),points[index].time,'Measurement must retain the selected actual source date');
  record.states.push({action:'measure',...measured});await shot('measurement');
  await tool('#workbench-clear');assert.equal((await state()).measurement,null);
  await action('#workbench-undo','#workbench-undo');assert.deepEqual((await state()).measurement,measured.measurement,'Undo must restore only the native drawing state');
  await tool('[data-chart-tool="crosshair"]');

  const beforeDate=await state();await click(cdp,'#workbench-go-date');
  inside(await bounds(cdp,'#chart-go-to-dialog'),'native date dialog');
  const targetDate=await evaluate(cdp,()=>document.querySelector('#chart-go-to-dialog [aria-label="이동할 날짜"]').value);
  assert.match(targetDate,/^\d{4}-\d{2}-\d{2}$/);
  await click(cdp,'#chart-go-to-dialog button[type="submit"]');
  assert.equal(await evaluate(cdp,()=>document.querySelector('#chart-go-to-dialog').open),false);
  const afterDate=await state();assert.notEqual(afterDate.range,beforeDate.range,'Native date submit must change the actual viewport');assert.ok(afterDate.date.includes(targetDate),'Native date submit selected a different source date');
  record.states.push({action:'go-to',targetDate,...afterDate});

  await action('#lab-svg','#lab-svg');
  await until(()=>evaluate(cdp,()=>{const image=document.querySelector('#chart-export-dialog img');return document.querySelector('#chart-export-dialog')?.open&&image?.complete&&image.naturalWidth>0;}),'native chart export preview');
  inside(await bounds(cdp,'#chart-export-dialog'),'native export dialog');
  record.export=await evaluate(cdp,async()=>{const dialog=document.querySelector('#chart-export-dialog'),anchor=dialog.querySelector('a[download]'),markup=await(await fetch(anchor.href)).text();return {download:anchor.download,markup,previewWidth:dialog.querySelector('img').naturalWidth,previewHeight:dialog.querySelector('img').naturalHeight};});
  assert.ok(record.export.download.startsWith(symbol+'-'));assert.ok(record.export.markup.includes(product));assert.ok(record.export.markup.includes(eth?'UTC':'뉴욕 거래 세션일'));assert.ok(record.export.markup.includes('measurement-start'),'Saved SVG lost the actual drawing');
  assert.doesNotMatch(record.export.markup,/거래량 · BTC/);delete record.export.markup;
  await shot('export');await click(cdp,'[data-native-export="png"]');
  await until(()=>evaluate(cdp,()=>document.querySelector('#chart-export-dialog [role=status]').textContent==='PNG 저장 완료'),'actual native PNG creation');
  record.export.pngCreated=true;await key('Escape','Escape',27);
  assert.equal(await evaluate(cdp,()=>document.querySelector('#chart-export-dialog').open),false);
  assert.equal((await state()).product,product);
  record.finalOverflow=await evaluate(cdp,()=>Math.max(document.documentElement.scrollWidth,document.body.scrollWidth));
  assert.ok(record.finalOverflow<=width+1,'Native interactions introduced page overflow');
}
