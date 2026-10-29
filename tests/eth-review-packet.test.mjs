import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,readFile,mkdir,rm,symlink} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,dirname} from 'node:path';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {parseStaticReviewImports,discoverDynamicReviewImports,partitionReviewBook,buildEthReviewPacket,validateEthReviewSource,validateEthReviewChain} from '../scripts/build-eth-review-packet.mjs';

const hash=body=>createHash('sha256').update(body).digest('hex');
async function fixture(t,files){
  const root=await mkdtemp(join(tmpdir(),'eth-review-fixture-'));
  t.after(()=>rm(root,{recursive:true,force:true}));
  for(const [path,body] of Object.entries(files)){await mkdir(dirname(join(root,path)),{recursive:true});await writeFile(join(root,path),body);}
  const git=args=>execFileSync('git',args,{cwd:root,stdio:['ignore','pipe','pipe']});
  git(['init']);git(['config','user.name','Synthetic Packet Fixture']);git(['config','user.email','fixture@example.invalid']);
  git(['add','--',...Object.keys(files)]);git(['commit','-m','Explicitly synthetic review packet fixture']);
  return {root,git};
}
test('native module parser reads imports/re-exports without executing any source',()=>{
  const source="import {readFile} from 'node:fs';\nexport {x} from './dep.mjs';\nconst s=\"import x from './fictional.mjs'\";\n// import './comment.mjs'\nthrow new Error('This source must never execute');";
  assert.deepEqual(parseStaticReviewImports(source),['node:fs','./dep.mjs']);
});
test('dynamic import candidates retain literal paths and mark computed expressions',()=>{
  const r=discoverDynamicReviewImports("const a=import('./a.mjs'); const b=import(target);");
  assert.equal(r.length,2);assert.equal(r[0].specifier,'./a.mjs');assert.equal(r[1].specifier,null);
  assert.match(r[1].sourceFragment,/import\(target\)/);
});
test('parts concatenate exactly and never split a multibyte UTF-8 code point',()=>{
  const body=Buffer.from('한글🙂 source\n'.repeat(900)),parts=partitionReviewBook(body,1024);
  assert.ok(parts.length>2);assert.deepEqual(Buffer.concat(parts.map(p=>p.body)),body);
  for(const p of parts){assert.ok(p.bytes<=1024);assert.equal(p.sha256,hash(p.body));assert.deepEqual(Buffer.from(p.body.toString('utf8')),p.body);}
});
test('packet freezes HEAD blobs, static/literal dynamic closure and explicit inputs without running source',async t=>{
  const files={'main.mjs':"import {x} from './dep.mjs'; export const get=()=>import('./lazy.mjs'); throw new Error('must not run');\n",'dep.mjs':"export {x} from './leaf.mjs';\n",'leaf.mjs':'export const x=42;\n','lazy.mjs':'export const lazy=true;\n','data.json':'{"synthetic":true}\n'};
  const f=await fixture(t,files),m=await buildEthReviewPacket({repositoryRoot:f.root,outputDirectory:'packet',seedPaths:['main.mjs','data.json'],maximumPartBytes:1024});
  assert.equal(m.sourceAccess,'complete-for-declared-scope');assert.equal(m.entries.length,5);assert.equal(m.externalReview.status,'pending');assert.equal(m.externalReview.releaseAuthorized,false);
  const book=await readFile(join(f.root,'packet/source-book.txt'));
  assert.equal(hash(book),m.bundleSha256);assert.equal(book.length,m.bundleBytes);
  assert.deepEqual(Buffer.concat(await Promise.all(m.parts.map(p=>readFile(join(f.root,'packet',p.name))))),book);
  for(const [path,body] of Object.entries(files)){const entry=m.entries.find(e=>e.path===path);assert.equal(entry.sha256,hash(body));assert.equal(entry.bytes,Buffer.byteLength(body));}
  const contract=JSON.parse(await readFile(join(f.root,'packet/review-contract.json'),'utf8'));
  assert.deepEqual(Object.values(contract.stageStatus),['pending','pending','pending']);assert.equal(contract.releaseAuthorized,false);
});
test('changed working source and untracked required sources cannot inherit HEAD identity',async t=>{
  const f=await fixture(t,{'main.mjs':'export const x=1;\n'});
  await writeFile(join(f.root,'main.mjs'),'export const x=2;\n');
  await assert.rejects(buildEthReviewPacket({repositoryRoot:f.root,seedPaths:['main.mjs']}),/differs from committed/);
  await writeFile(join(f.root,'missing.mjs'),'export const x=3;\n');
  await assert.rejects(buildEthReviewPacket({repositoryRoot:f.root,seedPaths:['missing.mjs']}),/SOURCE_MISSING/);
});
test('computed imports remain SOURCE_MISSING until exact declarations name supplied targets',async t=>{
  const source="export const read=(name)=>import(name);\n",f=await fixture(t,{'main.mjs':source,'target.mjs':'export const safe=true;\n'});
  const unresolved=await buildEthReviewPacket({repositoryRoot:f.root,outputDirectory:'missing',seedPaths:['main.mjs']});
  assert.equal(unresolved.sourceAccess,'SOURCE_MISSING');assert.equal(unresolved.unresolvedImports.length,1);
  const found=discoverDynamicReviewImports(source)[0];
  const declaration={owner:'main.mjs',offset:found.offset,sourceFragment:found.sourceFragment,targets:['target.mjs'],reason:'This fixture restricts its runtime argument to the explicitly supplied target module.'};
  const resolved=await buildEthReviewPacket({repositoryRoot:f.root,outputDirectory:'resolved',seedPaths:['main.mjs'],dynamicResolutions:[declaration]});
  assert.equal(resolved.sourceAccess,'complete-for-declared-scope');assert.equal(resolved.declaredDynamic.length,1);
  await assert.rejects(buildEthReviewPacket({repositoryRoot:f.root,seedPaths:['main.mjs'],dynamicResolutions:[{...declaration,offset:999}]}),/Stale or unmatched/);
});
test('external packages are visible as missing, while node builtins require no copied runtime',async t=>{
  const f=await fixture(t,{'main.mjs':"import fs from 'node:fs'; import unknown from 'missing-fixture-package';\n"});
  const m=await buildEthReviewPacket({repositoryRoot:f.root,seedPaths:['main.mjs']});
  assert.equal(m.sourceAccess,'SOURCE_MISSING');assert.equal(m.externalImports[0].specifier,'node:fs');assert.equal(m.unresolvedImports[0].specifier,'missing-fixture-package');
});
test('nonempty generated evidence is hashed separately and symlink evidence is rejected',async t=>{
  const f=await fixture(t,{'main.mjs':'export const x=1;\n'});
  await writeFile(join(f.root,'actual-receipt.json'),'{"status":"synthetic-test-only"}\n');
  const m=await buildEthReviewPacket({repositoryRoot:f.root,seedPaths:['main.mjs'],evidencePaths:['actual-receipt.json']});
  assert.equal(m.entries.find(e=>e.path==='actual-receipt.json').kind,'provided-execution-evidence');
  await symlink('actual-receipt.json',join(f.root,'receipt-link.json'));
  await assert.rejects(buildEthReviewPacket({repositoryRoot:f.root,seedPaths:['main.mjs'],evidencePaths:['receipt-link.json']}),/bounded regular file/);
});

