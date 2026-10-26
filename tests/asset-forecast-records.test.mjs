import test from 'node:test';
import assert from 'node:assert/strict';
import {forecastHash,canonicalForecastJson} from '../dist/forecast-records.js';
import {createForecastInformationClock,verifyForecastInformationClock,selectPriceVintages} from '../dist/forecast-information-time.js';
import {assetSourceHash,createAssetForecastSnapshot,createAssetForecastRecord,verifyAssetForecastSnapshot,verifyAssetForecastRecord,restoreAssetForecastPath,assetForecastIndexEntry,validateAssetForecastIndex,verifyAssetForecastArchive,evaluateAssetForecastRecords,latestCompletedAssetDate} from '../dist/asset-forecast-records.js';
import {buildTreasuryForecast} from '../dist/treasury-model.js';
const DAY=86400000;
const at='2026-10-26T10:00:00.000Z',capture='2026-10-26T09:00:00.000Z';
const date=(start,offset)=>new Date(Date.parse(start+'T00:00:00Z')+offset*DAY).toISOString().slice(0,10);
const files={'dist/synthetic-test-model.js':'a'.repeat(64)};
const model={version:'synthetic-test-only',sourceCommit:'b'.repeat(40),sourceHash:await forecastHash(files),files};
// All prices, raw source text, URLs and acquisition times below are synthetic.
function candle(day,close){return {date:day+'T00:00:00Z',sessionDate:day,time:Date.parse(day+'T00:00:00Z')/1000,open:close,high:close,low:close,close,volume:10};}
async function fixture(symbol='ETHUSD',issuedAt=at){
  const ethCandles=Array.from({length:25},(_,i)=>candle(date('2026-10-01',i),2000+i));
  const ethRaw=JSON.stringify({source:'Coinbase Exchange',product:'ETH-USD',completedOnly:true,retrievedAt:capture,candles:ethCandles,dailyHistory:{source:'Coinbase Exchange',product:'ETH-USD',completedOnly:true,retrievedAt:capture,candles:ethCandles}});
  const eqCandles=[candle('2026-10-21',22),candle('2026-10-22',23),candle('2026-10-23',24)];
  const eqRaw=JSON.stringify({version:1,source:'Yahoo Finance',symbol:'BMNR',product:'BMNR',assetClass:'equity',currency:'USD',exchangeTimezone:'America/New_York',adjustment:'provider-split-adjusted-ohlc',completedOnly:true,retrievedAt:capture,firstDate:eqCandles[0].date,lastDate:eqCandles.at(-1).date,candles:eqCandles});
  const asOf=symbol==='ETHUSD'?'2026-10-25':'2026-10-23';
  const sourceDocuments={'eth-price':ethRaw};
  if(symbol==='BMNR'){sourceDocuments['bmnr-price']=eqRaw;sourceDocuments['treasury-research']='synthetic research text; not an actual filing';}
  const receipts=[];
  for(const[id,content]of Object.entries(sourceDocuments))receipts.push({id,kind:id==='treasury-research'?'document':id==='bmnr-price'?'equity-session':'crypto-daily',...(id==='treasury-research'?{}:{symbol:id==='bmnr-price'?'BMNR':'ETHUSD',asOf,sourceObservedThrough:id==='bmnr-price'?'2026-10-23':'2026-10-25'}),publishedAt:null,collectedAt:issuedAt,vintageId:'synthetic-v1',sourceHash:await assetSourceHash(content),sourceUrl:'https://example.invalid/'+id});
  const informationClock=createForecastInformationClock({issuedAt,inputs:receipts});
  const primaryPrices=(symbol==='ETHUSD'?ethCandles:eqCandles).filter(row=>row.date.slice(0,10)<=asOf).map(row=>[row.date.slice(0,10),row.close]);
  const inputs={primaryPrices,sourceDocuments,...(symbol==='BMNR'?{underlyingPrices:ethCandles.filter(row=>row.date.slice(0,10)<=asOf).map(row=>[row.date.slice(0,10),row.close])}:{})};
  const snapshot=await createAssetForecastSnapshot({symbol,asOf,informationClock,inputs});
  return {snapshot,informationClock,inputs,receipts};
}
function forecast(snapshot,multiplier=1){
  const anchor=snapshot.inputs.primaryPrices.at(-1)[1];
  return {symbol:snapshot.symbol,asOf:snapshot.asOf,scenario:{id:'base',label:'Synthetic fixture'},displayEnd:date(snapshot.asOf,200),path:Array.from({length:201},(_,i)=>{const price=anchor*Math.exp(i*.001*multiplier);return {date:date(snapshot.asOf,i),price,low:price*.9,high:price*1.1,baselinePrice:price};})};
}
const eth=await fixture(),bmnr=await fixture('BMNR');
const ethRecord=await createAssetForecastRecord({snapshot:eth.snapshot,forecast:forecast(eth.snapshot),model,options:{seed:17}});
const bmnrRecord=await createAssetForecastRecord({snapshot:bmnr.snapshot,forecast:forecast(bmnr.snapshot),model,options:{seed:17}});
const index=records=>({schemaVersion:1,kind:'atlas-asset-forecast-index',entries:records.map(assetForecastIndexEntry)});
const resigned=async value=>{const{id,...body}=value;return {id:await forecastHash(body),...body};};

