# WP-A 컨퍼런스 복습 페이지 — 자동화 가능분 실측 (2026-11-11 KST)

이 문서는 WP-A에서 **사람 없이 실행할 수 있는 부분만** 실행한 영수증이다. 결론은 `mediaPrepared:false` 유지다. 페이지 렌더(WebP 547장)·오디오 변환은 이번에 새로 수행하지 않았고, 이미 만들어진 오디오 16파일을 원본·매니페스트와 다시 대조했다. 직접 청취·동기화 10지점·시각 검수·배포 패키지 검증은 사람 또는 별도 배포 환경의 몫으로 남긴다.

## 1. 입력 위치

원본 프로젝트는 이 저장소 밖에 있다: `/Users/twoimo/Documents/projects/plspo-conference-20261031`. 아래 경로는 모두 그 루트 기준 상대 경로다.

| 역할 | 경로 | 바이트 | SHA-256 | 확인 |
|---|---|---|---|---|
| 최종본 PDF(290쪽) | `00_열람/플스포_강연자료_최종.pdf` | 63,311,016 | `4b1affb46789400a4079743bb8f5b29bfbdcc4aa36544f4a43c3c7516dbd24db` | 요청서 접두사 `4b1affb46789400a`와 일치 |
| R17 원본 PDF(257쪽) | `편집형슬라이드_재구성_R17_20261104/결과물/플스포_강연자료_R17.pdf` | 110,858,734 (105.72 MiB) | `530b4b3851b46e2c1bb74191e2ed0c2af448cdcd8361550f376d03413b33e62e` | 요청서 접두사 `530b4b3851b46e2c`와 일치 |
| R17 깔끔본 PDF(257쪽) | `깔끔본_R17_로고_20261109/플스포_강연자료_최종본_깔끔본_20261110.pdf` | 20,233,799 (19.30 MiB) | `3760cd72c04c4625750f3fe80b0b28cc666fe9a0b9a8467823750c30b87c873e` | 요청서 접두사 `baa2224e469cd2d2`와 **불일치** |
| 오디오 원본 1 | `RAW/audio/plaud_conf2026_1_of_2_1233-1733_5h00m.mp3` | 72,000,800 | `816e26250f012e5b92bea16379b108a5e3b665e582fc5034a4f6899afad0597d` | 요청서·매니페스트와 일치 |
| 오디오 원본 2 | `RAW/audio/plaud_conf2026_2_of_2_1733-1813_40m.mp3` | 9,603,152 | `cadc5e3abcfd6ec2ebcaa4c1c1649b3481eba36f2da60859e2ccc2c224145aff` | 요청서·매니페스트와 일치 |
| SRT 1 | `원문전수보존_R12_20261103/원문전사/정본_작업판/plaud1_1233-1733_5h.srt` | 485,003 | `90544fc7481d1445b667e858ce19379fbbdbbc1f207a932f296de7a188a8259c` | 요청서 접두사 일치 |
| SRT 2 | `원문전수보존_R12_20261103/원문전사/정본_작업판/plaud2_1733-1813_40m.srt` | 75,582 | `78647f0ded22969fd66cac7fddafaa057d7edf957db5d08b5c6b7c74216d8976` | 요청서 접두사 일치 |
| 대체 녹음(미사용) | `RAW/audio/tiro_conf2026_full_5h00m_Shm8yrDMEvNQn.wav` | 576,778,572 | `f3cbbc7185106c9b0ea8568226d2fbef9cf22aa390549ce0d7e35e8a43690974` | 계약 입력 아님(참고) |
| 최종본 PPTX(선택) | `00_열람/플스포_강연자료_최종.pptx` | 75,209,904 | `30dac26b3895629e24e6c60c6d2b389acd61caee4c179099e5d8e18e760b0e94` | PDF 기반 렌더의 필수 입력 아님 |
| 깔끔본 PPTX(선택) | `깔끔본_R17_로고_20261109/플스포_강연자료_최종본_깔끔본_20261110.pptx` | 74,586,163 | `43fb4f2dbf996f0b1c478675fe19a3e9fe1bbf949ba738b46f260ef61d4cdb39` | 위와 같음 |

## 2. PDF 페이지 실측 — 547 = 290 + 257

측정 도구는 Poppler `pdfinfo` 26.10.0(`/Users/twoimo/.aside/runtime/bin/pdfinfo`)이다. 이 값은 렌더 결과가 아니라 **PDF 페이지 객체 수**다.

| 파일 | `Pages` | 계약 위치 | 290+257 합계 기여 |
|---|---|---|---|
| `00_열람/플스포_강연자료_최종.pdf` | **290** | `decks[0]` `final-290` | 290 |
| `편집형슬라이드_재구성_R17_20261104/결과물/플스포_강연자료_R17.pdf` | **257** | `decks[1]` `r17-257` (variant `original` 후보) | 257 |
| `깔끔본_R17_로고_20261109/플스포_강연자료_최종본_깔끔본_20261110.pdf` | **257** | `decks[1]` `r17-257` (variant `clean` 후보) | 257 |

