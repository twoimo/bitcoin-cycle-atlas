# 고정 예측 리플레이 — 2026-10-29 KST 검증 기록

보존한 예측을 고정한 채 실제 가격을 한 봉씩 공개하고, 되감기·날짜 이동·가격 유지 기준과의 비교·현재 화면 JSON 내보내기를 할 수 있게 했다. BTC·ETH에는 현재 가격 모형을 과거 기준일까지의 입력으로 한 번 실행하는 **과거 재구성**도 추가했다. 원래 예측을 당시 실제보다 잘 맞혔던 것처럼 바꾸거나, 과거 재구성을 전향 성과로 합산하지 않는다.

기능 소스는 기존 [Draft PR #39](https://github.com/twoimo/bitcoin-cycle-atlas/pull/39)에 게시했다. **이 문서를 작성한 시점에 원격 검증 전체가 통과한 것은 아니다.** [일반 CI 40726062158](https://github.com/twoimo/bitcoin-cycle-atlas/actions/runs/40726062158)와 [Hallmark 40726062106](https://github.com/twoimo/bitcoin-cycle-atlas/actions/runs/40726062106)은 성공했지만, [ETH candidate 40726062545](https://github.com/twoimo/bitcoin-cycle-atlas/actions/runs/40726062545)는 23번째 archive 읽기 단계의 HTTP 403으로 실패했다. 이 원래 실패를 보존했다. 해당 단계가 기존 `ETH_ARCHIVE_GITHUB_TOKEN`을 전달하지 않는 것을 확인해 단계에만 읽기 토큰을 연결했다. `contents: read`와 실패 시 중단을 유지하고, 인증 뒤에도 GET만 수행하며 영수증에 토큰을 남기지 않는 회귀를 포함해 관련 테스트 40개가 통과했다. 응답 본문과 제한 헤더를 보존하지 않았으므로 최초 403이 익명 API 할당량 때문이었다고 단정하지 않는다. [원래 실패](diagnostics/remote-ci-initial.json), [인증 회귀](final/archive-read-auth.json). 후속 실행의 최종 상태는 PR의 해당 커밋과 실행 영수증을 확인한다. 아래의 로컬 통과 결과를 이 실패의 통과로 대신하지 않는다. `main`, 기본 모형과 운영 배포는 변경하지 않았고 `releaseAuthorized=false`, `productionPromoted=false`를 유지한다. [검증 요약](final/verification-summary.json)

## 1. 검증한 소스와 증거의 기준

| 구분 | 식별자 |
| --- | --- |
| 작업 전 기준 커밋 | `4165f30921d1f4bb981a4f1ada7cb85ede61d7e9` |
| 로컬 최종 검증 소스 | `331f17fcb0a64a8b6bae0180e352cab52b698ef3` |
| 원격 Draft 브랜치에 게시한 동일 소스 | `3c570470a901c4991e14ba0907f5a19f87bd6f5d` |
| 두 최종 소스의 동일한 Git tree | `f323a23333621fb92962e343192c0aef3e95dcb3` |
| 변경하지 않은 main | `30805dacdcf0aa3ea991439de87d5f9a38c59f25` |

이 표는 기능 소스를 검사하고 게시한 시점의 식별자다. 이 README와 증거 정리 커밋은 그 뒤에 추가될 수 있다. HTML의 publication 메타데이터를 원격에서 확인 가능한 `3c570470`으로 갱신한 뒤에도 native offline 5/5를 다시 확인했다. 메타데이터 갱신으로 HTML 바이트 해시는 달라진다. **최신 전달 HTML의 해시는 [standalone 영수증](standalone/receipt.json)의 `artifactSha256`, `publicationSourceCommit`과 대조한다.** 이전 `331f17f` HTML의 해시를 최신 파일의 해시로 고정하지 않는다.

요청한 pstack 지침을 읽고, 리플레이 엔진·UI·기준 자료 교체 후보·실제 브라우저 검증의 소유자를 분리한 worktree에서 병렬로 작업했다. 코어 작성자가 UI와 계약을 교차 검토한 사실도 기록했다. 이는 같은 세션 내부의 검토이며 외부 제공자의 교차 모델 검토가 아니다. Gemini 반대 검토와 후속 역검토는 사용자 지시에 따른 `omitted-by-user`이며, 통과한 검토로 표시하지 않는다. [작업 기록](../../FORECAST_REPLAY_WORKLOG.md), [의사결정 기록](decisions.tsv), [검토 영수증](peer-review.json)

## 2. 화면에서 사용하는 방법

BTC의 **예측 기록과 누적 평가**, 또는 ETH·MSTR·BMNR의 **연구 발행 기록**에서 보존본을 선택한 뒤 **리플레이** 탭을 연다.

1. **보존 발행본**은 검증한 원래 입력·기록의 정확한 경로를 복원한다.
2. **재생**, **이전/다음**, **처음**, 날짜 입력과 슬라이더로 위치를 바꾼다. 속도는 1×·2×·4×다.
3. 차트에 초점을 두고 좌우 방향키로 한 봉씩, Home/End로 처음과 끝, 스페이스로 재생·정지를 조작할 수 있다.
4. BTC·ETH의 **과거 재구성**에서는 기준일과 30·90·180·365일 기간을 선택한다. ETH는 pooled·adaptive 가격 모형을 선택할 수 있다.
5. **현재 화면 JSON**은 예측 identity와 현재 공개된 frame을 다운로드한다. 향후 이동에 사용할 전체 관측 inventory는 내보내지 않는다.

예측 경로는 세션을 만들 때 한 번 고정한다. 재생·역행·속도 변경은 예측을 다시 적합하지 않는다. 종목·기록·모형·기준일 변경은 별도 세션을 만들며, 이전 타이머와 요청은 소유권을 잃는다. 창 닫기·다시 열기와 작은 화면의 스크롤·초점·키보드 조작을 실제 브라우저에서 확인했다. [UI 소스](../../../dist/forecast-replay-view.js), [브라우저 보고서](final/browser-report.json)

## 3. 두 종류의 시각과 정보 공개

| 화면의 공개 기준 | 의미 | 점수 해석 |
| --- | --- | --- |
| 현재 판본 · 시장 날짜 | 현재 확보한 관측 판본을 시장 날짜 순서로 보여 준다. | 당시 그 판본을 알았다는 증거가 없는 회고 비교다. |
| 기록된 수집 시각 | 시장 관측 종료, 기록된 수집 시각, 알려진 공개 시각이 현재 정보 컷오프를 통과한 판본만 보여 준다. | 실제 발행 뒤 종료된 목표에 검증 가능한 관측이 있을 때만 전향 목표를 채점한다. |

수집 시각이 없는 자료에 과거 수집 시각을 만들어 넣지 않는다. 늦게 도착한 정정 판본도 그 판본의 수집 경계 이전 프레임에 소급 적용하지 않는다. 실제 현재 시각을 넘겨 미도래 목표를 도래한 결과처럼 재생할 수 없으며, 진행 중인 일봉은 완료된 실제 봉으로 표시하지 않는다.

입력 스냅샷에도 같은 원칙을 적용한다. 자산 기록은 검증한 전체 입력의 마지막 수집 시각을, 완전한 입력 영수증 구조가 없는 기존 BTC 기록은 보수적으로 발행시각을 입력 공개 경계로 삼는다. 그 전에는 입력 가격·예측·flat 기준·가격축을 숨긴다. 공개할 가격이 없으면 `priceDomain=null`, `scale=null`인 빈 화면을 표시한다. hover와 내보내기도 같은 frame을 사용한다. 이 누출은 교차 검토에서 실제 ETH·BMNR·MSTR 자료로 발견해 수정했다. [계약](../../FORECAST_REPLAY_CONTRACT.md), [검토 결과](peer-review.json), [발행 전 ETH 화면](screenshots/replay-eth-320x568-strict-before-issuance.png)

목표 상태는 발행 이전 제외, 미도래 대기, 도래했지만 관측 미확보, 회고 비교, 관측 확인 후 채점으로 구분한다. 결측 날짜를 0이나 전날 가격으로 채우지 않는다. 주식 경로의 실제 0은 선형 축으로 보존하며 정의할 수 없는 로그 오차는 null이다.

## 4. 원래 경로의 의미를 보존한다

원래 ETH 보존 경로는 고정한 seed로 추출한 **무작위 예시 1개**다. BMNR는 그 ETH 예시를 보유량·현금·선순위 청구권·희석 계산에 전달한 조건부 주당 평가 경로다. 이를 모형의 중앙 예측으로 바꾸지 않았다. 다른 자산과 BTC도 원래의 조건부 경로라는 의미를 유지한다.

`identity.pointMeaning`, 한국어 `pointLabel`, `bandMeaning`을 화면 설명·오차 설명·근거·JSON에 보존한다. 원래 발행본의 음영은 선언한 경제 조건의 범위이며 확률 구간이 아니다. 과거 ETH 재구성에서는 기존 pooled/adaptive 모형의 **날짜별 시뮬레이션 중앙값**을 비교하고, 대표 무작위 경로는 별도 값으로 둔다. 이때 10–90% 분위수 음영도 실제 80% 적중률을 검증한 구간은 아니다.

BTC 과거 재구성은 기존의 가격만 사용하는 축소 추세 기준모형이다. 사이트의 장기 경제 모형을 과거에 실제 발행한 것으로 가장하지 않는다. MSTR·BMNR에는 현재 회사 입력을 과거로 소급하는 재구성 모드를 제공하지 않는다. [코어 구현](../../../dist/forecast-replay.js), [원본 의미 회귀](../../../tests/forecast-replay.test.mjs)

## 5. 실제 ETH 관측과 현재 비교 결과

성공한 ETH 요청은 `2026-10-28T15:15:14.149Z`에 본문 수집을 마쳤다. 원문은 **588 byte, GET 1회**이며, 앞선 실패 요청도 별도로 보존했다. 기존 보존 base와 원문을 재생해 `2026-10-27`까지 완료된 관측을 만들었다. 응답에 포함된 미완료 `2026-10-28` 봉은 제외했다. [실제 요청 영수증](../../../research-data/forecast-replay/20261029/acquisition-2/eth-tail-acquisition.json), [원문](../../../research-data/forecast-replay/20261029/acquisition-2/raw-eth-tail.json), [snapshot](../../../research-data/forecast-replay/20261029/acquisition-2/snapshot.json)

결과는 원래 모델 입력인 `eth-ohlc.json`을 덮어쓰지 않고, 별도 `dist/data/replay-eth-ohlc.json`에 두었다. 원문 SHA-256은 `b5400b5c9617db3658b559c474452e8f16190c924b77c5a17a2f616627cce5d4`이며, snapshot ID는 `54e32eff6ef0e4b3ae3462ce516a223517eaf939c5d84d8196970da98d975e51`이다. 실자료 회귀는 보존 snapshot과 원시 HTTP bytes로 아카이브 전체를 다시 만들어 대조한다. 해시 일치는 공급원의 역사적 공개 시각이나 진위를 독립 인증하는 절차는 아니다.

원래 ETH 기준일은 `2026-10-25`다. 그 뒤 비교할 수 있는 완료 봉은 두 개다.

| 날짜 | 보존한 ETH 예시 경로 | 실제 종가 | 절대 백분율 오차 |
| --- | ---: | ---: | ---: |
| 2026-10-26 | $2,262.39 | $2,320.34 | 2.50% |
| 2026-10-27 | $2,219.12 | $2,347.01 | 5.45% |

두 봉의 평균 절대 백분율 오차는 약 3.97%다. 평균 절대 로그 오차는 약 0.040661이고 가격 유지 기준은 약 0.005714로, 이 짧은 비교에서는 보존 예시 경로가 더 나빴다. 두 점만으로 일반적인 예측력을 결론내릴 수 없다. **원래 30·90·180일 목표는 모두 pending**이며 미도래 목표의 정답과 오차는 null이다. BTC·MSTR·BMNR에는 이번 자료 범위에서 발행 이후 비교할 새 관측이 없어 0건·미평가를 유지한다. [비교 원본](final/replay-comparisons.json), [실제 브라우저 JSON 다운로드](browser-exports/replay-downloads), [진짜 ETH 캔들 화면](screenshots/replay-eth-320x568-genuine-candles.png)

BTC는 보존된 Coin Metrics 종가를 그대로 사용한다. 다른 거래소 캔들로 바꾸거나 종가에서 OHLC를 제조하지 않는다. ETH·주식의 캔들은 원래 공급원이 제공한 OHLC만 사용한다.

## 6. 과거 재구성에서 확인한 것과 확인하지 않은 것

| 고정 기준일과 모형 | 실제 공개 구간 | 비교 일봉 | 경로 평균 로그 오차 | 가격 유지 로그 오차 | 유지 대비 개선 |
| --- | --- | ---: | ---: | ---: | ---: |
| BTC 2026-04-28 · 축소 추세 기준모형 | 2026-04-29–10-25 | 180 | 0.11965 | 0.10911 | -9.65% |
| ETH 2026-04-30 · pooled 중앙값 | 2026-05-01–10-27 | 180 | 0.16144 | 0.15264 | -5.77% |

둘 다 이 구간에서는 가격 유지 기준보다 나빴고, 그 값을 그대로 표시했다. 각 180개 오차는 한 원점에서 출발한 고정 경로의 겹치는 결과다. 독립 예측 180회나 독립 시장 국면 180개가 아니다. 두 모드 모두 전향 채점 수는 0이고, 30·90·180일 목표는 회고 비교로 남는다. [비교 원본](final/replay-comparisons.json), [BTC 화면](screenshots/replay-btc-1440x900-historical-end.png), [ETH 화면](screenshots/replay-eth-1440x900-historical-end.png)

모형에는 선택한 기준일까지의 관측 prefix만 전달하며, 기준일 뒤의 실제값을 바꿔도 고정 경로·학습 요약이 달라지지 않는 회귀를 둔다. 다만 모형 규칙과 현재 자료 판본은 이번 개발 시점에 선택한 것이다. 과거의 실제 모형·입력 가용성·사전 등록 실험·보정된 미래 포함확률을 입증하지 않는다. JSON의 백분율·방향 정확도·skill은 비율 값이므로 `0.12`는 12%다.

## 7. 준비한 ETH base 후보와 남은 운영 조건

검토용 교체 후보에는 **3,813개** 완료 관측이 있다. 기존 값과 유효 수집 시각을 유지한 3,804개, 값은 같고 이번에 다시 확보한 중첩 7개, 새 날짜 2개로 구성된다. 값 수정은 0개, 삭제는 0개이며 역사적 결측을 보간하지 않았다. [후보 영수증](final/base-rollover-receipt.json)

이 후보는 `build/ethereum-base-rollover/<snapshot-id>/`의 검토 산출물이다. 운영 base 교체, 새 예측 발행, 새 원장 관측 발행, 보정 사례 발행은 하지 않았다. 기존 7일 중첩·290일 단일 요청 정책의 허용 경계를 두 날짜만큼 전진시킬 수 있음을 확인했지만, 자동 승격이나 무기한 일일 운영을 증명하지 않는다. 일봉 외의 interval 자료도 새로 수집한 것으로 표시하지 않는다. [base 후보 사용법](../../ETH_BASE_ROLLOVER.md)

일일 workflow는 Draft 브랜치의 정의이며 실제 자동 운영을 활성화한 것은 아니다. 후보 CI의 읽기 인증은 이번에 연결했지만, 기존 일일 writer workflow의 익명 읽기는 활성화 전에 별도로 검토해야 한다. write 권한이 있는 publisher 토큰을 다른 단계에 무조건 확대하지 않았다. [인증 수정 교차 검토](final/archive-read-auth-peer.json)

관측 500개·기록 2,000개·활성 인덱스 1 MiB의 유한한 원장 한도와 이후 분할·보존 작업은 남아 있다. 정확한 전체 26개 경제 입력, 필요한 UTC 공급 경계와 독립 상태 정산, 동일 cohort의 순보상·비용, 중복 제거한 담보, 실제 수집 시계도 리플레이 화면으로 대체되지 않는다.

전향 보정은 모형·기간 조합별로 규칙에 맞는 최초 12개 비중첩 성숙 목표를 확보하고, 불변 보정 블록을 고정한 뒤 후속 보정 예측의 성과를 따로 평가해야 한다. 이번의 두 새 ETH 봉이나 과거 재구성 180개 일별 오차로 그 조건을 채우지 않는다. [남은 조건의 상세 기록](../../ETH_REMAINING_CONDITIONS.md)

## 8. 실제 브라우저가 드러낸 수신 문제와 수정

초기 native 검증에서는 자료와 해시가 완전한데도 Chrome이 로컬 replay 요청을 `ERR_ABORTED`로 보고했다. 원래 로더를 최소 HTTP 페이지로 분리하고, BTC/ETH 같은 바이트를 chunked와 정확한 Content-Length 응답으로 비교했다. 실패 결과도 [transport 증거](transport)에 남겼다.

| 검토한 가설·대안 | 실제 결과 |
| --- | --- |
| 완료한 UI 요청을 나중에 abort하는 것이 전부의 원인 | UI와 AbortController가 없는 최소 페이지에서도 재현돼 단독 원인으로 기각했다. |
| 오래된 Chrome 131에만 발생 | Chrome 156.0.8078.73에서도 현재 로더 12회 중 3회 재현됐다. |
| 정확한 Content-Length만 제공하면 해결 | 동일 헤더에서도 실패했다. |
| releaseLock 생략·reader.closed·응답 보존·한 task 양보 | 반복 비교에서 일부 실패가 남았다. 임의 지연을 해결책으로 넣지 않았다. |
| 제한 TransformStream을 새 Response로 native 소비 | Chrome 131·156 모두 일부 실패했다. |
| 원본 native 소비와 clone의 byte 감시 결합 | 최소 대조 12/12 완료와 원문 해시 일치, 초과 응답 조기 중단을 확인한 뒤 제품 코드에 반영했다. |

최종 로더는 원본 응답의 `arrayBuffer()`를 native로 소비하며 clone의 스트림에서 **16,000,000 byte** 제한을 점진적으로 검사한다. 초과·취소·deadline·연결 중단 시 소유 AbortController로 원본 소비와 감시를 함께 정리한다. 외부 취소 이유를 전달하고 완료 뒤에는 listener를 제거한다. Content-Length 사전 검사, fatal UTF-8, 정확한 원문 해시, redirect 거부와 credentials 생략은 유지한다. 주입하는 `fetchImpl`도 진행 중 본문에 대한 native Fetch의 AbortSignal 계약을 준수해야 한다.

64MB 생산자 회귀에서는 native 본문 완성 전에 초과를 거부한다. 별도의 실제 Chrome 최소 probe에서도 32MB 응답을 한도 초과 chunk에서 중단하고 native 본문이 성공 반환하지 않았음을 기록했다. 최종 앱 검증은 일반적인 `ERR_ABORTED` 무시 예외 없이 통과했다. 브라우저 내부 결함의 정확한 구현 원인까지 규명했다고 주장하지 않는다. [최소 probe](transport/atlas-replay-fetch-clone-probe-156.json), [소스와 취소 회귀](../../../tests/forecast-replay-sources.test.mjs)

## 9. 검증 결과와 보존 범위

| 검사 | 결과 | 근거 |
| --- | --- | --- |
| 최종 전체 단위·통합 검사 | 1,898/1,898, 실패·skip 0 | [tests.json](final/tests.json), [로그](final/tests.log) |
| 정적 사이트의 실제 native 조작 | Chrome 156, 39/39, runtime·예상 밖 resource 오류 0 | [browser-report.json](final/browser-report.json) |
| 위 브라우저 산출물 | PNG 205개 기록, 실제 JSON 다운로드 16개 | [대표 화면](screenshots), [다운로드 JSON](browser-exports/replay-downloads) |
| 다운로드 HTML의 실제 file:// 조작 | Chrome 131, 5/5, 실제 JSON 다운로드 21개 | [standalone 영수증](standalone/receipt.json) |
| offline replay·journal 자체 요청 | fetch 0, runtime·예상 밖 resource 오류 0 | 같은 standalone 영수증과 [실행 원문](standalone/check.mjs) |
| 원본 보존 | 원래 발행본 14개와 기록에 묶인 모델 경로 22개 불변 | [Git blob 보존 증명](final/preservation.json) |

브라우저 보고서는 모든 생성 PNG의 해시를 기록하며 이 폴더에는 대표 화면을 둔다. offline 21건 다운로드의 실행 기록과 대표 JSON도 별도로 보존한다. 파일별 source commit·시각·해시를 확인해야 하며, 서로 다른 실행의 개수를 독립 검증 수처럼 합산하지 않는다. 모바일 크기는 실제 Chromium viewport 검사이며 물리 휴대전화나 Safari 검증을 뜻하지 않는다.

네트워크를 막은 검사에서 알려진 BTC 갱신 요청이 실패하는 경우는 요청별 식별자·화면의 실패 안내·보존 종가를 확인해 별도로 기록했다. 모든 네트워크 실패를 무시한 결과가 아니다. 원래 ETH/BTC 발행본의 예측 경로·스냅샷·시각은 그대로이며, 기존 dist 변경은 두 journal JavaScript와 journal CSS뿐이다. 원래 `dist/data` 37개, journal UI를 제외한 기존 dist JavaScript 149개, prospective archive 39개와 ledger 17개의 blob이 모두 보존됐다.

`baseline/`은 작업 전 1,823개 테스트와 native 35개 사례의 기록이다. `diagnostics/`에는 중간 실패를 남겼다. `final/checks.json`은 `c09149e`에서 형식 도구 다운로드로 멈춘 실행이며, `final/remaining.json`은 다른 중간 소스 `db9c6c5`의 재실행 기록이다. 이 파일들을 최종 `331f17f` 전체 실행으로 재명명하지 않는다. 최종 전체 테스트와 native 결과는 위 표의 정확한 소스 영수증을 따른다.

## 10. 재현 명령

저장소 루트, Node.js 24 이상을 기준으로 한다. 다음은 보존 원문으로 수행하는 검사이며 새 시장 요청을 실행하거나 기존 발행본을 덮어쓰는 명령이 아니다.

```sh
npm test

node --test --test-isolation=none --test-reporter=spec \
  tests/forecast-replay.test.mjs \
  tests/forecast-replay-sources.test.mjs \
  tests/forecast-replay-published-source.test.mjs \
  tests/forecast-replay-controls.test.mjs \
  tests/forecast-replay-standalone.test.mjs

node scripts/issue-ethereum-prospective.mjs --verify-preserved-only --include-warm-start

node scripts/prepare-ethereum-base-rollover.mjs \
  --snapshot research-data/forecast-replay/20261029/acquisition-2/snapshot.json
```

실제 native 사이트 검증은 설치한 Chromium 실행파일과 한국어 폰트가 필요하다. 실행파일 경로는 해당 환경에 맞게 지정한다. 전체 39개를 실행하려면 scope는 `all`, 추가한 리플레이 네 사례만 분리하려면 `replay`다.

```sh
ATLAS_BROWSER_PATH=/path/to/chrome \
ATLAS_BROWSER_CASE_SCOPE=all \
ETH_BROWSER_IMAGE_LOG_MODE=failures-only \
node scripts/verify-eth-candidate-browser.mjs
```

HTML은 preview publication 메타데이터를 만든 뒤 패키징한다. 이 명령은 사이트 배포나 release 승인을 하지 않는다.

```sh
npm run build:publication -- --preview
npm run build:standalone

node docs/eth-candidate-evidence/20261029-replay/standalone/check.mjs \
  build/Bitcoin_Cycles_Comparison.html \
  build/standalone-replay-check
```

마지막 `standalone/check.mjs`는 당시 실행 환경을 보존한 검사 원문이다. Playwright 모듈·Chrome·한국어 폰트·`btc-offline-refresh-policy.mjs`의 절대 경로가 들어 있으므로 다른 환경에서는 해당 경로를 맞춘 사본으로 실행한다. 새 실행은 새 receipt에 실제 HTML 해시와 publication source를 기록해야 한다. 동작 확인을 위해 검증기나 제품 코드의 오류 조건을 완화하지 않는다.

## 11. 증거 위치

- `final/`: 최종 테스트·브라우저 요약, 소스 보존, 실자료 비교, base 후보와 단계별 실행 영수증.
- `browser-exports/`: 실제 브라우저 다운로드로 확보한 보이는 frame JSON.
- `screenshots/`: 과거 재구성, 실제 캔들, 입력 수집 전 빈 화면과 offline 동작의 대표 이미지.
- `transport/`: 성공만 남기지 않은 수신 문제의 실패·성공 최소 대조.
- `standalone/`: file:// HTML의 native 조작 영수증, 실행 원문, 대표 내보내기.
- `peer-review.json`: 같은 세션의 검토 범위, 두 확인된 문제와 수정 근거. 외부 제공자 검토는 실행하지 않았다.
- `../../../research-data/forecast-replay/20261029/`: 실패한 수집 시도와 성공한 raw·receipt·snapshot 원본.

후속 승격 여부는 이 리플레이의 화면 완성도나 테스트 수로 정하지 않는다. 실제 경제 입력·시각·성숙한 전향 결과와 이후 보정 성과는 각자의 조건과 원문으로 계속 확인해야 한다.
