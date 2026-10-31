import nodeTest from 'node:test';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import * as vm from 'node:vm';

const cases=[];
const test=(name,run)=>cases.push({name,run});
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {uiFixture,flush,deferred,until} from './replay-ui-fixture.mjs';
import {parseBitcoinReplayCandles} from '../dist/chart-replay-sources.js';
import {buildLongHorizonForecast} from '../dist/long-horizon-forecast.js';
import {createCurrentChartReplaySession} from '../dist/forecast-replay.js';
import {forecastValueSignature} from '../dist/atlas-price-chart.js';
import {parseProjectReplayBaseline} from '../dist/project-replay-baseline.js';
const archive=await parseBitcoinReplayCandles(await readFile(new URL('../dist/data/btc-volume.json',import.meta.url),'utf8'),{now:Date.parse('2026-10-31T02:00:00Z')});
const dataset=JSON.parse(await readFile(new URL('../dist/data/btc-daily.json',import.meta.url),'utf8'));
const forecast=buildLongHorizonForecast(dataset,{scenario:'base',sampleCount:64});
const old=await parseProjectReplayBaseline(await readFile(new URL('../dist/data/project-origin-btc-2026-10-21.json',import.meta.url),'utf8'));
const capture=()=>({dataset:structuredClone(dataset),forecast:structuredClone(forecast),start:'2024-10-29',end:'2028-10-29',frequency:'weekly',window:'focus',chartType:'candles',presentation:{band:true,scale:'log',unit:'usd',showCycleMarkers:true,showCycleIntervals:true}});
const fixtures=options=>uiFixture({captured:capture(),archive,loadBaseline:async()=>old,...options});
test('current forecast mode works even when unrelated historical baseline is unavailable',async()=>{const h=await fixtures({loadBaseline:async()=>{throw new Error('historical archive offline');}});await h.open();assert.equal(h.state().status,'selecting');assert.equal(h.calls.baseline,0);assert.ok(h.svg.children.length>0);h.mounted.destroy();});
test('loading a selected start preserves the forecast and removes every actual after its cutoff',async()=>{const hold=deferred();let calls=0;const h=await fixtures({buildCurrent:options=>++calls===1?createCurrentChartReplaySession(options):hold.promise});await h.open();const signature=h.svg.dataset.forecastValueSignature;await h.start('2026-08-17',{pending:true});assert.equal(h.state().status,'loading');assert.ok(h.svg.children.length>0,'fixed forecast cannot disappear during loading');assert.equal(h.svg.dataset.forecastValueSignature,signature);assert.ok(h.lastDraw().data.observedRows.every(r=>r.date<='2026-08-16'));assert.ok(h.lastDraw().data.observedCandles.every(r=>r.endDate<='2026-08-16'));for(const key of ['play','next','live','export'])assert.equal(h.controls.get(key).disabled,true);assert.equal(h.state().session,null);h.mounted.destroy();hold.resolve(null);await flush();});
test('failed session preparation retains the safe fixed layer without stale metrics or export',async()=>{let calls=0;const h=await fixtures({buildCurrent:options=>++calls===1?createCurrentChartReplaySession(options):Promise.reject(new Error('fixture hash failure'))});await h.open();const signature=h.svg.dataset.forecastValueSignature;await h.start('2026-08-17');assert.equal(h.state().status,'error');assert.ok(h.svg.children.length>0,'the error must not delete the fixed path');assert.equal(h.svg.dataset.forecastValueSignature,signature);assert.ok(h.lastDraw().data.observedRows.every(r=>r.date<='2026-08-16'));assert.equal(h.controls.get('detail-metric').textContent,'');assert.equal(h.controls.get('export').disabled,true);assert.equal(h.state().session,null);h.mounted.destroy();});
test('source fetch failure keeps only the captured assumption and does not invent candles',async()=>{const h=await fixtures({loadArchive:async()=>{throw new Error('OHLC archive offline');}});await h.open();assert.equal(h.state().status,'error');assert.ok(h.svg.children.length>0);assert.equal(h.lastDraw().data.observedRows.length,0);assert.equal(h.lastDraw().data.observedCandles.length,0);assert.equal(h.controls.get('export').disabled,true);h.mounted.destroy();});
test('live mutation during the archive wait cannot modify the captured path or band',async()=>{const captured=capture(),before=forecastValueSignature(captured.forecast.path),hold=deferred();const h=await fixtures({captured,loadArchive:()=>hold.promise});h.trigger.click();captured.forecast.path[10].price*=1.1;captured.forecast.path[10].upper*=1.2;hold.resolve(archive);await h.ready();assert.equal(h.state().status,'selecting');assert.equal(h.svg.dataset.forecastValueSignature,before);h.mounted.destroy();});
test('new mode does not alter the compact bar order or the four-action first menu',async()=>{const h=await fixtures();await h.open();const row=h.panel.innerHTML.slice(h.panel.innerHTML.indexOf('class="chart-replay-actions"'),h.panel.innerHTML.indexOf('data-cr="exit"'));assert.deepEqual([...row.matchAll(/data-cr="([^"]+)"/g)].map(m=>m[1]),['first','select-menu','pick','play','next','speed','update-interval','live']);h.controls.get('select-menu').click();assert.equal(h.controls.get('select-panel').dataset.menuView,'start');assert.equal(h.controls.get('date-view').hidden,true);assert.equal(h.controls.get('forecast-view').hidden,true);assert.equal(h.controls.has('previous'),false);h.mounted.destroy();});
test('weekly replay still advances one genuine day on Shift+Right and never rewinds on Shift+Left',async()=>{const h=await fixtures();await h.open();await h.start('2026-08-17');assert.equal(h.state().status,'paused');const signature=h.svg.dataset.forecastValueSignature;h.key('ArrowRight');const a=h.lastDraw().data.observedCandles.at(-1);h.key('ArrowRight');const b=h.lastDraw().data.observedCandles.at(-1);assert.equal(a.open,b.open);assert.equal(a.periodStartDate,b.periodStartDate);assert.equal(a.close,64484.76);assert.equal(b.close,64686.09);assert.equal(h.svg.dataset.forecastValueSignature,signature);const cursor=h.state().cursorIndex;h.key('ArrowLeft');assert.equal(h.state().cursorIndex,cursor);assert.equal(h.controls.get('update-interval').value,'daily');h.mounted.destroy();});
test('reselection keeps the forecast while rebuilding actuals only up to the earlier cutoff',async()=>{let calls=0;const hold=deferred();const h=await fixtures({buildCurrent:options=>++calls<=2?createCurrentChartReplaySession(options):hold.promise});await h.open();await h.start('2026-10-21');h.key('ArrowRight');h.key('ArrowRight');assert.equal(h.lastDraw().data.frame.cursorDate,'2026-10-22');await h.start('2026-08-17',{pending:true});assert.equal(h.state().status,'loading');assert.ok(h.svg.children.length>0,'fixed layer is retained on reselection');assert.ok(h.lastDraw().data.observedRows.every(r=>r.date<='2026-08-16'));assert.ok(h.lastDraw().data.observedCandles.every(r=>r.endDate<='2026-08-16'));assert.equal(h.writes.length,0);h.mounted.destroy();hold.resolve(null);await flush();});

// The next two cases connect the real coordinator, replay engine, Atlas wrapper
// and SVG painter. The parsed DOM boundary is not a native browser substitute.
test('real SVG painter retains the dotted line and brown range during pending selection',async()=>{
  let calls=0;const hold=deferred();
  const h=await fixtures({actualPainter:true,buildCurrent:options=>++calls===1?createCurrentChartReplaySession(options):hold.promise});
  await h.open();const signature=h.svg.dataset.forecastValueSignature;
  await h.start('2026-08-17',{pending:true});
  assert.equal(h.state().status,'loading');
  assert.ok(h.svg.querySelector('[data-replay-forecast-path]').getAttribute('d').length>0);
  assert.ok(h.svg.querySelector('[data-indicator-layer="range"]'));
  assert.equal(h.svg.dataset.forecastValueSignature,signature);
  assert.equal(h.svg.dataset.replayActualThrough,'2026-08-16');
  assert.equal(h.svg.dataset.replayPending,'true');
  assert.ok(h.frames.at(-1).data.observedCandles.every(row=>row.endDate<='2026-08-16'));
  assert.equal(h.svg.onpointermove,null);
  h.mounted.destroy();hold.resolve(null);await flush();
});
test('real SVG painter preserves assumptions after an OHLC source error with zero actual candles',async()=>{
  const h=await fixtures({actualPainter:true,loadArchive:async()=>{throw new Error('fixture OHLC offline');}});
  await h.open();assert.equal(h.state().status,'error');
  assert.ok(h.svg.querySelector('[data-replay-forecast-path]').getAttribute('d').length>0);
  assert.ok(h.svg.querySelector('[data-indicator-layer="range"]'));
  assert.equal(h.svg.dataset.observedCandleCount,'0');
  assert.equal(h.svg.dataset.observedLineCount,'0');
  assert.equal(h.controls.get('export').disabled,true);
  assert.match(h.controls.get('model-label').textContent,/현재 예측선 보존/);
  h.mounted.destroy();
});


// These use the real coordinator, storage codec, replay engine and SVG painter.
// The DOM boundary is still a fixture; native Chrome is a separate gate.
test('Continue restores the saved dotted path and band after live assumptions change',async()=>{
  const view={...capture(),dataset:structuredClone(old.dataset),forecast:structuredClone(old.forecast)};
  const first=await fixtures({captured:view,actualPainter:true});await first.open();await first.start('2026-10-21');
  first.key('ArrowRight');first.key('ArrowRight');
  const previous=first.state().session,signature=first.svg.dataset.forecastValueSignature;
  await first.mounted.exit({saveSession:true});const bytes=first.savedText();
  assert.ok(JSON.parse(bytes).forecastSnapshot,'a hash-only save cannot restore a former curve');first.mounted.destroy();
  const changed=structuredClone(view);changed.forecast.path[10].price*=1.2;changed.forecast.path[10].upper*=1.3;changed.presentation.band=false;
  const resumed=await fixtures({captured:changed,storedText:bytes,actualPainter:true});
  resumed.trigger.click();resumed.controls.get('entry-continue').click();
  await until(()=>['paused','error'].includes(resumed.state().status),'restored saved capture');
  assert.equal(resumed.state().status,'paused',resumed.state().error);
  assert.equal(resumed.svg.dataset.replayCursor,'2026-10-22');
  assert.equal(resumed.svg.dataset.forecastValueSignature,signature);
  assert.deepEqual(resumed.state().session.forecast,previous.forecast);
  assert.equal(resumed.state().session.replaySnapshot.digest,previous.replaySnapshot.digest);
  assert.equal(resumed.state().session.identity.issuedAt,null);
  assert.equal(resumed.state().session.policy.forecastScoringEnabled,false);
  assert.ok(resumed.svg.querySelector('[data-indicator-layer="range"]'));
  resumed.key('ArrowRight');assert.equal(resumed.svg.dataset.replayCursor,'2026-10-23');
  assert.equal(resumed.svg.dataset.forecastValueSignature,signature);
  const layer=resumed.svg.querySelector('.price-series-layer'),path=layer.querySelector('[data-replay-forecast-path]');
  for(const node of layer.querySelectorAll('.observed-candle,.observed-candles-batched'))assert.ok(layer.children.indexOf(node)>layer.children.indexOf(path));
  assert.equal(resumed.savedText(),bytes);assert.equal(resumed.writes.length,0);resumed.mounted.destroy();
});
test('Continue does not require the newest live model to restore a full saved curve',async()=>{
  const view={...capture(),dataset:structuredClone(old.dataset),forecast:structuredClone(old.forecast)};
  const first=await fixtures({captured:view});await first.open();await first.start('2026-10-21');
  first.key('ArrowRight');await first.mounted.exit({saveSession:true});const bytes=first.savedText();first.mounted.destroy();
  const resumed=await fixtures({getAtlasContext:()=>null,storedText:bytes});
  resumed.trigger.click();resumed.controls.get('entry-continue').click();
  await until(()=>['paused','error'].includes(resumed.state().status),'saved model without live input');
  assert.equal(resumed.state().status,'paused');assert.equal(resumed.svg.dataset.replayCursor,'2026-10-21');
  assert.equal(resumed.writes.length,0);resumed.mounted.destroy();
});
test('a corrupt saved capture fails closed and preserves stored bytes and disabled controls',async()=>{
  const view={...capture(),dataset:structuredClone(old.dataset),forecast:structuredClone(old.forecast)};
  const first=await fixtures({captured:view});await first.open();await first.start('2026-10-21');
  await first.mounted.exit({saveSession:true});const saved=JSON.parse(first.savedText());first.mounted.destroy();
  saved.forecastSnapshot.digest='0'.repeat(64);const bytes=JSON.stringify(saved);
  const resumed=await fixtures({storedText:bytes});resumed.trigger.click();resumed.controls.get('entry-continue').click();
  await until(()=>resumed.state().status==='error','corrupt capture rejected');
  assert.equal(resumed.state().session,null);assert.equal(resumed.calls.current,0);
  for(const name of ['play','next','live','export'])assert.equal(resumed.controls.get(name).disabled,true);
  assert.equal(resumed.savedText(),bytes);assert.equal(resumed.writes.length,0);resumed.mounted.destroy();
});

// Match the existing UI suite: run the exact same assertions in an explicitly
// enabled VM child when npm test starts Node without experimental VM modules.
if(process.argv.includes('--fixed-overlay-case')){
  const index=Number(process.argv[process.argv.indexOf('--fixed-overlay-case')+1]);
  const item=cases[index];assert.ok(item,'A named overlay case is required');
  assert.equal(typeof vm.SourceTextModule,'function','VM child must enable modules');
  await item.run();console.log(JSON.stringify({status:'pass',name:item.name}));
}else{
  for(const [index,item] of cases.entries())nodeTest(item.name,async()=>{
    if(typeof vm.SourceTextModule==='function'){await item.run();return;}
    const result=JSON.parse(execFileSync(process.execPath,
      ['--experimental-vm-modules',fileURLToPath(import.meta.url),'--fixed-overlay-case',String(index)],
      {encoding:'utf8',timeout:30000,stdio:['ignore','pipe','pipe']}));
    assert.equal(result.status,'pass');assert.equal(result.name,item.name);
  });
}
