# ETH 전체 수익률 후보와 구간 비교 — 2026-10-27 후속

## 범위와 상태

기존 adaptive v1은 기본 화면과 계산식을 유지한다. 새 `pooledEth`는 Merge 이후 마지막 결측 다음부터 기준일까지의 **모든 연속 수익률**을 이용하는 별도 연구 후보이다. UI 선택값은 `pooled`이고 세 번째 기존 외부 평가 조건 `valuation`도 유지한다. 이 문서는 새 점수 실행 전에 고정한 정책과 검증 범위를 기록한다. 실제 실행 결과는 아래 실행 절에 별도로 추가한다.

이전 비교는 [20261027-remodel 원본](eth-candidate-evidence/20261027-remodel/README.md)에 보존한다. 새 결과를 이전 결과에 덮어쓰지 않는다. 사용자가 Gemini 반대 검토와 후속 역검토를 생략하라고 지시했으므로 두 항목은 **omitted-by-user**, 완료 또는 통과가 아니다. PR은 Draft이며 병합·배포·실거래 예측 승인과 별개다.

## 1. 발견한 표본 선택 문제

기존 v1의 실제 기준일 2026-10-25에는 post-Merge 1,502개 일별 관측이 있었다. 상태가 확인된 다음 날의 588개 수익률만 상태별 평균, 분산, 혁신 충격 계산에 들어가고, 상태 미분류 913개 수익률은 충격·변동성 추정에서도 제외된다. 상태가 확정되지 않은 기간의 가격 변화도 관측 가능하므로, 전체 1,501개 수익률을 사용하는 비교 후보를 추가한다.

이는 기존 결과를 틀렸다고 단정하거나 913개를 임의 상태로 분류하는 수정이 아니다. 상태 미사용, 학습 표본 확대, 명시적 미래 drift 0이 **동시에** 달라진다. 결과 차이를 어느 한 요소의 단독 인과 효과라고 해석할 수 없다. 하락 확인 상태의 관측 평균이 양수라고 해서 음수로 강제하지도 않는다.

## 2. 고정 수학 정책

`ETH_POOLED_POLICY.version = eth-pooled-volatility-research-1`

| 항목 | 정책 |
|---|---|
| 학습 시작 | 2022-09-15, Merge 이후 |
| 최소 연속 관측 | 366일 |
| 변동성 계수 | alpha 0.06, beta 0.92 |
| 잔차 블록 | 원형 28일 |
| 기본 모의 경로 | 256개 |
| 최대 경로 | 2,048개 |
| 최대 미래 기간 | 730일 |
| 기본 seed | 20261027 |
| 명시적 미래 로그 drift | 0 |
| 과거 판본·전향 점수 | 미확보 / 0 |
| 기본 모형 승격 | 하지 않음 |

가격 수익률은 $r_i=\log P_i-\log P_{i-1}$이다. 기준일까지의 표본 평균 $\bar r$과 표본 분산 $s^2$를 구한다. 평균은 잔차 중심화에만 쓰며 미래 상승률로 넣지 않는다.

$$
e_i=r_i-\bar r,\quad z_i=e_i/\sqrt{v_{i-1}},\quad v_0=s^2
$$
$$
v_i=0.02s^2+0.06e_i^2+0.92v_{i-1}.
$$

분모는 해당 수익률 **이전**의 분산이다. $z_i$를 전체 평균 0, 모집단 2차 모멘트 1로 다시 정규화한다. 각 미래 경로는 표준화 잔차를 원형 28일 블록으로 추출하고 다음을 적용한다.

$$
\log P_{t+1}=\log P_t+\sqrt{v_t}z_{t+1},
\qquad
v_{t+1}=0.02s^2+0.06(\sqrt{v_t}z_{t+1})^2+0.92v_t.
$$

표시 중앙선은 각 날짜의 모의 가격 중앙값이고, 음영은 q10–q90이다. 첫 번째 모의 경로는 독립적인 예시이므로 음영 밖으로 나갈 수 있다. 이 경우 밴드를 예시 경로까지 넓히지 않는다. 미래 OHLC와 거래량을 만들지 않는다.

