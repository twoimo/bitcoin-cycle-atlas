# R12 — compare-320 h1 고정 좌표 보정 (2026-11-12 KST)

> Linux 최종 검사 완료. 최초 WP6 29/30과 별도 전체 재실행 30/30을 구분해 보존한다. 제품 소스와 기존 하네스의 제한·판정 기준은 재실행 사이에 변경하지 않았다.

## 1. 범위·소스·변경 파일

대상은 `twoimo/bitcoin-cycle-atlas`의 `fix/tradingview-responsive-20261110` 브랜치다. 요청 기준은 `ce8df9262b13a657823752408481f742f7a31701`이며, 실제 검증 체크아웃은 **`4cc98d8195707ab69e534236bf2ed7fa22819327`**이다. 작업 중 원격에 추가된 문서 커밋 6개(`dcbc0ff`까지)를 보존한 뒤 변경을 이어 붙였다. 재기준 전 `2666175`와 최종 `4cc98d8`의 `dist/`, `scripts/`, `tests/` 바이트는 같다.

원격 소스 커밋은 **`a6bf961b3e62af45e57b6b74662158626cfa7fa2`**다. GitHub 커넥터의 커밋 생성·비강제 ref 갱신으로 전달했으며, 작성자·시각 메타데이터가 달라 검사 커밋과 SHA가 다르다. **두 커밋의 전체 Git tree는 `0e79b0fa76d7e50f8187fc9944dec10493438cc1`로 일치한다.** [소스 전달 기록](evidence/r12-heading-20261112/source-publication.json)에 이 대응을 보존하고, 검사한 원래 로컬 커밋은 [Git bundle](evidence/r12-heading-20261112/tested-source.bundle)에 보존한다. 원본 검증 영수증의 `4cc98d8`을 원격 SHA로 다시 쓰지 않는다.

| 검사 체크아웃의 커밋 | 내용 |
| --- | --- |
| `c0efe13` | 조상 레이아웃 변화에 따른 h1 재배치, 소유권·정리 회귀 검사, 브라우저 검증 확장 |
| `4cc98d8` | compare 공지 높이 예약을 분리하고 기존 출처 푸터의 문서 스크롤 보존 |
| 이 문서를 추가한 커밋 | 보고서와 실제 검증 영수증만 보존 |

제품·검증 변경은 다음 **6개 파일**이다. 기존 53개, 반응형 44개, WP6 30개, chart-qa 12개 하네스와 수용 기준은 변경하지 않았다.

| 파일 | 변경 목적 |
| --- | --- |
| `dist/ui/page-description.js` | anchor부터 문서 루트까지 조상의 border-box 변화 관찰, 한 프레임으로 재배치 통합, 재부모화·해제 처리 |
| `dist/btc-refresh-status.js` | compare 전용 `--btc-compare-notice-height` 측정·갱신·정리 |
| `dist/atlas-shell.css` | compare의 공지 높이를 차트 할당 높이에서 차감; 데스크톱 h1·종목명 글리프 간격 확보 |
| `scripts/verify-page-heading-browser.mjs` | 기존 15개 유지, 390 및 conference 9개 추가, 조상 높이 변경·복원 2개 추가 |
| `tests/page-description.test.mjs` | 조상 resize·재부모화·rAF 통합·conference 전환·destroy 회귀 검사 |
| `tests/ethereum-btc-refresh-status.test.mjs` | compare 공지 53→45px, idle·비차트 0px, 기존 outlook 변수·노드·retry 정리 보존 |

