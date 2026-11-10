# Atlas 서비스 품질·출시 체크리스트

시작 기준: 2026-11-10, `origin/main=38b9e66`. 최종 검사한 제품 소스는 `acdd1f9629280125f4160d2c363f458615397906`이며 출시 준비 완료가 아니다. 이 문서는 이번 로컬 작업의 단일 진행 원장이다. 기존 요구사항과 연구 원장은 지우거나 완료로 바꾸지 않는다.

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
| 통합·QA·GitHub·배포·롤백 | 부모 | 통합 `release/launch-readiness-20261110`, 최종 후보 `fix/launch-compact-period-20261110` |
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
| S02 | 요구사항 문서 최신 main 기반 통합 | 로컬 완료 | 시작 main 기반으로 문서 전용 5개 커밋을 provenance 포함 이관. 새 후보의 main 반영은 보류 |
| U01 | AI식 장식·중복·둥근 카드 정리, 의미색/초점 보존 | 부분 완료 | UI 정리와 390px 도구 모음·필터·heading 및 390×430 overlay 라벨 수정. 전체 화면 최종 수용은 U02/U03 미충족 |
| U02 | 6 viewport, 전체 셸+실제 자식 화면 overflow/가림 없음 | BLOCKED | 비교 화면 6폭 렌더 통과. 전체 네이티브 시나리오는 390px 통과, 320px dialog clip 실패, 1440px select 입력에서 중단. 뒤쪽 미도달 상태는 미검증 |
| U03 | 키보드·44px 모바일 주요 조작·닫기·포커스 복귀 | 부분 완료 | 비교 복귀 버튼 44×44와 실제 복귀·원래 노드 위치 확인. 모바일 하단 44px 미만 대상 5→0. dialog·native select 기준은 미통과 |
| U04 | 레거시 bare compare → 단일 셸 | PASS (후보) | 기존 toolbar 노드·콘텐츠 보존, URL parser·popstate 복원, 사용자 의도에서만 URL 갱신. `5e241e4`·`acdd1f9`까지 Astra 승인, 관련 회귀 22/22 |
| P01 | 가격축 캐시 정확성·문서 격리·폰트 완료 hover 갱신 | PASS | `1f651ae`, 관련 42/42 통과, GPT-6 Astra 최종 코드 승인. 번들·배포 승인은 별개 |
| P02 | 점근 분석·동일 workload A/B·회귀 없음 | 측정 완료·한계 있음 | 3쌍 20초 블록, 동일 입력 라벨의 cold 중앙 비율 1.689×·warm 1.000×. 출력 속성 8개가 달라 동일 출력/전체 앱 성능 개선으로 주장하지 않음 |
| C01 | CI 중복 제거, 검증 강도·source identity 보존 | 로컬 완료 | worker 제한·fail-closed 집계·중복 조회 감소 통합. 시간·수치·브라우저·artifact gate는 보존. 새 원격 CI/배포 검증은 아님 |
| C02 | 전체 검사·정적 검사·typecheck·generated pages 재현 | BLOCKED | 최종 3,294개 중 3,289 통과·0 실패·5 제외; typecheck·static 성공. `build:pages`는 macOS `library load disallowed by system policy`로 차단, `verify:pages` 미완료. 권한·서명·xattr 변경이나 backend 우회 없음 |
| C03 | 기존 상태 검증 명령·음성 대조군 재실행 | PASS (한정) | 기존 OpenJDK 25로 5명령 정상 종료. TLC 27설정: 정상 8·예상 불변식 위반 19. 실제 소스 대조군 32개 검출. 무한 상태/브라우저/새 모델 대응 검토의 증명은 아님 |
| A01 | WP-A 실제 코드·자산·로그 수신 및 통합 | 부분 완료 | PR #98은 OPEN/draft, 원격 head `7064d25f3fc6eb1574375f1ce76373926a637d6b`. 계약에 맞춘 15세션·16파일 오디오 하위 묶음만 준비, 전체 미디어 통합 미완료 |
| A02 | WP-A 청취 검수·동기화 10지점 | BLOCKED | 직접 청취와 ±0.5초 동기화 검수 미완료. 전체 디코드·타이머·SRT 검사로 대체하지 않음. PDF 547페이지와 Linux 원자 게시도 미완료 |
| G01 | PR/이슈를 실제 결과에 맞춰 정리 | 기존 정리 완료·후속 보류 | #90/#85 병합, #80/#51/#55 superseded 종료. #98/#91–97 보존. 이번 최종 검사 뒤 PR 변경 없음 |
| G02 | 목적별 커밋·원격 보존·검증 통합 PR | 로컬 보존·원격 보류 | 목적별 후보와 검증 원장 보존. 기존 복구 브랜치 외 새 후보 push·merge·통합 PR 변경 없음 |
| R01 | 검증된 artifact로 배포·publication.json commit 일치 | BLOCKED | 2026-11-10 21:17 KST HTTP 200 readback의 sourceCommit `36e7db09f7f66016753f63452a8cba44adcbed28`은 후보와 다름. 새 배포 없음 |
| R02 | 버전·릴리스 asset·체크섬·롤백 절차 일치 | BLOCKED | build/native QA/미디어 gate 미충족으로 정식 릴리스 보류 |
| F01 | 소유한 일회성 탭·서버·clean worktree 정리 | 확인 범위 완료 | 소유한 8153/8154 서버와 일회성 작업트리 12개 정리. 생성 증거는 별도 경로로 이동 보존, 모든 브랜치·현재 후보·WP-A Pro 대화 보존. [정리 영수증](launch-2026-11-10/cleanup.json) |

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
- Java 부재라는 이전 판단은 해소했다. 이미 설치된 `/opt/homebrew/opt/openjdk@25/bin/java`가 `25.0.5.0.3`으로 정상 실행됐다. 설치·시스템 설정 변경 없이 명령 범위의 `JAVA`만 지정해 고정 TLC 1.7.4와 기존 검증 명령을 실행했다.
- WP-A 웹 스레드의 마지막 재시도 결과는 `Internal Server Error`였다. 추가 요청·모델 전환·PR 수정은 하지 않았다.

