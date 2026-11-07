import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {readFile,writeFile,mkdir,lstat} from 'node:fs/promises';
import {dirname,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {cloudflareArchiveContextFromBuild,createCloudflareBuildReader} from './cloudflare-archive-build-api.mjs';
import {CLOUDFLARE_BUILD_UUID} from './ethereum-archive-provider-identity.mjs';
import {MARKET_REFRESH_REPOSITORY,MARKET_REFRESH_REMOTE,MARKET_REFRESH_RECEIPT_PATH,MARKET_REFRESH_MUTABLE_PATHS,
  MARKET_REFRESH_PROVIDER_IDS,MARKET_REFRESH_GATE_IDS,isMarketRefreshPath,isImmutableMarketRefreshPath,
  assertMarketRefreshReceipt,refreshSha256,marketRefreshReceiptBytes,marketRefreshCommandEnvironment,
  marketRefreshGitEnvironment,refreshGit} from './cloudflare-market-refresh-receipt.mjs';

const defaultRoot=resolve(dirname(fileURLToPath(import.meta.url)),'..');
export const MARKET_REFRESH_RESULT_PATH='build/cloudflare-market-refresh-result.json';
export const MARKET_REFRESH_PROVIDERS=Object.freeze([
  {id:'btc',required:true,command:'node',args:['scripts/refresh-data.mjs'],files:['dist/data/btc-daily.json','dist/data-update.js']},
  {id:'cycle',required:true,command:'node',args:['scripts/refresh-cycle-calibration.mjs'],files:['dist/data/cycle-calibration.json']},
  {id:'ohlc',command:'node',args:['scripts/refresh-ohlc.mjs'],files:['dist/data/btc-ohlc.json']},
  {id:'volume',command:'node',args:['scripts/refresh-volume.mjs'],files:['dist/data/btc-volume.json']},
  {id:'eth',command:'node',args:['scripts/refresh-eth.mjs'],files:['dist/data/eth-ohlc.json']},
  {id:'equities',command:'npm',args:['run','refresh:equities'],files:['dist/data/mstr-ohlc.json','dist/data/bmnr-ohlc.json']},
  {id:'comparison',command:'npm',args:['run','refresh:asset-comparison'],files:['dist/data/asset-comparison.json']},
].map(row=>Object.freeze({...row,args:Object.freeze(row.args),files:Object.freeze(row.files)})));
export const MARKET_REFRESH_GATES=Object.freeze([
  {id:'comparison-validation',command:'npm',args:['run','verify:asset-comparison']},
  {id:'judgment-capture',command:'node',args:['scripts/capture-asset-judgments.mjs']},
  {id:'research',command:'npm',args:['run','build:research']},
  {id:'forecast-build',command:'npm',args:['run','build:forecast']},
  {id:'forecast-verification',command:'npm',args:['run','verify:forecast']},
  {id:'tests',command:'npm',args:['test']},
  {id:'formal',command:'npm',args:['run','verify:formal']},
  {id:'cycle',command:'npm',args:['run','verify:cycle']},
  {id:'performance',command:'npm',args:['run','verify:performance']},
  {id:'static',command:'node',args:['scripts/verify-static.mjs']},
].map(row=>Object.freeze({...row,args:Object.freeze(row.args)})));
const iso=clock=>new Date(clock()).toISOString();
const required=(environment,name)=>{const value=environment[name];assert.ok(typeof value==='string'&&value&&!/[\r\n]/.test(value),'Missing or invalid build secret/setting: '+name);return value;};

export function marketRefreshRemainingBudget(build,now=Date.now()) {
  // Free Builds can queue behind another job. Queue creation is not execution;
  // installation and npm ci are charged from the real initialization clock.
  const start=Date.parse(build.initializing_on||build.running_on),remaining=19*60*1000-(now-start);
  assert.ok(Number.isFinite(start)&&start<=now&&remaining>0,'Refresh has no remaining free execution budget or valid execution clock');
  return remaining;
}

/** Bounded child groups prevent a timed-out npm command leaving test processes
 * alive. No command receives repository/Cloudflare secrets or raw clone auth. */
export async function runRefreshCommand({root,command,args,environment,timeoutMs}) {
  return new Promise((accept,reject)=>{
    const started=Date.now(),child=spawn(command==='node'?process.execPath:command,args,{cwd:root,env:environment,stdio:['ignore','pipe','pipe'],detached:true});
    const chunks=[],maximum=16*1024*1024;let bytes=0,timedOut=false,tooLarge=false;
    const kill=()=>{try{process.kill(-child.pid,'SIGKILL');}catch{child.kill('SIGKILL');}};
    const timer=setTimeout(()=>{timedOut=true;kill();},Math.max(1,timeoutMs));
    const collect=chunk=>{bytes+=chunk.length;if(bytes>maximum){tooLarge=true;kill();return;}chunks.push(chunk);};
    child.stdout.on('data',collect);child.stderr.on('data',collect);
    child.once('error',error=>{clearTimeout(timer);reject(error);});
    child.once('close',(code,signal)=>{clearTimeout(timer);accept({code,signal,timedOut,tooLarge,output:Buffer.concat(chunks),durationMs:Date.now()-started});});
  });
}

async function regularBytes(root,path) {
  for(let parent=dirname(path);parent!=='.';parent=dirname(parent)){const state=await lstat(resolve(root,parent));assert.ok(state.isDirectory()&&!state.isSymbolicLink(),'Refresh output parent must be an actual directory: '+parent);}
  const state=await lstat(resolve(root,path));assert.ok(state.isFile()&&!state.isSymbolicLink(),'Refresh output must be a regular file: '+path);
  assert.ok(state.size<=64*1024*1024,'Refresh output exceeds its byte budget: '+path);return readFile(resolve(root,path));
}
async function changedPaths(root,environment) {
  const run=args=>refreshGit(root,args,{environment});
  const tracked=(await run(['diff','--name-only','-z','HEAD','--'])).split('\0').filter(Boolean);
  const untracked=(await run(['ls-files','--others','--exclude-standard','-z'])).split('\0').filter(Boolean);
  return [...new Set([...tracked,...untracked])].sort();
}
async function fingerprints(root,paths) {
  return new Map(await Promise.all(paths.map(async path=>{try{return [path,refreshSha256(await regularBytes(root,path))];}catch(error){if(error.code==='ENOENT')return [path,null];throw error;}})));
}
async function assertIndexRetention(root,base,environment) {
  for(const [path,key]of [['dist/data/judgment-snapshots/index.json','records'],['dist/data/forecast-ledger/index.json','entries']]){
    const prior=JSON.parse(await refreshGit(root,['show',`${base}:${path}`],{environment})),next=JSON.parse(await readFile(resolve(root,path),'utf8'));
    assert.ok(Array.isArray(prior[key])&&Array.isArray(next[key]),'Immutable journal index is malformed: '+path);
    const records=new Map(next[key].map(record=>[record.id,record]));assert.equal(records.size,next[key].length,'Journal index repeats an existing identity');
    for(const record of prior[key])assert.deepEqual(records.get(record.id),record,'Refresh rewrote or removed an immutable journal index entry: '+record.id);
  }
}

export async function assertMarketRefreshChanges({root,baseSourceCommit,environment=marketRefreshCommandEnvironment(),includeReceipt=false}) {
  assert.equal(await refreshGit(root,['rev-parse','HEAD'],{environment}),baseSourceCommit,'Refresh source moved before validation completed');
  const staged=await refreshGit(root,['diff','--cached','--name-only','-z'],{environment});assert.equal(staged,'','No unrelated staged changes may join a refresh');
  const paths=await changedPaths(root,environment);
  for(const path of paths){
    assert.ok(isMarketRefreshPath(path)&&(includeReceipt||path!==MARKET_REFRESH_RECEIPT_PATH),'Unexpected refresh output: '+path);
    await regularBytes(root,path);
    if(isImmutableMarketRefreshPath(path)){
      const tracked=await refreshGit(root,['ls-tree','--name-only',baseSourceCommit,'--',path],{environment});
      assert.equal(tracked,'','Previously published immutable journal bytes cannot change: '+path);
    }
  }
  await assertIndexRetention(root,baseSourceCommit,environment);return paths;
}

export function assertMarketRefreshEnvironment(environment,{sourceCommit,sourceTree,runtime={node:process.version,platform:process.platform,arch:process.arch}}) {
  assert.deepEqual(runtime,{node:'v24.22.2',platform:'linux',arch:'x64'},'Market refresh requires the canonical Cloudflare runtime');
  assert.equal(environment.WORKERS_CI,'1','Market refresh runs only inside an actual Cloudflare Workers Build');
  assert.equal(required(environment,'WORKERS_CI_COMMIT_SHA'),sourceCommit,'Refresh build event and source checkout differ');
  assert.equal(required(environment,'WORKERS_CI_BRANCH'),'main','Only main may collect and publish scheduled source updates');
  assert.match(sourceCommit,/^[a-f0-9]{40}$/);assert.match(sourceTree,/^[a-f0-9]{40}$/);
  for(const name of ['WORKERS_CI_BUILD_UUID','ATLAS_REFRESH_TRIGGER_UUID'])assert.match(required(environment,name),CLOUDFLARE_BUILD_UUID);
  required(environment,'ATLAS_DATA_GITHUB_TOKEN');required(environment,'ATLAS_BUILDS_READ_TOKEN');required(environment,'CLOUDFLARE_ACCOUNT_ID');
}

async function remoteHead(root,environment,git=refreshGit) {
  const value=await git(root,['ls-remote','--exit-code',MARKET_REFRESH_REMOTE,'refs/heads/main'],{environment});
  assert.match(value,/^[a-f0-9]{40}\s+refs\/heads\/main$/,'Remote main identity is ambiguous');return value.split(/\s/)[0];
}
export async function pushMarketRefreshCommit({root,sourceCommit,baseSourceCommit,environment=process.env,git=refreshGit,timeoutMs=90000}) {
  assert.ok(Number.isFinite(timeoutMs)&&timeoutMs>0&&timeoutMs<=90000,'Push requires a bounded remaining execution budget');
  const deadline=Date.now()+timeoutMs;
  const boundedGit=(directory,args,options={})=>{const remaining=deadline-Date.now();assert.ok(remaining>0,'Refresh push exhausted its remaining execution budget');return git(directory,args,{...options,timeout:Math.min(options.timeout??30000,remaining)});};
  const anonymous=await marketRefreshGitEnvironment(root,{environment});
  assert.match(sourceCommit,/^[a-f0-9]{40}$/);assert.match(baseSourceCommit,/^[a-f0-9]{40}$/);
  assert.equal(await boundedGit(root,['rev-parse','HEAD'],{environment:anonymous}),sourceCommit,'Prepared source moved before push');
  assert.equal(await boundedGit(root,['rev-parse','HEAD^'],{environment:anonymous}),baseSourceCommit,'Prepared source parent differs');
  assert.equal(await remoteHead(root,anonymous,boundedGit),baseSourceCommit,'Remote main changed during validation; a later scheduled build must retry');
  const authenticated=await marketRefreshGitEnvironment(root,{environment,token:required(environment,'ATLAS_DATA_GITHUB_TOKEN')});
  // A race after the check is rejected by this normal fast-forward push.
  // No force flag, merge, rebase, credential URL or implicit clone auth exists.
  await boundedGit(root,['push',MARKET_REFRESH_REMOTE,sourceCommit+':refs/heads/main'],{environment:authenticated,timeout:60000});
  assert.equal(await remoteHead(root,anonymous,boundedGit),sourceCommit,'Remote main did not retain the exact prepared refresh commit');
  return {sourceCommit,remoteBranch:'main',confirmed:true};
}

export async function runCloudflareMarketRefresh({root=defaultRoot,environment=process.env,clock=Date.now,runtime,
  execute=runRefreshCommand,readBuild,bootstrapFormal,push=pushMarketRefreshCommit,log=console.log}={}) {
  root=resolve(root);const clean=await marketRefreshGitEnvironment(root,{environment});
  const baseSourceCommit=await refreshGit(root,['rev-parse','HEAD'],{environment:clean}),baseSourceTree=await refreshGit(root,['rev-parse','HEAD^{tree}'],{environment:clean});
  assertMarketRefreshEnvironment(environment,{sourceCommit:baseSourceCommit,sourceTree:baseSourceTree,runtime});
  assert.equal(await refreshGit(root,['status','--porcelain','--untracked-files=all'],{environment:clean}),'','Refresh requires a clean source checkout');
  const buildId=environment.WORKERS_CI_BUILD_UUID,triggerId=environment.ATLAS_REFRESH_TRIGGER_UUID;
  const reader=readBuild??(id=>createCloudflareBuildReader({accountId:environment.CLOUDFLARE_ACCOUNT_ID,token:environment.ATLAS_BUILDS_READ_TOKEN}).build(id));
  const build=await reader(buildId),context=cloudflareArchiveContextFromBuild({build,buildId,triggerId,sourceCommit:baseSourceCommit,sourceTree:baseSourceTree});
  assert.equal(build.status,'running','Collectors require their actual running Cloudflare Build');
  const startedAt=iso(clock),deadline=Date.parse(startedAt)+marketRefreshRemainingBudget(build,Date.parse(startedAt));
  const attempts=Object.fromEntries(MARKET_REFRESH_PROVIDER_IDS.map(id=>[id,{outcome:'skipped',attemptedAt:null,completedAt:null,retainedPrevious:true,logSha256:null}]));
  const gates=[],logs=resolve(root,'build/cloudflare-refresh-logs');await mkdir(logs,{recursive:true});
  const outcomeFile=resolve(root,'build/cloudflare-refresh-outcomes.json');
  const persistAttempts=()=>writeFile(outcomeFile,marketRefreshReceiptBytes({baseSourceCommit,baseSourceTree,buildId,triggerId,attempts}));
  const remaining=()=>{const value=deadline-clock();assert.ok(value>0,'Refresh exhausted its total 19-minute build budget');return value;};
  let childEnvironment=marketRefreshCommandEnvironment(environment);
  async function run(step) {
    let result;
    try{result=await execute({root,id:step.id,command:step.command,args:[...step.args],environment:childEnvironment,timeoutMs:remaining()});}
    catch{result={code:1,durationMs:0,output:Buffer.from('Child execution could not complete\n')};}
    const output=Buffer.from(result.output??'');assert.ok(output.length<=16*1024*1024,'Refresh command output exceeded its byte budget');
    await writeFile(resolve(logs,step.id+'.log'),output);
    const status=result.code===0&&!result.signal&&!result.timedOut&&!result.tooLarge?'success':'failure';
    const receipt={id:step.id,status,durationMs:result.durationMs,logSha256:refreshSha256(output)};
    assert.ok(Number.isFinite(receipt.durationMs)&&receipt.durationMs>=0);log('ATLAS_REFRESH_STEP '+JSON.stringify(receipt));return receipt;
  }
  try{
    for(const step of MARKET_REFRESH_PROVIDERS){
      const beforePaths=await changedPaths(root,clean),prior=await fingerprints(root,[...new Set([...beforePaths,...step.files])]);
      const originals=new Map(await Promise.all(step.files.map(async path=>[path,await regularBytes(root,path)])));
      const attemptedAt=iso(clock),result=await run(step),completedAt=iso(clock);
      attempts[step.id]={outcome:result.status,attemptedAt,completedAt,retainedPrevious:false,logSha256:result.logSha256};
      await persistAttempts();
      const afterPaths=await changedPaths(root,clean),after=await fingerprints(root,[...new Set([...beforePaths,...afterPaths,...step.files])]);
      for(const [path,digest]of after)if(!step.files.includes(path))assert.equal(digest,prior.get(path)??null,'Provider changed another owner\'s file: '+step.id+' / '+path);
      if(result.status==='failure'){
        for(const [path,bytes]of originals){await writeFile(resolve(root,path),bytes);assert.ok((await regularBytes(root,path)).equals(bytes),'Failed provider did not retain its exact previous bytes');}
        attempts[step.id].retainedPrevious=true;await persistAttempts();
      }
      if(step.required)assert.equal(result.status,'success','Required refresh provider failed: '+step.id);
    }
    for(const step of MARKET_REFRESH_GATES){
      if(step.id==='judgment-capture'&&attempts.comparison.outcome!=='success'){
        gates.push({id:step.id,status:'skipped',durationMs:0,logSha256:refreshSha256('comparison refresh failed; no judgment captured\n')});continue;
      }
      if(step.id==='formal'){
        let formal;
        if(bootstrapFormal)formal=await bootstrapFormal({root,log,timeoutMs:Math.min(180000,remaining())});
        else{
          // Run the verified installer in the same sanitized child environment;
          // its Java/curl/tar probes must never inherit a repository write token.
          const installed=await run({id:'formal-runtime',command:'node',args:['scripts/bootstrap-cloudflare-build.mjs','--formal']});
          assert.equal(installed.status,'success','Rootless formal runtime installation failed');
          const receipt=JSON.parse(await readFile(resolve(root,'build/cloudflare-preflight.json'),'utf8'));
          formal={receipt,environment:{JAVA:receipt.java?.path,TLA2TOOLS:receipt.tlc?.path}};
        }
        assert.equal(formal.receipt?.gateStatus,'FORMAL_TOOLS_READY','Formal tools were not actually verified');
        assert.ok(formal.environment.JAVA&&formal.environment.TLA2TOOLS,'Formal tool paths are required');
        childEnvironment={...childEnvironment,JAVA:formal.environment.JAVA,TLA2TOOLS:formal.environment.TLA2TOOLS};
      }
      const result=await run(step);gates.push(result);assert.equal(result.status,'success','Required refresh gate failed: '+step.id);
    }
    assert.deepEqual(gates.map(gate=>gate.id),MARKET_REFRESH_GATE_IDS);
    const paths=await assertMarketRefreshChanges({root,baseSourceCommit,environment:clean});
    const outputPaths=[...new Set([...MARKET_REFRESH_MUTABLE_PATHS,...paths])].sort();
    const files=await Promise.all(outputPaths.map(async path=>{const bytes=await regularBytes(root,path);return {path,sha256:refreshSha256(bytes),bytes:bytes.length};}));
    const receipt=assertMarketRefreshReceipt({schemaVersion:1,kind:'atlas-market-refresh',status:'VALIDATED',provider:'cloudflare-workers-builds',repository:MARKET_REFRESH_REPOSITORY,branch:'main',
      baseSourceCommit,baseSourceTree,buildId,triggerId,eventName:context.eventName,startedAt,completedAt:iso(clock),attempts,gates,files});
    const receiptBytes=marketRefreshReceiptBytes(receipt);await writeFile(resolve(root,MARKET_REFRESH_RECEIPT_PATH),receiptBytes);
    const stagePaths=await assertMarketRefreshChanges({root,baseSourceCommit,environment:clean,includeReceipt:true});
    await refreshGit(root,['add','--',...stagePaths],{environment:clean});
    const staged=(await refreshGit(root,['diff','--cached','--name-only','-z'],{environment:clean})).split('\0').filter(Boolean).sort();
    assert.deepEqual(staged,stagePaths,'Staged refresh paths differ from the validated allowlist');
    for(const file of files){const bytes=await regularBytes(root,file.path);assert.equal(refreshSha256(bytes),file.sha256,'Validated output changed before commit: '+file.path);}
    assert.ok((await regularBytes(root,MARKET_REFRESH_RECEIPT_PATH)).equals(receiptBytes),'Refresh receipt changed before commit');
    await refreshGit(root,['-c','user.name=Atlas data refresh','-c','user.email=atlas-data-refresh@users.noreply.github.com','commit','-m','data: refresh validated completed crypto and equity observations'],{environment:clean});
    const sourceCommit=await refreshGit(root,['rev-parse','HEAD'],{environment:clean});
    assert.equal(await refreshGit(root,['rev-parse','HEAD^'],{environment:clean}),baseSourceCommit,'Refresh created an unrelated source parent');
    assert.equal(await refreshGit(root,['status','--porcelain','--untracked-files=all'],{environment:clean}),'','Refresh commit left unreviewed working-tree changes');
    const pushed=await push({root,sourceCommit,baseSourceCommit,environment,timeoutMs:Math.min(90000,remaining())});assert.equal(pushed.sourceCommit,sourceCommit);assert.equal(pushed.confirmed,true);
    const result={schemaVersion:1,kind:'atlas-market-refresh-result',status:'SOURCE_COMMITTED',baseSourceCommit,baseSourceTree,sourceCommit,buildId,triggerId,receiptSha256:refreshSha256(receiptBytes),confirmedAt:iso(clock),
      deployment:'Separate production build must verify and deploy this exact new source commit'};
    await writeFile(resolve(root,MARKET_REFRESH_RESULT_PATH),marketRefreshReceiptBytes(result));log('ATLAS_MARKET_REFRESH_COMMITTED '+JSON.stringify(result));return result;
  }catch(error){
    await persistAttempts();await writeFile(resolve(root,'build/cloudflare-market-refresh-failure.json'),marketRefreshReceiptBytes({status:'FAILED',baseSourceCommit,baseSourceTree,buildId,triggerId,attempts,gates,failedAt:iso(clock)}));
    throw error;
  }
}

export async function confirmMarketRefreshCommit({root=defaultRoot,environment=process.env,readRemote=remoteHead}={}) {
  const clean=await marketRefreshGitEnvironment(root,{environment}),result=JSON.parse(await readFile(resolve(root,MARKET_REFRESH_RESULT_PATH),'utf8'));
  assert.equal(result.status,'SOURCE_COMMITTED');assert.equal(result.baseSourceCommit,required(environment,'WORKERS_CI_COMMIT_SHA'));
  assert.equal(result.buildId,required(environment,'WORKERS_CI_BUILD_UUID'));assert.equal(result.triggerId,required(environment,'ATLAS_REFRESH_TRIGGER_UUID'));
  assert.equal(environment.WORKERS_CI,'1');assert.equal(environment.WORKERS_CI_BRANCH,'main');
  assert.equal(await refreshGit(root,['rev-parse','HEAD'],{environment:clean}),result.sourceCommit);
  assert.equal(await refreshGit(root,['rev-parse','HEAD^'],{environment:clean}),result.baseSourceCommit);
  assert.equal(await refreshGit(root,['status','--porcelain','--untracked-files=all'],{environment:clean}),'');
  const bytes=await regularBytes(root,MARKET_REFRESH_RECEIPT_PATH),receipt=assertMarketRefreshReceipt(JSON.parse(bytes));
  assert.equal(refreshSha256(bytes),result.receiptSha256);assert.equal(receipt.buildId,result.buildId);assert.equal(receipt.baseSourceCommit,result.baseSourceCommit);
  assert.equal(await readRemote(root,clean),result.sourceCommit,'Prepared source was superseded before refresh build completion');return result;
}

if(resolve(process.argv[1]??'')===fileURLToPath(import.meta.url)){
  try{
    const args=process.argv.slice(2);assert.ok(args.length===0||args.length===1&&args[0]==='--confirm-commit','Supported option: --confirm-commit');
    if(args.length)console.log('ATLAS_MARKET_REFRESH_CONFIRMED '+JSON.stringify(await confirmMarketRefreshCommit()));else await runCloudflareMarketRefresh();
  }catch(error){console.error('Cloudflare market refresh failed: '+(error instanceof Error?error.message:'unknown error'));process.exitCode=1;}
}
