# Q-R19P1-4 — 차트 복귀 준비 상태와 인터셉션 종료 순서

## 판정

**수정은 지정 브랜치에 반영했다. P1은 닫지 않으며 Mac 동일 게이트 재검증 대기다.**

정본은 [체크리스트 Q-R19P1-4](../../LAUNCH_CHECKLIST_20261110.md)다.
작업 전에 원격 `fix/tradingview-responsive-20261110`을 다시 읽어
`ac9a6642fe28274fbf71ab33bca360cc289a2136`을 확인하고 fast-forward로 동기화했다.
이 커밋은 [기존 Mac 영수증](../qa-r19p1-20261112/mac-c56775d.json)과 문서만 추가했다.
이전 Q-R19P1-3 제품 변경을 다시 구현하지 않았다.

| 커밋 | 변경 |
|---|---|
| `98e60d3aa71365f4c2f38cb4a21a0014790f6e5b` | 페이지 소유 인터셉션 결정 추적, 종료 전 drain, 취소 증거와 실제 오류 분리, 회귀 검사 |
| `848f9cafb6806d3c5d851c309353f44fc2cbf820` | 실제 차트 컨트롤·첫 렌더 완료까지 busy 유지, 늦은 초기화의 내비 소유권 보호, 생성 산출물·회귀 검사 |

각 커밋은 지정 브랜치에 즉시 fast-forward push했다. 검사한 후보의 tree는
`3002b061058c7dff82749f12471b1a3bc85b8efb`다. 뒤의 영수증 커밋은 문서만 변경한다.

## 차트 복귀 수정

직접 Relay로 진입한 문서는 이미 일회성 document boot가 `ready`다. 기존
`syncPage()`는 가격 차트 경로와 정적 Outlook 섹션을 먼저 공개하고, 그 뒤
`viewport-workspace.js`와 `lab-view.js`의 동적 import를 기다렸다. 이 사이 콘텐츠 셸은
원래 내비를 사이드바로 복구하지만, 실제 차트 레일과 `#mobile-details-toggle`은 아직 없다.
기존 P1 준비 검사가 채워진 정적 섹션을 ready로 읽을 수 있었던 경합이다.

이 순서는 Mac 320의 토글 누락과, 1440에서 높이 32px인 Relay 타깃이 원래 사이드바
위치에 남아 가려진 증상에 부합한다. **새 후보의 네이티브 topmost는 아직 측정하지 않았다.**

`dist/app.js`는 Outlook/Compare 경로를 공개하기 전에 외부 섹션에 `aria-busy="true"`를
설정한다. 실제 워크스페이스 초기화가 레일과 모바일 조작을 만든 뒤 lab controller가 생기고,
현재 앱 상태 및 DOM 경로와 일치하는 `atlas:page-ready`가 와야 busy를 해제한다.
Compare가 Outlook 프레임 내부로 이동하므로 두 외부 섹션은 같은 준비 경계를 사용한다.
기존 document boot의 일회성 동작과 게이트의 `section.busy` 검사는 유지했다.

import가 끝나기 전에 다른 대시보드로 이동했다면 차트 초기화를 건너뛴다. 뒤늦은 완료가
대시보드 내비를 가져가지 않으며, 다음 차트 방문에서 캐시된 모듈로 한 번만 초기화한다.
현재 차트의 import 실패는 기존 오류 알림과 unready 상태를 유지한다.

새 DOM 회귀 검사는 실제 앱의 경로 함수, 셸 조정 함수, content/compare 소유자,
`mountMobileWorkspace`, 변경하지 않은 P1 준비 함수를 사용한다. 무거운 모듈 로딩과
렌더 완료는 지연 가능한 대역으로 제어한다. 원래 내비를 가진 실제 레일을 모바일 토글이
여는지, 잘못되거나 이른 ready 이벤트, 재방문, 로딩 중 이탈, 실패를 검사한다.
320/1440은 이 검사의 미디어 조건이며 **네이티브 레이아웃·가림 실측이 아니다.**

## 인터셉션 수정

P1 검증기는 페이지마다 `Fetch.requestPaused` 결정 Promise를 소유한다. 종료 순서는
새 결정 중단 → 기존 결정 drain → `Page.stopLoading` → `Fetch.disable` → 리스너 제거
→ CDP close → 브라우저 컨텍스트 폐기다. 자체 close가 아직 진행 중인 continue/fail
결정을 거절하지 않도록 순서를 바로잡았다. 종료 중 새로 도착한 paused 요청도 기록한다.

`Invalid InterceptionId`는 다음 증거가 모두 있을 때만 취소 진단으로 남긴다.

- 오류 문구가 정확히 해당 InvalidID다.
- 같은 network ID이며, 취소 이벤트가 그 ID의 가장 최근 paused 요청에 묶인다.
- 순서가 `pause < cancellation <= error observation`이다.
- 취소가 검증기 자체 `Page.stopLoading`보다 먼저 관측됐다.

이전 요청의 취소, 나중의 다른 취소, 자체 종료가 일으킨 취소는 앞선 오류를 면제하지 않는다.
예기치 않은 live CDP 종료, 설명되지 않는 InvalidID, 다른 프로토콜 오류, 잘못된 URL,
stop/disable/context 폐기 실패는 `report.failures`에 남아 계속 실격이다.
페이지별 `networkInterception` 진단에는 요청·명령·오류·취소·종료 순서가 보존된다.

