import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, readFile, writeFile, mkdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { utcDay, dateFromDay } from '../dist/cycle-engine.js';
import { canonicalForecastJson, forecastHash, createForecastSnapshot, createForecastRecord, verifyForecastSnapshot, verifyForecastRecord,
  forecastIndexEntry, validateForecastIndex, loadForecastIndex, loadForecastRecord, loadForecastSnapshot, restoreForecastPath, compareForecastRecords } from '../dist/forecast-records.js';
import { forecastPricePrefix, buildIndependentBenchmarks, evaluateForecastRecords, intervalScore } from '../dist/forecast-evaluation.js';
import { calibrateLogInterval, runSequentialPriceExperiment, FORECAST_EXPERIMENT_POLICY } from '../dist/forecast-experiments.js';
import { buildLongHorizonForecast } from '../dist/long-horizon-forecast.js';
import { appendForecastArchive, readForecastArchive, verifyForecastArchive, forecastIssuanceStatus } from '../scripts/build-forecast-ledger.mjs';

const asOf = '2020-12-31', origin = utcDay(asOf);
const prices = Array.from({ length: 900 }, (_, index) => [dateFromDay(origin - 899 + index), 100 * Math.exp(index * 0.0005 + Math.sin(index / 9) * 0.08)]);
const input = { meta: { sourceName: 'Test daily source', priceDefinition: 'Completed UTC daily close', retrievedAt: '2021-01-01T01:00:00.000Z' }, prices };
const files = { 'dist/test-model.js': 'a'.repeat(64) };
const model = { sourceCommit: 'b'.repeat(40), sourceHash: await forecastHash(files), files };
const options = { scenario: 'base', seed: 17, sampleCount: 128 };

function projection(snapshot, scale = 1) {
  const anchor = snapshot.prices.at(-1)[1];
  return { version: 'test-conditional-1', asOf: snapshot.asOf, displayEnd: dateFromDay(utcDay(snapshot.asOf) + 200), scenario: { id: 'base', label: '기준 가정' },
    path: Array.from({ length: 201 }, (_, day) => {
      const baselinePrice = anchor * Math.exp(day * 0.001 * scale), cycleDisplacement = day ? 0.02 * Math.sin(day / 20) : 0, residualLog = day ? 0.01 * Math.sin(day / 3) : 0;
      const price = baselinePrice * Math.exp(cycleDisplacement + residualLog);
      return { date: dateFromDay(utcDay(snapshot.asOf) + day), price, lower: price * 0.8, upper: price * 1.2, baselinePrice, cycleDisplacement, residualLog };
    }), longHorizon: { researchAsOf: snapshot.asOf } };
}

const snapshot = await createForecastSnapshot(input, { asOf });
const record = await createForecastRecord({ snapshot, forecast: projection(snapshot), model, options, issuedAt: '2021-01-01T02:00:00.000Z' });
const future = Array.from({ length: 200 }, (_, day) => [dateFromDay(origin + day + 1), prices.at(-1)[1] * Math.exp((day + 1) * 0.0004)]);
const outcomes = { prices: [...prices, ...future] };

test('canonical hashing is key-order independent and rejects lossy JSON values', async () => {
  assert.equal(await forecastHash({ b: 2, a: [1, true] }), await forecastHash({ a: [1, true], b: 2 }));
  for (const value of [NaN, Infinity, undefined, { a: undefined }, [undefined]]) assert.throws(() => canonicalForecastJson(value));
});

test('snapshots preserve actual capture time and reject incomplete or future-known observations', async () => {
  assert.equal(snapshot.availableAt, null);
  assert.equal(snapshot.historicalVintagesAvailable, false);
  await verifyForecastSnapshot(snapshot);
  await assert.rejects(createForecastSnapshot(input, { asOf, observedAt: '2020-12-31T20:00:00.000Z' }), /availability/);
  await assert.rejects(createForecastSnapshot(input, { asOf, availableAt: '2021-01-02T00:00:00.000Z' }), /availability/);
});

