# ChatGPT 소스 논제 및 변경분 검토 — 2026-10-26

## 신원과 정확한 검토 대상

- 단계: chatgpt-thesis. 이 세션의 실제 ChatGPT 논제이며 Gemini 보고서가 아니다.
- 제공자·모델: OpenAI / GPT-6 Astra Pro, 호스트가 제공한 모델 표시. 내부 reasoning 설정은 노출되지 않아 주장하지 않는다. 계정·모델·유료 설정을 변경하지 않았다.
- 검토 시작: 2026-10-26T12:35:32Z. 완료: 2026-10-26T12:40:40Z.
- 대상 소스: d5101631b294a25d7db2ddff1ac74a76bddf92fd, tree 10008614b61cd4d4186d250f33270cd4a8e04a32.
- 실제 생성된 source-book SHA-256: 521260410b7dfbff324d05f0bc39ab8c415c0d5203e6fe24700877de461b3cc5.
- source-book: 38,201,286 bytes, 명시적 seed 203개, source/evidence entry 231개, UTF-8 part 213개. 미해결 import 0.
- 접근 방법: GitHub 연동으로 실제 원문·Git blob·CI 로그·실제 PNG를 읽었다. Codex Native2·하네스·로컬 저장소 실행·Deep Research 제품 실행은 사용하지 않았다.
- 전체 source-book의 선언된 접근 가능 범위와 이 검토자가 실질 검토한 범위는 구분한다. 아래 변경 소스, 관련 테스트, 원장 입력/출력과 실행 영수증을 검토했으며 모든 231개 파일의 모든 문장을 검토했다는 주장은 하지 않는다.
- 원본 보고서는 이 저장소의 docs/reviews/ETH_CHATGPT_THESIS_20261026.md에 보존한다. 후속 manifest의 이 파일 entry가 원문 SHA-256을 제공한다.

직접 검토한 핵심 파일: ethereum-cycle-models.js, ethereum-economic-model.js, ethereum-model-comparison.js, ethereum-economic-ablation.js, ethereum-economic-data.js, forecast-information-time.js, asset-forecast-records.js, asset-forecast-journal.js, journal-entry.js, eth-view.js, equity-view.js, capture-ethereum-economic-data.mjs, issue-asset-forecasts.mjs, build-eth-review-packet.mjs, verify-eth-candidate-browser.mjs 및 관련 전체 모듈 테스트. 기존 BTC 수식·차트 엔진과 저장된 9개 원장 기록도 연결부를 대조했다.

## 논제

BTC 수학 구조의 ETH 전이와 ETH 계수 재추정을 실제 반증 가능한 후보로 유지한다. “3년 상승·1년 하락”을 배제하지 않지만 ETH의 미래 고정 규칙으로 승격하지 않는다. 경제 설명변수는 실제 가격/상대 수익률 방정식에 들어가되, 단위·회계·시점·판본 조건을 만족하지 못한 자료로 후보를 활성화하지 않는다. 발행·재생의 정확성과 실제 예측력은 서로 다른 검증 대상이다.

BTC 전이의 실제 원문:
```js
price: finitePrice(Math.log(ethPrice) + logRatio(point.baselinePrice, btcPrice)),
```

출처: dist/ethereum-cycle-models.js. 이는 현재 ETH 앵커에 BTC 기준선의 상대 변화를 적용한다. BTC 달러 목표가를 ETH 달러 가격으로 복사하거나 BTC 발행 일정을 ETH에 부여하지 않는다. 내부 BTC 표본 수 16은 소비되는 결정론 기준선을 바꾸지 않는다.

경제 타깃의 실제 원문:
```js
ethTarget:'y=log(ETH[t+h]/ETH[t]); ETH forecast=ETH[asOf]*exp(alpha+z[asOf]*beta).',
```

출처: dist/ethereum-economic-model.js. 13개 변환 특징의 평균·표준편차와 ridge 계수는 각 과거 학습 부분에서 추정한다. ETH/BTC는 별도 타깃이며 미래 BTC는 확정된 정답 계산에만 쓰인다. 이것은 예측 연관성의 추정이며 인과 가치평가 증명이 아니다.

## 데이터와 비교에 대한 판단

