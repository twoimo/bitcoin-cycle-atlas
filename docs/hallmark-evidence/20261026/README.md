# 실제 실행 증거

대상 응용 소스는 `df0bc769b3cb9a65654c2874673e04612c8880df`다. 영수증을 저장한 후속 문서 커밋을 검사 대상 소스로 소급하지 않는다.

- `execution.json`: 실제 workflow/job/source/tree/artifact, 일반·집중·브라우저 검사 요약과 제한.
- `hallmark-findings.json`: 원본 current FAIL, REFLEX, WARN을 모두 보존한 기록. 분류·severity를 변경하지 않았다.
- `browser-receipt.json`: 실제 Chromium 34개 사례와 source hashes, 기하·키보드·터치·리사이즈·원본 PNG 해시. 대용량 가격 배열은 브라우저 스크립트의 원래 로그 영수증 계약대로 제외한다.
- `model-boundaries.json`: 같은 직접 head 실행의 경제 수집·후보 비교·발행·독립 결과 원장 요약. 디자인 적용은 모델 준비·전향 성과를 바꾸지 않는다.
- `review-source-manifest.json`: 실제 동결 source-book의 전체 파일·조각·해시 manifest.
- `visual-review.md`: 소스 작성과 분리된 같은 모델의 실제 화면 검토. 실제 Gemini 반대 검토가 아니다.
- PNG: 실제 Actions에서 캡처한 대표 화면이다. 재구성한 이미지나 디자인 mockup이 아니다. 원본 이름·출처 commit·Git blob을 `execution.json`에 기록한다.

전체 baseline/current 80장과 모든 브라우저 상태 이미지는 실행 artifact에 있다. artifact의 SHA-256과 만료 예정일은 영수증에 보존하며, 저장소의 대표 PNG·JSON·검토 기록은 별도로 유지한다.
