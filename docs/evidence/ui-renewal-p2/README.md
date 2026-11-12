# P2 차트 크롬 — P2-CHROME-b16a7c6

2026-11-13 KST. **제품 후보 구현·push 완료, Mac 네이티브 검증 대기. P2를 닫지 않는다.**

| 항목 | 값 |
|---|---|
| 저장소 / 브랜치 | `twoimo/bitcoin-cycle-atlas` / `fix/tradingview-responsive-20261110` |
| 작업 전 재조회한 원격 | `b16a7c660a39ab29d01f06e18cc96217dd173ea6` |
| 제품 후보 | `0cf36d814c0b21f7a0d7249df50eec63433e1bc0` |
| 측정한 제품 tree | `40d3bba1901203ecebd1b5f17ff7bc9c498d97a7` |
| 정본 | [요구사항 §4 P2·차트 워크벤치](../../requirements/REQ_UI_RENEWAL_FUNNEST_20261112.md), [체크리스트 P2-CHROME-b16a7c6](../../LAUNCH_CHECKLIST_20261110.md) |
| 상태 보존 | P0·P1·P2a-0 닫힘 유지. 기존 엔진 유지. P2b·P3·P4·P5·배포 미착수 |

P2a-0의 Mac `72d3aa1` 영수증(startup 6/6, features 7/7, keyboard 4/4, touch 4/4, qualifier true)은 [원본](../qa-p2a0-mac-72d3aa1/README.md)에 보존한다. 그 수치를 이 P2 후보의 브라우저 결과로 재사용하지 않는다.

## 1. 구현 범위

`dist/chart-chrome.css`를 기존 네 번째 CSS 묶음의 마지막에 추가했다. 차트 카드에 1px 테두리와 16px 모서리, 기존 surface 역할을 적용하고, 621px 이상에서 기존 툴바를 카드의 일반 흐름 안에 배치했다. 그 위치에 대응하던 상단 여백만 제거했다. 모바일의 하단 도크, 원래 스크롤 소유자와 DOM 노드, 다른 가운데 도구 화면은 유지했다. 범례에는 카드·알약 모서리와 기존 텍스트 역할을 적용하고, 읽기 행은 투명한 배경과 기존 공간 예약을 유지한다. 축은 `--chart-axis-ink`로 표시한다.

기존 검사기의 행 계약은 정밀 포인터 데스크톱 38px, compact/coarse 및 전화기 48px다. 이번 변경은 그 계약과 기존 **44px 터치 하한**을 유지한다. 새 색상 선택은 데스크톱을 포함해 높이 44px이며, 포커스 윤곽선은 2px다. 기존 데스크톱의 모든 작은 컨트롤을 44px로 측정했다는 뜻은 아니다. 실제 타깃·포커스·대비는 Mac 측정 대기다.

기존 차트 설정의 **캔들·등락 색**에서 다음을 선택한다.

- 기본 **상승 빨강 · 하락 파랑**.
- 선택 **상승 초록 · 하락 빨강**.

`dist/ui/chart-colors.js`가 네이티브 `<label>`/`<select>`, 저장·복원, 동일 문서의 설정 동기화를 담당한다. 기존 부모/소유 iframe 사이에는 같은 origin과 실제 창 소유를 확인한 메시지만 전달한다. BTC·ETH·MSTR·BMNR 네이티브 워크벤치와 실제 캔들이 있는 React 워크벤치에 같은 설정을 연결했다. 캔들이 없는 주택 화면에 캔들 선택을 만들지 않았다. 기존 라이트/다크 선택과 리서치의 매수·매도 의미 색은 유지한다.

선택은 캔들·거래량·마지막 가격 태그·관측 리플레이 캔들·차트 범례의 표시 역할에 적용된다. `atlas-price-chart.js`, `intraday-chart.js`, `chart-overlays.js`, `price-legend.js`, `chart-replay-renderer.js`, `rsi-chart-canvas.tsx`는 나열된 색 문자열 치환 외에 기준 파일과 바이트가 같다. [6파일 대조](paint-only-invariance.json)에 원본·후보 SHA-256과 치환을 기록했다. OHLCV, 도메인, 좌표식, 예측 계산, 시점 증거, URL 상태, 비교 정렬은 바꾸지 않았다.

### 하이브리드 결정 유지

| 기능 | 이번 P2의 소유자 | 유지한 내용 |
|---|---|---|
| 예측 밴드 | 기존 Atlas 엔진 | 예측·자동 축·시점/출처 계약 |
| 역사 사건 | 기존 Atlas 엔진 | 사건 데이터와 탐색·좌표 계약 |
| 리플레이 | 기존 Atlas 엔진 | 고정 예측·기준 시점·미래 데이터 차단; 관측 캔들 색 역할만 연결 |
| compare | 기존 Atlas 엔진 | 사이클 정렬·비교 URL·reader 및 iframe 소유권 |

