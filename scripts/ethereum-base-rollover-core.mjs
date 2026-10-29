import {createHash} from 'node:crypto';
import {canonicalForecastJson} from '../dist/forecast-records.js';
import {normalizeForecastTimestamp} from '../dist/forecast-information-time.js';
import {parseEthArchive} from '../dist/eth-market-data.js';
import {ETH_PROSPECTIVE_PRICE_POLICY,verifyEthereumResearchSnapshot,rebuildEthereumResearchPrices,
  planEthereumResearchPriceRequest} from '../dist/ethereum-prospective-prices.js';

export const ETH_BASE_ROLLOVER_POLICY=Object.freeze({
  version:'eth-reviewed-base-rollover-1',
  maximumSnapshotBytes:16*1024*1024,
  maximumCandidateBytes:ETH_PROSPECTIVE_PRICE_POLICY.maximumBaseBytes,
  outputParent:'build/ethereum-base-rollover',
  automaticPromotion:false,networkRequests:0,
});
const P=ETH_PROSPECTIVE_PRICE_POLICY,DAY=86400000;
const text=value=>canonicalForecastJson(value)+'\n';
const sha=value=>createHash('sha256').update(value).digest('hex');
const blob=value=>createHash('sha1').update('blob '+Buffer.byteLength(value)+'\0').update(value).digest('hex');
const copy=value=>JSON.parse(canonicalForecastJson(value));
const utc=value=>new Date(value).toISOString();
const candle=row=>({date:row.date,time:row.time,open:row.open,high:row.high,low:row.low,close:row.close,volume:row.volume});

function requestBoundary(baseText){
  const base=parseEthArchive(JSON.parse(baseText));
  const start=Math.max(base.requestedStart,base.requestedEnd-P.overlapDays*86400);
  const lastAt=utc((start+P.maximumRequestDays*86400)*1000),firstRejectedAt=utc(Date.parse(lastAt)+DAY);
  const accepted=planEthereumResearchPriceRequest(baseText,lastAt);
  if(accepted.requestedStart!==start||accepted.requestedEnd-accepted.requestedStart!==P.maximumRequestDays*86400)
    throw new Error('Accepted request boundary differs from the frozen price policy');
  let rejection=null;
  try{planEthereumResearchPriceRequest(baseText,firstRejectedAt);}catch(error){rejection={name:error.name,message:error.message};}
  if(!rejection)throw new Error('First request after the frozen boundary was unexpectedly accepted');
  return {requestedEnd:base.requestedEnd,overlapStartAt:utc(start*1000),
    lastAcceptedRequestUtcDate:lastAt.slice(0,10),firstRejectedRequestUtcDate:firstRejectedAt.slice(0,10),
    lastAcceptedRequest:accepted,firstRejection:rejection,plannerEndpointsVerified:true};
}

function compareCandles(before,after,overlapStart){
  const prior=new Map(before.candles.map(row=>[row.time,row]));
  const retained=[],reacquired=[],revised=[],added=[];
  for(const row of after.candles){
    const old=prior.get(row.time);
    if(!old){added.push(row.date.slice(0,10));continue;}
    prior.delete(row.time);
    const oldAt=old.retrievedAt??before.retrievedAt,nextAt=row.retrievedAt??after.retrievedAt;
    const sameValues=canonicalForecastJson(candle(old))===canonicalForecastJson(candle(row));
    if(row.time<overlapStart&&(!sameValues||oldAt!==nextAt))throw new Error('Rollover changed an unqueried historical candle or its collection time');
    if(!sameValues)revised.push({date:row.date.slice(0,10),before:{...candle(old),retrievedAt:oldAt},after:{...candle(row),retrievedAt:nextAt}});
    else if(oldAt!==nextAt)reacquired.push(row.date.slice(0,10));
    else retained.push(row.date.slice(0,10));
  }
  if(prior.size)throw new Error('Rollover removed a preserved historical candle');
  return {beforeCandles:before.candles.length,afterCandles:after.candles.length,
    retainedCandles:retained.length,reacquiredUnchangedCandles:reacquired.length,
    revisedCandles:revised.length,addedCandles:added.length,removedCandles:0,
    retainedDatesSha256:sha(text(retained)),retainedFirstDate:retained[0]??null,retainedLastDate:retained.at(-1)??null,
    reacquiredDates:reacquired,revisions:revised,addedDates:added,
    untouchedPrefixPreserved:true,missingValuesImputed:false};
}

