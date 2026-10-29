import {createHash} from 'node:crypto';
import {readFile, mkdir, writeFile} from 'node:fs/promises';
import {resolve, dirname} from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';

const DAY_MS=86_400_000, WEI=10n**18n;
export const ETH_TIMING_CAPTURE='research-data/eth-economic-captures/20261026T121240869Z-coinmetrics';
const CORE=['SplyCur','IssTotNtv','FeeTotNtv','AdrActCnt','TxCnt','PriceUSD'];
const NATIVE=new Set(['SplyCur','IssTotNtv','FeeTotNtv']);
const sha256=bytes=>createHash('sha256').update(bytes).digest('hex');
const iso=ms=>new Date(ms).toISOString();
const day=ms=>iso(ms).slice(0,10);
function dateMs(value){
  const ms=typeof value==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(value)?Date.parse(value+'T00:00:00.000Z'):NaN;
  if(!Number.isFinite(ms)||day(ms)!==value)throw new RangeError('Invalid UTC calendar date: '+value);
  return ms;
}
function timestamp(value,label){
  if(value==null)return null;
  if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/.test(value)||!Number.isFinite(Date.parse(value)))
    throw new RangeError(label+' must be a UTC timestamp or null');
  dateMs(value.slice(0,10));
  if(iso(Date.parse(value)).slice(0,19)!==value.slice(0,19))throw new RangeError(label+' is not a valid UTC time');
  return value;
}
function nativeUnits(value,label){
  if(!/^\d+(?:\.\d{1,18})?$/.test(value))throw new RangeError(label+' must have at most 18 decimal places');
  const [whole,fraction='']=value.split('.');
  return BigInt(whole)*WEI+BigInt(fraction.padEnd(18,'0'));
}
function decimal(value){
  const negative=value<0n, n=negative?-value:value;
  const fraction=(n%WEI).toString().padStart(18,'0').replace(/0+$/,'');
  return (negative?'-':'')+(n/WEI).toString()+(fraction?'.'+fraction:'');
}
function numeric(value,label,{integer=false,positive=false}={}){
  if(value==='')return null;
  if(!/^\d+(?:\.\d+)?$/.test(value))throw new RangeError(label+' must be a nonnegative decimal or blank');
  const n=Number(value);
  if(!Number.isFinite(n)||(integer&&!Number.isSafeInteger(n))||(positive&&n<=0))throw new RangeError('Invalid '+label);
  return n;
}
function parseArchive(bytes){
  // This pinned provider export has unquoted numeric/date fields. Reject other
  // CSV dialects instead of silently shifting columns or normalizing its hash.
  const text=bytes.toString('utf8');
  if(!Buffer.from(text,'utf8').equals(bytes))throw new TypeError('Source must be valid UTF-8');
  if(text.includes('"'))throw new TypeError('Expected unquoted Coin Metrics numeric CSV');
  const lines=text.replace(/^\uFEFF/,'').split(/\r?\n/);
  while(lines.at(-1)==='')lines.pop();
  if(lines.length<2||lines.length>100001)throw new RangeError('Expected 1–100000 CSV data rows');
  const headers=lines.shift().split(',');
  if(new Set(headers).size!==headers.length)throw new TypeError('Duplicate CSV columns');
  for(const field of ['time',...CORE,'AssetEODCompletionTime','ReferenceRate'])
    if(!headers.includes(field))throw new TypeError('Missing CSV column '+field);
  let previous=-Infinity;
  return lines.map((line,i)=>{
    const fields=line.split(',');
    if(fields.length!==headers.length)throw new TypeError('CSV column mismatch on row '+(i+2));
    const raw=Object.fromEntries(headers.map((h,j)=>[h,fields[j]])),ms=dateMs(raw.time);
    if(ms<=previous)throw new RangeError('Source dates must be unique and increasing');
    previous=ms;
    const values={},units={};
    for(const field of [...CORE,'ReferenceRate',...(headers.includes('ReferenceRateUSD')?['ReferenceRateUSD']:[])]){
      values[field]=numeric(raw[field],field,{integer:['AdrActCnt','TxCnt'].includes(field),positive:['SplyCur','PriceUSD','ReferenceRate','ReferenceRateUSD'].includes(field)});
      if(NATIVE.has(field)&&values[field]!==null)units[field]=nativeUnits(raw[field],field);
    }
    const completed=numeric(raw.AssetEODCompletionTime,'AssetEODCompletionTime',{integer:true});
    if(completed!==null&&!Number.isFinite(new Date(completed*1000).getTime()))throw new RangeError('Invalid completion epoch');
    return {date:raw.time,ms,endMs:ms+DAY_MS,raw,values,units,complete:CORE.every(k=>values[k]!==null),completedMs:completed===null?null:completed*1000};
  });
}

