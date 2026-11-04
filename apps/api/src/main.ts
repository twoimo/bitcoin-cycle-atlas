import { createPool,migrate } from './repository.js';
import { buildServer } from './server.js';
import { migrateUsCollection,startUsCollection } from './us-collector.js';

if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required; see docs/architecture-migration/README.md');
const pool = createPool(process.env.DATABASE_URL);
await migrate(pool);
await migrateUsCollection(pool);
const collector = process.env.ATLAS_US_COLLECTION_ENABLED === '0' ? null : startUsCollection(pool);
const app = await buildServer({ pool, serveWeb: true, logger: true, ...(collector ? {collectionSchedule:collector.status} : {}) });
for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, async () => { await app.close(); await collector?.stop(); await pool.end(); });
}
try { await app.listen({ host: '127.0.0.1', port: Number(process.env.PORT || 4319) }); }
catch (error) { await collector?.stop(); await pool.end(); throw error; }
