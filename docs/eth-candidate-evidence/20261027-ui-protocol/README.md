# 2026-10-27 UI·PoW 부분 관측 실행 근거

최종 실행 소스 **39d380d5a05295f5180088ccfe0190ebc3b21e0d**, tree **e44d085806b4d34ae59c99c88e6a64543f429669**. 이 폴더를 추가한 후속 문서 커밋과 구분한다.

[상세 결과와 제한](../../ETH_UI_PROTOCOL_FOLLOWUP_20261027.md) · [실행 요약](execution.json)

## 실제 결과 파일

| 파일 | 의미 |
| --- | --- |
| [browser-receipt.json](browser-receipt.json) | 최종 native 35/35, 181 PNG, runtime/unexpected 0/0, 원본 offline 오류 15개와 각각의 상태·요청 연결 |
| [hallmark-records.json](hallmark-records.json) | 고정 upstream의 최종 진단 원문·phase·gate·integrity. 0 FAIL/0 REFLEX, static36/render17 WARN 유지 |
| [review-source-manifest.json](review-source-manifest.json) | 45,771,932 bytes source-book의 commit/tree/파일/parts/SHA256. generic externalReview.pending 원문 유지 |
| [pooled-receipt.json](pooled-receipt.json) | 기존 adaptive 731점·27요약·45pairwise 보존과 pooled 1,501개 수익률·실제 비교 결과 |
| [economic-source-receipt.json](economic-source-receipt.json) | 기존 Coin Metrics 수집 성공과 엄격 정의 0/25·전체 snapshot0의 구분 |
| [throughput-receipt.json](throughput-receipt.json) | 기존 rate-derived supplement. 정수 전체 chain gas나 PIT 적격성으로 승격하지 않음 |
| [ledger-receipts.json](ledger-receipts.json) | 9 records/3 snapshots, new0, 27pending/0scored. 반복 call을 새 예측으로 세지 않음 |
| [intermediate-runs.json](intermediate-runs.json) | 첫 UI 실패, 두 번째 통과, 최종 transport cleanup의 이유와 실행 신원 |
| [first-browser-receipt.json](first-browser-receipt.json) / [second-browser-receipt.json](second-browser-receipt.json) | 첫 30/35와 다음 35/35를 최종 실행과 분리해 보존 |
| [first-hallmark-records.json](first-hallmark-records.json) | 첫 UI 실행의 실제 0/0 gate와 그대로 남긴 WARN |

## 원문 수집 판본

- [pow-zero/receipt.json](pow-zero/receipt.json): 최종 51 RPC + 3 고정 규격, **54개 원문 / 1,075,342 bytes**. sources/ 및 rpc/ 파일의 실제 원문, 각 SHA256, 요청 시각·본문·상태를 보존한다.
- [pow-zero-first/receipt.json](pow-zero-first/receipt.json): 첫 성공 실행 52 RPC + 3 규격, **55개 원문 / 1,141,182 bytes**.
- 두 수집은 같은 **2026-09-29–10-26** 창이다. 별개의 독립 시간 표본으로 세지 않는다.
- 출력은 executionPowIssuanceEth=0 부분 관측 1개다. publishedAt:null, PIT0, 전체 경제 snapshot0, modelInputActivated:false를 유지한다.
- 원본 응답의 base64 조각을 순서·완전성·byte 수와 대조해 복원했다. 고정 규격 3개는 저장한 Git blob SHA도 원래 pin과 같음을 확인했다. RPC 응답은 수집 당시 기록한 SHA256과 원문을 함께 보존하며 독립 consensus 검증을 했다는 뜻은 아니다.
- provider: https://ethereum.publicnode.com/ ; [PublicNode terms](https://www.publicnode.com/terms). RPC 데이터에 별도 공개 라이선스를 임의로 부여하지 않는다. 규격 파일의 원래 저자·copyright 표시는 원문에 남는다.

## 대표 실제 PNG

전체 native 181 PNG는 아래 artifact에 있다. 이번 새 경계를 보여 주는 최종 PNG 9개와 첫 실패 PNG 1개를 이 폴더에도 보존했다.

| 캡처 | 확인 범위 |
| --- | --- |
| [모바일 갱신 실패·재시도](screenshots/workspace-btc-320x900-refresh-retry-failed.png) | 320px 공지·44px 버튼·보존 관측일 |
| [데스크톱 재시도](screenshots/workspace-btc-1440x900-refresh-retry-failed.png) | 한 primary toolbar와 실제 실패 공지 |
| [짧은 화면 재시도](screenshots/workspace-btc-short-900x430-refresh-retry-failed.png) | 430px viewport 하단까지 차트 유지 |
| [지표 창 스크롤 끝](screenshots/workspace-btc-short-900x430-indicators-scroll-end.png) | sticky 제목·실제 닫기 action |
| [모바일 표 양축 끝](screenshots/data-corner-320x568.png) | 이름·판정·헤더와 마지막 행 |
| [짧은 표 양축 끝](screenshots/data-corner-900x430.png) | 두 축 scroll owner와 고정 교차 셀 |
| [375px 전체 출처](screenshots/workspace-legacy-375x900-legacy-sources.png) | 기존 목적지 3개와 전체 교재 제목 |
| [1620×1008 비교표](screenshots/data-fill-1620x1008.png) | 18종목·BTC 첫 행·비트코인·하단0.25px |
| [1920×1440 비교표](screenshots/data-fill-1920x1440.png) | 큰 viewport에서 같은 하단 경계 |
| [첫 모바일 실패](screenshots/first-workspace-btc-320-failure.png) | 수정 전 재시도 버튼이 오른쪽으로 밀린 실제 실패 |

대표 최종 6개(모바일 retry, 짧은 retry, 320 표 corner, 지표 scroll end, 375 출처, 1620 표)는 실제 이미지를 열어 확인했다. 자동 receipt가 입증하는 범위와 별도 시각 확인 범위를 구분한다.

## 실행 artifact와 보존 정책

- [최종 후보 evidence](https://github.com/twoimo/bitcoin-cycle-atlas/actions/runs/40457958478/artifacts/12713197963): ID12713197963, zip SHA256 c7d9e71046eb61393f0d398e107f5b8addfa7311a8dcb0d0808c147a17ad6f6e, 만료 예정 2026-11-26T06:00:47Z.
- [최종 Hallmark](https://github.com/twoimo/bitcoin-cycle-atlas/actions/runs/40457958468/artifacts/12712638173): ID12712638173, zip SHA256 a09c62568519c5840712e16fb80382d515daeac6f9e7fcdb1e37b12d4eb4a2d2, 만료 예정 2026-11-26T05:56:33Z.
- source-book SHA256 **12bb39fc62ba05fd0b0ef3ee9b23618f15857e7327abca9edb323d6042d1a278**. 완전한 book은 artifact에, 원문 inventory와 hash는 manifest에 있다.

사용자 지시에 따라 Gemini 반대 검토와 후속 역검토는 **omitted-by-user**다. 이 폴더의 내부 소스·수학·기능 검증을 해당 외부 검토의 실행이나 통과로 표시하지 않는다. PR Draft, releaseAuthorized=false, 신규 기본 금융 모형 승격·병합·배포 없음.
