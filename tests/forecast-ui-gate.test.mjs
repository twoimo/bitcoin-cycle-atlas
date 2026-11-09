import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { forecastAvailabilityForSeries } from '../dist/forecast/forecast-ui-gate.js';
import { parseEquityArchive } from '../dist/equity-market-data.js';
import { equityForecastMarkup, equityForecastRows } from '../dist/equity-forecast-chart.js';
import { equityViewFixture } from './helpers/equity-view-fixture.mjs';

const readArchive = async symbol => JSON.parse(await readFile(new URL(`../dist/data/${symbol.toLowerCase()}-ohlc.json`,import.meta.url),'utf8'));

test('actual completed equity histories use the WP1 sample definition and WP3 model gate',async()=>{
  const bmnr=parseEquityArchive(await readArchive('BMNR'));
  const unavailable=forecastAvailabilityForSeries('BMNR',bmnr);
  assert.equal(unavailable.tier,'T3');
  assert.equal(unavailable.allowed,false);
  assert.equal(unavailable.observations,bmnr.candles.length);
  assert.equal(unavailable.evalSamples,Math.max(0,bmnr.candles.length-90-365));
  assert.equal(unavailable.years,(bmnr.candles.at(-1).time-bmnr.candles[0].time)/(365.25*86400));
  assert.match(unavailable.sampleLabel,new RegExp(`관측 ${bmnr.candles.length}거래일`));
  assert.equal(unavailable.message,'표본 부족으로 미래 경로를 제공하지 않습니다');
  assert.match(unavailable.reason,/BMNR.*tier=T3/);
  const mstr=parseEquityArchive(await readArchive('MSTR'));
  const available=forecastAvailabilityForSeries('MSTR',mstr);
  assert.equal(available.allowed,true);
  assert.equal(available.tier,'T1');
  assert.equal(available.model.family,'structural-nav');
  assert.throws(()=>forecastAvailabilityForSeries('BMNR',{...bmnr,completedOnly:false}),/completed daily/);
  assert.throws(()=>forecastAvailabilityForSeries('BMNR',{...bmnr,interval:'weekly'}),/completed daily/);
});

test('BMNR UI rejects model generation before requesting an underlying path and keeps actual chart ready',async()=>{
  const f=await equityViewFixture('BMNR',{useActualSufficiency:true});
  const archive=await readArchive('BMNR');
  f.reply(0,archive);await f.settle();await f.initialization;
  assert.equal(f.requests.length,1,'a rejected model must not fetch its underlying path');
  assert.equal(f.calculations.length,0,'no treasury projection is built');
  assert.equal(f.latest().forecast,null,'the actual renderer receives no future path or milestones');
  assert.equal(f.replayAvailability().allowed,false,'main-canvas replay receives the same T3 gate');
  assert.equal(f.replayAvailability().observations,archive.candles.length);
  assert.equal(f.latest().series.candles.length,archive.candles.length);
  assert.equal(f.document.documentElement.dataset.boot,'ready');
  assert.equal(f.app.inert,false);
  const notice=f.app.querySelector('#equity-forecast-unavailable');
  assert.equal(notice.hidden,false);
  assert.equal(notice.querySelector('[data-forecast-message]').textContent,'표본 부족으로 미래 경로를 제공하지 않습니다');
  assert.match(notice.querySelector('[data-forecast-sample]').textContent,new RegExp(`T3 · 관측 ${archive.candles.length}거래일`));
  assert.equal(f.app.querySelector('.equity-projected').hidden,true);
  assert.equal(f.app.querySelector('#equity-vintage').textContent,'');
  assert.equal(f.app.querySelector('#equity-scenario').disabled,true);
  assert.match(f.status(),/표본 부족 · T3/);
  assert.match(f.forecastDialog(),/표본 부족으로 미래 경로를 제공하지 않습니다/);
  assert.match(f.forecastDialog(),/data-open-asset-forecast-journal="BMNR"/,'preserved historical records remain accessible separately');
  assert.doesNotMatch(f.forecastDialog(),/data-equity-retry/,'insufficient data is not a retryable load failure');
  f.interval('weekly');f.scenario('bull');await f.settle();
  assert.equal(f.latest().forecast,null,'interval/scenario changes cannot revive a blocked cached path');
  assert.equal(f.calculations.length,0);
  f.reload();f.reply(1,archive);await f.settle();
  assert.equal(f.requests.length,2,'refresh rechecks real observations without fetching a blocked model');
  assert.equal(f.calculations.length,0);
  assert.equal(f.latest().forecast,null);
});

test('eligible MSTR UI still computes and renders its linked model through the real gate',async()=>{
  const f=await equityViewFixture('MSTR',{useActualSufficiency:true});
  f.reply(0,await readArchive('MSTR'));await f.microtasks();
  assert.equal(f.requests.length,2);
  f.reply(1,{revision:1});await f.settle();await f.initialization;
  assert.equal(f.calculations.length,1);
  assert.equal(f.latest().forecast.scenario,'base');
  assert.equal(f.replayAvailability().allowed,true,'eligible MSTR replay remains available');
  assert.equal(f.app.querySelector('#equity-forecast-unavailable').hidden,true);
  assert.equal(f.app.querySelector('.equity-projected').hidden,false);
  assert.equal(f.app.querySelector('#equity-scenario').disabled,false);
});

test('repeated simulated peak labels paint once while every dated evidence marker and basis remains',()=>{
  const time=date=>Date.parse(`${date}T00:00:00Z`)/1000;
  const milestones=['2027-01-01','2028-01-01','2029-01-01','2030-01-01'].map((date,index)=>({id:`peak-${index}`,date,title:'모의 고점 후보',turnType:'high',description:`근거 ${index} · 12% 반전 규칙`}));
  const forecast={path:milestones.map((item,index)=>({date:item.date,price:100+index,low:90,high:120})),milestones};
  const before=structuredClone(forecast),points=equityForecastRows(forecast,-Infinity);
  const render=minTime=>equityForecastMarkup({forecast,points,lastObserved:null,x:t=>(t-minTime)/86400+10,y:v=>200-v,left:0,right:1600,top:0,bottom:300,clipId:'test',minTime,maxTime:time('2030-01-02')});
  const all=render(time('2026-12-31'));
  assert.equal((all.markup.match(/>모의 고점 후보<\/text>/g)||[]).length,1);
  assert.equal(all.markerIds.size,4);
  for(const marker of milestones){assert.ok(all.markerIds.has(marker.id));assert.ok(all.markup.includes(marker.description));assert.ok(all.markup.includes(`data-forecast-evidence="${marker.id}"`));}
  const zoomed=render(time('2028-01-01'));
  assert.equal((zoomed.markup.match(/>모의 고점 후보<\/text>/g)||[]).length,1,'a visible marker still names the series after the first marker leaves the viewport');
  assert.equal(zoomed.markerIds.size,3);
  assert.deepEqual(forecast,before,'display deduplication must not discard model evidence');
});
