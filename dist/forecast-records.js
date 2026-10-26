import { utcDay, dateFromDay } from './cycle-engine.js?v=1.29.0';
import { forecastPricePrefix, buildIndependentBenchmarks, FORECAST_HORIZONS } from './forecast-evaluation.js';

export const FORECAST_RECORD_SCHEMA = 1;
export const FORECAST_PATH_COLUMNS = Object.freeze(['date', 'price', 'lower', 'upper', 'baselinePrice', 'cycleDisplacement', 'residualLog']);
const HEX = /^[a-f0-9]{64}$/;
const COMMIT = /^[a-f0-9]{40}$/;

export function canonicalForecastJson(value) {
  function encode(item, depth = 0) {
    if (depth > 80) throw new RangeError('Forecast data nesting exceeded the limit');
    if (item === null || typeof item === 'boolean' || typeof item === 'string') return JSON.stringify(item);
    if (typeof item === 'number') {
      if (!Number.isFinite(item)) throw new TypeError('Forecast JSON requires finite numbers');
      return JSON.stringify(item);
    }
    if (Array.isArray(item)) return '[' + Array.from(item, child => encode(child, depth + 1)).join(',') + ']';
    if (typeof item !== 'object' || Object.getPrototypeOf(item) !== Object.prototype) throw new TypeError('Forecast JSON requires plain values');
    return '{' + Object.keys(item).sort().map(key => JSON.stringify(key) + ':' + encode(item[key], depth + 1)).join(',') + '}';
  }
  return encode(value);
}

export async function forecastHash(value) {
  if (!globalThis.crypto?.subtle) throw new Error('SHA-256 verification is unavailable in this browser');
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(canonicalForecastJson(value)));
  return Array.from(new Uint8Array(hash), byte => byte.toString(16).padStart(2, '0')).join('');
}

function timestamp(value, name) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?(?:Z|\+00:00)$/.test(value) || !Number.isFinite(Date.parse(value))) throw new TypeError(name + ' must be an explicit UTC timestamp');
  const normalized = new Date(value).toISOString();
  if (normalized.slice(0, 19) !== value.slice(0, 19)) throw new TypeError(name + ' is not a valid calendar timestamp');
  return normalized;
}

function positive(value, name) {
  if (!Number.isFinite(value) || value <= 0) throw new RangeError(name + ' must be positive and finite');
  return value;
}

function unsignedBody(value) {
  const { id, ...body } = value;
  return body;
}

async function verifyAddress(value, kind) {
  if (!value || value.schemaVersion !== FORECAST_RECORD_SCHEMA || value.kind !== kind || !HEX.test(value.id)) throw new TypeError('Invalid ' + kind);
  if (await forecastHash(unsignedBody(value)) !== value.id) throw new Error(kind + ' content hash mismatch');
}

export async function createForecastSnapshot(input, { asOf, observedAt, availableAt = null } = {}) {
  const rows = forecastPricePrefix(input, asOf);
  if (rows.at(-1).date !== asOf) throw new RangeError('Snapshot cutoff must have an observed close');
  const observed = timestamp(observedAt ?? input?.meta?.retrievedAt, 'observedAt');
  const available = availableAt === null ? null : timestamp(availableAt, 'availableAt');
  const eventAt = dateFromDay(utcDay(asOf) + 1) + 'T00:00:00.000Z';
  if (observed < eventAt || available !== null && (available < eventAt || available > observed)) throw new RangeError('Snapshot availability must follow its completed observations');
  const meta = input?.meta ?? {};
  const source = {
    name: meta.sourceName ?? 'Unspecified daily-price source', url: meta.source ?? null, metric: meta.metric ?? 'PriceUSD',
    currency: 'USD', frequency: '1d', timezone: 'UTC',
    priceDefinition: meta.priceDefinition ?? 'Completed UTC daily close; no intraday high/low',
    attributionUrl: meta.attributionUrl ?? null, license: meta.license ?? null, licenseUrl: meta.licenseUrl ?? null,
    originalCaptureTimestamp: observedAt ?? meta.retrievedAt ?? null,
    responseHashes: (meta.responsePages ?? (meta.rawSha256 ? [{ url: meta.source ?? null, sha256: meta.rawSha256 }] : [])).map(page => ({ url: page.url, sha256: page.sha256 ?? null })),
  };
  const prices = rows.map(row => [row.date, row.price]);
  const dataHash = await forecastHash({ symbol: 'BTCUSD', metric: source.metric, priceDefinition: source.priceDefinition, prices });
  const body = { schemaVersion: FORECAST_RECORD_SCHEMA, kind: 'atlas-forecast-snapshot', symbol: 'BTCUSD', asOf,
    eventAt, eventTimeMeaning: 'Exclusive UTC end of the last labeled daily observation', availableAt: available,
    availabilityStatus: available === null ? 'provider-publication-time-unknown' : 'documented', observedAt: observed,
    historicalVintagesAvailable: false, source, dataHash, prices };
  return { id: await forecastHash(body), ...body };
}

