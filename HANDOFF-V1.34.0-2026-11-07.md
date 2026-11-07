# Bitcoin Cycle Atlas v1.34.0 작업 인계

작성일: 2026-11-07. **v1.34.0 / PR #67은 검증·병합·릴리스·공개 배포·공개 화면 QA까지 완료됐다.** 최종 PR source는 `7e9def739937d84a9031f0c26d66093f706dfc10`, 실제 병합·release tag·공개 운영 source는 **`71e1e86e49c9b14a4cbe0d1d0c0a83317965b02e`**다. 두 커밋의 tree는 같다. 병합 시각은 **2026-11-07 19:46:40 KST / 10:46:40 UTC**이며 main CI·Release·Pages는 모두 success다. 아래 완료된 실행이나 이전 timeout을 다시 기다리지 않는다.

## 1. 프로젝트와 소스 식별

| 구분 | 확정 값 |
| --- | --- |
| 저장소 / 운영 URL | https://github.com/twoimo/bitcoin-cycle-atlas / https://twoimo.github.io/bitcoin-cycle-atlas/ |
| PR | https://github.com/twoimo/bitcoin-cycle-atlas/pull/67 — 병합 완료 |
| 작업 브랜치 / 폴더 | `feat/atlas-layout-redesign-20261107` / `/workspace/scratch/38e7cf6c7262/atlas-layout` |
| 최종 PR source | `7e9def739937d84a9031f0c26d66093f706dfc10` |
| 공통 source tree | `c5e85ffb7fec9fc480d5cb7c8ffcedd3e86b08d9` |
| PR CI용 임시 merge | `f208ce90e5ec61ae0199fb68684c9c91e1cc4c55` — 같은 tree |
| 실제 병합 / main source | `71e1e86e49c9b14a4cbe0d1d0c0a83317965b02e` — 같은 tree |
| 실제 merge 부모 | 기존 main `c1da5ea5f5109315f8dd65ea8229e47948ba4b2f` + 최종 PR source `7e9def739937d84a9031f0c26d66093f706dfc10` |
| 인계 문서 보존 브랜치 / parent | `docs/handoff-v1.34.0-20261107` / 운영 source `71e1e86e49c9b14a4cbe0d1d0c0a83317965b02e` |
| 영구 증빙 경로 | `docs/layout-redesign-2026-11-07/proof/` |

PR source, CI 임시 merge, 실제 main, release tag, Pages publication, 문서 commit은 구분한다. 문서 checkpoint는 **보존 브랜치를 resolve한 결과와 최종 답변의 pin URL**로 확인한다. 자기 자신의 SHA를 미리 적지 않으며 실제 운영 source는 7절을 따른다.

### 이전 릴리스와의 관계

- **v1.33.0 / PR #66은 병합·릴리스·공개 배포가 완료된 이전 작업**이며 source는 위 기존 main이다. 사용자의 재요청으로 v1.34에서 탐색·입력·결과·문서를 구조적으로 개편했다. v1.33을 미완료로 취급하지 않는다.
- v1.32.1 / PR #64도 완료됐다. 당시 문서 checkpoint `0eaa23bfe32d92a8a852f4120e9ac519f84c14a6`와 운영 source `12920009ec11d9ae50de67a383b44ee45f398681`는 서로 다르다. 제거한 내부 도구 행과 이전 timeout 작업을 복원하지 않는다.
- 이전 인계: `HANDOFF-V1.33.0-2026-11-07.md`, 브랜치 `docs/handoff-v1.33.0-20261107`. 이전 작업 폴더는 `/workspace/scratch/38e7cf6c7262/atlas-redesign`이다.

## 2. 적용한 스킬과 이번 변경

