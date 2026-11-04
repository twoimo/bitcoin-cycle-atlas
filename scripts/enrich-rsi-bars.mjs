import {readFile,writeFile,stat} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {yahooRsiBars} from '../packages/domain/src/rsi-bars.js';
import {validateSnapshot} from '../packages/domain/src/market-lab-math.js';
const [input,output,...files]=process.argv.slice(2);if(!input||!output||files.length!==3)throw new Error('Usage: enrich-rsi-bars.mjs <snapshot> <candidate> <TQQQ raw> <SOXL raw> <233740 raw>');
const snapshot=validateSnapshot(JSON.parse(await readFile(input,'utf8'))),now=new Date();const receipts=[];
for(const [index,id] of ['tqqq','soxl','kodex-kosdaq150'].entries()) {
  const raw=await readFile(files[index],'utf8'),market=snapshot.markets.find(m=>m.id===id);if(!market)throw new Error('Missing instrument');
  const parsed=yahooRsiBars(JSON.parse(raw),market,{now}),hash=createHash('sha256').update(raw).digest('hex'),source=snapshot.sources.find(s=>s.id===market.sourceId);
  market.ohlc=parsed.bars;market.ohlcEvidence={responseSha256:hash,retrievedAt:source.responseSha256===hash?source.retrievedAt:new Date((await stat(files[index])).mtimeMs).toISOString(),retrievalClockBasis:source.responseSha256===hash?'original source receipt':'owned raw file write time; HTTP receipt time not retained',preparedAt:now.toISOString(),timezone:parsed.timezone,matchedClosesOnly:true,omittedDates:parsed.omitted};
  receipts.push({id,rows:parsed.bars.length,omitted:parsed.omitted.length,sha256:hash});
}
snapshot.generatedAt=now.toISOString();validateSnapshot(snapshot);await writeFile(output,JSON.stringify(snapshot)+'\n',{flag:'wx'});console.log(JSON.stringify(receipts,null,2));
