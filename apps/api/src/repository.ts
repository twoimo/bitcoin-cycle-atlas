import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import pg from 'pg';
import { validateSnapshot } from '@atlas/domain/market-lab';
import type { MarketSnapshot } from '@atlas/contracts/market-lab';

const LOCK = 'atlas:market-lab';
export function createPool(connectionString: string) {
  const pool = new pg.Pool({ connectionString, max: 5, connectionTimeoutMillis: 3000, query_timeout: 10000, statement_timeout: 10000, idle_in_transaction_session_timeout: 15000, application_name: 'atlas-market-lab' });
  // An idle connection can disappear between requests. pg removes that client;
  // the next request reconnects instead of an unhandled event killing the API.
  pool.on('error', error => { console.error('atlas: idle database connection lost', (error as NodeJS.ErrnoException).code ?? 'unknown'); });
  return pool;
}
export function snapshotIdentity(input: unknown) {
  const snapshot = validateSnapshot(input) as MarketSnapshot;
  const body = JSON.stringify(snapshot);
  return { snapshot, body, revision: createHash('sha256').update(body).digest('hex') };
}

export async function migrate(pool: pg.Pool) {
  const sql = await readFile(new URL('../../../db/migrations/001_market_lab.sql', import.meta.url), 'utf8');
  const digest = createHash('sha256').update(sql).digest('hex');
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [LOCK]);
    await client.query('CREATE TABLE IF NOT EXISTS atlas_schema_migrations (name text PRIMARY KEY, sha256 text NOT NULL, applied_at timestamptz NOT NULL DEFAULT clock_timestamp())');
    const previous = await client.query('SELECT sha256 FROM atlas_schema_migrations WHERE name=$1', ['001_market_lab']);
    if (previous.rowCount && previous.rows[0].sha256 !== digest) throw new Error('Applied migration checksum changed');
    if (!previous.rowCount) {
      await client.query(sql);
      await client.query('INSERT INTO atlas_schema_migrations (name,sha256) VALUES ($1,$2)', ['001_market_lab', digest]);
    }
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally { client.release(); }
}

export async function publishSnapshot(pool: pg.Pool, input: unknown, expectedRevision?: string, onAccepted?: (client: pg.PoolClient, revision: string) => Promise<void>) {
  const { snapshot, body, revision } = snapshotIdentity(input);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [LOCK]);
    const current = await client.query('SELECT r.revision,r.generated_at FROM market_lab_publications p JOIN market_lab_revisions r USING (revision) WHERE p.channel=$1', ['market-lab']);
    if (expectedRevision !== undefined && current.rows[0]?.revision !== expectedRevision) throw new Error('SNAPSHOT_CHANGED: publication changed during collection');
    const generated = Date.parse(snapshot.generatedAt);
    if (current.rowCount && +current.rows[0].generated_at === generated && current.rows[0].revision !== revision) {
      throw new Error('Different content shares the current generation clock; assign a new explicit snapshot generation time');
    }
    const inserted = await client.query('INSERT INTO market_lab_revisions (revision,canonical_body,model_version,generated_at) VALUES ($1,$2,$3,$4) ON CONFLICT DO NOTHING RETURNING revision', [revision, body, snapshot.modelVersion, snapshot.generatedAt]);
    if (inserted.rowCount) {
      for (const source of snapshot.sources) {
        await client.query('INSERT INTO market_lab_sources (revision,source_id,retrieved_at,released_at,metadata) VALUES ($1,$2,$3,NULL,$4)', [revision, source.id, source.retrievedAt, JSON.stringify(source)]);
      }
      const observations: { series: string; source: string; date: string; value: number }[] = [];
      for (const [region, definition] of Object.entries(snapshot.regions)) {
        for (const [axis, series] of Object.entries(definition.axes)) {
          for (const [date, value] of series.values) observations.push({ series: `${region}:${axis}`, source: series.sourceId, date, value });
        }
      }
      for (const market of snapshot.markets) {
        for (const [date, value] of market.prices) observations.push({ series: `market:${market.id}`, source: market.sourceId, date, value });
      }
      await client.query(`INSERT INTO market_lab_observations (revision,series_key,source_id,observation_date,value)
        SELECT $1, x.series,x.source,x.date::date,x.value FROM jsonb_to_recordset($2::jsonb) AS x(series text,source text,date text,value double precision)`, [revision, JSON.stringify(observations)]);
    }
    const published = !current.rowCount || generated >= +current.rows[0].generated_at;
    if (published) {
      await client.query('UPDATE market_lab_revisions SET first_published_at=clock_timestamp() WHERE revision=$1 AND first_published_at IS NULL', [revision]);
      await client.query(`INSERT INTO market_lab_publications (channel,revision) VALUES ('market-lab',$1)
        ON CONFLICT (channel) DO UPDATE SET revision=EXCLUDED.revision,published_at=clock_timestamp()
        WHERE market_lab_publications.revision<>EXCLUDED.revision`, [revision]);
    }
    if (onAccepted) {
      if (!published) throw new Error('Publication overtaken; acceptance callback not run');
      await onAccepted(client, revision);
    }
    await client.query('COMMIT');
    return { revision, inserted: Boolean(inserted.rowCount), published };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally { client.release(); }
}

export async function readSnapshot(pool: pg.Pool, revision?: string) {
  const result = revision
    ? await pool.query('SELECT r.*,p.published_at FROM market_lab_revisions r LEFT JOIN market_lab_publications p USING (revision) WHERE r.revision=$1', [revision])
    : await pool.query("SELECT r.*,p.published_at FROM market_lab_publications p JOIN market_lab_revisions r USING (revision) WHERE p.channel='market-lab'");
  if (!result.rowCount) return null;
  const row = result.rows[0];
  const checked = snapshotIdentity(JSON.parse(row.canonical_body));
  if (checked.revision !== row.revision) throw new Error('Stored snapshot digest mismatch');
  return { ...checked, importedAt: row.imported_at.toISOString(), publishedAt: row.first_published_at?.toISOString() ?? null };
}
