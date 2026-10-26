# ETH 후속 조건: 실제 수집, 발행본, 제거 실험, 검토 소스

이 문서는 PR #39의 추가 구현 계약이다. 실행 완료 여부와 정확한 commit/run은 별도 실행 영수증으로 확인한다. 코드를 작성했다는 사실만으로 실제 Gemini 검토, 전향 성과 또는 배포를 주장하지 않는다.

## 1. 경제 입력의 실제 수집과 정의 경계

scripts/capture-ethereum-economic-data.mjs는 확인된 GitHub 원문 두 개만 수집한다. 각 요청의 시작과 전체 본문 수신 완료 시각을 실제로 기록하고, 고정 byte 수와 Git blob SHA-1 및 SHA-256을 검사한다. 수집은 시도당 한 번이며 redirect를 허용하지 않는다. 완성된 원문과 LICENSE, attribution, 부분 수집·실패·시간 초과·취소 상태를 실행 artifact에 남긴다. 강제 종료에서는 최종 영수증이 없을 수 있으므로 시작 영수증을 성공으로 해석하지 않는다.

| 자료 | 고정 원문과 처리 |
| --- | --- |
| Coin Metrics ETH CSV | coinmetrics/data의 f1a36afb962731c387bb03982758ab0103063da5, csv/eth.csv, blob d8e4f389b37626f432a923805e5cc5fa2ad5490b, 2,121,732 bytes |
| LICENSE | 같은 commit의 LICENSE, blob f8f2af023ec95cb746dd08ec624c4c147b375af9, CC BY-NC 4.0, Coin Metrics, Inc. 표기 보존 |
| 정의 문서 | coinmetrics/product-docs의 8489126ae94aff995d01be44f965327f2640f51e. 정의 URL은 adapter에 필드별 기록 |
| 최신성 | 3,952행 중 선택한 원시 경제 필드가 완결된 행은 3,951개. 최신 완결일 2026-05-23, 마지막 2026-05-24행은 참고값만 포함. 2026-10-25 기준 155일 시차 |
| 과거 판본 | 현재 받은 archive의 수집 시각만 증명. Git commit 시각과 provider 계산 완료 시각은 실제 최초 공개·과거 수집 시각으로 사용하지 않음 |

