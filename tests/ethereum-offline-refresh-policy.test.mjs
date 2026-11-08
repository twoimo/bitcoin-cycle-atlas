import test from 'node:test';
import assert from 'node:assert/strict';
import {isExpectedOfflineBtcRefresh,isExpectedOfflineBtcRefreshForFrame,offlineBtcRefreshSurface} from '../scripts/btc-offline-refresh-policy.mjs';
import {consolidatedWorkspaceCases} from '../scripts/verify-consolidated-workspace-browser.mjs';
const policy={surface:'btc',archiveAsOf:'2026-10-25'};
const error={url:'https://community-api.coinmetrics.io/v4/timeseries/asset-metrics?assets=btc&metrics=PriceUSD&frequency=1d&start_time=2010-07-18&end_time=2026-10-27&page_size=10000&paging_from=start',
  networkEvent:'Network.loadingFailed',requestId:'1.2',frameId:'frame',loaderId:'document',method:'GET',resourceType:'Fetch',blockedReason:'inspector',errorText:'',
  requestWallTime:Date.parse('2026-10-27T04:00:00Z')/1000};
test('only the exact stale BTC archive request is eligible for a separately verified offline failure',()=>{
  for(const surface of ['btc','evidence','legacy','preview'])assert.equal(isExpectedOfflineBtcRefresh(error,{...policy,surface}),true);
  for(const surface of ['eth','data',undefined])assert.equal(isExpectedOfflineBtcRefresh(error,{...policy,surface}),false);
});
test('consolidated market cases bind the blocked BTC request to their observed native parent',()=>{
  const parent={nativeSymbol:'BTCUSD',page:'outlook',center:'market-us',preview:false};
  for(const spec of consolidatedWorkspaceCases){
    assert.equal(spec.surface,undefined,'The existing case inventory remains unchanged');
    assert.equal(isExpectedOfflineBtcRefresh(error,{...policy,surface:spec.surface}),false,'An omitted surface cannot qualify a request');
    const surface=offlineBtcRefreshSurface(spec,parent);
    assert.equal(surface,'btc');assert.equal(isExpectedOfflineBtcRefresh(error,{...policy,surface}),true);
    for(const change of [{url:error.url.replace('assets=btc','assets=eth')},{url:error.url+'&assets=btc'},
      {blockedReason:'other'},{resourceType:'Script'},{frameId:''},{loaderId:''},{requestId:''},{httpStatus:503}])
      assert.equal(isExpectedOfflineBtcRefresh({...error,...change},{...policy,surface}),false,'Owner binding must not broaden request eligibility');
  }
});
test('a consolidated child, other asset, wrong center or undeclared case cannot acquire BTC refresh ownership',()=>{
  const spec=consolidatedWorkspaceCases[0],parent={nativeSymbol:'BTCUSD',page:'outlook',center:'market-us',preview:false};
  for(const change of [{nativeSymbol:'ETHUSD'},{nativeSymbol:undefined},{page:'market'},{center:'data'},{center:undefined},{preview:true}]){
    const surface=offlineBtcRefreshSurface(spec,{...parent,...change});
    assert.equal(surface,undefined);assert.equal(isExpectedOfflineBtcRefresh(error,{...policy,surface}),false);
  }
  for(const candidate of [{...spec,page:'unknown'},{...spec,surface:'btc'},{}])
    assert.equal(offlineBtcRefreshSurface(candidate,parent),undefined);
  for(const surface of ['btc','evidence','legacy','preview','center-data'])
    assert.equal(offlineBtcRefreshSurface({surface},parent),surface,'Existing surface contracts are unchanged');
});
const evidenceOwner={owner:'active-evidence-child',nativeSymbol:'BTCUSD',page:'evidence',embedded:'true',
  parentCenter:'evidence',parentNativeSymbol:'BTCUSD',activeFrameCount:1,frameVisible:true,
  parentUrl:'http://127.0.0.1:44529/bitcoin-cycle-atlas/?page=outlook&center=evidence',
  url:'http://127.0.0.1:44529/bitcoin-cycle-atlas/?page=evidence&embedded=1&v=1.36.1',
  frameSrc:'http://127.0.0.1:44529/bitcoin-cycle-atlas/?page=evidence&embedded=1&v=1.36.1'};
