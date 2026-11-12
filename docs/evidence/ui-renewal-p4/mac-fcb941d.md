# R19 P4 Mac 게이트 — 미수용

측정 시각: 2026-11-13 07:26–07:32 KST. 제품 `fcb941dcf880491a8e0e1cb211381810bd320aa2`. 문서 기준 `521b2ab1f043e988f95ec8094420a39a902a59d0`. Chrome 157.0.8103.79. P4는 닫지 않는다.

## 컨퍼런스 브라우저

명령: `ATLAS_BROWSER_PATH="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" node scripts/verify-conference-browser.mjs --out build/r19-p4-browser-mac-fcb941d`

| 항목 | 값 |
|---|---|
| 필요 | 14 |
| 시도 | 14 |
| 통과 | 13 |
| 실패 | 1 |
| 종료 | 1 |
| sourceCommit | `521b2ab1f043e988f95ec8094420a39a902a59d0` |
| sourceIntegrity | 1166파일, 변경 0, unchangedDuringRun true |
| 보고서 | `build/r19-p4-browser-mac-fcb941d/report.json` 703,644B |

실패는 `fixture-1024x768` 하나다. 단언은 `Stage uses the full available width for this A-5 band`다.

| 상자 | 이번 후보 | 직전 Mac 14/14 `07ba36d` |
|---|---|---|
| stage | 545.765625×307, top 181 | 748×420.75 |
| visual | 958×351, top 137 | 748×465, top 48 |
| main | 976×564, top 136 | 764×676, top 48 |
| caption | 958×48 | 748×48 |
| controls | 958×163 | 748×163 |
| play | 56×56 | 56×56 |

가로 오버플로 0, DOM h1 1, painted h1 1. 16:9는 유지됐고 장표가 visual 폭을 쓰지 않았다. 차이 412.234375px. 실패 화면 `build/r19-p4-browser-mac-fcb941d/fixture-1024x768-failed.png`. 나머지 13건은 통과했다. 폭 1px, 16:9, 1120, 44px, 2px, h1 1개 기준은 완화하지 않았다.

## 실미디어

정본 `dist/conference/media-manifest.json`은 167B `ff3e3f2b…` unavailable이다. pages 547·audio 15는 그 경로에 이미 있어 덮어쓰지 않았다. 격리 사본 `build/r19-p4-media-site-fcb941d`에만 `build/p1c-media-20261112`의 ready 매니페스트 163,622B `3380d7d5…`와 같은 자산 562개를 설치했다.

명령: `node scripts/verify-conference-media-browser.mjs --dist build/r19-p4-media-site-fcb941d --browser "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --out build/r19-p4-media-mac-fcb941d`

preflight는 자산 562/562 해시 일치 뒤 `site_file_count`에서 실패했다. 관측 사이트 파일 1721, ready 매니페스트 `totals.siteFileCount` 1530. 브라우저 시작 0, 케이스 0, exit 1. 차이는 29f1646 이후 추가된 fonts·market-lab 등이며, 파일 수 계약을 완화하지 않았다. 20/20으로 세지 않는다.