export const ETH_SOURCE_METRIC_MAPPINGS=Object.freeze({
  PriceUSD:{unit:'USD/ETH',eventAt:'row date + 1 day at 00:00 UTC',meaning:'Daily close, timestamp labelled by interval start',substitutableWithSameRowReferenceRate:false,source:'https://coverage.coinmetrics.io/asset-metrics/PriceUSD'},
  ReferenceRate:{unit:'USD/ETH',eventAt:'row date at 00:00 UTC',meaning:'Point-in-time reference rate; not that row’s daily close',source:'https://github.com/coinmetrics/docs-website/blob/master/market-data/market-data-faqs.md'},
  FeeTotNtv:{unit:'ETH over [date 00:00 UTC, next date 00:00 UTC)',meaning:'Execution base + priority + blob fees; not execution fees alone or burn',source:'https://gitbook-docs.coinmetrics.io/network-data/network-data-overview/fees-and-revenue/fees'},
  IssTotNtv:{unit:'ETH over [date 00:00 UTC, next date 00:00 UTC)',meaning:'Gross ETH-network issuance; not consensus net issuance. ETH_CL has a different definition including deposits.',source:'https://gitbook-docs.coinmetrics.io/network-data/network-data-overview/supply/supply-issuance'},
  SplyCur:{unit:'ETH at interval end',meaning:'Provider ledger supply; EL/CL scope and revisions remain unreconciled with the full model contract',source:'https://gitbook-docs.coinmetrics.io/network-data/network-data-overview/supply/current-supply'},
  AdrActCnt:{unit:'unique addresses per UTC day',meaning:'Ledger activity, including zero/self/failed actions; not humans or paid AI customers',source:'https://gitbook-docs.coinmetrics.io/network-data/network-data-overview/addresses/active-addresses'},
  TxCnt:{unit:'onchain transactions per UTC day',meaning:'L1 count; not gas, L2 count, or successful economic payments',source:'https://gitbook-docs.coinmetrics.io/network-data/network-data-overview/transactions/transactions'},
  AssetEODCompletionTime:{unit:'Unix seconds',meaning:'Provider calculation completion; not proven publication or client collection',source:'https://gitbook-docs.coinmetrics.io/network-data/network-data-overview/availability/asseteodcompletiontime'},
});

/** Deterministic source-only diagnostics. It does not fit prices, manufacture
 * snapshots, infer publication times, or change any economic model gate. */
