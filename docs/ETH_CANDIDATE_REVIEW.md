# ETH 후보 변경분 검토 및 기존 단계 정산

> 2026-10-26 후속 구현: ETH/BMNR/MSTR의 실제 연구 발행 원장과 정밀 시계, 저장본 화면, 실제 수집 영수증, OOS 경제 변수 제거 실험을 추가했다. [최신 후속 실행 결과](eth-candidate-evidence/CONTINUATION_RESULTS.md)와 [새 ChatGPT 논제](reviews/ETH_CHATGPT_THESIS_20261026.md)가 현재 완료·미완료를 구분한다. 아래 최초 후보의 미완료 표시는 당시 감사 기록으로 읽는다. 새 모형의 운영 채택과 실제 Gemini 검토는 계속 미완료다.


## 후속 구현 안내

이하 최초 후보 감사의 관측 기록에 더해, 후속 변경은 ETH/BMNR/MSTR의 별도 연구 발행 원장·원문에 연결된 실제 수집 시각·경제 변수의 OOS 제거 실험·정확한 검토 소스 패킷을 추가한다. 고정 날짜 issuedAt 문제는 modelReviewedAt과 실제 시각을 분리해 수정한다. 현재 계약과 남은 제약은 [후속 조건 문서](ETH_REMAINING_CONDITIONS.md)를 따른다. 각 변경의 실행 여부는 정확한 commit/run 영수증으로 확인하며 최초 후보 성공을 후속 코드에 소급하지 않는다. 연구 원장의 보존은 운영 발행·새 경제 모형 채택을 뜻하지 않는다. 실제 Gemini 반대 검토는 계속 미완료다.

## 검토 신원과 범위

- 기존 운영 기준: main 30805dacdcf0aa3ea991439de87d5f9a38c59f25 / v1.29.0 / 병합된 PR #38.
- 최초 후보 검토 대상: PR #39, 커밋 159fdb8581df37732c600d51f2a0c6a2087a3813.
- 검토자: 이 세션의 ChatGPT / GPT-6 Astra Pro 및 같은 모델의 분리된 읽기 전용 검토 작업.
- 접근: GitHub 연동으로 실제 파일과 blob, 원격 CI 로그를 읽음. 로컬 사용자 저장소·Codex Native2·외부 조정기 슬롯은 사용하지 않음.
- 이 검토는 요청된 Gemini 반대 검토가 아니다. 실제 Gemini 모델 이름, 원문 보고서 URL, 실행 receipt는 모두 미확보다.
- 완전한 비교 소스 묶음과 manifest는 evidence workflow가 실제 체크아웃 commit 및 SHA-256과 함께 생성한다. 전달되지 않은 소스를 Gemini가 읽었다고 주장하지 않는다.

## 논제와 반대 검토에 따른 수정

ChatGPT 논제: BTC에서 실제 사용하는 기준선을 ETH 앵커에 정규화한 전이형, 같은 로그 앵커 산식의 ETH 재추정형, 기존 ETH 단일 예시, 경제 직접 회귀, 과거 확정 오차로 학습한 결합형을 명시적으로 분리한다. 경제 자료 부재는 다른 값으로 대체하지 않고 사용 불가로 남긴다.

| 실제 소스에서 확인한 반대 지적 | 수정 및 검증 계약 |
| --- | --- |
| BTC 이력이 늦게 시작하면 초기 ETH 평가 기준일의 BTC prefix가 비어 전체 평가가 예외로 종료됨 | 해당 입력 실패를 BTC 의존 후보의 사용 불가로 제한. 이후 BTC가 충분해지면 다시 예측하며 ETH 자체 평가 지속. 늦게 시작한 자료와 중간 누락 자료를 회귀 검사 |
| 경제 및 기존 ETH wrapper가 모든 내부 예외를 자료 부재로 바꿀 수 있음 | 예상한 TypeError/RangeError와 예상하지 않은 내부 오류를 구분. 일반 sentinel Error의 전파 검사 |
| 같은 가격/경제 vintage가 상이한 공개·수집 시각을 가지면 입력 순서에 따라 적격 표본이 달라질 수 있음 | 하나의 immutable vintage에 충돌하는 receipt를 거부. 정순·역순을 모두 검사 |
| 경제 모형의 ETH/BTC 예측이 통합 과거 평가에서 사라짐 | 별도 BTC per ETH 타깃, 현재 상대가격 유지·과거 상대 추세 기준선, 경제 상대 예측의 동기화된 평가를 추가. 미래 BTC는 정답 계산에만 사용 |
| 모든 핵심 모형의 공통 원점이 0개인 경우에도 후보별 전체 평균은 숫자가 존재함 | 모든 후보 쌍의 실제 공통 원점·비중복 표본·양측 오차·정확한 첫/마지막 원점을 제공. 공통 표본 0은 null이며 임의 순위 없음 |
| BTC에도 연속 구간 선택을 적용하지만 제외 자료 receipt는 ETH만 보고 | BTC 누락 및 버린 초기 행 수를 별도 기록 |
| sourceHash 보존과 경제 후보 ready 상태의 통합 검사가 부족함 | 경제 합성 fixture를 실제 통합 비교기에 전달하고 sourceHash, 기준일별 발행 시각, USD 및 ETH/BTC 결과 연결을 검사 |
| 날짜가 제한되지 않은 경제 공급 회계에서 Merge 이전 PoW block·ommer 발행을 생략할 수 있음 | EIP-3675 원문과 대조해 별도 필수 발행 입력을 추가. 혼합 전환 창과 완전 post-Merge 창의 경계를 검사하고 input/ridge 버전을 3으로 올림 |
| 제공된 스냅샷 개수를 경제 입력의 이용 가능 여부로 부르면 과장됨 | provided 개수와 실제 경제 예측의 존재 여부를 구분 |

