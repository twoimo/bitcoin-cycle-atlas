# Q-P3DASH-2 — Mac P1 게이트, 제품 042b04a

2026-11-13 KST. Chrome 157.0.8103.79. 제품 `042b04a4de56ece2bf5a6bd898b750ec5170e9f0`, 트리 `869e8da4088aab544fed54262778287093fe4dfa`. 이 트리는 로컬 후보 `a4f127f2552db288bba1483510cc57ce9be13784`와 같다고 문서화된 트리와 같다. 측정 시점 문서 HEAD는 `88791bacdfb420fc18e6387f46aa2c3a0e42fe3e`였다.

명령:

```sh
node scripts/verify-ui-renewal-p1-browser.mjs --browser "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --out build/qa-q-p3dash-1-mac-042b04a
```

출력 폴더는 실행 전에 만들지 않았다. 검사기는 수정하지 않았다.

| 항목 | 필수 | 시도 | 통과 |
|---|---:|---:|---:|
| 레이아웃 | 28 | 28 | 25 |
| 내비 | 56 | 56 | 56 |
| 차트 복귀 | 8 | 8 | 8 |

`sourceStable:true`, `complete:true`, `qualifiesP1Verification:false`, exit 1.

P3 5페이지 × 320·390·768·1440의 문서 가로 오버플로는 **20/20이 0**이다. 시장 자식 오버플로도 4폭 모두 0이다. 오버플로가 0이 아닌 레이아웃은 없다.

실패 3건은 `relay-320`, `relay-390`, `relay-768`이다. 원인은 `h1 native text paint is unverified`다. 320에서 제목 `릴레이 콘텐츠` 상자는 left 12, top 18, right 104.14, bottom 42다. `#relay-view > section:nth-child(2) > div:nth-child(2) > ol > li:nth-child(59)` 배경이 top -110.94, bottom 111.06으로 제목 글자 6개와 교차한다. 같은 항목의 문단 글자는 top 25.06, bottom 43.06이다. 기존 검사기는 그 overflow clip rectangle을 unsupported로 남겨 통과시키지 않는다. `relay-1440`은 통과했다.

리서치 표는 후보에서만 계산했다. 320에서 본문 15px, `th` 11px, `td` 13px, 셀 패딩 4px, 첫 행 64px, 6행. 1440에서 본문 17px, `th` 11px, `td` 13px, 첫 행 48px, 9행. `fbb46aa` 계산 비교는 페이지가 준비되지 않아 쓰지 않는다. 이 수치만으로 표 밀도 유지를 닫지 않는다.

P3는 닫지 않는다. 스크린샷 36장은 `build/qa-q-p3dash-1-mac-042b04a/`에 있고 git에는 올리지 않았다. 수치 원본은 같은 폴더의 `report.json`이다.