실제 비교는 기준일 2026-10-25, 고유 원점 111개, 만기가 도래한 원점/기간 조합 320개다. 30/90/180일에서 각 후보가 실제 사용할 수 있었던 같은 원점의 flat·추세·BTC 연동 및 다른 후보를 비교한다. 아래 수치는 비중첩 타깃 부분의 절대 로그가격 오차다. n이 서로 다르므로 전체 모델 순위로 읽지 않는다.

| 모형 | 기간 일 | 가용 원점 | 확정 결과 | 비중첩 n | 모형 오차 | 같은 원점 flat 오차 | flat 대비 개선 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| btcTransfer | 30 | 93 | 91 | 48 | 0.210427 | 0.212441 | 0.95% |
| ethRefit | 30 | 12 | 12 | 7 | 0.142216 | 0.162648 | 12.56% |
| legacyEth | 30 | 32 | 30 | 15 | 0.216157 | 0.129982 | -66.30% |
| btcTransfer | 90 | 93 | 89 | 25 | 0.312430 | 0.362622 | 13.84% |
| ethRefit | 90 | 12 | 12 | 5 | 0.393584 | 0.369929 | -6.39% |
| legacyEth | 90 | 32 | 28 | 7 | 0.508307 | 0.406936 | -24.91% |
| btcTransfer | 180 | 93 | 86 | 14 | 0.552761 | 0.588618 | 6.09% |
| ethRefit | 180 | 12 | 12 | 4 | 0.339166 | 0.485493 | 30.14% |
| legacyEth | 180 | 32 | 25 | 4 | 0.443432 | 0.253232 | -75.11% |

90일 BTC 전이와 ETH 재추정의 직접 공통 원점은 12개, 비중첩은 5개다. 이 공통 부분의 오차는 각각 0.299020과 0.393584다. BTC 전이와 기존 ETH 예시는 공통 18개, 비중첩 6개에서 각각 0.342653과 0.375043이다. ETH 재추정과 기존 ETH의 공통 원점은 0개다. 다섯 핵심 후보 전체의 공통 표본도 0개다. 서로 다른 표본의 평균을 연결해 전체 우열을 주장할 수 없다.

BTC 전이는 90일에 유리한 결과를 보였지만 현재 보유 archive를 이용한 재구성 평가다. 과거 배포 모형과 당시 보유 가격 판본을 복원한 성과가 아니며 독립 시장 국면 수는 확인되지 않았다. ETH 재추정은 현재 추정 고점권 날짜가 이미 지나 사용 불가이며, 이를 숨기려고 새 48개월 파동을 만들지 않았다.

경제 원자료는 실제 수집됐다. 그러나 3,952행의 네 가지 provider 집계는 모형의 25개 단위·회계·cohort 요구사항을 충족하지 못한다. 최신 완결 관측은 2026-05-23으로 155일 지연이다. FeeTotNtv를 실행 수수료로 넣고 blob을 다시 더하거나 gross 발행을 net 발행으로 바꾸면 잘못된 입력이 된다. 적격 경제 snapshot 0, 경제/결합형 예측 0, 실증 제거 기여 점수 0표본을 유지한 판단이 맞다. 합성 테스트 성공은 이 결손을 보충하지 않는다.

## 변경분 반대 지적과 실제 수정

같은 OpenAI 모델의 분리된 읽기 전용 검토와 이 세션의 역검토로 다음을 확인했다. 이를 Gemini 검토로 표현하지 않는다.

| 발견한 문제 | 적용한 변경과 검증 |
| --- | --- |
| 갱신된 색인에 선택한 ID가 없으면 다른 기준 기록으로 바뀜 | 명시적 ID는 404·빈 색인·다른 기록에서 오류. 선택 초기화는 사용자가 목록 다시 열기를 누를 때만 수행. 실제 전체 loader 검사 |
| 늦은 응답·오류·타이머 및 지연된 모듈 import가 새 창을 덮어쓸 수 있음 | 요청 generation과 owning dialog, 취소와 timeout race, 경쟁 modal/pagehide 검사. 16 loader 및 6 entry 검사 |
| 이전 네이티브 close 이벤트가 다시 연 창을 닫힌 상태로 바꿈 | 이미 다시 열려 있으면 이전 close 정리를 무시. 실제 브라우저 close→BMNR 재열기 |
| 공유 차트의 Escape 처리 때문에 dialog가 닫히지 않음 | journal 소유 handler에서 Escape를 가로채지 않음. 실제 SVG 포커스 후 Escape |
| 양수만 연결하는 공통 차트가 0을 건너뛰어 잘못된 미래 선을 겹쳐 그림 | 0 모드의 공통 엔진에는 관측만 전달하고 실제 저장 미래는 전체 0을 포함한 overlay로 그림. 별도 합성 0→양수→0 자료 |
| 실제 저장 기준선 일부가 표본 조건 폭 밖에 있어 잘림 | 기준선까지 축 범위에 포함하고 저장 baselinePrice를 파란 점선·선택값으로 표시 |
| 회고 기록 및 미검증 목록 항목을 실제 발행으로 오인 가능 | 검증된 선택 기록만 발행 종류를 주장. reconstructed는 전향 평가 제외를 표시 |


