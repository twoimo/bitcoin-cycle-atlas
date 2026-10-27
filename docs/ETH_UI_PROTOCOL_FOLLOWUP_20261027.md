# ETH 후속: 실제 화면 상태와 경제 관측 — 2026-10-27

## 범위와 실행 전 계약

기준은 PR #39의 c922dbe4abb4f45629ee189c0efd2979018c4db9이다. 이 절은 코드 변경의 의도와 검증 범위이며, 새 코드의 실제 실행 결과가 아니다. 기존 adaptive/pooled 수학 정책·가격 입력·기본값·불변 발행 원장은 변경하지 않는다. Gemini 반대 검토와 후속 역검토는 사용자 지시에 따라 omitted-by-user다.

## 실제 스크롤 소유권

이전 Hallmark 6 FAIL / 3 REFLEX 원문은 [이전 증거](eth-candidate-evidence/20261027-pooled/hallmark-findings.json)에 보존한다.

- 자산 비교표의 수직 고정은 thead가 담당하고, 이름 헤더와 셀은 수평 고정을 담당한다. 두 축이 동시에 끝에 있을 때 교차 셀·마지막 판단의 실제 위치와 가림 여부를 검증한다.
- 열린 indicator dialog, 활성 compact stack, 현재 표시된 evidence/data 표의 공통 sticky 동작을 한 규칙으로 관리한다. 숨겨진 페이지와 닫힌 dialog에는 고정 위치를 부여하지 않는다.
- viewport가 이미 담당하는 sidebar의 오래된 mobile sticky 선언을 제거한다.
- analysis-window-controls는 실제 분석 select 입력이다. analysis-parameters로 의미를 정리하고 role=group과 분석 조건 이름을 부여한다. 장식용 브라우저 창을 없앴다는 시각적 변경으로 과장하지 않는다.
- 출처 링크는 짧은 이름으로 표시하되 세 href와 보이는 전체 교재 제목·설명을 유지한다. 320/375px에서 실제 열린 문단을 검증한다.
- Hallmark 원본 검사기·정책·severity·waiver는 변경하지 않는다.

## BTC 일별 갱신 안내

기존 quiet 갱신 실패는 숨겨진 메뉴 버튼 title에만 있었다. 이제 main의 첫 자식에 실제 상태와 관측일, 재시도 버튼을 표시한다. 한 primary toolbar, details의 3열 배치, 내부 스크롤, main.inert의 소유권은 유지한다. data 독립 페이지 및 ETH root에 BTC 상태를 노출하지 않는다.

1. idle: 실제 요청 전에는 오류를 만들어 표시하지 않는다.
2. refreshing: 기존 관측일을 표시하고 재시도 버튼을 잠근다.
3. failed: 관측일을 유지한 실패 안내와 활성 재시도 버튼을 계속 표시한다.
4. checked: 요청에 성공해도 최신 완료 UTC 날짜보다 이전 자료면 제공 지연으로 남긴다.
5. published: 바뀐 최신 완료 관측을 수신한 경우만 별도 배포 자료 수신으로 설명한다. 같은/이전 archive의 재조회 성공은 실패를 지우지 않는다.

보이는 문장과 별도로 항상 존재하는 단일 role=status 영역을 사용해 성공 시 경고가 사라져도 알림 내용을 남긴다. 동일 state/cutoff를 다시 그릴 때 live text를 재할당하지 않고, 기존 toast에 같은 결과를 중복 전달하지 않는다. 화면에서 재시도 버튼을 숨길 때 그 버튼에 있던 포커스만 main으로 복원한다.

notice는 필요한 높이만 차지한다. 실제 측정 높이를 모바일 고정 메뉴에 연결하며 짧은 reader 전체 화면 규칙을 보존한다. legacy의 문서 스크롤과 data의 full-height 표 계산은 유지한다.

native 검증은 원본 network failure를 보존하고 정확한 URL·method·UTC date·frame/loader를 계속 대조한다. 새 검증은 실패 안내의 실제 가시성·관측일·44px 재시도·단일 live owner, native Enter 재시도 상태 전이를 추가한다. preview는 child viewport 가시성과 parent 스크롤 도달을 구분한다.

## 경제 관측의 다음 경계

공개 RPC와 EIP-3675/4399의 원문을 대조해 post-Merge PoW 발행 0이라는 부분 필드 수집 경로를 조사했다. 전체 ETH 순발행 0이라는 뜻은 아니다. 실제 canonical 경계·전환·finalized anchor·원문 bytes가 확인되기 전에는 관측값을 만들지 않는다. 이 부분 필드의 정의 확인과 25개 입력 전체/PIT 적격성은 별개다.

