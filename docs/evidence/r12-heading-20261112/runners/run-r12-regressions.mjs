#!/usr/bin/env node
// Task-local orchestration only. Existing committed browser harnesses run unchanged.
import assert from 'node:assert/strict';
import {spawn, execFileSync} from 'node:child_process';
import {createWriteStream} from 'node:fs';
import {readFile, mkdir, writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {resolve} from 'node:path';

const root = '/workspace/scratch/15a50edfd7d0/bitcoin-cycle-atlas';
const runtime = '/workspace/scratch/55a6bfaf803b/conference-tools/node-v24.22.2-linux-x64/bin/node';
const defaultBrowser = '/workspace/scratch/55a6bfaf803b/conference-tools/chrome-with-proxy';
const [expectedHead, output = 'build/r12-regressions'] = process.argv.slice(2);
assert.match(expectedHead || '', /^[a-f0-9]{40}$/, 'Usage: node run-r12-regressions.mjs FULL_COMMITTED_HEAD [build/output]');
assert.match(output, /^build\/[a-zA-Z0-9._/-]+$/);
assert.ok(!output.split('/').includes('..'));
const out = resolve(root, output), browser = process.env.ATLAS_BROWSER_PATH || defaultBrowser;
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const git = args => execFileSync('git', args, {cwd:root,encoding:'utf8'}).trim();
const nodeVersion = execFileSync(runtime, ['--version'], {encoding:'utf8'}).trim();
assert.equal(nodeVersion, 'v24.22.2');
const paths = [
  'dist/ui/page-description.js', 'dist/atlas-shell.css', 'dist/btc-refresh-status.js', 'scripts/verify-page-heading-browser.mjs',
  'scripts/verify-native-browser-suite.mjs', 'scripts/verify-eth-candidate-browser.mjs',
  'scripts/verify-responsive-workbench-browser.mjs', 'scripts/verify-wp6-browser.mjs',
  'scripts/verify-wp6-cloudflare.mjs', 'scripts/verify-chart-qa-metrics.mjs',
  'docs/evidence/chart-h1-20261112/r10-browser-gates.mjs',
];
const snapshot = async () => {
  assert.equal(git(['rev-parse','HEAD']), expectedHead, 'Source HEAD changed');
  git(['diff','--exit-code','HEAD','--','dist','scripts','tests']);
  return {
    head:git(['rev-parse','HEAD']), tree:git(['rev-parse','HEAD^{tree}']),
    files:Object.fromEntries(await Promise.all(paths.map(async path => [path,hash(await readFile(resolve(root,path)))]))),
  };
};
await mkdir(out, {recursive:true});
const report = {
  kind:'r12-existing-browser-regressions', startedAt:new Date().toISOString(), status:'running',
  expectedHead, runtime, nodeVersion, platform:process.platform, arch:process.arch,
  browser:{path:browser, launcherSha256:hash(await readFile(browser))},
  scope:'Task-local checked-out static site. No deployment or account changes. Existing test thresholds unchanged.',
  before:await snapshot(), executions:[],
};
const save = () => writeFile(resolve(out,'execution-summary.json'), JSON.stringify(report,null,2)+'\n');
await save();
let current;
function stop(signal='SIGTERM') {if(current?.pid)try{process.kill(-current.pid,signal);}catch{}}
for(const signal of ['SIGTERM','SIGINT'])process.once(signal,()=>{stop(signal);process.exitCode=1;});
const baseEnv = {
  ...process.env,
  PATH:'/Applications/Docker.app/Contents/Resources/bin:/workspace/scratch/55a6bfaf803b/conference-tools/node-v24.22.2-linux-x64/bin:'+process.env.PATH,
  ATLAS_BROWSER_PATH:browser,
  ETH_BROWSER_IMAGE_LOG_MODE:'failures-only',
};
// The suite creates its own run nonce and child lanes; do not inherit an old one.
delete baseEnv.ATLAS_BROWSER_LANE;
delete baseEnv.ATLAS_BROWSER_SUITE_RUN_ID;
async function run(name,args,env,nativePath) {
  assert.deepEqual(await snapshot(),report.before,'Source changed before '+name);
  const entry={name,command:[runtime,...args],startedAt:new Date().toISOString(),status:'running',log:name+'.log'};
  report.executions.push(entry);await save();
  const stream=createWriteStream(resolve(out,entry.log));
  console.log(JSON.stringify({event:'start',name,command:entry.command,log:resolve(out,entry.log)}));
  current=spawn(runtime,args,{cwd:root,env:{...baseEnv,...env},detached:true,stdio:['ignore','pipe','pipe']});
  const child=current;
  let spawnError=null;
  child.once('error',error=>{spawnError=String(error);});
  // Full native output stays in the log; only progress facts reach the console.
  for(const input of [child.stdout,child.stderr]) {
    let buffer='';
    input.on('data',bytes=>{
      stream.write(bytes);buffer+=bytes.toString();
      let position;
      while((position=buffer.indexOf('\n'))>=0) {
        const line=buffer.slice(0,position);buffer=buffer.slice(position+1);
        if(line.startsWith('ETH_BROWSER_RECEIPT ') || line.startsWith('ETH_BROWSER_LANE_RECEIPT ') ||
          line.startsWith('ETH_BROWSER_FAST_CADENCE_RELEASE ') || /"event":"(?:gate-start|gate-end|bundle-end)"/.test(line)) console.log(line);
      }
    });
  }
  const result=await new Promise(accept=>child.once('close',(code,signal)=>accept({code,signal})));
  current=null;
  await new Promise(accept=>stream.end(accept));
  entry.finishedAt=new Date().toISOString();entry.durationMs=Date.parse(entry.finishedAt)-Date.parse(entry.startedAt);
  entry.exitCode=result.code;entry.signal=result.signal;entry.spawnError=spawnError;
  const logBytes=await readFile(resolve(out,entry.log));entry.logBytes=logBytes.length;entry.logSha256=hash(logBytes);
  try {
    const bytes=await readFile(resolve(root,nativePath)),native=JSON.parse(bytes);
    entry.report={file:nativePath,bytes:bytes.length,sha256:hash(bytes),status:native.status};
    if(name==='native-53') {
      entry.counts={executed:native.cases?.length||0,passed:(native.cases||[]).filter(x=>x.status==='passed').length,failed:(native.cases||[]).filter(x=>x.status==='failed').length};
      entry.failures=native.failures;entry.nativeError=native.error||null;
      entry.passed=result.code===0&&native.status==='passed'&&entry.counts.executed===53&&entry.counts.passed===53;
    } else {
      entry.gates=(native.gates||[]).map(x=>({id:x.id,expectedCases:x.expectedCases,actualCases:x.actualCases,status:x.status,exit:x.exit,verifiedScreenshots:x.verifiedScreenshots,failures:x.failures,error:x.error}));
      entry.passed=result.code===0&&native.status==='passed'&&entry.gates.length===6&&entry.gates.every(x=>x.status==='passed');
    }
  }catch(error){entry.reportReadError=String(error);entry.passed=false;}
  entry.after=await snapshot();assert.deepEqual(entry.after,report.before,'Source changed during '+name);
  entry.status=entry.passed?'passed':'failed';await save();
  console.log(JSON.stringify({event:'finish',name,status:entry.status,exitCode:entry.exitCode,counts:entry.counts,gates:entry.gates}));
}
try {
  await run('native-53',['scripts/verify-native-browser-suite.mjs'],{
    ATLAS_BROWSER_OUT:resolve(out,'native-53'),ATLAS_BROWSER_CASE_SCOPE:'all',
  },output+'/native-53/report.json');
  await run('r10',['docs/evidence/chart-h1-20261112/r10-browser-gates.mjs',root,expectedHead,output+'/r10'],{},output+'/r10/summary.json');
  report.after=await snapshot();assert.deepEqual(report.after,report.before);
  report.status=report.executions.length===2&&report.executions.every(x=>x.status==='passed')?'passed':'failed';
}catch(error){report.status='failed';report.error=String(error.stack||error);}
finally {
  stop('SIGKILL');report.finishedAt=new Date().toISOString();
  report.durationMs=Date.parse(report.finishedAt)-Date.parse(report.startedAt);await save();
  console.log(JSON.stringify({event:'complete',status:report.status,out,error:report.error}));
  process.exitCode=report.status==='passed'?0:1;
}
