# 세 축 연구실 계층 분리

2026-11-03. 소유 브랜치 `codex/market-lab-service-20261103`, 기준 `db794bc4e6bfbdf35b035850ee8ddba3a73b584b` (최신 main `b43cbf0` 위의 연구실). 기존 소유자의 작업본·main은 수정하지 않는다.

목표: 기존 4탭·지역·계산·오프라인을 보존하면서 공통 계산, PostgreSQL 판본 저장, Fastify API, 수집 jobs, React/Vite 화면을 한 저장소에서 분리한다. 첫 세로 이전은 연구실 전체 스냅샷의 손실 없는 import와 API 조회이며 원천 재수집은 하지 않는다.

수용 기준: DB 왕복 스냅샷과 국내/미국 진단·RSI·가상 실험·현금흐름 동일, 중복 import·오래된 판본·중간 실패·동시 발행 검증, API 입력/빈 DB/DB 장애/고정 판본, 화면 4탭·지역·키보드·입력·날짜·좁은 폭, 기존 standalone 유지.

작업 순서: 기준 검사 → 공통 계산과 DB/API/jobs → React 제어/기존 패널 어댑터 → 실제 PostgreSQL 및 IAB 검증 → 결과·다음 단계 기록.

환경: 기본 Homebrew Node가 dylib 오류이고 node@24 실행 파일이 없어 공식 Node 24.22.2를 SHA-256 검증 후 작업의 ignored build/ 아래에 준비한다. PostgreSQL 17.11은 설치되어 있으며 별도 소유 인스턴스를 사용한다. 전역 런타임·기존 DB 서비스를 바꾸지 않는다.

설계 지침: frontend 소스 검사에서 로컬 무결성 불일치는 없었고 upstream 변경은 review_required다. 현재 고정한 제품 디자인과 로컬 지침을 유지하며 upstream을 자동 적용하지 않는다.

외부 검토: 공유 원장 재조회 시 ChatGPT와 Gemini의 free_slots=0. 다른 소유자의 미확인 작업을 해제하지 않는다. thesis/adversarial/reverse는 미실행이며 이 구현의 외부 검증·출시 완료를 주장하지 않는다.

## 첫 이전 결과

- PostgreSQL에 스냅샷 1판본·출처 11개·관측 29,831개를 import했다. revision `d3393bfbee731d8d09454fe7c9f65708764f3edcab27feb2563911c67dce544c`. 정상 DB 왕복과 두 지역 계산·RSI가 원래 자료와 일치한다. math canonical·정적 사본은 기준 소스와 바이트 동일하다.
- React가 탭·지역·키보드·데이터 연결을 맡으며 기존 계산·차트 패널은 수명 관리 어댑터로 보존했다. API 실패 시 저장본임을 표시한다.
- 서비스 검사 11/11, 기존 연구실 검사 56/56, 타입·빌드·정적 검사 통과. 전체 회귀는 기준과 변경본 모두 2403개 중 2255 통과·148 실패이며 실패 항목도 동일하다. 새 실패는 0이다. 기존 실패는 전체 통과로 처리하지 않았다.
- IAB 데스크톱·390px, 네 탭·지역·음수 충격·현금흐름·수기 RSI·날짜·키보드와 실제 DB 중단/복구를 확인했다. DB 백업을 별도 폐기용 DB에 복원해 해시·행 수를 대조했다. 복원 검사 DB와 기준용 임시 worktree는 정리했으며 로그·백업·화면은 보존했다.
- 현재 사용자용 로컬 주소 `http://127.0.0.1:4319/?page=market`. 소유 API 프로세스와 전용 PostgreSQL은 검토용으로 실행 중이다. 전역 Node와 기존 DB 서비스는 그대로다.
- 남은 일: 패널별 React 이전, 다른 페이지·예측 이력 이전, 실제 원천 수집/운영 schedule/호스팅/권한, 기존 148개 실패 분류, 외부 교차 검토. 운영·배포 완료가 아니다. 다음 체크포인트는 동일 입력·조회 시각을 고정해 진단 패널부터 React로 옮기는 것이다.
- 재현 명령·상세 결과는 `README.md`, `verification.json`, ignored `build/architecture-migration/`에 있다.

## React 패널 이전 시작

사용자 지시: 네 계산·차트 패널을 순서대로 React로 이전하고 기존 기능·계산을 대조한다. 기존 브랜치와 미커밋 첫 이전 변경을 그대로 이어간다. 범위는 연구실 패널과 공유 계약의 구체화이며 DB schema·원천 수집·운영 배포는 바꾸지 않는다.

이전 직전 앱 소스·빌드·수학 소스 해시와 IAB의 네 패널 텍스트·SVG를 `build/architecture-migration/react-panels/before`에 보존했다. 새 렌더러는 기존 수학 패키지를 재사용하고, 탭 전환 뒤에도 입력·선택 상태를 유지한다. 패널별 원래 렌더러 대조 검사와 실제 IAB 조작을 수행한다.

## React 패널 구현·검증 체크포인트와 범위 확장

진단·조건 실험·현금흐름·RSI·SVG·출처 설명을 React로 이전했다. 서비스 `main.tsx`는 기존 renderer를 import/mount하지 않는다. canonical 수학 JS와 legacy 정적/오프라인 renderer는 변경하지 않았다. 패널·로딩/오류/빈 상태/언마운트 검사 13/13, DB/API 11/11, 기존 연구실·standalone 56/56, 타입·빌드 통과. IAB의 이전·이후 네 패널 기본 텍스트·입력값·SVG 경로 모두 동일했다. 숫자 편집·재계산·탭 왕복·RSI 날짜와 수기값·초기 미계산일·범위 오류를 직접 확인했다. 실제 DB stop→저장본 안내→start→다시 연결에서 가정 입력 87.52도 유지했다. 최신 전체 회귀: 2403 중 2260 통과·143 실패, 이전 148 실패와 비교해 신규 0. 이전에 실패하던 5개는 당시 발행 산출물 등 환경 차이를 조사해야 하며 수정 성과로 주장하지 않는다. 원자료와 DB schema는 바꾸지 않았다.

2026-11-03 사용자 추가 방향: 차트는 TradingView처럼, 그 외 페이지는 정교한 대시보드 템플릿을 찾아 적용하고 전체 조화를 맞춘다. 기존 이전 결과를 유지하면서 명시적으로 시각적 범위를 확장한다. 다음 일: 공식 TradingView 화면과 공개 dashboard template 원본·라이선스 조사 → 한 공통 시각 체계/차트·dashboard 변형 → 실제 코드 적용 → IAB 데스크톱·모바일과 주요 조작 재검증. 템플릿 조사만으로 완료 처리하지 않는다.

## 공통 화면 적용 완료 · 사용자 문구 방향 반영

