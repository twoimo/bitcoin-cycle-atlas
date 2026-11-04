import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createPool, migrate, publishSnapshot, readSnapshot } from '@atlas/api/repository';
import { refreshMarketLab } from '../../../scripts/refresh-market-lab.mjs';

const [command, ...args] = process.argv.slice(2);
if (!['migrate', 'import', 'refresh'].includes(command) || (command === 'import' && args.length !== 1) || (command !== 'import' && args.length)) {
  throw new Error('Usage: market-lab.ts migrate | import <snapshot.json> | refresh');
}
if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required');
const pool = createPool(process.env.DATABASE_URL);
try {
  if (command === 'migrate') { await migrate(pool); console.log(JSON.stringify({ status: 'migrated' })); }
  else if (command === 'import') console.log(JSON.stringify(await publishSnapshot(pool, JSON.parse(await readFile(resolve(args[0]), 'utf8')))));
  else {
    // Collect/validate in memory. PostgreSQL owns publication; the legacy file
    // publisher is never invoked by this job. Failed collection preserves DB state.
    const previous = await readSnapshot(pool);
    if (!previous) throw new Error('Import an initial validated snapshot before refreshing');
    const snapshot = await refreshMarketLab(undefined, { persist: false, previousSnapshot: previous.snapshot });
    console.log(JSON.stringify(await publishSnapshot(pool, snapshot)));
  }
} finally { await pool.end(); }
