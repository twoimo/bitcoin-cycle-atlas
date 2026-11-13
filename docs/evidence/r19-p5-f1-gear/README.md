# Q-P5F1-1 — analysis settings gear SVG

2026-11-13. 기준 `a14022225e5897f14bee16b139f8bd194bd0732c`, 브랜치 `fix/tradingview-responsive-20261110`.

**제품 구현 완료, native 수용 대기.** Mac `7d45f88`의 [직전 영수증](../r19-p5-f1/mac-7d45f88.md)에서 남은 U+2699 다섯 개만 교체했다. 이번 authored 제품 변경은 `dist/analysis-dock.js` 하나다.

## 제품 변경과 보존

`makeAction('settings', …)`가 만든 동일한 button에 Phosphor Gear regular SVG만 넣는다. `cycles`, `duration`, `peaks`, `periods`, `cryptocon`의 title/aria-label은 각각 `4년 비교 설정`, `구간 길이 설정`, `고점권 도달 설정`, `월·분기 설정`, `CryptoCon 검증 설정`이다. `atlas:indicator-settings-open` 이벤트의 `detail.id`와 원래 button을 가리키는 `detail.opener`도 유지한다.

SVG는 `aria-hidden="true"`, `focusable="false"`이며 기존 14×14 아이콘 스타일을 따른다. 기존 SVG 규칙의 `fill:none`·`stroke:currentColor` 상속 때문에 모양이 달라지지 않도록 path에 `fill="currentColor" stroke="none"`을 지정했다. 버튼 크기와 포커스 CSS는 수정하지 않았다. 44px 타깃과 포커스 페인트의 새 native 실측을 주장하지 않는다.

원본: [Phosphor Gear regular](https://github.com/phosphor-icons/core/blob/2b75f3ad12b420c9504ef05df8d2564a28f8500e/assets/regular/gear.svg), blob `a7e5860f17b6303a7eccb8dfaa180d95834b0121`. 해당 SVG의 [MIT 고지](https://github.com/phosphor-icons/core/blob/2b75f3ad12b420c9504ef05df8d2564a28f8500e/LICENSE)를 같은 JS에 보존했다.

## 전후 개수

아래 표의 Mac 값은 직전 사용자가 제공하고 원격에 기록한 관측이다. 이번 값은 실제 root HTML·공유 셸·분석 창 생성 함수를 실행한 **DOM 모델**이다. 모델은 분석 창을 포함하지만 전체 앱 부팅과 브라우저 레이아웃은 실행하지 않는다. 숨긴 UI도 body 텍스트에 포함하며, 기존 검사기의 D-1 범위와 제외 목록을 그대로 사용했다. 320·1440은 모델 입력이며 native viewport 실측이 아니다.

| 화면 | 원래 기준 b2226d7 (Mac) | 직전 7d45f88 (Mac) | 이번 DOM 모델 | 이번 native |
|---|---:|---:|---:|---|
| conference-320 | 1 | 0 | 0 | 미측정 |
| conference-1440 | 1 | 0 | 0 | 미측정 |
| outlook-320 | 6 | 5 | 0 | 미측정 |
| outlook-1440 | 6 | 5 | 0 | 미측정 |
| relay-320 | 1 | 0 | 0 | 미측정 |
| relay-1440 | 1 | 0 | 0 | 미측정 |
| 합계 | 16 | 10 | 0 | null |

모델은 원래 기준 **16**, 직전 제품 **10**, 이번 제품 **0**을 재현했다. 다섯 설정 버튼의 SVG·접근성 이름·정확한 id/opener 이벤트 쌍은 **5/5**, U+2191 위 화살표도 다섯 개 그대로다. 기존 관련 검사 **43/43**, 실패 0·skip 0. 프리로드와 스타일 생성물 `--check`는 통과했고 생성물 변경은 필요하지 않았다. [DOM 결과](dom-model.json) · [수치·보호 해시](summary.json).

## 같은 native 명령

검사기·표본·D-1 범위·제외 목록은 byte-identical이다. 출력 폴더만 분리했다.

```bash
ATLAS_BROWSER_PATH="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
node scripts/verify-r19-p5-f1-browser.mjs \
  --baseline-ref b2226d77ddf4ff4fe6e05953e02cbb753ea4f7f8 \
  --out build/r19-p5-f1-gear-browser
```

이 작업 환경에서 `/usr/bin/chromium`으로 실행한 결과는 **0/6, complete false, status blocked, D-1 이전/이후 null, exit 1**이다. `ProcessSingleton socket() failed: Operation not permitted (1)`로 페이지 시작 전에 종료했다. PNG는 생성되지 않았다. [차단 원본](native-blocked.json). **여섯 화면 native 이후 0·실패 0을 아직 확인하지 못했으므로 Q-P5F1-1과 F1은 닫지 않는다.**

보호 4파일·가격 축·`dist/styles.css`·기존 검사기·다른 아이콘과 이벤트는 그대로다. F2 및 이전에 닫힌 미디어 파일 수·미디어 브라우저를 다시 작업하지 않았다.
