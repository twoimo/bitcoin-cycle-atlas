/** A local replay capture is not an issued forecast. Its digest detects changed
 * saved bytes; it does not authenticate a provider or prove publication time. */
const KIND='atlas-local-replay-snapshot';
const HEX=/^[a-f0-9]{64}$/;
export const MAX_REPLAY_SAVE_BYTES=8*1024*1024;
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
  return freeze({...payload,digest:await digest(payload)});
}

/** Validate the saved capture before using it; never fall back to a new curve
 * when an existing capture is corrupt. The engine separately verifies output. */
export async function restoreReplaySnapshot(snapshot,{outputHash,origin,now=Date.now()}={}){
  if(!snapshot||snapshot.kind!==KIND||snapshot.version!==1||!HEX.test(snapshot.digest)||
    !HEX.test(outputHash)||snapshot.outputHash!==outputHash||snapshot.origin!==origin||
    snapshot.meaning!=='local-visual-comparison-not-issued-forecast'||snapshot.publicationTimeProven!==false)
    throw new TypeError('저장된 고정 예측의 식별자가 일치하지 않습니다. 기존 저장은 유지됩니다.');
  const text=JSON.stringify(snapshot);
  if(new TextEncoder().encode(text).byteLength>MAX_REPLAY_SAVE_BYTES)throw new RangeError('저장된 고정 예측의 크기 제한을 초과했습니다.');
  const owned=JSON.parse(text),{digest:savedDigest,...payload}=owned;
  if(await digest(payload)!==savedDigest)throw new Error('저장된 고정 예측의 값·범위·표식이 변경되어 복원하지 않았습니다. 기존 저장은 유지됩니다.');
  checkedView(payload.view);
  const captured=Date.parse(payload.capturedAt);
  if(!Number.isFinite(captured)||captured>now||!validDate(origin)||
    payload.atlasContext?.originDate!==origin||payload.atlasContext?.forecastOrigin!==payload.view.forecast.asOf)
    throw new RangeError('저장된 고정 예측의 기준일 또는 캡처 시각이 올바르지 않습니다.');
  freeze(owned);
  return Object.freeze({snapshot:owned,view:owned.view,atlasContext:owned.atlasContext,capturedAt:owned.capturedAt});
}

/** One explicit save, one atomic storage replacement. On quota/security failure
 * the caller keeps the session open and the previous stored bytes untouched. */
export function persistReplayDraft(storage,key,draft){
  if(draft?.mode==='atlas-chart'&&!draft.forecastSnapshot)throw new Error('고정 예측 원본이 없어 이번 세션을 저장하지 않았습니다.');
  const text=JSON.stringify(draft);
  if(new TextEncoder().encode(text).byteLength>MAX_REPLAY_SAVE_BYTES)throw new RangeError('고정 예측이 브라우저 저장 한도를 초과했습니다. 기존 저장은 유지됩니다.');
  storage.setItem(key,text);
}
