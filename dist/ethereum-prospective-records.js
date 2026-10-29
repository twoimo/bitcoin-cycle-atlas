import {canonicalForecastJson,forecastHash} from './forecast-records.js';
import {createForecastInformationClock,normalizeForecastTimestamp,selectPriceVintages} from './forecast-information-time.js';
import {latestCompletedAssetDate} from './asset-forecast-records.js';
import {buildIndependentBenchmarks} from './forecast-evaluation.js';
import {verifyEthereumResearchSnapshot,rebuildEthereumResearchPrices} from './ethereum-prospective-prices.js';
import {ETH_ADAPTIVE_POLICY,buildEthereumAdaptiveForecast} from './ethereum-adaptive-model.js';
import {ETH_POOLED_POLICY,buildEthereumPooledForecast} from './ethereum-pooled-model.js';

export const ETH_PROSPECTIVE_POLICY=Object.freeze({version:'eth-prospective-record-1',
  horizonDays:730,sampleCount:256,seed:20261027,horizons:Object.freeze([30,90,180]),
  nominalPointwiseMass:.8,columns:Object.freeze(['date','median','q10','q90','representative']),
  productionAdopted:false,minimumPromotionCases:30,coverageGuarantee:false});
const versions={adaptive:ETH_ADAPTIVE_POLICY.version,pooled:ETH_POOLED_POLICY.version};
const HEX=/^[a-f0-9]{64}$/,COMMIT=/^[a-f0-9]{40}$/,DAY=86400000;
const json=canonicalForecastJson,copy=x=>JSON.parse(json(x)),positive=x=>Number.isFinite(x)&&x>0;
const day=(date,offset=0)=>new Date(Date.parse(date+'T00:00:00Z')+offset*DAY).toISOString().slice(0,10);
const closeAt=date=>new Date(Date.parse(date+'T00:00:00Z')+DAY).toISOString();
async function identity(model,modelKey){
  if(!versions[modelKey]||model?.version!==versions[modelKey]||!COMMIT.test(model.sourceCommit)||!HEX.test(model.sourceHash)||
    !model.files||Array.isArray(model.files)||!Object.keys(model.files).length)throw new TypeError('Exact candidate model identity required');
  for(const [path,hash]of Object.entries(model.files))if(!/^dist\/[a-zA-Z0-9._/-]+\.js$/.test(path)||path.includes('..')||!HEX.test(hash))throw new TypeError('Invalid prospective model source');
  const required=['dist/ethereum-'+modelKey+'-model.js','dist/ethereum-prospective-records.js','dist/ethereum-prospective-prices.js'];
  if(required.some(p=>!model.files[p])||await forecastHash(model.files)!==model.sourceHash)throw new Error('Prospective source graph/hash mismatch');
  return copy(model);
}
function normalizedOutput(forecast,snapshot,modelKey){
  const p=ETH_PROSPECTIVE_POLICY,m=forecast?.metadata;
  if(forecast?.symbol!=='ETHUSD'||forecast.asOf!==snapshot.asOf||forecast.researchModel!==modelKey||
    forecast.probability!==null||forecast.calibrated!==false||m?.version!==versions[modelKey]||
    m.horizonDays!==p.horizonDays||m.sampleCount!==p.sampleCount||m.seed!==p.seed||
    m.nominalPointwiseMass!==p.nominalPointwiseMass||m.calibrated!==false||m.probability!==null||
    m.productionPromoted!==false||m.parameterUncertaintyIncluded!==false)throw new RangeError('Candidate policy, identity or probability claim mismatch');
  if(!Array.isArray(forecast.path)||forecast.path.length!==731||forecast.displayEnd!==day(snapshot.asOf,730))throw new RangeError('Full 731-point candidate path required');
  const rows=forecast.path.map((r,i)=>{
    if(r.date!==day(snapshot.asOf,i)||![r.baselinePrice,r.low,r.high,r.price].every(positive)||
      r.low>r.baselinePrice||r.baselinePrice>r.high)throw new RangeError('Invalid candidate date or ordered positive quantiles');
    return [r.date,r.baselinePrice,r.low,r.high,r.price];
  });
  const anchor=snapshot.primaryPrices.at(-1)[1];
  if(rows[0].slice(1).some(v=>v!==anchor))throw new RangeError('All candidate anchor values must equal the observed input');
  if(forecast.training?.informationThrough!==snapshot.asOf||forecast.training?.maxSourceDate!==snapshot.asOf)throw new RangeError('Training must stop at the actual origin');
  return {columns:[...p.columns],path:rows,training:copy(forecast.training),simulation:copy(m),
    assumptions:copy(forecast.assumptions??{}),warnings:copy(forecast.warnings??[]),
    representativeContainmentRequired:false,bandMeaning:'Raw conditional pointwise Monte Carlo q10/q90; not scenario min/max, calibrated coverage or a simultaneous path band',
    medianMeaning:'Pointwise simulated median; not guaranteed to be an individually realizable trajectory',
    parameterUncertaintyIncluded:false,coverageGuarantee:false,probability:null,calibrated:false};
}
export async function createEthereumProspectiveRecord({snapshot,forecast,model,modelKey,generationStartedAt,generatedAt,issuedAt}={}){
  await verifyEthereumResearchSnapshot(snapshot);
  const started=normalizeForecastTimestamp(generationStartedAt),generated=normalizeForecastTimestamp(generatedAt),issued=normalizeForecastTimestamp(issuedAt);
  const cutoff=snapshot.informationCutoffAt;
  if(cutoff>started||started>generated||generated>issued)throw new RangeError('Actual collection, generation and issuance clocks are out of order');
  if([cutoff,issued].some(at=>latestCompletedAssetDate(at,'crypto')!==snapshot.asOf))throw new RangeError('Prospective candidate requires the current completed UTC close; no backdating');
  const source=await identity(model,modelKey),output=normalizedOutput(forecast,snapshot,modelKey),policy=ETH_PROSPECTIVE_POLICY;
  const informationClock=createForecastInformationClock({issuedAt:issued,informationCutoffAt:cutoff,inputs:[
    {id:'base-archive',kind:'document',publishedAt:null,collectedAt:snapshot.base.collectedAt,sourceHash:snapshot.base.sourceHash,
      sourceUrl:snapshot.base.sourceUrl,vintageId:'git:'+snapshot.base.gitBlobSha},
    {id:'raw-tail',kind:'document',publishedAt:null,collectedAt:snapshot.tail.bodyCompletedAt,sourceHash:snapshot.tail.sourceHash,
      sourceUrl:snapshot.tail.sourceUrl,vintageId:'coinbase-tail:'+snapshot.tail.sourceHash+':'+snapshot.tail.bodyCompletedAt},
    {id:'verified-complete-prefix',kind:'crypto-daily',symbol:'ETHUSD',asOf:snapshot.asOf,sourceObservedThrough:snapshot.asOf,
      publishedAt:null,collectedAt:cutoff,sourceHash:snapshot.primaryPricesHash,sourceUrl:snapshot.tail.sourceUrl,
      vintageId:'verified-merge:'+snapshot.id},
  ]});
  const benchmarks=buildIndependentBenchmarks(snapshot.primaryPrices,{asOf:snapshot.asOf,horizons:[...policy.horizons]});
  const targets=policy.horizons.map(h=>{
    const row=output.path[h],b=benchmarks.targets.find(t=>t.horizonDays===h),eventAt=closeAt(row[0]);
    if(eventAt<=issued)throw new RangeError('Prospective target has already completed');
    return {horizonDays:h,targetDate:row[0],eventAt,median:row[1],q10:row[2],q90:row[3],representative:row[4],
      flat:b.flat,shrunkenTrend:b.shrunkenTrend};
  });
  const options={horizonDays:policy.horizonDays,sampleCount:policy.sampleCount,seed:policy.seed};
  const runKey=await forecastHash({modelKey,version:model.version,modelSourceHash:model.sourceHash,
    economicInputHash:snapshot.economicInputHash,options,horizons:policy.horizons,recordPolicy:policy.version});
  const body={schemaVersion:1,kind:'ethereum-prospective-record',recordPolicy:policy.version,recordKind:'issued',modelKey,
    symbol:'ETHUSD',asOf:snapshot.asOf,snapshotId:snapshot.id,economicInputHash:snapshot.economicInputHash,
    informationCutoffAt:cutoff,informationClock,generationStartedAt:started,generatedAt:generated,issuedAt:issued,
    model:source,options,runKey,outputHash:await forecastHash(output),output,targets,benchmarks,
    firstPublishedAt:null,publicationScope:'draft-pr-research',productionAdopted:false,
    historicalVintagesProven:false,economicInputsUsed:false,institutionalTargetsUsed:false,calibrated:false,
    prospectiveAccuracyProven:false,issuanceMeaning:'Actual candidate generation and immutable preservation; no production adoption'};
  return {id:await forecastHash(body),...body};
}
function forecastFromRecord(record){
  return {symbol:'ETHUSD',asOf:record.asOf,researchModel:record.modelKey,probability:null,calibrated:false,
    displayEnd:record.output.path.at(-1)[0],
    path:record.output.path.map(r=>({date:r[0],baselinePrice:r[1],low:r[2],high:r[3],price:r[4]})),
    metadata:record.output.simulation,training:record.output.training,assumptions:record.output.assumptions,warnings:record.output.warnings};
}
export async function verifyEthereumProspectiveRecord(record,snapshot){
  if(record?.schemaVersion!==1||record.kind!=='ethereum-prospective-record'||!HEX.test(record.id))throw new TypeError('Invalid prospective record');
  const expected=await createEthereumProspectiveRecord({...record,snapshot,forecast:forecastFromRecord(record)});
  if(json(expected)!==json(record))throw new Error('Prospective record hash, output, clocks, target or metadata mismatch');
  return record;
}
export function decideEthereumProspectiveAppend(records,candidate){
  const matches=records.filter(r=>r.runKey===candidate.runKey);
  if(matches.length>1)throw new Error('Duplicate immutable candidate run');
  if(!matches.length)return {action:'append',record:candidate};
  if(matches[0].outputHash!==candidate.outputHash)throw new Error('Same economic candidate run produced a different output');
  return {action:'reuse',record:matches[0]};
}
export function ethereumProspectiveIndexEntry(record){
  return {id:record.id,runKey:record.runKey,modelKey:record.modelKey,modelVersion:record.model.version,modelSourceHash:record.model.sourceHash,
    asOf:record.asOf,issuedAt:record.issuedAt,snapshotId:record.snapshotId,
    recordPath:'records/'+record.id+'.json',snapshotPath:'snapshots/'+record.snapshotId+'.json'};
}
/** Separate candidate evaluator. A cache cannot supply an actual or a score. */
export async function evaluateEthereumProspectiveRecords({records,snapshots,observations=[],evaluatedAt,evaluator}={}){
  const at=normalizeForecastTimestamp(evaluatedAt);
  if(evaluator?.version!=='eth-prospective-evaluator-1'||!COMMIT.test(evaluator.sourceCommit)||!HEX.test(evaluator.sourceHash)||
    !evaluator.files||!evaluator.files['dist/ethereum-prospective-records.js']||!evaluator.files['dist/ethereum-prospective-prices.js'])throw new TypeError('Committed prospective evaluator identity required');
  for(const [path,hash]of Object.entries(evaluator.files))if(!/^dist\/[a-zA-Z0-9._/-]+\.js$/.test(path)||path.includes('..')||!HEX.test(hash))throw new TypeError('Invalid evaluator source file');
  if(await forecastHash(evaluator.files)!==evaluator.sourceHash)throw new Error('Evaluator source hash mismatch');
  if(!Array.isArray(records)||records.length>2000||new Set(records.map(r=>r.id)).size!==records.length||
    !Array.isArray(observations)||observations.length>500||new Set(observations.map(s=>s.id)).size!==observations.length)throw new TypeError('Unique bounded candidate and observation inputs required');
  const needed=new Set(records.flatMap(r=>r.targets.map(t=>t.targetDate))),prices=[],observed=new Map();
  for(const input of observations){
    await verifyEthereumResearchSnapshot(input);observed.set(input.id,input);
    for(const [date,price]of input.primaryPrices)if(needed.has(date))prices.push({date,price,publishedAt:null,collectedAt:input.informationCutoffAt,
      sourceObservedThrough:input.asOf,sourceHash:input.primaryPricesHash,sourceUrl:input.tail.sourceUrl,vintageId:input.id});
  }
  const selected=selectPriceVintages(prices,{symbol:'ETHUSD',market:'crypto',informationCutoffAt:at}),actuals=new Map(selected.rows.map(r=>[r.date,r]));
  const rows=[];
  for(const record of records){
    const snapshot=snapshots?.[record.snapshotId];
    await verifyEthereumProspectiveRecord(record,snapshot);
    if(at<record.issuedAt)throw new RangeError('Candidate cannot be evaluated before actual issuance');
    for(const target of record.targets){
      const actual=actuals.get(target.targetDate);
      const status=target.eventAt>at?'pending':!actual?'missing-observation':'scored';
      let scores=null,source=null;
      if(status==='scored'){
        const y=Math.log(actual.price),l=Math.log(target.q10),u=Math.log(target.q90);
        const error=Math.abs(Math.log(target.median)-y),flatError=Math.abs(Math.log(target.flat)-y);
        scores={absoluteLogError:error,flatAbsoluteLogError:flatError,
          shrunkenTrendAbsoluteLogError:Math.abs(Math.log(target.shrunkenTrend)-y),
          covered:actual.price>=target.q10&&actual.price<=target.q90,logWidth:u-l,
          logIntervalScore:u-l+10*Math.max(0,l-y)+10*Math.max(0,y-u)};
        source={snapshotId:actual.vintageId,primaryPricesHash:actual.sourceHash,collectedAt:actual.collectedAt};
      }
      rows.push({recordId:record.id,modelKey:record.modelKey,modelSourceHash:record.model.sourceHash,asOf:record.asOf,
        horizonDays:target.horizonDays,targetDate:target.targetDate,eventAt:target.eventAt,status,
        actual:status==='scored'?actual.price:null,source,scores});
    }
  }
  const body={schemaVersion:1,kind:'ethereum-prospective-evaluation',evaluatedAt:at,rows,
    recordIds:records.map(r=>r.id).sort(),observationIds:observations.map(s=>s.id).sort(),
    uniqueOrigins:new Set(records.map(r=>r.asOf)).size,records:records.length,
    pending:rows.filter(r=>r.status==='pending').length,missingObservations:rows.filter(r=>r.status==='missing-observation').length,
    scored:rows.filter(r=>r.status==='scored').length,independentMarketRegimes:null,productionPromoted:false,coverageGuarantee:false,
    evaluator:copy(evaluator),futureObservationVintagesExcluded:selected.futureVersions};
  return {id:await forecastHash(body),...body};
}

