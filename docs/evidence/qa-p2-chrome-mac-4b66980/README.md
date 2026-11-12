# P2 차트 크롬 Mac 게이트 — 4b66980

2026-11-13 02:58:03–03:16:29 KST. Chrome 157.0.8103.79. 브랜치 `fix/tradingview-responsive-20261110`. 문서 HEAD `4b66980bd4b7c4bb781440af2bd502087a0ed5e0`. 제품 후보는 `0cf36d8`이며 그 사이 `dist`·`apps`·`packages`·`scripts`·`package.json`·`package-lock.json` 차이는 없다.

실행은 `docs/evidence/ui-renewal-p2/run-gates.mjs` 원래 순서다. 케이스 필터나 레인 분할은 없다. 로컬 출력은 `build/qa-p2-chrome-mac-4b66980`(gitignore). 이 폴더는 수치 영수증만 담는다.

| 게이트 | 필수 | 시도 | 통과 | 실패 | 자격 |
|---|---:|---:|---:|---:|---|
| ETH 53-case | 53 | 53 | 17 | 36 | false |
| 반응형 BTCUSD | 11 | 11 | 11 | 0 | true |
| 반응형 ETHUSD | 11 | 11 | 11 | 0 | true |
| 반응형 MSTR | 11 | 11 | 11 | 0 | true |
| 반응형 BMNR | 11 | 11 | 11 | 0 | true |
| 축 계약 | 16 | 16 | 16 | 0 | true, `qualifiesPriceAxisVerification` true |
| A-9 fast4g/gzip | 6 | 6 | 6 | 0 | true, painted 2,171.3–2,207.7ms |

`sourceStable:true`, runner `complete:true`, `qualifies:false`. 반응형 합계는 44/44다. A-9는 2,500ms 이하지만 기준 워크트리와 짝 비교가 없어 0ms 영향을 주장하지 않는다. P2는 닫지 않는다.

실패 36건은 검사기를 바꾸지 않은 원래 오류다. data 페이지 식별 10건은 기대값 `page`에 실제 `undefined`다. `dark()` 22건은 채널 90 미만의 불투명 배경을 요구하는데 ETH·BMNR·MSTR 플롯이 `rgb(255, 255, 255)`, refresh-failed가 `rgb(242, 244, 246)`이다. 제목 이동 3건, 리서치 밀도 1건이 남는다. 44px·2px·4.5/3.0·축 ±2px·2,500ms·h1 1개는 완화하지 않았다.
