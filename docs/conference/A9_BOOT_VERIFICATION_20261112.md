# A-9 공용 부트 요청 최적화 후보 — 2026-11-12

**A-9 수용은 미완료다.** CSS 링크 41개를 4개로 통합하고 모듈 요청 시작을 앞당기는 후보를 구현했다. `npm test`는 **3,464/3,464 통과, fail 0, skip 0, complete:true, exit 0**다. 그러나 현재 Linux 실행 샌드박스가 Chromium의 Unix 소켓 생성을 거절하여 **브라우저 실측 케이스는 0개**다. 초기 로드 2,500ms·페이지 전환 150ms·브라우저 회귀 통과를 주장하지 않는다.

## 1. 변경 파일과 방식

| 파일 | 변경 |
|---|---|
| `dist/index.html` | 필수 CSS 링크 41→4. CSS 대기 전에 site-entry modulepreload, conference 진입에만 기존 app/player의 정확한 URL을 preload |
| `dist/site-before-shell.css` | 기존 compact.css부터 market-lab.css까지 27개 원본을 같은 순서로 결합 |
| `dist/site-after-shell.css` | 기존 compact-toolbar.css부터 ui/quote-hud.css까지 12개 원본을 같은 순서로 결합 |
| `scripts/build-site-styles.mjs` | 결정적 생성, 원본 SHA-256, 바이트 동일성 검사, 오프라인 원본 스타일 복원 |
| `scripts/build-standalone.mjs` | HTTP preload 제거, 기존 41개 원본 style 블록 유지 |
| `scripts/standalone-verification.mjs` | 41개 원본 블록의 정확한 내용·1회 포함·순서 검사 |
| `tests/boot-preloads.test.mjs` | 실제 import URL 일치, conference 전용 힌트, 타 라우트에 추가 힌트 없음 |
| `tests/site-styles.test.mjs` | 원본/순서/캐시 해시, 누락·중복·재배치 거절, 결정적 생성·stale 감지 |
| `research-data/eth-review-scope.json` | 새 CSS 2개를 기존 검토 인벤토리에 등록 |
| 이 문서 | 결과·제약·재실행 방법 |
| `docs/evidence/a9-20261112/manifest.json` | 명령 결과·소스 해시·아카이브 인벤토리 |
| `docs/evidence/a9-20261112/verification.tar.gz` | 실제 원본 TAP·브라우저 report·stderr·보존 확인 기록 |

원본 스타일의 광범위한 cascade를 검토한 뒤, 먼저 요청 수를 줄이고 전체 CSS 내용은 보존하는 변경으로 한정했다. `styles.css`와 `atlas-shell.css`는 직접 링크로 남으며 상대 순서도 동일하다. **41개 원본 CSS 바이트·순서 변경 0**이다. `url()`, `@import`, `@charset`, `@namespace`가 향후 들어오면 경로/범위 처리를 명시하도록 생성기가 실패한다. 번들 내용 SHA-256의 앞 12자를 URL의 `v`에 쓰며 테스트가 일치를 확인한다.

modulepreload는 요청 예약만 추가한다. `site-entry.js`, `app.js`, 컨퍼런스 라우트/플레이어의 실행·마운트·오류·ready 소유권은 변경하지 않았다. 오프라인 생성물에는 HTTP preload가 없고 기존 원본 41개 style 블록이 그대로 들어간다. 기존 패키징 테스트를 완화하지 않았다.

### 실제 CSS 바이트

| 표현 | 필수 CSS 링크 수 | 비압축 바이트 | gzip level 9 바이트 합계 |
|---|---:|---:|---:|
| 변경 전 | 41 | 665,335 | 142,004 |
| 변경 후 | 4 | 669,835 | 121,311 |
| 차이 | −37 | +4,500, 출처/해시 주석 | −20,693, 약 14.57% |

이는 파일 크기·압축 산출값과 HTML 링크 수다. **실제 브라우저 시간 절감 수치가 아니다.** 타임라인은 기존 **1,044,921B**, SHA-256 `fd15b3ef18213b9adc3bff87d523cc1c2ca907ca59163b646d55308c5d1666ad` 그대로다.

