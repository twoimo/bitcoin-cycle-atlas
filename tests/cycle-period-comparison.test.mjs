import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {buildLongHorizonForecast,LONG_HORIZON_SCENARIOS} from '../dist/long-horizon-forecast.js';
import {buildCycleMilestones} from '../dist/cycle-milestones.js';
import {buildCyclePeriodComparison,calculateCyclePeriodSensitivity,periodDistribution,cycleComparisonSummary,cycleSensitivityDefinition,cycleComparisonFields,cyclePeriodComparisonMarkup,macroClockMarkup,macroClockInspection} from '../dist/cycle-period-comparison.js';
import {cycleIntervalsOverlayMarkup} from '../dist/cycle-interval-overlay.js';
import {milestoneMarkersMarkup} from '../dist/cycle-milestones-view.js';
import {drawAtlasPriceChart} from '../dist/atlas-price-chart.js';
import {svgFixture} from './replay-svg-fixture.mjs';
import {frozenMarketText} from './helpers/frozen-market-fixture.mjs';
const dataset=JSON.parse(await frozenMarketText('btc-daily'));
const asOf=dataset.prices.at(-1)[0],options={asOf,referenceDate:new Date(Date.parse(asOf+'T00:00:00Z')+86400000).toISOString().slice(0,10),scenario:'base',seed:20261022,sampleCount:64,blockDays:28};
const forecast=buildLongHorizonForecast(dataset,options),milestones=buildCycleMilestones(dataset,{forecast}),before=JSON.stringify({forecast,milestones,dataset});
const sensitivity=calculateCyclePeriodSensitivity(dataset,{baseOptions:options,scenarioIds:LONG_HORIZON_SCENARIOS.map(r=>r.id)},{buildForecast:buildLongHorizonForecast});
const analysis=buildCyclePeriodComparison({milestones,forecast,sensitivity});
const by=relation=>Object.values(analysis.byInterval).find(c=>c.relation===relation);

