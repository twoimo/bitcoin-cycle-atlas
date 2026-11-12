# P1c-A — 컨퍼런스 미디어 생성·검사·플레이어 연결 계약

이 문서는 잠긴 PDF 2개와 원본 MP3 2개로 페이지 이미지와 발표별 오디오를 준비하는 절차다. 기준은 [WP-ABC 요청서 A-4·A-7·A-8](../requirements/REQ_WP_ABC_20261110.md), [2026-11-12 덱 잠금](deck-lock-20261112.json), 커밋된 [timeline.json](../../dist/conference/timeline.json)이다. 생성기는 [prepare-conference-media.mjs](../../scripts/prepare-conference-media.mjs), PDF 렌더러는 [render-media.py](../../scripts/conference/render-media.py), 공통 메타데이터 검증기는 [media.js](../../dist/conference/media.js)다.

현재 저장소에는 실제 페이지 이미지·오디오 대신 `status: "unavailable"`인 매니페스트가 들어 있다. P1c-A Linux 회차에서는 잠긴 원본 4개를 읽거나 실제 전체 산출물을 생성하지 않았다. 이후 사용자가 HEAD `9715433`에서 macOS 실제 생성·`--check` 결과를 제공했다. 그 사용자 제공 실측과 P1c-B의 새 검증은 [P1c-B 영수증](P1C_B_MEDIA_VERIFICATION_20261112.md)에 구분해 기록한다. 이 문서의 547장·15오디오는 생성 계약이며, 다른 회차의 실측을 새 실행 결과로 사용하지 않는다.

## 1. 입력과 동일성

PDF 승인 값은 덱 잠금에서, MP3 승인 값과 macOS 경로는 [기존 자동화 영수증 §1](WP_A_AUTOMATED_MEDIA_20261111.md)에서 가져온다. 아래 표는 승인 입력 식별자이며, 이번 환경에서 원본을 새로 해시한 결과가 아니다.

| 입력 ID | 역할 | 바이트 | SHA-256 |
| --- | --- | ---: | --- |
| `final-290` | 정본 PDF, 290쪽 | 63,311,016 | `4b1affb46789400a4079743bb8f5b29bfbdcc4aa36544f4a43c3c7516dbd24db` |
| `r17-clean-257` | 잠긴 R17 깔끔본 PDF, 257쪽 | 20,233,799 | `3760cd72c04c4625750f3fe80b0b28cc666fe9a0b9a8467823750c30b87c873e` |
| `plaud-1` | 이벤트 0–18,000초 원본 MP3 | 72,000,800 | `816e26250f012e5b92bea16379b108a5e3b665e582fc5034a4f6899afad0597d` |
| `plaud-2` | 이벤트 18,000–20,400초 원본 MP3 | 9,603,152 | `cadc5e3abcfd6ec2ebcaa4c1c1649b3481eba36f2da60859e2ccc2c224145aff` |

생성기는 도구 실행과 출력 파일 생성 전에 입력 바이트와 SHA-256을 대조한다. 두 PDF는 잠금 파일의 ID·순서·쪽수·해시와도 일치해야 한다. MP3는 위 순서로 `--audio`를 두 번 전달한다. 다른 R17 원본, QA24 복원본, 이름이 비슷한 PDF, 교체된 MP3는 승인 입력으로 처리하지 않는다. PDF/PPTX 원본을 다시 저장하거나 OCR·페이지 매핑을 다시 만드는 단계는 없다.

미디어는 정확한 timeline 바이트에 연결된다. 이 문서 작성 시 저장소 파일의 식별자는 다음과 같다.

| 저장소 입력 | 바이트 | SHA-256 |
| --- | ---: | --- |
| `dist/conference/timeline.json` | 1,044,921 | `fd15b3ef18213b9adc3bff87d523cc1c2ca907ca59163b646d55308c5d1666ad` |
| `docs/conference/deck-lock-20261112.json` | 4,730 | `3602c9f07fdd44ae761e3e2c5c8d0a4124a9b4f2d31994809b0b07b9a7ed4272` |

실행 시에는 파일을 다시 읽어 식별자를 계산한다. 기존 매니페스트의 해시를 새 timeline에 맞춰 수동으로 바꾸는 방식은 이 계약에 포함되지 않는다.

## 2. 출력 구조와 15개 프로그램

