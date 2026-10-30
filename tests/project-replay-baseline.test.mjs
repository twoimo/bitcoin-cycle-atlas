import assert from 'node:assert/strict';
import test from 'node:test';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {PROJECT_REPLAY_ORIGIN,parseProjectReplayBaseline,loadProjectReplayBaseline} from '../dist/project-replay-baseline.js';
import {createProjectReplaySession,createHistoricalReplaySession,buildReplayFrame,buildReplayChartData} from '../dist/forecast-replay.js';
import {parseReplayPriceArchive} from '../dist/forecast-replay-sources.js';
import {forecastHash} from '../dist/forecast-records.js';
import {projectReplayBaselineText} from '../scripts/build-project-replay-baseline.mjs';

const file=name=>new URL('../'+name,import.meta.url);
const sourceText=await readFile(file('dist/data/project-origin-btc-2026-10-21.json'),'utf8');
const originalBytes=await readFile(file('docs/THREE_YEAR_RESULTS.json'));
const inputBytes=await readFile(file('research-data/project-origin/bitcoin-first-input.json'));
const original=JSON.parse(originalBytes),originalBase=original.scenarios.find(row=>row.id==='base');
const baseline=await parseProjectReplayBaseline(sourceText);
const archive=await parseReplayPriceArchive('BTCUSD',await readFile(file('dist/data/btc-daily.json'),'utf8'));
const at=new Date(Math.max(Date.now(),Date.parse('2026-10-30T07:00:00.000Z'),Date.parse(archive.observedAt)+86400000)).toISOString();
const create=(options={})=>createProjectReplaySession({baseline,...archive,evaluatedAt:at,...options});
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const blob=bytes=>createHash('sha1').update('blob '+bytes.length+'\0').update(bytes).digest('hex');

test('the project start and first model preserve the actual initial Git artifacts',async()=>{
  assert.equal(PROJECT_REPLAY_ORIGIN.startDate,'2026-10-21');
  assert.equal(PROJECT_REPLAY_ORIGIN.timezone,'Asia/Seoul');
  assert.equal(PROJECT_REPLAY_ORIGIN.preservedAt,'2026-10-21T14:48:51.000Z');
  assert.equal(blob(originalBytes),'ceb7a5558ffea68eeca705ec85a70bbf86915f20');
  assert.equal(sha(originalBytes),'d487ab7c27f4a36a54f5b92e7b43faecd9691740b2484d54372727a754473c98');
  assert.equal(blob(inputBytes),'d8774079d15f21857db1531bb47984eb5712a525');
  assert.equal(sha(inputBytes),'c76403669531763b20ab6f25179d2cd7394cdbca96819197e05f1cb51facd6ed');
  assert.equal(await projectReplayBaselineText(),sourceText,'the deployed extraction is reproducible from unchanged original bytes');
  const payload=JSON.parse(sourceText);
  assert.deepEqual(payload.scenario,originalBase);
  assert.deepEqual(payload.dataset,JSON.parse(inputBytes));
  assert.equal(payload.context.asOf,'2026-10-20');
  assert.equal(payload.context.referenceDate,'2026-10-21');
});

test('every original forecast point survives export and the first next bar reveals October 21',async()=>{
  const session=await create(),origin=buildReplayFrame(session),next=buildReplayFrame(session,{cursorIndex:1});
  assert.equal(session.mode,'project-baseline');
  assert.equal(session.asOf,'2026-10-20');
  assert.equal(session.identity.playbackStartDate,'2026-10-21');
  assert.equal(session.endDate,'2029-10-21');
  assert.equal(session.forecast.length,1098);
  assert.deepEqual(session.forecast,originalBase.path.map(row=>({date:row.date,price:row.price,lower:row.low,upper:row.high,baselinePrice:null})));
  assert.equal(await forecastHash(session.forecast),session.identity.outputHash);
  assert.equal(origin.actual.length,0);assert.equal(origin.metrics.matchedCount,0);
  assert.equal(next.cursorDate,'2026-10-21');assert.equal(next.actual.length,1);
  assert.equal(next.selected.predicted,82967.4862610884);
  assert.equal(next.selected.actual,84176.0796455874);
  assert.equal(next.metrics.matchedCount,1);
  assert.equal(session.targets.at(-1).horizonDays,1097);
  assert.equal(session.targets.at(-1).targetDate,'2029-10-21');
  assert.equal(session.identity.issuedAt,null);
  assert.equal(session.identity.publicationTimeProven,false);
  assert.equal(next.policy.prospectiveScoringEligible,false);
  assert.equal(next.metrics.independentSampleCount,null);
});

test('future observations and later input revisions cannot change an earlier frame or original chart history',async()=>{
  const session=await create(),before=buildReplayChartData(session,{cursorIndex:2});
  const changed=archive.observations.map(row=>row.date>'2026-10-22'||row.date==='2026-10-20'?{...row,price:row.price*1000}:row);
  const altered=await create({observations:changed});
  assert.deepEqual(buildReplayChartData(altered,{cursorIndex:2}),before);
  assert.equal(before.observedRows.at(-1).date,'2026-10-22');
  assert.equal(before.observedRows.find(row=>row.date==='2026-10-20').price,82898.9101560549);
  assert.equal(before.observedRows.length,5941);
  assert.equal(before.observedCandles.length,0,'Coin Metrics closes do not become invented candles');
  const frozen=session.identity.outputHash;
  buildReplayFrame(session,{cursorIndex:9});
  assert.deepEqual(buildReplayChartData(session,{cursorIndex:2}),before);
  assert.equal(session.identity.outputHash,frozen);
});

