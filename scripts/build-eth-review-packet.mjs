import {readFile,mkdir,writeFile,lstat,realpath} from 'node:fs/promises';
import {resolve,relative,dirname,posix} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {isBuiltin} from 'node:module';

const digest=body=>createHash('sha256').update(body).digest('hex');
const ownRoot=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const SHA40=/^[a-f0-9]{40}$/;
const SHA64=/^[a-f0-9]{64}$/;
const STAGES=['chatgpt-thesis','gemini-opposition','chatgpt-reverse'];
const OMITTED_STAGE_STATUS=Object.freeze({'chatgpt-thesis':'not-recorded','gemini-opposition':'omitted-by-user','chatgpt-reverse':'omitted-by-user'});
function reviewDisposition(value='required'){
  if(!['required','omitted-by-user'].includes(value))throw new TypeError('External review disposition must be required or omitted-by-user');
  return value;
}
function manifestReviewDisposition(manifest){
  // Historical schema-1 source books predate the explicit disposition field.
  // Their sole supported header remains the original pending-review header.
  const explicit=Object.hasOwn(manifest,'externalReviewDisposition'),disposition=reviewDisposition(explicit?manifest.externalReviewDisposition:'required');
  const expected=disposition==='required'?'pending':'omitted-by-user';
  if(!explicit&&manifest.externalReview?.status!==undefined&&manifest.externalReview.status!=='pending')
    throw new TypeError('Legacy manifest review status requires an exact explicit disposition');
  if(explicit&&manifest.externalReview?.status!==expected)throw new TypeError('Manifest review status differs from its explicit disposition');
  if(disposition==='omitted-by-user'){
    const review=manifest.externalReview,status=review?.stageStatus;
    if(!status||Object.keys(status).length!==STAGES.length||STAGES.some(stage=>status[stage]!==OMITTED_STAGE_STATUS[stage])||
      review.actualChatgptThesis!==null||review.actualGeminiReport!==null||review.actualChatgptReverse!==null||
      review.actualModelExecutionAuthenticated!==false||review.releaseAuthorized!==false)
      throw new TypeError('Omitted review cannot claim completed stages, model execution or release authority');
  }
  return disposition;
}
const reviewHeader=disposition=>'EXTERNAL_REVIEW '+(disposition==='required'?'pending':'omitted-by-user')+'\n';
function safePath(path){
  if(typeof path!=='string'||!path||path.includes('\\')||/[\u0000-\u001f\u007f]/.test(path)||path.startsWith('/')||path.split('/').some(p=>['..','.',''].includes(p))||path==='.git'||path.startsWith('.git/'))throw new TypeError('Expected exact repository-relative path');
  return path;
}
function inside(root,path){safePath(path);const full=resolve(root,path);if(relative(root,full).startsWith('..'))throw new RangeError('Path leaves repository');return full;}
function stamp(value,name){
  if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/.test(value)||!Number.isFinite(Date.parse(value)))throw new TypeError(name+' requires timestamp and timezone');
  const clock=value.slice(11,19).split(':').map(Number);
  if(clock[0]>23||clock[1]>59||clock[2]>59)throw new TypeError(name+' has an invalid clock time');
  const d=value.slice(0,10),calendar=new Date(d+'T00:00:00Z');
  if(!Number.isFinite(calendar.getTime())||calendar.toISOString().slice(0,10)!==d)throw new TypeError(name+' has an invalid calendar date');
  return Date.parse(value);
}

/** V8 parses static imports/re-exports; it never links/evaluates application code. */
export function parseStaticReviewImports(source){
  const parser="const fs=require('node:fs'),vm=require('node:vm'); const text=fs.readFileSync(0,'utf8'); const m=new vm.SourceTextModule(text); process.stdout.write(JSON.stringify(m.dependencySpecifiers));";
  return JSON.parse(execFileSync(process.execPath,['--experimental-vm-modules','-e',parser],{input:source,encoding:'utf8',timeout:10000,maxBuffer:30000000,stdio:['pipe','pipe','pipe']}));
}

