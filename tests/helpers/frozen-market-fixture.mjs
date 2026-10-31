import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const root=new URL('../fixtures/market-v1.29.8/',import.meta.url);
const manifest=JSON.parse(await readFile(new URL('manifest.json',root),'utf8'));
/** A fixed historical clock must never consume the mutable published archive. */
export async function frozenMarketText(name){
  const entry=manifest.files[name];
  if(!entry||!['btc-volume','btc-daily','eth-ohlc'].includes(name))throw new Error('Unknown frozen market fixture');
  const bytes=await readFile(new URL(entry.path,root));
  if(bytes.length!==entry.bytes||createHash('sha256').update(bytes).digest('hex')!==entry.sha256)throw new Error('Changed frozen market fixture: '+name);
  return bytes.toString('utf8');
}
