# Q-P2CHROME-1-6fd74fe — ETH 36건 수정 후보

2026-11-13 KST. **제품 수정 후보이며 Mac 재검증 대기다. ETH 53/53을 확인하지 않았고 P2를 닫지 않는다.**

- 시작 시 원격 재조회: `6fd74feb5cfad5c4234308431187400c406a5fa0`.
- 내비 소유 수정: `1335bae2c86e7126cca2ad1d368bb4936711d7db`.
- 표면·전환·밀도 수정 및 최종 측정 후보: `b230fa87291176cf81a687cab1158c5800405597`.
- 브랜치: `fix/tradingview-responsive-20261110`. 배포하지 않았다.

## 1. 네 실패 원인과 제품 수정

기준 Mac 영수증은 [qa-p2-chrome-mac-4b66980](../qa-p2-chrome-mac-4b66980/README.md)다. 제품 `0cf36d8`의 ETH 53시도·17통과·36실패를 보존한다.

| Mac 첫 실패 | 건수 | 이번 수정 |
|---|---:|---|
| dataCase `page` / `undefined` | 10 | 값은 `body.dataset.page`가 아니라 내비의 `activeData`였다. 헤더에서 실제 내비를 소유하는 노드로 원래 `.content-rail` 자체를 재사용했다. 한 개의 원래 `.atlas-nav`, 현재 페이지와 실제 가격 차트 버튼이 같은 소유자에 남고 클릭 왕복 후 원복된다. 숨긴 복제 표본을 만들지 않았다. |
| `dark()` 불투명 배경 | 22 | 금융 캔버스·분석 대화상자·갱신 알림·legacy 비교 문서에 실제 국소 dark 색상 체계를 적용했다. 이어서 검사되는 근거/예측 기록/검색/지표/내보내기/하단 메뉴도 같은 표면 규칙을 갖는다. 툴바와 설정은 보이는 어두운 프레임, 실제 컨트롤·읽기 섹션은 사용자가 선택한 테마의 표면을 사용한다. C2의 라이트 기본값·다크 선택과 기존 역할 토큰을 유지했다. |
| 중앙 data 진입에서 제목/툴바 이동 | 3 | `data-center-tool`이 생길 때 카드 1px 테두리와 헤더 normal flow가 해제되던 조건을 제거했다. 같은 outlook 소유자에서 진입·복귀까지 동일한 배치를 사용한다. compare/dashboard 레이아웃은 제외한다. |
| 리서치 목록 밀도 | 1 | 직접 진입한 리서치 카드의 중복 세로 여백을 8px로 맞추고 필터의 중복 아래 margin을 제거했다. 기존 48/64px 행 높이, 44px 터치 하한, 글자와 자료는 유지한다. embedded 리서치는 제외한다. |

어두운 툴바 위 더 보기 버튼은 기존의 더 강한 transparent 규칙에 가려지지 않도록 실제 disclosure 선택자에 테마 표면을 적용했다. 기존 hover/expanded 상태 규칙은 유지한다. CSS 캐시 URL도 실제 생성 바이트의 SHA-256으로 갱신했다. 새 엔진·패키지·서비스를 추가하지 않았다.

리서치 여백의 소스 합계는 높이 900px, 정상 상태 고지와 한 행 필터라는 가정에서 desktop 약 519→551px, phone 약 547→555px다. 이는 브라우저 `tableHeight`/`rowsInView` 측정이 아니다. 원본 Mac 요약에 그 좌표가 없어 실제 실패 폭도 단정하지 않는다.

## 2. 이번 후보의 같은 게이트

깨끗한 `b230fa8`에서 원래 보조 실행기를 변경 없이 실행했다.

| 같은 게이트 | 필수 | 실제 시도 | 통과 | 미시도 | 판정 |
|---|---:|---:|---:|---:|---|
| ETH 53-case | 53 | 0 | 0 | 53 | 시작 차단·미검증 |
| 반응형 4심볼 합계 | 44 | 0 | 0 | 44 | 시작 차단·미검증 |
| 축 계약 | 16 | 0 | 0 | 16 | 시작 차단·미검증 |
| A-9 fast4g/gzip | 6 | 0 | 0 | 6 | 시작 차단·미검증 |

7개 실행 모두 종료 코드 **1**이다. Chromium은 `process_singleton_posix.cc:297`의 `socket() failed: Operation not permitted (1)`로 종료했고, ETH/반응형은 DevToolsActivePort 타임아웃, 축은 SIGABRT, A-9은 Chrome CDP 타임아웃을 기록했다. **0시도는 통과가 아니다.** 제품 케이스 실패 수가 0인 것도 제품 검증 성공을 뜻하지 않는다.

실행 전후 커밋/브랜치/깨끗한 작업 트리를 확인하고, 커밋 blob과 대조한 제품 입력 **1,454파일**의 SHA-256이 동일했다. 외부 소스 대조는 **`sourceStable:true`**, 실행 완결/자격은 **`complete:false` · `qualifies:false`**다. 스크린샷 0장, 오버플로·축 오차·네이티브 접근성·A-9 시간은 미측정/null이다. HTTP 루트 200은 서빙 근거이며 화면 통과가 아니다.

