import { loadForecastIndex, loadForecastRecord, loadForecastSnapshot, loadForecastEvaluation, loadForecastExperiments, verifyForecastRecord, restoreForecastPath, compareForecastRecords } from './forecast-records.js?v=1.29.0';
import { drawAtlasPriceChart } from './atlas-price-chart.js?v=1.29.0';
import { mountDialogViewport } from './dialog-viewport.js?v=1.29.0';
import { describeFreshness } from './data-freshness.js?v=1.29.0';
import { performanceSnapshot, downloadPerformanceDiagnostics } from './performance-diagnostics.js?v=1.29.0';
import {mountForecastReplay} from './forecast-replay-view.js?v=1.29.0';

const esc=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const price=value=>Number.isFinite(value)?'$'+value.toLocaleString('en-US',{maximumFractionDigits:2}):'—';
const decimal=value=>Number.isFinite(value)?value.toFixed(4):'미평가';
const percent=value=>Number.isFinite(value)?(value*100).toFixed(2)+'%':'미평가';
const stamp=value=>value?new Intl.DateTimeFormat('ko-KR',{timeZone:'Asia/Seoul',dateStyle:'short',timeStyle:'short'}).format(new Date(value))+' KST':'확인되지 않음';
const day=value=>Date.parse(value+'T00:00:00Z')/86400000;
const fromDay=value=>new Date(value*86400000).toISOString().slice(0,10);
const tabs=[['records','보존본'],['replay','리플레이'],['evaluation','평가'],['changes','변경 이유'],['data','자료 상태'],['experiments','실험'],['performance','성능']];
let instance=null;
const resources=new Map();

