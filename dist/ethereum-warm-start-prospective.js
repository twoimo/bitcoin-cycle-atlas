import {canonicalForecastJson,forecastHash} from './forecast-records.js';
import {createForecastInformationClock,normalizeForecastTimestamp,selectPriceVintages} from './forecast-information-time.js';
import {latestCompletedAssetDate} from './asset-forecast-records.js';
import {buildIndependentBenchmarks} from './forecast-evaluation.js';
import {verifyEthereumResearchSnapshot,rebuildEthereumResearchPrices} from './ethereum-prospective-prices.js';
import {ETH_PROSPECTIVE_POLICY} from './ethereum-prospective-records.js';
import {ETH_WARM_START_POLICY,fitEthereumWarmStartModel,simulateEthereumWarmStart} from './ethereum-warm-start-model.js';

/** Separate record contract: adding this candidate must not change the frozen
 * adaptive/pooled model source graph, run keys or original issued bytes. */
export const ETH_WARM_START_PROSPECTIVE_POLICY=Object.freeze({
  ...ETH_PROSPECTIVE_POLICY,version:'eth-warm-start-prospective-record-1',modelKey:'warmStart',
  modelVersion:ETH_WARM_START_POLICY.version,legacyEvidenceTransferred:false,
});
export const ETH_WARM_START_PROSPECTIVE_ENTRY='dist/ethereum-prospective-dispatch.js';
const P=ETH_WARM_START_PROSPECTIVE_POLICY,HEX=/^[a-f0-9]{64}$/,COMMIT=/^[a-f0-9]{40}$/,DAY=86400000;
const json=canonicalForecastJson,copy=value=>JSON.parse(json(value)),positive=value=>Number.isFinite(value)&&value>0;
const day=(date,offset=0)=>new Date(Date.parse(date+'T00:00:00Z')+offset*DAY).toISOString().slice(0,10);
const closeAt=date=>new Date(Date.parse(date+'T00:00:00Z')+DAY).toISOString();
async function identity(source,evaluation=false){
  const version=evaluation?'eth-warm-start-prospective-evaluator-1':P.modelVersion;
  if(source?.version!==version||!COMMIT.test(source.sourceCommit)||!HEX.test(source.sourceHash)||
    !source.files||Array.isArray(source.files)||!Object.keys(source.files).length)
    throw new TypeError('Exact warm-start prospective source identity required');
  for(const [path,hash]of Object.entries(source.files))if(!/^dist\/[a-zA-Z0-9._/-]+\.js$/.test(path)||path.includes('..')||!HEX.test(hash))
    throw new TypeError('Invalid warm-start prospective source file');
  const required=[ETH_WARM_START_PROSPECTIVE_ENTRY,'dist/ethereum-warm-start-prospective.js',
    'dist/ethereum-warm-start-model.js','dist/ethereum-adaptive-model.js',
    'dist/ethereum-prospective-records.js','dist/ethereum-prospective-prices.js'];
  if(required.some(path=>!source.files[path])||await forecastHash(source.files)!==source.sourceHash)
    throw new Error('Warm-start prospective source graph/hash mismatch');
  return copy(source);
}

export function buildEthereumWarmStartProspectiveForecast({ethHistory,asOf,horizonDays=P.horizonDays,sampleCount=P.sampleCount,seed=P.seed}={}){
  const fit=fitEthereumWarmStartModel(ethHistory,asOf),simulation=simulateEthereumWarmStart(fit,{horizonDays,sampleCount,seed});
  return {symbol:'ETHUSD',asOf,researchModel:P.modelKey,displayEnd:simulation.path.at(-1).date,
    probability:null,calibrated:false,path:simulation.path,training:fit.training,metadata:simulation.metadata,
    assumptions:{policy:ETH_WARM_START_POLICY,seed,initializationChangesClassification:true,
      initializationChangesSampleComposition:true,singleComponentCausalEffectIdentified:false,
      economicInputsUsed:false,institutionalTargetsUsed:false,legacyEvidenceTransferred:false},
    warnings:[
      'Earlier prices initialize the full confirmation detector; only post-Merge returns and risk exposure enter fitted moments.',
      'The raw pointwise q10/q90 are not calibrated 80% coverage or a simultaneous path band.',
      'The representative path may leave the pointwise interval and is not the model median.',
      'This separately identified candidate does not inherit adaptive or pooled prospective performance.',
      'Initialization changes classification and sample composition; no fixed three-up/one-down law or causal improvement is established.',
    ]};
}

