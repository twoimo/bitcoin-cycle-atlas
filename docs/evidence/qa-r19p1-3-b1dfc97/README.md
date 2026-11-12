# Q-R19P1-3 — 제목 잉크·좁은 내비 클립 수정

## 판정

**제품 수정은 브랜치에 반영했으며, P1은 닫지 않는다. Mac 동일 게이트 재검증 대기다.**

정본은 [체크리스트 Q-R19P1-3](../../LAUNCH_CHECKLIST_20261110.md)이다. 작업 전 원격
`fix/tradingview-responsive-20261110`을 다시 읽어
`b1dfc97ee3868b58fe3b5e31ea7c6071cf6d662e`를 확인했다. 그 커밋은 `026e416`
위의 Mac 영수증·문서만 포함했고, 제품 수정은 없었다.

| 커밋 | 변경 |
|---|---|
| `36f3a589b3da75eccf0088d11d59d18dbc3fe041` | 대시보드 body의 여백 접힘 방지, 카드 그림자 범위 축소, 제목 회귀검사 |
| `a23a39c8ff2ad540e42f64e929d8f252bdd38a16` | 내비 전체 타깃 노출·실제 끝 여백, P0 색 역할 소유 규칙 유지, 생성 산출물·회귀검사 |

각 커밋은 이 브랜치에 즉시 fast-forward push했다. 최종 제품 tree는
`b607b2fb6f88d014f9a1b91f0b1eddfbdb3a2dd6`이다. 뒤의 영수증 커밋은 문서만 변경한다.

## 제품 수정과 이유

### 제목

`dist/ui/shell-layout.css`에서 `body[data-shell=dashboard]`에 `display:flow-root`를
적용했다. 기존 `overflow:clip`만으로는 작업 영역의 `margin-top:112px`가 body 밖으로
접힐 수 있었다. 이제 그 여백을 body 안에 유지하므로 고정 헤더와 제목의 조상 클립이
같은 뷰포트 원점에서 시작하도록 한다. 112px 헤더 예약, h1 노드와 문구는 유지했다.

외부 카드의 그림자는 `0 2px 8px var(--shadow-color)`로 한정했다. 기존
`0 10px 40px`의 보수적 그림자 경계는 제목까지 닿았고, 그대로인 잉크 검사기는 이를
`unsupported box-shadow paint`로 판정한다. 새 그림자 경계는 카드 top에서 22px
위까지다. 현재 셸 치수로 계산한 경계는 휴대전화 102px, 큰 폭 114px라 기록된 제목
20–40px와 떨어진다. **이 수치는 CSS와 명시적 기하 모델의 계산이며 네이티브 실측이 아니다.**

P0의 전역 `--shadow`, `--shadow-color`, 색·대비 토큰은 바꾸지 않았다. 카드의 표면,
테두리, 16px 반지름도 유지했다. source disclosure를 자를 새 overflow나 clip-path는
추가하지 않았다. unsupported clip을 통과시키는 검사기 변경도 없다.

### 내비

`dist/content-shell.js`는 대시보드의 실제 `.atlas-nav`에서 `focusin`을 받으면 타깃
전체 사각형과 현재 스크롤 영역의 padding을 읽는다. 필요한 좌우 이동만 바깥쪽 정수로
반올림해 `behavior:'instant'`로 적용한다. 같은 타깃이 계속 포커스된 경우에만 microtask에서
한 번 재확인하며, 내비 폭이 변할 때도 포커스된 알약 전체를 드러낸다.

포커스를 바꾸거나 문서·카드·차트 스크롤을 움직이지 않는다. 원래 내비 노드와 이벤트는
유지하고, 대시보드에서 나가면 전용 리스너를 제거한다. 일반 스크롤 이벤트는 화살표 상태만
갱신하므로 휠·터치·화살표 조작을 이전 포커스 위치로 되돌리지 않는다.

CSS에는 실제 `padding:0 4px`와 `box-sizing:border-box`를 적용했다. 기존
`scroll-padding-inline:4px`는 유지했다. 실제 끝 여백은 마지막 알약의 0.31px 소수 끝점이
정수 `scrollWidth/clientWidth`의 최대 이동 뒤에도 클립 밖에 남는 상황에 여유를 제공한다.
검사 허용치나 알약 반지름 기준은 바꾸지 않았다.

### 산출물

CSS 번들·루트 stylesheet digest와 conference preload graph를 기존 생성기로 갱신했다.
시장 외부 HTML 9개는 기존 `build-pages.mjs`의 정확한 루트 경로·meta 변환과 동일하게
갱신했고, 기존 exact-equality 검사로 9개 모두 확인했다. 내부 React 앱은 시작 HEAD와
같은 tree다. **전체 Pages 앱 빌드·검증 통과를 주장하지 않는다.**

