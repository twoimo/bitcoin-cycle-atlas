# 작업 기록

협업 규칙: WP 하나 = 브랜치 하나 = 작성자 한 명. 상세는 `skills/user/aside-pro-collab` 스킬.

## 2026-11-08 · WP1 평가 하네스
- 브랜치: `feat/forecast-evaluation-20261108`
- 커밋: `07db07c`
- 검증: `node scripts/evaluate-forecasts.mjs` 재실행 → `dist/data/forecast-evaluation/summary.json` 재생성, 자산 15개 산출
- 결과 요지: 명목 80% 구간 실측이 전 자산에서 부족(BTC 180일 60.0%, 부동산 12개월 27.2%). 드리프트 벤치마크는 전 자산에서 flat보다 나쁨(skill 음수)
- 남음: 없음 (병합 대기)

## 2026-11-08 · WP5 데이터 충분성·단위
- 브랜치: `feat/data-limits-units-20261108`
- 커밋: `5d74416`
- 검증: `node --test tests/forecast-sufficiency.test.mjs` → 7개 통과
- 결과 요지: T1/T2/T3 등급과 지평 단위를 코드로 고정. BMNR(359관측·1.4년·89표본)은 T3로 경로 생성이 오류로 거부됨
- 남음: WP1 스크립트의 `tierOf`를 이 모듈로 교체(두 WP 병합 후), 화면 배지는 WP4

## 2026-11-08 · WP2 캘리브레이션 계층
- 브랜치: `feat/forecast-calibration-20261108` (WP5 브랜치 위에 분기 — 충분성 게이트를 먼저 씀)
- 커밋: `161d92f`
- 검증: `node --test tests/forecast-calibration.test.mjs` 6개 통과, `node scripts/estimate-calibration.mjs` 재실행 → `factors.json` 재생성
- 결과 요지: BTC 180일 커버리지 67.8→84.5, SPX 180일 65.1→82.7, NASDAQ 365일 53.9→84.2 통과. BTC 90일·ETH 365일은 과보정, KOSPI 90일은 무효. 부동산은 적합 표본 156~163 < 200으로 보정 차단
- 남음: 통과 조합만 경로·밴드에 연결, 화면 문구는 WP4
