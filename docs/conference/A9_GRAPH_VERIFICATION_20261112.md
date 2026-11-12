# A-9 정적 모듈 그래프 preload 후속 — 2026-11-12

컨퍼런스의 정적 모듈 폐포와 실제 timeline JSON을 HTML head에서 발견하도록 변경했다. **이번 회차는 단위·정적 검증만 수행했다. 브라우저 실행과 Chromium 승인 요청은 0회이며, 초기 준비 2,500ms·전환 150ms 통과를 아직 주장하지 않는다.** 사용자가 전달한 시작 커밋 `6108910`의 macOS 측정은 기능 6/6, ready 3,161.8–3,267.6ms, 초기 예산 0/6, 컨퍼런스 14/14였다. 이 수치는 이번 변경의 측정 결과가 아니다.

## 1. 바꾼 파일과 동작

| 파일 | 변경 |
|---|---|
| `dist/index.html` | 기존 conference 전용 hint 블록을 생성 결과로 교체. JSON fetch preload를 먼저 추가하고 timeline.js와 정적 폐포 전체를 modulepreload |
| `scripts/build-site-preloads.mjs` | 실제 entry/app/player URL 발견, 정적 import 폐포의 결정적 BFS 열거, HTML·manifest 생성과 `--check` |
| `scripts/module-references.mjs` | `includeDynamic:false` 선택지 추가. 기존 호출의 동적 import 포함 동작과 원본 위치 정보 보존 |
| `docs/conference/boot-preload-graph.json` | 정확한 URL, 원본 파일 크기·SHA-256, 원본 import 순서, edge, 생성기 해시와 JSON 해시 기록 |
| `tests/module-references-static.test.mjs` | 정적/동적 구별, import/re-export 순서, 문자열·주석·정규식·템플릿·escape와 원본 span 검사 5개 |
| `tests/site-preloads.test.mjs` | 결정성, 바이트·순서 보존, cycle/공유 모듈/query 식별, stale·경로 이탈·누락 검사 8개 |
| `tests/boot-preloads.test.mjs` | 실제 폐포와 JSON 속성, 타 라우트 추가 hint 0개, 중첩 경로와 커밋된 생성물 일치 검사 |
| `scripts/standalone-verification.mjs` | 오프라인 결과에 HTTP preload 생성 스크립트·링크가 남으면 실패하도록 검사 추가 |
| `tests/standalone-packaging.test.mjs` | 실제 standalone에 preload가 없음을 확인하고, preload를 넣은 손상 결과를 거절하는 검사 추가 |
| `docs/conference/A9_GRAPH_VERIFICATION_20261112.md` | 이 결과 보고서 |
| `docs/evidence/a9-graph-20261112/manifest.json` | 명령별 결과, 원본 로그 인벤토리, 보존 해시, 미측정 상태 |
| `docs/evidence/a9-graph-20261112/verification.tar.gz` | 실제 TAP·정적 검증 로그·독립 그래프 비교·해시 확인 자료 |

### 모듈 열거와 요청 예약

세 루트는 손으로 버전을 복사하지 않고 현재 HTML 및 import에서 찾는다: `./site-entry.js?v=1.37.8`, `./app.js?v=1.37.8`, `./conference/player.js?v=1.0.0`. 루트 순서와 각 파일의 원본 정적 import/re-export 순서에 따른 BFS 결과는 **55개 전체 URL, 53개 물리 파일, 81개 edge**다. Query/fragment를 포함한 모듈 URL 식별을 보존하므로 `price-axis.js`, `ohlc-data.js`의 버전 유무는 합치지 않는다. 그 밖의 동적 import 분기는 추가하지 않는다.

