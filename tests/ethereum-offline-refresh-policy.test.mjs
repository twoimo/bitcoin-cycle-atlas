import test from 'node:test';
import assert from 'node:assert/strict';
import {isExpectedOfflineBtcRefresh,offlineBtcRefreshSurface,ownsOfflineBtcPriceReadout} from '../scripts/btc-offline-refresh-policy.mjs';
import {consolidatedWorkspaceCases} from '../scripts/verify-consolidated-workspace-browser.mjs';
const policy={surface:'btc',archiveAsOf:'2026-10-25'};
const error={url:'https://community-api.coinmetrics.io/v4/timeseries/asset-metrics?assets=btc&metrics=PriceUSD&frequency=1d&start_time=2010-07-18&end_time=2026-10-27&page_size=10000&paging_from=start',
  networkEvent:'Network.loadingFailed',requestId:'1.2',frameId:'frame',loaderId:'document',method:'GET',resourceType:'Fetch',blockedReason:'inspector',errorText:'',
  requestWallTime:Date.parse('2026-10-27T04:00:00Z')/1000};
test('the active BTC outlook requires its quote even when that quote is missing or incorrect',()=>{
  for(const center of [undefined,null,''])for(const price of [undefined,'','$1.00','$75,826.53'])
    assert.equal(ownsOfflineBtcPriceReadout({page:'outlook',nativeSymbol:'BTCUSD',center,price}),true,
      'Missing or incorrect BTC content must reach the browser price assertions, not disable them');
});
test('hosted centers do not borrow the background BTC parent price readout',()=>{
  for(const center of ['rsi','themes','housing','evidence','market-us','data']){
    const observed={page:'outlook',nativeSymbol:'BTCUSD',center};
    assert.equal(ownsOfflineBtcPriceReadout(observed),false,center);
    assert.equal(ownsOfflineBtcPriceReadout({...observed,price:'$75,826.53'}),false,
      'A retained background quote cannot establish current chart ownership');
  }
});
test('other native pages keep their existing no-current-price contract',()=>{
  for(const page of ['evidence','data','relay','market',undefined])
    assert.equal(ownsOfflineBtcPriceReadout({page,nativeSymbol:'BTCUSD'}),false);
});
test('the observed housing-owner regression keeps all offline request eligibility checks',()=>{
  // Build 45074d86 observed this native BTC document underneath the active
  // Gyeonggi housing center. Its failed notice and blocked request still need
  // their normal frame/loader/cutoff verification; only the price owner differs.
  const observed={page:'outlook',nativeSymbol:'BTCUSD',center:'housing',price:undefined};
  assert.equal(ownsOfflineBtcPriceReadout(observed),false);
  const surface=offlineBtcRefreshSurface({surface:'btc'},observed);
  assert.equal(surface,'btc');
  assert.equal(isExpectedOfflineBtcRefresh(error,{...policy,surface}),true);
  for(const change of [{frameId:''},{loaderId:''},{requestId:''},{blockedReason:'other'},
    {url:error.url.replace('assets=btc','assets=eth')},{httpStatus:503}])
    assert.equal(isExpectedOfflineBtcRefresh({...error,...change},{...policy,surface}),false);
});
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
// Source 93b65dd / browser 77bdebe3 reached this real embedded evidence URL in
// all three consolidated cases. Its exact inspector-blocked request already
// qualified as evidence; the missing piece was the separately observed owner.
const evidenceUrl='http://127.0.0.1:44885/bitcoin-cycle-atlas/?page=evidence&embedded=1&v=1.36.1';
const evidenceOwner={parentUrl:'http://127.0.0.1:44885/bitcoin-cycle-atlas/?page=outlook&center=evidence',
  parentCenter:'evidence',count:1,source:evidenceUrl,visible:true,topmost:true};
const evidenceDocument={consolidatedEvidence:true,nativeSymbol:'BTCUSD',page:'evidence',embedded:true,
  preview:false,url:evidenceUrl,frameOwner:evidenceOwner};
const blockedEvidenceRequest={...error,url:error.url.replace('2026-10-27','2026-11-08'),
  requestId:'4207.583',frameId:'365FD08C3E1037B6A3D4A1CA510F93B0',loaderId:'4A7BA1448D85E1EFFC96335763786A8C',
  requestWallTime:1794128049.281546,documentUrl:evidenceUrl,canceled:false};
