# P1c-A — Linux 단위·정적 검증 영수증

2026-11-12 KST. 구현 커밋은 `79f16664bf6d8beae81ad97b1ff45764f07a8c53`, 트리는 `2910115ab60180b737856a244c96067fd89892b8`이다. 시작 커밋 `f35d794` 뒤 사용자가 추가한 문서 커밋 `69394b2`, `6fa1c50`을 보존하고 그 위에 구현했다.

실행 환경 연결이 끊긴 뒤 원문 변경 기록에서 소스를 복원했다. 생성기·PDF 렌더러·플레이어는 연결 종료 전 SHA-256·바이트 수와 정확히 일치하며, 아래 모든 검증을 복원 후 다시 실행했다. 최종 실행 시각·명령·exit·로그 SHA-256·구현 파일 해시는 [JSON 영수증](P1C_A_VERIFICATION_20261112.json)에 있다. 테스트는 커밋 전 작업 트리에서 실행했고 해당 바이트를 구현 커밋에 보존했다.

## 1. 결과와 범위

**전체 npm test 3,521/3,521, 실패 0, 스킵 0, complete:true**다. 생성기·매니페스트 계약·선택적 플레이어 배선을 구현했다. 실제 잠긴 원본 4개는 이 환경에 없으므로 547장·15오디오 전체 렌더, 실제 용량·해시 측정은 하지 않았다. 브라우저도 실행하지 않았다.

실제 입력 경로를 넣은 macOS 생성·검사·설치 명령과 전체 스키마는 [미디어 계약 문서](P1C_A_MEDIA_CONTRACT_20261112.md)에 있다. 기본 사이트에는 자산 0개의 `status: unavailable` 매니페스트만 커밋한다. 가짜 이미지나 오디오 파일은 없다.

## 2. 실행 환경과 실제 결과

Linux x64, Node **24.22.2**, Python **3.12.14**, PyMuPDF **1.26.6** / MuPDF **1.26.11**, Pillow **13.0.0** / libwebp **1.6.0**, FFmpeg·ffprobe **7.1.5-0+deb13u1**을 사용했다. Node 배포물 SHA-256은 공식 `SHASUMS256.txt`와 대조했고, `npm ci --no-audit --no-fund`는 exit 0·177 packages로 완료했다. package-lock 바이트는 바꾸지 않았다.

아래 명령의 `node`는 정본 런타임을 PATH 앞에 둔 것이다.

```sh
export PATH="$PWD/build/toolchain/node-v24.22.2-linux-x64/bin:$PATH:/Applications/Docker.app/Contents/Resources/bin"
```

| 실행 명령 | 실제 결과 | exit |
| --- | --- | ---: |
| `node --test --test-reporter=tap tests/conference-media-build.test.mjs` | 18/18 pass, fail 0, skip 0; TAP duration 26,269.32ms | 0 |
| `node --test --test-reporter=tap tests/conference-media.test.mjs tests/conference-player.test.mjs tests/conference-route.test.mjs` | 56/56 pass, fail 0, skip 0; TAP duration 1,719.82ms | 0 |
| `npm test` | 3,521 tests / 3,521 pass / 0 fail / 0 skip; complete:true, 1배치; 명령 경과 207,405.10ms | 0 |
| `npm run typecheck` | TypeScript 오류 0 | 0 |
| `npm run verify:static` | files 968, checkedScripts 219, checkedReferences 972 | 0 |
| `node scripts/build-site-styles.mjs --check` | 원본 CSS 41개, 번들 2개 일치 | 0 |
| `node scripts/build-site-preloads.mjs --check` | 모듈 URL 55개 / conference hint 54개 + shared hint 1개 / 정적 import edge 81개 | 0 |
| `node scripts/verify-conference-timeline.mjs --timeline dist/conference/timeline.json --sources docs/conference/source-segments.json --out build/p1c-a/timeline-verification.json` | 9,168/9,168 보존, 누락·추가·중복·변경 각 0; 프로그램 15, 덱 2, duration 20,400초 | 0 |
| `npm run verify:pages` | 기존 `Pages artifact file coverage changed` 실패. market-lab의 커밋된 JS/CSS 해시 파일명과 재빌드 결과 불일치 | **1** |
| `git diff --check` 및 커밋 대상 공백 검사 | 공백 오류 0 | 0 |

전체 테스트의 정본 마지막 줄:

```text
ATLAS_TEST_TOTAL {"complete":true,"tests":3521,"pass":3521,"fail":0,"skipped":0,"batches":1}
```

Linux 정본 런타임이므로 frozen 테스트를 별도 Docker 배치로 분리하지 않았다. macOS의 테스트 수·skip 수와 합산하지 않는다. `verify:pages`는 기존 실패를 유지하며 산출물 재생성으로 덮지 않았다. 실제 오류는 기존 `index-ByyNTPeH.js`, `index-GpQviUwB.css`와 재빌드 `index-C6TQnx3Q.js`, `index-DU37oAAf.css`의 불일치다.

## 3. 실제 도구로 실행한 임시 합성 파일 검증

