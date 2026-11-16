# MSTR·BMNR 로딩과 화면 준비 상태 검증

## 2026-11-16 유지 점검

동기화 커밋은 `856e77422e0a43a77470aed2e3f64fa1e522880b`이고 `dist/equity-view.js` SHA-256은 `a94854ab78b9c1005e5f88baa3cd9c999975e2cbd8e975457e89468f2f2d2c9f`이다. 직전 기록 `fe93a572`는 이 이력의 조상이 아니다. 검증 대상 파일이 `fe93a572`와 `c92c4871`에서 바이트 단위로 같아서 `c92c4871..856e7742`를 읽었다. 대상 변경은 `931ed189`에서 왔다. Funnest 마운트와 페인트 확인이 대상이다. 이 절 아래의 내용은 이전 판본의 기록이다.

### 코드가 바뀐 모양

- `render`는 Funnest 차트를 한 번 마운트하고 그 뒤에는 setter로 갱신한다. 마운트할 때와 다른 시리즈를 넘길 때마다 `watchFunnestPaint`가 `mount.ready()`를 기다린다.
- 이 continuation은 `state.funnestMount!==mount||suspended`이면 돌아간다. 그렇지 않으면 `state.funnestReady`나 `state.chartError`를 쓰고 준비 상태를 알린다.
- `render`는 `state.funnestReady`일 때만 `revealReady()`를 부른다. 관측 렌더만으로는 부팅 화면이 풀리지 않는다.
- 차트 오류 뒤의 다시 조회는 마운트를 파괴한다. 파괴된 마운트의 `ready()`는 나중에 거부된다.
- 확대와 이동은 Funnest가 처리한다. 뷰는 `onViewport`로 받은 시작과 끝을 `state.range`에 적고 `state.rangeTouched`는 쓰지 않는다. 마운트가 있는 동안 `getRange`가 `null`이므로 `dist/chart-navigation.js`는 범위를 발행하지 않는다.
- `restoreArchiveReadout`는 readout DOM과 `state.readoutSelection`만 쓴다. `dist/index.html` 부팅 스크립트의 변경은 실패 진단만 더한다. 둘 다 모델이 다루는 상태를 쓰지 않는다.

### 모델과 대조군

`mounted`, `funnestReady`, `chartError`, `orphan`, `discarded`, `rangeLost`와 동작 `PaintConfirmed`, `PaintFails`, `OrphanSettles`, `RetryChart`, `NativePan`을 추가했다. 상수 `GuardPaint`는 페인트 continuation의 가드다. 대조군 `stale-paint-failure`는 `NoStalePublication`을, `hidden-paint-failure`는 `NoHiddenReadiness`를 깨야 한다.

모델은 확인 횟수와 Funnest가 가진 시리즈를 세지 않는다. 마운트가 있으면 확인이나 실패가 언제든 도착할 수 있고, 마운트된 차트의 렌더는 새 감시를 시작할 수 있다. `FailureScope`는 차트 실패를 `issued < RequestLimit`인 동안만 탐색한다. 요청 세대 3개, 일·주 간격, 자동·지정 구간, URL 구간 유무의 기존 경계는 그대로다.

### 성질

`UsableRenderReleasesBoot`의 문장을 바꿨다. 코드가 약속을 의도적으로 바꿨기 때문이다. 식은 그대로다.

- 이전: 관측 렌더 또는 조치 가능한 오류 렌더가 부팅 화면을 즉시 해제한다.
- 이후: Funnest가 페인트를 확인한 차트의 렌더, 또는 조치 가능한 오류의 렌더가 부팅 화면을 즉시 해제한다.
- 근거: `931ed189`는 `render`에서 `state.funnestReady`일 때만 `revealReady()`를 부른다. `tests/funnest-observed-price-adapter.test.mjs`는 뷰 소스의 `result?.painted===true`와 `state.funnestReady=false`를 고정한다.

`painted`는 확인된 차트의 렌더를 기록한다. `errorPainted`는 다시 조회 패널이 보이는 렌더를 기록한다. 이 패널은 시리즈가 없는 가격 실패와 차트 실패에서 보인다.

`UserRangePreserved`는 문장을 유지하고 `~rangeLost`를 더했다. 확대와 이동이 `state.rangeTouched`를 쓰지 않게 되어, `customRange`만 읽는 이전 식은 그 구간을 다루지 못한다.

