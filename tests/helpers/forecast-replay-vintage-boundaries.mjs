import test from 'node:test';
import assert from 'node:assert/strict';
import {utcDay,dateFromDay} from '../../dist/cycle-engine.js';
import {sessionCloseUtc} from '../../dist/data-freshness.js';
import {forecastHash,createForecastSnapshot,createForecastRecord} from '../../dist/forecast-records.js';
import {createRecordedReplaySession,createHistoricalReplaySession,buildReplayFrame} from '../../dist/forecast-replay.js';

const asOf='2025-12-31',origin=utcDay(asOf),at='2026-07-01T12:00:00.000Z';
const date=n=>dateFromDay(origin+n);
const prices=Array.from({length:400},(_,i)=>[date(i-399),100*Math.exp(i*.0004+Math.sin(i/11)*.04)]);
const snapshot=await createForecastSnapshot({meta:{sourceName:'Synthetic boundary fixture',priceDefinition:'Completed UTC test close',retrievedAt:'2026-01-01T01:00:00Z'},prices},{asOf});
const files={'dist/synthetic-boundary-model.js':'a'.repeat(64)};
const model={sourceCommit:'b'.repeat(40),sourceHash:await forecastHash(files),files};
const forecast={version:'synthetic-boundary-1',asOf,displayEnd:date(200),scenario:{id:'base',label:'Synthetic'},
  path:Array.from({length:201},(_,i)=>({date:date(i),price:prices.at(-1)[1]*Math.exp(i*.001),lower:80,upper:500,
    baselinePrice:prices.at(-1)[1],cycleDisplacement:0,residualLog:0})),longHorizon:{researchAsOf:asOf}};
const record=await createForecastRecord({snapshot,forecast,model,options:{synthetic:true},issuedAt:'2026-01-01T02:00:00Z'});
const receipt=(label,price,collectedAt,vintageId,extra={})=>({date:label,price,collectedAt,vintageId,
  sourceHash:'a'.repeat(64),sourceUrl:'https://example.invalid/boundaries',sourceObservedThrough:label,publishedAt:null,...extra});
const history=()=>prices.map(([label,price])=>receipt(label,price,'2026-01-01T01:00:00.000Z','base:'+label));
const historical=observations=>createHistoricalReplaySession({symbol:'BTCUSD',observations,asOf,horizonDays:30,generatedAt:at});
const recorded=observations=>createRecordedReplaySession({record,snapshot,observations,evaluatedAt:at,horizonDays:180});
const ordered=rows=>[...rows].sort((a,b)=>a.date.localeCompare(b.date));
function permutations(items){return items.length<2?[items]:items.flatMap((item,i)=>permutations(items.filter((_,j)=>i!==j)).map(rest=>[item,...rest]));}

test('historical training excludes later-collected corrections at or before the origin',async()=>{
  const rows=history(),original=await historical(rows);
  const future=receipt(asOf,prices.at(-1)[1]*100,'2026-08-01T01:00:00Z','future');
  const changed=await historical(ordered([...rows,future]));
  assert.equal(changed.id,original.id);assert.deepEqual(changed.forecast,original.forecast);
  assert.deepEqual(changed.training,original.training);assert.deepEqual(changed.inputPrices,original.inputPrices);
});

test('a future-only origin close cannot create a historical forecast',async()=>{
  const rows=history();rows[rows.length-1].collectedAt='2026-08-01T01:00:00Z';
  await assert.rejects(historical(rows),/exact origin/);
});

test('current-vintage historical reconstruction retains eligible post-origin captures honestly',async()=>{
  const session=await historical(history());
  assert.equal(session.mode,'historical-reconstruction');assert.equal(session.identity.issuedAt,null);
  assert.equal(session.identity.historicalModelExistedAtOrigin,false);
  assert.throws(()=>buildReplayFrame(session,{clockMode:'information-time'}),/current-vintage/);
});

test('future conflicting outcome revisions do not block an earlier evaluation',async()=>{
  const base=receipt(date(1),150,'2026-01-02T01:00:00Z','base');
  const a=receipt(date(1),200,'2026-08-01T01:00:00Z','future-a');
  const b=receipt(date(1),300,'2026-08-01T01:00:00Z','future-b');
  const original=await recorded([base]),later=await recorded([base,a,b]);
  assert.deepEqual(buildReplayFrame(later,{cursorIndex:30}),buildReplayFrame(original,{cursorIndex:30}));
});

test('equal-clock historical conflicts cannot hide behind a newer revision in any ordering',async()=>{
  const base=history().slice(0,-1),last=prices.at(-1)[1];
  const revisions=[receipt(asOf,last,'2026-01-02T01:00:00Z','a'),receipt(asOf,last+1,'2026-01-02T01:00:00Z','b'),
    receipt(asOf,last+2,'2026-01-03T01:00:00Z','c')];
  for(const permutation of permutations(revisions))await assert.rejects(historical([...base,...permutation]),/Ambiguous/);
});

test('equal-clock market-date outcome conflicts cannot hide behind a newer revision',async()=>{
  const revisions=[receipt(date(1),150,'2026-01-02T01:00:00Z','a'),receipt(date(1),151,'2026-01-02T01:00:00Z','b'),
    receipt(date(1),152,'2026-01-03T01:00:00Z','c')];
  for(const permutation of permutations(revisions)){
    const session=await recorded(permutation);
    assert.throws(()=>buildReplayFrame(session,{cursorIndex:30}),/Ambiguous/);
  }
});

