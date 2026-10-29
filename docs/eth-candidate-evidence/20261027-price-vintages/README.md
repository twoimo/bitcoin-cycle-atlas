# 가격 판본 검증 후속 실행 증거

검증 source: `fb2cec889c409a40ced3760c415b0b3cccdd6165`, tree: `95ad3f21f34e4e225aac2ec4bfb9240da218cdbc`. 결과를 저장한 후속 문서 commit과 구분한다.

- [수정·검증 보고서](../../reviews/PRICE_VINTAGE_ORDER_FIX_20261027.md)
- [실패 재현·최종 실행·소스·artifact 신원](execution.json)
- [실제 Chromium 34사례의 전체 영수증](browser-receipt.json)
- [수집·후보 비교·경제 제거 실험·기존 결과 원장·새 소스 개정본의 별도 상태](model-boundaries.json)
- [269개 원문/실행 입력 및 281개 조각 manifest](review-source-manifest.json)
- [원본 Hallmark 진단과 실행](hallmark-findings.json)
- [같은 모델 분리 코드 검토의 범위](independent-review.json)

일반 CI는 main과 합성한 merge checkout이다. 후보·브라우저·source-book은 직접 PR head다. 수정 전의 두 회귀 실패, 중간 source-book 단계 실패 및 최종 Hallmark의 첫 Chrome 시작 실패도 실제 실패로 기록한다.

직접 후보 workflow는 집중 **214/214**, native **34/34**, **161 PNG**, runtime/resource error **0/0**, source-book **50,489,326 / 60,000,000 bytes**를 완료했다. 전체 source-book과 모든 원문·개정본·PNG는 [Actions artifact12671627211](https://github.com/twoimo/bitcoin-cycle-atlas/actions/runs/40367613761/artifacts/12671627211)에 있으며 보관 만료 예정은 2026-11-25T17:25:00Z다.

원본 Hallmark 디자인 gate는 **6 FAIL / 3 REFLEX**를 유지하며 통과가 아니다. 기존 9개 연구 기록의 27개 목표와 별도 개정본 포함 18개 기록의 54개 목표 모두 **scored 0**이다. 같은 원점의 개정본 수를 독립 관측 수로 세지 않는다. 실제 Gemini 외부 실행·모델 성과·운영 채택을 증명하지 않으며 releaseAuthorized=false다.