function reviewFixture(){
  const a='export const retainedPrice = Math.exp(0.01) * 100;\n',b='export const retainedRatio = Math.exp(0.02) * 0.05;\n';
  const sourceContents={'price.mjs':a,'ratio.mjs':b};
  const entries=Object.entries(sourceContents).map(([path,body])=>({
    path,kind:'committed-source',sha256:hash(body),bytes:Buffer.byteLength(body),encoding:'utf8',payloadBytes:Buffer.byteLength(body),
    gitBlob:createHash('sha1').update('blob '+Buffer.byteLength(body)+'\0').update(body).digest('hex'),
  }));
  const sourceBook='ETH SOURCE REVIEW BOOK\nSOURCE_COMMIT '+'a'.repeat(40)+'\nSOURCE_TREE '+'b'.repeat(40)+'\nEXTERNAL_REVIEW pending\n'+entries.map(e=>
    '\nBEGIN FILE '+e.path+'\nKIND '+e.kind+'\nORIGINAL_BYTES '+e.bytes+'\nSHA256 '+e.sha256+'\nENCODING '+e.encoding+'\nPAYLOAD_BYTES '+e.payloadBytes+'\n\n'+sourceContents[e.path]+'\nEND FILE '+e.path+'\n').join('');
  const manifest={schemaVersion:1,sourceCommit:'a'.repeat(40),sourceTree:'b'.repeat(40),bundleSha256:hash(sourceBook),bundleBytes:Buffer.byteLength(sourceBook),sourceAccess:'complete-for-declared-scope',entries,unresolvedImports:[],
    parts:partitionReviewBook(Buffer.from(sourceBook),1024).map(({body,...part})=>part)};
  const reports=[];let previousReportSha256=null;
  for(const [i,stage] of ['chatgpt-thesis','gemini-opposition','chatgpt-reverse'].entries()){
    const previousReportReadback=i?reports[i-1].reportText.slice(0,160):null;
    const reportText=stage+'\n'+'SYNTHETIC CONTRACT TEST ONLY. This is not an actual external model report. '.repeat(4)+'\n'+a+b+(previousReportReadback?'\n'+previousReportReadback:'');
    const reportSha256=hash(reportText);
    reports.push({stage,provider:i===1?'Google':'OpenAI',model:i===1?'Gemini fixture':'GPT fixture',reasoningLevel:'synthetic fixture',researchMode:'off',sourceCommit:manifest.sourceCommit,bundleSha256:manifest.bundleSha256,startedAt:'2026-10-26T10:0'+(i*2)+':00Z',completedAt:'2026-10-26T10:0'+(i*2+1)+':00Z',originalUrl:'https://example.org/synthetic-report/'+i,reportText,reportSha256,completeVisibleReport:true,sourceReadback:[{path:'price.mjs',quote:a.trim()},{path:'ratio.mjs',quote:b.trim()}],previousReportSha256,previousReportReadback});
    previousReportSha256=reportSha256;
  }
  return {manifest,reports,sourceContents,sourceBook,now:'2026-10-26T12:00:00Z'};
}
test('a complete bound chain is only structurally valid and cannot authenticate a model or release',()=>{
  const r=validateEthReviewChain(reviewFixture());
  assert.equal(r.status,'structurally-valid');assert.equal(r.actualModelExecutionAuthenticated,false);assert.equal(r.releaseAuthorized,false);assert.equal(r.stages.length,3);
});
test('missing reports, source-book bytes, unresolved sources and historical source identities fail closed',()=>{
  const f=reviewFixture();
  assert.throws(()=>validateEthReviewChain({...f,reports:[]}),/Three complete/);
  assert.throws(()=>validateEthReviewChain({...f,sourceBook:f.sourceBook+'changed'}),/source-book/);
  assert.throws(()=>validateEthReviewChain({...f,manifest:{...f.manifest,sourceAccess:'SOURCE_MISSING'}}),/Complete exact/);
  const old=structuredClone(f);old.reports[1].sourceCommit='b'.repeat(40);
  assert.throws(()=>validateEthReviewChain(old),/Historical or mismatched/);
});
test('empty, truncated, substituted or unbound report text is not accepted',()=>{
  const f=reviewFixture(),changed=structuredClone(f);
  changed.reports[1].reportText+='tamper';assert.throws(()=>validateEthReviewChain(changed),/Complete report bytes/);
  const truncated=structuredClone(f);truncated.reports[1].completeVisibleReport=false;
  assert.throws(()=>validateEthReviewChain(truncated),/Complete report bytes/);
  const wrongReadback=structuredClone(f);wrongReadback.reports[1].sourceReadback[0].quote='Substantive-looking words that do not exist in the exact source file at all.';
  assert.throws(()=>validateEthReviewChain(wrongReadback),/exact substantive/);
  const alteredSource=structuredClone(f);alteredSource.sourceContents['price.mjs']+='changed';
  assert.throws(()=>validateEthReviewChain(alteredSource),/source bytes differ/);
});
test('wrong provider, reversed stages, prior-report mismatch and invalid chronology are rejected',()=>{
  const f=reviewFixture();
  for(const mutate of [
    x=>{x.reports[1].provider='OpenAI';},
    x=>{x.reports.reverse();},
    x=>{x.reports[2].previousReportSha256='b'.repeat(64);},
    x=>{x.reports[2].previousReportReadback='Invented text '.repeat(10);},
    x=>{x.reports[1].startedAt='2026-10-26T09:00:00Z';},
    x=>{x.reports[1].startedAt='2026-02-30T10:00:00Z';},
    x=>{x.reports[1].startedAt='2026-10-26T24:00:00Z';},
    x=>{x.reports[1].startedAt='2026-10-26T10:60:00Z';},
    x=>{x.reports[1].startedAt='2026-10-26T10:00:60Z';},
  ]){const copy=structuredClone(f);mutate(copy);assert.throws(()=>validateEthReviewChain(copy));}
});


