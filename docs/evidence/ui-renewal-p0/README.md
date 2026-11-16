# R19 P0 — R19P0-c8b06c5

2026-11-12. 브랜치 `fix/tradingview-responsive-20261110`, 기준 `c8b06c55838645645237b5e766cdcd01c6ca8f94`의 작업 트리를 검증했다.

**상태: 구현 후보, P0 수용 미완료.** 공용 토큰·타이포·테마와 Pretendard self-host를 반영하고 정적/단위 검증을 수행했다. Chromium이 소켓 권한 오류로 시작하지 못해 320/1440 스크린샷·실제 글꼴 로딩/fallback·계산 스타일 대비를 확인하지 못했다. 또한 React/Pages 생성물이 재빌드되지 않았고, 전체 저장소의 하드코딩 UI 색 0도 성립하지 않는다. 이 세 가지를 통과나 단순 문서 보완으로 간주하지 않는다.

기계 판독 요약은 [summary.json](summary.json), 전체 변경 경로는 [changed-files.json](changed-files.json), 최종 원시 영수증은 [linux-release-20261112/report.json](linux-release-20261112/report.json)이다. 앞선 탐색용 Linux 실패 영수증은 로컬 `build/r19p0/`에 보존했고, 커밋에는 최종 제품 상태의 원시 영수증을 포함했다. 기존 Mac 영수증·R17 완료 판정을 수정하지 않았다.

## 구현 범위

`dist/styles.css`의 단일 기본 `:root`를 색과 타이포 역할의 소유자로 삼았다. `light-dark()` 값은 루트 `color-scheme`으로 선택하고, `:root[data-theme="dark"]`는 색을 재정의하지 않고 scheme만 바꾼다. 두 반응형 규칙은 본문 크기 별칭만 선택한다. 기존 CSS 소비자는 이 역할을 참조한다. 액센트는 바이올렛 `#6c4dff`; 기존 예측/데이터 금색 `#d8b56d`는 `--data-gold`로 분리해 의미를 유지했다.

`dist/ui/theme.js`는 기본 라이트, 명시적 다크 설정, `atlas-ui-theme` 저장/복원, storage 차단 fallback, 동일 출처 iframe/탭 동기화를 처리한다. 기존 BTC/ETH 설정 패널에 44px 네이티브 버튼을 연결하고 `aria-pressed`·접근성 이름·포커스를 유지한다. 초기 head 복원으로 첫 페인트의 테마를 선택한다. 내비·카드 레이아웃을 새로 만들지 않았다.

공용 SVG renderer의 중립 UI paint는 토큰으로 옮겼다. 가격·좌표 계산과 캔들/예측의 데이터 색은 유지했다. 독립 SVG 내보내기는 복제 전 현재 계산된 paint를 고정해 문서 밖에서도 CSS 변수 때문에 색이 사라지지 않도록 했다. 원본 데이터·SVG·좌표를 바꾸지 않고, 기존 최신 가격 태그 가시성 회복을 보존한다. 최종 감사에서 흰 배경 위에 밝은 실제 가격선이 남는 위험을 찾아, BTC 관측선·점과 ETH/공용 market close line도 테마별 중립 관측선 역할에 연결했다. 다크의 원래 선 색은 유지하고 라이트는 `#191f28`로 읽힌다. 실제 SVG/PNG 렌더는 브라우저 차단으로 검증하지 못했다.

P1 셸·내비, P2 차트 카드·크롬 재배치, P2a-0 패키지, P3/P4 카드화, P5의 Q-P1c-B-2/Q-R16-1, 리브랜딩·RAG·인증은 착수하지 않았다. 신규 장식 그라디언트/글로우나 브랜드 자산은 추가하지 않았다. 기존 geometry는 보존하고 새 테마 버튼만 44px 타깃을 둔다.

## 토큰 표

