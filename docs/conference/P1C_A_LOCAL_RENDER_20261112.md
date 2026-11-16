# P1c-A 실제 렌더 영수증 (macOS, 2026-11-12)

P1c-A 파이프라인(`79f1666`, 기록 `9715433`)을 이 Mac에서 실제 원본 4개로 실행한 결과다. 계약은 [P1C_A_MEDIA_CONTRACT_20261112](P1C_A_MEDIA_CONTRACT_20261112.md), 생성기는 [prepare-conference-media.mjs](../../scripts/prepare-conference-media.mjs), 렌더러는 [render-media.py](../../scripts/conference/render-media.py)다.

## 1. 결과

| 항목 | 실측 |
| --- | ---: |
| 페이지 | 547 (final 290 + R17 257) |
| 오디오 세션 | 15 |
| 자산 / 파일 | 562 / 563 |
| 자산 바이트 합계 | 142,521,336 |
| 최대 자산 | 12,775,085 (상한 26,214,400 이내) |
| 페이지 이미지 | 23MB(final) + 12MB(R17), 전부 1800×1012 WebP q80 |
| 오디오 합계 | 106,916,580바이트, 48kHz 모노 AAC-LC, 실측 41,918~41,930bps |
| 기존 사이트 + 출력 | 967 + 563 = 1,530파일 (상한 20,000 이내) |
| 길이 | 20,400초 |
| manifest | 163,622바이트, sha256 `3380d7d513dc81cd218ba9edad64dd88c258e32d7741aea3ea7e7dbf9266bb5e` |
| 빌드 시간 | 4분 29.6초 (12:45:57–12:50:27 KST) |
| `--check` 재검증 | 30.0초, 동일 수치·`mode:"check"`·exit 0 |

session-13은 2,086.310초로 원본 경계 18,000초를 한 파일 안에서 넘는다(`sourceRanges` plaud-1 861,912,480–864,000,000 샘플 + plaud-2 0–98,055,360 샘플). `review`는 계약대로 `listening:"pending"`, `visual:"pending"`이다.

## 2. 실행한 명령

```
export PATH="/opt/homebrew/bin:$PATH"
node scripts/prepare-conference-media.mjs \
  --pdf-final "$R/00_열람/플스포_강연자료_최종.pdf" \
  --pdf-r17 "$R/깔끔본_R17_로고_20261109/플스포_강연자료_최종본_깔끔본_20261110.pdf" \
  --audio "$R/RAW/audio/plaud_conf2026_1_of_2_1233-1733_5h00m.mp3" \
  --audio "$R/RAW/audio/plaud_conf2026_2_of_2_1733-1813_40m.mp3" \
  --out build/p1c-media-20261112 \
  --python /Users/twoimo/.aside/runtime/bin/python3
```

`R=/Users/twoimo/Documents/projects/plspo-conference-20261031`. 생성 전에 원본 4개의 바이트·SHA-256을 다시 계산해 잠금 값과 일치함을 확인했다(final `4b1affb4…` 63,311,016B, r17-clean `3760cd72…` 20,233,799B, plaud-1 `816e2625…` 72,000,800B, plaud-2 `cadc5e3a…` 9,603,152B).

## 3. 도구체인 — 이전 회차 기록 정정

이전 회차는 "ffmpeg·ffprobe 없음"으로 적었지만 **잘못된 측정**이었다. 두 바이너리는 `/opt/homebrew/bin/ffmpeg`·`/opt/homebrew/bin/ffprobe`(Homebrew `ffmpeg 9.0.2`, 링크 `../Cellar/ffmpeg/9.0.2_1/bin/ffmpeg`)에 있고, 그 경로가 PATH에 없던 셸에서 확인한 결과였다. 계약이 요구한 대로 ffmpeg 경로를 그대로 썼고, `afconvert` 대체나 새 도구 설치는 필요하지 않았다.

실제 렌더 환경(manifest `toolchain`에 그대로 기록됨):

| 항목 | 값 |
| --- | --- |
| Node / 플랫폼 | v26.13.0 / darwin arm64 |
| Python | 3.13.12 |
| PyMuPDF / MuPDF | 2.1 / 1.28.6 |
| Pillow / libwebp | 13.0.0 / 1.6.0 |
| ffmpeg / ffprobe | 9.0.2 (`ffmpeg version 9.0.2 …`, 지문 `0749b39e…`) |

`scripts/conference/requirements.txt`는 PyMuPDF 1.26.6·Pillow 13.0.0을 고정하지만 이 Mac의 PyMuPDF는 2.1이었다. Pillow는 고정값과 같다. 계약의 ffmpeg@7과도 다르므로 **Linux 산출물과 바이트 동일 재현은 주장하지 않는다**(계약 §"동일한 Node·OS·아키텍처 환경에서의 재검증"과 일치). 정확한 고정 조합을 요구하려면 별도 가상환경이 필요하지만, 이번 렌더는 현재 조합을 manifest에 기록하는 쪽으로 처리했다.

`sharp`는 쓰지 않는다. PDF→WebP는 PyMuPDF+Pillow가 담당하므로 12:10 회차의 "결정 필요 ①"은 **선언하지 않음**으로 닫힌다(생성기·렌더러에 sharp 의존 0건).

## 4. 설치와 버전 관리

`dist/conference/pages/`·`dist/conference/audio/`는 `.gitignore`에 있고(커밋 `79f1666`) 미디어는 저장소에 넣지 않는다. 배포는 `npm run deploy:cloudflare`로 이 Mac에서 `dist/`를 업로드하므로, **빌드 → 미디어 설치 → 배포** 순서면 커밋 없이 실제 사이트에 반영된다. 설치 순서는 계약 §설치 그대로 `pages`·`audio`를 먼저, `media-manifest.json`을 마지막에 복사한다.

이번 회차에는 설치 후 `dist/conference/media-manifest.json`만 tracked 변경이었고, 검증 뒤 커밋된 `unavailable` 상태로 되돌려 트리를 깨끗하게 유지했다. 즉 이 커밋에는 미디어가 포함되지 않는다.

## 5. 테스트 상태

- `node --test tests/conference-media.test.mjs tests/conference-player.test.mjs` → **51/51 통과**.
- `node --test tests/conference-media-build.test.mjs` → **18개 중 16 통과, 2 실패**(바깥 픽스처 테스트 1 + 그 안 1). 실패는 `MP3 container padding cannot substitute for missing decoded source samples`로, 기대한 PCM 오류 대신 컨테이너 probe 오류 `Audio probe duration does not cover the declared source interval: plaud-2`가 먼저 난다. 픽스처 MP3를 ffmpeg 9.0.2로 만들 때 컨테이너 duration이 먼저 모자라 발생하는 **도구 버전 의존 단언**이며, 제품 결함이 아니다. Pro에 버전 독립 픽스처로 고치도록 요청했다.
- 커밋된 `unavailable` manifest를 요구하는 단언은 미디어를 설치한 상태에서만 실패하고, 되돌린 clean 트리에서는 통과한다(51/51에 포함).

## 6. 남은 것

- P1c-B: 실제 자산 재생·세션 경계 seek·HTTP Range 206·Content-Type 검증(Pro 작업 중).
- 사람 청취 0/10, 시각 검수 `pending` — 기계적 `ready`는 내용 검수를 뜻하지 않는다.
- A-9 6/6 통과는 `f35d794` 기준이며, P1c-A가 `dist/index.html`·`player.js`·`media.js`·부트 preload 그래프를 바꿨으므로 새 HEAD에서 재측정이 필요하다.
