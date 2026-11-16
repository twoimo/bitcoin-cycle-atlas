# Q-R19P0-3-8b10785 — 눈금 조작의 즉시 역할 색 적용

**상태: 제품 CSS 수정, Mac 재실행 대기. Q-R19P0-3과 P0는 열림.**

저장소 `twoimo/bitcoin-cycle-atlas`, 브랜치 `fix/tradingview-responsive-20261110`, 기준 HEAD `df0e54f303fdcd1bab0db79c42446d2ad6a6e0a5`에서 작업했다. 그 문서 커밋과 [Mac 원본 영수증](../qa-r19p0-20261112/p0-8b10785.json)을 보존했다. 원본의 실제 결과는 9/10이며 제목 증명은 10/10이었다. 이번 변경은 그 제목·clip-path 하네스를 수정하지 않는다.

## 원인

목표 역할 토큰과 CSS 우선순위는 올바르지만, 공통 `button,select` 규칙에 `transition:background .16s,color .16s,border-color .16s`가 있다. 전환 전 색은 `--chart-bottom-bar-ink → --muted`의 `(78,89,104)`다. Mac이 보고한 배경 alpha `0.984`와 같은 전환 진행률로 계산하면 두 글자색도 정확히 재현된다.

| 조작 | 시작 RGB | 목표 역할 RGB | 진행률 0.984의 값 | 반올림한 값 / Mac 관측 |
| --- | --- | --- | --- | --- |
| `#workbench-scale` | 78, 89, 104 | **90, 59, 240** (`--chrome-active → --ui-link → --accent-ink`) | 89.808, 59.480, 237.824 | **90, 59, 238** |
| `#workbench-auto-scale` | 78, 89, 104 | **25, 31, 40** (`--text`) | 25.848, 31.928, 41.024 | **26, 32, 41** |