export async function verifyForecastSnapshot(snapshot) {
  await verifyAddress(snapshot, 'atlas-forecast-snapshot');
  const rows = forecastPricePrefix(snapshot.prices, snapshot.asOf);
  if (rows.length !== snapshot.prices.length || rows.at(-1).date !== snapshot.asOf || snapshot.symbol !== 'BTCUSD') throw new RangeError('Snapshot observation cutoff mismatch');
  if (snapshot.eventAt !== dateFromDay(utcDay(snapshot.asOf) + 1) + 'T00:00:00.000Z') throw new RangeError('Snapshot event time mismatch');
  timestamp(snapshot.observedAt, 'observedAt');
  if (snapshot.observedAt < snapshot.eventAt) throw new RangeError('Snapshot observed before its completed day');
  if (snapshot.availableAt !== null) {
    timestamp(snapshot.availableAt, 'availableAt');
    if (snapshot.availableAt > snapshot.observedAt || snapshot.availableAt < snapshot.eventAt) throw new RangeError('Snapshot publication-time order mismatch');
  }
  const dataHash = await forecastHash({ symbol: snapshot.symbol, metric: snapshot.source.metric, priceDefinition: snapshot.source.priceDefinition, prices: snapshot.prices });
  if (dataHash !== snapshot.dataHash) throw new Error('Snapshot observation hash mismatch');
  return snapshot;
}

export async function createForecastRecord({ snapshot, forecast, model, options, issuedAt, recordKind = 'issued', replaces = null, revisionReason = null, horizons = FORECAST_HORIZONS }) {
  await verifyForecastSnapshot(snapshot);
  const generatedAt = timestamp(issuedAt, 'issuedAt');
  if (!['issued', 'reconstructed'].includes(recordKind)) throw new RangeError('Unknown forecast record kind');
  if (generatedAt < snapshot.observedAt) throw new RangeError('A forecast cannot precede data observation');
  if (recordKind === 'issued' && snapshot.asOf !== dateFromDay(utcDay(generatedAt.slice(0, 10)) - 1)) throw new RangeError('Issued forecasts require the immediately preceding completed UTC day; stale origins must be reconstructed');
  if (forecast?.asOf !== snapshot.asOf || forecast?.path?.[0]?.price !== snapshot.prices.at(-1)[1]) throw new RangeError('Forecast anchor does not match its snapshot');
  if (!model || !COMMIT.test(model.sourceCommit) || !HEX.test(model.sourceHash) || typeof model.files !== 'object' || !Object.keys(model.files).length) throw new TypeError('A committed model identity and file hashes are required');
  for (const [path, hash] of Object.entries(model.files)) {
    if (!/^dist\/[a-zA-Z0-9._/-]+\.js$/.test(path) || path.includes('..') || !HEX.test(hash)) throw new TypeError('Invalid model source manifest');
  }
  if (await forecastHash(model.files) !== model.sourceHash) throw new Error('Model source manifest hash mismatch');
  if (replaces !== null && (!HEX.test(replaces) || typeof revisionReason !== 'string' || !revisionReason.trim())) throw new TypeError('A revision requires a predecessor and reason');
  const benchmarks = buildIndependentBenchmarks(snapshot.prices, { asOf: snapshot.asOf, horizons });
  const path = forecast.path.map(point => FORECAST_PATH_COLUMNS.map(key => point[key]));
  const byDate = new Map(forecast.path.map(point => [point.date, point]));
  const targets = benchmarks.targets.map(target => {
    const point = byDate.get(target.targetDate);
    if (!point) throw new RangeError('Forecast does not cover the evaluation target');
    return { ...target, price: point.price };
  });
  const output = { columns: [...FORECAST_PATH_COLUMNS], path, probability: null, calibrated: false,
    bandMeaning: 'Economic scenario range; not a prediction interval', displayEnd: forecast.displayEnd,
    cycleCalibration: forecast.cycleCalibration?.forecastApplication ?? null };
  const researchAsOf = forecast.longHorizon?.researchAsOf ?? options?.researchAsOf ?? null;
  if (researchAsOf !== null && researchAsOf > generatedAt.slice(0, 10)) throw new RangeError('Research cutoff is later than issuance');
  const modelIdentity = { version: forecast.version, sourceCommit: model.sourceCommit, sourceHash: model.sourceHash, files: { ...model.files } };
  const runKey = await forecastHash({ recordKind, snapshotDataHash: snapshot.dataHash, modelSourceHash: model.sourceHash, modelVersion: forecast.version, options, scenario: forecast.scenario.id, researchAsOf });
  const body = { schemaVersion: FORECAST_RECORD_SCHEMA, kind: 'atlas-forecast-record', recordKind, symbol: snapshot.symbol,
    asOf: snapshot.asOf, issuedAt: generatedAt, firstPublishedAt: null,
    issuanceMeaning: 'Time of actual generation and immutable preservation; public deployment is established separately by its publication manifest',
    snapshotId: snapshot.id, snapshotDataHash: snapshot.dataHash, model: modelIdentity, options: JSON.parse(canonicalForecastJson(options)),
    scenario: { id: forecast.scenario.id, label: forecast.scenario.label }, researchAsOf,
    historicalModelExistedAtOrigin: recordKind === 'issued', originalHistoricalVintages: false,
    runKey, replaces, revisionReason, benchmarks, targets, outputHash: await forecastHash(output), output };
  const record = { id: await forecastHash(body), ...body };
  await verifyForecastRecord(record, snapshot);
  return record;
}

