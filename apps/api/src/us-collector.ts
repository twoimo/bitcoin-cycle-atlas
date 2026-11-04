import { createHash, randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import type pg from 'pg';
import type { MarketSnapshot, Point } from '@atlas/contracts/market-lab';
import type { CollectionRun, CollectionSource, CollectionSchedule, UsSeries } from '@atlas/contracts/us-collection';
import { validateSnapshot, validateSeries, calendarDate } from '@atlas/domain/market-lab';
import { parseFredMacro } from '../../../scripts/import-market-lab-fred.mjs';
import { readSnapshot, publishSnapshot } from './repository.js';

const LOCK = 'atlas:us-official-collection';
export const US_COLLECTION_INTERVAL = 15 * 60 * 1000;
export const usSources = [
  { series: 'GDPC1', axis: 'alpha', frequency: 'quarterly', label: 'FRED / BEA 실질GDP 전기비', metric: '실질GDP 전기비(FRED/BEA 계절조정 수준비)' },
  { series: 'TB3MS', axis: 'beta', frequency: 'monthly', label: 'FRED / 연준 H.15 3개월 국채 월평균', metric: '3개월 미국 국채 할인수익률(월평균)' },
  { series: 'VIXCLS', axis: 'gamma', frequency: 'daily', label: 'FRED / Cboe VIX 일별 종가', metric: 'VIX: 심리의 변동성 대리지표' },
] as const;
const digest = (body: string) => createHash('sha256').update(body).digest('hex');
export const fredUrl = (series: UsSeries) => `https://fred.stlouisfed.org/graph/fredgraph.csv?id=${series}&cosd=2010-01-01`;

export async function migrateUsCollection(pool: pg.Pool) {
  const sql = await readFile(new URL('../../../db/migrations/004_us_collection.sql', import.meta.url), 'utf8');
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [LOCK]);
    const previous = await client.query('SELECT sha256 FROM atlas_schema_migrations WHERE name=$1', ['004_us_collection']);
    if (previous.rowCount && previous.rows[0].sha256 !== digest(sql)) throw new Error('Applied collection migration checksum changed');
    if (!previous.rowCount) {
      await client.query(sql);
      await client.query('INSERT INTO atlas_schema_migrations(name,sha256) VALUES ($1,$2)', ['004_us_collection', digest(sql)]);
    }
    await client.query('COMMIT');
  } catch (error) { await client.query('ROLLBACK'); throw error; }
  finally { client.release(); }
}

export function parseVixCsv(raw: string, now: Date): Point[] {
  const rows = raw.trim().split(/\r?\n/).map(row => row.split(','));
  if (rows[0].join(',') !== 'observation_date,VIXCLS') throw new Error('VIX header mismatch');
  let previous = '';
  const values: Point[] = [];
  const today = calendarDate(now, 'America/New_York')!;
  for (const row of rows.slice(1)) {
    if (row.length !== 2) throw new Error('VIX column count');
    const [date, value] = row;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(Date.parse(date)) || new Date(date).toISOString().slice(0, 10) !== date || date <= previous) throw new Error('VIX date/order mismatch');
    previous = date;
    if (value === '.' || value === '') continue;
    const number = Number(value);
    if (!Number.isFinite(number) || number <= 0) throw new Error('VIX invalid value');
    if (date < today) values.push([date, number]);
  }
  validateSeries(values, { positive: true });
  if (values.length < 127) throw new Error('VIX historical coverage insufficient');
  return values;
}

