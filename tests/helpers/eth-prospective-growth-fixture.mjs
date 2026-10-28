// SYNTHETIC capacity fixtures only. These records preserve valid original
// schemas and clocks, but their synthetic source graphs are not executable
// committed market models. No forecast replay or historical accuracy is claimed.
import {mkdir,writeFile} from 'node:fs/promises';
import {resolve,dirname} from 'node:path';
import {createHash} from 'node:crypto';
import {canonicalForecastJson} from '../../dist/forecast-records.js';
import {ETH_PROSPECTIVE_ARCHIVE_POLICY as P,ETH_PROSPECTIVE_ARCHIVE_FORMAT as F} from '../../scripts/ethereum-prospective-archive-core.mjs';
import {prospectiveFixture} from './eth-prospective-fixture.mjs';

const json=canonicalForecastJson,encode=value=>Buffer.from(json(value)+'\n');
const sha=value=>createHash('sha256').update(value).digest('hex');
const hash=value=>sha(Buffer.from(json(value)));
const signed=value=>{const {id,...body}=value;return {id:hash(body),...body};};

export function syntheticProspectiveRecordWithSourceGraph(fixture,index){
  if(!Number.isSafeInteger(index)||index<0)throw new RangeError('Synthetic graph index required');
  if(index===0)return fixture.record;
  const files={...fixture.model.files,'dist/ethereum-adaptive-model.js':sha(Buffer.from('SYNTHETIC CAPACITY GRAPH '+index))};
  const model={...fixture.model,files,sourceHash:hash(files)};
  const runKey=hash({modelKey:fixture.record.modelKey,version:model.version,modelSourceHash:model.sourceHash,
    economicInputHash:fixture.record.economicInputHash,options:fixture.record.options,
    horizons:fixture.record.targets.map(target=>target.horizonDays),recordPolicy:fixture.record.recordPolicy});
  return signed({...fixture.record,model,runKey});
}

/** Write one object at a time rather than retaining a second full buffer map.
 * The empty historical checkpoint is legitimate: whole-archive readers must
 * enumerate every immutable record, including those not in a bounded checkpoint.
 * Caller owns and cleans up repositoryRoot. */
export async function writeSyntheticEthereumProspectiveGrowthArchive({repositoryRoot,archivePath='synthetic-archive',recordCount=2001}={}){
  if(!Number.isSafeInteger(recordCount)||recordCount<1||recordCount>2500)throw new RangeError('Bounded synthetic record count required');
  if(!/^[a-zA-Z0-9_-]+(?:\/[a-zA-Z0-9_-]+)*$/.test(archivePath))throw new TypeError('Safe synthetic archive path required');
  const fixture=await prospectiveFixture(),directory=resolve(repositoryRoot,archivePath),entries=[],recordIds=[];
  const counts=F.initialCounts(),objects=new Set();
  async function write(path,bytes){const full=resolve(directory,path);await mkdir(dirname(full),{recursive:true});await writeFile(full,bytes,{flag:'wx'});}
  async function logical(path,bytes){
    const entry=F.descriptor(path,bytes);F.checkDescriptor(entry);
    if(!objects.has(entry.objectPath))await write(entry.objectPath,bytes);
    F.addCounts(counts,entry,objects);entries.push(entry);
  }
  await logical('snapshots/'+fixture.snapshot.id+'.json',encode(fixture.snapshot));
  await logical('observations/'+fixture.snapshot.id+'.json',encode(fixture.snapshot));
  const emptyIndex=encode({schemaVersion:1,kind:'ethereum-prospective-index',entries:[]});
  await logical('indexes/'+sha(emptyIndex)+'.json',emptyIndex);
  for(let index=0;index<recordCount;index++){
    const record=syntheticProspectiveRecordWithSourceGraph(fixture,index);recordIds.push(record.id);
    await logical('records/'+record.id+'.json',encode(record));
  }
  entries.sort((a,b)=>a.path.localeCompare(b.path));const pages=[];
  for(let offset=0;offset<entries.length;offset+=P.maximumEntriesPerPage){
    const page=signed({schemaVersion:1,kind:'ethereum-prospective-archive-page',entries:entries.slice(offset,offset+P.maximumEntriesPerPage)});
    const descriptor=F.metadataDescriptor(page);await write(descriptor.path,encode(page));pages.push(descriptor);
  }
  const manifest=signed({schemaVersion:1,kind:'ethereum-prospective-archive-manifest',policyVersion:P.version,
    sequence:1,previousManifestId:null,createdAt:'2026-10-28T00:00:00.000Z',
    source:{sourceCommit:'a'.repeat(40),sourceTree:'b'.repeat(40),runId:'1234'},pages,counts});
  await write('manifests/'+manifest.id+'.json',encode(manifest));await write('manifest.json',encode(manifest));
  return {synthetic:true,actualModelReplayClaimed:false,repositoryRoot,archivePath,recordIds:recordIds.sort(),
    recordCount,snapshotId:fixture.snapshot.id,manifest,fixture};
}
