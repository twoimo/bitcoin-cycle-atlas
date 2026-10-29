import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,mkdtemp,mkdir,writeFile,cp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {fileURLToPath} from 'node:url';
import {resolve,dirname} from 'node:path';
import {canonicalForecastJson,forecastHash} from '../dist/forecast-records.js';
import {ethereumProspectiveIndexEntry} from '../dist/ethereum-prospective-dispatch.js';
import {ETH_PROSPECTIVE_PRICE_POLICY} from '../dist/ethereum-prospective-prices.js';
import {readEthereumCalibrationInputs} from '../scripts/build-ethereum-prospective-calibration-readiness.mjs';
import {projectEthereumProspectiveCapacity,inspectEthereumProspectiveWorkflow} from '../scripts/ethereum-prospective-capacity-core.mjs';
import {buildEthereumProspectiveCapacityReport} from '../scripts/analyze-ethereum-prospective-capacity.mjs';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..'),cutoff='2026-10-27T16:05:58.086Z';
const ledger=resolve(root,'research-data/ethereum-prospective-ledger');
const index=JSON.parse(await readFile(resolve(ledger,'index.json'),'utf8'));
const records=await Promise.all(index.entries.map(entry=>readFile(resolve(ledger,entry.recordPath),'utf8').then(JSON.parse)));
const observations=await Promise.all([...new Set(index.entries.map(entry=>entry.snapshotPath))].map(path=>readFile(resolve(ledger,path),'utf8').then(JSON.parse)));
// Use each original preserved base, independent of a later reviewed working
// base refresh. These calendar fixtures never produce new forecasts.
const baseText=observations[0].base.text;
const project=overrides=>projectEthereumProspectiveCapacity({records,observations,baseText,informationCutoffAt:cutoff,...overrides});
const clone=structuredClone;

async function legacySeedWorkspace(t){
  const repositoryRoot=await mkdtemp(resolve(tmpdir(),'eth-legacy-capacity-seed-'));
  t.after(()=>rm(repositoryRoot,{recursive:true,force:true}));
  // Copy exact retained inputs and source bytes, never the mutable root build
  // directory. A legitimate archive-active root must not change this legacy
  // reader fixture or tempt a test to remove its fail-closed mode guard.
  for(const path of ['research-data/ethereum-prospective-ledger','research-data/asset-outcome-ledger',
    'scripts','.github/workflows']){
    const target=resolve(repositoryRoot,path);await mkdir(dirname(target),{recursive:true});
    await cp(resolve(root,path),target,{recursive:true});
  }
  for(const path of [ETH_PROSPECTIVE_PRICE_POLICY.basePath,'dist/ethereum-prospective-prices.js',
    'dist/ethereum-prospective-records.js','dist/ethereum-prospective-dispatch.js','dist/asset-outcome-records.js']){
    const target=resolve(repositoryRoot,path);await mkdir(dirname(target),{recursive:true});await cp(resolve(root,path),target);
  }
  return repositoryRoot;
}

test('first twelve actual-plus-future calendars retain the strict 30, 90 and 180 day requirements',()=>{
  const report=project();assert.equal(report.calendars.length,9);
  const expected={30:['2027-10-22T00:00:00.000Z',1083],90:['2029-10-11T00:00:00.000Z',3243],180:['2032-09-25T00:00:00.000Z',6483]};
  for(const calendar of report.calendars){
    assert.equal(calendar.windows.length,12);assert.equal(calendar.actualDisjointWindowsInFirstTwelve,1);
    assert.equal(calendar.actualMaturedWindowsInFirstTwelve,0);assert.equal(calendar.hypotheticalFutureWindows,11);
    assert.equal(calendar.earliestCalendarObservationEndAt,expected[calendar.binding.horizonDays][0]);
    assert.equal(calendar.projectedRecords,expected[calendar.binding.horizonDays][1]);
    assert.equal(calendar.windows[0].kind,'actually-issued');
    for(const window of calendar.windows.slice(1)){assert.equal(window.kind,'hypothetical-future-calendar-only');assert.equal('recordId'in window,false);}
    assert.equal(calendar.forecastOrOutcomeAvailabilityPromised,false);
  }
  assert.equal(report.actualNewRecords,0);assert.equal(report.actualCalibrationFreezes,0);
  assert.equal(report.calibrationReadinessClaimed,false);assert.equal(report.releaseAuthorized,false);
});

