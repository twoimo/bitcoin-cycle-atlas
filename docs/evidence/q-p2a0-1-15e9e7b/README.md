# Q-P2A0-1-15e9e7b — 스파이크 키보드 수정 후보

**수정 구현·push 완료, Mac 네이티브 재검증 대기. Q-P2A0-1과 P2a-0을 닫지 않는다.** P1은 `67125bd` Mac의 28/28·56/56·8/8·qualifier true로 닫힌 상태를 유지한다.

수정 전 GitHub 원격을 다시 읽어 `15e9e7bb823f958d9c368b36b4151d8c58bf8a17`로 fast-forward했다. 이 커밋은 [Mac `1c8f0c3` 영수증](../qa-p2a0-mac-1c8f0c3/README.md)을 추가한 문서 변경뿐이다. 수정·측정 후보는 **`a4485e69ab2d38266dd5a813e6a2b456e9e3c64b`**이며 지정 브랜치 `fix/tradingview-responsive-20261110`에만 반영했다.

## 원인과 수정

이전 Mac의 failures 28은 작은 타깃 16건, indicators/tools 텍스트 대비 8건, Enter 뒤 검색창 타임아웃 4건이다. 포커스 링·아이콘 대비 실패는 없었고, 모달 포커스 소유·Tab 가두기·Escape 복귀는 검색창이 열리지 않아 미측정이었다.

| 원인 | 수정 |
|---|---|
| 심볼·지표·도구·그리기 타깃 30–36px | 기존 symbol/button/chip에 최소 44×44px을 적용한다. 넓은 버튼은 더 큰 자연 너비를 유지하며 어떤 표본도 삭제하지 않는다. |
| 44px만 늘리면 부모 48px 도구줄에서 포커스 링이 잘릴 위험 | 도구줄은 자동 높이·최소 56px·상하 6px 패딩으로 바꾸고, 그리기 도구줄은 폭 56px·좌우 5px 패딩을 둔다. 기존 2px 링 + 1px offset은 유지한다. |
| 좁은 화면에서 커진 타깃의 가로 공간 | 원래 비어 있는 spacer를 줄바꿈으로 사용해 심볼/간격과 도구/그리기/전체화면을 두 행에 남긴다. interactive 항목은 숨기지 않는다. |
| indicators/tools 텍스트 대비 4.440810712577725 | 패키지의 기존 본문 역할 `--fnc-text`를 컨트롤에 사용한다. 임의 색·대비 임계값 변경·캔들 의미색 변경은 없다. |
| 심볼 Enter가 검색창을 열지 않음 | 원래 버튼의 실제 click 경로에 Enter keydown·Space keyup을 연결하고 native default 중복 활성화를 막는다. 반복키·수정키·IME·비활성·포커스 이동을 구분한다. |
| 아직 미측정인 모달 키보드 수명주기 | 원래 검색창이 나타나면 포커스를 안으로 옮기고, 현재 보이는 enabled Tab stop의 양 끝을 연결한다. 실제 모달 제거 후 opener로 복귀한다. 모바일에서도 원래 닫기 버튼을 44px로 드러낸다. |

정확한 `0.6.16`의 심볼은 native `BUTTON`에 `onClick`만 있다. 같은 게이트는 `rawKeyDown`·`keyUp`으로 Enter를 입력하며, Mac에서 이 순서가 검색창을 열지 못했다. 패키지에 전역 Enter 취소 코드가 있다는 근거는 찾지 못했다. 브라우저 기본 활성화가 일어나지 않은 세부 원인은 추론으로 남기고, 제품에 명시적인 키보드 활성화를 제공했다.

패키지 검색 모달의 Enter 처리에는 현재 결과를 선택하는 넓은 범위의 핸들러가 있다. 닫기·카테고리·즐겨찾기 버튼에 포커스가 있을 때는 그 버튼의 원래 동작만 실행하게 하고, combobox의 방향키/Enter 선택은 패키지에 그대로 남겼다. 대체 검색창·가짜 상태·검사용 mutation API는 만들지 않았다. observer와 이벤트 핸들러는 widget 제거 전에 해제한다.