사용자는 로그인된 TradingView를 참고하도록 했고, AI 디자인/코덱스식 부연 설명이 없도록 명시했다. 해당 IAB 화면을 읽기만 했으며 저장 설정·개인 watchlist는 변경/복제하지 않았다. MIT shadcn/ui dashboard-01 원본과 라이선스를 고정해 공통 sidebar/header에 적용했다. 기본 화면은 값·조작·상태 위주이고 장문은 계산/출처 disclosure에 보존했다.

BTC의 상/좌/우/하 도구 배치, 다른 chart와 dashboard의 공통 색·간격을 적용했다. 원래 nav 노드·handler·page control owner를 보존하고 서비스에서는 React 연구실로 연결한다. mobile toolbar/viewport 충돌과 offline HTML의 새 CSS 누락을 수정했다. 오프라인 packaging의 stylesheet 검증은 28개이며 replay fixture는 macOS 임시 경로를 realpath로 정규화해 CLI preview가 실제 실행되게 했다. 제품의 symlink 거절 정책은 바꾸지 않았다.

IAB: BTC/ETH/MSTR/BMNR 및 연구실/자료표/리서치/공모주 렌더, 390px 주요 조작, CSV 실제 18개 행, 날짜 상세, 검색/읽기 창, sidebar 접기/펼치기, mobile replay 진입/종료와 React nav를 확인했다. 4개 React 패널 계산/geometry·기능 보존 검사 15/15, DB/API 11/11, 기존 연구실 56/56, 타입·빌드·정적 참조 검사 통과. 전체 2403/2260/143(전체/통과/실패), React 직후와 실패 동일·신규 0. Hallmark static은 7 FAIL/20 REFLEX/37 WARN으로 남겼고 upstream Chrome render는 미실행이다. 상세 범위와 잔여 항목은 docs/design-system, 두 후속 영수증에 기록한다. 운영 배포·다른 페이지의 React/DB 이전·수집 schedule·외부 검토는 남아 있다.

## 회귀·디자인 수정 및 navigation 분리 재개

2026-11-03 사용자 지시: 남은 회귀/디자인 항목 수정, 계산/기능 보존과 실제 화면 재확인. 추가 지시로 vgT0woMivNn7zAVv 원문을 다시 읽고 모호한 연구실 상위 메뉴 대신 미국/국내 시장 진단, 조건 실험, 현금흐름, 삼플레·RSI를 각각 sidebar page로 노출한다. 기존 작업/자료/판본은 보존한다. 기준 검사 원문은 build/regression-repair/before-*에 보존했다.

## 최종 회귀·페이지 분리·RSI 작업 화면

원래 143개 회귀 실패는 정상 임시 fixture의 macOS /var 별칭과, 불변 ETH 출력의 ARM/Linux x64 간 마지막 비트 차이로 분류했다. 제품의 symlink/교체/경합 거절과 엄격한 hash 비교·수학 함수·보존 출력은 유지했다. 정상 fixture를 realpath로 생성하고, npm test에서 비트 재현이 필요한 3개 파일/41개 case만 digest 고정 Node 24.22.2 Linux/x64로 실행한다. native 2362 + canonical 41 = 전체 2403 통과/실패0/skip0을 확인했다. 최종 paint·navigation 변경 뒤 native 2362와 영향받는 artifact 검사를 다시 통과했다.

요구한 Aside 원문을 다시 읽고 5개 시장/계산 도구를 독립 sidebar URL로 분리했다. 이전 query 링크와 가정 state/뒤로 가기를 유지한다. 삼플레·RSI는 3년 기본의 큰 TQQQ 가격/RSI 패널, 기준선 통과 Buy/Sell 표식·날짜 선택·표시 전환을 제공한다. 표시 방향은 시각화 규칙으로 명시하고 실제 주문 엔진/검증된 키움 값으로 주장하지 않는다. 390×844와 1280×720, 이전 차트·자료·읽기·달력 페이지를 실제 IAB에서 확인했다.

타입·빌드, UI 17, DB/API 11, 정적 참조 검사를 통과했다. Hallmark FAIL0/REFLEX0, 공통 control/frame 반복의 F7 WARN7은 실제 화면/역할 검토 후 일관성을 유지했다. raw finding은 숨기지 않았다. 최신 상세는 regression-repair-verification.json과 docs/design-system/README.md에 있다. 키움 REST API의 국내/미국·Mac 지원과 계좌/HTS ID/사용신청 조건은 공식 문서로 확인했다. 키 발급·인증·설치·broker 연결·주문·배포는 하지 않았다. 기존 외부 검토/운영 수집·호스팅 holds는 유지한다.

2026-11-03 후속: 종목 검색에서 삼플레 선택, TQQQ 외 SOXL·KODEX 233740, 전체 과거 기록과 가정 백테스트를 추가한다. 최신 지시는 별도 dashboard 전환을 폐기하고 실제 차트의 상하좌우 DOM을 유지한 채 중앙만 교체하는 것이다. 같은 origin iframe을 중앙의 React 소유 경계로 사용하고 기존 BTC 전용 도구는 중앙 도구 동안 비활성화 후 복원한다. 수치 함수는 유지하고 validator의 허용 종목/거래소만 확장한다. 기존 자료는 유지한 채 새 종목 관측만 새 DB 판본으로 추가한다. 외부 검토·키움·배포 holds는 그대로다.

Latest follow-up verified: center-only navigation with original perimeter owners, three complete retained histories, explicit next-observed-close backtests, source/clock preservation, 23 UI/import + 12 PostgreSQL/API + 23 artifact cases. Independent Python replay matches all three real histories. Actual IAB desktop/mobile, page/input/result retention, 4206 records / 413 filtered days / 4207 CSV lines verified. Gate56 cross-container/document false positive and F7 WARN8 remain in raw checker output. A broad native attempt had one concurrent-edit checksum failure; final stable-source standalone rerun passed. Kiwoom/external review/remote CI/deployment holds remain. See rsi-history-verification.json.

RSI workbench follow-up: user requested real BTC-style zoom/pan and instrument-aware perimeter tools, then deeper overall parity. Preserve canonical closes, RSI/backtest functions and existing ownership. Reuse chart-navigation and price-axis interaction controller. Build a full-canvas price/RSI terminal with verified OHLC, per-instrument view/undo state, a scope/epoch-bound command adapter, and contextual data/indicator/settings/date/export panels. Existing external-review/production/broker holds remain; no external audit or release is claimed. Acceptance: actual pointer wheel/drag and axis movement, measurement, daily/weekly bars, three instruments, perimeter routing, stale-scope rejection, BTC restoration, unchanged original calculations and independent backtest parity, desktop/mobile rendering.

## BTC 방식 삼플레 차트 · 로컬 구현 및 실제 확인

React의 전체 캔버스와 기존 BTC navigation controller를 연결했다. 실제 IAB에서 휠 확대, X/Y 드래그, 가격축/시간축 이동, undo/redo, 날짜 이동, 두 점 측정/지우기, 강한 자석의 실제 OHLC 스냅, 레이어 전환, 캔들·주봉, 종목별 상태 복원, BTC 원래 읽기 패널 복구와 PNG/SVG 미리보기를 확인했다. 측정값과 Buy/Sell 이름이 겹치지 않게 조정했다. 네이티브 gesture의 가격·시간 변경이 같은 프레임에서 서로 덮던 문제, 설정 버튼의 reader 라우팅, 날짜 입력의 오래된 초기 범위, 늦은 BTC 갱신이 ETF 안내를 덮던 문제를 수정했다.

