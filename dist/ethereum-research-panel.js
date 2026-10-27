import {ETH_RESEARCH_SOURCES} from './ethereum-research-catalog.js';
import {ethereumAgentDemand} from './ethereum-adoption-scenarios.js';
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmt=n=>new Intl.NumberFormat('ko-KR',{maximumFractionDigits:2}).format(n);
export function ethereumResearchPanel(forecast,error,model=forecast?.researchModel??'adaptive'){
  const pooled=model==='pooled';
  const t=forecast?.training,m=forecast?.metadata,anchor=forecast?.path[0]?.price;
  const state=s=>s==='up'?'상승 확인 상태':'하락 확인 상태';
  const modelDetails=t?(pooled?
    '<dt>충격·변동성 표본</dt><dd>'+fmt(t.returnCount)+'개 수익률 · 상태 확인 전 관측도 사용</dd>'+
    '<dt>미래 평균 정책</dt><dd>명시적 로그수익률 평균 0 · 가격 기대수익률 0이나 중앙값 고정 보장은 아닙니다.</dd>':
    '<dt>현재 상태</dt><dd>'+state(t.currentState)+' · '+esc(t.currentStateKnownAt)+'에 확인 · '+t.currentAge+'일 경과, 미종료</dd>'+
    '<dt>완료된 상태</dt><dd>상승 '+t.states.up.switches+'회 / 하락 '+t.states.down.switches+'회 · 독립 거시 주기 수가 아닙니다.</dd>'+
    '<dt>충격·변동성 표본</dt><dd>'+fmt(t.classifiedReturns)+'개 수익률 · 상태 미분류 '+fmt(t.unclassifiedReturns)+'개 제외</dd>'):'';
  const fit=t?'<dl><dt>실제 관측</dt><dd>'+esc(t.firstObservation)+' – '+esc(t.informationThrough)+' · '+fmt(t.observations)+'일</dd>'+
    modelDetails+
    '<dt>현재 연환산 변동성</dt><dd>'+fmt(Math.sqrt(t.currentVariance*365)*100)+'% · 로그수익률 모형값</dd>'+
    '<dt>표시 기간</dt><dd>'+esc(forecast.asOf)+' – '+esc(forecast.displayEnd)+' · 최대 730일, 장기 검증 아님</dd>'+
    '<dt>모의 경로</dt><dd>'+m.sampleCount+'개 · seed '+m.seed+' · 점별 10–90% 분위수</dd></dl>':
    '<p class="eth-data-error">'+esc(error||'완료 일봉 자료를 준비하고 있습니다.')+'</p>';
  let demand='';
  if(anchor){
    const example={paidRequestsPerDay:1000000,ethereumShare:.25,settlementsPerRequest:.01,l1DirectShare:.05,
      l1GasPerSettlement:50000,l2L1GasPerSettlement:100,blobGasPerSettlement:500,
      executionBaseFeeGwei:1,blobBaseFeeGwei:.01,priorityFeeGwei:.1,ethPriceUsd:anchor,workingBalanceDays:7};
    const a=ethereumAgentDemand(example),b=ethereumAgentDemand({...example,paidRequestsPerDay:10000000,settlementsPerRequest:.001});
    demand='<details><summary>AI 요청이 10배 늘어도 소각이 같을 수 있는 이유</summary>'+
      '<p>아래는 실제 관측이나 전망이 아닌 계산 예시입니다. 유료 요청 하루 100만 건, Ethereum 경로 25%, 요청 100개당 정산 1건을 가정합니다. L1 직접 5%, 직접 실행 gas 50,000, L2 정산에 배분한 L1 gas 100·blob gas 500, 실행 기본 수수료 1 gwei·blob 0.01 gwei·우선 수수료 0.1 gwei, 운영 잔액 7일을 입력했습니다.</p>'+
      '<dl><dt>가정한 연간 정산</dt><dd>'+fmt(a.annualSettlements)+'건</dd><dt>추가 소각</dt><dd>'+fmt(a.annualBurnEth)+' ETH/년</dd>'+
      '<dt>검증자 우선 수수료</dt><dd>'+fmt(a.annualPriorityFeesEth)+' ETH/년 · 소각과 별도</dd><dt>L1 비용용 운영 잔액</dt><dd>'+fmt(a.workingBalanceEth)+' ETH · 연간 지출 전체를 잠그지 않습니다.</dd>'+
      '<dt>요청 10배·묶음 효율 10배</dt><dd>'+fmt(b.annualBurnEth)+' ETH/년 · 소각 동일</dd></dl>'+
      '<p>USDC 결제 원금·L2 운영사 수익·결제 대행료·중복 담보는 소각에 더하지 않습니다. 발행·기존 소각 입력이 없어 순공급 변화와 ETH 목표가격은 계산하지 않습니다.</p></details>';
  }
  return '<p class="eth-data-lead">'+(pooled?'ETH 전체 수익률·변동성 비교 후보':'ETH 자체 기간·변동성 연구 모형')+'</p>'+fit+
    '<p>파란 점선은 모형 중앙값, 금색 점선은 모의 예시 1개입니다. 음영은 가정한 모형에서 생성한 10–90% 분위수이며 실제 80% 적중률·신뢰구간·전체 경로 보장을 뜻하지 않습니다.</p>'+
    (pooled?
      '<p>Merge 이후 마지막 결측 다음부터 기준일까지의 연속 수익률 전체로 변동성과 충격을 추정합니다. 상태별 기간·방향을 사용하지 않으며 과거 평균을 미래 상승률로 넣지 않습니다. 28일 잔차 블록과 매일 갱신되는 변동성을 사용합니다.</p>'+
      '<p>기존 모형과 상태 사용·표본 범위·평균 정책이 함께 달라집니다. 어느 한 요소의 단독 효과나 예측력 우월성은 이 차이만으로 입증되지 않습니다. 모형 계수의 추정 불확실성은 음영에 포함되지 않습니다.</p>':
      '<p>고점·저점이 보였던 날로 상태를 소급하지 않습니다. 40% 하락 또는 20% 반등이 14일 유지된 뒤 상태를 확인하고, 그 다음 날부터 수익률을 배정합니다. 상태의 지속기간과 변동성은 ETH에서 추정하며 3년 상승·1년 하락을 고정하지 않습니다.</p>'+
      '<p>상태별 수익률 평균을 0 쪽으로 줄이고 그 영향도 180일 반감기로 감소시킵니다. 표준화 과거 잔차의 28일 블록을 추출하며 변동성은 매일 갱신합니다. 이 수치 정책과 730일 경로의 예측력이 입증된 것은 아닙니다. 모형 계수의 추정 불확실성은 음영에 포함되지 않습니다.</p>')+
    '<p>이 화면에는 원래 모의 분위수를 표시합니다. 과거 오차를 이용한 실험적 보정은 별도 평가하며, 30·90·180일마다 성숙한 비중첩 오차가 최소 12개 필요합니다. 검증 보고서의 과거 기준일 결과를 현재 화면의 보정 완료로 사용하지 않습니다.</p>'+
    '<p>2025년 8월 ETH도 달러 최고가를 경신했습니다. BTC 대비 상대성과, 장중 고가와 UTC 종가를 구분해야 합니다. PoS 전환만으로 이후 가격 차이의 원인을 확정할 수 없습니다.</p>'+
    '<p>ETH와 BMNR가 함께 쓰던 외부 평가 조건은 모형 선택에서 별도로 확인할 수 있습니다. 보존 발행본은 발행 당시의 모형을 유지하며 이 새 연구 경로의 성과로 세지 않습니다.</p>'+
    demand+'<details><summary>기관 전망·논문·프로토콜 원문 '+ETH_RESEARCH_SOURCES.length+'개</summary>'+
    '<p>자료 기준일과 주장 범위를 대조했습니다. 보고서의 목표가격은 새 중앙선에 자동 입력하지 않습니다.</p>'+
    ETH_RESEARCH_SOURCES.map(s=>'<p><a href="'+esc(s.url)+'" target="_blank" rel="noopener noreferrer">'+esc(s.label)+' ↗</a><br><small>'+esc(s.date)+'</small><br>'+esc(s.finding)+'</p>').join('')+'</details>'+
    '<p><a href="https://github.com/twoimo/bitcoin-cycle-atlas/blob/chatgpt/eth-cycle-economics-20261026/docs/ETH_REMODELING_RESEARCH_20261027.md" target="_blank" rel="noopener noreferrer">계산식·출처 대조·과거 비교 결과 전체 보고서 ↗</a></p>'+
    '<p><a href="https://github.com/twoimo/bitcoin-cycle-atlas/blob/chatgpt/eth-cycle-economics-20261026/docs/ETH_POOLED_FOLLOWUP_20261027.md" target="_blank" rel="noopener noreferrer">전체 수익률 후보·같은 원점 비교·구간 보정 상태 ↗</a></p>';
}
