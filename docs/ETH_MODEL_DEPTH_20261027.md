# ETH 기존 모형과 남은 조건: 수치 안정성 및 실제 전향 발행

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

## Complete visual artifacts with bounded log transport

All browser cases, assertions, screenshots, byte counts and SHA-256 hashes remain required. The ETH workflow uses `ETH_BROWSER_IMAGE_LOG_MODE=failures-only` so successful PNG base64 is retained in the complete Actions artifact rather than duplicated in the job log. Failure screenshots still use log transport. The default verifier mode remains `representative`; the selected mode is recorded in both the full report and compact receipt. This addresses the connector's failed retrieval of oversized completed logs without removing visual evidence or changing any UI or financial calculation.

## 실제 재실행에서 발견한 범위 밖 일봉의 중복 발행

소스85b958의 Coinbase 응답은 요청 종료2026-10-27T00:00Z와 같은 timestamp의 미완료 일봉도 포함했다. 이 행은 가격 계산에서 정확히 제외됐으나 전체 raw tail hash가 달라져 같은731점·outputHash를 가진 두 후보를 새 raw-run으로 추가했다. 해당 중간 실행의 총4개 기록·pending12개는 고유 원점1개이며 새로운 금융 증거가 아니다. 최초7b68 발행2개는 그대로 보존하고 중간 중복 실행의 원문·기록도 실행 증거로 남긴다.

후속 scripts-only 정책eth-prospective-completed-tail-reuse-1은 base 원문·정확한 request·완료 tail6열·전체 가격 prefix·모형 sourceHash/version·옵션·기간을 묶는다. 요청 범위 밖 행만 달라져도 원문은 새 observation/acquisition에 남기되, 동일 완료 입력의 최초 발행 기록을 재사용한다. 완료OHLCV나 실제 과거가격·모형이 바뀌면 계속 새 판본이다. 같은 입력에서 output/targets/benchmarks가 다르면 실패한다. 기존 기록이 이번 시도보다 나중에 발행됐다면 재사용을 거부한다. 모델 source graph와 최초 기록의 바이트는 수정하지 않는다. 이 후속의 실제 결과는 별도 최종 영수증으로 확인한다.

보존 원장에 이미 commit된 record/snapshot은 원래 파일 전체를 실행 artifact와 source-book에 계속 포함하고, 로그에서는 정확한commit/path/SHA256 참조를 남긴다. 신규 acquisition·raw·observation·evaluation·receipt는 원문 조각을 전달한다. 동일한1MiB snapshot을 매번 로그에 중복 출력해 connector 회수가 실패했던 문제를 줄이는 변경이며, 자료·검증·원본 artifact를 생략하지 않는다.
