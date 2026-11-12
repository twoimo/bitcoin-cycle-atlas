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

## 6. 같은 커밋의 회귀 게이트 (macOS, HEAD `0abd8ff`)

CSS 41→4 통합은 전역 스타일을 건드리므로 표면별 게이트를 macOS에서 다시 돌렸다. 모두 `dist`가 커밋된 clean 트리, `ATLAS_BROWSER_PATH=/Applications/Google Chrome.app/Contents/MacOS/Google Chrome`, `PATH`에 `/opt/homebrew/bin`(fc-list) 포함 조건이다.

| 게이트 | 결과 | 비고 |
|---|---|---|
| 컨퍼런스 14 | **14/14 통과·실패 0** | `build/conference-a9-regression` |
| 반응형 44 | **44/44 통과** (BTCUSD·ETHUSD·MSTR·BMNR 각 11, 스크린샷 25장씩 검증) | `r10-browser-gates.mjs` |
| WP6 30 | **30/30 통과**(PASS, 스크린샷 48장) | 동일 러너 |
| chart-qa 12 | **12/12 통과**(PASS, 스크린샷 18장) | 동일 러너 |
| compare 셸 | **PASSED, failures 0** | `verify-compare-shell-browser.mjs`, `qualifiesFullVerification:false`는 기존 스코프 표기 |
| `npm test` | `complete:true` **3,459 pass + 5 skip = 3,464**, 실패 0, 2배치 | exit 0 |
| A-9 초기 로드 | **0/6** | 위 §2 |

- 첫 실행에서 WP6·chart-qa가 `spawnSync fc-list ENOENT`로 죽었는데, 이는 macOS에 `fc-list`가 없어서가 아니라 실행 PATH에 `/opt/homebrew/bin`이 빠진 내 실수였다. PATH를 채운 재실행에서 30/30·12/12로 통과했으므로 제품 결함이 아니다. 이 실패를 통과로 덮지 않고 그대로 적는다.
- `verify:pages`는 여전히 기존 실패다(Pro 라운드 1 보고와 동일).

## 7. 라운드 2 — A-9 통과 (HEAD `e6c9a7a`)

Pro가 `1e0d071`(정적 import 폐포 생성기 `scripts/build-site-preloads.mjs` + `docs/conference/boot-preload-graph.json`)와 `e6c9a7a`(기록)를 push했다. macOS 재측정에서 **6/6 통과**했다.

| 뷰포트 | 라운드 1 (ms) | 라운드 2 (ms) | 판정 |
|---|---:|---:|---|
| 390×844 | 3,197.1 | **2,311.2** | 통과 |
| 320×740 | 3,261.6 | **2,300.9** | 통과 |
| 768×1024 | 3,161.8 | **2,323.4** | 통과 |
| 1024×768 | 3,216.5 | **2,277.6** | 통과 |
| 1440×900 | 3,267.6 | **2,288.5** | 통과 |
| 1920×1080 | 3,245.2 | **2,330.7** | 통과 |

- 최초 P1b 측정 4,542.6~4,893.0ms 대비 **−2.26초(−49%)**, 라운드 1 대비 −0.88초.
- **계단이 사라졌다**: 1440×900에서 70요청이 모두 **179ms 한 지점**에서 시작한다(라운드 1은 175→2,691ms까지 14단계). 직렬 발견이 병목이었다는 진단이 그대로 확인됐다.
- `timeline.json`: 시작 **180ms**(라운드 1은 2,871ms), 전송 693ms, 187,206B. **context당 정확히 1회, 6개 context 합계 6회**로 중복 전송이 없다(Pro가 요청한 확인 항목).
- 페이지 전환 20.8~32.4ms(예산 150ms).
- 총 전송 769,501B — 라운드 1(771,686B)보다 오히려 2KB 적다. preload가 전송량을 늘리지 않았다.

### 같은 커밋 회귀 (HEAD `e6c9a7a`)

| 게이트 | 결과 | 비고 |
|---|---|---|
| 컨퍼런스 14 | **14/14 통과·실패 0** | |
| 반응형 44 | **44/44 통과** | 4종목 × 11 |
| chart-qa 12 | **12/12 통과** | |
| compare 셸 | **PASSED, failures 0** | |
| WP6 30 | **30/30 통과**(단독 재실행) | 6게이트 묶음 실행 중 `btcusd-768x1024` 1건이 `Timed out: native heading pan`으로 실패했으나, 같은 커밋·같은 하네스로 단독 재실행해 30/30 통과. 묶음 실행 중 부하로 인한 타임아웃 플레이크로 판정하며, 통과로 덮지 않고 두 실행을 모두 적는다 |
| `npm test` | 아래 §8 | |

증거: `docs/evidence/a9-macos-20261112/summary.json`의 `round2`, 원본 report는 `build/conference-a9-r2/`(미커밋).

## 8. `npm test` 전체 (HEAD `e6c9a7a`, macOS)

같은 커밋에서 전체 테스트를 한 번 돌렸다. 정본은 마지막 한 줄이다.

```
ATLAS_TEST_TOTAL {"complete":true,"tests":3479,"pass":3474,"fail":0,"skipped":5,"batches":2}
```

- **3,474 pass + 5 skip = 3,479, 실패 0**, `complete:true`, 2배치, exit 0(약 8분).
- 실행 조건: `PATH=/opt/homebrew/bin:/Applications/Docker.app/Contents/Resources/bin:$PATH`, `DOCKER_HOST=unix:///Users/twoimo/.docker/run/docker.sock`, 추적 파일 기준 clean 트리(당시 untracked evidence 디렉터리는 테스트 대상이 아니며 이후 제거했다).
- 라운드 1(3,459 pass + 5 skip)보다 15건 늘었고, 증가분은 `1e0d071`이 추가한 preload 생성기·정적 import 스캐너 테스트와 기존 스위트 확장분이다. 실패 0은 그대로다.
- 이 실행은 브라우저 게이트와 겹치지 않게 따로 돌렸다.
