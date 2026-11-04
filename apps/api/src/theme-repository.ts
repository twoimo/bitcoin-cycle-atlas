import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import type pg from 'pg';
import { validateThemeSnapshot,validateThemeJudgment,normalizeThemeDraft,type ThemeDraft,type ThemeJudgment } from '@atlas/domain/themes';
const digest=(body:string)=>createHash('sha256').update(body).digest('hex');
export function themeIdentity(input:unknown){const snapshot=validateThemeSnapshot(input),body=JSON.stringify(snapshot);return {snapshot,body,revision:digest(body)};}
export async function migrateThemes(pool:pg.Pool){
  const sql=await readFile(new URL('../../../db/migrations/003_themes.sql',import.meta.url),'utf8'),hash=digest(sql),c=await pool.connect();
  try{await c.query('BEGIN');await c.query('SELECT pg_advisory_xact_lock(hashtext($1))',['atlas:themes']);await c.query('CREATE TABLE IF NOT EXISTS atlas_schema_migrations (name text PRIMARY KEY,sha256 text NOT NULL,applied_at timestamptz NOT NULL DEFAULT clock_timestamp())');const old=await c.query('SELECT sha256 FROM atlas_schema_migrations WHERE name=$1',['003_themes']);if(old.rowCount&&old.rows[0].sha256!==hash)throw new Error('Applied theme migration checksum changed');if(!old.rowCount){await c.query(sql);await c.query('INSERT INTO atlas_schema_migrations(name,sha256) VALUES ($1,$2)',['003_themes',hash]);}await c.query('COMMIT');}catch(e){await c.query('ROLLBACK');throw e;}finally{c.release();}
}
export async function publishThemes(pool:pg.Pool,input:unknown){
  const {snapshot,body,revision}=themeIdentity(input),c=await pool.connect();
  try{await c.query('BEGIN');await c.query('SELECT pg_advisory_xact_lock(hashtext($1))',['atlas:themes']);const old=await c.query("SELECT r.* FROM theme_publications p JOIN theme_revisions r USING(revision) WHERE channel='themes'");if(old.rowCount&&+old.rows[0].generated_at===Date.parse(snapshot.generatedAt)&&old.rows[0].revision!==revision)throw new Error('Theme generation clock collision');await c.query('INSERT INTO theme_revisions(revision,canonical_body,generated_at) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING',[revision,body,snapshot.generatedAt]);const published=!old.rowCount||+old.rows[0].generated_at<=Date.parse(snapshot.generatedAt);if(published)await c.query("INSERT INTO theme_publications(channel,revision) VALUES ('themes',$1) ON CONFLICT(channel) DO UPDATE SET revision=EXCLUDED.revision",[revision]);await c.query('COMMIT');return {revision,published};}catch(e){await c.query('ROLLBACK');throw e;}finally{c.release();}
}
function checkedRecord(row:{canonical_body:string;record_hash:string}){if(digest(row.canonical_body)!==row.record_hash)throw new Error('Judgment record digest mismatch');return JSON.parse(row.canonical_body) as ThemeJudgment;}
export async function readThemes(pool:pg.Pool,revision?:string){
  const r=revision?await pool.query('SELECT * FROM theme_revisions WHERE revision=$1',[revision]):await pool.query("SELECT r.* FROM theme_publications p JOIN theme_revisions r USING(revision) WHERE channel='themes'");if(!r.rowCount)return null;
  const checked=themeIdentity(JSON.parse(r.rows[0].canonical_body));if(checked.revision!==r.rows[0].revision)throw new Error('Theme snapshot digest mismatch');
  const saved=await pool.query('SELECT * FROM theme_judgments WHERE revision=$1 ORDER BY recorded_at,request_id',[checked.revision]),judgments=[...checked.snapshot.judgments,...saved.rows.map(checkedRecord)];for(const j of judgments)validateThemeJudgment(j,checked.snapshot);return {...checked,judgments};
}
export async function readThemeReceipt(pool:pg.Pool,id:string){const r=await pool.query('SELECT * FROM theme_judgments WHERE request_id=$1',[id]);return r.rowCount?{revision:r.rows[0].revision,judgment:checkedRecord(r.rows[0])}:null;}
export async function saveThemeJudgment(pool:pg.Pool,{requestId,revision,draft}:{requestId:string;revision:string;draft:ThemeDraft},clock=()=>new Date()){
  const c=await pool.connect();
  try{await c.query('BEGIN');await c.query('SELECT pg_advisory_xact_lock(hashtext($1))',['atlas:themes']);
    const r=await c.query('SELECT * FROM theme_revisions WHERE revision=$1',[revision]);if(!r.rowCount)throw new Error('THEME_NOT_FOUND');const checked=themeIdentity(JSON.parse(r.rows[0].canonical_body));if(checked.revision!==revision)throw new Error('Theme snapshot digest mismatch');
    const asOf=clock().toISOString();if(Date.parse(checked.snapshot.generatedAt)>Date.parse(asOf))throw new Error('Future snapshot');
    // Normalize before comparing so harmless JSON key order cannot duplicate a record.
    const normalized=normalizeThemeDraft(draft,checked.snapshot.evidence,asOf),inputHash=digest(JSON.stringify({revision,draft:normalized}));
    const old=await c.query('SELECT * FROM theme_judgments WHERE request_id=$1',[requestId]);
    if(old.rowCount){if(old.rows[0].input_hash!==inputHash)throw new Error('IDEMPOTENCY_CONFLICT');await c.query('COMMIT');return {created:false,revision,judgment:checkedRecord(old.rows[0])};}
    const judgment:ThemeJudgment={id:requestId,title:normalized.title,assetId:'hype',mode:'recorded',asOf,recordedAt:asOf,criteria:normalized.criteria};validateThemeJudgment(judgment,checked.snapshot);const body=JSON.stringify(judgment);
    await c.query('INSERT INTO theme_judgments(request_id,revision,input_hash,record_hash,canonical_body,recorded_at) VALUES ($1,$2,$3,$4,$5,$6)',[requestId,revision,inputHash,digest(body),body,asOf]);await c.query('COMMIT');return {created:true,revision,judgment};
  }catch(e){await c.query('ROLLBACK');throw e;}finally{c.release();}
}
