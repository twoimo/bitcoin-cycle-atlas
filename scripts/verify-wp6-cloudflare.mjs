#!/usr/bin/env node
// Explicit supplementary public/candidate evidence. Never deploys, changes the
// canonical browser inventory, or qualifies a model/publication release.
import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir, realpath, stat, rm } from 'node:fs/promises';
import { resolve, relative, dirname, delimiter, sep, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { createServer } from 'node:http';
import { bootstrapCloudflareBuild, runRuntimeCommand } from './bootstrap-cloudflare-build.mjs';
import { cloudflareRuntime } from './cloudflare-build-contract.mjs';
import { browserEvidenceChunkSize, emitBrowserEvidenceChunks, emitCompressedBrowserReport } from './browser-evidence-transport.mjs';
import { drainVerificationOutput } from './cloudflare-gate-runner.mjs';

const root=fileURLToPath(new URL('..',import.meta.url));
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const errorText=error=>String(error?.stack||error?.message||error);
const harnessFiles=['scripts/verify-wp6-browser.mjs','scripts/verify-wp6-cloudflare.mjs','scripts/verify-chart-qa-metrics.mjs'];
export const wp6EvidenceViewports=Object.freeze([[390,844],[320,740],[768,1024],[1024,768],[1440,900],[1920,1080]].map(Object.freeze));
export const wp6EvidenceSymbols=Object.freeze(['BTCUSD','ETHUSD','MSTR','BMNR','TQQQ']);
export const wp6EvidenceLimits=Object.freeze({pngBytes:24*1024*1024,individualPngBytes:2*1024*1024});
export const wp6TransportBudget=Object.freeze({pngBytes:3_000_000,logBytes:4_250_000});

/** Valid failure screenshots remain useful diagnostic evidence. This checks
 * only their byte receipts, independently of the browser verdict. */
export function collectWp6Screenshots(report){
  assert.equal(report.kind,'atlas-wp6-native-browser-evidence');assert.ok(Array.isArray(report.cases));
  const screenshots=[];
  for(const item of report.cases){
    assert.ok(Array.isArray(item.screenshots));
    for(const image of item.screenshots){
      assert.match(image.file,/^[a-z0-9-]+\.png$/);assert.match(image.sha256,/^[a-f0-9]{64}$/);
      assert.ok(Number.isSafeInteger(image.bytes)&&image.bytes>0&&image.bytes<=wp6EvidenceLimits.individualPngBytes);
      screenshots.push(image);
    }
  }
  assert.equal(new Set(screenshots.map(image=>image.file)).size,screenshots.length,'Duplicate screenshot receipt');
  assert.ok(screenshots.reduce((sum,image)=>sum+image.bytes,0)<=wp6EvidenceLimits.pngBytes,'All screenshots exceed the explicit transport budget');
  return screenshots;
}

function screenshotPriority(image){
  const current=image.phase!=='before';
  if(/^tqqq-(390x844|320x740|768x1024|1024x768|1440x900|1920x1080)-chart\.png$/.test(image.file))return current?0:1;
  if(/^btcusd-(390x844|320x740)-replay(?:-menu)?\.png$/.test(image.file))return current?2:5;
  if(/^bmnr-(390x844|1440x900)-chart\.png$/.test(image.file))return current?3:6;
  if(/^(ethusd|mstr)-1440x900-chart\.png$/.test(image.file))return current?4:7;
  if(image.file.endsWith('-failure.png'))return 8;
  return null;
}
export function wp6ScreenshotLogBytes(image){
  const encoded=Math.ceil(image.bytes/3)*4,total=Math.max(1,Math.ceil(encoded/browserEvidenceChunkSize));let bytes=0;
  for(let index=0;index<total;index++)bytes+=Buffer.byteLength('ETH_BROWSER_IMAGE_CHUNK '+JSON.stringify({schemaVersion:1,name:'wp6-'+image.phase+'/'+image.file,
    bytes:image.bytes,sha256:image.sha256,total,index,data:''})+'\n')+Math.min(browserEvidenceChunkSize,encoded-index*browserEvidenceChunkSize);
  return bytes;
}
/** Every capture stays in its native report. Only this declared, bounded set
 * enters public logs; selecting a screenshot does not establish retrieval. */
export function planWp6ScreenshotTransport(inventory,{phases,budget=wp6TransportBudget,suite='wp6',imageGroup='all'}={}){
  assert.ok(Array.isArray(inventory));for(const key of ['pngBytes','logBytes'])assert.ok(Number.isSafeInteger(budget[key])&&budget[key]>0);
  phases??=[...new Set(inventory.map(image=>image.phase))];
  const required=phases.flatMap(phase=>wp6EvidenceViewports.flatMap(([width,height])=>[...(suite==='chart-qa'?['btcusd','compare']:['tqqq']).map(symbol=>phase+'/'+symbol+'-'+width+'x'+height+'-chart.png'),...(suite==='chart-qa'&&phase!=='before'&&width<=390?[phase+'/btcusd-'+width+'x'+height+'-interval-30m.png']:[])]));
  const groupPattern={all:/./,mobile:/-(390x844|320x740)-/,medium:/-(768x1024|1024x768)-/,large:/-(1440x900|1920x1080)-/,'1920':/-1920x1080-/}[imageGroup];assert.ok(groupPattern,'Unknown image transport group');
  const priority=image=>!groupPattern.test(image.file)?null:suite==='chart-qa'?(required.includes(image.phase+'/'+image.file)?0:null):screenshotPriority(image);
  const identity=image=>image.phase+'/'+image.file,available=new Set(inventory.map(identity)),selected=[],omitted=[],errors=[];
  for(const name of required)if(!available.has(name))errors.push('Required viewport screenshot was not captured: '+name);
  let pngBytes=0,logBytes=0;
  for(const image of inventory.filter(image=>priority(image)!==null).sort((a,b)=>priority(a)-priority(b))){
    const cost=wp6ScreenshotLogBytes(image);
    if(pngBytes+image.bytes>budget.pngBytes||logBytes+cost>budget.logBytes){omitted.push({...image,reason:'PNG or encoded log budget exceeded'});if(required.includes(identity(image)))errors.push('Required viewport screenshot exceeds transport budget: '+identity(image));continue;}
    selected.push(image);pngBytes+=image.bytes;logBytes+=cost;
  }
  for(const image of inventory)if(priority(image)===null)omitted.push({...image,reason:!groupPattern.test(image.file)?'Omitted from explicit '+imageGroup+' image transport group; the native case still executed':'Additional captured state retained in native report; omitted from representative log transport'});
  return {budget,imageGroup,capturedImages:inventory.length,selected,omitted,errors,pngBytes,logBytes,order:'candidate/after TQQQ six, before TQQQ six, current native details, baseline details, failure frames'};
}

export async function emitWp6ScreenshotTransport(queue,{write=line=>new Promise((accept,reject)=>process.stdout.write(line,error=>error?reject(error):accept())),
  drain=()=>drainVerificationOutput(),pause=ms=>new Promise(accept=>setTimeout(accept,ms)),batchBytes=8_000,delayMs=100}={}){
  let logBytes=0,images=0,batch=0;
  for(const item of queue){
    const lines=[];emitBrowserEvidenceChunks('ETH_BROWSER_IMAGE_CHUNK',item.bytes,{name:item.name,log:line=>lines.push(line+'\n')});
    for(const line of lines){await write(line);const bytes=Buffer.byteLength(line);logBytes+=bytes;batch+=bytes;
      if(batch>=batchBytes){await drain();await pause(delayMs);batch=0;}}
    await drain();await pause(delayMs);images++;
  }
  return {status:'emitted',images,logBytes,meaning:'Original selected PNG chunks written to stdout with backpressure; retrieval must verify the chunk inventory and hashes'};
}

export function validateWp6CandidateSource(source,{expectedSource}={}){
  assert.equal(source?.kind,'atlas-wp6-candidate-source');assert.equal(source.productionDeployment,false);
  assert.equal(source.verifiedTrackedDistClean,true,'Candidate pages must be the clean committed dist tree');
  assert.match(source.sourceCommit,/^[a-f0-9]{40}$/);assert.match(source.sourceTree,/^[a-f0-9]{40}$/);
  assert.match(source.distTreeSha256,/^[a-f0-9]{64}$/);
  if(expectedSource)assert.equal(source.sourceCommit,expectedSource,'Candidate source differs from the requested commit');
  return source;
}

/** Validate every required case. Transporting a failure image never changes
 * this verdict or invents a replacement for missing measurements. */
export function validateWp6Report(report,{phase,origin,expectedSource}={}){
  assert.equal(report.kind,'atlas-wp6-native-browser-evidence');assert.equal(report.qualifiesFullVerification,false);
  assert.equal(report.phase,phase);assert.equal(report.origin,origin);assert.equal(report.status,'PASS');
  assert.deepEqual(report.failures,[]);assert.equal(report.error,undefined);
  assert.ok(['before','after','candidate'].includes(phase));
  if(phase==='candidate'){
    assert.match(expectedSource??'',/^[a-f0-9]{40}$/,'Candidate evidence requires an exact committed source');
    validateWp6CandidateSource(report.candidateSourceBefore,{expectedSource});validateWp6CandidateSource(report.candidateSourceAfter,{expectedSource});
    assert.match(report.candidateSourceBefore.sha256??'',/^[a-f0-9]{64}$/);
    assert.equal(report.candidateSourceAfter.sha256,report.candidateSourceBefore.sha256,'Candidate identity changed during capture');
    for(const key of ['sourceCommit','sourceTree','distTreeSha256'])assert.equal(report.candidateSourceAfter[key],report.candidateSourceBefore[key],'Candidate source changed during capture');
    assert.equal(report.publicationBefore,undefined);assert.equal(report.publicationAfter,undefined);
  }else{
    if(phase==='after')assert.match(expectedSource??'',/^[a-f0-9]{40}$/,'After evidence requires an exact published source');
    assert.match(report.publicationBefore?.sourceCommit??'',/^[a-f0-9]{40}$/);assert.match(report.publicationBefore?.sha256??'',/^[a-f0-9]{64}$/);
    assert.equal(report.publicationAfter?.sourceCommit,report.publicationBefore.sourceCommit,'Publication source changed during capture');
    assert.equal(report.publicationAfter?.sha256,report.publicationBefore.sha256,'Publication bytes changed during capture');
    if(expectedSource)assert.equal(report.publicationBefore.sourceCommit,expectedSource);
    assert.equal(report.candidateSourceBefore,undefined);assert.equal(report.candidateSourceAfter,undefined);
  }
  const expected=wp6EvidenceViewports.flatMap(([width,height])=>(report.suite==='chart-qa'?['BTCUSD','COMPARE']:wp6EvidenceSymbols).map(symbol=>({symbol,width,height})));
  assert.deepEqual(report.cases.map(({symbol,width,height})=>({symbol,width,height})),expected,'WP6 evidence requires every instrument at all six viewports');
  assert.equal(new Set(report.cases.map(item=>item.contextId)).size,expected.length,'Each case requires isolated browser state');
  for(const item of report.cases){
    assert.equal(item.status,'PASS',item.id+' failed');assert.deepEqual(item.runtimeErrors,[]);
    assert.ok(typeof item.contextId==='string'&&item.contextId.length>0);
    const prefix=item.symbol.toLowerCase()+'-'+item.width+'x'+item.height;
    const required=[prefix+'-chart.png',...(report.suite==='chart-qa'&&phase!=='before'&&item.symbol==='BTCUSD'&&item.width<=390?[prefix+'-interval-30m.png']:[]),...(report.suite!=='chart-qa'&&item.symbol==='BTCUSD'?[prefix+'-replay.png']:[]),...(phase!=='before'&&item.symbol==='TQQQ'?[prefix+'-statistics.png']:[])];
    for(const file of required)assert.ok(item.screenshots.some(image=>image.file===file),'Required screenshot missing: '+file);
  }
  return collectWp6Screenshots(report);
}

async function committedCandidateSource(){
  const git=async args=>(await runRuntimeCommand('git',args,{cwd:root,timeout:15000})).output.trim();
  assert.equal(await git(['status','--porcelain','--untracked-files=all','--','dist']),'','Commit generated dist pages before candidate capture');
  const tree=await git(['ls-tree','-r','HEAD','--','dist']);assert.ok(tree.includes('\tdist/index.html'),'Committed candidate entry is missing');
  return validateWp6CandidateSource({schemaVersion:1,kind:'atlas-wp6-candidate-source',productionDeployment:false,verifiedTrackedDistClean:true,
    sourceCommit:await git(['rev-parse','HEAD']),sourceTree:await git(['rev-parse','HEAD^{tree}']),distTreeSha256:sha(tree)});
}

/** Same static Pages mount as the existing native suite. This serves actual
 * committed bytes and a diagnostic identity, never a fake publication.json. */
async function serveCandidate(source){
  const dist=resolve(root,'dist'),identity=Buffer.from(JSON.stringify(source)+'\n'),pagesBase='/bitcoin-cycle-atlas/';
  const mime={'.html':'text/html','.js':'text/javascript','.json':'application/json','.css':'text/css','.svg':'image/svg+xml','.png':'image/png','.woff2':'font/woff2','.ico':'image/x-icon'};
  const server=createServer(async(req,res)=>{
    try{
      if(!['GET','HEAD'].includes(req.method)){res.writeHead(405);res.end();return;}
      const url=new URL(req.url,'http://127.0.0.1');
      if(url.pathname==='/__wp6-candidate-source.json'){res.writeHead(200,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(req.method==='HEAD'?undefined:identity);return;}
      const pathname=url.pathname.startsWith(pagesBase)?url.pathname.slice(pagesBase.length-1):url.pathname;
      const path=resolve(dist,'.'+decodeURIComponent(pathname.endsWith('/')?pathname+'index.html':pathname));
      const rel=relative(dist,await realpath(path));if(rel==='..'||rel.startsWith('..'+sep)){res.writeHead(403);res.end('Forbidden');return;}
      if(!(await stat(path)).isFile())throw new Error('Not a file');
      const bytes=await readFile(path);res.writeHead(200,{'Content-Type':mime[extname(path)]||'application/octet-stream','Cache-Control':'no-store'});res.end(req.method==='HEAD'?undefined:bytes);
    }catch{res.writeHead(404);res.end('Not found');}
  });
  await new Promise((accept,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',accept);});
  return {origin:'http://127.0.0.1:'+server.address().port,close:()=>new Promise((accept,reject)=>{server.close(error=>error?reject(error):accept());server.closeIdleConnections();})};
}

async function pinnedNode(){
  if(process.version===cloudflareRuntime.node)return false;
  const candidates=[process.env.ATLAS_UI_NODE_PATH,process.env.npm_node_execpath,process.env.CODEX_PRIMARY_RUNTIME_NODE,process.env.NODE_BINARY,
    ...(process.env.PATH??'').split(delimiter).filter(Boolean).map(directory=>resolve(directory,'node'))];
  for(const candidate of [...new Set(candidates.filter(Boolean))]){
    const binary=await realpath(candidate).catch(()=>null);if(!binary||binary===await realpath(process.execPath))continue;
    const check=await runRuntimeCommand(binary,['--version'],{timeout:15000,allowFailure:true});
    if(check.code||check.output.trim()!==cloudflareRuntime.node)continue;
    const result=await runRuntimeCommand(binary,[fileURLToPath(import.meta.url),...process.argv.slice(2)],{cwd:root,timeout:20*60*1000,
      env:{...process.env,PATH:dirname(binary)+delimiter+(process.env.PATH??'')},log:text=>process.stdout.write(text),allowFailure:true});
    process.exitCode=result.code;return true;
  }
  throw new Error('WP6 diagnostics require '+cloudflareRuntime.node+'; set NODE_VERSION=24.22.2 in Workers Builds.');
}

export async function runWp6CloudflareReview(args=process.argv.slice(2)){
  const option=(key,fallback)=>{const i=args.indexOf(key);return i<0?fallback:args[i+1];};
  const suite=option('--suite','wp6'),imageGroup=option('--image-group','all');assert.ok(['wp6','chart-qa'].includes(suite));assert.ok(['all','mobile','medium','large','1920'].includes(imageGroup));
  const phase=option('--phase','review'),origin=option('--origin','https://bitcoin-cycle-atlas.twoimo.workers.dev').replace(/\/$/,''),expectedSource=option('--expected-source',null);
  assert.ok(['before','after','candidate','review'].includes(phase));assert.equal(new URL(origin).origin,origin);assert.equal(new URL(origin).protocol,'https:');
  if(phase==='after')assert.match(expectedSource??'',/^[a-f0-9]{40}$/,'--expected-source is required for after evidence');
  if(expectedSource)assert.match(expectedSource,/^[a-f0-9]{40}$/);
  const started=Date.now(),deadline=started+19*60*1000,remaining=()=>{const value=deadline-Date.now();assert.ok(value>1000,'WP6 diagnostic time budget exhausted');return value;};
  const directory=resolve(root,'build/wp6-review',phase);await mkdir(directory,{recursive:true});
  const receipt={schemaVersion:1,kind:'atlas-supplementary-wp6-review',suite,imageGroup,phase,origin,expectedSource,startedAt:new Date(started).toISOString(),status:'RUNNING',
    diagnosticOnly:true,qualifiesForPublication:false,canonicalBrowserGateUnchanged:true,deploymentPerformed:false,providerBuildUuid:process.env.WORKERS_CI_BUILD_UUID??null,
    outputDirectory:relative(root,directory),errors:[],screenshots:[],phases:[]};
  let candidateServer;const imageQueue=[],reportQueue=[];
  async function runPhase(spec,runtime){
    const phaseDirectory=resolve(root,'build/wp6-review',spec.phase);await mkdir(phaseDirectory,{recursive:true});
    const resultReceipt={...spec,status:'RUNNING',errors:[],outputDirectory:relative(root,phaseDirectory),capturedImages:null,verifiedImageFiles:0};receipt.phases.push(resultReceipt);
    let result=null,reportBytes=null;
    try{
      await rm(resolve(phaseDirectory,'report.json'),{force:true});
      const command=['scripts/verify-wp6-browser.mjs','--suite',suite,'--origin',spec.origin,'--phase',spec.phase,'--out',phaseDirectory,...(spec.expectedSource?['--expected-source',spec.expectedSource]:[])];
      try{result=await runRuntimeCommand(process.execPath,command,{cwd:root,env:{...process.env,...runtime.environment},timeout:Math.min(11*60*1000,remaining()),
        log:text=>process.stdout.write(text),allowFailure:true});resultReceipt.exitCode=result.code;resultReceipt.signal=result.signal??null;}
      catch(error){resultReceipt.errors.push(errorText(error));}
      reportBytes=await readFile(resolve(phaseDirectory,'report.json'));const report=JSON.parse(reportBytes);
      resultReceipt.nativeReport={status:report.status,cases:report.cases?.length??0,publicationBefore:report.publicationBefore,publicationAfter:report.publicationAfter,
        candidateSourceBefore:report.candidateSourceBefore,candidateSourceAfter:report.candidateSourceAfter,browser:report.browser,failures:report.failures,error:report.error};
      // Load verified captured bytes before verdict validation so actual failure
      // frames survive without marking any missing or failed case successful.
      const inventory=collectWp6Screenshots(report);resultReceipt.capturedImages=inventory.length;
      for(const image of inventory){
        try{
          const bytes=await readFile(resolve(phaseDirectory,image.file));assert.equal(bytes.length,image.bytes);assert.equal(sha(bytes),image.sha256);assert.equal(bytes.subarray(0,8).toString('hex'),'89504e470d0a1a0a');
          assert.ok(imageQueue.reduce((sum,item)=>sum+item.bytes.length,0)+bytes.length<=wp6EvidenceLimits.pngBytes,'Combined screenshots exceed the explicit transport budget');
          receipt.screenshots.push({phase:spec.phase,...image});imageQueue.push({name:'wp6-'+spec.phase+'/'+image.file,bytes});resultReceipt.verifiedImageFiles++;
        }catch(error){resultReceipt.errors.push(errorText(error));}
      }
      validateWp6Report(report,spec);assert.equal(result?.code,0,'Native browser process failed');
      resultReceipt.status=resultReceipt.errors.length?'FAIL':'PASS';
    }catch(error){resultReceipt.status='FAIL';resultReceipt.errors.push(errorText(error));}
    finally{
      if(spec.phase==='candidate')try{
        resultReceipt.candidateSourceAfter=await committedCandidateSource();
        assert.deepEqual(resultReceipt.candidateSourceAfter,receipt.candidateSourceBefore,'Candidate source changed during capture');
      }catch(error){resultReceipt.status='FAIL';resultReceipt.errors.push(errorText(error));}
      if(!reportBytes)try{reportBytes=await readFile(resolve(phaseDirectory,'report.json'));}catch{}
      if(reportBytes)reportQueue.push({name:'wp6-'+spec.phase+'/report.json',bytes:reportBytes});
      resultReceipt.finishedAt=new Date().toISOString();
      if(resultReceipt.status!=='PASS')receipt.errors.push(...resultReceipt.errors.map(error=>spec.phase+': '+error));
    }
  }
  try{
    await runRuntimeCommand('git',['ls-files','--error-unmatch','--',...harnessFiles],{cwd:root,timeout:15000});
    await runRuntimeCommand('git',['diff','--exit-code','HEAD','--',...harnessFiles],{cwd:root,timeout:15000});
    receipt.inspectorCommit=(await runRuntimeCommand('git',['rev-parse','HEAD'],{cwd:root,timeout:15000})).output.trim();
    receipt.harness=Object.fromEntries(await Promise.all(harnessFiles.map(async file=>[file,sha(await readFile(resolve(root,file)))])));
    console.log('ATLAS_WP6_REVIEW_START '+JSON.stringify(receipt));
    const runtime=await bootstrapCloudflareBuild({root,timeoutMs:Math.min(8*60*1000,remaining()),log:text=>process.stdout.write(text)});receipt.runtime=runtime.receipt;
    if(phase==='review'||phase==='before'||phase==='after')await runPhase({phase:phase==='review'?'before':phase,origin,expectedSource},runtime);
    if(phase==='review'||phase==='candidate'){
      receipt.candidateSourceBefore=await committedCandidateSource();
      if(phase==='candidate'&&expectedSource)validateWp6CandidateSource(receipt.candidateSourceBefore,{expectedSource});
      candidateServer=await serveCandidate(receipt.candidateSourceBefore);
      await runPhase({phase:'candidate',origin:candidateServer.origin,expectedSource:receipt.candidateSourceBefore.sourceCommit},runtime);
    }
    assert.deepEqual(Object.fromEntries(await Promise.all(harnessFiles.map(async file=>[file,sha(await readFile(resolve(root,file)))]))),receipt.harness,'Verifier source changed during capture');
    receipt.status=receipt.errors.length||receipt.phases.some(result=>result.status!=='PASS')?'FAIL':'PASS';
  }catch(error){receipt.status='FAIL';receipt.errors.push(errorText(error));}
  finally{
    if(candidateServer)try{await candidateServer.close();}catch(error){receipt.status='FAIL';receipt.errors.push(errorText(error));}
    if(receipt.phases.length===1){receipt.nativeReport=receipt.phases[0].nativeReport;receipt.exitCode=receipt.phases[0].exitCode;}
    const plan=planWp6ScreenshotTransport(receipt.screenshots,{phases:receipt.phases.map(result=>result.phase),suite,imageGroup,budget:suite==='chart-qa'?{pngBytes:1_900_000,logBytes:2_650_000}:wp6TransportBudget});receipt.screenshotPlan=plan;
    if(plan.errors.length){receipt.status='FAIL';receipt.errors.push(...plan.errors);}
    const selectedQueue=plan.selected.map(image=>imageQueue.find(item=>item.name==='wp6-'+image.phase+'/'+image.file));
    assert.ok(selectedQueue.every(Boolean),'Selected screenshot bytes are missing');
    receipt.finishedAt=new Date().toISOString();receipt.durationMs=Date.now()-started;
    receipt.screenshotTransport={status:'prepared',capturedImages:receipt.phases.reduce((sum,result)=>sum+(result.capturedImages??0),0),selectedImages:selectedQueue.length,
      pngBytes:plan.pngBytes,estimatedLogBytes:plan.logBytes,budget:plan.budget,omittedImages:plan.omitted.length,allCapturedImagesIncluded:plan.omitted.length===0,
      allCapturedFilesVerified:receipt.phases.length>0&&receipt.phases.every(result=>result.capturedImages!==null&&result.capturedImages===result.verifiedImageFiles),allVerificationCasesPassed:receipt.status==='PASS',
      deliveryMeaning:'Selection only. Actual retrieval requires the final completion marker and complete hash-verified chunks.'};
    receipt.reportTransports=reportQueue.map(item=>emitCompressedBrowserReport(item.bytes,{name:item.name}));
    const bytes=Buffer.from(JSON.stringify(receipt,null,2)+'\n');await writeFile(resolve(directory,'diagnostic.json'),bytes);
    const transport=emitCompressedBrowserReport(bytes,{name:'wp6-'+phase+'/diagnostic.json'});
    console.log('ATLAS_WP6_REVIEW_RECEIPT '+JSON.stringify({status:receipt.status,phase,origin,expectedSource,inspectorCommit:receipt.inspectorCommit,qualifiesForPublication:false,deploymentPerformed:false,
      nativeStatus:receipt.nativeReport?.status,cases:receipt.nativeReport?.cases,screenshotTransport:receipt.screenshotTransport,transport,errors:receipt.errors}));
    const emitted=await emitWp6ScreenshotTransport(selectedQueue);
    assert.equal(emitted.images,selectedQueue.length);assert.equal(emitted.logBytes,plan.logBytes);
    console.log('ATLAS_WP6_REVIEW_IMAGES_COMPLETE '+JSON.stringify({...emitted,pngBytes:plan.pngBytes,capturedImages:receipt.screenshotTransport.capturedImages,omittedImages:plan.omitted.length}));await drainVerificationOutput();await new Promise(accept=>setTimeout(accept,2000));
  }
  return receipt;
}

if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  try{if(!await pinnedNode()){const receipt=await runWp6CloudflareReview();if(receipt.status!=='PASS')process.exitCode=1;}}
  catch(error){console.error('ATLAS_WP6_REVIEW_ERROR '+errorText(error));process.exitCode=1;}
}
