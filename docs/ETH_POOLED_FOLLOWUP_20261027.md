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

가격 수익률은 \(r_i=\log P_i-\log P_{i-1}\)이다. 기준일까지의 표본 평균 \(\bar r\)과 표본 분산 \(s^2\)를 구한다. 평균은 잔차 중심화에만 쓰며 미래 상승률로 넣지 않는다.

\[
e_i=r_i-\bar r,\quad z_i=e_i/\sqrt{v_{i-1}},\quad v_0=s^2
\]
\[
v_i=0.02s^2+0.06e_i^2+0.92v_{i-1}.
\]

분모는 해당 수익률 **이전**의 분산이다. \(z_i\)를 전체 평균 0, 모집단 2차 모멘트 1로 다시 정규화한다. 각 미래 경로는 표준화 잔차를 원형 28일 블록으로 추출하고 다음을 적용한다.

\[
\log P_{t+1}=\log P_t+\sqrt{v_t}z_{t+1},
\qquad
v_{t+1}=0.02s^2+0.06(\sqrt{v_t}z_{t+1})^2+0.92v_t.
\]

표시 중앙선은 각 날짜의 모의 가격 중앙값이고, 음영은 q10–q90이다. 첫 번째 모의 경로는 독립적인 예시이므로 음영 밖으로 나갈 수 있다. 이 경우 밴드를 예시 경로까지 넓히지 않는다. 미래 OHLC와 거래량을 만들지 않는다.

**명시적 drift 0은 가격 기대수익률 0, 다음 잔차의 조건부 평균 0, 가격 martingale 또는 매일 같은 중앙값을 뜻하지 않는다.** 블록 의존성, 과거 충격의 비대칭, 변동성 재귀, Monte Carlo 오차를 구분해야 한다. 계수 추정 불확실성은 밴드에 포함되지 않는다.

정책은 이 후속 후보의 점수를 확인하기 전에 고정한다. 다만 이미 과거 자료와 v1 결과를 본 뒤 설계했으므로 과거 기간에 사전 등록된 정책이나 untouched holdout이라고 주장하지 않는다. 새 점수를 보고 alpha/beta, 블록 길이, seed를 최적화하지 않는다.

## 3. 공정한 비교와 보정 상태

새 후보의 학습 가능 날짜는 v1과 다를 수 있다. 전체 가용 원점 평균만 서로 비교하지 않는다. 두 모형이 모두 가능한 같은 원점의 교집합을 만든 다음, 미래 구간이 겹치지 않는 사례를 선택한다. 비중첩이라는 이유만으로 독립적인 시장 표본이 되는 것은 아니다.

새 `summarizeEthereumIntervalPair`는 양쪽의 원래 bounds와 실제 결과에서 coverage, 로그 폭, interval score를 다시 계산한다. 미리 저장된 covered/score 캐시를 신뢰하지 않는다. 미래·pending·결측 실제값은 채점하지 않으며 역전 구간, 중복 공통 원점, 다른 horizon 또는 다른 명목 질량은 명시적으로 거부한다.

같은 alpha 0.2와 로그 좌표에서:

\[
IS_\alpha(l,u;y)=(u-l)+\frac{2}{\alpha}(l-y)1(y<l)+\frac{2}{\alpha}(y-u)1(y>u).
\]

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

\[
G_{28}^{rate}=\sum_{d=1}^{28} throughput_d \times 86400 \times 1000000.
\]

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

이 최초 정책 commit 시점에는 새 코드가 아직 실행되지 않았다. 실제 GitHub Actions 결과, 원본 receipt, 입력 hash, 동일 원점 점수와 보정 준비 상태를 다음 증거 commit에서 추가한다. 수집 성공·정확도 향상·기본값 승격을 선행 주장하지 않는다.
