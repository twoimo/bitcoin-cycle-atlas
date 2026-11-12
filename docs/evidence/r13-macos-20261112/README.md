# R13 macOS 독립 재측정 (2026-11-12 09:12–09:14 KST)

Pro가 `4f934b3` + `7f2982d`를 push한 뒤, 같은 소스를 macOS 로컬에서 다시 측정한 기록이다. 제품 코드와 하네스는 수정하지 않았고 측정만 했다.

- 소스: `7f2982d944e329f3f00ecd0a592d22117eac6032`
- 환경: macOS darwin arm64, Google Chrome 157.0.8103.79 (`/Applications/Google Chrome.app`), headless=new
- 작업 트리: clean

## h1 — 통과

`node scripts/verify-page-heading-browser.mjs --out build/heading-r13-0912` → exit 0.

| 검사 | 결과 |
| --- | --- |
| 계약 모드(기준선 없이) | **15/15** |
| 보충(390px 5종 + conference 4개 폭) | **9/9** |
| layout-shift(`compare-320-ancestor-resize`, `compare-390-ancestor-resize`) | **2/2** |

compare 320·390 모두 h1 top `869.5 → 797.5 → 869.5px`, toolbar `852 → 780 → 852px`, 폭·높이 변화 0px로 Linux 수치와 같다. ancestor-resize의 `before`를 고지 안정화 뒤에 캡처하는 변경이 macOS에서도 성립한다. 72px 계약과 0.01px 허용치는 그대로다. 요약: [heading-summary.json](heading-summary.json).

## conference — 5/14, 원인은 하네스 `type()`

`node scripts/verify-conference-browser.mjs --out build/conference-r13-0912` → exit 1.

- 통과 5: `missing-timeline`, `invalid-timeline`, `navigation-lifecycle`, `navigation-BTCUSD`, `navigation-ETHUSD`
- 실패 9: `fixture-390x844`, `fixture-320x740`, `fixture-768x1024`, `fixture-1024x768`, `fixture-1440x900`, `fixture-1920x1080`, `fixture-1280x900`, `fixture-1023x900`, `fixture-767x900`

네이티브 select 타임아웃은 사라졌고, 두 내비게이션 케이스가 같은 실행에서 모두 통과했다. 남은 9건은 모두 `coreInteractions`의 자막 검색 단계에서 같은 오류로 죽는다: `Missing visible .conference-transcript-row:not([hidden])`.

원인은 제품이 아니라 하네스다. `scripts/verify-conference-browser.mjs:133`의 `type()`이 전체 선택을 `key(cdp,'a',{control:true})`로 보내는데, CDP modifiers에서 Control은 2이고 macOS의 전체 선택은 Command(4)다. 그래서 233행 첫 호출은 입력창이 비어 있어 통과하고, 같은 값을 다시 넣는 236행에서는 커서 위치에 삽입되어 검색어가 `37253725초`처럼 중복된다. 패널은 "일치하는 자막이 없습니다"가 되고 행이 hidden으로 남아 클릭이 실패한다. 실패 스크린샷(`build/conference-r13-0912/fixture-1440x900-failed.png`)에서 확인했다. 275행 `type('[data-role=page]','2')`도 같은 위험이 있다.

케이스별 상태와 첫 오류 줄: [conference-summary.json](conference-summary.json). 원본 PNG 24장과 `report.json`은 `build/conference-r13-0912/`에 있으며 저장소에 커밋하지 않는다.

## 남은 것

- Pro가 `type()`의 전체 선택을 플랫폼별로 고친 뒤 macOS 14케이스를 재측정한다. 통과하면 R13의 하네스 항목을 닫는다.
- 초기 문서 로딩 중 사용자가 시작한 재생을 최초 `pageshow → syncFromUrl() → pause()`가 멈추는 제품 문제는 별도 0/1 FAILED로 남아 있다(Pro Linux 진단).
