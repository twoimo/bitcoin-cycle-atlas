import test,{before} from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {canonicalForecastJson,forecastHash} from '../dist/forecast-records.js';
import {utcDay,dateFromDay} from '../dist/cycle-engine.js';
import {planEthereumResearchPriceRequest,createEthereumResearchSnapshot} from '../dist/ethereum-prospective-prices.js';
import {createEthereumProspectiveRecord} from '../dist/ethereum-prospective-records.js';
import {createAssetOutcomeSnapshot} from '../dist/asset-outcome-records.js';
import {ETH_PROSPECTIVE_CALIBRATION_POLICY as policy,buildEthereumProspectiveCalibrationReadiness,
  createEthereumProspectiveCalibrationFreeze,verifyEthereumProspectiveCalibrationFreeze} from '../scripts/ethereum-prospective-calibration-core.mjs';

// Synthetic sources and source identities exercise contracts only. These are
// neither market performance observations nor authenticated model execution.
const DAY=86400000,iso=(date,days=0,hours=0)=>new Date((utcDay(date)+days)*DAY+hours*3600000).toISOString();
const json=canonicalForecastJson,clone=structuredClone;
const files=Object.fromEntries(['dist/ethereum-pooled-model.js','dist/ethereum-prospective-records.js',
  'dist/ethereum-prospective-prices.js'].map(path=>[path,'b'.repeat(64)]));
const hash=value=>createHash('sha256').update(json(value)).digest('hex');
const model={version:'eth-pooled-volatility-research-1',sourceCommit:'c'.repeat(40),files,sourceHash:hash(files)};
const freezeFiles={'scripts/ethereum-prospective-calibration-core.mjs':'d'.repeat(64)};
const freezeSource={sourceCommit:'e'.repeat(40),files:freezeFiles,sourceHash:hash(freezeFiles)};

async function makeRecord(origin,{modelSource=model,issueDelayMs=0,point=100}={}){
  const first=(utcDay(origin)-800)*DAY,end=utcDay(origin)*DAY;
  const candles=Array.from({length:800},(_,index)=>{const time=(first+index*DAY)/1000;
    return {time,date:new Date(time*1000).toISOString(),open:100,high:110,low:90,close:100,volume:10};});
  const baseText=JSON.stringify({version:1,source:'Coinbase Exchange',product:'ETH-USD',
    dailyHistory:{source:'Coinbase Exchange',product:'ETH-USD',interval:'daily',seconds:86400,completedOnly:true,
      requestedStart:first/1000,requestedEnd:end/1000,retrievedAt:new Date(end+3600000).toISOString(),sourceUrls:[],candles}});
  const requestStartedAt=iso(origin,1,2),bodyCompletedAt=new Date(Date.parse(requestStartedAt)+1000).toISOString();
  const request=planEthereumResearchPriceRequest(baseText,requestStartedAt);
  const raw=Array.from({length:8},(_,index)=>[request.requestedStart+index*86400,90,110,100,100,10]).reverse();
  const base={text:baseText,sourceCommit:'a'.repeat(40),
    gitBlobSha:createHash('sha1').update('blob '+Buffer.byteLength(baseText)+'\0').update(baseText).digest('hex'),
    collectedAt:new Date(Date.parse(requestStartedAt)-1000).toISOString()};
  const tail={text:JSON.stringify(raw),requestStartedAt,bodyCompletedAt,sourceUrl:request.sourceUrl};
  const snapshot=await createEthereumResearchSnapshot({base,tail});
  const forecast={symbol:'ETHUSD',asOf:origin,researchModel:'pooled',probability:null,calibrated:false,
    displayEnd:dateFromDay(utcDay(origin)+730),
    path:Array.from({length:731},(_,index)=>({date:dateFromDay(utcDay(origin)+index),
      baselinePrice:index?point:100,low:index?point*.8:100,high:index?point*1.2:100,price:index?point:100})),
    training:{informationThrough:origin,maxSourceDate:origin},
    metadata:{version:modelSource.version,horizonDays:730,sampleCount:256,seed:20261027,nominalPointwiseMass:.8,
      calibrated:false,probability:null,productionPromoted:false,parameterUncertaintyIncluded:false},
    assumptions:{syntheticSchemaFixture:true},warnings:['Synthetic contract test, not market evidence']};
  const generationStartedAt=new Date(Date.parse(bodyCompletedAt)+1000+issueDelayMs).toISOString(),
    generatedAt=new Date(Date.parse(bodyCompletedAt)+2000+issueDelayMs).toISOString(),
    issuedAt=new Date(Date.parse(bodyCompletedAt)+3000+issueDelayMs).toISOString();
  const args={snapshot,forecast,model:modelSource,modelKey:'pooled',generationStartedAt,generatedAt,issuedAt};
  return {record:await createEthereumProspectiveRecord(args),snapshot,args};
}
async function makeOutcome(records,{missing=[],collectedAt,publishedAt=null,priceOverrides={}}={}){
  const dates=records.map(record=>record.targets[0].targetDate).sort(),first=dates[0],last=dates.at(-1);
  const selected=new Map(dates.map((date,index)=>[date,100*Math.exp((index+1)/100)]));
  const candles=Array.from({length:utcDay(last)-utcDay(first)+1},(_,index)=>{
    const date=dateFromDay(utcDay(first)+index),close=priceOverrides[date]??selected.get(date)??100;
    return {time:utcDay(date)*86400,date:iso(date),open:close,high:close*1.1,low:close*.9,close,volume:10};
  }).filter(row=>!missing.includes(row.date.slice(0,10)));
  const sourceDocument=JSON.stringify({version:1,source:'Coinbase Exchange',product:'ETH-USD',completedOnly:true,
    dailyHistory:{source:'Coinbase Exchange',product:'ETH-USD',completedOnly:true,candles}});
  return createAssetOutcomeSnapshot({symbol:'ETHUSD',sourceDocument,sourceUrl:'https://example.com/synthetic-eth-outcomes',
    publishedAt,collectedAt:collectedAt??iso(last,1,3)});
}
let records,snapshots,outcome,informationCutoffAt,inputs;
const binding={modelKey:'pooled',modelVersion:model.version,modelSourceHash:model.sourceHash,
  options:{horizonDays:730,sampleCount:256,seed:20261027},horizonDays:30};