새 차트 엔진 교체나 유료 도구·의존성 추가는 없다. 보호 4파일과 `dist/price-axis.js`는 기준 `b16a7c6`와 바이트 동일하다. `minRight=64`, 축 글자 크기·`textLength`·좌표식·최종 페인트 순서를 유지했다. 카드의 정상 테두리 배치와 기존 overflow의 둥근 모서리는 브라우저에서 다시 확인해야 하므로, 화면 기하가 픽셀 단위로 전부 같다고 주장하지 않는다. h1 소유 코드는 바꾸지 않았다.

## 2. 같은 네이티브 게이트의 실제 결과

깨끗한 제품 커밋 `0cf36d8`에서 2026-11-12 17:24:18–17:28:24 UTC에 실행했다. 다음 숫자는 **제품 케이스** 수다.

| 같은 게이트 | 필수 | 시도 | 통과 | 실패 케이스 | 미시도 | 판정 |
|---|---:|---:|---:|---:|---:|---|
| ETH 53-case | 53 | 0 | 0 | 0 | 53 | 시작 차단 · 미검증 |
| 반응형 — BTCUSD | 11 | 0 | 0 | 0 | 11 | 시작 차단 · 미검증 |
| 반응형 — ETHUSD | 11 | 0 | 0 | 0 | 11 | 시작 차단 · 미검증 |
| 반응형 — MSTR | 11 | 0 | 0 | 0 | 11 | 시작 차단 · 미검증 |
| 반응형 — BMNR | 11 | 0 | 0 | 0 | 11 | 시작 차단 · 미검증 |
| **반응형 합계** | **44** | **0** | **0** | **0** | **44** | **Mac 대기** |
| 축 계약 | 16 | 0 | 0 | 0 | 16 | 시작 차단 · 미검증 |
| A-9 fast4g/gzip | 6 | 0 | 0 | 0 | 6 | 시작 차단 · 미검증 |

7개 실행 모두 종료 코드 1이다. Chromium의 `process_singleton_posix.cc:297`에서 `socket() failed: Operation not permitted (1)`가 발생했다. ETH와 반응형은 DevToolsActivePort 타임아웃, 축은 SIGABRT, A-9은 Chrome CDP 타임아웃으로 끝났다. 브라우저가 케이스를 시작하지 못했으므로 **실패 케이스 0은 통과가 아니다**. 스크린샷 0장, 가로 오버플로·축 오차·키보드/터치·초기 페인트 시간은 미측정이다. `complete:false`, `qualifies:false`를 그대로 보존한다.

실행 오케스트레이터가 후보의 커밋·브랜치·깨끗한 작업 트리를 확인하고 `dist/apps/packages/scripts` 및 루트 패키지 파일 **1,454개**의 실제 바이트를 커밋 blob과 대조했다. 전후 해시가 같아 외부 전체 소스 대조의 `sourceStable:true`다. 이 값을 각 하위 게이트가 네이티브 관측까지 마쳤다는 뜻으로 읽지 않는다. 반응형 서버는 `/bitcoin-cycle-atlas/`에서 HTTP **200**, 커밋된 `dist/index.html`과 같은 바이트를 반환했다. HTTP 성공도 화면 렌더링 성공은 아니다.

원본 영수증·실행 로그는 [native-linux/summary.json.gz](native-linux/summary.json.gz)와 같은 디렉터리의 gzip 파일에 보존했다. [artifact-manifest.json](artifact-manifest.json)에 압축 전후 SHA-256·바이트 수가 있다. 상위 영수증의 `failures:[]`는 오케스트레이터 자체의 오류 목록이며, 각 원래 게이트의 실패 상태·오류를 지우지 않는다. 읽기용 합계는 [summary.json](summary.json)이다.

### Mac에서 확인할 잔여 항목

53/53·44/44·16/16과 축 정렬 8쌍, 오버플로 0을 원래 게이트로 확인해야 한다. 카드 모서리에서의 글자/축 잉크, 가격 태그와 범례 겹침, 도크·reader 복귀, 실제 설정 선택과 포커스는 네이티브 관측 전이다. 44px·2px·텍스트 4.5/아이콘 3.0·축 ±2px·h1 1개 기준을 낮추지 않았다.

소스에서 별도로 확인한 기존 제약은 ETH 53-case 내부의 `dark()` 배경 판정이다. P0의 라이트 기본값과 함께 실행했을 때의 결과는 이번 시작 차단 때문에 아직 관측하지 못했다. 보호 검사기를 수정하거나 제품을 검사 전용 다크 모드로 바꾸지 않았다. 실제 Mac 케이스 실패가 나오면 원래 오류와 영수증을 보존해야 한다.

## 3. 브라우저 외 검증

| 검사 | 결과 | 근거 |
|---|---|---|
| 집중 단위·계약 검사 | **286/286**, 실패 0, skip 0 | [전체 로그](checks/focused-tests.log) |
| TypeScript | 통과 | [typecheck](checks/typecheck.log.gz) |
| Pages build / verify | 통과, **104파일·9경로** | [build](checks/pages-build.log.gz), [verify](checks/pages-check.log.gz) |
| 정적 배포 파일 참조 | **1,159파일·221스크립트·847참조** 통과 | [static](checks/static-check.log) |
| 보존 대조 | **22/22 동일** | [source-preservation.json](source-preservation.json) |
| 6 렌더러의 색 외 바이트 | 모두 동일 | [paint-only-invariance.json](paint-only-invariance.json) |
| 원래 토큰 대비 표본 | **40/40**, authored CSS 49개, root 밖 literal/global 재정의 위반 0 | [style-audit.json](style-audit.json) |

