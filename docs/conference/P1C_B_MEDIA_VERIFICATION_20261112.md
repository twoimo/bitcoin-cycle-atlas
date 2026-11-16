# P1c-B — 실제 미디어 정적 제공·재생 검증

**사용자는 HEAD `9715433`에서 실제 미디어 생성과 `--check`를 완료했다. 이 문서는 그 사용자 제공 수치와 새 Linux 검증을 구분한다.** 실제 PDF·MP3·WebP·M4A를 이 Linux 환경으로 가져오거나 다시 생성하지 않았다. 실제 미디어가 없는 실행의 `skipped`를 브라우저 통과로 집계하지 않는다. Cloudflare 배포, 배포된 Range 응답, 사람 청취 검수도 이 기록의 통과 대상이 아니다.

기준 구현은 [미디어 생성·연결 계약](P1C_A_MEDIA_CONTRACT_20261112.md), 실제 timeline은 [dist/conference/timeline.json](../../dist/conference/timeline.json), 입력 덱은 [deck lock](deck-lock-20261112.json)이다. 원래 P1c-A Linux 수치는 [P1c-A 검증 영수증](P1C_A_VERIFICATION_20261112.md)에 그대로 남긴다.

## 1. macOS 실제 렌더 — 사용자 제공 실측

아래는 **사용자가 HEAD `97154333e039b97c8eadd1864edba743b58323a2`에서 실행했다고 전달한 값**이다. 이 회차의 Linux 재실행이나 바이너리 재검증 결과가 아니다. 기계가 읽을 수 있는 기록은 [P1C_A_MACOS_RENDER_20261112.json](P1C_A_MACOS_RENDER_20261112.json)이다.

| 항목 | 사용자 제공 값 |
| --- | ---: |
| 생성 명령 | exit **0** |
| 같은 도구체인의 `--check` | exit **0** |
| 페이지 이미지 | **547개**, 모두 **1,800×1,012 WebP** |
| 세션 오디오 | **15개** |
| 미디어 자산 | **562개** |
| 매니페스트 포함 파일 | **563개** |
| `assetBytes` | **142,521,336B** |
| 오디오 합계 | **106,916,580B** |
| 최대 자산 | **12,775,085B** |
| 남겨지는 기존 사이트 | **967파일** |
| 설치 후 사이트 합집합 | **967 + 563 = 1,530파일** |
| 이벤트 길이 | **20,400초** |
| 매니페스트 | **163,622B** |

매니페스트 SHA-256은 **`3380d7d513dc81cd218ba9edad64dd88c258e32d7741aea3ea7e7dbf9266bb5e`**다. 이미지 합계 **35,604,756B**와 매니페스트를 포함한 패키지 합계 **142,684,958B**는 위 두 합계에서 계산한 파생 값이다. 이 파생 값을 별도로 측정한 결과라고 표시하지 않는다.

session-13은 **2,086.310초, 41,918bps, 48kHz mono AAC**다. 이벤트 18,000초의 원본 MP3 경계를 **같은 `session-13.m4a` 안에서** 연결했다. 원래 프로그램 구간 `[17956.51, 20042.82)`와 전체 이벤트 시계는 변경하지 않았다. 40kbps는 생성기의 목표 bitrate이며, 41,918bps는 사용자가 전달한 실제 probe 값이다.

### 관측된 두 도구체인

| 도구 | P1c-A Linux 실제 테스트 | macOS 사용자 실제 렌더 |
| --- | --- | --- |
| Python | 3.12.14 | **3.13.12** |
| PyMuPDF | 1.26.6 | **2.1** |
| Pillow | 13.0.0 | **13.0.0** |
| libwebp | 1.6.0 | **1.6.0** |
| FFmpeg·ffprobe | 7.1.5-0+deb13u1 | **9.0.2** |