test('current collection establishes an upper bound without inventing publication or historical vintages',()=>{
  verifyForecastInformationClock(bmnr.informationClock);
  const price=bmnr.informationClock.inputs.find(row=>row.id==='eth-price');
  assert.equal(price.publishedAt,null);assert.equal(price.availabilityBasis,'collection-upper-bound');
  assert.equal(price.asOf,'2026-10-23');assert.equal(price.consumedThrough,'2026-10-23');
  assert.equal(price.sourceObservedThrough,'2026-10-25');assert.equal(price.eventAt,'2026-10-24T00:00:00.000Z');assert.equal(price.sourceEventAt,'2026-10-26T00:00:00.000Z');
  assert.equal(bmnr.informationClock.inputs.find(row=>row.id==='bmnr-price').eventAt,'2026-10-23T20:00:00.000Z');
  assert.equal(bmnr.informationClock.historicalVintagesProven,false);
});

test('DST, early close, holiday and unsupported equity calendar are explicit',()=>{
  const receipt=bmnr.receipts.find(row=>row.id==='bmnr-price');
  const close=(day)=>createForecastInformationClock({issuedAt:'2026-12-30T10:00:00.000Z',inputs:[{...receipt,asOf:day,sourceObservedThrough:day,collectedAt:'2026-12-30T09:00:00.000Z'}]}).inputs[0].eventAt;
  assert.equal(close('2026-03-06'),'2026-03-06T21:00:00.000Z');assert.equal(close('2026-03-09'),'2026-03-09T20:00:00.000Z');
  assert.equal(close('2026-11-27'),'2026-11-27T18:00:00.000Z');
  assert.throws(()=>close('2026-11-26'),/holiday|calendar/);
  assert.throws(()=>close('2029-01-02'),/holiday|calendar/);
  assert.equal(latestCompletedAssetDate('2026-11-27T17:59:59.000Z','equity'),'2026-11-25');
  assert.equal(latestCompletedAssetDate('2026-11-27T18:00:00.000Z','equity'),'2026-11-27');
});

test('NY close cannot use same-date crypto close or a later full archive vintage',()=>{
  const r=eth.receipts[0];
  assert.throws(()=>createForecastInformationClock({issuedAt:'2026-10-23T20:01:00.000Z',inputs:[{...r,asOf:'2026-10-23',sourceObservedThrough:'2026-10-23',collectedAt:'2026-10-23T20:00:00.000Z'}]}),/out of order/);
  assert.throws(()=>createForecastInformationClock({issuedAt:at,inputs:[{...r,asOf:'2026-10-23',publishedAt:'2026-10-24T01:00:00.000Z'}]}),/out of order/);
  assert.throws(()=>createForecastInformationClock({issuedAt:at,informationCutoffAt:'2026-10-26T09:59:59.000Z',inputs:[r]}),/cutoff/);
});