**명시적 drift 0은 가격 기대수익률 0, 다음 잔차의 조건부 평균 0, 가격 martingale 또는 매일 같은 중앙값을 뜻하지 않는다.** 블록 의존성, 과거 충격의 비대칭, 변동성 재귀, Monte Carlo 오차를 구분해야 한다. 계수 추정 불확실성은 밴드에 포함되지 않는다.

정책은 이 후속 후보의 점수를 확인하기 전에 고정한다. 다만 이미 과거 자료와 v1 결과를 본 뒤 설계했으므로 과거 기간에 사전 등록된 정책이나 untouched holdout이라고 주장하지 않는다. 새 점수를 보고 alpha/beta, 블록 길이, seed를 최적화하지 않는다.

## 3. 공정한 비교와 보정 상태

새 후보의 학습 가능 날짜는 v1과 다를 수 있다. 전체 가용 원점 평균만 서로 비교하지 않는다. 두 모형이 모두 가능한 같은 원점의 교집합을 만든 다음, 미래 구간이 겹치지 않는 사례를 선택한다. 비중첩이라는 이유만으로 독립적인 시장 표본이 되는 것은 아니다.

새 `summarizeEthereumIntervalPair`는 양쪽의 원래 bounds와 실제 결과에서 coverage, 로그 폭, interval score를 다시 계산한다. 미리 저장된 covered/score 캐시를 신뢰하지 않는다. 미래·pending·결측 실제값은 채점하지 않으며 역전 구간, 중복 공통 원점, 다른 horizon 또는 다른 명목 질량은 명시적으로 거부한다.

같은 alpha 0.2와 로그 좌표에서:

$$
IS_\alpha(l,u;y)=(u-l)+\frac{2}{\alpha}(l-y)1(y<l)+\frac{2}{\alpha}(y-u)1(y>u).
$$