test('a separately observed active research child retains evidence ownership without borrowing its BTC parent',()=>{
  for(const spec of consolidatedWorkspaceCases){
    assert.equal(offlineBtcRefreshSurface(spec,evidenceOwner),'evidence');
    assert.equal(offlineBtcRefreshSurface(spec,{...evidenceOwner,owner:undefined}),undefined);
    assert.equal(offlineBtcRefreshSurface(spec,{...evidenceOwner,owner:'parent'}),undefined);
  }
});
test('hidden, uncommitted, foreign, nested or misidentified research documents cannot excuse a refresh',()=>{
  const spec=consolidatedWorkspaceCases[0];
  for(const change of [{nativeSymbol:'ETHUSD'},{page:'outlook'},{embedded:undefined},{embedded:'false'},
    {center:'evidence'},{parentCenter:'market-us'},{parentNativeSymbol:'ETHUSD'},
    {activeFrameCount:0},{activeFrameCount:2},{frameVisible:false},{frameSrc:'about:blank'},
    {parentUrl:'https://foreign.example/?center=evidence'},{parentUrl:'invalid'},{owner:'any-child'},
    {url:evidenceOwner.url.replace('embedded=1','embedded=0'),frameSrc:evidenceOwner.url.replace('embedded=1','embedded=0')},
    {url:evidenceOwner.url.replace('page=evidence','page=data'),frameSrc:evidenceOwner.url.replace('page=evidence','page=data')}])
    assert.equal(offlineBtcRefreshSurface(spec,{...evidenceOwner,...change}),undefined,JSON.stringify(change));
  for(const change of [{page:'undeclared'},{surface:'evidence'}])
    assert.equal(offlineBtcRefreshSurface({...spec,...change},evidenceOwner),undefined);
});
test('the recovered child request qualifies only for its current evidence frame and loader',()=>{
  // Exact identities from the 320x900 consumer failure. The earlier parent
  // failure was already verified; matching the same provider URL is insufficient.
  const childFrame={id:'BA1996B00CFC6ECAFDD990A8FFB2731B',loaderId:'9391C5EE4117568170AC316302EC2C46'};
  const parentFrame={id:'03DAA65FF4E2FCFF103AE990CF9B9807',loaderId:'97B525DA46D84C7581F85C22D8389582'};
  const childError={...error,requestId:'4211.571',frameId:childFrame.id,loaderId:childFrame.loaderId,
    requestWallTime:1794115040.614463,documentUrl:evidenceOwner.url,url:error.url.replace('2026-10-27','2026-11-08')};
  const childPolicy={surface:offlineBtcRefreshSurface(consolidatedWorkspaceCases[0],evidenceOwner),archiveAsOf:'2026-11-06',frame:childFrame};
  assert.equal(isExpectedOfflineBtcRefreshForFrame(childError,childPolicy),true);
  for(const frame of [undefined,{},parentFrame,{...childFrame,loaderId:parentFrame.loaderId},{...childFrame,id:parentFrame.id}])
    assert.equal(isExpectedOfflineBtcRefreshForFrame(childError,{...childPolicy,frame}),false);
  for(const change of [{url:childError.url+'&assets=btc'},{url:childError.url.replace('assets=btc','assets=eth')},
    {method:'POST'},{resourceType:'Script'},{blockedReason:'other'},{httpStatus:503},{requestId:''}])
    assert.equal(isExpectedOfflineBtcRefreshForFrame({...childError,...change},childPolicy),false);
  assert.equal(isExpectedOfflineBtcRefreshForFrame(childError,{...childPolicy,surface:undefined}),false);
  assert.equal(isExpectedOfflineBtcRefreshForFrame(childError,{...childPolicy,archiveAsOf:'2026-11-07'}),false);
});
test('center-data admits only the existing stale BTC request eligibility',()=>{
  assert.equal(isExpectedOfflineBtcRefresh(error,{...policy,surface:'center-data'}),true);
  for(const surface of ['data','center-data-eth','center-data-frame'])
    assert.equal(isExpectedOfflineBtcRefresh(error,{...policy,surface}),false);
});
test('center-data cannot excuse ETH, missing document identity or other network failures',()=>{
  const centerPolicy={...policy,surface:'center-data'};
  for(const change of [{url:error.url.replace('assets=btc','assets=eth')},{url:error.url+'&assets=btc'},
    {networkEvent:'Network.responseReceived',httpStatus:503},{method:'POST'},{resourceType:'Script'},
    {blockedReason:'other'},{frameId:''},{loaderId:''},{requestId:''},{requestWallTime:NaN}])
    assert.equal(isExpectedOfflineBtcRefresh({...error,...change},centerPolicy),false);
  assert.equal(isExpectedOfflineBtcRefresh(error,{...centerPolicy,archiveAsOf:'2026-10-27'}),false);
});
test('different hosts, metrics, query keys, credentials and request methods stay failures',()=>{
  for(const url of [error.url.replace('coinmetrics.io','coinmetrics.io.evil.example'),error.url.replace('assets=btc','assets=eth'),
    error.url.replace('PriceUSD','CapMrktCurUSD'),error.url+'&next_page_token=other',error.url+'&assets=btc',
    error.url.replace('https://','https://user@'),error.url.replace('2026-10-27','2026-10-28')])
    assert.equal(isExpectedOfflineBtcRefresh({...error,url},policy),false,url);
  for(const change of [{networkEvent:'Network.responseReceived'},{method:'POST'},{resourceType:'Script'},{blockedReason:'other'},{blockedReason:null},{httpStatus:503},
    {frameId:''},{loaderId:''},{requestId:''},{requestWallTime:NaN}])
    assert.equal(isExpectedOfflineBtcRefresh({...error,...change},policy),false);
});
test('a fresh or malformed archive cannot justify an ignored resource failure',()=>{
  for(const archiveAsOf of ['2026-10-26','2026-10-27','2026-10-28','2026-02-30','invalid'])
    assert.equal(isExpectedOfflineBtcRefresh(error,{...policy,archiveAsOf}),false);
});
test('midnight uses the actual request day rather than a guessed fixed cutoff',()=>{
  const next={...error,url:error.url.replace('2026-10-27','2026-10-28'),requestWallTime:Date.parse('2026-10-28T00:00:00Z')/1000};
  assert.equal(isExpectedOfflineBtcRefresh(next,policy),true);
  assert.equal(isExpectedOfflineBtcRefresh({...next,url:error.url},policy),false);
});
