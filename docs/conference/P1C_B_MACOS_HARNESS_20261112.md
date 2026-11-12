# P1c-B — macOS 실자산 하네스 실행 (2026-11-12 13:42–13:44 KST)

이 문서는 **이 Mac에서 실제 547장·15세션 패키지로 P1c-B 하네스를 실행한 결과**다. 직전 Linux 회차의 계획값(`20케이스`·`HEAD 562`·`Range 45`·`416 15`)과 구분한다. Pro의 [P1c-B 검증 문서](P1C_B_MEDIA_VERIFICATION_20261112.md)는 Linux 샌드박스에서 `status: skipped`로 끝났고, 실자산 판정은 이 실행이 처음이다.

**한 줄 결론: 패키지 동일성과 HTTP 전송 계층(Range/206·416·MIME)은 실자산으로 통과했고, 브라우저 20케이스는 6/20이다.** 실패 14건은 §5에서 네 무리로 분류했으며, 지금 확인된 범위에서는 제품 결함으로 확정된 항목이 없다. 따라서 **P1c-B 수용은 아직 아니다.**

## 1. 실행 조건

| 항목 | 값 |
| --- | --- |
| 소스 커밋 | `e5456c5` (실행 시점 워크트리 HEAD) |
| 검증 대상 | `dist/`의 **격리 사본** (`/tmp/atlas-p1cb.Q5yvm4/site`) |
| 정본 `dist/` | **변경 없음**. `dist/conference/media-manifest.json` 167B `ff3e3f2b…` `status: unavailable`, 실행 전후 동일 |
| 미디어 공급원 | `build/p1c-media-20261112/` (2026-11-12 12:50 로컬 렌더 산출물) |
| 사본 설치 | `pages/`·`audio/` 복사 후 **ready 매니페스트를 마지막에** 복사 |
| Node | v26.5.0 (이 Mac) |
| 브라우저 | Chrome/157.0.8103.79 (headless, CDP) |
| macOS | 27.2, arm64 |
| 보고서 | `build/p1cb-media-browser-macos-20261112/` (gitignore, 다음 회차까지 보관) |

정본 `dist/`에 이미 설치돼 있던 `pages/`·`audio/`는 사본에서 지우고 패키지에서 다시 설치했다. 정본은 읽기만 했고, 실행 후 `git status`는 이 회차 이전부터 있던 다른 워크스트림 파일 3개(`dist/equity-view.js`, `dist/eth-view.js`, `scripts/verify-eth-candidate-browser.mjs`)만 그대로 보여 준다.

## 2. 설치 동일성 (preflight)

| 항목 | 값 |
| --- | ---: |
| 페이지 | **547** (final-290 290 + r17-clean-257 257) |
| 세션 오디오 | **15** |
| 자산 / 파일 | **562 / 563** |
| `assetBytes` | **142,521,336B** |
| 사이트 파일 합집합 | **1,530** (기존 967 + 563) |
| manifest | 163,622B sha256 `3380d7d5…26bb5e` |
| timeline | 1,044,921B sha256 `fd15b3ef…1666ad` |
| `verifiedAssetCount` / `observedMediaFileCount` | 562 / 562 |

12:50 렌더 영수증과 바이트·해시가 일치한다.

## 3. Mac 픽스처 재실행 — Pro 수정 확인

Pro가 버전 독립으로 고친 padding 픽스처를 이 Mac의 ffmpeg 9.0.2에서 재실행했다.

```sh
PATH="/Users/twoimo/.aside/runtime/bin:/opt/homebrew/bin:$PATH" \
  node --test --test-reporter=tap tests/conference-media-build.test.mjs
# tests 18 / pass 18 / fail 0 / skipped 0 / 25,309ms / exit 0
```

직전 회차에서 실패했던 `MP3 container padding cannot substitute…`를 포함해 **18/18 통과**다. 이전 `npm test`의 실패 2건은 이 수정으로 해소될 것으로 보이지만, 전체 `npm test`는 이번 회차에 돌리지 않았으므로 그 총계는 아직 미확인이다.

## 4. HTTP 전송 계층 — 실자산 통과

`auditConferenceMediaHttp`가 설치 서버를 상대로 실제 바이트를 받아 검사했고 **`passed: true`, `errors: []`**다.

| 검사 | 계획 | 실제 |
| --- | ---: | ---: |
| 이미지 HEAD (200·`image/webp`·정확한 Content-Length) | 547 | **547 통과** |
| 세션 오디오 HEAD (200·`audio/mp4`) | 15 | **15 통과** |
| 정상 Range 206 (closed / open-ended / suffix 각 1) | 45 | **45 통과**, 응답 바이트·SHA-256이 원본과 일치 |
| 범위 밖 Range 416 | 15 | **15 통과** (`bytes */<len>`) |

이것은 로컬 identity 서버의 결과이며, 배포된 Cloudflare의 Range 동작을 검증한 값이 아니다.

## 5. 브라우저 20케이스 — 6 통과 / 14 실패

1440×900 한 뷰포트. 계획 케이스는 덱 2 + 세션 탐색·재생 1 + 세션 경계 14 + 원본 경계 1 + fallback 2 = **20**이다.

**통과 (6):** `session-seek-and-play`(15세션 네이티브 탐색·재생·뒤로 탐색), `boundary-04-05`, `boundary-05-06`, `boundary-06-07`, `source-join-session-13-18000`(원본 18,000초 경계를 같은 파일에서 통과하며 끊김 없음), `unavailable-fallback`.

**실패 (14):** `slides-final-290`, `slides-r17-clean-257`, `boundary-00-01`, `-01-02`, `-02-03`, `-03-04`, `-07-08`, `-08-09`, `-09-10`, `-10-11`, `-11-12`, `-12-13`, `-13-14`, `missing-fallback`.

