# WP4 표기·리플레이 UI / WP7 셸 검토 보고서

**P0·WP4·WP7 수정의 완료된 보조 UI 진단은 소스 `f5b1a874`에서 27/27 통과다. 후속 PR #76의 UI 변경과 formal 검증기 수정을 포함한 PR #78이 main `dbd3b70`에 병합됐다. 누락 의존성 복사를 고친 뒤 40/40 회귀·주식 검증·전체 `verify:formal`을 로컬에서 통과했다. 현재 main의 새 27개 UI 비교와 운영 모델·전체 게이트·공개 배포 결과는 아직 확인 대기다.**

| 현재 확인 단계 | 결과 | 근거 |
|---|---|---|
| P0·WP4·WP7 구현 | PR #75 병합 완료 | 구현 `f5b1a874`, 병합 `b92c6d7` |
| 현재 통합·배포 대상 | main **`dbd3b70`**, 같은 작업 브랜치도 fast-forward | PR #76의 UI 변경과 [PR #78](https://github.com/twoimo/bitcoin-cycle-atlas/pull/78) 검증기 수정 포함 |
| 완료된 전체 로컬 테스트 | **3062/3062 통과**, 소스 `f5b1a874` | [검증 영수증](ui-review-20261108/local-verification/results.json). 최신 통합 소스의 전체 재검증과 구분 |
| 최신 통합 변경의 영향 범위 테스트 | **57/57 통과**, 소스 `cf755f6` | [원본 로그](ui-review-20261108/local-verification/cf755-geometry-tests.log) |
| 현재와 동일 `dist`의 정적 참조 검사 | **930개 파일·954개 참조 통과** | [`cf755f6` 로그](ui-review-20261108/local-verification/verify-static-cf755.log) |
| 마지막 완료 네이티브 UI 비교 | **27/27 통과**, 소스 `f5b1a874` | [24e 판정 영수증](ui-review-20261108/ui-review/diagnostic.json). 현재 통합 소스의 결과로 확대하지 않음 |
| 24e 브라우저 이미지 | **17개 확보, 기본 전후 12개 완료** | [출처·해시 목록](ui-review-20261108/manifest.json). 리플레이 PNG 2개 미수신 유지 |
| 이전 후보의 UI 동일성 | `f5b1a874` → `5df078d` **145개 동일** | [당시 비교 영수증](ui-review-20261108/production-source-comparison.json). 후속 `cf755f6`에는 UI 파일 2개 변경이 있어 적용하지 않음 |
| formal 검증기 복구 | **40/40 회귀·전체 formal 통과**, PR #78 병합 | [주식 검증 영수증](ui-review-20261108/local-verification/formal-equity-fixed.json), [전체 formal 로그](ui-review-20261108/local-verification/formal-full-fixed.log) |
| 새 운영 모델 검증 | **`dbd3b70` 초기화 시작, 결과 대기** | build `5e21418c-95a1-4c8a-8c53-f0135244684a` |
| 새 전체 UI 비교 / 운영 CI / 공개 운영 반영 | **재검증 예정 / 확인 대기** | `dbd3b70`과 `publication.json.sourceCommit`을 대조 |

코드 커밋, 로컬 검증, 보조 UI 진단, 운영 CI와 공개 배포를 구분한다. 3절의 측정값은 완료된 `24e736e3-c6dc-4b31-89ec-29f95e924945` 원본이며 그대로 보존했다. 최신 통합 코드의 새 27개 비교가 완료되기 전에는 그 수치를 새 소스의 수치로 바꾸지 않는다.

## 1. 적용 소스와 배포 대상

