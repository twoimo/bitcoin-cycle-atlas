import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {performance} from 'node:perf_hooks';
import {fitEthereumAdaptiveModel,simulateEthereumAdaptive,ETH_ADAPTIVE_POLICY} from '../dist/ethereum-adaptive-model.js';
import {ethereumAgentDemand} from '../dist/ethereum-adoption-scenarios.js';
const root=fileURLToPath(new URL('..',import.meta.url)),inputs={},hashes={};
for(const path of ['dist/data/eth-ohlc.json','dist/data/btc-daily.json','dist/data/btc-ohlc.json']){
  const text=await readFile(resolve(root,path),'utf8');inputs[path]=JSON.parse(text);hashes[path]=createHash('sha256').update(text).digest('hex');
}
const ethArchive=inputs['dist/data/eth-ohlc.json'],btcArchive=inputs['dist/data/btc-daily.json'],coinbaseBtc=inputs['dist/data/btc-ohlc.json'];
const eth=ethArchive.dailyHistory.candles.map(r=>({date:r.date.slice(0,10),price:r.close,high:r.high})),btc=btcArchive.prices.map(([date,price])=>({date,price}));
for(const [label,rows] of [['ETH',eth],['BTC',btc]]){
  if(!rows.length)throw new Error(label+' price archive is empty');
  for(let i=0;i<rows.length;i++){
    const r=rows[i],stamp=Date.parse(r.date+'T00:00:00Z');
    if(!/^\d{4}-\d{2}-\d{2}$/.test(r.date)||!Number.isFinite(stamp)||new Date(stamp).toISOString().slice(0,10)!==r.date||
      !(Number.isFinite(r.price)&&r.price>0)||(i&&rows[i-1].date>=r.date)||
      (label==='ETH'&&!(Number.isFinite(r.high)&&r.high>=r.price)))throw new Error(label+' malformed daily observation at '+i);
  }
}
const asOf=eth.at(-1).date;
const day=s=>Date.parse(s+'T00:00:00Z')/86400000;
const mean=a=>a.reduce((s,x)=>s+x,0)/a.length;
const extreme=(rows,key,direction)=>rows.reduce((best,r)=>direction*r[key]>direction*best[key]?r:best,rows[0]);
function vol(start,end,b=btc){
  const lookup=new Map(b.map(r=>[r.date,r.price])),pairs=[];
  for(let i=1;i<eth.length;i++){
    const e=eth[i],prev=eth[i-1];
    if(e.date<start||e.date>end||day(e.date)-day(prev.date)!==1||!lookup.has(e.date)||!lookup.has(prev.date))continue;
    pairs.push([Math.log(e.price/prev.price),Math.log(lookup.get(e.date)/lookup.get(prev.date))]);
  }
  const n=pairs.length;if(n<2)return{start,end,n,status:'unavailable'};
  const a=mean(pairs.map(r=>r[0])),bmean=mean(pairs.map(r=>r[1]));
  const ve=pairs.reduce((s,r)=>s+(r[0]-a)**2,0)/(n-1),vb=pairs.reduce((s,r)=>s+(r[1]-bmean)**2,0)/(n-1);
  const cov=pairs.reduce((s,r)=>s+(r[0]-a)*(r[1]-bmean),0)/(n-1);
  return {start,end,n,ethAnnualizedPct:100*Math.sqrt(365*ve),btcAnnualizedPct:100*Math.sqrt(365*vb),
    volatilityRatio:Math.sqrt(ve/vb),correlation:cov/Math.sqrt(ve*vb),beta:cov/vb,missingDaysBridged:false};
}
const peaks=[['2017-01-01','2018-06-30'],['2021-01-01','2021-12-31'],['2025-01-01','2025-12-31']]
  .map(([a,b])=>extreme(eth.filter(r=>r.date>=a&&r.date<=b),'price',1));
const episodes=[];let start=extreme(eth.filter(r=>r.date<=peaks[0].date),'price',-1);
for(let i=0;i<peaks.length;i++){
  const peak=peaks[i],end=peaks[i+1]?.date??asOf;
  const trough=extreme(eth.filter(r=>r.date>=peak.date&&r.date<=end),'price',-1);
  episodes.push({start:start.date,peak:peak.date,trough:trough.date,startPrice:start.price,peakPrice:peak.price,troughPrice:trough.price,
    riseDays:day(peak.date)-day(start.date),fallDays:day(trough.date)-day(peak.date),drawdownPct:100*(trough.price/peak.price-1),
    leftCensored:i===0,rightCensored:i===peaks.length-1,retrospectivelySelected:true});
  start=trough;
}
const periodStart='2025-01-01',periodEnd='2025-12-31';
const yearRows=eth.filter(r=>r.date>=periodStart&&r.date<=periodEnd);
const fullPeriodCoverage=yearRows.length===365&&yearRows[0]?.date===periodStart&&yearRows.at(-1)?.date===periodEnd&&
  yearRows.every((r,i)=>i===0||day(r.date)-day(yearRows[i-1].date)===1);
