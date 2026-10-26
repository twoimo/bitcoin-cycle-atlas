# 이더리움 미래 차트 재설계: 주기, 변동성, 가치 귀속과 검증

작성·확인: **2026-10-27, 한국 시간**. 가격 분석 기준일은 보존 원자료의 **2026-10-25 UTC 완료 일봉**이다. 문헌의 발표일·수치 기준일·현재 열람일은 서로 다르다.

사용자 지시에 따라 **Gemini 반대 검토와 후속 역검토는 생략**한다. 생략을 실제 외부 검토의 실행·통과로 기록하지 않는다. 데이터 출처 대조, 계산 검증, 과거 원점 평가, 기능·화면 검증은 유지한다. 이 작업은 Draft PR의 연구 모형 변경이며 공개 배포나 확률 보정 완료를 뜻하지 않는다.

## 1. 먼저 정정한 사실

**ETH도 2025년에 달러 사상 최고가를 경신했다.** CoinGecko는 2025-08-24 $4,946.05, CoinMarketCap은 같은 날짜 $4,953.73를 기록한다.[S01][S02] 제공자별 집계와 거래소별 실제 체결 가격이 다르므로 한 숫자로 통일하지 않는다.

프로젝트의 Coinbase 자료는 2025-08-24 장중 고가 $4,955.90, 2025-08-22 UTC 종가 $4,831.24를 기록한다. 이전 종가 최고는 2021-11-08 $4,811.90, 장중 최고는 2021-11-10 $4,867.81이다. 이 값은 새 CI 진단 스크립트가 정확한 입력 해시와 함께 다시 계산한다.

CME·Glassnode 상반기 보고서의 미갱신 서술은 **2025년 5월까지의 자료**에 대한 것이다.[S03] 이를 2025년 전체 사실로 연장하면 정보 시점 오류다. 질문은 “PoS가 최고가 경신을 막았나”에서 **“왜 회복 시기·상승 배율·ETH/BTC 상대성과가 달랐나”**로 바꿔야 한다.

## 2. 3년 상승·1년 하락 가설

### 달력 수익률과 저점→고점 구간은 다르다

보존된 ETH 종가에서 2019년 수익률은 약 -1.52%, 2025년은 약 -10.91%다. 2025년 중간에 최고가를 경신해도 연말 수익률은 음수일 수 있다. 따라서 “달력상 매 4년 중 3개 연도는 반드시 상승”은 자료와 맞지 않는다.

최근 큰 저점→고점 구간이 약 3년이었다는 관찰은 별도로 성립할 수 있다. 아래 구간은 **사후 지정한 창**에서 뽑은 기술통계다. 새 모형의 미래 고저점 입력이 아니다.

| 상승 시작 → 고점 → 이후 최저 종가 | 상승 경과일 | 하락 경과일 | 고점 대비 낙폭 | 관측 제약 |
| --- | ---: | ---: | ---: | --- |
| 2016-12-05 → 2018-01-13 → 2018-12-14 | 404 | 335 | -94.01% | 시작 자료가 제한된 좌측 절단 |
| 2018-12-14 → 2021-11-08 → 2022-06-18 | 1,060 | 222 | -79.35% | 회고적으로 지정한 구간 |
| 2022-06-18 → 2025-08-22 → 2026-06-25 | 1,161 | 307 | -67.60% | 2026-10-25까지 우측 절단, 최종 저점 확정 아님 |

고점 검색 창은 2017-01-01~2018-06-30, 2021년, 2025년이다. 마지막 저점은 기준일까지의 최저값이며 현재 하락 국면의 최종 종료를 선언하지 않는다. 창 선택과 첫 구간의 길이를 숨기면 원하는 3:1 비율을 사후 구성할 수 있다.

### ETH와 BTC의 변동성도 같은 계수가 아니다

2024~2025의 공통 연속 날짜 731개 일수익률에서 ETH 연환산 로그수익률 표준편차는 약 69.64%, BTC는 47.51%다. 비율은 약 1.466, 상관은 0.796, ETH의 BTC 회귀 beta는 약 1.166이다.

계산은 평균을 제거한 표본 분산에 sqrt(365)를 적용한다. ETH는 Coinbase USD 종가, BTC 장기 자료는 Coin Metrics PriceUSD이므로 제공자 일치 비교라고 주장하지 않는다. 추가로 보존된 최근 180개 BTC Coinbase 일봉의 공통 구간에서 같은 제공자 검사를 수행한다. 결측을 가로질러 하루 수익률을 만들지 않는다. 고빈도 실현변동성을 실제 관측했다고 표현하지 않는다.

