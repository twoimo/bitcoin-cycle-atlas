# ETH 기존 모형과 남은 조건: 수치 안정성 및 실제 전향 발행

> **최종 실제 소스93810f3:** 일반1,469·집중336·native35개와181PNG 통과, Hallmark0FAIL/0REFLEX. 고정seed 패널은 pooled의 단일seed 개선이 안정적이지 않음을 보였다. 최초 adaptive/pooled 발행2개를 유지하고 실제 재수집에서신규0·재사용2,별도프로세스731점정확재생을 확인했다. 고유원점1·pending6·scored0이다. [실행 증거](eth-candidate-evidence/20261027-model-depth/README.md).


## 고정 정책 — 새 결과를 보기 전 기록

2026-10-27 후속 작업이다. PR #39의 기존 adaptive/pooled 가격 과정, 화면 기본값, 256회·seed 20261027 경로를 유지한다. 이 문서의 최초 버전은 실행 결과가 아닌 구현 정책이다.

### 모의 표본 오차 점검

고정 seed는 20261027, 1, 104729, 130363, 155921, 196613, 262147, 524287이며 경로 수는 256·1024다. 30·90·180일의 두 평가 집합을 기존 비교 결과에서 먼저 고정한다: adaptive/pooled 공통 성숙 원점, pooled/flat 성숙 원점. 교집합을 만든 뒤 기존 비중첩 선택 규칙을 적용하고 새 seed 결과로 표본을 바꾸지 않는다.

원점별 적합은 재사용하고 각 seed·경로 수에 대해 180일까지 한 번만 모의한다. 같은 숫자 seed가 두 모형에서 같은 충격을 생성한다는 주장은 하지 않는다. 모든 seed별 로그오차·로그 interval score를 보존하고, 두 모형 손실 범위의 전체 조합 차이를 보고한다. 이는 선언한 패널의 수치 민감도이며 신뢰구간·시장 예측 유의성·성숙한 전향 성과가 아니다. 좋은 seed를 선택하지 않고, 1024회 결과를 자동 기본값으로 승격하지 않는다.