`--out`은 `dist/` 및 원본 입력 폴더 밖의 **존재하지 않는 전용 디렉터리**여야 한다. 생성기는 기존 출력을 덮어쓰지 않는다. 아래 계획을 사용한다.

| 출력 | 파일명 | 개수 | 고정 설정 |
| --- | --- | ---: | --- |
| 정본 장표 | `pages/final/0001.webp`–`0290.webp` | 290 | 긴 변 정확히 1,800px, RGB, WebP quality 80·method 6 |
| R17 장표 | `pages/r17/0001.webp`–`0257.webp` | 257 | 위와 같음 |
| 프로그램 오디오 | `audio/session-00.m4a`–`session-14.m4a` | 15 | FFmpeg software AAC-LC, mono, 48kHz, 목표 40kbps |
| 매니페스트 | `media-manifest.json` | 1 | schemaVersion 1, UTF-8 JSON |
| **합계** | 페이지 547 + 오디오 15 + 매니페스트 1 | **563** | 실제 파일 바이트는 생성 후 기록 |

이전 외부 산출물의 **564개**는 오디오를 원본 파일 경계에서도 나눈 547 + 16 + 1이었다. 이 파이프라인은 각 프로그램을 하나의 파일로 만들므로 오디오는 15개다. 프로그램 구간을 줄이거나 두 프로그램을 합친 결과가 아니다. 과거 영수증의 35.2MiB 이미지·약 121MiB 오디오 수치를 새 산출물의 실측으로 재사용하지 않는다.

모든 시간은 이벤트 시작 12:33을 0으로 한 초다. 다음 `talks` 경계는 기존 timeline이 소유한다.

| talk ID | 프로그램 | t0 | t1 | 출력 |
| --- | --- | ---: | ---: | --- |
| `00` | 개회·사전 안내 | 0 | 2116.38 | `session-00.m4a` |
| `01` | 아파트 매매 거래량으로 보는 매수 타이밍 | 2116.38 | 3282.34 | `session-01.m4a` |
| `02` | 내 삶을 바꾸는 부동산 : 내집마련 & 자산 스케일업 전략 | 3282.34 | 4659.04 | `session-02.m4a` |
| `03` | 실전 투자 사례를 배우는 경매 물건 고르는 법 | 4659.04 | 5897.35 | `session-03.m4a` |
| `04` | 첫 번째 휴식 | 5897.35 | 7020 | `session-04.m4a` |
| `05` | 이렇게 하면 주식 망합니다 | 7020 | 8220 | `session-05.m4a` |
| `06` | 주식 초보자인 '나 어떻게 하면 잘할 수 있을까? | 8220 | 9420 | `session-06.m4a` |
| `07` | "기업분석" 잘하려고 하지 말고 일단써보세요 | 9420 | 10868.02 | `session-07.m4a` |
| `08` | 테마, 누구나 할 수 있는가? 그리고 어떻게 공부해야하는가? | 10868.02 | 12104.01 | `session-08.m4a` |
| `09` | 두 번째 휴식 | 12104.01 | 12936.63 | `session-09.m4a` |
| `10` | 비트코인의 싸이클, 언제 시작될까? | 12936.63 | 14385.72 | `session-10.m4a` |
| `11` | 직장인 공모주 청약, 월급에 '더하기'를 만드는 방법 | 14385.72 | 15519.39 | `session-11.m4a` |
| `12` | 미국 증시를 읽는 세 개의 축 그리고 2027 AI 투자 핵심 키워드 | 15519.39 | 17956.51 | `session-12.m4a` |
| `13` | 메타인지와 잃지 않는 매매 - 삼플레 | 17956.51 | 20042.82 | `session-13.m4a` |
| `14` | 폐회·선물·기념 촬영 | 20042.82 | 20400 | `session-14.m4a` |

### 원본 경계를 가로지르는 session-13

MP3를 각각 mono 48kHz signed 16-bit little-endian PCM으로 한 번 디코드한 뒤, 아래 반개구간을 샘플 단위로 잘라 **PCM 상태에서 순서대로 이어 붙이고 AAC 한 파일로 인코딩**한다.