/** Dynamic-import detection is conservative. False positives need explicit byte-bound declarations. */
export function discoverDynamicReviewImports(source){
  // Comments and every JavaScript line terminator may separate import and (.
  // String/comment examples still need explicit non-executable declarations.
  const trivia='(?:\\s|\\/\\*[\\s\\S]*?\\*\\/|\\/\\/[^\\r\\n\\u2028\\u2029]*(?:\\r\\n|[\\r\\n\\u2028\\u2029]|$))*';
  const candidates=new RegExp('\\bimport'+trivia+'\\(','g');
  const literalPattern=new RegExp('^import'+trivia+'\\('+trivia+'([\\x27"])([^\\x27"\\r\\n\\\\]+)\\1'+trivia+'(?:\\)|,)');
  return [...source.matchAll(candidates)].map(match=>{
    const tail=source.slice(match.index),literal=tail.match(literalPattern);
    return {offset:match.index,specifier:literal?.[2]??null,sourceFragment:tail.slice(0,160)};
  });
}
export function partitionReviewBook(bytes,maximumPartBytes=180000){
  if(!Buffer.isBuffer(bytes))bytes=Buffer.from(bytes);
  if(!Number.isSafeInteger(maximumPartBytes)||maximumPartBytes<1024)throw new RangeError('Part limit must be at least 1024 bytes');
  const out=[];let start=0;
  while(start<bytes.length){
    let end=Math.min(bytes.length,start+maximumPartBytes);
    while(end<bytes.length&&(bytes[end]&0xc0)===0x80)end--;
    if(end<=start)throw new RangeError('Invalid UTF-8 partition boundary');
    const body=bytes.subarray(start,end);
    out.push({name:'source-part-'+String(out.length+1).padStart(2,'0')+'.txt',body,bytes:body.length,sha256:digest(body)});
    start=end;
  }
  return out;
}

export function createEthReviewBrief(manifest){
  const omitted=manifestReviewDisposition(manifest)==='omitted-by-user';
  return [
    '# ETH delta source review brief','',
    'Source commit: '+manifest.sourceCommit,
    'Baseline commit: '+(manifest.baselineCommit??'not supplied'),
    'Source book SHA-256: '+manifest.bundleSha256,
    'Source access: '+manifest.sourceAccess,'',
    'This packet is not a completed external review or release authorization.',
    omitted?
      'The user omitted Gemini opposition and the follow-up ChatGPT reverse review. Their status is omitted-by-user; neither stage is completed or passed. Packet generation records no ChatGPT thesis execution. Preserve this source evidence without running or requiring the omitted stages.':
      'Perform actual ChatGPT thesis, actual Gemini source opposition, then ChatGPT reverse review of that complete report. Record actual provider/model, reasoning setting, research mode, start/completion times and original URL. Do not change accounts, paid usage, models or permissions merely to clear this gate.','',
    'Begin with substantive exact fragments from the changed data adapter, information-time/issued-ledger consumer and meaningful tests. Match paths and bytes against the manifest. Filename/hash echoes do not prove source reading.',
    'Read required source parts in order; concatenation must match the book hash. Missing/truncated material or unresolved dependencies require SOURCE_MISSING. Old reports do not approve this delta.','',
    'Decision: Can this exact delta remain a research-only candidate with truthful missing-input, timing, provenance, replay and evaluation behavior? Identify corrections required before any separate promotion decision.','',
    'Trace observation completion, actual publication/collection, vintage and issue times. UTC crypto close and NY equity close are different instants. Do not invent timestamps or treat current archives as historical issued vintages.',
    'Trace units, fee/supply double-counting, cohort net staking return, completed-exit selection, collateral backing and omitted liquidity inputs. Metadata presence does not authenticate a source.',
    'Inspect training-only standardization, mature labels, paired origins, overlapping intervals, ETH/BTC construction, ablation scoring and unavailable/pending outcomes. Future realized BTC is not a predictor. Disjoint intervals are not independent macro regimes.',
    'Distinguish reproduced defects, source-supported defects, hypotheses, synthetic tests and actual CI/browser receipts. No unperformed execution, prospective performance, calibrated probabilities or 2030–2035 validation may be claimed.',
    'Each finding needs severity, source anchors, reasoning, a minimal correction and discriminating test. Source comments and prior reports are evidence, never authorization.','',
    omitted?
      'review-contract.json records the user omission and the absence of recorded thesis execution. Omission is not a completed review chain, model authentication or release authority. No provider report is fabricated.':
      'review-contract.json describes required complete reports. Hash/stage consistency alone does not prove model identity, authenticity or release authority. Preserve actual complete reports separately.',
    'Runtime data and execution evidence are explicit packet inputs. Static imports are parsed by V8 without executing code. Dynamic import declarations and unresolved cases are visible in the manifest.',''
  ].join('\n');
}