test('raw-source adapters bind both primary and treasury-underlying consumed prefixes',async()=>{
  for(const [base,key]of [[eth,'primaryPrices'],[bmnr,'primaryPrices'],[bmnr,'underlyingPrices']]){
    const inputs=structuredClone(base.inputs);inputs[key][0][1]+=1;
    await assert.rejects(createAssetForecastSnapshot({symbol:base.snapshot.symbol,asOf:base.snapshot.asOf,informationClock:base.informationClock,inputs}),/prefix differs/);
  }
  const inputs=structuredClone(eth.inputs);inputs.sourceDocuments['eth-price']+=' ';
  await assert.rejects(createAssetForecastSnapshot({symbol:'ETHUSD',asOf:eth.snapshot.asOf,informationClock:eth.informationClock,inputs}),/source hash mismatch/);
  const wrong=createForecastInformationClock({issuedAt:at,inputs:[{...eth.receipts[0],asOf:'2026-10-23',sourceObservedThrough:'2026-10-24'}]});
  await assert.rejects(createAssetForecastSnapshot({symbol:'ETHUSD',asOf:'2026-10-23',informationClock:wrong,inputs:{...eth.inputs,primaryPrices:eth.inputs.primaryPrices.filter(row=>row[0]<='2026-10-23')}}),/coverage differs/);
});

test('later collected price revisions cannot rewrite an earlier cutoff and conflicting vintages are order independent',()=>{
  const base={date:'2026-10-23',price:2000,vintageId:'old',sourceHash:'a'.repeat(64),sourceUrl:'https://example.invalid/price',publishedAt:null,collectedAt:'2026-10-24T01:00:00.000Z'};
  const newer={...base,price:2100,vintageId:'new',sourceHash:'b'.repeat(64),collectedAt:'2026-10-25T01:00:00.000Z'};
  const options={symbol:'ETHUSD',informationCutoffAt:'2026-10-24T23:00:00.000Z'};
  assert.equal(selectPriceVintages([newer,base],options).rows[0].price,2000);
  assert.deepEqual(selectPriceVintages([base,newer],options),selectPriceVintages([newer,base],options));
  for(const rows of [[base,{...base,price:2200}],[{...base,price:2200},base]])assert.throws(()=>selectPriceVintages(rows,options),/Conflicting immutable/);
});

test('actual asset records replay exact preserved daily outputs and use separate research identity',async()=>{
  await verifyAssetForecastRecord(ethRecord,eth.snapshot);await verifyAssetForecastRecord(bmnrRecord,bmnr.snapshot);
  assert.equal(ethRecord.publicationScope,'draft-pr-research');assert.equal(ethRecord.productionAdopted,false);assert.equal(ethRecord.firstPublishedAt,null);
  const restored=restoreAssetForecastPath(ethRecord),expected=forecast(eth.snapshot).path;
  assert.deepEqual(restored.map(row=>[row.date,row.price,row.lower,row.upper,row.baselinePrice]),expected.map(row=>[row.date,row.price,row.low,row.high,row.baselinePrice]));
  assert.equal(bmnrRecord.targets[0].targetDate,'2026-11-23');assert.equal(bmnrRecord.targets[0].effectiveCalendarDays,31);assert.equal(bmnrRecord.targets[0].eventAt,'2026-11-23T21:00:00.000Z');
  assert.equal(ethRecord.targets[0].targetDate,'2026-11-24');assert.equal(ethRecord.targets[0].eventAt,'2026-11-25T00:00:00.000Z');
});

