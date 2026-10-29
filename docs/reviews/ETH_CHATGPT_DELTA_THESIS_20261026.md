# ChatGPT 변경분 논제 — 기간별 표본·프로토콜 시각·검토 소스 결합

## 판단과 검토 대상

이번 변경은 연구 후보의 평가와 입력·검토 검증을 교정한다. 기본 모형 승격을 뒷받침하는 성과 개선은 아니다. 실제 평가에서 ETH 재추정의 30·90일 손실이 악화됐고, 정의가 일치하는 경제 snapshot 0개, 실제 Gemini 반대 검토 미완료, 전향 목표 27개 미확정 조건은 그대로 남아 있다. PR #39는 draft로 유지하며 releaseAuthorized=false다.

- 단계: 실제 ChatGPT의 변경분 논제. Gemini 보고서 또는 Gemini 보고서의 역검토가 아니다.
- 제공자·모델: OpenAI / GPT-6 Astra Pro, 이 세션에 제공된 표시. 내부 reasoning 설정·모델 실행 인증은 독립 확인하지 못했으므로 추정하지 않는다.
- 문서 증거 취합 기준: 2026-10-26T13:22:26Z.
- 동결된 검토 대상: **112892aa634ea8ec0d31d9bf60ad902f2b3fd600**, tree **e5ae7ead7a58596ae34ee8863ae936469af7bd9d**.
- 이번 변경의 직전 기준: b320bfa25ebf5516f16ca5413b61de7614056151. 패킷의 장기 baseline 30805dacdcf0aa3ea991439de87d5f9a38c59f25와 구별한다.
- source-book SHA-256: **a2924fb225c27c88c3c3350121e7ab6af91a8cba586280e0b77f42263118601d**, **38,522,626 bytes**, 205 seeds / 234 entries / 215 parts / unresolved imports 0.
- 이 보고서와 영수증을 저장한 후속 문서 커밋은 검토 대상 소스를 바꾸거나 이전 실행 범위를 소급 확장하지 않는다. 후속 자동 실행이 다른 패킷을 만들더라도 이 논제의 대상은 위 동결 소스·패킷이다.
- 접근: 기존 GitHub 연동을 통한 원문·Git blob·compare·실제 CI 로그 및 로그의 실제 PNG. 로컬 저장소 실행, Native2, Zero Risk, 별도 web harness·터널은 사용하지 않았다.

실질적으로 검토한 범위는 이번 16개 변경 파일, 관련 소비 경로, 실제 비교·수집·원장·브라우저 영수증, 공식 genesis/fork 설정과 Coin Metrics 자료다. 이 세션에서 전체 38 MB 패킷의 모든 파일을 독립 재감사했다는 뜻은 아니다. 세 병렬 소스 검토는 같은 OpenAI 계열의 검토이며 외부 Gemini 실행 증거가 아니다. [이전 논제](ETH_CHATGPT_THESIS_20261026.md)의 d510163 대상 결과는 역사적 기록이고, 이번 기간별 평가에 대한 최신 수치는 아래와 같다.

## 1. 기간별로 유효한 ETH 재추정 예측을 보존한다

[ethereum-cycle-models.js](../../dist/ethereum-cycle-models.js)의 기존 조건은 요청한 기간 중 최댓값이 마지막 추정 앵커를 넘으면 후보 전체를 unavailable로 만들었다. 따라서 180일 예측을 만들 수 없다는 이유로 원래 유효했던 30일·90일 예측도 평가에서 빠졌다.

변경은 각 기간의 목표 날짜가 마지막 앵커 이내인지 따로 검사한다. 유효한 예측은 기존 로그 앵커 식으로 계산하고, 범위를 넘는 항목만 사유와 목표 날짜를 가진 unavailable로 반환한다. 모든 기간이 범위를 넘을 때만 후보 전체를 unavailable로 반환한다. 요청 순서와 개별 요청의 결과는 일치한다.

과거 prefix와 확정 전환점만 쓰는 조건, 고점권이 이미 지난 경우의 중단, 최종 앵커 경계, 양수 가격·계수 보호조건 및 실제 BTC 모형 호출은 유지된다. 추가 미래 파동을 발명하지 않는다. comparator는 항목별 불가 사유를 그대로 전달한다. 정책 버전은 eth-cycle-comparison-2 / eth-locked-candidate-comparison-2다.

이것은 실제 선택 편향을 줄이는 수정이다. 원래 버전에서 30일·90일 가용 원점은 각각 12개였고, 이번에는 35개·32개다. 복원된 원점을 포함하면 단기 성과가 더 나빠진다. 평가 표본을 성적에 맞추어 다시 좁히지 않는다.

