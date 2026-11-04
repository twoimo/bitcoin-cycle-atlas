import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {parseBitcoinReplayCandles} from '../../dist/chart-replay-sources.js';

const root=new URL('../fixtures/',import.meta.url);
const receipt=JSON.parse(await readFile(new URL('btc-replay-2026-10-31.manifest.json',root),'utf8'));

export async function frozenReplayArchive(){
  const bytes=await readFile(new URL(receipt.file,root));
  if(bytes.length!==receipt.bytes||createHash('sha256').update(bytes).digest('hex')!==receipt.sha256)throw new Error('Changed fixed replay fixture');
  const archive=await parseBitcoinReplayCandles(bytes.toString('utf8'),{now:Date.parse(receipt.evaluatedAt)});
  if(archive.observedThrough!==receipt.observedThrough||archive.observedAt!==receipt.retrievedAt)throw new Error('Fixed replay source clocks changed');
  return archive;
}
