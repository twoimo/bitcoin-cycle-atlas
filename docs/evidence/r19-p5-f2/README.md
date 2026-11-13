# R19 P5 F2 — 컨퍼런스 재생 버튼

기준 문서 HEAD: `3356e68aca3e45ce82bbeca1e852ba220fa9c762`. F1/Q-P5F1-1은 Mac `36869d2`에서 닫힌 상태를 유지한다.

**F2 제품 수정은 구현했다. 브라우저가 페이지 시작 전에 차단되어 F2 수용은 열림이다.** 이 기록의 토큰 계산값을 native `getComputedStyle` 결과나 스크린샷으로 읽지 않는다.

## 제품 변경

`dist/conference/player.css`의 재생 버튼 두 규칙만 수정했다.

- 기본 배경: `var(--ui-primary)` → 기존 `var(--surface)`.
- 아이콘: `var(--on-ui-primary)` → 기존 `var(--text)`.
- 테두리: 기존 `var(--accent-ink)` 사용. 기존 1px 테두리 폭은 유지.
- 모서리: `var(--pill-radius)`(999px) → **6px**.
- Hover: `var(--ui-primary-hover)` → 기존 `var(--surface-hover)`.

56×56px 크기·최소 크기, 2px 포커스 규칙, disabled opacity `.5`, SVG·접근성 이름·재생 코드는 그대로다. 전역 `--accent`와 `dist/styles.css`를 수정하지 않았다. 새 색 리터럴은 0개다. 정규 생성기로 CSS 번들을 다시 만들었고 root 및 9개 Pages wrapper에는 해당 번들 캐시 키만 반영했다.

## 소스 토큰 계산 — native 실측 아님

기존 `ui-renewal-p0-contract.mjs`의 토큰 해석 및 WCAG sRGB 대비 계산을 사용했다. 원시 hue를 그대로 기록하며 저채도 색을 제외하지 않는다. 새 hue 200–260 토큰 값은 **0**이지만 기존 어두운 표면의 hue 240과 기존 hover 표면의 hue 210/240이 없다는 뜻은 아니다.

| 테마 | 상태 | 배경 | 아이콘 | 테두리 | 아이콘 대비 |
|---|---|---|---|---|---:|
| Light | 기본 | `rgb(255, 255, 255)` | `rgb(25, 31, 40)` | `rgb(90, 59, 240)` | 16.5619:1 |
| Light | Hover | `rgb(229, 232, 235)` | 동일 | 동일 | 13.4655:1 |
| Dark | 기본 | `rgb(23, 23, 28)` | `rgb(242, 242, 244)` | `rgb(180, 164, 255)` | 15.9749:1 |
| Dark | Hover | `rgb(39, 39, 48)` | 동일 | 동일 | 13.2351:1 |

모든 재생 버튼 radius 선언은 **6px**, 크기 선언은 **56×56px**다. 위 배경 값 중 `rgb(41,98,255)`는 **0건**이다. 현재 버튼에는 SVG만 있고 가시 텍스트는 없다. 인접한 실제 시계 텍스트 역할인 `--muted`의 토큰 대비는 Light **7.1119:1**, Dark **8.3054:1**이다.

기존 disabled opacity `.5`를 같은 표면 위에 합성한 아이콘 대비는 Light **3.2465:1**, Dark **4.8245:1**이다. disabled 테두리는 Light **2.3496:1**, Dark **3.0024:1**이다. Light disabled 테두리를 3:1 통과로 표시하지 않는다. enabled 테두리 대비는 기본 Light **6.3280:1**·Dark **8.2456:1**, Hover Light **5.1449:1**·Dark **6.8314:1**이다.

정밀 값·입력 선언·소스 해시는 [source-colours.json](source-colours.json)에 있다.

## 검증 결과

