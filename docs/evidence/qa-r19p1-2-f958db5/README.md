# Q-R19P1-2-f958db5 — 루트 HTTP와 768px 알약 로딩 수정

**두 원인 수정 반영 / Mac의 같은 P1 게이트 재검증 대기.** 네이티브 4폭 통과를 주장하지 않는다.

## 기준과 커밋

작업 전 GitHub와 git fetch로 원격 `f958db5464ae64327365a86154fe454e8dd9ca1d`를 다시 읽었다. 문서만 바뀐 커밋임을 확인하고 그 위에서 작업했다. 기준은 체크리스트의 Q-R19P1-2 행과 변경하지 않은 [Mac 영수증](../qa-r19p1-20261112/mac-b787935.json)이다.

| 커밋 | 내용 |
|---|---|
| `e2aaa936140a1a2ec44ee2e63f00880d3496c1a5` | P1 서버의 index 재작성 전 정확한 사이트 루트 허용, 동일 서버를 쓰는 실제 HTTP 회귀 검사 |
| `fbe74b8f03393595f504c46c94bd2425c1154741` | 기존 생성기로 시장 외부 셸 HTML 9개 갱신, 실제 로드 CSS·경로·digest·알약 cascade 검사 |

각 커밋을 만든 직후 지정 브랜치 `fix/tradingview-responsive-20261110`에 fast-forward로 반영했다. HTTP·네이티브 실행의 testedHead는 `fbe74b8`, 시작 작업 트리는 `[]`이다.

## 1. 루트 404

기존 서버는 디렉터리의 `index.html` 변환 전에 `resolve(site,'./') === site`를 하위 파일이 아니라고 거절했다. 첫 범위 검사에서만 정확히 루트인 경우를 허용했다. 그 뒤 디렉터리를 index로 바꾸고 `realpath()` 결과가 `site + '/'` 아래인지 확인하는 최종 검사는 그대로다.

테스트와 실제 브라우저 게이트가 동일한 `createP1StaticServer()`를 쓴다. 변경 전 경계를 보존한 상태에서는 새 HTTP 검사 5개 중 루트를 요청하는 2개가 `404 !== 200`으로 실패했고, 한 조건 수정 후 5개 모두 통과했다. 인코딩 경로 이탈, 유사 prefix, 외부 파일·디렉터리 symlink, 외부로 향하는 루트 index symlink는 여전히 404다. 제품 URL·ready 조건·45초 timeout은 변경하지 않았다.

### 실제 HTTP 근거

| 요청 | 결과 |
|---|---|
| `/bitcoin-cycle-atlas/` | **200**, redirect 없음, `dist/index.html`과 바이트 일치 |
| `/bitcoin-cycle-atlas/index.html` | **200**, 같은 index 바이트 |
| 기존 `?page=` 직접 진입 6경로 | **6/6 HTTP 200**, 모두 같은 index 바이트 |
| `/bitcoin-cycle-atlas/market-lab/`·`/market-lab/us/` | **2/2 HTTP 200**, 각각 현재 생성 HTML 바이트와 일치 |
| 두 시장 진입점의 CSS 각 4개 | **8/8 HTTP 200**, 파일·SHA-256 query 일치, P1 원본 CSS 포함 |

루트 본문은 **57,006B**, SHA-256은 **`f0f94d3e68e6cbcfbfa0fbfb8b34c76f08b95548d8a7b52cd9d9059540ff0769`**다. `Content-Type: text/html;charset=utf-8`, `Cache-Control: no-store`이고 본문은 `<!doctype html>`로 시작한다. `not found`를 ready로 취급하거나 다른 URL로 회피하지 않았다. 요청별 결과는 [http-fbe74b8.json](http-fbe74b8.json)에 있다. 이것은 브라우저 실행과 별개인 실제 HTTP 관측이다.

## 2. 768px 알약

원인은 새로운 반지름 규칙이 아니라 **오래된 생성 HTML의 스타일시트 목록**이었다. 시장 외부 셸은 41개 개별 CSS 링크에서 끝나 새 `ui/shell-layout.css`를 포함하는 `site-after-shell.css`를 불러오지 않았다. 그래서 768px에서는 기존 `editorial-system.css`의 4px 반지름이 남았다.

기존 `scripts/build-pages.mjs`로 외부 진입 HTML을 현재 `dist/index.html`에서 재생성했다. 9개는 같은 생성기 소유 집합이다: `market-lab/`, `charts/`, `us/`, `kr/`, `scenario/`, `cashflow/`, `rsi/`, `housing/`, `themes/`. 내부 React 앱 재빌드 산출물은 이번 수정과 무관하여 원래 바이트로 복원했다. 생성기·제품 CSS·제품 라우팅은 수정하지 않았다. 현재 진입점은 원래 순서의 네 CSS 링크와 현재 digest를 사용한다.

### 768px 반지름·높이

