# P5 · R22 로컬 통합 검증 (2026-11-13)

병합·push·배포·유료 인프라 변경 없음. R22 목록 분류·검색은 R21 RAG 및 R23 Telegram형 UI와 별개다. 사람 검수나 원격 CI를 로컬 검사로 대체하지 않는다.

## 검증 대상과 방법

- 통합 후보 `49e85b7bfa3f5b2fcb48b9f84661a6b5b5f70374`, 별도 브랜치 `work/local-p5-r22-20261113`.
- Node 24.22.2, 설치된 Mac Chrome. WP6/chart-qa는 커밋된 dist, clean 상태, source/tree/dist-tree 해시를 확인한 로컬 전용 후보 서버를 사용했다. publication.json을 위조하거나 프로덕션으로 표시하지 않았다.
- 각 JSON의 sourceCommit/sourceHashes가 실제 실행 시점의 기준이다. 후속 인용 마크업 수정의 별도 재검증은 아래에 추가한다. 앞선 실행을 후속 전체 소스 실행으로 바꾸어 표기하지 않는다.

## 5축 QA

| ID | 축 | 확인 결과 | 판정과 한계 |
|---|---|---|---|
| Q-P5R22-F | 기능 | R22 원문 기반 검색·주제 필터·빈 결과·초기화 8/8. 네트워크 error→loading→empty→recovered 4/4. WP6 30/30, chart-qa 12/12. | 전체 원문 70개를 처리하며 근거가 있는 35개에 주제 배정, 35개는 미분류. 이미지 내용을 추측하지 않는다. |
| Q-P5R22-V | 시각 | F2 after 4/4: 320/1440 × Light/Dark. F3 24/24: chart/relay/conference × 4폭 × 2테마. 반응형 11/11. | F2 실제 페인트 qualifier true, F3 typography qualifier true. 전 제품 수동 미감 검수의 대체가 아니다. |
| Q-P5R22-A | 접근성 | F2 아이콘 대비 최소 3.246:1, 본문 7.112:1. F3 관측 축 최소 8.833:1. 검색 이름·키보드 포커스·44px·필터 pressed 상태 및 읽기 순서 검사. | 수동 스크린리더·실기기 검수는 미완료. 원문 quote 계약은 최종 F1 6/6·D1=0으로 확인했다. |
| Q-P5R22-P | 성능 | A-9 Fast 4G/gzip/cache disabled 6/6. painted ready 2209.0–2292.6ms ≤2500ms. 네이티브 페이지 전환 10회 18.7–45.5ms ≤150ms. | 실제 오디오·이미지 없이 텍스트/타임라인 경로를 검사했다. 1시간 재생·메모리 A-10, 실미디어 청취를 대신하지 않는다. 최초 실행은 재생성으로 삭제된 tracked 파일 때문에 preflight에서 중단됐고, index 정리 후 같은 기준으로 다시 실행했다. |
| Q-P5R22-C | 일관성 | UI·문서가 같은 분류 모듈 사용. 원문 SHA-256 고정, 분류 리포트 --check. 새 모듈은 정적/오프라인 그래프에 포함. Node import-map 하네스가 실제 내장 bytes를 그대로 평가한다. | compare-shell은 후보와 시작 기준 6fa2d087 모두 152개 동일 실패, 추가·해소 차이 0. 이 기존 검사 계약은 통과로 바꾸지 않는다. |

## 기존 실패와 회귀 구분

- 통합 13개 실패 중 4개는 F3 타이포/줄바꿈 계약, ETH module inventory, Node data-URL import-map 하네스에 한정해 수정했다. 임계값이나 분류 구현을 제거하지 않았다.
- 나머지 9개는 오래된 생성 index/preload/CSS digest였다. 정식 빌더로 재생성했다.
- compare-shell의 후보/기준 실패 목록은 완전히 같다(152/152). 16/16 route는 ready이고 9개 폭에서 가로 넘침은 0이다. 기존 right-region/nav ownership/scroll 계약의 정비와 최신 리뉴얼 요구사항 대조는 별도 열린 항목이다. WP6·chart-qa의 통과로 덮어쓰지 않는다.
- F1 마지막 재검사에서는 R22의 원문 근거 excerpt가 bare span이라 원문의 이모지가 UI glyph로 집계됐다. 원문·D1 검사기·제외 목록은 유지하고, 인용의 기존 의미/표시 계약을 적용하는 후속 수정으로 다룬다.

## 여전히 열린 항목

