import {utcDay,dateFromDay} from './cycle-engine.js';
import {buildCycleMilestones,INTERVAL_RELATIONS} from './cycle-milestones.js';

const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const conditional=item=>item.selectionKind==='scenario'||['scenario','mixed'].includes(item.kind);
const weeks=days=>new Intl.NumberFormat('ko-KR',{maximumFractionDigits:1}).format(days/7);
const rangeText=range=>range?`${weeks(range.min)}–${weeks(range.max)}주`:'자료 없음';
const relationName=id=>INTERVAL_RELATIONS.find(r=>r.id===id)?.label??id;
export function periodDistribution(values){
  if(!Array.isArray(values)||values.some(v=>!Number.isSafeInteger(v)||v<0))throw new TypeError('Completed integer day durations required');
  if(!values.length)return null;
  const sorted=[...values].sort((a,b)=>a-b),q=p=>{const x=(sorted.length-1)*p,i=Math.floor(x);return sorted[i]+(sorted[Math.min(i+1,sorted.length-1)]-sorted[i])*(x-i);};
  return {n:sorted.length,min:sorted[0],q1:q(.25),median:q(.5),q3:q(.75),max:sorted.at(-1),values:sorted};
}
function measured(row,asOf){
  try{return row.startDate<row.endDate&&row.endDate<=asOf&&row.days===utcDay(row.endDate)-utcDay(row.startDate);}catch{return false;}
}
export function buildCyclePeriodComparison({milestones,forecast,sensitivity=null,status='idle',error=null}={}){
  if(!milestones||forecast?.asOf!==milestones.asOf)throw new RangeError('Comparison needs the selected forecast and matching observation cutoff');
  const asOf=milestones.asOf,byInterval={},clock=forecast.nominalClock??forecast.nearPhase?.nominalClock;
  if(sensitivity&&(sensitivity.asOf!==asOf||sensitivity.scenarioId!==forecast.scenario.id))throw new RangeError('Sensitivity belongs to a different cutoff or scenario');
  if(sensitivity){
    if(!Array.isArray(sensitivity.cases)||sensitivity.cases.length!==7||new Set(sensitivity.cases.map(c=>c.id)).size!==7)throw new TypeError('Seven distinct sensitivity settings required');
    for(const c of sensitivity.cases){
      if(typeof c.id!=='string'||!Array.isArray(c.intervals)||c.intervals.length>9||new Set(c.intervals.map(p=>p.relation)).size!==c.intervals.length)throw new TypeError('Invalid sensitivity case');
      for(const r of c.intervals)if(!INTERVAL_RELATIONS.some(p=>p.id===r.relation)||!Number.isSafeInteger(r.days)||r.days<=0||r.days!==utcDay(r.endDate)-utcDay(r.startDate))throw new RangeError('Invalid sensitivity interval');
    }
  }
  for(const row of milestones.intervals.filter(conditional)){
    // A historical halving window is not the future one-third window.
    const comparable=row.relation!=='mid-top-cycle-top';
    const seen=new Set(),records=milestones.intervals.filter(p=>{
      if(!comparable||p.relation!==row.relation||conditional(p)||p.provisional||p.selectionWindowComplete===false||!measured(p,asOf)||seen.has(p.cycleId))return false;
      seen.add(p.cycleId);return true;
    }).map(p=>({cycleId:p.cycleId,label:p.cycleLabel,startDate:p.startDate,endDate:p.endDate,days:p.days}));
    const samples=[],missing=[];
    for(const c of sensitivity?.cases??[]){
      const item=c.intervals.find(p=>p.relation===row.relation);
      if(!item||item.selectionWindowComplete===false)missing.push(c.id);
      else samples.push({caseId:c.id,label:c.label,days:item.days,startDate:item.startDate,endDate:item.endDate});
    }
    byInterval[row.id]={id:row.id,relation:row.relation,days:row.days,comparable,
      history:{status:!comparable?'definition-mismatch':records.length?'ready':'unavailable',distribution:periodDistribution(records.map(p=>p.days)),records,
        reason:!comparable?'과거는 반감기까지, 미래는 상승 창 첫 ⅓까지이므로 분포 비교 제외':records.length?'완료된 관측 기준점의 관계별 기간 · 잠정·가정·부분 구간 제외':'완료된 비교 구간 없음'},
      sensitivity:{status:sensitivity?'ready':status,distribution:periodDistribution(samples.map(p=>p.days)),samples,missing,expectedCount:sensitivity?.cases.length??7,error,
        meaning:'기존 경제 가정 5개와 선택 가정의 보조 시드 2개 · 7개 설정의 최솟값–최댓값 · 확률구간 아님'}};
  }
  const shift=forecast.cycleCalibration?.current?.sensitivity,applied=clock?.timingAdjustment?.appliedShiftDays??0;
  const anchors=[];
  if(clock)for(const [type,key,label] of [['peak','effectivePeakDate','거시 고점 시계'],['low','nextLowDate','거시 저점 시계']]){
    const date=clock[key];if(!date||date<=asOf)continue;utcDay(date);
    const nominal=dateFromDay(utcDay(date)-applied),range=clock.timingAdjustment?.applied&&shift?[shift.lowerShiftDays,shift.upperShiftDays]:[0,0];
    if(range.some(v=>!Number.isFinite(v)))throw new TypeError('Invalid macro clock sensitivity');
    anchors.push({id:`macro-${type}`,type,label,date,earliest:dateFromDay(utcDay(nominal)+Math.min(...range,applied)),latest:dateFromDay(utcDay(nominal)+Math.max(...range,applied)),price:null,role:'conditional-time-prior',probability:null});
  }
  return {asOf,scenarioId:forecast.scenario.id,byInterval,anchors,status:sensitivity?'ready':status,error,
    method:'완료 관측 구간의 관계별 회고 분포와 예시 경로의 설정 민감도를 비교합니다. 과거 기준점의 선정 창과 미래 시계 창은 같지 않으며, 기간 예측의 검증·확률로 해석하지 않습니다.'};
}

