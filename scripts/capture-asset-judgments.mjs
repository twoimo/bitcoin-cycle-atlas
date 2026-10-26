import {readFile,writeFile,mkdir,rename,rm,readdir,lstat} from 'node:fs/promises';
import {resolve,dirname,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash,randomUUID} from 'node:crypto';
import {buildAssetComparison,ASSET_COMPARISON_VERSION} from '../dist/asset-comparison.js';
import {validateAssetComparisonBundle} from './refresh-asset-comparison.mjs';
import {validateSavedJudgmentRecord,validateSavedJudgmentIndex,SAVED_JUDGMENT_FILE} from '../dist/asset-judgment-records.js';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const enginePath=join(root,'dist/asset-comparison.js');
const importedEngineBytes=await readFile(enginePath);
const hash=value=>createHash('sha256').update(value).digest('hex');
function entryFor(record,file,raw){return {file,sha256:hash(raw),id:record.id,capturedAt:record.capturedAt,asOf:record.asOf,sourceVersion:record.source.hash,rulesVersion:record.rules.sha256};}
async function regular(path){const s=await lstat(path);if(!s.isFile()||s.isSymbolicLink())throw new TypeError('Snapshot paths must be regular, non-symlink files');}
/** Test clocks/directories are injectable; the CLI has no historical-date/backfill option. */
export async function captureAssetJudgments({bundle,bundlePath=join(root,'dist/data/asset-comparison.json'),directory=join(root,'dist/data/judgment-snapshots'),clock=Date.now,refreshOutcome='success',afterRecordWrite}={}){
  if(refreshOutcome!=='success')return {status:'skipped',reason:'comparison refresh did not succeed'};
  const capturedAt=new Date(clock()).toISOString(),asOf=capturedAt.slice(0,10);
  const source=bundle===undefined?JSON.parse(await readFile(bundlePath,'utf8')):structuredClone(bundle);
  validateAssetComparisonBundle(source);
  if(Date.parse(source.retrievedAt)>Date.parse(capturedAt))throw new RangeError('Capture cannot predate the source retrieval');
  const rulesBytes=await readFile(enginePath);
  if(!rulesBytes.equals(importedEngineBytes))throw new Error('Engine changed after this capture process loaded; start a fresh capture process');
  const model=buildAssetComparison(source,{asOfDate:asOf});
  const rows=model.rows.map(({meta,samples,...row})=>row);
  const payload={version:1,kind:'saved-snapshot',capturedAt,asOf,source:{hash:hash(JSON.stringify(source)),retrievedAt:source.retrievedAt},rules:{sha256:hash(rulesBytes),version:ASSET_COMPARISON_VERSION},rows};
  const id=capturedAt.replace(/[:.]/g,'')+'-'+hash(JSON.stringify(payload)).slice(0,12),file=id+'.json',record={...payload,id};
  validateSavedJudgmentRecord(record);
  const raw=JSON.stringify(record)+'\n',lock=join(directory,'.capture-lock'),token=randomUUID();
  await mkdir(directory,{recursive:true});const ds=await lstat(directory);if(!ds.isDirectory()||ds.isSymbolicLink())throw new TypeError('Snapshot directory must not be a symlink');
  try{await mkdir(lock);}catch(error){if(error.code==='EEXIST')throw new Error('Another snapshot writer owns the capture lock');throw error;}
  let created=false;
  try{
    await writeFile(join(lock,'owner'),token,{flag:'wx'});
    const indexPath=join(directory,'index.json');let previous={version:1,records:[]};
    try{await regular(indexPath);previous=validateSavedJudgmentIndex(JSON.parse(await readFile(indexPath,'utf8')));}catch(error){if(error.code!=='ENOENT')throw error;}
    const expected=new Map(previous.records.map(entry=>[entry.file,entry]));
    try{await writeFile(join(directory,file),raw,{flag:'wx'});created=true;}catch(error){if(error.code!=='EEXIST')throw error;await regular(join(directory,file));if(await readFile(join(directory,file),'utf8')!==raw)throw new Error('Immutable snapshot collision or tampering');}
    await afterRecordWrite?.({file,record,created});
    // Scan immutable records, not only the previous index, to recover valid orphan
    // records left by a local failure after exclusive creation but before rename.
    const entries=[];
    for(const name of await readdir(directory)){
      if(name==='index.json'||name==='.capture-lock'||name.startsWith('.index-tmp-'))continue;
      if(!SAVED_JUDGMENT_FILE.test(name))throw new TypeError('Unexpected file in snapshot directory');
      const path=join(directory,name);await regular(path);const text=await readFile(path,'utf8'),saved=JSON.parse(text);validateSavedJudgmentRecord(saved);if(saved.id+'.json'!==name)throw new TypeError('Snapshot identity disagrees with filename');const prior=expected.get(name);if(prior){validateSavedJudgmentRecord(saved,{entry:prior});if(hash(text)!==prior.sha256)throw new Error('Immutable indexed snapshot was tampered with');}if(text!==JSON.stringify(saved)+'\n')throw new Error('Immutable snapshot bytes are not canonical');const {id:identity,...payload}=saved;if(!identity.endsWith('-'+hash(JSON.stringify(payload)).slice(0,12)))throw new Error('Orphan snapshot payload does not match its immutable identity');if(Date.parse(saved.capturedAt)>Date.parse(capturedAt))throw new Error('Snapshot directory contains a future capture');entries.push(entryFor(saved,name,text));
    }
    entries.sort((a,b)=>b.capturedAt.localeCompare(a.capturedAt)||b.id.localeCompare(a.id));
    if(previous.records.some(entry=>!entries.some(next=>next.file===entry.file)))throw new Error('An indexed immutable snapshot is missing');
    const index=validateSavedJudgmentIndex({version:1,records:entries});
    const temporary=join(directory,'.index-tmp-'+token);
    try{await writeFile(temporary,JSON.stringify(index)+'\n',{flag:'wx'});await rename(temporary,indexPath);}finally{await rm(temporary,{force:true});}
    return {status:created?'created':'existing',file,record,index,entry:entries.find(e=>e.file===file)};
  }finally{
    // Never remove a replaced/other writer's lock, and never expire by age.
    let owned=false;try{owned=await readFile(join(lock,'owner'),'utf8')===token;}catch{}
    if(owned)await rm(lock,{recursive:true});
  }
}
if(resolve(process.argv[1]||'')===fileURLToPath(import.meta.url)){
  if(process.argv.length!==2)throw new TypeError('This capture command accepts no date/backfill arguments');
  const result=await captureAssetJudgments();
  console.log(JSON.stringify({status:result.status,file:result.file,capturedAt:result.record.capturedAt,asOf:result.record.asOf,kind:result.record.kind,assets:result.record.rows.length,sourceVersion:result.record.source.hash,rulesVersion:result.record.rules.sha256}));
}