test('future malformed prices do not affect a fixed prefix, baseline or snapshot', async () => {
  const polluted = { ...input, prices: [...prices, ['2021-01-01', null], ['2021-01-02', -3]] };
  assert.deepEqual(forecastPricePrefix(polluted, asOf), forecastPricePrefix(input, asOf));
  assert.deepEqual(buildIndependentBenchmarks(polluted, { asOf }), buildIndependentBenchmarks(input, { asOf }));
  assert.deepEqual(await createForecastSnapshot(polluted, { asOf }), snapshot);
});

test('preserved forecast replays every original date and price without rerunning a model', async () => {
  await verifyForecastRecord(record, snapshot);
  const restored = restoreForecastPath(record), source = projection(snapshot).path;
  assert.equal(restored.length, source.length);
  for (let index = 0; index < source.length; index++) {
    for (const field of ['date', 'price', 'lower', 'upper', 'baselinePrice', 'cycleDisplacement', 'residualLog']) assert.equal(restored[index][field], source[index][field]);
    assert.equal(restored[index].probability, null);
  }
  assert.equal(record.firstPublishedAt, null);
  assert.equal(record.output.calibrated, false);
});

test('tampering with stored inputs or outputs fails content verification', async () => {
  const changedInput = structuredClone(snapshot); changedInput.prices[0][1] += 1;
  await assert.rejects(verifyForecastSnapshot(changedInput), /content hash mismatch/);
  const changedOutput = structuredClone(record); changedOutput.output.path[30][1] += 1;
  await assert.rejects(verifyForecastRecord(changedOutput), /content hash mismatch/);
});

test('a newly signed payload still must satisfy date, target and probability contracts', async () => {
  async function resign(value) { const { id, ...body } = value; return { id: await forecastHash(body), ...body }; }
  const wrongTarget = structuredClone(record); wrongTarget.targets[0].price *= 2;
  await assert.rejects(verifyForecastRecord(await resign(wrongTarget)), /Target differs/);
  const unfinished = structuredClone(record); unfinished.issuedAt = '2020-12-31T02:00:00.000Z';
  await assert.rejects(verifyForecastRecord(await resign(unfinished)), /unfinished/);
  const wrongProbability = structuredClone(record); wrongProbability.output.calibrated = true;
  wrongProbability.outputHash = await forecastHash(wrongProbability.output);
  await assert.rejects(verifyForecastRecord(await resign(wrongProbability)), /conditional forecast path/);
});

test('generation time, metadata-only capture time and git data commits do not create a new run', async () => {
  const laterSnapshot = await createForecastSnapshot({ ...input, meta: { ...input.meta, retrievedAt: '2021-01-01T03:00:00.000Z' } }, { asOf });
  const later = await createForecastRecord({ snapshot: laterSnapshot, forecast: projection(laterSnapshot), model: { ...model, sourceCommit: 'c'.repeat(40) }, options, issuedAt: '2021-01-01T04:00:00.000Z' });
  assert.notEqual(laterSnapshot.id, snapshot.id);
  assert.equal(laterSnapshot.dataHash, snapshot.dataHash);
  assert.notEqual(later.id, record.id);
  assert.equal(later.runKey, record.runKey);
});

test('corrections receive a new identity and explicit predecessor without editing the prior forecast', async () => {
  const revised = await createForecastRecord({ snapshot, forecast: projection(snapshot, 1.2), model, options: { ...options, slope: 1.2 }, issuedAt: '2021-01-01T04:00:00.000Z', replaces: record.id, revisionReason: 'Explicit changed assumption' });
  assert.notEqual(revised.runKey, record.runKey);
  assert.notEqual(revised.id, record.id);
  assert.equal(revised.replaces, record.id);
  await assert.rejects(createForecastRecord({ snapshot, forecast: projection(snapshot), model, options, issuedAt: '2021-01-01T04:00:00.000Z', replaces: record.id }), /revision requires/);
});

