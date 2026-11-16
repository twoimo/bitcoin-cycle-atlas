# R19 P4 — 컨퍼런스 토큰·타이포·알약 컨트롤

상태: **제품 구현 완료, 원래 native 수용 게이트 미완료. P4는 열림.**

- 기준 문서 HEAD: `88f11024f122cb50c002e63672c1f9523a6fe12c`
- 제품 후보: `fcb941dcf880491a8e0e1cb211381810bd320aa2`
- 제품 트리: `c379fa6cb4b50a267e98a813988782b820e82fad`
- 브랜치: `fix/tradingview-responsive-20261110`
- 실행 환경: Linux, Chromium `156.0.8078.79`, Node `v24.22.1`.

## 구현

작성 소스는 `dist/conference/player.css` 한 파일이다. 기존 P0 팔레트·Pretendard·타입·모서리 토큰을 사용한다. 자막·전체 자막 행·검색 빈 상태는 15px, 메타·옵션·시계는 13px이다. 모바일/태블릿 필터와 모바일 설정 select는 기존 16px을 유지한다. 버튼/select는 알약, 텍스트 입력은 12px, 자막 시트의 위 모서리는 16px 토큰이다. 눌린 컨트롤과 현재 자막 행에는 `accent-soft`/`accent-ink`, 재생 hover에는 `ui-primary-hover`를 적용했다.

장표 이미지와 프레임, 캡션과 자막 목록 행의 직각 처리를 유지한다. 기존 16:9, 최대 1120px, 재생 56×56px, 일반 컨트롤 최소 44px, 2px 포커스, 상단 도구의 안쪽 포커스 offset -2px, 2줄 캡션, 320px 도크, 시트와 컨트롤의 위치·패딩·그리드·스크롤·reduced-motion 규칙은 바꾸지 않았다. 장표 크기 계산·DOM·아이콘·문구·URL·미디어 동작도 그대로다.

PostCSS 대조에서 허용한 스타일 속성은 `font`, `font-size`, `border-radius`, `background`, `border-color`, `color`, `box-shadow`, `filter`이다. 이 속성들을 제외한 **402개 선언이 기준과 동일**하다. 이는 지오메트리 선언 보존 증거다. 글자 크기 변경으로 생기는 실제 줄바꿈·헤더 높이·장표 치수·모바일 시계 폭은 native 측정 전까지 동일하다고 주장하지 않는다.

생성물은 기존 빌더로 갱신했다. `site-after-shell.css`와 루트/9개 정적 경로 HTML의 CSS 캐시 키만 달라졌다. HTML 10개는 캐시 키 외 바이트 동일성 검사에 통과했다.

## 이번 후보 검증

원래 하네스는 깨끗한 제품 SHA에서 옵션·임계값·표본 변경 없이 실행했다. 아래 통과 수는 과거 Mac 영수증을 이 후보에 재사용하지 않은 값이다.

| 원래 게이트 | 필요 | 시도 | 통과 | 결과 |
|---|---:|---:|---:|---|
| 실미디어 | 20 | 0 | 0 | manifest `unavailable`, 자산 미설치; `skipped`, exit 2 |
| 컨퍼런스 브라우저 | 14 | 0 | 0 | Chromium 시작의 socket EPERM; CDP timeout, exit 1 |
| A-9 Fast 4G/gzip | 6 | 0 | 0 | 같은 Chromium 시작 차단; CDP timeout, exit 1 |

실미디어 하네스의 skip은 **실행 전체의 preflight skip 1건**이며 20개 통과나 20개 개별 skip이 아니다. 실제 547장·15세션 패키지는 이 작업공간에 없다. checked-in manifest는 167B이며 SHA-256은 `ff3e3f2b16f4435e71c5e9f07740a9a2af2b9e9fe46aaf013f70972a658d0088`이다. 합성 fixture로 이를 대체하지 않았다. 14건 브라우저 하네스가 자체적으로 사용하는 기존 명시적 합성 fixture는 그대로다.

브라우저 stderr의 직접 원인은 `socket() failed: Operation not permitted (1)`이다. 원래 보고서는 케이스 시작 전에 실패하여 `sourceIntegrity` 필드가 없다. 별도 종료 후 SHA-256 재확인에서는 그 하네스가 수집한 **1166개 소스 변경 0**이다. 이 별도 확인을 원래 하네스의 native 성공 필드로 바꾸지 않았다.

새 후보의 가로 오버플로, h1 페인트, 타깃/포커스 실측, native 대비, 장표 전환 시간, 초기 painted-ready 시간은 **미측정(null)**이다. 0px·0ms·통과로 기록하지 않는다. A-9 2500ms·전환 150ms, 축 오차 2px, 4.5/3.0, 44px, 2px 링, h1 1개 기준은 유지한다.

