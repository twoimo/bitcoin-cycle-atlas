# Q-R19P0-1-771167b — P0 H1 글자 영역의 가림 검사

요청 식별자 **Q-R19P0-1-771167b**. 기준 원격 커밋은 `771167bc960c1bac166339aaabe8cace9c56cd25`, 제품 기준은 `48c314cc2729b156dcf2450727387b6de75039bc`다. 작업 브랜치는 `fix/tradingview-responsive-20261110`이다.

## 원인과 수정 범위

기존 `inspectP0Page`는 H1 `getBoundingClientRect()` 전체 중심을 검사했다. 실제 H1은 왼쪽 정렬 글자보다 넓은 상자를 가지며, `.atlas-page-intro`의 `pointer-events:none`을 상속한다. 따라서 빈 중심뿐 아니라 글자 위치에서도 일반 `elementFromPoint()`가 아래 차트 또는 main을 반환할 수 있다. Mac 영수증은 글자가 보였다고 기록한다. 이 근거로 제품의 쌓임이나 H1 배치를 변경하지 않고 하네스의 `page-heading` 한 표본을 고쳤다.

[기존 Mac 영수증](../qa-r19p0-20261112/p0-48c314c.json)은 원문 그대로 보존한다. 그 실행의 10/10 실패나 별도 통과 수치를 이번 수정의 네이티브 통과로 바꾸지 않는다. P0 전체는 완료 처리하지 않는다.

## 판정 방식

실제 TextNode의 비공백 grapheme에 대해 `Range.getClientRects()`를 읽는다. 원시 소수점 좌표·문자열 범위·text owner를 보존하고, 빈 full-width 상자의 중심은 진단 정보로만 남긴다. 이 Range는 글자 조각의 typographic rectangle이며, raster ink 픽셀의 윤곽을 측정했다고 주장하지 않는다.

[Chrome DevTools Protocol DOM.getNodeForLocation](https://chromedevtools.github.io/devtools-protocol/tot/DOM/#method-getNodeForLocation)의 `ignorePointerEventsNone:true`로 native hit를 얻는다. 이 옵션은 제품 CSS를 수정하지 않는다. 각 글자의 실제 TextNode 또는 그 text owner backend ID만 허용하며, chart/main이나 H1의 임의 자손을 허용하지 않는다.

부분 가림을 중심점 몇 개만으로 놓치지 않도록 글자 Range와 겹치는 배경·테두리·텍스트·SVG·pseudo paint 후보도 수집한다. 양의 교차에 추가 native probe를 요구하고 DOM 순서만으로 앞뒤를 추정하지 않는다. 정수 좌표로 측정할 수 없는 얇은 교차, 지원하지 않는 기하, 빈 글자, 숨김·클리핑, 불충분한 owner/CDP 증거는 통과시키지 않는다. 전체 중심 assertion을 없앴다는 이유만으로 합격할 수 없고, geometry 수집 직후 상태는 native proof 대기 중이다.

다른 19개 고정 표본과 10케이스, 텍스트 4.5·아이콘 3.0, 40개 테마별 표본 커버리지, 폰트 증거, overflow 0 및 기존 R17/A-9 게이트는 그대로다. `dist/` 제품 파일을 수정하거나 P1 셸, Q-P1c-B-2, Q-R16-1을 시작하지 않았다.

## 검증

실제로 실행한 검증은 **129/129 통과, 실패·skip 0**이다. [집중 P0/text-hit 65/65](focused-contract.tap)와 [기존 R17·h1·테마 계약 64/64](preserved-contract.tap)를 합한 서로 다른 테스트 수다. 신규 text-hit 29건과 기존 collector에 추가한 pending-proof 회귀 1건을 포함한다. 실제 collector를 VM에서 직렬화 실행하고 실제 wrapper에 모의 CDP를 공급한 결과이며, 네이티브 브라우저 실측으로 세지 않는다. 정확한 명령과 [요약](summary.json)을 함께 보존한다.

새 음성 회귀는 외부·내부·pointer-events:none 가림, 1px 띠·1px 이미지, visibility가 복원된 자손, 제목 소유자 밖으로 뻗은 pseudo, 텍스트/좌표 변경, 누락된 backend, CDP 오류를 포함한다. 미세한 0.2px 교차에 정수 probe를 둘 수 없으면 미검증으로 남긴다. ETH의 빈 투명 pseudo hit-area는 paint가 아니므로 제외하고, 실제 paint가 있는 pseudo는 native quad를 얻어 비겹침을 확인한다.

`node --check` **4파일**, `git diff --check` 통과. `verify:static`은 **1,064파일·220스크립트·1,068참조**를 검사해 통과했다. CSS **41원본·2번들**, preload **56 URL·54고유 모듈·82 edge**의 `--check`도 통과했다. 제품 산출물을 재생성할 변경은 없으며 `dist/` 전체가 제품 기준 `48c314c`와 동일하다. 기존 P0 계약 모듈과 R17/A-9/미디어/h1 하네스 및 보호 4파일, Mac 원 영수증은 바이트 단위로 보존했다.

네이티브 P0 게이트를 실제 실행했으나 Chromium이 `socket() failed: Operation not permitted (1)` / SIGABRT로 시작하지 못했다. **required 10·attempted 0·passed 0·failed 0·unattempted 10, exit 1, status unverified**다. 0 failed를 합격으로 해석하지 않는다. 새 스크린샷 **0**, 실제 대비·폰트·heading hit 측정 **0**이다. [실패 원시 영수증](linux-20261112/report.json)은 `qualifiesP0Verification:false`, `sourceStable:true`다. 이 실행에서 정적 토큰 **40/40**, self-host 폰트 원본 **92개·2,957,724B**의 소스 검사는 통과했지만 브라우저 수용으로 세지 않는다.

기존 Mac의 custom glyph 8/8·fallback 2/2·대비 106개 통과는 기존 영수증의 관측으로 보존했다. 이번 수정의 native 통과 수에 합산하지 않는다. 기존 R17/A-9 native 게이트와 전체 npm test는 이번 하네스 전용 변경에서 재실행하지 않았다.

## Mac 재실행

기존 의존성과 Chrome을 사용하고, 원래 출력 디렉터리를 덮어쓰지 않는 새 이름을 지정한다.

```bash
node scripts/verify-ui-renewal-p0-browser.mjs --out build/qa-r19p0-20261112/p0-Q-R19P0-1-NEW
```

요구 케이스 10개와 모든 고정 표본·대비·폰트·overflow 검사를 그대로 판정한다. 이 결과를 보기 전에는 Q-R19P0-1이나 P0를 닫지 않는다.
