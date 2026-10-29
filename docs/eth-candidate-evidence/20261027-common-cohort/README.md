# 공통 원점·warm-start 실제 발행 후속의 실행 증거

최종 검증 소스는 **c149d0c8e519e06f096d8b50e7c4cb68c3df726e**, tree **92dc37499c3fee99f009a21ed9b1d18b0cf9f848**다. 첫 구현·새 후보 발행은 55bed7daf9278f15961224be68c20b862ab8fef8에서 완료했다. 이 폴더는 실제 실행의 원문과 해시를 보존하며 결과 문서 커밋을 실행 소스로 소급하지 않는다.

[전체 연구 보고서](../../ETH_COMMON_COHORT_AND_ISSUANCE_20261027.md) · [남은 조건](../../ETH_REMAINING_CONDITIONS.md) · [파일별 bytes·SHA-256·Git blob](files.json)

## 최종 결과

- 일반 CI 1,545 pass / 0 fail / 0 skipped, 신규 34개 포함.
- 실제 Chromium 35/35, 181 PNG. runtime 0 / unexpected resource 0이며 의도한 offline resource 오류 15개를 원문에 유지했다.
- Hallmark 0 FAIL / 0 REFLEX, integrity 0. static 36 / render 17 WARN을 유지했다.
- 공통 비중첩 원점 9/4/2개. 고정 8 seed × 256/1,024경로, 480개 모의 설정과 45개 기본값 재현; 첫 실행과 최종 실행의 모든 수치가 같았다.
- 최초 warm-start 발행은 2026-10-27 18:57:51.931 KST. 후속 재수집은 신규 0 / 기존 3 재사용이다. 원장 3개·고유 원점 1·대기 9/채점 0이며, 각 731점·ID가 보존 원문 재실행과 일치한다.
- 경제 세 출처의 실제 원문 검증·오프라인 재생을 완료했다. 관련 부분 관측 6개와 full snapshot 0을 구분한다.

## 결과와 원문 위치

| 파일 또는 폴더 | 내용 |
|---|---|
| [execution.json](execution.json) | 실제 실행 ID·source/tree·합성 CI checkout·artifact·검증 결과 |
| [common-cohort.json](common-cohort.json) | 모든 원점·탈락 이유·720개 모의 결과·집합 참조·seed별 점수·범위 |
| [economic-evidence-coverage.json](economic-evidence-coverage.json) | 25개 지표별 정의·시각·원문 재생·결측 상태·다음 수집 조건 |
| [economic-input-files.json](economic-input-files.json) | 진단에서 실제 사용한 66개 코드·영수증·원문 경로의 매핑과 해시 |
| economic-inputs/ | 위 매핑에 따라 보존한 실제 collector 영수증·원시 응답·프로토콜 명세 |
| [model-readiness.json](model-readiness.json) | 실제 발행 수와 회고적 평가·경제 적격성을 함께 연결한 준비 상태 |
| [prospective-issuance.json](prospective-issuance.json) | 원장 보존 이후 실제 재수집: 신규 0 / 재사용 3 |
| [prospective-replay.json](prospective-replay.json) | 별도 프로세스·네트워크 0·각 731점 및 ID 일치 |
| [reuse-ledger/files.json](reuse-ledger/files.json) | 재수집 당시의 실제 raw·acquisition·observation·평가·발행 영수증 목록 |
| reuse-ledger/ | 그 재수집의 바이트를 보존한 묶음. records/snapshots는 아래 기존 원장과 바이트가 같아 그 경로를 참조 |
| [initial-issuance.json](initial-issuance.json), [initial-replay.json](initial-replay.json) | 최초 warm-start 발행 1 / 기존 2 재사용 및 그 직후 원문 replay |
| [initial-ledger-files.json](initial-ledger-files.json) | 최초 발행 artifact의 원문 파일 manifest |
| [legacy-files.json](legacy-files.json), [legacy-index.json](legacy-index.json) | 확장 전 두 후보 원장의 원래 manifest와 index |
| [initial-economic-evidence-coverage.json](initial-economic-evidence-coverage.json) | 첫 실행에서 확인한 부분 관측과 시각 |
| [ci-summary.json](ci-summary.json), [hallmark.json](hallmark.json) | 최종 일반 CI의 실제 로그 발췌와 Hallmark 영수증 |
| [browser.json](browser.json) | 전체 35개 화면·동작 결과, 오류 원문, 181 PNG의 이름·해시 |
| [source-manifest.json](source-manifest.json), [review-contract.json](review-contract.json) | 정확한 검토 범위·source-book 구성·원문 generator 계약 |
| [artifact-verification.json](artifact-verification.json) | 실제 ZIP digest, source-book 339개 part, PNG 181개, 동결 record/snapshot·index 대조 결과 |
| initial-execution.json, initial-ci-summary.json, initial-hallmark.json, initial-source-manifest.json | 첫 실행을 최종 실행과 구별하는 근거 |

