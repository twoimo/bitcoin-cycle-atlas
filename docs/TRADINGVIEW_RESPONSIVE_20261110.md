# Atlas 반응형(TradingView 기준) 요청·수용기준·체크리스트

작성: 2026-11-10 (Asia/Seoul). 사용자 요청에 따른 반응형 구현의 요구사항과 검증 원장이다.
기준선 관측과 현재 후보 검증을 구분한다. push·merge·배포·PR 변경은 금지한다.

- 기준 worktree: `/Users/twoimo/.aside/u/0/sessions/2026-11-09_887EO75N9Cn1E5h0/tmp/wt-tradingview-responsive`
- 기준 HEAD: `53b5458` (`docs: preserve final launch QA and release blockers`)
- 문서 기준 출발점: `docs/LAUNCH_CHECKLIST_20261110.md`의 `origin/main=38b9e66`,
  최종 검사 제품 소스 `acdd1f9629280125f4160d2c363f458615397906`
- 근거 자료: `tmp/tv-responsive-reference/` 27개 파일
- 문서 초안: OpenCode Go DeepSeek v4.1 Flash. 핵심 구현·통합·최종 판정: 부모 세션.

## 1. 요청사항

1. 실제 TradingView 웹 화면을 반응형 기준으로 삼는다. 현재 Atlas 반응형 계약
   (≤620 one-row 48px, ≤390 two-row 92px + 종목 기능 disclosure, 상단 heading +
   하단 footer 2줄 구조)을 실제 기준 화면의 조작 밀도에 맞춘다.
2. 폰 구간(≤620px): 기존 `.atlas-canvas-heading`을 **단일 48px 조작줄(터치 대상 최소 44px)**로 만든다.
   현재 2행(44px+44px = 92px)을 1행으로 접고, 이 조작줄은 하단에 둔다.
   - secondary(종목 기능 등 부가 컨트롤)는 별도 행이 아니라 **같은 heading 안의
     disclosure**로 옮긴다(원래 노드·핸들러·이벤트 위임 트리 유지).
   - 기존 `footer.workbench-bottom.workbench-bottom-bar`(기간·날짜·사건·가격축·상태)는
     **정보 시트(info sheet)** 로 옮기고, 데스크톱에서는 원래 footer를 그대로 복원한다.
3. 태블릿: 621–959px는 상세/리더 패널을 **overlay**로 띄워 차트 폭을 보존하고,
   960px 이상은 현재의 **split(2열)** 을 유지한다.
4. 폰·태블릿의 터치 목표 44px을 유지한다(주요 조작·닫기 버튼 포함). 데스크톱 고밀도 기준은 별도로 유지한다.
5. 보존 계약: 원래 노드/DOM 소유권, 포커스·포커스 복귀, URL 상태, 비교 화면,
   종목(symbol)과 iframe/embed 스코프, 모달, 기존 gate 전부 유지.
6. 원래 blockers는 독립적으로 재검증하며, 이번 UI 변경만으로 해제하지 않는다(7장).

## 2. 근거: 실제 TradingView 관측

### 2.1 데스크톱 1440×900 (`desktop-initial.png`, 직접 확인)

- 상단 **단일 조작줄**: 심볼 트리거(`BTCUSD`), `+` 비교, 인터벌 1m~3M, 차트 유형,
  지표, 알림, 되돌리기/다시실행, 레이아웃, Save, M/O 아이콘, Trade, Upgrade.
- 좌측 공구 레일(≈52px), 우측 아이콘 레일(44×44 버튼, 2px 간격), 우측 Watchlist 패널.
- 하단 **기간 줄**: `1D 5D 1M 3M 6M YTD 1Y 5Y All | (달력)`, 우측 시계 `21:31:31 UTC+9`.
- 우측 가격축, 하단 시간축. 즉 4면(상·하·좌·우) 고정 크롬 + 중앙 차트.

### 2.2 태블릿 768×1024 (`tablet-768-closed.png`, `tablet-768-watchlist-open.png`, `tablet-768-closed-measurements.json`)

- 768에서도 **데스크톱 크롬이 그대로 유지**된다. 상단 조작줄이 잘려 인터벌이 `3M`
  근처에서 끝나고, 좌측 레일·우측 아이콘 레일·하단 축/날짜 줄이 남는다.
