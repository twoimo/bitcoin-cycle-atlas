# 성능·입력·시장 국면 감사 — 2026-10-26

## 결과와 검토 범위

**ISSUES → 수정 및 회귀 검증 완료.** 시작 소스는 `1b7c87ce4fe5d44d05560320bb3a270c639e3bbf`이다. pstack의 실제 `swarm`, `tdd`, `benchmark-checklist` 지침을 읽고, 병렬 작업 중 이 문서의 담당 범위를 시장 국면 계산·터치 미리보기·분석 창 크기 조정으로 한정했다.

계산·입력 변경의 통합 커밋은 `c8f9d985a7a99cdee13a5c74eeda37168f1c7ea8`이다. 통합 기준 `65182ef`의 동시 footer 제거 변경도 보존했다. 이후 태블릿 시각 검토에서 발견한 제목 정렬 보완은 문서 마지막 절에 별도로 기록했다. 아래 성능 결과는 별도로 명시한 시작 소스·측정 소스 해시의 비교이며, 최종 제품 전체를 같은 방식으로 다시 측정했다는 뜻은 아니다.

열려 있던 PR #12의 관련 변경을 참고했지만 현재 파일 전체를 대체하지 않았다. 현재 `main`의 극단 수치 검증, 안정적인 중앙값·Theil–Sen·피보나치 계산, 최신 차트와 자산 비교표 동작을 유지하며 현 코드에서 실패를 재현한 부분만 수정했다. 독립 실행 HTML의 import map 최적화는 이미 현재 소스에 있으므로 중복 작업하지 않았다.

## 재현한 결함과 수정

| 구분 | 변경 전 관측 | 수정 | 실행한 회귀 |
|---|---|---|---|
| 터치 미리보기 작업량 | 길게 누른 후 같은 프레임 안의 32개 `pointermove`마다 미리보기 수행. 초기 표시를 포함해 33회 호출 | 원시 접점 좌표는 모두 보관하고 표시만 프레임당 최신 1개로 합침. `pointerup` 최종 좌표는 즉시 반영. 취소·숨김·capture 상실·pinch 전환 시 예약 작업 무효화 | `mobile-gestures.test.mjs`의 `active touch tracking paints…`, `a queued tracking preview…`가 변경 전 실패, 변경 후 통과 |
| 분석 창 드래그 마지막 좌표 | 높이 400px, 시작 y=300, move y=340, release y=390에서 440px로 저장. 올바른 최종값 490px 누락 | release 좌표로 마지막 높이 계산, 상태 게시·capture 해제 전에 소유권 종료 | `pane resizing commits…`: 변경 전 `440 !== 490`, 수정 후 통과 |
| 분석 창 드래그 소유권 | 두 번째 접점이 첫 드래그를 덮어씀. 숨긴 창의 늦은 `pointerup`도 높이를 변경 | 최초 소유자만 처리. 접힘·숨김·최대화·외부 높이 변경·키보드·blur·문서 숨김·destroy에서 이전 드래그 종료 | `a second pointer…`: 변경 전 `540 !== 400`. `pane hiding…`: 숨김 뒤 `440 !== 400`. 수정 후 모든 경우 통과 |
| 시장 국면의 단위 의존 | `[1,4,2]`, 단기·장기 lookback=2의 마지막 종가는 기하평균 2와 같음. 단위 ×1에서는 `pullback`, ×10에서는 `rebound`, ×100에서는 `transition` | 첫 관측값을 고정 기준으로 삼은 무차원 로그 값에서 비교. 부동소수점 동률은 64×EPSILON에 따른 명시적 수치 동률로 처리 | `a close exactly on its geometric mean…`: 변경 전 ×10에서 실패, 수정 후 ×1·10·100·1e-100·1e100 모두 `pullback` |
| 과거 범위와 미래 검증 의존 | 유효한 `asOf` 이후 가격에 NaN/Infinity/0/음수가 있으면 과거 계산도 실패 | 날짜로 범위를 먼저 확정하고 요청 범위의 가격만 검증. 요청 범위 안의 잘못된 가격과 잘못된 날짜는 계속 거부 | `an invalid future price…`: 변경 전 `Invalid positive finite price at row 5`, 수정 후 국면·전환점·기간 집계 모두 통과 |