새 immutable revision은 a855c157ff696ff609798b791ebbca26fa659b7174b56d53a90d7d3f75f2bcc5다. 실제 OHLC 4206/4188/2633개는 원래 종가와 정확히 일치하고 잘못된 심볼·통화·주기·거래소 시계·가격을 거절한다. 기존 7개 시장 종가열, 13개 출처, 지역 지표, 17개 고정 모형 소스 해시와 세 종목의 모든 백테스트 결과 필드는 유지됐다. 이전 3개 판본도 조회할 수 있다. 원문 확보 시각의 근거는 기존 수집 영수증과 로컬 파일 기록을 구분하며 TQQQ의 HTTP 수집 시각을 주장하지 않는다.

최종 타입/빌드/정적 참조, UI 28/28, DB/API 12/12, navigation/모바일/실제 standalone 172/172 통과. 정적 디자인 검사는 고정 checker, 명시적 modern-minimal, FAIL1/REFLEX0/WARN8이며 FAIL56은 별도 iframe/대화상자 스크롤 헤더를 한 문서의 sticky 충돌로 보는 기존 오탐이다. 실제 desktop/mobile에는 겹침이 없었다. 원문 finding은 보존한다. 이번 단계의 새 전체 2403개 실행이나 외부 검토 성공으로 표시하지 않는다.

모바일 390×844에서 일/주봉, 캔들, 기간·확대, 포인터 드래그, 지표/정보 패널을 확인했다. IAB의 touch dispatch 미지원으로 실기기 pinch는 미검증이며 해당 탭의 임시 emulation을 해제하고 닫았다. 사용자용 탭은 최종 TQQQ 1년·일봉·캔들·거래량 화면으로 유지했다. 원래 작업본/main·키움·운영/배포·외부 검토 holds는 유지한다. 상세 로그·source/screen hash와 한계는 rsi-workbench-verification.json 및 ignored build/rsi-workbench에 있다.

## Skullet 로딩 상태 적용 시작

사용자 지시: lochie/skullet를 설치하고 앱 전반의 스켈레톤 로딩을 정밀 적용한다. 기존 서비스 작업본/브랜치를 이어가며 upstream HEAD 770cba428e6954977fd97938f0f06a7cade2fc2d, npm 0.0.3, MIT와 React/vanilla API를 확인했다. 패키지 lifecycle script는 실행하지 않는다. 소스 원문과 registry 메타데이터는 build/skullet에 보관한다.

범위: 첫 부팅, 중앙 iframe 준비, React 최초 자료/API 재시도/백테스트, BTC·ETH·MSTR·BMNR 최초 가격/부분 요청, 비교표·공모주·리서치·예측/판정 이력과 리플레이의 실제 대기 상태. 원래 오류/빈 결과/재시도, 이미 읽은 가격·입력·스크롤과 계산 결과를 보존한다. 없는 가격/기간선/수익률을 샘플로 보여주지 않고 중립 구조로 크기만 예약한다. 동작 감소·키보드 접근·숨긴 페이지 정리·오프라인 패키지를 포함한다. 실제 요청을 지연시킨 IAB 화면과 부분 실패/재시도/빠른 완료/종목 왕복을 확인한다. 운영 배포·외부 교차 검토·키움 holds는 유지한다.

## Skullet 구현·검증 체크포인트

Skullet 0.0.3을 exact pin + ignore-scripts로 설치하고 MIT runtime/CSS/license를 로컬 vendor에 보관했다. 공통 Reveal 엔진과 중립 chart/RSI/table/calendar/list/detail 형상으로 React·기존 JS의 실제 pending을 연결했다. 기존 자료는 재조회 중에도 남기고, 동기 계산·빈 자료·실패를 가짜 로딩으로 바꾸지 않는다. 자료·가격·모형 함수와 17개 고정 모형 source graph는 변경하지 않았다.

전체 회귀 첫 실행의 70개 실패는 새 표시 모듈을 허용하지 않던 VM import/DOM 경계와 28→30 stylesheet 계약으로 분류했다. 유한 allowlist와 DOM 경계만 새 모듈에 맞게 추가하고 실제 offline 원문 CSS/모듈 검사를 강화했다. 원래 수치 hash·허용오차·symlink 거절·actor guard를 느슨하게 하지 않았다. 다음 전체 실행은 native 2363 + 고정 Linux/x64 41 = 2404 pass, fail0, skip0이었다. 최종 paint 보정 후 standalone/boot/가격 lifecycle/UI/API를 별도 재검사한다. 이전 실패 로그도 보존한다.

IAB 지연/오류 검사에서 API+저장본 실패 후 retry, 재연결 중 87.52 유지, ETH 재조회 중 $2,252.66·13개 path 유지, 18개 비교표, 42칸 공모주 달력, 390px 가로 넘침0/동작 감소를 확인했다. stock 재시도에서 generic relative가 absolute를 덮어 높이가 작아지던 결함과 iframe boot의 중복 chrome을 실제 화면에서 발견·수정했다. 백테스트 대기에는 280px 결과 skeleton, 실제 4206개 일별 기록과 자금10000 유지, 완료 후 91,440.31 USD·94 fills/47 closed 복귀를 확인했다.

검증용 proxy와 브라우저의 임시 media/viewport/network 설정은 완료 시 정리하며 원래 API/PostgreSQL·다른 탭은 유지한다. 자세한 수치/소스·원본 finding·그림은 skullet-verification.json 및 ignored build/skullet에 보관한다. 운영·외부 검토·키움 holds는 해제하지 않는다.

Skullet 최종 수용: 타입·빌드·UI 31/31·실제 PostgreSQL/API 12/12·최종 boot/가격 lifecycle/실제 standalone 103/103 통과. 전체 2404/2404 결과와 최종 표시 보정 뒤 재검사를 구분해 skullet-verification.json에 기록했다. proxy를 종료하고 4321 포트 닫힘·규칙 초기화를 확인했다. 모바일 media/viewport와 raw Fetch 설정을 해제했고 임시 탭16/17을 닫았다. 원래 서비스/DB는 유지했으며 사용자용 탭15에는 실제 4319의 TQQQ 252개 캔들·로딩0 정상 화면을 남겼다. 기존 다른 탭과 계정은 건드리지 않았다.

## 부동산 거래량·실거래가격 페이지