- Watchlist를 열면 **overlay가 아니라 우측 패널이 폭을 차지**하고 차트가 줄어든다.
- 실측값(JSON): symbol `128×28` @ `x=56,y=5`; interval 토글 `24×38` @ `x=575.7,y=0`;
  left-tool `52×38` @ `y=48`; rail-tool `44×44` @ `x=723.5,y=44`;
  range 탭 `30.7×38` @ `y=986`(하단).
- 1024×768(`tablet-1024-symbol-search.png`, `tablet-1024-watchlist-open.png`)도 동일 구조.

### 2.3 390px 데스크톱 축소 (`narrow-desktop-390.png`, 직접 확인)

- 390×844는 **진짜 모바일 UI가 아니다**. 데스크톱 창을 좁힌 상태로, 상단 조작줄이
  `30m` 뒤에서 잘리고, 좌측 레일과 우측 아이콘 스트립이 그대로 남고, 하단은 `Dec / 20`
  일부만 보인다. 즉 "390 = 모바일 레이아웃"이라는 근거로 쓸 수 없다.

### 2.4 공식 스토어 스크린샷 (`publisher-iphone-1..7.jpg` 222×480, `publisher-ipad-1..7.jpg` 360×480, `apple-publisher-metadata.json`)

- 메타데이터: `TradingView: Track All Markets`, seller `TradingView, Inc.`, version
  `2.143.0`, release `2026-10-29T19:28:17Z`, iPhone 7장 / iPad 7장 스크린샷 URL.
- 직접 확인한 `publisher-iphone-1.jpg`는 **마케팅 합성 이미지**다. 헤드라인
  `Chart, chat and trade`, `100M+ Traders and investors use our platform` 문구와
  폰 프레임 위에 합성된 차트가 얹혀 있다.
- 따라서 이 14장은 **배포용 프로모션 이미지**이며, 현재 앱의 전체 UI 조작·상태를
  증명하는 스크린샷이 아니다. 근거로는 "폰에서도 상단 요약줄 + 전체 차트 + 하단 축"이라는
  대략적 구성만 참고하고, 픽셀·조작 계약의 근거로 쓰지 않는다.

### 2.5 실제 폰 크롬 단편 (`supplement-phone-toolbar.webp`, 직접 확인)

- 상단 얇은 줄: `심볼 · 인터벌`, 드로잉, 지표, `⋯`, 뒤로, 전체화면.
- 하단 탭 바: `Watchlist / Chart / Explore / Community / Menu`.
- 즉 실제 폰 앱은 **얇은 상단 요약줄 + 하단 탭 바**이고, 데스크톱의 4면 레일을
  그대로 축소하지 않는다. `supplement-phone-tools.webp`, `supplement-phone-landscape.webp`는
  같은 계열의 크롭 단편이다.

### 2.6 근거 사용 한계

- 27개 중 이 문서의 최초 조사에서 직접 눈으로 확인한 것은 7개(`desktop-initial`, `narrow-desktop-390`,
  `tablet-768-closed`, `tablet-768-watchlist-open`, `publisher-iphone-1`,
  `supplement-phone-toolbar`, `atlas-before-390`)이다. 나머지 20개는 파일 크기·해상도·
  메타데이터만 확인했고 픽셀 판독하지 않았다.
- 참조 관측 viewport는 1440×900, 768×1024, 390×844, 1024×768이다. 320·456·620·960
  데스크톱 웹 상태는 **직접 관측하지 않았다**. 이 문서의 해당 구간 기준은 추정이 아니라
  "미관측"으로 남긴다.

## 3. 현재 Atlas 상태(기준선)

`atlas-before-390.png`(390×844) 기준 현재 구현은 상단 heading(심볼·`1D`·아이콘·`⋮`) +
`⋯ 종목 기능` 행 + 페이지 설명 + 차트 + 하단 footer + 하단 바가 **세로로 쌓인다**.

코드 소유(읽기만 함):

