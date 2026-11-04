import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {buildCycleClockBacktest,groupClockTargets,summarizeClockTargets,assertCycleClockBacktest,quarterlyClockOrigins} from '../dist/cycle-clock-backtest.js';
import {calibrateCycleTiming,evaluateCycleCalibration} from '../dist/cycle-calibration.js';
import {shiftCalendarMonths} from '../dist/cycle-timing.js';
import {utcDay,dateFromDay} from '../dist/cycle-engine.js';
import {clockOriginRowsMarkup,clockSummaryMarkup,clockExcludedRowsMarkup} from '../dist/cycle-clock-backtest-view.js';

const data=JSON.parse(await readFile(new URL('../dist/data/btc-daily.json',import.meta.url),'utf8'));
const legacy=evaluateCycleCalibration(data);
const legacyOrigins=[...legacy.records,...legacy.excluded].map(r=>r.origin);
const result=buildCycleClockBacktest(data,{origins:legacyOrigins});

test('existing high forecasts are unchanged; eight origins stay one peak, one low and one cycle',()=>{
  assert.equal(result.records.length,16);assert.equal(result.scoredOriginCount,8);assert.equal(result.requestedOriginCount,16);assert.equal(result.excluded.length,8);assert.equal(result.uniqueCycleCount,1);
  assert.deepEqual(result.summary.map(s=>[s.type,s.uniqueTargetCount,s.originCount,s.baselineMaeDays,s.adjustedMaeDays]),[['peak',1,8,38,21],['trough',1,8,37,20.5]]);
  for(const row of result.records.filter(r=>r.type==='peak')){
    const old=legacy.records.find(r=>r.origin===row.origin);
    assert.equal(row.baselineDate,old.baselineDate);assert.equal(row.adjustedDate,old.forecastDate);assert.equal(row.adjustedErrorDays,old.adjustedErrorDays);
  }
  assert.equal(result.summary[0].adjustedMaeDays,legacy.adjustedMaeDays);
});

test('each origin reproduces its clock from its own prefix, regardless of future revisions',()=>{
  for(const row of result.records.filter(r=>r.type==='peak')){
    const prefix=data.prices.filter(([date])=>date<=row.origin),a=calibrateCycleTiming(prefix);
    const revised={prices:data.prices.map(([date,price])=>[date,date<=row.origin?price:NaN])};
    const b=calibrateCycleTiming(revised,{asOf:row.origin});assert.deepEqual(a.current,b.current);
    assert.equal(a.current.expectedNextPeakDate,row.adjustedDate);assert.equal(a.current.referencePeakDate,row.referencePeakDate);
    assert.ok(row.origin<row.targetDate&&row.targetDate<row.targetKnownAt&&row.targetKnownAt<=result.asOf);
  }
  const cutoff='2024-04-20',a=buildCycleClockBacktest(data,{asOf:cutoff});
  const changed={prices:data.prices.map(([date,price])=>[date,date<=cutoff?price:NaN])};
  assert.deepEqual(buildCycleClockBacktest(changed,{asOf:cutoff}),a);
});

test('low clock applies the exact integer day correction after nominal peak plus12months',()=>{
  for(const low of result.records.filter(r=>r.type==='trough')){
    const peak=result.records.find(r=>r.type==='peak'&&r.origin===low.origin);
    assert.equal(low.baselineDate,shiftCalendarMonths(peak.baselineDate,12));assert.equal(low.adjustedDate,dateFromDay(utcDay(low.baselineDate)+peak.appliedShiftDays));
  }
  const peak={...result.records[0],cycleId:'halving-2016',cycleYear:2016,targetId:'halving-2016:trough',type:'trough',origin:'2019-03-31',trainingThrough:'2019-03-31',referencePeakDate:'2016-02-28',baselineDate:'2021-02-28',adjustedDate:'2021-03-01',targetDate:'2021-03-02',targetKnownAt:'2024-04-20',appliedShiftDays:1,baselineErrorDays:-2,adjustedErrorDays:-1};
  assert.doesNotThrow(()=>groupClockTargets([peak]));
  const adjustedPeak=dateFromDay(utcDay(shiftCalendarMonths(peak.referencePeakDate,48))+1);
  assert.equal(adjustedPeak,'2020-02-29');assert.notEqual(peak.adjustedDate,shiftCalendarMonths(adjustedPeak,12));
});