이 수집기의 구현·실행 여부와 결과는 후속 절에서 실제 근거를 확인한 뒤 기록한다. 기존 Coin Metrics 0/25, throughput 보조 관측, full snapshot 0, 경제 모형 비활성화 상태를 임의로 바꾸지 않는다.

## 실제 실행 기록

### 첫 UI 실행: 25e4d494566d1b8b8b72a3ae5d00d32d14d57fec

- 일반 CI [40456290853](https://github.com/twoimo/bitcoin-cycle-atlas/actions/runs/40456290853): 1,410 tests 중 1,406 pass / 4 fail. app-workspace-url의 순수 상태 추출 범위에 새 화면 controller 초기화가 포함되어 ReferenceError가 발생했다. 추출 범위 밖으로 controller 초기화를 이동하며 기존 URL 상태 assertion은 유지한다.
- 후보 근거 [40456290859](https://github.com/twoimo/bitcoin-cycle-atlas/actions/runs/40456290859): 집중 테스트·기존 수학 결과·원장 보존 단계 성공. native 35 cases 중 30 pass / 5 fail. 모바일 BTC/preview의 새 공지 너비와 native Enter 재시도 입력이 원인이다. 실패 후 sourcebook 단계는 skipped다.
- 모바일 실패 PNG는 공지 재시도 버튼이 화면 밖으로 밀리는 실제 제품 문제를 보여 준다. main grid에 minmax(0,1fr) 열을 부여하고 section min-width:0로 고친다.
- 데스크톱 retry 검사에서는 helper가 Enter keyDown/up에 문자 이벤트를 전달하지 않았다. CDP keyDown에 Enter text를 포함하고 같은 실제 요청·상태 전이 검사를 재실행한다. 앱의 click handler를 우회하지 않는다.
- Hallmark [40456290879](https://github.com/twoimo/bitcoin-cycle-atlas/actions/runs/40456290879): static **0 FAIL / 0 REFLEX / 36 WARN**, render **0 FAIL / 0 REFLEX / 17 WARN**, integrity errors 0. WARN 및 기존 기록상 content-delta 경고는 그대로 남긴다. 전체 무경고 또는 모든 UI 검증 통과로 해석하지 않는다.

첫 실행 원문은 [browser receipt](eth-candidate-evidence/20261027-ui-protocol/first-browser-receipt.json)와 [Hallmark findings](eth-candidate-evidence/20261027-ui-protocol/first-hallmark-records.json)에 보존한다. 후속 코드의 실제 결과는 별도 기록한다.

## PoW 부분 관측 수집기 계약

새 collector는 mainnet chain ID, 2022년 전환의 인접 블록, 공개 provider가 finalized라고 반환한 anchor, 정확한 28개 완료 UTC 날짜의 양 끝 인접 블록을 대조한다. 각 경계와 finalized 높이를 다시 조회하여 capture 도중 identity 변경을 검사한다. 전체 header chain 또는 독립 consensus 검증을 했다고 주장하지 않는다.

EIP-3675, EIP-4399, consensus mainnet config는 고정 commit의 실제 bytes에 대해 Git blob SHA-1을 확인하고 SHA-256과 원문을 보존한다. TTD 필드가 있으면 임계값·덧셈을 검사하며 누락은 unavailable-rpc-fields로 기록한다. mixHash는 RANDAO 의미가 있으므로 0을 요구하지 않는다.

핵심 RPC 읽기는 최대 61회, transport RPC 한도는 64회다. 정상 capture는 고정 원문 3회와 core 읽기 최대 61회다. 500ms 간격, 요청 10초, 전체 120초, 응답 2MiB/누적 body 16MiB, 재시도 0, redirect 금지다. 완료된 응답 원문만 전체 SHA-256으로 부르고 중단된 body는 수신 byte 수·complete:false·실패 이유를 기록한다. stdout 전송은 원문 합계 4MiB 이하일 때만 수행하며 base64로 인해 로그 크기는 이보다 커질 수 있다.

성공하더라도 executionPowIssuanceEth=0 한 필드만 partialMetrics에 남긴다. publishedAt:null, PIT 적격 필드 0, 전체 25필드 snapshot 0, modelInputActivated:false다. provider capture 시각이나 block timestamp를 최초 공개 시각으로 대체하지 않는다. 실패하면 observation:null과 실제 실패 receipt를 남긴다. PoS consensus 발행·수수료·소각 및 ETH 가격을 0으로 두는 코드 경로는 없다.