사용자 지정 [UI/UX Pro Max](https://github.com/nextlevelbuilder/ui-ux-pro-max-skill)의 고정 revision **`b7d5353e0130feb8c5574ef1251f8a1db1873ccb`**에서 `SKILL.md`, `references/pro-rules.md`, `references/quick-reference.md`를 실제로 읽었다. 검색·재검색과 채택 범위는 `design-system/bitcoin-cycle-atlas/MASTER.md`의 v1.34 절에 기록했다.

`financial research terminal editorial`(density 9 / variance 4)과 재검색 `investment analytics dashboard`에서 금융 작업에 맞는 계층을 채택했다. 적합한 검색 결과가 없었던 부분도 기록하고 실제 소스·화면과 공통 지침으로 결정했다. v1.33의 먹색·종이색·황동색, 한국어 기본 자간, 4px 간격과 숫자 정렬을 유지하며 정보의 순서와 면적을 바꿨다.

| 영역 | v1.34에서 바뀐 실제 구성 |
| --- | --- |
| 외곽 탐색·상단 | 오른쪽 64px 영역에 한국어 목적지 6개와 현재 위치를 표시한다. 한 줄 상단에서 종목·화면·수치·보조 조작을 구분한다. |
| 종목 선택·검색 | 넓은 공통 header에서는 종목명과 ticker를 함께 표시하고 검색 결과의 이름·ticker·거래소를 열로 정돈했다. Legacy 주식 버튼은 원래 ticker-only 텍스트를 유지한다. |
| 조건 실험·현금흐름 | 관련 입력을 묶고 결과 면적을 늘렸다. 기존 계산의 지수·NPV를 먼저 읽히게 하고 기여도·손익·현금을 원장으로 배치한다. |
| 시장·주택·RSI·테마 | 핵심 값, 관측·조건, 원장·출처를 구분했다. |
| 자산·IPO | 기존 모든 열을 유지하며 역사 통계·현재 가격·판단을 구획했다. IPO는 날짜를 기준점으로 삼아 일정 유형과 회사명을 분리했다. |
| 리서치·리더 | 제목과 종목·발행처·날짜의 위계를 정리했다. 데스크톱 리더는 절 제목 120px 영역과 본문 688px 읽기 폭, 작은 화면은 한 열이다. 제목 30px와 원문·출처 접근을 유지한다. |

주요 구현 경계는 `dist/editorial-system.css`, `dist/editorial-panels.css`, `dist/editorial-ledgers.css`, shell/chrome·선택기, `apps/web/src/panels/`, `dist/evidence-view.js`다. 생성 JS/CSS·9개 route wrapper는 정식 build 결과다. 설명 문서는 `docs/RELEASE_V1_34.md`, `design.md`, `MASTER.md`를 함께 읽는다.

## 3. 보존한 계약과 데이터

- 미국·한국·조건 실험·현금흐름 통합, RSI·부동산·테마의 공통 종목 검색 및 차트 연결을 유지한다.
- 실제 차트의 네 외곽 영역과 **실제 외곽 상단 한 줄 조작부**를 유지한다. source가 소유하는 toolbar mirror/portal과 검색·메뉴·iframe의 Escape·resize·닫기·포커스 복귀를 보존한다.
- 자산 비교의 모든 열·섹터·BTC·ETH·HYPE·통화·판단 이력, sticky header·식별 열과 기존 가로 스크롤을 유지한다. 스크롤바 표시만 숨긴 기존 mouse/touch/keyboard 동작도 유지한다.
- 관측 수치·결측·단위·부호·계산식·원장·리플레이·ztd-charts, 양수/음수 색과 파란 replay 시작점 preview를 바꾸지 않는다. 빈 연구 결과의 visible th 수에 맞춘 colSpan 처리도 유지한다.
- 원본 Hallmark·baseline·판정·검증 범위·원자료를 WARN 감소나 테스트 통과를 위해 바꾸지 않는다. 다른 세션·자동 갱신의 최신 변경을 덮어쓰지 않는다.

최종 `protected-boundary.json`은 v1.33 source와 **`dist/data`, `research-data`, `packages`, `scripts`, `verification`, `tools/hallmark`, `.github`, `dist/vendor`의 Git tree가 모두 일치**함을 확인했다. 기존 자동 갱신 자료, 금융 모델·원장, 차트 vendor와 원본 검증 도구를 보존했다. Package lock 변경은 root version 항목이다. 실제 merge는 기존 main을 부모로 포함하며 검증한 PR tree와 동일하다.

## 4. 최종 PR의 완료된 원본 검증

아래는 **7e9 최종 PR source**의 결과다. 겹치는 범위의 수치를 합해 별도의 전체 테스트 수로 만들지 않는다. 이전 ae4 후보나 v1.33의 통과 결과를 가져온 표가 아니다.

| 범위 | 최종 결과 | 원본 실행 / 증빙 |
| --- | --- | --- |
| 전체 모델·데이터 테스트 | **2,579 PASS / FAIL 0 / SKIP 0** | [CI 42363532610](https://github.com/twoimo/bitcoin-cycle-atlas/actions/runs/42363532610), job `128376663061`; `ci-review.json` |
| React / service DB | **93 / 28 PASS**, 각각 FAIL·SKIP 0 | 같은 최종 CI 완료 로그; `ci-review.json` |
| Market service | 최종 workflow 성공 | [42363532540](https://github.com/twoimo/bitcoin-cycle-atlas/actions/runs/42363532540) |
| Market 부분 native | data **10/10·54 PNG**, workspace **3/3·27 PNG** | 각각 source113·case 순서·PNG bytes/SHA 일치; `market-*-integrity.json` |
| Hallmark | 두 suite 성공, **FAIL 0 / REFLEX 0** | [42363532624](https://github.com/twoimo/bitcoin-cycle-atlas/actions/runs/42363532624); `hallmark-integrity.json` |
| Chrome 전체 native | **53/53 PASS, 실패 0**, 원본 case 순서 일치 | [ETH 42363532477](https://github.com/twoimo/bitcoin-cycle-atlas/actions/runs/42363532477), attempt 1; `native-artifact-verification.json` |
| Native 소스·이미지 | **113/113 Git blob 일치**, 실행 중 소스 변경 없음; **371/371 PNG** bytes/SHA·inventory 검증 | 같은 원본 browser 산출물. 임의로 만든 대체 캡처가 아니다. |
| Models / joined | 원본 단계 성공, **397개 파일·33개 디렉터리** 검증 | `joined-artifact-verification.json`; 이 수치는 테스트 개수가 아니다. |

### 증거 결합과 범위

원본 model/browser/joined ZIP의 GitHub identity·digest를 확인해 보존했고 최종 strict 감사가 PASS했다. Model artifact `13571326583`, browser `13571152881`, joined `13571317786`을 정확한 run/attempt에 연결했다. Joined의 producer receipts와 browser 복사본 448개는 원본 bytes와 일치한다.

Source-book은 **903 entries = Git source 551 + 실행 증거 352**, **602 parts / 108,331,043 bytes**를 검증했고 unresolved imports는 없다. 이는 선언 범위의 framing·bytes 검증이다. 외부 검토는 `omitted-by-user`이며 새 외부 모델 검토·수익성 검증·연구 release 승인·production model promotion은 수행하지 않았다.

원본 browser manifest113개 밖의 editorial CSS는 별도 Hallmark 전체 소스 proof로 확인했다. 최종 Hallmark 입력 **1,000개 / 55,037,450 bytes**가 Git blob과 일치하며 manifest SHA-256은 `b031ef213c0cf81ecb64ded476155eaf4edd48de2077d509d48cd85f6cc957da`다. CI 임시 merge·최종 PR·실제 main의 tree 동일성은 각각의 source identity 증거로 연결한다.

## 5. 실제 화면 확인과 해결한 문제

초기 미국 시장의 잘못된 메뉴 선택과 320px IPO 회사명 잘림을 고쳤다. 시장은 실제 목적지를 반영하고 IPO는 grid 최소 폭을 보정해 ellipsis를 표시한다. 날짜·2개 일정·더보기 수는 유지했다.

이전 ae4는 주식10개에서 `#equity-symbol` **버튼 전체 textContent**의 BMNR/MSTR 계약을 위반했다. 7e9는 `showName=false`를 기본값으로 두고 공통 header만 opt-in하도록 고쳤다. 원본 검사·테스트를 유지한 **새 전체53개 실행은 모두 통과**했다. ae4 실패 실행을 다시 기다리지 않는다.

실제 검토한 범위는 다음과 같다.

- 자산·IPO·빈 연구 목록320/390/1440, 900×430 표·방법 dialog를 확인했다. IPO 보정도 같은 세 너비에서 확인했다.
- 최종 Hallmark 자산표1440·375와 연구1440에서 새 겹침·누락이 없었다. ae4와 다른 작은 픽셀은 글자 주변·검색창 모서리에 한정되고 구조·수치는 동일했다.
- 최종 native의 BMNR320·MSTR1440·미국 시장1440을 직접 확인했다. Ticker-only 버튼과 차트가 정상이며 **우측 시장 분석 / 상단 US 미국**이 정확히 선택됐다. 파일 identity와 관찰은 `native-visual-review.json`에 있다.
- 최종 Market81 PNG와 workspace Hallmark50 current PNG는 직전 검토 이미지와 동일했다. Hash 검증을 전체371장 육안 검토와 혼동하지 않는다.

IPO 캡처는 2026년11월의 5주 달이다. 6주 달·물리 기기 검증으로 확대하지 않는다. 공개 리더·메뉴 동작은 7절의 별도 QA를 따른다.

## 6. Hallmark WARN과 고정 기준

| 최종 current 범위 | FAIL | REFLEX | WARN |
| --- | ---: | ---: | ---: |
| Static — 두 검사에 반복되지만 **한 번만 집계** | 0 | 0 | **62** |
| 기존 core 8개 화면 render | 0 | 0 | **10** |
| 통합 workspace 10개 화면 render | 0 | 0 | **3** |

v1.33의 **60/10/3**은 이전 source 결과, v1.32.1의 **32/10/2**는 그보다 이전 결과다. 오래된 문서의 **38 WARN**과 현재 결과를 섞지 않는다. 두 suite의 static62를124로 중복 집계하지 않는다.

원본 Hallmark pin은 `7ec868225c6caa040558c321ee0fefa0e73f83a8`이다. Core 고정 baseline은 `0c1ed40e1b9b6c76f5621d087737dc57f174b51e`, workspace 고정 baseline은 `3b6373906dbdd3ef321db31deaf8a8f785da61c3`다. **이 baseline은 직전 v1.33 화면이 아니다.** 원본 `--before`/`--kept`와 별도 readiness 절차를 유지했다. Current FAIL을 baseline에서 빼거나 WARN을 면제해 통과시킨 결과가 아니다.

Core render10은 F3/F7, F19 두 건, F25 네 건, kept 두 건이다. Workspace render3은 F3/F7와 baseline figure `11.06` kept 기록이다. 긴 표의 화면 밖 열은 실제 가로 스크롤·sticky 식별 열과 함께 검토한다. 남은 경고의 원문은 `hallmark-counts.json` 및 원본 보고서를 기준으로 한다.

리서치 F25의 `118 words shown at 1440 are hidden on a phone`은 원문118단어 삭제를 뜻하지 않는다. Renderer가1440의 td 참조를 저장한 뒤375로 resize하는 동안 앱이 기존 tbody를 재생성해 옛 td가 disconnected가 된다. 이전 `textContent`의 제목·종목·모바일 발행 기록 결합과 현재 `innerText`의 공백·줄바꿈도 다르다. 소스 재구성에서 첫10개 제목 td의112단어와 모바일 다음 페이지인 EIP 발행처 두 건 각3단어가 합쳐져118이 된다. 실제 모바일은 첫8행을 표시하고 다음 버튼으로 계속 읽는다. 제목과 읽기 버튼은 같은 article ID로 리더를 연다. 이 분석을 근거로 checker·데이터·판정은 바꾸지 않았으며 원본 WARN을 남겼다.

## 7. 완료된 병합 이후 검증·릴리스·공개 배포

아래 결과는 **실제 main `71e1e86e49c9b14a4cbe0d1d0c0a83317965b02e`**의 원본 자동 workflow와 실제 공개 서비스에서 확인했다. PR 임시 merge의 결과를 운영 결과로 복사하지 않았다.

### Main CI

[Run 42365377496](https://github.com/twoimo/bitcoin-cycle-atlas/actions/runs/42365377496), job `128382218050`, attempt1이 **success**다. 실제 main에서 **2,579 PASS / FAIL0 / SKIP0**, React93·service DB28도 각각 FAIL·SKIP0이다. 원본22단계와 publication 준비·799파일 검증이 성공했다. `main-ci-review.json`과 `main-ci-log-excerpts.txt`에 원본 완료 로그·source/tree를 보존했다.

### v1.34.0 릴리스

[Run 42365377454](https://github.com/twoimo/bitcoin-cycle-atlas/actions/runs/42365377454), job `128382217697`, attempt1이 **success**다. [릴리스 v1.34.0](https://github.com/twoimo/bitcoin-cycle-atlas/releases/tag/v1.34.0), ID **437517011**, 게시 시각 **2026-11-07 10:58:41 UTC / 19:58:41 KST**다. Draft·prerelease는 false이며 tag는 실제 운영 source71e1을 가리킨다.

**13개 asset metadata**를 확인했고 checksum12개를 GitHub digest와 대조했다. `SHA256SUMS.txt`, `RELEASE_METADATA.json`, `PUBLICATION_MANIFEST.json` **3개 body만 직접 다운로드해 bytes/SHA를 확인**했다. 나머지10개 body를 모두 다운로드·압축 해제했다고 주장하지 않는다. Publication의 **799개 inventory metadata**와 원본 verifier는 PASS다. 이는799개 운영 파일의 HTTP body 검증과 다르다. `release-review.json`·`release-api-evidence.json`에 범위와 identity가 있다.

### Pages와 공개 HTTP

[Run 42365377470](https://github.com/twoimo/bitcoin-cycle-atlas/actions/runs/42365377470), build `128382217802`·deploy `128383520786`가 **success**다. 원본2,579개 테스트 실패·skip0,799파일 준비를 거쳤고 **2026-11-07 19:53:26 KST / 10:53:26 UTC**에 원본 공개 verifier가 운영 source71e1을 확인했다.

`public-final.json`은 **19:54:54 KST / 10:54:54 UTC**에 원본 핵심4개와 추가25개의 **서로 다른29개 HTTP body**가 source와 일치함을 기록한다. 새 editorial CSS3개, JS 의존성·선택기 보정, React entry/assets,9개 route wrapper를 포함한다. 공개 publication은 `confirmed`, servedCommit은71e1이다. 모든799개 body를 받았다는 뜻은 아니다.

Pages manifest identity는 `079b9fadfaf172ca6c5738d527072417b9879674333b2165a9ed6fd638d6c103`, Release의 canonical manifest identity는 `a76212e8bc19bc46e1b2922756bee31544bb0d5f34d08e98870fca51e78d2b23`다. 같은 contentDigest `1910281eb8c65e9c01ec9f45d050bdb8f269c75292e68d348c68c263e877fce0`을 가지지만 빌드 metadata가 달라 두 manifest를 분리해 보존했다. 파일 자체 SHA와 canonical identity도 구분한다.

### 실제 공개 화면 QA

**2026-11-07 19:55:57–20:05:34 KST / 10:55:57–11:05:34 UTC**, 공개 `/market-lab/`의 **Chrome 데스크톱1363×936**에서9개 관찰을 완료했다. `public-ui-review.json`의 결과는 PASS다. 원본 native의 모바일 viewport 검증과 별개이며 물리 모바일·소프트웨어 키보드 검증은 아니다.

- 초기 시장 화면의 활성 메뉴·44px 단일 상단, 진단 요약과 닫기 후 포커스, 조건 실험 입력 변경, 현금흐름 재계산, RSI 결과, 주택 관계, HYPE 근거 선택, 리서치 리더, IPO 메뉴를 실제로 확인했다.
- 활성 메뉴의 실제 computed foreground/background 대비는 **7.339:1**이다. 전체 요소의 대비를 모두 측정했다는 뜻은 아니다.
- 리더는 `120px 688px` 구획, 본문 끝 출처까지 native scroll, 닫기 후 원래 제목 버튼으로 포커스 복귀를 확인했다. Reader 열기 때 제목 포커스도 유지됐다.
- 공개 화면은 `public-diagnosis-v134.jpg`, `public-cashflow-v134.jpg`, `public-housing-v134.jpg`, `public-research-v134.jpg` 네 장을 보존했다. 운영 데이터·불변 원장은 수정하지 않았다.

## 8. 보존 증빙과 다음 세션의 시작

영구 증빙은 `docs/layout-redesign-2026-11-07/proof/`에 있다. [증빙 README](docs/layout-redesign-2026-11-07/proof/README.md)가 각 source, 원본 receipt·ZIP·검증·사진의 범위와 한계를 설명한다. 이 폴더의 **`joined-artifact-verification.json`은 최종 strict PASS**이며 과거 임시 감사와 혼동하지 않는다.

`native-report.json.gz`는 원본 **5,905,217 bytes** native report를 손실 없이 압축한 파일이다. 압축을 풀어 원본 SHA를 확인했다. 압축/원본 SHA와 재확인 방법은 README에 있다. PNG371개 검증과 직접 육안 확인 범위, release metadata/body, 공개29 HTTP body, 데스크톱 UI9관찰은 각각 별개의 증거다.

1. 이 문서와 `AGENTS.md`, `design.md`, `MASTER.md`, 릴리스 문서를 읽는다. 폴더가 없으면 확정 인계 checkpoint와 최신 main을 연다.
2. 현재 main·tag·Pages source·작업트리를 확인하고 자동 갱신·다른 세션 변경을 보존한다. 인계 당시 source가 이후에도 최신이라고 단정하지 않는다.
3. **PR·main CI·Release·Pages·공개 QA는 모두 끝났다.** 최종53개·models·joined·Hallmark·배포나 이전 timeout을 다시 기다리지 않는다.
4. 이후 작업은 새 요청 또는 실제 결함을 근거로 진행한다. 경고 수를 위해 기준·원자료를 바꾸거나 완료한 통합·리디자인을 다시 시작하지 않는다.
5. 확정 문서 checkpoint는 보존 브랜치를 resolve하고 최종 답변의 pin을 확인한다. 문서 commit과 운영 source71e1을 구분한다.
