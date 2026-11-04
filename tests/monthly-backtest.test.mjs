import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {frozenReplayArchive} from './helpers/frozen-replay-fixture.mjs';
import {monthlyOrigins,monthlyOriginKey,runMonthlyBacktests,summarizeMonthlyBacktests,evaluateMonthlyOrigin,monthlyReplayForecast} from '../dist/monthly-backtest.js';
import {restoreCutoffBacktestForecast,createCutoffBacktestForecast} from '../dist/replay-cutoff-forecast.js';
import {forecastHash} from '../dist/forecast-records.js';
import {monthlyRowsMarkup,monthlySummaryMarkup} from '../dist/monthly-backtest-view.js';
import {loadMonthlyModelIdentity} from '../dist/monthly-backtest-source.js';

const evaluatedAt='2026-11-04T00:00:00.000Z';
const archive=await frozenReplayArchive();
const files={'bounded-test-model.js':'a'.repeat(64)},modelIdentity={files,hash:await forecastHash(files)};
function memoryStore(){const entries=new Map();return {entries,get:async key=>entries.get(key),putIfAbsent:async(key,value)=>{if(!entries.has(key))entries.set(key,structuredClone(value));return structuredClone(entries.get(key));}};}
const store=memoryStore();let builds=0;
const result=await runMonthlyBacktests({archive,modelIdentity,store,evaluatedAt,computeForecast:async p=>{
  builds++;assert.ok(p.prices.every(r=>r.date<=p.asOf));return createCutoffBacktestForecast(p);
}});

test('only completed UTC month ends with available dated inputs become automatic origins',()=>{
  assert.equal(result.rows.length,13);assert.equal(builds,13);assert.ok(result.rows.every(r=>r.status==='ready'),JSON.stringify(result.rows.filter(r=>r.status==='error')));
  assert.deepEqual(monthlyOrigins(archive,{evaluatedAt}),['2025-10-31','2025-11-30','2025-12-31','2026-01-31','2026-02-28','2026-03-31','2026-04-30','2026-05-31','2026-06-30','2026-07-31','2026-08-31','2026-09-30','2026-10-31']);
  assert.throws(()=>monthlyOrigins(archive,{evaluatedAt:'2026-10-31T23:59:59Z'}),/incomplete/);
  assert.throws(()=>monthlyOrigins({...archive,symbol:'ETHUSD'},{evaluatedAt}));
  assert.ok(monthlyOrigins({...archive,observations:archive.observations.filter(r=>r.date!=='2026-02-28')},{evaluatedAt}).includes('2026-02-28'),'missing month-end inputs remain explicit failed origins');
});

test('all four windows and endpoint metrics match independent Python arithmetic on actual paths',()=>{
  const exported={rows:result.rows,prices:archive.observations.map(r=>[r.date,r.price])};
  const oracle=JSON.parse(execFileSync('python3',['-c',`import json,sys,math,datetime,statistics
x=json.load(sys.stdin); prices=dict(x['prices']); out=[]
for row in x['rows']:
 p=row['record']['path']; origin=row['asOf']; anchor=p[0]['price']; measures=[]
 for e in row['evaluations']:
  if e['status']!='complete': continue
  h=e['horizonDays']; samples=[(v['price'],prices[v['date']]) for v in p[1:h+1]]
  assert len(samples)==h
  log=statistics.mean(abs(math.log(f/a)) for f,a in samples); flat=statistics.mean(abs(math.log(anchor/a)) for _,a in samples)
  end=prices[p[h]['date']]; sign=lambda n:(n>0)-(n<0)
  measures.append({'h':h,'mae':statistics.mean(abs(f-a) for f,a in samples),'mape':statistics.mean(abs(f-a)/a for f,a in samples),'log':log,'flat':flat,'skill':1-log/flat if flat else None,'endpoint':abs(p[h]['price']-end)/end,'direction':sign(p[h]['price']-anchor)==sign(end-anchor)})
 out.append({'asOf':origin,'measures':measures})
print(json.dumps(out))`],{input:JSON.stringify(exported),encoding:'utf8'}));
  let comparisons=0;
  for(const row of oracle)for(const e of row.measures){
    const actual=result.rows.find(r=>r.asOf===row.asOf).evaluations.find(r=>r.horizonDays===e.h).metrics;
    for(const [k,v] of Object.entries({meanAbsoluteError:e.mae,meanAbsolutePercentageError:e.mape,meanAbsoluteLogError:e.log,flatMeanAbsoluteLogError:e.flat,skillVersusFlat:e.skill,endpointAbsolutePercentageError:e.endpoint}))assert.ok(Math.abs(actual[k]-v)<1e-9,k);
    assert.equal(actual.endpointDirectionCorrect,e.direction);comparisons++;
  }
  assert.equal(comparisons,30);
});

