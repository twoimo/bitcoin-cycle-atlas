import {canonicalForecastJson,forecastHash} from './forecast-records.js';
import {selectPriceVintages} from './forecast-information-time.js';
import {
  createEthereumProspectiveRecord as legacyCreate,verifyEthereumProspectiveRecord as legacyVerify,
  replayEthereumProspectiveRecord as legacyReplay,evaluateEthereumProspectiveRecords as legacyEvaluate,
} from './ethereum-prospective-records.js';
import {
  ETH_WARM_START_PROSPECTIVE_POLICY,createEthereumWarmStartProspectiveRecord,verifyEthereumWarmStartProspectiveRecord,
  replayEthereumWarmStartProspectiveRecord,evaluateEthereumWarmStartProspectiveRecords,
} from './ethereum-warm-start-prospective.js';
export {ethereumProspectiveIndexEntry,decideEthereumProspectiveAppend} from './ethereum-prospective-records.js';
const key=ETH_WARM_START_PROSPECTIVE_POLICY.modelKey;

// Unknown model keys still reach the original fail-closed identity check.
export const createEthereumProspectiveRecord=args=>args?.modelKey===key?createEthereumWarmStartProspectiveRecord(args):legacyCreate(args);
export const verifyEthereumProspectiveRecord=(record,snapshot)=>record?.modelKey===key?
  verifyEthereumWarmStartProspectiveRecord(record,snapshot):legacyVerify(record,snapshot);
export const replayEthereumProspectiveRecord=args=>args?.record?.modelKey===key?
  replayEthereumWarmStartProspectiveRecord(args):legacyReplay(args);

/** Legacy-only evaluation is the original function without changed parameters.
 * Mixed evaluation retains both full component receipts and original row order;
 * each record is verified/scored by its own versioned contract. */
export async function evaluateEthereumProspectiveRecords(args={}){
  const {records,snapshots,observations=[],evaluatedAt,evaluator,warmStartEvaluator}=args;
  if(!Array.isArray(records)||!records.some(record=>record.modelKey===key))return legacyEvaluate(args);
  if(records.length>2000||new Set(records.map(record=>record.id)).size!==records.length||
    !Array.isArray(observations)||observations.length>500||new Set(observations.map(snapshot=>snapshot.id)).size!==observations.length)
    throw new TypeError('Unique bounded mixed prospective record and observation inputs required');
  const legacy=records.filter(record=>record.modelKey!==key),warm=records.filter(record=>record.modelKey===key),components=[];
  if(legacy.length)components.push(await legacyEvaluate({records:legacy,snapshots,observations,evaluatedAt,evaluator}));
  const warmed=await evaluateEthereumWarmStartProspectiveRecords({records:warm,snapshots,observations,evaluatedAt,evaluator:warmStartEvaluator});
  components.push(warmed);
  const byId=new Map();
  for(const component of components)for(const row of component.rows){
    if(!byId.has(row.recordId))byId.set(row.recordId,[]);byId.get(row.recordId).push(row);
  }
  const rows=records.flatMap(record=>byId.get(record.id));
  const needed=new Set(rows.map(row=>row.targetDate)),prices=[];
  for(const snapshot of observations)for(const [date,price]of snapshot.primaryPrices)if(needed.has(date))prices.push({date,price,publishedAt:null,
    collectedAt:snapshot.informationCutoffAt,sourceObservedThrough:snapshot.asOf,sourceHash:snapshot.primaryPricesHash,
    sourceUrl:snapshot.tail.sourceUrl,vintageId:snapshot.id});
  const selected=selectPriceVintages(prices,{symbol:'ETHUSD',market:'crypto',informationCutoffAt:warmed.evaluatedAt});
  const body={schemaVersion:1,kind:'ethereum-prospective-evaluation',evaluatedAt:warmed.evaluatedAt,rows,
    recordIds:records.map(record=>record.id).sort(),observationIds:observations.map(snapshot=>snapshot.id).sort(),
    uniqueOrigins:new Set(records.map(record=>record.asOf)).size,records:records.length,
    pending:rows.filter(row=>row.status==='pending').length,missingObservations:rows.filter(row=>row.status==='missing-observation').length,
    scored:rows.filter(row=>row.status==='scored').length,independentMarketRegimes:null,productionPromoted:false,coverageGuarantee:false,
    evaluator:{...JSON.parse(canonicalForecastJson(warmStartEvaluator)),version:'eth-prospective-dispatch-evaluator-1'},
    componentEvaluations:components,legacyEvidenceTransferred:false,
    futureObservationVintagesExcluded:selected.futureVersions};
  return {id:await forecastHash(body),...body};
}
