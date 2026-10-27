# ETH 후속: 화면 오류·Hallmark·PoW 부분 관측 — 2026-10-27

## 완료 결과

이번 후속은 실제로 보이지 않던 BTC 갱신 실패 안내, 반응형 표·대화상자의 고정 영역, 남아 있던 Hallmark FAIL/REFLEX를 개선했다. 이더리움에는 **PoW 실행 계층 발행 종료라는 부분 관측 1개**를 실제 공개 RPC와 고정 규격 원문으로 수집하는 경로를 추가했다.

**최종 응용·검증 소스는 39d380d5a05295f5180088ccfe0190ebc3b21e0d, tree는 e44d085806b4d34ae59c99c88e6a64543f429669다.** 이 보고서와 원자료를 추가하는 후속 문서 커밋은 실행한 소스 커밋과 구분한다.

| 검사 | 실제 결과 |
| --- | --- |
| [일반 CI 40457958474](https://github.com/twoimo/bitcoin-cycle-atlas/actions/runs/40457958474) | **1,436/1,436**, fail 0, skipped 0. 별도 daily clock 28/28, 수치 assertion 318,010, negative control 16/16 |
| [정확한 head의 후보 evidence 40457958478](https://github.com/twoimo/bitcoin-cycle-atlas/actions/runs/40457958478) | 집중 **303/303**, fail 0, skipped 0 |
| 실제 Chrome 화면 | **35/35**, **181 PNG**, runtime 0, unexpected resource 0. 35개 중 합성 0 경로 case 1개는 테스트용으로 별도 표시 |
| 원래 offline 오류 | **15개 원본 오류를 보존**, 정확한 endpoint·UTC·frame/loader와 각 실제 실패 상태를 대조 |
| [전체 앱 Hallmark 40457958468](https://github.com/twoimo/bitcoin-cycle-atlas/actions/runs/40457958468) | **0 FAIL / 0 REFLEX**, integrity errors 0. 정적 **36 WARN**, render **17 WARN**은 유지 |
| PoW 부분 관측 | 실제 **51 RPC + 고정 원문 3회**, 전체 **26.605초**, 원문 **54개 / 1,075,342 bytes** |
| 검토 source-book | **243 seeds / 346 entries / 255 parts / 45,771,932 bytes**, unresolved 0 |

일반 CI의 checkout은 main과 PR의 합성 merge **6b2875a74cbebf8eefb392e679c2075adf16813a**, tree **c9bb2f23cd6bc7047018bb59b1300c21e5fdc77a**다. 집중·native·Hallmark는 위의 정확한 PR head를 실행했다. 두 범위를 혼동하지 않는다.

[실행 영수증](eth-candidate-evidence/20261027-ui-protocol/execution.json) · [전체 근거 안내](eth-candidate-evidence/20261027-ui-protocol/README.md) · [native 원본](eth-candidate-evidence/20261027-ui-protocol/browser-receipt.json) · [Hallmark 원문](eth-candidate-evidence/20261027-ui-protocol/hallmark-records.json)

## 1. 갱신 실패를 실제 화면에서 알리고 재시도한다

기존 quiet 갱신 실패는 숨겨진 메뉴 버튼 title에만 있었다. 이제 main의 첫 행에 **비트코인 일별 갱신 실패 / 유지하는 관측일 / 재시도**를 표시한다. 데이터가 제공자에서 아직 늦게 나오는 경우는 실패와 구별해 제공 지연으로 남긴다.

- 요청 전에는 오류를 만들지 않는다. 요청 중에는 실제 busy 상태와 잠긴 재시도 버튼을 표시한다.
- 성공한 요청이 오래된 관측만 반환하면 최신 자료로 표시하지 않는다.
- 같은/이전 배포 archive의 재조회 성공은 제공자 갱신 실패를 지우지 않는다. 실제 바뀐 최신 완료 관측의 배포 수신만 별도로 설명한다.
- 단일 polite live 영역이 결과를 알린다. 같은 state/cutoff를 다시 그릴 때 알림을 반복하지 않고 기존 toast에 중복 전송하지 않는다.
- 안내가 사라질 때 그 안내 내부에 있던 포커스만 main으로 옮긴다. main.inert, 독립 data 화면, ETH 화면의 소유권은 유지한다.
- mobile 고정 메뉴는 실제 측정한 공지 높이를 반영한다. main grid의 열은 minmax(0,1fr)로 제한해 재시도 버튼이 화면 밖으로 밀리지 않게 한다.

320×900·1440×900·900×430의 native Enter 재시도에서 서로 다른 새 requestId, **refreshing → failed**, disabled/busy true → false를 확인했다. 각 재시도 후에도 **$80,038.91 / 2026.10.25 UTC / observed**가 유지됐다. 이 수치는 검증에 사용한 저장 관측이며 현재 실시간 가격이라는 뜻이 아니다.

320px에서 재시도 버튼은 x=256–312, y=4–48의 실제 영역을 가지며 문구·버튼이 가려지지 않는다. preview는 내부 문서의 가시성과 부모 스크롤 도달을 따로 검증한다.

## 2. 하단 높이·표 고정·짧은 대화상자

| 화면 | 실제 측정 |
| --- | --- |
| BTC 320×900 / 1440×900 | chart stage bottom = viewport bottom = **900** |
| BTC 900×430 | chart stage bottom = viewport bottom = **430** |
| 비교표 1620×1008 | root bottom 1008, 내부 끝 1007, 마지막 행 1006.75: 차이 **0.25px** |
| 비교표 1920×1440 | root bottom 1440, 내부 끝 1439, 마지막 행 1438.75: 차이 **0.25px** |
| 비교표 900×430 | 두 축 끝 x=346/346, y=633/633. 마지막 행·이름·판정과 헤더 4개 모두 topmost |
| 비교표 320×568 | 두 축 끝 x=432/432, y=544/544. 같은 4개 항목 모두 topmost |
| 지표 창 900×430 | 18항목, scrollTop=max=1403. 제목·닫기 버튼이 clip 안에 남고 실제 Shift+Tab → 2px focus → Enter 닫기 통과 |

18종목, BTC 첫 행, **비트코인** 표시를 유지했다. 데이터 표의 세로 고정은 thead가, 가로 고정은 이름 헤더와 셀이 담당한다. 숨겨진 페이지와 닫힌 dialog에 불필요한 sticky를 부여하지 않는다. 열린 지표 창·현재 compact pane·현재 data/evidence 표에 공통 위치 규칙을 적용한다.

legacy 375px 출처는 clientWidth=scrollWidth=323이다. 세 링크는 짧은 이름과 기존 목적지·보안 속성을 유지하고, **Forecasting: Principles and Practice** 전체 제목은 본문에 표시한다. 축소·말줄임으로 긴 출처를 지우지 않았다.

이 결과는 Actions의 Chrome에서 확인한 viewport·입력·스크롤 동작이다. 물리적 모바일 Safari, 모든 보조 기술, 닫힌 지표 창의 opener 포커스 복귀까지 검증한 것으로 확대하지 않는다.

## 3. Hallmark의 실제 개선과 남는 WARN

고정 upstream **v2.0.0 / 7ec868225c6caa040558c321ee0fefa0e73f83a8**, app 범위와 기존 8경로를 유지했다. 검사기·severity·waiver 정책은 변경하지 않았다.

이전 870cf93 실행의 **6 FAIL / 3 REFLEX**는 이번 최종 실행에서 **0 / 0**이다. analysis-window-controls는 실제 분석 select 묶음이므로 analysis-parameters 및 이름 있는 role=group으로 정리했다. 실제 조작을 유지했으며 장식용 브라우저 창을 제거했다는 시각적 변경으로 주장하지 않는다. 위치 중복은 각 scroll owner를 정리하고, 출처 링크는 전체 제목과 목적지를 보존하면서 읽을 수 있게 구성했다.

WARN은 정적 36개·render 17개가 남는다. 대비·surface·표현 반복·모바일 표시·kept 비교 등의 원문을 그대로 보존한다. 이 두 수는 중복되지 않은 고유 결함의 합계가 아니다. links 7/7·script hooks 11/11, render links 30/30·fields 72/72가 유지되지만, render의 heading 52/54(기록된 변경 1개) 및 figures 208/209에 대한 WARN도 남긴다. “모든 콘텐츠와 접근성 경고가 해결됐다”는 판정은 하지 않는다.

## 4. 이더리움 PoW 부분 관측: 증명할 수 있는 범위

[EIP-3675](https://eips.ethereum.org/EIPS/eip-3675)는 전환 블록부터 PoW 블록·ommer 보상을 제거하고, 거래 수수료 자체는 그대로 둔다. [EIP-4399](https://eips.ethereum.org/EIPS/eip-4399)는 mixHash에 RANDAO 의미를 부여하므로 단순히 0을 요구해서는 안 된다.

공급 회계의 해당 항목은 정식 post-Merge canonical 블록이라는 조건에서 다음 상수 관계를 갖는다.

    executionPowIssuanceEth(window)
      = sum(PoW block reward + ommer reward)
      = 0

이는 규칙을 적용한 부분 항목이며, PoS consensus 발행·전체 ETH 순발행·수수료·소각·가격을 0으로 두는 식이 아니다. 또한 PoW 발행 종료에서 ETH의 고점 갱신 여부나 미래 수익률을 바로 도출하는 가격 정리가 아니다.

실제 수집은 다음 경계를 확인했다.

1. 고정 EIP-3675, EIP-4399, mainnet config의 **실제 bytes**를 Git blob SHA-1과 대조하고 SHA-256을 기록했다.
2. mainnet chain ID, terminal parent 15,537,392 → terminal 15,537,393 → transition 15,537,394의 연결과 전환 전후 header form을 대조했다.
3. **2026-09-29–2026-10-26의 완료 UTC 28일**을 양끝 인접 블록으로 둘러쌌다. 포함 범위는 **26,079,397–26,280,313**이다.
4. provider가 finalized라고 반환한 **26,281,989**를 고정하고, 경계 블록 4개와 이 높이를 마지막에 다시 읽어 identity 변화를 검사했다.
5. actual capture는 **2026-10-27T05:55:13.699Z–05:55:40.304Z**다. 41개 search cache miss를 포함한 RPC 51회로 완료했다.

RPC는 totalDifficulty를 제공하지 않았다. 따라서 TTD 비교는 **unavailable-rpc-fields**로 기록하며 “관측된 TTD 계산 통과”로 바꾸지 않는다. 하나의 공개 provider가 제시한 canonical/finalized 관계를 사용했으며 독립 consensus 검증이나 전체 header chain 검증은 수행하지 않았다.

[최종 receipt와 원문](eth-candidate-evidence/20261027-ui-protocol/pow-zero/receipt.json)과 [첫 성공 판본](eth-candidate-evidence/20261027-ui-protocol/pow-zero-first/receipt.json)을 함께 보존한다. 두 판본은 같은 28일 창의 반복 확인이므로 독립된 시간 표본 두 개로 세지 않는다.

## 5. 수집 비용·실패 경계와 실제 테스트

모든 블록을 반복 조회하는 대신 두 UTC 경계를 이진 탐색한다. core 상한은 초기 5회 + search cache miss 최대 51회 + 마지막 재조회 최대 5회 = **61 RPC**다. 고정 규격 원문 3개가 별도로 필요하다. 전체 header chain을 검증하는 방식과 정확히 구별한다.

고정 endpoint와 chainId/getBlockByNumber(false)만 허용한다. 쓰기 RPC·임의 endpoint·latest·전체 transaction 요청은 거부한다. 요청 간격 500ms, 요청별 10초, 전체 120초, 응답 2MiB·누적 body 16MiB, 재시도 0, redirect 금지를 적용한다.

Content-Length 초과, 읽기 중 byte 초과, deadline, fetch 실패는 실제 fetch signal을 중단한다. 완료된 HTTP/JSON/RPC 실패 원문은 보존하고, 중단된 body는 수신 byte 수와 complete:false를 기록한다. 불완전한 원문에 전체 SHA-256을 붙이지 않는다. stdout 원문 전송 한도 4MiB는 raw 기준이며 base64 로그는 더 커질 수 있다.

**26개 새 테스트**는 chain/header/TTD/source pin/UTC·미완결·노후 창, canonical 재조회 변경, 마지막 finalized 변경, 52번째 검색 전 budget 거부, 요청 종료 전 body timeout, 응답 누적 byte, read-only allowlist, rate-limit 대기 후 deadline, 오류 시 observation:null을 확인한다. 예산 소진 fixture는 악의적 응답을 흉내 낸 합성 테스트이며 실제 체인이나 가격 자료가 아니다.

## 6. 가격 모형에 반영하는 경계

| 상태 | 이번 결과 |
| --- | --- |
| 신규 정의가 대응되는 부분 항목 | executionPowIssuanceEth **1개**, 값 0 |
| 최초 공개 시각 publishedAt | **null** |
| 이 경로의 historical point-in-time 적격 필드 | **0** |
| 전체 25필드 경제 snapshot | **0** |
| 경제 모형 입력 활성화 | **false** |
| 기존 Coin Metrics 엄격 정의 대응 | **0/25** 유지 |
| 기존 throughput | 6,094,027,523,397 gas 환산 supplement; 정수 전체 체인 집계/PIT로 승격하지 않음 |

관측 종료는 10월 26일, 실제 수집은 10월 27일이다. 가격 모형의 보존 입력 종료 10월 25일에 소급해 넣지 않는다. 블록 timestamp, HTTP Date, 수집 시각을 최초 공개 시각으로 대체하지 않는다.

기본 **adaptive v1**과 기존 pooled 후보를 유지했다. v1 경로 **731점**, 기존 요약 **27행**, pairwise **45행**, 이전 현재 예측 후보들이 같은 입력에서 정확히 보존됐다. pooled는 계속 전체 연속 수익률 **1,501개**를 사용한다. 이번 작업은 가격 예측 성능의 새 우월성을 입증한 실험이 아니다.

최종 Actions Node에서 fit + 730일×256 draws는 **42.809322ms**, 로그 행렬은 **1,497,088 bytes**였다. 전체 메모리·물리 모바일 지연 보장 또는 이전 실행 대비 성능 개선율로 해석하지 않는다. 이전의 [수학·동일 원점 비교와 제한](ETH_POOLED_FOLLOWUP_20261027.md), [기관·AI 수요·PoS 심층 연구](ETH_REMODELING_RESEARCH_20261027.md)를 유지한다.

기존 발행본 **9개 / 입력 snapshot 3개**, **27 pending / 0 scored**를 유지했다. 입력 최신성이 부족해 신규 발행은 **0개**다. 충분한 경제 판본·성숙한 전향 성과·장기 표본의 한계는 계속 남는다.

## 7. 중간 실패와 배포 상태

첫 25e4d49 실행의 URL 상태 테스트 **4개 실패**와 native **5개 실패**를 [중간 기록](eth-candidate-evidence/20261027-ui-protocol/intermediate-runs.json)에 보존한다. URL 추출 범위에 들어온 화면 초기화를 분리하고, 모바일 grid 폭을 제한하며, 실제 Enter keyDown에 필요한 문자를 전달해 수정했다. 검사 assertion을 낮추거나 JS click으로 대체하지 않았다.

3be16a0 실행은 일반 1,432·집중 299·native 35·Hallmark 모두 통과했다. 이후 HTTP 선언 길이 초과 시 연결 종료 누락을 소스 점검으로 발견해 최종 코드에서 보완하고 추가 음성 경계를 실행했다.

source-book SHA-256은 **12bb39fc62ba05fd0b0ef3ee9b23618f15857e7327abca9edb323d6042d1a278**이다. generic generator의 externalReview.pending 원문은 보존하고, 현재 사용자 지시인 **Gemini 반대 검토 및 후속 역검토 omitted-by-user**를 실행 정책에 따로 명시한다. 생략을 통과로 기록하지 않는다.

**PR #39 Draft 유지, releaseAuthorized=false.** 기본 모형 승격·main 병합·공개 배포는 이번 범위에서 수행하지 않았다. 확인한 main은 **5dd11c99faa1fe4a1a9adf56bc4775d35c9a41e4**이며 덮어쓰지 않았다.
