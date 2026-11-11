import assert from 'node:assert/strict';

// A focused UI review uses the existing native browser runner. It does not
// replace, shorten, or qualify the canonical 53-case publication inventory.
const viewportCases = [
  [320,740,true],[390,844,true],[768,1024,true],[1024,768,false],[1440,900,false],[1920,1080,false],
].map(([width,height,touch])=>({page:'ui-contract-btc',uiContract:true,surface:'btc',symbol:'BTCUSD',width,height,touch,route:'/'}));
const instrumentCases = ['ETHUSD','MSTR','BMNR','TQQQ','SOXL','233740','HYPE','HOUSING-BUSAN','HOUSING-SEOUL','HOUSING-GYEONGGI','HOUSING-NATIONAL'].map(symbol=>{
  const native=['ETHUSD','MSTR','BMNR'].includes(symbol),query=new URLSearchParams(native?{page:'outlook',symbol}:{symbol});
  if(symbol.startsWith('HOUSING-'))query.set('region',symbol.slice(8).toLowerCase());
  return {page:'ui-shell-'+symbol.toLowerCase(),uiShell:true,...(!native?{surface:'btc'}:{}),symbol,width:1440,height:900,touch:false,route:(native?'/':'/market-lab/charts/')+'?'+query};
});
const nativeEntryCases=['MSTR','BMNR'].flatMap(symbol=>['/','/market-lab/charts/'].map(path=>({
  page:'ui-entry-'+symbol.toLowerCase()+'-'+(path==='/'?'root':'charts'),uiShell:true,uiNativeEntry:true,symbol,width:1440,height:900,touch:false,
  route:path+'?symbol='+symbol,canonicalRoute:'/?symbol='+symbol,
})));
export const uiContractBrowserCases = process.env.ATLAS_UI_REVIEW_PHASE==='before'?viewportCases:[...viewportCases,...instrumentCases,...nativeEntryCases];