before(async()=>{
  const originals=[];
  for(let index=0;index<14;index++)originals.push(await makeRecord(dateFromDay(utcDay('2026-01-01')+index*31)));
  records=originals.map(value=>value.record);snapshots=Object.fromEntries(originals.map(value=>[value.snapshot.id,value.snapshot]));
  outcome=await makeOutcome(records);informationCutoffAt=outcome.sourceReceipt.collectedAt;
  inputs={records,snapshots,observations:[outcome],informationCutoffAt,binding};
});
const run=overrides=>buildEthereumProspectiveCalibrationReadiness({...inputs,...overrides});
async function rehash(value){const {id,...body}=value;return {id:await forecastHash(body),...body};}

test('strict gate derives exactly twelve same-bound prospective residuals and preserves null publication',async()=>{
  const before=json(inputs),result=await run();
  assert.equal(result.status,'ready-to-freeze');assert.equal(result.selectedCalibrationCases,12);
  assert.deepEqual(result.slots.map(slot=>slot.recordId),records.slice(0,12).map(record=>record.id));
  assert.equal(result.orderStatistic.rank,11);assert.ok(Math.abs(result.logRadius-.11)<1e-12);
  assert.ok(result.slots.every(slot=>slot.observationId===outcome.id&&slot.actualSource.publishedAt===null));
  assert.equal(result.retrospectiveResidualsUsed,false);assert.equal(result.coverageGuarantee,false);
  assert.equal(result.actualCalibratedRecordsIssued,0);assert.equal(result.actualModelExecutionAuthenticated,false);
  assert.equal(json(inputs),before);
  assert.deepEqual(await run({records:[...records].reverse()}),result);
});

test('zero mature outcomes remain insufficient, never a retrospective fallback or forecast issue',async()=>{
  const result=await run({records:[records[0]],observations:[],informationCutoffAt:records[0].issuedAt});
  assert.equal(result.status,'insufficient-calibration-cases');assert.equal(result.selectedCalibrationCases,0);
  assert.equal(result.pendingRecords.length,1);assert.equal(result.logRadius,null);
  await assert.rejects(()=>createEthereumProspectiveCalibrationFreeze({...inputs,records:[records[0]],observations:[],
    readiness:result,frozenAt:records[0].issuedAt,freezeSource}),/Twelve complete/);
});

