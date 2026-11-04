import nodeTest from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import * as vm from 'node:vm';
import {uiFixture,until,flush} from './replay-ui-fixture.mjs';
import {frozenReplayArchive} from './helpers/frozen-replay-fixture.mjs';
import {buildLongHorizonForecast} from '../dist/long-horizon-forecast.js';
const archive=await frozenReplayArchive();
const dataset={prices:archive.observations.map(r=>[r.date,r.price]),meta:{sourceName:'Bitstamp'}};
const forecast=buildLongHorizonForecast(dataset,{scenario:'base',seed:20261022,sampleCount:64});
const captured={dataset,forecast,start:'2026-05-01',end:'2027-02-01',frequency:'daily',window:'half',chartType:'candles',presentation:{band:true,scale:'log'}};
const fixture=options=>uiFixture({captured,archive,initialMode:'cutoff-backtest',...options});
const cases=[];const test=(name,run)=>cases.push({name,run});
test('cutoff selection, result reveal and save resume retain the exact forecast and old storage',async()=>{
  const h=await fixture({actualPainter:true});h.storage.set('atlas-chart-replay-v1:BTCUSD','old-user-state');
  h.trigger.click();await until(()=>h.controls.get('entry-dialog').hidden===false,'invalid saved replay choice');
  assert.equal(h.controls.get('entry-continue').disabled,true);assert.match(h.controls.get('saved-summary').textContent,/읽지 못했습니다/);
  assert.equal(h.storage.get('atlas-chart-replay-v1:BTCUSD'),'old-user-state');assert.equal(h.writes.length,0);
  h.controls.get('entry-new').click();await h.ready();
  assert.equal(h.controls.get('mode').value,'cutoff-backtest');assert.equal(h.controls.get('date').min,'2025-10-16');
  assert.equal(h.storage.get('atlas-chart-replay-v1:BTCUSD'),'old-user-state');assert.equal(h.writes.length,0);
  assert.equal(h.controls.get('result').disabled,true);assert.equal(h.calls.current,0);
  await h.start('2026-07-10');assert.equal(h.state().status,'paused',h.state().error);
  const record=h.state().session.cutoffForecast,hash=record.outputHash;
  assert.equal(h.state().session.asOf,'2026-07-09');assert.equal(h.calls.current,0);assert.equal(h.calls.retrospectiveLoads,0);
  assert.equal(h.svg.dataset.replayOverlapCount,'0');
  h.controls.get('result').click();assert.equal(h.svg.dataset.replayCursor,'2026-10-31');assert.equal(h.svg.dataset.replayOverlapCount,'114');
  assert.equal(h.state().session.cutoffForecast.outputHash,hash);assert.match(h.controls.get('detail-metric').textContent,/114\/180일.*66일.*102\/114/);
  assert.match(h.controls.get('evaluation-meaning').textContent,/매매 승률이 아닙니다/);
  h.controls.get('exit').click();h.controls.get('exit-save').checked=true;h.controls.get('exit-confirm').click();await until(()=>h.state().status==='idle');
  const saved=h.storage.get('atlas-cutoff-backtest-v1:BTCUSD');assert.equal(JSON.parse(saved).cutoffForecast.outputHash,hash);
  assert.equal(h.storage.get('atlas-chart-replay-v1:BTCUSD'),'old-user-state');h.mounted.destroy();
  const r=await fixture({storedText:saved,actualPainter:true});r.trigger.click();r.controls.get('entry-continue').click();await until(()=>['paused','ended','error'].includes(r.state().status));
  assert.equal(r.state().status,'ended',r.state().error);assert.equal(r.svg.dataset.replayCursor,'2026-10-31');
  assert.equal(JSON.stringify(r.state().session.cutoffForecast),JSON.stringify(record));assert.equal(r.calls.current,0);assert.equal(r.writes.length,0);r.mounted.destroy();
});
test('a different horizon retains the selected start, while an invalid saved forecast fails without regeneration',async()=>{
  const h=await fixture();await h.open();await h.start('2026-07-10');
  h.controls.get('horizon').value='90';h.controls.get('horizon').onchange();await until(()=>h.state().status==='paused'&&h.state().session.cutoffForecast.horizonDays===90);
  assert.equal(h.state().session.asOf,'2026-07-09');assert.equal(h.state().session.cutoffForecast.path.length,91);
  h.controls.get('result').click();assert.equal(h.svg.dataset.replayCursor,'2026-10-07');
  h.controls.get('exit').click();h.controls.get('exit-save').checked=true;h.controls.get('exit-confirm').click();await until(()=>h.state().status==='idle');
  const saved=JSON.parse(h.savedText());saved.cutoffForecast.path[1].price+=10;h.mounted.destroy();
  const r=await fixture({storedText:JSON.stringify(saved)});r.trigger.click();r.controls.get('entry-continue').click();await flush();console.error(JSON.stringify({debug:r.state().status,error:r.state().error,entry:r.controls.get('entry-dialog').hidden,summary:r.controls.get('saved-summary').textContent,active:r.mounted.isActive()}));await until(()=>['paused','ended','error'].includes(r.state().status));
  assert.equal(r.state().status,'error');assert.equal(r.writes.length,0);assert.equal(r.calls.current,0);assert.match(r.hud.children[0].textContent,/変更|변경/);r.mounted.destroy();
});
test('unavailable source stays an error, and retry accepts a supported date without saving preview',async()=>{
  let fail=true;const h=await fixture({loadArchive:async()=>{if(fail)throw new Error('archive unavailable');return archive;}});
  await h.open();assert.equal(h.state().status,'error');assert.match(h.hud.children[0].textContent,/archive unavailable/);assert.equal(h.writes.length,0);
  fail=false;h.controls.get('mode').onchange();await h.ready();
  assert.equal(h.state().status,'selecting',h.state().error);assert.equal(h.state().session,null);assert.equal(h.writes.length,0);
  await h.start('2026-07-10');assert.equal(h.state().status,'paused',h.state().error);assert.equal(h.writes.length,0);h.mounted.destroy();
});
if(process.argv.includes('--cutoff-ui-case')){const item=cases[Number(process.argv.at(-1))];await item.run();console.log(JSON.stringify({status:'pass',name:item.name}));}
else for(const [index,item] of cases.entries())nodeTest(item.name,async()=>{
  if(typeof vm.SourceTextModule==='function'){await item.run();return;}
  const result=JSON.parse(execFileSync(process.execPath,['--experimental-vm-modules',fileURLToPath(import.meta.url),'--cutoff-ui-case',String(index)],{encoding:'utf8',timeout:45000,stdio:['ignore','pipe','pipe']}));assert.equal(result.status,'pass');
});