test('joint manifest and report relabeling cannot change the commit bound inside the source book',()=>{
  const f=reviewFixture();f.manifest.sourceCommit='c'.repeat(40);
  for(const report of f.reports)report.sourceCommit=f.manifest.sourceCommit;
  assert.throws(()=>validateEthReviewChain(f),/Source-book header/);
  const tree=reviewFixture();tree.manifest.sourceTree='c'.repeat(40);
  assert.throws(()=>validateEthReviewChain(tree),/Source-book header/);
});
test('joint source, entry and full report replacement cannot inherit an unchanged book',()=>{
  const f=reviewFixture(),before=f.sourceContents['price.mjs'],after=before.replace('0.01','0.09');
  f.sourceContents['price.mjs']=after;
  Object.assign(f.manifest.entries[0],{sha256:hash(after),gitBlob:createHash('sha1').update('blob '+Buffer.byteLength(after)+'\0').update(after).digest('hex')});
  let previous=null;
  for(const report of f.reports){
    report.reportText=report.reportText.replaceAll(before,after);
    report.sourceReadback[0].quote=after.trim();
    report.reportSha256=hash(report.reportText);
    report.previousReportSha256=previous;previous=report.reportSha256;
  }
  assert.throws(()=>validateEthReviewChain(f),/file framing mismatch/);
});
function rebindSyntheticBook(f,book){
  f.sourceBook=book;f.manifest.bundleSha256=hash(book);f.manifest.bundleBytes=Buffer.byteLength(book);
  f.manifest.parts=partitionReviewBook(Buffer.from(book),1024).map(({body,...part})=>part);
  for(const report of f.reports)report.bundleSha256=f.manifest.bundleSha256;
}
test('complete framing rejects unlisted trailing bytes, omitted entries and inconsistent Git blobs',()=>{
  const trailing=reviewFixture();rebindSyntheticBook(trailing,trailing.sourceBook+'unlisted');
  assert.throws(()=>validateEthReviewChain(trailing),/trailing or unlisted/);
  const omitted=reviewFixture();omitted.manifest.entries.pop();
  assert.throws(()=>validateEthReviewChain(omitted),/trailing or unlisted/);
  const blob=reviewFixture();blob.manifest.entries[0].gitBlob='d'.repeat(40);
  assert.throws(()=>validateEthReviewChain(blob),/Git blob differs/);
  const length=reviewFixture();length.manifest.entries[0].payloadBytes++;
  assert.throws(()=>validateEthReviewChain(length),/framing mismatch/);
  const duplicate=reviewFixture();duplicate.manifest.entries.push({...duplicate.manifest.entries[0]});
  assert.throws(()=>validateEthReviewChain(duplicate),/Duplicate source-book/);
});
test('part manifests bind complete bytes and cannot conceal unresolved imports',()=>{
  const f=reviewFixture();f.manifest.parts[0].sha256='d'.repeat(64);
  assert.throws(()=>validateEthReviewChain(f),/part bytes differ/);
  const missing=reviewFixture();missing.manifest.parts.pop();
  assert.throws(()=>validateEthReviewChain(missing),/parts.*(required|complete book)/);
  const unresolved=reviewFixture();unresolved.manifest.unresolvedImports.push({owner:'price.mjs',reason:'missing dependency'});
  assert.throws(()=>validateEthReviewChain(unresolved),/unresolved imports/);
});
test('real builder payload framing preserves Korean, delimiter text and binary evidence',async t=>{
  const body='정확한 원문🙂\nEND FILE unicode.txt\nBEGIN FILE pretend.mjs\n',f=await fixture(t,{'unicode.txt':body});
  const binary=Buffer.from([0,255,254,10,13,195,40]);
  await writeFile(join(f.root,'binary.bin'),binary);
  const manifest=await buildEthReviewPacket({repositoryRoot:f.root,seedPaths:['unicode.txt'],evidencePaths:['binary.bin'],maximumPartBytes:1024});
  const sourceBook=await readFile(join(f.root,'build/eth-review-packet/source-book.txt'));
  const bound=validateEthReviewSource({manifest,sourceBook});
  assert.equal(bound.sources.get('unicode.txt').body.toString('utf8'),body);
  assert.deepEqual(bound.sources.get('binary.bin').body,binary);
  const bad=sourceBook.toString('utf8').replace(binary.toString('base64'),binary.toString('base64')+' ');
  const altered=structuredClone(manifest),entry=altered.entries.find(e=>e.path==='binary.bin');
  entry.payloadBytes++;
  const patched=bad.replace('PAYLOAD_BYTES '+(entry.payloadBytes-1)+'\n','PAYLOAD_BYTES '+entry.payloadBytes+'\n');
  altered.bundleBytes=Buffer.byteLength(patched);altered.bundleSha256=hash(patched);
  altered.parts=partitionReviewBook(Buffer.from(patched),1024).map(({body,...part})=>part);
  assert.throws(()=>validateEthReviewSource({manifest:altered,sourceBook:patched}),/Noncanonical base64/);
});
test('repository paths cannot inject source-book header lines',async t=>{
  const f=await fixture(t,{'safe.txt':'content\n'});
  await assert.rejects(buildEthReviewPacket({repositoryRoot:f.root,seedPaths:['safe.txt\nBEGIN FILE injected']}),/repository-relative path/);
});
test('block and line comment separated dynamic imports are included in actual packet closure',async t=>{
  const source="export const block=()=>import /* permitted comment */ ('./hidden.mjs');\nexport const line=()=>import // permitted line comment\n ('./hidden.mjs');\n";
  const f=await fixture(t,{'main.mjs':source,'hidden.mjs':'export const hidden=true;\n'});
  const m=await buildEthReviewPacket({repositoryRoot:f.root,seedPaths:['main.mjs']});
  assert.equal(m.sourceAccess,'complete-for-declared-scope');
  assert.ok(m.entries.some(e=>e.path==='hidden.mjs'));
  assert.equal(m.dependencies.filter(d=>d.kind==='dynamic-literal').length,2);
});
test('comment separated computed imports stay SOURCE_MISSING and unicode line terminators are recognized',async t=>{
  const source="export const read=(name)=>import /* computed */ (name);\n";
  const f=await fixture(t,{'main.mjs':source});
  const m=await buildEthReviewPacket({repositoryRoot:f.root,seedPaths:['main.mjs']});
  assert.equal(m.sourceAccess,'SOURCE_MISSING');assert.equal(m.unresolvedImports.length,1);
  for(const terminator of ['\n','\r','\r\n','\u2028','\u2029']){
    const candidate=discoverDynamicReviewImports("const read=()=>import // line"+terminator+" ('./hidden.mjs')")[0];
    assert.equal(candidate.specifier,'./hidden.mjs');
  }
});


