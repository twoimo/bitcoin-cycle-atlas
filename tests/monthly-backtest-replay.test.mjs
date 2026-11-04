import nodeTest from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import * as vm from 'node:vm';
import {uiFixture} from './replay-ui-fixture.mjs';
import {frozenReplayArchive} from './helpers/frozen-replay-fixture.mjs';
import {buildLongHorizonForecast} from '../dist/long-horizon-forecast.js';
import {createCutoffBacktestForecast} from '../dist/replay-cutoff-forecast.js';
import {monthlyReplayForecast} from '../dist/monthly-backtest.js';

const archive=await frozenReplayArchive();
const dataset={prices:archive.observations.map(r=>[r.date,r.price]),meta:{sourceName:'Bitstamp'}};
const forecast=buildLongHorizonForecast(dataset,{scenario:'base',seed:20261022,sampleCount:64});
const captured={dataset,forecast,start:'2026-05-01',end:'2027-02-01',frequency:'daily',window:'half',chartType:'candles',presentation:{band:true,scale:'log'}};
const parent=await createCutoffBacktestForecast({prices:archive.observations,asOf:'2025-10-31',horizonDays:365,source:archive.source,createdAt:'2026-11-02T00:00:00Z'});
const cases=[];
cases.push({name:'monthly fixed replay keeps its exact path, transport and both existing saved sessions',async run(){
  const h=await uiFixture({captured,archive,initialMode:'cutoff-backtest',actualPainter:true});
  h.storage.set('atlas-cutoff-backtest-v1:BTCUSD','existing manual cutoff replay');h.storage.set('atlas-chart-replay-v1:BTCUSD','existing orange replay');
  const record=await monthlyReplayForecast(parent,90);
  await h.mounted.openFixedBacktest(record);
  assert.equal(h.state().status,'paused',h.state().error);assert.equal(h.state().session.cutoffForecast.outputHash,record.outputHash);
  for(const name of ['select-menu','pick','mode','horizon'])assert.equal(h.controls.get(name).disabled,true,name);
  assert.equal(h.controls.get('mode-badge').disabled,false,'read-only method and export remain reachable');
  assert.equal(h.controls.get('mode-badge').textContent,'월말 고정본');
  h.controls.get('mode-badge').click();h.controls.get('select-close').click();assert.equal(h.doc.activeElement,h.controls.get('mode-badge'));
  h.controls.get('mode-badge').click();h.key('Escape',false);assert.equal(h.doc.activeElement,h.controls.get('mode-badge'));
  h.controls.get('next').click();assert.equal(h.state().session.cutoffForecast.outputHash,record.outputHash);
  h.controls.get('result').click();assert.equal(h.svg.dataset.replayCursor,'2026-01-29');
  assert.equal(h.state().session.cutoffForecast.outputHash,record.outputHash);assert.equal(h.calls.current,0);assert.equal(h.calls.retrospectiveLoads,0);
  h.controls.get('exit').click();assert.equal(h.controls.get('exit-save').checked,false);assert.equal(h.controls.get('exit-save').disabled,true);
  await h.mounted.exit({saveSession:true});assert.equal(h.state().status,'idle');assert.equal(h.writes.length,0);
  assert.equal(h.storage.get('atlas-cutoff-backtest-v1:BTCUSD'),'existing manual cutoff replay');assert.equal(h.storage.get('atlas-chart-replay-v1:BTCUSD'),'existing orange replay');h.mounted.destroy();
}});
cases.push({name:'a corrupted monthly record is rejected without silently calculating a replacement',async run(){
  const h=await uiFixture({captured,archive,initialMode:'cutoff-backtest'}),record=structuredClone(parent);record.path[1].price+=10;
  await h.mounted.openFixedBacktest(record);assert.equal(h.state().status,'error');assert.equal(h.writes.length,0);assert.match(h.state().error,/변경/);
  await h.mounted.exit();assert.equal(h.mounted.isActive(),false);h.mounted.destroy();
}});
if(process.argv.includes('--monthly-replay-case')){const item=cases[Number(process.argv.at(-1))];await item.run();console.log(JSON.stringify({status:'pass',name:item.name}));}
else for(const [index,item] of cases.entries())nodeTest(item.name,async()=>{
  if(typeof vm.SourceTextModule==='function'){await item.run();return;}
  const result=JSON.parse(execFileSync(process.execPath,['--experimental-vm-modules',fileURLToPath(import.meta.url),'--monthly-replay-case',String(index)],{encoding:'utf8',timeout:45000,stdio:['ignore','pipe','pipe']}));assert.equal(result.status,'pass');
});
