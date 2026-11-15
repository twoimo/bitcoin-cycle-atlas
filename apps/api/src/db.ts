import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import pg from 'pg';

export const sha256 = (text: string) => createHash('sha256').update(text).digest('hex');

export const revisionIdentity = <T>(validate: (input: unknown) => T) => (input: unknown) => {
  const snapshot = validate(input), body = JSON.stringify(snapshot);
  return { snapshot, body, revision: sha256(body) };
};

// One key per domain. A migration takes the same key as its domain's writers,
// so schema changes and publications serialize.
export const locks = {
  marketLab: 'atlas:market-lab',
  housing: 'atlas:housing',
  themes: 'atlas:themes',
  usCollection: 'atlas:us-official-collection',
} as const;

export function createPool(connectionString: string) {
  const pool = new pg.Pool({ connectionString, max: 5, connectionTimeoutMillis: 3000, query_timeout: 10000, statement_timeout: 10000, idle_in_transaction_session_timeout: 15000, application_name: 'atlas-market-lab' });
  // An idle connection can disappear between requests. pg removes that client;
  // the next request reconnects instead of an unhandled event killing the API.
  pool.on('error', error => { console.error('atlas: idle database connection lost', (error as NodeJS.ErrnoException).code ?? 'unknown'); });
  return pool;
}

export async function withTransaction<T>(pool: pg.Pool, lock: string, work: (client: pg.PoolClient) => Promise<T>, signal?: AbortSignal): Promise<T> {
  const client = await pool.connect();
  let broken: Error | undefined;
  try {
    signal?.throwIfAborted();
    await client.query('BEGIN');
    await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [lock]);
    const result = await work(client);
    signal?.throwIfAborted();
    await client.query('COMMIT');
    return result;
  } catch (error) {
    // A client whose ROLLBACK failed may still hold the transaction and its lock.
    await client.query('ROLLBACK').catch((rollback: Error) => { broken = rollback; });
    throw error;
  } finally { client.release(broken); }
}

const migrations = {
  '001_market_lab': { lock: locks.marketLab, mismatch: 'Applied migration checksum changed' },
  '002_housing': { lock: locks.housing, mismatch: 'Applied housing migration checksum changed' },
  '003_themes': { lock: locks.themes, mismatch: 'Applied theme migration checksum changed' },
  '004_us_collection': { lock: locks.usCollection, mismatch: 'Applied collection migration checksum changed' },
} as const;
export type Migration = keyof typeof migrations;
const allMigrations = Object.keys(migrations) as Migration[];

export async function migrate(pool: pg.Pool, names: readonly Migration[] = allMigrations) {
  for (const name of names) {
    const { lock, mismatch } = migrations[name];
    const sql = await readFile(new URL(`../../../db/migrations/${name}.sql`, import.meta.url), 'utf8'), checksum = sha256(sql);
    await withTransaction(pool, lock, async client => {
      await client.query('CREATE TABLE IF NOT EXISTS atlas_schema_migrations (name text PRIMARY KEY, sha256 text NOT NULL, applied_at timestamptz NOT NULL DEFAULT clock_timestamp())');
      const applied = await client.query<{ sha256: string }>('SELECT sha256 FROM atlas_schema_migrations WHERE name=$1', [name]);
      if (applied.rowCount && applied.rows[0].sha256 !== checksum) throw new Error(mismatch);
      if (!applied.rowCount) {
        await client.query(sql);
        await client.query('INSERT INTO atlas_schema_migrations (name,sha256) VALUES ($1,$2)', [name, checksum]);
      }
    });
  }
}