원본 보고서와 실행 로그는 `native-linux/`에 압축 전 바이트 그대로 gzip 보존했다. [artifact-manifest.json](artifact-manifest.json)에 압축 전후 길이와 SHA-256이 있다. 상위 러너의 `failures` 배열은 오케스트레이터 오류이며 개별 브라우저 게이트의 오류나 통과를 대신하지 않는다. [요약 수치](summary.json).

이전 Mac `0cf36d8`의 반응형 **44/44**, 축 **16/16·qualifiesPriceAxisVerification:true**, A-9 **6/6·2,171.3–2,207.7ms**는 그 후보의 영수증으로 보존한다. 이번 수정 후보의 수치로 옮겨 적지 않는다. 기준 worktree와 짝 비교가 없으므로 A-9 시간 영향 **0ms**는 주장하지 않는다.

## 3. 브라우저 외 검증과 보존

| 검사 | 결과 |
|---|---|
| 집중 단위·계약 검사 | **335/335**, 실패 0, skip 0 — [로그](checks/focused-final.log.gz), [실행 목록](checks/focused-command.json) |
| TypeScript | 통과 — [로그](checks/typecheck.log.gz) |
| Pages build / verify | **104파일·9경로** — [build](checks/pages-build-final.log.gz), [verify](checks/pages-check-final.log.gz) |
| 정적 파일·참조 검사 | **1,159파일·221스크립트·847참조** — [로그](checks/static-final.log.gz) |
| 원래 P0 소스 감사 | root 대비 **40/40**, literal/global override 위반 **0/0** — [원본 계산](css-source-audit.json.gz) |
| 보호·하네스·기존 렌더러 | **232/232 기준과 동일** — [SHA-256 대조](source-preservation.json.gz) |

335개는 전체 `npm test` 수치나 네이티브 통과 수치가 아니다. 원래 내비 노드/활성 페이지/실제 버튼 핸들러의 왕복, 반복 sync에서 불필요한 분리 0회, 중앙 진입·복귀의 같은 배치, 단일 h1 및 기존 연구 포커스/폭 계약을 포함한다. P1의 과거 빈 rail 숨김 단위 단언은 실제 단일 소유자와 원복을 검사하도록 바꾸고, CSS 순서는 승인된 P1→P2의 정확한 순서를 확인했다. 브라우저 검증기는 변경하지 않았다.

소스 색 계산의 최소 대비는 라이트 컨트롤 카드 **4.8253**, 다크 컨트롤/분석 표면 **5.3127**, 다크 축 잉크 **8.8329**, 기존 0.78 거래량 합성 **4.8559**다. 실제 화면 대비·포커스·클립 관측은 아니다. CSS 감사는 편집 중 파일을 계산한 원본이며, 기록한 두 CSS SHA-256이 최종 제품 커밋과 같은지 별도로 대조했다.

보호 4파일과 `dist/price-axis.js`, 모든 `scripts/` 파일이 기준 `6fd74fe`와 같다. `dark()`와 alpha 조건, 53-case 전체, 타임아웃, 44px·2px·4.5/3.0·축 ±2px·minRight 64·2,500ms·h1 1개를 완화하지 않았다. 기존 차트/예측/사건/리플레이/compare 엔진과 P1·P2a-0 닫힘을 유지한다. P2b·P3·배포는 시작하지 않았다.

루트 CSS 요청 4개를 유지했고 gzip-9 합계는 기준 대비 **+1,038B**다. 재생성된 React JS는 이름만 달라졌으며 바이트는 기준과 같다. [산출물·캐시 해시](generated-assets.json). 전송 바이트를 초기 로드 시간으로 환산하지 않는다.

## 4. Mac 재검증

새 영수증을 원래 게이트로 수집한다. Node 24 이상, 원래 ETH 검사기가 요구하는 `fc-list :lang=ko`와 Chrome 실행 파일이 필요하다. 지정 브랜치의 깨끗한 HEAD를 사용하며, 이 증거 문서 이후 제품 입력이 바뀌지 않았는지 확인한다.

```sh
git branch --show-current
git status --porcelain
git diff --stat b230fa87291176cf81a687cab1158c5800405597 HEAD -- dist apps packages scripts package.json package-lock.json

ATLAS_BROWSER_PATH="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
node docs/evidence/ui-renewal-p2/run-gates.mjs \
  . "$(git rev-parse HEAD)" build/qa-q-p2chrome-1-mac-b230fa8
```

기존 보조 실행기까지 수정하지 않았다. ETH 전체 53, 반응형 4심볼×11, 축 16 및 정렬 8쌍, A-9 fast4g/gzip 6을 그대로 호출한다. 새 출력 경로를 사용하고 필터·scope·레인으로 사례를 줄이지 않는다. 같은 ETH **53/53**을 확인하기 전 Q-P2CHROME-1과 P2는 열림으로 둔다.