| 영역 | 소유 파일 | 현재 계약 |
|---|---|---|
| heading 2행/1행 그리드 | `dist/atlas-shell.css` (L228–335) | ≤390 `grid-template-columns:minmax(80px,1fr) 56px repeat(4,44px)`, `rows 44px 44px`, 총 92px; ≤620 one-row 48px |
| 종목 기능 disclosure | `dist/ui/mobile-shell-heading.js` | `matchMedia('(max-width:390px)')`, `#atlas-shell-features-toggle` / `#atlas-shell-features-panel`, 원래 노드를 `.shell-feature-actions`로 이동, Escape/포커스 복귀 구현됨 |
| 하단 footer | `dist/chart-bottom-bar.js` | `footer.workbench-bottom.workbench-bottom-bar` (기간 select, 날짜, 사건, 축, 상태) + `#workbench-bottom-more` popover |
| 상세 패널 split | `dist/chart-details-panel.css` | `--detail-width:320px` split. 960px 이상은 가운데 열을 `minmax(0,1fr) var(--detail-width,320px) var(--rail-width)`로 예약해 차트를 덮지 않고, 959px 이하만 overlay |
| 상단/좌우 레일·툴바 | `dist/atlas-shell.js`, `dist/atlas-shell.css` | 4면 perimeter, 44/45px rail |

즉 제안 구현은 새 컴포넌트 추가가 아니라 **기존 소유 파일의 브레이크포인트·그리드
재정의 + disclosure/footer 이동**이다.

## 4. 채택한 구현 계약

### 4.1 폰 ≤620px

- `.atlas-canvas-heading`을 **1행 48px(대상 최소 44px)**로 접고, 그 행을 차트 영역 하단에 둔다.
  상단에는 심볼/현재 값 요약만 남기거나 아무것도 두지 않는다(중복 금지).
- 2행에서 쓰던 secondary는 `mobile-shell-heading`의 기존 disclosure 구조를 그대로
  재사용해 **같은 heading 안에서** 열린다. 노드 이동은 지금처럼 원래 DOM 노드를
  옮기는 방식만 허용하고, 복제·재바인딩 금지.
- `footer.workbench-bottom`은 620 이하에서 **정보 시트**(모달/시트)로 전환한다.
  기간·날짜·사건·축·상태·갱신은 시트 안에서 원래 핸들러로 동작한다.
  621px 이상으로 돌아오면 footer를 원래 위치·원래 순서로 **복원**하고 시트 트리거를 제거한다.
- 44px 터치 목표 유지, 인풋 폰트 16px 이상(iOS 확대 방지), 가로 스크롤은 컨트롤
  경계 스냅 + 제스처 체이닝 차단.

### 4.2 태블릿 621–959px

- 리더/상세(`chart-details-panel`)를 **overlay**로 띄우고 차트 폭을 유지한다.
  스크림은 차트를 리사이즈하지 않으며, 닫기·Escape·포커스 복귀는 기존 계약을 따른다.
- 근거와 다른 점을 명시한다: 실제 TradingView 768은 **overlay가 아니라 split**이었다.
  Atlas는 768에서 차트 폭 보존을 우선해 overlay를 택하는 **의도적 적응**이며, 참조와
  동일하다고 주장하지 않는다.

### 4.3 960px 이상

- 현재 split(2열, `--detail-width:320px`)을 유지한다.
- 621–1100px 및 coarse pointer에서는 44px 조작 대상을 담는 48px 헤더를 유지한다.
  1100px 초과 fine pointer는 기존 38px 고밀도 헤더다. 960px 경계는 패널 배치, 1100px 경계는 조작 크기로 서로 다르다.

### 4.4 확정한 배치

하단 48px 단일 도크를 채택한다. 44px은 버튼·입력의 최소 터치 크기다.
새 반응형 요청은 과거 390px 2행 배치를 대체하지만, 숫자·포커스·원래 노드·입력 검증 강도는 낮추지 않는다.

### 4.5 측정 폭 허용 오차 (D09)

리더를 열고 닫는 왕복의 폭 비교는 값의 출처가 다르므로 하나의 허용치를 쓰지 않는다.

| 값 | 출처 | 왕복 계약 |
|---|---|---|
| `document.scrollWidth`, `body.clientWidth`, `body.scrollWidth` | 정수 레이아웃 폭 | **정확히 일치**해야 한다. 1px만 달라도 문서 리플로나 스크롤바 발생으로 보고 실패시킨다. |
| `.workspace`, `#main` 폭 | `getBoundingClientRect()`의 소수 폭 | 왕복 반올림 허용 **1px**(`WIDTH_ROUNDING_TOLERANCE_PX`). 허용 범위 안의 차이는 영수증에 `kind:'rounding'`과 delta로 남기고, 1px을 넘으면 `kind:'regression'`으로 실패시킨다. |
| 리더를 열 때의 차트 열 축소량 | 리더 폭(정수) 대비 소수 열 폭 | `READER_RESERVATION_TOLERANCE_PX=2`. 리더 rect와 열 rect 두 소수 상자를 빼므로 2px까지 허용하고, 그 이상이면 예약 실패다. |