// The saved Pages fixtures declare their hosting root. Request that same mount
// and keep exact expected URLs, rather than accepting a route rewrite as clean.
export function mountUiReviewCase(spec,projectRoot){
  assert.match(projectRoot,/^\/(?:[A-Za-z0-9._~-]+\/)*$/);
  assert.ok(!projectRoot.includes('/../')&&!projectRoot.includes('/./'));
  const mount=route=>{
    assert.equal(typeof route,'string');
    assert.ok(route.startsWith('/')&&!route.startsWith('//')&&!/[\\\r\n]/.test(route));
    assert.ok(!route.split(/[?#]/)[0].split('/').some(part=>part==='.'||part==='..'));
    return projectRoot+route.slice(1);
  };
  return {...spec,publicRoute:spec.route,route:mount(spec.route),projectRoot,
    ...(spec.canonicalRoute?{publicCanonicalRoute:spec.canonicalRoute,canonicalRoute:mount(spec.canonicalRoute)}:{})};
}
const shellKeys={
  top:['symbol','interval','chart-type','indicators','instrument','history','workspace','chart-menu','export','settings'],
  bottom:['range','date','events','readout','scale','auto-scale','fit','status'],
  left:['crosshair','pan','measure','magnet','clear','zoom-in','zoom-out','pan-left','pan-right','reset','annotations'],
  right:['outlook','market-us','evidence','data','ipo','relay','conference','selection','layers','method','records','help'],
};

export function readShellContract(){
  const painted=node=>Boolean(node&&!node.hidden&&!node.closest('[hidden]')&&node.getClientRects().length&&getComputedStyle(node).visibility!=='hidden');
  const regions=Object.fromEntries(Object.keys({top:1,bottom:1,left:1,right:1}).map(region=>{
    const owner=document.querySelector('[data-shell-region="'+region+'"]'),box=owner?.getBoundingClientRect();
    return [region,{width:box?.width,painted:painted(owner),label:owner?.getAttribute('aria-label'),slots:owner?[...owner.querySelectorAll('[data-shell-owner="'+region+'"]')].map(node=>({
      slot:node.dataset.shellSlot,key:node.dataset.shellKey,painted:painted(node),label:node.getAttribute('aria-label')||node.title||node.textContent.trim(),
      disabled:node.matches(':disabled,[aria-disabled="true"]'),reason:node.dataset.disabledReason||node.getAttribute('aria-description')||'',
    })):[]}];
  }));
  return {symbol:document.querySelector('.atlas-plot')?.dataset.chartSymbol,graphName:document.querySelector('.atlas-workbench,.native-chart-workbench')?.getAttribute('aria-label'),regions,
    url:location.pathname+location.search,rootWidth:document.documentElement.scrollWidth,bodyWidth:document.body.scrollWidth,
    undoDisabled:document.querySelector('#workbench-undo')?.disabled,historyLength:history.length,
    storage:Object.keys(localStorage).filter(key=>/history|journal|replay/.test(key)).map(key=>({key,bytes:localStorage.getItem(key)?.length||0})),
    frame:[...document.querySelectorAll('.atlas-center-frame:not([hidden])')].map(frame=>({source:frame.src,loaded:frame.dataset.centerLoaded,ready:frame.contentDocument?.readyState,heading:frame.title})),
  };
}
async function verifyShellSnapshot(api){
  const {cdp,receipt,evaluate,until,settled}=api;
  await until(()=>evaluate(cdp,()=>document.querySelector('[data-shell-region="top"] [data-shell-key="settings"]')),'initialized common shell');
  await settled(cdp);
  const shell=await evaluate(cdp,readShellContract);
  for(const [region,keys]of Object.entries(shellKeys)){
    assert.deepEqual(shell.regions[region].slots.map(slot=>slot.key),keys,receipt.symbol+' '+region+' slots/order');
    assert.deepEqual(shell.regions[region].slots.map(slot=>Number(slot.slot)),keys.map((_,index)=>index+1));
    for(const slot of shell.regions[region].slots)if(slot.disabled)assert.ok(slot.reason.trim(),receipt.symbol+' '+region+'/'+slot.key+' has no disabled explanation');
  }
  assert.equal(shell.symbol,receipt.symbol);assert.equal(shell.graphName,receipt.symbol+' 가격 차트');
  assert.equal(shell.url,receipt.canonicalRoute||receipt.route,'First entry writes extra URL state');
  assert.equal(shell.undoDisabled,true,'First entry records an undoable edit');
  assert.ok(Math.max(shell.rootWidth,shell.bodyWidth)<=receipt.width+1,'Common shell overflows page');
  if(receipt.width>=1024){assert.ok(Math.abs(shell.regions.right.width-45)<=1,'Right rail width differs');assert.ok(shell.regions.left.width>0&&shell.regions.left.width<=52,'Left controls escape their 52px rail');}
  receipt.shellContract=shell;return shell;
}

export function readNativeEntryContract(){
  const painted=node=>Boolean(node&&!node.hidden&&!node.closest('[hidden]')&&node.getClientRects().length&&getComputedStyle(node).display!=='none'&&getComputedStyle(node).visibility!=='hidden');
  const chart=document.querySelector('#equity-chart');
  return {url:location.pathname+location.search,title:document.title,boot:document.documentElement?.dataset.boot,
    rootSymbol:document.documentElement?.dataset.symbol,market:document.body?.dataset.market,chartSymbol:document.querySelector('.atlas-plot')?.dataset.chartSymbol,
    chartName:chart?.getAttribute('aria-label'),observedCount:Number(chart?.dataset.observedCandleCount)||0,
    price:document.querySelector('#equity-price')?.textContent,chartPainted:painted(chart),
    observedPaths:chart?[...chart.querySelectorAll('path[d]')].filter(node=>painted(node)&&node.getAttribute('d').trim()).length:0,
    bootShellPainted:painted(document.querySelector('#atlas-boot-shell')),
    visibleSkeletons:[...document.querySelectorAll('[data-atlas-skeleton]')].filter(painted).map(node=>node.textContent.trim()),
    error:painted(document.querySelector('#atlas-boot-error'))?document.querySelector('#atlas-boot-error').textContent.trim():null,
    frames:[...document.querySelectorAll('.atlas-center-frame')].map(frame=>({source:frame.src,painted:painted(frame),status:frame.dataset.centerStatus,loaded:frame.dataset.centerLoaded})),
  };
}
async function verifyNativeEntry(api){
  const {cdp,receipt,evaluate,until}=api,started=Date.now(),observations=[];
  receipt.nativeEntry={requested:receipt.route,canonical:receipt.canonicalRoute,observations};
  let last='';
  const final=await until(async()=>{
    const state=await evaluate(cdp,readNativeEntryContract),key=JSON.stringify(state);
    if(key!==last){last=key;observations.push({elapsedMs:Date.now()-started,...state});}
    return state.error||state.boot==='ready'&&state.chartPainted&&state.observedCount>0&&state.observedPaths>0?state:null;
  },receipt.symbol+' canonical native entry or explicit terminal error',25000);
  receipt.nativeEntry.elapsedMs=Date.now()-started;receipt.nativeEntry.final=final;
  assert.equal(final.error,null,'Native entry ended with an explicit error: '+final.error);
  assert.equal(final.boot,'ready','Native entry did not finish boot');
  assert.equal(final.url,receipt.canonicalRoute,'Legacy entry did not reach its own canonical symbol');
  for(const field of ['rootSymbol','market','chartSymbol'])assert.equal(final[field],receipt.symbol,'Native entry has stale '+field);
  assert.ok(final.title.startsWith(receipt.symbol+' · '),'Native entry title belongs to another instrument');
  assert.ok(final.chartName?.startsWith(receipt.symbol+' 가격 차트'),'Native chart accessibility name belongs to another instrument');
  assert.ok(final.observedCount>0&&final.observedPaths>0&&final.chartPainted,'Native entry has no painted observed prices');
  assert.ok(final.price&&final.price!=='—','Native entry has no source price');
  assert.equal(final.bootShellPainted,false,'Boot skeleton still covers the native chart');
  assert.deepEqual(final.visibleSkeletons,[],'Native entry leaves a loading skeleton');
  assert.deepEqual(final.frames,[],'Native entry must not instantiate or retain an ETF iframe');
}

export function readHostedUiReadiness(symbol){
  const frames=[...document.querySelectorAll('.atlas-center-frame:not([hidden])')],frame=frames[0];
  const rect=frame?.getBoundingClientRect(),style=frame&&getComputedStyle(frame);
  const state={boot:document.documentElement?.dataset.boot,controls:document.body?.dataset.chartControls,
    symbol:document.querySelector('.atlas-plot')?.dataset.chartSymbol,frameCount:frames.length,
    frameLoaded:frame?.dataset.centerLoaded,frameStatus:frame?.dataset.centerStatus,documentReady:frame?.contentDocument?.readyState,
    framePainted:Boolean(frame&&rect.width>0&&rect.height>0&&style.display!=='none'&&style.visibility!=='hidden')};
  return {...state,ready:state.boot==='ready'&&state.controls==='ready'&&state.symbol===symbol&&state.frameCount===1&&
    state.frameLoaded==='true'&&state.frameStatus==='ready'&&state.documentReady==='complete'&&state.framePainted};
}

export async function verifyUiShellSurface(api){
  const {cdp,receipt,evaluate,until,settled,screenshot,verifyOfflineRefresh}=api;
  if(receipt.uiNativeEntry)await verifyNativeEntry(api);
  else if(receipt.surface==='btc'){
    // The child can acknowledge before the native parent has completed boot.
    // Its BTC status is deliberately hidden by the boot stylesheet until then.
    receipt.hostedReadiness=await until(async()=>{const value=await evaluate(cdp,readHostedUiReadiness,receipt.symbol);return value.ready?value:null;},'painted native shell and acknowledged current instrument workspace');
    await settled(cdp);
    await verifyOfflineRefresh();
  }else{
    await until(()=>evaluate(cdp,()=>Boolean(document.querySelector('#eth-chart path,#equity-chart path'))),'native instrument chart');
  }
  await settled(cdp);await verifyShellSnapshot(api);
  await screenshot(cdp,(receipt.uiNativeEntry?receipt.page:'wp7-'+receipt.symbol.toLowerCase())+'-'+receipt.width+'x'+receipt.height+'.png',receipt);
}

export function readUiContractGeometry(){
  const painted=e=>Boolean(e&&!e.hidden&&!e.closest('[hidden]')&&e.getClientRects().length&&getComputedStyle(e).display!=='none'&&getComputedStyle(e).visibility!=='hidden');
  const rect=e=>{if(!e)return null;const b=e.getBoundingClientRect(),s=getComputedStyle(e);return {x:b.x,y:b.y,left:b.left,right:b.right,top:b.top,bottom:b.bottom,width:b.width,height:b.height,scrollWidth:e.scrollWidth,clientWidth:e.clientWidth,display:s.display,fontSize:s.fontSize,flexWrap:s.flexWrap};};
  const plot=document.querySelector('.atlas-plot'),svg=document.querySelector('#lab-chart'),legend=document.querySelector('.chart-legend-dock')||document.querySelector('#atlas-chart-legend');
  const bar=document.querySelector('.chart-replay-bar'),actions=document.querySelector('.chart-replay-actions'),view=rect(actions);
  const controls=actions?[...actions.querySelectorAll('button,select,input')].filter(painted).map(e=>({control:e.dataset.cr,label:e.getAttribute('aria-label')||e.textContent,disabled:e.disabled,...rect(e)})):[];
  const clipped=controls.filter(b=>b.left<view.left-.5||b.right>view.right+.5||b.top<view.top-.5||b.bottom>view.bottom+.5).map(b=>({...b,excessRight:Math.max(0,b.right-view.right)}));
  const l=painted(legend)?rect(legend):null;
  const overlap=(a,b)=>a&&b&&a.left<b.right&&a.right>b.left&&a.top<b.bottom&&a.bottom>b.top;
  const labels=[...document.querySelectorAll('.market-last-price,.cycle-macro-clock-label,[data-forecast-evidence] text,[data-history-event] text,.chart-replay-hud')].filter(painted);
  // Every persistent transport surface must leave painted chart information
  // uncovered, including the separate cancel button during start selection.
  // Inspect native SVG text and date/price badges as well as the cycle strip;
  // a footer reservation alone is not evidence of unobstructed rendered labels.
  const transportOverlays=[['bar',bar],['pick-cancel',document.querySelector('.chart-replay-controls>[data-cr="pick-cancel"]')],['scroll-hint',document.querySelector('.chart-replay-scroll-hint')]]
    .filter(([,node])=>painted(node)).map(([kind,node])=>({kind,...rect(node)}));
  const information=svg?[...svg.querySelectorAll('text,.cycle-timing-ribbon,.cross-date-tag,.cross-price-tag,.chart-latest-price-tag')]
    .filter(painted).map(node=>({kind:node.getAttribute('class')||node.tagName,label:node.getAttribute('aria-label')||node.textContent.trim(),...rect(node)}))
    .filter(box=>box.width>0&&box.height>0):[];
  const informationCollisions=transportOverlays.flatMap(overlay=>information.filter(label=>overlap(overlay,label)).map(label=>({overlay:overlay.kind,overlayRect:overlay,label})));
  return {viewport:{width:innerWidth,height:innerHeight},url:location.pathname+location.search,rootWidth:document.documentElement.scrollWidth,bodyWidth:document.body.scrollWidth,
    plot:rect(plot),pricePane:{left:Number(svg?.dataset.plotLeft),right:Number(svg?.dataset.plotRight),top:Number(svg?.dataset.plotTop),bottom:Number(svg?.dataset.priceBottom)},
    legend:l&&{...l,mode:legend.dataset.legendMode||'legacy',compactReason:legend.dataset.legendCompactReason||null,groups:[...legend.querySelectorAll('[data-legend-group]')].map(e=>({id:e.dataset.legendGroup,visibleCount:e.dataset.visibleCount,hiddenCount:e.dataset.hiddenCount,...rect(e)})),more:[...legend.querySelectorAll('.chart-legend-more')].filter(painted).map(e=>({text:e.textContent,...rect(e)})),collisions:labels.filter(e=>overlap(l,rect(e))).map(e=>({tag:e.tagName,className:e.getAttribute('class'),text:e.textContent,...rect(e)}))},
    replay:painted(bar)?{bar:rect(bar),actions:view,clipped,controls,transportOverlays,information,informationCollisions,hint:[...document.querySelectorAll('.chart-replay-scroll-hint')].map(e=>({visible:painted(e),text:e.textContent,...rect(e)})),arrows:[...bar.querySelectorAll('.chart-replay-scroll-arrow')].map(e=>({visible:painted(e),disabled:e.disabled,...rect(e)})),state:document.querySelector('.chart-replay-controls')?.dataset.state,selecting:svg?.dataset.replaySelecting==='true',cursor:svg?.dataset.replayCursor,strip:[...document.querySelectorAll('.cycle-timing-ribbon,.cycle-interval-overlay-layer')].filter(painted).map(rect),coveredLabels:[...document.querySelectorAll('.cycle-timing-ribbon,.market-last-price')].filter(e=>painted(e)&&overlap(rect(bar),rect(e))).map(e=>({label:e.getAttribute('aria-label')||e.textContent,...rect(e)}))}:null,
    undoDisabled:document.querySelector('#workbench-undo')?.disabled,
    firstEntryStorage:Object.keys(localStorage).filter(k=>/replay|history/.test(k)).map(k=>({key:k,bytes:localStorage.getItem(k)?.length||0})),
  };
}

export async function verifyUiContractSurface(api){
  const {cdp,receipt,evaluate,until,settled,click,screenshot,verifyOfflineRefresh}=api;
  const phase=process.env.ATLAS_UI_REVIEW_PHASE==='before'?'before':'after',prefix=`wp4-${phase}-${receipt.width}x${receipt.height}`;
  const result=receipt.uiContract={phase,input:'native pointer / keyboard / touch',states:[],scope:'UI geometry; no model-validity or production-deployment claim'};
  const read=()=>evaluate(cdp,readUiContractGeometry);
  const state=async label=>{await settled(cdp);const value=await read();result.states.push({label,...value});return value;};
  async function key(value,code,number,modifiers=0,wait=true){
    for(const type of ['keyDown','keyUp'])await cdp.send('Input.dispatchKeyEvent',{type,key:value,code,windowsVirtualKeyCode:number,nativeVirtualKeyCode:number,modifiers,...(type==='keyDown'&&value==='Enter'?{text:'\r',unmodifiedText:'\r'}:{})});
    if(wait)await settled(cdp);
  }
  const control=name=>'.chart-replay-controls [data-cr="'+name+'"]';
  async function pointer(selector,touch=false){
    const target=await evaluate(cdp,selector=>{const node=document.querySelector(selector),r=node.getBoundingClientRect(),x=r.left+r.width/2,y=r.top+r.height/2,hit=document.elementFromPoint(x,y);return {x,y,topmost:hit===node||node.contains(hit)};},selector);
    assert.equal(target.topmost,true,'Native input target is obscured: '+selector);
    if(touch){await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:target.x,y:target.y,radiusX:2,radiusY:2,force:1}]});await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await settled(cdp);}
    else await click(cdp,selector);
  }
  async function tabTo(selector){
    for(let index=0;index<120;index++){
      if(await evaluate(cdp,selector=>document.activeElement?.matches(selector),selector))return;
      await key('Tab','Tab',9);
    }
    throw new Error('Keyboard cannot reach '+selector);
  }
  function within(box,label){assert.ok(box&&box.width>0&&box.height>0,label+' not painted');assert.ok(box.left>=-.5&&box.right<=receipt.width+.5&&box.top>=-.5&&box.bottom<=receipt.height+.5,label+' outside viewport '+JSON.stringify(box));}
  function checkLegend(value){
    const {legend:l,pricePane:p,plot}=value;within(l,'legend');
    assert.ok(l.width<=(p.right-p.left)*.42+1,'Legend exceeds 42% of measured price pane');
    assert.ok(Math.abs(l.right-(plot.left+p.right-12))<1.5,'Legend must retain 12px right inset');
    assert.ok(l.top>=plot.top+p.top+12-1.5,'Legend must retain at least the 12px top inset');
    assert.ok(l.scrollWidth<=l.clientWidth+1,'Legend content overflows');
    if(receipt.width<=390)assert.equal(l.mode,'chip');
    else if(l.mode==='chip')assert.ok(['width','height','protected-anchors'].includes(l.compactReason),'Unexpected wide-chart chip');
    else assert.equal(l.mode,'rows');
    if(l.mode==='rows')assert.deepEqual(l.groups.map(g=>g.id),['price','cycle']);
    assert.equal(l.collisions.length,0,'Legend overlaps reserved labels: '+JSON.stringify(l.collisions));
    assert.ok(Math.max(value.rootWidth,value.bodyWidth)<=receipt.width+1,'Page has horizontal overflow');
  }
  await until(()=>evaluate(cdp,()=>Boolean(document.querySelector('#lab-chart path')&&Number(document.querySelector('#lab-chart')?.dataset.plotRight)>0)),'BTC chart with real observations');
  await verifyOfflineRefresh();
    const initial=await state('initial');await screenshot(cdp,prefix+'-chart.png',receipt);
  if(phase==='after'){
    await verifyShellSnapshot(api);
    checkLegend(initial);assert.equal(initial.url,receipt.route,'First render must retain the clean URL');assert.equal(initial.undoDisabled,true,'First render must not create an undo record');
    const trigger=initial.legend.mode==='chip'?'.chart-legend-open':'.chart-legend-more:not([hidden])';
    if(await evaluate(cdp,s=>Boolean(document.querySelector(s)),trigger)){
      await click(cdp,trigger);await until(()=>evaluate(cdp,()=>document.querySelector('#chart-legend-dialog')?.open),'legend dialog');
      const modal=await evaluate(cdp,()=>{const d=document.querySelector('#chart-legend-dialog'),r=d.getBoundingClientRect();return {left:r.left,right:r.right,top:r.top,bottom:r.bottom,width:r.width,height:r.height,items:d.querySelectorAll('li').length,close:d.querySelector('button')?.textContent};});
      within(modal,'legend dialog');assert.ok(modal.items>=10,'Full legend loses source items');
      if(receipt.width<=390){assert.equal(Math.round(modal.width),receipt.width);assert.equal(Math.round(modal.height),receipt.height);}
      result.legendDialog=modal;await screenshot(cdp,prefix+'-legend.png',receipt);
      await key('Escape','Escape',27);assert.equal(await evaluate(cdp,()=>document.querySelector('#chart-legend-dialog').open),false);
      result.legendFocusReturned=await evaluate(cdp,()=>document.activeElement.matches('.chart-legend-open,.chart-legend-more'));
      assert.equal(result.legendFocusReturned,true);
    }
  }
  const replayTriggerPainted=await evaluate(cdp,()=>Boolean(document.querySelector('#workbench-replay')?.checkVisibility()));
  if(replayTriggerPainted)await click(cdp,'#workbench-replay');
  else{await click(cdp,'#mobile-details-toggle');await click(cdp,'[data-mobile-target="#workbench-replay"]');}
  await until(()=>evaluate(cdp,()=>document.querySelector('.chart-replay-controls')?.dataset.state==='selecting'),'replay start selection');
  const entry=await state('replay-entry');await screenshot(cdp,prefix+'-replay-entry.png',receipt);
  await click(cdp,control('select-menu'));await click(cdp,control('select-date'));
  for(const [value,left]of [['06',2],['01',1],['2026',0]]){
    await click(cdp,control('date'));for(let i=0;i<5;i++)await key('ArrowRight','ArrowRight',39,0,false);
    for(let i=0;i<left;i++)await key('ArrowLeft','ArrowLeft',37,0,false);await key('Backspace','Backspace',8,0,false);
    for(const digit of value)for(const type of ['keyDown','keyUp'])await cdp.send('Input.dispatchKeyEvent',{type,key:digit,code:'Digit'+digit,windowsVirtualKeyCode:48+Number(digit),nativeVirtualKeyCode:48+Number(digit),...(type==='keyDown'?{text:digit,unmodifiedText:digit}:{})});
    await settled(cdp);
  }
  assert.equal(await evaluate(cdp,s=>document.querySelector(s).value,control('date')),'2026-06-01');
  await click(cdp,control('start'));
  await until(()=>evaluate(cdp,()=>['paused','ended'].includes(document.querySelector('.chart-replay-controls')?.dataset.state)),'fixed replay cutoff');
  const ready=await state('replay-paused');await screenshot(cdp,prefix+'-replay.png',receipt);
  await click(cdp,control('pick'));await until(()=>evaluate(cdp,()=>document.querySelector('#lab-chart')?.dataset.replaySelecting==='true'),'replay picking');
  const picking=await state('replay-picking');await screenshot(cdp,prefix+'-replay-picking.png',receipt);await key('Escape','Escape',27);const canceled=await state('replay-pick-canceled');
  result.selectionY={entry:entry.replay.bar.y,paused:ready.replay.bar.y,picking:picking.replay.bar.y,canceled:canceled.replay.bar.y};
  if(phase==='after'){
    for(const value of [entry,ready,picking,canceled]){
      checkLegend(value);within(value.replay.bar,'replay bar');
      assert.equal(value.replay.coveredLabels.length,0,'Replay covers chart information: '+JSON.stringify(value.replay.coveredLabels));
      for(const overlay of value.replay.transportOverlays)within(overlay,'Replay '+overlay.kind);
      assert.equal(value.replay.informationCollisions.length,0,'Replay transport or selection control covers painted chart information: '+JSON.stringify(value.replay.informationCollisions));
      const overflow=value.replay.actions.scrollWidth>value.replay.actions.clientWidth;
      assert.equal(value.replay.hint.some(hint=>hint.visible),overflow,'Hint must follow measured overflow at every viewport');
      if(receipt.width>=1024)assert.equal(value.replay.clipped.length,0,'Desktop replay controls clipped: '+JSON.stringify(value.replay.clipped));
      if(overflow)assert.ok(value.replay.arrows.some(arrow=>arrow.visible&&!arrow.disabled),'Overflow has no usable pointer/touch scroll arrow');
    }
    assert.ok(Math.max(...Object.values(result.selectionY))-Math.min(...Object.values(result.selectionY))<1,'Selecting moves replay controls');
    if(receipt.width===1440)assert.ok(Math.abs(ready.replay.bar.width-560)<1.5,'Desktop transport must expand to 560px');
    const hasMenu=await evaluate(cdp,s=>{const node=document.querySelector(s);return node&&!node.hidden&&node.getClientRects().length>0;},control('transport-more'));
    if(hasMenu){
      await tabTo(control('transport-more'));await key('Enter','Enter',13);
      assert.equal(await evaluate(cdp,s=>document.querySelector(s).hidden,control('transport-panel')),false,'Keyboard did not open overflow menu');
      const secondary=await evaluate(cdp,s=>[...document.querySelector(s).querySelectorAll('[data-cr]')].map(node=>node.dataset.cr),control('transport-panel'));
      for(const name of ['speed','update-interval','live'])assert.ok(secondary.includes(name),'Overflow loses '+name);
      await tabTo(control('speed'));const priorSpeed=await evaluate(cdp,s=>document.querySelector(s).value,control('speed'));
      // Change the focused select with native arrows without opening Chromium's
      // separate popup, whose Escape belongs to the picker instead of the menu.
      await key('Home','Home',36);await key('ArrowDown','ArrowDown',40);
      const keyboardSpeed=await evaluate(cdp,s=>document.querySelector(s).value,control('speed'));assert.notEqual(keyboardSpeed,priorSpeed,'Keyboard cannot change replay speed');
      await tabTo(control('transport-close'));
      assert.equal(await evaluate(cdp,s=>document.activeElement===document.querySelector(s),control('transport-close')),true,'Keyboard cannot leave the speed select');
      await key('Escape','Escape',27);assert.equal(await evaluate(cdp,s=>document.querySelector(s).hidden,control('transport-panel')),true);
      assert.equal(await evaluate(cdp,s=>document.activeElement===document.querySelector(s),control('transport-more')),true,'Overflow loses keyboard focus');
      await pointer(control('transport-more'),receipt.touch);await pointer(control('transport-close'),receipt.touch);
      result.overflowAccess={keyboard:true,pointer:!receipt.touch,touch:receipt.touch,secondary,keyboardSpeed};
    }
    if(canceled.replay.actions.scrollWidth>canceled.replay.actions.clientWidth){
      await pointer(control('scroll-forward'),receipt.touch);await tabTo(control('next'));
      const revealed=await state('primary-scroll-and-keyboard');
      assert.ok(!revealed.replay.clipped.some(item=>item.control==='next'),'Keyboard focus remains clipped after scroll');
      result.primaryScrollAccess={keyboard:true,pointer:!receipt.touch,touch:receipt.touch};
    }
  }
  result.status=phase==='before'?'baseline-recorded':'passed';
}
