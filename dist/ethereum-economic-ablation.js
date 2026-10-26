import {buildEthereumEconomicCandidate,ETH_ECONOMIC_FEATURES} from './ethereum-economic-model.js';
import {utcDay,dateFromDay} from './cycle-engine.js?v=1.29.0';

/**
 * Matched rolling-origin feature ablations. Both full and reduced regressions
 * are fit at the same origin by the actual candidate's existing refit path.
 * Target prices are used only after prediction and only by the evaluation time.
 */
export const ETH_ABLATION_POLICY=Object.freeze({
  version:'eth-matched-economic-ablation-1',horizons:Object.freeze([30,90,180]),
  actualHistoricalIssuanceRequiredForProspectiveClaim:true,
  multipleTestingCorrection:null,defaultPromotionAllowed:false,
});
const DAY=86400000;
const closeAt=d=>new Date((utcDay(d)+1)*DAY).toISOString();
function stamp(value,label){
  if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/.test(value))throw new TypeError(label+' must be an explicit UTC timestamp');
  utcDay(value.slice(0,10));
  if(+value.slice(11,13)>23||+value.slice(14,16)>59||+value.slice(17,19)>59)throw new RangeError('Invalid '+label);
  const t=Date.parse(value);if(!Number.isFinite(t))throw new RangeError('Invalid '+label);return t;
}
function targetIndex(rows,cutoff){
  if(!Array.isArray(rows))throw new TypeError('Price observations must be an array');
  const map=new Map(),identities=new Map();
  for(const row of rows){
    if(!row||typeof row!=='object'||Array.isArray(row))throw new TypeError('Target prices need receipt-bearing rows');
    const d=utcDay(row.date);
    // An unknown publication or collection time cannot become a scored result.
    if(row.publishedAt===undefined||row.publishedAt===null||row.collectedAt===undefined||row.collectedAt===null)continue;
    const published=stamp(row.publishedAt,'target publishedAt'),collected=stamp(row.collectedAt,'target collectedAt');
    if(published>cutoff||collected>cutoff)continue;
    if(published<(d+1)*DAY||collected<published)throw new RangeError('Target receipt predates its completed observation');
    const price=row.price??row.close;
    if(!Number.isFinite(price)||price<=0||typeof row.vintageId!=='string'||!row.vintageId||
      !/^([a-f0-9]{40}|[a-f0-9]{64})$/.test(row.sourceHash)||!/^https:\/\/[^\s]+$/.test(row.sourceUrl))throw new TypeError('Target price requires a valid price, immutable vintage and source');
    const signature=JSON.stringify([price,published,collected,row.sourceHash,row.sourceUrl]),key=row.date+'|'+row.vintageId;
    if(identities.has(key)&&identities.get(key)!==signature)throw new RangeError('Conflicting target vintage');
    identities.set(key,signature);
    const versions=map.get(row.date)??[];
    const tie=versions.find(v=>v.published===published&&v.collected===collected);
    if(tie&&(tie.signature!==signature||tie.vintageId!==row.vintageId))throw new RangeError('Ambiguous target vintage');
    if(!versions.some(v=>v.vintageId===row.vintageId))versions.push({price,published,collected,vintageId:row.vintageId,sourceHash:row.sourceHash,sourceUrl:row.sourceUrl,signature});
    map.set(row.date,versions);
  }
  for(const [date,versions] of map)map.set(date,versions.sort((a,b)=>a.published-b.published||a.collected-b.collected).at(-1));
  return map;
}
const mean=xs=>xs.length?xs.reduce((a,b)=>a+b,0)/xs.length:null;
function disjoint(rows){
  let end=-Infinity;
  return rows.filter(r=>{if(utcDay(r.origin)<end)return false;end=utcDay(r.targetDate);return true;});
}
function scores(rows){
  const full=mean(rows.map(r=>r.fullAbsoluteLogError)),reduced=mean(rows.map(r=>r.reducedAbsoluteLogError));
  return {n:rows.length,fullMeanAbsoluteLogError:full,reducedMeanAbsoluteLogError:reduced,
    meanAbsoluteLogErrorReduction:full===null?null:reduced-full,
    addedFeatureSkill:reduced!==null&&reduced>0?1-full/reduced:null,
    firstOrigin:rows[0]?.origin??null,lastOrigin:rows.at(-1)?.origin??null};
}
export function runEthereumEconomicAblations({
  ethRows=[],btcRows=[],economicSnapshots=[],asOf,origins=[],horizons=[30,90,180],
  issuedAtByOrigin={},evaluatedAt,
}={}){
  const asOfDay=utcDay(asOf),evaluationAt=evaluatedAt??closeAt(asOf),evaluationCutoff=stamp(evaluationAt,'evaluatedAt');
  if(evaluationCutoff<(asOfDay+1)*DAY)throw new RangeError('Evaluation precedes the completed asOf day');
  if(!Array.isArray(origins)||new Set(origins).size!==origins.length||origins.some(d=>utcDay(d)>asOfDay))throw new RangeError('Origins must be distinct completed dates at or before asOf');
  if(!Array.isArray(horizons)||!horizons.length||new Set(horizons).size!==horizons.length||horizons.some(h=>!ETH_ABLATION_POLICY.horizons.includes(h)))throw new RangeError('Unsupported ablation horizon');
  if(!issuedAtByOrigin||typeof issuedAtByOrigin!=='object'||Array.isArray(issuedAtByOrigin))throw new TypeError('Issue times must be mapped by origin');
  const ordered=[...origins].sort(),cases=[],originStates=[];
  // No full snapshots means there is no fitted full or reduced economic model.
  // Do not turn missing economic evidence into a price-only ablation result.
  if(!Array.isArray(economicSnapshots))throw new TypeError('Economic snapshots must be an array');
  const ethTargets=economicSnapshots.length?targetIndex(ethRows,evaluationCutoff):new Map();
  const btcTargets=economicSnapshots.length?targetIndex(btcRows,evaluationCutoff):new Map();
  for(const origin of ordered){
    const suppliedIssue=issuedAtByOrigin[origin];
    const actualIssueTimeSupplied=suppliedIssue!==undefined;
    if(actualIssueTimeSupplied&&typeof suppliedIssue!=='string')throw new TypeError('Explicit origin issue time must be a timestamp string');
    const issuedAt=actualIssueTimeSupplied?suppliedIssue:closeAt(origin),cutoff=stamp(issuedAt,'issuedAt');
    if(cutoff>evaluationCutoff)throw new RangeError('Origin issue time exceeds evaluation time');
    const completedAt=Date.parse(closeAt(origin));
    if(cutoff<completedAt||cutoff>=completedAt+DAY)throw new RangeError('Origin issue time must be within the UTC day after its completed close');
    const candidate=buildEthereumEconomicCandidate({ethRows,btcRows,economicSnapshots,asOf:origin,horizons,issuedAt});
    originStates.push({origin,issuedAt,actualIssueTimeSupplied,status:candidate.status,reason:candidate.reason??null,
      currentInput:candidate.currentInput??null,training:candidate.training??[]});
    for(const horizonDays of horizons){
      const prediction=candidate.predictions?.find(p=>p.horizonDays===horizonDays&&p.status==='ready');
      const ablation=candidate.ablations?.find(a=>a.horizonDays===horizonDays);
      const targetDate=dateFromDay(utcDay(origin)+horizonDays),targetEth=ethTargets.get(targetDate),targetBtc=btcTargets.get(targetDate);
      for(const feature of ETH_ECONOMIC_FEATURES){
        const reduced=ablation?.features.find(f=>f.id===feature.id);
        for(const target of ['ETH/USD','ETH/BTC']){
          const pending=utcDay(targetDate)>asOfDay||Date.parse(closeAt(targetDate))>evaluationCutoff;
          const actual=target==='ETH/USD'?targetEth?.price:targetEth&&targetBtc?targetEth.price/targetBtc.price:null;
          const anchor=target==='ETH/USD'?candidate.currentInput?.observedEthUsd:candidate.currentInput?.observedEthBtc;
          const fullPrediction=target==='ETH/USD'?prediction?.price:prediction?.ethBtcRatio;
          const reducedLogReturn=target==='ETH/USD'?reduced?.logReturnWithoutFeature:
            prediction&&reduced?prediction.relativeLogReturn-reduced.relativeLogReturnDifference:null;
          const reducedPrediction=anchor>0&&Number.isFinite(reducedLogReturn)?anchor*Math.exp(reducedLogReturn):null;
          const eligiblePrediction=Number.isFinite(fullPrediction)&&fullPrediction>0&&Number.isFinite(reducedPrediction)&&reducedPrediction>0;
          const status=!eligiblePrediction?'unavailable':pending?'pending':Number.isFinite(actual)&&actual>0?'scored':'target-unavailable';
          cases.push({origin,issuedAt,actualIssueTimeSupplied,targetDate,horizonDays,target,
            unit:target==='ETH/USD'?'USD per ETH':'BTC per ETH',feature:feature.id,status,
            fullPrediction:eligiblePrediction?fullPrediction:null,reducedPrediction:eligiblePrediction?reducedPrediction:null,
            actual:status==='scored'?actual:null,
            fullAbsoluteLogError:status==='scored'?Math.abs(Math.log(fullPrediction)-Math.log(actual)):null,
            reducedAbsoluteLogError:status==='scored'?Math.abs(Math.log(reducedPrediction)-Math.log(actual)):null,
            targetSources:status==='scored'?{eth:{vintageId:targetEth.vintageId,sourceHash:targetEth.sourceHash},btc:target==='ETH/BTC'?{vintageId:targetBtc.vintageId,sourceHash:targetBtc.sourceHash}:null}:null,
            reason:status==='unavailable'?candidate.reason??'This horizon or feature refit is unavailable':status==='target-unavailable'?'No target vintage was published and collected by evaluation time':null});
        }
      }
    }
  }
  const summaries=[];
  for(const horizonDays of horizons)for(const target of ['ETH/USD','ETH/BTC'])for(const feature of ETH_ECONOMIC_FEATURES){
    const selected=cases.filter(r=>r.horizonDays===horizonDays&&r.target===target&&r.feature===feature.id),paired=selected.filter(r=>r.status==='scored');
    summaries.push({horizonDays,target,feature:feature.id,overlapping:scores(paired),disjoint:scores(disjoint(paired)),
      pending:selected.filter(r=>r.status==='pending').length,unavailable:selected.filter(r=>r.status==='unavailable').length,targetUnavailable:selected.filter(r=>r.status==='target-unavailable').length,
      independentMarketRegimes:null,pValue:null,causalEffect:false});
  }
  return {kind:'ethereum-economic-out-of-sample-ablation',policy:ETH_ABLATION_POLICY,asOf,evaluatedAt:evaluationAt,
    status:cases.some(r=>r.status==='scored')?'retrospective-results':'unavailable',
    economicSnapshotsProvided:economicSnapshots.length,uniqueOrigins:ordered.length,originStates,cases,summaries,
    prospectiveScoredTargets:0,defaultEligible:false,
    interpretation:'Each reduced model is refit using the same eligible training origins and training-only standardization as the full model. Only later eligible outcomes are scored. Positive addedFeatureSkill means the full model had smaller matched error; it is not a causal effect.',
    limitations:['Supplied receipt fields do not independently authenticate historical public availability.',
      'This rolling-origin replay is not a history of actually issued forecasts. Missing issue times use an explicit next-UTC-midnight policy.',
      'Nonoverlapping target intervals can share regimes; thirteen related ablations are not independent hypothesis tests.',
      'No p-values, multiple-testing-adjusted discovery, calibrated probabilities or default-model promotion is asserted.'],
  };
}
