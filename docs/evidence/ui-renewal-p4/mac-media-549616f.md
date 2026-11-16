# P4 Mac 실미디어 — 20/20

측정 시각: 2026-11-13 12:00:19–12:01:29 KST. 문서·실행 HEAD `549616f84552f3c3e25bdc4d6bffb82b56f57d80`. 제품 경로는 이 커밋의 조상 `12f0703`과 격리 사본의 유지 경로가 같다. Chrome 157.0.8103.79. 작업 트리 변경 0.

## 파일 수 갱신

명령: `node scripts/refresh-conference-media-site.mjs --site-dist dist --dist build/r19-p4-media-site-fcb941d --out build/r19-p4-media-site-count/refresh-receipt.json`

| 항목 | 값 |
|---|---|
| mode | refreshed |
| 이전 siteFileCount | 1530 |
| existingSiteFileCount | 1158 |
| siteFileCount | 1721 |
| observedSiteFileCount | 1721 |
| verifiedAssetCount | 562 |
| preflight | passed |
| mediaBytesChanged | 0 |
| 동등 검사 | 유지. 1530으로 낮추지 않음 |
| 정본 매니페스트 | `ff3e3f2b…` 167바이트, 불변 |

## 실미디어 브라우저

명령: `ATLAS_BROWSER_PATH="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" node scripts/verify-conference-media-browser.mjs --dist build/r19-p4-media-site-fcb941d --out build/r19-p4-media-browser-549616f`

| 항목 | 값 |
|---|---|
| 케이스 | 20 |
| 통과 | 20 |
| 실패 | 0 |
| skip | 0 |
| 종료 | 0 |
| browserLaunched | true |
| syntheticFixture | false |
| viewport | 1440×900 |
| HTTP | passed, 이미지 547장 모두 200, 세션 15, Range 45 |
| sourceIntegrity | unchangedDuringRun true |
| 보고서 | `build/r19-p4-media-browser-549616f/report.json` 5216352B, sha256 `2872de882849c843ba357b98ab9bcf35d98fe9abf8ca5e60f6af893b7704b1be` |

20개 id는 slides-final-290, slides-r17-clean-257, session-seek-and-play, boundary-00-01부터 boundary-13-14, source-join-session-13-18000, missing-fallback, unavailable-fallback이다.

이번 실행으로 닫는 것은 실미디어 20/20과 파일 수 불일치다. 320·390·768 시각 재측정, A-9, 키보드·대비·reduced-motion 재측정은 하지 않았다. D-1~D-8은 P5로 남아 있다. 사람 청취 0/10과 A-10 1시간 재생 메모리는 그대로다.
