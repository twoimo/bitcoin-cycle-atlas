# v1.33.0 검증 증거 — 출처와 범위

2026-11-07의 PR #66 리디자인 검증, 실제 릴리스·Pages 배포 및 공개 화면 확인을 보존한다. 원본 report와 receipt는 판정·WARN·baseline을 편집하지 않은 자료다. `*-review.json` 및 `*-verification.json`은 해당 원본과 Git source·artifact bytes를 대조한 별도 감사 기록이다. 이 폴더를 보존하는 docs commit은 운영 배포 source가 아니다.

## 1. Source identity

| 역할 | 확인한 값 |
| --- | --- |
| PR | https://github.com/twoimo/bitcoin-cycle-atlas/pull/66 |
| 최종 검증 head | `78f4673be1754400742afa3190a5cb3ad47f706e` |
| PR CI checkout | `2152b170221dae2419c78041acdfb03d40a30e59` — GitHub PR 검증용 merge ref |
| 실제 병합 main / release tag / 공개 Pages source | `c1da5ea5f5109315f8dd65ea8229e47948ba4b2f` — 각각 확인한 결과 같은 commit |
| 세 source의 파일 tree | `83a695e31f64b118122f2e671175a7013eca7e9e` |
| 이전 main | `5704a96e787e27f53e1ae44288673ee9f1c451eb` — 최신 자동 갱신15개 파일을 보존한 시작점 |

Head78f4를 실행한 native/Hallmark 증거와 실제 main c1의 공개 배포 증거를 같은 commit이라고 고쳐 쓰지 않는다. 파일 tree가 같음을 별도로 확인했다. 이 문서 및 증거를 나중에 보존한 commit은 docs checkpoint로만 기록하며, pin URL은 최종 답변/PR에서 제공한다.

## 2. 실행과 최종 결과

