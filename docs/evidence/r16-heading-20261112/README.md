# R16 — 가격 차트 h1과 종목 버튼 분리

## 판정과 범위

**구현 완료, 브라우저 실측 보류.** 코드 커밋은 `386376591428fb0a9badc4dfef750ee70ef802d2`이며, 검증 대상은 이 커밋의 깨끗한 `dist/`이다. 브랜치는 `fix/tradingview-responsive-20261110`이다. 요청에서 제시한 `cf49682` 이후의 문서 커밋도 보존하여 `05a81be34d98b3b8e5b3068074063189f154313e` 위에 수정했다.

검증 후 추가된 문서 커밋 `427d2dbc00aae2a9ab057ffed3aa25875d30433f`도 보존하여 그 위에 이 기록을 남긴다. 해당 커밋의 `dist/`는 검증한 코드 커밋과 동일하다.

요구사항은 [REQ_WP_ABC_20261110 §A-5.2(1)](../../requirements/REQ_WP_ABC_20261110.md) 및 [체크리스트 R16](../../LAUNCH_CHECKLIST_20261110.md)이다. R17 가격 축, R18/R19 리뉴얼 구현은 변경하지 않았다.

## 원인과 수정

기존 `mountPageDescription()`은 h1을 종목 버튼의 `left + 4`, `top + 2`, `width - 8` 좌표에 고정했다. CSS도 종목 버튼의 위쪽 padding을 늘려 제목과 티커를 두 줄로 배치했다. 기존 h1 검증은 티커 글리프와의 겹침만 검사하여, h1이 버튼 표면 자체를 덮는 상태를 놓쳤다.

가격 차트의 h1을 **플롯 위 22px 정상 흐름 라벨**로 옮겼다. DOM에서는 기존과 같이 툴바의 다음 형제이며, flex 순서로 플롯 위에 위치한다. h1 글자 크기 12px·행 높이 14px, 단일 h1 및 설명 연결을 유지한다. 320px에서 기존 종목·간격·기능 버튼에 필요한 폭은 312px이므로, 별도 툴바 슬롯 대신 차트 밖 라벨을 선택했다. 라벨이 기존 플롯 높이 중 22px를 사용한다.

종목 선택 버튼의 노드·접근성 이름·키보드 이벤트 코드는 그대로이고, 버튼의 두 줄용 padding만 제거했다. 모바일 조작 행 48px와 기존 44px 터치 타깃도 유지한다. compare의 고정 배치, 76px 예약 공간, 조상 ResizeObserver와 스크롤/resize 재배치, 0.01px 위치 계약은 유지했다. compare에서 일반 차트로 돌아오면 이전 고정 좌표와 clip 스타일을 제거한다.

브라우저 계약은 원시 사각형으로 h1/글리프와 종목 버튼·label·티커 글리프의 교차 면적을 검사한다. 새 라벨과 툴바·플롯의 교차도 0이어야 한다. 사용자 제공 ETHUSD 1440 사각형의 교차 **1,680px²**를 실패로 고정했고, 양의 소수 픽셀 교차도 0으로 반올림하지 않는다. 이 수치는 과거 보고값을 사용한 회귀 입력이며, 수정 후 브라우저 실측값이 아니다.

## 실제 실행 결과

| 검사 | 결과 |
|---|---|
| 관련 단위·계약 16파일 | **148/148 통과**, 실패 0, skip 0 |
| 위 테스트 중 직접 h1 회귀 / 하네스 판정 계약 | **16/16**, **17/17** 통과 |
| `npm run typecheck` | exit 0, TypeScript 오류 0 |
| `npm run verify:static` | exit 0, **968 files · 219 scripts · 972 references** |
| preload 재생성 후 `--check` | exit 0, **55 module URLs · 53 unique files · 54 conference + 1 shared preload · 81 edges** |
| stylesheet `--check` | exit 0, **41 source stylesheets · 2 bundles** 일치 |
| 변경한 제품/하네스 JS 구문 및 `git diff --check` | 통과 |
| h1 브라우저 하네스 | 실행함, exit 1. 본체 **0/15**, 보충 **0/9**, layout-shift **0/2** 실행 |
| compare 브라우저 하네스 | 실행함, exit 1. 경로 **0/16**, 뷰포트 **0/9**, 상호작용 0건 실행 |
| 기존 반응형 하네스 × BTCUSD/ETHUSD/MSTR/BMNR | 4회 모두 실행함, 각각 exit 1. **0/44** 케이스 실행 |
| 기존 chart-qa, `--phase candidate` | 실행함, exit 1. **0/12** 케이스 실행 |

설치되어 있던 `/usr/lib/chromium/chromium`이 첫 페이지를 열기 전에 `SIGABRT`로 종료됐다. compare/chart-qa의 stderr에는 다음 원인이 기록되어 있다.

```text
FATAL:chrome/browser/process_singleton_posix.cc:297
Check failed: . socket() failed: Operation not permitted (1)
```

