import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {analyzeEthereumSourceTiming,ETH_SOURCE_METRIC_MAPPINGS} from '../scripts/analyze-ethereum-source-timing.mjs';

const DAY=86400000,START=Date.parse('2026-01-01T00:00:00Z');
const HEAD=['time','SplyCur','IssTotNtv','FeeTotNtv','AdrActCnt','TxCnt','PriceUSD','ReferenceRate','AssetEODCompletionTime'];
function fixture({count=30,change=()=>{},omit=[]}={}){
  const rows=[];
  for(let i=0;i<count;i++){
    if(omit.includes(i))continue;
    const row={time:new Date(START+i*DAY).toISOString().slice(0,10),SplyCur:String(1000+i),IssTotNtv:'2.000000000000000001',
      FeeTotNtv:'0.100000000000000001',AdrActCnt:'10',TxCnt:'20',PriceUSD:String(2000+i+1),ReferenceRate:String(2000+i),AssetEODCompletionTime:String((START+(i+1)*DAY)/1000+3600)};
    change(row,i);rows.push(row);
  }
  return [HEAD.join(','),...rows.map(r=>HEAD.map(h=>r[h]).join(','))].join('\n')+'\n';
}
const analyze=(csv,options={})=>analyzeEthereumSourceTiming(csv,{eraStart:'2026-01-01',...options});

test('close and reference clocks differ by a day; next-row reference-only stub is never a completed close',()=>{
  const r=analyze(fixture({count:31,change:(row,i)=>{if(i===30)for(const f of HEAD)if(!['time','ReferenceRate'].includes(f))row[f]='';}}));
  assert.equal(r.rows.latestComplete,'2026-01-30');assert.equal(r.rows.completeMetricRows,30);
  assert.equal(r.priceClock.sameRowDifferent,30);assert.equal(r.priceClock.nextDayMatching,30);
  assert.deepEqual(r.priceClock.lastExample,{rowDate:'2026-01-30',priceUSD:{value:2030,eventAt:'2026-01-31T00:00:00.000Z'},
    sameRowReferenceRate:{value:2029,eventAt:'2026-01-30T00:00:00.000Z'},nextDayReferenceRate:{value:2030,eventAt:'2026-01-31T00:00:00.000Z'}});
  assert.equal(ETH_SOURCE_METRIC_MAPPINGS.PriceUSD.substitutableWithSameRowReferenceRate,false);
});

test('completion lags start at day end and preserve >1-day, >30-day and missing-clock evidence',()=>{
  const r=analyze(fixture({change:(row,i)=>{
    if(i===0)row.AssetEODCompletionTime=String((START+DAY)/1000+DAY/1000);
    if(i===1)row.AssetEODCompletionTime=String((START+2*DAY)/1000+DAY/1000+1);
    if(i===2)row.AssetEODCompletionTime=String((START+3*DAY)/1000+31*DAY/1000);
    if(i===3)row.AssetEODCompletionTime='';
  }}));
  assert.equal(r.completionLag.strictlyOver1Day,2);assert.equal(r.completionLag.strictlyOver30Days,1);
  assert.equal(r.completionLag.maximum.lagDays,31);assert.equal(r.completionLag.maximum.date,'2026-01-03');
  assert.equal(r.completionLag.missingCompletionRows,1);assert.equal(r.completionLag.tradableHistoricalVintageProven,false);
  assert.equal(r.latest28Days.providerCompletedAt,null);
});

test('28 daily flows sum exactly and supply growth uses the prior-day closing boundary',()=>{
  const r=analyze(fixture()),w=r.latest28Days,a=w.aggregate;
  assert.equal(w.observedFrom,'2026-01-03');assert.equal(w.observedThrough,'2026-01-30');
  assert.equal(a.totalFeesIncludingBlobEth,'2.800000000000000028');assert.equal(a.grossIssuanceEth,'56.000000000000000028');
  assert.equal(a.providerLedgerSupplyOpeningEth,'1001');assert.equal(a.providerLedgerSupplyClosingEth,'1029');
  assert.equal(a.providerLedgerSupplyChangeEth,'28');assert.equal(a.providerLedgerSupplyGrowthPct,28/1001*100);
  assert.equal(a.supplyOpeningAt,'2026-01-03T00:00:00.000Z');assert.equal(a.supplyClosingAt,'2026-01-31T00:00:00.000Z');
  assert.equal(r.eligibleFullModelSnapshots,0);assert.equal(r.priceForecast,null);assert.equal(r.economicGateModified,false);
});

