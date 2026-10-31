/** A local replay capture is not an issued forecast. Its digest detects changed
 * saved bytes; it does not authenticate a provider or prove publication time. */
const KIND='atlas-local-replay-snapshot';
const REFERENCE_KIND='atlas-replay-snapshot-reference';
const HEX=/^[a-f0-9]{64}$/;
// Storage counts may be UTF-16, so keep the serialized envelope below 2 MiB
// and allow a separately bounded, lossless decoded capture up to 64 MiB.
export const MAX_REPLAY_SAVE_BYTES=2*1024*1024;
export const MAX_REPLAY_DECODED_BYTES=64*1024*1024;
const packedCaptures=new WeakMap();
const clone=value=>JSON.parse(JSON.stringify(value));
function freeze(value){
  if(value&&typeof value==='object'&&!Object.isFrozen(value)){
    for(const child of Object.values(value))freeze(child);
    Object.freeze(value);
  }
  return value;
}
function validDate(value){
  return typeof value==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(value)&&
    Number.isFinite(Date.parse(value+'T00:00:00Z'))&&new Date(value+'T00:00:00Z').toISOString().slice(0,10)===value;
}
function checkedView(view){
  if(!view?.dataset||!Array.isArray(view.dataset.prices)||!view.forecast||
    !validDate(view.forecast.asOf)||!Array.isArray(view.forecast.path)||view.forecast.path.length<2||
    !validDate(view.start)||!validDate(view.end)||view.start>=view.end||
    !['daily','weekly'].includes(view.frequency))throw new TypeError('저장된 고정 예측의 차트 구성이 올바르지 않습니다.');
  return view;
}
async function digest(value){
  if(!globalThis.crypto?.subtle)throw new Error('고정 예측의 SHA-256 검증을 사용할 수 없습니다.');
  const hash=await globalThis.crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(value)));
  return Array.from(new Uint8Array(hash),byte=>byte.toString(16).padStart(2,'0')).join('');
}

/** Own the painted view before any archive request yields to a live refresh. */
export function captureReplayView(view){
  return view===null||view===undefined?null:freeze(clone(checkedView(view)));
}

/** Prepared in memory, once per committed origin. Nothing is persisted here. */
export async function sealReplaySnapshot({view,atlasContext,identity}){
  if(identity?.currentChartSnapshot!==true||identity.issuedAt!==null||!HEX.test(identity.outputHash)||
    !validDate(identity.asOf)||!Number.isFinite(Date.parse(identity.createdAt))||
    atlasContext?.originDate!==identity.asOf||atlasContext?.forecastOrigin!==view?.forecast?.asOf)
    throw new TypeError('현재 차트 고정 예측의 세션 식별자가 일치하지 않습니다.');
  const payload=clone({kind:KIND,version:1,origin:identity.asOf,capturedAt:identity.createdAt,
    outputHash:identity.outputHash,view:checkedView(view),atlasContext,
    meaning:'local-visual-comparison-not-issued-forecast',publicationTimeProven:false});
  const snapshot=freeze({...payload,digest:await digest(payload)});
  await prepareStorage(snapshot);
  return snapshot;
}

/** Validate the saved capture before using it; never fall back to a new curve
 * when an existing capture is corrupt. The engine separately verifies output. */