export async function verifyForecastRecord(record, snapshot = null) {
  await verifyAddress(record, 'atlas-forecast-record');
  if (!['issued', 'reconstructed'].includes(record.recordKind) || !HEX.test(record.snapshotId) || !HEX.test(record.snapshotDataHash) || !HEX.test(record.runKey)) throw new TypeError('Invalid forecast identity');
  timestamp(record.issuedAt, 'issuedAt');
  utcDay(record.asOf);
  if (record.recordKind === 'issued' && record.asOf !== dateFromDay(utcDay(record.issuedAt.slice(0, 10)) - 1)) throw new RangeError('Issued forecast has an unfinished or stale observation day');
  if (record.researchAsOf !== null) {
    utcDay(record.researchAsOf);
    if (record.researchAsOf > record.issuedAt.slice(0, 10)) throw new RangeError('Research cutoff is later than issuance');
  }
  if (!COMMIT.test(record.model?.sourceCommit) || !HEX.test(record.model?.sourceHash) || !record.model?.files || !Object.keys(record.model.files).length || await forecastHash(record.model.files) !== record.model.sourceHash) throw new Error('Invalid model source manifest');
  for (const [path, hash] of Object.entries(record.model.files)) if (!/^dist\/[a-zA-Z0-9._/-]+\.js$/.test(path) || path.includes('..') || !HEX.test(hash)) throw new TypeError('Invalid model source file identity');
  const runKey = await forecastHash({ recordKind: record.recordKind, snapshotDataHash: record.snapshotDataHash, modelSourceHash: record.model.sourceHash, modelVersion: record.model.version, options: record.options, scenario: record.scenario.id, researchAsOf: record.researchAsOf });
  if (runKey !== record.runKey) throw new Error('Forecast run key mismatch');
  if (record.firstPublishedAt !== null) throw new RangeError('Record cannot assert deployment outside the publication manifest');
  if (record.replaces !== null && (!HEX.test(record.replaces) || !record.revisionReason?.trim())) throw new TypeError('Invalid forecast revision');
  const output = record.output;
  if (!output || output.probability !== null || output.calibrated !== false || canonicalForecastJson(output.columns) !== canonicalForecastJson(FORECAST_PATH_COLUMNS) || !Array.isArray(output.path) || output.path.length < 2 || output.path.length > 50000) throw new TypeError('Invalid conditional forecast path');
  if (await forecastHash(output) !== record.outputHash) throw new Error('Forecast output hash mismatch');
  const origin = utcDay(record.asOf);
  for (let index = 0; index < output.path.length; index++) {
    const row = output.path[index];
    if (!Array.isArray(row) || row.length !== FORECAST_PATH_COLUMNS.length || row[0] !== dateFromDay(origin + index)) throw new RangeError('Forecast daily path is incomplete or out of order');
    for (const column of [1, 2, 3, 4]) positive(row[column], 'Forecast price');
    if (row[2] > row[1] || row[1] > row[3] || !Number.isFinite(row[5]) || !Number.isFinite(row[6])) throw new RangeError('Invalid conditional path bounds');
  }
  if (output.path.at(-1)[0] !== output.displayEnd) throw new RangeError('Forecast display end mismatch');
  if (!Array.isArray(record.targets) || !record.targets.length || new Set(record.targets.map(target => target.horizonDays)).size !== record.targets.length) throw new TypeError('Forecast targets must be unique');
  for (const target of record.targets) {
    if (!Number.isSafeInteger(target.horizonDays) || target.horizonDays < 1 || target.horizonDays >= output.path.length || target.targetDate !== dateFromDay(origin + target.horizonDays)) throw new RangeError('Invalid forecast target date');
    if (target.price !== output.path[target.horizonDays][1]) throw new RangeError('Target differs from preserved path');
    positive(target.flat, 'Flat baseline'); positive(target.shrunkenTrend, 'Trend baseline');
  }
  if (snapshot) {
    await verifyForecastSnapshot(snapshot);
    if (snapshot.id !== record.snapshotId || snapshot.dataHash !== record.snapshotDataHash || snapshot.asOf !== record.asOf || snapshot.prices.at(-1)[1] !== output.path[0][1]) throw new Error('Forecast input snapshot mismatch');
    if (snapshot.observedAt > record.issuedAt) throw new RangeError('Forecast predates its data observation');
    const expected = buildIndependentBenchmarks(snapshot.prices, { asOf: record.asOf, horizons: record.targets.map(target => target.horizonDays) });
    if (canonicalForecastJson(expected) !== canonicalForecastJson(record.benchmarks)) throw new Error('Preserved benchmark inputs mismatch');
    for (const target of record.targets) {
      const baseline = expected.targets.find(value => value.horizonDays === target.horizonDays);
      if (target.flat !== baseline.flat || target.shrunkenTrend !== baseline.shrunkenTrend) throw new Error('Preserved benchmark output mismatch');
    }
  }
  return record;
}

