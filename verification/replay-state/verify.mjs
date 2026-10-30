import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {mkdtemp,mkdir,readFile,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root=fileURLToPath(new URL('../../',import.meta.url));
const sourcePath='dist/chart-replay-state.js',testPath='tests/chart-replay-state.test.mjs';
const source=await readFile(path.join(root,sourcePath),'utf8');
const tests=await readFile(path.join(root,testPath),'utf8');
const hash=value=>createHash('sha256').update(value).digest('hex');
const expectedTests=14;

function check(cwd,{broken=false,expectedFailure}={}){
  const run=spawnSync(process.execPath,['--test-reporter=tap',testPath],{
    cwd,encoding:'utf8',timeout:30000,maxBuffer:4*1024*1024,
  });
  assert.equal(run.error,undefined,'A process failure is not a rejected mutation');
  assert.equal(run.signal,null,'The verifier must finish normally');
  assert.equal(run.status,broken?1:0,run.stdout+'\n'+run.stderr);
  const count=name=>Number(run.stdout.match(new RegExp('^# '+name+' (\\d+)$','m'))?.[1]);
  assert.equal(count('tests'),expectedTests,'The named controller tests must all execute');
  for(const name of ['cancelled','skipped','todo'])assert.equal(count(name),0,'No '+name+' cases may qualify as verification');
  assert.equal(count('pass')+count('fail'),expectedTests);
  if(broken){
    assert.ok(count('fail')>0,'The mutation must cause a behavioral assertion failure');
    assert.match(run.stdout,new RegExp('not ok \\d+ - '+expectedFailure),'The intended behavior did not reject the mutation');
    assert.match(run.stdout,/ERR_ASSERTION/,'An import or syntax failure is not a behavioral rejection');
  }else assert.equal(count('fail'),0);
  return {status:broken?'expected behavioral failure':'pass',tests:count('tests'),passed:count('pass'),
    failed:count('fail'),skipped:count('skipped'),exitStatus:run.status};
}

const mutations=[
  {name:'unguarded-session-completion',
    before:'return !destroyed&&state.generation===generation&&request===owner&&!owner.signal.aborted;',after:'return true;',
    expectedFailure:'superseded origin success and failure cannot replace the current chart'},
  {name:'unguarded-timer-generation',
    before:'generation!==state.generation||owned!==timerGeneration||state.status',after:'generation!==state.generation||state.status',
    expectedFailure:'a timer callback can never be replayed twice or after pause, exit or a new origin'},
  {name:'mutable-session-output',before:'return freeze(session);',after:'return session;',
    expectedFailure:'main replay loads a fixed branded object and keeps it through forward, reverse and restart'},
];
const results={original:check(root),mutations:{}};
const scratch=await mkdtemp(path.join(tmpdir(),'atlas-replay-state-'));
try{
  await mkdir(path.join(scratch,'dist'));await mkdir(path.join(scratch,'tests'));
  await writeFile(path.join(scratch,'package.json'),'{"type":"module"}\n');
  await writeFile(path.join(scratch,testPath),tests);
  for(const mutation of mutations){
    assert.equal(source.split(mutation.before).length,2,'Mutation selector drifted: '+mutation.name);
    const mutated=source.replace(mutation.before,mutation.after);
    await writeFile(path.join(scratch,sourcePath),mutated);
    results.mutations[mutation.name]={...check(scratch,{broken:true,expectedFailure:mutation.expectedFailure}),sourceSha256:hash(mutated)};
  }
  await writeFile(path.join(scratch,sourcePath),source);
  results.restored=check(scratch);
}finally{await rm(scratch,{recursive:true,force:true});}
const receipt={kind:'atlas-replay-state-verification',schemaVersion:1,
  baselineCommit:'fec62fc3c6bddee1d892efab01938102ad780b11',
  node:process.version,sourcePath,sourceSha256:hash(source),testPath,testSha256:hash(tests),
  method:'Execute actual JavaScript controller; exhaustive finite command traces plus targeted async ownership cases and isolated real-source negative controls',
  bounds:{playbackCommands:10,maxTraceLength:4,traces:10000,playbackBars:3,asyncLoads:2},
  formalProof:false,modelCheckerRun:false,
  excluded:['Unlimited trace lengths','Browser DOM and event wiring','Forecast mathematics','Network completion fairness','Wall-clock scheduling accuracy'],
  ...results};
if(process.argv[2]){
  const destination=path.resolve(process.argv[2]);await mkdir(path.dirname(destination),{recursive:true});
  await writeFile(destination,JSON.stringify(receipt,null,2)+'\n');
}
console.log(JSON.stringify(receipt,null,2));
