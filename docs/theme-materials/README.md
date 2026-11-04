# 테마·재료 / 연기신

로컬 페이지: http://127.0.0.1:4319/market-lab/themes/

기존 상하좌우 차트 패널을 유지하고 중앙 React 화면에 HYPE/USDC 현물 차트, 연속성·기대감·신선함 판정, 근거 타임라인, 판정 기록과 이후 가격 비교를 제공한다. 앱의 `ygs-1`은 근거를 연결하는 분석 기준이며 강연자의 확정된 정량 공식이 아니다. 각 축의 충족·미충족·판단 보류와 이유를 새 기록으로 저장한다. 과거 판정은 덮어쓰지 않는다.

## 자료와 시계

- Hyperliquid 공식 Info API의 spotMeta로 HYPE 토큰/USDC, pair `@107`을 확인했다. 705개 원본 일봉 중 미완료 2026-11-03을 제외하고 704개를 보존했다. 마지막 완료 봉은 2026-11-02, 종가 84.007 USDC다.
- 비교 가격은 같은 거래소 BTC/USD **무기한** 732개 완료 일봉이다. BTC 현물이나 펀딩 포함 투자 수익으로 표현하지 않는다.
- SDK 공식 릴리스 0.21.0~0.24.0은 GitHub의 published_at을 사용한다. [Bitwise 발표](https://bitwiseinvestments.eu/newsroom/Press_Release_09_04_2026/)는 발행일만 확인되어 해당 UTC 날짜 종료 후 연결한다.
- HIP-3/HyperEVM 기능 문서는 최초 공개 시각을 확인하지 못했다. 확보 시각부터만 연결하고 과거 판정에 소급하지 않는다.
- 컨퍼런스 메모는 개인 메모로 구분한다. 녹음 원음 직접 청취·전사 및 정확한 발언 시각 검증은 하지 않았다. 메모의 ‘충족’ 표현을 검증 완료로 쓰지 않는다.
- 원응답·요청·확보 시각·SHA-256은 `raw/`에 있다. 문서 전체 응답은 배포 범위를 줄여 ignored `build/theme-materials/raw-source/`에만 둔다. 제품에는 자체 요약·출처 링크·해시만 싣는다.

초기 검토는 연속성 충족, 기대감·신선함 판단 보류다. 확보한 공식 자료 집합 안에서 날짜가 확정된 미래 촉매를 확인하지 못했으며, 이것이 전체 시장에 미래 재료가 없다는 뜻은 아니다. 과거 ETP 출시/SDK 후속 업데이트 재구성 2건과 오늘 기록한 판정을 분리한다. 과거 재구성은 당시 공표 판본이나 실시간 정보 가용성을 증명하지 않는다.

## 계산

판정 이후 시작하는 다음 UTC 날짜의 완료 일봉 **종가**를 기준으로 1·5·20개 달력 일봉 뒤 종가를 비교한다. 주말을 포함한다. HYPE 변화, BTC 무기한 변화, 두 변화율의 차이(%p), 기준일 이후 저가의 최대 하락을 표시한다. 기준일의 장중 저가는 기준 종가보다 앞서므로 제외한다. 중간 일봉이 빠졌으면 결측이며, 아직 오지 않은 구간은 평가 대기다. 0이나 성공으로 대체하지 않는다.

시점 고정/과거 재구성 × 종합 충족/미충족/보류로 표본을 나눠 완료·대기·결측 수, 평균 변화, 비교 가능한 BTC 표본 수, 상승·하락·보합 수를 표시한다. 소수 선택 사례의 가격 비교로서 실제 매매 수익·인과성·예측력 검증이 아니다. 비용·세금·펀딩·스테이킹·USDC/USD 차이를 포함하지 않는다.

## 경계와 복구

`packages/domain/src/themes.ts`가 계산/검증을 소유한다. `003_themes.sql`의 독립 DB 판본과 append-only 판정 장부를 `apps/api/src/theme-repository.ts`가 소유한다. 원래 시장·부동산 판본은 바꾸지 않는다.

- GET `/api/v1/themes`: 해시 검증 자료, 판정 장부와 공통 계산 결과.
- POST `/api/v1/themes/judgments`: UUID 요청 번호·판본·판정 입력. 서버 시각으로만 기록하고 과거 시각 주입은 거절한다. 동일 번호/동일 내용은 기존 결과, 다른 내용은 409다.
- GET `/api/v1/themes/receipts/:id`: 불확실한 저장의 기존 영수증 확인.

React는 발송 전에 같은 요청 번호와 입력을 sessionStorage에 저장하고 읽어 확인한다. 저장소 실패 시 전송하지 않는다. 응답 유실·새로고침 뒤에도 이전 번호로 조회하며 새 번호로 재전송하지 않는다. API 오류 시 해시 검증 저장본을 표시하되 새 쓰기를 막는다. 같은 판본을 이미 읽었던 경우 저장된 판정도 유지한다. 새로고침은 DB를 다시 읽는 동작이며 외부 가격 자료의 자동 갱신 작업은 아니다.

차트는 기존 BTC의 `bindChartNavigation`을 사용한다. 휠 확대·축소, 드래그 과거 이동, 키보드 조작, 캔들/선, 거래량, 근거 E/판정 J 표식을 제공한다. 같은 날 여러 근거는 묶어 표시하고 선택 목록에서 각각 연다. 외곽 BTC 전용 도구는 기존 중앙 소유권 규칙대로 비활성화되며 RSI로 돌아가면 복원된다.

## 재현과 검증

프로젝트에 고정된 Node 24.22.2를 PATH에 넣은 뒤:

```sh
npx tsx scripts/import-themes.mts
DATABASE_URL=... npx tsx apps/jobs/src/themes.ts migrate
DATABASE_URL=... npx tsx apps/jobs/src/themes.ts import dist/data/themes.json
npm run typecheck
npm run build:web
npm run test:panels
TEST_DATABASE_URL=... npm run test:service
npm test
npx tsx scripts/verify-themes.mts
python3 scripts/verify-themes-independent.py
```

importer는 보존된 원자료와 assembly 시각으로 재현되며 실행할 때마다 새 판정을 만들지 않는다. 새 외부 자료 수집은 이 스냅샷/가격 출처 계약을 보존해야 한다. 검증 범위·보존 대조·실제 화면·실패 복구와 한계는 `verification.json`에 기록한다. 운영 배포·외부 교차 검토·녹음 원전사 검증은 별도 미완료 상태다.
