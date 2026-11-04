import { validateHousing,type HousingSnapshot } from '@atlas/domain/housing';
export type HousingDelivery={snapshot:HousingSnapshot;revision:string;kind:'api'|'saved'};
export async function loadHousing(signal:AbortSignal,fetchImpl:typeof fetch=fetch):Promise<HousingDelivery>{
  async function get(path:string){const r=await fetchImpl(path,{signal:AbortSignal.any([signal,AbortSignal.timeout(6000)]),cache:'no-store',credentials:'same-origin'});if(!r.ok)throw new Error(`HTTP ${r.status}`);const raw=await r.text();if(raw.length>1024*1024)throw new Error('자료 크기 초과');return JSON.parse(raw);}
  async function checked(snapshot:unknown,revision?:string){const d=validateHousing(snapshot),bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(d))),digest=Array.from(new Uint8Array(bytes),n=>n.toString(16).padStart(2,'0')).join('');if(revision!==undefined&&digest!==revision)throw new Error('자료 판본 불일치');signal.throwIfAborted();return {snapshot:d,revision:digest};}
  try{const body=await get('/api/v1/housing');if(body.schemaVersion!==1||!/^[a-f0-9]{64}$/.test(body.revision))throw new Error('응답 형식 오류');return {...await checked(body.snapshot,body.revision),kind:'api'};}
  catch{signal.throwIfAborted();return {...await checked(await get('/data/housing.json')),kind:'saved'};}
}