export async function restoreReplaySnapshot(snapshot,{outputHash,origin,now=Date.now(),indexedDB=globalThis.indexedDB,snapshotStore=null}={}){
  if(snapshot?.kind===REFERENCE_KIND){
    const reference=snapshot;
    if(reference.version!==1||reference.outputHash!==outputHash||reference.origin!==origin||!HEX.test(reference.digest)||
      reference.id!=='atlas-chart-replay-v1:BTCUSD:'+reference.digest)
      throw new TypeError('고정 예측 저장 위치의 식별자가 일치하지 않습니다.');
    snapshot=await (snapshotStore??createReplaySnapshotStore(indexedDB)).get(reference.id);
    if(!snapshot||snapshot.digest!==reference.digest||snapshot.outputHash!==reference.outputHash||snapshot.origin!==reference.origin)
      throw new Error('저장된 고정 예측 원본을 찾지 못했습니다. 새 예측선으로 대체하지 않습니다.');
  }
  if(snapshot?.version===2)snapshot=await unpackSnapshot(snapshot);
  if(!snapshot||snapshot.kind!==KIND||snapshot.version!==1||!HEX.test(snapshot.digest)||
    !HEX.test(outputHash)||snapshot.outputHash!==outputHash||snapshot.origin!==origin||
    snapshot.meaning!=='local-visual-comparison-not-issued-forecast'||snapshot.publicationTimeProven!==false)
    throw new TypeError('저장된 고정 예측의 식별자가 일치하지 않습니다. 기존 저장은 유지됩니다.');
  const text=JSON.stringify(snapshot);
  if(new TextEncoder().encode(text).byteLength>MAX_REPLAY_DECODED_BYTES)throw new RangeError('저장된 고정 예측의 복원 크기 제한을 초과했습니다.');
  const owned=JSON.parse(text),{digest:savedDigest,...payload}=owned;
  if(await digest(payload)!==savedDigest)throw new Error('저장된 고정 예측의 값·범위·표식이 변경되어 복원하지 않았습니다. 기존 저장은 유지됩니다.');
  checkedView(payload.view);
  const captured=Date.parse(payload.capturedAt);
  if(!Number.isFinite(captured)||captured>now||!validDate(origin)||
    payload.atlasContext?.originDate!==origin||payload.atlasContext?.forecastOrigin!==payload.view.forecast.asOf)
    throw new RangeError('저장된 고정 예측의 기준일 또는 캡처 시각이 올바르지 않습니다.');
  freeze(owned);
  await prepareStorage(owned);
  return Object.freeze({snapshot:owned,view:owned.view,atlasContext:owned.atlasContext,capturedAt:owned.capturedAt});
}

/** One explicit save, one atomic storage replacement. On quota/security failure
 * the caller keeps the session open and the previous stored bytes untouched. */
export async function persistReplayDraft(storage,key,draft,{indexedDB=globalThis.indexedDB,snapshotStore=null}={}){
  if(draft?.mode==='atlas-chart'&&!draft.forecastSnapshot)throw new Error('고정 예측 원본이 없어 이번 세션을 저장하지 않았습니다.');
  const packed=draft?.mode==='atlas-chart'?packedCaptures.get(draft.forecastSnapshot):null;
  if(draft?.mode==='atlas-chart'&&!packed)throw new Error('검증된 고정 예측 저장본을 준비하지 못했습니다.');
  let text=JSON.stringify(packed?{...draft,forecastSnapshot:packed}:draft);
  if(new TextEncoder().encode(text).byteLength>MAX_REPLAY_SAVE_BYTES){
    if(!packed)throw new RangeError('리플레이 저장 한도를 초과했습니다.');
    const id=key+':'+packed.digest;
    // Write the immutable large capture first. Replace the small pointer only
    // after transaction completion. Any failure preserves the previous pointer.
    await (snapshotStore??createReplaySnapshotStore(indexedDB)).put(id,packed);
    text=JSON.stringify({...draft,forecastSnapshot:{kind:REFERENCE_KIND,version:1,id,
      digest:packed.digest,outputHash:packed.outputHash,origin:packed.origin}});
  }
  storage.setItem(key,text);
}