단일 주기 계수를 BTC에서 ETH로 복사하면 상대 변동성, 위상 지연, 공급 구조 차이를 누락한다. 반대로 소수의 ETH 고저점에 복잡한 파형을 정확히 맞추는 것도 예측력의 증거가 아니다. 기존 BTC 전이·ETH 고저점 재추정·가격 유지·축소 추세·BTC 연동 후보는 비교군으로 남긴다.

## 3. PoS가 상대 부진의 원인인가

확인된 프로토콜 변화와 자산가격 인과 추정은 구분한다.

- **London/EIP-1559(2021):** 기본 수수료 소각. PoS 전환보다 먼저 시행됐다.[S04]
- **Merge(2022-09-15):** PoW 실행 계층 발행이 종료됐다. 공식 설명의 약 88% 발행 감소는 당시 스테이킹 전제를 사용한 수치이지 2026년 고정 발행량이 아니다.[S05]
- **출금 활성화(2023):** 스테이킹 자산을 영구적으로 소각된 물량처럼 취급할 수 없다.[S06]
- **Dencun(2024-03-13):** 독립 blob 수수료 시장으로 L2 데이터 비용·L1 실행 gas 수요가 달라졌다. L2 전체 사용자 수수료와 L1 귀속 비용은 다르다.[S07][S08]

공급 회계의 핵심은 다음과 같다.

    다음 공급 = 현재 공급 + 신규 발행 − 실행 기본 수수료 소각 − blob 소각 − 기타 프로토콜상 순감소

발행이 줄어도 수요·위험 선호·유동성·경쟁 체인·상품 유입이 다르게 변하면 가격은 하락할 수 있다. 발행 축소만으로 가격 방향은 식별되지 않는다.

Merge 전후 ETH와 BTC의 변동성이 함께 줄어든 점도 단순 전후 비교가 원인을 식별하지 못함을 보여준다. ETH/BTC 하나를 통제군으로 써도 자산 노출과 구조가 달라 평행 추세가 자동으로 성립하지 않는다. 적절한 인과 연구에는 선행 추세, 사전 공개와 기대의 반영, 여러 동시 사건, 위험 요인·유동성, 대체 통제군, placebo, 민감도 검사가 필요하다.

Merge 이벤트 연구는 주변 짧은 창의 네트워크 변화에 관한 것이다.[S09] blob 연구와 L2 혼잡 연구는 각각 수수료 시장과 혼잡을 다룬다.[S10][S11] 이 종속변수를 2025년 ETH 달러 가격으로 바꿔 읽으면 안 된다. 현재 구현은 **PoS 가격 인과효과를 추정했다고 주장하지 않는다.**

## 4. 기관 전망의 수학적 감사

### 톰 리: 비율 시나리오와 독립적인 가격 예측

SEC에 보존된 2025년 발표는 다음 관계를 사용한다.[S12]

    ETH/USD = BTC/USD × ETH/BTC

BTC $250,000을 가정하면:

| 원문의 ETH/BTC 가정 | 산술 결과 |
| --- | ---: |
| 0.04790 | $11,975 |
| 0.080727 | $20,181.75 |
| 0.25 | $62,500 |

첫 값은 약 $12,000 설명과 대응한다. 그러나 원문의 0.080727과 $22,000은 정확히 일치하지 않으며 0.25의 계산은 전사문의 약 $62,000과 반올림 차이가 있다. 전사 오기 가능성을 근거 없이 수정하지 않는다.

이 항등식은 BTC가 목표를 달성하고 비율도 회복할 공동 확률을 주지 않는다. 비율의 역사적 평균은 반드시 되돌아오는 법칙이 아니다. 두 항을 함께 모형화한다면 로그 분산에 공분산 항이 들어간다.

    Var(log ETHUSD) = Var(log BTCUSD) + Var(log ETHBTC) + 2 Cov(log BTCUSD, log ETHBTC)

2026-10-07 BitMine 발표의 소수 과거 상승 배수·4년 주기·TVL 비례 가치 논거도 검토 대상이다.[S13] TVL 1달러가 ETH 보유자 가치 1달러라는 관계는 회계 항등식이 아니다. 톰 리는 해당 ETH 재무 기업의 회장이다. 같은 논제가 여러 매체에 반복돼도 독립 증거 수가 늘어나는 것은 아니다.