function normalizedOutput(forecast,snapshot){
  const m=forecast?.metadata,t=forecast?.training;
  if(forecast?.symbol!=='ETHUSD'||forecast.asOf!==snapshot.asOf||forecast.researchModel!==P.modelKey||
    forecast.probability!==null||forecast.calibrated!==false||m?.version!==P.modelVersion||
    m.horizonDays!==P.horizonDays||m.sampleCount!==P.sampleCount||m.seed!==P.seed||
    m.nominalPointwiseMass!==P.nominalPointwiseMass||m.calibrated!==false||m.probability!==null||
    m.productionPromoted!==false||m.parameterUncertaintyIncluded!==false||
    m.initializationChangesClassification!==true||m.initializationChangesSampleComposition!==true||
    m.singleComponentCausalEffectIdentified!==false||m.preMergeReturnsEstimated!==false||
    m.preMergeHazardExposureIncluded!==false)throw new RangeError('Warm-start candidate policy, initialization or probability claim mismatch');
  if(!Array.isArray(forecast.path)||forecast.path.length!==731||forecast.displayEnd!==day(snapshot.asOf,730))
    throw new RangeError('Full 731-point warm-start candidate path required');
  const rows=forecast.path.map((row,index)=>{
    if(row.date!==day(snapshot.asOf,index)||![row.baselinePrice,row.low,row.high,row.price].every(positive)||
      row.low>row.baselinePrice||row.baselinePrice>row.high)throw new RangeError('Invalid warm-start date or ordered positive quantiles');
    return [row.date,row.baselinePrice,row.low,row.high,row.price];
  });
  const anchor=snapshot.primaryPrices.at(-1)[1];
  if(rows[0].slice(1).some(value=>value!==anchor))throw new RangeError('All warm-start anchors must equal the observed input');
  if(t?.informationThrough!==snapshot.asOf||t.maxSourceDate!==snapshot.asOf||t.preMergeReturnsUsed!==0||t.preMergeRiskDaysUsed!==0||
    !t.initialization||typeof t.initialization.stateKnown!=='boolean'||t.initialization.boundaryDate!==t.firstObservation)
    throw new RangeError('Warm-start training and initialization must describe the actual origin and estimation boundary');
  return {columns:[...P.columns],path:rows,training:copy(t),simulation:copy(m),
    assumptions:copy(forecast.assumptions??{}),warnings:copy(forecast.warnings??[]),
    representativeContainmentRequired:false,
    bandMeaning:'Raw conditional pointwise Monte Carlo q10/q90; not scenario min/max, calibrated coverage or a simultaneous path band',
    medianMeaning:'Pointwise simulated median; not guaranteed to be an individually realizable trajectory',
    parameterUncertaintyIncluded:false,coverageGuarantee:false,probability:null,calibrated:false};
}

