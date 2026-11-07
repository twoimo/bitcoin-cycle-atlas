import assert from 'node:assert/strict';
import test from 'node:test';
import {mkdtemp,mkdir,readFile,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {createEthBrowserCaseSpecs,selectEthBrowserCaseSpecs} from '../scripts/eth-browser-case-specs.mjs';
import {nativeBrowserLanes,combineNativeBrowserLanes,readNativeBrowserLaneReports,runNativeBrowserLane} from '../scripts/verify-native-browser-suite.mjs';

const digest=bytes=>createHash('sha256').update(bytes).digest('hex');
const suiteRunId='11111111-1111-4111-8111-111111111111';
const startedAt='2026-11-07T12:00:00.000Z',finishedAt='2026-11-07T12:01:00.000Z';
const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=','base64');

async function fixture(t){
  const root=await mkdtemp(resolve(tmpdir(),'atlas-browser-lanes-unit-')),out=resolve(root,'build/eth-browser');
  t.after(()=>rm(root,{recursive:true,force:true}));
  const source={sourceCommit:'a'.repeat(40),sourceTree:'b'.repeat(40),sourceHashes:{}};
  for(const path of ['dist/index.html','scripts/fixture-verifier.mjs']){
    const bytes=Buffer.from('Unit fixture source '+path);await mkdir(resolve(root,path,'..'),{recursive:true});await writeFile(resolve(root,path),bytes);source.sourceHashes[path]=digest(bytes);
  }
  const reports=[],processes=nativeBrowserLanes.map((lane,index)=>({name:lane.name,pid:900+index,code:0,signal:null}));
  for(const [index,lane] of nativeBrowserLanes.entries()){
    const directory=resolve(out,'lanes',lane.name);await mkdir(directory,{recursive:true});
    const cases=[];
    for(const [number,spec] of selectEthBrowserCaseSpecs(lane.scope).entries()){
      const file='unit-fixture-'+number+'.png';await writeFile(resolve(directory,file),png);
      cases.push({...spec,caseSpec:{...spec},status:'passed',screenshots:[{file,bytes:png.length,sha256:digest(png)}],runtimeErrors:[],unscopedLocalRequests:[],unexpectedResourceErrors:[]});
    }
    const fixtureBytes=Buffer.from('{"syntheticUnitFixture":true}\n');await writeFile(resolve(directory,'zero-fixture.json'),fixtureBytes);
    const report={schemaVersion:1,kind:'eth-candidate-real-browser',status:'passed',lane:lane.name,suiteRunId,caseScope:lane.scope,
      ...structuredClone(source),startedAt,finishedAt,imageLogMode:'representative',browserVersion:{product:'Synthetic-unit-fixture-Chrome',revision:'unit-only'},
      browserBinary:'/fixture/chrome',koreanFonts:['unit-fixture-font'],browserProcess:{pid:1000+index,profile:'/fixture/profile-'+index},
      expectedObservedEth:{unitFixture:true},expectedObservedBtc:{unitFixture:true},
      declaredCaseCount:53,expectedCaseCount:lane.caseCount,cases,failures:[],
      sourceIntegrity:{checkedFiles:2,changedSources:[],unchangedDuringRun:true},
      syntheticFixture:{file:'zero-fixture.json',bytes:fixtureBytes.length,sha256:digest(fixtureBytes)}};
    reports.push(report);
  }
  async function join(){
    for(const report of reports)await writeFile(resolve(out,'lanes',report.lane,'report.json'),JSON.stringify(report)+'\n');
    const lanes=await readNativeBrowserLaneReports(out,processes);
    return combineNativeBrowserLanes({root,out,source,suiteRunId,lanes,startedAt,finishedAt});
  }
  return {root,out,source,reports,processes,join};
}

test('joining requires both exact inventories, restores original53 order and only prefixes artifact references',async t=>{
  const f=await fixture(t),child=structuredClone(f.reports),joined=await f.join();
  assert.equal(joined.status,'passed');assert.equal(joined.caseScope,'all');assert.equal(joined.cases.length,53);
  assert.deepEqual(joined.cases.map(row=>row.caseSpec),createEthBrowserCaseSpecs());
  assert.deepEqual(f.reports,child,'Aggregation must not mutate the original child reports');
  for(const row of joined.cases){
    const lane=row.caseSpec.chartReplay?'chart-replay':'non-chart-replay';
    assert.ok(row.screenshots[0].file.startsWith('lanes/'+lane+'/'));
    assert.deepEqual(await readFile(resolve(f.out,row.screenshots[0].file)),png);
    assert.equal(row.screenshots[0].sha256,digest(png));
  }
  assert.equal(joined.syntheticFixture.file,'lanes/non-chart-replay/zero-fixture.json');
  assert.deepEqual(joined.execution.lanes.map(row=>row.caseCount),[46,7]);
});

test('missing, mixed, duplicated, incomplete or failed child evidence cannot become a joined pass',async t=>{
  const changes=[
    f=>{f.reports[1].cases.pop();},f=>{f.reports[1].cases[1]=structuredClone(f.reports[1].cases[0]);},
    f=>{f.reports[0].cases.reverse();},f=>{f.reports[0].cases[0].width=1440;},f=>{f.reports[0].sourceCommit='c'.repeat(40);},f=>{f.reports[0].sourceTree='c'.repeat(40);},
    f=>{f.reports[0].sourceHashes['dist/index.html']='c'.repeat(64);},f=>{delete f.reports[0].sourceHashes['dist/index.html'];},
    f=>{f.reports[1].suiteRunId='22222222-2222-4222-8222-222222222222';},f=>{f.reports[1].browserVersion.product='Different-Chrome';},
    f=>{f.reports[1].browserProcess.pid=f.reports[0].browserProcess.pid;},f=>{f.reports[1].browserProcess.profile=f.reports[0].browserProcess.profile;},
    f=>{f.reports[0].status='failed';},f=>{f.reports[0].cases[0].status='skipped';},f=>{f.reports[0].cases[0].screenshots=[];},
    f=>{f.reports[0].cases[0].runtimeErrors.push({error:'actual exception'});},f=>{f.reports[0].sourceIntegrity.unchangedDuringRun=false;},
    f=>{f.reports[1].failures.push({error:'cleanup failure'});},f=>{f.reports[0].cleanupError='profile cleanup failed';},
    f=>{f.processes[1].code=1;},f=>{f.processes[1].signal='SIGKILL';},f=>{f.reports[0].expectedCaseCount--;},
  ];
  for(const [index,change] of changes.entries()){
    const f=await fixture(t);change(f);await assert.rejects(f.join(),undefined,'Invalid fixture variant '+index+' was accepted');
  }
  const f=await fixture(t);await f.join();await rm(resolve(f.out,'lanes/chart-replay/report.json'));
  const lanes=await readNativeBrowserLaneReports(f.out,f.processes);
  await assert.rejects(combineNativeBrowserLanes({...f,lanes,suiteRunId,startedAt,finishedAt}),/missing or unreadable/);
});

test('changed sources, missing PNGs, corrupted bytes and escaping artifact paths fail the join',async t=>{
  for(const change of [
    async f=>writeFile(resolve(f.root,'dist/index.html'),'changed after capture'),
    async f=>rm(resolve(f.out,'lanes/chart-replay',f.reports[1].cases[0].screenshots[0].file)),
    async f=>writeFile(resolve(f.out,'lanes/chart-replay',f.reports[1].cases[0].screenshots[0].file),Buffer.from('altered screenshot')),
    async f=>{f.reports[0].cases[0].screenshots[0].sha256='f'.repeat(64);},
    async f=>{f.reports[0].cases[0].screenshots[0].file='../chart-replay/unit-fixture-0.png';},
  ]){const f=await fixture(t);await change(f);await assert.rejects(f.join());}
});

test('two serial lane processes retain complete UTF8 log lines and inherit the caller process group',async t=>{
  const root=await mkdtemp(resolve(tmpdir(),'atlas-browser-lane-process-unit-')),out=resolve(root,'build/eth-browser');
  t.after(()=>rm(root,{recursive:true,force:true}));
  const script=`import {readFileSync} from 'node:fs';
    const group=process.platform==='linux'?readFileSync('/proc/self/stat','utf8').slice(readFileSync('/proc/self/stat','utf8').lastIndexOf(')')+2).split(' ')[2]:null;
    const bytes=Buffer.from(JSON.stringify({scope:process.env.ATLAS_BROWSER_CASE_SCOPE,lane:process.env.ATLAS_BROWSER_LANE,run:process.env.ATLAS_BROWSER_SUITE_RUN_ID,output:process.env.ATLAS_BROWSER_OUT,pid:process.pid,group,label:'한글 보존'})+'\\n');
    const split=bytes.indexOf(Buffer.from('한'))+1;process.stdout.write(bytes.subarray(0,split));
    setTimeout(()=>{process.stdout.write(bytes.subarray(split));process.stderr.write('fixture-stderr-'+process.env.ATLAS_BROWSER_LANE+'\\n');},25);`;
  const lines=[],results=await Promise.all(nativeBrowserLanes.map(lane=>runNativeBrowserLane({root,out,lane,suiteRunId,command:process.execPath,args:['--input-type=module','-e',script],write:line=>lines.push(line)})));
  assert.ok(results.every(result=>result.code===0&&result.signal===null&&!result.error));assert.notEqual(results[0].pid,results[1].pid);
  const records=lines.filter(line=>line.startsWith('{')).map(line=>JSON.parse(line));assert.equal(records.length,2);
  assert.deepEqual(records.map(row=>row.scope).sort(),['chart-replay','non-chart-replay']);
  for(const row of records){assert.equal(row.label,'한글 보존');assert.equal(row.run,suiteRunId);assert.equal(row.lane,row.scope);assert.equal(row.output,resolve(out,'lanes',row.lane));}
  if(process.platform==='linux'){
    const own=(await readFile('/proc/self/stat','utf8'));const group=own.slice(own.lastIndexOf(')')+2).split(' ')[2];
    assert.ok(records.every(row=>row.group===group),'A detached subgroup would escape outer cancellation');
  }
  for(const result of results)for(const log of result.logs){const bytes=await readFile(resolve(out,log.file));assert.equal(bytes.length,log.bytes);assert.equal(digest(bytes),log.sha256);}
});