test('macro time priors stay separate from path extrema and never invent price goals',()=>{
  assert.equal(analysis.anchors.length,2);const low=analysis.anchors.find(a=>a.type==='low');
  assert.equal(low.date,forecast.nominalClock.nextLowDate);assert.equal(low.price,null);assert.equal(low.role,'conditional-time-prior');
  const pathBottom=by('bottom-bottom');assert.notEqual(milestones.intervals.find(r=>r.id===pathBottom.id).endDate,low.date);
  assert.ok(low.earliest<=low.date&&low.latest>=low.date);assert.equal(low.probability,null);
  assert.match(macroClockInspection(low,analysis).fields.find(r=>r.label==='가격').value,/시간 기준/);
  assert.equal(JSON.stringify({forecast,milestones,dataset}),before);
});
test('past samples exclude provisional, scenario, partial, malformed and duplicated cycle rows',()=>{
  const base=milestones.intervals.find(r=>r.relation==='bottom-bottom'&&!r.provisional),extra=[{...base,id:'provisional',cycleId:'p',provisional:true},{...base,id:'partial',cycleId:'x',selectionWindowComplete:false},{...base,id:'invalid',cycleId:'i',days:1},{...base,id:'duplicate'},{...base,id:'future',cycleId:'f',kind:'scenario'}];
  const next=buildCyclePeriodComparison({milestones:{...milestones,intervals:[...milestones.intervals,...extra]},forecast,sensitivity});
  assert.deepEqual(next.byInterval[by('bottom-bottom').id].history,by('bottom-bottom').history);
  assert.equal(by('mid-top-cycle-top').history.status,'definition-mismatch');assert.equal(by('mid-top-cycle-top').history.distribution,null);
});
test('history and setting ranges match independent Python quantiles with explicit sample counts',()=>{
  const input=Object.fromEntries(Object.entries(analysis.byInterval).map(([id,c])=>[id,{history:c.history.records.map(r=>r.days),sensitivity:c.sensitivity.samples.map(r=>r.days)}]));
  const expected=JSON.parse(execFileSync('python3',['-c',`import sys,json,statistics
out={}
for key,groups in json.load(sys.stdin).items():
 out[key]={}
 for name,values in groups.items():
  v=sorted(values)
  if not v:out[key][name]=None;continue
  quartiles=statistics.quantiles(v,n=4,method='inclusive') if len(v)>1 else [v[0]]*3
  out[key][name]={'n':len(v),'min':min(v),'q1':quartiles[0],'median':statistics.median(v),'q3':quartiles[2],'max':max(v),'values':v}
print(json.dumps(out))`],{input:JSON.stringify(input),encoding:'utf8'}));
  for(const [id,c] of Object.entries(analysis.byInterval)){assert.deepEqual(c.history.distribution,expected[id].history);assert.deepEqual(c.sensitivity.distribution,expected[id].sensitivity);assert.equal(c.sensitivity.samples.length+c.sensitivity.missing.length,7);}
});
test('seven reproducible settings retain missing landmarks rather than fabricating them',()=>{
  assert.equal(sensitivity.cases.length,7);assert.equal(new Set(sensitivity.cases.map(c=>c.id)).size,7);
  const selected=sensitivity.cases.find(c=>c.id==='economic:base');
  const original=milestones.intervals.filter(r=>r.selectionKind==='scenario');
  for(const row of selected.intervals){const point=original.find(p=>p.relation===row.relation);assert.equal(row.startDate,point.startDate);assert.equal(row.endDate,point.endDate);assert.equal(row.days,point.days);}
  assert.ok(Object.values(analysis.byInterval).some(c=>c.sensitivity.missing.length>0));
  assert.match(cycleComparisonFields(by('bottom-bottom')).at(-1).value,/확률구간 아님/);
  for(const comparison of Object.values(analysis.byInterval)){
    const {samples,expectedCount,missing}=comparison.sensitivity;
    assert.match(cycleComparisonSummary(comparison),new RegExp(`설정 ${samples.length}/${expectedCount}`));
    const definition=cycleSensitivityDefinition(comparison);
    assert.ok(definition.includes(`기준점이 성립한 설정 ${samples.length}개`));
    assert.ok(definition.includes(`미성립 ${missing.length}개`));
    assert.match(definition,/경제 가정 5개.*보조 시드 2개/);
    assert.match(definition,/적중률·신뢰도·독립 표본 수가 아닙니다/);
    assert.equal(cycleComparisonFields(comparison).find(row=>row.label==='설정 수의 정의').value,definition);
  }

});
test('cutoff/scenario mismatches and corrupt worker payloads fail instead of displaying stale ranges',()=>{
  assert.throws(()=>buildCyclePeriodComparison({milestones,forecast,sensitivity:{...sensitivity,asOf:'1999-01-01'}}),/cutoff/);
  assert.throws(()=>buildCyclePeriodComparison({milestones,forecast,sensitivity:{...sensitivity,scenarioId:'stress'}}),/scenario/);
  assert.throws(()=>buildCyclePeriodComparison({milestones,forecast,sensitivity:{...sensitivity,cases:[]}}),/Seven/);
  const bad=structuredClone(sensitivity);bad.cases[0].intervals[0].days++;
  assert.throws(()=>buildCyclePeriodComparison({milestones,forecast,sensitivity:bad}),/Invalid sensitivity interval/);
  assert.throws(()=>periodDistribution([1,NaN]),/integer/);
});
test('loading, error, no-history and no-future views keep explicit states and a retry action',()=>{
  const loading=buildCyclePeriodComparison({milestones,forecast,status:'loading'}),error=buildCyclePeriodComparison({milestones,forecast,status:'error',error:'test failure'});
  assert.match(cyclePeriodComparisonMarkup(loading),/민감도 계산 중/);assert.match(cyclePeriodComparisonMarkup(error),/data-cycle-comparison-retry/);
  const empty=buildCyclePeriodComparison({milestones:{...milestones,intervals:[]},forecast,status:'ready'});assert.match(cyclePeriodComparisonMarkup(empty),/분류할 미래 기간이 없습니다/);
  const missing=buildCyclePeriodComparison({milestones:{...milestones,intervals:milestones.intervals.filter(r=>r.selectionKind==='scenario')},forecast,sensitivity});assert.ok(Object.values(missing.byInterval).every(r=>r.history.distribution===null));
});
test('period annotations add provenance/ranges without moving UTC endpoints or prices',()=>{
  const start='2024-01-01',end='2031-01-01',first=Date.parse(start),x=p=>8+(Date.parse(p.date)-first)/(Date.parse(end)-first)*1200;
  const plain=cycleIntervalsOverlayMarkup({intervals:milestones.intervals,start,end,x,left:8,right:1220,top:18,bottom:700});
  const extra=cycleIntervalsOverlayMarkup({intervals:milestones.intervals,comparisons:analysis.byInterval,start,end,x,left:8,right:1220,top:18,bottom:700});
  assert.equal(extra.visibleCount,plain.visibleCount);assert.deepEqual(extra.items.map(i=>[i.interval.id,i.rawX1,i.rawX2,i.days]),plain.items.map(i=>[i.interval.id,i.rawX1,i.rawX2,i.days]));
  assert.match(extra.markup,/과거/);assert.match(extra.markup,/민감/);assert.match(extra.markup,/경로/);
  const markers=milestoneMarkersMarkup({markers:milestones.markers.map(m=>m.kind==='scenario'?{...m,displayLabel:'경로 '+m.label}:m),start,end,x,y:p=>600-p/1000,left:8,right:1220,top:18,bottom:700});assert.match(markers.markup,/경로/);
});
test('macro guides respect viewport and are keyboard-addressable time-only annotations',()=>{
  const params={anchors:analysis.anchors,start:'2024-01-01',end:'2031-01-01',x:p=>(Date.parse(p.date)-Date.parse('2024-01-01'))/86400000/3,left:8,right:1200,top:18,bottom:700};
  const markup=macroClockMarkup(params);assert.match(markup,/data-cycle-clock="macro-peak"/);assert.match(markup,/tabindex="0"/);assert.match(markup,/가격 목표가 아닌 시간 기준/);
  assert.equal(macroClockMarkup({...params,end:'2027-01-01'}).includes('data-cycle-clock'),false);
  assert.equal(JSON.stringify({forecast,milestones,dataset}),before);
});

