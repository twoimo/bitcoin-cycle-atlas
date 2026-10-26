#!/usr/bin/env node
// Isolate market-structure.js from concurrent fixes and compare the real 128-path engine.
import assert from 'node:assert/strict';
import { cp, copyFile, mkdtemp, readFile, rm, writeFile, readdir, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { tmpdir, loadavg, availableParallelism } from 'node:os';
import { resolve, join, dirname } from 'node:path';
import { pathToFileURL } from 'node:url';

const args=process.argv.slice(2),option=(key,fallback)=>args.includes(key)?args[args.indexOf(key)+1]:fallback;
const before=resolve(option('--before','')),after=resolve(option('--after','.'));
assert.ok(args.includes('--before'),'Provide --before with a clean baseline archive');
const baselineRevision=option('--baseline-revision','1b7c87ce4fe5d44d05560320bb3a270c639e3bbf');
const samples=Number(option('--samples',5));assert.ok(Number.isInteger(samples)&&samples>=5&&samples<=30);
const sha=value=>createHash('sha256').update(value).digest('hex');
const baselineSource=await readFile(join(before,'dist/market-structure.js'));
const changedSource=await readFile(join(after,'dist/market-structure.js'));
const isolated=await mkdtemp(join(tmpdir(),'atlas-rolling-after-'));
await cp(join(before,'dist'),join(isolated,'dist'),{recursive:true,filter:source=>source===join(before,'dist')||source.endsWith('.js')});
await writeFile(join(isolated,'package.json'),'{"type":"module"}\n');
await copyFile(join(after,'dist/market-structure.js'),join(isolated,'dist/market-structure.js'));
const dependencyFiles=(await readdir(join(before,'dist'))).filter(file=>file.endsWith('.js')&&file!=='market-structure.js').sort();
const dependencyHashes=Object.fromEntries(await Promise.all(dependencyFiles.map(async file=>[file,sha(await readFile(join(before,'dist',file)))])));
const sourceText=await readFile(join(before,'dist/data/btc-daily.json'),'utf8'),dataset=JSON.parse(sourceText);
const api={};
for(const [side,root] of [['before',before],['after',isolated]])api[side]={
  ...(await import(pathToFileURL(join(root,'dist/market-structure.js')))),
  ...(await import(pathToFileURL(join(root,'dist/long-horizon-forecast.js')))),
};
const asOf=dataset.prices.at(-1)[0],referenceDate=new Date(Date.parse(asOf+'T00:00:00Z')+86400000).toISOString().slice(0,10);
const settings={asOf,referenceDate,scenario:'base',seed:20261022,sampleCount:128,blockDays:28};
const referenceModel=api.before.buildLongHorizonForecast(dataset,settings);
const rollingInput=[...dataset.prices,...referenceModel.path.slice(1).map(point=>[point.date,point.price])];
const referenceRolling=api.before.computeRollingStates(rollingInput);
let checkedNumbers=0;
function equivalent(left,right,path='result'){
  if(typeof left==='number'&&typeof right==='number'){
    checkedNumbers++;assert.ok(Number.isFinite(left)&&Number.isFinite(right),`${path} must remain finite`);
    assert.ok(Math.abs(left-right)<=1e-11*Math.max(1,Math.abs(left),Math.abs(right)),`${path}: ${left} != ${right}`);return;
  }
  if(left&&right&&typeof left==='object'&&typeof right==='object'){
    assert.deepEqual(Object.keys(left),Object.keys(right),`${path} shape`);
    for(const key of Object.keys(left))equivalent(left[key],right[key],`${path}.${key}`);return;
  }
  assert.equal(left,right,path);
}
const economics=model=>sha(JSON.stringify({
  path:model.path.map(point=>({date:point.date,price:point.price,lower:point.lower,upper:point.upper,median:point.median,baselinePrice:point.baselinePrice})),
  turns:model.localTurns,events:model.events,calibration:model.cycleCalibration,
}));
function run(side){
  let start=performance.now();const states=api[side].computeRollingStates(rollingInput),rollingMs=performance.now()-start;
  start=performance.now();const model=api[side].buildLongHorizonForecast(dataset,settings),forecastMs=performance.now()-start;
  // Consumption and equivalence are outside the timed region, after both real
  // production calls have returned their complete synchronous results.
  equivalent(states,referenceRolling);equivalent(model,referenceModel);
  assert.equal(economics(model),economics(referenceModel),'price paths/turns/anchors must be byte-identical');
  return {rollingMs,forecastMs,rollingPoints:states.points.length,forecastPoints:model.path.length,economicHash:economics(model),errors:0};
}
const machine={loadAverage:loadavg(),cores:availableParallelism(),node:process.version};
const profileSide=option('--profile-side',null),output=option('--output',null);
try{
  if(profileSide){
    assert.ok(['before','after'].includes(profileSide));
    for(let i=0;i<6;i++)run(profileSide);
    console.log(JSON.stringify({profileSide,iterations:6,scope:'Profiler run excluded from timed sample receipts',sourceHashes:{before:sha(baselineSource),after:sha(changedSource)}}));
  }else{
    for(let warmup=0;warmup<2;warmup++)for(const side of ['before','after'])run(side);
    const results={before:[],after:[]},order=[];
    for(let sample=0;sample<samples;sample++)for(const side of ['before','after']){results[side].push(run(side));order.push(side);}
    const summarize=values=>{const sorted=[...values].sort((a,b)=>a-b);return {medianMs:sorted.length%2?sorted[Math.floor(sorted.length/2)]:(sorted[sorted.length/2-1]+sorted[sorted.length/2])/2,minMs:sorted[0],maxMs:sorted.at(-1)};};
    const summary=Object.fromEntries(['before','after'].map(side=>[side,Object.fromEntries(['rollingMs','forecastMs'].map(metric=>[metric,summarize(results[side].map(result=>result[metric]))]))]));
    const report={
      scope:'Node production computation; no network, DOM, browser paint, FPS, end-to-end interaction or physical mobile-device timing.',
      claim:'Remove repeated lookback scans from market regime calculation while retaining complete source and conditional price paths.',
      baselineRevision,changedTreeHeadIsNotSourceIdentity:true,sourceHashes:{before:sha(baselineSource),after:sha(changedSource),baselineDependencies:sha(JSON.stringify(dependencyHashes)),benchmark:sha(await readFile(new URL(import.meta.url)))},
      isolation:'Baseline module graph on both sides; overlay only changed market-structure.js. Other simultaneous fixes are excluded.',
      machineBefore:machine,machineAfter:{loadAverage:loadavg()},asOf,settings,prices:dataset.prices.length,rollingRows:rollingInput.length,
      inputHash:sha(sourceText),rollingInputHash:sha(JSON.stringify(rollingInput)),warmupsPerSide:2,samplesPerSide:samples,order,summary,results,
      verification:{errors:0,checkedNumbers,allNonNumericFieldsExact:true,numericRelativeOrAbsoluteTolerance:1e-11,economicPathTurnAnchorHash:economics(referenceModel)},
    };
    if(output){await mkdir(dirname(resolve(output)),{recursive:true});await writeFile(resolve(output),JSON.stringify(report,null,2)+'\n');}
    console.log(JSON.stringify({summary,sourceHashes:report.sourceHashes,verification:report.verification,prices:report.prices,rollingRows:report.rollingRows,output},null,2));
  }
}finally{await rm(isolated,{recursive:true,force:true});}
