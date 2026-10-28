# ETH 전향 기록의 검증·복원·누적 보관과 일일 수집 정의 — 2026-10-28

> **같은 날의 두 실제 실행 사이 복원·누적과 두 결과의 수동 원격 게시를 확인했다.** 수정 소스 `f6739b0a...`와 문서 후속 `c17be870...`의 일반 CI는 각각 **1,823/1,823**, 직접 head Hallmark는 각각 **0 FAIL / 0 REFLEX·integrity 오류 0·정적 36/render 17 WARN**이다. 첫 ETH 실행 `40626529467`의 4세대 원본을 데이터 커밋 `8f169b18...`에 수동 게시했고, 두 번째 ETH 실행 `40628133773`이 그 정확한 커밋·트리·53개 파일을 읽어 복원한 뒤 새 관측 한 개를 추가한 사실을 실제 산출물로 재검증했다. 최신 결과는 **5세대·63파일·8,180,885바이트·6개 기록·7개 관측**이다. 최신 5세대도 데이터 커밋 `f42a4bf7...`에 수동 게시한 뒤 정확한 트리를 재조회했다. 자동 게시기는 실행하지 않았고 기본 브랜치에는 일일 워크플로 정의가 아직 없다. 두 실행은 **같은 UTC일의 실행 연속성** 증거다. ETH 작업 로그의 정확한 집중 검사 수는 두 실행 모두 미확보로 남긴다.

## 1. 이번 작업의 결론

이전 실행의 원본 기록·관측을 검증해서 복원하고, 다음 실행의 증거를 기존 파일과 충돌 없이 추가하며, 전체 기록을 다시 복원해 확인하는 경로를 구현했다. 이전에는 PR 실행에서 만들어진 새 관측이 30일 보존 산출물에 남아 있어도 다음 실행이 자동으로 읽는 입력으로 연결되지 않았다. 이번 변경은 그 연결을 위한 보관 형식, 파일 입출력, 발행 전 용량 검사, 원격 데이터 브랜치 쓰기 절차와 일일 워크플로 정의를 추가한다. [이전 운영 조건 보고서](ETH_OPERATING_INPUTS_AND_CAPACITY_20261028.md), [보관 코어](../scripts/ethereum-prospective-archive-core.mjs), [파일 복원·추가 명령](../scripts/manage-ethereum-prospective-archive.mjs)

실제 초기 보관 데이터는 기존 발행 기록 **3개**, 전향 관측 **4개**, 독립 ETH 결과 관측 **1개**를 포함한다. 모든 발행 기록의 ID·발행 시각·731개 경로 값은 원본 바이트 그대로 유지된다. 이번 초기 보관 작업에서 새 시장 관측이나 예측을 생성한 수는 **0개**다. 최신 관측 한 개는 이전에 성공한 `4bf84ce3` 실행의 산출물에서 회수한 실제 기록이다. [초기 보관 증거](eth-candidate-evidence/20261028-continuity/bootstrap-final.json), [초기 보관 manifest](../research-data/ethereum-prospective-archive/manifest.json)

