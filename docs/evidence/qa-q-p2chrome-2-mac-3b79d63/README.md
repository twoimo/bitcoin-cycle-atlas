# Q-P2CHROME-2 Mac 게이트 — 3b79d63

2026-11-13 04:58:24–05:24:21 KST. Chrome 157.0.8103.79. 브랜치 `fix/tradingview-responsive-20261110`. HEAD `3b79d63745d77b27eb091de2dd30a1e6c35bcc48`. 포함 제품 커밋 `c6a70e9`. 로컬 출력 `build/qa-q-p2chrome-2-mac-3b79d63`(gitignore). 원본 summary sha256 `dbdc754f8d3a44f49c803876f13c7159dfb8b0ce89e88c018d19cbca65ca7b68`, 353,222B.

실행은 `docs/evidence/ui-renewal-p2/run-gates.mjs` 원래 순서다. 케이스 필터나 레인 분할은 없다.

| 게이트 | 필수 | 시도 | 통과 | 실패 | 자격 |
|---|---:|---:|---:|---:|---|
| ETH 53-case | 53 | 53 | 53 | 0 | true |
| 반응형 BTCUSD | 11 | 11 | 11 | 0 | true |
| 반응형 ETHUSD | 11 | 11 | 11 | 0 | true |
| 반응형 MSTR | 11 | 11 | 11 | 0 | true |
| 반응형 BMNR | 11 | 11 | 11 | 0 | true |
| 축 계약 | 16 | 16 | 16 | 0 | true, `qualifiesPriceAxisVerification` true |
| A-9 fast4g/gzip | 6 | 6 | 6 | 0 | true, painted 2,219–2,305.8ms |

`sourceStable:true`, runner `complete:true`, `qualifies:true`. 반응형 합계는 44/44다. A-9 여섯 값은 2,222·2,219·2,240.2·2,251.2·2,304.3·2,305.8ms다. 2,500ms 이하지만 기준 워크트리와 짝 비교가 없어 0ms 영향을 주장하지 않는다.

이전 11건은 이번 실패 목록에 없다. 실패는 0이다. 이전 36서명도 재현되지 않았다. 0시도를 이 수치로 바꾸지 않는다. `b230fa8..3b79d63` 이름 차이에 `dist/price-axis.js`와 `scripts/verify-*`는 없다. 44px·2px·4.5/3.0·축 ±2px·2,500ms·h1 1개·채널 90은 완화하지 않았다.

5축: 기능·시각·접근성·성능은 이 게이트의 53·44·16·A-9와 로컬 스크린샷으로 확인했다. D-1~D-8과 reduced-motion 전수 스캔은 하지 않았고 P5 수용으로 보류한다. 재개 조건은 P5 시작. compare·WP6·chart-qa는 이번 회차에 다시 돌리지 않았다. WP6 로컬 러너는 Linux 전용이다.

`npm test`는 3,898 pass·17 fail·5 skip·`complete:false`다. 같은 6개 파일을 `b230fa8`에서 다시 실행해도 같은 17실패가 난다. 이번 후보의 회귀로 세지 않고 병합 전 게이트로 보류한다. 재개 조건은 병합 전 게이트. 실패 묶음은 comparison-history 파일 실패 1, persistUrl 키 드리프트 1, ETH review seed 2개 1, ETH entry `import` 2, `initTheme is not defined` 11, standalone stylesheet 43≠42 1이다.
