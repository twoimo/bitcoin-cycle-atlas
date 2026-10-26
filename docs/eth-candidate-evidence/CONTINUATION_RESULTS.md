# 남은 조건 후속 구현 및 실제 검증 — 2026-10-26

## 완료 범위와 운영 상태

PR #39의 연구 후보에 경제 변수 제거 실험, 실제 원자료 수집 영수증, ETH/BMNR/MSTR 별도 불변 원장, 실제 저장본 화면, 정확한 외부 검토 소스 패킷을 연결했다. 기존 BTC 원장과 18자산 BTC-first 비교표, 다른 소유자의 PR #12는 보존했다. 새 모형 기본값 승격·main 병합·공개 배포는 하지 않았다.

검증된 실행 대상은 d5101631b294a25d7db2ddff1ac74a76bddf92fd, tree 10008614b61cd4d4186d250f33270cd4a8e04a32다. 이 문서와 함께 추가하는 회고 SVG 제목·0값 허위선 검사 보완은 가격 식을 바꾸지 않는 후속 변경이며, 그 이후 실행은 PR의 해당 head 체크로 따로 확인한다. 이전 실행의 성공을 새 commit에 소급하지 않는다.

## 실제 실행 영수증

| 범위 | 실제 결과 | 근거 |
| --- | --- | --- |
| 전체 테스트 | 1,307 pass, fail/skip/cancel 0 | [일반 CI](https://github.com/twoimo/bitcoin-cycle-atlas/actions/runs/40323656995) |
| 집중 후보·경제·시간·원장·UI 소유권 | 174 pass, fail/skip/cancel 0 | [후보 evidence](https://github.com/twoimo/bitcoin-cycle-atlas/actions/runs/40323657043) |
| 기존 원장·재무·수치·상태·성능·정적 파일·publication build | 모든 단계 성공, 독립 수치 assertion 318,010 | 위 일반 CI |
| 실제 Chromium | 비교표·ETH·BMNR·MSTR × 320/390/768/1024/1440px = 20 경우 성공 | [브라우저 영수증](20261026-journal-browser.json) |
| 0값 경로 | 별도 합성 reconstructed fixture 1 경우 성공; 실제 발행/시장 성과 제외 | 동일 브라우저 영수증 |
| 늦은 응답·취소·timeout·다른 창·닫기→재열기·Escape | 16 loader + 6 entry 검사, 실제 native close/reopen 및 Escape 확인 | 동일 CI/evidence |
| 가격 비교 | 고유 원점 111, 만기 도래 원점/기간 320, 전향 확정 0 | [비교 JSON](20261026-final-comparison.json) |
| 실제 경제 수집 | 고정 원문/라이선스와 actual collectedAt 확보, 적격 경제 snapshot 0 | [수집 영수증](20261026-final-economic-acquisition.json) |
| 별도 연구 발행 원장 | 실제 9 records / 3 snapshots; 재실행 new 0, reused 9, 정확 재생 9 | [재생 영수증](20261026-final-asset-replay.json) |
| 외부 검토 소스 패킷 | 203 seeds, 231 entries, 213 parts, 미해결 import 0 | [소스 manifest](20261026-review-source-manifest.json) |

일반 CI의 실제 checkout은 GitHub 합성 merge commit 0f72d7ccfa66d53a2be74094ebdd98b1dac189de였으며, Git API로 tree가 PR head d510163의 tree와 동일함을 확인했다. 후보 evidence는 d510163을 직접 checkout했다. [세부 CI 영수증](20261026-journal-ci.json).

브라우저는 실제 GitHub Actions Chromium 155이며 실물 모바일·Safari 검증은 아니다. 런타임 오류 및 자료 요청 오류 0. 320px PNG는 직접 열어 확인했으며, 비교표의 한 줄 toolbar와 가로 스크롤 시작·중간·끝 고정 열 정렬도 검사했다.

- [ETH 저장본 320px](journal-eth-320.png)
- [BMNR 저장본 320px](journal-bmnr-320.png)
- [MSTR 전체 저장 경로 320px](journal-mstr-320.png)
- [합성 0값 회귀 검사 320px](journal-zero-test-320.png)

전체 artifact: [실행 40323657043 / artifact 12649823742](https://github.com/twoimo/bitcoin-cycle-atlas/actions/runs/40323657043/artifacts/12649823742), ZIP 27,555,904 bytes, SHA-256 2ca6b92d258fc5e7350c409b9f2d622e475539507f558c3fdee7a8149f2bda9f. 당시 GitHub 보관 만료 예정은 2026-11-25다. 핵심 수치·영수증·원문·snapshot·기록·소스 및 PNG는 저장소에도 보존한다.

## 1~5단계의 현재 구분

| 요청 단계 | 실제 이어서 완료한 내용 | 남은 조건 |
| --- | --- | --- |
| 1. 발행본·입력·공통 시간 | ETHUSD/BMNR/MSTR 각 세 조건 발행; 원문 byte hash와 사용한 가격 prefix 연결; issuedAt·cutoff·수집·관측·공개 시각 분리 | 과거에 없던 발행본이나 공개시각을 소급 생성하지 않음 |
| 2. 누적 평가·최신성·비용 | 27개 목표 pending을 보존; 자료 지연과 실패 상태 분리; 기존 성능 gate 재실행 | 실제 시간이 흐른 뒤 관측 판본이 수집돼야 점수 생성. Worker 필요성을 새로 입증한 것은 아님 |
| 3. 당시 저장본 재생·변경 이유 | ETH·BMNR·MSTR 화면 연결, 고정 경로·기준선·원문·수정 사유·JSON 내보내기, 취소/재시도/접근성 | 첫 9개는 첫 기록이며 존재하지 않는 과거 수정 이유를 만들어 넣지 않음 |
| 4. 상품 원장·ETH 경제·유동성 | 별도 주식/코인 시간 규칙, ETH/BMNR 기초 경로 일치, 13 경제 특징과 두 타깃의 추정/제거 실험 | 실제 네트워크 경제 25 지표의 적격 판본과 LST 실행 유동성 미확보; 회사의 대기 기간 가정을 네트워크 관측으로 보지 않음 |
| 5. 확률·설명변수·렌더러 조건부 실험 | 8후보 비교, 같은 원점/비중첩 손실, 포함률/폭/score, 경제 OOS ablation, 원래 저장 0값과 baseline 렌더링 | 보정된 운영 확률·충분한 전향 성과·장기 2030–2035 검증 미완료 |

## BTC “3년 상승·1년 하락” 적용과 결과

실제 BTC의 로그 앵커 수식, 위상·고저점·진폭과 타이밍 보정을 읽어 전이 후보를 만들었다. ETH 관측의 확정 전환점에서 같은 식의 기간·진폭을 재추정하는 후보도 별도로 구현했다. 새로운 BTC 달러 목표가나 48개월 미래 파형을 ETH에 강제하지 않는다.

다음은 각 후보와 같은 원점의 가격 유지 기준선 비교다. 개선율은 1 − 후보 절대 로그오차 / 같은 원점 기준선 절대 로그오차다. 양수이면 후보 오차가 작다. 서로 다른 행은 가용 원점이 다르므로 전체 순위가 아니다.

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

90일 BTC 전이/ETH 재추정은 직접 공통 비중첩 5개에서 0.299020 / 0.393584, BTC 전이/기존 ETH는 6개에서 0.342653 / 0.375043이다. ETH 재추정/기존 ETH의 공통 원점은 0이며 다섯 핵심 후보 전체 공통 원점도 0이다. 독립 시장 국면 수는 확인되지 않았다. 현재 ETH 재추정은 추정 고점권이 이미 지나 unavailable이다.

이 결과는 현재 보유 archive의 재구성 평가다. 그 당시에 배포된 모형·입력 판본으로 발행했던 성과가 아니다. 단일 잔차 예시가 기준선보다 못한 경우를 숨기지 않으며 seed를 바꾸어 좋은 결과를 고르지 않는다.

## 경제 입력은 어디까지 연결됐나

경제식은 각 기간의 ETH/USD와 ETH/BTC 로그 수익률을 별도로 추정한다. L1 gas·L2 거래·blob 수요, fee/supply 비율, 순 공급 변화율, 스테이킹/대기 잔고 비율, L2 지불 귀속 비율, 과거 ETH/BTC·BTC 모멘텀, 관측 net staking yield, 완료 출금 소요일수, 중복 제거 담보 비율이 실제 특징과 추정 계수에 들어간다. 현재 설명 기여/민감도와 한 변수 제거 후 과거 시점별 재추정·OOS 손실도 분리한다. [식과 정의](../ETH_ECONOMIC_SOURCE_REVIEW.md), [제거 실험 영수증](20261026-final-ablation.json).

실제 Coin Metrics CSV 3,952행을 원문/라이선스/해시와 함께 확보했으나 최신 완결일은 2026-05-23, 가격 기준일 대비 155일 지연이다. FeeTotNtv의 총 수수료, IssTotNtv의 gross 발행, 미정산 공급, L1 거래 건수는 필요한 25개 필드의 정확한 정의를 대신하지 못한다. 경제·결합 후보의 실증 표본은 0이며 사용 불가 상태다. 가상 값, 미래 값, 과거 수집시각을 만들어 넣지 않았다.

원문은 research-data/eth-economic-captures/20261026T121240869Z-coinmetrics에, 실제 첫 발행은 dist/data/asset-forecast-ledger에 보존했다. 처음 실제 생성한 시각은 2026-10-26T12:12:47.948Z다. 동일 입력 재실행을 새 경제적 실행으로 세지 않는다.

## 외부 검토와 공개 상태

[ChatGPT 논제 원문](../reviews/ETH_CHATGPT_THESIS_20261026.md)을 실제 소스와 실행 근거에 연결해 보존했다. 같은 OpenAI 모델의 분리된 소스 검토는 수행했지만 실제 Gemini 반대 보고서 및 그 보고서에 대한 ChatGPT 역검증은 미완료다. 검토 패킷 준비나 구조 검사 성공으로 실제 Gemini 실행을 대신하지 않는다.

main은 30805dacdcf0aa3ea991439de87d5f9a38c59f25의 기존 v1.29.0이다. 확인된 실제 Pages 성공 실행은 [40286828504](https://github.com/twoimo/bitcoin-cycle-atlas/actions/runs/40286828504), 2026-10-26 07:36:30–07:39:05 UTC / 16:36:30–16:39:05 KST다. 이전 대화에 등장한 40302000000 링크는 이 배포 영수증이 아니며 사용하지 않는다. 이 후속 작업을 공개 배포 완료로 보고하지 않는다.