function bytesToBase64(bytes){
  let text='';for(let i=0;i<bytes.length;i+=32768)text+=String.fromCharCode(...bytes.subarray(i,i+32768));
  return btoa(text);
}
async function boundedBytes(stream,limit){
  const reader=stream.getReader(),chunks=[];let total=0;
  try{
    for(;;){const {done,value}=await reader.read();if(done)break;
      total+=value.byteLength;if(total>limit){await reader.cancel();throw new RangeError('고정 예측의 복원 크기 제한을 초과했습니다.');}chunks.push(value);}
  }finally{reader.releaseLock();}
  const bytes=new Uint8Array(total);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}return bytes;
}
async function prepareStorage(snapshot){
  if(packedCaptures.has(snapshot))return packedCaptures.get(snapshot);
  const raw=new TextEncoder().encode(JSON.stringify(snapshot));
  if(raw.byteLength>MAX_REPLAY_DECODED_BYTES)throw new RangeError('고정 예측의 복원 크기 제한을 초과했습니다.');
  let envelope=snapshot;
  if(typeof CompressionStream==='function'){
    const compressed=await boundedBytes(new Blob([raw]).stream().pipeThrough(new CompressionStream('gzip')),MAX_REPLAY_DECODED_BYTES);
    envelope=freeze({kind:KIND,version:2,encoding:'gzip-base64',digest:snapshot.digest,
      outputHash:snapshot.outputHash,origin:snapshot.origin,capturedAt:snapshot.capturedAt,
      meaning:snapshot.meaning,publicationTimeProven:false,decodedBytes:raw.byteLength,payload:bytesToBase64(compressed)});
  }
  // A large capture may still be replayed. Explicit saving reports its actual
  // quota failure instead of blocking Play or silently dropping forecast rows.
  packedCaptures.set(snapshot,envelope);return envelope;
}
async function unpackSnapshot(envelope){
  if(envelope.kind!==KIND||envelope.encoding!=='gzip-base64'||typeof envelope.payload!=='string'||
    !Number.isSafeInteger(envelope.decodedBytes)||envelope.decodedBytes<1||envelope.decodedBytes>MAX_REPLAY_DECODED_BYTES||
    envelope.payload.length>MAX_REPLAY_DECODED_BYTES||!/^[A-Za-z0-9+/]*={0,2}$/.test(envelope.payload))
    throw new TypeError('압축된 고정 예측 저장본의 형식 또는 크기가 올바르지 않습니다.');
  if(typeof DecompressionStream!=='function')throw new Error('이 브라우저는 압축된 고정 예측 복원을 지원하지 않습니다.');
  let owned;
  try{
    const binary=atob(envelope.payload),bytes=Uint8Array.from(binary,c=>c.charCodeAt(0));
    const raw=await boundedBytes(new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip')),envelope.decodedBytes);
    if(raw.byteLength!==envelope.decodedBytes)throw new Error('Decoded length mismatch');
    owned=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(raw));
  }catch(error){throw new Error('압축된 고정 예측 저장본이 손상되어 복원하지 않았습니다.',{cause:error});}
  for(const key of ['kind','digest','outputHash','origin','capturedAt','meaning','publicationTimeProven'])
    if(owned[key]!==envelope[key])throw new TypeError('압축된 고정 예측의 식별자가 일치하지 않습니다.');
  return owned;
}


/** A separate record per immutable digest prevents interrupted saves from
 * overwriting the previously referenced capture. No forecast is sent online. */
export function createReplaySnapshotStore(factory){
  if(!factory?.open)throw new Error('큰 고정 예측을 저장할 브라우저 데이터베이스를 사용할 수 없습니다.');
  function action(mode,id,value){
    return new Promise((resolve,reject)=>{
      let database=null,transaction=null,result,done=false;
      const finish=(error)=>{if(done)return;done=true;clearTimeout(timer);database?.close();error?reject(error):resolve(result);};
      const timer=setTimeout(()=>{transaction?.abort();finish(new Error('고정 예측 저장소 응답이 지연되어 작업을 중단했습니다.'));},15000);
      let opening;
      try{opening=factory.open('atlas-fixed-replay',1);}catch(error){finish(error);return;}
      opening.onupgradeneeded=()=>{if(!opening.result.objectStoreNames.contains('captures'))opening.result.createObjectStore('captures');};
      opening.onblocked=()=>finish(new Error('다른 탭이 고정 예측 저장소를 사용 중입니다.'));
      opening.onerror=()=>finish(opening.error??new Error('고정 예측 저장소를 열지 못했습니다.'));
      opening.onsuccess=()=>{
        database=opening.result;if(done){database.close();return;}
        try{
          transaction=database.transaction('captures',mode);const store=transaction.objectStore('captures');
          const request=mode==='readonly'?store.get(id):store.put(value,id);
          request.onsuccess=()=>{result=request.result;};
          transaction.oncomplete=()=>finish();
          transaction.onerror=()=>finish(transaction.error??new Error('고정 예측 저장소 작업이 실패했습니다.'));
          transaction.onabort=()=>finish(transaction.error??new Error('고정 예측 저장소 작업이 취소됐습니다.'));
        }catch(error){finish(error);}
      };
    });
  }
  return {get:id=>action('readonly',id),put:(id,value)=>action('readwrite',id,value)};
}