test('equivalent equal-clock vintages select the same provenance regardless of ordering',async()=>{
  const a=receipt(date(1),150,'2026-01-02T01:00:00Z','a'),b={...a,vintageId:'b'};
  const ab=await recorded([a,b]),ba=await recorded([b,a]);
  assert.deepEqual(buildReplayFrame(ab,{cursorIndex:30}),buildReplayFrame(ba,{cursorIndex:30}));
});

test('equal-clock source hash conflicts fail even when closing prices match',async()=>{
  const a=receipt(date(1),150,'2026-01-02T01:00:00Z','a'),b={...a,vintageId:'b',sourceHash:'b'.repeat(64)};
  const session=await recorded([a,b]);
  assert.throws(()=>buildReplayFrame(session,{cursorIndex:30}),/Ambiguous/);
});

for(const clockMode of ['observed-date','information-time'])test(clockMode+' rejects ambiguous genuine candle ranges despite equal closes',async()=>{
  const a=receipt(date(1),150,'2026-01-02T01:00:00Z','a',{open:140,high:160,low:130,close:150,volume:10});
  const b={...a,vintageId:'b',high:170};
  const session=await recorded([a,b]);
  assert.throws(()=>buildReplayFrame(session,{cursorIndex:30,clockMode}),/Ambiguous/);
});

test('later genuine corrections appear only at their collection cutoff and rewind exactly',async()=>{
  const a=receipt(date(1),150,'2026-01-02T01:00:00Z','a'),b={...a,price:170,vintageId:'b',collectedAt:'2026-01-04T01:00:00Z'};
  const original=await recorded([a]),session=await recorded([a,b]);
  const options={cursorIndex:3,clockMode:'information-time',cursorAt:a.collectedAt};
  assert.deepEqual(buildReplayFrame(session,options),buildReplayFrame(original,options));
  assert.equal(buildReplayFrame(session,{...options,cursorAt:b.collectedAt}).actual[0].price,170);
  assert.deepEqual(buildReplayFrame(session,options),buildReplayFrame(original,options));
});

test('strict earlier frames remain usable before a later ambiguous collection',async()=>{
  const a=receipt(date(1),150,'2026-01-02T01:00:00Z','a');
  const b={...a,price:160,vintageId:'b',collectedAt:'2026-01-04T01:00:00Z'},c={...b,price:170,vintageId:'c'};
  const session=await recorded([a,b,c]),original=await recorded([a]);
  const options={cursorIndex:3,clockMode:'information-time',cursorAt:a.collectedAt};
  assert.deepEqual(buildReplayFrame(session,options),buildReplayFrame(original,options));
  assert.throws(()=>buildReplayFrame(session,{...options,cursorAt:b.collectedAt}),/Ambiguous/);
});

test('market-date selection cannot order an unknown capture against different dated values',async()=>{
  const a={date:date(1),price:150,vintageId:'unknown'},b=receipt(date(1),160,'2026-01-02T01:00:00Z','known');
  for(const rows of [[a,b],[b,a]]){
    const session=await recorded(rows);assert.throws(()=>buildReplayFrame(session,{cursorIndex:30}),/unambiguous/);
  }
});

test('actual candles, exports and metrics obey the closed-session and evaluation boundary',async()=>{
  const a=receipt(date(1),150,'2026-01-02T01:00:00Z','a',{open:140,high:160,low:130,close:150});
  const session=await recorded([a]);
  const frame=buildReplayFrame(session,{cursorIndex:1,clockMode:'information-time',cursorAt:sessionCloseUtc(date(1),'crypto')});
  assert.equal(frame.actual.length,0);assert.equal(frame.metrics.matchedCount,0);
  assert.ok(!JSON.stringify(frame).includes('"high":160'));
});


test('unknown capture cannot hide a different older dated revision behind a matching latest price',async()=>{
  const rows=[receipt(date(1),140,'2026-01-02T01:00:00Z','old'),
    receipt(date(1),150,'2026-01-03T01:00:00Z','latest'),
    {date:date(1),price:150,vintageId:'unknown',sourceHash:'a'.repeat(64)}];
  for(const permutation of permutations(rows)){
    const session=await recorded(permutation);
    assert.throws(()=>buildReplayFrame(session,{cursorIndex:30}),/unambiguous/);
  }
});

test('equal-clock volume revisions are rejected rather than silently choosing a candle',async()=>{
  const a=receipt(date(1),150,'2026-01-02T01:00:00Z','a',{open:140,high:160,low:130,close:150,volume:10});
  const session=await recorded([a,{...a,vintageId:'b',volume:20}]);
  assert.throws(()=>buildReplayFrame(session,{cursorIndex:30}),/Ambiguous/);
});

test('eligible historical revisions are deterministic over every ordering and never become issued records',async()=>{
  const rows=history().slice(0,-1),price=prices.at(-1)[1];
  const revisions=[receipt(asOf,price,'2026-01-01T01:00:00Z','a'),
    receipt(asOf,price+1,'2026-01-02T01:00:00Z','b'),
    receipt(asOf,price+2,'2026-01-03T01:00:00Z','c')];
  let first;
  for(const permutation of permutations(revisions)){
    const session=await historical([...rows,...permutation]);
    first??=session;
    assert.equal(session.id,first.id);assert.deepEqual(session.forecast,first.forecast);
    assert.equal(session.inputPrices.at(-1).price,price+2);
    assert.equal(session.identity.issuedAt,null);
  }
});
