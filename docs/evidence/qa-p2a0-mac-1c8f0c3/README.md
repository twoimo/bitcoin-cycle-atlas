# Mac P2a-0 재검증 — `1c8f0c3`

상태: **P2a-0 통과 아님. 큐 맨 앞은 Q-P2A0-1.** 기존 엔진은 유지하고 P2 차트 크롬은 시작하지 않는다.

| 항목 | 값 |
|---|---|
| 측정 HEAD | `1c8f0c3a55b35d8fb08d8fa8aafbc514e8fbc16f` |
| 시각 | 2026-11-13 01:26–01:32 KST |
| Chrome | 157.0.8103.79 |
| 스파이크 출력 | `build/qa-p2a0-mac-1c8f0c3` |
| 기존 A-9 출력 | `build/qa-p2a0-a9-mac-1c8f0c3` |
| 작업 트리 | 스파이크 실행 시 변경 0. A-9 실행 중 이 증거 디렉터리만 untracked |

## 스파이크 게이트

`node scripts/verify-funnest-p2a0-browser.mjs --out build/qa-p2a0-mac-1c8f0c3 --browser "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"`

| 묶음 | 필수 | 시도 | 통과 | 실패 |
|---|---:|---:|---:|---:|
| startup | 6 | 6 | 6 | 0 |
| features | 7 | 7 | 7 | 0 |
| keyboard | 4 | 4 | 0 | 4 |
| touch | 4 | 4 | 4 | 0 |

`sourceStable:true`, `complete:true`, `qualifiesP2a0NativeVerification:false`, failures 28. startup 초기 페인트 1,080.1–1,125.6ms. 예산 2,500ms는 유지했다. 스크린샷 17장. 키보드 폭 스크린샷은 없다.

키보드 실패는 네 폭이 같은 종류다. `.fnc-btn-indicators`와 `.fnc-btn-tools`의 텍스트 대비는 4.440810712577725로 4.5 미만이다. Enter 뒤 `.fnc-search-dialog`는 45초 안에 나타나지 않았다. 대화상자 포커스 소유, Tab 가두기, Escape 복귀는 그 타임아웃 이후라 미측정이며 통과가 아니다. 이번 28건에는 포커스 대비 3.0 미달이 없다.

| 폭 | 44px 미만 | 대화상자 |
|---|---|---|
| 320 | symbol 128.75×36, indicators 32×32, tools 30×32, drawbar 32×32 | 타임아웃 |
| 390 | symbol 131.546875×36, indicators 32×32, tools 30×32, drawbar 32×32 | 타임아웃 |
| 768 | symbol 135.546875×36, indicators 32×36, tools 48×36, 추세선 36×36 | 타임아웃 |
| 1440 | symbol 135.546875×36, indicators 64.484375×36, tools 80.484375×36, 추세선 36×36 | 타임아웃 |

원본: [report.json.gz](report.json.gz). raw SHA-256 `b65f4314899fb036ddb370bccdfd60acc3ef1ca4cafa61426efc0a8235bc6871`, gzip SHA-256 `d24c6efeefbaa1b0f3f88f77cc63c57cbb8d42664f6f165c67e9f2e1c0125afe`.

## 기존 A-9

같은 HEAD에서 `verify-conference-data-browser.mjs --profile fast4g --encoding gzip`는 6/6, 실패 0이다. painted 2,170–2,208.2ms, 예산 2,500ms, overflow 0, h1 1. 기준 `6ffbdda` 별도 worktree는 이번 회차에 다시 돌리지 않았으므로 시간 차이를 0ms로 기록하지 않는다. 정착 화면은 장표 이미지와 오디오 파일이 없어 "장표 이미지 없음"·"오디오 없음"이었다. 이것을 미디어 준비 완료로 보지 않는다.

원본: [a9-report.json.gz](a9-report.json.gz). raw SHA-256 `d1e251601d82c786d6fc309bea9f7c45aba9e8190de7effe6876bde2beb2d38c`.
