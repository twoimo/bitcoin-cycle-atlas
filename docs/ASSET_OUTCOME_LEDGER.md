# 독립 자산 예측 결과 원장

이 경로는 이미 발행·보존된 ETHUSD/BMNR/MSTR 연구 예측을 새 관측으로 평가한다. 새 예측을 생성하거나 기존 발행 시각·입력·경로·runKey를 바꾸지 않는다. 현재 모형 실행, 금융 연구 자료, 세 자산의 최신 발행 조건과 분리되어 있다.

## 실제 실행 경계

GitHub의 ETH candidate evidence workflow에서 집중 검사 직후, 경제 원자료 수집·현재 모형 비교·새 예측 발행보다 먼저 다음을 실행한다. 뒤에 있는 현재 모형 계산이 실패해도 이미 보존한 발행본 평가는 먼저 완료한다.

```sh
node scripts/evaluate-asset-forecasts.mjs
node scripts/evaluate-asset-forecasts.mjs --emit-files
```

- 입력 예측: dist/data/asset-forecast-ledger의 검증된 index·records·snapshots.
- 결과 가격 원문: 해당 commit의 dist/data/eth-ohlc.json, bmnr-ohlc.json, mstr-ohlc.json.
- 이전 평가 이력: research-data/asset-outcome-ledger. 처음 없을 수 있다.
- 새 출력: build/asset-outcome-ledger. production 자료 또는 이전 원장 경로에 쓰지 않는다.
- 공개 사이트·main의 정기 갱신 workflow는 연결하지 않았다. automaticProductionScheduleEnabled=false다.
- 원자료 파일이 예전 것이어도 필요한 목표일의 검증 가능한 관측이 있으면 평가할 수 있다. 한 자산의 수집 실패는 나머지 자산 결과를 지우지 않는다. 부분 실패는 summary에 partial과 사유를 남기고 CLI가 0이 아닌 종료 상태로 알려준다. 실패 뒤에도 출력 artifact는 보존한다.

## 상태 전이

| 조건 | 상태 |
| --- | --- |
| 평가 시각이 목표 관측 종료 전 | pending |
| 종료했지만 해당 cutoff에 실제 수집한 유효 관측이 없음 | missing-observation |
| 실제 연구 발행 뒤에 종료한 목표의 유효 관측을 확보 | scored |
| 재구성 기록의 관측을 확보 | retrospective; 전향 성과에서 제외 |
| 제공자가 같은 목표 가격을 나중에 정정 | 새 관측 판본과 새 평가 생성; 이전 결과는 보존 |

주식 목표는 검토된 뉴욕 거래일·정규/조기 종가를 사용하고, ETH는 UTC 일말을 사용한다. 만기 도래와 자료 수집 완료는 서로 다른 사건이다. 원래 가격 경로가 0인 조건부 주식 예측은 로그 오차가 정의되지 않는 상태도 보존한다.

## 불변 객체와 재생

observations/<id>.json은 원래 JSON archive 문자열, SHA-256, source URL, 관측 범위·행 수·파싱한 가격의 hash와 공개/수집 시각을 보존한다. 공개 시각을 모르므로 실제 collector는 publishedAt:null, collection-upper-bound로 저장한다. Git 시각이나 원래 날짜를 수집 시각으로 대신하지 않는다.

evaluations/<id>.json은 대상 forecast record IDs, 관측 snapshot IDs, 실제 평가 함수의 commit·소스 hash·파일 집합, evaluatedAt 및 결과를 보존한다. 채점한 각 행은 실제 선택한 원문·판본·시장 종료·공개·수집 시각을 직접 참조한다. verifier가 원문을 다시 파싱하고 같은 cutoff에서 관측을 선택해 결과를 정확히 재생한다.

각 파일 이름은 canonical JSON 본문의 내용 hash다. 기존 파일은 wx 방식으로 새로 쓰거나 기존 bytes가 정확히 같을 때만 재사용한다. 색인의 모든 경로에 직렬화한 문자열이 있고 그 JSON 값이 검증한 객체와 같은지, 평가가 참조한 snapshot이 실제 색인에 있는지 쓰기 전에 확인한다. 객체를 모두 보존한 후 index.json의 최신 포인터를 갱신한다. 같은 자료·같은 cutoff는 같은 평가 ID다. 새 cutoff 또는 정정 결과는 새 평가 ID다.

동일 자산의 가장 최근 보존 원문과 연속해서 같을 때만 기존 수집 영수증을 재사용한다. A→B→A처럼 다른 판본을 거쳐 이전 원문으로 돌아온 경우 A도 현재 수집 시각을 가진 새 판본으로 보존한다. 이때 현재 시도의 실제 수집 시각과 기존 영수증 시각을 별도 실행 receipt에 남긴다. 다른 수집 영수증에는 서로 다른 vintage ID가 부여돼 기존 ID의 collectedAt을 바꾸지 않는다.

로그 전송은 큰 원문을 중복 출력하지 않도록 원문을 고정 Git commit·path·SHA-256·bytes로 표시할 수 있다. 이 transport 자체는 완전 snapshot이 아니다. 원문을 복원하고 canonical JSON + LF의 정확한 파일 bytes/hash를 검증한 뒤에만 불변 원장에 보존한다. 전체 snapshot은 실행 artifact에 존재한다.

## 검증 범위와 한계

회귀 검사는 미래 관측 추가만으로 pending→missing→scored가 되는지, 다른 자산의 오류·자료 지연과 독립인지, 정정 가격이 이전 cutoff를 바꾸지 않는지, 원문·관측·결과 변조를 거부하는지, 이전 평가 파일 bytes가 보존되는지 검사한다. 미래 날짜는 명시적인 합성 검사 자료다.

현재 실제 27개 목표는 미도래이며 이 경로 구현으로 점수가 생기지 않는다. 연구 원장 발행과 운영 채택·사이트 공개는 구분한다. 실제 Gemini 반대 검토와 ChatGPT 역검토는 별도 미완료 조건이다. 구조적 hash 검증을 외부 모델 실행이나 시장 데이터의 독립 진위 인증으로 확대하지 않는다.
