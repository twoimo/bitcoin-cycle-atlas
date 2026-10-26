# ETH 경제 입력 후보: 근거, 계수 연결, 데이터 한계

## 1. 목적과 현재 상태

dist/ethereum-economic-model.js의 eth-economic-ridge-2는 관측 가능한 경제 입력을 30·90·180일 ETH/USD 수익률과 ETH/BTC 상대 수익률에 각각 연결하는 실험 후보다. 프로토콜의 회계 정의와 예측 회귀의 설계 선택을 구분한다. 아래 1차 자료는 수수료·발행·스테이킹 보상·출금의 의미를 정하는 근거이며, 회귀 계수의 부호나 미래 가격을 보장하지 않는다.

현재 저장소에는 이 후보에 필요한 과거 경제 입력의 실제 발표·수집 판본 묶음이 없다. 따라서 실데이터 비교에서 경제 후보가 unavailable인 것은 의도된 결과다. 테스트의 3,000일 가격·경제 자료, URL, 해시, 발표·수집·발행 시간은 모두 합성 자료다. 테스트 통과는 연결과 누출 방지 동작을 검증하며 투자 성과나 예측 정확도를 입증하지 않는다.

## 2. 가격과 공급의 연결

공급 회계는 총공급 변화 = 합의 계층 순발행 − 실행 기본 수수료 소각 − blob 수수료 소각으로 둔다. 합의 계층 순발행은 보상에 따른 생성에서 벌칙·슬래싱에 따른 소멸을 차감한 값이다. 입금과 출금은 계층 간 잔액 이동이며 발행량으로 더하지 않는다. 실행 수수료의 기본 수수료와 우선 수수료, 별도 blob 수수료를 분리한다. [EIP-1559](https://github.com/ethereum/EIPs/blob/7372d10a457b29eceb02cd052345af165de1fb60/EIPS/eip-1559.md), [EIP-4844](https://github.com/ethereum/EIPs/blob/7372d10a457b29eceb02cd052345af165de1fb60/EIPS/eip-4844.md), [EIP-3675](https://github.com/ethereum/EIPs/blob/7372d10a457b29eceb02cd052345af165de1fb60/EIPS/eip-3675.md), [EIP-4895](https://github.com/ethereum/EIPs/blob/7372d10a457b29eceb02cd052345af165de1fb60/EIPS/eip-4895.md).

L2 사용량과 ETH에 귀속되는 L1 지불액은 별도로 측정한다. l2Transactions는 고정한 rollup 집합의 활동량, l2SettlementFeesEth는 그 집합이 L1 실행·blob 자원에 실제 지급한 금액이다. 후자는 이미 전체 L1 수수료에 포함되므로 다시 합산하지 않는다. l2SettlementFeesEth / l2UserFeesEth는 해당 집합의 비용·수수료 비율이지 토큰 보유자에게 지급되는 배당률이 아니다. L2 손실 구간에서는 1을 넘을 수 있다. Blob 용량·가격 규칙 변경 때문에 활동량과 비용의 관계를 시대를 초월한 상수로 두지 않는다. [EIP-7691](https://github.com/ethereum/EIPs/blob/7372d10a457b29eceb02cd052345af165de1fb60/EIPS/eip-7691.md), [EIP-7918](https://github.com/ethereum/EIPs/blob/7372d10a457b29eceb02cd052345af165de1fb60/EIPS/eip-7918.md). 문서의 Final 상태만으로 특정 날짜의 메인넷 활성화를 추정하지 않으며, 실제 수집기의 fork·블록 기준을 별도로 보존해야 한다.

각 예측 기간 h에 대해 y = log(ETH[t+h]/ETH[t])와 q = log((ETH[t+h]/BTC[t+h])/(ETH[t]/BTC[t]))를 별도로 적합한다. 입력의 ETH/BTC 모멘텀은 이미 관측한 t와 t−28의 비율만 사용한다. 미래 BTC 가격은 상대 수익률의 완료된 학습 정답에만 들어간다. ETH/USD 예측과 ETH/BTC 예측은 각각의 오차로 평가한다.

표준화한 특징 z_j=(x_j−학습평균_j)/학습표준편차_j를 이용해 각 기간별로 절편 a와 계수 b를 ridge 최소제곱으로 추정한다. 예측은 ETH[t]·exp(a+Σb_j z_j), 상대가격은 (ETH[t]/BTC[t])·exp(a_q+Σb_q,j z_j)다. 계수 부호는 고정하지 않는다. 접근성 확대를 위해 낮은 ETH 개당 가격이 필수라고 가정하지 않는다.

## 3. 보상·유동성·담보를 분리한 세 계수

| 계수 | 입력과 단위 | 의미와 요구사항 |
| --- | --- | --- |
| netStakingYield | 동일 cohort의 28일 합의 보상·벌칙, 우선 수수료, 우선 수수료를 제거한 MEV, 서비스 비용, 운영 비용: ETH. 분모: 같은 기간의 시간 가중 보상 대상 원금 ETH | (합의 보상 − 벌칙 + 우선 수수료 + 중복 제거 MEV − 서비스 비용 − 잔여 운영 비용) / 평균 원금. 음수가 가능하며 연율화하거나 고정 APR을 대입하지 않는다. 벌어들인 수익과 즉시 인출 가능한 현금은 다르다. |
| completedExitWait | 고정한 완료 출금 집합의 요청부터 실행 계층 잔액 사용 가능 시점까지의 중위 소요일수; 완료 건수 별도 보존 | log1p(완료 소요일수). 현재 대기열 잔액인 exitQueueEth와 다른 관측이다. 완료 표본에는 선택 편향이 있으며 현재 대기열 해소시간으로 해석하지 않는다. 완료 건수가 0이면 0일로 대체하지 않는다. |
| uniqueCollateralShare | 고정한 담보 프로토콜 집합의 고유 native/wrapped ETH와 staking claim의 고유 기초 ETH: 관측 말일 ETH | (고유 native 담보 + 고유 staking claim 담보) / 총공급. 영수증 토큰·브리지·wrapper·재사용 청구권을 중복 합산하지 않고 두 범주의 기초자산을 상호 배타적으로 조정한다. 총 USD TVL이나 가격 상승에 따른 평가액 증가를 수요 증가로 바로 쓰지 않는다. |

보상 필드는 stakingConsensusRewardsEth, stakingConsensusPenaltiesEth, stakingPriorityFeesEth, stakingMevExcludingPriorityEth, stakingServiceFeesEth, stakingOperatingCostsEth, averageRewardEligibleStakeEth다. 출금 필드는 completedExitCount, completedExitMedianWaitDays, 담보 필드는 uniqueNativeCollateralEth, uniqueStakingClaimCollateralEth다. 기존 stakedEth, exitQueueEth와 함께 각각 다른 설명변수로 들어가며, 새 공급이나 독립된 현금흐름으로 합산하지 않는다.

합의 보상 API에는 실제 보상과 이상적인 보상, 합계와 세부 구성요소, 부호 있는 벌칙 관련 값이 구분된다. 수집기는 total과 그 구성요소를 함께 더하지 않아야 한다. API의 gwei 단위는 10^9 gwei = 1 ETH로 변환하고 원단위도 보존해야 한다. 합의 proposer 보상 API는 실행 계층 우선 수수료·MEV 전체를 제공하는 자료가 아니다. 실행 수수료와 builder 지급액을 원장 수준에서 조정해야 stakingMevExcludingPriorityEth를 계산할 수 있다. 알려지지 않은 분해값은 0이 아니다. [보상 타입](https://github.com/ethereum/beacon-APIs/blob/79b9b05e354da4f80d8f18879871af6f0068108d/types/rewards.yaml), [블록 보상 API](https://github.com/ethereum/beacon-APIs/blob/79b9b05e354da4f80d8f18879871af6f0068108d/apis/beacon/rewards/blocks.yaml), [attestation 보상 API](https://github.com/ethereum/beacon-APIs/blob/79b9b05e354da4f80d8f18879871af6f0068108d/apis/beacon/rewards/attestations.yaml).

현재 보상 계산과 출금 churn 규칙은 고정 APR·고정 대기일수 가정을 뒷받침하지 않는다. 수집 대상 validator/investor cohort, 비용 부담 주체, 시간 가중 원금의 범위를 일치시켜야 한다. 외화 비용을 ETH로 환산하면 환율의 관측·발표·수집 근거도 필요하다. [Altair 보상 명세](https://github.com/ethereum/consensus-specs/blob/ff73f4dd90a8717b13ed5a52afa5c1af358259b5/specs/altair/beacon-chain.md), [Electra exit 명세](https://github.com/ethereum/consensus-specs/blob/ff73f4dd90a8717b13ed5a52afa5c1af358259b5/specs/electra/beacon-chain.md).

담보 중복 제거는 합계의 범위 검사만으로 증명할 수 없다. 고정한 프로토콜·backing adapter·청구권 조정 원장과 그 원문이 필요하다. unique-underlying-disjoint-v1은 수집기가 충족해야 할 계약이며, 모델이 자기 선언의 진위를 검증했다는 의미가 아니다.

LST의 직접 유통성 계수는 이번 후보에 넣지 않았다. 고정한 자산 basket에 대해 주문 크기, executable bid/ask, 깊이, slippage, 호가 시각, 상환 한도·지연을 관측해야 별도 변수를 정의할 수 있다. 단순 기초자산 환산율은 이 정보를 대신하지 못한다. ERC-4626도 이상적인 자산 환산, 실제 인출 한도, 수수료·실행 조건을 구분한다. 모든 LST가 이 표준을 구현하는 것은 아니므로 범용 adapter로 가정하지 않는다. [ERC-4626](https://github.com/ethereum/ERCs/blob/4891ba3b86d2058d0f472dbf1500af6bb056caf2/ERCS/erc-4626.md).

## 4. 시점, 판본, 표본 제한

경제 입력은 eth-economic-input-2, 완료된 28일 창, observedThrough, 실제 publishedAt·collectedAt, vintageId, 원문 해시, 원문 URL과 각 지표의 URL을 요구한다. L2·staking cohort·완료 출금·담보 집합은 각각 고정된 ID로 구분한다. 같은 판본의 값·해시 또는 receipt 시각이 충돌하면 거부한다. 뒤늦은 수정본을 과거 발행 시점에 소급 적용하지 않는다.

UTC 일별 종가는 다음 UTC 날짜가 시작하기 전에 관측될 수 없다. 그 이후에도 실제 발표·수집이 늦었다면 해당 시각 전의 예측에는 쓸 수 없다. 비교기의 issuedAtByOrigin은 기록된 발행 시각을 전달하며, 누락 시 보수적인 다음 날 자정을 사용한다. 수집 시각을 종가 날짜로 만들어 넣지 않는다. 코인 UTC 종가와 미국 주식 종가는 다른 정보 집합이므로 BMNR 소비자는 자신의 실제 판단 시각을 별도로 적용해야 한다.

모듈은 여러 가격 판본을 선택할 수 있지만 비교기의 일반 가격 parser는 현재 날짜별 한 가격 기록만 허용한다. 전체 가격 수정 이력을 받는 비교기를 구현한 것으로 간주하면 안 된다. 현재 과거 가격 archive만으로 과거 경제 자료의 수집 여부를 증명할 수도 없다.

입력 표준화는 각 학습 표본에서만 적합한다. 기간별 학습 정답의 내부 구간은 겹치지 않게 선택하며, 완결된 정답이 16개 미만이면 해당 기간은 unavailable이다. 이 16개 기준과 ridge 강도 1은 명시적인 설계 선택이다. 16개 표본이 16개의 독립 시장 국면이라는 뜻이 아니며, 최적 hyperparameter를 찾았다는 주장도 아니다. 계수·가법 기여도·한 표준편차 조건부 민감도·변수 제거 후 재적합을 반환한다. 현재 예측의 제거 전후 차이는 표본 외 변수 중요도나 인과 효과가 아니다. 확률·신뢰구간·2030–2035년 외삽은 제공하지 않는다.

## 5. 읽은 두 역사적 연구 초안의 역할

[Blockchain Resource Pricing 초안](https://github.com/ethereum/research/blob/c003fe1c1a785797e7b53e3cbf9569b989be6e93/papers/pricing/ethpricing.tex)은 자원 사용·운영 비용·수요와 토큰 가격의 상호작용을 명시적으로 나누는 데 유용하다. 비용 구성식은 C(W)=ΣR_i(W)+(A(W)−A(0))−(D(W)−D(0))다. 그러나 수요 증가와 토큰 가격의 관계 일부는 가정으로 제시되며 이 후보의 선형 계수나 기간별 예측력을 증명하지 않는다. 저자·초록·날짜 등의 미완성 표시가 남은 역사적 초안으로, 완성된 현재 프로토콜 논문으로 취급하지 않는다.

초안 195행의 D(W)=−log(W)에 대해 D'(W)=+1/W라고 쓴 부분에는 문자 그대로의 부호 불일치가 있다. D의 도함수는 −1/W이며 +1/W는 −D의 도함수다. 원문을 검증된 정리로 그대로 가져오지 않았다. 253–267행의 채택 확대와 토큰 가격 비례 관계 역시 경험적으로 입증된 가격 탄력성 대신 명시적 가정으로 취급한다.

[Incentives in Casper the Friendly Finality Gadget 초안](https://github.com/ethereum/research/blob/c003fe1c1a785797e7b53e3cbf9569b989be6e93/papers/casper-economics/casper_economics_basic.tex)의 BP(TD,Δe)=k1/TD^p+k2·floor(log2 Δe)는 보상·벌칙이 예치량과 상태에 의존한다는 역사적 설계 논의를 보여준다. 이 식은 현재 메인넷 APR이나 현대 출금 시간을 계산하는 식이 아니다. 미결 parameter·정의와 제외된 공격 모형이 있어 현재 보안·수익 보장을 끌어낼 수 없다. 현행 회계에는 위에 고정한 합의 명세와 API 정의를 사용한다. [별도 부록](https://github.com/ethereum/research/blob/c003fe1c1a785797e7b53e3cbf9569b989be6e93/papers/casper-economics/appendix.tex)의 미완성 안전성 논의도 완성된 증명으로 취급하지 않는다.

원문 식별:
- pricing: 493줄, blob a0fb831a8a50556bc9103e3d3431c1fb7785b8ba.
- Casper: 468줄, blob 627871453743ea01b9442e7fcc863faaa661db0e.
- Casper appendix: blob f7ee939dc0124047b2aa042cf0e5c3b0edf21d91.
- 고정 research commit: c003fe1c1a785797e7b53e3cbf9569b989be6e93.

두 초안의 정독은 전체 학술 문헌 검토를 대신하지 않는다. 이 자료들과 공식 명세는 변수 선택·회계 경계의 근거이며, 실제 가격 예측 개선은 과거 시점에 이용 가능했던 데이터와 비교 실험으로 별도 입증해야 한다. Gemini의 독립 검토나 실데이터 검증, Deep Research 제품 실행이 수행된 것으로 기재하지 않는다.