### 실제 재실행 결과

기준일 2026-10-25, 고유 원점 111개, 만기가 도래한 원점/기간 조합 320개, 전향 확정 성과 0개다. 아래 오차는 비중첩 타깃 부분의 평균 절대 로그가격 오차다. 개선율은 1 − 후보 오차 / 같은 원점의 가격 유지(flat) 오차이며 음수는 더 나쁜 성과다. 서로 다른 후보는 가용 원점이 다르므로 행의 평균만 비교해 전체 순위를 만들 수 없다.

| 모형 | 기간 일 | 가용 원점 | 확정 결과 | 비중첩 n | 모형 오차 | 같은 원점 flat 오차 | flat 대비 개선 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| btcTransfer | 30 | 93 | 91 | 48 | 0.210427 | 0.212441 | 0.95% |
| ethRefit | 30 | 35 | 35 | 19 | 0.405667 | 0.224996 | -80.30% |
| legacyEth | 30 | 32 | 30 | 15 | 0.216157 | 0.129982 | -66.30% |
| btcTransfer | 90 | 93 | 89 | 25 | 0.312430 | 0.362622 | 13.84% |
| ethRefit | 90 | 32 | 32 | 11 | 0.556967 | 0.339367 | -64.12% |
| legacyEth | 90 | 32 | 28 | 7 | 0.508307 | 0.406936 | -24.91% |
| btcTransfer | 180 | 93 | 86 | 14 | 0.552761 | 0.588618 | 6.09% |
| ethRefit | 180 | 12 | 12 | 4 | 0.339166 | 0.485493 | 30.14% |
| legacyEth | 180 | 32 | 25 | 4 | 0.443432 | 0.253232 | -75.11% |

ETH 재추정은 30일 오차가 flat보다 80.30%, 90일은 64.12% 크다. 180일의 +30.14%는 비중첩 표본 4개 결과다. 이는 독립 시장 국면 4개를 뜻하지 않으며 고정된 3년 상승·1년 하락 법칙의 증거가 아니다. 현재 ETH 재추정은 추정 고점권 날짜가 지나 여전히 unavailable다.

현재 보유 가격 archive를 이용한 과거 재구성 평가이며 당시 실제 발행한 성과가 아니다. economic·combined는 모든 기간에서 가용 원점 0개다. [정확한 비교 JSON](../eth-candidate-evidence/20261026-delta-comparison.json)에 공통 원점·후보 쌍·구간 지표와 채택 금지 사유를 함께 보존했다.

## 2. 실제 프로토콜 시각과 경제 표본의 한계를 검증한다

[ethereum-economic-model.js](../../dist/ethereum-economic-model.js)의 assertEthereumEconomicProtocolEra는 경제 관측 구간의 종료 시각을 실제 메인넷 활성 시각과 비교한다.

- Beacon genesis 이전에 완결된 구간은 합의 발행·활성 스테이킹·합의 보상·활성 원금을 양수로 보고할 수 없다.
- Capella 이전에 완결된 구간은 실행 계층의 완료 출금을 양수로 보고할 수 없다.
- Dencun 이전에 완결된 구간은 blob gas·수수료·소각을 양수로 보고할 수 없다.
- 활성일은 하루의 일부에 실제 활동이 있을 수 있어 허용한다. genesis 이전의 예치 청구권·담보·준비 서비스 비용까지 임의로 금지하지 않는다. 기존 완전 post-Merge 구간의 PoW 발행 0 조건도 유지한다.

실제 Beacon genesis는 1606824023이다. 설정의 MIN_GENESIS_TIME 1606824000과 혼동하지 않는다. 12초/slot, 32slots/epoch와 Capella epoch194048, Deneb epoch269568을 연결하면 2023-04-12T22:27:35Z와 2024-03-13T13:55:35Z가 된다.

