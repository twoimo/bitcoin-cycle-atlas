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
const coordinatorPath='dist/chart-replay.js',coordinatorTestPath='tests/chart-replay-ui.test.mjs';
const coordinator=await readFile(path.join(root,coordinatorPath),'utf8');
const coordinatorTests=await readFile(path.join(root,coordinatorTestPath),'utf8');
const snapshotPath='dist/chart-replay-snapshot.js',snapshotSource=await readFile(path.join(root,snapshotPath),'utf8');
const {version}=JSON.parse(await readFile(path.join(root,'package.json'),'utf8'));
const hash=value=>createHash('sha256').update(value).digest('hex');
const expectedTests=16;

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
  const enumeration=run.stdout.match(/^# BOUNDED_REPLAY (.+)$/m)?.[1];
  if(!broken)assert.ok(enumeration,'The bounded trace enumeration must complete and report measured coverage');
  return {status:broken?'expected behavioral failure':'pass',tests:count('tests'),passed:count('pass'),
    failed:count('fail'),skipped:count('skipped'),exitStatus:run.status,...(enumeration?{enumeration:JSON.parse(enumeration)}:{})};
}

function checkSelection(cwd,{broken=false}={}){
  const run=spawnSync(process.execPath,['--experimental-vm-modules',coordinatorTestPath,'--replay-ui-explore'],
    {cwd,encoding:'utf8',timeout:30000,maxBuffer:4*1024*1024});
  assert.equal(run.error,undefined,'A process failure is not a rejected coordinator mutation');
  assert.equal(run.signal,null);assert.equal(run.status,broken?1:0,run.stdout+'\n'+run.stderr);
  const result=JSON.parse(run.stdout.trim());assert.equal(result.status,broken?'fail':'pass');
  if(broken){
    assert.equal(result.code,'ERR_ASSERTION');assert.equal(result.invariant,'settings-preserve-unconfirmed-start');
    assert.equal(result.shortestCounterexample.length,2,'A settings-only action must reproduce the original implicit confirmation');
  }else{
    assert.equal(result.traces,259);assert.equal(result.transitions,726);assert.equal(result.maxTraceLength,3);
  }
  return result;
}

const savedEntryCases=[
  {index:0,name:'default cutoff entry preserves current-chart save and Continue across mode changes',
    assertion:'the last selected current-chart mode must find its own saved slot'},
  {index:1,name:'saved replay entry isolates cutoff and generic slots and preserves malformed or mismatched histories',
    assertion:'invalid or cross-mode records must not borrow another slot'},
];
const destructionCase={index:2,name:'destroy during an explicit save releases replay once and ignores late completion',
  assertion:'destroy must release replay even while an explicit save is pending'};
const manualDateCases=[
  {index:3,name:'manual date button and Enter reject invalid dates without changing a resumed capture',
    assertion:'manual invalid date cannot replace the current session'},
  {index:4,name:'manual invalid dates leave an unconfirmed replay start unconfirmed',
    assertion:'invalid manual input cannot confirm a start'},
];
function checkSavedEntry(cwd,item,{broken=false}={}){
  const run=spawnSync(process.execPath,['--experimental-vm-modules',coordinatorTestPath,'--replay-ui-extra',String(item.index)],
    {cwd,encoding:'utf8',timeout:30000,maxBuffer:4*1024*1024});
  assert.equal(run.error,undefined);assert.equal(run.signal,null);assert.equal(run.status,broken?1:0,run.stdout+'\n'+run.stderr);
  if(broken){
    assert.match(run.stderr,/ERR_ASSERTION/);assert.ok(run.stderr.includes(item.assertion),'The targeted coordinator invariant must reject the mutation');
    return {status:'expected behavioral failure',name:item.name,assertion:item.assertion,exitStatus:run.status};
  }
  const result=JSON.parse(run.stdout.trim());assert.equal(result.status,'pass');assert.equal(result.name,item.name);
  return result;
}