배경도 transparent에서 `--surface-hover` `(229,232,235)`로 전환하면 `rgba(229,232,235,0.984)`가 된다. 이 표는 소스와 Mac 영수증을 대조한 계산이며 이 Linux에서 native 전환 시간을 실측한 것은 아니다. CSS 전환 중 computed value 조회가 중간 값을 반환하는 동작은 [CSS Transitions](https://www.w3.org/TR/css-transitions-1/#application)에 명시돼 있다.

ETH와 BTC는 초기 적용 순서가 다르다. `dist/native-chart-workbench.js`는 두 버튼을 `aria-pressed` 없이 만든 뒤 `mountChartBottomBar()`로 DOM에 붙인다. 첫 `update()`는 `legend.update()`부터 호출하며, `dist/ui/native-chart-legend.js`의 `controller.refresh()`가 `dist/ui/chart-legend.js`에서 `getBoundingClientRect()`와 `clientWidth`를 읽는다. 그 뒤에야 두 버튼의 `aria-pressed`를 설정하므로 기존 비선택 스타일에서 선택 스타일로 전환할 수 있다. BTC의 `dist/workbench-chrome.js`는 `aria-pressed=true`를 지정한 다음 버튼을 붙인다.

## 제품 수정

원본 `dist/chart-bottom-bar.css`에 두 조작만 대상으로 다음 규칙을 추가했다.

```css
.workbench-bottom-bar #workbench-scale,
.workbench-bottom-bar #workbench-auto-scale { transition: none; }
```

선택 상태·테마·hover의 기존 규칙이 목표 색을 결정하며 두 버튼은 그 색을 즉시 사용한다. BTC/ETH 공용 경로에 적용하고, 특정 종목이나 1440px에 별도 색을 추가하지 않았다. 폰트·크기·위치·가격 데이터·축 기하·이벤트·aria 상태는 수정하지 않았다.

기존 생성기로 `dist/site-before-shell.css`를 재생성하고 `dist/index.html`의 해당 CSS 캐시 키를 `c6031ebb25d3`으로 갱신했다. preload도 재생성한 뒤 `--check`했으며 그래프와 manifest 바이트는 그대로다. 제품 변경은 이 3파일뿐이다. `dist/styles.css`의 토큰, P0 러너·역할 검사·클립 증명, 보호 4파일, 가격 축 JS와 기존 Mac 영수증은 바이트가 같다.

## 실행한 검증

| 검사 | 결과 | 영수증 |
| --- | --- | --- |
| 새 색 전환 회귀 + 기존 P0·제목 증거 | **88/88**, 실패 0·skip 0 | [TAP](focused-contract.tap), [명령](focused-contract-command.json) |
| 기존 R17·제목·터치·테마·하단 조작·CSS 산출물 계약 | **75/75**, 실패 0·skip 0 | [TAP](preserved-contract.tap), [명령](preserved-contract-command.json) |
| 중복 없는 단위·계약 합계 | **163/163**, 실패 0·skip 0 | [요약](summary.json) |
| 새 MJS 문법 검사·diff whitespace | 통과 | [요약](summary.json) |
| `npm run verify:static` | **1,064파일·220스크립트·1,068참조**, exit 0 | [출력](static-checks.json) |
| CSS 생성·`--check` | **41소스·2번들**, 일치 | [출력](static-checks.json) |
| preload 재생성·`--check` | **56 URL·54모듈·82정적 import**, 일치 | [출력](static-checks.json) |
| 정적 토큰·폰트 파일 | **40/40 토큰쌍**, 92 face·2,957,724바이트 출처 검증 | [원본 보고서](linux-20261112/report.json) |
| 실제 P0 브라우저 | **0/10 실행·통과 0**, `unverified`, exit 1 | [명령](browser-command.json), [원본 보고서](linux-20261112/report.json) |

새 테스트 `tests/workbench-scale-paint.test.mjs`는 5개다. 역할 토큰의 정확한 채널과 별칭 연결을 확인하고, 보고된 두 중간 색이 대비에는 통과해도 역할 검사에는 계속 실패하도록 고정한다. 실제 원본 CSS 41개와 배포 stylesheet 4개의 순서를 각각 읽어 BTC/ETH × 라이트/다크 × 320/390/768/1440 × 4개 버튼 상태 × 2개 버튼, 즉 각각 128개 조합을 검사한다. 더 강한 우선순위의 전환, longhand, delay가 색 전환을 되살리면 실패한다. **이 검사는 범위를 명시한 소스·CSS 우선순위 모델이며 실제 브라우저 computed style 측정이 아니다.**

브라우저는 Chromium의 `socket() failed: Operation not permitted (1)` / SIGABRT로 첫 페이지 전에 중단됐다. 실제 수치는 required 10, attempted 0, passed 0, failed 0, unattempted 10, harness failure 1이다. 스크린샷·실제 대비·폰트 케이스·제목 hit는 모두 0이다. `sourceStable:true`, `qualifiesP0Verification:false`이며 실패 케이스 0을 통과로 세지 않는다. 기존 R17/A-9 native 게이트와 전체 `npm test`는 이번 CSS 수정에서 재실행하지 않았다.

P0 10케이스·대비 4.5/3.0·폰트 증거·오버플로 0·h1 1개, R17 16케이스·±2px·minRight 64, A-9 2,500ms 및 기존 미디어 계약을 유지했다. 새 색 토큰, 채널 허용, 하네스 대기 시간은 추가하지 않았다. P1, P2a, Q-P1c-B-2, Q-R16-1은 시작하지 않았다.

## Mac 재실행

이 변경이 들어간 브랜치에서 기존 `p0-8b10785`를 보존하고 새 폴더로 실행한다.

```bash
node scripts/verify-ui-renewal-p0-browser.mjs \
  --out build/qa-r19p0-20261112/p0-Q-R19P0-3-immediate-colors
```

같은 게이트의 10케이스와 필수 증거를 Mac에서 다시 확인하기 전까지 **Q-R19P0-3과 P0를 닫지 않는다.** 이전 Mac의 제목 10/10이나 다른 통과 표본을 이번 수정의 native 통과로 다시 세지 않는다.
