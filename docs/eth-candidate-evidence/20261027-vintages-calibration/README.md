# 공급·경제 판본·보정 후속의 실제 증거

검증 소스는 첫 구현 `ccac8d10dfdc76f618d906d3c3fe4a4d69d7d173`과 보존·교정 `c73b17b29809961dab7e9337482e22da28789c81`다. [전체 해석](../../ETH_VINTAGES_SUPPLY_AND_CALIBRATION_20261027.md)을 함께 읽는다.

## 원문과 검증 범위

- `first-run/`: 첫 실제 경제 원장·coverage·보정·readiness·공급 수집 실패 영수증·공급 JSON 원문·source manifest·CI·Hallmark 원문을 보존한다. `supply-accounting-corrected-local-replay.json`은 교정 코드로 첫 원문을 재생한 결과이며, 첫 실패의 소급 성공 표기가 아니다.
- `final-run/`: 교정 코드의 새 실제 수집·성공한 공급 감사·보정·native·source manifest와 원문 검증을 보존한다. 53개 Hallmark WARN을 삭제하거나 waiver로 바꾸지 않았다.
- `final-run/economic-vintage-ledger/`: 최종 6개 record와 index는 실제 artifact bytes다. `files.json`의 `.location`만 현재 보존 경로로 바꿨다. 모든 원문·영수증의 logical path/hash/bytes는 그대로이며 112개 입력의 원문 재생이 가능하다. 실행용 최초 bootstrap 3개는 `research-data/ethereum-economic-vintages/`에 그대로 있다.
- `vintage-immutability-and-cutoff-proof.json`, `vintage-preservation-and-replay.json`: 원래3record·bootstrap51파일·6값판본 및 cutoff 전후의 실제 선택 검증이다. CI의 원본 receipt와 로컬 추가 보존 검증을 구분한다.
- `supply-independent-verification.json`: 임의정밀 정수로 재계산한225개 구성·224개 잔액 정산, source hashes, 원문/receipt/observation 전체 대조다.
- `calibration-and-frozen-record-verification.json`: 첫 실행과 최종 실행 결과의 정확한 일치, 원래 세 발행본과 그래프·시각·731점의 보존 검증이다.
- source-book의 각 part와 전체 SHA, 실제 Git blob375개, PNG181개는 `preservation-verification.json`과 `sourcebook-git-verification.json`에서 검증했다. 큰 source-book·PNG 전체는 해당 Actions artifact에 있으며, 원문 입력·실행 산출물·소스 hash는 이 저장소의 보존 경로와 manifest로 연결한다.
- 방법론 웹페이지는 원래 URL·수집 bytes/SHA로 식별한다. 전체 HTML 본문을 이 문서 폴더에 재게시하지 않는다. 순수 수치 API JSON, CC0 EIP 원문, 원래 라이선스·attribution이 연결된 Coin Metrics 자료는 각각의 범위를 유지한다.

## 실제 실행

| 실행 | 첫 구현 | 보존·교정 |
|---|---|---|
| 일반 CI | [40500039046](https://github.com/twoimo/bitcoin-cycle-atlas/actions/runs/40500039046) | [40518730874](https://github.com/twoimo/bitcoin-cycle-atlas/actions/runs/40518730874) |
| ETH evidence | [40500039083](https://github.com/twoimo/bitcoin-cycle-atlas/actions/runs/40500039083) | [40518730718](https://github.com/twoimo/bitcoin-cycle-atlas/actions/runs/40518730718) |
| Hallmark | [40500038896](https://github.com/twoimo/bitcoin-cycle-atlas/actions/runs/40500038896) | [40518730771](https://github.com/twoimo/bitcoin-cycle-atlas/actions/runs/40518730771) |

일반 CI의 합성 merge와 직접 head evidence를 구분한다. 첫 원문 공급 감사는 실패했고 최종 교정 감사는 성공했다. workflow success가 전체 경제 snapshot 준비를 뜻하지 않는다. 공개 시각·역사적 가용 판본·정규 상태·26개 입력·성숙한 전향 성과는 별도 조건이다. 사용자가 생략한 Gemini/역검토는 omitted-by-user이고 Draft/releaseAuthorized=false를 유지한다.
