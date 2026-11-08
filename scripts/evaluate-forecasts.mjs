#!/usr/bin/env node
/**
 * WP1: 워크포워드 평가 하네스(지표만 계산, 모델·화면은 건드리지 않는다).
 *
 * 벤치마크
 *  - flat      : 마지막 가격이 그대로 유지된다고 가정(로그수익률 0)
 *  - rw        : 무작위보행. 직전 창(일봉 90, 월봉 12)의 로그수익률 표준편차로 정규 구간
 *  - ewma      : 같은 중심, EWMA(λ=0.94) 변동성. GARCH(1,1)의 근사이며 정식 적합이 아니다.
 *
 * 산출: 지평별 실측 커버리지(50/80), pinball 손실, 구간 기반 CRPS 근사,
 *       평균절대%오차, 로그 MAE, flat 대비 skill, 표준화잔차 평균·첨도, 표본수, 충분성 등급.
 * 외부 API를 쓰지 않고 저장소에 커밋된 데이터만 사용한다.
 */
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SCRIPT_VERSION = '1.0.0';
const OUT_DIR = resolve(root, 'dist/data/forecast-evaluation');
const HORIZONS = { 'calendar-day': [30, 90, 180, 365], session: [30, 90, 180, 365], month: [3, 6, 12] };
const WINDOW = { 'calendar-day': 90, session: 90, month: 12 };
const Z = { 0.1: -1.2815515655446004, 0.9: 1.2815515655446004, 0.25: -0.6744897501960817, 0.75: 0.6744897501960817 };

const readJson = async (rel) => {
  const abs = resolve(root, rel);
  const text = await readFile(abs, 'utf8');
  return { json: JSON.parse(text), hash: createHash('sha256').update(text).digest('hex'), path: rel };
};

const series = [];
{
  const d = await readJson('dist/data/btc-daily.json');
  series.push({ id: 'BTC', unit: 'calendar-day', rows: d.json.prices.map(([date, close]) => [date, close]), source: d.path, hash: d.hash });
}
{
  const d = await readJson('dist/data/eth-ohlc.json');
  series.push({ id: 'ETH', unit: 'calendar-day', rows: d.json.dailyHistory.candles.map((c) => [c.date.slice(0, 10), c.close]), source: d.path, hash: d.hash });
}
{
  const d = await readJson('dist/data/market-lab.json');
  for (const m of d.json.markets) series.push({ id: m.id.toUpperCase(), unit: 'session', rows: m.prices, source: d.path, hash: d.hash });
}
{
  const d = await readJson('dist/data/mstr-ohlc.json');
  series.push({ id: 'MSTR', unit: 'session', rows: d.json.candles.map((c) => [c.sessionDate, c.close]), source: d.path, hash: d.hash });
}
{
  const d = await readJson('dist/data/bmnr-ohlc.json');
  series.push({ id: 'BMNR', unit: 'session', rows: d.json.candles.map((c) => [c.sessionDate, c.close]), source: d.path, hash: d.hash });
}
{
  const d = await readJson('dist/data/housing.json');
  for (const key of Object.keys(d.json.regions)) {
    const r = d.json.regions[key];
    series.push({ id: `HOUSING-${r.label}`, unit: 'month', rows: r.price.filter(([, v]) => Number.isFinite(v)), source: d.path, hash: d.hash });
  }
}

const mean = (a) => a.reduce((x, y) => x + y, 0) / a.length;
const stdev = (a) => { const m = mean(a); return Math.sqrt(a.reduce((s, v) => s + (v - m) ** 2, 0) / (a.length - 1)); };
const pinball = (actual, pred, q) => (actual - pred) * (q - (actual < pred ? 1 : 0));
const quantile = (a, p) => { const b = [...a].sort((x, y) => x - y); return b[Math.floor(p * (b.length - 1))]; };

function tierOf(observations, years, evalSamples) {
  if (years < 3 || evalSamples < 100) return 'T3-insufficient';
  if (years < 10 || evalSamples < 500) return 'T2-limited';
  return 'T1-eligible';
}

const rows = [];
const assetMeta = [];

