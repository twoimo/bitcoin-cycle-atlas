# v1.34.0 검증·배포 증빙

이 폴더는 PR #67의 최종 검증과 실제 main의 릴리스·공개 배포를 추적하기 위한 기록이다. **PR 검증·병합·main CI·Release·Pages·공개 QA는 완료됐다.** 완료된 실행이나 이전 timeout을 다시 기다리지 않는다. 작업 전체의 설명은 [v1.34.0 인계 문서](../../../HANDOFF-V1.34.0-2026-11-07.md)에 있다.

## 소스와 문서 checkpoint

| 역할 | 식별자 |
| --- | --- |
| 최종 PR source | `7e9def739937d84a9031f0c26d66093f706dfc10` |
| PR CI 임시 merge | `f208ce90e5ec61ae0199fb68684c9c91e1cc4c55` |
| 실제 merge·release tag·공개 source | `71e1e86e49c9b14a4cbe0d1d0c0a83317965b02e` |
| 위 세 source의 공통 tree | `c5e85ffb7fec9fc480d5cb7c8ffcedd3e86b08d9` |
| 문서 보존 브랜치 / parent | `docs/handoff-v1.34.0-20261107` / 운영 source71e1 |

문서 checkpoint는 보존 브랜치 resolve와 최종 답변의 pin으로 확인한다. 문서 commit을 운영 배포 commit으로 소개하지 않는다. 실제 merge 부모는 완료된 v1.33 main `c1da5ea5f5109315f8dd65ea8229e47948ba4b2f`와 최종 PR source7e9다.

## 파일별 의미

| 기록 | 검증한 범위 |
| --- | --- |
| [ci-review.json](ci-review.json) | 최종 PR의 원본2,579개·React93·service DB28 통과, 임시 merge/tree·publication identity |
| [merge-review.json](merge-review.json), [protected-boundary.json](protected-boundary.json) | 실제 main 부모·tree와 최신 변경 보존, 데이터·모델·원장·vendor·원본 검증 디렉터리의 Git tree 일치 |
| [hallmark-integrity.json](hallmark-integrity.json), [hallmark-counts.json](hallmark-counts.json) | 최종 전체1,000개 소스 Git blob, 원본 receipt·report·이미지 해시와 정확한 경고 집계 |
| `hallmark-*-receipt.json`, `hallmark-static.json`, `hallmark-*-render.json` | 원본 Hallmark 보고서와 core/workspace 실행 receipt. 역사 baseline과 current를 분리해 읽는다. |
| [market-data-integrity.json](market-data-integrity.json), [market-workspaces-integrity.json](market-workspaces-integrity.json) | 원본 부분 scope data10/10·54PNG, workspace3/3·27PNG의 소스·case 순서·bytes/SHA |
| [native-artifact-verification.json](native-artifact-verification.json), [native-report.json.gz](native-report.json.gz) | 최종 원본 전체53/53, 소스113개와 PNG371개의 bytes/SHA·inventory. Gzip은 원본 report의 손실 없는 보존본이다. |
| [native-visual-review.json](native-visual-review.json) | 최종 BMNR320·MSTR1440·미국 시장1440을 직접 연 범위와 관찰. 우측 시장 분석·상단 US 선택 상태 확인 |
| [producer-zip-preservation.json](producer-zip-preservation.json) | 원본 model/browser/joined ZIP의 run·attempt·artifact identity 및 digest 연결 |
| [model-handoff.json](model-handoff.json), [eth-evidence-joined.json](eth-evidence-joined.json) | 원본 producer handoff와 joined receipt |
| [joined-artifact-verification.json](joined-artifact-verification.json) | **최종 strict 감사 PASS**. 모델397파일/33디렉터리, browser 원본 복사, source-book903항목(551 Git+352실행 증거)/602parts/108,331,043B |
| [candidate-corrections.json](candidate-corrections.json), [selector-dom.json](selector-dom.json) | 후보의 실제 메뉴·IPO·ticker 문제와 제품 수정 이력. 실패한 ae4를 최종53개 성공으로 대체하지 않는다. |
| [main-ci-review.json](main-ci-review.json), [main-ci-log-excerpts.txt](main-ci-log-excerpts.txt) | 실제 main CI의 성공·원본 테스트 수·publication799파일 검증. 로그 전체를 재작성하지 않고 해당 원문 줄을 보존했다. |
| [release-review.json](release-review.json), [release-api-evidence.json](release-api-evidence.json), `release/` | 실제 v1.34.0 게시·tag commit·자산 metadata·checksum 및 직접 받은3개 body |
| [pages-review.json](pages-review.json), [public-final.json](public-final.json) | 실제 Pages 성공·공개 source와 서로 다른29개 HTTP body 대조 |
| [public-ui-review.json](public-ui-review.json), `public-*.jpg` | 공개 데스크톱1363×936에서 수행한9개 관찰과 선택한4개 JPEG |