| 검증 | 결과 |
|---|---|
| 기존 conference player·route 검사 | **66/66**, 실패 0, skip 0 |
| 기존 생성 스타일·셸·프리로드 검사 | **26/26**, 실패 0, skip 0 |
| `build-pages.mjs --check` | verified, **104파일·9경로** |
| 스타일·프리로드 생성물 `--check` | 통과 |
| 신규 F2 러너 `node --check` | exit 0 |
| 보호 4파일·가격 축·전역 토큰·player JS·기존 검사기 대조 | **63/63 동일** |
| Native F2 | **0/4**, blocked, exit 1 |
| Native 배경 금지 색 / 신규 hue 수 | **null / null** |
| 실제 스크린샷 | **0/4**, 생성 파일 없음 |
| F2 수용 | **열림** |

최초·최종 러너의 Chrome 시작 2회 모두 제품 탐색 전 차단됐다. 보존한 native 원본은 최종 러너 해시와 일치한다. Native 실행은 `/usr/bin/chromium`의 `process_singleton_posix.cc`에서 `socket() failed: Operation not permitted (1)`로 종료됐다. 제품 탐색 전 harness 실패 1건이며, 제품 실패 0 또는 통과로 바꾸지 않는다. `complete:false`, `qualifiesF2ObservedPaint:false`다. 관측하지 못한 색·포커스·hit-test·캡처를 소스 계산으로 대체하지 않는다.

[요약](summary.json) · [native 원본](native-blocked.json) · [기존 파일 해시](unchanged-contracts.json) · [player 검사 원본](player-tests.log) · [생성물 검사 원본](generated-tests.log) · [Pages 검사 출력](pages-check.log)

Pages 콘솔 출력은 ANSI 색상 코드와 행 끝 공백만 정리했다.

## 같은 후보의 native F2 실행

기존 F1·D-1·미디어 검사기는 수정하거나 실행하지 않았다. 신규 `scripts/verify-r19-p5-f2-browser.mjs`는 F2 페인트와 캡처만 검사한다. 실제 미디어 20건, 재생 기능 게이트, A-9, 축, 전체 P5를 통과시키는 명령이 아니다.

```bash
node scripts/verify-r19-p5-f2-browser.mjs \
  --baseline-ref 3356e68aca3e45ce82bbeca1e852ba220fa9c762 \
  --out build/r19-p5-f2-browser
```

macOS 기본 Chrome 경로를 사용하며 필요하면 `ATLAS_BROWSER_PATH`로 지정한다. 기준 커밋은 Git 객체에서 읽고 후보는 현재 `dist`에서 읽는다. 원본 자산·매니페스트를 쓰거나 합성 미디어로 교체하지 않는다.

Light·Dark 각각 320×900·1440×900에서 실제 계산 스타일, SVG stroke와 조상 opacity/background 합성 대비, 실제 시계 텍스트 대비를 기록한다. 배경은 실제 `--surface`/관측 hover의 `--surface-hover`, 아이콘은 `--text`, 네 방향의 가시 테두리는 `--accent-ink`와 정확히 같아야 한다. 새 hue 판단은 같은 테마 기준 화면의 가시 배경과 실제 관측된 기존 컨트롤 hover 색과 비교한다. Hover는 대상 버튼의 실제 CSS 전환이 끝난 후 측정한다. disabled 버튼은 강제로 활성화하지 않으며, 이때 enabled hover·키보드 포커스·재생은 미관측으로 남긴다. 2px 포커스는 실제 버튼에 매칭되는 CSS 선언만 검사하며 native 포커스 실측으로 주장하지 않는다.

아래는 **성공적으로 생성됐을 때의 출력 위치**다. 이번 실행에는 해당 PNG가 없다.

```text
build/r19-p5-f2-browser/after/conference-light-320.png
build/r19-p5-f2-browser/after/conference-light-1440.png
build/r19-p5-f2-browser/after/conference-dark-320.png
build/r19-p5-f2-browser/after/conference-dark-1440.png
```

## Mac 재검증 (2026-11-13 13:27 KST)

Chrome 157.0.8103.79, 제품 `f8075a1`, 출력 `build/r19-p5-f2-browser-f8075a1`. 4/4 캡처, exit 1. 실패는 검사기의 `light-dark()` 미해석이다. 수용은 열림. [영수증](mac-f8075a1.md).
