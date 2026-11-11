# Atlas 서비스 품질·출시 체크리스트

시작 기준은 2026-11-10의 `38b9e66`이다. 현재 인계 브랜치는 `fix/tradingview-responsive-20261110`, 통합 제품 소스는 `c6b34b984b2919b7dc691f023ea4ee800c468d49`이다. 이 문서와 Pages 재생성 산출물을 포함하는 인계 커밋은 브랜치의 Git identity로 확인한다. 아래 현재 작업판은 2026-11-11 KST 갱신이며, 이전 리비전의 검증 결과를 새 후보 전체 통과로 읽지 않는다.

## 현재 작업판 — 자동 진행 (2026-11-11 기준)

이 표가 이 저장소의 단일 진행 원장이다. 아래 `## 2026-11-11 후속 2~8` 절과 `## 역사 기록` 절은 각 시점의 영수증이며, 현재 판정은 이 표를 따른다. 브랜치 `fix/tradingview-responsive-20261110`, 기준 커밋 `8a0e2276f0d59fdd6f54bf22b67fdb04a1d5ae97`.

| ID | 상태 | 닫는 조건 |
|---|---|---|
| R0 인계·셸·reader 기본 수정 | 완료 | D01 relay 클릭, N01/N02 내비 소유권·44px, 하네스 수집 범위, D03 reader Back, D05 reader 44px, D06/D09 사전 native client 검사·휠 도달·자손 hit, D07 복원 readback, D08 플랫폼 고정, relay dataset 소유권, 부트 진단 계측까지 반영. 44-case 44/44, 53-case 53/53, compare PASSED, npm test `complete:true` 3,360/3,355/0/5. |
| R1 D04 compare reader 겹침 | 완료 `4d22531` | 960px 이상 compare 그리드의 가운데 열을 `var(--detail-width,320px)`로 예약했다. 실측: 960/1024/1200/1440/1920에서 reader 폭 320, 차트 열 축소 320(= reader 폭), reader·차트 겹침 0, 문서 폭 불변, 959 이하 overlay 모드는 `#main` inert 유지. `verify-workspace-browser` 단언을 새 계약으로 교체(문서 폭 불변, 차트 열 축소 = reader 폭 ±2, split 겹침 0·inert 아님, overlay는 inert 필수, 차트는 점 개수·y값을 보존한 채 수평 재투영, 닫으면 원래 path bytes 복원). 검증: 53-case 53/53·실패 0, compare PASSED(9 viewport·overflow 0), `npm test` `complete:true` 3,360/3,355/0/5, typecheck·static·Pages build/verify 통과. |
| R2 D02 source sheet 준비 상태 | 완료 `947e33d` | `renderMethod()`가 `null` comparison에서 즉시 `false`를 돌려주고, `showMethod()`는 준비 실패를 토스트로 알린다(예외 없음). comparison 생성은 `buildStateComparison()` 한 곳으로 모아 차트·표·시트가 같은 객체를 읽고, 시트는 검증된 dataset에서 필요할 때 같은 함수로 만든다. 가격 owner는 `document.body.dataset.comparison='ready'`와 `atlas:comparison` 이벤트로 준비 상태를 알리고, `content-shell.js`는 그 신호가 없을 때만 `.footer [data-method]`를 잠그며 이벤트에서 다시 place한다. 실측: `?page=data`·`?page=ipo`·`?page=relay` 직접 진입은 readiness `unset`·비활성+이유 유지, `?page=evidence`는 dataset을 적재해 `ready`·활성·시트 1,744자, 차트에서 같은 문서로 돌아온 relay는 `ready`·활성·method reader 787자를 실제 내용으로 연다(수정 전 차트 라우트의 footer 버튼은 `Cannot read properties of null (reading 'metadata')`로 아무것도 열지 않았다). 검증: compare PASSED(실패 0·findings 0, 9 viewport·overflow 0), 53-case 53/53·실패 0, `npm test` `complete:true` 3,363/3,358/0/5, 신규 `tests/content-shell-source-readiness.test.mjs` 3/3, typecheck·static(967/214/992)·Pages build/verify(12 files/9 routes) 통과. |
| R3 D09 왕복 반올림 범위 | 완료 `a739b36` | 리더 왕복 폭 비교를 값의 출처별 계약으로 나눴다. `document.scrollWidth`·`body.clientWidth`·`body.scrollWidth`는 정수라 1px만 달라도 스크롤바·리플로 회귀로 실패시키고, `.workspace`·`#main`의 소수 폭은 `WIDTH_ROUNDING_TOLERANCE_PX=1`까지를 반올림으로 분류해 영수증에 `kind:'rounding'`과 delta로 남긴다. 리더 열 예약은 `READER_RESERVATION_TOLERANCE_PX=2`로 상수화했다(값은 기존 2 유지). `compareRoundTripWidths`/`assertRoundTripWidths`는 1px 초과를 `kind:'regression'`으로 실패시키고 초과 상자를 모두 `beyond`에 모으며, 숫자가 아닌 허용치·측정 불가 값(`null`, 문자열, NaN)은 통과시키지 않는다. 문서는 `docs/TRADINGVIEW_RESPONSIVE_20261110.md` §4.5. 신규 단위검사 9/9. 53-case 53/53(실패 0, `workspace.legacy.methodReader.widthRoundTrips` 6건 = 320/1440/375 × close-button/Escape, 모두 `exact` delta 0), compare **PASSED**(실패 0·findings 0, 9 viewport 320x740~1920x1080 전부 overflow 0), `npm test` `complete:true` 3,372/3,367/0/5, typecheck·static(967 files·214 scripts·992 references)·Pages build/verify(12 files·9 routes) 통과. 제품 코드(`dist/`)는 바꾸지 않았고 검사 강도만 올렸다. |
| R4 WP6 여정 | 완료 `2be7da6` | 후보 origin `http://127.0.0.1:8171/bitcoin-cycle-atlas`(커밋된 `dist` + 유도된 `atlas-wp6-candidate-source` identity)에서 `--expected-source 2be7da67bfe5d16ba1173bed7fd391b0f9281e03`으로 실행했다. identity: `productionDeployment:false`, `verifiedTrackedDistClean:true`, `sourceCommit 2be7da6…`, `sourceTree 4e6eaa9f…`, `distTreeSha256 48a3abcff4afef9a…`, 문서 sha256 `04211835a6e40acf…`, `inspector.workingChanges` 빈 값. **WP6 30/30 PASS**(BTCUSD·ETHUSD·MSTR·BMNR·TQQQ × 320x740/390x844/768x1024/1024x768/1440x900/1920x1080, 실패 0, 스크린샷 48장, Chrome 157.0.8103.51). 실측: TQQQ 기준 컨트롤이 320·390에서 collapsed 44px 칩, 768 이상에서 7행(`매매 기준/전체 승률/현재/분할 매수/분할 매도/적극/중립`), `data-criteria-through 2026-10-30`, state `unmet`·band `neutral`; 상세 다이얼로그 배지 `승률 72.7% · n=66`, HUD 7필드, 기준 상세 7행, `aria-expanded` false→true→false. BMNR은 6 viewport 모두 T3·`forecastAllowed=false`·경로 0·표본 부족 문구, ETHUSD는 548 관측 예측점, BTCUSD replay는 play/next 소유·speed·live 확인 후 replay 종료를 6 viewport에서 확인. **chart-qa 12/12 PASS**(BTCUSD·COMPARE × 6, 실패 0): `maximumAnnotationPairs 0`, 축 `paintedPairs 0`, 헤딩 `smallControls 0`, 320·390에서 네이티브 30m 선택 확인. 하네스 수정: TQQQ 블록이 e116e04 이전의 인라인 승률 배지를 요구해 6케이스가 실패했고(배지는 `매매 기준 · 분할 매매 성과` 다이얼로그 소유, 차트 코너는 `.rsi-trading-criteria`), 현재 제품 계약으로 교체하면서 기준 7행·44px·다이얼로그 HUD/기준 행·승률·닫기·`aria-expanded` 복원까지 단언을 늘렸다(삭제·허용치 완화 없음). 검증: `npm test` `complete:true` 3,373/3,368/0/5, typecheck·static(967 files·214 scripts·992 references)·Pages build/verify(12 files·9 routes). `dist/` tree `48a3abc…`는 R3와 동일해 53-case·compare 결과가 같은 제품 바이트에 그대로 적용된다. 관찰 한계: COMPARE 320/390 헤딩에서 `structure-threshold` 입력과 `structure-json`(46×44)이 스크롤 소유자 안에서 잘린 채 보고됐고, chart-qa는 compare 클리핑을 단언하지 않으므로 통과 근거가 아니라 관찰로만 남긴다. |
| R5 원격 상태·CI | 대기 | 원격 브랜치 SHA와 `gh run list`/PR #98 상태를 실제 조회해 기록한다. 조회 결과를 배포·출시 승인으로 바꾸지 않는다. |
| R6 WP-A 미디어 | 차단 | `mediaPrepared:false` 유지. 직접 청취·동기화 10지점, PDF 547페이지, 전체 미디어, Linux `renameat2` 원자 게시 검수는 이 저장소 자동화 범위 밖이다. |
| R7 native 외부·실기기 | 차단 | macOS 외부 AppKit 메뉴, Safari, 실제 iOS/Android 기기 검증은 자동화 대상이 아니다. Blink 내부 팝업 trusted 입력과 동일시하지 않는다. |
| R8 문서 최종화 | 대기 | R1~R5가 닫히면 요청사항·반응형·이 체크리스트의 판정을 최종 상태로 정리하고, 남은 차단 항목만 명시한다. |

