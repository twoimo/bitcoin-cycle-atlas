# P2A0-6ffbdda — 고정 버전 차트 엔진 스파이크

상태: **임시 페이지·Datafeed·측정기 구현 완료, 네이티브 수용은 대기**. P2a-0을 통과로 판정하지 않는다. P1은 기존 Mac `67125bd`의 28/28·56/56·8/8·`qualifiesP1Verification:true`로 닫힌 상태를 유지한다. P2 차트 크롬·P3·P2b·배포는 시작하지 않았다.

## 후보와 범위

| 항목 | 값 |
|---|---|
| 시작 원격 | `6ffbdda618ad67df6aa47d62bf52f8ce7fc159ba` — 수정 전 원격 재조회·fast-forward |
| 구현 | `cefc5686d272b01fe7b956eb6d145ee538528804` |
| 검증기 및 실제 실행 후보 | `b0cf9853728ade2b560721e8df9e193b909afb1e` — 작업 트리 변경 0 |
| 브랜치 | `fix/tradingview-responsive-20261110`만 갱신 |
| 패키지 | UI/core 모두 정확히 `0.6.16`, 별도 lockfile, esbuild `0.28.2` |
| 임시 페이지 | `spikes/funnest-p2a0/` → `build/p2a0/site/`; 제품 진입점에는 미연결 |
| 원본 데이터 | `dist/data/btc-volume.json`, Bitstamp BTC-USD, 완료 일봉 5,560개, 2011-08-18–2026-11-06 UTC |
| 데이터 보존 | 초→밀리초 변환만 수행. OHLCV 값·33개 원본 0거래량 행 보존, 보간 0, 실시간 연결 없음 |

Datafeed는 기존 `parseVolumeSnapshot` 검증을 그대로 사용하고, 로드한 바이트의 SHA-256을 빌드 시 원본과 대조한다. `getBars`의 `countBack` 우선순위와 inclusive `to`, 이전 구간 페이지 요청을 정확한 패키지 동작에 맞췄다. 검색은 보유한 BTC 한 종목의 실제 메타만 반환한다. 종가로 OHLC를 합성하거나 가상의 가격·실시간 연결을 만들지 않는다.

## 번들 측정

gzip level 9, Brotli quality 11. 다음은 생성 파일의 크기이며 전체 브라우저 전송량은 아니다. CSS·데이터·폰트는 별도이고 실제 폰트 subset 요청은 브라우저 재검증 대상이다.

| 산출물 | 원본 B | gzip B | Brotli B |
|---|---:|---:|---:|
| UI/core만 번들링한 `createTradingChart` | 220,669 | 68,385 | 59,164 |
| 실제 임시 페이지 JS — UI/core + Datafeed + 관측 코드 | **234,611** | **73,721** | **63,642** |
| 원본 BTC OHLCV JSON | 864,273 | 222,328 | 159,069 |

실제 JS SHA-256: `1266798b6412f78372f4a00a2b40ec9683dd78bafa3c56f559609906742af93d`.
원본 BTC JSON SHA-256: `a602ba904b78284138684377ea559598173063ee435350ce281de430150a9993`.

전체 파일·의존 입력·압축 크기·해시는 [bundle-report.json.gz](bundle-report.json.gz)에 있다. 빌드는 출력 목록의 누락·낡은 추가 파일까지 확인한다. `--check`는 재생성한 모든 바이트와 목록이 같은지 검사한다. `dist`, `apps`, `packages`, 루트 의존성 및 제품 빌드 진입점은 기준 커밋과 동일하므로 **제품 경로에 추가된 스파이크 요청 0개·자산 0B**다. 이 사실을 A-9 시간 차이 0ms로 해석하지 않는다.

## 네이티브 실행 결과

연결 브라우저는 originating browser context가 없어 초기화되지 않았다. 로컬 Chromium은 `process_singleton_posix.cc`의 `socket() failed: Operation not permitted (1)`로 `SIGABRT` 종료했다. 네이티브 타깃에 도달한 케이스가 없다.

