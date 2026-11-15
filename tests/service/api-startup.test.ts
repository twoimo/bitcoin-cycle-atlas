import test from 'node:test';
import assert from 'node:assert/strict';
import pg from 'pg';
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { once } from 'node:events';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { locks } from '../../apps/api/src/db.js';
import { publishThemes } from '../../apps/api/src/theme-repository.js';

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
  return { child, listening, output: () => output };
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

test('a backend killed while a judgment save waits on the themes lock fails that save with 503 and the API keeps serving', async () => {
  if (!process.env.TEST_DATABASE_URL) throw new Error('TEST_DATABASE_URL required');
  const admin = new pg.Pool({ connectionString: process.env.TEST_DATABASE_URL }), schema = `api_killed_${process.pid}_${Date.now()}`;
  await admin.query(`CREATE SCHEMA ${schema}`);
  const url = new URL(process.env.TEST_DATABASE_URL);
  url.searchParams.set('options', `-c search_path=${schema}`); url.searchParams.set('application_name', schema);
  const api = startApi(url.href);
  const holder = await admin.connect();
  try {
    const base = await api.listening;
    const themes = JSON.parse(await readFile(new URL('../../dist/data/themes.json', import.meta.url), 'utf8'));
    const seed = new pg.Pool({ connectionString: process.env.TEST_DATABASE_URL, options: `-c search_path=${schema}` });
    const { revision } = await publishThemes(seed, themes).finally(() => seed.end());
    await holder.query('BEGIN');
    await holder.query('SELECT pg_advisory_xact_lock(hashtext($1))', [locks.themes]);
    const holderPid = (await holder.query<{ pid: number }>('SELECT pg_backend_pid() AS pid')).rows[0].pid;
    const draft = { title: '연결 종료', criteria: structuredClone(themes.judgments[2].criteria) };
    const save = fetch(base + '/api/v1/themes/judgments', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ requestId: randomUUID(), revision, draft }) });
    let waiting: number | undefined;
    for (let waited = 0; waiting === undefined; waited += 20) {
      if (waited > 10000) throw new Error(`the save never waited on the themes lock:\n${api.output()}`);
      await new Promise(resolve => setTimeout(resolve, 20));
      waiting = (await admin.query<{ pid: number }>('SELECT pid FROM pg_stat_activity WHERE application_name=$1 AND $2=ANY(pg_blocking_pids(pid))', [schema, holderPid])).rows[0]?.pid;
    }
    await admin.query('SELECT pg_terminate_backend($1)', [waiting]);
    const response = await save.catch((error: Error) => { throw new Error(`save request failed (${(error.cause as Error | undefined)?.message ?? error.message}):\n${api.output()}`); });
    assert.deepEqual({ status: response.status, body: await response.text() }, { status: 503, body: JSON.stringify({ code: 'SAVE_UNAVAILABLE', message: '저장 여부를 확인하세요.' }) });
    await holder.query('ROLLBACK');
    assert.deepEqual([api.child.exitCode, api.child.signalCode], [null, null], 'the API process is still running');
    assert.equal((await fetch(base + '/api/v1/themes')).status, 200, 'the next request gets a new connection');
    const exited = once(api.child, 'exit');
    api.child.kill('SIGTERM');
    assert.deepEqual(await exited, [0, null]);
  } finally {
    holder.release(true);
    if (api.child.exitCode === null && api.child.signalCode === null) api.child.kill('SIGKILL');
    await admin.query(`DROP SCHEMA ${schema} CASCADE`); await admin.end();
  }
});
