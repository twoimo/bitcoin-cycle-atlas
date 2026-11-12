# Q-P3DASH-2 — 릴레이 스크롤 페인트 경계 수정 후보

2026-11-13 KST. 제품 **`6e33d0fb8a6b489a1c7571d3aba254f84a54bb5b`**, 트리 **`8e483903e27dc434f0051394620a68fed36cca4e`**. 먼저 사용자 문서 **`7ebab472d14aade899bc9cfeccc84b70d8e75883`**를 fetch하고 fast-forward로 받았다. 이 문서 커밋 바로 위에 제품 수정을 반영했다. 이번 작업에서 reset이나 force push는 사용하지 않았다.

**상태: 제품 수정 후보, 같은 네이티브 게이트의 재측정 대기. Q-P3DASH-2는 열림이다.** 원래 검사기는 현재 Linux 환경에서 Chromium 시작 단계가 차단됐다. 28/28·56/56·8/8·qualifier true를 확인했다고 기록하지 않는다.

## 제품 변경 1건

기존 `dist/relay-room.css`의 본문 스크롤 소유자에 한 선언만 추가했다.

```css
.relay-room .relay-detail .relay-detail-body {
  clip-path: inset(0);
}
```

기존 selector 안의 `overflow:auto`, padding, 하단 16px radius, 글자 크기, overscroll, 2px 안쪽 포커스 링은 그대로다. 작성 CSS는 **1파일·1선언**이며 나머지 **11파일**은 기존 CSS 묶음과 캐시 링크를 재생성한 결과다. JavaScript·DOM·데이터·페이지 URL·검사기·표 셀·행 패딩은 변경하지 않았다.

최신 메시지로 이동하는 기존 `scrollTop = scrollHeight` 때문에 이전 메시지의 클리핑 전 좌표는 헤더 높이까지 올라올 수 있다. Mac 기록에서 320의 h1은 **top 18–42**, 목록 59번째 항목 배경은 **top -110.94–111.06**, 문단은 **top 25.06–43.06**이다. 기존 스크롤 영역의 둥근 overflow clip을 검사기가 직사각형으로 확정할 수 없어 `unverified`로 남겼다. 이 기록만으로 실제 화면에서 제목이 가려졌다고 단정하지 않는다.

추가한 `inset(0)`은 같은 패널의 실제 border box를 명시적인 페인트 경계로 사용한다. 패널 밖 메시지 페인트가 제목 영역까지 확장되지 않도록 제품에서 제한한다. 원래 검사기는 이미 native border box의 사각 inset을 계산하며, 실제 남는 교차 영역과 unsupported 조건은 계속 검사한다. 수집기 예외·임계값·표본을 바꾸지 않았다.

채팅의 sticky 날짜, 기사 목록·읽기, 신문 면 선택은 기존 스크롤 영역을 유지한다. 새 clip은 stacking context를 만들지만 외부로 펼쳐지는 릴레이 popover는 없으며, 날짜 레이블의 z-index는 내부에서 사용된다. 포커스 링은 기존 `outline-offset:-3px`로 경계 안에 있다. 이는 소스 검토이며 실제 입력 통과의 대체 증거는 아니다.

## 같은 게이트

| 실행 | 레이아웃 시도/통과 | 내비 시도/통과 | 복귀 시도/통과 | qualifier |
|---|---|---|---|---|
| 기존 Mac 제품 `042b04a` | **28 / 25** | **56 / 56** | **8 / 8** | **false** |
| 새 제품 `6e33d0f`, 이번 Linux 실행 | **0 / 0** (필수 28) | **0 / 0** (필수 56) | **0 / 0** (필수 8) | **false** |

[기존 Mac 영수증](../qa-q-p3dash-1-mac-042b04a/README.md)은 그대로 보존했다. 기존 제품의 P3 **20화면 오버플로 0**, 시장 child **4폭 오버플로 0**, 내비 56/56·복귀 8/8을 새 후보의 측정으로 재사용하지 않는다.

이번 실행은 깨끗한 **`6e33d0f`**에서 원래 명령 `node scripts/verify-ui-renewal-p1-browser.mjs --out build/q-p3dash-2/native-p1`을 사용했다. Chromium은 `socket() failed: Operation not permitted (1)`와 `SIGABRT`로 시작하지 못했다. 원본 보고서 상태는 `unverified`, 명령 exit **1**이다.

`sourceStable:true`, **1,164파일** 해시 확인, 변경 **0**, `complete:false`, `qualifiesP1Verification:false`. 스크린샷 **0장**. 새 후보의 h1 native text paint·overflow·clipRect·paintRect·포커스·타깃 크기는 **`null`**이다. 기준의 실패 3건이 사라졌다고 아직 판정하지 않는다.

## 보조 검사와 보존

| 항목 | 결과 |
|---|---:|
| 기존 집중 검사 | **142/142**, 실패 0, skip 0 |
| CSS 묶음 검사 | **43소스 · 2묶음**, exit 0 |
| preload 검사 | exit **0** |
| 정적 검사 | **1,159파일 · 221스크립트 · 847참조**, exit 0 |
| Pages build/verify | **104파일 · 9경로**, exit 0 |
| 보호 4파일·가격 축 | **5/5 동일** |
| scripts·tests | **217/217 · 424/424 동일** |
| 데이터·컨퍼런스 파일 | **191/191 동일** |
| 루트 런타임 JavaScript | **196/196 동일** |
| 자산·리서치·공모주 표 스타일 | **3/3 동일** |
| 루트 토큰·셸·차트 컨트롤 CSS | **4/4 동일** |
| 기존 증거 | **661/661 동일** |

표 스타일 3파일은 `dist/daily-data.css`, `dist/editorial-ledgers.css`, `dist/ipo-view.css`다. 표 셀 13px과 행 패딩을 변경하지 않았다. 보존 그룹은 서로 중복될 수 있다. [전체 해시](source-preservation.json.gz)와 [명령·종료 코드](checks.json)를 확인할 수 있다.

집중 검사는 동일한 제품 트리에서 실행했고, 기존 `inset`, 실제 교차, unsupported 판정과 셸·릴레이 계약을 검사한다. 네이티브 게이트를 대체하지 않는다. 루트 CSS 요청은 **4개 유지**, 변경된 CSS 묶음은 원본 **+101B**, gzip-9 **+45B**다. A-9 시간 영향은 측정하지 않았다. 전체 `npm test`는 이번 한 줄 수정에서 재실행하지 않았고, 기존 17실패는 수정 없이 병합 전 게이트로 유지한다.

## 원본 증거와 재측정

[summary.json](summary.json)에 수치와 상태를 기록했다. [raw-manifest.json](raw-manifest.json)은 원본 JSON·로그 **11개**와 압축본의 SHA-256을 담고 있으며, 복원 바이트 동일성을 확인했다. [manifest.json](manifest.json)은 최종 증거 파일 목록이다.

Mac에서 같은 제품을 확인할 명령은 다음과 같다. 출력 디렉터리는 실행 전에 만들지 않는다.

```sh
node scripts/verify-ui-renewal-p1-browser.mjs \
  --browser "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
  --out build/qa-q-p3dash-2-mac-6e33d0f
```

종료 조건은 원래대로 **28/28·56/56·8/8**, `sourceStable:true`, `complete:true`, `qualifiesP1Verification:true`다. 특히 relay-320·390·768의 native text proof와 기존 relay-1440을 모두 확인해야 한다. main push·배포·P4·P5·P2b는 수행하지 않았다.