## 최종 검증 영수증과 범위

[검증 요약](launch-2026-11-10/verification-summary.json)은 검사한 제품 commit, 출력 해시, 네이티브 실패, 운영 readback을 분리한다. [정형 검증 영수증](launch-2026-11-10/formal/) 5개는 실제 명령 결과 그대로이며, 문서 수정이 뒤에 붙어도 검사한 제품 revision은 `acdd1f9`다.

- 전체 검사: `npm test -- --test-concurrency=4`; `ATLAS_TEST_TOTAL`의 `complete:true`, 3,294 tests / 3,289 pass / 0 fail / 5 skipped / 2 batches를 확인했다. 직전 snapshot의 3,290개 결과로 최신 후보를 대체하지 않았다.
- `npm run typecheck`, `npm run verify:static`: 정상 종료. 정적 검사는 966 files, 213 scripts, 991 references다.
- 상태 검증: market/equity/ETH/publication의 고정 유한 TLC 모델과 replay의 실제 JS bounded traces를 구분한다. Replay는 10,000개 재생 trace·40,000 전이 및 259개 선택 trace·726 전이를 확인했다. 전체 다섯 명령의 실제 소스 음성 대조군은 32개이며 복원본도 통과했다. 이번 재실행을 새 모델 대응/상태도 인증, 무한 상태 증명, 수치 예측이나 네이티브 브라우저 증명으로 확대하지 않는다.
- 비교 화면: 320/390/456/768/1280/1440px, 97행, 제목 '사이클 비교', 가로 넘침·런타임 오류 0을 확인했다. 모바일 복귀 조작 후 `page=outlook`과 원래 `BODY` 부모 복원을 관측했다. 닫힌 반응형 rail은 실패가 아니다. footer·plot 외곽 높이를 보존했다. 이는 전체 사이트의 6폭 수용 완료가 아니다.
- Astra 승인 범위: `5b1b5bc..5e241e4`, `5e241e4..acdd1f9`. 마지막 검토 5파일, 변경 테스트 독립 9/9 및 부모 관련 22/22. 코드 승인이 build·native QA·출시 승인을 대신하지 않는다.

### 남아 있는 네이티브 QA

1. 320px TQQQ dialog: 열린 `dl`의 top -29, clip top 62로 기준을 충족하지 못했다. wheel 이벤트는 trusted·무차단으로 대상에 도달했지만 관측한 `scrollTop`은 103→103이었다. focus를 DIALOG로 옮긴 wheel/PageUp/Home 및 별도 touch 진단도 통과하지 못했다. 앱이 offset을 재적용한다는 원인은 확인되지 않았고 부호 반전 제안은 철회했다. 실제 사용자의 스크롤 가능 여부도 미확정이다.
2. 1440px macOS Chrome native select: `selected nasdaq` 대기에서 시간 초과. 테스트를 합성 선택으로 바꾸거나 기준을 낮추지 않았다. 이 실패만으로 실제 사용자 조작이 불가능하다고 단정하지 않는다.

### WP-A 오디오 전용 전달본

- `scope: audio-only`, `audioPrepared:true`, `mediaPrepared:false` 유지. 15세션·16파일의 원본 불변성, 출력 SHA-256·크기·형식·길이·전체 디코드를 확인했고 ZIP 내부 16개 파일도 원본 전달본과 바이트 해시가 일치했다.
- ZIP: `wpa-audio-only-unreviewed-20261110.zip`; SHA-256 `bda4a81215ebff2b5ea1f3003bf6f9493b1bba4232e5b6057aa58ce37b9f1020`.
- 승인 프로그램은 20,400초다. 원본 컨테이너 초과분 0.68초가 발화인지 인코더 패딩인지는 확인하지 못했으며 세션에 임의 포함하지 않았다.
- 직접 청취·동기화 10지점, PDF 547페이지, 전체 패키지 및 Linux `renameat2(RENAME_NOREPLACE)` 게시 검수는 미완료다. 오디오 준비를 전체 미디어 준비나 배포 가능으로 표시하지 않는다.

## 재개 조건

로컬 후보는 `fix/launch-compact-period-20261110`에서 보존한다. 네이티브 두 실패의 원인을 확인하고 기존 기준으로 통과시킨 뒤, 정책이 허용된 빌드 환경에서 `build:pages`·`verify:pages`와 생성 artifact의 source/content identity를 검증해야 한다. WP-A 부분 산출물은 별도 미디어 gate를 유지한다. 이 미완료 상태에서는 새 후보 push·merge·배포·정식 릴리스를 수행하지 않는다.
