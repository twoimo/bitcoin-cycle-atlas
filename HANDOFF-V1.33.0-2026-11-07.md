# Bitcoin Cycle Atlas v1.33.0 작업 인계 — 릴리스·공개 배포 확인본

작성일: 2026-11-07. 최종 source, 전체 CI·Chrome, 실제 PR 병합, 릴리스, Pages/HTTP 및 공개 desktop CUA 확인을 반영했다. 인계 보존 브랜치는 `docs/handoff-v1.33.0-20261107`이며, 운영 source와 별도의 문서 checkpoint다.

**PR #66은 `c1da5ea5f5109315f8dd65ea8229e47948ba4b2f`로 병합되었고 v1.33.0 릴리스와 Pages 공개 배포가 완료되었다. 병합 전후 전체 CI는 각각 2,579 PASS / 실패·skip 0, 최종 원본 Chrome은 53/53 PASS다. 공개 publication source와 서로 다른 HTTP 파일 20개의 실제 응답, 공개 desktop의 주요6개 조작 흐름까지 확인했다. 최종 Hallmark는 static 60 / core render 10 / workspace render 3 WARN, FAIL 0 / REFLEX 0이다. 검증 범위와 남은 WARN은 아래에 그대로 보존한다.**

이 인계 문서와 [검증 증거](docs/editorial-redesign-2026-11-07/proof/README.md), 실제 운영 화면은 별도 문서 브랜치에 함께 보존한다. 이 checkpoint의 parent는 실제 운영 source `c1da5ea…`이며 제품 코드를 추가로 수정하지 않는다.

## 1. 프로젝트와 커밋의 역할

| 항목 | 확인한 값 / 의미 |
| --- | --- |
| 저장소 | https://github.com/twoimo/bitcoin-cycle-atlas |
| 운영 URL | https://twoimo.github.io/bitcoin-cycle-atlas/ |
| PR | https://github.com/twoimo/bitcoin-cycle-atlas/pull/66 |
| 구현 브랜치 | `feat/atlas-editorial-redesign-20261107` |
| 검증한 PR source commit | `78f4673be1754400742afa3190a5cb3ad47f706e` |
| 최종 구현 후보 tree | `83a695e31f64b118122f2e671175a7013eca7e9e` |
| CI가 checkout한 PR 검증용 merge commit | `2152b170221dae2419c78041acdfb03d40a30e59` — 실제 PR 병합 완료 commit을 뜻하지 않음 |
| 구현 시작 main | `5704a96e787e27f53e1ae44288673ee9f1c451eb` |
| 변경 범위 | 위 main 대비 39개 파일. 빌드 자산의 rename을 포함한 Git diff 기준 |
| 현재 작업 폴더 | `/workspace/scratch/38e7cf6c7262/atlas-redesign` |
| 병합된 main / v1.33.0 tag / 실제 Pages source | `c1da5ea5f5109315f8dd65ea8229e47948ba4b2f` — 세 역할을 각각 확인했으며 동일한 commit |
| 병합·운영 source tree | `83a695e31f64b118122f2e671175a7013eca7e9e` — 검증한 PR head와 같은 파일 tree |
| 릴리스 | https://github.com/twoimo/bitcoin-cycle-atlas/releases/tag/v1.33.0 — 2026-11-07 09:06:51 UTC / 18:06:51 KST 공개 |
| 이 인계 문서의 보존 브랜치·pin URL | `docs/handoff-v1.33.0-20261107` — 확정 commit의 문서 pin URL은 최종 답변/PR에 기록 |

구현 후보 commit, 병합 commit, 릴리스 tag가 가리키는 commit, Pages의 실제 publication source, 이 문서를 보존한 commit의 역할은 구분한다. 현재 공개 배포 source는 별도 HTTP 검증으로 확인한 `c1da5ea…`다. 문서 브랜치의 commit을 운영 배포 commit으로 소개하지 않는다. 문서 본문에 자기 자신의 최종 commit SHA를 미리 쓸 수는 없으므로, 본문에는 보존 브랜치를 적고 확정 문서 commit의 pin URL은 최종 답변/PR에서 제공한다.

### 이전 인계·릴리스와의 관계

