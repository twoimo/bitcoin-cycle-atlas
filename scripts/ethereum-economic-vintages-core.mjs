/** Immutable partial economic observations, not a complete model input adapter. */
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';

export const ETH_ECONOMIC_VINTAGES_VERSION='eth-economic-vintages-1';
const DAY=86400000,SUCCESS=new Set(['success','supplement-collected','partial-protocol-observation-collected']);
const SERIES={coinmetrics:'coinmetrics/data:ethereum:csv/eth.csv',throughput:'growthepie:ethereum-mainnet:throughput','pow-zero':'publicnode:ethereum-mainnet:post-transition-pow-zero'};
const SHA=/^[a-f0-9]{64}$/;
export const sha256=bytes=>createHash('sha256').update(bytes).digest('hex');
export function canonicalJson(value){
  if(value===null||typeof value==='string'||typeof value==='boolean')return JSON.stringify(value);
  if(typeof value==='number'){assert(Number.isFinite(value),'Non-finite canonical value');return JSON.stringify(value);}
  if(Array.isArray(value))return '['+value.map(canonicalJson).join(',')+']';
  assert(value&&typeof value==='object'&&Object.getPrototypeOf(value)===Object.prototype,'Canonical JSON requires plain data');
  return '{'+Object.keys(value).sort().map(k=>JSON.stringify(k)+':'+canonicalJson(value[k])).join(',')+'}';
}
export const contentId=value=>sha256(canonicalJson(value));
export const safePath=value=>typeof value==='string'&&value.length>0&&value.length<1024&&!value.startsWith('/')&&!value.includes('\\')&&!/[\x00-\x1f]/.test(value)&&value.split('/').every(x=>x!=='.'&&x!=='..'&&x!=='');
export function utc(value,label){
  assert(typeof value==='string'&&/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/.test(value),label+' requires a UTC timestamp');
  const ms=Date.parse(value);assert(Number.isFinite(ms)&&new Date(ms).toISOString().slice(0,19)===value.slice(0,19),'Invalid '+label);return ms;
}
function day(value){assert(typeof value==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(value),'Invalid observed date');const ms=utc(value+'T00:00:00Z','observed date');return ms;}
function fileIdentity(file){
  assert(file&&safePath(file.path)&&SHA.test(file.sha256)&&Number.isSafeInteger(file.bytes)&&file.bytes>0&&file.bytes<=32*1024*1024,'Invalid bounded input file identity');
  return {path:file.path,sha256:file.sha256,bytes:file.bytes};
}
function sourceBinding(receipt){
  const sourceCommit=receipt.sourceCommit??null,sourceTree=receipt.sourceTree??null,sourceHashes=receipt.sourceHashes??{};
  for(const x of [sourceCommit,sourceTree])assert(x===null||/^[a-f0-9]{40}$/.test(x),'Invalid collector source identity');
  for(const [path,hash]of Object.entries(sourceHashes))assert(safePath(path)&&SHA.test(hash),'Invalid collector source hash');
  return {sourceCommit,sourceTree,sourceHashes,runId:receipt.runId??null,runAttempt:receipt.runAttempt??null,
    receiptAuthenticityIndependentlyProven:false};
}
function chronology(receipt,observations,recordedAt){
  const recorded=utc(recordedAt,'recordedAt'),started=receipt.startedAt??receipt.captureStartedAt??null,finished=receipt.finishedAt??null;
  if(started!==null)assert(utc(started,'capture start')<=recorded,'Capture starts after ledger recording');
  if(finished!==null){assert(utc(finished,'capture finish')<=recorded,'Capture finishes after ledger recording');if(started!==null)assert(utc(started,'capture start')<=utc(finished,'capture finish'),'Reversed capture clocks');}
  const requests=Array.isArray(receipt.network)?receipt.network:Array.isArray(receipt.requests)?receipt.requests:[];
  let latestBody=null;
  for(const request of requests){
    const start=request.startedAt??request.requestedAt??null,body=request.bodyReceivedAt??request.responseReceivedAt??request.receivedAt??null,finish=request.finishedAt??request.completedAt??null;
    if(start!==null)assert(utc(start,'request start')<=recorded,'Future request');
    if(body!==null){const b=utc(body,'body received');assert(b<=recorded,'Future received body');if(start!==null)assert(utc(start,'request start')<=b,'Body predates request');latestBody=latestBody===null?b:Math.max(latestBody,b);}
    // Throughput responseReceivedAt is the header clock; completedAt records
    // the fully consumed body. Coin Metrics bodyReceivedAt is already explicit.
    if(request.complete===true&&request.completedAt!=null){const full=utc(request.completedAt,'complete body');assert(full<=recorded,'Future complete body');latestBody=latestBody===null?full:Math.max(latestBody,full);}
    if(finish!==null){const f=utc(finish,'request finish');assert(f<=recorded,'Future request finish');if(body!==null)assert(utc(body,'body received')<=f,'Finish predates body');if(start!==null)assert(utc(start,'request start')<=f,'Finish predates request');}
  }
  for(const observation of observations){
    const c=observation.clocks,collected=utc(c.collectedAt,'collectedAt'),end=day(c.observedThrough)+DAY;
    assert(day(c.observedThrough)-day(c.observedFrom)===27*DAY&&utc(c.observedAt,'observedAt')===end,'A vintage observation must retain its complete 28-day UTC window');
    assert(collected>=end&&collected<=recorded,'Collection must follow completed data and precede ledger recording');
    assert(c.publishedAt===null||utc(c.publishedAt,'publishedAt')<=collected&&utc(c.publishedAt,'publishedAt')>=end,'Publication is inconsistent with collection/window');
    for(const key of ['providerGeneratedAt','providerCompletedAt'])if(c[key]!==null)assert(utc(c[key],key)<=collected,'Provider clock after collection');
    const actual=receipt.observation?.collectedAt??receipt.collectedAt??null;assert(actual!==null&&utc(actual,'receipt collection')===collected,'Observation collection differs from receipt');
    if(latestBody!==null)assert(latestBody<=collected,'Claimed collection predates a required raw response');
    if(started!==null)assert(utc(started,'capture start')<=collected,'Collection predates capture start');
    if(finished!==null)assert(collected<=utc(finished,'capture finish'),'Collection follows capture finish');
  }
}
function normalizedObservation(observation,source,metricDefinitionVersion,metrics){
  assert(observation.rawBytesVerified===true&&observation.replayedFromRaw===true,'A data vintage requires byte verification and raw replay');
  assert(observation.sourceId===source.id&&typeof observation.sourceField==='string'&&observation.sourceField.length>0,'Observation source binding differs');
  const c=observation.clocks,clocks={};
  for(const key of ['observedFrom','observedThrough','observedAt','collectedAt','publishedAt','providerGeneratedAt','providerCompletedAt'])clocks[key]=c[key]??null;
  const key={series:SERIES[source.kind],sourceField:observation.sourceField,observedFrom:clocks.observedFrom,observedThrough:clocks.observedThrough,metricDefinitionVersion};
  const relations=metrics.flatMap(m=>m.evidence.filter(e=>e.observationId===observation.id).map(e=>({metric:m.metric,relation:e.relation,reason:e.reason}))).sort((a,b)=>a.metric.localeCompare(b.metric));
  const data={...key,value:observation.value,valueRepresentation:typeof observation.value==='number'?'replayed-javascript-number':'source-decimal-string',relations};
  // Publication/collection/receipt/raw-file revision is evidence; it is not a new
  // economic value or an independent sample when this exact data stays the same.
  return {...data,dataKey:contentId(key),dataVersionId:contentId(data),sourceUrl:observation.sourceUrl,clocks,
    availabilityUpperBound:clocks.collectedAt,availabilityBasis:'actual-collector-receipt-clock',publicationTimeKnown:clocks.publishedAt!==null,
    rawBytesVerified:true,replayedFromRaw:true,modelInputActivated:false};
}