export function forecastIndexEntry(record) {
  return { id: record.id, runKey: record.runKey, asOf: record.asOf, issuedAt: record.issuedAt, scenario: record.scenario.id,
    scenarioLabel: record.scenario.label, kind: record.recordKind, modelVersion: record.model.version,
    sourceCommit: record.model.sourceCommit, sourceHash: record.model.sourceHash, snapshotId: record.snapshotId,
    snapshotDataHash: record.snapshotDataHash, recordPath: 'records/' + record.id + '.json', snapshotPath: 'snapshots/' + record.snapshotId + '.json',
    displayEnd: record.output.displayEnd, replaces: record.replaces };
}

export function validateForecastIndex(index) {
  if (!index || index.schemaVersion !== 1 || index.kind !== 'atlas-forecast-index' || !Array.isArray(index.entries) || index.entries.length > 50000) throw new TypeError('Invalid forecast index');
  const ids = new Set(), runs = new Set();
  for (const entry of index.entries) {
    if (!HEX.test(entry.id) || !HEX.test(entry.snapshotId) || !HEX.test(entry.runKey) || !HEX.test(entry.sourceHash) || !COMMIT.test(entry.sourceCommit)) throw new TypeError('Invalid forecast index entry');
    if (entry.recordPath !== 'records/' + entry.id + '.json' || entry.snapshotPath !== 'snapshots/' + entry.snapshotId + '.json') throw new RangeError('Forecast index path must match its content address');
    if (ids.has(entry.id) || runs.has(entry.runKey)) throw new RangeError('Duplicate forecast identity or run');
    ids.add(entry.id); runs.add(entry.runKey);
    utcDay(entry.asOf); timestamp(entry.issuedAt, 'issuedAt');
  }
  return index;
}

function embeddedArchive(options) {
  if (options.embedded) return options.embedded;
  const text = globalThis.document?.getElementById('atlas-forecast-ledger')?.textContent;
  return text ? JSON.parse(text) : null;
}