`p1FinalStatus`와 `failures.length` 자격 조건은 바이트 그대로다. 실제 차트 복귀 실패는
정상 취소 진단과 함께 있어도 실격이라는 음성 회귀 검사를 포함했다.

## 같은 P1 게이트 실행 결과

깨끗한 제품 후보 `848f9ca`에서 실행했다.

```sh
node scripts/verify-ui-renewal-p1-browser.mjs --out build/qr19p1-4/native-848f9ca
```

Linux Chromium 시작 단계에서 SIGABRT와
`socket() failed: Operation not permitted (1)`이 발생했다. report의 `testedHead`는
위 후보 SHA, `workingTree:[]`, `sourceStable:true`, `complete:false`다.

| 검사 | 필수 | 시도 | 통과 |
|---|---:|---:|---:|
| 레이아웃 | 28 | 0 | 0 |
| 포인터·키보드 내비 활성화 | 56 | 0 | 0 |
| 차트 복귀 | 8 | 0 | 0 |

`status:unverified`, `qualifiesP1Verification:false`, 스크린샷 0이다.
320·390·768·1440의 새 후보 오버플로, 320 토글의 네이티브 도달성,
1440 Relay 중심의 topmost, 새 인터셉션 종료 동작은 **네이티브 미측정**이다.
0시도를 통과로 계산하지 않으며, 기존 Mac 후보의 수치를 새 후보에 옮기지 않는다.

원본 report의 JSON 바이트는 [gzip](native-848f9ca.report.json.gz)에 그대로 보존했다.
압축 전후 SHA-256과 수치는 [summary.json](summary.json)에 있다.

## 보조 검사

| 검사 | 결과 | 의미 |
|---|---|---|
| 최종 집중 검사 | **147/147**, 실패·skip 0 | DOM 수명주기, 셸·모바일·URL, P1 판정, 서버, 생성 산출물 |
| 신규 인터셉션 검사 | **11/11** | 위 147개에 포함; 정상 drain과 실제 오류 실격 |
| 신규 차트 준비 검사 | **7/7** | 위 147개에 포함; 두 미디어 조건의 하위 검사 포함 |
| 인터셉션 + 기존 P1 + 서버 묶음 | **35/35** | 최종 집중 검사에 포함되는 별도 실행; 합산하지 않음 |
| static | **1,065 파일 / 220 스크립트 / 753 참조**, 통과 | 실제 배포 자원의 정적 검증 |
| preload 재생성·check | 통과 | 56 module URL / 54 고유 파일 / 55 전용 preload |
| stylesheet check | 통과 | 42 원본 stylesheet; 제품 CSS 변경 없음 |
| 시장 외부 HTML | **9/9 exact rewrite** | 기존 생성기의 루트 경로·meta 변환과 일치 |

집중 검사에서 URL 보존 테스트 4개가 기존에도 깨진 사실을 확인했다. 삭제된 테마 대입문을
함수 추출 종료점으로 사용해 관련 없는 DOM 초기화를 실행했기 때문이다. 시작 `ac9a664`의
격리된 원본에서도 4/4가 같은 `document is not defined`로 실패했다.
`tests/app-workspace-url.test.mjs`에서 실제 `persistUrl()`만 추출하도록 고쳤고,
함수 존재 검사를 추가했다. 네 의미 검사의 본문과 URL 보존 단언은 바이트 동일하다.
최종 147/147에는 이 네 검사가 포함된다. 최초 실패·기준 커밋 재현·최종 통과 로그를
모두 [검사 로그](checks-848f9ca.tar.gz)에 보존했다.

시장 내부 React 앱 tree는 `74f00ae2fa566b3c39ac4ee3041d82e506861959`로 유지했다.
전체 Pages 앱 빌드를 수행했다고 주장하지 않는다.

## 보존 확인

[source-audit.json](source-audit.json)은 시작 HEAD와 현재 후보의 실제 바이트를 비교한다.
보호 4파일, `dist/price-axis.js`, P0 하네스·표본·텍스트 잉크 검증, CSS와 실제 차트/셸
컨트롤 모듈을 포함한 21파일이 같다. `minRight=64`, 가격 축 기하, 4.5/3.0,
40개 고정 표본/테마 쌍은 유지했다.

P1의 기존 독립 함수 21개도 바이트 동일하다. 여기에는 타임아웃, 준비 상태,
`checkVisibility`, 타깃·클립·알약 판정, 직접 서버, 28/56/8 자격 판정이 포함된다.
unsupported clip을 통과시키는 변경은 없다. Mac의 기존 P0 10/10·40/40·qualifier true
및 settings-icon 라이트 2/다크 2 관측은 해당 기존 영수증의 결과로 보존한다.

## Mac 재검증

최신 브랜치를 fast-forward로 받은 뒤 새 출력 폴더에서 같은 게이트를 실행한다.

```sh
node scripts/verify-ui-renewal-p1-browser.mjs --out build/qa-r19p1-4-mac-848f9ca
```

한 번의 깨끗한 실행에서 **28/28·56/56·8/8, 오버플로 0,
`qualifiesP1Verification:true`**가 필요하다. 320 차트 복귀의 실제 토글과
1440 Relay 중심의 topmost, `networkInterception`의 종료 순서·오류도 해당 report로 확인한다.
그 영수증 전에는 Q-R19P1-4와 P1을 닫지 않는다. main push, force push, 배포,
P2a-0 및 다른 단계는 수행하지 않았다.
