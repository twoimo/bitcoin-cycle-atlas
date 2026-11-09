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

## 2026-11-08 · 배포 실패 원인 수정
- 빌드 로그에서 `model-tests` FAIL 확인: `tests/eth-review-packet.test.mjs`가 "최상위 dist 브라우저 소스는 모두 ETH 리뷰 시드여야 한다"를 검사하는데, 새로 추가한 `dist/forecast-sufficiency.js`·`dist/forecast-calibration.js`가 목록에 없었음
- 수정: 두 모듈을 `dist/forecast/` 하위로 이동(브라우저 소스가 아니라 스크립트·테스트 전용 모듈임을 경로로 구분), 모든 import·문서 경로 갱신
- 검증: `node --test tests/eth-review-packet.test.mjs` 31개 통과, 자체 테스트 13개 통과, 두 스크립트 재실행 정상, `verify:static` ok(887 files)

## 2026-11-08 · WP3 자산군별 모델 사양
- 브랜치: `feat/per-asset-models-20261108`
- 검증: `node --test tests/forecast-models.test.mjs` 8개 통과, eth-review·verify:static 통과
- 결과 요지: 자산군별 모델 계열(점프·구조·레버리지·부트스트랩·월별 AR)과 추정/가정 구분을 코드로 고정. 레버리지 감쇄는 −½L(L−1)σ²t 유도식, BMNR은 등록돼 있지만 T3로 경로 생성 거부
- 남음: 실제 경로 생성기, 화면 배지(WP4)

## 2026-11-09 · 요구사항 문서화 (인증·비공개 / 릴레이 3열·RAG)
- 브랜치: `docs/requirements-auth-relay-rag-20261109`
- 산출물: `docs/requirements/REQ_AUTH_PRIVATE_20261109.md`, `docs/requirements/REQ_RELAY_RAG_20261109.md`, `docs/requirements/README.md`
- 내용: 초대·승인·강등·자기관리·Google 로그인, 블러 우회 대응 원칙(데이터 미전송), 보안 7종 도구 통과 기준, 3열 레이아웃 계약, RAG 파이프라인·OpenAI 키 취급·평가 메트릭 임계값·QA 시나리오
- 남음: 미결정 항목 확정, 구현 마일스톤 승인
