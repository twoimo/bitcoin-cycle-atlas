import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {buildTreasuryAssetPaths} from '../dist/treasury-asset-paths.js';
import {buildTreasuryForecasts} from '../dist/treasury-model.js';
import {buildEthereumForecasts} from '../dist/ethereum-forecast.js';

const read=async file=>JSON.parse(await readFile(new URL(`../${file}`,import.meta.url),'utf8'));
const hash=async files=>Object.fromEntries(await Promise.all(files.map(async file=>[file,createHash('sha256').update(await readFile(new URL(`../${file}`,import.meta.url))).digest('hex')])));
const inputFiles=['dist/data/btc-daily.json','dist/data/eth-ohlc.json','dist/data/mstr-ohlc.json','dist/data/bmnr-ohlc.json'];
const sourceFiles=['dist/treasury-model.js','dist/treasury-instruments.js','dist/treasury-liquidity.js','dist/treasury-asset-paths.js','dist/ethereum-forecast.js','dist/asset-daily-observations.js','scripts/report-treasury-evolution.mjs'];
const inputHashes=await hash(inputFiles),sourceHashes=await hash(sourceFiles);
const btcHistory=await read(inputFiles[0]),ethHistory=await read(inputFiles[1]),records=[];
for(const symbol of ['MSTR','BMNR']){
  const history=await read(`dist/data/${symbol.toLowerCase()}-ohlc.json`),asOf=history.candles.at(-1).date.slice(0,10);
  const assetPaths=buildTreasuryAssetPaths({symbol,btcHistory,ethHistory,asOf});
  const settings=symbol==='MSTR'?['cash-at-put','hold-to-maturity','convert-at-window'].map(capitalPolicy=>({capitalPolicy})):[undefined,7,30,90].map(exitDelayDays=>({exitDelayDays}));
  for(const options of settings){
    const forecasts=buildTreasuryForecasts({symbol,history,asOf,endYear:2035,assetPaths,coinAnchor:{date:asOf,price:assetPaths.scenarios.base.path[0].price},...options});
    for(const [scenario,forecast] of Object.entries(forecasts)){
      const end=forecast.path.at(-1),point2030=forecast.path.find(item=>item.date==='2030-12-31');
      records.push({symbol,scenario,controlSetting:options.capitalPolicy??options.exitDelayDays??'scenario-default',capitalPolicy:forecast.assumptions.capitalPolicy,
        exitDelayDays:forecast.path[0].components.liquidity?.exitDelayDays??null,asOf,financialAsOf:forecast.financialAsOf,points:forecast.path.length,
        price2030:point2030.price,price2035:end.price,coinUnits2035:end.components.coinUnits,shares2035:end.components.shares,
        financingCost2035:end.components.totalFinancingCost,knownAnnualCarry2035:forecast.instruments.knownAnnualCarry,convertedShares:end.components.convertedShares,
        events:forecast.instrumentEvents,liquidity2035:end.components.liquidity,arrears2035:end.components.liquidityArrearsUsd,
        liquidityShortfallAt:forecast.diagnostics.liquidityShortfallAt,insolventAt:forecast.diagnostics.insolventAt});
    }
  }
}
const asOf=ethHistory.dailyHistory.candles.at(-1).date.slice(0,10),eth=buildEthereumForecasts({ethHistory,asOf});
const ethRecords=Object.entries(eth.forecasts).map(([scenario,forecast])=>({scenario,asOf,anchor:forecast.path[0].price,points:forecast.path.length,
  endDate:forecast.displayEnd,price2035:forecast.path.at(-1).price,sourceThrough:forecast.assetPath.training.maxSourceDate,
  observations:forecast.assetPath.training.observations,ohlcClaim:false,probability:null}));
if(JSON.stringify(inputHashes)!==JSON.stringify(await hash(inputFiles))||JSON.stringify(sourceHashes)!==JSON.stringify(await hash(sourceFiles)))throw new Error('Report inputs changed during calculation');
console.log(JSON.stringify({date:'2026-10-26',scope:'Deterministic actual-input scenario comparison. Values are conditional calculations, not investment forecasts or a backtest.',
  seed:20261022,inputHashes,sourceHashes,records,eth:ethRecords},null,2));
