# Atlas 서비스 품질·출시 체크리스트

시작 기준은 2026-11-10의 `38b9e66`이다. 브랜치 `fix/tradingview-responsive-20261110`, **배포된 제품 소스는 `09334064befc060f305520a61cfe6b695fb21930`**(`dist` tree `21fcea541ac1f203c21721897df93015c96e8b76`)이며 2026-11-11 22:55 KST production에 배포·검증됐다(WP-D 포함). 이 문서와 Pages 재생성 산출물을 포함하는 인계 커밋은 브랜치의 Git identity로 확인한다. 아래 현재 작업판의 R10은 2026-11-12 KST에 갱신했으며, 이전 리비전의 검증 결과를 새 후보 전체 통과로 읽지 않는다.

## 현재 작업판 — 자동 진행 (R10: 2026-11-12 갱신)

이 표가 이 저장소의 단일 진행 원장이다. 아래 `## 2026-11-11 후속 2~8` 절과 `## 역사 기록` 절은 각 시점의 영수증이며, 현재 판정은 이 표를 따른다. 브랜치 `fix/tradingview-responsive-20261110`, 기준 커밋 `09334064befc060f305520a61cfe6b695fb21930`(WP-D 배포 영수증 포함). main은 자동 `data: relay bundle refresh`로 계속 전진할 수 있고, 각 빌드가 같은 제품 코드에 새 릴레이 데이터를 실어 재배포한다.