현재 요청: 플스포 컨퍼런스 녹음을 찾고 거래량/실거래가격 관계, 평균 상회·하회·중립 및 가설 2·3의 백테스트를 같은 차트 외곽 안에 구현한다. 소유 작업본/브랜치는 그대로다. Plaud 이름검색은 71개를 완전히 확인해 2026-10-31 컨퍼런스 (1)/(2)를 찾았다. (1) 40:44 촬영 하이라이트, 41:02 직접 메모, 44:50 직접 메모(부산 중장기 평균 약 3100건)를 확인했다. 두 녹음 모두 transaction 전사가 제공되지 않아 음성을 들은 정확 인용으로 표현하지 않는다. 관련 메모만 ignored build/housing-research/recording-evidence.json에 보존했고 원음·전체 메모·서명 URL은 제품에 넣지 않는다.

공식 한국부동산원 R-ONE A_2024_00554(아파트 매매, 신고월)와 A_2024_00178(아파트 실거래가격지수, 계약월, 2026.06=100)의 원응답·요청 매개변수·획득시각·SHA를 docs/real-estate/raw에 보존했다. 두 시계열은 동일 계약 집단이 아니며 이를 화면/방법에 명시한다. 부산/서울/경기/전국 각 거래량249개월(2006-01~2026-09), 가격248개월(~2026-08). 두 소수점 원응답을 사용하고 분양권·증여·조사지수·중위가격으로 대체하지 않는다.

기본은 이전36개월 산술평균, 중립±10%, 평가 시차2개월(앱 가정, 강연의 확정 기준 아님). 현재월/미래값을 평균에 넣지 않는다. 수준/전월비/평균편차 상관과 ±6개월 시차를 분리한다. 1/3/6/12개월 가격변화의 방향 일치·기본 빈도·차이·평균/중앙값·보합·미완료 제외·고정2021이후·고정비중첩표본을 표시한다. 최신 수정판으로 한 회고분석이며 당시 빈티지/공표시각이나 실제 투자수익률을 복원한 검증은 아니다.

housing 전용 immutable revision/channel을 DB에 추가해 기존 market-lab a855c157… 판본을 수정하지 않는다. API 조회/분석과 해시검증 저장본 fallback, React 중앙 페이지/월별장부/CSV 및 실제차트 확대·드래그를 연결했다. 초기 실제 화면/API 비교에서 request revision이 options에 남는 표시불일치를 발견했고 서버 입력에서 메타데이터를 분리했다. 평균경계110/100의 부동소수점 분류 오차도 회귀검사로 방지했다.

독립 Python 달력/통계 계산과192조합의1,284,288필드 대조가 통과했다. 실제 PostgreSQL/API13검사와패널37검사가 통과했으며 최종화면/실패상태/전체회귀·보존 해시 검증은 진행 중이다. 기존 외부 검토/운영배포/키움 holds는 유지하며 새 외부 전송·모델/계정 변경은 하지 않는다. Pstack 저장소 판본은 일치; 저자 X 전체 연재의 신규 내용은 이번 호스트에서 확인하지 못해 최신성 완전 확인으로 표현하지 않는다. Frontend source check는 local mismatch0/review_required로 기존 검토방법을 유지했다.

부동산 최종 수용: 기존 전체2404/2404, 실제DB/API13/13, React패널37/37, 최종외곽도구2/2 회귀와 타입·빌드·정적경로가 통과했다. 전체회귀 이후 표시/접근성·외곽도구 보정에는 영향받는 검사를 별도로 적용했다. 17고정모형파일SHA와 기존시장스냅샷전체(a855c157…판본)가 동일하다. 최종 기본화면은 가설1에 직접 대응하는 거래량/가격 원수준 상관을 표시한다(부산r−0.196,248개월). 평균편차/가격전월비 상관은 관계분석에서 별도로 확인한다. 장기추세가 있는 원수준 상관을 예측력으로 설명하지 않는다.

실제IAB에서4초지연스켈레톤, API+저장본503 오류/재시도, 저장본대체, 재조회중서울3915건/60개월평균4287유지, 휠확대·드래그과거이동·Home/5년, 키보드탭,249월기록·최근69월필터, RSI62.01왕복/설정유지를 확인했다. 숨겨진BTC차트의늦은갱신이외곽확대버튼을다시켜던경로를 발견해 중앙소유권에맞게차단했다. 최종RSI에서확대활성, 부동산에서지속비활성을확인했다. 390px에서는페이지390/내용374px 가로넘침0이며 실제차트와백테스트를검수했다. 실제pinch·표의실제가로이동·CSV의파일착지는미검증이다. CSV클릭후download이벤트대기가시간초과해재발행하지않았고, 브라우저로컬월fill의이벤트반영차이는실제방향키입력으로69월필터를검증했다.

신규housing영역Hallmarkfinding0. dist+React전체52파일의기존FAIL9/REFLEX83/WARN9는원본대로보존했으며upstream렌더통과로바꾸지않았다. 임시proxy4322종료/포트닫힘·규칙[]·모바일metrics해제·임시탭18닫힘을확인했다. 실제4319탭15에는부산36개월/중립±10%/시차2개월기본화면과계산완료를남겼다. 녹음원음청취/전사와당시빈티지검증·외부검토·운영배포는완료하지않았다. 자세한범위와해시는 docs/real-estate/verification.json 및 ignored build/housing-research에보존했다.


## 테마·재료 / 연기신 페이지 진행

사용자 승인: 기존 상하좌우 패널을 유지하고 중앙에 테마·재료 페이지, 연기신 판정, 근거 타임라인, 차트 표식, 판정 이후 성과를 연결한다. 첫 사례는 하이퍼리퀴드. 원래 서비스 작업본/브랜치를 유지하며 별도 배포·외부 전송·모델/계정 변경은 하지 않는다. frontend-design/pstack 및 데이터 검증 기준을 이어 사용한다. 원래 외부 검토·운영·키움 holds는 유지한다.

공식 Hyperliquid Info API spotMeta로 HYPE/USDC=@107 신원을 확인하고 일봉705개 중 미완료2026-11-03을 제외한704개(~11-02)를 확보했다. 비교 대상 BTC는 같은 거래소 USD 무기한732완료일봉이며 현물·펀딩 포함 수익률로 표현하지 않는다. SDK 공식 GitHub 릴리스0.21~0.24와 Bitwise 발행사2026-04-09 ETP 출시 발표는 날짜를 확인했다. HIP-3/HyperEVM 현재 문서는 기능만 확인하고 최초 발표시각이 없어 확보시각부터만 사용한다. 과거에 현재문서를 소급하지 않는다. 컨퍼런스 메모의 충족 주장은 검증 완료로 사용하지 않는다.

원응답 가격/릴리스/메타데이터·획득영수증은 docs/theme-materials/raw, 문서 전체 응답은 저작권/배포 범위를 줄여 ignored build/theme-materials/raw-source에만 보존한다. 제품에는 자체 요약과 링크/해시만 둔다. importer의 assembly clock은 고정해 재실행이 새 판정을 생성하지 않게 했다. 현행 theme 판본9148b7435b6afa33c772ccd97d60c71b93e0f21cbbbebc5c2443d7e717663204.