/** Regenerate from this record's retained source bytes, never an in-memory output cache. */
export async function replayEthereumProspectiveRecord({record,snapshot,currentModel}={}){
  await verifyEthereumProspectiveRecord(record,snapshot);
  await identity(currentModel,record.modelKey);
  if(currentModel.sourceHash!==record.model.sourceHash||currentModel.version!==record.model.version)throw new Error('Exact candidate replay requires the same committed model source');
  const prices=rebuildEthereumResearchPrices({baseText:snapshot.base.text,tailText:snapshot.tail.text,
    requestStartedAt:snapshot.tail.requestStartedAt,bodyCompletedAt:snapshot.tail.bodyCompletedAt,sourceUrl:snapshot.tail.sourceUrl});
  const builder=record.modelKey==='adaptive'?buildEthereumAdaptiveForecast:buildEthereumPooledForecast;
  const forecast=builder({ethHistory:prices.archive,asOf:record.asOf,...record.options});
  const regenerated=await createEthereumProspectiveRecord({snapshot,forecast,model:record.model,modelKey:record.modelKey,
    generationStartedAt:record.generationStartedAt,generatedAt:record.generatedAt,issuedAt:record.issuedAt});
  if(regenerated.outputHash!==record.outputHash||regenerated.id!==record.id)throw new Error('Candidate differs from re-execution on its preserved raw inputs');
  return {modelKey:record.modelKey,id:record.id,outputHash:record.outputHash,points:regenerated.output.path.length,
    method:'models-reexecuted-from-own-preserved-base-and-tail',recordIdentityEqual:true};
}
