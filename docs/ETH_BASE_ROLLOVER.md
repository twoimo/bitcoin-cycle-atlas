# 보존 원문으로 ETH 기준 가격 교체 후보 만들기

기준 가격 파일이 오래되면 전향 수집기의 단일 요청이 290일 범위를 넘습니다. 다음 명령은 이미 검증해 보존한 snapshot의 원문을 재생하여 검토 가능한 새 기준 가격 후보를 만듭니다.

```sh
node scripts/prepare-ethereum-base-rollover.mjs --snapshot research-data/ethereum-prospective-ledger/snapshots/bda159c9e30ad2f8977969d6d5f589d31cbbf60d904866807ab7216e3d023a59.json
```

다른 실행에서 보존한 snapshot도 `--snapshot`으로 지정할 수 있습니다. 입력 파일과 그 경로는 심볼릭 링크를 통과하지 않아야 합니다. 실제 수집 시각이 실행 시각보다 미래이거나 원본 재생 검증에 실패하면 후보를 만들지 않습니다.

## 생성한 두 파일 확인하기

결과는 `build/ethereum-base-rollover/<snapshot-id>/`에 저장됩니다.

- `candidate.json`은 기존 기준 파일과 보존된 Coinbase 응답을 재생한 전체 가격 아카이브입니다.
- `receipt.json`은 snapshot ID, 기존 base commit과 Git blob, 원문 해시, 수집 시각, 후보 해시, 일봉 변경 내역과 요청 가능 기한을 기록합니다.

두 파일은 임시 디렉터리에서 완성·대조한 뒤 함께 공개됩니다. 동일 입력의 재실행은 같은 바이트를 재사용합니다. 이미 저장된 파일이 다르거나 일부만 존재하면 덮어쓰거나 보완하지 않고 실패합니다. 후보 경로에 입력 snapshot을 넣어 자신의 원본을 교체하는 동작도 거부합니다.

## 변경 내역 검토하기

`changes`에서 새 일봉, 값이 달라진 재수집 일봉, 값은 같고 수집 시각만 갱신된 일봉을 확인합니다. 응답 범위보다 오래된 일봉은 OHLCV와 기존의 유효 수집 시각이 그대로여야 합니다. 기존 역사적 결측은 유지하며 보간하지 않습니다. 기록된 전체 종가가 snapshot의 `primaryPrices`와 일치해야 후보가 만들어집니다.

`capacity.previous`와 `capacity.candidate`에서 마지막 허용 요청 날짜와 첫 거부 날짜를 비교합니다. 생성기는 두 경계를 기존 `planEthereumResearchPriceRequest()`에 실제 입력해 대조합니다. 7일 중첩, 290일 요청 범위, 300봉, 2 MiB 응답, 30초 수집, 4 MiB 기준 파일 한도는 유지합니다. 후보로 연장되는 기한은 추가한 관측 일수에 따라 달라집니다.

일봉 외의 `intervals`는 기존 값을 보존합니다. 이 후보 생성은 분봉·주봉 원문을 새로 수집한 작업이 아닙니다. 원본의 해시와 재생 일치는 공급원의 역사적 공개 시점이나 진위를 독립 인증하지 않습니다.

## 검토한 후보를 이후 작업에 연결하기

후보는 운영 `dist/data/eth-ohlc.json`이나 기존 예측·관측 원장을 바꾸지 않습니다. 후보를 검토하고 기준 파일 교체를 별도 커밋한 뒤에야 기존 committed-base reader가 그 정확한 Git blob을 소비할 수 있습니다. 원래 발행본은 자신이 보존한 base와 tail을 계속 사용합니다.

기준 파일의 해시가 달라지면 같은 기준일에서도 새 입력 판본이 될 수 있습니다. 기존 예측 ID나 발행 시각을 덮어쓰지 않습니다. 이 명령은 새 예측, 새 관측, 보정 사례를 발행하지 않으며 `releaseAuthorized=false`와 `productionPromoted=false`를 유지합니다.

관측 500개·기록 2,000개·활성 인덱스 1 MiB를 넘는 원장 분할·스트리밍, 실제 일일 운영, 26개 경제 입력과 성숙한 전향 보정 사례는 별도 후속 조건입니다. 전체 상태는 [ETH 남은 조건](ETH_REMAINING_CONDITIONS.md)을 확인합니다.

## 재검증하기

```sh
node --test tests/ethereum-base-rollover.test.mjs
node scripts/issue-ethereum-prospective.mjs --verify-preserved-only --include-warm-start
```

첫 검사는 실제 seed의 전체 종가, 역사적 결측과 변경 경계를 검사합니다. 합성 사례로 변조·미완성 봉·기한·충돌·동시 실행·경로 이탈을 검증합니다. 두 번째 명령은 기존 세 모형을 각각 자신의 보존 입력으로 다시 실행하여 원래 출력과 대조합니다.
