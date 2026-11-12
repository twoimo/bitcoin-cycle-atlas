# P1c-B 제품 수정 — 정확한 탐색 목표와 표시 상태 (2026-11-12)

**판정: 제품 수정 및 로컬 단위·계약 검사 완료. Mac 실자산 20/20은 재실행 대기다.**
직전 macOS 결과 7/20, 사람 청취 0/10, 시각 검수 및 A-10 1시간 메모리는 통과로 바꾸지 않았다.

## 기준과 범위

- 요청 기준: `0befbd2c58b209e7b9fca0e25daa6b8389842756`.
- 처음 확인한 원격: `bf8b365069c72550228d6e8945ea1a06149aeb73`. 이미 추가된 범례 수정 및 범위 문서를 보존했다.
- 최종 검사 소스 기준: `efd0109d0953677c030701fa259ea1b88aa1060a`.
  작업 중 추가된 문서 커밋 3개도 보존했다. 이 소스의 트리 `d8019830da99114a17dc8016b64e7852d10080ba`와 로컬 기준 트리가 같음을 확인한 뒤 패치를 검사했다.
- 먼저 읽은 자료: [macOS 재실행](P1C_B_MACOS_RERUN_20261112.md), [R14](../LAUNCH_CHECKLIST_20261110.md), `scripts/verify-conference-media-browser.mjs`.
  이후 추가된 [딥링크 프로브](P1C_B_DEEPLINK_PROBE_20261112.md)의 이미지 숨김 증거도 회귀 검사에 반영했다.
- 기존 macOS 영수증, 실제 타임라인·미디어 manifest, 지정된 다른 워크스트림 파일 4개는 변경하지 않았다.

## 1. URL 자기 메아리

기존 `writeUrl()`의 0.1초 반올림을 제거했다. URL에는 정확한 탐색 목표가 있으면 그 값을, 재생이 진행된 뒤에는 native 이벤트 시각을 `String()`으로 기록한다. 기존 초 단위 쓰기 빈도 제한은 유지한다.

`syncFromUrl()`은 마지막으로 직접 기록한 URL과 같으면 기존 lifecycle pause만 수행하고 native seek를 다시 요청하지 않는다. 다른 URL을 소비하면 이전 자기 기록 표식을 지우므로 A → 외부 B → 외부 A도 정상 탐색한다. 재로드 시 URL 표식과 미디어 소유권을 함께 초기화한다.

14개 실제 세션 경계 직전 시각에서 정확한 setter 요청, URL 보존, `pageshow`의 추가 seek 없음, 실제 외부 URL 변경 처리를 검사했다.

## 2. 장표·자막 적용 경로

기존 코드는 자막과 장표에 이미 같은 `state.segment`를 썼다. 문제는 그 공통 인덱스의 입력이 정확한 탐색 목표에서 native read-back으로 바뀌며 경계 바로 앞에 도달할 수 있다는 점이다. `dataset.time`은 밀리초로 반올림되므로 이 차이가 화면의 상태 값에서는 가려진다.

다음은 실제 타임라인과 JavaScript 수치로 재현한 경로다. **Mac의 native 시계를 새로 측정한 값이 아니라, 원인을 재현한 read-back 모형**이다.

| 값 | r17 2쪽 | final 6쪽 |
| --- | ---: | ---: |
| 요청 이벤트 시각 | 2239.5 | 2401.74 |
| 세션 offset | 2116.38 | 2116.38 |
| 정확한 setter 입력 `target - offset` | 123.11999999999989 | 285.3599999999997 |
| 마이크로초 절삭 read-back 모형 | 123.119999 | 285.359999 |
| 합산한 native 이벤트 시각 | 2239.499999 | 2401.7399990000004 |
| 기존 `dataset.time` 표시 | 2239.5 | 2401.74 |
| 정확한 목표의 segment | 290 / page 2 | 342 / page 6 |
| read-back으로 선택되는 이전 segment | 289 / null | 341 / null |

이전 null 구간을 적용하면 r17의 이미지 `src`가 올바르게 남아 있어도 `image.hidden`이 true가 되고 빈 상태 메시지가 드러날 수 있다. 따라서 src만 확인하지 않고 이미지와 빈 상태의 표시 여부도 함께 고정했다.

수정은 다음 두 값을 구분한다.

- `state.time`: 실제 session offset + native read-back을 유지한다. 기존 앱/native 시계 1ms 일치 계약을 그대로 따른다.
- `seekTarget.time`: 요청한 정확한 이벤트 시각을 보존해 정지한 탐색의 자막·장표·발표 제목과 URL에 사용한다. 실제 재생이 목표에 도달하면 해제하고 native 시계로 전환한다.

재생 시작과 상대 이동도 남아 있는 정확한 목표를 사용하므로 read-back 오차를 새로운 seek 입력으로 재주입하지 않는다. seek 진행 중, metadata가 없는 상태, 이전 미디어 소스의 늦은 clock 이벤트도 표시 상태를 덮지 못하게 했다. 종료·새 세션·재로드에서는 목표를 초기화하거나 새 요청으로 교체한다.

회귀 검사 범위:

