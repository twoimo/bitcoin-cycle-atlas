import test,{before} from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdtemp,mkdir,writeFile,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,dirname} from 'node:path';
import {canonicalForecastJson,forecastHash} from '../dist/forecast-records.js';
import {normalizeForecastTimestamp,selectPriceVintages} from '../dist/forecast-information-time.js';
import {utcDay,dateFromDay} from '../dist/cycle-engine.js';
import {planEthereumResearchPriceRequest,createEthereumResearchSnapshot} from '../dist/ethereum-prospective-prices.js';
import {createEthereumProspectiveRecord} from '../dist/ethereum-prospective-records.js';
import {createAssetOutcomeSnapshot,readAssetOutcomePrices,assetOutcomeSnapshotEntry} from '../dist/asset-outcome-records.js';
import {buildEthereumProspectiveCalibrationReadiness as legacyReadiness,
  createEthereumProspectiveCalibrationSession} from '../scripts/ethereum-prospective-calibration-core.mjs';
import {ETH_PROSPECTIVE_ARCHIVE_FORMAT as F,buildEthereumProspectiveArchive} from '../scripts/ethereum-prospective-archive-core.mjs';
import {openEthereumProspectiveArchiveSource,ethereumProspectiveArchiveSourceInfo,
  readEthereumProspectiveArchiveFile} from '../scripts/ethereum-prospective-archive-source.mjs';
import {ETH_PROSPECTIVE_PAGED_CALIBRATION_POLICY as P,selectEthereumProspectivePagedObservations,
  buildEthereumProspectivePagedCalibrationReadiness as readiness,
  buildEthereumProspectivePagedCalibrationReport as report,
  createEthereumProspectivePagedCalibrationFreeze as freeze,
  verifyEthereumProspectivePagedCalibrationFreeze as verifyFreeze} from '../scripts/ethereum-prospective-calibration-paged.mjs';
import {writeSyntheticEthereumProspectiveGrowthArchive} from './helpers/eth-prospective-growth-fixture.mjs';

// Every price, timestamp, model source identity and complete block below is a
// SYNTHETIC CONTRACT FIXTURE. None is retained market or model-skill evidence.
const DAY=86400000,json=canonicalForecastJson,encode=value=>Buffer.from(json(value)+'\n'),
  sha=bytes=>createHash('sha256').update(bytes).digest('hex'),
  hash=value=>sha(Buffer.from(json(value))),
  iso=(date,days=0,hours=0)=>new Date((utcDay(date)+days)*DAY+hours*3600000).toISOString();
const files=Object.fromEntries(['dist/ethereum-pooled-model.js','dist/ethereum-prospective-records.js',
  'dist/ethereum-prospective-prices.js'].map(path=>[path,'b'.repeat(64)]));
const model={version:'eth-pooled-volatility-research-1',sourceCommit:'c'.repeat(40),files,sourceHash:hash(files)};
const bound={modelKey:'pooled',modelVersion:model.version,modelSourceHash:model.sourceHash,
  options:{horizonDays:730,sampleCount:256,seed:20261027},horizonDays:30};
const archiveSource={sourceCommit:'a'.repeat(40),sourceTree:'b'.repeat(40),runId:'1234'};
const freezerFiles={'scripts/ethereum-prospective-calibration-paged.mjs':'d'.repeat(64),
  'scripts/ethereum-prospective-archive-source.mjs':'e'.repeat(64)};
const freezeSource={sourceCommit:'f'.repeat(40),files:freezerFiles,sourceHash:hash(freezerFiles)};