첫 실제 ETH 실행에서는 새 예측 **3개**와 새 전향 관측 **1개**를 추가했다. 이전 원본 세 기록을 바꾸지 않은 채 전체 기록은 6개, 관측은 6개가 되었고, 완전한 4세대 보관 파일을 고정 데이터 브랜치에 수동 게시했다. 원격 커밋과 원본 트리의 일치까지 확인했다. [첫 산출물 재검증](eth-candidate-evidence/20261028-continuity/first-artifact-verification.json), [실제 수동 게시 증거](eth-candidate-evidence/20261028-continuity/manual-first-publication.json), [게시한 불변 보관 원본](https://github.com/twoimo/bitcoin-cycle-atlas/tree/8f169b18a2eeec70fe9e57eed5bdb154e9dad3bc)

일일 수집은 워크플로 **정의**까지 포함한다. Draft PR의 정의와 이번 수동 게시를 기본 브랜치 예약 활성화 또는 자동 게시기의 실행으로 기록하지 않는다. 게시된 원격 세대를 같은 날의 다음 PR 실행이 복원·추가한 증거는 확보했다. 다음 날의 실행 및 장기간 일일 운영은 별도 증거가 필요하다. 실제 성숙 결과, 보정 동결, 이후 발행·평가 역시 여전히 남는다. [일일 워크플로](../.github/workflows/eth-prospective-daily.yml), [보정 계약](../scripts/ethereum-prospective-calibration-core.mjs)

PR #39는 Draft를 유지하며 `releaseAuthorized=false`, `productionPromoted=false`다. Gemini 반대 검토와 후속 역검토는 사용자 요청에 따라 `omitted-by-user`다. 이를 다시 승인 조건으로 만들지 않는다.

## 2. 완료 범위와 남은 조건

| 조건 | 이번 변경 | 검증 범위와 남은 일 |
|---|---|---|
| 이전 원본 기록·관측 복원 | 불변 객체·페이지·manifest를 전부 검증한 후 작업 디렉터리를 복원 | 전체 원본 17개 파일 왕복, 첫 초기 보관 복원, 수동 게시한 정확한 원격 4세대를 같은 날 두 번째 실행에서 복원·추가한 결과 모두 확인 |
| 실행 사이 증거 누적 | 기존 불변 파일을 모두 유지하고 다음 manifest를 추가 | 새 객체만 추가할 수 있으며 기존 파일 변경·삭제·계보 단절은 거부 |
| 독립 ETH 결과 관측 보존 | 전향 관측과 함께 보관하고 별도 결과 입력 디렉터리로 복원 | 합산 관측 한도 500개를 그대로 적용 |
| 발행 전 용량 검사 | 기존 전체 입력과 예정 추가분으로 기록·관측·인덱스 크기를 검사 | 한도 초과 시 새 불변 기록을 쓰기 전에 중단. 선택한 과거 사례를 버리지 않음 |
| 일일 자동 수집 | 매일 10:17 한국시간에 해당하는 예약 정의 및 수동 실행 정의 | 기본 브랜치에서 실제 활성화·성공·후속 복원이 확인된 것은 아님 |
| 원격 장기 보관 | 고정 데이터 브랜치의 원본 Git 객체 검증 및 추가 게시 절차 | 4·5세대 각각 수동 게시·트리 대조 완료, 후속 PR에서 4세대의 실제 원격 복원 완료. 자동 게시기·다음 날 예약 운영은 별도 조건 |
| 기존 활성 한도를 넘는 운영 | 전체 보관 데이터는 페이지로 나누어 검증 | 500개 관측·2,000개 기록·1 MiB 인덱스를 넘는 보정 입력 선택·스트리밍은 미구현 |
| 실제 보정 성숙 사례 | 최초 12개 비중첩 성숙 창, 동결, 이후 발행·평가 계약 유지 | 시간의 경과와 실제 관측이 필요. 합성 잔차·과거 재발행으로 채우지 않음 |
| 28일 경제 입력 | 기존 부분 관측과 미충족 상태 유지 | 정확한 UTC 공급 경계, 유량, 동일 코호트 수익·원금 이동·비용·대기시간 등이 계속 필요 |

## 3. 보관 형식과 검증 순서

### 3.1 원본 객체, 페이지, manifest

보관 형식은 원본을 `objects/<sha256>.blob`에 저장한다. 하나의 스냅숏이 발행 입력과 관측으로 함께 쓰여도 같은 바이트는 객체 하나로 보존할 수 있다. 원래의 논리 경로는 각 페이지의 설명에 남으며, 파일 크기·SHA-256·Git blob SHA-1을 모두 검사한다. 중복 제거는 논리 관측이나 기록을 삭제하는 동작이 아니다. [보관 코어](../scripts/ethereum-prospective-archive-core.mjs)

페이지는 `pages/<id>.json`, 각 보관 세대는 `manifests/<id>.json`으로 보존한다. `manifest.json`은 현재 세대를 가리키는 동일 바이트의 별칭이다. 다음 세대의 `previousManifestId`와 `sequence`를 검증하고, 이전 페이지 목록이 새 페이지 목록의 정확한 접두부인지 확인한다. 모든 선행 manifest, 페이지, 객체는 계속 존재해야 한다. 어느 manifest에서도 도달할 수 없는 임의 파일이 들어 있어도 검증을 통과하지 못한다.

기존 `index.json`, `receipt.json`, `files.json`, `replay-receipt.json`, `replay-files.json`처럼 실행마다 바뀌는 파일을 동일 경로에 덮어쓴 역사로 취급하지 않는다. 원래 바이트를 `indexes/<sha256>.json` 또는 `receipts/<sha256>.json`으로 각각 보존한다. 예전 인덱스는 그 시점의 일부 기록만 포함할 수 있으나, 그 안의 모든 항목은 실제 보존 기록과 일치해야 한다. 활성 인덱스는 전체 검증된 기록으로 다시 구성한다.

완전한 이전 원장에는 고정 파일명 `acquisition.json`과 `raw/coinbase-tail.json`도 있었다. 공통 정규화 함수는 전자를 `receipts/<원본 바이트 SHA-256>.json`, 후자를 `raw/coinbase-tail-<원본 바이트 SHA-256>.json`으로 연결한다. 원본 저장소의 경로나 바이트는 바꾸지 않는다. 기존 경로와 보관 경로의 대응, 바이트 수, SHA-256, Git blob을 별도 초기 보관 증거에 남긴다. 이 체크포인트의 원래 JSON 공백을 보존해도, 그것을 의미 검증을 통과한 새 수집 기록이나 시장 관측으로 취급하지 않는다. 유형이 정해진 불변 기록·스냅숏·관측·수집 기록·인덱스에는 정규 JSON 검증을 계속 적용한다.

### 3.2 선행 세대도 그 시점에 완결되어야 한다

최종 세대의 전체 파일만 검증하면, 잘못 만들어진 예전 세대가 스냅숏 없이 기록만 담았다가 나중에 스냅숏을 추가해서 정상처럼 보일 수 있다. 이를 막기 위해 `기록 → 입력 스냅숏`, `인덱스 체크포인트 → 기록` 참조는 **참조하는 파일이 처음 등장한 세대 안에서 이미 해결되어 있어야 한다**.

이 검사는 원본 의미 검증을 세대마다 반복하지 않는다. 원본을 한 번 검증한 후 각 논리 파일의 페이지 위치와 최초 세대의 페이지 범위를 비교한다. 같은 세대에서 서로 다른 페이지에 추가된 정상 참조는 허용하고, 나중 세대가 과거의 누락을 고치는 위조 계보는 거부한다. 실제 초기 보관 데이터의 세 세대 모두 이 검사에 통과했다. [보관 코어 테스트](../tests/ethereum-prospective-archive.test.mjs), [초기 보관 재검증 증거](eth-candidate-evidence/20261028-continuity/bootstrap-final.json)

### 3.3 보존 원본의 의미 검증

기록의 ID와 파일 해시가 맞는지만 검사하지 않는다. `verifyEthereumProspectiveRecord`로 원본 입력 스냅숏, 경제적 실행 식별자, 발행 시각, 출력과 타깃 메타데이터를 검증한다. 전향 관측은 `verifyEthereumResearchSnapshot`, 독립 ETH 결과는 `verifyAssetOutcomeSnapshot`을 다시 수행한다. 동일한 기록 ID 또는 경제적 실행 키가 다른 내용으로 나타나면 중단한다.

이 검증은 보존 바이트의 일관성과 기존 계약을 증명한다. 공급자의 관측 진위, 최초 공개 시각, 예측력, 독립 표본 수나 보장된 커버리지를 증명하는 것은 아니다. 모든 관련 영수증에서 `providerAuthenticity=false`를 유지한다.

### 3.4 실패한 HTTP 응답도 사실대로 보존한다

수집기는 완전히 받은 오류 응답을 역사적인 `raw/coinbase-tail-<sha>.json` 경로에 남길 수 있다. 그 본문이 HTML 또는 잘못된 JSON이어도 실제 실패 증거이므로 정확한 SHA-256과 손실 없는 UTF-8 바이트를 검사해 보존한다. 비 UTF-8 본문은 별도의 엄격한 base64 경로로 보존한다. 실패 본문을 유효한 시장 관측으로 승격하지 않으며, 성공한 스냅숏의 전체 JSON·가격·시각 검증은 계속 수행한다. 오류 본문 때문에 실패 기록 자체의 보관이 막히지 않는지를 회귀 검사했다.

## 4. 파일 복원과 발행 전 용량 검사

### 4.1 파일 시스템 경계

파일 입출력 명령은 일반 파일과 일반 디렉터리만 받아들인다. 루트·조상·중간 디렉터리·파일의 심볼릭 링크, 경로 탈출, 예상하지 않은 이름, 특수 파일, 바이트·개수 한도 초과를 거부한다. 출력은 임시 디렉터리에 모두 쓴 뒤 완성된 디렉터리를 이동한다. 이미 존재하는 출력 디렉터리는 모든 바이트가 일치할 때만 재사용하며, 다른 증거를 덮어쓰지 않는다. [파일 입출력 구현](../scripts/manage-ethereum-prospective-archive.mjs), [파일 입출력 테스트](../tests/ethereum-prospective-archive-io.test.mjs)

복원 단계는 보관 사본, 전향 작업 원장, 독립 ETH 결과 원장을 각각 구성한다. 모든 목적지의 충돌 여부를 먼저 확인하고, 복원 후 기존 보정 입력 로더를 다시 실행한다. 이전에 저장된 `verified`나 성공 영수증으로 현재의 원본 검증을 건너뛰지 않는다.

독립 결과는 `build/ethereum-prospective-archive-outcomes`로 복원한다. 기존 자산 결과 수집기가 자신의 작업 디렉터리를 다시 만들더라도 이 복원된 ETH 관측을 잃지 않게 하며, 보정 입력 로더가 기존 원장·현재 실행 원장·복원 원장을 함께 읽어 동일 ID를 한 번만 센다. 검증에 사용한 모든 실제 입력 파일은 영수증에 남는다.

### 4.2 ETH라는 인덱스 표지만 먼저 믿지 않는다

독립 관측의 인덱스에서 ETH를 BMNR 또는 MSTR로 바꾸면, 표지만 보고 먼저 제외하는 구현은 해당 원본의 누락이나 변조를 숨길 수 있다. 이번 변경은 **인덱스에 있는 모든 자산의 실제 원본을 검증하고, 원본에서 다시 만든 인덱스 항목과 비교한 다음 ETH 여부를 판단한다**. 정상 BMNR·MSTR 관측은 검증 후 ETH 보정에서 제외한다.

회귀 검사는 ETH 항목의 BMNR/MSTR 재표기, 재표기 후 원본 누락, 재표기 후 수집 시각 변조가 모두 차단되는지 확인한다. 정상 BMNR 관측은 읽은 파일 목록에 남으면서 ETH 관측 수에는 더해지지 않는지도 확인했다. [보정 입력 로더](../scripts/build-ethereum-prospective-calibration-readiness.mjs), [라우팅 회귀 테스트](../tests/ethereum-prospective-calibration-readiness.test.mjs)

### 4.3 새 불변 기록을 쓰기 전에 한도를 검사한다

발행기는 복원된 전체 원장을 먼저 읽어 검증하고, 새 후보 역시 원본 스냅숏에 대해 검증한다. 이어서 실제 추가할 후보와 이번 관측을 기존 목록에 합친 예상 크기를 계산한다. 기록 2,000개, 관측 500개, 후보 인덱스 1 MiB 중 하나라도 넘으면 새로운 불변 기록·스냅숏·관측·인덱스를 쓰기 전에 중단한다. 수집 시도의 원시 응답과 실패 영수증은 사실대로 남길 수 있다. [쓰기 한도 검사](../scripts/ethereum-prospective-write-guard.mjs), [발행기](../scripts/issue-ethereum-prospective.mjs)

한도 검사는 원본 검증을 대신하지 않는다. 도움 함수의 영수증은 `rawEvidenceValidated=false`를 명시하고, 호출자가 기존 원본과 추가 후보를 별도로 검증하도록 한다. 같은 관측의 중복 경로는 중복 계산하지 않지만, 같은 ID가 다른 내용이거나 같은 경제적 실행 키가 다른 기록을 가리키면 거부한다.

## 5. 실제 초기 보관 데이터

### 5.1 세 세대의 출처

첫 세대는 커밋 `4bf84ce345d6468c69dc25c7a7dce50f5703ab6b`, 트리 `51b459ed978266cd5a0bd993d942e77c1ab85c39`에 들어 있던 기존 원장과 이전 `15b5f651` 실행의 보존 문서 입력을 묶었다. 입력 25개 파일의 Git blob을 이 원격 트리와 대조했다. 두 번째 세대는 같은 `4bf84ce3` 소스로 이미 완료된 실제 GitHub Actions 실행의 산출물을 검증해 이어 붙였다. [초기 보관 증거](eth-candidate-evidence/20261028-continuity/bootstrap-final.json)

세 번째 세대는 실제 CI가 드러낸 불완전한 로컬 입력 목록을 보완했다. 원격 원장의 전체 파일은 17개였고, 처음 로컬에 내려와 있던 파일은 8개였다. 원격에 이미 존재하던 나머지 9개, 합계 **35,047바이트**를 정확한 Git blob과 대조해 가져와 보관에 추가했다. 원래 저장소에 새 과거 데이터를 만들어 넣은 것이 아니며, 기존 1·2세대 manifest·페이지·객체도 수정하지 않았다. [전체 이전 원장 출처](eth-candidate-evidence/20261028-continuity/materialized-legacy-identities.json)

이때 manifest의 `sourceCommit=4bf84ce3`, `sourceTree=51b459ed...`, `runId=null`은 **보관 대상으로 사용한 데이터의 출처**다. 이번에 새로 작성한 보관 코드가 과거의 `4bf84ce3` 커밋에서 실행되었다는 주장이 아니다. 이번 구현 코드의 실행 출처와 원격 결과는 별도 후속 절에 기록한다.

| 항목 | 첫 세대 | 두 번째 세대 | 세 번째 세대 |
|---|---:|---:|---:|
| 실제 작성 시각, 한국시간 | 2026-10-28 11:51:26.365 | 2026-10-28 11:54:33.694 | 2026-10-28 12:22:57.768 |
| 원본 UTC 시각 | `2026-10-28T02:51:26.365Z` | `2026-10-28T02:54:33.694Z` | `2026-10-28T03:22:57.768Z` |
| 세대 번호 | 1 | 2 | 3 |
| 페이지 수 | 1 | 2 | 3 |
| 논리 파일 수 | 18 | 27 | 36 |
| 중복 제거한 원본 객체 수 | 15 | 23 | 32 |
| 원본 객체 바이트 | 4,513,417 | 5,627,683 | 5,662,730 |
| manifest·페이지 바이트 | 7,972 | 12,782 | 17,852 |
| 전체 보관 파일 수 | 18 | 28 | 39 |
| 전체 보관 바이트 | 4,521,389 | 5,640,465 | 5,680,582 |
| 기존 발행 기록 | 3 | 3 | 3 |
| 전향 관측 | 3 | 4 | 4 |
| 독립 ETH 결과 관측 | 1 | 1 | 1 |

첫 세대 manifest ID는 `a3a2b066ab195f6a697175ba34235f360754a25a510bf4a270e6049f5c4d7e83`다. 두 번째 세대 ID는 `482cbcd7df1a7a6382124273a5a5d143c08a9b3006944ead514f6a5d6ce76961`이며, 정확한 첫 세대 ID를 부모로 가리킨다. 두 번째 세대는 기존 불변 파일을 모두 유지하면서 논리 파일 9개를 추가했다. [현재 manifest](../research-data/ethereum-prospective-archive/manifest.json)

현재 세 번째 세대 ID는 `c65342e22b783fc387b6965afe5ce5d946713a883fe7838883daa2ce64744d51`이고, 정확한 두 번째 세대 ID를 부모로 가리킨다. 세 번째 세대가 새로 추가한 불변 보관 파일은 객체 9개·페이지 1개·manifest 1개, 합계 11개다. 앞선 세대의 불변 파일 27개는 모두 같은 바이트로 남아 있고 현재 별칭만 새 manifest를 가리킨다. 이 확장도 새 예측이나 새 관측을 생성하지 않았다.

### 5.2 이전 실제 실행 산출물의 회수

| 항목 | 확인한 값 |
|---|---|
| 이전 실행 | [40552717736](https://github.com/twoimo/bitcoin-cycle-atlas/actions/runs/40552717736) |
| 실행 소스 | `4bf84ce345d6468c69dc25c7a7dce50f5703ab6b` |
| 산출물 ID | `12755309364` |
| ZIP 크기 | 53,110,121바이트 |
| ZIP SHA-256 | `fd01857628132e67b63784398b5808360ec3a4896a3ffa6070ccf8ab4246905f` |
| 무결성 검사 | ZIP CRC 및 선택 파일의 경로·바이트·SHA-256 대조 |
| 선택 확인 파일 | 전향 원장 15개 + 자산 결과 원장 10개 = 25개 |

새로 회수한 전향 관측 ID는 `f034cd8aee6d3a256364379d801750212f9eb678ef9813c37d0fcba2e103df24`다. 크기는 1,084,126바이트이며, SHA-256은 `d66d8d10eff61c794398b6f6bf0e4f083d49ee4526fd975e0e72411674eae21c`다. 실제 정보 마감 시각은 `2026-10-27T17:43:45.417Z`, 즉 한국시간 2026-10-28 02:43:45.417이다. 과거 실행에서 수집된 관측을 이번 로컬 작업 시각으로 다시 발행하거나 수집한 것으로 기록하지 않았다. [이전 실행 산출물 무결성](eth-candidate-evidence/20261028-continuity/prior-run-4bf-artifact-integrity.json)

### 5.3 원래 세 예측의 정체성

세 기록의 원점은 모두 `2026-10-26`이고, 각 기록은 원래의 731개 경로 값을 보존한다.

| 모델 | 기록 ID | 원래 발행 시각, UTC | 모델 그래프 파일 |
|---|---|---|---:|
| adaptive | `563d087f19a5062981714ed6fee1f96dd5afe77a87a4c435979b000451189a9b` | `2026-10-27T07:44:13.396Z` | 14 |
| pooled | `f1f0bf98496c1d6e9339ae9410a51c904571524d3ade88fc935cf6f58df3fed1` | `2026-10-27T07:44:13.396Z` | 14 |
| warmStart | `d2659722c147909a9cbeeea4980c63b52f36f9c23c315cd2ef1e10984b8d5f72` | `2026-10-27T09:57:51.931Z` | 17 |

adaptive·pooled의 그래프 해시는 `cb316276ae79f90cd44d31d7ef4ad7d404c9ced4bb49d957bb4f6f94ed030491`, warmStart는 `463085b24aa701b66a6e754c6b6437a157f2bc1cbc7fd1b2403a072b4b9d42ca`다. 보관 포맷과 운영 스크립트를 추가하는 일은 이 동결된 모델 그래프를 다시 식별하거나 변경하지 않는다.

관측 5개가 독립된 5개 시장 표본이나 성숙된 보정 사례 5개를 의미하지도 않는다. 네 전향 관측은 같은 `2026-10-26` 원점에 관한 서로 다른 실제 수집 기록이고, 독립 결과 관측 한 개의 실제 수집 시각은 `2026-10-26T13:51:01.829Z`다. 재수집 횟수를 독립 경제 표본 수로 세지 않는다.

## 6. 일일 워크플로와 원격 데이터 브랜치

### 6.1 정의된 실행 순서

워크플로는 `01:17 UTC`, 한국시간 **10:17**에 해당하는 일일 예약과 `workflow_dispatch`를 정의한다. 실제 실행은 지연되거나 실패할 수 있다. 고정 저장소와 기본 브랜치, 예약 또는 수동 이벤트에서만 writer 작업이 실행되도록 제한한다. 하나의 writer 동시성 그룹을 사용하고 진행 중인 writer를 취소하지 않는다. [일일 워크플로](../.github/workflows/eth-prospective-daily.yml)

작업 순서는 원격 데이터 브랜치 확인, 전체 원본 검증·복원, 현재 ETH 꼬리 데이터 한 번 수집, 보존 기록 재실행, 보정 준비도·용량 진단, 새 증거 추가, 전체 재복원 검증, 고정 데이터 브랜치 게시다. 현재 수집이 실패해도 실패 원문과 영수증을 보관할 수 있다. 마지막 단계에서는 수집 실패를 실패로 다시 표시해, 보관 성공을 시장 관측 성공으로 보고하지 않는다.

PR 검증 워크플로는 `contents: read`를 유지한다. 원격 데이터 브랜치가 있으면 검증한 정확한 원격 세대로 복원하고, 접근 가능한 고정 저장소에서 그 브랜치가 명시적으로 없음을 확인한 경우에만 커밋된 초기 보관 데이터로 시작한다. 첫 실제 실행은 이 명시적인 부재 경로를 사용했다. PR 작업에서 특권 writer를 호출하거나 PR 산출물을 특권 작업에 그대로 전달하는 경로는 정의하지 않았다. [PR 증거 워크플로](../.github/workflows/eth-model-evaluation.yml), [첫 원격 읽기 영수증](eth-candidate-evidence/20261028-continuity/first-run/ethereum-prospective-archive-remote-receipt.json)

### 6.2 원격 읽기·쓰기의 신뢰 경계

원격 저장 대상은 `twoimo/bitcoin-cycle-atlas`의 **`eth-prospective-archive`** 브랜치로 고정한다. 원격 ref의 정확한 커밋과 트리를 읽고, 트리의 파일 모드·경로·크기·완전성을 검사한 후 각 원본 Git blob과 트리 자체를 다시 해시한다. 본문의 manifest도 다시 검증한다. [원격 보관 구현](../scripts/ethereum-prospective-archive-remote.mjs)

원격 브랜치가 없다는 응답만으로 초기화를 허용하지 않는다. 의도한 공개 저장소를 실제로 읽을 수 있고 정확한 브랜치 조회가 404였는지 확인한다. 접근 거절·파손·알 수 없는 실패를 브랜치 부재로 취급해서 작은 초기 원장으로 조용히 되돌리지 않는다.

게시 전에는 읽을 때 선택했던 원격 head와 현재 head가 같은지 확인한다. 다음 manifest가 정확히 한 세대의 추가인지, 원본 입력 커밋·트리·실행 ID가 맞는지, 이전 불변 파일이 전부 같은지 검사한다. 새 객체·트리·커밋의 식별자를 검증하고 `force:false`로 갱신하며, 게시 후 ref와 트리를 다시 읽어 대조한다. 최초 게시의 **이전 입력 세대**는 실제 실행 소스에 커밋된 초기 보관 트리와 정확히 일치해야 하며, 새 게시물은 그 세대에서 검증된 한 번의 추가여야 한다.

첫 실제 산출물의 수동 게시와 원격 트리 대조는 완료했다. 데이터 커밋은 `8f169b18a2eeec70fe9e57eed5bdb154e9dad3bc`이며, 아래 9절에 정확한 원본·부모·트리를 기록한다. **자동 게시기는 실행하지 않았다.** 기본 브랜치의 예약 활성화와 자동 게시기 실행은 별도 조건이다. 게시한 정확한 4세대를 다음 PR 실행이 복원한 결과는 10절에서 실제 증거로 확인한다. [수동 게시 영수증](eth-candidate-evidence/20261028-continuity/manual-first-publication.json)

### 6.3 Git 전송에서 측정하지 않은 값

CLI의 원격 원본 읽기는 고정 커밋을 임시 bare Git 객체 저장소로 한 번 가져오는 방법을 사용한다. 데이터 브랜치를 체크아웃하거나 그 안의 코드를 실행하지 않고, hooks·submodule·자격 증명 영속화를 사용하지 않는다. API에서 검사한 트리와 실제 Git 객체 목록을 대조하고, 각 blob의 바이트와 해시를 확인한다.

Git 전송의 실제 HTTP 요청 수와 wire 바이트는 이 경로에서 계측하지 않으므로 `httpRequestCount:null`, `wireBytes:null`로 남긴다. 복호화 후 객체 크기·개수·총량·전체 제한 시간 검증을 wire 바이트 상한을 측정한 것으로 설명하지 않는다. REST 요청 수·수신 바이트 영수증과 Git pack 영수증 역시 같은 수치로 합치지 않는다.

## 7. 유한한 한도와 성숙 조건

| 계층 | 현재 한도 | 넘었을 때의 동작 |
|---|---:|---|
| 활성 발행 기록 | 2,000개 | 새 쓰기 또는 복원 거부 |
| 활성 전향·독립 ETH 관측 합계 | 500개 | 새 쓰기 또는 복원 거부 |
| 활성 후보 인덱스 | 1 MiB | 새 쓰기 또는 복원 거부 |
| 개별 원본 객체 | 8 MiB | 보관 거부 |
| 개별 발행 기록 | 2 MiB | 보관 거부 |
| 원본 객체 총량 | 2 GiB | 보관 거부 |
| 보관 페이지 | 4,096개 | 추가 거부 |
| 페이지의 논리 파일 설명 | 128개 | 다음 페이지로 분할 |
| manifest·페이지 각각 | 1 MiB | 보관 거부 |
| 선행 manifest 이력 | 4,096세대 | 추가 거부 |
| 전체 메타데이터 | 64 MiB | 보관 거부 |

파일 입출력과 원격 전송에도 각각 별도의 파일·응답·요청·시간 제한이 있다. 이 표의 가장 큰 값까지 모든 조합에서 운영을 보장한다는 뜻이 아니다. 실제로 먼저 도달하는 제한이 실행을 중단시킨다. 원격 전송은 최대 4,096회의 제한된 REST 요청, 요청당 15초, REST 구간 총 600초 등의 별도 정책을 둔다. 전체 디코딩 객체 바이트와 메타데이터 한도도 함께 적용한다. [코어 정책](../scripts/ethereum-prospective-archive-core.mjs), [원격 정책](../scripts/ethereum-prospective-archive-remote.mjs)

기존 보정 계약은 정확히 결합된 모델·소스·옵션·기간별로 가장 먼저 실제 발행된 기록을 선택하고, 최초 12개 비중첩 성숙 창을 결과값을 보기 전에 고른다. 동률 수정, 누락 관측, 변조 입력이 있으면 그 자리를 다음 좋은 사례로 바꿀 수 없다. 501개의 유효한 합성 관측을 보관할 수 있어도 활성 복원은 500개 한도 때문에 실패한다는 검사를 추가했다. 이는 유효한 보관 파일을 실제 보정 입력의 제한을 완화하는 구실로 사용하지 않음을 확인한다.

따라서 이 변경은 임의 기간을 버티는 무한 보관이나 한도 이후의 보정 선택을 완성한 것이 아니다. 한도를 넘어서도 최초 선택 창, 모든 불량·누락 증거, 빈티지 선택을 보존하는 스트리밍 또는 명시적 분할 계약이 별도로 필요하다. 현재 기준 가격 아카이브의 미래 갱신과 단일 요청의 최대 290일 범위·300개 캔들 한도도 별도의 운영 조건으로 남는다. 이번 변경은 기존 모델 소스를 수정하거나 가격 기준 파일을 자동 갱신하지 않는다.

## 8. 로컬 검증 결과

부분 검증과 실제 원격 검증의 출처를 구분한다. 처음 로컬에서 통과한 보관 코어 29개와 보정 입력 로더 15개, 합계 44개는 기존 로컬 입력 목록이 불완전한 상태의 결과였다. 그 결과를 완전한 원격 원장의 호환성 증거로 사용하지 않는다. 해당 TAP 원문도 그대로 보존한다. [최초 부분 검증 TAP](eth-candidate-evidence/20261028-continuity/archive-and-routing-tests.tap)

| 수정 후 로컬 검증 | 실제 결과 | 시간 | 보존 증거 |
|---|---|---:|---|
| 보관 코어 및 고정 경로 호환성 | 31개 통과, 실패·취소·건너뜀 0 | 3,896.600692 ms | [코어 TAP](eth-candidate-evidence/20261028-continuity/legacy-archive-tests.tap) |
| 전체 원본 17개 파일을 넣은 입출력 왕복 | 24개 통과, 실패·취소·건너뜀 0, 프로세스 종료 0 | 75,020.502647 ms | [입출력 TAP](eth-candidate-evidence/20261028-continuity/archive-io-complete-seed.tap), [종료·입력 출처 영수증](eth-candidate-evidence/20261028-continuity/archive-io-complete-seed-exit.json) |

수정 후 검증에는 고정 acquisition/raw 경로의 정확한 바이트 보존, 원본 수집 영수증과 raw 문자열·base64·해시·스냅숏 시각의 연결, 이전/이후 receipt·files 체크포인트 공존, 파일 경로 탈출·원본 누락·미목록 파일·바이트 변조·Git blob 불일치·계보 단절·기록/스냅숏의 의미 불일치·과거 참조의 미래 보완이 포함된다. 원래 세 기록의 실제 바이트와 초기 보관 데이터의 세 세대도 오프라인으로 다시 검증했다. 서로 다른 소스 시점의 부분 테스트를 하나의 최종 전체 테스트 수로 합산하지 않는다.

### 실제 첫 원격 실행 실패와 수정 경계

첫 구현 소스 `a3bd5b2fd110ca90b9c86b6b4c7b6bd6af9c4837`의 일반 CI는 **1,821개 중 1,799개 통과, 22개 실패**했다. 일반 CI 실행 `40625665456`은 합성 merge `96033eb522dd965e92fa5a55e803143ecb463068`을 검사했다. 별도의 ETH 실행 `40625665462`, 작업 `122609834696`은 첫 집중 묶음 66개를 통과한 뒤 다음 묶음 102개에서 80개 통과·22개 실패를 기록했다. 원인은 모두 전체 원격 원장에 있는 `acquisition.json`을 새 보관 경로 분류가 받아들이지 못한 호환성 누락이었다. 이 ETH 실행은 수집 단계에 도달하지 못했으며 새 수집과 산출물 생성이 실행되지 않았다. [첫 일반 CI 실패 영수증](eth-candidate-evidence/20261028-continuity/initial-ci-failure.json), [첫 ETH 실행 실패 영수증](eth-candidate-evidence/20261028-continuity/initial-eth-failure.json)

수정은 같은 원본 입력을 명시적인 체크포인트 및 raw 경로로 정규화하고, 로컬 검증 입력을 원격에 실제 존재하는 전체 17개 파일로 채운 뒤, 기존 보관 1·2세대를 보존한 3세대를 추가했다. 최초 실패 커밋을 수정 결과로 다시 서술하지 않는다. 성공 여부는 그 커밋을 부모로 하는 별도 수정 커밋의 원격 실행에서 확인했다. 최초 실패 영수증과 수정 후 성공 영수증을 함께 보존한다.

수정 소스는 `f6739b0a5da2986cbe33d028ea8fcd3468d85012`, 트리는 `48474119d3ed2289adf637c4742d73e5670b1ef9`로 게시되었다. 부모는 첫 실패 소스 `a3bd5b2fd110ca90b9c86b6b4c7b6bd6af9c4837`다. 일반 CI `40626529470`, Hallmark `40626529492`, ETH 실행 `40626529467`의 완료·성공을 확인했다. ETH 산출물은 다운로드한 원본으로 다시 검증했고, 그 보관 출력의 수동 원격 게시와 트리 대조도 완료했다. [수정 소스 게시 증거](eth-candidate-evidence/20261028-continuity/corrective-source-publication.json), [첫 ETH 실행 영수증](eth-candidate-evidence/20261028-continuity/eth-first-run-result.json)

### 실제 완료한 일반 CI

[일반 CI 실행 40626529470](https://github.com/twoimo/bitcoin-cycle-atlas/actions/runs/40626529470), 작업 `122612656555`는 2026-10-28 **12:28:06 한국시간**에 성공으로 완료했다. 실제 checkout은 PR의 합성 merge `97483895600dfcae75e0c2c079bf45a519a24bb7`, 트리 `2a1cbe8a3a6309cd8079b5f900c5eefc9f10c8c4`다. 부모는 `5dd11c99faa1fe4a1a9adf56bc4775d35c9a41e4`와 수정 소스 `f6739b0a5da2986cbe33d028ea8fcd3468d85012`다. 실제 checkout 로그와 GitHub commit API를 대조한 결과를 보존한다. [일반 CI 최종 영수증](eth-candidate-evidence/20261028-continuity/ci-source-result.json)

| 일반 CI 항목 | 실제 결과 |
|---|---|
| `node --test tests/*.test.mjs` | **1,823개 통과**, 실패·취소·건너뜀·todo 모두 0 |
| 전체 테스트 시간 | 116,671.175384 ms |
| 별도 formal 구현 검사 | 28/28; 위 전체 테스트 수에 더하지 않음 |
| 시스템 수치 assertion | 318,010 |
| 의도적으로 잘못 바꾼 대조군 | 16/16을 지정한 assertion에서 거부 |
| 보존 예측 재실행·treasury·경로·정적 자원 단계 | 실제 워크플로 단계 모두 success |

검사 수는 그 실행의 실제 명령과 출력에 속한다. 로컬 31개·24개나 별도 28개를 1,823개에 다시 합산하지 않는다. 이 일반 CI 성공으로 일일 예약 활성화나 원격 데이터 게시, 성숙한 전향 결과를 완료 처리하지 않는다.

### 실제 완료한 Hallmark

[Hallmark 실행 40626529492](https://github.com/twoimo/bitcoin-cycle-atlas/actions/runs/40626529492), 작업 `122612656270`은 2026-10-28 **12:27:43 한국시간**에 성공으로 완료했다. 실제 checkout은 직접 PR head `f6739b0a5da2986cbe33d028ea8fcd3468d85012`이고, 고정 비교 기준은 `0c1ed40e1b9b6c76f5621d087737dc57f174b51e`다. 현재·기준 소스를 읽기 전용으로 검사했으며 Git blob 일치와 실제 render 실행을 확인했다. [Hallmark 최종 영수증](eth-candidate-evidence/20261028-continuity/hallmark-source-result.json)

| 검사 단계 | FAIL | REFLEX | WARN | 실제 render |
|---|---:|---:|---:|---|
| 고정 기준 정적 | 1,214 | 1,347 | 37 | 정적 검사 |
| 고정 기준 화면 | 53 | 211 | 13 | 실행됨 |
| 현재 정적 | **0** | **0** | **36** | 정적 검사 |
| 현재 화면 | **0** | **0** | **17** | 실행됨 |

design gate와 integrity gate는 모두 pass이며 integrity 오류는 0이다. 기준과 현재의 8개 경로가 모두 ready였고, render 단계 영수증은 각각 40개 PNG를 기록했다. 소요 시간은 149,663 ms다. 이 수치는 고정 디자인 기준과 현재 소스의 비교 결과이며, 이번 보관 변경으로 새로 발생한 디자인 개선량으로 해석하지 않는다.

**WARN은 그대로 남는다.** 현재 정적 WARN 36개와 화면 WARN 17개를 0으로 바꾸지 않는다. 원래 `kept` 출력도 링크 30/30, 입력 72/72와 함께 제목 52/54, 그림 209/210을 기록하며 `WARN kept` 2개를 포함한다. 영수증의 원래 진단을 보존하고, 0 FAIL/0 REFLEX를 모든 경고의 해소로 확대하지 않는다. 이 Hallmark 결과는 아래 ETH native-browser 산출물의 후속 검증과 구분한다.

### 완료한 원격 결과와 각각의 실행 범위

| 증거 | 확인한 실제 결과 | 남는 구분 |
|---|---|---|
| 수정 구현 소스 | `f6739b0a...` / `48474119...`, 실패 소스 `a3bd5b2f...`의 자식 | 이 구현 소스와 문서 후속 커밋을 구분 |
| 일반 CI | `40626529470` success, 1,823/1,823 | 실제 합성 merge `9748389560...` |
| Hallmark | `40626529492` success, 현재 0 FAIL / 0 REFLEX·integrity 0 | 정적 36 / render 17 WARN 보존 |
| 첫 ETH 실행 | `40626529467`, 작업 `122612657695` success | 38개 단계 success. 원시 작업 로그의 정확한 집중 검사 수·checkout 행은 미확보 |
| 첫 ETH 산출물 | ZIP 61,175,599바이트·849파일, CRC·경로·해시 검증 | 원격 API 출처와 산출물 원본을 함께 결합 |
| 예측·관측·보관 | 새 기록 3개·새 관측 1개, 전체 6개 기록·6개 관측, 4세대 | 원래 세 기록과 초기 보관의 38개 불변 파일 동일 |
| 보정 준비도 | 9개 결합 모두 성숙 사례 부족, 준비 0·동결 0 | 전체 원본에서 계산을 다시 수행 |
| 용량 진단 | 실제 6개 기록·6개 관측·2개 원점에 결합 | 보고서 ID·원본·소스·목록 대조. 산술 전체를 별도 재실행한 검증은 아님 |
| ETH native browser | 35/35·181 PNG, runtime 0, 원시 resource 15·예상 BTC 15·unexpected 0 | PNG 전수 해시·목록 대조. 모든 화면을 사람이 별도로 시각 검수했다는 주장은 하지 않음 |
| 검토 source book | 444개 시작 입력·631 frame·434 part·77,953,226바이트 | 미해결 import 0, 모든 frame과 source Git blob 대조 |
| 수동 데이터 게시 | 첫 `8f169b18...` 53파일·7,048,545바이트, 최신 `f42a4bf7...` 63파일·8,180,885바이트 | 두 트리 재조회 일치. 자동 게시기는 미실행 |
| 두 번째 실행의 원격 복원 | `c17be870...`, ETH `40628133773`에서 정확한 `8f169b18...` 복원 완료 | 같은 UTC일의 두 PR 실행. 5세대로 추가·재검증 완료; 자동 게시·예약 활성화로 확대하지 않음 |

최초 실패를 원인과 함께 보존했고 수정 후 별도 소스의 결과로 구분했다. 이전 `15b5f651` 또는 `4bf84ce3`의 검사 수를 이번 소스 결과로 복사하지 않았다.

## 9. 첫 실제 ETH 실행, 재검증과 수동 데이터 게시

### 9.1 실행과 ZIP의 출처

[ETH 실행 40626529467](https://github.com/twoimo/bitcoin-cycle-atlas/actions/runs/40626529467), 작업 `122612657695`는 2026-10-28 **12:34:45 한국시간**(`2026-10-28T03:34:45Z`)에 성공으로 완료했다. API의 직접 head는 수정 소스 `f6739b0a5da2986cbe33d028ea8fcd3468d85012`이고 작업의 38개 단계가 모두 success다. 원시 작업 로그 조회는 세 차례 `Transport closed`로 실패해 **정확한 집중 검사 수, 원시 checkout 행, 상세 실행 표식은 미확보**로 남긴다. 이 수치는 이전 실행이나 소스의 테스트 목록에서 추정하지 않는다. 직접 소스 결합은 API의 커밋·트리 대조와 아래 source book의 원본 바이트로 확인했다. [실행 영수증](eth-candidate-evidence/20261028-continuity/eth-first-run-result.json), [로그 접근 결과](eth-candidate-evidence/20261028-continuity/eth-first-run-log-access.txt)

| 다운로드 항목 | 실제 값 |
|---|---|
| 산출물 ID | `12790530197` |
| ZIP 크기 | **61,175,599바이트** |
| ZIP SHA-256 | `75b0c16efbe9261f4f755f788ca6bce2e4b7a8c5f79021fac07f11ef8026648d` |
| 추출 파일·바이트 | **849개·234,810,377바이트** |
| 검사 | GitHub digest 일치, 전체 CRC, 안전한 경로, 중복·심볼릭 링크 거부 |
| 산출물 만료 시각 | `2026-11-27T03:34:35Z` |

[다운로드 무결성 영수증](eth-candidate-evidence/20261028-continuity/first-artifact-download-integrity.json)이 ZIP과 추출 경로 검사를 기록한다. 별도의 [산출물 재검증 영수증](eth-candidate-evidence/20261028-continuity/first-artifact-verification.json)은 추출된 원본에서 source book·이미지·보관·재실행·보정 준비도를 다시 검사한다. 두 증거의 역할을 구분한다.

### 9.2 source book과 실제 브라우저 출력

source book은 **444개 시작 입력**, **631개 frame**, **434개 부분 파일**, **77,953,226바이트**다. 전체 SHA-256은 `43d0b3da3b28dd78985294fe077028ee6db3165bae59b6945d0dd1d212960dc1`이며 85,000,000바이트 한도 안에 있다. 434개 부분 파일을 원래 순서대로 합친 바이트·SHA-256을 검사하고, 448개 커밋 입력 frame은 정확한 원격 트리의 Git blob·크기와, 183개 실행 입력 frame은 실제 추출 파일과 대조했다. 미해결 import는 0개다. 이 오프라인 검증은 부모 작업이 GitHub에서 확인한 commit→tree 매핑을 입력으로 받아 그 트리에 바이트를 결합한다. 독자적으로 원격 계정이나 공급자를 인증한 것으로 확대하지 않는다. [source manifest](eth-candidate-evidence/20261028-continuity/first-run/eth-review-packet/source-manifest.json), [원본 재검증](eth-candidate-evidence/20261028-continuity/first-artifact-verification.json)

부분 로컬 checkout에 빠진 `dist/data/asset-forecast-ledger/index.json` 때문에 첫 보조 검증 시도가 멈췄다. 저장소·산출물을 바꾸지 않고, 이미 검증한 source book 안에서 **예상 원격 Git blob·크기·모드가 모두 일치하는 동일 바이트**를 찾아 사용하는 방식으로 보조 검증기만 보완했다. 실제 파일은 7,826바이트, SHA-256 `2620f75f54b9755f417296348a4e31e14d584c338bcd2b67b0ac15c2c59bbe62`, Git blob `13e32cb0de2f7f132a4ecd250f6a8825e679520e`다. 최종 검증은 `2026-10-28T03:37:28.584Z`부터 `03:37:41.528Z`까지 12.944초에 종료 코드 0으로 완료했다. 어떤 바이트를 사용했는지는 재검증 영수증의 `additionalCommittedInputBytesUsed`에 남긴다.

브라우저 보고서는 **35/35개 사례·181개 PNG**다. 실제 PNG 파일 전부를 보고서와 일대일로 대조하고 크기·SHA-256을 확인했다. runtime 오류는 0개, 원시 resource 오류는 15개다. 그 15개 모두 기존 `isExpectedOfflineBtcRefresh` 정책과 실제 요청·frame·실패 표시·재시도·이전 아카이브 유지 증거에 맞는 BTC 오프라인 차단이며, unexpected resource 오류는 0개다. 원시 15개를 삭제하거나 원시 오류 0개로 표현하지 않는다. 선택적인 font 차단 41개는 별도 항목이다. 기존 정책의 실제 결과를 대조한 검증이며, 여기서 새로운 허용 조건을 추가하지 않았다. [실제 browser 보고서](eth-candidate-evidence/20261028-continuity/first-run/eth-browser/report.json)

패키지의 일반적인 `externalReview: pending` 표시는 사용자 요청으로 생략한 Gemini 두 검토를 다시 필수화하지 않는다. 이 작업의 실제 검토 상태는 계속 `omitted-by-user`다.

### 9.3 초기 보관 복원, 새 기록과 4세대의 실제 내용

첫 원격 읽기 영수증의 상태는 명시적인 **`absent`**다. 고정 저장소와 정확한 데이터 브랜치를 확인하는 REST 요청 2회·수신 5,486바이트, 재시도·redirect 0회이며 Git pack 전송은 발생하지 않았다. 예상 head·tree·manifest는 모두 null이다. 따라서 이 실행의 정확한 이전 세대는 커밋된 3세대 초기 보관 `c65342e2...`였다. [원격 읽기](eth-candidate-evidence/20261028-continuity/first-run/ethereum-prospective-archive-remote-receipt.json), [복원](eth-candidate-evidence/20261028-continuity/first-run/ethereum-prospective-archive-restore.json)

| 항목 | 복원한 3세대 | 새 4세대 |
|---|---:|---:|
| 전체 보관 파일 | 39 | **53** |
| 논리 파일 | 36 | **50** |
| 원본 객체 | 32 | **44** |
| 페이지 | 3 | **4** |
| 발행 기록 | 3 | **6** |
| 전향 관측 | 4 | **5** |
| 독립 ETH 결과 관측 | 1 | **1** |
| 전체 관측 | 5 | **6** |
| 원본 객체 바이트 | 5,662,730 | **7,023,649** |
| 메타데이터 바이트 | 17,852 | **24,896** |
| 전체 바이트 | 5,680,582 | **7,048,545** |

4세대 ID는 `267bb2e1a6768988427d2485d32964a4fcba64be5a10e42ad8b027c758ba4ee2`이고, 부모는 정확한 3세대 ID다. 초기 보관의 불변 파일 **38개**는 모두 같은 바이트로 남으며 현재 manifest 별칭만 새 세대를 가리킨다. 새 불변 파일 14개는 객체 12개·페이지 1개·manifest 1개다. 현재 전체에서 부모 세대에 속하는 정확한 파일 집합을 따로 재구성해 코어 검증을 다시 통과시켰다. 전체 계보의 참조 완결성도 검사했다. [추가 영수증](eth-candidate-evidence/20261028-continuity/first-run/ethereum-prospective-archive-append.json), [재복원 검증](eth-candidate-evidence/20261028-continuity/first-run/ethereum-prospective-archive-verify.json), [불변 4세대 manifest](https://github.com/twoimo/bitcoin-cycle-atlas/blob/8f169b18a2eeec70fe9e57eed5bdb154e9dad3bc/manifest.json)

새 예측의 원점은 `2026-10-27`, 실제 발행 시각은 모두 `2026-10-28T03:30:08.669Z`다. 발행기는 새 기록 3개·기존 재사용 0개·전체 6개를 보고했다.

| 모델 | 새 기록 ID | 원본 객체 |
|---|---|---|
| adaptive | `4ee24d06bd335abf986985cde903ef750f243adb063b78d43d2a84256a3c91bd` | [정확한 원본 바이트](https://github.com/twoimo/bitcoin-cycle-atlas/blob/8f169b18a2eeec70fe9e57eed5bdb154e9dad3bc/objects/5164b1d4f7d6cb79cfc3c5a224992e22ea987c69bd86709ed5f52c60a3974628.blob) |
| pooled | `2993a2864880b3480a6c50490092c8e3874a7a6473aa89bb76b598d9797c6a40` | [정확한 원본 바이트](https://github.com/twoimo/bitcoin-cycle-atlas/blob/8f169b18a2eeec70fe9e57eed5bdb154e9dad3bc/objects/1c7af354bbbc40f052405bf88373d92f46078624271bd0db9ab3d85feca3ee25.blob) |
| warmStart | `a8b4da2a30949175cae99330cdf054b3cb41677116df66e6a777cf079f76e14a` | [정확한 원본 바이트](https://github.com/twoimo/bitcoin-cycle-atlas/blob/8f169b18a2eeec70fe9e57eed5bdb154e9dad3bc/objects/49fa763edef44b63285fac140b1407f687445f9ee156f842df8b43e5c742d220.blob) |

새 관측 ID는 `0da301019d62a8a0c2d55af377176eb6bd540dc70d16e364305a3ec224c30a08`, 정보 마감 시각은 `2026-10-28T03:30:08.306Z`다. 원본은 1,084,207바이트, SHA-256 `863aea98e380eff8d96d5c28cde95f7c7bff186280374a632c55c0b2409fc15f`이며 같은 바이트가 입력 스냅숏과 관측의 두 논리 경로에 연결된다. [새 관측 원본](https://github.com/twoimo/bitcoin-cycle-atlas/blob/8f169b18a2eeec70fe9e57eed5bdb154e9dad3bc/objects/863aea98e380eff8d96d5c28cde95f7c7bff186280374a632c55c0b2409fc15f.blob)

기존 3개와 새 3개, **전체 6개 기록**을 각자의 보존 base·tail 및 모델 소스로 다시 실행해 원본 기록과 동일함을 확인했다. 각 기록은 731점이며 원래 세 기록의 ID·issuedAt·14/14/17개 그래프는 그대로다. 새 관측 수와 경제적으로 독립된 성숙 사례 수는 구분한다. 이번 목록에는 두 실제 원점이 있지만 아직 성숙 결과는 없다. [전수 재실행·입력 검증](eth-candidate-evidence/20261028-continuity/first-artifact-verification.json)

### 9.4 실제 보정 준비도와 조건부 용량 진단

보정 준비도 ID는 `035619ae4fda78633865ebac371353a069036b43bf2f583433734c642c68c7f2`, 정보 마감 시각은 `2026-10-28T03:30:17.997Z`다. 전체 기록 6개·관측 6개를 사용해 3개 모형 × 30·90·180일의 **9개 결합**을 다시 계산했다. 모두 `insufficient-calibration-cases`, 선택 사례 0개·유효 선택 정답 0개·필요 사례 12개·미성숙 기록 2개이며 `logRadius:null`이다. 선택된 정답의 누락, 무효 예측, 무효 관측도 각각 0개지만 아직 선택 가능한 성숙 사례가 없다는 뜻이다. 실제 보정 동결 **0개**, 보정 후 발행 **0개**, 보정 타깃 평가 **0개**다. [실제 준비도 원본](eth-candidate-evidence/20261028-continuity/first-run/ethereum-prospective-calibration-readiness.json), [전체 입력 재계산](eth-candidate-evidence/20261028-continuity/first-artifact-verification.json)

용량 진단 ID는 `e8dfa5b7f2ecc7f3db5d4bd0b724047f837a4a73e222346e6cb6e6cc05cfbaed`, 정보 마감 시각은 `2026-10-28T03:30:23.299Z`다. 실제 목록은 기록 6개·관측 6개·원점 2개·정확한 실험 3개이며, 현재 합친 compact 인덱스는 3,874바이트다. 아래 값은 **진단에 명시한 조건이 계속된다는 가정**에서 나온다. 산출물 검증은 보고서 ID, 입력·소스의 정확한 바이트와 전체 ID 목록을 확인했으며 용량 산술 전체를 별도로 다시 실행한 것은 아니다. [실제 용량 진단](eth-candidate-evidence/20261028-continuity/first-run/ethereum-prospective-capacity.json)

| 조건부 가정 | 현재 진단의 결과 |
|---|---|
| 동일한 세 실험을 매일 한 원점씩 추가 | 인덱스 1일 증가 1,903바이트; 548개 추가 원점일 안에서 인덱스 한도, 첫 초과 원점 `2028-04-28` |
| 기록 수만 고려한 같은 추가 | 664개 추가 원점일 안에서 2,000개 한도, 첫 초과 원점 `2028-08-22` |
| 전향 관측 하루 1개, 독립 관측 추가 0개 | 494개 추가 수집일 안에서 500개 한도, 첫 초과 수집일 `2028-03-06` |
| 보존된 당일 최다 횟수인 하루 4개를 반복, 독립 관측 추가 0개 | 123개 추가 수집일 안에서 한도, 첫 초과 수집일 `2027-03-01` |
| 현재 기준 가격 바이트를 계속 유지 | 마지막 허용 요청일 `2027-08-05`, 첫 거부 요청일 `2027-08-06`; 자동 기준 교체 미구현 |

이 빈도는 미래 운영 약속이나 완전한 과거 수집 주기의 증명이 아니다. 수정 판본·추가 공백·독립 관측·다른 제약은 더 일찍 한도에 도달하게 할 수 있다. 12개 비중첩 창의 조건부 달력은 30일 `2027-10-22T00:00:00Z`, 90일 `2029-10-11T00:00:00Z`, 180일 `2032-09-25T00:00:00Z`를 가장 이른 성숙 시점으로 제시하지만 실제 성숙 창은 0개이고 뒤의 11개 원점은 미래 가정이다. 현재 한도를 넘어서도 최초 선택 창을 보존할 운영 계약이 필요한 이유다.

### 9.5 이번 실제 경제 관측이 채우지 못한 조건

완전한 경제 스냅숏은 **0개**, 적격 스냅숏도 **0개**이며 요구 지표는 26개다. 관련 관측이 있는 지표 10개, 정의가 일치하는 부분 지표 1개, 정의와 실제 가용 시각을 함께 충족한 지표 0개, 미관측 지표 16개, 범위 불일치 지표 10개라는 분류는 서로 겹치는 차원이다. 합산해서 26개를 넘는 수집 성공으로 만들지 않는다. [실제 모형 준비도](eth-candidate-evidence/20261028-continuity/first-run/ethereum-model-readiness.json)

고정된 validator 8개 상태는 slot **15,527,776**, epoch **485,243**, 상태 관측 시각 `2026-10-28T03:15:35.000Z`, 실제 수집 시각 `2026-10-28T03:29:27.607Z`다. actual balance는 **242.20549934 ETH**, effective balance는 **234 ETH**, 상태는 active 7개·`withdrawal_done` 1개다. 이 한 시점의 잔액 또는 이전 상태와의 잔액 차이를 획득 수익이나 시간 가중 원금으로 쓰지 않는다. header 해시 대조는 전체 validator membership·서명·독립 finality 인증을 대신하지 않는다. [실제 코호트 영수증](eth-candidate-evidence/20261028-continuity/first-run/ethereum-staking-cohort/receipt.json)

공급 관측은 **225개 × 960 slot**의 공급자 버킷이다. 이번 수집의 버킷 시작·row label 나머지는 각각 **704·703**이고, 함께 보존한 이전 수집은 **576·575**이고 요청한 정확한 UTC 시작·종료 stock이 모두 없다. 요청한 28일 구간을 가로지르는 두 경계 버킷 때문에 전체 슬롯의 포함 범위를 확보해도 그 UTC 구간만의 flow·stock 정산을 완료할 수 없다. 버킷 원본의 endpoint 산술과 두 수집 해상도 진단은 원본에서 다시 재현했지만, 이를 독립적인 정확한 28 UTC일 공급 정산으로 승격하지 않는다. [실제 공급 해상도 보고서](eth-candidate-evidence/20261028-continuity/first-run/ethereum-supply-resolution.json)

### 9.6 실제 수동 게시와 다음 실행의 검증 경계

첫 실제 보관 53개 파일은 **수동 GitHub 연결 게시**로 `refs/heads/eth-prospective-archive`에 보존했다. 확인 시각은 `2026-10-28T03:39:54.513Z`다. 보관 코어 검증, 모든 산출물 바이트의 재해시, 초기 시드와 정확한 이전 불변 바이트의 유지, 원래 발행 시각 보존을 확인한 뒤 게시 결과의 정확한 트리를 다시 읽어 대조했다. [게시 감사 영수증](eth-candidate-evidence/20261028-continuity/manual-first-publication.json)

| 게시 항목 | 실제 값 |
|---|---|
| 데이터 커밋 | [`8f169b18a2eeec70fe9e57eed5bdb154e9dad3bc`](https://github.com/twoimo/bitcoin-cycle-atlas/commit/8f169b18a2eeec70fe9e57eed5bdb154e9dad3bc) |
| 데이터 트리 | `2f69764587c2e5fcc7d5d29991fcee3bac3bb569` |
| 유일한 부모 | `f6739b0a5da2986cbe33d028ea8fcd3468d85012` |
| 정확한 입력 시드 트리 | `3eb353933f57e63bc99067e7891fe29f54d2bc95` |
| 게시한 manifest | `267bb2e1a6768988427d2485d32964a4fcba64be5a10e42ad8b027c758ba4ee2` |
| 파일·총 바이트 | **53개·7,048,545바이트** |
| 파일 목록 SHA-256 | `25302ffca34c667376390af40f238ba5602c7d4b22d60124527359aae955d96c` |
| 원격 트리 재조회 일치 | `true` |
| 자동 게시기 실행 | **`false`** |

전체 현재 보관 원본은 위 불변 데이터 커밋으로 연결하며 문서 폴더에 두 번째 전체 사본을 만들지 않는다. 영수증의 `networkRequests:0`, `remoteWrites:0`은 오프라인 감사 도움 함수의 부수 효과 수다. 실제 수동 게시가 없었다는 수치가 아니며, 게시 API의 실제 요청 수를 측정한 값으로 사용하지 않는다.

이 증거를 먼저 보존한 문서 후속 커밋은 `c17be870193a535860e95f41bbb6b0239fd4c22a`, 트리는 `c525621d117d4727e4efd41b894021d2181ac4b6`, 부모는 `f6739b0a...`다. 문서·증거 4개 경로만 바꾸었고 구현 파일은 0개 변경, `dist`의 713개 blob은 유지했다. 이 후속 소스의 [ETH 실행 40628133773](https://github.com/twoimo/bitcoin-cycle-atlas/actions/runs/40628133773)가 게시된 원격 4세대를 실제로 읽고 복원·추가했다. 아래 10절은 두 번째 실행에서 확보한 별도 산출물 검증 결과다. 읽기 전용 PR 실행의 성공과 기본 브랜치 예약 활성화·자동 게시기 실행은 구분한다.

## 10. 두 번째 실제 실행: 게시된 원격 원본의 복원과 5세대 추가

### 10.1 문서 후속 소스의 별도 CI와 Hallmark

후속 소스는 `c17be870193a535860e95f41bbb6b0239fd4c22a`, 트리는 `c525621d117d4727e4efd41b894021d2181ac4b6`다. 첫 소스의 성공을 이 후속 소스의 결과로 복사하지 않고, 각 실행의 실제 영수증을 별도로 확인했다.

| 검사 | 실제 실행·checkout | 결과 |
|---|---|---|
| 일반 CI | [40628133630](https://github.com/twoimo/bitcoin-cycle-atlas/actions/runs/40628133630), 작업 `122617888365`; 합성 merge `34d00b05b826e171bab926d06440b73e51736a65`, tree `87e9701b93c8acae6178c05bb5969a7f7ecfa7dd` | **1,823/1,823**, 실패·취소·건너뜀·todo 0; 114,812.943307 ms |
| 추가 수치·대조 검사 | 같은 일반 CI의 실제 출력 | 수치 assertion **318,010**, 음성 대조 **16/16**; 별도 formal **28/28**은 전체 수에 합산하지 않음 |
| Hallmark | [40628133593](https://github.com/twoimo/bitcoin-cycle-atlas/actions/runs/40628133593), 작업 `122617888419`; 직접 head `c17be870...` | 현재 정적·render 각각 **0 FAIL / 0 REFLEX**, integrity 오류 0; **WARN 36/17 유지** |
| 실제 render | 고정 baseline `0c1ed40e...`와 현재 소스 | 각각 8개 경로 ready·40개 PNG, 읽기 전용 Git blob 대조, 119,296 ms |

일반 CI는 `2026-10-28T03:44:56Z`, Hallmark 작업은 `03:43:59Z`에 완료했다. 합성 merge의 부모는 `5dd11c99faa1fe4a1a9adf56bc4775d35c9a41e4`와 `c17be870...`다. 기준·현재의 WARN과 `kept` 원문을 유지하며, 두 소스의 1,823개 검사를 하나의 고유 검사 수로 합산하지 않는다. [두 번째 일반 CI 영수증](eth-candidate-evidence/20261028-continuity/ci-second-result.json), [두 번째 Hallmark 영수증](eth-candidate-evidence/20261028-continuity/hallmark-second-result.json)

### 10.2 두 번째 ZIP·source book·브라우저 검증

[ETH 실행 40628133773](https://github.com/twoimo/bitcoin-cycle-atlas/actions/runs/40628133773), 작업 `122617888883`는 `2026-10-28T03:49:04Z`, 한국시간 **12:49:04**에 성공했다. 실제 38개 단계가 success다. 원시 작업 로그는 두 차례 접근이 실패해 정확한 집중 검사 수·checkout 행은 이번 실행에서도 미확보다. 아래 원격 읽기·복원 결과는 단계 이름이나 성공 표지만으로 추론하지 않고 **실제 산출물의 원본과 영수증**을 검증했다. [두 번째 실행 영수증](eth-candidate-evidence/20261028-continuity/eth-second-run-result.json), [로그 접근 기록](eth-candidate-evidence/20261028-continuity/eth-second-run-log-access.txt)

| 항목 | 두 번째 실행의 실제 값 |
|---|---|
| 산출물 ID | `12790338394` |
| ZIP | **61,901,496바이트**, SHA-256 `428ec5d34f5748af1eda6638841d59b56bc2e708c51560d36d7b7bac384d3803` |
| 안전하게 추출한 파일 | **870개·239,125,971바이트**, GitHub digest·CRC·경로·중복·심볼릭 링크 검사 통과 |
| source book | **444개 시작 입력·642 frame·439 part·79,019,126바이트** |
| source book SHA-256 | `7bed92a08cad754b0f101b6365e78493b86ca71342922ab773146d2260b143b6` |
| frame 대조 | 커밋 입력 448개·실행 입력 194개 전부 일치, 미해결 import 0 |
| browser | **35/35·181 PNG**, 전수 목록·바이트·해시 대조 |
| 오류 구분 | runtime 0, 원시 resource **15**, 기존 정책에 맞는 예상 BTC 차단 **15**, unexpected **0**, 별도 font 차단 41 |
| 산출물 만료 시각 | `2026-11-27T03:48:55Z` |

같은 보조 검증기를 변경 없이 사용해 `2026-10-28T03:50:50.197Z`부터 `03:51:10.371Z`까지 **20.174초**, 종료 코드 0으로 확인했다. source book의 부분 합치기, 모든 frame의 정확한 원본 바이트, 공급받은 완전한 source tree의 Git blob, PNG, 원격 보관 계보, 모델 재실행, 전체 입력 보정 준비도를 함께 대조했다. [두 번째 다운로드 무결성](eth-candidate-evidence/20261028-continuity/second-artifact-download-integrity.json), [두 번째 산출물 재검증](eth-candidate-evidence/20261028-continuity/second-artifact-verification.json)

### 10.3 실제로 읽은 원격 4세대

두 번째 원격 읽기 상태는 **`restored`**다. receipt ID는 `bdfbad86d90f9abe7e547e582edf1e8a003f140aa6153f4640faeaff2d43dbea`이며, 정확한 head는 `8f169b18a2eeec70fe9e57eed5bdb154e9dad3bc`, tree는 `2f69764587c2e5fcc7d5d29991fcee3bac3bb569`, manifest는 `267bb2e1a6768988427d2485d32964a4fcba64be5a10e42ad8b027c758ba4ee2`다. 복원한 **53개 파일·7,048,545바이트** 전체가 해당 Git 객체와 일치한다. 현재 결과에서 부모 4세대의 도달 가능한 정확한 manifest·페이지·객체만 따로 재구성해 코어 검증을 독립적으로 수행했고, 원격 영수증의 트리·파일 목록을 그 부모 파일 집합과 대조했다. [실제 원격 읽기](eth-candidate-evidence/20261028-continuity/second-run/ethereum-prospective-archive-remote-receipt.json), [복원 영수증](eth-candidate-evidence/20261028-continuity/second-run/ethereum-prospective-archive-restore.json), [원본 재검증](eth-candidate-evidence/20261028-continuity/second-artifact-verification.json)

실제 전송은 REST **3회·18,308바이트**와 별도의 Git fetch **1회**다. Git은 체크아웃 없이 고정 커밋을 가져왔고, 52개 고유 blob·디코딩 바이트 7,046,593을 확인했다. 같은 manifest 원본을 별칭에서도 사용하는 파일 중복 때문에 고유 blob 수와 논리 전송 파일 수는 다르다. API 트리와 모든 blob 해시가 일치했고 hooks·자격 증명 영속화는 사용하지 않았다. **Git HTTP 요청 수와 wire 바이트는 계속 null**이다. REST의 측정값을 Git까지 포함한 전송 총량으로 바꾸지 않는다.

이 결과는 첫 실행의 `absent → committed seed`와 구분되는 실제 **게시된 원격 세대 → 다음 PR 실행 복원**의 증거다. 두 실행은 같은 UTC일인 2026-10-28에 이루어졌다. 다음 날 예약 실행이나 활성화된 일일 작업이 수행되었다는 증거로 확대하지 않는다.

### 10.4 같은 원점의 기록 재사용과 새 관측

두 번째 발행기는 **새 기록 0개·기존 기록 재사용 3개·전체 기록 6개**다. 원점은 여전히 `2026-10-27`이고, 원래 발행 시각 `2026-10-28T03:30:08.669Z`를 유지했다. 같은 예측을 두 번째 작업 시각으로 다시 발행하거나 새 독립 예측으로 세지 않았다. 기존 세 기록과 첫 실행에서 추가한 세 기록 모두 각 보존 입력에서 다시 실행해 동일성을 확인했다.

새 관측은 하나다. ID `e53a5bb79051e738846ec3bb01ce89e1140c4e64c7bad2217bb217b76b7d4f9a`, 정보 마감 시각 `2026-10-28T03:44:50.411Z`, 원점 `2026-10-27`, 원본 **1,084,206바이트**, SHA-256 `71d0f49545ed665fd18f42f2f74d8d49c79c1f48e3bd54ad02b7bda84c298fdb`, Git blob `4731f31eea533c3b281e92796868edef08ef3d65`다. 별도의 실제 수집 판본으로 남기면서 기존 예측의 입력 스냅숏을 바꾸지 않았다. [최신 관측의 불변 원본](https://github.com/twoimo/bitcoin-cycle-atlas/blob/f42a4bf7662ae73987b23d117620dc9fda4a86ac/objects/71d0f49545ed665fd18f42f2f74d8d49c79c1f48e3bd54ad02b7bda84c298fdb.blob) [추가·재복원 영수증](eth-candidate-evidence/20261028-continuity/second-run/ethereum-prospective-archive-append.json), [전체 검증](eth-candidate-evidence/20261028-continuity/second-run/ethereum-prospective-archive-verify.json)

| 항목 | 읽어 복원한 4세대 | 추가한 5세대 |
|---|---:|---:|
| 전체 보관 파일 | 53 | **63** |
| 논리 파일 | 50 | **59** |
| 원본 객체 | 44 | **52** |
| 페이지 | 4 | **5** |
| 발행 기록 | 6 | **6** |
| 전향 관측·독립 ETH 관측 | 5 + 1 | **6 + 1** |
| 전체 관측 | 6 | **7** |
| 원본 객체 바이트 | 7,023,649 | **8,150,282** |
| 메타데이터 바이트 | 24,896 | **30,603** |
| 전체 바이트 | 7,048,545 | **8,180,885** |

5세대 manifest ID는 `0a9101ef1a31dce01bfd8c92dfe9e50627fe2b914c0c20529e7f0f58068178c4`, 생성 시각은 `2026-10-28T03:45:04.162Z`다. 부모는 정확한 4세대 ID다. 이전의 **52개 불변 파일**을 모두 보존하고 객체 8개·페이지 1개·manifest 1개, 합계 10개를 추가했으며 현재 별칭만 바꿨다. 초기 3세대의 불변 파일 38개와 그 안의 원래 기록도 그대로 남는다.

### 10.5 최신 준비도와 용량의 변화

최신 준비도 ID는 `14976e2991f1a55305eddcc06ea020e57c6e33b94a024173d37c7793c312acf8`, 정보 마감 시각은 `2026-10-28T03:44:56.483Z`다. 기록 **6개·관측 7개**의 전체 입력을 재계산했다. 9개 결합 모두 성숙 사례 부족, 선택·유효 사례 0개·필요 12개·미성숙 기록 2개·`logRadius:null`이며, 준비·동결·보정 후 발행·타깃 평가도 각각 0개다. 원점은 여전히 두 개이므로 한 번 더 수집한 관측을 새 독립 성숙 사례로 세지 않는다. [최신 준비도](eth-candidate-evidence/20261028-continuity/second-run/ethereum-prospective-calibration-readiness.json)

최신 용량 진단 ID는 `85b9dd4f50870e561bced3d754aaff138c68646f38a329d0095d74e504a34ad4`, 정보 마감 시각은 `2026-10-28T03:44:59.879Z`다. 전체 입력·소스·ID 목록을 대조한 보고서이며 산술 전체의 독립 재실행을 주장하지 않는다. 관측 한 개가 더 쌓여 하루 한 개 추가 가정의 여유는 **493일**, 첫 초과일은 **2028-03-05**로 바뀌었다. 하루 네 개 가정은 **123일·2027-03-01**이며, 기록·인덱스·기준 가격과 최초 12개 창의 조건부 달력은 첫 실행 진단과 같다. 현재 인덱스는 3,874바이트다. 이 진단의 workflow 정의 검사에서 `automaticPriorRunRestoreProven:false`인 값은 정의만 읽은 검사의 범위를 뜻한다. 실제 원격 복원 완료는 별도 실행 영수증으로 위에서 입증했으며, 진단 원문의 값을 수정하지 않는다. [최신 용량 원본](eth-candidate-evidence/20261028-continuity/second-run/ethereum-prospective-capacity.json)

경제 입력의 완전한·적격 스냅숏은 여전히 **0개**, 요구 지표 26개이며 정의·가용 시각을 함께 충족한 지표도 0개다. 최신 세부 staking/supply 관측은 첫 실행 수치를 복사하지 않고 두 번째 원본 영수증으로 구분했다. [최신 모형 준비도](eth-candidate-evidence/20261028-continuity/second-run/ethereum-model-readiness.json)

두 번째 고정 코호트 상태는 slot **15,527,840**, epoch **485,245**, 관측 시각 `2026-10-28T03:28:23.000Z`, 실제 수집 시각 `2026-10-28T03:44:20.570Z`다. actual balance **242.205619346 ETH**, effective balance **234 ETH**, active 7개와 `withdrawal_done` 1개를 관측했다. 원시 genesis·header·validator 응답은 합계 **4,611바이트**다. 첫 실행과의 잔액 차이는 원금 이동·보상·벌점·비용을 분리한 수익 자료가 아니므로 획득 수익으로 계산하지 않았다. [두 번째 코호트 영수증](eth-candidate-evidence/20261028-continuity/second-run/ethereum-staking-cohort/receipt.json)

두 번째 공급 원본은 **801,519바이트·225개 × 960 slot**, 실제 수집 시각 `2026-10-28T03:44:19.768Z`, 공급자 생성 시각 `2026-10-28T03:39:50.000Z`다. row label은 960으로 나눈 나머지 **767**, 32로 나눈 나머지 **31**이며, 인접 224쌍의 공급자 산술은 모두 일치했다. 하지만 요청한 시작·끝 stock은 여전히 없고 경계를 가로지르는 두 버킷이 남아 정확한 28 UTC일 정산은 사용할 수 없다. 원본 공급 산술·두 수집 해상도 결과·코호트 재실행을 모두 보존된 출력과 대조했다. raw hash와 의미 재실행의 일치는 공급자의 독립 진위·finality·membership 인증이나 경제 입력 완성을 뜻하지 않는다. [두 번째 공급 해상도 원본](eth-candidate-evidence/20261028-continuity/second-run/ethereum-supply-resolution.json)

### 10.6 두 번째 결과의 실제 수동 게시와 기본 브랜치 상태

5세대의 완전한 원본을 수동으로 게시한 뒤 원격 head·유일한 부모·트리·전체 파일 목록을 다시 확인했다. 게시 전 예상 부모는 정확한 첫 데이터 커밋 `8f169b18...`였으며 강제 갱신을 사용하지 않았다. 이전 불변 파일 **52개**는 전부 같은 바이트로 유지했다. 변경 경로 11개는 새 불변 파일 10개와 현재 manifest 별칭 1개다. [두 번째 수동 게시 증거](eth-candidate-evidence/20261028-continuity/manual-second-publication.json)

| 게시 항목 | 실제 값 |
|---|---|
| 최신 데이터 커밋 | [`f42a4bf7662ae73987b23d117620dc9fda4a86ac`](https://github.com/twoimo/bitcoin-cycle-atlas/commit/f42a4bf7662ae73987b23d117620dc9fda4a86ac) |
| 최신 데이터 트리 | `9d5728f6c95ce9c1f38d83acec537181264eae9f` |
| 유일한 부모 | `8f169b18a2eeec70fe9e57eed5bdb154e9dad3bc` |
| manifest | `0a9101ef1a31dce01bfd8c92dfe9e50627fe2b914c0c20529e7f0f58068178c4` |
| 파일·총 바이트 | **63개·8,180,885바이트** |
| 파일 목록 SHA-256 | `cf5b9ca528f40c984cf001e66a6a8e1396fd9578e4b17b75d49ef4f42c012bef` |
| 검증 영수증 시각 | `2026-10-28T03:52:47.461Z` |
| 정확한 트리 재조회 일치 | `true` |
| 자동 게시기 실행 | **`false`** |

최신 [전체 보관 트리](https://github.com/twoimo/bitcoin-cycle-atlas/tree/f42a4bf7662ae73987b23d117620dc9fda4a86ac)와 [manifest](https://github.com/twoimo/bitcoin-cycle-atlas/blob/f42a4bf7662ae73987b23d117620dc9fda4a86ac/manifest.json)는 불변 커밋 URL로 연결한다. 첫 게시물도 부모 데이터 커밋에 보존되어 있다. 두 게시 감사 영수증의 네트워크·쓰기 0회 수치는 오프라인 감사 도움 함수의 부수 효과를 가리키며 실제 수동 게시 API의 요청 수를 계측한 값은 아니다.

기본 브랜치는 `main`, 조회한 head는 **`5dd11c99faa1fe4a1a9adf56bc4775d35c9a41e4`**로 유지되었다. 그 정확한 커밋의 `.github/workflows` 목록에는 `ci.yml`, `pages.yml`, `refresh-data.yml`, `release.yml`만 있고 **`eth-prospective-daily.yml`은 없다**. 따라서 이번 작업으로 일일 예약 수집이 기본 브랜치에서 활성화되었다고 할 수 없다. 조회 기록은 `2026-10-28T03:49:00Z` 부근의 분 단위 기록이며 정밀한 시각 인증으로 취급하지 않는다. [기본 브랜치 원본 조회 증거](eth-candidate-evidence/20261028-continuity/default-branch-status.json)

두 PR 실행, 두 실제 산출물 재검증, 첫 원격 게시 세대의 실제 복원, 두 결과의 수동 게시·원격 대조는 완료했다. **자동 게시기 실행, 기본 브랜치 예약 활성화, 다음 날 이후의 연속 수집·실패 보존**은 여전히 남는다. 같은 날의 두 성공을 일일 운영이 이미 지속되고 있다는 주장으로 넓히지 않는다.

## 11. 증거의 지속 보존 범위

초기 보관 원본은 구현 소스의 `research-data/ethereum-prospective-archive` 39개 파일에 포함한다. 첫 실제 실행의 전체 보관 53개 파일은 [불변 데이터 커밋 `8f169b18...`](https://github.com/twoimo/bitcoin-cycle-atlas/tree/8f169b18a2eeec70fe9e57eed5bdb154e9dad3bc), 두 번째의 최신 63개 파일은 그 자식 [불변 데이터 커밋 `f42a4bf7...`](https://github.com/twoimo/bitcoin-cycle-atlas/tree/f42a4bf7662ae73987b23d117620dc9fda4a86ac)에 보존했다. 문서에서는 해당 실행의 불변 커밋과 정확한 원본 객체를 직접 연결하며 같은 현재 보관 전체를 문서 폴더에 다시 복사하지 않는다.

최초 실패·수정·일반 CI·Hallmark·전체 원장 검증·초기 보관 출처를 위한 45개 파일은 7,051,954바이트의 정확한 사본으로 이 문서의 증거 폴더에 보존했다. 첫 실행의 복원·추가·재검증·원격 읽기·보정 준비도·용량·경제 입력·source manifest·browser 보고서와 직접 필요한 staking/supply 원본은 `first-run/`에 별도로 보존했다. 첫 실행의 선택 목록은 20개 파일·2,896,911바이트, `second-run/`의 두 번째 선택 목록은 20개 파일·2,907,894바이트다. 각 원본을 해당 source manifest와 대조하고 의미 재실행과 복사 바이트 일치도 확인했다. 두 번의 수동 게시·산출물 검증·다운로드 증거, 해당 실행의 원격 API 응답, 실제 검증에 사용한 도움 코드를 같은 증거 폴더에 보존했다. 전체 원문 목록과 해시는 [보존 목록](eth-candidate-evidence/20261028-continuity/publication-inventory.json)에 기록하며, 이 문서의 모든 상대 링크를 게시 목록의 실제 경로와 대조했다.

검토 source book은 원본 객체가 커밋된 초기 상태와 복원/현재 원장에 이미 포함된 경우 실행 증거의 동일 객체를 다시 중복 삽입하지 않고, manifest와 페이지로 보관 목록을 연결한다. 전체 보관 출력은 실제 실행 산출물에도 별도로 존재한다. 이번 보존이 두 실행의 전체 ZIP·source book 본문·각각 181개 PNG를 모두 장기 보존한 것은 아니다. 이들의 목록·해시·검증 증거는 문서에 남기고, 실제 ZIP에는 위 만료 시각이 적용된다. [증거 패키지 구현](../scripts/build-eth-review-evidence.mjs), [최신 보관 원본](https://github.com/twoimo/bitcoin-cycle-atlas/tree/f42a4bf7662ae73987b23d117620dc9fda4a86ac)

검토 패키지의 전체 바이트 예산은 85,000,000바이트다. 이전 입력에 새 보관 원본·복원된 관측·실행 영수증·테스트 소스를 포함하기 위한 유한한 문서화 예산이며, 모델의 샘플 수나 보정 기록·관측 한도와는 별개다. 산출물의 보존 기간 30일은 이후 자동 복원이나 무기한 보관이 작동했다는 증거가 아니다.

## 12. 여전히 필요한 실제 증거

이번 변경으로 전체 이전 실제 입력을 보존한 초기 데이터를 만들고, 첫 실제 실행에서 이를 복원해 새 기록·관측을 누적하고 재검증한 뒤, 완전한 결과를 원격 데이터 브랜치에 수동 게시했다. 게시한 정확한 원격 세대를 같은 날 두 번째 PR 실행이 복원·추가한 결과도 확인했다. 두 번째 결과의 완전한 수동 게시와 원격 트리 일치도 확인했다. 다음으로 필요한 운영 증거는 기본 브랜치의 명시적인 예약 활성화, **자동** 게시기의 실제 실행, 이후 날짜의 수집과 수집 실패 시의 연속 운영 기록이다. 기준 가격 갱신과 활성 한도 이후에도 최초 선택 창을 보존하는 계약 역시 남는다.

모델 조건은 최초 12개의 실제 비중첩 성숙 결과, 정확한 원본 관측과 수집 시각, 그 결과를 사용한 불변 보정 동결, 그리고 동결 뒤 실제 발행·평가다. 경제 모델에는 정확한 UTC 공급 경계와 28일 유량, 동일 검증자 코호트의 보상·벌점·원금 이동·MEV·수수료·비용·시간 가중 원금·출구 대기 정보가 추가로 필요하다. 부분 상태나 수집 횟수로 이 조건을 채웠다고 선언하지 않는다.

현재 배포·모델 기본값·main 병합 승인 상태는 바뀌지 않았다. PR은 Draft이며 `releaseAuthorized=false`, Gemini 관련 두 검토는 `omitted-by-user`를 유지한다.

## 13. 최종 문서 갱신의 검사 범위

이 보고서와 증거를 최종 반영하는 후속 커밋은 `docs/` 경로만 갱신한다. 구현·시험·워크플로·연구 입력과 PR 소스 트리의 `dist/**` 713개 기존 파일은 검증한 `c17be870...`에서 바꾸지 않았다. 위 통과 수치는 `f6739b0a...`와 `c17be870...`의 실제 완료 실행에 속하며, 최종 문서 커밋이 새로 유발한 실행의 결과를 소급해 주장하지 않는다.