test('the first-commit clock is separate from model input day and does not claim prospective issuance',async()=>{
  const session=await create();
  const before=buildReplayFrame(session,{clockMode:'information-time',cursorIndex:0,cursorAt:'2026-10-21T14:48:50.000Z'});
  assert.equal(before.inputVisible,false);assert.equal(before.forecastVisible,false);
  assert.deepEqual(before.forecast,[]);assert.deepEqual(before.inputPrices,[]);
  const after=buildReplayFrame(session,{clockMode:'information-time',cursorIndex:0,cursorAt:'2026-10-21T14:48:51.000Z'});
  assert.equal(after.inputVisible,true);assert.equal(after.forecastVisible,true);
  assert.equal(after.forecast.length,1098);assert.equal(after.actual.length,0);
  assert.equal(after.policy.prospectiveScoringEligible,false);
  assert.equal(after.metrics.scoredTargetCount,0);
  assert.equal(session.identity.preservationBasis,'initial-git-commit');
  assert.equal(session.identity.historicalModelExistedAtOrigin,false);
  assert.equal(session.identity.modelPreservedOnProjectStartDate,true);
});

test('unverified objects and changed source bytes cannot be passed off as the first forecast',async()=>{
  await assert.rejects(create({baseline:structuredClone(baseline)}),/Verify the preserved project baseline/);
  const changed=JSON.parse(sourceText);changed.scenario.path[1].price+=1;
  await assert.rejects(parseProjectReplayBaseline(JSON.stringify(changed)),/해시/);
  await assert.rejects(parseProjectReplayBaseline(sourceText+' '),/해시/);
  assert.throws(()=>{baseline.forecast.path[1].price=1;},TypeError);
  assert.throws(()=>{baseline.dataset.prices[0][1]=1;},TypeError);
  await assert.rejects(createHistoricalReplaySession({symbol:'BTCUSD',observations:archive.observations,asOf:'2026-10-20',horizonDays:1097,generatedAt:at}),/1 through 730/);
});

test('the network loader verifies the actual response and uses its bounded local path',async()=>{
  let requested;
  const result=await loadProjectReplayBaseline({baseUrl:'https://example.invalid/atlas/',fetchImpl:async(url,options)=>{
    requested={url:String(url),options};return new Response(sourceText,{status:200});
  }});
  assert.equal(requested.url,'https://example.invalid/atlas/data/project-origin-btc-2026-10-21.json');
  assert.equal(requested.options.credentials,'omit');assert.equal(requested.options.redirect,'error');
  assert.equal(result.outputHash,baseline.outputHash);
  assert.deepEqual(result.forecast.path,baseline.forecast.path);
});

test('a hanging fetch is stopped by the loader even when the injected fetch ignores abort',async()=>{
  let signal;
  await assert.rejects(loadProjectReplayBaseline({timeoutMs:10,fetchImpl:(_url,options)=>{signal=options.signal;return new Promise(()=>{});}}),{name:'TimeoutError'});
  assert.equal(signal.aborted,true);
});

test('streamed oversized input fails before it can be parsed or accepted',async()=>{
  let emitted=0,cancelled=false;
  const response={ok:true,status:200,headers:new Headers(),body:new ReadableStream({
    pull(controller){emitted++;controller.enqueue(new Uint8Array(600000));},cancel(){cancelled=true;},
  })};
  await assert.rejects(loadProjectReplayBaseline({fetchImpl:async()=>response}),/크기 제한/);
  assert.ok(emitted<=3,'stream is not fully buffered without a limit');assert.equal(cancelled,true);
});

test('pre-aborted, failed and corrupt loads do not silently substitute another forecast',async()=>{
  let calls=0;const controller=new AbortController();controller.abort(new Error('cancelled baseline'));
  await assert.rejects(loadProjectReplayBaseline({signal:controller.signal,fetchImpl:async()=>{calls++;return new Response(sourceText);}}),/cancelled baseline/);
  assert.equal(calls,0);
  await assert.rejects(loadProjectReplayBaseline({fetchImpl:async()=>new Response('',{status:404})}),/HTTP 404/);
  await assert.rejects(loadProjectReplayBaseline({fetchImpl:async()=>new Response('{}')}),/해시/);
});

test('offline loading uses exact embedded bytes and rejects corrupt content without network fallback',async()=>{
  const previous=globalThis.document;let content=JSON.stringify({sourceText}),calls=0;
  globalThis.document={baseURI:'file:///atlas.html',getElementById:id=>id==='atlas-project-origin-baseline'?{textContent:content}:null};
  const fetchImpl=async()=>{calls++;throw new Error('offline');};
  try{
    const result=await loadProjectReplayBaseline({fetchImpl});assert.equal(result.outputHash,baseline.outputHash);assert.equal(calls,0);
    content=JSON.stringify({sourceText:'{}'});
    await assert.rejects(loadProjectReplayBaseline({fetchImpl}),/해시/);assert.equal(calls,0);
    content='{}';await assert.rejects(loadProjectReplayBaseline({fetchImpl}),/크기 제한/);assert.equal(calls,0);
  }finally{if(previous===undefined)delete globalThis.document;else globalThis.document=previous;}
});
