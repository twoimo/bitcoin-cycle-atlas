import nodeTest from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import * as vm from 'node:vm';
import {frozenMarketText} from './helpers/frozen-market-fixture.mjs';
import {uiFixture,until} from './replay-ui-fixture.mjs';
import {buildLongHorizonForecast} from '../dist/long-horizon-forecast.js';
import {parseBitcoinReplayCandles} from '../dist/chart-replay-sources.js';
import {createCurrentChartReplaySession} from '../dist/forecast-replay.js';
import {restoreReplaySnapshot} from '../dist/chart-replay-snapshot.js';

const dataset=JSON.parse(await frozenMarketText('btc-daily'));
const archive=await parseBitcoinReplayCandles(await frozenMarketText('btc-volume'),{now:Date.parse('2026-10-31T02:00:00Z')});
const modelOptions={scenario:'base',seed:20261022,sampleCount:64,blockDays:28};
const model=buildLongHorizonForecast(dataset,modelOptions);
// A shorter, real calculated current path keeps this storage fixture small.
// The full operating path and publication are covered by the native gate.
const forecast={version:model.version,asOf:model.asOf,referenceDate:model.referenceDate,
  path:model.path.slice(0,200),scenario:model.scenario,nominalClock:model.nominalClock,assumptions:model.assumptions};
const captured=()=>({dataset:structuredClone(dataset),forecast:structuredClone(forecast),modelOptions,
  start:'2026-07-01',end:'2027-01-01',frequency:'weekly',window:'half',chartType:'candles',
  presentation:{band:true,scale:'log',unit:'usd',showCycleMarkers:true,showCycleIntervals:true}});
const cases=[];
const test=(name,run)=>cases.push({name,run});

test('August weekly replay generates once and restores both frozen paths without recalculation',async()=>{
  let generations=0,restorations=0;
  const buildCurrent=options=>{
    if(options.createRetrospective)generations++;
    if(options.retrospectiveForecast)restorations++;
    return createCurrentChartReplaySession(options);
  };
  const h=await uiFixture({captured:captured(),archive,actualPainter:true,buildCurrent});
  await h.open();assert.equal(generations,0,'moving the unconfirmed picker must not generate a path');
  await h.start('2026-08-17');assert.equal(h.state().status,'paused',h.state().error);
  const session=h.state().session,record=session.retrospectiveForecast;
  assert.equal(generations,1);assert.equal(record.status,'ready');assert.equal(record.asOf,'2026-08-16');
  assert.equal(record.issuedAt,null);assert.equal(record.forecastScoringEnabled,false);
  assert.ok(Object.isFrozen(record.path[1]));
  const fixed=JSON.stringify(record),original=JSON.stringify(session.forecast),signature=h.svg.dataset.forecastValueSignature;
  h.key('ArrowRight');const first=h.lastDraw().data.observedCandles.at(-1);
  h.key('ArrowRight');const second=h.lastDraw().data.observedCandles.at(-1);
  assert.equal(first.endDate,'2026-08-17');assert.equal(second.endDate,'2026-08-18');
  assert.equal(first.open,second.open);assert.equal(second.daysIncluded,2);
  assert.ok(h.lastDraw().data.observedRows.every(row=>row.date<='2026-08-18'));
  assert.ok(h.svg.querySelector('[data-replay-retrospective-path]'));
  assert.ok(h.svg.querySelector('[data-replay-retrospective-band]'));
  assert.ok(h.svg.querySelector('[data-replay-forecast-path]'));
  const frame=h.lastDraw().data.frame;
  assert.ok(frame.retrospectiveForecast.some(row=>row.date==='2026-08-17'));
  assert.ok(frame.retrospectiveForecast.some(row=>row.date>'2026-08-18'));
  assert.deepEqual(frame.dailyComparisons,[]);assert.equal(frame.policy.forecastScoringEnabled,false);
  h.controls.get('play').click();assert.equal(h.state().status,'playing');
  assert.equal(h.svg.dataset.replayCursor,'2026-08-18','Play must resume this cursor');
  h.controls.get('play').click();assert.equal(h.state().status,'paused');
  h.mounted.handleChartCommand({action:'frequency',value:'daily'});
  h.mounted.handleChartCommand({action:'frequency',value:'weekly'});
  assert.equal(generations,1);assert.equal(JSON.stringify(h.state().session.retrospectiveForecast),fixed);
  assert.equal(JSON.stringify(h.state().session.forecast),original);assert.equal(h.svg.dataset.forecastValueSignature,signature);
  await h.mounted.exit({saveSession:true});assert.equal(h.mounted.isActive(),false);
  const saved=h.savedText();assert.ok(saved);h.mounted.destroy();

  const newer=captured();newer.forecast.path[10].price*=1.1;newer.forecast.path[10].upper*=1.2;
  const resumed=await uiFixture({captured:newer,archive,storedText:saved,actualPainter:true,buildCurrent});
  resumed.trigger.click();resumed.controls.get('entry-continue').click();
  await until(()=>['paused','error'].includes(resumed.state().status),'saved August retrospective path');
  assert.equal(resumed.state().status,'paused',resumed.state().error);
  assert.equal(resumed.svg.dataset.replayCursor,'2026-08-18');
  assert.equal(generations,1);assert.equal(restorations,1);
  assert.equal(JSON.stringify(resumed.state().session.retrospectiveForecast),fixed);
  assert.equal(JSON.stringify(resumed.state().session.forecast),original);
  assert.equal(resumed.svg.dataset.forecastValueSignature,signature);
  assert.equal(resumed.state().session.replaySnapshot.digest,session.replaySnapshot.digest);
  assert.ok(resumed.svg.querySelector('[data-replay-retrospective-path]'));
  resumed.key('ArrowRight');assert.equal(resumed.svg.dataset.replayCursor,'2026-08-19');
  assert.equal(generations,1);assert.equal(JSON.stringify(resumed.state().session.retrospectiveForecast),fixed);
  const changed=structuredClone(resumed.state().session.replaySnapshot);
  changed.retrospectiveForecast.path[1].price+=1;
  await assert.rejects(restoreReplaySnapshot(changed,{outputHash:changed.outputHash,origin:changed.origin}),/변경/);
  assert.equal(resumed.savedText(),saved);resumed.mounted.destroy();
});

if(process.argv.includes('--retrospective-ui-case')){
  const index=Number(process.argv[process.argv.indexOf('--retrospective-ui-case')+1]);
  const item=cases[index];assert.ok(item);assert.equal(typeof vm.SourceTextModule,'function');
  await item.run();console.log(JSON.stringify({status:'pass',name:item.name}));
}else{
  for(const [index,item]of cases.entries())nodeTest(item.name,async()=>{
    if(typeof vm.SourceTextModule==='function'){await item.run();return;}
    const result=JSON.parse(execFileSync(process.execPath,
      ['--experimental-vm-modules',fileURLToPath(import.meta.url),'--retrospective-ui-case',String(index)],
      {encoding:'utf8',timeout:45000,stdio:['ignore','pipe','pipe']}));
    assert.equal(result.status,'pass');assert.equal(result.name,item.name);
  });
}