허용치는 상수로 고정했고 `tests/workspace-round-trip-widths.test.mjs`가 값(1·2)과 경계 동작(1.0 통과, 1.01 실패, 정수 키 변화 실패, `null`·숫자 아닌 값 실패, 숫자가 아닌 허용치 전달 실패)을 함께 검사한다. 허용치를 늘리려면 이 표와 그 테스트를 같이 바꿔야 한다. 브라우저 하네스는 `verifyLegacyMethodReader`에서 닫은 뒤 폭을 이 계약으로 비교하고 결과를 `workspace.legacy.methodReader.widthRoundTrips`에 남긴다.

## 5. 수용기준

폭: **320 / 390 / 456 / 620 / 768 / 1024 / 1440**. 짧은 높이: **390×430**,
**900×430** 포함. 추가로 320×430을 검사한다. 데스크톱·태블릿·폰 3클래스 모두 "불편함 없음" 기준.

각 폭·높이에서 확인할 것:

1. 가로 넘침 0, 세로 잘림 0, 닫기/뒤로 버튼이 스크롤 밖으로 사라지지 않음.
2. ≤620: 조작줄이 1행 48px이고, secondary는 같은 heading disclosure에서 열리고,
   footer 정보는 시트에서 원래 값·핸들러로 동작한다. 621 복귀 시 footer 원복.
3. 621–959: 리더 overlay가 차트 폭을 줄이지 않고, 960+는 split 유지.
4. 폰·태블릿 터치 목표 ≥44px(주요 조작·닫기 포함), 폰 인풋 폰트 ≥16px.
5. 원래 노드 보존: disclosure/시트 이동 후에도 `#equity-scenario`,
   `[data-equity-action]`, 기간 select, 날짜 버튼이 **같은 노드**이고 위임 핸들러가 1회 발화.
6. 포커스: 열기 시 첫 컨트롤 포커스, Escape/닫기 시 트리거 복귀, 포커스 링 2px 유지.
7. URL 상태: `?page=`, 종목, 기간 파라미터가 조작 후에도 보존되고 popstate 복원 동작.
8. 비교 화면: 6폭 렌더에서 행·제목·가로 넘침 0, 복귀 조작 후 원래 `BODY` 부모 복원.
9. symbol/iframe: iframe·임베드 문서의 스코프가 stale되지 않고, 복귀 시 원래 컨트롤 복원.
10. 모달: 열린 상태에서 트레이/시트 포커스가 모달을 덮지 않음.

## 6. 소유권

- 부모: dist 모바일 컨트롤러·공유 셸·스타일과 최종 통합·판정.
- DeepSeek 작업 1: 이 문서 초안, 이후 지정된 두 회귀 테스트 파일.
- DeepSeek 작업 2: 독립 브라우저 하네스 준비, 이후 부모가 실조작 및 하네스 결함 수정.
- DeepSeek 작업 3: 소유권·라우트 회귀 읽기 전용 검토.
- main·타인 작업트리·WP-A 상태는 보존. push·merge·배포·PR 변경 금지.

## 7. 기존 출시 gate와 이번 재검증

`docs/LAUNCH_CHECKLIST_20261110.md` 기록 그대로:

| ID | 상태 | 내용 |
|---|---|---|
| U02-a | BLOCKED | 320px TQQQ 다이얼로그: 열린 `dl` top -29, clip top 62 미충족. wheel은 도달했으나 `scrollTop` 103→103. 원인 미확정, 실제 사용자 스크롤 가능 여부 미확정 |
| U02-b | BLOCKED | 1440px macOS Chrome native select: `selected nasdaq` 대기 타임아웃. 합성 선택으로 대체하지 않음 |
| C02 | 이번 후보 통과 | 이전 후보는 macOS `library load disallowed by system policy`로 차단됐음. 이번 후보의 build:pages·verify:pages는 정상 종료. OS 권한·서명·xattr 변경 없음. 다른 gate나 배포 승인을 뜻하지 않음 |
| A01/A02 | 부분/BLOCKED | WP-A: `audioPrepared:true`, `mediaPrepared:false` 유지. 직접 청취·동기화 10지점·PDF 547p·Linux 원자 게시 미완료 |

