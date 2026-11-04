import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import type pg from 'pg';
import { validateHousing } from '@atlas/domain/housing';
export function housingIdentity(input:unknown){const snapshot=validateHousing(input),body=JSON.stringify(snapshot);return {snapshot,body,revision:createHash('sha256').update(body).digest('hex')};}
export async function migrateHousing(pool:pg.Pool){
  const sql=await readFile(new URL('../../../db/migrations/002_housing.sql',import.meta.url),'utf8'),hash=createHash('sha256').update(sql).digest('hex'),client=await pool.connect();
  try{await client.query('BEGIN');await client.query('SELECT pg_advisory_xact_lock(hashtext($1))',['atlas:housing']);
    await client.query('CREATE TABLE IF NOT EXISTS atlas_schema_migrations (name text PRIMARY KEY, sha256 text NOT NULL, applied_at timestamptz NOT NULL DEFAULT clock_timestamp())');
    const old=await client.query('SELECT sha256 FROM atlas_schema_migrations WHERE name=$1',['002_housing']);
    if(old.rowCount&&old.rows[0].sha256!==hash)throw new Error('Applied housing migration checksum changed');
    if(!old.rowCount){await client.query(sql);await client.query('INSERT INTO atlas_schema_migrations (name,sha256) VALUES ($1,$2)',['002_housing',hash]);}
    await client.query('COMMIT');
  }catch(error){await client.query('ROLLBACK');throw error;}finally{client.release();}
}
export async function publishHousing(pool:pg.Pool,input:unknown){
  const {snapshot,body,revision}=housingIdentity(input),client=await pool.connect();
  try{await client.query('BEGIN');await client.query('SELECT pg_advisory_xact_lock(hashtext($1))',['atlas:housing']);
    const old=await client.query("SELECT r.* FROM housing_publications p JOIN housing_revisions r USING(revision) WHERE channel='housing'");
    if(old.rowCount&&+old.rows[0].generated_at===Date.parse(snapshot.generatedAt)&&old.rows[0].revision!==revision)throw new Error('Housing generation clock collision');
    await client.query('INSERT INTO housing_revisions(revision,canonical_body,generated_at) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING',[revision,body,snapshot.generatedAt]);
    const published=!old.rowCount||+old.rows[0].generated_at<=Date.parse(snapshot.generatedAt);
    if(published)await client.query("INSERT INTO housing_publications(channel,revision) VALUES ('housing',$1) ON CONFLICT(channel) DO UPDATE SET revision=EXCLUDED.revision,published_at=clock_timestamp() WHERE housing_publications.revision<>EXCLUDED.revision",[revision]);
    await client.query('COMMIT');return {revision,published};
  }catch(error){await client.query('ROLLBACK');throw error;}finally{client.release();}
}
export async function readHousing(pool:pg.Pool,revision?:string){
  const r=revision?await pool.query('SELECT * FROM housing_revisions WHERE revision=$1',[revision]):await pool.query("SELECT r.* FROM housing_publications p JOIN housing_revisions r USING(revision) WHERE channel='housing'");
  if(!r.rowCount)return null;const checked=housingIdentity(JSON.parse(r.rows[0].canonical_body));if(checked.revision!==r.rows[0].revision)throw new Error('Housing digest mismatch');return {...checked,importedAt:r.rows[0].imported_at.toISOString()};
}