test('duplicate origins/rows cannot inflate goal counts, and conflicting duplicates fail',()=>{
  const duplicated=groupClockTargets([...result.records,...result.records]);assert.deepEqual(duplicated,result.targets);
  const origins=legacy.records.map(r=>r.origin),double=buildCycleClockBacktest(data,{origins:[...origins,...origins]});
  assert.equal(double.scoredOriginCount,8);assert.equal(double.uniqueCycleCount,1);assert.equal(double.duplicateOriginsRemoved,8);
  assert.deepEqual(double.summary,result.summary);
  assert.throws(()=>groupClockTargets([...result.records,{...result.records[0],referenceCountAtOrigin:999}]),/Conflicting/);
});

test('targets receive equal weight even when their numbers of origins differ',()=>{
  const groups=[{...result.targets[0],targetId:'a',cycleId:'cycle-a',originCount:8,baselineMaeDays:40,adjustedMaeDays:10},
    {...result.targets[0],targetId:'b',cycleId:'cycle-b',origins:[result.records[0]],originCount:1,baselineMaeDays:20,adjustedMaeDays:30}];
  const summary=summarizeClockTargets(groups)[0];assert.equal(summary.uniqueTargetCount,2);assert.equal(summary.uniqueCycleCount,2);assert.equal(summary.baselineMaeDays,30);assert.equal(summary.adjustedMaeDays,20);assert.equal(summary.improvementDays,10);
});

test('an unclosed actual target stays excluded even if its historical peak/low are visible',()=>{
  const before=buildCycleClockBacktest(data,{asOf:'2024-04-19',origins:legacyOrigins});assert.equal(before.targets.length,0);assert.equal(before.uniqueCycleCount,0);assert.ok(before.summary.every(s=>s.adjustedMaeDays===null));
  const closed=buildCycleClockBacktest(data,{asOf:'2024-04-20'});assert.equal(closed.uniqueCycleCount,1);
  assert.ok(result.excluded.every(r=>r.reason==='next-era-outcome-not-closed'));
  assert.equal(result.currentClock.available,true);assert.equal(result.policy.sufficientForPredictiveSuperiorityClaim,false);
});

test('invalid cutoffs, before-history and missing origin closes remain explicit',()=>{
  assert.throws(()=>buildCycleClockBacktest(data,{asOf:'2026-11-03'}),/actual completed/);
  const early=buildCycleClockBacktest(data,{origins:['2000-01-01','2099-12-31']});assert.deepEqual(early.excluded.map(r=>r.reason),['origin-before-history','origin-not-observed']);
  const gap={prices:data.prices.filter(([date])=>date!=='2018-03-31')},r=buildCycleClockBacktest(gap,{origins:['2018-03-31']});
  assert.equal(r.records.length,0);assert.equal(r.excluded.length,1);
  assert.throws(()=>buildCycleClockBacktest(data,{origins:Array(301).fill('2018-03-31')}),/300/);
});

test('signed errors and target-weighted MAE match an independent Python calendar calculation',()=>{
  const actual=JSON.parse(execFileSync('python3',['-c',`import json,sys,datetime,statistics
r=json.load(sys.stdin); groups={}
for x in r['records']:
 a=datetime.date.fromisoformat(x['adjustedDate']); b=datetime.date.fromisoformat(x['baselineDate']); target=datetime.date.fromisoformat(x['targetDate'])
 assert (a-target).days==x['adjustedErrorDays']; assert (b-target).days==x['baselineErrorDays']
 groups.setdefault((x['targetId'],x['type']),{})[x['origin']]=(abs((a-target).days),abs((b-target).days))
out=[]
for kind in ['peak','trough']:
 g=[v for (key,t),v in groups.items() if t==kind]
 out.append({'type':kind,'targets':len(g),'adjusted':statistics.mean(statistics.mean(a for a,b in v.values()) for v in g),'baseline':statistics.mean(statistics.mean(b for a,b in v.values()) for v in g)})
print(json.dumps(out))`],{input:JSON.stringify(result),encoding:'utf8'}));
  for(const [i,r] of actual.entries()){assert.equal(result.summary[i].uniqueTargetCount,r.targets);assert.equal(result.summary[i].adjustedMaeDays,r.adjusted);assert.equal(result.summary[i].baselineMaeDays,r.baseline);}
});