UI 실조작과 빌드 및 기존 출시 gate는 각각 판정한다. 남은 실패를 이번 UI 관측으로 덮지 않는다.

## 8. 기존 gate 유지 / 계약 변경 필요

유지(전부 그대로 통과해야 함):

- `tests/shell-flat-chrome.test.mjs` (10건: 평면 내비, 헤어라인, 단일 헤더 행,
  무그라디언트/블러, sticky 표면, 필터 행 스크롤 계약)
- `tests/mobile-toolbar-targets.test.mjs` (footer 44px, 비교 복귀 공유 툴바)
- `tests/mobile-workspace.test.mjs` (7건: 모달/트레이 포커스, focus view, 저장 탭)
- `tests/mobile-gestures.test.mjs` (19건: 제스처·터치 추적·크로스헤어)
- `tests/mobile-shell-heading.test.mjs` (320/390 disclosure 원노드·핸들러·Escape·포커스)
- `tests/shell-slots.test.mjs`, `tests/boot-shell.test.mjs`,
  `tests/compare-shell-*.test.mjs`, `tests/chart-touch-tracking.test.mjs`
- `npm test`, `npm run typecheck`, `npm run verify:static`(966 files/213 scripts/991 refs)

이번 요청으로 변경된 레이아웃 기대(검증 강도는 유지):

1. `tests/shell-flat-chrome.test.mjs` L87 `the 390px two-row chart toolbar contract is preserved`
   — 2행 92px 계약을 1행 48px로 바꾸는 것이므로 이 테스트는 **의도적으로 재정의**해야 한다.
   같은 파일의 disclosure 계약(`44px 44px` 행, `minmax(80px,1fr) 56px repeat(4,44px)`
   열)도 함께 갱신 대상이다.
2. `dist/ui/mobile-shell-heading.js`의 `matchMedia('(max-width:390px)')` → ≤620 확장은
   기존 390 전용 테스트 픽스처(media mock)를 폭 파라미터화해야 한다.

## 9. 검증 계획(실행 전)

1. 정적: `npm test`, `npm run typecheck`, `npm run verify:static`,
   `node --test tests/*.test.mjs` 대상 파일 우선.
2. 브라우저: `scripts/verify-consolidated-workspace-browser.mjs`,
   `scripts/verify-native-browser-suite.mjs`, `scripts/verify-workspace-browser.mjs`,
   `scripts/verify-eth-candidate-browser.mjs`(AGENTS.md가 지정), 필요 시
   `scripts/verify-ui-contract-browser.mjs`.
3. 수동 capture: 320/390/456/620/768/1024/1440 + 390×430, 768×500에서
   열림/닫힘/긴 텍스트/빈 결과/오류 상태. 캡처는 세션 디렉터리에만 저장.
4. 현재 후보에서 build:pages와 verify:pages를 새로 실행해 증거를 남긴다. 이전 정책 오류 기록은 보존하며, 이번 성공으로 이전 검사까지 성공한 것으로 바꾸지 않는다.

## 10. 검증 상태

