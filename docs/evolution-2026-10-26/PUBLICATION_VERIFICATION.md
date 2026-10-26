# 공개 자료 묶음의 상태전이 검증

## 검증한 약속

검증한 코드 판본과 파일 묶음이 준비 단계에서도 같아야 하며, 실제 제공된 식별자가 준비한 묶음과 같을 때만 확인 완료로 전이한다. 이 약속이 깨지면 검증하지 않은 수정본이나 이전 배포물을 현재 검증 결과로 잘못 표시할 수 있다.

이번 작업은 pstack `create-formal-verification-skill`, `maintain-formal-verification-skill`, `statechart` 지침을 적용했다. 기존 시장·ETH·주식 요청 소유권 모델을 유지하고, 새로 추가한 발행 계약에 별도의 작은 모델을 만들었다. pstack 원본은 `cursor/plugins`의 `99b609a72323b70204eab407c622f436e858e112` 판본이다.

## 실제 코드와 대응

| 동작 | 실제 함수 | 확인 사항 |
| --- | --- | --- |
| 후보 수집 | `createPublication` | 40자리 커밋과 64자리 내용 해시 |
| 내용 확인 | `validatePublication` | 수집 상태, 검증 성공, 같은 내용 해시 |
| 준비 | `preparePublication` | 검증 상태, 동일 커밋, 동일 파일 및 검증 해시 |
| 공개 응답 확인 | `confirmPublication` | 준비 상태, 동일 공개 커밋과 파일 해시 |

구현은 `dist/publication-contract.js`의 동기 순수 함수다. `scripts/build-publication.mjs`가 실제 디렉터리의 파일별 바이트·SHA-256·전체 inventory를 수집하고 재대조한다. 추가 파일, 누락 파일, 다른 바이트, 잘못된 명세 상태, 디렉터리 밖으로 나가는 경로를 거부한다. 로컬 수정본의 `--preview` 명세는 공개된 커밋의 배포로 확인할 수 없다.

자료 검증과 모델·수치·정적 검증의 실행 순서는 워크플로가 책임진다. TLA 모델의 검증 결과 입력 자체가 모든 외부 데이터 계약을 증명하는 것은 아니다. 공급원 수집시각과 작업의 갱신 시도시각을 구분하고, 모르는 공개시각은 `null`로 남긴다.

## 도구와 경계

TLC 1.7.4를 사용했다. JAR의 SHA-256은 `936a262061c914694dfd669a543be24573c45d5aa0ff20a8b96b23d01e050e88`이다. 실행 명령은 다음과 같다.

```sh
node scripts/verify-publication-state.mjs
node --test tests/publication-contract.test.mjs tests/publication-manifest.test.mjs
```

모델은 후보 1개, 코드·내용 식별자 각각 2종, 초기화 전 표시값 1종을 사용한다. 정상 모델은 생성 상태 25개, 고유 상태 20개를 끝까지 탐색했다. pstack이 그 상태 그래프를 12개 표시 상태·20개 표시 전이로 묶어 그렸다. 표시된 선은 계산 결과에서 생성했으며 손으로 그린 정상 경로가 아니다.

코드·파일 변경은 준비 직전까지 모델에 들어간다. 준비 이후의 동시 작업, 원격 배포의 원자성, 파일 시스템 트랜잭션, GitHub 예약 실행 순서, 재시도·가용성·암호학적 발행자 인증은 범위 밖이다. 원격 main 검사와 실제 HTTP 본문 검사는 별도 운영 보호다. 가격 예측의 정확도도 이 검증에서 다루지 않는다.

## 반례와 실제 구현의 실패 확인

| 제거한 보호 | 모델의 반례 | 실제 코드 검사 |
| --- | --- | --- |
| 준비 직전 커밋 일치 | 검증 후 코드 변경 → 이전 후보가 준비됨 | `source change supersedes` assertion 실패 |
| 준비 직전 파일 일치 | 검증 후 파일 변경 → 변경 파일이 준비됨 | `changed files cannot pass` assertion 실패 |
| 공개 응답 일치 | 다른 응답 → 확인 완료로 오인 | `a successful deploy API result` assertion 실패 |

정상 실제 코드의 이름 있는 테스트 5개가 통과했다. 임시 복사본에서 위 세 보호를 하나씩 제거했을 때 각각 대응 assertion이 실패했고, 원래 복사본으로 복원하면 5개가 다시 통과했다. 제품 파일은 이 실험에서 수정하지 않는다. 임의로 만든 잘못된 모델이 실패했다는 사실만으로 구현 검증을 대신하지 않는다.

세 가드 제거는 검증 능력을 확인하는 의도적 변형이다. 운영에서 세 배포 사고가 있었다고 주장하지 않는다. 별도로 교차 검토에서 발견한 실제 경계 결함은 완료 이전 수집시각 허용, 명세에 없는 추가 파일 누락, 명세 상태와 식별자 불일치 허용이었다. 각각 실제 회귀 검사로 고쳤다.

## 산출물

- [정상 상태 그래프](publication-statechart/chart.png), [Mermaid 원본](publication-statechart/chart.mmd), [기계 판독 요약](publication-statechart/summary.json).
- [코드 변경 보호 제거](publication-stale-source/chart.png), [파일 변경 보호 제거](publication-changed-files/chart.png), [공개 응답 보호 제거](publication-served-mismatch/chart.png).
- [TLC·실제 소스 변형 검증 기록](publication-state.json).
- 프로젝트의 `verify-publication-state` 스킬은 동기화 커밋, 소스 해시, 대응 코드, 재실행과 검증 유지 절차를 함께 보존한다. 코드를 바꾼 뒤에는 pstack `maintain-formal-verification-skill`로 대응이 유지되는지 확인한다.

실제 공개 확인은 준비한 명세 해시와 커밋, `index.html`, `site-entry.js`, BTC 관측 파일, 예측 원장 인덱스의 HTTP 본문을 대조한다. 원격의 모든 파일을 다시 내려받았다는 뜻은 아니다. 로컬 준비·검사에서는 전체 공개 디렉터리를 대조한다.