async function makeRecord(origin,{modelSource=model,issueDelayMs=0,snapshotDelayMs=0,economicDelta=0,point=100}={}){
  const first=(utcDay(origin)-800)*DAY,end=utcDay(origin)*DAY;
  const candles=Array.from({length:800},(_,index)=>{const time=(first+index*DAY)/1000;
    return {time,date:new Date(time*1000).toISOString(),open:100,high:110,low:90,close:index===0?100+economicDelta:100,volume:10};});
  const baseText=JSON.stringify({version:1,source:'Coinbase Exchange',product:'ETH-USD',
    dailyHistory:{source:'Coinbase Exchange',product:'ETH-USD',interval:'daily',seconds:86400,completedOnly:true,
      requestedStart:first/1000,requestedEnd:end/1000,retrievedAt:new Date(end+3600000).toISOString(),sourceUrls:[],candles}});
  const requestStartedAt=new Date(Date.parse(iso(origin,1,2))+snapshotDelayMs).toISOString(),
    bodyCompletedAt=new Date(Date.parse(requestStartedAt)+1000).toISOString();
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
    assumptions:{syntheticSchemaFixture:true},warnings:['Synthetic complete block; not market evidence']};
  const generationStartedAt=new Date(Date.parse(bodyCompletedAt)+1000+issueDelayMs).toISOString(),
    generatedAt=new Date(Date.parse(bodyCompletedAt)+2000+issueDelayMs).toISOString(),
    issuedAt=new Date(Date.parse(bodyCompletedAt)+3000+issueDelayMs).toISOString();
  const args={snapshot,forecast,model:modelSource,modelKey:'pooled',generationStartedAt,generatedAt,issuedAt};
  return {record:await createEthereumProspectiveRecord(args),snapshot,args};
}
async function outcomeFromRows(rows,{collectedAt,publishedAt=null,tag='outcome'}={}){
  const candles=rows.map(([date,close])=>({date:iso(date),time:utcDay(date)*86400,open:close,high:close*1.1,
    low:close*.9,close,volume:10}));
  const sourceDocument=JSON.stringify({version:1,source:'Coinbase Exchange',product:'ETH-USD',completedOnly:true,
    dailyHistory:{source:'Coinbase Exchange',product:'ETH-USD',completedOnly:true,candles}});
  return createAssetOutcomeSnapshot({symbol:'ETHUSD',sourceDocument,sourceUrl:'https://example.invalid/synthetic-'+tag,
    publishedAt,collectedAt:collectedAt??iso(rows.at(-1)[0],1,3)});
}
const recordFiles=items=>new Map(items.flatMap(({record,snapshot})=>[
  ['records/'+record.id+'.json',encode(record)],['snapshots/'+snapshot.id+'.json',encode(snapshot)]]));
function logical(items,outcomes=[]){
  const result=recordFiles(items);
  for(const item of outcomes)result.set((item.kind==='ethereum-prospective-input'?'observations/':'outcome-observations/')+item.id+'.json',encode(item));
  return result;
}
async function archive(logicalFiles,{previous=null,createdAt=cutoff}={}){
  return buildEthereumProspectiveArchive({files:logicalFiles,previous,source:archiveSource,createdAt});
}
async function writeArchive(t,value,{root=null,path='archive'}={}){
  if(!root){root=await mkdtemp(join(tmpdir(),'eth-paged-calibration-'));t.after(()=>rm(root,{recursive:true,force:true}));}
  for(const [name,bytes]of value.files){const file=join(root,path,name);await mkdir(dirname(file),{recursive:true});await writeFile(file,bytes);}
  const source=await openEthereumProspectiveArchiveSource({repositoryRoot:root,archivePath:path});
  return {root,path,source};
}
async function sourceFor(t,logicalFiles,options){return writeArchive(t,await archive(logicalFiles,options));}
function comparable(value){
  const {id,kind,policy,inputSource,...body}=value;return body;
}
async function rehash(value){const {id,...body}=value;return {id:await forecastHash(body),...body};}
function ordinaryPrices(snapshots,targets){
  const wanted=new Set(targets),prices=[];
  for(const snapshot of snapshots){
    const prospective=snapshot.kind==='ethereum-prospective-input';
    const receipt=prospective?{vintageId:snapshot.id,sourceHash:snapshot.primaryPricesHash,sourceUrl:snapshot.tail.sourceUrl,
      collectedAt:snapshot.informationCutoffAt,publishedAt:null,sourceObservedThrough:snapshot.asOf}:
      {...snapshot.sourceReceipt,sourceObservedThrough:snapshot.observedThrough};
    const rows=prospective?snapshot.primaryPrices:readAssetOutcomePrices('ETHUSD',snapshot.sourceDocument);
    for(const [date,price]of rows)if(wanted.has(date)){
      // The supplied source receipt's id/asOf refer to its terminal row. As in
      // the legacy calibrator, each consumed prefix receives its own row id.
      const {vintageId,sourceHash,sourceUrl,collectedAt,publishedAt,sourceObservedThrough}=receipt;
      prices.push({date,price,vintageId,sourceHash,sourceUrl,collectedAt,publishedAt,sourceObservedThrough});
    }
  }
  return prices;
}
const unboundRows=rows=>rows.map(({observationId,descriptor,...row})=>row);
let originals,records,snapshots,outcome,cutoff,initial,inputs;
before(async()=>{
  originals=[];
  for(let index=0;index<14;index++)originals.push(await makeRecord(dateFromDay(utcDay('2026-01-01')+index*31)));
  records=originals.map(item=>item.record);snapshots=Object.fromEntries(originals.map(item=>[item.snapshot.id,item.snapshot]));
  outcome=await outcomeFromRows(records.map((record,index)=>[record.targets[0].targetDate,100*Math.exp((index+1)/100)]));
  cutoff=outcome.sourceReceipt.collectedAt;initial=await archive(logical(originals,[outcome]));
  inputs={records,snapshots,observations:[outcome],informationCutoffAt:cutoff,binding:bound};
});