| 원본 | 이벤트 구간 | 원본 내부 구간 | 48kHz 시작 샘플 | 끝 샘플(미포함) |
| --- | --- | --- | ---: | ---: |
| `plaud-1` | [17956.51, 18000) | [17956.51, 18000) | 861,912,480 | 864,000,000 |
| `plaud-2` | [18000, 20042.82) | [0, 2042.82) | 0 | 98,055,360 |

따라서 session-13의 논리 길이는 2,086.31초이며, 이벤트 18,000초에서 파일을 바꾸지 않는다. 각 세션의 `offset`은 원래 `t0`이고 `durationSec`은 `t1 - t0`다. 원본 MP3의 컨테이너 길이나 AAC padding을 누적해 다음 세션의 시작 시각을 만들지 않는다.

원본 디코드 샘플이 요청 범위를 모두 포함해야 하며 부족한 오디오를 무음으로 채우지 않는다. 이벤트 바깥의 원본 꼬리는 사용 범위에 들어가지 않는다. 인코딩 결과의 probe 길이는 한 AAC frame인 `1024 / 48000`초 범위에서 검사하지만, 이것은 파일 인코딩 검사다. timeline 경계, 자막 동기화 수용 기준, 기존 하네스 허용치를 바꾸지 않는다.

## 3. 매니페스트 스키마와 검사 범위

`media-manifest.json`의 `kind`는 `atlas-conference-media`, `schemaVersion`은 1이다. ready 문서의 주요 필드는 다음과 같다.

| 필드 | 계약 |
| --- | --- |
| `eventId`, `status` | 원래 이벤트 ID, 준비된 패키지는 `ready` |
| `settings`, `limits` | 위 고정 인코딩 설정, 25MiB·20,000파일 상한 |
| `inputs[]` | PDF 2개와 MP3 2개의 basename·바이트·SHA-256; 쪽수 또는 이벤트 범위·실제 디코드 샘플 수 |
| `timeline`, `deckLock` | 사용한 원문 바이트 수와 SHA-256 |
| `toolchain` | Node·OS·아키텍처·Python·PyMuPDF·MuPDF·Pillow·libwebp·FFmpeg·ffprobe와 생성기/렌더러 파일 식별자 |
| `decks[]` | 원래 ID·dir·pageCount, 승인 PDF 해시를 연결하는 `inputSha256` |
| `audio[]` | `session-NN`, 원래 `talkId`, `file`, 정확한 `t0`, `t1`, `durationSec`, 모든 `sourceRanges` |
| `sourceRanges[]` | 원본 ID, 이벤트/원본 내부 구간, 정수 `startSample`·`endSample` |
| `assets[]` | 모든 실제 파일의 상대 경로·종류·바이트·SHA-256; 이미지 크기 또는 AAC probe 메타데이터 |
| `totals` | 페이지·오디오·자산 개수, 자산 바이트 합계·최댓값, 매니페스트 포함 파일 수, 기존 사이트와 합친 파일 수 |
| `review` | `listening: "pending"`, `visual: "pending"` |

자산 배열 순서는 정본 페이지 오름차순, R17 페이지 오름차순, 세션 00–14 순서다. 누락·추가·중복 파일과 안전하지 않은 상대 경로, 다른 이벤트/timeline, 다른 덱 디렉터리·쪽수, 프로그램 경계의 누락·중첩, 인코딩 설정·합계 불일치는 검사 실패다.

저장소 기본 매니페스트는 다음처럼 **준비되지 않은 상태만 선언**한다. 가짜 장표나 오디오를 가리키지 않는다.

```json
{
  "schemaVersion": 1,
  "kind": "atlas-conference-media",
  "eventId": "plspo-2026-10-31",
  "status": "unavailable",
  "decks": [],
  "audio": [],
  "assets": []
}
```

`ready`는 기계적 준비 상태다. 실제 내용의 청취·시각 검수와 배포 승인 여부를 표현하지 않는다. 검증기는 원래 timeline을 읽으며 `segments[].page`, `talks` 또는 자막 원문을 수정하지 않는다.

## 4. 플레이어 연결과 초기 로드 계약

[player.js](../../dist/conference/player.js)는 기존 timeline 로드와 ready 렌더를 먼저 완료한다. timeline의 모든 오디오와 이미지가 명시적으로 unavailable일 때만 같은 디렉터리의 `media-manifest.json`을 선택적으로 요청한다. 기존 재생 가능한 미디어를 선언한 테스트 픽스처와 레거시 경로는 그 선언을 사용한다.

