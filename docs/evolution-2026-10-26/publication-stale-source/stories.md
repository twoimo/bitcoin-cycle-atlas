## 1. 이전 코드 후보가 준비됨

Rule broken: `PreparedRevisionMatches`
Why: 코드 판본 확인 누락.
In the model, one step leads into this bug: "발행 직전 코드·파일 대조".

0. Start: 공개 후보 수집
1. 기준 코드 변경. Now: 공개 후보 수집 · 코드 변경
2. 파일 묶음 검증. Now: 내용 검증 완료 · 코드 변경
3. 발행 직전 코드·파일 대조. Now: 이전 코드 후보가 준비됨
