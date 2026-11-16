# R19 P5 F1 — shared menu SVG

2026-11-13. Baseline: `b2226d77ddf4ff4fe6e05953e02cbb753ea4f7f8` on `fix/tradingview-responsive-20261110`.

**제품 구현 완료, native 수용 대기.** 이번 변경은 컨퍼런스·차트·릴레이가 공유하는 메뉴 버튼의 U+2630 글리프를 Phosphor List SVG로 바꾸는 F1이다.

## 변경

- `dist/atlas-shell.js`: 공식 List regular SVG를 인라인으로 사용한다. `currentColor`, 20×20, `aria-hidden="true"`, `focusable="false"`이며, 버튼의 기존 `aria-label`·`aria-expanded`·클릭 처리·설정 저장은 유지한다.
- `dist/atlas-shell.css`: 이 버튼의 기본 width/height와 min-width/min-height를 44px로 둔다. 기존 버튼 숨김 정책과 공유 2px focus-visible 규칙, 색·액센트 토큰은 변경하지 않는다.
- 기존 생성기로 프리로드 그래프·HTML·Pages 산출물을 갱신했다. React 진입점도 이 CSS를 가져오므로 생성 CSS에는 같은 44px 변경이 반영되고, 생성 JS의 차이는 CSS 파일명 참조뿐이다.

아이콘 원본: [Phosphor List regular](https://github.com/phosphor-icons/core/blob/2b75f3ad12b420c9504ef05df8d2564a28f8500e/assets/regular/list.svg), blob `88254fb074f7bb4647338813fadc7610680f286c`. [MIT 라이선스](https://github.com/phosphor-icons/core/blob/2b75f3ad12b420c9504ef05df8d2564a28f8500e/LICENSE)의 Copyright (c) 2023 Phosphor Icons를 기존 JS의 MIT 고지에 추가했다. 새 런타임 의존성·아이콘 파일은 없다.

## 확인된 수치

| 항목 | 이전 | 이후 | 증거의 범위 |
|---|---:|---:|---|
| 컨퍼런스 UI 글리프 | 1 | 0 | 공유 셸 DOM 모델 |
| 차트 UI 글리프 | 1 | 0 | 공유 셸 DOM 모델 |
| 릴레이 UI 글리프 | 1 | 0 | 공유 셸 DOM 모델 |
| 세 경로 합계 | 3 | 0 | 각 경로 1회, 뷰포트별 실측 아님 |
| SVG + 접근성 이름 | 0/3 | 3/3 | 실제 `initAtlasShell()` 실행 |
| 메뉴 접기/펼치기 왕복 | 3/3 | 3/3 | DOM 이벤트 모델 |
| h1 | 각 1 | 각 1 | DOM 소유자 검사 |

`dom-model.json`은 실제 root HTML과 전후 `initAtlasShell()` 소스를 LinkeDOM에서 실행한 결과다. file: 위치를 사용하며 페이지 본문 모듈은 부팅하지 않는다. D-1의 정확한 범위 `[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]`를 body 텍스트 노드에 적용하고 숨겨진 UI도 포함한다. 제외 선택자는 보고서에 기록되어 있다. **전체 제품의 native D-1, 접근성 트리, 타깃 기하, 포커스 페인트, 스크린샷을 대신하지 않는다.**

기존 집중 검사 **40/40**, 실패 0: 셸 동작 4/4, h1·터치·셸 계약 10/10, 제공 CSS·프리로드·생성물 26/26. `build-pages.mjs --check`, `build-site-styles.mjs --check`, `build-site-preloads.mjs --check` 통과. 상세 명령과 보호 파일 해시는 `summary.json`에 있다. Pages 검사의 최초 stale CSS 자산 참조는 해당 생성물 갱신 후 해소했다.

## Native 캡처 상태

`native-blocked.json`: **완료 0/6, 스크린샷 0, D-1 이전/이후 null, complete false, status blocked, exit 1**. Chromium은 페이지를 열기 전 `ProcessSingleton socket() failed: Operation not permitted (1)`로 종료됐다. 연결 Browser는 originating browser context 부재로 사용할 수 없었고, cloud browser에서는 이 작업 환경의 localhost가 `ERR_CONNECTION_REFUSED`였다. 없는 PNG 경로를 결과로 제시하지 않는다.

현재 셸에서 이 공용 토글은 기존 규칙에 따라 숨겨져 있다. 제품과 캡처 도구 모두 이를 억지로 표시하지 않는다. 44px 선언과 2px 포커스 규칙 보존은 확인했지만 숨긴 버튼의 실제 hit box와 focus paint를 통과로 세지 않는다.

새 `scripts/verify-r19-p5-f1-browser.mjs`는 이 F1의 body 텍스트·메뉴 구조·6개 캡처만 수집한다. 기존 검사기를 수정하지 않는다. 기준 커밋 전체 dist를 Git에서 읽어 별도 로컬 origin으로 제공하고, 현재 파일은 변경하지 않는다. 준비된 실제 페이지와 폰트를 기다린 뒤 캡처하며, 오류·미측정·미생성은 통과 처리하지 않는다.

Mac에서 실행할 명령:

```bash
ATLAS_BROWSER_PATH="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
node scripts/verify-r19-p5-f1-browser.mjs \
  --baseline-ref b2226d77ddf4ff4fe6e05953e02cbb753ea4f7f8 \
  --out build/r19-p5-f1-browser
```

실행이 성공할 때 생길 파일은 `before/`와 `after/` 각각의 `conference-320.png`, `conference-1440.png`, `outlook-320.png`, `outlook-1440.png`, `relay-320.png`, `relay-1440.png` 및 `report.json`이다. **현재 이 PNG들은 생성되지 않았다.** native 전후 합계는 각 6개 화면을 합산하므로 위의 3경로 DOM 모델 합계와 분모가 다르다.

## 범위 보존

보호 4파일·가격 축·`dist/styles.css`·기존 검사기·컨퍼런스 제품 파일은 기준 커밋과 같다. F2·F3·F4·Q-P1c-B-2·Q-R16-1 변경은 없다. P4 파일 수 및 실미디어 브라우저는 다시 실행하지 않았다. 기존 npm 17실패는 이번에 수정하거나 재실행하지 않았다. F1 native 수용과 P5는 열어 둔다.

## Mac follow-up (2026-11-13 12:29 KST)

The Mac command above was run against `7d45f88`. It completed 6/6 after cases and wrote 12 PNGs. It did not pass. Conference and relay D-1 went from 1 to 0. Outlook went from 6 to 5 because five `U+2699` settings buttons remain. Receipt: [mac-7d45f88.md](mac-7d45f88.md). F1 acceptance stays open.
