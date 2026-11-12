# P1c-B macOS 실자산 20/20 통과 (2026-11-12 15:01–15:03 KST)

제품 수정 `31fea06`을 실제 547장·오디오 15세션 패키지에 적용해 `scripts/verify-conference-media-browser.mjs`를 이 Mac에서 다시 돌렸고, **20케이스 전부 통과**했다. 14:20 회차 7/20과 14:10 회차 6/20의 실패 13건이 모두 닫혔다.

## 실행 조건

| 항목 | 값 |
|---|---|
| 소스 커밋 | `31fea06` (`fix(conference): preserve exact seek presentation and report harness errors`) |
| 격리 사본 | `/tmp/atlas-p1cb-31fea06/site` (커밋의 `dist/` + 실제 미디어) |
| 미디어 | 페이지 **547**(final 290·r17 257), 오디오 **15**, manifest 163,622B `3380d7d5…`, timeline 1,044,921B `fd15b3ef…` |
| 브라우저 | Chrome 157.0.8103.79 headless, 1440×900 |
| 실행 | 15:01:46–15:03:06 (80초), `browserLaunched: true`, `syntheticFixture: false`, `productionDeployment: false` |
| 보고서 | `report.json` 5,147,656B `87be535cfdc7592f…`, 스크린샷 20장 동봉 |

## 결과

- `counts`: **cases 20 · passed 20 · failed 0 · skipped 0**, `exitCode 0`, `status: passed`, `failures: []`
- preflight **통과**: 547장·15세션·manifest·timeline 해시가 12:50 렌더 영수증과 일치, `sourceIntegrity.unchangedDuringRun: true`
- HTTP **통과**: 이미지 **547/547 = 200**, 오디오 세션 **15**, Range 요청 **45건 전부 206**(바이트·SHA 일치), 오디오 합계 106,916,580B
- 통과 케이스: `slides-final-290`, `slides-r17-clean-257`, `session-seek-and-play`, `boundary-00-01` … `boundary-13-14`(14건), `source-join-session-13-18000`, `missing-fallback`, `unavailable-fallback`

## 무엇이 고쳐졌나

1. **URL 자기 메아리** — `t=2401.74`가 URL에서 `2401.7`로 반올림되던 동작이 사라졌다. 4개 딥링크 단독 프로브에서 URL·표시가 모두 요청값을 유지했다(아래 표).
2. **장표 표시 경로** — r17 2쪽은 `r17/0002.webp`가 `display:none`이던 상태에서 정상 표시로 바뀌었고, `이 구간에 맞는 장표 없음`이 함께 뜨지 않는다. final 6쪽도 반올림 없이 표시된다.
3. **하네스 오류 사유** — 부모 디렉터리를 재귀 생성하되 최종 출력 디렉터리는 독점 생성하고, 실패 시 `reason`에 오류 종류·경로·스택을 남긴다.

## 딥링크 단독 프로브 (수정 후, 8904)

| 요청 | URL | 표시 장표 | 빈 상태 문구 |
|---|---|---|---|
| `t=2401.74&deck=final-290` | `2401.74` 유지 | `final/0006.webp` | 없음 |
| `t=2401.8&deck=final-290` | 유지 | `final/0006.webp` | 없음 |
| `t=2239.5&deck=r17-clean-257` | 유지 | `r17/0002.webp` | 없음 |
| `t=2114.88&deck=final-290` | `2114.88` 유지(`currentTime` 2114.88) | 없음(정상) | 있음 |

`t=2114.88`의 빈 장표는 결함이 아니다. `timeline.json` 222번 구간(`t0 2114.2`–`t1 2116.38`)의 `page`가 두 덱 모두 `null`이다. 경계 케이스 `boundary-00-01`도 20/20 안에서 통과했다.

## 계약 보존

150ms 허용, Range 206/416 기대, 정확한 native setter 요청, 64ms AAC read-back, h1 1개, 미디어 없음일 때 skip exit 2를 모두 그대로 두었다. Pro가 보고한 단위·계약 검증은 254/254(플레이어 56, media browser CLI·계약 13), 타임라인 9,168/9,168, typecheck·verify:static·preload `--check` 통과다.

## 남은 것

- **사람 청취 0/10**과 시각 검수는 여전히 사용자 몫이다. 자동 20/20은 재생·탐색·경계·폴백의 기계적 수용이고 청취 품질 판정이 아니다.
- **A-10 1시간 재생 메모리** 미측정. 이번 실행은 80초짜리다.
- 전체 `npm test`는 이 회차에도 돌리지 않았다(load average 19~24). Pro가 Linux에서 254/254를 보고했고, Mac 전체 스위트는 부하가 낮을 때 1회 돌린다.
- `verify:pages` 기존 파일명 불일치 exit 1은 그대로다.
- 격리 사본에 하네스 실행용 `serve-test.mjs`가 미추적 파일로 남아 있다(`workingChanges: "?? serve-test.mjs"`). 저장소에는 들어가지 않았다.