값의 기준은 [Funnest의 고정 커밋](https://github.com/funnest-xyz/funnest-charts/blob/39cb29ae250448d520384c12de555b1c00727883/apps/site/app/globals.css)이다. 대비가 부족한 보조 글자와 링크 ink는 동일 계열의 더 진하거나 밝은 값으로 조정했다. fill 액센트 `#6c4dff`는 그대로다. 출처·수정 내용은 루트 [NOTICE](../../../NOTICE), 원 라이선스는 [Apache-2.0 사본](../../licenses/FUNNEST_CHARTS_APACHE_2_0.txt)에 있다.

| 역할 | 라이트 | 다크 |
|---|---|---|
| `--accent` / hover | `#6c4dff` / `#5a3bf0` | 같음 |
| `--on-accent` | `#ffffff` | 같음 |
| `--bg` | `#ffffff` | `#101013` |
| `--sidebar` | `#f2f4f6` | `#101013` |
| `--surface` | `#ffffff` | `#17171c` |
| `--surface-raised` | `#f2f4f6` | `#1b1b21` |
| `--surface-hover` | `#e5e8eb` | `#272730` |
| `--text` | `#191f28` | `#f2f2f4` |
| `--muted` | `#4e5968` | `#b0b0ba` |
| `--subtle` | `#596574` | `#9a9aa5` |
| `--accent-ink` | `#5a3bf0` | `#b4a4ff` |
| `--accent-soft` | `#f0ecff` | `#28203e` |
| `--border` | `#e5e8eb` | `#2a2a33` |
| `--border-soft` | `#edf0f3` | `#23232b` |
| `--border-strong` | `#788392` | `#7e7e87` |
| `--positive-ink` | `#097354` | `#66c3ab` |
| `--negative-ink` | `#b3324b` | `#ec8190` |
| `--data-gold` / on-data-gold | `#d8b56d` / `#191f28` | 같음 |
| `--data-gold-ink` | `#836110` | `#d8b56d` |
| `--icon` / `--icon-muted` | text / muted | text / muted |
| `--focus` | accent-ink | accent-ink |
| `--chart-axis-ink` | muted | muted |
| `--observed-close-ink` | `#191f28` | `#e2eaf3` |
| `--market-close-ink` | `#191f28` | `#dce7f2` |
| `--chart-tag-bg` / ink | surface-hover / text | surface-hover / text |
| `--card-radius-sm/md/lg` | **12 / 16 / 20px** | 같음 |
| 본문 ≤620px / 621–1100px / >1100px | **15 / 16 / 17px** | 같음 |
| 본문 줄높이 / 자간 | **1.6 / -0.02em** | 같음 |
| 메타 토큰 | 13px | 같음 |

943개 기본 토큰에는 위 의미 역할과 기존 소비자를 연결하는 별칭이 포함된다. 전체 값·해석 경로는 최종 영수증 `sourceAudit.tokens`에 있다. 카드 토큰만 12/16/20을 정의했으며 기존 컨트롤 4px·패널 8px 및 기존 카드 구조를 이번에 변경하지 않았다. 실제 카드 재구성은 P1 이후다. 기존 수치축·표와 밀도 높은 툴바의 작은 글자를 모두 본문으로 재분류해 크기를 키우지 않았다. 본문과 설명 문단은 공유 스케일을 따른다.

기존 고정 테이블 헤더의 불투명한 어두운 표면 계약은 `--ledger-sticky-bg/ink/muted` 역할로 보존했다. 이미지 위 설명은 고정 `--media-scrim` / `--on-media`를 사용한다. 이들은 라이트에서 대비를 잃지 않도록 별도 역할이며 다른 파일에 색 값을 재정의하지 않는다.

## Pretendard와 fallback

[orioncactus/pretendard v1.3.9](https://github.com/orioncactus/pretendard/tree/5c41199ea0024a9e0b2cb31735265056e5472d76)의 공식 variable dynamic subset 92개를 그대로 self-host한다. 바이너리는 총 **2,957,724B**, 폰트 폴더 전체 95파일 **3,078,056B**다. 모든 WOFF2의 원본 Git blob·SHA-256·`wOF2` 헤더·바이트 길이가 일치한다. CSS는 92 URL만 로컬 경로로 바꾸고 weight 45–920·unicode-range·`font-display:swap`을 유지했다. [PROVENANCE.json](../../../dist/fonts/pretendard/PROVENANCE.json)에 파일별 근거가 있다. [OFL.txt](../../../dist/fonts/pretendard/OFL.txt)를 동봉했다.

루트 HTML은 동일 출처의 폰트 CSS를 비차단으로 읽고, 필요한 unicode subset만 요청하게 한다. 전량 preload나 외부/유료 폰트 CDN은 추가하지 않았다. fallback 순서는 `Pretendard Variable`, `-apple-system`, `BlinkMacSystemFont`, `Apple SD Gothic Neo`, `Malgun Gothic`, `Noto Sans KR`, `system-ui`, `sans-serif`다. 선언상 현대 한글 11,172/11,172·ASCII 95/95를 포함한다. U+2212는 이 upstream subset에 없어 시스템 fallback을 유지한다. 이는 정적 범위 검사이며 실제 glyph 렌더 측정은 아니다.

새 게이트는 동일 출처 WOFF2 응답 + FontFaceSet + CDP 실제 custom glyph 소유자를 함께 확인한다. 별도 320px 케이스에서는 로컬 폰트 요청 실패를 유도하고 한국어 가시성·시스템 glyph fallback을 확인한다. 이 환경에서는 두 경로 모두 **실행 0**이다.

## 대비 표본 — 정적 계산

20개 고정 토큰 조합 × 라이트/다크 = **40/40**. 텍스트 기준 4.5, 아이콘 기준 3.0이며 최소 텍스트 **5.0686:1**, 최소 아이콘 **6.3280:1**이다. sRGB 상대 휘도 계산 결과이며, 제품의 계산 스타일·픽셀 실측으로 세지 않는다.

| 전경 / 배경 | 종류 | 라이트 | 다크 | 기준 |
|---|---|---:|---:|---:|
| --text / --bg | text | 16.5619 | 16.9894 | 4.5 |
| --text / --surface | text | 16.5619 | 15.9749 | 4.5 |
| --text / --surface-raised | text | 15.0213 | 15.3285 | 4.5 |
| --muted / --bg | text | 7.1119 | 8.8329 | 4.5 |
| --muted / --surface | text | 7.1119 | 8.3054 | 4.5 |
| --muted / --surface-raised | text | 6.4503 | 7.9694 | 4.5 |
| --subtle / --bg | text | 5.9348 | 6.8197 | 4.5 |
| --subtle / --surface | text | 5.9348 | 6.4125 | 4.5 |
| --subtle / --surface-raised | text | 5.3827 | 6.1531 | 4.5 |
| --accent-ink / --bg | text | 6.3280 | 8.7692 | 4.5 |
| --accent-ink / --surface | text | 6.3280 | 8.2456 | 4.5 |
| --on-accent / --accent | text | 5.0686 | 5.0686 | 4.5 |
| --on-accent / --accent-hover | text | 6.3280 | 6.3280 | 4.5 |
| --positive-ink / --bg | text | 5.8464 | 9.0082 | 4.5 |
| --negative-ink / --bg | text | 6.0439 | 7.3352 | 4.5 |
| --data-gold-ink / --bg | text | 5.7028 | 9.7238 | 4.5 |
| --icon / --bg | icon | 16.5619 | 16.9894 | 3 |
| --icon-muted / --bg | icon | 7.1119 | 8.8329 | 3 |
| --focus / --bg | icon | 6.3280 | 8.7692 | 3 |
| --accent-ink / --bg | icon | 6.3280 | 8.7692 | 3 |

별도 브라우저 게이트는 실제 보이는 텍스트/아이콘 **20개 고정 ID를 테마별로** 수집하고 native computed paint·배경 합성으로 계산한다. 숨겨진 표본을 임의의 다른 표본으로 교체하지 않고, 미관측/합성 불가를 미검증으로 기록한다. 지금은 **0/40 실제 표본**이다.

## 하드코딩 색 0의 범위와 미충족

47개 authored CSS와 두 진입 HTML의 inline style 3블록을 스캔했다. 색 정의는 기본 root 한 곳, root 밖 색 리터럴 **0**, 전역 paint 별칭 override/cycle/누락 **0**이다. 번들은 원본 41개로 재생성하고 `--check`로 일치시켰다. unchanged third-party Skullet과 생성된 React CSS는 authored CSS 통과 범위에 넣지 않았다.

**전체 저장소 하드코딩 UI 색 0은 미충족이다.** [잔여 목록](residual-js-colors.json)은 27개 JS 파일을 열거한다. 데이터·로고·vendor뿐 아니라 `atlas-analysis.js`, `lab-view.js`, `outlook-view.js` 등 레거시 UI 표시 경로와 미갱신 React 번들에도 색 리터럴이 남는다. 이 파일 수는 UI 결함 수가 아니다. 보호된 `dist/equity-view.js`의 비교표 caption `#d0deee`, border `#34465e`·`#28384c`는 CSS에서 표시 역할을 덮더라도 원본에서 제거되지 않았다. 보호 파일 금지를 우회하지 않았으며, 이 잔여를 숨기거나 U-1 통과로 인정하지 않는다.

## 실제 실행한 검증

- 제품/계약 **361/361**, 생성물 **18/18**: 합계 서로 다른 **379/379**, 실패·skip 0. 원시 TAP 두 파일과 정확한 테스트 파일 목록은 요약에 있다. 새 P0 계약 35, 테마 12, export 6도 이 합계에 포함한다.
- `node --check`: 변경/추가 JS·MJS 29파일, 실패 0. authored 변경의 `git diff --cached --check` 통과. 전체 staged 검사에는 원문 OFL.txt 22행의 trailing space 1건(exit 2)이 있다. 라이선스 원문 바이트를 보존했으며 제품 코드의 공백 오류는 아니다.
- `npm run verify:static`: **1,064파일 / 220스크립트 / 1,068참조**, exit 0.
- `node scripts/build-site-styles.mjs` 후 `--check`: **41원본 → 2번들**, root blocking link 4개 유지.
- `node scripts/build-site-preloads.mjs` 후 `--check`: **56 module URL / 54고유 모듈 / 82 import edge**, conference preload 55·공유 1. timeline 1,044,921B와 SHA-256 `fd15b3ef18213b9adc3bff87d523cc1c2ca907ca59163b646d55308c5d1666ad` 불변.
- P0 native 게이트: required 10, attempted **0**, passed 0, 미실행 10, exit 1. R17 native: required 16, attempted **0**, passed 0, 정렬 관측 0쌍, exit 1. Chromium `socket() failed: Operation not permitted (1)` / SIGABRT로 페이지 진입 전 차단.
- A-9 native 시도: Chrome CDP timeout, 실제 **0/6**, timing 없음. 로그에 같은 소켓 실패가 있다. 이 시도는 마지막 paint/export 수정 전의 것이며 최종 수용 증거가 아니다. 2,500ms/150ms 예산은 그대로다.
- `npm run typecheck`: exit **127**, `tsc: not found`. `build:web`, `build:pages`, `verify:pages`: 각각 exit **1**, 사전 검사에서 `node_modules/skullet/package.json` 없음. Vite build에 도달하지 않았다. 로그는 [toolchain](toolchain/results.json)에 있다.
- `linkedom`이 필요한 DOM 파일들은 module-load에서 중단됐다. 함께 실행 가능한 다른 단위 통과와 구분해 [실패 원시 TAP](dom-dependency-attempt.tap)을 보존한다. 전체 `npm test`는 실행 완료하지 않았다.

보호 4파일은 기준 커밋과 바이트가 같고 SHA-256은 요약에 있다. `dist/data`, timeline, R17/A-9/미디어 기존 하네스는 변경 0이다. 64px 가격 거터·라벨 열·가격 변환·h1 1개·16케이스·±2px·가림 0·정확한 seek·Range 206/416·skip exit 2를 변경하지 않았다. 이 문장은 소스/계약 불변 확인이며 이번 글꼴로 native R17이 통과했다는 뜻이 아니다.

## 남은 것과 Mac 재실행

**P0를 닫지 않는다.** 전체 UI 하드코딩 제거 범위를 보호 파일 조건과 함께 해결해야 하고, 이미 설치된 Mac 도구체인에서 React/Pages를 재생성해야 한다. `apps/web` 소스는 바뀌었지만 `dist/market-lab/app`와 Pages route HTML은 기존 산출물이다. 현재 커밋의 루트 정적 화면 테마와 앱 iframe의 이전 테마가 다를 수 있다. 생성된 해시 번들을 손으로 고치지 않았다.

브라우저 수용은 새로운 출력 디렉터리에서 아래처럼 실행한다. 새 도구 설치·배포 명령이 아니다. Mac에 이미 있는 프로젝트 의존성과 Chrome을 사용한다.

```bash
npm run build:pages
npm run typecheck
npm run verify:pages
node scripts/build-site-styles.mjs --check
node scripts/build-site-preloads.mjs --check
npm run verify:static
node scripts/verify-ui-renewal-p0-browser.mjs --out docs/evidence/ui-renewal-p0/mac-NEW
node scripts/verify-price-axis-browser.mjs --out build/qa-r19p0/axis-NEW
node scripts/verify-conference-data-browser.mjs --out build/qa-r19p0/a9-NEW --profile fast4g --encoding gzip
```

P0 게이트는 BTC/ETH × 320/1440 × light/dark 8건과 폰트 차단 320px 2건, 총 10건이다. 320·1440 스크린샷, 테마 토글/리로드, 실제 Pretendard/fallback glyph, 테마별 20표본 대비, h1/overflow/본문 크기를 기록한다. 출력 폴더는 append-only이므로 `NEW`를 매 실행 새 이름으로 바꾼다. 기존 R17은 **16/16**, A-9는 **6/6·2,500ms**를 그대로 요구한다. 새 P0 게이트만 통과해도 잔여 UI 리터럴/React 생성물 또는 다른 전체 회귀 게이트를 통과한 것으로 확대하지 않는다.