async function resource(name,{signal}={}) {
  const embedded=document.getElementById(name==='publication'?'atlas-publication':'embedded-btc-data');
  if(embedded && ['publication','observed'].includes(name))return JSON.parse(embedded.textContent);
  const paths={publication:'publication.json',observed:'data/btc-daily.json',evaluation:'data/forecast-ledger/evaluation.json',experiments:'data/forecast-ledger/experiments.json'};
  const response=await fetch(new URL(paths[name],document.baseURI),{credentials:'omit',redirect:'error',cache:'no-cache',signal});
  if(!response.ok)throw new Error(`${name}: HTTP ${response.status}`);
  const body=await response.text();if(body.length>12_000_000)throw new Error('자료 크기 제한을 초과했습니다.');
  return JSON.parse(body);
}
function cached(name,loader) {
  if(!resources.has(name)&&resources.size>=32)resources.delete(resources.keys().next().value);
  if(!resources.has(name))resources.set(name,Promise.resolve().then(loader).catch(error=>{resources.delete(name);throw error;}));
  return resources.get(name);
}
function download(name,value) {
  const url=URL.createObjectURL(new Blob([JSON.stringify(value,null,2)+'\n'],{type:'application/json'}));
  const link=document.createElement('a');link.href=url;link.download=name;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
function table(headers,rows) {
  return `<div class="journal-table-scroll" tabindex="0" aria-label="결과 표 가로 이동"><table><thead><tr>${headers.map(text=>`<th scope="col">${esc(text)}</th>`).join('')}</tr></thead><tbody>${rows.length?rows.map(row=>`<tr>${row.map(text=>`<td>${esc(text)}</td>`).join('')}</tr>`).join(''):`<tr><td colspan="${headers.length}">해당 결과가 아직 없습니다.</td></tr>`}</tbody></table></div>`;
}

function mount() {
  const dialog=document.createElement('dialog');dialog.id='forecast-journal';dialog.className='forecast-journal';dialog.setAttribute('aria-labelledby','forecast-journal-title');
  dialog.innerHTML=`<header class="journal-heading"><h2 id="forecast-journal-title">예측 기록과 검증</h2><button type="button" data-journal-close aria-label="예측 기록 닫기">×</button></header><nav class="journal-tabs" aria-label="예측 기록 기능">${tabs.map(([id,label])=>`<button type="button" data-journal-tab="${id}" aria-pressed="false">${label}</button>`).join('')}</nav><div class="journal-body" id="forecast-journal-body" aria-live="polite"></div>`;
  document.body.append(dialog);mountDialogViewport(dialog);
  const content=dialog.querySelector('.journal-body');
  let generation=0,currentTab='records',opener=null,selectedId=null,comparisonId=null,days=180,selectedDate=null,resizeObserver=null,draw=null,replay=null;
  const checkedEntry=async entry=>{
    const [record,snapshot]=await Promise.all([cached('record:'+entry.id,()=>loadForecastRecord(entry)),cached('snapshot:'+entry.snapshotId,()=>loadForecastSnapshot(entry))]);
    await verifyForecastRecord(record,snapshot);return {record,snapshot};
  };
  const indexData=()=>cached('index',()=>loadForecastIndex());
  const selectMarkup=(entries,value,attribute)=>`<select ${attribute} aria-label="${attribute==='data-journal-record'?'보존한 예측 선택':'비교할 이전 예측 선택'}">${entries.map(entry=>`<option value="${entry.id}"${value===entry.id?' selected':''}>${esc(entry.asOf)} · ${esc(entry.scenarioLabel)} · ${entry.kind==='issued'?'생성·보존':'회고'}</option>`).join('')}</select>`;
  async function replayBody(index,token){
    const entries=[...index.entries].sort((a,b)=>b.issuedAt.localeCompare(a.issuedAt)||a.scenario.localeCompare(b.scenario));
    if(!entries.length){content.innerHTML='<p>재생할 보존 예측이 아직 없습니다.</p>';return;}
    const entry=entries.find(item=>item.id===selectedId)||entries.find(item=>item.scenario==='base')||entries[0];selectedId=entry.id;
    const {record,snapshot}=await checkedEntry(entry);
    if(token!==generation||!dialog.open)return;
    content.innerHTML='<div class="journal-controls">'+selectMarkup(entries,selectedId,'data-journal-record')+'</div><div data-journal-replay-host></div>';
    replay=mountForecastReplay(content.querySelector('[data-journal-replay-host]'),{record,snapshot,symbol:'BTCUSD',isActive:()=>dialog.open&&currentTab==='replay'&&token===generation});
  }
  async function recordsBody(index,token) {
    const entries=[...index.entries].sort((a,b)=>b.issuedAt.localeCompare(a.issuedAt)||a.scenario.localeCompare(b.scenario));
    if(!entries.length){content.innerHTML='<p>아직 보존한 예측이 없습니다. 실제 생성본이 기록되면 이곳에서 확인할 수 있습니다.</p>';return;}
    let entry=entries.find(item=>item.id===selectedId)||entries.find(item=>item.scenario==='base')||entries[0];selectedId=entry.id;
    const cadence=index.refresh?.publicationPolicy;
    const archiveNote=cadence?`공식 보존은 완료 관측 ${cadence.intervalObservationDays}일 간격이며 모델·설정 변경과 입력 정정은 즉시 추가합니다. 매일 기존 목표를 재평가합니다. 개별 화면에서 실행한 모든 계산을 수집한 기록은 아닙니다. 다음 가능 기준일 ${index.refresh.nextEligibleAsOf||'확인 중'}은 관측이 빠짐없이 추가될 때의 가장 이른 날짜입니다.`:'';
    const {record,snapshot}=await checkedEntry(entry);
    const observed=await cached('observed',()=>resource('observed'));
    if(token!==generation||!dialog.open)return;
    content.innerHTML=`<div class="journal-controls">${selectMarkup(entries,selectedId,'data-journal-record')}<select data-journal-range aria-label="기록 차트 표시 기간">${[[90,'90일'],[180,'180일'],[365,'1년'],[0,'전체 가정']].map(([value,label])=>`<option value="${value}"${days===value?' selected':''}>${label}</option>`).join('')}</select><button type="button" data-journal-export>기록 JSON</button></div><p class="journal-note">${esc(archiveNote)}</p><p class="journal-note"><strong>${record.recordKind==='issued'?'실제 생성·보존본':'현재 모델의 회고 재구성'}</strong> · 관측 ${esc(record.asOf)} · 생성 ${esc(stamp(record.issuedAt))}</p><div class="journal-chart"><svg id="journal-price-chart" tabindex="0" role="group" aria-label="고정된 예측 경로. 방향키로 날짜와 값을 확인하세요."></svg></div><p class="journal-selection" id="journal-selection"></p><p class="journal-note">흰색은 생성 당시 관측, 금색은 보존한 조건부 경로, 파란색은 이후 확보한 실제 관측입니다. 음영은 경제 가정 범위이며 포함확률이 아닙니다.</p>${table(['기간','목표일','보존한 경로','가격 유지','축소 추세'],record.targets.map(target=>[target.horizonDays+'일',target.targetDate,price(target.price),price(target.flat),price(target.shrunkenTrend)]))}<details class="journal-details"><summary>입력·모델·보존 근거</summary><dl><dt>자료 수집</dt><dd>${esc(stamp(snapshot.observedAt))}</dd><dt>공급원 공개시각</dt><dd>${esc(stamp(snapshot.availableAt))}</dd><dt>모델</dt><dd>${esc(record.model.version)}</dd><dt>생성 원본 커밋</dt><dd><code>${esc(record.model.sourceCommit)}</code></dd><dt>모델 소스 목록 해시</dt><dd>${esc(record.model.sourceHash)}</dd><dt>입력 해시</dt><dd>${esc(record.snapshotDataHash)}</dd><dt>출력 해시</dt><dd>${esc(record.outputHash)}</dd></dl><p>생성시각은 실제 공개 배포 완료시각과 다릅니다. 과거 공급원 판본을 소급 확보한 기록은 아닙니다. 입력·출력 해시는 열 때 검증합니다.</p><p><a href="https://github.com/twoimo/bitcoin-cycle-atlas/blob/main/docs/evolution-2026-10-26/SOURCE_PROVENANCE.md" target="_blank" rel="noopener noreferrer">원본 코드 보존·복원 방법</a></p></details>`;
    content.querySelector('[data-journal-export]').onclick=()=>download(`atlas-forecast-${record.asOf}-${record.scenario.id}.json`,{record,snapshot});
    const svg=content.querySelector('svg'),selection=content.querySelector('#journal-selection');
    const frozen=restoreForecastPath(record),end=days?fromDay(Math.min(day(record.output.displayEnd),day(record.asOf)+days)):record.output.displayEnd,start=fromDay(Math.max(day(snapshot.prices[0][0]),day(record.asOf)-90));
    const actual=observed.prices.filter(row=>row[0]>=record.asOf&&row[0]<=end);
    const observedMap=new Map(observed.prices);
    const rows=[...snapshot.prices.filter(([date])=>date<record.asOf).map(([date,price])=>({date,price})),...frozen];
    draw=()=>{
      if(!svg.isConnected||!dialog.open)return;
      let minimum=Infinity,maximum=0;
      for(const row of rows)if(row.date>=start&&row.date<=end){minimum=Math.min(minimum,row.lower||row.price,row.price);maximum=Math.max(maximum,row.upper||row.price,row.price);}
      for(const [,value]of actual){minimum=Math.min(minimum,value);maximum=Math.max(maximum,value);}
      const controller=drawAtlasPriceChart({svg,rows,start,end,split:record.asOf,scale:'log',priceDomain:{min:minimum*.95,max:maximum*1.05},band:true,selectedDate,showDrawdown:false,showTurns:false,showCycleMarkers:false,showHistoricalEvents:false,headerInset:16,dateTickMinSpacing:64,
        onHover:value=>{const date=value?.date;if(date){selectedDate=date;selection.textContent=`${date} · ${date>record.asOf?'보존한 가정':'당시 관측'} ${price(value.price)}${observedMap.has(date)&&date>record.asOf?' · 이후 실제 '+price(observedMap.get(date)):''}`;}}});
      if(actual.length>1&&controller){const axis=controller.getPriceScale(),x=date=>axis.left+(day(date)-day(start))/(day(end)-day(start))*(axis.right-axis.left);let previous=null;const d=actual.map(([date,value])=>{const command=previous!==null&&day(date)-day(previous)===1?'L':'M';previous=date;return command+x(date).toFixed(2)+','+axis.y(value).toFixed(2);}).join(' ');const path=document.createElementNS('http://www.w3.org/2000/svg','path');path.setAttribute('d',d);path.setAttribute('fill','none');path.setAttribute('stroke','#68b5ff');path.setAttribute('stroke-width','2');path.setAttribute('pointer-events','none');path.setAttribute('data-journal-actual','true');svg.append(path);}
    };
    draw();resizeObserver?.disconnect();if(typeof ResizeObserver==='function'){resizeObserver=new ResizeObserver(()=>draw?.());resizeObserver.observe(svg.parentElement);}
  }
  async function evaluationBody(token) {
    const report=await cached('evaluation',()=>loadForecastEvaluation());
    if(token!==generation||!dialog.open)return;
    if(report.kind!=='atlas-forecast-evaluation'||!Array.isArray(report.summaries))throw new Error('평가 자료 형식이 다릅니다.');
    content.innerHTML=`<h3>생성·보존 후 누적 평가</h3><p class="journal-note">평가 관측 ${esc(report.observationThrough)} · 기록 ${report.records}개 · 고유 기준일 ${report.uniqueOrigins}개 · 확정 결과 ${report.maturedTargets}개. 겹친 예측 오차는 독립 실험이 아닙니다.</p>${table(['가정','모델 판본','기간','확정 / 대기','로그 오차','유지 기준','축소 추세','유지 대비 개선'],report.summaries.map(row=>[row.scenarioLabel,row.modelVersion+' · '+row.modelSourceHash.slice(0,10),row.horizonDays+'일',row.scoredCount+' / '+row.pendingCount,decimal(row.meanAbsoluteLogError),decimal(row.flatMeanAbsoluteLogError),decimal(row.trendMeanAbsoluteLogError),percent(row.skillVersusFlat)]))}<p class="journal-note">로그 오차는 작을수록 좋고, 기준 대비 개선은 양수일 때 유리합니다. 모델 코드와 비교 기준 판본이 다른 결과는 합산하지 않습니다. 직전 완료 일봉으로 실제 생성한 뒤 확정된 목표만 점수에 넣고, 미도래 목표는 미평가로 남깁니다. 표의 기간은 기준 종가부터 세며, 생성 이후 남은 실제 기간은 목표별 표에서 확인합니다. 조건부 음영과 2050년 경로의 정확도·포함확률을 검증한 점수는 아닙니다.</p><details class="journal-details"><summary>목표별 상태와 표본</summary>${table(['기준일','가정','목표일','생성 후 남은 일수','상태','실제','예측'],report.rows.slice(-300).map(row=>[row.asOf,row.scenarioLabel,row.targetDate,Number.isFinite(row.actualLeadDays)?row.actualLeadDays.toFixed(2):'미상',({pending:'결과 대기',scored:'확정',retrospective:'회고', 'missing-observation':'관측 결측'})[row.status]||row.status,price(row.actual),price(row.predicted)]))}<p>최근 최대 300개 목표를 표시합니다. 전체 결과와 비교 기준 판본은 JSON에 포함됩니다.</p></details><button type="button" data-evaluation-export>평가 JSON</button>`;
    content.querySelector('[data-evaluation-export]').onclick=()=>download('atlas-forecast-evaluation.json',report);
  }
  async function changesBody(index,token) {
    const entries=[...index.entries].sort((a,b)=>b.issuedAt.localeCompare(a.issuedAt));
    if(entries.length<2){content.innerHTML='<p>비교할 보존본이 두 개 이상 쌓이면 입력·모델·가정 변화와 같은 목표일의 가격 차이를 보여 줍니다.</p>';return;}
    const next=entries.find(item=>item.id===selectedId)||entries.find(item=>item.scenario==='base')||entries[0];selectedId=next.id;
    const choices=entries.filter(item=>item.id!==next.id),before=choices.find(item=>item.id===comparisonId)||choices.find(item=>item.scenario===next.scenario)||choices[0];comparisonId=before.id;
    const [{record:old},{record:current}]=await Promise.all([checkedEntry(before),checkedEntry(next)]);
    if(token!==generation||!dialog.open)return;
    const result=compareForecastRecords(old,current);
    content.innerHTML=`<h3>보존본의 변경 이유</h3><label class="journal-field">기준 ${selectMarkup(choices,before.id,'data-journal-compare')}</label><label class="journal-field">비교 ${selectMarkup(entries,next.id,'data-journal-record')}</label><p class="journal-note">${result.sameScenario?'같은 가정의 두 기록':'서로 다른 경제 가정의 비교'} · 입력 ${result.inputChanged?'변경':'동일'} · 모델 코드 ${result.modelChanged?'변경':'동일'} · 설정 ${result.optionsChanged?'변경':'동일'} · 관측 기준일 ${result.originChanged?'변경':'동일'}</p>${table(['공통 목표일','기준 가격','비교 가격','전체 Δlog','기준선','주기','잔차 경로','나머지'],result.changes.map(row=>[row.targetDate,price(row.beforePrice),price(row.afterPrice),decimal(row.totalLogChange),decimal(row.baselineLogChange),decimal(row.cycleLogChange),decimal(row.residualLogChange),decimal(row.remainderLogChange)]))}<p class="journal-note">같은 목표일의 로그가격 차이를 산술 분해합니다. 각 성분은 같은 입력 변화의 영향을 함께 받을 수 있습니다. 시장 사건의 인과적 기여도를 추정한 값은 아닙니다.</p>`;
  }
  async function dataBody(token) {
    const publication=await cached('publication',()=>resource('publication'));
    if(token!==generation||!dialog.open)return;
    if(publication.kind!=='atlas-publication'||!Array.isArray(publication.assets))throw new Error('공개 자료 명세 형식이 다릅니다.');
    const now=new Date().toISOString();
    const list=publication.assets.map(asset=>{const old=asset.freshness;return {...asset,freshness:describeFreshness({latestDate:old.latestDate,market:old.market,observedAt:old.observedAt,lastAttemptAt:old.lastAttemptAt,lastOutcome:old.lastOutcome,gaps:old.knownGapCount||0,disagreement:old.disagreement,comparable:old.comparable},now)};});
    content.innerHTML=`<h3>관측·수집·공개 묶음</h3><p class="journal-note">기준 코드 ${esc(publication.sourceCommit.slice(0,12))}${publication.sourceTree?.status==='modified-preview'?' · 작업 중 미리보기':''} · 묶음 생성 ${esc(stamp(publication.generatedAt))}. 최신성은 지금 시각과 완료 봉 정책으로 다시 판단합니다.</p>${table(['자산','화면','최종 관측','기대 관측','상태','수집 시각'],list.map(asset=>[asset.symbol,asset.role==='chart'?'차트':'비교표',asset.freshness.latestDate,asset.freshness.expectedDate||'달력 범위 밖',asset.freshness.label,stamp(asset.freshness.observedAt)]))}<h3>공통 이용시각 비교</h3><p class="journal-note">${esc(publication.alignment.comparisonTime)} 기준 · 현재 보존 판본을 완료 봉 정책으로 정렬한 회고 비교입니다. 가격을 실제 동시 체결가로 간주하지 않습니다.</p>${table(['자산','사용한 날짜','가격','세션 종료 UTC','기준시각까지 경과'],publication.alignment.rows.map(row=>[row.symbol,row.observation?.date||'없음',price(row.observation?.price),row.observation?.sessionCloseUtc||'확인되지 않음',Number.isFinite(row.observation?.ageHours)?row.observation.ageHours+'시간':'확인되지 않음']))}<p class="journal-note">알려진 결측은 보존한 전체 이력의 누락을 뜻하며, 최신 날짜가 누락되었다는 뜻과 구분합니다. 주식 일봉은 기존의 보수적인 다음 UTC 날짜 수용 정책을 유지합니다. 공개시각을 확보하지 못한 공급원은 공개시각 미상이며, 달력의 종료시각으로 대체하지 않습니다.</p><button type="button" data-publication-export>자료 명세 JSON</button>`;
    content.querySelector('[data-publication-export]').onclick=()=>download('atlas-publication.json',publication);
  }
  async function experimentBody(token) {
    const report=await cached('experiments',()=>loadForecastExperiments());
    if(token!==generation||!dialog.open)return;
    const sequential=report.sequential,cycle=report.cycleAblation,policy=sequential?.policy;
    if(!Array.isArray(sequential?.summaries)||!Array.isArray(cycle?.summaries)||!policy)throw new Error('실험 요약 형식이 다릅니다.');
    const status=value=>value==='not-adopted'?'미채택':'검토 필요';
    content.innerHTML=`<h3>고정된 회고 실험 · ${esc(report.asOf)}</h3><p class="journal-note">${esc(report.sourceCommit?.slice(0,12))} 코드로 현재 보존된 과거 자료를 순서대로 평가한 연구입니다. 각 예측에는 그 기준일까지의 관측 날짜와 그때까지 완료된 목표 오차만 사용합니다. 실험 규칙은 이번 개발 중 정해 판본을 보존했습니다. 사전 등록된 실험이나 손대지 않은 검증 집합으로 해석하지 않습니다. 당시 실제 모델의 성적이나 과거 공급원 판본을 확보했다는 뜻은 아닙니다.</p><h3>변동성으로 축소한 추세 · ${status(sequential.adoption?.status)}</h3><p class="journal-note">채택 기준: 겹치지 않는 목표 구간 ${policy.minimumDisjointEvaluationCases}개 이상, 더 좋은 단순 기준보다 로그 오차 ${percent(policy.pointImprovementThreshold)} 이상 개선, ${policy.requiredImprovedHorizons}개 이상 기간 통과, 이후 실제 생성본의 성과 확인. 회고 기준 통과 ${sequential.adoption.qualifyingRetrospectiveHorizons} / ${policy.horizons.length}개 · 이후 실제 성과 ${sequential.adoption.prospectiveGatePassed?'확인':'미확인'}.</p>${table(['기간','전체 / 비중첩 구간','유지 로그 오차','축소 추세 오차','후보 오차'],sequential.summaries.map(row=>[row.horizonDays+'일',row.completedCases+' / '+row.disjointTargetIntervals,decimal(row.disjointMeanAbsoluteLogErrors.flat),decimal(row.disjointMeanAbsoluteLogErrors.shrunkenTrend),decimal(row.disjointMeanAbsoluteLogErrors.volatilityTrend)]))}<p class="journal-note">표의 오차는 겹치지 않는 목표 구간에서 계산합니다. 비중첩 구간도 시장 의존성이 사라진 독립 표본으로 간주하지 않습니다.</p><h3>확정 오차로 만든 실험 구간 · ${status(sequential.intervalAdoption?.status)}</h3>${table(['기간','평가 사례','실제 포함률','평균 log 폭','구간 점수','고정 변동성 기준'],sequential.summaries.map(row=>[row.horizonDays+'일',row.intervalCases,percent(row.empiricalCoverage),decimal(row.meanLogWidth),decimal(row.meanLogIntervalScore),decimal(row.baselineMeanLogIntervalScore)]))}<p class="journal-note">각 기준일 이전에 결과가 확정된 오차만 보정에 사용합니다. 폭과 벌점을 함께 반영한 구간 점수는 작을수록 좋습니다. 회고 포함률은 미래의 개별·조건부 포함확률을 보장하지 않으며, 기존 경제 가정 음영을 확률 구간으로 바꾸지 않습니다.</p><h3>주기 성분 제거 실험 · ${status(cycle.adoption?.status)}</h3>${table(['기간','사례 / 비중첩 구간','현재 주기','고정 시계','주기 성분 제거','가격 유지'],cycle.summaries.map(row=>[row.horizonDays+'일',row.completedCases+' / '+row.disjointTargetIntervals,decimal(row.meanAbsoluteLogErrors.adaptive),decimal(row.meanAbsoluteLogErrors.fixedClock),decimal(row.meanAbsoluteLogErrors.withoutCycleComponent),decimal(row.meanAbsoluteLogErrors.flat)]))}<p class="journal-note">고유 기준일 ${cycle.uniqueOrigins}개 · 완료 사례 ${cycle.cases.length}개 · 건너뛴 기준일 ${cycle.skipped.length}개. 로그가격의 주기 성분만 제거하고 잔차 경로는 공유합니다. 독립적으로 학습한 새 모델이나 보편적인 3–5개월 가속 법칙을 검증한 결과는 아닙니다.</p><details class="journal-details"><summary>실험 판본과 조건</summary><pre></pre></details><button type="button" data-experiments-export>전체 사례 JSON</button>`;
    content.querySelector('pre').textContent=JSON.stringify({asOf:report.asOf,sourceCommit:report.sourceCommit,sourceHash:report.sourceHash,experimentSourceHash:report.experimentSourceHash,observationHash:report.observationHash,policyHash:report.policyHash,policy,scope:report.scope},null,2);
    content.querySelector('[data-experiments-export]').onclick=()=>download('atlas-forecast-experiments.json',report);
  }
  function performanceBody() {
    const report=performanceSnapshot();
    const names={'first-view':'첫 화면','page-navigation':'화면 이동','forecast-computation':'예측 계산','scenario-change':'가정 변경'};
    content.innerHTML=`<h3>이 탭의 성능 기록</h3><p class="journal-note">브라우저에서 관측한 이 세션의 기록입니다. 방문자 전체의 75백분위나 실물 휴대전화 측정값이 아닙니다. 외부로 자동 전송하지 않습니다.</p>${table(['동작','경과 ms','상태','계산 방식'],report.actions.entries.slice(-30).map(row=>[names[row.name]||row.name,row.durationMs.toFixed(1),row.details.status||'완료',row.details.mode||'—']))}<p class="journal-note">화면 준비는 두 번의 애니메이션 프레임까지 측정합니다. 물리 화면 표시 시각이나 INP를 대신하지 않습니다. 최근 최대 30개 동작을 표시하며 전체 제한·관측값은 JSON에 포함됩니다.</p><details class="journal-details"><summary>환경과 브라우저 관측값</summary><pre></pre></details><button type="button" data-performance-export>진단 JSON</button>`;
    content.querySelector('pre').textContent=JSON.stringify(report,null,2);
    content.querySelector('[data-performance-export]').onclick=downloadPerformanceDiagnostics;
  }
  async function render(tab=currentTab,focusSelector=null) {
    replay?.destroy();replay=null;
    currentTab=tabs.some(([id])=>id===tab)?tab:'records';const token=++generation;resizeObserver?.disconnect();draw=null;
    for(const button of dialog.querySelectorAll('[data-journal-tab]'))button.setAttribute('aria-pressed',String(button.dataset.journalTab===currentTab));
    content.innerHTML='<p role="status">검증한 기록을 불러오는 중입니다.</p>';
    try {
      if(currentTab==='performance'){performanceBody();return;}
      if(currentTab==='data'){await dataBody(token);return;}
      if(currentTab==='evaluation'){await evaluationBody(token);return;}
      if(currentTab==='experiments'){await experimentBody(token);return;}
      const index=await indexData();if(token!==generation||!dialog.open)return;
      if(currentTab==='changes')await changesBody(index,token);else if(currentTab==='replay')await replayBody(index,token);else await recordsBody(index,token);
    } catch(error) {
      if(token!==generation||!dialog.open)return;
      content.innerHTML=`<p role="alert">기록을 확인하지 못했습니다. ${esc(error.message)}</p><button type="button" data-journal-retry>다시 확인</button>`;
    } finally {
      if(focusSelector&&token===generation&&dialog.open&&(document.activeElement===document.body||document.activeElement===dialog))content.querySelector(focusSelector)?.focus({preventScroll:true});
    }
  }
  dialog.addEventListener('click',event=>{
    if(event.target.closest('[data-journal-close]'))dialog.close();
    const tab=event.target.closest('[data-journal-tab]');if(tab)void render(tab.dataset.journalTab);
    if(event.target.closest('[data-journal-retry]')){resources.clear();void render();}
  });
  dialog.addEventListener('change',event=>{
    if(event.target.matches('[data-journal-record]'))selectedId=event.target.value;
    else if(event.target.matches('[data-journal-compare]'))comparisonId=event.target.value;
    else if(event.target.matches('[data-journal-range]'))days=Number(event.target.value);
    else return;
    const focusSelector=['data-journal-record','data-journal-compare','data-journal-range'].find(name=>event.target.hasAttribute(name));
    void render(currentTab,focusSelector?'['+focusSelector+']':null);
  });
  dialog.addEventListener('close',()=>{if(dialog.open)return;generation++;replay?.destroy();replay=null;resizeObserver?.disconnect();draw=null;if(opener?.isConnected&&opener.getClientRects().length)opener.focus({preventScroll:true});});
  dialog.addEventListener('keydown',event=>event.stopPropagation());
  document.addEventListener('atlas:modal-open',event=>{if(event.detail?.id!==dialog.id&&dialog.open)dialog.close();});
  window.addEventListener('pagehide',()=>{replay?.destroy();replay=null;if(dialog.open)dialog.close();});
  return {open({tab='records',opener:source=document.activeElement}={}){opener=source;for(const key of ['index','evaluation','experiments','publication','observed'])resources.delete(key);document.dispatchEvent(new CustomEvent('atlas:modal-open',{detail:{id:dialog.id}}));if(!dialog.open)dialog.showModal();dialog.querySelector('[data-journal-close]').focus({preventScroll:true});void render(tab);}};
}
export function openForecastJournal(options={}) {instance ||= mount();instance.open(options);}