test('evaluation matures each target separately and never calls a scenario band probabilistic', () => {
  const before = evaluateForecastRecords([record], outcomes, { asOf: '2021-01-29' });
  assert.equal(before.maturedTargets, 0); assert(before.rows.every(row => row.status === 'pending'));
  const after = evaluateForecastRecords([record], outcomes, { asOf: '2021-01-30' });
  assert.equal(after.maturedTargets, 1); assert.equal(after.rows[0].status, 'scored');
  assert.equal(after.rows[1].status, 'pending');
  assert.equal(after.rows[0].probabilisticScore, null);
  assert(after.rows[0].actualLeadDays < 30 && after.rows[0].actualLeadDays > 29);
  assert(after.rows[0].issueLagDays > 0 && after.rows[0].issueLagDays < 1);
  assert.equal(after.summaries[0].independentSampleSize, null);
  assert(after.rows[0].absoluteLogErrors.flat >= 0);
});

test('late reconstruction cannot be issued under a nominal 30-day lead label', async () => {
  await assert.rejects(createForecastRecord({ snapshot, forecast: projection(snapshot), model, options, issuedAt: '2021-01-03T02:00:00.000Z' }), /stale origins/);
});

test('historical reconstruction stays outside prospective summaries even when its target matured', async () => {
  const reconstructed = await createForecastRecord({ snapshot, forecast: projection(snapshot), model, options, issuedAt: '2022-01-01T02:00:00.000Z', recordKind: 'reconstructed' });
  const evaluated = evaluateForecastRecords([reconstructed], outcomes, { asOf: '2021-07-19' });
  assert.equal(evaluated.maturedTargets, 0);
  assert(evaluated.rows.every(row => row.status === 'retrospective'));
  assert(evaluated.summaries.every(row => row.meanAbsoluteLogError === null));
});

test('a missing actual target is explicit and is not interpolated from neighboring days', () => {
  const missing = { prices: outcomes.prices.filter(([date]) => date !== '2021-01-30') };
  const evaluated = evaluateForecastRecords([record], missing, { asOf: '2021-02-05' });
  assert.equal(evaluated.rows[0].status, 'missing-observation');
  assert.equal(evaluated.rows[0].actual, null);
});

