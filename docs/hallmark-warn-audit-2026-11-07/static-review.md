# v1.32.1 Hallmark static WARN 소스 감사

## 범위와 결론

이 기록은 v1.32.1 최종 원본 출력의 **static 32 WARN**을 실제 소스와 대조한 감사다. 검사기·판정·등급·데이터·색상은 변경하지 않았다. 정적 경고만으로 화면 결함이나 해결을 선언하지 않으며, 현재 화면의 상호작용 검토와 확인된 수정은 [종합 감사 기록](README.md)에 따로 기록한다.

- 인계 문서 커밋: `0eaa23bfe32d92a8a852f4120e9ac519f84c14a6`.
- 최종 Hallmark receipt의 검사 대상 PR head: `4ea8ea46b744fda7d79e857b2c772021226f2b5d`.
- 감사 시작 시 확인한 main·v1.32.1·공개 배포 기준: `12920009ec11d9ae50de67a383b44ee45f398681`.
- 원본 실행: [Hallmark CI 42268286682](https://github.com/twoimo/bitcoin-cycle-atlas/actions/runs/42268286682).
- 적용 기준: 저장소 `AGENTS.md`, `design.md`, [인계 문서](https://github.com/twoimo/bitcoin-cycle-atlas/blob/0eaa23bfe32d92a8a852f4120e9ac519f84c14a6/HANDOFF-V1.32.1-2026-11-07.md).

인계 문서의 커밋을 운영 배포 커밋으로 사용하지 않았다. 이전 `docs/toolbar-consolidation-2026-11-07/hallmark-triage.md`의 **28 static + 10 render = 38**은 이전 실행 기록이다. 그 수치를 이번 최종 기준에 합치거나 현재 결과로 대체하지 않는다.

## 원본 결과와 중복 집계

| 검사 | FAIL | REFLEX | WARN | 원본 출력 |
| --- | ---: | ---: | ---: | --- |
| Core static | 0 | 0 | 32 | `core/reports/current-static.stdout.json` |
| Workspaces static | 0 | 0 | 32 | `workspaces/reports/current-static.stdout.json` |
| 기존 8개 화면 render | 0 | 0 | 10 | `core/reports/current-render.stdout.json` |
| 통합 10개 화면 render | 0 | 0 | 2 | `workspaces/reports/current-render.stdout.json` |

두 static JSON의 `findings` 배열은 내용과 순서까지 동일하다. `summary.kept`는 각 suite의 비교 기준에 따라 다르므로 전체 JSON 파일의 SHA-256은 서로 다르다. **static 32는 한 번만 집계하며, 결과는 static 32 + 기존 화면 render 10 + 통합 화면 render 2로 기록한다.** 생성 bundle과 원본 CSS가 하나의 static 결과 안에서 별도 finding으로 잡힌 항목은 원본의 32개 목록 그대로 보존한다.

| 원본 파일 | SHA-256 |
| --- | --- |
| Core static | `d34abac53adc78ce00f4e76114e74a3c896def6299ea7490e43382e10ac59ed9` |
| Workspaces static | `aab75ef53c782a9c64436200e9829e36fdb6cfed67b034af90389907c4ceec1e` |
| Core render | `c5d378d2d0241cf77ec21ab6adbc4074fc0f060ec3c03ea3f84d95e56fb329c9` |
| Workspaces render | `53dcb8378337656e710520fbf1bb7a73c82f6b69673ee598b0a673c247770543` |

확인한 로컬 원본 보관 위치는 `build/consolidation/hallmark-4ea8ea/`이며 각 suite의 `reports/`와 `receipt.json`, `core.zip`, `workspaces.zip`을 대조했다. 해당 build 경로는 원본 작업 폴더의 무시된 검증 산출물이다. 재현·추적의 지속 참조는 위 CI 실행과 SHA-256을 사용한다.

두 receipt 모두 `sourceReadOnly.current`, `sourceReadOnly.baseline`, `sourceReadOnly.gitBlobsMatched`가 `true`이며 `integrityGate.status`는 `pass`, `errors`는 `0`이다. 도구는 Hallmark 2.0.0 / upstream `7ec868225c6caa040558c321ee0fefa0e73f83a8`이며 원본 static checker blob은 `9916fa07286e58d319528ad7cfe4ad94318e5796`, 원본 render checker blob은 `0ecc64bc79aa34db1fadc7178617bcc53c47e064`이다. 기존 CI 시작·readiness 호환 처리는 receipt에 기록되어 있고, 이번 감사에서 이를 수정하지 않았다.

## Gate 40: 대비 5 WARN

| 원본 위치 | 선택자 | 원본 정적 판정 |
| --- | --- | --- |
| `dist/lab.css:6` | `.lab-error` | `3.02:1 < 4.5:1` |
| `dist/styles.css:9` | `dialog code` | `3.43:1 < 4.5:1` |
| `dist/styles.css:9` | `dialog .method-formula` | `3.43:1 < 4.5:1` |
| `dist/market-lab/app/assets/index-Dv1ycdgu.css:3` | `dialog code` | `3.43:1 < 4.5:1` |
| `dist/market-lab/app/assets/index-Dv1ycdgu.css:3` | `dialog .method-formula` | `3.43:1 < 4.5:1` |

소스에서 `.lab-error`는 `color:var(--red)` / `background:var(--surface)`, 두 dialog 선택자는 `color:var(--accent)` / `background:var(--bg)`를 사용한다. `dist/styles.css`는 dark 기본값과 `[data-theme="light"]`의 별도 토큰을 가진다.

| 테마 | `--red` | `--surface` | `--accent` | `--bg` |
| --- | --- | --- | --- | --- |
| Dark 기본값 | `#ec8190` | `#12161d` | `#f2a84b` | `#0c0f14` |
| Light | `#ad3e52` | `#fff` | `#925b15` | `#f6f7f9` |

이는 **소스 토큰 확인**이다. 실제 열린 오류·방법론 dialog에서 적용된 `getComputedStyle`, 조상 배경, 활성 테마를 측정한 결과가 아니다. 서로 다른 테마의 변수를 정적 분석에서 함께 다룰 가능성이 있으므로 원본 정적 수치를 곧바로 활성 화면의 대비 수치로 해석하지 않는다. 반대로 명목 토큰만 보고 5개 경고가 해소되었다고도 선언하지 않는다.

판정은 **WARN 유지, 이 감사에 따른 색상 수정 없음**이다. 실제 사용 상태에서 대비 결함이 확인된다면 오류 의미와 두 테마를 유지하면서 해당 토큰 또는 해당 표면만 최소 수정해야 한다. 생성 CSS bundle을 직접 편집하거나 검사기 전역 변수 해석·임계값을 바꾸는 방식은 사용하지 않는다. 이전 `advisory-probe.json`의 임시 fixture 측정은 다른 커밋의 진단이며 현재 화면 증거로 승격하지 않았다.

## F7: 공통 컨테이너 레시피 26 WARN

다음은 원본 `evidence`를 그대로 옮긴 전체 목록이다. 말줄임은 원본 검사기의 출력이며 이번 기록에서 추가로 선택자를 생략한 것이 아니다.

| 번호 | 원본 파일:행 | 원본 evidence |
| ---: | --- | --- |
| 1 | `dist/analysis-dock.css:8` | `same container recipe on 18 selectors (.chart-indicator-manager button, .analysis-wind…...)` |
| 2 | `dist/analysis-dock.css:62` | `same container recipe on 9 selectors (.indicator-library-eye, .indicator-library-favo…...)` |
| 3 | `dist/analysis-dock.css:62` | `same container recipe on 8 selectors (.indicator-library-eye, .indicator-library-favo…...)` |
| 4 | `dist/atlas-shell.css:108` | `same container recipe on 16 selectors (.rsi-toolbar button, .workbench-bottom-bar .wor…...)` |
| 5 | `dist/atlas-shell.css:157` | `same container recipe on 12 selectors (.rsi-backtest-form input, .rsi-history button, …...)` |
| 6 | `dist/atlas.css:29` | `same container recipe on 6 selectors (.evidence-table tfoot button, .ipo-day-dialog b…...)` |
| 7 | `dist/chart-details-panel.css:12` | `same container recipe on 16 selectors (.chart-details-panel .reader-heading button, .a…...)` |
| 8 | `dist/chart-details-panel.css:26` | `same container recipe on 7 selectors (.chart-details-panel .reader-body .evidence-sou…...)` |
| 9 | `dist/chart-details-panel.css:143` | `same container recipe on 6 selectors (.workbench-scenarios>button, #data-view .daily-…...)` |
| 10 | `dist/chart-export-workbench.css:13` | `same container recipe on 6 selectors (.chart-export-dialog button, .chart-export-dial…...)` |
| 11 | `dist/compact-toolbar.css:25` | `same container recipe on 8 selectors (.compact-toolbar-action, .compact-toolbar-tabs>…...)` |
| 12 | `dist/compact.css:8` | `same container recipe on 7 selectors (#compare-view (.lab-details, .timing-details), …...)` |
| 13 | `dist/compact.css:119` | `same container recipe on 10 selectors (.data-summary, .research-chart-shell, .ipo-sear…...)` |
| 14 | `dist/daily-data.css:213` | `same container recipe on 8 selectors (#data-view .asset-history-mode button, #data-vi…...)` |
| 15 | `dist/market-lab/app/assets/index-Dv1ycdgu.css:3` | `same container recipe on 16 selectors (.day-selector input[type=number], .btc-refresh-…...)` |
| 16 | `dist/market-lab/app/assets/index-Dv1ycdgu.css:3` | `same container recipe on 6 selectors (.table-scroll, .data-summary, .ml-region, .ml-c…...)` |
| 17 | `dist/market-lab/app/assets/index-Dv1ycdgu.css:3` | `same container recipe on 10 selectors (dialog(.workspace-dialog, .chart-export-dialog,…...)` |
| 18 | `dist/market-lab/app/assets/index-Dv1ycdgu.css:3` | `same container recipe on 6 selectors (.rsi-workbench button, .rsi-workbench-panel a, …...)` |
| 19 | `dist/market-lab/app/assets/index-Dv1ycdgu.css:3` | `same container recipe on 9 selectors (.workspace-instrument-search input, .compact-to…...)` |
| 20 | `dist/market-lab/app/index.html:8` | `same container recipe on 6 selectors (#root>.atlas-skeleton [skullet-bar], #root>.atl…...)` |
| 21 | `dist/outlook.css:11` | `same container recipe on 6 selectors (.evidence-table tfoot button, .lab-pagination b…...)` |
| 22 | `dist/research-annotations.css:12` | `same container recipe on 6 selectors (.research-annotations-dialog button, .research-…...)` |
| 23 | `dist/styles.css:9` | `same container recipe on 12 selectors (.day-selector input[type="number"], .btc-refres…...)` |
| 24 | `dist/styles.css:9` | `same container recipe on 10 selectors (.table-scroll, .data-summary, .research-chart-s…...)` |
| 25 | `dist/styles.css:884` | `same container recipe on 10 selectors (dialog(.workspace-dialog, .chart-export-dialog,…...)` |
| 26 | `dist/viewport.css:194` | `same container recipe on 18 selectors (.chart-navigation button, .atlas-chart-commands…...)` |

이 목록에는 입력·탭·버튼, 지표 라이브러리 조작부, 읽기 패널, 표 스크롤 표면, dialog와 초기 skeleton이 함께 포함되어 있다. 예를 들어 `.compact-toolbar-action` / `.compact-toolbar-tabs`는 한 줄 도구 모음의 같은 크기 조작부이고, `.day-selector input`과 데이터 표 컨테이너는 서로 다른 역할이다. 동일한 테두리·반경·채움의 반복만으로 모든 역할이 시각적으로 혼동된다고 결론낼 수 없다.

`AGENTS.md`와 `design.md`가 요구하는 조밀한 금융 화면에서는 같은 역할의 입력·버튼에 공통 레시피를 쓰는 것이 일관성에 기여한다. 반면 표·리더·중첩 패널이 실제 화면에서 동등한 강조로 경쟁하거나 클릭 가능한 요소와 정보 표면이 구별되지 않는다면 그 상태는 별도 결함이 될 수 있다. 이번 원본 출력과 소스 대조만으로 26개 전부가 그러한 결함이라는 근거는 확보되지 않았다.

판정은 **26 WARN 유지, 경고 수를 줄이기 위한 반경·채움·테두리 변경 없음**이다. 기존 조작부를 다시 내부 행으로 복원하거나, 선택자를 쪼개어 레시피 감지를 피하거나, skeleton·숨겨진 상태를 검사 대상에서 빼는 변경도 하지 않는다. 화면별 실제 역할 구분은 종합 감사의 관찰 근거로 판단한다.

## F24: 검색 팝오버의 border + shadow 1 WARN

원본 finding은 `dist/market-lab/app/assets/index-Dv1ycdgu.css:3`의 `.workspace-search-popover`에 대해 `a hairline border under a wide soft shadow`를 보고한다.

실제 원본 구현은 다음 위치에 있다.

- `apps/web/src/workspace.css:23`: `border:1px solid var(--border)`, `background:var(--surface)`, `box-shadow:var(--shadow)`를 가진 fixed 검색 결과 패널.
- `apps/web/src/workspace.css:50`: 좁은 화면의 폭·최대 높이·반경 조정.
- `apps/web/src/components/workspace-toolbar.tsx`: `ChartWorkspaceToolbar`가 검색을 열었을 때 해당 class의 `<section>`을 생성하며 `owner.current.ownerDocument.body`에 portal한다.
- `apps/web/src/app.tsx`: chart workspace에서 `!embedded`일 때에만 `ChartWorkspaceToolbar`를 렌더한다. 통합 부모의 공통 종목 검색창을 열었다는 사실만으로 이 선택자의 실제 팝오버를 검증했다고 간주할 수 없다.

추가로 운영의 독립 `/market-lab/app/?lab-tab=rsi&symbol=TQQQ` 화면에서 실제 `종목·지역 검색`을 열었다. 1363×936 Chrome 화면에서 팝오버는 left 8px, top 105.5px, width 640px, height 520px였고, 배경 `rgb(19,25,34)`, 테두리 `1px solid rgb(39,48,62)`, 그림자 `rgba(0,0,0,0.267) 0px 12px 42px 0px`를 관측했다. 검색 입력과 닫기·분류 버튼은 가려지지 않았다. End 키로 마지막 `전국 아파트` 항목이 선택되고 결과 목록의 scrollTop이 86px로 이동했으며, Escape 뒤에는 닫힌 검색 입력에 초점이 유지됐다. 이 관찰은 해당 독립 팝오버에 대한 데스크톱 검토이며 다른 경로·모바일 크기의 검증으로 확대하지 않는다.

따라서 이는 소스와 화면에 남은 실제 스타일 조합이며, 포털 이동이 경고를 자동 해결하지 않는다. 독립 종목 차트 경로에 쓰이므로 죽은 CSS로 제거할 근거도 없다. 관측한 상태에서는 검색을 방해하는 구분·겹침 결함이 확인되지 않았으므로 **1 WARN 유지, shadow·border 삭제 없음**으로 기록한다.

## Render 결과와의 경계

기존 8개 화면의 10 WARN은 F3 1개, F7 1개, F19 2개, F25 4개, kept 2개다. 통합 10개 화면의 2 WARN은 F3와 F7 각 1개다. 두 render의 F3/F7 반복을 static 32에 섞어 수치를 다시 계산하지 않는다.

F25의 최초 화면 바깥 열이나 모바일에서 숨겨진 연구 본문은 도달 가능성·스크롤·리더 열기·포커스 복귀를 확인해야 하는 단서다. 초기 뷰포트 밖이라는 사실만으로 원장이나 기능이 삭제되었다고 단정할 수 없다. 반대로 숨겨진 본문에 포커스가 남는 실제 결함은 경고 수와 무관하게 수정 대상이다. 이번 작업에서 확인한 상호작용, 실제 수정 및 검증 결과는 [종합 감사 기록](README.md)을 따른다.

이 문서는 새 Hallmark 실행 결과가 아니며, 기존 최종 실행의 원본 WARN을 재분류하거나 면제한 기록도 아니다. 원본 판정과 수치를 유지하면서 소스와 실제 화면 근거를 분리한 감사 기록이다.
