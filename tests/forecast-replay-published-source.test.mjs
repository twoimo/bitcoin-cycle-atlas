import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {canonicalForecastJson} from '../dist/forecast-records.js';
import {parseEthArchive} from '../dist/eth-market-data.js';
import {verifyEthereumResearchSnapshot,createEthereumResearchSnapshot,rebuildEthereumResearchPrices,planEthereumResearchPriceRequest} from '../dist/ethereum-prospective-prices.js';
import {parseReplayPriceArchive} from '../dist/forecast-replay-sources.js';
import {createRecordedReplaySession,buildReplayFrame} from '../dist/forecast-replay.js';

const root=new URL('../',import.meta.url);
const directory='research-data/forecast-replay/20261029/acquisition-2/';
const read=path=>readFile(new URL(path,root),'utf8');
const [publishedText,snapshotText,receiptText,raw]=await Promise.all([
  read('dist/data/replay-eth-ohlc.json'),read(directory+'snapshot.json'),read(directory+'eth-tail-acquisition.json'),read(directory+'raw-eth-tail.json'),
]);
const published=JSON.parse(publishedText),snapshot=JSON.parse(snapshotText),receipt=JSON.parse(receiptText);
const hash=text=>createHash('sha256').update(text).digest('hex');

test('published replay observations bind the actual single-GET raw bytes and acquisition clocks',async()=>{
  assert.equal(receipt.status,'success');assert.equal(receipt.httpStatus,200);
  assert.equal(receipt.method,'GET');assert.equal(receipt.requests,1);assert.equal(receipt.retries,0);
  assert.equal(receipt.credentials,'omit');assert.equal(receipt.redirect,'error');assert.equal(receipt.completeBody,true);
  assert.equal(receipt.rawText,raw);assert.equal(Buffer.from(receipt.rawBase64,'base64').toString('utf8'),raw);
  assert.equal(hash(raw),receipt.rawSha256);assert.equal(Buffer.byteLength(raw),receipt.receivedBytes);
  assert.ok(receipt.receivedBytes<=receipt.maximumBodyBytes);
  assert.ok(Date.parse(receipt.bodyCompletedAt)>=Date.parse(receipt.requestStartedAt));
  assert.ok(Date.parse(receipt.bodyCompletedAt)-Date.parse(receipt.requestStartedAt)<=receipt.timeoutMs);
  assert.ok(Date.parse(receipt.finishedAt)>=Date.parse(receipt.bodyCompletedAt));
  assert.deepEqual(planEthereumResearchPriceRequest(snapshot.base.text,receipt.requestStartedAt),receipt.request);
  assert.equal(snapshot.tail.text,raw);assert.equal(snapshot.tail.sourceHash,receipt.rawSha256);
  assert.equal(snapshot.tail.requestStartedAt,receipt.requestStartedAt);assert.equal(snapshot.tail.bodyCompletedAt,receipt.bodyCompletedAt);
  await verifyEthereumResearchSnapshot(snapshot);
  assert.deepEqual(await createEthereumResearchSnapshot({base:snapshot.base,tail:snapshot.tail}),snapshot);
});

test('every published observation is the exact preserved-base and raw-tail rebuild',()=>{
  const rebuilt=rebuildEthereumResearchPrices({baseText:snapshot.base.text,tailText:raw,
    requestStartedAt:receipt.requestStartedAt,bodyCompletedAt:receipt.bodyCompletedAt,sourceUrl:receipt.sourceUrl});
  const {replayProvenance,...archive}=published;
  assert.equal(canonicalForecastJson(archive),canonicalForecastJson(rebuilt.archive));
  assert.deepEqual(rebuilt.primaryPrices,snapshot.primaryPrices);
  assert.equal(replayProvenance.snapshotId,snapshot.id);assert.equal(replayProvenance.rawSha256,hash(raw));
  assert.equal(replayProvenance.collectedAt,receipt.bodyCompletedAt);
  assert.equal(replayProvenance.rawPath,directory+'raw-eth-tail.json');
  assert.equal(replayProvenance.receiptPath,directory+'eth-tail-acquisition.json');
  assert.equal(replayProvenance.base.sha256,snapshot.base.sourceHash);
  assert.equal(replayProvenance.base.gitBlobSha,snapshot.base.gitBlobSha);
  assert.equal(replayProvenance.releaseAuthorized,false);assert.equal(replayProvenance.productionPromoted,false);
  assert.equal(rebuilt.merge.missingValuesImputed,false);
  const candles=parseEthArchive(archive).candles;
  assert.equal(candles.at(-1).date.slice(0,10),snapshot.asOf);
  assert.ok(candles.every(row=>row.time+86400<=Date.parse(receipt.requestStartedAt)/1000));
  assert.equal(JSON.parse(raw).length-rebuilt.merge.includedTailCandles,rebuilt.merge.excludedOutOfWindow);
});

test('strict replay discloses real new ETH observations only after the recorded body completion',async()=>{
  const data=await parseReplayPriceArchive('ETHUSD',publishedText);
  const index=JSON.parse(await read('dist/data/asset-forecast-ledger/index.json'));
  const entry=index.entries.find(row=>row.symbol==='ETHUSD'&&row.scenario==='base');
  const record=JSON.parse(await read('dist/data/asset-forecast-ledger/'+entry.recordPath));
  const input=JSON.parse(await read('dist/data/asset-forecast-ledger/'+entry.snapshotPath));
  const session=await createRecordedReplaySession({record,snapshot:input,...data,evaluatedAt:receipt.finishedAt});
  assert.equal(session.timeline.at(-1),receipt.finishedAt.slice(0,10));
  const prior=new Date(Date.parse(receipt.bodyCompletedAt)-1).toISOString();
  const before=buildReplayFrame(session,{cursorDate:receipt.bodyCompletedAt.slice(0,10),cursorAt:prior,clockMode:'information-time'});
  const after=buildReplayFrame(session,{cursorDate:receipt.bodyCompletedAt.slice(0,10),cursorAt:receipt.bodyCompletedAt,clockMode:'information-time'});
  assert.equal(before.actual.length,0);assert.equal(before.metrics.matchedCount,0);
  assert.deepEqual(after.actual.map(row=>row.date),['2026-10-26','2026-10-27']);
  assert.equal(after.metrics.matchedCount,2);assert.equal(after.metrics.scoredTargetCount,0);
  assert.equal(after.metrics.pendingTargetCount,3);
  assert.equal(session.identity.outputHash,record.outputHash);
});

test('published acquisition provenance cannot assert release, backdate collection or escape evidence paths',async()=>{
  for(const mutate of [value=>{value.releaseAuthorized=true;},value=>{value.productionPromoted=true;},
    value=>{value.collectedAt='2026-10-27T00:00:00Z';},value=>{value.rawPath='../raw.json';}]){
    const changed=structuredClone(published);mutate(changed.replayProvenance);
    await assert.rejects(parseReplayPriceArchive('ETHUSD',JSON.stringify(changed)));
  }
});