### 5.1 경계 seek 11건 — 1ms 허용치가 네이티브 시계 해상도보다 작다

`assertSeek`는 `audio.currentTime`과 `time - session.t0`의 차이를 **1ms 이내**로 요구한다. 실측 차이는 다음과 같다.

| 케이스 | 요청 로컬시각 | 관측 currentTime | 차이 |
| --- | ---: | ---: | ---: |
| boundary-00-01 | 2,114.880 | 2,114.900 | **+20ms** |
| boundary-01-02 | 1,164.460 | 1,164.420 | **−40ms** |
| boundary-02-03 | 1,375.200 | 1,375.160 | **−40ms** |
| boundary-03-04 | 1,236.810 | 1,236.860 | **+50ms** |
| boundary-07-08 | 1,446.520 | 1,446.500 | **−20ms** |
| boundary-08-09 | 1,234.490 | 1,234.480 | **−10ms** |
| boundary-09-10 | 831.120 | 831.090 | **−30ms** |
| boundary-10-11 | 1,447.590 | 1,447.570 | **−20ms** |
| boundary-11-12 | 1,132.170 | 1,132.180 | **+10ms** |
| boundary-12-13 | 2,435.620 | 2,435.610 | **−10ms** |
| boundary-13-14 | 2,084.810 | 2,084.790 | **−20ms** |

플레이어의 이벤트 시계(`state.time`)도 같은 값만큼 함께 어긋난다. 즉 **앱이 목표 시각을 잘못 계산한 것이 아니라, 브라우저가 seek 후 `currentTime`을 자기 오디오 클록 입도로 보고한 값**을 플레이어가 그대로 읽은 결과다. AAC 1프레임은 1024 samples ÷ 48,000Hz = **21.33ms**이고 관측 오차는 10~50ms 범위다. 경계 4건이 통과한 것은 그 지점들이 우연히 클록 눈금에 맞았기 때문이며, 같은 코드 경로다. 1ms 단언은 이 플랫폼에서 만족 불가능하고, 판정 기준을 AAC 프레임 기준의 문서화된 허용치로 다시 정해야 한다. 150ms 장표 전환·이벤트 매핑 정확도 계약은 이 항목과 별개로 유지된다.

### 5.2 r17 덱 — 첫 스텝이 이미 표시된 상태에서 시작

`slides-r17-clean-257`은 **전환 기록 0건**으로 `decoded mapped page pages/r17/0002.webp` 30초 타임아웃이다. 계획의 첫 스텝은 `page 2 @ t0 2239.5`인데, 덱 전환으로 진입한 직후 상태가 이미 `time 2239.5`·`image.src …/pages/r17/0002.webp`(complete, 1800×1012)였다. 이미 로드된 소스라 새 전환이 일어나지 않아 관측이 비었다. `final-290`은 첫 스텝이 `page 2 @ 2301.61`이고 진입 상태 페이지가 비어 있어 같은 스텝이 정상 관측됐다(312 index, 66.5ms). 즉 **덱별 진입 시각과 첫 스텝 시각이 같은 덱에서 하네스가 스텝을 하나 굶는 구조**다.

### 5.3 final-290 6쪽 — 디코드 실패 1건

73스텝 중 2스텝만 기록되고 `pages/final/0006.webp`에서 `EncodingError: The source image cannot be decoded.`(23.2ms)가 났다. 같은 케이스의 서버 영수증은 `0002`·`0006` 둘 다 **200·`image/webp`·`complete: true`**(130,240B / 105,528B)이고 `networkFailures`는 비어 있다. 로컬에서 547장 전부를 Pillow로 디코드하면 **실패 0건**이다. 소스 자체는 정상이므로, 전환 중 이전 `src`의 decode 거부가 새 스텝 기록에 붙은 **관측 경합**으로 본다. 현재 `src`가 실제로 디코드되지 않은 경우에만 실패로 세도록 판정을 좁혀야 한다.

### 5.4 missing fallback — 응답은 왔는데 대기 조건이 만족되지 않음

`missing` 모드에서 `conference/media-manifest.json` 요청은 서버 영수증에 **404·complete: true·35B**로 남아 있는데, 하네스의 `optional manifest response settled` 대기는 30초 타임아웃했다. 같은 파일이 `unavailable` 모드에서는 200으로 기록되고 그 케이스는 통과했다. 서버는 응답했으므로 **CDP 응답 장부 쪽 조건**이 404에서 성립하지 않는 것으로 보인다.

## 6. 이번 실행으로 확정된 것과 아닌 것

**확정**
- 로컬 렌더 패키지가 12:50 영수증과 바이트·해시 동일하게 설치된다(562자산·563파일·1,530 합집합).
- 실자산 HTTP: HEAD 562, 정상 Range 45건 206, 범위 밖 15건 416, MIME·길이·바이트 해시 전부 일치.
- 실자산 네이티브 재생: 15세션 탐색·재생·뒤로 탐색 통과, 원본 18,000초 경계를 넘는 session-13 연속성 통과, 세션 경계 4건 자동 롤오버 통과.
- ffmpeg 9.0.2에서 수정 픽스처 18/18.

**미확정**
- 브라우저 20케이스 수용(6/20). 남은 14건은 §5의 판정·관측 문제를 고친 뒤 재실행해야 한다.
- A-10 1시간 재생 메모리, 사람 청취 10지점 ±0.5초, 장표 실제 내용 검수.
- 배포된 Cloudflare의 Range/206과 프로덕션 번들.

미디어 바이너리는 커밋하지 않았고, 정본 `dist/`·Cloudflare 산출물·생성 패키지를 변경하지 않았다.