### VanEck: 계산 재현과 가정의 위험

2024-06-05 보고서의 2030년 기본 사례는 FCF 약 $66.058B, 배수 33.33, 공급 100.07M ETH를 사용한다.[S14]

    66,058 million USD × 33.33 / 100.07 million ETH ≈ $22,000/ETH

단위와 산술은 맞지만 70% 스마트컨트랙트 시장점유율, 수익 포착률, 공급 감소와 배수가 결과를 결정한다. 약세 $360·기본 $22,000·강세 $154,000은 10/50/90 분위수가 아니다. 2023년의 $11,800 전망과 2024년의 $22,000은 다른 시점의 가정이다.[S15]

기존 앱의 “채택 확대 $22,000”은 VanEck의 원래 기본 사례를 선택한 외부 조건임을 계속 명시한다. 이 재설계에서는 그 목표를 새 연구 모형의 중앙값에 강제하지 않는다.

### 다른 기관의 근거와 범위

| 자료 | 사용할 수 있는 근거 | 가격 모형으로 바로 옮기면 안 되는 부분 |
| --- | --- | --- |
| Fidelity 2023 투자 논제 [S16] | DCF의 할인·영구 성장 민감도 | 예시 가치의 70% 이상이 말기 가정. $2,090을 현재 목표로 전용 불가 |
| Coinbase 2025 전망 [S17] | AI·L2 채택과 토큰 가치 귀속 문제 | 기업 매출·토큰 수익·활동량의 혼합 |
| Grayscale 2025-03 [S18] | L1/L2 처리량·수수료 확장 시나리오 | L2 총 사용자 수수료 전부를 Ethereum 수익으로 합산 |
| Galaxy 2025 전망 [S19] | 사후 검증할 수 있는 목표와 가정 | $5,500 초과·스테이킹 50% 같은 전망을 관측 사실로 승격 |
| VanEck 2025 전망 [S20] | 연간 가격·AI·blob 전망을 실패까지 보존 | 당시 전망 중 맞은 항목만 선택 |
| Bitwise 2026-04 [S21] | 복수 가치 지표와 시장 조건 | ETH 가격에 의존하는 공격 비용을 외생적 가격 하한으로 제시 |
| BlackRock 2026 중간 전망 [S22] | 토큰화·AI 결제의 사용 사례 | 채택 잠재력을 ETH 수익 포착률이나 목표가의 증명으로 해석 |

운용사·거래소·ETH 보유 기업의 관련 상품과 이해관계는 주장을 자동 기각하는 근거가 아니지만, 독립성 판단에 포함한다. 새로운 차트는 기관 목표가를 투표·평균해 가격을 산출하지 않는다.

## 5. 미래에셋과 AI 에이전트 가설

사용자가 언급한 실제 보고서는 **미래에셋증권 한종목, 2026-02-23, “올해는 이더리움이다 — 에이전트 시대의 Near Automata”**다.[S23]

현재 PDF는 활성 스테이킹 약 30.8%를 쓰고, 7쪽에서 50% 수치를 누적 입금·출금 미반영 오류라고 직접 설명한다. 같은 공식 웹 요약에는 50% 이상이 남아 있다.[S24] 따라서 PDF의 정정 취지를 존중하면서 요약과의 불일치를 기록한다. 표지 날짜가 2월인데 본문에는 3월 기준 표현도 있어 현재 내려받은 문서를 2월 당시의 불변 판본이라고 가정하지 않는다.

보안 위험 0·상태 조회 불필요라는 일반화도 제한해야 한다. ERC-8128 작성자 문서는 nonce의 원자적 소비와 상태 저장, 키 탈취·TLS·응답 변조의 별도 위험을 설명한다.[S25][S26] ERC-8004는 Draft 상태이며 등록·평판·검증 구조가 광고된 기능이나 비악의성을 보증하지 않는다.[S27]

CFTC의 담보 파일럿은 관리·보고·haircut 조건을 두므로 ETH를 현금처럼 무위험하게 평가하는 근거가 아니다.[S28] 스테이킹과 재스테이킹은 소각 또는 항상 새로운 매수와 다르다. 같은 ETH·LST가 여러 곳에 쓰이면 중복을 제거해야 한다.[S06][S29]