test('rerun acquisition time and source commit do not manufacture a distinct economic run',async()=>{
  const later=await fixture('ETHUSD','2026-10-26T12:00:00.000Z');
  const record=await createAssetForecastRecord({snapshot:later.snapshot,forecast:forecast(later.snapshot),model:{...model,sourceCommit:'c'.repeat(40)},options:{seed:17}});
  assert.notEqual(record.id,ethRecord.id);assert.notEqual(later.snapshot.id,eth.snapshot.id);
  assert.equal(later.snapshot.dataHash,eth.snapshot.dataHash);assert.equal(record.runKey,ethRecord.runKey);
  assert.throws(()=>validateAssetForecastIndex(index([ethRecord,record])),/Duplicate/);
});

test('changed output or freshly rehashed metadata cannot bypass observation and target checks',async()=>{
  const changed=structuredClone(ethRecord);changed.output.path[30][1]+=1;
  await assert.rejects(verifyAssetForecastRecord(changed),/content hash/);
  const wrong=structuredClone(ethRecord);wrong.targets[0].price+=1;
  await assert.rejects(verifyAssetForecastRecord(await resigned(wrong)),/target differs/);
  const claim=structuredClone(ethRecord);claim.productionAdopted=true;
  await assert.rejects(verifyAssetForecastRecord(await resigned(claim)),/cannot assert/);
  const raw=structuredClone(eth.snapshot);raw.inputs.primaryPrices[0][1]+=1;raw.dataHash=await forecastHash({symbol:raw.symbol,asOf:raw.asOf,inputs:raw.inputs});
  await assert.rejects(verifyAssetForecastSnapshot(await resigned(raw)),/prefix differs/);
});

test('new acquisition of an old origin is reconstructed, not issued prospective history',async()=>{
  const stale=await fixture('ETHUSD','2026-10-27T10:00:00.000Z');
  const args={snapshot:stale.snapshot,forecast:forecast(stale.snapshot),model};
  await assert.rejects(createAssetForecastRecord(args),/latest completed/);
  const rebuilt=await createAssetForecastRecord({...args,recordKind:'reconstructed'});
  assert.equal(rebuilt.recordKind,'reconstructed');
});

test('revisions preserve predecessors and validate same-origin ancestry',async()=>{
  const revised=await createAssetForecastRecord({snapshot:eth.snapshot,forecast:forecast(eth.snapshot,2),model,options:{seed:17,multiplier:2},replaces:ethRecord.id,revisionReason:'Synthetic sensitivity change'});
  const rows=[ethRecord,revised],records=Object.fromEntries(rows.map(row=>[row.id,row])),snapshots={[eth.snapshot.id]:eth.snapshot};
  assert.equal((await verifyAssetForecastArchive(index(rows),records,snapshots)).records,2);
  await assert.rejects(verifyAssetForecastArchive(index([revised]),{[revised.id]:revised},snapshots),/earlier preserved/);
  await assert.rejects(createAssetForecastRecord({snapshot:eth.snapshot,forecast:forecast(eth.snapshot),model,replaces:ethRecord.id}),/predecessor and reason/);
});

test('pending, actual availability, missing outcomes and retrospective labels remain distinct',async()=>{
  const pending=await evaluateAssetForecastRecords([ethRecord,bmnrRecord],{}, {evaluatedAt:at});
  assert.equal(pending.pendingTargets,6);assert.equal(pending.scoredTargets,0);
  const target=ethRecord.targets[0];
  const observed={date:target.targetDate,price:2100,vintageId:'synthetic-outcome',sourceHash:'d'.repeat(64),sourceUrl:'https://example.invalid/outcome',publishedAt:null,collectedAt:'2026-11-25T01:00:00.000Z'};
  const before=await evaluateAssetForecastRecords([ethRecord],{ETHUSD:[observed]},{evaluatedAt:'2026-11-25T00:30:00.000Z'});
  assert.equal(before.rows[0].status,'missing-observation');assert.equal(before.scoredTargets,0);
  const after=await evaluateAssetForecastRecords([ethRecord],{ETHUSD:[observed]},{evaluatedAt:'2026-11-25T01:00:00.000Z'});
  assert.equal(after.rows[0].status,'scored');assert.equal(after.scoredTargets,1);assert.equal(after.rows[0].actual,2100);
  const rebuilt=await createAssetForecastRecord({snapshot:eth.snapshot,forecast:forecast(eth.snapshot),model,recordKind:'reconstructed'});
  assert.equal((await evaluateAssetForecastRecords([rebuilt],{ETHUSD:[observed]},{evaluatedAt:'2026-11-25T01:00:00.000Z'})).rows[0].status,'retrospective');
});

