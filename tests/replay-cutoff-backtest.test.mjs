import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {parseBitcoinReplayCandles} from '../dist/chart-replay-sources.js';
import * as cutoffModel from '../dist/replay-cutoff-forecast.js';
import {createCutoffBacktestForecast,restoreCutoffBacktestForecast,firstCutoffBacktestStart} from '../dist/replay-cutoff-forecast.js';
import {createCutoffBacktestReplaySession,buildReplayFrame,buildReplayChartData} from '../dist/forecast-replay.js';
import {createAtlasReplayContext} from '../dist/chart-replay-atlas.js';
import {forecastHash} from '../dist/forecast-records.js';
const archive=await parseBitcoinReplayCandles(await readFile(new URL('../dist/data/btc-volume.json',import.meta.url),'utf8'),{now:Date.parse('2026-11-04T00:00:00Z')});
const asOf='2026-07-09',evaluatedAt='2026-11-04T00:00:00Z',horizonDays=180;
const opts={...archive,cutoffModel,asOf,playbackStartDate:'2026-07-10',horizonDays,evaluatedAt,modelOptions:{scenario:'base',seed:20261022,sampleCount:64,blockDays:28}};
const session=await createCutoffBacktestReplaySession(opts),record=session.cutoffForecast;
const params={prices:archive.observations,asOf,horizonDays,source:archive.source,evaluatedAt};