test('source-book capacity preserves complete UTF-8 bytes and enforces the exact finite bound',async t=>{
  const f=await fixture(t,{'payload.txt':'합성 검토 원문🙂\n'.repeat(200)});
  const options={repositoryRoot:f.root,seedPaths:['payload.txt'],maximumPartBytes:1024};
  const initial=await buildEthReviewPacket({...options,outputDirectory:'initial',maximumBundleBytes:20000});
  const original=await readFile(join(f.root,'initial/source-book.txt'));
  assert.equal(original.length,initial.bundleBytes);assert.equal(initial.bundleLimitBytes,20000);
  const exact=await buildEthReviewPacket({...options,outputDirectory:'exact',maximumBundleBytes:original.length});
  assert.equal(exact.bundleLimitBytes,original.length);assert.equal(exact.bundleSha256,initial.bundleSha256);
  const book=await readFile(join(f.root,'exact/source-book.txt'));
  assert.deepEqual(book,original);
  assert.deepEqual(Buffer.concat(await Promise.all(exact.parts.map(part=>readFile(join(f.root,'exact',part.name))))),original);
  assert.equal(validateEthReviewSource({manifest:exact,sourceBook:book}).sources.size,1);
  await assert.rejects(buildEthReviewPacket({...options,outputDirectory:'too-small',maximumBundleBytes:original.length-1}),error=>{
    assert.ok(error instanceof RangeError);assert.equal(error.code,'REVIEW_BUNDLE_TOO_LARGE');
    assert.equal(error.bundleBytes,original.length);assert.equal(error.maximumBundleBytes,original.length-1);assert.equal(error.entryCount,1);
    assert.ok(error.message.includes(original.length+' > '+(original.length-1)));return true;
  });
  await assert.rejects(readFile(join(f.root,'too-small/source-manifest.json')),error=>error.code==='ENOENT');
  for(const limit of [Infinity,NaN,0,1023,20000.5])await assert.rejects(buildEthReviewPacket({...options,maximumBundleBytes:limit}),/finite safe integer/);
});

