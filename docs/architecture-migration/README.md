> 최신 기능: [부동산 거래량·실거래가격](../real-estate/README.md), [검증 기록](../real-estate/verification.json). 공식 월별 통계와 가설2·3의 회고 백테스트를 별도 DB 판본·API·중앙 React 페이지로 추가했다.

> 로딩 적용: [Skullet 범위·소유권](skullet-loading.md), [검증 기록](skullet-verification.json). 기존 수치·페이지 상태를 유지하면서 데이터가 없는 대기 영역에만 적용했다.

> 최신: 삼플레를 비트코인과 같은 전체 캔버스·가격/시간축 조작 화면으로 확장했다. 선택 종목에 맞는 상하좌우 도구, 실제 OHLC·거래량, 일/주봉, 종목별 표시 상태를 지원한다. [이번 검증 기록](rsi-workbench-verification.json)을 우선한다. 아래 기록은 각 관측 시점을 보존한다.

`RsiWorkbench`와 `RsiChartCanvas`가 가격·RSI 화면과 보조 패널을 소유하며, 기존 `chart-navigation.js`의 휠·드래그·가격축·시간축·메뉴 제어를 재사용한다. 부모의 `rsi-workbench-controls.js`는 현재 iframe의 origin/source/symbol/epoch 확인 뒤에만 기존 도구를 연결한다. 이전 종목의 늦은 응답은 도구를 바꾸지 못한다. 뒤늦은 BTC 도구 갱신도 현재 종목의 기간·자료 안내를 덮지 못하게 한다. 원래 버튼 노드와 BTC 상태·읽기 패널은 복귀 시 복원한다.

캔들은 원래 종가와 정확히 일치하는 실제 OHLC 11,027개만 새 DB 판본에 보관했다. 기존 7개 종가열·13개 출처·국내/미국 지표는 그대로다. 일봉/주봉만 제공하며 미제공 분봉을 생성하지 않는다. 마지막 주는 진행 중일 수 있고 주봉 지표는 표시용이다. 일봉 백테스트의 모든 체결·평가액·지표는 이전의 독립 Python 대조 결과와 전부 일치한다. SVG/PNG 이미지 생성·미리보기는 실제 IAB에서 확인했으며 운영체제 파일 다운로드 수락은 검증 범위 밖이다.

UI/수집 경계 28, PostgreSQL/API 12, 차트·모바일·실제 standalone 172개가 통과했다. IAB 1168×954와 390×844에서 조작/배치를 확인했다. 실기기 두 손가락 pinch는 IAB가 `Input.dispatchTouchEvent`를 지원하지 않아 미검증이다. 동일한 BTC 제어기의 관련 로컬 검사는 통과했으며 모바일 크기의 실제 포인터 드래그와 확대 버튼은 확인했다. 전체 2,403개를 이번 단계에서 새로 실행했다는 뜻은 아니다. 외부 교차 검토·키움 연결·원격 CI·배포는 수행하지 않았다.

> 최신: 실제 상·하·좌·우 차트 패널은 유지하고 중앙 내용만 교체한다. TQQQ / SOXL / KODEX 233740의 전체 기록과 가정 백테스트를 추가했다. [현재 검증 기록](rsi-history-verification.json)이 이번 관측이며, [이전 검증](regression-repair-verification.json)은 원래 관측 시점을 유지한다.

`dist/center-workbench.js`는 같은 origin의 중앙 iframe만 전환한다. React 도구는 `embedded=1`에서 자체 sidebar/header를 만들지 않는다. 도구와 기존 자료 페이지는 각각 보관하고, React는 종목별 입력·백테스트 결과를 현재 화면의 메모리에 유지한다. 부모가 탐색을 소유하며 source/origin이 다른 메시지는 거절하고 늦은 자식 화면에는 최신 선택을 다시 전달한다. BTC 전용 조작은 중앙 도구 중 inert/disabled, 복귀 시 기존 상태와 최신 보류된 표시 상태로 복원한다. 모바일 메뉴 토글은 유지한다.

새 가격은 DB의 새 판본에만 추가했다. 기존 5개 시장, 11개 출처와 국내/미국 지표는 그대로이며 기존 판본도 조회할 수 있다. `scripts/extend-rsi-history.mjs`는 누락된 종목의 전체 공급자 기간을 요청하고 통화·심볼·시각을 검증한다. KODEX는 원화, 미국 ETF는 달러로 별도 계산한다. 저장 fallback/정적 standalone은 이전 자료를 보존한다. DB 없는 기존 종목 검색은 원래 4개 차트만 제공하며 새 ETF 자료가 있는 것처럼 표시하지 않는다.

