# v1.32.2 · Hallmark WARN 점검과 리서치 초점 복귀

> 기록 보관 · 2026-11-07(Asia/Seoul): Hallmark는 사용자의 최신 지시로 종료됐다. 아래 계획·검증 범위·판정은 해당 과거 소스의 기록이며 현재 실행 지시나 릴리스 조건이 아니다. 현재 디자인 기준은 저장소의 `AGENTS.md`, `design.md`와 디자인 마스터를 따른다. 원본 결과와 수치는 당시 사실로 보존한다.

## 출발점과 보존 범위

작업 시작 시 아래 인계 문서, 저장소 `AGENTS.md`, `design.md`를 읽고 원격 main·릴리스·기존 작업트리를 확인했다. 기존 작업트리를 수정하지 않고 최신 main에서 별도 작업 브랜치를 만들었다. 병합 전에는 main을 다시 확인하여 다른 세션·자동 갱신의 변경을 보존한다.

| 식별자 | 역할 |
| --- | --- |
| `0eaa23bfe32d92a8a852f4120e9ac519f84c14a6` | [인계 문서 체크포인트](https://github.com/twoimo/bitcoin-cycle-atlas/blob/0eaa23bfe32d92a8a852f4120e9ac519f84c14a6/HANDOFF-V1.32.1-2026-11-07.md), 제품 배포 커밋과 다름 |
| `12920009ec11d9ae50de67a383b44ee45f398681` | 작업 시작 시 확인한 main·v1.32.1 tag·운영 배포 커밋 |
| `4ea8ea46b744fda7d79e857b2c772021226f2b5d` | PR #64의 최종 검증 후보. v1.32.1 배포와 같은 제품 tree |
| `2e4c818f4d1c1d404b0d207e8565cf27e58fdd17` | 위 최종 후보와 배포 커밋의 Git tree |

v1.32.1 / PR #64의 병합·릴리스·배포는 완료된 상태였다. 이전 timeout 실행을 재개하거나 완료된 상단 통합을 다시 구현하지 않았다. 이번 패치의 기능 변경은 리서치 목록과 글 읽기 창의 초점 처리에 한정한다.

가격·모델 수치·원장·리플레이·연구 본문과 원문·ztd-charts의 적용 및 라이선스는 변경하지 않는다. 시작 시 `dist/data`의 tree는 `83d119faf64c758736afb5236c5848cb07252dfc`다. 숨김 스크롤바의 기존 스크롤 기능과 한 줄 외곽 조작부도 유지한다.

제품 버전과 변경 모듈의 진입 캐시 키는 1.32.2로 맞춘다. 기존 replay UI 검사가 package 버전과 dependency URL의 일치를 요구하므로 replay 모듈·그 진입점에도 import의 `?v=`만 동기화했다. 이 부분은 쿼리 값을 제외하면 기존 소스와 동일하며, replay state·snapshot·forecast 엔진의 본문과 원래 테스트 기준은 변경하지 않았다. Pages 하위 경로의 HTML은 기존 생성기로 갱신했다.

## 원본 경고의 정확한 기준

아래 수치는 [v1.32.1 최종 Hallmark 실행 42268286682](https://github.com/twoimo/bitcoin-cycle-atlas/actions/runs/42268286682)의 **current** JSON·receipt·PNG를 다시 읽은 결과다. 새 패치의 검사 결과를 미리 통과로 기록한 수치가 아니다.

| 단계 | FAIL | REFLEX | WARN | 구분 |
| --- | ---: | ---: | ---: | --- |
| 전체 static | 0 | 0 | 32 | 두 suite의 `findings` 배열 32개가 완전히 동일. 한 번만 집계 |
| 기존 8개 화면 render | 0 | 0 | 10 | core의 current-render |
| 통합 10개 화면 render | 0 | 0 | 2 | workspaces의 current-render |

render의 F3·F7은 CSS 입력에서 나온 동일 성격의 지적이므로 위 단계별 숫자를 고유 결함 수로 해석하지 않는다. 예전 문서의 38 WARN은 이전 `04d98bfa…` 실행 기록이다. 이번 기준의 32/10/2와 섞지 않는다.

당시 원본 Hallmark v2.0.0 / `7ec868225c6caa040558c321ee0fefa0e73f83a8`, core baseline `0c1ed40e1b9b6c76f5621d087737dc57f174b51e`, workspace baseline `3b6373906dbdd3ef321db31deaf8a8f785da61c3`를 유지했다. checker·severity·stamp·waiver·검사 범위·검사 대상 자료를 바꾸어 경고를 없애지 않았다.

기준 receipt의 `stdoutSha256`:

| suite / 단계 | SHA-256 |
| --- | --- |
| core / current-static | `d34abac53adc78ce00f4e76114e74a3c896def6299ea7490e43382e10ac59ed9` |
| core / current-render | `c5d378d2d0241cf77ec21ab6adbc4074fc0f060ec3c03ea3f84d95e56fb329c9` |
| workspaces / current-static | `aab75ef53c782a9c64436200e9829e36fdb6cfed67b034af90389907c4ceec1e` |
| workspaces / current-render | `53dcb8378337656e710520fbf1bb7a73c82f6b69673ee598b0a673c247770543` |

static의 전체 stdout hash는 baseline별 kept 요약이 달라 서로 다르다. 실제 경고 배열이 같다는 것과 모순되지 않는다.

## 경고를 실제 화면과 대조한 결과

정적 32개는 contrast gate 40의 5개, 공통 container recipe F7의 26개, 검색 popover의 border/shadow F24의 1개다. 상세 소스 근거와 판단 한계는 [정적 경고 검토](static-review.md)에 기록한다.

기존 render 10개는 F3 1개, F7 1개, F19 2개, F25 4개, kept 2개다. 통합 render 2개는 F3·F7이다. 공통 버튼·대화상자의 통일된 스타일, 네 종류 글자 굵기, 제목의 `text-wrap: balance` 부재는 실제 역할·폭·내용과 함께 검토해야 한다. 원본 화면과 운영 화면에서 재현되지 않은 결함을 추정하여 전역 스타일을 다시 설계하지 않았다.

F25의 네 항목은 다음과 같이 확인했다.

| 원본 항목 | 소스·화면 근거 | 이번 판단 |
| --- | --- | --- |
| compare 375px: 12개 열이 첫 화면 밖 | 원본 PNG와 `prepareStructureScrollRegions()`의 focusable region·가로 스크롤 이름, `compact.css`의 고정 첫 열을 확인 | 첫 화면 밖의 열 수를 데이터 삭제로 간주하지 않음 |
| data 375px: 4개 열이 첫 화면 밖 | 원본 PNG와 운영 320×740 미리보기에서 가로 이동 버튼·키보드·고정 종목 열 확인 | 오른쪽 지표에 실제 접근 가능 |
| evidence 375px: 데스크톱의 95개 단어가 숨겨짐 | 모바일 목록은 제목·종목·읽기 동작을 남기고, 글 읽기 창에서 전체 제목·저자·발행처·날짜·분류·출처를 제공. 390×844와 320×740에서 확인 | 정보 접근은 유지. 읽기 창을 닫을 때의 초점 유실은 별도 실제 결함으로 수정 |
| BTC 375px: 7개 열이 첫 화면 밖 | 원본 PNG와 `cycle-period-comparison.js`의 `.cycle-comparison-scroll` 명명·초점 region·상세 보기 경로를 확인 | 가로 표 구조를 없애거나 수치를 줄이지 않음 |

운영 자산 비교의 구체적 관측: 320px 미리보기에서 `#asset-table-scroll`은 clientWidth 266px, scrollWidth 698px였다. `가격·판단 →` 버튼을 누르면 scrollLeft가 0에서 최대값 432px로 이동하고, 종목 식별 열을 유지한 채 등락률·판단 열이 표시됐다. 이어 ArrowLeft 입력으로 scrollLeft 422px를 관측했고 해당 region에 2px 실선 초점 표시가 남았다. 스크롤바를 다시 표시하지 않고도 실제 조작 가능함을 확인한 것이다.

kept의 과거 제목·수치·시각은 고정된 옛 baseline과 현재 자료의 차이다. 경고를 줄이기 위해 옛 가격·타임스탬프를 되돌리거나 문서용 예외 stamp를 추가하지 않았다.

## 확인된 결함과 수정

운영 v1.32.1의 모바일 미리보기에서 다음 동작으로 초점 유실을 재현했다.

1. 390×844 리서치 목록에서 `MSTR 미래 경로는 어떤 식으로 계산하는가`의 제목 버튼으로 글을 연다.
2. 읽기 창을 연 채 320×740으로 크기를 바꾼다.
3. `연구 글 닫기`를 누른다.
4. 초점이 원래 자료의 버튼이 아닌 문서 AXWebArea에 남는다.

원인은 `evidence-view.js`가 resize 때 목록 tbody를 다시 만들면서 열기 버튼 DOM을 교체하지만, `research-reader.js`는 최초 버튼이 여전히 연결돼 있을 때만 그 노드에 초점을 돌리는 데 있었다. 좁거나 짧은 화면에서는 해당 자료 자체가 현재 페이지에서 빠질 수도 있다.

수정은 자료 ID와 처음 사용한 동작(제목 / 요약과 검토)을 기준으로 현재 목록의 버튼을 찾는다. 필요한 경우 해당 자료가 보이는 목록 위치를 복원하며 검색·종목·분류 선택을 유지한다. 관련 글을 읽어도 최초 진입점을 보존하고, 다른 화면이나 대화상자가 활성화된 경우에는 초점을 가져오지 않는다. 닫기 직후 예약된 resize 렌더가 실행돼도 복원한 목록 초점이 유지되도록 처리한다.

## 검증 및 릴리스 판정

이 패치의 로컬 검증 결과:

| 검사 | 결과 |
| --- | --- |
| Canonical Linux x64 / Node v24.22.2 전체 테스트 | 2,579개 통과, 실패·취소·skip 0 |
| 연구 reader·원문 reader·dialog viewport 집중 검사 | 24개 통과, 새 초점 회귀 8개 포함 |
| 정적 파일·참조 검사 | 파일 796개 / 참조 861개 통과 |
| Pages 생성물 일치 검사 | 생성 파일 12개 / 경로 9개 일치 |
| 변경 경계 | `dist/data`, `research-data`, `packages/domain`, `tools/hallmark`, 기존 workflow 변경 없음 |

DOM 회귀 검사는 노드 교체, 짧은 화면에서 자료가 빠진 경우, 제목/본문 동작 구분, 관련 글 탐색, 비활성 화면·다른 대화상자, 후속 resize를 확인한다. `scripts/verify-workspace-browser.mjs`의 기존 evidence 케이스에는 실제 Chrome 입력으로 아래 회귀를 추가한다.

- 현재 페이지의 마지막 자료를 제목 버튼과 요약 버튼에서 각각 연다.
- 320×430으로 축소한 뒤 원래 행이 실제로 목록에서 제거됐는지 먼저 확인한다.
- Escape로 닫고 같은 자료의 같은 동작에 초점이 복귀하는지 확인한다.
- 필터 값, 표시 페이지, 가시 영역, 키보드 초점 테두리를 확인한다.
- 원래 viewport로 복귀하여 행 수가 늘어난 재렌더를 기다린 뒤 초점이 유지되는지 확인한다.

당시 검증 범위는 기존 53개 Chrome case inventory와 두 Hallmark suite였다. 로컬에는 Chrome 실행 파일이 없으므로 로컬 렌더 검사를 통과했다고 기록하지 않는다. 실제 렌더·네이티브 입력의 판정은 이 변경의 PR head에 대한 새 CI 실행과 공개 배포 뒤 실화면 확인을 따른다. 이전 버전의 통과를 새 패치의 통과로 재사용하지 않는다.

최종 병합·Release·Pages는 각각 실제 커밋과 manifest를 대조하며, 인계 문서 커밋이나 PR 후보를 운영 배포 커밋으로 기록하지 않는다. 현재 소스의 최종 결과와 실행 링크는 해당 PR 및 릴리스 기록을 따른다.
