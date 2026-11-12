# P1c-B — macOS 6/20 후속 판정·관측 수정

기준 커밋은 `9a43cb9fc5c37800fd99885c0344f49528eae51e`다. [Mac 실자산 기록](P1C_B_MACOS_HARNESS_20261112.md)과 [원본 JSON](P1C_B_MACOS_HARNESS_20261112.json)의 실패 14건을 바탕으로 **P1c-B 하네스만 수정**했다. 기존 Mac 기록은 바꾸지 않았다. 이번 Linux 실행에는 실제 미디어가 없으며, **브라우저를 실행하지 않았다. 수정 후 20/20 통과를 주장하지 않는다.**

## 1. 바뀐 판정

### 1.1 요청한 seek와 네이티브 시계 판독을 분리

`Page.addScriptToEvaluateOnNewDocument`로 앱보다 먼저 [네이티브 setter 관측기](../../scripts/conference-media-seek-observer.mjs)를 설치한다. 관측기는 `.conference-audio`에 대한 앱의 `currentTime` 대입 원값을 기록하고, 원래 네이티브 setter에 **같은 receiver·같은 인자를 정확히 한 번** 전달한다. getter, 반환값, 오류 객체와 descriptor 속성을 유지한다. 값을 선택하거나 보정하지 않으며 합성 입력·seek 이벤트를 만들지 않는다.

탐색과 각 신뢰 사용자 입력마다 관측 구간을 분리한다. 첫 시도, 메타데이터 준비 뒤 재시도, 추가 재요청을 모두 보존하고 **모든 요청**에 `requestedLocalTime === originalEventTime - session.t0`를 적용한다. 마지막 요청만 보고 이전의 잘못된 요청을 버리지 않는다. 적어도 한 번은 네이티브 setter가 요청을 받아들여야 한다. 각 요청의 시각·요청 source·이전 `currentSrc`·당시 URL·이벤트 종류도 남긴다. 실패하더라도 닫힌 관측 구간은 `seekObservations`에 보존한다.

[seek 판정 계약](../../scripts/conference-media-browser-contract.mjs)은 정확한 요청 증거를 통과한 경우에만 다음 read-back 정책을 적용한다.

| 검사 | 계약 |
| --- | --- |
| 앱이 실제 대입한 지역 시각 | 원래 이벤트 시각에서 세션 `t0`를 뺀 값과 **정확히 같음** |
| 소스·재생 상태 | 예상 세션, 오류 없음, metadata 준비, seek 완료, 아직 일시정지 |
| 네이티브 `currentTime` 판독 | 요청값에서 **AAC 3프레임 = 3 × 1024 / 48000 = 0.064초** 이내 |
| 플레이어 이벤트 시계 | `session.t0 + audio.currentTime`과 **1ms 이내** — 기존 앱/native 일치 허용치 유지 |
| 장표 시각 매핑 | 원래 `timeline`의 `step.t0`를 실제 요청했는지 별도로 검사. 64ms를 매핑값에 적용하지 않음 |

3프레임은 제공된 최대 50ms 차이를 포함하는 최소 정수 프레임 수(`ceil(50 / 21.333…)`)다. **AAC나 Chrome이 일반적으로 64ms 정확도를 보장한다는 뜻이 아니다.** 긴 시각을 double로 뺄 때의 몇 ULP만 계산 오차로 분리한다. 프레임 수·예산을 바꾸는 CLI 옵션은 없다. 64ms를 넘는 판독, 잘못된 source, 변화한 실제 요청, 앱/native 시계 불일치는 계속 실패다.

### 1.2 첫 장표를 진입 기준선으로 관측

[장표 관측기](../../scripts/conference-media-slide-observer.mjs)는 입력 **전** page·deck·시각·요청 source·`currentSrc`·완료 여부를 저장한다. 이미 첫 스텝을 선택한 경우, 이미지가 아직 로딩 중이어도 `]`로 다음 페이지를 보내지 않고 첫 장표를 baseline으로 디코드한다.

