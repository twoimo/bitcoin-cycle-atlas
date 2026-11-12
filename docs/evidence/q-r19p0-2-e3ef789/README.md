# Q-R19P0-2-e3ef789 — 제목 가림 후보의 실제 클립 영역

**상태: 하네스 수정, Mac 재실행 대기. Q-R19P0-2와 P0는 열림.**

저장소 `twoimo/bitcoin-cycle-atlas`, 브랜치 `fix/tradingview-responsive-20261110`, 기준 HEAD `2c4a536fafaa9d5ebc4c63336b4496175d9344e9`에서 작업했다. 제품 기준은 `48c314cc2729b156dcf2450727387b6de75039bc`다. 제품 `dist/` 전체는 그 기준과 바이트가 같으며 보호 4파일과 기존 Mac 영수증도 변경하지 않았다. P1과 별도 Q 항목은 이번 범위에 포함하지 않았다.

push 직전 원격에 문서 전용 커밋 3개가 추가되어 부모는 `5aae222493f705c054031e951af8ddf742df9685`가 됐다. R22/R23의 새 문서와 체크리스트 기록을 보존하고 이번 Q-R19P0-2 행만 별도로 반영했다. 제품·하네스 소스는 최초 기준과 같아 아래 검증의 대상 바이트는 바뀌지 않았다. 단일 부모 커밋으로 이어가며 병합 커밋이나 force push를 만들지 않았다.

## 원인과 수정

[Mac 원본 영수증](../qa-r19p0-20261112/p0-e3ef789.json)은 10케이스를 모두 실행했지만 제목 증거가 `#atlas-page-description: unsupported clipPath`로 멈춰 0/10이었다. BTC 320에서 제목 글자 Range는 x 8–52.421875, y 57–71이고 설명 텍스트 Range는 x 24–397.59375, y 70–83이다. 설명의 원래 텍스트 사각형은 제목 아래 1px와 겹치지만, 제품 CSS는 설명을 1px 상자와 `overflow:hidden; clip-path:inset(50%)`로 잘라 놓았다. 하네스는 이 클립을 적용하기 전 사각형을 가림 후보로 판단했다.

`scripts/ui-renewal-p0-text-hit.mjs`는 이제 후보의 실제 단일 `getClientRects()`/`getBoundingClientRect()` border box와 computed `clip-path`를 읽어 클립 사각형을 계산한다. 지원하는 형식은 1–4개의 음수가 아닌 `%`·`px` 값 또는 단위 없는 0으로 된 사각형 `inset()`이며, 명시적 `border-box`도 지원한다. 조상의 clip-path와 적용 가능한 overflow도 누적한다. 백분율의 기준은 넘친 텍스트 Range가 아니라 측정된 참조 상자다.

대향 inset이 상자를 닫는지는 정확한 십진수 연산으로 판정한다. 매우 작은 양수 영역을 반올림해서 빈 영역으로 바꾸지 않는다. `clippedPaintCandidates`에는 다음 원자료를 남긴다.

- `rawRect`: 클립 적용 전 후보 사각형.
- `clips[].referenceRect`, `clips[].clipRect`, `clips[].value`: 측정한 참조 상자, 적용한 클립 사각형과 computed 값.
- `paintRect`: 클립 후 남은 사각형. 빈 영역이면 `null`.
- `status`: `empty`, `clipped`, `unchanged` 또는 `unverified`.

빈 영역이 측정된 후보만 가림 검사에서 빠진다. 남은 페인트가 제목 글자와 교차하면 기존 `DOM.getNodeForLocation(ignorePointerEventsNone:true)` 검사로 정확한 TextNode/텍스트 소유자를 확인하며, 위에 그려진 다른 요소가 적중하면 실패한다. 양수 교차가 너무 얇아 내부 정수 좌표를 만들 수 없으면 `unverified`다. 알 수 없는 clip 문법, 둥근/비사각형 clip, 없거나 여러 조각인 참조 상자, 지원하지 않는 좌표 변환도 통과시키지 않는다. 제목 자체의 클립·누락·비표시를 성공으로 처리하지 않는다.

`absolute`·`fixed` 자식이나 의사 요소는 포함 블록에 따라 overflow를 벗어날 수 있으므로 단순히 조상 상자로 잘라 버리지 않는다. 의사 요소는 실제 CDP `DOM.getBoxModel` quad를 읽고 같은 클립 계산을 적용한다. 두 관찰 사이에 제목·클립 목록·quad가 바뀌면 `unverified`를 유지한다. 제품 DOM·스타일·쌓임에는 쓰기를 하지 않는다.