### 요청 → 정산 → L1 비용 → ETH 가치 귀속

아래는 조건부 회계식이며 현재 관측으로 추정한 가격 탄력성이 아니다.

    N = 365 × 일 유료 요청 × Ethereum 경로 비중 × 요청당 온체인 정산 수

    실행 gas/정산
      = L1 직접 비중 × L1 gas
      + (1 − L1 직접 비중) × L2 정산에 배분된 L1 gas

    blob gas/정산 = (1 − L1 직접 비중) × 배분된 blob gas

    추가 소각 ETH/년
      = N × [실행 gas × 실행 기본 수수료(gwei/gas)
             + blob gas × blob 기본 수수료(gwei/gas)] × 10^−9

우선 수수료는 검증자 수입으로 분리한다. L2 운영사 이익, 결제 대행료, USDC 서비스 결제 원금은 위 소각액에 더하지 않는다. 요청 수의 “실유료·비중복” 정의와 Ethereum 경로 점유율이 필요하다.

Coinbase의 현재 x402 구현은 여러 체인을 지원하고 수천 결제를 한 온체인 거래로 정산할 수 있다.[S30] **요청 수 10배 × 정산당 요청 수 10배**라면 다른 조건이 같을 때 소각은 그대로다. 따라서 AI 요청 증가가 ETH 소각을 동일 비율로 늘린다는 명제에는 반례가 있다.

운영 잔액은 대략 다음과 같다.

    운영 ETH 잔액 = 연간 L1 비용(ETH) × 평균 사전 보유일 / 365

연간 가스 지출 전부가 영구 잠금되지는 않는다. 담보도 연간 결제총액 대신 실제 위험노출·증거금·haircut·ETH 비중과 기존 재사용 담보를 사용해야 한다.

순공급에는 신규 발행과 AI를 제외한 기존 소각이 필요하다. 이를 확보하지 못한 현재 계산기는 순공급 변화와 ETH 목표가를 **null**로 둔다. 자료가 없는데 0을 대입하지 않는다.

스테이블코인 총 이동금액과 카드 결제·소비지출도 같은 지표가 아니다. Visa는 거래·정산·유동성 관리 구분의 한계를 설명하고, 실제 adjusted-volume 분류를 수정해 과거 수치가 바뀐 이력도 제공한다.[S31][S32] 현재 판본을 과거 원점에 소급 입력하지 않는다.

## 6. 논문은 무엇을 증명했는가

| 연구 | 실제 범위 | 확대 해석하면 안 되는 주장 |
| --- | --- | --- |
| Cong·Li·Wang, Tokenomics, RFS 2021 [S33] | 수요·네트워크 효과·생산성과 위험 측도 가정 아래 균형 가치·채택 동학 | ETH 목표가 또는 4년 반복의 무조건적 정리 |
| Liu·Tsyvinski·Wu, JF 2022 [S34] | 암호자산의 시장·규모·모멘텀 요인 | 영구적 초과수익·특정 ETH 수준의 보증 |
| Roughgarden 2021 [S35] | 정해진 거래 게임에서 EIP-1559 인센티브 성질 | 모든 보안 위험 제거·달러 가격 상승 |
| Leonardos 외 2021 [S36] | 수요·업데이트 폭 아래 fee 동학의 수렴 또는 불안정 | ETH 자산가격의 동일한 주기 |
| Liu 외, CCS 2022 [S37] | London 전후 수수료·대기 변화 | Merge의 인과 실험·장기 가격 예측 |
| Karaivanov·Zarifian 2024 [S38] | 2021~2022 거래 수요·공급과 gas 비용 | 2025년 ETH 상대 부진 단일 원인 |
| Ftiti 외 2021 [S39] | 고빈도 자료의 변동성 모형 표본 밖 비교 | 현재 일별 모델이나 2035년 가격에서의 최적성 |
| Hansen·Kim·Kimbrough 2021 [S40] | 요일·시간대 변동성·유동성 반복 | 4년 가격 파동 |
| Agent-to-Agent Payments SoK 2026 [S41] | 결제의 발견·승인·실행·회계 신뢰 경계 | ETH 토큰 수익률 |
| A402 2026 [S42] | 서비스 실행·결제를 연결하는 조건부 보안 설계 | 채택 수가 가격에 1:1 귀속 |
| x402 공격·위험 연구 2026 [S43][S44] | 측정 당시 구현의 결제·원자성·승인 문제 | 모든 현재 배포가 같은 상태이거나 Ethereum 자체가 실패 |