export async function createEthereumWarmStartProspectiveRecord({snapshot,forecast,model,modelKey=P.modelKey,generationStartedAt,generatedAt,issuedAt}={}){
  if(modelKey!==P.modelKey)throw new TypeError('Warm-start record requires its own model key');
  await verifyEthereumResearchSnapshot(snapshot);
  const started=normalizeForecastTimestamp(generationStartedAt),generated=normalizeForecastTimestamp(generatedAt),issued=normalizeForecastTimestamp(issuedAt);
  const cutoff=snapshot.informationCutoffAt;
  if(cutoff>started||started>generated||generated>issued)throw new RangeError('Warm-start collection, generation and issuance clocks are out of order');
  if([cutoff,issued].some(at=>latestCompletedAssetDate(at,'crypto')!==snapshot.asOf))
    throw new RangeError('Warm-start issuance requires the current completed UTC close; no backdating');
  const source=await identity(model),output=normalizedOutput(forecast,snapshot);
  const informationClock=createForecastInformationClock({issuedAt:issued,informationCutoffAt:cutoff,inputs:[
    {id:'base-archive',kind:'document',publishedAt:null,collectedAt:snapshot.base.collectedAt,sourceHash:snapshot.base.sourceHash,
      sourceUrl:snapshot.base.sourceUrl,vintageId:'git:'+snapshot.base.gitBlobSha},
    {id:'raw-tail',kind:'document',publishedAt:null,collectedAt:snapshot.tail.bodyCompletedAt,sourceHash:snapshot.tail.sourceHash,
      sourceUrl:snapshot.tail.sourceUrl,vintageId:'coinbase-tail:'+snapshot.tail.sourceHash+':'+snapshot.tail.bodyCompletedAt},
    {id:'verified-complete-prefix',kind:'crypto-daily',symbol:'ETHUSD',asOf:snapshot.asOf,sourceObservedThrough:snapshot.asOf,
      publishedAt:null,collectedAt:cutoff,sourceHash:snapshot.primaryPricesHash,sourceUrl:snapshot.tail.sourceUrl,vintageId:'verified-merge:'+snapshot.id},
  ]});
  const benchmarks=buildIndependentBenchmarks(snapshot.primaryPrices,{asOf:snapshot.asOf,horizons:[...P.horizons]});
  const targets=P.horizons.map(horizon=>{
    const row=output.path[horizon],baseline=benchmarks.targets.find(target=>target.horizonDays===horizon),eventAt=closeAt(row[0]);
    if(eventAt<=issued)throw new RangeError('Warm-start target has already completed');
    return {horizonDays:horizon,targetDate:row[0],eventAt,median:row[1],q10:row[2],q90:row[3],representative:row[4],
      flat:baseline.flat,shrunkenTrend:baseline.shrunkenTrend};
  });
  const options={horizonDays:P.horizonDays,sampleCount:P.sampleCount,seed:P.seed};
  const runKey=await forecastHash({modelKey,version:source.version,modelSourceHash:source.sourceHash,
    economicInputHash:snapshot.economicInputHash,options,horizons:P.horizons,recordPolicy:P.version});
  const body={schemaVersion:1,kind:'ethereum-prospective-record',recordPolicy:P.version,recordKind:'issued',modelKey,
    symbol:'ETHUSD',asOf:snapshot.asOf,snapshotId:snapshot.id,economicInputHash:snapshot.economicInputHash,
    informationCutoffAt:cutoff,informationClock,generationStartedAt:started,generatedAt:generated,issuedAt:issued,
    model:source,options,runKey,outputHash:await forecastHash(output),output,targets,benchmarks,
    firstPublishedAt:null,publicationScope:'draft-pr-research',productionAdopted:false,
    historicalVintagesProven:false,economicInputsUsed:false,institutionalTargetsUsed:false,calibrated:false,
    legacyEvidenceTransferred:false,prospectiveAccuracyProven:false,
    issuanceMeaning:'Actual warm-start candidate generation and immutable preservation; no inherited performance or production adoption'};
  return {id:await forecastHash(body),...body};
}
function forecastFromRecord(record){
  return {symbol:'ETHUSD',asOf:record.asOf,researchModel:record.modelKey,probability:null,calibrated:false,
    displayEnd:record.output.path.at(-1)[0],
    path:record.output.path.map(row=>({date:row[0],baselinePrice:row[1],low:row[2],high:row[3],price:row[4]})),
    metadata:record.output.simulation,training:record.output.training,assumptions:record.output.assumptions,warnings:record.output.warnings};
}
export async function verifyEthereumWarmStartProspectiveRecord(record,snapshot){
  if(record?.schemaVersion!==1||record.kind!=='ethereum-prospective-record'||record.modelKey!==P.modelKey||!HEX.test(record.id))
    throw new TypeError('Invalid warm-start prospective record');
  const expected=await createEthereumWarmStartProspectiveRecord({...record,snapshot,forecast:forecastFromRecord(record)});
  if(json(expected)!==json(record))throw new Error('Warm-start prospective record hash, output, clocks, target or metadata mismatch');
  return record;
}
export async function replayEthereumWarmStartProspectiveRecord({record,snapshot,currentModel}={}){
  await verifyEthereumWarmStartProspectiveRecord(record,snapshot);await identity(currentModel);
  if(currentModel.sourceHash!==record.model.sourceHash||currentModel.version!==record.model.version)
    throw new Error('Exact warm-start replay requires the same committed source graph');
  const prices=rebuildEthereumResearchPrices({baseText:snapshot.base.text,tailText:snapshot.tail.text,
    requestStartedAt:snapshot.tail.requestStartedAt,bodyCompletedAt:snapshot.tail.bodyCompletedAt,sourceUrl:snapshot.tail.sourceUrl});
  const forecast=buildEthereumWarmStartProspectiveForecast({ethHistory:prices.archive,asOf:record.asOf,...record.options});
  const regenerated=await createEthereumWarmStartProspectiveRecord({snapshot,forecast,model:record.model,modelKey:record.modelKey,
    generationStartedAt:record.generationStartedAt,generatedAt:record.generatedAt,issuedAt:record.issuedAt});
  if(regenerated.outputHash!==record.outputHash||regenerated.id!==record.id)
    throw new Error('Warm-start candidate differs from re-execution on its preserved raw inputs');
  return {modelKey:record.modelKey,id:record.id,outputHash:record.outputHash,points:regenerated.output.path.length,
    method:'models-reexecuted-from-own-preserved-base-and-tail',recordIdentityEqual:true};
}