| ID | 상태 | 닫는 조건 |
|---|---|---|
| R0 인계·셸·reader 기본 수정 | 완료 | D01 relay 클릭, N01/N02 내비 소유권·44px, 하네스 수집 범위, D03 reader Back, D05 reader 44px, D06/D09 사전 native client 검사·휠 도달·자손 hit, D07 복원 readback, D08 플랫폼 고정, relay dataset 소유권, 부트 진단 계측까지 반영. 44-case 44/44, 53-case 53/53, compare PASSED, npm test `complete:true` 3,360/3,355/0/5. |
| R1 D04 compare reader 겹침 | 완료 `4d22531` | 960px 이상 compare 그리드의 가운데 열을 `var(--detail-width,320px)`로 예약했다. 실측: 960/1024/1200/1440/1920에서 reader 폭 320, 차트 열 축소 320(= reader 폭), reader·차트 겹침 0, 문서 폭 불변, 959 이하 overlay 모드는 `#main` inert 유지. `verify-workspace-browser` 단언을 새 계약으로 교체(문서 폭 불변, 차트 열 축소 = reader 폭 ±2, split 겹침 0·inert 아님, overlay는 inert 필수, 차트는 점 개수·y값을 보존한 채 수평 재투영, 닫으면 원래 path bytes 복원). 검증: 53-case 53/53·실패 0, compare PASSED(9 viewport·overflow 0), `npm test` `complete:true` 3,360/3,355/0/5, typecheck·static·Pages build/verify 통과. |
| R2 D02 source sheet 준비 상태 | 완료 `947e33d` | `renderMethod()`가 `null` comparison에서 즉시 `false`를 돌려주고, `showMethod()`는 준비 실패를 토스트로 알린다(예외 없음). comparison 생성은 `buildStateComparison()` 한 곳으로 모아 차트·표·시트가 같은 객체를 읽고, 시트는 검증된 dataset에서 필요할 때 같은 함수로 만든다. 가격 owner는 `document.body.dataset.comparison='ready'`와 `atlas:comparison` 이벤트로 준비 상태를 알리고, `content-shell.js`는 그 신호가 없을 때만 `.footer [data-method]`를 잠그며 이벤트에서 다시 place한다. 실측: `?page=data`·`?page=ipo`·`?page=relay` 직접 진입은 readiness `unset`·비활성+이유 유지, `?page=evidence`는 dataset을 적재해 `ready`·활성·시트 1,744자, 차트에서 같은 문서로 돌아온 relay는 `ready`·활성·method reader 787자를 실제 내용으로 연다(수정 전 차트 라우트의 footer 버튼은 `Cannot read properties of null (reading 'metadata')`로 아무것도 열지 않았다). 검증: compare PASSED(실패 0·findings 0, 9 viewport·overflow 0), 53-case 53/53·실패 0, `npm test` `complete:true` 3,363/3,358/0/5, 신규 `tests/content-shell-source-readiness.test.mjs` 3/3, typecheck·static(967/214/992)·Pages build/verify(12 files/9 routes) 통과. |
| R3 D09 왕복 반올림 범위 | 완료 `a739b36` | 리더 왕복 폭 비교를 값의 출처별 계약으로 나눴다. `document.scrollWidth`·`body.clientWidth`·`body.scrollWidth`는 정수라 1px만 달라도 스크롤바·리플로 회귀로 실패시키고, `.workspace`·`#main`의 소수 폭은 `WIDTH_ROUNDING_TOLERANCE_PX=1`까지를 반올림으로 분류해 영수증에 `kind:'rounding'`과 delta로 남긴다. 리더 열 예약은 `READER_RESERVATION_TOLERANCE_PX=2`로 상수화했다(값은 기존 2 유지). `compareRoundTripWidths`/`assertRoundTripWidths`는 1px 초과를 `kind:'regression'`으로 실패시키고 초과 상자를 모두 `beyond`에 모으며, 숫자가 아닌 허용치·측정 불가 값(`null`, 문자열, NaN)은 통과시키지 않는다. 문서는 `docs/TRADINGVIEW_RESPONSIVE_20261110.md` §4.5. 신규 단위검사 9/9. 53-case 53/53(실패 0, `workspace.legacy.methodReader.widthRoundTrips` 6건 = 320/1440/375 × close-button/Escape, 모두 `exact` delta 0), compare **PASSED**(실패 0·findings 0, 9 viewport 320x740~1920x1080 전부 overflow 0), `npm test` `complete:true` 3,372/3,367/0/5, typecheck·static(967 files·214 scripts·992 references)·Pages build/verify(12 files·9 routes) 통과. 제품 코드(`dist/`)는 바꾸지 않았고 검사 강도만 올렸다. |
| R4 WP6 여정 | 완료 `2be7da6` | 후보 origin `http://127.0.0.1:8171/bitcoin-cycle-atlas`(커밋된 `dist` + 유도된 `atlas-wp6-candidate-source` identity)에서 `--expected-source 2be7da67bfe5d16ba1173bed7fd391b0f9281e03`으로 실행했다. identity: `productionDeployment:false`, `verifiedTrackedDistClean:true`, `sourceCommit 2be7da6…`, `sourceTree 4e6eaa9f…`, `distTreeSha256 48a3abcff4afef9a…`, 문서 sha256 `04211835a6e40acf…`, `inspector.workingChanges` 빈 값. **WP6 30/30 PASS**(BTCUSD·ETHUSD·MSTR·BMNR·TQQQ × 320x740/390x844/768x1024/1024x768/1440x900/1920x1080, 실패 0, 스크린샷 48장, Chrome 157.0.8103.51). 실측: TQQQ 기준 컨트롤이 320·390에서 collapsed 44px 칩, 768 이상에서 7행(`매매 기준/전체 승률/현재/분할 매수/분할 매도/적극/중립`), `data-criteria-through 2026-10-30`, state `unmet`·band `neutral`; 상세 다이얼로그 배지 `승률 72.7% · n=66`, HUD 7필드, 기준 상세 7행, `aria-expanded` false→true→false. BMNR은 6 viewport 모두 T3·`forecastAllowed=false`·경로 0·표본 부족 문구, ETHUSD는 548 관측 예측점, BTCUSD replay는 play/next 소유·speed·live 확인 후 replay 종료를 6 viewport에서 확인. **chart-qa 12/12 PASS**(BTCUSD·COMPARE × 6, 실패 0): `maximumAnnotationPairs 0`, 축 `paintedPairs 0`, 헤딩 `smallControls 0`, 320·390에서 네이티브 30m 선택 확인. 하네스 수정: TQQQ 블록이 e116e04 이전의 인라인 승률 배지를 요구해 6케이스가 실패했고(배지는 `매매 기준 · 분할 매매 성과` 다이얼로그 소유, 차트 코너는 `.rsi-trading-criteria`), 현재 제품 계약으로 교체하면서 기준 7행·44px·다이얼로그 HUD/기준 행·승률·닫기·`aria-expanded` 복원까지 단언을 늘렸다(삭제·허용치 완화 없음). 검증: `npm test` `complete:true` 3,373/3,368/0/5, typecheck·static(967 files·214 scripts·992 references)·Pages build/verify(12 files·9 routes). `dist/` tree `48a3abc…`는 R3와 동일해 53-case·compare 결과가 같은 제품 바이트에 그대로 적용된다. 관찰 한계: COMPARE 320/390 헤딩에서 `structure-threshold` 입력과 `structure-json`(46×44)이 스크롤 소유자 안에서 잘린 채 보고됐고, chart-qa는 compare 클리핑을 단언하지 않으므로 통과 근거가 아니라 관찰로만 남긴다. |
| R5 원격 상태·CI | 완료 `조회만·제품 변경 없음` | 2026-11-11 KST 회차 실측: `git ls-remote --heads origin fix/tradingview-responsive-20261110` = `532c9a8c815640a77dc143085e7324643071fae1`(로컬 HEAD와 동일), `origin/main` head `faa7f69f8886f0be4a0a5a729ccd7c9963c8f016`, merge-base `38b9e66338a584365b493ba5105e6b0678b5f4af`, 브랜치는 main 대비 ahead 71 / behind 5(뒤진 5건은 `data: relay bundle refresh` 2026-11-10 19:45~2026-11-11 10:30). **`gh run list --branch fix/tradingview-responsive-20261110 --limit 5` = 0건**: 이 저장소에는 실행 가능한 GitHub Actions 정의가 없다(`.github/workflows/`에 `README.md`만 존재, 7개 정의는 `ops/github-actions-archive/`에 바이트 보존, `ops/ci-migration.json`의 `provider: cloudflare-workers-builds`·`automaticGithubActions:false`). 대체 게이트는 `npm run verify:cloudflare`이고 Workers Builds는 main을 watch하므로 브랜치 push에는 provider 빌드가 생기지 않는다. 따라서 head `532c9a8`의 check-runs `total_count` **0**, combined status `pending`(total 0)이고, **이 브랜치의 원격 CI 증거는 0건**이며 지금까지의 44-case·53-case·compare·WP6·chart-qa·`npm test`는 전부 로컬 실행 결과다. **PR 조회**: `gh pr list --head fix/tradingview-responsive-20261110 --state all` = 없음(이 브랜치의 PR 없음). open PR은 #98 하나뿐이고 그것은 이 브랜치가 아니다 — PR #98 `feat/conference-review-20261110` → base `main`, state `OPEN`, `isDraft true`, head `7064d25f3fc6eb1574375f1ce76373926a637d6b`, `mergeable UNKNOWN`, `mergeStateStatus UNKNOWN`, `reviewDecision` 없음, `updatedAt 2026-11-10T09:17:40Z`, checks는 GitGuardian `pass` 1건뿐. 판정: 조회만 수행했고 merge·deploy·force push·PR 변경·PR 생성은 하지 않았다. 원격 CI 0건은 '통과'가 아니며 로컬 게이트 결과를 대체하지 않는다(브랜치에 원격 CI가 필요하면 PR 생성이나 워크플로 복원이 선행 조건이며 둘 다 이 자동화 범위 밖이다). |
| R6 WP-A 미디어 | 부분 — 자동화분 완료, 사람 검수 차단 | 2026-11-11 자동화 가능분 실측: PDF 290(final)+257(R17)=**547**(계약 `plannedPages:547` 일치, Poppler 26.10.0), 오디오 16/16 매니페스트 해시 일치·입력 2건 원본 해시 일치, Linux `renameat2(RENAME_NOREPLACE)` 원자 게시 4케이스 통과(Docker `python:3.12-slim`, `EEXIST` 확인). 영수증 `docs/conference/WP_A_AUTOMATED_MEDIA_20261111.md`·`docs/conference/evidence/media-20261111/`. 남은 차단: 직접 청취·동기화 10지점, 547장 WebP 렌더·시각 검수, 배포 패키지 자산 수·Range, R17 변형 결정(깔끔본 접두사 `baa2224e…` ≠ 실측 `3760cd72…`). `mediaPrepared:false` 유지. |
| R7 native 외부·실기기 | 차단 | macOS 외부 AppKit 메뉴, Safari, 실제 iOS/Android 기기 검증은 자동화 대상이 아니다. Blink 내부 팝업 trusted 입력과 동일시하지 않는다. |
| R8 문서 최종화 | 완료 `7bfd717` | 요청사항·반응형·체크리스트 세 문서를 최종 상태로 정리했다. `docs/requirements/REQ_WP_ABC_20261110.md` §12 최종 판정(WP-A 차단 유지·WP-B 부분·WP-C 완료, R1~R8 목록), `docs/TRADINGVIEW_RESPONSIVE_20261110.md` §14 최종 판정(계약별 6행·로컬 수치·남은 차단·클리핑 관찰 한계), 그리고 이 표와 아래 `## 체크리스트 종결 판정` 절이다. R6·R7만 차단으로 남기고, 원격 CI 0건을 통과로 쓰지 않으며, main push·merge·배포·PR 변경·유료 용량·계정/권한 변경은 수행하지 않았다. |
| R9 WP-D 전 종목 좌상단 오버레이 | **완료** (2026-11-11) | BTC 기준 단일 행 오버레이로 통일했다. ETHUSD·MSTR·BMNR의 `.eth-readout`을 1행(간격 · 관측 종가 · 가격 · 전봉 변화 · 기준일)으로 바꾸고 출처는 별도 `.eth-readout-source` 행으로 분리했으며, OHLC는 `details` 접힘(기본 닫힘, 펼치면 O/H/L/C)으로 옮겼다. 실측(플롯 폭 대비): 1440 ETH 319×23(23.9%)·MSTR 306×23(22.9%)·BMNR 296×23(22.2%), 768 44.6~48.1%, 320 줄바꿈 40px·가로 오버플로 0, readout 오른쪽 바깥 히트는 차트 SVG. 검증: native 15/15(신규 `verifyCompactReadout`), 반응형 44/44, WP6 30/30, chart-qa 12/12, panel 138/138, compare PASSED, `npm test` `complete:true` 3,373/3,368/0/5, typecheck·static(958 files·214 scripts·992 references). 계약: 요청서 §13, 반응형 §4.6. |
| R10 차트 UI 마감 (인트로 행 제거·보조지표 범례) | **구현·자동검증 완료 / 미배포** `15ff9e3` | `6dea9b3`의 인트로 행 제거·`f94a35f`의 보조지표 범례·`d36766e`의 48px 툴바 예약을 유지했다. h1을 툴바 다음 형제에 둔 채 기존 조작 영역 위에 보이도록 고정 배치하고, 콘텐츠 제목을 h2로 정리해 전체 DOM h1도 1개로 맞췄다. 320/768/1440 × BTC·ETH·MSTR·BMNR·compare 15/15: h1 높이 14px, overflow 0, 기준선 geometry 276개 최대 차이 0px. 기존 53/53(WP-D 포함), compare PASSED, 반응형 44/44, WP6 30/30, chart-qa 12/12, panel 138/138, `npm test` 3,375/3,375·실패 0·skip 0·`complete:true`. TypeScript·static·Pages build/verify·web build 통과. [원본 증거·구현 설명](CHART_H1_20261112.md). **남은 것**: R7 실제 iOS Safari 확인. 이번 요청에 따라 main 병합·푸시와 배포는 수행하지 않았다. |
| R12 compare 320 h1 고정 위치 | **완료 (계약 모드 15/15, layout-shift 케이스는 R13으로 이관)** | macOS에서 차트 h1 매트릭스를 3회 돌리면 매번 14/15로 `compare-320`만 실패한다(Pro의 Linux 실행은 15/15). 격리 실측: 툴바 852–900, h1 922.5로 제목이 툴바 70px 아래·뷰포트 밖이고, 다른 실행에서는 셸이 953px로 부풀어 툴바가 905–953이었다. 원인은 `dist/ui/page-description.js`가 고정 배치 h1의 `top`을 `anchor.getBoundingClientRect()`로 계산하면서 `ResizeObserver`에 툴바·anchor만 등록해, 조상 높이 변화로 툴바가 이동해도 크기가 그대로라 재배치가 울리지 않는 것이다. **남은 것**: 조상·스크롤·창 크기 변화까지 관찰하거나 h1을 CSS 흐름 안에 두는 방식으로 고치고, macOS 320 compare에서 뷰포트 안 표시를 재측정한다. 2026-11-12 06:20 Pro 진행: 이 결함이 OS 전용이 아니라 레이아웃 확정 순서에 달려 있음을 Linux에서도 같은 순서로 재현해 확인했고, 관찰 범위를 스테이지·워크스페이스·문서 루트까지 넓히고 재배치를 프레임당 1회로 합치는 수정과 72px 지연 축소 회귀검사 9/9를 마쳤다. Pro 환경에서 compare 320·390, 지연 크기 변경 2건, conference 4개 폭은 통과했으나 데스크톱 4종목의 글자 경계가 0.84–1.41px 겹쳐 기존 15개 매트릭스는 11/15다(수정 전에도 있던 폰트 메트릭 차이이며 허용치를 바꾸지 않고 해결 중). 이후 Pro가 `a6bf961`을 push했다(2026-11-12 06:48 KST, 6파일 +349/−32: `dist/atlas-shell.css`, `dist/ui/page-description.js`, `dist/btc-refresh-status.js`, `scripts/verify-page-heading-browser.mjs`, 단위 테스트 2개). 이 회차 macOS 독립 확인(HEAD `a6bf961`): 계약 모드(기준선 없이) **15/15**·보충 9/9 통과 — compare-320은 툴바 852–900 안에 h1이 들어와 좌표 오차 0·뷰포트 안·overflow 0이다. 기록된 기준선 파일과의 비교는 2/15였지만, 그 기준선은 Linux Chrome 157.0.8103.38에서 기록돼 macOS 157.0.8103.79와 폰트 메트릭이 달라 0.25–13.25px 차이가 나고, 320의 `plot.top 0→53`은 고지 배너가 뜬 상태의 의도된 예약분이다(기준선은 덮어쓰지 않았다). 남은 1건은 이번에 추가된 layout-shift 케이스 `compare-320-ancestor-resize`의 restored 비교뿐이고, 원인은 제품이 아니라 케이스 도중 53px BTC 고지 배너(`#btc-refresh-notice`, 실측 53px)가 사라진 타이밍이다(양쪽 상태 모두 h1 계약 통과). `npm test`는 Docker 포함 `complete:true` 3,428/3,423·실패 0·건너뜀 5(frozen 41/41). **판정**: 계약 모드 macOS 15/15·보충 9/9, `npm test` 3,428/3,423/0/5로 이 행은 닫는다. 남은 한 건인 layout-shift `compare-320-ancestor-resize`(53px 고지 배너 타이밍)는 제품 결함이 아니므로 R13으로 옮겼다. 53개 하네스의 Pro 최종 수치는 Pro 답변이 확정되면 별도로 기록한다. |
| R13 컨퍼런스 하네스 select·h1 캡처 | **완료 — macOS 컨퍼런스 14/14·입력 19/19 (판독 레이스·pageshow 제품 결함은 별도)** | `4f934b3`에서 기존 `selectNativeOptionByKeyboard`를 실제 viewport·기본 platform으로 연결했고 합성 `.value` 대입·change 없이 신뢰 키 입력 105쌍/이벤트 420개를 확인했다. ancestor-resize의 before는 BTC 고지 refreshing 종료와 안정화를 기다려 캡처하며 72px/0.01px 계약을 유지한다. Linux: 컨퍼런스 **14/14**, h1 계약 **15/15**·보충 **9/9**·layout-shift **2/2**, 기존 브라우저 **53/53**, 반응형 **44/44**, WP6 **30/30**, chart-qa **12/12**, npm **3,428/3,428·실패 0·skip 0·complete:true**. BTC·ETH 내비게이션은 같은 실행에서 모두 통과했다. 단, 문서 interactive에서 시작한 실제 재생이 최초 `pageshow → syncFromUrl() → pause()`로 정지되는 **제품 결함을 별도 0/1 FAILED로 재현**했으며 제품 코드는 바꾸지 않았다. 정상 14개는 문서 로드 후의 검증이다. **macOS 재측정(2026-11-12 09:12–09:14, HEAD `7f2982d`, Chrome 157.0.8103.79 headless=new)**: h1은 계약 **15/15**·보충 **9/9**·layout-shift **2/2**·실패 0·exit 0으로 통과했다(compare 320·390 모두 h1 top 869.5→797.5→869.5px, toolbar 852→780→852px, 폭·높이 변화 0px로 Linux와 동일 → 고지 안정화 `before` 캡처가 macOS에서도 성립). select 타임아웃도 사라졌고 통과 5건은 missing-timeline·invalid-timeline·navigation-lifecycle·navigation-BTCUSD·navigation-ETHUSD로, 두 내비게이션 케이스가 같은 실행에서 모두 통과했다. 남은 컨퍼런스 9건은 전부 `coreInteractions` 자막 검색 단계의 `Missing visible .conference-transcript-row:not([hidden])`이며 원인은 제품이 아니라 하네스다: `verify-conference-browser.mjs:133` `type()`이 전체 선택을 `key(cdp,'a',{control:true})`(CDP Control=2)로 보내는데 macOS 전체 선택은 Command(4)라, 233행 첫 입력은 빈 창이라 통과하고 236행 재입력에서 검색어가 `37253725초`처럼 중복돼 일치 행이 hidden으로 남는다(275행 `type('[data-role=page]','2')`도 같은 위험). 실패 스크린샷에서 확인했고 type() 플랫폼 분기 수정을 Pro에 요청했다. 증거: [README](evidence/r13-macos-20261112/README.md)·[conference 요약](evidence/r13-macos-20261112/conference-summary.json)·[heading 요약](evidence/r13-macos-20261112/heading-summary.json). 로컬 게이트(HEAD `d135620`): `npm test` `complete:true` 3,428/3,423·실패 0·건너뜀 5(2 배치, Docker PATH 포함) exit 0. **남은 것**: type() 수정 후 macOS 14케이스 재측정, 초기 로딩 pageshow 재생 정지 제품 문제. [변경·실측·원본 증거](R13_HARNESS_FIX_20261112.md). **입력 후속(소스 `74653b1`)**: type()을 darwin Meta4/그 외 Control2 및 네이티브 selectAll로 바꾸고 최종 값을 정확히 확인했다. 새 입력 9 + 기존 select 22의 단위 **31/31**, 최종 Linux 컨퍼런스 **14/14**, 입력 **19/19** 일치다. 첫 전체 실행은 기존 navigationState의 null documentElement.scrollWidth 읽기로 **13/14**였고 동일 소스 최종 실행이 14/14다. 이 판독 레이스는 이번 범위에서 수정하지 않았다. 첫 실행 전체 JSON 2개를 증거 관리 중 덮어쓴 한계와 보존한 완료 로그·부분 발췌는 [입력 후속 보고서](R13_NATIVE_TEXT_FIX_20261112.md)에 명시했다. heading 코드는 변경하지 않았다. **macOS 재측정 완료(2026-11-12 09:42–09:43, HEAD `86111f9`, Chrome 157.0.8103.79 headless=new)**: `node scripts/verify-conference-browser.mjs --out build/conference-r13-0942` → **14/14 통과·실패 0·exit 0**(212.6초, 소스 970개 실행 전후 변경 0, workingChanges 없음). 입력 영수증 **19/19 일치** — 자막 검색 18회 모두 `platform:darwin`·`modifiers:4`(Command)로 기존 5글자 `3725초` 전체 선택(0–5) 뒤 같은 값으로 교체돼 `37253725초` 중복이 사라졌고, 페이지 입력 1회는 `1`→`2`다. 증거: [macOS 사후 요약](evidence/r13-macos-20261112/conference-after-fix-summary.json). **남은 것(별도 항목)**: `navigationState()`가 문서 전환 중 `documentElement.scrollWidth`를 읽는 판독 레이스(Pro 진단, 이번 범위 밖), 초기 로딩 `pageshow → syncFromUrl() → pause()` 재생 정지 제품 문제. |
| R14 P1c 자산 파이프라인 (로컬 렌더) | **P1c-A 완료 / P1c-B 완료 — 기능 20/20 · 5축 QA 통과** (`c1377c3`) | P1c-A 파이프라인이 `79f1666`(생성기·렌더러·player 배선)·`9715433`(검증 기록)으로 들어왔고, 이 Mac에서 원본 4개로 **실제 렌더를 끝냈다**. 결과: 페이지 **547**(1800×1012 WebP q80, final 23MB·R17 12MB) + 오디오 **15**(106,916,580B, 48kHz 모노 AAC-LC 41,918~41,930bps) = 자산 562·파일 563, 자산 **142,521,336B**, 최대 자산 **12,775,085B**(25MiB 이내), 기존 사이트 967파일과 합쳐 1,530파일(20,000 이내), 길이 20,400초, manifest 163,622B sha256 `3380d7d5…`, 빌드 4분29.6초, `--check` 30.0초 재검증 exit 0(동일 수치). session-13은 **2,086.310초**로 원본 18,000초 경계를 한 파일 안에서 넘는다(plaud-1 861,912,480–864,000,000 + plaud-2 0–98,055,360 샘플). **이전 회차 기록 정정**: ffmpeg/ffprobe는 없던 것이 아니라 `/opt/homebrew/bin`(ffmpeg 9.0.2)에 있었고 PATH 누락으로 잘못 측정됐다. 그래서 afconvert 대체도 새 설치도 필요 없었다. 실제 도구체인: Node v26.13.0·Python 3.13.12·PyMuPDF **2.1**·Pillow 13.0.0·libwebp 1.6.0·ffmpeg/ffprobe 9.0.2(manifest에 지문 기록). requirements의 PyMuPDF 1.26.6·ffmpeg@7과 달라 **Linux 산출물과 바이트 동일 재현은 주장하지 않는다**. `sharp`는 렌더러가 쓰지 않아(PyMuPDF+Pillow) **선언하지 않음**으로 결정 ①을 닫았다. 미디어는 `.gitignore` 정책대로 커밋하지 않았고, 배포는 `npm run deploy:cloudflare`(이 Mac에서 `dist/` 업로드)이므로 **빌드 → 설치 → 배포** 순서로 반영한다. 테스트: `conference-media`+`conference-player` **51/51**, `conference-media-build` **16/18** — 실패 1건은 `MP3 container padding…`이 ffmpeg 9.0.2에서 컨테이너 probe 오류를 먼저 내는 **도구 버전 의존 단언**(제품 결함 아님, Pro에 버전 독립 픽스처로 수정 요청). **남은 것**: P1c-B(Range/206·재생·세션 경계 seek, Pro 작업 중), 사람 청취 **0/10**·시각 검수 pending, 새 HEAD에서 A-9 6/6 재측정(preload 그래프·player 변경). 게이트(HEAD `29f1646`): A-9 **6/6**(2,283.1~2,340.6ms, 예산 2,500), 컨퍼런스 **14/14**, 반응형 **44/44**, chart-qa **12/12**, compare **PASSED**, WP6 **30/30**(묶음 실행에서 `btcusd-768x1024` native heading pan 타임아웃 1건 → 같은 커밋 단독 재실행 30/30), `npm test` `complete:true` **3,521/3,514·실패 2**·건너뜀 5(실패 2건은 위 ffmpeg 9.0.2 의존 media-build 단언 1건과 그 상위 테스트). [로컬 렌더 영수증](conference/P1C_A_LOCAL_RENDER_20261112.md) **P1c-B 후속**: 원래 Mac 실측과 게이트를 보존했다. 버전 독립 PCM 부족 픽스처로 수정했고 Linux 미디어 집중 **60/60**, 최종 npm **3,563/3,563·fail 0·skip 0·complete:true**, typecheck·static·timeline **9,168/9,168** 통과다. 새 미디어 하네스는 이 Linux의 unavailable 상태에서 **exit 2·명시적 skip·브라우저 0회**였으며 실자산 통과로 세지 않는다. 실제 패키지에서는 547장/15세션 HTTP 검사와 1440×900 **20케이스**(200 매핑 장표·세션 seek/재생·14경계·18,000초 동일 파일 연속성·fallback)를 수행한다. `verify:pages`는 기존 파일명 불일치 exit 1 유지. 기존 Mac 도구체인을 재사용하며 설치→검증→복원과 Cloudflare 빌드 이후 설치 순서는 [P1c-B 영수증](conference/P1C_B_MEDIA_VERIFICATION_20261112.md)에 기록했다. **남은 것**: Mac에서 수정된 픽스처와 실제 자산 하네스 실행; 사람 청취·시각 검수는 여전히 별도다. **P1c-B macOS 실자산 실행(HEAD `e5456c5`, 13:42–13:44)**: `dist/` 격리 사본에 `build/p1c-media-20261112`를 설치해 검증했고 정본 `dist/`는 바꾸지 않았다(manifest 167B `ff3e3f2b…` `unavailable` 유지). preflight **562자산·563파일·1,530파일 합집합**·manifest `3380d7d5…`·timeline `fd15b3ef…`가 12:50 렌더 영수증과 일치했고, 실자산 HTTP는 **통과**(이미지 HEAD 547 + 오디오 HEAD 15, 정상 Range **45건 206** 바이트·해시 일치, 범위 밖 **15건 416**), ffmpeg 9.0.2 픽스처는 **18/18**. 브라우저 1440×900 **20케이스 = 6/20**: 통과는 15세션 탐색·재생·뒤로 탐색, 세션 경계 4건, 18,000초 원본 연속성, unavailable fallback이다. 실패 14건은 네 무리로 나뉜다 — ①경계 seek 11건이 `audio.currentTime` **1ms** 단언인데 실측 오차가 **10~50ms**(AAC 1프레임 21.33ms)이고 이벤트 시계도 같은 값만큼 이동 ②`slides-r17-clean-257`은 덱 진입 상태가 이미 첫 스텝(`page 2 @ 2239.5`)이라 전환 기록 0건 ③`slides-final-290` 6쪽 디코드 오류는 서버 200·완전 전송(105,528B)이고 547장 Pillow 디코드 실패 0건이라 관측 경합 ④`missing-fallback`은 서버 영수증에 404·complete가 있는데 CDP 대기 조건이 불성립. **제품 결함으로 확정된 항목은 0건**이며 판정 기준 보정 후 재실행이 필요하다. [영수증](conference/P1C_B_MACOS_HARNESS_20261112.md) **P1c-B 판정 보정 후속**: 실제 native setter 요청은 원래 이벤트 시각에서 세션 offset을 뺀 값과 정확히 비교하고, 요청이 정확한 경우에만 AAC 3프레임(64ms) read-back을 허용했다. 첫 장표 baseline·현재 source에 귀속된 decode·현재 탐색의 완전한 manifest 404 영수증을 관측한다. Linux 집중 **96/96**, npm **3,617/3,617·fail 0·skip 0·complete:true**, typecheck·static·timeline **9,168/9,168**·CSS/preload check 통과. 실자산 없음으로 **skip exit 2·브라우저 0회**이며 Mac 재측정 전 수용은 미완료다. 원본 JSON의 통과 경계는 4가 아니라 **3개**로 열거돼 있다. 11개 실패 값은 URL의 0.1초 반올림과도 일치하므로 AAC 단독 원인은 미확정이며, 달라진 실제 재요청을 64ms로 숨기지 않는다. [후속 영수증](conference/P1C_B_HARNESS_FIX_20261112.md) **P1c-B macOS 재실행(HEAD `bee29b2`, 14:20–14:27)**: 같은 격리 절차로 실제 547장·15세션을 다시 돌려 **7/20**이다. HTTP·preflight·실행 중 자산 불변은 통과했고 `missing-fallback`·`unavailable-fallback`이 새로 통과했다. 남은 13건은 모두 **제품 쪽**이다: 경계 11건은 정확한 첫 요청 뒤 `pageshow`가 URL 반올림값(0.1초)으로 다시 seek하는 자기 메아리이고(통과 3건은 목표가 이미 0.1초 격자), 장표 2건은 `t=2401.74`가 URL `2401.7`로 반올림돼 이전 구간으로 떨어져 6쪽이 표시되지 않으며 `t=2239.5`(r17 2쪽)는 데이터상 290구간인데 `이 구간에 맞는 장표 없음`을 표시한다. `t=2401.8`은 6쪽으로 정상 표시돼 반올림 가설을 뒷받침한다. Range 미지원 파이썬 서버의 시각 고정 현상은 **환경 오탐으로 폐기**했다. [영수증](conference/P1C_B_MACOS_RERUN_20261112.md)  2026-11-12 P1c-B 제품 결함 판정: `pageshow`가 URL의 0.1초 반올림 값으로 다시 seek하는 자기 메아리(경계 11건, 목표가 0.1초 격자면 통과)와 장표 조회 불일치(`t=2401.74`→URL `2401.7`로 이전 구간, `t=2239.5`는 `state.time` 정확하나 "장표 없음" 표시)가 원인이다. 수정 범위는 ① URL 기록과 자기 에코 무시(마지막 기록값과 일치하면 재seek 금지) ② 세그먼트·페이지 조회를 캡션과 같은 인덱스로 통일 ③ 경계는 AAC 1프레임(21.33ms)+clock tick 이내이면서 표시 자막·장표가 목표 세그먼트와 일치하는 의미론적 단언으로 검증. 계약 완화·main push·배포 금지. **딥링크 단독 프로브(14:46–14:49, HEAD `0befbd2`)**: 20케이스를 돌리지 않고 4개 URL만 열어 원인을 더 좁혔다. `t=2401.74`는 URL이 `2401.7`로 반올림돼 `final/0002.webp`+빈 상태 문구, `t=2401.8`은 정상 6쪽, `t=2114.88`은 `2114.9`로 굳고(`audio.currentTime` 2114.9) 장표 없음. **r17 2쪽은 장표가 없는 게 아니라 `r17/0002.webp`가 로드된 채 `display:none`이고 그 위에 `conference-stage-message`가 뜬다** — src 결정 경로와 표시 여부 경로가 서로 다른 상태를 본다. [프로브 기록](conference/P1C_B_DEEPLINK_PROBE_20261112.md) **P1c-B 20/20 통과(15:01–15:03, `31fea06`)**: 제품 수정 `31fea06`을 실제 547장·15세션 격리 사본에 적용해 하네스를 다시 돌려 **cases 20·passed 20·failed 0·skipped 0·exitCode 0**이다. preflight·`sourceIntegrity.unchangedDuringRun`·이미지 547/547=200·세션 15·Range 45건 전부 206이 통과했고, `slides-final-290`·`slides-r17-clean-257`·14개 경계·세션 연속성·두 폴백이 모두 passed다(Chrome 157 headless 1440×900, 80초, 보고서 5,147,656B `87be535c…`). 수정 후 딥링크 프로브는 `t=2401.74`→`final/0006.webp`, `t=2239.5`→`r17/0002.webp`(문구 없음), `t=2114.88`→URL·`currentTime` 유지이며 빈 장표는 222번 구간 `page:null`이라 정상이다. 계약 임계값은 그대로다. **남은 것**: 사람 청취 0/10·시각 검수, A-10 1시간 메모리, 부하 낮을 때 Mac 전체 `npm test` 1회. [통과 영수증](conference/P1C_B_MACOS_PASS_20261112.md) **5축 QA(2026-11-12 15:12–15:26, HEAD `f5470bf`, `dist`=`31fea06`과 동일)**: 실제 브라우저(설치 미디어 서버 8903, 547장·15세션)로 확인했다. **기능** 하네스 20/20 유지(같은 `dist`, 재실행 아님), A-5 레이아웃·키보드 `verify-conference-browser` **14/14**(9개 폭 + 폴백·내비 5, 실패 0, `build/qa-p1c-b-20261112/conf-browser/report.json`, `sourceCommit` `f5470bf`, 작업 트리 변경 0). **시각** 320·390·768·1440 스크린샷 `build/qa-p1c-b-20261112/`, 가로 오버플로 0·그려진 h1 1개, 겹침 1건 발견 → `Q-P1c-B-1`. **접근성** 탭 13스톱 모두 `2px solid rgb(144,178,255)` 포커스 링, 아이콘 버튼 `aria-label` 14/14·`aria-pressed`(장표 확대=false) 존재, 컨퍼런스 컨트롤 최소 44px, `prefers-reduced-motion:reduce`에서 전환·애니메이션 0s, 텍스트 대비 최소 4.9:1(배지 8.86·자막 13.84·페이지 필드 12.7). **성능** A-9 **6/6 통과 2,252–2,407ms**(예산 2,500, Fast 4G, `build/qa-p1c-b-20261112/a9/report.json`). **일관성** 그라디언트 0·그림자 0·백드롭 0·필 배지 0·글리프 이모지 0·9–10px 0(11px 6건은 출처·법적 고지·설명이라 허용 목록 검토, R18 F3 범위), 비브랜드 블루 `rgb(41,98,255)` 4건은 R18 F2 범위로 이관. 요약 [QA 영수증](evidence/qa-p1c-b-20261112/summary.json). **Q-P1c-B-1 해소·5축 QA 통과로 R14 완료(2026-11-12 15:52, `c1377c3`).** Pro가 장표 크롬을 16:9 프레임 밖 상단 바로 옮겼고, 이 Mac 실자산(547장·15세션, `build/p1c-media-20261112` 설치 사이트)으로 320·390·768·1440에서 **도구∩장표·배지∩장표·도구∩스테이지 전부 0**, 도구 3종 `elementFromPoint` 3/3, 타깃 44×44(768+ 56×44), h1 1개, 가로 오버플로 0을 확인했다. 하네스: 미디어 **20/20**(실패 0·exit 0), 컨퍼런스 레이아웃·키보드 **14/14**, A-9 **6/6**(2,258.6~2,317.8ms, 예산 2,500). 새 발견은 320 배지의 단어 중간 줄바꿈 1건으로 **Q-P1c-B-2(보류 — R19 P5 타이포 축)**에 기록했다. 사람 청취 0/10은 P1 수용 항목으로 별도 유지한다. 요약 [QA 영수증](evidence/qa-q-p1cb-1-20261112/summary.json). |
| Q-P1c-B-1 장표 크롬이 장표 표면을 덮음 | **해결 — `c1377c3` · 4뷰포트 교차 0 확인(2026-11-12 15:50)** | 미매핑 구간(t=3283, `page:null`)에서 직전 장표 7쪽이 유지된 채 `.conference-stage-tools`(확대·전체화면·페이지 필드)와 `이 구간에 맞는 장표 없음` 배지가 장표 위에 겹친다. 실측(겹침 O 4/4 뷰포트): 320 장표 266×150 위로 도구 164×44(99,211)·배지 122×24(5,328), 390 장표 336×189 위로 도구 164×44(169,243)·배지 122×24(5,400), 768 장표 638×359 위로 도구 196×44(511,226)·배지 140×30(85,538), 1440 장표 974×548 위로 도구 196×44(1089,95)·배지 140×30(327,596). A-6의 배지 자체는 계약대로이지만 배치가 A-5 “자막·컨트롤이 장표를 가리지 않는다”와 충돌하고, 320에서는 도구가 장표 제목 띠를 덮는다. 요구: 장표 크롬을 16:9 프레임 밖(스테이지 상단 바)으로 옮기고 배지도 장표를 덮지 않게 배치. 수용: 320·390·768·1440에서 크롬∩장표 = 0, 44px 타깃·A-6 배지 유지. 증거 `build/qa-p1c-b-20261112/conf-*.png`·`stage-1440.png`. **검증(2026-11-12 15:50, `c1377c3`)**: 실자산 설치 사이트에서 320·390·768·1440 전부 도구∩장표 0·배지∩장표 0·도구∩스테이지 0, 히트테스트 3/3, 타깃 44×44, 배지 유지, h1 1개, 오버플로 0. 미디어 20/20·레이아웃 14/14·A-9 6/6. 스크린샷 `build/qa-q-p1cb-1-20261112/unmapped-{320,390,768,1440}-3283.png`·`mapped-*.png`. |
| Q-P1c-B-2 장표 없음 배지가 좁은 폭에서 단어 중간 줄바꿈 | **보류 — R19 P5 타이포 축으로 이관** | 320×740에서 `.conference-page-status`(`이 구간에 맞는 장표 없음`)가 `overflow-wrap:anywhere`·11px·88.4×32로 `이 구간에 맞는 장` / `표 없음`처럼 `장표`를 갈라 두 줄이 된다(문자 단위 Range 실측). 390 이상은 한 줄이라 문제 없음. 요구: A-6 배지 문구는 유지하고 `word-break:keep-all` + `overflow-wrap:break-word`로 단어 경계에서만 줄바꿈하며, 좁은 폭에서도 12px 아래로 줄이지 않는다. **사유**: 같은 파일·같은 타이포 토큰을 R19 P5(D-1~D-8·F3 9–12px)가 이미 다룬다. **재개 조건**: R19 P5 착수 시 함께 수정하고 320에서 `장표`가 한 줄에 남는지 Range로 재측정. 증거 `build/qa-q-p1cb-1-20261112/unmapped-320-3283.png`. |
| Q-R16-1 h1 하네스 컨퍼런스 보충 4케이스가 항상 타임아웃 | **보류 — R19 P5(테스트 정비)로 이관** | `scripts/verify-page-heading-browser.mjs`의 보충 케이스가 `conference-player.dataset.state === empty`를 기다리지만 `dist`의 `unavailable` 스텁 manifest에서는 플레이어가 `ready`가 된다. 직접 프로브(boot `ready`·page `conference`·state `ready`)로 h1 `컨퍼런스 복습`이 그려진 **1개**, 320·390·768·1440 가로 오버플로 **0**, 대시보드 헤더 소속 정상이라 **제품 결함이 아니고** 4케이스만 `Timed out: conference-*-ready data`로 exit 1이 된다. 요구: 준비 조건을 `ready`(스텁 폴백 포함)로 확장하고 컨퍼런스 h1 단일성·헤더 소속 단언은 유지. **사유**: 제품 코드가 아니라 테스트 준비 조건이고, 같은 하네스 계약 파일을 R19 P5 QA 배치가 함께 만진다. **재개 조건**: R19 P5에서 조건 수정 뒤 하네스 exit 0 확인. |
| R15 ETH·MSTR 지표 범례 오버레이 | **완료 — 53/53, 투명 오버레이** | WP-D 뒤 `headerInset`에 범례 높이를 예약(`reserveHeight()`)해, ETH·MSTR의 읽기 행·범례가 차트 위가 아니라 차트가 시작되기 전 빈 밴드에 놓였다(BTC는 범례가 차트 위에 투명하게 겹친다). 수정: 두 뷰의 `headerInset`에서 `reserveHeight()`를 제거해 플롯 top을 ETH 171→100px, MSTR→88px로 올리고 범례(52–163px)가 차트 위에 겹치게 했다. 배경은 `rgba(0,0,0,0)`(투명). 하네스 계약도 "범례가 플롯을 덮지 않는다"에서 "플롯 위에 겹치되 배경 투명·플롯 밖으로 나가지 않는다"로 교체했다. **판정**: ETH 후보 하네스 53/53·실패 0(exit 0). 플롯 top은 ETH 100px·MSTR 88px로 올라갔고, 범례는 `rgba(0,0,0,0)`로 차트 위에 겹친다. 620px 이하에서는 기본 접힘(44px)이라 차트 범례 칩과 첫 캔들을 가리지 않으며, 320에서 `.chart-legend-open` 히트가 칩 자신임을 확인했다. 반응형 44는 다음 게이트에서 재확인한다. |
| R16 티커 영역의 h1 제거 | **완료 — 5축 QA 통과** (`3863765`, 기록 `5ced9d8`) | §A-5.2(1): 종목 버튼 내부 고정 좌표와 두 줄용 padding을 제거하고 h1을 플롯 위 22px 정상 흐름 라벨로 분리했다. 단일 h1·종목 버튼 접근성/키보드 코드·compare 320/390 배치 계약 유지. 사용자 실측 1,680px² 겹침과 양의 소수 픽셀 교차를 실패로 고정하는 회귀 포함, 관련 단위·계약 **148/148**, typecheck·static **968/219/972**, preload 재생성/--check 통과. Pro 환경은 Chromium `socket() failed: Operation not permitted`로 브라우저 0건이었고 판정은 이 Mac이 맡았다. **Mac 실측(2026-11-12 16:12–16:34, HEAD `3863765`, Chrome 157, 설치 자산 1,530파일·manifest 163,622B `3380d7d5…`)**: h1 하네스 **15/15**(320·768·1440 × BTCUSD·ETHUSD·MSTR·BMNR·compare) + 390 보충 4/4 + compare-390 + layout-shift **2/2**, 모든 케이스에서 그려진 h1 **1개**·`h1∩종목버튼` **0**·`글리프∩티커` **0**·`라벨행∩플롯` **0**·중복 제목 0·가로 오버플로 0. **시각** 스크린샷 20장 `build/qa-r16-20261112/heading/`(`ETHUSD-1440`(원 결함 케이스)·`BTCUSD-320` 포함). **접근성** 종목 버튼 `aria-label="종목 선택 · 비트코인 / USD · BTCUSD"`·`aria-haspopup="dialog"`·네이티브 BUTTON, 포커스 링 2px, 타깃 88×44(320)·104×44(768)·128×28(1440, fine 포인터에서 h1용 padding 제거로 원래 높이 복원), h1 `aria-describedby="atlas-page-description"` 유지. **성능** A-9 **6/6**(2,246.1–2,314.7ms, 예산 2,500). **일관성** 추가 그라디언트·그림자·backdrop 0, 새 폰트 크기 12px 1건, 제목색 `var(--text)`. **회귀** 컨퍼런스 레이아웃·키보드 **14/14**, 미디어 **20/20**(exit 0). 새 발견은 하네스 준비 조건 1건뿐으로 **Q-R16-1**(제품 결함 아님·R19 P5 이관). [QA 영수증](evidence/qa-r16-20261112/summary.json), [구현 기록](evidence/r16-heading-20261112/README.md). |
| R17 가격 축 오버레이 점검 | **완료 — `fb4cb4c` 하네스 16/16, Q-발견 0** | §A-5.2(2): 공용 SVG 축을 최종 paint owner로 올리고 표면 상단부터 하단까지 축선·경계 그리드를 추가했다. 실제 가격 변환과 64px 거터·4px 라벨 inset 유지, HTML 범례·예측 설명은 거터를 비운다. BTC 캔들 최신 태그는 실제 거래소 close 사용. 빈 구간·출처 wrapper·커서·export 보존. 브라우저 계약은 320/390/768/1440 × BTC/ETH × 기본/캔들 **16케이스**, 정렬 **8쌍**, text ink·요청 viewport·중심 hit·foreground 가림 0·축선 연속·원자료 가격·±2px·overflow 0을 검사한다. 관련 회귀 **484/484(39파일)**, 생성물 **18/18**, static **968/219/972**, CSS·preload 재생성/--check 통과. 새 R17·기존 53-case는 Chromium socket EPERM으로 각각 **0/16·0/53 실행**, 스크린샷·hit 실측 0. 환경 교체 전 DOM 축 **43/43**·panels **138/138**·typecheck/build:web 통과는 별도 기록이며, 복구 후에는 linkedom/tsc/skullet 부재로 해당 재검증 차단. Pages 검사도 미완료(앞선 artifact 목록 불일치, baseline 대조 없음). 보호 4파일·기존 Mac 영수증·임계값 보존. [구현/재실행](evidence/r17-price-axis-20261112/README.md) · [검증 영수증](evidence/r17-price-axis-20261112/summary.json). **Mac 5축 QA(2026-11-12 17:00–17:45)**: 축 라벨 x BTC=ETH 차이 **0px**(320·390·768·1440), 축선 전높이(0→670/774/906/798), 라벨·태그 `elementFromPoint` 전부 페인트 레이어 적중, h1 1·오버플로 0, 단위 **3,646/3,646**, A-9 **6/6·2,231.1–2,262.0ms**. 자체 하네스는 **4/16**으로 실패 → `Q-R17-1`. **하네스 수정 재실행(2026-11-12, `ebbda89`)**: sr-only `clip-path:inset(50%)` 노드를 충돌 검사에서 제외한 뒤 같은 Mac에서 **16케이스 전부 실행·14/16 통과**, 정렬 8쌍 8/8, 커버리지(legend·event·forecast 각 16) 통과로 `Q-R17-1`은 닫혔다. 남은 2건은 **ETHUSD-320 기본/캔들**의 `frame-axis-0: hud hud-7:time#eth-bar-time:text-0 occludes 13 square CSS pixels`이며, 제품 쪽 결함이라 **`Q-R17-2`**로 등록했다. **제품 수정 재실행(2026-11-12 17:57, `fb4cb4c`)**: 620px 이하 `.eth-readout` max-width를 `--plot-right-gap`만큼 예약했다. 같은 Mac에서 required 16 · attempted 16 · **passed 16 · failed 0**, 정렬 8/8, 커버리지 passed, exit 0. ETHUSD-320 기본·캔들 `#eth-bar-time` 상자가 x 210.95–277.4에서 **x 9–75.45**(거터 256–320 밖, 가림 0)로 줄바꿈됐다. 390은 right 274.98 < 거터 326. 스크린샷 16장 `build/qa-r17-20261112/axis3-fb4cb4c/`. A-9는 부트 경로가 그대로 재측정하지 않았고, 직전 `91cf41c` 6/6(2,231.1–2,262.0ms)을 유지 기록으로 둔다. CSS 델타에 색·폰트·그림자 추가 0. 새 Q-발견 0. 영수증 [axis3-fb4cb4c.json](evidence/qa-r17-20261112/axis3-fb4cb4c.json). |
| Q-R17-1 가격 축 하네스가 sr-only 노드의 `clip-path: inset(50%)`를 실패로 처리 | **해결 — `ebbda89`, Mac 재실행 12건 해소** | `scripts/verify-price-axis-browser.mjs`의 `clipped()`는 SVG `clipPath` 참조가 아닌 `clip-path`를 만나면 `unsupported clip geometry`로 케이스를 실패시킨다. 실제 16케이스 중 **12건이 `p#indicator-readout-date`**(1×1, `clip-path:inset(50%)`, `aria-describedby` 전용 sr-only)에서 실패하고 4건만 통과했다(BTC 320·90만 통과). 제품 시각 결함이 아니라 하네스가 비표시 노드를 처리하지 못하는 문제다. 재개 조건: 0면적·시각 비표시 노드를 충돌 검사에서 제외하고 **16/16**을 보고할 때. **해결(2026-11-12)**: Pro가 `ebbda89`에서 `scripts/price-axis-browser-contract.mjs`에 0면적 inset 판정을 추가하고 `scripts/verify-price-axis-browser.mjs`에서 그런 노드만 장애물 수집에서 제외했다(계약 테스트 `tests/price-axis-browser-clip.test.mjs` 236줄 추가, 19/19 통과 주장). 이 Mac 재실행에서 **12건이 그대로 해소**되어 4/16 → **14/16**이 됐고, 케이스·임계값은 줄지 않았다(required 16·attempted 16·alignment 8/8·coverage passed). 잔여 2건은 별개 원인이라 `Q-R17-2`로 분리했다. 영수증 [axis-rerun-ebbda89.json](evidence/qa-r17-20261112/axis-rerun-ebbda89.json). |
| Q-R17-2 ETH 320에서 리드아웃 날짜가 가격 축 거터를 침범 | **해결 — `fb4cb4c`, Mac 16/16** | `ebbda89` 재실행에서 **ETHUSD-320 기본·캔들 2케이스**만 실패: `frame-axis-0: hud hud-7:time#eth-bar-time:text-0 occludes 13 square CSS pixels`. 320에서 `#eth-bar-time`(2026-11-06) 상자가 x 210.95–277.4로 **64px 가격 축 거터(우측 256–320) 안까지** 들어가고, x=256의 축 경계선이 날짜 글자를 지나간다. R17 계약은 범례·예측 설명이 거터를 비우도록 했지만 **ETH 리드아웃은 대상에서 빠져** 있다. BTC 320은 리드아웃 폭이 짧아 문제 없고, 390 이상은 전부 통과다. 요구: 320에서 리드아웃(특히 `#eth-bar-time`)이 가격 축 거터를 침범하지 않게 줄바꿈·예약 폭을 조정하고, 축이 최종 페인트 소유자라는 R17 계약과 16케이스 임계값은 그대로 유지한다. 재개 조건: 하네스 **16/16** 재실행. 증거 `build/qa-r17-20261112/axis2/ETHUSD-320-{default,candles}.png`, 영수증 [axis-rerun-ebbda89.json](evidence/qa-r17-20261112/axis-rerun-ebbda89.json). **해결(2026-11-12 17:57, `fb4cb4c`)**: 날짜를 숨기거나 자르지 않고 줄바꿈만 바꿔, ETHUSD-320 기본·캔들 둘 다 `#eth-bar-time`이 x 9–75.45로 거터 밖에 있다. 같은 하네스가 **16/16·정렬 8/8·가림 0·exit 0**이었다. 스크린샷 `build/qa-r17-20261112/axis3-fb4cb4c/ETHUSD-320-{default,candles}.png`, 영수증 [axis3-fb4cb4c.json](evidence/qa-r17-20261112/axis3-fb4cb4c.json). |
| R18 AI 티 제거·브랜드 일관성 | **R19 P5로 흡수 — 감사 완료** | 1440/390 계산 스타일 감사(컨퍼런스 142·차트 806·릴레이 684요소): 그라디언트·그림자·백드롭·필 배지 0(유지 대상), `☰` 유니코드 글리프 1, `.conference-play` 비브랜드 블루 `rgb(41,98,255)` + 50% 원형, 12px 미만 텍스트 차트 216·릴레이 150·컨퍼런스 8(최소 9px), `재시도` 중복 블록. 요구: `REQ_ANTI_AI_DESIGN_20261112` D-1~D-8. **수정 금지(사용자 지시)**: Pro에 F1→F2→F3→F4 순 1건씩 요청. |
| R19 Funnest 스타일 전면 리뉴얼 | **P0 미완 — Mac 10/10 실패, Q-R19P0-1** | 참조 `funnest-xyz/funnest-charts` @ `39cb29ae`(Apache-2.0): 바이올렛 `#6c4dff`, Pretendard 17px/1.6, 1140/1280 컨테이너, 알약 버튼·둥근 카드·부드러운 그림자, 빨강 상승/파랑 하락. 단계 P0 토큰·타이포 → P1 셸·내비 → **P2a-0 `@funnest/charts-ui@0.6.16` 스파이크(패리티·번들·A-9)** → P2 차트 크롬 → P3 대시보드 → P4 컨퍼런스 → P5 QA(D-1~D-8). 수용 U-1~U-7. **수정 금지(사용자 지시)**: P1c-B QA·R16·R17 이후 단계별 Pro 1건. R18은 P5로 흡수.  **P0 후속(2026-11-12, 기준 `c8b06c5`)**: Pretendard OFL self-host 92 WOFF2·2,957,724B, 단일 root 라이트/다크·바이올렛·15/16/17px 및 토글, CSS/프리로드 산출물 갱신. 정적 대비 40/40(텍스트 최소 5.0686, 아이콘 최소 6.3280), authored CSS 47개·inline 3블록의 root 밖 색 0. 전체 UI 하드코딩 0은 보호/레거시 JS 잔여로 **미충족**. Chromium socket EPERM으로 실제 P0 0/10·R17 0/16·스크린샷 0이며 A-9 0/6. tsc·Skullet/Vite 의존성 부재로 typecheck·React/Pages 재생성 차단. P1·P2a·P2·P5는 시작하지 않았고, 이전 R17 Mac 완료·기존 임계값은 보존. [P0 구현·수용 한계](evidence/ui-renewal-p0/README.md) · [검증 수치](evidence/ui-renewal-p0/summary.json). **Mac 게이트(2026-11-12 18:54–19:10, `48c314c`, Chrome 157)**: `verify-ui-renewal-p0-browser` required 10 · attempted 10 · **passed 0 · failed 10**. 실패는 10건 모두 `chart/page-heading: native sample centre is covered by another element` 한 줄이다. `#atlas-page-heading`(가격 차트, 12px) 글자는 스크린샷에서 보이고, 검사 점은 전체 너비 상자의 중심이다(BTC 320 상자 x 8–312·y 57–71, hit `#lab-chart-stage`; ETH 320 y 4–18, hit `#main`). 정적 토큰 **40/40**, Pretendard 글림 **8/8**·fallback **2/2**(Apple SD Gothic Neo), 측정 대비 **106/106**(최소 5.1449, 기준 4.5; 표지 커버리지 38/40·passed 36·heading 미검증), 본문 320=15px·1440=17px, 가로 오버플로 0, 테마 재실행 10/10, 보호 4파일·`minRight=64` 불변. P0를 닫지 않는다. 스크린샷 20장 `build/qa-r19p0-20261112/p0-48c314c/`. 영수증 [p0-48c314c.json](evidence/qa-r19p0-20261112/p0-48c314c.json). |
| Q-R19P0-1 P0 헤드 표본이 전체 너비 상자 중심을 가림으로 실패 처리 | **열림 — 큐 맨 앞** | `48c314c` Mac 재실행에서 10케이스가 같은 이유로 실패했다. 보이는 「가격 차트」 글자는 가려지지 않았다. 요구: 보이는 글자 잉크를 맞히게 표본을 고치거나, 글자가 실제로 가려져 있으면 쌓임을 고친다. 빈 상자 중심을 검사에서 빼서 항상 통과하게 만들지 말 것. 케이스 10·대비 4.5/3.0·폰트 증거·오버플로 0·보호 4파일·가격 기하는 유지. P1은 시작하지 말 것. 재개 조건: 같은 게이트 **10/10**. 증거 `build/qa-r19p0-20261112/p0-48c314c/BTCUSD-320-light-chart.png`, 영수증 [p0-48c314c.json](evidence/qa-r19p0-20261112/p0-48c314c.json). |
| R20 인증·비공개 접근 (P4) | **대기 — 요구사항만, 구현 전** | `docs/requirements/REQ_AUTH_PRIVATE_20261109.md`(2026-11-09): 초대 토큰 가입→관리자 승인, 역할 `guest/pending/member/admin`, Google 로그인, 프로필·비밀번호·탈퇴, 사이트 전체 비공개(블러), 보안 7종. 현재 `dist`에 로그인·세션·권한 코드 0, 사이트는 공개. 미결정 4건(좌석 관리, 초대 만료·동시 세션, Google 단독 vs 비밀번호 병행, 파기·백업 보존). **시작 조건**: 미결정 4건 확정 + 데이터 모델. **금지**: 계정·권한 변경, 유료 용량, 개인정보 정책 임의 선택. |
| R21 릴레이 RAG (무료 기본 + OpenAI 크레딧 우선) | **대기 — 설계 확정** | `REQ_RAG_FREE_ARCH_20261112.md`: Vectorize·D1 없이 ① 빌드 시 Workers AI `bge-m3`(1024d) 임베딩 → int8 정적 인덱스(<2MB) ② Worker/클라이언트 코사인 top-k ③ Workers AI 무료 LLM 또는 추출형 답변+인용 ④ 한도 초과 시 자동 유료 전환 금지·추출형 폴백. 코퍼스 `dist/data/relay/index.json` 0.3MB, 무료 10k neurons/일. 수용 F-1~F-6. **OpenAI 크레딧**: 2026-11-12 확인 $199.65 사용 가능, **2026-12-03 만료**($200 지급, $35 지급은 만료). 2026-12-03 이전에는 OpenAI API(임베딩·생성·평가·보강)를 우선 사용해 크레딧을 소진하고, 잔액 0·만료 후 무료 경로로 전환한다. **시작 조건**: P2a 리뉴얼 이후. **금지**: 결제 수단 추가·자동 충전·유료 승격, Vectorize/D1 생성, 검사 약화, 무의미한 크레딧 소진 호출. |
| P1a WP-A 화면 골격 (A-5) | **완료 `8e37aed`** (2026-11-12) | 장표 중심 + 하단 중앙 컨트롤 골격을 실제 문서 라우트 `?page=conference`로 넣었다. 장표는 16:9를 유지하며 데스크톱 최대 1,120px, 1024px 이상은 우측 자막 도크·1023px 이하는 모달 시트, 하단 중앙에 56px 재생/일시정지·±10초·이전/다음 장표·발표·행사 진행 바와 마커·다섯 속도·따라가기/자동 장표·덱 선택을 두고 전화기에서는 보조 설정을 메뉴로 옮겼다. Space·좌우 5초·Shift+좌우 30초·대괄호·F·D를 지원하고, URL·새로고침·뒤로가기에서 시간과 덱을 복원하되 자동 재생하지 않으며 라우트를 떠나면 오디오와 리스너를 정리한다. 소스 커밋은 `180c55d`(화면·라우트·스키마·검증기), `15cb679`(포커스 복원·리뷰 범위), `8e37aed`(오프라인 패키지 CSS)이고 증거는 [P1A_VERIFICATION_20261112](conference/P1A_VERIFICATION_20261112.md)·`docs/evidence/conference-p1a-20261112/`다. Pro Linux 검증: 컨퍼런스 14/14(실제 PNG 24), 타임라인 23/23(누락 0), `npm test` 3,424/3,424, compare PASSED, 반응형 44/44, WP6 30/30, chart-qa 12/12, typecheck·static(963 files/218 scripts/1,007 references)·Pages(12 files/9 routes). 이 회차 macOS 독립 확인(HEAD `ce8df92`): 9개 폭 레이아웃이 Linux 수치와 같고(390 338×190, 320 268×151, 768 632×356, 1024 748×421, 1440·1280 976×549, 1920 1,120×630, 1023 739×416, 767 647×364; 가로 오버플로 0, 그려진 h1 1), 타임라인 CLI 23/23·발표 15·덱 2·마지막 `t1` 4,000·누락/추가/중복/변경 0, typecheck·static 통과, `npm test` `complete:true` 3,424/3,419·실패 0·건너뜀 5(2 배치, Docker PATH 포함). **macOS 한계**: 같은 하네스의 네이티브 `<select>` 키보드 구동이 macOS Chrome에서 값을 바꾸지 못해 14케이스 중 10개가 `native selection final-290` 30초 타임아웃이다(레이아웃 측정은 그 전에 끝난다). 통과 4건은 missing-timeline·invalid-timeline·navigation-lifecycle·navigation-ETHUSD였다. 다만 다른 회차 실행에서는 같은 4건 중 `navigation-BTCUSD`가 통과하고 `navigation-ETHUSD`가 `play before leaving conference`로 실패해 내비게이션 두 케이스가 실행마다 뒤바뀐다. 원인은 `select()`가 macOS Chrome `--headless=new`에서 외부 AppKit 팝업으로 열리는 네이티브 `<select>`에 CDP 키 이벤트를 보내는 경로이며, 저장소에 내부 팝업 모드를 쓰는 `scripts/native-select-keyboard.mjs`가 이미 있다. 두 회차 기록은 [P1A_LOCAL_GATE_20261112](conference/P1A_LOCAL_GATE_20261112.md)에 나란히 남겼다. 따라서 P1a 상호작용 통과 근거는 Linux뿐이고 macOS 재현은 이 플랫폼 제약으로 막혀 있다. |
| R11 최종 자산 잠금 (WP-A A-0) | **완료** (2026-11-12) | `docs/conference/deck-lock-20261112.json`을 커밋했다. 잠금 덱은 `final-290`(정본, PDF `4b1affb4…` 290쪽 63,311,016B 2026-11-09 22:37:14 / PPTX `30dac26b…`)과 `r17-clean-257`(PDF `3760cd72…` 257쪽 20,233,799B 2026-11-10 14:29:38 / PPTX `43fb4f2d…`)이다. 저장소 밖 원본 경로에서 SHA-256·크기·수정 시각·PDF 페이지 수를 다시 읽어 4개 파일 전부 일치를 확인했다(불일치 0). 소유 세션 `yyOkfU0FkYzNPO8f`의 2026-11-12 03:28 README가 "이 폴더는 정본이 아니다. 정본은 `00_열람/플스포_강연자료_최종` 290쪽"이라고 밝혀 QA24 복원본(`59d6fdbe…`, 257쪽)은 `unmappedCandidates`(adopted:false)로만 기록했고 채택은 재잠금 사유로 남겼다. 요청서 §5의 R17 접두사 `baa2224e…`는 현재 어떤 파일과도 일치하지 않아 실제 해시 `3760cd72…`로 대체 기록했다. 이 잠금은 P1b 타임라인·페이지 매핑의 착수 조건을 해제하지만, P1a(목업·구조·스키마 검증기)는 잠금 전에도 가능했으므로 우선순위는 P1a가 먼저다. |
| P1b WP-A 타임라인·플레이어·동기화 | **구현·기능 검증 완료 / A-9 통과(6/6)·사람 검수 0/10** (`5d6419e`, 기록 `8487b26`) | 실제 SRT **9,168행**(plaud-1 7,994 + plaud-2 1,174, plaud-2 +18,000초, 마지막 `t1` 20,396.7초≤20,400)을 원문·시각·ID 그대로 보존하고 프로그램 15개(`00~14`, 개회 1·강연 11·휴식 2·폐회 1)를 유지했다. `dist/conference/timeline.json`(1,044,921B, sha256 `fd15b3ef18213b9adc3bff87d523cc1c2ca907ca59163b646d55308c5d1666ad`, gzip 187,031B, brotli 산출 135,408B)을 실제 라우트에 연결했고(`dist/app.js`가 `timelineUrl` 전달, production player에 합성 픽스처 참조 0건) 초기 자막 DOM 0행·첫 자막 창 열기 시 생성, 덱별 페이지 조회 인덱스를 쓴다. 자동 매핑 초안은 final-290 **413행/4.50%**, R17 **545행/5.94%**(강연만 8,649행 기준 4.78%·6.30%)이고 범위 이탈·페이지 역행·격리 페이지 사용·경계 횡단 매핑·미래 문맥은 각 0건, 개회·휴식·폐회 519행은 `page:null`, 보조 장표 생성 0개다. **macOS 독립 확인(HEAD `8487b26`)**: 타임라인 CLI **9,168/9,168**·누락/추가/중복/변경 0·발표 15·덱 2·마지막 `t1` 20,396.7, `build-conference-timeline.mjs --check` 재현 바이트 일치, 컨퍼런스 **14/14·실패 0·exit 0**, `npm test` `complete:true` **3,456/3,451·실패 0·건너뜀 5·2 배치**(Docker PATH 포함). Pro Linux: 타임라인 빌드 13/13, player+route 32/32, typecheck, verify:static 964 files/218 scripts/1,007 references. **미충족·남은 것**: ①A-9 초기 로드 2.5초 예산 **0/6**(4,542.6~4,893.0ms, timeline 요청은 4,127.1~4,440.4ms에 시작)이고 초과분은 timeline 전송 전 공용 부트 경로다. `dist/index.html`이 stylesheet `link`를 **41개** 개별 요청하고(165ms latency에서 요청 수가 지배 비용) `dist/app.js`는 55,926B/gzip 17,961B로 전송량 문제가 아니다. ②A-10 1시간 재생 메모리 미측정 ③사람 청취 **0/10**·±0.5초 동기화·실제 장표 전환 정확도 미검증 ④547장 WebP 렌더·오디오 세션 분할 없음(현재 장표·오디오는 '없음' 정직 표시, 미매핑 덱 배지) ⑤`verify:pages`는 시작 커밋 `339d5b5`에서도 exit 1인 기존 실패(CSS 263,070→263,224B +154B, JS 내용 해시 동일) ⑥OCR 충돌 18페이지·일정표 기준 경계 3곳 확인 필요. **A-9 라운드 1**(구현 `ee6faf9`, 기록 `6108910`): CSS 링크 41→4와 conference 진입 modulepreload로 macOS 재측정 **3,161.8~3,267.6ms**·기능 6/6·수용 **0/6**(직전 4,542.6~4,893.0 대비 −1.4초), 컨퍼런스 **14/14** 유지, macOS `npm test` **3,459 pass+5 skip·실패 0(3,464)**. 같은 커밋에서 회귀 게이트도 macOS로 돌려 **반응형 44/44·WP6 30/30·chart-qa 12/12·compare PASSED**(실패 0)를 확인했다, `build-site-styles --check` ok(원본 41·번들 2). 남은 병목은 대역폭이 아니라 **직렬 모듈 발견 14단계**다: 1440×900 기준 시작 시각이 175→564→748→922→1,115→1,203→1,382→1,560→1,766→2,175→2,331→2,497→2,691→**2,871ms(`timeline.json`, 전송 356ms)**로 각 계단이 RTT 165~190ms이며, 70요청 771,686B 중 순수 전송은 약 0.76초다. Pro Linux 샌드박스는 CDP 시작이 차단돼 브라우저 0건이었고, 수용 판정은 macOS 실측을 기준으로 한다. 정적 import 폐포 modulepreload + `timeline.js`/`timeline.json` HTML preload로 **라운드 2를 같은 스레드에 요청**했다([A9_MACOS_VERIFICATION_20261112](conference/A9_MACOS_VERIFICATION_20261112.md)). **A-9 라운드 2 통과(HEAD `e6c9a7a`, 구현 `1e0d071`)**: 정적 import 폐포를 HTML 부트 스크립트로 미리 발견시키고 `timeline.json`을 선요청한 결과, macOS Fast 4G 6개 뷰포트가 **2,277.6~2,330.7ms로 6/6 통과**했다(라운드 1 3,161.8~3,267.6 → 라운드 2, 최초 4,542.6~4,893.0 대비 −2.26초). 70요청이 모두 179ms 한 지점에서 시작해 14단계 계단이 사라졌고, `timeline.json`은 180ms에 시작해 context당 1회(6개 context 합계 6회)만 전송되며 총 전송은 769,501B로 오히려 2KB 줄었다. 페이지 전환 20.8~32.4ms(예산 150ms). 같은 커밋에서 컨퍼런스 **14/14**, 반응형 **44/44**, chart-qa **12/12**, compare **PASSED**, WP6 **30/30**(묶음 실행에서 `btcusd-768x1024` 1건이 native heading pan 타임아웃으로 실패했으나 같은 커밋 단독 재실행에서 30/30 통과 — 부하 플레이크로 판정하고 두 실행을 모두 기록), `npm test` `complete:true` **3,474 pass+5 skip(3,479)·실패 0**. 남은 것은 사람 청취 0/10과 A-10 1시간 재생 메모리. |