## 2. 커밋과 소스 식별

- 작업 전 fetch/pull한 실제 원격 HEAD: `2d35d2c58be8224012fa0df8f365df963a17e70e`. 사용자가 언급한 `8487b26` 이후 macOS 측정 문서만 추가한 커밋을 보존했다.
- 구현 커밋: `ee6faf9f4a05decb55b3e6dbe32841897294083b`.
- 구현 트리: `3b053608b11b669771a17fa4963f5770d9d08b5c`.
- 브라우저 명령은 이 커밋의 clean checkout에서 실행했다.
- npm/typecheck/static/timeline/pages는 커밋 전 작업 트리에서 실행했다. 당시 9개 변경 파일의 SHA-256과 구현 커밋의 바이트를 전부 대조했고 차이 0개다. 원본 로그의 HEAD/workingChanges를 사후 수정하지 않았다.
- R13, heading, A-9, compare, responsive, WP6 하네스와 원래 app/entry/컨퍼런스/CSS 등 보호 대상 16개 파일이 시작 커밋과 동일하다. 72px·0.01px·h1 계약과 수치 임계값을 수정하지 않았다.

## 3. 검증 명령과 실제 결과

필수 명령은 Linux/x64, **Node v24.22.2**에서 실행했다. PATH에 `/Applications/Docker.app/Contents/Resources/bin`도 포함했으며 canonical Node와 일치하여 Docker fallback은 필요하지 않았다. 설치 브라우저는 `/usr/bin/chromium`, CLI 버전 **156.0.8078.79**다. CDP 세션이 시작되지 않았으므로 실행 브라우저 버전을 CDP로 확인한 결과는 없다.

| 명령 | 실제 결과 | exit |
|---|---|---:|
| `node scripts/build-site-styles.mjs --check` | 41개 원본, 생성 CSS 2개 바이트 일치 | 0 |
| `npm test -- --test-concurrency=4` | **3,464/3,464 pass, fail 0, skip 0, complete:true**, 235.147초 | 0 |
| `npm run typecheck` | `tsc --noEmit` 통과 | 0 |
| `npm run verify:static` | **files 966, scripts 218, references 971**, status ok | 0 |
| `node scripts/verify-conference-timeline.mjs --timeline dist/conference/timeline.json --sources docs/conference/source-segments.json --out build/a9/timeline-coverage.json` | **9,168/9,168**, 누락·추가·중복·원문/시각 변경 0 | 0 |
| `npm run verify:pages` | 기존 `Pages artifact file coverage changed` 실패 | 1 |
| `node scripts/verify-conference-data-browser.mjs --profile fast4g --encoding gzip --out build/a9/data-fast4g` | **실행 케이스 0**, Chrome CDP 시작 전 차단 | 1 |
| `node scripts/verify-conference-browser.mjs --out build/a9/conference-14` | 14개 대상 중 실제 실행 0 | 1 |
| `node scripts/verify-compare-shell-browser.mjs --out build/a9/compare` | route/viewport 실행 0, `status:ERROR` | 1 |
| `node docs/evidence/chart-h1-20261112/r10-browser-gates.mjs "$PWD" "$(git rev-parse HEAD)" build/a9/ui-gates` | responsive 4종목×11, WP6 30, chart-qa 12 모두 시작 차단. 6개 gate 프로세스 실행, 실제 케이스 각각 0 | 1 |

기존 통합 runner의 loopback candidate 서버와 소스/하네스 불변 검사는 유지됐고, 원격 배포 주소를 회귀 대상으로 사용하지 않았다. 브라우저 명령에는 `ATLAS_BROWSER_PATH=/usr/bin/chromium`을 지정했다. 단위/소스 검증 통과를 브라우저 회귀 통과로 대신하지 않는다.

보조 집중 실행은 boot/preload/style/touch **20/20**, 기존 standalone 패키징 **6/6** 통과였다. 전체 정규 Node npm 실행도 이 테스트들을 포함한다. 원본 출력은 아카이브에 있다.

### A-9 6개 뷰포트 실측 상태

