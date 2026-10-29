// Synthetic Coinbase-shaped input and source identities for schema/clock tests.
import {createHash} from 'node:crypto';
import {forecastHash} from '../../dist/forecast-records.js';
import {planEthereumResearchPriceRequest,createEthereumResearchSnapshot} from '../../dist/ethereum-prospective-prices.js';
import {createEthereumProspectiveRecord} from '../../dist/ethereum-prospective-records.js';
const DAY=86400000,first=Date.parse('2024-01-01T00:00:00Z');
export async function prospectiveFixture(){
  const candles=Array.from({length:800},(_,i)=>{const time=(first+i*DAY)/1000;
    return {time,date:new Date(time*1000).toISOString(),open:100,high:110,low:90,close:100,volume:10};});
  const end=first+800*DAY,baseText=JSON.stringify({version:1,source:'Coinbase Exchange',product:'ETH-USD',
    dailyHistory:{source:'Coinbase Exchange',product:'ETH-USD',interval:'daily',seconds:86400,completedOnly:true,
      requestedStart:first/1000,requestedEnd:end/1000,retrievedAt:new Date(end+3600000).toISOString(),
      sourceUrls:[],candles}});
  const requestStartedAt=new Date(end+DAY+2*3600000).toISOString(),bodyCompletedAt=new Date(end+DAY+2*3600000+1000).toISOString();
  const request=planEthereumResearchPriceRequest(baseText,requestStartedAt);
  const raw=Array.from({length:8},(_,i)=>[request.requestedStart+i*86400,90,110,100,100,10]).reverse();
  const base={text:baseText,sourceCommit:'a'.repeat(40),
    gitBlobSha:createHash('sha1').update('blob '+Buffer.byteLength(baseText)+'\0').update(baseText).digest('hex'),
    collectedAt:new Date(Date.parse(requestStartedAt)-1000).toISOString()};
  const tail={text:JSON.stringify(raw),requestStartedAt,bodyCompletedAt,sourceUrl:request.sourceUrl};
  const snapshot=await createEthereumResearchSnapshot({base,tail}),asOf=snapshot.asOf;
  const forecast={symbol:'ETHUSD',asOf,researchModel:'adaptive',probability:null,calibrated:false,
    displayEnd:new Date(Date.parse(asOf+'T00:00:00Z')+730*DAY).toISOString().slice(0,10),
    path:Array.from({length:731},(_,i)=>({date:new Date(Date.parse(asOf+'T00:00:00Z')+i*DAY).toISOString().slice(0,10),
      baselinePrice:100,low:i?80:100,high:i?120:100,price:i?180:100})),
    training:{informationThrough:asOf,maxSourceDate:asOf},
    metadata:{version:'eth-adaptive-research-1',horizonDays:730,sampleCount:256,seed:20261027,nominalPointwiseMass:.8,
      calibrated:false,probability:null,productionPromoted:false,parameterUncertaintyIncluded:false},
    assumptions:{syntheticSchemaFixture:true},warnings:['Synthetic; not actual forecast accuracy']};
  const files=Object.fromEntries(['dist/ethereum-adaptive-model.js','dist/ethereum-prospective-records.js','dist/ethereum-prospective-prices.js'].map(p=>[p,'b'.repeat(64)]));
  const identity={sourceCommit:'c'.repeat(40),files,sourceHash:await forecastHash(files)};
  const model={...identity,version:'eth-adaptive-research-1'},evaluator={...identity,version:'eth-prospective-evaluator-1'};
  const generationStartedAt=new Date(Date.parse(bodyCompletedAt)+1000).toISOString(),generatedAt=new Date(Date.parse(bodyCompletedAt)+2000).toISOString(),issuedAt=new Date(Date.parse(bodyCompletedAt)+3000).toISOString();
  const args={snapshot,forecast,model,modelKey:'adaptive',generationStartedAt,generatedAt,issuedAt};
  return {base,tail,snapshot,forecast,model,evaluator,args,record:await createEthereumProspectiveRecord(args)};
}
