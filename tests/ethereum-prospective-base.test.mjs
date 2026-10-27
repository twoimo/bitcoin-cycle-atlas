import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {validateEthereumCommittedBase,ETH_COMMITTED_BASE_POLICY} from '../scripts/ethereum-prospective-base.mjs';
import {planEthereumResearchPriceRequest,createEthereumResearchSnapshot,rebuildEthereumResearchPrices} from '../dist/ethereum-prospective-prices.js';
import {parseEthArchive} from '../dist/eth-market-data.js';
import {prospectiveFixture} from './helpers/eth-prospective-fixture.mjs';
const blob=b=>createHash('sha1').update('blob '+b.length+'\0').update(b).digest('hex');
function args(text,collectedAt){const bytes=Buffer.from(text);return {workingBytes:bytes,committedBytes:bytes,
  sourceCommit:'a'.repeat(40),sourceTree:'b'.repeat(40),gitBlobSha:blob(bytes),collectedAt};}

test('exact committed archive selection preserves every original byte and clock',async()=>{
  const f=await prospectiveFixture(),value=validateEthereumCommittedBase(args(f.base.text,f.base.collectedAt));
  assert.equal(value.base.text,f.base.text);assert.equal(value.base.collectedAt,f.base.collectedAt);
  assert.equal(value.receipt.gitBlobSha,f.base.gitBlobSha);assert.equal(value.receipt.automaticallyRefreshed,false);
  assert.equal(value.receipt.historicalProviderAuthenticityProven,false);
  assert.equal(value.receipt.sourceUrl,'https://github.com/twoimo/bitcoin-cycle-atlas/blob/'+'a'.repeat(40)+'/dist/data/eth-ohlc.json');
});

test('a reviewed committed rollover keeps the frozen snapshot contract and shortens its next request',async()=>{
  const f=await prospectiveFixture(),old=parseEthArchive(JSON.parse(f.base.text));
  const at=new Date(old.requestedEnd*1000+280*86400000+7200000).toISOString();
  const request=planEthereumResearchPriceRequest(f.base.text,at);
  const raw=Array.from({length:(request.requestedEnd-request.requestedStart)/86400},(_,i)=>
    [request.requestedStart+i*86400,90,110,100,100,10]);
  const tail={text:JSON.stringify(raw),sourceUrl:request.sourceUrl,requestStartedAt:at,
    bodyCompletedAt:new Date(Date.parse(at)+1000).toISOString()};
  const rebuilt=rebuildEthereumResearchPrices({baseText:f.base.text,tailText:tail.text,...tail});
  const rolledText=JSON.stringify(rebuilt.archive);
  const later=new Date(old.requestedEnd*1000+300*86400000+7200000).toISOString();
  assert.throws(()=>planEthereumResearchPriceRequest(f.base.text,later),/exceeds 290/);
  const selected=validateEthereumCommittedBase(args(rolledText,new Date(Date.parse(later)-1000).toISOString()));
  const next=planEthereumResearchPriceRequest(selected.base.text,later);
  assert.equal((next.requestedEnd-next.requestedStart)/86400,27);
  const nextRaw=Array.from({length:27},(_,i)=>[next.requestedStart+i*86400,90,110,100,100,10]);
  const snapshot=await createEthereumResearchSnapshot({base:selected.base,
    tail:{text:JSON.stringify(nextRaw),sourceUrl:next.sourceUrl,requestStartedAt:later,
      bodyCompletedAt:new Date(Date.parse(later)+1000).toISOString()}});
  assert.equal(snapshot.primaryPrices.length,1100);
  const rolled=parseEthArchive(JSON.parse(selected.base.text));
  assert.equal(rolled.candles[0].retrievedAt,old.retrievedAt);
  assert.equal(snapshot.historicalVintagesProven,false);
});

test('dirty working bytes cannot acquire a clean committed identity',async()=>{
  const f=await prospectiveFixture(),input=args(f.base.text,f.base.collectedAt);
  assert.throws(()=>validateEthereumCommittedBase({...input,workingBytes:Buffer.from(f.base.text+' ')}),/differs from/);
  assert.throws(()=>validateEthereumCommittedBase({...input,gitBlobSha:'0'.repeat(40)}),/hash mismatch/);
});

test('unsafe paths, symlink mode, or uncertain Git identities cannot select a base',async()=>{
  const f=await prospectiveFixture(),input=args(f.base.text,f.base.collectedAt);
  for(const changed of [{path:'../outside.json'},{mode:'120000'},{sourceCommit:'main'},{sourceTree:null}])
    assert.throws(()=>validateEthereumCommittedBase({...input,...changed}),/committed/);
});

test('future acquisition, a future base end, and a different market remain invalid',async()=>{
  const f=await prospectiveFixture(),input=args(f.base.text,f.base.collectedAt);
  assert.throws(()=>validateEthereumCommittedBase({...input,collectedAt:'2024-01-01T00:00:00Z'}),/future/);
  for(const mutate of [v=>v.dailyHistory.retrievedAt='2099-01-01T00:00:00Z',v=>v.product='BTC-USD']){
    const value=JSON.parse(f.base.text);mutate(value);
    assert.throws(()=>validateEthereumCommittedBase(args(JSON.stringify(value),f.base.collectedAt)));
  }
});

test('empty, oversized, or lossy UTF-8 bytes cannot be accepted as a committed base',async()=>{
  const f=await prospectiveFixture(),input=args(f.base.text,f.base.collectedAt);
  for(const bytes of [Buffer.alloc(0),Buffer.alloc(ETH_COMMITTED_BASE_POLICY.maximumBytes+1),Buffer.from([255])])
    assert.throws(()=>validateEthereumCommittedBase({...input,workingBytes:bytes,committedBytes:bytes,gitBlobSha:blob(bytes)}),/Bounded|UTF-8/);
});
