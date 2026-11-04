/** Research-0.1. These are explicit service assumptions, not the lecturer's fitted model. */
export const AXES = Object.freeze(['alpha', 'beta', 'gamma']);
export const AXIS_LABELS = Object.freeze({ alpha: 'α 성장', beta: 'β 유동성', gamma: 'γ 심리' });
export const RSI_REFERENCES = Object.freeze([
  Object.freeze({ label: '1차 매수 기준', threshold: 33.5 }), Object.freeze({ label: '2차 매수 기준', threshold: 29.5 }),
  Object.freeze({ label: '1차 매도 기준', threshold: 40 }), Object.freeze({ label: '2차 매도 기준', threshold: 43 }),
]);
const finite = x => typeof x === 'number' && Number.isFinite(x);
const object = x => x !== null && typeof x === 'object' && !Array.isArray(x);
const day = s => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && Number.isFinite(Date.parse(`${s}T00:00:00Z`)) && new Date(`${s}T00:00:00Z`).toISOString().slice(0,10) === s;
export const CLOCK_SKEW_MS = 300000;
export function calendarDate(now, timeZone = 'UTC') {
  const current = +now;
  if (!Number.isFinite(current) || typeof timeZone !== 'string' || !timeZone.trim()) return null;
  try {
    const parts = new Intl.DateTimeFormat('en-CA', { timeZone, year:'numeric', month:'2-digit', day:'2-digit' }).formatToParts(new Date(current));
    const map = Object.fromEntries(parts.map(part => [part.type, part.value]));
    const date = `${map.year}-${map.month}-${map.day}`;
    return day(date) ? date : null;
  } catch { return null; }
}
export function isFutureStamp(value, now, skewMs = CLOCK_SKEW_MS, timeZone) {
  const current = +now;
  if (!Number.isFinite(current) || !Number.isFinite(skewMs) || skewMs < 0) return true;
  if (day(value)) {
    const today = calendarDate(current, timeZone || 'UTC');
    return !today || value > today;
  }
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) && parsed > current + skewMs;
}
export function observationGate({ generatedAt, source, prices, now = new Date(), timeZone } = {}) {
  if (!source) return { ok:false, reason:'출처가 연결되지 않았습니다.' };
  if (source.status !== 'ready') return { ok:false, reason:source.error || '원천 수집이 완료되지 않았습니다.' };
  if (isFutureStamp(generatedAt, now) || isFutureStamp(source.retrievedAt, now)) return { ok:false, reason:'미래 수집·생성 시각은 현재 관측으로 표시하지 않습니다.' };
  const zone = timeZone || source.timezone;
  const last = prices?.at?.(-1);
  if (last && isFutureStamp(last[0], now, CLOCK_SKEW_MS, zone)) return { ok:false, reason: zone ? '미래 가격일은 표시하지 않습니다.' : '거래소 시간대가 없어 가격일을 UTC 달력으로 확인했고, 미래 가격일은 표시하지 않습니다.' };
  return { ok:true };
}
export function matchingIndex(rows, date, readDate = row => Array.isArray(row) ? row[0] : row?.date) {
  if (!day(date) || !Array.isArray(rows)) return null;
  const index = rows.findIndex(row => readDate(row) === date);
  return index < 0 ? null : index;
}
export const EXCHANGE_TIMEZONES = Object.freeze({ spx:'America/New_York', nasdaq:'America/New_York', tqqq:'America/New_York', soxl:'America/New_York', 'kodex-kosdaq150':'Asia/Seoul', vix:'America/New_York', kospi:'Asia/Seoul', kosdaq:'Asia/Seoul' });
export function exchangeTimezoneFor(id) { return EXCHANGE_TIMEZONES[id] || null; }
export function withExchangeTimezones(doc) {
  if (!object(doc)) fail('스냅샷이 없습니다.');
  const next = structuredClone(doc);
  for (const market of next.markets || []) {
    if (market.timezone) continue;
    const zone = exchangeTimezoneFor(market.id);
    if (!zone) continue;
    market.timezone = zone;
    market.timezoneBasis = 'symbol-exchange-default';
  }
  for (const source of next.sources || []) {
    if (source.timezone) continue;
    const id = source.id === 'kr-realized-vol' ? 'kospi' : source.id?.startsWith('market-') ? source.id.slice('market-'.length) : null;
    const zone = exchangeTimezoneFor(id);
    if (!zone) continue;
    source.timezone = zone;
    source.timezoneBasis = 'symbol-exchange-default';
  }
  return next;
}
export function evidenceHolds({ kiwoomExport = null, gdpVintage = null } = {}) {
  const holds = [];
  if (!kiwoomExport) holds.push({ id:'kiwoom-rsi', status:'deferred', reason:'키움 RSI 원본 내보내기가 없어 동등성을 주장하지 않습니다.' });
  if (!gdpVintage) holds.push({ id:'gdp-vintage', status:'deferred', reason:'GDP 과거 공표 시점 판본이 없어 실시간 백테스트를 주장하지 않습니다.' });
  return { kiwoomEquivalent:false, realtimeBacktest:false, holds };
}
export function resolveRsiSelection(prices, rows, priceIndex) {
  const date = Array.isArray(prices?.[priceIndex]) ? prices[priceIndex][0] : null;
  const rsiOscIndex = matchingIndex(rows, date, row => row?.date);
  return { date, rsiIndex: priceIndex, rsiOscIndex, unmatched: rsiOscIndex === null };
}
const text = x => typeof x === 'string' && x.trim().length > 0 && x.length <= 2000;
const iso = x => typeof x === 'string' && /T/.test(x) && Number.isFinite(Date.parse(x));
const fail = message => { throw new TypeError(message); };
const clip = (x, min, max) => Math.min(max, Math.max(min, x));
export function safeSourceUrl(value) {
  try { const u = new URL(value); return ['https:', 'http:'].includes(u.protocol) && !u.username && !u.password ? u.href : null; } catch { return null; }
}
export function validateSeries(rows, { positive = false, maximum = 25000 } = {}) {
  if (!Array.isArray(rows) || rows.length > maximum) fail('시계열 형식 또는 길이를 확인하세요.');
  let previous = '';
  for (const row of rows) {
    if (!Array.isArray(row) || row.length !== 2 || !day(row[0]) || row[0] <= previous || !finite(row[1]) || (positive && row[1] <= 0)) fail('시계열 날짜·정렬·중복·수치를 확인하세요.');
    previous = row[0];
  }
  return rows;
}
export function validateSnapshot(doc) {
  if (!object(doc) || doc.schemaVersion !== 1 || !iso(doc.generatedAt) || !text(doc.modelVersion)) fail('연구 데이터 판본을 확인하세요.');
  if (!Array.isArray(doc.sources) || doc.sources.length > 64 || !object(doc.regions) || !Array.isArray(doc.markets) || doc.markets.length > 12) fail('연구 데이터의 필수 항목이 없습니다.');
  const ids = new Set();
  for (const s of doc.sources) {
    if (!object(s) || !/^[a-z0-9-]+$/.test(s.id) || ids.has(s.id) || !text(s.label) || !safeSourceUrl(s.url) || !text(s.unit) || !text(s.frequency) || !iso(s.retrievedAt) || !['ready','error'].includes(s.status) || (s.lastObservation != null && !day(s.lastObservation))) fail('출처 식별·주소·시각을 확인하세요.');
    if ((s.linkLabel != null && !text(s.linkLabel)) || (s.displayDecimals != null && (!Number.isInteger(s.displayDecimals) || s.displayDecimals<0 || s.displayDecimals>6))) fail('출처 링크명·표시 정밀도를 확인하세요.');
    if (s.responseSha256 != null && !/^[a-f0-9]{64}$/.test(s.responseSha256)) fail('출처 해시 형식을 확인하세요.');
    ids.add(s.id);
  }
  for (const region of ['us', 'kr']) {
    const r = doc.regions[region];
    if (!object(r) || !text(r.label) || !object(r.axes)) fail('국내·미국 지표를 각각 준비하세요.');
    for (const key of AXES) {
      const a = r.axes[key];
      if (!object(a) || !ids.has(a.sourceId) || !text(a.metric) || ![1,-1].includes(a.direction) || !Number.isInteger(a.window) || a.window < 5 || a.window > 512 || !Number.isInteger(a.minSamples) || a.minSamples < 5 || a.minSamples > a.window || !finite(a.staleAfterDays) || a.staleAfterDays < 1 || a.staleAfterDays > 1000) fail('지표 정의·표준화 창·결측 정책을 확인하세요.');
      validateSeries(a.values);
    }
  }
  const markets = new Set();
  for (const m of doc.markets) {
    if (!object(m) || !['spx','nasdaq','kospi','kosdaq','tqqq','soxl','kodex-kosdaq150'].includes(m.id) || markets.has(m.id) || !text(m.symbol) || !text(m.name) || !['us','kr'].includes(m.region) || !text(m.unit) || !ids.has(m.sourceId)) fail('관측 시장의 식별 정보를 확인하세요.');
    validateSeries(m.prices, { positive: true });
    if (m.prices.some(([date]) => date > doc.generatedAt.slice(0,10))) fail('수집 시각 이후의 가격은 관측값이 아닙니다.');
    markets.add(m.id);
  }
  return doc;
}
export function median(values) {
  if (!values.length || values.some(v => !finite(v))) return null;
  const a = [...values].sort((x,y) => x-y), i = Math.floor(a.length/2);
  return a.length%2 ? a[i] : a[i-1]/2+a[i]/2;
}
export function robustLatest(rows, { direction = 1, window = 60, minSamples = 20 } = {}) {
  validateSeries(rows);
  if (![1,-1].includes(direction) || !Number.isInteger(window) || !Number.isInteger(minSamples) || minSamples < 1 || window < minSamples) fail('표준화 설정을 확인하세요.');
  const latest = rows.at(-1), history = rows.slice(Math.max(0, rows.length-1-window), -1).map(r => r[1]);
  if (!latest || history.length < minSamples) return { status: 'insufficient', z: null, samples: history.length };
  const center = median(history), scale = 1.4826 * median(history.map(v => Math.abs(v-center)));
  const magnitude = Math.max(...history.map(v => Math.abs(v)), Math.abs(center));
  if (!finite(scale) || scale === 0 || scale <= 1e-12 * Math.max(magnitude, 1e-12)) return { status: 'degenerate', z: null, samples: history.length, center, scale };
  const rawZ = direction * (latest[1]-center)/scale;
  return { status: 'ready', z: clip(rawZ,-3,3), rawZ, center, scale, samples: history.length, clipped: Math.abs(rawZ)>3 };
}
export function diagnoseRegion(doc, region, { now = new Date() } = {}) {
  validateSnapshot(doc);
  if (!['us','kr'].includes(region) || !Number.isFinite(+now)) fail('지역·조회 시각을 확인하세요.');
  const futureSnapshot = isFutureStamp(doc.generatedAt, now);
  const axes = AXES.map(key => {
    const a = doc.regions[region].axes[key], source = doc.sources.find(s => s.id === a.sourceId), latest = a.values.at(-1), stats = robustLatest(a.values, a);
    let status = stats.status, reason = '';
    if (futureSnapshot || isFutureStamp(source.retrievedAt, now) || (latest && isFutureStamp(latest[0], now))) { status='future'; reason='미래 관측·수집시각을 사용할 수 없습니다.'; }
    else if (source.status !== 'ready') { status='unavailable'; reason=source.error || '원천 수집이 완료되지 않았습니다.'; }
    else if (!latest) { status='missing'; reason='관측 자료가 없습니다.'; }
    else if ((+now-Date.parse(`${latest[0]}T00:00:00Z`))/86400000 > a.staleAfterDays) { status='stale'; reason='이 지표의 허용 관측 시차를 넘었습니다.'; }
    else if (status === 'insufficient') reason='현재 관측 이전의 보정 표본이 부족합니다.';
    else if (status === 'degenerate') reason='MAD가 0이거나 지원 수치 범위보다 작아 표준화하지 않습니다. 창 전체가 상수라는 뜻은 아닙니다.';
    return { key, label:AXIS_LABELS[key], metric:a.metric, latest:latest?.[1]??null, date:latest?.[0]??null, z:status==='ready'?stats.z:null, contribution:status==='ready'?stats.z/3:null, status, source, reason, calibration:stats, window:a.window, direction:a.direction };
  });
  const coverage = axes.filter(a=>a.status==='ready').length;
  let score = coverage===3 ? axes.reduce((s,a)=>s+a.contribution,0) : null;
  const rawMean = coverage===3 ? axes.reduce((s,a)=>s+(a.calibration?.rawZ??0)/3,0) : null;
  const signFlipped = score!==null && rawMean!==null && score!==0 && rawMean!==0 && Math.sign(score)!==Math.sign(rawMean);
  if (signFlipped) score = null;
  return { region, label:doc.regions[region].label, status:score!==null?'ready':'withheld', score, scoreLabel:score===null?(signFlipped?'제한 부호 역전 · 판단 유보':'판단 유보'):score>.5?'양의 설명 압력':score<-.5?'음의 설명 압력':'작은 합성 점수', axes, coverage, total:3, clipSignReversed:signFlipped, rawMean,
    notes:['동일 1/3 비중·±3 표준화 제한·±0.5 구분은 서비스 가정이며 학습된 계수가 아닙니다.','GDP·시장금리·변동성은 원문 개념의 일부 대리지표이며 EPS·재정·AAII를 모두 측정하지 않습니다.','±0.5 안은 작은 합성 점수이며 축이 서로 상쇄됐다는 뜻은 아닙니다.','현재 수정판 자료의 횡단 진단입니다. 실시간 투자 신호·확률·검증된 과거 예측 성과가 아닙니다.',...(signFlipped?['±3 제한이 합성 부호를 뒤집었습니다. 제한 전 평균과 제한 후 점수를 같은 방향의 압력으로 읽지 않습니다.']:[])] };
}
export function positiveFactorScenario({ alpha=0, beta=0, gamma=0, weights=[1,1,1], sensitivity=.1 } = {}) {
  const shocks = [alpha,beta,gamma];
  if (shocks.some(v=>!finite(v)||Math.abs(v)>3) || !Array.isArray(weights) || weights.length!==3 || weights.some(v=>!finite(v)||v<0||v>100) || !finite(sensitivity) || sensitivity<0 || sensitivity>1) fail('조건 실험의 입력 범위를 확인하세요.');
  const total = weights.reduce((a,b)=>a+b,0); if (total<=0) fail('가중치 합은 0보다 커야 합니다.');
  const normalizedWeights=weights.map(w=>w/total), contributions=shocks.map((s,i)=>s*normalizedWeights[i]), pressure=contributions.reduce((a,b)=>a+b,0), factors=contributions.map(c=>Math.exp(sensitivity*c));
  return { pressure, contributions, factors, index:100*Math.exp(sensitivity*pressure), weights:normalizedWeights, sensitivity, kind:'hypothetical_dimensionless_index' };
}
export function calculateRsiSeries(prices, period=14, signalPeriod=9) {
  validateSeries(prices,{positive:true});
  if (!Number.isInteger(period)||period<2||period>250||!Number.isInteger(signalPeriod)||signalPeriod<1||signalPeriod>250) fail('RSI와 시그널 기간을 확인하세요.');
  const anchor = prices[0][1];
  const factor = anchor > 0 && anchor < 1 ? 1/anchor : 1;
  let avgGain=0, avgLoss=0; const buffer=[];
  return prices.map(([date,close],i)=>{
    let rsi=null,signal=null;
    if (i>0) {
      const delta=(close-prices[i-1][1])*factor,gain=Math.max(delta,0),loss=Math.max(-delta,0);
      if(i<=period){avgGain+=gain/period;avgLoss+=loss/period;}else{avgGain+=(gain-avgGain)/period;avgLoss+=(loss-avgLoss)/period;}
      if(i>=period){rsi=avgGain===0&&avgLoss===0?50:avgLoss===0?100:avgGain===0?0:100-100/(1+avgGain/avgLoss);buffer.push(rsi);if(buffer.length>signalPeriod)buffer.shift();if(buffer.length===signalPeriod)signal=buffer.reduce((a,b)=>a+b,0)/signalPeriod;}
    }
    return {date,close,rsi,signal};
  });
}
export function thresholdPositions(rsi) {
  if(rsi==null)return [];
  if(!finite(rsi)||rsi<0||rsi>100)fail('RSI는 0~100의 수치여야 합니다.');
  return RSI_REFERENCES.map(r=>({...r,difference:rsi-r.threshold,position:rsi===r.threshold?'equal':rsi<r.threshold?'below':'above'}));
}
export function assetEconomics({costBasis,residual=0,lifeYears,annualRevenue,annualOpex,discountRate=0}) {
  if(![costBasis,residual,annualRevenue,annualOpex,discountRate].every(finite)||Math.max(costBasis,residual,annualRevenue,annualOpex)>1e15||costBasis<=0||residual<0||residual>costBasis||annualRevenue<0||annualOpex<0||discountRate<0||discountRate>1||!Number.isInteger(lifeYears)||lifeYears<1||lifeYears>100)fail('취득원가·잔존가치·연간 현금흐름·내용연수 입력을 확인하세요.');
  const depreciation=(costBasis-residual)/lifeYears,operatingCash=annualRevenue-annualOpex,operatingProfit=operatingCash-depreciation;
  const presentCash=discountRate===0?operatingCash*lifeYears:operatingCash*(-Math.expm1(-lifeYears*Math.log1p(discountRate)))/discountRate;
  if (Math.abs(operatingCash) > Number.MAX_SAFE_INTEGER / lifeYears) fail('연간 운영현금과 내용연수의 곱이 안전한 정수 범위를 넘습니다.');
  const operatingPaybackYears=operatingCash>0&&Number.isFinite(costBasis/operatingCash)?costBasis/operatingCash:null;
  if (operatingPaybackYears!==null && (!Number.isFinite(operatingPaybackYears) || operatingPaybackYears>1e6)) fail('회수기간이 표시 가능한 범위를 넘습니다.');
  const recoveredWithinLife=operatingPaybackYears!==null&&operatingPaybackYears<=lifeYears;
  const terminalCash=operatingCash*lifeYears+residual;
  if (!Number.isFinite(terminalCash)) fail('말기 현금 합이 표시 가능한 범위를 넘습니다.');
  const nominalTerminalRecovery=terminalCash + 1e-9*costBasis >= costBasis;
  const yearText=v=>String(Math.round(v*100)/100);
  const summary=`${operatingPaybackYears===null?'운영현금만으로는 회수기간을 계산하지 않습니다':`운영현금만 외삽하면 ${yearText(operatingPaybackYears)}년`}. ${recoveredWithinLife?'내용연수 안에 운영현금으로 회수합니다':'내용연수 안에서는 운영현금으로 미회수입니다'}. ${nominalTerminalRecovery?'말기 잔존현금까지 포함하면 명목원금 회수가 가능합니다':'말기 잔존현금까지 포함해도 명목원금은 미회수입니다'}. 할인 전·연중 균등 보간이며 회계상 회수 완료가 아닙니다.`;
  return {depreciation,operatingProfit,operatingCash,npv:-costBasis+presentCash+residual/Math.pow(1+discountRate,lifeYears),paybackYears:operatingPaybackYears,operatingPaybackYears,recoveredWithinLife,nominalTerminalRecovery,summary};
}
export function realizedVolatility(prices, window=20, annualization=252) {
  validateSeries(prices,{positive:true});
  if(!Number.isInteger(window)||window<2||window>250||!finite(annualization)||annualization<=0)fail('변동성 기간을 확인하세요.');
  const returns=prices.slice(1).map((p,i)=>Math.log(p[1])-Math.log(prices[i][1])),out=[];
  for(let i=window-1;i<returns.length;i++){
    const sample=returns.slice(i-window+1,i+1),mean=sample.reduce((a,b)=>a+b,0)/window;
    const variance=sample.reduce((a,b)=>a+(b-mean)**2,0)/(window-1);
    out.push([prices[i+1][0],Math.sqrt(variance*annualization)*100]);
  }
  return out;
}