이 폴더의 `joined-artifact-verification.json`은 원본 ZIP 기반 **최종 PASS** 기록이다. 작업 중 `/tmp`에 있었던 동명의 이전 감사와 혼동하지 않는다. 모델 파일 수를 테스트 수로 세지 않는다. Source-book 검증은 framing·bytes·선언 범위의 완전성 확인이며 새 외부 모델 실행·수익성·연구 release 승인 또는 production model promotion을 뜻하지 않는다.

## 원본 native report의 손실 없는 압축

| 구분 | Bytes | SHA-256 |
| --- | ---: | --- |
| 보존한 `native-report.json.gz` | 455,187 | `d58c82b1a67d6d15687abc99dab3b583dbc5986044d835d5c1e75d8840416bab` |
| 압축을 푼 원본 report | 5,905,217 | `c3d57fc05a797d072ccbc5dc20e7378fc8b53303898840d9846f74b14867517b` |

문서 작성 시 실제로 압축을 풀어 원본 bytes/SHA 일치를 확인했다. 저장소 루트에서 파일을 변경하지 않고 다시 확인할 수 있다.

```python
from pathlib import Path
import gzip, hashlib

p = Path("docs/layout-redesign-2026-11-07/proof/native-report.json.gz")
packed = p.read_bytes()
raw = gzip.decompress(packed)
assert len(raw) == 5905217
assert hashlib.sha256(packed).hexdigest() == "d58c82b1a67d6d15687abc99dab3b583dbc5986044d835d5c1e75d8840416bab"
assert hashlib.sha256(raw).hexdigest() == "c3d57fc05a797d072ccbc5dc20e7378fc8b53303898840d9846f74b14867517b"
```

371개 PNG는 원본 artifact에서 각각 검증했다. 이 폴더에는 원본 report와 선별 이미지·감사를 보존하며 모든 PNG를 다시 실은 것은 아니다. 이미지 전체의 해시 확인을371장 전체 육안 검토라고 주장하지 않는다.

## 릴리스와 Pages의 서로 다른 범위