P5 전체 수용, 기존 compare-shell 계약 재정비, 수동 스크린리더, 사람 청취 0/10, A-10 1시간 재생/메모리, R7 실제 기기·Safari/AppKit, 별도 모델/원격 release 게이트는 자동 완료 처리하지 않는다. R23과 R21 구현도 이 회차의 완료 범위가 아니다. 외부 작성자 시리즈 검색 완료는 확인되지 않았다.

## 증거 위치

`f2/`, `f3/`, `a9/`, `wp6/`, `chart-qa/`, `responsive/`, `compare-candidate/`, `compare-baseline/`의 JSON과 PNG는 원본 실행 파일을 복사한 것이다. 원문 분류 정본은 `../local-r22/CLASSIFICATION.md`와 `classification.json`이다. 최종 릴레이·F1 재검증은 `relay-final/`, `relay-state-final/`, `f1-final/`에 추가했다. 전체 테스트는 최종 재실행 영수증을 별도로 기록한다.

## 최종 인용·상태 재검증

제품 `7a04e3a9dc24a956e12d8c6d4c783fe41ed4e505`에서 F1 6/6·D1=0, R22 검색/필터8/8, 상태4/4를 확인했다. 원문 snippet을 기존 semantic blockquote로 구분했으며 검사기와 제외 목록은 바꾸지 않았다. 라벨·키워드는 quote 밖에 있다.

상태 카운터의 과거 `retries` 필드는 모든 reload action 수였다. 최종 하네스는 실제 retry/refresh를 나눠 단언한다: error·empty는 재시도1/새로고침0, loading은둘다0, recovered는재시도0/새로고침1이며 각 상태status1, 넘침0, 복구메시지60이다. ready의1을 오류 재시도로 오해하지 않는다. 로컬8193 서버가 종료된 첫 재시도는 연결 실패로 중단했고, 소유 서버 복원 후 새 출력디렉터리에서8/8을 재확인했다.

첫 complete:true 전체 실행의9실패는 quote CSS의43개 원본 스타일 번들8건과 root preload 변경 후 미재생성 외부 HTML1건이었다. 원본 스타일→정식 번들→HTML 해시→preload→Pages 순서로 재생성했다. 테스트/임계값을 바꾸어 감추지 않았다. Docker는 설치된 CLI 경로를 찾고, 원래 꺼진 엔진을 이 검증에만 일시적으로 켜서 고정 Linux 출력41/41을 실행했다.

## 사용자 최신 홈 방향

2026-11-13 사용자는 블룸버그형 정보 밀도 또는 기존처럼 곧바로 차트가 나오는 홈을 원했다. 후보에 랜딩/대시보드를 끼우지 않고 기존4방향 차트를 유지하며, 새 방문자 기본 테마만dark로 바꿨다. 저장된light/dark는 우선한다. 별도 [홈 영수증](../home-chart-first-20261113/README.md)은 계산/조회가 끝난 뒤9/9를 확인했다. 이 변경과 P5 전면수용·출시는 구분한다.

### 증거 시점 경계

각 원본 보고서의 sourceBefore/sourceAfter와 해시는 해당 실행의 소스만 증명한다. compare-shell의 후보152/기준152·추가0·해소0은 다크 기본값 추가 전 비교이며, 최신969e46d의 compare-shell 재실행으로 표시하지 않는다. 새 기본값은 별도 홈9/9와 theme 단위20/20으로 확인했다. F2·F3·WP6 원본 결과를 최신 커밋에서 다시 돌린 것으로 표기하지 않는다. 소스가 달라지면 이전 전체 수용을 자동 상속하지 않으며, 출시 보류는 그대로다.

## 최신 전체 회귀 확정

제품969e46d에서 Node24.22.2로 `npm test` 완료: **4007개 중4002통과, 실패0, 건너뜀5**, `complete:true`, 2batches. 고정 Linux 재현 출력41/41을 포함한다. 5skip은 통과로 계산하지 않는다. 타입 검사, 스타일 번들 정합성, Pages104파일·9route, 분류70개/미분류35개, static1142파일·222스크립트·848참조 모두통과. 원본 전체 로그와 요약을 동봉했다.

최신969e46d의 A-9도 변경 없는 Fast4G/gzip/2,500ms·150ms 기준으로 재실행해6/6통과했다. painted ready 2190.1–2206.1ms. 전체 테스트의 고정 Linux 배치가 끝나고, 실행 중 컨테이너0을 확인해 테스트용으로 켰던 Docker Desktop을 다시 중지한 뒤 측정했다. A-10 장시간 재생/메모리와 실제 오디오·이미지 검수는 별도 미완료다.