- reference / implement: 완료. 하단 48px 단일 도크, 원래 secondary 및 footer 이동·복원, 태블릿 overlay와 데스크톱 split을 적용했다.
- 반응형: BTC·ETHUSD·MSTR·BMNR 각각 10 viewport + 폰→데스크톱→폰 왕복, 총 44건 통과. 7개 기본 폭과 320×430·390×430·900×430 짧은 화면이다. 이는 전체 사이트·실물 iOS/Android 검사 완료가 아니다.
- 원래 상호작용 노드: 왕복 과정에서 BTC 43개, ETH 37개, MSTR/BMNR 각각 32개의 동일 객체를 확인했다. 복제·소실 0. 이는 모든 DOM 노드 수가 아니다.
- 발견·수정: 네이티브 footer 이동이 ETH/MSTR/BMNR 컨트롤러의 app-scoped 상태 hook을 함께 옮겼다. 원래 상태 hook은 원래 앱에 보존하고 표시 문자열만 기존 update 경로에서 footer에 반영한다. 세 종목의 회귀 테스트와 실제 부트를 확인했다.
- 전체 npm test v3: 3,321개 중 3,316 통과, 실패 0, 기존 제외 5. 설치된 Docker Desktop과 고정 Linux/x64 Node digest로 frozen 41건도 실행했다. 수치 허용 오차·저장 출력·검사 수를 줄이지 않았다.
- typecheck, verify:static, build:pages, verify:pages: 후보에서 정상 종료. 공유 lock hash·패키지 버전과 OS 권한·서명은 변경하지 않았다.
- 최종 검사 제품 소스: `2d9d99fcf33e46be314c2ba07111e89b3b5bf1db`. 검사 전후 159개 소스 해시가 일치했다. 원장: [verification.json](tradingview-responsive-20261110/verification.json).
- 기존 가격 차트 브라우저 회귀: 15건 중 14건 통과. ETH 1440px의 native 모델 선택이 `adaptive`에서 `valuation`으로 바뀌지 않아 1건 미통과다. native 방향키·플랫폼 키 코드 시도도 통과하지 않았으며 값 대입이나 기준 완화로 대체하지 않았다. 그 실패만으로 실제 사용자 선택이 불가능하다고 단정하지 않는다.
- 기존 BTC 작업공간: 3건 중 2건 통과. 320px 범례 native touch scroll은 아래 기준선에서도 실패했다. 1440px와 900×430은 통과했다. 전체 53건 사이트 검사를 완료한 것은 아니다.
- 정보 시트 접근·48px 헤더 기대만 새 배치에 맞췄다. 가격·거래량·축·확대·측정·내보내기 및 입력 수용 assert는 유지했다. 최종 검증 코드 관련 12개 테스트도 통과했다.
- Aside의 실제 미리보기에서도 fresh navigation 후 ETH 관측 봉 914개, 48px 도크, 정보 시트 열기·닫기, 원래 source hook 및 트리거 초점 복귀를 확인했다. 이전 문서 reload의 부트 오류는 별도 관측이며 원인을 단정하지 않는다.
- 기준선 53b5458에서도 320px 범례의 native touch scroll이 동일하게 실패했다. 후보의 새 회귀로 분류하지 않으며, native touch 수용은 여전히 미완료다. 320px TQQQ와 1440px native select의 별도 gate도 유지한다.
- 구현 및 위의 제한된 검증·기록 작업은 완료했다. 나머지 native 입력 gate는 `[blocked]`로 남는다. WP-A `mediaPrepared:false`, push·merge·배포·PR 변경 금지 유지.

## 11. 되돌리기 / 중단 조건

- 후보는 격리 브랜치에만 보존한다. 원격 변경은 하지 않는다.
- 구현 단계에서 실패하면 기준선 `53b5458`로 파일 단위 복원하고, 같은 실패를 반복
  재시도하지 않는다. 실패는 즉시 원인과 함께 보고한다.
- 3회 연속 실패, 또는 계약(44px/포커스/URL/비교/iframe) 손실이 확인되면 중단하고
  확인된 상태와 원인을 기록한다.


## 12. 2026-11-11 통합·Pro 인계

현재 제품 소스는 c6b34b984b2919b7dc691f023ea4ee800c468d49이며 §10의 이전 반응형 44/44는 그 당시 후보 증거다. compare reader 고정/원래 차트 문서 폭, 1100px 이하 44px 터치, dashboard 네 면·원래 nav/footer 이동과 차트 복귀 복원, replay 정보 시트 inert 보존, TQQQ 대화상자 재개방 스크롤 초기화를 통합했다.

headless native client를 emulation 전에 검증하는 helper와 consolidated disclosure 관측 수정도 통합했다. 별도 진단 트리의 BTC 3/3·consolidated 3/3을 최종 후보의 전체 53-case 또는 WP6 통과로 소급하지 않는다. native-select Blink 내부 팝업 입력은 외부 macOS AppKit 메뉴 검증이 아니다. 최종 통합 후보에서 typecheck/static/Pages build/verify 및 관련 focused 30/30을 확인했으며, 전체 브라우저와 전체 회귀는 Pro 인계 후 남은 작업이다. 정확한 수용·출시 보류는 [현재 체크리스트](LAUNCH_CHECKLIST_20261110.md)를 따른다.

## 13. 2026-11-11 후속 수정과 재검증