export function analyzeEthereumSourceTiming(csv,{receipt={},eraStart='2022-09-15',asOf=receipt.asOf??null}={}){
  const bytes=Buffer.isBuffer(csv)?csv:typeof csv==='string'?Buffer.from(csv,'utf8'):null;
  if(!bytes||bytes.length>32*1024*1024)throw new TypeError('Expected bounded UTF-8 CSV bytes');
  const hash=sha256(bytes),blob=createHash('sha1').update('blob '+bytes.length+'\0').update(bytes).digest('hex');
  if(receipt.sourceSha256&&receipt.sourceSha256!==hash)throw new Error('CSV SHA-256 differs from capture receipt');
  if(receipt.source?.expectedGitBlobSha&&receipt.source.expectedGitBlobSha!==blob)throw new Error('CSV Git blob differs from capture receipt');
  if(receipt.source?.expectedBytes!=null&&receipt.source.expectedBytes!==bytes.length)throw new Error('CSV size differs from capture receipt');
  const publishedAt=timestamp(receipt.publishedAt,'publishedAt'),collectedAt=timestamp(receipt.collectedAt,'collectedAt');
  const repositoryCommitTimestamp=timestamp(receipt.source?.repositoryCommitTimestamp,'repositoryCommitTimestamp');
  if(publishedAt&&collectedAt&&Date.parse(publishedAt)>Date.parse(collectedAt))throw new RangeError('Publication is after collection');
  const rows=parseArchive(bytes),eraMs=dateMs(eraStart),era=rows.filter(r=>r.ms>=eraMs),complete=era.filter(r=>r.complete);
  const byDate=new Map(rows.map(r=>[r.date,r])),latest=complete.at(-1)??null;
  const timed=complete.filter(r=>r.completedMs!==null).map(r=>({date:r.date,intervalEndAt:iso(r.endMs),providerCompletedAt:iso(r.completedMs),lagDays:(r.completedMs-r.endMs)/DAY_MS}));
  const maxLag=timed.reduce((best,r)=>best===null||r.lagDays>best.lagDays?r:best,null);
  const referenceEqual=(a,b)=>Math.abs(a-b)<=Math.max(1e-9,1e-12*Math.max(Math.abs(a),Math.abs(b)));
  let sameRowComparisons=0,sameRowDifferent=0,nextDayComparisons=0,nextDayMatching=0;
  for(const row of complete){
    if(row.values.ReferenceRate!==null){sameRowComparisons++;if(!referenceEqual(row.values.PriceUSD,row.values.ReferenceRate))sameRowDifferent++;}
    const next=byDate.get(day(row.endMs));
    if(next?.values.ReferenceRate!=null){nextDayComparisons++;if(referenceEqual(row.values.PriceUSD,next.values.ReferenceRate))nextDayMatching++;}
  }
  let window=null;
  if(latest){
    const from=latest.ms-27*DAY_MS,expected=Array.from({length:28},(_,i)=>day(from+i*DAY_MS));
    const missingDates=expected.filter(d=>!byDate.has(d));
    const missingFields=expected.flatMap(d=>{const r=byDate.get(d);return r?CORE.filter(k=>r.values[k]===null).map(field=>({date:d,field})):[];});
    const windowRows=expected.map(d=>byDate.get(d));
    const full=missingDates.length===0&&missingFields.length===0;
    const opening=byDate.get(day(from-DAY_MS));
    let aggregate=null;
    if(full){
      const fees=windowRows.reduce((s,r)=>s+r.units.FeeTotNtv,0n),issuance=windowRows.reduce((s,r)=>s+r.units.IssTotNtv,0n);
      const openingSupply=opening?.units.SplyCur??null,closingSupply=latest.units.SplyCur;
      const delta=openingSupply===null?null:closingSupply-openingSupply;
      aggregate={totalFeesIncludingBlobEth:decimal(fees),grossIssuanceEth:decimal(issuance),
        providerLedgerSupplyOpeningEth:openingSupply===null?null:decimal(openingSupply),providerLedgerSupplyClosingEth:decimal(closingSupply),
        providerLedgerSupplyChangeEth:delta===null?null:decimal(delta),
        providerLedgerSupplyGrowthPct:delta===null?null:Number(delta)/Number(openingSupply)*100,
        supplyGrowthMeaning:'Change in this provider ledger metric; not a reconciled net-issuance or burn estimate',
        nativeAmountRepresentation:'Exact decimal strings, integer arithmetic at 10^-18 ETH; growth percent is approximate',
        supplyOpeningAt:openingSupply===null?null:iso(from),supplyClosingAt:iso(latest.endMs)};
    }
    window={observedFrom:day(from),observedThrough:latest.date,observedAt:iso(latest.endMs),windowDays:28,completeMetricWindow:full,
      missingDates,missingFields,aggregate,
      providerCompletedAt:full&&windowRows.every(r=>r.completedMs!==null)?iso(Math.max(...windowRows.map(r=>r.completedMs))):null,
      modelSnapshot:null};
  }
  const next=latest?byDate.get(day(latest.endMs)):null;
  const asOfMs=asOf===null?null:dateMs(asOf);
  return {kind:'ethereum-source-timing-diagnostic',version:'eth-source-timing-1',asOf,
    source:{sha256:hash,gitBlobSha1:blob,byteCount:bytes.length,receiptHashMatched:!!receipt.sourceSha256,
      repository:receipt.source?.repository??null,path:receipt.source?.path??null,providerCommit:receipt.source?.commit??null,
      repositoryCommitTimestamp,publishedAt,collectedAt,publicationTimeKnown:publishedAt!==null,
      clockMeaning:'Commit metadata and provider completion never substitute for publication or collection'},
    metricMappings:ETH_SOURCE_METRIC_MAPPINGS,
    rows:{total:rows.length,first:rows[0].date,last:rows.at(-1).date,eraStart,eraStartMeaning:'Merge calendar date inclusive; the transition day is not a full PoS day',
      eraRows:era.length,completeMetricRows:complete.length,latestComplete:latest?.date??null,
      missingByField:Object.fromEntries(CORE.map(k=>[k,era.filter(r=>r.values[k]===null).length]))},
    completionLag:{measuredFrom:'end of the labelled UTC day, not its start',timedCompleteRows:timed.length,
      missingCompletionRows:complete.length-timed.length,negativeLagRows:timed.filter(r=>r.lagDays<0),
      strictlyOver1Day:timed.filter(r=>r.lagDays>1).length,strictlyOver30Days:timed.filter(r=>r.lagDays>30).length,
      maximum:maxLag,over30DayRows:timed.filter(r=>r.lagDays>30),
      fixedOneDayLagSufficient:timed.length===0||timed.length!==complete.length?null:timed.every(r=>r.lagDays>=0&&r.lagDays<=1),
      tradableHistoricalVintageProven:false},
    priceClock:{sameRowComparisons,sameRowDifferent,nextDayComparisons,nextDayMatching,comparisonTolerance:{absoluteUsd:1e-9,relative:1e-12},
      lastExample:latest?{rowDate:latest.date,priceUSD:{value:latest.values.PriceUSD,eventAt:iso(latest.endMs)},
        sameRowReferenceRate:latest.values.ReferenceRate===null?null:{value:latest.values.ReferenceRate,eventAt:iso(latest.ms)},
        nextDayReferenceRate:next?.values.ReferenceRate==null?null:{value:next.values.ReferenceRate,eventAt:iso(next.ms)}}:null,
      alignmentDoesNotProveAvailability:true},
    latest28Days:window,staleDays:latest&&asOfMs!==null?Math.max(0,(asOfMs-latest.ms)/DAY_MS):null,
    fullModelSnapshotReady:false,eligibleFullModelSnapshots:0,historicalPointInTimeReady:false,priceForecast:null,economicGateModified:false,
    limitations:['PublishedAt remains unknown when absent from the capture receipt.',
      'CapturedAt applies only to the exact archive received; older rows are not backdated collections.',
      'Gross issuance, total fees and provider supply do not satisfy the full 25-metric definition contract.',
      'No missing day or metric is interpolated or replaced with zero; no fitted price candidate is created.']};
}