test('paged selection reproduces every legacy calibration field across append partitions and order',async t=>{
  const flat=await writeArchive(t,initial),late=await archive(logical(originals.slice(7).reverse()));
  const partitioned=await archive(logical(originals.slice(0,7).reverse(),[outcome]),{previous:late,
    createdAt:new Date(Date.parse(cutoff)+1000).toISOString()});
  const second=await writeArchive(t,partitioned),expected=await legacyReadiness(inputs);
  for(const source of [flat.source,second.source]){
    const actual=await readiness({source,informationCutoffAt:cutoff,binding:bound});
    assert.deepEqual(comparable(actual),comparable(expected));
    assert.deepEqual(actual.slots.map(slot=>slot.recordId),records.slice(0,12).map(record=>record.id));
    assert.equal(actual.slots[0].firstPublishedAt,null);assert.equal(actual.actualCalibratedRecordsIssued,0);
  }
  assert.notEqual(ethereumProspectiveArchiveSourceInfo(flat.source).id,ethereumProspectiveArchiveSourceInfo(second.source).id);
  assert.deepEqual(P.legacyReaderLimits,{records:2000,observations:500,indexBytes:1048576});
});

test('a missing first selected label never promotes the complete thirteenth origin across pages',async t=>{
  const missing=await outcomeFromRows(records.slice(1).map(record=>[record.targets[0].targetDate,101]),{collectedAt:cutoff});
  const prior=await archive(logical(originals.slice(1),[missing]));
  const {source}=await writeArchive(t,await archive(logical(originals.slice(0,1)),{previous:prior,
    createdAt:new Date(Date.parse(cutoff)+1000).toISOString()}));
  const actual=await readiness({source,informationCutoffAt:cutoff,binding:bound});
  assert.equal(actual.status,'incomplete-calibration-block');assert.equal(actual.validSelectedOutcomes,11);
  assert.equal(actual.slots[0].recordId,records[0].id);assert.equal(actual.slots[0].status,'missing-observation');
  assert.equal(actual.slots.length,12);assert.equal(actual.slots.some(slot=>slot.recordId===records[12].id),false);
  assert.equal(actual.logRadius,null);assert.equal(actual.orderStatistic,null);
  assert.deepEqual(comparable(actual),comparable(await legacyReadiness({...inputs,observations:[missing]})));
});

