import assert from 'node:assert/strict';
import {verifyChartZoomBrowser} from './verify-chart-zoom-browser.mjs';

/** The checked-out native controllers run in the candidate browser. All state
 * changes below use real pointer/keyboard input; evaluation only reads DOM or
 * the same-origin published source archive. No mock controller is installed. */
export async function verifyNativeChartWorkbench(api) {
  const {cdp,receipt,evaluate,until,settled,click,bounds,screenshot}=api;
  const {width,height}=receipt,phone=width<=620;
  const symbol=await evaluate(cdp,()=>document.body.dataset.market);
  assert.ok(['ETHUSD','MSTR','BMNR'].includes(symbol),'Native parity verification requires an actual native instrument');
  const eth=symbol==='ETHUSD',svg=eth?'#eth-chart':'#equity-chart',prefix=eth?'eth':'equity',product=eth?'ETH-USD':symbol;
  const record=receipt.nativeWorkbench={symbol,states:[],input:'native CDP pointer and keyboard'};
  const state=()=>evaluate(cdp,({svg,prefix})=>{
    const node=document.querySelector(svg),latest=node.querySelector('.market-last-price'),pane=node.querySelector('.volume-pane'),measure=node.querySelector('.chart-measurement');
    return {product:node.dataset.product,interval:node.dataset.interval,type:node.dataset.chartType,scale:node.dataset.scale,invert:node.dataset.invertScale,
      observed:Number(node.dataset.observedCandleCount),latest:latest?.querySelector('text')?.textContent,latestTitle:latest?.querySelector('title')?.textContent,
      price:document.querySelector('#'+prefix+'-price').textContent,date:document.querySelector('#'+prefix+'-bar-time').textContent,
      range:document.querySelector('#workbench-range-label').textContent,tool:node.closest('.atlas-plot').dataset.tool,
      volume:pane?{unit:pane.dataset.volumeUnit,clock:pane.dataset.volumeClock,count:Number(pane.dataset.volumeObservedCount),projected:Number(pane.dataset.volumeProjectionCount),title:pane.querySelector('.volume-pane-title')?.textContent}:null,
      measurement:measure&&measure.getAttribute('display')!=='none'?{pending:measure.dataset.pending,start:{...measure.querySelector('.measurement-start')?.dataset},end:{...measure.querySelector('.measurement-end')?.dataset},text:measure.querySelector('.measurement-label')?.textContent}:null};
  },{svg,prefix});
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
    if(phone&&mobileTarget){await click(cdp,'#mobile-details-toggle');await click(cdp,`[data-mobile-target="${mobileTarget}"]`);}
    else await click(cdp,selector);
  }
  async function tool(selector) {
    if(phone)await click(cdp,'#mobile-tools-toggle');
    await click(cdp,selector);
    if(phone&&await evaluate(cdp,()=>Boolean(document.querySelector('.atlas-sidebar[data-mobile-open=true]'))))await click(cdp,'.atlas-sidebar .mobile-tray-heading button[aria-label="차트 도구 닫기"]');
  }
  async function shot(name){await screenshot(cdp,`native-${symbol.toLowerCase()}-${width}x${height}-${name}.png`,receipt);}
  function inside(box,label){assert.ok(box.width>0&&box.height>0&&box.display!=='none'&&box.visibility!=='hidden',label+' is not painted');assert.ok(box.left>=-1&&box.right<=width+1&&box.top>=-1&&box.bottom<=height+1,label+' exceeds the viewport '+JSON.stringify({...box,text:undefined}));}

  await until(()=>evaluate(cdp,s=>Number(document.querySelector(s)?.dataset.observedCandleCount)>0,svg),symbol+' native observations');
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
  assert.deepEqual(record.shell.nav,['outlook','market-us','evidence','data','ipo','relay']);
  assert.deepEqual(record.shell.staleBtc,[]);assert.equal(record.shell.legacyVisible,false);
  assert.deepEqual(record.shell.intervalOptions,eth?['1m','5m','15m','30m','1h','4h','daily','weekly']:['daily','weekly']);
  assert.ok(Math.max(record.shell.rootWidth,record.shell.bodyWidth)<=width+1,'Native perimeter causes page overflow');
  record.geometry={};
  for(const [name,selector]of [['top','.atlas-canvas-heading'],['plot','.atlas-plot'],['bottom','.workbench-bottom-bar']]){const box=await bounds(cdp,selector);inside(box,name);record.geometry[name]={...box,text:undefined};}
  assert.ok(record.geometry.plot.height>=height*.75,'Native plot must use the full-height workspace');
  assert.ok(record.geometry.plot.top>=record.geometry.top.bottom-1&&record.geometry.plot.bottom<=record.geometry.bottom.top+1,'Native controls overlap the price canvas');
  if(!phone){
    for(const [name,selector,expected]of [['left','.atlas-sidebar',52],['right','.workbench-rail',45]]){const box=await bounds(cdp,selector);inside(box,name);assert.ok(Math.abs(box.width-expected)<1,'Native '+name+' rail diverged from BTC width');record.geometry[name]={...box,text:undefined};}
    assert.equal(record.geometry.top.height,record.shell.coarse?48:38);
    assert.ok(record.geometry.plot.left>=record.geometry.left.right&&record.geometry.plot.right<=record.geometry.right.left,'Canvas overlaps side rails');
  }else{
    assert.equal(record.geometry.top.height,width<=390?92:48,'Narrow phones retain two complete 44px control rows');
    for(const [trigger,selector]of [['#mobile-tools-toggle','.atlas-sidebar'],['#mobile-details-toggle','.workbench-rail']]){
      await click(cdp,trigger);inside(await bounds(cdp,selector),selector+' tray');
      await click(cdp,selector+' .mobile-tray-heading button');
      assert.equal(await evaluate(cdp,s=>document.querySelector(s).hasAttribute('data-mobile-open'),selector),false);
    }
  }
  record.initial=await state();assert.equal(record.initial.product,product);
  await verifyChartZoomBrowser({...api,svgSelector:svg,allocationSelector:'.atlas-plot',label:symbol});
  await shot('layout');

  // A six-month window keeps each real volume bar individually inspectable.
  await choose('#workbench-interval-select','daily');
  const rangeSelect=await evaluate(cdp,()=>document.querySelector('#workbench-range-select').getClientRects().length>0);
  if(rangeSelect)await choose('#workbench-range-select','near');else await click(cdp,'[data-chart-span="near"]');
  await action('#atlas-display-options','#atlas-display-options');
  await until(()=>evaluate(cdp,()=>!document.querySelector('#chart-reader').hidden),'native chart settings');
  inside(await bounds(cdp,'#chart-reader'),'native settings');
  assert.ok((await bounds(cdp,'#chart-reader')).text.includes(symbol),'Settings belong to a stale symbol');
  await click(cdp,'[data-native-setting="showVolume"]');
  await until(()=>evaluate(cdp,s=>Boolean(document.querySelector(s+' .volume-bar')),svg),'source volume bars');
  const volume=await state();record.states.push({action:'source-volume',...volume});
  assert.equal(volume.product,product);assert.equal(volume.volume.unit,eth?'ETH':'주');assert.equal(volume.volume.clock,eth?'UTC':'뉴욕 세션');
  assert.ok(volume.volume.count>0&&volume.volume.count<=volume.observed);assert.equal(volume.volume.projected,0);assert.doesNotMatch(volume.volume.title,/BTC/);
  record.sourceVolumes=await evaluate(cdp,async({svg,symbol})=>{
    const response=await fetch(new URL('./data/'+(symbol==='ETHUSD'?'eth':symbol.toLowerCase())+'-ohlc.json',location.href),{credentials:'omit',cache:'no-store'});
    if(!response.ok)throw new Error('Native source archive HTTP '+response.status);
    const source=await response.json(),rows=(source.dailyHistory||source).candles,map=new Map(rows.map(row=>[row.time,row]));
    const rendered=[...document.querySelectorAll(svg+' .volume-bar')];
    return {product:source.product,count:rendered.length,sourceCount:rows.length,mismatches:rendered.filter(node=>Number(node.dataset.volume)!==map.get(Number(node.dataset.time))?.volume).map(node=>node.dataset.time)};
  },{svg,symbol});
  assert.equal(record.sourceVolumes.product,product);assert.equal(record.sourceVolumes.count,volume.volume.count);assert.deepEqual(record.sourceVolumes.mismatches,[],'Native volume changed the archived source quantities');
  const scaleBefore=volume.scale;
  await click(cdp,'#chart-reader .native-reader-action');
  assert.notEqual((await state()).scale,scaleBefore,'Settings must alter this symbol’s actual price axis');
  await click(cdp,'#chart-reader .native-reader-action');
  await click(cdp,'[data-native-setting="invertScale"]');assert.equal((await state()).invert,'true');
  await click(cdp,'[data-native-setting="invertScale"]');assert.equal((await state()).invert,'false');
  await click(cdp,'#chart-reader .reader-heading button');await shot('volume');

  await tool('[data-chart-tool="measure"]');assert.equal((await state()).tool,'measure');
  for(let step=0;step<2;step++)await tool('#workbench-magnet');
  assert.equal(await evaluate(cdp,()=>document.querySelector('.workbench-magnet-badge').textContent),'강');
  const points=await evaluate(cdp,s=>{
    const chart=document.querySelector(s),b=chart.getBoundingClientRect(),v=chart.viewBox.baseVal,rows=[...chart.querySelectorAll('.volume-bar')];
    const left=b.left+Number(chart.dataset.plotLeft)/v.width*b.width,right=b.left+Number(chart.dataset.plotRight)/v.width*b.width;
    const top=b.top+Number(chart.dataset.plotTop)/v.height*b.height,bottom=b.top+Number(chart.dataset.priceBottom)/v.height*b.height;
    const bars=rows.map(row=>{const r=row.getBoundingClientRect();return {time:Number(row.dataset.time),date:row.dataset.date,center:r.left+r.width/2};});
    return [.2,.75].map((fraction,index)=>{
      const desired=Math.floor((bars.length-1)*fraction),order=bars.map((_,i)=>i).sort((a,c)=>Math.abs(a-desired)-Math.abs(c-desired));
      for(const i of order){
        const bar=bars[i],cellLeft=i?(bars[i-1].center+bar.center)/2:left,cellRight=i+1<bars.length?(bar.center+bars[i+1].center)/2:right;
        // A real mouse click may quantize fractional CSS coordinates. Choose
        // an integer pixel strictly inside this actual bar's nearest-date cell
        // instead of assuming every subpixel rectangle center is addressable.
        const first=Math.ceil(cellLeft+.02),last=Math.floor(cellRight-.02);if(first>last)continue;
        const x=Math.max(first,Math.min(last,Math.round(bar.center)));
        const ys=[.35,.65,.5].map(f=>Math.round(top+(bottom-top)*f)),y=ys.find(y=>{
          const hit=document.elementFromPoint(x,y);return hit&&(hit===chart||chart.contains(hit))&&!hit.closest('[data-history-event],[data-forecast-evidence],[data-research-annotation],button,[role="button"]');
        });
        if(y!==undefined)return {x,y,index,time:bar.time,date:bar.date,barCenter:bar.center,selectionCell:{left:cellLeft,right:cellRight}};
      }
      throw new Error('No unobscured integer mouse pixel selects a visible source bar');
    });
  },svg);
  record.measurementInputs=points;
  for(const point of points){assert.ok(Number.isFinite(point.x)&&Number.isFinite(point.y));for(const type of ['mouseMoved','mousePressed','mouseReleased'])await cdp.send('Input.dispatchMouseEvent',{type,x:point.x,y:point.y,...(type==='mouseMoved'?{}:{button:'left',clickCount:1})});await settled(cdp);}
  const measured=await state();assert.equal(measured.measurement?.pending,'false');
  for(const [index,side]of ['start','end'].entries())assert.equal(Date.parse(measured.measurement[side].measureDate)/1000,points[index].time,'Measurement must retain the selected actual source date');
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
