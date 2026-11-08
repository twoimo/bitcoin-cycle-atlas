# 자산군별 미래 경로 모델 (WP3)

구현: `dist/forecast/forecast-models.js` · 테스트: `tests/forecast-models.test.mjs`

가격을 예측하는 모듈이 아니라, **어떤 자산에 어떤 모델 계열을 쓰고 무엇이 추정이고 무엇이 가정인지**를 코드로 고정하는 모듈이다. 표본이 부족한 자산은 경로 생성을 거부한다.

## 모델 계열
| 자산 | 계열 | 지평 단위 | 추정 | 가정 |
|---|---|---|---|---|
| BTC·ETH | `crypto-jump-tail` (점프 + Student-t, 레짐 변동성) | 달력일 | 변동성·점프 강도·점프 크기·자유도 | 반감기 사이클 효과(n=3), 24/7 거래 |
| MSTR | `structural-nav` (BTC 경로 × mNAV 프리미엄) | 거래일 | 프리미엄 회귀 속도·BTC 베타·변동성 | 프리미엄 장기 평균, 희석·자금조달, 비용 |
| BMNR | `structural-nav` (ETH 경로) — **T3로 경로 거부** | 거래일 | — | — |
| TQQQ·SOXL (3배), 233740 (2배) | `leveraged-index` | 거래일 | 기초지수 변동성 | 일별 리밸런싱, 무비용 차입, 배수 |
| SPX·NASDAQ·KOSPI·KOSDAQ·KODEX | `index-bootstrap` | 거래일 | 변동성, 드리프트(구간) | 과거 블록 재사용, **사이클 성분 없음** |
| 부동산 4지역 | `monthly-ar` | 개월 | AR(1)·계절성·잔차 분산 | 공표월 분리, **일봉 변환 금지** |

## 핵심 규칙
- **레버리지 감쇄는 자유 파라미터가 아니다.** `leveragedDecayLog(L, σ, t) = −½·L(L−1)·σ²·t`로 계산한다. 1배는 감쇄 0, 배수가 클수록 감쇄가 크다(테스트로 고정).
- **MSTR·BMNR은 독립 주가 모형을 쓰지 않는다.** 기초자산 경로에 재무 구조를 적용하는 구조 모형이며, 프리미엄·희석 가정을 별도 항으로 분리한다.
- **지수에는 사이클 성분을 넣지 않는다.** 부동산은 월 단위를 유지하고 OHLC로 변환하지 않는다.
- **T3 자산은 등록돼 있어도 경로를 만들지 않는다.** `assertModelAvailable(symbol, tier)`가 오류를 던지고, 화면은 "표본 부족" 안내로 바꾼다.
- 반감기 효과는 관측 사이클이 3개뿐이므로 **추정 계수가 아니라 가정** 칸에 둔다.

## 계산 도우미
| 함수 | 용도 |
|---|---|
| `leveragedDecayLog(leverage, dailyVol, days)` | 레버리지 ETF의 일별 리밸런싱 감쇄(로그) |
| `studentTVariance(nu)` | Student-t 분산, 꼬리 두께 반영 |
| `jumpDiffusionVariance(diffusionVol, intensity, jumpVol)` | 점프 포함 총 분산 |
| `modelSpecFor(symbol)` | 자산별 계열·지평 단위·추정/가정 목록 |
| `assertModelAvailable(symbol, tier)` | 모델 생성 허용 판정 |
| `horizonsFor(symbol)` | 자산 단위에 맞는 허용 지평 |

## 남은 일
- 실제 경로 생성기(점프 시뮬레이션, 블록 부트스트랩, AR(1))는 이 사양을 입력으로 받아 별도 모듈에서 구현한다. 이번 WP는 사양·게이트·도우미까지다.
- 화면 배지(계열·표본·추정/가정)는 WP4 범위다.
