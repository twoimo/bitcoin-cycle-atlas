import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { readFile, writeFile, mkdir, mkdtemp, cp, rm } from 'node:fs/promises';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import { verificationProcessResult } from './verification-process.mjs';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const tool=process.env.TLA2TOOLS || join(root,'build/formal-tools/tla2tools-1.7.4.jar');
const toolSha='936a262061c914694dfd669a543be24573c45d5aa0ff20a8b96b23d01e050e88';
const hash=value=>createHash('sha256').update(value).digest('hex');
let bytes;
try{bytes=await readFile(tool);}catch(error){
  if(error.code!=='ENOENT'||process.env.TLA2TOOLS)throw error;
  const res=await fetch('https://github.com/tlaplus/tlaplus/releases/download/v1.7.4/tla2tools.jar',{signal:AbortSignal.timeout(60000)});
  if(!res.ok)throw new Error(`TLC HTTP ${res.status}`);bytes=Buffer.from(await res.arrayBuffer());
  assert.equal(hash(bytes),toolSha);await mkdir(dirname(tool),{recursive:true});await writeFile(tool,bytes);
}
assert.equal(hash(bytes),toolSha,'Pinned TLC 1.7.4 checksum');
function run(command,args,cwd=root,expectedStatus=0){const result=spawnSync(command,args,{cwd,encoding:'utf8',timeout:60000,maxBuffer:8*1024*1024});const checked=verificationProcessResult(result,{command,expectedStatus});return {status:checked.status,text:checked.output};}
function checkTap(result,fails=false){
  const count=name=>Number(result.text.match(new RegExp(`^# ${name} (\\d+)$`,'m'))?.[1]);
  assert.equal(count('tests'),5,'All five real product cases must execute');
  for(const name of ['skipped','cancelled','todo'])assert.equal(count(name),0);
  assert.equal(count('pass')+count('fail'),5);
  if(fails){assert.equal(result.status,1,'A real Node assertion failure must exit with 1');assert(count('fail')>0);}else{assert.equal(result.status,0,result.text);assert.equal(count('fail'),0);assert.equal(count('pass'),5);}
}
const work=await mkdtemp(join(tmpdir(),'atlas-publication-proof-'));
try{
  const model=[];
  for(const [config,invariant] of [['Publication',null],['stale-source','PreparedRevisionMatches'],['changed-files','PreparedContentMatches'],['served-mismatch','ConfirmedIdentityMatches']]){
    const javaTmp=join(work,config+'-java');await mkdir(javaTmp,{recursive:true});
    const result=run(process.env.JAVA||'java',['-XX:+UseParallelGC','-Xmx256m',`-Djava.io.tmpdir=${javaTmp}`,'-cp',tool,'tlc2.TLC','-workers','1','-seed','1','-fp','0','-metadir',join(work,config),'-config',join(root,'verification/publication-state',config+'.cfg'),join(root,'verification/publication-state/Publication.tla')],root,invariant?12:0);
    if(invariant){assert.equal(result.status,12,'TLC must finish with its invariant-violation exit status');assert(result.text.includes(`Invariant ${invariant} is violated`),result.text);}else{assert.equal(result.status,0,result.text);assert.match(result.text,/Model checking completed\. No error has been found\./);}
    const count=result.text.match(/([\d,]+) states generated, ([\d,]+) distinct states found, ([\d,]+) states left on queue/);assert(count,'TLC must report state counts');
    model.push({config,invariant,status:invariant?'expected invariant violation':'pass',exitStatus:result.status,generatedStates:Number(count[1].replaceAll(',','')),distinctStates:Number(count[2].replaceAll(',','')),remaining:Number(count[3].replaceAll(',',''))});
  }
  const copy=join(work,'product');await mkdir(join(copy,'dist'),{recursive:true});await mkdir(join(copy,'tests'));
  await cp(join(root,'dist/publication-contract.js'),join(copy,'dist/publication-contract.js'));
  await cp(join(root,'tests/publication-contract.test.mjs'),join(copy,'tests/publication-contract.test.mjs'));
  await writeFile(join(copy,'package.json'),'{"type":"module"}\n');
  const args=['--test','--test-reporter=tap','tests/publication-contract.test.mjs'];
  checkTap(run(process.execPath,args,copy));
  const source=await readFile(join(copy,'dist/publication-contract.js'),'utf8'),mutations=[];
  for(const [guard,testName] of [
    ["if (currentCommit!==state.sourceCommit) return Object.freeze({...state,phase:'superseded',reason:'source-changed'});",'source change supersedes'],
    ["if (currentDigest!==state.digest || state.validatedDigest!==state.digest) return Object.freeze({...state,phase:'held',reason:'content-changed'});",'changed files cannot pass'],
    ["if (servedCommit!==state.sourceCommit || servedDigest!==state.digest) return Object.freeze({...state,phase:'held',reason:'served-content-mismatch'});",'a successful deploy API result'],
  ]){
    assert.equal(source.split(guard).length,2,'Guard changed; recheck model mapping');
    const mutated=source.replace(guard,'');await writeFile(join(copy,'dist/publication-contract.js'),mutated);
    const failed=run(process.execPath,args,copy,1);checkTap(failed,true);assert.match(failed.text,new RegExp('not ok \\d+ - '+testName),'Mutation must fail its matching behavioral test');
    mutations.push({guard:testName,sha256:hash(mutated),outcome:'expected assertion failure',exitStatus:failed.status});
  }
  await writeFile(join(copy,'dist/publication-contract.js'),source);checkTap(run(process.execPath,args,copy));
  const modelSources={};for(const file of ['Publication.tla','Publication.cfg','stale-source.cfg','changed-files.cfg','served-mismatch.cfg','Publication.map.mjs'])modelSources[file]=hash(await readFile(join(root,'verification/publication-state',file)));
  const receipt={status:'PASS',tool:{name:'TLC',version:'1.7.4',sha256:toolSha},modelSources,model,implementation:{tests:5,sourceSha256:hash(source),mutations,restored:'pass'},
    scope:'One candidate; two source/file identities; deterministic preparation and served-response guards. No claim about GitHub scheduling, remote recovery, file-system transactions, cryptographic authenticity, or forecast accuracy.'};
  if(process.argv[2]){const target=resolve(process.argv[2]);await mkdir(dirname(target),{recursive:true});await writeFile(target,JSON.stringify(receipt,null,2)+'\n');}
  console.log(JSON.stringify(receipt,null,2));
}finally{await rm(work,{recursive:true,force:true});}
