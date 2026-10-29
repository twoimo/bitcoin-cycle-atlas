# ETH 남은 조건 심층 후속: 공급 회계·경제 판본·시간 분리 보정

2026-10-27. PR #39의 후속 연구 구현과 실제 실행 증거다. 경제 자료가 없거나 미래 정답이 도착하지 않은 상태를 코드 테스트 통과로 대체하지 않는다. 현재 연구 브랜치는 Draft이며 `releaseAuthorized=false`다. 사용자가 생략한 Gemini 반대 검토와 후속 역검토는 `omitted-by-user`로 유지한다.

## 1. 이번에 완료한 일과 결론

경제 모형의 공급식에 빠져 있던 **수수료 이외 실행 계층 파괴**를 별도 입력으로 추가했다. 경제 계약은 `eth-economic-input-4`, 모형은 `eth-economic-ridge-6`, 필수 입력은 **26개**다. 설명변수는 기존 13개를 유지하고 기존 순공급률의 회계를 교정했다. 이 변화는 경제 모형과 경제 입력 검사 범위에 한정되며 기존 세 가격 모형의 소스 그래프와 최초 발행본을 변경하지 않는다.

실제로 수집한 세 출처의 원문·영수증·관측 창을 불변 경제 판본 원장으로 연결했다. 최초 **3개 수집 기록·6개 값 판본·60개 입력 원문**을 보존했고, 오프라인에서 원문을 다시 계산해 세 기록이 모두 재현되는지 확인했다. 새로 수집한 시각은 실제 획득을 증명하는 상한이며, 과거 최초 공개 시각이나 과거 모형에서 사용했다는 증거로 바꾸지 않는다.

가격 구간은 앞선 **12개 비중첩 오차**로 보정 폭을 고정하고 **그 이후 8개**에서 평가했다. pooled 30일에서 구간점수는 개선됐지만 폭도 커졌다. 이미 살펴본 현재 판본의 개발 자료에 대한 감사이며, 보정된 실전 발행과 전향 성과는 여전히 0개다. 다른 후보·기간의 부족한 표본을 합치지 않았다.

새 공급 제공자의 실제 원문을 받았을 때 기존 파서의 정수·소각 범위 가정이 맞지 않는다는 점도 발견했다. 첫 실패를 그대로 보존한 뒤 정확한 wei 회계와 보조 표시값의 의미를 분리해 교정했다. 제공자 내부의 합계가 맞아도 UTC 창 경계·공개 시계·정규 체인 상태가 검증됐다는 뜻은 아니다.

**현재 전역 경제 모형의 완전 적격 snapshot은 0개**다. 자료 수집·보존·검증 체계와 보정 평가를 진전시킨 결과이며, 경제 예측력을 실증 완료했다는 결론은 내리지 않는다.

## 2. 코드·실행 정체성

