# R12 검증 증거

검사한 로컬 커밋은 `4cc98d8195707ab69e534236bf2ed7fa22819327`이고, GitHub 브랜치에 전달한 소스 커밋은 `a6bf961b3e62af45e57b6b74662158626cfa7fa2`이다. 작성자·시각 메타데이터가 달라 커밋 SHA는 다르지만 두 커밋의 **전체 Git tree는 `0e79b0fa76d7e50f8187fc9944dec10493438cc1`로 같다.** 원본 보고서의 testedHead/sourceCommit 값은 실제 검사한 로컬 SHA 그대로 보존했다.

- [소스 전달 및 tree 일치 기록](source-publication.json)
- [원래 검사 커밋을 보존한 Git bundle](tested-source.bundle)
- [bundle 검증 결과](tested-source-bundle-verification.json)
- [실제 결과 요약](summary.json)
- [WP6 전체 재실행 후 수용 판정](acceptance-after-wp6-retry.json)
- [파일 해시 manifest](manifest.json)
- [스크린샷 검증 목록](screenshot-inventory.json)

최초 전체 순차 실행과 R10 묶음의 원본 상태는 **failed**다. 최초 WP6는 29/30이며 BTC 1920×1080에서 Runtime.evaluate 제한시간을 넘었다. 나머지 원래 검사들은 통과했고, WP6만 같은 소스·하네스·제한시간으로 **전체 30개를 별도 재실행해 30/30**을 확인했다. 최종 WP6 수치는 `wp6-retry/`의 완결된 실행 하나만 사용한다. 29개와 재시도 일부를 합산하지 않으며, 최초 실패 보고서·로그·실패 PNG도 그대로 보존한다.

`git bundle verify tested-source.bundle`와 `git bundle list-heads tested-source.bundle`를 기존 저장소에서 실행해 보존된 HEAD를 확인할 수 있다. 후속 증거 전용 커밋은 이 검사 소스로 소급해 기록하지 않는다.

압축 파일은 원래 보고서·로그의 바이트를 그대로 gzip한 것이다. `interrupted-d398/`는 51/53 관측 후 중단된 별도 실행이며, `controlled-notice-ab-initial-footer-rounding/`는 최초 진단 실패를 보존한다. 최종 결과와 합산하지 않는다.

반복되는 수치 모델 다운로드 payload는 포함하지 않았다. [다운로드 목록](download-inventory.json)에 원래 경로·바이트 수·SHA256을 보존했으며, 해당 다운로드를 검증한 전체 브라우저 보고서와 로그는 포함한다.

후속 macOS 독립 영수증은 [별도 원본](../chart-h1-20261112/r12-macos/contract-report.json.gz)에 있다. 기존 15/15·보충 9/9는 통과했지만 조상 변경 복원 1건 때문에 전체 status는 failed다. 이 묶음의 수용 판정은 직접 실행한 Linux 결과에 한정하며, macOS 전체 통과를 뜻하지 않는다. 자세한 구분은 summary.json의 externalMacOSReceipt와 최종 보고서에 있다.