test('fixed cutoff uses only completed Bitstamp closes and eligible dated evidence, with no current forecast',async()=>{
  assert.equal(session.mode,'cutoff-backtest');assert.equal(record.path.length,181);
  const prefix=archive.observations.filter(r=>r.date<=asOf);
  assert.equal(record.path[0].price,prefix.at(-1).close);assert.equal(record.inputHash,await forecastHash(prefix.map(r=>[r.date,r.close])));
  assert.equal(record.provenance.trainingThrough,asOf);assert.equal(record.provenance.trainingCount,prefix.length);
  assert.ok(record.modelOptions.claims.length);assert.ok(record.modelOptions.claims.every(r=>r.publishedAt<=asOf));
  assert.equal(record.provenance.futurePriceRowsConsumed,false);assert.equal(record.provenance.currentForecastConsumed,false);
  assert.equal(record.issuedAt,null);assert.equal(record.prospectiveScoringEligible,false);assert.equal(record.calibrated,false);
  assert.equal(firstCutoffBacktestStart(archive.observations),'2025-10-16');
  assert.throws(()=>buildReplayFrame(session,{clockMode:'information-time'}),/current-vintage/);
});
test('changing or removing all post-cutoff prices cannot change the generated forecast',async()=>{
  const altered=archive.observations.map(r=>r.date<=asOf?r:{...r,price:r.price*10,open:r.open*10,high:r.high*10,low:r.low*10,close:r.close*10});
  const a=await createCutoffBacktestForecast({...params,prices:altered,createdAt:evaluatedAt,modelOptions:opts.modelOptions});
  const b=await createCutoffBacktestForecast({...params,prices:archive.observations.filter(r=>r.date<=asOf),createdAt:evaluatedAt,modelOptions:opts.modelOptions});
  assert.equal(a.outputHash,record.outputHash);assert.equal(b.outputHash,record.outputHash);assert.equal(a.inputHash,b.inputHash);
});
test('reveal, seek and weekly aggregation keep the frozen path while withholding later OHLC',()=>{
  for(const frequency of ['daily','weekly'])for(const cursorDate of [asOf,'2026-07-10','2026-08-31',session.timeline.at(-1)]){
    const data=buildReplayChartData(session,{cursorDate,frequency});
    assert.ok(data.observedRows.every(r=>r.date<=cursorDate));assert.equal(JSON.stringify(session.cutoffForecast),JSON.stringify(record));
    assert.equal(data.frame.forecast.at(-1).date,record.path.at(-1).date);
  }
  assert.equal(buildReplayFrame(session,{cursorDate:asOf}).metrics.matchedCount,0);
});
test('114 revealed daily comparisons match an independent Python calculation and flat baseline',()=>{
  const frame=buildReplayFrame(session,{cursorDate:session.timeline.at(-1)});
  assert.equal(frame.metrics.matchedCount,114);
  const actual=archive.observations.filter(r=>r.date>asOf&&r.date<=frame.cursorDate),pred=new Map(record.path.map(r=>[r.date,r.price]));
  const data=actual.map(r=>({p:pred.get(r.date),a:r.close,f:record.path[0].price}));
  const result=JSON.parse(execFileSync('python3',['-c',`import json,sys,math
r=json.load(sys.stdin); n=len(r)
sign=lambda x:(x>0)-(x<0)
e=sum(abs(math.log(x['p']/x['a'])) for x in r)/n
flat=sum(abs(math.log(x['f']/x['a'])) for x in r)/n
print(json.dumps({'mae':sum(abs(x['p']-x['a']) for x in r)/n,'mape':sum(abs(x['p']-x['a'])/x['a'] for x in r)/n,'skill':1-e/flat,'direction':sum(sign(x['p']-x['f'])==sign(x['a']-x['f']) for x in r)}))`],{input:JSON.stringify(data),encoding:'utf8'}));
  for(const [key,value] of Object.entries({meanAbsoluteError:result.mae,meanAbsolutePercentageError:result.mape,skillVersusFlat:result.skill}))assert.ok(Math.abs(frame.metrics[key]-value)<1e-10, key);
  assert.equal(frame.metrics.directionCorrectCount,result.direction);assert.equal(frame.metrics.directionCount,114);
});
test('save restore uses exact stored bytes, accepts a changed future suffix, rejects revised prefix and tampering',async()=>{
  const restored=await restoreCutoffBacktestForecast(record,params);assert.equal(JSON.stringify(restored),JSON.stringify(record));
  const future=archive.observations.map(r=>r.date<=asOf?r:{...r,price:r.price*2});
  assert.equal((await restoreCutoffBacktestForecast(record,{...params,prices:future,source:{...params.source,sourceHash:'b'.repeat(64)}})).outputHash,record.outputHash);
  const prefix=structuredClone(archive.observations);prefix.find(r=>r.date===asOf).price+=1;
  await assert.rejects(restoreCutoffBacktestForecast(record,{...params,prices:prefix}));
  for(const mutate of [r=>r.path[1].price+=1,r=>r.modelOptions.seed++,r=>r.outputHash='a'.repeat(64),r=>r.prospectiveScoringEligible=true,r=>r.provenance.trainingCount--]){
    const changed=structuredClone(record);mutate(changed);await assert.rejects(restoreCutoffBacktestForecast(changed,params));
  }
  await assert.rejects(restoreCutoffBacktestForecast(record,{...params,horizonDays:90}));
  await assert.rejects(restoreCutoffBacktestForecast(record,{...params,source:{...params.source,provider:'Coin Metrics'}}));
});
test('insufficient, gapped, unsupported research and premature completion inputs fail explicitly',async()=>{
  const make=p=>createCutoffBacktestForecast({...params,createdAt:evaluatedAt,...p});
  await assert.rejects(make({prices:archive.observations.filter(r=>r.date>'2026-01-01')}),/366/);
  await assert.rejects(make({prices:archive.observations.filter(r=>r.date!=='2026-06-01')}),/빈 날짜/);
  await assert.rejects(make({asOf:'2024-07-09'}));
  await assert.rejects(make({createdAt:'2026-07-09T23:59:59Z'}),/completed/);
});
test('new backtest context carries no current cycle or forecast annotations',()=>{
  const context=createAtlasReplayContext({dataset:session.chartDataset,forecast:session.chartForecast,originDate:asOf,includeAnnotations:false,presentation:{band:true}});
  assert.deepEqual(context.cycleMarkers,[]);assert.deepEqual(context.events,[]);assert.deepEqual(context.turns,[]);assert.equal(context.retrospectiveForecast,null);
});
