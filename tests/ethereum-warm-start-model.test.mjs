import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {utcDay,dateFromDay} from '../dist/cycle-engine.js';
import {confirmedEthereumRegimes,fitEthereumAdaptiveModel,simulateEthereumAdaptive,ETH_ADAPTIVE_POLICY} from '../dist/ethereum-adaptive-model.js';
import {fitEthereumPooledModel,simulateEthereumPooled} from '../dist/ethereum-pooled-model.js';
import {ETH_WARM_START_POLICY,fitEthereumWarmStartModel,simulateEthereumWarmStart,buildEthereumWarmStartCandidate} from '../dist/ethereum-warm-start-model.js';

function fixture(n=1800,start='2021-01-01'){
  const first=utcDay(start);let log=7;
  return Array.from({length:n},(_,index)=>{
    if(index)log+=(index%260<160?.013:-.020)+.012*Math.sin(index*.41);
    return {date:dateFromDay(first+index),price:Math.exp(log)};
  });
}
const rows=fixture(),asOf=rows.at(-1).date,fit=fitEthereumWarmStartModel(rows,asOf);
const bin=age=>{const index=ETH_WARM_START_POLICY.ageBounds.findIndex(bound=>age<=bound);return index<0?5:index;};

test('warm-start initialization classifies the first post-Merge return only when its prior state was known',()=>{
  const t=fit.training,initial=t.initialization;
  assert.equal(initial.stateKnown,true);assert.equal(initial.unknownStateAssigned,false);
  assert.ok(initial.knownAt<initial.boundaryDate);assert.ok(initial.age>0);
  assert.equal(t.firstObservation,'2022-09-15');assert.equal(t.firstClassifiedReturn,'2022-09-16');
  assert.equal(t.classifiedReturns,t.observations-1);assert.equal(t.unclassifiedReturns,0);
  assert.equal(t.preMergeReturnsUsed,0);assert.equal(t.preMergeRiskDaysUsed,0);
  assert.equal(initial.firstObservation,rows[0].date);
  assert.equal(initial.preMergeObservations,utcDay('2022-09-15')-utcDay(rows[0].date));
});

test('fitted return moments and age-specific hazard exposure use only post-Merge intervals and prior-day states',()=>{
  const expected=Object.fromEntries(['up','down'].map(state=>[state,{returns:[],risk:Array(6).fill(0),events:Array(6).fill(0)}]));
  const events=confirmedEthereumRegimes(rows),byDay=new Map(events.map(event=>[event.knownAt,event]));
  for(let index=1;index<rows.length;index++){
    if(rows[index-1].date<ETH_WARM_START_POLICY.historyStart)continue;
    const previous=events.filter(event=>event.knownAt<=rows[index-1].date).at(-1);
    if(!previous)continue;
    assert.ok(previous.knownAt<rows[index].date);
    const group=expected[previous.state],age=utcDay(rows[index].date)-utcDay(previous.knownAt);
    group.returns.push(Math.log(rows[index].price)-Math.log(rows[index-1].price));group.risk[bin(age)]++;
    const next=byDay.get(rows[index].date);
    if(next&&next.state!==previous.state)group.events[bin(age)]++;
  }
  const all=Object.values(expected).flatMap(group=>group.returns),center=all.reduce((s,x)=>s+x,0)/all.length;
  const pooledVariance=all.reduce((s,x)=>s+(x-center)**2,0)/(all.length-1);
  assert.ok(Math.abs(fit.training.initialVariance-pooledVariance)<1e-14);
  for(const state of ['up','down']){
    const actual=fit.states[state],group=expected[state];
    assert.equal(actual.returnCount,group.returns.length);assert.equal(actual.riskDays,group.returns.length);
    assert.ok(Math.abs(actual.rawMean-group.returns.reduce((s,x)=>s+x,0)/group.returns.length)<1e-14);
    assert.deepEqual(actual.riskByAge,group.risk);assert.deepEqual(actual.eventsByAge,group.events);
    assert.equal(actual.switches,group.events.reduce((s,x)=>s+x,0));
  }
});