test('tied earliest same-origin revisions stay in the first slot, and a later complete revision cannot replace it',async t=>{
  const tied=await makeRecord(records[0].asOf,{point:101,snapshotDelayMs:100,issueDelayMs:-100,economicDelta:1}),
    late=await makeRecord(records[0].asOf,{point:102,snapshotDelayMs:200,issueDelayMs:10000,economicDelta:2});
  const {source}=await sourceFor(t,logical([...originals,tied,late],[outcome]));
  const actual=await readiness({source,informationCutoffAt:cutoff,binding:bound});
  assert.equal(actual.status,'incomplete-calibration-block');assert.equal(actual.slots[0].status,'invalid-forecast-evidence');
  assert.equal(actual.slots[0].tiedRecordIds.length,2);assert.equal(actual.sameOriginRevisions.length,2);
  assert.equal(actual.logRadius,null);assert.equal(actual.slots.some(slot=>slot.recordId===records[12].id),false);
});

test('global old equal-clock conflicts survive a later winning vintage on another page',async t=>{
  const firstDate=records[0].targets[0].targetDate,at=new Date(Date.parse(cutoff)+1000).toISOString();
  const conflicting=await outcomeFromRows([[firstDate,999]],{collectedAt:cutoff,tag:'conflict'});
  const newest=await outcomeFromRows(records.map(record=>[record.targets[0].targetDate,102]),{collectedAt:at,tag:'newest'});
  const prior=await archive(logical(originals,[outcome]));
  const {source}=await writeArchive(t,await archive(logical([],[newest,conflicting]),{previous:prior,createdAt:at}));
  const selected=await selectEthereumProspectivePagedObservations({source,targetDates:[firstDate],informationCutoffAt:at});
  assert.equal(selected.rows.length,0);assert.equal(selected.invalidObservations.length,1);
  assert.match(selected.invalidObservations[0].message,/equally timed/);
  const actual=await readiness({source,informationCutoffAt:at,binding:bound});
  const expected=await legacyReadiness({...inputs,observations:[outcome,conflicting,newest],informationCutoffAt:at});
  assert.deepEqual(comparable(actual),comparable(expected));assert.equal(actual.logRadius,null);
});

test('a shared report applies date conflicts only to bindings that selected that date',async t=>{
  const firstDate=records[0].targets[0].targetDate;
  const conflict=await outcomeFromRows([[firstDate,999]],{collectedAt:cutoff,tag:'conflict'});
  const {source}=await sourceFor(t,logical(originals,[outcome,conflict]));
  const bindings=[30,90,180].map(horizonDays=>({...bound,horizonDays}));
  const actual=await report({source,informationCutoffAt:cutoff,bindings});
  for(let i=0;i<bindings.length;i++)assert.deepEqual(comparable(actual.results[i]),
    comparable(await legacyReadiness({...inputs,observations:[outcome,conflict],binding:bindings[i]})));
  assert.equal(actual.results[0].invalidObservations.length,1);
  assert.equal(actual.results[1].invalidObservations.length,0);assert.equal(actual.results[2].invalidObservations.length,0);
  assert.equal(actual.actualSourceReplayPerformed,false);assert.equal(actual.actualFreezesCreated,0);
});

test('report binding batches are explicitly bounded without pruning source records or outcomes',async t=>{
  const {source}=await writeArchive(t,initial);
  const bindings=Array.from({length:257},(_,index)=>({...bound,modelSourceHash:index.toString(16).padStart(64,'0')}));
  await assert.rejects(()=>report({source,informationCutoffAt:cutoff,bindings}),/Bounded exact calibration bindings/);
  const actual=await report({source,informationCutoffAt:cutoff,bindings:bindings.slice(0,256)});
  assert.equal(actual.maximumReportBindings,256);assert.equal(actual.reportedBindings,256);
  assert.equal(actual.bindingSelection,'explicit-bounded-binding-batch');assert.equal(actual.allPreservedBindingsIncluded,false);
  for(const result of actual.results){assert.equal(result.inputRecordIds.length,records.length);assert.equal(result.inputObservationIds.length,1);}
  const all=await report({source,informationCutoffAt:cutoff});
  assert.equal(all.allPreservedBindingsIncluded,true);assert.equal(all.reportedBindings,3);
});

