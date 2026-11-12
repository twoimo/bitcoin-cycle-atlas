# Q-P3DASH-2 — Mac P1 게이트, 제품 6e33d0f

2026-11-13 06:56:24–06:57:53 KST. Chrome 157.0.8103.79. 문서 HEAD `3f5cec32cf48aeaf946bbc19d4d40949b30cb922`. 제품 `6e33d0fb8a6b489a1c7571d3aba254f84a54bb5b`는 이 HEAD의 부모이며, 제품 경로는 문서 커밋이 바꾸지 않았다.

명령:

```sh
node scripts/verify-ui-renewal-p1-browser.mjs --browser "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --out build/qa-q-p3dash-2-mac-6e33d0f
```

출력 폴더는 실행 전에 만들지 않았다. 검사기는 수정하지 않았다.

| 항목 | 필수 | 시도 | 통과 |
|---|---:|---:|---:|
| 레이아웃 | 28 | 28 | 28 |
| 내비 | 56 | 56 | 56 |
| 차트 복귀 | 8 | 8 | 8 |

`sourceStable:true`, `workingTree` 0, `complete:true`, `qualifiesP1Verification:true`, `qualifiesFullVerification:false`, failures 0, exit 0. `qualifiesFullVerification` false는 P0 게이트가 이번 실행에 포함되지 않아서이며 P3 실패가 아니다. 가로 오버플로가 0이 아닌 레이아웃은 없다. 시장 자식 오버플로도 없다. h1 native text paint 28건 모두 passed다. 이전 relay-320·390·768의 unverified는 재현되지 않았다.

P3 대시보드 5페이지 × 4폭의 문서 가로 오버플로는 20/20이 0이다. 스크린샷 36장은 `build/qa-q-p3dash-2-mac-6e33d0f/`에 있고 git에는 올리지 않았다. 수치 원본 `report.json`은 14,680,558B, sha256 `4df91f3f51c2e293a0e9c48c0bd50ba096e9e005c5b978ac4b4763622b098149`다.

## 표 밀도

같은 Chrome으로 기준 `fbb46aa`의 `dist`와 현재 문서를 따로 서빙해 계산했다. 이전 회차의 기준 미기동은 이번 서빙에서는 재현되지 않았다.

| 표 | 폭 | 기준 | 현재 |
|---|---:|---|---|
| 리서치 | 320 | 본문 15px, th 11px, td 13px, 패딩 4/8/4/8, 행 64px, 보이는 행 7 | 본문 15px, th 11px, td 13px, 패딩 4/8/4/8, 행 64px, 보이는 행 6 |
| 리서치 | 1440 | 본문 17px, th 11px, td 13px, 패딩 4/12/4/12, 행 48px, 9행 | 동일 |
| 자산 | 320 | th 12px, td 11px, td 패딩 4/12/4/12, 행 53px, 20행 | 동일 |
| 자산 | 1440 | th 12px, td 11px, 행 40px, 20행 | 동일 |
| 공모주 | 320·1440 | th 12px, td 13px, 패딩 6/12/6/12, 행 33.8px, 17행 | 동일 |

셀 글자·패딩·행 높이는 유지됐다. 리서치 320의 보이는 행 7→6은 행 높이가 아니라 필터 크롬이 뷰포트 한 행을 차지한 결과다. 밀도 실패로 보지 않는다. A-9는 이번 회차에 재실행하지 않았고 시간 영향 0ms를 주장하지 않는다. D-1~D-8은 P5로 남긴다.

Q-P3DASH-2와 P3 대시보드 게이트는 이 수치로 닫는다. P2b·P4·P5·main push·배포는 하지 않았다.