수학적 정리는 가정과 결론의 범위를 같이 읽어야 한다. 과거 자료에 잘 맞는 모형을 여러 개 중 골랐다면 선택 편향도 검증해야 한다.[S45] proper interval score는 넓은 밴드만으로 coverage를 높이는 방법을 벌점화한다.[S46] 시계열을 일반 교환가능 표본으로 취급해 conformal 보장을 무조건 이식하지 않는다.[S47]

## 7. 구현한 새 모형

새 모듈은 dist/ethereum-adaptive-model.js이며 버전은 eth-adaptive-research-1이다. ETH 화면의 기본 선택은 이 연구 모형이고, 기존 외부 평가 조건은 선택 메뉴에 남긴다. BMNR·기존 불변 발행본의 모형을 새 것으로 가장하지 않는다.

### 7.1 데이터와 정보 시각

- Merge 이후의 실제 완료 일봉만 사용한다.
- 정확한 asOf 종가와 최소 366개 연속 일봉을 요구한다.
- 원점 내 마지막 결측 이후의 연속 구간만 사용한다. 결측을 보간하지 않는다.
- 40% 하락 또는 20% 반등이 14일 유지돼야 상태가 확인된다.
- 극값일 대신 확인 완료일 knownAt부터 상태 나이를 센다.
- 당일 수익률은 전날 알고 있던 상태에 배정한다.
- 첫 확인 전 구간은 상태를 임의 지정하지 않는다.
- 현재 미완료 상태는 위험 노출만 추가하고 종료 사건을 만들지 않는다.

40/20/14는 공개한 탐지 정책이지 학술적으로 증명된 최적 계수가 아니다. 확인 상태는 경제적 거시 주기와 같지 않다.

### 7.2 상태의 기간

상태 s와 나이 구간 b에서 종료 사건 수를 D, 노출 일수를 E라 한다.

    전체 상태 hazard = (D_s + 0.5) / (E_s + 182.5)
    구간 hazard = (D_s,b + 180 × 전체 상태 hazard) / (E_s,b + 180)

나이 경계는 30/90/180/365/730일이며 이후 꼬리 구간을 둔다. 빈 구간을 확정 종료나 영구 지속으로 만들지 않는다. 사전 가중치는 가정이며 표본이 적을수록 결과에 영향을 준다. 이 구조는 고정 48개월 반복이나 일정한 3:1 비율을 넣지 않는다.

시뮬레이션 상태는 확인된 label에서 학습한 semi-Markov 근사다. 생성 가격이 미래의 원래 threshold를 실제로 넘는 날짜와 반드시 일치하지 않는다.

### 7.3 수익률 평균과 변동성

상태별 평균은 n/(n+365)로 0 방향으로 축소한다. 미래 영향은 180일 반감기로 줄인다. 과거의 높은 성장률을 장기 영구 성장으로 복리 외삽하지 않는다.

    r_h = 축소한 상태 평균 × exp(−ln(2)h/180) + sqrt(v_h) z_h
    v_(h+1) = 0.02 × 상태 장기분산 + 0.06 × 충격_h² + 0.92 × v_h

상태 장기분산도 전체 분산에 축소한다. 이는 장기 평균으로 돌아가는 GARCH 유사 재귀식이며 추정 완료한 최적 GARCH 계수라고 표시하지 않는다.

과거 충격은 해당 수익률 관측 전의 lagged 분산으로 표준화한다. 잔차 집합을 평균 0·모집단 2차 모멘트 1로 다시 정규화해 제거한 평균이 잔차를 통해 재유입되지 않게 한다. 28일 원형 블록은 모든 관측의 주변 추출 가중치를 동일하게 하되 끝→처음 연결이라는 인공 경계를 가정한다.

전체 잔차의 평균 0은 블록의 다음 잔차가 과거와 독립이라는 뜻이 아니다. 잔차와 현재 변동성의 상관이 남을 수 있어 조건부 수익률 무편향 또는 가격 martingale을 증명했다고 주장하지 않는다.

양의 장기분산과 비음수 재귀 가중치는 양의 분산을 유지한다. log 가격은 유한 지수 범위를 벗어나면 명시적 오류를 내며 임의 상하한으로 숨기지 않는다. 블록 의존성과 상태 이동이 있으므로 iid 조건의 정상성 정리를 실제 모의 과정 전체의 보증으로 과장하지 않는다.

