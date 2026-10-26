import { readFile, writeFile, mkdir, rename, rm } from 'node:fs/promises';
import { resolve, dirname, relative } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { buildLongHorizonForecast, LONG_HORIZON_DEFAULTS, LONG_HORIZON_SCENARIOS } from '../dist/long-horizon-forecast.js';
import { LONG_HORIZON_REVIEW_DATE } from '../dist/long-horizon-evidence.js';
import { dateFromDay, utcDay } from '../dist/cycle-engine.js';
import { canonicalForecastJson, forecastHash, createForecastSnapshot, createForecastRecord, verifyForecastSnapshot, verifyForecastRecord, forecastIndexEntry, validateForecastIndex } from '../dist/forecast-records.js';
import { evaluateForecastRecords, forecastPricePrefix } from '../dist/forecast-evaluation.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const FORECAST_PUBLICATION_POLICY = Object.freeze({ version: 'preserved-forecast-cadence-1',
  intervalObservationDays: 30, basis: 'completed-observation-rows', scope: 'scheduled-public-preservation',
  capturesInteractiveCalculations: false });

function publicationClock(records, asOf, observationDates) {
  const issued = records.filter(record => record.recordKind === 'issued')
    .sort((a, b) => a.asOf.localeCompare(b.asOf) || a.issuedAt.localeCompare(b.issuedAt) || a.id.localeCompare(b.id));
  const lastPreservedAsOf = issued.at(-1)?.asOf ?? null;
  let previous = -Infinity;
  const completed = [];
  for (const date of observationDates) {
    const value = utcDay(date);
    if (value <= previous) throw new RangeError('Publication observation dates must be strictly chronological');
    previous = value;
    if (date <= asOf && lastPreservedAsOf && date > lastPreservedAsOf) completed.push(date);
  }
  if (observationDates.at(-1) !== asOf) throw new RangeError('Publication clock must end at the actual observation cutoff');
  const remaining = Math.max(0, FORECAST_PUBLICATION_POLICY.intervalObservationDays - completed.length);
  return { issued, lastPreservedAsOf, observationDaysSinceLast: lastPreservedAsOf ? completed.length : 0,
    nextEligibleAsOf: !lastPreservedAsOf ? asOf : remaining === 0 ? completed[FORECAST_PUBLICATION_POLICY.intervalObservationDays - 1]
      : dateFromDay(utcDay(asOf > lastPreservedAsOf ? asOf : lastPreservedAsOf) + remaining),
    nextEligibleAsOfIsEarliest: true };
}

function stableForecastOptions(options) {
  // These two values advance with the observation cutoff; their daily change is
  // not a new economic assumption. All other declared settings remain material.
  const { asOf, referenceDate, ...settings } = options;
  return canonicalForecastJson(settings);
}

async function readJson(file, fallback) {
  try { return JSON.parse(await readFile(file, 'utf8')); }
  catch (error) { if (error.code === 'ENOENT' && fallback !== undefined) return fallback; throw error; }
}

export async function collectForecastModelIdentity(repositoryRoot = root, entrypoint = 'dist/long-horizon-forecast.js') {
  const files = {};
  async function visit(path) {
    const key = relative(repositoryRoot, path).replaceAll('\\', '/');
    if (Object.hasOwn(files, key)) return;
    if (!key.startsWith('dist/') || key.includes('..')) throw new Error('Model dependency escaped dist');
    const text = await readFile(path, 'utf8');
    files[key] = createHash('sha256').update(text).digest('hex');
    for (const match of text.matchAll(/(?:from\s*|import\s*)['"](\.[^'"]+)['"]/g)) await visit(resolve(dirname(path), match[1].split('?')[0]));
  }
  await visit(resolve(repositoryRoot, entrypoint));
  const sourceCommit = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: repositoryRoot, encoding: 'utf8' }).trim();
  const dirty = execFileSync('git', ['status', '--porcelain', '--', ...Object.keys(files)], { cwd: repositoryRoot, encoding: 'utf8' }).trim();
  if (dirty) throw new Error('Commit the actual model source before generating immutable forecast records');
  return { sourceCommit, sourceHash: await forecastHash(files), files };
}

