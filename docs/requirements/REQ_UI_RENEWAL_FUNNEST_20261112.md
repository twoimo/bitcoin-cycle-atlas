# 요구사항 — Funnest Charts UI/UX로 전면 리뉴얼 (초안)

작성 2026-11-12. 현재 상태: **P0는 `b787935` Mac에서 10/10·커버리지 40/40·`qualifiesP0Verification:true`로 닫혔다. P1은 `67125bd` Mac에서 레이아웃 28/28·내비 56/56·차트 복귀 8/8·오버플로 0·failures 0·`qualifiesP1Verification:true`로 닫혔다.** 표본과 4.5/3.0은 유지한다. 다음 한 건 `P2A0-6ffbdda`의 임시 페이지·Datafeed·검증기는 `cefc568`·`b0cf985`에 구현했다. Mac `1c8f0c3`에서 startup 6/6·features 7/7·touch 4/4·keyboard 0/4·qualifier false였다. `Q-P2A0-1-15e9e7b` 수정 후보 `a4485e6`은 타깃·대비·검색 모달 키보드를 보완했다. **P2a-0은 `72d3aa1` Mac에서 startup 6/6·features 7/7·keyboard 4/4·touch 4/4·qualifier true로 닫혔다.** 다음은 P2 차트 크롬이다. 기존 엔진 유지, P2 차트 크롬·P3·P2b·배포 미착수. [P1 Mac 정본 영수증](../evidence/qa-r19p1-20261112/mac-67125bd.json) · [P0 Mac 영수증](../evidence/qa-r19p1-20261112/mac-b787935.json) · [P2a-0 구현·측정 한계](../evidence/p2a0-6ffbdda/README.md). 이전 P1 발견과 수정 이력은 [체크리스트 Q-R19P1-2~4](../LAUNCH_CHECKLIST_20261110.md)에 보존한다. 대상 `twoimo/bitcoin-cycle-atlas`.
참조 저장소: `funnest-xyz/funnest-charts` (Apache-2.0, `main` @ `39cb29ae250448d520384c12de555b1c00727883`, 2026-11-12). 홈페이지 `https://charts.funnest.xyz`.
방법: 저장소 소스(`apps/site/app/globals.css`, README)와 실제 홈페이지(1440×900)를 함께 읽고, `ui-ux-pro-max`로 방향을 대조했다. 참조 스크린샷은 `docs/evidence/funnest-ui-20261112/home-1440.png`.

## 1. 목적

Atlas의 현재 다크·골드·hairlines 편집 톤을 **Funnest Charts의 밝고 부드러운 핀테크 톤**으로 전면 교체한다. 데이터 계약·검증·접근성은 그대로 두고, **토큰·타이포·셸·차트 크롬·대시보드·컨퍼런스 화면**을 한 시스템으로 다시 만든다.

## 2. 참조 저장소에서 확인한 디자인 DNA

| 항목 | 값 | 출처 |
|---|---|---|
| 액센트 | `--violet:#6c4dff`, deep `#5a3bf0`, 보조 `--yellow:#ffd43b` | `apps/site/app/globals.css` |
| 라이트 | bg `#ffffff`, soft `#f2f4f6`, card `#ffffff`, text `#191f28`/`#4e5968`/`#8b95a1`, line `#e5e8eb`, shadow `0 10px 40px rgb(0 27 55/.08)` | 같은 파일 |
| 다크 | bg `#101013`, soft `#1b1b21`, card `#17171c`, text `#f2f2f4`/`#b0b0ba`/`#7e7e87`, line `#2a2a33` | 같은 파일 |
| 타이포 | `Pretendard Variable`, body **17px/1.6**, `letter-spacing:-0.02em`, `word-break:keep-all` | 같은 파일 |
| 레이아웃 | `.container` 1140px, `.container-wide` 1280px, 좌우 24px | 같은 파일 |
| 컴포넌트 | 알약 버튼(h40, radius 999), 둥근 카드, 부드러운 그림자, 차트 카드 안 자체 툴바(심볼·간격·아이콘) | 홈페이지 실측 |
| 차트 규칙 | TradingView식 크로스헤어·간격, 한국식 **빨강 상승/파랑 하락**, KST·KRX 세션·호가 단위 | README |
| 라이선스 | Apache-2.0. 코드 복사 시 NOTICE·저작자 표시. **브랜드 로고·이름은 복제하지 않는다** | LICENSE |

