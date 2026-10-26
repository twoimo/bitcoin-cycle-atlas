# ETH 후속 조건: 실제 수집, 발행본, 제거 실험, 검토 소스

> **2026-10-27 최신 사용자 지시:** 실제 Gemini 반대 검토와 그 보고서에 대한 후속 역검토는 생략한다. 아래 이전 절에 남은 미완료 표기는 당시의 기록이며 현재의 필수 조건이 아니다. 생략은 통과·완료를 뜻하지 않는다. 수학·데이터·기능 검증, 전향 성과와 별도 릴리스 승인은 유지한다.

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

## 5. 보존한 자산 연구 발행본을 실제 화면에서 재생

ETH, BMNR, MSTR의 미래 가정 설명창에 별도 보존 발행본 버튼을 연결한다. 새 화면은 index와 선택 record·snapshot의 주소 해시, 입력 원문, 실제 계산 prefix, index의 전체 metadata binding을 검증한 후 고정 경로를 그린다. 현재 화면을 열었다는 이유로 새 발행본을 만들지 않는다.

기록 선택, 90/180/365일과 전체 기간, 키보드 날짜 이동, 당시 관측·조건 범위·입력 시계·판본·수정 사유와 JSON 내보내기를 제공한다. ETH는 고정한 무작위 예시 1개와 저장된 조건 기준선을 별도로 그린다. BMNR는 기초 ETH 예시 경로가 주당 평가에 들어감을 설명하고, MSTR를 무작위 ETH 모형으로 설명하지 않는다. 조건 범위는 확률구간이 아니다.

0인 주가 경로가 있는 경우 선형 축에서 원래 0을 그대로 보존한다. 공통 차트가 양수만 연결해 0을 건너뛰지 않도록 이 모드에서는 관측만 공통 엔진에 주고, 저장된 전체 미래를 별도로 그린다. 원래 BTC 차트 엔진과 BTC 발행 원장은 바꾸지 않는다.

loader의 소유권은 index 요청부터 원문 검증까지 유지하며, 실제 취소와 별개로 이전 generation의 늦은 성공·실패·타이머를 차단한다. 닫기·재열기·다른 창 열기·pagehide와 지연된 모듈 import도 같은 최신 요청 규칙을 따른다. 네이티브 close 이벤트가 새로 열린 창을 취소하는 경우와 SVG의 Escape가 모달 닫기를 막는 경우를 교정한다.

검증은 Node의 전체 실제 모듈 테스트와 GitHub Actions Chromium 렌더링으로 수행한다. 초기 검증 범위는 320/390/768/1024/1440px의 비교표·ETH·BMNR·MSTR 20개 경우다. 해당 초기 실행에서는 각 자산 저장본을 연결하고, 추가로 합성 0→양수 회복→0 경로 한 개를 별도 URL 공간에서 검증했다. 이 합성 경로는 reconstructed와 test-only로 표시하며 실제 9개 발행본·경제 자료·예측 성과에 포함하지 않는다. 실행 성공 여부는 해당 소스 commit의 CI와 브라우저 영수증으로 확인한다.


## 6. 후속 감사: 기간별 예측, 프로토콜 시대와 구조적 표본 제약

b320bfa25ebf5516f16ca5413b61de7614056151을 기준으로 후속 감사를 수행했다. 이 절은 추가 코드의 계약이며 새 head의 실행 결과는 별도 Actions 영수증으로 확인해야 한다. 이전 1,307개 테스트와 21개 브라우저 성공을 새 코드에 소급하지 않는다.

ETH 재추정의 기존 조건은 요청한 최장 기간이 마지막 추정 저점을 넘으면 후보 전체를 사용 불가로 만들었다. 같은 원점의 유효한 30·90일 예측도 함께 제외되는 선택 문제가 있었다. 수정은 기간별로 마지막 앵커까지의 기존 로그 보간을 유지하고, 그 뒤의 기간만 사용 불가로 반환한다. 고점권 만료·확정 반전·과거 prefix·원점·계수 식과 다음 파동 금지는 유지한다. 실험 정책은 eth-cycle-comparison-2와 eth-locked-candidate-comparison-2로 구분한다. 새 표본을 포함하면 과거 점수가 나빠질 수 있으며 성능 개선으로 해석하지 않는다. 기존 수치 표는 이전 정책의 역사적 실행 기록이다.

