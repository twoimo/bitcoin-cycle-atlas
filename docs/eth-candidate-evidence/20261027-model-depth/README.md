# ETH 기존 모형·남은 조건: 최종 실행 증거

검증 소스는 **93810f3ae099aa8af37bc41a3762981ab749a7b4**, tree는 **2e9fec444da0b1565ed14dcbe612e34e0e42470f**다. 이 결과를 저장한 후속 문서 커밋과 실행 소스를 구분한다. [전체 해설](../../ETH_MODEL_DEPTH_20261027.md), [남은 조건](../../ETH_REMAINING_CONDITIONS.md)을 함께 읽을 수 있다.

## 실제 완료 결과

| 검사 | 결과 | 실제 실행 |
|---|---|---|
| 일반 CI | 1,469 pass, fail 0, skipped 0; 수치 assertion 318,010; negative controls 16/16 | [40470921248](https://github.com/twoimo/bitcoin-cycle-atlas/actions/runs/40470921248) |
| 집중·실제 브라우저 | 집중 336/336, native 35/35, 181 PNG; runtime 0 / unexpected resource 0 | [40470921260](https://github.com/twoimo/bitcoin-cycle-atlas/actions/runs/40470921260) |
| 전체 앱 Hallmark | 0 FAIL / 0 REFLEX; static 36 / render 17 WARN; integrity errors 0 | [40470922626](https://github.com/twoimo/bitcoin-cycle-atlas/actions/runs/40470922626) |
| 실제 재수집 후 발행 | 새 기록 0, 최초 기록 2개 재사용, 고유 원점 1, pending 6, scored 0 | 같은 evidence 실행 |
| 별도 프로세스 재생 | 네트워크 0, 신규 발행 0, 원래 입력에서 두 모델 각각 731점 정확 재계산 | 같은 evidence 실행 |

일반 CI의 실제 checkout은 main과의 합성 merge **3faa2c5c9be1c5987b89fa3544e48aa5f861ccf6**다. 집중·native·Hallmark는 직접 PR head다. 구체적인 source/tree와 원문 요약은 [execution.json](execution.json), [ci.json](ci.json)에 있다.

원본 offline resource 오류 15개는 예상된 BTC 갱신 실패와 상태 보존을 검사한 기록이며 삭제하지 않았다. Hallmark의 headings 52/54와 figures 208/209 경고, waiver/dismissal 0도 원문대로 남겼다.

## 수치 민감도

[monte-carlo.json](monte-carlo.json)은 raw replicate 144개를 포함한 실제 완전한 보고서다. [initial-monte-carlo.json](initial-monte-carlo.json)은 최초 고정 정책 실행이다. 최종 실행의 모든 raw replicate와 수치 결과가 최초 실행과 정확히 같음을 확인했다. 8개 seed와 256/1,024회 경로는 금융 역사 원점 수를 늘리지 않는다.

고정 패널의 pooled/flat skill 범위는 30/90/180일 모두 양수와 음수에 걸친다. 단일 seed의 작은 개선을 안정적 우월성으로 해석하지 않는다. 기본 seed·모형·구간 보정은 바꾸지 않았다. 자세한 해석은 [findings.json](findings.json), [model-readiness.json](model-readiness.json)에 있다.

## 실제 최초 발행, 재사용과 중간 중복

최초 두 후보는 **2026-10-27 16:44:13.396 KST**에 발행했다. 2026-10-26 완료 Coinbase ETH-USD 종가 $2,320.34를 사용했다. [최초 영수증](first-issuance-receipt.json)과 저장소의 [원래 원장](../../../research-data/ethereum-prospective-ledger)을 연결한다.

최종 [prospective](prospective) 디렉터리는 issuer가 실제로 만든 receipt·index·raw·acquisition·observation·evaluation과 최초 record/snapshot의 정확한 바이트를 보존한다. 로그에서 새로 받은 8개 파일과 이미 Git에 고정된 3개 참조를 합쳤으며, manifest가 제공한 Git blob SHA와 실제 저장 blob을 대조했다. [latest-issuance-receipt.json](latest-issuance-receipt.json)과 [prospective-replay-receipt.json](prospective-replay-receipt.json)은 전체 console receipt다.

**중간85b958 실행**에서는 요청 범위 밖의 미완료 오늘 일봉이 달라져, 완료 입력과 출력이 같은 두 기록이 추가됐다. 이 실행의 총 4 records / pending 12는 고유 예측 원점 1개다. [intermediate/85b958](intermediate/85b958)에 추가 두 기록·그 입력 snapshot·raw·acquisition·receipt를 원문대로 보존했다. 최종 활성 원장에는 가장 이른 두 기록을 유지했다. 중간 기록을 독립 금융 표본으로 합산하지 않는다.

93810f의 재사용 정책은 base 원문·정확한 request·완료 OHLCV·전체 가격 prefix·모형 소스·옵션을 묶는다. 범위 밖 행만 바뀌면 최초 발행본을 재사용하며, 완료 OHLCV 개정은 계속 별도 입력이다. 같은 입력에서 output/targets/benchmarks가 달라지면 실패한다. 중간 실행과 로그 회수 실패는 [intermediate-runs.json](intermediate-runs.json)에 구분했다. 47ee 실행의 미회수 세부 개수는 추정하지 않았고 해당 전체 artifact를 연결했다.

## 원문과 해설의 구분

- prospective 디렉터리와 intermediate의 파일은 실제 log transport 또는 고정 Git 참조에서 복원한 원본이다.
- monte-carlo.json은 원래 보고서의 JSON 직렬화와 동일한 형식으로 보존했다. 원래 실행 파일의 SHA256은 sourcebook manifest에 있다.
- *-receipt.json, Hallmark findings와 sourcebook manifest는 실제 console JSON을 읽기 쉬운 형식으로 보존했다. 원래 artifact 안의 파일 자체와 formatting hash가 같다고 주장하지 않는다.
- findings.json, execution.json, ci.json, source-preservation.json과 이 README는 해당 원문을 설명하는 기록이다.
- [source-preservation.json](source-preservation.json)은 이전 작업 head와 비교한 변경 목록 및 보호 파일 18개의 동일 Git blob을 기록한다. 모형·가격·원래 자산 원장은 보존했다.

## 전체 artifact와 source-book

[전체 실행 artifact](https://github.com/twoimo/bitcoin-cycle-atlas/actions/runs/40470921260/artifacts/12719255668)는 **181개 원본 PNG, 전체 browser report, source-book, 원시 수집 파일**을 포함한다.

- ZIP: 45,887,217 bytes.
- ZIP SHA256: c4720ee5758dee16c21527a5197cb40c4f2dabae4862bc048f186f38c123427c.
- Actions 보존 기한: **2026-11-26 17:10:16 KST**.
- source-book: **267 seeds / 384 entries / 283 parts / 50,872,902 bytes**, unresolved import 0.
- source-book SHA256: eee657861513c6c055a2be299f11599e639d1b70582f62b246a2130b6f3d91cb.

스크린샷 로그 mode는 failures-only지만 모든 성공 PNG도 artifact에 남는다. 전체 UI 소스는 이전 화면 개선 후와 같고, 이전 대표 PNG는 [화면·프로토콜 증거](../20261027-ui-protocol/README.md)에도 보존돼 있다.

## 남은 조건

완전 경제 snapshot은 0개이며 과거 point-in-time 판본도 확보되지 않았다. 후보 전향 성과는 아직 0표본이다. 첫 30/90/180일 관측 종료는 각각 **2026-11-26 / 2027-01-25 / 2027-04-25, 한국 시각 09:00**이며, 그 뒤 실제 완료값을 수집해야 점수를 만든다.

Gemini 반대 검토와 후속 역검토는 사용자 지시에 따라 **omitted-by-user**다. source-book generator의 generic pending을 외부 검토 필수 조건으로 되살리지 않는다. Draft, releaseAuthorized=false, productionPromoted=false를 유지했고 main 변경·병합·공개 배포를 수행하지 않았다.
