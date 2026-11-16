# R19 P1 셸·내비 — HANDOFF-R19P1-1-595c365

상태: **제품 변경 push 완료 / 네이티브 수용 미검증**. 브라우저 화면을 열기 전에 실행 환경에서 Chromium의 socket 생성이 차단됐으므로 네 폭의 오버플로, 실제 내비 도달성, settings-icon 관측을 PASS로 기록하지 않는다. 다른 단계는 시작하지 않았다.

## 기준과 커밋

- 저장소: `twoimo/bitcoin-cycle-atlas`, 브랜치: `fix/tradingview-responsive-20261110`.
- 작업 전 원격을 다시 읽어 `595c365230f19d064b1af41b65a3ec6a02d3f7b5`를 확인했다. 이전 작업공간의 미커밋 변경은 사용하지 않았다.
- 기준: `docs/requirements/REQ_UI_RENEWAL_FUNNEST_20261112.md` §4 P1, `docs/LAUNCH_CHECKLIST_20261110.md` R19.
- `c1a3a0c50c0c8e77e3ff6e0ea014c42cbe263ad9`: 원본 화면 설정 버튼을 모바일 도크에 유지하고 지표 조작을 기존 기능 시트로 옮김.
- `ab1ce6941c1bc560416cd4f901bad21e3da998bb`: 1140/1280 컨테이너, 헤더 알약 내비, 카드 외곽, 설정 버튼의 기존 모바일 ID 숨김 규칙을 이기는 표시 규칙, 모델·패키징 검사.
- `758954336cd50c28bd726b7d6dd619dc7a8ce68c`: 네이티브 P1 검증기와 기존 compare 내비 소유권 계약 이관. **실제 P0·P1 실행의 testedHead이며 작업 트리는 비어 있었다.**
- 위 커밋은 각각 만든 직후 지정 브랜치에 fast-forward로 반영했다. main push·force push·merge·배포 없음.

## 제품 변경

대시보드의 기본 컨테이너는 1140px(리서치·공모주), 넓은 컨테이너는 1280px(자산 비교·릴레이·컨퍼런스)이다. 좌우 여백은 768px 이상 24px, 그 아래 12px이다. 기존 정식 `/market-lab/` 진입은 차트 셸 안의 시장 iframe 소유권을 유지한다. 시장을 별도의 새 대시보드 라우트로 바꾸지 않았다.

대시보드 헤더는 제목 행과 44px 알약 내비 행으로 구성한다. 원래 `.atlas-nav` 한 개를 옮기므로 목적지 ID, 리스너와 현재 페이지 상태를 보존한다. 좁은 폭에서는 수평 native scroll과 이전/다음 44px 버튼을 사용하며, `Tab`과 `Enter`로도 접근한다. 차트로 돌아오면 원본 내비와 푸터를 원래 소유자에게 복원한다. 기존 단일 h1과 설명의 연결을 유지하며 제목을 복제하지 않는다.

섹션 외곽에 16px 카드 토큰·표면·테두리·그림자를 적용한다. 섹션 내부의 스크롤과 출처 팝업 소유권은 유지한다. 공모주 출처 팝업을 잘라내는 전역 `overflow:hidden`은 추가하지 않았다.

화면 설정은 **원래 `#atlas-display-options` 버튼**을 모바일 도크에 남기며, 원래 지표 버튼은 기존 기능 시트에 둔다. 원본 노드·이벤트·44×44 기하는 유지한다. 기존 `.atlas-canvas-heading>#atlas-display-options{display:none}`의 ID 우선순위 때문에 단순 재배치로는 보이지 않던 점을 고쳐, ≤620px의 chart phone dock에서만 `display:inline-flex`를 적용한다. 라이트·다크 색 역할이나 SVG path는 변경하지 않았다.

## 실제 브라우저 결과

