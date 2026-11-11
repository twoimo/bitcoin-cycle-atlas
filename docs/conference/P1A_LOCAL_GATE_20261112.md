# WP-A P1a 드라이버 로컬 검증 — 2026-11-12 KST

Pro가 `fix/tradingview-responsive-20261110`에 올린 P1a 골격을 드라이버가 macOS에서 독립 실행한 기록이다. Pro의 Linux 기록(`P1A_VERIFICATION_20261112.md`)을 대체하지 않고, 같은 커밋을 다른 환경에서 다시 잰 결과를 나란히 남긴다.

## 소스

- 브랜치 `fix/tradingview-responsive-20261110`, HEAD `ce8df9262b13a657823752408481f742f7a31701`.
- Pro 커밋: `180c55d`(화면·라우트·스키마·검증기), `15cb679`(자막 포커스·CSS 리뷰 범위), `8e37aed`(오프라인 패키지 CSS), `ce8df92`(검증 문서·증거).
- 제품 소스는 `8e37aed`, 이후 커밋은 문서·증거만 추가한다. 로컬 워킹트리는 `ce8df92`에서 clean이었다.
- 환경: macOS, Node 26.5.0, `ATLAS_BROWSER_PATH=/Applications/Google Chrome.app/Contents/MacOS/Google Chrome`, 커밋된 `dist`를 127.0.0.1:8174 정적 서버로 서빙. Docker Desktop 29.9.3을 PATH(`/Applications/Docker.app/Contents/Resources/bin`)에 넣어 frozen 배치를 실행했다.

## 결과

| 검사 | 명령 | 결과 |
| --- | --- | --- |
| 전체 단위 | `npm test` (Docker PATH 포함) | `complete:true`, tests 3,424 / pass 3,419 / fail 0 / skipped 5 / batches 2. frozen 41/41 |
| 타입 | `npm run typecheck` | exit 0 |
| 정적 | `npm run verify:static` | ok, 963 files / 218 scripts / 1,007 references |
| compare 셸 | `node scripts/verify-compare-shell-browser.mjs` | PASSED, failures 0 (1920×1080 포함 overflow 0) |
| h1 지오메트리 | `node scripts/verify-page-heading-browser.mjs` | **14/15**, `compare-320`만 실패(`heading/glyphs outside visible toolbar`) |
| R10 게이트 묶음 | `docs/evidence/chart-h1-20261112/r10-browser-gates.mjs <repo> ce8df92…` | passed, 6 gates, 213,328ms — responsive 11×4=44, WP6 30, chart-qa 12, failures 0 |
| 타임라인 계약 | `npm run verify:conference -- --timeline tests/fixtures/conference/timeline.synthetic.json --sources …/sources.synthetic.json` | 23 segments / 15 talks / 2 decks, last `t1` 4,000 ≤ 오디오 4,000초, errors 0 |
| 컨퍼런스 화면 | `node scripts/verify-conference-browser.mjs` | **4/14** (아래 참조) |

## 컨퍼런스 화면 4/14의 성격

실패 10건의 문구는 모두 같다.

- `fixture-390x844` … `fixture-767x900` 9개 폭: `Error: Timed out: native selection final-290; last=false`
- `navigation-ETHUSD`: `Error: Timed out: play before leaving conference; last=false`

통과: `missing-timeline`, `invalid-timeline`, `navigation-lifecycle`, `navigation-BTCUSD`.

`verify-conference-browser.mjs`의 덱 선택은 네이티브 `<select>`에 CDP 키 이벤트(focus → Home → ArrowDown×N → Enter)를 보내는 방식이다(`select()` 함수). macOS Chrome `--headless=new`에서는 `<select>`가 외부 AppKit 팝업으로 열려 이 키 이벤트가 값 변경으로 이어지지 않는다. 같은 저장소에는 내부 팝업 모드를 감지·기록하는 `scripts/native-select-keyboard.mjs`가 이미 있고 ETH 하네스가 그 경로를 쓴다. 따라서 이 10건은 **macOS에서의 하네스 입력 경로 제약**이며, 사용자가 덱을 바꿀 수 없다는 증거가 아니다. Pro의 Linux 실행은 14/14였다.

`navigation-ETHUSD`는 덱 선택 뒤 재생 단계에서 끊긴 별도 문구라 같은 원인으로 단정하지 않는다. 하네스가 내부 팝업 경로를 쓰도록 고친 뒤 다시 판정해야 한다.

## 남은 것

1. `verify-conference-browser.mjs`의 덱 선택을 `native-select-keyboard.mjs` 경로로 바꾸거나 macOS용 입력 경로를 명시해, macOS에서 14/14를 다시 측정한다. 그 전까지 macOS P1a 근거는 13개 중 4개 통과 + 9개 하네스 차단이다.
2. `compare-320` h1 고정 위치(R12)는 `ce8df92`에서도 재현됐다(14/15). 수정은 별도 Pro 요청으로 진행 중이다.
3. 실제 덱 좌표·페이지 매핑(P1b), R6 사람 검수, R7 실기기 검증은 이 기록의 범위가 아니다.

이 문서는 P1a 구현의 완료를 선언하지 않는다. Linux 14/14와 macOS 4/14를 분리해 남기고, 어느 쪽도 배포·출시 승인으로 쓰지 않는다.