test('macro guides and range annotations preserve the ordinary price path and auto price/time scales',()=>{
  const rows=[...dataset.prices.map(([date,price])=>({date,price})),...forecast.path.slice(1)],plain=svgFixture(1168,850),extra=svgFixture(1168,850);
  const params={rows,start:'2024-01-01',end:'2031-01-01',split:asOf,frequency:'daily',chartType:'line',showDrawdown:false,cycleMarkers:milestones.markers,cycleIntervals:milestones.intervals,showCycleIntervals:true,showCycleMarkers:true};
  const a=drawAtlasPriceChart({svg:plain.svg,...params}),b=drawAtlasPriceChart({svg:extra.svg,...params,cycleClockAnchors:analysis.anchors,cyclePeriodComparisons:analysis.byInterval});
  const axisA=a.getPriceScale(),axisB=b.getPriceScale(),numeric=axis=>Object.fromEntries(Object.entries(axis).filter(([,value])=>typeof value!=='function'));assert.deepEqual(numeric(axisA),numeric(axisB));for(const price of [40000,50000,100000,200000])assert.equal(axisA.y(price),axisB.y(price));assert.equal(plain.svg.dataset.forecastValueSignature,extra.svg.dataset.forecastValueSignature);
  const paths=svg=>svg.querySelectorAll('path').filter(p=>p.getAttribute('stroke')==='#f2b960').map(p=>p.getAttribute('d'));
  assert.deepEqual(paths(plain.svg),paths(extra.svg));a.destroy?.();b.destroy?.();
});
