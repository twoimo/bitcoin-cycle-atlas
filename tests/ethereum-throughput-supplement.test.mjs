import test from 'node:test';
import assert from 'node:assert/strict';
import {ETH_THROUGHPUT_SOURCE,parseEthereumThroughput,fetchEthereumThroughputBytes} from '../scripts/capture-ethereum-throughput.mjs';

const collectedAt='2026-10-27T12:00:00Z',day=86400000;
const master={chains:{ethereum:{url_key:'ethereum',chain_type:'l1',caip2:'eip155:1',evm_chain_id:1,deployment:'PROD',supported_metrics:['throughput'],excluded_metrics:[]}}};
function payload(){
  const first=Date.parse('2026-09-29T00:00:00Z');
  return {last_updated_utc:'2026-10-27 11:00:00',details:{metric_id:'throughput',source:['fixture-only'],timeseries:{daily:{
    types:['unix','value'],data:Array.from({length:28},(_,i)=>[first+i*day,.25])}}}};
}
const parse=p=>parseEthereumThroughput(master,p,{collectedAt});
test('Mgas/s conversion preserves the million factor and records a supplement, never a full snapshot',()=>{
  const result=parse(payload());
  assert.equal(result.l1GasUsedRateDerived,28*86400*250000);
  assert.equal(result.windowStart,'2026-09-29');assert.equal(result.observedThrough,'2026-10-26');
  assert.equal(result.requestedLatestWindowComplete,true);
  assert.equal(result.providerGeneratedAt,'2026-10-27T11:00:00Z');
  assert.equal(result.publishedAt,null);
  assert.equal(result.strictDefinitionMatchedMetricCount,0);
  assert.equal(result.fullModelSnapshotReady,false);assert.equal(result.historicalPointInTimeReady,false);
  assert.equal(result.modelInputActivated,false);assert.equal(result.exactIntegerGas,false);
  assert.equal(result.roundingAppliedByCollector,false);assert.deepEqual(result.modelSnapshots,[]);
});
test('provider identity, metric identity and declared schema cannot be guessed',()=>{
  const wrong=structuredClone(master);wrong.chains.ethereum.evm_chain_id='1';
  assert.throws(()=>parseEthereumThroughput(wrong,payload(),{collectedAt}),/identify/);
  const p=payload();p.details.metric_id='fees';assert.throws(()=>parse(p),/identity/);
  const q=payload();q.details.timeseries.daily.types=['date','value'];assert.throws(()=>parse(q),/schema/);
});
test('missing dates, nulls, coercible strings, duplicates and incomplete UTC days are rejected',()=>{
  for(const change of [
    p=>p.details.timeseries.daily.data[4][0]+=day,
    p=>p.details.timeseries.daily.data[4][1]=null,
    p=>p.details.timeseries.daily.data[4][1]='0.25',
    p=>p.details.timeseries.daily.data[4][1]=-1,
    p=>p.details.timeseries.daily.data[4][0]+=1000,
    p=>p.details.timeseries.daily.data.at(-1)[0]+=day,
    p=>p.details.timeseries.daily.data.reverse(),
  ]){
    const p=payload();change(p);assert.throws(()=>parse(p),/dates|values|missing/);
  }
});
test('freshness is explicit and the first-publication time is never inferred',()=>{
  const p=payload();for(const r of p.details.timeseries.daily.data)r[0]-=2*day;
  const result=parse(p);assert.equal(result.daysBehindRequestedEnd,2);assert.equal(result.requestedLatestWindowComplete,false);
  assert.equal(result.publishedAt,null);assert.equal(result.historicalPointInTimeReady,false);
  for(const r of p.details.timeseries.daily.data)r[0]-=5*day;
  assert.throws(()=>parse(p),/freshness/);
  assert.throws(()=>parseEthereumThroughput(master,payload(),{collectedAt:'2026-02-30T12:00:00Z'}),/timestamp/);
  const future=payload();future.last_updated_utc='2026-10-28 11:00:00';assert.throws(()=>parse(future),/future/);
});
test('raw acquisition preserves exact bytes and bounds URLs, redirects and response bodies',async()=>{
  const bytes=Buffer.from('{"fixture": 1}\n');
  let request;
  const r=await fetchEthereumThroughputBytes(ETH_THROUGHPUT_SOURCE.dataUrl,{fetchImpl:async(url,options)=>{
    request={url,options};return new Response(bytes,{status:200,headers:{'content-type':'application/json'}});
  }});
  assert.deepEqual(r.bytes,bytes);assert.equal(r.acquisition.complete,true);
  assert.equal(r.acquisition.receivedBytes,bytes.length);assert.equal(request.options.redirect,'error');
  assert.match(r.acquisition.sha256,/^[a-f0-9]{64}$/);
  await assert.rejects(()=>fetchEthereumThroughputBytes('https://example.com'),/allowlisted/);
  await assert.rejects(()=>fetchEthereumThroughputBytes(ETH_THROUGHPUT_SOURCE.dataUrl,{maximumBytes:4,fetchImpl:async()=>new Response(bytes)}),/streamed body/);
  await assert.rejects(()=>fetchEthereumThroughputBytes(ETH_THROUGHPUT_SOURCE.dataUrl,{maximumBytes:4,fetchImpl:async()=>new Response(bytes,{headers:{'content-length':'5'}})}),/advertised body/);
});
test('HTTP failure bytes remain inspectable and transport failures have real unsuccessful receipts',async()=>{
  const r=await fetchEthereumThroughputBytes(ETH_THROUGHPUT_SOURCE.dataUrl,{fetchImpl:async()=>new Response('unavailable',{status:503})});
  assert.equal(r.ok,false);assert.equal(r.acquisition.httpStatus,503);assert.equal(r.bytes.toString(),'unavailable');
  await assert.rejects(()=>fetchEthereumThroughputBytes(ETH_THROUGHPUT_SOURCE.dataUrl,{fetchImpl:async()=>{throw new Error('network fixture');}}),error=>{
    assert.equal(error.acquisition.complete,false);assert.equal(error.acquisition.receivedBytes,0);
    assert.equal(error.acquisition.completedAt,null);return /network fixture/.test(error.message);
  });
});
