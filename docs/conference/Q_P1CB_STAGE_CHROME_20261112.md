# Q-P1c-B-1 — 장표 크롬을 16:9 프레임 밖으로 이동

- 요구사항: `docs/requirements/REQ_WP_ABC_20261110.md` §A-5.3
- 브랜치: `fix/tradingview-responsive-20261110`
- 기준 커밋: `ec36fb00db947c5dc0ccb33e216971368fd7c61e`
- 상태: 제품 수정 및 Node 단위·계약 검증 완료. **Mac 4뷰포트 실측 대기**이며 Q-P1c-B-1의 브라우저 수용 완료를 선언하지 않는다.

## 제품 변경

`.conference-stage-shell` 안에 정상 흐름의 `.conference-stage-header`와 16:9 `.conference-stage`를 형제로 배치했다. 헤더는 프레임 바로 앞에 있으며, 행사·발표 제목, 미매핑 배지, 확대·전체화면·페이지 입력을 포함한다. 도구와 배지의 기존 absolute 배치 및 모바일 오프셋을 제거했다.

- 배지의 기존 텍스트, `hidden` 전환, 미매핑 시 이전 장표 유지 동작은 그대로 사용한다. 숨겨지지 않는 metadata 부모에 기본 44px, 모바일 52px 높이를 예약하고, 좁은 화면의 배지는 줄바꿈을 허용한다.
- 버튼과 페이지 입력은 최소 44×44px 계약을 유지한다. 도구의 2px 포커스 링은 안쪽으로 배치하여 프레임 위로 그려지거나 조상 경계에서 잘리지 않게 했다. 기존 입력 DOM, 이벤트 위임, 키보드 경로, 확대 `aria-pressed`와 라벨을 유지한다.
- 전체화면 대상은 헤더와 장표를 포함하는 shell이다. `fullscreenchange`에서 버튼의 `aria-pressed`·라벨과 장표 크기를 동기화한다. 일반 보기에서는 visual 영역, 전체화면에서는 shell 영역에서 실제 헤더 높이를 제외한 뒤 16:9로 맞춘다. 헤더 높이는 ResizeObserver로 관찰한다.
- 재로딩·오류·빈 데이터 상태에서 옮겨진 도구와 페이지 입력도 비활성화한다.
- 1024–1279px의 기존 전폭 장표 계약을 위해, 26px 제목 행을 44px 헤더로 교체하면서 늘어난 18px를 main 위 패딩 8px, 캡션 여백 8px, 컨트롤 행 간격 2px에서 회수했다. 캡션은 외곽 48px에서 패딩 합계 3px와 테두리 1px를 뺀 **44px = 22px × 2줄**을 유지한다. 이는 CSS 치수 산술이며 수정 후 브라우저 측정값은 아니다.

## 실제 실행한 검증

환경: Node `v24.22.1`, 기존 의존성 사용. 브라우저 및 새 도구 설치 없음.

```sh
node --test --test-reporter=tap tests/conference-*.test.mjs \
  tests/static-module-references.test.mjs tests/boot-preloads.test.mjs \
  tests/site-preloads.test.mjs tests/boot-shell.test.mjs tests/site-styles.test.mjs
npm run typecheck
npm run verify:static
node scripts/build-site-styles.mjs --check
node scripts/build-site-preloads.mjs --check
node --check dist/conference/player.js
git diff --check
```

`--check` 전에 기존 `build-site-styles.mjs`의 `buildSiteStyles()`로 CSS를 재생성하고, 생성된 SHA-256 접두사로 `dist/index.html`의 stylesheet URL을 갱신했다. 이어 기존 `build-site-preloads.mjs`의 `buildSitePreloads()`로 HTML과 preload manifest를 재생성했다. 별도 생성기나 의존성을 추가하지 않았다.

