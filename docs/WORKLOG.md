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

## 2026-11-08 · WP5·WP2·WP1 main 병합
- 병합 커밋: `2c36d7f`(WP5) → `33997e5`(WP2) → `0d27550`(WP1), 이후 평가 스크립트를 WP5 모듈로 통일
- 검증: `node --test tests/forecast-sufficiency.test.mjs tests/forecast-calibration.test.mjs` 13개 통과, 두 스크립트 재실행 시 산출 JSON 바이트 동일
- 남음: 화면 표기(WP4), 셸 일관성(WP7), 삼플레 UI(WP6)

## 2026-11-08 · 배포 상태
- `be941d0` push 후 models 빌드가 `failure`로 끝나 운영 배포가 `456af53`에 머묾(publication.json sourceCommit 확인).
- 로컬 재현 결과: `verify:static`·`verify:research`·`verify:cycle`·`verify:performance`·`verify:domain`·`verify:skullet` 모두 통과, `verify:formal`은 이 Mac에 **Java 런타임이 없어** 실행 불가(코드 문제 아님), `verify:forecast`는 clean main에서도 실패(기존 이슈, `docs/VERIFY_FORECAST_ISSUE.md`).
- 조치: 빌드 재시도 커밋을 올려 재현 여부를 확인 중.
