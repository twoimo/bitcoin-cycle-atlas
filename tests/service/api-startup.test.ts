import test from 'node:test';
import assert from 'node:assert/strict';
import pg from 'pg';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../', import.meta.url));

function startApi(databaseUrl: string) {
  const child = spawn(process.execPath, ['--import', 'tsx', 'apps/api/src/main.ts'], {
    cwd: root, stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, DATABASE_URL: databaseUrl, PORT: '0', ATLAS_US_COLLECTION_ENABLED: '0' },
  });
  let output = '';
  const listening = new Promise<string>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`API did not listen within 30s:\n${output}`)), 30000);
    const read = (chunk: Buffer) => {
      output += chunk;
      const address = output.match(/Server listening at (http:\/\/127\.0\.0\.1:\d+)/)?.[1];
      if (address) { clearTimeout(timer); resolve(address); }
    };
    child.stdout.on('data', read); child.stderr.on('data', read);
    child.once('exit', code => { clearTimeout(timer); reject(new Error(`API exited with ${code} before listening:\n${output}`)); });
  });
  return { child, listening };
}

test('API startup on a fresh database applies every migration its routes read', async () => {
  if (!process.env.TEST_DATABASE_URL) throw new Error('TEST_DATABASE_URL required');
  const admin = new pg.Pool({ connectionString: process.env.TEST_DATABASE_URL }), schema = `api_startup_${process.pid}_${Date.now()}`;
  await admin.query(`CREATE SCHEMA ${schema}`);
  const url = new URL(process.env.TEST_DATABASE_URL); url.searchParams.set('options', `-c search_path=${schema}`);
  const api = startApi(url.href);
  try {
    const base = await api.listening;
    const read = async (path: string) => { const response = await fetch(base + path); return { status: response.status, body: await response.json() }; };
    assert.deepEqual(await read('/api/v1/housing'), { status: 404, body: { code: 'HOUSING_NOT_FOUND' } });
    assert.deepEqual(await read('/api/v1/themes'), { status: 404, body: { code: 'THEME_NOT_FOUND' } });
    assert.deepEqual(await read('/api/v1/market-lab'), { status: 404, body: { code: 'SNAPSHOT_NOT_FOUND', message: '검증된 연구 자료가 없습니다.' } });
    assert.equal((await read('/api/v1/market-lab/collection')).status, 200);
    const applied = await admin.query(`SELECT name FROM ${schema}.atlas_schema_migrations ORDER BY name`);
    assert.deepEqual(applied.rows.map(row => row.name), ['001_market_lab', '002_housing', '003_themes', '004_us_collection']);
    const exited = once(api.child, 'exit');
    api.child.kill('SIGTERM');
    assert.deepEqual(await exited, [0, null], 'SIGTERM closes the server and pool, then exits cleanly');
  } finally {
    if (api.child.exitCode === null && api.child.signalCode === null) api.child.kill('SIGKILL');
    await admin.query(`DROP SCHEMA ${schema} CASCADE`); await admin.end();
  }
});

test('API startup that fails a migration checksum exits 1 with the original error', async () => {
  if (!process.env.TEST_DATABASE_URL) throw new Error('TEST_DATABASE_URL required');
  const admin = new pg.Pool({ connectionString: process.env.TEST_DATABASE_URL }), schema = `api_start_fail_${process.pid}_${Date.now()}`;
  await admin.query(`CREATE SCHEMA ${schema}`);
  await admin.query(`CREATE TABLE ${schema}.atlas_schema_migrations (name text PRIMARY KEY, sha256 text NOT NULL, applied_at timestamptz NOT NULL DEFAULT clock_timestamp())`);
  await admin.query(`INSERT INTO ${schema}.atlas_schema_migrations (name,sha256) VALUES ('002_housing',$1)`, ['0'.repeat(64)]);
  const url = new URL(process.env.TEST_DATABASE_URL); url.searchParams.set('options', `-c search_path=${schema}`);
  const api = startApi(url.href);
  try {
    await assert.rejects(api.listening, /exited with 1 before listening[\s\S]*Applied housing migration checksum changed/);
    const applied = await admin.query(`SELECT name FROM ${schema}.atlas_schema_migrations ORDER BY name`);
    assert.deepEqual(applied.rows.map(row => row.name), ['001_market_lab', '002_housing'], 'migrations after the failed one are not applied');
  } finally {
    if (api.child.exitCode === null && api.child.signalCode === null) api.child.kill('SIGKILL');
    await admin.query(`DROP SCHEMA ${schema} CASCADE`); await admin.end();
  }
});