세 초기 판정: ETP출시 당시 재구성(2026-04-09 종료), SDK후속릴리스 당시 재구성(2026-06-04T19:49:39Z), 현재 공식근거초기검토(고정2026-11-03T13:36:39.753Z). 연속성은 확인, 기대감/신선함은 현재 보류로 시작한다. 재구성2건과 기록시각고정1건을 구분한다. 다음 UTC일봉종가를 기준으로1/5/20일 뒤 가격변화·BTC차이·기준이후 저가 최대하락을 계산한다. 미완료/결측은0으로 바꾸지 않고, 과거 재구성과 전진 기록의 그룹을 분리한다.

003_themes 별도 DB 판본/channel, UUID중복방지 append-only 판정, input/record 해시와 저장영수증조회, GET자료/API공통계산을 구현했다. 새 판정은 서버시각으로만 저장되며 과거시각 주입은 거절한다. 응답 불명일 때 새번호로 재전송하지 않고 같은번호로조회/재시도한다. 프론트엔드는 SHA/API계산대조·저장본fallback·기존기록보존·Skullet을 사용한다. 공통 BTC chart-navigation으로 실제 캔들/가격선·거래량·휠/드래그/표식선택을 연결했다.

현재 타입 통과, React패널43/43, 실제DB/API14/14. 초기 타입 오류(Object.fromEntries의 부적절 cast)는 명시적세항목 생성으로 수정했다. 전체회귀·독립Python oracle·디자인검사·실제저장/오류/모바일은 다음 검증 단계다. API owned process20151/session3579, 4319와 PostgreSQL55439 유지. IAB2의 탭15(themeTab)를 이어 사용하며 새빌드 reload 직후다. 컨트롤REPL의 이전 browser.user 오류는 REPL만 reset해서 복구했으며 브라우저/다른탭/프로필은 재시작하지 않았다.

테마·재료 최종 수용: 기존2404/2404, React46/46, 실제PostgreSQL/API14/14, 독립Python 2112구간·23232필드 통과. 최종 타입/빌드/정적761파일·487참조 통과. 기존시장/부동산 전체스냅샷과17모형파일 해시 동일. 실제IAB 표식 클릭에서 세로안내선의 SVG 버튼 bbox 문제를 발견해 안내선을 비상호작용 형제로 분리했다. 초기DOM/화면불일치가 있던15번탭은 사용을 중단하고 같은IAB2에 새19번탭을 만들어 실제렌더로 검증했다. 과거근거/판정 타임라인·휠확대·드래그·동일일 E2선택·성과표·RSI왕복/범위보존 확인. 최신 근거 focus는 마지막완료일+32일 범위로 제한한다.

POST 201수락뒤503응답손실을 주입해 sessionStorage의745be394-f480-4c8e-8793-8c8c098c0b98로 hard reload 후영수증GET200을 확인했다. 실제공식근거재검토1건만추가됐고 총4판정이다. 재전송POST없음. API+저장본503오류/재시도, API오류저장본읽기/쓰기차단/기존4기록보존,4초지연테마Skullet확인. 모바일390×700에서 페이지가로넘침0, 성과표374/635px 네이티브키보드가로이동80px 확인. 실제터치pinch는미검증.

새테마영역Hallmark지적0. 짧은성과표의무효sticky를제거해중복상단고정지적을해소했고 기존raw검사도보존했다. 전체기존FAIL9/REFLEX83/WARN10은숨기지않으며upstream렌더NOT_RUN. 최종화면build/theme-materials/final-desktop.png와문서docs/theme-materials/{README.md,verification.json}에범위/해시/한계기록. 임시proxy4323종료/포트닫힘/규칙[]/탭20닫힘/모바일metrics해제. 실제4319탭19를최종기본화면으로남겼다. API20151/PG55439유지. 외부검토·운영배포·녹음전사·키움holds유지.

2026-11-03 사용자 브라우저 지시: #chart-indicator-manager(추가한 인디케이터)의 배경을 투명하게 변경. 기존 불투명 표면 규칙을 이 영역에 한해 최신 요청으로 교체. analysis-dock 기본/포커스, compact-chart-layout, mobile-workspace의 컨테이너 배경만 transparent로 바꾸고 행·버튼·설정창 동작은 유지. 원본 CSS는 ignored build/indicator-transparency에 보존. 실제 사용자 지정 IAB2 탭4에서 computed rgba(0,0,0,0), focus-visible에서도 동일, 모바일390px compact에서도 동일 확인. metrics는 해제. 관련 기존21/21 검사 통과. Hallmark 전체정적 FAIL9/REFLEX79/WARN10(기존공통지적), upstream render NOT_RUN; 실제 화면 desktop.png 보존.

## 미국 S&P500 방향 및 공식 자료 자동 수집

2026-11-03 사용자 지시: 미국 시장 중앙 α·β·γ 영역에 원문 곱의 UP/DOWN 표시와 매일 최신 공식값 반영. 기존 작업본/소유권/배포holds유지. 원문촬영158/R8p163=α×β×γ=SPX 및161/p166=성장·유동성·심리 기록을 확인했고, Plaud287개중관련 메모124/126/127/130/143을 대조했다. 수치계수/기간/원음전사는 미확인이라 대리지표모형 proxy-product-1로 구분. 기존 중앙값/MAD 표준화·평균·KR/RSI계산은 그대로이며 곱의양수UP/음수DOWN/0·결측·노후·미래는유보. 두음수곱은양수임을명시한다.

GDPC1/TB3MS/VIXCLS 공식FRED전체계열을 실제 취득. 잘못된 graph/graph.csv404는 기존manifest의 graph/fredgraph.csv로정정. 기존GDP동일66분기, 금리202개월로10월4.05추가, VIX는Yahoo와접합없이FRED/Cboe전체4266일로교체. 실제API새판본109f03e9f5de16190ba9dab49b898194eb9802ae47606f30f313c7fa8829a3b2, α0.5248506539·β0.1712992405·γ−1.0117361392, 곱−0.0909616738 DOWN. 원공표시각/빈티지검증없음.

004수집장부/해시중복제거원응답과15분API프로세스수집기를구현, 첫실제수집14:35:11.806~14:35:13.786Z 수락 및다음14:50:13.786Z예약활성확인. 동일자료no-op, 3원천전부정상일때만새판본,부분오류원본보존, 단일advisory소유권, 발행CAS, 성공영수증과판본동일트랜잭션, 불명수락원ID조회, 중단기록복구를검증했다. 상태/화면1분재조회·탭복귀·원천해시상호대조·이전판본fallback회귀방지도추가했다. APIowned20151종료후새프로세스/session94205로4319재개. PG55439유지. 테스트후임시proxy4323/session31687·IAB21에서자동반영/오류화면검증중이며19는실제미국시장작업탭.

타입/빌드·DB/API21검사·React51검사·기존2404검사통과. 초기UI회귀2건은기존점수라벨이접기영역에서누락된문제를원래ml-score-total값/라벨로보존해수정했으며기준검사를약화하지않았다. 독립Python MAD·표준화·곱계산이실제API와일치. 최종화면·자동반영·실패·모바일·보존대조·정리와문서수용은계속중. pstack공식경로판본동일/X전체연재신규확인미완료, frontend로컬무결성일치/review_required/미승격. 원외부검토/계정·발행holds유지.