test('worker result validation rejects inflated target counts, stale cutoffs and altered dates',()=>{
  assert.doesNotThrow(()=>assertCycleClockBacktest(structuredClone(result)));
  for(const mutate of [r=>r.uniqueCycleCount=8,r=>r.summary[0].uniqueTargetCount=8,r=>r.records[0].adjustedErrorDays++,r=>r.records[0].trainingThrough='2026-01-01',r=>r.currentClock.adjustedTrough='2020-01-01',r=>r.targets[0].targetKnownAt='2019-01-01']){
    const r=structuredClone(result);mutate(r);assert.throws(()=>assertCycleClockBacktest(r));
  }
  assert.throws(()=>assertCycleClockBacktest(result,{asOf:'2026-11-02'}));assert.throws(()=>assertCycleClockBacktest(result,{inputHash:'b'.repeat(64)}));
});

test('the UI names goal/origin counts, exact signed errors, unavailable targets and excluded causes',()=>{
  assert.match(clockSummaryMarkup(result),/고점/);assert.match(clockOriginRowsMarkup(result.targets[0]),/-5일/);assert.match(clockExcludedRowsMarkup(result.excluded),/미종료/);
  assert.match(clockExcludedRowsMarkup([{origin:'2018-03-31',reason:'<bad>'}]),/&lt;bad&gt;/);
});


const expanded=buildCycleClockBacktest(data);
test('all fixed quarter ends are covered without selecting favorable origins',()=>{
  const dates=quarterlyClockOrigins('2010-07-18','2026-10-31');assert.equal(dates.length,65);assert.equal(dates[0],'2010-09-30');assert.equal(dates.at(-1),'2026-09-30');
  assert.deepEqual(expanded.originAssessments.map(a=>a.origin),dates);
  assert.deepEqual(expanded.coverageStats,{historicalCycleCount:3,baselineCycleCount:2,pairedCycleCount:1,pairedOrigins:9,baselineOnlyOrigins:21,unavailableOrigins:9,pendingOrigins:26,invalidOrigins:0,insufficientOrigins:43});
  assert.equal(expanded.baselineRecords.length,60);assert.equal(expanded.records.length,18);
});

test('every historical origin clock survives arbitrary changes after that origin',()=>{
  const keys=['trainingThrough','referencePeakDate','referenceCountAtOrigin','referenceKnownAts','peakConfirmedAt','troughConfirmedAt','baselinePeak','baselineTrough','adjustedPeak','adjustedTrough','appliedShiftDays','calibrationAvailable','calibrationReason'];
  for(const a of expanded.originAssessments){
    const prefix=data.prices.filter(([date])=>date<=a.origin);
    const revised={prices:[...prefix,...data.prices.filter(([date])=>date>a.origin).map(([date])=>[date,NaN])]};
    const b=buildCycleClockBacktest(revised,{asOf:a.origin,origins:[a.origin]}).originAssessments[0];
    for(const key of keys)assert.deepEqual(a[key],b[key],a.origin+' '+key);
    assert.ok(a.referenceKnownAts.every(date=>date<=a.origin));assert.ok(!a.peakConfirmedAt||a.peakConfirmedAt<=a.origin);
  }
});

test('early eras never borrow later closed references or manufacture zero corrections',()=>{
  const first=expanded.historicalTargets.find(t=>t.targetId==='halving-2012:peak'),second=expanded.historicalTargets.find(t=>t.targetId==='halving-2016:peak');
  assert.equal(first.originCount,9);assert.equal(first.baselineMaeDays,null);assert.ok(first.origins.every(a=>a.calibrationReason==='no-observed-halving'&&a.baselinePeak===null&&a.adjustedPeak===null));
  assert.equal(second.baselineOriginCount,15);assert.equal(second.pairedOriginCount,0);assert.ok(second.origins.every(a=>a.calibrationReason==='no-complete-reference-era'&&a.referenceCountAtOrigin===0&&a.adjustedPeak===null&&a.appliedShiftDays===null));
  assert.equal(buildCycleClockBacktest(data,{asOf:'2016-07-08'}).coverageStats.historicalCycleCount,0);
  assert.equal(buildCycleClockBacktest(data,{asOf:'2016-07-09'}).coverageStats.historicalCycleCount,1);
  const atSecondClose=buildCycleClockBacktest(data,{asOf:'2020-05-11'});assert.equal(atSecondClose.coverageStats.historicalCycleCount,2);assert.equal(atSecondClose.uniqueCycleCount,0);assert.equal(atSecondClose.coverageStats.baselineCycleCount,1);
});