R1~R5가 전부 완료로 정리되어 R8 착수 조건을 충족했고, R8까지 이번 회차에 닫았다. 이 표의 완료 6행(R0~R5)과 R8이 이 자동화의 전 범위이고, 남은 것은 R6(WP-A 미디어·청취·PDF·Linux 원자 게시)와 R7(macOS 외부 AppKit 메뉴·Safari·실기기) 두 차단뿐이다. 원격 CI는 이 저장소에 존재하지 않으므로(GitHub Actions 아카이브·Workers Builds는 main watch) 어떤 판정도 '원격 CI 통과'를 근거로 쓰지 않았고 로컬 게이트 수치만 인용했다.

## 심층 QA 루프 (2026-11-12)

각 항목은 게이트 통과만으로 완료가 아니다. 아래 5축을 실제 브라우저에서 확인하고, 발견은 `Q-<항목>-<n>` 행으로 추가해 **큐 맨 앞에 재투입**한다. Q-발견이 0이거나 사유·재개 조건을 적어 보류했을 때만 원래 행을 완료로 바꾼다.

| 축 | 확인 | 증거 |
|---|---|---|
| 기능 | 계약 수용 기준 수치(예: P1c-B 20/20, R16 교차 0, R17 축 ±2px) | 하네스 출력·report.json |
| 시각 | 320·390·768·1440 겹침·잘림·오버플로·빈 밴드·가림 | `build/qa-<항목>-<날짜>/` 스크린샷 |
| 접근성 | 키보드·포커스 링·aria·44px·reduced-motion·대비 4.5:1 | 표본 측정 JSON |
| 성능 | A-9 2,500ms·레이아웃 시프트·자산 무게·요청 수 | 측정 로그 |
| 일관성 | 액센트·라운드·타이포 토큰, `REQ_ANTI_AI_DESIGN` D-1~D-8 | 계산 스타일 스캔 |