`ui-ux-pro-max` `--design-system`은 이 저장소에 대해 "Minimalism & Swiss"·"Trust & Authority" 계열을 추천했다. 토큰은 참조 저장소의 실제 값(바이올렛·Pretendard·17px)을 우선하고, 스킬 결과는 **간격·위계·접근성 규칙**에만 사용한다.

## 3. 적용 범위 (표면별)

| 표면 | 지금 | 리뉴얼 후 |
|---|---|---|
| 토큰·테마 | 다크 고정, 골드 액센트, hairline | 라이트 기본 + 다크 모드, 바이올렛 액센트, 카드 표면·부드러운 그림자 |
| 셸·내비 | 좌측 사이드바 + 우측 아이콘 레일, 11–13px | 1140/1280 컨테이너, 알약 탭·버튼, 15–17px 본문, 카드 섹션 |
| 차트 워크벤치 | 다크 캔버스, 툴바 한 줄, 좌상단 오버레이 | 둥근 카드 안 차트 + 카드 헤더 툴바, 동일한 오버레이 정보, 빨강/파랑 캔들 옵션 |
| 대시보드(릴레이·리서치·자산·공모주·시장) | 표·리스트 중심, 11px | 카드 그리드, 알약 필터, 13–15px 본문, 표는 밀도 예외 |
| 컨퍼런스 복습 | 장표 중심 + 하단 컨트롤(자체 완성) | 같은 레이아웃에 새 토큰·타이포·알약 컨트롤 적용 |

### 3.1 유지 계약
- 데이터 계약·URL·검증 하네스·접근성(44px·포커스·reduced-motion)·A-9 예산은 유지한다.
- 차트의 관측/가정 구분, 축·범례·출처·한계 문구는 스타일 변경으로 약화하지 않는다.

### 3.1.1 결정 (2026-11-12, 사용자 "추천대로")

| # | 결정 | 값 |
|---|---|---|
| C1 | 액센트 | **바이올렛 `#6c4dff`** 로 전환(골드 → 바이올렛). 골드는 예측·데이터 의미색으로만 남긴다 |
| C2 | 기본 테마 | **라이트 기본 + 다크 토글**. 다크는 기존 사용자 설정을 존중 |

### 3.2 명시적 예외
- **데이터 표·축 라벨**은 밀도 때문에 12–13px을 허용한다(본문 15–17px, 메타 13px).
- **카드 라운드**는 이 리뉴얼에서 의도된 스타일이다(12/16/20px 토큰). 단, 같은 화면에서 임의 값 혼용은 금지한다.
- 차트 영역의 area gradient는 기능적 표현으로 허용하되, 배경·버튼에 장식 그라디언트는 금지한다.

## 3.3 차트 엔진 차용 — `@funnest/charts-ui`

사용자 지시(2026-11-12): "Funnest가 트레이딩뷰 차트를 깔끔하게 구현했더라. 그대로 가져와서 잘 사용하고 싶다." → 패턴 차용을 넘어 **실제 패키지를 차트 셸로 채택**한다.

- 패키지: `@funnest/charts-ui@0.6.16` (Apache-2.0, framework-free). `createTradingChart(container, {datafeed, symbol, resolution, colorScheme})`, 슬롯 `toolbar`·`toolbarEnd`·`belowToolbar`·`footer`, `save()`/`load()` 레이아웃 JSON.
- 데이터 연결: Atlas 자산을 `Datafeed`로 어댑트한다.
  - `resolveSymbol` ← 종목 메타(이름·통화·거래소·틱)
  - `getBars` ← 각 자산의 원본 OHLCV·시장 컨트롤러. P2a-0은 `dist/data/btc-volume.json`의 완료 BTC 일봉만 연결하며 원본에 없는 시간 단위를 합성하지 않는다.
  - `subscribeBars` ← 정적 사이트에서는 no-op, 리플레이·라이브는 별도
  - `searchSymbols` ← 기존 심볼 선택기, `getSparkline` ← 최근 종가