| 검사 | 필수 | 시도 | 통과 | 결과 |
|---|---:|---:|---:|---|
| 임시 페이지 Fast 4G 초기 페인트 | 6 | **0** | **0** | 시간 `null`, 미검증 |
| 캔들·로그·%·MA·추세선·검색·한국식 색 | 7 | **0** | **0** | 실제 입력 미검증 |
| 키보드 — 320/390/768/1440 | 4 | **0** | **0** | 크기·포커스·대비 미측정 |
| 터치 pan/pinch — 320/390 | 4 | **0** | **0** | 터치 미측정 |

`sourceStable:true`, `complete:false`, `qualifiesP2a0NativeVerification:false`. 스크린샷 0, 가로 오버플로 실측 `null`. 제품 케이스 실패 0은 제품 통과를 뜻하지 않는다. 원본: [native-b0cf985.json.gz](native-b0cf985.json.gz).

검증기는 CDP의 실제 포인터·키·터치 입력만 사용한다. 읽기 전용 observer에 제품 상태 변경 API를 노출하지 않는다. 초기 페인트는 실제 BTC 일봉·원본 범위/개수/OHLCV·보이는 가격 pane의 픽셀·폰트 완료 뒤 두 프레임을 요구한다. 검색은 같은 BTC를 선택해도 `searchSymbols`·`resolveSymbol`·`getBars` 증가와 새 bars 이벤트를 확인한다. 색 검사는 상승/하락 원본 캔들에 실제 포인터를 올려 OHLCV·범례 클래스·가격 pane 캔들 열의 빨강/파랑 픽셀을 대조하며 거래량·축 픽셀은 제외한다.

### 기존 A-9 영향

기존 `scripts/verify-conference-data-browser.mjs`를 수정 없이 기준의 별도 깨끗한 worktree와 후보의 깨끗한 작업 트리에서 실행했다. 첫 기준 준비 명령은 `build/` 부모가 없어 케이스 시작 전에 종료했고, 부모만 만든 뒤 아래 원본 영수증을 남긴 실행을 진행했다. 게이트·시간 제한은 수정하지 않았다.

| 대상 | 필수 | 시도 | 통과 | 초기 로드 | 페이지 전환 |
|---|---:|---:|---:|---|---|
| 기준 `6ffbdda` | 6 | **0** | **0** | `null` | `null` |
| 후보 `b0cf985` | 6 | **0** | **0** | `null` | `null` |

두 실행 모두 Chromium socket EPERM 뒤 기존 게이트의 `Chrome CDP` 타임아웃으로 끝났다. **A-9 시간 차이는 미측정**이다. 1,069개 입력 파일 해시는 두 실행에서 모두 같았다. 이전 Mac A-9 시간을 이번 후보의 측정치로 재사용하지 않았다.

설정은 기존과 동일하다: Fast 4G RTT 165ms, download 1,012,500B/s, upload 168,750B/s, CPU 1×, cache off, gzip. 초기 페인트 예산 **2,500ms**, 전환 **150ms** 유지. 크기는 390×844, 320×740, 768×1024, 1024×768, 1440×900, 1920×1080이다.

원본: [기준 A-9](a9-baseline-6ffbdda.json.gz), [후보 A-9](a9-candidate-b0cf985.json.gz), [기준 stderr](a9-baseline-chrome.stderr.log), [후보 stderr](a9-candidate-chrome.stderr.log).

## 접근성 소스 검토와 통합 결정

정확한 `0.6.16` 소스의 `.fnc-btn`·`.fnc-symbol`은 36px, chip 및 모바일 컨트롤은 32px을 선언한다. 검색 모달에는 입력 포커스·방향키·Enter·Escape가 있지만 Tab 가두기와 닫기 후 트리거 포커스 복귀를 구현한 경로가 없다. **정적 소스 위험이며 네이티브 계산 크기·포커스 통과가 아니다.** 임시 wrapper는 패키지 컨트롤을 덮어쓰지 않는다. 44px·2px 포커스·텍스트 4.5·아이콘 3.0 계약을 유지하며, 다음 native 실행에서 미달은 실패로 남는다.

