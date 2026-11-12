# R13 후속 — 컨퍼런스 입력 전체 선택·정확한 값 확인 (2026-11-12 KST)

## 범위와 소스

저장소 `twoimo/bitcoin-cycle-atlas`, 브랜치 `fix/tradingview-responsive-20261110`의 입력 하네스 후속 수정이다. 기준 HEAD `7f2982d944e329f3f00ecd0a592d22117eac6032` 위에 소스 커밋 **`74653b1979af0515ca0fed698dd2852c7a9cef29`**를 만들고 그 정확한 커밋에서 검증했다. 소스 tree는 `8aaa78d6574b76d98dbc65760429278f9a1656b2`다.

사용자가 제공한 macOS Chrome 157.0.8103.79 결과는 heading 계약 15/15·보충 9/9·layout-shift 2/2 통과, 컨퍼런스 5/14였다. heading 320·390의 869.5 → 797.5 → 869.5px 결과를 접수했으며, 이번에는 heading 코드를 수정하거나 재검증하지 않았다. `dist/`, `scripts/verify-page-heading-browser.mjs`, `scripts/native-select-keyboard.mjs`는 기준 커밋과 동일하다.

## 바꾼 파일과 동작

- `scripts/native-input-keyboard.mjs`: 테스트 가능한 `replaceNativeInputText()`를 추가했다.
- `scripts/verify-conference-browser.mjs`: `type()`과 호출 3곳을 연결하고 케이스별 입력 전 값·선택 범위·요청값·최종 값을 `nativeTextInputs`에 기록한다. 새 헬퍼를 소스 해시 목록에 포함했다.
- `tests/native-input-keyboard.test.mjs`: 플랫폼 분기와 잘못된 입력 거부를 고정하는 9개 테스트를 추가했다.

전체 선택은 `Input.dispatchKeyEvent`의 `rawKeyDown`·`keyUp`으로 보낸다. `key:'a'`, `code:'KeyA'`, `windowsVirtualKeyCode:65`이고 modifier는 다음과 같다.

| 플랫폼 | modifier | 전체 선택 |
| --- | ---: | --- |
| darwin | 4 | Meta / Command+A |
| 그 외 | 2 | Control+A |

`rawKeyDown`에만 Chromium의 네이티브 편집 명령 `commands:['selectAll']`를 함께 전달한다. 저장소의 consolidated workspace 하네스가 사용하던 방식이며 macOS AppKit의 메뉴 변환에 의존하지 않는다. 포커스 소유권을 확인하고, selection 범위를 제공하는 검색 입력은 `[0, 기존 문자열 길이]` 전체 선택을 확인한 다음 `Input.insertText`를 한 번만 보낸다. 이후 렌더를 안정화하고 **실제 `.value === 요청 문자열`**이 될 때만 다음 단계로 진행한다. 실패 시 기대값과 마지막 관측값을 오류에 남긴다.

숫자형 `[data-role=page]`는 `selectionStart`·`selectionEnd`가 null이므로 제공되지 않는 선택 범위 검사만 제외한다. 포커스와 최종 값의 정확한 일치 검사는 그대로 적용한다. DOM `.value` 대입, `select()`·`setSelectionRange()` 우회, 합성 input/change는 사용하지 않는다. 기존 assertion·허용치는 바꾸지 않았다.

## Linux 검증과 실제 수치

환경은 Linux x64, Node 24.22.2, HeadlessChrome 157.0.8103.38이다. 아래 두 명령을 실행했으며, 실제 절대 경로·환경·시각·종료 코드·해시는 [실행 기록](evidence/r13-native-text-20261112/verification/executions.json.gz)에 있다.

```bash
node --test tests/native-input-keyboard.test.mjs tests/native-select-keyboard.test.mjs
node scripts/verify-conference-browser.mjs --out build/r13-native-text/conference
```

| 실행 | 실제 결과 | 종료 코드·시간 |
| --- | --- | --- |
| 최종 소스의 단위 검사 | **31/31**, 실패 0·skip 0. 새 입력 9 + 기존 native-select 22 | exit 0, 433ms |
| 첫 전체 컨퍼런스 | **13/14**, fixture 9/9·입력 readback 19/19. navigation-ETHUSD 판독 예외 1건 | exit 1, 215,976ms |
| 잘못 시작돼 중단한 재실행 | 관측 1케이스 통과, 전체 실행 미완료 | exit 130, 정규 수치에 합산하지 않음 |
| 동일 소스의 최종 전체 컨퍼런스 | **14/14**, 실패 0. BTC·ETH 이동 모두 통과 | exit 0, 212,623ms |

