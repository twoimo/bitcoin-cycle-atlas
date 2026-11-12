# Q-P4-1 — 장표 폭 수정 후보, P4 열림

제품 **`12f070363b65f7c5bd8272f2d786fd8348df3533`**, 트리 `0b8eb76c57c56b96a5cf101d3ff2a6467a077f60`.
기준 `5b63c0c0d8c59bae5811594611c329baec45c663`, 브랜치 `fix/tradingview-responsive-20261110`.

**수정은 구현했으나 같은 브라우저 게이트의 14/14를 확인하지 못했다. Q-P4-1과 P4는 닫지 않는다.**

## 원래 게이트 결과

깨끗한 제품 SHA에서 2026-11-12 22:57:46–22:58:17 UTC에 기존 `scripts/verify-conference-browser.mjs` 전체 명령을 실행했다. 표본 선택이나 layout-only 옵션을 사용하지 않았다.

| 항목 | 이번 후보 |
|---|---:|
| 필요 | 14 |
| 시도 | 0 |
| 통과 | 0 |
| 케이스 실패 | 0 — 케이스 시작 전 중단 |
| 하네스 오류 / 전체 실패 | 1 / 1 |
| 종료 코드 | 1 |
| 1024 stage 폭 / visual 폭 | 미측정 / 미측정 |
| 가로 오버플로·h1·재생 버튼·포커스 | 미측정 |
| P4 수용 | 열림 |

Linux Chromium 156.0.8078.79가 `ProcessSingleton`의 `socket() failed: Operation not permitted (1)`로 종료되어 Chrome CDP 연결을 시작하지 못했다. 원래 보고서는 `sourceIntegrity` 단계에 도달하지 못했다. 이후 독립 해시 대조에서는 보고서에 기록된 **1166파일, 변경 0**이다. 이 대조를 native qualifier로 바꾸지 않았다.

[원본 보고서](raw/native-browser.report.json.gz) · [Chromium stderr](raw/chrome.stderr.log.gz) · [실행·검사 수치](checks.json) · [독립 소스 재확인](source-recheck.json)

## 원인과 제품 변경

기준 Mac 실패는 [기존 영수증](../ui-renewal-p4/mac-fcb941d.md)에 보존한다. `fixture-1024x768`의 visual은 958×351이지만 stage는 545.765625×307이었다. 두 줄 대시보드 헤더 112px와 작업 공간 위·아래 패딩이 높이를 소비했다. 너비 958px의 16:9 이미지에는 538.875px 높이가 필요하며, 여기에 제목 44px·자막 48px·컨트롤 163px가 더해져 기존 공간에 들어가지 않았다.

작성 소스는 `dist/conference/player.css`와 `dist/conference/player.js`다. 컨퍼런스의 **1024–1279px 구간에만** 실제 내비게이션을 216px 왼쪽 열로 배치하고 헤더를 한 줄 48px로 줄였다. 기존 DOM 소유자, 링크, 44px 알약 항목과 포커스 규칙을 사용한다. 작업 공간의 세로 패딩을 회수하고 가로 패딩은 유지했다.

남은 높이에 비해 화면이 넓거나 자막·컨트롤이 줄바꿈되면, 실제 제목·자막·컨트롤·패딩·테두리·열린 대본 도크 폭을 측정해 **플레이어 카드 전체**의 최대 폭을 정한다. visual만 기존 작은 stage 크기로 축소하지 않는다. 기존 stage의 16:9 계산과 1120px 상한, 재생·탐색·URL·DOM 템플릿은 유지한다. 크기 변경은 ResizeObserver 전달 바깥의 한 animation frame으로 모으며, 뷰포트·부모 크기·도크·상태 변경에 이전 폭 제한을 재설정한다. 전체화면, 해당 구간 이탈, 파괴 시 폭 제한과 예약된 프레임을 정리한다.

스타일 번들·캐시 키·Pages 진입 HTML·부트 프리로드 해시는 기존 생성기로 갱신했다. 공유 셸 소스와 공통 토큰은 변경하지 않았다.

## 보조 검증 — native 수치와 구분

