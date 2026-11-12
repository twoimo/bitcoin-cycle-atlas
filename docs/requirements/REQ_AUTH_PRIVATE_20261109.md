# 요구사항 — 사용자 인증·회원 관리·비공개 접근 (초안)

작성 2026-11-09. 상태: **요구사항 정리 단계(구현 전)**. 대상 저장소 `twoimo/bitcoin-cycle-atlas`.

## 1. 목표
- 초대받은 사람만 가입할 수 있고, **관리자 승인**을 거쳐야 계정이 활성화된다.
- 관리자는 회원 승인·거절·강등·정보 수정을 할 수 있다.
- 사용자는 프로필 수정·비밀번호 변경·탈퇴를 스스로 할 수 있고, Google 로그인을 지원한다.
- 사이트 전체를 **비공개**로 전환한다. 로그인하지 않은 방문자는 로그인 화면만 보고, 배경은 블러 처리한다.
- 4개 플랫폼 구독을 공유하는 형태이므로 **비용을 지불한 초대 대상만** 접근할 수 있어야 한다.

## 2. 등급과 권한
| 역할 | 권한 |
|---|---|
| `guest` | 로그인 화면만. 데이터 API 접근 불가(401) |
| `pending` | 가입 신청 완료, 관리자 승인 대기. 로그인은 가능하나 "승인 대기" 화면만 |
| `member` | 차트·리서치 열람, 프로필/비밀번호/탈퇴 |
| `admin` | member + 초대 생성/회수, 승인/거절, 강등, 회원 정보 수정, 감사 로그 열람 |

- 관리자 계정은 별도 지정(초기 1개), **MFA 필수**.
- 강등은 `member → pending`(재승인 필요) 또는 `pending → 거절`로 기록하고, 강등 사유를 감사 로그에 남긴다.

## 3. 사용자 흐름
### 3.1 초대 → 가입
1. 관리자가 이메일 1개에 대해 **단회용 초대 토큰**을 발급한다(만료 기본 7일, 사용 즉시 소멸).
2. 초대 링크(`/join?token=…`)로 진입하면 이메일이 고정 표시되고, 비밀번호 설정 또는 Google 연동을 선택한다.
3. 가입 신청이 들어오면 계정은 `pending`이 되고, 관리자에게 알림이 간다.
4. 관리자가 승인하면 `member`로 활성화된다. 거절하면 계정은 비활성으로 남고 사유가 기록된다.

### 3.2 로그인
- 이메일+비밀번호 또는 Google OAuth.
- Google로 처음 들어온 사용자도 **초대 토큰이 없으면 가입 불가**(초대 이메일과 일치할 때만 연결).
- 세션은 서버측 저장(세션 ID 쿠키), 쿠키는 `HttpOnly`, `Secure`, `SameSite=Lax`.

### 3.3 자기 관리
- 프로필: 표시 이름·표시 언어·알림 수신 여부 수정.
- 비밀번호: 현재 비밀번호 확인 후 변경, 변경 시 다른 세션 무효화.
- 탈퇴: 본인 확인 후 소프트 삭제(30일 보존 후 파기), 관리자에게 알림.

## 4. 데이터 모델(초안)
```
users(id, email_unique, display_name, role, status, password_hash, google_sub,
      invited_by, approved_by, approved_at, created_at, updated_at, deleted_at)
invitations(token_hash, email, issued_by, expires_at, used_at, revoked_at, note)
sessions(id_hash, user_id, created_at, last_seen_at, ip_hash, ua_hash, revoked_at)
audit_log(id, actor_user_id, action, target_user_id, before_json, after_json, at, ip_hash)
subscription_shares(id, owner_email, platform, seats, note)   -- 4개 플랫폼 구독 공유 대장
```
- 비밀번호는 **argon2id**(또는 scrypt) 해시. 평문·복호화 가능한 형태 저장 금지.
- 초대 토큰은 원문을 저장하지 않고 해시만 저장한다.

## 5. 비공개 처리 — 블러는 "효과"일 뿐 보안이 아니다
핵심 원칙: **인증되지 않은 요청에는 데이터를 내려주지 않는다.** CSS 블러·오버레이는 UX 장식이며, 제거되더라도 내용이 없어야 한다.

| 계층 | 요구 |
|---|---|
| 서버 렌더 | 로그인 전에는 차트 데이터·리서치 번들·릴레이 번들을 **응답에 포함하지 않는다**(401 또는 빈 셸) |
| 정적 자산 | 데이터 JSON(`/data/*.json`)은 인증 쿠키 검증을 거치는 경로로 이동하거나 Cloudflare Access 뒤에 둔다 |
| 블러 | 셸만 렌더 + CSS `filter: blur()` + `aria-hidden` 처리. 스크린샷·DOM 어디에도 실데이터 없음 |
| 소스맵·번들 | 프로덕션 소스맵 비활성, 번들에 데이터 상수 인라인 금지 |
| 캐시 | `Cache-Control: private, no-store` (인증 응답), CDN 캐시 키에 세션 포함 금지 |
| 우회 시도 | 직접 URL·API 탐색, `?page=` 파라미터, 이전 번들 경로, robots/sitemap 노출 점검 |

