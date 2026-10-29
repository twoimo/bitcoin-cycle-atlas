import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { performance } from 'node:perf_hooks';
import { createHash } from 'node:crypto';
import { resolve, dirname } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { cpus, platform, arch } from 'node:os';

// Usage: node scripts/benchmark-market-computation.mjs --baseline /tmp/atlas-baseline --output /tmp/atlas-computation.json
// Use a detached worktree at the recorded baseline; no install or network is used.
const argument = (name, fallback) => {
  const index = process.argv.indexOf(name);
  return index < 0 ? fallback : process.argv[index + 1];
};
const candidate = resolve(argument('--candidate', resolve(dirname(fileURLToPath(import.meta.url)), '..')));
const baselineArgument = argument('--baseline');
assert.ok(baselineArgument, '--baseline must name a checkout of the comparison commit');
const baseline = resolve(baselineArgument);
const outputFile = resolve(argument('--output', '/tmp/atlas-computation.json'));
const profileOutput = argument('--profile-output');
const load = (root, name) => import(pathToFileURL(resolve(root, 'dist', name)).href);
const [beforeStates, afterStates, beforeForecast, afterForecast, beforeVolume, afterVolume] = await Promise.all([
  load(baseline, 'market-structure.js'), load(candidate, 'market-structure.js'),
  load(baseline, 'long-horizon-forecast.js'), load(candidate, 'long-horizon-forecast.js'),
  load(baseline, 'volume-forecast.js'), load(candidate, 'volume-forecast.js'),
]);
const priceBytes = await readFile(resolve(baseline, 'dist/data/btc-daily.json'));
const volumeBytes = await readFile(resolve(baseline, 'dist/data/btc-volume.json'));
const data = JSON.parse(priceBytes), volume = JSON.parse(volumeBytes);
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const baselineCommit = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: baseline, encoding: 'utf8' }).trim();
const measuredSourceSha256 = Object.fromEntries(await Promise.all(['market-structure.js', 'volume-forecast.js', 'long-horizon-forecast.js'].map(async name => [`dist/${name}`, sha256(await readFile(resolve(candidate, 'dist', name)))])));
const claim = 'On the same saved production input and Node runtime, 5 alternating runs per side measure pure computation, excluding network, DOM, paint and browser input latency. Forecast uses production sampleCount=128.';
const fixtures = [];
for (const frequency of ['daily', 'weekly']) {
  const before = beforeStates.computeRollingStates(data, { frequency });
  const after = afterStates.computeRollingStates(data, { frequency });
  assert.deepEqual(after.episodes, before.episodes);
  let maxMARelative = 0, maxVolAbsolute = 0, maxVolRelative = 0;
  for (let i = 0; i < before.points.length; i++) {
    const a = before.points[i], b = after.points[i];
    for (const key of Object.keys(a)) {
      if (['shortMA', 'longMA', 'realizedVolPct'].includes(key) && a[key] !== null) {
        const absolute = Math.abs(a[key] - b[key]), relative = absolute / Math.max(1, Math.abs(a[key]));
        assert.ok(relative < 1e-10, `${frequency} ${a.date} ${key}: ${relative}`);
        if (key === 'realizedVolPct') { maxVolAbsolute = Math.max(maxVolAbsolute, absolute); maxVolRelative = Math.max(maxVolRelative, relative); }
        else maxMARelative = Math.max(maxMARelative, relative);
      } else assert.deepEqual(b[key], a[key]);
    }
  }
  fixtures.push({ frequency, rows: before.points.length, labelsAndEpisodesIdentical: true, maxMARelative, maxVolAbsolute, maxVolRelative });
}
const referenceForecast = beforeForecast.buildLongHorizonForecast(data);
const candidateForecast = afterForecast.buildLongHorizonForecast(data);
const economicPath = forecast => forecast.path.map(({ date, price, lower, median, upper, baselinePrice, state }) => ({ date, price, lower, median, upper, baselinePrice, state }));
assert.deepEqual(economicPath(candidateForecast), economicPath(referenceForecast));
assert.deepEqual(candidateForecast.localTurns, referenceForecast.localTurns);
assert.deepEqual(candidateForecast.cycleCalibration, referenceForecast.cycleCalibration);
const referenceVolume = beforeVolume.fitVolumeForecastModel(volume.bars, { asOf: volume.asOf });
assert.deepEqual(afterVolume.fitVolumeForecastModel(volume.bars, { asOf: volume.asOf }), referenceVolume);
const cases = [
  { name: 'rollingStatesObserved', before: () => beforeStates.computeRollingStates(data), after: () => afterStates.computeRollingStates(data), consume: result => [result.points.length, result.current.date, result.current.state, result.current.realizedVolPct] },
  { name: 'rollingStatesObservedAndForecast', before: () => beforeStates.computeRollingStates([...data.prices, ...referenceForecast.path.slice(1).map(point => [point.date, point.price])]), after: () => afterStates.computeRollingStates([...data.prices, ...referenceForecast.path.slice(1).map(point => [point.date, point.price])]), consume: result => [result.points.length, result.current.date, result.current.state, result.current.realizedVolPct] },
  { name: 'longHorizonProduction128', before: () => beforeForecast.buildLongHorizonForecast(data), after: () => afterForecast.buildLongHorizonForecast(data), consume: result => [result.path.length, result.path.at(-1).date, result.path.at(-1).price, result.localTurns.length] },
  { name: 'volumeFit', before: () => beforeVolume.fitVolumeForecastModel(volume.bars, { asOf: volume.asOf }), after: () => afterVolume.fitVolumeForecastModel(volume.bars, { asOf: volume.asOf }), consume: result => [result.status, result.monthly.length, result.anchor.meanDailyVolume, result.validation.selection.method] },
];
const measurements = [];
for (const entry of cases) {
  const runs = { before: [], after: [] }, output = { before: [], after: [] };
  for (let i = 0; i < 5; i++) for (const side of ['before', 'after']) {
    const start = performance.now(), result = entry[side](), ms = performance.now() - start;
    const work = entry.consume(result);
    assert.ok(work[0] !== 0);
    runs[side].push(ms); output[side].push(work);
  }
  const summary = side => {
    const sorted = [...runs[side]].sort((a, b) => a - b);
    return { medianMs: sorted[2], minMs: sorted[0], maxMs: sorted[4], samplesMs: runs[side] };
  };
  measurements.push({ name: entry.name, before: summary('before'), after: summary('after'), work: output });
  console.log(JSON.stringify(measurements.at(-1)));
}
const report = { baselineCommit, runtime: process.version, host: { platform: platform(), arch: arch(), cpu: cpus()[0]?.model }, measuredSourceSha256, fixtureSha256: { prices: sha256(priceBytes), volume: sha256(volumeBytes) }, claim,
  fixture: { observations: data.prices.length, asOf: data.prices.at(-1)[0], futureRowsIncludingAnchor: referenceForecast.path.length, volumeRows: volume.bars.length },
  correctness: { fixtures, economicPathIdentical: true, localTurnsIdentical: true, calibrationIdentical: true, volumeFitDeepEqual: true },
  measurements, errors: 0, limitations: ['Shared host CPU load may drift; sides alternate.', 'In-process warm computations; browser end-to-end measurement is separate.', 'Float changes are bounded here for the saved fixture, not for every representable input.'] };