| 항목 | 완료 결과 |
| --- | --- |
| Main CI | [42365377496](https://github.com/twoimo/bitcoin-cycle-atlas/actions/runs/42365377496), job128382218050, success |
| Release | [42365377454](https://github.com/twoimo/bitcoin-cycle-atlas/actions/runs/42365377454), job128382217697, success |
| 실제 게시 | [v1.34.0](https://github.com/twoimo/bitcoin-cycle-atlas/releases/tag/v1.34.0), release437517011, 2026-11-07 19:58:41 KST / 10:58:41 UTC; draft/prerelease false |
| Pages | [42365377470](https://github.com/twoimo/bitcoin-cycle-atlas/actions/runs/42365377470), build128382217802·deploy128383520786, success |

Release는 **13개 자산 metadata**, checksum **12개 항목과 GitHub digest**를 대조했다. 직접 내려받아 bytes/SHA를 확인한 body는 아래 **3개**다. 나머지10개의 body를 모두 받거나 archive를 전부 풀었다는 증거가 아니다.

| 감사 JSON의 생성 당시 경로 | 이 폴더의 영구 보존 위치 |
| --- | --- |
| `release-assets/SHA256SUMS.txt` | [release/SHA256SUMS.txt](release/SHA256SUMS.txt) |
| `release-assets/RELEASE_METADATA.json` | [release/RELEASE_METADATA.json](release/RELEASE_METADATA.json) |
| `release-assets/PUBLICATION_MANIFEST.json` | [release/PUBLICATION_MANIFEST.json](release/PUBLICATION_MANIFEST.json) |

이 경로 매핑은 보존 위치를 설명하며 감사 JSON의 원문 경로는 수정하지 않았다. Release publication799개 inventory의 **metadata**를 원본 verifier로 확인했다. Pages의 실제 HTTP body 확인은 원본4개와 추가25개, **서로 다른29개**로 별도 기록했다.799개 전체를 HTTP로 받았다고 해석하지 않는다.

| Identity 종류 | 값 |
| --- | --- |
| 공통 contentDigest | `1910281eb8c65e9c01ec9f45d050bdb8f269c75292e68d348c68c263e877fce0` |
| Release canonical manifest identity | `a76212e8bc19bc46e1b2922756bee31544bb0d5f34d08e98870fca51e78d2b23` |
| Release manifest 파일 자체 SHA-256 | `c8c306b22e7a224123aa4f4bd6a3af88c1d514726c410d5c2e6b2feaa3b72198` |
| Pages canonical manifest identity | `079b9fadfaf172ca6c5738d527072417b9879674333b2165a9ed6fd638d6c103` |

Release와 Pages는 같은 source라도 빌드 시각·workflow metadata가 다르다. Canonical identity, 실제 파일 SHA, contentDigest를 서로 대체하지 않는다.

## 실제 공개 화면과 Hallmark 해석

공개 QA는 **2026-11-07 19:55:57–20:05:34 KST / 10:55:57–11:05:34 UTC**, Chrome **1363×936 데스크톱**에서 완료했다. 최초 시장, 진단 요약, 조건 실험, 현금흐름, RSI, 주택, HYPE 근거, 리서치 리더, IPO 메뉴의 **9개 관찰**이다. 원본 native가 제공하는 responsive 자동 검증과 별개이며 물리 모바일·소프트웨어 키보드 검증이 아니다.

활성 메뉴의 실제 computed 색 `#d8b56d` / `#2d2a21`은 **7.339:1** 대비다. Header44px·frameTop44px·documentWidth1363을 확인했다. 최초 child asset 조회의 빈 배열은 잘못된 DOM 범위 때문이며 version 증거로 쓰지 않았다. 배포 자산 identity는 별도의 성공한 `public-final.json` HTTP 검증을 근거로 한다.

| 공개 이미지 | 보여 주는 범위 |
| --- | --- |
| [public-diagnosis-v134.jpg](public-diagnosis-v134.jpg) | 시장 진단의 점수·관측·날짜·빈도 구분. 닫기 후 포커스는 UI 관찰 JSON에 기록 |
| [public-cashflow-v134.jpg](public-cashflow-v134.jpg) | 입력과 결과의 구획, 수정 입력에 따른 계산 결과 |
| [public-housing-v134.jpg](public-housing-v134.jpg) | 지역 관계 요약·산점도·시차 원장 상단. 출처 시점은 UI 관찰 JSON에 기록 |
| [public-research-v134.jpg](public-research-v134.jpg) | 문서 리더의 절 제목/본문 구획. 끝까지 스크롤·닫기 후 포커스 복귀는 UI 관찰 JSON에 기록 |

최종 Hallmark는 **static62 / core render10 / workspace render3 WARN, 모두 FAIL0·REFLEX0**다. 반복된 static62는 한 번만 센다. 원본 pin `7ec868225c6caa040558c321ee0fefa0e73f83a8`, core baseline `0c1ed40e1b9b6c76f5621d087737dc57f174b51e`, workspace baseline `3b6373906dbdd3ef321db31deaf8a8f785da61c3`를 유지했다. 이 baseline은 직전 v1.33 화면이 아니다. v1.33의60/10/3, v1.32.1의32/10/2, 과거38 WARN은 별도 실행 기록이다.

원본 경고·receipt는 유지했다. 인계 문서의 F25 분석이나 긴 표의 가로 스크롤 설명은 경고를 삭제하거나 판정 기준을 바꾼 증거가 아니다. 선별 PNG·공개 JPEG만으로 원래 검사하지 않은 상호작용·외부 발행처 탐색까지 확인했다고 주장하지 않는다.
