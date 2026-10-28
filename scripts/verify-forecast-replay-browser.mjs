import assert from 'node:assert/strict';
import {mkdir,mkdtemp,readdir,readFile} from 'node:fs/promises';
import {resolve,relative} from 'node:path';
import {createHash} from 'node:crypto';

export const replayBrowserCases=[
  {symbol:'BTCUSD',surface:'btc',width:1440,height:900,touch:false},
  {symbol:'BTCUSD',surface:'btc',width:900,height:430,touch:true},
  {symbol:'ETHUSD',surface:'eth',width:1440,height:900,touch:false},
  {symbol:'ETHUSD',surface:'eth',width:320,height:568,touch:true}
].map(spec=>({...spec,page:'replay-'+spec.surface,replay:true,route:'/?symbol='+spec.symbol+'&granularity=daily&type=line'}));

const digest=value=>createHash('sha256').update(value).digest('hex');
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const nextDate=date=>new Date(Date.parse(date+'T00:00:00Z')+86400000).toISOString().slice(0,10);

export async function verifyForecastReplaySurface(api){
  const {cdp,browser,receipt,root,outputDirectory,evaluate,until,settled,click,bounds,visibleBounds,screenshot,verifyOfflineRefresh}=api;
  const {symbol,width,height}=receipt,btc=symbol==='BTCUSD';
  const dialog=btc?'#forecast-journal[open]':'#asset-forecast-journal[open]';
  const tab=dialog+(btc?' [data-journal-tab="replay"]':' [data-asset-journal-tab="replay"]');
  const recordSelect=dialog+(btc?' [data-journal-record]':' [data-asset-journal-record]');
  const close=dialog+(btc?' [data-journal-close]':' [data-asset-journal-close]');
  const panel=dialog+' [data-forecast-replay]',control=name=>panel+' [data-replay-'+name+']';
  const prefix=receipt.page+'-'+width+'x'+height;
  const evidence=receipt.replay={symbol,nativeInput:true,states:[],exports:[],lifecycle:[],archiveRequests:[],expectedCanceledRequests:[],
    scope:'Checked-out real page, native CDP pointer/keyboard input and real JSON downloads. Historical reconstruction is not evidence of prospective accuracy.'};
  const ledger=resolve(root,'dist/data',btc?'forecast-ledger':'asset-forecast-ledger');
  const index=JSON.parse(await readFile(resolve(ledger,'index.json'),'utf8'));
  const ethArchive=btc?null:JSON.parse(await readFile(resolve(root,'dist/data/replay-eth-ohlc.json'),'utf8'));
  const observed=new Map(btc?JSON.parse(await readFile(resolve(root,'dist/data/btc-daily.json'),'utf8')).prices.map(([date,price])=>[date,{price}]):
    ethArchive.dailyHistory.candles.map(row=>[row.date.slice(0,10),{...row,price:row.close}]));
  let operation='initial-load';
  const archivePath=btc?'/data/btc-daily.json':'/data/replay-eth-ohlc.json';
  cdp.on('Network.requestWillBeSent',event=>{
    const url=new URL(event.request.url);
    if(url.pathname===archivePath&&url.origin===new URL(receipt.url).origin)evidence.archiveRequests.push({operation,requestId:event.requestId,frameId:event.frameId,loaderId:event.loaderId,
      url:event.request.url,method:event.request.method,startedAt:event.wallTime,status:'requested',initiator:event.initiator});
  });
  cdp.on('Network.responseReceived',event=>{const request=evidence.archiveRequests.find(row=>row.requestId===event.requestId);if(request)request.response={status:event.response.status,protocol:event.response.protocol,
    mimeType:event.response.mimeType,fromDiskCache:event.response.fromDiskCache??false,fromServiceWorker:event.response.fromServiceWorker??false,
    headers:event.response.headers,encodedDataLength:event.response.encodedDataLength};});
  cdp.on('Network.dataReceived',event=>{const request=evidence.archiveRequests.find(row=>row.requestId===event.requestId);if(request){request.decodedDataLength=(request.decodedDataLength??0)+event.dataLength;request.encodedDataLength=(request.encodedDataLength??0)+event.encodedDataLength;}});
  cdp.on('Network.loadingFinished',event=>{const request=evidence.archiveRequests.find(row=>row.requestId===event.requestId);if(request)Object.assign(request,{status:'finished',finishedAt:new Date().toISOString(),finishedEncodedDataLength:event.encodedDataLength});});
  cdp.on('Network.loadingFailed',event=>{const request=evidence.archiveRequests.find(row=>row.requestId===event.requestId);if(request)Object.assign(request,{status:'failed',failedDuring:operation,failedAt:new Date().toISOString(),errorText:event.errorText,canceled:event.canceled??false});});

  async function key(value,code,number,modifiers=0,{wait=true}={}){
    for(const type of ['keyDown','keyUp'])await cdp.send('Input.dispatchKeyEvent',{type,key:value,code,windowsVirtualKeyCode:number,nativeVirtualKeyCode:number,modifiers,
      ...(type==='keyDown'&&value==='Enter'&&!modifiers?{text:'\r',unmodifiedText:'\r'}:{})});
    if(wait)await settled(cdp);
  }
  async function select(selector,value){
    const choices=await evaluate(cdp,s=>[...document.querySelector(s).options].filter(option=>!option.disabled).map(option=>option.value),selector);
    const target=choices.indexOf(value);assert.ok(target>=0,'Native option unavailable: '+value);
    await click(cdp,selector);
    await key('Home','Home',36,0,{wait:false});
    for(let i=0;i<target;i++)await key('ArrowDown','ArrowDown',40,0,{wait:false});
    await key('Enter','Enter',13);
    await until(()=>evaluate(cdp,({selector,value})=>document.querySelector(selector)?.value===value,{selector,value}),'native selection and replacement control: '+value);
  }
  async function ready(){
    await until(async()=>{
      const status=await evaluate(cdp,s=>{const el=document.querySelector(s);return {state:el?.dataset.state,error:el?.querySelector('[role="alert"]')?.textContent};},panel);
      if(status.state==='error')throw new Error('Replay failed: '+status.error);
      return status.state==='ready';
    },symbol+' replay ready');
    await settled(cdp);
  }
  async function open({wait=true}={}){
    if(btc){
      await key('k','KeyK',75,2);
      await until(()=>evaluate(cdp,()=>document.querySelector('#workspace-dialog')?.open),'native command palette');
      await click(cdp,'.workspace-command-search');await key('a','KeyA',65,2,{wait:false});
      await cdp.send('Input.insertText',{text:'예측 기록'});await settled(cdp);
      await click(cdp,'.workspace-command:not(:disabled)');
    }else{
      await until(()=>evaluate(cdp,()=>Boolean(document.querySelector('[data-eth-action="forecast"]'))),'ETH forecast action');
      await click(cdp,'[data-eth-action="forecast"]');
      await click(cdp,'#eth-data-dialog[open] [data-open-asset-forecast-journal="ETHUSD"]');
    }
    await until(()=>evaluate(cdp,s=>Boolean(document.querySelector(s)),dialog),'saved journal open');
    if(await evaluate(cdp,s=>document.querySelector(s)?.getAttribute('aria-pressed')!=='true',tab))await click(cdp,tab);
    if(wait)await ready();
  }
  async function snapshot(label,{capture=false}={}){
    const value=await evaluate(cdp,({panel,recordSelect})=>{
      const el=document.querySelector(panel),svg=el.querySelector('[data-replay-chart]'),q=name=>el.querySelector('[data-replay-'+name+']');
      return {observedAt:new Date().toISOString(),state:el.dataset.state,playback:el.dataset.playback,cursor:el.dataset.cursor,outputHash:el.dataset.outputHash,
        mode:q('mode').value,clock:q('clock').value,index:Number(q('scrub').value),lastIndex:Number(q('scrub').max),date:q('date').value,
        recordId:document.querySelector(recordSelect)?.value,actualCount:Number(svg.dataset.replayActualCount),actualThrough:svg.dataset.replayActualThrough,
        forecastPoints:Number(svg.dataset.replayForecastPoints),forecastPath:svg.querySelector('[data-replay-forecast-path]')?.getAttribute('d')??null,
        actualPath:svg.querySelector('[data-replay-actual-path]')?.getAttribute('d')??null,
        candleDates:[...svg.querySelectorAll('[data-replay-candle-date]')].map(n=>n.dataset.replayCandleDate),
        candleTitles:[...svg.querySelectorAll('[data-replay-candle-date] title')].map(n=>n.textContent),
        candlesDisabled:q('display').querySelector('[value="candles"]').disabled,
        metrics:q('metrics').textContent,targets:[...q('targets').querySelectorAll('tbody tr')].map(row=>[...row.cells].map(cell=>cell.textContent)),
        disclosure:q('disclosure').textContent,source:q('source').textContent,metricNote:q('metric-note').textContent,
        invalidPaths:[...svg.querySelectorAll('path')].filter(n=>/NaN|Infinity/.test(n.getAttribute('d')||'')).length,
        clip:svg.querySelector('[data-replay-overlay]')?.getAttribute('clip-path'),originBoundary:Boolean(svg.querySelector('[data-replay-origin-boundary]')),
        priceHidden:svg.dataset.replayPriceHidden==='true',inputVisible:svg.dataset.replayInputVisible,svgPaths:svg.querySelectorAll('path').length,svgText:svg.textContent,
        rootWidth:document.documentElement.scrollWidth,bodyWidth:document.body.scrollWidth,width:innerWidth,height:innerHeight};
    },{panel,recordSelect});
    assert.equal(value.state,'ready');assert.equal(value.cursor,value.date);assert.equal(value.invalidPaths,0);
    assert.ok(value.outputHash?.match(/^[a-f0-9]{64}$/));
    if(value.priceHidden){assert.equal(value.svgPaths,0);assert.equal(value.inputVisible,'false');assert.ok(!value.svgText.includes('$'),'Hidden frame exposed a price axis');}
    else assert.ok(value.originBoundary&&value.clip?.startsWith('url(#'));
    assert.ok(value.actualThrough===''||value.actualThrough<=value.cursor,'Future actual appears in the chart');
    assert.ok(value.candleDates.every(date=>date<=value.cursor),'Future candle appears');
    assert.ok(Math.max(value.rootWidth,value.bodyWidth)<=width+1,'Replay caused horizontal page overflow');
    evidence.states.push({label,...value,forecastPath:undefined,actualPath:undefined,
      forecastPathSha256:value.forecastPath===null?null:digest(value.forecastPath),actualPathSha256:value.actualPath===null?null:digest(value.actualPath)});
    if(capture){await evaluate(cdp,s=>document.querySelector(s).scrollIntoView({block:'center',behavior:'instant'}),control('chart'));await settled(cdp);await screenshot(cdp,prefix+'-'+label+'.png',receipt);}
    return value;
  }
  async function chartKey(value,code,number){await click(cdp,control('chart'));await key(value,code,number);}
  async function exported(label){
    const before=await snapshot(label+'-before-export'),parent=resolve(outputDirectory,'replay-downloads',prefix);
    await mkdir(parent,{recursive:true});
    const directory=await mkdtemp(resolve(parent,label+'-'));
    const existing=new Set(await readdir(directory));
    await browser.send('Browser.setDownloadBehavior',{behavior:'allow',downloadPath:directory,eventsEnabled:true});
    await click(cdp,control('export'));
    const file=await until(async()=>{const files=(await readdir(directory)).filter(name=>!existing.has(name)&&name.endsWith('.json'));assert.ok(files.length<=1,'Ambiguous JSON download');return files[0];},'actual replay JSON download');
    const bytes=await readFile(resolve(directory,file)),payload=JSON.parse(bytes.toString('utf8'));
    assert.equal(payload.kind,'atlas-visible-replay-frame');assert.equal(payload.identity.symbol,symbol);assert.equal(payload.identity.outputHash,before.outputHash);
    assert.equal(payload.frame.cursorDate,before.cursor);assert.equal(payload.frame.cursorIndex,before.index);assert.equal(payload.frame.actual.length,before.actualCount);
    assert.ok(payload.frame.actual.every(row=>row.date<=before.cursor),'Export leaked future actual observations');
    for(const row of payload.frame.actual){
      const source=observed.get(row.date);assert.ok(source,'Actual row missing from preserved source');assert.equal(row.price,source.price);
      if(!btc)for(const key of ['open','high','low','close'])assert.equal(row[key],source[key],'Export changed genuine OHLC');
    }
    assert.ok(payload.frame.dailyComparisons.every(row=>row.date<=before.cursor));
    for(const row of payload.frame.targets)if(row.targetDate>before.cursor){assert.equal(row.actual,null);assert.equal(row.actualVintage,null);}
    assert.equal(payload.frame.policy.releaseAuthorized,false);assert.equal(payload.frame.policy.productionPromoted,false);assert.equal(payload.frame.metrics.calibrated,false);
    assert.equal(payload.frame.metrics.independentSampleCount,null);
    evidence.exports.push({label,file:relative(outputDirectory,resolve(directory,file)),bytes:bytes.length,sha256:digest(bytes),cursor:before.cursor,
      actualCount:payload.frame.actual.length,actualDates:payload.frame.actual.map(row=>row.date),forecastSha256:digest(JSON.stringify(payload.frame.forecast)),outputHash:payload.identity.outputHash,
      targets:payload.frame.targets.map(({horizonDays,status,actual})=>({horizonDays,status,actual}))});
    return payload;
  }
  async function focusCheck(){
    await click(cdp,control('chart'));await key('Tab','Tab',9);
    const focus=await evaluate(cdp,s=>{
      const el=document.activeElement,box=el.getBoundingClientRect(),style=getComputedStyle(el),clip={left:0,right:innerWidth,top:0,bottom:innerHeight};
      for(let parent=el.parentElement;parent;parent=parent.parentElement){
        const r=parent.getBoundingClientRect(),css=getComputedStyle(parent);
        if(css.overflowX!=='visible'){clip.left=Math.max(clip.left,r.left+parent.clientLeft);clip.right=Math.min(clip.right,r.left+parent.clientLeft+parent.clientWidth);}
        if(css.overflowY!=='visible'){clip.top=Math.max(clip.top,r.top+parent.clientTop);clip.bottom=Math.min(clip.bottom,r.top+parent.clientTop+parent.clientHeight);}
      }
      const hit=document.elementFromPoint(box.left+box.width/2,box.top+box.height/2);
      return {inside:document.querySelector(s).contains(el),tag:el.tagName,label:el.getAttribute('aria-label'),left:box.left,right:box.right,top:box.top,bottom:box.bottom,
        outline:style.outlineStyle,outlineWidth:parseFloat(style.outlineWidth),clip,topmost:Boolean(hit&&(el===hit||el.contains(hit)))};
    },dialog);
    assert.ok(focus.inside&&focus.topmost,'Native keyboard focus is outside/occluded');assert.ok(focus.outlineWidth>=2&&focus.outline!=='none','Visible keyboard focus ring missing');
    assert.ok(focus.left>=focus.clip.left-1&&focus.right<=focus.clip.right+1&&focus.top>=focus.clip.top-1&&focus.bottom<=focus.clip.bottom+1,'Keyboard focus is clipped: '+JSON.stringify(focus));
    evidence.focus=focus;await screenshot(cdp,prefix+'-keyboard-focus.png',receipt);
  }

  if(btc){
    await until(()=>evaluate(cdp,()=>Boolean(document.querySelector('#lab-chart path'))),'BTC chart ready');
    await verifyOfflineRefresh({phase:'replay-entry'});
  }
  await open();visibleBounds(await bounds(cdp,dialog),width,height);
  const initial=await snapshot('recorded-origin',{capture:true});assert.equal(initial.index,0);assert.equal(initial.actualCount,0);assert.equal(initial.actualPath,null);
  assert.ok(initial.forecastPoints>1&&initial.forecastPath);assert.equal(initial.candlesDisabled,btc);
  const original=await exported('recorded-origin');
  const entry=index.entries.find(row=>row.id===initial.recordId);assert.ok(entry,'Opened record is not in preserved ledger');
  const record=JSON.parse(await readFile(resolve(ledger,entry.recordPath),'utf8'));
  assert.equal(original.identity.recordId,record.id);assert.equal(original.identity.outputHash,record.outputHash);
  assert.equal(original.identity.pointMeaning,btc?'preserved-conditional-btc-path':'preserved-sampled-eth-example');
  assert.ok(initial.disclosure.includes(original.identity.pointLabel)&&initial.metricNote.includes(original.identity.pointLabel),'Saved path interpretation is missing from the visible comparison');
  const columns=record.output.columns,stored=new Map(record.output.path.map(row=>[row[0],row]));
  for(const row of original.frame.forecast)for(const key of ['price','lower','upper','baselinePrice'])assert.equal(row[key],stored.get(row.date)[columns.indexOf(key)]??null,'Export changed preserved forecast '+key);
  await click(cdp,control('next'));
  const first=await snapshot('recorded-next');assert.equal(first.index,1);assert.equal(first.cursor,nextDate(initial.cursor));assert.equal(first.actualCount,btc?0:1);assert.equal(first.outputHash,initial.outputHash);
  await chartKey('End','End',35);const last=await snapshot('recorded-latest',{capture:true});
  assert.equal(last.index,last.lastIndex);assert.equal(last.actualCount,btc?0:2);assert.ok(last.targets.every(row=>row.at(-1)==='미도래 · 대기'));
  assert.ok(last.cursor<=new Date().toISOString().slice(0,10),'Cursor advanced beyond actual evaluation date');
  if(!btc){
    await select(control('clock'),'information-time');
    await chartKey('Home','Home',36);const strictOrigin=await snapshot('strict-before-issuance',{capture:true});assert.equal(strictOrigin.forecastPoints,0);assert.equal(strictOrigin.actualCount,0);assert.equal(strictOrigin.priceHidden,true);
    const hidden=await exported('strict-before-issuance');assert.equal(hidden.frame.inputPrices.length,0);assert.equal(hidden.frame.rows.length,0);assert.equal(hidden.frame.priceDomain,null);assert.equal(hidden.frame.selected.flat,null);
    await click(cdp,control('scrub'));await key('Home','Home',36);
    const collectionDate=ethArchive.replayProvenance.collectedAt.slice(0,10),beforeCollectionIndex=(Date.parse(collectionDate)-Date.parse(initial.cursor))/86400000-1;
    for(let i=0;i<beforeCollectionIndex;i++)await key('ArrowRight','ArrowRight',39,0,{wait:false});await settled(cdp);
    const beforeCollection=await snapshot('strict-before-collection');assert.equal(beforeCollection.actualCount,0);
    await click(cdp,control('next'));const afterCollection=await snapshot('strict-after-collection');assert.equal(afterCollection.actualCount,2);
    const strict=await exported('strict-current');
    assert.ok(strict.frame.actual.every(row=>row.collectedAt<=strict.frame.evaluationAt&&row.eventAt<=strict.frame.evaluationAt));
    assert.ok(strict.frame.targets.every(row=>row.status==='pending'));
    await select(control('clock'),'observed-date');
  }
  await chartKey('Home','Home',36);const rewound=await snapshot('recorded-rewind');
  assert.equal(rewound.outputHash,initial.outputHash);assert.equal(rewound.forecastPath,initial.forecastPath);assert.equal(rewound.actualCount,0);
  await select(control('mode'),'historical-reconstruction');await ready();
  const history=await snapshot('historical-origin',{capture:true});assert.equal(history.actualCount,0);assert.equal(history.index,0);
  assert.ok(history.disclosure.includes('과거 재구성')&&history.disclosure.includes('당시 실제 발행본')&&history.disclosure.includes('실전 성과'));
  assert.ok(history.disclosure.includes(btc?'축소 추세 기준모형':'중앙 경로'));
  assert.ok(history.metricNote.includes('전향 성과에 합산하지 않습니다'));
  await click(cdp,control('next'));const historyOne=await snapshot('historical-next');assert.equal(historyOne.actualCount,1);assert.equal(historyOne.index,1);
  const historyExport=await exported('historical-one-bar');assert.equal(historyExport.frame.actual.length,1);assert.equal(historyExport.identity.historicalModelExistedAtOrigin,false);
  assert.equal(historyExport.identity.pointMeaning,btc?'shrunken-trend-baseline':'simulation-median');
  if(!btc)assert.equal(historyExport.identity.bandMeaning,'uncalibrated-raw-simulation-quantiles-10-90');
  await chartKey('End','End',35);const historyEnd=await snapshot('historical-end',{capture:true});assert.equal(historyEnd.index,historyEnd.lastIndex);assert.ok(historyEnd.actualCount>30);assert.equal(historyEnd.outputHash,history.outputHash);
  const endExport=await exported('historical-end');assert.deepEqual(endExport.frame.forecast,historyExport.frame.forecast,'Playback recomputed fixed forecast values');
  assert.equal(endExport.frame.metrics.scoredTargetCount,0);assert.ok(endExport.frame.metrics.retrospectiveTargetCount>0);
  await chartKey('Home','Home',36);await click(cdp,control('next'));const historyAgain=await snapshot('historical-next-again');
  for(const name of ['outputHash','cursor','forecastPath','actualPath','metrics'])assert.equal(historyAgain[name],historyOne[name],'Rewind changed '+name);
  await click(cdp,control('scrub'));await key('End','End',35);assert.equal((await snapshot('range-end')).index,historyEnd.lastIndex);
  await key('Home','Home',36);assert.equal((await snapshot('range-origin')).actualCount,0);
  await key('ArrowRight','ArrowRight',39);assert.equal((await snapshot('range-one-bar')).actualCount,1);
  if(!btc){
    await select(control('display'),'candles');const candles=await snapshot('genuine-candles',{capture:true});assert.equal(candles.candleDates.length,1);assert.equal(candles.actualPath,null);
    assert.equal(candles.candleDates[0],historyOne.cursor);assert.ok(candles.candleTitles[0].includes('실제 시가')&&candles.candleTitles[0].includes('고가')&&candles.candleTitles[0].includes('저가'));
    await chartKey('Home','Home',36);assert.equal((await snapshot('candles-rewind')).candleDates.length,0);
    await select(control('display'),'line');
    await select(control('model'),'adaptive');await ready();const adaptive=await snapshot('adaptive-reconstruction');
    assert.ok(adaptive.disclosure.includes('adaptive'));assert.notEqual(adaptive.outputHash,history.outputHash);assert.equal(adaptive.actualCount,0);
    await select(control('model'),'pooled');await ready();assert.equal((await snapshot('pooled-repeated')).outputHash,history.outputHash);
  }
  await focusCheck();
  await select(control('speed'),'4');await click(cdp,control('play'));
  await until(async()=>Number((await snapshot('playing')).index)>2,'native autoplay advances');
  await click(cdp,control('play'));const paused=await snapshot('paused');assert.equal(paused.playback,'paused');
  await delay(500);const stopped=await snapshot('pause-stable');assert.equal(stopped.index,paused.index);assert.equal(stopped.outputHash,paused.outputHash);
  evidence.lifecycle.push({label:'pause-stops-native-timer',index:paused.index,waitMilliseconds:500});
  operation='close-reopen';await click(cdp,control('play'));await click(cdp,close);
  assert.equal(await evaluate(cdp,s=>Boolean(document.querySelector(s)),dialog),false);
  await open();const reopened=await snapshot('reopened-after-playing');assert.equal(reopened.index,0);assert.equal(reopened.playback,'paused');
  await delay(500);assert.equal((await snapshot('reopen-stable')).index,0);evidence.lifecycle.push({label:'close-reopen-stops-old-timer',waitMilliseconds:500});
  await select(control('mode'),'historical-reconstruction');await ready();
  await select(control('speed'),'4');await click(cdp,control('play'));
  const options=await evaluate(cdp,s=>[...document.querySelector(s).options].map(o=>o.value),recordSelect),replacement=options.find(value=>value!==reopened.recordId);
  assert.ok(replacement,'Record-switch regression needs another real preserved record');
  operation='record-switch';await select(recordSelect,replacement);await ready();const changed=await snapshot('record-replaced');assert.equal(changed.recordId,replacement);assert.equal(changed.index,0);assert.equal(changed.playback,'paused');
  assert.notEqual(changed.outputHash,reopened.outputHash);await delay(500);assert.equal((await snapshot('replacement-stable')).index,0);
  evidence.lifecycle.push({label:'record-switch-stops-old-timer',recordId:replacement,waitMilliseconds:500});
  if(!btc&&width===1440){
    operation='delayed-load-replacement';await click(cdp,close);
    const pausedRequests=[];
    cdp.on('Fetch.requestPaused',event=>pausedRequests.push(event));
    await cdp.send('Fetch.enable',{patterns:[{urlPattern:new URL(archivePath,receipt.url).href,requestStage:'Response'}]});
    try{
      await open({wait:false});await until(()=>pausedRequests.length===1,'first real archive response held');
      const abandoned=pausedRequests[0];assert.ok(abandoned.networkId);assert.equal(abandoned.responseStatusCode,200);
      assert.equal(await evaluate(cdp,s=>document.querySelector(s).dataset.state,panel),'loading');
      await click(cdp,close);await open({wait:false});await until(()=>pausedRequests.length===2,'replacement archive response held');
      const replacementRequest=pausedRequests[1];assert.ok(replacementRequest.networkId);assert.notEqual(replacementRequest.networkId,abandoned.networkId);
      await cdp.send('Fetch.continueResponse',{requestId:replacementRequest.requestId});await ready();
      const replacementFrame=await snapshot('delayed-load-replaced');assert.equal(replacementFrame.recordId,replacement);assert.equal(replacementFrame.index,0);
      let lateFailureOutcome='delivered-to-abandoned-request';
      try{await cdp.send('Fetch.failRequest',{requestId:abandoned.requestId,errorReason:'Failed'});}
      catch(error){
        assert.match(error.message,/Invalid InterceptionId|Invalid interceptionId|Invalid interception id/,'Unexpected CDP fault-control error');
        lateFailureOutcome='browser-retired-aborted-request-before-late-failure';
      }
      await delay(500);const stable=await snapshot('late-failure-did-not-replace-frame');assert.equal(stable.outputHash,replacementFrame.outputHash);assert.equal(stable.index,0);assert.equal(stable.state,'ready');
      evidence.lifecycle.push({label:'delayed-response-close-reopen',abandonedRequestId:abandoned.networkId,replacementRequestId:replacementRequest.networkId,
        responseStatus:replacementRequest.responseStatusCode,lateFailureOutcome,waitMilliseconds:500});
      const abandonedRequest=evidence.archiveRequests.find(row=>row.requestId===abandoned.networkId);assert.ok(abandonedRequest);abandonedRequest.controlledLateFailure=true;
    }finally{await cdp.send('Fetch.disable');}
  }
  operation='final-close';
  visibleBounds(await bounds(cdp,close),width,height);await click(cdp,close);
  for(const request of evidence.archiveRequests.filter(row=>row.status==='failed')){
    const lifecycleOperation=['close-reopen','record-switch','delayed-load-replacement'].includes(request.operation);
    assert.ok(lifecycleOperation,'Archive request failed outside a verified replacement: '+JSON.stringify(request));
    assert.equal(request.method,'GET');assert.ok(request.errorText==='net::ERR_ABORTED'&&request.canceled||request.controlledLateFailure&&request.errorText==='net::ERR_FAILED','Unexpected archive failure: '+JSON.stringify(request));
    const completed=evidence.archiveRequests.find(row=>row.operation===request.operation&&row.startedAt>request.startedAt&&row.status==='finished');
    assert.ok(completed,'Canceled archive load lacks a later completed replacement: '+JSON.stringify(request));
    const errors=receipt.resourceErrors.filter(error=>error.requestId===request.requestId);
    assert.equal(errors.length,1);const error=errors[0];assert.equal(error.networkEvent,'Network.loadingFailed');assert.equal(error.url,request.url);assert.equal(error.frameId,request.frameId);assert.equal(error.loaderId,request.loaderId);assert.equal(error.errorText,request.errorText);
    evidence.expectedCanceledRequests.push({...request,replacementRequestId:completed.requestId,interpretation:'Exact obsolete request canceled by the verified native replacement; the later preserved record rendered and stayed ready.'});
  }
}
