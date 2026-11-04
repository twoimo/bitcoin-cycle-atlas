# 최신: 고정 패널과 중앙 화면 전환

최신 지시는 실제 상·하·좌·우 차트 패널을 유지하고 가운데 내용만 바꾸는 것이다. 서비스의 기본 동작에서 별도 dashboard 전환을 제거했다. TQQQ / SOXL / KODEX 233740을 종목 검색에서 고르고, 보유한 전체 과거 자료와 가정 백테스트를 같은 중앙 영역에서 확인한다. [최신 검증 기록](../architecture-migration/rsi-history-verification.json)에 현재 검사와 화면을 남겼다. 아래는 이전 단계의 관측 기록이다.

# 이전 단계: 작업 화면 · 2026-11-03

현재 로컬 화면: [삼플레·RSI](http://127.0.0.1:4319/market-lab/rsi/). 사용자 지시대로 모호한 ‘세 축 연구실’ 메뉴와 상단 탭/지역 선택을 사이드바의 독립 페이지로 바꿨다. 이름은 가격 차트 / 미국 시장 / 국내 시장 / 조건 실험 / 현금흐름 / 삼플레·RSI / 리서치 / 자산 비교 / 공모주다. 미국·국내는 좁은 rail에서도 구분되는 US/KR 표식을 사용한다.

Aside `vgT0woMivNn7zAVv`의 사용자 원문(로컬 messages.jsonl 4164행)을 다시 확인했다. 성장·유동성·심리로 국내외 증시를 진단하고 삼플레·RSI를 별도 도구로 만든다는 요구를 메뉴의 근거로 삼았다. 해당 세션이나 그 브라우저를 재개하지 않았다.

## 화면 체계

[TradingView 공식 도구 영역](https://www.tradingview.com/charting-library-docs/latest/ui_elements/Toolbars/)과 사용자 IAB에서 로그인된 화면의 상/좌/우/하 배치를 참고했다. 개인 watchlist·저장 레이아웃·계정 설정을 변경하거나 복제하지 않았다. [shadcn/ui dashboard-01](https://ui.shadcn.com/blocks?category=dashboard)의 sidebar/header/inset content 구성을 Atlas의 데이터·기존 제어에 맞췄다. MIT 원본 commit `4aaea19d9cff3e0908e12a8c1d504b8c5ec34610`의 파일·해시·라이선스는 `templates/shadcn-dashboard-01/`에 보존한다. 배포 고지는 `dist/vendor/shadcn-ui-LICENSE.txt`와 포함 JS에 유지한다. 예제 계정·KPI·가짜 자료는 사용하지 않는다.

`dist/atlas-navigation.js`가 서비스와 정적/오프라인 shell의 메뉴를 공유한다. 서비스 URL과 과거 tab/region query를 함께 지원한다. 원래 버튼·listener·toolbar 소유 관계를 보존하며, 새 link는 native 새 탭/수정키 동작을 유지한다. React 입력 state는 도구 간 이동과 뒤로 가기에서 유지한다.

소개 문단과 기술 설명은 기본 화면에 넣지 않는다. 수치·단위·날짜·동작을 먼저 보여주고 원문, 계산 기준과 한계는 접힌 disclosure에 보존한다. 금융 의미·관측/가정 구분과 오류를 생략하지 않는다.

## RSI 차트와 Buy/Sell의 범위

TQQQ의 제공된 관측 종가와 기존 Wilder RSI14/SMA9를 큰 상하 패널에 표시한다. 기본 3년, 1년/전체 전환, 날짜 slider·차트 클릭·기준선 통과일 선택, 표식 표시 전환과 수기값 비교가 가능하다. 범위 밖 날짜를 선택하면 전체로 전환하고, 범위를 줄이면 선택일도 보이는 구간으로 옮겨 두 패널·기준선 표의 날짜가 같게 유지된다. RSI는 항상 전체 과거 입력에서 계산한 뒤 표시 구간만 자른다.

원문에서 확인된 수치는 매수 33.5 / 29.5와 매도 40 / 43이다. **차트의 표시 규칙**은 직전 값이 기준보다 높았다가 현재 값이 기준 이하가 되면 Buy, 직전 값이 낮았다가 현재 값이 기준 이상이 되면 Sell이다. 같은 값이 이어질 때 표식을 반복하지 않고 결측 구간에서 신호를 만들지 않는다. 이것은 수치 기준선 통과를 보여주는 시각화이며 원문의 매매 비교 연산·비중·보유 상태·재진입·실제 체결을 복원한 엔진이 아니다. 수량·포지션·주문을 추정하지 않는다. 모든 통과 표식은 유지하고, 겹치는 글자만 간격을 두어 표시하며 전체 날짜는 선택기에서 확인한다.

현재 가격과 RSI는 기존 저장 자료 기반이다. 키움 실데이터와 HTS RSI 동등성은 아직 연결/검증하지 않았다. [키움 공식 REST API 안내](https://openapi.kiwoom.com/intro?dummyVal=0)는 국내·미국 주식, Mac 지원과 계좌/HTS ID·사용신청 조건을 명시한다. [공식 API 가이드](https://openapi.kiwoom.com/guide/apiguide?dummyVal=0)와 [공식 저장소](https://github.com/Kiwoom-Securities/Kiwoom-REST-API)의 App Key/Secret 인증 조건을 확인했다. 이번 작업은 발급·설치·인증·주문을 실행하지 않았다.

## 검사와 실제 화면

회귀는 2,403/2,403 통과·실패 0·skip 0, React/화면 17/17, 실제 PostgreSQL/API 11/11을 확인했다. 과거 모형 출력의 정확 비교는 고정한 Linux/x64에서 41개를 수행한다. 나머지 2,362개는 Mac에서 수행하며 최종 소스에서 다시 확인했다. 별도로 navigation/offline/짧은 달력에 영향을 받는 실제 artifact 검사를 재실행했다. 기존 수학 JS, 불변 기록과 source hash, 엄격한 비교는 그대로다. 상세 명령·분모·해시는 [최신 검증 영수증](../architecture-migration/regression-repair-verification.json)에 있다.

IAB에서 새 메뉴와 과거 링크, 미국/국내 점수, 음수 예시 87.52·NPV 6,623.58, 수기 RSI와 뒤로 가기, 날짜/기간/표식 전환을 확인했다. 1280×720과 390×844에서 가격/RSI를 함께 읽고, 좁은 화면의 가로 넘침과 국가 메뉴 구분을 확인했다. BTC/ETH/MSTR/BMNR의 기존 가격과 조건부 경로, 리서치 검색·읽기 창, 자산표, 공모주와 짧은 달력의 글자 겹침 수정도 실제 화면에서 확인했다. 화면은 ignored `build/regression-repair/screenshots/`에 보존한다.

Hallmark v2.0.0 고정 checker(`7ec868225c6caa040558c321ee0fefa0e73f83a8`)의 `dist apps/web/src --scope app` 결과는 **FAIL 0 / REFLEX 0 / WARN 7**이다. 분류/확인 상태를 제목 아래 metadata로 옮기고 sticky 충돌, 비표준 간격, 누락된 동작 상태, 대비·색 역할, blur와 중복된 경계/그림자를 수정했다. 7개 WARN은 모두 F7(동일한 container recipe 반복)이며 공통 버튼·필드·대화상자·자료 frame의 일관된 스타일에 대한 page heuristic이다. 사용자 요구인 한 작업 화면의 조화를 위해 실제 동작/화면을 검토하고 같은 역할의 공통 스타일은 유지했다. 검사기·규칙을 바꾸거나 waiver로 숨기지 않았으며 원문 finding을 영수증에 보존했다.

upstream Chrome render runner는 외부 브라우저 예외가 없어 실행하지 않았다. IAB 실제 검증과 구별하며 자동 8-route render pass를 주장하지 않는다. 원격 CI·배포·외부 교차 검토도 미실행이다. 첫 디자인 이전 기록은 기존 `verification.json`과 architecture-migration의 이전 영수증에 남아 있다.