백테스트는 `POST /api/v1/market-lab/backtest`에서 판본/종목/기간/자금/RSI/비용을 검증한 뒤 공통 domain 함수로 계산한다. 기본값은 RSI 33.5 하향 Buy, 43 상향 Sell, 편도 10bp, 다음 관측일 종가 체결이다. 전액 매수/전량 매도, 소수점 수량, 종료일 평가를 가정한다. 세금·배당·환율과 원문의 분할 매수·보유 규칙은 구현/검증하지 않았다. 마지막 미체결 신호는 대기로 남긴다. 전체 일별 기록, 신호/체결일 필터와 복사 가능한 CSV를 제공한다. 파일 다운로드 수락을 확인하지 못해 CSV는 화면에 직접 여는 방식으로 검증했다.

# 세 축 연구실 서비스

이 작업은 연구실의 DB/API 연결과 네 React 패널 이전이다. 기존 `/?page=market` 링크는 서비스에서 `/market-lab/`로 연결되며 `lab-tab`·`lab-region`을 유지한다. 다른 페이지와 파일만 여는 standalone은 기존 구현을 사용한다. 배포하거나 main에 병합하지 않았다.

## 구조

- `apps/web`: React·TypeScript·Vite. 탭·지역·키보드 이동·자료 연결/재연결과 진단·조건 실험·현금흐름·RSI 패널을 소유한다. 네 패널과 SVG·날짜 선택·출처 설명은 React 컴포넌트로 렌더링하며 서비스 화면은 기존 `dist/market-lab-view.js`를 마운트하지 않는다. 정적 사이트·standalone용 이전 렌더러는 호환 경로와 대조 기준으로 보존한다.
- `apps/api`: Fastify 읽기 API와 PostgreSQL 저장소. 로컬 검증 서버는 React 빌드와 기존 정적 화면도 제공한다. 운영에서는 같은 origin의 `/api`를 백엔드로 전달하고 프론트엔드는 정적 배포할 수 있다.
- `apps/jobs`: 명시적인 migrate/import/refresh CLI. API 요청은 원천 수집을 실행하지 않는다. refresh는 기존 공개 판본을 입력으로 받아 메모리에서 수집·검증한 후 DB에 발행하며 기존 파일 교체 함수를 호출하지 않는다.
- `packages/domain`: 수학 함수의 소유 위치. 원래 계산 바이트를 그대로 이동했다. `build:domain`은 정적·오프라인 호환 사본 `dist/market-lab-math.js`를 만들고 `verify:domain`이 동일성을 검사한다. 새 규칙은 canonical 파일부터 바꾼다.
- `packages/contracts`: API의 공유 TypeScript 계약. 외부 바이트는 기존 스냅샷 검증과 API 판본/해시 검증을 거친다.
- `db/migrations`: 체크섬 고정 SQL. 적용한 migration을 수정하면 실패한다. 다음 변경은 새 migration으로 추가해야 한다. 현재 runner는 첫 migration을 지원하므로 다음 schema 변경 때 순차 migration 지원도 함께 추가한다.

## 실행

Node 24 이상과 PostgreSQL 17을 사용한다. 기존 DB를 초기화하거나 전역 Node를 바꾸지 않는다. 이 작업에서는 Homebrew Node가 고장나 `build/architecture-migration/runtime/node-v24.22.2-darwin-arm64/bin`의 검증한 작업 전용 Node를 PATH 앞에 두었다. 이 런타임은 Git에 포함되지 않는다.

```sh
npm ci --ignore-scripts
export DATABASE_URL='postgresql://사용자:비밀번호@localhost:5432/전용데이터베이스'
npm run db:migrate
npm run db:import -- dist/data/market-lab.json
npm run build:web
npm run start:api
```

`DATABASE_URL`은 실제 환경 변수로 전달해야 한다. `.env.example`은 예시이며 자동으로 읽지 않는다. 기본 서버는 `127.0.0.1:4319`만 수신한다. 개발 중에는 별도 터미널에서 `npm run dev:web`를 실행하면 Vite의 4320 포트가 API·저장 JSON 요청을 4319로 전달한다.

이 세션의 작업 전용 DB는 TCP 수신 없이 Unix socket `/tmp/atlas-pg-01a19ff4`를 사용한다. 연결값은 `postgresql://atlas@localhost:55439/atlas_market_lab?host=%2Ftmp%2Fatlas-pg-01a19ff4`다. 데이터 디렉터리는 `build/architecture-migration/pg-data`이며 폐기용 테스트 schema는 검사 후 제거했다. 실제 앱용 검증 DB와 백업은 보존했다.