미국방향 최종수용: 실제API신규판본fcb68e704e6164b569a571bcd359e1d94f57346d4b4b0635d6f5636b85fad400. VIX전체원천을FRED로바꿀때남았던Yahoo priceBasis를발견해FRED/Cboe설명·링크·세션시계로정정했고메타데이터변경도새판본으로수락했다. core표준화/곱값은동일. 기존a855판본전체·KR·모든가격시계열·비미국출처·housing/theme판본과판정4개·17모형파일해시동일확인.

최종React51/51, DB/API21/21, 후속수집기부분집합7/7, 기존2404/2404, 타입/빌드/정적761파일487참조통과. 27가지부호/0조합·2음수·상한·오류/노후/미래검사및독립Python actualMAD/곱검산일치. 실제IAB2탭21에서버튼/리로드없이1분뒤3.94→4.05,−.1408→−.0910반영을확인했으며요청시각14:41:41(이전원본)→14:42:41(실제API)를보존. API503저장본fallback으로최신4.05퇴행없음, API+저장본503명시오류/값유지, 실패원천fixture와수집상태503을구분. 수동새로고침도자료와수집상태를함께다시읽도록단일주기를사용.

390×700페이지가로넘침0·실제모바일, 데스크톱1280×720, NASDAQ과과거4231번관측선택재조회보존, KR에는US방향없음/복귀DOWN, 판정식Enter열기/닫기, 최종콘솔오류0확인. 신규영역Hallmark지적0/전체기존FAIL9 REFLEX79 WARN10유지, upstream렌더NOT_RUN. proxy4323종료/포트닫힘/규칙[]/탭21닫힘/metrics해제. 실제19번탭미국시장최종화면과4319 API session39009·PG55439·15분수집활성을남김. 첫자동외부수집과다음예약은확인했으나추후15분타이머주기의시간경과실행은관측하지않았다. 서버/컴퓨터중지중상시수집·운영배포·정확한공표빈티지·예측력·원음전사·외부교차검토는주장하지않는다. 상세기록docs/plspo-market-lab/us-direction-verification.json.

## 2026-11-04 봉 리플레이 수학/논리 점검

사용자질문: 시작점선택시오늘까지재계산되는예측선의수학적오류/논리비약확인. 모형변경없이IAB2탭15의7월10일시작/7월9일커서/일시정지를유지. 현재선(asOf11/2)과회고선(입력7/9·11/3생성·11/2까지117점)은별개이며회고에가격접두부만전달함을코드/3반례/8재생조합/65기존검사로확인. 컨트롤러10,000유한명령열검사는예측수학증명아님. 기존디스크10/31과실화면11/2자료시점차이를분리한뒤공식CMC조회는ignored증거에만저장했다. 실제UI평가JSON한번다운로드성공, 입력hash일치/숫자468+35304개대조의최대상대차이2e-15미만/저장회고바이트동일복원통과. 정확SHA동일재계산으로표현하지않고끝자리차이를기록. 회고11/2값60235.88은현재CM76680.75에강제접합되지않음. 원래당시발행/코드/빈티지미확인·채점off이므로실전예측백테스트로해석하면비약. 소스/모형/저장세션미수정, 메뉴닫힘/커서paused/두출력hash유지, API/US자동수집그대로. docs/architecture-migration/replay-audit-2026-11-04.md 및 ignored build/replay-audit-20261103/audit.json에근거.

## 2026-11-04 선택 기준시점 고정 백테스트 (진행 중)

사용자 승인: 선택일 직전 완료 종가까지만 입력해 경로를 한 번 고정하고 이후 실제 가격과 비교. BTC 입력/평가 모두 Bitstamp로 맞추고 기존 장기 계산은 재사용한다. 현재 모델을 과거 자료에 적용한 재구성이며 당시 발행·역사 빈티지·예측력은 미입증. 기본 cutoff-backtest와 기존 atlas-chart 비교를 별도 저장 키로 분리, 기존 탭15/저장본 보존. 파란 고정 경로, 결과 보기, 30~730일 기간, 비교 오차와 flat 기준 비교를 구현 중. 기존 테스트 기본모드 의존/상태 DOM 순서 회귀를 수정하며 미래 가격 불변성·복원·IAB 실제 화면을 검증한다. API4319/미국 자동 수집/DB/기존 주변 패널은 변경하지 않는다. 근거 build/replay-cutoff-backtest/. 외부 검토 및 운영 배포는 실행하지 않는다.

고정백테스트 실제수용 진행: 새 모형/UI10개 및 기존ETH/리플레이59개 통과. 초기 전체2실패 중 ETH graph의BTC모형 유입은 전용loadCutoffModel callback으로 수정했고, 바의기존조작순서+새모드/결과버튼2개를 계약에 명시했다. 최종host2373/2373통과, Linux고정결과41개 재검사 대기. 실제IAB22에서7/9입력·10/31실제114개·180일예측 MAPE9.7544%/MAE7652.34/flat로그오차개선36.8563%를확인. 저장리로드/하루공개/기간·선캔들전환 모두437fc246..출력동일, 현재전망ee210e..도이전과동일. 구저장889자 b303471d..해시보존. 실제JSON Python검산/재생성없는바이트동일복원, 17기존모형파일동일. 모바일390×700정보메뉴진입·MAPE줄·44px조작·Tab으로결과보기노출/가로넘침0 확인. metrics해제/콘솔0/새22결과화면보존. 이전15탭은현재목록에없어그탭최종상태미주장. API77535/4319는유지, DB·US수집수정없음. docs/architecture-migration/replay-cutoff-backtest-2026-11-04.md 및 ignored증거에기록. 외부검토/운영배포holds유지.

최종수용: full-tests-final.log에서2,414/2,414(호스트2,373+Linux고정41), verify:chart-replay149/149 통과. 최종타입·웹빌드·정적762파일494참조 통과. 현재장기모형/사이클보정/구스냅샷helper해시도감사와동일. Hallmark신규replay지적0/전체기존FAIL9 REFLEX2 WARN10·renderoff를분리기록. 실제브라우저JSON의MAPE/MAE/flat로그오차·방향counts Python검산일치. docs/architecture-migration/replay-cutoff-verification.json에소스·증거해시/범위/한계를기록했다. 로컬구현·검증완료, 운영배포/모형승격/외부검토미실행.

## 2026-11-04 미래 기간선 근거 질문 (읽기 전용 점검)