test('a later audit never backfills missed past origin dates or counts hypothetical windows as matured evidence',()=>{
  const at='2028-05-04T12:00:00.000Z',report=project({informationCutoffAt:at});
  for(const calendar of report.calendars){
    assert.equal(calendar.windows[1].originDate,'2028-05-03');
    assert.equal(calendar.actualMaturedWindowsInFirstTwelve,1);
    assert.equal(calendar.hypotheticalFutureWindows,11);
  }
  assert.ok(report.unchangedCurrentBase.currentRequestError);assert.equal(report.policy.missingPastOriginsBackfilled,false);
});

test('capture days follow the same new-origin schedule after a missed day or a much later audit',()=>{
  const cases=[
    {at:cutoff,origin:'2026-10-27',capture:'2026-10-28',days:360,exceed:['2028-03-09','2027-07-04']},
    {at:'2026-10-28T12:00:00.000Z',origin:'2026-10-27',capture:'2026-10-28',days:360,exceed:['2028-03-09','2027-07-04']},
    {at:'2028-05-04T12:00:00.000Z',origin:'2028-05-03',capture:'2028-05-04',days:331,exceed:['2029-09-14','2029-01-08']},
  ];
  for(const expected of cases){
    const report=project({informationCutoffAt:expected.at}),scenarios=report.dailyContinuation.observationScenarios;
    assert.equal(report.dailyContinuation.firstPossibleAdditionalOriginDate,expected.origin);
    assert.deepEqual(scenarios.map(value=>value.firstAdditionalCaptureDate),[expected.capture,expected.capture]);
    assert.deepEqual(scenarios.map(value=>value.firstExceedingCaptureDate),expected.exceed);
    assert.equal(report.calendars.find(value=>value.binding.horizonDays===30).additionalDailyOriginDays,expected.days);
    for(const calendar of report.calendars)for(const estimate of calendar.observationsAtCalendarEnd){
      assert.equal(estimate.projectedObservations,observations.length+calendar.additionalDailyOriginDays*estimate.newProspectiveSnapshotsPerDay,
        'Every new daily origin needs its completed-day capture, including the final target observation day');
    }
    for(const scenario of scenarios){
      const lastAccepted=new Date(Date.parse(scenario.firstExceedingCaptureDate+'T00:00:00Z')-86400000).toISOString().slice(0,10);
      const countThrough=date=>observations.length+(1+(Date.parse(date+'T00:00:00Z')-Date.parse(scenario.firstAdditionalCaptureDate+'T00:00:00Z'))/86400000)*scenario.newProspectiveSnapshotsPerDay;
      assert(countThrough(lastAccepted)<=500);assert(countThrough(scenario.firstExceedingCaptureDate)>500);
    }
    assert.equal(report.actualNewRecords,0);assert.equal(report.actualNewObservations,0);assert.equal(report.calibrationReadinessClaimed,false);
  }
});

test('same-origin revisions do not create windows and changed model source identities remain separate',()=>{
  const original=records[0],revision={...clone(original),id:'a'.repeat(64),runKey:'b'.repeat(64),issuedAt:'2026-10-27T15:00:00.000Z'};
  const different={...clone(original),id:'c'.repeat(64),runKey:'d'.repeat(64),model:{...original.model,sourceHash:'e'.repeat(64)}};
  const report=project({records:[...records,revision,different]});assert.equal(report.inventory.exactExperiments,4);
  const matching=report.calendars.find(value=>value.binding.modelKey===original.modelKey&&value.binding.modelSourceHash===original.model.sourceHash);
  assert.equal(matching.sameOriginRevisions,1);assert.equal(matching.actualDisjointWindowsInFirstTwelve,1);
  assert.equal(matching.windows[0].recordId,original.id);
  assert.equal(report.calendars.filter(value=>value.binding.modelSourceHash==='e'.repeat(64)).length,3);
});

