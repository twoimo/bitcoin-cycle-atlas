# R17 — 공용 가격 축의 표시 순서와 연속 프레임

## 판정과 범위

**제품 수정·회귀 계약 구현 완료, Mac 브라우저 수용 판정 대기.** 코드 커밋은 `91cf41ce2c73a272c8a0e7ccd7c101333b3970e0`이며 브랜치는 `fix/tradingview-responsive-20261110`이다. 요청 HEAD `d590982b61167a2e6b0656d9ab178e651d2d0384` 뒤에 추가된 문서 전용 `11f81069c5f37a5a5d7938347bff40cc8867704b`도 보존했다.

요구사항은 [REQ_WP_ABC_20261110 §A-5.2(2)](../../requirements/REQ_WP_ABC_20261110.md), 추적 항목은 [체크리스트 R17](../../LAUNCH_CHECKLIST_20261110.md)이다. 이번 기록은 R17 수정 후 브라우저 통과를 주장하지 않는다. 기존 macOS 영수증은 수정하지 않았다.

## 원인과 제품 변경

BTC·ETH는 이미 같은 64px 가격 거터와 4px 글자 inset을 사용했다. 첫 가격 눈금의 y가 다른 것은 데이터 도메인·nice tick 선택과 BTC/ETH의 데이터 상단 inset이 다르기 때문이다. 이를 맞추려고 실제 가격 좌표나 도메인을 바꾸지 않았다. 기존 공용 축에는 드래그 입력용 투명 사각형만 있고 최상단까지 이어지는 보이는 축선이 없었다. 가격 눈금과 최신 가격 태그도 일부 주석·증거 레이어보다 먼저 그려졌다. HTML 범례와 예측 설명은 오른쪽 가격 거터를 예약하지 않았다.

- `price-axis.js`가 눈금, 최신 관측 태그, 원래 커서 그룹을 최종 SVG paint owner에 배치한다. 별도 입력용 자식은 유지하되, 내보내기에서 입력용 자식과 transient cursor를 제거해도 가격 눈금·최신 값·축선은 남는다. ETH의 `.market-last-price` 전체를 유지하여 출처 title과 관측 가격선도 보존한다.
- 축선과 위·아래 경계 그리드는 SVG 표면의 `0..H` 전체를 잇는다. 가격 변환과 드래그 입력 범위는 원래의 `T..priceBottom`이다. 도메인 경계에 임의 가격을 만들어 표시하지 않는다. 빈 데이터 구간에도 같은 프레임을 적용하되 최신 가격을 제조하지 않는다.
- 보이는 눈금은 실제 bounding box를 hit 대상으로 사용하고, 숨겨진 눈금은 입력을 가로채지 않는다. 가격 배지와 눈금의 기존 충돌 억제·커서 복원 동작을 유지한다.
- HTML 범례·예측 설명은 renderer의 `--plot-right-gap`을 사용하여 가격 거터를 비운다. 공용 CSS만 수정했다.
- BTC 캔들에서 최신 태그가 원래 일봉 선의 값 대신 실제 표시한 거래소 캔들의 close를 사용하도록 수정했다. 같은 cutoff 날짜를 유지하며, 미래 값을 최신 관측으로 선택하지 않는다. 일봉 선은 원래 Coin Metrics 값이다.
- 경계선 추가가 기존 dense SVG의 `<100` 노드 예산을 넘는 것을 회귀 검사에서 발견했다. 동일한 스타일의 수평 그리드 선을 하나의 path로 묶어 모든 원래 좌표·눈금을 유지하고 기존 예산을 통과시켰다. 테스트 임계값은 바꾸지 않았다.

다음 네 파일은 요청 HEAD부터 바이트·SHA-256이 동일하다: `dist/equity-view.js`, `dist/eth-view.js`, `dist/instrument-indicator-overlay.js`, `scripts/verify-eth-candidate-browser.mjs`. R18/R19·미디어·요구사항 원문은 변경하지 않았다.

## 브라우저 계약

새 `scripts/verify-price-axis-browser.mjs`는 320·390·768·1440 × BTCUSD/ETHUSD × 기본 선/명시적 캔들의 **16케이스**, BTC/ETH 가로 정렬 **8쌍**을 검사한다. 각 케이스에서 실제 요청 뷰포트, 글자가 실제로 그려지는지, 원시 DOM 사각형 중심의 `elementFromPoint`, paint owner, clip, 축선 끝점·연속성, 가로 overflow, 독립 원자료의 최신 가격을 검증하고 스크린샷과 해시를 기록한다.

범례·이벤트·예측의 foreground 가림은 양의 소수 픽셀도 실패한다. 같은 SVG의 축보다 먼저 그려진 객체와의 교차는 별도 `underlaps` 증거이며 가림과 구분한다. 축선·경계선 가림도 검사한다. 전체 행렬에서 범례·이벤트·예측 각각의 실제 페인트를 한 번 이상 관측해야 통과하며, 관측하지 못한 종류는 명시적으로 미확인이다. ±2px는 BTC/ETH 거터·라벨 x·태그의 가로 정렬 비교에만 적용한다.

기존 제품은 선택 커서가 최신 가격과 같은 줄일 때 중복 최신 배지를 숨긴다. 이 동작은 유지하며, 숨겨진 최신 배지를 대신하는 커서는 **같은 마지막 관측 가격·날짜·readout**이어야 한다. 임의 커서나 미래 값을 최신 가격으로 인정하지 않는다.