ready 매니페스트를 받으면 그때 `import('./media.js')`와 timeline SHA-256 계산을 시작한다. 검증된 결과는 별도 덱 가용성/경로와 재생 clip 배열에 적용한다. 페이지 매핑 인덱스와 자막·프로그램 경계는 원래 timeline을 계속 사용한다. 오디오의 `currentTime`은 `이벤트 시각 - 세션 t0`, 이벤트 시각은 `세션 t0 + currentTime`으로 환산한다. 인코더 꼬리 때문에 현재 세션의 원래 `t1`을 넘지 않도록 하고, 다음 세션은 자기 `t0`에서 시작한다.

적용 시 재생 시각·선택한 덱·재생 속도를 보존하며 자동 재생하지 않는다. 덱 전환만으로 오디오 파일을 다시 로드하지 않는다. 기본 매니페스트는 timeline과 같은 디렉터리에 두고, 자산 상대 경로는 매니페스트 위치를 기준으로 해석하므로 프로젝트 하위 경로도 유지한다. 이미 파괴됐거나 다른 로드로 교체된 플레이어에는 늦은 응답을 적용하지 않는다.

unavailable 선언, 404, 네트워크 실패, JSON/스키마 오류, 다른 timeline 해시는 기존 **“장표 이미지 없음”·“오디오 없음”**과 자막 탐색을 유지한다. 커밋된 작은 unavailable 문서는 정상 200 응답을 제공하므로 기본 상태에서 없는 매니페스트를 요청해 생기는 404 콘솔 오류를 피한다. `whenMediaSettled()`는 선택적 메타데이터 적용의 완료를 관찰하며, 실제 오디오·이미지 디코드나 사람 검수 완료를 뜻하지 않는다.

초기 정적 import URL 집합과 A-9 부트 preload URL을 늘리지 않는다. 기존 ready 판정, 2,500ms 초기 로드·150ms 페이지 전환 예산, 72px 이동·0.01px 허용치·H1 1개 계약과 브라우저 하네스는 유지한다. standalone의 원래 CSS 41개 블록 계약도 이 작업의 변경 대상이 아니다. 선택적 메타데이터를 ready 뒤에 처리한다는 구현 사실만으로 A-9 성능 통과를 주장하지 않는다.

## 5. 확인된 도구체인과 macOS 재사용

사용자의 Mac에서는 실제 생성과 `--check`가 이미 실행됐다. **새 도구 설치나 FFmpeg/PyMuPDF 다운그레이드는 이 절차에 없다.** 기존 도구가 없다고 적었던 R14 점검과 `brew install ffmpeg@7` 안내는 이 사용자 제공 결과로 갱신한다.

| 도구 | P1c-A Linux에서 실행한 환경 | 사용자가 보고한 macOS 실제 렌더 환경 |
| --- | --- | --- |
| Python | 3.12.14 | **3.13.12** |
| PyMuPDF | 1.26.6 | **2.1** |
| MuPDF | 1.26.11 | **1.28.6** |
| Node·플랫폼 | v24.22.2·linux/x64 | **v26.13.0·darwin/arm64** |
| Pillow | 13.0.0 | **13.0.0** |
| libwebp | 1.6.0 | **1.6.0** |
| FFmpeg | 7.1.5-0+deb13u1 | **9.0.2** |
| ffprobe | 7.1.5-0+deb13u1 | **9.0.2** |

Linux 환경은 [P1c-A 검증 영수증](P1C_A_VERIFICATION_20261112.md)의 실행 기록이고, Mac 환경은 사용자가 HEAD `9715433`에서 제공한 기록이다. 둘을 같은 도구체인으로 취급하지 않는다. [requirements.txt](../../scripts/conference/requirements.txt)의 `PyMuPDF==1.26.6`, `Pillow==13.0.0`은 Linux 재현 경로로 그대로 둔다. 이미 성공한 Mac 도구를 이 파일에 맞추기 위해 바꾸지 않는다.

기존 Mac 셸에서 실행 파일을 확인하고, 생성 당시와 같은 경로를 이후 `--check`에도 사용한다. 아래는 버전 조회이며 설치 명령이 아니다.