실제 ETH base 저장 경로의 3,355개 baselinePrice 중 432개가 예시 세 조건 범위 밖에 있었다. 기준선을 축에 포함한 것은 실제 저장 자료에 필요한 수정이다. BMNR·MSTR의 주당 경로에는 baselinePrice가 null이므로 새 기준선을 만들어 그리지 않았다.

## 실행 근거

- 일반 CI: https://github.com/twoimo/bitcoin-cycle-atlas/actions/runs/40323656995 — 1,307 tests pass, fail/skip/cancel 0.
- 일반 CI checkout은 GitHub 합성 merge commit 0f72d7ccfa66d53a2be74094ebdd98b1dac189de다. Git API로 tree 10008614b61cd4d4186d250f33270cd4a8e04a32가 대상 PR head의 tree와 같음을 직접 대조했다.
- 직접 head checkout 후보 검증: https://github.com/twoimo/bitcoin-cycle-atlas/actions/runs/40323657043 — 집중 174 tests pass.
- 실제 Chromium: 320/390/768/1024/1440px × 비교표·ETH·BMNR·MSTR = 20개, 별도 합성 0값 fixture 1개, 모두 pass. 네이티브 Escape·queued close 후 재열기와 저장한 마지막 날짜 선택 포함. 실제 모바일 기기나 Safari 검증으로 확대하지 않는다.
- 첫 실제 연구 발행은 2026-10-26T12:12:47.948Z. ETH·BMNR·MSTR 각 세 조건, 합계 9개와 snapshot 3개를 보존했다. 이 head 재실행 두 번 모두 new 0 / reused 9 / 정확 재생 9. 목표 27개는 모두 pending, 전향 scored 0.
- ETH/BMNR은 같은 입력·asOf·seed에서 세 조건의 3,357개 일별 기초 ETH 값이 일치한다. UTC 일말과 NY 종가는 원장 시계에서 분리된다.
- 전체 근거 artifact: https://github.com/twoimo/bitcoin-cycle-atlas/actions/runs/40323657043/artifacts/12649823742

첫 UI 실행의 합성 자료 소스 식별자 오류는 성공으로 기록하지 않았다. 5526311의 실제 evidence run 40323357563은 실패로 보존했다. 허용 소스 식별자와 합성 전체 기간을 수정한 d510163에서 위 검증이 성공했다.

후속 소규모 변경은 회고 기록의 SVG 접근성 제목도 “재구성 입력 관측”으로 맞추고, 합성 0 구간에 공통 엔진의 잘못된 미래선이 남지 않는 실제 SVG 검사를 추가한다. 가격 식·입력·보존 기록은 바꾸지 않으며 이 후속 commit의 실제 실행은 별도 영수증으로 구분한다.

## 남은 조건과 결론

연구 PR 유지가 타당하다. 실제 Gemini가 이 정확한 소스/근거를 읽은 반대 보고서와 그 보고서에 대한 ChatGPT 역검증은 아직 없다. 실제 외부 모델 신원·설정·시각·원문 URL·보고서 본문 해시가 확보되기 전에는 3단계 완료나 릴리스 허가를 주장하지 않는다.

추가로 필요한 것은 정의가 맞는 신선한 경제 판본과 당시 가용성 증거, 독립 데이터 정산, 실제 LST 거래 유동성과 수요 식별, 구조 변화에 대한 안정성 검토, 시간이 지나 확정되는 충분한 전향 성과다. 확률 보정과 2030–2035년 장기 예측의 검증도 완료되지 않았다. 프로토콜 원문과 두 역사적 연구 초안을 읽은 것을 전체 학술 문헌 검토로 확대하지 않는다.

main 병합·기본 모형 승격·공개 배포는 이 보고서로 승인하지 않는다. releaseAuthorized=false.
