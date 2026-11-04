// Scoped, repeatable baseline/candidate benchmark. This is not a site-wide latency measurement.
// Run with Node >=24: node scripts/benchmark-theme-comparison.mjs /path/to/output.json
// Profile separately: node scripts/benchmark-theme-comparison.mjs /path/to/profile.json --profile
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {mkdir,mkdtemp,readFile,rm,writeFile} from 'node:fs/promises';
import {Session} from 'node:inspector/promises';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';

const baselineSha='94a1b1dda9eb359de70747043808340da369d087';
const root=fileURLToPath(new URL('../',import.meta.url));
const output=path.resolve(process.argv[2]||'build/theme-comparison-benchmark.json');
const profileOnly=process.argv.includes('--profile');
const relativeSource='packages/domain/src/themes.ts';
const sha256=value=>createHash('sha256').update(value).digest('hex');
const baselineSource=execFileSync('git',['show',`${baselineSha}:${relativeSource}`],{cwd:root,encoding:'utf8'});
const candidateSource=await readFile(path.join(root,relativeSource),'utf8');
const fixtureBytes=await readFile(path.join(root,'dist/data/themes.json'));
const temp=await mkdtemp(path.join(os.tmpdir(),'atlas-theme-benchmark-'));
await writeFile(path.join(temp,'baseline.ts'),baselineSource);
await writeFile(path.join(temp,'candidate.ts'),candidateSource);
const baseline=await import(pathToFileURL(path.join(temp,'baseline.ts')).href);
const candidate=await import(pathToFileURL(path.join(temp,'candidate.ts')).href);

