# 현재 차트 봉 리플레이와 프로젝트 시작일

기본 봉 리플레이는 화면에 이미 그려진 **현재 미래 가정 경로를 그대로 고정**하고, 프로젝트 시작일인 **2026-10-21**부터 실제 완료 일봉을 한 개씩 공개한다. 현재 경로를 10월 21일에 발행한 예측으로 바꾸어 해석하지 않는다. 당시 보존한 경로와 실제 결과를 비교하려면 별도의 **프로젝트 시작 당시 보존본**을 선택한다.

## 시작일 근거와 서로 다른 날짜

| 의미 | 확인된 값 | 근거 |
|---|---|---|
| 저장소 생성 | 2026-10-21 23:40:21 KST | [GitHub 저장소 메타데이터](https://api.github.com/repos/twoimo/bitcoin-cycle-atlas)의 `created_at = 2026-10-21T14:40:21Z` |
| 최초 커밋 | 2026-10-21 23:40:22 KST | [초기 커밋 c93526b](https://github.com/twoimo/bitcoin-cycle-atlas/commit/c93526b55bac0ccf28b1720840477a2f7007237f) |
| 첫 앱·연구·예측 포함 커밋 | 2026-10-21 23:48:51 KST | [첫 앱 커밋 918ce95](https://github.com/twoimo/bitcoin-cycle-atlas/commit/918ce95bdcdb5b2611b8ab5a0314815c1e326a1d) |
| 처음 모델의 연구 기준일 | 2026-10-21, Asia/Seoul | [당시 검증 문서](https://github.com/twoimo/bitcoin-cycle-atlas/blob/918ce95bdcdb5b2611b8ab5a0314815c1e326a1d/docs/THREE_YEAR_VERIFICATION.md) |
| 처음 모델의 마지막 완료 관측 | 2026-10-20 UTC | 같은 문서와 첫 입력 자료의 `meta.lastDate` |
| 리플레이에서 처음 공개하는 일봉 | 2026-10-21 UTC | 초기 화면은 10월 20일까지 표시하고, 다음 봉에서 10월 21일 관측 공개 |

현재 저장소와 초기 산출물로 확인할 수 있는 시작일은 2026-10-21이다. 저장소 생성 전에 개인적으로 작업을 시작한 시각은 이 기록이 입증하지 않는다. 커밋 시각은 해당 자료가 그 커밋에 보존되어 있다는 근거이며, 실제 웹 게시 시각의 증명으로 쓰지 않는다. UTC 일봉의 날짜는 한국 달력일과 별개의 시장 관측 표기다.

## 기본: 현재 주황색 가정선 유지

현재 화면의 모델·시나리오·미래 경로를 복사하여 고정한다. 미래 경로의 원래 `asOf`와 모든 가격·범위 값, 2050년까지의 표시 범위를 유지한다. 리플레이 시작일에 맞추어 예측선을 과거로 옮기거나, 10월 20일과 현재 모델 시작일 사이에 가짜 예측을 채우지 않는다.

실제 봉은 보존된 Bitstamp BTC/USD OHLC다. 현재 미래 가정선은 원래 Coin Metrics 입력을 소비한 경로다. 내보내기에는 현재 경로의 기준일·고정 시각·입력 해시·출력 해시와 실제 봉의 공급자·자료 해시를 구분한다. 현재 경로가 아직 존재하지 않았던 과거 날짜의 예측 적중률이나 서로 다른 공급자의 가격 오차를 모델 성적으로 계산하지 않는다. 실제 봉이 없는 날짜는 만들지 않는다.

`createCurrentChartReplaySession`은 재생 기준 `asOf`와 `forecastOriginDate`를 별도로 보존한다. `chartDataset`과 `chartForecast`는 현재 화면에서 받은 복사본이며, 이후 라이브 자료 갱신이 재생 중인 경로를 바꾸지 않는다. `forecastScoringEnabled`는 `false`이고, 원래 미래선 시작일 전에는 선택 날짜의 예측값이 `null`이다.

## 비교용: 프로젝트 시작 당시 보존본

첫 앱 커밋의 [`docs/THREE_YEAR_RESULTS.json`](https://github.com/twoimo/bitcoin-cycle-atlas/blob/918ce95bdcdb5b2611b8ab5a0314815c1e326a1d/docs/THREE_YEAR_RESULTS.json)은 현재도 당시와 동일한 Git blob이다. 그 문서의 `base` 시나리오와 같은 커밋의 실제 입력 스냅숏을 추출한다. 최신 모델을 다시 실행해서 과거 발행으로 표시하지 않는다.

| 보존 항목 | 식별 정보 |
|---|---|
| 원래 모델 | `three-year-outlook-v1`, 기본 3년 조건부 경로 |
| 입력 범위 | 2010-07-18~2026-10-20, Coin Metrics 5,939개 UTC 일말 관측 |
| 원래 경로 | 2026-10-20~2029-10-21, 1,098개 점 |
| 최초 모델 결과 Git blob | `ceb7a5558ffea68eeca705ec85a70bbf86915f20` |
| 최초 모델 결과 SHA-256 | `d487ab7c27f4a36a54f5b92e7b43faecd9691740b2484d54372727a754473c98` |
| 최초 입력 Git blob | `d8774079d15f21857db1531bb47984eb5712a525` |
| 최초 입력 SHA-256 | `c76403669531763b20ab6f25179d2cd7394cdbca96819197e05f1cb51facd6ed` |
| 배포 추출본 SHA-256 | `571d0d3421d7ae40da4fb3020ab0290aa534822d5a439f9e98f55dc31d5f19ac` |
| 표시 경로의 정규화 출력 해시 | `0e0703b557cb586618b65449e5eea78516e11d81b882787ab06cfa39c71e5dc6` |

처음 입력의 정확한 UTF-8 바이트는 [`research-data/project-origin/bitcoin-first-input.json`](../research-data/project-origin/bitcoin-first-input.json)에, 배포용 추출은 [`dist/data/project-origin-btc-2026-10-21.json`](../dist/data/project-origin-btc-2026-10-21.json)에 보존한다. 당시 Coin Metrics 입력을 나중의 Bitstamp 봉으로 대체하지 않는다. 원본이 종가만 제공하므로 보존본 성적 비교에서 OHLC를 만들어 내지 않는다.

이 모형의 민감도 범위는 보정된 확률 구간이 아니다. 이후의 현재 모형과도 다르다. 당시 기록의 원문 설명·한계와 이후 관측 날짜별 비교를 구분하며, 한 경로에서 여러 날짜의 오차를 독립 예측 실험 여러 건으로 세지 않는다.

## 재현과 검증 범위

아래 명령은 초기 원본의 SHA-256·Git blob, 배포 추출본의 재현 일치, 실제 엔진의 날짜 절단·불변 경로·현재 화면과의 원본 경로 일치·실제 OHLC·잘못된 해시와 중단·오프라인 오류 동작을 검사한다.

```bash
node scripts/build-project-replay-baseline.mjs --check
node --test tests/project-replay-baseline.test.mjs tests/current-chart-replay-session.test.mjs
```

단일 HTML에는 같은 추출본의 정확한 소스 문자열을 포함하며, 오프라인 로더도 같은 해시를 확인한다. 손상된 내장 보존본은 다른 데이터로 조용히 대체하지 않는다. 브라우저 상호작용, 화면 캡처와 전체 앱 검증은 별도의 통합 검증 기록을 따른다.
