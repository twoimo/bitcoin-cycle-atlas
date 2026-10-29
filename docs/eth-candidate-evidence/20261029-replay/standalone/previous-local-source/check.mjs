import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {chromium}=require('/opt/codex/runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright-core');
const policyPath='/workspace/scratch/62c67615b721/bitcoin-cycle-atlas/scripts/btc-offline-refresh-policy.mjs';
const {isExpectedOfflineBtcRefresh}=await import(pathToFileURL(policyPath).href);
const artifact=process.argv[2]??'/workspace/scratch/62c67615b721/bitcoin-cycle-atlas/build/Bitcoin_Cycles_Comparison.html';
const output=process.argv[3]??'/tmp/atlas-standalone-native';
const sha=value=>createHash('sha256').update(value).digest('hex');
const raw=await readFile(artifact),html=raw.toString('utf8');
const data=id=>JSON.parse(html.match(new RegExp('<script id="'+id+'" type="application/json">([\\s\\S]*?)<\\/script>'))[1]);
const publication=data('atlas-publication'),replayArchives=data('atlas-replay-price-archives'),btcArchive=data('atlas-forecast-ledger'),assetArchive=data('atlas-asset-forecast-ledger');
const btcInput=data('embedded-btc-data'),btcAsOf=btcInput.prices.at(-1)[0];
const report={schemaVersion:1,kind:'atlas-standalone-native-replay-acceptance',status:'running',startedAt:new Date().toISOString(),artifact,artifactBytes:raw.byteLength,artifactSha256:sha(raw),
  publicationSourceCommit:publication.sourceCommit,publicationManifestSha256:publication.manifestSha256,publicationSourceTree:publication.sourceTree,
  expectedOfflineRefreshPolicySha256:sha(await readFile(policyPath)),
  browserVersion:null,scope:'Actual Chrome file:// artifact; native pointer/keyboard/select actions and real downloaded JSON. No production deployment or physical-device claim.',cases:[]};
