import {assetSourceHash} from './asset-forecast-records.js';
import {forecastHash} from './forecast-records.js';

export const PROJECT_REPLAY_ORIGIN=Object.freeze({
  startDate:'2026-10-21',timezone:'Asia/Seoul',asOf:'2026-10-20',
  repositoryCreatedAt:'2026-10-21T14:40:21.000Z',
  initialCommit:'c93526b55bac0ccf28b1720840477a2f7007237f',
  sourceCommit:'918ce95bdcdb5b2611b8ab5a0314815c1e326a1d',
  preservedAt:'2026-10-21T14:48:51.000Z',preservationBasis:'initial-git-commit',
  sourceArtifactPath:'docs/THREE_YEAR_RESULTS.json',
  sourceArtifactSha256:'d487ab7c27f4a36a54f5b92e7b43faecd9691740b2484d54372727a754473c98',
  sourceArtifactGitBlob:'ceb7a5558ffea68eeca705ec85a70bbf86915f20',
  sourceInputPath:'dist/data/btc-daily.json',
  sourceInputSha256:'c76403669531763b20ab6f25179d2cd7394cdbca96819197e05f1cb51facd6ed',
  sourceInputGitBlob:'d8774079d15f21857db1531bb47984eb5712a525',
  archivePath:'data/project-origin-btc-2026-10-21.json',
  archiveSha256:'571d0d3421d7ae40da4fb3020ab0290aa534822d5a439f9e98f55dc31d5f19ac',modelVersion:'three-year-outlook-v1',
});
const verified=new WeakSet(),MAXIMUM_BYTES=1000000;
function freeze(value){if(value&&typeof value==='object'&&!Object.isFrozen(value)){for(const item of Object.values(value))freeze(item);Object.freeze(value);}return value;}

/** This is the base scenario already preserved in the first app commit, not a
 * current model backdated to the project's first day. The build/test receipt
 * binds this extraction to the original, unchanged result and input blobs. */
export async function parseProjectReplayBaseline(text){
  if(typeof text!=='string'||text.length>MAXIMUM_BYTES||new TextEncoder().encode(text).length>MAXIMUM_BYTES)throw new RangeError('프로젝트 최초 예측 자료의 크기 제한을 초과했습니다.');
  const digest=await assetSourceHash(text);
  if(digest!==PROJECT_REPLAY_ORIGIN.archiveSha256)throw new Error('프로젝트 최초 예측 보존본의 해시가 일치하지 않습니다.');
  const payload=JSON.parse(text),origin=PROJECT_REPLAY_ORIGIN;
  if(payload.kind!=='atlas-project-origin-baseline'||payload.schemaVersion!==1||payload.context.version!==origin.modelVersion||
    payload.context.asOf!==origin.asOf||payload.context.referenceDate!==origin.startDate||payload.scenario.id!=='base'||
    payload.dataset.meta.lastDate!==origin.asOf||payload.dataset.prices.at(-1)?.[0]!==origin.asOf||
    payload.scenario.path[0]?.date!==origin.asOf||payload.scenario.path.at(-1)?.date!=='2029-10-21')throw new TypeError('프로젝트 최초 예측의 기준일·원본 구성이 일치하지 않습니다.');
  const forecast={...payload.scenario,version:payload.context.version,observables:payload.context.observables,
    nominalClock:{...payload.context.nominalClock,...payload.scenario.timing},
    scenario:{id:payload.scenario.id,label:payload.scenario.label},
    path:payload.scenario.path.map(row=>({...row,lower:row.low,upper:row.high}))};
  const output=forecast.path.map(row=>({date:row.date,price:row.price,lower:row.lower,upper:row.upper,baselinePrice:null}));
  const inputHash=await forecastHash(payload.dataset.prices),outputHash=await forecastHash(output);
  const provenance={...payload.provenance,archivePath:origin.archivePath,archiveSha256:digest,
    publicationTimeProven:false,historicalProviderAuthenticityProven:false,
    description:'2026-10-21 최초 앱 커밋에 보존된 3년 조건부 기본 경로. 완료 관측은 2026-10-20 UTC까지이며, 최초 커밋 시각은 실제 웹 게시 시각의 증명이 아닙니다.'};
  const id=await forecastHash({kind:payload.kind,inputHash,outputHash,sourceCommit:origin.sourceCommit,archiveSha256:digest});
  const baseline=freeze({id,dataset:payload.dataset,forecast,provenance,inputHash,outputHash});
  verified.add(baseline);return baseline;
}

