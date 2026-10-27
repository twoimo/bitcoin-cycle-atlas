# ETH 남은 조건 후속: 공통 원점·다중 seed 검증과 전향 기록

> **검증 완료, 2026-10-27.** 회고적 비교는 보존 가격의 `asOf=2026-10-25`, 실제 전향 발행은 완료 일봉 `asOf=2026-10-26`을 사용한다. 최초 구현·발행 소스는 [`55bed7daf9278f15961224be68c20b862ab8fef8`](https://github.com/twoimo/bitcoin-cycle-atlas/commit/55bed7daf9278f15961224be68c20b862ab8fef8), 원문을 원장에 고정한 뒤 재검증한 소스는 [`c149d0c8e519e06f096d8b50e7c4cb68c3df726e`](https://github.com/twoimo/bitcoin-cycle-atlas/commit/c149d0c8e519e06f096d8b50e7c4cb68c3df726e)다. 최종 비교 원문은 [common-cohort.json](eth-candidate-evidence/20261027-common-cohort/common-cohort.json), 전체 증거 안내는 [README](eth-candidate-evidence/20261027-common-cohort/README.md)에 보존한다. 결과 문서의 후속 commit과 위 실제 실행 소스를 구분한다.

## 1. 이번에 확인한 결과

이전 보고서에 남았던 두 항목을 실제 평가로 처리했다. **여러 모형의 공통 가용 원점을 먼저 고정하는 비교**를 추가했고, **warm-start를 포함한 세 모형을 기존 8개 seed × 256·1,024회 정책으로 실행**했다. 같은 표본 수라도 평가 날짜가 달랐던 pairwise 결과를 한 표에 섞는 문제를 피하고, 기본 seed 하나에서 나온 작은 개선이 유지되는지 확인했다.

공통 비중첩 원점은 30·90·180일에 각각 **9·4·2개**다. 1,024회 모의에서 warm-start의 flat 대비 점오차 개선율은 30일 **−3.0438% ~ −0.2807%**, 90일 **−5.6394% ~ −1.8404%**로 선언한 8개 seed 모두 음수였다. 180일은 **−6.0833% ~ +1.2838%**로 부호가 바뀌었다. 초기화로 913개 수익률을 더 분류할 수 있다는 결과가 이 공통 평가 집합의 예측 우위를 보장하지 않는다.

구간점수에서도 기간별 결과가 다르다. 30일은 세 모형 모두 두 모의 수의 모든 seed에서 단순 Gaussian 비교 기준보다 큰 로그 interval score를 기록했다. 180일·1,024회에서는 pooled가 다른 세 구간보다 작은 점수를 기록했지만 평가 원점이 2개다. 이는 선언한 수치 실험의 결과이며 통계적 유의성·미래 우월성·보정 완료를 뜻하지 않는다.

최종 Actions 패널은 **9.9989초**에 완료됐다. 로컬 11.2507초·첫 Actions 13.1610초 실행과 수치 결과는 동일했다. 적합 30개를 재사용해 모형·원점·seed·경로 수의 480개 설정을 실행했고 실패는 없었다. 기존 기본 예측의 중앙값·하한·상한은 원점/horizon/model **45개 조합에서 정확히 재현**됐다. 기존 가격 기본값과 기발행본을 이 결과로 바꾸지 않는다. [공통 비교 구현](https://github.com/twoimo/bitcoin-cycle-atlas/blob/55bed7daf9278f15961224be68c20b862ab8fef8/scripts/ethereum-common-cohort-core.mjs), [실행기](https://github.com/twoimo/bitcoin-cycle-atlas/blob/55bed7daf9278f15961224be68c20b862ab8fef8/scripts/evaluate-ethereum-common-cohort.mjs).

## 2. 비교 정책과 평가 원점을 먼저 고정

### 두 종류의 공통 집합

| 비교 집합 | 공통으로 있어야 하는 예측 | 주 평가값 |
|---|---|---|
| 점예측 `common-point` | adaptive·pooled·warm-start·flat·shrunkenTrend | 평균 절대 로그오차(MALE) |
| 구간 `common-interval` | adaptive·pooled·warm-start·Gaussian | 로그 interval score; 같은 집합의 점오차도 별도 보존 |

각 집합은 기간별로 만든다. 먼저 기준일까지 성숙하고 실제 종가가 있는 원점을 찾고, **필요한 모든 예측의 교집합**을 만든다. 이후 날짜순으로 앞서 선택한 목표 기간과 겹치지 않는 원점을 선택한다. 이 순서를 각 모형에 따로 적용한 뒤 나중에 교집합을 만드는 방식으로 바꾸지 않는다. 비교에 들어오지 않는 쉬운 원점 하나가 공통 평가 원점의 선택을 바꾸는 것을 방지한다.

새 seed를 실행하기 전에 기존 기본 예측의 가용 여부로 집합을 고정한다. 실행 도중 특정 seed나 원점에서 적합·모의·기본값 재현이 실패하면 해당 표본을 빼고 다시 평균내지 않고 전체 패널을 `incomplete`로 남긴다. 이미 정해진 원점을 좋은 seed 결과에 맞춰 확대하거나 축소하지 않는다.

이번 실제 archive에서는 점예측 집합과 구간 집합이 같은 원점을 선택했다. 구현은 두 집합을 계속 분리한다. 예를 들어 flat/trend가 없는 원점과 Gaussian의 과거 181개 종가가 부족한 원점은 서로 다른 이유로 제외될 수 있기 때문이다. [선택 규칙·실패 처리](https://github.com/twoimo/bitcoin-cycle-atlas/blob/55bed7daf9278f15961224be68c20b862ab8fef8/scripts/ethereum-common-cohort-core.mjs).

### 원점 수와 탈락 이유

| 기간 | 검사한 원점 | 필요한 예측이 없는 성숙 원점 | 아직 미성숙 | 공통 성숙 원점 | 교집합 안에서 기간 중첩으로 제외 | 최종 `n` |
|---|---:|---:|---:|---:|---:|---:|
| 30일 | 111 | 92 | 2 | 17 | 8 | **9** |
| 90일 | 111 | 92 | 4 | 15 | 11 | **4** |
| 180일 | 111 | 92 | 7 | 12 | 10 | **2** |

점예측과 구간 집합 각각에 위 계수가 적용된다. 111개는 검사한 원점이지 세 모형 모두의 예측이 만들어진 원점 수가 아니다. 또한 JSON의 `point-unavailable=252`는 한 원점에서 여러 모형이 빠진 경우를 각각 센 **사유 발생 횟수**다. 이 값을 252개 독립 원점 또는 252개 누락 가격으로 해석하지 않는다. 실제로 그 사유를 가진 서로 다른 원점은 기간마다 92개다.

최종 날짜는 다음과 같다.

| 기간 | 공통 비중첩 원점 |
|---|---|
| 30일 | 2025-06-11, 2025-08-06, 2025-10-01, 2025-11-26, 2026-01-21, 2026-03-18, 2026-05-13, 2026-07-08, 2026-09-02 |
| 90일 | 2025-06-11, 2025-10-01, 2026-01-21, 2026-05-13 |
| 180일 | 2025-06-11, 2025-12-24 |

모든 기간을 합친 고유 원점은 10개이며 원점/horizon 조합은 15개다. 같은 날짜의 30·90·180일 결과를 서로 독립인 시장 경험으로 세지 않는다. 비중첩 창도 경계 가격을 공유할 수 있고 시장 환경의 의존성이 남는다. `independentSampleSize`는 계속 `null`이다.

이전 [초기화·비교 기준 보고서](ETH_INITIALIZATION_AND_CONTROLS_20261027.md)의 180일 warm/pooled pair는 2025-04-16·2025-10-29를 사용했다. 이번 공통 패널의 pooled 결과는 2025-06-11·2025-12-24로 다시 맞춘 값이다. 이전 pairwise 표와 새 공통 표의 평균이 달라져도 가격 과정이나 모수 정책을 변경한 것으로 설명하지 않는다.

## 3. 256·1,024회 모의와 seed 범위의 의미

기존 [`ETH_MC_STABILITY_POLICY`](https://github.com/twoimo/bitcoin-cycle-atlas/blob/55bed7daf9278f15961224be68c20b862ab8fef8/scripts/ethereum-monte-carlo-stability-core.mjs)를 import해 다음 값을 그대로 사용한다.

- seed: `20261027, 1, 104729, 130363, 155921, 196613, 262147, 524287`
- 각 적합의 모의 경로 수: **256·1,024회**
- 모의 기간: **180일까지 한 번 생성**, 같은 경로에서 30·90·180일 값을 추출
- 기본값 재현 기준: **256회·seed 20261027**

적합은 원점과 모형마다 한 번만 계산하고 모든 seed에서 재사용한다. 표의 최소·최대는 이 여덟 seed에서 얻은 손실의 범위다. 반복 모의 횟수는 역사 원점 수를 늘리지 않으며, 이 범위는 시장 손실의 신뢰구간·향후 가격 범위가 아니다. 1,024회로 늘린 실험도 실제 기본값의 승격을 뜻하지 않는다.

같은 seed 번호가 세 모형에서 같은 충격을 생성한다는 가정을 하지 않는다. 모형마다 잔차 집합·상태 변화·난수 소비가 다를 수 있다. 따라서 두 모형의 손실 차이는 같은 seed끼리만 짝짓는 대신, 선언한 seed의 **전체 조합**을 포함하는 범위로 보고한다. 모형 A·B의 해당 공통 집합 평균 손실을 각각 \(L_A(s),L_B(s)\)라고 하면 다음과 같다.

$$
\Delta_{A-B}\in\left[
\min_s L_A(s)-\max_s L_B(s),\quad
\max_s L_A(s)-\min_s L_B(s)
\right].
$$

위 범위 전체가 음수면 선언한 모든 seed 조합에서 A의 손실이 작다. 전체가 양수면 B의 손실이 작고, 0을 포함하면 수치 패널 안의 순위가 민감하거나 동률일 수 있다. 이것도 선택한 유한 패널의 성질이며 미래 성과의 유의성 검정이 아니다. 난수를 쓰지 않는 flat·shrunkenTrend·Gaussian은 한 번만 평가하며, 같은 값을 16개 독립 반복으로 세지 않는다.

## 4. 공통 원점의 점예측 결과

평균 절대 로그오차는 다음과 같다. 가격은 ETH 달러 종가이며, 모의 후보의 점예측은 대표 경로가 아니라 해당 날짜의 모의 중앙값이다.

$$
\operatorname{MALE}
=\frac1n\sum_{i=1}^{n}\left|\log\widehat P_i-\log P_i\right|,
\qquad
\operatorname{skill}_{\mathrm{flat}}
=1-\frac{\operatorname{MALE}_{\mathrm{model}}}
{\operatorname{MALE}_{\mathrm{flat}}}.
$$

MALE는 작을수록 좋고, flat 대비 skill은 양수일 때 해당 모형의 오차가 작다. 아래 skill 표의 단위는 %다. 투자 수익률·적중 확률과 다르다.

flat과 shrunkenTrend는 기존 비교기에 고정한 값을 그대로 사용하며 원점까지의 실제 가격으로 다시 계산해 일치를 확인한다. 고정 비교값은 다음과 같다.

| 기간 | `n` | flat MALE | shrunkenTrend MALE |
|---|---:|---:|---:|
| 30일 | 9 | 0.155010 | 0.162425 |
| 90일 | 4 | 0.313085 | 0.334122 |
| 180일 | 2 | 0.326971 | 0.394210 |

각 모형의 8-seed **flat 대비 오차 개선율 최소·최대**는 다음과 같다.

| 기간 | 모의 수 | adaptive | pooled | warm-start |
|---|---:|---:|---:|---:|
| 30일 | 256 | +0.0410% ~ +4.5290% | −1.7886% ~ +3.6649% | −1.7022% ~ +1.2801% |
| 30일 | 1,024 | +0.6089% ~ +3.1851% | −1.7591% ~ +0.4460% | **−3.0438% ~ −0.2807%** |
| 90일 | 256 | −16.7315% ~ −1.6768% | +0.5049% ~ +8.6565% | −6.2990% ~ +0.3851% |
| 90일 | 1,024 | −13.3368% ~ −6.7200% | +0.8182% ~ +5.5227% | **−5.6394% ~ −1.8404%** |
| 180일 | 256 | −10.9966% ~ +0.5607% | −9.4965% ~ +13.5838% | −4.9858% ~ +10.9809% |
| 180일 | 1,024 | −4.1571% ~ +0.9573% | −4.5879% ~ +2.9136% | **−6.0833% ~ +1.2838%** |

**30일:** adaptive는 두 모의 수 모두에서 선언한 8개 seed의 오차가 flat보다 작았다. 1,024회 패널에서는 adaptive의 최대 MALE `0.154067`이 pooled의 최소 `0.154319`와 warm-start의 최소 `0.155446`보다 작다. 256회에서는 후보 간 범위가 겹친다. warm-start는 1,024회 패널의 모든 seed에서 flat보다 오차가 컸다. 이 결과는 9개 공통 원점의 설명이다.

**90일:** pooled는 두 모의 수 모두에서 flat보다 오차가 작았고, 선언한 모든 seed 조합에서 adaptive와 warm-start보다도 작았다. 1,024회에서는 warm-start의 최대 MALE `0.330741`이 adaptive의 최소 `0.334125`보다 작지만, warm-start 자체는 flat보다 나빴다. 특정 복잡한 후보를 이긴 결과와 단순 기준 대비 개선을 구분해야 하는 사례다. 평가 원점은 4개다.

**180일:** 세 모형 모두 두 모의 수에서 flat 대비 개선율의 부호가 바뀐다. 후보 간 손실 범위도 겹친다. 기존 단일 seed에서 관측한 개선을 안정적 장기 예측 우위로 사용할 수 없다. 평가 원점이 2개라는 제약은 모의 수를 네 배 늘려도 유지된다.

warm-start는 shrunkenTrend보다 이 패널의 모든 기간·모의 수·seed에서 작은 점오차를 기록했다. 그러나 단순 가격 유지가 더 강한 기준이었던 30·90일 결과도 함께 보고해야 한다. 비교 대상 하나만 골라 개선을 제시하지 않는다. 전체 seed별 MALE와 모든 모형 쌍의 차이는 [최종 패널 원문](eth-candidate-evidence/20261027-common-cohort/common-cohort.json)에 보존한다.

## 5. 같은 원점의 구간점수

### 평가 기준

구간점수는 구간 폭과 실제값을 놓친 정도를 함께 반영한다. 로그 가격 좌표의 하한·상한·실제값을 각각 \(\ell,u,y\), \(\alpha=0.2\)로 두면 다음과 같다.

$$
IS_{\alpha}(\ell,u,y)
=(u-\ell)+\frac{2}{\alpha}(\ell-y)\mathbf1(y<\ell)
+\frac{2}{\alpha}(y-u)\mathbf1(y>u).
$$

점수는 작을수록 좋다. 원래 중앙값·구간 경계와 실제 종가에서 점수를 재계산하며 캐시된 score·coverage 값을 신뢰하지 않는다. 모형의 q10–q90와 Gaussian의 명목 질량은 모두 80%지만, 이를 실제 80% 적중률로 인증하지 않는다.

Gaussian 비교 기준은 각 원점의 완료 종가 181개에서 만든 로그수익률 180개의 표본분산을 사용한다. 미래 로그 드리프트는 0, 미래 분산은 일정하다고 가정하며 중앙값은 원점 종가다. 독립 정규 수익률 가정과 추정 모수의 불확실성을 생략한 단순 비교 기준이다. 자세한 식·해석은 [이전 비교 기준 설명](ETH_INITIALIZATION_AND_CONTROLS_20261027.md)과 [Gaussian 구현](https://github.com/twoimo/bitcoin-cycle-atlas/blob/55bed7daf9278f15961224be68c20b862ab8fef8/dist/ethereum-interval-benchmark.js)에 남긴다.

### 8-seed 로그 interval score 범위

| 기간 | 모의 수 | adaptive | pooled | warm-start | Gaussian 고정 점수 |
|---|---:|---:|---:|---:|---:|
| 30일 | 256 | 0.795568–0.878717 | 0.797366–0.854897 | 0.810436–0.892588 | **0.768861** |
| 30일 | 1,024 | 0.818366–0.877057 | 0.810055–0.843742 | 0.822108–0.877995 | **0.768861** |
| 90일 | 256 | 1.070022–1.202203 | 0.816912–1.098674 | 0.859238–1.160735 | 0.924669 |
| 90일 | 1,024 | 1.101341–1.167274 | 0.861016–1.009106 | 0.947683–1.060432 | 0.924669 |
| 180일 | 256 | 1.296829–2.039182 | 1.057782–1.575554 | 1.258104–1.659287 | 1.350688 |
| 180일 | 1,024 | 1.356259–1.612752 | **1.001791–1.205909** | 1.287402–1.543722 | 1.350688 |

30일은 두 모의 수 모두에서 Gaussian이 세 후보의 모든 seed보다 작은 점수를 기록했다. 1,024회에서는 네 구간 모두 실제값 포함 수가 **7/9**였는데도 점수는 달랐다. 포함 비율이 같아도 폭과 구간 밖 거리 때문에 점수가 달라질 수 있음을 보여 준다.

90일은 pooled와 Gaussian의 순위가 seed에 민감하다. 1,024회 warm-start는 모든 seed에서 adaptive보다 작은 구간점수를 기록했지만 Gaussian보다 컸다. 이때 포함 수는 adaptive **3/4**, pooled·warm-start 각각 **2/4**, Gaussian **4/4**였다. coverage 하나만으로 점수 순위나 적절한 폭을 판단하지 않는다.

180일·1,024회는 pooled의 최대 점수 `1.205909`가 warm-start의 최소 `1.287402`, Gaussian `1.350688`, adaptive의 최소 `1.356259`보다 작다. 따라서 선언한 패널에서는 pooled의 점수가 가장 작다. 그러나 단 2개 원점에서 얻은 결과이며, 256회 패널에서는 pooled와 다른 후보의 범위가 겹친다. 모의 수·손실 종류·기간을 명시하지 않은 전체 모형 순위로 바꾸지 않는다.

이 구간 비교에는 flat/trend의 경험적 오차 구간을 섞지 않았다. 그 구간은 원점 당시 성숙 보정 표본의 가용성에 따라 다른 교집합을 가질 수 있다. 이번 interval 집합은 세 모의 후보와 Gaussian을 비교하기 위해 별도로 고정한 집합이다. 기존 경험적 구간 결과를 바꾸거나 이번 Gaussian 점수와 서로 다른 원점의 평균을 직접 비교하지 않는다.

## 6. 수치 재현, 미래 경계와 보존 구조

### 실제 로컬 실행

| 항목 | 결과 |
|---|---:|
| 패널 기준일 | 2026-10-25 |
| 고유 선택 원점 | 10 |
| 원점/horizon 입력 조합 | 15 |
| 세 모형의 적합 | 30/30 성공 |
| seed·모의 수별 simulation | 480/480 성공 |
| 전체 draw-days | 55,296,000 |
| 기본 예측 정확 재현 | 45개 조합 |
| 실패 | 0 |
| 실행 시간 | 11.2507초 |
| 최대 단일 로그 행렬 | 1,482,752 bytes |

계산량은 `30 fits × 8 seeds × (256+1024) draws × 180 days`다. 최대 로그 행렬의 크기는 `181 × 1,024 × 8 bytes`이며 전체 프로세스의 최대 메모리 사용량을 뜻하지 않는다. 시간은 로컬 Node의 이 실행에서 측정했으며 모바일 반응속도나 이전 버전 대비 배속을 주장하지 않는다.

기본값 재현은 선택한 15개 원점/horizon 조합과 세 모형의 **중앙값·하한·상한 모두**를 확인한다. 45개는 독립 금융 표본 수가 아니라 비교 조합 수다. 새로운 패널을 실행해도 기존 comparison과 warm-start 입력 JSON은 변경하지 않는다.

### 의미 있는 검증

새 [테스트 10개](https://github.com/twoimo/bitcoin-cycle-atlas/blob/55bed7daf9278f15961224be68c20b862ab8fef8/tests/ethereum-common-cohort.test.mjs)는 로컬 직접 Node 실행에서 모두 통과했다. 총 4.15초였으며, 최종 CI 결과와 구분한다.

검사는 교집합을 먼저 만드는 순서, 점예측·구간 집합의 차이, 잘못된 날짜·명목 질량·중복 식별자, 원문 실제값 불일치, 원래 기본 예측의 변경, seed·원점·비교 기준의 누락을 다룬다. 실패한 선택 표본을 제거하면 성공으로 보이는 경로를 허용하지 않는다. 원래 경계에서 다시 계산한 구간점수와, 같은 포함 비율이어도 넓은 구간의 벌점이 커지는 것도 확인한다.

미래 정보는 두 경우를 나누어 검사했다. 평가 cutoff 뒤의 가격을 NaN으로 교란해도 이미 고정된 패널은 바뀌지 않는다. 예측 원점 뒤에 실제로 관측한 목표 종가를 바꾸면 평가지표는 바뀌지만, 그 원점의 적합·모의 예측은 바뀌지 않는다. 정답이 바뀌었는데도 점수가 불변이어야 한다고 검사하지 않는다.

### 전체 결과를 중복 없이 보존

`selectedCases`에는 원점/horizon 입력 **15개**, `simulationPoints`에는 모형·원점·seed·모의 수·horizon 결과 **720개**, `panelMembership`에는 집합별 참조 **297개**를 둔다. 같은 원점이 점예측과 구간 평가에 동시에 쓰여도 예측 수치를 두 번 저장하지 않는다. `cohorts[].caseKeys`와 `panelMembership[].pointKeys`로 원래 패널을 완전히 복구할 수 있으며 실제 테스트에서 같은 요약값으로 재계산했다.

모형별 seed 손실, 각 집합의 평균, 최소·중앙·최대, 전체 seed 조합의 차이 범위와 탈락 사유는 모두 보존한다. 로컬 결과는 compact JSON 약 **655,660 bytes**였고, 최종 CLI에는 해당 commit·tree·입력 및 의존 소스 해시가 추가된다. 최종 크기는 CLI의 `storage.fullReportBytes`를 사용한다. 숫자를 줄이거나 실패 행을 삭제해서 파일 크기를 맞추지 않는다.

CLI는 기존 comparison과 warm-start 보고서의 source commit·tree·ETH 입력 해시가 현재 소스와 일치하는지, warm-start가 참조한 comparison 해시가 실제 파일과 일치하는지 검사한다. 이후 `build/ethereum-common-cohort.json`과 `ETH_COMMON_COHORT_RECEIPT`·`ETH_COMMON_COHORT_CHUNK`를 생성한다. **로컬 imported builder 성공과 commit에 묶인 CLI·전체 workflow 성공은 구분한다.**

## 7. 실제 CI와 최종 증거

최초 구현·발행은 `55bed7daf9278f15961224be68c20b862ab8fef8` / tree `74215c5c3b23e9294218ae318e2c96b5dedca7a3`에서 완료했다. 실제 발행본·원문을 추가한 후 최종 검증은 **`c149d0c8e519e06f096d8b50e7c4cb68c3df726e` / tree `92dc37499c3fee99f009a21ed9b1d18b0cf9f848`**에서 완료했다. 이 두 번째 변경은 기록·명시적 검토 범위·증거 저장 용량에 관한 것으로, 세 후보의 모형 소스 그래프를 바꾸지 않았다.

| 검증 | 실제 결과와 원문 |
|---|---|
| [일반 CI 40486179424](https://github.com/twoimo/bitcoin-cycle-atlas/actions/runs/40486179424) | **1,545 pass / 0 fail / 0 skipped**, 이번 신규 테스트 34개 포함. 수치 assertion 318,010, negative controls 16/16; 별도 요청 32/32·시계 28/28·정적 자원 17/17. [실제 로그 발췌](eth-candidate-evidence/20261027-common-cohort/ci-summary.json) |
| [ETH evidence 40486179492](https://github.com/twoimo/bitcoin-cycle-atlas/actions/runs/40486179492) | 집중 테스트 단계, 실제 수집, 공통 패널, 발행·재사용, 별도 원문 replay, readiness, 브라우저, source-book 단계 모두 성공. 세 신규 테스트 파일의 34개 검사를 추가했다. |
| 실제 Chromium | **35/35, 181 PNG**, runtime 0 / unexpected resource 0. 의도한 offline resource 오류 15개는 [원문 보고서](eth-candidate-evidence/20261027-common-cohort/browser.json)에 남겼으며, 다운로드한 181개 PNG의 signature·길이·SHA-256을 모두 검증했다. |
| [Hallmark 40486179452](https://github.com/twoimo/bitcoin-cycle-atlas/actions/runs/40486179452) | **0 FAIL / 0 REFLEX**, integrity errors 0. static 36 / render 17 WARN을 유지했으며 waiver·dismissal을 추가하지 않았다. [영수증](eth-candidate-evidence/20261027-common-cohort/hallmark.json) |
| 공통 패널 재현 | 480/480 모의 설정 성공, 45개 기본값 정확 재현. 720개 수치 출력·선택 원점·집합 참조·요약·비교 모두 첫 실행과 동일. 최종 실행 9.9989초. |
| 전향 재사용 | **신규 0 / 기존 3 재사용**, 최초 issuedAt·ID·record/snapshot 원문·index 불변. 별도 replay는 네트워크 0·신규 0, 각 731점·ID 일치. |
| 검토 source-book | **296 seeds / 421 entries / 339 parts / 60,958,464 bytes**, unresolved 0. 실제 ZIP에서 모든 part의 해시와 재결합 전체 해시를 검증했다. [manifest](eth-candidate-evidence/20261027-common-cohort/source-manifest.json) |

일반 CI는 GitHub의 합성 merge **`00fa29c8deb5f31ddc333749668cd56990f855c4`**, tree `6dc83763a684d7d388889967de027960ebfc022e`를 checkout했다. 실제 부모는 main `5dd11c99faa1fe4a1a9adf56bc4775d35c9a41e4`와 위 c149d0c8이다. ETH evidence와 Hallmark는 직접 PR head c149d0c8을 실행했다. [CI checkout 근거](eth-candidate-evidence/20261027-common-cohort/ci-summary.json).

최종 [common-cohort.json](eth-candidate-evidence/20261027-common-cohort/common-cohort.json)은 **658,110 bytes**, SHA-256 `87090120314c2bdfdea5fa85fcd90b36972891ffbbb2fd19ee7bbcc53401e4e2`다. 로컬 평가, 첫 Actions, 최종 Actions 사이에는 실행 시간과 provenance가 다르지만 예측·평가 수치는 동일하다. 실행 시간 하나를 성능 향상률이나 물리 모바일 측정으로 해석하지 않는다.

첫 source-book은 **58,554,101 bytes / 60,000,000 한도**였다. 그 실행의 새 snapshot과 동일 내용 observation은 각각 **1,084,123 bytes**이며, 여기에 전체 예측·수집·발행·평가 원문을 원장에 보존해야 했다. 원문을 없애지 않고 검토 묶음의 유한한 자원 한도를 **64,000,000 bytes**로 조정했다. 실제 최종 크기 60,958,464 bytes를 확인했으며, 이 용량 한도 조정은 모형 정의·최소 표본·보정·배포 승인 조건의 변경이 아니다. [첫 manifest](eth-candidate-evidence/20261027-common-cohort/initial-source-manifest.json), [최종 바이트 검증](eth-candidate-evidence/20261027-common-cohort/artifact-verification.json).

전체 [artifact 12725023904](https://github.com/twoimo/bitcoin-cycle-atlas/actions/runs/40486179492/artifacts/12725023904)는 **50,822,566 bytes**, ZIP SHA-256 `5e2b0536f53af119ec044008841491c2aa9dd91f98aeac690b0b3b86d033654d`다. GitHub 메타데이터의 digest와 실제 받은 ZIP digest가 같았다. 보존 종료는 **2026-11-26 19:15:05 KST**다. 전체 source-book·PNG는 이 artifact에 있고, 모형 결과·영수증·원장·경제 재생에 필요한 원문과 경로 매핑은 Git에도 보존했다. 대용량 로그 전달 오류 때문에 전체 실행 로그 대신 이 실제 ZIP의 원문을 검증했으며, 집중 테스트의 정확한 개별 집계 수를 로그에서 복구했다고 주장하지 않는다.

사용자가 생략한 Gemini 반대 검토와 후속 역검토는 **omitted-by-user**다. 원본 review generator의 generic pending을 그 검토의 실제 수행이나 새로운 필수 조건으로 해석하지 않는다. Draft·`releaseAuthorized=false`·`productionPromoted=false`를 유지한다.

## 8. 실제 전향 발행과 기존 기록 보존

**warm-start의 첫 전향 연구 기록 1개를 2026-10-27 18:57:51.931 한국시간에 실제 발행했다.** 같은 실행에서 adaptive·pooled는 원래 기록을 재사용했다. 원장은 세 모형의 기록 3개, 고유 예측 원점 **1개**, 평가 대기 목표 **9개**, 채점 완료 **0개**다. 회고적 공통 패널의 `n=9·4·2`는 이 전향 표본에 합산하지 않는다. [발행 영수증](eth-candidate-evidence/20261027-common-cohort/initial-issuance.json), [원장 index](../research-data/ethereum-prospective-ledger/index.json), [실제 평가 원문](../research-data/ethereum-prospective-ledger/evaluations/f7ae686176ed688933365c166d84a2968549b5f4b4bdca0b60b6ca93103e3565.json).

### 실제 발행 결과와 실행 식별

발행 코드는 commit [`55bed7daf9278f15961224be68c20b862ab8fef8`](https://github.com/twoimo/bitcoin-cycle-atlas/commit/55bed7daf9278f15961224be68c20b862ab8fef8), tree `74215c5c3b23e9294218ae318e2c96b5dedca7a3`에서 실행됐다. GitHub Actions 실행은 [`40484314049`](https://github.com/twoimo/bitcoin-cycle-atlas/actions/runs/40484314049)이며, `selectedModelKeys`는 `adaptive`, `pooled`, `warmStart`다. 영수증은 `newRecords=1`, `reusedRecords=2`, `newSnapshots=1`, `totalRecords=3`, `uniqueOrigins=1`을 기록한다. 실제 발행 원문은 [content-addressed issuance 파일](../research-data/ethereum-prospective-ledger/issuances/c9f91387867d25c19192338a010938f457ec3beb67402a7e3aa1fc3e214dfc08.json)에도 보존했다.

| 모형 | 이 실행의 처리 | 보존된 최초 발행 시각, KST | 모델 버전 | 기록 원문 |
|---|---|---|---|---|
| adaptive | 기존 기록 재사용 | 2026-10-27 16:44:13.396 | `eth-adaptive-research-1` | [adaptive record](../research-data/ethereum-prospective-ledger/records/563d087f19a5062981714ed6fee1f96dd5afe77a87a4c435979b000451189a9b.json) |
| pooled | 기존 기록 재사용 | 2026-10-27 16:44:13.396 | `eth-pooled-volatility-research-1` | [pooled record](../research-data/ethereum-prospective-ledger/records/f1f0bf98496c1d6e9339ae9410a51c904571524d3ade88fc935cf6f58df3fed1.json) |
| warm-start | 신규 기록 발행 | **2026-10-27 18:57:51.931** | `eth-warm-start-initialization-research-1` | [warm-start record](../research-data/ethereum-prospective-ledger/records/d2659722c147909a9cbeeea4980c63b52f36f9c23c315cd2ef1e10984b8d5f72.json) |

세 기록 모두 `asOf=2026-10-26`, 기준 종가 **2,320.34 USD**를 사용한다. 새 수집의 발행 시각이 늦어졌어도 예측 원점은 같은 UTC 일봉이다. 각 모형에 원점이 하나씩 있다는 사실을 고유 시장 원점 세 개로 세지 않는다.

### 관측 종료·수집·생성·발행 시계

warm-start 기록의 완료 가격은 2026-10-26 UTC 일봉이다. 이 일봉의 관측 종료는 **2026-10-27 00:00 UTC / 09:00 KST**이고, 그 후 Coinbase 원문을 실제로 수집하고 모형을 생성했다. 아래 시각은 모두 원문 영수증의 값이며 임의의 소급 발행 시각을 넣지 않았다. [수집 영수증](../research-data/ethereum-prospective-ledger/acquisitions/d3e63c214cbdaa985625efeeb4b48e374f0882596b7d7d1790fa26e80c86eceb.json), [입력 snapshot](../research-data/ethereum-prospective-ledger/snapshots/da9f0f8abf60398b020501c33aaf33173fa555fcc8919b1d60975abd493d0615.json), [warm-start record](../research-data/ethereum-prospective-ledger/records/d2659722c147909a9cbeeea4980c63b52f36f9c23c315cd2ef1e10984b8d5f72.json).

| 사건 | UTC — 모두 2026-10-27 | KST — 모두 2026-10-27 |
|---|---|---|
| 기준 일봉 관측 종료 | 00:00:00.000 | 09:00:00.000 |
| 보존 base archive 읽기 완료 | 09:57:51.335 | 18:57:51.335 |
| Coinbase tail 요청 시작 | 09:57:51.337 | 18:57:51.337 |
| 응답 본문 수신 완료·정보 cutoff | 09:57:51.469 | 18:57:51.469 |
| 모형 생성 시작 | 09:57:51.690 | 18:57:51.690 |
| 모형 생성 완료 | 09:57:51.892 | 18:57:51.892 |
| warm-start 발행 | **09:57:51.931** | **18:57:51.931** |
| 세 기록의 목표 평가 | 09:57:52.758 | 18:57:52.758 |

수집은 HTTP 200, 요청 1회, 재시도 0회였으며 응답 본문 **527 bytes**를 그대로 보존했다. 요청 창은 `2026-10-19T00:00:00Z`부터 `2026-10-27T00:00:00Z`까지이고, 병합에는 완료된 일봉 8개를 사용했다. 창 밖의 공급자 행 1개는 원문에는 남기고 소비 입력에서 제외했다. 원문 SHA-256은 `d5c69e0d9494f287ec42038862e1e35538cd997e87bed139181dd9f19fa1ec25`다. [Coinbase 원문](../research-data/ethereum-prospective-ledger/raw/coinbase-tail-d5c69e0d9494f287ec42038862e1e35538cd997e87bed139181dd9f19fa1ec25.json).

`publishedAt`을 알 수 없는 입력은 계속 `null`로 보존한다. 수집 시각은 그때까지 입력을 확보했다는 상한이며, 과거 모든 가격의 최초 공개 시각이나 과거 당시의 데이터 판본까지 증명하지 않는다. 따라서 기록의 `historicalVintagesProven=false`와 `firstPublishedAt=null`도 유지한다. 여기서 발행은 실제 생성 결과를 draft PR의 연구 원장에 고정했다는 뜻이다.

### 기록 ID와 모델 소스 그래프를 함께 고정

warm-start는 별도 record policy `eth-warm-start-prospective-record-1`을 사용한다. 다음 식별값을 해당 [record](../research-data/ethereum-prospective-ledger/records/d2659722c147909a9cbeeea4980c63b52f36f9c23c315cd2ef1e10984b8d5f72.json)에 함께 보존했다.

| 식별 항목 | 전체 값 |
|---|---|
| record ID | `d2659722c147909a9cbeeea4980c63b52f36f9c23c315cd2ef1e10984b8d5f72` |
| snapshot ID | `da9f0f8abf60398b020501c33aaf33173fa555fcc8919b1d60975abd493d0615` |
| model source graph hash | `463085b24aa701b66a6e754c6b6437a157f2bc1cbc7fd1b2403a072b4b9d42ca` |
| run key | `30e9e21284b3b98ad9f732f3043f3f056df882cd73866aec41f73a0850d89434` |
| output hash | `b7f45f7ebada37e9a046b4e5547101bb985b43a16fbbf3ee1e34bcdc667b6dc8` |

warm-start의 그래프 진입점은 [`dist/ethereum-prospective-dispatch.js`](../dist/ethereum-prospective-dispatch.js)이고, 초기화 모형·별도 기록 계약을 포함한 **17개 파일**의 SHA-256을 묶는다. adaptive·pooled는 기존 [`dist/ethereum-prospective-records.js`](../dist/ethereum-prospective-records.js)를 진입점으로 하는 **14개 파일**의 그래프를 계속 사용하며, 해시는 `cb316276ae79f90cd44d31d7ef4ad7d404c9ced4bb49d957bb4f6f94ed030491`로 그대로다. 새 모형을 등록하려고 기존 기록 모듈의 import 그래프를 바꾸지 않았다. 원래 두 record의 `model.sourceCommit`도 `7b68ce295a35d39fd53f174f93090bafd47e9dce`를 유지한다.

재수집으로 raw body가 바뀌었어도 **완료된 소비 입력, 모델 소스, 정책, 출력, 목표가 모두 같으면** 최초 발행 기록을 재사용한다. 이번 adaptive·pooled의 재사용 사유는 모두 `same-completed-input-excluded-rows-may-differ`다. 원래 record ID, 발행 시각 `07:44:13.396Z`, [원래 snapshot](../research-data/ethereum-prospective-ledger/snapshots/bda159c9e30ad2f8977969d6d5f589d31cbbf60d904866807ab7216e3d023a59.json)을 그대로 보존했다. 새 수집 시각 `09:57:51.931Z`를 이 두 기록의 최초 발행 시각으로 덮어쓰지 않았다. 완료 OHLCV나 모델 소스가 바뀌면 이 재사용 규칙의 대상이 아니다. [실제 모델별 결정](../research-data/ethereum-prospective-ledger/issuances/c9f91387867d25c19192338a010938f457ec3beb67402a7e3aa1fc3e214dfc08.json), [재사용 구현](../scripts/ethereum-prospective-reuse.mjs).

ID는 정규화한 내용에 대한 식별값이고 파일 바이트의 SHA-256과는 구분한다. 보존된 warm-start record 파일의 SHA-256은 `747a8ba0b9223674647408ce1757482f3969b629911f8293d97ed7e774c35673`, snapshot 파일의 SHA-256은 `1fbd7f113cf58288bbf616cfa00f684ab831f266381c10b7d9e0bbb1f82e03ec`다. 실제 원문은 [보존 커밋 `c149d0c8e519e06f096d8b50e7c4cb68c3df726e`](https://github.com/twoimo/bitcoin-cycle-atlas/commit/c149d0c8e519e06f096d8b50e7c4cb68c3df726e)에 추가했으며, 이 보존 커밋 시각을 최초 모형 생성·발행 시각으로 다시 쓰지 않는다.

### 731점과 별도 프로세스의 원문 재실행

세 기록 모두 730일 horizon, 256개 모의 경로, seed `20261027`을 고정한다. 기준일 `asOf`를 포함한 **731개 날짜마다** `[date, median, q10, q90, representative]`를 저장하고, 30·90·180일 목표와 flat·shrunkenTrend 기준값도 함께 고정한다. 대표 경로를 중앙값으로 바꾸거나 pointwise q10–q90 안으로 잘라 넣지 않는다. warm-start의 30일 대표값 1,709.31 USD는 해당 날짜 q10 1,963.58 USD보다 작지만, 중앙값 2,312.16 USD와 별도 열에 원형대로 남는다. [731점·목표·정책 원문](../research-data/ethereum-prospective-ledger/records/d2659722c147909a9cbeeea4980c63b52f36f9c23c315cd2ef1e10984b8d5f72.json).

warm-start는 이 입력에서 post-Merge 수익률 1,502개를 분류했고 미분류 수익률은 0개다. 초기 경계 `2022-09-15`의 상태는 `up`, 확인 시각은 `2022-07-27`, 경계 진입 age는 50일로 보존됐다. 경계 이전 가격으로 확인 검출기를 초기화했지만, 기록된 `preMergeReturnsUsed`와 `preMergeRiskDaysUsed`는 모두 0이다. 이는 이번 `asOf=2026-10-26` 발행의 학습 진단이며, 이전 `asOf=2026-10-25` 회고 평가의 표본 수와 구분한다.

첫 실행은 기록 저장 후 별도 프로세스로 `--verify-preserved-only --include-warm-start`를 수행했다. [실제 replay 영수증](eth-candidate-evidence/20261027-common-cohort/initial-replay.json)은 **네트워크 요청 0, 신규 기록 0, 재사용 기록 3, `indexUnchanged=true`**를 기록한다. 각 기록에 묶인 base/tail 원문으로 실제 모형을 다시 실행했고, 세 모형 모두 **731점, output hash, record ID가 일치**했다. 저장된 출력 배열만 다시 읽는 검증과 구분되는 결과다. 이 replay 영수증의 파일 SHA-256은 `c47429e999368b38b97932e9823a665232408d8c389f8103f9eb8ca00e04d37e`다.

### 현재 채점 상태와 실제 관측 종료 경계

혼합 평가는 기존 두 모형을 원래 평가 계약으로 처리하고 warm-start를 별도 평가 계약으로 처리한다. [평가 원문](../research-data/ethereum-prospective-ledger/evaluations/f7ae686176ed688933365c166d84a2968549b5f4b4bdca0b60b6ca93103e3565.json)의 `componentEvaluations`에는 기존 모형의 **대기 6·채점 0**과 warm-start의 **대기 3·채점 0**이 각각 남아 있다. 합계는 대기 9, 성숙했지만 관측을 확보하지 못한 목표 0, 채점 0이다. 모든 결과의 `actual`과 `scores`는 아직 `null`이며, 기존 v1이나 회고적 비교의 성적을 새 후보에 이전하지 않았다.

다음 날짜는 세 모형에 공통으로 고정된 목표다. `targetDate`는 UTC 일봉의 날짜 라벨이고, 평가할 일봉이 실제로 끝나는 `eventAt`은 그 다음 날 00:00 UTC다.

| horizon | 고정 targetDate — UTC 일봉 | 관측 종료 UTC | 관측 종료 한국시간 | 현재 상태 |
|---|---|---|---|---|
| 30일 | 2026-11-25 | 2026-11-26 00:00 | **2026-11-26 09:00 KST** | 세 모형 모두 대기 |
| 90일 | 2027-01-24 | 2027-01-25 00:00 | **2027-01-25 09:00 KST** | 세 모형 모두 대기 |
| 180일 | 2027-04-24 | 2027-04-25 00:00 | **2027-04-25 09:00 KST** | 세 모형 모두 대기 |

위 경계를 지난 뒤에도 완료 일봉의 실제 관측 판본을 수집해야 점수를 계산한다. 경계만 지나고 유효한 관측이 없으면 `missing-observation`으로 남는다. 현재 기록은 raw pointwise q10/q90이며 80% 실현 포함률·동시 경로 보장·운영 보정 완료를 주장하지 않는다. `legacyEvidenceTransferred=false`, `prospectiveAccuracyProven=false`, `productionAdopted=false`와 별도 출시 승인 조건도 유지한다.

원문 보존 이후 **c149d0c8 / [실행 40486179492](https://github.com/twoimo/bitcoin-cycle-atlas/actions/runs/40486179492)**에서 실제 Coinbase 재수집과 `capture-and-issue`를 다시 실행했다. 새 시도 시각은 **2026-10-27 19:11:20.655 KST**이고 결과는 **신규 0개·기존 3개 재사용**이다. 제외되는 공급자 행의 원문이 달라졌어도 완료된 소비 입력은 같아 세 최초 record ID·issuedAt·snapshot을 유지했다. index와 모든 보존 record/snapshot의 바이트를 원장의 파일과 직접 대조했다. 이후 별도 프로세스 replay는 **19:11:23.867 KST**에 끝났으며 네트워크 0·신규 0·재사용 3, 세 모형의 731점과 ID가 모두 일치했다. [최종 재수집·재사용 영수증](eth-candidate-evidence/20261027-common-cohort/prospective-issuance.json), [최종 replay 영수증](eth-candidate-evidence/20261027-common-cohort/prospective-replay.json), [재수집 원문 묶음](eth-candidate-evidence/20261027-common-cohort/reuse-ledger/files.json).

readiness의 warm-start 전향 기록 수는 **1개**, 이번 재실행의 새 warm-start 기록 수는 **0개**다. 회고적 common-cohort 평가기 자체의 `prospectiveRecordsIssued=0`과 실제 발행기 원장의 수를 혼동하지 않는다. 기존 자산 원장 ETH/BMNR/MSTR 9개도 이 후보 원장 3개와 합산하지 않는다.

## 9. 경제 입력: 부분 증거는 확보했고, 전체 모형 입력은 아직 0개다

**실행 소스 `55bed7daf9278f15961224be68c20b862ab8fef8`에서 세 출처의 실제 원문과 계산 재생을 확인했다.** 25개 지표 중 관련 부분 관측이 있는 지표는 10개, 정의가 일치하는 부분 지표는 PoW 발행량 1개다. 정의와 공개·수집 시각 조건을 함께 충족하는 지표는 0개이며, 완전한 적격 경제 snapshot도 0개다. 이는 자료가 전혀 없다는 뜻이 아니다. 확보된 자료의 의미와 남은 조건을 지표별로 구분한 결과다. 이 절은 후속 실행 결과와 합산하지 않은 `55bed7`의 기록이다. 근거는 [실제 CI 실행](https://github.com/twoimo/bitcoin-cycle-atlas/actions/runs/40484314049)과 [보존 artifact 12725320302](https://github.com/twoimo/bitcoin-cycle-atlas/actions/runs/40484314049/artifacts/12725320302)의 `ethereum-economic-evidence-coverage.json` 및 세 수집 영수증이다.

후속 **c149d0c8 / 실행 40486179492**에서도 세 출처의 원문 검증·재생을 완료했고, 부분 관측 6개·관련 지표 10개·정의 일치 부분 지표 1개·전체 적격 snapshot 0개라는 상태를 다시 확인했다. 이 실행의 진단 시각은 **2026-10-27 10:10:53.886 UTC**이며 Coin Metrics·throughput·PoW의 실제 수집 완료는 각각 **10:09:13.878 / 10:09:14.641 / 10:09:52.882 UTC**다. [최종 지표별 보고서](eth-candidate-evidence/20261027-common-cohort/economic-evidence-coverage.json)와 [재생 입력 66개 경로의 매핑·해시](eth-candidate-evidence/20261027-common-cohort/economic-input-files.json)를 보존했다. 66개에는 코드·영수증·원문이 포함되며 경제 관측 66개라는 뜻이 아니다. 고정 CSV는 이미 보존된 정확한 Git 원문을 참조하고, 새 원시 응답은 해당 매핑의 경로에 저장했다.

### 9.1 관측 시각과 실제 원문 획득 시각

진단 기준일은 2026-10-26, 진단 시각은 **2026-10-27 09:57:15.144 UTC**다. 아래 기간은 양 끝 날짜를 포함한 28개 완료 UTC 일자이며, 흐름의 종료 시각은 마지막 날짜의 다음날 00:00 UTC다.

| 출처 | 실제 관측 창 | 이번 원문 수집 완료 시각, UTC | 원문 재생 결과 |
|---|---|---|---|
| Coin Metrics 고정 CSV | 2026-04-26~05-23 | 2026-10-27 09:55:05.488 | CSV 1개 해시·크기 확인 및 기존 집계 재생 |
| growthepie Ethereum throughput | 2026-09-29~10-26 | 2026-10-27 09:55:06.104 | master·시계열 JSON 2개 확인 및 28일 환산 재생 |
| Ethereum 공개 RPC의 PoW protocol-zero | 2026-09-29~10-26 | 2026-10-27 09:55:51.920 | 명세 3개·RPC 응답 50개 확인 및 수집 transcript 재생 |

세 출처 모두 이번 실행에서 `rawVerified`와 `replayed`가 참이다. Coin Metrics는 동일한 고정 archive를 새로 받은 것이므로, 새 수집 시각을 붙였어도 관측이 최신 자료로 바뀌지는 않는다. 마지막 완결 관측일은 기준일보다 **156일 이전**이다. 이 CSV의 계산 완료 시각인 5월 24일이나 저장소 커밋 시각을 과거 공개·수집 시각으로 대신하지 않았다. growthepie의 `last_updated_utc`도 생성 시각으로만 남겼다. 여섯 부분 관측의 `publishedAt`은 모두 `null`이며, 실제 수집 시각을 과거로 소급하지 않았다.

### 9.2 여섯 원시 필드가 25개 지표에 연결되는 범위

| 실제 확보한 필드 | 이 실행에 기록된 값 | 모형 지표와의 관계 |
|---|---:|---|
| `FeeTotNtv` | 약 9,122.065722 ETH | 실행 base·priority·blob을 포함한 총수수료. 실행 수수료, 실행 소각, blob 수수료·소각, L2 정산비를 각각 분리하지 못함 |
| `IssTotNtv` | 78,672.726006681 ETH | gross 발행량. consensus 순발행 또는 PoW 전용 발행량으로 대체할 수 없음 |
| `SplyCur` | 약 121,721,391.228686 ETH | 제공자 공급량. execution·consensus 범위와 개정 이력의 조정이 필요함 |
| `TxCnt` | 64,795,230건 | L1 거래 수. L1 gas 또는 고정 L2 집합의 거래 수와 단위·범위가 다름 |
| `l1GasUsedRateDerived` | 6,094,027,523,397 gas 환산값 | 일별 Mgas/s에 하루 초 수와 단위 배수를 곱한 보조 관측. 정확한 블록별 정수 gas 합계로 승격하지 않음 |
| `executionPowIssuanceEth` | **0 ETH** | 완료된 post-Merge 창에 대한 정의 일치 부분 관측. 전체 ETH 발행량이나 consensus 발행량이 0이라는 뜻은 아님 |

Coin Metrics의 [수수료 정의](https://gitbook-docs.coinmetrics.io/network-data/network-data-overview/fees-and-revenue/fees), [발행 정의](https://gitbook-docs.coinmetrics.io/network-data/network-data-overview/supply/supply-issuance), [공급 정의](https://gitbook-docs.coinmetrics.io/network-data/network-data-overview/supply/current-supply)를 따라 범위를 구분했다. PoW의 0은 결측 대입값이 아니라 [EIP-3675](https://github.com/ethereum/EIPs/blob/7372d10a457b29eceb02cd052345af165de1fb60/EIPS/eip-3675.md)를 제공자가 주장한 post-transition canonical 범위에 적용한 값이다. 이번 범위는 블록 26,079,397~26,280,313이며, 양쪽 UTC 경계와 finalized anchor를 재확인한 기록을 보존했다.

관련 지표 10개를 사용 가능한 입력 10개로 읽어서는 안 된다. 같은 총수수료 하나가 여러 미해결 세부 지표에 연결되기 때문이다. 정확한 부분 관측 1개, 속도 환산 지표 1개, 범위 불일치가 있는 지표 10개라는 집계는 서로 겹친다. 관련 수치 관측이 없는 나머지 15개에는 blob gas, 전체 staking·출금 queue, L2 사용자 수수료, 동일 cohort의 보상·벌금·비용·평균 원금, 완료 출금 표본, 중복 제거 담보가 포함된다.

회계상 실행 수수료와 blob 수수료를 더한 금액이 총수수료다. 실행 소각은 그 안의 구성 요소이며 추가 수익이 아니다. L2가 L1에 지불한 정산비도 이미 L1 수수료에 포함되므로 다시 더할 수 없다. 공급 변화에서는 consensus 순발행과 PoW 발행을 더하고 실행·blob 소각을 빼되, 예치·출금 같은 계층 간 이동은 발행으로 세지 않아야 한다. 이 항등식은 관측값의 일관성을 점검하지만, 사용량 증가가 가격을 얼마나 올리는지까지 결정하지 않는다.

### 9.3 공개 API를 더 받아도 정의 검증이 필요한 이유

추가 원문 검토는 `growthepie/gtp-backend`의 고정 커밋 `567f60415e8b48eb84f7b08e1bd83c8ca99995bf`를 대상으로 했다. 이 코드가 현재 hosted API에 동일하게 배포돼 있다는 주장은 하지 않는다.

- **발행과 staking:** [공식 방법론](https://github.com/growthepie/gtp-backend/blob/567f60415e8b48eb84f7b08e1bd83c8ca99995bf/docs/eth_asset_methodology.md)은 2025-05-07~2026-01-01 CL 자료의 이론값·참여율 보간과 Shapella 구간 양일 보상 재배분을 명시한다. [수집 코드](https://github.com/growthepie/gtp-backend/blob/567f60415e8b48eb84f7b08e1bd83c8ca99995bf/backend/eim/adapters/adapter_eth_supply.py)의 epoch 정규화 후 시간 평균도 정확한 UTC 합계와 별도다. active actual balance, fallback effective balance, 일 시작 balance는 전체 staking의 창 종료 stock 또는 보상 cohort의 시간 가중 원금과 구별해야 한다.
- **L2 거래와 결측:** [거래 수 SQL](https://github.com/growthepie/gtp-backend/blob/567f60415e8b48eb84f7b08e1bd83c8ca99995bf/backend/src/queries/postgres/chain_metrics/select_txcount.sql.j2)은 양의 gas 관련 필터를 적용한다. 고정 chain 목록과 거래 포함 기준이 모두 필요하다. [rent_paid 문서](https://docs.growthepie.com/metric-reference/metric-reference/rent-paid)는 일부 파생 화면의 결측 일자 채움도 설명하므로, 표시된 0과 실제 측정된 0을 구분해야 한다.
- **Blob 회계:** [고정 SQL](https://github.com/growthepie/gtp-backend/blob/567f60415e8b48eb84f7b08e1bd83c8ca99995bf/backend/src/queries/postgres/da_metrics/ethereum_blob_base_fee.sql.j2)의 지수 계산과 절삭을 프로토콜 정수 `fake_exponential`과 동일하다고 간주하지 않는다. fork별 파라미터와 정확한 wei 계산이 필요하다.
- **담보:** [담보 adapter](https://github.com/growthepie/gtp-backend/blob/567f60415e8b48eb84f7b08e1bd83c8ca99995bf/backend/eim/adapters/adapter_eth_collateral.py)의 가변 protocol 집합, 최신 USD/ETH 환산, LST 범주 차감은 동일 backing ETH가 wrapper·대출 receipt·bridge에서 중복되지 않았다는 증거를 대신하지 않는다.

### 9.4 남은 수집 조건과 이번 증거의 한계

다음 작은 단계는 기존 세 collector의 원문을 계속 보존하면서, 미리 고정한 소수 L2의 `master`와 일별 거래 수를 별도 subset 관측으로 수집하는 것이다. 수수료·정산비까지 연결할 때는 같은 chain 집합, 28일 연속성, 원문 결측, 구성 요소 중복과 환산 판본을 함께 기록해야 한다. 무료 upstream epoch 응답은 정수 issuance·penalty 필드와 경계를 감사하는 자료로 사용할 수 있지만, epoch가 UTC 경계를 가로지르는 문제를 해결하기 전에는 정확한 28일 순발행량으로 만들 수 없다. 큰 RPC 전수 수집이나 새 유료 서비스는 이번 범위에 추가하지 않았다.

전체 입력을 만들려면 각 지표의 정의·단위·계층·cohort·중복 제거 범위가 맞고, 같은 완료 창과 seven-day 최신성 조건을 충족해야 한다. 정확한 원문 판본의 공개 시각과 실제 수집 시각도 해당 예측 발행 전에 확인돼야 한다. 오늘 받은 과거 자료는 앞으로의 연구에는 쓰일 수 있지만, 과거 예측 당시 알고 있던 값으로 취급할 수 없다. staking의 실제 운영비와 cohort별 MEV 분해처럼 공개 네트워크 집계만으로 해결되지 않는 필드도 남아 있다.

이번 artifact의 보존·해시 일치·오프라인 재생은 **보존된 바이트에서 같은 결과를 재현했다는 증거**다. 제공자 자료의 외부 진위, 전체 canonical chain의 독립 검증, 과거 최초 공개 시각 또는 예측력의 증명으로 확대하지 않는다. PoW 관측도 단일 제공자의 canonical·finalized 주장에 의존한다. 따라서 `historicalPointInTimeReady=false`, `fullModelSnapshotReady=false`, `modelInputActivated=false`, `productionPromoted=false`를 유지한다. 부분 증거를 더 구체적으로 확인한 진전과 모형 사용 조건의 충족을 각각 기록했다.

## 10. 해소한 연구 공백과 남아 있는 한계

| 항목 | 이번 패널에서 확인한 범위 | 계속 필요한 증거 |
|---|---|---|
| 서로 다른 pairwise 원점의 혼합 | 다섯 점예측·네 구간의 공통 집합을 각각 고정해 같은 원점에서 비교 | 새 자료가 추가될 때도 같은 선택 순서와 명시적 제외 사유 유지 |
| warm-start의 seed 민감도 미확인 | 기존 8개 seed × 두 모의 수의 완전한 패널 실행 | 이 패널 밖의 수치 성질과 미래 금융 성과를 과장하지 않기 |
| 기본 결과의 보존 | 중앙값·구간 45조합 정확 재현, 입력 보고서 불변; 실제 발행본 3개도 각 731점·ID 원문 재생 | 향후 입력 개정이나 소스 변경 때 동일 검증 유지 |
| 단순 기준 대비 예측력 | 기간·손실·모의 수에 따라 개선과 악화가 다름 | 고정 정책의 충분한 성숙 전향 결과 |
| 명목 80% 구간 | 폭·누락을 함께 점수화했으나 보정 완료 아님 | 별도 보정·검증 자료와 충분한 coverage 평가 |
| 독립 시장 표본 | 비중첩 원점 9·4·2개 | 여러 시장 환경과 더 긴 실제 관측 |

warm-start는 초기 탐지기 이력·이후 상태 분류·추정 표본을 함께 바꾼다. 이 실험은 전환위험식 하나만 개선했을 때의 효과를 식별하지 않는다. 현재 보존 archive를 사용한 회고적 연구이며 당시 공개·수집 판본의 진위를 새로 인증하지도 않는다. 연구 정책은 사전 등록된 시장 실험이 아니고, 8개 seed가 독립 시장 주기라는 주장도 하지 않는다.

ETH의 고정된 3년 상승·1년 하락, 향후 4년 가격 경로, 모수 불확실성까지 포함한 예측구간은 이번에 증명되지 않았다. 구현 검증과 수치 민감도 확인을 가격 정확도의 승격이나 main 배포 허가로 해석하지 않는다. 기존 기본값·발행 기록의 보존, 연구 후보 상태, 사용자 지시에 따른 Gemini 반대 검토·후속 역검토의 생략을 유지한다.