test('automatic 258-binding growth fails before a report cross-product; an explicit batch still scans every record',async t=>{
  const root=await mkdtemp(join(tmpdir(),'eth-calibration-binding-growth-'));t.after(()=>rm(root,{recursive:true,force:true}));
  const growth=await writeSyntheticEthereumProspectiveGrowthArchive({repositoryRoot:root,recordCount:86}),
    source=await openEthereumProspectiveArchiveSource({repositoryRoot:root,archivePath:growth.archivePath}),
    at=growth.manifest.createdAt,record=growth.fixture.record;
  await assert.rejects(()=>report({source,informationCutoffAt:at}),/maximumReportBindings=256.*explicit bounded binding batches/);
  const binding={modelKey:record.modelKey,modelVersion:record.model.version,modelSourceHash:record.model.sourceHash,
    options:record.options,horizonDays:30};
  const checked=await report({source,informationCutoffAt:at,bindings:[binding]});
  assert.equal(checked.results.length,1);assert.deepEqual(checked.results[0].inputRecordIds,growth.recordIds);
  assert.equal(checked.results[0].excludedRecords.length,85);assert.equal(checked.results[0].slots[0].recordId,record.id);
  assert.equal(checked.actualSourceReplayPerformed,false);assert.equal(checked.allPreservedBindingsIncluded,false);
});

test('A-B-A acquisition clocks, same-price ties and cutoff movement match the unchanged vintage selector',async t=>{
  const dates=records.slice(0,3).map(record=>record.targets[0].targetDate),base=Date.parse(cutoff);
  const observations=[];
  for(const [index,price]of [100,200,100].entries())observations.push(await outcomeFromRows(dates.map(date=>[date,price]),{
    collectedAt:new Date(base+index*1000).toISOString(),tag:'aba'}));
  observations.push(await outcomeFromRows(dates.map(date=>[date,100]),{collectedAt:new Date(base+2000).toISOString(),tag:'same-bytes-other-url'}));
  const {source}=await sourceFor(t,logical([],[...observations].reverse()));
  for(const at of [new Date(base-1).toISOString(),...observations.map(item=>item.sourceReceipt.collectedAt)]){
    const actual=await selectEthereumProspectivePagedObservations({source,targetDates:[...dates].reverse(),informationCutoffAt:at});
    const expected=selectPriceVintages(ordinaryPrices(observations,dates),{symbol:'ETHUSD',informationCutoffAt:at});
    assert.deepEqual(unboundRows(actual.rows),expected.rows);
    assert.deepEqual(actual.futureObservationIds,observations.filter(item=>item.sourceReceipt.collectedAt>at).map(item=>item.id).sort());
    for(const row of actual.rows){
      const bytes=await readEthereumProspectiveArchiveFile(source,row.descriptor.logicalPath);
      assert.equal(JSON.parse(bytes.toString('utf8')).id,row.observationId);
      assert.equal(row.publishedAt,null);
    }
  }
});

test('501 observations and over 100,000 projected versions use all evidence without changing legacy refusal',async t=>{
  const dates=Array.from({length:201},(_,index)=>dateFromDay(utcDay('2024-01-01')+index)),observations=[outcome];
  const rowValues=dates.map(date=>[date,100]);
  for(let index=0;index<500;index++)observations.push(await outcomeFromRows(rowValues,{
    collectedAt:new Date(Date.parse(cutoff)+index*1000).toISOString(),tag:'many-vintages'}));
  const at=observations.at(-1).sourceReceipt.collectedAt,{source}=await sourceFor(t,logical(originals,observations),{createdAt:at});
  const selected=await selectEthereumProspectivePagedObservations({source,targetDates:dates,informationCutoffAt:at});
  assert.equal(selected.observationCount,501);assert.equal(selected.inputObservationIds.length,501);
  assert.equal(selected.rows.length,201);assert.equal(selected.invalidObservations.length,0);
  assert.equal(selected.rows.every(row=>row.observationId===observations.at(-1).id),true);
  assert.equal(selected.retainedParsedObservationCollections,0);
  const actual=await readiness({source,informationCutoffAt:at,binding:bound});
  assert.equal(actual.status,'ready-to-freeze');assert.equal(actual.inputObservationIds.length,501);
  assert.equal(actual.validSelectedOutcomes,12);assert.equal(actual.logRadius,(await legacyReadiness(inputs)).logRadius);
  await assert.rejects(()=>createEthereumProspectiveCalibrationSession({...inputs,observations}),/bounded immutable outcome/);
  assert.throws(()=>selectPriceVintages(ordinaryPrices(observations,dates),{symbol:'ETHUSD',informationCutoffAt:at}),/Invalid price-vintage collection/);
});