`NoStalePublication`은 식을 유지하고 파괴된 차트도 다룬다. 파괴된 차트의 늦은 페인트 실패는 차트 오류를 게시하면 안 된다.

### 현재 코드가 깨는 두 성질

두 경로 모두 fixture로 실제 `dist/equity-view.js`에서 재생했다. 둘 다 `931ed189`에서 생겼다. 제품 코드는 고치지 않았다.

1. `UsableRenderReleasesBoot`. 열기, 주가 수신, `render`가 차트를 마운트, `pagehide`, Funnest가 페인트를 확인, `pageshow`, `render`. 166행의 continuation은 `suspended`이면 기록 없이 돌아간다. 그래서 211행은 그 차트에 대해 `revealReady()`를 부르지 않는다. 주가와 전망이 이미 있으면 `pageshow`는 프레임만 예약하고, 그려진 차트가 부팅 화면 뒤에 남는다. 정지 중 도착은 이 검증이 계속 허용해 온 늦은 callback 순서다. 특정 브라우저가 이 순서를 만든다고 확인한 것은 아니다.
2. `UserRangePreserved`. 관측 차트가 준비된 뒤 사용자가 확대하거나 이동, 코인 자료 수신, 두 번의 yield, 전망 완료. 197행 `onViewport`는 `state.rangeTouched`를 쓰지 않는다. 그래서 244행이 구간을 비우고 다음 `render`가 Funnest에 기본 구간을 넘긴다.

| 검사 | 결과 |
| --- | --- |
| 현재 모델, 전체 성질 | `UsableRenderReleasesBoot` 위반, 7단계 |
| 현재 모델, `UserRangePreserved`만 | 위반, 9단계 |
| 현재 모델, 나머지 네 성질 | 1,693,424개 구별 상태, 대기 0, 통과 |
| 잘못된 모델 구성 9종 | 각각 지정한 반례 검출 |
| 실제 UI 실행 재생 | MSTR·BMNR 각각 18개, 총 36개 통과. 간격 전환 2개 통과 |
| 임시 제품 코드 변이 | 11종 모두 지정 assertion 실패 |
| 두 수정을 가정한 임시 모델 | 804,240개 구별 상태, 통과 |

`node scripts/verify-equity-state.mjs`는 재생과 대조군을 먼저 실행하고 마지막에 현재 모델에서 종료 코드 1로 끝난다.

### 재생 fixture

Funnest 마운트는 fixture다. `manualPaint`는 `ready()`를 미결로 두어 테스트가 늦게, 정지 중에, 또는 파괴 뒤에 결과를 전달하게 한다. 렌더마다 같은 마운트 기록이 다시 쓰이므로 이전 화면과 비교할 때는 `snapshot()`으로 복사한다. 이 복사가 없어서 `interval-range-reset` 변이가 실패하지 않았다. 구간 소유권은 `changeInterval`에 그대로 있다.

### 다루지 않는 것

- 마운트의 `onError`. 고정된 런타임은 datafeed와 trading adapter를 설정하지 않아 이 callback에 도달하지 못한다.
- 엔진이 스스로 보내는 viewport 보고. 구간 초기화와 그 렌더 사이에 도착하는 보고도 포함한다.
- 준비 상태가 페인트 확인을 기다린다는 규칙. 모델에는 없고 `unconfirmed-readiness` 재생 대조군이 코드의 순서를 고정한다.
- 정지 중 도착한 페인트 실패. 확인과 같은 방식으로 버려지고 오류도 준비 상태도 나타나지 않는다. 생존성 문제이며 이 검증의 성질이 아니다.
- 런타임의 5초 페인트 제한과 부팅 스크립트의 20초 제한.

## v1.29 integration correspondence

The current committed source is `7261c1807028e1b69bf9cd9be0d269a64f88acc0`. The strict process-exit rerun, exact runtime hashes, maintained mutation selectors and limits of the new features are recorded in [the integration review](../evolution-2026-10-26/publication-independent-review.md) and the current project verification skill. Current machine-readable receipt: [verification result](../evolution-2026-10-26/equity-state-final.json). Earlier revisions and charts below remain historical evidence. New economic, scenario and capital-recalculation behavior is not implicitly included in these finite lifecycle models.