대시보드(evidence/data/ipo/relay/market) 구성에서 내비게이션이 오른쪽 44px 레일로 빠지고 좌측 216px 사이드바가 브랜드만 남은 빈 칸이 되던 문제를 고쳤다. `dist/content-shell.js`는 이제 사이드바가 렌더되는 폭에서는 원래 `.atlas-nav` 노드를 사이드바에 두고, 640px 이하에서 사이드바가 렌더되지 않을 때만 같은 노드를 오른쪽 레일로 옮긴다. 리사이즈 시 재배치하며, 노드는 복제하지 않는다. 방법론 시트 잠금은 가격 데이터가 이 문서에 살아 있을 때 해제된다. `?page=relay`로 바로 들어와 다른 대시보드 메뉴를 눌러도 이동하지 않던 경로도 클릭 핸들러에서 고쳤다(직접 진입 분기에 relay가 없었다).

검증 계약도 구성에 맞춰 조정했다. 내비 소유자는 사이드바(렌더 시) 또는 폰 레일이고, 데이터 표의 아래 정렬은 viewport가 아니라 콘텐츠 바 상단을 기준으로 계산한다. 검사 항목을 삭제하거나 허용치를 늘리지 않았다.

실행 결과: 53-case 네이티브 브라우저 스위트 53/53 passed(failures 0), compare 셸 실브라우저 PASSED, typecheck·verify:static·build:pages·verify:pages 통과. 전체 `npm test`는 최종 소스에서 재실행했다. 이 결과는 macOS 외부 AppKit 메뉴·Safari·실기기 검증이 아니며, 44-case·WP6 여정과 원격 CI·배포는 별도다.

## 14. 최종 판정 — 2026-11-11 (R8)

이 절이 이 문서의 현재 판정이다. §2의 TradingView 관측, §3의 기준선, §10의 `2d9d99f` 시점 수치, §12·§13의 통합·후속 기록은 각 시점의 영수증이며, 이 절의 판정을 소급해 바꾸지 않는다. 브랜치 `fix/tradingview-responsive-20261110`, 판정 시점 HEAD `11540d62659b207f32111759faa5673738ce6765`.

### 14.1 계약별 최종 상태

| 계약 | 최종 판정 | 근거(로컬 실행) |
|---|---|---|
| §4.1 폰 ≤620px (48px 도크·44px 조작·레일) | 완료 | 53-case 53/53의 320x740·390x844 케이스, WP6 320·390 케이스, chart-qa 12/12의 320·390 네이티브 30m 선택 |
| §4.2 태블릿 621–959px (overlay reader) | 완료 | compare 9 viewport(PASSED, overflow 0), 959 이하 overlay 모드의 `#main` inert 유지 단언 |
| §4.3 960px 이상 (split reader, 가운데 열 예약) | 완료 (R1, `4d22531`) | 960/1024/1200/1440/1920에서 차트 열 축소 320 = reader 폭, reader·차트 겹침 0, 문서 폭 불변, 닫으면 path bytes 복원 |
| §4.4 확정 배치 (원래 노드 이동·복원) | 완료 | 53-case·WP6의 nav/footer 노드 identity·`aria-current`·왕복 케이스 |
| §4.5 측정 폭 허용 오차 (D09) | 완료 (R3, `a739b36`) | 출처별 계약 분리: 정수 폭 `document.scrollWidth`·`body.clientWidth/scrollWidth`는 1px 차이도 회귀, 소수 폭 `.workspace`·`#main`만 `WIDTH_ROUNDING_TOLERANCE_PX=1`, 예약은 `READER_RESERVATION_TOLERANCE_PX=2`, 비수치 측정값 불통과. 왕복 6건 전부 `exact` delta 0 |
| §5 수용기준 | 완료(로컬 범위) | 아래 14.2 수치. 원격 CI·배포·실기기는 이 표의 범위가 아니다 |

### 14.2 이 판정에 쓰인 로컬 검증 수치