새 실행 두 개 모두 `Chromium launch` 단계에서 `socket() failed: Operation not permitted (1)` 및 SIGABRT로 중단됐다. 브라우저 케이스에 들어가지 못한 **환경 차단**이며 제품 케이스 실패 수치로 바꾸지 않는다. 양쪽 `sourceStable:true`, 시작 작업 트리 `[]`이다.

| 폭 | 높이 | 직접 진입 시도/요구 | 가로 오버플로 | 포인터 활성화 시도/요구 | 키보드 활성화 시도/요구 |
|---:|---:|---:|---|---:|---:|
| 320 | 900 | 0/7 | 미측정 (`null`) | 0/7 | 0/7 |
| 390 | 900 | 0/7 | 미측정 (`null`) | 0/7 | 0/7 |
| 768 | 900 | 0/7 | 미측정 (`null`) | 0/7 | 0/7 |
| 1440 | 900 | 0/7 | 미측정 (`null`) | 0/7 | 0/7 |

P1 총계는 직접 진입 **0/28**, 네이티브 활성화 **0/56**, 차트→대시보드 복귀 **0/8**, 스크린샷 **0장**이다. `qualifiesP1Verification:false`; U-4·U-7 완료를 주장하지 않는다. 검증기는 누락한 경로나 단계를 통과로 세지 않는다.

### settings-icon과 기존 P0

기존 Mac `f86ba0a` 영수증의 **required10 / attempted10 / passed10 / failed0**는 그대로 유효한 과거 기록으로 보존한다. 당시 커버리지 38/40, settings-icon의 라이트·다크 미관측 때문에 `qualifiesP0Verification:false`였으며 제품 케이스 실패가 아니다.

이번 Linux 실행은 **required10 / attempted0 / passed0 / failed0 / unattempted10**이다. 정적 토큰 **40/40**과 소스 감사는 통과했다. 실제 대비 관측은 0, 전체 native 표본은 0/40이다.

| 원래 표본 | 라이트 관측 수 | 다크 관측 수 | 이번 상태 |
|---|---:|---:|---|
| `#atlas-display-options svg path` / settings-icon | 0 | 0 | 브라우저 실행 전 차단, 미검증 |

이번 0/40은 과거 Mac 38/40과 실행 환경이 다른 별도 영수증이다. **40/40 달성이나 settings-icon 관측 성공을 주장하지 않는다.** P0 하네스·표본·대비 4.5(텍스트)/3.0(아이콘)는 바이트 그대로 유지했다.

## 내비 도달성 증거와 한계

모델 검사에서는 원본 내비 한 개, 7개 목적지, 클릭 핸들러 보존, 여러 차례 차트↔대시보드 왕복, 하나의 h1, 원본 푸터·출처 준비 상태를 확인했다. 스크롤 버튼의 양끝 상태와 44px 규칙·포커스 링도 검사한다. 이 결과는 실제 브라우저의 클릭·키보드 도달 증거를 대신하지 않는다.

새 P1 게이트는 7개 경로×4개 폭의 28개 레이아웃, 포인터·키보드별 56개 실제 목적지 활성화, 8개 차트 복귀를 요구한다. 전체 글자가 보이는 h1은 변경하지 않은 P0 native text proof를 재사용한다. 클릭은 완전히 노출된 44px 타깃과 소유자 hit, 키보드는 실제 Tab·Enter와 2px 포커스 링을 요구한다. DOM 클릭·focus·scroll 조작으로 노출을 만들어내지 않는다. 수평 화살표가 탭을 지나친 경우 실제 잘린 경계만큼 native wheel을 사용한다.

기존 compare 하네스는 사이드바/레일 소유권 분기를 보존하고 새 헤더 소유권을 명시적으로 추가했다. 원본 내비, 원래 경로·뷰포트·왕복·차트 기하·출처 검사를 유지한다. 새 헤더에서 모든 목적지의 native wheel 도달과 Tab/Shift+Tab을 검사한다. 이 하네스의 새 실제 브라우저 PASS는 없다.

## 실행 가능한 검사

