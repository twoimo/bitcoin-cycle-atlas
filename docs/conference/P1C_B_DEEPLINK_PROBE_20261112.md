# P1c-B 딥링크 단독 프로브 (2026-11-12 14:46–14:49 KST)

20케이스 하네스(약 7분)를 돌리지 않고, 실패 13건의 원인을 3개 딥링크로 좁혀 확인한 기록이다.
기준 HEAD `0befbd2`, 격리 사본은 `bee29b2` 재실행에 쓴 것과 같다(실제 547장 + 오디오 15, manifest `3380d7d5…`).

## 방법

1. `/tmp/atlas-p1cb-bee29b2/wt/serve-test.mjs`로 `createConferenceMediaServer({dist:'/tmp/atlas-p1cb-bee29b2/site', mode:'installed'})`를 8903에 띄운다. Range 206을 지원하는 저장소 미디어 서버다(파이썬 `http.server`는 쓰지 않는다 — 14:10 회차에 환경 오탐으로 폐기).
2. Playwright로 `http://127.0.0.1:8903/bitcoin-cycle-atlas/?page=conference&t=<초>&deck=<덱>`을 열고 4.5초 뒤 `location.href`, 장표 `img[src*="/conference/pages/"]`, `이 구간에 맞는 장표 없음` 문구, `audio.currentTime`을 읽는다.
3. 서버는 확인 후 종료하고 탭도 닫았다.

## 결과

| 요청 | 기대 | URL 재기록 | 장표 src | 표시 상태 | 빈 상태 문구 |
|---|---|---|---|---|---|
| `t=2401.8&deck=final-290` | 6쪽 | `2401.8` 유지 | `final/0006.webp` | 보임 | 없음 |
| `t=2401.74&deck=final-290` | 6쪽 | **`2401.7`로 반올림** | `final/0002.webp` | 보임 | **있음** |
| `t=2239.5&deck=r17-clean-257` | 2쪽 | `2239.5` 유지 | **`r17/0002.webp`(정답)** | **`display:none`** | **있음** |
| `t=2114.88&deck=final-290` | 2114.88 | **`2114.9`로 반올림** | 없음 | — | 있음 |

`t=2114.88`에서는 `audio.currentTime`이 **2114.9**로 남았다. 요청값이 아니라 URL 반올림값이 재생 위치로 굳는다.

## 14:20 회차 판정보다 좁혀진 두 가지

1. **r17 2쪽은 "장표가 없는" 것이 아니다.** `r17/0002.webp`가 DOM에 정확히 들어오고 `naturalWidth`도 1800으로 로드가 끝났는데 `display:none`이며, 그 위에 `conference-stage-message`의 `이 구간에 맞는 장표 없음`이 `display:block`으로 뜬다. 즉 **src를 정하는 경로와 표시 여부를 정하는 경로가 서로 다른 상태를 본다.** 14:20 기록의 "적용 경로가 어긋난다"를 DOM 수준에서 확인한 것이고, 수정 대상은 빈 상태 조건과 표시 상태의 단일화다.
2. **final 6쪽 사례는 반올림 하나로 설명된다.** `2401.74`는 URL에서 `2401.7`이 되어 이전 구간(341, `page:null`)으로 떨어지고, 그 결과 장표는 직전 값 `0002.webp`가 남은 채 빈 상태 문구가 함께 뜬다. 같은 지점 `2401.8`은 6쪽으로 정상이다.

두 증상 모두 하네스가 아니라 제품 표시 경로다. 계약 임계값(150ms·206/416·정확한 seek·h1 1개·미디어 없음 skip exit 2)은 그대로 둔다.

## 수용 기준

- 위 4개 URL이 각각 `final/0006.webp` 표시, `final/0006.webp` 표시, `r17/0002.webp` 표시(문구 없음), `2114.88` 유지·`currentTime` 2114.88(±AAC 3프레임)이어야 한다.
- 최종 수용은 여전히 `scripts/verify-conference-media-browser.mjs` 20/20이며, 이 프로브는 그 앞단의 빠른 회귀 확인(약 40초)으로만 쓴다.

## 남은 것

- 사람 청취 0/10, A-10 1시간 재생 메모리는 이 프로브와 무관하게 미측정이다.
- `npm test` 전체는 load average 19~24로 이 회차에도 돌리지 않았다.
