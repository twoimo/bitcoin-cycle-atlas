import nodeTest from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import * as vm from 'node:vm';
import {frozenMarketText} from './helpers/frozen-market-fixture.mjs';
import {uiFixture,until,deferred,flush} from './replay-ui-fixture.mjs';
import {buildLongHorizonForecast} from '../dist/long-horizon-forecast.js';
import {parseBitcoinReplayCandles} from '../dist/chart-replay-sources.js';
import {createCurrentChartReplaySession} from '../dist/forecast-replay.js';
import {captureReplayView,sealReplaySnapshot,restoreReplaySnapshot,persistReplayDraft} from '../dist/chart-replay-snapshot.js';
import {createAtlasReplayContext} from '../dist/chart-replay-atlas.js';
import * as retrospectiveModel from '../dist/replay-retrospective.js';

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
async function legacySave(){
  const view=captureReplayView(captured()),asOf='2026-08-16';
  const session=await createCurrentChartReplaySession({...archive,dataset:view.dataset,forecast:view.forecast,asOf,
    playbackStartDate:'2026-08-17',createdAt:'2026-10-31T02:00:00.000Z'});
  const atlasContext=createAtlasReplayContext({dataset:session.chartDataset,forecast:session.chartForecast,presentation:view.presentation,originDate:asOf});
  const snapshot=await sealReplaySnapshot({view,atlasContext,identity:session.identity});
  const draft={version:1,symbol:'BTCUSD',mode:'atlas-chart',origin:asOf,startDate:'2026-08-17',horizon:180,model:null,recordId:null,
    cursorDate:'2026-08-18',cursorIndex:2,speed:.3,frequency:'weekly',chartType:'candles',window:'half',customRange:true,
    range:{start:view.start,end:view.end},source:{provider:'previous saved venue'},sourceHash:'legacy-archive-version',
    outputHash:session.identity.outputHash,saveRevision:'legacy-save-generation',forecastSnapshot:snapshot};
  let text=null;await persistReplayDraft({getItem:()=>text,setItem:(_key,value)=>{text=value;}},'atlas-chart-replay-v1:BTCUSD',draft);
  return {text,draft,snapshot,session};
}

test('August weekly replay generates once and restores both frozen paths without recalculation',async()=>{
  let generations=0,restorations=0;
  const buildCurrent=options=>{
    if(options.createRetrospective)generations++;
    if(options.retrospectiveForecast)restorations++;
    return createCurrentChartReplaySession(options);
  };
  const h=await uiFixture({captured:captured(),archive,actualPainter:true,buildCurrent});
  await h.open();assert.equal(generations,0,'moving the unconfirmed picker must not generate a path');
  assert.equal(h.calls.retrospectiveLoads,0,'the unconfirmed picker must not load the BTC-only model capability');
  await h.start('2026-08-17');assert.equal(h.state().status,'paused',h.state().error);
  const session=h.state().session,record=session.retrospectiveForecast;
  assert.equal(generations,1);assert.equal(h.calls.retrospectiveLoads,1);assert.equal(record.status,'ready');assert.equal(record.asOf,'2026-08-16');
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
  assert.equal(generations,1);assert.equal(h.calls.retrospectiveLoads,1);assert.equal(JSON.stringify(h.state().session.retrospectiveForecast),fixed);
  assert.equal(JSON.stringify(h.state().session.forecast),original);assert.equal(h.svg.dataset.forecastValueSignature,signature);
  await h.mounted.exit({saveSession:true});assert.equal(h.mounted.isActive(),false);
  const saved=h.savedText();assert.ok(saved);h.mounted.destroy();

  const newer=captured();newer.forecast.path[10].price*=1.1;newer.forecast.path[10].upper*=1.2;
  const resumed=await uiFixture({captured:newer,archive,storedText:saved,actualPainter:true,buildCurrent});
  resumed.trigger.click();resumed.controls.get('entry-continue').click();
  await until(()=>['paused','error'].includes(resumed.state().status),'saved August retrospective path');
  assert.equal(resumed.state().status,'paused',resumed.state().error);
  assert.equal(resumed.svg.dataset.replayCursor,'2026-08-18');
  assert.equal(generations,1);assert.equal(restorations,1);assert.equal(resumed.calls.retrospectiveLoads,1);
  assert.equal(JSON.stringify(resumed.state().session.retrospectiveForecast),fixed);
  assert.equal(JSON.stringify(resumed.state().session.forecast),original);
  assert.equal(resumed.svg.dataset.forecastValueSignature,signature);
  assert.equal(resumed.state().session.replaySnapshot.digest,session.replaySnapshot.digest);
  assert.ok(resumed.svg.querySelector('[data-replay-retrospective-path]'));
  resumed.key('ArrowRight');assert.equal(resumed.svg.dataset.replayCursor,'2026-08-19');
  assert.equal(generations,1);assert.equal(resumed.calls.retrospectiveLoads,1);assert.equal(JSON.stringify(resumed.state().session.retrospectiveForecast),fixed);
  const changed=structuredClone(resumed.state().session.replaySnapshot);
  changed.retrospectiveForecast.path[1].price+=1;
  await assert.rejects(restoreReplaySnapshot(changed,{outputHash:changed.outputHash,origin:changed.origin}),/변경/);
  assert.equal(resumed.savedText(),saved);resumed.mounted.destroy();
});