- 처음 전달된 v1.32.1 인계 문서는 [0eaa23b의 HANDOFF-V1.32.1-2026-11-07.md](https://github.com/twoimo/bitcoin-cycle-atlas/blob/0eaa23bfe32d92a8a852f4120e9ac519f84c14a6/HANDOFF-V1.32.1-2026-11-07.md)이며, 브랜치는 `docs/handoff-v1.32.1-20261107`이다. 이 commit은 문서 checkpoint다.
- 당시 확인된 v1.32.1 운영 배포 source는 `12920009ec11d9ae50de67a383b44ee45f398681`이다. PR #64의 병합·릴리스·공개 배포는 이미 끝났으며 재구현하거나 이전 timeout 작업을 다시 기다릴 일이 아니다.
- 이번 작업 시작 시에는 후속 v1.32.2 source `bc3cd8c817ce0dbb856f50bad42a83b5ab4c51e4`와 그 뒤 자동 갱신 `5704a96e787e27f53e1ae44288673ee9f1c451eb`가 이미 존재했다. 구현은 최신 자동 갱신을 포함한 `5704a96`에서 시작했다.
- 작업 시작 시 별도로 확인한 공개 publication source도 `5704a96…`였고, manifest SHA256은 `87bb7c5c20346ed66fcd04661a9a3fc4c020d79389fd00c2e9fc5149a68d92bd`였다. 이는 **리디자인 전 공개 상태 기록**이며 v1.33.0 배포 완료값이 아니다.

## 2. 사용자 요청과 유지해야 할 계약

최초 요청은 인계 문서·AGENTS.md·design.md를 실제로 읽고 최신 main/릴리스/작업트리를 확인한 뒤, 남은 Hallmark WARN을 실제 소스와 화면에 근거해 점검하는 것이었다. 이후 사용자가 `https://github.com/nextlevelbuilder/ui-ux-pro-max-skill`을 적용해 “AI 느낌이 나지 않도록 전체적으로 리디자인”하라고 명시했다. 이 후속 요청이 이번 시각 개편의 범위 근거다.

다음 기능 및 의미는 계속 유지한다.

- 미국·한국·조건 실험·현금흐름 통합, RSI·부동산·테마의 공통 종목 검색과 차트 연결.
- 자산 비교의 섹터·표 구성과 BTC·ETH·HYPE 포함.
- 시장 분석·종목 차트·자산 비교·IPO·리서치 조작부를 실제 외곽 `.atlas-canvas-heading` 한 줄에 두는 구조. **이미 제거한 내부 도구 행을 복원하지 않는다.**
- 차트의 위·왼쪽·오른쪽·아래 네 외곽 영역, 원래 portal/control 소유권, 메뉴·iframe·검색의 focus/close/resize 동작.
- 스크롤바 표시 숨김과 원래 mouse/touch/keyboard 스크롤. 긴 표의 가로 스크롤과 sticky header/식별열.
- 기존 관측 수치, 계산식, 양수·음수·pending/forecast 의미, immutable 원장·연구 기록, replay, ztd-charts 적용 및 기존 색상별 금융 신호.
- 원본 Hallmark의 규칙·판정·baseline·입력 데이터·route inventory. 경고 수 감소 자체를 목표로 검사기를 약화하거나 원자료를 수정하지 않는다.
- 다른 세션 또는 자동 갱신에서 추가한 최신 파일. 이 세션의 시작점으로 무조건 reset/clean하지 않는다.

## 3. 실제 적용한 스킬과 디자인 결정

스킬 repository: https://github.com/nextlevelbuilder/ui-ux-pro-max-skill

실제 읽고 적용한 upstream revision: `b7d5353e0130feb8c5574ef1251f8a1db1873ccb`.

`SKILL.md`, `references/pro-rules.md`, `references/quick-reference.md`를 읽었다. 디자인 검색은 `financial analytics dashboard dense`, 이어 허용된 좁은 재검색 `trading platform dashboard`를 density 9 / variance 2로 수행했다. React stack 검색과 effect cleanup 관련 재검색도 기록되어 있다.

검색 결과의 **Minimalism & Swiss Style** 중 기능적인 grid, 숫자와 레이블의 계층, 절제된 효과, 명확한 키보드 focus를 채택했다. 함께 나온 Enterprise Gateway의 sales CTA·marketing hero·client logos는 현재 금융 작업 화면에 맞지 않아 사용하지 않았다. 검색 결과를 그대로 복사한 랜딩 페이지를 만들지 않았다.

최종 결정은 [MASTER.md](https://github.com/twoimo/bitcoin-cycle-atlas/blob/78f4673be1754400742afa3190a5cb3ad47f706e/design-system/bitcoin-cycle-atlas/MASTER.md)에, 구현·실패·보정 이력은 [redesign README](https://github.com/twoimo/bitcoin-cycle-atlas/blob/78f4673be1754400742afa3190a5cb3ad47f706e/docs/editorial-redesign-2026-11-07/README.md)에 있다. 다음 세션은 [AGENTS.md](https://github.com/twoimo/bitcoin-cycle-atlas/blob/78f4673be1754400742afa3190a5cb3ad47f706e/AGENTS.md)와 [design.md](https://github.com/twoimo/bitcoin-cycle-atlas/blob/78f4673be1754400742afa3190a5cb3ad47f706e/design.md)도 실제로 읽는다.

### 선택한 시각 체계

따뜻한 잉크색 작업 바탕, 종이색 글자, 제한적인 황동색 강조를 사용한다. 반복되는 둥근 카드를 줄이고 정렬·타이포그래피·구분선으로 차트, 원장, 문서의 계층을 만든다. 마케팅 문구, 장식용 hero, 그라데이션, 유리 효과, pill 모음, 장식 이미지를 넣지 않는다.

| 역할 | 값 |
| --- | --- |
| Canvas | `#111210` |
| Navigation | `#151613` |
| Surface / raised / hover | `#191b17` / `#22251f` / `#2b2f27` |
| Rule / quiet rule | `#3a3e34` / `#2a2e26` |
| Text / muted / subtle | `#edece5` / `#b9bdb0` / `#989f8e` |
| Accent / keyboard focus | `#d8b56d` / `#e8c990` |
| Replay 시작점 preview | 원래 파란색 `#8db2ff`, 별도 `--replay-picker` 역할 |

기존 Inter / Noto Sans KR / system fallback을 유지한다. 새 외부 폰트 또는 애니메이션 의존성은 추가하지 않았다. 브라우저 QA는 저장소에서 source-pinned한 Noto Sans CJK KR을 사용했다. 데이터는 tabular numerals, 보통 본문은 14–15px와 충분한 행간, 출처 prose는 72ch로 정리했다. 4px 간격 체계 및 모바일 주요 44px pointer target을 유지한다.

## 4. 구현 파일과 기술 경계

| 영역 | 구현과 중요한 이유 |
| --- | --- |
| `dist/editorial-system.css` | 공통 role token, 외곽 조작부, search, menu/dialog, focus를 정리한다. 별도 `--replay-picker` token과 실제 preview/date-label override도 이 파일에 있다. |
| `dist/editorial-panels.css` | 통합 React 패널 및 parent-document portal의 표시를 정리한다. parent와 React 모두 이 canonical CSS를 읽어야 한다. |
| `dist/editorial-ledgers.css` | 자산 비교, IPO, 리서치 index/reader의 표·문서 계층을 정리한다. |
| `apps/web/src/components/ztd-research-charts.tsx` | Compact 미국/한국 관측 차트의 실제 할당 높이를 ResizeObserver로 측정해 원래 ztd의 height prop에 전달한다. SVG를 CSS로 늘리지 않는다. |
| `dist/chart-replay.js` | cache import query 세 개만 갱신했다. 실제 blue preview role 수정은 `dist/editorial-system.css`에 있으며 replay controller·입력·자료·원본 blue assertion은 유지한다. |
| `dist/evidence-view.js` | 검색 결과가 비었을 때만 empty td의 `colSpan`을 실제 보이는 th 수에 맞춘다. 원래 render/resize 생명주기를 사용한다. |
| `scripts/build-standalone.mjs` | 새 CSS 세 개를 웹과 같은 순서로 standalone HTML에 inline한다. 미해결 resource를 거부하는 원래 검사는 유지한다. |
| 생성 자산·route wrapper·version query | 통상적인 `build:pages`로 v1.33.0 자산과 9개 generated route를 생성했다. hashed asset은 손으로 고치지 않는다. |

관측 차트 높이 변경은 데이터·scale 옵션·point/index mapping·gap splitting·interpolation·signed baseline을 바꾸지 않는다. 빈 상태→관측 상태, viewport 축소, 숨겨진 0높이, 짧은 viewport 최소 높이, observer cleanup을 실제 행동 테스트로 검증했다. 출처 disclosure는 원래 scroll owner 안에서 계속 펼칠 수 있다.

기존 explicit review-source/standalone stylesheet inventory에는 새 CSS 세 개를 정식으로 추가했다. 33개→36개 stylesheet를 각 한 번 검사하고 새 CSS 누락을 실제로 거부하는 검증을 유지한다. 연구 reader focus 테스트는 고정된 옛 버전 import 대신 현재 package 버전을 사용하도록 맞춰 실제 view와 같은 module instance를 검사한다. 행동 assertion은 약화하지 않았다.

기존 replay verifier를 다시 실행해 현재 source receipt만 갱신했다. controller, fixtures, negative controls 및 verifier는 그대로다. 이전 날짜의 증거를 지우지 않았다.

## 5. 자동 갱신 15개 파일 보존

자동 갱신 commit `5704a96…`의 실제 변경 목록은 GitHub commit metadata에서 확인했다. 로컬 checkout의 shallow 시작점을 `git show`하면 전체 snapshot을 갱신 목록처럼 출력할 수 있으므로 그 결과를 15개 목록으로 쓰지 않았다. 아래 15개 Git blob은 최종 `78f4673…`에서도 **모두 정확히 동일**하다.

| 파일 | 보존된 Git blob |
| --- | --- |
| `dist/data-update.js` | `ecf8e582aa7712fc374dc07462a4bb7b55e9d40d` |
| `dist/data/asset-comparison.json` | `4db8231ca2382cddf7edaa30df512fcfea27460c` |
| `dist/data/bmnr-ohlc.json` | `85f318948996d57d752a167f8af8a7a88d0aafda` |
| `dist/data/btc-daily.json` | `86bcaa53b3084b7d7034fcb8907826af5ac13693` |
| `dist/data/btc-ohlc.json` | `cab8fcf3e123d07f7b782769b80d13bc37b82cd2` |
| `dist/data/btc-volume.json` | `b09bd29f02746ea40d32290f7d373377b62a2e20` |
| `dist/data/cycle-calibration.json` | `803e6aac5e2baf055dd2d4b1ffd45b6c8961b0df` |
| `dist/data/eth-ohlc.json` | `00204055d4bcc30c52025aa0dbfb0dad63d03ea9` |
| `dist/data/forecast-ledger/evaluation.json` | `b58f566d8d8aac33c43b35a059679aca9bd136e5` |
| `dist/data/forecast-ledger/experiments.json` | `5ef5afc9a4652ed63a46f49065e4bed1c960b6b0` |
| `dist/data/forecast-ledger/index.json` | `d17ec08e9217418306eacbbca24e1d6fe043f66f` |
| `dist/data/judgment-snapshots/2026-11-07T055859692Z-b4fff604ee69.json` | `70901d41a8f209ecd7c474a6d041a15542ad667a` |
| `dist/data/judgment-snapshots/index.json` | `352a17535c5f72beb1348a5c5e6f9c7b3b1d9c06` |
| `dist/data/mstr-ohlc.json` | `897de6ebe5ff74b852031cfa2583cf0f11f7a697` |
| `dist/treasury-catalog.js` | `3ad333ef3439834d7456cbb54b6363db192b73d7` |

## 6. 완료된 로컬 검증과 실행 한계

다음 수치는 범위가 겹칠 수 있으므로 합산해 “전체 테스트 수”로 소개하지 않는다. 원본 전체 suite의 최종 2,579개 결과는 8절의 별도 CI 증거다.

| 검사 범위 | 확인 결과 |
| --- | --- |
| TypeScript | PASS |
| React market/panel + ztd | 20 PASS, 실패·skip 0 |
| Legacy toolbar + release notes + research focus | 15 PASS, 실패·skip 0 |
| 원본 offline replay/standalone | 5 PASS, 실패·skip 0 |
| Review-source inventory + standalone packaging | 37 PASS, 실패·skip 0 |
| 새 CSS 세 개 parsing | warning 0 |
| Pages build + byte-equality verification | PASS, generated routes 9개 |
| Static reference verification | PASS, files 799 / references 891 |
| 원본 bounded replay verification | PASS; 원본/복원 검사 유지, negative controls는 예상대로 실패 |
| 자동 갱신 15개 파일 | 위 Git blob 전부 보존 |

로컬 native Chrome은 process-singleton socket에서 `Operation not permitted`로 시작하지 못했다. 원본 local runner가 끝낸 case는 **0개**, screenshot도 **0개**다. 이를 통과로 기록하지 않았고 browser flags·harness·권한을 바꿔 결과를 꾸미지 않았다. 실제 브라우저 증거는 원래 GitHub PR workflow에서 얻었다.

## 7. 후보별 결과와 해결 이력 — 최종값과 섞지 말 것

### 첫 후보 `75e4a3c0ea55608bac0d28327fb60843d6a783cf`

- [CI 42354540045](https://github.com/twoimo/bitcoin-cycle-atlas/actions/runs/42354540045): failure. standalone builder에서 새 CSS 세 개를 inline하지 않아 원래 unresolved-resource 검사가 거부했다. 기존 inlining 목록에 세 CSS를 넣고 원본 offline 검증 5개를 다시 통과시켰다.
- [ETH candidate evidence 42354540009](https://github.com/twoimo/bitcoin-cycle-atlas/actions/runs/42354540009): 원본 Chrome 53개 중 50 PASS / 3 FAIL. 1440×900, 320×568, 900×430 BTC replay 시작점 preview가 새 focus 황동색을 상속했다. 별도 `--replay-picker: #8db2ff` 역할로 원래 파란 안내선·날짜 레이블을 복원했다. 색상 assertion은 변경하지 않았다. 이 실패한 run을 최종 53개 통과로 사용하지 않는다.
- [Hallmark 42354540033](https://github.com/twoimo/bitcoin-cycle-atlas/actions/runs/42354540033): static 6 FAIL / 3 REFLEX / 64 WARN, core render 0 / 0 / 10, workspace render 0 / 0 / 3. 실제 소스·화면 검증이 완료된 실패이며 timeout이 아니다.
- [Market service 42354540013](https://github.com/twoimo/bitcoin-cycle-atlas/actions/runs/42354540013): 통합 native 320/390/1440 세 case PASS.

정적 실패는 두 개의 반복 overlay paint literal을 공통 token으로 옮기고, 작은 metadata의 tracking을 제거하고, 새 padding 세 곳을 4px rhythm에 맞추어 해결했다. 출처 prose를 72ch로 정리했다. 남아 있던 직접 research search와 archive comparison의 청회색 control paint도 공통 role에 맞췄다. 수치·판정·checker·baseline을 바꾸지 않았다.

### 후속 후보 `b29fc7326a8f233d46f056d707c2daf92526f3a0`

- [Hallmark 42355931165](https://github.com/twoimo/bitcoin-cycle-atlas/actions/runs/42355931165)와 [Market service 42355931364](https://github.com/twoimo/bitcoin-cycle-atlas/actions/runs/42355931364)는 success.
- [CI 42355931217](https://github.com/twoimo/bitcoin-cycle-atlas/actions/runs/42355931217)와 [ETH evidence 42355931143](https://github.com/twoimo/bitcoin-cycle-atlas/actions/runs/42355931143)는 **cancelled**. 최종 수정으로 대체된 중간 실행이며 최종 suite 성공의 근거가 아니다. 다시 기다리지 않는다.
- 실제 320px 빈 연구 목록에서 CSS `calc`만으로는 제목 열이 좁아지는 문제가 해결되지 않았다. 숨긴 metadata 열 세 개와 empty cell의 `colspan=6`이 여분 표 track을 만들었다.
- 최종 `78f4673`은 기존 render/resize 중 실제 표시되는 th 수로 **empty cell만** colSpan을 맞추고 임시 CSS calc 보정을 제거했다. 이 마지막 변경은 `dist/evidence-view.js`, `dist/editorial-ledgers.css`, redesign README 세 파일뿐이다. React/system/generated React bytes는 b29f와 동일하다.

## 8. 최종 후보에서 완료된 원본 CI·Hallmark·Market 검증

최종 source: `78f4673be1754400742afa3190a5cb3ad47f706e`.

### 최종 네 workflow 링크

| Workflow | Run | 최종 확인 결과 |
| --- | --- | --- |
| CI | https://github.com/twoimo/bitcoin-cycle-atlas/actions/runs/42356303612 | success, 원본 전체 tests 2,579 / PASS 2,579 / FAIL 0 / SKIP 0 |
| ETH candidate evidence | https://github.com/twoimo/bitcoin-cycle-atlas/actions/runs/42356303579 | models/browser/evaluate 모두 success, 원본 native 53/53 PASS |
| Market lab service | https://github.com/twoimo/bitcoin-cycle-atlas/actions/runs/42356303582 | success, 통합 native 3/3 PASS |
| Hallmark design audit | https://github.com/twoimo/bitcoin-cycle-atlas/actions/runs/42356303623 | core/workspace 두 job success |

### 최종 CI의 source identity와 전체 테스트

CI run `42356303612`, verify job `128355087184`가 success다. 원본 `ATLAS_TEST_TOTAL` 집계는 tests 2,579 / pass 2,579 / fail 0 / skipped 0이다. 기존 수치·형식·packaging 검증을 포함한 job이 PASS했다.

이 CI가 checkout한 commit은 PR head 자체가 아니라 GitHub의 **PR 검증용 merge commit** `2152b170221dae2419c78041acdfb03d40a30e59`다. GitHub API에서 parents가 main `5704a96e787e27f53e1ae44288673ee9f1c451eb` 및 head `78f4673be1754400742afa3190a5cb3ad47f706e`이며, tree가 `83a695e31f64b118122f2e671175a7013eca7e9e`로 최종 head tree와 정확히 같음을 확인했다. 따라서 검증한 파일 내용은 최종 구현 후보와 같지만, **이 임시 merge ref를 실제 PR 병합·main 반영·운영 배포가 끝난 증거로 사용하지 않는다.** 실제 병합 및 운영 commit `c1da5ea…`와 해당 main CI·Pages 결과는 10절의 별도 기록으로 확인한다.

### Hallmark의 최종 독립 수치

| 범위 | FAIL | REFLEX | WARN |
| --- | ---: | ---: | ---: |
| Current static, 49 files | 0 | 0 | **60** |
| Current core render, 기존 8 routes | 0 | 0 | **10** |
| Current workspace render, 통합 10 routes | 0 | 0 | **3** |

**최종 결과는 static 60 / core render 10 / workspace render 3으로 각각 기록한다. 두 suite가 반복 검사한 static 60개는 한 번만 센다.** 각 원본 report 안의 source/generated file 구분을 임의로 지워 수치를 줄이지 않았다. 예전 인계의 static 32 / render 10 / render 2, 더 오래된 38 WARN, 첫 후보의 static64와 혼동하지 않는다. WARN은 모두 실제 결함이라는 뜻도, 모두 해결했다는 뜻도 아니다.

원본 upstream은 Hallmark v2.0.0 `7ec868225c6caa040558c321ee0fefa0e73f83a8`다. 저장소의 원본 `sloplint.mjs` Git blob은 `9916fa07286e58d319528ad7cfe4ad94318e5796`, `sloplint-render.mjs`는 `0ecc64bc79aa34db1fadc7178617bcc53c47e064`이며 그대로다. 기존 CI용 launch/readiness build-copy compatibility 경로는 유지했고 새 판정 우회는 넣지 않았다.

Core baseline은 `0c1ed40e1b9b6c76f5621d087737dc57f174b51e`, workspace baseline은 `3b6373906dbdd3ef321db31deaf8a8f785da61c3`다. 두 receipt 모두 sourceReadOnly의 current/baseline/gitBlobsMatched가 true, integrity 오류 0, design/integrity gate PASS, exit code 0이다.

- Core: before/current 각각 8 route ready, PNG 40개씩.
- Workspace: before/current 각각 10 route ready, PNG 50개씩. Current toolbar와 실제 child content가 준비된 뒤 캡처했다.
- Workspace ZIP digest, report 네 개의 SHA, receipt에 등록된 before/current desktop/mobile review PNG 40개의 SHA를 직접 대조했다.
- 두 suite의 QA 폰트는 Noto Sans CJK KR, source commit `f8d157532fbfaeda587e826d4cd5b21a49186f7c`, Git blob `dc4a7c65e6f450bf17c10a2405250b620eb78703`이다.

통합 render의 WARN 3개는 F3(display heading의 balance), F7(공통 dialog recipe), kept(`11.06` figure token)이다. `11.06`은 baseline 첫 market-us parent body 인벤토리에만 기록된 BTC 날짜 토큰이며 그 baseline 실제 시장 screenshot에도 보이지 않았다. 현재 시장 관측일과 수치 소실은 확인되지 않았다. 이 WARN을 없애려고 숨겨진 날짜·stamp·더미 숫자를 추가하지 않았다.

### Artifact 식별자와 임시 보관 위치

모두 `/workspace/scratch/38e7cf6c7262/atlas-redesign/` 아래 상대 경로다. 임시 build 폴더와 GitHub 만료성 artifact만을 영구 인계 위치로 삼지 않는다.

| 증거 | Artifact / SHA256 / 경로 |
| --- | --- |
| 최종 core Hallmark | `13567607879` / `1ff731cbbddef47b7367ff462b511bb81632e0d891b5942c5bd331c70dc962a3` / `build/ci-78f4/hallmark-core/` |
| 최종 workspace Hallmark | `13567428163` / `e244dd3c17c935eb75cd399a49e788e18f8280dc667552302cef11c1d6425a3f` / `build/ci-78f4/hallmark-workspaces/` |
| 최종 native Market workspace | `13566979657` / `918397eb80c6c216ef9cb204c0fa3c1678167a7375944ad4b8bf822c457dc860` / `build/ci-78f4/market-workspaces/` |
| 비교용 b29f workspace | `build/ci-b29f/hallmark-workspaces/` |
| 첫 후보 실패 증거 | `build/ci-75e4/` — 최종 성공과 분리 |

최종 Market artifact는 ZIP digest, 27개 PNG, 113개 source hash를 실제 source와 대조했다. 320/390/1440 세 case 모두 PASS이며 runtime/unexpected resource error가 없다. 각 상태의 visible toolbar host는 하나, duplicate row는 없고 parent/child document width는 각 viewport 폭과 일치한다. 모바일 scroll owner는 scrollbar paint none을 유지한다.

### 최종 ETH·리플레이 증거 대조

원본 53개 명세·순서와 모두 일치하며 371 PNG 전부 bytes/SHA256 일치, 누락·추가 0이다. 113개 source hash, 실행 중 sourceIntegrity, 새 CSS 3개 별도 SHA 및 synthetic fixture도 일치한다. 모델 출력 396개, producer ZIP의 모델397개/browser448개 파일이 최종 candidate에 바이트 그대로 보존됐다. Joined receipt는 source78f4/tree83a695e/run42356303579/attempt1과 producer artifact13567439854/13567899406에 정확히 묶인다.

최종 candidate artifact13568241734는 118,136,785 bytes이며 GitHub digest와 일치한다. source-book108,324,090 bytes, 항목902개(Git source551/evidence351), 분할602개 모두 대조했고 unresolved imports는0이다. 외부 모델 리뷰와 새 금융 모델 채택은 수행하거나 통과로 주장하지 않는다. 기존 omitted-by-user 및 모델별 미충족 상태를 유지한다.

BTC 시작점 preview는 1440×900, 320×568, 900×430 세 case 모두 PASS이며 기록된 guide stroke는 `rgb(141, 178, 255)`다. 원본 blue assertion을 유지한 결과다.

## 9. 실제 시각 검토의 범위와 증거 연결

b29f에서 다음 **20개 desktop/mobile 화면**을 직접 보았다.

- React 14장: 미국, 한국, 조건 실험, 현금흐름, RSI/TQQQ, 주택/서울, 테마/HYPE 각각 1440×900 및 375px.
- Legacy 통합 6장: 자산 비교, IPO, 리서치 각각 1440×900 및 375px.

최종78f4 current의 이 20개 PNG는 b29f PNG와 **모두 SHA256까지 동일**하다. 따라서 이미 완료한 실제 시각 검토를 보존하고 동일 그림을 반복 검사하지 않았다. 시장 차트의 viewport 높이/출처, 한 줄 외곽 toolbar, 조건·현금흐름 2열→1열, RSI 가격/오실레이터 할당, 주택 축·범례, 테마의 오른쪽 근거 열→모바일 하단 문서 흐름을 확인했다. 실제로 확인하지 않은 dialog를 URL-only screenshot이 검증했다고 주장하지 않는다.

영향받는 최종 empty 상태는 별도로 확인했다.

- 최종 native **320px research-empty**: 담당 root가 실제 그림을 확인했다. 표 header 한 줄과 empty 안내의 전체 폭이 정상이다.
- 최종 native **390px research-empty**: 별도 담당이 실제 그림을 확인했다. 순서·자료 제목·근거가 정상 분산되며 안내가 전체 표 폭을 사용하고 툴바·하단행과 겹치지 않는다.
- 해당 PNG: `build/ci-78f4/market-workspaces/workspace-consolidated-{320,390}-research-empty.png`.

추가로 앞선 native 1440/320 조건 실험·현금흐름·TQQQ·주택·HYPE 10장을 실제 검토했다. 원본 전체기간 RSI 표식의 좁은 화면 밀집을 새 데이터 결함으로 바꾸어 설명하지 않았다. 화면 검토와 native 상호작용 receipt는 역할을 구분해 보존한다. 이 절의 좁은 화면 증거는 최종 source를 실행한 CI Chrome의 320/390px viewport 검증이며, 공개 모바일 사이트 재검증이나 물리 모바일 기기 검증을 뜻하지 않는다.

## 10. 최종 검증·릴리스·공개 배포와 인계 기록

### A. 최종 전체 검증 — 완료

- CI run `42356303612` / verify `128355087184`: success, tests 2,579 / PASS 2,579 / FAIL 0 / SKIP 0. Checkout은 검증용 merge commit `2152b170…`, tree는 head78f4와 동일한 `83a695e…`다.
- ETH evidence run `42356303579`: models/browser/evaluate 모두 success. 원본 Chrome 53/53 PASS, 371개 PNG와 113개 source hash 및 replay 시작점의 원래 파란색을 대조했다. 구체적인 producer/candidate artifact와 source-book 검증 범위는 8절 그대로다.
- `browser-artifact-verification.json`, `joined-artifact-verification.json`, `producer-zip-preservation.json` 등 실제 검증 기록은 [proof 폴더](docs/editorial-redesign-2026-11-07/proof/README.md)에 보존했다. 실패한75e4의50/53 또는 cancelled b29f를 최종 성공에 합산하지 않았다.

### B. PR 병합과 릴리스 — 완료

PR #66의 실제 merge commit은 **`c1da5ea5f5109315f8dd65ea8229e47948ba4b2f`**다. tree는 최종 검증한78f4와 같은 `83a695e31f64b118122f2e671175a7013eca7e9e`이며, 5절의 자동 갱신15개 파일을 포함한 파일 내용이 유지된다.

[Main CI run 42357801078](https://github.com/twoimo/bitcoin-cycle-atlas/actions/runs/42357801078), verify job `128359630100`이 이 실제 main source에서 success다. 전체 tests 2,579 / PASS 2,579 / FAIL 0 / SKIP 0이며, PR 검증용 merge ref에서 실행한 CI와 별도로 기록한다.

[v1.33.0 릴리스](https://github.com/twoimo/bitcoin-cycle-atlas/releases/tag/v1.33.0)는 release ID `437458830`, tag `refs/tags/v1.33.0`이며 tag가 실제 merge commit `c1da5ea…`를 가리킨다. [Release run 42357801009](https://github.com/twoimo/bitcoin-cycle-atlas/actions/runs/42357801009)는 success이고 공개 시각은 **2026-11-07 09:06:51 UTC / 18:06:51 KST**다. Draft/prerelease가 아니며 assets 13개가 uploaded 상태다.

`release-review.json`과 `release-api-evidence.json`에 tag/workflow/release identity와 범위를 보존했다. 체크섬 목록의12개 항목은 GitHub asset digest와 모두 일치한다. `SHA256SUMS.txt`, `RELEASE_METADATA.json`, `PUBLICATION_MANIFEST.json` 세 파일을 실제 다운로드해 byte/digest를 확인했다. 큰 ZIP/HTML 등 나머지 release asset을 전부 다운로드했다고 주장하지 않는다.

Release publication의 contentDigest는 아래 Pages와 같지만, 실행 시각·workflow metadata가 달라 manifest hash는 별개다. Release manifest의 self-checksum은 `653d0f56745cf7ef14e4449511d3bdbfedd24b015fb40a82526b2e9b9f8ebad0`, 다운로드한 파일 전체 SHA256은 `4d432292f0f00ae8d224340a676b4840087df60dcd8310d58d6dc28d612ef548`다. 이를 Pages manifest 값으로 바꿔 쓰지 않는다. 이미 공개된 tag를 다시 만들거나 이동할 이유가 없다.

### C. Pages·HTTP·공개 desktop CUA — 완료

[Pages run 42357800987](https://github.com/twoimo/bitcoin-cycle-atlas/actions/runs/42357800987)의 build job `128359629624`와 deploy job `128362163663`이 모두 success다. 실제 publication source는 `c1da5ea5f5109315f8dd65ea8229e47948ba4b2f`이며, source tree는 `83a695e31f64b118122f2e671175a7013eca7e9e`다.

| 공개 publication 항목 | 확인값 |
| --- | --- |
| Pages manifest SHA256 | `e7fd6150374f9c6f74dc2bea742d5aa44be386b1f1c5274450eb91515b017b2f` |
| Content / validated / served digest | `23e5dbb90404ef5cd6dc1a2ff773a6f57f131e937baa6fb53b179b705327245c` |
| 원본 served checker confirmed 시각 | 2026-11-07 09:11:51 UTC / 18:11:51 KST |
| 추가 HTTP 대조 완료 시각 | 2026-11-07 09:13:23.126 UTC / 18:13:23.126 KST |
| 실제 다운로드해 확인한 서로 다른 공개 파일 | **20개** — 원본4개 + 추가16개 |

원본 served checker는 publication identity와 `index.html`, `site-entry.js`, `data/btc-daily.json`, `data/forecast-ledger/index.json` 네 응답을 확인했다. 추가16개는 새 CSS3개, `evidence-view.js`, React app entry·JS·CSS3개, generated route wrapper9개다. 각 추가 응답은 c1의 Git blob 및 publication manifest의 SHA/bytes와 일치했다. `publication-served.json`은 PASS다. 전체799개 공개 파일의 HTTP body를 모두 다운로드한 검증으로 확대해 말하지 않는다.

`public-ui-review.json`은 **PASS**, 확인 시각은 **2026-11-07 09:17:33.657 UTC / 18:17:33.657 KST**다. 실제 공개 URL `https://twoimo.github.io/bitcoin-cycle-atlas/market-lab/`, desktop Chrome viewport **1363×936**에서 다음6개 흐름을 확인했다.

| 공개 조작 | 실제 확인 |
| --- | --- |
| 미국 진단 summary | 방향 및 alpha/beta/gamma 자료를 열고 정상적으로 닫음 |
| 공통 종목 검색 | TQQQ 결과1개, Enter로 `/market-lab/charts/?symbol=TQQQ` 이동,4,206개 관측 표시 |
| 자산 비교 섹터 필터 | 디지털 자산 선택 시20개 중3개, BTC·ETH·HYPE 표시 |
| IPO 달력 도구 | 이번 달/전체 목록 메뉴 열기 및 닫기 |
| 리서치 reader | MSTR OHLC 글 열기, 닫은 후 원래 행의 버튼으로 focus 복귀 |
| 리서치 empty query | 보이는6개 열에 맞는 `colSpan=6`, 안내 셀과 표의 폭이 모두1,281px, 확인 후 검색어 해제 |

공개 페이지는 새 CSS3개를 `?v=1.33.0`으로, React는 `index-DtytQ06P.js`를 실제 로드했다. 한 개의 보이는 외곽 toolbar 높이는43px이고 실제 차트 SVG는 **1,225×727**, viewBox도 같은 크기다. Root dark roles `#111210` / surface `#191b17` / accent `#d8b56d` / muted `#b9bdb0`를 확인했다. 선택된 시장 분석·리서치 navigation의 실제 computed foreground/background는 `rgb(216,181,109)` / `rgb(45,42,33)`, 대비는 **7.3393737643:1**이다.

실제 공개 화면2장 `public-market-c1da5ea.jpg`(79,188bytes), `public-research-c1da5ea.jpg`(98,072bytes)를 `docs/editorial-redesign-2026-11-07/`에 보존했다. 공개 UI와 exact source의 연결은 별도 `publication-served.json`의 HTTP byte 대조가 담당한다. 선택한 공개 controls와 navigation 대비를 확인한 것이며, 모든 state의 접근성 적합성을 선언하지 않는다. 모바일은 9절의 최종 native320/390 증거와 분리한다. 공개 모바일 재검증 또는 물리 모바일 기기 검증은 수행했다고 쓰지 않는다.

### D. 문서 checkpoint의 영구 보존 — 운영 배포와 별도

이 파일과 [proof README](docs/editorial-redesign-2026-11-07/proof/README.md), 원본 receipt/report, 별도 감사 기록, 선별 PNG와 공개 JPEG를 `docs/handoff-v1.33.0-20261107`에 보존한다. 이 문서 checkpoint는 실제 운영 commit `c1da5ea5f5109315f8dd65ea8229e47948ba4b2f`를 parent로 가지며 main에 추가 제품 변경을 넣지 않는다.

보존 대상은 원본 final core/workspace receipt·report, native source/hash 검증 기록, 최종320/390 research-empty, release/Pages/HTTP 증거와 실제 공개 CUA 기록이다. 원본 전체 PNG/대용량 artifact는 exact run의 artifacts 및 로컬 build 폴더에 있고, 이번 docs checkpoint에는 명시한 선별 증거만 들어간다. 파일별 의미와 한계는 proof README에 기록했다.

본문에는 보존 브랜치를 기록하고, 최종 답변/PR에는 확정 문서 commit의 pin URL을 제공한다. **이 문서를 저장한 commit은 문서 checkpoint이며, 실제 운영 source `c1da5ea…`를 대체하지 않는다.**

## 11. 다음 세션의 시작 순서

1. 이 인계 문서의 완료 범위와 보존 상태를 읽고 AGENTS.md, design.md, MASTER.md 및 redesign README를 실제로 읽는다.
2. 현재 main, PR, tag/release, Pages publication metadata, 작업트리의 변경 상태를 확인한다. 이 문서의 commit을 최신 main이라고 가정하지 않는다.
3. 새 자동 갱신·다른 세션의 변경을 보존한다. 기존 폴더가 없다면 GitHub의 pin된 문서와 최신 source를 열어 확인한다.
4. 완료된 v1.32.1 통합과 v1.33.0 디자인을 다시 구현하거나 내부 toolbar를 복원하지 않는다. 완료·취소된 옛 workflow를 다시 기다리지 않는다.
5. 현재 경고를 추가로 다룰 때는 원본 source와 실제 화면을 먼저 확인하고 실제 문제만 수정한다. 경고 개수, 검사기 판정, 데이터, baseline을 바꾸어 결과를 낮추지 않는다.
6. 숫자·원장·replay·ztd·focus·scroll 계약을 유지하며 변경 범위에 필요한 검증만 수행한다. 완료 후 새 source와 운영 배포 source를 다시 분리해 기록한다.