이 세션의 로컬 DB가 중지돼 있다면 기존 `PG_VERSION`을 확인한 뒤, 설치된 PostgreSQL 17의 `pg_ctl -D build/architecture-migration/pg-data -l build/architecture-migration/postgres.log -o "-k /tmp/atlas-pg-01a19ff4 -p 55439 -c listen_addresses=''" start`로 다시 시작할 수 있다. socket 디렉터리는 해당 사용자가 소유하는 mode 0700이어야 한다. 다른 DB 서비스에는 이 명령을 사용하지 않는다.

## API와 저장 계약

`GET /api/v1/market-lab`은 공개 판본 하나와 같은 입력·조회 시각으로 계산한 두 지역 진단을 반환한다. `?revision=<64자리 SHA-256>`은 보관 판본을 조회한다. 없는 판본은 404, 잘못되거나 추가된 query는 400, DB 장애는 상세 내부 오류를 숨긴 503이다. 자료를 쓰는 HTTP 경로는 없다. 정상 응답도 `no-store`이며 실시간 호가·예측력 검증을 의미하지 않는다.

`revision`은 검증된 스냅샷의 `JSON.stringify` UTF-8 바이트 SHA-256이다. DB에는 이 정확한 직렬화 본문과 정규화한 출처·관측을 같은 트랜잭션으로 저장한다. 화면도 응답의 해시를 확인한 뒤 사용한다. 해시는 제공자 인증이나 원천 공표 시점의 증명이 아니다.

출처의 수집 시각, 관측 날짜, 앱이 처음 발행한 시각을 구분한다. 과거 공표 판본이 없는 자료의 공표 시각은 NULL이다. 원래 스냅샷에 없는 과거 release/vintage를 만들어내지 않는다. 최초 import한 현재 자료로 진정한 과거 시점 백테스트를 할 수 있다고 주장하지 않는다.

고유 해시가 중복 import를 막고 트랜잭션 advisory lock이 공개 포인터 변경을 직렬화한다. 오래된 생성 시각의 자료는 보관해도 현재 공개 판본을 되돌리지 않는다. 같은 생성 시각의 다른 내용은 명시적으로 거절한다. 중간 저장 실패는 출처·관측·공개 변경을 모두 롤백한다. 연결 끊김으로 커밋 결과가 불확실하면 새 내용/새 시각으로 다시 만들지 말고 원래 hash로 먼저 조회한다. 같은 입력의 재실행은 중복 자료를 만들지 않는다.

API 연결 실패·잘못된 해시는 저장 JSON으로 대체하고 화면에 대체 사용을 표시한다. 둘 다 실패하면 기존 오류·재시도 화면을 사용한다. 관측·모델 시각은 최신 연결 시각으로 위조하지 않는다. DB의 idle 연결이 끊겨도 API 프로세스를 종료하지 않고 다음 요청에서 다시 연결한다.

운영 시 API에는 해당 schema의 SELECT 권한만 있는 DB 계정을, jobs에는 필요한 쓰기 권한을, migration에는 별도 DDL 계정을 제공해야 한다. 이번 로컬 검증은 이 작업만의 소유 DB 계정으로 수행했다. 운영 계정·호스팅·비밀값·백업 정책은 아직 구성하지 않았다.

## 검사와 증거

```sh
npm run typecheck
export TEST_DATABASE_URL='postgresql://검사계정:비밀번호@localhost:5432/전용검사데이터베이스'
npm run test:service
npm run test:panels
node --test tests/market-lab*.test.mjs
```

서비스 검사는 실제 PostgreSQL과 임시 schema를 사용한다. `TEST_DATABASE_URL`이 없으면 명령이 실패하며 DB 검사 생략을 성공으로 표시하지 않는다. 정적 빌드도 먼저 만들어 경로·기존 링크·파일 경계까지 검사한다. `.github/workflows/market-lab-service.yml`은 고정 이미지의 폐기용 DB로 같은 검사를 실행하는 PR/manual CI 정의다. 원격 CI 실행을 관측한 것은 아니다.

첫 DB/API 단계의 검증 요약은 [verification.json](verification.json), 후속 React 패널 단계는 [react-panels-verification.json](react-panels-verification.json)에 있다. 두 영수증은 각각 당시의 소스 해시와 관측을 보존한다. 자세한 로컬 로그·화면·백업은 ignored `build/architecture-migration`에 보존한다. 11개 서비스 검사, 기존 연구실 56개 검사, React 패널·상태·공통 shell 검사 15개와 타입 검사·프론트 빌드·수학 소스 동일성을 확인했다. DB 백업 복원은 첫 단계의 관측이며 이번 단계에서는 DB 구조를 바꾸지 않았다. 첫 단계의 전체 회귀는 변경 전후 2,403개 중 2,255개 통과·148개 실패로 동일했다. React 이전·공통 화면 적용 뒤에는 2,260개 통과·143개 실패이며 React 이전 체크포인트와 실패 항목이 같다. 새로운 실패는 없다. 오프라인 replay 검사 fixture는 macOS의 /var 별칭을 실제 임시 디렉터리 경로로 맞춰 독립적인 발행 준비가 실행되도록 고쳤다. 따라서 전체 회귀가 통과했다는 의미는 아니다. 실패에는 기존 파일시스템 symlink 거절 및 생성 발행자료 누락 등이 포함된다.

