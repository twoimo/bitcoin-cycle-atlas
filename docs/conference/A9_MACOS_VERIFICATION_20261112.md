# A-9 부트 경로 최적화 — macOS 실측 (라운드 1)

**판정: A-9 미충족(0/6). 다만 직전 4.54~4.89초에서 3.16~3.27초로 약 1.4초 줄었고, 남은 병목을 계단(요청 깊이)으로 특정했다.** 이 문서는 커밋 `6108910`(구현 `ee6faf9`)의 실제 macOS 측정이다. Pro의 Linux 샌드박스는 Chromium 소켓 생성이 거절돼 브라우저 케이스 0개였으므로, 수용 판정은 이 macOS 실행을 기준으로 한다.

## 1. 실행 조건

| 항목 | 값 |
|---|---|
| 소스 | `6108910090a68bdbcf2f6eb0265a5da40d9a0159`, `workingChanges` 빈 문자열, `sourceIntegrity.unchangedDuringRun: true` |
| 브라우저 | `Chrome/157.0.8103.79` headless (CDP 1.3) |
| 네트워크 | Chrome DevTools Fast 4G — latency **165ms**, downlink **1,012,500B/s**, upload 168,750B/s, cache off, gzip, CPU 1 |
| 예산 | 초기 painted ready **2,500ms**, 페이지 전환 **150ms** |

## 2. 결과

| 뷰포트 | 초기 ready ms | 기능 | 예산 |
|---|---:|---|---|
| 390×844 | 3,197.1 | 통과 | 초과 |
| 320×740 | 3,261.6 | 통과 | 초과 |
| 768×1024 | 3,161.8 | 통과 | 초과 |
| 1024×768 | 3,216.5 | 통과 | 초과 |
| 1440×900 | 3,267.6 | 통과 | 초과 |
| 1920×1080 | 3,245.2 | 통과 | 초과 |

- **기능 6/6 통과**, 수용 **0/6**. 실패 사유는 6건 모두 `Initial painted ready ... exceeds 2500ms` 하나뿐이다.
- 같은 커밋에서 컨퍼런스 브라우저 회귀 **14/14 통과·실패 0**. CSS 번들 통합이 기능 회귀를 만들지 않았다.
- `node scripts/build-site-styles.mjs --check` → `status: ok`, 원본 41개, 번들 2개(383,868B / 165,922B) 바이트·SHA-256 일치.
- `dist/index.html`의 실제 stylesheet 링크는 4개(선택 폰트 1개는 `media="print"`), 즉 41→4가 확인된다.

직전 P1b 측정(4,542.6~4,893.0ms)과 비교하면 **−1.38초**다. 요청 수 축소는 효과가 있었지만 예산에는 660~770ms 부족하다.

## 3. 남은 병목: 모듈 그래프 깊이

1440×900 케이스의 resource 시작 시각을 60ms 버킷으로 묶으면 계단이 그대로 드러난다. 각 계단 간격이 165~190ms로 RTT 한 번과 일치한다.

| 시작 ms | 요청 수 | 대표 |
|---:|---:|---|
| 175 | 8 | `site-entry.js`, `app.js`, `player.js`, CSS 4개, 폰트 |
| 564 | 5 | `journal-entry.js`, `atlas-navigation.js`, `loading-surfaces.js`, `atlas-shell.js`, `performance-diagnostics.js` |
| 748 | 9 | `workspace-instruments.js`, `skullet.js`, `rsi-chart-layout.js`, `atlas-shell-state.js`, `site-paths.js`, `center-workbench.js` … |
| 922 | 4 | `rsi-instruments.js`, `legacy-workspace-toolbar.js`, `rsi-workbench-controls.js`, `center-loading.js` |
| 1,115 | 1 | `mobile-shell-heading.js` |
| 1,203 | 2 | `chart-url-state.js`, `price-axis.js` |
| 1,382 | 2 | `workspace-state.js`, `ohlc-data.js` |
| 1,560 | 5 | `cycle-engine.js`, `price-display.js`, `intraday-history.js` … |
| 1,766 | 17 | `published-data.js`, `compare-shell-host.js`, `data-source.js`, `relay-room.js` … |
| 2,175 | 2 | `asset-comparison.js`, `asset-judgment-history-view.js` |
| 2,331 | 2 | `ipo-month-calendar.js`, `market-lab-math.js` |
| 2,497 | 2 | `asset-judgment-history.js`, `asset-judgment-records.js` |
| 2,691 | 1 | `timeline.js` |
| **2,871** | 1 | **`timeline.json` (duration 356ms)** |

- 총 **70요청 771,686B**(스크립트 55개 270,379B, CSS 4개 122,511B). 1,012,500B/s 기준 순수 전송은 약 **0.76초**뿐이다. 즉 대역폭이 아니라 **직렬 발견(discovery) 14단계**가 비용이다.
- `timeline.json`은 2,871ms에야 시작한다. 2,500ms 예산 안에 들 수 없는 구조다. 컨퍼런스 플레이어의 `timeline.js`가 마지막 계단에 있고, 그 부모 체인이 13단계다.

## 4. 다음 조치

정적 import 폐포를 HTML에서 미리 발견되게 만든다: entry(`site-entry.js`, `app.js`, `player.js`)에서 정적 도달 가능한 모듈 전체를 결정적 순서로 `modulepreload`하고, 컨퍼런스 경로에서 `timeline.js`와 `timeline.json`(`as="fetch"`)을 HTML 단계에서 preload한다. 폐포가 과도하면 같은 폐포를 소수의 결정적 청크로 묶는다. 이 라운드를 같은 스레드에 요청했다.

계약 유지: 컨퍼런스 전용 힌트만 추가(타 라우트 힌트 불변 테스트), 오프라인 standalone 패키징(41개 style 블록, HTTP preload 없음), 72px·0.01px·h1 1개·전환 150ms 하네스 임계값, R13·heading·compare·반응형·WP6·chart-qa 하네스 파일 불변.

## 5. 증거

- 요약: [../evidence/a9-macos-20261112/summary.json](../evidence/a9-macos-20261112/summary.json)
- 원본 report: `build/conference-data-browser/report.json`(미커밋), 컨퍼런스 14: `build/conference-a9-regression/report.json`(미커밋)
- Pro 쪽 원본: [A9_BOOT_VERIFICATION_20261112.md](A9_BOOT_VERIFICATION_20261112.md), `docs/evidence/a9-20261112/`
