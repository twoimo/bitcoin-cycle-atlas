import {forecastHash} from './forecast-records.js';

/** Same bounded relative-import traversal as the existing ledger source collector, for local reconstruction. */
export async function loadMonthlyModelIdentity({fetchImpl=globalThis.fetch,baseUrl=import.meta.url,signal}={}){
  const entry=new URL(baseUrl);
  if(!/^https?:$/.test(entry.protocol))throw new Error('월말 검증은 로컬 서비스에서 열어 주세요.');
  const base=new URL('./',entry),files={},pending=['monthly-backtest.js'];
  for(let index=0;index<pending.length;index++){
    signal?.throwIfAborted();if(index>=100)throw new RangeError('Monthly calculation dependency limit exceeded');
    const path=pending[index],url=new URL(path,base),response=await fetchImpl(url,{signal,cache:'no-store'});
    if(!response.ok)throw new Error('계산 소스 확인 실패 · '+path);
    const text=await response.text();if(text.length>1024*1024)throw new RangeError('Calculation source too large');
    const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(text));
    files[path]=Array.from(new Uint8Array(bytes),v=>v.toString(16).padStart(2,'0')).join('');
    for(const match of text.matchAll(/(?:from\s*|import\s*)['"](\.[^'"]+)['"]/g)){
      const child=new URL(match[1].split('?')[0],url);
      if(child.origin!==base.origin||!child.pathname.startsWith(base.pathname)||!child.pathname.endsWith('.js'))throw new Error('Calculation dependency escaped the local module root');
      const name=child.pathname.slice(base.pathname.length);if(!pending.includes(name))pending.push(name);
    }
  }
  return {hash:await forecastHash(files),files,meaning:'locally-observed-source-bytes-not-historical-code-provenance'};
}
export function browserMonthlyWorkerFactory(){
  if(typeof Worker!=='function'||!/^https?:$/.test(globalThis.location?.protocol??''))return undefined;
  return ()=>new Worker(new URL('./monthly-backtest-worker.js',import.meta.url),{type:'module',name:'atlas-monthly-backtest'});
}
