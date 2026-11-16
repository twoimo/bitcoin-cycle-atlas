# 요구사항 — 릴레이 콘텐츠를 Telegram Web UI로 클론

작성 2026-11-12. 상태: **요구사항 기록·구현 전**. 대상 `twoimo/bitcoin-cycle-atlas`.
사용자 지시(2026-11-12): `?page=outlook&center=relay`가 릴레이 콘텐츠 페이지이니, `https://web.telegram.org/k/`의 UI/UX를 clone-website 방식으로 릴레이 콘텐츠에 클론하라.

## 1. 범위

- 대상 라우트는 기존 `?page=outlook&center=relay` 하나다. 새 라우트를 만들지 않는다.
- 데이터는 기존 `dist/data/relay/index.json`만 쓴다. 세 방: 소수의견(26년 4분기) chat 60, 인생의 방 articles 8, 모바일한경 editions 2(2026-11-11T19:42 생성분 기준).
- Telegram 계정·세션·네트워크에는 연결하지 않는다. 화면 구조만 차용하고 내용은 Atlas 릴레이다.
- 브랜드 자산(Telegram 로고·이름·종이비행기 마크)은 쓰지 않는다. 아이콘은 Atlas 것으로 다시 그린다.

## 2. 관측 기준 (2026-11-12, web.telegram.org/k, 로그인 상태)

| 항목 | 1440×900 | 390×844 |
|---|---|---|
| 배경 | `rgb(24,24,24)`, 글자 `rgb(255,255,255)`, 폰트 Roboto | 동일 |
| 대화 목록 | `.chatlist-container` x=16, **폭 360**, 높이 868 | 목록은 화면 밖으로 밀리고 대화가 전체 폭 |
| 검색 | x=80, y=22, 280×44 | — |
| 폴더 탭 | "모두·Crypto·News…" 가로 스크롤 탭 | 동일 |
| 대화 행 | 제목·시각·마지막 메시지 미리보기·아바타·미읽음 배지 | 동일 |
| 메시지 영역 | `.bubbles-inner` x=560, **폭 696**, 상단 바 48, 입력창 y=836 48 | 전체 폭 390, 입력창 x=8 폭 374 |
| 전환 | 목록과 대화가 나란히 | 목록 ↔ 대화 단일 전환, 뒤로 가기 |

## 2.1 Pro가 따르는 스킬 원본 (2026-11-12 확인)

R23 구현은 ChatGPT 웹 Pro가 한다. Pro는 로컬 스킬 파일을 읽지 못하므로, 저장소 원본을 직접 읽고 그 절차를 따른다.

- 저장소: `JCodesMore/ai-website-cloner-template`, 확인 커밋 `5426e0e2ec35dbc173a7a18f47a3dfe2a765313e`(2026-11-10). 구현 시작 전에 `git ls-remote`로 최신 커밋을 다시 확인하고, 달라졌으면 최신을 읽는다.
- 읽을 파일 3개:
  1. `.agents/skills/clone-website/SKILL.md`
  2. `.agents/skills/clone-website/references/inspection-guide.md`
  3. `.agents/skills/clone-website/references/framer-and-motion.md`
- raw URL: `https://raw.githubusercontent.com/JCodesMore/ai-website-cloner-template/<커밋>/.agents/skills/clone-website/SKILL.md` (references도 같은 경로).
- 2026-11-12 대조: 로컬 설치본과 원본은 본문이 같다. 차이는 로컬 frontmatter의 `icon` 한 줄뿐이라 절차에 영향이 없다. 참조 두 파일은 해시가 같다(`3538dec2…`, `dc852cd1…`).
- 순서: 스킬 3개 파일을 읽는다 → 소스(`web.telegram.org/k/`)를 1440·390에서 직접 관찰한다 → 관찰 브리프를 저장소 `docs/evidence/relay-telegram-clone-<날짜>/`에 남긴다 → 구현한다 → 같은 뷰포트·같은 상태로 비교해 고친다. 스크린샷·iframe·번들 복사는 구현이 아니다.
- 스킬의 템플릿 경로(`src/app/`, `src/components/sites/`)는 쓰지 않는다. Atlas는 `dist/`의 기존 릴레이 라우트 하나를 수정한다.

## 3. 클론 계약 (clone-website 절차)

1. 소스 화면을 1440·390에서 스크린샷으로 남기고(`docs/evidence/relay-telegram-clone-20261112/`), 섹션 순서·치수·상태를 브리프에 적는다.
2. 같은 뷰포트·같은 상태에서 릴레이 페이지와 나란히 비교한다. 가장 큰 차이(구조·타이포·간격)부터 고친다.
3. 매핑: 폴더 탭 ← 세 방, 대화 행 ← 방 요약(마지막 항목·시각·건수), 메시지 버블 ← 메시지/아티클/에디션 원문, 검색 ← 방·제목·본문 검색.
4. 390에서는 목록과 대화를 한 화면에 겹치지 않게 전환하고, 1440에서는 360 + 메시지 영역으로 나눈다.
5. 원문·시각·출처 링크는 유지한다. 입력창은 보이지 않게 하거나 비활성으로 둔다(전송 기능 없음).

## 4. 수용

| # | 기준 | 측정 |
|---|---|---|
| T-1 | 1440에서 목록 폭 360±8, 메시지 영역이 목록과 겹치지 않음 | 실측 |
| T-2 | 390에서 목록↔대화 전환, 가로 오버플로 0 | 실측 |
| T-3 | 세 방 70건이 모두 도달 가능(스크롤 끝 확인) | 건수 |
| T-4 | 검색이 제목·본문에서 항목을 걸러냄 | 입력 3건 |
| T-5 | Telegram 로고·이름·종이비행기 마크 0 | DOM 검사 |
| T-6 | 소스 대비 스크린샷 비교를 1440·390 각 1장 이상 남김 | evidence 경로 |

## 5. 관계

- R22(내용 분류)와 별개다. R22는 주제 분류·필터, 이 요구는 화면 구조다. 둘 다 같은 페이지를 다루므로 구현 순서는 R22 다음으로 둔다.
- clone-website 스킬을 따른다: 소스 관찰 → 첫 구현 → 같은 뷰포트 비교 → 수정 반복. 스크린샷·iframe·번들 복사는 구현이 아니다.
