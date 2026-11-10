# Atlas 서비스 품질·출시 체크리스트

기준: 2026-11-10, `origin/main=38b9e66`. 이 문서는 이번 로컬 작업의 단일 진행 원장이다. 기존 요구사항과 연구 원장은 지우거나 완료로 바꾸지 않는다.

## 목표와 경계

- 관측 데이터·모형·출처·불변 기록을 보존하면서 화면의 불필요한 장식과 중복을 줄인다.
- 데스크톱·태블릿·모바일의 실제 조작, 로딩·빈 결과·오류·정상 상태를 검증한다.
- 같은 검증을 불필요하게 반복하는 CI만 줄인다. 시간 예산, 수치 허용오차, 브라우저 사례 수, artifact/source identity 검사를 낮추지 않는다.
- DeepSeek 구현은 부모의 diff·검사·실제 화면 판정 전까지 후보이다. 실패한 변경은 수정 후 재검사하고 반복 실패하면 부모가 구현한다.
- 커밋·PR·빌드·배포·릴리스는 별도 상태다. 미검증 변경은 main에 합치거나 출시 완료로 표시하지 않는다.
- 인증·유료 RAG·시즌 테마 요구사항의 기존 미결정/구현 보류는 이번 UI 품질 요청만으로 자동 해제하지 않는다. 유료 용량과 개인정보 정책을 임의로 선택하지 않는다.
- 연구 모델의 경제 입력·실제 전향 성숙 창은 UI 검사로 충족되지 않는다. `ETH_REMAINING_CONDITIONS.md`의 연구 승격 조건을 유지한다.

## 작업 소유권

| 작업 | 담당 | 브랜치/범위 |
|---|---|---|
| 통합·QA·GitHub·배포·롤백 | 부모 | `release/launch-readiness-20261110` |
| 가격축 정확성·캐시 | 부모, Astra 검토 | `fix/launch-axis-20261110` |
| UI 장식·표면 정리 | DeepSeek 4.1 Flash, 부모 pass/fail | `fix/launch-ui-20261110` |
| CI 중복 제거 | DeepSeek 4.1 Flash, 부모 pass/fail | `fix/launch-ci-20261110` |
| WP-A 컨퍼런스 | 기존 웹 Pro 스레드 | `feat/conference-review-20261110`, PR #98 |

원래 로컬 checkout의 `dist/data/relay/*` 미커밋 변경과 별도 서비스/릴레이 워크트리는 보호한다. 통합은 최신 main에서 생성한 별도 워크트리에서 수행한다. 구 브랜치의 146개 로컬 전용 커밋은 임의로 main에 합치거나 삭제하지 않는다.

## 판정 규칙

PASS는 정확한 revision, 실행 결과, 관측 수용 기준이 모두 있는 경우만 사용한다. TODO는 실행 가능, BLOCKED는 외부 입력·권한·환경·실제 시간 경과가 필요함을 뜻한다. 제외 또는 보류는 PASS가 아니다.