Linux의 MuPDF는 1.26.11이었다. 작업 중 원격에 추가된 [사용자 로컬 렌더 영수증](P1C_A_LOCAL_RENDER_20261112.md)(`29f1646`, 게이트 기록 `9cc24f1`)에서 Mac의 **Node v26.13.0·darwin/arm64·MuPDF 1.28.6**, 실제 출력 `build/p1c-media-20261112`, Python `/Users/twoimo/.aside/runtime/bin/python3`, FFmpeg·ffprobe `/opt/homebrew/bin`을 추가 확인했다. 전체 실행 파일 fingerprint는 원래 매니페스트를 기준으로 하며 추정해 채우지 않는다. Linux [requirements.txt](../../scripts/conference/requirements.txt)의 핀은 유지한다. **새 설치·다운그레이드를 요청하지 않으며, 서로 다른 두 도구체인의 출력 해시가 같다고 주장하지 않는다.**

## 2. macOS padding 픽스처 실패와 수정 범위

같은 Mac에서 이전 `MP3 container padding cannot substitute for missing decoded source samples` 단위 테스트는 실제로 exit **1**이었다. 예상했던 PCM 부족 검사에 도달하기 전에 다음 오류를 받았다.

```text
Audio probe duration does not cover the declared source interval: plaud-2
```

이는 실제 547장·15오디오 생성 및 `--check`의 exit 0과 별개다. 이전 픽스처가 FFmpeg 버전에 따라 달라지는 MP3 컨테이너 길이를 가정해서, 요구한 실패 지점을 고정하지 못한 문제다.

수정된 테스트는 작은 합성 MP3의 Info 프레임 수를 **43→64**로 명시적으로 바꾼다. Linux FFmpeg 7.1.5 측정에서 광고 길이는 **1.536초**, 실제 디코드는 mono 48kHz **48,431 samples**다. 검증할 구간은 **1.25초 = 60,000 samples**로 잡는다. 테스트는 source-duration probe를 통과할 조건과 실제 샘플 부족을 각각 확인한 뒤, 기존의 **decoded-source-shortage 오류를 그대로 요구**한다. 앞선 probe 오류를 허용하거나 production 생성기의 허용치를 바꾸지 않는다.

이 수정의 Linux 집중 실행은 **18/18, fail 0, skip 0, exit 0**이었다. Mac FFmpeg 9.0.2에서 수정된 픽스처를 다시 실행한 결과는 아직 전달되지 않았다. 아래 명령을 기존 Mac 도구체인에서 실행하면 재확인할 수 있다.

```sh
PATH="/Users/twoimo/.aside/runtime/bin:/opt/homebrew/bin:$PATH" \
  node --test --test-reporter=tap tests/conference-media-build.test.mjs
```

## 3. 새 하네스의 판정과 관찰 범위

진입 명령은 다음과 같다.

```sh
npm run verify:conference:media -- --dist dist --out build/conference-media-browser
# 같은 진입점:
# node scripts/verify-conference-media-browser.mjs --dist dist --out build/conference-media-browser
```

`--dist`는 `index.html`과 `conference/`가 있는 사이트 루트다. `--out`은 **아직 존재하지 않는** 보고서·스크린샷 저장 디렉터리여야 한다. 같은 경로로 재실행해 이전 영수증을 덮어쓰는 것은 실패하며, 재실행마다 새 경로를 사용한다. 아래 §4 절차는 `mktemp`로 보고서 부모를 만들고 존재하지 않는 `browser` 자식을 `--out`으로 넘긴다. 기존 Chrome 실행 파일을 직접 지정할 때만 `--browser PATH`를 추가한다.