test('a missing calendar day or blank flow does not become an observed zero or a shifted 28-row window',()=>{
  const missingDay=analyze(fixture({omit:[10]}));
  assert.deepEqual(missingDay.latest28Days.missingDates,['2026-01-11']);assert.equal(missingDay.latest28Days.aggregate,null);
  const missingValue=analyze(fixture({change:(r,i)=>{if(i===10)r.FeeTotNtv='';}}));
  assert.deepEqual(missingValue.latest28Days.missingFields,[{date:'2026-01-11',field:'FeeTotNtv'}]);assert.equal(missingValue.latest28Days.aggregate,null);
  const zero=analyze(fixture({change:r=>{r.FeeTotNtv='0';}}));
  assert.equal(zero.latest28Days.aggregate.totalFeesIncludingBlobEth,'0');assert.equal(zero.latest28Days.completeMetricWindow,true);
});

test('missing opening stock leaves supply growth unknown while available daily flows remain measurable',()=>{
  const r=analyze(fixture({count:28})),a=r.latest28Days.aggregate;
  assert.equal(r.latest28Days.completeMetricWindow,true);assert.equal(a.grossIssuanceEth,'56.000000000000000028');
  assert.equal(a.providerLedgerSupplyOpeningEth,null);assert.equal(a.providerLedgerSupplyChangeEth,null);assert.equal(a.providerLedgerSupplyGrowthPct,null);
});

test('receipt identities and actual collection persist without inferring publication from a provider commit',()=>{
  const csv=fixture(),bytes=Buffer.from(csv),hash=createHash('sha256').update(bytes).digest('hex');
  const blob=createHash('sha1').update('blob '+bytes.length+'\0').update(bytes).digest('hex');
  const receipt={sourceSha256:hash,publishedAt:null,collectedAt:'2026-10-26T12:12:40.869Z',asOf:'2026-10-25',
    source:{repository:'coinmetrics/data',path:'csv/eth.csv',commit:'a'.repeat(40),repositoryCommitTimestamp:'2026-01-31T13:00:00Z',expectedGitBlobSha:blob,expectedBytes:bytes.length}};
  const r=analyze(csv,{receipt});
  assert.equal(r.source.sha256,hash);assert.equal(r.source.gitBlobSha1,blob);assert.equal(r.source.receiptHashMatched,true);
  assert.equal(r.source.publishedAt,null);assert.equal(r.source.collectedAt,receipt.collectedAt);
  assert.equal(r.source.repositoryCommitTimestamp,receipt.source.repositoryCommitTimestamp);
  assert.equal(r.historicalPointInTimeReady,false);assert.equal(r.fullModelSnapshotReady,false);
  assert.throws(()=>analyze(csv+'\n',{receipt}),/SHA-256/);
  assert.throws(()=>analyze(csv,{receipt:{source:{expectedGitBlobSha:'0'.repeat(40)}}}),/Git blob/);
  assert.throws(()=>analyze(csv,{receipt:{source:{expectedBytes:1}}}),/size/);
  assert.equal(analyze(csv).source.collectedAt,null);assert.equal(analyze(csv).source.publishedAt,null);
});

test('malformed dates, duplicate rows, invalid numeric data and excess decimal precision fail explicitly',()=>{
  assert.throws(()=>analyze(fixture({change:(r,i)=>{if(i===0)r.time='2026-02-30';}})),/calendar date/);
  assert.throws(()=>analyze(fixture({change:(r,i)=>{if(i===1)r.time='2026-01-01';}})),/unique and increasing/);
  for(const value of ['NaN','Infinity','-1','1e309'])assert.throws(()=>analyze(fixture({change:r=>{r.FeeTotNtv=value;}})),/decimal/);
  assert.throws(()=>analyze(fixture({change:r=>{r.FeeTotNtv='0.0000000000000000001';}})),/18 decimal/);
  assert.throws(()=>analyze(fixture(),{receipt:{collectedAt:'2026-10-26T25:00:00Z'}}),/UTC time|timestamp/);
});

test('impossible negative completion is exposed and cannot pass a fixed-delay claim',()=>{
  const r=analyze(fixture({change:(row,i)=>{if(i===0)row.AssetEODCompletionTime=String(START/1000);}}));
  assert.equal(r.completionLag.negativeLagRows.length,1);assert.equal(r.completionLag.negativeLagRows[0].lagDays,-1);
  assert.equal(r.completionLag.fixedOneDayLagSufficient,false);assert.equal(r.historicalPointInTimeReady,false);
});