사용자가170주 등 과거와 다른 미래기간의논리적근거를질문했다. 제품/모형/저장세션은변경하지않고 IAB2탭4의1190일표시와11/2입력재현을대조. 산술은맞지만예시경로최저값2029-10-02가거시저점시계2030-08-11보다313일빠르고 고점2029-07-19에서75일만에BOTTOM으로분류됨. 현재보정−56일/완료훈련3구간은이75일하락기간을검증하지않는다. 같은base/거시시계·시드3개에서75/97/226일, 기존경제시나리오5개중7일·13일도발생. MID-TOP의과거반감기창/미래1/3창정의차이도확인. clock회고8원점/독립목표1개·MAE21vs38은기간선우월성근거아님. 전체UTC날짜/주변환독립Python일치. docs/architecture-migration/interval-rationale-audit-2026-11-04.{md,json}와ignored증거에기록. 해석상근거부족을답변하며계산이나차트는수정하지않았다.

## 2026-11-04 거시 시계·예시 경로 및 기간 비교 구현 (진행 중)

사용자 승인: 거시 사이클 기준점과 경로 전환점을 분리하고 미래 기간선에 과거 분포·민감도 범위를 표시. 기존 날짜/가격/판정/지표/패널 유지. 거시 시계는 가격점이 아닌 별도 시간 기준선, 기존미래 극값은예시경로로명명. 완료과거구간만분포에포함하고MID-TOP정의차이는비교제외. 5기존경제시나리오+선택시나리오2보조시드의7개설정범위는확률구간아님. 기존worker소유권모형을재사용해민감도를계산하고관측/가정/로딩/미확보/실패를분리한다. 원래모형계산해시·범위·가격/주변DOM보존, 통계독립검산·상태회귀·실제IAB데스크톱/모바일수용을예정. 근거 build/cycle-period-comparison/. 기존사용자제외외부검토/배포holds유지.

최종수용: 거시날짜선2개와경로접두어를분리하고미래9관계의과거분포/7설정민감도/미성립개수를연결했다. 실제11/2입력bottom-bottom170주·과거164.7–204.4주(n3)·민감95.3–182.7주를확인. MID-TOP과거정의차이는비교제외. 신규9/기존63/worker회귀20/마지막11 및최종전체2423/2423(2382+Linux41)통과. 초기import.meta VM2실패는전용workerfactory모듈로해결. boundedcycle및음성변이27/고정10/31통합104행통과. 타입·빌드·정적764파일501참조통과. Python통계일치/기존모형등6파일해시동일·실제renderer축좌표/path보존. 실제IAB24데스크톱1168×954/모바일390×700·44px/가로표·포커스/상세2페이지·실패재시도·지연가정전환확인. 콘솔0·metrics해제·정상탭24보존·임시proxy4324및25종료. 기존HallmarkFAIL9 REFLEX2 WARN10은남고변경영역지적0/renderoff. API77535/DB/US수집유지. docs/architecture-migration/cycle-period-comparison-2026-11-04.md 및verification JSON에해시/한계기록. 기존외부검토·배포holds유지.

## 2026-11-04 월말별 고정 경로 자동 백테스트 (진행 중)

사용자 승인: 각 완료 월말까지의 가격/발표 자료로 예측을 고정하고30/90/180/365일 비교, 기존 봉리플레이 연결·계산·네방향패널 유지. 기존 cutoff 모델의365일 경로1회생성/부분구간평가, 실제 Bitstamp동일제공자 비교, 성숙한완전관측만요약·공통원점비교·중복목표독립표본오인방지. 별도IDB고정기록은입력접두부/설정/계산소스식별자로캐시, 미래실제추가시동일경로복원. 전용월말검증중앙패널·기존리플레이읽기전용진입으로구저장보존. 기존API4319/DB/US수집재시작없음, 사용자제외외부감사/배포holds유지. 증거build/monthly-backtest/.

월말검증중간수용:13개월말/완료12·10·7·1,실제표와90일리플레이MAPE14.00%일치·기존7/9저장MAPE9.75%복원. 소스9파일동일/브라우저입력19소스해시및13기록검증·Python30완료구간/요약일치. IAB24데스크톱/모바일390×700·44px/표가로386세로712px/고정헤더확인. proxy4324/PID2403/탭26에서Skulletpending·중단cancelled/오류partial13확인,정상재시도진행. 전체1차2434/2435의패키징31vs30기대값수정후2435/2435통과. 이후저장응답유실/늦은자료소유권추가검증및확장전체수용대기. 최종정리전미완료.

월말 검증 최종 수용: 전체2438/2438(2397host+41Linux), 영향47/47·가정시각UI2/2. Python 완료30구간과전체/공통원점 통계 일치, 실제13고정본/19소스 해시 검증, 기존계산9파일 동일. 타입/빌드/정적 통과. IAB24 데스크톱1168×954/모바일390×700·44px·가로넘침0·고정헤더/스크롤·읽기전용리플레이·기존7/9저장복원·콘솔0·기본metrics복원. proxy4324/PID2403및26탭 정리, 정상24보존, API77535/DB/US수집 유지. monthly-backtest-2026-11-04.md 및monthly-backtest-verification.json에 소스/증거SHA256과한계 기록. 기존외부감사/배포holds 유지. 로컬 완료.

## 2026-11-04 거시 시계 보정 효과 검증

사용자 승인:48개월 무보정/현재보정의 고점·저점 날짜 오차 비교, 같은목표를중복표본으로세지않음, 기존계산/4방향패널 유지 및 실제IAB확인. 기존고정분기원점 평가/폐쇄반감기목표를재사용하고 저점은무보정고점+12개월에동일일수보정을적용. 목표별원점절대오차평균후목표동일가중, 고점·저점별고유목표수/고유사이클수/원점수분리. 미폐쇄목표/불충분·빈일자입력은채점보류. 기존월말가격/거시시계 중앙전환을추가하며 기존저장본/계산/API4319·DB·US수집보존. 외부감사/배포holds유지. 근거build/clock-backtest/.

거시 시계 최종 수용: 고점 MAE38→21일/저점37→20.5일. 각 목표1개·원점8개, 고유 사이클 전체1개·보류8개를 분리했다. Python 독립 종료목표 탐색/달력/16행 오차/계층평균 일치, 미래가격불변·윤년 순서·중복/충돌·동일목표 가중·빈목표/오류/취소 등 신규14개 및 영향29개, 전체2452/2452(호스트2411+Linux41) 통과. 타입/웹빌드/정적773파일528참조 통과. 기존계산8파일 SHA256동일. IAB24에서 월말13개 고정본/모형/전체·공통원점 성적이 이전내보내기와 정확일치, 90일 리플레이14.00% 유지. 주변4개영역/차트44경로/URL보존. 데스크톱1168×954·모바일390×700에서44px/가로넘침0/표가로40px·세로88px/고정헤더와열·목표전환·보류·현재조건부시계·두펼침 확인. 오류·정상재시도·늦은결과거절 실제4324/27검증후 proxy PID79765와탭27정리, metrics해제·정상24결과보존·콘솔오류0. Hallmark기존9/2/10유지, 독립스크롤gate56해석보존/renderoff. 상세 clock-backtest-2026-11-04.md 및clock-backtest-verification.json. 당시발행/빈티지/예측우월성·가격경로극값검증·외부감사·배포는미실행. 로컬완료.

