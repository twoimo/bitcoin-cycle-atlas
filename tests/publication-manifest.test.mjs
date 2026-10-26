import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, writeFile, mkdir, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { checkPublication, checkPublicationMetadata, publicationAsset, verifyServedPublication } from '../scripts/build-publication.mjs';
import { createPublication, validatePublication, preparePublication } from '../dist/publication-contract.js';

const hash=value=>createHash('sha256').update(value).digest('hex');
const sorted=value=>Array.isArray(value)?value.map(sorted):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(key=>[key,sorted(value[key])])):value;
const seal=value=>({...value,manifestSha256:hash(JSON.stringify(sorted(value)))});
function manifest(files) {
  const sourceCommit='a'.repeat(40),contentDigest=hash(JSON.stringify(sorted(files)));
  let state=createPublication({sourceCommit,digest:contentDigest});
  state=validatePublication(state,{checkedDigest:contentDigest,valid:true});
  state=preparePublication(state,{currentCommit:sourceCommit,currentDigest:contentDigest});
  return seal({schemaVersion:1,kind:'atlas-publication',sourceCommit,contentDigest,files,state});
}

test('publication checks the actual served-file bytes, not only its self-consistent manifest',async t=>{
  const directory=await mkdtemp(join(tmpdir(),'atlas-publication-'));t.after(()=>rm(directory,{recursive:true,force:true}));
  await writeFile(join(directory,'index.html'),'original');
  const record=manifest([{path:'index.html',bytes:8,sha256:hash('original')}]);
  assert.equal(await checkPublication(record,{directory}),1);
  await writeFile(join(directory,'unexpected.js'),'new code');
  await assert.rejects(checkPublication(record,{directory}),/Public directory changed/);
  await rm(join(directory,'unexpected.js'));
  await writeFile(join(directory,'.unlisted-public-file'),'new code');
  await assert.rejects(checkPublication(record,{directory}),/Public directory changed/);
  await rm(join(directory,'.unlisted-public-file'));
  await writeFile(join(directory,'index.html'),'replaced');
  await assert.rejects(checkPublication(record,{directory}),/Published file checksum mismatch/);
});

test('a recomputed metadata checksum cannot conceal an inconsistent preparation state',()=>{
  const {manifestSha256,...record}=manifest([{path:'index.html',bytes:1,sha256:hash('x')}]);
  assert.throws(()=>checkPublicationMetadata(seal({...record,state:{...record.state,phase:'confirmed'}})),/Publication state/);
  assert.throws(()=>checkPublicationMetadata(seal({...record,state:{...record.state,sourceCommit:'b'.repeat(40)}})),/Publication state/);
  assert.throws(()=>checkPublicationMetadata(seal({...record,state:{...record.state,validatedDigest:'b'.repeat(64)}})),/Publication state/);
});

test('artifact inventory rejects aliases, duplicates, traversal and invalid file identities',()=>{
  const row={path:'index.html',bytes:1,sha256:hash('x')};
  for(const path of ['/index.html','../index.html','data/../index.html','data//index.html','data\\index.html'])assert.throws(()=>checkPublicationMetadata(manifest([{...row,path}])),/Unsafe or duplicate/);
  assert.throws(()=>checkPublicationMetadata(manifest([row,row])),/Unsafe or duplicate/);
  assert.throws(()=>checkPublicationMetadata(manifest([{...row,bytes:-1}])),/Invalid public file identity/);
  assert.throws(()=>checkPublicationMetadata(manifest([{...row,sha256:'broken'}])),/Invalid public file identity/);
});

test('an ancestor-directory symlink cannot import unvalidated files from outside the public artifact',async t=>{
  const root=await mkdtemp(join(tmpdir(),'atlas-publication-link-'));t.after(()=>rm(root,{recursive:true,force:true}));
  await mkdir(join(root,'dist'));await mkdir(join(root,'outside'));
  await writeFile(join(root,'outside','index.html'),'x');
  await symlink(join(root,'outside'),join(root,'dist','alias'),'dir');
  await assert.rejects(checkPublication(manifest([{path:'alias/index.html',bytes:1,sha256:hash('x')}]),{directory:join(root,'dist')}),/leaves its artifact/);
});

test('asset publication preserves its own collection time and distinguishes historical gaps from a failed attempt',()=>{
  const input={retrievedAt:'2026-10-26T07:00:00Z',meta:{retrievedAt:'2026-10-26T04:15:07.706Z',sourceName:'actual provider',missingDayCount:2},prices:[['2026-10-25',123]]};
  const config={symbol:'BTC',role:'comparison',market:'crypto',sourcePath:'data/asset-comparison.json'};
  const asset=publicationAsset(input,config,'2026-10-26T08:00:00Z');
  assert.equal(asset.freshness.observedAt,input.meta.retrievedAt);
  assert.equal(asset.freshness.knownGapCount,2);assert.equal(asset.freshness.code,'gap');
  const failed=publicationAsset(input,{...config,outcome:{outcome:'failure',attemptedAt:'2026-10-26T06:20:00Z'}},'2026-10-26T08:00:00Z');
  assert.equal(failed.freshness.code,'retained');assert.equal(failed.freshness.observedAt,input.meta.retrievedAt);
  const unknown=publicationAsset({prices:input.prices},config,'2026-10-26T08:00:00Z');assert.equal(unknown.freshness.observedAt,null);
});

test('public confirmation matches the expected build and rejects a stale or substituted served file',async()=>{
  const files=['index.html','site-entry.js','data/btc-daily.json','data/forecast-ledger/index.json'].map(path=>({path,bytes:1,sha256:hash('x')}));
  const {manifestSha256,...body}=manifest(files);const record=seal({...body,sourceTree:{status:'clean'}});
  let substitute=false;
  const fetchImpl=async url=>new Response(url.pathname.endsWith('/publication.json')?JSON.stringify(record):substitute?'y':'x',{status:200});
  const options={baseUrl:'https://example.com/atlas/',expectedManifest:record.manifestSha256,expectedSource:record.sourceCommit,fetchImpl};
  const result=await verifyServedPublication(options);assert.equal(result.state.phase,'confirmed');assert.equal(result.verified.length,4);
  await assert.rejects(verifyServedPublication({...options,expectedManifest:'b'.repeat(64)}),/differs from the validated build/);
  substitute=true;await assert.rejects(verifyServedPublication(options),/Served file differs/);
});

test('a dirty local preview cannot be certified as the public committed artifact',async()=>{
  const {manifestSha256,...body}=manifest([{path:'index.html',bytes:1,sha256:hash('x')}]);
  const record=seal({...body,sourceTree:{status:'modified-preview'}});
  await assert.rejects(verifyServedPublication({baseUrl:'https://example.com/',expectedManifest:record.manifestSha256,expectedSource:record.sourceCommit,fetchImpl:async()=>new Response(JSON.stringify(record))}),/local preview/);
});