export function createEconomicVintageRecord({source,observations=[],metrics=[],metricDefinitionVersion,receipt,files,recordedAt}={}){
  assert(source&&Object.hasOwn(SERIES,source.kind)&&Array.isArray(files)&&files.length>=1&&files.length<=100,'Unknown or unbounded vintage source');
  assert(typeof metricDefinitionVersion==='string'&&metricDefinitionVersion.length>0,'Missing metric definition');
  assert(safePath(source.receiptPath)&&SHA.test(source.receiptSha256),'Separate original receipt required');
  assert(Array.isArray(observations)&&observations.length<=100&&Array.isArray(metrics),'Bounded observations required');
  const identities=files.map(fileIdentity).sort((a,b)=>a.path.localeCompare(b.path));assert(new Set(identities.map(f=>f.path)).size===identities.length,'Duplicate input path');
  const receiptFile=identities.find(f=>f.path===source.receiptPath);assert(receiptFile&&receiptFile.sha256===source.receiptSha256,'Receipt file not bound');
  assert(receipt.status===source.collectorStatus,'Receipt status differs');
  if(observations.length)assert(SUCCESS.has(source.collectorStatus)&&source.rawAudit.status==='verified'&&source.rawAudit.replayed===true&&identities.length>1,'Unverified/failed collection cannot become data');
  chronology(receipt,observations,recordedAt);
  const normalized=observations.map(o=>normalizedObservation(o,source,metricDefinitionVersion,metrics)).sort((a,b)=>a.dataKey.localeCompare(b.dataKey));
  assert(new Set(normalized.map(o=>o.dataKey)).size===normalized.length,'Duplicate observed source field/window');
  const capture={sourceKind:source.kind,collectorStatus:source.collectorStatus,collectorError:source.collectorError??null,receipt:receiptFile,
    rawFiles:identities.filter(f=>f.path!==source.receiptPath),collectorSource:sourceBinding(receipt),metricDefinitionVersion,observations:normalized};
  const captureKey=contentId(capture),body={kind:'ethereum-economic-vintage-record',version:ETH_ECONOMIC_VINTAGES_VERSION,captureKey,recordedAt,...capture};
  return {...body,id:contentId(body)};
}
export function validateEconomicVintageRecord(record){
  assert(record?.kind==='ethereum-economic-vintage-record'&&record.version===ETH_ECONOMIC_VINTAGES_VERSION&&SHA.test(record.id),'Invalid vintage record');
  const {id,...body}=record;assert.equal(id,contentId(body),'Vintage record content identity mismatch');
  const {kind,version,captureKey,recordedAt,...capture}=body;assert.equal(captureKey,contentId(capture),'Capture identity mismatch');
  utc(recordedAt,'recordedAt');assert(Object.hasOwn(SERIES,capture.sourceKind),'Unknown source kind');
  for(const f of [capture.receipt,...capture.rawFiles])fileIdentity(f);
  assert(new Set([capture.receipt,...capture.rawFiles].map(f=>f.path)).size===capture.rawFiles.length+1,'Duplicate record file');
  assert(Array.isArray(capture.observations)&&capture.observations.length<=100,'Unbounded vintage observations');
  if(capture.observations.length)assert(SUCCESS.has(capture.collectorStatus)&&capture.rawFiles.length>0,'Unverified collection has data');
  for(const observation of capture.observations){
    const {series,sourceField,observedFrom,observedThrough,metricDefinitionVersion,value,valueRepresentation,relations}=observation;
    assert.equal(series,SERIES[capture.sourceKind],'Vintage series differs from collector');
    assert.equal(metricDefinitionVersion,capture.metricDefinitionVersion,'Vintage definition differs from capture');
    assert(typeof sourceField==='string'&&sourceField.length>0&&typeof observation.sourceUrl==='string'&&/^https:\/\/[^\s]+$/.test(observation.sourceUrl),'Invalid vintage source field/URL');
    assert(typeof value==='number'?Number.isFinite(value)&&value>=0:typeof value==='string'&&/^\d+(?:\.\d+)?$/.test(value),'Invalid observed value');
    assert.equal(valueRepresentation,typeof value==='number'?'replayed-javascript-number':'source-decimal-string','Incorrect value representation');
    const c=observation.clocks,end=day(observedThrough)+DAY,collected=utc(c.collectedAt,'collectedAt');
    assert(day(observedThrough)-day(observedFrom)===27*DAY&&c.observedFrom===observedFrom&&c.observedThrough===observedThrough&&utc(c.observedAt,'observedAt')===end,'Vintage window differs from its clock');
    assert(collected>=end,'Collection precedes complete observation window');
    assert(c.publishedAt===null||utc(c.publishedAt,'publishedAt')>=end&&utc(c.publishedAt,'publishedAt')<=collected,'Invalid vintage publication chronology');
    for(const field of ['providerGeneratedAt','providerCompletedAt'])if(c[field]!==null)assert(utc(c[field],field)<=collected,'Provider clock after collection');
    assert(observation.rawBytesVerified===true&&observation.replayedFromRaw===true&&observation.availabilityBasis==='actual-collector-receipt-clock','Vintage verification contract differs');
    assert.equal(observation.publicationTimeKnown,c.publishedAt!==null,'Publication knowledge differs from clock');
    assert(Array.isArray(relations)&&relations.length<=100,'Invalid vintage relations');
    const key={series,sourceField,observedFrom,observedThrough,metricDefinitionVersion};
    assert.equal(observation.dataKey,contentId(key),'Vintage data key mismatch');
    assert.equal(observation.dataVersionId,contentId({...key,value,valueRepresentation,relations}),'Vintage data value identity mismatch');
    assert.equal(observation.availabilityUpperBound,observation.clocks.collectedAt,'Availability cannot be backdated');
    assert(utc(observation.availabilityUpperBound,'availability')<=utc(recordedAt,'recordedAt'),'Future vintage');
    assert(observation.modelInputActivated===false,'Vintage cannot activate a model input');
  }
  return true;
}
export function appendEconomicVintages(existing=[],incoming=[]){
  assert(Array.isArray(existing)&&Array.isArray(incoming)&&existing.length+incoming.length<=512,'Bounded vintage ledger required');
  const records=[],ids=new Set(),captures=new Map();
  for(const r of existing){validateEconomicVintageRecord(r);assert(!ids.has(r.id)&&!captures.has(r.captureKey),'Duplicate seed record');records.push(r);ids.add(r.id);captures.set(r.captureKey,r);}
  let newCaptureCount=0,reusedCaptureCount=0;
  for(const r of incoming){validateEconomicVintageRecord(r);const prior=captures.get(r.captureKey);if(prior){reusedCaptureCount++;continue;}
    assert(!ids.has(r.id),'Duplicate record identity');records.push(r);ids.add(r.id);captures.set(r.captureKey,r);newCaptureCount++;}
  return {records,newCaptureCount,reusedCaptureCount};
}
export function selectEconomicVintages(records,{cutoff,maximumAgeDays=7}={}){
  const cutoffMs=utc(cutoff,'cutoff');assert(Number.isInteger(maximumAgeDays)&&maximumAgeDays>=0&&maximumAgeDays<=3650,'Invalid freshness policy');
  const groups=new Map();let unavailableCaptureObservations=0;
  for(const record of records){validateEconomicVintageRecord(record);for(const o of record.observations){
    if(utc(o.availabilityUpperBound,'availability')>cutoffMs){unavailableCaptureObservations++;continue;}
    const group=groups.get(o.dataKey)??[];group.push({recordId:record.id,recordedAt:record.recordedAt,observation:o});groups.set(o.dataKey,group);
  }}
  const selections=[];
  for(const [dataKey,group]of groups){
    const latest=Math.max(...group.map(x=>utc(x.observation.clocks.collectedAt,'collection'))),current=group.filter(x=>utc(x.observation.clocks.collectedAt,'collection')===latest);
    const versions=[...new Set(current.map(x=>x.observation.dataVersionId))].sort(),ambiguous=versions.length>1;
    const sample=current[0].observation,ageDays=Math.floor(cutoffMs/DAY)-1-day(sample.observedThrough)/DAY;
    const base={dataKey,series:sample.series,sourceField:sample.sourceField,observedFrom:sample.observedFrom,observedThrough:sample.observedThrough,
      status:ambiguous?'ambiguous-same-collection-clock':'selected',latestCollectedAt:new Date(latest).toISOString(),ageDays,
      freshness:ageDays>maximumAgeDays?'stale':'within-policy',captureEvidenceCount:group.length,distinctValueVersionCount:new Set(group.map(x=>x.observation.dataVersionId)).size,
      dataVersionIdsAtLatestClock:versions,latestRecordIds:current.map(x=>x.recordId).sort(),modelInputActivated:false};
    if(!ambiguous){const matching=group.filter(x=>x.observation.dataVersionId===versions[0]);base.dataVersionId=versions[0];base.value=sample.value;base.relations=sample.relations;
      base.firstObservedAvailableAt=new Date(Math.min(...matching.map(x=>utc(x.observation.availabilityUpperBound,'availability')))).toISOString();
      base.publicationTimeKnown=sample.publicationTimeKnown;}
    selections.push(base);
  }
  selections.sort((a,b)=>a.dataKey.localeCompare(b.dataKey));
  return {kind:'ethereum-economic-vintage-selection',version:ETH_ECONOMIC_VINTAGES_VERSION,cutoff,maximumAgeDays,selections,
    summary:{selectedFieldWindows:selections.filter(x=>x.status==='selected').length,ambiguousFieldWindows:selections.filter(x=>x.status!=='selected').length,
      staleSelectedFieldWindows:selections.filter(x=>x.status==='selected'&&x.freshness==='stale').length,unavailableCaptureObservations,
      eligibleModelSnapshotCount:0,modelInputActivated:false},policy:{selectionIsReceiptClockAvailabilityAudit:true,collectionIsUpperBoundNotFirstPublication:true,
      providerGeneratedOrCompletedClocksIgnoredForAvailability:true,repeatedCaptureIsNotIndependentSample:true,
      numericValueVersionsMayShareRoundedRepresentation:true,rawReceiptRevisionsRemainSeparatelyIdentified:true,retainedArchiveDoesNotProvePastModelUse:true,
      equalCollectionClockConflictsAreAmbiguous:true,fullModelSnapshotReady:false,historicalPointInTimeReady:false}};
}