for (const s of series) {
  const rowsRaw = s.rows.filter(([, close]) => Number.isFinite(close) && close > 0).sort((a, b) => (a[0] < b[0] ? -1 : 1));
  const logP = rowsRaw.map(([, close]) => Math.log(close));
  const rets = logP.map((v, i) => (i === 0 ? null : v - logP[i - 1]));
  const win = WINDOW[s.unit];
  const years = (new Date(rowsRaw[rowsRaw.length - 1][0]) - new Date(rowsRaw[0][0])) / (365.25 * 24 * 3600 * 1000);
  const horizons = HORIZONS[s.unit];
  const maxEval = Math.max(0, logP.length - win - Math.max(...horizons));
  assetMeta.push({ id: s.id, unit: s.unit, source: s.source, sourceHash: s.hash, observations: logP.length, years: +years.toFixed(1), maxEvalSamples: maxEval, tier: tierOf(logP.length, years, maxEval) });

  for (const h of horizons) {
    const acc = { n: 0, rwIn80: 0, rwIn50: 0, ewIn80: 0, ewIn50: 0, drIn80: 0, pinRw: [], pinEw: [], pinDr: [], apeRw: [], logRw: [], logFlat: [], logDr: [], z: [] };
    let ewVar = null;
    for (let i = 0; i < logP.length; i += 1) {
      const r = rets[i];
      if (r !== null) ewVar = ewVar === null ? r * r : 0.94 * ewVar + 0.06 * r * r;
      if (i < win || rets[i] === null) continue;
      const tail = rets.slice(i - win + 1, i + 1);
      const sigma = stdev(tail);
      if (!(sigma > 0)) continue;
      const target = i + h;
      if (target >= logP.length) continue;
      const actual = logP[target] - logP[i];
      const mu = mean(tail) * h;
      const scaleRw = sigma * Math.sqrt(h);
      const scaleEw = Math.sqrt(ewVar) * Math.sqrt(h);
      acc.n += 1;
      if (actual >= Z[0.1] * scaleRw && actual <= Z[0.9] * scaleRw) acc.rwIn80 += 1;
      if (actual >= Z[0.25] * scaleRw && actual <= Z[0.75] * scaleRw) acc.rwIn50 += 1;
      if (actual >= Z[0.1] * scaleEw && actual <= Z[0.9] * scaleEw) acc.ewIn80 += 1;
      if (actual >= Z[0.25] * scaleEw && actual <= Z[0.75] * scaleEw) acc.ewIn50 += 1;
      if (actual >= mu + Z[0.1] * scaleRw && actual <= mu + Z[0.9] * scaleRw) acc.drIn80 += 1;
      acc.pinDr.push(pinball(actual, mu, 0.5), pinball(actual, mu + scaleRw * Z[0.1], 0.1), pinball(actual, mu + scaleRw * Z[0.9], 0.9));
      acc.logDr.push(Math.abs(actual - mu));
      acc.pinRw.push(pinball(actual, 0, 0.5), pinball(actual, scaleRw * Z[0.1], 0.1), pinball(actual, scaleRw * Z[0.9], 0.9));
      acc.pinEw.push(pinball(actual, 0, 0.5), pinball(actual, scaleEw * Z[0.1], 0.1), pinball(actual, scaleEw * Z[0.9], 0.9));
      acc.apeRw.push(Math.abs(Math.exp(actual) - 1) * 100);
      acc.logRw.push(Math.abs(actual));
      acc.logFlat.push(Math.abs(actual));
      acc.z.push(actual / scaleRw);
    }
    if (acc.n < 100) {
      rows.push({ asset: s.id, unit: s.unit, horizon: h, samples: acc.n, status: 'insufficient-samples' });
      continue;
    }
    const zMean = mean(acc.z);
    const zVar = mean(acc.z.map((v) => (v - zMean) ** 2));
    const kurt = mean(acc.z.map((v) => (v - zMean) ** 4)) / (zVar * zVar);
    const logRw = mean(acc.logRw);
    const logFlat = mean(acc.logFlat);
    const logDr = mean(acc.logDr);
    rows.push({
      asset: s.id,
      unit: s.unit,
      horizon: h,
      samples: acc.n,
      coverage80: { rw: +(100 * acc.rwIn80 / acc.n).toFixed(1), ewma: +(100 * acc.ewIn80 / acc.n).toFixed(1) },
      coverage50: { rw: +(100 * acc.rwIn50 / acc.n).toFixed(1), ewma: +(100 * acc.ewIn50 / acc.n).toFixed(1) },
      pinball: { rw: +mean(acc.pinRw).toFixed(5), ewma: +mean(acc.pinEw).toFixed(5) },
      meanAbsPctError: +mean(acc.apeRw).toFixed(1),
      meanAbsLogError: { rw: +logRw.toFixed(4), drift: +logDr.toFixed(4), flat: +logFlat.toFixed(4) },
      skillVsFlat: +(1 - logDr / logFlat).toFixed(3),
      skillPinballEwmaVsRw: +(1 - mean(acc.pinEw) / mean(acc.pinRw)).toFixed(3),
      driftCoverage80: +(100 * acc.drIn80 / acc.n).toFixed(1),
      zMean: +zMean.toFixed(2),
      zKurtosis: +kurt.toFixed(1),
      widthScale80: +(quantile(acc.z.map(Math.abs), 0.8) / 1.2815515655446004).toFixed(2)
    });
  }
}