test('missing selected outcomes retain their original slots and cannot borrow later valid cases',async()=>{
  const missingDate=records[3].targets[0].targetDate,partial=await makeOutcome(records,{missing:[missingDate]});
  const result=await run({observations:[partial]});
  assert.equal(result.status,'incomplete-calibration-block');assert.equal(result.selectedCalibrationCases,12);
  assert.equal(result.validSelectedOutcomes,11);assert.equal(result.slots[3].recordId,records[3].id);
  assert.equal(result.slots[3].status,'missing-observation');assert.equal(result.logRadius,null);
  assert.ok(!result.slots.some(slot=>slot.recordId===records[12].id));
});

test('a corrupted forecast rejects the entire inventory even if its body hash is recomputed',async()=>{
  const bad=clone(records[2]);bad.targets[0].median=200;
  const changed=await rehash(bad);
  await assert.rejects(()=>run({records:records.map((record,index)=>index===2?changed:record)}),/Invalid preserved prospective record/);
});

test('unverified routing fields cannot hide a record as a different experiment, future issue or overlapping origin',async()=>{
  for(const mutate of [
    value=>{value.model.sourceHash='0'.repeat(64);},
    value=>{value.modelKey='warmStart';},
    value=>{value.options.seed=17;},
    value=>{value.issuedAt='2099-01-01T00:00:00.000Z';},
    value=>{value.asOf=records[1].asOf;},
  ]){
    const bad=clone(records[0]);mutate(bad);
    await assert.rejects(()=>run({records:[bad,...records.slice(1)]}),/Invalid preserved prospective record/);
  }
});

test('same-origin revisions cannot inflate sample size or replace the earliest issue',async()=>{
  const later=await makeRecord(records[0].asOf,{issueDelayMs:10000,point:1000});
  const result=await run({records:[later.record,...records],snapshots:{...snapshots,[later.snapshot.id]:later.snapshot}});
  assert.equal(result.uniqueMaturedOrigins,14);assert.equal(result.selectedCalibrationCases,12);
  assert.equal(result.slots[0].recordId,records[0].id);assert.equal(result.sameOriginRevisions.length,1);
  assert.equal(result.logRadius,(await run()).logRadius);
});

test('equally timed conflicting same-origin issues block the selected slot without tie-breaking by loss',async()=>{
  const tied=await makeRecord(records[0].asOf,{point:1000});
  const result=await run({records:[tied.record,...records],snapshots:{...snapshots,[tied.snapshot.id]:tied.snapshot}});
  assert.equal(result.status,'incomplete-calibration-block');assert.equal(result.slots[0].tiedRecordIds.length,2);
  assert.equal(result.invalidSelectedForecasts,1);assert.equal(result.logRadius,null);
});

test('changed source graphs and simulation options cannot inherit another experiment residuals',async()=>{
  const changedFiles={...files,'dist/synthetic-other-source.js':'f'.repeat(64)};
  const changedModel={...model,files:changedFiles,sourceHash:await forecastHash(changedFiles)};
  const other=await makeRecord(records[0].asOf,{modelSource:changedModel});
  const result=await run({records:[other.record,...records],snapshots:{...snapshots,[other.snapshot.id]:other.snapshot}});
  assert.equal(result.excludedRecords[0].reason,'different-experiment-binding');
  assert.equal(result.selectedCalibrationCases,12);assert.equal(result.logRadius,(await run()).logRadius);
  await assert.rejects(()=>run({binding:{...binding,options:{...binding.options,seed:17}}}),/exact original/);
});