async function fetchJson(path, options, limit = 12000000) {
  const base = options.baseUrl ?? new URL('./data/forecast-ledger/', globalThis.document?.baseURI ?? import.meta.url);
  const response = await (options.fetchImpl ?? globalThis.fetch)(new URL(path, base), { credentials: 'omit', redirect: 'error', cache: 'no-cache', signal: options.signal });
  if (!response.ok) throw new Error('Forecast archive HTTP ' + response.status);
  const text = await response.text();
  if (text.length > limit) throw new RangeError('Forecast archive resource exceeded its size limit');
  return JSON.parse(text);
}

export async function loadForecastIndex(options = {}) {
  const embedded = embeddedArchive(options);
  return validateForecastIndex(embedded ? embedded.index : await fetchJson('index.json', options, 2000000));
}

export async function loadForecastRecord(entry, options = {}) {
  if (!HEX.test(entry?.id) || entry.recordPath !== 'records/' + entry.id + '.json') throw new TypeError('Invalid forecast record address');
  const embedded = embeddedArchive(options);
  const record = embedded ? embedded.records?.[entry.id] : await fetchJson(entry.recordPath, options);
  await verifyForecastRecord(record);
  if (canonicalForecastJson(forecastIndexEntry(record)) !== canonicalForecastJson(entry)) throw new Error('Forecast index metadata differs from its record');
  return record;
}

export async function loadForecastSnapshot(entry, options = {}) {
  if (!HEX.test(entry?.snapshotId) || entry.snapshotPath !== 'snapshots/' + entry.snapshotId + '.json') throw new TypeError('Invalid forecast snapshot address');
  const embedded = embeddedArchive(options);
  const snapshot = embedded ? embedded.snapshots?.[entry.snapshotId] : await fetchJson(entry.snapshotPath, options);
  await verifyForecastSnapshot(snapshot);
  if (snapshot.id !== entry.snapshotId || snapshot.dataHash !== entry.snapshotDataHash || snapshot.asOf !== entry.asOf) throw new Error('Forecast snapshot differs from its index');
  return snapshot;
}

export async function loadForecastEvaluation(options = {}) {
  const embedded = embeddedArchive(options);
  const value = embedded ? embedded.evaluation : await fetchJson('evaluation.json', options);
  if (!value || value.schemaVersion !== 1 || value.kind !== 'atlas-forecast-evaluation' || !Array.isArray(value.rows) || !Array.isArray(value.summaries)) throw new TypeError('Invalid forecast evaluation');
  return value;
}

export async function loadForecastExperiments(options = {}) {
  const embedded = embeddedArchive(options);
  const value = embedded ? embedded.experiments : await fetchJson('experiments.json', options);
  if (!value || value.schemaVersion !== 1 || value.kind !== 'atlas-forecast-experiments') throw new TypeError('Invalid forecast experiments');
  return value;
}

export function restoreForecastPath(record) {
  return record.output.path.map(row => ({ ...Object.fromEntries(FORECAST_PATH_COLUMNS.map((key, index) => [key, row[index]])),
    kind: 'preserved-conditional-path', probability: null, calibrated: false }));
}

export function compareForecastRecords(before, after) {
  if (!before || !after) throw new TypeError('Two forecast records are required');
  const oldRows = new Map(before.output.path.map(row => [row[0], row]));
  const changes = after.targets.flatMap(target => {
    const prior = oldRows.get(target.targetDate), next = after.output.path[target.horizonDays];
    if (!prior) return [];
    const baselineLogChange = Math.log(next[4]) - Math.log(prior[4]);
    const cycleLogChange = next[5] - prior[5], residualLogChange = next[6] - prior[6];
    const totalLogChange = Math.log(next[1]) - Math.log(prior[1]);
    return [{ targetDate: target.targetDate, beforePrice: prior[1], afterPrice: next[1], totalLogChange,
      baselineLogChange, cycleLogChange, residualLogChange,
      remainderLogChange: totalLogChange - baselineLogChange - cycleLogChange - residualLogChange }];
  });
  return { beforeId: before.id, afterId: after.id, sameScenario: before.scenario.id === after.scenario.id,
    inputChanged: before.snapshotDataHash !== after.snapshotDataHash, modelChanged: before.model.sourceHash !== after.model.sourceHash,
    optionsChanged: canonicalForecastJson(before.options) !== canonicalForecastJson(after.options),
    originChanged: before.asOf !== after.asOf, changes,
    interpretation: 'Exact arithmetic decomposition on common target dates; baseline, clock and residual changes can share causes. It is not causal attribution.' };
}