function upperBoundFixture(real){
  const snapshot=structuredClone(real),last=Date.parse('2026-11-02T00:00:00Z');
  const bars=Array.from({length:5000},(_,i)=>{
    const day=new Date(last-(4999-i)*86400000).toISOString().slice(0,10),close=100+i/100+Math.sin(i/9);
    return [day,close,close+2,close-2,close,1000+i];
  });
  snapshot.asset.bars=bars;snapshot.benchmark.bars=bars.map(b=>[b[0],...b.slice(1).map((n,i)=>i<4?n*5:n)]);
  snapshot.judgments=Array.from({length:50},(_,i)=>{
    const judgment=structuredClone(real.judgments[0]);
    judgment.id=`benchmark-${i}`;judgment.mode=i%2?'recorded':'reconstructed';
    judgment.asOf=new Date(last-(i%25)*86400000).toISOString();
    judgment.recordedAt=judgment.mode==='recorded'?judgment.asOf:snapshot.generatedAt;
    for(const axis of ['continuity','expectation','novelty'])judgment.criteria[axis]={state:['pass','hold','fail'][i%3],reason:'Deterministic benchmark fixture',evidenceIds:['bitwise-etp']};
    return judgment;
  });
  return snapshot;
}
const fixtures={real:JSON.parse(fixtureBytes),upperBound:upperBoundFixture(JSON.parse(fixtureBytes))};
for(const snapshot of Object.values(fixtures)){
  baseline.validateThemeSnapshot(snapshot);candidate.validateThemeSnapshot(snapshot);
  assert.deepEqual(candidate.themeComparison(snapshot,snapshot.judgments),baseline.themeComparison(snapshot,snapshot.judgments));
  for(const judgment of snapshot.judgments)assert.deepEqual(candidate.themePerformance(snapshot,judgment),baseline.themePerformance(snapshot,judgment));
}
// Check equality under both types of missing history and after a same-object price refresh.
const changed=structuredClone(fixtures.real);
for(const mutate of [()=>{changed.benchmark.bars=changed.benchmark.bars.filter(b=>b[0]!=='2026-04-12');},()=>{changed.asset.bars=changed.asset.bars.filter(b=>b[0]!=='2026-04-12');},()=>{changed.asset.bars=changed.asset.bars.map(b=>b[0]==='2026-04-11'?[b[0],b[1],b[2]*2,b[3],b[4]*1.5,b[5]]:b);}]){
  mutate();assert.deepEqual(candidate.themeComparison(changed,changed.judgments),baseline.themeComparison(changed,changed.judgments));
}
let consumed=0;
function run(module,snapshot,scope,iterations){
  const start=performance.now();let checksum=0;
  for(let i=0;i<iterations;i++){
    const comparison=module.themeComparison(snapshot,snapshot.judgments);
    const result=scope==='comparison'?comparison:{comparison,performance:snapshot.judgments.map(j=>({id:j.id,result:module.themePerformance(snapshot,j)}))};
    checksum+=JSON.stringify(result).length;
  }
  const elapsedMs=performance.now()-start;consumed+=checksum;
  return {elapsedMs,msPerCall:elapsedMs/iterations,checksum};
}
await mkdir(path.dirname(output),{recursive:true});
try{
  if(profileOnly){
    const session=new Session();session.connect();await session.post('Profiler.enable');await session.post('Profiler.start');
    run(baseline,fixtures.upperBound,'comparison',80);
    const {profile}=await session.post('Profiler.stop');session.disconnect();await writeFile(output,JSON.stringify(profile));
    console.log(JSON.stringify({profile:output,consumed}));
  }else{
    const measurements=[];
    for(const [fixture,snapshot] of Object.entries(fixtures))for(const scope of ['comparison','api-calculation']){
      const iterations=fixture==='real'?400:8,warmupIterations=fixture==='real'?50:2;
      run(baseline,snapshot,scope,warmupIterations);run(candidate,snapshot,scope,warmupIterations);
      const samples=[];
      for(let pair=0;pair<6;pair++){
        const a=run(baseline,snapshot,scope,iterations),b=run(candidate,snapshot,scope,iterations);
        assert.equal(a.checksum,b.checksum);samples.push({pair:pair+1,baseline:a,candidate:b});
      }
      const summarize=variant=>{
        const values=samples.map(s=>s[variant].msPerCall).sort((a,b)=>a-b);
        return {medianMs:(values[2]+values[3])/2,minMs:values[0],maxMs:values.at(-1)};
      };
      const a=summarize('baseline'),b=summarize('candidate');
      measurements.push({fixture,scope,iterations,warmupIterations,samples,baseline:a,candidate:b,medianReductionPercent:100*(1-b.medianMs/a.medianMs)});
    }
    const report={baselineSha,candidateSourceSha256:sha256(candidateSource),baselineSourceSha256:sha256(baselineSource),candidateDiff:execFileSync('git',['diff',baselineSha,'--',relativeSource],{cwd:root,encoding:'utf8'}),runtime:process.version,platform:process.platform,arch:process.arch,cpu:os.cpus()[0]?.model,logicalCpus:os.cpus().length,loadAverageAtEnd:os.loadavg(),recordedAt:new Date().toISOString(),sampleOrder:'A,B repeated six times for each workload; A=baseline, B=candidate',sampleDefinition:'Fixed completed calls including JSON serialization, elapsed loop wall time divided by call count; no forced GC',fixtureHashes:{realFile:sha256(fixtureBytes),upperBoundJson:sha256(JSON.stringify(fixtures.upperBound))},fixtureSizes:Object.fromEntries(Object.entries(fixtures).map(([k,s])=>[k,{assetBars:s.asset.bars.length,benchmarkBars:s.benchmark.bars.length,judgments:s.judgments.length}])),measurements,consumed,limits:'Synchronous comparison and API calculation only; excludes I/O, database, HTTP, rendering. Shared-host scheduling uncontrolled; do not extrapolate to site-wide performance.'};
    await writeFile(output,JSON.stringify(report,null,2)+'\n');
    console.log(JSON.stringify({output,measurements:measurements.map(({fixture,scope,baseline,candidate,medianReductionPercent})=>({fixture,scope,baseline,candidate,medianReductionPercent}))},null,2));
  }
}finally{await rm(temp,{recursive:true,force:true});}
