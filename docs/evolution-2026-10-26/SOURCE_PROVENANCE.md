# 원본 생성 커밋과 공개 커밋

최초 예측 기록5개는 로컬 Git 커밋 `ba28c25a0580890636d7b97d00183ef671174d0a`의 실제 모델로 생성했습니다. 형식 검증과 브라우저 측정은 `7261c1807028e1b69bf9cd9be0d269a64f88acc0` 및 각 보고서의 정확한 파일 해시에 연결됩니다. 생성 당시의 원본 커밋·시각·입력·출력은 이후 공개 방식 때문에 다시 쓰지 않습니다.

이 작업 환경에는 native Git push 인증 정보가 없어 연결된 GitHub 앱의 Git object API로 공개 파일 트리를 게시합니다. 이 API는 기존 로컬 커밋의 author·committer 시각을 지정하는 기능을 제공하지 않으므로 공개 커밋 ID는 원본 ID와 다릅니다. 같은 파일 트리와 다른 커밋 객체를 구분하며, 존재하지 않는 GitHub 커밋 링크를 만들지 않습니다. 공개 묶음의 `publication.json`에는 실제 GitHub checkout 커밋이 기록됩니다.

## 원본 Git 객체 보존

[증분 Git bundle](local-source-18da0638.bundle)은 생성·검증 당시의 원본 커밋, 부모 관계와 파일 바이트를 그대로 보존합니다. 새 권한이나 자동 실행 코드를 포함한 가져오기 워크플로를 만들지 않습니다. bundle은 읽어서 검증하는 Git 자료이며 실행 파일이 아닙니다.

- 크기: **2,051,365바이트**
- SHA-256: `18da06381c8d84c4249fdcceed5a8fe5dcb114fd77ee06b20c6edec80894a00f`
- 보존 HEAD: `7261c1807028e1b69bf9cd9be0d269a64f88acc0`
- 필요한 기존 공개 커밋: `1fbcc9fdcac0fd53ca09d1c4d2a7e64461238850`, `26f6941a51281f00a136e96f29ce3796357a40cb`, `35300332a629ead03f6f365a32fda4669390f72f`

전체 이력으로 복제한 저장소에서 다음과 같이 원본 객체를 별도의 검토 ref로 가져올 수 있습니다. 작업 브랜치나 파일을 덮어쓰지 않습니다.

```sh
sha256sum docs/evolution-2026-10-26/local-source-18da0638.bundle
git bundle verify docs/evolution-2026-10-26/local-source-18da0638.bundle
git fetch docs/evolution-2026-10-26/local-source-18da0638.bundle HEAD:refs/verification/evolution-original
git rev-parse ba28c25a0580890636d7b97d00183ef671174d0a^{commit}
git rev-parse 7261c1807028e1b69bf9cd9be0d269a64f88acc0^{commit}
git show ba28c25a0580890636d7b97d00183ef671174d0a:dist/long-horizon-forecast.js
```

공개 main의 기존 이력만 가져온 별도 빈 저장소에서 원래 커밋이 없는지 먼저 확인하고, bundle을 가져와 모든 예측 모델 의존 파일의 SHA-256을 보존 기록의 `model.files`와 대조했습니다. 원본 생성 커밋과 보존 HEAD를 복원했고 모든 파일이 일치했습니다. 소스 패키지 ZIP에도 이 bundle과 설명이 포함됩니다.

원장의 기록 JSON은 `model.sourceCommit`, 모델 파일별 해시, 전체 `sourceHash`, 입력 스냅샷 해시와 출력 해시를 그대로 제공합니다. 이 식별은 실제 생성 소스의 재현성을 위한 것입니다. 당시 공개 배포 완료나 예측 성능을 뜻하지 않습니다. 이후 GitHub 예약 작업이 새 기록을 생성하면 해당 작업의 실제 checkout 커밋이 그대로 사용됩니다.
