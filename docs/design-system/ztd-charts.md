# ztd-charts 적용 기록

## 원본과 배포 고지

- 저장소: [Junhan2/ztd-charts](https://github.com/Junhan2/ztd-charts)
- 검토한 `main`: [`625b0d9dfb3d0de1c0e20bffab13bcc1d5cd1651`](https://github.com/Junhan2/ztd-charts/commit/625b0d9dfb3d0de1c0e20bffab13bcc1d5cd1651), `chore(release): 0.2.1 (#2)`, 2026-11-05T13:58:25Z.
- 실제 의존성: `@atlas/web`의 **`ztd-charts: 0.2.1`**. 범위 지정 없이 npm 버전을 고정했으며 루트 `package-lock.json`에 tarball과 무결성 값이 있다. React/ReactDOM >=18 peer 요구는 현재 프로젝트의 React 19.3.1과 맞는다.
- 라이선스: [MIT 원문](https://github.com/Junhan2/ztd-charts/blob/625b0d9dfb3d0de1c0e20bffab13bcc1d5cd1651/LICENSE), Copyright (c) 2026 Junhan2. 설치 패키지의 원문을 `dist/vendor/ztd-charts-LICENSE.txt`에 보존했다. 이 파일의 SHA-256은 `da5f6c713243eaa4e52e5827ba6ef5a5c5e06722f196f90ad51feea586e8f78d`이다.

이는 화면 스타일만 참고한 적용이 아니다. `apps/web/src/components/ztd-research-charts.tsx`가 아래 React 컴포넌트를 패키지에서 직접 import해 실제 Atlas 자료와 계산 결과를 렌더한다. 원본 라이브러리 코드를 별도 fork하거나 고치지 않았다.

## 실제 채택 범위

| Atlas 화면 | 직접 사용하는 API | 보존하는 의미 |
| --- | --- | --- |
| 미국·국내 시장의 관측 차트 | `ThemeProvider`, `ChartCard`, `LineChart` | 승인된 시장 가격과 원본 관측일 인덱스, 선택값·단위, 시장 선택, 기존 source gate |
| 조건 실험의 축별 기여도 | `ThemeProvider`, `ChartCard`, `BarChart` | `positiveFactorScenario(...).contributions`의 α·β·γ 순서와 부호, 0 기준 길이, 무차원 단위 |

`ThemeProvider`에 Atlas의 `--bg`, `--surface`, `--text`, `--muted`, `--accent`, `--border`, `--font` 등 기존 역할을 연결한다. 라이브러리의 기본 라임 테마나 예제 데이터는 사용하지 않는다. `ChartCard.actions`에 실제 시장 선택기를 배치하며, 제목과 여백은 Atlas의 밀도에 맞춘다. 가격 및 기여도 전환 애니메이션은 꺼서 선택값이 즉시 반영되게 한다.

현금흐름의 현재 `EconomicsResult`는 감가상각·영업이익·운영현금·NPV 등 요약 결과만 반환하며 연도별 schedule을 포함하지 않는다. 새 연도별 경로를 추정해서 그리지 않았다. 계산기와 결과는 기존 구현을 유지한다. BTC 리플레이, RSI/OHLC 차트, 부동산과 HYPE의 기존 렌더러 및 도메인 계산도 이 의존성 적용으로 교체하지 않는다.

## 실제 원본 코드에서 확인한 제약과 대응

### 관측선

검토한 [LineChart 구현](https://github.com/Junhan2/ztd-charts/blob/625b0d9dfb3d0de1c0e20bffab13bcc1d5cd1651/packages/ztd-charts/src/charts/line.tsx)은 기본 곡선이 `smooth`이고, 계열 내부의 유한한 값만 골라 이어 그린다. 따라서 Atlas에서는 `curve="linear"`를 명시하고, 명시적인 null/NaN/Infinity 사이의 연속 관측 구간을 서로 다른 계열로 전달한다. 결측값을 0으로 바꾸거나 양쪽 종가를 이어서 관측처럼 보이지 않게 한다. 한 점만 남은 구간도 점으로 보인다.

분리한 구간은 같은 자산이다. `colorMode="highlight"`와 모든 계열을 강조하는 판별자를 함께 지정해 모든 구간에 같은 Atlas accent를 사용한다. 범주별 팔레트로 서로 다른 자산처럼 보이지 않게 한다.

기존 관측 차트는 거래 관측 순서의 등간격 축이었다. `xType="band"`로 그 의미를 유지한다. 주말을 새 관측으로 채우지 않으며 원본 배열의 누락된 슬롯도 삭제하지 않는다. 차트 이벤트의 `key`를 원본 날짜→인덱스 맵으로 돌려서 `onDate`에 전달한다. 라이브러리 내부의 계열 인덱스나 필터한 순서를 앱 state에 저장하지 않는다. 키보드 화살표/Home/End와 기존 native 날짜 range가 원본 날짜·값을 읽는다. 호버가 끝나도 마지막 선택 readout은 유지한다.

라이브러리는 폭에 따른 LTTB로 선의 표시 점 수를 줄인다. 전체 원본 배열은 그대로 공급하며 키보드/호버 이벤트, 날짜 range와 선택값은 모든 원본 관측을 사용한다. 선택값을 축소된 대표점이나 보간값으로 대체하지 않는다.

가격은 관측 단위에 맞는 숫자+단위로 표시한다. `ko-KR` 통화 형식의 기본 KRW를 암묵적으로 사용하지 않는다. 이미 퍼센트 포인트인 값도 100을 곱하지 않는다. 기본값·최신 수치·수집 시각을 새로 만들어 넣지 않으며 기존 `marketGate`의 오류·미래 자료·빈 자료 판정에 따라 차트를 보류한다.

### 기여도 막대

검토한 [BarChart 구현](https://github.com/Junhan2/ztd-charts/blob/625b0d9dfb3d0de1c0e20bffab13bcc1d5cd1651/packages/ztd-charts/src/charts/bar.tsx)의 `layout="grouped"`는 `v0=0`, `v1=실제 값`을 사용하고 음수·양수를 함께 축 범위에 넣는다. 이 동작을 그대로 사용한다. 정렬하지 않고 α·β·γ 순서를 유지하며, 표시 직전에 소수점 셋째 자리까지 포맷할 뿐 막대 길이에 쓰는 값은 반올림하지 않는다. 기여도는 퍼센트·수익률이 아닌 무차원 값이다. 기존 가정 지수·압력·λ·양수 인자 및 정규화 기여 표를 유지한다.

### 카드·상태·적용 경계

[ChartCard](https://github.com/Junhan2/ztd-charts/blob/625b0d9dfb3d0de1c0e20bffab13bcc1d5cd1651/packages/ztd-charts/src/components/ChartCard.tsx)의 제목/우측 actions와 한국어 줄바꿈 구조를 직접 사용한다. 로딩·오류·빈 자료 소유권은 Atlas에 남긴다. upstream의 예제 또는 `updatedAt=fetch 성공 시각`으로 원천 관측 시각을 대체하지 않는다.

검토한 API에는 종목 검색이나 command palette가 없다. 통합 검색과 페이지 전환은 Atlas 구현이다. 공모주 이벤트 달력은 upstream `CalendarHeatmap`으로 교체하지 않는다. 동기화 crosshair를 라이브러리 기능으로 주장하지 않는다.

## 검증 경계

`tests/web/ztd-research-charts.test.tsx`는 실제 설치한 패키지를 렌더해서 직선·결측 분리·고립 관측·숫자/단위·원본 인덱스 키보드 탐색·음수/양수의 공통 0 기준·시장 source gate를 확인한다. `tests/web/market-lab-panels.test.tsx`는 독립적인 이전 렌더러와 점수·입력 제약·시장/날짜 range·기여도 표·현금흐름·RSI 결과를 계속 비교한다. 변경한 diagnosis SVG의 정확한 path/좌표만 그 이전 렌더러와의 동일 비교에서 제외한다. 기존 RSI SVG 비교는 유지한다.

이 문서는 소스와 채택 범위 기록이다. 회귀 실행 결과와 브라우저 화면 검증은 실제 실행한 항목만 별도로 보고한다.