| ID | 수용 기준 | 상태 | 근거/남은 일 |
|---|---|---|---|
| S01 | origin/main 동기화·dirty delta 보존·복구 지점 확보 | PASS | main `38b9e66`, `backup/prelaunch-20261110-38b9e66`, 미커밋 axis patch 백업 |
| S02 | 요구사항 문서 최신 main 기반 통합 | 진행 | 원본 docs 브랜치의 문서 전용 5개 커밋을 provenance 포함 이관. main 반영 전 |
| U01 | AI식 장식·중복·둥근 카드 정리, 의미색/초점 보존 | 진행 | DeepSeek UI 후보 작성, 부모 실제 화면 심사 예정 |
| U02 | 6 viewport, 전체 셸+실제 자식 화면 overflow/가림 없음 | TODO | 320/390/456/768/1280/1440, 메뉴·검색·설정·독자까지 확인 |
| U03 | 키보드·44px 모바일 주요 조작·닫기·포커스 복귀 | TODO | 기존 테스트와 실제 조작 함께 확인 |
| U04 | 레거시 bare compare → 단일 셸 | TODO | WP-C. 기존 WP-A 파일 소유권 조정 후 수행; market-lab/mobile-preview는 보존 |
| P01 | 가격축 캐시 정확성·문서 격리·폰트 완료 hover 갱신 | PASS | `1f651ae`, 관련 42/42 통과, GPT-6 Astra 최종 코드 승인. 번들·배포 승인은 별개 |
| P02 | 점근 분석·동일 workload A/B·회귀 없음 | TODO | 근사 합성 속도 주장은 철회. 정확 캐시의 재사용/신규 라벨 비용 다시 측정 |
| C01 | CI 중복 제거, 검증 강도·source identity 보존 | 진행 | DeepSeek 독립 후보, 부모 검토 예정 |
| C02 | 전체 검사·정적 검사·typecheck·generated pages 재현 | BLOCKED | 로컬 rolldown native library: macOS `library load disallowed by system policy`; 권한·서명·xattr 변경이나 backend 우회하지 않음. 다른 독립 검사는 계속 |
| A01 | WP-A 실제 코드·자산·로그 수신 및 통합 | 진행 | PR #98 head `f92124e3`, 아직 보고와 원격 코드 불일치. 웹5.6 Sol Pro로 복구 요청 수락 확인 |
| A02 | WP-A 청취 검수·동기화 10지점 | BLOCKED | 이전 보고 0/10. 재생 타이머·SRT 9,168cue 검사는 실제 청취 검수 대체 아님 |
| G01 | PR/이슈를 실제 결과에 맞춰 정리 | 진행 | #90/#85 병합, #80/#51/#55 superseded 종료. #98/#91–97 보존 |
| G02 | 목적별 커밋·원격 보존·검증 통합 PR | 진행 | 부모만 통합/푸시. 강제 push 없음 |
| R01 | 검증된 artifact로 배포·publication.json commit 일치 | TODO | 마지막 확인된 서비스 commit `36e7db0`; 최종 새 readback 필요 |
| R02 | 버전·릴리스 asset·체크섬·롤백 절차 일치 | TODO | 배포/생성물 검사 PASS 전 정식 릴리스 금지 |
| F01 | 소유한 일회성 탭·서버·clean worktree 정리 | TODO | 미병합 커밋과 로그/영수증은 보존 |

## 점근적 분석 기준

- 가격축: k개 라벨, u개 미캐시 문자열. draw당 고정 sample 1회(별도 badge 크기면 추가 1회)와 u개 전체 문자열 실측. cache hit은 Map 조회이며 신규 라벨이 모두 다르면 O(k) 실측이 남는다. 문자열 hashing/length 비용도 존재한다.
- 메모리: Document WeakMap, 문서당 2048 측정값, layout당 256. 영구 document의 viewport/size 변경에도 엔트리 수 상한 유지.
- 주석: 한 refresh 안에서 computed style 재조회만 메모화. 전체 SVG 재생성/annotation 후보 순회 자체의 차수 개선을 주장하지 않는다.
- CI: 게이트 그래프·중복 입력·출력 소유권 기준으로 동일 검증의 재실행을 제거한다. 순차화와 elapsed-time 개선은 구분하며 병렬 lane 추가로 계측 노이즈를 만들지 않는다.
- 이전 합성 수치 32.45→7.37ms는 근사 합성 구현의 측정이며 현재 정확 캐시에 적용하지 않는다. 실사용 개선은 교차 A/B 후에만 보고한다.

## 되돌리기

1. 시작 main은 `38b9e66`, 마지막 확인된 production source는 `36e7db0`. 둘을 같은 검증 상태로 취급하지 않는다.
2. 통합 전 후보는 브랜치로 보존한다. 실패 후보는 병합하지 않는다.
3. 통합 후 회귀는 관련 목적 커밋을 `git revert`로 되돌리고 기존 전체 검증을 재실행한다. main history를 강제로 되감지 않는다.
4. 이전 production artifact/version을 확인한 뒤 정확한 배포 대상으로 복구한다. source 태그만으로 배포 복구 완료라고 하지 않는다.
5. 작업 중 생성한 로그·소스 해시·검사 결과·스크린샷은 세션 작업 영역에 보존한다. 공개 릴리스에는 비밀·원본 개인정보·민감 설정을 포함하지 않는다.

## 환경과 모델 관측

- Pstack 공식 `pstack` 경로 최신 revision은 `c742dd61706fbacc1b95f1a20b7b988cf096ce6c`, 설치 기준과 일치(2026-11-10T08:24Z). 원저자 후속 글 전체 탐색은 이번 실행에서 아직 별도로 검증하지 않았다.
- 웹 GPT-6은 native menu에 사용 한도 도달 표시. 기존 허용 fallback GPT-5.6 Sol Pro를 선택하고 WP-A 복구 메시지 1회 제출, `생각 중`/`중지` 확인. 로컬 코드 검토는 별도 `openai-codex/gpt-6-astra`.
- `npm ci` esbuild postinstall은 SIGKILL. `--ignore-scripts` 설치만 성공했으며 이것은 정상 설치/빌드 PASS가 아니다. 이후 명시적인 OS library policy 거절을 확인하여 로컬 native build는 중단했다.
