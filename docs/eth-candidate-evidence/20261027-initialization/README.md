# ETH 초기 상태·구간 비교·자료 시계의 실제 실행 증거

[연구 보고서](../../ETH_INITIALIZATION_AND_CONTROLS_20261027.md) · [남은 조건](../../ETH_REMAINING_CONDITIONS.md) · [Draft PR #39](https://github.com/twoimo/bitcoin-cycle-atlas/pull/39)

## 실행한 소스와 후속 문서의 구분

- 직접 연구 소스: **a1ecdcea2ed181835af65f0db6b712ba8c3ee273**
- 직접 연구 tree: **aa09ec9b42a48535647efc11b2ce325173ab76fb**
- 일반 CI의 실제 checkout: **136f36106e2ca6932831aa32f1f010619ced0a11**, tree **5b071381229362f33b08a2f4946a996a2c8fc9ee**
- 일반 CI 부모: main **5dd11c99faa1fe4a1a9adf56bc4775d35c9a41e4**와 위 직접 연구 head.

이 폴더는 완료된 실행 뒤에 추가하는 문서다. 이 폴더가 들어 있는 commit을 이미 실행한 응용 소스로 표시하지 않는다. 가격 비교 입력은 2026-10-25의 보존 archive이고, 기존 전향 원장의 기준일 2026-10-26과 구분한다.

## 완료된 실행

| 검사 | 실제 결과 | 실행 |
|---|---|---|
| 일반 모델·자료 테스트 | 1,511 pass / 0 fail / 0 skipped | [40476026510](https://github.com/twoimo/bitcoin-cycle-atlas/actions/runs/40476026510) |
| 일반 추가 검사 | 수치 assertion 318,010, negative controls 16/16, 요청 소유권 32/32, 시계 28/28, 정적 자원 17/17 | 위 실행 |
| 직접 ETH 집중 테스트 | 378 pass / 0 fail / 0 skipped | [40476026537](https://github.com/twoimo/bitcoin-cycle-atlas/actions/runs/40476026537) |
| Chromium | 35/35, 181 PNG, runtime 0 / unexpected resource 0 | 위 실행 |
| 의도한 offline 갱신 | 실제 resource 오류 15개 원문 보존, 자료 유지·오류 안내·재시도 검증 | browser-receipt.json |
| Hallmark | 0 FAIL / 0 REFLEX, integrity errors 0, static WARN 36 / render WARN 17, waiver·dismissal 0 | [40476026561](https://github.com/twoimo/bitcoin-cycle-atlas/actions/runs/40476026561) |

Chromium 화면 폭·터치 입력 검증을 실제 휴대전화 또는 Safari 검증으로 확대하지 않는다. 예상한 offline 오류를 전체 resource error 0이라고 표시하지 않는다. Hallmark의 WARN, 원문 severity와 내용 변경 진단을 그대로 남긴다.

## 이 폴더에 보존한 자료

| 파일 | 내용 |
|---|---|
| [execution-summary.json](execution-summary.json) | 정확한 source/tree·일반 checkout·run·테스트·브라우저·Hallmark·artifact 식별자 |
| [warm-start-receipt.json](warm-start-receipt.json) | 초기화·위험노출 진단, 실제 동일 원점 점·구간 비교, 111개 원점 검사/21개 후보 가용 |
| [interval-controls-receipt.json](interval-controls-receipt.json) | Gaussian 대조와 기존 경험적 flat/trend 구간의 실제 쌍별 점수 |
| [source-timing-receipt.json](source-timing-receipt.json) | 보존 원문 신원, 완료 지연 계수, 마지막 28일의 정확한 ETH 금액 |
| [model-readiness-receipt.json](model-readiness-receipt.json) | 입력 제공/적격 개수, 기존 모델·새 연구 후보·전향 평가·구조적 표본 조건 |
| [pooled-preservation-receipt.json](pooled-preservation-receipt.json) | 기존 adaptive 731점·27요약·45pairwise 정확 보존 |
| [monte-carlo-stability-receipt.json](monte-carlo-stability-receipt.json) | 기존 고정 seed 패널의 재실행·수치 민감도. 새 warm-start의 seed 패널 실적으로 바꾸지 않음 |
| [prospective-receipt.json](prospective-receipt.json) | 완료 입력 재수집, 새 발행 0 / 기존 후보 2개 재사용, pending 6 / scored 0 |
| [prospective-replay-receipt.json](prospective-replay-receipt.json) | 네트워크 0, 원래 입력으로 두 모델 각 731점 재실행, 원래 ID·발행 시각 유지 |
| [asset-ledger-receipts.json](asset-ledger-receipts.json) | 기존 자산 원장 9개·snapshot 3개 보존, 별도 실제 결과 원장 평가 |
| [economic-capture-receipts.json](economic-capture-receipts.json) | 같은 실행의 실제 pinned source·throughput·PoW 부분 관측 수집 영수증. full snapshot 활성화 아님 |
| [browser-receipt.json](browser-receipt.json) | 실제 35사례의 전체 브라우저 JSON, 화면 파일·hash·오류 원문·검증된 상태 |
| [hallmark-audit-receipt.json](hallmark-audit-receipt.json) | 고정 기준과 현재 앱의 단계별 원본 결과·소스 무결성 |
| [hallmark-current-findings.json](hallmark-current-findings.json) | 현재 static/render의 원문 53 WARN. 재분류·면제 없음 |
| [review-source-manifest.json](review-source-manifest.json) | source-book의 모든 entry·dependency·part·source hash |
| [intermediate-executions.json](intermediate-executions.json) | 기존 9행 assertion 실패, 이후 receipt 변수 실패와 수정 소스 |
| [document-value-verification.json](document-value-verification.json) | 문서 수치와 완료된 CI 영수증의 정확 일치, 관련 source/input 8개 SHA-256 일치 |
| [initialization-control.svg](initialization-control.svg) | 동일 보존 입력·고정 seed의 기존/warm-start 연구 경로. 새 발행 또는 보정 구간 아님 |
| [checksums.json](checksums.json) | 이 폴더의 보존 파일 byte·SHA-256·Git blob 신원. 이 파일 자신과 README는 제외 |

영수증은 GitHub Actions 로그의 JSON을 파싱하여 읽기 좋게 들여쓰기한 기록이다. 로그 타임스탬프 접두사나 전체 원본 보고서 파일의 바이트와 같다고 주장하지 않는다. 특히 warm-start 영수증은 전체 경로·사례 목록을 생략한 요약이며, 전체 출력은 아래 artifact에 보존한다. model-readiness처럼 영수증과 전체 출력 범위가 같은 파일도 원본 hash는 실행 manifest를 기준으로 확인한다.

## 전체 보고서·원문·화면 artifact

[ETH 전체 artifact 12721297261](https://github.com/twoimo/bitcoin-cycle-atlas/actions/runs/40476026537/artifacts/12721297261)

- GitHub가 보고한 ZIP 크기: **48,843,520 bytes**
- GitHub가 보고한 ZIP SHA-256: **db7cf5e468301922b7bfd2126c3071dc4ac86661fa4658e67f500d6efa132f0b**
- 보존 종료: **2026-11-26T08:55:00Z**, 한국 시각 **17:55**
- 전체 source-book: **56,450,426 bytes**, 279 seeds / 400 entries / 314 parts, unresolved 0
- source-book SHA-256: **d0896af938fb5f91d28d1029cb2a36c29d939ed937825274d70ebf9acd0a2c23**
- 설정된 상한: **60,000,000 bytes**, 이번에 변경하지 않음

| artifact 안의 전체 보고서 | 원본 bytes | 원본 SHA-256 |
|---|---:|---|
| build/ethereum-warm-start.json | 2,678,781 | `9da31c3b3fccd4164154695c3e6f971deb571b73ae217074d4149b2a8b7fc301` |
| build/ethereum-interval-controls.json | 421,659 | `40f4084b7676a01e797ce39075ac153f72e0f54019028950015d3935512ed4e9` |
| build/ethereum-source-timing.json | 9,883 | `803f0b9f6bb3a6d1980fc6f1e4e2a62bfbce3633fd54ab47ec7649e041c717ec` |
| build/ethereum-model-readiness.json | 93,640 | `ac91de01d19902ac563e1188935c2f912216a6cb622965347fad17549ee5b8f5` |

[Hallmark 전체 artifact 12720381899](https://github.com/twoimo/bitcoin-cycle-atlas/actions/runs/40476026561/artifacts/12720381899)는 전후 화면·원본 진단을 포함한다. GitHub 보고 ZIP SHA-256은 **cb32304fe5e0583240e8faee22cfc0ffd74ba83670f9ca9743af9ac54704216d**, 보존 종료는 **2026-11-26T08:50:05Z**다.

## 실패와 제한도 유지

첫 `3cc9492` 실행은 추가된 비교 행을 반영하지 않은 기존 테스트 1개가 실패했다. `0e3e440`에서 원래 9행의 보존과 새 12행을 함께 확인하도록 고쳤다. 그다음 실제 CLI는 전체 연구 JSON을 작성한 뒤 영수증의 `asOf` 참조 오류로 실패했고, `a1ecdcea`에서 계산된 `report.asOf`를 출력하도록 수정했다. 두 중간 실행은 최종 성공으로 바꾸지 않았다.

완전 경제 snapshot 0, warm-start 전향 기록 0, 기존 후보 고유 원점 1/pending 6/scored 0이다. 회고적 비교와 소스 재현성은 미래 예측 성적을 대신하지 않는다. Gaussian과 모의 q10–q90는 보정된 실제 80% 보장 구간이 아니다.

원본 source-book 생성기의 generic `externalReview.pending`은 원문으로 보존한다. 현재 사용자 지시에 따라 Gemini 반대 검토와 후속 역검토는 **omitted-by-user**이며 통과 표시도, 새 필수 조건도 아니다. **Draft 유지, releaseAuthorized=false.** 이 작업은 main 변경·병합·배포·기본 모형 승격을 수행하지 않았다.
