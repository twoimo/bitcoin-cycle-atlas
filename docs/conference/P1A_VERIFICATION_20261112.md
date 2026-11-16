# WP-A P1a 검증 기록 — 2026-11-12 KST

## 범위와 소스

이번 변경은 `REQ_WP_ABC_20261110.md` A-5의 2026-11-12 개정 화면과 A-4 입력 계약을 구현한 P1a 골격이다. 실제 덱, 녹음, SRT, 실물 페이지 좌표는 추가하지 않았다. `dist/conference/timeline.json`은 의도적으로 없으며 기본 진입은 자료 준비 전 빈 상태를 표시한다. 합성 자료는 테스트 서버에서만 제공한다.

요청 브랜치는 `fix/tradingview-responsive-20261110`이다. 요청에 기재된 `46039d6` 뒤에 원격에 이미 있던 문서 커밋 `38554a4`를 보존하고 작업했다. 그 문서가 기록한 기존 macOS compare-320 R12 문제는 이 변경의 해결 대상으로 취급하지 않는다.

| 소스 커밋 | 변경 |
| --- | --- |
| `180c55df48242ae8afe83f8b80ada457d552d2a7` | 컨퍼런스 화면, 라우트, 스키마, 합성 자료, 검증기, 내비게이션 통합 |
| `15cb6792d96c6c8b77cf62a8db97d004e41cdc3b` | 자막 도크/시트 종료 시 보이는 포커스 복원, 새 CSS의 명시적 리뷰 범위 등록 |
| `8e37aede4ea75fd3a40fac793e961dd28439279d` | 오프라인 패키지에 컨퍼런스 CSS 포함, 실제 패키징 회귀 검사 |

최종 제품 소스는 `8e37aede4ea75fd3a40fac793e961dd28439279d`, Git tree는 `7ce03ecfccd2b953c50d4f0efd10afa45b97a790`이다. 이후 증거 커밋은 문서와 검증 산출물만 추가한다. 실행 기록은 각각 실제 검사한 SHA를 유지한다.

## 구현 결과

- 장표 스테이지가 남은 본문 영역을 사용하고 16:9를 유지한다. 데스크톱 최대 폭은 1,120px이다. 검사한 1024×768 및 전화기 뷰포트에서 사용 가능한 본문 폭을 채웠다. 다른 짧은 높이에서는 컨트롤 공간을 확보하기 위해 비율을 유지하며 장표 크기를 줄일 수 있다. 기존 내비게이션과 푸터를 뺀 실제 콘텐츠 폭을 기준으로 측정한다.
- 기본 자막은 선택 가능한 2줄 바다. 전체 자막은 1024px 이상에서 우측 도크, 1023px 이하에서 모달 시트로 열린다. 검색과 발표 선택은 이 보조 화면에 둔다.
- 하단 중앙 컨트롤은 56px 재생/일시정지, ±10초, 이전/다음 장표 및 발표, 행사 전체 진행 바와 발표/휴식 마커, 시각/총 길이, 다섯 속도, 따라가기/자동 장표 토글, 덱 선택을 제공한다. 전화기에서는 보조 설정을 메뉴에 둔다.
- Space, 좌우 5초, Shift+좌우 30초, 대괄호, F, D를 지원한다. 편집 필드에서는 기본 키 입력을 보존한다. 현재 자막만 단일 polite live 영역에서 source가 바뀔 때 갱신한다.
- 네이티브 audio의 시각으로 두 녹음 구간을 행사 시간에 연결한다. URL·새로고침·뒤로가기에서 시간과 덱을 복원하고 자동 재생하지 않는다. 라우트를 떠나면 오디오와 이벤트 리스너를 정리한다.
- 기존 라우트/차트/출처 푸터는 그대로 사용한다. 페이지의 유일한 h1 및 설명 연결은 기존 셸 소유다. 컨퍼런스 진입은 숨은 차트 iframe에 오디오가 남지 않도록 실제 문서 라우트로 이동한다.

## 실제 로컬 검증

실행 환경은 기존 Linux x64 워크스페이스, Node 24.22.2, Chrome for Testing headless-shell 157.0.8103.38이다. 브라우저 샌드박스와 인증서 검증을 유지했다. 물리 기기·Safari·macOS AppKit 결과는 포함하지 않는다. 검사 명령, 시각, 소스 SHA, 종료 코드, 로그 및 PNG 해시는 첨부 증거에 보존한다.