baseline에서는 실제 현재 장표 컨트롤(`[data-action=slide]`)을 신뢰 포인터로 클릭해 동일한 원래 `step.t0` 요청도 확인한다. 이 클릭 전의 decode가 이후 source 세대를 대신 증명하지 않도록, seek 완료 뒤 같은 장표를 다시 관측해 현재 source의 decode와 두 RAF를 확인한다. `initialBaselineDecode`와 `postSeekObservation`을 모두 남긴다.

baseline의 `milliseconds`·`trusted`는 **null**이다. 가상의 0ms 전환을 만들지 않는다. 나머지 스텝은 기존 `]` 신뢰 키 입력부터 실제 decode 및 두 RAF까지 측정한다. `baselines + transitions`가 덱의 전체 매핑 장표 수와 같아야 한다(현재 final 73 + R17 127 = 200). 잘못된 page·deck·실제 source 또는 H1 개수는 기준선에서도 실패다.

원본 소스는 각 덱을 새 컨텍스트의 `t=0` 탐색으로 시작하고 RAF로 상태를 읽는다. 따라서 Mac의 최종 상태만으로 “덱 전환 직후였고 새 load 이벤트가 없었다”는 상세 순서를 확정하지 않는다. 새 `observation.entry`가 실제 입력 전 상태를 남겨 다음 실행에서 이 차이를 확인할 수 있다.

### 1.3 decode 결과를 현재 이미지 요청에 귀속

요청 `src`와 `currentSrc`가 모두 해당 스텝을 가리킬 때만 `decode()`를 호출한다. 관측 token·플레이어/이미지 노드·page/deck·source 속성·source 변경 세대를 decode 전후 및 두 RAF 각각에서 확인한다. `A → B → A`처럼 URL 문자열이 돌아오는 변경도 `src/srcset/sizes` mutation 세대로 구별한다.

변경된 요청 또는 이전 token의 거부라는 증거가 있을 때만 폐기하고 재관측한다. 같은 현재 요청에서 발생한 `EncodingError`는 **첫 시도에서 실패**한다. Pillow 성공이나 HTTP 200만으로 브라우저 decode 실패를 지우지 않는다. 동일한 page/deck를 다시 쓰는 렌더는 source 변경 증거가 아니다. 재관측은 원래 키 입력 시계를 다시 시작하지 않으므로, 회귀 테스트의 **164ms** 결과는 그대로 150ms 단언에서 거부된다.

### 1.4 optional manifest 404 완료 관측

[manifest 관측기](../../scripts/conference-media-observation.mjs)는 탐색 직전의 서버 영수증·CDP 요청·CDP 응답 인덱스를 저장하고, **현재 탐색의 정확한 URL·GET·서버 모드**에 귀속된 한 응답만 사용한다. intentional missing의 `404 / complete / 35B`는 CDP `responseReceived`와 `loadingFinished` 쌍이 없어도 완전한 서버 전송 영수증으로 완료를 판단한다.

이전 탐색, 다른 origin/경로, 중복, 취소/중단, 미완료, 길이 불일치, 잘못된 상태/MIME, HTML fallback은 완료로 세지 않는다. CDP 응답이 있으면 서버 결과와 일치해야 한다. 해당 현재 요청의 `net::ERR_HTTP_RESPONSE_CODE_FAILURE`만 완전한 intentional 404와 연결해 별도 기록하고, 일반 네트워크 오류·CORS·취소는 계속 실패시킨다. 오디오 source 변경으로 생기는 기존 다운로드 취소와 manifest 취소를 구별한다.

그 뒤 렌더 안정화와 실제 **“장표 이미지 없음”·“오디오 없음”**, 비어 있는 src, 재생 비활성, 자막 활성, H1 한 개 단언은 그대로 수행한다. 로컬 설치본이 unavailable이면 브라우저 전 단계에서 **명시적 skip / exit 2**다. HTTP 응답 완료만으로 폴백 UI 성공을 대신하지 않는다.

