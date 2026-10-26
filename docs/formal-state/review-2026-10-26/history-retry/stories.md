## 1. 새로고침 후 재시도 막힘

Rule broken: After manual refresh finishes, the prior failed history attempt cannot block the requested visible window. A subsequent failed attempt may set a new delay.
Why: 새로고침 실패가 이전 과거 조회의 재시도 대기를 유지함.
In the model, one step leads into this bug: "최근 조회 실패".

0. Start: 관측 캔들 표시
1. 과거 기간 이동. Now: 과거 봉 조회
2. 과거 조회 실패. Now: 실패 후 재시도 대기
3. 수동 새로고침. Now: 최근 봉 새로고침
4. 최근 조회 실패. Now: 새로고침 후 재시도 막힘

With 수정 후, step 4 (최근 조회 실패) takes you to: 저장 봉 · 재시도 가능.