### 7.4 차트 의미

- 파란 점선: 256개 경로의 날짜별 중앙값.
- 금색 점선: index 0의 재현 가능한 모의 예시 하나.
- 음영: 날짜별 10–90% 모의 분위수.
- 최대 730일: 장기 조건부 연구 표시이며 검증된 2년 가격 예측이 아니다.
- 미래 OHLC·거래량은 생성하지 않는다.
- 중앙값 연결선이 실제 개별 경로 하나라고 주장하지 않는다.
- 음영에 파라미터 추정 불확실성이 포함되지 않는다.
- “실제 80% 포함률”이나 전체 경로의 동시 확률로 해석하지 않는다.

256개와 1,024개 경로의 수치 민감도를 별도 기록한다. 이것은 시뮬레이션 수치 오차 확인이며 새로운 시장 표본·계수 불확실성·정확도 개선이 아니다.

### 7.5 계산 성능

한 번 상태를 적합하고 각 경로에 독립 RNG를 사용한다. 30일을 730일로 늘려도 기존 경로 prefix가 바뀌지 않는다. 경로 수를 늘려도 이미 있는 개별 경로는 유지된다. 분위수는 경로 수에 따라 달라질 수 있다.

기본 로그 배열은 731 × 256 × 8 bytes다. 순차 적합과 일별 분위수 정렬의 비용은 O(관측 수 + 기간 × 경로 수 × log 경로 수)다. UI는 관측 입력이 같으면 계산 객체를 재사용하여 모형 전환·설명창·확대 이동 때 재적합하지 않는다. 실행 시간은 실제 CI에 기록하며 모바일 지연 보장으로 바꾸지 않는다.

## 8. 검증 계약과 실제 결과의 위치

tests/ethereum-adaptive-model.test.mjs는 시점·노출·우측 검열·잔차 중심화·시뮬레이션 prefix·누락·작업량 제한·rolling 비교·화면 전환을 검사한다. AI 계산은 0 입력, 10배 요청과 10배 batching 상쇄, L1/L2 경계, gwei 단위, 우선 수수료 분리를 검사한다.

기존 비교기의 동일 원점·동일 타깃에서 새 후보의 중앙값을 flat, 축소 추세, BTC 연동, BTC 전이, 기존 ETH와 평가한다. 30/90/180일 absolute log error·RMSE·방향, 같은 비중첩 타깃 구간의 결과와 원점을 보존한다. 겹친 예측 수를 독립 거시 주기 수로 세지 않는다.

모의 밴드 자체의 coverage·폭·interval score와 과거 오차를 이용한 별도 보정 실험을 혼합하지 않는다. 평가가 나쁘면 그대로 기록하며, 표본 밖 결과를 보고 이번 가정 계수를 유리하게 조정하지 않는다.

실제 진단은 build/ethereum-adaptive-research.json, 전체 후보 비교는 build/ethereum-model-comparison.json, 원자료·native 화면·source-book은 같은 Actions artifact에 보존한다. 영구 요약과 실행 소스·run ID는 완료 후 이 문서의 실행 절과 별도 영수증에 기록한다. 이 초기 명세 저장 시점에는 성공 결과를 선취하지 않는다.

## 9. 연구 범위와 남은 식별 문제

이 목록은 핵심 기관·기술·학술 자료를 광범위하게 대조한 범위이며 존재하는 모든 보고서의 완전한 전수조사가 아니다. 유료 Fundstrat 전체 아카이브나 접근되지 않은 논문을 읽었다고 주장하지 않는다. Jermann 등의 관련 작업은 존재를 확인했어도 전문 검토 범위에 포함하지 않았다.

현재 경제 필드 적격 0/25·완전 경제 snapshot 0이라는 제약을 유지한다. 네트워크 사용량·수수료·스테이킹·실제 담보·AI 활동의 정의와 과거 가용 판본을 확보하기 전에는 임의 계수로 새 가격 경로에 더하지 않는다. 장기 가격 예측의 정확성은 수학만으로 증명되지 않는다.


### 원문 목록