/** Existing forecast mathematics is injected by the BTC owner, never imported by shared charts. */
export function calculateCyclePeriodSensitivity(dataset,{baseOptions,scenarioIds}={}, {buildForecast}={}){
  if(typeof buildForecast!=='function'||!Array.isArray(scenarioIds)||scenarioIds.length!==5||new Set(scenarioIds).size!==5)throw new TypeError('Five existing economic scenarios and a BTC forecast capability are required');
  const seed=baseOptions?.seed;if(!Number.isSafeInteger(seed)||seed<0||seed>4294967293||!scenarioIds.includes(baseOptions.scenario))throw new RangeError('Invalid sensitivity seed or selected scenario');
  const cases=[...scenarioIds.map(scenario=>({id:`economic:${scenario}`,label:({base:'통화·금 기준',accelerated:'채택 확대',wait:'완만한 채택',late:'낮은 채택',stress:'수요 훼손'})[scenario]??scenario,options:{...baseOptions,scenario}})),...[1,2].map(offset=>({id:`seed:${seed+offset}`,label:`${baseOptions.scenario} · 시드 ${seed+offset}`,options:{...baseOptions,seed:seed+offset}}))];
  return {asOf:baseOptions.asOf,scenarioId:baseOptions.scenario,cases:cases.map(c=>{
    const forecast=buildForecast(dataset,c.options);if(forecast.asOf!==baseOptions.asOf)throw new RangeError('Sensitivity input cutoff mismatch');
    const m=buildCycleMilestones(dataset,{forecast,asOf:forecast.asOf});
    return {id:c.id,label:c.label,scenarioId:forecast.scenario.id,seed:c.options.seed,intervals:m.intervals.filter(conditional).map(r=>({relation:r.relation,startDate:r.startDate,endDate:r.endDate,days:r.days,selectionWindowComplete:r.selectionWindowComplete!==false}))};
  })};
}
export function cycleComparisonSummary(comparison){
  if(!comparison)return '';
  const h=comparison.history,s=comparison.sensitivity;
  return `${h.status==='definition-mismatch'?'과거 비교 제외':h.distribution?`과거 ${rangeText(h.distribution)} · n=${h.distribution.n}`:'과거 자료 없음'} · ${s.status==='ready'?`민감 ${rangeText(s.distribution)} · ${s.samples.length}/${s.expectedCount}`:s.status==='error'?'민감도 오류':'민감도 계산 중'}`;
}
export function cycleComparisonFields(comparison){
  if(!comparison)return [];
  const h=comparison.history,s=comparison.sensitivity,d=h.distribution;
  return [{label:'기준점 구분',value:'예시 경로 전환점 · 거시 시계와 별개'},
    {label:'과거 관측 분포',value:d?`${rangeText(d)} · 중앙 ${weeks(d.median)}주 · Q1 ${weeks(d.q1)} / Q3 ${weeks(d.q3)}주 · n=${d.n}`:h.reason},
    ...h.records.map(p=>({label:`과거 · ${p.label}`,value:`${p.startDate} → ${p.endDate} · ${p.days}일`})),
    {label:'설정 민감도',value:s.status==='ready'?`${rangeText(s.distribution)} · ${s.samples.length}/${s.expectedCount}개 설정 · ${s.missing.length}개 기준점 미성립`:s.status==='error'?`계산 실패 · ${s.error}`:'계산 중'},
    ...s.samples.map(p=>({label:`민감도 · ${p.label}`,value:`${p.startDate} → ${p.endDate} · ${p.days}일`})),{label:'민감도 해석',value:s.meaning}];
}
export function macroClockInspection(anchor,analysis){return {label:anchor.label,date:anchor.date,kind:'assumption',fields:[{label:'거시 기준일 · UTC',value:anchor.date},{label:'시계 보정 민감도 · UTC',value:`${anchor.earliest} → ${anchor.latest}`},{label:'가격',value:'시간 기준만 표시 · 가격 목표 아님'},{label:'관측 입력 마감 · UTC',value:analysis.asOf}],note:'48개월 고점·12개월 하락의 조건부 달력 시계입니다. 표시 범위는 무보정·현재 보정·원시 보정의 민감도이며 확률구간이 아닙니다. 예시 가격 경로의 극값 날짜와 구분합니다.'};}
const fmt=n=>Number(n.toFixed(2));
export function macroClockMarkup({anchors=[],start,end,x,left,right,top,bottom}={}){
  if(!anchors.length)return '';
  const first=utcDay(start),last=utcDay(end);if(last<=first)return '';
  return `<g class="cycle-macro-clocks" pointer-events="none">${anchors.filter(a=>a.date>=start&&a.date<=end).map((a,i)=>{
    const xx=x({date:a.date}),lo=Math.max(left,x({date:a.earliest})),hi=Math.min(right,x({date:a.latest})),yy=top+8+i*24,width=Math.min(196,right-left-4),tx=Math.max(left+2,Math.min(right-width-2,xx-width/2));
    return `<g data-cycle-clock="${esc(a.id)}" data-date="${a.date}" data-earliest="${a.earliest}" data-latest="${a.latest}" role="button" tabindex="0" aria-label="${esc(a.label)} · ${a.date} · 시계 민감도 ${a.earliest}–${a.latest}"><title>${esc(a.label)} · 가격 목표가 아닌 시간 기준 · 민감도는 확률구간 아님</title>${hi>lo?`<rect x="${fmt(lo)}" y="${yy+20}" width="${fmt(hi-lo)}" height="3" fill="var(--muted)" opacity=".15"/>`:''}<path d="M${fmt(xx)},${yy+18}V${bottom}" stroke="var(--muted)" stroke-width="1" stroke-dasharray="2 6" opacity=".5"/><rect class="cycle-macro-clock-label" x="${fmt(tx)}" y="${yy}" width="${width}" height="18" rx="3" fill="var(--surface)" stroke="var(--muted)" pointer-events="all"/><text x="${fmt(tx+width/2)}" y="${yy+12}" text-anchor="middle" fill="var(--text)" font-size="10">◇ ${esc(a.label)} · ${a.date}</text></g>`;
  }).join('')}</g>`;
}
function historyPlot(d){
  if(!d)return '';
  const x=v=>8+(v-d.min)/Math.max(1,d.max-d.min)*104;
  return `<svg class="cycle-history-distribution" viewBox="0 0 120 16" role="img" aria-label="과거 분포 ${d.min}–${d.max}일, 중앙 ${d.median}일, Q1 ${d.q1}일, Q3 ${d.q3}일"><path d="M8 8H112" stroke="var(--muted)"/><rect x="${x(d.q1)}" y="4" width="${Math.max(1,x(d.q3)-x(d.q1))}" height="8" fill="var(--surface-hover)" stroke="var(--muted)"/><path d="M${x(d.median)} 2v12" stroke="var(--text)"/></svg>`;
}
export function cyclePeriodComparisonMarkup(analysis){
  const a=analysis;if(!a)return '';
  return `<div class="cycle-reference-comparison" data-status="${esc(a.status)}" data-as-of="${a.asOf}" data-scenario="${esc(a.scenarioId)}"><div class="cycle-macro-clock-table">${a.anchors.map(p=>`<button type="button" data-clock-inspect="${p.id}"><span>◇ ${p.label}</span><strong>${p.date}</strong><small>시계 민감 ${p.earliest}–${p.latest}</small></button>`).join('')}</div><div class="cycle-comparison-heading"><strong>예시 경로 기간 <span class="cycle-comparison-scroll-cue" title="표를 좌우로 이동" aria-hidden="true">↔</span></strong><span role="status">${a.status==='ready'?'민감도 7개 설정':a.status==='error'?'민감도 계산 실패':'민감도 계산 중'}</span>${a.status==='error'?'<button type="button" data-cycle-comparison-retry>다시 계산</button>':''}</div><div class="cycle-comparison-scroll" tabindex="0" role="region" aria-label="과거 분포와 미래 기간 민감도"><table><thead><tr><th>관계</th><th>선택 경로</th><th>과거 관측 분포</th><th>설정 민감도</th></tr></thead><tbody>${Object.values(a.byInterval).map(c=>{const d=c.history.distribution,s=c.sensitivity;return `<tr><th><button type="button" data-period-inspect="${esc(c.id)}">${esc(relationName(c.relation))}</button></th><td>${weeks(c.days)}주</td><td title="${esc(c.history.reason)}">${d?`${rangeText(d)}${historyPlot(d)}<small>중앙 ${weeks(d.median)}주 · n=${d.n}</small>`:c.history.status==='definition-mismatch'?'정의 다름 · 비교 제외':esc(c.history.reason)}</td><td>${s.status==='ready'?`${rangeText(s.distribution)}<small>${s.samples.length}/${s.expectedCount}개 · 미성립 ${s.missing.length}</small>`:s.status==='error'?'계산 실패':'계산 중'}</td></tr>`;}).join('')||'<tr><td colspan="4">선택한 경로에 분류할 미래 기간이 없습니다.</td></tr>'}</tbody></table></div><details><summary>분포·민감도 기준</summary><p>${esc(a.method)}</p><p>과거 분포는 최솟값·사분위·중앙값·최댓값입니다. 잠정 기준점과 미완성 구간은 제외합니다. MID-TOP의 과거·미래 선택 창은 달라 비교하지 않습니다. 민감도는 기존 경제 가정 5개와 선택 가정의 보조 시드 2개이며, 기준점이 없는 설정은 제외하고 개수를 표시합니다. 신뢰구간·발생 확률·예측 성적이 아닙니다.</p></details></div>`;
}

export function browserCyclePeriodWorkerFactory(){
  if(typeof Worker!=='function'||!/^https?:$/.test(globalThis.location?.protocol??''))return undefined;
  return ()=>new Worker(new URL('./cycle-period-worker.js',import.meta.url),{type:'module',name:'atlas-cycle-periods'});
}