## 2. 원본 수치에서 추가로 확인한 사실

### 2.1 11개 차이의 원인은 아직 구분되지 않았다

원본 Mac JSON에는 native setter 요청 기록이 없다. 11건의 관측 지역 시각에 세션 `t0`를 더하면 **모두 목표 이벤트 시각을 소수 첫째 자리로 반올림한 값과 최대 1.00000034µs 차이**다. 이는 [기존 플레이어](../../dist/conference/player.js)의 `writeUrl()`에 있는 `Math.round(state.time * 10) / 10`과도 일치한다.

기존 플레이어를 그대로 쓰는 읽기 전용 단위 진단에서, 정확한 값을 그대로 돌려주는 FakeMedia로 `timeupdate → pageshow` 순서를 전달하면 `writeUrl → syncFromUrl → ensureAudio`를 통해 두 번째 실제 요청이 반올림된 이벤트 시각으로 바뀐다. **11/11**에서 Mac 값과 1.01µs 이내로 맞았고 exit 0이었다. 예: 이벤트 목표 `3280.84`, 첫 지역 요청 `1164.46`, URL `3280.8`, 다음 지역 요청 `1164.42`.

이는 **가능한 경로의 단위 재현**이며 Mac에서 실제로 그 이벤트 순서가 발생했다는 증거는 아니다. 원본 기록만으로 AAC 시계 판독이 유일한 원인이라고 확정하지 않는다. 새 회귀 테스트는 정확한 첫 요청 뒤 이 반올림 재요청이 나타나면, 최종 판독이 64ms 안이어도 반드시 거부한다. 제품은 수정하지 않았다. 다음 Mac의 요청 원값·URL·trigger 기록이 두 경우를 구분한다.

### 2.2 통과 경계 개수

원본 문장에는 경계 “4건”이라고 되어 있지만 `passedCases`와 `boundarySeekDetail`에 실제 열거된 것은 **04→05, 05→06, 06→07의 3건**이다. 3개 통과 + 11개 실패 = 14경계이며, 다른 세 케이스와 합하면 총 6/20이다. 네 번째 경계 결과를 추정하지 않았다.

이들은 실패한 11건과 같은 코드 경로다. 그 목표 시점들이 기존 1ms 검사에 맞았다는 결과이며 별도의 더 정확한 경로가 성공한 것은 아니다. 원본에는 이 세 건의 `observedCurrentTime`이 null이므로 구체적인 오디오 눈금이나 위 이벤트 순서를 추가로 단정하지 않는다.

## 3. 이번 Linux 검증

기존 Node **v24.22.2 linux/x64**와 설치돼 있던 의존성만 사용했다. 새로운 도구 설치, 실제 브라우저, 실제 자산 렌더, 배포는 실행하지 않았다. 명령에 사용한 PATH는 다음과 같다.

```sh
export PATH="$PWD/build/toolchain/node-v24.22.2-linux-x64/bin:$PATH:/Applications/Docker.app/Contents/Resources/bin"
```