| ID | 원문 | 날짜·범위 |
| --- | --- | --- |
| S01 | [CoinGecko ETH](https://www.coingecko.com/en/coins/ethereum) | ATH 제공자 표 |
| S02 | [CoinMarketCap ETH](https://coinmarketcap.com/currencies/ethereum/) | ATH 2025-08-24 |
| S03 | [CME·Glassnode Ether H1](https://www.cmegroup.com/articles/files/2025/glassnode-ether-report.pdf) | 자료 2025-05까지 |
| S04 | [EIP-1559](https://eips.ethereum.org/EIPS/eip-1559) | 실행 기본 수수료 |
| S05 | [Merge issuance](https://ethereum.org/roadmap/merge/issuance/) | 발행 변화·당시 전제 |
| S06 | [Staking withdrawals](https://ethereum.org/staking/withdrawals/) | 출금 구조 |
| S07 | [Dencun](https://ethereum.org/roadmap/dencun/) | 2024-03-13 |
| S08 | [EIP-4844](https://eips.ethereum.org/EIPS/eip-4844) | 별도 blob fee 시장 |
| S09 | [Merge event study](https://arxiv.org/abs/2210.13655) | 2022 연구 |
| S10 | [Early Days of the Blob Fee Market](https://arxiv.org/abs/2502.12966) | 2025·FC |
| S11 | [L2 Adoption and Mainnet Congestion](https://arxiv.org/abs/2512.14724) | 2025 프리프린트 |
| S12 | [Tom Lee SEC transcript](https://www.sec.gov/Archives/edgar/data/1829311/000149315225012513/ex99-2.htm) | 2025년 8월 메시지 |
| S13 | [BitMine IR](https://www.bitminetech.io/investor-relations) | 2026-10-07 메시지·발표 |
| S14 | [VanEck ETH 2030](https://www.vaneck.com/us/en/blogs/digital-assets/matthew-sigel-eth-2030-price-target/) | 2024-06-05 |
| S15 | [VanEck 2023 PDF](https://www.vaneck.com/us/en/blogs/digital-assets/matthew-sigel-ethereum-price-prediction-118k-by-2030/ethereum-price-prediction-118k-by-2030.pdf) | 2023·2030 목표와 현재가치 |
| S16 | [Fidelity thesis PDF](https://www.fidelitydigitalassets.com/sites/g/files/djuvja3256/files/dam/l305a6qsab/fda_us_uk_ethereuminvestmentthesis_1101895.4.0_v4.pdf) | 2023-08 |
| S17 | [Coinbase 2025 outlook](https://www.coinbase.com/institutional/research-insights/research/market-intelligence/2025-crypto-market-outlook) | 2024-12-17 |
| S18 | [Grayscale original filed at SEC](https://www.sec.gov/Archives/edgar/data/1729997/000095017025048840/ethereum_report_3.20.202.htm) | 2025-03-20 |
| S19 | [Galaxy 2025 predictions](https://www.galaxy.com/insights/research/crypto-predictions-2025) | 2024-12-31 |
| S20 | [VanEck 2025 predictions](https://www.vaneck.com/us/en/blogs/digital-assets/matthew-sigel-vanecks-10-crypto-predictions-for-2025/) | 2024-12-13 |
| S21 | [Bitwise ETH valuation](https://bitwiseinvestments.eu/de/blog/crypto-research/how_to_actually_value_ethereum/) | 2026-04-23 |
| S22 | [BlackRock thematic update](https://www.blackrock.com/us/financial-professionals/insights/thematic-investing-2026-mid-year-update) | 2026 중간 전망 |
| S23 | [미래에셋 PDF](https://securities.miraeasset.com/bbs/download/2142940.pdf?attachmentId=2142940) | 표지 2026-02-23, 현재 판본 |
| S24 | [미래에셋 공식 요약](https://securities.miraeasset.com/bbs/board/message/view.do?categoryId=1521&messageId=2338173) | 요약/PDF 수치 불일치 |
| S25 | [ERC-8128 security](https://erc8128.slice.so/concepts/security-model/) | 작성자 명세 설명 |
| S26 | [ERC-8128 replay](https://erc8128.slice.so/concepts/replay-protection/) | nonce·원자 상태 |
| S27 | [ERC-8004](https://eips.ethereum.org/EIPS/eip-8004) | Draft·작성 2025-08-13 |
| S28 | [CFTC collateral pilot](https://www.cftc.gov/PressRoom/PressReleases/9146-25) | 2025-12-08 |
| S29 | [EigenLayer overview](https://docs.eigencloud.xyz/eigenlayer/concepts/eigenlayer-overview) | 담보 재사용 |
| S30 | [Coinbase x402 facilitator](https://docs.cdp.coinbase.com/x402/seller/facilitator) | batching·여러 체인 |
| S31 | [Visa stablecoin velocity](https://corporate.visa.com/en/sites/visa-economic-empowerment-institute/stablecoin-velocity.html) | 2026-04-16 |
| S32 | [Visa analytics changelog](https://visaonchainanalytics.com/changelog) | 2026-09 분류 수정 포함 |
| S33 | [Tokenomics 최종 논문](https://www.linwilliamcong.com/_files/ugd/555f73_c11eda05cc144e688c772c612edf8158.pdf) | RFS 2021·10.1093/rfs/hhaa089 |
| S34 | [Common Risk Factors](https://onlinelibrary.wiley.com/doi/abs/10.1111/jofi.13119) | JF 2022·최종판 |
| S35 | [Roughgarden](https://arxiv.org/abs/2106.01340) | 2021 |
| S36 | [EIP-1559 dynamics](https://arxiv.org/abs/2102.10567) | 2021 |
| S37 | [EIP-1559 empirical analysis](https://arxiv.org/abs/2201.05574) | CCS 2022 |
| S38 | [Ethereum fees paper](https://www.sfu.ca/~akaraiva/Ethereum_paper.pdf) | 2024-09 작업논문 |
| S39 | [Volatility forecasting](https://pmc.ncbi.nlm.nih.gov/articles/PMC8207820/) | 2021·10.1007/s10479-021-04116-x |
| S40 | [Periodicity in volatility and liquidity](https://arxiv.org/abs/2109.12142) | 2021 |
| S41 | [Agent payments SoK](https://arxiv.org/abs/2604.03733) | 2026 프리프린트 |
| S42 | [A402](https://arxiv.org/abs/2603.01179) | 2026 프리프린트 |
| S43 | [Five attacks on x402](https://arxiv.org/abs/2605.11781) | 2026·당시 구현 범위 |
| S44 | [When HTTP 402 Meets the Blockchain](https://arxiv.org/abs/2607.19545) | 2026·측정과 업체 수정 |
| S45 | [Probability of Backtest Overfitting](https://scholarworks.wmich.edu/math_pubs/40/) | 다중 설정 선택 문제 |
| S46 | [Gneiting·Raftery proper scoring](https://sites.stat.washington.edu/people/raftery/Research/PDF/Gneiting2007jasa.pdf) | 2007 |
| S47 | [Adaptive conformal inference](https://arxiv.org/abs/2106.00170) | 2021·보장 조건 |

## 구현 검증 중 확인한 경계 수정

기존 공통 차트는 대표 경로가 하한·상한 안에 들어간다고 전제했다. 새 모형의 대표 경로는 10–90% 분위수 밖으로 나갈 수 있으므로 이 전제를 유지하면 렌더링이 실패한다. adaptive 모드에서는 대표 가격의 양수·유한성과 `하한 ≤ 중앙값 ≤ 상한`을 독립적으로 검증한다. 화면 경계 보간에서도 분위수를 대표 경로까지 넓히지 않는다. 기존 외부 평가·주식 경로의 포함 조건은 유지한다. 실제 원자료 렌더와 밴드 밖 합성 예시, 로그·선형 경계 보간으로 이 차이를 검사한다.

2025년 기관 가격 문턱은 2025-01-01–12-31의 Coinbase ETH-USD 장중 고가에 한정한다. 전체 365일이 없고 초과가 관측되지 않았다면 미달 확정을 하지 않는다. Galaxy의 5,500달러 초과와 VanEck의 6,000달러 초과를 검사하되, VanEck의 분기별 경로까지 검증한 것으로 세지 않는다. 다른 거래소의 모든 체결에 대한 명제도 아니다. 미래 데이터가 추가되어도 2025년 판정에 전 기간 최고가를 사용하지 않는다.

기존 비교의 `coreCommonCases`/`coreDisjointMeanAbsoluteLogErrors`는 기존 6개 모델에 관한 공통 집합이다. 신규 adaptive 모델의 공정한 대조는 동일 origin·horizon을 맞춘 pairwise/paired baseline 결과를 사용한다. 단일 중앙 80% 구간의 로그 interval score를 사용하며, 여러 분위수 구간을 합친 WIS로 부르지 않는다.
