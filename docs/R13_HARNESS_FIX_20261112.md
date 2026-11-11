# R13 — native select·h1 기준 캡처 안정화 (2026-11-12 KST)

## 범위와 소스

저장소 `twoimo/bitcoin-cycle-atlas`, 브랜치 `fix/tradingview-responsive-20261110`의 R13 작업이다. 요청에 적힌 `b23cd23` 뒤에 원격에 올라온 문서 전용 커밋 `86b758a`를 보존했다. 제품 코드와 CSS는 바꾸지 않았다.

최종 검사 소스는 `4f934b3e3ec2050f6b9b3dff50e2b35db3d4a24d`, 전체 tree는 `591ef9972e330982bcb3c70ff1df1beae04286b7`이다. 이 소스를 실제로 체크아웃해 아래의 검증을 실행했다. 커밋 객체 생성만으로 브랜치를 이동하지 않았으며, 전체 검증 후 보고서·증거와 함께 지정된 브랜치의 ref만 fast-forward했다.

## 변경 파일과 동작

### `scripts/verify-conference-browser.mjs`

기존 Home → ArrowDown 반복 → Enter 경로를 `selectNativeOptionByKeyboard`로 교체했다. 인자는 실제 하네스의 device metrics와 같은 `{width,height,mobile:false}`다. 좁은 폭의 touch emulation과 device metrics의 mobile 플래그는 서로 다르므로 혼동하지 않았다. `platform`은 전달하지 않고 헬퍼 기본값을 쓴다.

선택 후 최종 `.value` 일치를 기다리는 기존 조건은 유지했다. 각 선택에서 실제 keydown·keyup·input·change를 관찰해 `isTrusted`, 보낸 키 순서, keydown의 select 소유권, 실제 변경 시 input/change 발생을 검사한다. 이미 선택된 값에는 변경 이벤트를 요구하지 않는다. `.value` 대입이나 합성 change/input은 없다. 가져온 헬퍼도 소스 해시 목록과 실행 중 불변 검사에 포함했다.

공용 헬퍼의 정상적인 `scrollIntoView` 뒤, 문서가 48px 내려가면 데스크톱 자막창의 닫기 버튼이 고정 외부 헤더 아래에 가려질 수 있었다. 기존 하네스는 `(1362,30)`의 좌표만 누르고, 실제 클릭이 `DIV.atlas-shell-copy`로 전달된 뒤 포커스 복귀 검사에서 실패했다. 이제 스크롤 후 렌더를 기다리고 새로운 좌표에서 hit test를 한다. nearest·center 정렬로도 고정 헤더에 가려진 경우에만 측정한 `-scrollY`를 실제 CDP mouseWheel로 보낸다. 문서 `scrollY===0`과 새 hit test를 확인한 뒤 mousePressed/Released를 한 번씩 보낸다. 원래 닫기·포커스 assertion은 유지했다.

BTC/ETH에서 컨퍼런스로 진입하는 검사는 직접 진입과 같은 문서 complete, fonts loaded, 실제 미디어 metadata·장표 image, 안정된 재생 버튼 좌표를 기다린다. 재생 클릭은 한 번이며 실제 전달과 신뢰 여부를 기록하고, playing=true와 audio.paused=false를 함께 확인한다. 아직 파싱 중인 iframe의 documentElement가 null일 때 읽기 함수가 던지던 오류도 고쳤다. 준비되지 않은 문서는 기존 boot=ready 판정을 통과할 수 없다.

### `scripts/verify-page-heading-browser.mjs`

`verifyAncestorResize.before`를 raw evaluate 대신 `settledHeading(...,{waitForBtcRefresh:true})`로 캡처한다. 비교 차트 준비 신호 이후 provider 요청이 계속 진행될 수 있으므로, 고지의 aria-busy/state가 refreshing인 동안 안정화 표본을 초기화한다. 실제 요청이 종료된 뒤 같은 geometry·고지 상태를 연속 관찰하고 기준을 기록한다. 실패/지연 고지가 계속 보이는 상태도 유효하며, 하네스가 고지를 숨기지 않는다.

고지의 상태·숨김 여부·busy·사각형·예약 높이를 증거에 추가했다. app.js와 btc-refresh-status.js의 해시도 기록한다. before/shifted/restored 예외는 실패 항목으로 보존하고, 복원 오류가 원래 오류를 지우지 않도록 했다. **72px 이동 및 0.01px 허용치는 그대로다.**

## 내비게이션 실패의 판정

일반 내비게이션의 준비 부족과 iframe 읽기 레이스는 하네스에서 수정했다. 별도로 **제품의 초기 로딩 중 재생이 최초 pageshow에 의해 정지되는 문제를 실제로 재현했다.**

