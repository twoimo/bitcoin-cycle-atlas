import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {performance} from 'node:perf_hooks';
import {fitEthereumAdaptiveModel,simulateEthereumAdaptive} from '../dist/ethereum-adaptive-model.js';
import {fitEthereumPooledModel,simulateEthereumPooled} from '../dist/ethereum-pooled-model.js';
import {ETH_MC_STABILITY_POLICY as policy,selectEthereumStabilityCohorts,summarizeEthereumStabilityPanel,stabilityRange} from './ethereum-monte-carlo-stability-core.mjs';
const root=fileURLToPath(new URL('..',import.meta.url)),sha=x=>createHash('sha256').update(x).digest('hex');
const git=(...args)=>execFileSync('git',args,{cwd:root,encoding:'utf8',timeout:10000}).trim();
const sourceCommit=git('rev-parse','HEAD'),sourceTree=git('rev-parse','HEAD^{tree}');
const paths=['scripts/ethereum-monte-carlo-stability-core.mjs','scripts/evaluate-ethereum-monte-carlo-stability.mjs',
  'dist/ethereum-adaptive-model.js','dist/ethereum-pooled-model.js','dist/ethereum-model-comparison.js','tests/ethereum-monte-carlo-stability.test.mjs'];
assert.equal(git('status','--porcelain','--',...paths,'dist/data/eth-ohlc.json'),'');
const sourceHashes=Object.fromEntries(await Promise.all(paths.map(async p=>[p,sha(await readFile(resolve(root,p)))])));
const input=await readFile(resolve(root,'dist/data/eth-ohlc.json'),'utf8'),history=JSON.parse(input);
const comparisonText=await readFile(resolve(root,'build/ethereum-model-comparison.json'),'utf8'),comparison=JSON.parse(comparisonText);
assert.equal(comparison.provenance.sourceCommit,sourceCommit);assert.equal(comparison.provenance.inputSha256['dist/data/eth-ohlc.json'],sha(input));
const cohorts=selectEthereumStabilityCohorts(comparison.cases,comparison.asOf),required=new Map();
for(const c of cohorts)for(const model of c.models)for(const row of c.cases)required.set(model+'|'+row.origin,{model,origin:row.origin});
for(const model of ['adaptiveEth','pooledEth'])required.set(model+'|'+comparison.asOf,{model,origin:comparison.asOf});
const drawDays=required.size*policy.seeds.length*policy.sampleCounts.reduce((a,b)=>a+b,0)*180;
if(drawDays>policy.maximumDrawDays)throw new RangeError('Monte Carlo diagnostic work budget exceeded before simulation');
const began=performance.now(),points=new Map(),failures=[],defaultReplay=[];
for(const {model,origin}of required.values()){
  const isAdaptive=model==='adaptiveEth';
  let fit;
  try{fit=(isAdaptive?fitEthereumAdaptiveModel:fitEthereumPooledModel)(history,origin);}
  catch(error){failures.push({model,origin,stage:'fit',reason:error.message});continue;}
  for(const sampleCount of policy.sampleCounts)for(const seed of policy.seeds){
    try{
      const simulation=(isAdaptive?simulateEthereumAdaptive:simulateEthereumPooled)(fit,{horizonDays:180,sampleCount,seed});
      for(const horizonDays of policy.horizons){
        const p=simulation.path[horizonDays],point={origin,horizonDays,median:p.baselinePrice,lower:p.low,upper:p.high};
        points.set([model,origin,sampleCount,seed,horizonDays].join('|'),point);
        if(sampleCount===256&&seed===20261027){
          const prior=comparison.cases.find(r=>r.origin===origin&&r.horizonDays===horizonDays);
          if(prior?.predictions?.[model]!==undefined){
            assert.equal(point.median,prior.predictions[model]);assert.equal(point.lower,prior.simulatedIntervals[model].lower);assert.equal(point.upper,prior.simulatedIntervals[model].upper);
            defaultReplay.push({model,origin,horizonDays,exact:true});
          }
        }
      }
    }catch(error){failures.push({model,origin,sampleCount,seed,stage:'simulate-or-exact-default-replay',reason:error.message});}
  }
}
const replicates=cohorts.flatMap(c=>c.models.flatMap(model=>policy.sampleCounts.flatMap(sampleCount=>policy.seeds.map(seed=>({
  cohortId:c.id,model,sampleCount,seed,points:c.cases.map(r=>points.get([model,r.origin,sampleCount,seed,c.horizonDays].join('|'))??{origin:r.origin}),
})))));
const current=[];
for(const model of ['adaptiveEth','pooledEth'])for(const sampleCount of policy.sampleCounts)for(const horizonDays of policy.horizons){
  const values=policy.seeds.map(seed=>({seed,...points.get([model,comparison.asOf,sampleCount,seed,horizonDays].join('|'))}));
  current.push({model,sampleCount,horizonDays,asOf:comparison.asOf,values,
    ranges:failures.length?null:Object.fromEntries(['median','lower','upper'].map(key=>{
      const series=values.map(p=>p[key]),range=stabilityRange(series);
      return [key,{...range,logSpan:Math.log(range.max)-Math.log(range.min)}];
    })),actual:null,status:'pending-not-scored'});
}
const report={kind:'ethereum-monte-carlo-stability',sourceCommit,sourceTree,sourceHashes,
  inputSha256:sha(input),comparisonSha256:sha(comparisonText),executedAt:new Date().toISOString(),runId:process.env.GITHUB_RUN_ID??null,
  policy,asOf:comparison.asOf,cohorts,defaultReplay,failures,current,
  result:failures.length?{status:'incomplete',reason:'No failed selected origin is silently omitted'}:summarizeEthereumStabilityPanel(cohorts,replicates),
  rawReplicates:replicates,runtime:{milliseconds:performance.now()-began,fitCount:required.size,drawDays,
    maximumLogMatrixBytes:181*1024*8,environment:'GitHub Actions Node; no physical mobile latency claim'},
  historicalVintagesProven:false,prospectiveScoredTargets:0,defaultModelChanged:false,defaultSeedChanged:false,
  calibrationReestimated:false,parameterUncertaintyIncluded:false,statisticalSignificanceClaim:false};
const output=resolve(root,'build/ethereum-monte-carlo-stability.json');await mkdir(dirname(output),{recursive:true});await writeFile(output,JSON.stringify(report,null,2)+'\n');
const {rawReplicates,...receipt}=report;console.log('ETH_MC_STABILITY_RECEIPT '+JSON.stringify(receipt));
const text=JSON.stringify(report),size=20000,total=Math.ceil(text.length/size);
for(let index=0;index<total;index++)console.log('ETH_MC_STABILITY_CHUNK '+JSON.stringify({index,total,data:text.slice(index*size,(index+1)*size)}));
if(failures.length)throw new Error('Incomplete Monte Carlo diagnostic; inspect preserved failures');
