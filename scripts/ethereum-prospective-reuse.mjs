import {canonicalForecastJson,forecastHash} from '../dist/forecast-records.js';
import {parseCoinbaseCandles} from '../dist/ohlc-data.js';
import {verifyEthereumProspectiveRecord,decideEthereumProspectiveAppend} from '../dist/ethereum-prospective-dispatch.js';

export const ETH_PROSPECTIVE_REUSE_POLICY='eth-prospective-completed-tail-reuse-1';

/** Raw snapshots remain immutable. Only provider rows excluded from the requested
 * completed window may differ under this deliberately narrow reuse policy. */
export async function ethereumProspectiveConsumedIdentity(record,snapshot){
  await verifyEthereumProspectiveRecord(record,snapshot);
  const request=snapshot.request;
  const completed=parseCoinbaseCandles(JSON.parse(snapshot.tail.text),{
    sourceSeconds:86400,now:Date.parse(snapshot.tail.bodyCompletedAt),
    start:request.requestedStart,end:request.requestedEnd,
  }).candles.map(r=>[r.time,r.low,r.high,r.open,r.close,r.volume]);
  return forecastHash({
    reusePolicy:ETH_PROSPECTIVE_REUSE_POLICY,symbol:record.symbol,asOf:record.asOf,
    modelKey:record.modelKey,modelVersion:record.model.version,modelSourceHash:record.model.sourceHash,
    recordPolicy:record.recordPolicy,options:record.options,
    horizons:record.targets.map(t=>[t.horizonDays,t.targetDate,t.eventAt]),
    baseSourceHash:snapshot.base.sourceHash,baseGitBlobSha:snapshot.base.gitBlobSha,
    mergePolicy:snapshot.merge.policy,primaryPricesHash:snapshot.primaryPricesHash,
    request:{requestedStart:request.requestedStart,requestedEnd:request.requestedEnd,
      sourceUrl:snapshot.tail.sourceUrl,granularity:request.granularity},
    completedTailCandles:completed,
  });
}

export async function decideEthereumProspectiveIssue({records,snapshots,candidate,candidateSnapshot}){
  const consumedInputHash=await ethereumProspectiveConsumedIdentity(candidate,candidateSnapshot);
  // Keep the original strict raw-run conflict and duplicate checks.
  const strict=decideEthereumProspectiveAppend(records,candidate),matches=[];
  for(const record of records){
    if(record.asOf!==candidate.asOf||record.modelKey!==candidate.modelKey||
      record.model.sourceHash!==candidate.model.sourceHash||record.model.version!==candidate.model.version)continue;
    const snapshot=snapshots[record.snapshotId];
    if(await ethereumProspectiveConsumedIdentity(record,snapshot)!==consumedInputHash)continue;
    if(record.issuedAt>candidate.issuedAt)throw new Error('Cannot reuse a candidate issued after this attempt');
    if(record.outputHash!==candidate.outputHash||
      canonicalForecastJson(record.targets)!==canonicalForecastJson(candidate.targets)||
      canonicalForecastJson(record.benchmarks)!==canonicalForecastJson(candidate.benchmarks)){
      throw new Error('Same completed-input candidate run produced different output or targets');
    }
    matches.push(record);
  }
  if(!matches.length){
    if(strict.action==='reuse')throw new Error('Strict raw run differs from completed-input identity');
    return {...strict,reusePolicy:ETH_PROSPECTIVE_REUSE_POLICY,consumedInputHash,reason:'new-completed-input-or-model'};
  }
  matches.sort((a,b)=>a.issuedAt.localeCompare(b.issuedAt)||a.id.localeCompare(b.id));
  return {action:'reuse',record:matches[0],reusePolicy:ETH_PROSPECTIVE_REUSE_POLICY,consumedInputHash,
    reason:matches[0].runKey===candidate.runKey?'same-raw-run':'same-completed-input-excluded-rows-may-differ',
    equivalentPreservedIds:matches.map(r=>r.id)};
}