test('the default required-review disposition preserves the original pending header and exact under-limit book bytes',async t=>{
  const f=await fixture(t,{'source.txt':'Exact synthetic source bytes.\n'}),options={repositoryRoot:f.root,seedPaths:['source.txt']};
  const ordinary=await buildEthReviewPacket({...options,outputDirectory:'default'}),
    explicit=await buildEthReviewPacket({...options,outputDirectory:'required',externalReviewDisposition:'required'});
  const first=await readFile(join(f.root,'default/source-book.txt')),second=await readFile(join(f.root,'required/source-book.txt'));
  assert.deepEqual(first,second);assert.equal(ordinary.bundleSha256,explicit.bundleSha256);
  assert.equal(ordinary.externalReviewDisposition,'required');assert.equal(ordinary.externalReview.status,'pending');
  const entry=ordinary.entries[0],body=await readFile(join(f.root,'source.txt'),'utf8');
  const original='ETH SOURCE REVIEW BOOK\nSOURCE_COMMIT '+ordinary.sourceCommit+'\nSOURCE_TREE '+ordinary.sourceTree+'\nEXTERNAL_REVIEW pending\n'+
    '\nBEGIN FILE '+entry.path+'\nKIND '+entry.kind+'\nORIGINAL_BYTES '+entry.bytes+'\nSHA256 '+entry.sha256+'\nENCODING utf8\nPAYLOAD_BYTES '+entry.payloadBytes+'\n\n'+body+'\nEND FILE '+entry.path+'\n';
  assert.deepEqual(first,Buffer.from(original));
  const contract=JSON.parse(await readFile(join(f.root,'default/review-contract.json'),'utf8'));
  assert.deepEqual(contract.requiredStages,['chatgpt-thesis','gemini-opposition','chatgpt-reverse']);
  assert.deepEqual(Object.values(contract.stageStatus),['pending','pending','pending']);
  assert.equal(contract.releaseAuthorized,false);
  // Already preserved schema-1 manifests without the new field remain valid.
  const legacy=structuredClone(ordinary);delete legacy.externalReviewDisposition;
  assert.equal(validateEthReviewSource({manifest:legacy,sourceBook:first}).sources.size,1);
});