통합 검토에서 새 범위 필터의 `Array.filter`가 sparse slot을 건너뛰는 추가 결함을 찾았다. 새 `as-of scope cannot silently discard…` 회귀가 sparse prefix에서 `Missing expected exception`으로 실패하는 것을 확인한 뒤, 모든 index를 방문하는 scan으로 바꿨다. `asOf` 밖을 포함한 **tuple의 정확한 길이 2, 유효 날짜, 중복·역순 없는 전체 날짜 순서**는 계속 검증한다. 미래 가격 값만 과거 가격 검증에서 제외한다. sparse prefix/suffix, 길이 1·3인 미래 tuple, 미래 중복·역순 날짜, 존재하지 않는 미래 날짜를 회귀로 확인했다.

원시 접점 좌표 보관은 pinch 기준점을 바꾸지 않는다. 프레임 합치기는 화면 표시의 중복 작업만 줄이고 release를 버리지 않는다. 이 회귀는 실제 `mountChartTouchTracking`과 `bindChartNavigation`을 운영 순서로 함께 실행하되 DOM·RAF·시간 경계는 결정적 fixture를 쓴다. 실물 장치의 native touch 중재나 화면 FPS를 검증한 것은 아니다.

## 계산 병목과 수치 보존

이전 `computeRollingStates`는 각 관측마다 단기·장기 구간을 복사하고, 기하평균·고저점·로그수익률·분산을 다시 순회했다. 관측 수 N, 창 길이 W에 대해 O(NW) 작업이 발생했다.

수정은 다음을 사용한다.

- 보정 합산을 적용한 이동 로그 평균. 창마다 한 번 재계산하여 오차 누적을 제한한다. 재계산을 합쳐도 분할상환 O(N)이다.
- 단기·장기 최고·최저값용 단조 큐. 각 관측은 각 큐에서 최대 한 번 들어가고 한 번 나간다.
- 두 스택의 Welford 모멘트를 합치는 이동 표준편차. 큰 수익률을 제곱합에서 빼는 방식으로 과거 충격의 반올림 잔차가 조용한 창에 남는 문제를 피한다.
- 실제 창의 최솟값·최댓값으로 기하평균의 정확한 입력 범위를 보존한다. 기존 `finiteMetrics` 검증을 유지한다.

전용 회귀는 큰 충격이 지난 뒤 작은 변동이 이어지는 402개 관측에서 모든 완성 창을 독립적인 두 번 순회 표준편차와 비교한다. `Number.MIN_VALUE`와 `Number.MAX_VALUE`의 평탄한 창은 평균이 원래 값과 정확히 같고 변동성은 0이다. 기존 미래정보 배제, 결측 구간, 주간 완성 구간, 극단 수치, 장기 모델 5개 시나리오 회귀도 통과했다. 이 검증은 유한 입력 사례와 수치 동률 정책을 확인하며 모든 가능한 IEEE-754 입력에 대한 형식 증명은 아니다.

## 측정 결과

**운영의 128경로 장기 예측 계산 중앙값이 234.76ms에서 172.67ms로 줄었다(약 26.45%).** 아래 수치는 Node에서 수행한 순수 계산 시간이다. 브라우저 로딩·DOM·렌더링·네트워크·사용자 입력 지연을 포함하지 않는다.

| 동일 입력의 계산 | 수정 전 중앙값 / 범위 | 수정 후 중앙값 / 범위 |
|---|---:|---:|
| 관측+미래 14,777행 시장 국면 계산 | 79.38ms / 66.54–87.09ms | 27.87ms / 25.63–41.31ms |
| 운영 128경로 장기 예측 전체 | 234.76ms / 223.24–298.47ms | 172.67ms / 147.41–200.04ms |

방법:

