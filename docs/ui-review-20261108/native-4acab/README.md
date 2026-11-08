# 최종 UI 브라우저 증거 — 4acab

기준선 **6/6**, 변경 후 **21/21**, 총 **27/27 통과**. Cloudflare 빌드는 2026-11-08T17:10:36.326Z에 success로 종료했습니다.

## 실행 출처

- 실행 소스: `03dcd1b1ac2acc6ae93b240eb6f47d6673d9b9a9`
- 앱 distTree: `a836349f38c7e65835c239dc9f7d74a362241452`
- 진단 시작 때 비교한 운영 main: `dbd3b70e567c3047524e6a0e3b5d01b1dc9d910d` — 앱 dist 동일
- 기준선: `1635f87a10962b7ff5eecd094b6e0625e09771f4`
- 빌드: `4acab602-49a5-470e-9935-20005e98e5a3`
- 실행 소스와 비교 main의 차이는 검증된 stdout PNG 필터 스크립트 추가 1개입니다. 이후 main 커밋은 이 실행의 출처로 표시하지 않았습니다.
- 이 폴더는 WP4/WP7 보충 브라우저 진단을 기록합니다. 운영 배포와 별도 canonical gate의 완료 여부는 포함하지 않습니다.

## 원본 결과와 측정

- [총괄 진단](ui-review/diagnostic.json)
- [변경 전 native 보고서](ui-review-before/report.json)
- [변경 후 native 보고서](ui-review-after/report.json)
- [전후 측정표](measurements.md) / [측정 JSON](measurements.json)
- [MSTR·BMNR 진입 네 조합](native-entries.json)
- [전체 증거 manifest](manifest.json)
- [실행 시작 증명](execution-start-proof.json) / [소스 비교](source-comparison.json)

## PNG 출처와 완결성

총 19개 파일을 확보했습니다. 최신 실행의 stdout에서 8개를 직접 복구했습니다. 전송량을 줄이도록 명시적으로 생략한 11개는 최신 native 보고서와 바이트 수·SHA-256이 정확히 같은 기존 보존 PNG로 복구했습니다. 각 파일의 `sourceExecution`과 `recoveredBytesFrom`은 manifest에 별도로 기록되어 있습니다.

원본 `IMAGES_COMPLETE`는 19개를, 필터 `COMPLETE`는 입력 19개·유지 8개·생략 11개를 확인합니다. 필터가 원본 19개 이미지의 바이트 수·SHA-256을 검증했고, 복구된 파일 역시 해당 최종 보고서와 일치합니다. 미확보 파일은 없습니다. `inventory.json`은 직접 전송된 8개의 원본 회수 기록이며, 기존 보존 파일까지 포함한 최종 목록은 `manifest.json`입니다.

| 뷰포트 | 변경 전 | 변경 후 |
|---|---|---|
| 390x844 | [PNG](ui-review-before/wp4-before-390x844-chart.png) | [PNG](ui-review-after/wp4-after-390x844-chart.png) |
| 320x740 | [PNG](ui-review-before/wp4-before-320x740-chart.png) | [PNG](ui-review-after/wp4-after-320x740-chart.png) |
| 768x1024 | [PNG](ui-review-before/wp4-before-768x1024-chart.png) | [PNG](ui-review-after/wp4-after-768x1024-chart.png) |
| 1024x768 | [PNG](ui-review-before/wp4-before-1024x768-chart.png) | [PNG](ui-review-after/wp4-after-1024x768-chart.png) |
| 1440x900 | [PNG](ui-review-before/wp4-before-1440x900-chart.png) | [PNG](ui-review-after/wp4-after-1440x900-chart.png) |
| 1920x1080 | [PNG](ui-review-before/wp4-before-1920x1080-chart.png) | [PNG](ui-review-after/wp4-after-1920x1080-chart.png) |

최신 리플레이 원본: [1440×900](ui-review-after/wp4-after-1440x900-replay.png), [1920×1080](ui-review-after/wp4-after-1920x1080-replay.png).

이 묶음에는 원본 native JSON·총괄 판정·PNG·출처 및 해시 검사를 포함했습니다. [독립 파일 재검사](independent-file-check.json)는 원본 JSON 3개와 PNG 19개의 바이트 수·SHA-256 일치를 확인합니다. Cloudflare API 응답과 로그, 복구 스크립트는 별도 작업 자료에 보존했습니다.