새 색상 설정 검사는 저장 실패·이벤트 동기화·부모/iframe 메시지 소유·정리·두 HTML의 초기 복원을 포함한다. 캔들 렌더링 검사는 개별/배치 캔들, 거래량, 가격 태그의 방향과 원본 데이터 보존을 검사한다. CSS 파일 수는 새 파일을 포함해 증가시켰고 이전 표본은 유지했다. 오래된 축의 literal fill 선택자는 실제 `data-price-axis-label="tick"`을 검사하도록 바꾸되, 최소 3개와 중복 없는 라벨 단언은 유지했다. 기존 네이티브 검사기·P0/P1/P2a-0 하네스는 바이트 동일하다. 전체 `npm test` 완료 수치로 확대하지 않는다.

소스 토큰 계산에서 두 테마·두 팔레트의 차트 텍스트/태그 최소 대비는 **5.8464**, 거래량의 기존 0.78 불투명도를 합성한 최소 대비는 **3.7564**다. 이는 계산한 소스 색 대조이며 실제 화면 대비 측정이 아니다.

## 4. 산출물과 A-9

Pages 산출물을 현재 authored source로 재생성했다. React 산출물에는 이미 소스에 있던 P0 테마·폰트와 이번 색상 설정이 반영된다. Vite가 내보낸 92개 폰트 복사본은 기존 고정 Pretendard 파일과 바이트 동일하며 합계 2,957,724B다. 새 폰트를 도입한 것이 아니며 이 전부가 초기 로드된다는 주장도 아니다. 원본 경로·해시는 [generated-assets.json](generated-assets.json)에 있다.

루트 CSS 요청은 **4개 유지**, 묶음 소스는 42→43개다. 기준 `b16a7c6` 대비 네 CSS의 gzip-9 합계는 **+1,734B**다. conference modulepreload 그래프는 바꾸지 않았다. 바이트 크기나 그래프 동일성을 초기 로드 시간 동일성으로 바꾸지 않는다.

이번 A-9는 **0/6 시도·0통과**, 초기 페인트와 기준 대비 차이는 **null**이다. 기존 Mac `1c8f0c3`의 6/6·2,170–2,208.2ms는 이전 영수증이다. 이번 후보의 합격 수치가 아니며 기준 worktree 비교도 수행되지 않았다. **0ms 영향이라고 쓰지 않는다.** 2,500ms 초기 로드·150ms 전환, fast4g/gzip·캐시 비활성·CPU 1 및 원래 네트워크 조건은 그대로다.

## 5. Mac 재실행

지정 브랜치의 깨끗한 작업 트리에서 실행한다. 원래 ETH 검사기의 전제인 Node 24 이상과 한국어 글꼴을 반환하는 `fc-list`를 준비한다. 증거 문서만 추가된 HEAD와 제품 후보 사이에 `dist/apps/packages/scripts/package.json/package-lock.json` 차이가 없는지 먼저 확인한다. 기존 브라우저 사례를 필터링하거나 레인으로 줄이지 않는다.

```sh
git branch --show-current
git status --porcelain
git diff --stat 0cf36d814c0b21f7a0d7249df50eec63433e1bc0 HEAD -- dist apps packages scripts package.json package-lock.json

ATLAS_BROWSER_PATH="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
node docs/evidence/ui-renewal-p2/run-gates.mjs \
  . "$(git rev-parse HEAD)" build/qa-p2-chrome-mac-0cf36d8
```

`run-gates.mjs`는 기존 게이트를 순서대로 호출하고 원본 보고서를 수집하는 보조 실행기다. ETH 전체 53, 반응형 BTC/ETH/MSTR/BMNR 각 10뷰포트+노드 identity 1(합계 44, `heading=bottom`), 축 16, A-9 6을 그대로 실행한다. 제품 검사 로직을 대신하지 않는다. 모든 실행의 종료·필수 수·통과 수·실패 목록 및 원래 축 qualifier를 확인하므로 0시도는 자격 통과가 될 수 없다.

출력 디렉터리는 새 경로여야 한다. 재실행에는 `-r2` 같은 새 경로를 사용한다. 이 증거 폴더의 보조 실행기는 이미 존재하는 출력 영수증을 finalizer에서 덮어쓰지 않게 하는 보호만 추가했다. 실제 Linux 실행에 썼던 원본은 `native-linux/collect-gates.executed.mjs.gz`에 별도 보존했고 두 SHA-256과 차이는 `summary.json`에 기록했다. 원래 게이트·타임아웃·임계값·표본·자격 조건은 동일하다.

새 Mac 영수증과 스크린샷을 확인한 뒤 정본 체크리스트의 P2 상태를 판정한다. 이번 구현·소스 검사 결과만으로 P2를 닫거나 다음 단계를 시작하지 않는다.