QA 결과는 해당 행에 수치와 스크린샷 경로로 남기고, 새 요구가 나오면 `docs/requirements/`의 관련 문서에 절을 추가한다. QA 없이 "완료"로 바꾸지 않는다.

### 전체 스위트·게이트 스윕 (2026-11-12 16:40–17:05, 제품 `3863765` / 문서 HEAD `d590982`)

R14의 남은 항목이던 "부하 낮을 때 Mac 전체 `npm test` 1회"를 이번 회차에 실행했다. 1분 부하 10.99에서 워크트리 `/private/tmp/atlas-r16-3863765/wt`(제품 `3863765`)로 돌렸다.

- **호스트 단위 배치**: `node --test` 331파일 **3,606 테스트 / 통과 3,600 / 실패 0 / 건너뜀 6**, exit 0. 건너뜀 6건은 ①프로세스 우선순위·시그널 5건(선택 로컬 기능 게이트) ②`conference-media-build`의 ffmpeg 픽스처 1건이며, 같은 파일을 `PATH=/opt/homebrew/bin:$PATH`로 다시 돌려 **18/18 통과**로 닫았다.
- **반응형**: `verify-responsive-workbench-browser` **11/11 여정 통과, 실패 0, 스크린샷 25장**(320·390·456·620·768·1024·1440 + 숏 뷰포트 3 + 폰→데스크탑→폰 아이덴티티), 보고서 sha256 `60ad6f56…`.
- **compare**: `verify-compare-shell-browser` **PASSED**, exit 0.
- **미실행·사유**: ①`npm test` 래퍼의 Docker linux/x64 고정 재생 배치 3파일은 이 Mac에 **Docker가 없어** `complete:true`가 성립하지 않는다(제품 회귀 아님, 환경 한정) ②`verify-wp6-browser` 30/30·chart-qa 12/12는 커밋된 `dist` 후보 오리진(`__wp6-candidate-source.json`)이 필요한데 로컬 후보 러너가 Linux 전용이라 이번에 돌리지 않았다. 직전 `e6c9a7a` 기록을 유지한다.
- 이 스윕에서 새 `Q-` 발견은 0건이며, R17 판정에는 쓰지 않는다(R17은 Pro 커밋 도착 후 별도 5축 QA). 영수증 [summary.json](evidence/gates-20261112/summary.json).

### R17 가격 축 5축 QA (2026-11-12 17:00–17:45, `91cf41c`)

Pro 구현 `91cf41c`(축 페인트 레이어·전높이 프레임·관측 종가 인용)를 이 Mac의 실제 사이트(1,530파일, 컨퍼런스 manifest 163,622B)로 판정했다. 영수증 [summary.json](evidence/qa-r17-20261112/summary.json), 스크린샷 `build/qa-r17-20261112/shots/`(BTC·ETH × 320·390·768·1440 = 8장).

- **기능**: 축 라벨 x가 BTC/ETH 완전 동일(**320: 260=260, 390: 330=330, 768: 659=659, 1440: 1331=1331, 차이 0px**), 축 경계선이 **플롯 전높이**(320 `0→670`, 390 `0→774`, 768 `0→906`, 1440 `0→798`), 보이는 라벨 전부가 `[data-price-axis-paint-layer]` 안에서 `elementFromPoint` 적중, 페인트 레이어가 SVG 마지막 자식. 4뷰포트 모두 **h1 1개·가로 오버플로 0**. 호스트 단위 스위트는 `91cf41c`에서 **3,646/3,646 통과(건너뜀 5, 실패 0, exit 0)**.
- **시각**: 8장 모두 라벨·태그가 차트 표면 위에 그려지고 잘림·가림 0. ETH는 **로그 가격축 + 예측 상단 여유** 때문에 최상단 눈금이 BTC보다 아래에 놓이지만(오프셋 BTC 59–79px vs ETH 161–204px) 거터 64px·라벨 열은 동일하다. 이 빈 밴드는 데이터 도메인 효과로 R17 수용 문장의 대상이 아니라고 기록한다.
- **접근성**: 포커스 가능 요소 **123 = 123**(R17 vs 직전 빌드), 시그니처 차집합 0, SVG 포커스 요소 33, `aria-live` 23, 축 라벨은 키보드 스톱이 아니며 표시 중 `pointer-events: bounding-box`(축 드래그), 숨김 시 `none`.
- **성능**: A-9 **6/6**, `sourceCommit` `91cf41c`, **2,231.1–2,262.0ms**(예산 2,500).
- **일관성**: `91cf41c`의 추가 CSS/HTML 라인에 색·폰트·그라디언트·그림자 변경 0건(그라디언트·그림자·백드롭 미추가). CSS 델타는 4파일 +11/-3.
- **막는 것(당시)**: Pro가 함께 넣은 자체 게이트 `verify-price-axis-browser`가 **4/16**에 그쳐 R17을 완료로 바꾸지 않았다 → **Q-R17-1**(하네스가 sr-only `clip-path:inset(50%)`를 미지원 기하로 처리). 이 항목은 아래 재실행에서 닫혔고, 새 제품 결함 `Q-R17-2`가 남았다.

### R17 하네스 재실행 (2026-11-12, `ebbda89`)

Pro가 하네스만 고친 커밋 `ebbda89`(`scripts/price-axis-browser-contract.mjs` +23, `scripts/verify-price-axis-browser.mjs` +18/-4, `tests/price-axis-browser-clip.test.mjs` 신규 236행)를 올려 이 Mac에서 그대로 재실행했다. 제품 코드·`dist`·보호 4파일은 이 커밋에서 바뀌지 않았다.

- **결과**: required 16 · attempted 16 · **passed 14 · failed 2**, 정렬 8쌍 **8/8**, 커버리지(legend·event·forecast 각 16케이스 관측) **passed**. 4/16에서 12건이 그대로 사라졌으므로 `Q-R17-1`은 하네스 수정으로 닫힌다.
- **잔여 2건(제품)**: `ETHUSD-320-default`·`ETHUSD-320-candles`가 `frame-axis-0: hud hud-7:time#eth-bar-time:text-0 occludes 13 square CSS pixels`로 실패한다. 320에서 `#eth-bar-time` 상자가 **x 210.95–277.4**로 우측 64px 가격 축 거터(256–320)에 들어가고 x=256 축 경계선이 날짜 글자를 지나간다. 스크린샷에서도 `2026-11-06`이 거터 안까지 이어지고 축선이 글자 사이를 지나간다. → **`Q-R17-2`**.
- **판정**: 하네스 게이트는 더 이상 거짓 실패를 만들지 않는다. R17은 `Q-R17-2` 제품 수정 후 재실행으로만 닫는다. 영수증 [axis-rerun-ebbda89.json](evidence/qa-r17-20261112/axis-rerun-ebbda89.json), 스크린샷 `build/qa-r17-20261112/axis2/`(16장).