반대 지적을 확인하고 코드·검사에 반영한 것이 이번 ChatGPT 역검토 범위다. 요청된 외부 Gemini 보고서의 역검증은 그 보고서가 없으므로 아직 수행하지 않았다. 최초 159fdb8의 실제 CI 성공을 후속 변경의 실행 성공으로 재사용하지 않는다.

## 기존 1~5단계의 구현과 이번 변경의 경계

| 단계 | 기존 main의 실제 근거 | 현재 상태와 남은 제약 |
| --- | --- | --- |
| 1. 발행본·입력 원장·시간·계측 | forecast-records.js, performance-diagnostics.js | 기존 snapshot은 BTCUSD 전용. 2026-10-25 한 원점의 BTC 5개 발행 조건만 확인됨. 이번 ETH 연구 비교는 ETH/BMNR의 운영 발행 원장 완성을 뜻하지 않음 |
| 2. 누적 평가·최신성·초기화 | forecast-evaluation.js, data-freshness.js, app.js의 화면별 동적 초기화 | 확정 전향 타깃은 아직 0. 가격 공개시각을 모르면 null로 유지. 기존 측정 영수증을 이번 PR의 새 측정으로 부르지 않음 |
| 3. 저장본 재생·변경 이유·조건부 Worker | forecast-records.js, forecast-journal.js, forecast-computation.js, lab-view.js | 취소·revision 일치·Worker 실패/지연 fallback이 기존 구현. 재생 가능성은 당시 공개 가격 판본 복원과 별개. 변경 분해는 경제적 인과 기여가 아님 |
| 4. 금융상품·스테이킹 유동성·ETH | treasury-instruments.js, treasury-liquidity.js, treasury-model.js, eth-view.js, treasury-asset-paths.js | 기존 ETH/BMNR은 같은 경로 생성기를 공유. 회사 유동성 원장의 7일/90일 대기 가정은 실제 네트워크 대기 관측이 아님. 신규 경제 후보 운영 연결은 미승격 |
| 5. 구간·설명변수·렌더러 실험 | forecast-experiments.js, 기존 renderer-experiment.json | 기존 실험은 조건부 미채택 상태. 신규 ETH 후보도 연구 상태이며 확률 보정·예측력·2030~2035 검증 완료가 아님 |

## ETH와 BMNR의 정확한 시간 제약

data-freshness.js는 코인 UTC 일말과 NY 주식 종가를 구분한다. 그러나 기존 treasury-model.js는 날짜 문자열을 정렬하고 issuedAt에 고정 날짜를 기록한다. 같은 달력 날짜가 같은 정보 시점을 의미하지 않는다.

기존 운영 경로는 비동시 종가 경고를 표시하고 연구 기준일보다 앞선 역사 평가를 거부한다. 따라서 이 검토는 현재 화면에서 미래정보 누출을 재현했다는 주장이 아니다. 다음 날 이미 알려진 두 종가를 사용하는 조건부 평가와, 당일 NY 종가에 발행한 엄밀한 예측을 구분해야 한다.

후보 비교는 실제 issue timestamp를 supplied map으로 받을 수 있다. 값이 없으면 보수적으로 다음 UTC 자정까지의 경제 입력만 적격으로 본다. 관측 종료와 실제 공개시각을 혼동하지 않으며, 모르는 과거 발행·공개 시각을 만들지 않는다. 현재 비교기의 가격 adapter는 이미 선택된 날짜당 한 price vintage를 요구하므로 원시 다중 판본 원장을 직접 복원하는 기능은 아니다.

## 실행 증거의 구분

최초 후보 159fdb8:
- [일반 CI](https://github.com/twoimo/bitcoin-cycle-atlas/actions/runs/40303821806): 전체 1,215 tests 통과, 실패·취소·skip 0; 별도 원장·금융·수치·정적 검사 성공.
- [후보 evidence](https://github.com/twoimo/bitcoin-cycle-atlas/actions/runs/40303822004): 새 focused tests 26개 통과 및 실제 저장 가격 비교.
- [원본 artifact](https://github.com/twoimo/bitcoin-cycle-atlas/actions/runs/40303822004/artifacts/12641192995): 전체 비교 JSON, 완전한 source bundle, hash manifest.

후속 변경과 실제 브라우저 영수증은 별도 실행의 정확한 commit/run으로 결과 문서에 기록한다. 기존 체크 통과를 새 코드의 검증으로 소급하지 않는다.

## 승격을 막는 실제 미완료 항목

1. 실제 공개·수집 시각과 원자료 해시를 갖춘 네트워크 경제 입력 판본 및 독립 데이터 검증.
2. 새로운 모형의 충분한 실제 전향 확정 성적. 겹치지 않는 타깃도 독립 시장 국면 수를 보장하지 않음.
3. Gemini가 정확한 소스 묶음을 읽은 반대 검토와 원문, 실제 모델 및 실행 영수증. 이어서 그 보고서의 ChatGPT 역검증.
4. ETH/BMNR 운영 발행 원장과 NY 종가 기준의 정확한 정보 시점 정산.
5. 필요 시 LST의 실제 거래 가능 유동성, 보유 수요의 식별, 담보 공급원 커버리지 및 프로토콜 변화별 안정성 검토.

이 항목을 검사 성공이나 문서 작성만으로 완료 처리하지 않는다. PR은 draft로 유지하며 운영 기본값·main·배포는 변경하지 않는다.