검증은 저장소의 원래 JSON 스냅샷을 제공하는 자체 로컬 서버에서 실행하며 외부 갱신을 차단한다. 값은 라벨에서 역산하지 않고 파일에서 독립적으로 읽는다. 이번 스냅샷의 기대값은 BTC 선 `$75,826.53`(원값 `75826.5258667446`), BTC 캔들 `$75,746.53`(Bitstamp), ETH `$2,235.37`(Coinbase Exchange)이다. 사용자가 실측한 실시간 BTC `$73,805.52`를 고정 기대값으로 사용하지 않았다. 원본 데이터는 수정하지 않았다.

## 실제 실행 결과

최종 숫자·명령·파일 목록·SHA-256·원문 브라우저 실패 보고서는 [summary.json](summary.json)에 있다.

| 검사 | 결과 |
|---|---|
| 복구 환경의 관련 단위·계약 39파일 | **484/484**, 실패 0·skip 0. 최종 보강 하네스 테스트 포함, 중복 실행은 합산하지 않음 |
| 생성물 관련 테스트 재확인 | **18/18**, 실패 0·skip 0 |
| `verify:static` | exit 0, **968파일·219스크립트·972참조** |
| CSS 재생성 및 `--check` | **41원본·2번들**, 일치 |
| preload 재생성 및 `--check` | **55 URL·53파일·81 import edges**, 54 conference + 1 shared |
| 기존 53케이스 native 하네스 | exit 1, **53개 중 실행 0·통과 0**, DevTools 포트 대기 실패와 같은 socket EPERM stderr 기록 |
| R17 Chromium 하네스 | exit 1, **16개 중 실행 0·통과 0**, 정렬 8쌍 미실행, 스크린샷 0·hit 실측 0 |

Chromium은 첫 페이지를 열기 전에 다음 오류로 SIGABRT 종료했다. 새로운 설치나 권한 우회는 하지 않았다.

```text
FATAL:chrome/browser/process_singleton_posix.cc:297
Check failed: . socket() failed: Operation not permitted (1)
```

### 실행 환경 교체 전후의 구분

진행 중 실행 환경이 교체되어 기존 작업 디렉터리와 의존성이 사라졌다. 같은 원격 HEAD에서 복구했고, patch·파일 해시·최종 테스트로 복구본을 확인했다. 위 표는 복구 환경에서 실제 실행한 결과다. 다음 앞선 결과를 복구본의 재실행 통과로 합치지 않는다.

- 교체 전: 새 DOM 회귀 14개와 기존 축 4파일을 합쳐 **43/43**, TypeScript **exit 0**, `build:web` **exit 0**, 패널 테스트를 `node --import tsx --test tests/web/*.test.tsx`로 실행하여 **138/138**. `npm run test:panels` 자체는 tsx CLI IPC 소켓 EPERM으로 실패하여 같은 테스트를 Node loader 경로로 실행했다.
- 복구 후: `node_modules`가 없고 설치 금지 조건을 유지했다. `typecheck`는 **exit 127 (`tsc: not found`)**. DOM 축 2파일 실행은 **exit 1, 테스트 파일 2개 모두 linkedom import에서 차단**되어 본문 16개를 실행하지 못했다. 관련 선택 44파일 중 linkedom에 의존하는 5파일은 최종 39파일 숫자에 포함하지 않았다.
- `verify:pages`는 교체 전에도 **exit 1 (`Pages artifact file coverage changed`)**이었다. tracked asset 이름과 Vite 재빌드 이름이 달랐으며 기준 커밋 자체의 같은 빌드를 대조하지 못했으므로 기존 문제라고 단정하지 않는다. 복구 후 재시도는 **exit 1, `node_modules/skullet/package.json` 부재**로 실제 Pages 빌드 전에 차단됐다. Pages 자산을 임의로 갱신하지 않았다.

초기 추가 회귀는 CSS 캐시 식별자를 13자로 쓴 오류 1건을 잡았다. SHA-256의 기존 12자 계약으로 수정한 뒤 38/38, 생성물 18/18을 재확인했다. 중단된 이전 전체 회귀·전체 `npm test`·A-9 브라우저 성능·미디어 하네스를 통과 수치에 포함하지 않았다.

## Mac 재실행과 남은 확인

저장소 루트에서 기존 결과가 없는 새 출력 경로를 사용한다. 출력 디렉터리의 부모가 없어도 생성하고, 이미 있는 출력 디렉터리는 덮어쓰지 않는다.

```sh
node scripts/verify-price-axis-browser.mjs \
  --browser "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
  --out build/r17/mac-price-axis-91cf41c
```

`report.json`의 `status: passed`, `qualifiesPriceAxisVerification: true`, 케이스 **16/16**, 정렬 **8/8**, overlay coverage 통과와 실제 스크린샷을 확인한다. 이 환경에서는 가림 0·overflow 0·±2px를 실제 화면에서 측정하지 못했다. 정상 의존성이 있는 환경에서 DOM·typecheck·Pages 검증도 재실행해야 한다.

A-9 2,500ms, 150ms 전환, Range 206/416, 정확한 seek, h1 1개, 미디어 없음 skip exit 2 계약을 완화하지 않았다. main 직접 push·병합·배포·force push·새 도구 설치·계정 및 권한 변경·미디어 파일 커밋을 수행하지 않았다.