test('left-truncated spells enter at their real age and observed risk conserves complete and right-censored exposure',()=>{
  const spells=fit.training.spells,first=spells[0];
  assert.equal(first.leftTruncated,true);assert.equal(first.entryAge,fit.training.initialization.age);
  assert.equal(first.observationStartDate,fit.training.firstObservation);
  assert.equal(first.observedRiskDays,first.exitAge-first.entryAge);
  assert.ok(first.entryAge>0);assert.equal(first.rightCensored,false);
  for(const spell of spells){
    assert.equal(spell.observedRiskDays,spell.exitAge-spell.entryAge);
    assert.equal(spell.entryAge,utcDay(spell.observationStartDate)-utcDay(spell.knownAt));
    if(spell.observedRiskDays){
      assert.equal(utcDay(spell.firstReturnDate),utcDay(spell.observationStartDate)+1);
      assert.equal(utcDay(spell.lastReturnDate)-utcDay(spell.observationStartDate),spell.observedRiskDays);
    }
  }
  for(const state of ['up','down']){
    const group=fit.states[state],stateSpells=spells.filter(spell=>spell.state===state);
    assert.equal(group.riskDays,stateSpells.reduce((sum,spell)=>sum+spell.observedRiskDays,0));
    assert.deepEqual(group.completedDurations,stateSpells.filter(spell=>!spell.rightCensored&&!spell.leftTruncated).map(spell=>spell.exitAge));
    assert.deepEqual(group.completedObservedDurations,stateSpells.filter(spell=>!spell.rightCensored).map(spell=>spell.observedRiskDays));
    assert.equal(group.leftTruncatedCompletedSpells.length,stateSpells.filter(spell=>spell.leftTruncated&&!spell.rightCensored).length);
  }
  assert.equal(spells.at(-1).rightCensored,true);
  assert.equal(fit.currentAge,utcDay(asOf)-utcDay(fit.training.currentStateKnownAt));
  assert.equal(fit.training.currentObservedRiskDays,spells.at(-1).observedRiskDays);
});

test('future price poisoning cannot change warm initialization, fitted parameters or forecast prefixes',()=>{
  const index=1400,origin=rows[index].date,prefix=rows.slice(0,index+1);
  const poisoned=rows.map(row=>row.date>origin?{...row,price:NaN}:row),before=structuredClone(poisoned);
  assert.deepEqual(fitEthereumWarmStartModel(poisoned,origin),fitEthereumWarmStartModel(prefix,origin));
  assert.deepEqual(buildEthereumWarmStartCandidate({ethRows:poisoned,asOf:origin,horizons:[30],sampleCount:64}),
    buildEthereumWarmStartCandidate({ethRows:prefix,asOf:origin,horizons:[30],sampleCount:64}));
  assert.deepEqual(poisoned,before);
  const short=simulateEthereumWarmStart(fit,{horizonDays:30,sampleCount:64,seed:9});
  const long=simulateEthereumWarmStart(fit,{horizonDays:90,sampleCount:64,seed:9});
  assert.deepEqual(short.path,long.path.slice(0,31));
});

test('an unknown state before the estimation era remains unknown until a real confirmation',()=>{
  const first=utcDay('2021-01-01'),boundary=utcDay(ETH_WARM_START_POLICY.historyStart);
  const prefix=Array.from({length:boundary-first},(_,index)=>({date:dateFromDay(first+index),price:Math.exp(7)}));
  const post=fixture(1200,ETH_WARM_START_POLICY.historyStart),history=[...prefix,...post];
  const result=fitEthereumWarmStartModel(history,history.at(-1).date);
  assert.equal(result.training.initialization.stateKnown,false);assert.equal(result.training.initialization.state,null);
  assert.equal(result.training.initialization.knownAt,null);assert.equal(result.training.initialization.age,0);
  assert.equal(result.training.initialization.unknownStateAssigned,false);assert.ok(result.training.unclassifiedReturns>0);
  assert.ok(result.training.firstClassifiedReturn>result.training.events[0].knownAt);
  const firstSpell=result.training.spells[0];assert.equal(firstSpell.entryAge,0);assert.equal(firstSpell.leftTruncated,false);
});