test('maturity, missing observations and stale actuals never become complete performance',async()=>{
  assert.deepEqual(summarizeMonthlyBacktests(result.rows).map(s=>s.originCount),[12,10,7,1]);
  const first=result.rows[0].record;
  const missing=await evaluateMonthlyOrigin(first,{...archive,observations:archive.observations.filter(r=>r.date!=='2026-10-01')},{evaluatedAt});
  assert.equal(missing.evaluations[3].status,'missing-observations');assert.equal(missing.evaluations[3].metrics,null);assert.equal(missing.evaluations[3].observedDays,364);
  assert.equal(missing.evaluations[0].status,'complete');
  const last=result.rows.at(-1).record,later=await evaluateMonthlyOrigin(last,archive,{evaluatedAt:'2027-11-04T00:00:00Z'});
  assert.ok(later.evaluations.every(e=>e.status==='awaiting-data'&&e.metrics===null));
  assert.ok(result.rows.at(-1).evaluations.every(e=>e.status==='immature'&&e.observedDays===0&&e.metrics===null));
});

test('common-origin summaries use identical month ends; log skill is a ratio of equal-origin means',()=>{
  const summaries=summarizeMonthlyBacktests(result.rows,{commonOrigins:true});
  assert.ok(summaries.every(s=>s.originCount===1&&s.origins[0]==='2025-10-31'&&s.independentCycleCount===null));
  for(const s of summarizeMonthlyBacktests(result.rows)){
    const cohort=result.rows.map(r=>r.evaluations.find(e=>e.horizonDays===s.horizonDays)).filter(e=>e.status==='complete');
    assert.equal(s.meanAbsolutePercentageError,cohort.reduce((sum,e)=>sum+e.metrics.meanAbsolutePercentageError,0)/cohort.length);
    assert.equal(s.skillVersusFlat,1-s.meanAbsoluteLogError/s.flatMeanAbsoluteLogError);
  }
});

test('future actual additions reuse byte-identical frozen records, while revised prefixes/settings get separate keys',async()=>{
  const suffix={...archive,observedAt:evaluatedAt,observedThrough:'2026-11-01',source:{...archive.source,collectedAt:evaluatedAt,sourceObservedThrough:'2026-11-01'},observations:[...archive.observations,{...archive.observations.at(-1),date:'2026-11-01',open:50000,high:50000,low:50000,close:50000,price:50000}]};
  let recalculated=0;
  const resumed=await runMonthlyBacktests({archive:suffix,modelIdentity,store,evaluatedAt,computeForecast:()=>{recalculated++;throw new Error('must not rebuild');}});
  assert.equal(recalculated,0);assert.equal(resumed.restoredCount,13);
  assert.ok(resumed.rows.every(r=>r.status==='ready'),resumed.rows.find(r=>r.status==='error')?.error);
  for(let i=0;i<result.rows.length;i++)assert.equal(await forecastHash(resumed.rows[i].record),await forecastHash(result.rows[i].record));
  const parameters={archive,asOf:'2025-10-31',modelIdentity},key=await monthlyOriginKey(parameters);
  const revised=structuredClone(archive);revised.observations.find(r=>r.date==='2025-10-31').price++;
  assert.notEqual((await monthlyOriginKey({...parameters,archive:revised})).key,key.key);
  assert.notEqual((await monthlyOriginKey({...parameters,modelOptions:{scenario:'stress'}})).key,key.key);
});

