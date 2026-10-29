import test from 'node:test';
import assert from 'node:assert/strict';
import {isExpectedOfflineBtcRefresh} from '../scripts/btc-offline-refresh-policy.mjs';
const policy={surface:'btc',archiveAsOf:'2026-10-25'};
const error={url:'https://community-api.coinmetrics.io/v4/timeseries/asset-metrics?assets=btc&metrics=PriceUSD&frequency=1d&start_time=2010-07-18&end_time=2026-10-27&page_size=10000&paging_from=start',
  networkEvent:'Network.loadingFailed',requestId:'1.2',frameId:'frame',loaderId:'document',method:'GET',resourceType:'Fetch',blockedReason:'inspector',errorText:'',
  requestWallTime:Date.parse('2026-10-27T04:00:00Z')/1000};
test('only the exact stale BTC archive request is eligible for a separately verified offline failure',()=>{
  for(const surface of ['btc','evidence','legacy','preview'])assert.equal(isExpectedOfflineBtcRefresh(error,{...policy,surface}),true);
  for(const surface of ['eth','data',undefined])assert.equal(isExpectedOfflineBtcRefresh(error,{...policy,surface}),false);
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