const observedMaximum=yearRows.length?extreme(yearRows,'high',1):null;
const targets=[
  {institution:'Galaxy',published:'2024-12-31',clientRelease:'2024-12-27',strictAboveUsd:5500,
    source:'https://www.galaxy.com/insights/research/crypto-predictions-2025',
    originalScope:'ETH trades above 5500 during 2025; not a year-end close',
    annualHighCheck:'Sufficient for this price threshold within the specified Coinbase ETH-USD universe'},
  {institution:'VanEck',published:'2024-12-13',strictAboveUsd:6000,
    source:'https://www.vaneck.com/us/en/blogs/digital-assets/matthew-sigel-vanecks-10-crypto-predictions-for-2025/',
    originalScope:'2025 cycle-apex price in an outlook also proposing Q1/Q4 timing',
    annualHighCheck:'Necessary price-threshold check only; not sufficient to validate the complete timing/path forecast'}
].map(target=>({...target,periodStart,periodEnd,priceDefinition:'Coinbase Exchange ETH-USD UTC daily intraday high',
  observations:yearRows.length,fullPeriodCoverage,observedMaximum,
  thresholdObserved:observedMaximum?.high>target.strictAboveUsd?true:fullPeriodCoverage?false:null,
  allVenuesClaim:false,allTimeMaximumUsed:false}));