다음 후보는 R5(원격 브랜치 SHA·`gh run list`·PR #98 실제 조회)다. R6·R7은 차단 유지, R8은 R1~R5가 모두 완료/차단으로 정리된 뒤에만 착수한다.

진행 규칙(자동 실행 포함):

1. 한 번에 한 항목만 처리하고, 처리한 항목의 판정과 정확한 수치를 이 표에 갱신한다. 끝난 항목은 완료로 바꾸고 커밋 SHA를 남긴다.
2. 브라우저 검사는 Node 정적 서버로 서빙한다. `python3 -m http.server`는 동시 모듈·스타일시트 요청을 흘려 `Failed to fetch dynamically imported module`로 boot error를 만든다. 표준 절차: `mkdir -p /tmp/atlas-serve && ln -sfn <repo>/dist /tmp/atlas-serve/bitcoin-cycle-atlas` 후 Node 정적 서버를 8171에 띄우고 `ATLAS_RESPONSIVE_BASE_URL=http://127.0.0.1:8171/bitcoin-cycle-atlas/`를 쓴다.
3. `ATLAS_BROWSER_PATH=/Applications/Google Chrome.app/Contents/MacOS/Google Chrome`가 필요하다. 없으면 검사는 blocked이며 skip이 아니다.
4. 검사가 도는 동안 저장소 파일을 수정하지 않는다. 브라우저 스위트는 실행 중 소스 변경을 `Browser evidence cannot bind sources that changed during the run`으로 실패시킨다.
5. `npm test`의 frozen 배치는 Docker가 필요하다. Docker Desktop이 내려가 있으면 켜고 소켓 `/Users/twoimo/.docker/run/docker.sock`이 생길 때까지 기다린다. `complete:false`는 통과가 아니다.
6. 검사 삭제·허용치 완화·합성 값 대입으로 통과시키지 않는다. 실패는 원인을 고쳐 다시 돌린다.
7. main push·merge·force push·배포·PR 변경·유료 용량·계정/권한 변경은 금지다. 커밋과 브랜치 push만 한다.

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