기준 커밋은 `347997f02d3674259d4ad6e1f788419bde4811bd`이며 코드·모델 대응을 마지막으로 검토한 구현 커밋은 `1ad3be543e870e74f10708c266f19572b217d25f`이다. 이 기록은 주가 예측 정확도가 아니라 **어떤 요청의 자료가 언제 화면에 나타나는가**를 검증한다.

## 2026-10-25 유지 점검

이전 동기화 `c7fbf50c34a45386300336756b5fd42a0fab0363` 이후 일별 원자료 정보 링크와 모듈 URL만 바뀌었다. 범위에 포함한 await·세대 guard·준비 완료 writer·pagehide/pageshow의 의미는 유지된다. 기존 모델과 실패 대조, 실제 initializer 28개 및 임시 제품 코드 변이 7개를 다시 실행했다. 불변식이나 유한 경계를 약화하지 않았다. 현재 `dist/equity-view.js` SHA-256은 `1843735506f4fe16c560902697d81cb35da601decf901bd523e231715b998c44`이다. 최종 통합 증거는 [시스템 감사](../SYSTEM_AUDIT_2026_10_25.md)에 연결한다.

## 발견과 수정

기존 주식 화면은 주가를 받으면 관측 차트를 먼저 렌더했지만, `atlas:ready` 이벤트를 코인 자료와 재무 계산이 끝난 뒤에 발행했다. `index.html`은 그 전까지 실제 화면을 숨기고 `inert`를 유지한다. 두 번의 animation-frame 기회를 주어도 사용자는 이미 준비된 관측 차트를 읽거나 조작할 수 없었다. [초기 화면 규칙](../../dist/index.html) · [주식 화면](../../dist/equity-view.js)

수정 후 첫 관측 렌더 또는 재시도 가능한 가격 오류 렌더가 `revealReady`를 통해 한 번만 부팅 화면을 해제한다. 전망이 아직 없으면 ‘계산 중’ 상태를 유지한다. 이때 사용자가 바꾼 일·주 표시, 시나리오와 날짜 구간은 계산 완료 후에도 유지한다. 처음 요청한 연구 글도 같은 준비 시점에 열어 뒤늦은 팝업과 재시도 중 중복 열기를 막는다.

페이지 이탈 후 늦은 초기화 콜백은 렌더와 첫 준비 이벤트를 발행하지 못한다. 이 방어 강화는 모델과 fixture에서 적대적인 콜백 순서로 확인했다. **특정 브라우저가 정지한 문서에 실제로 animation-frame 콜백을 전달했다고 확인한 것은 아니다.** 브라우저 스케줄링의 세부 가능성은 검증 범위 밖이다.

기존 세대 가드는 실제 덮어쓰기 결함으로 판정하지 않았다. 제거한 대조군이 실패하는지 검증하여 이미 올바른 소유권 규칙을 보호했다. 관측 공개 조건에서 코인 조회와 계산을 제거한 구조적 개선이며, 브라우저 지연이 몇 ms 줄었다는 측정 주장은 하지 않는다.

## 구조와 선택

`load`는 주가 아카이브를 검증하여 `daily`·`weekly`를 갱신하고 이전 `projection`을 비운다. 코인 아카이브를 받은 뒤 두 animation-frame을 기다리고, 마지막 동기 구간에서 `buildTreasuryProjection`을 한 번 호출한다. `generation`은 로드의 권한을 구별하고 `pagehide`가 이를 무효화한다. `state.rangeTouched`는 계산 중 선택한 구간을 보존한다.

별도 reducer/controller 추출과 기존 구조 직접 검증을 비교해 후자를 선택했다. 이미 분명한 비동기 경계가 있어 상태 사본을 추가할 필요가 없었다. pstack `Model the Domain`은 요청 단계와 관측 준비/전망 준비를 구분하는 데, `Fix Root Causes`는 paint 횟수를 늘리는 대신 부팅 공개 시점을 고치는 데 적용했다.

## 성질과 증거

