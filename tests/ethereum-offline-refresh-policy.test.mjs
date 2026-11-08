import test from 'node:test';
import assert from 'node:assert/strict';
import {isExpectedOfflineBtcRefresh,offlineBtcRefreshSurface} from '../scripts/btc-offline-refresh-policy.mjs';
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
