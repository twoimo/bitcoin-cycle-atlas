import type pg from 'pg';
import { validateHousing } from '@atlas/domain/housing';
import { locks, revisionIdentity, withTransaction } from './db.js';

type HousingRow = { revision: string; canonical_body: string; generated_at: Date; imported_at: Date };
const published = "SELECT r.* FROM housing_publications p JOIN housing_revisions r USING(revision) WHERE channel='housing'";

export const housingIdentity = revisionIdentity(validateHousing);

export async function publishHousing(pool: pg.Pool, input: unknown) {
  const { snapshot, body, revision } = housingIdentity(input);
  return withTransaction(pool, locks.housing, async client => {
    const old = await client.query<HousingRow>(published);
    if (old.rowCount && +old.rows[0].generated_at === Date.parse(snapshot.generatedAt) && old.rows[0].revision !== revision) throw new Error('Housing generation clock collision');
    await client.query('INSERT INTO housing_revisions(revision,canonical_body,generated_at) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING', [revision, body, snapshot.generatedAt]);
    const isPublished = !old.rowCount || +old.rows[0].generated_at <= Date.parse(snapshot.generatedAt);
    if (isPublished) await client.query("INSERT INTO housing_publications(channel,revision) VALUES ('housing',$1) ON CONFLICT(channel) DO UPDATE SET revision=EXCLUDED.revision,published_at=clock_timestamp() WHERE housing_publications.revision<>EXCLUDED.revision", [revision]);
    return { revision, published: isPublished };
  });
}

export async function readHousing(pool: pg.Pool, revision?: string) {
  const r = revision ? await pool.query<HousingRow>('SELECT * FROM housing_revisions WHERE revision=$1', [revision]) : await pool.query<HousingRow>(published);
  if (!r.rowCount) return null;
  const checked = housingIdentity(JSON.parse(r.rows[0].canonical_body));
  if (checked.revision !== r.rows[0].revision) throw new Error('Housing digest mismatch');
  return { ...checked, importedAt: r.rows[0].imported_at.toISOString() };
}