await writeFile(outputFile, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify({ saved: outputFile, correctness: report.correctness }));
if (profileOutput) {
  // Profiling is deliberately outside every timed A/B run above.
  const { Session } = await import('node:inspector');
  const session = new Session(); session.connect();
  const post = (method, params = {}) => new Promise((resolve, reject) => session.post(method, params, (error, result) => error ? reject(error) : resolve(result)));
  const combined = [...data.prices, ...referenceForecast.path.slice(1).map(point => [point.date, point.price])];
  const profiles = {};
  try {
    await post('Profiler.enable');
    for (const [side, implementation] of [['before', beforeStates], ['after', afterStates]]) {
      await post('Profiler.start');
      for (let run = 0; run < 10; run++) assert.equal(implementation.computeRollingStates(combined).points.length, combined.length);
      const { profile } = await post('Profiler.stop');
      const nodes = new Map(profile.nodes.map(node => [node.id, node])), totals = new Map();
      profile.samples.forEach((id, index) => totals.set(id, (totals.get(id) || 0) + profile.timeDeltas[index]));
      profiles[side] = {
        runs: 10, rowsPerRun: combined.length, samples: profile.samples.length,
        topSelfSamples: [...totals].sort((a, b) => b[1] - a[1]).slice(0, 20).map(([id, microseconds]) => {
          const frame = nodes.get(id).callFrame;
          return { function: frame.functionName || '(anonymous)', module: frame.url.replace(pathToFileURL(`${baseline}/`).href, 'baseline/').replace(pathToFileURL(`${candidate}/`).href, 'candidate/'), line: frame.lineNumber + 1, sampledMs: microseconds / 1000 };
        }),
      };
    }
  } finally { session.disconnect(); }
  await writeFile(resolve(profileOutput), `${JSON.stringify({ scope: 'Separate sampling profile of ten observed+forecast rolling-state calls per side. These samples are explanatory and excluded from the A/B timings.', profiles }, null, 2)}\n`);
}