| 불변식 | 사용자에게 중요한 성질 | 실패를 확인한 대조군 |
| --- | --- | --- |
| `TypeOK` | 요청·단계·간격·상태 값이 선언한 도메인 안에 있음 | 보조 유형 불변식 |
| `NoStalePublication` | 취소·대체된 로드가 가격·전망·오류를 게시하지 않음 | 가격·계산·오류 가드 제거 |
| `ProjectionMatchesPrices` | 전망 입력과 표시 가격의 요청 세대가 같음 | 새 가격에 이전 전망 유지 |
| `UsableRenderReleasesBoot` | 관측/오류 렌더가 부팅 화면을 해제함 | 이전 부팅 순서·준비 이벤트 제거 |
| `NoHiddenReadiness` | 정지된 문서가 처음 준비되었다고 알리지 않음 | 정지 상태 검사 제거 |
| `UserRangePreserved` | 계산 완료가 사용자 구간을 덮어쓰지 않음 | 구간 무조건 초기화 |

`projection`은 경제적 가치가 아니라 **입력 요청 세대**를 추상화한다. 이 성질을 가격 예측의 수학적·경험적 정확성으로 확대하지 않는다.

정확한 결과는 [검증 JSON](verification-summary.json)에 있다.

| 검사 | 결과 |
| --- | --- |
| 현재 모델, 세 요청 세대 | 303,261개 생성, 46,252개 구별 상태, 대기 0, 불변식 통과 |
| 이전 부팅 순서 | 지정한 준비 상태 불변식 반례 검출 |
| 잘못된 모델 구성 6종 | 각각 지정한 반례 검출 |
| 실제 UI 실행 재생 | MSTR·BMNR 각각 14개, 총 28개 통과 |
| 임시 제품 코드 변이 | 7종 모두 지정 assertion 실패 |
| 변이 제거 후 임시 코드 | 다시 28개 통과 |

반례 검사는 첫 위반에서 멈추므로 대기 상태가 남을 수 있다. 이것을 완전 탐색 성공으로 보고하지 않는다. 현재 모델의 성공 실행만 해당 유한 공간을 끝까지 탐색했다.

TLC 공식 배포판은 **1.7.4**로 고정했다. 내부 배너는 `TLC2 Version 2.19 of 08 August 2024`이며 jar SHA-256은 `936a262061c914694dfd669a543be24573c45d5aa0ff20a8b96b23d01e050e88`다. Node 24+와 Java 11+로 실행한다.

```sh
node scripts/verify-equity-state.mjs
```

첫 인자에 결과 JSON 경로를 선택적으로 넘길 수 있다. 오프라인에서는 `TLA2TOOLS`에 같은 해시의 jar를 지정한다. 이 환경의 TLC 로컬 소켓 제한은 승인된 확장 실행으로 해결했으며 검증 규칙을 약하게 바꾸지 않았다.

## 코드 대응과 재생 범위

| 모델 | 실제 구현 |
| --- | --- |
| `active`, `issued`, `phase` | 로드 token·발급 순서와 await/callback 위치 |
| `prices`, `projection` | 게시된 가격과 전망 입력 세대 |
| `attached` | `suspended`의 반대 값 |
| `Load` | 중복 로드 방지와 새 token 설치 |
| `PricesArrive` / `PricesFail` | 주가 응답 성공·실패 continuation |
| `CoinArrives` / `CoinFails` | 코인 응답 성공·실패 continuation |
| `FirstPaint` / `SecondPaint` | 중첩된 두 RAF callback |
| `Project` / `ProjectFails` | 마지막 token 검사 뒤 동기 계산의 성공·예외 |
| `Render` / `InitialFrame` | 일반 렌더와 최초 초기화의 마지막 RAF |
| `Hide` / `Show` | 페이지 이탈·복원 |
| `Pan` / `ChangeInterval` | 구간·표시 간격 변경 |

계산 내부에는 `await`가 없어 사용자 이벤트가 계산 중간에 끼어드는 순서를 만들지 않는다. 계산 예외는 같은 동기 구간의 `ProjectFails`로 처리한다. 모든 실제 가드를 소스 위치와 연결했고, pstack `summary.json`의 `uncited`에 누락이 있으면 통과를 주장하지 않는다.

재생은 생산 `equity-view.js` 전체를 매번 읽어 실행한다. import 선언만 의존성 주입으로 치환하고 가격 파서와 inline boot script는 실제 코드를 사용한다. HTTP·DOM·RAF 큐와 차트 렌더·재무 계산 경계는 fixture다. `load` 복제본이나 숨은 지역 변수를 단언하지 않는다. 관찰 대상은 준비 속성, 조작 가능 여부, 차트의 입력, 계산의 두 자료 세대와 사용자 상태 문구다.