```sh
node --version
/Users/twoimo/.aside/runtime/bin/python3 --version
/Users/twoimo/.aside/runtime/bin/python3 -c 'import pymupdf, PIL; from PIL import features; print("PyMuPDF", pymupdf.VersionBind, "MuPDF", pymupdf.VersionFitz, "Pillow", PIL.__version__, "libwebp", features.version("webp"))'
/opt/homebrew/bin/ffmpeg -version
/opt/homebrew/bin/ffprobe -version
```

생성기는 FFmpeg software `aac`를 명시하며 macOS AudioToolbox `aac_at`로 대체하지 않는다. 버전 문자열만 같더라도 빌드 fingerprint·아키텍처가 다르면 같은 출력 해시를 보장하지 않는다. 이번 작업은 macOS/Linux 사이의 바이트 동일성을 주장하지 않는다. package.json에 없는 `sharp`나 `afconvert`도 이 경로의 전제가 아니다.

아래 생성 명령은 같은 잠금 입력을 **새 디렉터리에 다시 생성할 필요가 있을 때만** 사용하는 예시다. 이미 생성된 `build/p1c-media-20261112`를 재생성하거나 덮어쓰지 않는다. 예시의 `build/p1c-media-20261112-new`도 실행 전에 없어야 한다. 입력 경로는 잠금과 원본 영수증에 적힌 macOS 경로다.

```sh
node scripts/prepare-conference-media.mjs \
  --pdf-final "/Users/twoimo/Documents/projects/plspo-conference-20261031/00_열람/플스포_강연자료_최종.pdf" \
  --pdf-r17 "/Users/twoimo/Documents/projects/plspo-conference-20261031/깔끔본_R17_로고_20261109/플스포_강연자료_최종본_깔끔본_20261110.pdf" \
  --audio "/Users/twoimo/Documents/projects/plspo-conference-20261031/RAW/audio/plaud_conf2026_1_of_2_1233-1733_5h00m.mp3" \
  --audio "/Users/twoimo/Documents/projects/plspo-conference-20261031/RAW/audio/plaud_conf2026_2_of_2_1733-1813_40m.mp3" \
  --out build/p1c-media-20261112-new \
  --python /Users/twoimo/.aside/runtime/bin/python3 \
  --ffmpeg /opt/homebrew/bin/ffmpeg \
  --ffprobe /opt/homebrew/bin/ffprobe
```

기본 입력은 커밋된 `dist/conference/timeline.json`, `docs/conference/deck-lock-20261112.json`, 전체 사이트 인벤토리는 `dist/`다. 별도 경로가 필요하면 `--timeline`, `--deck-lock`, `--site-dist`를 명시할 수 있으나 승인 원본·품질·상한을 완화하는 CLI 옵션은 없다.

원본 PCM은 이벤트 범위 산술상 `20,400 × 48,000 × 2 = 1,958,400,000`바이트다. 원본의 짧은 꼬리와 임시 출력까지 고려해 **약 2GiB의 임시 PCM 공간 외에 산출물 공간도 필요**하다. 이는 디스크 예산 계산이며 실제 산출물 크기 측정이 아니다. 생성과 `--check` 모두 OS 임시 디렉터리에 PCM을 만들고 실행 종료 시 정리한다.

생성은 임시 공간에서 렌더·인코딩·검사를 끝낸 뒤 출력 디렉터리를 독점 생성하고 페이지/오디오를 옮긴 다음 ready 매니페스트를 마지막으로 옮긴다. 게시 중 실패하면 이 실행이 독점 생성한 디렉터리의 device/inode가 여전히 같을 때만 부분 출력을 정리한다. 다른 실행이 먼저 만든 출력이나 같은 경로에 교체해 둔 디렉터리는 정리 대상이 아니다. 정리 실패는 원래 오류와 함께 보고한다. 따라서 정상적으로 처리한 게시 실패는 ready 매니페스트가 있는 반쪽 패키지로 남지 않는다.

전체 디렉터리를 단일 원자 연산으로 게시한다고 주장하지 않는다. 강제 종료·정리 실패로 디렉터리가 남았다면 내용을 확인한 뒤 다른 새 `--out` 경로로 다시 준비한다. 다음 생성도 기존 출력을 덮어쓰지 않는다.

## 6. 동일 명령의 `--check` 검사