새 단위 검사는 darwin·linux·win32 modifier, 반복 Hangul 검색과 짧은 검색어 교체, 숫자 입력의 null selection, 전체 선택 실패·포커스 상실 시 삽입 거부, 덧붙이기 오동작의 정확한 readback 실패, 값 확인 대기 중 재삽입 방지를 검사한다. 이 플랫폼 검사는 **모의 CDP 전송 테스트**이며 macOS 브라우저 실측을 대신하지 않는다.

[최종 검증 요약](evidence/r13-native-text-20261112/summary.json)과 [원본 컨퍼런스 보고서](evidence/r13-native-text-20261112/conference/report.json.gz)의 입력 수치는 다음과 같다.

| 입력 | 횟수 | 관측 |
| --- | ---: | --- |
| 자막 검색 | **18회** — fixture 9개 × 2회 | 요청·최종 값 모두 `3725초`. 각 두 번째 호출은 기존 `3725초` 전체 5글자를 선택해 동일한 값으로 교체 |
| 페이지 숫자 | **1회** — 1440×900 | 기존 `1` → 요청 `2` → 실제 `2`, selection 양 끝은 null |
| 전체 | **19/19** | 정확한 값 일치, 중복 검색어 없음 |

기존 native select는 89회 호출되었고 관측 이벤트 **420개 모두 isTrusted=true**, 비신뢰 0개다. 실행 중 소스 **970개 변경 0건**을 확인했다. PNG 24장의 크기·SHA-256·서명을 대조했고, 검색 완료 상태의 320px·1440px 대표 이미지 2장을 보관했다. 이번 회차에는 이전 전체 npm·53개·반응형·WP6·chart-qa·heading 검사를 새 결과로 반복 집계하지 않았다.

### 첫 실패의 판정

첫 실행은 ETH가 컨퍼런스를 떠나 `?page=outlook&center=data`로 이동한 직후, `navigationState()`의 다음 기존 표현식에서 실패했다.

```js
Math.max(document.documentElement.scrollWidth, document.body?.scrollWidth || 0) - innerWidth
```

새 문서의 `documentElement`가 아직 null이라 `scrollWidth`를 읽지 못한 것이다. 이 함수는 기준 `7f2982d`와 이번 소스에서 동일하며, 추출한 함수 본문 SHA-256은 `5335ca409f7e38bf6fc133bd497a9297cda295281d79382175b2186246c2de01`이다. 이 ETH 케이스는 `type()`을 호출하지 않는다. 실패 전에 신뢰된 재생 클릭과 실제 재생(`playing:true`, `paused:false`, audio time 0.019044초)이 관측됐다. 최종 재실행의 14/14로 이 기존 판독 레이스가 수정됐다고 판단하지 않는다.

### 증거 관리 한계

**첫 실행의 전체 `report.json`과 `executions.json`은 보관 전 재실행을 잘못 시작한 제 관리 실수로 덮어써졌다.** 그 재실행은 1케이스 후 중단했다. 원본 전체 JSON을 복구하거나 만들어 넣지 않았다.

남아 있는 [첫 실행의 원본 완료 로그](evidence/r13-native-text-20261112/prior-attempt-1/conference.log.gz)·Chrome stderr·실패 PNG는 바이트 그대로 보존했다. 원본이 존재할 때 읽어 둔 전체 케이스 상태와 실패 ETH 케이스는 [부분 전사 및 출처 설명](evidence/r13-native-text-20261112/prior-attempt-1-excerpts/PROVENANCE.md.gz)으로 따로 표시했다. 이 발췌에는 원본 전체 파일의 해시가 없으며 원본 전체의 대체물로 취급하지 않는다. [중단 실행 기록](evidence/r13-native-text-20261112/interrupted-retry/interruption.json.gz)도 정규 결과에 합산하지 않는다.

최종 전체 실행은 새 출력 디렉터리와 덮어쓰기 방지 조건에서 수행했고, 최종 원본 보고서·로그·실행 메타데이터는 완전하게 보존했다. [manifest](evidence/r13-native-text-20261112/manifest.json)와 [SHA256SUMS](evidence/r13-native-text-20261112/SHA256SUMS)가 저장본 및 원본 바이트 해시를 기록한다. 기존 시스템 CA와 동일하게 구성했던 작업 전용 브라우저 신뢰 DB는 종료 후 제거했고 시스템·사용자 기본 저장소의 해시가 그대로임을 확인했다.

## 남은 것

1. 이 입력 후속 소스에 대한 macOS Chrome 컨퍼런스 14케이스 독립 재측정.
2. 문서 전환 중 `documentElement.scrollWidth`를 읽는 기존 navigationState 판독 레이스. 요청 범위에 맞춰 이번에는 수정하지 않았다.
3. 앞서 보고한 초기 pageshow 재생 정지 제품 문제. 이번 입력 변경으로 해결된 것으로 처리하지 않는다.

main 직접 push·병합, 배포, 유료 용량 생성, 계정·권한 변경은 하지 않았다.
