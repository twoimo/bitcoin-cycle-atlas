# 가격 판본의 동시 수집 충돌: 순서 의존성 수정

기록일: **2026-10-27 (한국 시간)**. 실행 로그의 원래 UTC 시각은 실행 영수증에 보존한다.

최종 검증 소스는 `fb2cec889c409a40ced3760c415b0b3cccdd6165`다. 가격 판본 함수 수정은 `096136c`에서 이루어졌고, 후속 검증 자료 용량·로그 보완이 이 소스에 포함된다. 실행 결과를 저장한 후속 문서 커밋과 구분한다. PR #39에서 기존 Hallmark·전체 높이·비트코인 표시를 유지하면서, 남은 조건 감사가 발견한 실제 결과 원장의 정보 시각 결함을 수정했다.

## 발견한 문제와 영향

`selectPriceVintages`는 같은 관측일의 동시 수집 판본이 충돌하는지 현재 선택된 최신 판본에 대해서만 확인했다. 다음 합성 예시처럼 A/B가 충돌하고 C가 더 늦으면, 입력 순서에 따라 같은 자료가 거부되거나 받아들여질 수 있었다.

| 판본 | 수집 시각 | 가격 | 원문 hash |
| --- | --- | ---: | --- |
| A | T1 | 2,000 | A |
| B | T1 | 2,100 | B |
| C | T2 > T1 | 2,300 | C |

cutoff가 T2 이후일 때 A→B→C는 충돌을 발견하지만 C→A→B는 C가 최신 선택으로 남아 A/B를 서로 비교하지 않는다. 실제 관측을 나타내는 표가 아니라 결함을 설명하는 합성 입력이다.

[독립 결과 원장](../ASSET_OUTCOME_LEDGER.md)은 전달된 snapshot 순서로 처음 평가하고, 보존할 snapshot ID는 정렬한다. 원래의 순서 의존성은 처음 계산과 정렬된 원장을 통한 재생의 수락 여부까지 다르게 만들 수 있었다. 현재 보존 자료가 이 충돌을 실제로 포함했다는 주장은 하지 않는다.

## 적용한 수정

기존 불변 판본 검사와 최신값 선택 사이에 **평가 시각까지 수집한 날짜·시각별 충돌 검사**를 추가했다.

- 같은 날짜·정규화한 수집 시각의 가격 또는 원문 hash가 다르면, 더 최신 판본이 있어도 거부한다.
- 서로 다른 미래 판본은 cutoff 이전 평가에서 제외한다. 수집 시각과 정확히 같아지는 순간부터 충돌 검사를 적용한다.
- 같은 불변 vintage ID의 값·영수증 변경은 기존대로 cutoff와 관계없이 거부한다.
- 동시각의 가격·hash가 같은 판본은 기존 결정적 ID 선택을 유지한다. 다른 관측일은 독립적으로 처리한다.
- 최신값 선택, 정규화한 반환 형식, 미래 판본 수와 입력 객체를 유지한다. 추가 자료구조는 기존 최대 100,000개 관측 범위 안의 선형 map이다.

유효한 자료의 해석이나 형식을 바꾸지 않는 기존 계약의 오류 수정이다. 버전·금융 가격식·필요 표본 수는 바꾸지 않았다. 평가 결과는 실행한 함수의 commit과 파일 hash를 따로 보존하므로 새 함수 신원과 과거 결과를 구분한다.

## 실제 실패 재현과 회귀 범위