[원자료](https://github.com/coinmetrics/data/blob/f1a36afb962731c387bb03982758ab0103063da5/csv/eth.csv), [라이선스](https://github.com/coinmetrics/data/blob/f1a36afb962731c387bb03982758ab0103063da5/LICENSE).

원시 지표가 존재한다는 사실과 가격 모형의 25개 정의를 충족한다는 사실을 구분한다.

- FeeTotNtv는 실행 base·priority와 blob 수수료를 포함한다. 이를 executionFeesEth로 넣고 blobFeesEth를 다시 더하지 않는다.
- IssTotNtv는 gross 발행이다. consensus net 발행과 동일하지 않으며, ETH_CL의 입금 포함 정의도 분리해야 한다.
- SplyCur는 실제 계열의 실행/합의 계층 범위와 역사적 회계 정의를 먼저 정산해야 한다.
- TxCnt는 L1 거래 건수다. gas 사용량, 고정된 L2 집합의 거래 건수 또는 이용자 수를 대신하지 않는다.
- 스테이킹 cohort의 순보상·출금 대기·실제 거래 가능 LST 유동성, 중복 제거 담보, 소각 분해 등은 이 원문에 없다.

따라서 이 수집 결과의 definitionMatchedMetricCount와 eligibleModelSnapshotCount는 0이며 fullModelSnapshotReady는 false다. 실제 수집 성공도 이 상태를 변경하지 않는다. 비교기는 이 coverage의 적격 스냅샷 목록만 받으며 사용 불가 모형을 활성화하지 않는다.

## 2. 변수 제거 실험의 실제 손실 비교

dist/ethereum-economic-ablation.js는 각 원점에서 full 모형과 한 설명변수를 뺀 모형을 각각 과거 자료만으로 다시 추정한다. 같은 원점·horizon·목표 관측을 묶어 ETH/USD와 ETH/BTC를 별도로 평가한다. 미래 BTC 가격은 ETH/BTC 정답 계산에만 들어간다.

추가 변수의 상대 기여는 1 − full 평균 절대 로그오차 / reduced 평균 절대 로그오차다. 양수이면 그 변수를 유지한 full 모형의 오차가 더 작았다는 뜻이다. 0 표본과 0 분모는 임의 숫자로 채우지 않는다. 중첩 표본과 비중첩 표본, 미확정·누락·사용 불가를 구분한다. 비중첩 기간도 독립 거시 국면 수와 동일하지 않다.

손실은 log(예측) − log(실제)의 절대값으로 계산한다. 나눗셈을 먼저 해서 유한 가격의 비율이 0 또는 무한대로 바뀌는 문제를 피한다. 명시적 null 발행 시각은 실제 발행 시각으로 간주하지 않는다. fallback 시각은 평가 정책으로 표시한다.

합성 fixture는 식·시간 경계·변수 연결을 검사한다. 실제 경제 스냅샷이 0이므로 실증 변수 기여 점수와 전향 성과는 아직 0표본이다.

## 3. ETH·BMNR·MSTR의 별도 연구 발행 원장

기존 BTC dist/data/forecast-ledger는 그대로 보존한다. 새 asset-forecast-records.js는 별도 asset-forecast-ledger에 입력 snapshot, 조건별 record, index와 평가를 저장한다.

- 관측 종료 eventAt, 전체 원자료 종료 sourceEventAt, 소비한 prefix, 실제 수집 collectedAt, 정보 cutoff, 실제 issuedAt을 분리한다.
- 알려지지 않은 publishedAt은 null로 남긴다. 실제 수집 시각은 가용성을 확인한 상한이며 과거 보유 판본을 증명하지 않는다.
- 원문 JSON의 SHA-256과 Coinbase/Yahoo adapter가 재구성한 실제 입력 prefix를 모두 대조한다. 원문 해시만 저장하고 별도 계산 가격을 바꾸는 우회를 거부한다.
- 발행본은 cutoff와 issuedAt 모두에서 최신 완료 관측을 사용해야 한다. 현재 시각에 새로 계산한 과거 원점은 reconstructed로만 저장한다.
- 코인 UTC 종가와 NY 주식 종가를 별도로 계산한다. 2026-10-23 NY 종가는 20:00Z, 같은 날짜 코인 종가는 10월 24일 00:00Z다. 주식 종가 시점에서 뒤의 코인 종가를 사용할 수 없다.
- 같은 source bytes·가정·seed의 재실행은 같은 runKey다. 시각이나 commit만 바꾸어 새 경제적 실행으로 세지 않는다.
- 변경된 같은 원점의 발행본은 이전 record를 남기고 predecessor와 이유를 기록한다. 순환·누락 ancestry를 거부한다.
- 재생용 전체 일별 가격·조건 범위를 정확히 보존한다. 조건 범위는 확률구간이 아니다. 앵커 부동소수점 오차는 8 EPSILON 이하의 한정된 허용치와 원래 차이를 기록하며 경로 숫자를 덮어쓰지 않는다.
- 30·90·180 달력일의 주식 타깃은 그 날짜 이후 첫 검토된 거래일이다. 현재 내장 거래일 검토 범위 밖에서는 자동 추정하지 않는다.
- 실제 타깃 관측을 해당 평가 시각까지 수집한 뒤에만 점수가 생긴다. 발행 전 평가와 과거 원점 소급 발행을 차단한다.

publicationScope는 draft-pr-research, productionAdopted는 false, firstPublishedAt은 null이다. 연구 발행본의 보존과 공개 운영 채택은 별개다. 현재 화면의 일회 계산은 발행 원장에 저장되지 않았음을 표시하고 고정 검토 날짜를 실제 발행 시각이라고 부르지 않는다.

## 4. 정확한 검토 소스와 남는 외부 검토

build-eth-review-packet.mjs는 실제 Git commit/tree/blob의 원문을 묶고 V8로 static import와 re-export를 파싱한다. 응용 코드를 link하거나 실행하지 않는다. 런타임 data와 HTML/CSS, 실행 증거는 명시적 inventory로 제공한다. 동적 import는 확인된 literal 또는 정확한 원문 위치에 대한 선언으로만 연결하고, 미해결 항목은 SOURCE_MISSING으로 남긴다. 이 한정된 검토 범위를 임의 JavaScript 프로그램 전체의 의존성 증명으로 확대하지 않는다.

UTF-8 분할은 다시 합치면 원래 source-book의 byte와 SHA-256이 같아야 한다. 세 단계의 완전한 보고서, 실제 모델·제공자·설정·시각·원문 URL, 현재 소스 해시, 두 파일 이상의 실질 원문 readback, 앞선 보고서의 실제 본문과 해시를 검사한다. 구조 검사 통과는 외부 모델 실행의 진위 확인이나 릴리스 승인이 아니다.

실제 Gemini 실행 경로와 해당 보고서는 이 세션에서 확보되지 않았다. 동일 모델의 분리 검토나 합성 계약 테스트를 Gemini 반대 검토로 대체하지 않는다. 이 조건과 실제 전향 성과·충분한 경제 판본이 남아 있으므로 새 모형의 기본값 승격·main 병합·배포는 진행하지 않는다.
