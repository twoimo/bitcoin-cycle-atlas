## 1. 다른 공개물을 확인으로 오인

Rule broken: `ConfirmedIdentityMatches`
Why: 공개 응답 식별자 확인 누락.
In the model, one step leads into this bug: "실제 공개 식별자 대조". The steps below are the shortest path that TLC found.

0. Start: 공개 후보 수집
1. 파일 묶음 검증. Now: 내용 검증 완료
2. 발행 직전 코드·파일 대조. Now: 확인한 묶음 준비
3. 실제 공개 식별자 대조. Now: 다른 공개물을 확인으로 오인
