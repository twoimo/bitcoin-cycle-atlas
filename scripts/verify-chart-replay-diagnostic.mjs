// Supplementary real-Chrome diagnosis for the chart-replay review branch.
// This never qualifies a release; canonical model/browser gates remain required.
import assert from "node:assert/strict";
import {readFile,writeFile,rm,mkdir} from "node:fs/promises";
import {execFileSync} from "node:child_process";
import {randomUUID,createHash} from "node:crypto";
import {getPriority} from "node:os";
import {resolve} from "node:path";
import {bootstrapCloudflareBuild,runRuntimeCommand} from "./bootstrap-cloudflare-build.mjs";
import {readBrowserSourceIdentity} from "./browser-source-identity.mjs";
import {readBrowserBuildSource} from "./cloudflare-browser-source.mjs";
import {createEthBrowserCaseSpecs,selectEthBrowserCaseSpecs} from "./eth-browser-case-specs.mjs";
import {cloudflareStagedPlanSha256,cloudflareStagedPolicy} from "./cloudflare-staged-contract.mjs";
import {emitCompressedBrowserReport} from "./browser-evidence-transport.mjs";
const argv=process.argv.slice(2);
assert.equal(argv.length,2);
const options=Object.fromEntries(argv.map(value=>{const match=/^--(expected-source|expected-tree)=([a-f0-9]{40})$/.exec(value);assert.ok(match,"Two exact immutable source arguments are required");return [match[1],match[2]];}));
assert.deepEqual(Object.keys(options).sort(),["expected-source","expected-tree"]);
const root=process.cwd(),branch="fix/hype-price-axis-markers-20261108",scope="chart-replay";
const expectedSource=options["expected-source"],expectedTree=options["expected-tree"];
assert.equal(process.env.WORKERS_CI,"1");
assert.equal(process.env.WORKERS_CI_COMMIT_SHA,expectedSource,"The actual provider must supply the exact source SHA");
assert.equal(process.env.WORKERS_CI_BRANCH,branch);
assert.match(process.env.WORKERS_CI_BUILD_UUID??"",/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/);
assert.equal(process.env.ATLAS_VERIFICATION_STAGE,undefined);
assert.equal(process.env.ATLAS_BROWSER_LANE,undefined);
assert.equal(process.env.ATLAS_BROWSER_SUITE_RUN_ID,undefined);
assert.equal(getPriority(),0,"Diagnostic CPU priority must remain unchanged");
assert.equal(cloudflareStagedPolicy.maximumExecutionMs,1140000);
assert.equal(cloudflareStagedPlanSha256,"c7ef8e7921f0d9235ceeec910efafd21d092d48f96d2f77ee7e3e50932f1cfbd");
const selected=selectEthBrowserCaseSpecs(scope);
assert.equal(createEthBrowserCaseSpecs().length,53);
assert.equal(selected.length,7);
const source=await readBrowserSourceIdentity(root);
assert.equal(source.sourceCommit,expectedSource);
assert.equal(source.sourceTree,expectedTree);
const providerSource=readBrowserBuildSource({root,mode:"review",source});
assert.equal(providerSource.refKind,"commit");
function currentRemoteHead(){const ref="refs/heads/"+branch;const rows=execFileSync("git",["ls-remote","--exit-code","--refs","https://github.com/twoimo/bitcoin-cycle-atlas.git",ref],{cwd:root,encoding:"utf8",stdio:["ignore","pipe","pipe"],timeout:30000}).trim().split("\n");assert.equal(rows.length,1);const parts=rows[0].split(/\s+/);assert.deepEqual(parts,[expectedSource,ref]);return parts[0];}
const remoteHead=currentRemoteHead(),suiteRunId=randomUUID(),out="build/replay-focused-diagnostic",reportPath=resolve(root,out,"report.json");
const deadline=Date.now()+cloudflareStagedPolicy.maximumExecutionMs,remaining=()=>{const ms=deadline-Date.now();assert.ok(ms>1000,"The unchanged diagnostic execution budget expired");return ms;};
const log=text=>process.stdout.write(text);
console.log("ATLAS_BROWSER_REPLAY_FOCUSED_INPUT "+JSON.stringify({qualifiesFullVerification:false,sourceCommit:source.sourceCommit,sourceTree:source.sourceTree,providerSource,remoteHead,suiteRunId,caseScope:scope,declaredCaseCount:53,expectedCaseCount:7,cases:selected,planSha256:cloudflareStagedPlanSha256}));
await rm(reportPath,{force:true});
let result=null,runtimeError=null,bytes=null,report=null,transport=null,reportError=null;
try{
const runtime=await bootstrapCloudflareBuild({root,log,timeoutMs:Math.min(480000,remaining())});
console.log("ATLAS_BROWSER_REPLAY_FOCUSED_RUNTIME "+JSON.stringify(runtime.receipt));
result=await runRuntimeCommand(process.execPath,["scripts/verify-eth-candidate-browser.mjs"],{cwd:root,env:{...process.env,...runtime.environment,ATLAS_BROWSER_CASE_SCOPE:scope,ATLAS_BROWSER_LANE:scope,ATLAS_BROWSER_SUITE_RUN_ID:suiteRunId,ATLAS_BROWSER_OUT:out,ETH_BROWSER_IMAGE_LOG_MODE:"representative"},timeout:Math.min(900000,remaining()),log,allowFailure:true});
}catch(error){runtimeError=error;}
try{
bytes=await readFile(reportPath);
transport=emitCompressedBrowserReport(bytes,{name:"report.json",log:line=>log(line+"\n")});
report=JSON.parse(bytes.toString("utf8"));
}catch(error){reportError=error;}
let validationError=null;
try{
if(runtimeError)throw runtimeError;
if(reportError)throw reportError;
assert.equal(report.sourceCommit,expectedSource);assert.equal(report.sourceTree,expectedTree);
assert.equal(report.lane,scope);assert.equal(report.caseScope,scope);assert.equal(report.suiteRunId,suiteRunId);
assert.equal(report.declaredCaseCount,53);assert.equal(report.expectedCaseCount,7);
assert.deepEqual(report.cases.map(item=>item.caseSpec),selected);
assert.equal(result.code,0,"The unchanged native verifier failed");
assert.equal(result.signal,null);assert.equal(report.status,"passed");assert.deepEqual(report.failures,[]);
assert.ok(report.cases.every(item=>item.status==="passed"));assert.equal(report.sourceIntegrity.unchangedDuringRun,true);
assert.deepEqual(report.sourceIntegrity.changedSources,[]);assert.equal(report.fastCadence.status,"passed");
assert.equal(report.fastCadence.restored,true);
assert.deepEqual(await readBrowserSourceIdentity(root),source);
assert.deepEqual(readBrowserBuildSource({root,mode:"review",source}),providerSource);
assert.equal(currentRemoteHead(),expectedSource);
remaining();
}catch(error){validationError=error;}
const cases=Array.isArray(report?.cases)?report.cases:null;
const diagnostic={schemaVersion:1,kind:"atlas-replay-focused-diagnostic",qualifiesFullVerification:false,productionDeployed:false,status:validationError?"FAIL":"PASS",nativeStatus:report?.status??null,sourceCommit:expectedSource,sourceTree:expectedTree,providerBuildUuid:process.env.WORKERS_CI_BUILD_UUID,providerSource,suiteRunId,caseScope:scope,declaredCaseCount:53,expectedCaseCount:7,completedCaseCount:cases?.length??null,passed:cases?.filter(item=>item?.status==="passed").length??null,failed:cases?.filter(item=>item?.status==="failed").length??null,commandExitCode:result?.code??null,commandSignal:result?.signal??null,report:bytes?{file:out+"/report.json",bytes:bytes.length,sha256:createHash("sha256").update(bytes).digest("hex"),transport}:null,fastCadence:report?.fastCadence??null,...(runtimeError?{runtimeError:String(runtimeError.stack??runtimeError)}:{}),...(reportError?{reportError:String(reportError.stack??reportError)}:{}),...(validationError?{error:String(validationError.stack??validationError)}:{}),scope:"Partial real-Chrome diagnosis only; canonical model13/browser12/native53 are still required."};
try{
await mkdir(resolve(root,out),{recursive:true});
await writeFile(resolve(root,out,"diagnostic.json"),JSON.stringify(diagnostic,null,2)+"\n");
}catch(error){diagnostic.status="FAIL";diagnostic.evidenceWriteError=String(error.stack??error);validationError??=error;}
console.log("ATLAS_BROWSER_REPLAY_FOCUSED_DIAGNOSTIC "+JSON.stringify(diagnostic));
if(validationError)throw validationError;
