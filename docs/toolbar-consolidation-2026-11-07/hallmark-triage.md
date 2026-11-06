# Hallmark 범위와 기존 38 WARN 검토

검토일: **2026-11-07 KST**. 아래 원본 실행 시각은 **2026-11-06 UTC**다.

이 문서는 단일 외곽 상단 toolbar와 스크롤바 숨김 작업을 위한 **기존 증거 분류 및 검사 범위 보완**이다. 새 UI의 Hallmark 실행 결과, 대비 해결, 경고 해결 또는 배포 통과를 선언하지 않는다.

## 원본 실행

- [공식 실행 42238301915 / job 127961628913](https://github.com/twoimo/bitcoin-cycle-atlas/actions/runs/42238301915/job/127961628913)
- 소스: `04d98bfa6afaaeb7972a51266469e1273fa0dc13`
- Hallmark v2.0.0: `7ec868225c6caa040558c321ee0fefa0e73f83a8`
- 현재 소스의 원본 결과: **0 FAIL / 0 REFLEX / 38 WARN**, static 28 + render 10.
- `waived`, `dismissed`, `answered` 모두 0. Integrity 오류 0. 원래 8개 URL과 baseline/current 각 40개 screenshot이 기록되었다.
- 원본 finding 38개, 시각을 포함한 로그 행, phase receipt와 최종 receipt는 [hallmark-04d-findings.json](hallmark-04d-findings.json)에 보존했다. 등급·문구·개수를 바꾸지 않았다.

## 38개 경고의 분류

| 원본 gate | 수 | 내용 | 이번 검토의 처리 기준 |
| --- | ---: | --- | --- |
| 40 | 5 | 작은 오류/수식 글자 대비 의심. 원본과 React CSS bundle 중복 포함 | 활성 dark 화면의 실제 computed color/background로 확인한다. 정적 토큰 혼합 가능성만으로 해결·오탐을 선언하지 않는다. |
| F7 | 23 | 같은 border/radius/surface 조합이 여러 selector에 반복됨. static 22 + render 1 | 공유 버튼·표·dialog의 의도된 공통 패턴과 불필요한 중첩 상자를 구분한다. upstream app 지침도 공통 container recipe를 허용한다. 원본 WARN은 유지한다. |
| F24 | 1 | `.workspace-search-popover`의 얇은 border와 큰 shadow 동시 사용 | 검색 UI를 외곽 toolbar로 옮길 때 실제 popup의 표현과 가림을 확인한다. |
| F3 | 1 | 표시 제목에 `text-wrap: balance` 없음 | 한 줄 작업용 제목과 실제 여러 줄 제목을 구분해 판단한다. |
| F19 | 2 | BTC/data에서 400·500·600·700 네 가지 weight 사용 | 공통 type 역할의 구분을 검토한다. 경고를 없애기 위한 무분별한 역할 합치기는 하지 않는다. |
| F25 | 4 | 모바일에서 표 열이 처음부터 보이지 않거나 desktop 텍스트가 숨겨짐 | native 가로 스크롤, sticky 식별 열/헤더, 모바일 research에서 모든 정보에 도달하는 경로를 확인한다. |
| kept | 2 | 이전 제목 1개와 관측 숫자/시각 다수가 화면 inventory에서 달라짐 | 이름 변경·접힌 정보·변하는 관측치를 실제 데이터 손실과 구분한다. 원본 수치나 기준일을 바꾸어 맞추지 않는다. |
| 합계 | **38** | 원본 경고 수 | 중복을 설명하되 원본 수를 줄이지 않는다. |

### 대비 경고의 정확한 대응

| 원본 위치 | Selector | 원본 경고 | 선언된 역할 |
| --- | --- | --- | --- |
| `dist/lab.css:6` | `.lab-error` | 3.02:1 < 4.5:1 | `--red` / `--surface` |
| `dist/styles.css:8` | `dialog code` | 3.43:1 < 4.5:1 | `--accent` / `--bg` |
| `dist/styles.css:8` | `dialog .method-formula` | 3.43:1 < 4.5:1 | `--accent` / `--bg` |
| `dist/market-lab/app/assets/index-Cz8BfvAY.css:3` | `dialog code` | 3.43:1 < 4.5:1 | 위 원본 CSS 규칙이 포함된 bundle |
| 같은 bundle | `dialog .method-formula` | 3.43:1 < 4.5:1 | 위 원본 CSS 규칙이 포함된 bundle |

`dist/styles.css:6`의 dark ink는 `--red: #ec8190`, `--accent: #f2a84b`다. 같은 파일의 `[data-theme="light"]`는 각각 `#ad3e52`, `#925b15`다. `dist/atlas-shell.css:5`는 dark shell의 `--surface: #131922`, `--bg: #0b0e14`를 선언한다. 원본 3.02/3.43 비율은 light ink와 dark shell surface를 조합한 값과 대응한다. upstream 정적 대비 검사는 CSS token/selector를 합쳐 계산하므로 이 scope 조합을 실제 dark 화면의 결과로 단정하면 안 된다. 이번 기록은 색을 바꾸지 않았으며, actual computed style과 렌더 결과로 후속 판정을 남겨야 한다.

### F25의 실제 대상

| 초기 URL 화면, 375px | 원본 evidence |
| --- | --- |
| Legacy compare | 12 columns off-screen, 시작 열 `관측 상태` |
| Data | 4 columns off-screen, 시작 열 `연초 종가종목별 기준일` |
| BTC | 7 columns off-screen, 시작 열 `선택 경로` |
| Research | 1440px의 95 words가 phone에서 숨겨짐. 첫 문자열 `MSTR 실제 가격 · 일별 OHLCMSTR` |

가로로 긴 재무 표는 첫 화면에 모든 열을 억지로 압축하는 방식으로 해결하지 않는다. 스크롤바를 숨겨도 휠·터치·키보드로 끝 열/행에 도달하고 식별 열·헤더가 남아야 한다. Research의 생략 정보도 모바일의 상세/메뉴 등 실제 접근 경로로 확인한다.

## 기존 적용이 보장한 범위와 빠진 범위

Pinned upstream `sloplint.mjs`, `sloplint-render.mjs`, `LICENSE` 세 파일의 Git blob은 provenance와 일치한다. wrapper는 raw findings를 유지하고 현재 FAIL/REFLEX를 실패 처리한다. 렌더 누락·내부 예외·불완전한 kept 비교·소스 변조도 성공으로 처리하지 않는다.

원래 render 대상은 BTC, ETH, BMNR, MSTR, 직접 data/evidence, legacy compare, mobile-preview의 **8개 초기 화면**이다. static은 명시적인 `dist` 전체를 읽지만 JavaScript import graph를 따라가거나 모든 동적 상태를 열지는 않는다. 원래 8개 URL에는 통합 US/KR/scenario/cashflow/RSI/housing/themes/IPO와 embedded data/research가 없었다. 따라서 기존 통과만으로 새 단일 상단 toolbar 요구를 충족했다고 할 수 없다.

Pinned [app scope 지침](https://github.com/Nutlope/hallmark/blob/7ec868225c6caa040558c321ee0fefa0e73f83a8/skills/hallmark/references/flow.md)은 앱의 기존 shell, 높은 정보 밀도, 공통 controls, URL 상태, loading/empty/error/full 상태를 요구한다. [판정 지침](https://github.com/Nutlope/hallmark/blob/7ec868225c6caa040558c321ee0fefa0e73f83a8/skills/hallmark/references/gates.md)은 WARN의 확인·분류와 최종 시각 검토를 요구한다. 자동 checker 한 번의 성공은 이 판단을 대신하지 않는다.

기존 `app.tsx`의 WorkspaceToolbar, housing의 제어/기간/요약/탭, theme의 제어/요약/탭, data의 필터/요약, IPO의 제어/월 이동은 outer `.atlas-canvas-heading` 아래에 추가 행을 만들었다. 새 사용자 지시는 이를 외곽 한 행으로 통합하는 것이다. 이전 design 문서의 internal tabs/IPO 별도 행 기록보다 이번 사용자 지시가 우선한다.

## 추가된 자동 검사 계약

기존 `audit` job, 0c1ed40 baseline, 8개 URL과 네 phase는 유지한다. 별도 `workspace audit` job은 변경 전 main **3b6373906dbdd3ef321db31deaf8a8f785da61c3**를 immutable baseline으로 삼고, US/KR/scenario/cashflow/RSI/housing/themes/IPO/embedded data/research **10개 실제 부모 URL**에 같은 upstream static/render/kept 검사를 적용한다. 두 job은 병렬이며 각각 기존 16분 job / 10분 wrapper / 270초 render 한도를 유지한다. raw finding, 소스 해시와 baseline/current 각 50개 workspace screenshot이 필요하다.

새 readiness는 실제 parent와 하나의 active same-origin iframe, 경로·지역·종목, 관측 chart 또는 해당 본문을 확인한다. 현재 화면은 해당 frame이 지정한 `atlas-center-toolbar-lab/data/ipo/evidence`가 외곽 heading에 실제로 붙어 있고 제어 요소를 렌더했는지도 요구한다. 3b637의 변경 전 baseline 계약은 별도로 기록하며, current에서 구형 child toolbar를 대신 인정하는 fallback은 없다. 날짜·요약의 parent portal 이동은 child의 실제 chart/표 판독으로 구분한다. 같은 predicate가 preflight와 **Hallmark가 촬영하는 페이지**에서 실행된다. 현금흐름의 최초 입력 대기는 실제 empty 상태 그대로 기록한다. 가짜 가격, 예시 자동 입력, 강제 successful state를 넣지 않는다. upstream 원문·probe·gate·등급을 바꾸지 않고 추가 readiness branch의 해시를 별도로 남긴다.

Upstream DOM probe가 iframe 안의 모든 요소까지 검사하는 것은 아니다. Screenshot에 실제 iframe이 포함되고 해당 본문의 로딩 완료를 확인하는 것과, child 내부의 모든 contrast/interaction을 자동 검사하는 것은 구분한다. 새 단일 toolbar의 실제 기하, native 스크롤/키보드, popup clipping, focus 복원, 반응형/짧은 viewport, 탭·입력 상태 보존은 별도의 native 검사로 확인해야 한다. **이번 범위 확장과 단위 검사 통과는 최종 UI render pass가 아니다.**