| 검사 | 결과 |
|---|---:|
| 제품·P0 계약·스타일/프리로드 | 76 passed, 0 failed, 0 skipped |
| 셸 원본 소유권·왕복 모델 | 4 passed, 0 failed, 0 skipped |
| P1·compare·기존 P0 text 검증기 계약 | 77 passed, 0 failed, 0 skipped |
| standalone 패키징·P0 소스 목록 | 42 passed, 0 failed, 0 skipped |
| `npm run typecheck` | exit0 |
| `npm run build:web` | exit0 |
| `npm run verify:static` | exit0; 1065 files / 220 scripts / 1068 references |

위 집중 검사 묶음에는 중복 테스트가 있으므로 합산 총계로 사용하지 않는다. CSS 원본 추가에 맞춰 번들 기대 수를 **41→42**, P0 감사 대상 CSS 기대 수를 **47→48**로 늘렸다. 기존 원본 순서·누락·변경 바이트 검사를 유지하고 새 파일 누락 거부 검사도 추가했다. 표본이나 대비 임계값 변경은 아니다.

전체 `npm test`는 중간 작업 트리에서 **3786 tests / 3763 passed / 23 failed / 0 skipped**였고, declared frozen runtime을 실행할 Docker가 없어 `complete:false`다. 이 중 21개 실패를 깨끗한 `595c365`에서 동일하게 재현했다(선택 검사 73개 중 52 pass·21 fail). 나머지 두 건은 이번 CSS 파일 증가에 따른 목록 기대값으로, 위 42/42 재실행에서 해결했다. 전체 테스트를 최종 PASS로 바꾸거나 기존 실패·runtime gate를 수정하지 않았다. 상세 이름은 [test-diagnostics.json](test-diagnostics.json), 원문 로그는 [checks.log.tar.gz](checks.log.tar.gz)에 있다.

## 보존한 계약

보호 4파일, `dist/price-axis.js`, P0 하네스·계약·text helper는 시작 커밋과 SHA-256이 같다. `minRight=64`와 가격 축 기하를 바꾸지 않았다. 정확한 해시는 [summary.json](summary.json)에 있다. P2a-0·P2·P3·P4·P5는 시작하지 않았다.

## 같은 커밋에서 남은 실측 재현

브라우저를 실행할 수 있는 기존 Mac 환경에서 지정 브랜치를 fast-forward로 받은 뒤, 비어 있는 새 출력 폴더로 실행한다. 이 영수증의 검증 커밋은 `7589543`이고 이후 기록 커밋은 문서뿐이다.

```sh
git fetch origin fix/tradingview-responsive-20261110
git switch fix/tradingview-responsive-20261110
git pull --ff-only origin fix/tradingview-responsive-20261110
node scripts/verify-ui-renewal-p0-browser.mjs --out build/r19p1-mac-p0-7589543
node scripts/verify-ui-renewal-p1-browser.mjs --out build/r19p1-mac-p1-7589543
```

P0는 **10/10 케이스 + settings-icon 양 테마 관측을 포함한 고정 40/40 표본**, P1은 **28/28·56/56·8/8과 네 폭 오버플로 0**을 확인해야 한다. 실패·미측정이면 원래 영수증을 남기며 폴더를 덮어쓰지 않는다.

## 원본 영수증

- [summary.json](summary.json): 최종 커밋·보호 해시·네 폭 수치·표본 관측·검사 수치.
- [p0-7589543.report.json.gz](p0-7589543.report.json.gz): 변경하지 않은 P0 하네스가 기록한 JSON 전체 원문.
- [p1-7589543.report.json.gz](p1-7589543.report.json.gz): 새 P1 하네스가 기록한 JSON 전체 원문.
- [checks.log.tar.gz](checks.log.tar.gz): 집중 검사·빌드·전체 검사 진단·시작 커밋 재현 로그.

압축 전 JSON의 SHA-256과 크기를 summary에 남겼으며 압축을 풀었을 때 원문 바이트 일치를 확인했다. 스크린샷은 생성되지 않았고 대체 이미지를 만들지 않았다.
