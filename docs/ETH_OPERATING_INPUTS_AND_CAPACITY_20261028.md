# ETH 운영 입력과 전향 수집 용량 후속 보고서 — 2026-10-28

> **검증한 구현 소스:** [`15b5f65158074d0e2d4e2d6ad0c64a345eed740d`](https://github.com/twoimo/bitcoin-cycle-atlas/commit/15b5f65158074d0e2d4e2d6ad0c64a345eed740d), tree `752b66423d2eafb92507e37b871f43a44262c631`  
> **실제 원격 검증:** [일반 CI 40549330339](https://github.com/twoimo/bitcoin-cycle-atlas/actions/runs/40549330339) **1,716/1,716**, [직접 소스 ETH evidence 40549330277](https://github.com/twoimo/bitcoin-cycle-atlas/actions/runs/40549330277) **583/583·Chromium 35/35·181 PNG**, [Hallmark 40549330481](https://github.com/twoimo/bitcoin-cycle-atlas/actions/runs/40549330481) **현재 0 FAIL / 0 REFLEX·integrity 오류 0**, 모두 성공. 일반 CI의 합성 merge checkout과 직접 소스 실행을 §9에서 구분한다.  
> **현재 상태:** 이번 수집·검증·증거 보존을 완료했다. 완전 경제 snapshot과 성숙한 전향 보정 사례는 여전히 0이며 [PR #39](https://github.com/twoimo/bitcoin-cycle-atlas/pull/39)는 Draft, `releaseAuthorized=false`다. 이 후속 보고서의 문서 커밋과 위 검증 대상 소스는 별도로 식별한다.

문서 날짜는 한국 시각의 작업일을 따른다. 아래 원문 수집·재생·측정 시각은 영수증의 UTC를 유지한다. 같은 원문을 나중에 다시 검증한 시각을 최초 수집 시각으로 바꾸지 않는다.

## 1. 이번에 진전된 부분과 현재 판단

이번 후속은 경제 모형의 빈 입력을 임의 값으로 채우지 않고, 실제 자료가 어느 조건을 충족하며 어디에서 막히는지 더 정확히 확인하는 작업이다. 전향 원장의 반복 검증을 줄였고, 최초 12개 비중첩 사례를 쌓는 데 필요한 달력과 현재 저장 한도를 계산했다. 발행기가 현재 커밋의 정확한 base를 읽도록 바꿨으며, 공급 집계의 UTC 경계 불일치를 조건부 수학 진단으로 만들었다. 별도로 처음 8개 validator를 고정한 상태 표본의 원문을 수집·보존하고 재생했다.

완전한 경제 snapshot은 계속 **0개**다. 이번에 수집한 validator 상태는 완전한 28일 스테이킹 수익 자료가 아니며, 공급 grid 진단은 공급 증감의 완전한 검산이 아니다. 원래 3개 전향 기록으로 만든 9개 보정 조합은 모두 준비 부족이고, 성숙한 보정 사례·freeze·보정 발행은 **0개**, 반경은 **null**이다. 아래 미래 날짜와 기록 수는 조건부 운영 계산이며 실제 발행·성숙 표본으로 세지 않는다.

Gemini 반대 검토와 후속 역검토는 기존 사용자 지시에 따라 **`omitted-by-user`**다. 이를 통과로 바꾸거나 다시 필요한 미완료 검토로 요구하지 않는다. 독립 에이전트의 코드 검토, 수치 검사, 브라우저 검사도 생략된 외부 검토의 실행으로 재해석하지 않는다. 연구 후보의 입력·전향 성과 조건과 별도의 릴리스 권한은 그대로 유지한다. 이전 조건과 역사적 실패·수정 과정은 [남은 조건 문서](ETH_REMAINING_CONDITIONS.md)와 [공급 경계 및 전향 보정 gate 보고서](ETH_BOUNDARIES_AND_PROSPECTIVE_GATE_20261028.md)를 함께 참조한다.

## 2. 원래 발행본과 모델 그래프의 보존

이번 구현은 그래프 밖 `scripts/`의 검증·수집·진단 경로에 놓였다. 기존 price-model 그래프와 원본 기록을 수정해 현재 입력에 맞추지 않는다. 원래 세 기록의 origin은 모두 `2026-10-26`이며, 원본 파일과 해당 raw base·tail·snapshot을 계속 사용한다.

| 모델 | 원래 실제 발행 시각, UTC | 원래 기록 ID | 원래 모델 그래프 |
|---|---|---|---|
| adaptive | 2026-10-27 07:44:13.396 | `563d087f19a5062981714ed6fee1f96dd5afe77a87a4c435979b000451189a9b` | 14개 파일, `cb316276ae79f90cd44d31d7ef4ad7d404c9ced4bb49d957bb4f6f94ed030491` |
| pooled | 2026-10-27 07:44:13.396 | `f1f0bf98496c1d6e9339ae9410a51c904571524d3ade88fc935cf6f58df3fed1` | 14개 파일, `cb316276ae79f90cd44d31d7ef4ad7d404c9ced4bb49d957bb4f6f94ed030491` |
| warm-start | 2026-10-27 09:57:51.931 | `d2659722c147909a9cbeeea4980c63b52f36f9c23c315cd2ef1e10984b8d5f72` | 17개 파일, `463085b24aa701b66a6e754c6b6437a157f2bc1cbc7fd1b2403a072b4b9d42ca` |

원래 모델을 각자의 보존 raw 입력으로 재실행한 로컬 검사와 최종 직접 소스 run 모두 세 모델의 **731점·출력 hash·기록 ID가 일치**함을 확인했다. 최종 [발행·재생 영수증](eth-candidate-evidence/20261028-operating-inputs/final-run/ethereum-prospective-ledger/receipt.json)은 **신규 기록 0·재사용 3**, 원래 발행 시각 유지와 9개 목표 pending·scored 0을 기록한다. 같은 완료 입력을 다시 받은 시각을 새 발행 시각으로 바꾸지 않았다.

이번 일괄 검증 변경은 예측식을 바꾸지 않는다. [원격 게시 영수증](eth-candidate-evidence/20261028-operating-inputs/remote-publication.json)은 예정된 26개 파일만 변경되고 삭제 0개, 기존 `dist` 713개 blob이 모두 유지됐음을 기록한다. 원본 식별자는 [prospective index](../research-data/ethereum-prospective-ledger/index.json)에서 확인할 수 있다.

## 3. 반복 검증을 줄이되 원문 검증은 생략하지 않음

### 3.1 내부 세션의 범위

[전향 보정 core](../scripts/ethereum-prospective-calibration-core.mjs)에 `createEthereumProspectiveCalibrationSession`과 `buildEthereumProspectiveCalibrationReadinessBatch`를 추가했다. [readiness CLI](../scripts/build-ethereum-prospective-calibration-readiness.mjs)는 동일한 실제 원장을 사용하는 여러 모델·기간 조합을 이 일괄 경로로 계산한다.

입력은 첫 비동기 중단 전에 복제·동결한다. 모든 기록과 연결 snapshot을 검증하고, 관측 원문을 검증·파싱한 결과를 모듈 내부에 보관한다. 호출자에게 돌려주는 것은 내부 `WeakMap`에 등록된 빈 동결 토큰이다. 직렬화된 객체, 동일 ID를 가진 다른 객체, 외부 `alreadyVerified`·캐시 플래그는 검증 근거가 될 수 없다.

조합별 cutoff와 exact binding은 계산마다 확인한다. 미래 관측의 배제, 해당 cutoff에서 사용할 vintage, 첫 발행본·origin 중복 제거, 첫 12개 비중첩 창 선택은 그대로 적용한다. 유효하지 않은 보존 관측은 진단에서 사라지지 않으며, 먼저 선택한 결측 창을 나중의 좋은 사례로 대체하지 않는다. source hash나 옵션이 다른 실험의 잔차를 가져오지 않는다.

기존 단일 readiness API는 호출할 때마다 새로 검증한다. freeze 생성과 freeze 검증 역시 원본 입력을 전부 재구성한다. 일괄 세션은 영구 증명서나 다음 run의 캐시가 아니며, 이후 바뀐 파일을 이전 토큰으로 인증하지 않는다.

### 3.2 원본 3개 기록·9개 조합의 전후 비교

비교 cutoff는 양쪽 모두 **`2026-10-27T16:05:58.086Z`**다. 같은 3개 기록과 3개 관측으로 3개 모델 × 30·90·180일을 계산했다. 9개 readiness 결과의 **전체 canonical JSON과 모든 ID가 완전히 동일**했다. 선택된 창, 입력 식별자, 준비 상태, 반경에도 차이가 없었다.

| 측정 항목 | 변경 전, 조합별 전체 검증 | 변경 후, 내부 세션 1회 + 9개 조합 |
|---|---:|---:|
| `crypto.subtle.digest` 호출 | 432 | 56 |
| 해시 함수에 전달된 바이트 | 164,085,108 | 18,255,396 |
| 같은 환경의 단일 실행 경과 시간 | 4,197.896302ms | 565.510930ms |
| 전체 canonical 결과·ID | 비교 기준 | 모두 동일 |
| 준비 완료 조합 / 새 freeze / 보정 발행 | 0 / 0 / 0 | 0 / 0 / 0 |

이 측정 범위는 **readiness 계산**이다. loader의 디스크 읽기·원문 검증과 모델의 731점 재실행은 이 시간에 포함하지 않았다. 동일 로컬 환경에서 한 번씩 측정한 값이며 CI 시간이나 장기 처리량을 보장하지 않는다. 변경 후 세션도 모든 입력을 한 번 소유하므로 장기 원장의 메모리·저장 한도를 해결한 것은 아니다.

당시 비교 자료는 [batch-before.json](eth-candidate-evidence/20261028-operating-inputs/batch-before.json), [batch-after.json](eth-candidate-evidence/20261028-operating-inputs/batch-after.json)으로 보존했고, 입력·결과·source hash·호출 수·바이트 수를 함께 기록했다. 비동기 중 입력 수정, 잘못된 입력의 뒤늦은 복구, 위조 토큰, cutoff 변경, 결과 수정에 의한 내부 오염, 변경된 디스크 파일 재사용을 반례로 검사했다. 최종 소스와 테스트 수의 결합은 [로컬 검증 영수증](eth-candidate-evidence/20261028-operating-inputs/local-verification.json)에 기록한다. 초기에 실행한 묶음의 숫자를 후속 수정까지 포함한 최종 결과로 합산하지 않는다.

## 4. 정확한 committed base 선택과 자동 갱신의 구분

기존 issuer의 고정 PIN은 실제 수집이 진행되어도 오래된 동일 base에 계속 붙는 구조였다. 새 [committed-base helper](../scripts/ethereum-prospective-base.mjs)는 현재 선택한 정확한 Git commit/tree의 `dist/data/eth-ohlc.json` blob을 읽고, 작업 파일의 bytes가 그 blob과 같은지 확인한다. regular-file 경로, 크기, UTF-8 손실 여부, Git blob hash, archive 파싱과 실제 수집·관측 시각도 검사한다.

기존 snapshot 생성기는 실제 bytes와 일치하는 `sourceCommit`·`gitBlobSha`를 받을 수 있으므로 모델 그래프 밖에서 이 검증을 수행할 수 있다. 추후 검토해서 커밋한 base 갱신본은 issuer의 코드 상수를 매번 고치지 않고 사용할 수 있다. 이전 snapshot과 원래 3개 기록은 원래 base·tail·clock·ID를 계속 갖는다.

**이 helper는 base를 새로 만들거나 매일 갱신하는 기능이 아니다.** 현재 파일이 Git에 있다고 해서 공급자의 역사적 공개 시각이나 canonical chain 진위가 자동 증명되는 것도 아니다. 향후 base 교체에는 실제 수집 raw tail과 기존 history의 검증된 병합, 원문·시각·변경 이력 보존, 정확한 bytes의 명시적 검토·커밋이 필요하다. 새 base를 쓰는 발행은 그 이후의 실제 수집·발행 시각으로 남겨야 한다.

최종 실제 issuer는 소스 `15b5f651…`의 tree에서 `dist/data/eth-ohlc.json` **895,609 bytes**를 읽어 Git blob `882c49f0263034426e4e3afe377cc60a17448b6c`, SHA-256 `69a726d87fcea635772a806ac6a00f43880a43d8c66bd88152045dffc209106f` 및 작업 파일의 일치를 확인했다. [baseSelection 영수증](eth-candidate-evidence/20261028-operating-inputs/final-run/ethereum-prospective-ledger/receipt.json)의 읽기 완료 시각은 **2026-10-27T17:22:01.448Z**다. archive의 원래 `retrievedAt=2026-10-26T06:48:37.260Z`와 구분하며, `automaticallyRefreshed=false`를 유지한다. 이는 순수 validator만 실행한 결과가 아니라 실제 Git reader를 통과한 최종 CLI의 근거다.

## 5. 최초 12개 창과 현재 저장 한도의 실제 관계

[capacity core](../scripts/ethereum-prospective-capacity-core.mjs)와 [capacity CLI](../scripts/analyze-ethereum-prospective-capacity.mjs)는 원문 검증 뒤 운영상 달력과 저장량만 계산한다. 숫자 한도를 늘리지 않고, 과거 발행을 만들지 않으며, hypothetical 창에 기록 ID·예측값·실현값·잔차를 부여하지 않는다. 누락된 과거 발행을 생성하지 않고, 최신 완료 UTC 원점과 마지막 실제 원점의 다음 날 중 늦은 날짜부터 조건부 계산한다.

### 5.1 실제 cutoff의 조건부 달력

아래는 최종 원격 run의 [capacity 보고서](eth-candidate-evidence/20261028-operating-inputs/final-run/ethereum-prospective-capacity.json), cutoff **`2026-10-27T17:22:07.910Z`**, ID `7ac340d71e0b24091e356d6d74322c5eb5fabf7f09e8734f6f8bdffe4e004433`의 결과다. 입력은 원래 **3개 기록·origin 1개·관측 4개**다. 관측은 10월 26일의 독립 outcome 1개와 10월 27일의 전향 acquisition 3개다. 이번 실행에서 새 raw acquisition을 보존했지만 같은 완료 가격 입력의 예측 기록은 기존 3개를 재사용했다. 완전한 과거 수집 빈도나 앞으로의 일정은 이 소수의 보존 자료로 증명하지 않는다.

앞선 [최종 로컬 capacity 보고서](eth-candidate-evidence/20261028-operating-inputs/local-final-capacity.json)는 cutoff `2026-10-27T17:18:52.287Z`의 관측 3개와 하루 1개·2개 시나리오를 그대로 보존한다. 아래 표는 이후 실제로 늘어난 관측을 반영한다. §3의 성능 전후 비교는 당시의 동일한 3개 관측으로 수행한 측정이므로 변경하지 않는다.

매일 같은 3개 exact experiment가 새 origin을 발행하고, 이후 필요한 관측을 정상 수집한다는 조건에서 다음 달력이 나온다. 최소 12개 창 조건은 그대로이며, 각 조합의 실제 창은 현재 1개·성숙 0개, 나머지 11개는 미래의 가상 달력이다.

| 예측 기간 | 12번째 창의 가장 이른 최종 관측 종료, UTC | 그때까지 매일 3개 발행 시 기록 수 | 신규 전향 관측 하루 1개 | 신규 전향 관측 하루 3개 |
|---|---|---:|---:|---:|
| 30일 | 2027-10-22 00:00 | 1,083 | 364 | 1,084 |
| 90일 | 2029-10-11 00:00 | 3,243 | 1,084 | 3,244 |
| 180일 | 2032-09-25 00:00 | 6,483 | 2,164 | 6,484 |

하루 3개는 최종 run까지 보존된 같은 날의 최대 전향 acquisition 수를 조건부로 반복한 시나리오다. 자동 운영 빈도라는 뜻이 아니다. 독립 outcome은 source bytes가 같을 때 기존 acquisition을 재사용할 수 있으므로 매일 별도 한 개가 생긴다고 가정하지 않았다. 실제 새 vintage, 같은 날의 추가 수집과 revision이 있으면 저장 한도를 더 빨리 소모한다.

이 날짜는 수익률 증명일·모형 승격일·기관 데이터 확보일이 아니다. 선택된 각 창의 정답·정확한 binding·원문과 시각이 필요하고, 동률의 첫 발행이나 결측은 원래 gate에서 계속 막힌다. 이후 실제 발행과 별도 시험도 필요하다.

### 5.2 어떤 한도가 먼저 작동하는가

| 현재 제약 | 실제 cutoff에서의 조건부 결과 | 의미 |
|---|---|---|
| 동일 base의 단일 tail 최대 290일 | 마지막 허용 요청일 2027-08-05, 첫 거절일 2027-08-06 | 현재 bytes를 그대로 두면 30일 × 12개 창보다 먼저 막힌다. 검토·커밋된 base 교체가 별도로 필요하다. |
| 최대 2,000 records | 추가 665개 완전한 3모델 origin일까지 허용, 첫 초과 origin 2028-08-22 | 90·180일의 최초 12개 창까지 매일 전부 누적하기 어렵다. |
| candidate index당 1MiB | 모든 기록을 하나의 retained seed index에 모을 경우 추가 549일, 기존 origin 포함 총 550일; 첫 초과 origin 2028-04-28 | 개별 index 한도다. 두 directory의 합계를 같은 hard limit이라고 주장하지 않는다. |
| 최대 500 observations, 신규 하루 1개 | 첫 초과 수집일 2028-03-07 | 추가 독립 vintage가 없다는 조건에서도 90·180일 달력 전에 막힌다. |
| 최대 500 observations, 신규 하루 3개 | 첫 초과 수집일 2027-04-11 | 같은 날 반복 수집의 보존 부하가 계속되면 30일 달력보다도 먼저 막힌다. |

현재 merged compact index는 1,971 bytes이고, 같은 세 모델의 하루 분량은 1,903 bytes씩 증가한다. 날짜·ID·현재 model-version 길이에 따른 metadata 크기만 계산했으며 미래 forecast 파일을 만들지 않았다. 더 긴 version, revision, 추가 whitespace는 더 이른 초과를 일으킬 수 있다. 개별 입력 bounds를 단순 증대하거나 과거 원장을 지우는 방법을 이번 해결책으로 채택하지 않았다.

### 5.3 자동 운영과 영구 보존은 아직 별도 조건

현재 workflow에서 직접 prospective issuer를 실행하는 경로는 PR 이벤트다. `refresh-data.yml`의 시장 자료 schedule과 ETH 후보의 실제 일일 발행을 혼동하지 않는다. ETH artifact의 `retention-days: 30`은 다운로드·다음 run 복원·검증된 seed append·영구 보존을 의미하지 않는다. 새 runner가 원래 seed로 시작하고 이전 artifact를 자동으로 이어 읽지 않는 문제는 계속 남는다.

capacity는 읽은 YAML의 직접 실행과 이벤트를 보고하며, 해석하지 못하는 형식은 미상으로 남긴다. 이 정적 점검만으로 모든 간접 명령이나 미래 서비스 동작을 증명하지 않는다. 실제 장기 운영에는 검토된 trigger, 누락·변조를 드러내는 이전 원장 전체의 복원과 append, 유한한 자원으로 전체 필수 증거를 보존하는 archive/streaming 설계가 필요하다.

## 6. 공급 자료: 960-slot grid의 조건부 UTC 경계 불일치

### 6.1 이전 원문의 로컬 재생과 실행 출처

새 [supply-resolution core](../scripts/ethereum-supply-resolution-core.mjs)는 기존 공급 회계 audit을 대체하지 않고 보존된 bucket/stock-label의 위치를 계산한다. [오프라인 진단 CLI](../scripts/analyze-ethereum-supply-resolution.mjs)는 원래 receipt의 URL·바이트 수·hash·HTTP 결과·완료 시각 순서와 원문을 결합해 읽는다. 실패한 수집이나 결측 stock은 0으로 바뀌지 않는다.

실제 로컬 direct-function 재생에 사용한 문서는 이전 성공 run **40536955797**, source **`47f2ae587ab5fdbe25b380c6a92bf496bd3d798e`**, artifact **12748673800**에서 온 `ethereum-supply-accounting/capture-HHIF8R/history-30d.raw.json`이다.

- 원래 수집 완료: `2026-10-27T16:05:21.417Z`
- 원문: **801,503 bytes**
- SHA-256: `21018bae4b5ceae9102940075737e1a6c85c2ab22803fa7b345c9c34e98afdfb`
- 실제 재생: `2026-10-27T16:43:36.833Z`, 추가 network 요청 **0**
- 재생 보고서 ID: `857556c315164cde9138e07ca2cb94c33df145a718869f1fa17f410c0a4b8954`
- 진단된 문서 **1**, 무효 source **0**, 같은 grid의 조건부 불일치 **1**

이는 새 CLI를 해당 원격 소스에서 실행했다는 증거가 아니다. 이 로컬 재생 영수증은 `cliGitProvenanceExecuted=false`를 유지한다. 원문 artifact의 출처는 [이전 최종 실행 영수증](eth-candidate-evidence/20261028-boundaries-prospective/evidence-40536955797.json)에 연결된다.

### 6.2 로컬에서 재생한 47f2 원문에서 확인한 관계

이 원문에는 225개 row가 있고 모두 960 slots, 즉 30 epochs 폭이다. bucket 시작은 `slot mod 960 = 160`, stock label과 끝은 `159`다. label의 epoch 내 위치는 `31`이지만, 요청 UTC 창의 선행·최종 stock slot은 epoch 내 위치 `14`다.

28일 UTC 창은 `2026-09-29`부터 `2026-10-26`까지다. 필요한 내부 slot은 `15,317,999…15,519,598`, 선행 stock slot은 `15,317,998`, 최종 stock slot은 `15,519,598`이다. 양쪽 stock row가 없으므로 값은 null이다. 내부 201,600 slots를 교차하는 row들이 있더라도 경계를 넘는 bucket 2개가 있어, 그 흐름을 비례 배분해 정확한 UTC 창의 흐름이라고 취급할 수 없다.

하루는 7,200 slots이며 `gcd(960, 7200) = 480`이다. 관측된 label residue를 유지하는 grid와 매일 같은 UTC 경계가 만나는 합동식은 이 표본의 residue 차이에서 해가 없다. **같은 폭과 label residue가 유지된다는 조건에서는**, 같은 endpoint를 더 오래 반복 수집해도 정확한 UTC 선행·종료 stock label을 얻을 수 없다는 뜻이다.

미래 API가 다른 해상도나 grid origin을 제공할 가능성을 이 유한한 표본으로 부정하지 않는다. grid가 호환되더라도 실제 boundary stock, 정확한 공급 증감 항목, canonical state와 독립 검산이 별도로 필요하다. `modelInputActivated=false`, `fullModelSnapshotReady=false`, `eligibleModelSnapshotCount=0`을 유지한다.

### 6.3 live·24h 접근 시도와 보존 범위

더 짧은 범위의 공개 endpoint를 확인한 기존 조사에서는 다음 두 요청이 각각 HTTP 403으로 끝났다.

| 원래 요청 URL | 요청 시각, UTC | 기록된 결과 |
|---|---|---|
| `https://ethsupply.fyi/api/history?range=live` | 2026-10-27T16:33:16.261654+00:00 | `HTTP Error 403: Forbidden` |
| `https://ethsupply.fyi/api/history?range=24h` | 2026-10-27T16:33:16.385690+00:00 | `HTTP Error 403: Forbidden` |

이들은 당시 bounded Python GET probe 기록이다. 재시도·우회·성공 수집으로 바꾸지 않았고, 요청 시각과 오류만 남아 있다. 오류 응답 body·header를 보존했다거나 provider의 거절 원인을 확정했다고 주장하지 않는다. 403은 그 시도의 접근 결과이며 서비스의 영구 기능 부재를 증명하지 않는다. 이번 문서 작성에서는 새 live 요청을 하지 않았다.

### 6.4 최종 직접 소스 CLI의 실제 2개 acquisition 진단

최종 소스 `15b5f651…`에서 실제 [supply-resolution 보고서](eth-candidate-evidence/20261028-operating-inputs/final-run/ethereum-supply-resolution.json)를 생성했다. cutoff는 **2026-10-27T17:21:35.032Z**, 보고서 ID는 `c96f60e868205d7fc8942e3c328277f94e35bbf4b3f477186cfb8ca39ac9703b`다. **진단 2개·무효 source 0개·미확보 capture 0개·같은 grid의 조건부 UTC 불일치 2개**이며, 이 진단 자체의 network 요청은 0이다.

| 원문 acquisition | 원래 수집 완료, UTC | Bytes | 관측한 start / label residue, mod 960 |
|---|---|---:|---|
| 이번 run의 `capture-363LHQ` | 2026-10-27T17:21:34.955Z | 801,485 | 576 / 575 |
| 보존된 이전 `capture-0kqcvW` | 2026-10-27T14:13:14.608Z | 801,491 | 576 / 575 |

이번 801,485-byte 원문의 SHA-256은 `98ecac0bffe923ea0bd952a080654d0b640a57deaae737995c41a860f796ba10`이다. 두 원문은 각각 225개·960-slot row이며, epoch 내 label 위치는 31, 필요한 UTC stock 위치는 14다. 경계 stock은 모두 null이고 정확한 전체-row UTC 흐름도 준비되지 않았다. §6.1의 **801,503-byte 원문과 residue 160/159**는 별도의 이전 acquisition에 대한 로컬 근거다. 최종 두 원문에 그 grid origin이나 수집 시각을 옮겨 적지 않는다.

세 원문을 재생·보존한 것은 서로 다른 수집 증거를 확보한 사실이다. 이것으로 독립 경제 학습 표본이나 완전한 공급 입력이 생긴 것은 아니며, `fullModelSnapshotReady=false`를 유지한다.

## 7. 고정 8-validator 상태 표본에서 실제로 얻은 것

### 7.1 선택과 원문 provenance

고정 코호트는 registry index **0…7**이다. 현재 잔액이나 상태를 보고 좋은 validator를 고르지 않았으며, 경제적 소유자가 확인된 투자자 집단이나 네트워크 대표 표본으로 주장하지 않는다. cohort ID는 `ethereum-mainnet-validator-indices-0-through-7-v1`이다.

실제 최초 수집은 **새 collector CLI를 만들기 전의 bounded Python urllib GET 3개**다. 먼저 finalized header를 받았고, 이후 genesis와 그 header의 state root에 대한 같은 8개 validator를 받았다. 각 원문은 262,144-byte 보존 한도보다 작고 완전한 JSON이었다. 나중에 SHA-256과 clock을 확인해 core로 재생했으며 재생 중 network 요청은 0이다. 이를 새 CLI가 과거에 이미 실행된 것으로 소급 기재하지 않는다.

| 원문 | 실제 byte 수 | 실제 수집 완료 시각, UTC | SHA-256 |
|---|---:|---|---|
| finalized header | 672 | 2026-10-27T16:34:47.106423+00:00 | `91ec31ea50696a631725388144a3f03118cc95b3260f517281cbc75c6fb3b9f0` |
| mainnet genesis | 170 | 2026-10-27T16:35:14.291423+00:00 | `55ffb0cee289551f91ce003dcee739e310b65cbadf9421c3057b29d312eabd18` |
| state-root 고정 validators | 3,769 | 2026-10-27T16:35:14.788736+00:00 | `033ba6badfdf11733c882ba305875c6bf281b96e4adede33e384998e915fcff1` |

원래 probe와 최초 재생 기록은 [고정 코호트 원문 directory](../research-data/ethereum-staking-cohort/20261027-first-eight-validator-state/), [probe receipt](../research-data/ethereum-staking-cohort/20261027-first-eight-validator-state/probe-receipt.json), [추가 probe receipt](../research-data/ethereum-staking-cohort/20261027-first-eight-validator-state/probe-additional-receipt.json), [최초 replay receipt](../research-data/ethereum-staking-cohort/20261027-first-eight-validator-state/replay-receipt.json)에 보존한다. 최초 replay receipt의 `sourceFiles`는 **그 재생 당시의 소스 hash**다. 이후 transport·replay metadata 검증 코드가 수정되더라도 역사적 receipt를 새 hash로 덮어쓰지 않는다.

### 7.2 최초 probe에서 확인된 상태와 잔액

고정한 상태는 slot **15,524,480**, epoch **485,140**, 관측 시각 **2026-10-27T16:16:23.000Z**다.

- state root: `0x599ec75e7c18069511ef94f8d03fe63ee791e7ce0ee3725546f049cf0251fd57`
- block root: `0xedaf4dd12c774197f15344f335045f11aafde30f07766f8eb366f3728833d8aa`
- 반환 validator: **8개**, active **7개**, `withdrawal_done` **1개**

| index | 상태 | 실제 balance, ETH | effective balance, ETH |
|---:|---|---:|---:|
| 0 | active_ongoing | 34.251995807 | 34 |
| 1 | active_ongoing | 32.039159506 | 32 |
| 2 | active_ongoing | 32.039113972 | 32 |
| 3 | active_ongoing | 32.039094486 | 32 |
| 4 | active_ongoing | 32.039135833 | 32 |
| 5 | active_ongoing | 39.423114441 | 32 |
| 6 | active_ongoing | 40.367740489 | 40 |
| 7 | withdrawal_done | 0 | 0 |
| **합계** | **7 active / 8 반환** | **242.199354534** | **234** |

합계는 정수 gwei로 계산한 뒤 정확한 ETH 문자열로 표시했다. `7 × 32 ETH = 224 ETH`는 실제 effective balance 234 ETH와 다르다. index 0의 effective balance는 34 ETH이고 index 6은 40 ETH다. 실제 balance와 effective balance의 차이, 또는 `active 수 × 32`와의 차이를 보상 수익으로 해석하지 않는다. 한 시점 잔액은 시간가중 원금도 아니다. 자세한 값과 명시적 null은 [보존 observation](../research-data/ethereum-staking-cohort/20261027-first-eight-validator-state/replay-observation.json)에 있다.

header의 SSZ message root는 일치했다. 그러나 이것은 header 필드의 결합 확인이다. validator JSON의 state membership Merkle proof, BLS 서명 검증, 독립 finality 검증을 수행했다는 뜻이 아니다. `canonical`·`finalized`는 provider의 주장으로 남고 `executionOptimistic=false`와 구분한다. `publishedAt=null`이며, 현재 상태를 과거 공개 vintage로 만들지 않는다.

### 7.3 완전한 28일 경제 입력에 아직 필요한 것

`earnedReturn`, `timeWeightedRewardEligiblePrincipal`, `completedExitWait`, `networkStakedEth`는 모두 null이다. 정의에 맞춰 활성화한 경제 metric과 eligible full snapshot은 0개다. 다음 자료가 동일한 경제적 코호트와 정확한 시간 창에 대해 필요하다.

1. 정확한 UTC 시작·종료 상태와 28일 전체의 관련 state transition.
2. 실제 consensus 보상·penalty와 deposit·withdrawal·코호트 경계를 넘는 consolidation 원금의 분리.
3. 실행 priority fee와 추가 MEV의 합산 시 builder payment 등의 중복 제거.
4. 같은 코호트의 실제 서비스 수수료·잔여 운영비와 시점에 맞는 환산.
5. 기간 전체의 시간가중 reward-eligible principal. 종료 시점 잔액이나 validator 수에 32 ETH를 곱한 값으로 대체하지 않음.
6. 실제 full-exit 요청 수리부터 execution 사용 가능 시점까지의 이력. `withdrawal_done` 상태 하나는 대기 기간을 제공하지 않음.
7. canonical state·membership·finality와 경제적 코호트 소유·범위를 확인할 증거.

새 [collector](../scripts/capture-ethereum-staking-cohort.mjs)는 genesis → finalized header → 해당 state root의 동일 8개 index라는 고정 3요청 경로, 유한한 시간·bytes 한도, 실패 원문·receipt 보존, 오프라인 재생을 구현한다. 실제 고정 정책, request·body byte 수, 요청별·전체 deadline과 EOF 완료 시각을 재생 때에도 대조한다. 원문만 맞추고 정책·한도 metadata를 바꾸는 경우를 거부하며, 로컬 후처리 종료 시각을 network EOF 시각과 섞지 않는다.

### 7.4 최종 커밋된 collector의 실제 새 수집·디스크 재생

최종 run에서 이 collector를 직접 실행했다. [수집 영수증](eth-candidate-evidence/20261028-operating-inputs/final-run/ethereum-staking-cohort/receipt.json)은 정확한 소스 commit/tree와 **실제 GET 3회·재시도 0회·수신 및 보존 4,610 bytes**를 기록한다. genesis 170 bytes, header 671 bytes, validators 3,769 bytes를 모두 HTTP 200으로 받았다. 수집 시작은 **2026-10-27T17:21:35.109Z**, 마지막 본문 EOF는 **17:21:35.778Z**, 후처리 완료는 **17:21:35.779Z**다.

새 상태는 slot **15,524,736**, epoch **485,148**, 관측 시각 **2026-10-27T17:07:35.000Z**다. state root는 `0xa5b836b2c96c570630d7ea02daeb3d4c95c75fbbb396ecf2a65dbddc6dc56943`, block root는 `0x4e18befc2f5231fe10db169c3476533f634622c819f6ae669017a26c913b8bf9`다. 같은 index 0…7의 active 수는 7, effective balance 합은 **234 ETH**, 실제 잔액 합은 **242.199834899 ETH**다.

저장된 receipt와 세 원문을 디스크에서 다시 읽은 [replay](eth-candidate-evidence/20261028-operating-inputs/final-run/ethereum-staking-cohort/replay.json)는 `raw-replay-matched`, 추가 network 요청 0을 기록한다. SSZ header root는 다시 일치했지만 membership proof·BLS 인증·독립 finality는 여전히 확인되지 않았다. 이 새 상태는 §7.1–7.2의 최초 probe와 별개의 acquisition이다. 두 시점 잔액 차이를 순보상이나 연환산 수익으로 계산하지 않았으며, 28일 전체 현금 흐름과 시간 가중 원금·운영비를 확보한 것으로 처리하지 않는다. 적격 경제 snapshot·활성화 입력은 계속 0이다.

## 8. Workflow와 source-book 보존 범위

[ETH evidence workflow](../.github/workflows/eth-model-evaluation.yml)에 새 base·capacity·supply-resolution·cohort 검사를 포함했다. supply accounting 뒤에 공급 해상도 진단을 실행하고, 고정 코호트 수집·재생과 전향 capacity 보고서를 생성하도록 연결했다. `build/ethereum-prospective-capacity.json`, `build/ethereum-supply-resolution.json`, `build/ethereum-staking-cohort/`를 artifact와 source-book의 실행 근거에 포함한다. 최종 직접 소스 run에서 각 경로를 실제 실행하고, 그 결과를 아래 source-book과 원문 영수증에 연결했다.

[source-book 생성기](../scripts/build-eth-review-evidence.mjs)의 유한한 bundle byte 예산은 **70,000,000 bytes**다. 앞선 `47f2ae58` 최종 source-book은 64,037,165 bytes였고, 이번 명시 범위에는 기존 **801,491-byte** 공급 history와 acquisition receipt, 고정 코호트 raw·probe·replay, 새로운 검증·capacity 소스와 실행 결과가 추가된다. 필요한 원문을 버리거나 요약본으로 대체하지 않기 위해 예산을 조정했다. record 2,000개·observation 500개·index 1MiB·최초 12개 창이라는 과학적·입력 검증 조건은 변경하지 않는다.

여기서 801,491-byte 파일은 `docs/eth-candidate-evidence/20261027-vintages-calibration/final-run/ethereum-supply-accounting/capture-0kqcvW/history-30d.raw.json`이라는 **별도의 이전 acquisition**이다. §6의 47f2 artifact에서 재생한 **801,503-byte** 원문과 크기·수집 출처를 혼동하지 않는다. 예전 원문과 receipt를 exact bytes로 포함하는 이유이지, 둘을 독립 경제 학습 표본으로 세는 이유가 아니다.

최종 [source manifest](eth-candidate-evidence/20261028-operating-inputs/final-run/eth-review-packet/source-manifest.json)는 **396 seeds·545 entries·362 parts·65,085,434 bytes**, SHA-256 `a6ea9f6fd437d48943b681158c19dfb50cc8832af2d584460f85db42e49ea32a`, unresolved imports **0**과 `complete-for-declared-scope`를 기록한다. 실제 bundle은 70,000,000-byte 상한 안에 있으며, 기존 첫 packaging 실패와 이후 복구 이력은 앞선 보고서에 그대로 보존한다.

artifact **12753444465**의 ZIP을 실제 내려받았다. 크기는 **53,156,435 bytes**, SHA-256은 `9aeb16f22fd719a617c274c271ed479af4b20333e055ccc7495f6192dd8bc209`다. [artifact 무결성 영수증](eth-candidate-evidence/20261028-operating-inputs/artifact-integrity.json)에 ZIP CRC, 362개 part의 재결합, 545개 원문 frame, 181개 PNG hash 대조를 보존한다. 그중 커밋된 400개 frame은 정확한 원격 Git tree의 blob과 모두 일치했다. runtime evidence frame의 bytes 일치와 커밋된 소스의 Git 일치는 서로 다른 범위다.

[artifact metadata](eth-candidate-evidence/20261028-operating-inputs/artifact-metadata.json)의 만료 시각은 **2026-11-26T17:25:52Z**, 한국 시각 **2026-11-27 02:25:52**다. 원격 artifact는 영구 저장소가 아니다. 이번에는 ZIP 검증과 필요한 원문·receipt·보고서의 명시적 보존을 수행했으며, 이 수동 보존을 매일 자동 수집하거나 다음 run이 이전 원장을 복원하는 기능으로 계산하지 않는다.

## 9. 실제 검증 결과와 남은 조건

### 9.1 서로 다른 checkout과 실행 범위

| 검증 | 실제 run / job | checkout과 결과 |
|---|---|---|
| 일반 CI | [40549330339](https://github.com/twoimo/bitcoin-cycle-atlas/actions/runs/40549330339) / `122348468074` | 합성 merge `dd0d96e6c08a6f559f4237b534673e2dd4abd2a0`, 주 검사 **1,716/1,716**, 수치 assertion **318,010**, negative control **16/16**, 추가 묶음 **32/28/17**, 성공 |
| ETH candidate evidence | [40549330277](https://github.com/twoimo/bitcoin-cycle-atlas/actions/runs/40549330277) / `122348468919` | 정확한 PR 소스 `15b5f651…` 직접 checkout, 집중 **583/583**, Chromium **35/35·181 PNG**, 성공 |
| Hallmark | [40549330481](https://github.com/twoimo/bitcoin-cycle-atlas/actions/runs/40549330481) / `122348469045` | 현재 소스 `15b5f651…`, **0 FAIL / 0 REFLEX**, integrity 오류 **0**, static **36 WARN** / render **17 WARN**, 성공 |

일반 CI의 두 parent는 main 쪽 `5dd11c99faa1fe4a1a9adf56bc4775d35c9a41e4`와 PR 소스 `15b5f65158074d0e2d4e2d6ad0c64a345eed740d`다. [일반 CI 영수증](eth-candidate-evidence/20261028-operating-inputs/ci-40549330339.json)은 `directPrHeadCheckout=false`를 유지한다. 합성 merge에서 테스트한 사실을 PR을 main에 병합하거나 배포한 것으로 표현하지 않는다.

ETH 집중 583개는 실제 다섯 묶음 **66 + 39 + 66 + 34 + 378**이다. 일반 CI, 이 집중 검사, 로컬 **169/169**에는 겹치는 검사가 있으므로 합산하지 않는다. 로컬 코호트 metadata 검사 **28/28**도 169개 안에 포함된다. 로컬 process exit 0은 [별도 실제 종료 영수증](eth-candidate-evidence/20261028-operating-inputs/local-process-exit.json)에 기록했으며, polling 시각을 정확한 process 종료 시각으로 바꾸지 않았다.

[최종 브라우저 보고서](eth-candidate-evidence/20261028-operating-inputs/final-run/eth-browser/report.json)는 runtime 오류 **0**과 원시 resource 오류 **15**를 기록한다. 이 15건은 BTC 오프라인 갱신 검사의 한정된 inspector 차단 조건에 해당하며, 실패 UI와 archive 데이터 보존을 확인한 예상 결과다. **unexpected resource 오류는 0**이다. 원시 오류를 삭제하거나 전체 resource 오류가 0이라고 바꾸지 않았다. 검증 환경은 headless Chromium이며 Safari·물리 모바일 검증으로 확대하지 않는다. [Hallmark 영수증](eth-candidate-evidence/20261028-operating-inputs/hallmark-40549330481.json)의 36/17 WARN도 그대로 남긴다.

### 9.2 최종 원장과 재생 결과

[최종 readiness](eth-candidate-evidence/20261028-operating-inputs/final-run/ethereum-prospective-calibration-readiness.json)는 cutoff **2026-10-27T17:22:05.549Z**에서 원래 3개 기록과 4개 관측을 검증했다. **9개 조합 모두 `insufficient-calibration-cases`**, 반경 null, 실제 freeze·보정 발행·보정 target score는 0이다. 세 모델은 원래 source graph와 raw 입력에서 다시 실행되어 각 731점과 기록 ID가 일치했다. 새 관측 1개를 보존한 사실이 성숙한 target 정답이나 새 forecast 발행을 뜻하지 않는다.

[실행 요약](eth-candidate-evidence/20261028-operating-inputs/evidence-40549330277.json), [로컬 측정·검증](eth-candidate-evidence/20261028-operating-inputs/local-verification.json), [최종 원문·보고서 directory](eth-candidate-evidence/20261028-operating-inputs/final-run/)에 소스·시각·run·artifact를 연결했다. 이전 로컬 측정과 최초 probe를 최종 원격 실행의 시각·소스로 덮어쓰지 않는다.

### 9.3 계속 남는 실질 조건

공급에는 정확한 UTC boundary stock과 같은 범위의 검산 가능한 흐름이 필요하다. 스테이킹에는 동일한 경제적 코호트의 완전한 28일 수익·원금·비용·대기 이력이 필요하다. 전향 보정에는 첫 12개 실제 비중첩 창과 선택된 모든 정답의 보존, immutable freeze, 이후 실제 발행·평가가 필요하다. 현재 달력상 가장 이른 완료일은 자료 확보나 모델 승격을 보장하지 않는다.

운영상으로는 검토된 일일 trigger, 이전 원장의 완전한 복원·append·영구 보존, base 갱신 및 장기 용량 설계가 남는다. 이번의 수동 artifact 보존과 committed-base reader는 그 전체 경로를 자동화하지 않는다. **완전 경제 snapshot 0, 실제 성숙 보정 사례 0, freeze·보정 발행 0, PR Draft, `releaseAuthorized=false`**를 유지한다. Gemini 반대 검토와 후속 역검토는 사용자 지시에 따라 생략했으며, 실행하거나 통과한 것으로 표시하지 않는다.
