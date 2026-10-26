// All dates, prices, acquisition clocks and model identities in this helper
// are synthetic test fixtures, never historical or prospective market evidence.
import {forecastHash} from '../../dist/forecast-records.js';
import {createForecastInformationClock} from '../../dist/forecast-information-time.js';
import {assetSourceHash,createAssetForecastSnapshot,createAssetForecastRecord} from '../../dist/asset-forecast-records.js';
import {ASSET_OUTCOME_VERSION} from '../../dist/asset-outcome-records.js';
const DAY=86400000;
export const fixtureDay=(start,offset)=>new Date(Date.parse(start+'T00:00:00Z')+offset*DAY).toISOString().slice(0,10);
const candle=(date,price)=>({date:date+'T00:00:00Z',sessionDate:date,time:Date.parse(date+'T00:00:00Z')/1000,open:price,high:price,low:price,close:price,volume:10});
export function syntheticOutcomeSource(symbol,prices,{retrievedAt='2026-11-25T00:30:00.000Z'}={}){
  const candles=prices.map(([date,price])=>candle(date,price));
  if(symbol==='ETHUSD')return JSON.stringify({source:'Coinbase Exchange',product:'ETH-USD',completedOnly:true,retrievedAt,candles,
    dailyHistory:{source:'Coinbase Exchange',product:'ETH-USD',completedOnly:true,retrievedAt,candles}});
  return JSON.stringify({version:1,source:'Yahoo Finance',symbol,product:symbol,assetClass:'equity',currency:'USD',
    exchangeTimezone:'America/New_York',adjustment:'provider-split-adjusted-ohlc',completedOnly:true,retrievedAt,
    firstDate:candles[0].date,lastDate:candles.at(-1).date,candles});
}
const files={'dist/synthetic-outcome-fixture.js':'a'.repeat(64)};
export const syntheticOutcomeEvaluator={version:ASSET_OUTCOME_VERSION,sourceCommit:'b'.repeat(40),sourceHash:await forecastHash(files),files};
export async function syntheticIssuedRecord(symbol='ETHUSD',{recordKind='issued',horizons=[30,90,180]}={}){
  if(!['ETHUSD','BMNR'].includes(symbol))throw new Error('Fixture supports ETHUSD and BMNR only');
  const issuedAt='2026-10-26T10:00:00.000Z',asOf=symbol==='ETHUSD'?'2026-10-25':'2026-10-23';
  const ethPrices=Array.from({length:25},(_,i)=>[fixtureDay('2026-10-01',i),2000+i]);
  const sourceDocuments={'eth-price':syntheticOutcomeSource('ETHUSD',ethPrices,{retrievedAt:'2026-10-26T09:00:00.000Z'})};
  const equityPrices=[['2026-10-21',22],['2026-10-22',23],['2026-10-23',24]];
  if(symbol==='BMNR'){
    sourceDocuments['equity-price']=syntheticOutcomeSource(symbol,equityPrices,{retrievedAt:'2026-10-26T09:00:00.000Z'});
    sourceDocuments['treasury-research']='Synthetic fixture, not a financial filing.';
  }
  const inputs=[];
  for(const [id,sourceDocument]of Object.entries(sourceDocuments)){
    const document=id==='treasury-research',equity=id==='equity-price';
    inputs.push({id,kind:document?'document':equity?'equity-session':'crypto-daily',
      ...(document?{}:{symbol:equity?'BMNR':'ETHUSD',asOf,sourceObservedThrough:equity?'2026-10-23':'2026-10-25'}),
      publishedAt:null,collectedAt:issuedAt,sourceHash:await assetSourceHash(sourceDocument),
      sourceUrl:'https://example.invalid/synthetic/'+id,vintageId:'synthetic-outcome-forecast-input'});
  }
  const informationClock=createForecastInformationClock({issuedAt,inputs});
  const primaryPrices=symbol==='ETHUSD'?ethPrices:equityPrices;
  const snapshot=await createAssetForecastSnapshot({symbol,asOf,informationClock,inputs:{sourceDocuments,primaryPrices,
    ...(symbol==='BMNR'?{underlyingPrices:ethPrices.filter(row=>row[0]<=asOf)}:{})}});
  const anchor=primaryPrices.at(-1)[1];
  const forecast={symbol,asOf,scenario:{id:'base',label:'Synthetic outcome test'},displayEnd:fixtureDay(asOf,200),
    path:Array.from({length:201},(_,i)=>{const price=anchor*Math.exp(i*.001);return {date:fixtureDay(asOf,i),price,low:price*.9,high:price*1.1,baselinePrice:price};})};
  const record=await createAssetForecastRecord({snapshot,forecast,model:{...syntheticOutcomeEvaluator,version:'synthetic-issued-path'},recordKind,horizons});
  return {record,snapshot};
}
export const emptyOutcomeArchive=()=>({index:{schemaVersion:1,kind:'atlas-asset-outcome-index',observations:[],evaluations:[],latestEvaluationId:null},snapshots:{},evaluations:{},texts:new Map()});
