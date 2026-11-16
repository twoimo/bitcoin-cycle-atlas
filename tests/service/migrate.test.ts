import test from 'node:test';
import assert from 'node:assert/strict';
import pg from 'pg';
import { locks, migrate, type Migration } from '../../apps/api/src/db.js';

test('migrators for different domains that start together on a fresh schema all apply', async () => {
  if (!process.env.TEST_DATABASE_URL) throw new Error('TEST_DATABASE_URL required');
  const admin = new pg.Pool({ connectionString: process.env.TEST_DATABASE_URL }), schema = `migrate_race_${process.pid}_${Date.now()}`;
  await admin.query(`CREATE SCHEMA ${schema}`);
  const url = new URL(process.env.TEST_DATABASE_URL);
  url.searchParams.set('options', `-c search_path=${schema}`); url.searchParams.set('application_name', schema);
  const pool = new pg.Pool({ connectionString: url.href });
  const gate = await admin.connect();
  try {
    await gate.query('BEGIN');
    for (const lock of [locks.marketLab, locks.housing, locks.themes]) await gate.query('SELECT pg_advisory_xact_lock(hashtext($1))', [lock]);
    const gatePid = (await gate.query<{ pid: number }>('SELECT pg_backend_pid() AS pid')).rows[0].pid;
    const names: Migration[] = ['001_market_lab', '002_housing', '003_themes'];
    const runs = names.map(name => migrate(pool, [name]).then(() => 'applied', (error: Error) => error.message));
    for (let waited = 0; ; waited += 20) {
      const blocked = await admin.query<{ n: number }>('SELECT count(*)::int AS n FROM pg_stat_activity WHERE application_name=$1 AND $2=ANY(pg_blocking_pids(pid))', [schema, gatePid]);
      if (blocked.rows[0].n === names.length) break;
      if (waited > 10000) throw new Error(`only ${blocked.rows[0].n} migrators reached their domain lock`);
      await new Promise(resolve => setTimeout(resolve, 20));
    }
    await gate.query('ROLLBACK');
    assert.deepEqual(await Promise.all(runs), ['applied', 'applied', 'applied']);
    const applied = await admin.query(`SELECT name FROM ${schema}.atlas_schema_migrations ORDER BY name`);
    assert.deepEqual(applied.rows.map(row => row.name), names);
  } finally {
    gate.release(); await pool.end();
    await admin.query(`DROP SCHEMA ${schema} CASCADE`); await admin.end();
  }
});