| 검사 | 실행 방법 | 실제 결과 |
| --- | --- | --- |
| 전체 단위 검사 | `npm test -- --test-concurrency=4` | 3,424개 / 3,424 통과 / 0 실패 / 0 건너뜀 |
| compare 셸 | `node scripts/verify-compare-shell-browser.mjs` | PASSED; 라우트 16, compare 폭 9, 콘텐츠 폭 조합 30, 실패 0 |
| 반응형 | 기존 `r10-browser-gates.mjs` → responsive 하네스 | 44/44 통과 (BTC·ETH·MSTR·BMNR 각 11) |
| WP6 | 동일 runner → `verify-wp6-browser.mjs --suite wp6 --phase candidate` | 30/30 통과 |
| chart-qa | 동일 runner → `verify-wp6-browser.mjs --suite chart-qa --phase candidate` | 12/12 통과 |
| 타입 검사 | `npm run typecheck` | exit 0 |
| 정적 검사 | `npm run verify:static` | 파일 963 / 스크립트 218 / 참조 1,007; status ok |
| Pages 빌드 | `npm run build:pages` | 산출물 12 / 라우트 9; built |
| Pages 검증 | `npm run verify:pages` | 산출물 12 / 라우트 9; verified |
| 컨퍼런스 | `node scripts/verify-conference-browser.mjs --out build/p1a-conference-browser` | 14/14 통과 / 실제 PNG 24 |
| 타임라인 | `npm run verify:conference -- --timeline … --sources … --out …` | 23/23 원본 대조; 누락 0; 마지막 t1 4000 ≤ 총 4000초 |

위 표는 모두 최종 제품 소스 `8e37aed`에서 실행했다. R10은 기존 로컬 후보 runner를 그대로 사용해 커밋된 dist 바이트와 검사 스크립트의 전후 해시도 대조했다. 배포 주소를 검사한 결과가 아니다.

### 컨퍼런스 화면

최종 소스의 전용 브라우저 하네스는 **14/14 통과**, 런타임 오류 0, 예상 밖 리소스 오류 0이다. 실행 전후 968개 소스 해시가 같고, 캡처 24개의 실제 PNG 바이트·크기·SHA-256을 다시 대조했다.

| 뷰포트 | 장표 실측(px) | 가로 오버플로 | 자막 전체 보기 |
| --- | --- | --- | --- |
| 390x844 | 338 × 190.125 | 0 | sheet |
| 320x740 | 268 × 150.75 | 0 | sheet |
| 768x1024 | 632 × 355.5 | 0 | sheet |
| 1024x768 | 748 × 420.75 | 0 | dock |
| 1440x900 | 976 × 549 | 0 | dock |
| 1920x1080 | 1120 × 630 | 0 | dock |
| 1280x900 | 976 × 549 | 0 | dock |
| 1023x900 | 739 × 415.6875 | 0 | sheet |
| 767x900 | 647 × 363.9375 | 0 | sheet |

각 폭에서 본문 가로 오버플로 0, 정확히 하나의 그려진 h1, 재생 56×56px, 나머지 표시 컨트롤 44px 이상, 두 줄 캡션, 컨트롤 하단과 할당된 본문 하단의 일치를 확인했다. 1280·1023·767px 경계도 추가 검사했다. 화면 비교 시 320px 본문은 우측 기존 레일 52px를 제외한 268px다.

합성 발표 00–14 전체와 자막 23개를 순회했다. 두 덱에서 총 46번 자막 행 seek 및 매핑을 검사하고, 전체 행사 종료 4,000초까지 이동했다. 실제 네이티브 audio 재생/일시정지와 파일 경계 이동, 속도, 토글, 딥링크 3,725초 복원, 키보드, 단일 live DOM 갱신을 검사했다. 이는 실제 행사 청취 정확도나 4,000초 연속 재생 결과가 아니다.

320px에서 설정 메뉴를 통해 시트를 연 뒤 Escape로 닫을 때, 그리고 데스크톱 도크를 320px 시트로 바꾼 뒤 닫을 때 포커스가 보이는 캡션으로 돌아오는 것도 검사했다. 타임라인이 없는 빈 상태, 잘못된 타임라인 오류, 내비게이션으로 진입/이탈하는 경로를 각각 검사했다.

### 타임라인 계약