## 2026-11-04 거시 시계 과거 범위 확장

승인 범위: 관측 시작부터 고정 분기 원점으로 확장, 각 원점의 접두부/확인시각만 사용. 기존 보정식/확인조건을 바꾸지 않고 무보정만 가능한 원점과 쌍비교 가능한 원점, 미종료 결과를 분리한다. 동일 목표는 종류/반감기 구간으로 한 번 집계하며 원점과 고유 사이클 수를 구분. 기존 네방향패널·가격계산·월말고정본·수집기 보존, IAB 실화면/독립 검산·회귀 검사. 증거 build/clock-history/.

최종 수용: 2010Q3–2026Q3의65개 분기말을 검토했다. 종료 목표3사이클, 무보정2사이클30원점, 쌍비교1사이클9원점이다. 상태는 쌍비교9·무보정만21·기준점없음9·미종료26으로 분류된다. 보정 근거 부족43개는 미종료13개와 겹친다. 고점38→22.1111일·저점37→21.5556일은 같은9원점 비교이며 전체 무보정96.8/96.1333일과 섞지 않는다. 이전8원점의 개별 결과는 정확히 동일하다.

영향23/23 및 최종 전체2461/2461(호스트2420+Linux41), 타입·웹빌드·정적773파일528참조 통과. 65접두부 미래NaN변이·중복·초기부족·누락·종료경계·worker 방어와 독립Python 음성대조를 포함한다. 실IAB24는 기존 자동갱신 후11/3 입력5953개이며, 65원점·무보정60행·쌍비교18행·목표/계층평균·입력해시를 검산했다. 원래 계산·저장·리플레이·lab owner·index10개 소스 SHA256이 동일하다.

실제 화면에서 초기 시계없음·무보정 전용 목표·고점/저점·미채점56개·JSON·오류 재시도·지연결과 거절을 확인했다. 390×700에서 넘침0·닫기44px·표 가로40/세로70px·고정헤더와 행제목,1168×954에서 주변4영역·62차트경로·URL 보존을 확인했다. 기존 월말13고정본·모형·전체/공통원점 집계가 정확히 동일하다(새0·복원13). Hallmark 기존9/2/10 및 renderoff 유지, 콘솔0. proxy4324/PID58844·탭28 정리, metrics해제·결과24 보존·API77535 재시작 없음. 상세 clock-history-2026-11-04.md 및clock-history-verification.json. 정확한 역사빈티지·당시발행·전체평활식 독립재구현·예측우월성·사용자 제외 외부감사/배포는 미실행이다. 로컬 완료.

## 2026-11-04 v1.31.0 release (in progress)

User authorized commit, push and release of the accumulated owned service branch. Preserve current main/Pages and operational model holds; publish this tested branch as a GitHub release with source and existing offline/research assets. Bump package/lock together, install locked dependencies in CI/Release/Pages builds, keep Node24.22.2 and immutable tags/assets. No new DB/API hosting, local service restart or external model review. Evidence: build/release-v1.31.0/.

Release preflight: unchanged 2461 model tests reused at their verified source; panels51 and isolated PostgreSQL/API22 passed, including a newly fixed stop-before-transport race. Typecheck, static, source/research/ETH events, treasury/numerics, daily clock and renderer gates passed. Immutable forecast replay passed in the original Linux/Node24.22.2 runtime; macOS exact replay differs, and local formal checks lack Java. Remote CI must verify the canonical committed source and formal gates before tag publication. Existing local DB port was unavailable; only owned disposable atlas-release-v1310-check on55441 was used. No main/Pages promotion.

Remote CI41773434386 exposed 68 release-version failures: the replay fixtures expected the new package version while nine active UI entry/import files still used1.30.6; one deployment fixture rejected an explicit24.22.2 pin. Refresh only the affected UI cache keys to1.31.0, retain numerical/calculation sources and frozen monthly model identity, and accept an explicit patch pin within Node24. No tag or release had been published. Re-run the affected journeys before the new source CI.

Release cache correction acceptance:75 affected replay/deployment tests and6 standalone packaging tests passed. All19 monthly calculation-source hashes remain unchanged. The complete formal command passed in an owned, isolated Linux/Node24.22.2+OpenJDK17 runtime with pinned TLC1.7.4, including required negative controls; no host Java installation or operating-service restart. Commit the cache/pin correction and let the tag-triggered Release workflow run the final complete regression and publication gates before it publishes assets.

## 2026-11-04 main merge and GitHub Pages deployment (in progress)

User authorized main integration and actual public Pages verification. Preserve calculation sources and the four perimeter regions. Add a project-subpath/static React entry and saved-data transport, reuse the identical RSI experiment function for static execution, and keep server persistence/collection unavailable on static hosting. Track generated static artifacts in the existing publication inventory, verify deterministic generation before deployment, use IAB only. Preserve existing model promotion holds and user-omitted external reviews. Evidence: build/pages-deployment/.

- Pages adapter implemented: generated static React entry +8 route wrappers, validated project-prefix transport paths, saved snapshot hashes and shared RSI calculation; server API/DB behavior retained. Deep reload exposed document-relative BTC data paths; repaired transport resolution without changing19 monthly model files.
- Preflight:2,461/2,461 full model tests;55/55 panel tests;typecheck, deterministic generated tree, static786files/804references and10 scoped path/structure tests passed. IAB4325:root/US/RSI814.40%/themes deep reload/conditions/cashflow/housing with one of each perimeter region. Linux exact-source CI and main deployment remain pending. External Gemini/reverse review remains omitted by prior explicit user instruction; no external test browser used.

- Direct SOXL deep-link verification found the public saved snapshot still contained only5 markets. Published the previously verified RSI candidate with7 markets and real OHLC forTQQQ/SOXL/233740; exact validated JSON revisiona855c157ff696ff609798b791ebbca26fa659b7174b56d53a90d7d3f75f2bcc5. Existing5 market fields, regions and source objects remain equal. No new provider collection or DB change. Public-history source clocks and local_candidate_unreviewed provenance are retained. Static IAB results match prior service evidence:TQQQ91440.31319421472, SOXL40751.02103937239,23374021947164.92(default capital differs by currency).
- Extended static-coverage assertion added; import failure fixture explicitly removes imported instruments and the future-date negative control now derives from its fixed clock.56/56 panel tests pass. New exact-source Linux CI will replace the earlier adapter-only preflight.

- Final data preflight41780272173:2460/2462 passed; two R3 refresh fixtures still used Nov2 retrieval time and Oct31 appended day, so newly retained Nov2 instrument history was correctly rejected as truncated/out of order. Production refresh/calculation code unchanged; fixture retrieval/next day now derive from retained snapshot clocks. All15 source/rollback tests pass after correction.
- Proceeding with authorized fast-forward integration; main CI/Pages/Release repeat full exact-source gates before publication. Final persisted run IDs, served manifest and IAB desktop/mobile receipts will be recorded in task-localbuild/pages-deployment/status.json; no external review/browser exception introduced.
