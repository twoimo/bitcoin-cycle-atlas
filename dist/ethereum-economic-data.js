/**
 * Public source acquisition boundary for ETH economic research.
 * A provider archive is an observation, not an eth-economic-input-3 snapshot.
 * This adapter does not relabel historical observations as historical captures.
 */
import { ETH_ECONOMIC_INPUT_SCHEMA, assessEthereumEconomicFeasibility } from './ethereum-economic-model.js';

const DAY_MS = 86400000;
const DOC_REF = '8489126ae94aff995d01be44f965327f2640f51e';
const DOC_ROOT = 'https://github.com/coinmetrics/product-docs/blob/' + DOC_REF + '/docs/';
export const COIN_METRICS_ETH_ARCHIVE = Object.freeze({
  repository: 'coinmetrics/data',
  commit: 'f1a36afb962731c387bb03982758ab0103063da5',
  path: 'csv/eth.csv',
  gitBlobSha: 'd8e4f389b37626f432a923805e5cc5fa2ad5490b',
  bytes: 2121732,
  repositoryCommitTimestamp: '2026-05-24T13:37:39Z',
  sourceUrl: 'https://github.com/coinmetrics/data/blob/f1a36afb962731c387bb03982758ab0103063da5/csv/eth.csv',
  rawUrl: 'https://raw.githubusercontent.com/coinmetrics/data/f1a36afb962731c387bb03982758ab0103063da5/csv/eth.csv',
  license: 'CC-BY-NC-4.0',
  attribution: 'Coin Metrics, Inc.',
  licenseUrl: 'https://github.com/coinmetrics/data/blob/f1a36afb962731c387bb03982758ab0103063da5/LICENSE',
  licenseGitBlobSha: 'f8f2af023ec95cb746dd08ec624c4c147b375af9',
  definitionCommit: DOC_REF,
});
export const COIN_METRICS_ETH_FIELDS = Object.freeze({
  FeeTotNtv: {
    unit: 'ETH / UTC day',
    definition: 'Total execution base, priority and blob fees; includes fees burned. Additional MEV is not automatically included.',
    modelMapping: null,
    reason: 'executionFeesEth and blobFeesEth require a measured split; assigning the total to execution fees double counts blobs.',
    definitionUrl: DOC_ROOT + 'network-data/network-data-overview/fees-and-revenue/fees.md#feetot',
  },
  IssTotNtv: {
    unit: 'ETH / UTC day',
    definition: 'Provider gross new issuance for eth. This is not consensus net issuance.',
    modelMapping: null,
    reason: 'Consensus penalties and the execution/consensus era split are missing. eth_cl uses different deposit-inclusive semantics.',
    definitionUrl: DOC_ROOT + 'network-data/network-data-overview/supply/supply-issuance.md#isstot',
  },
  SplyCur: {
    unit: 'ETH at UTC day end',
    definition: 'Provider current ledger supply; retain its original field and definition vintage.',
    modelMapping: null,
    reason: 'The pinned supply page and historical staking tutorial use different EL/CL accounting presentations. Reconcile the exact series scope before mapping to total supplyEth.',
    definitionUrl: DOC_ROOT + 'network-data/network-data-overview/supply/current-supply.md#splycur',
    reconciliationUrl: DOC_ROOT + 'tutorials-and-examples/tutorials/using-staking-metrics-to-get-yield-and-staked-supply.md',
  },
  TxCnt: {
    unit: 'L1 transactions / UTC day',
    definition: 'Provider L1 transaction count; not gas used, unique people or fixed-universe L2 transactions.',
    modelMapping: null,
    reason: 'Neither l1GasUsed nor l2Transactions is supplied by this field.',
    definitionUrl: DOC_ROOT + 'network-data/network-data-overview/transactions/transactions.md#txcnt',
  },
  AssetEODCompletionTime: {
    unit: 'Unix seconds',
    definition: 'Provider time when its last daily metric was calculated. Not the publication or collection time of these exact bytes.',
    modelMapping: null,
    reason: 'Calculation completion does not prove original publication, immutable past revisions or our historical collection.',
    definitionUrl: DOC_ROOT + 'network-data/network-data-overview/availability/asseteodcompletiontime.md',
  },
});
const VALUE_FIELDS = ['FeeTotNtv', 'IssTotNtv', 'SplyCur', 'TxCnt'];
const REQUIRED_HEADERS = ['time', ...VALUE_FIELDS, 'AssetEODCompletionTime'];

