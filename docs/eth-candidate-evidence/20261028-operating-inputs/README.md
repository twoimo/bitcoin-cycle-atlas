# ETH 운영 입력·수집 용량 후속 증거

이 폴더는 기존 발행본을 유지하며 추가한 수집·재생 검사와 보정 계산 최적화의 근거를 보존한다. [전체 후속 보고서](../../ETH_OPERATING_INPUTS_AND_CAPACITY_20261028.md)와 [로컬 검증 영수증](local-verification.json)을 함께 읽는다.

## 최종 원격 실행과 원문 대조

구현 소스 `15b5f65158074d0e2d4e2d6ad0c64a345eed740d`의 세 workflow가 모두 성공했다. 정확한 checkout과 시각은 [실행 목록](workflow-runs.json), [ETH 최종 영수증](evidence-40549330277.json), [일반 CI](ci-40549330339.json), [Hallmark](hallmark-40549330481.json)에 보존했다.

| 검증 | 결과 |
|---|---|
| 일반 CI | 1,716/1,716, 수치 assertion 318,010, negative control 16/16. 최신 main과의 합성 merge checkout을 검사했다. |
| ETH 전용 직접 head 실행 | 집중 583/583, 브라우저 35/35·PNG 181개. 일반 CI와 중복되는 검사는 합산하지 않는다. |
| 브라우저 실패 구분 | runtime 0, 예상 밖 resource 0. 의도적으로 차단된 BTC 갱신 15건은 개별 실패 안내·이전 archive 유지와 결합해 확인했다. |
| Hallmark | 0 FAIL / 0 REFLEX, integrity error 0. 정적 36·render 17 WARN은 남는다. |
| 공급 해상도 | 실제 원문 2개 진단, invalid 0, 동일 관측 격자 조건의 UTC 경계 불일치 2개. |
| 고정 코호트 CLI | 실제 GET 3회·원문 4,610 bytes, 디스크 재생 일치. 최신 상태의 actual balance 242.199834899 ETH·effective 234 ETH. |
| 전향 원장 | 원래 3개 기록·각 731점 동일, 새 발행 0. 원문 관측은 4개이며 보정 9조합 모두 준비 부족이다. |

[최종 실행 파일](final-run/)과 [아카이브 대조 영수증](artifact-integrity.json)은 실제 내려받은 53,156,435-byte ZIP의 GitHub digest·전체 CRC, source-book 65,085,434 bytes·545개 frame·362개 part, PNG 181개 해시의 일치를 기록한다. 400개 committed frame의 Git blob도 해당 원격 tree와 일치했다. source-book은 396 seeds, unresolved imports 0이며 유한한 70,000,000-byte 예산 안에 있다.

이번 폴더에는 신규 코호트·공급 원문, 해당 실행의 전향 원장, 직접 관련 진단·브라우저 보고서·source manifest 등 artifact 파일 32개를 보존한다. 전체 source-book ZIP 및 145개 실행 evidence frame 전부를 Git 문서로 복제한 것은 아니다. [Actions artifact](artifact-metadata.json)의 만료는 **2026-11-26T17:25:52Z / 2026-11-27 02:25:52 KST**다. 이 실행의 수동 보존은 다음 날 자동 복원·추가나 영구적인 운영 체계의 구현을 뜻하지 않는다.

## 로컬 검사와 전후 측정

| 근거 | 실제 범위 |
| --- | --- |
| [최종 집중 TAP](local-focused-final.tap) | 169/169 통과, 실패·취소·skip 0, TAP duration 28,379.311792ms. 원격 CI 또는 Git provenance CLI의 실행으로 확대하지 않는다. |
| [코호트 metadata 회귀 TAP](cohort-replay-metadata-tests.tap) | 28/28 통과. 이 28개는 최종 169개에 포함되므로 합산하지 않는다. |
| [변경 전 readiness](batch-before.json), [변경 후 readiness](batch-after.json) | 실제 3 records·3 observations·9 bindings, 동일 cutoff에서 전체 결과와 9개 ID 동일. 호출 432→56, 해시 bytes 164,085,108→18,255,396, 단일 로컬 실행 4,197.896302→565.51093ms. |
| [운영 한도·원본 재실행](operational-reproduction.json) | 각 원래 모형 731점·기록 ID 동일. 500/501 관측 한도는 명시적으로 합성 fixture를 사용한 검사다. |

성능 비교는 **9개 readiness 계산**에 한정한다. loader와 모델 재실행은 같은 전후 시간에 포함하지 않았으며, 한 번의 로컬 측정을 운영 처리량 보장으로 표현하지 않는다. TAP 자체에 없는 wall-clock 시작·종료 시각은 null로 유지한다. 실제 세션의 종료 코드 0은 [별도 프로세스 영수증](local-process-exit.json)으로 확인했다. 최신 26개 publication 파일의 SHA-256·Git blob hash를 원문과 다시 대조했지만 로컬 Git HEAD에서 원격 commit을 추론하지 않는다.

## 공급 해상도와 접근 실패

