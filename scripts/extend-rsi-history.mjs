import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { parseYahoo } from './refresh-market-lab.mjs';
import { validateSnapshot } from '../packages/domain/src/market-lab-math.js';
import { RSI_INSTRUMENTS } from '../dist/rsi-instruments.js';

// Add only missing instrument histories. Existing observations and macro clocks
// retain their bytes. Publication remains the explicit DB import job's action.
export async function extendRsiHistory(previous, { now = new Date(), fetchImpl = fetch, rawDir } = {}) {
  validateSnapshot(previous);
  const next = structuredClone(previous), receipts = [];
  for (const instrument of RSI_INSTRUMENTS) {
    if (previous.markets.some(m => m.id === instrument.id && m.prices.length)) continue;
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${instrument.product}?period1=0&period2=${Math.floor(+now/1000)}&interval=1d&events=history%2Csplits%2Cdividends`;
    const response = await fetchImpl(url,{signal:AbortSignal.timeout(30000),headers:{'User-Agent':'Bitcoin-Cycle-Atlas public history'}});
    if (!response.ok) throw new Error(`${instrument.symbol}: HTTP ${response.status}`);
    const raw = await response.text(); if (raw.length > 8*1024*1024) throw new Error('History exceeds 8 MiB');
    const data = parseYahoo(JSON.parse(raw),instrument.product,{now});
    if (data.currency !== instrument.currency) throw new Error('Instrument currency mismatch');
    const sourceId = `market-${instrument.id}`, hash = createHash('sha256').update(raw).digest('hex');
    next.sources = next.sources.filter(s => s.id !== sourceId);
    next.sources.push({id:sourceId,label:`Yahoo Finance ${instrument.name} 일봉 종가`,url,unit:data.currency,frequency:'완료 확인 일봉(현재 현지 날짜 제외)',retrievedAt:now.toISOString(),lastObservation:data.prices.at(-1)[0],status:'ready',releaseTimeKnown:false,responseSha256:hash,priceBasis:data.priceBasis,sessionPolicy:data.sessionPolicy,timezone:data.timezone});
    next.markets = next.markets.filter(m => m.id !== instrument.id);
    next.markets.push({id:instrument.id,symbol:instrument.product,name:instrument.name,region:instrument.region,unit:data.currency,sourceId,prices:data.prices,timezone:data.timezone});
    receipts.push({symbol:instrument.symbol,url,sha256:hash,sessions:data.prices.length,first:data.prices[0][0],last:data.prices.at(-1)[0]});
    if (rawDir) { await mkdir(rawDir,{recursive:true}); await writeFile(resolve(rawDir,instrument.symbol+'.json'),raw); }
  }
  if (receipts.length) next.generatedAt = now.toISOString();
  return {snapshot:validateSnapshot(next),receipts};
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const [input,output,rawDir] = process.argv.slice(2); if (!input || !output) throw new Error('Usage: extend-rsi-history.mjs <input.json> <candidate.json> [raw-directory]');
  const result = await extendRsiHistory(JSON.parse(await readFile(input,'utf8')),{rawDir});
  await writeFile(output,JSON.stringify(result.snapshot)+'\n',{flag:'wx'});
  console.log(JSON.stringify(result.receipts,null,2));
}