export async function evaluateEthereumWarmStartProspectiveRecords({records,snapshots,observations=[],evaluatedAt,evaluator}={}){
  const at=normalizeForecastTimestamp(evaluatedAt);await identity(evaluator,true);
  if(!Array.isArray(records)||records.length>2000||new Set(records.map(record=>record.id)).size!==records.length||
    !Array.isArray(observations)||observations.length>500||new Set(observations.map(snapshot=>snapshot.id)).size!==observations.length)
    throw new TypeError('Unique bounded warm-start record and observation inputs required');
  const needed=new Set(records.flatMap(record=>record.targets.map(target=>target.targetDate))),prices=[];
  for(const snapshot of observations){
    await verifyEthereumResearchSnapshot(snapshot);
    for(const [date,price]of snapshot.primaryPrices)if(needed.has(date))prices.push({date,price,publishedAt:null,collectedAt:snapshot.informationCutoffAt,
      sourceObservedThrough:snapshot.asOf,sourceHash:snapshot.primaryPricesHash,sourceUrl:snapshot.tail.sourceUrl,vintageId:snapshot.id});
  }
  const selected=selectPriceVintages(prices,{symbol:'ETHUSD',market:'crypto',informationCutoffAt:at}),actuals=new Map(selected.rows.map(row=>[row.date,row]));
  const rows=[];
  for(const record of records){
    await verifyEthereumWarmStartProspectiveRecord(record,snapshots?.[record.snapshotId]);
    if(at<record.issuedAt)throw new RangeError('Warm-start candidate cannot be evaluated before actual issuance');
    for(const target of record.targets){
      const actual=actuals.get(target.targetDate),status=target.eventAt>at?'pending':!actual?'missing-observation':'scored';
      let scores=null,source=null;
      if(status==='scored'){
        const y=Math.log(actual.price),lower=Math.log(target.q10),upper=Math.log(target.q90);
        scores={absoluteLogError:Math.abs(Math.log(target.median)-y),flatAbsoluteLogError:Math.abs(Math.log(target.flat)-y),
          shrunkenTrendAbsoluteLogError:Math.abs(Math.log(target.shrunkenTrend)-y),covered:actual.price>=target.q10&&actual.price<=target.q90,
          logWidth:upper-lower,logIntervalScore:upper-lower+10*Math.max(0,lower-y)+10*Math.max(0,y-upper)};
        source={snapshotId:actual.vintageId,primaryPricesHash:actual.sourceHash,collectedAt:actual.collectedAt};
      }
      rows.push({recordId:record.id,modelKey:record.modelKey,modelSourceHash:record.model.sourceHash,asOf:record.asOf,
        horizonDays:target.horizonDays,targetDate:target.targetDate,eventAt:target.eventAt,status,actual:status==='scored'?actual.price:null,source,scores});
    }
  }
  const body={schemaVersion:1,kind:'ethereum-warm-start-prospective-evaluation',evaluatedAt:at,rows,
    recordIds:records.map(record=>record.id).sort(),observationIds:observations.map(snapshot=>snapshot.id).sort(),
    uniqueOrigins:new Set(records.map(record=>record.asOf)).size,records:records.length,
    pending:rows.filter(row=>row.status==='pending').length,missingObservations:rows.filter(row=>row.status==='missing-observation').length,
    scored:rows.filter(row=>row.status==='scored').length,independentMarketRegimes:null,legacyEvidenceTransferred:false,
    productionPromoted:false,coverageGuarantee:false,evaluator:copy(evaluator),futureObservationVintagesExcluded:selected.futureVersions};
  return {id:await forecastHash(body),...body};
}
