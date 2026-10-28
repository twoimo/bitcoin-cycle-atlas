# ETH 전향 기록의 연속 보관 — 2026-10-28 실제 검증 체크포인트

이 문서는 첫 실제 보관 게시까지의 중간 실행 기록이다. 다음 PR 실행이 아래의 원격 데이터 커밋을 실제로 복원하고 누적하는 증거는 아직 대기 중이며, 확인 후 같은 문서를 갱신한다.

## 검증한 구현과 실제 산출물

구현 소스는 [`f6739b0a5da2986cbe33d028ea8fcd3468d85012`](https://github.com/twoimo/bitcoin-cycle-atlas/commit/f6739b0a5da2986cbe33d028ea8fcd3468d85012), tree는 `48474119d3ed2289adf637c4742d73e5670b1ef9`다. 이번 수정은 불변 보관 객체·페이지·세대, 원격 읽기, 전체 원본 검증 후 복원·append, 발행 전 용량 검사와 별도의 일일 workflow 정의를 포함한다. 기준 소스 `4bf84ce3`와 비교해 원격 `dist/**` 713개 blob은 모두 동일하다.

- [일반 CI 40626529470](https://github.com/twoimo/bitcoin-cycle-atlas/actions/runs/40626529470): 1,823/1,823 통과, 수치 assertion 318,010개, 음성 대조 16/16. 실제 checkout은 합성 merge `97483895600dfcae75e0c2c079bf45a519a24bb7`이다.
- [ETH 40626529467](https://github.com/twoimo/bitcoin-cycle-atlas/actions/runs/40626529467): 모든 38개 job 단계 성공. 직접 소스의 artifact `12790530197`을 내려받아 61,175,599바이트, SHA256 `75b0c16efbe9261f4f755f788ca6bce2e4b7a8c5f79021fac07f11ef8026648d`, ZIP CRC와 전체 849개 파일의 경로를 검증했다. 별도 ETH 테스트 개수는 job 로그를 가져오지 못했으므로 추정하지 않는다.
- [Hallmark 40626529492](https://github.com/twoimo/bitcoin-cycle-atlas/actions/runs/40626529492): FAIL 0, REFLEX 0, integrity 오류 0. 정적 WARN 36개·render WARN 17개를 보존했다.

실제 source-book은 444 seeds, 631 frames, 434 parts, 77,953,226바이트다. 448개 커밋 프레임은 해당 원격 Git tree와, 183개 실행 프레임은 내려받은 원문과 대조했다. 전체 part 재결합과 unresolved 0을 확인했다. Chromium 35/35와 PNG 181개 전부의 해시·목록이 일치했고 runtime 오류 0, 원시 resource 오류 15개는 기존의 한정된 BTC 오프라인 갱신 시험과 화면 증거를 충족했다. unexpected 오류는 0이다. [원문 검증 영수증](eth-candidate-evidence/20261028-continuity/first-artifact-verification.json), [다운로드·ZIP 검증](eth-candidate-evidence/20261028-continuity/first-artifact-download-integrity.json)

## 첫 데이터 브랜치 게시와 readback

검증한 실행은 커밋 시드 3세대에서 4세대로 한 번 누적했다. 실제 원격 읽기는 당시 데이터 브랜치의 명시적인 부재를 확인했으며, 시드 39개 파일과 직전 세대가 바이트 단위로 동일했다. 다음 실행의 원격 복원을 이미 확인했다고 해석하지 않는다.

검증 후 GitHub connector로 데이터만 수동 게시했다. 데이터 브랜치는 `eth-prospective-archive`, 커밋은 [`8f169b18a2eeec70fe9e57eed5bdb154e9dad3bc`](https://github.com/twoimo/bitcoin-cycle-atlas/tree/8f169b18a2eeec70fe9e57eed5bdb154e9dad3bc), tree는 `2f69764587c2e5fcc7d5d29991fcee3bac3bb569`다. 단일 부모는 검증한 소스 `f6739b0a…`이며, 데이터 tree에는 보관 파일만 있다. 독립 계산한 Git tree, 모든 blob·모드·크기·경로, 단일 부모와 실제 ref를 게시 후 다시 읽어 대조했다. [수동 게시·readback 영수증](eth-candidate-evidence/20261028-continuity/manual-first-publication.json)

4세대 manifest는 `267bb2e1a6768988427d2485d32964a4fcba64be5a10e42ad8b027c758ba4ee2`다. 총 53개 파일, 7,048,545바이트, 50개 논리 파일, 44개 객체를 보존한다. 모든 이전 불변 파일은 동일하며 `manifest.json` 별칭만 최신 세대를 가리킨다. Actions 산출물의 만료와 별개로 이 데이터 커밋에서 원본을 회수할 수 있다.

## 실제 예측과 아직 성숙하지 않은 결과

원래 기록 3개의 ID·발행 시각·731점·14/14/17개 모델 그래프와 원본 바이트를 모두 유지했다. 이번 실행은 새 기준일 `2026-10-27`의 adaptive·pooled·warmStart 예측 3개와 실제 관측 1개를 추가했다. 실제 발행 시각은 `2026-10-28T03:30:08.669Z`(한국시간 12:30:08.669)다. 전체 기록 6개를 같은 소스 그래프로 재실행해 모두 731점과 출력 ID가 일치했다. 보관 관측은 전향 5개와 독립 ETH 결과 1개, 합계 6개다.

보정 준비도 9개 결합은 전체 실제 원문에서 재계산한 결과가 일치했으며 모두 준비 부족이다. 성숙한 선택 결과 0, 반경 null, freeze 0, 보정 발행 0, 보정 타깃 평가 0이다. 완전한 경제 snapshot 역시 0이다. 관측을 저장했다는 사실을 성숙 표본이나 실증 예측력으로 바꾸지 않는다.

## 다음 확인과 유지되는 경계

다음 PR 실행에서는 위 데이터 커밋의 실제 Git fetch, receipt의 Git tree·전체 인벤토리 검증, 4세대 복원, 기존 6개 기록과 모든 관측의 보존, 5세대 append를 확인한다. 이 문서의 갱신 commit은 구현 소스를 변경하지 않으며 실제 실행 결과가 나온 뒤 그 소스와 결과를 별도로 기록한다.

일일 정의는 매일 01:17 UTC / 10:17 한국시간이다. Draft에 정의가 있다는 사실은 기본 브랜치의 예약 활성화나 자동 publisher 실행을 의미하지 않는다. 이번 게시도 수동 게시이며 자동 writer는 실행하지 않았다. 기존 500개 합산 관측·2,000개 기록·1 MiB 활성 인덱스 한도는 유지된다. 그 한도를 넘는 스트리밍·보정 선택, 검토된 기준 가격 갱신, 정확한 28 UTC일 공급·경제 입력, 실제 첫 12개 비중첩 성숙 창과 이후 보정 발행·평가는 계속 남는다.

[PR #39](https://github.com/twoimo/bitcoin-cycle-atlas/pull/39)는 Draft이며 `releaseAuthorized=false`, `productionPromoted=false`다. main 병합·배포·기본 모델 승격은 수행하지 않았다. Gemini 반대 검토와 후속 역검토는 기존 사용자 지시대로 `omitted-by-user`다.