- 매니페스트가 없거나 올바른 `status: unavailable`이면 **`status: skipped`, 이유, exit 2**를 남기고 브라우저를 띄우기 전에 끝낸다. 합성 자산을 끼워 넣거나 실제 미디어 성공으로 바꾸지 않는다.
- `ready` 문서가 잘못됐거나 일부 파일이 빠졌거나 해시·바이트·timeline·전체 파일 수가 다르면 실패다. 불완전한 ready 패키지는 “미설치” skip으로 취급하지 않는다.
- 설치 검사에서 manifest와 timeline의 바이트·SHA-256, 모든 자산의 바이트·SHA-256, 실제 미디어/사이트 파일 수를 기록한다. 원본 생성기의 동일 도구체인 `--check`를 대체하는 단계는 아니다.
- HTTP 검사는 모든 WebP와 세션 오디오의 HEAD 응답·정확한 MIME·Content-Length를 확인한다. 각 세션에는 closed/open-ended/suffix 세 가지 GET Range의 **206 상태·Content-Range·정확한 응답 바이트**와 범위 밖 요청의 **416**을 확인한다. 547장·15세션 패키지라면 HEAD 562개, 정상 Range 45개, 범위 밖 Range 15개가 대상이다. 이것은 계획된 검사 개수이며 아래 실제 결과와 구분한다. [RFC 9110 §14.2](https://www.rfc-editor.org/rfc/rfc9110.html#section-14.2)에 따라 HEAD의 Range는 적용하지 않는다.
- 로컬 서버는 identity 응답을 사용한다. 이 검사에서 A-9 gzip/Fast 4G 성능이나 배포된 Cloudflare Range 동작까지 통과했다고 해석하지 않는다.
- missing/unavailable 대체 상태는 서버에서 가상화한다. 실제 설치된 ready 매니페스트나 바이너리를 삭제·변경해서 fallback을 만들지 않는다.

`identities.manifest`, `identities.timeline`의 `{file, bytes, sha256}`, `counts.verifiedAssetCount`, `counts.observedSiteFileCount`, `counts.observedMediaFileCount`를 실제 패키지 영수증과 대조한다. 브라우저 측 재생·탐색·장표 전환 결과는 하네스가 수집한 케이스별 관찰값으로 판단한다. 픽스처 테스트 결과만으로 실미디어 브라우저 수치를 채우지 않는다.

현재 timeline으로 계획되는 브라우저 검사는 **1440×900 한 뷰포트의 20케이스**다. 전체 547장은 파일·해시·HTTP 검사 대상이며, 페이지 전환은 timeline에서 도달 가능한 서로 다른 **200쪽**을 대상으로 한다.

| 계획된 케이스 | 개수 | 내부 관찰 대상 |
| --- | ---: | --- |
| 덱별 매핑 페이지 전환 | 2 | final-290 73쪽 + r17-clean-257 127쪽, 디코드 완료까지 기존 150ms 계약 |
| 세션 탐색·재생 | 1 | 15세션의 네이티브 탐색·재생, 이후 뒤로 탐색 |
| 세션 자동 경계 | 14 | 이전 파일의 종료와 다음 세션 재생·시계 진행 |
| session-13 원본 경계 | 1 | 같은 파일의 이벤트 18,000초 전후, 로컬 시각 43.49초 |
| missing/unavailable fallback | 2 | 이미지·오디오 없음 상태와 탐색 유지 |
| 합계 | **20** | **계획 수치이며 브라우저 통과 수치가 아님** |

원본 경계 검사는 네이티브 오디오 시계가 경계 양쪽에서 진행하고 `src`가 유지되는지 확인한다. `waiting`·`stalled`·`seeking`·`ended`·`pause` 등 중단 이벤트와 paused/error 샘플은 실패다. 이 자동 관찰은 사람의 직접 청취를 대체하지 않는다. 계획·assertion의 Linux 단위 테스트는 **15/15, fail 0, skip 0, exit 0**이며 아래 최종 60개 집중 실행에 포함된다. 실제 미디어의 브라우저 재생 실행은 아니다.

## 4. 로컬 실행 순서: 빌드 → 격리 사본에 설치 → 검증 → 복원

### 4.1 Cloudflare 빌드는 미디어 설치보다 먼저

Cloudflare 로컬 패키지도 함께 준비하는 실행이라면 아래 명령을 **미디어 설치 전에** 수행한다.

```sh
npm run build:cloudflare
```

이 명령은 실제 HTTPS `ATLAS_PUBLIC_ORIGIN`, 현재 커밋·트리에 맞는 `build/cloudflare-verification.json`, 기존 provider-source 게이트가 있어야 실행된다. 이 문서 작성 회차에서는 production 빌드를 실행하지 않았다. 게이트가 없거나 오래됐다는 실패를 받으면 그 결과를 기록한다. 통과 영수증을 만들거나 `--preview`로 바꿔 production 빌드 통과라고 기록하지 않는다. 로컬 미디어 시험만 진행할 때는 Cloudflare 빌드의 미실행/실패 상태를 별도로 남긴다.

실제 코드의 경로는 다음과 같다.

| 경로 | 역할 |
| --- | --- |
| `dist/` | 검증할 원래 제품 파일 |
| `build/cloudflare-assets` | 빌드 때 지우고 다시 만드는 중간 스테이징 |
| `.cloudflare/output/v0/workers/default/assets` | Cloudflare 최종 자산 디렉터리 |
| 최종 디렉터리의 `publication.json` | 정확한 산출 파일 집합·바이트와 소스 식별자를 연결하는 매니페스트 |

[build-cloudflare.mjs](../../scripts/build-cloudflare.mjs)와 [cloudflare-artifact.mjs](../../scripts/cloudflare-artifact.mjs)의 검증은 최종 산출물과 검토된 source의 파일 집합·바이트가 일치하는지 확인한다. 최종 디렉터리에 미디어를 나중에 복사하면 이 검증 식별자가 달라진다. 따라서 **최종 Cloudflare 산출물에는 복사하지 않는다.**

아래 절차는 빌드 뒤 **저장소 `dist/`의 독립 사본**을 만들고 그 사본에만 미디어를 설치한다. 패키징 단계에서 추가되는 `_headers`·`_redirects`·`publication.json`, 제외되는 `.nojekyll`, `/`로 바뀌는 `atlas-root`를 하네스가 원래 `dist`와 동일하다고 가정하지 않는다. 이 로컬 시험은 **Cloudflare 패키지 바이트·publication 유효성·배포된 응답을 검증한 결과가 아니다.**

### 4.2 미디어가 이미 설치돼 있으면 읽기 전용으로 실행

사용자 환경의 `dist/conference`에 ready 매니페스트와 페이지·오디오가 이미 설치돼 있다면 재설치하거나 지우지 않고 다음 명령을 사용한다. 하네스는 설치 파일을 읽고 별도 보고서만 작성한다. missing/unavailable fallback도 서버 응답으로 가상화하므로 설치본은 그대로 남는다.

```sh
(
  set -eu
  mkdir -p build
  ATLAS_MEDIA_REPORT="$(mktemp -d "$PWD/build/conference-media-browser-macos.XXXXXX")"
  printf 'Media report directory: %s\n' "$ATLAS_MEDIA_REPORT"
  npm run verify:conference:media -- --dist dist --out "$ATLAS_MEDIA_REPORT/browser"
)
```

이미 설치된 패키지를 대상으로 하는 이 경로는 설치·복원을 수행하지 않는다. Cloudflare 패키지도 새로 만들 계획이면 §4.1의 설치 전 빌드 순서를 따르는 깨끗한 기준 상태에서 별도로 진행한다. 이 읽기 전용 실행을 Cloudflare 빌드·publication 검사로 기록하지 않는다.

### 4.3 깨끗한 기준 상태에서 기존 Mac 패키지를 설치·검증하고 자동 복원

기존 `build/p1c-media-20261112`를 사용한다. 필요하면 [생성과 같은 도구체인의 `--check`](P1C_A_MEDIA_CONTRACT_20261112.md#6-동일-명령의---check-검사)를 먼저 실행한다. 이 절차는 `dist/conference/pages`와 `audio`가 없는 **깨끗한 기준 상태**에서 시작한다. 사용자의 현재 환경에 자산이 없다고 가정하지 않는다. 이미 설치돼 있다면 아래 블록은 멈추며, 기존 파일을 덮어쓰지 않고 §4.2를 사용한다.

다음 블록은 별도 사본의 원래 unavailable 매니페스트를 보관하고, 자산 폴더 두 개를 설치한 뒤 ready 매니페스트를 마지막에 복사한다. 종료·오류·인터럽트 시 이번 사본의 설치 파일만 지우고 원래 매니페스트를 바이트 그대로 복원한다. **정본 `dist/`, 기존 생성 패키지, 최종 Cloudflare 산출물은 변경하지 않는다.** 보고서는 사본과 다른 `build/` 디렉터리에 남는다. 하네스의 exit 2도 0으로 바꾸지 않는다.

```sh
(
  set -eu
  test -f build/p1c-media-20261112/media-manifest.json
  test ! -e dist/conference/pages
  test ! -L dist/conference/pages
  test ! -e dist/conference/audio
  test ! -L dist/conference/audio
  mkdir -p build
  ATLAS_MEDIA_RUN="$(mktemp -d "$PWD/build/conference-media-local.XXXXXX")"
  ATLAS_MEDIA_REPORT="$(mktemp -d "$PWD/build/conference-media-browser-macos.XXXXXX")"
  ATLAS_MEDIA_SITE="$ATLAS_MEDIA_RUN/site"
  ATLAS_MEDIA_BACKUP="$ATLAS_MEDIA_RUN/media-manifest.original.json"
  ATLAS_MEDIA_CANONICAL="$PWD/dist/conference/media-manifest.json"
  ATLAS_MEDIA_HARNESS_RAN=false
  printf 'Local media test copy: %s\n' "$ATLAS_MEDIA_SITE"

  cleanup_media_test() {
    ATLAS_MEDIA_COMMAND_EXIT=$?
    ATLAS_MEDIA_EXIT=$ATLAS_MEDIA_COMMAND_EXIT
    trap - EXIT HUP INT TERM
    set +e
    if test -f "$ATLAS_MEDIA_BACKUP" && test -d "$ATLAS_MEDIA_SITE/conference"; then
      if ! rm -rf "$ATLAS_MEDIA_SITE/conference/pages" "$ATLAS_MEDIA_SITE/conference/audio"; then ATLAS_MEDIA_EXIT=1; fi
      if ! cp "$ATLAS_MEDIA_BACKUP" "$ATLAS_MEDIA_SITE/conference/media-manifest.json"; then ATLAS_MEDIA_EXIT=1; fi
      node --input-type=module - "$ATLAS_MEDIA_BACKUP" "$ATLAS_MEDIA_CANONICAL" \
        "$ATLAS_MEDIA_SITE/conference/media-manifest.json" "$ATLAS_MEDIA_REPORT/restore.json" "$ATLAS_MEDIA_COMMAND_EXIT" "$ATLAS_MEDIA_HARNESS_RAN" <<'NODE'
import {readFile, writeFile, lstat} from 'node:fs/promises';
import {dirname, join} from 'node:path';
import {createHash} from 'node:crypto';
const [backup, canonical, local, report, commandExit, harnessRan] = process.argv.slice(2);
const [before, sourceAfter, localAfter] = await Promise.all([backup, canonical, local].map(file => readFile(file)));
const absent = async file => { try {await lstat(file); return false;} catch (error) {if (error.code === 'ENOENT') return true; throw error;} };
const localMediaRemoved = (await Promise.all(['pages','audio'].map(name => absent(join(dirname(local), name))))).every(Boolean);
const result = {localOnly:true, harnessRan:harnessRan === 'true',
  harnessExit:harnessRan === 'true' ? Number(commandExit) : null, commandExit:Number(commandExit), localMediaRemoved,
  canonicalManifestUnchanged:sourceAfter.equals(before), localManifestRestored:localAfter.equals(before),
  originalManifestSha256:createHash('sha256').update(before).digest('hex')};
await writeFile(report, JSON.stringify(result, null, 2) + '\n');
if (!result.canonicalManifestUnchanged || !result.localManifestRestored || !result.localMediaRemoved) process.exitCode = 1;
NODE
      if test "$?" -ne 0; then ATLAS_MEDIA_EXIT=1; fi
    fi
    if ! rm -rf "$ATLAS_MEDIA_RUN"; then ATLAS_MEDIA_EXIT=1; fi
    printf 'Media report directory: %s\n' "$ATLAS_MEDIA_REPORT"
    exit "$ATLAS_MEDIA_EXIT"
  }
  trap cleanup_media_test EXIT
  trap 'exit 129' HUP
  trap 'exit 130' INT
  trap 'exit 143' TERM

  cp "$ATLAS_MEDIA_CANONICAL" "$ATLAS_MEDIA_BACKUP"
  cp -R dist "$ATLAS_MEDIA_SITE"
  cp -R build/p1c-media-20261112/pages "$ATLAS_MEDIA_SITE/conference/"
  cp -R build/p1c-media-20261112/audio "$ATLAS_MEDIA_SITE/conference/"
  cp build/p1c-media-20261112/media-manifest.json "$ATLAS_MEDIA_SITE/conference/media-manifest.json"
  ATLAS_MEDIA_HARNESS_RAN=true
  npm run verify:conference:media -- --dist "$ATLAS_MEDIA_SITE" --out "$ATLAS_MEDIA_REPORT/browser"
)
```

`restore.json`의 `canonicalManifestUnchanged:true`, `localManifestRestored:true`, `localMediaRemoved:true`를 확인한다. 원래 하네스 보고서가 skipped/failed이면 복원이 성공해도 실제 미디어 검증은 통과가 아니다. 강제 종료로 trap 자체가 실행되지 못했다면 정본 파일은 그대로이며, 출력된 임시 사본 경로만 확인해 정리한다. 생성 패키지와 보고서는 다음 회차까지 보관한다.

## 5. 새 Linux 실행 영수증

이번 Linux 작업 사본은 unavailable 매니페스트와 실제 자산 0개다. 이는 사용자의 Mac에서 실제 생성·설치한 결과와 별개다. 상세 실행 값·로그 해시·코드 해시·명시적 skip 보고서는 [기계 판독 영수증](P1C_B_MEDIA_VERIFICATION_20261112.json)에 보관한다.

실행 런타임은 기존 **Node v24.22.2 linux/x64**다. 테스트는 기존 FFmpeg/ffprobe 7.1.5와 Python 3.12.14·PyMuPDF 1.26.6·Pillow 13.0.0을 사용했다. 도구를 새로 설치하지 않았다. npm 명령에는 이미 존재하는 Node 경로를 PATH 맨 앞에 두고 `/Applications/Docker.app/Contents/Resources/bin`도 포함했다. 이 Linux 런타임이 frozen 출력의 정본 조건과 일치해 npm은 **1배치**로 끝났다.

```sh
export PATH="$PWD/build/toolchain/node-v24.22.2-linux-x64/bin:$PATH:/Applications/Docker.app/Contents/Resources/bin"
```

| 실행 명령 | 실제 결과 | exit |
| --- | --- | ---: |
| `node --test --test-reporter=tap tests/conference-media-build.test.mjs tests/conference-media-browser-contract.test.mjs tests/conference-media-browser.test.mjs tests/conference-media-server.test.mjs` | **60/60**, fail 0, skip 0, **25,678.27ms**. 생성 픽스처 18 + 순서/연속성 계획 15 + CLI/브라우저 HTTP 판정 8 + 서버 19 | **0** |
| `npm test` | `complete:true`, **3,563 tests / 3,563 pass / 0 fail / 0 skip**, 1배치, **199,341.71ms** | **0** |
| `npm run typecheck` | TypeScript 오류 **0** | **0** |
| `npm run verify:static` | **968파일, 219 script, 972 reference**, `status:ok` | **0** |
| `npm run verify:conference -- --timeline dist/conference/timeline.json --sources docs/conference/source-segments.json --out build/p1cb-timeline-verification.json` | **9,168/9,168**, 누락·추가·중복·변경 **각 0**, 프로그램 15·덱 2·20,400초 | **0** |
| `node scripts/build-site-styles.mjs --check` | 원본 stylesheet **41개**, 생성물 2개의 바이트/해시 동일 | **0** |
| `node scripts/build-site-preloads.mjs --check` | 모듈 URL **55**, conference 전용 **54** + shared **1**, 정적 import edge **81**. timeline fetch preload 유지 | **0** |
| `npm run verify:conference:media -- --dist dist --out build/p1cb-media-browser-linux-integrated` | **`status:skipped`**, cases 0·passed 0·skipped 1, **`browserLaunched:false`**. 이유: `media manifest declares unavailable; real media checks were not run` | **2** |
| `npm run verify:pages` | 기존 **`Pages artifact file coverage changed`**. 커밋된 `index-ByyNTPeH.js`와 새 빌드의 `index-C6TQnx3Q.js` 불일치. 수정하지 않음 | **1** |
| `git diff --check` 및 보호 경로 비교 | 공백 오류 0. `dist/`, `.gitignore`, 생성기·렌더러·requirements, 기존 R13/heading/compare/반응형/WP6/chart-qa 하네스 변경 0 | **0** |

standalone의 **41개 style 블록·HTTP preload 0** 계약은 위 `npm test`의 실제 패키징 검사에서 유지됐다. 원래 72px·0.01px·2,500ms·150ms·H1 1개 임계값을 바꾸지 않았다. 새 실제 미디어 전환 측정도 신뢰 키 입력부터 대상 `image.decode()` 완료 후 두 프레임까지 **150ms**를 요구한다. 이 환경에서 그 브라우저 수치를 측정한 것은 아니다.

전체 테스트와 집중 테스트의 코드 기준은 `9715433`에 이번 P1c-B 변경을 올린 작업 트리다. 최종 push 전에 원격의 사용자 문서 커밋 `29f1646`·`9cc24f1`을 발견해 **fast-forward로 보존**했다. 두 커밋의 변경은 R14·로컬 렌더 영수증·requirements README뿐이며 실행 코드 변경은 없다. 위 최종 skip 실행은 이 문서를 반영한 `9cc24f1` 위에서 수행했다. 사용자의 기존 R14 실측 내용은 유지하고 P1c-B 결과를 추가했다.

초기 전체 실행도 **3,561/3,561, fail 0, skip 0**이었다. 이후 캡처 시각 양자화 회귀 2개를 추가한 최종 실행이 위 **3,563/3,563**이다. 두 실행을 합산하지 않는다. 타임라인 npm 스크립트를 인자 없이 처음 호출한 실행은 사용법을 출력하고 exit 1이었으며, 위 표는 요구되는 `--timeline`·`--sources`를 명시한 실제 커버리지 검증 결과다.

이번 회차 실제 원본 전체 생성 **0회**, 실제 미디어 브라우저 **실행 0회**, Chromium 설치/승인 요청 **0회**다. 실자산 HTTP 562개 HEAD·45개 정상 Range·15개 416과 실제 20브라우저 케이스는 **실행하지 못했다**. 작은 합성 파일의 서버/인코딩 테스트 성공으로 이를 채우지 않는다. 기존 컨퍼런스 14·A-9 6뷰포트·compare·반응형 44·WP6 30·chart-qa 12도 이번 Linux 회차에서는 실행하지 않았다. 사용자가 원격 문서에 추가한 해당 Mac 게이트 결과는 그 사용자 영수증의 결과로만 남긴다.

## 6. 남은 것

- 사용자의 기존 Mac 도구체인에서 수정한 padding 픽스처 재실행.
- 실제 패키지 설치 후 새 하네스의 장표·재생·탐색·Range/206 결과. 보고서와 원본 요청 영수증·스크린샷·복원 결과를 함께 남긴다.
- Cloudflare의 실제 배포 응답과 Range/206은 이번 로컬 서버의 성공만으로 확정할 수 없다. 배포와 main 병합·push는 이번 작업에 포함되지 않는다.
- 사람 직접 청취·10지점 ±0.5초 동기화·실제 장표 내용 검수와 A-10 1시간 메모리는 별도다. `review.listening`과 `review.visual`은 계속 `pending`이다.

바이너리 미디어를 커밋하지 않으며, 유료 용량 생성·계정/권한 변경·force push를 하지 않는다.