사용자가 이미 생성한 `build/p1c-media-20261112`는 아래처럼 같은 도구체인으로 확인한다. 이 모드에서는 출력이 이미 존재해야 한다. 생성 당시 실행 파일이 현재 PATH의 `python3`·`ffmpeg`·`ffprobe`와 다르면 그때의 명시적 경로를 사용한다.

```sh
node scripts/prepare-conference-media.mjs \
  --pdf-final "/Users/twoimo/Documents/projects/plspo-conference-20261031/00_열람/플스포_강연자료_최종.pdf" \
  --pdf-r17 "/Users/twoimo/Documents/projects/plspo-conference-20261031/깔끔본_R17_로고_20261109/플스포_강연자료_최종본_깔끔본_20261110.pdf" \
  --audio "/Users/twoimo/Documents/projects/plspo-conference-20261031/RAW/audio/plaud_conf2026_1_of_2_1233-1733_5h00m.mp3" \
  --audio "/Users/twoimo/Documents/projects/plspo-conference-20261031/RAW/audio/plaud_conf2026_2_of_2_1733-1813_40m.mp3" \
  --out build/p1c-media-20261112 \
  --python /Users/twoimo/.aside/runtime/bin/python3 \
  --ffmpeg /opt/homebrew/bin/ffmpeg \
  --ffprobe /opt/homebrew/bin/ffprobe \
  --check
```

검사는 원본 해시·쪽수·오디오 probe와 디코드 범위를 다시 확인하고, 출력 파일 집합·각 파일의 바이트/해시·WebP 형식과 크기·AAC 형식과 길이·전체 사이트 파일 수를 대조한다. 매니페스트의 내용과 직렬화 순서까지 다시 계산한 기대값과 같아야 한다. 출력 파일이나 매니페스트를 다시 쓰지 않는다. 모든 페이지를 새로 렌더하거나 오디오를 다시 인코딩하는 모드는 아니므로, 별도의 새 출력으로 다시 생성한 결과 간 바이트 동일성 검증과는 구분한다.

`--check`는 **생성 당시와 동일한 Node 버전·플랫폼·아키텍처·Python 및 렌더러/인코더 도구체인**을 요구한다. 생성기·렌더러 소스 해시, 입력·timeline·잠금 해시, 설정, 남겨지는 사이트 파일 수가 달라도 stale 검사에 걸린다. 도구를 업데이트한 뒤 기존 매니페스트의 도구체인 값을 수동 수정해 통과시키지 않는다.

## 7. 로컬 설치 → 검증 → 복원

P1c-B의 [실제 미디어 검증 절차](P1C_B_MEDIA_VERIFICATION_20261112.md)를 사용한다. 설치 대상은 `pages/`, `audio/`, `media-manifest.json` 세 항목이며, timeline/player/route와 원본 PDF·MP3는 복사하거나 수정하지 않는다. 기존 unavailable 매니페스트를 보관하고, 두 자산 디렉터리가 모두 준비된 뒤 ready 매니페스트를 마지막으로 설치한다. 검증 종료 시 이번 설치 항목만 제거하고 보관한 매니페스트를 바이트 그대로 복원한다. 기존 미디어가 이미 있는 경로에는 덮어쓰거나 혼합 설치하지 않는다.

Cloudflare 로컬 산출물을 확인할 때는 **`npm run build:cloudflare`를 먼저 실행하고 그 뒤에 미디어를 설치**해야 한다. 이 명령은 현재 커밋·트리에 맞는 빌드 검증 영수증과 실제 `ATLAS_PUBLIC_ORIGIN`을 요구한다. `build/cloudflare-assets`는 중간 스테이징이며 최종 자산 디렉터리는 `.cloudflare/output/v0/workers/default/assets`다. 빌드를 다시 돌리면 중간/최종 산출물은 재생성되므로 설치한 미디어를 유지하는 명령으로 사용하지 않는다.