async function main(){
  const root=fileURLToPath(new URL('..',import.meta.url)),directory=resolve(root,ETH_TIMING_CAPTURE);
  const [bytes,receiptBytes]=await Promise.all([readFile(resolve(directory,'eth.csv')),readFile(resolve(directory,'receipt.json'))]);
  const receipt=JSON.parse(receiptBytes.toString('utf8'));
  if(receipt.status!=='success'||!receipt.sourceSha256||!receipt.source?.expectedGitBlobSha||!receipt.collectedAt)
    throw new Error('A successful capture receipt with exact identities and collection time is required');
  const report=analyzeEthereumSourceTiming(bytes,{receipt});
  report.captureReceiptSha256=sha256(receiptBytes);report.analyzedAt=new Date().toISOString();
  report.analyzerSourceSha256=sha256(await readFile(fileURLToPath(import.meta.url)));
  report.runId=process.env.GITHUB_RUN_ID??null;
  const output=resolve(root,'build/ethereum-source-timing.json');
  await mkdir(dirname(output),{recursive:true});await writeFile(output,JSON.stringify(report,null,2)+'\n');
  console.log('ETH_SOURCE_TIMING_RECEIPT '+JSON.stringify({source:report.source,rows:report.rows,
    lagOver1Day:report.completionLag.strictlyOver1Day,lagOver30Days:report.completionLag.strictlyOver30Days,
    latest28Days:report.latest28Days,staleDays:report.staleDays,fullModelSnapshotReady:false,output}));
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href)await main();
