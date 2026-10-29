import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const source=readFileSync(new URL('../dist/journal-entry.js',import.meta.url),'utf8');
assert.match(source,/\bexport\s+function mountJournalEntry\b/);
const script=source.replace(/\bexport(?=\s+function mountJournalEntry\b)/,'');

function deferred(){
  let resolve,reject;
  const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});
  return {promise,resolve,reject};
}
async function flush(){for(let i=0;i<24;i++)await Promise.resolve();}
function surface(properties={}){
  const listeners=new Map(),events=[];
  return {...properties,events,
    addEventListener(type,callback){
      if(!listeners.has(type))listeners.set(type,[]);
      listeners.get(type).push(callback);
    },
    dispatchEvent(event){
      events.push(event);
      for(const callback of listeners.get(event.type)||[])callback(event);
      return true;
    }
  };
}
function trigger(kind,value,owner=null){
  return {isConnected:true,hidden:false,rects:[{}],owner,
    dataset:kind==='asset'?{openAssetForecastJournal:value}:{openForecastJournal:value},
    getClientRects(){return this.rects;},
    closest(selector){
      if(selector==='dialog')return this.owner;
      if(selector==='[hidden],[inert],[aria-hidden="true"]')return this.hidden?this:null;
      if(selector==='[data-open-asset-forecast-journal]')return kind==='asset'?this:null;
      if(selector==='[data-open-forecast-journal]')return kind==='btc'?this:null;
      return null;
    }
  };
}
function harness(){
  const asset=deferred(),forecast=deferred(),opened=[],errors=[];
  const announcement={textContent:''};
  const document=surface({visibilityState:'visible',activeElement:null,
    getElementById:id=>id==='workbench-announcement'?announcement:null});
  const window=surface();
  const calls={asset:0,forecast:0};
  const assetModule={openAssetForecastJournal(args){opened.push({kind:'asset',value:args.symbol,opener:args.opener});}};
  const forecastModule={openForecastJournal(args){opened.push({kind:'btc',value:args.tab,opener:args.opener});}};
  class CustomEvent{constructor(type,options={}){this.type=type;this.detail=options.detail;}}
  const context=vm.createContext({document,window,CustomEvent,console:{error:(...args)=>errors.push(args)}});
  vm.runInContext(script,context,{filename:'dist/journal-entry.js'});
  context.mountJournalEntry({
    loadAssetModule:()=>{calls.asset++;return asset.promise;},
    loadForecastModule:()=>{calls.forecast++;return forecast.promise;}
  });
  function click(opener){
    const event={type:'click',target:opener,defaultPrevented:false,
      preventDefault(){this.defaultPrevented=true;}};
    document.dispatchEvent(event);
    assert.equal(event.defaultPrevented,true);
  }
  function request(kind,value,opener){
    document.dispatchEvent({type:kind==='asset'?'atlas:asset-forecast-journal':'atlas:forecast-journal',
      detail:kind==='asset'?{symbol:value,opener}:{tab:value,opener}});
  }
  return {asset,forecast,assetModule,forecastModule,opened,errors,announcement,document,window,calls,click,request};
}
function assertNoFeedback(h){
  assert.equal(h.document.events.filter(event=>event.type==='atlas:action-feedback').length,0);
  assert.equal(h.announcement.textContent,'');
  assert.equal(h.errors.length,0);
}
test('delayed asset import cannot reopen a closed origin dialog',async()=>{
  const h=harness(),owner={isConnected:true,open:true},opener=trigger('asset','ETHUSD',owner);
  h.click(opener);
  await flush();
  assert.equal(h.calls.asset,1);
  owner.open=false;
  h.asset.resolve(h.assetModule);
  await flush();
  assert.deepEqual(h.opened,[]);
  assertNoFeedback(h);
});
test('delayed asset import cannot open for a detached opener',async()=>{
  const h=harness(),opener=trigger('asset','BMNR');
  h.request('asset','BMNR',opener);
  await flush();
  assert.equal(h.calls.asset,1);
  opener.isConnected=false;
  h.asset.resolve(h.assetModule);
  await flush();
  assert.deepEqual(h.opened,[]);
  assertNoFeedback(h);
});
for(const eventType of ['atlas:modal-open','pagehide']){
  test(eventType+' revokes the pending asset import owner',async()=>{
    const h=harness(),opener=trigger('asset','ETHUSD');
    h.click(opener);
    await flush();
    assert.equal(h.calls.asset,1);
    (eventType==='pagehide'?h.window:h.document).dispatchEvent({type:eventType});
    h.asset.resolve(h.assetModule);
    await flush();
    assert.deepEqual(h.opened,[]);
    assertNoFeedback(h);
  });
}
test('the newest ETH or BMNR request owns their shared delayed asset import',async()=>{
  for(const symbols of [['ETHUSD','BMNR'],['BMNR','ETHUSD']]){
    const h=harness(),first=trigger('asset',symbols[0]),latest=trigger('asset',symbols[1]);
    h.click(first);
    await flush();
    h.request('asset',symbols[1],latest);
    await flush();
    assert.equal(h.calls.asset,1,'concurrent asset requests share one module load');
    h.asset.resolve(h.assetModule);
    await flush();
    assert.deepEqual(h.opened,[{kind:'asset',value:symbols[1],opener:latest}]);
    assertNoFeedback(h);
  }
});
test('the newest request wins across asset and BTC channels even when the old import resolves last',async()=>{
  for(const latestKind of ['asset','btc']){
    const h=harness(),assetOpener=trigger('asset','BMNR'),btcOpener=trigger('btc','records');
    if(latestKind==='btc'){
      h.request('asset','BMNR',assetOpener);
      await flush();
      h.click(btcOpener);
    }else{
      h.click(btcOpener);
      await flush();
      h.request('asset','BMNR',assetOpener);
    }
    await flush();
    assert.equal(h.calls.asset,1);
    assert.equal(h.calls.forecast,1);
    const latest=latestKind==='asset'?h.asset:h.forecast;
    const old=latestKind==='asset'?h.forecast:h.asset;
    latest.resolve(latestKind==='asset'?h.assetModule:h.forecastModule);
    await flush();
    const expected=[{kind:latestKind,value:latestKind==='asset'?'BMNR':'records',
      opener:latestKind==='asset'?assetOpener:btcOpener}];
    assert.deepEqual(h.opened,expected);
    old.resolve(latestKind==='asset'?h.forecastModule:h.assetModule);
    await flush();
    assert.deepEqual(h.opened,expected,'obsolete channel cannot open a second modal');
    assertNoFeedback(h);
  }
});