IAB에서 미국/국내 점수, 4탭, 음수 두 축 예시(87.52), 현금흐름 예시(NPV 6,623.58), 수기 RSI 33.5, 날짜 선택, 키보드 탭, 390px 폭, DB 중단 시 저장본 표시 및 복구를 검사했다. 외부 예측력·키움 동등성·GDP 과거 공표 판본은 계속 유보다.

## 남은 단계

1. 원천 접근 거부·수집 실패 이력을 보존하고, 외부 수집의 성공·부분 실패를 실제 공급자 조건에서 검증한다. 분리 작업에서는 원천을 다시 호출하지 않았고 매일 실행하는 운영 schedule도 추가하지 않았다. 기존 OECD 403/500을 해소한 것으로 취급하지 않는다.
2. 연구실 네 패널의 React 이전과 기존 렌더러 대조는 완료했다. 이후 다른 페이지·발행 예측 이력을 같은 방식으로 이전한다. 정적·오프라인 소비자를 확인하기 전에는 기존 렌더러를 제거하지 않는다.
3. 운영 DB·API 호스팅과 읽기/쓰기 계정을 구성하고, 데이터 작업용 비밀값을 승인된 실행 환경에 배치한 뒤 실제 배치·복구·관측성을 검증한다. 현재 GitHub Pages만으로 API·PostgreSQL을 호스팅할 수 있다는 뜻은 아니다.
4. 기존 전체 회귀 실패를 소유 범위별로 분류하고, 해당 릴리스 조건을 통과해야 운영으로 전환할 수 있다.
5. [engineering-cross-audit 용량 규칙](/Users/twoimo/.agents/skills/engineering-cross-audit/references/capacity.md)의 “Outside urgency retain one active review per service”에 따라 기존 작업이 점유한 슬롯을 유지했다. 이 구현의 thesis/Gemini/reverse는 미실행이며 외부 검증·출시 완료가 아니다.

공통 화면의 템플릿 원본·적용 범위·IAB 관측·Hallmark 잔여 항목은 [디자인 기록](../design-system/README.md)과 [검증 영수증](../design-system/verification.json)에 있다.

## 현재 페이지와 회귀 실행 환경

| 메뉴 | 로컬 경로 |
| --- | --- |
| 미국 시장 | `/market-lab/us/` |
| 국내 시장 | `/market-lab/kr/` |
| 조건 실험 | `/market-lab/scenario/` |
| 현금흐름 | `/market-lab/cashflow/` |
| 삼플레·RSI | `/market-lab/rsi/` |

`?page=market&lab-tab=...&lab-region=...` 링크는 계속 동작한다. 페이지 전환과 브라우저 뒤로 가기에서 가정 입력을 유지한다. 운영/배포는 수행하지 않았다.

`npm test`는 `scripts/test.mjs`를 실행한다. 일반 2,362개는 현재 host에서 실행하고, 불변 ETH 모형의 과거 출력과 비트까지 같아야 하는 41개는 Node 24.22.2 Linux/x64에서 실행한다. 해당 환경 자체에서는 2,403개 모두 native로 실행한다. 다른 환경에는 Docker가 필요하며 명시적인 고정 이미지·`--platform linux/amd64`를 사용한다. 이미지 digest는 runner와 영수증에 고정했다. 네트워크는 차단하고 이 작업본과 읽기 전용 Git metadata만 연결하며 임시 컨테이너는 종료 후 제거한다. 계정·원격 host·운영 서비스의 변경은 없다.

Mac `/var` 별칭은 정상 임시 fixture를 생성할 때만 실제 경로로 정규화한다. 명시적인 symlink·교체·경합 공격 fixture와 제품 거절 조건은 그대로다. 모형의 수학 함수, 보존 기록, hash 비교와 허용오차를 바꾸지 않았다. ARM의 마지막 비트 차이를 느슨한 비교로 통과시키지 않는다.
# 부동산 페이지

부동산 거래량·실거래가격의 데이터/DB/API/React 및 회고 백테스트는 [부동산 기록](../real-estate/README.md), 결과·검증 범위는 [검증 영수증](../real-estate/verification.json)을 따른다. 기존 시장 분석과 독립된 판본이다.