먼저 테스트만 추가한 `78ad471652f276358e0dea2b6616d6e551c8423b`를 실행했다. [수정 전 직접 head 실행](https://github.com/twoimo/bitcoin-cycle-atlas/actions/runs/40365652506)은 **213개 중 211 pass / 2 fail**, skip/cancel 0을 기록했다.

실패한 두 항목은 가격 선택 함수의 예외 누락과 결과 원장 평가의 거부 누락이다. 오류 원문은 각각 `Missing expected exception`, `Missing expected rejection`이며 실제 job 로그에서 추출해 [실행 영수증](../eth-candidate-evidence/20261027-price-vintages/execution.json)에 보존한다. 이 실패 실행의 뒤쪽 수집·브라우저 단계는 실행되지 않았으며, 전체 증거 artifact가 없다는 후속 업로드 실패를 별도로 구분한다.

새 회귀 그룹은 5개다. 세 판본의 여섯 입력 순서, 가격만 다른 경우·hash만 다른 경우, ETHUSD/BMNR/MSTR 선택, 동일 UTC 시각의 다른 표기, cutoff 직전/정확한 시각, 중복 미래 판본 집계, 같은 가격/hash의 결정적 선택, 다른 관측일 분리와 입력 불변성을 검사한다. 결과 원장은 ETH/BMNR 합성 snapshot을 실제 생성·검증 API로 만들고 cutoff 이전의 동일 평가와 정렬된 원장 재생까지 확인한다. 합성 미래 관측은 실제 시장 자료나 전향 성과로 세지 않는다.

수정 전의 실패 그룹은 첫 잘못된 순서에서 종료한다. 수정 후 통과 실행이 전체 조합을 완료한다.

## 후속 검증 자료의 용량 보완

첫 함수 수정 `096136c`는 일반 CI의 1,355개 검사와 후보 workflow의 집중 검사·원장 재생·브라우저 단계를 통과했지만, 마지막 소스 묶음 생성 단계에서 실패했다. [그 실행](https://github.com/twoimo/bitcoin-cycle-atlas/actions/runs/40365812434)은 실패로 남긴다. 전체 로그는 GitHub 연동의 transport 오류로 읽을 수 없었으므로, 당시 예외 문구를 관찰했다고 주장하지 않는다. 단계별 실제 상태와 보존 artifact 신원은 실행 영수증에 기록했다.

가격 검증 함수도 실제 모형의 전체 의존성 신원에 포함된다. 따라서 이 수정은 모형 소스 hash를 바꾸며, 발행기는 과거 기록을 유지한 채 새 소스에 연결된 개정본을 만든다. 원장 신원을 고정하거나 새 기록을 누락해 자료 크기를 줄이지 않는다.

후속 보완은 검토 묶음의 유한 상한을 **50,000,000 → 60,000,000 bytes**로 조정했다. 모든 원문·이전 발행본·새 개정본·실행 자료와 **180,000-byte 조각 크기**를 유지한다. builder는 전체 프레임의 실제 Buffer 바이트를 합산해 결합 전에 검사하고, 초과하면 실제 bytes·허용량·entry 수를 담은 `REVIEW_BUNDLE_TOO_LARGE`로 실패한다. 성공 manifest에도 허용량을 남긴다.

추가 회귀는 한국어·emoji가 있는 실제 원문 묶음을 생성하고, 정확한 전체 크기의 한도에서 동일 hash·완전한 조각 재결합이 유지되는지 검사한다. 한도가 1바이트 작으면 거부하며 부분 source-manifest를 만들지 않는다. NaN·Infinity·분수·너무 작은 한도도 거부한다. 기존 검토 manifest 형식과 실제 외부 검토 요구는 유지한다.

두 번째 원장 발행 실행은 계속 수행한다. CI 로그에는 요약 영수증을 남기고 전체 원장을 다시 출력하는 `--emit-files` 옵션만 이 workflow에서 제외했다. 전체 JSON은 같은 artifact 경로에 보존되고 CLI의 원문 내보내기 기능, 네이티브 34사례·전체 PNG 수집은 유지한다.

## 최종 실제 검증

| 실행 | checkout과 결과 |
| --- | --- |
| [일반 CI 40367613955](https://github.com/twoimo/bitcoin-cycle-atlas/actions/runs/40367613955) | main `5b9246a` + PR `fb2cec8`의 합성 merge `2e2f261`; **1,356/1,356 pass**, fail/skip/cancel 0; 수치 assertion **318,010**, negative control **16/16** 거부 |
| [직접 head evidence 40367613761](https://github.com/twoimo/bitcoin-cycle-atlas/actions/runs/40367613761) | 직접 `fb2cec889c409a40ced3760c415b0b3cccdd6165`; 집중 **214/214**, Chromium **34/34**, runtime/resource error **0/0**; 소스 묶음 생성까지 성공 |

일반 CI의 tree `beacd9d63db9267e99269fa063ee267273166849`와 직접 PR tree `95ad3f21f34e4e225aac2ec4bfb9240da218cdbc`는 다르다. 합성 merge 성공을 직접 PR tree 실행으로 표현하지 않는다.

브라우저 실행은 실제 **161개 PNG**를 생성했다. 1620×1008 및 1920×1440 비교표의 18행·BTC 첫 행·**비트코인** 표시와 하단 **0.25px** 차이를 확인했다. 기존 한 줄 도구막대·모바일·동일 문서 리사이즈·키보드/창 상태 34사례가 유지된다. 이번 변경에서 새 독립 시각적 ship 판정이나 물리 Safari 검증을 주장하지 않는다.

검토 묶음은 실제 **50,489,326 bytes**, 허용 **60,000,000 bytes**, **216 seeds / 269 entries / 281 parts**, 미해결 import **0**이다. SHA-256은 `836755535bc9561782926b05c648c052d5f57c44feed1e635578071a5500a43e`다. 현재 묶음이 이전 50,000,000-byte 상한을 **489,326 bytes** 초과함을 실제로 확인했다. 이는 용량 진단을 뒷받침하며, 읽지 못한 이전 실행의 예외 원문과 구분한다.

전체 source-book·실행 JSON·PNG·이전/새 발행본의 [Actions artifact](https://github.com/twoimo/bitcoin-cycle-atlas/actions/runs/40367613761/artifacts/12671627211)는 **43,982,947 bytes**, SHA-256 `sha256:9d787edcde68a16074af814b9032cbc8388b77f18e5e272314f71cd2660f0ba4`다. 보관 만료 예정은 **2026-11-25T17:25:00Z**이며 핵심 실행·manifest·브라우저 영수증은 이 저장소에도 보존한다.

## 기존 원장과 이번 연구 산출물

| 범위 | 실제 결과 |
| --- | --- |
| 저장소에 이미 보존된 원장에 대한 독립 평가 | 기존 **9 records / 3 snapshots**, 관측 snapshot **3**, 목표 **27 pending / 0 scored**; forecastRecordsChanged=false |
| 새 소스의 첫 연구 발행 실행 | 새 개정본 **9**, 이전 기록과 합쳐 **18 records / 6 snapshots**; **54 pending / 0 scored** |
| 같은 입력·소스의 두 번째 실행 | 추가 **0**, 재사용 **9**, 새 소스로 재생 **9**, 이전 소스로 보존·검증 **9** |

18개는 서로 다른 18개 관측 원점이 아니다. ETHUSD 2026-10-25, BMNR/MSTR 2026-10-23의 같은 세 자산 원점에 대해 조건별 이전/새 소스 발행본을 보존한 것이다. 기록·타깃 수 증가를 실제 성과 증가로 세지 않는다. 새 개정본은 검증 artifact에 있으며 현재 사이트의 원장 파일은 여전히 기존 9개다. 경제 원문 수집은 성공했지만 정의 적격 **0/25**, 완전한 적격 경제 snapshot **0**을 유지한다.

## Hallmark의 같은 소스 재검증

최종 [Hallmark 실행 40367613673](https://github.com/twoimo/bitcoin-cycle-atlas/actions/runs/40367613673)의 첫 시도는 Chrome WS endpoint 시작이 30초를 넘어 **미완료 / integrity fail / exit 2**였다. source `fb2cec8`의 해당 작업만 한 번 재실행했다. 첫 실패를 통과로 바꾸거나 지우지 않는다.

두 번째 시도(job `121731481313`)는 **정적 26파일, 실제 8경로의 전후 80 PNG**, 원본·작업 전후 소스 무결성 **PASS / 0오류**를 기록했다. 정적 **2 FAIL / 0 REFLEX**, render **4 FAIL / 3 REFLEX**, 합계 **6 FAIL / 3 REFLEX**로 원본 디자인 gate는 계속 **exit 1**이다. waiver/dismissal은 **0/0**이다. [원문 진단](../eth-candidate-evidence/20261027-price-vintages/hallmark-findings.json)을 그대로 보존한다.

완료된 Hallmark artifact는 ID `12671906154`, **10,433,653 bytes**, SHA-256 `sha256:5af6b95a77dcd3b86ae32411fec50a05c3734ba4c9fbd4dde7948f327399706e`다. 첫 시작 실패 artifact `12671047780`도 별도로 남아 있다.

## 보존과 남은 조건

응용 변경은 파일 하나(`dist/forecast-information-time.js`)다. 이를 검증하는 기존 테스트 두 파일과 계약 문서를 고쳤으며, 후속 검증 자료 보완에는 묶음 생성 스크립트 두 파일·workflow 한 파일·기존 묶음 테스트 한 파일이 포함된다. GitHub의 전후 비교로 기존 관측 원문·연구 발행본·관측/결과 원장·화면 HTML/CSS/렌더러에 변경이 없음을 확인했다.

원본 Hallmark의 6 FAIL/3 REFLEX는 기존 실제 컨트롤·독립 scroll owner·숨겨진 sticky DOM·긴 학술 출처 줄바꿈과 관련된 기록으로 남긴다. 이번 수정에서 원본 규칙이나 severity를 바꾸지 않았다. [기존 전체 앱 적용](../HALLMARK_APP_ADOPTION.md)의 검토 범위를 새 외부 모델 검토로 확대하지 않는다.

별도의 같은 모델 읽기 전용 검토는 새 회귀 그룹과 수정의 순서 독립성·cutoff 경계·불변 신원·선형 처리 범위를 확인했다. [검토 범위](../eth-candidate-evidence/20261027-price-vintages/independent-review.json)를 보존하며 실제 Gemini 실행으로 계산하지 않는다.

경제 계약의 적격 0/25, 완전한 적격 경제 snapshot 0, 실제 성숙 전향 결과 부족, 실제 Gemini 소스 반대 검토와 그 보고서의 ChatGPT 역검토는 계속 별도 조건이다. PR은 Draft이며 main 병합·기본 모형 승격·공개 배포를 하지 않았다. `productionAdopted=false`, `releaseAuthorized=false`를 유지한다.
