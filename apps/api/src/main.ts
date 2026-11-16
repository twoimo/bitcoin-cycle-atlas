import { createPool, migrate } from './db.js';
import { buildServer } from './server.js';
import { startUsCollection } from './us-collector.js';

if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required; see docs/architecture-migration/README.md');
const pool = createPool(process.env.DATABASE_URL);
let collector: ReturnType<typeof startUsCollection> | null = null;
let app: Awaited<ReturnType<typeof buildServer>> | undefined;
async function shutdown() {
  try { await app?.close(); }
  finally { try { await collector?.stop(); } finally { await pool.end(); } }
}
try {
  await migrate(pool);
  if (process.env.ATLAS_US_COLLECTION_ENABLED !== '0') collector = startUsCollection(pool);
  app = await buildServer({ pool, serveWeb: true, logger: true, ...(collector ? { collectionSchedule: collector.status } : {}) });
  await app.listen({ host: '127.0.0.1', port: Number(process.env.PORT || 4319) });
} catch (error) {
  await shutdown().catch(cleanup => console.error('atlas: shutdown after failed start also failed', cleanup));
  throw error;
}
for (const signal of ['SIGINT', 'SIGTERM'] as const) process.once(signal, shutdown);