await mkdir(output,{recursive:true});
const root='dialog[open] .forecast-replay',panel='dialog[open] [data-forecast-replay]',control=name=>'dialog[open] [data-replay-'+name+']';
let browser;
async function waitReady(page){
  await page.locator(panel+'[data-state="ready"]').waitFor({timeout:45000});
  assert.equal(await page.locator(panel).count(),1,'one owned replay panel');
}
async function openJournal(page,symbol){
  if(symbol==='BTCUSD'){
    await page.locator('#workbench-workspace').click();
    await page.locator('#workspace-dialog input[type="search"]').fill('예측 기록과 누적 평가');
    await page.locator('#workspace-dialog .workspace-command').filter({hasText:'예측 기록과 누적 평가'}).click();
    await page.locator('#forecast-journal[open]').waitFor();
    const tab=page.locator('dialog[open] [data-journal-tab="replay"]');
    if(await tab.getAttribute('aria-pressed')!=='true')await tab.click();
  }else{
    await page.locator(symbol==='ETHUSD'?'[data-eth-action="forecast"]':'[data-equity-action="forecast"]').click();
    await page.locator('dialog[open] [data-open-asset-forecast-journal="'+symbol+'"]').click();
    await page.locator('#asset-forecast-journal[open][data-state="ready"]').waitFor({timeout:45000});
    const tab=page.locator('dialog[open] [data-asset-journal-tab="replay"]');
    if(await tab.getAttribute('aria-pressed')!=='true')await tab.click();
  }
  await waitReady(page);
}
async function key(page,name){await page.locator(control('chart')).focus();await page.keyboard.press(name);}
async function screenshot(page,receipt,label){
  const name=receipt.id+'-'+label+'.png',path=resolve(output,name);
  await page.screenshot({path,fullPage:false});receipt.screenshots.push({name,path,sha256:sha(await readFile(path))});
}
async function exportFrame(page,receipt,label){
  const event=page.waitForEvent('download');
  await page.locator(control('export')).click();
  const download=await event,path=resolve(output,receipt.id+'-'+label+'.json');
  await download.saveAs(path);
  const bytes=await readFile(path),saved=JSON.parse(bytes);
  assert.equal(saved.kind,'atlas-visible-replay-frame');assert.equal(saved.identity.symbol,receipt.symbol);
  assert.equal(Object.hasOwn(saved,'session'),false);assert.equal(Object.hasOwn(saved,'observations'),false);
  const frame=saved.frame;
  assert(frame.actual.every(row=>row.date<=frame.cursorDate&&(!row.eventAt||row.eventAt<=frame.evaluationAt)),'no unrevealed actual rows exported');
  assert(frame.dailyComparisons.every(row=>row.date<=frame.cursorDate),'no future daily comparison exported');
  assert(frame.targets.filter(row=>row.targetDate>frame.cursorDate||row.eventAt>frame.evaluationAt).every(row=>row.actual===null),'future target actual remains null');
  receipt.exports.push({label,path,sha256:sha(bytes),bytes:bytes.length,cursor:frame.cursorDate,clockMode:frame.clockMode,mode:saved.mode,actualCount:frame.actual.length,
    inputVisible:frame.inputVisible,forecastVisible:frame.forecastVisible,outputHash:saved.identity.outputHash,matchedCount:frame.metrics.matchedCount});
  return saved;
}
async function inspect(page){return page.locator(panel).evaluate(node=>{
  const chart=node.querySelector('[data-replay-chart]'),svgBox=chart.getBoundingClientRect(),dialog=node.closest('dialog'),box=dialog.getBoundingClientRect();
  const close=dialog.querySelector('header button'),closeBox=close.getBoundingClientRect(),hit=document.elementFromPoint(closeBox.left+closeBox.width/2,closeBox.top+closeBox.height/2);
  return {state:node.dataset.state,playback:node.dataset.playback,cursor:node.dataset.cursor,outputHash:node.dataset.outputHash,chart:{...chart.dataset},
    viewport:{width:innerWidth,height:innerHeight},dialog:{left:box.left,right:box.right,top:box.top,bottom:box.bottom,scrollWidth:dialog.scrollWidth,clientWidth:dialog.clientWidth},
    close:{left:closeBox.left,right:closeBox.right,top:closeBox.top,bottom:closeBox.bottom,topmost:hit===close||close.contains(hit)},chartBox:{width:svgBox.width,height:svgBox.height},
    disclosure:node.querySelector('[data-replay-disclosure]').textContent,metrics:node.querySelector('[data-replay-metrics]').textContent,
    targets:node.querySelector('[data-replay-targets]').textContent,empty:node.querySelector('[data-replay-empty]').textContent,selection:node.querySelector('[data-replay-selection]').textContent,
    scroll:document.documentElement.scrollWidth,svgText:chart.textContent};
});}
async function strictCase(page,receipt){
  assert.equal(await page.locator(control('clock')+' option[value="information-time"]').isDisabled(),false,'recorded acquisition clock available');
  await page.locator(control('clock')).selectOption('information-time');await key(page,'Home');
  const hidden=await exportFrame(page,receipt,'strict-hidden');
  assert.equal(hidden.frame.inputVisible,false);assert.equal(hidden.frame.forecastVisible,false);
  assert.deepEqual(hidden.frame.inputPrices,[]);assert.deepEqual(hidden.frame.forecast,[]);assert.deepEqual(hidden.frame.actual,[]);assert.deepEqual(hidden.frame.rows,[]);
  assert.equal(hidden.frame.selected.flat,null);assert.equal(hidden.frame.priceDomain,null);assert.equal(hidden.frame.metrics.matchedCount,0);
  const state=await inspect(page);assert.equal(state.chart.replayPriceHidden,'true');assert.equal(state.chart.replayInputVisible,'false');assert(!state.svgText.includes('$'));
  receipt.strictHidden={...state,inputAvailableAt:hidden.identity.inputAvailableAt,evaluationAt:hidden.frame.evaluationAt};
  await page.locator(control('chart')).scrollIntoViewIfNeeded();await screenshot(page,receipt,'strict-hidden');
  await key(page,'End');const revealed=await exportFrame(page,receipt,'strict-end');
  assert.equal(revealed.frame.inputVisible,true);assert.equal(revealed.identity.outputHash,hidden.identity.outputHash);
  receipt.strictEnd={actual:revealed.frame.actual.length,matched:revealed.frame.metrics.matchedCount,evaluationAt:revealed.frame.evaluationAt};
  await page.locator(control('clock')).selectOption('observed-date');
}
async function historyCase(page,receipt){
  await page.locator(control('mode')).selectOption('historical-reconstruction');await waitReady(page);
  const start=await exportFrame(page,receipt,'historical-start');assert.equal(start.mode,'historical-reconstruction');
  assert.equal(start.frame.actual.length,0);assert.equal(start.identity.recordKind,'reconstructed');
  const forecast=sha(JSON.stringify(start.frame.forecast));
  await page.locator(control('speed')).selectOption('4');await page.locator(control('play')).click();
  await page.waitForFunction(selector=>Number(document.querySelector(selector)?.value)>2,control('scrub'),{timeout:5000});
  await page.locator(control('play')).click();assert.equal(await page.locator(panel).getAttribute('data-playback'),'paused');
  await key(page,'ArrowRight');await key(page,'ArrowLeft');
  await key(page,'End');
  const end=await exportFrame(page,receipt,'historical-end');assert.equal(sha(JSON.stringify(end.frame.forecast)),forecast);assert.equal(end.identity.outputHash,start.identity.outputHash);
  assert(end.frame.metrics.matchedCount>=90,'historical reconstruction reveals an elapsed period');
  assert.equal(end.frame.metrics.scoredTargetCount,0,'historical reconstruction is not prospective success');
  await page.locator(control('chart')).scrollIntoViewIfNeeded();await screenshot(page,receipt,'historical-end');
  await key(page,'Home');const rewind=await exportFrame(page,receipt,'historical-rewind');
  assert.equal(rewind.frame.actual.length,0);assert.equal(sha(JSON.stringify(rewind.frame.forecast)),forecast);
  assert.deepEqual(rewind.frame.priceDomain,start.frame.priceDomain,'rewind restores an axis based only on the currently visible prices');
  const chartBox=await page.locator(control('chart')).boundingBox();
  await page.locator(control('chart')).hover({position:{x:chartBox.width*.75,y:chartBox.height*.5}});
  receipt.historyHover=await page.locator(control('selection')).innerText();
  assert.match(receipt.historyHover,/공개 실제 미공개/,'hover cannot expose a future actual');
  receipt.history={origin:start.identity.asOf,outputHash:start.identity.outputHash,forecastSha256:forecast,terminalCursor:end.frame.cursorDate,
    terminalMatched:end.frame.metrics.matchedCount,terminalMetrics:end.frame.metrics,rewoundActual:rewind.frame.actual.length};
}
async function runCase(spec){
  const receipt={...spec,status:'running',screenshots:[],exports:[],requests:[],outboundRequests:[],failedRequests:[],networkFailures:[],expectedOfflineRefresh:[],runtimeErrors:[],consoleErrors:[]};report.cases.push(receipt);
  const context=await browser.newContext({viewport:{width:spec.width,height:spec.height},acceptDownloads:true,reducedMotion:'reduce',colorScheme:'dark'});
  const page=await context.newPage();page.setDefaultTimeout(30000);
  page.on('pageerror',error=>receipt.runtimeErrors.push(error.stack??error.message));
  page.on('console',message=>{if(message.type()==='error')receipt.consoleErrors.push(message.text());});
  page.on('request',request=>{const url=request.url();if(!url.startsWith('data:'))receipt.requests.push({url,method:request.method(),type:request.resourceType()});if(/^https?:/.test(url))receipt.outboundRequests.push({url,method:request.method(),type:request.resourceType()});});
  page.on('requestfailed',request=>receipt.failedRequests.push({url:request.url(),error:request.failure()?.errorText,type:request.resourceType()}));
  const cdp=await context.newCDPSession(page),networkRequests=new Map();
  cdp.on('Network.requestWillBeSent',event=>networkRequests.set(event.requestId,{requestId:event.requestId,frameId:event.frameId,loaderId:event.loaderId,method:event.request.method,
    resourceType:event.type,requestWallTime:event.wallTime,documentUrl:event.documentURL,url:event.request.url}));
  cdp.on('Network.loadingFailed',event=>receipt.networkFailures.push({...networkRequests.get(event.requestId),networkEvent:'Network.loadingFailed',errorText:event.errorText,canceled:event.canceled??false,blockedReason:event.blockedReason??null}));
  await cdp.send('Network.enable');await cdp.send('Network.setBlockedURLs',{urls:['http://*','https://*']});
  try{
    const url=pathToFileURL(artifact);url.searchParams.set('page','outlook');if(spec.symbol!=='BTCUSD')url.searchParams.set('symbol',spec.symbol);url.searchParams.set('granularity','daily');url.searchParams.set('type','line');
    await page.goto(url.href,{waitUntil:'domcontentloaded',timeout:60000});
    await page.waitForFunction(()=>document.documentElement.dataset.boot==='ready',null,{timeout:60000});
    receipt.domPublication=await page.evaluate(()=>JSON.parse(document.getElementById('atlas-publication').textContent).sourceCommit);
    assert.equal(receipt.domPublication,report.publicationSourceCommit);
    await openJournal(page,spec.symbol);receipt.initial=await inspect(page);
    assert(receipt.initial.chartBox.width>150&&receipt.initial.chartBox.height>100,'visible chart');
    assert.equal(receipt.initial.chart.replayActualCount,'0');assert(Number(receipt.initial.chart.replayForecastPoints)>1);
    const original=await exportFrame(page,receipt,'recorded-start');
    const records=spec.symbol==='BTCUSD'?btcArchive.records:assetArchive.records;
    assert.equal(records[original.identity.recordId]?.outputHash,original.identity.outputHash,'frozen original output hash');
    assert.equal(original.frame.metrics.matchedCount,0);
    if(spec.symbol==='BTCUSD'||spec.symbol==='ETHUSD')await strictCase(page,receipt);
    if(spec.symbol==='ETHUSD'){
      await key(page,'End');await page.locator(control('display')).selectOption('candles');
      const end=await exportFrame(page,receipt,'recorded-candles');
      assert.equal(end.frame.metrics.matchedCount,2);assert.equal(end.frame.actual.length,2);
      assert.equal(await page.locator('dialog[open] [data-replay-candle-date]').count(),2);
      const source=JSON.parse(replayArchives.archives.ETHUSD.sourceText),originalRows=(source.dailyHistory??source).candles;
      for(const actual of end.frame.actual){const row=originalRows.find(row=>row.date.slice(0,10)===actual.date);for(const key of ['open','high','low','close'])assert.equal(actual[key],row[key]);}
      receipt.candles={count:end.frame.actual.length,dates:end.frame.actual.map(row=>row.date),matched:end.frame.metrics.matchedCount};
      await page.locator(control('chart')).scrollIntoViewIfNeeded();await screenshot(page,receipt,'recorded-candles');
    }
    if(spec.history)await historyCase(page,receipt);
    if(spec.symbol==='MSTR'||spec.symbol==='BMNR'){
      assert.equal(await page.locator(control('mode')+' option[value="historical-reconstruction"]').count(),0);
      await key(page,'End');const end=await exportFrame(page,receipt,'recorded-end');assert.equal(end.identity.outputHash,original.identity.outputHash);
      receipt.equity={scale:end.frame.scale,matched:end.frame.metrics.matchedCount,pending:end.frame.metrics.pendingTargetCount};
      await page.locator(control('chart')).scrollIntoViewIfNeeded();await screenshot(page,receipt,'recorded-end');
    }
    await page.locator(control('chart')).focus();await page.keyboard.press('Tab');
    receipt.keyboardFocus=await page.evaluate(()=>({tag:document.activeElement.tagName,inside:Boolean(document.activeElement.closest('dialog[open]')),outline:getComputedStyle(document.activeElement).outlineStyle}));
    assert(receipt.keyboardFocus.inside);assert.notEqual(receipt.keyboardFocus.outline,'none');
    const close=page.locator('dialog[open] [data-journal-close],dialog[open] [data-asset-journal-close]');
    await close.scrollIntoViewIfNeeded();receipt.final=await inspect(page);
    assert(receipt.final.dialog.left>=-1&&receipt.final.dialog.right<=spec.width+1);assert(receipt.final.dialog.top>=-1&&receipt.final.dialog.bottom<=spec.height+1);assert(receipt.final.scroll<=spec.width+1);assert(receipt.final.close.topmost);
    if(!await page.locator(control('play')).isDisabled()){
      await page.locator(control('play')).click();
      assert.equal(await page.locator(panel).getAttribute('data-playback'),'playing');
    }
    await close.click();assert.equal(await page.locator('dialog[open]').count(),0);
    const closedCursor=await page.locator('[data-forecast-replay]').last().getAttribute('data-cursor');
    await page.waitForTimeout(800);
    assert.equal(await page.locator('[data-forecast-replay]').last().getAttribute('data-cursor'),closedCursor,'closed panel owns no live playback timer');
    await openJournal(page,spec.symbol);receipt.reopened=await inspect(page);assert.equal(receipt.reopened.playback,'paused');assert.equal(receipt.reopened.outputHash,original.identity.outputHash);assert.equal(receipt.reopened.chart.replayActualCount,'0');
    await page.locator('dialog[open] [data-journal-close],dialog[open] [data-asset-journal-close]').click();
    assert.equal(receipt.runtimeErrors.length,0,'runtime errors');
    receipt.expectedOfflineRefresh=receipt.networkFailures.filter(error=>isExpectedOfflineBtcRefresh(error,{surface:spec.symbol==='BTCUSD'?'btc':'other',archiveAsOf:btcAsOf}));
    if(receipt.expectedOfflineRefresh.length){
      assert.equal(receipt.expectedOfflineRefresh.length,1,'only the known initial stale BTC refresh is expected');
      await page.waitForFunction(()=>document.getElementById('btc-refresh-notice')?.dataset.state==='failed');
      receipt.preservedBtc=await page.evaluate(()=>({cutoff:document.getElementById('sidebar-asof')?.textContent,
        notice:document.getElementById('btc-refresh-notice')?.dataset.state,summary:document.getElementById('btc-refresh-summary')?.textContent,
        detail:document.getElementById('btc-refresh-detail')?.textContent,title:document.getElementById('refresh-button')?.title,
        retainedLast:JSON.parse(document.getElementById('embedded-btc-data').textContent).prices.at(-1)}));
      assert.equal(receipt.preservedBtc.summary,'비트코인 일별 갱신 실패');
      assert.equal(receipt.preservedBtc.detail,btcAsOf.replaceAll('-','.')+' UTC 자료 유지');
      assert.equal(receipt.preservedBtc.cutoff,'관측 · '+btcAsOf.replaceAll('-','.')+' UTC');
      assert.deepEqual(receipt.preservedBtc.retainedLast,btcInput.prices.at(-1));
    }
    const expectedIds=new Set(receipt.expectedOfflineRefresh.map(row=>row.requestId)),expectedUrls=new Set(receipt.expectedOfflineRefresh.map(row=>row.url));
    receipt.unexpectedNetworkFailures=receipt.networkFailures.filter(row=>!expectedIds.has(row.requestId));
    receipt.unexpectedOutbound=receipt.outboundRequests.filter(row=>!expectedUrls.has(row.url));
    receipt.replayAndJournalNetworkRequests=[...networkRequests.values()].filter(row=>row.resourceType==='Fetch'&&!expectedIds.has(row.requestId));
    assert.equal(receipt.unexpectedOutbound.length,0,'unexpected outbound requests: '+JSON.stringify(receipt.unexpectedOutbound));
    assert.equal(receipt.unexpectedNetworkFailures.length,0,'unexpected resource failures: '+JSON.stringify(receipt.unexpectedNetworkFailures));
    assert.equal(receipt.outboundRequests.length,receipt.expectedOfflineRefresh.length,'only individually verified expected refresh requests');
    assert.equal(receipt.replayAndJournalNetworkRequests.length,0,'offline replay and journals require no fetch requests');
    receipt.status='passed';
  }catch(error){receipt.status='failed';receipt.error=error.stack??String(error);try{await screenshot(page,receipt,'failure');}catch{}}
  finally{await context.close();await writeFile(resolve(output,'receipt.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({id:receipt.id,status:receipt.status,error:receipt.error}));}
}
try{
  browser=await chromium.launch({executablePath:'/tmp/atlas-chrome/chrome-linux64/chrome',headless:true,args:['--no-sandbox','--disable-dev-shm-usage'],env:{...process.env,FONTCONFIG_FILE:'/tmp/atlas-fonts/fonts.conf'}});
  report.browserVersion=browser.version();
  for(const spec of [
    {id:'btc-desktop',symbol:'BTCUSD',width:1440,height:900,history:true},
    {id:'eth-desktop',symbol:'ETHUSD',width:1440,height:900,history:true},
    {id:'mstr-desktop',symbol:'MSTR',width:1440,height:900},
    {id:'bmnr-desktop',symbol:'BMNR',width:1440,height:900},
    {id:'eth-phone',symbol:'ETHUSD',width:320,height:568},
  ])await runCase(spec);
  report.status=report.cases.every(item=>item.status==='passed')?'passed':'failed';
}catch(error){report.status='failed';report.error=error.stack??String(error);}
finally{await browser?.close();report.finishedAt=new Date().toISOString();await writeFile(resolve(output,'receipt.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({status:report.status,artifactSha256:report.artifactSha256,publicationSourceCommit:report.publicationSourceCommit,cases:report.cases.map(({id,status})=>({id,status})),receipt:resolve(output,'receipt.json')}));if(report.status!=='passed')process.exitCode=1;}