## 상태 전이도

- [전체 요약 PNG](comparison/chart.png) · [Mermaid](comparison/chart.mmd)
- [관측 공개 지연 반례 PNG](comparison/bug-1.png) · [Mermaid](comparison/bug-1.mmd)
- [정지 문서의 늦은 준비 반례 PNG](comparison/bug-2.png) · [Mermaid](comparison/bug-2.mmd)
- [번호가 붙은 이야기](comparison/stories.md) · [차트 요약](comparison/summary.json)

첫 반례는 ‘열기 → 주가 수신 → 관측 렌더’ 후에도 부팅 화면이 남는 경로다. 수정 후 같은 렌더는 ‘관측 준비, 전망 대기’로 이동한다. 두 번째는 ‘열기 → 페이지 떠나기 → 이전 초기화 종료’를 적대적으로 전달하는 경로이며 수정 후 정지 상태를 유지한다. 두 번째는 특정 브라우저 스케줄러의 실측 반례가 아니다.

차트는 `--cover` 요약으로, 모든 내부 전이를 그린 그림이 아니다. 초록 테두리는 이전 문제 상태가 수정되었거나 수정본에 추가되었다는 뜻이다. 임의의 그림 경로가 숨은 모델 전체에서도 가능하다고 단정할 수 없다. 표시·생략 전이 수와 가드 출처 누락은 생성 요약에서 확인한다.

도구는 pstack 커밋 [`9580c23696ac8d7abed0c166f2f9918800afb819`](https://github.com/cursor/plugins/tree/9580c23696ac8d7abed0c166f2f9918800afb819/pstack/skills/statechart)와 그 스킬의 `pele@1.8.0`·`@resvg/resvg-js@2.6.2`다. PNG를 열어 글자와 분기를 확인했다. Grok·Opus 역할은 실제 사용 가능한 GPT-6 Astra 에이전트로 대체했다.

## 그림 재생성

저장소 밖에 모델을 복사하고 MODULE 이름을 맞춰 현재본 `EquityLoadFixed.tla`와 이전본 `EquityLoadBefore.tla`를 만든다. 양쪽에 원래 `EquityLoad.cfg`의 세대 수·불변식을 유지하고, 이전본에서만 `BootOnRender`·`RespectSuspension`을 `FALSE`로 바꾼다. map 파일도 함께 복사한다. `PSTACK`은 고정된 plugins checkout, `TLA2TOOLS`는 검증된 jar를 가리킨다. 임시 디렉터리에서 실행한다.

```sh
node "$PSTACK/pstack/skills/statechart/scripts/statechart.mjs" from-spec EquityLoadBefore.tla --fixed EquityLoadFixed.tla --label 'observed readiness fix' --expect-broken UsableRenderReleasesBoot,NoHiddenReadiness --title 'Equity chart readiness and request ownership' --out comparison --cover --png
```

다른 pstack 판본은 `/statechart` 도움말을 다시 읽는다. 요약의 두 `uncited` 목록이 비었는지 확인하고 실제 코드 반례도 다시 실행한다. PNG 실패는 모델 검사 성공과 별개로 보고한다.

## 한계

요청 세대 3개, 일·주 두 간격, 자동·지정 구간을 탐색한다. HTTP와 파싱은 성공·실패 결과로 추상화한다. 실제 20초 timer, 지연·확률·브라우저 시간은 모델에 없다.

모델은 정지 중 늦은 callback과 입력도 허용한다. 실제 callback이 `attached`·`ready`를 직접 검사하지 않는 경우 모델에도 그 가드를 넣지 않았다. `Show`와 조건부 재시작 `Load`를 분리하고 UI에 재시도 버튼이 없는 상태의 `Load`도 허용한다. 실제보다 많은 순서를 허용하는 과대근사이며 특정 UI 조작이 가능하다는 주장은 아니다. 반복 복원 중 실제 요청의 중복 방지는 실행 재생으로 확인한다.

무한 요청 수, 결국 완료된다는 생존성, 금융 계산의 타당성, 원자료 진위, DOM 화소·접근성 전체, 물리 모바일 장치와 의존성 내부 동작은 증명하지 않는다. 기존 암호화폐 캔들 모델은 별도로 유지하며 이 검증으로 대체하지 않는다.