| 뷰포트 | 첫 화면 준비 ms | timeline 요청 시작 ms | timeline 전송 ms | 이번 통과 여부 |
|---|---:|---:|---:|---|
| 390×844 | — | — | — | 미검증, 시작 전 차단 |
| 320×740 | — | — | — | 미검증, 시작 전 차단 |
| 768×1024 | — | — | — | 미검증, 시작 전 차단 |
| 1024×768 | — | — | — | 미검증, 시작 전 차단 |
| 1440×900 | — | — | — | 미검증, 시작 전 차단 |
| 1920×1080 | — | — | — | 미검증, 시작 전 차단 |

`—`는 0ms나 예산 통과를 의미하지 않는다. **측정된 뷰포트 0/6, 측정된 페이지 전환 0회**다. 이전 P1b의 4.5~4.9초를 새 결과로 재사용하지 않는다.

하네스 파일과 설정은 변경하지 않았다: 새 context, 캐시 비활성, download **1,012,500B/s**, upload **168,750B/s**, latency **165ms**, CPU **1**, gzip, ready **2,500ms**, 페이지 전환 **150ms**. 이번에는 CDP가 시작되지 않아 이 조건으로 페이지를 측정하는 단계까지 도달하지 못했다.

### 브라우저 실행 차단 근거

변경 전 390 기준 측정과 변경 후 전체 측정 모두 CDP 시작 전에 종료됐다. 원본 Chromium stderr:

```text
FATAL:chrome/browser/process_singleton_posix.cc:297
Check failed: . socket() failed: Operation not permitted (1)
```

하네스에는 `Timed out: Chrome CDP` 또는 `Chromium DevToolsActivePort`, WP6에는 `Chrome launch failed (SIGABRT)`로 기록됐다. 로컬 브라우저 실행을 위한 `require_escalated` 요청은 도구의 **자동 승인 정책이 거절**했다. 반환 사유는 `sandbox_approval:false`인 정책에서 권한 확장을 요청할 수 없다는 것이었다. 새 보안 완화 옵션을 추가하거나 다른 경로로 제한을 우회하지 않았다.

### verify:pages 기존 실패

현재도 `market-lab/app`의 커밋된 `index-ByyNTPeH.js`, `index-GpQviUwB.css`와 생성 예상 `index-C6TQnx3Q.js`, `index-DU37oAAf.css`가 불일치한다. 이전 P1b 보고서에서 시작 커밋 `339d5b5`에서도 확인한 동일 실패다. 이번 실행에서도 Vite는 성공했고 생성물 비교 단계가 exit 1이었다. 해당 생성물을 갱신하거나 검증을 완화하지 않았다.

## 4. 원본 증거

- [구조화 결과와 해시 인벤토리](../evidence/a9-20261112/manifest.json)
- [실제 원본 로그·보고서 아카이브](../evidence/a9-20261112/verification.tar.gz)

아카이브: **325,041B**, 원본 파일 **50개**, SHA-256 `24b06798d3465fbf59c5010001fee2a1794642c182f2861058196ff72652af1f`. TAP/브라우저 JSON/stderr는 실행에서 생성한 원본 바이트이며 요약을 원본 보고서로 재구성하지 않았다. 스크린샷은 브라우저가 시작되지 않아 0개다.

## 5. 남은 것과 추가 수단 1건

**추가 수단은 Chromium의 로컬 Unix 소켓 생성과 CDP 시작을 허용하는 Linux 실행 환경 한 가지다.** 그 환경에서 동일 구현 커밋·동일 원본 하네스·동일 Fast 4G 설정으로 6개 뷰포트와 요청된 브라우저 회귀를 다시 실행해야 한다. 실제 수치가 없으므로 다른 최적화가 더 필요한지 판단하지 않는다.

A-9 초기 로드와 페이지 전환, conference 14·compare·responsive 44·WP6 30·chart-qa 12는 이번 변경에서 아직 미검증이다. `verify:pages`의 기존 실패는 유지한다. main push/병합, 배포, force push, 유료 용량 생성, 계정·권한 변경은 하지 않았다. A-10과 사람 청취 검수는 이번 범위에 포함하지 않았다.
