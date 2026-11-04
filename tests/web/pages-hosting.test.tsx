import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {parseHTML} from 'linkedom';
import {atlasRootPath,atlasSitePath,isAtlasStatic} from '../../dist/site-paths.js';
import {labPageFromLocation} from '../../dist/atlas-navigation.js';
import {loadSnapshot} from '../../apps/web/src/load-snapshot.js';
import {validateRsiBars} from '../../packages/domain/src/rsi-bars.js';
import {validateSnapshot} from '@atlas/domain/market-lab';

test('project paths retain a declared subpath and reject escaping resource paths',()=>{
  const {document}=parseHTML('<meta name="atlas-root" content="/bitcoin-cycle-atlas/"><meta name="atlas-static" content="1">');
  assert.equal(atlasRootPath(document),'/bitcoin-cycle-atlas/');assert(isAtlasStatic(document));
  assert.equal(atlasSitePath('/data/market-lab.json',atlasRootPath(document)),'/bitcoin-cycle-atlas/data/market-lab.json');
  for(const bad of ['//evil.test','/../data','/a/./b','/a\\b','/a\nb'])assert.throws(()=>atlasSitePath(bad));
  document.querySelector('[name=atlas-root]')!.setAttribute('content','/../');assert.throws(()=>atlasRootPath(document));
});
test('all React deep links recognize the same page at a project subpath',()=>{
  for(const page of ['us','kr','scenario','cashflow','rsi','housing','themes']){
    const plain=labPageFromLocation(new URL(`https://test/market-lab/${page}/`));
    const prefixed=labPageFromLocation(new URL(`https://test/bitcoin-cycle-atlas/market-lab/${page}/`));
    assert.equal(prefixed.id,plain.id);
  }
});
test('static delivery never probes an API and binds the validated saved snapshot revision',async t=>{
  const previous=Object.getOwnPropertyDescriptor(globalThis,'document');
  const {document}=parseHTML('<meta name="atlas-root" content="/bitcoin-cycle-atlas/"><meta name="atlas-static" content="1">');
  Object.defineProperty(globalThis,'document',{value:document,configurable:true});t.after(()=>{if(previous)Object.defineProperty(globalThis,'document',previous);else Reflect.deleteProperty(globalThis,'document');});
  const raw=await readFile(new URL('../../dist/data/market-lab.json',import.meta.url),'utf8'),calls:string[]=[],deliveries:unknown[]=[];
  const result=await loadSnapshot({fetchImpl:(async url=>{calls.push(String(url));return new Response(raw);}) as typeof fetch,onDelivery:state=>deliveries.push(state)});
  assert.deepEqual(calls,['/bitcoin-cycle-atlas/data/market-lab.json']);assert.deepEqual(result,validateSnapshot(JSON.parse(raw)));
  assert.deepEqual(deliveries,[{kind:'saved',reason:'static-hosting',revision:createHash('sha256').update(JSON.stringify(result)).digest('hex')}]);
  await assert.rejects(loadSnapshot({fetchImpl:(async()=>new Response('{}')) as typeof fetch}));
  const controller=new AbortController();controller.abort();await assert.rejects(loadSnapshot({signal:controller.signal,fetchImpl:(async()=>new Response(raw)) as typeof fetch}));
});

test('Pages retains three instrument histories with real bars matching every retained close',async()=>{
  const snapshot=validateSnapshot(JSON.parse(await readFile(new URL('../../dist/data/market-lab.json',import.meta.url),'utf8')));
  for(const id of ['tqqq','soxl','kodex-kosdaq150']){
    const market=snapshot.markets.find(m=>m.id===id)!;assert(market.prices.length>2500);
    assert.equal(validateRsiBars(market.ohlc,market.prices).length,market.prices.length);
    const evidence=market.ohlcEvidence as {responseSha256:string;matchedClosesOnly:boolean};
    assert.match(evidence.responseSha256,/^[a-f0-9]{64}$/);
    assert.equal(evidence.matchedClosesOnly,true);
  }
});