test('prospective-only scope validates the full source but selects the frozen evaluator input kind',async t=>{
  const snapshot=originals.at(-1).snapshot,target=records[0].targets[0].targetDate;
  const {source}=await sourceFor(t,logical(originals,[snapshot,outcome]));
  const actual=await selectEthereumProspectivePagedObservations({source,targetDates:[target],informationCutoffAt:cutoff,
    observationKinds:['ethereum-prospective-input']});
  const expected=selectPriceVintages(ordinaryPrices([snapshot],[target]),{symbol:'ETHUSD',informationCutoffAt:cutoff});
  assert.deepEqual(unboundRows(actual.rows),expected.rows);assert.deepEqual(actual.ignoredObservationIds,[outcome.id]);
  assert.equal(actual.observationCount,2);assert.equal(actual.inputObservationIds.length,2);
  await assert.rejects(()=>selectEthereumProspectivePagedObservations({source,targetDates:[target],informationCutoffAt:cutoff,
    observationKinds:['unsupported']}),/supported observation kinds/);
});

test('opaque source capability, request ownership and result ownership prevent caller-provided verification bypass',async t=>{
  const {source}=await writeArchive(t,initial),request={source,informationCutoffAt:cutoff,binding:structuredClone(bound)};
  const pending=readiness(request);request.binding.horizonDays=90;request.binding.options.seed=1;
  const first=await pending,expected=structuredClone(first);first.slots[0].actual=1;first.inputRecordIds.length=0;
  assert.deepEqual(await readiness({source,informationCutoffAt:cutoff,binding:bound}),expected);
  for(const forgedSource of [{},JSON.parse(JSON.stringify(source)),Object.create(source),new Proxy(source,{})])
    await assert.rejects(()=>readiness({source:forgedSource,informationCutoffAt:cutoff,binding:bound}),/opaque verified archive source/);
  await assert.rejects(()=>readiness({source,informationCutoffAt:cutoff,binding:bound,verified:true}),/documented paged calibration inputs/);
});

test('an opaque source is re-read before calibration; changed same-size bytes cannot reuse its earlier verification',async t=>{
  const {source,root,path}=await writeArchive(t,initial),info=ethereumProspectiveArchiveSourceInfo(source);
  const item=info.logicalDescriptors.find(row=>row.path==='outcome-observations/'+outcome.id+'.json'),file=join(root,path,item.objectPath);
  const bytes=await readFile(file),changed=Buffer.from(bytes);changed[changed.indexOf(Buffer.from('Coinbase'))]=88;
  assert.equal(changed.length,bytes.length);await writeFile(file,changed);
  await assert.rejects(()=>readiness({source,informationCutoffAt:cutoff,binding:bound}),/raw-byte|Git-blob|changed/);
  await assert.rejects(()=>selectEthereumProspectivePagedObservations({source,targetDates:[],informationCutoffAt:cutoff,
    observationKinds:['ethereum-prospective-input']}),/raw-byte|Git-blob|changed/);
});