test('overlapping origins and nonselected test losses cannot change the fixed calibration block',async()=>{
  const overlap=await makeRecord(dateFromDay(utcDay(records[0].asOf)+1),{point:1000});
  const result=await run({records:[overlap.record,...records],snapshots:{...snapshots,[overlap.snapshot.id]:overlap.snapshot}});
  assert.deepEqual(result.slots,(await run()).slots);assert.deepEqual(result.overlappingRecordIds,[overlap.record.id]);
  const changed=await makeOutcome(records,{priceOverrides:{[records[13].targets[0].targetDate]:1e200}});
  const poisoned=await run({observations:[changed]});
  assert.equal(poisoned.logRadius,result.logRadius);
  assert.deepEqual(poisoned.slots.map(slot=>slot.absoluteLogError),result.slots.map(slot=>slot.absoluteLogError));
});

test('future outcome acquisitions cannot enter a cutoff, including altered future payloads',async()=>{
  const collectedAt=new Date(Date.parse(informationCutoffAt)+1000).toISOString();
  const future=await makeOutcome(records,{collectedAt});
  const baseline=await run({observations:[outcome,future]});
  const changed=await makeOutcome(records,{collectedAt,priceOverrides:{[records[0].targets[0].targetDate]:1e200}});
  const withChanged=await run({observations:[outcome,changed]});
  assert.deepEqual(withChanged.slots,baseline.slots);assert.equal(withChanged.logRadius,baseline.logRadius);
  assert.deepEqual(baseline.futureObservationIds,[future.id]);
  assert.equal((await run({observations:[future]})).status,'incomplete-calibration-block');
});

test('an unverified acquisition clock cannot hide a current invalid outcome as a future vintage',async()=>{
  const changed=clone(outcome);changed.sourceReceipt.collectedAt='2099-01-01T00:00:00.000Z';
  const result=await run({observations:[changed]});
  assert.equal(result.status,'incomplete-calibration-block');assert.equal(result.invalidObservations.length,1);
  assert.equal(result.futureObservationIds.length,0);assert.equal(result.logRadius,null);
});

test('a cutoff-visible corrupt outcome cannot be silently discarded in favor of a valid revision',async()=>{
  const broken=clone(outcome);broken.sourceDocument=broken.sourceDocument.replace('Coinbase Exchange','Counterfeit');
  const altered=await rehash(broken),result=await run({observations:[outcome,altered]});
  assert.equal(result.status,'incomplete-calibration-block');assert.equal(result.invalidObservations.length,1);
  assert.equal(result.logRadius,null);
});

test('latest visible outcome revisions bind their immutable source and previous cutoffs are stable',async()=>{
  const laterAt=new Date(Date.parse(informationCutoffAt)+1000).toISOString();
  const later=await makeOutcome(records,{collectedAt:laterAt,priceOverrides:{[records[0].targets[0].targetDate]:1000}});
  const before=await run({observations:[outcome,later]}),after=await run({observations:[outcome,later],informationCutoffAt:laterAt});
  assert.equal(before.slots[0].observationId,outcome.id);assert.equal(after.slots[0].observationId,later.id);
  assert.equal(after.slots[0].actual,1000);assert.notEqual(after.logRadius,before.logRadius);
});

test('all zero prospective errors yield an exact zero frozen radius',async()=>{
  const actuals=await makeOutcome(records,{priceOverrides:Object.fromEntries(records.map(record=>[record.targets[0].targetDate,100]))});
  const result=await run({observations:[actuals]});assert.equal(result.status,'ready-to-freeze');assert.equal(result.logRadius,0);
});

test('retrospective reports, duplicate IDs, and mismatched publication clocks are rejected',async()=>{
  await assert.rejects(()=>run({records:[{id:'a'.repeat(64),kind:'ethereum-independent-calibration-audit'}]}),/original immutable issued/);
  await assert.rejects(()=>run({records:[...records,records[0]]}),/Unique bounded/);
  const broken=clone(outcome);broken.sourceReceipt.publishedAt=iso(records[0].asOf);
  const result=await run({observations:[await rehash(broken)]});
  assert.equal(result.invalidObservations.length,1);assert.equal(result.logRadius,null);
});