| 구분 | 소스 / 역할 |
|---|---|
| 첫 구현 | `ccac8d10dfdc76f618d906d3c3fe4a4d69d7d173` |
| 첫 구현 tree | `ea6fd758831ce3bea8aa518fc1d009478f409529` |
| 실제 판본 seed 보존·공급 파서 교정 | `c73b17b29809961dab7e9337482e22da28789c81` |
| 보존·교정 tree | `2fe83d8eb6e019fe6229e2627751168e20e19491` |
| 첫 일반 CI | [40500039046](https://github.com/twoimo/bitcoin-cycle-atlas/actions/runs/40500039046) |
| 첫 ETH evidence | [40500039083](https://github.com/twoimo/bitcoin-cycle-atlas/actions/runs/40500039083) |
| 첫 Hallmark | [40500038896](https://github.com/twoimo/bitcoin-cycle-atlas/actions/runs/40500038896) |
| 보존·교정 일반 CI | [40518730874](https://github.com/twoimo/bitcoin-cycle-atlas/actions/runs/40518730874) |
| 보존·교정 ETH evidence | [40518730718](https://github.com/twoimo/bitcoin-cycle-atlas/actions/runs/40518730718) |
| 보존·교정 Hallmark | [40518730771](https://github.com/twoimo/bitcoin-cycle-atlas/actions/runs/40518730771) |

이 문서와 원본 실행 자료를 추가하는 후속 문서 커밋은 위 검사 대상 코드 커밋과 구분한다. 일반 PR CI는 합성 merge checkout을 사용하며, ETH evidence와 Hallmark는 PR의 실제 head를 검사한다. 정확한 merge source와 tree는 실행 요약에 별도로 기록한다.

## 3. 공급식에서 누락된 실제 항목

### 3.1 원인과 교정 식

기존 모형은 실행 base fee 소각과 blob 소각을 차감했지만, 수수료와 무관한 실행 계층 잔액 파괴를 별도로 요구하지 않았다. [EIP-6780 원문](https://github.com/ethereum/EIPs/blob/7372d10a457b29eceb02cd052345af165de1fb60/EIPS/eip-6780.md)에는 같은 트랜잭션 안에서 생성된 컨트랙트가 자기 자신을 수익자(beneficiary)로 지정해 SELFDESTRUCT할 때의 잔액 파괴가 남아 있다. 확인한 고정 원문은 5,908 bytes, Git blob `1b6a0e94cc47e859b9866e570391cf37dc55059a`다.

전체 경제 모형은 같은 UTC 창에 대해 다음 식을 사용한다.

```text
공급 증가
= 합의 계층 순발행 + 실행 계층 PoW 발행
  − 실행 base fee 소각 − blob 소각 − 기타 실행 계층 파괴

netSupplyRate = 공급 증가 / 창 종료 총공급
```

`consensusNetIssuanceEth`는 이미 합의 계층 벌금·파괴를 뺀 순발행이다. 따라서 여기에 합의 벌금을 한 번 더 빼지 않는다. 새 공급 원문처럼 gross issuance와 penalty를 각각 제공하는 경우에는 다음 다섯 구성요소 식으로 정산한다.

```text
netWei = issuanceWei − baseFeeBurnWei − blobBaseFeeBurnWei
         − consensusPenaltiesWei − otherExecutionBurnWei
```

스테이킹 입출금과 계층 간 이동은 발행·소각으로 더하지 않는다. 단지 키가 없거나 사용하기 어려운 주소의 잔액, 자금이 남아 있는 주소로의 송금도 자동으로 파괴로 세지 않는다. 기타 파괴를 모르는 경우에는 결측으로 남기며, 잔차가 있다는 이유만으로 그 잔차를 기타 파괴라고 분류하지 않는다.

### 3.2 입력 계약과 회귀 보호

`otherExecutionBurnEth`는 정확한 28 UTC일 범위의 비음수 유한 값이며 출처가 필요하다. null·누락·NaN·Infinity는 측정된 0으로 바꾸지 않는다. 완전한 구형 `input-3` snapshot을 새 계약으로 자동 승격하지 않는다. 정의가 바뀌지 않은 기존 PoW 0의 **부분 관측** 호환성은 별도로 유지한다.

새 필드는 공급률 특징에만 연결한다. 경제 회귀는 13개 특징과 최소 16개 같은 기간 학습 정답을 유지한다. 별도 가격 구간 보정의 최소 12개 오차 조건도 유지한다. 이 두 모듈의 표본 조건을 합치지 않았으며 경제 회귀가 보정 구간을 생성한다는 뜻도 아니다. 산술·음수 합의 순발행·결측·출처·버전·특징 연결·26번째 coverage 상태를 검사하는 테스트 5개를 추가했다. 실제 경제 snapshot이 0개이므로 이번 회계 교정에 대한 시장 예측 성능 향상을 계산하지 않는다.

공급 산술의 정확성은 가격 방향을 정하는 충분조건이 아니다. AI 에이전트의 활동 확대 가설도 거래·가스·blob 수요, 수수료 가격, 소각·검증자 수입, 담보의 고유 기초자산 및 가격 반응을 각각 관측해야 한다. 활동량과 ETH 보유 수요 사이의 크기를 입증하지 않은 계수로 연결하거나 기관 목표가격을 정답으로 쓰지 않는다.

## 4. 실제 공급 원문의 형식 차이와 회계 재생

### 첫 실행은 수집 완료 뒤 감사 단계에서 실패했다

구현 `ccac8d10dfdc76f618d906d3c3fe4a4d69d7d173`의 실행 `40500039083`은 ethsupply.fyi의 방법론과 30일 history를 각각 HTTP 200으로 받았다. 하지만 실제 영수증의 `status`는 **failed**이며 `observation`은 null이다. 실패 이유는 `slots[0].blobsUsed must be a nonnegative safe integer`다. workflow의 `continue-on-error`와 전체 성공을 이 개별 감사의 성공으로 해석하지 않는다.

원문 두 개는 남아 있고, 다운로드한 실제 bytes의 길이와 SHA-256을 다시 대조했다.

| 원문 | 실제 크기 | SHA-256 |
|---|---:|---|
| `methodology.raw.html` | 125,691 bytes | `fd9c3d66c4c8f7112bb44b19a99f8b11a869038b656a7726d6143e5798e73687` |
| `history-30d.raw.json` | 801,536 bytes | `4992d3b2f4cc6d9e353c7f52fdc88c79af2e178dbe126fe5ddbaef1d79ecbbcc` |

history의 제공자 `x-supply-sha256`도 실제 본문 해시와 같다. 방법론 응답에는 해당 digest header가 없으며, 이를 있는 것으로 채우지 않았다. pinned EIP-6780 5,908-byte 원문은 Git blob `1b6a0e94cc47e859b9866e570391cf37dc55059a`, SHA-256 `3941eed8379cc93abb7342c5b186bd883e8b1518b0025d94a49be068f8ea2101`과 일치한다.

수집 완료는 **2026-10-27 21:00:25.700 KST**이고, 제공자 생성 시각은 같은 날 **20:55:00 KST**다. 제공자 revision은 `1793102100662`다. 이 생성 시각과 HTTP Date를 최초 공개 시각으로 바꾸지 않으며, 원래 `publishedAt=null`과 과거 가용성 미확인을 유지한다.

### 문서의 UInt와 실제 집계 응답을 구분했다

원문은 `interval=30epochs`, `intervalSlots=960`, slot bucket **225개**, 별도 epochs 행 **0개**다. 제공자는 216,000 slots·215,252 blocks·748 missed slots와 complete=true를 보고한다. 이는 제공자의 범위 주장이고, 독립적인 canonical chain 재생 결과가 아니다.

공개 schema의 `blobsUsed`는 UInt로 표기돼 있었지만 실제 225개 값은 모두 소수였다. 최솟값은 `3.271966527196653`, 최댓값은 `8.457023060796645`다. 첫 bucket은 955 blocks와 `blobsUsed=4.641884816753927`을 함께 담고 있다. 이런 표시값을 반올림해 blob 개수로 만들거나 30일 총사용량으로 합산할 수 없다. `gasUsed`도 문자열 정수라는 사실만으로 그 bucket 전체의 가스 총량임을 확정할 수 없다.

수정한 `eth-supply-accounting-audit-2`는 보조 blob 표시값을 유한한 비음수 숫자로 보존하고 null·결측·명시적 0·소수를 따로 센다. `gasUsed`, `gasTarget`, `gasMax`, `blobsUsed`, `blobsTarget`, `blobsMax`는 합산과 모형 변환 대상에서 제외했다. 핵심 발행·소각·penalty·net 금액은 계속 정확한 정수 문자열을 요구하며, 결측 비수수료 소멸을 0으로 대체하지 않는다. 이 변경과 실제 최소 행을 포함한 테스트 **22개**가 통과했다.

### 정확한 wei 구성과 잔액 차이를 재생했다

수정된 감사기로 첫 실행에서 보존한 동일 history를 로컬 재생했다. 이것은 새 수집이 아니며, 첫 실패 영수증을 성공으로 고친 것도 아니다. replay는 원래 수집 시각과 요청 기준일을 그대로 사용한다.

**225개 bucket에서 구성 금액으로 계산한 net이 모두 제공자 net과 일치했다.** 각 행을 bucket 종료 잔액으로 보는 명시적 관례 아래에서, 인접 공급량의 차이도 **224쌍 모두** 다음 행 net과 정확히 같았다. 계산은 BigInt로 수행했고 1 wei 허용 오차도 사용하지 않았다.

| 제공자의 전체 30일 bucket 합 | ETH 단위의 정확한 값 |
|---|---:|
| gross issuance | 89,467.551182167 |
| 실행 base-fee burn | 2,023.364391699056193220 |
| blob base-fee burn | 2.791725551194865664 |
| consensus penalties | 151.172777344 |
| other execution burn | 0 |
| net change | 87,290.222287572748941116 |

위 값은 **제공자의 2026-09-27 11:41:11 UTC~2026-10-27 11:40:59 UTC bucket 범위**의 합이다. 경제 모형이 요구하는 닫힌 28일 UTC 창의 값이 아니다. 각 합은 원문 summary의 같은 필드와도 정확히 같다.

`burnWei`는 이 실제 판본의 모든 행에서 base-fee burn+blob burn과 같고, consensus penalties를 포함한 모든 파괴의 합과는 다르다. 따라서 기존 감사기의 “burnWei가 모든 파괴를 포함한다”는 가정도 수정했다. 새 감사기는 fee-only, fee+other-execution, all-destruction의 대안적 비교를 각각 보고한다. 독립적인 net 계산은 어느 `burnWei` 해석을 고르느냐에 의존하지 않고 다섯 구성요소로 직접 계산한다.

이번 판본은 **otherExecutionBurnWei가 225행 모두 명시적 0**이다. 따라서 이 자료만으로 `burnWei`가 fee-only인지 fee+other인지 구별할 수 없다. 이는 정해진 제공자 범위의 보고값이며, 모든 과거·미래 창에서 비수수료 소멸이 없다는 증거가 아니다. 경제 입력의 `otherExecutionBurnEth` 필수 조건은 계속 필요하다.

전체 양 끝 supply의 차이는 **86,935.806464553815762797 ETH**다. 첫 행의 supply를 첫 bucket 흐름이 반영된 종료 잔액으로 취급하는 관례에 따라 이 차이는 첫 행 흐름을 제외한 **224행** net과 비교했다. 둘의 잔차는 0 wei다. 225행의 전체 net과 직접 비교해 차이를 소멸량으로 오해하지 않는다. 이 산술 일치만으로 provider의 duty·인식 시계 또는 전체 state를 독립 검증했다고 주장하지 않는다.

### 정확한 28일 UTC 경제 입력은 아직 나오지 않았다

요청 창은 **2026-09-29~2026-10-26 UTC**, 필요 slot은 `15317999`~`15519598`, 총 **201,600개**다. 실제 응답의 bucket **211개**가 이 범위를 덮고 내부 slot 누락은 없지만 **양 경계의 bucket 2개가 창 밖까지 걸친다.**

| 걸친 bucket | 실제 UTC 구간 |
|---|---|
| 시작 경계 | 2026-09-28 22:53:11 ~ 2026-09-29 02:04:59 |
| 종료 경계 | 2026-10-26 22:53:11 ~ 2026-10-27 02:04:59 |

따라서 `providerBucketsCoverAllRequiredSlots=true`와 `exactBucketBoundaryMatch=false`가 동시에 성립한다. 제공자가 선택 bucket 모두를 finalized라고 표시했지만, 경계 밖 금액을 시간 비례로 나누거나 epoch 평균을 UTC 합계로 바꾸지 않았다. `providerClaimAggregates`는 빈 객체로 남고, 정확한 경제 지표 수·full snapshot 수·활성화는 모두 0/false다.

남는 조건은 경계를 정확히 맞춘 원자료, duty·실제 처리 시점의 정산, canonical trace/state 검증, 실제 가용 판본, 26개 전체 경제 지표의 정의와 cohort 범위다. 이번 결과는 **공급 식의 누락 수정·실제 형식 차이 처리·원문 정수 산술 재생**까지 완료한 것이다.

### 보존 구분

- 첫 실제 수집/실패: `ccac8d10`, run `40500039083`, `capture-uRYEbx/receipt.json` 및 원문 그대로.
- 수정 코드의 로컬 재생: `supply_accounting_ccac8d10_corrected_replay.json`; 새 CI source와 실행 번호는 후속 실제 검증 결과에 따로 연결.
- 외부 제공자 판본의 무결성과 내부 산술을 확인했으며, 독립 chain 실행·provider 감사·최초 공개·과거 판본을 증명하지 않았다.


### 4.6 교정 후 두 번째 실제 공급 감사 — c73b17b2

두 번째 실제 실행 [40518730718](https://github.com/twoimo/bitcoin-cycle-atlas/actions/runs/40518730718)은 공급 수집과 감사를 완료했다. 실행 소스는 `c73b17b29809961dab7e9337482e22da28789c81`, tree는 `2fe83d8eb6e019fe6229e2627751168e20e19491`이다. `capture-0kqcvW/receipt.json`의 실제 status는 **provider-accounting-audited**이며 `observation.json`도 생성됐다. 첫 ccac8d10 실행의 failed 영수증과 교정 후 로컬 재생은 앞선 별도 기록으로 유지한다.

### 무결성·시각·독립 재계산

실제 수집 완료는 **2026-10-27 23:13:14.608 KST**, 제공자 생성 시각은 **23:11:50 KST**, revision은 `1793110310289`다. 요청·응답·본문 완료·수집·종료 시각의 순서와 제공자 header/body의 revision·생성 시각 일치를 확인했다. 실제 수집 이후 시각의 관측 행은 없다. 최초 공개 시각은 계속 null이다.

| 보존 자료 | bytes | SHA-256 |
|---|---:|---|
| history JSON | 801,491 | `6c32bb06c88ea0af45ee803ce33582ee8eca2382077b422cdf045aea2391847a` |
| observation JSON | 17,650 | `87de15aff4ba4271561131d322a35dfd4337a5a79cf8cdd0f613e97d69231c22` |
| receipt JSON | 23,804 | `a3ea45f7ffc5be492a5e92d5946d832bf4b59e9ec7dc187ffd57ca04574cfcc0` |

방법론 HTML은 125,691 bytes이고 SHA-256 `fd9c3d66c4c8f7112bb44b19a99f8b11a869038b656a7726d6143e5798e73687`로 첫 수집과 같다. 전체 HTML은 실제 실행 artifact에서 확인했고, Git 문서에는 URL·해시와 자체 분석을 남긴다. history의 제공자 digest는 실제 bytes와 일치한다. collector·core·tests·경제 모형·EIP 원문의 다섯 source hash 및 EIP Git blob도 일치한다.

보존 history를 원래 수집 시각·기준일로 다시 실행한 결과 **observation 전체 필드가 정확히 일치**했고, receipt 내부 observation도 별도 observation 파일과 같다. 이어서 감사기와 다른 Python 임의정밀 정수 계산으로 구성 금액·slot 연속성·summary·잔액 차이를 다시 확인했다.

### 두 번째 판본의 실제 수치

실제 225개 30-epoch bucket에서 fee 구성 산술과 net 구성 산술이 각각 **225/225**, 인접 공급 차이가 **224/224** 일치한다. 금액 합은 제공자 summary와 모두 같고 잔차는 0 wei다. other execution burn은 225행 모두 명시적 0이며, 이것을 모든 창의 구조적 0으로 일반화하지 않는다. blob 표시값은 225개 모두 소수로 남았고 가스·blob 표시값은 합산하지 않았다.

| 두 번째 제공자 30일 범위의 합 | ETH |
|---|---:|
| gross issuance | 89,471.007971834 |
| 실행 base-fee burn | 2,006.874146365071169495 |
| blob base-fee burn | 2.784511118424145920 |
| consensus penalties | 150.338756796 |
| other execution burn | 0 |
| net change | **87,311.010557554504684585** |

양 끝 공급량의 차이는 **87,017.459583503902509187 ETH**다. 첫 행이 이미 종료 잔액이므로 첫 행 흐름을 제외한 224행 net과 비교했으며, 구성요소 및 보고 net과의 잔차가 모두 0 wei다. 이는 provider bucket의 종료 잔액 관례 아래의 내부 회계 재생이며 독립 chain 실행은 아니다.

첫 판본의 범위는 **2026-09-27 11:41:11~2026-10-27 11:40:59 UTC**, 두 번째는 **2026-09-27 13:55:35~2026-10-27 13:55:23 UTC**다. 양 경계가 **672 slots, 2시간 14분 24초** 이동했다. 두 net 합의 차이 **20.788269981755743469 ETH**는 서로 다른 이동 창의 차이다. 같은 기간 자료의 개정량이나 예측 개선으로 해석하지 않는다.

### 새 bucket grid에서도 UTC 경계는 남는다

2026-09-29~2026-10-26 UTC 요청 창의 201,600 slots를 211개 bucket이 덮는다. 내부 누락은 없고 제공자는 선택된 bucket 모두를 finalized로 표시하지만, 두 경계 bucket은 창 밖까지 걸친다.

| 두 번째 판본의 경계 bucket | UTC 범위 | 창에 속하는 정확한 부분 |
|---|---|---:|
| `15317376…15318335` | 9월 28일 21:55:35 ~ 9월 29일 01:07:23 | `15317999…15318335`, **337 slots** |
| `15518976…15519935` | 10월 26일 21:55:35 ~ 10월 27일 01:07:23 | `15518976…15519598`, **623 slots** |

완전히 포함된 209개 bucket은 200,640 slots이고 두 경계 부분은 합계 960 slots다. 이 부분별 실제 회계 금액은 아직 제공되지 않았다. 첫 판본의 625/335 부분과 두 번째 판본의 337/623 부분을 혼용하지 않는다.

정확한 경계 집계·처리 시점·canonical state·공개 판본 검증이 남아 있으므로 `providerClaimAggregates={}`, **definitionMatchedModelMetricCount=0**, **eligibleModelSnapshotCount=0**, **modelInputActivated=false**를 유지한다. 실제 감사 성공은 이 조건을 통과했다는 뜻이 아니다.

전체 재생·독립 정수 계산·파일 해시의 검증 결과는 `supply_accounting_c73b17b2_verification.json`에 기록했다. 원문 bytes와 실행 식별은 맞지만, 독립 provider 감사·canonical chain 검증·역사적 가용성을 증명하지는 않는다.


### 4.7 경계 자료를 확보하기 위한 실제 다음 경로

[공개 API 명세](https://ethsupply.fyi/methodology/)에서 history 요청에 문서화된 것은 `range`와 `afterRevision`이다. `live`, `24h`, `7d`, `30d`, `retained` 범위를 제공하며, live의 revision 이후 갱신과 현재 정적 문서를 구분한다. 응답의 `intervalSlots`·`fromSlot`·`toSlot`을 요청용 인자로 취급하지 않았다. 임의의 과거 slot 경계나 해상도를 지정하는 공개 요청은 문서에서 확인하지 못했다.

현재 28일 전체는 201,600 slots다. 8MiB를 한 응답의 읽은 JSON 본문 한도로 쓰면 slot당 약 41.61 bytes에 불과하다. slot·timestamp·회계 구성 다섯 금액만 넣고 모든 금액을 0으로 축약한 자체 계산도 배열 기준 32,457,601 bytes다. 45초 내 전송 시간은 측정하지 않았지만, 현행 본문 용량으로 전체 slot 자료를 한 번에 받는 설계는 맞지 않는다.

더 작은 다음 자료는 현재 판본의 내부 209개 완전 bucket에 더할 **양쪽 경계 부분의 정확한 합**이다. 첫 판본의 경계는 625/335 slots, 두 번째 판본은 337/623 slots이며 둘 다 합계 960 slots다. 이는 요청 창의 같은 날짜라도 제공자의 이동 집계 격자가 달라질 수 있음을 보여 준다. 제공자가 지원하는 정확한 UTC 집계·과거 경계 export 또는 동일 기준의 별도 indexer가 필요하다. API에 없는 인자를 추측하거나 집계 평균으로 비례 배분하지 않는다. 경계가 해결돼도 정규 상태·회계 인식 시각·역사적 가용성은 따로 검증해야 한다.

## 5. 실제 경제 판본 원장과 재수집

### 5.1 불변으로 연결한 정보

새 `ethereum-economic-vintages` 원장은 관측 기간·출처의 필드·값 판본과 수집 증거를 분리한다. record는 원문·영수증·실제 시계·검증 소스·재생 결과를 해시로 연결한다. 같은 수집을 다시 처리하면 원래 record ID와 `recordedAt`을 유지한다. 나중에 같은 값을 다시 받은 경우에는 수집 증거만 늘고 값 판본을 중복 표본으로 만들지 않는다. 같은 기간의 값이 개정되면 이전 값을 남긴다.

cutoff 선택은 그때까지 실제 수집된 판본만 사용한다. 같은 시각에 서로 다른 값이 있는 경우에는 정렬 순서로 승자를 만들지 않고 `ambiguous`로 남긴다. 공개 시각을 알 수 없으면 `publishedAt=null`이다. provider 계산 완료 시각이나 Git commit 날짜는 실제 수집 시각을 대체하지 않는다.

이번에 보존한 발행·수수료·공급·거래 수·gas·PoW의 숫자 표현은 기존 inspector가 계산한 JavaScript 수치이며, 이 원장은 그 표현의 판본을 보존한다. 같은 부동소수점 표현으로 반올림되는 서로 다른 원문까지 정확한 십진 값이 같다고 주장하지 않는다. 원문과 영수증의 개정은 별도의 해시로 남는다.

### 5.2 첫 실제 실행과 보존

| 출처 | 원래 수집 완료 UTC | 한국 시각 | 보존한 부분 관측 |
|---|---|---|---|
| Coin Metrics | 2026-10-27 11:58:29.283 | 20:58:29.283 | gross issuance, total fees, 공급, L1 거래 수 |
| throughput | 2026-10-27 11:58:30.231 | 20:58:30.231 | rate에서 환산한 L1 gas 보조 관측 |
| PoW zero | 2026-10-27 11:59:12.455 | 20:59:12.455 | Merge 이후 PoW 발행 0 부분 관측 |

원장 기록 시각은 **2026-10-27 21:00:24.122 KST**다. 원래 수집 시각보다 뒤의 정규화·기록 시각이다. 3개 record의 원래 bytes와 ID, 408-byte index를 그대로 보존했다.

- Coin Metrics: `a611f74e15639738555667230dfb03b88651b161108ee814d46c887bd68297cf`
- throughput: `d9aad00abd60709283675c21083929b04776e852c1ec0b9d9c1816c63a5fe65c`
- PoW: `7dec5b646d51af0051b4ad6f3e62e3d671300278da04853312756746d4d4fd6f`

최초 ledger ID는 `ba582489fef69ecfc6d8ab13d0b24f840d8184a842052779a9dc5ab2d2aed3e0`, index SHA-256은 `2542d3505261495374509bf24eb8fd474306a91a504d5e348cff621e37c72fb9`다. 전체 검증 입력은 60개·3,584,038 bytes다. 46개 새 원문과 14개 기존 동일 원문 참조를 이용했고, seed 전체 새 파일은 51개·1,158,363 bytes다. 재배치한 `files.json`에서는 `.location`만 변경했으며 논리 경로·원문 SHA·bytes·순서와 기타 메타데이터는 유지했다.

실제 저장된 seed를 임시 작업 공간에 재구성하고 원문 inspector를 실행하는 별도 검증에서 **3/3 재생·네트워크 0·새 기록 0·기존 3 재사용**을 확인했다. 원문 hash만 맞추고 계산값을 고치는 변조도 허용하지 않는다. 파일 범위·symbolic link·중복 locator·사용되지 않은 locator와 잘못된 원장 index를 검사한다. 이전 기록 누락을 판별하려면 신뢰할 이전 index 또는 Git 이력이 필요하다는 경계도 명시했다.

오래됨은 cutoff의 마지막 완료 UTC일에서 관측 종료일까지의 차이로 계산한다. 최신 완료일은 0일이다. 0·7·8일 경계 테스트가 있어 하루 잘못 계산하는 문제를 막는다. 최초 판본에서 Coin Metrics 4개 필드는 **156일** 오래됐고 나머지 두 부분 관측은 0일이다. 선택 가능한 6개 필드·기간이 있다는 것과 완전한 26개 입력을 갖췄다는 것은 구분한다.

### 5.3 두 번째 실제 실행

검증 소스 c73b17b2의 실제 재수집은 원래 3개 record에 새 수집 기록 3개를 추가해 **총 6개**가 됐다. 고유 값 판본은 **6개 그대로**이며, 원래 여섯 `dataVersionId`와 모두 일치한다. 새 record의 정규화 시각은 **2026-10-27 23:13:12.962 KST**다. 새로운 수집 완료 시각은 Coin Metrics 23:11:59.891, throughput 23:12:00.527, PoW 23:12:34.275 KST다.

후속 CLI의 `reusedCaptureCount=0`은 현재 입력으로 다시 받은 세 수집이 모두 새 영수증이라는 뜻이다. seed의 기존 세 record를 삭제했다는 뜻이 아니다. 실제 별도 replay에서는 **새 0 / 기존 6 재사용 / 원문 재생 6/6 / 네트워크 0**이다. 검증한 논리 입력은 **112개 / 7,180,249 bytes**이며 일부 원문은 여러 관측의 근거로 재사용된다.

최종 ledger ID는 `44dc775049cfc5c5184b33641c5123bf2f1a6d46384fc852ca258deb0c7b61ad`다. 624-byte index SHA-256은 `f7179856d979ecf0a59d0d488691d064cc481bea305db9d1c1e0f81b8020830a`다. [최종 원장](eth-candidate-evidence/20261027-vintages-calibration/final-run/economic-vintage-ledger/index.json)은 여섯 record와 연결 원문을 보존한다. 새 docs 파일 58개·1,397,172 bytes에 50개 새 고유 raw를 포함하고, 62개 기존 입력 참조를 재사용했다. 실행용 bootstrap은 이미 검증한 최초 3-record 상태를 유지한다.

최초 수집 이후의 자료가 이전 cutoff로 새어 들어가지 않는지도 실제 값으로 검사했다. **23:11:59.890 KST**에는 원래 세 record의 근거만 선택되고, 마지막 새 수집이 완료된 **23:12:34.275 KST**에는 후속 세 record의 근거가 선택된다. 두 경우 모두 6개 부분 필드, 오래된 필드 4개, 충돌 0개이며 완전 snapshot 0과 모형 비활성 상태를 유지한다. bootstrap의 51개 파일과 원래 record·`recordedAt`은 byte 단위로 같았다.

이 재수집은 같은 날짜의 같은 창을 다른 획득 시각에 받은 결과다. 반복 수집 횟수·파일 수·값 판본 수를 독립적인 경제 표본 수나 독립 시장 환경 수로 합산하지 않는다. 이번 실제 획득과 향후 보존된 획득부터 시점별 사용 가능성을 검증할 수 있지만, 2023~2025년에 이 판본을 보유했다는 증거를 소급 생성하지 않는다.

## 6. 보정 오차와 이후 평가 오차를 분리한 결과

새 감사 정책 `eth-chronological-calibration-audit-1`은 기존 12개 최소 보정 표본을 유지한다. 같은 후보·기간에서 시간순으로 겹치지 않는 첫 12개 예측 창을 고정하고, 그 오차의 순서통계량으로 반경을 한 번만 정한다. 마지막 보정 타깃보다 **엄격하게 늦은 원점**만 평가하며, 이후 평가 오차로 반경을 다시 맞추지 않는다. 모형 매개변수 자체는 각 원점까지 완료된 가격으로 기존 방식대로 다시 추정한다. 먼저 평가한 타깃의 완료 가격도 후속 원점의 추정에는 들어갈 수 있다. **고정한 것은 보정 반경이며, 모든 평가 구간에 앞서 예측 모형 전체를 한 번만 적합한 실험은 아니다.**

선택 집합은 타깃 성숙 시각과 원래 예측 가용성으로 먼저 정한다. 선택된 정답·대조 구간이 빠지거나 계산 범위를 벗어나면 해당 자리를 유지하고 `incomplete`로 남긴다. 다른 쉬운 관측으로 대체하거나 해당 자리를 빼서 평균을 개선하지 않는다. 후보·버전·기간을 섞지 않았고, 기존 발행과 같은 seed **20261027 / 256경로**를 고정했다.

**현재 확보 자료에서 pooled 30일만 12개 보정 표본과 그 뒤 8개 평가 표본을 확보했다.** 마지막 보정 원점은 2025-06-11, 타깃은 2025-07-11 UTC 일봉이다. 이후 평가 원점은 2025-08-06부터다. 보정 오차의 순서는 `ceil((12+1)×0.8)=11`이며, 절대 로그오차 반경은 **0.3195478811608492**다. 새 구간은 원래 pooled 중앙값에 `exp(±반경)`을 곱한다. 중앙값이나 원래 q10/q90 경로를 수정한 결과가 아니다.

| 같은 8개 타깃에서 비교 | 실제 포함 | 평균 로그 폭 | 평균 로그 구간점수 |
|---|---:|---:|---:|
| 기존 pooled q10/q90 | 6/8 (75.0%) | 0.442879249 | 0.840945240 |
| 12개 과거 오차로 고정한 반경 | 7/8 (87.5%) | 0.639095762 | 0.709765001 |
| 원점별 과거 변동성을 고정한 Gaussian 대조 | 6/8 (75.0%) | 0.508075986 | 0.790582801 |

Gaussian은 각 원점의 직전 180개 일별 로그수익률에서 추정한 표본 표준편차를 해당 미래 30일에 고정하고 명시적 로그 드리프트를 0으로 놓는 대조다. 모든 원점에 하나의 동일 변동성을 사용한 것은 아니다.

구간점수는 폭과 구간 밖 오차를 함께 벌점으로 계산하며 작을수록 좋다. 고정 반경은 원래 pooled보다 점수가 **15.5991%**, Gaussian보다 **10.2226%** 작았다. 평균 로그 폭은 원래 pooled보다 **44.3047%** 넓어졌다. 8개 중 포함 여부가 달라진 것은 2026-05-13 원점의 2026-06-12 타깃 한 개이며, 2026-01-21 원점의 하락 타깃은 넓힌 구간에서도 벗어났다. 이때 큰 누락 벌점이 줄어든 효과와 다른 여섯 타깃에서 넓어진 폭의 비용을 모두 점수에 남겼다.

### 평가한 8개 원점과 실제 정답

아래 날짜는 UTC 일봉 날짜이며 실제 관측 종료는 해당 타깃 다음날 09:00 KST다. USD와 점수는 표에서만 반올림했다. 전체 JSON에는 세 구간의 정확한 상·하한, 중앙값, 정답과 점수를 모두 보존한다.

| 예측 원점 | 30일 타깃 | 실제 ETH/USD | 원래 포함 | 고정 반경 포함 | Gaussian 포함 | 원래 점수 | 고정 반경 점수 | Gaussian 점수 |
|---|---|---:|---:|---:|---:|---:|---:|---:|
| 2025-08-06 | 2025-09-05 | 4,307.65 | 예 | 예 | 예 | 0.452246 | 0.639096 | 0.585852 |
| 2025-10-01 | 2025-10-31 | 3,845.79 | 예 | 예 | 예 | 0.451908 | 0.639096 | 0.554390 |
| 2025-11-26 | 2025-12-26 | 2,925.43 | 예 | 예 | 예 | 0.472902 | 0.639096 | 0.509549 |
| 2026-01-21 | 2026-02-20 | 1,968.13 | 아니오 | 아니오 | 아니오 | 2.462349 | 1.204450 | 2.156645 |
| 2026-03-18 | 2026-04-17 | 2,419.81 | 예 | 예 | 예 | 0.490159 | 0.639096 | 0.542160 |
| 2026-05-13 | 2026-06-12 | 1,665.52 | 아니오 | 예 | 아니오 | 1.529490 | 0.639096 | 1.089360 |
| 2026-07-08 | 2026-08-07 | 1,913.15 | 예 | 예 | 예 | 0.419421 | 0.639096 | 0.487398 |
| 2026-09-02 | 2026-10-02 | 2,668.13 | 예 | 예 | 예 | 0.449087 | 0.639096 | 0.399308 |

| 후보 | 기간 | 선택된 보정 창 | 이후 평가 창 | 판정 |
|---|---:|---:|---:|---|
| adaptive | 30일 | 9 | 0 | 최소 12개 미달 |
| adaptive | 90일 | 4 | 0 | 최소 12개 미달 |
| adaptive | 180일 | 2 | 0 | 최소 12개 미달 |
| pooled | 30일 | 12개 고정 | 8 | 해당 8개에서 평가 완료 |
| pooled | 90일 | 10 | 0 | 최소 12개 미달 |
| pooled | 180일 | 5 | 0 | 최소 12개 미달 |
| warm-start | 30일 | 10 | 0 | 최소 12개 미달 |
| warm-start | 90일 | 5 | 0 | 최소 12개 미달 |
| warm-start | 180일 | 2 | 0 | 최소 12개 미달 |

9개 후보·기간 조합을 모두 그대로 제시한다. 계산 가능 여부를 확인한 결과 pooled 30일만 남은 것이며, 9개의 평가 점수를 비교해 최고 조합을 골랐다는 뜻이 아니다. pooled 30일 전체 가용 비중첩 창은 20개이며 앞의 12개와 뒤의 8개로 나뉜다. 90·180일 자료나 다른 후보의 오차를 가져와 부족한 칸을 채우지 않았다. raw와 보정 구간의 점예측 절대 로그오차는 같은 **0.16047358284113333**다. 이번 개선은 해당 평가 집합에서의 구간점수에 한정된다.

### 이 결과가 아직 해소하지 않는 조건

이미 살펴본 현재 판본의 개발 자료에 새 정책을 적용한 결과다. **손대지 않은 과거 holdout, 당시 실제 공개 판본, 전향 성과 또는 독립 시장 표본을 확보한 것은 아니다.** 평가 8개에서 한 관측은 포함률 **12.5%포인트**에 해당한다. 7/8을 미래의 87.5% 확률로 사용하지 않으며, 독립 Bernoulli 표본이라는 근거가 없어 이항 신뢰구간이나 유의확률도 내지 않았다. 시계열 의존성과 시장 환경 변화가 있는 ETH에서 순서통계량만으로 명목 80% 포함률을 보장하지 않는다.

향후 실제 검증 계약 `eth-future-frozen-calibration-contract-1`도 고정했다. 동일 `modelKey`, `model.version`, 원래 가격 모형의 `model.sourceHash`, `options.seed`, `options.sampleCount`, 기간에 속한 실제 전향 발행본과 실제 수집된 성숙 정답만 사용한다. 첫 12개 비중첩 오차와 원문 record/observation ID를 고정한 뒤 별도 버전의 새 보정 발행본을 만들어야 한다. 새 보정 wrapper의 소스 해시와 기존 원가격 모형의 해시는 구분한다. 기존 세 발행본을 고치거나 회고 오차를 전향 정답으로 바꾸지 않으며, **실제 보정 발행본 0 / 전향 보정 평가 0**을 유지한다.

### 재생·경계 검증과 소스

추가 테스트 **15개**는 미래 정답 주입, 같은 경계 시각, 선택된 누락 정답·대조, 동일 seed와 후보 버전, 원본값 재생, 보고서 변조, 동률·0 오차, 불가능한 순위, 지수 overflow/underflow를 검사했다. 선택된 예측 **67개**를 **43개 후보·원점** 적합에서 원가격 자료로 다시 생성했고, 중앙값·상하한·정답을 확인했다. Gaussian은 고유 원점 **24개**에서 다시 적합했다.

구현: `scripts/ethereum-independent-calibration-core.mjs`, `scripts/evaluate-ethereum-independent-calibration.mjs`, `tests/ethereum-independent-calibration.test.mjs`. 실행 출력: `build/ethereum-independent-calibration.json`. 기존 가격 모형·발행 원장 파일은 수정하지 않았다.

실제 [ETH 실행 40500039083](https://github.com/twoimo/bitcoin-cycle-atlas/actions/runs/40500039083)의 소스는 **ccac8d10dfdc76f618d906d3c3fe4a4d69d7d173**, tree는 **ea6fd758831ce3bea8aa518fc1d009478f409529**다. 구간 보정 보고서는 **2026-10-27 21:00:56.546 KST**에 생성됐으며 해당 실행의 계산 시간은 **514.39573ms**다. 물리 모바일 성능 측정으로 해석하지 않는다.

실제 artifact의 `ethereum-independent-calibration.json`은 **99,604 bytes**, SHA-256은 `d25ab044c4579a7c7d9210df817b1a6134fca897d0f388d0d60042b6509a8832`다. 전체 결과·정책·미래 계약·67개 재생 결과는 로컬 사전 계산과 정확히 같았고 실행 시각·환경·시간만 별도 값으로 기록했다. 원점 선택과 순서통계량 및 8개 개별 구간점수도 감사 모듈을 호출하지 않는 별도 Python 계산으로 대조했다. 각 점수 차이는 1e-13 이내다.

보고서가 참조한 sourceFiles 9개, ETH 가격 원문과 실제 comparison/warm-start 입력의 SHA-256을 모두 대조했다. ETH 가격 원문은 `69a726d87fcea635772a806ac6a00f43880a43d8c66bd88152045dffc209106f`, comparison은 `3f4e8c11a50feebd24e57f755adbc60221399a4363c0acf5c407fae18f49427e`, warm-start는 `d297ed35c0591f3092952ed254ab3d56c6af2bf736d88e7f846cca653ad31e16`다.

실제 artifact의 adaptive·pooled·warm-start 세 발행 record 바이트는 보존 원장과 같았다. 기존 가격 모형 그래프의 14/14/17개 파일 SHA-256, seed **20261027**, 모의 **256경로**, 원래 발행 시각도 그대로다. 보정 감사로 기존 발행본을 재발행하거나 성숙 정답을 추가하지 않았다.


## 7. 26개 경제 입력의 실제 준비 상태

아래는 Coin Metrics·throughput·PoW 세 기존 수집과 원문 재생에 대한 필드별 coverage다. 별도 신규 공급 감사는 28 UTC일 경계·정규 체인·공개 시각을 충족하지 않아 이 표의 적격 입력으로 합치지 않았다. 따라서 공급 감사 원문에 관련 값이 보인다는 이유로 기존 coverage의 `not-observed`를 준비 완료로 바꾸지 않는다.

세 출처 모두 원문 검증과 계산 재생을 완료했다. **관련 부분 관측 6개, 관련 필드 10개, 정확한 정의의 부분 필드 1개, rate 환산 보조 필드 1개, 연결 관측 없는 필드 16개**다. 이 숫자는 서로 겹치는 증거 차원이며 합산하지 않는다. 6개 관측의 공개 시각을 모르고 4개는 오래됐다. 정의와 시각을 동시에 충족하는 지표는 0개, full snapshot도 0개다.

| 필드 | 현재 coverage | 검사하는 정의·증거 요구의 식별자 |
|---|---|---|
| `l1GasUsed` | rate 환산 보조 관측 | `rate-is-not-exact-gas`, `canonical-range-unverified` |
| `l2Transactions` | 정의·범위 불일치 | `l2-universe-not-fixed`, `filtered-transaction-scope` |
| `blobGasUsed` | 연결된 적격 관측 없음 | `blob-quantity-not-captured`, `fork-schedule-required` |
| `executionFeesEth` | 정의·범위 불일치 | `total-fees-include-blobs`, `execution-blob-split-missing` |
| `executionBurnEth` | 정의·범위 불일치 | `base-priority-split-missing` |
| `otherExecutionBurnEth` | 연결된 적격 관측 없음 | `non-fee-destruction-unmeasured`, `fork-aware-trace-state-reconciliation` |
| `blobFeesEth` | 정의·범위 불일치 | `blob-fee-split-missing`, `noninteger-blob-formula` |
| `blobBurnEth` | 정의·범위 불일치 | `blob-fee-split-missing`, `noninteger-blob-formula` |
| `consensusNetIssuanceEth` | 정의·범위 불일치 | `gross-versus-net`, `epoch-mean-not-utc-sum`, `historical-theoretical-fill` |
| `executionPowIssuanceEth` | 정의 일치 부분 관측 | `protocol-zero-receipt-required` |
| `supplyEth` | 정의·범위 불일치 | `execution-consensus-supply-unreconciled` |
| `stakedEth` | 연결된 적격 관측 없음 | `active-balance-is-subset`, `stock-boundary-mismatch` |
| `exitQueueEth` | 연결된 적격 관측 없음 | `pending-exit-stock-unmeasured` |
| `l2UserFeesEth` | 연결된 적격 관측 없음 | `l2-universe-not-fixed`, `l2-fee-component-reconciliation`, `conversion-vintage-required` |
| `l2SettlementFeesEth` | 정의·범위 불일치 | `l2-universe-not-fixed`, `settlement-already-in-l1-fees`, `derived-view-zero-fill` |
| `stakingConsensusRewardsEth` | 연결된 적격 관측 없음 | `staking-cohort-unfixed`, `net-not-gross-rewards`, `ideal-not-earned` |
| `stakingConsensusPenaltiesEth` | 연결된 적격 관측 없음 | `staking-cohort-unfixed`, `penalty-slashing-components` |
| `stakingPriorityFeesEth` | 연결된 적격 관측 없음 | `staking-cohort-unfixed`, `priority-mev-disjointness` |
| `stakingMevExcludingPriorityEth` | 연결된 적격 관측 없음 | `staking-cohort-unfixed`, `priority-mev-disjointness` |
| `stakingServiceFeesEth` | 연결된 적격 관측 없음 | `staking-cohort-unfixed`, `actual-service-charges-unmeasured` |
| `stakingOperatingCostsEth` | 연결된 적격 관측 없음 | `staking-cohort-unfixed`, `actual-operating-costs-unmeasured`, `conversion-vintage-required` |
| `averageRewardEligibleStakeEth` | 연결된 적격 관측 없음 | `staking-cohort-unfixed`, `time-weighted-principal-unmeasured` |
| `completedExitCount` | 연결된 적격 관측 없음 | `completed-exit-universe-unfixed` |
| `completedExitMedianWaitDays` | 연결된 적격 관측 없음 | `completed-exit-universe-unfixed`, `request-to-availability-events` |
| `uniqueNativeCollateralEth` | 연결된 적격 관측 없음 | `collateral-universe-variable`, `recursive-underlying-deduplication`, `conversion-vintage-required` |
| `uniqueStakingClaimCollateralEth` | 연결된 적격 관측 없음 | `collateral-universe-variable`, `recursive-underlying-deduplication`, `native-claim-overlap` |


표의 요구 식별자는 검사 계약을 나타내며 전부 미충족이라는 뜻은 아니다. PoW 부분 관측의 프로토콜 영수증과 원문 재생은 충족했다. 그 관측도 공개 시각 미확인·전체 입력 부족을 해소하지 않는다.

필드별 단위·정의·출처 URL·원문 연결·시계 태그·다음 수집 요구는 [원본 coverage JSON](eth-candidate-evidence/20261027-vintages-calibration/first-run/ethereum-economic-evidence-coverage.json)에 있다. 새 공급 원문의 내부 정합성은 다음의 네 가지 추가 과제를 해소하지 않는다.

1. **창과 계층이 같은 공급 정산.** UTC 시작·끝의 실행/합의 상태, 입출금 중복 제거, base/blob/기타 파괴와 합의 순발행을 동일 범위로 정산해야 한다. 30-epoch 평균·묶음을 UTC 일별 정확값으로 비례 배분하지 않는다.
2. **같은 스테이킹 집단의 실제 순보상.** 보상·벌금·priority fee·MEV·서비스 비용·운영비와 시간가중 원금을 동일 validator/investor 집합으로 연결해야 한다. 공개 네트워크 APR과 임의 비용률을 합쳐 실제 순보상이라고 하지 않는다.
3. **고정 L2 집합과 고유 담보.** L2 사용자 수수료·정산 수수료의 범위와 환산 판본을 고정하고, native ETH·WETH·LST·LRT·bridge·대출 영수증이 나타내는 동일 기초 ETH를 중복 제거해야 한다. 합계 TVL을 독립 담보 수요로 그대로 넣지 않는다.
4. **실제 시점별 가용 자료.** 현재 재구성한 역사 데이터에는 과거 개정과 공개 지연이 섞일 수 있다. 수집 시각과 판본을 남기는 장치가 있어도 과거 시점의 가용성이 자동 증명되지는 않는다.

## 8. 성숙 정답·표본·실제 발행 조건

### 8.1 기존 발행본은 그대로다

이번 구현·보존에서 adaptive·pooled·warm-start의 모형 파일과 최초 발행 record bytes를 확인했다. 모형 그래프는 각각 **14 / 14 / 17개 파일**이며 기존 그래프 해시를 유지했다. 세 발행본의 seed는 20261027, 경로 수는 256이다. 실제 최초 발행 시각은 adaptive/pooled **2026-10-27 16:44:13.396 KST**, warm-start **18:57:51.931 KST**다.

| 발행본 | 불변 record ID |
|---|---|
| adaptive | `563d087f19a5062981714ed6fee1f96dd5afe77a87a4c435979b000451189a9b` |
| pooled | `f1f0bf98496c1d6e9339ae9410a51c904571524d3ade88fc935cf6f58df3fed1` |
| warm-start | `d2659722c147909a9cbeeea4980c63b52f36f9c23c315cd2ef1e10984b8d5f72` |

첫 후속 실제 수집은 **새 발행 0 / 기존 3 재사용**, 별도 원문 재실행도 **네트워크 0 / 새 발행 0 / 기존 3 재사용**이다. 각 731개 일별 예측점이 원래 기록과 일치한다. 후보 원장은 고유 원점 1개, pending 9 / scored 0이다. 기존 ETH·BMNR·MSTR 자산 원장 9개의 27 pending과 합쳐 고유 표본을 부풀리지 않는다.

두 번째 실제 발행 시도와 오프라인 replay에서도 **새 0 / 기존 3 재사용**, 고유 원점 1, pending 9 / scored 0을 확인했다. 실제 artifact의 세 record bytes와 모형 그래프는 첫 실행 및 원래 커밋된 발행본과 같다. 별도 [원문 대조 결과](eth-candidate-evidence/20261027-vintages-calibration/final-run/calibration-and-frozen-record-verification.json)에 731점·원장 ID·원래 시각을 연결했다.

| horizon | 목표 UTC 일봉 날짜 | 해당 일봉 종료 한국 시각 |
|---:|---|---|
| 30일 | 2026-11-25 | 2026-11-26 09:00 KST |
| 90일 | 2027-01-24 | 2027-01-25 09:00 KST |
| 180일 | 2027-04-24 | 2027-04-25 09:00 KST |

이 시각은 관측 창이 끝나는 경계다. 이후 실제 가격 원문을 수집하고 출처·일자·판본을 검증한 뒤에야 성적을 계산한다. 해당 날짜에 좋은 성적이 확정된다는 뜻은 아니다. 이번 작업은 새 예약이나 아직 오지 않은 실제 결과를 생성하지 않는다.

### 8.2 장기 경제 모형의 구조적 표본 제약

현행 경제 계약은 출금 완료를 포함한 입력과 같은 horizon의 최소 16개 비중첩 성숙 학습 정답을 요구한다. Capella 활성일에 이미 필요한 입력이 모두 있었고 지연도 없었다고 가정한 **낙관적 하한**에서도 90일 모형은 **2027-03-23 09:00 KST**, 180일 모형은 **2031-03-02 09:00 KST**보다 앞서 그 조건을 충족할 수 없다. 현재 archived price 기준의 구조적 최대치는 30/90/180일 **43/14/7개**다. 실제 적격 경제 정답 수는 0개의 완전 snapshot 때문에 별도로 미확보다.

이 날짜는 실제 준비일 약속이 아니다. 실제 출금·완전한 입력·공개와 수집 지연·결측은 더 늦게 만들 수 있고, 비중첩 정답 16개가 16개 독립 시장 국면이라는 뜻도 아니다. 오래된 서로 다른 기간의 표본을 섞거나 minimum을 낮춰 날짜를 앞당기지 않았다. 30일의 구조적 공간이 있다는 사실도 실제 완전 입력이 있다는 증거는 아니다.

## 9. 실제 검증과 보존

| 검사 | 첫 구현 ccac8d10 | 보존·교정 c73b17b2 |
|---|---:|---:|
| 일반 테스트 | 1,599 pass / 0 fail / 0 skip | **1,602 pass / 0 fail / 0 skip** |
| ETH 집중 테스트 | 466 pass | **469 pass** |
| 수치 assertion | 318,010 | **318,010** |
| 표적 negative control | 16/16 | **16/16** |
| Chromium 실제 상호작용 | 35/35, 181 PNG | **35/35, 181 PNG** |
| runtime / 예상 밖 resource 오류 | 0 / 0 | **0 / 0** |
| 의도한 offline 갱신 오류 | 15개 보존·상태별 검증 | **15개 보존·상태별 검증** |
| Hallmark 현재 FAIL / REFLEX | 0 / 0 | **0 / 0** |
| Hallmark integrity 오류 | 0 | **0** |
| Hallmark 현재 WARN | static 36 / render 17 | **static 36 / render 17** |
| 새 공급 감사 | 실제 원문 수집 후 파서 실패 | **실제 새 원문 수집·감사·전체 재생 성공** |

Hallmark는 전체 8경로의 전후 렌더 40장씩을 수행했고, 기존 53개 WARN을 그대로 보존했다. 최종 53개 finding은 첫 실행에서 확인한 원문과 모두 같고 waiver·dismissal은 0이다. 실제 헤드리스 Chromium 범위이며 물리 기기·Safari 검사로 넓혀 말하지 않는다.

최종 일반 CI는 합성 merge `42289dec3a01ccbc6bbec7b6ed987af3eec57fca`, tree `3ac93ed43be1573c2c21799432dc5cd8fab6bd6f`에서 실행됐다. Git 부모는 당시 main `5dd11c99faa1fe4a1a9adf56bc4775d35c9a41e4`와 c73b17b2다. 최종 ETH evidence와 Hallmark의 소스는 c73b17b2/tree 2fe83d8e다. 세 workflow 모두 완료·success를 확인했다.

최종 source-book은 **371 seeds / 512 entries / 355 parts / 63,845,026 bytes**, SHA-256 `1f40c4bdacc84915cbda8d434030a3e88bc37b409b7af05a661258a00d9c582d`다. 64,000,000-byte 자원 한도를 유지했고 unresolved는 0이다. 전체 분할본의 SHA·bytes·완전 재결합을 검사했으며, manifest의 **375개 Git source entry**가 원격 tree의 blob과 모두 일치했다. 최종 ZIP은 **52,699,937 bytes**, SHA-256 `9989bb94dfefd3b602d46478ef137bf9ec8bee6daf5b202c6feb22305f4eb07e`이며 GitHub artifact digest와 같다. 브라우저 PNG 181개의 bytes와 SHA도 모두 검사했다.

최종 보정 보고서는 **99,613 bytes**, SHA-256 `c1accd893000da19c5bc48f4ebc40ec672df43f5de14dd6fa2381b7e03a7d0f1`, 생성 시각 **23:13:34.811 KST**다. 실행 provenance·소요 시간을 제외한 정책·선택 집합·점수·미래 계약은 첫 보고서와 정확히 같다. 67개 예측을 43개 후보·원점 적합으로 재생했고 Gaussian은 고유 24개 원점에서 재계산했다. 보고서 소스 9개와 가격·comparison·warm-start 입력 해시가 맞았다.

첫 source-book은 **307 seeds / 445 entries / 346 parts / 62,137,219 bytes**다. SHA-256은 `160212435cd3686ade2f1c8a6909c388769206f8cc2f7e8f919537012509287c`, unresolved import는 0이다. ZIP 자체도 GitHub artifact digest와 확인했다: **51,272,903 bytes**, SHA-256 `1bf275e1e2ff34b9314e35105c6880b9602bb757393b6bc3d571277efe2e45f1`. 분할본 346개의 hash를 확인하고 원래 source-book으로 완전히 재결합했다.

원래 supply collector가 실패한 첫 영수증, 당시 readiness의 `failed`, 교정 뒤 같은 원문을 로컬에서 다시 계산한 결과, 새 코드의 별도 실제 재수집을 각각 남긴다. 워크플로의 `success`와 개별 경제 자료의 적격 여부를 혼동하지 않는다. 모형 활성화·실증 성과·공개 배포에 대한 별도 권한을 GitHub Actions 통과로 대체하지 않는다.

source-book의 일반 생성기가 쓴 과거 `externalReview.status=pending`은 원본 metadata다. 현재 작업 정책은 Gemini opposition과 follow-up reverse 모두 **omitted-by-user**다. 보존 원본을 고쳐 검토를 완료한 것처럼 보이지 않는다.

## 10. 남은 조건의 판정 기준

| 조건 | 이번에 확보한 것 | 아직 있어야 하는 것 |
|---|---|---|
| 공급 회계 정의 | 26번째 입력과 정확한 구성요소 식, 실데이터 파서 교정 | 같은 UTC 범위의 정규 상태·trace 검증과 독립 정산 |
| 경제 판본 | 실제 수집 시계·원문·불변 ID·재생·cutoff 선택 | 각 역사 원점 당시에 실제로 가용했던 완전한 입력 |
| 전체 경제 입력 | 필드별 부족 원인과 출처 연결 | 동일 창의 정의 적격 26개 입력과 충분한 유효 snapshot |
| 구간 보정 | 보정 12개와 이후 평가 8개 분리, 정확한 점수 재생 | 손대지 않은 평가 자료와 충분한 실제 전향 보정 성적 |
| 장기 표본 | 30/90/180일 분리 및 구조적 시간 경계 | 같은 기간의 성숙 정답과 여러 시장 환경 |
| 실제 후보 성과 | 원래 발행 3개·예측점·시각 보존 | 아직 도착하지 않은 9개 타깃의 실제 수집·평가 |
| 운영 승격 | 연구 브랜치 구현·검증·증거 | 실증 조건 충족과 별도 릴리스 승인 |

관련 이전 결과: [공통 원점·다중 seed·실제 warm-start 발행](ETH_COMMON_COHORT_AND_ISSUANCE_20261027.md), [초기 상태·단순 구간 대조](ETH_INITIALIZATION_AND_CONTROLS_20261027.md), [전체 남은 조건 이력](ETH_REMAINING_CONDITIONS.md). 이번 결과를 더해 기존 연구 기록을 보존한다.