### R17 제품 수정 재실행 (2026-11-12 17:57, `fb4cb4c`)

Pro 커밋 `fb4cb4c`는 620px 이하 `.eth-readout`의 max-width를 `calc(100% - var(--plot-right-gap,71px) - 9px)`로 바꾸고 스타일 번들과 캐시 키를 재생성했다. 가격 축 코드·64px 거터·하네스 임계값·보호 4파일은 그 커밋에서 바꿔지 않았다. 이 Mac에서 같은 16케이스·정렬 8쌍을 새 결과 경로로 재실행했다.

- **기능**: required 16 · attempted 16 · **passed 16 · failed 0**, 정렬 **8/8**, 커버리지 passed, exit 0. ETHUSD-320 기본·캔들 `#eth-bar-time` 상자는 x 210.95–277.4에서 **x 9–75.45**로 옮겨갔고 거터(256–320) 가림은 0이다. 390은 right 274.98로 거터 시작 326 앞에 멈춘다.
- **시각**: 16장 `build/qa-r17-20261112/axis3-fb4cb4c/`. ETH 320 기본·캔들 둘 다 `2026-11-06`이 두 번째 줄에 온전히 보이고 축 거터 앞에서 끝난다. 자른 글자는 없다.
- **접근성**: aria·키보드·히트 대상 변경 없음. 날짜는 숨기지 않은 보이는 텍스트다.
- **성능**: A-9는 재측정하지 않았다. 부트 경로는 `91cf41c`와 같고, 그 측정은 6/6·2,231.1–2,262.0ms(예산 2,500)이다.
- **일관성**: 추가 CSS에 색·폰트·그라디언트·그림자 0.
- **판정**: `Q-R17-2`를 닫고 R17을 완료로 바꾼다. 새 Q-발견 0. 영수증 [axis3-fb4cb4c.json](evidence/qa-r17-20261112/axis3-fb4cb4c.json).

## 2026-11-12 — WP-A 레이아웃 개정과 자산 잠금 게이트

- WP-A 화면 계약을 **장표 중심 + 하단 중앙 컨트롤**로 바꿨다(`REQ_WP_ABC` A-5, 2026-11-12 개정). 자막은 2줄 캡션을 기본으로 하고 전체 보기는 도크/시트로 분리한다.
- 개발 착수 전 **최종 자산 잠금(A-0)** 을 추가했다. `yyOkfU0FkYzNPO8f` 세션이 최종 PDF/PPTX를 확정하면 `deck-lock.json`(경로·SHA-256·페이지 수·생성 시각·소유 세션)을 커밋하고, 그 뒤에만 `timeline.json`과 페이지 매핑을 만든다. 잠금 전에는 목업·컴포넌트 구조·스키마 검증기까지만 허용한다.
- 2026-11-12 03:42 KST에 잠금을 성립시켰다(`R11`). 잠금 파일 `docs/conference/deck-lock-20261112.json`은 정본 290쪽과 R17 깔끔본 257쪽 4개 파일의 SHA-256을 원본에서 재계산해 고정했다. QA24 복원본은 소유 세션이 정본이 아니라고 밝혀 후보로만 남겼다. 이 잠금으로 P1b(타임라인·페이지 매핑)의 착수 조건이 열렸지만, 잠금 전에도 가능한 P1a 화면 골격을 먼저 진행한다.
- 리브랜딩·스카우트 대응 문서(`REQ_REBRAND_SCOUTING_20261112`)의 플스포컴퍼니·김동호 리서치를 보강했고, 요구사항 인덱스의 우선순위를 P0(자산 잠금·차트 마감) → P1a(WP-A 골격) → P1b(타임라인·플레이어) → P2(리브랜딩) → P3~P5로 다시 정리했다.
- P1a 골격은 `8e37aed`로 구현·커밋됐고 증거 커밋 `ce8df92`가 브라우저·타임라인 수치와 macOS 한계를 남겼다([P1A_VERIFICATION_20261112](conference/P1A_VERIFICATION_20261112.md)). 배포는 아직 없다.
- P1b는 `5d6419e`(타임라인·플레이어·매핑 스크립트·검증기·테스트 5파일)와 `8487b26`(검증 기록)으로 들어왔고, macOS에서 타임라인 9,168/9,168·컨퍼런스 14/14·`npm test` 3,456/3,451(실패 0)을 독립 재현했다. 다만 A-9 4G 초기 로드 예산은 6개 뷰포트 전부 실패(4.54~4.89초)했고 원인이 공용 부트 경로(index.html stylesheet 41개 개별 요청)에 있어, 다음 1건을 A-9 부트 경로 최적화로 잡고 Pro에 요청했다([P1B_VERIFICATION_20261112](conference/P1B_VERIFICATION_20261112.md)).
- A-9 라운드 1(`ee6faf9`)을 macOS에서 독립 측정했다: 기능 6/6·수용 0/6(3,161.8~3,267.6ms), 컨퍼런스 14/14 유지, CSS 41→4 효과는 −1.4초. 회귀는 반응형 44/44·WP6 30/30·chart-qa 12/12·compare PASSED로 유지됐다. 원인을 직렬 모듈 발견 14단계로 특정하고(timeline.json이 2,871ms에 시작) 폐포 preload 라운드 2를 요청했다([A9_MACOS_VERIFICATION_20261112](conference/A9_MACOS_VERIFICATION_20261112.md)).
- A-9 라운드 2(`1e0d071`·`e6c9a7a`)가 macOS에서 **6/6 통과**했다: 2,277.6~2,330.7ms, 70요청이 179ms 한 지점에서 시작, `timeline.json` 180ms 시작·중복 0, 총 전송 769,501B. 같은 커밋에서 컨퍼런스 14/14·반응형 44/44·chart-qa 12/12·compare PASSED·WP6 30/30(단독 재실행)·`npm test` 3,474 pass+5 skip·실패 0([A-9 실측](conference/A9_MACOS_VERIFICATION_20261112.md)).

## 남은 작업 — 2026-11-11 23:40 KST 기준

사용자가 남은 항목을 위임해 전부 시도했다. 자동화로 닫힌 것과, 사람만 가능해 남은 것을 구분한다.

| 구분 | 항목 | 결과 | 상태 |
|---|---|---|---|
| WP-A 시각 검수 | 547쪽 전수 렌더·접촉 시트 확인 | 290+257쪽 전부 렌더, 빈 페이지 0, 의심 3쪽은 의도된 디자인으로 확인 | **완료(AI 검수, 1:1 사람 아님)** |
| WP-A 청취·동기화 | 10지점 ±0.5초 | 에너지·길이 기계 점검만 수행. 상관 판별력 없음(큐가 구간 99.5% 덮음) | **불가 — 귀로 듣지 못함** |
| WP-A 패키지 | 자산 수·크기·Range | 547페이지 35.2MiB·최대 0.24MiB, 오디오 최대 14.3MiB, 예상 564자산 → 25MiB/20k 상한 통과. Range/206은 배포 전이라 불가 | **부분** |
| WP-A 자막 계약 | 9,169행 기대 | 실제 SRT **7,994+1,174=9,168행**. 해시는 요청서와 일치, 기대값이 1행 많다 | **확인 필요(결정 입력)** |
| R17 결정 | 원본/깔끔본 | **깔끔본**(257쪽, SHA-256 `3760cd72…`) 선택. 요청서 접두사 `baa2224e…`와 달라 실제 해시를 승인 해시로 고정 | **결정** |
| R7 | AppKit·Safari·실기기 | 헤디드 Chrome+CDP 클릭+System Events 키 입력을 시도했으나 공유 데스크톱에서 Chrome 전면화가 되지 않아(전면은 Spark) 전역 키 입력이 다른 앱으로 갈 위험이 있어 중단. ADB는 에뮬레이터(sdk_gphone64)만 있고 실기기 없음 | **차단(안전상 중단)** |
| WP-B §11 | 미결정 8건 | D1 Vectorize+D1, D2 small/1024d, D3 12개월+즉시 삭제, D4 승인 역할만, D5 3개 고정, D6 동일 등급, D7 라우터 판정, D8 근거 비례+하한 | **결정(위임)** |
| 원격 CI | 브랜치 CI | GitHub Actions는 설계상 없음. **Cloudflare Workers Builds가 원격 게이트**이며 main 빌드 `325effd2…` success·`deployed_on 13:55:16Z`로 확인 | **재정의(provider 빌드)** |

검수·기계 점검의 상세는 `docs/conference/WP_A_AUTOMATED_MEDIA_20261111.md` §7, 결정표는 `docs/requirements/WP_B_OPEN_DECISIONS_20261111.md`에 있다. 남은 사람 항목은 **WP-A 청취 10지점, WP-A Range/206(배포 후), Safari·실기기**다.

## 2026-11-12 우선순위 재정리

- **P0** 최종 자산 잠금(WP-A A-0)과 차트 마감. 차트 h1 구현·compare·반응형·WP6·chart-qa 자동 검증은 R10에서 완료했으며 main 병합·배포는 보류한다. 최종 PDF/PPTX는 `yyOkfU0FkYzNPO8f` 세션이 계속 갱신 중이므로, 해시·페이지 수가 적힌 `deck-lock` 전에는 WP-A 타임라인을 시작하지 않는다.
- **P1** 컨퍼런스 복습 페이지(WP-A) — 자산 잠금 후 즉시 착수.
- **P2** 리브랜딩·스카우트 표면 — 저장소/도메인 이름, README, 케이스 스터디. P1 데모가 동작한 뒤 진행한다.
- **P3** 릴레이 RAG, **P4** 인증·비공개, **P5** 시즌 테마.
- 상세: [요구사항 인덱스](requirements/README.md)의 개발 우선순위 표, [리브랜딩·스카우트 요구사항](requirements/REQ_REBRAND_SCOUTING_20261112.md), WP-A A-0.

## 체크리스트 종결 판정 — 2026-11-11 (R8)

**체크리스트 완료.** 브랜치 `fix/tradingview-responsive-20261110`, 종결 시점 HEAD `11540d62659b207f32111759faa5673738ce6765`, 이후 `0e1a7c67581c57820b58f3298e08510b5f551b50`에서 compare 구조 툴바 도달성 단언을 추가했다(제품 바이트 불변). R0~R5·R8 완료, R6·R7 차단 유지.

| 완료 항목 | 커밋 | 판정 근거(로컬 실행) |
|---|---|---|
| R0 인계·셸·reader 기본 | 인계 커밋 | 44-case 44/44, 53-case 53/53, compare PASSED, `npm test` `complete:true` 3,360/3,355/0/5 |
| R1 D04 compare reader 겹침 | `4d22531` | 960~1920에서 차트 열 축소 = reader 폭 320, 겹침 0, 문서 폭 불변; 53-case 53/53·compare PASSED·`npm test` 3,360/3,355/0/5 |
| R2 D02 source 시트 준비 상태 | `947e33d` | `?page=data`·`ipo`·`relay` 직접 진입은 잠금+이유 유지, `ready` 경로는 시트 1,744자·relay 787자 실제 개봉; 신규 단위검사 3/3, `npm test` 3,363/3,358/0/5 |
| R3 D09 왕복 반올림 계약 | `a739b36` | 출처별 폭 계약, 왕복 6건 `exact` delta 0, 신규 단위검사 9/9, `npm test` 3,372/3,367/0/5 |
| R4 WP6 여정 | `2be7da6` | 후보 origin identity(`productionDeployment:false`)에서 WP6 30/30, chart-qa 12/12, `npm test` 3,373/3,368/0/5 |
| R5 원격 상태·CI 조회 | `11540d6` | 로컬=원격 `11540d6`, `origin/main` `faa7f69f`, ahead 71/behind 5, 브랜치 PR 없음, PR #98 OPEN/draft, 원격 CI 증거 0건 |
| R8 문서 최종화 | `7bfd717` | 세 문서 최종 판정 정리, R6·R7만 차단으로 명시 |

검증 범위를 읽는 주의: 제품 바이트는 `dist` 트리 `d61e0dbd32072f7436dc552a0a79f0afed880a50`(R3~R8 불변)이고, 53-case 53/53·compare PASSED(9 viewport, overflow 0)·WP6 30/30·chart-qa 12/12·`npm test` `complete:true` 3,373/3,368/0/5·typecheck·static(967 files·214 scripts·992 references)·Pages build/verify(12 files·9 routes)는 모두 이 바이트와 그 원장 커밋에 묶인 **로컬** 결과다. 원격 CI·배포·출시 승인 증거가 아니다.

차단으로 남는 항목은 R7(macOS 외부 AppKit 메뉴, Safari, 실제 iOS/Android 기기)과 R6의 사람 검수(직접 청취·동기화 10지점, 547장 WebP 렌더·시각 검수, 배포 패키지 자산 수·Range)다. R8 종결 시 미판정으로 남겼던 320px 범례 native touch scroll과 1440px ETH native 모델 선택은 2026-11-11 후속 회차에서 실제 입력으로 통과했다(아래 `native 잔여 2건 재판정` 절). COMPARE 320/390 구조 툴바는 가로 스크롤 계약으로 이미 닫혔다.

출시 경계는 그대로다. main push·merge·force push·배포·PR #98 변경·PR 생성·유료 용량·계정/권한 변경은 수행하지 않았고 승인도 없다. 이 종결은 체크리스트 R0~R8의 판정 완료를 뜻하며 출시 승인이 아니다.

진행 규칙(자동 실행 포함):

1. 한 번에 한 항목만 처리하고, 처리한 항목의 판정과 정확한 수치를 이 표에 갱신한다. 끝난 항목은 완료로 바꾸고 커밋 SHA를 남긴다.
2. 브라우저 검사는 Node 정적 서버로 서빙한다. `python3 -m http.server`는 동시 모듈·스타일시트 요청을 흘려 `Failed to fetch dynamically imported module`로 boot error를 만든다. 표준 절차: `mkdir -p /tmp/atlas-serve && ln -sfn <repo>/dist /tmp/atlas-serve/bitcoin-cycle-atlas` 후 Node 정적 서버를 8171에 띄우고 `ATLAS_RESPONSIVE_BASE_URL=http://127.0.0.1:8171/bitcoin-cycle-atlas/`를 쓴다.
3. `ATLAS_BROWSER_PATH=/Applications/Google Chrome.app/Contents/MacOS/Google Chrome`가 필요하다. 없으면 검사는 blocked이며 skip이 아니다.
4. 검사가 도는 동안 저장소 파일을 수정하지 않는다. 브라우저 스위트는 실행 중 소스 변경을 `Browser evidence cannot bind sources that changed during the run`으로 실패시킨다.
5. `npm test`의 frozen 배치는 Docker가 필요하다. Docker Desktop이 내려가 있으면 켜고 소켓 `/Users/twoimo/.docker/run/docker.sock`이 생길 때까지 기다린다. `complete:false`는 통과가 아니다.
6. 검사 삭제·허용치 완화·합성 값 대입으로 통과시키지 않는다. 실패는 원인을 고쳐 다시 돌린다.
7. main push·merge·force push·배포·PR 변경·유료 용량·계정/권한 변경은 금지다. 커밋과 브랜치 push만 한다.

## 미검증 관찰 해소 — COMPARE 320/390 구조 툴바 (2026-11-11)

R4에서 "관찰 한계"로만 남겼던 COMPARE 320/390 헤딩의 `structure-threshold`·`structure-json` 잘림은 **잘림이 아니라 가로 스크롤**이었다. 실측: `.lab-toolbar`가 `overflow-x:auto`이고 `scrollWidth 544 > clientWidth 268`(320px), 390px에서도 동일한 구조이며, 두 컨트롤은 초기 위치(x=324/546, 390px에서 394/686)에서 뷰포트 밖이지만 툴바를 가로로 스크롤하면 도달한다.

그래서 `scripts/verify-compare-shell-browser.mjs`에 실제 휠 입력으로 확인하는 단언을 추가했다. 320·390에서 툴바 중앙에 `Input.dispatchMouseEvent` 휠을 보내 `scrollLeft`가 실제로 증가하는지, 그 뒤 `#structure-threshold`와 `#structure-json`이 뷰포트 안에 들어오고 `elementFromPoint`로 그 노드(또는 자손)가 잡히는지 확인하고 영수증에 남긴다. 영수증 값: 320에서 scrollLeft 0→276, 390에서 0→346, 두 폭 모두 `inViewport:true`·`hit:true`. 이 단언 추가 후 compare 셸 검증 **PASSED**(실패 0).

이 항목은 이제 "미검증 관찰"이 아니라 하네스가 지키는 계약이다. 제품 CSS는 바꾸지 않았다(스크롤로 도달 가능하므로 결함 아님).

## native 잔여 2건 재판정 — 2026-11-11

R8 종결 시 "미판정·미검증"으로 남긴 두 항목을 실제 입력으로 다시 돌렸다. 제품 바이트는 R3~R8과 같은 `dist` tree `d61e0dbd32072f7436dc552a0a79f0afed880a50`이고, 바뀐 것은 하네스의 입력 경로 하나다.

| 항목 | 판정 | 근거(로컬 실행) |
|---|---|---|
| 320px 범례 native touch scroll | **통과** | `verify-chart-replay-browser.mjs`가 touch 케이스에서 `Input.dispatchTouchEvent` 스와이프로 범례 스크롤포트를 끝까지 민다(휠은 비터치 전용). BTC 320×568: `scrollHeight 1188`/`clientHeight 507`, 스와이프 `0→350→681`(최대 681), 참조 의미 3개 `painted:true`·`reachable:true`. BTC 900×430: 3회 `0→250→554→652`(최대 652). chart-replay 레인 7/7, 실패 0 |
| 1440px ETH native select | **통과(내부 팝업 모드)** | `adaptive→valuation`(ArrowDown×2), `valuation→pooled`(ArrowUp×1), `pooled→adaptive`(ArrowUp×1) 실제 키 입력. `internalPopupMode:true`, `popupMenu external-appkit→internal→external-appkit`, `layoutLocked:true`, `restored:true`, 값·`#eth-chart.dataset.forecastModel`·`?eth-model=` 동시 갱신, 포커스 유지. native 레인 15/15, 실패 0 |

한계: 이 키 입력은 Blink 내부 팝업에서 실행됐다. macOS 외부 AppKit 메뉴·Safari·실기기는 여전히 R7 차단이며, 내부 팝업 입력을 외부 메뉴 검증으로 승격하지 않는다. 휠 스크롤로도 통과하던 케이스를 touch로 강화한 것이므로, 이전 기준선 비교는 역사 기록으로만 남긴다.

이번 회차 로컬 게이트: chart-replay 레인 7/7, native 레인 15/15, `npm run typecheck`, `verify:static`(952 files·214 scripts·992 references), `build:pages`·`verify:pages`(12 files·9 routes) 통과. `npm test`는 고정 frozen 이미지의 기존 다이제스트(`e7add2…`)가 2026-11-11 Docker Hub에서 404가 되어 한 번 `complete:false`가 났고, 같은 `node:24.22.2`의 현재 linux/amd64 인덱스(`8fa96264…`)로 핀을 갱신한 뒤 frozen 41건이 그대로 재생되어 **`complete:true` 3,373/3,368/실패 0/제외 5**로 통과했다(테스트 수·허용오차 변화 없음).

이번 회차 커밋: `9dd6332af27ef96453caa58ef96f4bde63ed08b6`(하네스+문서), 원격 `fix/tradingview-responsive-20261110` push 확인.

## WP-A 자동화분 실측 — 2026-11-11 (R6 부분)