- 각 측 2회 워밍업 후 A/B 순서로 5회씩 교대로 실행했다. 원시 10회 측정과 환경·소스·입력 해시는 [rolling-performance.json](rolling-performance.json)에 있다.
- 양측 모두 기준 커밋의 같은 의존 모듈·실제 BTC 5,942행·같은 seed·128개 경로·28일 block을 사용했다. 수정 측에는 `market-structure.js`만 겹쳐 놓아 다른 병렬 수정의 영향을 제외했다.
- 함수가 완성된 결과를 실제 반환한 구간만 측정했다. 결과 소비와 대조는 측정 밖에서 수행했다. 5,856,956개 수치 비교가 절대 또는 상대 허용오차 `1e-11` 안에 있었고, 모든 비수치 필드가 같았다. 가격 경로·전환점·평가 기준·보정 결과의 경제적 내용 해시는 양측에서 정확히 같았다. 실패 0건이다.
- CPU profile은 별도 실행하여 측정 표에 섞지 않았다. 이전 병목은 구간별 로그 평균·수익률·분산·반복 배열 작업이었다. 수정 후 남은 국면 계산 비용은 날짜 변환과 공개 메타데이터·episode 생성이 큰 부분을 차지한다. 모델 전체에는 bootstrap·평가 경로·보정 등 별도 비용도 남으므로 국면 함수의 개선율이 전체 모델의 개선율과 같지 않다.
- 프로파일 원본은 압축한 [수정 전](rolling-before.cpuprofile.gz)·[수정 후](rolling-after.cpuprofile.gz)에 있고, 함수별 집계와 소스 범위 필터는 [rolling-profile-summary.json](rolling-profile-summary.json)에 있다. 프로파일 전체에는 결과 비교도 포함되므로 병목 집계에서는 해당 측 `computeRollingStates`를 조상으로 가진 샘플만 사용했다. 수정 후 집계는 준비 과정의 기준 소스 호출도 제외했다.
- 기준 소스 SHA-256: `57c17ba994c673213f0238f07d0a446151b26846bae712becffa489e31f20b69`. 측정한 수정 소스 SHA-256: `1d6659b20343ae885a38c6bc5c0c057f1b439e4cbbc35552cdeadc4b20a294a3`. 이후 캐시용 import 버전 문자열 변경이 있다면 해당 측정은 이 바이트 신원에 한정된다.

측정 뒤 sparse-slot 보완의 소스 SHA-256은 `cc840a90b3c5bc83e86f27bf891108da04fdd0c5ce348478eadee3f96950383e`이다. 이 보완은 `observations(input, asOf)`의 명시적 `asOf` 분기에만 해당한다. 측정의 직접 국면 호출은 `asOf`를 넘기지 않고, 그 장기·상세 모델 내부 국면·전환점 호출도 frequency/threshold만 전달하므로 수정 분기를 실행하지 않는다. 측정값을 재사용하면서 원래 측정 소스 해시는 보존했고, JSON의 `postMeasurementAmendments`에 구분을 남겼다.

### 재실행

기준 커밋의 `dist`와 `package.json`을 별도 폴더에 `git archive`로 꺼낸 뒤 다음 명령을 실행한다. benchmark가 기준 의존 모듈을 복제하여 수정 모듈 한 개만 바꾼 격리 트리를 임시로 만들고 정리한다.

```bash
node scripts/benchmark-rolling-states.mjs --before /path/to/baseline --after . --samples 5 --output /tmp/rolling-performance.json
```

## 최종 담당 범위 검증

첫 통합 검증의 다음 명령에서 **113개 테스트가 통과**했다. 실패·취소·건너뜀 0이다. 이후 sparse-slot 보완 뒤에는 변경 영역인 `market-structure`, `system-numerical-regressions`, `long-horizon-forecast`, `long-horizon-batch`의 **51개 테스트를 다시 실행해 모두 통과**했다. 새 sparse 회귀도 포함하며 실패·취소·건너뜀 0이다.

```bash
node --test --test-isolation=none tests/market-structure.test.mjs tests/system-numerical-regressions.test.mjs tests/long-horizon-forecast.test.mjs tests/long-horizon-batch.test.mjs tests/chart-performance.test.mjs tests/analysis-focus.test.mjs tests/analysis-dock.test.mjs tests/chart-touch-tracking.test.mjs tests/mobile-gestures.test.mjs
```

이 환경의 기본 자식 프로세스 테스트 실행은 개별 assertion 없이 파일 단위 실패만 보고하기도 했다. 실패 원인의 관측과 위 검증에는 Node 24.22.1의 프로세스 내 러너를 사용했다. 전체 저장소 CI·배포·실제 브라우저 확인은 부모 작업의 통합 결과를 별도로 확인해야 한다.

## 다른 담당 영역의 최종 교차 검토

`65182ef..c8f9d985a7a99cdee13a5c74eeda37168f1c7ea8`의 선택적 글꼴·시작 복구·reader resize·독립 실행 HTML 변경을 읽기 전용으로 검토했다. 구체적으로 확인한 것은 다음과 같다.

