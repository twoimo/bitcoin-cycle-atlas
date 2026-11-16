import type pg from 'pg';
import { validateSnapshot } from '@atlas/domain/market-lab';
import { locks, revisionIdentity, withTransaction } from './db.js';

type RevisionRow = { revision: string; canonical_body: string; generated_at: Date; imported_at: Date; first_published_at: Date | null };

export const snapshotIdentity = revisionIdentity(validateSnapshot);

export async function publishSnapshot(pool: pg.Pool, input: unknown, expectedRevision?: string, onAccepted?: (client: pg.PoolClient, revision: string) => Promise<void>, signal?: AbortSignal) {
  signal?.throwIfAborted();
  const { snapshot, body, revision } = snapshotIdentity(input);
  return withTransaction(pool, locks.marketLab, async client => {
    const current = await client.query<Pick<RevisionRow, 'revision' | 'generated_at'>>('SELECT r.revision,r.generated_at FROM market_lab_publications p JOIN market_lab_revisions r USING (revision) WHERE p.channel=$1', ['market-lab']);
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
    return { revision, inserted: Boolean(inserted.rowCount), published };
  }, signal);
}

export async function readSnapshot(pool: pg.Pool, revision?: string) {
  const result = revision
    ? await pool.query<RevisionRow>('SELECT r.*,p.published_at FROM market_lab_revisions r LEFT JOIN market_lab_publications p USING (revision) WHERE r.revision=$1', [revision])
    : await pool.query<RevisionRow>("SELECT r.*,p.published_at FROM market_lab_publications p JOIN market_lab_revisions r USING (revision) WHERE p.channel='market-lab'");
  if (!result.rowCount) return null;
  const row = result.rows[0];
  const checked = snapshotIdentity(JSON.parse(row.canonical_body));
  if (checked.revision !== row.revision) throw new Error('Stored snapshot digest mismatch');
  return { ...checked, importedAt: row.imported_at.toISOString(), publishedAt: row.first_published_at?.toISOString() ?? null };
}