test('compact index projection exactly reproduces the first byte-bound crossing without generating forecasts',()=>{
  const report=project(),continuation=report.dailyContinuation,max=report.policy.maximumCandidateIndexBytes;
  const empty=Buffer.byteLength(canonicalForecastJson({schemaVersion:1,kind:'ethereum-prospective-index',entries:[]})+'\n');
  const entryBytes=records.map(record=>Buffer.byteLength(canonicalForecastJson(ethereumProspectiveIndexEntry(record))));
  assert.equal(continuation.currentMergedCompactIndexBytes,empty+entryBytes.reduce((sum,n)=>sum+n,0)+records.length-1);
  const accepted=continuation.currentMergedCompactIndexBytes+continuation.completeAdditionalOriginDaysWithinIndexLimit*continuation.additionalIndexBytesPerCompleteOriginDay;
  assert.ok(accepted<=max);assert.ok(accepted+continuation.additionalIndexBytesPerCompleteOriginDay>max);
  assert.equal(1+continuation.completeAdditionalOriginDaysWithinIndexLimit,550);
  assert.ok(report.calendars.filter(value=>value.binding.horizonDays===90).every(value=>value.conditionalOperationalBlockers.includes('candidate-index-1MiB-limit')));
});

test('unchanged base expiry exercises the exact frozen planner boundary while committed replacement stays a separate operation',()=>{
  const base=project().unchangedCurrentBase;
  assert.equal(base.lastAllowedRequestUtcDate,'2027-08-05');assert.equal(base.firstRejectedRequestUtcDate,'2027-08-06');
  assert.equal(base.boundaryPlannerChecksPassed,true);assert.equal(base.explicitCommittedBaseReplacementSupported,true);
  assert.equal(base.automaticBaseRolloverImplemented,false);assert.equal(base.currentRequestError,null);
  assert.ok(project().calendars.every(value=>value.conditionalOperationalBlockers.includes('current-base-290-day-tail-limit')));
});

test('each retained same-day acquisition consumes capacity while frequency and independent updates are not presumed',()=>{
  const report=project();assert.equal(report.inventory.observations,2);assert.equal(report.inventory.maximumObservedProspectivePerDay,2);
  assert.deepEqual(report.dailyContinuation.observationScenarios.map(value=>value.newProspectiveSnapshotsPerDay),[1,2]);
  for(const scenario of report.dailyContinuation.observationScenarios){
    assert.equal(scenario.additionalIndependentSnapshotsAssumed,0);assert.equal(scenario.historicalScheduleOrFutureFrequencyProven,false);
    assert.ok(2+scenario.completeAdditionalCaptureDaysWithinLimit*scenario.newProspectiveSnapshotsPerDay<=500);
    assert.ok(2+(scenario.completeAdditionalCaptureDaysWithinLimit+1)*scenario.newProspectiveSnapshotsPerDay>500);
  }
  const thirty=report.calendars.find(value=>value.binding.horizonDays===30).observationsAtCalendarEnd;
  assert.deepEqual(thirty.map(value=>value.withinObservationLimit),[true,false]);
  assert.ok(report.calendars.filter(value=>value.binding.horizonDays===90).every(value=>value.observationsAtCalendarEnd.every(item=>!item.withinObservationLimit)));
});

test('duplicate acquisitions, unsupported metadata, future clocks and oversized inventories fail instead of improving the projection',()=>{
  assert.throws(()=>project({observations:[observations[0],observations[0]]}),/Unique bounded/);
  assert.throws(()=>project({observations:[{...observations[0],informationCutoffAt:'2027-01-01T00:00:00.000Z'}]}),/future acquisitions/);
  assert.throws(()=>project({records:[{...records[0],issuedAt:'2027-01-01T00:00:00.000Z'}]}),/future or invalid/);
  assert.throws(()=>project({records:[{...records[0],options:{...records[0].options,seed:1}}]}),/Exact original/);
  assert.throws(()=>project({observations:Array.from({length:501},(_,i)=>({...observations[0],id:i.toString(16).padStart(64,'0')}))}),/Unique bounded/);
  assert.throws(()=>project({records:Array.from({length:2001},(_,i)=>({...records[0],id:i.toString(16).padStart(64,'0')}))}),/Unique bounded/);
});

