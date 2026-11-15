import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {CHART_INTERVALS,fetchMarketCandles} from '../dist/ohlc-data.js';
import {writeFileAtomic} from './atomic-file.mjs';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const output=resolve(process.argv[2]||resolve(root,'dist/data/btc-ohlc.json'));
const now=Date.now(),intervals={};
for(const interval of CHART_INTERVALS){
  intervals[interval.id]=await fetchMarketCandles({interval:interval.id,count:interval.id==='weekly'?100:180,now,signal:AbortSignal.timeout(30000)});
  console.log(`${interval.label}: ${intervals[interval.id].candles.length} completed candles`);
}
await writeFileAtomic(output,JSON.stringify({version:1,source:'Coinbase Exchange',product:'BTC-USD',retrievedAt:new Date(now).toISOString(),intervals})+'\n',{mkdir:true});
console.log(output);