- 유지: 정확한 `0.6.16`에는 좌표 변환·`addOverlay`, 기본 bar replay와 종목 compare가 있다. Atlas의 예측 밴드·역사 사건·고정 예측/시점 증거 replay·사이클 정렬 compare와의 패리티는 별도다. P2a-0의 API/계약 대조 결과 해당 네 기능은 **하이브리드로 기존 엔진 유지**를 선택했다(§3.3.2). 네이티브 수용은 Mac `1c8f0c3`에서 keyboard 0/4로 실패했고, `72d3aa1`에서 keyboard 4/4·qualifier true로 닫혔다. 큐 맨 앞은 P2 차트 크롬이다.
- 테마: `colorScheme:'system'`을 Atlas 토큰(라이트/다크)과 맞추고, 빨강 상승/파랑 하락은 패키지 기본값을 따른다.
- 라이선스: Apache-2.0. 번들·NOTICE에 출처 표기, 브랜드 로고·이름은 사용하지 않는다.

### 3.3.1 기능 패리티 매트릭스 (스파이크에서 확정)

| 기능 | Funnest 0.6.16 소스 확인 | Atlas 필요 | 계획 |
|---|---|---|---|
| 캔들·라인·거래량 | 지원 | 필수 | 그대로 |
| 선형/로그/% 축 | 지원(`PriceScaleMode`) | 필수 | 그대로 |
| 지표·그리기 도구 | 지원 | 필수 | 그대로 |
| 심볼 검색·미니 라인 | 지원 | 필수 | Datafeed 어댑터 |
| 레이아웃 저장/복원 | 지원 | 권장 | `save/load` |
| 한국식 색·KST | 지원 | 필수 | 그대로 |
| 예측 밴드·가설 경로 | render-only overlay·좌표 변환 지원, 예측을 autoscale 도메인에 넣는 계약 없음 | 필수 | 하이브리드, Atlas 엔진 유지 |
| 역사 사건 라벨 | 사용자 overlay·거래 실행 마커 지원, Atlas 사건의 키보드/출처 계약은 별도 | 필수 | 하이브리드, Atlas 사건 레이어 유지 |
| 리플레이·compare | bar replay·다른 종목 종가의 기준점 % 비교 지원 | 필수 | Atlas 고정 예측·사이클 정렬은 하이브리드 |
| 접근성·키보드 | 32/36px 컨트롤 및 모달 포커스 위험 확인, 네이티브 미검증 | 필수 | Mac `72d3aa1` keyboard 4/4·44px·포커스·4.5/3.0 통과 |

### 3.3.2 스파이크 게이트 (P2a-0)

1. 임시 페이지에 패키지를 마운트하고 BTC 일봉을 Datafeed로 연결한다.
2. 캔들·로그/퍼센트 축·지표·그리기·심볼 검색·한국식 색을 실제 입력으로 확인한다.
3. 번들 크기, A-9 초기 로드 영향, 키보드 접근성, 모바일 터치를 측정한다.
4. 예측 밴드·사건·리플레이·compare의 대체 경로(오버레이 vs 하이브리드)를 결정한다.
5. 결과를 이 문서에 표로 남기고, 통과 전에는 기존 엔진을 제거하지 않는다.

#### P2A0-6ffbdda 결과 — 구현 후보, 네이티브 수용 대기

수정 전 원격 `6ffbdda618ad67df6aa47d62bf52f8ce7fc159ba`를 다시 읽고 시작했다. 구현은 `cefc568`, 검증기와 실제 실행 후보는 `b0cf985`다. 별도 `spikes/funnest-p2a0/`의 UI/core **0.6.16**과 esbuild **0.28.2**를 lockfile로 고정했고, 산출물은 `build/p2a0/site/`에만 생성한다. **P1은 `67125bd` Mac의 28/28·56/56·8/8·qualifier true로 닫힌 상태를 유지한다. P2a-0은 아직 통과하지 않았고 다음 단계도 시작하지 않는다.** [원본 영수증·명령·해시](../evidence/p2a0-6ffbdda/README.md).