test('block-style trigger inspection separates market refresh from actual candidate issuance and treats unfamiliar YAML as unknown',()=>{
  const path='.github/workflows/example.yml';
  const pr=inspectEthereumProspectiveWorkflow({path,text:'on:\n  pull_request:\n\njobs:\n  run:\n    steps:\n      - run: |\n          node scripts/issue-ethereum-prospective.mjs --include-warm-start\n      - uses: actions/upload-artifact@abc\n        with:\n          retention-days: 30\n'});
  assert.deepEqual(pr.events,['pull_request']);assert.equal(pr.directIssuance,true);assert.equal(pr.scheduledDirectIssuance,false);
  assert.deepEqual(pr.declaredArtifactRetentionDays,[30]);assert.equal(pr.automaticPriorRunRestoreProven,false);
  const refresh=inspectEthereumProspectiveWorkflow({path,text:'on:\n  schedule:\n    - cron: "0 0 * * *"\njobs:\n  run:\n    steps:\n      - run: node scripts/refresh-data.mjs\n'});
  assert.equal(refresh.scheduledDirectIssuance,false);assert.equal(refresh.directIssuance,false);
  const unknown=inspectEthereumProspectiveWorkflow({path,text:'on: [schedule, pull_request]\njobs:\n  run:\n    steps:\n      - run: node scripts/issue-ethereum-prospective.mjs\n'});
  assert.equal(unknown.events,null);assert.equal(unknown.scheduledDirectIssuance,null);assert.equal(unknown.directIssuance,true);
});

test('the isolated retained-seed report binds raw inventory while an archive-active workspace still refuses the legacy reader',async t=>{
  const repositoryRoot=await legacySeedWorkspace(t),current=await readEthereumCalibrationInputs({repositoryRoot});
  const report=await buildEthereumProspectiveCapacityReport({repositoryRoot,informationCutoffAt:new Date().toISOString()});
  const {id,...body}=report;assert.equal(id,await forecastHash(body));
  assert.deepEqual(current.records.map(value=>value.id).sort(),records.map(value=>value.id).sort());
  assert.ok(Object.keys(current.inputFiles).every(path=>path.startsWith('research-data/')));
  assert.equal(report.diagnostic.inventory.records,current.records.length);
  assert.deepEqual(report.diagnostic.inventory.recordIds,current.records.map(value=>value.id).sort());
  assert.deepEqual(report.inputFiles,current.inputFiles);assert.ok(report.sourceFiles['scripts/ethereum-prospective-base.mjs']);
  assert.equal(report.actualNewRecords,0);assert.equal(report.actualNewObservations,0);assert.equal(report.releaseAuthorized,false);
  assert.equal(report.diagnostic.calibrationReadinessClaimed,false);assert.equal(report.diagnostic.actualRawInputReadinessProven,false);
  assert.equal(report.networkRequests,0);assert.equal(report.diagnostic.workflowInspection.automaticPriorRunRestoreProven,false);
  await mkdir(resolve(repositoryRoot,'build'),{recursive:true});
  await writeFile(resolve(repositoryRoot,'build/ethereum-prospective-archive-active.json'),canonicalForecastJson({
    schemaVersion:1,kind:'ethereum-prospective-archive-active',mode:'archive-backed',
    archivePath:'build/ethereum-prospective-archive-previous',manifestId:'a'.repeat(64)})+'\n');
  await assert.rejects(()=>readEthereumCalibrationInputs({repositoryRoot}),/Archive-backed workspace.*legacy flat reader cannot represent retained history/);
  await assert.rejects(()=>buildEthereumProspectiveCapacityReport({repositoryRoot,informationCutoffAt:new Date().toISOString()}),
    /Archive-backed workspace.*legacy flat reader cannot represent retained history/);
});