원본 그래프의 최대 최단 깊이는 6이다. 이번 변경은 원본 import 문장을 바꾸지 않고, 이 URL들을 같은 HTML 실행 단계에서 모두 예약해 이후 응답에서 의존성을 발견할 때까지 기다리는 RTT를 없애려는 것이다. 기존 공용 entry hint 1개를 유지하고 컨퍼런스에만 modulepreload 54개를 생성한다. `timeline.js`는 그 54개 안에서 가장 먼저 예약하며 중복하지 않는다.

`timeline.json`은 모듈 fan-out보다 앞서 `rel=preload`, `as=fetch`, `crossorigin=anonymous`, `fetchpriority=high`로 예약한다. 원래 플레이어의 `fetch(..., {cache:'no-cache'})`, 마운트와 ready 신호는 그대로다. Anonymous는 기존 fetch의 CORS/same-origin credentials에 맞춘 값이다. HTML preload 재사용 키는 URL·destination·mode·credentials를 포함한다. 실제 Chrome 157에서 캐시 비활성·no-cache 조건의 동일 전송 재사용 여부는 다음 실측에서 확인해야 한다. 근거: [HTML preload와 소비 규칙](https://html.spec.whatwg.org/multipage/links.html#link-type-preload), [potential-CORS request](https://html.spec.whatwg.org/multipage/urls-and-fetching.html#create-a-potential-cors-request).

HTML 파싱 중 이미 존재하는 공용 entry link의 절대 href를 기준으로 경로를 계산한다. 따라서 origin root, GitHub Pages project root, build-pages의 중첩 wrapper에서도 같은 리소스를 가리킨다. Node VM 검사 **3/3** 통과, 기존 다른 라우트·종목 URL **13종의 추가 링크 0개**다. Preload만으로 모듈을 실행하거나 플레이어를 마운트하지 않는다.

### 불변·결정성 확인

독립 esbuild 0.28.2 파서와 생성 결과의 URL 집합, BFS 순서, 각 import 순서·edge, 깊이, 파일 크기와 해시가 모두 일치했다. **차이 0개**다. `--check`는 leaf 파일 내용만 달라져도 해시를 통해 stale을 감지하며, 정적 edge·루트 버전·생성 HTML·manifest가 달라져도 실패한다. 생성 결과에 시간값은 없다.

시작 커밋 대비 제품 모듈 53개, 원본 CSS 41개, 브라우저/키 입력/창 helper·chart-qa 검증 파일 22개, 타임라인·독립 소스 인벤토리 2개, 합계 **118/118개가 바이트 동일**하다. `dist/`의 변경 파일은 `index.html` 하나다. R13·heading·compare·반응형·WP6·chart-qa 및 A-9 하네스를 수정하지 않았고, 72px·0.01px·h1 1개·150ms·2,500ms 계약은 유지했다.

## 2. 커밋과 트리

- 작업 전 fetch/pull로 확인한 HEAD: `6108910090a68bdbcf2f6eb0265a5da40d9a0159`.
- push 직전 추가된 원격 문서 커밋 `0abd8ff884bcff88545c68cc4b36515b9597f776`, `51358c36c8195e7535ae44d93b77902f58b60b8b`을 발견해 보존했다. 변경은 macOS A-9 측정 보고·요약과 체크리스트·요구사항 인덱스 4개 문서뿐이며, 4개 모두 원격 바이트와 일치한다.
- 최종 구현 커밋: `1e0d0718ed2e31c34d87f426c8c64c22e42bf407`. 부모는 최신 원격 `51358c3`이다.
- 최종 구현 트리: `a37587c4b740b22643df8d5c696aa220ee13dec4`.
- 실제 단위·정적 검증 커밋: `cedf65e40c313bd4a685301f71d5c80af3e79de0`, 트리 `20ef1fb4a026d2bb59bd01fcdc323586f8f68620`. 아래 8개 명령은 이 clean checkout에서 실행했으며 원본 receipt에 `workingChanges:""`가 기록돼 있다. 이 커밋의 9개 구현 파일과 최종 구현의 파일 바이트는 **9/9 동일**하다. 두 커밋 사이 `dist/`, `scripts/`, `tests/`, `apps/`, `packages/` 차이는 0개다.
- 검증 후 원격 문서만 보존해 부모를 갱신했다. 원본 로그의 커밋 SHA나 결과를 사후 변경하지 않았다. 이 보고서와 증거는 최종 구현의 후속 문서 커밋으로 남기며 제품·생성기·검증 코드를 추가 변경하지 않는다.

## 3. 실행 명령과 실제 결과

Linux/x64 **Node v24.22.2**를 PATH 앞에 두었다. `/Applications/Docker.app/Contents/Resources/bin`도 PATH에 포함했으며 frozen replay의 canonical runtime과 일치하므로 Docker fallback은 필요하지 않았다. `npm test`의 concurrency 인자는 동시 실행 수만 4로 제한하며 테스트를 제외하지 않는다.

| 실행 명령 | 실제 결과 | exit |
|---|---|---:|
| `node scripts/build-site-styles.mjs --check` | 원본 CSS 41개, 생성 CSS 2개 일치 | 0 |
| `node scripts/build-site-preloads.mjs --check` | 55 URL / 53 파일 / 81 edge / conference module hint 54 + shared 1, stale 없음 | 0 |
| `node --test --test-reporter=tap tests/boot-preloads.test.mjs tests/site-preloads.test.mjs tests/module-references-static.test.mjs tests/site-styles.test.mjs` | **23/23 pass, fail 0, skip 0** | 0 |
| `npm test -- --test-concurrency=4` | **3,479/3,479 pass, fail 0, skip 0, complete:true**, 명령 전체 234.482초 | 0 |
| `npm run typecheck` | `tsc --noEmit` 통과 | 0 |
| `npm run verify:static` | files **966**, scripts **218**, references **971**, status ok | 0 |
| `node scripts/verify-conference-timeline.mjs --timeline dist/conference/timeline.json --sources docs/conference/source-segments.json --out build/a9-graph/timeline-coverage.json` | **9,168/9,168**, 누락·추가·중복·원문/시각 변경 **0** | 0 |
| `npm run verify:pages` | 기존 `Pages artifact file coverage changed` 실패 | 1 |

전체 npm에는 실제 standalone을 두 번 생성해 바이트 동일성과 parser/linker를 확인하는 기존 패키징 검사도 포함된다. 원본 **41개 style 블록**의 바이트·순서·1회 포함 계약을 유지하고, HTTP preload 링크와 생성 스크립트는 **0개**임을 검사한다. 브라우저를 띄우지 않는 Node 검증이다.

`verify:pages`는 Vite 빌드 후 커밋된 `index-ByyNTPeH.js` / `index-GpQviUwB.css`와 생성 예상 `index-C6TQnx3Q.js` / `index-DU37oAAf.css`의 목록이 달라 exit 1이었다. 시작 커밋 `339d5b5`부터 알려진 실패 상태를 고치거나 생성물을 갱신하지 않았다.

### 전송 크기 산출과 시작 시각 예상

다음은 A-9 하네스와 같은 Node `gzipSync(...,{level:9})`의 파일 크기 산출이다. **브라우저 전송·시간 측정은 아니다.** Node zlib 버전은 `1.3.2.1-motley-285e94b`이며 HTTP 헤더 크기는 포함하지 않는다.

| 대상 | 시작 HEAD gzip B | 변경 후 gzip B | 차이 |
|---|---:|---:|---:|
| index.html | 15,020 | 15,689 | **+669** |
| 모듈 55 URL의 본문 합계 | 253,879 | 253,879 | **0** |
| timeline.json | 187,031 | 187,031 | **0** |

index.html 원본 크기는 **54,648 → 57,317B, +2,669B**다. JSON 원본은 **1,044,921B**로 동일하다. 실제 읽을 모듈 URL 집합과 내용이 그대로여서 새 애플리케이션 모듈 본문을 더 보내는 설계는 아니다. JSON preload가 소비되지 않고 중복 전송되면 이 전제는 깨지므로 다음 측정에서 확인한다. 현재는 번들링 없이도 생성 힌트의 gzip 증분이 669B에 그쳐 원본 모듈 바이트를 유지하는 방식을 선택했다.

**예상하는 timeline.json Resource Timing startTime은 약 200ms, 예상 범위 175–400ms다. 실측값이나 보장값은 아니다.** 사용자가 준 HTML/첫 리소스 발견 시각 약 175ms가 기준이다. JSON hint가 CSS·모듈 응답을 기다리지 않는 인라인 head 스크립트의 첫 링크가 되므로, 기존 2,871ms의 의존성 발견 계단을 거칠 이유가 사라진다. 추가 669B는 지정 다운로드 속도 1,012,500B/s에서 순수 전송 약 **0.66ms**이며, 나머지는 HTML 수신·파싱·브라우저 스케줄링 여유로 잡았다. 이는 기존 시작보다 약 **2.47–2.70초 앞당겨질 것이라는 추정**이다.

이 추정은 requestStart·responseEnd 또는 painted ready 완료 시각을 뜻하지 않는다. 동시 연결 제한과 자원 우선순위, 나머지 fetch·실행·렌더링 비용은 남는다. 따라서 ready 2,500ms와 페이지 전환 150ms 수용 여부는 아직 미측정이다. 정적 폐포를 HTML에서 미리 선언해 의존성 발견 RTT를 줄이는 동작의 근거는 [HTML modulepreload 규칙](https://html.spec.whatwg.org/multipage/links.html#link-type-modulepreload)이다.

## 4. 남은 것과 다음 조치 1가지

**다음 조치는 사용자의 macOS에서 동일 하네스로 한 차례 재측정하는 것이다.** 새 HEAD를 fetch/pull한 뒤 `node scripts/verify-conference-data-browser.mjs --profile fast4g --encoding gzip`으로 6개 뷰포트 ready·timeline 시작/전송·기능·150ms 전환을 확인하고, 약속한 컨퍼런스 14·compare·반응형 44·WP6 30·chart-qa 12 회귀를 같은 회차에서 확인한다. 브라우저 하네스와 Fast 4G/캐시/CPU 조건은 변경하지 않는다.

기존 report의 timeline 요약은 첫 일치 항목을 택하므로, 각 case의 전체 `resources` 중 `timeline.json` 항목과 서버 `report.requests`도 함께 봐야 한다. 기대하는 실제 HTTP 요청은 context당 1회, 6개 context 합계 **6회**다. preload 이후 두 번째 전체 전송이 없어야 한다. 소비 단계에 transferSize 0의 추가 timing entry가 생기는 경우와 실제 중복 HTTP 요청은 구별한다. 이 확인은 하네스 assertion이나 임계값을 변경하지 않고 기존 report를 읽는 작업이다.

현재 미검증: 변경 후 브라우저 6뷰포트 A-9 수치와 요청 재사용, 컨퍼런스 14·compare·반응형 44·WP6 30·chart-qa 12의 실제 브라우저 결과. `verify:pages` 기존 실패는 유지한다. A-10 1시간 메모리와 사람 청취 검수는 이번 범위가 아니다.

작업·커밋·push 대상은 `fix/tradingview-responsive-20261110`뿐이다. main push/병합, 배포, force push, 유료 용량 생성, 계정·권한 변경은 수행하지 않았다.

원본 증거: [manifest](../evidence/a9-graph-20261112/manifest.json), [verification.tar.gz](../evidence/a9-graph-20261112/verification.tar.gz). 아카이브 24개 파일, **189,122B**, SHA-256 `a36ebfdab6259aba0801ff6a776285b9f9eca02890e6907c511f803280ccb1d1`.