test('user-omitted external stages are consistently omitted in manifest, book, brief and contract without inventing thesis execution',async t=>{
  const f=await fixture(t,{'source.txt':'Synthetic source; no provider review has been performed.\n'});
  const manifest=await buildEthReviewPacket({repositoryRoot:f.root,outputDirectory:'omitted',seedPaths:['source.txt'],
    externalReviewDisposition:'omitted-by-user'});
  const sourceBook=await readFile(join(f.root,'omitted/source-book.txt')),brief=await readFile(join(f.root,'omitted/review-brief.md'),'utf8'),
    contract=JSON.parse(await readFile(join(f.root,'omitted/review-contract.json'),'utf8'));
  assert.equal(manifest.externalReviewDisposition,'omitted-by-user');assert.equal(manifest.externalReview.status,'omitted-by-user');
  assert.match(sourceBook.toString('utf8'),/\nEXTERNAL_REVIEW omitted-by-user\n/);
  assert.equal(sourceBook.includes(Buffer.from('EXTERNAL_REVIEW pending')),false);
  assert.deepEqual(manifest.externalReview.stageStatus,{'chatgpt-thesis':'not-recorded','gemini-opposition':'omitted-by-user','chatgpt-reverse':'omitted-by-user'});
  assert.equal(manifest.externalReview.actualChatgptThesis,null);assert.equal(manifest.externalReview.actualGeminiReport,null);
  assert.equal(manifest.externalReview.actualChatgptReverse,null);assert.equal(manifest.externalReview.actualModelExecutionAuthenticated,false);
  assert.equal(manifest.externalReview.releaseAuthorized,false);assert.equal(manifest.sourceAccess,'complete-for-declared-scope');
  assert.equal(validateEthReviewSource({manifest,sourceBook}).sources.size,1);
  assert.match(brief,/user omitted Gemini opposition.*ChatGPT reverse review/);
  assert.match(brief,/Packet generation records no ChatGPT thesis execution/);
  assert.equal(brief.includes('Perform actual ChatGPT thesis, actual Gemini source opposition'),false);
  assert.equal(contract.externalReviewDisposition,'omitted-by-user');assert.deepEqual(contract.requiredStages,[]);
  assert.deepEqual(contract.stageStatus,manifest.externalReview.stageStatus);assert.equal(contract.releaseAuthorized,false);
  assert.match(contract.warning,/Omitted stages are not completed reports/);
});