| 구현/측정 | 결과 | 해석 |
|---|---|---|
| BTC Datafeed | Bitstamp BTC-USD 완료 일봉 **5,560개**, 2011-08-18–2026-11-06 UTC | 기존 `dist/data/btc-volume.json` OHLCV 그대로, 초→밀리초만 변환. 보간 0, 원본 0거래량 33행 보존, 실시간 연결 없음 |
| 소스 검증 | 기존 `parseVolumeSnapshot` + 원본 SHA-256 검증, 어댑터 검사 **10/10** | 종가로 OHLC를 합성하지 않음. 검색은 보유한 BTC 메타만 반환 |
| 실제 사이트 HTTP | 루트·JS·favicon·데이터·NOTICE **5/5 HTTP 200**, gzip 복원 바이트 동일 | 서버 검증이며 실제 화면 입력 통과가 아님 |
| 캔들·로그·%·MA·추세선·심볼 검색·한국식 색 | 필수 **7**, 시도 **0**, 통과 **0** | Chromium 시작 차단, 실제 입력 미검증 |
| 키보드 320/390/768/1440 | 필수 **4**, 시도 **0**, 통과 **0** | 도달·44px·2px 포커스·4.5/3.0·모달 복귀 미측정 |
| 모바일 touch pan/pinch 320/390 | 필수 **4**, 시도 **0**, 통과 **0** | 터치 입력 미측정 |
| 스파이크 native 자격 | `sourceStable:true`, `complete:false`, `qualifiesP2a0NativeVerification:false` | 스크린샷 0, 오버플로 실측 `null`. 0시도는 통과가 아님 |
| 집중 검사·제품 정적 검사 | **24/24**, 실패/skip 0; **1,065파일·220스크립트·753참조** 통과 | 새 어댑터·프로토콜/HTTP 검사 24개이며 P1 게이트를 대체하지 않음 |

연결 브라우저는 originating browser context가 없어 초기화되지 않았고, 로컬 Chromium은 `socket() failed: Operation not permitted (1)`에서 `SIGABRT`로 종료했다. 네이티브 검사기는 실제 CDP 포인터·키·터치만 사용한다. 검색 선택의 실제 Datafeed 재호출, 상승/하락 캔들 hover의 원본 OHLCV·범례·가격 pane 픽셀까지 확인하도록 준비했지만 이 환경에서는 실행되지 않았다. 임시 wrapper는 패키지의 컨트롤 CSS·포커스 동작을 덮어쓰지 않는다.

**번들 크기** — 원본 파일 및 gzip level 9/Brotli quality 11 산출값이다. 전체 브라우저 전송량·시간과 구분한다. 폰트/CSS/데이터는 별도이며 실제 초기 요청은 native 재검증에서 측정한다. [전체 입력·산출물 해시](../evidence/p2a0-6ffbdda/bundle-report.json.gz).

| 산출물 | 원본 B | gzip B | Brotli B |
|---|---:|---:|---:|
| UI/core만 `createTradingChart` 번들 | 220,669 | 68,385 | 59,164 |
| 실제 임시 페이지 JS — 패키지 + Datafeed + 읽기 전용 관측 | **234,611** | **73,721** | **63,642** |
| 원본 BTC OHLCV JSON | 864,273 | 222,328 | 159,069 |

**A-9 영향** — 기존 `verify-conference-data-browser.mjs`는 바이트 동일하다. 깨끗한 기준 worktree와 후보의 기존 제품 경로를 같은 Fast 4G, gzip, cache off, CPU 1×로 실행했다. 초기 **2,500ms**, 전환 **150ms** 예산을 유지한다.

| 실행 | 필수 | 시도 | 통과 | 초기 페인트/전환 시간 |
|---|---:|---:|---:|---|
| 기존 A-9 기준 `6ffbdda` | 6 | **0** | **0** | `null` / `null` |
| 기존 A-9 후보 `b0cf985` | 6 | **0** | **0** | `null` / `null` |
| 임시 페이지 초기 페인트, 같은 여섯 크기·Fast 4G | 6 | **0** | **0** | `null`; 컨퍼런스 전환 검사는 별도 |

두 기존 A-9 실행의 입력 **1,069파일 해시가 동일**하며 제품의 `dist`·`apps`·`packages`·루트 의존성·빌드 진입점에 스파이크 추가가 없다. 따라서 제품 진입 그래프에 추가 요청 **0개·0B**지만, **A-9 시간 차이는 미측정(`null`)**이다. 이전 Mac 시간을 이번 후보의 시간으로 대체하거나 0ms 영향으로 기록하지 않는다.