test('exiting while the BTC model capability loads cannot create a stale retrospective session',async()=>{
  const pending=deferred();let generations=0;
  const h=await uiFixture({captured:captured(),archive,loadRetrospectiveModel:()=>pending.promise,
    buildCurrent:options=>{if(options.createRetrospective)generations++;return createCurrentChartReplaySession(options);}});
  await h.open();assert.equal(h.calls.retrospectiveLoads,0);
  await h.start('2026-08-17',{pending:true});assert.equal(h.calls.retrospectiveLoads,1);assert.equal(generations,0);
  await h.mounted.exit();pending.resolve(retrospectiveModel);await flush();
  assert.equal(h.mounted.isActive(),false);assert.equal(h.state().status,'idle');assert.equal(generations,0);assert.equal(h.savedText(),null);
  h.mounted.destroy();
});

test('each confirmed start gets its own previous-day path while transport never regenerates it',async()=>{
  let generations=0,restorations=0;
  const h=await uiFixture({captured:captured(),archive,actualPainter:true,buildCurrent:options=>{
    if(options.createRetrospective)generations++;
    if(options.retrospectiveForecast)restorations++;
    return createCurrentChartReplaySession(options);
  }});
  await h.open();const original=h.svg.dataset.forecastValueSignature,previous=[];
  for(const [index,start]of ['2026-07-06','2026-08-17','2026-09-07'].entries()){
    const asOf=new Date(Date.parse(start+'T00:00:00Z')-86400000).toISOString().slice(0,10);
    await h.start(start);assert.equal(h.state().status,'paused',h.state().error);
    const record=h.state().session.retrospectiveForecast,fixed=JSON.stringify(record);
    assert.equal(record.status,'ready');assert.equal(record.asOf,asOf);
    assert.equal(record.provenance.prices.lastObservation,asOf);
    assert.equal(generations,index+1);assert.equal(restorations,0);
    assert.ok(previous.every(item=>item.record.inputHash!==record.inputHash));
    h.key('ArrowRight');h.controls.get('play').click();h.controls.get('play').click();h.key('ArrowRight');
    h.mounted.handleChartCommand({action:'frequency',value:'daily'});h.mounted.handleChartCommand({action:'frequency',value:'weekly'});
    assert.equal(JSON.stringify(h.state().session.retrospectiveForecast),fixed);
    assert.equal(h.svg.dataset.forecastValueSignature,original);assert.equal(generations,index+1);
    assert.ok(h.lastDraw().data.observedRows.every(row=>row.date<=h.svg.dataset.replayCursor));
    previous.push({record,fixed});assert.ok(previous.every(item=>JSON.stringify(item.record)===item.fixed));
  }
  assert.equal(h.writes.length,0);h.mounted.destroy();
});