- **290 + 257 = 547**. `prepare-media.py`의 `plannedPages: 547`과 매니페스트의 `len(assets) == 547 + len(audio)` 요구를 페이지 수준에서 충족한다.
- 원본·깔끔본 두 후보 모두 257쪽이므로, §7-1의 변형 선택은 페이지 수를 바꾸지 않는다. 바뀌는 것은 바이트·해시·시각 결과다.
- 이름이 비슷한 다른 PDF를 `decks[1]`로 쓰면 합계가 깨진다. `정밀원근_녹음대조_R11_20261103/결과물/플스포_강연자료_최종.pdf`는 SHA-256 `46ab10ff6b1052cd5feb453685ed3ece562ff48441c7a325eaa0c905a401229a`이고 **290쪽**이다(257쪽 R17이 아니다. 이 파일을 넣으면 580쪽이 된다). `R18_가독성교정_20261104/결과물/플스포_강연자료_R18_257쪽_검토본.pdf`는 257쪽이지만 SHA-256 `01ab74303c2dc061a22092269ee8369a887b0356238b6811b0cd20da7b662e16`으로 요청서 접두사와 다르다.

## 3. 오디오 16파일 재검증

2026-11-10 산출물 `wpa-audio-only-unreviewed-20261110.zip`(SHA-256 `bda4a81215ebff2b5ea1f3003bf6f9493b1bba4232e5b6057aa58ce37b9f1020`)을 풀어 매니페스트와 대조했다.

- `assets[]` 16건 전부 `sha256`·`sizeBytes` 일치(16/16, 불일치 0).
- `inputs[]` 2건의 해시가 위 표의 원본 MP3 해시와 일치하고, 원본 바이트 수도 `sizeBytes`와 같다.
- `audio[]` 15세션·물리 16파일, 세션 커버리지 0–20,400초 연속. 최대 파일 14,969,620 B < 25 MiB.
- `verification.audioPrepared:true`, `mediaPrepared:false`, `listeningReview:"pending"` 유지.

이 재검증은 **파일 동일성**만 증명한다. 발화 내용·동기화·잡음은 확인하지 않았다.

## 4. Linux `renameat2(RENAME_NOREPLACE)` 원자 게시 — Docker 실측

macOS는 이 게시 경로를 거부하므로 Linux 컨테이너에서 실행했다.

- 이미지: `python:3.12-slim`(digest `sha256:5e2bdb1b0d542d5039cffb8181c65930093949194a65c365dfb1b0fe13a4fa5b`), Linux aarch64, Python 3.12.16.
- 대상 스크립트: 커밋 `7064d25`의 `scripts/conference/prepare-media.py`, SHA-256 `a1e310f2cfcbfa729db94190e600232f8e4b8f86a197231f44b8ea222f448ab6`. 컨테이너에는 읽기 전용으로 마운트했다.
- `libc.renameat2` 심볼 존재: true.

| 케이스 | 실행 | 결과 |
|---|---|---|
| 신규 게시 | staging → `published/` | 게시됨, 파일 4개, staging 제거, inode 보존 |
| 기존 출력 사전 거부 | `validate_output_path(published)` | `MediaError` "output already exists; refusing to overwrite any prior build", 기존 내용 무손상 |
| 경합(검증 후 rival이 출력 생성) | `publish_directory(staging, rival_output)` | `MediaError` "output appeared during build; existing directory preserved", rival 내용 `theirs` 보존, 우리 staging 보존 |
| 커널 syscall 직접 호출 | 두 번째 `renameat2(..., RENAME_NOREPLACE)` | 반환 -1, `errno` 17 `EEXIST` |

즉 계약이 주장한 "덮어쓰기 없는 원자 게시"는 Linux 커널 수준에서 확인됐다. macOS/Windows에서는 이 함수가 플랫폼 검사에서 거부되므로 게시가 불가능하고, 그것은 계약대로다.

## 5. 남은 것 — 자동화로 닫히지 않는 항목

- 실제 오디오 **직접 청취·동기화 10지점**: 미수행. 파일 해시와 길이만 확인했다.
- 547장 WebP 렌더와 시각 검수: 미수행. 이번에는 PDF 페이지 수만 셌다.
- 배포 패키지 전체 자산 수(`existingAssetCount`·`plannedTotalAssetCount`)·최대 파일 크기: 미검증.
- Range/206 운영 응답, 세션 경계 지속 재생: 미검증.
- `timeline.json`·9169행 자막·프로그램 매핑: 입력·결정 대기.
- §7-1 R17 변형 선택: 미결정. 깔끔본 접두사 불일치(`baa2224e…` ↔ 실측 `3760cd72…`)를 함께 확정해야 한다.

## 6. 재현 명령

```sh
# PDF 페이지 수
/Users/twoimo/.aside/runtime/bin/pdfinfo "<pdf>" | grep '^Pages'

# 원본·산출물 해시
shasum -a 256 "<file>"

# Linux 원자 게시(호스트에 Python/Pillow 불필요, 표준 라이브러리만 사용)
docker run --rm -v "$PWD/scripts/conference:/w:ro" python:3.12-slim \
  python3 -c 'import runpy; m=runpy.run_path("/w/prepare-media.py"); print(m["publish_directory"])'
```

`mediaPrepared:false`는 그대로다. 이 문서의 어떤 수치도 청취·시각 검수나 배포 승인을 대체하지 않는다.