변경 파일은 `spikes/funnest-p2a0/accessibility.mjs`, `main.mjs`, `spike.css`, `tests/funnest-p2a0-accessibility.test.mjs` 네 개다. 새 의존성은 없다. DOM 테스트는 기존 루트 개발 의존성 LinkeDOM을 사용하며, focus·visibility·capture·default activation을 모델링한다고 명시한다.

## 같은 게이트 결과

깨끗한 `a4485e6`에서 **변경하지 않은** `scripts/verify-funnest-p2a0-browser.mjs`를 실행했다. Chromium은 시작 단계의 `socket() failed: Operation not permitted (1)`에서 SIGABRT로 종료했다.

| 그룹 | 필수 | 실제 시도 | 통과 | 결과 |
|---|---:|---:|---:|---|
| startup | 6 | **0** | **0** | 초기 페인트 `null` |
| features | 7 | **0** | **0** | 실제 입력 미검증 |
| keyboard | 4 | **0** | **0** | 네 폭의 크기·대비·모달 동작 미측정 |
| touch | 4 | **0** | **0** | 터치 미측정 |

`sourceStable:true`, `complete:false`, `qualifiesP2a0NativeVerification:false`, 환경 실패 1건. 스크린샷 0, 가로 오버플로 `null`. **35개 집중 검사나 CSS 선언을 keyboard 4/4 또는 네이티브 통과로 대체하지 않는다.** 원본 [native-a4485e6.json.gz](native-a4485e6.json.gz).

검증기 SHA-256은 기준/후보 모두 `2e1037e0c0251acd7cb441bf005e7dab8b8f77f6893559b143bf7d5b88135fce`다. 6/7/4/4, 타깃 44px, 포커스 2px, 텍스트 4.5·아이콘 3.0, 45초, checkVisibility, 표본·실격 조건 모두 그대로다.

## 완료한 검사와 A-9 구분

- 집중 **35/35**, 실패·skip 0. 새 DOM/handler 회귀 11개와 기존 어댑터/검증 프로토콜 24개다. [TAP](focused-tests.tap).
- 격리 빌드·`--check` 통과. CSS 구문 검사 경고 0.
- 기존 제품 정적 검사 **1,065파일·220스크립트·753참조** 통과.
- 후보 JS **237,474B / gzip 74,745B / Brotli 64,490B**. 이전 대비 **+2,863B / +1,024B / +848B**. wrapper CSS 3,207B/gzip 1,219B. [전체 번들/입력 해시](bundle-report.json.gz).

기존 A-9의 **Mac `1c8f0c3` 6/6·2,170–2,208.2ms·실패 0** 영수증은 보존했다. 이것은 이 수정 후보의 재측정이 아니다. 제품 소스와 A-9 게이트는 바이트 동일하므로 이번에는 기존 A-9를 재실행하지 않았다. 기준 worktree 비교가 없고 **시간 영향은 `null`**이다. 0ms 영향이라고 기록하지 않는다.

보호 4파일, `dist/price-axis.js`, `minRight=64`, 기존 차트 엔진, P0/P1/A-9 및 스파이크 게이트, 이전 Mac 영수증을 보존했다. [22파일 해시](source-preservation.json). 제품 `dist/apps/packages`와 루트 의존성/빌드 진입점에는 변경이 없다. P2 차트 크롬·P3·P2b·배포·main push·force push·유료 도구 추가는 하지 않았다.

## Mac 재검증

Node 24 이상과 기존 Chrome을 사용한다. 새 출력 디렉터리를 사용하며 기존 영수증을 덮어쓰지 않는다.

```sh
npm ci --prefix spikes/funnest-p2a0 --ignore-scripts --no-audit --no-fund
node scripts/build-funnest-p2a0.mjs
node scripts/build-funnest-p2a0.mjs --check
node scripts/verify-funnest-p2a0-browser.mjs --out build/qa-q-p2a0-1-mac-a4485e6
```

Mac 기본 Chrome 경로는 `/Applications/Google Chrome.app/Contents/MacOS/Google Chrome`이며 다른 설치는 `--browser PATH`로 지정한다. 판정은 같은 한 실행의 **startup 6/6·features 7/7·keyboard 4/4·touch 4/4·qualifier true**다. 미달·미측정·실제 제품 실패는 계속 실격이며, 그 전에는 Q-P2A0-1/P2a-0을 닫지 않는다.

전체 수치·원본/압축 파일 해시: [summary.json](summary.json).