test('legacy Continue supplements once, keeps its disclosed cursor while loading, and reuses the saved record thereafter',async()=>{
  const legacy=await legacySave(),pending=deferred();let generations=0,restorations=0;
  const buildCurrent=options=>{if(options.createRetrospective)generations++;if(options.retrospectiveForecast)restorations++;return createCurrentChartReplaySession(options);};
  const changed=captured();changed.forecast.path[10].price*=1.1;changed.forecast.path[10].upper*=1.2;
  const h=await uiFixture({captured:changed,archive,storedText:legacy.text,actualPainter:true,buildCurrent,loadRetrospectiveModel:()=>pending.promise});
  h.trigger.click();h.controls.get('entry-continue').click();
  await until(()=>h.state().status==='loading'&&h.calls.retrospectiveLoads===1,'legacy path preparation');
  assert.equal(h.lastDraw().data.frame.cursorDate,'2026-08-18');
  assert.equal(h.svg.dataset.replayActualThrough,'2026-08-18');
  assert.ok(h.lastDraw().data.observedRows.every(row=>row.date<='2026-08-18'));
  assert.ok(h.lastDraw().data.observedCandles.every(row=>row.endDate<='2026-08-18'));
  assert.equal(h.writes.length,0);assert.equal(h.savedText(),legacy.text);
  pending.resolve(retrospectiveModel);
  await until(()=>h.writes.length===1||h.state().status==='error','completed legacy supplement');
  assert.equal(h.state().status,'paused',h.state().error);assert.equal(h.state().cursorIndex,2);
  assert.equal(h.svg.dataset.replayCursor,'2026-08-18');assert.equal(h.state().speed,.3);
  const session=h.state().session,record=session.retrospectiveForecast,fixed=JSON.stringify(record),saved=h.savedText();
  assert.equal(record.status,'ready');assert.equal(record.asOf,'2026-08-16');assert.equal(generations,1);assert.equal(restorations,0);
  assert.equal(session.replaySnapshot.capturedAt,legacy.snapshot.capturedAt);
  assert.deepEqual(session.replaySnapshot.view,legacy.snapshot.view);
  assert.deepEqual(session.atlasContext,{...legacy.snapshot.atlasContext,retrospectiveForecast:record});
  assert.deepEqual(session.forecast,legacy.session.forecast);assert.notEqual(session.replaySnapshot.digest,legacy.snapshot.digest);
  const {forecastSnapshot:oldSnapshot,saveRevision:oldRevision,...oldFields}=JSON.parse(legacy.text);
  const {forecastSnapshot:newSnapshot,saveRevision:newRevision,...newFields}=JSON.parse(saved);
  assert.deepEqual(newFields,oldFields,'migration must preserve cursor, source, range and all prior settings');
  assert.notEqual(newRevision,oldRevision);assert.notEqual(newSnapshot.digest,oldSnapshot.digest);
  const verified=await restoreReplaySnapshot(newSnapshot,{outputHash:legacy.draft.outputHash,origin:legacy.draft.origin});
  assert.equal(JSON.stringify(verified.retrospectiveForecast),fixed);
  assert.ok(h.frames.length>1);assert.ok(h.frames.every(item=>item.data.frame.cursorDate>='2026-08-18'),
    'loading and every accepted frame must retain the already disclosed cursor');
  assert.ok(h.svg.querySelector('[data-replay-retrospective-path]'));assert.ok(h.svg.querySelector('[data-replay-retrospective-band]'));
  h.key('ArrowRight');assert.equal(h.svg.dataset.replayCursor,'2026-08-19');
  assert.equal(generations,1);assert.equal(h.savedText(),saved,'playback cannot rewrite the supplemented saved cursor');
  await h.mounted.exit();h.mounted.destroy();

  const again=await uiFixture({captured:changed,getAtlasContext:()=>null,archive,storedText:saved,actualPainter:true,buildCurrent});
  again.trigger.click();again.controls.get('entry-continue').click();
  await until(()=>['paused','error'].includes(again.state().status),'second legacy Continue');
  assert.equal(again.state().status,'paused',again.state().error);assert.equal(again.svg.dataset.replayCursor,'2026-08-18');
  assert.equal(generations,1);assert.equal(restorations,1);assert.equal(again.writes.length,0);
  assert.equal(JSON.stringify(again.state().session.retrospectiveForecast),fixed);
  assert.equal(again.state().session.replaySnapshot.digest,session.replaySnapshot.digest);
  assert.equal(again.savedText(),saved);again.mounted.destroy();
});

test('legacy supplementation cannot overwrite a newer saved generation',async()=>{
  const legacy=await legacySave(),pending=deferred();
  const h=await uiFixture({captured:captured(),archive,storedText:legacy.text,loadRetrospectiveModel:()=>pending.promise});
  h.trigger.click();h.controls.get('entry-continue').click();
  await until(()=>h.calls.retrospectiveLoads===1,'legacy capability wait');
  const newest=JSON.stringify({...JSON.parse(legacy.text),cursorDate:'2026-08-20',cursorIndex:4,saveRevision:'newer-tab'});
  h.externalSave(newest);pending.resolve(retrospectiveModel);
  await until(()=>h.state().status==='paused'&&h.svg.dataset.replayCursor==='2026-08-18','conflicted legacy Continue');await flush();
  assert.equal(h.state().session.retrospectiveForecast.status,'ready');assert.equal(h.savedText(),newest);assert.equal(h.writes.length,0);
  assert.match(h.controls.get('save-status').textContent,/다른 탭/);
  assert.equal(h.controls.get('play').disabled,false);assert.equal(h.controls.get('next').disabled,false);h.mounted.destroy();
});