진단은 원래 optional-font CSS 응답을 잠시 보류한 뒤, 신뢰된 재생 클릭 직후 원문 그대로 재개했다. 제품 소스·응답 바이트·오디오 시계·pageshow 이벤트를 조작하지 않았다.

| 실제 이벤트 | 문서 기준 시각 | 관측 |
| --- | ---: | --- |
| 재생 버튼 클릭 | 5,611.4ms | isTrusted=true, 정확한 버튼, 문서 interactive |
| 네이티브 playing | 5,647.9ms | 실제 오디오 재생 시작 |
| 네이티브 pageshow | 6,047.7ms | playing=true, paused=false, audio time 0.336778s |
| 다음 animation frame | 6,051.0ms | playing=false, paused=true, time 0s |
| 네이티브 pause | 6,053.7ms | 정지 이벤트 확인 |

원인은 `dist/conference/player.js`의 `pageshow → syncFromUrl() → pause()`다. 최초 로드가 늦게 끝나도 pageshow에서 URL 상태를 재적용해, 이미 사용자가 시작한 재생을 정지시키고 URL의 시각으로 되돌린다. 제품 코드 변경은 이 요청 범위에 넣지 않았으며, 이 진단은 **0/1·FAILED**로 남긴다. 정상 컨퍼런스 14개는 문서 로드 후의 상호작용·이탈을 검증한다. 그 통과를 초기 로딩 중 재생 문제의 해결로 해석하지 않는다.

## 실제 검증

최종 소스 검증은 Linux x64, Node 24.22.2, HeadlessChrome 157.0.8103.38에서 수행했다.

| 검사 | 실제 결과 | 근거 |
| --- | --- | --- |
| 컨퍼런스 | **14/14**, 실패 0·exit 0 | PNG 24장, 소스 969개 실행 중 불변 |
| h1 계약 모드 | **15/15** | `--baseline` 없이 계약 검사 |
| h1 보충 | **9/9** | 390px 5종 + conference 4개 폭 |
| h1 layout-shift | **2/2** | compare 320·390, 원래 72px/0.01px 유지 |
| 기존 전체 브라우저 | **53/53**, 실패 0·exit 0 | 873,452ms, 소스 158개 실행 중 불변 |
| 반응형 | **44/44**, 실패 0·exit 0 | BTC·ETH·MSTR·BMNR 각 11개 |
| WP6 | **30/30**, 실패 0·exit 0 | 기존 30개, 수용 조건 유지 |
| chart-qa | **12/12**, 실패 0·exit 0 | 기존 12개, 수용 조건 유지 |
| npm test | **3,428/3,428**, 실패 0·skip 0·exit 0 | `complete:true`, `batches:1`, frozen 파일 포함 |

select 선택은 89회이며 실제 값 변경 87회, 이미 선택된 값 2회다. 신뢰된 화살표 키 입력 105쌍을 보냈고 keydown 105·keyup 105·input 105·change 105, **420개 이벤트 모두 isTrusted=true**였다. 신뢰되지 않은 이벤트는 0개다. Linux에서는 원래 내부 popup 경로를 사용했고, macOS 분기의 실제 브라우저 실행은 사용자의 재측정으로 남긴다.

컨퍼런스 수치는 기존 하네스의 synthetic timeline·무음 WAV fixture 범위다. 실제 강연 원본의 장표·음성 동기화 품질은 이번 검증 대상에 포함하지 않았다.

두 내비게이션 케이스 모두 같은 실행에서 통과했다. 재생 직전 document=complete, fonts=loaded, imageReady=true, audio.readyState=4, play hit-test=true였고, 신뢰된 버튼 클릭 후 playing=true·paused=false를 관찰했다. 목적지로 떠난 뒤 컨퍼런스 player/audio는 모두 0개였다.

| compare | h1 top: before → shifted → restored | toolbar top | plot.top before/restored | 복원 geometry 최대 오차 |
| --- | --- | --- | --- | --- |
| 320×900 | 869.5 → 797.5 → 869.5px | 852 → 780 → 852px | 0 / 0px | 0px |
| 390×900 | 869.5 → 797.5 → 869.5px | 852 → 780 → 852px | 0 / 0px | 0px |

툴바와 anchor의 폭·높이 변화는 0px다. 이 Linux 정규 실행의 기준 고지는 idle·hidden=true·busy=false·예약 높이 0px였다. 실제 53px 고지가 등장한 후 사라지는 macOS 조건의 최종 실측은 별도로 남긴다. 53개 하네스의 10× 재생 평균 간격은 127.4625ms로 기존 85–130ms 범위 안이다.