| 실행 | 원본 결과 / 근거 |
| --- | --- |
| [PR CI 42356303612](https://github.com/twoimo/bitcoin-cycle-atlas/actions/runs/42356303612) | tests2,579 / pass2,579 / fail0 / skipped0, checkout2152/tree83a695e; [ci-review.json](ci-review.json) |
| [ETH native 42356303579](https://github.com/twoimo/bitcoin-cycle-atlas/actions/runs/42356303579) | models/browser/evaluate success, 원본 Chrome53/53 PASS; [browser 감사](browser-artifact-verification.json) |
| [Market service 42356303582](https://github.com/twoimo/bitcoin-cycle-atlas/actions/runs/42356303582) | consolidated320/390/1440px3/3 PASS; [Market 감사](market-browser-artifact-verification.json) |
| [Hallmark 42356303623](https://github.com/twoimo/bitcoin-cycle-atlas/actions/runs/42356303623) | core/workspace success, 아래 독립 수치 유지 |
| [Main CI 42357801078](https://github.com/twoimo/bitcoin-cycle-atlas/actions/runs/42357801078) | 실제 c1에서2,579/2,579/0/0; [main/release/Pages 감사](main-release-pages-review.json) |
| [Release 42357801009](https://github.com/twoimo/bitcoin-cycle-atlas/actions/runs/42357801009) | [v1.33.0](https://github.com/twoimo/bitcoin-cycle-atlas/releases/tag/v1.33.0) success, 18:06:51 KST / 09:06:51 UTC 공개; [release 감사](release-review.json) |
| [Pages 42357800987](https://github.com/twoimo/bitcoin-cycle-atlas/actions/runs/42357800987) | build128359629624/deploy128362163663 success, public sourcec1; [20 HTTP 대조](publication-served.json) |

최종 원본 전체 테스트2,579에 중복되는 focused test 또는 native case 수를 더하지 않는다. 첫75e4의50/53 및 실패한 Hallmark, 중간b29f의 cancelled CI/ETH를 최종 성공의 근거로 합산하지 않는다. 그 이력과 실제 보정 이유는 인계 문서 및 source의 redesign README에 보존했다.

## 3. Hallmark: static60은 한 번만 집계

| 독립 범위 | FAIL | REFLEX | WARN | 원본 파일 |
| --- | ---: | ---: | ---: | --- |
| Current static,49 files | 0 | 0 | **60** | [hallmark-static.json](hallmark-static.json) |
| Current core render,8 routes | 0 | 0 | **10** | [hallmark-core-render.json](hallmark-core-render.json) |
| Current workspace render,10 routes | 0 | 0 | **3** | [hallmark-workspace-render.json](hallmark-workspace-render.json) |

두 suite에 반복된 static60은 한 번만 센다. 각 report가 구분한 source/generated 파일 경고를 임의로 합치거나 제거하지 않는다. 예전 static32/render10/render2, 옛38 WARN, 첫 리디자인 candidate static64와 현재 값을 혼동하지 않는다. 현재 WARN을 모두 해결했다거나 모두 오탐이라고 선언하지 않는다.

원본 static60의 구성은 F40 contrast11개, F41 surface/text6개, F7 반복 container recipe42개, F24 border+shadow1개다. 숫자를 줄이기 위해 어느 항목도 dismiss하거나 검사기의 판정을 바꾸지 않았다.

[Core receipt](hallmark-core-receipt.json)와 [workspace receipt](hallmark-workspace-receipt.json)는 exact head78f4, baseline, tool provenance, source-read-only 대조, readiness, report SHA, PNG inventory 및 한계를 보존한다. Core는 before/current 각각8 route ready·40PNG, workspace는 각각10 route ready·50PNG다. 두 receipt 모두 sourceReadOnly current/baseline/gitBlobsMatched=true, integrity 오류0, design/integrity PASS, exit0이다.

- 원본 Hallmark upstream: `7ec868225c6caa040558c321ee0fefa0e73f83a8`.
- Core baseline: `0c1ed40e1b9b6c76f5621d087737dc57f174b51e`.
- Workspace baseline: `3b6373906dbdd3ef321db31deaf8a8f785da61c3`.
- Static checker Git blob: `9916fa07286e58d319528ad7cfe4ad94318e5796`; renderer: `0ecc64bc79aa34db1fadc7178617bcc53c47e064`.
- Core artifact13567607879 SHA256: `1ff731cbbddef47b7367ff462b511bb81632e0d891b5942c5bd331c70dc962a3`.
- Workspace artifact13567428163 SHA256: `e244dd3c17c935eb75cd399a49e788e18f8280dc667552302cef11c1d6425a3f`.

### Contrast 검토의 경계

[contrast-review.json](contrast-review.json)은 원본 F40 WARN11개를 그대로 보존하고, 원본 resolver의 theme/selector/file-order 처리와 실제 CSS cascade를 구분한 읽기 전용 분석이다. [WCAG2.2 상대 휘도와 contrast ratio](https://www.w3.org/TR/WCAG22/#dfn-contrast-ratio)의 공식으로 불투명 sRGB 지정 쌍을 계산했다.

원본2.55:1은 inactive light의 옛 accent `#925b15`와 새 dark nav background `#2d2a21`를 한 token map에 섞으면 재현되는 **2.546186:1**이다. 지정된 실제 dark 역할 `#d8b56d` / `#2d2a21`는 **7.339374:1**이다. Text/muted/subtle 대 surface/hover의6개 지정 쌍은 약4.99–14.65:1이다. 이는 전체 사이트의 WCAG 적합성 또는 모든 상태의 computed-style 검증이 아니다.

분석 파일 자체는 공개 DOM을 측정하지 않았다는 범위를 유지한다. 이후의 별도 [public-ui-review.json](public-ui-review.json)은 실제 공개 desktop의 선택된 시장 분석·리서치 navigation이 `rgb(216,181,109)` / `rgb(45,42,33)`, **7.3393737643:1**임을 확인했다. 이 추가 관측도 원본11개 경고를 삭제·재판정하지 않는다.

## 4. Native·모델·artifact 출처

| 파일 | 보존한 범위 |
| --- | --- |
| [browser-artifact-verification.json](browser-artifact-verification.json) | 원본 case 순서까지53개 일치,53 PASS/0 FAIL,371PNG bytes/SHA 전부 일치·누락/추가0,113 source files, 실행 중 source 변경0, fixture 및 새 CSS3개 |
| [native-browser-source-review.json](native-browser-source-review.json) | 동일 최종53 case/371PNG/113 source 대조 요약; 별도의 추가53 cases가 아님 |
| [replay-preview-review.json](replay-preview-review.json) | BTC 시작점1440×900,320×568,900×430 모두 PASS, 원본 blue assertion 및 guide stroke `rgb(141,178,255)` 유지 |
| [market-browser-artifact-verification.json](market-browser-artifact-verification.json) | consolidated320/390/1440px3 cases,27PNG/113 source hash, 실행 중 source 변경0 |
| [style-source-hashes.json](style-source-hashes.json) | 새 canonical CSS3개 및 built stylesheet의 exact source hashes |
| [model-artifact-verification.json](model-artifact-verification.json) | 모델 producer artifact13567439854의396개 출력과 선언된 디렉터리·handoff 일치 |
| [eth-evidence-joined.json](eth-evidence-joined.json) | 원본 joined receipt; source78f4/tree83a695e/run42356303579/attempt1과 model/browser producer 연결 |
| [joined-artifact-verification.json](joined-artifact-verification.json) | candidate13568241734, producer IDs/receipts, source-book902항목·602분할·108,324,090bytes, unresolved imports0 대조 |
| [producer-zip-preservation.json](producer-zip-preservation.json) | 원본 ZIP central-directory 기준 모델397개/browser448개 파일 모두 최종 candidate에서 bytes 그대로 보존 |

수치는 범위가 다르다. 모델396은 검증한 모델 출력 수,397은 producer ZIP의 전체 파일 수다.371은 browser PNG 수,448은 browser ZIP의 전체 파일 수다. 이 증거가 외부 모델 리뷰 실시 또는 새 금융 모델 채택을 뜻하지 않는다. Source packet의 `externalReviewDisposition: omitted-by-user`, `actualModelExecutionAuthenticated: false` 등 기존 한계를 유지한다.

Native browser artifact13567899406의 ZIP SHA는 `89ff45f105119c32ecb022041e475cca11717f9c89952a80eed5c6300c3deeb8`, joined candidate13568241734는 `d0c3da8b37b6c0492c91ade86e5793d16f7f0789db774f3c170ced313a85c9bf`다. Market artifact13566979657는 `918397eb80c6c216ef9cb204c0fa3c1678167a7375944ad4b8bf822c457dc860`이다.

## 5. 실제 시각 검토와 선별 PNG

Hallmark의 미국·한국·조건·현금흐름·RSI/TQQQ·주택/서울·테마/HYPE14장 및 자산·IPO·리서치6장, 총20개 desktop/mobile 화면을 실제로 보았다. 최종78f4의 해당20개 PNG는 검토한b29f와 SHA256까지 모두 같아 같은 그림을 반복 검사하지 않았다. 원본 receipt의 전체 screenshot inventory와 사람이 실제 본20개를 같은 수라고 쓰지 않는다.

최종 empty colSpan 수정은 다른 화면과 분리해320/390px 그림을 실제로 확인했다. 여기에는 다음2장을 선별했다.

| PNG | 원본 출처 / 검토 | SHA256 |
| --- | --- | --- |
| [research-empty-320.png](research-empty-320.png) | Market consolidated320,320×900,16,729bytes; 한 줄 header·표 전체 폭 empty 안내 확인 | `a91e66f1b288079e09bfb2a2a3c63ceb6a8bbfb5d06b27cc0dc88a2de5981443` |
| [research-empty-390.png](research-empty-390.png) | Market consolidated390,390×844,17,847bytes; 순서/자료 제목/근거 배치, 표 전체 폭 및 toolbar 비중첩 확인 | `b042b568aaca1a6d327b55489afe793619f6678504f59affbb873f9a8fb0f3d1` |

원본 전체 이미지는 exact run의 artifacts 및 `build/ci-78f4/` 아래에 있다. 이 폴더의 선별 이미지 수를 원본 전체 이미지 수로 소개하지 않는다. 좁은 화면은 source-bound CI Chrome viewport 검증이며, 물리 모바일 또는 공개 모바일 재검증이 아니다.

## 6. Release, Pages, 실제 HTTP 응답

[main-release-pages-review.json](main-release-pages-review.json)은 실제 main CI와 Pages build/deploy job/source, 원본 served-checker4파일 결과를 연결한다. [publication-served.json](publication-served.json)은 **2026-11-07T09:13:23.126Z**, 실제 공개 HTTP 파일 **20개**를 확인한 PASS 기록이다. 원본4개에 새 CSS3개, evidence-view, React entry/assets3개, route wrapper9개를 추가했다. 추가16개는 exact c1 Git blob 및 manifest SHA/bytes와 모두 일치한다. 전체799개 파일을 개별 HTTP 다운로드한 것으로 확대하지 않는다.

- Pages manifest SHA256: `e7fd6150374f9c6f74dc2bea742d5aa44be386b1f1c5274450eb91515b017b2f`.
- Pages 및 release contentDigest: `23e5dbb90404ef5cd6dc1a2ff773a6f57f131e937baa6fb53b179b705327245c`.
- 원본 served checker confirmed:2026-11-07 09:11:51 UTC /18:11:51 KST.

[release-review.json](release-review.json)과 [release-api-evidence.json](release-api-evidence.json)은 v1.33.0 tag/sourcec1, release437458830,13개 uploaded asset, checksum 목록12개와 GitHub digest의 일치를 보존한다. 다음3개만 실제 다운로드해 bytes를 대조했다. 나머지 큰 release assets를 독립적으로 모두 다운로드했다고 주장하지 않는다.

- [release-assets/SHA256SUMS.txt](release-assets/SHA256SUMS.txt)
- [release-assets/RELEASE_METADATA.json](release-assets/RELEASE_METADATA.json)
- [release-assets/PUBLICATION_MANIFEST.json](release-assets/PUBLICATION_MANIFEST.json)

Release와 Pages는 같은 contentDigest라도 실행 metadata가 다르다. Release manifest self-checksum은 `653d0f56745cf7ef14e4449511d3bdbfedd24b015fb40a82526b2e9b9f8ebad0`, 다운로드한 전체 파일 SHA는 `4d432292f0f00ae8d224340a676b4840087df60dcd8310d58d6dc28d612ef548`이다. Pages의 manifest SHA와 서로 바꿔 쓰지 않는다.

## 7. 공개 desktop 직접 조작 — 완료

[public-ui-review.json](public-ui-review.json)은 **2026-11-07T09:17:33.657Z**, 실제 `https://twoimo.github.io/bitcoin-cycle-atlas/market-lab/`의 **1363×936 desktop Chrome** 관측이다. 미국 summary 열기/닫기, 공통TQQQ 검색·Enter→4,206관측, 자산 digital filter3/20(BTC·ETH·HYPE), IPO 메뉴, MSTR reader·닫기 focus 복원, research empty query·전체 폭·검색어 해제의6흐름이 PASS다.

한 개의 외곽 toolbar43px, 실제 차트 SVG1,225×727와 동일 viewBox, v1.33.0 CSS3개 및 React `index-DtytQ06P.js`, 선택된 시장/리서치 navigation contrast7.3393737643:1을 기록했다. Empty 셀의 colSpan6은 실제 visible header6개와 같고, 셀/표 폭은 각각1,281px다. 실제 public UI 측정과 source의 연결은 별도 HTTP proof가 담당한다.

실제 공개 화면은 문서 폴더의 `public-market-c1da5ea.jpg`(79,188bytes), `public-research-c1da5ea.jpg`(98,072bytes)다. UI receipt는 evidence 폴더에서 이 두 파일을 `../public-market-c1da5ea.jpg`, `../public-research-c1da5ea.jpg`로 참조한다. 영구 docs checkpoint에 옮길 때 이 상대 관계를 보존한다. 선택한 controls/contrast만 직접 관측한 범위이며, 공개 모바일이나 모든 state의 WCAG 검증을 수행했다고 쓰지 않는다.

## 8. 보존 원칙

이 README와 원본 receipt/report, 대조 기록, 선별 PNG 및 공개 JPEG는 `docs/handoff-v1.33.0-20261107`에 함께 보존한다. 이 문서 checkpoint는 운영 source c1을 parent로 하며 추가 제품 변경을 넣지 않는다. 확정 commit의 pin URL은 PR과 최종 답변에 기록한다. 원본 전체 대용량 artifact를 이 폴더에 복제한 것은 아니며, 보존 범위를 위 표에 명시했다. 저장한 docs checkpoint를 Pages sourcec1로 소개하지 않는다. 추가 검증을 하더라도 원본 결과를 덮어써 경고를 줄이거나 완료된 과거 timeout/cancelled run을 다시 기다리지 않는다.