## 불변 원장과 재생 입력

새 [warm-start record](../../../research-data/ethereum-prospective-ledger/records/d2659722c147909a9cbeeea4980c63b52f36f9c23c315cd2ef1e10984b8d5f72.json), 두 원래 후보와 [index](../../../research-data/ethereum-prospective-ledger/index.json)는 research-data 원장에 있다. 새 snapshot·동일 observation·raw Coinbase tail·acquisition·원래 issuance/evaluation도 같은 원장에 보존했다. 원장 루트의 오래된 receipt는 최초 두 후보의 역사 기록으로 유지하고, 새 발행 영수증은 immutable issuances 경로에 저장했다. 현재 원장 파일 목록은 [preservation manifest](../../../research-data/ethereum-prospective-ledger/files.json)에 있다.

경제 입력 매핑의 `originalPath`는 실제 실행 당시의 repository-relative 경로, `preservedPath`는 현재 Git에서 같은 바이트를 찾을 경로다. 코드와 고정 Coin Metrics CSV는 이미 보존된 원문을 참조한다. 새 원문은 economic-inputs 아래에 보존했다. 66개는 코드·영수증·원문 파일 수이며 경제 관측 수가 아니다. 동일 source와 원래 진단 cutoff에서 원시 입력을 재생하는 데 필요한 매핑이며, 재생 시각을 과거의 실제 수집 시각으로 바꾸는 용도가 아니다.

reuse-ledger의 원래 files manifest는 artifact 내부 ledger 상대경로를 사용한다. records/와 snapshots/는 research-data/ethereum-prospective-ledger에 있는 동일 바이트로 해석하고, 나머지 파일은 이 폴더의 reuse-ledger에서 찾는다. 이렇게 해석한 모든 manifest 항목의 길이·SHA-256·Git blob을 검증했다. 복사된 receipt·JSON의 공백이나 키 순서를 재작성하지 않았다.

## 전체 artifact와 보존 범위

[최종 artifact 12725023904](https://github.com/twoimo/bitcoin-cycle-atlas/actions/runs/40486179492/artifacts/12725023904)는 50,822,566 bytes이고 ZIP SHA-256은 `5e2b0536f53af119ec044008841491c2aa9dd91f98aeac690b0b3b86d033654d`다. 실제 받은 ZIP을 이 값과 대조했다. 보존 종료는 **2026-11-26 19:15:05 KST**다. 전체 source-book와 181 PNG는 이 ZIP에 보존되며 이 Git 폴더에 그림 파일을 중복 저장하지 않았다.

source-book은 **296 seeds / 421 entries / 339 parts / 60,958,464 bytes**, SHA-256 `f4eb5949416ae8be36047918ab74f5d65bfad44d5953f520d33cfb2c6425bc3d`다. 모든 part의 길이·해시와 전체 재결합 바이트를 실제 ZIP에서 확인했다. 유한한 저장 자원 한도는 64MB이며, 발행본을 보존하기 위해 조정한 값으로 모형·최소 표본·보정·승인 조건과 구분한다.

파일의 해시 일치와 계산 재생은 외부 데이터의 진위·독립 consensus 검증·과거 공개 시각·미래 예측 우월성의 증명이 아니다. complete-for-declared-scope는 명시한 검토 범위의 원문 존재를 뜻한다. Gemini 반대 검토·후속 역검토는 사용자 지시에 따라 omitted-by-user이고, 원본 generic pending을 실제 검토 결과로 읽지 않는다. Draft·releaseAuthorized=false·productionPromoted=false를 유지한다.