사람이 필요한 부분은 그대로 두고, 자동화할 수 있는 것만 실행했다. 전체 영수증은 `docs/conference/WP_A_AUTOMATED_MEDIA_20261111.md`와 `docs/conference/evidence/media-20261111/`에 있다.

| 항목 | 결과 | 근거 |
|---|---|---|
| PDF 페이지 547 | **290 + 257 = 547** (계약 `plannedPages:547` 일치) | Poppler `pdfinfo` 26.10.0, 각 파일 SHA-256 |
| 미디어 해시 | 오디오 16/16 매니페스트 일치, 입력 2건·SRT 2건 요청서 접두사 일치 | `media-manifest.json` 재계산 |
| R17 변형 | 원본·깔끔본 모두 257쪽이지만, 깔끔본 접두사 불일치(`baa2224e…` ≠ `3760cd72…`) | §7-1 결정 입력 |
| Linux 원자 게시 | 신규 게시·기존 거부·경합 `EEXIST`·syscall `errno 17` 통과 | Docker `python:3.12-slim`, `7064d25` 스크립트 |
| 청취·시각·배포 | 미수행 | 사람/별도 환경 |

`mediaPrepared:false` 유지. 이 실측은 청취·시각 검수나 배포 승인이 아니다.

## WP-B §11 미결정 8건 — 결정 질문 목록 — 2026-11-11

`docs/requirements/WP_B_OPEN_DECISIONS_20261111.md`에 8건을 "결정 질문·현재 문서 위치·선택지"로 정리했다. **결정은 하지 않았다.** 각 항목은 사용자 선택 전까지 미결정이며, 구현·유료 용량·배포 승인을 뜻하지 않는다. D1 저장소·비용, D2 임베딩·재임베딩, D3 보존·삭제권, D4 3열 권한 범위, D5 에이전트 수 상한, D6 종합 모델 등급, D7 소수 의견 라벨, D8 출처별 분량이다.

## 배포 — 2026-11-11 (main → Cloudflare Workers Builds)

사용자 요청에 따라 `fix/tradingview-responsive-20261110`을 main에 fast-forward하고 production 배포를 진행했다. 배포 전 점검에서 **production이 2026-11-09 이후 갱신되지 않고 있었다**: 라이브 `publication.json`의 `sourceCommit`은 `36e7db09…`(2026-11-09 19:07 KST)였고, `bitcoin-cycle-atlas` Worker의 `deployed_on`도 2026-11-09T10:34Z였다. 원인은 browser stage의 `generated-pages`·`panel-tests` 실패였다.

| 결함 | 원인 | 수정 |
|---|---|---|
| Cloudflare `generated-pages` 실패 | 11-10 시점 커밋의 `dist/market-lab` 산출물이 web 소스보다 오래되어 해시가 달랐다. `f21a3b6`이 재생성해 현재 tree에서는 로컬(Node 26)과 Node 24.22.2 양쪽에서 `verify:pages`가 통과한다 | 추가 수정 없음(재생성 커밋이 해결) |
| `panel-tests` 예외 | `content-shell.js`의 `sidebarOwnsNav()`가 레이아웃 없는 DOM에서 `getClientRects`를 호출해 throw | 함수가 없으면 `hidden`이 아닌 사이드바를 소유자로 판정 |
| `panel-tests` 무한 재진입 | `mount()`와 `place()`가 `hidden`을 번갈아 써 MutationObserver가 `sync()`를 계속 재호출 | 가시성 소유자를 `place()`로 단일화하고 같은 값 쓰기 제거 |
| 대시보드 클릭 즉시 이동 | 즉시 이동 분기가 `outlook`까지 삼키고 `page.href`(`/market-lab/us/`)를 사용 | `outlook`은 차트 호스트에 위임하고 공유 `centerHref`(`/market-lab/`) 사용 |

검증(로컬, 이 tree): panel-tests 138/138, compare shell PASSED(failures 0), **53-case 53/53**(실패 0, `sourceIntegrity` 158 files·changed 0), `npm test` `complete:true` 3,373/3,368/실패 0/제외 5, typecheck, static(952 files·214 scripts·992 references), Pages verify(12 files·9 routes). WP6·chart-qa 영수증은 이전 제품 바이트에 묶여 있으므로 이 tree에 적용하지 않는다.

배포 실행 중 두 가지를 더 고쳤다. (1) browser stage의 `eth` 320이 Linux에서 실패했다. 직전 `Enter` 입력이 Blink select 팝업을 열어 다음 화살표가 값이 아니라 팝업 하이라이트를 움직였다. 화살표만으로 값이 커밋되므로 선택 후 `Enter`를 제거했고, macOS native 레인 15/15로 재확인했다. (2) model stage가 19분 검증 예산을 1분 초과해 `formal`이 예산 초과로 실패했다(3,373건이 16.4~17.4분로 흔들림). 테스트 집합·임계값은 그대로 두고 `--test-concurrency`만 2→3으로 올려 13분 47초로 예산 안에 넣었다(`ops/cloudflare-verification.md`).

최종 배포 영수증(2026-11-11 17:33 KST):

- main `a8276861d200f421bd6a07cad85abfdd03694257` (로컬=원격)
- model stage 빌드 `af2fe1c9-2272-4cc4-a184-410045fba689` success(13분 47초), browser stage 빌드 `91adb41c-939e-4da6-8e47-393fb0024087` success
- Worker `bitcoin-cycle-atlas` `deployed_on` 2026-11-11T08:33:45Z
- 라이브 `publication.json`: sourceCommit `a827686…`, manifestSha256 `4ee6b95f…`, contentDigest `73d42521…`, phase `confirmed`
- `verifyServedPublication` **PASS**: index.html·site-entry.js·data/btc-daily.json·data/forecast-ledger/index.json 본문 해시 일치, servedCommit = servedDigest = `a827686…`
- `/`, `/?symbol=ETHUSD`, `/?page=data` HTTP 200
- 브라우저 stage 게이트: runtime-preflight·locked-dependencies·generated-pages·typecheck·panel-tests·service-build·postgres-service-tests·native-browser(53) 전부 PASS, publication/standalone PASS

**2026-11-11 22:55 KST 재배포(WP-D)**: main `09334064befc060f305520a61cfe6b695fb21930`, model 빌드 success(12분), browser 빌드 `325effd2-b3e7-4aac-88a8-e2b1cfd84417` success(16분 34초), Worker `deployed_on 2026-11-11T13:55:16Z`, 라이브 source `0933406`·manifest `c9298c42…`, `verifyServedPublication` **PASS / phase confirmed**(4개 핵심 파일). 첫 시도는 10× cadence 100ms 예산 초과(120ms)로 실패했고, readout 검사를 케이스 끝으로 옮긴 뒤 cadence **passed**로 통과했다.

## 2026-11-11 추가 요청 — WP-D 전 종목 좌상단 오버레이

원문: "비트코인 좌상단에 나오는 것들 있잖아? 비트코인 말고 다른 종목들은 레이아웃 나눠서 나오는 것 같은데 비트코인처럼 오버레이될 수 있게 전부다 개선해줘."

요청 정본은 [요청서 §13](requirements/REQ_WP_ABC_20261110.md)이고, 계약은 [반응형 §4.6](TRADINGVIEW_RESPONSIVE_20261110.md)이다. 2026-11-11 구현·검증을 마쳤다(아래 표의 '개선 후').

| 종목 | 개선 전(production 7896860) | 개선 후(2026-11-11, 1440×900) |
|---|---|---|---|
| BTCUSD | `.atlas-readout` 338×21 @(10,8) + 출처 230×19 @(10,32) | 기준 유지 |
| ETHUSD | `.eth-readout` **1,238×64** @(12,9) 3행 전폭 블록 | **319×23**(플롯의 23.9%) 1행 + 출처 행 118×15, OHLC 접힘 |
| MSTR | `.eth-readout` **1,233×64** @(12,9) 3행 전폭 블록 | **306×23**(22.9%) 1행 + 출처 행, OHLC 접힘 |
| BMNR | 3행 전폭 블록(동일) | **296×23**(22.2%) 1행 + 출처 행, OHLC 접힘 |

320에서는 줄바꿈으로 40px(≤44px 계약)이고 가로 오버플로는 0이다. readout 오른쪽 바깥 `elementFromPoint`는 차트 SVG를 반환한다.

닫는 조건: 대상 종목 전부가 BTC와 같은 오버레이 구성(플롯 내부, 높이 ≤24px at ≥768, 폭 ≤60%, 오버레이 오른쪽 끝 `elementFromPoint`가 차트 SVG, 가격 축·마지막 가격 라벨·리플레이 바·범례 독과 겹침 0)이 되고, OHLC 등 기존 정보는 접힌 상세에서 도달 가능하며, 53-case·compare·WP6·chart-qa·반응형 44가 새 계약으로 다시 통과해야 한다. 검사 삭제·허용치 완화는 금지한다.

## 역사 기록 — Pro 인계 시점 작업판 (2026-11-11 01:30)



요청 정본: [WP-A/B/C 및 후속 실행 계약](requirements/REQ_WP_ABC_20261110.md), [반응형 세부 계약](TRADINGVIEW_RESPONSIVE_20261110.md). 사용자가 현재까지의 작업 커밋·작업 브랜치 push와 Pro 인계·후속 예약을 요청했다. 따라서 **이 인계 체크포인트 push만 허용**하며, main 병합·배포·PR #98 변경·출시 승인은 여전히 보류한다.

