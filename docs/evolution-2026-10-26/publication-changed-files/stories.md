## 1. 변경된 파일이 준비됨

Rule broken: `PreparedContentMatches`
Why: 검증 후 파일 해시 확인 누락.
In the model, one step leads into this bug: "발행 직전 코드·파일 대조".

0. Start: 공개 후보 수집
1. 파일 묶음 검증. Now: 내용 검증 완료
2. 후보 파일 변경. Now: 내용 검증 완료 · 파일 변경
3. 발행 직전 코드·파일 대조. Now: 변경된 파일이 준비됨