경제 입력에는 mainnet 프로토콜 시대 검사를 추가했다. [실제 genesis](https://github.com/eth-clients/mainnet/blob/8cad4805e9cb5aa5e8e74d30e3f5029a7f133372/README.md)의 1606824023과 [고정 fork 설정](https://github.com/ethereum/consensus-specs/blob/ff73f4dd90a8717b13ed5a52afa5c1af358259b5/configs/mainnet.yaml), [32 slots/epoch](https://github.com/ethereum/consensus-specs/blob/ff73f4dd90a8717b13ed5a52afa5c1af358259b5/presets/mainnet/phase0.yaml)을 사용한다.

- Beacon genesis: 2020-12-01T12:00:23Z. 이전 전체 관측 창에는 합의 발행·활성 스테이킹을 허용하지 않는다.
- Capella: 2023-04-12T22:27:35Z. 이전 전체 관측 창에 실행 계층 사용 가능까지 완료한 출금은 존재할 수 없다.
- Deneb/Dencun: 2024-03-13T13:55:35Z. 이전 전체 관측 창의 blob gas·수수료·소각은 0이어야 한다.
- 활성화 당일은 실제 활성화 이후의 부분 관측을 포함할 수 있다. 28일 창의 시작이 활성화보다 앞선다는 이유만으로 거부하지 않는다.
- 프로토콜의 0은 누락 자료를 0으로 채우는 허가가 아니다. 모든 관측의 원문·공개·수집 시각 계약은 계속 적용한다.

현재 full 모형은 완료 출금 표본이 1개 이상 필요하므로 가장 낙관적인 최초 원점도 2023-04-12다. 이 날짜부터 비중첩 학습 정답 최소 16개를 적용하면 다음 한계가 생긴다.

| 기간 | 2026-10-25의 이론상 최대 성숙 정답 | 요구 최소 | 가장 빠른 asOf | 가장 빠른 자정 발행 |
| --- | ---: | ---: | --- | --- |
| 30일 | 43 | 16 | 2024-08-04 | 2024-08-05T00:00:00Z |
| 90일 | 14 | 16 | 2027-03-22 | 2027-03-23T00:00:00Z |
| 180일 | 7 | 16 | 2031-03-01 | 2031-03-02T00:00:00Z |

이는 실제 확보 표본이나 예측력의 증거가 아닌 낙관적 프로토콜 상한이다. 실제 첫 완료 출금·측정 범위·누락·수집 판본·공개 지연은 가동 가능 시점을 더 늦춘다. 30일의 구조적 상한이 충분해도 현재 적격 경제 스냅샷은 0이다. 90·180일은 원자료 확보와 별개로 현재 계약의 표본 조건도 부족하다. 최소16, 학습 규제와 가격식은 완화하지 않는다. 진단은 feasibility로 보존하며 모형의 ready나 defaultEligible을 대신하지 않는다.

경제 합성 fixture는 2024-04-01부터 시작하도록 옮긴다. 3,000일 fixture는 2032년의 명시적인 가상 미래까지 이어져 식과 학습 절차를 검사한다. 이는 현재 확보한 미래 관측이나 전향 성적이 아니다. 실제 실행용 비교기는 계속 현재 저장 가격과 적격 snapshot만 소비한다. 기존 pre-Merge 공급 회계 검사는 실제 runtime이 쓰는 별도 회계·시대 helper로 보존하되, 그 시대 full 모형의 준비 완료를 주장하지 않는다.

## 7. 검토 묶음의 실제 바이트 연결

외부 검토 validator는 source-book 전체 해시 외에도 내부 SOURCE_COMMIT/TREE, 모든 파일 프레임·경로·kind·원문/전달 byte 수·SHA-256·Git blob SHA-1·UTF-8/base64·조각별 해시를 대조한다. 인용 원문은 따로 전달된 manifest만 믿지 않고 실제 book에서 복원한 본문과 일치해야 한다. 원본 book을 보존한 채 manifest와 보고서 커밋·인용을 함께 바꾸는 경우도 거부한다. 파일 경로 제어문자와 남는/누락된 프레임도 거부한다.

dynamic import에서 토큰과 괄호 사이의 block/line comment 및 JavaScript 줄 구분자를 처리한다. 실제 fixture에서 주석 뒤의 literal dependency를 포함하고, 계산된 import는 SOURCE_MISSING으로 남긴다. 테스트 내 비실행 예시는 정확한 offset·원문에 묶인 선언을 유지한다.

이 검증은 구조·바이트 일관성 검사다. Git tree의 외부 진위, 실제 Gemini 실행, 실제 소스 전달 또는 릴리스 권한을 인증하지 않는다. actualModelExecutionAuthenticated=false와 releaseAuthorized=false는 계속 유지한다. 후속 검토 논제는 CI가 끝난 소스 커밋과 패킷을 먼저 고정한 뒤 별도 보고서로 기록한다. 보존된 d510163 논제를 새 head에 대한 완료된 검토로 취급하지 않는다.


## 8. 112892a 변경분의 실제 후속 실행과 소스 동결

2026-10-26에 기간별 예측 누락·프로토콜 시대 입력·검토 source-book 결합을 수정한 source112892aa634ea8ec0d31d9bf60ad902f2b3fd600의 실제 실행을 완료했다. [112892a 변경분 논제](reviews/ETH_CHATGPT_DELTA_THESIS_20261026.md)와 [CI·수집·원장 영수증](eth-candidate-evidence/20261026-delta-ci.json)에 정확한 근거를 보존한다. 아래 보고서를 저장한 후속 문서 커밋과 검토 대상 소스는 구분한다.

- 일반 CI40328955938: main 자동 갱신5b9246a와 결합한 합성 merge9426273에서 주 테스트1,321 pass 및 수치 assertion318,010. 직접 PR tree의 실행으로 소급하지 않는다.
- 직접 head evidence40328955886: 집중188 pass, Chromium21경우 pass. 물리 모바일·Safari 검증은 아니다.
- ETH 재추정의 유효 원점을 복원하자 30일/90일 flat 대비 개선율은 각각 -80.30%/-64.12%로 악화됐다. 180일은 +30.14%지만 비중첩 표본4개다. [새 비교 수치](eth-candidate-evidence/20261026-delta-comparison.json)를 사용하며 이전 표를 최신 성과로 인용하지 않는다.
- 실제 수집 적격 경제 snapshot0, 원장 new0/reused9/정확 재생9, pending27/scored0 유지.
- 동결 패킷은 38,522,626bytes, SHA-256a2924fb225c27c88c3c3350121e7ab6af91a8cba586280e0b77f42263118601d, 205seeds/234entries/215parts/unresolved0다. [manifest](eth-candidate-evidence/20261026-delta-review-source-manifest.json)에 연결했다.
- 별도 main 자동 자료 갱신5b9246a가 운영 배포된 사실은 보존한다. 이번 PR#39의 후보를 병합·배포한 것은 아니다.
- 실제 Gemini 반대 검토와 ChatGPT 역검토는 미완료이며 releaseAuthorized=false다.

## 9. 후속 구현: 인과적 결측 처리와 불변 결과 평가

최종 archive의 마지막 결측을 기준으로 과거 입력 전체를 잘라내던 경로를 수정한다. 최초 731개 연속 ETH 관측이 완성된 시점으로 원점 격자를 고정하고, 각 원점 안의 과거 prefix에서만 ETH/BTC 연속성을 판단한다. 뒤의 결측으로 이미 유효했던 과거 예측을 지우지 않는다. 만기 후 종가 누락과 미래 pending은 별도로 집계한다.

[독립 결과 원장](ASSET_OUTCOME_LEDGER.md)은 새 예측 발행·최신성·금융 모형 실행의 성공과 별도로 기존 발행본을 평가한다. 원문 관측과 수집 시각, 평가 cutoff·함수 소스·결과를 내용 주소 파일로 보존하고, 가격 정정은 새 판본으로 추가한다. 현재 실제 미도래 목표의 점수를 만들어 넣지 않는다.

추가로 [보존된 CADLabs gas archive](../research-data/eth-economic-captures/20261026T134306Z-cadlabs-gas/receipt.json)는 2015-07-30~2021-07-19의 실제 원문2,182행과 출처·라이선스·이번 수집시각을 보존한다. 마지막28일의 gas 합은2,583,387,772,249다. pre-Capella 역사 부분 입력이므로 현재 full 경제모형의 적격 표본 증가로 계산하지 않는다.

Coin Metrics의 완전한 pre-Dencun 요청 창에는 FeeTotNtv를 executionFeesEth와 조건부로 대응할 수 있다. 활성일을 포함한 창에서는 별도 blob 수수료가 없으면 대응하지 않는다. 나머지 필드를 0으로 채우거나 full snapshot을 만들지 않는다.

이 절은 구현 설명이다. 실제 검사 결과와 정확한 소스 commit·tree·artifact·review packet 신원은 후속 완료 영수증으로 구분한다. 기본 모델 승격·main 병합·공개 배포·실제 외부 검토 완료를 승인하지 않는다.

## 10. 화면 높이·표시명과 독립 결과 원장 후속 보완

- 자산 비교표의 상위 영역은 이미 전체 높이를 사용했다. 본문 18개 행의 최소 높이만 고정되어 남던 공간을 실제 표 viewport 높이와 header 높이에서 계산해 배분한다. ResizeObserver는 viewport/header만 관찰하고 모델·행 DOM을 재생성하지 않는다. 작은 화면에서는 셀·터치 최소 높이와 내부 세로 스크롤을 유지한다.
- BTC 표시명은 원자료 원문을 바꾸지 않고 현재 비교표·재계산 이력의 공통 표시 함수에서 비트코인으로 변환한다. 실제 과거 저장 판본의 이름·hash는 보존한다.
- 독립 결과 원장 수집은 가장 최근 동일 판본이 연속될 때만 재사용한다. A→B→A 복귀는 새로운 수집 시각을 가진 판본이며, 쓰기 전 모든 색인 경로·직렬화 값·snapshot 참조를 검증한다. 독립 평가 step은 경제 수집과 현재 모형 비교보다 먼저 실행한다.
- BTC 기준일 종가가 없더라도 기존 엄격한 가격·날짜·중복 검증을 유지하면서 유효한 과거 원점은 보존한다. 현재 BTC 의존 후보와 해당 ETH/BTC 실제값만 사용 불가로 남는다.
- 0c1ed40의 실제 Actions: 일반 40334143803 주 테스트 1,336개, evidence 40334143939 집중 203개/브라우저 21개 통과. 이 결과는 해당 커밋에 한정한다. 후속 화면 변경에는 기존 21개와 별도의 1620×1008, 1920×1440, 900×430 터치, 320×568 터치 및 같은 페이지 높이 변경 검사를 추가했다. 후속 실행 결과는 별도 영수증으로 확인한다.
- 0c1ed40 실행의 실제 관측 snapshot 3개·평가 2개·수집 receipt를 research-data/asset-outcome-ledger에 원래 bytes로 보존한다. 원 발행 9개와 목표 pending 27개/scored 0개는 그대로다.
- 사용자가 Hallmark 전체 프로젝트 적용을 추가 요청했다. 고정 upstream 7ec868225c6caa040558c321ee0fefa0e73f83a8의 app 범위를 사용하며, 전 화면의 디자인·기능 보존 검증은 별도 진행한다. Hallmark 결과는 실제 Gemini 반대 검토 또는 모델 채택 승인으로 계산하지 않는다.

## 11. Hallmark 전체 앱 적용과 실제 후속 검증

검증 대상 응용 소스는 `df0bc769b3cb9a65654c2874673e04612c8880df`다. 이 절·영수증을 저장한 후속 문서 커밋과 구분한다. [전체 적용 보고서](HALLMARK_APP_ADOPTION.md)와 [원본 진단·실행·화면 증거](hallmark-evidence/20261026/README.md)에 연결했다.

일반 CI [40355131708](https://github.com/twoimo/bitcoin-cycle-atlas/actions/runs/40355131708)는 main `5b9246a`와 PR head의 합성 merge `e8b2ead`에서 주 테스트 1,350개·수치 assertion 318,010개·negative control 16개를 통과했다. 일반 CI의 tree를 직접 PR tree와 같다고 주장하지 않는다. 직접 head evidence [40355131704](https://github.com/twoimo/bitcoin-cycle-atlas/actions/runs/40355131704)는 집중 208개와 Chromium 34사례, runtime/resource error 0/0을 기록했다.

비교표는 1620×1008/1920×1440에서 18행·BTC 첫 행·비트코인 표시와 하단 0.25px 차이를 유지한다. 비교 SVG는 같은 문서의 폭 변경 후 배율 1·최소 실제 글씨 11px다. 차트 지표 목록의 뒤 비침, ETH 범례 충돌, 모바일 연구 본문 높이, 명령창·빈 측정 목록·키보드 포커스와 실제 기기 미리보기 끝 이동을 보완했다.

Hallmark [40355131740](https://github.com/twoimo/bitcoin-cycle-atlas/actions/runs/40355131740)는 24 CSS/2 HTML, 실제 8경로의 전후 80장을 완료했다. source integrity는 PASS/0오류이며 원문 디자인 게이트는 **정적 2 FAIL/0 REFLEX + render 4 FAIL/3 REFLEX**, 총 6 FAIL/3 REFLEX로 실패 상태다. 실제 영역·숨겨진 sticky DOM·학술 출처 줄바꿈의 맥락을 기록하되 규칙·severity·Floor를 완화하지 않는다.

동결 source-book은 216 seeds/257 entries/235 parts, 42,287,137bytes, SHA-256 `ef89040facfecbea04741a9faea87b27690efd210d2b95550ed71864fd21dbfe`, unresolved 0이다. 원문 검토 묶음 생성과 외부 모델의 실제 실행을 구분한다.

같은 실행에서 경제 입력 계약 적격 0/25, 완전한 적격 경제 snapshot 0을 확인한다. 기존 자산 연구 발행본 9개와 목표 27개 pending/0개 scored를 유지한다. 보존 발행본의 재생과 관측·결과 원장의 별도 평가는 모델 성과나 실제 운영 채택을 대신하지 않는다.

실제 Gemini 소스 반대 검토 및 그 보고서의 ChatGPT 역검토는 여전히 미완료다. 디자인 검토를 수행한 독립 에이전트는 같은 모델이며 이 조건을 충족하지 않는다. 90·180일 경제 학습의 구조적 표본 한계, 실제 LST 유동성과 과거 판본, 장기 운영 검증도 그대로 남는다. main 병합·기본 모형 승격·공개 배포를 하지 않았으며 `releaseAuthorized=false`를 유지한다.


## 12. 가격 판본의 순서 독립성과 검토 묶음 용량 보완

최종 검증 소스는 `fb2cec889c409a40ced3760c415b0b3cccdd6165`다. [후속 보고서](reviews/PRICE_VINTAGE_ORDER_FIX_20261027.md)와 [실행·manifest·브라우저·원문 진단](eth-candidate-evidence/20261027-price-vintages/README.md)에 정확한 출처를 보존한다.

같은 날짜·수집 시각의 가격/원문 hash 충돌을 현재 선택된 최신 판본에 대해서만 비교하던 오류를 수정했다. 더 최신 판본이 앞에 있더라도 이미 cutoff에 들어온 이전 동시각 충돌을 거부한다. 미래의 서로 다른 판본 제외, 불변 vintage ID의 변경 거부, 정상 최신값·동률 선택은 유지한다.

테스트만 먼저 추가한 `78ad471`의 실제 직접 실행은**213개 중 211 pass / 2 fail**로 결함을 재현했다. 수정 후 최종 일반 CI [40367613955](https://github.com/twoimo/bitcoin-cycle-atlas/actions/runs/40367613955)는 합성 merge `2e2f261`에서 **1,356/1,356**, 수치 assertion **318,010**, negative control **16/16**을 통과했다. 직접 head evidence [40367613761](https://github.com/twoimo/bitcoin-cycle-atlas/actions/runs/40367613761)은 집중 **214/214**, native **34/34**, **161 PNG**, runtime/resource error **0/0**을 기록했다. 비교표 18행·BTC 첫 행·비트코인과 큰 화면 하단 0.25px 차이도 유지한다.

검증 함수의 소스 hash 변경으로 별도 연구 발행기가 새 소스 개정본 9개를 생성한다. 기존 9개 기록과 3개 snapshot을 평가하는 독립 결과 원장은**27 pending / 0 scored** 및 forecastRecordsChanged=false다. 별도 artifact는 이전 9개와 새 9개를 함께 보존해 **18 records / 6 snapshots**, **54 pending / 0 scored**이며, 두 번째 실행은**new 0 / reused 9**다. 같은 세 자산 원점의 개정본 증가를 독립 관측 또는 실제 성과 증가로 계산하지 않는다. 현재 사이트 원장 파일은 기존 9개를 유지한다.

전체 검토 묶음의 실제 크기는 **50,489,326 bytes**로 이전 50MB 상한을 넘었다. 전체 원문/이전 기록/새 개정본을 유지하고 명시적 60MB 한도와 실제 바이트 진단을 추가했다. 정확한 한도 성공·1바이트 초과 거부·UTF-8 조각 완전 재결합을 검사했다. 새 packet은 **216 seeds / 269 entries / 281 parts**, unresolved **0**, SHA-256 `836755535bc9561782926b05c648c052d5f57c44feed1e635578071a5500a43e`다. 원장 재실행과 artifact 전체 보존을 유지하며 로그의 전체 파일 중복 출력만 줄였다.

최종 Hallmark 첫 시도는 Chrome 시작 timeout으로 미완료였고, 같은 source 작업 재시도는 전체 8경로·전후 80 PNG 및 integrity PASS를 완료했다. 원문 디자인 gate는 기존 **6 FAIL / 3 REFLEX**, waiver/dismissal **0/0**으로 계속 실패 상태다.

경제 정의 적격 **0/25**·완전한 적격 경제 snapshot **0**, 실제 Gemini 반대 검토·ChatGPT 역검토·성숙한 전향 성과 조건은 남아 있다. 이번 소스 검토는 같은 모델의 분리 검토다. PR은 Draft이며 main 병합·기본값 승격·공개 배포 없이 releaseAuthorized=false를 유지한다.

## 13. ETH 자체 기간·변동성 모형 재설계

[2026-10-27 리서치와 수학 명세](ETH_REMODELING_RESEARCH_20261027.md)에 기관 주장·논문·프로토콜 원문과 사실 정정을 연결한다. 새 연구 모드는 확인 시점 기반 상태 지속기간과 시간가변 변동성을 추정한다. 3년 상승·1년 하락을 고정하거나 기관 목표가격을 새 중앙선에 강제하지 않는다. 기존 ETH/BMNR 공통 외부 평가 조건과 보존된 발행본은 별도 모드로 유지한다.

현재 기본 차트 선택 변경은 이 Draft 브랜치의 연구 화면에 한정된다. main 병합·공개 배포 또는 보정된 운영 예측으로의 승격은 아니다. CI와 수치·native 렌더 결과는 해당 실행 소스와 별도로 보존한다. 0/25 경제 입력을 채워 넣거나 새로운 모형을 과거 발행 성과로 소급하지 않는다.