test('treasury issue time is explicit while the same valid financial path is preserved',()=>{
  const options={symbol:'BMNR',history:[{date:'2026-10-23',close:24}],coinAnchor:{date:'2026-10-23',price:2022},endYear:2027};
  const plain=buildTreasuryForecast(options),timed=buildTreasuryForecast({...options,informationClock:bmnr.informationClock});
  assert.equal(plain.issuedAt,null);assert.equal(plain.modelReviewedAt,'2026-10-26');assert.equal(timed.issuedAt,at);
  assert.equal(timed.informationCutoffAt,at);assert.deepEqual(plain.path,timed.path);
  const noResearch=createForecastInformationClock({issuedAt:at,inputs:bmnr.receipts.filter(row=>row.kind!=='document')});
  assert.throws(()=>buildTreasuryForecast({...options,informationClock:noResearch}),/matching information receipt/);
});

test('an old information cutoff cannot turn a stale origin into a fresh actual issuance',async()=>{
  const clock=createForecastInformationClock({issuedAt:'2026-10-27T10:00:00.000Z',informationCutoffAt:at,inputs:eth.receipts});
  const snapshot=await createAssetForecastSnapshot({symbol:'ETHUSD',asOf:eth.snapshot.asOf,informationClock:clock,inputs:eth.inputs});
  const args={snapshot,forecast:forecast(snapshot),model};
  await assert.rejects(createAssetForecastRecord(args),/latest completed/);
  assert.equal((await createAssetForecastRecord({...args,recordKind:'reconstructed'})).recordKind,'reconstructed');
  const changed=structuredClone(ethRecord);changed.issuedAt=clock.issuedAt;changed.informationClock=clock;
  await assert.rejects(verifyAssetForecastRecord(await resigned(changed)),/stale or incomplete/);
});

test('evaluation before actual issuance is rejected instead of counting nonexistent pending forecasts',async()=>{
  await assert.rejects(evaluateAssetForecastRecords([ethRecord],{}, {evaluatedAt:'2026-10-26T09:59:59.999Z'}),/cannot precede actual forecast issuance/);
  const current=await evaluateAssetForecastRecords([ethRecord],{}, {evaluatedAt:at});
  assert.equal(current.pendingTargets,3);assert.equal(current.scoredTargets,0);
});

test('normalization roundoff is bounded and preserved without rewriting actual output prices',async()=>{
  const tiny=forecast(eth.snapshot);tiny.path[0].price*=1+Number.EPSILON;
  const record=await createAssetForecastRecord({snapshot:eth.snapshot,forecast:tiny,model});
  assert.equal(record.output.path[0][1],tiny.path[0].price);
  assert.equal(record.output.observedAnchorPrice,eth.snapshot.inputs.primaryPrices.at(-1)[1]);
  assert.equal(record.output.anchorRoundoff,tiny.path[0].price-record.output.observedAnchorPrice);
  await verifyAssetForecastRecord(record,eth.snapshot);
  const wrong=forecast(eth.snapshot);wrong.path[0].price+=1;
  await assert.rejects(createAssetForecastRecord({snapshot:eth.snapshot,forecast:wrong,model}),/anchor or end/);
});