테스트가 OS 임시 폴더에서 작은 PDF 2개와 MP3 2개를 만든다. PyMuPDF/Pillow/FFmpeg로 **WebP 3장·AAC 세션 3개·매니페스트 1개, 총 7파일·3초** 패키지를 생성하고 테스트 뒤 정리한다.

- 같은 입력을 두 새 디렉터리로 생성했을 때 이미지·오디오·매니페스트의 바이트가 모두 같았다. `--check` 내부 실행 경로는 출력 파일을 다시 쓰지 않고 통과했다.
- 원본 경계를 가로지르는 세션을 다시 디코드해 **440Hz → 880Hz** 순서가 유지됨을 확인했다. 길이 메타데이터만 검사한 결과가 아니다.
- 표지가 붙은 MP3도 입력으로 허용하며, 결과 AAC에는 오디오 스트림 하나만 남고 표지·원본 artist 메타데이터는 제거된다.
- 해시·바이트는 맞지만 **실제 PDF 2쪽 / 선언 3쪽**이면 거부한다.
- MP3 컨테이너 길이가 1.032초여도 실제 디코드가 **48,000샘플**이면 1.01초의 필요 구간을 채우지 못하므로 거부한다. 무음 padding으로 통과시키지 않는다.
- 실제 임시 retained 파일 19,994개와 출력 7개를 합친 **20,001파일**을 거부한다. 스키마 테스트는 정확히 20,000파일 및 정확히 25MiB 허용, 한 파일/한 바이트 초과 거부도 확인한다.
- 누락·추가·수정한 출력, 원본 순서·해시 변경, 잘못된 page/session 파일명, MP3를 m4a로 위장한 파일, 도구 지문·사이트 합계 불일치를 거부한다.
- JSON으로 표현 가능한 잘못된 숫자 객체도 예외 유출 없이 구조화된 검증 실패를 반환한다.

플레이어 테스트는 늦은 manifest 응답이 기존 ready를 막지 않는 점, unavailable/404/오류/다른 timeline의 폴백, 원본 timeline 불변, 시각·덱·속도 보존, 세션 13의 18,000초 경계에서 파일 유지, 다음 세션의 정확한 시작 시각, 파괴·재로드 뒤 늦은 응답 무시를 확인했다.

## 4. 보존한 계약

기준 `f35d794`의 파일과 바이트를 대조했다. **브라우저·네이티브 하네스 19개, CSS 44개를 포함한 73개 파일**이 같았다. timeline·source inventory·deck lock·route·app·site-entry·스타일/부트/standalone 생성기도 보존했다.

`dist/index.html`의 변경은 자동 생성된 graph/source SHA-256 주석 한 줄뿐이다. preload 그래프에서는 기존 player의 바이트 수·SHA와 합계 바이트 수만 갱신했다. **55개 모듈 URL, 힌트 순서, 정적 import edge 81개와 timeline 선요청 설정은 같다.** 새 `media.js`는 ready manifest 뒤의 동적 import이며 HTML preload에 추가하지 않았다. 기본 unavailable JSON은 **167바이트**다.

전체 npm 테스트의 standalone 패키징은 **41개 style 블록·HTTP preload 0개**, runtime parser/linker를 통과했다. 해당 임시 standalone은 53,695,325바이트였다. 이 크기는 실제 미디어 패키지의 크기가 아니다.

72px 이동, 0.01px 허용치, H1 정확히 1개, 초기 로드 2,500ms·페이지 전환 150ms 임계값은 변경하지 않았다. 이 브라우저 수치를 새로 측정하거나 통과로 판정한 것은 아니다. 사용자가 확인한 이전 A-9 결과는 [기존 macOS 영수증](A9_MACOS_VERIFICATION_20261112.md)에 그대로 남아 있다.

## 5. 실제 패키지 계획과 남은 인수 실행

현재 timeline·lock으로 계획을 계산하면 **547장 + 오디오 15개 = 미디어 562개, 매니페스트 포함 563파일**이다. 현재 `dist`에서 정확한 교체 대상을 제외한 retained 파일은 **967개**, 이 계획을 설치한 사이트 합집합은 **1,530파일**이다. 실제 미디어를 생성하지 않았으므로 실제 자산 합계 바이트·최대 파일 바이트는 **미측정**이다.

남은 인수 실행은 **사용자 Mac의 잠긴 원본으로 생성 → 같은 도구체인에서 `--check` → 로컬 설치 후 실제 미디어 재생/전환 확인**이다. 계약 문서에 Homebrew `ffmpeg@7`, 고정 Python 패키지, 네 원본의 정확한 경로와 명령을 적었다. 새 패키지의 실제 바이트·해시와 macOS 브라우저 결과는 그 실행 후 기록한다.

이번 회차는 실제 장표 시각 검수·사람 청취 10지점·A-10 1시간 메모리·Range/206 수용을 측정하지 않았으며, 매니페스트의 사람 검수 상태는 `pending`이다. 실제 PDF·MP3·WebP·M4A를 커밋하지 않고 로컬 출력은 ignore한다. main 병합·직접 push, 배포, force push, 유료 용량 생성, 계정·권한 변경은 수행하지 않는다.