export function requireVerifiedProjectReplayBaseline(value){
  if(!verified.has(value))throw new TypeError('Verify the preserved project baseline before creating its replay session');
  return value;
}

async function readBounded(response,owner){
  if(Number(response.headers?.get?.('content-length'))>MAXIMUM_BYTES)throw new RangeError('프로젝트 최초 예측 자료의 크기 제한을 초과했습니다.');
  let bytes;
  if(response.body?.getReader){
    const native=typeof response.clone==='function'&&typeof response.arrayBuffer==='function';
    const reader=(native?response.clone().body:response.body).getReader();
    const cancelled=()=>{void reader.cancel(owner.signal.reason).catch(()=>{});};
    owner.signal.addEventListener('abort',cancelled,{once:true});
    const collect=(async()=>{
      let count=0;const chunks=[];
      try{while(true){owner.signal.throwIfAborted();const item=await reader.read();owner.signal.throwIfAborted();if(item.done)break;
        count+=item.value.byteLength;if(count>MAXIMUM_BYTES)throw new RangeError('프로젝트 최초 예측 자료의 크기 제한을 초과했습니다.');if(!native)chunks.push(item.value);}
        if(native)return;
        const result=new Uint8Array(count);let offset=0;for(const chunk of chunks){result.set(chunk,offset);offset+=chunk.byteLength;}return result;
      }catch(error){owner.abort(error);await reader.cancel(error).catch(()=>{});throw error;}
      finally{owner.signal.removeEventListener('abort',cancelled);reader.releaseLock();}
    })();
    if(native){const read=response.arrayBuffer();try{const [buffer]=await Promise.all([read,collect]);bytes=new Uint8Array(buffer);}
      catch(error){owner.abort(error);await Promise.allSettled([read,collect]);throw error;}}
    else bytes=await collect;
  }else if(typeof response.arrayBuffer==='function')bytes=new Uint8Array(await response.arrayBuffer());
  else return response.text();
  owner.signal.throwIfAborted();if(bytes.byteLength>MAXIMUM_BYTES)throw new RangeError('프로젝트 최초 예측 자료의 크기 제한을 초과했습니다.');
  return new TextDecoder('utf-8',{fatal:true}).decode(bytes);
}

export async function loadProjectReplayBaseline({signal,fetchImpl=globalThis.fetch,
  baseUrl=globalThis.document?.baseURI??new URL('./',import.meta.url),timeoutMs=20000}={}){
  signal?.throwIfAborted();
  if(typeof fetchImpl!=='function'||!Number.isFinite(timeoutMs)||timeoutMs<=0)throw new TypeError('A fetch implementation and positive project replay timeout are required');
  const owner=new AbortController(),abort=()=>owner.abort(signal.reason);
  const timer=setTimeout(()=>owner.abort(new DOMException('프로젝트 최초 예측 확인 시간이 초과되었습니다.','TimeoutError')),timeoutMs);
  let rejectStop;const stopped=new Promise((_,reject)=>{rejectStop=reject;});
  const stop=()=>rejectStop(owner.signal.reason);owner.signal.addEventListener('abort',stop,{once:true});
  signal?.addEventListener('abort',abort,{once:true});if(signal?.aborted)abort();
  try{return await Promise.race([stopped,(async()=>{
    owner.signal.throwIfAborted();
    const embedded=globalThis.document?.getElementById('atlas-project-origin-baseline');
    let text;
    if(embedded){const packed=embedded.textContent;
      if(typeof packed!=='string'||packed.length>MAXIMUM_BYTES*2)throw new RangeError('Embedded project replay archive exceeds its byte limit');
      text=JSON.parse(packed).sourceText;
    }
    if(!embedded){const response=await fetchImpl(new URL(PROJECT_REPLAY_ORIGIN.archivePath,baseUrl),{
      credentials:'omit',redirect:'error',cache:'no-cache',signal:owner.signal});
      owner.signal.throwIfAborted();if(!response.ok)throw new Error('프로젝트 최초 예측 요청 실패 · HTTP '+response.status);
      text=await readBounded(response,owner);}
    owner.signal.throwIfAborted();const result=await parseProjectReplayBaseline(text);owner.signal.throwIfAborted();return result;
  })()]);}catch(error){owner.abort(error);throw error;}
  finally{clearTimeout(timer);signal?.removeEventListener('abort',abort);owner.signal.removeEventListener('abort',stop);}
}
