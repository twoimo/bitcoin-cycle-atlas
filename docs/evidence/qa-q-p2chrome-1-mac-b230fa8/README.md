# Q-P2CHROME-1 Mac 게이트 — f93d4ec

2026-11-13 03:58:35–04:27:26 KST. Chrome 157.0.8103.79. 브랜치 `fix/tradingview-responsive-20261110`. 문서 HEAD `f93d4ecf3de9477a1665a4541f2bbc3a2b8dc4fb`. 제품 후보는 `b230fa87291176cf81a687cab1158c5800405597`이며 그 사이 `dist`·`apps`·`packages`·`scripts`·`package.json`·`package-lock.json` 차이는 없다.

실행은 `docs/evidence/ui-renewal-p2/run-gates.mjs` 원래 순서다. 케이스 필터나 레인 분할은 없다. 로컬 출력은 `build/qa-q-p2chrome-1-mac-b230fa8`(gitignore). 이 폴더는 수치 영수증만 담는다.

| 게이트 | 필수 | 시도 | 통과 | 실패 | 자격 |
|---|---:|---:|---:|---:|---|
| ETH 53-case | 53 | 53 | 42 | 11 | false |
| 반응형 BTCUSD | 11 | 11 | 11 | 0 | true |
| 반응형 ETHUSD | 11 | 11 | 11 | 0 | true |
| 반응형 MSTR | 11 | 11 | 11 | 0 | true |
| 반응형 BMNR | 11 | 11 | 11 | 0 | true |
| 축 계약 | 16 | 16 | 16 | 0 | true, `qualifiesPriceAxisVerification` true |
| A-9 fast4g/gzip | 6 | 6 | 6 | 0 | true, painted 2,173.3–2,206ms |

`sourceStable:true`, runner `complete:true`, `qualifies:false`. 반응형 합계는 44/44다. A-9 여섯 값은 2,193·2,206·2,177.7·2,191.6·2,173.3·2,193.8ms다. 2,500ms 이하지만 기준 워크트리와 짝 비교가 없어 0ms 영향을 주장하지 않는다. P2는 닫지 않는다.

실패 11건은 검사기를 바꾸지 않은 원래 오류다. 이전 36건의 `page`/`undefined`, `dark()` 채널, 제목 이동, 리서치 밀도 서명은 이번 실패 문자열에 없다. 그 부재를 53/53으로 읽지 않는다.

| 묶음 | 건수 | 측정 |
|---|---:|---|
| 리드아웃 겹침 | 3 | eth·bmnr·mstr 320×900. eth는 `Source line overlaps the readout: eth`, bmnr·mstr은 `equity` |
| 데이터 영역 미채움 | 5 | 1620×1008, 1620×1100, 1920×1440, 900×430은 `rootBottom`이 `contentBottom`보다 24px 작다. 320×568은 12px 작다. `contentBottom`과 `barTop`은 같다 |
| 근거 포커스 클립 | 2 | workspace-evidence 320·1440. `#evidence-body` box는 left 73, right 226.5, top 338.5, bottom 392.265625. clip은 0,0,0,0 |
| 리더가 차트 값을 변경 | 1 | workspace-legacy 1440×900. `Opening the reader changed the plotted values of chart path 0` |

44px·2px·4.5/3.0·축 ±2px·2,500ms·h1 1개·채널 90은 완화하지 않았다. 보호 4파일과 `dist/price-axis.js`는 이 실행에서 바꾸지 않았다.