export async function readForecastArchive(directory) {
  const index = validateForecastIndex(await readJson(resolve(directory, 'index.json'), { schemaVersion: 1, kind: 'atlas-forecast-index', entries: [], evaluationPath: 'evaluation.json', experimentsPath: null }));
  const records = [], snapshots = new Map();
  for (const entry of index.entries) {
    if (!snapshots.has(entry.snapshotId)) {
      const snapshot = await readJson(resolve(directory, entry.snapshotPath));
      await verifyForecastSnapshot(snapshot);
      snapshots.set(entry.snapshotId, snapshot);
    }
    const record = await readJson(resolve(directory, entry.recordPath));
    await verifyForecastRecord(record, snapshots.get(entry.snapshotId));
    if (canonicalForecastJson(forecastIndexEntry(record)) !== canonicalForecastJson(entry)) throw new Error('Archive index metadata mismatch');
    records.push(record);
  }
  const ids = new Set(records.map(record => record.id));
  for (const record of records) if (record.replaces && !ids.has(record.replaces)) throw new Error('Archive revision predecessor is missing');
  return { index, records, snapshots };
}

async function immutableJson(file, value) {
  await mkdir(dirname(file), { recursive: true });
  const text = canonicalForecastJson(value) + '\n';
  try { await writeFile(file, text, { flag: 'wx' }); }
  catch (error) {
    if (error.code !== 'EEXIST') throw error;
    if (await readFile(file, 'utf8') !== text) throw new Error('Immutable archive file already exists with different bytes: ' + file);
  }
}

async function replaceJson(file, value) {
  const temporary = file + '.tmp-' + process.pid;
  try { await writeFile(temporary, canonicalForecastJson(value) + '\n', { flag: 'wx' }); await rename(temporary, file); }
  finally { await rm(temporary, { force: true }); }
}

export async function appendForecastArchive(directory, { snapshot, records, observedInput, asOf, experiments = null, refresh = null }) {
  await mkdir(directory, { recursive: true });
  const lock = resolve(directory, '.write-lock');
  await mkdir(lock).catch(error => { if (error.code === 'EEXIST') throw new Error('Forecast archive already has an active writer'); throw error; });
  try {
    const archive = await readForecastArchive(directory);
    const runs = new Map(archive.records.map(record => [record.runKey, record]));
    let appended = 0;
    for (const record of records) {
      await verifyForecastRecord(record, snapshot);
      if (runs.has(record.runKey)) {
        if (runs.get(record.runKey).outputHash !== record.outputHash) throw new Error('The same forecast run produced a different output');
        continue;
      }
      await immutableJson(resolve(directory, 'snapshots', snapshot.id + '.json'), snapshot);
      await immutableJson(resolve(directory, 'records', record.id + '.json'), record);
      archive.records.push(record); archive.index.entries.push(forecastIndexEntry(record)); runs.set(record.runKey, record); appended++;
    }
    archive.index.entries.sort((a, b) => a.issuedAt.localeCompare(b.issuedAt) || a.scenario.localeCompare(b.scenario) || a.id.localeCompare(b.id));
    const ids = new Set(archive.records.map(record => record.id));
    for (const record of archive.records) if (record.replaces && !ids.has(record.replaces)) throw new Error('Revision predecessor must be in the archive');
    const evaluation = evaluateForecastRecords(archive.records, observedInput, { asOf });
    evaluation.observationHash = await forecastHash(forecastPricePrefix(observedInput, asOf).map(row => [row.date, row.price]));
    await replaceJson(resolve(directory, 'evaluation.json'), evaluation);
    if (experiments) await replaceJson(resolve(directory, 'experiments.json'), experiments);
    archive.index.latestAsOf = archive.index.entries.length ? archive.index.entries.map(entry => entry.asOf).sort().at(-1) : null;
    archive.index.evaluationPath = 'evaluation.json';
    if (experiments) archive.index.experimentsPath = 'experiments.json';
    if (refresh) archive.index.refresh = refresh;
    validateForecastIndex(archive.index);
    await replaceJson(resolve(directory, 'index.json'), archive.index);
    return { appended, records: archive.records.length, snapshots: new Set(archive.records.map(record => record.snapshotId)).size, refresh: archive.index.refresh ?? null, evaluation };
  } finally { await rm(lock, { recursive: true }); }
}