### 악의적 블러 제거 시나리오와 대응
1. 개발자도구에서 `filter` 제거 → **보여줄 데이터가 DOM에 없어야 함**(테스트로 검증).
2. 데이터 JSON 직접 호출 → 401/403, Cloudflare Access 또는 서명 쿠키 필요.
3. 이전 배포의 공개 자산 캐시 → 배포 시 엣지 캐시 퍼지, 경로 버전 관리.
4. 초대 토큰 추측/재사용 → 128bit 이상 랜덤, 해시 저장, 단회용, 시도 rate limit.
5. 세션 탈취 → HttpOnly+Secure, 로테이션, 동시 로그인 정책, 의심 IP 알림.
6. 관리자 계정 탈취 → MFA, 세션 재인증(민감 작업), 감사 로그.

## 6. 보안 요구(최소선)
- 로그인·가입·초대 API rate limit + Cloudflare Turnstile(가입/로그인).
- CSRF 토큰(폼), SameSite 쿠키, 오리진 검증.
- 이메일 인증(가입 시 1회), 재설정 링크 단회용·만료.
- 감사 로그: 승인·강등·정보 수정·로그인 실패 누적.
- 비밀번호 정책: 길이 12자 이상, 유출 목록 대조(선택), 1회용 로그인 링크 제공 여부 결정.
- 개인정보 최소 수집(이메일·표시 이름만), 파기 정책 명시.

## 7. 보안 검증 — 7개 도구 전부 통과 기준
아래 7개를 모두 실행하고, **각 결과를 문서에 첨부**한다. 실패 항목은 조치 후 재실행한다.

| # | 도구 | 저장소 | 이번 요구에서 확인할 것 |
|---|---|---|---|
| 1 | Cloudflare security-audit-skill | https://github.com/cloudflare/security-audit-skill | 6단계 감사(정찰→커버리지→후보검증→보고), **프롬프트 인젝션**·**MCP/에이전트 권한 위임** 취약점 점검 |
| 2 | Anthropic defending-code-reference-harness | https://github.com/anthropics/defending-code-reference-harness | 7단계 자율 파이프라인으로 취약점 발굴·패치, 침해 탐지/대응 워크플로 점검 |
| 3 | OpenAI codex-security | https://github.com/openai/codex-security | 취약점 탐색·검증·패치 생성·수정 검증까지, 표준/딥 스캔 결과 첨부 |
| 4 | OpenAI php2shell-checker | https://github.com/openai/php2shell-checker | PHP 런타임이 없더라도 **노출 여부 판정 결과**를 기록(해당 없음도 근거와 함께) |
| 5 | NVIDIA SkillSpector | https://github.com/NVIDIA/SkillSpector | 도입하는 외부 스킬·MCP의 악성 패턴 검사(17 카테고리/71 패턴), SARIF 리포트 |
| 6 | Alibaba open-code-review | https://github.com/alibaba/open-code-review | XSS·SQL 인젝션·NPE·동시성 결함 중심 코드 리뷰 |
| 7 | Google osv-scanner | https://github.com/google/osv-scanner | 의존성·락파일·SBOM 취약점, 취약 함수 실제 호출 여부 분석 |

### 공통 수용 기준
- 각 도구 실행 명령·버전·커밋·결과 파일 경로를 문서에 기록한다.
- **High/Critical 0건**. Medium 이하는 위험도·완화책·재검증 일자를 표로 남긴다.
- "해당 없음"도 근거를 남긴다(예: PHP 없음 → php2shell 결과 무효 사유).
- 인증·세션·초대 토큰·권한 상승 경로에 대한 **전용 테스트 케이스**를 만든다(아래 8절).

## 8. 테스트 시나리오
1. 초대 없이 가입 시도 → 거부.
2. 만료된 초대 토큰 → 거부, 재발급 안내.
3. 승인 대기 계정이 데이터 API 호출 → 403.
4. 승인 직후 로그인 → 정상, 이전 세션 무효 확인.
5. 관리자 강등 → 대상 계정 즉시 접근 차단, 감사 로그 기록.
6. 비밀번호 변경 → 다른 기기 세션 무효.
7. 탈퇴 → 즉시 로그인 불가, 30일 후 파기 스케줄 확인.
8. 비로그인 상태에서 `/data/*.json` 직접 호출 → 401.
9. 로그인 화면에서 CSS 블러 제거 → 차트 데이터가 DOM·네트워크에 없음.
10. Google 로그인으로 초대 이메일 불일치 계정 시도 → 거부.

## 9. 마일스톤(제안)
| 단계 | 범위 | 완료 기준 |
|---|---|---|
| M1 | 스키마·세션·초대 토큰·로그인/가입 API | 8절 1~4, 8 통과 |
| M2 | 관리자 콘솔(승인·강등·수정·감사 로그) | 5, 6 통과 |
| M3 | 비공개 전환(데이터 게이팅·블러 셸) | 7, 9 통과 |
| M4 | 보안 7종 스캔 + 조치 | High/Critical 0 |
| M5 | Google OAuth·MFA·운영 모니터링 | 10 통과 |

## 10. 결정 (2026-11-12, 사용자 "추천대로")

| # | 결정 | 값 |
|---|---|---|
| B1 | 좌석 관리 | **수동 대장**, 초기 4석 |
| B2 | 초대·세션 | 초대 **7일**, 1인당 동시 세션 **2** |
| B3 | 로그인 | **Google + 비밀번호 병행**, 초대 이메일 고정 |
| B4 | 파기·백업 | 탈퇴 **30일** 후 파기, 백업 **90일** 보존 |