export async function buildEthereumBaseRolloverCandidate({snapshot,preparedAt=new Date().toISOString()}={}){
  const at=normalizeForecastTimestamp(preparedAt,'preparedAt'),serialized=text(snapshot);
  if(Buffer.byteLength(serialized)>ETH_BASE_ROLLOVER_POLICY.maximumSnapshotBytes)throw new RangeError('Rollover snapshot exceeds its byte limit');
  const retained=JSON.parse(serialized);
  await verifyEthereumResearchSnapshot(retained);
  if(retained.informationCutoffAt>at||retained.base.collectedAt>at)throw new RangeError('Rollover snapshot contains a future acquisition');
  if(Date.parse(retained.tail.bodyCompletedAt)-Date.parse(retained.tail.requestStartedAt)>P.maximumRequestMilliseconds)
    throw new RangeError('Rollover tail acquisition exceeds the frozen request deadline');
  const rebuilt=rebuildEthereumResearchPrices({baseText:retained.base.text,tailText:retained.tail.text,
    requestStartedAt:retained.tail.requestStartedAt,bodyCompletedAt:retained.tail.bodyCompletedAt,sourceUrl:retained.tail.sourceUrl});
  const candidateText=text(rebuilt.archive);
  if(Buffer.byteLength(candidateText)>ETH_BASE_ROLLOVER_POLICY.maximumCandidateBytes)throw new RangeError('Rollover candidate exceeds the committed-base byte limit');
  const before=parseEthArchive(JSON.parse(retained.base.text)),after=parseEthArchive(JSON.parse(candidateText));
  const prices=after.candles.map(row=>[row.date.slice(0,10),row.close]);
  if(canonicalForecastJson(prices)!==canonicalForecastJson(retained.primaryPrices)||after.lastDate.slice(0,10)!==retained.asOf)
    throw new Error('Rollover candidate does not reproduce all preserved snapshot prices');
  const changes=compareCandles(before,after,rebuilt.request.requestedStart);
  const previous=requestBoundary(retained.base.text),candidate=requestBoundary(candidateText);
  const nextRequest=planEthereumResearchPriceRequest(candidateText,retained.informationCutoffAt);
  if(nextRequest.requestedEnd!==after.requestedEnd||nextRequest.requestedStart!==Math.max(after.requestedStart,after.requestedEnd-P.overlapDays*86400))
    throw new Error('Rollover candidate does not preserve the next request overlap');
  const report={schemaVersion:1,kind:'ethereum-base-rollover-candidate',policy:ETH_BASE_ROLLOVER_POLICY.version,
    status:'candidate-prepared',snapshotId:retained.id,snapshotCanonicalSha256:sha(serialized),
    informationCutoffAt:retained.informationCutoffAt,
    base:{sourceCommit:retained.base.sourceCommit,gitBlobSha:retained.base.gitBlobSha,
      sha256:retained.base.sourceHash,bytes:retained.base.bytes,collectedAt:retained.base.collectedAt,
      sourceUrl:retained.base.sourceUrl,publishedAt:retained.base.publishedAt,
      retrievedAt:before.retrievedAt,firstDate:before.firstDate,lastDate:before.lastDate},
    tail:{sha256:retained.tail.sourceHash,bytes:retained.tail.bytes,sourceUrl:retained.tail.sourceUrl,
      requestStartedAt:retained.tail.requestStartedAt,bodyCompletedAt:retained.tail.bodyCompletedAt,
      publishedAt:retained.tail.publishedAt,...rebuilt.merge},
    candidate:{file:'candidate.json',sha256:sha(candidateText),gitBlobSha:blob(candidateText),bytes:Buffer.byteLength(candidateText),
      firstDate:after.firstDate,lastDate:after.lastDate,retrievedAt:after.retrievedAt,
      requestedStart:after.requestedStart,requestedEnd:after.requestedEnd,candles:after.candles.length,
      primaryPricesHash:retained.primaryPricesHash,gapCount:after.gapCount,
      intervalsRefreshed:false,sourceCommit:null,committed:false},
    changes,capacity:{previous,candidate,
      requestBoundaryExtendedDays:(Date.parse(candidate.lastAcceptedRequestUtcDate)-Date.parse(previous.lastAcceptedRequestUtcDate))/DAY,
      nextRequest,requestPolicy:copy(P),limitsChanged:false},
    networkRequests:0,originalSnapshotChanged:false,operatingBaseChanged:false,
    newForecastRecords:0,newObservations:0,newCalibrationCases:0,
    historicalProviderAuthenticityProven:false,historicalVintagesProven:false,
    releaseAuthorized:false,productionPromoted:false,automaticPromotion:false,
    limitation:'A deterministic candidate derived from preserved raw inputs. Review and a separate commit are required before the committed-base reader can consume it. Existing row acquisition clocks and historical gaps remain. Non-daily interval snapshots are retained without refresh. No prediction, economic readiness, calibration result, provider authenticity or daily operation is established.'};
  return {snapshotId:retained.id,candidateText,receiptText:text(report),report};
}
