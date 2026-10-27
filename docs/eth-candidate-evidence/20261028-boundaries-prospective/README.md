# 2026-10-28 ETH 공급 경계·전향 보정 증거

핵심 구현은 `5cbd9551caeb4199ef92916a0e1c3ba50beed043`, tree `83aa847506921ea5626ffd7124e49586a9901524`다. 후속 `47f2ae587ab5fdbe25b380c6a92bf496bd3d798e`, tree `9d33dff7762f5b8a73d493e8daedacc2af74666d`는 전체 원문을 보존하기 위한 source-book의 유한 자원 한도만 64,000,000→65,000,000 bytes로 바꾼다. 이 폴더를 보존하는 문서 커밋은 두 구현 커밋과 구분한다.

- `source-publication.json`: 원격 구현의 부모·브랜치·11개 변경 Git blob.
- `budget-publication.json`: 마지막 source-book 포장 단계의 실제 크기와 별도 자원 한도 수정 커밋·Git blob. 모형·표본·정확성·릴리스 기준은 바뀌지 않았다.
- `source-preservation.json`: 시작점 704b1373과 최종 구현 47f2ae58의 전체 원격 Git tree 대조. 기존 dist 713파일·전향 원장 17파일·outcome 원장 7파일·경제 판본 51파일·기존 docs 1,233파일의 Git blob이 모두 같다.
- `local-focused.tap`: 로컬 실제 집중 검사 146 pass, 실패·skip·취소 0. 아래 세부 검사는 이 범위와 겹치므로 합산하지 않는다.
- `local-prospective-calibration-replay.json`: 보존 입력 파일 10개·세 예측의 각 731점과 ID 실제 재생. 기존 수집·발행 시각을 보존했다. 로컬 Git subprocess 제한 때문에 CLI 전체가 아닌 직접 함수 경로이며 원격 CLI 결과는 별도 영수증으로 구분한다.
- `preserved-supply-replay.json`: 이전 원문의 원래 시각으로 audit-2와 audit-3를 재생한 결과. 새로운 수집 증거로 취급하지 않는다.
- `calibration-independent-review.json`: 내부 독립 소스 검토와 변조 반례. Gemini 실행 또는 외부 모델 인증을 뜻하지 않는다.
- `refresh-fixture-before.tap`, `refresh-fixture-after.tap`, `refresh-fixture-original.tap`, `refresh-fixture-receipt.json`, `refresh-fixture.patch`: 기본 코인 anchor의 날짜만 격리 변경한 동일 조건에서 기존 세 실패를 재현하고 명시적인 고정 입력으로 교정한 증거. before의 실패는 의도된 반례다. 운영 main의 예약 갱신 재실행이 아니다.
- `ci-40535038425.json`: 실제 합성 merge checkout에서 전체 1,642 테스트와 수치·소유권 검사. decoded 로그의 해시와 정확한 줄을 보존한다.
- `hallmark-40535038343.json`: 직접 head 실행, FAIL/REFLEX 0, static36/render17 WARN 원문과 전후 80 PNG 개수 영수증. 모든 이미지의 새로운 육안 확인으로 확대하지 않는다.
- `evidence-40535038411-first-attempt.json`: 5cbd9551의 첫 ETH 실행은 기능·실제 CLI·브라우저 35/35 및 181 PNG까지 통과했지만 source-book 64,042,920 bytes / 519 entries가 64,000,000-byte 한도를 넘어서 최종 실패했다. 이 실행 전체를 성공으로 표시하지 않는다.
- `ci-40536955930.json`: 용량 교정 47f2ae58의 새 일반 CI. 실제 합성 merge e975a032에서 1,642/1,642와 수치 318,010·negative controls 16/16·별도 32/28/17 검사를 통과했다.
- `hallmark-40536955832.json`: 47f2ae58 직접 head의 새 Hallmark. FAIL/REFLEX 및 integrity 오류 0, static36/render17 WARN과 전후 80 PNG 개수 영수증을 그대로 보존한다.
- `evidence-40536955797.json`: 최종 ETH 실행 전체 성공. 집중 509/509, 실제 CLI·기존 예측 재생·브라우저 35/35와 181 PNG·source-book 포장까지 완료한 실제 단계별 영수증이다. 일반 CI와 집중 검사는 겹치므로 합산하지 않는다.
- `prospective-calibration-40536955797.json`: 실제 artifact에서 가져온 전체 report/provenance 원문. 3개 원래 예측의 각 731점·ID가 일치하며 9개 결합 모두 실제 보정 사례 부족, 반경 null, freeze·보정 발행 0이다.
- `source-manifest-40536955797.json`: 실제 artifact의 전체 manifest 원문. 376 seeds / 520 entries / 356 parts / 64,037,165 bytes, 한도 65,000,000 bytes, unresolved 0이다. 원본 generator의 generic externalReview.pending은 사용자 지시 omitted-by-user를 대체하지 않는다.
- `artifact-verification-40536955797.json`: 실제 내려받은 52,846,711-byte ZIP의 SHA-256이 GitHub digest와 같고, 전체 684개 ZIP entry CRC·356개 part 해시와 재결합·520개 framed 파일·181개 PNG 해시를 독립 확인했다. 새로운 전체 육안 검사를 주장하지 않는다.

전체 원문·브라우저 이미지·source-book은 [artifact 12748673800](https://github.com/twoimo/bitcoin-cycle-atlas/actions/runs/40536955797/artifacts/12748673800)에 있다. GitHub 표시 보존 종료는 2026-11-26T16:10:11Z, 한국 시각 **2026-11-27 01:10:11**이다. 실제 ZIP SHA-256은 `de78ccce3f29f118e16783403f40aa1807b8257fc043e349b93cde6fb96fe86a`, source-book SHA-256은 `36262e00fb4fd9fab458b9411b65ec0184841151fb3d72ac87b52c582face02c`다.

전체 decoded CI/Hallmark 로그는 원래 GitHub 실행에 있으며 이 폴더는 주요 원문 구간과 정확한 UTF-8 바이트 해시를 보존한다. ZIP 해시와 혼동하지 않는다. 실제 전향 성과 0, 경제 모형 입력 비활성, releaseAuthorized=false를 유지한다.