export async function verifyForecastArchive(directory, observedInput, { asOf, repositoryRoot = null } = {}) {
  const archive = await readForecastArchive(directory);
  if (!archive.records.length && archive.index.refresh?.outcome !== 'retained-stale-observations') throw new Error('Forecast archive is empty');
  const expected = evaluateForecastRecords(archive.records, observedInput, { asOf });
  expected.observationHash = await forecastHash(forecastPricePrefix(observedInput, asOf).map(row => [row.date, row.price]));
  const evaluation = await readJson(resolve(directory, 'evaluation.json'));
  if (canonicalForecastJson(expected) !== canonicalForecastJson(evaluation)) throw new Error('Forecast evaluation is stale or differs from preserved records');
  if (archive.index.refresh?.publicationPolicy) {
    const refresh = archive.index.refresh;
    if (canonicalForecastJson(refresh.publicationPolicy) !== canonicalForecastJson(FORECAST_PUBLICATION_POLICY)) throw new Error('Unknown public forecast preservation policy');
    const clock = publicationClock(archive.records, asOf, forecastPricePrefix(observedInput, asOf).map(row => row.date));
    for (const key of ['lastPreservedAsOf', 'observationDaysSinceLast', 'nextEligibleAsOf', 'nextEligibleAsOfIsEarliest']) {
      if (refresh[key] !== clock[key]) throw new Error('Public forecast preservation clock differs from the actual archive');
    }
    if (refresh.observationThrough !== asOf) throw new Error('Public forecast refresh metadata has a stale observation cutoff');
  }
  if (archive.index.experimentsPath !== null && archive.index.experimentsPath !== undefined) {
    if (archive.index.experimentsPath !== 'experiments.json') throw new Error('Unexpected experiment report path');
    const report = await readJson(resolve(directory, 'experiments.json'));
    const { FORECAST_EXPERIMENT_POLICY, runForecastExperiments } = await import('../dist/forecast-experiments.js');
    if (report?.kind !== 'atlas-forecast-experiments' || report.asOf !== asOf || report.observationHash !== expected.observationHash || report.policyHash !== await forecastHash(FORECAST_EXPERIMENT_POLICY)) throw new Error('Forecast experiment report is stale or has a different locked policy');
    if (repositoryRoot) {
      const modelIdentity = await collectForecastModelIdentity(repositoryRoot);
      const experimentIdentity = await collectForecastModelIdentity(repositoryRoot, 'dist/forecast-experiments.js');
      if (report.sourceHash !== modelIdentity.sourceHash || report.experimentSourceHash !== experimentIdentity.sourceHash || canonicalForecastJson(report.experimentSourceFiles) !== canonicalForecastJson(experimentIdentity.files)) throw new Error('Experiment report source differs from current committed comparison code');
    }
    const replay = await runForecastExperiments(observedInput, { asOf, sourceCommit: report.sourceCommit, sourceHash: report.sourceHash,
      experimentSourceHash: report.experimentSourceHash, experimentSourceFiles: report.experimentSourceFiles });
    if (canonicalForecastJson(replay) !== canonicalForecastJson(report)) throw new Error('Forecast experiment results differ from deterministic replay');
  }
  return { records: archive.records.length, snapshots: archive.snapshots.size, pendingTargets: evaluation.rows.filter(row => row.status === 'pending').length, scoredTargets: evaluation.maturedTargets, observationThrough: evaluation.observationThrough, refresh: archive.index.refresh ?? null };
}