다음은 **실제 서빙 파일을 입력으로 한 CSS 규칙·우선순위 해석 결과**다. 브라우저의 `getComputedStyle()` 또는 `getBoundingClientRect()` 실측은 아직 없다.

| 내비 목적지 | 네 모서리 CSS 반지름 | 높이 / min-height | 기존 조건 높이÷2 |
|---|---:|---:|---:|
| outlook | 999px | 44px / 44px | 22px |
| market-us | 999px | 44px / 44px | 22px |
| evidence | 999px | 44px / 44px | 22px |
| data | 999px | 44px / 44px | 22px |
| ipo | 999px | 44px / 44px | 22px |
| relay | 999px | 44px / 44px | 22px |
| conference | 999px | 44px / 44px | 22px |

기존 P1 규칙 `border-radius:var(--pill-radius)`와 root 토큰 `--pill-radius:999px`를 그대로 사용한다. 기존 44px 기하를 유지하고 `radius >= height/2` 판정을 바꾸지 않았다. 두 시장 진입점에서 7개 목적지와 a/button 두 태그를 검사한다. P1 소스를 누락시키는 음성 대조군은 다시 4px를 내며, 뒤의 `!important` 4px가 우선하는 경우도 검출한다. 320/390의 크기 속성은 기존과 같다. 이 소스 검사가 네이티브 도달성 또는 4폭 PASS를 대신하지 않는다.

## 3. 네이티브 실행과 보존된 P0

같은 P1 CLI를 깨끗한 `fbe74b8`에서 실행했다. Chromium의 `process_singleton_posix.cc:297 socket() failed: Operation not permitted (1)`로 실행 단계에서 SIGABRT가 발생했다. 결과는 레이아웃 **0/28**, 내비 활성화 **0/56**, 차트 복귀 **0/8**, `qualifiesP1Verification:false`, 스크린샷 **0장**이다. `sourceStable:true`다.

| 폭 | 네이티브 반지름·높이 | 가로 오버플로 | 상태 |
|---:|---|---|---|
| 320 | 미측정 | 미측정 | 브라우저 실행 차단 |
| 390 | 미측정 | 미측정 | 브라우저 실행 차단 |
| 768 | 미측정 | 미측정 | 브라우저 실행 차단 |
| 1440 | 미측정 | 미측정 | 브라우저 실행 차단 |

**기존 Mac P0는 그대로 통과 상태다:** `b787935`, required10 / attempted10 / passed10 / failed0, `qualifiesP0Verification:true`, 고정 커버리지40/40, settings-icon 라이트2회·다크2회. 이번 요청에서 P0를 재실행하지 않았고, 그 영수증과 P0 하네스·표본·대비4.5/3.0을 수정하지 않았다.

보호 4파일, 가격 축과 `minRight=64`, 제품 라우팅, CSS 원본과 P1 CSS 번들, 내부 React 앱 바이트를 보존했다. P1 gate에서 정적 서버를 제외한 본문과 서버 앞의 검사 함수들은 원래와 정확히 같다. timeout·checkVisibility·28/56/8·알약 반경 기준에 변경이 없다. main push·force push·배포·P2a-0 착수 없음.

## 4. 검사와 영수증

- 집중 검사 **45/45**, 실패·제외0: 새 served-shell8 + HTTP5 + 기존 P1 계약19 + style5 + preload8.
- `verify:static`: exit0, files1065 / scripts220 / references753. 참조 수 감소는 9개 생성 HTML이 개별 CSS41개 대신 원래 root의 CSS4개를 사용한 결과다.
- 기존 CSS bundle·preload graph `--check`: 통과. 제품 CSS·root index·graph 파일을 다시 쓰지 않았다.
- 광범위한 전체 테스트와 전체 Pages 산출물 통과를 새로 주장하지 않는다. 생성기는 외부 HTML 재생성을 위해 실행했고 관련 없는 내장 앱 출력은 보존했다.

[summary.json](summary.json)에 커밋·보호 파일 SHA-256·HTTP·CSS 해석·네이티브 미측정 수치를 분리했다. [p1-fbe74b8.report.json.gz](p1-fbe74b8.report.json.gz)는 P1 CLI 원본 JSON 전체이며 압축 해제 후 원문 SHA-256 일치를 확인했다. [checks.log.tar.gz](checks.log.tar.gz)에 변경 전 HTTP 실패, 수정 후 검사, 생성기와 실제 네이티브 실행 로그를 보존했다.

Mac은 해당 브랜치를 fast-forward로 받은 뒤 **같은 게이트**를 새 출력 폴더로 다시 실행한다:

```sh
node scripts/verify-ui-renewal-p1-browser.mjs --out build/qa-r19p1-2-mac-fbe74b8
```

완료 판정은 여전히 28/28·56/56·8/8과 네 폭 오버플로0, 노출된 내비의 실제 계산 반지름≥높이÷2다.