[실제 보존 원문 재생](supply-actual-replay.json)과 [슬롯 정렬 분석](supply-alignment-analysis.json)은 source `47f2ae587ab5fdbe25b380c6a92bf496bd3d798e`, run **40536955797**, artifact **12748673800**의 `capture-HHIF8R/history-30d.raw.json` **801,503 bytes**를 사용했다. SHA-256은 `21018bae4b5ceae9102940075737e1a6c85c2ab22803fa7b345c9c34e98afdfb`, 원래 수집 시각은 **2026-10-27T16:05:21.417Z**다. 재생의 신규 네트워크 요청은 0이며 `cliGitProvenanceExecuted=false`다.

scope에 추가한 [별도 이전 원문](../20261027-vintages-calibration/final-run/ethereum-supply-accounting/capture-0kqcvW/history-30d.raw.json)은 **801,491 bytes**다. 두 acquisition을 같은 원문 또는 새 경제 학습 표본으로 세지 않는다. 이 폴더를 조립할 때 그 이전 원문을 로컬에서 다시 읽었다고 주장하지 않는다.

관측한 960-slot/30-epoch 격자가 그대로 유지되면 UTC 경계의 공급 stock label과 맞지 않는다. 이는 관측 격자를 조건으로 하는 정수 산술이며 모든 미래 API의 해상도를 입증하지 않는다. [live·24h 접근 기록](supply-resolution-probes.json)은 각 URL 한 번씩 요청했을 때의 HTTP 403만 보존한다. 실패 응답 본문·헤더는 확보하지 않았으며, 세밀한 원문이 실제로 존재하지 않는다는 결론도 내리지 않는다.

## 고정 코호트 원문과 검사 경계

실제 최초 수집은 새 collector 구현 전의 Python GET probe 3회다. 원문은 중복 복사하지 않고 기존 [코호트 증거 directory](../../../research-data/ethereum-staking-cohort/20261027-first-eight-validator-state/), [header probe](../../../research-data/ethereum-staking-cohort/20261027-first-eight-validator-state/probe-receipt.json), [genesis·validator probe](../../../research-data/ethereum-staking-cohort/20261027-first-eight-validator-state/probe-additional-receipt.json), [최초 재생 영수증](../../../research-data/ethereum-staking-cohort/20261027-first-eight-validator-state/replay-receipt.json), [관측 결과](../../../research-data/ethereum-staking-cohort/20261027-first-eight-validator-state/replay-observation.json)에 연결한다.

최초 probe 순서는 header→genesis→validators이고 새 collector 순서는 genesis→header→validators다. 최초 재생 영수증의 source hashes는 그 재생 시점의 값으로 유지한다. 이후 정책·deadline 검증을 수정한 최종 소스 hash로 역사적 영수증을 덮어쓰지 않았다. 실제 보존 원문 또는 합성 응답을 주입한 transport 검사는 새로운 공개 네트워크 수집이 아니다.

최초 probe의 고정 index 0~7은 활성 7개와 출금 완료 1개를 포함한다. 당시 실제 잔액은 **242.199354534 ETH**, effective balance 합은 **234 ETH**, `7 × 32 ETH`는 **224 ETH**다. SSZ header root 일치는 검증했지만 validator membership proof·독립 finality·BLS 인증은 확보하지 않았다. 이 한 시점의 상태를 28일 순보상, 시간 가중 예치액, 출금 대기 시간 또는 운영비로 사용하지 않는다.

## 원격 실행과 남은 조건

[원격 게시 영수증](remote-publication.json)은 source `15b5f65158074d0e2d4e2d6ad0c64a345eed740d`, tree `752b66423d2eafb92507e37b871f43a44262c631`, parent `34f02cf2617f7e3206e4786edfbaf849013d1ed0`을 기록한다. root가 확인한 변경 파일은 26개, 삭제는 0개이며 기존 `dist` 713개 blob이 모두 유지됐다. 이 영수증은 게시·원격 tree/blob 대조 결과이며 CI 성공을 뜻하지 않는다. PR은 Draft이고 `releaseAuthorized=false`다.

해당 새 구현의 원격 실행 근거는 [최종 실행 영수증](evidence-40549330277.json)과 [final-run/](final-run/)에서 확인한다. 로컬 측정과 원격 실행의 출처·시각을 각각 유지한다.

매일 실제 발행하고 이전 전체 원장을 검증해 복원·추가하는 운영 경로, 검토 후 커밋한 base의 지속 갱신, 현재 flat 보존 한도 이후의 보존 설계, 정확한 28 UTC일 경제 입력 및 최초 12개 실제 비중첩 성숙 구간은 계속 별도 조건이다. 완전 경제 snapshot·성숙 보정 사례·freeze·보정 발행은 모두 0, `releaseAuthorized=false`다. 외부 Gemini 검토는 사용자 지시로 생략된 항목이며 통과로 표시하지 않는다.

## 최종 로컬 실행의 추가 확인

[프로세스 종료 영수증](local-process-exit.json)은 실제 실행 세션의 종료 코드 **0**을 확인한다. 종료를 조회한 시각은 정확한 프로세스 종료 시각으로 바꾸지 않았다. [최종 capacity CLI 결과](local-final-capacity.json)는 수정된 최종 소스로 `2026-10-27T17:18:52.287Z`에 계산한 원장 3개·관측 3개·9개 달력이다. 이 로컬 명령은 네트워크 요청이나 새 발행을 만들지 않았다.