test('omitted headers and stage labels cannot be relabeled as required, completed or released by editing manifest fields',async t=>{
  const f=await fixture(t,{'source.txt':'Synthetic disposition-binding fixture.\n'}),options={repositoryRoot:f.root,seedPaths:['source.txt']};
  const manifest=await buildEthReviewPacket({...options,externalReviewDisposition:'omitted-by-user'}),
    sourceBook=await readFile(join(f.root,'build/eth-review-packet/source-book.txt'));
  for(const mutate of [
    value=>{value.externalReviewDisposition='required';value.externalReview.status='pending';},
    value=>{delete value.externalReviewDisposition;},
    value=>{value.externalReviewDisposition='passed';},
    value=>{value.externalReview.status='pending';},
    value=>{value.externalReview.stageStatus['gemini-opposition']='passed';},
    value=>{value.externalReview.stageStatus['chatgpt-thesis']='completed';},
    value=>{value.externalReview.actualChatgptThesis='unperformed';},
    value=>{value.externalReview.releaseAuthorized=true;},
  ]){
    const altered=structuredClone(manifest);mutate(altered);
    assert.throws(()=>validateEthReviewSource({manifest:altered,sourceBook}),/disposition|Omitted review|Source-book header/);
  }
  const swapped={manifest:structuredClone(manifest),reports:[]};
  rebindSyntheticBook(swapped,sourceBook.toString('utf8').replace('EXTERNAL_REVIEW omitted-by-user','EXTERNAL_REVIEW pending'));
  assert.throws(()=>validateEthReviewSource(swapped),/Source-book header/);
  for(const disposition of ['pending','passed','complete',null,false,{}])
    await assert.rejects(buildEthReviewPacket({...options,externalReviewDisposition:disposition}),/disposition must be required or omitted-by-user/);
});