h1/반응형 하네스는 그 뒤의 DevTools 포트 대기 timeout을 실패로 기록한다. **브라우저 통과 0건, 스크린샷 0장, 수정 후 사각형 교차 실측 없음**이다. chart-qa의 `failures: []`도 통과를 뜻하지 않는다. 해당 보고서는 `status: FAIL`, `error`에 위 실행 오류, exit 1을 갖는다.

[summary.json](summary.json)에 수치·명령·해시와 생성된 브라우저 JSON 7개 및 실행 묶음 JSON의 원문 객체를 보존했다. 기존 반응형/chart-qa 하네스 4파일과 전체 `dist/`의 시작/종료 해시는 동일했다. 전체 `npm test`, 배포 검증, Safari/실기기 검증은 실행하지 않았다.

## 실행 명령과 재실행

단위·계약 테스트의 실제 명령:

```sh
node --test --test-reporter=tap \
  tests/page-description.test.mjs \
  tests/page-heading-and-touch-floor.test.mjs \
  tests/page-heading-browser-contract.test.mjs \
  tests/mobile-shell-heading.test.mjs \
  tests/compare-shell-host.dom.test.mjs \
  tests/compare-shell-route.test.mjs \
  tests/symbol-selector.test.mjs \
  tests/shell-slots.test.mjs \
  tests/shell-flat-chrome.test.mjs \
  tests/responsive-workspace.test.mjs \
  tests/boot-shell.test.mjs \
  tests/boot-preloads.test.mjs \
  tests/site-preloads.test.mjs \
  tests/site-styles.test.mjs \
  tests/static-module-references.test.mjs \
  tests/wp6-browser-evidence.test.mjs

npm run typecheck
npm run verify:static
node scripts/build-site-preloads.mjs --check
node scripts/build-site-styles.mjs --check
```

preload은 기존 모듈의 `buildSitePreloads()`로 재생성한 뒤 위 `--check`를 실행했다. `atlas-shell.css`는 직접 로드되는 시트이므로 별도 bundle 변경 없이 `dist/index.html`의 CSS 캐시 식별자를 갱신했다.

브라우저 실행 시 `ATLAS_BROWSER_PATH=/usr/lib/chromium/chromium`을 사용했다. [run-browser-gates.mjs](run-browser-gates.mjs)는 실제 사용한 임시 runner의 바이트 그대로이다. 기존 R10 runner에서 별도 WP6 30개 작업을 제외하고, 요청한 반응형 4회와 chart-qa만 선택했다. 기존 하네스·임계값·candidate source 검증은 수정하지 않았다.

Mac에서는 저장소 루트에서 다음과 같이 재실행할 수 있다. 새 출력 디렉터리 이름을 사용하며 기존 영수증을 덮어쓰지 않는다.

```sh
export ATLAS_BROWSER_PATH="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
candidate_sha="$(git rev-parse HEAD)"

node scripts/verify-page-heading-browser.mjs \
  --out build/r16/mac-heading
node scripts/verify-compare-shell-browser.mjs \
  --out build/r16/mac-compare
node docs/evidence/r16-heading-20261112/run-browser-gates.mjs \
  . "$candidate_sha" build/r16/mac-gates
```

runner는 현재 HEAD와 커밋된 `dist/`의 모든 blob을 대조하고 loopback 서버에 candidate identity를 제공한다. 기존의 깨끗한 `dist/` 요구가 적용된다. 하네스가 기록한 개별 status와 실제 케이스 수를 확인해야 한다.

## 남은 확인

- 320·390·768·1440의 BTCUSD/ETHUSD/MSTR/BMNR에서 보이는 h1 1개, h1∩종목 버튼/티커 0, 제목 중복 0을 실제 브라우저로 측정한다.
- compare 320/390의 h1 위치와 조상 크기 변경/복원, 종목 버튼의 접근성 이름·키보드 동작, 반응형 및 chart-qa를 실제로 통과시킨다.
- 이번 h1 실행은 `--baseline` 없는 현행 계약 모드였다. 수정 전 geometry baseline은 새 라벨의 의도한 22px 플롯 높이 변화 때문에 일치하지 않는다. 기존 baseline 비교 허용값은 변경하지 않았다.
- 기존 h1 하네스의 conference 보충 4개는 player state `empty`를 기다린다. 현재 canonical 데이터가 `ready`를 반환하는 경우의 준비 조건 차이는 이번 실행에서 도달하지 못했고 수정하지 않았다. 해당 보충 케이스와 R16 차트 케이스의 결과는 각각 판독한다.

150ms 전환, Range 206/416, 정확한 seek, h1 1개, 미디어 없음 skip exit 2 계약을 완화하지 않았다. 보호된 네 파일과 기존 macOS 영수증, 미디어 자산은 변경하지 않았다. main push·병합·배포·force push·새 도구 설치는 수행하지 않았다.