| ID | 현재 판정 | 정확한 근거와 다음 수용 기준 |
|---|---|---|
| U01/U02/U03 | 최종 통합 후보 재검증 대기 | 이전 4종목 반응형 44/44 및 사이트 50/53은 각 당시 소스에 한정한다. native client 창을 emulation 전에 검증하는 helper를 통합했다. 별도 진단 트리의 BTC workspace 320/1440/900 3/3, consolidated 320/390/1440 3/3 통과는 부모 최종 후보의 53-case·WP6 통과가 아니다. |
| U04 / WP-C | 통합 완료, 독립 실브라우저 검증 대기 | reader viewport 경계와 compare 1100px 이하 44px 계약을 반영했다. dashboard evidence/data/ipo/relay 네 면과 nav/footer 원래 노드 이동·복원을 4fc8bd7/c6b34b9에 통합했다. 작업자 보고 15/15 inventory·24 Phase D·4 왕복은 부모의 최종 통합 재현과 구분한다. |
| P01/P02 | 기존 검증 유지 | 가격축 정확성·문서 격리와 측정 한계는 역사 기록대로다. 새 성능 향상·비용 절감률을 주장하지 않는다. |
| C01 | 원격 CI 미확인 | 검증 강도·수치 허용오차·source identity·성능 예산을 유지한다. 인계 push 수락은 CI·배포 성공이 아니다. |
| C02 | 기본 검사 PASS, 전체 회귀 대기 | 통합 제품 소스 c6b34b9에서 typecheck·verify:static·build:pages·verify:pages 및 headless-window/native-select/mobile-target focused 30/30 통과. 이전 전체 회귀 3,350개 중 3,345 통과·실패 0·제외 5는 마지막 dashboard 통합 전 결과다. 작업자 전체 테스트는 docker ENOENT로 exit 1이므로 전체 PASS가 아니다. |
| C03 | replay 유한 검증 갱신 | coordinator SHA-256 4d689174ffa97b75aa02d383d2127506288d48a4fa1e1e5a258300942a45b6ca에 대해 16/16 및 10,000 playback traces·259 selection traces·11개 negative controls를 기록했다. 실제 브라우저 또는 무한 정형 증명은 아니다. 다른 수명주기 변경 시 해당 검사를 다시 수행한다. |
| A01/A02 / WP-A | 부분 준비·미디어 gate 유지 | 오디오 15세션·16파일만 준비. mediaPrepared:false. 직접 청취·동기화 10지점, PDF 547페이지, 전체 미디어·Linux 원자 게시 검수가 남는다. 원본 자산은 존재한다. |
| G02/R01/R02 | 출시 보류 | 작업 브랜치 인계 push만 승인됐다. main 직접 push·merge·force push·배포·PR 상태 변경은 하지 않는다. PR #98 open/draft는 마지막 관측이며 필요 시 실시간 재확인한다. |
| F01 | Pro 시작 확인, 예약 [blocked] | 인계 963abdaeaf2b7818ed09af0dca883665c43c7a41의 원격 SHA 일치를 확인했다. [Pro 전용 스레드](https://chatgpt.com/c/6af34824-c838-83e8-8a29-674f636a56df)는 GPT-6/Pro 5단계에서 1회 전송 후 생각 중·중지와 저장된 URL을 확인했다. 응답 완료·로컬 구현 완료가 아니다. 기존 예비 bhaQzbDtGEjUGS9a 갱신은 Routine not found로 차단됐으며 원래 paused 상태와 다른 루틴을 보존했다. 새 루틴은 만들지 않았다. |

### 남은 작업과 닫는 조건

- [ ] Pro가 정확한 원격 branch/SHA와 문서를 읽었는지 확인하고, 요청별 완료/미완료/차단을 증거에 연결한다.
- [ ] 최종 통합 소스에서 전체 53-case, WP6, compare 경로·각 폭 및 replay native 여정을 실행한다.
- [ ] evidence/data/ipo/relay의 chart 왕복에서 원래 nav/footer 노드 identity, 단일 rail/bottom-bar, 상태 복원을 확인한다.
- [ ] 최종 통합 소스에서 전체 npm test 및 관련 수명주기 검증을 실행하고 Docker 포함 실패·제외를 그대로 기록한다.
- [ ] 변경 후 Pages 재생성과 검증·소스 identity·원격 CI 결과를 같은 후보에 결합한다.
- [ ] macOS 외부 AppKit 메뉴·Safari·실기기를 미검증 상태로 명시한다. Blink 내부 팝업 trusted 입력과 동일시하지 않는다.
- [ ] WP-A 청취·동기화·PDF·Linux 게시와 별도 연구 승격 조건을 충족하기 전 mediaPrepared:false 및 출시 보류를 유지한다.

현재부터 Pro 검토를 우선한다. 로컬 부모는 인계 문서·원격 SHA·증거 수신·검증을 소유하며, 실행 경로가 확인되지 않은 Pro의 로컬 구현/테스트를 수행됐다고 기록하지 않는다. 작업 중 Pro에는 입력·추가 메시지·중지·새로고침·모델 변경을 하지 않는다.

폭은 서로 다른 계약을 지우고 하나로 축소하지 않는다. 반응형 320/390/456/620/768/1024/1440, 기존 전체 셸 1280, WP-A/C 1920 및 reader 959/960 경계를 해당 여정에서 보존한다.

## 2026-11-11 후속 결과 — Pro 검토 + 수정 + 재검증

Pro(6 Pro, GPT-6/Pro 5단계) 검토를 [전용 스레드](https://chatgpt.com/c/6af34824-c838-83e8-8a29-674f636a56df)에서 23분 44초에 받았다. 원문은 세션 artifact `atlas-pro-review-963abda-verbatim.txt`에 보존했고, Pro가 밝힌 확인 수준(소스 읽기 / 정적 판단 / 실제 실행)을 그대로 구분한다. Pro는 고정 SHA `963abdae`를 읽었고, 원격 head가 `93535e0`으로 이동한 뒤에도 판정은 고정 SHA에 두었다. 접근 실패도 기록했다: 고정 SHA에서 `build/accepted-responsive-BTCUSD/report.json`과 `build/accepted-native-prices/report.json`은 HTTP 404였고, Aside 세션 경로의 원본 로그에는 접근하지 못했다.

Pro가 제시한 결함 목록(D01~D09)은 가설로 취급해 소스에서 다시 확인했다. 이번에 확인·수정한 항목:

| ID | 판정 | 근거 |
|---|---|---|
| D01 relay 직접 진입 클릭 소실 | 수정·재현 확인 | `?page=relay`에서 리서치·데이터·IPO·시장 클릭이 아무 동작도 하지 않던 것을 재현했다. center-workbench의 직접 진입 분기에 `relay`가 없어 `open()`이 차트 호스트를 찾다 삼켰다. 클릭 핸들러에서 차트 호스트가 없으면 `atlasSitePath(page.href)`로 이동하게 고쳤고, relay→evidence→relay 왕복과 `aria-current`를 실브라우저에서 확인했다. |
| D02 준비된 자료도 무조건 잠금 | 수정 | `content-shell.lockSources()`가 `[data-method]`를 무조건 비활성화했다. 가격 데이터(`.atlas-plot`)가 이 문서에 살아 있으면 잠그지 않도록 조건을 넣었고, `?page=data`처럼 자료가 없는 경로에서는 기존 이유 문구와 비활성 상태가 그대로 유지됨을 확인했다. |
| 대시보드 내비 소유권(자체 발견) | 수정 | 대시보드 라우트에서 내비게이션이 오른쪽 44px 레일로 빠지고 좌측 216px 사이드바가 브랜드만 남은 빈 칸이 됐다. `design.md`의 dashboard-01(sidebar/header/inset)과 `atlas-shell.css`의 `body[data-shell=dashboard] .atlas-sidebar .atlas-nav` 규칙에 맞춰, 사이드바가 렌더되는 폭에서는 사이드바가 내비를 소유하고 640px 이하에서만 레일로 넘기도록 고쳤다. 리사이즈 시에도 재배치한다. |

Pro가 지적한 나머지는 미수정으로 남긴다. D03 reader를 연 채 브라우저 Back 시 reader가 남는 경로, D04 960px compare의 CSS/입력 모드 불일치, D05 reader 내부 44px 미달 조작부, D06·D09 독립 44-case·compare 프로세스의 emulation 전 native client 검사 부재, D07 select 실패 후 복원 readback 생략·오류 가림, D08 Linux에서 native-select 13건 실패. 이 항목들은 Pro의 소스 근거와 재현 조건만 확보했고 이번에 실행 재현하지 않았다.

이번 후보에서 다시 실행한 검증:

- `npm run typecheck`, `npm run verify:static` 통과(967 files, 214 scripts, 992 references).
- `npm run build:pages`, `npm run verify:pages` 통과(12 files, 9 routes).
- compare 셸 실브라우저 검사 **PASSED**(실패 0). 계약은 수정된 구성에 맞췄다: 사이드바가 렌더되면 내비는 사이드바 소유이고 오른쪽 레일은 그리지 않으며, 640px 이하에서만 레일이 내비를 소유한다. 왕복 뒤 노드 동일성·footer 소유·source 잠금/복원 검사는 유지했다.
- 전체 사이트 53-case 네이티브 브라우저 스위트 **53/53 passed, failures 0**. 검사 분모는 base 26 + workspace 13 + forecast-replay 4 + chart-replay 7 + consolidated 3이다. 하네스 쪽에서 stale 가정 두 곳을 제품 구성에 맞췄다: phone 폭에서는 sidebar가 렌더되지 않으므로 차트 복귀 컨트롤을 레일 항목으로 판정하고, 데이터 표의 아래 정렬 기준을 viewport 대신 콘텐츠 바 상단으로 계산한다. 검사 자체를 삭제하거나 허용치를 늘리지 않았다.
- `?page=relay` 새 문서 로드가 간헐적으로 boot error가 되는 현상은 기준 상태(`dist` 미수정)에서도 4회 중 2회 재현됐다. 이번 수정으로 생긴 회귀가 아니며 원인은 아직 확정하지 않았다.
- 전체 `npm test`(Docker 데몬 기동 포함): `ATLAS_TEST_TOTAL {"complete":true,"tests":3358,"pass":3353,"fail":0,"skipped":5,"batches":2}`. 고정 Linux/x64 Node v24.22.2 frozen replay까지 실행됐고 수치 허용오차·저장 출력은 바꾸지 않았다. Docker 데몬이 내려가 있던 중간 실행은 `complete:false`였으며 그 값을 통과로 쓰지 않았다.
- 최종 소스 커밋은 `2a0162760b866a2f6d3a49e2fa3a40f93b5245bc`다. 이 커밋의 검사 묶음은 위와 같고, 배포·CI·릴리스는 여전히 별도다.

아직 닫히지 않은 것: 위 D03~D09, WP-A 미디어·청취·동기화·PDF·Linux 원자 게시, macOS 외부 AppKit 메뉴·Safari·실기기, 원격 CI·배포. `mediaPrepared:false`와 출시 보류를 유지한다.

## 2026-11-11 후속 2 — Pro 2차 검토 반영

같은 스레드의 2차 검토(15분 18초)는 고정 SHA `7892df9`를 읽고 D01 PASS, D02 PARTIAL, 사이드바/레일 전환의 새 결함(N01·N02) 지적, 하네스 판정(① PASS, ② PARTIAL, ③ 검사 범위 축소)을 제시했다. 지적은 전부 소스에서 다시 확인한 뒤 처리했다.

| 항목 | 판정 | 근거 |
|---|---|---|
| N01 (P1) 차트에서 처음 대시보드로 올 때 내비가 숨은 차트 레일 소유로 남음 | 수정 | `navHome`을 대시보드 host로 쓰던 것이 원인이었다. 대시보드 host는 실제 `.atlas-sidebar`로 고정하고 `navHome`은 차트 복귀용으로만 남겼다. |
| N02 (P2) 761–1100px fine pointer에서 사이드바 내비 32px | 수정·실측 | `atlas-shell.css`의 1100px 규칙을 사이드바·레일 양쪽에 적용하고 브랜드 버튼도 44px로 올렸다. 실측: 1100/1024에서 199×44, 900/768/641에서 51×44, 640/390에서는 레일 44×44, 1440 데스크톱은 기존 32px 행 유지. |
| 하네스 ③ 검사 범위 축소 | 수정 | Phase D 조작부 수집이 `.atlas-canvas-heading`·`.workbench-rail`·`.workbench-bottom-bar`만 봐서 사이드바로 옮겨간 내비가 빠졌다. 현재 내비 소유 host를 수집 대상에 넣었고, 그 결과 768/1024의 브랜드 36px가 실제로 걸려 CSS를 고쳐야 했다. 검사가 약해진 게 아니라 이전에 비어 있던 범위였다. |
| D06·D09 emulation 전 native client 검사 | 구현 | 독립 44-case·compare 러너에 `--window-size=2048,1600`과 첫 emulation 전 `verifyHeadlessWindowEnvelope`를 넣었다. compare 실측 영수증: window 2048×1600, client 2048×1513, 요청 1920×1080. |
| D07 select 실패 후 복원 readback | 구현 | 복원과 readback을 모든 결과에서 실행하고, 복원 실패는 원래 오류를 덮지 않고 `restoreError`로 붙인다. 회귀 테스트 2건 추가, 해당 파일 22/22 통과. |
| D02 준비된 자료 잠금 해제 | 철회 | 제안대로 `.atlas-plot` 존재를 준비 상태로 쓰면 안 된다는 Pro 판단이 맞았다. 실측으로도 데이터가 로드된 `?page=data`에서 옮겨진 하단 버튼이 어떤 시트도 열지 않아(모든 dialog 닫힘), 잠금을 풀면 죽은 조작이 노출된다. 잠금과 이유 문구를 그대로 둔다. |

이번 후보 커밋 `f21a3b6f282ffc007fa0ffc29cfda3caacfa54f2`에서 실행한 결과:

- 전체 사이트 53-case 네이티브 브라우저 스위트 **53/53 passed, failures 0**.
- compare 셸 실브라우저 **PASSED**(사이드바 소유권·44px·왕복·source 잠금 복원 포함).
- `npm run typecheck`, `npm run verify:static`, `npm run build:pages`, `npm run verify:pages` 통과.
- 전체 `npm test`: `ATLAS_TEST_TOTAL {"complete":true,"tests":3360,"pass":3355,"fail":0,"skipped":5,"batches":2}`.
- 반응형 44-case는 BTCUSD 11/11 통과. ETHUSD 10/11, MSTR 11/11, BMNR 10/11로, 실패는 모두 첫 화면(320×568, 때로 390×844)의 간헐적 boot error(`dataset.boot='error'`)였다. 같은 현상이 `dist`를 되돌린 기준 상태에서도 재현되므로 이번 변경의 회귀로 보지 않지만, 첫 페인트 실패율이 무시할 수준이 아니어서 미해결 결함으로 별도 기록한다.

남은 항목: N01/N02 외의 D03(reader Back), D04(960px compare CSS/JS), D05(reader 내부 44px), D08(Linux native-select fixture), D02의 데이터 owner 준비 상태 설계, 위 boot error 간헐화, WP-A 미디어·청취·PDF·Linux 게시, macOS 외부 AppKit 메뉴·Safari·실기기, 원격 CI·배포. `mediaPrepared:false`와 출시 보류를 유지한다.

## 2026-11-11 후속 3 — D03 reader 수명과 Pro 3차 요청

Pro 3차 검토를 `eee4ae6` 기준으로 요청했고, 그 사이 D03을 직접 처리했다.

- D03(reader를 연 채 브라우저 Back) 수정: 상세 패널은 workspace의 형제 노드라 `[data-view]` 클릭에서만 닫혔다. history 핸들러가 복원된 화면을 적용하기 전에 패널 소유자(`atlas:close-detail`)에게 닫기를 요청한다. 같은 여정 A/B 실측: 수정 전에는 Back 뒤 `evidence`로 돌아가도 `#chart-reader`가 열린 채 `workspace.dataset.detailsOpen='true'`로 남았고, 수정 후에는 `readerOpen:false`, `detailsOpen:'false'`였다.
- 이 수정의 첫 전체 회귀에서 히스토리 스텁에 `document.querySelector`가 없는 테스트 4건이 실패했고(`document.querySelector is not a function`), 옵셔널 호출로 고친 뒤 해당 파일 51/51과 전체 3,360개가 다시 통과했다. 실패를 제외로 돌리지 않고 원인을 고쳤다.
- 커밋 `edf4760`(D03) 이후 최종 확인: 전체 `npm test` `complete:true`, 3,360개 중 3,355 통과·실패 0·제외 5, 53-case 사이트 인벤토리는 같은 코드 계열에서 53/53 통과.

남은 항목: D04(960px compare CSS/JS), D05(reader 내부 44px), D08(Linux fixture), D02의 데이터 owner 준비 상태 설계, 320/390 첫 페인트 간헐 boot error(Pro 3차 검토 대상), WP-A 미디어·청취·PDF·Linux 게시, macOS 외부 AppKit·Safari·실기기, 원격 CI·배포.

## 2026-11-11 후속 4 — Pro 3차 검토의 boot error 원인과 relay 소유권 수정

Pro 3차 검토(고정 SHA `eee4ae6`, 3차 답변 원문은 세션 artifact `atlas-pro-review2` 이후 별도 보존)는 boot error를 단정하지 않고 경로를 분해했다. 핵심은 두 가지였다.

1. 전역 20초 타이머가 body bootstrap 시점부터 돌고, ETH/equity의 자체 20초 타이머는 나중에 시작한다. 그래서 데이터가 오래 pending이면 전역 타이머가 자산 로컬 오류 UI보다 먼저 실패로 고정될 수 있고, 이 경로에는 예외나 `console.error`가 필요 없다. 이번 실패가 실제로 20초 지점이었다는 측정은 없으므로 원인으로 확정하지 않았다.
2. Relay는 가격 dataset 없이 준비 완료될 수 있는 화면인데(`finishInitialPage`), 초기 진입의 `ensureDataset()` 호출은 `data/ipo/market`만 제외하고 relay를 포함했다. BTC 요청이 실패하면 `init()`의 catch가 relay 화면에서도 전역 `atlas:boot-error`를 발행한다. popstate 경로는 이미 relay를 제외해 두 경로가 불일치했다.

두 번째는 코드로 확인되고 재현됐으므로 초기 호출도 relay를 제외하도록 고쳤다. 실측: `?page=relay` 새 문서 로드 8회가 모두 `boot='ready'`였다(수정 전 같은 조건에서 4회 중 2회 error). 차트 경로는 그대로 dataset을 요청하며 `?page=outlook`에서 89개 path와 관측일이 정상 렌더됐다. relay 내용은 자체 자료를 쓰고, 차트로 이동하면 새 문서에서 dataset을 확보한다.

Pro가 제안한 진단 보강(fail()에 phase·elapsed·route·resource URL 기록, early CSS 실패 URL 보존, Network/Log 수집)은 아직 구현하지 않았다. 320/390 첫 진입의 나머지 실패를 좁히려면 이 기록이 먼저 필요하다. timeout 확대나 늦은 ready로 error를 덮는 방식은 쓰지 않는다.

최종 확인(커밋 `edf4760` 이후 D03 + relay 수정 포함 작업트리): 53-case 사이트 인벤토리 53/53 통과, compare PASSED, 전체 `npm test` `complete:true` 3,360개 중 3,355 통과·실패 0·제외 5, typecheck·static·Pages build/verify 통과.

남은 항목: D04(960px compare CSS/JS), D05(reader 내부 44px), D08(Linux fixture), D02 데이터 owner 준비 상태 설계, 320/390 첫 진입 간헐 실패의 진단 계측, WP-A 미디어·청취·PDF·Linux 게시, macOS 외부 AppKit·Safari·실기기, 원격 CI·배포.

## 2026-11-11 후속 5 — D05 reader 내부 44px

reader(차트 상세 패널)의 설정·날짜·명령 조작부는 620px 이하에서만 44px이었고, 621–1100px fine pointer에서는 28~36px로 남아 있었다. `atlas-shell.css`의 44px 계약과 차트 프레임 자체 계약이 1100px까지인데 reader만 빠져 있던 것이다.

`dist/eth-view.css`에 1100px 이하 블록을 추가해 reader의 설정·날짜·명령 동작과 reader 내부 패널(설정·지표·날짜)의 select·button·텍스트 input을 44px로 올리고, 체크박스는 입력이 아니라 그 행(label)을 44px 타깃으로 만들었다.

첫 시도는 적용되지 않았다. `.chart-details-panel .atlas-settings-body #atlas-reset{min-height:28px}`가 명시도 (1,2,1)로 `#chart-reader :is(select,button)` (1,0,1)을 이겼기 때문이다. reader body id로 스코프해 (2,0,1)로 올린 뒤 적용됐다. 이 사실은 스타일시트 캐스케이드를 실제 계산으로 확인해 찾았고, 추측으로 넘기지 않았다.

실측(reader 열림): 1440에서 28px(데스크톱 fine pointer 유지), 1100·1024·768·620에서 select·reset·체크박스 행이 모두 44px. 실행 결과: 53-case 53/53 통과, 전체 `npm test` `complete:true` 3,360개 중 3,355 통과·실패 0·제외 5, typecheck·static·Pages build/verify 통과.

남은 항목: D04(960px compare CSS/JS), D08(Linux fixture), D09의 3항목(scrollTop 직접 대입·ancestor hit·왕복 반올림), D02 데이터 owner 준비 상태 설계, 320/390 첫 진입 간헐 실패의 진단 계측, WP-A 미디어, macOS 외부 AppKit·Safari·실기기, 원격 CI·배포.

## 2026-11-11 후속 6 — D08 플랫폼 고정, D04 충돌 기록

**D08 (Linux에서 native-select 13건 실패) — 수정.** 테스트가 macOS 데스크톱 경로를 검사하면서 플랫폼을 호스트 기본값(`process.platform`)에 맡기고 있었다. 리눅스에서는 Darwin 분기를 건너뛰는데 단언은 Darwin 전환·키코드를 기대해 실패한다. 테스트 파일에서 호출을 `platform:'darwin'`으로 고정하는 래퍼(`darwinSelect`·`darwinPopup`)로 통일했다. 리눅스 분기를 검사하는 두 호출은 자기 `platform:'linux'`를 그대로 넘겨 스프레드에서 우선한다. macOS에서 22/22 통과. 리눅스 실행은 이 환경에서 하지 않았으므로 리눅스 실패 0을 직접 관측한 것은 아니다.

**D04 (960px compare의 CSS/JS 모드 불일치) — 수정 시도 후 철회, 충돌 기록.** 실측으로 확인한 상태는 이랬다. compare에서 reader를 열면 959px 이하에서는 `overlay=true`로 차트를 inert 처리하고, 960px 이상에서는 `position:fixed`로 차트 위 316px를 덮으면서 `overlay=false`(키보드 트랩·inert 없음)였다. 덮인 영역이 탭 가능한 채로 남는 결함이다.

시도한 수정은 compare의 960px 이상 그리드를 `minmax(0,1fr) 0 var(--rail)`에서 `minmax(0,1fr) var(--detail-width,320px) var(--rail)`로 바꿔 열 폭을 실제로 예약하는 것이었다. 측정 결과 960·1024·1200·1440·1920에서 겹침이 316px에서 0px로 사라지고 닫기 버튼도 유지됐다.

그러나 `verify-workspace-browser`의 기존 계약이 "reader를 열어도 문서·워크스페이스 폭이 변하지 않아야 한다"(`Opening reader changed document or chart workspace width`)를 요구해 정면으로 충돌했고, 53-case 스위트가 해당 legacy 워크스페이스에서 실패했다. 두 계약 중 하나를 임의로 뒤집지 않기 위해 CSS를 되돌렸다. 남은 선택지는 (a) 폭 불변 계약을 유지하고 960px 이상에서 키보드 트랩만 추가(차트는 덮인 채 탭 가능), (b) 폭 예약으로 겹침을 없애고 기존 폭 불변 계약을 새 계약으로 교체(차트가 좁아짐). 제품 결정이 필요하다.

이번 후보 최종 확인(커밋 `d729bab` + D08 테스트 수정): 53-case 53/53 통과, compare PASSED, 전체 `npm test` `complete:true` 3,360개 중 3,355 통과·실패 0·제외 5, typecheck·static·Pages build/verify 통과.

남은 항목: D04(위 두 선택지 중 결정), D09의 3항목(scrollTop 직접 대입·ancestor hit·왕복 반올림), D02 데이터 owner 준비 상태 설계, 320/390 첫 진입 간헐 실패의 진단 계측, WP-A 미디어, macOS 외부 AppKit·Safari·실기기, 원격 CI·배포.

## 2026-11-11 후속 7 — D09 검사 신뢰도

compare 셸 검증에서 두 가지가 실제 입력을 증명하지 못했다.

- `revealInOwners`가 조작부를 화면 안으로 가져올 때 `scrollTop`을 직접 대입했다. 이후 클릭이 trusted여도 "사용자가 스크롤해서 도달했다"는 증거가 아니었다. 이제 스크롤 소유자의 화면 중앙에 실제 `Input.dispatchMouseEvent` 휠을 보내고, 매 시도마다 대상의 사각형을 다시 재서 뷰포트에 들어올 때까지 반복한다. 시도별 deltaY와 소유자를 기록으로 남긴다.
- hit 판정이 `n === t || t.contains(n) || n.contains(t)`여서, 대상이 다른 요소에 덮여 있어 래퍼가 클릭을 받아도 통과할 수 있었다. 이제 대상 자신이거나 그 자손인 경우만 통과시킨다.

수정 후 compare 셸 실브라우저 **PASSED**(실패 0)를 유지했고, 전체 `npm test`는 `complete:true` 3,360개 중 3,355 통과·실패 0·제외 5다. 검사를 약화하지 않고 오히려 이전에 비어 있던 증거 조건을 채웠다.

남은 항목: D04(폭 불변 계약과 겹침 제거 중 선택), D02 데이터 owner 준비 상태 설계, D09의 남은 왕복 반올림 범위, 320/390 첫 진입 간헐 실패의 진단 계측, WP-A 미디어, macOS 외부 AppKit·Safari·실기기, 원격 CI·배포.

## 2026-11-11 후속 8 — 첫 페인트 실패의 원인 확정: 검사용 정적 서버

320/390 첫 진입에서 간헐적으로 `dataset.boot='error'`가 되던 현상의 원인을 계측으로 확정했다.

부트 셸에 첫 실패 원인 기록을 추가했다. `fail()`이 최초 전이 직전에 `phase`, `elapsedMs`, `route`, 실패 종류(이벤트/오류/타임아웃), 대상 요소·URL을 `documentElement.dataset.bootFailure`에 한 번만 남기고, 진단이 부트 결과를 바꾸지 않도록 예외를 삼킨다. 계측은 `performance`가 없는 vm 테스트 컨텍스트에서도 동작하도록 `Date.now()` 폴백을 둔다(이 보완 전 전체 회귀에서 74건이 `performance is not defined`로 실패했고, 원인을 고쳐 다시 0 실패로 돌렸다). 44-case 러너도 실패 시 이 기록을 메시지에 포함한다.

계측으로 잡힌 실제 원인은 두 가지였다.

- `TypeError: Failed to fetch dynamically imported module: …/app.js?v=1.37.8` (elapsed 62ms, phase boot)
- 초기 스타일시트 실패로 즉시 `fail` (elapsed 0ms, kind unknown → early style failure 경로)

둘 다 앱 로직이 아니라 검사에 쓰던 Python `http.server`가 동시에 나가는 41개 스타일시트·모듈 요청을 흘린 결과였다. 같은 `dist`를 Node 정적 서버(연결 유지·명시적 MIME)로 바꾸자 44-case가 종목별로 전부 통과했다: BTCUSD 11/11(2회 연속), ETHUSD 11/11, MSTR 11/11, BMNR 11/11 = **44/44**, `exit 0`.

정정: 이전에 "320/390 첫 진입의 간헐적 boot error가 미해결 제품 결함"으로 기록한 판단은 **철회**한다. 제품 결함이 아니라 검사 환경(정적 서버) 문제였다. 앱 쪽에서 남는 개선은 진단 기록을 남기는 것까지이며, 그 계측은 이번에 들어갔다.

최종 확인: 44-case 44/44, 53-case 53/53, compare PASSED, 전체 `npm test` `complete:true` 3,360개 중 3,355 통과·실패 0·제외 5, typecheck·static·Pages build/verify 통과.

남은 항목: D04(폭 불변 계약과 겹침 제거 중 제품 결정), D02 데이터 owner 준비 상태 설계, WP-A 미디어·청취·PDF·Linux 게시, macOS 외부 AppKit·Safari·실기기, 원격 CI·배포.

## 2026-11-11 후속 9 — R1 D04 완료

R1은 960px 이상 compare에서 reader가 차트를 덮는 결함이었다. 1440에서 실측한 상태는 reader `x=1075..1395`(폭 320)가 차트 호스트 `x=56..1391`(폭 1335)를 295px 덮고, `overlay=false`·`inert` 없음이었다. 즉 덮인 영역이 탭 가능한 채로 남아 있었다.

수정은 `dist/chart-details-panel.css`의 960px 이상 compare 규칙에서 가운데 열을 `0`에서 `var(--detail-width,320px)`로 바꾼 것이다. reader는 계속 뷰포트에 고정해 닫기 동작을 유지하되, 그리드가 같은 폭을 비워 두므로 차트가 가려지지 않는다.

실측(수정 후): 960에서 차트 열 859→539, 1024에서 923→603, 1200에서 1099→779, 1440에서 1339→1019, 1920에서 1819→1499로 축소량이 모두 320(= reader 폭)이고 reader·차트 겹침은 0, 문서 폭은 불변이다. 959 이하에서는 기존 overlay 모드가 유지되고 `#main`이 inert로 남는다.

`scripts/verify-workspace-browser.mjs`의 "Opening reader changed document or chart workspace width" 단언은 새 계약으로 교체했다. 문서 폭 불변은 그대로 요구하고, split 모드에서는 차트 열 축소량이 reader 폭 ±2이며 reader와 차트가 겹치지 않고 `#main`이 inert가 아님을, overlay 모드에서는 반대로 `#main`이 inert임을 요구한다. 차트 path는 폭이 줄면 정당하게 재투영되므로 split 모드에서만 "path 수·점 개수·y 범위 보존 + 어떤 path도 새 폭을 넘지 않음 + 최소 한 계열의 x축 축소"를 검사하고, overlay 모드에서는 기존처럼 path bytes 동일을 요구한다. 닫을 때는 문서·차트 폭과 path bytes가 기준 상태로 정확히 복원되어야 한다. 검사를 삭제하거나 허용치를 늘린 것이 아니라, 폭이 변하는 레이아웃에서 증거로 삼을 수 있는 조건을 명시한 것이다.

이번 후보 커밋 `4d22531`에서 실행한 결과:

- 전체 사이트 53-case 네이티브 브라우저 스위트 **53/53 passed, failures 0**(sourceCommit `92267b8`).
- compare 셸 실브라우저 **PASSED**, 실패 0, viewport 320x740~1920x1080 9종 전부 `overflow 0`.
- 전체 `npm test`: `ATLAS_TEST_TOTAL {"complete":true,"tests":3360,"pass":3355,"fail":0,"skipped":5,"batches":2}`. Docker Desktop을 켜서 frozen 배치까지 실행하고 다시 내렸다.
- `npm run typecheck`, `npm run verify:static`(967 files·214 scripts·992 references), `npm run build:pages`, `npm run verify:pages`(12 files·9 routes) 통과.

주의: 이번 실행에서 `fc-list`가 PATH에 없어 53-case가 즉시 중단됐다. Homebrew 경로(`/opt/homebrew/bin`)를 PATH에 넣어 재실행했고, 한국어 폰트 검사는 실제로 수행됐다(검사를 건너뛴 것이 아니다). Docker도 PATH에 없어 절대 경로 CLI를 써서 기동했다.

남은 항목: D02 데이터 owner 준비 상태 설계, D09 왕복 반올림 범위, WP6 여정(R4), 원격 상태·CI(R5), R6·R7 차단 유지, R8 문서 최종화. `mediaPrepared:false`와 출시 보류를 유지한다.

## 목표와 경계

- 관측 데이터·모형·출처·불변 기록을 보존하면서 화면의 불필요한 장식과 중복을 줄인다.
- 데스크톱·태블릿·모바일의 실제 조작, 로딩·빈 결과·오류·정상 상태를 검증한다.
- 같은 검증을 불필요하게 반복하는 CI만 줄인다. 시간 예산, 수치 허용오차, 브라우저 사례 수, artifact/source identity 검사를 낮추지 않는다.
- DeepSeek 구현은 부모의 diff·검사·실제 화면 판정 전까지 후보이다. 실패한 변경은 수정 후 재검사하고 반복 실패하면 부모가 구현한다.
- 커밋·PR·빌드·배포·릴리스는 별도 상태다. 미검증 변경은 main에 합치거나 출시 완료로 표시하지 않는다.
- 인증·유료 RAG·시즌 테마 요구사항의 기존 미결정/구현 보류는 이번 UI 품질 요청만으로 자동 해제하지 않는다. 유료 용량과 개인정보 정책을 임의로 선택하지 않는다.
- 연구 모델의 경제 입력·실제 전향 성숙 창은 UI 검사로 충족되지 않는다. `ETH_REMAINING_CONDITIONS.md`의 연구 승격 조건을 유지한다.

## 최초 작업 소유권 — 이력

| 작업 | 담당 | 브랜치/범위 |
|---|---|---|
| 통합·QA·GitHub·배포·롤백 | 부모 | 통합 `release/launch-readiness-20261110`, 최종 후보 `fix/launch-compact-period-20261110` |
| 가격축 정확성·캐시 | 부모, Astra 검토 | `fix/launch-axis-20261110` |
| UI 장식·표면 정리 | DeepSeek 4.1 Flash, 부모 pass/fail | `fix/launch-ui-20261110` |
| CI 중복 제거 | DeepSeek 4.1 Flash, 부모 pass/fail | `fix/launch-ci-20261110` |
| WP-A 컨퍼런스 | 기존 웹 Pro 스레드 | `feat/conference-review-20261110`, PR #98 |

원래 로컬 checkout의 `dist/data/relay/*` 미커밋 변경과 별도 서비스/릴레이 워크트리는 보호한다. 통합은 최신 main에서 생성한 별도 워크트리에서 수행한다. 구 브랜치의 146개 로컬 전용 커밋은 임의로 main에 합치거나 삭제하지 않는다.

## 판정 규칙과 최초 후보 상태 — 이력

PASS는 정확한 revision, 실행 결과, 관측 수용 기준이 모두 있는 경우만 사용한다. TODO는 실행 가능, BLOCKED는 외부 입력·권한·환경·실제 시간 경과가 필요함을 뜻한다. 제외 또는 보류는 PASS가 아니다.

| ID | 수용 기준 | 상태 | 근거/남은 일 |
|---|---|---|---|
| S01 | origin/main 동기화·dirty delta 보존·복구 지점 확보 | PASS | main `38b9e66`, `backup/prelaunch-20261110-38b9e66`, 미커밋 axis patch 백업 |
| S02 | 요구사항 문서 최신 main 기반 통합 | 로컬 완료 | 시작 main 기반으로 문서 전용 5개 커밋을 provenance 포함 이관. 새 후보의 main 반영은 보류 |
| U01 | AI식 장식·중복·둥근 카드 정리, 의미색/초점 보존 | 부분 완료 | UI 정리와 390px 도구 모음·필터·heading 및 390×430 overlay 라벨 수정. 전체 화면 최종 수용은 U02/U03 미충족 |
| U02 | 6 viewport, 전체 셸+실제 자식 화면 overflow/가림 없음 | BLOCKED | 비교 화면 6폭 렌더 통과. 전체 네이티브 시나리오는 390px 통과, 320px dialog clip 실패, 1440px select 입력에서 중단. 뒤쪽 미도달 상태는 미검증 |
| U03 | 키보드·44px 모바일 주요 조작·닫기·포커스 복귀 | 부분 완료 | 비교 복귀 버튼 44×44와 실제 복귀·원래 노드 위치 확인. 모바일 하단 44px 미만 대상 5→0. dialog·native select 기준은 미통과 |
| U04 | 레거시 bare compare → 단일 셸 | PASS (후보) | 기존 toolbar 노드·콘텐츠 보존, URL parser·popstate 복원, 사용자 의도에서만 URL 갱신. `5e241e4`·`acdd1f9`까지 Astra 승인, 관련 회귀 22/22 |
| P01 | 가격축 캐시 정확성·문서 격리·폰트 완료 hover 갱신 | PASS | `1f651ae`, 관련 42/42 통과, GPT-6 Astra 최종 코드 승인. 번들·배포 승인은 별개 |
| P02 | 점근 분석·동일 workload A/B·회귀 없음 | 측정 완료·한계 있음 | 3쌍 20초 블록, 동일 입력 라벨의 cold 중앙 비율 1.689×·warm 1.000×. 출력 속성 8개가 달라 동일 출력/전체 앱 성능 개선으로 주장하지 않음 |
| C01 | CI 중복 제거, 검증 강도·source identity 보존 | 로컬 완료 | worker 제한·fail-closed 집계·중복 조회 감소 통합. 시간·수치·브라우저·artifact gate는 보존. 새 원격 CI/배포 검증은 아님 |
| C02 | 전체 검사·정적 검사·typecheck·generated pages 재현 | BLOCKED | 최종 3,294개 중 3,289 통과·0 실패·5 제외; typecheck·static 성공. `build:pages`는 macOS `library load disallowed by system policy`로 차단, `verify:pages` 미완료. 권한·서명·xattr 변경이나 backend 우회 없음 |
| C03 | 기존 상태 검증 명령·음성 대조군 재실행 | PASS (한정) | 기존 OpenJDK 25로 5명령 정상 종료. TLC 27설정: 정상 8·예상 불변식 위반 19. 실제 소스 대조군 32개 검출. 무한 상태/브라우저/새 모델 대응 검토의 증명은 아님 |
| A01 | WP-A 실제 코드·자산·로그 수신 및 통합 | 부분 완료 | PR #98은 OPEN/draft, 원격 head `7064d25f3fc6eb1574375f1ce76373926a637d6b`. 계약에 맞춘 15세션·16파일 오디오 하위 묶음만 준비, 전체 미디어 통합 미완료 |
| A02 | WP-A 청취 검수·동기화 10지점 | BLOCKED | 직접 청취와 ±0.5초 동기화 검수 미완료. 전체 디코드·타이머·SRT 검사로 대체하지 않음. PDF 547페이지와 Linux 원자 게시도 미완료 |
| G01 | PR/이슈를 실제 결과에 맞춰 정리 | 기존 정리 완료·후속 보류 | #90/#85 병합, #80/#51/#55 superseded 종료. #98/#91–97 보존. 이번 최종 검사 뒤 PR 변경 없음 |
| G02 | 목적별 커밋·원격 보존·검증 통합 PR | 로컬 보존·원격 보류 | 목적별 후보와 검증 원장 보존. 기존 복구 브랜치 외 새 후보 push·merge·통합 PR 변경 없음 |
| R01 | 검증된 artifact로 배포·publication.json commit 일치 | BLOCKED | 2026-11-10 21:17 KST HTTP 200 readback의 sourceCommit `36e7db09f7f66016753f63452a8cba44adcbed28`은 후보와 다름. 새 배포 없음 |
| R02 | 버전·릴리스 asset·체크섬·롤백 절차 일치 | BLOCKED | build/native QA/미디어 gate 미충족으로 정식 릴리스 보류 |
| F01 | 소유한 일회성 탭·서버·clean worktree 정리 | 확인 범위 완료 | 소유한 8153/8154 서버와 일회성 작업트리 12개 정리. 생성 증거는 별도 경로로 이동 보존, 모든 브랜치·현재 후보·WP-A Pro 대화 보존. [정리 영수증](launch-2026-11-10/cleanup.json) |

## 점근적 분석 기준

- 가격축: k개 라벨, u개 미캐시 문자열. draw당 고정 sample 1회(별도 badge 크기면 추가 1회)와 u개 전체 문자열 실측. cache hit은 Map 조회이며 신규 라벨이 모두 다르면 O(k) 실측이 남는다. 문자열 hashing/length 비용도 존재한다.
- 메모리: Document WeakMap, 문서당 2048 측정값, layout당 256. 영구 document의 viewport/size 변경에도 엔트리 수 상한 유지.
- 주석: 한 refresh 안에서 computed style 재조회만 메모화. 전체 SVG 재생성/annotation 후보 순회 자체의 차수 개선을 주장하지 않는다.
- CI: 게이트 그래프·중복 입력·출력 소유권 기준으로 동일 검증의 재실행을 제거한다. 순차화와 elapsed-time 개선은 구분하며 병렬 lane 추가로 계측 노이즈를 만들지 않는다.
- 이전 합성 수치 32.45→7.37ms는 근사 합성 구현의 측정이며 현재 정확 캐시에 적용하지 않는다. 실사용 개선은 교차 A/B 후에만 보고한다.

## 되돌리기

1. 시작 main은 `38b9e66`, 마지막 확인된 production source는 `36e7db0`. 둘을 같은 검증 상태로 취급하지 않는다.
2. 통합 전 후보는 브랜치로 보존한다. 실패 후보는 병합하지 않는다.
3. 통합 후 회귀는 관련 목적 커밋을 `git revert`로 되돌리고 기존 전체 검증을 재실행한다. main history를 강제로 되감지 않는다.
4. 이전 production artifact/version을 확인한 뒤 정확한 배포 대상으로 복구한다. source 태그만으로 배포 복구 완료라고 하지 않는다.
5. 작업 중 생성한 로그·소스 해시·검사 결과·스크린샷은 세션 작업 영역에 보존한다. 공개 릴리스에는 비밀·원본 개인정보·민감 설정을 포함하지 않는다.

## 환경과 모델 관측

- Pstack 공식 `pstack` 경로 최신 revision은 `c742dd61706fbacc1b95f1a20b7b988cf096ce6c`, 설치 기준과 일치(2026-11-10T08:24Z). 원저자 후속 글 전체 탐색은 이번 실행에서 아직 별도로 검증하지 않았다.
- 웹 GPT-6은 native menu에 사용 한도 도달 표시. 기존 허용 fallback GPT-5.6 Sol Pro를 선택하고 WP-A 복구 메시지 1회 제출, `생각 중`/`중지` 확인. 로컬 코드 검토는 별도 `openai-codex/gpt-6-astra`.
- `npm ci` esbuild postinstall은 SIGKILL. `--ignore-scripts` 설치만 성공했으며 이것은 정상 설치/빌드 PASS가 아니다. 이후 명시적인 OS library policy 거절을 확인하여 로컬 native build는 중단했다.
- Java 부재라는 이전 판단은 해소했다. 이미 설치된 `/opt/homebrew/opt/openjdk@25/bin/java`가 `25.0.5.0.3`으로 정상 실행됐다. 설치·시스템 설정 변경 없이 명령 범위의 `JAVA`만 지정해 고정 TLC 1.7.4와 기존 검증 명령을 실행했다.
- WP-A 웹 스레드의 마지막 재시도 결과는 `Internal Server Error`였다. 추가 요청·모델 전환·PR 수정은 하지 않았다.

## acdd1f9 검증 영수증과 범위 — 이력

[검증 요약](launch-2026-11-10/verification-summary.json)은 검사한 제품 commit, 출력 해시, 네이티브 실패, 운영 readback을 분리한다. [정형 검증 영수증](launch-2026-11-10/formal/) 5개는 실제 명령 결과 그대로이며, 문서 수정이 뒤에 붙어도 검사한 제품 revision은 `acdd1f9`다.

- 전체 검사: `npm test -- --test-concurrency=4`; `ATLAS_TEST_TOTAL`의 `complete:true`, 3,294 tests / 3,289 pass / 0 fail / 5 skipped / 2 batches를 확인했다. 직전 snapshot의 3,290개 결과로 최신 후보를 대체하지 않았다.
- `npm run typecheck`, `npm run verify:static`: 정상 종료. 정적 검사는 966 files, 213 scripts, 991 references다.
- 상태 검증: market/equity/ETH/publication의 고정 유한 TLC 모델과 replay의 실제 JS bounded traces를 구분한다. Replay는 10,000개 재생 trace·40,000 전이 및 259개 선택 trace·726 전이를 확인했다. 전체 다섯 명령의 실제 소스 음성 대조군은 32개이며 복원본도 통과했다. 이번 재실행을 새 모델 대응/상태도 인증, 무한 상태 증명, 수치 예측이나 네이티브 브라우저 증명으로 확대하지 않는다.
- 비교 화면: 320/390/456/768/1280/1440px, 97행, 제목 '사이클 비교', 가로 넘침·런타임 오류 0을 확인했다. 모바일 복귀 조작 후 `page=outlook`과 원래 `BODY` 부모 복원을 관측했다. 닫힌 반응형 rail은 실패가 아니다. footer·plot 외곽 높이를 보존했다. 이는 전체 사이트의 6폭 수용 완료가 아니다.
- Astra 승인 범위: `5b1b5bc..5e241e4`, `5e241e4..acdd1f9`. 마지막 검토 5파일, 변경 테스트 독립 9/9 및 부모 관련 22/22. 코드 승인이 build·native QA·출시 승인을 대신하지 않는다.

### 남아 있는 네이티브 QA

1. 320px TQQQ dialog: 열린 `dl`의 top -29, clip top 62로 기준을 충족하지 못했다. wheel 이벤트는 trusted·무차단으로 대상에 도달했지만 관측한 `scrollTop`은 103→103이었다. focus를 DIALOG로 옮긴 wheel/PageUp/Home 및 별도 touch 진단도 통과하지 못했다. 앱이 offset을 재적용한다는 원인은 확인되지 않았고 부호 반전 제안은 철회했다. 실제 사용자의 스크롤 가능 여부도 미확정이다.
2. 1440px macOS Chrome native select: `selected nasdaq` 대기에서 시간 초과. 테스트를 합성 선택으로 바꾸거나 기준을 낮추지 않았다. 이 실패만으로 실제 사용자 조작이 불가능하다고 단정하지 않는다.

### WP-A 오디오 전용 전달본

- `scope: audio-only`, `audioPrepared:true`, `mediaPrepared:false` 유지. 15세션·16파일의 원본 불변성, 출력 SHA-256·크기·형식·길이·전체 디코드를 확인했고 ZIP 내부 16개 파일도 원본 전달본과 바이트 해시가 일치했다.
- ZIP: `wpa-audio-only-unreviewed-20261110.zip`; SHA-256 `bda4a81215ebff2b5ea1f3003bf6f9493b1bba4232e5b6057aa58ce37b9f1020`.
- 승인 프로그램은 20,400초다. 원본 컨테이너 초과분 0.68초가 발화인지 인코더 패딩인지는 확인하지 못했으며 세션에 임의 포함하지 않았다.
- 직접 청취·동기화 10지점, PDF 547페이지, 전체 패키지 및 Linux `renameat2(RENAME_NOREPLACE)` 게시 검수는 미완료다. 오디오 준비를 전체 미디어 준비나 배포 가능으로 표시하지 않는다.

## acdd1f9 당시 재개 조건 — 이력

당시 로컬 후보는 `fix/launch-compact-period-20261110`에 보존했다. 당시 네이티브 두 실패의 원인 확인과 `build:pages`·`verify:pages` 및 artifact source/content identity 검증이 남아 있었다. 후속 빌드 해소 여부는 위 현재 작업판과 아래 `2d9d99f` 기록을 따른다. WP-A 부분 산출물은 별도 미디어 gate를 유지한다. 이 미완료 상태에서는 새 후보 push·merge·배포·정식 릴리스를 수행하지 않는다.

## 후속 반응형 후보: 2d9d99f

이 절은 앞의 `acdd1f9` 검사 기록을 소급 변경하지 않는다. 새 후보는 격리 브랜치 `fix/tradingview-responsive-20261110`의 제품 소스 `2d9d99fcf33e46be314c2ba07111e89b3b5bf1db`다.

- 하단 48px 단일 도크, 원래 컨트롤의 disclosure·정보 시트 이동/복원, 태블릿 overlay와 데스크톱 split을 적용했다. 가격 상태 hook의 앱 소유권도 보존한다.
- BTC·ETH·MSTR·BMNR의 반응형 44/44 통과. 7개 기본 폭, 3개 짧은 화면, 종목별 폰→데스크톱→폰 왕복을 포함한다. 검사 전후 159개 소스 해시 일치.
- 전체 회귀 3,321개: 3,316 통과, 실패 0, 기존 제외 5. 고정 Linux/x64 출력 41건 포함. 후속 검증 코드 테스트 12/12 통과.
- 이 후보의 typecheck·verify:static·build:pages·verify:pages는 통과했다. OS 권한·서명이나 수치 허용 오차를 변경하지 않았다. 이전 macOS 빌드 실패를 성공으로 바꾸는 기록이 아니다.
- 기존 가격 차트 브라우저 검사 14/15 통과. `[blocked]` ETH 1440px native 모델 선택 입력이 수용되지 않았다. 원래 값 대입 없는 native 입력 기준을 유지한다.
- 기존 BTC 작업공간 2/3 통과. `[blocked]` 320px 범례 touch scroll은 후보와 기준선 53b5458 양쪽에서 동일하게 실패했다. 기준선의 1440px 검사 중 390×430 내부 구간선 검사는 실패했지만 후보에서는 통과했다. 이 비교를 성능 향상이나 전체 사이트 수용으로 확대하지 않는다.
- 이전 TQQQ 320px·Nasdaq native select 1440px 및 WP-A 미디어 gate는 그대로 남는다. 신규 push·merge·배포·PR 변경은 하지 않았다.

세부 범위: [반응형 계약·검증 기록](TRADINGVIEW_RESPONSIVE_20261110.md), [소스·결과 해시 원장](tradingview-responsive-20261110/verification.json).