const payload = {
  schemaVersion: 1,
  kind: 'atlas-forecast-evaluation',
  scriptVersion: SCRIPT_VERSION,
  generatedAt: new Date().toISOString(),
  horizons: HORIZONS,
  window: WINDOW,
  benchmarkMeaning: {
    flat: '마지막 가격 유지(로그수익률 0)',
    rw: '무작위보행 + 직전 창 변동성, 정규분포 구간',
    ewma: 'EWMA(λ=0.94) 변동성 근사. GARCH(1,1)-t의 정식 적합이 아니다'
  },
  assets: assetMeta,
  rows,
  notes: [
    '커버리지는 명목 50%·80% 구간에 실제 로그수익률이 들어온 비율이다.',
    'skillVsFlat은 로그 MAE 기준 1 - model/flat 이며, 0보다 크면 flat보다 낫다는 뜻이다. 표본이 작으면 판별력이 없다.',
    'zMean이 0에서 멀면 드리프트 편향, zKurtosis가 3보다 크면 정규분포보다 두꺼운 꼬리다.',
    '이 스크립트는 모델을 바꾸지 않는다. 화면·예측 경로·배포에는 어떤 변경도 가하지 않는다.'
  ]
};

await mkdir(OUT_DIR, { recursive: true });
await writeFile(resolve(OUT_DIR, 'summary.json'), JSON.stringify(payload, null, 2) + '\n');

const fmt = (v) => (typeof v === 'number' ? v : '');
console.log('asset                 unit          h   n   cov80(rw/ew/drift)  cov50(rw)  MAPE   logMAE(flat/drift)   skill  pinSkill   k80  zMean kurt');
for (const r of rows) {
  if (r.status) { console.log(`${r.asset.padEnd(20)} ${r.unit.padEnd(12)} ${String(r.horizon).padStart(3)} ${String(r.samples).padStart(5)}  ${r.status}`); continue; }
  console.log(
    `${r.asset.padEnd(20)} ${r.unit.padEnd(12)} ${String(r.horizon).padStart(3)} ${String(r.samples).padStart(5)}  ` +
    `${(r.coverage80.rw + '/' + r.coverage80.ewma + '/' + r.driftCoverage80).padStart(14)}  ${String(r.coverage50.rw).padStart(8)}  ` +
    `${String(r.meanAbsPctError).padStart(5)}%  ${(r.meanAbsLogError.flat + '/' + r.meanAbsLogError.drift).padStart(19)}  ` +
    `${String(r.skillVsFlat).padStart(6)}  ${String(r.skillPinballEwmaVsRw).padStart(8)}  ${String(r.widthScale80).padStart(4)}  ${String(r.zMean).padStart(5)}  ${String(r.zKurtosis).padStart(4)}`
  );
}
console.log(`\nassets: ${assetMeta.map((a) => `${a.id}(${a.tier}, n=${a.observations})`).join(', ')}`);
console.log(`wrote ${OUT_DIR}/summary.json`);