export function forecastIssuanceStatus(asOf, issuedAt, publication = null) {
  utcDay(asOf);
  if (!Number.isFinite(Date.parse(issuedAt))) throw new RangeError('Invalid issuance timestamp');
  const expectedAsOf = dateFromDay(utcDay(new Date(issuedAt).toISOString().slice(0, 10)) - 1);
  if (asOf > expectedAsOf) throw new RangeError('Cannot issue from an unfinished UTC observation day');
  const freshness = { observationThrough: asOf, expectedAsOf,
    outcome: asOf < expectedAsOf ? 'retained-stale-observations' : 'ready-to-generate',
    reason: asOf < expectedAsOf ? 'Stored observations are older than the immediately preceding UTC day; existing records are retained and no new issuance is fabricated.' : null };
  if (!publication) return freshness;
  const { records, observationDates, snapshotDataHash, modelSourceHash, modelVersion, optionsByScenario, recordKind = 'issued' } = publication;
  if (!['issued', 'reconstructed'].includes(recordKind)) throw new RangeError('Unknown forecast record kind');
  if (!Array.isArray(records) || !Array.isArray(observationDates) || !Array.isArray(optionsByScenario) || !optionsByScenario.length) throw new TypeError('Publication needs preserved records, observation dates and explicit scenario options');
  if (!/^[a-f0-9]{64}$/.test(snapshotDataHash) || !/^[a-f0-9]{64}$/.test(modelSourceHash) || typeof modelVersion !== 'string' || !modelVersion) throw new TypeError('Publication requires exact input and model identities');
  const { issued, ...clock } = publicationClock(records, asOf, observationDates);
  const result = { ...freshness, ...clock, publicationPolicy: FORECAST_PUBLICATION_POLICY, publicationDue: false, publicationReasons: [] };
  if (recordKind === 'reconstructed') return { ...result, outcome: 'ready-to-generate', reason: null, publicationDue: true, publicationReasons: ['explicit-reconstruction'] };
  // Freshness is a prerequisite, including the first preservation and every
  // model/input exception. Never repair a stale day by pretending it was issued.
  if (freshness.outcome === 'retained-stale-observations') return { ...result, publicationReasons: ['observations-stale'] };
  if (!issued.length) return { ...result, publicationDue: true, publicationReasons: ['first-preservation'] };
  const latestByScenario = new Map(issued.map(record => [record.scenario.id, record]));
  const reasons = new Set();
  for (const item of optionsByScenario) {
    if (typeof item.scenario !== 'string' || !item.scenario || !item.options) throw new TypeError('Publication scenario options must identify their scenario');
    const prior = latestByScenario.get(item.scenario);
    if (!prior) { reasons.add('settings-changed'); continue; }
    if (prior.model.sourceHash !== modelSourceHash) reasons.add('model-source-changed');
    if (prior.model.version !== modelVersion) reasons.add('model-version-changed');
    if (stableForecastOptions(prior.options) !== stableForecastOptions(item.options)) reasons.add('settings-changed');
    if (prior.asOf === asOf && prior.snapshotDataHash !== snapshotDataHash) reasons.add('input-corrected');
  }
  if (clock.observationDaysSinceLast >= FORECAST_PUBLICATION_POLICY.intervalObservationDays) reasons.add('interval-reached');
  if (reasons.size) return { ...result, publicationDue: true, publicationReasons: [...reasons] };
  return { ...result, outcome: 'retained-not-due', publicationReasons: ['interval-not-reached'],
    reason: 'The unchanged model and settings are preserved every 30 completed observation rows. Earlier records remain immutable; observations, evaluation and active experiments continue to refresh daily.' };
}