CLI는 타임라인과 독립 자막 원본 목록을 함께 받는다. 필수 필드, 시각/기간/순서, 참조 ID, 덱별 1-based 페이지 범위, `page: null`, 마지막 `t1`의 오디오 상한을 검사한다. 원본 목록과 비교해 누락·추가·중복·본문/시각 변경을 각각 실패시킨다. UI 구조 검증만으로 원본 누락 0을 주장하지 않는다.

최종 CLI 결과: 합성 발표 15개, 덱 2개, 자막 **23/23**, 누락 0, 추가 0, 중복 0, 변경 0. 마지막 `t1=4000`초, 오디오 총 길이 `4000`초다. 두 입력 파일의 해시를 결과 JSON에 기록했다. 잘못된 입력 거부 테스트에는 페이지 0·상한 초과·소수, 마지막 구간 초과, 누락 원본, 바뀐 원문/시간 등의 실제 거부 조건을 포함한다.

### 중간 실패 및 별도 회귀 결과

`180c55d`의 첫 전체 단위 검사에서 새 CSS를 명시적 리뷰 범위에 등록하지 않은 문제를 발견해 실행을 중단했다(exit 130). 이는 완료/통과로 세지 않는다. `15cb679`의 다음 전체 실행은 3,424개 중 3,418 통과, 6 실패였고, 모두 오프라인 패키지가 새 CSS를 포함하지 못한 데서 발생했다. 패키징 수정 후 관련 11개 회귀 검사를 통과했고, 이를 `8e37aed`로 확정해 전체 검사를 다시 실행했다. 최종 결과는 위 표의 실제 마지막 실행이다.

기존 ETH/workspace 전체 53개 실행은 `180c55d`에서 **52 통과 / 1 실패 / 0 건너뜀**이었다. 실패는 BTC 1440×900의 10× 재생 평균 간격 140.9375ms가 허용 85–130ms를 넘은 것이다. 실패 시각은 2026-11-11 19:26:59.1745–19:27:01.4295 UTC이며 그때 별도 전체 단위 검사도 실행 중이었다. 동시 실행이 원인이라고 확정하지 않는다. 158개 검사 입력은 실행 중 바뀌지 않았고, PNG 449개를 전부 실제 바이트/서명/해시와 대조했다.

전체 단위 검사와 다른 브라우저 작업이 종료된 뒤, 최종 `8e37aed`에서 기존 `ATLAS_BROWSER_CASE_SCOPE=chart-replay` 7개를 별도로 실행했다: **7 통과 / 0 실패 / 0 건너뜀**. 원본 53개 결과와 별도 기록이며, 두 실행을 합쳐 53/53 통과라고 쓰지 않는다. 원래 재생 간격 허용치와 하네스는 바꾸지 않았다. 이전에 실패한 BTC 1440×900의 10× 평균 간격은 이번 실행에서 **118.43125ms**로, 같은 허용 범위 85–130ms 안에 있었다(17 관측 / 16 간격). 원본 53개 실행이 해시로 고정한 158개 입력 파일은 최종 소스와도 모두 같았으며 별도 대조 JSON에 기록했다. 이는 해당 입력의 바이트 비교이고 최종 소스에서 전체 53개를 다시 실행한 기록은 아니다.

추가 React 패널 검사에서 `npm run test:panels`는 이 환경의 tsx IPC 소켓 `EPERM`으로 테스트 실행 전에 종료했다. 같은 25개 파일을 `node --import tsx --test tests/web/*.test.tsx`로 실행한 결과는 **138/138 통과**, 실패/건너뜀 0이다. 이 실행의 소스는 `180c55d`이며, 원래 npm 명령 자체를 통과로 바꾸어 기록하지 않는다.

## 변경 파일

제품·테스트·통합 변경은 49개 경로(번들 이름 변경은 1개로 셈)다. 아래는 `38554a4..8e37aed`의 실제 파일 목록이다. 이 보고서와 `docs/evidence/conference-p1a-20261112/`의 산출물은 별도 증거 변경이다.