모든 정규 게이트의 종료 코드는 0이며, 실행 전후 소스 변경은 0건이다. 실제 소요 시간은 컨퍼런스 183.544초, h1 46.637초, 기존 53개 873.452초, 반응형·WP6·chart-qa 묶음 591.244초, npm 510.331초다. 전체 실행은 2026-11-11 23:05:26.114–23:42:11.805 UTC였다.

원본 `ATLAS_TEST_TOTAL`은 다음과 같다.

```json
{"complete":true,"tests":3428,"pass":3428,"fail":0,"skipped":0,"batches":1}
```

요청한 Docker 실행 경로를 PATH에 넣었다. 이 Linux 환경의 Node 24.22.2/x64는 `scripts/test.mjs`의 canonical runtime과 일치하므로 frozen 3개 파일까지 네이티브 한 배치에 포함했다. Docker 별도 배치는 실행하지 않았다.

[검증 요약](evidence/r13-harness-20261112/summary.json), [정규 실패 목록](evidence/r13-harness-20261112/failures.json), [진단 원본 요약](evidence/r13-harness-20261112/diagnostics/summary.json), [실행 명령·시간·종료 코드 원본](evidence/r13-harness-20261112/verification/executions.json.gz)을 함께 보존했다. 원본 보고서·로그·진단 프로브는 바이트를 바꾸지 않고 gzip으로 묶었고, [manifest](evidence/r13-harness-20261112/manifest.json)와 [SHA256SUMS](evidence/r13-harness-20261112/SHA256SUMS)에 원본/저장본 해시를 기록했다.

PNG 고유 파일 739개·영수증 참조 1,335건의 크기·SHA-256·PNG 서명을 모두 확인했고 대표 6장을 커밋했다. 재생 검사가 생성한 대용량 JSON 다운로드 48개도 보고서의 크기·해시와 대조했으며, Git에는 중복 payload 대신 [검증 목록](evidence/r13-harness-20261112/replay-download-verification.json)을 남겼다. 진단 8개 실행의 제품 파일 963개씩을 최종 소스와 대조한 결과 차이는 모두 0건이다. 중단된 첫 통합 실행의 소스는 작은 git bundle로 함께 보존했다.

## 재현 명령

Linux 실행 환경은 실제 영수증에 기록된 Node 24.22.2 linux/x64와 Chrome for Testing이다. 기본 경로가 다른 환경에서는 ATLAS_BROWSER_PATH에 실제 Chrome 실행 파일을 지정한다. Linux 고정 기준과 동일한 Node를 사용해 frozen 파일도 네이티브로 실행했다. macOS의 Docker 경로는 다음과 같이 포함한다.

```bash
export PATH="/Applications/Docker.app/Contents/Resources/bin:$PATH"
node scripts/verify-conference-browser.mjs --out build/r13/conference
node scripts/verify-page-heading-browser.mjs --out build/r13/heading
ETH_BROWSER_IMAGE_LOG_MODE=failures-only ATLAS_BROWSER_OUT=build/r13/native-53 node scripts/verify-native-browser-suite.mjs
node docs/evidence/chart-h1-20261112/r10-browser-gates.mjs "$PWD" "$(git rev-parse HEAD)" build/r13/r10
npm test -- --test-concurrency=4
```

브라우저의 외부 응답 검증에는 기존 시스템 CA와 동일한 신뢰를 작업 전용 NSS DB에 구성했다. 인증서 검증은 켜 둔 채 실행했으며, 시스템·사용자 기본 신뢰 저장소는 변경하지 않았다. 설정·종료 확인 영수증은 증거의 `runtime/`에 보존했다.

첫 컨퍼런스 통합 실행은 12개를 관찰한 시점에 8 통과·4 실패로 중단했으며 종료 코드는 130이다. 데스크톱 닫기 클릭이 고정 헤더에 가려진 문제였고, 중단 실행은 최종 수용 수치에 합산하지 않는다. center 정렬만 한 진단도 실패한 원본을 보존한다. 외부 TLS 설정 전 진단 실패와 iframe 읽기 실패, 초기 pageshow 제품 실패도 각각 원래 상태로 남긴다.

## 남은 확인

- macOS Chrome에서 컨퍼런스 14개와 h1 15+9+2의 독립 재측정. Linux 실측과 기존 헬퍼의 macOS 분기 단위 검사를 실제 macOS 실행으로 대신하지 않는다.
- 초기 문서 로딩 중 사용자가 시작한 재생을 최초 pageshow가 멈추는 제품 문제. 진단 0/1 실패 유지, 제품 수정 미실시.

main 직접 push·병합, 배포, 유료 용량 생성, 계정·권한 변경은 하지 않았다.