폭과 범위 밖 오차를 함께 벌점화하므로, 구간을 무작정 넓혀 coverage만 올리는 것을 개선으로 세지 않는다. 이것은 단일 중앙 구간의 interval score이며 WIS라고 부르지 않는다. [Gneiting–Raftery 2007 §6.2 식 43](https://sites.stat.washington.edu/raftery/Research/PDF/Gneiting2007jasa.pdf).

30·90·180일마다 세 비교를 고정한다.

1. adaptive raw ↔ pooled raw
2. adaptive raw ↔ adaptive empirical
3. pooled raw ↔ pooled empirical

기존 `calibrateLogInterval`을 그대로 사용한다. 같은 horizon에서 현재 원점까지 결과가 완료된 이전 오차만 사용하며, 최소 비중첩 사례 12개 정책을 낮추지 않는다. `currentIntervalEvidence`가 실제 계산된 `usedCount`, `usedOrigins`, `latestOutcomeUsed`, 부족 상태를 보존한다. 보정이 불가능하면 raw 밴드를 보정 구간으로 이름만 바꾸지 않는다.

12개는 고정 실험 정책이지 80% 보장 정리가 아니다. [Gibbs–Candès ACI](https://arxiv.org/html/2106.00170v3)의 장기 빈도 결과를 개별 미래일의 유한 양수 밴드 보장으로 옮기지 않는다. [Wang–Hyndman multi-step 연구](https://arxiv.org/html/2410.13115v1)처럼 h일 목표의 결과 피드백은 h일 뒤에 관측된다. 30일 오차로 180일 결과를 앞당겨 보정하지 않는다.

## 4. 실제 공개 경제 관측의 제한적 연결

새 수집기는 아래 **두 고정 URL**을 한 번씩 읽는다. redirect 금지, 요청별 45초, 응답별 8 MiB, 최대 50,000일, 재시도 없음이다.

- [growthepie master](https://api.growthepie.com/v1/master.json)
- [Ethereum throughput](https://api.growthepie.com/v1/metrics/chains/ethereum/throughput.json)

[공식 metric schema](https://docs.growthepie.com/api-reference/api/metric-detail-json)와 읽은 [backend 567f604](https://github.com/growthepie/gtp-backend/tree/567f60415e8b48eb84f7b08e1bd83c8ca99995bf)에 따라 Ethereum L1 identity, `details.metric_id`, `daily.types=[unix,value]`, UTC 자정 Unix **milliseconds**, 연속 28개 완료 일자, numeric nonnegative 값을 검사한다. 요청한 마지막 완료일과 실제 최신 관측일의 차이를 따로 남긴다. 최신 관측일은 수집 UTC 일자에서 7일 이내여야 한다.

응답은 **Mgas/s**이다. backend의 SQL은 일별 gas 합계/86,400, serializer는 다시 1,000,000으로 나눈다. 따라서 보조 관측은:

$$
G_{28}^{rate}=\sum_{d=1}^{28} throughput_d \times 86400 \times 1000000.
$$

collector는 추가 반올림을 하지 않는다. 현재 데이터의 정확한 정수 gas 복원, 독립 node 기준 네트워크 완전성, hosted backend가 읽은 commit과 일치한다는 주장은 하지 않는다. 프로젝트 계약이 float를 무조건 금지해서가 아니라, 이 파생 관측의 정밀도·완전성 승격 근거가 아직 없기 때문에 **l1GasUsedRateDerived 보조 관측**으로 남긴다.

`last_updated_utc`는 공급자가 JSON을 생성한 시각이다. `providerGeneratedAt`로 기록하고 `publishedAt:null`, `historicalPointInTimeReady:false`를 유지한다. 실제 요청·수신·완료 시각, HTTP 상태, raw bytes·SHA-256 및 오류를 artifact에 보존한다. 미수신 응답의 가짜 JSON을 만들지 않는다.

**strict matched 0/25, full-model snapshot 0, price-model activation false를 유지한다.** 실제 수집 성공과 경제 모형 입력 승격은 별개다. workflow의 optional 수집 실패는 해당 step outcome과 receipt에 그대로 기록하며 전체 CI success로 수집 성공을 대신하지 않는다.

현재 [데이터 이용 조건](https://www.growthepie.com/data-terms)은 CC BY 4.0이다. 표기는 **Source: growthepie, https://www.growthepie.com.** 원자료가 아닌 rate→gas 파생 계산임을 명시하고 응답의 upstream 출처가 있으면 함께 보존한다.

## 5. 회귀·화면·성능 검증 범위

동일 ETH/BTC 입력 hash일 때 실제 CI가 이전 v1의 731개 경로 값, 모의 메타데이터, 기존 9개 모형의 모든 요약 행·기존 pairwise·현재 예측을 이전 보존 결과와 정확 비교한다. 입력이 달라지면 같다고 주장하지 않고 비교 불가로 남긴다.

의미 있는 검사는 다음을 포함한다.

- 상태가 끝내 확인되지 않는 가격에서도 전체 수익률 적합 가능.
- 미래 가격 poisoning, 입력 불변, 결측 뒤 연속 구간, 정확한 기준일.
- 독립 로그수익률 계산과 pre-return variance 재귀.
- 가격 단위 변경, 기간/경로 수 확대의 seed prefix 유지, 작업량 상한.
- 구간 교집합 후 비중첩 선택, 과도한 폭 벌점, 캐시 오염·중복·미래 결과 거부.
- 모형 예시가 raw 분위수 밖인 경우의 선형·로그 렌더.
- URL 복원, 기본 adaptive 유지, valuation 보존, 분·시간봉의 미래 경로 비표시.
- 320/1440px 실제 키보드 모형 전환, 포커스·관측 가격 유지, 실제 PNG.
- throughput 단위·identity·날짜·결측·최신성·응답 상한·실패 receipt.

fit은 관측 수에 선형, 모의는 horizon×draws, 날짜별 분위수 정렬은 draws log draws이다. 731×256개의 Float64 로그 행렬은 1,497,088 bytes이며 fitted arrays·출력 객체·브라우저 비용은 별도다. UI는 입력별 결과를 캐시한다. Actions 실행 시간은 물리적 휴대폰 지연의 측정값이 아니다.

전체 앱 Hallmark, native 화면, 기존 수치·불변 원장 검사를 계속 수행한다. 이전 Hallmark의 미해결 6 FAIL·3 REFLEX를 이 작업의 코드 변경만으로 통과 처리하지 않는다. 실제 새 실행의 raw findings를 별도로 보존한다.

## 6. 실행 결과

최초 정책 commit은 실행 전에 작성했고, 아래는 실제 실행 후 추가한 결과다. [보존 영수증·원자료·화면](eth-candidate-evidence/20261027-pooled/README.md)에서 각 숫자와 source SHA를 확인할 수 있다.


### 첫 실제 실행과 화면 검증 보완

첫 소스 `92a180e61ae3bede33d6feeb557a55cc77e21553`의 [evidence 40449914791](https://github.com/twoimo/bitcoin-cycle-atlas/actions/runs/40449914791)은 집중 266개·수학 비교·v1 보존·throughput 수집을 통과했지만, 실제 native 34개 중 9개 shared BTC workspace에서 실패했다. 원인은 현재 UTC 날짜 2026-10-27에 보존 BTC 종료일 2026-10-25가 자동 갱신 조건에 해당하고, offline 검증이 실제 provider 요청을 차단한 것이다. 원본 오류 11개(일반 7개 문서, preview의 초기·복귀 4개 문서)와 실패 상태를 보존한다.

운영 코드의 freshness, Date, 입력 가격, 모델 정책은 바꾸지 않는다. verifier는 정확한 BTC PriceUSD 초기 URL, GET/Fetch, 실제 요청 UTC 날짜, inspector 차단, frame+loader를 식별한 뒤, 해당 문서에서 실패 title·busy 해제·보존 cutoff를 실제 확인해야만 예상된 offline failure로 분류한다. BTC/preview 초기 화면에서는 소수점 2자리 표시 가격과 observed 종류도 확인한다. evidence/legacy에 현재 숫자 가격이 표시됐다는 주장은 하지 않는다. 모든 원본 resourceErrors는 남고 검증되지 않은 요청은 계속 실패다.

현재 quiet 실패 안내는 숨겨질 수 있는 버튼의 title이다. 이 검사는 상시 가시적 실패 배너가 존재한다는 증거가 아니다. 이 제한을 별도 receipt에 표시한다. 최초 실패를 나중의 통과로 덮어쓰지 않는다.

추가로 이전 v1 회귀 기준 두 JSON을 source-book seed 및 SHA-256 목록에 넣고, 실제 수신 완료된 master·throughput 원본을 bounded log chunk로도 보존한다. 스트림이 끝나기 전 timeout/전송 오류/상한 초과가 나면 부분 body는 보존하지 않고 실제 수신 byte 수·실패를 기록한다.


### 최종 실행의 소스

- 직접 검증한 응용·검증 소스: **870cf93d4c2e634dde4d7e5a0429eaaff3c5b1e0**
- source tree: **c75c727de134e73b704598b94b8a0a68a9fec445**
- 가격 기준일: **2026-10-25**, 실제 ETH anchor **$2,326.75**
- 최초 점수를 확인한 92a180e와 최종 소스 사이에 모형 정책·학습·모의 메타데이터·점예측·점/구간 비교·보정 상태는 정확히 같다. 수정은 검증 경로와 증거 보존에 한정했다.
- 일반 CI는 main과 합친 **3b9fa0a0232de45232cc220e69a5ba1badadadc3** / tree **0bd6fe5e4b45f16b43b8adeb8b51967e27e664e8**에서 실행됐다. 직접 PR tree와 구분한다.
- main의 별도 데이터 갱신 **5dd11c99faa1fe4a1a9adf56bc4775d35c9a41e4**를 덮어쓰지 않았다.

### 6.1 같은 원점의 점예측 — 일부 기간 개선

평균 절대 로그오차이며 작을수록 좋다. 각 행은 두 후보가 모두 가능한 **같은 원점·같은 비중첩 목표**다.

| 기간 | 공통 비중첩 수 | adaptive v1 | pooled | v1 대비 pooled 오차 변화 |
|---|---:|---:|---:|---:|
| 30일 | 9 | 0.153553 | 0.154092 | **+0.35%** |
| 90일 | 4 | 0.327608 | 0.310689 | **−5.16%** |
| 180일 | 2 | 0.346186 | 0.331445 | **−4.26%** |

90·180일은 v1보다 작지만 표본이 4개·2개에 불과하다. 30일은 소폭 나빠졌다. 같은 원점의 단순 BTC 연동 오차는 90일 0.304506, 180일 0.280000으로 pooled보다 작다. 모든 기간·모든 기준을 이기는 모형이라고 주장하지 않는다.

### 6.2 같은 원점의 원래 모의 구간

로그 interval score는 작을수록 좋다. 표의 coverage는 해당 적은 표본에서의 사후 포함률이다.

| 기간 | 비중첩 수 | v1 score | pooled score | v1 coverage | pooled coverage |
|---|---:|---:|---:|---:|---:|
| 30일 | 9 | 0.847892 | 0.797366 | 6/9 | 7/9 |
| 90일 | 4 | 1.070022 | 0.816912 | 3/4 | 3/4 |
| 180일 | 2 | 1.652412 | 1.113705 | 1/2 | 1/2 |

점수는 각각 약 5.96%, 23.65%, 32.60% 작다. 90·180일의 coverage 자체는 같아도 구간 폭과 범위 밖 손실이 달라 점수가 변할 수 있다. 180일을 2개 표본만으로 검증했다고 부를 수 없다.

겹침을 포함한 공통 원점은 17/15/12개이며, pooled raw coverage는 70.59%/73.33%/75.00%다. 이 숫자를 독립 표본이나 실제 80% 보장으로 해석하지 않는다.

### 6.3 새 후보의 더 넓은 가용 기간 — 불리한 결과도 보존

pooled는 현재 원점을 포함해 41개 원점에서 가능하다. v1보다 이른 기간까지 포함하므로 위 공통 원점 표와 직접 섞지 않는다.

| 기간 | pooled의 비중첩 평가 수 | pooled 오차 | 같은 원점 가격 유지 오차 | pooled의 기준 대비 skill |
|---|---:|---:|---:|---:|
| 30일 | 20 | 0.175793 | 0.175943 | +0.085% |
| 90일 | 10 | 0.379853 | 0.369109 | **−2.91%** |
| 180일 | 5 | 0.414341 | 0.388980 | **−6.52%** |

단순 가격 유지 기준보다 90·180일에서 나쁘다. 이 결과 때문에도 기본값을 pooled로 자동 승격하지 않는다. 전체 수익률 사용은 정보 이용의 개선이지만, 예측 우월성을 보장하는 수학 정리가 아니다.

### 6.4 현재 보정 준비 상태

| 기간 | v1 사용 가능 성숙 비중첩 오차 | pooled 사용 가능 성숙 비중첩 오차 | pooled 상태 |
|---|---:|---:|---|
| 30일 | 9 | 20 | experimental |
| 90일 | 4 | 10 | insufficient-matured-errors |
| 180일 | 2 | 5 | insufficient-matured-errors |

최소 12개 정책은 바꾸지 않았다. pooled 30일 raw와 실험적 보정이 모두 존재했던 같은 비중첩 8개 사례에서는 coverage가 6/8→7/8, 로그 폭이 0.442879→0.627082, interval score가 0.840945→0.717774였다. 폭 증가를 함께 공개한다. 사후 87.5%가 미래의 80% 보장을 증명하지 않는다.

UI 음영은 계속 raw 모의 분위수다. 과거 연구 보고서의 보정 가능 상태를 더 최신 화면에 소급 적용하지 않는다.

### 6.5 실제 throughput 보조 관측

수집 상태는 **supplement-collected**다. provider의 2,491개 일별 행 중 **2026-09-29–2026-10-26의 연속 28일**을 선택했다. 요청한 최신 완료일과 일치하고 결측 없이 검사됐다.

$$
G_{28}^{rate}=6{,}094{,}027{,}523{,}397\ \mathrm{gas}
$$

약 6.094조 gas의 **rate-derived** 값이다. 계산 결과가 정수 모양이더라도 exactIntegerGas=false이며 독립 node 재집계가 아니다. 실제 원본 master 161,766 bytes, throughput 192,197 bytes와 SHA-256을 보존했다.

이 관측의 마지막 일자는 가격 모형 anchor보다 하루 뒤이며 수집은 2026-10-27이다. 과거 예측 원점에서 이용 가능했다고 간주하지 않는다. publishedAt=null, historicalPointInTimeReady=false, strict 0/25, full snapshot 0, modelInputActivated=false다.

Source: growthepie, https://www.growthepie.com. CC BY 4.0. 수집 원본을 보존했으며 위 합계는 Mgas/s→28일 gas의 파생 계산이다.

### 6.6 실제 검증 결과와 보존 범위

| 검증 | 실제 실행 결과 |
|---|---|
| [일반 CI 40451149872](https://github.com/twoimo/bitcoin-cycle-atlas/actions/runs/40451149872) | **1,403/1,403**, fail 0, skipped 0 |
| 독립 수치·음성 대조 | **318,010 assertions**, targeted negative controls **16/16** |
| [직접 head evidence 40451149941](https://github.com/twoimo/bitcoin-cycle-atlas/actions/runs/40451149941) | 집중 **270/270**, native **34/34**, **167 PNG** |
| native 오류 구분 | runtime 0, unexpected resource 0, 원본 offline resource failure **11개 보존·문서별 검증** |
| v1 보존 | 현재 경로 **731점**, 메타데이터, 기존 모형 요약 **27행**, 기존 pairwise **45행**, 기존 현재 예측 9개 정확 일치 |
| [전체 앱 Hallmark 40451149871](https://github.com/twoimo/bitcoin-cycle-atlas/actions/runs/40451149871) | 8개 경로 전후 **80 PNG**, integrity PASS; 디자인 **6 FAIL / 3 REFLEX**, workflow failure |
| source-book | **238 seeds / 286 entries / 248 parts / 44,463,149 bytes**, unresolved 0 |

예상된 offline 실패 11개는 삭제하지 않았다. frame+loader, 실제 요청 UTC 날짜, 정확한 endpoint·metric·query·GET/Fetch·inspector 차단, 해당 문서의 실패 title와 종료 상태를 확인한 뒤 분류했다. 모든 문서에서 cutoff를, 실제 가격이 보이는 BTC/preview 문서 7개에서는 **$80,038.91 및 2026.10.25 UTC** 표시를 검증했다. 오류 title를 담은 버튼은 실제로 숨겨져 있었으므로 가시적 실패 배너 검증으로 기록하지 않는다.

기존 18종목·BTC 첫 행·비트코인 이름을 유지한다. 1620×1008와 1920×1440 비교표의 마지막 행과 내부 하단 차이는 각각 **0.25px**다. 320/1440px에서 pooled·valuation·adaptive를 실제 키보드로 전환하고 관측 값과 포커스를 유지했다.

이번 Node Actions에서 적합+730일×256 모의는 **48.500096ms**였다. 행렬은 1,497,088 bytes이며 전체 메모리나 물리적 모바일 응답 시간 보장이 아니다.

첫 실행의 9개 native 실패와 두 번째 실행의 hashbang 위치 오류를 [중간 실행 기록](eth-candidate-evidence/20261027-pooled/intermediate-runs.json)에 보존했다. hashbang은 첫 행으로 복구했고 문법 검사를 비용이 큰 실행보다 앞에 배치했다. 최종 성공이 중간 실패의 상태를 바꾸지 않는다.

### 6.7 남는 조건

기존 발행 기록 **9개**, snapshot **3개**를 보존했다. 새 발행은 ETH/BMNR/MSTR 입력이 최신 완료 관측보다 오래되어 거부했고, **new records 0 / new snapshots 0**, candidateFreezeAt=null이다. 별도 결과 평가는 **27 pending / 0 scored**다. 새 후보의 실제 전향 점수가 생긴 것으로 세지 않는다.

경제 모형의 엄격 정의 입력 0/25와 완전한 snapshot 0, 과거 공개 판본 부재, 적은 장기 표본, Hallmark 미해결 진단은 남는다. 기본값 변경·운영 예측 승격·병합·배포를 수행하지 않았다. Gemini 반대/후속 역검토는 사용자 지시에 따라 생략이며 통과 표시가 아니다.
