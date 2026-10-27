# ETH 후속: 공급 창 경계와 실제 전향 보정 준비 게이트

2026-10-28 KST. [PR #39](https://github.com/twoimo/bitcoin-cycle-atlas/pull/39)의 후속 구현과 로컬·원격 실행 증거다. 공급 감사의 시간·잔액 경계를 강화하고, 실제 보존 발행본과 실제 관측만으로 판단하는 전향 보정 게이트를 구현했다. **완전 적격 경제 snapshot 0, 성숙한 전향 보정 사례 0, 보정 발행 0, `releaseAuthorized=false`**를 유지한다.

최종 구현 소스 **`47f2ae587ab5fdbe25b380c6a92bf496bd3d798e`**에서 일반 CI **1,642/1,642**, ETH 집중 **509/509**, Chromium **35/35·181 PNG**, Hallmark **0 FAIL / 0 REFLEX**를 완료했다. source-book은 **64,037,165 bytes**로 유한한 **65,000,000-byte 한도** 안에서 완성됐고, 실제 내려받은 ZIP과 원문 묶음·PNG의 해시까지 검증했다.

첫 구현 `5cbd9551`의 ETH evidence는 기능·브라우저 통과 뒤 **64,042,920 bytes로 당시 64,000,000-byte 한도를 초과해 실패**했다. 이 첫 실패와 이후 용량 교정·완료 실행을 따로 보존한다. 아래 로컬 결과, 첫 원격 결과, 최종 재검증을 합산하거나 같은 실행으로 바꾸지 않는다. 이 보고서와 영수증을 게시하는 문서 커밋은 검사한 구현 소스와 별개다. 사용자 지시로 생략한 Gemini 반대 검토·후속 역검토는 계속 `omitted-by-user`다.

## 1. 코드와 증거의 정체성

| 구분 | 확인한 정체성 / 상태 |
|---|---|
| 작업 시작점·기존 증거 보존 커밋 | [`704b1373dc09424c8f96ec1a94d766955b7c1666`](https://github.com/twoimo/bitcoin-cycle-atlas/commit/704b1373dc09424c8f96ec1a94d766955b7c1666) |
| 과거 실제 공급 원문을 수집한 코드 | `c73b17b29809961dab7e9337482e22da28789c81`, tree `2fe83d8eb6e019fe6229e2627751168e20e19491` |
| 기능 구현의 원격 게시 커밋·11개 변경 경로 | [`5cbd9551caeb4199ef92916a0e1c3ba50beed043`](https://github.com/twoimo/bitcoin-cycle-atlas/commit/5cbd9551caeb4199ef92916a0e1c3ba50beed043) |
| 기능 구현 tree | `83aa847506921ea5626ffd7124e49586a9901524` |
| source-book 용량 교정·1개 변경 경로 | [`47f2ae587ab5fdbe25b380c6a92bf496bd3d798e`](https://github.com/twoimo/bitcoin-cycle-atlas/commit/47f2ae587ab5fdbe25b380c6a92bf496bd3d798e) |
| 용량 교정 tree | `9d33dff7762f5b8a73d493e8daedacc2af74666d` |
| 연구 브랜치 | `chatgpt/eth-cycle-economics-20261026` |
| 첫 일반 CI·5cbd9551 요청 | [40535038425](https://github.com/twoimo/bitcoin-cycle-atlas/actions/runs/40535038425) — 성공, 1,642 pass / 0 fail / 0 skip |
| 첫 ETH evidence·5cbd9551 실행 | [40535038411](https://github.com/twoimo/bitcoin-cycle-atlas/actions/runs/40535038411) — source-book 용량 초과로 실패 |
| 첫 Hallmark·5cbd9551 실행 | [40535038343](https://github.com/twoimo/bitcoin-cycle-atlas/actions/runs/40535038343) — 성공, FAIL/REFLEX 0; 정적 36·render 17 WARN 유지 |
| 후속 일반 CI·47f2ae58 요청 | [40536955930](https://github.com/twoimo/bitcoin-cycle-atlas/actions/runs/40536955930) — 성공, 1,642 pass / 0 fail / 0 skip |
| 최종 ETH evidence·47f2ae58 실행 | [40536955797](https://github.com/twoimo/bitcoin-cycle-atlas/actions/runs/40536955797) — 성공, 집중 509/509·Chromium 35/35·source-book 완료 |
| 후속 Hallmark·47f2ae58 실행 | [40536955832](https://github.com/twoimo/bitcoin-cycle-atlas/actions/runs/40536955832) — 성공, FAIL/REFLEX 0; 정적 36·render 17 WARN 유지 |

게시 영수증은 [기능 구현](eth-candidate-evidence/20261028-boundaries-prospective/source-publication.json)과 [용량 교정](eth-candidate-evidence/20261028-boundaries-prospective/budget-publication.json)으로 나눠 보존했다. 이 보고서·영수증을 추가하는 후속 문서 커밋은 두 코드 커밋과 별개다. 첫 일반 CI의 실제 checkout은 합성 merge **`e156c08e64cda7cd7a199d029f4c8f91c5f4c1ce`**, tree **`df5b8a05bc6c440eca8366bf7cde0c8b29851fa8`**이며 직접 head 실행으로 표시하지 않는다. 첫 ETH CLI와 Hallmark는 `5cbd9551`/`83aa8475`의 실행 정체성을 각각 기록했다.

후속 일반 CI의 실제 checkout은 합성 merge **`e975a0321f6e172974d0f3b0275877b76e5acf58`**, tree **`89b225e18c3be0f2d16fea6138ede599d3a90667`**다. 부모는 main `5dd11c99faa1fe4a1a9adf56bc4775d35c9a41e4`와 연구 head `47f2ae58`이다. 최종 ETH evidence와 Hallmark는 직접 **`47f2ae58`/`9d33dff7`**를 검사했다. 이 구분은 [후속 CI](eth-candidate-evidence/20261028-boundaries-prospective/ci-40536955930.json), [최종 ETH evidence](eth-candidate-evidence/20261028-boundaries-prospective/evidence-40536955797.json), [후속 Hallmark](eth-candidate-evidence/20261028-boundaries-prospective/hallmark-40536955832.json) 영수증에 있다.

[전체 Git tree 비교 영수증](eth-candidate-evidence/20261028-boundaries-prospective/source-preservation.json)은 잘리지 않은 원격 tree 두 개로 `704b1373`→`47f2ae58`의 경로·Git blob을 대조했다. 변경은 처음 선언한 11개 소스·테스트·workflow 경로 안에 한정된다. `dist/` **713개**, 후보 원장 **17개**, 독립 outcome 원장 **7개**, 경제 판본 **51개**, 기존 `docs/` **1,233개** 파일은 모두 동일하다. 기존 모델 그래프·원문·과거 보고서 보존의 근거이며, 이번 후속 문서를 게시한 뒤의 상태와는 구분한다.

## 2. 공급 감사 audit-3: bucket 끝 시각과 정확한 창 경계 잔액

[`scripts/ethereum-supply-accounting-core.mjs`](../scripts/ethereum-supply-accounting-core.mjs)의 정책을 `eth-supply-accounting-audit-3`으로 올렸다. 핵심 변경은 두 가지다.

첫째, 묶음 행의 라벨 시각이 과거여도 `toSlot`이 미래라면 전체 묶음의 관측이 끝난 것으로 세지 않는다. mainnet slot 시계로 실제 범위 끝 시각을 계산하고, 제공자 생성 시각의 기존 제한과 실제 수집 시각에 각각 대조한다. 라벨이 수집 이후인 행과 범위 끝이 수집 이후인 행을 별도 진단으로 남긴다. 수집 시각을 넘는 범위를 라벨만으로 숨기는 사례를 회귀 테스트에 포함했다.

둘째, 요청한 UTC 창의 순흐름과 정확한 양끝 공급 잔액을 별도로 정산한다. 시작 직전 slot의 공급량과 마지막 포함 slot의 공급량이 있어야 하며, 잔액 라벨 자체가 그 경계에 있어야 한다. 시작 직전 행의 흐름은 합산에서 제외하고 창 안의 모든 흐름만 포함한다. 구성요소 순합과 제공자 `netWei` 양쪽에 대해 잔액 차이를 비교한다. 결측·경계 불일치·명시되지 않은 finality를 0이나 성공으로 바꾸지 않는다. 산술이 맞아도 `utcAccountingEligibilityProven=false`와 독립 canonical 상태 검증 미완료를 유지한다.

### 보존한 실제 원문에 적용한 결과

원문은 `docs/eth-candidate-evidence/20261027-vintages-calibration/final-run/ethereum-supply-accounting/capture-0kqcvW/`의 `history-30d.raw.json`, `observation.json`, `receipt.json`이다. 과거 audit-2 관측을 원래 코드로 정확히 재생하고, audit-3에서 기존 계산 출력을 보존한 상태로 새 진단을 추가했다. 네트워크 요청은 0이다.

| 시계 / 원문 | 보존 값 |
|---|---|
| 제공자 생성 시각 | `2026-10-27T14:11:50.000Z` = 2026-10-27 23:11:50 KST |
| 실제 원문 수집 시각 | `2026-10-27T14:13:14.608Z` = 2026-10-27 23:13:14.608 KST |
| 이번 로컬 재생 시각 | `2026-10-27T15:23:00.901Z` = 2026-10-28 00:23:00.901 KST |
| history 원문 | 801,491 bytes, SHA-256 `6c32bb06c88ea0af45ee803ce33582ee8eca2382077b422cdf045aea2391847a` |
| 최초 공개 시각 | `publishedAt=null` 유지 |

수수료 구성 비교 **225/225**, 순발행 구성 비교 **225/225**, 인접 공급 잔액 비교 **224/224**가 정확히 일치했고 전체 끝점 구성 잔차는 **0 wei**다. 이는 제공자 내부 회계의 재현 결과다.

요청한 2026-09-29~10-26의 28 UTC일은 **201,600 slots**다. 이를 덮는 **211개 bucket** 중 **양끝 2개**가 UTC 창을 넘는다. 요청 경계는 시작 직전 slot **15,317,998**, 마지막 포함 slot **15,519,598**인데, 보존 원문에 정확히 해당하는 공급 잔액 행이 없다. 따라서 `stockFlowReconciliation.status=unavailable`이며 `requested-window-stock-flow-reconciliation-unavailable`, `boundary-stock-finality-not-explicit`가 추가 차단 사유로 남는다. 비례 배분이나 epoch 라벨 변경으로 28일 입력을 만들지 않았다.

로컬 상세 근거는 [보존 공급 원문 재생 영수증](eth-candidate-evidence/20261028-boundaries-prospective/preserved-supply-replay.json)이다. 이것은 과거 원문을 새로운 코드로 검사한 영수증이며 새 공급 수집 영수증이 아니다. 공급 감사는 별도 경제 판본 원장의 Coin Metrics·throughput·PoW 수집 기록을 재작성하지 않았다. 완전 적격 경제 snapshot은 계속 0개다.

최종 원격 실행의 실제 새 공급 수집 시각은 **`2026-10-27T16:05:21.417Z`**, 한국 시각 **2026-10-28 01:05:21.417**이다. [최종 영수증](eth-candidate-evidence/20261028-boundaries-prospective/evidence-40536955797.json)에서도 같은 요청 창의 선행·종료 경계 잔액이 없어 정산은 `unavailable`이고, 공급 입력 활성화는 false다. 이 새 수집과 위 과거 원문의 로컬 재생 시각을 구분한다. 필수 경제 입력 26개에 대한 완전 적격 snapshot은 최종 실행에서도 0개다.

## 3. 전향 보정 계약을 실제 실행 가능한 게이트로 구현

새 [`scripts/ethereum-prospective-calibration-core.mjs`](../scripts/ethereum-prospective-calibration-core.mjs)는 기존 `eth-future-frozen-calibration-contract-1`을 구현한다. `buildEthereumProspectiveCalibrationReadiness`, `createEthereumProspectiveCalibrationFreeze`, `verifyEthereumProspectiveCalibrationFreeze`를 제공하며, 게이트 정책은 `eth-prospective-calibration-gate-1`이다. 기존 retrospective 보고서를 입력으로 받아 보정 조건을 충족시키는 경로는 없다.

판정 순서는 다음과 같다.

1. **모든 입력 기록과 snapshot을 먼저 검증한다.** 불변 ID·본문·입력 결합을 확인한 뒤에만 모델, 옵션, 발행 시각, 원점으로 분류한다. 관측도 원문과 ID를 검증한 뒤 수집 시각에 따라 cutoff 안팎을 구분한다.
2. **실험 결합을 정확히 고정한다.** 모델 key·version·source hash·전체 옵션·평가 기간이 같아야 한다. 다른 소스 그래프나 seed·sample count의 사례를 섞지 않는다. 같은 원점의 나중 개정본은 독립 사례가 아니며, 같은 최초 발행 시각에 서로 다른 기록이 있으면 해당 슬롯을 불완전하게 남긴다.
3. **정답을 보기 전에 슬롯을 고른다.** cutoff까지 성숙한 원점을 시간순으로 정렬해 겹치지 않는 최초 12개를 고정한다. 선택된 슬롯에 실제 정답이 없거나 유효하지 않아도 13번째 사례로 교체하지 않는다.
4. **실제로 수집된 관측 판본으로 잔차를 계산한다.** cutoff에서 사용 가능한 최신 검증 판본을 선택하고, 기록·관측 ID, 원문 hash, source URL, target 관측 종료·수집·공개 시계를 보존한다. 모르는 공개 시각은 null로 남긴다. 잔차는 절대 로그오차이며 12개, `alpha=0.2`일 때 고정 반경은 11번째 순서통계량이다.
5. **freeze는 입력으로부터 재구성한다.** 사용자가 넘긴 readiness의 hash만 믿지 않고 원래 기록·관측으로 전체 판정을 다시 만든다. freeze에 12개 label ID·잔차·순서통계량·반경·경계·소스 정체성을 고정한다. 검증 때 추가된 입력도 모두 먼저 검증하므로, 최초 원점을 숨긴 뒤 그 ID의 source hash나 시각만 바꿔 누락 검사를 우회할 수 없다.

독립 소스 검토와 합성 반례에서 발견한 **검증 전 라우팅 문제 3개**를 고쳤다. 준비 판정의 record routing, freeze 검증의 추가 record routing, outcome의 수집 시각 routing 모두 검증이 선행한다. 근거는 `eth-candidate-evidence/20261028-boundaries-prospective/calibration-independent-review.json`과 [`tests/ethereum-prospective-calibration.test.mjs`](../tests/ethereum-prospective-calibration.test.mjs)의 **20개 통과**다. 재해시한 변조, 누락한 최초 사례, 미래로 위장한 관측, 같은 원점 중복, 결측 슬롯의 대체 금지를 검사한다. 이 테스트는 계약 검증이며 시장 예측 성적이 아니다.

## 4. 원장 로더·CLI와 기존 발행본의 실제 재생

새 [`scripts/build-ethereum-prospective-calibration-readiness.mjs`](../scripts/build-ethereum-prospective-calibration-readiness.mjs)는 아래 seed와 현재 실행 원장을 함께 읽는다.

| 입력 | 역할 |
|---|---|
| `research-data/ethereum-prospective-ledger/` 및 `build/ethereum-prospective-ledger/` | `index.json`, `records/<id>.json`, `snapshots/<id>.json`, `observations/<id>.json` |
| `research-data/asset-outcome-ledger/` 및 `build/asset-outcome-ledger/` | index와 정확히 결합된 ETHUSD outcome 원문 |
| `build/ethereum-prospective-calibration-readiness.json` | CLI 출력: 불변 `report`와 별도 `provenance` envelope |

로더는 index의 전체 메타데이터와 내용 주소 경로를 원본 기록에 대조한다. 두 디렉터리의 같은 불변 ID는 본문까지 같을 때 한 번만 세며, 원래 발행·수집 시각을 유지한다. 합쳐진 입력에서 최대 **2,000개 record·500개 observation**을 적용하고 파일 크기도 읽기 전후 제한한다. 일반 파일 여부, 실제 경로의 저장소 내부 포함, UTF-8 및 canonical JSON을 검사한다. 이 경계의 회귀 테스트는 [`tests/ethereum-prospective-calibration-readiness.test.mjs`](../tests/ethereum-prospective-calibration-readiness.test.mjs)의 **11개**다.

CLI는 원래 모델 의존 그래프와 보존 원문의 base·tail을 사용해 예측을 재실행한다. 이전 그래프를 찾지 못했다고 과거 기록을 조용히 제외하지 않는다. `.github/workflows/eth-model-evaluation.yml`에 기존 발행·재생 뒤의 독립 단계로 연결했으므로 새 발행이 없어도 보존 원장을 검사한다. `scripts/build-eth-review-evidence.mjs`와 `research-data/eth-review-scope.json`에도 출력·소스 경로를 추가했다. CLI 자체는 준비 보고만 만들며 freeze나 보정 예측을 발행하지 않는다.

### 실제 보존 원장에 대한 로컬 결과

`eth-candidate-evidence/20261028-boundaries-prospective/local-prospective-calibration-replay.json`은 **입력 파일 10개, 기존 record 3개, forecast snapshot 2개, observation 3개**를 사용했다. cutoff는 `2026-10-27T15:28:25.405Z`, 한국 시각 **2026-10-28 00:28:25.405**다. 네트워크 요청 0으로 원래 모델을 각각 재실행해 **731점과 기록 ID가 모두 일치**했다.

| 원래 모델 | 원래 발행 시각 KST | 보존 record ID | 일치 점 수 |
|---|---|---|---:|
| adaptive | 2026-10-27 16:44:13.396 | `563d087f19a5062981714ed6fee1f96dd5afe77a87a4c435979b000451189a9b` | 731 |
| pooled | 2026-10-27 16:44:13.396 | `f1f0bf98496c1d6e9339ae9410a51c904571524d3ade88fc935cf6f58df3fed1` | 731 |
| warmStart | 2026-10-27 18:57:51.931 | `d2659722c147909a9cbeeea4980c63b52f36f9c23c315cd2ef1e10984b8d5f72` | 731 |

모든 기록의 원점은 2026-10-26이다. adaptive/pooled의 14파일 그래프 hash는 `cb316276ae79f90cd44d31d7ef4ad7d404c9ced4bb49d957bb4f6f94ed030491`, warmStart의 17파일 그래프 hash는 `463085b24aa701b66a6e754c6b6437a157f2bc1cbc7fd1b2403a072b4b9d42ca`로 유지했다. sidecar 구현은 기존 `dist` 가격 모델·dispatch 그래프를 바꾸지 않는다.

세 모델 × 30/90/180일의 **9개 결합 모두 `insufficient-calibration-cases`**, 성숙·선택 사례 0, 유효 보정 정답 0, invalid observation 0, 반경 null이다. 각 결합에 pending 1개가 있어 전체 후보 원장은 고유 원점 1, pending 9, scored 0 상태를 유지한다. 실제 freeze 생성 0, 새 보정 발행 0이다. 첫 목표 관측 종료는 한국 시각 **2026-11-26 / 2027-01-25 / 2027-04-25 각 09:00**이며, 이후 실제 완료 원문을 수집해야 한다.

이 로컬 결과는 같은 파일 bytes에 대한 직접 함수·모델 재실행이다. 로컬 Node에서 Git subprocess가 `EPERM`으로 막혀 **CLI 진입점 전체의 로컬 통과로 세지 않았다.** 재실행 일치는 역사적 공개 시각이나 당시 모델 실행을 독립 인증하는 증거, 예측 우월성, 미래 coverage 보장이 아니다.

### 첫 원격 CLI 실행은 통과했다

[첫 ETH evidence 영수증](eth-candidate-evidence/20261028-boundaries-prospective/evidence-40535038411-first-attempt.json)의 CLI `executedAt`은 `2026-10-27T15:55:05.572Z`, 한국 시각 **2026-10-28 00:55:05.572**다. 이는 CLI 실행 시각이며 원래 발행 시각·원문 수집 시각·로컬 판정 cutoff를 바꾸지 않는다. 소스 `5cbd9551`과 tree `83aa8475`, 실제 읽은 의존 파일 해시를 포함한 보고 ID는 `eda821a7d6c5f2cda5d1419335ed7c45ac0a788de09e27692523da7bda0c4703`이다.

이 실제 CLI에서도 원래 3개 기록의 각 731점·ID가 정확히 일치하고, 9개 결합 모두 선택·유효 보정 사례 0, pending 1, invalid observation 0, 반경 null이었다. ready 결합·freeze·보정 발행은 모두 0이다. CLI 단계 통과와 뒤의 source-book 패키징 실패는 같은 실행의 서로 다른 결과로 보존한다.

### 최종 원격 CLI의 전체 envelope를 보존했다

[최종 CLI 원본](eth-candidate-evidence/20261028-boundaries-prospective/prospective-calibration-40536955797.json)은 artifact 안의 **42,827 bytes를 그대로 보존**한 `report`·`provenance` envelope다. 보고 ID는 **`95e4ce93a7749e86bacfdee42b45ef5479b52f3c67984191e41d960befd588a5`**이며, source `47f2ae58`·tree `9d33dff7`와 결합된다. 정보 cutoff는 **`2026-10-27T16:05:58.086Z`**, CLI 실행 완료 기록은 **`2026-10-27T16:06:05.398Z`**다. 한국 시각으로 각각 **2026-10-28 01:05:58.086 / 01:06:05.398**이며 원래 발행·수집 시각은 유지한다.

보존 seed와 현재 실행 자료의 입력 파일 **19개**, 관측 판본 **4개**, 원래 발행본 **3개**를 읽었고 CLI 자체의 네트워크 요청은 0이다. 모델의 원문 재실행은 다시 **3개 × 731점·ID 정확 일치**였다. 고유 원점은 1개, 9개 결합 모두 `insufficient-calibration-cases`, 선택·유효 사례 0, 반경 null, invalid observation 0이다. ready 결합·freeze·보정 발행·보정 전향 채점은 모두 0이다. 새 관측 판본을 얻는 것과 12개 성숙한 비중첩 정답을 확보하는 것은 다른 조건이다.

## 5. 날짜가 고정된 treasury 테스트의 갱신 의존성 제거

기존 `tests/treasury-instruments.test.mjs` 두 사례와 `tests/treasury-model.test.mjs` 한 사례는 2026-10-23 가격 fixture를 쓰면서 매일 갱신되는 기본 coin anchor를 암묵적으로 읽었다. 격리된 사본에서 가격은 그대로 두고 catalog의 anchor 날짜만 2026-10-26으로 이동시키면 미래 정보 방지 검사가 작동해 **45개 중 42개 통과·3개 실패**가 재현됐다.

세 고정 날짜 테스트에 같은 2026-10-23의 명시적 coin anchor를 전달하도록 수정했다. MSTR의 BTC 가격은 `80924.1837657744`, BMNR의 ETH 가격은 `2384.38`로 fixture에 고정했다. 미래 정보 방지 런타임과 생성기는 그대로다.

| 격리 비교 | 통과 | 실패 | 근거 파일 |
|---|---:|---:|---|
| 수정 전 테스트 + 날짜만 갱신한 anchor | 42 | 3 | `eth-candidate-evidence/20261028-boundaries-prospective/refresh-fixture-before.tap` |
| 수정 후 테스트 + 같은 갱신 anchor | 45 | 0 | `eth-candidate-evidence/20261028-boundaries-prospective/refresh-fixture-after.tap` |
| 수정 후 테스트 + 원래 anchor | 45 | 0 | `eth-candidate-evidence/20261028-boundaries-prospective/refresh-fixture-original.tap` |

차등 영수증은 `eth-candidate-evidence/20261028-boundaries-prospective/refresh-fixture-receipt.json`, 패치는 같은 디렉터리의 `refresh-fixture.patch`다. 테스트 중 변형한 catalog는 격리 사본에만 적용했고 실제 런타임 파일은 복원·불변으로 확인했다. 이 결과를 전체 데이터 갱신·배포 성공으로 확대하지 않는다.

## 6. 검증 범위·첫 source-book 실패·최종 복구

로컬 최종 집중 실행 [local-focused.tap](eth-candidate-evidence/20261028-boundaries-prospective/local-focused.tap)은 **146/146 통과, 실패 0, 취소 0, skip 0**, 실행 시간 **20.902초**다. 앞 절의 core 20개·loader 11개 및 treasury 사례는 겹치는 범위이므로 146에 다시 더하지 않는다.

첫 원격 일반 CI는 **1,642/1,642**, 수치 assertion **318,010**, 의도한 변조를 거부하는 negative control **16/16**이 통과했다. 별도 요청 소유권 재생도 **32/32·28/28·17/17**이다. 정확한 합성 merge·로그 구간·decoded UTF-8 해시는 [일반 CI 영수증](eth-candidate-evidence/20261028-boundaries-prospective/ci-40535038425.json)에 있다. 로컬 집중 검사나 별도 소유권 재생 수를 이 1,642에 합산하지 않는다.

첫 원격 Hallmark는 정적·render 모두 **0 FAIL / 0 REFLEX**, integrity error **0**, waiver·dismissal **0**이다. **정적 36개·render 17개 WARN**과 원문 findings를 [Hallmark 영수증](eth-candidate-evidence/20261028-boundaries-prospective/hallmark-40535038343.json)에 보존했다. 8경로의 전후 **40+40 PNG**는 실제 실행 로그의 개수이며 이번 문서 작업에서 모든 이미지를 새로 육안 검사했다는 뜻은 아니다.

첫 ETH evidence는 기능·CLI 검증을 진행하고 Chromium **35/35 사례·181 PNG**를 생성했다. runtime error **0**, unexpected resource error **0**, 의도한 offline 오류 **15개**를 보존했다. 그러나 source-book 단계에서 **519 entries·64,042,920 bytes**를 만들다가 **64,000,000-byte 한도를 42,920 bytes 초과**해 `REVIEW_BUNDLE_TOO_LARGE`로 실패했다. 실패 시각은 `2026-10-27T15:59:07Z` 부근이다. 뒤의 artifact 업로드 성공을 source-book 또는 전체 workflow 성공으로 바꾸지 않는다. 이 첫 실패는 [원래 실행 영수증](eth-candidate-evidence/20261028-boundaries-prospective/evidence-40535038411-first-attempt.json)에 계속 남긴다.

후속 `47f2ae58`는 `scripts/build-eth-review-evidence.mjs` **한 경로**의 `maximumBundleBytes`를 **65,000,000**으로 조정했다. 원문·기록을 빼서 한도를 맞추거나 한도 자체를 없애지 않았다. 모델·표본·보정·릴리스 조건도 그대로다. 후속 일반 CI에서 **1,642/1,642·수치 assertion 318,010·negative control 16/16**, 후속 Hallmark에서 **0 FAIL / 0 REFLEX·integrity error 0·정적 36/render 17 WARN·전후 80 PNG**를 새 영수증으로 확인했다. 첫 실행 수치를 단순히 옮긴 것이 아니다.

### 최종 ETH evidence와 원문 묶음 검증

[최종 ETH evidence 40536955797](https://github.com/twoimo/bitcoin-cycle-atlas/actions/runs/40536955797), job **122304669233**은 **success**로 완료됐다. 집중 검사는 **31+66+34+378=509개 모두 통과**, fail·cancelled·skip·todo는 각각 0이다. 이 검사는 일반 CI 1,642개와 겹치므로 합쳐서 새로운 총 테스트 수를 만들지 않는다. Chromium도 최종 소스에서 **35/35·181 PNG**, runtime error **0**, unexpected resource error **0**, 의도한 offline 오류 **15개**를 기록했다. [실행 영수증](eth-candidate-evidence/20261028-boundaries-prospective/evidence-40536955797.json)은 단계별 완료와 실제 시각을 보존한다.

최종 source-book은 **376 seeds·520 entries·356 parts·64,037,165 bytes**, unresolved import **0**이다. [원본 manifest](eth-candidate-evidence/20261028-boundaries-prospective/source-manifest-40536955797.json)의 `sourceAccess=complete-for-declared-scope`는 선언한 범위의 접근 완료를 뜻한다. 임의의 동적 실행 경로까지 모두 증명한다는 뜻으로 확대하지 않는다. manifest의 일반적인 `externalReview.pending`은 원문 그대로 두며, 현재 사용자 지시인 Gemini·후속 역검토 `omitted-by-user`를 뒤집지 않는다.

| 검증 대상 | 실제 bytes | SHA-256 |
|---|---:|---|
| 재조립한 source-book | 64,037,165 | `36262e00fb4fd9fab458b9411b65ec0184841151fb3d72ac87b52c582face02c` |
| 실제 내려받은 GitHub artifact ZIP | 52,846,711 | `de78ccce3f29f118e16783403f40aa1807b8257fc043e349b93cde6fb96fe86a` |

[다운로드 후 검증 영수증](eth-candidate-evidence/20261028-boundaries-prospective/artifact-verification-40536955797.json)에서 ZIP digest가 GitHub의 digest와 일치함을 확인했다. ZIP entry **684개 전체 CRC**, part **356개 전체 길이·SHA-256·원래 book의 대응 범위**, 순서대로 합친 전체 book을 검사했다. 기존 `scripts/build-eth-review-packet.mjs` 검증기로 frame에 담긴 원문 파일 **520개**를 다시 검증하고, 브라우저 PNG **181개 전체 해시**도 대조했다. 이것은 실제 bytes의 무결성 검사이며 모든 이미지를 새로 육안 확인하거나 제공자의 역사적 공개를 독립 인증한 결과가 아니다.

[전체 artifact 12748673800](https://github.com/twoimo/bitcoin-cycle-atlas/actions/runs/40536955797/artifacts/12748673800)의 GitHub 기록상 만료 시각은 **2026-11-26T16:10:11Z**, 한국 시각 **2026-11-27 01:10:11**이다. 이 문서의 증거 폴더에는 ZIP에서 꺼낸 manifest와 최종 CLI envelope의 정확한 원본 bytes, 실행·무결성 영수증을 별도 파일로 보존했다. 운영 main의 이전 예약 갱신을 다시 실행하거나 배포한 기록으로 해석하지 않는다.

## 7. 파일 해시

아래는 이 문서 작성 때 읽은 파일의 SHA-256이다. `scripts/`·`tests/`는 저장소 기준 경로이고 `eth-candidate-evidence/`는 이 문서가 있는 `docs/` 기준 경로다. Git commit/tree, Git blob, 파일 SHA-256, 원문 수집 시각은 서로 다른 증거다. 기존 기능 소스는 `5cbd9551`의 bytes를 유지하고 source-book 생성기의 한도 교정만 `47f2ae58`에 속한다.

| 경로 | SHA-256 |
|---|---|
| `scripts/ethereum-supply-accounting-core.mjs` | `953181d997804f699f3800288275351ceb09e488d897e3844a68b3920848b7ee` |
| `tests/ethereum-supply-accounting.test.mjs` | `8b330e23cb94972fff79248faab19dafc1cd1f14f31d46404b52cace71b5a20f` |
| `scripts/ethereum-prospective-calibration-core.mjs` | `8f74583e77d98a2eec0e67ef1129d8983cd846df3cde3cb0da4a5240b49a849a` |
| `tests/ethereum-prospective-calibration.test.mjs` | `ebc45e1f38b52109673cf0aad3d0f9192b54d94e47a91c456b7c8d7bc2d383d2` |
| `scripts/build-ethereum-prospective-calibration-readiness.mjs` | `2bd9d8e10cf41292938355983830bc38079ed56b0a3453a2f3d2a9649c7a4ee2` |
| `tests/ethereum-prospective-calibration-readiness.test.mjs` | `21edef1e0862e251884aca35755a843a0f80d1271853c0b25ff56d5b792f995e` |
| `tests/treasury-instruments.test.mjs` | `526837c8089248b076b104666150d2475144a22c4b3473ba64275fcd3af4b3a0` |
| `tests/treasury-model.test.mjs` | `6444d6652752800773cc9d611ff3f660cdca29f0236b8f36bd5b01048926b2d8` |
| `scripts/build-eth-review-evidence.mjs`·47f2ae58 | `8e4f23a9296e8f331f870992cadddc9654d9a3cd021ebd45e3e24f587ef0cb43` |
| `eth-candidate-evidence/20261028-boundaries-prospective/local-focused.tap` | `bcea858e7210f60e50e73fb85a96e985dcdc9e31700ac47eb2c0dd17498e77a2` |
| `eth-candidate-evidence/20261028-boundaries-prospective/local-prospective-calibration-replay.json` | `32b9b1b1623e9bb1b19f300c08df7ae29d134405dcb3c72a75b83eb982ac22b3` |
| `eth-candidate-evidence/20261028-boundaries-prospective/preserved-supply-replay.json` | `18463271e3ca4912020caecfa58b7c030c3c47581bdd2ea577265a8a00739a0a` |
| `eth-candidate-evidence/20261028-boundaries-prospective/calibration-independent-review.json` | `7bb817e78754dabd3c6ad3a9aaf38f2136287a5cdb4fc486b38b0d5ee702e391` |
| `eth-candidate-evidence/20261028-boundaries-prospective/refresh-fixture-receipt.json` | `ee89b2dbd5d8efba8a0af79409611e1128e79c8fc2591475a50d3fc090b7db78` |
| `eth-candidate-evidence/20261028-boundaries-prospective/ci-40535038425.json` | `28530fe47b5f9d7d161a782f32319a62d255e91ece5ad16359503736e4729e7e` |
| `eth-candidate-evidence/20261028-boundaries-prospective/hallmark-40535038343.json` | `7ba489b97d3e7b42bc296e29ffbc1fe7cc74dd5fea9832d7203335599098d1fd` |
| `eth-candidate-evidence/20261028-boundaries-prospective/evidence-40535038411-first-attempt.json` | `f0484f6fe34be1edd0870bdf7cfc8668a134fab3e52e4753e48eef1f6013a81d` |
| `eth-candidate-evidence/20261028-boundaries-prospective/budget-publication.json` | `c7ab1855e30f84f1b6674d2e060ca5b28dd29cf8f0d7dbd1534c2479d83c301c` |
| `eth-candidate-evidence/20261028-boundaries-prospective/source-preservation.json` | `048bcfd91a85352b5a3a3cb31c708223a52cc9024b124e82ac1249cc325102b7` |
| `eth-candidate-evidence/20261028-boundaries-prospective/ci-40536955930.json` | `9be325fc4bcd0e91b493ad1e858a01147a46f03f5b0114516a824c823dfffb12` |
| `eth-candidate-evidence/20261028-boundaries-prospective/hallmark-40536955832.json` | `07b5421d79832e9179648b6a941a3a968a25504e5f9b280d309d801c71f99723` |
| `eth-candidate-evidence/20261028-boundaries-prospective/evidence-40536955797.json` | `c1d9b509ab4ecdf0ccbc594cde1cae9d6fb063b9c65fc2e08b72ee77ddc60e1d` |
| `eth-candidate-evidence/20261028-boundaries-prospective/source-manifest-40536955797.json` | `80f5fe8d1b6acba427a06fa680573809ec10f70481f09273cc291366ec78e22e` |
| `eth-candidate-evidence/20261028-boundaries-prospective/prospective-calibration-40536955797.json` | `8a7e62b83e9247f4bed5d6e14af76b6f7036538c548288f661f28a740cecfaa0` |
| `eth-candidate-evidence/20261028-boundaries-prospective/artifact-verification-40536955797.json` | `d722f175f426cacd71e6b2e2f2d0ae66ab6c25576ed0e9e8c7b05aaec6f3fd8a` |

## 8. 남는 실증 조건과 릴리스 상태

공급 감사의 구현 완료는 정확한 UTC 경계 원자료·독립 상태 정산·공개 시계의 확보를 뜻하지 않는다. 경제 모형은 정의가 맞는 26개 입력의 완전한 실제 가용 판본, 같은 cohort의 순보상·비용과 중복 제거 담보, 충분한 기간별 성숙 정답과 시장 환경을 계속 요구한다. 전향 보정은 각 정확한 실험 결합에서 최초 12개 비중첩 실제 정답이 완성된 뒤 불변 freeze와 이후 별도 발행·평가를 거쳐야 한다. 이미 살펴본 retrospective 12/8 구간의 결과는 이 수를 채우지 않는다.

이번 후속의 구현 소스 **`47f2ae58`**에 대한 일반 CI·ETH evidence·Hallmark와 실제 증거 ZIP 검증은 완료했다. 첫 패키징 실패도 별도 원문으로 남겼다. 이 보고서·영수증을 게시하는 후속 문서 커밋은 구현 검사 대상과 구분하며, 문서 변경으로 자동 실행이 생기면 그 checkout·run을 별도로 기록한다. 정식 릴리스 권한은 계속 **`releaseAuthorized=false`**, 기본 모형 승격은 **false**다. main 병합·정식 배포 완료로 표시하지 않는다. [남는 조건 요약](ETH_REMAINING_CONDITIONS.md)은 이 완료 상태와 실증 제약·과거 실행 이력을 함께 보존한다.