이전 256회/default seed의 예측과 원래 분위수는 각 고정 원점에서 정확히 재현해야 한다. 한 simulation의 실패도 표본 삭제로 숨기지 않고 패널 불완전으로 기록한다. [Owen, Monte Carlo Theory, Methods and Examples §2](https://artowen.su.domains/mc/Ch-intro.pdf), [Koehler, Brown & Haneuse 2009](https://pmc.ncbi.nlm.nih.gov/articles/PMC3337209/)는 수치 모의 오차를 모형 자체의 불확실성과 구분하는 근거다.

### 유한 입력의 계산 경계

경제 후보를 eth-economic-ridge-5로 식별한다. 일반 입력에서는 기존 나눗셈·지수 산술을 그대로 사용하고 중간 비율/지수 결과만 0 또는 무한대로 무너질 때 로그 영역 계산을 사용한다. 최종 가격 자체가 표현 불가능하면 계속 사용 불가다. 현재 관측 ETH/BTC 비율도 양수·유한값이어야 한다. BTC beta 수익률에도 같은 제한적인 로그비율 복구를 적용한다.

합성 극단값 검사는 경제 데이터나 예측 적중률이 아니다. 실제 경제 입력 적격성·최소 16개 학습 표본·12개 보정 정책을 완화하지 않는다.

### 신규 후보의 전향 기록

기존 asset 원장 9개는 ETH 가치평가 stress/base/bull과 BMNR/MSTR 조건 기록이다. 그 27개 pending을 adaptive/pooled의 발행 후 평가 표본으로 세지 않는다. 두 후보는 중앙값·q10/q90·대표 경로를 별도 의미로 저장하는 전용 원장이 필요하다. 대표 경로는 분위수 밖에 있을 수 있다.

최신 완료 ETH 가격을 실제로 수집한 경우에만 신규 원점의 전체 경로와 flat/shrunkenTrend 기준을 고정한다. unknown publishedAt은 null, 과거 판본 미확보는 false로 유지한다. 수집·생성·발행·목표 관측 종료를 구분하고 과거로 발행 시각을 소급하지 않는다. 결과 관측이 없는 현재의 점수는 0표본이다.

Gemini 반대 검토와 후속 역검토는 omitted-by-user다. PR Draft·releaseAuthorized=false를 유지한다.

## 실제 발행 계약 — 실행 전 고정

새 원장은 research-data/ethereum-prospective-ledger에 기존 asset 원장과 별도로 보존한다. base는 54317f7d05abd8fe569b0912ff34caee2bbe9981의 dist/data/eth-ohlc.json, Git blob 882c49f0263034426e4e3afe377cc60a17448b6c, 895,609 bytes다. 이 base를 최신 자료로 이름만 바꾸지 않는다.

Coinbase ETH-USD daily endpoint 한 번만 요청한다. 실제 요청일 UTC 자정까지, 기존 요청 종료점에서 7일 전부터의 범위다. 최대290일·300행·2MiB·본문 종료까지30초·재시도0·redirect금지이며, 요청한 모든 완료 일자가 있어야 한다. 공식API가 범위 밖 행을 반환할 수 있으므로 전체 원문을 보존하고 제외 수를 기록한다. 원래 base bytes와 raw tail bytes에서 입력을 정확히 재구성하며 미수신·실패를 성공 가격으로 채우지 않는다. [Coinbase 공식 명세](https://docs.cdp.coinbase.com/api-reference/exchange-api/rest-api/products/get-product-candles).

원장 경로 열은 date / median / q10 / q90 / representative다. q10≤median≤q90를 요구하고 대표 경로의 원래 숫자는 그대로 남긴다. 730일까지731점, 정책 seed20261027·256회, 30/90/180일 목표와 같은 원점의 flat/shrunkenTrend 기준을 함께 고정한다. baseline/정책을 결과를 본 뒤 재추정하지 않는다.

정보 cutoff는 실제 tail 수신 완료 시각이며, base 원문 수집 시각·계산 시작/완료·발행 시각을 따로 기록한다. 요청·발행 사이 UTC 날짜가 바뀌어 입력이 최신 완료 관측이 아니게 되면 발행을 거부한다. 출처의 최초 공개 시각은 계속 null이다. 파생 prefix hash와 원래 base/tail hash를 혼동하지 않는다.

runKey는 base/tail 원문 hash·가격 prefix hash·merge 정책·모형 소스·옵션에 묶이고 수집/발행 시각 자체는 제외한다. 원문과 모형이 같은 재실행은 기존 발행 시각과 기록을 재사용한다. 같은 runKey에 다른 outputHash가 나오면 실패다. 원문 개정본 때문에 같은 원점에 기록이 늘어도 독립 원점 수는 늘지 않는다.

결과 평가는 발행 전 시각을 거부하고, 목표일의 UTC 종가가 종료됐으며 해당 실제값을 평가 cutoff까지 수집한 경우에만 중앙값 로그오차와 raw interval score를 계산한다. 미래·미수집 결과는 pending/missing으로 남기고 score를 만들지 않는다. 평가에도 정확한 소스 hash를 남긴다.

## 경제 데이터의 정의 대조

고정 growthepie backend 567f60415e8b48eb84f7b08e1bd83c8ca99995bf에서 다음 불일치를 확인했다. 이는 현재 hosted API가 반드시 같은 코드를 실행한다는 주장이 아니다.

| 원문 | 현재 경제 모형에 바로 대입하지 않는 이유 |
|---|---|
| [ETH supply adapter](https://github.com/growthepie/gtp-backend/blob/567f60415e8b48eb84f7b08e1bd83c8ca99995bf/backend/eim/adapters/adapter_eth_supply.py) | CL 보상은 epoch 정규화 표본의 시간 평균에 epochs/hour를 곱한다. 정확한 UTC 28일 순발행 합계로 승격하려면 경계·집계 검증이 필요하다. activeBalanceGwei는 대기 등을 포함한 전체 stakedEth 계약과 같지 않다. |
| [Collateral adapter](https://github.com/growthepie/gtp-backend/blob/567f60415e8b48eb84f7b08e1bd83c8ca99995bf/backend/eim/adapters/adapter_eth_collateral.py) | 가변 프로토콜 집합과 최신 USD/ETH 환산·LST 차감은 고정 universe의 underlying 중복 제거를 증명하지 않는다. |
| [Blob fee SQL](https://github.com/growthepie/gtp-backend/blob/567f60415e8b48eb84f7b08e1bd83c8ca99995bf/backend/src/queries/postgres/da_metrics/ethereum_blob_base_fee.sql.j2) | TRUNC(EXP(...))를 사용한다. EIP-4844의 정수 fake_exponential과 동일한 bit-exact 회계라고 단정할 수 없다. |
| 기존 Coin Metrics archive | gross 발행·총수수료·L1 거래수와 consensus 순발행·분리된 blob 회계·gas 사용량은 각각 다른 정의다. |

기존 PoW 발행0 부분 관측은 유지한다. 약20만 블록의 완전한28일 gas/소각 합계를 boundary 블록이나 float feeHistory 비율에서 만들어 내지 않는다. 전체 경제 snapshot과 과거 원점 적격성을 확보했다는 주장은 하지 않는다.

## 최초 실제 발행과 재실행 보완

소스7b68ce295a35d39fd53f174f93090bafd47e9dce의 실제 evidence 실행에서 Coinbase 요청1회·재시도0·528 bytes 수집을 완료했다. 2026-10-26 완료 ETH-USD 종가는 $2,320.34다. 실제 수신 완료2026-10-27T07:44:13.188Z, 발행2026-10-27T07:44:13.396Z이며 한국 시각으로16:44:13이다.

adaptive/pooled 각각731점과 30/90/180일 target·flat/shrunkenTrend를 처음 고정했다. 최초 snapshot1개·record2개·고유ETH원점1개·pending6개·scored0개다. 두 기록을 각자의 보존 원문에서 실제 모델 재실행으로 정확재생했다. 첫30일 targetDate는2026-11-25이고 관측 종료는2026-11-26T00:00Z(한국09:00)다.

원본 기록·snapshot·raw·receipt의 실제 Git blob을 Actions의 file manifest와 대조해 별도 연구 원장에 보존한다. 후속 소스는 발행기를 다시 실행해도 이 원장과 같은 실행 디렉터리의 원장을 함께 읽고 기존 발행 시각을 재사용한다. 수집/발행 receipt는 내용 주소 경로에도 보존한다. 추가 verify-preserved-only 프로세스는 네트워크 요청0·새 발행0으로 디스크의 원본을 읽어 모형을 다시 계산한다. 이 후속 검증의 실제 상태는 최종 실행 영수증에서 확인한다.

초기 수치/MC 소스a7f81838de9f1c8a480f554255b10e41dd85989e의 전체 일반1,446·집중313·native35개,181PNG가 통과했다. MC는35회 적합 재사용·64,512,000 draw-days·9.716초, default105개 원점/horizon/model 비교 정확일치다. 기존 9개 모형의731점·27요약·45pairwise 보존도 통과했다. 고정 seed 패널의 세 pooled/flat 기간 모두 skill 부호가 바뀌므로 단일seed의 작은 개선을 안정적 우월성이라고 부르지 않는다. 이 값은 최초 소스 실행 결과이며 후속 소스의 검증을 대신하지 않는다.

## 전체 시각 증거를 유지하는 로그 전달

모든 browser case·assertion·스크린샷·byte 수·SHA256을 유지한다. ETH workflow의 `ETH_BROWSER_IMAGE_LOG_MODE=failures-only`는 성공 PNG의 base64를 로그에 중복 출력하지 않고 전체 Actions artifact에 보존한다. 실패 PNG는 계속 로그에 전달한다. verifier의 기본값은 representative이며 실제 mode를 report와 receipt에 남긴다. 원본 이미지·UI·금융 계산·검증을 줄이지 않고 큰 완료 로그의 connector 회수 실패를 해결하는 변경이다.

## 실제 재실행에서 발견한 범위 밖 일봉의 중복 발행

소스85b958의 Coinbase 응답은 요청 종료2026-10-27T00:00Z와 같은 timestamp의 미완료 일봉도 포함했다. 이 행은 가격 계산에서 정확히 제외됐으나 전체 raw tail hash가 달라져 같은731점·outputHash를 가진 두 후보를 새 raw-run으로 추가했다. 해당 중간 실행의 총4개 기록·pending12개는 고유 원점1개이며 새로운 금융 증거가 아니다. 최초7b68 발행2개는 그대로 보존하고 중간 중복 실행의 원문·기록도 실행 증거로 남긴다.

후속 scripts-only 정책eth-prospective-completed-tail-reuse-1은 base 원문·정확한 request·완료 tail6열·전체 가격 prefix·모형 sourceHash/version·옵션·기간을 묶는다. 요청 범위 밖 행만 달라져도 원문은 새 observation/acquisition에 남기되, 동일 완료 입력의 최초 발행 기록을 재사용한다. 완료OHLCV나 실제 과거가격·모형이 바뀌면 계속 새 판본이다. 같은 입력에서 output/targets/benchmarks가 다르면 실패한다. 기존 기록이 이번 시도보다 나중에 발행됐다면 재사용을 거부한다. 모델 source graph와 최초 기록의 바이트는 수정하지 않는다. 이 후속의 실제 결과는 별도 최종 영수증으로 확인한다.

보존 원장에 이미 commit된 record/snapshot은 원래 파일 전체를 실행 artifact와 source-book에 계속 포함하고, 로그에서는 정확한commit/path/SHA256 참조를 남긴다. 신규 acquisition·raw·observation·evaluation·receipt는 원문 조각을 전달한다. 동일한1MiB snapshot을 매번 로그에 중복 출력해 connector 회수가 실패했던 문제를 줄이는 변경이며, 자료·검증·원본 artifact를 생략하지 않는다.


## 실행으로 확인한 핵심 결과

최종 검증 소스는 `93810f3ae099aa8af37bc41a3762981ab749a7b4`이고 tree는 `2e9fec444da0b1565ed14dcbe612e34e0e42470f`다. 실행 영수증은 [이번 증거 모음](eth-candidate-evidence/20261027-model-depth/README.md)에 보존한다. 이후 결과 문서 커밋과 실행 소스를 구분한다.

### 작은 개선의 수치 안정성

가격 유지(flat) 대비 skill을 `1 - pooled 평균 절대 로그오차 / flat 평균 절대 로그오차`로 계산했다. 아래는 고정한 여덟 seed에서 실제로 얻은 최소·최대다. 양수는 pooled 오차가 더 작음, 음수는 더 큼을 뜻한다. 수익률이나 신뢰구간이 아니다.

| 예측 기간 | 비중첩 역사 원점 | 256회 경로의 skill 범위 | 1,024회 경로의 skill 범위 |
|---|---:|---:|---:|
| 30일 | 20 | -1.948% ~ +1.044% | -1.134% ~ +0.305% |
| 90일 | 10 | -2.953% ~ +1.668% | -1.858% ~ +1.070% |
| 180일 | 5 | -6.520% ~ +8.429% | -1.761% ~ +4.968% |

세 기간 모두 seed에 따라 부호가 바뀐다. 기존 default seed의 30일 +0.085219%를 안정적 예측 우위로 사용할 수 없다. 경로를 네 배 늘린 실험도 시장 정보나 실제 역사 원점을 추가하지 않는다.

adaptive와 pooled의 공통 원점은 30/90/180일에 9/4/2개다. 30일 점오차는256회에서 순위가 바뀌고1,024회 패널에서는 adaptive가 작았다. 90일 점오차는 두 경로 수의 선언된 모든 seed 조합에서 pooled가 작았으나 원점은4개다. 180일 점오차는 두 경로 수 모두 순위가 바뀌었다. 90/180일의1,024회 interval score는 pooled가 작았지만, 이 역시 해당 패널의 설명이며 미래 우월성·유의성·보정 완료를 뜻하지 않는다.

비교 차이 범위는 pooled 최소 손실 − adaptive 최대 손실부터 pooled 최대 손실 − adaptive 최소 손실까지다. 두 모델이 같은 seed 번호에서 같은 난수 충격을 소비한다는 가정은 하지 않았다. 원점 표본을 교집합으로 맞추기 전의 서로 다른 평균을 우열 근거로 비교하지 않는다.

### 계산 안정성과 성능

유한 가격의 나눗셈 결과만0/Infinity로 무너질 때 `log(a)-log(b)`로 복구한다. `anchor*exp(r)`의 중간 exp만 표현 범위를 넘는 경우 `exp(log(anchor)+r)`를 사용한다. 일반 범위의 기존 계산 순서를 유지하고, 최종 가격 자체가 유한 양수가 아니면 사용 불가로 남긴다. 가격을 임의 상한으로 잘라 정상 예측처럼 표시하지 않는다.

5개 수치 경계 테스트는 극단 유한값의 학습 label·상대 수익률·가격 재구성·BTC beta를 확인한다. 모의 패널의5개 테스트는 원점·seed·예산 완결성과 원래 구간으로 재계산한 손실·구간점수를 확인한다. 원장9개·수집7개·완료 입력 재사용7개 테스트는 진짜 모델 재실행, 원문 변조, 불일치 시각, 미성숙 결과, timeout·overflow·HTTP/JSON/UTF-8/BOM 실패를 확인한다.

최종 실험은 모형/원점별 적합35회를 재사용하고180일까지 한 번 생성한 경로에서30/90/180일을 추출한다. 총64,512,000 draw-days, 최대 로그 행렬1,482,752 bytes이며 기존 default105개 비교가 정확 일치해야 한다. 측정 시간은 Actions Node 실행값이다. 실제 모바일 반응속도 또는 기존 대비 몇 배 향상이라는 주장은 하지 않는다.

### 최초 발행의 의미와 만기

최초 발행의 독립 원점은1개다. 두 모델×세 기간의6개 target이 서로 독립적인6개 시장 국면이 아니다. 기존9개 자산 원장의27개 pending도 새 후보 증거에 더하지 않는다.

| 기간 | 고정 목표일(UTC 일봉) | 해당 관측 종료(한국 시각) |
|---|---|---|
|30일|2026-11-25|2026-11-26 09:00 KST|
|90일|2027-01-24|2027-01-25 09:00 KST|
|180일|2027-04-24|2027-04-25 09:00 KST|

목표일 도달만으로 점수가 생기지는 않는다. 실제 완료 일봉을 수집하고 평가 cutoff와 출처를 확인해야 한다. 현재 mature/scored는0이다. q10/q90는 원래 모의 분위수이며 실증적으로 보정된80% 예측구간으로 바꾸지 않는다. 대표 경로는 한 표본이므로 q10/q90 밖에 있어도 중앙값으로 바꿔 저장하지 않는다.

원장에 저장된 실제 기준 종가는2026-10-26의$2,320.34이고, 역사 비교/화면의 기존 고정 입력은2026-10-25다. 두 cutoff를 합치거나 새 tail을 기존 화면 가격 archive에 덮어쓰지 않았다.


### 최초 보존 발행본의 실제 값

다음은2026-10-27 16:44:13 KST에 고정한 연구 출력이다. 목표가 추천·시장 실측·보정된80%구간이 아니다. 원래731점과 전체 정밀도는 각 record JSON에 남긴다.

| 기간 | adaptive 중앙값 | adaptive q10–q90 | pooled 중앙값 | pooled q10–q90 |
|---|---:|---:|---:|---:|
|30일|$2,326.96|$1,882.21–$2,914.15|$2,304.53|$1,976.48–$2,831.11|
|90일|$2,315.58|$1,617.29–$3,347.20|$2,272.18|$1,625.72–$3,301.87|
|180일|$2,344.01|$1,329.42–$4,004.73|$2,396.39|$1,302.18–$3,800.66|

예를 들어 adaptive180일의 예시 한 경로는$6,103.82, 중앙값은$2,344.01이다. 같은 시점 raw q90$4,004.73 밖의 예시 경로도 원래대로 보존한다. 한 예시의 상승 모양을 중앙 예측이나 보장된 향후 주기로 해석하지 않는다.

## 남은 조건과 해소 기준

| 조건 | 현재 상태 | 해소에 필요한 실제 증거 |
|---|---|---|
| 후보 전향 발행과 재생 | 최초2개 발행·고유 원점1개. 최종 실제 재수집에서 신규0·최초2개 재사용 | 새로 다른 완료일 입력이 도착할 때 동일 계약으로 누적 |
| 성숙 전향 성과 | pending6, scored0 | 목표 종료 뒤 실제 관측 수집 및 고정 baseline과 원래 구간으로 평가 |
| 엄격 경제 입력 | 전체 적격 snapshot0, 활성화false | 25개 지표의 단위·계층·UTC 기간·cohort·중복 제거 정의 및 원문 |
| 과거 가용 판본 | 확보false | 해당 과거 예측 원점까지 실제 가용했던 공개·수집 판본 |
| 장기 경제 학습 | 최소16개 유지 | 동일 horizon의 비중첩 성숙 정답과 충분한 시장 국면 |
| 구간 보정 | 최소12개 유지, 화면 raw 구간 유지 | 별도 보정/검증 자료와 실제 coverage 점검 |
| Gemini 반대 검토·후속 역검토 | omitted-by-user | 사용자 생략 지시를 유지. 새 필수 조건으로 되살리지 않음 |
| 공개 운영 채택 | Draft·releaseAuthorized=false | 결과와 별도 릴리스 권한. 테스트 성공을 승격 허가로 해석하지 않음 |

경제 모형의2026-10-25 기준 가장 낙관적인 표본 상한은30/90/180일43/14/7개이며 최소16개와 비교한다. 90일 모형의 가장 빠른 이론상 발행 경계는2027-03-23 09:00 KST,180일은2031-03-02 09:00 KST다. 이는 실제 준비일 약속이 아니다. 최초 완료 출금·측정 누락·과거 판본 부족은 더 늦출 수 있다. 30일은 달력 상한이 충분해도 현재 경제 입력이0개다.

## 연구 해석의 유지

[기관·논문·미래에셋·AI 수요 및 ETH 재모형화 연구](ETH_REMODELING_RESEARCH_20261027.md)의 해석을 유지한다. 2025년 Coinbase ETH-USD 최고 장중가는8월24일$4,955.90이며,2021년 장중 최고$4,867.81을 넘었다. 따라서 PoS 전환 때문에2025년에 달러 최고가를 경신하지 못했다는 전제는 사용하지 않는다. 달러 가격과ETH/BTC 상대성과, 상반기 보고서와 연간 결과를 구분한다.

톰 리의 `ETH 가격 = BTC 가격 × ETH/BTC 비율`은 조건부 산술이다. 과거 평균 비율의 회귀·미래 BTC 목표 달성·두 사건의 결합 확률을 증명하지 않는다. AI 요청 증가도 정산 batching·채택 체인·L1/blob 수수료·ETH 보유 회전율을 거쳐야 한다. 거래량을 소각량이나 보유자 가치로 바로 치환하지 않는다. 이 연구의 실제 식과 반례는 계속 보존하며 미확보 계수를 미래 가격에 임의 가산하지 않았다.

## 최종 검증 표

| 검증 | 실제 실행 결과 |
|---|---|
| [일반 CI 40470921248](https://github.com/twoimo/bitcoin-cycle-atlas/actions/runs/40470921248) | **1,469 pass / 0 fail / 0 skipped**, 수치assertion318,010, negative controls16/16. 별도32/32·daily28/28·static17/17 |
| [직접 head evidence 40470921260](https://github.com/twoimo/bitcoin-cycle-atlas/actions/runs/40470921260) | **집중336/336, native35/35, 181PNG**, runtime0 / unexpected resource0 |
| offline 원문 | 원본resource오류15개를 보존하고 예상된 offline 갱신 실패별 상태·재시도를 검증 |
| [Hallmark 40470922626](https://github.com/twoimo/bitcoin-cycle-atlas/actions/runs/40470922626) | **0FAIL / 0REFLEX**, static36/render17WARN, integrity errors0, waiver/dismissal0 |
| 최초 기록 재사용 | **새 기록0 / 기존2 재사용**, 원래2026-10-27T07:44:13.396Z 유지. 같은 raw 응답을 가정하지 않고 실제 제외 행 변경을 확인 |
| 별도 프로세스 재생 | **verified-preserved**, 네트워크0·신규0·모델재계산2개×731점 정확일치 |
| 기존 모형 보존 | 기본adaptive,731점·27요약·45pairwise 정확일치. 원래adaptive/pooled 소스·ETH가격·자산원장18개 보호파일 Git blob 일치 |
| MC 실제 실행 | 결과complete,105개 default 비교정확일치,35회fit·64,512,000draw-days, **9.536초** |
| source-book | **267seeds / 384entries / 283parts / 50,872,902bytes**, unresolved0 |

일반 CI의 실제checkout은 합성merge`3faa2c5c9be1c5987b89fa3544e48aa5f861ccf6`, tree`47ba5f46496e941e3e79c979d0526cb31490e4e1`이다. 부모는main`5dd11c99faa1fe4a1a9adf56bc4775d35c9a41e4`와 직접head`93810f3ae099aa8af37bc41a3762981ab749a7b4`다. 집중·native·Hallmark의 직접head 실행과 구분한다.

source-book SHA256은`eee657861513c6c055a2be299f11599e639d1b70582f62b246a2130b6f3d91cb`이다. generator의 generic externalReview.pending은 원본으로 남기고, 현재 사용자 정책은 두 외부 검토 모두 omitted-by-user로 별도 기록한다.

[전체 실행 artifact](https://github.com/twoimo/bitcoin-cycle-atlas/actions/runs/40470921260/artifacts/12719255668)는181PNG·전체browser report·source-book·수집원문을 포함한다. ZIP SHA256은`c4720ee5758dee16c21527a5197cb40c4f2dabae4862bc048f186f38c123427c`, 보존기한은2026-11-26 17:10:16 KST다. 실제 prospective 원문·snapshot·기록·evaluation·주요영수증과 중간85b 중복기록은Git 문서에도 보존했다.

35개 화면 검사에는 큰 비교표의 내부 하단0.25px, 짧은 화면의스크롤·닫기·두축고정,18종목·BTC첫행·비트코인,기존모형선택과저장발행본을 포함한다. 실제Chromium 검증이며물리iOS/Safari 전체검증으로 확대하지 않는다. Hallmark의 headings52/54·figures208/209 경고는남아있다.

본 작업은Draft PR에만 반영했다. main변경·병합·공개배포·기본모형승격은 수행하지 않았다.