test('paired errors use the identical nine origins, separate from thirty baseline origins',()=>{
  const paired=expanded.summary[0],baseline=expanded.baselineSummary[0];assert.equal(paired.originCount,9);assert.equal(paired.uniqueTargetCount,1);assert.equal(baseline.originCount,30);assert.equal(baseline.uniqueTargetCount,2);
  assert.equal(paired.baselineMaeDays,38);assert.ok(Math.abs(paired.adjustedMaeDays-199/9)<1e-12);assert.notEqual(paired.baselineMaeDays,baseline.baselineMaeDays);
  const same=expanded.baselineRecords.filter(r=>expanded.records.some(p=>p.origin===r.origin&&p.targetId===r.targetId));assert.equal(same.length,18);
  assert.equal(expanded.records.filter(r=>r.origin==='2020-03-31').length,2);
  for(const r of result.records)assert.deepEqual(expanded.records.find(e=>e.targetId===r.targetId&&e.origin===r.origin),r);
});

test('duplicating the full history cannot inflate any coverage, goal or score',()=>{
  const origins=expanded.originAssessments.map(a=>a.origin),twice=buildCycleClockBacktest(data,{origins:[...origins,...origins]});
  for(const key of ['records','baselineRecords','targets','summary','baselineSummary','historicalTargets','coverageStats'])assert.deepEqual(twice[key],expanded[key]);
  assert.equal(twice.duplicateOriginsRemoved,65);
});

test('extended worker guard rejects future references, zero-filled unknowns and mismatched cohorts',()=>{
  for(const mutate of [r=>r.originAssessments[10].referenceKnownAts.push('2024-04-20'),r=>r.originAssessments[10].adjustedPeak=r.originAssessments[10].baselinePeak,r=>r.coverageStats.pairedCycleCount=3,r=>r.baselineSummary[0].uniqueCycleCount=3,r=>r.baselineRecords.push(r.baselineRecords[0]),r=>r.baselineRecords[0].baselineErrorDays++,r=>r.historicalTargets[0].baselineMaeDays=0,r=>r.originAssessments[0].status='paired',r=>r.originAssessments.pop()]){
    const broken=structuredClone(expanded);mutate(broken);assert.throws(()=>assertCycleClockBacktest(broken));
  }
});

test('gapped and truncated origin eras are retained but cannot contribute invented baseline scores',()=>{
  const gap={prices:data.prices.filter(([date])=>date!=='2014-01-01')};const r=buildCycleClockBacktest(gap,{origins:['2014-06-30']});
  assert.equal(r.originAssessments[0].calibrationReason,'incomplete-current-era');assert.equal(r.originAssessments[0].status,'invalid');assert.equal(r.baselineRecords.length,0);assert.equal(r.records.length,0);
  const truncated=buildCycleClockBacktest({prices:data.prices.filter(([date])=>date>='2013-01-01')},{origins:['2014-06-30']});assert.equal(truncated.baselineRecords.length,0);assert.equal(truncated.coverageStats.invalidOrigins,1);
});


test('independent Python verifies the extended coverage and rejects a fabricated unknown correction',()=>{
  const script=new URL('../scripts/verify-cycle-clock-backtest.py',import.meta.url).pathname;
  const code="import importlib.util,json,sys\nspec=importlib.util.spec_from_file_location('audit',sys.argv[1]);m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)\np=json.load(sys.stdin);r=m.verify(p);assert r['history']['origins']==65\np['originAssessments'][0]['adjustedPeak']='2014-01-01'\ntry: m.verify(p)\nexcept AssertionError: print('pass; negative control rejected')\nelse: raise AssertionError('fabricated correction accepted')";
  const out=execFileSync('python3',['-c',code,script],{input:JSON.stringify({...expanded,evaluationPrices:data.prices}),encoding:'utf8'});assert.match(out,/negative control rejected/);
  const tampered=structuredClone(expanded);tampered.closedTargetCatalog[0].cycleYear='<bad>';assert.throws(()=>assertCycleClockBacktest(tampered));
});
