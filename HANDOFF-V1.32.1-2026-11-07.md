# Bitcoin Cycle Atlas — v1.32.1 새 세션 인계

작성일: **2026-11-07 KST**. 이 문서는 완료한 구현·검증·배포와 후속 검토 후보를 구분한다. 새 세션은 현재 GitHub 상태를 먼저 조회하고, 아래 완료 작업을 반복 구현하거나 이전 미완료 실행을 다시 기다리지 않는다.

**v1.32.1의 요청된 구현·검증·공개 배포는 완료됐다. 현재 요청은 새 세션을 위한 인계이며, 추가 기능 구현은 시작하지 않았다.**

## 1. 현재 완료 상태

| 항목 | 확인한 값 |
| --- | --- |
| 저장소 | https://github.com/twoimo/bitcoin-cycle-atlas |
| 운영 사이트 | https://twoimo.github.io/bitcoin-cycle-atlas/ |
| 최신 확인 릴리스 | [v1.32.1](https://github.com/twoimo/bitcoin-cycle-atlas/releases/tag/v1.32.1) |
| 완료 PR | [#64](https://github.com/twoimo/bitcoin-cycle-atlas/pull/64), merged / closed |
| 운영 배포 및 tag 커밋 | `12920009ec11d9ae50de67a383b44ee45f398681` |
| PR 최종 후보 | `4ea8ea46b744fda7d79e857b2c772021226f2b5d` |
| 두 커밋의 동일한 제품 tree | `2e4c818f4d1c1d404b0d207e8565cf27e58fdd17` |
| Release 게시 | 2026-11-07 **03:43:30 KST** |
| 공개 Pages HTTP 검증 | 2026-11-07 **03:43:49 KST**, PASS |

이전 페이지 통폐합·ETH/HYPE 추가·ztd-charts 적용은 **v1.32.0 / PR #63**에서 완료됐다. 이번 상단 한 줄·스크롤바 숨김·검색/초점 교정은 **v1.32.1 / PR #64**에서 완료됐다. 둘 다 미병합·미배포 상태가 아니다.

인계 작성 시 최신 main과 v1.32.1 tag를 다시 조회해 위 배포 커밋과 일치함을 확인했다. 자동 데이터 갱신이나 사용자의 다른 세션으로 main은 이후 달라질 수 있다. 이 SHA를 최신 main으로 강제 복원하지 않는다.

이 문서가 저장된 `docs/handoff-v1.32.1-20261107`은 **인계 문서 전용 브랜치**다. 이 문서의 체크포인트 커밋과 실제 운영 배포 커밋을 혼동하지 않는다. 문서 저장 때문에 제품 버전이나 태그를 바꾸거나 운영 배포를 다시 실행할 필요는 없다.

## 2. 새 세션 시작 순서

1. 이 문서와 저장소 루트 `AGENTS.md`를 읽는다. 화면을 바꾸기 전에는 `design.md`도 읽는다.
2. GitHub 최신 main, 최신 release, PR #64의 상태를 조회한다. 위 완료 결과 이후 다른 변경이 있으면 보존한다.
3. 로컬 작업트리의 `git status`를 확인한다. 사용자의 기존 변경을 덮어쓰거나 다른 작업 폴더를 초기화하지 않는다.
4. 아래 완료 항목과 후속 검토 후보를 구분한다. 추가 코드 변경은 최신 main에서 분리한 작업 브랜치로 진행한다.
5. 후속 수정에는 실제 변경 범위에 필요한 검사와 기존 수치·원장·상태전이 검증을 적용한다. 인계를 읽는 것만으로 전체 모델 작업이나 이미 끝난 배포를 다시 실행하지 않는다.

### 작업 폴더와 복구

- 완료 작업 체크아웃: `/workspace/scratch/00d2811ce486/atlas-release`
- 이 문서 체크아웃: `/workspace/scratch/00d2811ce486/atlas-handoff`
- 이 문서 파일: `HANDOFF-V1.32.1-2026-11-07.md`
- 인계 브랜치: `docs/handoff-v1.32.1-20261107`

로컬 폴더가 없으면 GitHub 저장소를 새로 열고, 인계 브랜치의 위 파일을 읽는다. 새 작업의 기준 소스는 그 시점의 최신 main이다. 원본 작업 폴더가 남아 있어도 닫힌 PR의 후보 브랜치가 checkout돼 있을 수 있으므로 HEAD를 확인한다.

## 3. 사용자 요구와 완료된 제품 동작

사용자는 여러 페이지를 통합한 뒤, 부동산의 설정·기간·요약·탭이 위에 여러 줄로 쌓여 있다고 지적했다. 첨부한 두 번째 이미지의 **실제 외곽 차트 상단 `.atlas-canvas-heading` 한 줄**로 모든 작업공간의 조작부를 옮기고, 스크롤바 표시를 전부 숨기도록 요청했다.

| 영역 | 완료한 동작 |
| --- | --- |
| 시장 분석 | 미국·한국·조건 실험·현금흐름을 한 작업공간으로 통합. 시장·탭 선택, 설정, 기간, 요약을 외곽 상단으로 이동 |
| 종목 차트 | RSI·부동산·테마를 공통 종목 검색으로 선택. 부동산 지역·보기 탭·설정·기간·요약·CSV·새로고침과 차트 관측/표시 구간을 같은 상단에 배치 |
| 자산 비교 | 검색·섹터·상태·표 구성, 우측 갱신·판단 이력·읽는 법·CSV를 외곽 상단으로 통합. 디지털 자산은 BTC·ETH·HYPE 3종, 전체 20종 |
| 공모주 | 월 이동·검색·일정 상태·건수는 한 줄. 달력 도구와 원자료 출처는 그 줄에서 여는 메뉴 |
| 리서치 | 검색·필터·페이지 이동을 같은 외곽 상단으로 통합 |

- 데스크톱 헤더 **44px**, 모바일 폭 헤더 **48px**. 좁은 화면은 한 줄의 native 가로 스크롤을 사용한다.
- 상세 설정·기간·요약·판단·출처는 상단 버튼에서 native dialog로 연다. 중복 내부 제어 행을 제거했다.
- 전체 문서·iframe·표·메뉴에서 스크롤바 표시를 숨겼다. 휠·터치·키보드 스크롤, 표의 sticky 헤더·식별 열은 유지했다. 전역 `overflow: hidden`으로 스크롤 기능을 없앤 구현이 아니다.
- 종목 검색은 **결과 목록만 스크롤**한다. 현재 선택이 서울 아파트처럼 목록 아래에 있어도 검색창과 닫기 버튼이 가려지지 않는다.
- 실제 활성 child 문서에 키보드 포커스가 들어간 동안 외곽 frame에도 표시한다. 메뉴 닫기 후 상단 버튼으로 초점이 돌아온다.
- 같은 작업공간을 재방문할 때 toolbar mount를 재사용한다. 배경 차트 비활성화가 toolbar를 함께 비활성화하지 않으며, 오래된 frame/document/epoch의 이벤트는 무시한다.
- 원래 링크도 호환된다. 예전 `/us/`, `/kr/`, `/scenario/`, `/cashflow/`, `/rsi/`, `/housing/`, `/themes/`를 삭제해 접근을 끊지 않았다.

### 공개 화면에서 마지막으로 확인한 흐름

- 자산 비교의 외곽 섹터 선택 → 디지털 자산 → 표시 3 / 전체 20, BTC·ETH·HYPE 및 CSV 건수 일치.
- IPO 상단 출처 열기 → 실제 수집 원문 URL 확인 → 닫기 → 같은 상단 버튼으로 초점 복귀.
- 서울 아파트 → 종목 검색 다시 열기 → HYPE 검색·차트 선택 → 서울 검색·복귀.
- 실제 외곽 헤더 44px / 활성 toolbar 1개, 부모와 child의 scrollbar `none` 확인.
- iframe 진입 URL의 `v=1.32.1` 확인. 새 상단이 보이는 공개 화면을 시각 확인했다.

직접 확인한 종목 URL:

- https://twoimo.github.io/bitcoin-cycle-atlas/market-lab/charts/?symbol=HOUSING-SEOUL&region=seoul
- https://twoimo.github.io/bitcoin-cycle-atlas/market-lab/charts/?symbol=HYPE

## 4. 최종 검증 결과와 증거

| 실행 | 결과 |
| --- | --- |
| [PR CI 42268286432](https://github.com/twoimo/bitcoin-cycle-atlas/actions/runs/42268286432) | 모델·데이터 `2,571/2,571`, fail/skip 0. 이후 수치·formal·보존 기록·정적 산출물·publication 검사 성공 |
| [Market lab service 42268286480](https://github.com/twoimo/bitcoin-cycle-atlas/actions/runs/42268286480) | service verify 및 native 2개 job 성공. 통합 320×900·390×844·1440×900 각 16개 상태, 자산 비교 10개 케이스 통과 |
| [Hallmark 42268286682](https://github.com/twoimo/bitcoin-cycle-atlas/actions/runs/42268286682) | 기존 8경로 및 통합 10경로 모두 성공, 현재 FAIL 0 / REFLEX 0, integrity PASS |
| [전체 ETH/Chrome 42268286595](https://github.com/twoimo/bitcoin-cycle-atlas/actions/runs/42268286595) | `models`, `browser`, `evaluate` 모두 성공. full scope **53/53**, 원본 caseSpec 53개 일치, 소스 해시 113개 변경 없음, PNG 367개 hash/bytes 일치 |
| [병합 main CI 42271739882](https://github.com/twoimo/bitcoin-cycle-atlas/actions/runs/42271739882) | 배포 커밋에서 전체 테스트 2,571/2,571 및 후속 검사 성공 |
| [Release 42271739926](https://github.com/twoimo/bitcoin-cycle-atlas/actions/runs/42271739926) | 성공. tag가 배포 커밋과 일치. 명세/게시 asset 13개 일치, checksum 목록의 12개 파일 모두 OK |
| [Deploy Pages 42271739791](https://github.com/twoimo/bitcoin-cycle-atlas/actions/runs/42271739791) | build/deploy 성공. 공개 source/manifest 및 critical HTTP body 4개 확인 |

별도 panels 91/91, service 28/28 등에는 기본 CI와 중복되는 검사가 있다. 이를 전부 더해 고유 테스트 수라고 표현하지 않는다.

일반 PR CI와 service verify가 checkout한 GitHub merge candidate는 `0a964775a6704128ff4b7d312abcf89bc100b775`이며, 제품 tree가 최종 PR head와 일치했다. Native·Hallmark·전체 ETH evidence는 PR head `4ea8ea46…`를 직접 검증했다. main CI·Release·Pages는 실제 병합 커밋 `12920009…`를 검증했다.

전체 Chrome의 runtime/unexpected resource/unscoped 오류는 모두 0이다. raw resource 기록 1건은 리플레이의 `delayed-load-replacement`가 오래된 요청을 교체하면서 의도한 `net::ERR_ABORTED`이며, 같은 request ID와 replacement ID로 증명된다. 이를 새 장애로 오인하거나 모든 원시 오류가 0이었다고 쓰지 않는다.

### 공개 배포 식별

- sourceCommit: `12920009ec11d9ae50de67a383b44ee45f398681`
- Pages manifest SHA-256: `532c405c03bd86124132cd8f02bb622e663947e55072da66f3b4bd28b5ff9aa6`
- content/validated/served digest: `4cd85932fc67bfc842c68d5d17cc4e4eac4e201704317f63e05a6a7a38bf4050`
- build는 공개 파일 795개를 검증했다. 원격 HTTP 재조회는 `index.html`, `site-entry.js`, `data/btc-daily.json`, `data/forecast-ledger/index.json` **4개**다. 795개 전체를 원격 재조회했다는 주장은 하지 않는다.
- Release asset 판정은 공식 완료 로그와 공개 release/tag API 대조에 근거한다. 게시 asset 전체를 독립 재다운로드해 검증했다고 주장하지 않는다.

실제 검증은 headless Chrome과 공개 데스크톱 Chrome을 사용했다. 320/390px은 브라우저 viewport 검사이며, Safari나 물리적 모바일 기기를 검증했다는 뜻은 아니다.

## 5. Hallmark — 남은 경고와 정확한 범위

Pinned upstream은 **Hallmark v2.0.0 / `7ec868225c6caa040558c321ee0fefa0e73f83a8`**이다. 원본 checker·render checker·LICENSE를 바꾸거나 severity를 낮추지 않았다. 현재/기준 sourceReadOnly와 Git blob 대조 모두 성공했고 waived/answered/dismissed는 0이다.

| v1.32.1 최종 current 단계 | FAIL | REFLEX | WARN |
| --- | ---: | ---: | ---: |
| 전체 정적 검사 | 0 | 0 | **32** |
| 기존 8경로 render | 0 | 0 | **10** |
| 통합 10경로 render | 0 | 0 | **2** |

두 suite는 같은 정적 32개 WARN을 반복 포함한다. 정적 경고를 두 번 더하지 않는다. `hallmark-triage.md`의 **38 WARN은 이전 `04d98bfa…` 실행의 28 static + 10 render 원문**이며 현재 결과가 아니다.

- 현재 static 32: contrast gate 40의 5개, container recipe F7의 26개, search popover border/shadow F24의 1개.
- core render 10: F3 1개, F7 1개, font weight F19 2개, 모바일 열/정보 접근 F25 4개, 이전 heading/figure kept 비교 2개.
- workspace render 2: F3 1개, F7 1개.
- 변경 전 workspace baseline의 iframe focus FAIL 9개는 원문에 보존했다. 현재 동일 gate 26a의 FAIL은 0이고 current render가 통과했다. 검사기가 개별 성공마다 PASS finding을 출력한다고 주장하지 않는다.
- core baseline/current 각각 readiness 8/8 및 PNG 40장, workspace 각각 readiness 10/10 및 PNG 50장. 원본 PNG 총 180개와 영수증에 hash가 있는 review image 72개를 대조했다.
- 이 검사기의 parent DOM 검사와 iframe 내부 모든 요소의 대비/상호작용 검사는 동일한 범위가 아니다. 실제 child readiness·스크린샷에 더해 별도 native 검증을 수행했다.

### 후속 작업 후보 — 아직 모두 해결됐다고 쓰지 말 것

이번 세션의 요청한 개편·배포는 완료됐다. 새로운 기능 요구는 아직 지정되지 않았다. 추가로 이어갈 자연스러운 후보는 위 WARN의 **실제 화면 기준 판정과 필요한 최소 수정**이다.

1. 오류 글자·dialog 수식의 실제 computed foreground/background와 활성 상태를 확인한다. dark/light 토큰이 정적 계산에서 섞였을 가능성만으로 오탐이나 해결을 선언하지 않는다.
2. F7/F24/F3/F19는 실제 중복 상자·검색 popup·다행 제목·타이포 역할을 구분해 판단한다. 공유 UI 패턴을 경고 수를 줄이려고 무작정 없애지 않는다.
3. F25는 숨긴 스크롤바와 함께 표의 끝 열/행 및 상세 정보에 키보드·휠·터치로 도달할 수 있는지 확인한다. 모든 열을 좁은 화면에 억지로 압축하지 않는다.

단지 WARN 숫자를 0으로 만들기 위해 원본 검사기, 검증 한도, 데이터, 관측값 또는 제목을 바꾸지 않는다. 새로운 작업에서 바뀐 소스에는 과거 PASS를 자동 이전하지 않는다.

## 6. 구현 위치와 유지해야 할 계약

| 파일/영역 | 역할 |
| --- | --- |
| `dist/center-workbench.js` | 외곽 toolbar host, iframe/epoch 소유권, 재방문 수명, 실제 child focus 표시 |
| `apps/web/src/components/compact-toolbar.tsx` | parent React portal과 상세 native dialog |
| `apps/web/src/app.tsx`, `apps/web/src/panels/` | 시장·RSI·부동산·테마·조건·현금흐름의 상단 구성 |
| `dist/legacy-workspace-toolbar.js`, `.css` | 자산 비교·IPO·리서치의 원래 source-owned 입력/이벤트를 외곽 상단에 연결 |
| `dist/atlas-shell.css`, `apps/web/src/workspace.css` | 한 줄 배치, 스크롤바 표시 숨김, 원래 스크롤 소유권 보존 |
| `dist/symbol-selector.js`, `.css` | 결과 목록만 스크롤하는 검색과 선택 종목 이동 |
| `dist/ipo-view.js` | 수집된 출처 설명과 URL 원문 보존. 실제 원문 `http://www.38.co.kr/html/fund/index.htm`의 scheme을 임의로 바꾸지 않음 |
| `apps/web/src/components/ztd-research-charts.tsx` | 실제 ztd-charts 컴포넌트로 관측선/기여도 렌더 |
| `scripts/verify-consolidated-workspace-browser.mjs` | 실제 선택·클릭·입력·초점·스크롤 및 3폭 통합 흐름 |
| `scripts/verify-hallmark-design.mjs`, `.github/workflows/hallmark-design.yml` | 원본 checker, 8+10 경로, 실제 parent/child readiness와 원문 보존 |
| `scripts/eth-browser-case-specs.mjs` | full native 53개 원본 case inventory |
| `scripts/eth-evidence-handoff.mjs`, `.github/workflows/eth-model-evaluation.yml` | models/browser 병렬 실행 후 동일 source/run/attempt/artifact/hash 결합 |

`dist/market-lab/app/assets/`의 생성 bundle을 직접 편집하지 않는다. React 원본을 바꿨다면 기존 Pages 생성 절차로 반영한다.

### 시간 제한 문제는 이미 해결됨

이전 `fe0bca…`의 ETH run `42260422285`는 모델과 Chrome을 연속 실행하다가 35분 제한으로 취소됐다. 50개 case가 끝났어도 전체 성공 영수증이 없었으므로 전체 통과로 취급하지 않았다. 이 실행을 다시 기다릴 필요가 없다.

최종 `4ea8ea46…`에서는 원래 모델 명령·순서·5개 acquisition의 실패 보존 정책·53개 case·고정 폰트를 유지해 두 worker를 병렬 실행했다. worker별 35분 cap을 늘리지 않았다. 마지막 required `evaluate` job은 producer 성공, exact artifact ID, source SHA/tree/run 및 실제 producer attempt, 파일/PNG hash, 원본 caseSpec 53개와 sourceIntegrity를 대조하고 기존 source-book builder를 실행한다. 부분 실행이나 다른 커밋의 결과를 합쳐 PASS로 만들지 않는다. 재시도 artifact는 이전 결과를 덮어쓰지 않는다.

이 결합 계약 검사 56개와 기존 review-packet 검사를 합한 집중 검사 87/87이 통과했다. 최종 source-book은 complete-for-declared-scope, unresolved imports 0, 883 files / 106,501,318 bytes였다. 기존 사용자 지정 외부 검토 제외 상태를 새 모델 검토 통과로 바꾸지 않는다.

## 7. 보존해야 할 데이터·연구·리플레이

- 이번 UI 변경 전후 `dist/data` Git tree는 `83d119faf64c758736afb5236c5848cb07252dfc`로 동일했다. 원래 18개 자산 기록, 시세·수식·원장 및 과거 판단을 다시 쓰지 않았다.
- BTC 한국어명은 **비트코인**, ETH는 USD, HYPE는 **USDC**다. HYPE의 짧은 표본이나 결측을 임의 판단/수익률로 보충하지 않는다.
- ztd-charts **0.2.1** 고정, 원본 관측 인덱스·직선 연결·결측 분리·0 기준 signed contribution, MIT 고지를 유지한다. 새 시장 가격·분석 기간·수집 시각을 만들어 넣지 않는다.
- 기존 수치·예측 발행·전향 보정·원장 불변성 조건을 유지한다. UI 검증 성공은 예측 성능이나 모델 운영 승격의 증거가 아니다. 관련 변경 전 `docs/ETH_REMAINING_CONDITIONS.md`를 읽는다.
- 기존 현재 차트 안의 봉 리플레이와 고정 예측선·범위를 유지한다. 시작일 전날까지만 사용해 생성한 회고선을 재생 중 재계산하거나 기존 발행 예측 성적으로 채점하지 않는다. 이번 상단 작업을 이유로 별도 리플레이 창·모의 주문·임의 축 조정을 추가하지 않는다.

## 8. 함께 읽을 문서

- `AGENTS.md`, `design.md`
- `docs/RELEASE_V1_32.md`
- `docs/toolbar-consolidation-2026-11-07/README.md`
- `docs/toolbar-consolidation-2026-11-07/hallmark-triage.md`
- `docs/toolbar-consolidation-2026-11-07/hallmark-04d-findings.json` — 이전 38 WARN의 원문
- `docs/design-system/ztd-charts.md` — 실제 채택 API·수학 의미·라이선스와 적용 경계
- `docs/ETH_REMAINING_CONDITIONS.md` — 모델·증거의 별도 조건
- [PR #64 본문](https://github.com/twoimo/bitcoin-cycle-atlas/pull/64) — 최종 실행·공개 배포 기록

이 문서와 로그는 실제로 완료한 범위를 인계하는 자료다. 이후 세션에서 소스·사용자 요청·도구 접근 상태를 확인하고, 확인하지 않은 새 결과를 완료로 추정하지 않는다.