```text
M	dist/app.js
M	dist/atlas-navigation.js
M	dist/center-workbench.js
M	dist/comparison-url-state.js
A	dist/conference/player.css
A	dist/conference/player.js
A	dist/conference/route.js
A	dist/conference/timeline.js
M	dist/content-shell.js
M	dist/index.html
R096	dist/market-lab/app/assets/index-C4HVsr7P.js	dist/market-lab/app/assets/index-ByyNTPeH.js
M	dist/market-lab/app/index.html
M	dist/market-lab/cashflow/index.html
M	dist/market-lab/charts/index.html
M	dist/market-lab/housing/index.html
M	dist/market-lab/index.html
M	dist/market-lab/kr/index.html
M	dist/market-lab/rsi/index.html
M	dist/market-lab/scenario/index.html
M	dist/market-lab/themes/index.html
M	dist/market-lab/us/index.html
M	dist/site-entry.js
M	dist/ui/page-description.js
M	dist/ui/shell-slots.js
A	docs/conference/P1A_PLAYER_SKELETON.md
M	package.json
M	research-data/eth-review-scope.json
M	scripts/build-standalone.mjs
M	scripts/verify-compare-shell-browser.mjs
A	scripts/verify-conference-browser.mjs
A	scripts/verify-conference-timeline.mjs
M	scripts/verify-consolidated-workspace-browser.mjs
M	scripts/verify-native-chart-workbench-browser.mjs
M	scripts/verify-published-origin-browser.mjs
M	scripts/verify-ui-contract-browser.mjs
M	scripts/verify-workspace-browser.mjs
A	tests/conference-player.test.mjs
A	tests/conference-route.test.mjs
A	tests/conference-timeline.test.mjs
A	tests/fixtures/conference/README.md
A	tests/fixtures/conference/sources.synthetic.json
A	tests/fixtures/conference/timeline.synthetic.json
M	tests/native-chart-workbench.test.mjs
M	tests/page-description.test.mjs
M	tests/published-origin-browser.test.mjs
M	tests/shell-slots.test.mjs
M	tests/standalone-packaging.test.mjs
M	tests/web/unified-workspace.test.tsx
M	tests/workspace-navigation.test.mjs
```

## 남은 작업

1. 잠긴 실제 PDF/PPTX·녹음·SRT로 재현 가능한 자산 변환과 `timeline.json` 생성, 독립 원본 목록과 실제 덱별 페이지 매핑을 수행해야 한다. 잠금 파일과 원본 자산은 이번에 바꾸지 않았다.
2. 실제 프로그램 00–14와 전체 자막의 누락 0, 실제 장표 자동 전환·미매핑 목록, 10개 청취 지점의 ±0.5초 정확도는 아직 검증하지 않았다. 합성 픽스처 결과로 대신하지 않는다.
3. A-9의 로컬 4G 초기 로드 2.5초 및 실제 장표 전환 150ms, A-10의 1시간 연속 재생 메모리 안정성은 실행하지 않았다. 로컬 준비 시각과 짧은 네이티브 audio 검사는 이 성능/장기 검사에 해당하지 않는다.
4. R7 iOS Safari·실기기·macOS 외부 AppKit과 기존 문서의 R12는 이번 범위 밖이다. main 병합/push, 배포, 유료 용량·서비스, 계정·권한 변경, PR #98 수정은 수행하지 않았다.

다음 한 건은 **P1b 실제 자산/SRT 변환 파이프라인**이다. 잠금 해시를 확인하고 원본 SRT의 독립 세그먼트 목록을 먼저 만든 뒤, 재현 가능한 변환 산출물과 덱별 매핑을 A-4 검증기에 연결한다.


## 증거 찾기

- [요약 JSON](../evidence/conference-p1a-20261112/summary.json), [전체 파일 해시](../evidence/conference-p1a-20261112/manifest.json), [실행 환경과 정리 기록](../evidence/conference-p1a-20261112/runtime.json).
- [컨퍼런스 기하 수치](../evidence/conference-p1a-20261112/conference/summary.json), [원본 타임라인 대조](../evidence/conference-p1a-20261112/timeline-verification.json).
- [R10 실제 6개 게이트](../evidence/conference-p1a-20261112/r10/summary.json), [이전 53개 실행](../evidence/conference-p1a-20261112/supplemental-53/compact-receipt.json), [단독 재생 7개 실행](../evidence/conference-p1a-20261112/quiet-replay-7/compact-receipt.json).
- `*.gz`는 원래 JSON 또는 로그를 수정 없이 gzip한 것이다. 컨퍼런스 PNG 24개는 전부 보존한다. 기존 게이트의 전체 PNG는 로컬에서 해시 대조했으며, 저장소에는 대표 PNG와 전체 해시 목록을 보존한다.