**제품 수정 반영:** [`a6bf961b3e62af45e57b6b74662158626cfa7fa2`](https://github.com/twoimo/bitcoin-cycle-atlas/commit/a6bf961b3e62af45e57b6b74662158626cfa7fa2). 보고서와 증거는 같은 브랜치의 후속 문서 커밋으로 보존한다. main 직접 push·병합, 배포, 유료 용량 생성, 계정·권한 변경은 수행하지 않았다.

## 2. 원인과 Linux/macOS 차이에 대한 판정

### 고정 h1의 좌표 무효화가 빠졌다

기존 h1 래퍼는 `position:fixed`이고, compare 좌표는 `.lab-toolbar`의 현재 사각형에서 `left = anchor.left - 76`, `top = anchor.top + (anchor.height - 14) / 2`, `width = 68`로 계산한다. 그러나 ResizeObserver는 툴바와 anchor만 관찰했다. 조상의 높이가 바뀌면서 두 요소가 **크기는 그대로인 채 이동**하면 관찰 콜백이 발생하지 않아 이전 좌표가 남았다. 기존 document scroll 캡처와 window resize 리스너는 이러한 레이아웃 변화 자체를 보장하지 않는다.

이번 Linux 대조 실행에서도 요청에 제시된 수치가 그대로 재현되었다. `ce8df92`의 compare-320은 툴바가 `top 852 / bottom 900`으로 돌아온 뒤에도 h1이 `(48, 922.5)–(116, 936.5)`에 남았다. 또한 stage를 72px 줄이는 독립 트리거에서는 툴바·anchor의 폭과 높이가 변하지 않고 top만 −72px 이동했지만, 이전 h1은 **0px** 이동했다. 최종 소스의 h1은 **−72px** 이동했고 오차는 **0px**였다.

### 늦은 갱신 공지가 셸 자체를 늘리는 경로도 있었다

compare에서도 BTC 갱신 실패 공지가 정상 문서 흐름에 추가되지만, 기존 `--btc-refresh-height`는 outlook에서만 예약됐다. compare 차트는 공지 높이를 빼지 않은 채 원래 높이를 유지했다. 통제된 동일 상태에서 전화기 공지 53px는 stage 하단을 **953px**, 데스크톱 공지 45px는 **945px**로 밀었다. 조상 관찰만 추가하면 h1이 잘못 밀려난 툴바를 따라갈 수 있으므로, 이 할당 높이도 함께 수정했다.

Linux 15/15와 macOS 14/15는 서로 다른 ResizeObserver 규칙의 증거가 아니다. 이 결함은 공지 등장·해제, 초기 레이아웃 완성, 폰트 배치가 h1 좌표 계산보다 먼저 또는 나중에 끝나는 실행 순서에 영향을 받는다. **Linux에서도 동일 위치 결함과 53px 셸 팽창을 재현했으므로 macOS 전용 결함으로 분류하지 않는다.** 다만 사용자의 macOS 실행을 직접 관찰하지 않았으므로 그 실행의 브라우저 버전·폰트·네트워크 응답 중 어떤 요인이 순서를 바꿨는지는 확정하지 않는다.

통제 A/B는 실제 `mountBtcRefreshStatus` 컴포넌트에 고정된 실패 상태를 제공한 진단이다. 실제 외부 제공자의 장애를 입증하는 실행은 아니다. 양쪽 소스의 렌더 폰트 식별자는 320·390·1440 모두 같았고, 검사 전후 소스 해시도 같았다. 근거: [통제 A/B 원본](evidence/r12-heading-20261112/controlled-notice-ab/report.json.gz).

## 3. 최종 처리와 보존한 동작

`mountPageDescription`은 현재 anchor부터 툴바·stage·workspace·body·documentElement까지의 조상 및 실제 문서 스크롤 소유자를 중복 없이 관찰한다. `border-box` 변화는 기존 `requestAnimationFrame` 예약 하나로 모아 현재 사각형을 다시 읽는다. 같은 툴바가 다른 부모로 이동하면 관찰 대상을 교체하고 기존 h1 래퍼를 바로 다음 형제로 옮긴다. 동기 `sync()`가 실행돼도 이미 예약한 프레임의 취소 핸들을 잃지 않는다. 영구 폴링은 추가하지 않았다.

h1을 툴바 내부로 옮기거나 복제하지 않았다. 차트·compare의 기존 `.atlas-page-intro`가 `.atlas-canvas-heading` 바로 다음 형제로 남으며, conference는 기존 대시보드 헤더 소유권을 사용한다. 대시보드 전환에서는 fixed 스타일과 관찰을 해제하고, destroy에서는 관찰·리스너·예약 프레임을 정리한다.

공지 높이는 compare 전용 변수 **`--btc-compare-notice-height`**로 분리했다. 보이는 compare 공지의 실제 높이를 예약하고, 숨김·idle·다른 페이지에서는 0px가 된다. 공지 자체의 ResizeObserver도 다시 측정한다. CSS는 compare에만 `#outlook-view`의 높이를 `calc(100% - var(--btc-compare-notice-height, 0px))`로 설정한다. 기존 `--btc-refresh-height`의 outlook 전용 의미와 이를 사용하는 모바일 메뉴 위치는 보존했다.

`#main`의 정상 문서 흐름과 원래 출처 푸터를 유지했다. 통제 A/B에서 최종 body scrollHeight는 전화기 **1046px**, 데스크톱 **1009px**였으며, 푸터 높이는 원본과 같았다. 문서 스크롤 끝에서 출처 글자·링크·버튼이 모두 뷰포트 안에 있고, 원래 오프셋으로 복원됨을 확인했다. 차트 stage가 900px에서 끝나는 것과 출처 푸터를 보기 위한 문서 스크롤은 서로 다른 조건이다.

별도로 기존 1440px 매트릭스에서 시스템 폰트의 h1·종목명 글리프 겹침이 드러나, 데스크톱 심볼 버튼의 위 패딩을 16→19px로 조정했다. 기존 36px 클릭 영역과 가로 예산은 유지했다. h1 크기나 통과 허용치는 줄이지 않았다.

## 4. 실제 검증

실행 환경: **Linux x64, Node 24.22.2, HeadlessChrome 157.0.8103.38**. 서로 다른 검사군은 순차 실행한다. 아래 수치는 각각의 원본 영수증을 따른다.

| 검사 | 실제 결과 | 상태·근거 |
| --- | --- | --- |
| h1 최초 실행, 기존 320·768·1440 × 5종 | **15/15**, 실패 0 | 최종 소스 `4cc98d8` |
| h1 추가 매트릭스 | **9/9**, 실패 0 | 390 × 5종 + conference 320·390·768·1440 |
| stage −72px·복원 | **2/2**, 실패 0 | compare 320·390; 툴바·anchor 자체 크기 불변 |
| h1 반복 실행 | **15/15 + 추가 9/9 + 조상 변경 2/2**, 실패 0 | 원본·추가·조상 변경 결과 각각 기록 |
| 기존 전체 브라우저 | **53/53**, 실패 0, exit 0 | 원본 53개 전체 완료; 867,928ms |
| 반응형 | **44/44**, 실패 0 | BTC·ETH·MSTR·BMNR 각 11개 |
| WP6 | 최초 **29/30**; 별도 전체 재실행 **30/30**, 실패 0·exit 0 | 동일 소스·하네스로 별도 전체 30개 재실행; 결과 합산 금지 |
| chart-qa | **12/12**, 실패 0·exit 0 | 원래 하네스·수용 기준 유지 |
| `npm test` | **3,428/3,428**, fail 0·skipped 0·`complete:true`·batches 1 | `ATLAS_TEST_TOTAL`의 tests/pass/fail/skipped/complete/batches |
| 타입 검사 | **통과**, exit 0 | 실제 종료 코드 |
| 정적 검사 | **통과**, 963 files·218 scripts·1,007 references·exit 0 | 실제 파일·스크립트·참조 수와 종료 코드 |
| 관련 단위 검사 | **24/24**, 실패·skip 0 | page-heading 9 + refresh notice 8 + pending chart reflow 7; 재기준 전 동일 소스 |
| 통제 notice A/B | **6/6**, stage 대조 **4/4** | 원본은 결함 재현 여부를 확인하는 대조군 |

최종 53개 실행의 10× 재생 평균 간격은 **122.4625ms**로, 기존 허용 범위 **85–130ms** 안에 있었다. 중간 실행의 결과를 이어 붙이지 않은 완결된 53개 영수증이다. 근거: [최종 전체 브라우저 원본](evidence/r12-heading-20261112/native-53/report.json.gz).

최초 h1 매트릭스의 실제 좌표:

| 화면 | 툴바 top–bottom | h1 left/top/right/bottom | h1 DOM/표시 개수 | 가로 overflow |
| --- | --- | --- | --- | --- |
| compare 320×900 | 852–900 | 48 / 869.5 / 116 / 883.5 | 1 / 1 | 0 |
| compare 390×900 | 852–900 | 48 / 869.5 / 116 / 883.5 | 1 / 1 | 0 |
| compare 768×900 | 0–48 | 56 / 17 / 124 / 31 | 1 / 1 | 0 |
| compare 1440×900 | 0–38 | 56 / 12 / 124 / 26 | 1 / 1 | 0 |
| conference 320×900 | 0–52 | 8 / 16.5 / 95.90625 / 34.5 | 1 / 1 | 0 |
| conference 390×900 | 0–52 | 8 / 16.5 / 95.90625 / 34.5 | 1 / 1 | 0 |
| conference 768×900 | 0–48 | 80 / 14.5 / 155.390625 / 32.5 | 1 / 1 | 0 |
| conference 1440×900 | 0–48 | 228 / 14.5 / 303.390625 / 32.5 | 1 / 1 | 0 |

위 행은 h1 박스와 실제 글리프 모두 뷰포트 안이라는 조건도 통과했다. conference의 툴바 열은 해당 페이지의 원래 대시보드 헤더를 뜻한다.

### 재현 명령

기록된 검사는 제품 소스 `4cc98d8`의 깨끗한 체크아웃에서 실행했다. 공개 원격 소스 `a6bf961b3e62af45e57b6b74662158626cfa7fa2`도 전체 Git tree가 정확히 같으므로, 그 커밋의 깨끗한 별도 체크아웃에서 아래 명령으로 재현할 수 있다. R10의 expected-source 인자는 실제로 체크아웃한 현재 HEAD를 읽는다. 새 재실행 영수증과 원래 `4cc98d8` 영수증은 각각의 SHA를 유지한다.

macOS에서는 다음 PATH를 포함해야 frozen 배치의 Docker를 찾을 수 있다. 이번 Linux 실행은 고정 기준과 같은 Node 24.22.2 linux/x64를 직접 사용하므로 frozen 파일도 같은 네이티브 런타임에서 실행한다. 수치 허용치나 저장된 출력은 변경하지 않았다.

```bash
export PATH="/Applications/Docker.app/Contents/Resources/bin:$PATH"
node scripts/verify-page-heading-browser.mjs --out build/page-heading-browser
ETH_BROWSER_IMAGE_LOG_MODE=failures-only ATLAS_BROWSER_OUT=build/r12-regressions/native-53 node scripts/verify-native-browser-suite.mjs
node docs/evidence/chart-h1-20261112/r10-browser-gates.mjs "$PWD" "$(git rev-parse HEAD)" build/r12-regressions/r10
npm test -- --test-concurrency=4
node scripts/verify-page-heading-browser.mjs --out build/r12-final/heading-repeat
npm run typecheck
npm run verify:static
```

Linux 브라우저 경로는 실제 실행 영수증의 `ATLAS_BROWSER_PATH`를 사용했다. 각 검사 명령·시각·로그·종료 코드·소스 해시는 [전체 실행 영수증](evidence/r12-heading-20261112/executions/full-run.json.gz), 원본 보고서는 [증거 요약](evidence/r12-heading-20261112/summary.json), 전체 파일 무결성은 [manifest](evidence/r12-heading-20261112/manifest.json)에 보존한다. 별도 [수용 판정](evidence/r12-heading-20261112/acceptance-after-wp6-retry.json)은 완결된 WP6 재실행을 사용한다. 최초 전체 실행과 R10의 `failed` 상태를 변경하지 않는다.

## 5. 중간 실패·중단 기록

처음 실행한 `ce8df92`의 Linux 원본 하네스는 **10/15**였다. compare-320의 뷰포트 이탈 1개와 1440px BTC·ETH·MSTR·BMNR 글리프 겹침 4개가 기록됐다. 이전 대화의 Linux 15/15와 이번 원본 실행을 동일한 관측으로 취급하지 않는다.

초기 조상 변경 진단은 `.workspace` 높이를 줄였지만 기존 최소 높이 때문에 실제 툴바 이동을 만들지 못했다. 그 결과는 실패 그대로 보존했다. 최종 진단은 실제 `.atlas-chart-stage`의 `max-height`를 72px 줄이고, 툴바·anchor가 정확히 −72px 이동하면서 크기는 같다는 것을 먼저 확인한다.

중간 소스 `d39870f`의 grid 시도는 출처 푸터에 필요한 문서 스크롤을 없앴다. 기존 53개 하네스의 legacy 320·375·1440이 이를 검출했다. **51/53 관측, 48 통과·3 실패**에서 실행을 중단했고 종료 코드는 **130**이다. R10·npm은 그 실행에서 시작하지 않았다. 이를 53개 완료 또는 최종 통과에 합산하지 않는다. grid는 제거하고 공지 높이만 예약하는 최종 방식으로 바꿨으며, 기존 53개 하네스는 그대로 두었다. 근거: [중단 기록](evidence/r12-heading-20261112/interrupted-d398/interruption.json.gz).

첫 통제 A/B 진단은 **2/6**, stage 대조는 **4/4**였다. 전화기에서 원본·수정본 모두 푸터 border-box 하단이 `900.046875px`인 것을, 내용 잘림으로 판정한 검사 때문이었다. 원래 실패 보고서를 보존하고, 런타임 진단만 실제 출처 글리프·링크·버튼의 뷰포트 포함 여부와 스크롤 끝·복원을 확인하도록 수정했다. 제품 소스나 h1 수용 기준은 바꾸지 않았다. 수정된 진단은 **6/6 및 4/4**이며, 최초 실패를 삭제하거나 통과로 다시 쓰지 않았다.

최종 소스의 첫 WP6 실행은 **29/30**이었다. 유일한 실패는 `btcusd-1920x1080`의 **`CDP timeout: Runtime.evaluate`**이며, 원래 20초 CDP 제한에 걸렸다. 준비된 차트 조회는 성공했지만 `settled()`와 초기 상태 읽기 사이에서 `initial`이 저장되지 않았다. 해당 로그만으로 폰트 대기·두 프레임 대기·후속 동기 조회 중 어느 식이 지연됐는지는 구분할 수 없다. 오류 뒤 상태 읽기와 실패 PNG 캡처는 성공했고 런타임 예외는 없었다. 이를 네트워크·폰트·인프라 탓으로 확정하지 않는다.

첫 WP6 보고서·로그·실패 PNG(SHA-256 `083fee3c1c12c14dffcb272a2eb0365f8153513f0ee2bf1bc80d2d522ec4a56b`)를 그대로 보존한다. 이 실패를 포함한 최초 전체 순차 실행 및 R10 묶음은 `failed` 상태를 유지한다. 같은 소스·하네스·제한으로 실행한 독립적인 [전체 WP6 재실행](evidence/r12-heading-20261112/wp6-retry/report.json.gz)은 **30/30, 실패 0, exit 0**이다. 최초 순차 실행 종료 `22:19:02.202Z` 이후 `22:19:11.369Z`에 시작해 `22:26:51.331Z`에 끝났으며, 소요 시간은 **459,962ms**다. 보고서가 참조하는 PNG **45개**의 실제 바이트·해시도 확인했다. 실패했던 BTC 1920×1080의 초기 안정화·차트·재생 검증을 이번 실행에서 모두 완료했다. 처음의 29개와 재시도 중 일부를 이어 붙여 30/30으로 만들지 않는다. 최종 수용 판정은 최초 실행 상태와 별도 재실행 결과를 나눠 기록한다.

## 6. 후속 macOS 기록과 남은 확인

요청한 검증은 모두 실행했다. 기존 53/53, 반응형 44/44, 독립적인 WP6 재실행 30/30, chart-qa 12/12, npm 3,428/3,428 및 두 차례 h1 15/15가 통과했다. 첫 WP6의 CDP 시간 초과는 정확한 내부 원인을 확정할 기록이 없어, 그 실패와 새 실행을 각각 보존했다.

이 세션에서 macOS 브라우저를 직접 실행하지는 않았다. 다만 최종 반영 직전에 같은 브랜치에 추가된 문서 커밋 3개(`d6f06c6`, `846c122`, `b23cd23`)와 [macOS 독립 실행 원본](evidence/chart-h1-20261112/r12-macos/contract-report.json.gz)을 확인하고 보존했다. 이 문서 커밋들은 `dist/`, `scripts/`, `tests/`를 바꾸지 않았다. 원본은 소스 `a6bf961`, Chrome `157.0.8103.79`, 기준선 없는 실행이며 파일 해시도 현재 제품 소스와 일치한다.

해당 macOS 기록은 **기존 15/15, 보충 9/9, 조상 변경 1/2**다. **스크립트 전체 status는 `failed`이며 전체 통과로 표시하지 않는다.** 실패는 compare-320의 복원 비교 `plot.top 53→0`, `plot.height 799→852` 두 항목이다. before·shifted·restored 모두 h1과 painted h1은 각각 1개, h1은 툴바·뷰포트 안, anchor 좌표 오차는 0px다. h1 top은 **869.5→797.5→869.5**로 정확히 72px 이동하고 복원됐다. 원래 R12의 `heading/glyphs outside visible toolbar` 오류는 이 독립 기록에서 발생하지 않았다.

별도 [기존 마감 문서](CHART_H1_20261112.md)는 이를 53px 고지 배너가 before와 restored 사이에 사라진 시점 차이로 분류하고 R13 하네스 안정화 항목으로 기록했다. 원본 geometry도 이 높이 변화와 일치한다. 남은 항목은 **고지 상태가 달라져도 독립적인 조상 변경·복원 검사가 결정적으로 실행되도록 하는 하네스 안정화와 macOS 전체 스크립트 재확인**이다. 이 R12 제품 수정에서 R13의 컨퍼런스 select 경로나 하네스 판정 기준을 바꾸지 않았다. 이 문서의 Linux 검증 통과 수치와 별도 macOS 기록의 전체 실패 상태를 구분한다.