test('freeze reconstructs all input evidence and rejects changed fields even with a recomputed readiness hash',async()=>{
  const readiness=await run(),frozenAt=new Date(Date.parse(informationCutoffAt)+1000).toISOString();
  const frozen=await createEthereumProspectiveCalibrationFreeze({...inputs,readiness,frozenAt,freezeSource});
  assert.equal(frozen.calibrationRecordIds.length,12);assert.equal(frozen.actualCalibratedRecordsIssued,0);
  assert.deepEqual(await verifyEthereumProspectiveCalibrationFreeze(frozen,inputs),frozen);
  const changed=clone(readiness);changed.logRadius=0;
  await assert.rejects(async()=>createEthereumProspectiveCalibrationFreeze({...inputs,readiness:await rehash(changed),frozenAt,freezeSource}),/do not reproduce/);
  const tampered=clone(frozen);tampered.exactResiduals[0]=0;
  await assert.rejects(async()=>verifyEthereumProspectiveCalibrationFreeze(await rehash(tampered),inputs),/does not reproduce/);
});

test('a rehashed readiness cannot choose a smaller inventory to omit the first origin',async()=>{
  const omitted=await run({records:records.slice(1)}),frozenAt=new Date(Date.parse(informationCutoffAt)+1000).toISOString();
  assert.equal(omitted.status,'ready-to-freeze');
  await assert.rejects(()=>createEthereumProspectiveCalibrationFreeze({...inputs,readiness:omitted,frozenAt,freezeSource}),/do not reproduce/);
});

test('freeze verification validates extra inputs before their binding or clocks can hide an omitted first origin',async()=>{
  const subset={...inputs,records:records.slice(1)},readiness=await buildEthereumProspectiveCalibrationReadiness(subset);
  const frozen=await createEthereumProspectiveCalibrationFreeze({...subset,readiness,frozenAt:informationCutoffAt,freezeSource});
  await assert.rejects(()=>verifyEthereumProspectiveCalibrationFreeze(frozen,inputs),/cutoff-visible same-bound record/);
  for(const mutate of [value=>{value.model.sourceHash='0'.repeat(64);},value=>{value.issuedAt='2099-01-01T00:00:00.000Z';}]){
    const hidden=clone(records[0]);mutate(hidden);
    await assert.rejects(()=>verifyEthereumProspectiveCalibrationFreeze(frozen,{...inputs,records:[hidden,...records.slice(1)]}),/Invalid preserved prospective record/);
  }
  const fakeFuture=clone(outcome);fakeFuture.id='f'.repeat(64);fakeFuture.sourceReceipt.collectedAt='2099-01-01T00:00:00.000Z';
  await assert.rejects(()=>verifyEthereumProspectiveCalibrationFreeze(frozen,{...subset,observations:[outcome,fakeFuture]}),/hash mismatch/);
});

test('freeze validates exact source identity and cannot be backdated before all selected acquisitions',async()=>{
  const readiness=await run();
  await assert.rejects(()=>createEthereumProspectiveCalibrationFreeze({...inputs,readiness,
    frozenAt:new Date(Date.parse(informationCutoffAt)-1).toISOString(),freezeSource}),/cannot precede/);
  await assert.rejects(()=>createEthereumProspectiveCalibrationFreeze({...inputs,readiness,
    frozenAt:informationCutoffAt,freezeSource:{...freezeSource,sourceHash:'0'.repeat(64)}}),/graph\/hash mismatch/);
});

test('verification can carry later evidence without refitting a frozen block and detects omitted earlier evidence',async()=>{
  const readiness=await run(),frozen=await createEthereumProspectiveCalibrationFreeze({...inputs,readiness,
    frozenAt:informationCutoffAt,freezeSource});
  const future=await makeOutcome(records,{collectedAt:new Date(Date.parse(informationCutoffAt)+1000).toISOString(),
    priceOverrides:{[records[0].targets[0].targetDate]:1000}});
  assert.deepEqual(await verifyEthereumProspectiveCalibrationFreeze(frozen,{...inputs,observations:[outcome,future]}),frozen);
  const past=await makeRecord(dateFromDay(utcDay(records[0].asOf)-31));
  await assert.rejects(()=>verifyEthereumProspectiveCalibrationFreeze(frozen,{...inputs,
    records:[past.record,...records],snapshots:{...snapshots,[past.snapshot.id]:past.snapshot}}),/cutoff-visible same-bound record/);
  await assert.rejects(()=>verifyEthereumProspectiveCalibrationFreeze(frozen,{...inputs,records:records.slice(1)}),/Missing original record/);
});