| 집중·정적 검사 | 결과 |
|---|---|
| 기존 player/route/media browser contract/styles/preloads 테스트 | **103/103**, 실패 0, skip 0 |
| 정본 타임라인과 독립 SRT 행 대조 | **9168/9168**, 검증 통과 |
| 스타일 생성물 검사 | **43개 소스·2개 번들**, 통과 |
| preload 생성물 검사 | 통과 |
| 정적 참조 | **1159파일·221스크립트·847참조**, 통과 |
| 프로덕션 Pages 빌드·동일 바이트 검사 | **104파일·9경로**, 통과 |
| 토큰 색상 대비 소스 계산 | **26/26**, 최소 **4.825266537959948:1** |

대비 26건은 라이트/다크의 역할 색상 계산이다. 비활성 상태·미디어 픽셀·브라우저 합성·포커스의 실제 노출 측정은 포함하지 않는다. 처음 집중 검사는 번들 재생성 전 101/103이었고 2건 모두 stale `site-after-shell.css`였다. 기존 빌더를 실행한 뒤 같은 검사 103/103을 확인했다. 해당 진단 로그도 보존한다.

전송 크기는 `site-after-shell.css` 기준 raw **+576B**, 기본 gzip **+41B**, 기본 Brotli **−24B**다. JS·폰트·미디어 요청 추가는 없다. 시간 영향은 미측정이며 0ms로 환산하지 않는다. 전체 `npm test`는 이번에 다시 실행하지 않았고, 사용자가 보류한 기존 17실패는 병합 전 게이트로 남긴다.

## 보존·범위

보호 4파일 **4/4**, 가격 축 **1/1**, scripts **217/217**, tests **424/424**, dist runtime JS **221/221**, 컨퍼런스 runtime/data **6/6**, 기존 증거 **721/721**의 Git blob이 기준과 동일하다. 신규 의존성은 없다. 이번 커밋은 P4 스타일만 다룬다. P2b·P5·D-1~D-8, main push·배포는 수행하지 않았다. feature ref는 `force:false`와 예상 부모 SHA를 지정해 전진했고, 로컬은 fetch 후 `merge --ff-only`로 맞췄다. reset이나 force push는 사용하지 않았다.

## 같은 원래 게이트의 재검증

아래는 Mac의 실제 Chrome과 유효하게 준비된 실제 미디어 설치본에서 실행할 정본 명령이다. 먼저 제품 SHA 또는 그 위 제품 변경이 없는 문서 HEAD를 확인한다. 출력 경로는 아직 존재하지 않는 경로를 쓴다. 원래 실미디어 preflight의 해시·파일수 계약을 통과한 설치본을 사용해야 한다. 과거 다른 사이트 버전의 manifest를 복사한 것만으로 유효 설치라고 가정하지 않는다.

```sh
node scripts/verify-conference-media-browser.mjs \
  --dist dist \
  --browser "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
  --out build/r19-p4-media-mac-fcb941d

ATLAS_BROWSER_PATH="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
node scripts/verify-conference-browser.mjs \
  --out build/r19-p4-browser-mac-fcb941d

ATLAS_BROWSER_PATH="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
node scripts/verify-conference-data-browser.mjs \
  --profile fast4g --encoding gzip \
  --out build/r19-p4-a9-mac-fcb941d
```

**P4를 닫으려면 새 후보의 원래 실미디어 20/20·브라우저 14/14 영수증이 필요하다.** 하네스·표본·임계값을 약화하지 않고, 2500ms와 기존 계약도 유지한다.

요약은 [summary.json](summary.json), 명령/종료 코드는 [checks.json](checks.json), 원본 gzip 영수증과 해시는 [raw-manifest.json](raw-manifest.json)에 있다. 선언·보호 파일 대조는 [source-preservation.json](source-preservation.json), 역할 대비는 [token-contrast.json](token-contrast.json), 크기·캐시 범위는 [size-and-scope.json](size-and-scope.json)에 있다.


## Mac 재검증 (2026-11-13 07:26–07:32 KST)

Chrome 157.0.8103.79. 제품 `fcb941d`, 당시 문서 HEAD `521b2ab`. P4는 닫지 않는다. 상세는 [mac-fcb941d.md](mac-fcb941d.md).

| 게이트 | 필요 | 시도 | 통과 | 결과 |
|---|---:|---:|---:|---|
| 컨퍼런스 브라우저 | 14 | 14 | 13 | exit 1. `fixture-1024x768` stage 545.765625, visual 958 |
| 실미디어 | 20 | 0 | 0 | 자산 562/562 해시 일치. siteFileCount 1721 ≠ 1530. 브라우저 0, exit 1 |

정본 `dist`의 unavailable 매니페스트와 기존 pages·audio는 변경하지 않았다. 임계값과 파일 수 계약은 완화하지 않았다.
