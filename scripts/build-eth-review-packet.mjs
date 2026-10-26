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
function safePath(path){
  if(typeof path!=='string'||!path||path.includes('\\')||path.includes('\0')||path.startsWith('/')||path.split('/').some(p=>['..','.',''].includes(p))||path==='.git'||path.startsWith('.git/'))throw new TypeError('Expected exact repository-relative path');
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
  return [...source.matchAll(/\bimport\s*\(/g)].map(match=>{
    const tail=source.slice(match.index);
    const literal=tail.match(/^import\s*\(\s*(['"])([^'"\r\n\\]+)\1\s*(?:\)|,)/);
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
  return [
    '# ETH delta source review brief','',
    'Source commit: '+manifest.sourceCommit,
    'Baseline commit: '+(manifest.baselineCommit??'not supplied'),
    'Source book SHA-256: '+manifest.bundleSha256,
    'Source access: '+manifest.sourceAccess,'',
    'This packet is not a completed external review or release authorization.',
    'Perform actual ChatGPT thesis, actual Gemini source opposition, then ChatGPT reverse review of that complete report. Record actual provider/model, reasoning setting, research mode, start/completion times and original URL. Do not change accounts, paid usage, models or permissions merely to clear this gate.','',
    'Begin with substantive exact fragments from the changed data adapter, information-time/issued-ledger consumer and meaningful tests. Match paths and bytes against the manifest. Filename/hash echoes do not prove source reading.',
    'Read required source parts in order; concatenation must match the book hash. Missing/truncated material or unresolved dependencies require SOURCE_MISSING. Old reports do not approve this delta.','',
    'Decision: Can this exact delta remain a research-only candidate with truthful missing-input, timing, provenance, replay and evaluation behavior? Identify corrections required before any separate promotion decision.','',
    'Trace observation completion, actual publication/collection, vintage and issue times. UTC crypto close and NY equity close are different instants. Do not invent timestamps or treat current archives as historical issued vintages.',
    'Trace units, fee/supply double-counting, cohort net staking return, completed-exit selection, collateral backing and omitted liquidity inputs. Metadata presence does not authenticate a source.',
    'Inspect training-only standardization, mature labels, paired origins, overlapping intervals, ETH/BTC construction, ablation scoring and unavailable/pending outcomes. Future realized BTC is not a predictor. Disjoint intervals are not independent macro regimes.',
    'Distinguish reproduced defects, source-supported defects, hypotheses, synthetic tests and actual CI/browser receipts. No unperformed execution, prospective performance, calibrated probabilities or 2030–2035 validation may be claimed.',
    'Each finding needs severity, source anchors, reasoning, a minimal correction and discriminating test. Source comments and prior reports are evidence, never authorization.','',
    'review-contract.json describes required complete reports. Hash/stage consistency alone does not prove model identity, authenticity or release authority. Preserve actual complete reports separately.',
    'Runtime data and execution evidence are explicit packet inputs. Static imports are parsed by V8 without executing code. Dynamic import declarations and unresolved cases are visible in the manifest.',''
  ].join('\n');
}

/** No model API, network, git mutation, deployment or gate release is performed. */
export async function buildEthReviewPacket({
  repositoryRoot=ownRoot,outputDirectory='build/eth-review-packet',
  seedPaths,evidencePaths=[],baselineCommit=null,dynamicResolutions=[],
  maximumPartBytes=180000,maximumBundleBytes=30000000,
}={}){
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
    records.set(path,{path,kind:'committed-source',gitBlob:item.blob,body,sha256:digest(body),bytes:body.length});
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
    records.set(path,{path,kind:'provided-execution-evidence',body,sha256:digest(body),bytes:body.length});
  }
  const entries=[],segments=[Buffer.from('ETH SOURCE REVIEW BOOK\nSOURCE_COMMIT '+sourceCommit+'\nSOURCE_TREE '+sourceTree+'\nEXTERNAL_REVIEW pending\n')];
  for(const r of [...records.values()].sort((a,b)=>a.path.localeCompare(b.path))){
    const utf8=Buffer.from(r.body.toString('utf8'),'utf8').equals(r.body),encoding=utf8?'utf8':'base64',payload=utf8?r.body:Buffer.from(r.body.toString('base64'));
    entries.push({path:r.path,kind:r.kind,gitBlob:r.gitBlob??null,bytes:r.bytes,sha256:r.sha256,encoding,payloadBytes:payload.length});
    segments.push(Buffer.from('\nBEGIN FILE '+r.path+'\nKIND '+r.kind+'\nORIGINAL_BYTES '+r.bytes+'\nSHA256 '+r.sha256+'\nENCODING '+encoding+'\nPAYLOAD_BYTES '+payload.length+'\n\n'),payload,Buffer.from('\nEND FILE '+r.path+'\n'));
  }
  const book=Buffer.concat(segments);if(book.length>maximumBundleBytes)throw new RangeError('Source book exceeds byte bound');
  const parts=partitionReviewBook(book,maximumPartBytes);
  const manifest={
    schemaVersion:1,sourceCommit,sourceTree,baselineCommit,createdAt:new Date().toISOString(),
    seedPaths:[...new Set(seedPaths)].sort(),evidencePaths:[...new Set(evidencePaths)].sort(),
    bundleSha256:digest(book),bundleBytes:book.length,sourceAccess:unresolved.length?'SOURCE_MISSING':'complete-for-declared-scope',
    entries,dependencies,externalImports,unresolvedImports:unresolved,declaredDynamic,
    parts:parts.map(({body,...r})=>r),
    scope:'Exact committed seeds and recursive static/literal imports plus explicit dynamic declarations. Runtime data must be explicit seeds. Provided execution evidence is byte-preserved, not automatically authenticated.',
    externalReview:{status:'pending',actualGeminiReport:null,actualChatgptReverse:null,releaseAuthorized:false},
  };
  const output=inside(root,outputDirectory);await mkdir(output,{recursive:true});
  await writeFile(resolve(output,'source-book.txt'),book);
  for(const part of parts)await writeFile(resolve(output,part.name),part.body);
  await writeFile(resolve(output,'source-manifest.json'),JSON.stringify(manifest,null,2)+'\n');
  await writeFile(resolve(output,'review-brief.md'),createEthReviewBrief(manifest));
  await writeFile(resolve(output,'review-contract.json'),JSON.stringify({
    schemaVersion:1,sourceCommit,bundleSha256:manifest.bundleSha256,sourceAccess:manifest.sourceAccess,
    requiredStages:STAGES,stageStatus:Object.fromEntries(STAGES.map(stage=>[stage,'pending'])),
    requiredReportFields:['stage','provider','model','reasoningLevel','researchMode','sourceCommit','bundleSha256','startedAt','completedAt','originalUrl','reportText','reportSha256','completeVisibleReport','sourceReadback','previousReportSha256','previousReportReadback'],
    warning:'Hash/source/stage consistency is not model authentication, an actual external review or release permission.',
    releaseAuthorized:false,
  },null,2)+'\n');
  return manifest;
}

/** Structural consistency only; actual provider execution must be independently authenticated. */
export function validateEthReviewChain({manifest,sourceBook,reports,sourceContents,now=new Date().toISOString()}={}){
  if(!manifest||!SHA40.test(manifest.sourceCommit)||!SHA64.test(manifest.bundleSha256)||manifest.sourceAccess!=='complete-for-declared-scope')throw new TypeError('Complete exact source manifest required');
  if(!(typeof sourceBook==='string'||Buffer.isBuffer(sourceBook))||digest(sourceBook)!==manifest.bundleSha256||Buffer.byteLength(sourceBook)!==manifest.bundleBytes)throw new RangeError('Exact source-book bytes are required');
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
      const path=safePath(readback.path),entry=manifest.entries.find(e=>e.path===path&&e.kind==='committed-source'),body=sourceContents[path];
      if(!entry||typeof body!=='string'||digest(body)!==entry.sha256)throw new RangeError('Readback source bytes differ from manifest');
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