## 같은 P1 게이트의 실제 결과

깨끗한 `a23a39c`에서 다음 명령을 실행했다.

```sh
node scripts/verify-ui-renewal-p1-browser.mjs --out build/qr19p1-3/native-a23a39c
```

Chromium 실행 단계에서 SIGABRT와 `socket() failed: Operation not permitted (1)`이
발생했다. `testedHead`는 위 제품 SHA, `workingTree:[]`, `sourceStable:true`다.

| 검사 | 필수 | 시도 | 통과 |
|---|---:|---:|---:|
| 레이아웃 | 28 | 0 | 0 |
| 포인터·키보드 내비 활성화 | 56 | 0 | 0 |
| 차트 복귀 | 8 | 0 | 0 |

`status:unverified`, `qualifiesP1Verification:false`, 스크린샷 0이다. 네 폭
320·390·768·1440의 새 후보 오버플로, 제목 잉크, 알약 계산 스타일·도달성은 모두
**미측정**이다. 제품 케이스 28개가 실패한 결과로 해석하지 않는다.

시작 HEAD에서도 같은 환경 차단을 확인했다. 두 원본 report는 JSON 바이트를 바꾸지 않고
gzip으로 보존했다. [summary.json](summary.json)에 압축 전후 SHA-256이 있다.

[기존 Mac 영수증](../qa-r19p1-20261112/mac-026e416.json)의 레이아웃 8/28,
내비 48/56, 복귀 8/8 및 28개 오버플로 0은 **수정 전 제품의 결과**로 보존한다.
새 후보의 통과 수치로 옮기지 않는다.

## 실행한 보조 검사

| 검사 | 결과 | 한계 |
|---|---|---|
| 집중 단위·계약 검사 | 168/168, 실패 0, 건너뜀 0 | 브라우저 게이트를 대체하지 않음 |
| 새 제목 회귀 | 8/8 | 기존 잉크 collector를 호출하는 명시적 DOM·Range 기하 모델 |
| 새 내비 회귀 | 9/9 | 실제 제품 handler와 소스 padding을 쓰는 스크롤·수명주기 모델 |
| 기존 P0 소스 감사 | 48개 CSS, root paint 1,838행 통과, 정적 대비 쌍 40/40, 폰트 통과 | 새 네이티브 P0 실행 아님 |
| static | 1,065파일·220스크립트·753참조 통과 | 정적 검사 |
| CSS 번들·preload `--check` | 통과 | 42개 CSS, module URL 56개 |
| 기존 실제 P1 서버 HTTP 회귀 | 8/8 HTTP 200 | 브라우저 사용 없음 |

루트 응답은 `dist/index.html`과 동일한 57,006B,
SHA-256 `a2e9165df98d45ce1e1980aa0642b065d4fd040a17197e65e5cce0d12b73d032`이다.
[HTTP 영수증](http-a23a39c.json)은 최종 제품 바이트에 대한 기존 서버 검사의 원문 출력을
추출했다. [P0 소스 감사](source-audit-a23a39c.json)는 고정 표본·기준을 그대로 읽었다.

첫 집중 실행은 166/168이었다. 첫 제목 커밋의 지역 그림자 별칭이 기존 P0의 root 밖
paint alias 금지 규칙에 걸렸다. 두 번째 커밋에서 그 별칭을 제거하고 카드 속성이 기존
`--shadow-color`를 직접 쓰도록 바꿨다. P0 감사 코드는 수정하지 않았으며 같은 집중 검사
최종 실행이 168/168이다. 실패 로그를 포함해 모든 로그를 `checks.log.tar.gz`에 보존했다.

## 보존과 Mac 재검증

시작 `b1dfc97` 대비 보호 4파일, `dist/price-axis.js`와 `minRight=64`, P0/P1
하네스·잉크 검사기는 바이트 동일하다. 28/56/8, 타임아웃, checkVisibility, 알약 기준,
표본, 텍스트 4.5·아이콘 3.0은 유지했다. [이전 Mac P0](../qa-r19p1-20261112/mac-b787935.json)의
10/10·40/40·qualifier true와 settings-icon 라이트 2회·다크 2회 영수증도 그대로다.
main push, force push, 배포, P2a-0은 수행하지 않았다.

최신 브랜치를 받아 같은 게이트로 새 디렉터리에 기록한다. 후속 문서 커밋은 제품 바이트를
바꾸지 않으며 실행의 실제 HEAD는 report에 기록된다.

```sh
node scripts/verify-ui-renewal-p1-browser.mjs --out build/qa-r19p1-3-mac-a23a39c
```

**Mac에서 28/28·56/56·8/8 및 `qualifiesP1Verification:true`가 확인될 때까지
Q-R19P1-3과 P1은 열어 둔다.**
