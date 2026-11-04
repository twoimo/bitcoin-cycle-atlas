import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { extendRsiHistory } from '../../scripts/extend-rsi-history.mjs';
const previous=JSON.parse(await readFile(new URL('../../dist/data/market-lab.json',import.meta.url),'utf8'));
const now=new Date('2026-11-03T06:00:00Z');
function payload(symbol:string,currency:string) {
  return {chart:{result:[{meta:{symbol,currency,dataGranularity:'1d',exchangeTimezoneName:currency==='KRW'?'Asia/Seoul':'America/New_York'},timestamp:Array.from({length:35},(_,i)=>Date.UTC(2026,8,i+1,15)/1000),indicators:{quote:[{close:Array.from({length:35},(_,i)=>100+i)}]}}],error:null}};
}
test('history extension requests complete public histories and preserves all existing observations and macro clocks',async()=>{
  const before=structuredClone(previous), urls:string[]=[];
  const result=await extendRsiHistory(previous,{now,fetchImpl:(async input=>{const u=new URL(String(input));urls.push(u.href);const symbol=u.pathname.split('/').at(-1)!;return Response.json(payload(symbol,symbol==='SOXL'?'USD':'KRW'));}) as typeof fetch});
  assert.deepEqual(previous,before);assert.deepEqual(result.snapshot.regions,before.regions);
  for(const market of before.markets)assert.deepEqual(result.snapshot.markets.find((m:any)=>m.id===market.id),market);
  for(const source of before.sources)assert.deepEqual(result.snapshot.sources.find((s:any)=>s.id===source.id),source);
  assert.equal(urls.length,2);assert(urls.every(url=>new URL(url).searchParams.get('period1')==='0'));
  assert.deepEqual(result.receipts.map(r=>r.symbol),['SOXL','233740']);
  for(const receipt of result.receipts)assert.match(receipt.sha256,/^[a-f0-9]{64}$/);
});
test('wrong identity, wrong currency and a partial provider failure never produce a publishable candidate',async()=>{
  const before=structuredClone(previous);
  for(const failure of ['symbol','currency','partial']) {
    let calls=0;
    await assert.rejects(extendRsiHistory(previous,{now,fetchImpl:(async input=>{
      const symbol=new URL(String(input)).pathname.split('/').at(-1)!;calls++;
      if(failure==='partial' && calls===2)return new Response('unavailable',{status:503});
      return Response.json(payload(failure==='symbol'?'OTHER':symbol,failure==='currency'?'EUR':symbol==='SOXL'?'USD':'KRW'));
    }) as typeof fetch}));
    assert.deepEqual(previous,before);
  }
});