test('initialization never crosses a missing date and insufficient post-gap history stays unavailable',()=>{
  const removed='2022-09-10',gapped=rows.filter(row=>row.date!==removed);
  const result=fitEthereumWarmStartModel(gapped,asOf);
  assert.equal(result.training.initialization.firstObservation,'2022-09-11');
  assert.equal(result.training.discardedBeforeContiguousPrefix,rows.findIndex(row=>row.date===removed));
  assert.equal(result.training.initialization.stateKnown,false);
  const recentGap=rows.filter((_,index)=>index!==rows.length-100);
  assert.equal(buildEthereumWarmStartCandidate({ethRows:recentGap,asOf}).status,'unavailable');
});

test('new candidate identity is explicit and existing adaptive and pooled inputs and outputs remain unchanged',()=>{
  const input=structuredClone(rows),adaptiveFit=fitEthereumAdaptiveModel(rows,asOf),pooledFit=fitEthereumPooledModel(rows,asOf);
  const options={horizonDays:30,sampleCount:64,seed:7};
  const adaptive=simulateEthereumAdaptive(adaptiveFit,options),pooled=simulateEthereumPooled(pooledFit,options);
  const candidate=buildEthereumWarmStartCandidate({ethRows:rows,asOf,horizons:[30],sampleCount:64,seed:7});
  assert.equal(candidate.status,'available');assert.equal(candidate.model,ETH_WARM_START_POLICY.version);
  assert.notEqual(candidate.model,ETH_ADAPTIVE_POLICY.version);
  assert.equal(candidate.assumptions.simulation.version,ETH_WARM_START_POLICY.version);
  assert.equal(candidate.assumptions.simulation.simulationLawReusedFrom,ETH_ADAPTIVE_POLICY.version);
  assert.equal(candidate.assumptions.simulation.initializationChangesSampleComposition,true);
  assert.equal(candidate.assumptions.simulation.singleComponentCausalEffectIdentified,false);
  assert.equal(candidate.probability,null);assert.equal(candidate.calibrated,false);assert.equal(candidate.productionEligible,false);
  assert.deepEqual(rows,input);assert.deepEqual(fitEthereumAdaptiveModel(rows,asOf),adaptiveFit);
  assert.deepEqual(fitEthereumPooledModel(rows,asOf),pooledFit);
  assert.deepEqual(simulateEthereumAdaptive(adaptiveFit,options),adaptive);
  assert.deepEqual(simulateEthereumPooled(pooledFit,options),pooled);
  assert.throws(()=>simulateEthereumWarmStart(adaptiveFit,options),/own fitted/);
  assert.throws(()=>buildEthereumWarmStartCandidate({ethRows:rows,asOf,horizons:[30,30]}),/unique/);
});

test('retained ETH archive has a known pre-Merge initialization and no needless initial post-Merge exclusion',async()=>{
  const archive=JSON.parse(await readFile(new URL('../dist/data/eth-ohlc.json',import.meta.url),'utf8'));
  const origin='2026-10-25',warm=fitEthereumWarmStartModel(archive,origin),adaptive=fitEthereumAdaptiveModel(archive,origin);
  assert.equal(warm.training.initialization.stateKnown,true);
  assert.ok(warm.training.initialization.knownAt<=warm.training.firstObservation);
  assert.equal(warm.training.unclassifiedReturns,0);
  assert.equal(warm.training.classifiedReturns,warm.training.observations-1);
  assert.ok(adaptive.training.unclassifiedReturns>0);
  assert.equal(warm.training.classifiedReturns-adaptive.training.classifiedReturns,adaptive.training.unclassifiedReturns);
  assert.equal(warm.training.preMergeReturnsUsed,0);assert.equal(warm.training.preMergeRiskDaysUsed,0);
});