- `2401.74 / final-290` → segment 342, 6쪽; `2239.5 / r17-clean-257` → segment 290, 2쪽.
- read-back이 48kHz 한 샘플만큼 앞선 경우 및 ±20ms인 경우에도 정확한 자막·장표·URL과 native 시계 계약 유지.
- 실제 타임라인 final **73** + r17 **127** = **200개** 페이지의 최초 매핑 시각: 딥링크, 현재 장표 버튼, `]` 전진, `[` 후진.
- 올바른 src, `image.hidden === false`, 빈 상태 `hidden === true`를 read-back과 `pageshow` 이후에 확인.
- r17 첫 preload 완료가 native read-back 전/후에 오는 두 순서. Image callback 모형이며 실제 WebP 브라우저 디코딩은 아니다.
- 의도적인 `t0 - 1µs` 요청은 이전 구간을 유지한다. 전역 반올림이나 경계에 epsilon을 더하는 보정은 없다.
- 목표 이전의 첫 재생 tick, 이후 정상 진행, 덱 전환, 동일 URL 재로드, A → B → A 탐색.

기존 live-region 검사 2개는 재생 진행을 모델링하기 전에 실제 player play 경로를 호출하도록 보완했다. 기존 단일 live owner 및 source별 알림 횟수 단언은 모두 유지했다.

## 3. 하네스 출력 오류

`--out`의 부모는 `mkdir(dirname(out), {recursive:true})`로 생성한다. 최종 영수증 디렉터리는 `recursive:false`를 유지하므로 기존 출력과 영수증을 덮어쓰지 않는다.

마지막 JSON 요약의 `reason`은 skip 사유 또는 첫 실패의 오류·스택을 포함한다. 부모가 파일인 경우나 출력이 이미 존재하는 경우처럼 `report.json`을 만들지 못해도 `ENOTDIR`/`EEXIST`와 경로를 출력한다.

## 실제 실행한 검증

환경: Linux, Node **v24.22.1**. 기존 설치 의존성과 미디어 도구를 재사용했으며 새 도구를 설치하지 않았다.

| 검사 | 결과 |
| --- | --- |
| `node --test --test-reporter=tap tests/conference-*.test.mjs tests/static-module-references.test.mjs tests/boot-preloads.test.mjs tests/site-preloads.test.mjs tests/boot-shell.test.mjs` | **254/254**, 실패 0, skip 0 |
| 위 묶음의 player 테스트 | **56/56** |
| 위 묶음의 media browser CLI·계약 테스트 | **13/13** |
| `npm run typecheck` | exit 0 |
| `npm run verify:static` | exit 0; 968파일, 219 scripts, 972 references |
| `node scripts/verify-conference-timeline.mjs --timeline dist/conference/timeline.json --sources docs/conference/source-segments.json --out build/p1cb-product-fix/timeline-verification.json` | **9,168/9,168** 원본 행, 누락·중복·변경 0 |
| `node scripts/build-site-preloads.mjs` 후 `--check` | 통과; player source hash 및 합계 bytes만 재생성 |
| 제품·하네스·테스트 `node --check`, `git diff --check` | 통과 |
| `node scripts/verify-conference-media-browser.mjs --out build/p1cb-product-fix/absent-media/new-parent/receipt` | 부모가 없던 경로에 report 생성; **skip exit 2**, 브라우저 0회, 실자산 case 0 |

미디어 생성기·HTTP 테스트가 사용하는 임시 합성 PDF/MP3/WebP/AAC 픽스처는 사용자 실자산 547장·15세션의 재생 검증이 아니다. 최초 `npm run verify:conference`는 인자가 없는 package script라 사용법 오류로 종료했고, 위 표의 명시적 `--timeline`/`--sources` 명령으로 정상 검증했다. 최초 preload `--check`는 수정된 player의 hash가 이전 값이라 실패했고, 기존 생성기로 두 파일을 갱신한 후 통과했다.

기계 판독용 명령·결과·소스 SHA-256은 [JSON 영수증](P1C_B_PRODUCT_FIX_20261112.json)에 기록했다. 실행 원문은 `build/p1cb-product-fix/`에 두었다.

## 계약과 남은 수용 조건

150ms 장표 전환, HTTP 206/416, 정확한 native setter, 기존 AAC read-back 64ms와 앱/native 1ms 일치, H1 1개, unavailable skip exit 2는 그대로다. 계약 모듈과 seek/slide 관측기는 수정하지 않았다.

이 환경에서는 실제 브라우저, 실제 547장 WebP 디코딩, 15세션 native 재생 및 20케이스를 실행하지 않았다. 전체 저장소 `npm test`, A-9 브라우저 부팅 측정, A-10 1시간 메모리, 사람 청취·시각 검수도 이번 회차의 통과 주장에 포함하지 않는다.

사용자는 새 제품 소스로 기존과 같은 격리 사본에 실제 패키지를 설치한 뒤 아래 명령을 새 출력 디렉터리로 실행한다.

```sh
node scripts/verify-conference-media-browser.mjs \
  --dist <최신-제품과-실자산을-담은-격리-사본> \
  --out <새-영수증-디렉터리>
```

**R14의 실자산 최종 수용은 Mac 재실행 20/20 확인 이후다.** main push·병합·배포·force push·계정 및 권한 변경은 수행하지 않았다.
