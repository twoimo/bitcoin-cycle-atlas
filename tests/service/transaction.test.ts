import test from 'node:test';
import assert from 'node:assert/strict';
import type pg from 'pg';
import { readFile } from 'node:fs/promises';
import { publishHousing } from '../../apps/api/src/housing-repository.js';

const snapshot = JSON.parse(await readFile(new URL('../../dist/data/housing.json', import.meta.url), 'utf8'));

function database(fail: { select?: Error; rollback?: Error }) {
  const statements: string[] = [], releases: unknown[] = [];
  const query = async (sql: string) => {
    statements.push(sql.split(' ')[0]);
    if (sql.startsWith('SELECT r.*') && fail.select) throw fail.select;
    if (sql === 'ROLLBACK' && fail.rollback) throw fail.rollback;
    return { rows: [], rowCount: 0 };
  };
  const pool = { connect: async () => ({ query, release: (error?: unknown) => { releases.push(error); } }) } as unknown as pg.Pool;
  return { pool, statements, releases };
}

test('a write transaction commits once and returns its client to the pool', async () => {
  const db = database({});
  assert.equal((await publishHousing(db.pool, snapshot)).published, true);
  assert.deepEqual(db.statements, ['BEGIN', 'SELECT', 'SELECT', 'INSERT', 'INSERT', 'COMMIT']);
  assert.deepEqual(db.releases, [undefined]);
});

test('a failed write rolls back and reuses the client', async () => {
  const db = database({ select: new Error('original failure') });
  await assert.rejects(publishHousing(db.pool, snapshot), /original failure/);
  assert.deepEqual(db.statements, ['BEGIN', 'SELECT', 'SELECT', 'ROLLBACK']);
  assert.deepEqual(db.releases, [undefined]);
});

test('a failed ROLLBACK keeps the first error and discards the client', async () => {
  const rollback = new Error('rollback failed'), db = database({ select: new Error('original failure'), rollback });
  await assert.rejects(publishHousing(db.pool, snapshot), /original failure/);
  assert.deepEqual(db.releases, [rollback], 'a client that may still hold the transaction is destroyed, not pooled');
});
