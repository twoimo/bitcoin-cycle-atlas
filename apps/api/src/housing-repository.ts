import { createHash } from 'node:crypto';
import type pg from 'pg';
import { validateHousing } from '@atlas/domain/housing';
import { locks } from './db.js';
export function housingIdentity(input:unknown){const snapshot=validateHousing(input),body=JSON.stringify(snapshot);return {snapshot,body,revision:createHash('sha256').update(body).digest('hex')};}
export async function publishHousing(pool:pg.Pool,input:unknown){
  const {snapshot,body,revision}=housingIdentity(input),client=await pool.connect();
  try{await client.query('BEGIN');await client.query('SELECT pg_advisory_xact_lock(hashtext($1))',[locks.housing]);
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
