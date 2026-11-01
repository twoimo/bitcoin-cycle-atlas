import assert from 'node:assert/strict';
import test from 'node:test';
import {readFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import * as vm from 'node:vm';
import * as longModel from '../dist/long-horizon-forecast.js';
import * as detailedModel from '../dist/detailed-forecast.js';
import * as evidence from '../dist/long-horizon-evidence.js';
import * as recordTools from '../dist/forecast-records.js';
import * as clocks from '../dist/forecast-information-time.js';
import * as cycle from '../dist/cycle-engine.js';
import {createReplayRetrospectiveForecast,restoreReplayRetrospectiveForecast} from '../dist/replay-retrospective.js';
import {createCurrentChartReplaySession,buildReplayFrame,buildReplayChartData} from '../dist/forecast-replay.js';
import {parseBitcoinReplayCandles} from '../dist/chart-replay-sources.js';

const dataset=JSON.parse(await readFile(new URL('../dist/data/btc-daily.json',import.meta.url),'utf8'));
const venueText=await readFile(new URL('../dist/data/btc-volume.json',import.meta.url),'utf8');
const capturedAt=new Date(Math.max(Date.parse(dataset.meta.retrievedAt),Date.parse(JSON.parse(venueText).retrievedAt),Date.parse('2026-11-01T00:00:00Z'))+86400000).toISOString();
const evaluatedAt=new Date(Date.parse(capturedAt)+60000).toISOString();
const archive=await parseBitcoinReplayCandles(venueText,{now:Date.parse(evaluatedAt)});
const asOf='2026-08-16',playbackStartDate='2026-08-17';
const modelOptions={scenario:'base',seed:20261022,sampleCount:128,blockDays:28};
const forecast=longModel.buildLongHorizonForecast(dataset,modelOptions);
const options={...archive,dataset,forecast,asOf,playbackStartDate,createdAt:capturedAt,evaluatedAt,modelOptions};
const original=await createCurrentChartReplaySession(options);
const session=await createCurrentChartReplaySession({...options,createRetrospective:true});
const retrospective=session.retrospectiveForecast;
const prefix=dataset.prices.filter(([date])=>date<=asOf).map(([date,price])=>[date,price]);
const restoreOptions={dataset,asOf,displayEnd:forecast.asOf,originalOutputHash:session.identity.outputHash,evaluatedAt};
const generateOptions={dataset,forecast,asOf,createdAt:evaluatedAt,originalOutputHash:session.identity.outputHash,modelOptions};

async function singleModelInvocation(){
  let calls=0,capturedInput=null,capturedOptions=null,forbidBuild=false;
  const context=vm.createContext({structuredClone,Date,Math,console,URL,TypeError,RangeError,Error});
  async function module(exports){const result=new vm.SyntheticModule(Object.keys(exports),function(){for(const [key,value]of Object.entries(exports))this.setExport(key,value);},{context});await result.link(()=>{throw new Error('Unexpected nested import');});await result.evaluate();return result;}
  const imports={
    './long-horizon-forecast.js':await module({...longModel,buildLongHorizonForecast:(input,settings)=>{calls++;if(forbidBuild)throw new Error('A saved retrospective must never rerun the model');capturedInput=structuredClone(input);capturedOptions=structuredClone(settings);return longModel.buildLongHorizonForecast(input,settings);}}),
    './detailed-forecast.js':await module(detailedModel),'./long-horizon-evidence.js':await module(evidence),
    './forecast-records.js':await module({...recordTools,forecastHash:value=>recordTools.forecastHash(structuredClone(value))}),
    './forecast-information-time.js':await module(clocks),'./cycle-engine.js':await module(cycle),
  };
  const source=await readFile(new URL('../dist/replay-retrospective.js',import.meta.url),'utf8');
  const engine=new vm.SourceTextModule(source,{context});await engine.link(specifier=>{assert.ok(imports[specifier],specifier);return imports[specifier];});await engine.evaluate();
  const built=await engine.namespace.createReplayRetrospectiveForecast(generateOptions);
  assert.equal(calls,1);assert.deepEqual(capturedInput,prefix);assert.equal(capturedOptions.asOf,asOf);assert.equal(capturedOptions.referenceDate,playbackStartDate);
  assert.ok(capturedInput.every(row=>row.length===2&&row[0]<=asOf));forbidBuild=true;
  const resumed=await engine.namespace.restoreReplayRetrospectiveForecast(JSON.parse(JSON.stringify(built)),restoreOptions);
  assert.equal(calls,1);assert.equal(JSON.stringify(resumed),JSON.stringify(built));
}

if(process.argv.includes('--check-single-build')){
  await singleModelInvocation();console.log('single-model-invocation-and-byte-restore: PASS');
}else{
  test('August 17 replay creates a separate current-model retrospective without changing the captured forecast identity',()=>{
    assert.equal(retrospective.kind,'atlas-replay-retrospective-forecast');assert.equal(retrospective.status,'ready');
    assert.equal(retrospective.asOf,asOf);assert.equal(retrospective.displayEnd,forecast.asOf);
    assert.equal(retrospective.createdAt,evaluatedAt);assert.equal(session.identity.createdAt,capturedAt);assert.equal(retrospective.issuedAt,null);
    assert.deepEqual(session.identity,original.identity);assert.deepEqual(session.forecast,original.forecast);assert.deepEqual(session.chartForecast,forecast);
    assert.deepEqual(session.chartDataset,dataset);assert.equal(retrospective.originalOutputHash,original.identity.outputHash);
    for(const key of ['publicationTimeProven','forecastScoringEnabled','prospectiveScoringEligible','calibrated'])assert.equal(retrospective[key],false);
    assert.ok(Object.isFrozen(retrospective)&&Object.isFrozen(retrospective.path[1])&&Object.isFrozen(retrospective.modelOptions.claims[0]));
  });

  test('retrospective bytes equal a direct long-horizon calculation on only the cutoff prefix and retain independent endpoints',async()=>{
    const direct=longModel.buildLongHorizonForecast(prefix,retrospective.modelOptions).path.filter(row=>row.date<=forecast.asOf)
      .map(row=>({date:row.date,price:row.price,lower:row.lower,upper:row.upper,baselinePrice:row.baselinePrice}));
    assert.deepEqual(retrospective.path,direct);assert.equal(retrospective.path.length,cycle.utcDay(forecast.asOf)-cycle.utcDay(asOf)+1);
    assert.equal(retrospective.path[0].date,asOf);assert.equal(retrospective.path[0].price,prefix.at(-1)[1]);
    assert.equal(retrospective.path.at(-1).date,forecast.path[0].date);assert.notEqual(retrospective.path.at(-1).price,forecast.path[0].price,'the reconstruction must not be forced to meet today’s observed anchor');
    assert.equal(retrospective.inputHash,await recordTools.forecastHash(prefix));assert.equal(retrospective.outputHash,await recordTools.forecastHash(direct));
    const {id,...body}=retrospective;assert.equal(id,await recordTools.forecastHash(body));
  });

  test('model clocks override captured future settings and research provenance includes only pre-cutoff published claims',async()=>{
    const built=await createReplayRetrospectiveForecast({...generateOptions,modelOptions:{...modelOptions,referenceDate:'2030-01-01',asOf:'2030-01-01',researchAsOf:'2030-01-01'}});
    assert.deepEqual(built,retrospective);assert.equal(built.modelOptions.referenceDate,playbackStartDate);assert.equal(built.modelOptions.researchAsOf,asOf);
    assert.equal(built.modelOptions.sampleCount,128);assert.ok(built.modelOptions.claims.every(claim=>claim.publishedAt<=asOf));
    assert.equal(built.provenance.researchClaimsHash,await recordTools.forecastHash(built.modelOptions.claims));
    assert.equal(built.provenance.prices.inputField,'dataset.prices');assert.equal(built.provenance.prices.informationThrough,asOf);
    assert.equal(built.provenance.prices.observations,prefix.length);assert.equal(built.provenance.futurePriceRowsConsumed,false);
    assert.equal(built.provenance.historicalModelExistedAtOrigin,false);assert.equal(built.provenance.historicalSourceAvailabilityProven,false);
  });

  test('changing every future dataset price cannot change retrospective input, path or output hashes',async()=>{
    const revised=structuredClone(dataset);revised.prices=revised.prices.map(([date,price])=>[date,date>asOf?price*1000000:price]);
    revised.futureCandles=[{date:'2026-08-17',high:1e100,low:1e-100}];
    const changed=await createReplayRetrospectiveForecast({...generateOptions,dataset:revised});
    assert.equal(changed.inputHash,retrospective.inputHash);assert.equal(changed.outputHash,retrospective.outputHash);assert.deepEqual(changed.path,retrospective.path);
    assert.deepEqual(changed,retrospective);
  });

  test('daily and weekly reveals keep both frozen paths fixed and never enable retrospective scoring',()=>{
    for(const frequency of ['daily','weekly'])for(const cursorDate of [asOf,'2026-08-17','2026-08-18',session.timeline.at(-1)]){
      const data=buildReplayChartData(session,{cursorDate,frequency}),frame=data.frame;
      assert.strictEqual(frame.retrospectiveForecast,retrospective.path);assert.deepEqual(frame.forecast,original.forecast);
      assert.ok(data.observedRows.every(row=>row.date<=cursorDate));assert.ok(data.observedCandles.every(row=>row.endDate<=cursorDate));
      assert.equal(frame.policy.forecastScoringEnabled,false);assert.equal(frame.policy.prospectiveScoringEligible,false);assert.deepEqual(frame.dailyComparisons,[]);
      assert.equal(frame.metrics.matchedCount,0);assert.equal(frame.selected.absoluteError,null);
      if(cursorDate<forecast.asOf)assert.equal(frame.selected.predicted,null,'the scored original series is not replaced by the retrospective');
    }
  });

  test('unrevealed actual highs and lows cannot change the newly added retrospective scale contribution',async()=>{
    const observations=archive.observations.map(row=>row.date>'2026-08-18'?{...row,price:row.price*1e8,open:row.open*1e8,high:row.high*1e8,low:row.low/1e8,close:row.close*1e8}:row);
    const changed=await createCurrentChartReplaySession({...options,observations,createRetrospective:true});
    for(const frequency of ['daily','weekly']){
      const frameOptions={cursorDate:'2026-08-18',frequency,startDate:'2026-08-16',endDate:'2026-10-31'};
      assert.deepEqual(buildReplayChartData(changed,frameOptions),buildReplayChartData(session,frameOptions));
    }
  });

  test('information-time mode reveals the reconstruction only after its actual calculation time',()=>{
    const historical=buildReplayFrame(session,{cursorIndex:1,clockMode:'information-time'});assert.deepEqual(historical.retrospectiveForecast,[]);
    const captureOnly=buildReplayFrame(session,{cursorIndex:1,clockMode:'information-time',cursorAt:capturedAt});
    assert.equal(captureOnly.forecastVisible,true);assert.deepEqual(captureOnly.retrospectiveForecast,[]);
    const current=buildReplayFrame(session,{cursorIndex:1,clockMode:'information-time',cursorAt:evaluatedAt});assert.deepEqual(current.retrospectiveForecast,retrospective.path);assert.equal(current.policy.forecastScoringEnabled,false);
  });

  test('saved retrospective restores identical JSON bytes even when later requested options differ',async()=>{
    const saved=JSON.parse(JSON.stringify(retrospective));
    const resumed=await createCurrentChartReplaySession({...options,retrospectiveForecast:saved,createRetrospective:true,modelOptions:{seed:-1}});
    assert.equal(JSON.stringify(resumed.retrospectiveForecast),JSON.stringify(retrospective));assert.deepEqual(resumed.identity,session.identity);
    saved.path[1].price*=2;assert.deepEqual(resumed.retrospectiveForecast,retrospective);assert.throws(()=>{resumed.retrospectiveForecast.path[1].price=1;},TypeError);
  });

  test('older sessions and selection previews do not acquire a retrospective automatically',()=>{
    assert.equal(original.retrospectiveForecast,undefined);assert.deepEqual(buildReplayFrame(original).retrospectiveForecast,[]);
  });

  test('unsupported historical research and missing prefix prices produce explicit unavailable records without invented data',async()=>{
    for(const [cutoff,expected]of [['2025-08-16','research-unavailable-at-origin'],['2010-07-17','no-price-history'],['2010-07-18','insufficient-price-history']]){
      const built=await createReplayRetrospectiveForecast({...generateOptions,asOf:cutoff});
      assert.equal(built.status,'unavailable');assert.equal(built.unavailableReason,expected);assert.ok(/[가-힣]/.test(built.reason));assert.deepEqual(built.path,[]);
      assert.equal(built.issuedAt,null);assert.equal(built.forecastScoringEnabled,false);
      const restored=await restoreReplayRetrospectiveForecast(built,{...restoreOptions,asOf:cutoff});assert.deepEqual(restored,built);
    }
    const missing=structuredClone(dataset);missing.prices=missing.prices.filter(([date])=>date!==asOf);
    const unavailable=await createReplayRetrospectiveForecast({...generateOptions,dataset:missing});assert.equal(unavailable.unavailableReason,'cutoff-not-observed');assert.deepEqual(unavailable.path,[]);
  });

  test('saved path, price prefix, publication claims and scoring metadata are verified before restore',async()=>{
    const corrupt=structuredClone(retrospective);corrupt.path[1].baselinePrice+=1;
    await assert.rejects(restoreReplayRetrospectiveForecast(corrupt,restoreOptions),/hash mismatch/);
    const prices=structuredClone(dataset);prices.prices[100][1]*=1.1;
    await assert.rejects(restoreReplayRetrospectiveForecast(retrospective,{...restoreOptions,dataset:prices}),/hash mismatch/);
    for(const mutate of [r=>r.forecastScoringEnabled=true,r=>r.issuedAt=evaluatedAt,r=>r.originalOutputHash='f'.repeat(64),r=>r.provenance.futurePriceRowsConsumed=true,
      r=>r.modelOptions.referenceDate='2026-11-01',r=>r.modelOptions.claims[0].publishedAt='2026-08-17',r=>r.path.push({...r.path.at(-1),date:cycle.dateFromDay(cycle.utcDay(r.displayEnd)+1)})]){
      const value=structuredClone(retrospective);mutate(value);await assert.rejects(restoreReplayRetrospectiveForecast(value,restoreOptions));
    }
    await assert.rejects(createReplayRetrospectiveForecast({...generateOptions,modelOptions:{timingCalibration:{appliedShiftDays:999}}}),/unsupported inputs/);
    await assert.rejects(createReplayRetrospectiveForecast({...generateOptions,modelOptions:{claims:evidence.LONG_HORIZON_CLAIMS}}),/unsupported inputs/);
  });

  test('the current model executes once at creation and never during saved-record restoration',async()=>{
    if(typeof vm.SourceTextModule==='function'){await singleModelInvocation();return;}
    const stdout=execFileSync(process.execPath,['--experimental-vm-modules',fileURLToPath(import.meta.url),'--check-single-build'],{encoding:'utf8'});
    assert.match(stdout,/single-model-invocation-and-byte-restore: PASS/);
  });
}
