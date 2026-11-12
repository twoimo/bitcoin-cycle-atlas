# P1c-B — macOS 실자산 재실행 (`bee29b2`)

기준 커밋은 `bee29b2b0044d27a74a8252818bfc58d7a9fd28d`(관측 계약 수정)다. [직전 macOS 기록](P1C_B_MACOS_HARNESS_20261112.md)의 실패 14건을 수정한 뒤, 같은 실제 패키지로 이 Mac에서 다시 돌린 결과를 기록한다. **Pro가 주장한 20/20은 재현되지 않았다.** 이번 실행은 **7/20**이며, 남은 13건은 모두 제품 코드 쪽 원인으로 좁혀졌다.

## 1. 실행 조건

| 항목 | 값 |
| --- | --- |
| 소스 | `git worktree add --detach /tmp/atlas-p1cb-bee29b2/wt bee29b2` (공유 워크트리의 다른 워크스트림 변경과 분리) |
| 설치본 | `dist` 사본 + `build/p1c-media-20261112/{pages,audio}` + ready manifest `3380d7d5…` |
| 자산 | 페이지 **547**(final 290 + r17 257), 오디오 **15세션**, preflight **562 assets** `passed:true` |
| 명령 | `node scripts/verify-conference-media-browser.mjs --dist <사본> --out <새 디렉터리>` |
| 브라우저 | `/Applications/Google Chrome.app/Contents/MacOS/Google Chrome`, headless |
| 정본 `dist` | 실행 전후 `dist/conference/media-manifest.json` 167B `ff3e3f2b…` 불변 |

`--out`의 **부모 디렉터리가 없으면** 하네스가 `mkdir(out,{recursive:false})`에서 실패하고 `report.json` 없이 `failures:1`만 남는다. 이번 첫 시도가 그 경우였고, 부모를 만든 뒤 정상 실행했다. 오류 문구가 사유를 담지 않는 점은 별도 개선 대상이다.

## 2. 결과 — 7/20

| 구분 | 케이스 | 결과 |
| --- | --- | --- |
| 통과 7 | `session-seek-and-play`, `boundary-04-05`, `boundary-05-06`, `boundary-06-07`, `source-join-session-13-18000`, `missing-fallback`, `unavailable-fallback` | pass |
| 실패 11 | 나머지 경계 `boundary-*` | `Requested native time must exactly equal event time minus session offset` |
| 실패 2 | `slides-final-290`, `slides-r17-clean-257` | `Timed out: decoded mapped page …` |

`missing-fallback`과 `unavailable-fallback`이 통과한 것은 이번 수정(서버 영수증 기반 404 완료 판정)의 성과다. HTTP 계층(`http.passed`)과 실행 중 자산 불변(`sourceIntegrity.unchangedDuringRun`)도 통과했다.

## 3. 경계 11건 — 원인은 URL 반올림 메아리

새 네이티브 setter 관측기가 요청을 그대로 남긴 결과, 실패 11건 모두 **정확한 첫 요청 뒤 `pageshow` 트리거의 두 번째 요청**이 있었다.

| 케이스 | 첫 요청 | 두 번째 요청 | URL |
| --- | --- | --- | --- |
| boundary-00-01 | 2114.88 | 2114.9 | `t=2114.9` |
| boundary-01-02 | 1164.46 | 1164.42 | `t=3280.8` |
| boundary-03-04 | 1236.81 | 1236.86 | `t=5895.9` |
| boundary-07-08 | 1446.52 | 1446.5 | `t=10866.5` |
| boundary-13-14 | 2084.81 | 2084.79 | `t=20041.3` |

통과한 3건(`7018.5`, `8218.5`, `9418.5`)은 **목표 시각이 이미 0.1초 격자 위**여서 반올림이 항등이었다. 즉 실패/통과가 같은 코드 경로로 갈린다.

원인은 제품의 `writeUrl()`이 `Math.round(state.time * 10) / 10`으로 URL을 쓰고, 그 URL이 `pageshow` 경로에서 다시 읽혀 `ensureAudio`로 재seek되는 자기 메아리다. 최대 50ms 오차가 재생 위치에 실제로 남는다.

## 4. 장표 2건 — 경계에서 페이지가 이전 값으로 되돌아감

같은 사본을 저장소 자체 미디어 서버(Range/206)로 띄워 딥링크를 직접 확인했다.

| 요청 | `state.time` | 표시 페이지 | 기대 |
| --- | --- | --- | --- |
| `t=2401.8&deck=final-290` | 2401.8 | **6** | 6 |
| `t=2401.74&deck=final-290` | 2401.74 (URL `t=2401.7`) | **2** | 6 |
| `t=2239.5&deck=r17-clean-257` | 2239.5 | **(없음)** | 2 |
| `t=3280.84&deck=final-290` | 3280.84 | 7 | 7 |
| `t=19000&deck=final-290` | 19000 | 245 | 245 |

* `2401.74`는 segment 342의 `t0`이고 `page.final-290 = 6`이다. 그런데 URL이 `2401.7`로 반올림되면서 이전 구간(341, `page:null`)으로 떨어져 **6쪽이 화면에 나오지 않는다**. 하네스가 기대한 `0006.webp`가 관측되지 않은 직접 원인이다.
* `2239.5`(r17 2쪽)는 `state.time`이 정확히 2239.5인데도 `이 구간에 맞는 장표 없음`을 표시한다. 같은 데이터로 `conferenceSegmentIndex(timeline.segments, 2239.5)`를 Node에서 직접 호출하면 **290 → page 2**가 나온다. 즉 데이터는 맞고, 실행 중 플레이어의 구간/페이지 적용 경로가 어긋난다.

두 경우 모두 하네스가 아니라 **제품 표시 경로**의 문제다. 0.1초 격자에 걸친 구간 경계(예: `2401.74`)는 73+127장 중 상당수에 존재하므로, 딥링크·장표 이동에서 같은 증상이 반복될 수 있다.

## 5. 폐기한 오탐

`python3 -m http.server`로 같은 사본을 띄웠을 때는 `t=2301.61`이 2116.38(세션 00 끝)로, `t=19000`이 15519.39로 고정됐다. 그 서버는 **Range를 지원하지 않고** `Content-type: audio/mp4a-latm`을 돌려준다. 저장소 서버(Range 206, `audio/mp4`)로 바꾸자 같은 요청이 19000 → 245쪽으로 정상 동작했다. 따라서 그 고정 현상은 **환경 오탐으로 폐기**하고 위 4절만 제품 근거로 남긴다.

## 6. 남은 작업

1. 제품 쪽에서 (a) URL 반올림 메아리가 재seek을 만들지 않도록 하고, (b) 구간 경계에서 페이지 적용이 이전 값으로 되돌아가지 않게 고친다.
2. 같은 격리 절차로 재실행해 **20/20**을 확인한다. 계약(150ms 전환, 206/416, exact seek, H1 1개, unavailable skip exit 2)은 완화하지 않는다.
3. 사람 청취 0/10, A-10 1시간 메모리는 이번에도 사용자 몫으로 남아 있다.

기계 판독 요약: `docs/conference/P1C_B_MACOS_RERUN_20261112.json`. 원본 보고서 `report.json`(2.6MB)와 Chrome stderr·스크린샷은 `build/p1cb-rerun-bee29b2/`(gitignore)에 보존한다.
