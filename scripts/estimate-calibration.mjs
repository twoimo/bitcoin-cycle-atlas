#!/usr/bin/env node
/**
 * WP2: 실제 데이터로 보정 계수를 추정하고 홀드아웃에서 재검증한다.
 * 산출: dist/data/forecast-calibration/factors.json
 */
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { applyCalibration, estimateFactors, scoreHoldout, splitResiduals, withinTolerance } from '../dist/forecast-calibration.js';
import { classifySufficiency, horizonUnit } from '../dist/forecast-sufficiency.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT_DIR = resolve(root, 'dist/data/forecast-calibration');
const readJson = async (rel) => {
  const text = await readFile(resolve(root, rel), 'utf8');
  return { json: JSON.parse(text), hash: createHash('sha256').update(text).digest('hex'), path: rel };
};
const mean = (a) => a.reduce((x, y) => x + y, 0) / a.length;
const stdev = (a) => { const m = mean(a); return Math.sqrt(a.reduce((s, v) => s + (v - m) ** 2, 0) / (a.length - 1)); };

const series = [];
{
  const d = await readJson('dist/data/btc-daily.json');
  series.push({ id: 'BTC', unit: 'calendar-day', rows: d.json.prices, source: d.path, hash: d.hash });
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
  const d = await readJson('dist/data/housing.json');
  for (const key of Object.keys(d.json.regions)) {
    const r = d.json.regions[key];
    series.push({ id: `HOUSING-${r.label}`, unit: 'month', rows: r.price.filter(([, v]) => Number.isFinite(v)), source: d.path, hash: d.hash });
  }
}

const results = [];
for (const s of series) {
  const rows = s.rows.filter(([, c]) => Number.isFinite(c) && c > 0).sort((a, b) => (a[0] < b[0] ? -1 : 1));
  const logP = rows.map(([, c]) => Math.log(c));
  const rets = logP.map((v, i) => (i === 0 ? null : v - logP[i - 1]));
  const { horizons, window } = horizonUnit(s.unit);
  const years = (new Date(rows[rows.length - 1][0]) - new Date(rows[0][0])) / (365.25 * 24 * 3600 * 1000);
  for (const h of horizons) {
    const zs = [];
    for (let i = window; i < logP.length; i += 1) {
      if (rets[i] === null) continue;
      const target = i + h;
      if (target >= logP.length) continue;
      const sigma = stdev(rets.slice(i - window + 1, i + 1));
      if (!(sigma > 0)) continue;
      zs.push((logP[target] - logP[i]) / (sigma * Math.sqrt(h)));
    }
    const evalSamples = zs.length;
    const tier = classifySufficiency({ observations: logP.length, years, evalSamples }).tier;
    if (tier === 'T3') {
      results.push({ asset: s.id, unit: s.unit, horizon: h, tier, samples: evalSamples, status: 'T3-경로 미제공' });
      continue;
    }
    const { fit, holdout } = splitResiduals(zs);
    const factors = estimateFactors(fit);
    const score = scoreHoldout(holdout.map((v) => ({ z: v })), factors);
    const example = applyCalibration({ sigma: 0.03, horizon: h, factors });
    results.push({
      asset: s.id,
      unit: s.unit,
      horizon: h,
      tier,
      samples: evalSamples,
      fitSamples: fit.length,
      holdoutSamples: holdout.length,
      calibrated: factors.calibrated,
      reason: factors.reason ?? null,
      widthScale80: factors.widthScale80 ?? null,
      widthScale50: factors.widthScale50 ?? null,
      driftLogPerSqrtH: factors.driftLogPerSqrtH ?? null,
      kurtosis: factors.kurtosis ?? null,
      holdout: score,
      passes: factors.calibrated ? withinTolerance(score.coverage80After) : false,
      exampleIntervalLog: [ +example.lower.toFixed(4), +example.medianLog.toFixed(4), +example.upper.toFixed(4) ]
    });
  }
}

const payload = {
  schemaVersion: 1,
  kind: 'atlas-forecast-calibration',
  generatedAt: process.env.CALIBRATION_AS_OF || '2026-11-06',
  generatedAtMeaning: '입력 데이터 마지막 관측일 기준. 재실행 시 같은 바이트가 나오도록 고정한다.',
  policy: '앞 70%에서 계수 추정, 뒤 30%에서 커버리지 재검증. 명목 80% ±5%p 통과해야 화면 문구를 바꾼다.',
  results
};
await mkdir(OUT_DIR, { recursive: true });
await writeFile(resolve(OUT_DIR, 'factors.json'), JSON.stringify(payload, null, 2) + '\n');

console.log('asset            unit          h   n(fit/hold)   k80    drift   cov80 전→후   판정');
for (const r of results) {
  if (r.status) { console.log(`${r.asset.padEnd(16)} ${r.unit.padEnd(12)} ${String(r.horizon).padStart(3)}   ${r.status}`); continue; }
  console.log(
    `${r.asset.padEnd(16)} ${r.unit.padEnd(12)} ${String(r.horizon).padStart(3)}   ${String(r.fitSamples + '/' + r.holdoutSamples).padStart(11)}   ` +
    `${String(r.widthScale80).padStart(5)}  ${String(r.driftLogPerSqrtH).padStart(6)}   ` +
    `${(r.holdout.coverage80Before + '→' + r.holdout.coverage80After).padStart(11)}   ${r.passes ? '통과' : '미달'}`
  );
}
console.log(`\nwrote ${OUT_DIR}/factors.json`);