test('an omitted policy cannot be counted as a completed external chain even with three synthetic report bodies',()=>{
  const relabeledLegacy=reviewFixture();relabeledLegacy.manifest.externalReview={status:'omitted-by-user'};
  assert.throws(()=>validateEthReviewChain(relabeledLegacy),/Legacy manifest review status requires an exact explicit disposition/);
  const f=reviewFixture();f.manifest.externalReviewDisposition='omitted-by-user';
  f.manifest.externalReview={status:'omitted-by-user',
    stageStatus:{'chatgpt-thesis':'not-recorded','gemini-opposition':'omitted-by-user','chatgpt-reverse':'omitted-by-user'},
    actualChatgptThesis:null,actualGeminiReport:null,actualChatgptReverse:null,actualModelExecutionAuthenticated:false,releaseAuthorized:false};
  rebindSyntheticBook(f,f.sourceBook.replace('EXTERNAL_REVIEW pending','EXTERNAL_REVIEW omitted-by-user'));
  assert.equal(validateEthReviewSource(f).sources.size,2);
  assert.throws(()=>validateEthReviewChain(f),/omitted stages cannot count as a completed review chain/);
  assert.throws(()=>validateEthReviewChain({...f,reports:[]}),/omitted stages cannot count as a completed review chain/);
});

test('cumulative committed-source framing stops at the first overflow before visiting later missing sources',async t=>{
  const f=await fixture(t,{'a.txt':'A'.repeat(900),'b.txt':'B'.repeat(900)});
  const prefix=await buildEthReviewPacket({repositoryRoot:f.root,outputDirectory:'prefix',seedPaths:['a.txt'],maximumBundleBytes:10000}),
    complete=await buildEthReviewPacket({repositoryRoot:f.root,outputDirectory:'complete',seedPaths:['a.txt','b.txt'],maximumBundleBytes:10000});
  await assert.rejects(buildEthReviewPacket({repositoryRoot:f.root,outputDirectory:'rejected',
    seedPaths:['a.txt','b.txt','z-not-present.txt'],maximumBundleBytes:prefix.bundleBytes}),error=>{
    assert.equal(error.code,'REVIEW_BUNDLE_TOO_LARGE');assert.equal(error.bundleBytes,complete.bundleBytes);
    assert.equal(error.maximumBundleBytes,prefix.bundleBytes);assert.equal(error.budgetStage,'ingestion');
    assert.equal(error.firstExcessPath,'b.txt');assert.equal(error.retainedEntryCount,1);assert.equal(error.entryCount,2);
    assert.equal(error.measurementScope,'ingested-prefix-through-first-overflow');return true;
  });
  await assert.rejects(readFile(join(f.root,'rejected/source-manifest.json')),error=>error.code==='ENOENT');
});

test('cumulative evidence accounting includes binary expansion and fails before later evidence is read or output is written',async t=>{
  const f=await fixture(t,{'source.txt':'Synthetic packet seed.\n'}),binary=Buffer.alloc(900,255);
  await writeFile(join(f.root,'a.txt'),'A'.repeat(1200));await writeFile(join(f.root,'b.bin'),binary);
  const options={repositoryRoot:f.root,seedPaths:['source.txt'],evidencePaths:['a.txt','b.bin']};
  const complete=await buildEthReviewPacket({...options,outputDirectory:'complete',maximumBundleBytes:10000}),
    entry=complete.entries.find(value=>value.path==='b.bin'),limit=complete.bundleBytes-(entry.payloadBytes-entry.bytes);
  assert.equal(entry.encoding,'base64');assert.equal(entry.payloadBytes,1200);assert.ok(limit>=1024);
  const diagnostics=[];
  for(let attempt=0;attempt<2;attempt++)await assert.rejects(buildEthReviewPacket({...options,outputDirectory:'rejected',
    evidencePaths:['a.txt','b.bin','z-not-present.bin'],maximumBundleBytes:limit}),error=>{
    assert.equal(error.code,'REVIEW_BUNDLE_TOO_LARGE');assert.equal(error.bundleBytes,complete.bundleBytes);
    assert.equal(error.firstExcessPath,'b.bin');assert.equal(error.retainedEntryCount,2);assert.equal(error.entryCount,3);
    assert.equal(error.budgetStage,'ingestion');
    diagnostics.push({message:error.message,bundleBytes:error.bundleBytes,entryCount:error.entryCount,
      firstExcessPath:error.firstExcessPath,retainedEntryCount:error.retainedEntryCount});return true;
  });
  assert.deepEqual(diagnostics[0],diagnostics[1]);
  await assert.rejects(readFile(join(f.root,'rejected/source-book.txt')),error=>error.code==='ENOENT');
  await assert.rejects(readFile(join(f.root,'rejected/source-manifest.json')),error=>error.code==='ENOENT');
});