- 제품 바이트: `dist` 트리 `d61e0dbd32072f7436dc552a0a79f0afed880a50`(R4 커밋 `2be7da6`와 동일, R3·R4·R5·R8 동안 불변). 아래 브라우저 결과는 모두 이 바이트에 묶여 있다.
- 53-case 네이티브 브라우저 스위트 **53/53 passed, failures 0**; compare 셸 실브라우저 **PASSED**(실패 0·findings 0, 320x740~1920x1080 9 viewport 전부 `overflow 0`).
- WP6 여정 **30/30 PASS**(5종목 × 6 viewport, 실패 0, 스크린샷 48장), chart-qa **12/12 PASS**(annotation 0쌍, 축 0쌍, compare 헤딩 small controls 0).
- 전체 `npm test` `ATLAS_TEST_TOTAL {"complete":true,"tests":3373,"pass":3368,"fail":0,"skipped":5}`(Docker Desktop 기동 후 frozen 배치 포함, 종료 후 원상 복구).
- `npm run typecheck` 정상, `npm run verify:static` 967 files·214 scripts·992 references, `npm run build:pages`/`verify:pages` 12 files·9 routes.
- 이 수치는 전부 **로컬 실행**이다. 이 저장소에는 실행되는 GitHub Actions가 없고(`ops/github-actions-archive/`, `ops/ci-migration.json`), Workers Builds는 main만 watch하므로 이 브랜치의 원격 CI 증거는 0건이다. 원격 CI 0건을 '통과'로 읽지 않는다.

### 14.3 남은 차단·미검증 (이 문서 범위 밖)

- macOS 외부 AppKit 메뉴, Safari, 실제 iOS/Android 기기: 미검증. Blink 내부 네이티브 select 팝업 입력을 외부 AppKit 메뉴 검증과 동일시하지 않는다.
- 기준선에서도 동일하게 실패했던 320px 범례 native touch scroll과 1440px native 모델 선택 gate는 2026-11-11 후속 회차에서 실제 입력으로 통과했다(§14.4). 이력은 위 절에 그대로 보존한다.
- WP-A `mediaPrepared:false`, 직접 청취·동기화 10지점, PDF 547페이지, Linux `renameat2` 원자 게시: 별도 보류.
- 원격 CI·배포·main 병합: 이 브랜치에서 수행하지 않았고 승인도 없다.

관찰 한계(당시): COMPARE 320/390 헤딩에서 `structure-threshold` 입력과 `structure-json`(46×44)이 스크롤 소유자 안에서 잘린 채 보고됐다. 이후 실측 결과 잘림이 아니라 가로 스크롤이었고(`.lab-toolbar` `scrollWidth 544 > clientWidth 268`, 320에서 `scrollLeft 0→276`, 390에서 `0→346`), `verify-compare-shell-browser.mjs`가 실제 휠 입력으로 도달성을 단언하는 계약으로 바뀌었다.

### 14.4 native 잔여 2건 재판정 — 2026-11-11

위 14.3의 두 gate를 실제 입력으로 다시 판정했다. 제품 바이트는 그대로(`dist` tree `d61e0dbd…`)이고, 바뀐 것은 하네스의 입력 경로 하나다.

**320px 범례 — 통과(실제 touch).** `scripts/verify-chart-replay-browser.mjs`는 touch 케이스에서 범례 스크롤포트를 `Input.dispatchTouchEvent` 스와이프로 끝까지 민다(휠은 비터치 케이스 전용). 실측: BTC 320×568 `scrollHeight 1188 / clientHeight 507`, 스와이프 2회 `0→350→681`(최대 681), 참조 의미 3개 전부 `painted:true`·`reachable:true`; BTC 900×430은 3회 `0→250→554→652`(최대 652). chart-replay 레인 7/7 통과, 실패 0.

**1440px ETH 모델 선택 — 통과(내부 팝업 모드, 레이아웃 불변).** `selectNativeOptionByKeyboard`가 `adaptive→valuation`(ArrowDown 2회), `valuation→pooled`(ArrowUp 1회), `pooled→adaptive`(ArrowUp 1회)를 실제 키 이벤트로 수행했다. 영수증: `internalPopupMode:true`, `popupMenu {before:'external-appkit', during:'internal', after:'external-appkit'}`, `layoutLocked:true`, `restored:true`, 각 전환의 `observed.value` 일치·포커스 유지, `#eth-chart.dataset.forecastModel`와 `?eth-model=` 쿼리가 함께 갱신됐다(값 대입·합성 이벤트 없음). native 레인 15/15 통과, 실패 0.

한계는 그대로다. 이 키 입력은 **Blink 내부 팝업**에서 실행됐고 macOS 외부 AppKit 메뉴가 아니다(14.3 첫 불릿 유지). 헤드리스 Chrome은 외부 메뉴를 만들 수 없으므로, 데스크톱 실사용 메뉴 검증은 여전히 사람·실기기 몫이다.