test('exit or a new start revokes a legacy supplement waiting for the storage lock',async()=>{
  const legacy=await legacySave();
  for(const action of ['exit','new-start']){
    const pending=deferred(),entered=deferred(),h=await uiFixture({captured:captured(),archive,storedText:legacy.text});
    h.win.navigator.locks={request:async(name,options,work)=>{entered.resolve();await pending.promise;return work({name});}};
    h.trigger.click();h.controls.get('entry-continue').click();await entered.promise;
    assert.equal(h.state().status,'paused');assert.equal(h.svg.dataset.replayCursor,'2026-08-18');
    if(action==='exit')await h.mounted.exit();else await h.start('2026-09-07');
    pending.resolve();await flush();
    assert.equal(h.mounted.isActive(),action!=='exit');
    if(action==='new-start'){assert.equal(h.state().session.retrospectiveForecast.asOf,'2026-09-06');assert.equal(h.state().status,'paused');}
    assert.equal(h.savedText(),legacy.text);assert.equal(h.writes.length,0);h.mounted.destroy();
  }
});

test('legacy supplement storage failure keeps playback usable and an explicit save retry reuses the same path',async()=>{
  const legacy=await legacySave();let generations=0;
  const h=await uiFixture({captured:captured(),archive,storedText:legacy.text,
    buildCurrent:options=>{if(options.createRetrospective)generations++;return createCurrentChartReplaySession(options);}});
  const write=h.win.localStorage.setItem;h.win.localStorage.setItem=()=>{throw new DOMException('Storage full','QuotaExceededError');};
  h.trigger.click();h.controls.get('entry-continue').click();
  await until(()=>h.state().status==='paused'&&/Storage full/.test(h.controls.get('save-status').textContent),'failed supplement storage');
  const fixed=JSON.stringify(h.state().session.retrospectiveForecast);
  assert.equal(h.savedText(),legacy.text);assert.equal(h.writes.length,0);assert.equal(generations,1);
  assert.equal(h.controls.get('play').disabled,false);assert.equal(h.controls.get('next').disabled,false);
  h.key('ArrowRight');assert.equal(h.svg.dataset.replayCursor,'2026-08-19');
  h.win.localStorage.setItem=write;await h.mounted.exit({saveSession:true});
  assert.equal(h.mounted.isActive(),false);assert.equal(h.writes.length,1);assert.equal(generations,1);
  const saved=JSON.parse(h.savedText()),restored=await restoreReplaySnapshot(saved.forecastSnapshot,{outputHash:saved.outputHash,origin:saved.origin});
  assert.equal(JSON.stringify(restored.retrospectiveForecast),fixed);assert.equal(saved.cursorDate,'2026-08-19');h.mounted.destroy();
});

test('an unavailable earlier start explains the missing path in the HUD and a supported start clears that reason',async()=>{
  const view={...captured(),start:'2024-01-01'};
  const h=await uiFixture({captured:view,archive,actualPainter:true});await h.open();
  await h.start('2024-08-19');assert.equal(h.state().status,'paused',h.state().error);
  const missing=h.state().session.retrospectiveForecast;
  assert.equal(missing.status,'unavailable');assert.deepEqual(missing.path,[]);assert.ok(missing.reason);
  assert.ok(h.hud.children[0].textContent.includes(missing.reason));
  assert.ok(h.svg.querySelector('[data-replay-forecast-path]'));assert.equal(h.svg.querySelector('[data-replay-retrospective-path]'),null);
  h.key('ArrowRight');assert.equal(h.svg.dataset.replayCursor,'2024-08-19');assert.ok(h.hud.children[0].textContent.includes(missing.reason));
  await h.start('2026-08-17');assert.equal(h.state().status,'paused',h.state().error);
  assert.equal(h.state().session.retrospectiveForecast.status,'ready');assert.ok(h.svg.querySelector('[data-replay-retrospective-path]'));
  assert.equal(h.hud.children[0].textContent.includes(missing.reason),false);assert.match(h.hud.children[0].textContent,/회고 예측 고정/);h.mounted.destroy();
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