const mutations=[
  {name:'unguarded-session-completion',
    before:'return !destroyed&&state.generation===generation&&request===owner&&!owner.signal.aborted;',after:'return true;',
    expectedFailure:'superseded origin success and failure cannot replace the current chart'},
  {name:'unguarded-timer-generation',
    before:'generation!==state.generation||owned!==timerGeneration||state.status',after:'generation!==state.generation||state.status',
    expectedFailure:'a timer callback can never be replayed twice or after pause, exit or a new origin'},
  {name:'mutable-session-output',before:'return freeze(session);',after:'return session;',
    expectedFailure:'main replay loads a fixed branded object and keeps it through forward, reverse and explicit restart'},
  {name:'implicit-rewind-at-archive-end',
    before:"if(destroyed||!state.session||state.length<2||state.status==='playing'||state.cursorIndex>=state.length-1)return;",
    after:"if(destroyed||!state.session||state.length<2||state.status==='playing')return;\n    if(state.cursorIndex===state.length-1)state={...state,cursorIndex:0};",
    expectedFailure:'play at the last available observation never rewinds or schedules another callback'},
];
const results={original:check(root),mutations:{}};
results.selection={original:checkSelection(root),mutations:{}};
results.savedEntry={original:savedEntryCases.map(item=>checkSavedEntry(root,item)),mutations:{}};
results.destruction={original:checkSavedEntry(root,destructionCase),mutations:{}};
results.manualDates={original:manualDateCases.map(item=>checkSavedEntry(root,item)),mutations:{}};
const scratch=await mkdtemp(path.join(tmpdir(),'atlas-replay-state-'));
try{
  await mkdir(path.join(scratch,'dist'));await mkdir(path.join(scratch,'tests'));
  await writeFile(path.join(scratch,'package.json'),JSON.stringify({type:'module',version})+'\n');
  await writeFile(path.join(scratch,testPath),tests);
  for(const mutation of mutations){
    assert.equal(source.split(mutation.before).length,2,'Mutation selector drifted: '+mutation.name);
    const mutated=source.replace(mutation.before,mutation.after);
    await writeFile(path.join(scratch,sourcePath),mutated);
    results.mutations[mutation.name]={...check(scratch,{broken:true,expectedFailure:mutation.expectedFailure}),sourceSha256:hash(mutated)};
  }
  await writeFile(path.join(scratch,sourcePath),source);
  results.restored=check(scratch);
  await writeFile(path.join(scratch,coordinatorTestPath),coordinatorTests);
  await writeFile(path.join(scratch,snapshotPath),snapshotSource);
  const settingsMutations=[
    {name:'mode-model-settings-confirm-start',
      before:"for(const key of ['mode','model'])if(q(key))q(key).onchange=()=>{if(!externalBacktest)void open({selectOnly:picking||!getState().session});};",
      after:"for(const key of ['mode','model'])if(q(key))q(key).onchange=()=>{if(!externalBacktest)void open({selectOnly:false});};"},
    {name:'horizon-settings-confirm-start',
      before:"q('horizon').onchange=()=>{if(!externalBacktest)void open({selectOnly:picking||!getState().session,startDateOverride:getState().session?.replaySettings?.startDate??null});};",
      after:"q('horizon').onchange=()=>{if(!externalBacktest)void open({selectOnly:false,startDateOverride:getState().session?.replaySettings?.startDate??null});};"},
  ];
  for(const mutation of settingsMutations){
    assert.equal(coordinator.split(mutation.before).length,2,'Coordinator mutation selector drifted: '+mutation.name);
    await writeFile(path.join(scratch,coordinatorPath),coordinator.replace(mutation.before,mutation.after));
    results.selection.mutations[mutation.name]=checkSelection(scratch,{broken:true});
  }
  await writeFile(path.join(scratch,coordinatorPath),coordinator);
  results.selection.restored=checkSelection(scratch);
  const entryMutations=[
    {name:'entry-resets-selected-storage-mode',test:savedEntryCases[0],
      before:'const firstEntry=!entryOpened;entryOpened=true;readStored();',
      after:"if(atlasAvailable)q('mode').value=preferredMode;const firstEntry=!entryOpened;entryOpened=true;readStored();"},
    {name:'entry-accepts-cross-mode-storage',test:savedEntryCases[1],
      before:"if(stored&&(stored.mode==='cutoff-backtest')!==(q('mode').value==='cutoff-backtest'))throw new Error('저장된 리플레이의 모드와 저장 위치가 다릅니다.');",after:''},
  ];
  for(const mutation of entryMutations){
    assert.equal(coordinator.split(mutation.before).length,2,'Saved-entry mutation selector drifted: '+mutation.name);
    const mutated=coordinator.replace(mutation.before,mutation.after);
    await writeFile(path.join(scratch,coordinatorPath),mutated);
    results.savedEntry.mutations[mutation.name]={...checkSavedEntry(scratch,mutation.test,{broken:true}),sourceSha256:hash(mutated)};
  }
  await writeFile(path.join(scratch,coordinatorPath),coordinator);
  results.savedEntry.restored=savedEntryCases.map(item=>checkSavedEntry(scratch,item));
  const destructionMutations=[
    {name:'destroy-defers-to-interactive-save-guard',test:destructionCase,
      before:'destroy(){if(destroyed)return;destroyed=true;finishExit();',
      after:'destroy(){if(destroyed)return;destroyed=true;exit();'},
    {name:'late-exit-completion-updates-destroyed-controls',
      test:{...destructionCase,assertion:'destroyed save completion cannot update detached controls'},
      before:'if(destroyed||!active||token!==epoch)return;',after:'/* Mutation: accept a revoked save completion. */'},
  ];
  for(const mutation of destructionMutations){
    assert.equal(coordinator.split(mutation.before).length,2,'Destruction mutation selector drifted: '+mutation.name);
    const mutated=coordinator.replace(mutation.before,mutation.after);
    await writeFile(path.join(scratch,coordinatorPath),mutated);
    results.destruction.mutations[mutation.name]={...checkSavedEntry(scratch,mutation.test,{broken:true}),sourceSha256:hash(mutated)};
  }
  await writeFile(path.join(scratch,coordinatorPath),coordinator);
  results.destruction.restored=checkSavedEntry(scratch,destructionCase);
  const manualDateMutation={name:'manual-date-validation-bypassed',
    before:"q('start').onclick=()=>void chooseEnteredDate();q('date').onkeydown=event=>{if(event.key==='Enter'){event.preventDefault();void chooseEnteredDate();}};",
    after:"q('start').onclick=()=>void chooseStart(q('date').value);q('date').onkeydown=event=>{if(event.key==='Enter'){event.preventDefault();void chooseStart(q('date').value);}};"};
  assert.equal(coordinator.split(manualDateMutation.before).length,2,'Manual-date mutation selector drifted');
  const unguarded=coordinator.replace(manualDateMutation.before,manualDateMutation.after);
  await writeFile(path.join(scratch,coordinatorPath),unguarded);
  results.manualDates.mutations[manualDateMutation.name]={...checkSavedEntry(scratch,manualDateCases[0],{broken:true}),sourceSha256:hash(unguarded)};
  await writeFile(path.join(scratch,coordinatorPath),coordinator);
  results.manualDates.restored=manualDateCases.map(item=>checkSavedEntry(scratch,item));
}finally{await rm(scratch,{recursive:true,force:true});}
const receipt={kind:'atlas-replay-state-verification',schemaVersion:1,
  baselineCommit:'aca73b74a5128a5466488a0c701e86f5e854af46',
  previousFollowupBaselineCommit:'4dc877ad0fdeabf7f01057e7f64ac11f9a8cbedc',
  originalAuditBaselineCommit:'94a1b1dda9eb359de70747043808340da369d087',
  node:process.version,sourcePath,sourceSha256:hash(source),testPath,testSha256:hash(tests),
  method:'Execute actual JavaScript controller and coordinator; exhaustive finite command traces plus targeted async ownership, saved-entry, manual-date rejection, destroy-during-save cases and isolated real-source negative controls',
  coordinatorPath,coordinatorSha256:hash(coordinator),coordinatorTestPath,coordinatorTestSha256:hash(coordinatorTests),
  snapshotPath,snapshotSha256:hash(snapshotSource),
  bounds:{playback:results.original.enumeration,asyncLoads:2,selectionCommands:6,selectionMaxTraceLength:3,selectionTraces:259,
    destruction:{pendingExplicitSaves:1,completionSchedules:['deferred callback resumes','deferred callback rejects'],destroyCallsPerSchedule:2},
    manualDates:{submissionMethods:['button','Enter'],entryStates:['resumed capture','unconfirmed selection'],
      invalidKinds:['above maximum','below minimum','empty','malformed','impossible day','impossible month','zero year','native invalidity'],
      finiteSelectionAlphabetUnchanged:true}},
  formalProof:false,modelCheckerRun:false,
  excluded:['Unlimited trace lengths','Native browser DOM, rendering and events','Real forecast generation and scoring in coordinator doubles','Exhaustive network completion schedules','Exhaustive persistence and concurrent-tab schedules','Wall-clock scheduling accuracy','Cutoff-model loading in the coordinator fixture'],
  ...results};
if(process.argv[2]){
  const destination=path.resolve(process.argv[2]);await mkdir(path.dirname(destination),{recursive:true});
  await writeFile(destination,JSON.stringify(receipt,null,2)+'\n');
}
console.log(JSON.stringify(receipt,null,2));
