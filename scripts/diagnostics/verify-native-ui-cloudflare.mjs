#!/usr/bin/env node
// Supplementary recheck of the existing non-chart-replay lane. This never
// deploys, qualifies a publication, or changes the canonical 53-case inventory.
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {bootstrapCloudflareBuild,runRuntimeCommand} from '../bootstrap-cloudflare-build.mjs';
import {cloudflareRuntime} from '../cloudflare-build-contract.mjs';

const root=fileURLToPath(new URL('../..',import.meta.url));
const expected=process.argv[2],out=resolve(root,'build/native-ui-recheck');
const started=Date.now(),deadline=started+19*60*1000;
const remaining=()=>{const value=deadline-Date.now();assert.ok(value>1000,'Native UI diagnostic budget exhausted');return value;};
const log=text=>process.stdout.write(text);
const receipt={kind:'atlas-supplementary-native-ui-recheck',status:'RUNNING',scope:'non-chart-replay',
  expectedSourceCommit:expected,expectedCaseCount:46,qualifiesFullVerification:false,productionDeployment:false,
  providerBuildUuid:process.env.WORKERS_CI_BUILD_UUID??null,startedAt:new Date(started).toISOString()};
try{
  assert.equal(process.argv.length,3,'Pass the exact expected source commit');
  assert.match(expected??'',/^[a-f0-9]{40}$/);
  assert.equal(process.version,cloudflareRuntime.node);
  await mkdir(out,{recursive:true});
  receipt.sourceCommit=(await runRuntimeCommand('git',['rev-parse','HEAD'],{cwd:root,timeout:15000})).output.trim();
  assert.equal(receipt.sourceCommit,expected,'Native diagnostic checkout differs from the requested source');
  console.log('ATLAS_NATIVE_UI_RECHECK_START '+JSON.stringify(receipt));
  const runtime=await bootstrapCloudflareBuild({root,timeoutMs:Math.min(8*60*1000,remaining()),log});
  const env={...process.env,...runtime.environment,ATLAS_BROWSER_CASE_SCOPE:'non-chart-replay',
    ETH_BROWSER_IMAGE_LOG_MODE:'failures-only',ATLAS_BROWSER_OUT:'build/native-ui-recheck'};
  await runRuntimeCommand('npm',['ci','--no-audit','--no-fund'],{cwd:root,env,timeout:Math.min(3*60*1000,remaining()),log});
  const run=await runRuntimeCommand(process.execPath,['scripts/verify-eth-candidate-browser.mjs'],{
    cwd:root,env,timeout:Math.min(15*60*1000,remaining()),log,allowFailure:true});
  const bytes=await readFile(resolve(out,'report.json')),report=JSON.parse(bytes);
  receipt.report={bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex'),status:report.status,
    sourceCommit:report.sourceCommit,sourceTree:report.sourceTree,caseScope:report.caseScope,
    expectedCaseCount:report.expectedCaseCount,cases:report.cases.length,passed:report.cases.filter(c=>c.status==='passed').length,
    failures:report.cases.filter(c=>c.status!=='passed').map(({page,width,height,error})=>({page,width,height,error}))};
  assert.equal(report.sourceCommit,expected);
  assert.equal(report.caseScope,'non-chart-replay');
  assert.equal(report.expectedCaseCount,46);assert.equal(report.cases.length,46);
  assert.equal(report.status,'passed');assert.equal(receipt.report.passed,46);
  assert.equal(run.code,0,'Native UI diagnostic process failed');
  receipt.status='PASS';
}catch(error){receipt.status='FAIL';receipt.error=String(error.stack??error);process.exitCode=1;}
finally{
  receipt.finishedAt=new Date().toISOString();receipt.durationMs=Date.now()-started;
  await mkdir(out,{recursive:true});await writeFile(resolve(out,'diagnostic.json'),JSON.stringify(receipt,null,2)+'\n');
  console.log('ATLAS_NATIVE_UI_RECHECK_RESULT '+JSON.stringify(receipt));
}