예측 밴드·역사 사건·리플레이·compare는 모두 **하이브리드**로 결정했다. 정확한 API와 Atlas 계약을 대조한 통합 결정이며 네이티브 패리티 통과 선언이 아니다. `0.6.16`에는 `addOverlay`, 기본 replay, 종목 compare가 실제로 있다. 예측의 Y 도메인, 사건의 키보드/출처, 고정 예측·시점 증거가 있는 replay, 반감기/저점/고점 정렬 compare까지 대체한다고 볼 근거가 없어 해당 Atlas 화면의 기존 엔진을 유지한다. 기능별 근거와 고정 소스 링크는 [요구사항 §3.3.2](../../requirements/REQ_UI_RENEWAL_FUNNEST_20261112.md#332-스파이크-게이트-p2a-0)에 있다.

## 실행 가능한 재검증

Node 24 이상과 로컬 Chrome을 사용한다. 출력 디렉터리는 매 실행 새로운 이름을 사용하며 기존 영수증을 덮어쓰지 않는다.

```sh
npm ci --prefix spikes/funnest-p2a0 --ignore-scripts --no-audit --no-fund
node scripts/build-funnest-p2a0.mjs
node scripts/build-funnest-p2a0.mjs --check
node --test tests/funnest-p2a0-datafeed.test.mjs tests/funnest-p2a0-browser.test.mjs
node scripts/verify-funnest-p2a0-browser.mjs --out build/p2a0-mac-b0cf985
node scripts/verify-conference-data-browser.mjs --profile fast4g --encoding gzip --out build/p2a0-a9-mac-b0cf985
```

Mac Chrome 기본 경로는 `/Applications/Google Chrome.app/Contents/MacOS/Google Chrome`이다. 스파이크 검증기는 `--browser PATH`, 기존 A-9는 `ATLAS_BROWSER_PATH=PATH`로 다른 설치 위치를 지정한다. A-9 기준 비교는 `6ffbdda`를 별도 detached worktree에 체크아웃하고 `mkdir -p build` 뒤 같은 A-9 명령을 실행한다. 기존 게이트를 바꾸거나 고정 네 폭·여섯 크기 표본을 줄이지 않는다.

사람이 임시 페이지를 열어 볼 때도 같은 gzip 서버를 쓸 수 있다:

```sh
node --input-type=module -e "import {createP2a0StaticServer} from './scripts/verify-funnest-p2a0-browser.mjs'; createP2a0StaticServer('build/p2a0/site').listen(8905,'127.0.0.1')"
```

주소 `http://127.0.0.1:8905/`. 실제 검사 전 자동화 입력 결과·스크린샷·실측 시간을 보존해야 한다. 현재의 0시도를 통과로 바꾸지 않는다. 패키지 접근성 실패가 나오면 그대로 기록하고 P2 차트 크롬 작업을 시작하지 않는다.

## 보존과 출처

- 집중 검사 **24/24**, 실패/skip 0: [TAP](focused-tests.tap). 이는 어댑터·HTTP·검증 프로토콜 검증이며 브라우저 증거가 아니다.
- 실제 생성 사이트 `/`, JS, favicon, 데이터, NOTICE **5/5 HTTP 200**, gzip 복원 바이트 동일: [HTTP 영수증](http-b0cf985.json).
- 제품 정적 검사: **1,065파일·220스크립트·753참조**, 통과. P1/P0를 재개하거나 새 수용 판정으로 덮어쓰지 않았다.
- 보호 4파일·`dist/price-axis.js`·`minRight=64`, 기존 엔진·P0/P1/A-9는 동일: [18파일 보존 해시](source-preservation.json).
- UI/core tarball 및 설치 JS 비교: [패키지 감사](upstream-package-audit.json). npm provenance는 고정 upstream `39cb29ae250448d520384c12de555b1c00727883`·tag `v0.6.16`을 가리키며 tarball SHA-512가 일치한다. [디코딩한 요약](npm-provenance-summary.json), [원본 attestation](npm-attestations.json.gz). 별도 암호학적 서명 검증을 했다고 주장하지 않는다.
- Apache LICENSE·NOTICE, 내장 Preact 11.2.0 MIT, Pretendard OFL을 보존했다. 제품 화면의 패키지 브랜드 배지는 끄고 법적 고지는 생성 페이지에서 연결했다. 유료 도구는 추가하지 않았다.

전체 수치와 각 원본/압축 파일 해시: [summary.json](summary.json).