측정의 의미는 **native Range와 border box를 바탕으로 한 사각형 및 native hit 증거**다. 래스터 글자 실루엣을 추출한 것은 아니다. 클립의 참조 상자·누적 교차·위치 지정 자식의 overflow 예외는 [CSS Masking §5](https://www.w3.org/TR/css-masking-1/#the-clip-path), [CSS Shapes의 inset](https://www.w3.org/TR/css-shapes-1/#funcdef-basic-shape-inset), [CSS 2.2 overflow](https://www.w3.org/TR/CSS22/visufx.html#overflow-clipping)에 근거한다.

## 실제 실행 결과

| 검사 | 결과 | 영수증 |
| --- | --- | --- |
| P0 계약 + 제목 텍스트 증거 | **83/83**, 실패 0, skip 0 | [TAP](focused-contract.tap), [명령](focused-contract-command.json) |
| 기존 R17·제목·터치·테마 계약 | **64/64**, 실패 0, skip 0 | [TAP](preserved-contract.tap), [명령](preserved-contract-command.json) |
| 중복 없는 단위·계약 합계 | **147/147**, 실패 0, skip 0 | [요약](summary.json) |
| 변경한 MJS 2파일 문법, diff whitespace | 통과 | [요약](summary.json) |
| `npm run verify:static` | **1,064파일 / 220스크립트 / 1,068참조**, exit 0 | [출력](static-checks.json) |
| CSS 번들 `--check` | **41소스 / 2번들**, 일치 | [출력](static-checks.json) |
| preload `--check` | **56 URL / 54모듈 / 82정적 import**, 일치 | [출력](static-checks.json) |
| 정적 토큰·폰트 파일 | **40/40 토큰쌍**, 92 WOFF2 face·2,957,724바이트 출처 검증 | [실행 보고서](linux-20261112/report.json) |
| 실제 P0 브라우저 | **required 10 / attempted 0 / passed 0 / failed 0 / unattempted 10**, harness failure 1, exit 1 | [명령](browser-command.json), [원본](linux-20261112/report.json) |

텍스트 증거 테스트는 기존 29개를 유지하고 18개를 더해 47개다. Mac의 Range 겹침, 같은 노드의 `inset(0)`, 부분적으로 남은 보이는 페인트, subpixel 잔여 영역, 참조 상자 누락, 조상 클립, 의사 요소 및 위치 지정 overflow 예외를 검사한다. CDP 기대 적중 영역은 테스트가 독립적으로 선언하며 제품 클립 파서를 기대값 계산에 재사용하지 않는다. **이 테스트들은 통제된 DOM·Range·CDP 모델이며 실제 브라우저 수치가 아니다.**

실제 하네스 실행은 Chromium의 `socket() failed: Operation not permitted (1)` / SIGABRT로 첫 페이지 전에 중단됐다. 스크린샷, 실제 제목 hit, 실제 대비 표본, 실제 폰트 케이스는 모두 **0**이다. `sourceStable:true`, `qualifiesP0Verification:false`다. `failed:0`은 통과를 뜻하지 않으며 10케이스 모두 미실행이다. 기존 R17/A-9 native 게이트와 전체 `npm test`는 이번 하네스 수정에서 재실행하지 않았다. 제품을 바꾸지 않아 재빌드하지 않았고 기존 CSS·preload 산출물의 일치만 확인했다.

## 유지한 계약

P0 10케이스·텍스트 대비 4.5·아이콘 대비 3.0·폰트 증거·오버플로 0, h1 1개, R17 16케이스·축 정렬 ±2px·minRight 64, A-9 2,500ms와 기존 미디어 임계값을 유지한다. P0 계약 모듈과 실행 러너, R17/A-9/미디어/제목 러너는 바이트가 같다. 보호 4파일과 제품 전체의 비교 결과는 [summary.json](summary.json)에 기록했다.

Mac에서 이미 확인한 토큰 40/40, 폰트 10/10, 대비 106표본 최소 5.1449, 15/17px 본문, overflow 0, 테마 10/10은 원본 영수증의 사실로 보존한다. 이 수치를 이번 수정의 native 통과나 P0 완료로 다시 세지 않았다.

## Mac 재실행

이 변경이 들어간 브랜치에서 다음 명령을 실행한다. 출력 디렉터리는 기존 `p0-48c314c`, `p0-e3ef789`와 다른 **새 이름**이다. 하네스는 이미 존재하는 출력 디렉터리를 덮어쓰지 않는다.

```bash
node scripts/verify-ui-renewal-p0-browser.mjs \
  --out build/qa-r19p0-20261112/p0-Q-R19P0-2-clipped-paint
```

Mac 원본 결과에서 10케이스·고정 표본 커버리지·제목 native hit·폰트·대비·테마·오버플로를 다시 확인해야 한다. **그 재실행 전에는 Q-R19P0-2와 P0를 닫지 않는다.**