async function readBounded(response: Response) {
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  if (Number(response.headers.get('content-length')) > 1048576) throw new Error('Source exceeds 1 MiB');
  const reader = response.body?.getReader();
  if (!reader) throw new Error('Empty source body');
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.length;
      if (length > 1048576) { await reader.cancel(); throw new Error('Source exceeds 1 MiB'); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  return Buffer.concat(chunks).toString('utf8');
}
function rowRun(row: Record<string, any>): CollectionRun {
  return { id: row.id, startedAt: row.started_at.toISOString(), finishedAt: row.finished_at?.toISOString() ?? null, status: row.status, revision: row.revision, sources: row.sources, error: row.error };
}
export async function readUsCollection(pool: pg.Pool) {
  const result = await pool.query(`SELECT * FROM market_lab_collection_runs ORDER BY run_order DESC LIMIT 1`);
  const success = await pool.query(`SELECT * FROM market_lab_collection_runs WHERE status IN ('published','unchanged') ORDER BY run_order DESC LIMIT 1`);
  return { latest: result.rowCount ? rowRun(result.rows[0]) : null, lastSuccess: success.rowCount ? rowRun(success.rows[0]) : null };
}

export async function runUsCollection(pool: pg.Pool, { fetchImpl = fetch, clock = () => new Date(), signal, force = false, intervalMs = US_COLLECTION_INTERVAL }: {
  fetchImpl?: typeof fetch; clock?: () => Date; signal?: AbortSignal; force?: boolean; intervalMs?: number;
} = {}) {
  signal?.throwIfAborted();
  const client = await pool.connect();
  let locked = false, id: string | null = null;
  const receipts: CollectionSource[] = [];
  try {
    signal?.throwIfAborted();
    locked = (await client.query('SELECT pg_try_advisory_lock(hashtext($1)) AS locked', [LOCK])).rows[0].locked;
    signal?.throwIfAborted();
    if (!locked) return { status: 'busy' as const };
    const last = (await client.query('SELECT started_at,finished_at,status FROM market_lab_collection_runs ORDER BY run_order DESC LIMIT 1')).rows[0];
    if (!force && last && last.status !== 'running' && +clock() - +(last.finished_at ?? last.started_at) < intervalMs) return { status: 'not_due' as const };
    signal?.throwIfAborted();
    const interruptedAt = clock().toISOString();
    await client.query("UPDATE market_lab_collection_runs SET status='interrupted',finished_at=$1,error='Previous process ended before collection acceptance' WHERE status='running'", [interruptedAt]);
    id = randomUUID();
    await client.query("INSERT INTO market_lab_collection_runs(id,started_at,status) VALUES ($1,$2,'running')", [id, clock().toISOString()]);
    const fetched = await Promise.all(usSources.map(async definition => {
      const url = fredUrl(definition.series);
      try {
        const bounded = signal ? AbortSignal.any([signal, AbortSignal.timeout(20000)]) : AbortSignal.timeout(20000);
        signal?.throwIfAborted();
        const body = await readBounded(await fetchImpl(url, { signal: bounded, redirect: 'error' }));
        const checkedAt = clock().toISOString();
        const values: Point[] = definition.series === 'VIXCLS' ? parseVixCsv(body, clock()) : parseFredMacro(body, definition.series, { now: clock() }).map(row => [String(row[0]),Number(row[1])] as Point);
        if (values.length < 40) throw new Error('Macro historical coverage insufficient');
        const receipt: CollectionSource = { series: definition.series, axis: definition.axis, url, status: 'ready', checkedAt, sha256: digest(body), lastObservation: values.at(-1)![0], rows: values.length };
        return { definition, body, values, receipt };
      } catch (error) {
        const receipt: CollectionSource = { series: definition.series, axis: definition.axis, url, status: 'error', checkedAt: clock().toISOString(), error: error instanceof Error ? error.message.slice(0, 400) : 'Source request failed' };
        return { definition, receipt, body: null, values: null };
      }
    }));
    receipts.push(...fetched.map(item => item.receipt));
    for (const item of fetched) if (item.body !== null) await client.query('INSERT INTO market_lab_source_payloads(sha256,url,acquired_at,body) VALUES ($1,$2,$3,$4) ON CONFLICT DO NOTHING', [item.receipt.sha256, item.receipt.url, item.receipt.checkedAt, item.body]);
    if (fetched.some(item => item.receipt.status !== 'ready')) throw new Error('One or more US sources failed; previous snapshot preserved');
    signal?.throwIfAborted();
    const current = await readSnapshot(pool);
    if (!current) throw new Error('Import a validated market snapshot first');
    const snapshot: MarketSnapshot = structuredClone(current.snapshot);
    let changed = false;
    for (const item of fetched) {
      const values = item.values!, definition = item.definition;
      const axis = snapshot.regions.us.axes[definition.axis];
      const dates = new Set(values.map(value => value[0]));
      if (axis.values.some(value => !dates.has(value[0]))) throw new Error(`${definition.series} would truncate retained history`);
      const source = snapshot.sources.find(source => source.id === axis.sourceId)!;
      const beforeSource = JSON.stringify({...source,retrievedAt:null});
      if (source.responseSha256 !== item.receipt.sha256 || JSON.stringify(axis.values) !== JSON.stringify(values)) changed = true;
      axis.values = values; axis.metric = definition.metric;
      Object.assign(source, { label: definition.label, linkLabel: definition.series==='GDPC1'?'FRED · 미국 GDP':definition.series==='TB3MS'?'FRED · 미국 3개월 국채금리':'FRED · Cboe VIX 종가', url: item.receipt.url, frequency: definition.frequency, status: 'ready', lastObservation: item.receipt.lastObservation, retrievedAt: item.receipt.checkedAt, releaseTimeKnown: false, responseSha256: item.receipt.sha256,
        evidence: { kind: 'official_public_csv', series: definition.series, transformation: definition.series === 'GDPC1' ? '100*(current SAAR level/previous-quarter SAAR level-1)' : 'provider values without rescaling', clock: 'response acquisition time; exact publication/vintage unverified' } });
      if(definition.series==='VIXCLS')Object.assign(source,{priceBasis:'Cboe VIX close via FRED; daily index points',sessionPolicy:'현재 뉴욕 날짜 제외; FRED 공표 완료 종가',timezone:'America/New_York',timezoneBasis:'source-series-market-calendar'});
      delete source.error; delete source.latestAttemptStatus;
      if(beforeSource!==JSON.stringify({...source,retrievedAt:null}))changed=true;
    }
    let revision = current.revision;
    if (changed) {
      snapshot.generatedAt = clock().toISOString();
      if (Date.parse(snapshot.generatedAt) <= Date.parse(current.snapshot.generatedAt)) throw new Error('Collection clock must advance the publication clock');
      validateSnapshot(snapshot);
      const accepted = await publishSnapshot(pool, snapshot, current.revision, async (transaction, revision) => {
        await transaction.query("UPDATE market_lab_collection_runs SET status='published',finished_at=$2,revision=$3,sources=$4 WHERE id=$1", [id, clock().toISOString(), revision, JSON.stringify(receipts)]);
      });
      if (!accepted.published) throw new Error('Publication overtaken; previous channel preserved');
      revision = accepted.revision;
    }
    if (!changed) await client.query("UPDATE market_lab_collection_runs SET status='unchanged',finished_at=$2,revision=$3,sources=$4 WHERE id=$1", [id, clock().toISOString(), revision, JSON.stringify(receipts)]);
    return { status: changed ? 'published' as const : 'unchanged' as const, revision, id };
  } catch (error) {
    if (!id) throw error;
    const reconciled = (await client.query('SELECT status,revision FROM market_lab_collection_runs WHERE id=$1', [id])).rows[0];
    if (reconciled?.status === 'published' || reconciled?.status === 'unchanged') return { status: reconciled.status as 'published' | 'unchanged', revision: reconciled.revision as string, id };
    await client.query("UPDATE market_lab_collection_runs SET status='failed',finished_at=$2,sources=$3,error=$4 WHERE id=$1", [id, clock().toISOString(), JSON.stringify(receipts), error instanceof Error ? error.message.slice(0, 500) : 'Collection failed']);
    return { status: 'failed' as const, id };
  } finally {
    try {
      if (locked) await client.query('SELECT pg_advisory_unlock(hashtext($1))', [LOCK]);
    } catch (error) {
      client.release(true);
      throw error;
    }
    client.release();
  }
}

export function startUsCollection(pool: pg.Pool, { intervalMs = US_COLLECTION_INTERVAL, fetchImpl = fetch, onError = (error: unknown) => console.error('US collection failed', error) } = {}) {
  if (!Number.isInteger(intervalMs) || intervalMs < 60000 || intervalMs > 86400000) throw new Error('Collection interval must be 1 minute to 1 day');
  let timer: ReturnType<typeof setTimeout> | undefined, stopped = false, pending: Promise<void> | undefined;
  const abort = new AbortController();
  const state: CollectionSchedule = { enabled: true, intervalMs, running: false, nextDueAt: null };
  async function tick() {
    state.running = true; state.nextDueAt = null;
    let delay = intervalMs;
    try {
      const run = await runUsCollection(pool, { intervalMs, fetchImpl, signal: abort.signal });
      const { latest } = await readUsCollection(pool);
      if (run.status === 'busy') delay = 60000;
      else if (latest?.finishedAt) delay = Math.max(1000, Date.parse(latest.finishedAt) + intervalMs - Date.now());
    } catch (error) { if (!stopped) onError(error); }
    finally {
      state.running = false;
      if (!stopped) { state.nextDueAt = new Date(Date.now() + delay).toISOString(); timer = setTimeout(() => { pending = tick(); }, delay); timer.unref(); }
    }
  }
  pending = tick();
  return { status: () => ({ ...state }), stop: async () => { stopped = true; state.enabled = false; state.nextDueAt = null; clearTimeout(timer); abort.abort(); await pending; } };
}