| 검사 | 결과 |
|---|---|
| 관련 단위·계약 테스트 17파일 | **264/264 pass, fail 0, skip 0** |
| 위 결과에 포함된 player 테스트 | **61/61 pass**; 이번 변경에 5개 테스트 추가 |
| typecheck | exit 0, TypeScript 오류 0 |
| verify:static | **968파일, JS/MJS 219개, 정적 참조 972개**, status `ok` |
| CSS 재생성 후 `--check` | 41개 소스 시트, 생성 번들 2개 일치 |
| preload 재생성 후 `--check` | 모듈 URL **55**, 고유 파일 **53**, conference preload **54**, 공통 preload **1**, 정적 import edge **81** |
| JavaScript 구문·diff 공백 검사 | exit 0 |

추가 회귀는 320·390·768·1440의 DOM 형제 관계, 실제 커밋 timeline의 `t=3283&deck=final-290`에서 7쪽 유지와 배지 표시, 페이지 6 직접 입력 시 정확한 `2401.74` 이동, `[`·`]`, 확대·전체화면 상태, 로딩·오류 경로를 확인한다. 전체화면은 DOM 테스트의 모의 API이며 실제 브라우저 전체화면 실행이 아니다.

320·390·768·1024·1440의 크기 계산 테스트는 **주입한 측정값을 사용하는 모델**이다. 헤더 높이 변경, 1120px 상한, 전체화면의 별도 크기, 해제 후 복원, observer·이벤트 정리를 확인한다. 렌더링 엔진의 사각형 교차, 폰트 줄바꿈, 실제 포커스 페인트를 측정한 결과로 사용하지 않는다.

생성 결과 식별자:

- `site-after-shell.css`: 166,998 bytes, SHA-256 `88c36117bd2f6fc4fb01e4d8492b86c844600cdd7ce3e1dde237e4ad51529adc`
- preload manifest SHA-256: `d24c4af9f40358d3cf97fb6d29052c440981a4d12962979d4543b106caa7ce86`
- timeline SHA-256: `fd15b3ef18213b9adc3bff87d523cc1c2ca907ca59163b646d55308c5d1666ad` (변경 없음)

## 보존 확인

기준 커밋과 비교해 보호된 `dist/equity-view.js`, `dist/eth-view.js`, `dist/instrument-indicator-overlay.js`, `scripts/verify-eth-candidate-browser.mjs`는 **4/4 Git blob 동일**이다. 기존 media 하네스·계약·서버·관측 파일 7개도 동일하다. **150ms, Range 206/416, 정확한 seek 단언, H1 1개, 미디어 없음 skip exit 2**는 수정하지 않았다.

기존 macOS 영수증과 QA 자료는 수정하지 않았다. `31fea06`에서 얻은 이전 Mac 20/20 결과는 해당 커밋의 역사적 증거이며, 이 레이아웃 변경의 브라우저 수용 결과가 아니다.

## 실행하지 않은 것과 남은 확인

브라우저가 없는 환경이므로 다음 항목은 Mac에서 확인해야 한다. 현재 교차 면적·실제 타깃 치수는 **미측정**이다.

| 뷰포트 | 남은 수용 판정 |
|---|---|
| 320×740 | 도구·페이지 필드·배지와 장표의 사각형 교차 면적 각각 0, 타깃 ≥44×44px, 배지 표시 |
| 390×844 | 동일 |
| 768×1024 | 동일 |
| 1440×900 | 동일 |

미매핑 확인 URL은 `?page=conference&t=3283&deck=final-290`이다. 7쪽 장표와 `이 구간에 맞는 장표 없음` 배지가 함께 보여야 한다. 페이지 6 직접 입력 후 6쪽과 `t=2401.74`, 키보드 탐색·포커스, 확대, 전체화면 진입·해제도 확인한다. 기존 1024×768 전폭 계약은 위 여백 조정이 실제 셸에서도 유지되는지 회귀 확인한다.

실제 547장 WebP·15세션 오디오 20케이스, 브라우저 스크린샷·접근성 페인트, 저장소 전체 `npm test`, 배포는 실행하지 않았다. 이번 검증은 요청 범위의 단위·계약·typecheck·static·생성물 확인에 한정한다.