test('short replay records are verified exact prefixes of the 365-day record without forecast regeneration',async()=>{
  const parent=result.rows[0].record;
  for(const horizonDays of [30,90,180,365]){
    const record=await monthlyReplayForecast(parent,horizonDays);
    assert.deepEqual(record.path,parent.path.slice(0,horizonDays+1));assert.equal(record.createdAt,parent.createdAt);
    const restored=await restoreCutoffBacktestForecast(record,{prices:archive.observations,asOf:record.asOf,horizonDays,source:archive.source,evaluatedAt});
    assert.equal(restored.outputHash,record.outputHash);
  }
});

test('corrupt saved bytes fail closed and preserve the accepted record instead of regenerating it',async()=>{
  const corrupt=memoryStore();for(const [k,v] of store.entries)corrupt.entries.set(k,structuredClone(v));
  const key=corrupt.entries.keys().next().value;corrupt.entries.get(key).record.path[1].price++;
  let attempts=0;const r=await runMonthlyBacktests({archive,modelIdentity,store:corrupt,evaluatedAt,computeForecast:()=>{attempts++;throw new Error('must not replace corrupt bytes');}});
  assert.equal(attempts,0);assert.equal(r.rows[0].status,'error');assert.match(r.rows[0].error,/무결성/);assert.equal(r.rows.slice(1).filter(r=>r.status==='ready').length,12);
});

test('cancellation at a completed origin retains only accepted records and permits cache-first retry',async()=>{
  const local=memoryStore(),abort=new AbortController();
  await assert.rejects(runMonthlyBacktests({archive,modelIdentity,store:local,evaluatedAt,signal:abort.signal,onProgress:()=>abort.abort()}),{name:'AbortError'});
  assert.equal(local.entries.size,1);
  const next=await runMonthlyBacktests({archive,modelIdentity,store:local,evaluatedAt});assert.equal(next.restoredCount,1);assert.equal(next.createdCount,12);
});

test('period tables retain missing/error states and identify replay origin and fixed horizon',()=>{
  const markup=monthlyRowsMarkup(result.rows);assert.match(markup,/미성숙/);assert.match(markup,/2025-10-31 기준 365일 봉 리플레이/);assert.match(monthlySummaryMarkup(result.rows),/12 \/ 13/);
  assert.match(monthlyRowsMarkup([{asOf:'2026-10-31',status:'error',error:'<bad>',evaluations:[]}]),/&lt;bad&gt;/);
});

test('an uncertain accepted save stops the batch; retry reconciles its original key before computing',async()=>{
  const local=memoryStore();let fail=true,attempts=0;
  const uncertain={get:local.get,putIfAbsent:async(k,v)=>{const accepted=await local.putIfAbsent(k,v);if(fail){fail=false;throw new Error('simulated lost save acknowledgement');}return accepted;}};
  await assert.rejects(runMonthlyBacktests({archive,modelIdentity,store:uncertain,evaluatedAt}),{name:'MonthlyStorageError'});
  assert.equal(local.entries.size,1);const acceptedId=[...local.entries.values()][0].record.id;
  const resumed=await runMonthlyBacktests({archive,modelIdentity,store:uncertain,evaluatedAt,computeForecast:p=>{attempts++;return createCutoffBacktestForecast(p);}});
  assert.equal(attempts,12);assert.equal(resumed.restoredCount,1);assert.equal(resumed.rows[0].record.id,acceptedId);
});

test('local source identities reject failed, oversized and escaping dependency responses',async()=>{
  const baseUrl='http://127.0.0.1:4319/atlas/';
  await assert.rejects(loadMonthlyModelIdentity({baseUrl:'data:text/javascript;base64,Zm9v'}),/로컬 서비스/);
  await assert.rejects(loadMonthlyModelIdentity({baseUrl,fetchImpl:async()=>({ok:false})}),/소스 확인/);
  await assert.rejects(loadMonthlyModelIdentity({baseUrl,fetchImpl:async()=>({ok:true,text:async()=>'x'.repeat(1024*1024+1)})}),/too large/);
  await assert.rejects(loadMonthlyModelIdentity({baseUrl,fetchImpl:async()=>({ok:true,text:async()=>"import x from '../escape.js';"})}),/escaped/);
  const identity=await loadMonthlyModelIdentity({baseUrl,fetchImpl:async()=>({ok:true,text:async()=>"export const model=1;"})});
  assert.equal(identity.hash,await forecastHash(identity.files));assert.equal(Object.keys(identity.files).length,1);
});