근거는 [eth-clients/mainnet의 고정 README](https://github.com/eth-clients/mainnet/blob/8cad4805e9cb5aa5e8e74d30e3f5029a7f133372/README.md), [고정 consensus mainnet 설정](https://github.com/ethereum/consensus-specs/blob/ff73f4dd90a8717b13ed5a52afa5c1af358259b5/configs/mainnet.yaml), [phase0 preset](https://github.com/ethereum/consensus-specs/blob/ff73f4dd90a8717b13ed5a52afa5c1af358259b5/presets/mainnet/phase0.yaml), [공식 Shapella 발표](https://blog.ethereum.org/2023/03/28/shapella-mainnet-announcement), [공식 Dencun 발표](https://blog.ethereum.org/2024/02/27/dencun-mainnet-announcement)다.

전체 경제 후보에는 완료 출금 1건 이상과 비중첩 확정 학습 타깃 16개가 필요하다. 따라서 첫 완성 입력이 Capella 활성일에 즉시 가능했다는 낙관적 가정에서도 현재의 표본 상한은 다음과 같다.

| 기간 | 2026-10-25 기준 최대 확정 타깃 | 요구 수 | 구조상 상태 | 16개가 가능해지는 가장 이른 asOf | 다음 UTC 자정 발행 정책상 최초 시각 |
| --- | ---: | ---: | --- | --- | --- |
| 30일 | 43 | 16 | 이론상 가능; 실제 입력은 미확보 | 2024-08-04 | 2024-08-05T00:00:00.000Z |
| 90일 | 14 | 16 | 현재 불가능 | 2027-03-22 | 2027-03-23T00:00:00.000Z |
| 180일 | 7 | 16 | 현재 불가능 | 2031-03-01 | 2031-03-02T00:00:00.000Z |

마지막 열은 **최초 시각의 이론적 하한**이다. 실제 자료를 이미 획득했다거나 그날 모형이 준비된다는 약속이 아니다. 실제 완료 출금, 25개 입력의 완전한 관측, 공개·수집 시점 증거는 시작을 더 늦출 수 있다. 진단은 actualEligibleLabels=null, provesInputReadiness=false, independentMarketRegimes=null을 반환한다. 비중첩 타깃이 독립 국면을 보장하지 않는다.

공통 합성 fixture를 2024-04-01 이후로 옮겨 실제로 불가능한 pre-Capella 완료 출금·pre-Dencun blob으로 성공하는 검사를 제거했다. 긴 3,000일 fixture는 2032년까지 이어지는 **합성 기전 검사 자료**이며 실제 미래 관측으로 쓰지 않는다. pre-Merge 순 공급 회계는 같은 산식을 호출하는 ethereumEconomicNetSupplyRate helper로 검증하되 그 시대에 전체 25입력 후보가 ready라고 주장하지 않는다. 경제식 버전은 eth-economic-ridge-4이며 16표본 요건을 낮추지 않았다.

### 실제 원자료의 정의 문제는 남는다

이번 실제 수집에서도 고정 Coin Metrics 원문 3,952행을 바이트·Git blob·라이선스와 함께 확보했다. 최신 완결 창의 마지막 날짜는 2026-05-23이며 기준일보다 155일 오래됐다. 전체 25개 요구 지표와 정확한 정의가 일치하는 지표 0개, 적격 snapshot 0개다. 수집 성공은 모형 입력 준비 성공이 아니다.

원문 [csv/eth.csv](https://github.com/coinmetrics/data/blob/f1a36afb962731c387bb03982758ab0103063da5/csv/eth.csv)의 FeeTotNtv는 blob을 포함하는 집계, IssTotNtv는 gross 발행, TxCnt는 L1 거래 건수이므로 실행 수수료·순 합의 발행·L1 gas 또는 L2 거래로 대체할 수 없다.

SplyCur를 전체 ETH 공급으로 단정하는 것도 위험하다. [Coin Metrics의 staking 공급 설명](https://github.com/coinmetrics/product-docs/blob/8489126ae94aff995d01be44f965327f2640f51e/docs/tutorials-and-examples/tutorials/using-staking-metrics-to-get-yield-and-staked-supply.md)은 total = execution ledger + consensus ledger − consensus deposits로 중복을 제거한다. 실제 원문을 대조한 2022-01-01의 CSV 값 약118,049,177.834937은 문서의 실행 계층 값과 같고 전체118,424,228.627950과 다르다. 2022-12-31도 CSV 약120,528,769.150157과 전체121,474,110.710956이 다르다. 두 반례는 전 기간 무조건 치환이 틀림을 보이며 모든 날짜의 공급 회계를 끝냈다는 뜻은 아니다.

출처의 계산 완료 시각이나 Git commit 시각을 과거 실제 공개 시각으로 대신하지 않는다. 원시 수집 영수증은 [CI JSON](../eth-candidate-evidence/20261026-delta-ci.json)의 economicAcquisition에 그대로 보존했다. [변수 제거 실험 JSON](../eth-candidate-evidence/20261026-delta-economic-ablation.json)은 실제 적격 데이터 부재로 0표본이다.

## 3. 외부 검토가 인용한 소스를 실제 패킷 바이트와 묶는다

[build-eth-review-packet.mjs](../../scripts/build-eth-review-packet.mjs)의 기존 검증은 전체 book hash와 별도 manifest/readback을 검사했지만 내부 book의 헤더·파일 payload와 manifest를 충분히 직접 연결하지 않았다. manifest와 보고서를 함께 바꾸는 경우를 막기 위해 validateEthReviewSource를 추가했다.

검증은 실제 book의 commit/tree 헤더, 파일 순서·경로·종류·원문 길이·SHA-256·인코딩·payload, UTF-8 왕복 또는 정규 base64, committed source의 Git blob SHA-1, 조각 번호·바이트·해시·UTF-8 및 전체 연결을 대조한다. 인용 검증에 쓰는 source readback도 별도 주장 대신 실제 payload와 일치해야 한다. 중복 경로·제어문자·뒤에 남는 미선언 바이트·누락 조각은 거부한다. builder는 자신의 출력도 검증한다.

동적 import 앞의 block/line comment와 JavaScript 줄 구분자 때문에 import가 누락되던 문제도 보완했다. 계산된 경로는 명시적 해소가 없으면 계속 SOURCE_MISSING이다. 실제 테스트 텍스트에 한정한 비실행 예외 6개의 offset/sourceFragment가 정확히 맞는지 대조했다. 임의 JavaScript의 완전한 런타임 의존성 해석을 증명한 것은 아니다.

추가 회귀 검사는 manifest·보고서·sourceContents·인용문이 서로 일관되게 변조돼도 원래 book과 다르면 거부되는지 확인한다. 한글·이모지·본문 안 구분자·binary payload·조각 변조 및 import 주석을 포함한다.

이 검증은 **구조 일관성**을 검사한다. 내부적으로 일관되게 새로 조작한 book이 실제 Git tree의 구성원인지, 외부 모델에 실제 전달됐는지, 모델 신원·설정·실행이 진짜인지까지 독립 인증하지 않는다. actualModelExecutionAuthenticated=false, releaseAuthorized=false를 유지한다.

## 실제 실행 근거와 동시 운영 갱신

| 범위 | 정확한 실행 소스 | 실제 결과 |
| --- | --- | --- |
| [일반 CI 40328955938](https://github.com/twoimo/bitcoin-cycle-atlas/actions/runs/40328955938) | 합성 merge 9426273e4fa96f76098c89c1949963849e89b1da / tree5ddd1064bc6ee8f23f2025f62952f3b530152ee6 | 주 테스트 1,321 pass, fail/skip/cancel 0; 수치 assertion318,010; 모든 workflow 단계 성공 |
| [직접 후보 검증 40328955886](https://github.com/twoimo/bitcoin-cycle-atlas/actions/runs/40328955886) | PR source112892a / treee5ae7e | 집중188 pass, fail/skip/cancel 0 |
| 실제 Chromium155 | 직접 source112892a | 비교표·ETH·BMNR·MSTR ×320/390/768/1024/1440px, 20경우 및 별도 합성0값 1경우, 합계21 pass; 런타임/요청 오류0 |
| 불변 연구 원장 재실행2회 | 직접 source112892a | 매회 new0 / reused9 / 정확 재생9, snapshot3, pending27 / scored0, productionAdopted=false |
| 소스 패킷 | 직접 source112892a | 38,522,626bytes, 미해결 import0, 외부 검토 pending |

브라우저는 Linux의 실제 headless Chromium이다. 물리적인 모바일·Safari 검증으로 확대하지 않는다. 이번 원본 로그의 ethusd-journal-320-base.png와 zero-fixture-320.png도 직접 열어 읽었다. [브라우저 JSON](../eth-candidate-evidence/20261026-delta-browser.json)에 전체 경우·검사·PNG 해시가 있다.

작업 중 main은 별도 [자동 갱신40327355369](https://github.com/twoimo/bitcoin-cycle-atlas/actions/runs/40327355369)으로 30805dac…에서 **5b9246a55889b79eaedb61e9c183e124167b6ea6**으로 이동했고 실제 배포됐다. deploy job121588294779의 2026-10-26T13:05:54.7037913Z HTTP 영수증은 그 소스·manifest와 주요 본문4개를 검증한다. 사이트 전체 파일의 원격 검증으로 확대하지 않는다.

일반 CI가 실제 checkout한 합성 merge는 이 main과 PR112892a를 합친 것이다. main의 자동 갱신10개 경로·신규 Git blob은 PR112892a와 합성 merge 간 차이와 전부 일치했다. 일반 CI tree와 직접 head tree가 같다고 기록하지 않는다. 이번 작업은 자동 갱신을 덮어쓰거나 연구 후보를 main에 병합·배포하지 않았다.

[CI·수집·원장·운영 대조 영수증](../eth-candidate-evidence/20261026-delta-ci.json), [source manifest](../eth-candidate-evidence/20261026-delta-review-source-manifest.json)를 저장했다. 전체 [artifact12654495527](https://github.com/twoimo/bitcoin-cycle-atlas/actions/runs/40328955886/artifacts/12654495527)은 ZIP27,722,185bytes, SHA-256359284ab42f3e625a82111dab302e350bbd6f2ba3e17c5aeb84eed84f2839bc7, 보관 만료 예정2026-11-25T13:17:43Z다. JSON을 재직렬화한 이 저장소 영수증의 파일 hash를 artifact 내부 원본 파일 hash와 같다고 주장하지 않는다. manifest를 저장했다고 전체 source-book 바이트가 영구 보존된 것은 아니다.

## 실제 Gemini 반대 검토에 남긴 질문

이 목록은 실행된 Gemini 보고서가 아니라 다음 실제 검토가 답해야 할 질문이다.

1. 기간별 가용성 변경이 유효한 원점만 복원하며 과거 prefix·확정 반전·마지막 앵커·고점권 만료를 보존하는가? 30·90일 악화와 현재 unavailable를 모두 고려해 고정 사이클 주장에 어떤 반례가 있는가?
2. 경제 구간의 종료 시각과 genesis·Capella·Deneb 시각의 비교가 활성일 부분 창에서 맞는가? 예치 청구권과 활성 원금을 혼동하거나 미래 합성 fixture를 실측 근거로 승격하는 경로가 있는가?
3. Capella일부터의 비중첩 확정 타깃 상한43/14/7과 16표본 최초 시각에 off-by-one 또는 공개시각 문제가 있는가? 상한이 실제 준비도를 입증하지 않는다는 의미가 소비 경로 전체에 유지되는가?
4. 수수료·gross/net 발행·실행/합의 공급·LST 담보 중복 제거와 실제 출금 유동성이 경제식 정의에 맞는가? 현재 수집 자료로 25입력 준비를 주장할 수 없는 반례 또는 추가 필수 정산은 무엇인가?
5. 원래 book을 고정한 채 manifest·보고서·readback·인용 hash를 함께 바꾸는 공격이 실제 헤더·payload 검사에서 차단되는가? 한글·이모지·구분자·binary·base64·중복 경로·잔여 바이트·조각 경계에서 최소 반례가 있는가?
6. import scanner의 주석·줄 구분자 처리가 실제 의존성을 누락하거나 비실행 예외가 실행 import를 가릴 수 있는가? 새로운 회귀 검사가 의도한 결함 대신 다른 이유로 우연히 실패하지는 않는가?
7. 구조 검증과 실제 외부 모델 신원·전달·실행·승인의 경계가 유지되는가? 새 파서 통과나 CI 성공이 Gemini 완료·확률 보정·경제 readiness·전향 성과·배포 승인으로 변환되는 소비 경로가 있는가?

## 남은 조건과 다음 판단 기준

현재 허용된 GitHub 연동에 실제 Gemini가 소스를 읽고 텍스트 반대 검토를 실행하는 기능은 노출돼 있지 않다. 실제 계정·권한·모델·유료 설정이나 금지된 실행 경로를 대신 사용하지 않았다. 외부 보고서의 실제 모델·설정·시각·원문 URL·원문 bytes/hash·소스 수신 증거를 확보한 다음, 같은 동결 소스와 주장 각각을 ChatGPT가 역검증해야 한다. 지금은 actualGeminiReport=null, actualChatgptReverse=null이다.

경제 후보는 정의가 맞고 신선하며 당시 가용성이 입증되는 입력과 충분한 확정 학습 표본이 필요하다. 더 짧은 역사에서도 되는 별도 축소 모형을 만들려면 현재 전체 모형의 조건을 몰래 완화하지 않고 새 설계 논제·반대 검토·별도 성과 비교로 다뤄야 한다. LST 실행 유동성·수요 식별·독립 정산·구조 변화 검토도 완료되지 않았다.

실제 연구 원장의 목표27개는 시간이 지나고 적격 결과 관측이 확보돼야 평가할 수 있다. 충분한 전향 표본, 확률 보정, 장기2030–2035 검증이 아직 없다. 이 문서는 해당 조건이나 전체 학술 문헌 검토 완료를 주장하지 않으며, main 병합·기본 모형 승격·운영 배포를 승인하지 않는다.