| 구분 | 식별자 / 상태 |
|---|---|
| 저장소 | [twoimo/bitcoin-cycle-atlas](https://github.com/twoimo/bitcoin-cycle-atlas) |
| 작업 브랜치 | `fix/wp4-wp7-ui-20261108` |
| 검토 PR | [PR #75](https://github.com/twoimo/bitcoin-cycle-atlas/pull/75) · **병합 완료** |
| 변경 전 애플리케이션 | **`1635f87a10962b7ff5eecd094b6e0625e09771f4`** · 사용자가 2026-11-08 22:55 KST에 확인한 운영 배포 |
| 작업 시작 시 사용자가 확인한 `origin/main` | `bd5b70a` · relay 사진·앨범·링크·미리보기 변경 포함 |
| 작업 중 추가 확인한 `origin/main` | `58799a8439304a695e74d6557de82088f0ca5d5a` · relay 좁은 화면 CSS·캐시 버전 `1.37.1`; 병합 `13523ef04b470614ee8716affc1c2fdd83058a64`에 보존 |
| 변경 후 페이지 생성 기준 | `3d8c6fe3600510b5e1bdebf23ba78253dba4fbab` · 후속 relay 병합과 범례 수정은 아래 소스에 포함 |
| 완료된 24e 비교의 구현 소스 | `f5b1a874817aeda9bb1b7c6f7d731a010757772e` · `dist` 트리 `6c2199767ac39bf99b94de3d94aff41f43f71dd9` |
| UI 작업의 main 병합 | `b92c6d79ccf2fb9a82a344a6b58e3f29dc533bf0` · PR #75 병합 결과, 구현 소스와 같은 `dist` 트리 |
| 이전 운영 후보 | `5df078d1a7e66f09e8c35241efbfc4f8d8fd4001` · 후속 자동 relay 자료 갱신. `dist`: `d7c343e57c42555c47a2eacb85b4266349b7286a` |
| 후속 UI 통합 main | `cf755f619c8aa3e15159753f014894ee19bf26a2` · [PR #76](https://github.com/twoimo/bitcoin-cycle-atlas/pull/76) 병합 |
| 검증기 수정 코드 | `47573f4adf202ca654c6738c506b509fa64794ba` · 임시 주식 검증 사본의 전체 의존성 복사 |
| 현재 main / 같은 작업 브랜치 | **`dbd3b70e567c3047524e6a0e3b5d01b1dc9d910d`** · [PR #78](https://github.com/twoimo/bitcoin-cycle-atlas/pull/78) 병합 후 fast-forward |
| 현재 통합 애플리케이션 `dist` | `a836349f38c7e65835c239dc9f7d74a362241452` · 24e의 `dist`와 다름 |
| 현재 배포·전체 검증 대상 | `dbd3b70e567c3047524e6a0e3b5d01b1dc9d910d` |
| 검증기 | 각 실행의 별도 소스 커밋 및 파일 SHA-256을 진단 영수증에 기록 |

변경 전 기준은 사용자가 실제 문제를 재현한 운영 배포 `1635f87`이다. 이전 보고서에서 사용한 `04860c2`는 그 운영 배포 이후의 WP3 소스 커밋이므로 운영 변경 전 화면으로 취급하지 않는다. 보조 진단의 baseline도 `1635f87`로 변경했다.

PR 병합 `b92c6d7`의 `dist`는 UI 비교 소스 `f5b1a874`와 같았다. 이어진 `5df078d`의 변경 73개 파일은 모두 `dist/data/relay/` 아래였고, 그 시점에는 24e에 묶인 UI 소스 145개 해시가 모두 같았다. [당시 소스 비교 영수증](ui-review-20261108/production-source-comparison.json)의 적용 범위는 여기까지다.

그 뒤 PR #76이 `dist/atlas-price-chart.js`와 `dist/lab-view.js`를 변경했다. PR #78까지 병합한 현재 main `dbd3b70`도 이 두 UI 변경을 포함하므로 **이전 145개 동일 판정을 현재 소스에 적용할 수 없다**. 예측 갱신 대기 중 마지막 완성 차트·선택·포커스를 유지하는 변경을 포함한 새 27개 UI 진단이 필요하다. 검증기 수정 `47573f4`는 PR #78로 병합됐으며 애플리케이션 `dist`는 `cf755f6`와 같다. 이 동일성은 PR #76 이전의 24e와 같다는 의미가 아니다. 이후 문서·증거 커밋도 배포 대상과 각각 식별한다.

## 2. 현재 구현과 동작

P0·WP4·WP7 구현 위에 PR #76의 예측 갱신 대기 중 geometry 보존 변경을 통합했다. 아래 동작 설명과 24e 측정의 소스 범위를 구분하며, 현재 통합 코드의 브라우저 재검증은 예정 상태다.

### P0 — MSTR·BMNR 진입과 로딩 실패

사용자가 `1635f87`에서 보고한 실패는 `/market-lab/charts/?symbol=MSTR` 또는 `BMNR`을 열었을 때 새 종목의 스켈레톤이 끝나지 않고 이전 TQQQ 차트가 iframe에 남는 현상이었다. 콘솔 오류가 없어도 실패를 화면에서 알 수 있어야 한다.

`site-entry.js`는 셸과 자산 컨트롤러를 초기화하기 전에 native 종목의 진입 경로를 확인한다. MSTR·BMNR을 Market Lab 차트 경로로 열면 프로젝트의 루트 차트 경로로 `location.replace()`하며 전달된 종목·차트 설정·해시를 보존한다. 그 결과 native 주식 URL을 ETF의 기본 종목으로 해석하는 초기화를 실행하지 않는다. 이 경로 정정은 차트 상태의 자동 저장과 구분한다.

최초 셸과 중앙 iframe 로딩에는 **20초 제한**을 둔다. 준비 확인 없이 제한에 도달하거나 로딩이 실패하면 스켈레톤을 오류 상태로 바꾸고 `화면을 불러오지 못했습니다.`와 다시 불러오기·재시도 조작을 제공한다. 중앙 iframe은 현재 종목과 현재 전환 번호의 준비 응답을 호스트가 인정하기 전까지 화면에서 숨기고 `inert`·`aria-hidden`으로 조작과 접근성 노출도 차단한다. iframe의 `load` 이벤트만으로 새 차트의 준비를 인정하지 않는다.

중앙 화면 재시도는 실패한 iframe과 그 툴바 호스트를 제거한 뒤 같은 종목을 새 소유권으로 연다. 이전 프레임의 늦은 응답은 새 화면을 준비 완료로 만들 수 없다. `pagehide`에서는 기존 로딩 감시를 정리하고, 브라우저 BFCache의 `pageshow`로 돌아오면 복원된 현재 프레임에 새 전환 번호를 부여해 감시와 준비 응답을 다시 연결한다. 이 복귀는 URL과 방문 기록을 추가로 쓰지 않는다.

구현 근거: [정규 진입 경로](../dist/atlas-navigation.js), [초기 라우팅](../dist/site-entry.js), [셸 로딩 제한](../dist/index.html), [중앙 로딩 상태](../dist/ui/center-loading.js), [프레임 소유권·BFCache 복귀](../dist/center-workbench.js). 회귀 검증은 [4개 진입 조합](../tests/native-chart-routing.test.mjs), [타임아웃·오류·재시도·복귀](../tests/center-loading.test.mjs), [초기 셸 실패 화면](../tests/boot-shell.test.mjs)에 있다.

### WP4-A — 범례와 우상단 안전영역

범례는 실제 SVG 가격 플롯의 왼쪽·오른쪽·상단 좌표를 기준으로 배치한다. 바깥 컨테이너의 고정 폭으로 항목을 잘라내지 않고, 각 항목의 렌더링 폭을 측정하여 남는 항목 수를 `+N`으로 표시한다. 가격 계열과 사이클 색상은 두 행으로 나눈다. 390px와 320px에서는 `범례` 버튼 하나로 전체 화면 시트를 연다.

| 우선순위 / 대상 | 배치 규칙 | 검증할 항목 |
|---|---|---|
| 가격축과 현재가 태그 | 가격축 거터를 유지하고 범례를 실제 가격 플롯 안에 둠 | 축·현재가 태그와 겹침 없음 |
| 모델 근거의 날짜·가격 점 | 실제 데이터 좌표를 유지함. 우상단 기본 자리와 충돌하면 범례를 아래의 빈 자리로 이동 | 모델 점의 좌표 불변, 범례와 충돌 없음 |
| 범례 | 오른쪽 12px, 상단 기본 12px, 최대 폭은 가격 플롯 폭의 42% | 화면 및 가격 플롯 안에 포함, 가로 넘침 없음 |
| 현재 값·출처·리플레이 HUD | 범례 왼쪽의 남는 폭을 사용 | 범례 영역과 겹침 없음 |
| 모델 근거 문구·거시 시계·사건 라벨 | 범례와 다른 HUD의 측정 영역을 피해 문구 상자 배치 | 날짜·가격 기준점 유지, 읽을 수 있는 문구 또는 상세 진입점 유지 |
| 기간선·하단 리플레이 조작부 | 범례·가격축·사이클 정보와 별도의 안전영역을 사용 | 정보 가림 없음, 선택 모드 전환 전후 막대 y 동일 |

범례 시트는 숨겨진 항목을 포함한 전체 의미를 보존한다. `실선 · 관측 사후 기준`, `점선 · 잠정·가정`, 거시 시계와 예시 경로의 구분도 목록에 포함한다. 닫기 및 Escape 후에는 실제로 보이는 열기 버튼으로 포커스가 돌아가야 한다. 리플레이 중에도 범례가 같은 우상단 배치 규칙을 사용해야 한다.

구현 근거: [범례 배치 함수](../dist/ui/chart-legend-layout.js), [범례 컨트롤러](../dist/ui/chart-legend.js), [범례 스타일](../dist/ui/chart-legend.css), [가격 차트의 안전영역 통합](../dist/atlas-price-chart.js).

후속 시각 검토에서 cutoff 리플레이의 고정 예측선은 파란색인데 범례 표본은 금색인 불일치를 확인하여 `f5b1a874`에서 정정했다. `고정 예측` 점선과 `모형 범위` 표본은 실제 차트와 같은 `--replay-cutoff-ink` 색을 사용한다. 설명에는 시작일 전날까지의 관측·그때까지 공개된 평가 자료로 현재 재구성한 경로이며 당시 발행된 예측 기록이 아니라는 점, 모형 범위가 보정된 확률구간이 아니라는 점을 표시한다. 전체 범례 목록도 이 색과 설명을 보존하고 다른 모드로 돌아오면 그 모드의 표시로 갱신한다. 관련 회귀 검증은 **32/32 통과**했다.

3절의 픽셀·입력 수치는 `dist` `6c2199767ac39bf99b94de3d94aff41f43f71dd9`의 24e 원본이다. 현재 통합 `dist` `a836349f38c7e65835c239dc9f7d74a362241452`의 재측정과 구분한다. 범례 색상 정정 전 실행은 뒤쪽 이력으로 분리했다.

### WP7-D·WP4-B — 공통 셸, URL, 리플레이

상단은 종목·간격·차트 유형·지표·종목 기능·변경 기록·명령 검색·차트 메뉴·내보내기·설정의 10개 슬롯을 사용한다. 종목 특화 기능은 5번 슬롯에 둔다. 하단은 기간·날짜·사건·표시 범위·눈금·자동 맞춤·전체 맞춤·상태의 8개 슬롯을 사용한다. 좌우 도구의 순서와 폭, 비활성 사유, 실제 종목의 접근성 이름은 각 종목의 원래 컨트롤을 유지한 상태에서 검사한다.

좌측 도구와 우측 레일은 각각 11개 슬롯의 순서를 유지한다. 종목의 기존 컨트롤 노드와 이벤트 핸들러를 유지하고 미지원 기능에는 비활성 상태와 사유를 제공한다. 상태 때문에 실행할 수 없는 취소·다시 실행·측정 삭제도 같은 방식으로 설명한다. 비활성 툴팁은 조작을 활성화하지 않는다. 차트 접근성 이름은 `TQQQ 가격 차트`처럼 현재 종목에서 생성한다.

#### 공통 URL 키와 이전 링크 호환

| 상태 | 공통 키 | 적용 범위 |
|---|---|---|
| 봉·관측 간격 | `granularity` | 해당 소스가 지원하는 간격만 복원. 주택은 월별 관측 유지 |
| 가격선·캔들 | `type` | 검증된 OHLC가 없는 소스에 캔들을 만들지 않음 |
| 가격 눈금 | `axis` | `log` 또는 `linear`; 키가 없으면 해당 소스 기본값 유지 |
| 기간 프리셋 | `span` | ETH·주식의 기존 `eth-span`·`equity-span`도 입력 별칭으로 읽음. 사용자 편집 후 공통 키로 출력 |
| 실제 표시 날짜 | `view-start`, `view-end` | 일·주·월 차트는 달력 날짜, ETH 분·시간봉은 검증된 초 단위 범위 |
| 수동 가격 범위 | `price-min`, `price-max` | 선택한 가격 눈금에서 유효한 범위만 복원·출력 |
| 축 뒤집기·자석 | `axis-inverted`, `magnet` | 기존 표시 기능의 상태만 보존 |

기간 프리셋의 길이는 기존 종목별 정의를 유지한다. hosted 차트의 실제 선택 범위는 공통 날짜 키로 저장한다. 종목별 모형·재무·연구 설정 키는 기존 소유 모듈이 처리한다.

첫 진입은 전달받은 URL을 읽으며 자동으로 정리하거나 기본값을 채워 쓰지 않는다. 이전 별칭을 공통 키로 바꾸는 일도 실제 사용자 편집 뒤에만 한다. 초기 렌더, 자료 도착, HYPE 부모 캐시 동기화와 움직임 없는 gesture는 변경 기록을 추가하지 않는다.

embedded 차트는 현재 종목과 일치하는 같은 출처의 부모 URL을 읽고, 편집 후 기존 메시지에 `userViewRevision`·`urlView`를 더해 전달한다. 부모는 종목·전환 번호·준비 상태·실제 표시 값의 일치를 검사한 뒤 URL을 쓴다. 첫 준비 응답은 기준 revision만 설정하므로, 이미 편집한 캐시 프레임을 다시 열어도 자동 URL 쓰기가 없다. 자식 iframe은 부모 URL을 직접 쓰지 않는다. 이 표시 상태 복원과 편집은 연구 판정의 자동 기록을 만들지 않는다.

구현 근거: [공통 키·검증](../dist/ui/chart-url-state.js), [hosted 복원·직렬화](../apps/web/src/chart-url-state.ts), [호스트 소유권 검사](../dist/rsi-workbench-controls.js), [고정 셸 슬롯](../dist/ui/shell-slots.js). 실제 초기화 검증은 [native 링크](../tests/native-chart-entry-url.test.mjs), [native 변경 기록](../tests/native-chart-workbench.test.mjs), [HYPE·주택 부모와 차트](../tests/web/instrument-workbench.test.tsx), [호스트 URL 게이트](../tests/web/rsi-workbench-controls.test.tsx)에 있다.

#### 리플레이 조작부

막대 폭은 `min(560px, 100% − 24px)`로 정하고 실제 콘텐츠가 넘칠 때 속도·`D`·최신 이동을 `⋯` 메뉴에서 제공한다. 스크롤 힌트와 페이드·화살표는 미디어쿼리 분기 대신 실제 `scrollWidth > clientWidth`에 따라 결정한다. 키보드·마우스·터치가 같은 조작 집합에 접근하고, 선택 모드 진입·해제에서도 막대 y를 유지하며 범례·사이클 스트립을 덮지 않는지를 측정한다.

픽셀 위치·폭·겹침·입력별 결과는 3절에 소스 `f5b1a874`의 완료된 측정으로 보존하고, 최신 통합 소스의 재검증과 구분한다.

### WP4-C — 표기의 정의

기간선의 `7/7`은 전체 7개 민감도 설정 중 **해당 기간의 양 끝 기준점이 성립한 설정 수 / 전체 설정 수**다. 7개 설정은 기존 경제 가정 5개와 선택 가정의 보조 시드 2개다. 이 수는 적중률·신뢰도·독립 표본 수를 뜻하지 않는다. 배지·상세·비교표에서 같은 정의를 사용하며, `n=3`의 과거 표본 수와 구분한다.

`provisional` 고점·저점은 현재 관측에서 고른 잠정 기준점이라는 설명을 유지한다. `고점권 95%`는 나중에 확인한 최고값으로 계산하는 **사후 정의**이며 당시 알 수 있었던 신호라는 의미를 부여하지 않는다.

`MODEL_SCOPE.md`의 ETH 설명도 실제 화면과 맞춘다. 기본 `adaptive`와 선택 가능한 `pooled` 모형은 모형 중앙값·예시 경로 하나·점별 10–90% 모의 분위수를 표시한다. `valuation`은 별도의 외부 평가 조건 3개에 따른 기준선·범위다. 모의 분위수는 실제 미래의 80% 적중률이나 보정된 신뢰구간을 뜻하지 않는다. 이 문서 정정이 WP3 자산군 모델 사양의 화면 연결이나 캘리브레이션 완료를 뜻하지도 않는다.

구현 근거: [기간 비교 상세](../dist/cycle-period-comparison.js), [기간선 툴팁](../dist/cycle-interval-overlay.js), [기준점 상세](../dist/cycle-milestones-view.js), [고점권 설명](../dist/atlas-analysis.js), [모델 범위](MODEL_SCOPE.md).

## 3. 마지막 완료 측정과 브라우저 증거 — 24e / f5b1a874

**소스 `f5b1a874`의 24e 비교 진단은 27/27 통과했다. 이 판정은 유지되지만 최신 통합 소스 `dbd3b70`의 통과를 뜻하지 않는다.** 변경 전의 6개 통과는 기존 문제를 포함한 관찰 수집이 완료됐다는 뜻이고, 당시 개선 후 검증은 21/21 통과다. 양쪽 모두 런타임 오류와 예상 밖 리소스 오류는 0건이다. 아래 숫자와 이미지 출처는 새 실행을 받기 전까지 변경하지 않는다.

| 측정 식별 | 확인된 값 |
|---|---|
| 진단 실행 | `24e736e3-c6dc-4b31-89ec-29f95e924945` |
| 접수 / 실행 시작 / Cloudflare 성공 종료 | `2026-11-08T15:45:28.951Z` / `2026-11-08T16:07:09.374Z` / `2026-11-08T16:12:33.166Z` |
| 변경 전 UI | `1635f87a10962b7ff5eecd094b6e0625e09771f4` · [원본 before JSON](ui-review-20261108/ui-review-before/report.json) |
| 변경 후 UI | `f5b1a874817aeda9bb1b7c6f7d731a010757772e` · [원본 after JSON](ui-review-20261108/ui-review-after/report.json) |
| UI 진단의 `dist` | before `4ab622a7a81b557e9c3995dfb5063ed3b65f85e2` / after `6c2199767ac39bf99b94de3d94aff41f43f71dd9` |
| 검증기 | `f5b1a874`의 공통 파일 4개. baseline에는 동일 검증기를 복사하고 애플리케이션 `dist`는 보존 |
| 24e 판정 | [총괄 영수증](ui-review-20261108/ui-review/diagnostic.json) · before **6/6**, after **21/21**, 실패 **0** |
| 런타임 | Node **24.22.2**, Ubuntu **24.04.2 LTS**, full Chrome **157.0.8103.38**, Noto Sans CJK KR |
| 실행 중 소스 무결성 | before 139개 / after 145개 파일 검사, 두 단계 모두 변경 목록 `[]` |
| 판정·측정·이미지 무결성 | [manifest](ui-review-20261108/manifest.json), [원본 수신 목록](ui-review-20261108/inventory.json), [측정 요약](ui-review-20261108/measurements.md), [측정 JSON](ui-review-20261108/measurements.json) |

두 화면은 같은 검증기·Noto 글꼴·저장 자료 fixture로 비교했다. fixture는 네트워크 갱신이 실패해 검증된 저장 데이터를 계속 표시하는 조건이다. 따라서 스크린샷 상단의 **갱신 실패 배너는 이 진단 조건의 일부**다. 운영 네트워크·글꼴·자료 판본과 다를 수 있어 사용자의 최초 측정값과 몇 px 차이가 난다. 이번 비교값과 최초 사용자 관찰값은 섞지 않았다.

`rect`는 `(x, y, width, height)`의 CSS px이며 소수점 한 자리로 표시한다. 범례의 화면 초과는 반올림 전 좌표로 `max(0, -left, right − viewportWidth)`를 계산했다. 리플레이의 `scrollWidth / clientWidth`는 외곽 막대가 아닌 **`.chart-replay-actions`**의 수치다. 외곽 rect는 `.chart-replay-bar`에서 따로 측정했다.

### 범례 — 같은 형식의 변경 전·후 비교

각 사례의 `initial` 상태다. 변경 후 여섯 크기 모두 화면과 가격 플롯을 넘지 않았다.

| 뷰포트 | 변경 전 rect | 변경 전 화면 초과 | 변경 후 rect | 변경 후 화면 초과 | 변경 후 표시 |
|---|---|---|---|---|---|
| 390×844 | (25.0, 687.5, 839.1, 13.0) | 474.1px | (220.0, 131.0, 68.0, 44.0) | 0.0px | 범례 칩 → 전체 화면 시트 |
| 320×740 | (25.0, 583.5, 839.1, 13.0) | 544.1px | (150.0, 131.0, 68.0, 44.0) | 0.0px | 범례 칩 → 전체 화면 시트 |
| 768×1024 | (85.0, 870.0, 847.1, 14.0) | 164.1px | (377.3, 127.0, 232.7, 64.0) | 0.0px | 두 행 · +2 / +8 |
| 1024×768 | (85.0, 624.0, 847.1, 14.0) | 0.0px | (525.8, 117.0, 340.2, 64.0) | 0.0px | 두 행 · +6 |
| 1440×900 | (429.9, 756.0, 847.1, 14.0) | 0.0px | (767.1, 117.0, 514.9, 64.0) | 0.0px | 두 행 · +4 |
| 1920×1080 | (909.9, 936.0, 847.1, 14.0) | 0.0px | (1045.5, 117.0, 716.5, 64.0) | 0.0px | 두 행 · +2 |

전체 목록은 여섯 크기 모두 13개 항목과 닫기 조작을 제공했고, 닫은 뒤 열기 버튼으로 포커스가 돌아왔다. 320·390의 시트 rect는 각각 `(0, 0, 320, 740)`, `(0, 0, 390, 844)`다. 768의 변경 전 범례는 화면 밖 164.1px, 가격 플롯 밖 213.1px였으며 두 초과량은 다른 기준이다.

### 리플레이 — 변경 전 일시 정지 상태

| 뷰포트 | 막대 rect | actions scroll / client | 잘린 컨트롤과 초과 px |
|---|---|---|---|
| 390×844 | (8.0, 655.0, 233.0, 54.0) | 617.0 / 223.0 | 모드 설정(+19.9); 결과 보기(+81.9); 시작점 선택(+129.9); 재생(+177.9); 다음 봉(+225.9); 속도(+297.9); D(+345.9); 최신 이동(+393.9) |
| 320×740 | (8.0, 551.0, 163.0, 54.0) | 617.0 / 153.0 | 모드 설정(+89.9); 결과 보기(+151.9); 시작점 선택(+199.9); 재생(+247.9); 다음 봉(+295.9); 속도(+367.9); D(+415.9); 최신 이동(+463.9) |
| 768×1024 | (212.0, 838.0, 351.0, 54.0) | 617.0 / 341.0 | 시작점 선택(+11.9); 재생(+59.9); 다음 봉(+107.9); 속도(+179.9); D(+227.9); 최신 이동(+275.9) |
| 1024×768 | (305.5, 602.0, 420.0, 44.0) | 541.0 / 410.0 | 속도(+58.9); D(+94.9); 최신 이동(+130.9) |
| 1440×900 | (513.5, 734.0, 420.0, 44.0) | 541.0 / 410.0 | 속도(+58.9); D(+94.9); 최신 이동(+130.9) |
| 1920×1080 | (753.5, 914.0, 420.0, 44.0) | 541.0 / 410.0 | 속도(+58.9); D(+94.9); 최신 이동(+130.9) |

### 리플레이 — 변경 후 일시 정지 상태

| 뷰포트 | 막대 rect | actions scroll / client | 잘린 컨트롤과 초과 px |
|---|---|---|---|
| 390×844 | (12.0, 734.0, 366.0, 54.0) | 425.0 / 164.0 | 모드 설정(+55.1); 결과 보기(+117.1); 시작점 선택(+165.1); 재생(+213.1); 다음 봉(+261.1) |
| 320×740 | (12.0, 630.0, 296.0, 54.0) | 413.0 / 94.0 | 처음(왼쪽 21.0); 모드 설정(+92.0); 결과 보기(+154.0); 시작점 선택(+202.0); 재생(+250.0); 다음 봉(+298.0) |
| 768×1024 | (107.5, 910.0, 560.0, 54.0) | 454.0 / 454.0 | 없음 |
| 1024×768 | (235.5, 674.0, 560.0, 44.0) | 478.0 / 478.0 | 없음 |
| 1440×900 | (443.5, 806.0, 560.0, 44.0) | 478.0 / 478.0 | 없음 |
| 1920×1080 | (683.5, 986.0, 560.0, 44.0) | 478.0 / 478.0 | 없음 |

**1440×900에서는 actions 541/410에서 478/478로 바뀌었고 잘린 컨트롤은 0개다.** 768 이상에서도 잘림이 없었다. 속도·`D`·최신 이동은 `⋯` 메뉴에서 접근한다.

320·390에서는 기본 조작부가 수평 스크롤 영역이므로 관찰 순간 밖에 있는 항목과 px를 그대로 기록했다. 이 두 크기는 실제 키보드·터치 스크롤과 메뉴 접근을 통과했다. 힌트·페이드·화살표는 실제 actions 초과 여부에 따라 표시한다. 스크롤 접근이 가능하다는 이유로 모바일의 잘린 px를 0으로 표시하지 않았다. `D`는 이 fixture에서 자동 간격으로 비활성화되어 있으며 변경 전 잘림 목록에도 포함했다.

### 선택 상태·충돌·입력

막대 y는 진입 / 일시 정지 / 시작점 선택 / 선택 취소 순서이며 변화량은 최댓값과 최솟값 차이다. 변경 전 36px 이동은 진입에서 일시 정지로 넘어갈 때 발생했고, 변경 후 네 상태는 모두 같은 y를 유지했다.

| 뷰포트 | 변경 전 y / 변화 | 변경 후 y / 변화 | 변경 후 범례·정보 충돌 | 확인한 입력 |
|---|---|---|---|---|
| 390×844 | 619.0 / 655.0 / 655.0 / 655.0 / **36.0px** | 734.0 / 734.0 / 734.0 / 734.0 / **0.0px** | 모든 기록 상태에서 0 | 키보드·터치 통과 |
| 320×740 | 515.0 / 551.0 / 551.0 / 551.0 / **36.0px** | 630.0 / 630.0 / 630.0 / 630.0 / **0.0px** | 모든 기록 상태에서 0 | 키보드·터치 통과 |
| 768×1024 | 802.0 / 838.0 / 838.0 / 838.0 / **36.0px** | 910.0 / 910.0 / 910.0 / 910.0 / **0.0px** | 모든 기록 상태에서 0 | 키보드·터치 통과 |
| 1024×768 | 566.0 / 602.0 / 602.0 / 602.0 / **36.0px** | 674.0 / 674.0 / 674.0 / 674.0 / **0.0px** | 모든 기록 상태에서 0 | 키보드·마우스 통과 |
| 1440×900 | 698.0 / 734.0 / 734.0 / 734.0 / **36.0px** | 806.0 / 806.0 / 806.0 / 806.0 / **0.0px** | 모든 기록 상태에서 0 | 키보드·마우스 통과 |
| 1920×1080 | 878.0 / 914.0 / 914.0 / 914.0 / **36.0px** | 986.0 / 986.0 / 986.0 / 986.0 / **0.0px** | 모든 기록 상태에서 0 | 키보드·마우스 통과 |

충돌은 `legend.collisions`, `replay.informationCollisions`, `replay.coveredLabels`가 모두 빈 목록임을 확인한 결과다. 입력 표의 마우스·터치는 해당 사례가 실제로 사용하는 입력 모드만 기재했다. 모든 뷰포트에서 모든 하드웨어 조합을 별도로 실행했다는 뜻은 아니다. 여섯 크기 모두 키보드로 속도를 `0.5`로 바꾸는 동작과 `⋯` 메뉴 접근을 확인했다.

### P0 — MSTR·BMNR × 두 경로

| 진입 조합 | 관찰된 최종 경로·화면 | ready까지 | 관측 데이터 수 | 최종 결과 |
|---|---|---|---|---|
| `/?symbol=MSTR` | `/?symbol=MSTR` · MSTR · Strategy | 903ms | 1004 | 통과 · 실제 차트 표시 |
| `/market-lab/charts/?symbol=MSTR` | `/?symbol=MSTR` · MSTR · Strategy | 1059ms | 1004 | 통과 · 실제 차트 표시 |
| `/?symbol=BMNR` | `/?symbol=BMNR` · BMNR · Bitmine | 821ms | 359 | 통과 · 실제 차트 표시 |
| `/market-lab/charts/?symbol=BMNR` | `/?symbol=BMNR` · BMNR · Bitmine | 1183ms | 359 | 통과 · 실제 차트 표시 |

네 사례 모두 최종 `boot: ready`, `chartPainted: true`, 보이는 스켈레톤 0개였다. 중간 관찰에서도 iframe 목록이 비어 있어 이전 TQQQ iframe이 남지 않았다. MSTR 관측 SVG 경로는 12개, BMNR은 18개였고, 네 사례의 런타임 오류는 모두 0건이다.

실제 진단 경로에는 `/bitcoin-cycle-atlas/` 접두사가 있고 표에서는 공개 경로로 줄여 썼다. 소요 시간과 관측 수는 오프라인 fixture 결과이며 운영의 현재 가격·지연을 뜻하지 않는다. 타임아웃 실패 주입·재시도와 BFCache 복귀는 로컬 회귀에서 통과했으며, 이번 네 진입에는 별도 실패 주입·BFCache 왕복 사례가 없다.

### 1440×900 — 12종목 셸

| 종목 | 상단 / 하단 / 좌 / 우 슬롯 | 좌 / 우 폭 | 실제 그래프 접근성 이름 | 초기 상태·비활성 사유 |
|---|---|---|---|---|
| BTCUSD | 10 / 8 / 11 / 11 | 52.0 / 45.0px | `BTCUSD 가격 차트` | 통과 · 측정 없음 |
| ETHUSD | 10 / 8 / 11 / 11 | 52.0 / 45.0px | `ETHUSD 가격 차트` | 통과 · 측정 없음 |
| MSTR | 10 / 8 / 11 / 11 | 52.0 / 45.0px | `MSTR 가격 차트` | 통과 · 측정 없음 |
| BMNR | 10 / 8 / 11 / 11 | 52.0 / 45.0px | `BMNR 가격 차트` | 통과 · 측정 없음 |
| TQQQ | 10 / 8 / 11 / 11 | 52.0 / 45.0px | `TQQQ 가격 차트` | 통과 · 측정 없음 |
| SOXL | 10 / 8 / 11 / 11 | 52.0 / 45.0px | `SOXL 가격 차트` | 통과 · 측정 없음 |
| 233740 | 10 / 8 / 11 / 11 | 52.0 / 45.0px | `233740 가격 차트` | 통과 · 측정 없음 |
| HYPE | 10 / 8 / 11 / 11 | 52.0 / 45.0px | `HYPE 가격 차트` | 통과 · 측정 없음 |
| HOUSING-BUSAN | 10 / 8 / 11 / 11 | 52.0 / 45.0px | `HOUSING-BUSAN 가격 차트` | 통과 · 측정 없음, OHLC 미지원 |
| HOUSING-SEOUL | 10 / 8 / 11 / 11 | 52.0 / 45.0px | `HOUSING-SEOUL 가격 차트` | 통과 · 측정 없음, OHLC 미지원 |
| HOUSING-GYEONGGI | 10 / 8 / 11 / 11 | 52.0 / 45.0px | `HOUSING-GYEONGGI 가격 차트` | 통과 · 측정 없음, OHLC 미지원 |
| HOUSING-NATIONAL | 10 / 8 / 11 / 11 | 52.0 / 45.0px | `HOUSING-NATIONAL 가격 차트` | 통과 · 측정 없음, OHLC 미지원 |

12종목 모두 슬롯 key 순서가 같고 상단 5번은 `instrument`다. 상단 폭은 1388px, 하단 1335px, 좌측 52px, 우측 45px로 같았다. 좌측 11개 슬롯 중 이전·다음 구간은 이 폭에서 공통으로 숨겨져 실제 `painted` 수는 9개이고 우측은 11개다.

모두 초기 undo가 비활성이고 저장 목록은 `[]`였다. 비활성 측정 삭제는 `완료한 측정이 없습니다.`, 네 주택 화면의 차트 유형은 `OHLC 자료가 없어 관측 가격선만 지원합니다.`라는 사유를 제공했다. 현재 종목의 가격 차트 이름과 상단·하단·좌우 영역 이름을 확인했고, 다른 종목의 그래프에 BTC 이름이 남은 사례는 없었다. 공통 URL 복원·편집 후 직렬화와 첫 진입 쓰기 0은 4절의 별도 로컬 회귀와 이 진단의 초기 URL·기록 관찰을 함께 근거로 한다.

### 24e 스크린샷과 전송 출처

**PNG 17개, 2,909,280바이트를 확보했고 원본 3개 JSON과 함께 바이트 수·SHA-256을 대조해 모두 일치했다.** 필수 여섯 크기의 변경 전·후 기본 차트 12장은 모두 확보했다. 아래 `직접`은 `24e…` 로그에서 받은 원본, `동일 SHA`는 이전 보존 PNG가 최종 `24e…` screenshot receipt의 바이트 수·SHA-256과 정확히 일치해 보완한 파일이다.

| 뷰포트 | 변경 전 기본 차트 | 변경 후 기본 차트 | 변경 후 전체 범례 |
|---|---|---|---|
| 390×844 | [직접 · PNG](ui-review-20261108/ui-review-before/wp4-before-390x844-chart.png) | [직접 · PNG](ui-review-20261108/ui-review-after/wp4-after-390x844-chart.png) | [동일 SHA · PNG](ui-review-20261108/ui-review-after/wp4-after-390x844-legend.png) |
| 320×740 | [직접 · PNG](ui-review-20261108/ui-review-before/wp4-before-320x740-chart.png) | [직접 · PNG](ui-review-20261108/ui-review-after/wp4-after-320x740-chart.png) | [동일 SHA · PNG](ui-review-20261108/ui-review-after/wp4-after-320x740-legend.png) |
| 768×1024 | [직접 · PNG](ui-review-20261108/ui-review-before/wp4-before-768x1024-chart.png) | [직접 · PNG](ui-review-20261108/ui-review-after/wp4-after-768x1024-chart.png) | 전송 대상 아님 |
| 1024×768 | [직접 · PNG](ui-review-20261108/ui-review-before/wp4-before-1024x768-chart.png) | [직접 · PNG](ui-review-20261108/ui-review-after/wp4-after-1024x768-chart.png) | 전송 대상 아님 |
| 1440×900 | [직접 · PNG](ui-review-20261108/ui-review-before/wp4-before-1440x900-chart.png) | [직접 · PNG](ui-review-20261108/ui-review-after/wp4-after-1440x900-chart.png) | [동일 SHA · PNG](ui-review-20261108/ui-review-after/wp4-after-1440x900-legend.png) |
| 1920×1080 | [직접 · PNG](ui-review-20261108/ui-review-before/wp4-before-1920x1080-chart.png) | [동일 SHA · PNG](ui-review-20261108/ui-review-after/wp4-after-1920x1080-chart.png) | 전송 대상 아님 |

| 24e 추가 증거 | 확보 상태 |
|---|---|
| MSTR 루트 진입 | [동일 SHA · PNG](ui-review-20261108/ui-review-after/ui-entry-mstr-root-1440x900.png) |
| BMNR 루트 진입 | [동일 SHA · PNG](ui-review-20261108/ui-review-after/ui-entry-bmnr-root-1440x900.png) |
| 1440×900 cutoff 리플레이 | 수치·입력 검증 통과, **PNG 전송 미수신** |
| 1920×1080 cutoff 리플레이 | 수치·입력 검증 통과, **PNG 전송 미수신** |
| 원본 before / after / 총괄 판정 | [before JSON](ui-review-20261108/ui-review-before/report.json) / [after JSON](ui-review-20261108/ui-review-after/report.json) / [diagnostic JSON](ui-review-20261108/ui-review/diagnostic.json) |

24e 실행에서 직접 복구한 PNG는 11개다. 나머지 6개는 `d121c72b…`, 소스 `1e7db4b`에서 보존한 파일이며 최종 실행의 screenshot receipt와 정확히 동일한 바이트임을 확인했다. 해당 실행·소스·회수 방법을 [manifest](ui-review-20261108/manifest.json)의 `sourceExecution`과 `recoveredBytesFrom`에 분리했다. 이전 실행 이미지를 최종 로그에서 직접 받은 이미지로 표시하지 않았다.

전송 예정 19개 중 새 cutoff 리플레이 PNG 2개와 `IMAGES_COMPLETE` 종료 표식은 로그 끝 잘림으로 받지 못했다. 따라서 **PNG 전체 전송 완료는 아니다**. 두 장의 수치·입력 receipt와 전체 진단 판정은 이미 복구했으며, 추가 화면 확인은 운영 배포 뒤 실제 브라우저 증거로 보완할 예정이다. 범례 색상 정정 전 리플레이 이미지를 새 두 장의 대체물로 쓰지 않는다.

## 4. 로컬 검증

아래는 **이번 스레드에서 실행·확인한 결과**다. 이전 스레드에서 전해진 부분 테스트 수와 standalone 기대값 수정 전의 전체 테스트 결과는 현재 검증 결과에서 제외했다. 로컬 테스트 통과와 브라우저에서 실제 픽셀·입력을 확인한 결과를 구분한다.

| 실행 | 확인된 결과 | 범위 / 남은 확인 |
|---|---|---|
| 고정 Node **24.22.2**의 완료된 `f5b1a874` 전체 `npm test` | **3062/3062 통과, 실패 0, 건너뜀 0** | 소스 `f5b1a874`. 정식 테스트 실행기 단일 배치, 종료 코드 0. `complete: true`, 실행 228814.099319ms, 약 3분 49초 |
| 검증기 수정 `47573f4` 회귀 | **40/40 통과, 실패 0, 건너뜀 0** | [원본 로그](ui-review-20261108/local-verification/equity-fixture-tests-fixed.log). 의존성 파서·임시 사본 검증 |
| 수정 후 주식 formal 검증 | **통과** · 원본 / 격리 사본 / 복원 후 각각 28개 테스트 통과 | [로그](ui-review-20261108/local-verification/formal-equity-fixed.log) / [JSON](ui-review-20261108/local-verification/formal-equity-fixed.json). 고의 mutation 7개가 모두 기대 assertion으로 종료 1 |
| 수정 후 `npm run verify:formal` | **전체 통과, 종료 코드 0** | [원본 로그](ui-review-20261108/local-verification/formal-full-fixed.log). market·equity·ETH·publication·replay 검증 포함 |
| 최신 통합 `cf755f6`의 예측 대기 geometry·관련 영향 범위 | **57/57 통과, 실패 0, 건너뜀 0** | [원본 로그](ui-review-20261108/local-verification/cf755-geometry-tests.log). 38390.65673ms; 전체 재검증을 대신하지 않음 |
| `npm run verify:static`, 최신 통합 `cf755f6` | **통과 — 930개 파일, 954개 참조** | [원본 로그](ui-review-20261108/local-verification/verify-static-cf755.log) |
| native URL·4경로 routing·viewport·workbench·ETH 상태/history·shell | **49/49 통과** | `0517d48`에 포함된 공통 URL 변경 검증. 원래 종목·자료·그리드와 첫 진입 기록 보존 |
| React HYPE·주택 실제 mount / URL / 호스트 소유권 / 툴팁 | **19/19 통과** | 첫 진입 revision·URL 쓰기·sessionStorage 쓰기 0, 사용자 편집·캐시 복원·잘못된 종목/전환 번호 검사 |
| `npm run typecheck` | **통과** | 공통 URL 변경과 추가 회귀 테스트의 TypeScript 검사 |
| cutoff 리플레이 범례·전체 목록 관련 회귀 | **32/32 통과** | `f5b1a874`의 실제 선과 표본 색상·의미 일치, 전체 목록과 일반 모드 복귀 검사 |
| `npm run verify:static`, 구현 소스 `f5b1a874` | **통과 — 931개 파일, 954개 참조** | [원본 로그](ui-review-20261108/local-verification/verify-static.log). 전체 테스트와 같은 구현 소스 |
| `npm run verify:static`, 운영 후보 `5df078d` | **통과 — 930개 파일, 954개 참조**, 종료 코드 0 | [후속 relay 자료 갱신 후 로그](ui-review-20261108/local-verification/verify-static-5df078d.log). 이전 931개 결과와 별도 |
| `npm run verify:pages` | **통과 — 12개 파일, 9개 경로** | 페이지 생성 커밋 `3d8c6fe` 이후 relay 병합·범례 정정 후에도 생성 페이지와 소스의 일치 재확인 |

완료된 `f5b1a874` 전체 테스트는 [원본 npm 로그](ui-review-20261108/local-verification/npm-test.log)(736668바이트)와 [검증 영수증](ui-review-20261108/local-verification/results.json)에 보존했다. [정적 참조 로그](ui-review-20261108/local-verification/verify-static.log)와 [페이지 검사 로그](ui-review-20261108/local-verification/verify-pages.log)도 같은 소스 기준이다. 영수증에 각 로그의 바이트 수와 SHA-256이 있다. 로그의 `ATLAS_TEST_TOTAL`은 `complete: true`, `tests: 3062`, `pass: 3062`, `fail: 0`, `skipped: 0`, `batches: 1`이다. 이 로컬 결과를 Cloudflare CI나 운영 배포의 성공으로 표시하지 않는다.

검증기는 module reference parser로 필요한 의존 파일 75개를 찾아 임시 사본에 복사하고, mutation을 적용하기 전에 변경하지 않은 격리 사본의 28개 테스트부터 통과시킨다. 원본·격리·복원 상태가 각각 통과했으며, 7개 고의 mutation은 누락 모듈 오류가 아닌 기대 assertion으로 모두 종료 코드 1을 냈다. TLC의 8개 변형도 현재 모형 통과와 7개 의도한 불변식 위반을 각각 확인했다. 이 로컬 복구 결과는 새 main의 운영 전체 CI가 완료됐다는 뜻은 아니다.

## 5. 운영 CI와 공개 배포

| 단계 | 대상 / 현재 확인 |
|---|---|
| PR #75 / PR #76 / PR #78 | P0·WP4·WP7, 예측 갱신 대기 geometry, formal 검증기 복구 모두 병합 |
| 현재 main / 같은 작업 브랜치 | **`dbd3b70e567c3047524e6a0e3b5d01b1dc9d910d`** |
| 검증기 수정 커밋 | `47573f4adf202ca654c6738c506b509fa64794ba` |
| 애플리케이션 `dist` | `a836349f38c7e65835c239dc9f7d74a362241452` · `cf755f6`와 동일, 기존 24e와는 UI 2개 파일 차이 |
| 이전 후보 `5df078d` 모델 | **실패** · build `5f5ff0ff-0f3a-4aa3-b86a-39250980641e`, formal 게이트 `2026-11-08T16:41:13.945Z` 실패. [원문](ui-review-20261108/local-verification/formal-failure-5df078d.json) |
| 이 실패 실행에서 완료한 부분 | 전체 테스트 **3062/3062**와 선행 게이트는 통과. formal 실패가 있으므로 전체 모델 검증은 실패 |
| 이전 `cf755f6` 모델 | build `f84c4134-0636-40a8-a4ce-817222673038` · 수정 소스로 교체하기 위해 `2026-11-08T16:49:56.030Z` superseded 취소. 게이트 통과로 집계하지 않음 |
| 검증기 복구 로컬 결과 | 회귀 **40/40**, 주식 원본·격리·복원 각각 **28개**, 의도한 mutation 7개·TLC 8개 변형, 전체 `verify:formal` **종료 0** |
| 새 정식 모델 빌드 | **초기화 시작** · `5e21418c-95a1-4c8a-8c53-f0135244684a`, 소스 `dbd3b70`, `2026-11-08T16:49:56.951Z` · 전체 결과 대기 |
| 새 전체 UI 진단 | 통합 `dbd3b70`에서 **27개 전체 사례 재실행 예정**. assertion은 유지하고 PNG stdout 전송 대상만 제한 |
| 기존 전체 네이티브·모델 게이트 / 퍼블리케이션 | `dbd3b70` 전체 결과와 배포 영수증 대기 |
| 사용자 확인 운영 기준 | `1635f87a10962b7ff5eecd094b6e0625e09771f4` · publication `2026-11-08T13:03:05Z` |
| 이번 변경의 공개 운영 반영 | **확인 대기** |
| 완료 판정 대상 | [운영 publication.json](https://bitcoin-cycle-atlas.twoimo.workers.dev/publication.json)의 `sourceCommit`과 `dbd3b70`의 일치 |

5df의 formal 실패는 mutation 대상의 기대 assertion 대신 `ERR_MODULE_NOT_FOUND`가 발생했기 때문에 검증기가 거부한 것이다. 원문에는 임시 사본의 `dist/ui/chart-url-state.js` 누락과 `deferred-readiness` mutation이 기대한 원인으로 실패하지 않았다는 메시지가 있다. PR #78은 필요한 의존성 전체를 복사하고 변경하지 않은 격리 사본을 먼저 검사하도록 고쳤다. 수정 후 로컬 formal 통과는 별도 결과로 기록하며, 앞선 실패 이력을 지우지 않는다.

보조 UI 진단은 공개 하위 도메인과 preview URL을 끈 별도 Worker에서 수행하며 사이트를 배포하지 않는다. **기존 24e의 27/27 통과·로컬 formal 복구·PR 병합으로 새 운영 CI·공개 배포 완료를 표시하지 않는다.** 통합 `dbd3b70`의 전체 게이트·브라우저 비교·공개 응답을 각각 확인한다.

사용자가 제공한 예상 소요는 push 이후 모델 빌드 약 12분과 퍼블리케이션 배포 약 15분이다. 예상 시간이 지났다는 사실로 완료를 판정하지 않고 공개 `sourceCommit`과 배포 대상을 대조한다. 보고서·증거만 추가하는 커밋도 애플리케이션 배포 대상과 구분한다.

## 6. 아직 남은 확인

- 통합 main `dbd3b70`을 대상으로 한 27개 UI 비교. 기존 24e 측정은 원래 소스의 증거로 보존.
- `dbd3b70`의 운영 모델·전체 네이티브·퍼블리케이션 CI 결과.
- 공개 `publication.json`의 `dbd3b70` `sourceCommit` 일치와 운영 브라우저 증거.
- 24e에서 미수신한 1440·1920 cutoff 리플레이 PNG를 새 실행 또는 운영 브라우저의 별도 출처 이미지로 보완, 진단 리소스 정리.

## 부록 A. 사용자가 제공한 변경 전 관찰

아래 두 표는 **이번 요청에서 사용자가 제공한 `1635f87` 측정값**이다. 이 작업의 새 브라우저 실행에서 다시 측정한 값과 혼합하지 않는다. 요청서에서 제공하지 않은 좌표·높이·`clientWidth`는 추정하지 않고 `미제공`으로 표시했다.

### 범례

| 뷰포트 | 위치 | 크기 | 문제 |
|---|---|---|---|
| 1440×900 | x=427, y=756 | 850×14px, `flex-wrap: nowrap`, 13px | 플롯 하단 중앙, 리플레이 막대와 충돌 |
| 390×844 | 미제공 | 너비 **842px**, 높이 미제공 | 화면 밖 **477px 초과** |
| 320×740 | 미제공 | 미제공 | 화면 밖 **552px 초과** |

### 리플레이 하단 막대

| 뷰포트 | 막대 | 내부 스크롤/표시 | 잘린 컨트롤 |
|---|---|---|---|
| 1440×900 | 너비 420px, 높이 미제공 | 콘텐츠 536px / `clientWidth` 미제공 | 속도 일부(+54px), `D`(+90px), `최신 차트로 이동`(+126px) |
| 390×844 | 외곽 크기 미제공 | 612 / 312px | 개별 목록 미제공 |

사용자는 233740·HYPE·서울 아파트·시장 분석에서도 같은 범례 문제를 보고했다. 이전 문서에 있던 추가 좌표·막대 높이·Tab 스크롤 수치는 이번 요청에 없고 현재 스레드의 원본 로그도 연결되지 않아 이 표에서 제외했다.

보존된 P0 화면: [MSTR 로딩 상태](ui-review-20261108/p0-mstr-loading-before.jpg).

## 부록 B. 커밋 이력

주요 작업 커밋은 다음과 같다. 기존 브랜치에서 이어받은 앞의 세 커밋은 구현 이력이며, 이전 스레드의 테스트 결과를 이번 실행의 통과로 옮기지 않는다.

| 커밋 | 변경 내용 |
|---|---|
| [`fecfd9e`](https://github.com/twoimo/bitcoin-cycle-atlas/commit/fecfd9e526bb8824688b52732853e578398e511c) | 민감도 설정 수의 정의와 표기 정정 |
| [`78683d9`](https://github.com/twoimo/bitcoin-cycle-atlas/commit/78683d9d516baf3e8307067593e10d8eeeac11ef) | 측정한 플롯 우상단에 반응형 범례 배치, 안전영역과 전체 목록 연결 |
| [`d6b01f7`](https://github.com/twoimo/bitcoin-cycle-atlas/commit/d6b01f7ba3df1875e0759a034d9786bf52677903) | 분리된 네이티브 브라우저에서 변경 전·후 UI를 측정하는 보조 진단 경로 |
| [`7a35847`](https://github.com/twoimo/bitcoin-cycle-atlas/commit/7a358477b3609f847994a8c20ea1c3226a175397) | 비활성 셸 컨트롤의 사유와 툴팁을 제공하고 실제 지원 여부·기존 핸들러를 유지 |
| [`bbea91e`](https://github.com/twoimo/bitcoin-cycle-atlas/commit/bbea91e3d9b86d50df30b9de0ea2e6ccca4f2a55) | 운영 baseline을 `1635f87`로 정정하고 MSTR·BMNR 두 경로, 리플레이 선택 모드, 비활성 사유의 브라우저 검증을 추가 |
| [`4c0cab2`](https://github.com/twoimo/bitcoin-cycle-atlas/commit/4c0cab2d89dab55f02cad4701d506da4f32e01de) | native 주식 진입 URL을 정규 경로로 전환하고 셸·iframe의 20초 로딩 제한, 오류·재시도, 이전 차트 숨김을 구현 |
| [`d820123`](https://github.com/twoimo/bitcoin-cycle-atlas/commit/d8201236ca1dba1c50b088f2560e37ca5ac9f703) | 브라우저 뒤로·앞으로 이동으로 BFCache에서 복원될 때 현재 프레임의 로딩 소유권을 다시 연결하고 URL을 보존 |
| [`b0e6fe5`](https://github.com/twoimo/bitcoin-cycle-atlas/commit/b0e6fe512e629f592eb995799784b5414de8e4b5) | `origin/main`의 relay 사진·앨범·링크·미리보기와 자료 갱신을 유지하면서 UI 작업 브랜치에 병합 |
| [`0517d48`](https://github.com/twoimo/bitcoin-cycle-atlas/commit/0517d48a56c7d934085adb77725dc44f71f3ed19) | 공통 차트 URL 키·이전 별칭 읽기 호환을 연결하고 초기 진입·캐시 복원에서 URL·변경 기록 쓰기를 막음 |
| [`3d8c6fe`](https://github.com/twoimo/bitcoin-cycle-atlas/commit/3d8c6fe3600510b5e1bdebf23ba78253dba4fbab) | 공통 차트 URL과 로딩 셸 변경을 반영한 Market Lab 번들·정적 진입 페이지를 재생성 |
| [`83e3c9e`](https://github.com/twoimo/bitcoin-cycle-atlas/commit/83e3c9e8175cadf20bb4ac2ca44aab1a1791b064) | 진단 fixture의 진입 경로를 맞추고 hosted 차트가 실제로 그려진 뒤 측정하도록 보완 |
| [`4fadcc2`](https://github.com/twoimo/bitcoin-cycle-atlas/commit/4fadcc2ada131ccf578f1a2f5a2dd5b0f6ffad9d) | 전환 중 아직 body가 없는 hosted 문서를 준비 대기로 처리하도록 진단기의 null 검사를 추가. 애플리케이션 `dist`는 `83e3c9e`와 동일 |
| [`96382f6`](https://github.com/twoimo/bitcoin-cycle-atlas/commit/96382f6af13ff19f61ca762c48381f95afb6be52) | 오프라인 가격 검사를 실제로 보이는 차트 소유자에게 연결. 주택 화면에서 뒤에 숨은 BTC 가격을 검사하던 검증기 오류를 수정 |
| [`1e7db4b`](https://github.com/twoimo/bitcoin-cycle-atlas/commit/1e7db4bdfa33774d2d9871aaf015c16df27807f4) | 판정·원본 JSON을 PNG보다 먼저 전송하고, 원본 PNG 전송량에 상한을 두어 Cloudflare 로그 잘림을 방지 |
| [`f1734ba`](https://github.com/twoimo/bitcoin-cycle-atlas/commit/f1734ba8c0b197a419118e5fb24d096d58184486) | baseline에 복사하는 검증기 의존성 목록을 공통화하고 오프라인 가격 소유권 helper도 포함. baseline 애플리케이션은 변경하지 않음 |
| [`58799a8`](https://github.com/twoimo/bitcoin-cycle-atlas/commit/58799a8439304a695e74d6557de82088f0ca5d5a) | 작업 중 `origin/main`에 추가된 relay 좁은 화면 CSS·캐시 버전 변경. 병합 `13523ef`에 보존 |
| [`13523ef`](https://github.com/twoimo/bitcoin-cycle-atlas/commit/13523ef04b470614ee8716affc1c2fdd83058a64) | 최신 `origin/main`의 relay 좁은 화면·캐시 변경을 차트 UI 작업 브랜치에 병합 |
| [`f5b1a874`](https://github.com/twoimo/bitcoin-cycle-atlas/commit/f5b1a874817aeda9bb1b7c6f7d731a010757772e) | cutoff 리플레이 범례를 실제 파란 고정 예측선·모형 범위와 맞추고, 전체 목록에도 재구성·확률 해석의 설명을 유지 |
| [`a1bc521`](https://github.com/twoimo/bitcoin-cycle-atlas/commit/a1bc521f9ecca865728ee99f62c8618ff11b2f50) | 최신 로컬 검증 원본 로그·해시 영수증과 배포 전 MSTR 로딩 화면을 저장 |
| [`ff84c731`](https://github.com/twoimo/bitcoin-cycle-atlas/commit/ff84c731) | 최종 UI·운영 확인을 대기로 표시한 진행 보고서를 저장 |
| [`b92c6d7`](https://github.com/twoimo/bitcoin-cycle-atlas/commit/b92c6d79ccf2fb9a82a344a6b58e3f29dc533bf0) | PR #75를 main에 병합. 애플리케이션 `dist`는 `f5b1a874`와 동일 |
| [`5df078d`](https://github.com/twoimo/bitcoin-cycle-atlas/commit/5df078d1a7e66f09e8c35241efbfc4f8d8fd4001) | main의 자동 relay 자료 갱신 73개 파일. 이 후보까지는 UI 진단의 145개 소스가 동일했으며 운영 formal 게이트는 후속 실패 |
| [`83030f2`](https://github.com/twoimo/bitcoin-cycle-atlas/commit/83030f226d5dedc63b2042aeb32beda181c9cd8a) | 최종 UI 원본 JSON·측정·이미지 17개·출처 및 운영 소스 비교 증거를 저장한 문서 전용 커밋 |
| [`cf755f6`](https://github.com/twoimo/bitcoin-cycle-atlas/commit/cf755f619c8aa3e15159753f014894ee19bf26a2) | PR #76 병합. 예측 갱신 대기 중 마지막 완성 차트 geometry·선택·포커스를 보존하는 UI 2개 파일 변경 |
| [`6c1a08a`](https://github.com/twoimo/bitcoin-cycle-atlas/commit/6c1a08a87affa9be191f196d4603a25a79fbdf49) | 같은 작업 브랜치에 최신 main `cf755f6`과 기존 UI 증거를 함께 보존하여 통합 |
| [`47573f4`](https://github.com/twoimo/bitcoin-cycle-atlas/commit/47573f4adf202ca654c6738c506b509fa64794ba) | 주식 formal 임시 사본에 parser로 찾은 전체 의존성을 복사하고 변경 전 격리 사본 통과를 먼저 검사 |
| [`dbd3b70`](https://github.com/twoimo/bitcoin-cycle-atlas/commit/dbd3b70e567c3047524e6a0e3b5d01b1dc9d910d) | PR #78 병합. 현재 운영 전체 검증·배포 대상이며 같은 작업 브랜치도 이 커밋으로 fast-forward |

새 범례·셸 모듈은 `dist/ui/` 아래에 둔다. `dist/` 최상위에 새 JavaScript 파일을 추가하지 않는다. 기존 충분성·캘리브레이션·자산군 모델 모듈을 다시 구현하지 않는다.

## 부록 C. 이전 진단·검증 이력

아래는 최종 구현의 브라우저 판정을 대신하지 않는 이전 실행 이력이다. 단계별 통과와 전체 판정을 구분하고, 검증 시작 전 취소를 실패로 집계하지 않는다.

| 구분 | 상태 | 해석 |
|---|---|---|
| GitHub status API, 대상 `83e3c9e` | 반환 목록 **`[]`** | 이 저장소의 Cloudflare 검증과 별개. GitHub 상태 항목이 없다는 결과이며 CI 통과 판정이 아님 |
| 첫 WP4/WP7 보조 UI 진단 | **실패** · build ID `fef2485d-3897-47f3-a740-18171fe865e5` · 2026-11-08 15:12:13 UTC 실패 종료 | 소스 `83e3c9e`. baseline 관찰 6/6 수집, after 17/21 통과. BTC 6개·P0 4개 통과를 전체 성공으로 바꾸어 보고하지 않음 |
| 두 번째 보조 UI 진단 | **실패** · build ID `45074d86-08e9-42e2-af4a-27ecd77ed311` | 소스 `4fadcc2`. before 관찰 6/6, after 20/21 통과. 경기 주택에서 검증기가 뒤에 숨은 BTC 가격을 검사한 1건 실패 |
| 세 번째 보조 UI 진단 | **실패** · build ID `d121c72b-be74-47b3-a19b-a5dcbdfb1c93` | 소스 `1e7db4b`. before 의존성 import 단계 실패, after **21/21 통과**. after PNG 13개 복구. 한쪽 phase의 통과로 전체를 성공 처리하지 않음 |
| 취소된 후속 보조 UI 진단 | **superseded / cancelled** · build ID 접두사 `adfac…` · 2026-11-08 15:40:57 UTC 취소 | 소스 `f1734ba`. 검증 시작 전 새 소스로 교체하기 위해 취소한 실행이므로 실패나 통과로 집계하지 않음 |

이전 main `58799a8`의 consumer build 접두사 `742bfed2…`는 새 대상에 자원을 배정하기 위해 2026-11-08 16:07:06 UTC에 superseded로 취소했다. 이 조치는 기존 공개 서비스의 소스를 바꾸지 않았다.

첫 진단의 네 실패는 HYPE·부산·서울·전국 hosted 문서가 전환 중일 때 검증기의 `readHostedUiReadiness()`가 아직 없는 DOM의 `dataset`을 읽어 발생한 `TypeError`였다. `4fadcc2`는 이 초기 문서를 대기로 처리하도록 수정했다. 첫 after 원본의 실행 구간은 `2026-11-08T15:09:50.520Z`부터 `2026-11-08T15:11:59.103Z`까지이며, 위 Cloudflare 빌드 종료 시각과 구분한다.

두 번째 after 원본은 소스 `4fadcc2`, 상태 `failed`, 20/21 통과다. 남은 경기 주택 사례는 오프라인 갱신 검증이 현재 보이는 주택 차트 대신 숨은 BTC 가격을 검사해 실패했다. `96382f6`은 실제 차트 소유자를 먼저 확인하도록 검증기를 고쳤다. 정해 둔 Node·Ubuntu·Chrome 버전이나 앱의 가격·재생 코드를 바꾼 수정이 아니다.

세 번째 영수증은 before `failed` / after `passed` / 전체 `failed`를 기록한다. before에서는 복사된 최신 브라우저 검증기가 오래된 baseline helper에 없는 `ownsOfflineBtcPriceReadout` export를 import하여 시작하지 못했고, before 보고서도 생성되지 않았다. after는 `2026-11-08T15:28:22.985Z`부터 `2026-11-08T15:30:42.573Z`까지 21개를 모두 통과했으며, 소스 무결성 검사 145개 파일의 변경 목록은 비어 있다. `f1734ba`는 의존 helper까지 포함하는 네 파일 목록을 한곳에서 관리하도록 수정했다. 그 소스의 `adfac…`는 검증을 시작하지 않고 취소되었으므로 결과가 없다. 이후 최종 `24e736e3…`에서 before·after가 함께 통과했으며 그 결과를 3절에 해당 소스의 완료된 측정으로 보존했다. 후속 PR #76의 최신 UI에 자동 적용하지 않는다.

중간 소스의 UI 구현·페이지 생성 후 전체 테스트도 3050/3050, 실패 0, 건너뜀 0, 단일 배치로 통과했다(235351.382322ms). 이 값은 중간 소스 이력이며, 완료된 `f5b1a874` 전체 검증은 4절의 **3062/3062** 결과다. 현재 통합 소스의 영향 범위 57/57 및 후속 전체 게이트와 구분한다.

후속 운영 CI 이력은 보조 UI 진단과 별개다. 병합 `b92c6d7`의 모델 build 접두사 `988…`는 실행 전 `skipped`로 끝났고 API에는 명시 사유가 없었다. `c757…`는 superseded로 취소했다. 새 main `5df078d`의 자동 모델 build 접두사 `5495d65b…`는 약 13분간 환경 준비 대기에 머물러, 같은 소스·명령으로 `5f5ff0ff…`를 다시 요청했다. 이 재시도는 전체 3062개 테스트와 선행 게이트를 통과한 뒤, 16:41:13 UTC formal 게이트에서 임시 사본 의존성 누락으로 실패했다. 최신 통합·수정 작업과 운영 결과는 5절에서 이어서 확인한다.

이전 첫 진단에서 복구한 before PNG 18개·after PNG 14개와 세 번째 진단의 after PNG 13개는 각각 그 실행의 출처를 가진다. 이 중 최종 screenshot receipt와 바이트 수·SHA-256이 동일한 6개만 명시적인 출처 구분을 거쳐 최종 증거 묶음에 보완했다. 중간 실행의 수치를 최종 실행의 수치로 승격하지 않았다.

검증기 복구 `47573f4`의 로컬 회귀·전체 formal 통과 뒤 PR #78을 `dbd3b70`에 병합했다. 이전 `cf755f6`의 모델 `f84c4134…`는 16:49:56.030 UTC에 superseded로 취소했고, 새 모델 `5e21418c…`는 16:49:56.951 UTC에 초기화를 시작했다. 이 취소를 해당 소스의 게이트 통과로 표시하지 않는다.