const lookup=new Map(eth.map(r=>[r.date,r.price])),annual=[];
for(let year=2017;year<=Number(asOf.slice(0,4));year++){
  const prior=lookup.get((year-1)+'-12-31'),end=year===Number(asOf.slice(0,4))?asOf:year+'-12-31',value=lookup.get(end);
  if(prior&&value)annual.push({year,through:end,returnPct:100*(value/prior-1),partialYear:!end.endsWith('-12-31')});
}
const begin=performance.now(),fit=fitEthereumAdaptiveModel(ethArchive,asOf),sim=simulateEthereumAdaptive(fit),runtimeMs=performance.now()-begin;
const dense=simulateEthereumAdaptive(fit,{horizonDays:730,sampleCount:1024});
const sameProvider=coinbaseBtc.intervals.daily.candles.map(r=>({date:r.date.slice(0,10),price:r.close}));
const comparison=JSON.parse(await readFile(resolve(root,'build/ethereum-model-comparison.json'),'utf8'));
const example={paidRequestsPerDay:1000000,ethereumShare:.25,settlementsPerRequest:.01,l1DirectShare:.05,l1GasPerSettlement:50000,l2L1GasPerSettlement:100,blobGasPerSettlement:500,executionBaseFeeGwei:1,blobBaseFeeGwei:.01,priorityFeeGwei:.1,ethPriceUsd:fit.anchorPrice,workingBalanceDays:7};
const report={schemaVersion:1,kind:'ethereum-adaptive-research-audit',asOf,
  sourceCommit:execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim(),
  sourceTree:execFileSync('git',['rev-parse','HEAD^{tree}'],{cwd:root,encoding:'utf8'}).trim(),
  executedAt:new Date().toISOString(),runId:process.env.GITHUB_RUN_ID??null,inputSha256:hashes,
  dataDefinitions:{eth:'Coinbase Exchange completed UTC daily close; high separately intraday',btc:'Coin Metrics PriceUSD end-of-day reference',
    sameProviderCheck:'Coinbase BTC-USD and ETH-USD daily close in retained recent overlap',historicalVintagesVerified:false,
    fetchedCurrentPricesInThisScript:false,macroCyclesIndependent:false,peakWindowsRetrospectivelySelected:true},
  ath:{close:extreme(eth,'price',1),intraday:extreme(eth,'high',1),prior2025Close:extreme(eth.filter(r=>r.date<'2025-01-01'),'price',1),
    prior2025Intraday:extreme(eth.filter(r=>r.date<'2025-01-01'),'high',1)},
  institutional2025Thresholds:targets,
  episodes,annualReturns:annual,volatility:[vol('2024-01-01','2025-12-31'),vol('2020-01-01','2022-09-14'),vol('2022-09-15',asOf)],
  sameProviderVolatility:vol(sameProvider[0].date,asOf,sameProvider),
  policy:ETH_ADAPTIVE_POLICY,training:fit.training,simulation:sim.metadata,currentPath:sim.path,
  runtime:{fitAnd730Day256DrawSimulationMs:runtimeMs,environment:'GitHub Actions Node; not physical mobile latency',timingIsNotGuaranteed:true,
    logMatrixBytes:(730+1)*256*8,memoryComplexity:'O(history + horizon*draws); matrix bytes exclude fitted arrays and output objects',complexity:'O(history + horizon*draws*log(draws)); one fit and cached UI result'},
  monteCarloSensitivity:{comparisonDraws:1024,interpretation:'Numerical draw error only, not parameter uncertainty or selecting a better forecast',
    horizons:[30,90,180,365,730].map(h=>({horizonDays:h,draws256:sim.path[h],draws1024:dense.path[h],
      medianLogDifference:Math.log(dense.path[h].baselinePrice/sim.path[h].baselinePrice)}))},
  comparisons:comparison.summaries.filter(s=>s.model==='adaptiveEth'),
  paired:comparison.pairwise.filter(s=>s.left==='adaptiveEth'||s.right==='adaptiveEth'),
  forecastPerformance:{prospectiveScoredTargets:0,productionPromoted:false,externalGeminiReview:'omitted-by-user-2026-10-27',reverseReview:'omitted-by-user-2026-10-27'},
  institutionalArithmetic:{tomLee:{source:'https://www.sec.gov/Archives/edgar/data/1829311/000149315225012513/ex99-2.htm',published:'2025-09-02',messagePeriod:'2025-08',btcTargetHorizon:'2025 year-end',ethRatioScenarioHorizon:null,
    ethRatioScenarioHorizonNote:'Conditional ratio grid; replacement-cost scenario has no explicit standalone deadline',assumedBtcUsd:250000,
    ratios:[.04790,.080727,.25].map(r=>({ratio:r,conditionalEthUsd:250000*r})),jointProbability:null,ratioStationarityProven:false},
    vanEck:{source:'https://www.vaneck.com/us/en/blogs/digital-assets/matthew-sigel-eth-2030-price-target/',published:'2024-06-05',
      fcf2030MillionUsd:66058,terminalMultiple:33.33,supply2030MillionEth:100.07,
      reconstructedRoundedTablePrice:66058*33.33/100.07,publishedBase2030Usd:22000,roundingExplainsSmallDifference:true,probability:null}},
  aiScenario:{input:example,result:ethereumAgentDemand(example),
    tenTimesRequestsAndBatching:ethereumAgentDemand({...example,paidRequestsPerDay:10000000,settlementsPerRequest:.001}),observed:false},
  limitations:['Current-price-vintage replay is not a historical publication-vintage backtest','Confirmed threshold states are not independent four-year cycles',
    'Post-Merge fitting avoids assuming unchanged pre-Merge behavior but leaves few completed states','Fixed hazard and variance policies were not selected by a held-out optimization',
    '730-day drawings are conditional research extensions; scores cover 30/90/180 days','Monte Carlo bands omit coefficient uncertainty and have no coverage guarantee',
    'AI usage accounting does not identify a USD price elasticity','No causal estimate of PoS on 2025 price performance']};
const output=resolve(root,'build/ethereum-adaptive-research.json');await mkdir(dirname(output),{recursive:true});await writeFile(output,JSON.stringify(report,null,2)+'\n');
const {currentPath,...receipt}=report;
console.log('ETH_ADAPTIVE_RECEIPT '+JSON.stringify(receipt));
const pathText=JSON.stringify({kind:'reconstructed-research-path',issued:false,asOf,sourceCommit:report.sourceCommit,
  sourceTree:report.sourceTree,executedAt:report.executedAt,inputSha256:hashes,metadata:sim.metadata,path:currentPath});
const chunkSize=20000,total=Math.ceil(pathText.length/chunkSize);
for(let index=0;index<total;index++)console.log('ETH_ADAPTIVE_PATH_CHUNK '+JSON.stringify({index,total,data:pathText.slice(index*chunkSize,(index+1)*chunkSize)}));