test('archive append is immutable, idempotent and verifies target evaluation against current observations', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'atlas-forecast-ledger-'));
  try {
    const initial = await appendForecastArchive(directory, { snapshot, records: [record], observedInput: input, asOf });
    assert.equal(initial.appended, 1);
    const originalBytes = await readFile(join(directory, 'records', record.id + '.json'), 'utf8');
    const later = await createForecastRecord({ snapshot, forecast: projection(snapshot), model, options, issuedAt: '2021-01-01T04:00:00.000Z' });
    const repeat = await appendForecastArchive(directory, { snapshot, records: [later], observedInput: input, asOf });
    assert.equal(repeat.appended, 0);
    assert.equal((await readForecastArchive(directory)).records[0].id, record.id);
    assert.equal(await readFile(join(directory, 'records', record.id + '.json'), 'utf8'), originalBytes);
    await verifyForecastArchive(directory, input, { asOf });
    await assert.rejects(verifyForecastArchive(directory, outcomes, { asOf: '2021-01-30' }), /stale/);
    await appendForecastArchive(directory, { snapshot, records: [], observedInput: outcomes, asOf: '2021-01-30' });
    assert.equal((await verifyForecastArchive(directory, outcomes, { asOf: '2021-01-30' })).scoredTargets, 1);
    await mkdir(join(directory, '.write-lock'));
    await assert.rejects(appendForecastArchive(directory, { snapshot, records: [], observedInput: input, asOf }), /active writer/);
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test('archive loader rejects a corrupted immutable file rather than repairing it silently', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'atlas-forecast-corrupt-'));
  try {
    await appendForecastArchive(directory, { snapshot, records: [record], observedInput: input, asOf });
    await writeFile(join(directory, 'records', record.id + '.json'), '{}');
    await assert.rejects(readForecastArchive(directory), /Invalid/);
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test('browser and standalone loaders validate content addresses and refuse path injection', async () => {
  const entry = forecastIndexEntry(record), index = { schemaVersion: 1, kind: 'atlas-forecast-index', entries: [entry] };
  const embedded = { index, records: { [record.id]: record }, snapshots: { [snapshot.id]: snapshot } };
  assert.deepEqual(await loadForecastIndex({ embedded }), index);
  assert.deepEqual(await loadForecastRecord(entry, { embedded }), record);
  assert.deepEqual(await loadForecastSnapshot(entry, { embedded }), snapshot);
  assert.throws(() => validateForecastIndex({ ...index, entries: [{ ...entry, recordPath: '../secrets.json' }] }), /path/);
  await assert.rejects(loadForecastRecord({ ...entry, recordPath: 'https://other.invalid/a' }, { embedded }), /address/);
  await assert.rejects(loadForecastRecord({ ...entry, scenarioLabel: 'Forged' }, { embedded }), /metadata differs/);
});

test('record comparisons decompose exact same-target log changes with an explicit remainder', async () => {
  const other = await createForecastRecord({ snapshot, forecast: projection(snapshot, 1.2), model, options: { ...options, slope: 1.2 }, issuedAt: '2021-01-01T04:00:00.000Z' });
  const comparison = compareForecastRecords(record, other);
  assert.equal(comparison.optionsChanged, true);
  for (const change of comparison.changes) assert(Math.abs(change.totalLogChange - change.baselineLogChange - change.cycleLogChange - change.residualLogChange - change.remainderLogChange) < 1e-14);
});

test('calibration uses only mature disjoint errors and ignores invalid future outcomes', () => {
  const cases = Array.from({ length: 20 }, (_, index) => ({ origin: dateFromDay(origin - 400 + index * 15), targetDate: dateFromDay(origin - 390 + index * 15), horizonDays: 10, predicted: 100, actual: 100 + index }));
  const baseline = calibrateLogInterval(cases, { origin: asOf, predicted: 100, horizonDays: 10 });
  assert.equal(baseline.status, 'experimental');
  assert(baseline.latestOutcomeUsed <= asOf);
  const futureCase = { origin: asOf, targetDate: '2021-01-10', horizonDays: 10, predicted: NaN, actual: -1 };
  assert.deepEqual(calibrateLogInterval([...cases, futureCase], { origin: asOf, predicted: 100, horizonDays: 10 }), baseline);
  assert.equal(calibrateLogInterval(cases.slice(0, 3), { origin: asOf, predicted: 100, horizonDays: 10 }).status, 'insufficient-matured-errors');
  assert.equal(baseline.independentSampleSize, null);
});

test('sequential experiments are cutoff-invariant and cannot promote a retrospective winner', () => {
  const experiment = runSequentialPriceExperiment(input, { asOf });
  const polluted = runSequentialPriceExperiment({ prices: [...prices, ['2021-01-01', null]] }, { asOf });
  assert.deepEqual(polluted, experiment);
  assert.equal(experiment.adoption.status, 'not-adopted');
  assert.equal(experiment.adoption.prospectiveGatePassed, false);
  assert(experiment.cases.length > 0);
  assert(experiment.cases.every(item => item.interval.latestOutcomeUsed === null || item.interval.latestOutcomeUsed <= item.origin));
  assert.equal(FORECAST_EXPERIMENT_POLICY.prospectiveEvidenceRequired, true);
});

test('interval score rewards coverage and penalizes unnecessary width', () => {
  assert.equal(intervalScore(90, 110, 100, 0.2), 20);
  assert.equal(intervalScore(90, 110, 120, 0.2), 120);
  assert(intervalScore(90, 110, 100) < intervalScore(1, 1000, 100));
});

test('the actual long-horizon engine is preserved through 2050 without relabeling an old cutoff as issuance', async () => {
  const data = JSON.parse(await readFile(new URL('./fixtures/btc-daily-2026-10-20.json', import.meta.url), 'utf8'));
  const frozen = await createForecastSnapshot(data, { asOf: '2026-10-20' });
  const forecast = buildLongHorizonForecast(data, { sampleCount: 16 });
  const saved = await createForecastRecord({ snapshot: frozen, forecast, model, options: { sampleCount: 16 }, issuedAt: '2026-10-26T05:00:00.000Z', recordKind: 'reconstructed' });
  await verifyForecastRecord(saved, frozen);
  assert.equal(saved.output.displayEnd, '2050-12-31');
  assert.deepEqual(restoreForecastPath(saved).map(row => [row.date, row.price]), forecast.path.map(row => [row.date, row.price]));
  assert.equal(saved.recordKind, 'reconstructed');
});

test('a repeated run key with a different output is rejected instead of silently discarded', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'atlas-forecast-nondeterminism-'));
  try {
    await appendForecastArchive(directory, { snapshot, records: [record], observedInput: input, asOf });
    const divergent = await createForecastRecord({ snapshot, forecast: projection(snapshot, 2), model, options, issuedAt: '2021-01-01T03:00:00.000Z' });
    assert.equal(divergent.runKey, record.runKey);
    await assert.rejects(appendForecastArchive(directory, { snapshot, records: [divergent], observedInput: input, asOf }), /different output/);
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test('fixed evaluation cutoffs ignore future observations in both scores and receipt hashes', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'atlas-forecast-cutoff-'));
  try {
    await appendForecastArchive(directory, { snapshot, records: [record], observedInput: input, asOf });
    const futurePollution = { prices: [...prices, ['2021-01-01', null], ['2021-01-02', -5]] };
    await verifyForecastArchive(directory, futurePollution, { asOf });
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test('scores from different model source versions never merge into one performance claim', async () => {
  const newFiles = { 'dist/test-model.js': 'd'.repeat(64) };
  const changedModel = { ...model, files: newFiles, sourceHash: await forecastHash(newFiles) };
  const next = await createForecastRecord({ snapshot, forecast: projection(snapshot, 2), model: changedModel, options, issuedAt: '2021-01-01T03:00:00.000Z' });
  const evaluation = evaluateForecastRecords([record, next], outcomes, { asOf: '2021-07-19' });
  assert.equal(evaluation.summaries.length, 6);
  assert(evaluation.summaries.every(summary => summary.scoredCount === 1));
  assert.equal(new Set(evaluation.summaries.map(summary => summary.modelSourceHash)).size, 2);
});

test('stale completed prices retain an explicit empty or previous archive without fabricated issuance', async () => {
  const refresh = forecastIssuanceStatus(asOf, '2021-01-03T02:00:00.000Z');
  assert.equal(refresh.outcome, 'retained-stale-observations');
  assert.equal(refresh.expectedAsOf, '2021-01-02');
  assert.equal(forecastIssuanceStatus(asOf, '2021-01-01T02:00:00.000Z').outcome, 'ready-to-generate');
  assert.throws(() => forecastIssuanceStatus('2021-01-01', '2021-01-01T02:00:00.000Z'), /unfinished/);
  const directory = await mkdtemp(join(tmpdir(), 'atlas-forecast-stale-'));
  try {
    await appendForecastArchive(directory, { snapshot, records: [], observedInput: input, asOf, refresh });
    const result = await verifyForecastArchive(directory, input, { asOf });
    assert.equal(result.records, 0);
    assert.equal(result.refresh.outcome, 'retained-stale-observations');
  } finally { await rm(directory, { recursive: true, force: true }); }
});

function publicationContext(at, changes = {}) {
  return { records: [record], snapshotDataHash: at === asOf ? snapshot.dataHash : 'e'.repeat(64),
    modelSourceHash: model.sourceHash, modelVersion: record.model.version,
    observationDates: [...prices, ...future].filter(([date]) => date <= at).map(([date]) => date),
    optionsByScenario: [{ scenario: 'base', options: { ...options, asOf: at, referenceDate: dateFromDay(utcDay(at) + 1) } }],
    ...changes };
}
const publicationAt = (at, changes = {}, issuedAt = dateFromDay(utcDay(at) + 1) + 'T02:00:00.000Z') =>
  forecastIssuanceStatus(at, issuedAt, publicationContext(at, changes));

test('public preservation starts immediately, retains 29 observations and issues at 30 across a year boundary', () => {
  const first = publicationAt(asOf, { records: [] });
  assert.equal(first.publicationDue, true);
  assert.deepEqual(first.publicationReasons, ['first-preservation']);
  const before = publicationAt('2021-01-29');
  assert.equal(before.outcome, 'retained-not-due');
  assert.equal(before.publicationDue, false);
  assert.equal(before.observationDaysSinceLast, 29);
  assert.equal(before.nextEligibleAsOf, '2021-01-30');
  const due = publicationAt('2021-01-30');
  assert.equal(due.publicationDue, true);
  assert.equal(due.observationDaysSinceLast, 30);
  assert.deepEqual(due.publicationReasons, ['interval-reached']);
  assert.equal(due.publicationPolicy.capturesInteractiveCalculations, false);
});

test('missing daily observations do not advance the public preservation count and leap-day dates stay exact', () => {
  const at = '2021-01-30', context = publicationContext(at);
  const missing = publicationAt(at, { observationDates: context.observationDates.filter(date => date !== '2021-01-03') });
  assert.equal(missing.publicationDue, false);
  assert.equal(missing.observationDaysSinceLast, 29);
  assert.equal(missing.nextEligibleAsOf, '2021-01-31');
  assert.equal(missing.nextEligibleAsOfIsEarliest, true);
  const start = '2024-02-01', end = '2024-03-02';
  const observations = Array.from({ length: 31 }, (_, index) => dateFromDay(utcDay(start) + index));
  const prior = { ...record, asOf: start, issuedAt: '2024-02-02T02:00:00.000Z' };
  assert.equal(publicationAt('2024-03-01', { records: [prior], observationDates: observations.slice(0, 30) }).publicationDue, false);
  const leapDue = publicationAt(end, { records: [prior], observationDates: observations });
  assert.equal(leapDue.publicationDue, true);
  assert.equal(leapDue.observationDaysSinceLast, 30);
});

test('an actual model or settings change issues immediately while routine cutoff and source-commit changes do not', () => {
  const at = '2021-01-01';
  assert.equal(publicationAt(at, { records: [{ ...record, model: { ...record.model, sourceCommit: 'f'.repeat(40) } }] }).outcome, 'retained-not-due');
  const modelChanged = publicationAt(at, { modelSourceHash: 'd'.repeat(64) });
  assert.equal(modelChanged.publicationDue, true);
  assert.deepEqual(modelChanged.publicationReasons, ['model-source-changed']);
  const versionChanged = publicationAt(at, { modelVersion: 'changed-version' });
  assert.equal(versionChanged.publicationDue, true);
  const settingChanged = publicationAt(at, { optionsByScenario: [{ scenario: 'base', options: { ...options, seed: 19 } }] });
  assert.equal(settingChanged.publicationDue, true);
  assert.deepEqual(settingChanged.publicationReasons, ['settings-changed']);
});

test('a corrected same-cutoff input bypasses the cadence but unchanged captures do not', async () => {
  assert.equal(publicationAt(asOf).outcome, 'retained-not-due');
  const correctedInput = { ...input, prices: prices.map((row, index) => index === prices.length - 1 ? [row[0], row[1] * 1.01] : row) };
  const correctedSnapshot = await createForecastSnapshot(correctedInput, { asOf });
  const correction = publicationAt(asOf, { snapshotDataHash: correctedSnapshot.dataHash });
  assert.equal(correction.publicationDue, true);
  assert.deepEqual(correction.publicationReasons, ['input-corrected']);
  const correctedRecord = await createForecastRecord({ snapshot: correctedSnapshot, forecast: projection(correctedSnapshot), model, options,
    issuedAt: '2021-01-01T03:00:00.000Z', replaces: record.id, revisionReason: 'Corrected same-cutoff observation.' });
  const directory = await mkdtemp(join(tmpdir(), 'atlas-forecast-correction-'));
  try {
    await appendForecastArchive(directory, { snapshot, records: [record], observedInput: input, asOf });
    const original = await readFile(join(directory, forecastIndexEntry(record).recordPath), 'utf8');
    const result = await appendForecastArchive(directory, { snapshot: correctedSnapshot, records: [correctedRecord], observedInput: correctedInput, asOf });
    assert.equal(result.appended, 1); assert.equal(result.records, 2); assert.equal(result.snapshots, 2);
    assert.equal(correctedRecord.replaces, record.id);
    assert.equal(await readFile(join(directory, forecastIndexEntry(record).recordPath), 'utf8'), original);
    await verifyForecastArchive(directory, correctedInput, { asOf });
  } finally { await rm(directory, { recursive: true, force: true }); }
  const revised = await createForecastRecord({ snapshot, forecast: projection(snapshot), model, options: { ...options, seed: 19 },
    issuedAt: '2021-01-01T03:00:00.000Z', replaces: record.id, revisionReason: 'Corrected calculation settings.' });
  assert.equal(publicationAt('2021-01-01', { records: [record, revised], optionsByScenario: [{ scenario: 'base', options: revised.options }] }).outcome, 'retained-not-due');
});

test('stale observations block first issuance, corrections and changed models before cadence exceptions', () => {
  for (const changes of [{ records: [] }, { modelSourceHash: 'd'.repeat(64) }, { snapshotDataHash: 'd'.repeat(64) }]) {
    const stale = publicationAt(asOf, changes, '2021-01-02T00:00:00.000Z');
    assert.equal(stale.outcome, 'retained-stale-observations');
    assert.equal(stale.publicationDue, false);
  }
  assert.throws(() => publicationAt(asOf, {}, '2020-12-31T23:59:59.999Z'), /unfinished/);
  assert.equal(publicationAt(asOf, {}, '2021-01-01T00:00:00.000Z').outcome, 'retained-not-due');
});

test('retrospective reconstructions do not delay first actual preservation or claim an interactive history', () => {
  const retrospective = { ...record, recordKind: 'reconstructed' };
  const first = publicationAt(asOf, { records: [retrospective] });
  assert.equal(first.publicationDue, true);
  assert.deepEqual(first.publicationReasons, ['first-preservation']);
  assert.equal(first.publicationPolicy.scope, 'scheduled-public-preservation');
  const explicit = publicationAt(asOf, { recordKind: 'reconstructed' }, '2021-01-05T00:00:00.000Z');
  assert.equal(explicit.publicationDue, true);
  assert.deepEqual(explicit.publicationReasons, ['explicit-reconstruction']);
});

test('a retained not-due day updates evaluation without adding or rewriting preserved files', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'atlas-forecast-cadence-'));
  try {
    await appendForecastArchive(directory, { snapshot, records: [record], observedInput: input, asOf });
    const original = await readFile(join(directory, forecastIndexEntry(record).recordPath), 'utf8');
    const refresh = publicationAt('2021-01-29');
    assert.equal(refresh.outcome, 'retained-not-due');
    const result = await appendForecastArchive(directory, { snapshot, records: [], observedInput: outcomes, asOf: '2021-01-29', refresh });
    assert.equal(result.appended, 0);
    assert.equal(result.records, 1);
    assert.equal(result.evaluation.observationThrough, '2021-01-29');
    assert.equal(await readFile(join(directory, forecastIndexEntry(record).recordPath), 'utf8'), original);
    const checked = await verifyForecastArchive(directory, outcomes, { asOf: '2021-01-29' });
    assert.equal(checked.refresh.nextEligibleAsOf, '2021-01-30');
  } finally { await rm(directory, { recursive: true, force: true }); }
});
