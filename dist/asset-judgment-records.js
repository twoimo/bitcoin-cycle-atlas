/** Saved calculation captures, never proof of deployment or historical availability. */
export const SAVED_JUDGMENT_SYMBOLS = Object.freeze(['BTC','SPY','QQQ','NVDA','AAPL','GOOG','MSFT','AMZN','META','AVGO','PLTR','TSLA','HOOD','TLT','IEF','GLD','SLV','PDBC']);
export const SAVED_JUDGMENT_KIND = 'saved-snapshot';
export const SAVED_JUDGMENT_FILE = /^\d{4}-\d{2}-\d{2}T\d{9}Z-[a-f0-9]{12}\.json$/;
const HASH=/^[a-f0-9]{64}$/;
const isHash=value=>typeof value==='string'&&HASH.test(value);
const labels=Object.freeze({'strong-buy':'적극 매수',buy:'분할 매수',neutral:'중립',sell:'분할 매도','strong-sell':'적극 매도',unavailable:'판단 보류'});
const numeric=['meanRisePct','meanFallPct','meanMddPct','yearStartPrice','latestPrice','ytdPct'];
const dates=['yearStartDate','latestDate','firstDate','lastDate','firstPartialStartDate'];
const strings=['name','group','category','currency'];
const stamp=s=>typeof s==='string'&&/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(s)&&Number.isFinite(Date.parse(s));
const date=s=>typeof s==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(s)&&Number.isFinite(Date.parse(s+'T00:00:00Z'))&&new Date(s+'T00:00:00Z').toISOString().slice(0,10)===s;
const own=(o,k)=>Object.prototype.hasOwnProperty.call(o,k);
const fail=message=>{throw new TypeError(`저장 판단 기록 검증 실패: ${message}`);};
function text(s,label){if(typeof s!=='string'||!s.trim())fail(label);}
function numberOrNull(v,label){if(v!==null&&(typeof v!=='number'||!Number.isFinite(v)))fail(label);}
function dateOrNull(v,label){if(v!==null&&!date(v))fail(label);}
function frozen(value){if(value&&typeof value==='object'&&!Object.isFrozen(value)){for(const v of Object.values(value))frozen(v);Object.freeze(value);}return value;}
function groupFor(symbol){return ['TLT','IEF','GLD','SLV'].includes(symbol)?'안전 자산':symbol==='PDBC'?'대체자산':'위험 자산';}
export function validateSavedJudgmentEntry(entry){
  if(!entry||typeof entry!=='object'||Array.isArray(entry)||!SAVED_JUDGMENT_FILE.test(entry.file))fail('안전한 기록 파일명 필요');
  if(!isHash(entry.sha256)||!isHash(entry.sourceVersion)||!isHash(entry.rulesVersion))fail('기록·원자료·규칙 해시');
  if(entry.id!==entry.file.slice(0,-5)||!stamp(entry.capturedAt)||new Date(entry.capturedAt).toISOString()!==entry.capturedAt||!date(entry.asOf)||entry.asOf!==entry.capturedAt.slice(0,10))fail('기록 식별자·실제 저장 시각');
  if(!entry.id.startsWith(entry.capturedAt.replace(/[:.]/g,'')+'-'))fail('파일명과 저장 시각 불일치');
  return {...entry};
}
export function validateSavedJudgmentIndex(index){
  if(!index||index.version!==1||!Array.isArray(index.records))fail('기록 목록 형식');
  const ids=new Set(),files=new Set();let prior=null;
  for(const entry of index.records){validateSavedJudgmentEntry(entry);if(ids.has(entry.id)||files.has(entry.file))fail('중복 기록');ids.add(entry.id);files.add(entry.file);if(prior&&(prior.capturedAt<entry.capturedAt||(prior.capturedAt===entry.capturedAt&&prior.id.localeCompare(entry.id)<0)))fail('목록은 최신 저장 순서여야 합니다');prior=entry;}
  return index;
}
export function validateSavedJudgmentRecord(record,{entry}={}){
  if(!record||record.version!==1||record.kind!==SAVED_JUDGMENT_KIND||!Array.isArray(record.rows)||record.rows.length!==18)fail('실제 저장 스냅샷·18개 자산 필요');
  if(!stamp(record.capturedAt)||new Date(record.capturedAt).toISOString()!==record.capturedAt||!date(record.asOf)||record.asOf!==record.capturedAt.slice(0,10))fail('실제 UTC 저장일과 판단 기준일');
  if(!SAVED_JUDGMENT_FILE.test(record.id+'.json')||!record.id.startsWith(record.capturedAt.replace(/[:.]/g,'')+'-'))fail('기록 식별자');
  if(!record.source||!isHash(record.source.hash)||!stamp(record.source.retrievedAt)||Date.parse(record.source.retrievedAt)>Date.parse(record.capturedAt))fail('원자료 버전·수집 시각');
  if(!record.rules||!isHash(record.rules.sha256)||!Number.isSafeInteger(record.rules.version)||record.rules.version<1)fail('계산 규칙 버전');
  const symbols=new Set();
  for(const row of record.rows){
    if(!row||!SAVED_JUDGMENT_SYMBOLS.includes(row.symbol)||symbols.has(row.symbol))fail('자산 누락 또는 중복');symbols.add(row.symbol);
    for(const key of strings)text(row[key],`${row.symbol} ${key}`);
    if(row.group!==groupFor(row.symbol)||row.currency!=='USD'||own(row,'meta')||own(row,'samples'))fail('자산군·통화·제외 필드');
    for(const key of numeric){if(!own(row,key))fail(key);numberOrNull(row[key],key);}
    for(const key of dates){if(!own(row,key))fail(key);dateOrNull(row[key],key);}
    if((row.latestPrice!==null&&row.latestPrice<=0)||(row.yearStartPrice!==null&&row.yearStartPrice<=0))fail('양수 종가');
    if(row.latestDate!==null&&row.latestDate>record.asOf)fail('미래 관측값');
    if(!Number.isSafeInteger(row.sampleYears)||row.sampleYears<0||!Number.isSafeInteger(row.observationCount)||row.observationCount<0||typeof row.samplePartialFirstYear!=='boolean')fail('표본·관측 수');
    for(const key of ['sampleStartYear','sampleEndYear'])if(row[key]!==null&&(!Number.isSafeInteger(row[key])||row[key]<0||row[key]>=Number(record.asOf.slice(0,4))))fail(key);
    if(row.sampleYears===0?(row.sampleStartYear!==null||row.sampleEndYear!==null):(row.sampleStartYear===null||row.sampleEndYear===null||row.sampleStartYear>row.sampleEndYear))fail('표본 범위');
    const j=row.judgment;if(!j||!own(labels,j.id)||j.label!==labels[j.id]||typeof j.available!=='boolean'||j.available!==(j.id!=='unavailable'))fail('판단 구분');text(j.reason,'판단 이유');
    if(j.thresholds!==null){if(!j.thresholds||typeof j.thresholds!=='object')fail('판단 경계');for(const key of ['strongBuyPct','buyPct','sellPct','strongSellPct'])if(typeof j.thresholds[key]!=='number'||!Number.isFinite(j.thresholds[key]))fail('판단 경계');}
    const c=row.coverage;if(!c||!['observed','incomplete','unavailable'].includes(c.status)||typeof c.complete!=='boolean'||!Array.isArray(c.issues)||!c.issues.every(x=>typeof x==='string')||!Array.isArray(c.missingDates)||!c.missingDates.every(date)||!Array.isArray(c.missingYears)||!c.missingYears.every(Number.isSafeInteger)||!Number.isSafeInteger(c.gapCount)||c.gapCount<0||typeof c.firstYearPartial!=='boolean'||c.complete!==(c.status==='observed'))fail('관측 범위');dateOrNull(c.firstPartialStartDate,'첫 부분 연도');
    if(j.available&&(row.sampleYears<5||!c.complete||!(row.meanRisePct>0&&row.meanFallPct<0)||row.ytdPct===null||row.yearStartPrice===null||row.latestPrice===null))fail('유효하지 않은 판단');
    const source=row.source;if(!source||source.currency!=='USD'||!stamp(source.retrievedAt)||Date.parse(source.retrievedAt)>Date.parse(record.capturedAt)||!Number.isSafeInteger(source.count)||source.count<1)fail('종목별 출처·수집 시각');
    for(const key of ['name','url','priceDefinition'])text(source[key],'종목별 출처');
    try{if(!['https:','http:'].includes(new URL(source.url).protocol))fail('출처 URL');}catch{fail('출처 URL');}
    if(!date(source.firstDate)||!date(source.lastDate)||source.firstDate>source.lastDate)fail('출처 관측 범위');
    if(source.responseSha256!==null&&!isHash(source.responseSha256))fail('출처 해시');
  }
  if(entry){validateSavedJudgmentEntry(entry);if(record.id!==entry.id||record.capturedAt!==entry.capturedAt||record.asOf!==entry.asOf||record.source.hash!==entry.sourceVersion||record.rules.sha256!==entry.rulesVersion)fail('목록과 원본 기록 불일치');}
  return record;
}
export async function judgmentRecordSha256(raw){if(!globalThis.crypto?.subtle)throw new Error('저장 기록의 해시를 검증할 수 없습니다.');return [...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(raw)))].map(v=>v.toString(16).padStart(2,'0')).join('');}
async function responseText(response,maxBytes){
  if(!response?.ok)throw new Error(`저장 판단 기록을 불러오지 못했습니다 (${response?.status??'응답 없음'}).`);
  if(response.body?.getReader){const reader=response.body.getReader(),decoder=new TextDecoder('utf-8',{fatal:true});let size=0,text='';try{while(true){const part=await reader.read();if(part.done)break;size+=part.value.byteLength;if(size>maxBytes){await reader.cancel();throw new RangeError('저장 판단 기록이 허용 크기를 넘었습니다.');}text+=decoder.decode(part.value,{stream:true});}return text+decoder.decode();}finally{reader.releaseLock();}}
  const raw=await response.text();if(new TextEncoder().encode(raw).length>maxBytes)throw new RangeError('저장 판단 기록이 허용 크기를 넘었습니다.');return raw;
}
export function createSavedJudgmentLoader({fetchImpl=globalThis.fetch,embeddedIndex=()=>globalThis.document?.getElementById('embedded-judgment-snapshot-index')?.textContent??null,embeddedRecords=()=>globalThis.document?.getElementById('embedded-judgment-snapshots')?.textContent??null}={}){
  let indexPending=null;const recordsPending=new Map();
  async function fetchRaw(file,maxBytes){if(typeof fetchImpl!=='function')throw new Error('저장 기록을 불러올 수 없습니다.');return responseText(await fetchImpl('./data/judgment-snapshots/'+file,{cache:'no-cache',credentials:'same-origin',redirect:'error',signal:AbortSignal.timeout(20000)}),maxBytes);}
  function list(){if(indexPending)return indexPending;indexPending=Promise.resolve().then(async()=>{const embedded=embeddedIndex();if(embedded!==null&&typeof embedded!=='string')fail('내장 목록');const raw=embedded??await fetchRaw('index.json',16*1024*1024);return frozen(validateSavedJudgmentIndex(JSON.parse(raw)));}).finally(()=>{indexPending=null;});return indexPending;}
  function load(entry){let e;try{e=validateSavedJudgmentEntry(entry);}catch(error){return Promise.reject(error);}const key=e.file+'|'+e.sha256;if(recordsPending.has(key))return recordsPending.get(key);const pending=Promise.resolve().then(async()=>{const embedded=embeddedRecords();if(embedded!==null&&typeof embedded!=='string')fail('내장 기록');let raw;if(embedded!==null){const map=JSON.parse(embedded);if(!map||Array.isArray(map)||typeof map!=='object')fail('내장 기록 매핑');if(own(map,e.file)){raw=map[e.file];if(typeof raw!=='string')fail('내장 기록 원본 바이트');}}
      if(raw===undefined)raw=await fetchRaw(e.file,2*1024*1024);if(await judgmentRecordSha256(raw)!==e.sha256)fail('기록 해시 불일치');return frozen(validateSavedJudgmentRecord(JSON.parse(raw),{entry:e}));}).finally(()=>recordsPending.delete(key));recordsPending.set(key,pending);return pending;}
  return Object.freeze({list,load});
}
function cell(value){if(value===null||value===undefined)return '';let s=String(value);if(typeof value!=='number'&&(/^[\u0000-\u0020]*[=+\-@]/.test(s)||/^[\t\r]/.test(s)))s="'"+s;return /[",\r\n]/.test(s)?'"'+s.replaceAll('"','""')+'"':s;}
export function savedJudgmentsCsv(record){validateSavedJudgmentRecord(record);const head=['kind','captured_at_utc','as_of_utc_date','source_version_sha256','rules_sha256','rules_version','group','symbol','name','observation_date','year_start_date','year_start_close','latest_close','year_to_date_pct','sample_years','mean_rise_pct','mean_fall_pct_not_mdd','judgment','judgment_available','judgment_reason','asset_source','asset_source_url','asset_retrieved_at'];const rows=record.rows.map(r=>[record.kind,record.capturedAt,record.asOf,record.source.hash,record.rules.sha256,record.rules.version,r.group,r.symbol,r.name,r.latestDate,r.yearStartDate,r.yearStartPrice,r.latestPrice,r.ytdPct,r.sampleYears,r.meanRisePct,r.meanFallPct,r.judgment.label,r.judgment.available,r.judgment.reason,r.source.name,r.source.url,r.source.retrievedAt]);return '\uFEFF'+[head,...rows].map(r=>r.map(cell).join(',')).join('\r\n')+'\r\n';}