// Create valid transport hashes around intentionally invalid typed evidence.
// This demonstrates why transport verification alone is not semantic proof.
async function forgedInitial(logicalFiles){
  const entries=[...logicalFiles].map(([path,bytes])=>F.descriptor(path,bytes)).sort((a,b)=>a.path.localeCompare(b.path));
  const physical=new Map();for(const entry of entries)physical.set(entry.objectPath,logicalFiles.get(entry.path));
  const pages=[];
  for(let offset=0;offset<entries.length;offset+=128){
    const body={schemaVersion:1,kind:'ethereum-prospective-archive-page',entries:entries.slice(offset,offset+128)},page={id:hash(body),...body};
    const desc=F.metadataDescriptor(page);pages.push(desc);physical.set(desc.path,encode(page));
  }
  const counts=F.initialCounts(),objects=new Set();for(const entry of entries)F.addCounts(counts,entry,objects);
  const {id,...prior}=initial.manifest,body={...prior,pages,counts},manifest={id:hash(body),...body};
  physical.set('manifest.json',encode(manifest));physical.set('manifests/'+manifest.id+'.json',encode(manifest));
  return {files:physical,manifest};
}
async function writeWithoutOpen(t,value){
  const root=await mkdtemp(join(tmpdir(),'eth-paged-invalid-'));t.after(()=>rm(root,{recursive:true,force:true}));
  for(const [path,bytes]of value.files){const file=join(root,'archive',path);await mkdir(dirname(file),{recursive:true});await writeFile(file,bytes);}
  return root;
}
test('bad wrong-binding records and future-dated bad observations reject despite recomputed transport hashes',async t=>{
  const badRecord=structuredClone(records[0]);badRecord.model.sourceHash='0'.repeat(64);
  const changed=await rehash(badRecord),recordInput=logical(originals,[outcome]);
  recordInput.delete('records/'+records[0].id+'.json');recordInput.set('records/'+changed.id+'.json',encode(changed));
  let root=await writeWithoutOpen(t,await forgedInitial(recordInput));
  await assert.rejects(()=>openEthereumProspectiveArchiveSource({repositoryRoot:root,archivePath:'archive'}),/Prospective source graph\/hash mismatch/);
  const futureRecord=structuredClone(records[0]);futureRecord.issuedAt='2099-01-01T00:00:00.000Z';
  const futureChanged=await rehash(futureRecord),futureInput=logical(originals,[outcome]);
  futureInput.delete('records/'+records[0].id+'.json');futureInput.set('records/'+futureChanged.id+'.json',encode(futureChanged));
  root=await writeWithoutOpen(t,await forgedInitial(futureInput));
  await assert.rejects(()=>openEthereumProspectiveArchiveSource({repositoryRoot:root,archivePath:'archive'}),/current completed UTC close; no backdating/);
  const badObservation=structuredClone(outcome);badObservation.sourceReceipt.collectedAt='2099-01-01T00:00:00.000Z';
  const altered=await rehash(badObservation),observationInput=logical(originals,[altered]);
  root=await writeWithoutOpen(t,await forgedInitial(observationInput));
  await assert.rejects(()=>openEthereumProspectiveArchiveSource({repositoryRoot:root,archivePath:'archive'}),/Outcome snapshot metadata or raw-source binding mismatch/);
});

test('a freeze binds an entire immutable manifest and is invariant to physical archive location',async t=>{
  const first=await writeArchive(t,initial),second=await writeArchive(t,initial,{path:'another-location'});
  const checked=await readiness({source:first.source,informationCutoffAt:cutoff,binding:bound});
  const frozen=await freeze({source:first.source,readiness:checked,frozenAt:cutoff,freezeSource});
  assert.deepEqual(await verifyFreeze(frozen,{source:second.source}),frozen);
  assert.equal(frozen.archiveManifestId,initial.manifest.id);assert.equal(frozen.calibrationRecordIds.length,12);
  assert.equal(frozen.actualCalibratedRecordsIssued,0);assert.equal(frozen.productionPromoted,false);
  const forged=structuredClone(checked);forged.inputRecordIds.shift();forged.inputObservationIds=[];
  await assert.rejects(()=>freeze({source:first.source,readiness:rehashSync(forged),frozenAt:cutoff,freezeSource}),/complete immutable archive inventory/);
  const changed=structuredClone(frozen);changed.logRadius=999;
  await assert.rejects(()=>verifyFreeze(rehashSync(changed),{source:first.source}),/does not reproduce/);
});
function rehashSync(value){const {id,...body}=value;return {id:hash(body),...body};}

