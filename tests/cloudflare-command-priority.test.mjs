import test,{after} from 'node:test';
import assert from 'node:assert/strict';
import {getPriority} from 'node:os';
import {fileURLToPath} from 'node:url';
import {applyCommandPriority,runPrioritizedCommand,commandPriorityPrefix} from '../scripts/cloudflare-priority-command.mjs';
import {runVerificationCommand,installVerificationSignalHandlers} from '../scripts/cloudflare-gate-runner.mjs';
import {assertModelPriorityReceipt} from '../scripts/cloudflare-build-contract.mjs';

const root=fileURLToPath(new URL('..',import.meta.url)),controller=new AbortController();
after(installVerificationSignalHandlers(controller));

test('priority application refuses privilege increases, invalid levels and failed readback',()=>{
  let value=0;
  const api={platform:'linux',read:()=>value,write:(pid,nice)=>{assert.equal(pid,0);value=nice;}};
  assert.deepEqual(applyCommandPriority(0,api),{beforeNice:0,actualNice:0});
  assert.deepEqual(applyCommandPriority(10,api),{beforeNice:0,actualNice:10});
  assert.deepEqual(applyCommandPriority(10,api),{beforeNice:10,actualNice:10},'A nested command retains an already lowered priority');
  assert.throws(()=>applyCommandPriority(0,api),/must not raise/);
  for(const nice of [-20,-1,20,1.5,'10'])assert.throws(()=>applyCommandPriority(nice,api),/bounded nonnegative/);
  assert.throws(()=>applyCommandPriority(10,{platform:'linux',read:()=>0,write:()=>{}}),/was not applied/);
});

test('permission or priority-observation failure prevents command launch',async()=>{
  for(const api of [
    {platform:'linux',read:()=>0,write:()=>{throw Object.assign(new Error('priority denied'),{code:'EPERM'});}},
    {platform:'linux',read:()=>0,write:()=>{}},
  ]){
    let launched=false;
    await assert.rejects(runPrioritizedCommand({id:'unit-fixture',nice:10,command:process.execPath,args:['-e','process.exit(0)'],priorityApi:api,
      spawnCommand:()=>{launched=true;throw new Error('Unexpected launch');},write:()=>{}}));
    assert.equal(launched,false);
  }
});

for(const nice of [0,10])test(`real priority wrapper and child/grandchild inherit${nice} while its parent and sibling stay unchanged`,{skip:process.platform!=='linux'},async()=>{
  const baseline=getPriority(),chunks=[],normal=[];
  const grandchild=`import {getPriority} from 'node:os';import {readFileSync} from 'node:fs';const stat=readFileSync('/proc/self/stat','utf8');console.log(JSON.stringify({pid:process.pid,parentPid:process.ppid,nice:getPriority(),group:Number(stat.slice(stat.lastIndexOf(')')+2).split(' ')[2])}));`;
  const child=`import {getPriority} from 'node:os';import {spawnSync} from 'node:child_process';import {readFileSync} from 'node:fs';
    const result=spawnSync(process.execPath,['--input-type=module','-e',${JSON.stringify(grandchild)}],{encoding:'utf8'});if(result.status!==0)throw new Error(result.stderr);
    const stat=readFileSync('/proc/self/stat','utf8');console.log('INHERITANCE '+JSON.stringify({pid:process.pid,parentPid:process.ppid,nice:getPriority(),group:Number(stat.slice(stat.lastIndexOf(')')+2).split(' ')[2]),grandchild:JSON.parse(result.stdout)}));`;
  const options={cwd:root,environment:{...process.env},deadline:Date.now()+10000,signal:controller.signal,terminationGraceMs:50};
  const [result,sibling]=await Promise.all([
    runVerificationCommand(process.execPath,['--input-type=module','-e',child],{...options,id:'inheritance-fixture',nice,log:bytes=>chunks.push(bytes.toString())}),
    runVerificationCommand(process.execPath,['--input-type=module','-e',"import {getPriority} from 'node:os';console.log(getPriority());"],{...options,id:'normal-fixture',log:bytes=>normal.push(bytes.toString())}),
  ]);
  const lines=chunks.join('').trim().split('\n'),records=lines.filter(line=>line.startsWith(commandPriorityPrefix));assert.equal(records.length,1);
  const priority=JSON.parse(records[0].slice(commandPriorityPrefix.length)),observed=JSON.parse(lines.find(line=>line.startsWith('INHERITANCE ')).slice('INHERITANCE '.length));
  assert.equal(priority.wrapperPid,result.pid);assert.equal(priority.parentPid,process.pid);assert.equal(priority.parentNice,baseline);assert.equal(priority.beforeNice,baseline);
  assert.equal(priority.requestedNice,nice);assert.equal(priority.actualNice,nice);assert.equal(priority.commandNice,nice);assert.equal(priority.commandPid,observed.pid);
  assert.equal(observed.nice,nice);assert.equal(observed.parentPid,priority.wrapperPid);
  // Some container runners mount /proc from a different PID namespace. Compare
  // its group observations to each other, not to namespace-local process.pid.
  assert.equal(observed.grandchild.nice,nice);assert.equal(observed.grandchild.parentPid,observed.pid);assert.equal(observed.grandchild.group,observed.group);
  assert.equal(Number(normal.join('').trim()),baseline);assert.equal(sibling.initialNice,baseline);assert.equal(getPriority(),baseline);
});

test('applied priority cannot turn a signal-terminated model command into success',{skip:process.platform!=='linux'},async()=>{
  const output=[];
  await assert.rejects(runVerificationCommand(process.execPath,['-e',"process.kill(process.pid,'SIGTERM')"],{
    id:'signal-priority-fixture',nice:10,cwd:root,environment:{...process.env},deadline:Date.now()+5000,
    signal:controller.signal,terminationGraceMs:50,log:bytes=>output.push(bytes.toString()),
  }),/failed with exit 1/);
  assert.ok(output.join('').includes(commandPriorityPrefix));assert.match(output.join(''),/exited with SIGTERM/);
});

test('production priority receipt requires actual0, normal outer priority and the unchanged full model command',()=>{
  const value={schemaVersion:1,kind:'atlas-cloudflare-command-priority',status:'APPLIED',gateId:'model-tests',requestedNice:0,beforeNice:0,actualNice:0,
    wrapperPid:102,parentPid:101,parentNice:0,commandPid:103,commandNice:0,command:'npm',args:['test','--','--test-concurrency=3']};
  assert.equal(assertModelPriorityReceipt(value),value);
  for(const patch of [{requestedNice:10},{requestedNice:19},{actualNice:10},{commandNice:10},{parentNice:10},{beforeNice:10},{wrapperPid:0},{command:'node'},
    {args:['test','--','--test-concurrency=1']},{gateId:'native-browser'},{status:'ASSUMED'}])assert.throws(()=>assertModelPriorityReceipt({...value,...patch}));
});