| 검사 | 결과 |
|---|---:|
| 기존 집중 단위·계약 | 117/117, 실패 0, skip 0 |
| 실제 컨트롤러에 크기를 주입한 계산 모델 | 26/26, 실패 0 |
| CSS 생성·검사 | 43소스·2번들, 통과 |
| 정적 검증 | 1159파일·221스크립트·847참조, 통과 |
| Pages 빌드·검증 | 104파일·9경로, 통과 |
| 프리로드 검사 | 통과 |

계산 모델의 1024×768 입력에서는 main 760×676, visual **742×463**, stage **742×417.375**, 너비 차이 **0px**다. 이 값은 **브라우저 실측값이 아니다.** Linkedom은 CSS·글자를 그리지 않으며, 크기·줄바꿈·computed style을 명시적으로 주입했다. 1279px, 부모 크기 복원, 도크, 알림·재시도 행, 전체화면, 1023/1280 경계, ResizeObserver 묶음 처리와 파괴 정리를 포함한다. 모델의 26/26을 원래 게이트의 14/14에 합산하지 않는다.

[계산 모델 결과](raw/layout-model.json.gz) · [검사 로그·모델 코드·실행 기록](raw/checks-and-model.tar.gz)

## 보존과 실미디어 상태

기준 대비 보호 4파일 **4/4**, 가격 축 **1/1**, 스크립트 **217/217**, 테스트 **424/424**, 다른 컨퍼런스 데이터·매니페스트 **5/5**, 공유 셸 **4/4**, 공통 토큰 **1/1**, 의존성 **2/2**가 동일하다. 기존 player CSS 규칙은 모두 보존하고 해당 구간의 규칙 8개만 추가했다. 검사기·표본·1px·16:9·1120·44px·2px·4.5/3.0·2500ms·h1 1개·오버플로 0·축 ±2px 기준을 완화하지 않았다. 이 소스 보존 결과가 이번 native 페인트·접근성·성능 통과를 뜻하지는 않는다.

정본 `dist/conference/media-manifest.json`의 unavailable 바이트와 기존 pages/audio는 수정하지 않았다. 이번 작업에서 실미디어 패키지를 만들거나 자산을 복사하지 않았다. 사용자가 보고한 이전 Mac 실미디어 결과는 **562/562 해시 일치**, **siteFileCount 1721 대 1530 preflight 실패**, **브라우저 시작 0**이다. 이 계약은 유지했고, 실미디어 20건을 이번 후보에서 재실행하거나 합성 미디어로 대체하지 않았다. 원래 14건 게이트의 선언된 fixture와 실미디어 20건은 별도다.

[소스 보존 해시](raw/source-preservation.json.gz) · [전체 요약](summary.json) · [원본 파일 해시 목록](raw-manifest.json)

기존 npm 17실패는 수정하지 않고 병합 전 게이트로 보류한다. main push, 배포, force push, reset, P2b, P5, D-1~D-8을 수행하지 않았다.

## Mac에서 같은 게이트

제품 SHA 또는 제품 파일이 동일한 후속 문서 커밋에서 아래 원래 전체 명령을 사용한다. 수용에는 **14/14·전체 실패 0**, `fixture-1024x768` stage와 visual의 실측 폭 차이 **1px 이내**가 필요하다. 이전 Mac의 13/14나 더 이른 14/14를 이 후보에 재사용하지 않는다.

```sh
ATLAS_BROWSER_PATH="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" node scripts/verify-conference-browser.mjs --out build/q-p4-1-browser-mac-12f0703
```

## Mac 14/14 — 2026-11-13 08:27 KST

제품 `12f0703`과 제품 경로가 같은 문서 `67113cb`에서 원래 전체 명령을 실행했다. 14/14, 실패 0, exit 0. `fixture-1024x768` stage 742×417.375, visual 742×463, 폭 차이 0px. Q-P4-1은 닫는다. 실미디어 20/20은 정본 dist 1721 대 ready siteFileCount 1530이라 시작하지 않았다. [영수증](../ui-renewal-p4/mac-12f0703.md).

