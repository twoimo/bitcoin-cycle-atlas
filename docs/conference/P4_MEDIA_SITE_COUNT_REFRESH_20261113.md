# P4 실미디어 사이트 파일 수 재산출

기준: `a80882e7baf1387ac10bbb1fc2cdfea89d918956`. 이번 범위는 기존 ready 매니페스트의 사이트 파일 수를 현재 dist 기준으로 다시 산출하는 것뿐이다. 장표 폭 수정 Q-P4-1의 Mac 14/14는 보존한다. 실미디어 20/20이나 P4 완료를 새로 주장하지 않는다.

## 확인된 원인과 수치

옛 ready 매니페스트는 `97154333e039b97c8eadd1864edba743b58323a2`의 추적 dist 968개에서 매니페스트 1개를 제외한 967개를 유지 파일로 기록했다. 이후 추가 193개·삭제 2개로 유지 경로가 191개 늘었다. 현재 Git 추적 dist는 1159개이며, 기존 준비 파이프라인의 `createConferenceMediaPlan()`과 `countRetainedSiteFiles()`로 다시 계산한 값은 다음과 같다.

| 항목 | 이전 | 현재 재산출 |
|---|---:|---:|
| `existingSiteFileCount` | 967 | **1158** |
| 페이지 + 오디오 | 547 + 15 | **547 + 15 = 562** |
| ready 매니페스트 | 1 | **1** |
| `siteFileCount` | 1530 | **1721** |

추가 경로는 `fonts/pretendard` 95개, `market-lab/app` 94개, `chart-chrome.css`·`ui/chart-colors.js`·`ui/theme.js`·`ui/shell-layout.css`다. 삭제 경로는 `market-lab/app/assets/index-ByyNTPeH.js`와 `index-GpQviUwB.css`다. 폰트나 market-lab을 제거하지 않는다. [전체 경로 차이](../evidence/p4-media-site-count/path-delta.json).

사용자 Mac의 정본 dist와 `build/r19-p4-media-site-fcb941d`는 이미 각각 **1721개**이고, 실자산 562개가 존재하며 이전 해시 검사도 562/562였다. 이 작업 환경의 새 Git 사본에는 추적 파일 **1159개**만 있다. Mac의 ready 매니페스트와 실자산 경로에 직접 접근하지 못했으므로, 아래 실제 갱신 실행은 이 환경에서 수행하지 않았다. 설치 누락을 원인으로 판단하거나 Mac 관측 1721을 새 독립 실측으로 표시하지 않는다.

## 기존 파이프라인을 재사용하는 준비 명령

새 `scripts/refresh-conference-media-site.mjs`는 기존 `countRetainedSiteFiles()`와 `inspectInstalledConferenceMedia()`를 그대로 가져온다. 원래 생성기 파일은 ready 매니페스트에 해시가 고정되어 있으므로 변경하지 않았다. 렌더러·기존 `--check`·브라우저 검사기도 그대로다.

다음 명령은 **이미 미디어가 설치된 격리 사본의 ready 매니페스트만** 갱신한다. 원래 `build/p1c-media-20261112` 렌더 패키지는 건드리지 않는다. 정본 `dist/conference/media-manifest.json`과 양쪽의 기존 pages/audio는 보존한다. 실제 명령의 입력 자산은 Mac에 있는 원래 562개이며, 단위 테스트의 작은 픽스처를 설치하지 않는다.

```sh
node scripts/refresh-conference-media-site.mjs \
  --site-dist dist \
  --dist build/r19-p4-media-site-fcb941d \
  --out build/r19-p4-media-site-count/refresh-receipt.json
```

`--out`은 사이트 바깥의 새 파일이어야 한다. 같은 영수증이 이미 있다면 새 이름을 사용하거나 `--out`을 생략한다. stdout에도 결과가 출력된다. 파일 수가 이미 맞는 재실행은 `mode:"unchanged"`이며 ready 매니페스트와 자산을 다시 쓰지 않는다.

명령은 순서대로 다음을 확인한다.

1. 기존 ready 매니페스트의 스키마와 **모든 실제 자산 해시**를 원래 preflight로 검사한다. 준비 단계에서 수정할 수 있는 오류는 `site_file_count` 하나뿐이며, 이 기존 오류를 통과로 세지 않는다. 누락·변조·추가 미디어·심볼릭 링크 등 다른 오류가 있으면 쓰기 전에 중단한다.
2. 현재 정본과 격리 사본의 타임라인 바이트, 교체 미디어를 제외한 유지 경로 집합을 비교한다. 현재 사이트 인벤토리로 두 파일 수를 산출하고, 격리 사본의 실제 전체 파일 수와 일치하는지 쓰기 전에 확인한다.
3. `totals.existingSiteFileCount`와 `totals.siteFileCount`만 바꾼다. 렌더 도구체인·입력·자산 해시·설정·검수 pending·나머지 필드는 보존한다. 임시 파일과 영수증은 계수 대상 밖에 둔다. 정본을 대상으로 지정하면 거부한다.
4. 원래 preflight를 다시 실행해 `observedSiteFileCount === manifest.totals.siteFileCount`를 그대로 만족해야 성공한다. 게시 뒤 검사 실패 시 이 실행이 쓴 매니페스트 바이트가 그대로인 경우에만 이전 ready 매니페스트를 복원한다.

현재 Mac 경로에서 기대하는 성공 출력은 `existingSiteFileCount:1158`, `siteFileCount:1721`, `observedSiteFileCount:1721`, `verifiedAssetCount:562`, `preflightPassed:true`다. **실행 전의 기대값이며 이번 환경에서 실제 갱신 성공을 관측한 값은 아니다.** 브라우저는 이 명령에 없고, 실제 값이 맞기 전에는 실미디어 브라우저를 시작하지 않는다.

## 검증과 보존

기존 매니페스트·전달·브라우저 계약 검사와 새 준비 명령 검사는 **76/76, 실패 0, skip 0**이다. 새 23개 검사는 두 필드만 변경, 자산 바이트·inode·mtime 보존, 반복 실행, 잘못된 파일·경로·정본 대상 거부와 수정 뒤에도 추가 파일을 원래 동등 검사가 거부하는 것을 확인한다. 이는 작은 식별자 검사 픽스처이며 실자산 562/562나 브라우저 20/20을 대신하지 않는다.

제품 dist 변경 0. 보호 4파일·가격 축·정본 unavailable 매니페스트·원래 생성기·렌더러·검사기는 기준과 바이트 동일하다. 기존 1530 렌더 영수증은 당시 기록으로 보존한다. main push·배포·force push·P2b·P5·D-1~D-8은 수행하지 않았다. [재산출·실행 한계·해시·검사 기록](../evidence/p4-media-site-count/summary.json).

## Mac 실행 (2026-11-13 12:00 KST)

위 문단의 미실행은 Pro 작업 환경의 기록이다. 같은 명령을 이 Mac의 격리 사본에 실행했다. mode는 `refreshed`, existingSiteFileCount 1158, siteFileCount 1721, observedSiteFileCount 1721, verifiedAssetCount 562, preflightPassed true, mediaBytesChanged 0이다. 정본 `dist/conference/media-manifest.json`은 `ff3e3f2b…` 167바이트로 불변이다. 이어서 실미디어 브라우저는 20/20, 실패 0, exit 0이다. [Mac 영수증](../evidence/ui-renewal-p4/mac-media-549616f.md).