**키보드 접근성 소스 검토** — 정확한 버전의 [styles.ts](https://github.com/funnest-xyz/funnest-charts/blob/39cb29ae250448d520384c12de555b1c00727883/packages/ui/src/styles.ts)는 아이콘/심볼 컨트롤 36px, chip·모바일 컨트롤 32px을 선언한다. [symbol-search.tsx](https://github.com/funnest-xyz/funnest-charts/blob/39cb29ae250448d520384c12de555b1c00727883/packages/ui/src/components/symbol-search.tsx)와 [pane.tsx](https://github.com/funnest-xyz/funnest-charts/blob/39cb29ae250448d520384c12de555b1c00727883/packages/ui/src/pane.tsx)의 검색 모달에는 Tab 가두기·닫기 후 트리거 포커스 복귀 경로가 없다. 이는 **소스에서 확인한 44px·포커스 계약 위험**이며 실제 계산 크기·대비·키보드 통과 증거가 아니다. 패키지나 검사를 이 스파이크에서 약화하지 않았고 미달은 다음 native 실행에서 실패로 남긴다.

**네 기능의 대체 경로 결정** — 아래는 공개 API와 Atlas 계약을 비교한 설계 판단이다. API가 존재한다는 사실을 Atlas 네이티브 패리티 통과로 간주하지 않는다.

| Atlas 기능 | 결정 | 정확한 0.6.16 지원과 유지해야 할 차이 | Atlas 유지 경로 |
|---|---|---|---|
| 예측 밴드·가설 경로 | **하이브리드** | `ChartOverlay.render`·시간/가격 좌표 변환은 있다. overlay의 예측 경로가 autoscale Y 도메인에 기여하는 인터페이스는 없다. 관측/가정 분리, 실제 UTC 간격·가격/지수 기준, 예측까지 포함하는 도메인을 보존해야 한다. [overlay 계약](https://github.com/funnest-xyz/funnest-charts/blob/39cb29ae250448d520384c12de555b1c00727883/packages/core/src/objects/types.ts), [autoScale/addOverlay](https://github.com/funnest-xyz/funnest-charts/blob/39cb29ae250448d520384c12de555b1c00727883/packages/core/src/chart.ts) | `dist/atlas-price-chart.js` |
| 역사 사건 | **하이브리드** | overlay로 그릴 수 있고 거래 실행 마커도 있으나, render-only 계약이 사건 hit-test·키보드 포커스·ARIA·출처/날짜 정밀도·라벨 충돌 처리를 대신하지 않는다. [ChartOverlay/PaneCoords](https://github.com/funnest-xyz/funnest-charts/blob/39cb29ae250448d520384c12de555b1c00727883/packages/core/src/objects/types.ts) | `dist/atlas-price-chart.js`의 사건·키보드 레이어 |
| 리플레이 | **하이브리드** | 기본 `startReplay/replayStep/replayPlay`는 있다. 캔들 cutoff와 진행 제어만으로 Atlas의 고정 예측·as-of/해시 증거·미래 캔들/사건/축 도메인 누출 금지가 입증되지 않는다. [replay 구현](https://github.com/funnest-xyz/funnest-charts/blob/39cb29ae250448d520384c12de555b1c00727883/packages/core/src/chart.ts) | `dist/chart-replay-atlas.js` |
| compare | **하이브리드** | `addCompare`는 다른 종목의 종가를 첫 가시 바 기준 %로 재기준화한다. Atlas 반감기·저점·고점·돌파 정렬, 단위/기준점·기간·시나리오 URL 계약과 다르다. [compare 구현](https://github.com/funnest-xyz/funnest-charts/blob/39cb29ae250448d520384c12de555b1c00727883/packages/core/src/chart.ts) | `dist/comparison-url-state.js`, `dist/compare-shell-host.js` |

기존 엔진은 삭제·교체하지 않았다. 보호 4파일·`dist/price-axis.js`·`minRight=64`, 기존 P0/P1·A-9 검사와 표본/임계값을 보존했다. Apache LICENSE/NOTICE·내장 Preact MIT·Pretendard OFL을 생성 페이지에서 제공하고 유료 도구는 추가하지 않았다. 재현 명령·raw 영수증·압축 해시는 [P2a-0 증거](../evidence/p2a0-6ffbdda/README.md)와 [summary.json](../evidence/p2a0-6ffbdda/summary.json)에 있다. **실제 기능·키보드·터치와 A-9 확인 전에는 P2a-0을 닫거나 기존 엔진을 제거하지 않는다.**

**Mac 재검증(2026-11-13 01:26–01:32 KST, Chrome 157.0.8103.79, HEAD `1c8f0c3`)** — startup 6/6, 초기 페인트 1,080.1–1,125.6ms. features 7/7. touch 4/4. keyboard 0/4, failures 28, `qualifiesP2a0NativeVerification:false`. indicators·tools 텍스트 대비 4.440810712577725. Enter 뒤 심볼 대화상자는 45초 타임아웃이다. 대화상자 포커스·Tab·Escape는 미측정이다. 기존 컨퍼런스 A-9는 같은 HEAD에서 6/6, painted 2,170–2,208.2ms, 예산 2,500, 실패 0이다. 기준 `6ffbdda` 별도 비교는 없으므로 시간 차이 0ms를 주장하지 않는다. 장표·오디오 파일 부재는 미디어 준비 완료가 아니다. P2a-0을 닫지 않고 P2 차트 크롬을 시작하지 않는다. [영수증](../evidence/qa-p2a0-mac-1c8f0c3/README.md).

#### Q-P2A0-1-15e9e7b 수정 후보 — Mac 재검증 대기

원격 `15e9e7b`를 다시 읽은 뒤 **`a4485e69ab2d38266dd5a813e6a2b456e9e3c64b`**에 임시 스파이크의 접근성 수정만 반영했다. P1 닫힘과 네 기능의 하이브리드/기존 엔진 유지 결정을 바꾸지 않는다. [수정·원본 영수증](../evidence/q-p2a0-1-15e9e7b/README.md).

| 항목 | 수정과 검증 상태 |
|---|---|
| 16개 작은 타깃 | 원래 symbol/button/chip 최소 **44×44px**. 도구줄은 자동 높이·최소 56px·상하 6px 패딩, 그리기 영역은 56px·좌우 5px 패딩으로 **2px 링 + 1px offset** 여유를 둔다. 모바일은 원래 빈 spacer로 두 행을 만들며 컨트롤을 숨기지 않는다. 이는 소스 선언이며 후보의 native 계산 크기는 미측정이다. |
| 8개 텍스트 대비 실패 | 기존 패키지의 본문 역할 `--fnc-text`를 컨트롤에 사용한다. 색 리터럴·표본 삭제·4.5/3.0 완화·캔들 의미색 변경 없음. 후보 native 대비는 미측정이다. |
| Enter 검색창 타임아웃 | 실제 기존 버튼 click 경로에 Enter keydown/Space keyup을 연결하고 default 중복 실행을 막는다. 정확한 패키지는 onClick만 있고 전역 Enter 취소 근거는 없다. 측정된 rawKeyDown/keyUp 활성화 공백을 보완했다. |
| 모달 키보드 | 원래 검색창의 포커스 소유, 현재 보이는 enabled Tab stop 양방향 가두기, 실제 모달 제거 후 opener 복귀를 처리한다. 모달 버튼 Enter가 엉뚱하게 검색 결과를 선택하지 않도록 하고 combobox 선택은 원래 경로를 유지한다. 모바일의 실제 닫기 버튼도 노출한다. |
| 집중/빌드 | **35/35**, 실패/skip 0. 새 DOM/handler 회귀 11 + 기존 24. 빌드·동일 바이트 `--check`·CSS 구문 검사 통과. static **1,065/220/753**. DOM 모델 검사는 native 증거가 아니다. |
| 같은 게이트 | 검증기 SHA-256 `2e1037e0c0251acd7cb441bf005e7dab8b8f77f6893559b143bf7d5b88135fce` 기준/후보 동일. **6/7/4/4, 44px, 2px, 4.5/3.0, 45초, checkVisibility, 표본과 실격 조건 보존**. |

깨끗한 `a4485e6`의 실제 실행은 Chromium `socket() failed: Operation not permitted (1)`로 케이스 시작 전에 종료했다.

| 그룹 | 필수 | 시도 | 통과 |
|---|---:|---:|---:|
| startup | 6 | **0** | **0** |
| features | 7 | **0** | **0** |
| keyboard | 4 | **0** | **0** |
| touch | 4 | **0** | **0** |

`sourceStable:true`, `complete:false`, `qualifiesP2a0NativeVerification:false`. 초기 페인트·오버플로 `null`, 스크린샷 0. 수정 전 Mac의 startup 6/6·features 7/7·touch 4/4를 이 후보의 통과로 재사용하지 않는다. **Q-P2A0-1은 같은 Mac 한 실행의 6/6·7/7·4/4·4/4·qualifier true 전까지 열림이다.**

후보 JS는 **237,474B / gzip 74,745B / Brotli 64,490B**, 이전 대비 +2,863B/+1,024B/+848B다. 패키지 0.6.16·데이터는 그대로이며 새 의존성은 없다. 기존 A-9의 Mac `1c8f0c3` **6/6·2,170–2,208.2ms**는 보존한다. 제품 소스·A-9 게이트는 동일하고 이번에는 재실행하지 않았다. 기준 worktree 비교가 없으므로 **시간 영향은 미측정**이며 0ms로 쓰지 않는다. 보호 4파일·가격 축/minRight64·기존 엔진·P0/P1과 이전 Mac 영수증은 바이트 동일하다. 이 문단의 Linux 0시도는 후보 작성 시점 기록이다. **Mac 재검증(2026-11-13 01:56–01:57 KST, Chrome 157.0.8103.79, HEAD `72d3aa1`)** — startup 6/6, 초기 페인트 1,104.9–1,123.9ms. features 7/7. keyboard 4/4. touch 4/4. failures 0. startup overflow 0. `qualifiesP2a0NativeVerification:true`. 네 폭 타깃 높이 44px, 대화상자 포커스는 안쪽이고 role은 combobox다. 텍스트 대비 14.056959465600228. 심볼 아이콘 대비 4.440810712577725는 아이콘 기준 3.0 이상이라 실격이 아니다. 44px·2px·4.5/3.0·45초는 유지했다. Q-P2A0-1과 P2a-0을 닫는다. 기존 엔진은 남아 있다. 다음은 P2 차트 크롬이며 P3·P2b·배포는 미착수다. [Mac 영수증](../evidence/qa-p2a0-mac-72d3aa1/README.md). [수정 시점 수치](../evidence/q-p2a0-1-15e9e7b/summary.json).

## 4. 단계

| 단계 | 내용 | 완료 기준 |
|---|---|---|
| P0 | 토큰·타이포·테마: Pretendard self-host, 라이트/다크 토큰, 15/16/17px 스케일 | 토큰 표·폰트 로딩·대비 4.5:1, 320/1440 스크린샷 |
| P1 | 셸·내비: 컨테이너 1140/1280, 알약 탭, 카드 섹션, 헤더 정리(h1 중복 제거 포함) | 4뷰포트 오버플로 0, 내비 도달성 |
| P2 | 차트 크롬: 카드 프레임·헤더 툴바·범례·읽기 행·축, 빨강/파랑 옵션 | 53-case·반응형·축 계약 통과 |
| P3 | 대시보드: 릴레이·리서치·자산·공모주·시장 카드화 | 각 페이지 4뷰포트, 표 밀도 유지 |
| P4 | 컨퍼런스: 기존 레이아웃에 새 토큰·알약 컨트롤 | 20/20·14/14 유지 |
| P5 | QA·일관성: `REQ_ANTI_AI_DESIGN` D-1~D-8, 5축 QA | Q-발견 0 |

## 5. 수용 기준

| # | 기준 | 측정 |
|---|---|---|
| U-1 | 새 토큰이 한 곳(`:root`)에서 정의되고 하드코딩 색 0 | 계산 스타일 스캔 |
| U-2 | Pretendard 로드·fallback, 본문 15px 이상(표 예외 12–13) | 폰트·크기 스캔 |
| U-3 | 라이트/다크 모두 대비 4.5:1(텍스트)·3:1(아이콘) | 표본 20개 |
| U-4 | 320·390·768·1440 가로 오버플로 0, 44px 타깃 | 브라우저 실측 |
| U-5 | 기존 게이트 유지: ETH 53/53, compare, 반응형 44, WP6 30, chart-qa 12, `npm test` | 수치 |
| U-6 | `REQ_ANTI_AI_DESIGN` D-1~D-8 위반 0 | 스캔 |
| U-7 | 각 단계 스크린샷 `docs/evidence/ui-renewal-<단계>/` | 파일 |

## 6. 리스크·하지 말 것

- 리스크: 차트 가독성(라이트 모드 캔들·축), Pretendard 로딩 성능, 표 밀도 저하, 범위 폭발.
- 하지 말 것: 데이터 계약 변경, 검사 약화, Funnest 로고·브랜드 복제, 장식 그라디언트·글로우, 단계별 스크린샷 없는 변경.
- 라이선스: 코드를 복사하면 `NOTICE`에 Apache-2.0 출처를 적는다. 토큰·패턴 차용은 문서화한다.

## 7. 우선순위

**P2a** — 현재 큐(P1c-B QA → R16 → R17) 뒤, 리브랜딩(P2b) 앞. `R18 AI 티 제거`는 이 리뉴얼의 P5로 흡수한다(별도 트랙으로 중복 수행하지 않는다).