- 초기 head 오류 수집과 일반 boot 오류 수집 모두 선택적 font link만 필수 stylesheet 오류에서 제외한다. 필수 CSS·script 실패는 계속 복구 경로로 간다. font link는 처음 `media="print"`로 요청하고 load 또는 이미 존재하는 sheet에서 활성화한다.
- reader resize는 한 pointer만 소유자로 보관하고 pointerup의 최종 좌표를 예약 프레임보다 먼저 반영한다. close·overlay 전환·키보드 reset·capture 상실·resize·blur·문서 숨김에서 취소하는 실제 호출 경로를 확인했다.
- 지연된 글꼴 로딩 후 reader pagination은 `loadingdone`에서 다시 배치한다. 비활성 또는 숨긴 reader는 해당 frame에서 표시를 변경하지 않는다.
- 독립 실행 builder는 선택적 외부 font link와 그 활성화 script를 함께 제거한다. 검증기는 두 요소가 남아 있으면 실패한다. 기존 import map·자료 포함 방식은 유지된다.

이 diff에서 새로 증명된 결함이나 통합 차단 사유를 찾지 못했다. 이 교차 검토 자체에서는 제품 소스를 수정하거나 추가 테스트를 실행하지 않았다. 실제 브라우저·배포 결과를 대신하는 판정은 아니다.

## 태블릿 시각 검토 후 제목 정렬 보완

부모 작업의 추가 태블릿 화면 검토에서 자산 이름 본문과 제목의 가로 고정 규칙이 다른 결함을 발견했다. `760px`보다 넓은 화면에서는 세 칸을 합친 `colspan="3"` 제목만 표시하고, 실제 이름 본문은 독립적으로 왼쪽에 고정했다. 그래서 가로 스크롤 후 BTC 위에 다른 지표 제목이 나타날 수 있었다. 휴대전화는 이미 개별 이름 제목을 고정하고 있었다.

실제 Chromium `156.0.8078.47`에서 수정 전 `768×1024` 화면을 오른쪽 끝으로 `478px` 스크롤하면 이름 셀의 가로 범위는 `48..258.203125px`인데, 그 중앙 위 제목이 **평균 낙폭**으로 관측되었다. [최초 관측 화면](asset-header-original-tablet-portrait.png)과 [수정 전 좌표](asset-header-before.json)를 보관했다.

`dist/daily-data.css`에서 이미 존재하는 자산군·분류·종목명 개별 제목을 모든 폭에서 사용하고, 이름 제목의 `left: 0` 및 겹침 순서를 공통 규칙으로 옮겼다. 합친 제목은 숨긴다. 휴대전화의 자산군·분류 숨김, 열 폭 선언, 색상, 18개 자산 순서와 BTC 우선 표시는 그대로 유지했다.

| 화면 | 오른쪽 끝 가로 스크롤 | 수정 후 제목·BTC 셀의 동일한 x 범위 |
|---|---:|---:|
| 태블릿 세로 `768×1024` | 478px | 48..258.171875px |
| 태블릿 가로 `1024×768` | 222px | 48..258.171875px |
| 데스크톱 `1440×900` | 0px, 표가 화면 안에 들어옴 | 257.640625..503.09375px |
| 휴대전화 `390×844` | 432px | 1..121px |

각 화면에서 시작·중간·끝의 세 위치, 총 12개 좌표를 확인했다. 수정 후 모두 이름 제목과 본문 셀의 왼쪽·오른쪽 경계가 정확히 일치하고, 실제 제목 중앙 hit-test가 `종목명`을 반환했다. 18개 행·페이지 가로 넘침 없음·브라우저 오류 없음도 확인했다. [수정 후 좌표](asset-header-after.json), [태블릿 세로 수정 후](asset-header-after-768x1024.png), [태블릿 가로 수정 후](asset-header-after-1024x768.png)를 보관했다. 외부 HTTP는 차단하고 내장 자료를 사용했으며 한글은 로컬 Noto Sans KR fallback으로 표시했다.

기존 `daily-data-view.test.mjs`의 공통 제목 회귀를 보강하여 수정 전 두 실패를 관측했고, CSS 수정 후 **26개 모두 통과**했다. 위 좌표 검증은 정규식 기반 CSS 테스트의 한계를 보완한다. 변경 전 CSS SHA-256은 `d459983973b9057352f512ec80902daa0dff805c7b1c4af28561a3af9bddad75`, 변경 후는 `c3f0779662017d180ee3f6a0796baa8f1898126f31f0b317c27a14aeffa6c708`이다. 이번 CSS 보완은 앞 절의 계산 성능 측정 경로를 변경하지 않는다.