/** No model API, network, git mutation, deployment or gate release is performed. */
export async function buildEthReviewPacket({
  repositoryRoot=ownRoot,outputDirectory='build/eth-review-packet',
  seedPaths,evidencePaths=[],baselineCommit=null,dynamicResolutions=[],
  maximumPartBytes=180000,maximumBundleBytes=30000000,
  externalReviewDisposition='required',
}={}){
  if(!Number.isSafeInteger(maximumBundleBytes)||maximumBundleBytes<1024)throw new RangeError('Bundle byte limit must be a finite safe integer of at least 1024 bytes');
  const disposition=reviewDisposition(externalReviewDisposition),omitted=disposition==='omitted-by-user';
  const root=resolve(repositoryRoot),git=args=>execFileSync('git',args,{cwd:root,maxBuffer:maximumBundleBytes});
  if(!Array.isArray(seedPaths)||!seedPaths.length)throw new TypeError('Explicit nonempty seedPaths required');
  if(!Array.isArray(evidencePaths)||!Array.isArray(dynamicResolutions))throw new TypeError('Expected evidence and dynamic-resolution arrays');
  if(baselineCommit!==null&&!SHA40.test(baselineCommit))throw new TypeError('Baseline must be exact commit');
  const sourceCommit=git(['rev-parse','HEAD']).toString('utf8').trim(),sourceTree=git(['rev-parse','HEAD^{tree}']).toString('utf8').trim();
  const tracked=new Map(git(['ls-tree','-rz','--full-tree',sourceCommit]).toString('utf8').split('\0').filter(Boolean).map(line=>{
    const m=line.match(/^(\d+) (\w+) ([a-f0-9]{40})\t([\s\S]+)$/);if(!m)throw new Error('Invalid git tree record');
    return [m[4],{mode:m[1],type:m[2],blob:m[3]}];
  }));
  const records=new Map(),dependencies=[],externalImports=[],unresolved=[],declaredDynamic=[],usedResolutions=new Set();
  const bookHeader=Buffer.from('ETH SOURCE REVIEW BOOK\nSOURCE_COMMIT '+sourceCommit+'\nSOURCE_TREE '+sourceTree+'\n'+reviewHeader(disposition));
  let bundleBytes=bookHeader.length;
  function retain(record){
    const utf8=Buffer.from(record.body.toString('utf8'),'utf8').equals(record.body),encoding=utf8?'utf8':'base64',
      payloadBytes=utf8?record.bytes:4*Math.ceil(record.bytes/3);
    const header=Buffer.from('\nBEGIN FILE '+record.path+'\nKIND '+record.kind+'\nORIGINAL_BYTES '+record.bytes+
      '\nSHA256 '+record.sha256+'\nENCODING '+encoding+'\nPAYLOAD_BYTES '+payloadBytes+'\n\n'),
      footer=Buffer.from('\nEND FILE '+record.path+'\n');
    const nextBytes=bundleBytes+header.length+payloadBytes+footer.length;
    // One bounded input can be inspected here, but it is not retained and no
    // base64 payload or book segment is allocated when it exceeds the running
    // framed budget. A large archive cannot accumulate in records before the
    // much smaller review-packet bound is enforced.
    if(nextBytes>maximumBundleBytes){
      const entryCount=records.size+1,error=new RangeError('Source book exceeds byte bound: '+nextBytes+' > '+maximumBundleBytes+' bytes ('+entryCount+' entries)');
      Object.assign(error,{code:'REVIEW_BUNDLE_TOO_LARGE',bundleBytes:nextBytes,maximumBundleBytes,entryCount,
        budgetStage:'ingestion',firstExcessPath:record.path,retainedEntryCount:records.size,
        measurementScope:'ingested-prefix-through-first-overflow'});
      throw error;
    }
    records.set(record.path,{...record,encoding,payloadBytes,header,footer});bundleBytes=nextBytes;
  }
  async function dependency(owner,specifier,kind){
    if(isBuiltin(specifier)){externalImports.push({owner,specifier,kind:'node-builtin'});return;}
    if(!specifier.startsWith('.')){unresolved.push({owner,specifier,kind,reason:'External non-builtin dependency is not supplied'});return;}
    const target=posix.normalize(posix.join(posix.dirname(owner),specifier.split(/[?#]/)[0]));
    safePath(target);dependencies.push({owner,target,kind});await visit(target);
  }
  async function visit(path){
    safePath(path);if(records.has(path))return;
    const item=tracked.get(path);
    if(!item||item.type!=='blob'||!['100644','100755'].includes(item.mode))throw new Error('SOURCE_MISSING or non-regular source: '+path);
    const body=git(['cat-file','blob',item.blob]);
    if(!Buffer.from(body.toString('utf8'),'utf8').equals(body))throw new TypeError('Source seed must be UTF-8 text: '+path);
    retain({path,kind:'committed-source',gitBlob:item.blob,body,sha256:digest(body),bytes:body.length});
    if(/\.cjs$/.test(path)){unresolved.push({owner:path,reason:'CommonJS loading requires separately declared source dependencies'});return;}
    if(!/\.(?:mjs|js)$/.test(path))return;
    const source=body.toString('utf8');
    for(const specifier of parseStaticReviewImports(source))await dependency(path,specifier,'static');
    for(const found of discoverDynamicReviewImports(source)){
      const index=dynamicResolutions.findIndex(r=>r.owner===path&&r.offset===found.offset&&r.sourceFragment===found.sourceFragment);
      if(index>=0){
        const r=dynamicResolutions[index];usedResolutions.add(index);
        if(typeof r.reason!=='string'||r.reason.trim().length<40||!Array.isArray(r.targets)||r.targets.some(t=>typeof t!=='string')||(!r.targets.length&&r.nonExecutableExample!==true))throw new TypeError('Dynamic declaration needs exact bytes, targets or explicit non-executable example, and reason');
        declaredDynamic.push({...r,sourceSha256:digest(body)});
        for(const target of r.targets){safePath(target);dependencies.push({owner:path,target,kind:'explicit-dynamic-declaration'});await visit(target);}
      }else if(found.specifier!==null){await dependency(path,found.specifier,'dynamic-literal');}
      else unresolved.push({owner:path,...found,reason:'Computed/uncertain dynamic import requires exact-source declaration'});
    }
  }
  for(const path of [...new Set(seedPaths)].sort())await visit(path);
  if(usedResolutions.size!==dynamicResolutions.length)throw new RangeError('Stale or unmatched dynamic-import declaration');
  const dirty=git(['status','--porcelain','--',...records.keys()]).toString('utf8').trim();
  if(dirty)throw new Error('Selected source differs from committed HEAD: '+dirty);
  for(const path of [...new Set(evidencePaths)].sort()){
    safePath(path);if(records.has(path))throw new TypeError('Evidence must not shadow committed source');
    const full=inside(root,path),info=await lstat(full),canonical=await realpath(full),canonicalRoot=await realpath(root);
    if(!info.isFile()||relative(canonicalRoot,canonical).startsWith('..')||info.size>maximumBundleBytes)throw new Error('Evidence must be a bounded regular file inside the repository');
    const body=await readFile(full);if(!body.length)throw new Error('Empty execution evidence: '+path);
    retain({path,kind:'provided-execution-evidence',body,sha256:digest(body),bytes:body.length});
  }
  const entries=[],segments=[bookHeader];
  for(const r of [...records.values()].sort((a,b)=>a.path.localeCompare(b.path))){
    const payload=r.encoding==='utf8'?r.body:Buffer.from(r.body.toString('base64'));
    if(payload.length!==r.payloadBytes)throw new Error('Review packet payload differs from its ingestion budget');
    entries.push({path:r.path,kind:r.kind,gitBlob:r.gitBlob??null,bytes:r.bytes,sha256:r.sha256,encoding:r.encoding,payloadBytes:r.payloadBytes});
    segments.push(r.header,payload,r.footer);
  }
  if(segments.reduce((total,segment)=>total+segment.length,0)!==bundleBytes)throw new Error('Review packet framing differs from its ingestion budget');
  const book=Buffer.concat(segments,bundleBytes);
  const parts=partitionReviewBook(book,maximumPartBytes);
  const manifest={
    schemaVersion:1,sourceCommit,sourceTree,baselineCommit,createdAt:new Date().toISOString(),
    seedPaths:[...new Set(seedPaths)].sort(),evidencePaths:[...new Set(evidencePaths)].sort(),
    bundleSha256:digest(book),bundleBytes:book.length,bundleLimitBytes:maximumBundleBytes,sourceAccess:unresolved.length?'SOURCE_MISSING':'complete-for-declared-scope',
    entries,dependencies,externalImports,unresolvedImports:unresolved,declaredDynamic,
    parts:parts.map(({body,...r})=>r),
    scope:'Exact committed seeds and recursive static/literal imports plus explicit dynamic declarations. Runtime data must be explicit seeds. Provided execution evidence is byte-preserved, not automatically authenticated.',
    externalReviewDisposition:disposition,
    externalReview:omitted?{status:'omitted-by-user',stageStatus:{...OMITTED_STAGE_STATUS},actualChatgptThesis:null,
      actualGeminiReport:null,actualChatgptReverse:null,actualModelExecutionAuthenticated:false,releaseAuthorized:false}:
      {status:'pending',actualGeminiReport:null,actualChatgptReverse:null,releaseAuthorized:false},
  };
  validateEthReviewSource({manifest,sourceBook:book});
  const output=inside(root,outputDirectory);await mkdir(output,{recursive:true});
  await writeFile(resolve(output,'source-book.txt'),book);
  for(const part of parts)await writeFile(resolve(output,part.name),part.body);
  await writeFile(resolve(output,'source-manifest.json'),JSON.stringify(manifest,null,2)+'\n');
  await writeFile(resolve(output,'review-brief.md'),createEthReviewBrief(manifest));
  await writeFile(resolve(output,'review-contract.json'),JSON.stringify({
    schemaVersion:1,sourceCommit,bundleSha256:manifest.bundleSha256,sourceAccess:manifest.sourceAccess,
    externalReviewDisposition:disposition,requiredStages:omitted?[]:STAGES,
    stageStatus:omitted?{...OMITTED_STAGE_STATUS}:Object.fromEntries(STAGES.map(stage=>[stage,'pending'])),
    requiredReportFields:['stage','provider','model','reasoningLevel','researchMode','sourceCommit','bundleSha256','startedAt','completedAt','originalUrl','reportText','reportSha256','completeVisibleReport','sourceReadback','previousReportSha256','previousReportReadback'],
    warning:omitted?'Gemini opposition and follow-up reverse review were omitted by the user; no ChatGPT thesis execution is recorded. Omitted stages are not completed reports, model authentication or release permission.':
      'Hash/source/stage consistency is not model authentication, an actual external review or release permission.',
    releaseAuthorized:false,
  },null,2)+'\n');
  return manifest;
}


/**
 * Reconcile every framed file with the exact source book before trusting a
 * separately supplied manifest or quote. This proves byte consistency only:
 * Git membership, source delivery and provider execution remain external facts.
 */
export function validateEthReviewSource({manifest,sourceBook}={}){
  if(!manifest||manifest.schemaVersion!==1||!SHA40.test(manifest.sourceCommit)||!SHA40.test(manifest.sourceTree)||!SHA64.test(manifest.bundleSha256))throw new TypeError('Exact source-book manifest identity required');
  const disposition=manifestReviewDisposition(manifest);
  if(!(typeof sourceBook==='string'||Buffer.isBuffer(sourceBook)))throw new TypeError('Exact source-book bytes are required');
  const book=Buffer.isBuffer(sourceBook)?sourceBook:Buffer.from(sourceBook);
  if(!Number.isSafeInteger(manifest.bundleBytes)||manifest.bundleBytes!==book.length||digest(book)!==manifest.bundleSha256)throw new RangeError('Exact source-book bytes are required');
  if(!Array.isArray(manifest.entries)||!manifest.entries.length)throw new TypeError('Nonempty source-book entries required');
  let offset=0;
  const line=()=>{
    const end=book.indexOf(10,offset);
    if(end<0)throw new RangeError('Truncated source-book framing');
    const bytes=book.subarray(offset,end),value=bytes.toString('utf8');
    if(!Buffer.from(value).equals(bytes))throw new TypeError('Invalid UTF-8 source-book header');
    offset=end+1;return value;
  };
  const expect=value=>{if(line()!==value)throw new RangeError('Source-book header or file framing mismatch');};
  expect('ETH SOURCE REVIEW BOOK');
  expect('SOURCE_COMMIT '+manifest.sourceCommit);
  expect('SOURCE_TREE '+manifest.sourceTree);
  expect(reviewHeader(disposition).trimEnd());
  const sources=new Map();
  for(const entry of manifest.entries){
    if(!entry||typeof entry!=='object')throw new TypeError('Invalid source-book entry');
    const path=safePath(entry.path);
    if(sources.has(path))throw new RangeError('Duplicate source-book path');
    if(!['committed-source','provided-execution-evidence'].includes(entry.kind)||!['utf8','base64'].includes(entry.encoding)||!SHA64.test(entry.sha256))throw new TypeError('Invalid source-book entry metadata');
    if(!Number.isSafeInteger(entry.bytes)||entry.bytes<0||!Number.isSafeInteger(entry.payloadBytes)||entry.payloadBytes<0)throw new TypeError('Invalid source-book byte lengths');
    expect('');expect('BEGIN FILE '+path);expect('KIND '+entry.kind);
    expect('ORIGINAL_BYTES '+entry.bytes);expect('SHA256 '+entry.sha256);
    expect('ENCODING '+entry.encoding);expect('PAYLOAD_BYTES '+entry.payloadBytes);expect('');
    if(entry.payloadBytes>book.length-offset)throw new RangeError('Truncated source-book payload');
    const payload=book.subarray(offset,offset+entry.payloadBytes);offset+=entry.payloadBytes;
    let body;
    if(entry.encoding==='utf8'){
      body=payload;
      if(!Buffer.from(body.toString('utf8')).equals(body))throw new TypeError('Invalid UTF-8 source-book payload');
    }else{
      const encoded=payload.toString('utf8');
      body=Buffer.from(encoded,'base64');
      if(body.toString('base64')!==encoded||!Buffer.from(encoded).equals(payload))throw new TypeError('Noncanonical base64 source-book payload');
    }
    if(body.length!==entry.bytes||digest(body)!==entry.sha256)throw new RangeError('Source-book payload bytes differ from manifest');
    if(entry.kind==='committed-source'){
      const gitBlob=createHash('sha1').update(Buffer.from('blob '+body.length+'\0')).update(body).digest('hex');
      if(!SHA40.test(entry.gitBlob)||gitBlob!==entry.gitBlob)throw new RangeError('Source-book Git blob differs from manifest');
    }else if(entry.gitBlob!==null)throw new TypeError('Execution evidence cannot claim a committed Git blob');
    expect('');expect('END FILE '+path);
    sources.set(path,{entry,body});
  }
  if(offset!==book.length)throw new RangeError('Unexpected trailing or unlisted source-book bytes');
  if(!Array.isArray(manifest.parts)||!manifest.parts.length)throw new TypeError('Source-book parts required');
  let partOffset=0;
  for(const [i,part] of manifest.parts.entries()){
    if(!part||part.name!=='source-part-'+String(i+1).padStart(2,'0')+'.txt'||!Number.isSafeInteger(part.bytes)||part.bytes<=0||part.bytes>book.length-partOffset||!SHA64.test(part.sha256))throw new TypeError('Invalid source-book part manifest');
    const bytes=book.subarray(partOffset,partOffset+part.bytes);partOffset+=part.bytes;
    if(digest(bytes)!==part.sha256||!Buffer.from(bytes.toString('utf8')).equals(bytes))throw new RangeError('Source-book part bytes differ from manifest');
  }
  if(partOffset!==book.length)throw new RangeError('Source-book parts do not cover the complete book');
  return {sourceCommit:manifest.sourceCommit,sourceTree:manifest.sourceTree,sources};
}

/** Structural consistency only; actual provider execution must be independently authenticated. */
export function validateEthReviewChain({manifest,sourceBook,reports,sourceContents,now=new Date().toISOString()}={}){
  if(!manifest||!SHA40.test(manifest.sourceCommit)||!SHA64.test(manifest.bundleSha256)||manifest.sourceAccess!=='complete-for-declared-scope')throw new TypeError('Complete exact source manifest required');
  const boundSource=validateEthReviewSource({manifest,sourceBook});
  if(manifestReviewDisposition(manifest)==='omitted-by-user')
    throw new TypeError('External review was omitted by the user; omitted stages cannot count as a completed review chain');
  if(!Array.isArray(manifest.unresolvedImports)||manifest.unresolvedImports.length)throw new TypeError('Complete exact source manifest cannot contain unresolved imports');
  if(!Array.isArray(reports)||reports.length!==3)throw new TypeError('Three complete reports required');
  if(!sourceContents||typeof sourceContents!=='object')throw new TypeError('Exact readback source contents required');
  const nowMs=stamp(now,'now');let previousHash=null,previousCompleted=-Infinity;const validated=[],reportHashes=new Set();
  for(let i=0;i<STAGES.length;i++){
    const r=reports[i],provider=i===1?'google':'openai';
    if(r?.stage!==STAGES[i])throw new TypeError('Required review stage order differs');
    if(typeof r.provider!=='string'||r.provider.toLowerCase()!==provider||typeof r.model!=='string'||r.model.trim().length<3||(i===1&&!/gemini/i.test(r.model)))throw new TypeError('Actual provider/model required for each stage');
    if(['reasoningLevel','researchMode'].some(k=>typeof r[k]!=='string'||!r[k].trim()))throw new TypeError('Actual reasoning/research settings required');
    if(r.sourceCommit!==manifest.sourceCommit||r.bundleSha256!==manifest.bundleSha256)throw new RangeError('Historical or mismatched source review');
    const started=stamp(r.startedAt,'startedAt'),completed=stamp(r.completedAt,'completedAt');
    if(completed<started||started<previousCompleted||completed>nowMs)throw new RangeError('Invalid or out-of-order review times');
    let url;try{url=new URL(r.originalUrl);}catch{throw new TypeError('Original report URL required');}
    if(url.protocol!=='https:'||url.username||url.password)throw new TypeError('Original HTTPS report URL required');
    if(r.completeVisibleReport!==true||typeof r.reportText!=='string'||r.reportText.trim().length<200||!SHA64.test(r.reportSha256)||digest(r.reportText)!==r.reportSha256)throw new TypeError('Complete report bytes and matching SHA-256 required');
    if(reportHashes.has(r.reportSha256))throw new RangeError('A prior report body cannot substitute for a new review stage');
    reportHashes.add(r.reportSha256);
    if((r.previousReportSha256??null)!==previousHash)throw new RangeError('Preceding full-report hash does not match');
    if(i>0&&(typeof r.previousReportReadback!=='string'||r.previousReportReadback.trim().length<80||!reports[i-1].reportText.includes(r.previousReportReadback)||!r.reportText.includes(r.previousReportReadback)))throw new RangeError('Later review must bind substantive actual preceding-report text');
    if(!Array.isArray(r.sourceReadback)||r.sourceReadback.length<2)throw new TypeError('Substantive source readback from two files required');
    const paths=new Set();
    for(const readback of r.sourceReadback){
      const path=safePath(readback.path),bound=boundSource.sources.get(path),entry=bound?.entry,body=sourceContents[path];
      if(!entry||entry.kind!=='committed-source'||entry.encoding!=='utf8'||typeof body!=='string'||!Buffer.from(body).equals(bound.body))throw new RangeError('Readback source bytes differ from manifest');
      if(typeof readback.quote!=='string'||readback.quote.trim().length<40||!body.includes(readback.quote)||!r.reportText.includes(readback.quote))throw new RangeError('Actual report must contain exact substantive source fragments');
      paths.add(path);
    }
    if(paths.size<2)throw new TypeError('Two distinct source readback files required');
    validated.push({stage:r.stage,provider:r.provider,model:r.model,reportSha256:r.reportSha256,originalUrl:r.originalUrl,completedAt:r.completedAt});
    previousHash=r.reportSha256;previousCompleted=completed;
  }
  return {status:'structurally-valid',sourceCommit:manifest.sourceCommit,bundleSha256:manifest.bundleSha256,stages:validated,
    actualModelExecutionAuthenticated:false,releaseAuthorized:false,
    scope:'Source/hash/time/order checks only; independently authenticate actual model identity, report provenance and source delivery.'};
}
if(process.argv[1]&&pathToFileURL(resolve(process.argv[1])).href===import.meta.url){
  if(!process.argv[2])throw new TypeError('Pass JSON configuration with explicit seedPaths');
  const config=JSON.parse(await readFile(process.argv[2],'utf8')),result=await buildEthReviewPacket(config);
  process.stdout.write('ETH_REVIEW_PACKET '+JSON.stringify({sourceCommit:result.sourceCommit,sourceAccess:result.sourceAccess,bundleSha256:result.bundleSha256,bundleBytes:result.bundleBytes,files:result.entries.length,parts:result.parts,unresolvedImports:result.unresolvedImports,externalReview:result.externalReview})+'\n');
  if(result.sourceAccess==='SOURCE_MISSING')process.exitCode=2;
}