test('the explicitly observed consolidated evidence child owns its separate offline refresh',()=>{
  for(const spec of consolidatedWorkspaceCases){
    const surface=offlineBtcRefreshSurface(spec,evidenceDocument);
    assert.equal(surface,'evidence','A visible embedded evidence document needs its own refresh receipt');
    assert.equal(isExpectedOfflineBtcRefresh(blockedEvidenceRequest,{surface,archiveAsOf:'2026-11-06'}),true);
  }
});
test('consolidated evidence ownership rejects an unobserved, obscured, ambiguous or different document',()=>{
  const spec=consolidatedWorkspaceCases[0];
  for(const change of [{consolidatedEvidence:undefined},{consolidatedEvidence:false},{preview:true},
    {nativeSymbol:'ETHUSD'},{nativeSymbol:undefined},{page:'outlook'},{embedded:false},{embedded:'true'},
    {url:undefined},{frameOwner:undefined},{frameOwner:null}])
    assert.equal(offlineBtcRefreshSurface(spec,{...evidenceDocument,...change}),undefined,JSON.stringify(change));
  for(const change of [{parentCenter:'market-us'},{parentCenter:undefined},{count:0},{count:2},{count:'1'},
    {source:evidenceUrl+'#other'},{source:undefined},{visible:false},{visible:1},{topmost:false},{topmost:undefined},
    {parentUrl:'http://127.0.0.1:44886/bitcoin-cycle-atlas/'},{parentUrl:'http://127.0.0.1:44885/another-project/'},
    {parentUrl:'http://127.0.0.1:44885/bitcoin-cycle-atlas-other/'},{parentUrl:'http://user@127.0.0.1:44885/bitcoin-cycle-atlas/'},
    {parentUrl:'not-a-url'}])
    assert.equal(offlineBtcRefreshSurface(spec,{...evidenceDocument,frameOwner:{...evidenceOwner,...change}}),undefined,JSON.stringify(change));
  for(const url of ['not-a-url','/bitcoin-cycle-atlas/?page=evidence&embedded=1',
    evidenceUrl.replace('44885','44886'),evidenceUrl.replace('http://','http://user@'),
    evidenceUrl.replace('/bitcoin-cycle-atlas/','/another-project/'),evidenceUrl.replace('/bitcoin-cycle-atlas/','/bitcoin-cycle-atlas/../'),
    evidenceUrl.replace('/bitcoin-cycle-atlas/','/bitcoin-cycle-atlas/other/'),
    evidenceUrl.replace('page=evidence','page=outlook'),evidenceUrl.replace('page=evidence&',''),evidenceUrl+'&page=evidence',
    evidenceUrl.replace('embedded=1','embedded=0'),evidenceUrl.replace('embedded=1&',''),evidenceUrl+'&embedded=1'])
    assert.equal(offlineBtcRefreshSurface(spec,{...evidenceDocument,url,frameOwner:{...evidenceOwner,source:url}}),undefined,url);
  const fileUrl='file:///bitcoin-cycle-atlas/?page=evidence&embedded=1';
  assert.equal(offlineBtcRefreshSurface(spec,{...evidenceDocument,url:fileUrl,
    frameOwner:{...evidenceOwner,parentUrl:'file:///bitcoin-cycle-atlas/',source:fileUrl}}),undefined);
  for(const candidate of [{...spec,page:'unknown'},{...spec,surface:'evidence'},{consolidated:true},{}])
    assert.equal(offlineBtcRefreshSurface(candidate,evidenceDocument),undefined);
});
test('a separately owned consolidated evidence document does not broaden blocked-request eligibility',()=>{
  const surface=offlineBtcRefreshSurface(consolidatedWorkspaceCases[0],evidenceDocument);
  assert.equal(surface,'evidence');
  for(const change of [{url:blockedEvidenceRequest.url.replace('assets=btc','assets=eth')},
    {url:blockedEvidenceRequest.url+'&assets=btc'},{networkEvent:'Network.responseReceived'},{httpStatus:503},
    {method:'POST'},{resourceType:'Script'},{blockedReason:'other'},{frameId:''},{loaderId:''},{requestId:''},{requestWallTime:NaN}])
    assert.equal(isExpectedOfflineBtcRefresh({...blockedEvidenceRequest,...change},{surface,archiveAsOf:'2026-11-06'}),false);
  assert.equal(isExpectedOfflineBtcRefresh(blockedEvidenceRequest,{surface,archiveAsOf:'2026-11-07'}),false);
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