test('later evidence verifies an original freeze without refitting its block or radius',async t=>{
  const original=await writeArchive(t,initial),checked=await readiness({source:original.source,informationCutoffAt:cutoff,binding:bound});
  const frozen=await freeze({source:original.source,readiness:checked,frozenAt:cutoff,freezeSource});
  const at=new Date(Date.parse(cutoff)+1000).toISOString();
  const later=await outcomeFromRows(records.map(record=>[record.targets[0].targetDate,999]),{collectedAt:at,tag:'future'});
  const extended=await archive(logical([],[later]),{previous:initial,createdAt:at}),{source}=await writeArchive(t,extended);
  const verified=await verifyFreeze(frozen,{source});assert.deepEqual(verified,frozen);
  assert.equal(verified.logRadius,checked.logRadius);assert.equal(verified.readiness.inputObservationIds.includes(later.id),false);
  assert.notEqual((await readiness({source,informationCutoffAt:at,binding:bound})).logRadius,frozen.logRadius);
});

test('a new paged freeze cannot claim a time before the immutable manifest it binds',async t=>{
  const createdAt=new Date(Date.parse(cutoff)+1000).toISOString(),value=await archive(logical(originals,[outcome]),{createdAt});
  const {source}=await writeArchive(t,value),checked=await readiness({source,informationCutoffAt:cutoff,binding:bound});
  await assert.rejects(()=>freeze({source,readiness:checked,frozenAt:cutoff,freezeSource}),/precede the immutable archive manifest/);
  const frozen=await freeze({source,readiness:checked,frozenAt:createdAt,freezeSource});
  assert.equal(frozen.frozenAt,createdAt);assert.deepEqual(await verifyFreeze(frozen,{source}),frozen);
});

test('an appended older same-bound record or cutoff-visible observation cannot be omitted by a frozen ancestor',async t=>{
  const original=await writeArchive(t,initial),checked=await readiness({source:original.source,informationCutoffAt:cutoff,binding:bound});
  const frozen=await freeze({source:original.source,readiness:checked,frozenAt:cutoff,freezeSource}),at=new Date(Date.parse(cutoff)+1000).toISOString();
  const earlier=await makeRecord('2025-11-30'),recordExtension=await writeArchive(t,
    await archive(logical([earlier]),{previous:initial,createdAt:at}));
  await assert.rejects(()=>verifyFreeze(frozen,{source:recordExtension.source}),/cutoff-visible same-bound record/);
  const visible=await outcomeFromRows([[records[0].targets[0].targetDate,101]],{collectedAt:cutoff,tag:'omitted-old'});
  const observationExtension=await writeArchive(t,await archive(logical([],[visible]),{previous:initial,createdAt:at}));
  await assert.rejects(()=>verifyFreeze(frozen,{source:observationExtension.source}),/cutoff-visible observation/);
  const forged=structuredClone(frozen);forged.archiveManifestId='0'.repeat(64);
  await assert.rejects(()=>verifyFreeze(rehashSync(forged),{source:observationExtension.source}),/ancestor manifest/);
});

test('readiness may include a bounded overlay, but an immutable freeze requires post-append evidence',async t=>{
  const original=await writeArchive(t,initial),root=original.root,directory='outcomes',at=new Date(Date.parse(cutoff)+1000).toISOString();
  const future=await outcomeFromRows([[records[0].targets[0].targetDate,999]],{collectedAt:at,tag:'overlay'});
  const path=join(root,directory,'observations',future.id+'.json');await mkdir(dirname(path),{recursive:true});await writeFile(path,encode(future));
  await writeFile(join(root,directory,'index.json'),encode({schemaVersion:1,kind:'atlas-asset-outcome-index',
    observations:[assetOutcomeSnapshotEntry(future)],evaluations:[],latestEvaluationId:null}));
  const source=await openEthereumProspectiveArchiveSource({repositoryRoot:root,archivePath:'archive',outcomePaths:[directory]});
  const checked=await readiness({source,informationCutoffAt:cutoff,binding:bound});
  assert.equal(checked.status,'ready-to-freeze');assert.deepEqual(checked.futureObservationIds,[future.id]);
  await assert.rejects(()=>freeze({source,readiness:checked,frozenAt:at,freezeSource}),/immutable post-append archive manifest without overlays/);
});