기존 Cloudflare 검증 산출물은 정확한 파일 집합과 바이트를 `publication.json`에 연결한다. 빌드된 원본 디렉터리에 나중에 미디어를 추가하면 그 배포 검증 식별자가 맞지 않는다. P1c-B는 이 최종 산출물을 그대로 보존한다. 빌드 뒤 저장소 `dist/`의 별도 로컬 사본을 만들고 그 사본에만 미디어를 설치해 검사한다. 최종 Cloudflare 자산 디렉터리의 사본을 사용하지 않는다. 로컬 하네스는 원래 `/bitcoin-cycle-atlas` 경로와 매니페스트의 `dist` 파일 수 계약을 검사하기 때문이다. 따라서 이 결과는 Cloudflare 패키지 바이트·publication 유효성·배포된 응답을 검증한 것이 아니다. publication 값을 수동 갱신해 배포 검증을 통과시키지 않는다. 자세한 순서·명령·복원 확인은 P1c-B 절차에 둔다.

## 8. 용량 상한과 재현성 범위

2026-11-12 확인한 공식 제한은 [Cloudflare Workers Static Assets](https://developers.cloudflare.com/workers/platform/limits/#static-assets)의 Free Worker version당 20,000파일·파일당 25MiB, [Cloudflare Pages](https://developers.cloudflare.com/pages/platform/limits/#files)의 Free 사이트당 20,000파일·파일당 25MiB다. `25MiB = 26,214,400`바이트다.

검사기는 새 미디어 563개만 세지 않고, 교체될 파일을 제외한 기존 사이트 인벤토리와 합쳐 20,000개를 검사한다. 이미지·오디오 각 파일과 매니페스트도 25MiB 이하여야 한다. 유료 플랜의 더 높은 파일 수를 이 작업의 허용 용량으로 적용하지 않는다.

재현성을 위해 다음 조건을 명시한다.

- PDF는 PyMuPDF의 RGB 렌더, 흰 배경, 원래 주석 포함을 사용한다. 정수 래스터 반올림 뒤 크기를 맞춰 긴 변을 정확히 1,800px로 만든다. WebP는 lossy quality 80·method 6·`exact=True`이고 EXIF/ICC/XMP를 복사하지 않는다.
- MP3는 고정 `swr` resampler, dithering 없음, mono 48kHz s16le PCM으로 정규화한다. 정수 샘플 범위를 잘라 합친 뒤 FFmpeg native `aac`로 한 번 인코딩한다. 단일 thread·filter thread·filter-complex thread와 bitexact 옵션, `+faststart`, edit list를 명시한다.
- 원본 메타데이터·chapters를 제거하고 생성 시각을 `1970-01-01T00:00:00Z`로 고정한다. 자식 도구의 locale은 `C`, 시간대는 `UTC`이며, 이미지/자산/JSON 순서를 고정한다.
- 도구체인에는 Python·PyMuPDF/MuPDF·Pillow/libwebp 버전과 Node·OS·아키텍처, FFmpeg/ffprobe의 버전 출력 fingerprint, 생성기·렌더러 소스 해시를 남긴다. 입력 경로는 기계별 절대 경로 대신 basename으로 기록한다.

동일 입력·코드·설정·도구체인에서 반복 생성하는 것이 재현성 범위다. 서로 다른 macOS/Linux, CPU 아키텍처, FFmpeg 빌드나 렌더러 버전 사이에서 동일 파일 해시가 나온다고 보장하지 않는다. 고정 Python 패키지 두 개만으로 네이티브 라이브러리와 전체 도구체인이 같아지는 것도 아니다.

## 9. 이번 계약 문서로 닫히지 않는 항목

사용자가 제공한 macOS 실제 생성·검사 수치와 이 환경의 Linux 테스트는 [P1c-B 영수증](P1C_B_MEDIA_VERIFICATION_20261112.md)에 출처와 실행 범위를 나눠 기록한다. 작은 합성 PDF/오디오 테스트의 성공을 547장·15오디오 전체 생성이나 실제 장표의 시각 품질로 표시하지 않는다. 기존 padding 픽스처의 macOS exit 1과 실제 패키지 생성·`--check` 성공도 서로 다른 결과다.

실제 미디어를 설치한 브라우저의 재생·탐색·Range/206 검증, A-9 재측정 여부는 해당 실행의 영수증을 기준으로 한다. 이전 P1b A-9 통과나 새 하네스의 명시적 skip을 실제 미디어 브라우저 통과로 바꾸어 적지 않는다. 사람의 직접 청취·10지점 동기화, 실제 장표 내용의 시각 검수, 1시간 재생 메모리는 별도이며 매니페스트의 사람 검수 상태는 `pending`이다.