export async function buildForecastLedger({ repositoryRoot = root, issuedAt = new Date().toISOString(), recordKind = 'issued', check = false, experiments = false } = {}) {
  const directory = resolve(repositoryRoot, 'dist/data/forecast-ledger');
  const input = await readJson(resolve(repositoryRoot, 'dist/data/btc-daily.json'));
  const asOf = input.prices.at(-1)[0];
  if (check) return { status: 'PASS', ...await verifyForecastArchive(directory, input, { asOf, repositoryRoot }) };
  const model = await collectForecastModelIdentity(repositoryRoot);
  if (!Number.isFinite(Date.parse(issuedAt)) || Date.parse(issuedAt) > Date.now() + 300000) throw new RangeError('Issuance timestamp cannot be in the future');
  if (recordKind === 'issued' && Date.now() - Date.parse(issuedAt) > 3600000) throw new RangeError('Actual issuance cannot be backdated; use reconstructed for historical work');
  const snapshot = await createForecastSnapshot(input, { asOf });
  const archive = await readForecastArchive(directory);
  const optionsByScenario = LONG_HORIZON_SCENARIOS.map(scenario => ({ scenario: scenario.id,
    options: { ...LONG_HORIZON_DEFAULTS, scenario: scenario.id, asOf,
      referenceDate: dateFromDay(utcDay(asOf) + 1), researchAsOf: LONG_HORIZON_REVIEW_DATE } }));
  const publication = { records: archive.records, observationDates: snapshot.prices.map(row => row[0]),
    snapshotDataHash: snapshot.dataHash, modelSourceHash: model.sourceHash, modelVersion: 'source-anchored-long-horizon-2', optionsByScenario, recordKind };
  const decision = forecastIssuanceStatus(asOf, issuedAt, publication);
  const records = [];
  for (const { scenario, options } of decision.publicationDue ? optionsByScenario : []) {
    const runKey = await forecastHash({ recordKind, snapshotDataHash: snapshot.dataHash, modelSourceHash: model.sourceHash, modelVersion: publication.modelVersion, options, scenario, researchAsOf: LONG_HORIZON_REVIEW_DATE });
    if (archive.records.some(record => record.runKey === runKey)) continue;
    const predecessors = archive.records.filter(record => record.scenario.id === scenario && record.recordKind === recordKind);
    const sameCutoff = predecessors.filter(record => record.asOf === asOf).at(-1);
    const changedAssumptions = decision.publicationReasons.some(reason => ['model-source-changed', 'model-version-changed', 'settings-changed'].includes(reason));
    const prior = sameCutoff ?? (changedAssumptions ? predecessors.at(-1) : null);
    const forecast = buildLongHorizonForecast(input, options);
    records.push(await createForecastRecord({ snapshot, forecast, model, options, issuedAt, recordKind,
      replaces: prior?.id ?? null, revisionReason: sameCutoff
        ? 'Same observation cutoff with a changed input, model source or assumptions; predecessor remains immutable.'
        : prior ? 'Changed model source or assumptions triggered preservation before the regular interval; the earlier forecast and its evaluation remain preserved.' : null }));
  }
  let experimentReport = null;
  const previousExperiment = archive.index.experimentsPath ? await readJson(resolve(directory, 'experiments.json')) : null;
  const { runForecastExperiments, FORECAST_EXPERIMENT_POLICY } = await import('../dist/forecast-experiments.js');
  const experimentIdentity = experiments || previousExperiment ? await collectForecastModelIdentity(repositoryRoot, 'dist/forecast-experiments.js') : null;
  const needsExperiment = experiments || previousExperiment && (previousExperiment.asOf !== asOf || previousExperiment.observationHash !== await forecastHash(input.prices) || previousExperiment.sourceHash !== model.sourceHash || previousExperiment.experimentSourceHash !== experimentIdentity.sourceHash || previousExperiment.policyHash !== await forecastHash(FORECAST_EXPERIMENT_POLICY));
  if (needsExperiment) {
    experimentReport = await runForecastExperiments(input, { asOf, sourceCommit: model.sourceCommit, sourceHash: model.sourceHash,
      experimentSourceHash: experimentIdentity.sourceHash, experimentSourceFiles: experimentIdentity.files });
    if (experimentReport.cycleAblation.status === 'incomplete') throw new Error('A forecast ablation origin failed; inspect the experiment rather than publishing partial success');
  }
  const after = records.length ? forecastIssuanceStatus(asOf, issuedAt, { ...publication, records: [...archive.records, ...records] }) : decision;
  const refresh = { ...after, publicationDue: decision.publicationDue, publicationReasons: decision.publicationReasons,
    outcome: records.length ? 'generated' : decision.publicationDue ? 'unchanged' : decision.outcome,
    reason: records.length || decision.publicationDue ? null : decision.reason };
  return { status: 'PASS', ...await appendForecastArchive(directory, { snapshot, records, observedInput: input, asOf, experiments: experimentReport, refresh }) };
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  const args = process.argv.slice(2), options = {};
  for (let index = 0; index < args.length; index++) {
    const arg = args[index];
    if (arg === '--check') options.check = true;
    else if (arg === '--experiments') options.experiments = true;
    else if (arg === '--issued-at') options.issuedAt = args[++index];
    else if (arg === '--kind') options.recordKind = args[++index];
    else throw new Error('Unknown forecast ledger argument: ' + arg);
  }
  const result = await buildForecastLedger(options);
  const { evaluation, ...summary } = result;
  console.log(JSON.stringify({ ...summary, pendingTargets: evaluation?.rows.filter(row => row.status === 'pending').length ?? summary.pendingTargets, scoredTargets: evaluation?.maturedTargets ?? summary.scoredTargets }, null, 2));
}