| 실행 명령 | 실제 결과 | exit |
| --- | --- | ---: |
| 아래 집중 테스트 6파일 | **96/96**, fail 0, skip 0, **671.87ms**. seek 계약 24 + manifest 16 + setter 12 + 장표 관측 14 + CLI/장표·HTTP 판정 11 + 서버 19 | **0** |
| `npm test` | **complete:true, 3,617/3,617, fail 0, skip 0**, 1배치, **196,722.60ms** | **0** |
| `npm run typecheck` | TypeScript 오류 0 | **0** |
| `npm run verify:static` | `status:ok`, **968파일·219 script·972 reference** | **0** |
| `npm run verify:conference -- --timeline dist/conference/timeline.json --sources docs/conference/source-segments.json --out build/p1cb-followup-timeline.json` | **9,168/9,168**, 누락·추가·중복·변경 각 0, 프로그램 15·덱 2·20,400초 | **0** |
| `node scripts/build-site-styles.mjs --check` | stylesheet **41개**, 생성물 2개의 바이트/해시 일치 | **0** |
| `node scripts/build-site-preloads.mjs --check` | URL **55**, conference 전용 54 + shared 1, 정적 import edge 81, timeline fetch preload 유지 | **0** |
| `npm run verify:conference:media -- --dist dist --out build/p1cb-media-browser-linux-followup-20261112` | **skipped**, cases 0·passed 0·skipped 1, **browserLaunched:false**. 이유: `media manifest declares unavailable; real media checks were not run` | **2** |
| `npm run verify:pages` | 기존 `Pages artifact file coverage changed`. 커밋된 `index-ByyNTPeH.js`와 새 빌드 `index-C6TQnx3Q.js` 불일치 유지 | **1** |
| `git diff --check`, 보호 경로 비교 | 공백 오류 0, 아래 보호 대상 변경 0 | **0** |

집중 검증 명령은 다음과 같다. 단위 fixture는 이벤트·source identity와 작은 HTTP 바이트를 제어하며, 실제 547장이나 15세션의 브라우저 재생을 대신하지 않는다.

```sh
node --test --test-reporter=tap \
  tests/conference-media-browser-contract.test.mjs \
  tests/conference-media-observation.test.mjs \
  tests/conference-media-seek-observer.test.mjs \
  tests/conference-media-slide-observer.test.mjs \
  tests/conference-media-browser.test.mjs \
  tests/conference-media-server.test.mjs
```

검증별 출력·로그 SHA-256·소스 SHA-256·skip 영수증과 단위 진단 결과는 [기계 판독 기록](P1C_B_HARNESS_FIX_20261112.json)에 보관한다. `dist/`, 원본 Mac 문서·JSON, `.gitignore`, 기존 R13/heading/compare/반응형/WP6/chart-qa 하네스와 media 서버는 기준 커밋 대비 변경 0이다. 기존 **72px·0.01px·2,500ms·150ms·H1 한 개**, Range **206/416**, standalone **41개 style 블록·HTTP preload 0** 계약을 유지한다.

## 4. 다음 Mac 실행

기존 실제 패키지와 같은 명령을 사용하되, 보고서 경로는 새로 만들어 이전 증거를 보존한다. [기존 설치→검증→복원 절차](P1C_B_MEDIA_VERIFICATION_20261112.md#4-로컬-실행-순서-빌드--격리-사본에-설치--검증--복원)는 바꾸지 않았다. Cloudflare 로컬 빌드도 수행하는 경우에는 **`npm run build:cloudflare` 이후 격리 `dist` 사본에 설치**하는 순서를 유지하며, 이번 변경 자체는 그 빌드나 배포를 실행하지 않는다.

```sh
# 기존 절차로 ready manifest + 실제 pages/audio를 설치한 격리 사본에서 실행.
# ATLAS_MEDIA_SITE는 그 사본, ATLAS_MEDIA_REPORT는 새 mktemp 보고서 디렉터리다.
npm run verify:conference:media -- \
  --dist "$ATLAS_MEDIA_SITE" --out "$ATLAS_MEDIA_REPORT/browser"
```

**남은 작업은 이 수정 커밋에서 Mac 실자산 20케이스를 다시 실행하는 것**이다. 보고서의 `seekObservations`, `navigation.manifest`, 장표의 입력 전 `observation.entry`·decode 세대 진단과 HTTP 영수증을 함께 확인한다. 실제 요청이 반올림되어 바뀌었다면 하네스는 계속 실패로 남기므로 그 요청을 별도로 판정한다. A-9·다른 브라우저 회귀·사람 청취·A-10 메모리·프로덕션 Range는 이번 Linux 작업에서 재측정하지 않았다.