function day(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new TypeError('A UTC day label is required');
  const time = Date.parse(value + 'T00:00:00.000Z');
  if (!Number.isFinite(time) || new Date(time).toISOString().slice(0, 10) !== value) throw new RangeError('Invalid UTC day');
  return time / DAY_MS;
}
function timestamp(value, label) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/.test(value)) throw new TypeError(label + ' must be an explicit UTC timestamp');
  const time = Date.parse(value);
  if (!Number.isFinite(time) || new Date(time).toISOString().slice(0, 19) !== value.slice(0, 19)) throw new RangeError('Invalid ' + label);
  return time;
}
const dateFromDay = value => new Date(value * DAY_MS).toISOString().slice(0, 10);
function numericCell(text, name) {
  if (text === '') return null;
  if (!/^(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/.test(text)) throw new TypeError('Invalid numeric cell: ' + name);
  const value = Number(text);
  if (!Number.isFinite(value) || value < 0) throw new RangeError('Non-finite or negative cell: ' + name);
  if ((name === 'TxCnt' || name.endsWith('CompletionTime')) && !Number.isSafeInteger(value)) throw new RangeError('A safe integer is required: ' + name);
  if (name === 'SplyCur' && value <= 0) throw new RangeError('Supply must be positive when present');
  return value;
}

/** Parse only the reviewed unquoted Coin Metrics generator format. Missing cells remain null. */
export function parseCoinMetricsEthCsv(csv) {
  if (typeof csv !== 'string' || csv.length === 0 || csv.length > 8000000) throw new TypeError('A bounded CSV string is required');
  if (csv.includes('"') || csv.includes('\0')) throw new TypeError('Unreviewed quoted or binary CSV format');
  const lines = csv.replace(/\r\n/g, '\n').replace(/\n+$/, '').split('\n');
  if (lines.length < 2 || lines.length > 50001) throw new RangeError('CSV row count outside the supported bound');
  const headers = lines[0].split(',');
  if (new Set(headers).size !== headers.length || headers.some(h => !/^[A-Za-z][A-Za-z0-9_]*$/.test(h))) throw new TypeError('Invalid or duplicate CSV headers');
  for (const field of REQUIRED_HEADERS) if (!headers.includes(field)) throw new TypeError('Missing required CSV column: ' + field);
  const index = Object.fromEntries(headers.map((name, i) => [name, i]));
  let previousDay = -Infinity;
  const rows = lines.slice(1).map((line, rowIndex) => {
    const cells = line.split(',');
    if (cells.length !== headers.length) throw new RangeError('CSV width mismatch at data row ' + (rowIndex + 1));
    const date = cells[index.time], d = day(date);
    if (d <= previousDay) throw new RangeError('CSV days must be unique and strictly increasing');
    previousDay = d;
    const raw = {}, metrics = {};
    for (const name of VALUE_FIELDS) {
      raw[name] = cells[index[name]];
      metrics[name] = numericCell(raw[name], name);
    }
    const completion = numericCell(cells[index.AssetEODCompletionTime], 'AssetEODCompletionTime');
    const providerCompletedAt = completion === null ? null : new Date(completion * 1000).toISOString();
    const observedAt = new Date((d + 1) * DAY_MS).toISOString();
    if (completion !== null && completion * 1000 < (d + 1) * DAY_MS) throw new RangeError('Provider completion precedes the closed UTC day');
    return { date, observedAt, providerCompletedAt, metrics, raw };
  });
  return {
    version: 'coinmetrics-eth-csv-1',
    headers, rows,
    firstDate: rows[0].date, lastDate: rows.at(-1).date,
    rawRowCount: rows.length,
    completeRawMetricRows: rows.filter(r => VALUE_FIELDS.every(k => r.metrics[k] !== null) && r.providerCompletedAt !== null).length,
    missingByField: Object.fromEntries([...VALUE_FIELDS, 'AssetEODCompletionTime'].map(k => [k,
      rows.filter(r => k === 'AssetEODCompletionTime' ? r.providerCompletedAt === null : r.metrics[k] === null).length])),
  };
}
function checkedIndex(parsed) {
  if (!parsed || parsed.version !== 'coinmetrics-eth-csv-1' || !Array.isArray(parsed.rows)) throw new TypeError('Parsed Coin Metrics ETH data is required');
  if (parsed.rows.length === 0 || parsed.rows.length > 50000) throw new RangeError('Parsed row count outside the supported bound');
  const map = new Map(); let previous = -Infinity;
  for (const row of parsed.rows) {
    const d = day(row.date);
    if (d <= previous) throw new RangeError('Parsed days must be unique and increasing');
    previous = d;
    if (row.observedAt !== new Date((d + 1) * DAY_MS).toISOString()) throw new RangeError('Parsed observation clock mismatch');
    for (const name of VALUE_FIELDS) {
      const value = row.metrics?.[name];
      if (value !== null && (typeof value !== 'number' || !Number.isFinite(value) || value < 0)) throw new TypeError('Invalid parsed metric: ' + name);
      if (name === 'SplyCur' && value !== null && value <= 0) throw new RangeError('Invalid parsed supply');
      if (name === 'TxCnt' && value !== null && !Number.isSafeInteger(value)) throw new RangeError('Invalid parsed transaction count');
    }
    if (row.providerCompletedAt !== null && timestamp(row.providerCompletedAt, 'providerCompletedAt') < (d + 1) * DAY_MS) throw new RangeError('Provider completion precedes observation');
    map.set(d, row);
  }
  return map;
}
function windowFromIndex(index, observedThrough) {
  const end = day(observedThrough), missingDates = [], missingFields = [];
  const selected = [];
  for (let d = end - 27; d <= end; d++) {
    const row = index.get(d);
    if (!row) { missingDates.push(dateFromDay(d)); continue; }
    selected.push(row);
    for (const key of VALUE_FIELDS) if (row.metrics[key] === null) missingFields.push({ date: row.date, field: key });
    if (row.providerCompletedAt === null) missingFields.push({ date: row.date, field: 'AssetEODCompletionTime' });
  }
  const completeWindow = missingDates.length === 0 && missingFields.length === 0;
  const sum = key => selected.reduce((total, row) => total + row.metrics[key], 0);
  const aggregate = completeWindow ? {
    totalFeesIncludingBlobEth: sum('FeeTotNtv'),
    grossIssuanceEth: sum('IssTotNtv'),
    l1TransactionCount: sum('TxCnt'),
    providerLedgerSupplyEth: selected.at(-1).metrics.SplyCur,
  } : null;
  if (aggregate && (Object.values(aggregate).some(value => !Number.isFinite(value)) || !Number.isSafeInteger(aggregate.l1TransactionCount))) throw new RangeError('Window aggregation overflow');
  return {
    observedFrom: dateFromDay(end - 27), observedThrough,
    observedAt: new Date((end + 1) * DAY_MS).toISOString(),
    windowDays: 28, completeWindow, missingDates, missingFields, aggregate,
    providerCompletedAt: completeWindow ? selected.map(r => r.providerCompletedAt).sort().at(-1) : null,
    modelSnapshot: null,
    accounting: 'Original provider aggregates only. Fees include blobs; issuance is gross; supply scope is unreconciled; L1 transaction count is not gas.',
  };
}
export function aggregateCoinMetricsEthWindow(parsed, observedThrough) {
  return windowFromIndex(checkedIndex(parsed), observedThrough);
}

/** Readiness is for the existing 25-metric economic contract, not raw-source availability. */
export function assessCoinMetricsEconomicCoverage(parsed, { asOf, collectedAt }) {
  const d = day(asOf), capture = timestamp(collectedAt, 'collectedAt');
  const index = checkedIndex(parsed);
  for (const row of parsed.rows) {
    if (row.providerCompletedAt !== null && timestamp(row.providerCompletedAt, 'providerCompletedAt') > capture) throw new RangeError('Provider completion is later than collection');
  }
  const requestedWindow = windowFromIndex(index, asOf);
  let latestCompleteWindow = null;
  for (let i = parsed.rows.length - 1; i >= 0; i--) {
    if (day(parsed.rows[i].date) > d) continue;
    const window = windowFromIndex(index, parsed.rows[i].date);
    if (window.completeWindow) { latestCompleteWindow = window; break; }
  }
  const staleDays = latestCompleteWindow ? d - day(latestCompleteWindow.observedThrough) : null;
  const requirements = Object.keys(ETH_ECONOMIC_INPUT_SCHEMA.metrics).map(metric => ({
    metric, status: 'unavailable', sourceField: null,
    reason: metric === 'supplyEth' ? 'SplyCur exists but exact EL/CL scope and its revision history need reconciliation.'
      : metric === 'executionFeesEth' || metric === 'blobFeesEth' || metric === 'blobBurnEth' ? 'FeeTotNtv is an aggregate including blob fees; the required split is absent.'
      : metric === 'consensusNetIssuanceEth' || metric === 'executionPowIssuanceEth' ? 'IssTotNtv is gross issuance; required layer, penalty and era components are absent.'
      : metric === 'l1GasUsed' || metric === 'l2Transactions' ? 'TxCnt is L1 transaction count and cannot substitute for gas or a fixed L2 universe.'
      : 'Required measured field and its definition-matched provenance are absent.',
  }));
  return {
    version: 'eth-economic-source-coverage-1', asOf, collectedAt,
    sourceStatus: parsed.completeRawMetricRows > 0 ? 'partial-observations-collected' : 'no-complete-raw-observations',
    requestedWindow, latestCompleteWindow, staleDays,
    freshness: staleDays === null ? 'unavailable' : staleDays > 7 ? 'stale' : 'within-seven-days',
    requiredMetricCount: requirements.length,
    definitionMatchedMetricCount: 0,
    requirements,
    publishedAt: null,
    historicalCollectionProven: false,
    historicalPointInTimeReady: false,
    fullModelSnapshotReady: false,
    modelFeasibility: assessEthereumEconomicFeasibility({asOf}),
    eligibleModelSnapshotCount: 0,
    modelSnapshots: [],
    blockers: [
      'This collection time applies to the exact archive captured now, not historical issue times.',
      'Provider calculation completion and Git commit metadata are not proven publication times of historical metric vintages.',
      'Only aggregate provider fields are present; the reviewed 25-metric definition and cohort requirements are not satisfied.',
      ...(staleDays !== null && staleDays > 7 ? ['Latest complete source window is older than the seven-day model freshness limit.'] : []),
    ],
  };
}
async function hash(algorithm, bytes) {
  if (!globalThis.crypto?.subtle) throw new Error('WebCrypto is required to verify captured bytes');
  const value = new Uint8Array(await crypto.subtle.digest(algorithm, bytes));
  return [...value].map(b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Verify the exact pinned bytes before issuing a capture receipt. The caller
 * supplies real capture times; no provider or commit timestamp is substituted.
 */
export async function captureCoinMetricsEthArchive(csv, { captureStartedAt, collectedAt, asOf }) {
  const start = timestamp(captureStartedAt, 'captureStartedAt');
  const finish = timestamp(collectedAt, 'collectedAt');
  if (start > finish) throw new RangeError('Capture start is later than completion');
  day(asOf);
  const bytes = new TextEncoder().encode(csv);
  if (bytes.byteLength !== COIN_METRICS_ETH_ARCHIVE.bytes) throw new RangeError('Pinned source byte length mismatch');
  const prefix = new TextEncoder().encode('blob ' + bytes.byteLength + '\0');
  const gitBytes = new Uint8Array(prefix.length + bytes.length);
  gitBytes.set(prefix); gitBytes.set(bytes, prefix.length);
  const gitBlobSha = await hash('SHA-1', gitBytes);
  if (gitBlobSha !== COIN_METRICS_ETH_ARCHIVE.gitBlobSha) throw new Error('Pinned Git blob hash mismatch');
  const sourceSha256 = await hash('SHA-256', bytes);
  const parsed = parseCoinMetricsEthCsv(csv);
  const coverage = assessCoinMetricsEconomicCoverage(parsed, { asOf, collectedAt });
  return {
    version: 'eth-economic-public-source-capture-1',
    source: { ...COIN_METRICS_ETH_ARCHIVE, gitBlobSha, sourceSha256 },
    captureStartedAt, collectedAt, publishedAt: null,
    vintageId: 'coinmetrics/data:' + COIN_METRICS_ETH_ARCHIVE.commit + ':csv/eth.csv:' + sourceSha256,
    preservation: 'Preserve these exact raw bytes with this receipt; a re-fetch or revision receives a new capture receipt.',
    publication: 'Repository commit timestamp is recorded only as Git metadata. No first-publication timestamp is asserted.',
    parsed, coverage,
  };
}
