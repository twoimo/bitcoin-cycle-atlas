# P1b 실제 자막·페이지 매핑 초안

**자동 초안 / 청취 검수 0/10 / 실제 장표·오디오 자산 미포함.** 파일 보존과 매핑 정확도는 별도 판정이다. 이 보고서는 자동 유사도를 정답률로 해석하지 않는다.

원본 SRT 9,168행을 1행씩 보존했다. 누락 0 · 추가 0 · 중복 0 · 원문·시간 변경 0. 마지막 t1=20396.7s / 선언된 녹음 길이 20400s. 원본의 겹침과 긴 희소 전사는 수정하지 않았다.

## 프로그램별 초안 매핑

| ID | 프로그램 | 구간 KST | 원본 행 | final-290 매핑/비율 | R17 매핑/비율 | 양쪽 모두 매핑 |
|---|---|---|---:|---:|---:|---:|
| 00 | 개회·사전 안내 | 12:33:00.000–13:08:16.380 | 223 | 0 / 0% | 0 / 0% | 0 |
| 01 | 아파트 매매 거래량으로 보는 매수 타이밍 | 13:08:16.380–13:27:42.340 | 373 | 21 / 5.63% | 27 / 7.24% | 8 |
| 02 | 내 삶을 바꾸는 부동산 : 내집마련 & 자산 스케일업 전략 | 13:27:42.340–13:50:39.040 | 792 | 16 / 2.02% | 23 / 2.9% | 6 |
| 03 | 실전 투자 사례를 배우는 경매 물건 고르는 법 | 13:50:39.040–14:11:17.350 | 712 | 67 / 9.41% | 68 / 9.55% | 55 |
| 04 | 첫 번째 휴식 | 14:11:17.350–14:30:00.000 | 38 | 0 / 0% | 0 / 0% | 0 |
| 05 | 이렇게 하면 주식 망합니다 | 14:30:00.000–14:50:00.000 | 1 | 0 / 0% | 0 / 0% | 0 |
| 06 | 주식 초보자인 '나 어떻게 하면 잘할 수 있을까? | 14:50:00.000–15:10:00.000 | 2 | 0 / 0% | 0 / 0% | 0 |
| 07 | "기업분석" 잘하려고 하지 말고 일단써보세요 | 15:10:00.000–15:34:08.020 | 1081 | 73 / 6.75% | 91 / 8.42% | 54 |
| 08 | 테마, 누구나 할 수 있는가? 그리고 어떻게 공부해야하는가? | 15:34:08.020–15:54:44.010 | 1059 | 77 / 7.27% | 77 / 7.27% | 72 |
| 09 | 두 번째 휴식 | 15:54:44.010–16:08:36.630 | 29 | 0 / 0% | 0 / 0% | 0 |
| 10 | 비트코인의 싸이클, 언제 시작될까? | 16:08:36.630–16:32:45.720 | 1083 | 9 / 0.83% | 10 / 0.92% | 6 |
| 11 | 직장인 공모주 청약, 월급에 '더하기'를 만드는 방법 | 16:32:45.720–16:51:39.390 | 853 | 25 / 2.93% | 25 / 2.93% | 24 |
| 12 | 미국 증시를 읽는 세 개의 축 그리고 2027 AI 투자 핵심 키워드 | 16:51:39.390–17:32:16.510 | 1735 | 109 / 6.28% | 187 / 10.78% | 75 |
| 13 | 메타인지와 잃지 않는 매매 - 삼플레 | 17:32:16.510–18:07:02.820 | 958 | 16 / 1.67% | 37 / 3.86% | 9 |
| 14 | 폐회·선물·기념 촬영 | 18:07:02.820–18:13:00.000 | 229 | 0 / 0% | 0 / 0% | 0 |

## 임계값·범위·앵커

- 같은 강연 안에서 현재 행과 직전 8초 문맥만 비교한다. 미래 발화는 쓰지 않으며 원본 행은 합치지 않는다. NFKC·소문자 정규화, 단어/한글 3-gram과 강연 내 IDF는 비교에만 쓰며 원문은 변경하지 않는다.
- 질의를 해당 강연 페이지의 알려진 비공통 어휘에 투영한다. 대화체·ASR 미등록 특징은 점수 분모에서 제외하되 알려진 특징의 비율·수와 원래 특징 수를 각 매핑 근거에 기록한다. 점수 = 질의 특징 가중 겹침 × 0.6 + 이진 TF-IDF cosine × 0.4. 점수 ≥0.3, 질의 겹침 ≥0.22, 1·2위 차 ≥0.045, 공유 특징 ≥4, 서로 다른 직접 일치 단어 ≥2, 현재 행 직접 특징 ≥1일 때만 후보가 된다. 하나의 긴 단어에서 나온 여러 n-gram을 여러 독립 근거로 세지 않는다.
- 30초 초과 원본 행, 프로그램 경계를 넘는 행, 비강연은 null이다. 적격 후보 중 최대 가중치 비감소 부분수열을 선택한다. 역행 후보는 null로 남기고 전후 행의 페이지를 전파하지 않는다.
- 점수는 결정적인 텍스트 근거 지수이며, 정확도 확률이 아니다. 페이지를 띄운 실제 순간이나 ±0.5초 싱크를 보증하지 않는다.
- 두 덱의 PDF 시작/끝 책갈피는 후보 페이지 범위만 제한한다. 첫 페이지의 등장 시각을 강연 시작 시각과 같다고 가정하지 않는다.
- 프로그램 시각 근거는 program-boundaries-20261112.json의 원문 행·예정 시각을 사용한다. 사회자 소개는 프로그램 소속 경계이며 실제 슬라이드 전환 앵커가 아니다.
- 기존 R11 ASR 대조 38지점 파일은 이번 입력 번들에 없다. 사용하거나 검증했다고 주장하지 않는다. 자동 선택 페이지별 대표 후보와 모든 수용 매핑 점수·문맥 source ID는 JSON 보고서에 있다.

| ID | 강연/프로그램 | 시작 근거 | 끝 근거 | final 범위 | R17 범위 |
|---|---|---|---|---|---|
| 00 | 개회·사전 안내 | recording-bound | transcript-anchored | — | — |
| 01 | 아파트 매매 거래량으로 보는 매수 타이밍 | transcript-anchored | transcript-anchored | 2–8 | 2–8 |
| 02 | 내 삶을 바꾸는 부동산 : 내집마련 & 자산 스케일업 전략 | transcript-anchored | transcript-anchored | 9–22 | 9–22 |
| 03 | 실전 투자 사례를 배우는 경매 물건 고르는 법 | transcript-anchored | transcript-anchored | 23–39 | 23–39 |
| 04 | 첫 번째 휴식 | transcript-anchored | scheduled-only | — | — |
| 05 | 이렇게 하면 주식 망합니다 | scheduled-only | scheduled-only | 40–47 | 40–47 |
| 06 | 주식 초보자인 '나 어떻게 하면 잘할 수 있을까? | scheduled-only | scheduled-only | 48–55 | 48–55 |
| 07 | "기업분석" 잘하려고 하지 말고 일단써보세요 | scheduled-only | transcript-anchored | 56–88 | 56–88 |
| 08 | 테마, 누구나 할 수 있는가? 그리고 어떻게 공부해야하는가? | transcript-anchored | transcript-anchored | 89–125 | 89–120 |
| 09 | 두 번째 휴식 | transcript-anchored | transcript-anchored | — | — |
| 10 | 비트코인의 싸이클, 언제 시작될까? | transcript-anchored | transcript-anchored | 126–142 | 121–136 |
| 11 | 직장인 공모주 청약, 월급에 '더하기'를 만드는 방법 | transcript-anchored | transcript-anchored | 143–158 | 137–152 |
| 12 | 미국 증시를 읽는 세 개의 축 그리고 2027 AI 투자 핵심 키워드 | transcript-anchored | transcript-anchored | 159–238 | 153–220 |
| 13 | 메타인지와 잃지 않는 매매 - 삼플레 | transcript-anchored | transcript-anchored | 239–277 | 221–253 |
| 14 | 폐회·선물·기념 촬영 | transcript-anchored | recording-bound | — | — |

## 입력 불일치와 보존 결정

- `{"kind":"documented-source-count","source":"plaud-1","documented":7995,"actual":7994,"resolution":"Use every block in the SHA-256-matching SRT; do not invent a missing caption to reach the documented count."}`
- `{"kind":"program-count","documented":14,"actual":15,"resolution":"One opening + eleven lectures + two breaks + one closing = fifteen; preserve all IDs 00..14."}`
- `{"kind":"readme-bookmark-page-range","speaker":"다마고치","deck":"r17-clean-257","readme":[89,125],"bookmarks":[89,120],"resolution":"Use explicit start/end bookmarks and enforce nonoverlapping lecture ranges; do not copy the README typo."}`

- 공급된 OCR과 책갈피의 발표 소유권이 충돌한 final-290 18개 페이지(23, 40, 122, 123, 124, 125, 138, 140, 141, 142, 154, 155, 156, 157, 233, 235, 236, 237)는 후보에서 제외했다. 원본 PDF를 검사한 판정이 아니며, 원본·책갈피 범위를 수정하지 않았다. 근거 원문·비교 페이지는 JSON의 pageOwnershipConflicts에 보존한다.

## 미매핑 구간

아래는 각 덱에서 연속으로 null인 **원본 자막 행 묶음**이다. t0–t1 범위에 무음·전사 공백이 포함될 수 있다. 실제 발화가 없다고 해석하지 않는다. 두 덱의 목록은 독립적이다. 개회·휴식·폐회에는 보조 장표를 생성하지 않으며 page:null을 유지한다.

| 프로그램 | 덱 | KST 범위 | 원본 행 수 | source 범위 | 이유별 행 수 |
|---|---|---|---:|---|---|
| 00 | final-290 | 12:41:04.800–13:08:16.380 | 223 | plaud-1#1…plaud-1#223 | non-lecture:223 |
| 00 | r17-clean-257 | 12:41:04.800–13:08:16.380 | 223 | plaud-1#1…plaud-1#223 | non-lecture:223 |
| 01 | final-290 | 13:08:16.380–13:11:21.610 | 89 | plaud-1#224…plaud-1#312 | below-confidence-threshold:39, monotonic-conflict:3, no-direct-source-evidence:4, insufficient-distinctive-features:43 |
| 01 | final-290 | 13:11:27.260–13:12:25.250 | 17 | plaud-1#314…plaud-1#330 | no-direct-source-evidence:2, insufficient-distinctive-features:8, monotonic-conflict:1, below-confidence-threshold:6 |
| 01 | final-290 | 13:12:27.550–13:12:40.770 | 5 | plaud-1#332…plaud-1#336 | no-direct-source-evidence:2, insufficient-distinctive-features:1, below-confidence-threshold:2 |
| 01 | final-290 | 13:12:46.340–13:12:49.330 | 1 | plaud-1#339…plaud-1#339 | no-direct-source-evidence:1 |
| 01 | final-290 | 13:12:52.650–13:13:01.740 | 2 | plaud-1#341…plaud-1#342 | insufficient-distinctive-features:2 |
| 01 | final-290 | 13:13:09.760–13:13:40.910 | 9 | plaud-1#345…plaud-1#353 | insufficient-distinctive-features:9 |
| 01 | final-290 | 13:13:45.340–13:16:23.520 | 46 | plaud-1#355…plaud-1#400 | no-direct-source-evidence:8, insufficient-distinctive-features:21, below-confidence-threshold:5, ambiguous-page-candidates:12 |
| 01 | final-290 | 13:16:29.080–13:16:34.780 | 2 | plaud-1#402…plaud-1#403 | no-direct-source-evidence:2 |
| 01 | final-290 | 13:16:40.140–13:16:44.800 | 1 | plaud-1#405…plaud-1#405 | no-direct-source-evidence:1 |
| 01 | final-290 | 13:16:49.200–13:16:52.570 | 2 | plaud-1#407…plaud-1#408 | no-direct-source-evidence:2 |
| 01 | final-290 | 13:16:56.620–13:17:00.960 | 1 | plaud-1#410…plaud-1#410 | below-confidence-threshold:1 |
| 01 | final-290 | 13:17:10.450–13:20:14.810 | 38 | plaud-1#413…plaud-1#450 | insufficient-distinctive-features:27, below-confidence-threshold:5, monotonic-conflict:5, no-direct-source-evidence:1 |
| 01 | final-290 | 13:20:22.280–13:20:36.930 | 6 | plaud-1#452…plaud-1#457 | insufficient-distinctive-features:2, ambiguous-page-candidates:1, no-direct-source-evidence:3 |
| 01 | final-290 | 13:20:40.990–13:20:56.960 | 7 | plaud-1#459…plaud-1#465 | no-direct-source-evidence:2, below-confidence-threshold:1, insufficient-distinctive-features:4 |
| 01 | final-290 | 13:21:01.460–13:21:23.450 | 8 | plaud-1#467…plaud-1#474 | no-direct-source-evidence:4, insufficient-distinctive-features:3, monotonic-conflict:1 |
| 01 | final-290 | 13:21:26.710–13:21:30.580 | 1 | plaud-1#476…plaud-1#476 | no-direct-source-evidence:1 |
| 01 | final-290 | 13:21:35.220–13:23:30.510 | 31 | plaud-1#478…plaud-1#508 | insufficient-distinctive-features:16, below-confidence-threshold:12, monotonic-conflict:1, no-direct-source-evidence:2 |
| 01 | final-290 | 13:23:34.530–13:23:40.350 | 1 | plaud-1#510…plaud-1#510 | no-direct-source-evidence:1 |
| 01 | final-290 | 13:23:44.680–13:27:42.340 | 85 | plaud-1#512…plaud-1#596 | no-direct-source-evidence:3, below-confidence-threshold:35, insufficient-distinctive-features:46, monotonic-conflict:1 |
| 01 | r17-clean-257 | 13:08:16.380–13:10:19.500 | 67 | plaud-1#224…plaud-1#290 | below-confidence-threshold:36, monotonic-conflict:2, no-direct-source-evidence:4, insufficient-distinctive-features:25 |
| 01 | r17-clean-257 | 13:10:22.760–13:10:23.600 | 1 | plaud-1#292…plaud-1#292 | no-direct-source-evidence:1 |
| 01 | r17-clean-257 | 13:10:35.030–13:11:00.110 | 9 | plaud-1#296…plaud-1#304 | insufficient-independent-lexical-words:2, insufficient-distinctive-features:5, below-confidence-threshold:2 |
| 01 | r17-clean-257 | 13:11:02.490–13:11:21.610 | 7 | plaud-1#306…plaud-1#312 | no-direct-source-evidence:1, insufficient-distinctive-features:4, below-confidence-threshold:2 |
| 01 | r17-clean-257 | 13:11:27.260–13:12:25.250 | 17 | plaud-1#314…plaud-1#330 | no-direct-source-evidence:2, insufficient-distinctive-features:10, monotonic-conflict:1, below-confidence-threshold:4 |
| 01 | r17-clean-257 | 13:12:27.550–13:12:40.770 | 5 | plaud-1#332…plaud-1#336 | no-direct-source-evidence:2, insufficient-distinctive-features:1, below-confidence-threshold:2 |
| 01 | r17-clean-257 | 13:12:46.340–13:12:49.330 | 1 | plaud-1#339…plaud-1#339 | no-direct-source-evidence:1 |
| 01 | r17-clean-257 | 13:12:52.650–13:14:09.960 | 21 | plaud-1#341…plaud-1#361 | insufficient-distinctive-features:8, ambiguous-page-candidates:3, monotonic-conflict:3, insufficient-independent-lexical-words:2, no-direct-source-evidence:1, below-confidence-threshold:4 |
| 01 | r17-clean-257 | 13:14:14.440–13:14:36.770 | 8 | plaud-1#363…plaud-1#370 | no-direct-source-evidence:1, insufficient-distinctive-features:7 |
| 01 | r17-clean-257 | 13:14:42.260–13:14:43.260 | 1 | plaud-1#372…plaud-1#372 | no-direct-source-evidence:1 |
| 01 | r17-clean-257 | 13:14:47.550–13:14:52.330 | 1 | plaud-1#374…plaud-1#374 | insufficient-distinctive-features:1 |
| 01 | r17-clean-257 | 13:15:00.830–13:15:35.420 | 9 | plaud-1#376…plaud-1#384 | below-confidence-threshold:3, insufficient-distinctive-features:5, insufficient-independent-lexical-words:1 |
| 01 | r17-clean-257 | 13:15:37.770–13:15:41.370 | 1 | plaud-1#386…plaud-1#386 | no-direct-source-evidence:1 |
| 01 | r17-clean-257 | 13:15:44.360–13:15:45.790 | 1 | plaud-1#388…plaud-1#388 | no-direct-source-evidence:1 |
| 01 | r17-clean-257 | 13:15:47.930–13:16:00.560 | 4 | plaud-1#390…plaud-1#393 | no-direct-source-evidence:1, insufficient-distinctive-features:3 |
| 01 | r17-clean-257 | 13:16:06.500–13:16:08.370 | 1 | plaud-1#396…plaud-1#396 | no-direct-source-evidence:1 |
| 01 | r17-clean-257 | 13:16:10.470–13:16:56.620 | 12 | plaud-1#398…plaud-1#409 | no-direct-source-evidence:7, insufficient-distinctive-features:1, ambiguous-page-candidates:4 |
| 01 | r17-clean-257 | 13:17:05.590–13:17:24.290 | 5 | plaud-1#412…plaud-1#416 | ambiguous-page-candidates:1, insufficient-distinctive-features:4 |
| 01 | r17-clean-257 | 13:17:36.980–13:20:14.810 | 33 | plaud-1#418…plaud-1#450 | below-confidence-threshold:5, monotonic-conflict:6, no-direct-source-evidence:1, insufficient-distinctive-features:19, insufficient-independent-lexical-words:2 |
| 01 | r17-clean-257 | 13:20:22.280–13:20:56.960 | 14 | plaud-1#452…plaud-1#465 | insufficient-distinctive-features:6, monotonic-conflict:1, no-direct-source-evidence:5, ambiguous-page-candidates:1, below-confidence-threshold:1 |
| 01 | r17-clean-257 | 13:21:01.460–13:21:06.160 | 3 | plaud-1#467…plaud-1#469 | no-direct-source-evidence:3 |
| 01 | r17-clean-257 | 13:21:08.160–13:23:14.360 | 34 | plaud-1#471…plaud-1#504 | monotonic-conflict:1, no-direct-source-evidence:1, insufficient-distinctive-features:18, below-confidence-threshold:14 |
| 01 | r17-clean-257 | 13:23:18.190–13:27:42.340 | 91 | plaud-1#506…plaud-1#596 | no-direct-source-evidence:4, insufficient-distinctive-features:49, below-confidence-threshold:37, monotonic-conflict:1 |
| 02 | final-290 | 13:27:42.340–13:27:49.300 | 2 | plaud-1#597…plaud-1#598 | insufficient-distinctive-features:1, ambiguous-page-candidates:1 |
| 02 | final-290 | 13:27:57.330–13:31:22.570 | 46 | plaud-1#600…plaud-1#645 | insufficient-distinctive-features:32, below-confidence-threshold:12, monotonic-conflict:1, ambiguous-page-candidates:1 |
| 02 | final-290 | 13:31:23.630–13:35:53.630 | 113 | plaud-1#647…plaud-1#759 | no-direct-source-evidence:2, insufficient-distinctive-features:72, below-confidence-threshold:17, insufficient-independent-lexical-words:22 |
| 02 | final-290 | 13:36:01.330–13:36:05.330 | 3 | plaud-1#763…plaud-1#765 | no-direct-source-evidence:3 |
| 02 | final-290 | 13:36:08.520–13:38:51.230 | 120 | plaud-1#767…plaud-1#886 | insufficient-independent-lexical-words:10, insufficient-distinctive-features:103, below-confidence-threshold:7 |
| 02 | final-290 | 13:38:52.230–13:38:57.520 | 4 | plaud-1#888…plaud-1#891 | no-direct-source-evidence:4 |
| 02 | final-290 | 13:38:59.470–13:43:28.440 | 221 | plaud-1#893…plaud-1#1113 | insufficient-distinctive-features:146, below-confidence-threshold:60, insufficient-independent-lexical-words:15 |
| 02 | final-290 | 13:43:31.440–13:44:29.890 | 23 | plaud-1#1117…plaud-1#1139 | no-direct-source-evidence:5, below-confidence-threshold:7, insufficient-distinctive-features:8, insufficient-independent-lexical-words:1, ambiguous-page-candidates:2 |
| 02 | final-290 | 13:44:35.650–13:48:18.970 | 155 | plaud-1#1142…plaud-1#1296 | no-direct-source-evidence:7, insufficient-distinctive-features:118, below-confidence-threshold:17, ambiguous-page-candidates:2, insufficient-independent-lexical-words:11 |
| 02 | final-290 | 13:48:24.440–13:48:25.440 | 1 | plaud-1#1299…plaud-1#1299 | no-direct-source-evidence:1 |
| 02 | final-290 | 13:48:27.470–13:50:39.040 | 88 | plaud-1#1301…plaud-1#1388 | insufficient-distinctive-features:48, below-confidence-threshold:30, insufficient-independent-lexical-words:10 |
| 02 | r17-clean-257 | 13:27:42.340–13:27:45.300 | 1 | plaud-1#597…plaud-1#597 | insufficient-distinctive-features:1 |
| 02 | r17-clean-257 | 13:27:57.330–13:31:20.570 | 45 | plaud-1#600…plaud-1#644 | insufficient-distinctive-features:33, below-confidence-threshold:12 |
| 02 | r17-clean-257 | 13:31:23.630–13:35:41.580 | 110 | plaud-1#647…plaud-1#756 | no-direct-source-evidence:2, insufficient-distinctive-features:77, below-confidence-threshold:16, insufficient-independent-lexical-words:15 |
| 02 | r17-clean-257 | 13:35:45.400–13:35:53.630 | 2 | plaud-1#758…plaud-1#759 | no-direct-source-evidence:1, below-confidence-threshold:1 |
| 02 | r17-clean-257 | 13:36:01.330–13:36:05.330 | 3 | plaud-1#763…plaud-1#765 | no-direct-source-evidence:3 |
| 02 | r17-clean-257 | 13:36:08.520–13:45:38.890 | 418 | plaud-1#767…plaud-1#1184 | monotonic-conflict:5, no-direct-source-evidence:7, insufficient-distinctive-features:306, below-confidence-threshold:78, insufficient-independent-lexical-words:22 |
| 02 | r17-clean-257 | 13:45:42.110–13:47:45.690 | 92 | plaud-1#1187…plaud-1#1278 | no-direct-source-evidence:5, insufficient-distinctive-features:67, below-confidence-threshold:13, insufficient-independent-lexical-words:7 |
| 02 | r17-clean-257 | 13:47:49.510–13:47:50.510 | 1 | plaud-1#1281…plaud-1#1281 | no-direct-source-evidence:1 |
| 02 | r17-clean-257 | 13:47:51.470–13:49:37.610 | 58 | plaud-1#1283…plaud-1#1340 | no-direct-source-evidence:3, insufficient-distinctive-features:33, insufficient-independent-lexical-words:3, monotonic-conflict:3, below-confidence-threshold:16 |
| 02 | r17-clean-257 | 13:49:38.610–13:49:39.610 | 2 | plaud-1#1342…plaud-1#1343 | no-direct-source-evidence:2 |
| 02 | r17-clean-257 | 13:49:40.610–13:49:41.800 | 1 | plaud-1#1345…plaud-1#1345 | no-direct-source-evidence:1 |
| 02 | r17-clean-257 | 13:49:42.800–13:49:44.800 | 2 | plaud-1#1347…plaud-1#1348 | no-direct-source-evidence:2 |
| 02 | r17-clean-257 | 13:49:47.370–13:49:48.850 | 1 | plaud-1#1350…plaud-1#1350 | no-direct-source-evidence:1 |
| 02 | r17-clean-257 | 13:49:49.810–13:50:00.330 | 8 | plaud-1#1352…plaud-1#1359 | no-direct-source-evidence:3, insufficient-distinctive-features:5 |
| 02 | r17-clean-257 | 13:50:02.330–13:50:03.330 | 1 | plaud-1#1362…plaud-1#1362 | no-direct-source-evidence:1 |
| 02 | r17-clean-257 | 13:50:04.650–13:50:06.650 | 1 | plaud-1#1364…plaud-1#1364 | no-direct-source-evidence:1 |
| 02 | r17-clean-257 | 13:50:08.570–13:50:39.040 | 23 | plaud-1#1366…plaud-1#1388 | no-direct-source-evidence:1, insufficient-independent-lexical-words:10, insufficient-distinctive-features:12 |
| 03 | final-290 | 13:50:39.040–13:52:09.600 | 17 | plaud-1#1389…plaud-1#1405 | below-confidence-threshold:9, insufficient-distinctive-features:2, insufficient-independent-lexical-words:6 |
| 03 | final-290 | 13:52:12.760–13:52:14.760 | 1 | plaud-1#1407…plaud-1#1407 | no-direct-source-evidence:1 |
| 03 | final-290 | 13:52:16.790–13:52:19.140 | 1 | plaud-1#1409…plaud-1#1409 | no-direct-source-evidence:1 |
| 03 | final-290 | 13:52:21.140–13:52:22.320 | 1 | plaud-1#1411…plaud-1#1411 | no-direct-source-evidence:1 |
| 03 | final-290 | 13:52:25.360–13:53:41.640 | 23 | plaud-1#1413…plaud-1#1435 | insufficient-independent-lexical-words:1, insufficient-distinctive-features:21, below-confidence-threshold:1 |
| 03 | final-290 | 13:54:11.520–13:54:15.710 | 1 | plaud-1#1443…plaud-1#1443 | insufficient-distinctive-features:1 |
| 03 | final-290 | 13:54:17.800–13:54:20.800 | 1 | plaud-1#1445…plaud-1#1445 | no-direct-source-evidence:1 |
| 03 | final-290 | 13:54:59.670–13:55:13.010 | 3 | plaud-1#1456…plaud-1#1458 | no-direct-source-evidence:2, insufficient-distinctive-features:1 |
| 03 | final-290 | 13:55:15.000–13:56:45.890 | 28 | plaud-1#1460…plaud-1#1487 | no-direct-source-evidence:2, insufficient-distinctive-features:23, ambiguous-page-candidates:3 |
| 03 | final-290 | 13:56:54.680–13:57:00.660 | 2 | plaud-1#1490…plaud-1#1491 | insufficient-independent-lexical-words:2 |
| 03 | final-290 | 13:57:03.620–13:57:07.550 | 1 | plaud-1#1493…plaud-1#1493 | below-confidence-threshold:1 |
| 03 | final-290 | 13:57:17.070–14:03:13.480 | 175 | plaud-1#1496…plaud-1#1670 | monotonic-conflict:2, insufficient-distinctive-features:116, below-confidence-threshold:52, ambiguous-page-candidates:1, no-direct-source-evidence:1, insufficient-independent-lexical-words:3 |
| 03 | final-290 | 14:03:16.990–14:03:18.140 | 1 | plaud-1#1673…plaud-1#1673 | no-direct-source-evidence:1 |
| 03 | final-290 | 14:03:21.740–14:03:22.740 | 1 | plaud-1#1676…plaud-1#1676 | no-direct-source-evidence:1 |
| 03 | final-290 | 14:03:23.740–14:03:25.710 | 2 | plaud-1#1678…plaud-1#1679 | no-direct-source-evidence:2 |
| 03 | final-290 | 14:03:28.710–14:03:37.250 | 9 | plaud-1#1682…plaud-1#1690 | insufficient-distinctive-features:9 |
| 03 | final-290 | 14:03:43.310–14:04:13.280 | 29 | plaud-1#1697…plaud-1#1725 | insufficient-independent-lexical-words:6, insufficient-distinctive-features:21, below-confidence-threshold:2 |
| 03 | final-290 | 14:04:14.280–14:04:18.380 | 5 | plaud-1#1727…plaud-1#1731 | no-direct-source-evidence:4, insufficient-distinctive-features:1 |
| 03 | final-290 | 14:04:20.280–14:04:47.970 | 23 | plaud-1#1733…plaud-1#1755 | no-direct-source-evidence:1, insufficient-distinctive-features:13, below-confidence-threshold:9 |
| 03 | final-290 | 14:04:50.970–14:04:51.970 | 1 | plaud-1#1760…plaud-1#1760 | no-direct-source-evidence:1 |
| 03 | final-290 | 14:04:55.330–14:05:03.330 | 13 | plaud-1#1762…plaud-1#1774 | no-direct-source-evidence:4, insufficient-independent-lexical-words:2, monotonic-conflict:1, insufficient-distinctive-features:6 |
| 03 | final-290 | 14:05:04.330–14:05:06.580 | 2 | plaud-1#1776…plaud-1#1777 | no-direct-source-evidence:2 |
| 03 | final-290 | 14:05:08.480–14:05:09.480 | 1 | plaud-1#1781…plaud-1#1781 | no-direct-source-evidence:1 |
| 03 | final-290 | 14:05:13.190–14:05:14.190 | 1 | plaud-1#1783…plaud-1#1783 | no-direct-source-evidence:1 |
| 03 | final-290 | 14:05:15.190–14:05:19.790 | 5 | plaud-1#1785…plaud-1#1789 | no-direct-source-evidence:2, insufficient-distinctive-features:3 |
| 03 | final-290 | 14:05:21.690–14:05:22.610 | 1 | plaud-1#1792…plaud-1#1792 | no-direct-source-evidence:1 |
| 03 | final-290 | 14:05:23.680–14:05:35.730 | 13 | plaud-1#1794…plaud-1#1806 | no-direct-source-evidence:4, insufficient-distinctive-features:7, below-confidence-threshold:2 |
| 03 | final-290 | 14:05:37.830–14:05:40.830 | 3 | plaud-1#1808…plaud-1#1810 | no-direct-source-evidence:3 |
| 03 | final-290 | 14:05:41.830–14:05:47.470 | 4 | plaud-1#1812…plaud-1#1815 | no-direct-source-evidence:4 |
| 03 | final-290 | 14:05:47.470–14:05:48.470 | 1 | plaud-1#1817…plaud-1#1817 | no-direct-source-evidence:1 |
| 03 | final-290 | 14:05:50.470–14:05:54.100 | 2 | plaud-1#1820…plaud-1#1821 | no-direct-source-evidence:2 |
| 03 | final-290 | 14:05:55.100–14:05:56.100 | 1 | plaud-1#1823…plaud-1#1823 | no-direct-source-evidence:1 |
| 03 | final-290 | 14:05:57.100–14:06:51.940 | 49 | plaud-1#1825…plaud-1#1873 | no-direct-source-evidence:13, below-confidence-threshold:17, insufficient-distinctive-features:14, ambiguous-page-candidates:4, insufficient-independent-lexical-words:1 |
| 03 | final-290 | 14:06:52.940–14:07:31.240 | 33 | plaud-1#1875…plaud-1#1907 | no-direct-source-evidence:7, below-confidence-threshold:10, insufficient-distinctive-features:12, insufficient-independent-lexical-words:4 |
| 03 | final-290 | 14:07:33.240–14:11:17.350 | 191 | plaud-1#1910…plaud-1#2100 | no-direct-source-evidence:15, insufficient-distinctive-features:95, below-confidence-threshold:71, insufficient-independent-lexical-words:6, monotonic-conflict:4 |
| 03 | r17-clean-257 | 13:50:39.040–13:50:45.030 | 5 | plaud-1#1389…plaud-1#1393 | below-confidence-threshold:4, insufficient-distinctive-features:1 |
| 03 | r17-clean-257 | 13:50:47.030–13:52:09.600 | 11 | plaud-1#1395…plaud-1#1405 | no-direct-source-evidence:2, insufficient-distinctive-features:1, below-confidence-threshold:2, insufficient-independent-lexical-words:6 |
| 03 | r17-clean-257 | 13:52:12.760–13:52:14.760 | 1 | plaud-1#1407…plaud-1#1407 | no-direct-source-evidence:1 |
| 03 | r17-clean-257 | 13:52:16.790–13:52:19.140 | 1 | plaud-1#1409…plaud-1#1409 | no-direct-source-evidence:1 |
| 03 | r17-clean-257 | 13:52:21.140–13:52:22.320 | 1 | plaud-1#1411…plaud-1#1411 | no-direct-source-evidence:1 |
| 03 | r17-clean-257 | 13:52:25.360–13:53:41.640 | 23 | plaud-1#1413…plaud-1#1435 | insufficient-independent-lexical-words:1, insufficient-distinctive-features:20, below-confidence-threshold:2 |
| 03 | r17-clean-257 | 13:54:11.520–13:54:15.710 | 1 | plaud-1#1443…plaud-1#1443 | insufficient-distinctive-features:1 |
| 03 | r17-clean-257 | 13:54:17.800–13:54:20.800 | 1 | plaud-1#1445…plaud-1#1445 | no-direct-source-evidence:1 |
| 03 | r17-clean-257 | 13:54:59.670–13:55:13.010 | 3 | plaud-1#1456…plaud-1#1458 | no-direct-source-evidence:2, insufficient-distinctive-features:1 |
| 03 | r17-clean-257 | 13:55:15.000–13:56:13.830 | 20 | plaud-1#1460…plaud-1#1479 | no-direct-source-evidence:2, insufficient-distinctive-features:16, monotonic-conflict:1, below-confidence-threshold:1 |
| 03 | r17-clean-257 | 13:56:17.050–13:56:45.890 | 7 | plaud-1#1481…plaud-1#1487 | no-direct-source-evidence:1, insufficient-distinctive-features:5, below-confidence-threshold:1 |
| 03 | r17-clean-257 | 13:56:54.680–13:57:00.660 | 2 | plaud-1#1490…plaud-1#1491 | insufficient-independent-lexical-words:2 |
| 03 | r17-clean-257 | 13:57:03.620–13:57:07.550 | 1 | plaud-1#1493…plaud-1#1493 | insufficient-distinctive-features:1 |
| 03 | r17-clean-257 | 13:57:17.070–13:59:46.680 | 38 | plaud-1#1496…plaud-1#1533 | monotonic-conflict:2, insufficient-distinctive-features:21, below-confidence-threshold:15 |
| 03 | r17-clean-257 | 13:59:49.680–14:03:13.480 | 136 | plaud-1#1535…plaud-1#1670 | no-direct-source-evidence:1, insufficient-distinctive-features:106, below-confidence-threshold:26, insufficient-independent-lexical-words:3 |
| 03 | r17-clean-257 | 14:03:14.480–14:04:13.280 | 54 | plaud-1#1672…plaud-1#1725 | no-direct-source-evidence:4, monotonic-conflict:1, insufficient-distinctive-features:30, below-confidence-threshold:19 |
| 03 | r17-clean-257 | 14:04:14.280–14:04:18.380 | 5 | plaud-1#1727…plaud-1#1731 | no-direct-source-evidence:4, insufficient-distinctive-features:1 |
| 03 | r17-clean-257 | 14:04:20.280–14:04:47.970 | 23 | plaud-1#1733…plaud-1#1755 | no-direct-source-evidence:1, insufficient-distinctive-features:14, below-confidence-threshold:8 |
| 03 | r17-clean-257 | 14:04:50.970–14:04:51.970 | 1 | plaud-1#1760…plaud-1#1760 | no-direct-source-evidence:1 |
| 03 | r17-clean-257 | 14:04:55.330–14:05:03.330 | 13 | plaud-1#1762…plaud-1#1774 | no-direct-source-evidence:4, insufficient-independent-lexical-words:2, monotonic-conflict:1, insufficient-distinctive-features:6 |
| 03 | r17-clean-257 | 14:05:04.330–14:05:06.580 | 2 | plaud-1#1776…plaud-1#1777 | no-direct-source-evidence:2 |
| 03 | r17-clean-257 | 14:05:08.480–14:05:09.480 | 1 | plaud-1#1781…plaud-1#1781 | no-direct-source-evidence:1 |
| 03 | r17-clean-257 | 14:05:13.190–14:05:14.190 | 1 | plaud-1#1783…plaud-1#1783 | no-direct-source-evidence:1 |
| 03 | r17-clean-257 | 14:05:15.190–14:05:19.790 | 5 | plaud-1#1785…plaud-1#1789 | no-direct-source-evidence:2, insufficient-distinctive-features:3 |
| 03 | r17-clean-257 | 14:05:21.690–14:05:22.610 | 1 | plaud-1#1792…plaud-1#1792 | no-direct-source-evidence:1 |
| 03 | r17-clean-257 | 14:05:23.680–14:05:35.730 | 13 | plaud-1#1794…plaud-1#1806 | no-direct-source-evidence:4, insufficient-distinctive-features:7, below-confidence-threshold:2 |
| 03 | r17-clean-257 | 14:05:37.830–14:05:40.830 | 3 | plaud-1#1808…plaud-1#1810 | no-direct-source-evidence:3 |
| 03 | r17-clean-257 | 14:05:41.830–14:05:47.470 | 4 | plaud-1#1812…plaud-1#1815 | no-direct-source-evidence:4 |
| 03 | r17-clean-257 | 14:05:47.470–14:05:48.470 | 1 | plaud-1#1817…plaud-1#1817 | no-direct-source-evidence:1 |
| 03 | r17-clean-257 | 14:05:50.470–14:05:54.100 | 2 | plaud-1#1820…plaud-1#1821 | no-direct-source-evidence:2 |
| 03 | r17-clean-257 | 14:05:55.100–14:05:56.100 | 1 | plaud-1#1823…plaud-1#1823 | no-direct-source-evidence:1 |
| 03 | r17-clean-257 | 14:05:57.100–14:06:39.520 | 41 | plaud-1#1825…plaud-1#1865 | no-direct-source-evidence:6, below-confidence-threshold:17, insufficient-distinctive-features:18 |
| 03 | r17-clean-257 | 14:06:42.380–14:06:51.940 | 7 | plaud-1#1867…plaud-1#1873 | no-direct-source-evidence:3, insufficient-distinctive-features:4 |
| 03 | r17-clean-257 | 14:06:52.940–14:07:31.240 | 33 | plaud-1#1875…plaud-1#1907 | no-direct-source-evidence:7, below-confidence-threshold:5, insufficient-distinctive-features:17, insufficient-independent-lexical-words:4 |
| 03 | r17-clean-257 | 14:07:33.240–14:08:55.640 | 56 | plaud-1#1910…plaud-1#1965 | no-direct-source-evidence:2, insufficient-distinctive-features:23, below-confidence-threshold:25, insufficient-independent-lexical-words:6 |
| 03 | r17-clean-257 | 14:08:56.640–14:09:06.190 | 10 | plaud-1#1967…plaud-1#1976 | no-direct-source-evidence:8, insufficient-distinctive-features:2 |
| 03 | r17-clean-257 | 14:09:09.190–14:09:12.920 | 3 | plaud-1#1980…plaud-1#1982 | no-direct-source-evidence:3 |
| 03 | r17-clean-257 | 14:09:13.920–14:09:16.020 | 2 | plaud-1#1984…plaud-1#1985 | no-direct-source-evidence:2 |
| 03 | r17-clean-257 | 14:09:17.020–14:09:45.580 | 27 | plaud-1#1987…plaud-1#2013 | no-direct-source-evidence:7, insufficient-distinctive-features:8, below-confidence-threshold:3, insufficient-independent-lexical-words:7, monotonic-conflict:2 |
| 03 | r17-clean-257 | 14:09:47.580–14:09:52.540 | 5 | plaud-1#2016…plaud-1#2020 | no-direct-source-evidence:5 |
| 03 | r17-clean-257 | 14:09:53.510–14:11:17.350 | 79 | plaud-1#2022…plaud-1#2100 | no-direct-source-evidence:10, insufficient-distinctive-features:60, below-confidence-threshold:7, monotonic-conflict:2 |
| 04 | final-290 | 14:11:17.350–14:46:18.030 | 38 | plaud-1#2101…plaud-1#2138 | non-lecture:38 |
| 04 | r17-clean-257 | 14:11:17.350–14:46:18.030 | 38 | plaud-1#2101…plaud-1#2138 | non-lecture:38 |
| 05 | final-290 | 14:46:18.030–14:56:09.600 | 1 | plaud-1#2139…plaud-1#2139 | long-source-segment:1 |
| 05 | r17-clean-257 | 14:46:18.030–14:56:09.600 | 1 | plaud-1#2139…plaud-1#2139 | long-source-segment:1 |
| 06 | final-290 | 14:56:09.600–15:10:36.080 | 2 | plaud-1#2140…plaud-1#2141 | below-confidence-threshold:1, long-source-segment:1 |
| 06 | r17-clean-257 | 14:56:09.600–15:10:36.080 | 2 | plaud-1#2140…plaud-1#2141 | insufficient-distinctive-features:1, long-source-segment:1 |
| 07 | final-290 | 15:10:36.080–15:14:54.250 | 155 | plaud-1#2142…plaud-1#2296 | below-confidence-threshold:38, insufficient-distinctive-features:101, monotonic-conflict:1, no-direct-source-evidence:8, ambiguous-page-candidates:2, insufficient-independent-lexical-words:5 |
| 07 | final-290 | 15:14:55.250–15:14:56.280 | 1 | plaud-1#2298…plaud-1#2298 | no-direct-source-evidence:1 |
| 07 | final-290 | 15:14:58.280–15:14:59.240 | 1 | plaud-1#2301…plaud-1#2301 | no-direct-source-evidence:1 |
| 07 | final-290 | 15:15:02.310–15:15:06.640 | 4 | plaud-1#2305…plaud-1#2308 | no-direct-source-evidence:4 |
| 07 | final-290 | 15:15:07.640–15:17:43.040 | 120 | plaud-1#2310…plaud-1#2429 | no-direct-source-evidence:25, insufficient-distinctive-features:51, below-confidence-threshold:33, ambiguous-page-candidates:6, monotonic-conflict:2, insufficient-independent-lexical-words:3 |
| 07 | final-290 | 15:17:45.990–15:17:50.370 | 4 | plaud-1#2433…plaud-1#2436 | no-direct-source-evidence:4 |
| 07 | final-290 | 15:17:51.520–15:18:13.020 | 19 | plaud-1#2438…plaud-1#2456 | no-direct-source-evidence:1, insufficient-distinctive-features:18 |
| 07 | final-290 | 15:18:14.020–15:18:15.180 | 2 | plaud-1#2458…plaud-1#2459 | no-direct-source-evidence:2 |
| 07 | final-290 | 15:18:17.010–15:18:18.140 | 1 | plaud-1#2462…plaud-1#2462 | no-direct-source-evidence:1 |
| 07 | final-290 | 15:18:18.140–15:19:19.910 | 51 | plaud-1#2464…plaud-1#2514 | no-direct-source-evidence:6, below-confidence-threshold:9, insufficient-distinctive-features:31, insufficient-independent-lexical-words:4, monotonic-conflict:1 |
| 07 | final-290 | 15:19:21.000–15:19:22.000 | 1 | plaud-1#2516…plaud-1#2516 | no-direct-source-evidence:1 |
| 07 | final-290 | 15:19:23.000–15:19:51.690 | 25 | plaud-1#2518…plaud-1#2542 | no-direct-source-evidence:6, below-confidence-threshold:9, insufficient-independent-lexical-words:3, insufficient-distinctive-features:6, monotonic-conflict:1 |
| 07 | final-290 | 15:19:53.690–15:19:55.230 | 1 | plaud-1#2545…plaud-1#2545 | no-direct-source-evidence:1 |
| 07 | final-290 | 15:19:57.930–15:19:58.900 | 1 | plaud-1#2547…plaud-1#2547 | no-direct-source-evidence:1 |
| 07 | final-290 | 15:20:01.060–15:20:04.280 | 4 | plaud-1#2549…plaud-1#2552 | no-direct-source-evidence:4 |
| 07 | final-290 | 15:20:05.180–15:20:46.970 | 39 | plaud-1#2554…plaud-1#2592 | no-direct-source-evidence:9, insufficient-distinctive-features:12, ambiguous-page-candidates:3, below-confidence-threshold:13, monotonic-conflict:2 |
| 07 | final-290 | 15:20:47.970–15:21:58.300 | 61 | plaud-1#2594…plaud-1#2654 | no-direct-source-evidence:29, ambiguous-page-candidates:11, insufficient-independent-lexical-words:3, insufficient-distinctive-features:4, monotonic-conflict:7, below-confidence-threshold:7 |
| 07 | final-290 | 15:21:59.300–15:22:34.040 | 31 | plaud-1#2656…plaud-1#2686 | ambiguous-page-candidates:3, no-direct-source-evidence:18, monotonic-conflict:7, insufficient-distinctive-features:3 |
| 07 | final-290 | 15:22:37.040–15:22:40.040 | 3 | plaud-1#2690…plaud-1#2692 | no-direct-source-evidence:3 |
| 07 | final-290 | 15:22:41.040–15:22:55.080 | 13 | plaud-1#2694…plaud-1#2706 | no-direct-source-evidence:2, insufficient-distinctive-features:9, below-confidence-threshold:2 |
| 07 | final-290 | 15:22:58.140–15:23:04.930 | 6 | plaud-1#2709…plaud-1#2714 | below-confidence-threshold:3, insufficient-distinctive-features:3 |
| 07 | final-290 | 15:23:05.930–15:23:07.030 | 2 | plaud-1#2716…plaud-1#2717 | insufficient-distinctive-features:1, insufficient-independent-lexical-words:1 |
| 07 | final-290 | 15:23:09.930–15:23:15.380 | 5 | plaud-1#2721…plaud-1#2725 | no-direct-source-evidence:5 |
| 07 | final-290 | 15:23:17.540–15:23:41.870 | 23 | plaud-1#2728…plaud-1#2750 | insufficient-distinctive-features:5, insufficient-independent-lexical-words:14, below-confidence-threshold:4 |
| 07 | final-290 | 15:23:42.870–15:23:47.870 | 4 | plaud-1#2752…plaud-1#2755 | no-direct-source-evidence:4 |
| 07 | final-290 | 15:23:48.960–15:23:52.380 | 3 | plaud-1#2757…plaud-1#2759 | no-direct-source-evidence:1, below-confidence-threshold:1, insufficient-distinctive-features:1 |
| 07 | final-290 | 15:23:53.840–15:23:55.840 | 2 | plaud-1#2761…plaud-1#2762 | no-direct-source-evidence:2 |
| 07 | final-290 | 15:23:56.840–15:24:01.700 | 3 | plaud-1#2764…plaud-1#2766 | no-direct-source-evidence:2, insufficient-distinctive-features:1 |
| 07 | final-290 | 15:24:02.700–15:24:03.720 | 1 | plaud-1#2768…plaud-1#2768 | no-direct-source-evidence:1 |
| 07 | final-290 | 15:24:04.720–15:24:05.870 | 1 | plaud-1#2770…plaud-1#2770 | no-direct-source-evidence:1 |
| 07 | final-290 | 15:24:07.870–15:25:34.470 | 61 | plaud-1#2772…plaud-1#2832 | no-direct-source-evidence:21, below-confidence-threshold:7, ambiguous-page-candidates:4, insufficient-distinctive-features:24, insufficient-independent-lexical-words:3, monotonic-conflict:2 |
| 07 | final-290 | 15:25:35.550–15:25:35.650 | 1 | plaud-1#2834…plaud-1#2834 | no-direct-source-evidence:1 |
| 07 | final-290 | 15:25:36.550–15:25:41.020 | 5 | plaud-1#2836…plaud-1#2840 | no-direct-source-evidence:4, below-confidence-threshold:1 |
| 07 | final-290 | 15:25:42.020–15:25:43.020 | 1 | plaud-1#2842…plaud-1#2842 | no-direct-source-evidence:1 |
| 07 | final-290 | 15:25:44.020–15:25:46.750 | 3 | plaud-1#2844…plaud-1#2846 | no-direct-source-evidence:3 |
| 07 | final-290 | 15:25:47.750–15:25:54.720 | 7 | plaud-1#2848…plaud-1#2854 | insufficient-distinctive-features:7 |
| 07 | final-290 | 15:25:55.720–15:26:36.540 | 36 | plaud-1#2856…plaud-1#2891 | insufficient-distinctive-features:29, below-confidence-threshold:6, insufficient-independent-lexical-words:1 |
| 07 | final-290 | 15:26:37.540–15:26:38.730 | 1 | plaud-1#2893…plaud-1#2893 | no-direct-source-evidence:1 |
| 07 | final-290 | 15:26:40.730–15:26:42.170 | 1 | plaud-1#2896…plaud-1#2896 | no-direct-source-evidence:1 |
| 07 | final-290 | 15:26:47.160–15:27:48.330 | 50 | plaud-1#2900…plaud-1#2949 | no-direct-source-evidence:10, insufficient-distinctive-features:31, ambiguous-page-candidates:1, below-confidence-threshold:7, insufficient-independent-lexical-words:1 |
| 07 | final-290 | 15:27:51.330–15:27:53.450 | 2 | plaud-1#2952…plaud-1#2953 | no-direct-source-evidence:1, below-confidence-threshold:1 |
| 07 | final-290 | 15:27:54.450–15:28:18.870 | 14 | plaud-1#2955…plaud-1#2968 | below-confidence-threshold:1, insufficient-independent-lexical-words:7, insufficient-distinctive-features:6 |
| 07 | final-290 | 15:28:19.870–15:28:22.160 | 2 | plaud-1#2970…plaud-1#2971 | monotonic-conflict:1, no-direct-source-evidence:1 |
| 07 | final-290 | 15:28:28.780–15:28:29.780 | 1 | plaud-1#2975…plaud-1#2975 | no-direct-source-evidence:1 |
| 07 | final-290 | 15:28:31.980–15:28:33.440 | 1 | plaud-1#2977…plaud-1#2977 | no-direct-source-evidence:1 |
| 07 | final-290 | 15:28:35.440–15:28:38.450 | 2 | plaud-1#2979…plaud-1#2980 | no-direct-source-evidence:2 |
| 07 | final-290 | 15:28:40.450–15:28:43.840 | 4 | plaud-1#2983…plaud-1#2986 | no-direct-source-evidence:4 |
| 07 | final-290 | 15:28:46.740–15:28:50.260 | 4 | plaud-1#2990…plaud-1#2993 | no-direct-source-evidence:4 |
| 07 | final-290 | 15:28:54.360–15:32:01.730 | 132 | plaud-1#2995…plaud-1#3126 | insufficient-distinctive-features:94, below-confidence-threshold:7, ambiguous-page-candidates:10, insufficient-independent-lexical-words:9, no-direct-source-evidence:12 |
| 07 | final-290 | 15:32:05.370–15:32:06.690 | 1 | plaud-1#3128…plaud-1#3128 | no-direct-source-evidence:1 |
| 07 | final-290 | 15:32:08.640–15:32:10.940 | 2 | plaud-1#3130…plaud-1#3131 | no-direct-source-evidence:2 |
| 07 | final-290 | 15:32:11.940–15:34:08.020 | 90 | plaud-1#3133…plaud-1#3222 | no-direct-source-evidence:13, insufficient-distinctive-features:47, below-confidence-threshold:22, monotonic-conflict:2, insufficient-independent-lexical-words:5, ambiguous-page-candidates:1 |
| 07 | r17-clean-257 | 15:10:36.080–15:14:54.250 | 155 | plaud-1#2142…plaud-1#2296 | below-confidence-threshold:35, insufficient-distinctive-features:104, monotonic-conflict:2, no-direct-source-evidence:8, ambiguous-page-candidates:1, insufficient-independent-lexical-words:5 |
| 07 | r17-clean-257 | 15:14:55.250–15:14:56.280 | 1 | plaud-1#2298…plaud-1#2298 | no-direct-source-evidence:1 |
| 07 | r17-clean-257 | 15:14:58.280–15:14:59.240 | 1 | plaud-1#2301…plaud-1#2301 | no-direct-source-evidence:1 |
| 07 | r17-clean-257 | 15:15:02.310–15:15:06.640 | 4 | plaud-1#2305…plaud-1#2308 | no-direct-source-evidence:4 |
| 07 | r17-clean-257 | 15:15:07.640–15:15:47.550 | 29 | plaud-1#2310…plaud-1#2338 | no-direct-source-evidence:11, insufficient-distinctive-features:13, below-confidence-threshold:4, ambiguous-page-candidates:1 |
| 07 | r17-clean-257 | 15:15:48.450–15:15:49.600 | 1 | plaud-1#2340…plaud-1#2340 | no-direct-source-evidence:1 |
| 07 | r17-clean-257 | 15:15:50.600–15:15:52.820 | 2 | plaud-1#2342…plaud-1#2343 | no-direct-source-evidence:2 |
| 07 | r17-clean-257 | 15:15:55.230–15:15:57.230 | 2 | plaud-1#2345…plaud-1#2346 | no-direct-source-evidence:2 |
| 07 | r17-clean-257 | 15:15:58.230–15:16:04.540 | 6 | plaud-1#2348…plaud-1#2353 | no-direct-source-evidence:4, monotonic-conflict:2 |
| 07 | r17-clean-257 | 15:16:05.570–15:17:44.030 | 76 | plaud-1#2355…plaud-1#2430 | no-direct-source-evidence:9, insufficient-distinctive-features:43, below-confidence-threshold:20, monotonic-conflict:3, insufficient-independent-lexical-words:1 |
| 07 | r17-clean-257 | 15:17:45.990–15:17:50.370 | 4 | plaud-1#2433…plaud-1#2436 | no-direct-source-evidence:4 |
| 07 | r17-clean-257 | 15:17:51.520–15:18:13.020 | 19 | plaud-1#2438…plaud-1#2456 | no-direct-source-evidence:1, insufficient-distinctive-features:17, below-confidence-threshold:1 |
| 07 | r17-clean-257 | 15:18:14.020–15:18:15.180 | 2 | plaud-1#2458…plaud-1#2459 | no-direct-source-evidence:2 |
| 07 | r17-clean-257 | 15:18:17.010–15:18:18.140 | 1 | plaud-1#2462…plaud-1#2462 | no-direct-source-evidence:1 |
| 07 | r17-clean-257 | 15:18:18.140–15:19:19.910 | 51 | plaud-1#2464…plaud-1#2514 | no-direct-source-evidence:6, insufficient-distinctive-features:29, below-confidence-threshold:13, insufficient-independent-lexical-words:3 |
| 07 | r17-clean-257 | 15:19:21.000–15:19:22.000 | 1 | plaud-1#2516…plaud-1#2516 | no-direct-source-evidence:1 |
| 07 | r17-clean-257 | 15:19:23.000–15:19:51.690 | 25 | plaud-1#2518…plaud-1#2542 | no-direct-source-evidence:6, below-confidence-threshold:5, insufficient-distinctive-features:11, insufficient-independent-lexical-words:2, monotonic-conflict:1 |
| 07 | r17-clean-257 | 15:19:53.690–15:19:55.230 | 1 | plaud-1#2545…plaud-1#2545 | no-direct-source-evidence:1 |
| 07 | r17-clean-257 | 15:19:57.930–15:19:58.900 | 1 | plaud-1#2547…plaud-1#2547 | no-direct-source-evidence:1 |
| 07 | r17-clean-257 | 15:20:01.060–15:20:04.280 | 4 | plaud-1#2549…plaud-1#2552 | no-direct-source-evidence:4 |
| 07 | r17-clean-257 | 15:20:05.180–15:20:44.730 | 38 | plaud-1#2554…plaud-1#2591 | no-direct-source-evidence:8, insufficient-distinctive-features:16, insufficient-independent-lexical-words:6, below-confidence-threshold:6, ambiguous-page-candidates:1, monotonic-conflict:1 |
| 07 | r17-clean-257 | 15:20:46.970–15:20:49.970 | 3 | plaud-1#2593…plaud-1#2595 | monotonic-conflict:1, no-direct-source-evidence:1, ambiguous-page-candidates:1 |
| 07 | r17-clean-257 | 15:20:50.970–15:20:56.160 | 5 | plaud-1#2597…plaud-1#2601 | no-direct-source-evidence:5 |
| 07 | r17-clean-257 | 15:20:58.160–15:21:02.790 | 3 | plaud-1#2604…plaud-1#2606 | no-direct-source-evidence:3 |
| 07 | r17-clean-257 | 15:21:06.190–15:21:17.690 | 11 | plaud-1#2608…plaud-1#2618 | insufficient-distinctive-features:2, monotonic-conflict:3, no-direct-source-evidence:6 |
| 07 | r17-clean-257 | 15:21:19.890–15:21:24.390 | 4 | plaud-1#2621…plaud-1#2624 | no-direct-source-evidence:4 |
| 07 | r17-clean-257 | 15:21:25.390–15:21:26.930 | 1 | plaud-1#2626…plaud-1#2626 | no-direct-source-evidence:1 |
| 07 | r17-clean-257 | 15:21:30.310–15:21:31.310 | 1 | plaud-1#2630…plaud-1#2630 | no-direct-source-evidence:1 |
| 07 | r17-clean-257 | 15:21:32.310–15:21:36.500 | 4 | plaud-1#2632…plaud-1#2635 | no-direct-source-evidence:4 |
| 07 | r17-clean-257 | 15:21:38.330–15:21:58.300 | 18 | plaud-1#2637…plaud-1#2654 | no-direct-source-evidence:12, below-confidence-threshold:3, monotonic-conflict:3 |
| 07 | r17-clean-257 | 15:21:59.300–15:22:34.040 | 31 | plaud-1#2656…plaud-1#2686 | ambiguous-page-candidates:3, no-direct-source-evidence:18, monotonic-conflict:8, below-confidence-threshold:2 |
| 07 | r17-clean-257 | 15:22:37.040–15:22:40.040 | 3 | plaud-1#2690…plaud-1#2692 | no-direct-source-evidence:3 |
| 07 | r17-clean-257 | 15:22:41.040–15:22:57.140 | 14 | plaud-1#2694…plaud-1#2707 | no-direct-source-evidence:2, insufficient-distinctive-features:8, below-confidence-threshold:4 |
| 07 | r17-clean-257 | 15:22:58.140–15:23:04.930 | 6 | plaud-1#2709…plaud-1#2714 | below-confidence-threshold:3, insufficient-distinctive-features:3 |
| 07 | r17-clean-257 | 15:23:05.930–15:23:08.930 | 4 | plaud-1#2716…plaud-1#2719 | insufficient-distinctive-features:1, insufficient-independent-lexical-words:3 |
| 07 | r17-clean-257 | 15:23:09.930–15:23:15.380 | 5 | plaud-1#2721…plaud-1#2725 | no-direct-source-evidence:1, insufficient-independent-lexical-words:4 |
| 07 | r17-clean-257 | 15:23:17.540–15:23:41.870 | 23 | plaud-1#2728…plaud-1#2750 | insufficient-distinctive-features:6, insufficient-independent-lexical-words:13, below-confidence-threshold:4 |
| 07 | r17-clean-257 | 15:23:42.870–15:23:47.870 | 4 | plaud-1#2752…plaud-1#2755 | no-direct-source-evidence:4 |
| 07 | r17-clean-257 | 15:23:48.960–15:23:55.840 | 6 | plaud-1#2757…plaud-1#2762 | no-direct-source-evidence:3, below-confidence-threshold:2, ambiguous-page-candidates:1 |
| 07 | r17-clean-257 | 15:23:56.840–15:24:01.700 | 3 | plaud-1#2764…plaud-1#2766 | no-direct-source-evidence:2, insufficient-distinctive-features:1 |
| 07 | r17-clean-257 | 15:24:04.720–15:24:05.870 | 1 | plaud-1#2770…plaud-1#2770 | no-direct-source-evidence:1 |
| 07 | r17-clean-257 | 15:24:07.870–15:25:34.470 | 61 | plaud-1#2772…plaud-1#2832 | no-direct-source-evidence:21, below-confidence-threshold:4, insufficient-distinctive-features:27, ambiguous-page-candidates:2, insufficient-independent-lexical-words:3, monotonic-conflict:4 |
| 07 | r17-clean-257 | 15:25:35.550–15:25:35.650 | 1 | plaud-1#2834…plaud-1#2834 | no-direct-source-evidence:1 |
| 07 | r17-clean-257 | 15:25:36.550–15:26:22.420 | 43 | plaud-1#2836…plaud-1#2878 | no-direct-source-evidence:5, below-confidence-threshold:9, ambiguous-page-candidates:2, insufficient-distinctive-features:27 |
| 07 | r17-clean-257 | 15:26:23.420–15:26:27.450 | 4 | plaud-1#2880…plaud-1#2883 | no-direct-source-evidence:4 |
| 07 | r17-clean-257 | 15:26:28.640–15:26:36.540 | 7 | plaud-1#2885…plaud-1#2891 | insufficient-distinctive-features:5, insufficient-independent-lexical-words:2 |
| 07 | r17-clean-257 | 15:26:37.540–15:26:38.730 | 1 | plaud-1#2893…plaud-1#2893 | no-direct-source-evidence:1 |
| 07 | r17-clean-257 | 15:26:40.730–15:26:42.170 | 1 | plaud-1#2896…plaud-1#2896 | no-direct-source-evidence:1 |
| 07 | r17-clean-257 | 15:26:47.160–15:27:02.800 | 13 | plaud-1#2900…plaud-1#2912 | no-direct-source-evidence:6, insufficient-distinctive-features:7 |
| 07 | r17-clean-257 | 15:27:04.800–15:27:48.330 | 36 | plaud-1#2914…plaud-1#2949 | no-direct-source-evidence:4, insufficient-distinctive-features:26, below-confidence-threshold:5, insufficient-independent-lexical-words:1 |
| 07 | r17-clean-257 | 15:27:51.330–15:27:53.450 | 2 | plaud-1#2952…plaud-1#2953 | no-direct-source-evidence:1, below-confidence-threshold:1 |
| 07 | r17-clean-257 | 15:27:54.450–15:28:44.740 | 33 | plaud-1#2955…plaud-1#2987 | insufficient-independent-lexical-words:15, insufficient-distinctive-features:2, below-confidence-threshold:5, monotonic-conflict:2, ambiguous-page-candidates:2, no-direct-source-evidence:7 |
| 07 | r17-clean-257 | 15:28:46.740–15:28:50.260 | 4 | plaud-1#2990…plaud-1#2993 | no-direct-source-evidence:4 |
| 07 | r17-clean-257 | 15:28:54.360–15:29:30.330 | 27 | plaud-1#2995…plaud-1#3021 | insufficient-distinctive-features:23, below-confidence-threshold:4 |
| 07 | r17-clean-257 | 15:29:32.650–15:30:33.260 | 46 | plaud-1#3023…plaud-1#3068 | below-confidence-threshold:4, insufficient-distinctive-features:35, insufficient-independent-lexical-words:7 |
| 07 | r17-clean-257 | 15:30:36.260–15:30:37.260 | 1 | plaud-1#3071…plaud-1#3071 | no-direct-source-evidence:1 |
| 07 | r17-clean-257 | 15:30:38.210–15:30:59.460 | 15 | plaud-1#3073…plaud-1#3087 | no-direct-source-evidence:3, insufficient-distinctive-features:10, insufficient-independent-lexical-words:2 |
| 07 | r17-clean-257 | 15:31:00.460–15:31:04.320 | 2 | plaud-1#3089…plaud-1#3090 | no-direct-source-evidence:2 |
| 07 | r17-clean-257 | 15:31:05.320–15:31:06.320 | 1 | plaud-1#3092…plaud-1#3092 | no-direct-source-evidence:1 |
| 07 | r17-clean-257 | 15:31:13.570–15:31:22.610 | 7 | plaud-1#3097…plaud-1#3103 | no-direct-source-evidence:5, insufficient-independent-lexical-words:2 |
| 07 | r17-clean-257 | 15:31:24.610–15:31:36.300 | 7 | plaud-1#3105…plaud-1#3111 | no-direct-source-evidence:4, insufficient-independent-lexical-words:1, insufficient-distinctive-features:2 |
| 07 | r17-clean-257 | 15:31:38.300–15:31:42.840 | 4 | plaud-1#3113…plaud-1#3116 | no-direct-source-evidence:4 |
| 07 | r17-clean-257 | 15:31:45.840–15:31:49.250 | 1 | plaud-1#3119…plaud-1#3119 | no-direct-source-evidence:1 |
| 07 | r17-clean-257 | 15:31:50.250–15:32:01.730 | 6 | plaud-1#3121…plaud-1#3126 | no-direct-source-evidence:4, insufficient-distinctive-features:2 |
| 07 | r17-clean-257 | 15:32:05.370–15:32:06.690 | 1 | plaud-1#3128…plaud-1#3128 | no-direct-source-evidence:1 |
| 07 | r17-clean-257 | 15:32:08.640–15:32:10.940 | 2 | plaud-1#3130…plaud-1#3131 | no-direct-source-evidence:2 |
| 07 | r17-clean-257 | 15:32:11.940–15:34:08.020 | 90 | plaud-1#3133…plaud-1#3222 | no-direct-source-evidence:10, insufficient-distinctive-features:49, below-confidence-threshold:25, insufficient-independent-lexical-words:5, monotonic-conflict:1 |
| 08 | final-290 | 15:34:08.020–15:34:47.370 | 15 | plaud-1#3223…plaud-1#3237 | insufficient-distinctive-features:10, ambiguous-page-candidates:1, below-confidence-threshold:1, no-direct-source-evidence:2, insufficient-independent-lexical-words:1 |
| 08 | final-290 | 15:34:49.400–15:34:50.400 | 1 | plaud-1#3240…plaud-1#3240 | no-direct-source-evidence:1 |
| 08 | final-290 | 15:34:55.370–15:36:10.880 | 52 | plaud-1#3242…plaud-1#3293 | ambiguous-page-candidates:2, no-direct-source-evidence:8, below-confidence-threshold:6, insufficient-distinctive-features:29, monotonic-conflict:4, insufficient-independent-lexical-words:3 |
| 08 | final-290 | 15:36:11.880–15:36:14.880 | 3 | plaud-1#3295…plaud-1#3297 | no-direct-source-evidence:3 |
| 08 | final-290 | 15:36:16.880–15:36:17.880 | 1 | plaud-1#3301…plaud-1#3301 | no-direct-source-evidence:1 |
| 08 | final-290 | 15:36:19.880–15:36:22.940 | 3 | plaud-1#3304…plaud-1#3306 | no-direct-source-evidence:3 |
| 08 | final-290 | 15:36:23.940–15:36:26.940 | 2 | plaud-1#3308…plaud-1#3309 | no-direct-source-evidence:2 |
| 08 | final-290 | 15:36:28.940–15:36:31.830 | 2 | plaud-1#3311…plaud-1#3312 | no-direct-source-evidence:2 |
| 08 | final-290 | 15:36:32.830–15:36:34.830 | 2 | plaud-1#3314…plaud-1#3315 | no-direct-source-evidence:2 |
| 08 | final-290 | 15:36:47.620–15:36:48.620 | 1 | plaud-1#3319…plaud-1#3319 | no-direct-source-evidence:1 |
| 08 | final-290 | 15:36:50.620–15:37:01.680 | 11 | plaud-1#3322…plaud-1#3332 | no-direct-source-evidence:3, insufficient-distinctive-features:8 |
| 08 | final-290 | 15:37:02.680–15:39:14.250 | 122 | plaud-1#3334…plaud-1#3455 | no-direct-source-evidence:5, below-confidence-threshold:41, insufficient-distinctive-features:74, monotonic-conflict:2 |
| 08 | final-290 | 15:39:16.250–15:39:24.250 | 7 | plaud-1#3457…plaud-1#3463 | no-direct-source-evidence:6, insufficient-distinctive-features:1 |
| 08 | final-290 | 15:39:25.250–15:39:26.250 | 1 | plaud-1#3465…plaud-1#3465 | no-direct-source-evidence:1 |
| 08 | final-290 | 15:39:27.250–15:39:28.250 | 1 | plaud-1#3467…plaud-1#3467 | no-direct-source-evidence:1 |
| 08 | final-290 | 15:39:29.250–15:39:34.250 | 5 | plaud-1#3469…plaud-1#3473 | no-direct-source-evidence:5 |
| 08 | final-290 | 15:39:35.250–15:39:40.250 | 5 | plaud-1#3475…plaud-1#3479 | ambiguous-page-candidates:1, no-direct-source-evidence:3, monotonic-conflict:1 |
| 08 | final-290 | 15:39:42.250–15:39:44.250 | 2 | plaud-1#3482…plaud-1#3483 | no-direct-source-evidence:2 |
| 08 | final-290 | 15:39:46.250–15:40:03.980 | 17 | plaud-1#3485…plaud-1#3501 | no-direct-source-evidence:9, below-confidence-threshold:6, insufficient-distinctive-features:1, ambiguous-page-candidates:1 |
| 08 | final-290 | 15:40:06.980–15:40:07.980 | 1 | plaud-1#3504…plaud-1#3504 | no-direct-source-evidence:1 |
| 08 | final-290 | 15:40:09.980–15:40:14.980 | 6 | plaud-1#3506…plaud-1#3511 | no-direct-source-evidence:6 |
| 08 | final-290 | 15:40:15.980–15:40:45.520 | 27 | plaud-1#3513…plaud-1#3539 | no-direct-source-evidence:1, below-confidence-threshold:18, insufficient-distinctive-features:8 |
| 08 | final-290 | 15:40:52.520–15:41:22.610 | 24 | plaud-1#3545…plaud-1#3568 | no-direct-source-evidence:2, insufficient-independent-lexical-words:5, insufficient-distinctive-features:17 |
| 08 | final-290 | 15:41:25.710–15:41:26.710 | 1 | plaud-1#3572…plaud-1#3572 | no-direct-source-evidence:1 |
| 08 | final-290 | 15:41:32.710–15:41:35.710 | 2 | plaud-1#3578…plaud-1#3579 | no-direct-source-evidence:2 |
| 08 | final-290 | 15:41:36.710–15:41:38.710 | 1 | plaud-1#3581…plaud-1#3581 | no-direct-source-evidence:1 |
| 08 | final-290 | 15:41:39.710–15:42:12.930 | 31 | plaud-1#3583…plaud-1#3613 | no-direct-source-evidence:7, insufficient-distinctive-features:17, below-confidence-threshold:5, monotonic-conflict:1, insufficient-independent-lexical-words:1 |
| 08 | final-290 | 15:42:13.930–15:47:00.180 | 244 | plaud-1#3615…plaud-1#3858 | no-direct-source-evidence:11, below-confidence-threshold:9, insufficient-distinctive-features:204, monotonic-conflict:2, insufficient-independent-lexical-words:18 |
| 08 | final-290 | 15:47:01.180–15:47:03.180 | 2 | plaud-1#3861…plaud-1#3862 | no-direct-source-evidence:2 |
| 08 | final-290 | 15:47:04.180–15:47:05.180 | 1 | plaud-1#3864…plaud-1#3864 | no-direct-source-evidence:1 |
| 08 | final-290 | 15:47:06.180–15:47:07.280 | 3 | plaud-1#3866…plaud-1#3868 | no-direct-source-evidence:3 |
| 08 | final-290 | 15:47:08.180–15:47:15.100 | 7 | plaud-1#3870…plaud-1#3876 | no-direct-source-evidence:7 |
| 08 | final-290 | 15:47:16.100–15:47:19.100 | 3 | plaud-1#3878…plaud-1#3880 | insufficient-independent-lexical-words:3 |
| 08 | final-290 | 15:47:21.100–15:47:35.060 | 15 | plaud-1#3883…plaud-1#3897 | no-direct-source-evidence:8, insufficient-distinctive-features:5, below-confidence-threshold:2 |
| 08 | final-290 | 15:47:36.060–15:47:41.060 | 6 | plaud-1#3899…plaud-1#3904 | no-direct-source-evidence:6 |
| 08 | final-290 | 15:47:43.060–15:47:45.060 | 2 | plaud-1#3906…plaud-1#3907 | insufficient-independent-lexical-words:1, insufficient-distinctive-features:1 |
| 08 | final-290 | 15:47:46.060–15:48:12.750 | 23 | plaud-1#3909…plaud-1#3931 | no-direct-source-evidence:6, insufficient-distinctive-features:9, below-confidence-threshold:8 |
| 08 | final-290 | 15:48:20.750–15:48:25.750 | 4 | plaud-1#3939…plaud-1#3942 | no-direct-source-evidence:4 |
| 08 | final-290 | 15:48:26.750–15:48:32.750 | 6 | plaud-1#3944…plaud-1#3949 | no-direct-source-evidence:5, below-confidence-threshold:1 |
| 08 | final-290 | 15:48:33.750–15:52:05.410 | 178 | plaud-1#3951…plaud-1#4128 | no-direct-source-evidence:8, below-confidence-threshold:22, insufficient-distinctive-features:142, insufficient-independent-lexical-words:5, ambiguous-page-candidates:1 |
| 08 | final-290 | 15:52:07.410–15:52:09.410 | 1 | plaud-1#4131…plaud-1#4131 | no-direct-source-evidence:1 |
| 08 | final-290 | 15:52:11.410–15:52:58.280 | 48 | plaud-1#4134…plaud-1#4181 | no-direct-source-evidence:8, below-confidence-threshold:12, insufficient-distinctive-features:23, insufficient-independent-lexical-words:5 |
| 08 | final-290 | 15:53:00.180–15:53:04.410 | 3 | plaud-1#4185…plaud-1#4187 | no-direct-source-evidence:3 |
| 08 | final-290 | 15:53:06.650–15:53:15.540 | 9 | plaud-1#4189…plaud-1#4197 | no-direct-source-evidence:1, insufficient-distinctive-features:8 |
| 08 | final-290 | 15:53:16.540–15:53:20.540 | 4 | plaud-1#4199…plaud-1#4202 | no-direct-source-evidence:4 |
| 08 | final-290 | 15:53:21.540–15:53:32.630 | 10 | plaud-1#4204…plaud-1#4213 | no-direct-source-evidence:8, monotonic-conflict:1, ambiguous-page-candidates:1 |
| 08 | final-290 | 15:53:33.630–15:54:44.010 | 67 | plaud-1#4215…plaud-1#4281 | no-direct-source-evidence:11, insufficient-distinctive-features:32, below-confidence-threshold:22, ambiguous-page-candidates:1, monotonic-conflict:1 |
| 08 | r17-clean-257 | 15:34:08.020–15:34:47.370 | 15 | plaud-1#3223…plaud-1#3237 | insufficient-distinctive-features:10, ambiguous-page-candidates:1, no-direct-source-evidence:3, insufficient-independent-lexical-words:1 |
| 08 | r17-clean-257 | 15:34:49.400–15:34:50.400 | 1 | plaud-1#3240…plaud-1#3240 | no-direct-source-evidence:1 |
| 08 | r17-clean-257 | 15:34:56.370–15:36:10.880 | 51 | plaud-1#3243…plaud-1#3293 | no-direct-source-evidence:6, insufficient-distinctive-features:34, monotonic-conflict:3, below-confidence-threshold:1, insufficient-independent-lexical-words:7 |
| 08 | r17-clean-257 | 15:36:11.880–15:36:14.880 | 3 | plaud-1#3295…plaud-1#3297 | no-direct-source-evidence:3 |
| 08 | r17-clean-257 | 15:36:16.880–15:36:17.880 | 1 | plaud-1#3301…plaud-1#3301 | no-direct-source-evidence:1 |
| 08 | r17-clean-257 | 15:36:19.880–15:36:22.940 | 3 | plaud-1#3304…plaud-1#3306 | no-direct-source-evidence:3 |
| 08 | r17-clean-257 | 15:36:23.940–15:36:26.940 | 2 | plaud-1#3308…plaud-1#3309 | no-direct-source-evidence:2 |
| 08 | r17-clean-257 | 15:36:28.940–15:36:31.830 | 2 | plaud-1#3311…plaud-1#3312 | no-direct-source-evidence:2 |
| 08 | r17-clean-257 | 15:36:32.830–15:36:34.830 | 2 | plaud-1#3314…plaud-1#3315 | no-direct-source-evidence:2 |
| 08 | r17-clean-257 | 15:36:47.620–15:36:48.620 | 1 | plaud-1#3319…plaud-1#3319 | no-direct-source-evidence:1 |
| 08 | r17-clean-257 | 15:36:50.620–15:37:01.680 | 11 | plaud-1#3322…plaud-1#3332 | no-direct-source-evidence:3, insufficient-distinctive-features:8 |
| 08 | r17-clean-257 | 15:37:02.680–15:39:14.250 | 122 | plaud-1#3334…plaud-1#3455 | no-direct-source-evidence:5, insufficient-distinctive-features:82, below-confidence-threshold:33, monotonic-conflict:2 |
| 08 | r17-clean-257 | 15:39:16.250–15:39:24.250 | 7 | plaud-1#3457…plaud-1#3463 | no-direct-source-evidence:6, insufficient-distinctive-features:1 |
| 08 | r17-clean-257 | 15:39:25.250–15:39:26.250 | 1 | plaud-1#3465…plaud-1#3465 | no-direct-source-evidence:1 |
| 08 | r17-clean-257 | 15:39:27.250–15:39:28.250 | 1 | plaud-1#3467…plaud-1#3467 | no-direct-source-evidence:1 |
| 08 | r17-clean-257 | 15:39:29.250–15:39:34.250 | 5 | plaud-1#3469…plaud-1#3473 | no-direct-source-evidence:5 |
| 08 | r17-clean-257 | 15:39:36.250–15:39:40.250 | 4 | plaud-1#3476…plaud-1#3479 | no-direct-source-evidence:3, monotonic-conflict:1 |
| 08 | r17-clean-257 | 15:39:42.250–15:39:44.250 | 2 | plaud-1#3482…plaud-1#3483 | no-direct-source-evidence:2 |
| 08 | r17-clean-257 | 15:39:46.250–15:40:02.980 | 16 | plaud-1#3485…plaud-1#3500 | no-direct-source-evidence:11, insufficient-distinctive-features:4, ambiguous-page-candidates:1 |
| 08 | r17-clean-257 | 15:40:06.980–15:40:07.980 | 1 | plaud-1#3504…plaud-1#3504 | no-direct-source-evidence:1 |
| 08 | r17-clean-257 | 15:40:09.980–15:40:14.980 | 6 | plaud-1#3506…plaud-1#3511 | no-direct-source-evidence:6 |
| 08 | r17-clean-257 | 15:40:15.980–15:40:47.520 | 29 | plaud-1#3513…plaud-1#3541 | no-direct-source-evidence:1, insufficient-distinctive-features:9, below-confidence-threshold:19 |
| 08 | r17-clean-257 | 15:40:51.520–15:41:21.610 | 24 | plaud-1#3544…plaud-1#3567 | no-direct-source-evidence:3, insufficient-independent-lexical-words:3, insufficient-distinctive-features:17, below-confidence-threshold:1 |
| 08 | r17-clean-257 | 15:41:25.710–15:41:26.710 | 1 | plaud-1#3572…plaud-1#3572 | no-direct-source-evidence:1 |
| 08 | r17-clean-257 | 15:41:32.710–15:41:35.710 | 2 | plaud-1#3578…plaud-1#3579 | no-direct-source-evidence:2 |
| 08 | r17-clean-257 | 15:41:36.710–15:41:38.710 | 1 | plaud-1#3581…plaud-1#3581 | no-direct-source-evidence:1 |
| 08 | r17-clean-257 | 15:41:39.710–15:41:54.040 | 12 | plaud-1#3583…plaud-1#3594 | no-direct-source-evidence:4, insufficient-distinctive-features:8 |
| 08 | r17-clean-257 | 15:41:55.040–15:47:00.180 | 263 | plaud-1#3596…plaud-1#3858 | no-direct-source-evidence:10, insufficient-distinctive-features:214, insufficient-independent-lexical-words:23, below-confidence-threshold:14, monotonic-conflict:2 |
| 08 | r17-clean-257 | 15:47:01.180–15:47:03.180 | 2 | plaud-1#3861…plaud-1#3862 | no-direct-source-evidence:2 |
| 08 | r17-clean-257 | 15:47:04.180–15:47:05.180 | 1 | plaud-1#3864…plaud-1#3864 | no-direct-source-evidence:1 |
| 08 | r17-clean-257 | 15:47:06.180–15:47:07.280 | 3 | plaud-1#3866…plaud-1#3868 | no-direct-source-evidence:3 |
| 08 | r17-clean-257 | 15:47:08.180–15:47:15.100 | 7 | plaud-1#3870…plaud-1#3876 | no-direct-source-evidence:7 |
| 08 | r17-clean-257 | 15:47:16.100–15:47:19.100 | 3 | plaud-1#3878…plaud-1#3880 | insufficient-independent-lexical-words:3 |
| 08 | r17-clean-257 | 15:47:21.100–15:47:35.060 | 15 | plaud-1#3883…plaud-1#3897 | no-direct-source-evidence:8, insufficient-distinctive-features:5, below-confidence-threshold:2 |
| 08 | r17-clean-257 | 15:47:36.060–15:47:41.060 | 6 | plaud-1#3899…plaud-1#3904 | no-direct-source-evidence:6 |
| 08 | r17-clean-257 | 15:47:43.060–15:47:45.060 | 2 | plaud-1#3906…plaud-1#3907 | insufficient-independent-lexical-words:1, insufficient-distinctive-features:1 |
| 08 | r17-clean-257 | 15:47:46.060–15:48:12.750 | 23 | plaud-1#3909…plaud-1#3931 | no-direct-source-evidence:6, insufficient-distinctive-features:9, below-confidence-threshold:8 |
| 08 | r17-clean-257 | 15:48:20.750–15:48:25.750 | 4 | plaud-1#3939…plaud-1#3942 | no-direct-source-evidence:4 |
| 08 | r17-clean-257 | 15:48:26.750–15:48:32.750 | 6 | plaud-1#3944…plaud-1#3949 | no-direct-source-evidence:6 |
| 08 | r17-clean-257 | 15:48:33.750–15:52:06.410 | 179 | plaud-1#3951…plaud-1#4129 | no-direct-source-evidence:8, insufficient-distinctive-features:132, insufficient-independent-lexical-words:6, ambiguous-page-candidates:1, below-confidence-threshold:32 |
| 08 | r17-clean-257 | 15:52:07.410–15:52:09.410 | 1 | plaud-1#4131…plaud-1#4131 | no-direct-source-evidence:1 |
| 08 | r17-clean-257 | 15:52:11.410–15:52:58.280 | 48 | plaud-1#4134…plaud-1#4181 | no-direct-source-evidence:8, monotonic-conflict:1, insufficient-distinctive-features:30, below-confidence-threshold:4, insufficient-independent-lexical-words:5 |
| 08 | r17-clean-257 | 15:53:00.180–15:53:04.410 | 3 | plaud-1#4185…plaud-1#4187 | no-direct-source-evidence:3 |
| 08 | r17-clean-257 | 15:53:06.650–15:53:15.540 | 9 | plaud-1#4189…plaud-1#4197 | no-direct-source-evidence:1, insufficient-distinctive-features:8 |
| 08 | r17-clean-257 | 15:53:16.540–15:53:20.540 | 4 | plaud-1#4199…plaud-1#4202 | no-direct-source-evidence:4 |
| 08 | r17-clean-257 | 15:53:21.540–15:53:32.630 | 10 | plaud-1#4204…plaud-1#4213 | no-direct-source-evidence:8, monotonic-conflict:1, ambiguous-page-candidates:1 |
| 08 | r17-clean-257 | 15:53:33.630–15:54:44.010 | 67 | plaud-1#4215…plaud-1#4281 | no-direct-source-evidence:11, insufficient-distinctive-features:38, below-confidence-threshold:17, monotonic-conflict:1 |
| 09 | final-290 | 15:54:44.010–16:08:36.630 | 29 | plaud-1#4282…plaud-1#4310 | non-lecture:29 |
| 09 | r17-clean-257 | 15:54:44.010–16:08:36.630 | 29 | plaud-1#4282…plaud-1#4310 | non-lecture:29 |
| 10 | final-290 | 16:08:36.630–16:13:49.940 | 160 | plaud-1#4311…plaud-1#4470 | insufficient-distinctive-features:112, below-confidence-threshold:40, long-source-segment:1, ambiguous-page-candidates:1, no-direct-source-evidence:6 |
| 10 | final-290 | 16:13:50.940–16:13:51.940 | 1 | plaud-1#4472…plaud-1#4472 | no-direct-source-evidence:1 |
| 10 | final-290 | 16:13:54.010–16:21:32.470 | 340 | plaud-1#4475…plaud-1#4814 | no-direct-source-evidence:4, insufficient-distinctive-features:216, insufficient-independent-lexical-words:8, below-confidence-threshold:112 |
| 10 | final-290 | 16:21:34.470–16:21:35.470 | 1 | plaud-1#4816…plaud-1#4816 | no-direct-source-evidence:1 |
| 10 | final-290 | 16:21:37.470–16:26:39.100 | 267 | plaud-1#4818…plaud-1#5084 | no-direct-source-evidence:2, insufficient-independent-lexical-words:1, below-confidence-threshold:84, insufficient-distinctive-features:179, ambiguous-page-candidates:1 |
| 10 | final-290 | 16:26:41.320–16:28:50.010 | 107 | plaud-1#5086…plaud-1#5192 | no-direct-source-evidence:1, insufficient-distinctive-features:63, insufficient-independent-lexical-words:17, below-confidence-threshold:26 |
| 10 | final-290 | 16:28:52.100–16:30:03.430 | 65 | plaud-1#5194…plaud-1#5258 | insufficient-distinctive-features:61, below-confidence-threshold:4 |
| 10 | final-290 | 16:30:04.430–16:30:05.430 | 1 | plaud-1#5260…plaud-1#5260 | no-direct-source-evidence:1 |
| 10 | final-290 | 16:30:06.430–16:32:45.720 | 132 | plaud-1#5262…plaud-1#5393 | no-direct-source-evidence:6, insufficient-distinctive-features:74, below-confidence-threshold:51, monotonic-conflict:1 |
| 10 | r17-clean-257 | 16:08:36.630–16:13:11.480 | 121 | plaud-1#4311…plaud-1#4431 | insufficient-distinctive-features:91, below-confidence-threshold:29, long-source-segment:1 |
| 10 | r17-clean-257 | 16:13:12.480–16:13:49.940 | 38 | plaud-1#4433…plaud-1#4470 | no-direct-source-evidence:6, insufficient-distinctive-features:31, below-confidence-threshold:1 |
| 10 | r17-clean-257 | 16:13:50.940–16:13:51.940 | 1 | plaud-1#4472…plaud-1#4472 | no-direct-source-evidence:1 |
| 10 | r17-clean-257 | 16:13:54.010–16:24:25.060 | 497 | plaud-1#4475…plaud-1#4971 | no-direct-source-evidence:6, insufficient-distinctive-features:324, insufficient-independent-lexical-words:8, below-confidence-threshold:157, ambiguous-page-candidates:2 |
| 10 | r17-clean-257 | 16:24:26.050–16:26:39.100 | 112 | plaud-1#4973…plaud-1#5084 | no-direct-source-evidence:1, insufficient-distinctive-features:81, below-confidence-threshold:30 |
| 10 | r17-clean-257 | 16:26:41.320–16:26:50.680 | 7 | plaud-1#5086…plaud-1#5092 | no-direct-source-evidence:1, insufficient-distinctive-features:6 |
| 10 | r17-clean-257 | 16:26:52.680–16:30:03.430 | 165 | plaud-1#5094…plaud-1#5258 | no-direct-source-evidence:2, insufficient-distinctive-features:124, below-confidence-threshold:32, insufficient-independent-lexical-words:7 |
| 10 | r17-clean-257 | 16:30:04.430–16:30:05.430 | 1 | plaud-1#5260…plaud-1#5260 | no-direct-source-evidence:1 |
| 10 | r17-clean-257 | 16:30:06.430–16:31:43.930 | 87 | plaud-1#5262…plaud-1#5348 | no-direct-source-evidence:3, insufficient-distinctive-features:39, below-confidence-threshold:43, insufficient-independent-lexical-words:2 |
| 10 | r17-clean-257 | 16:31:44.930–16:32:45.720 | 44 | plaud-1#5350…plaud-1#5393 | no-direct-source-evidence:10, insufficient-distinctive-features:28, monotonic-conflict:1, below-confidence-threshold:5 |
| 11 | final-290 | 16:32:45.720–16:40:44.300 | 384 | plaud-1#5394…plaud-1#5777 | below-confidence-threshold:121, insufficient-distinctive-features:260, monotonic-conflict:1, no-direct-source-evidence:2 |
| 11 | final-290 | 16:40:48.300–16:42:44.880 | 81 | plaud-1#5783…plaud-1#5863 | no-direct-source-evidence:12, insufficient-distinctive-features:51, below-confidence-threshold:15, ambiguous-page-candidates:2, monotonic-conflict:1 |
| 11 | final-290 | 16:42:49.880–16:42:51.970 | 1 | plaud-1#5866…plaud-1#5866 | no-direct-source-evidence:1 |
| 11 | final-290 | 16:42:54.350–16:43:08.620 | 7 | plaud-1#5868…plaud-1#5874 | insufficient-independent-lexical-words:1, insufficient-distinctive-features:6 |
| 11 | final-290 | 16:43:10.620–16:43:13.620 | 3 | plaud-1#5876…plaud-1#5878 | no-direct-source-evidence:3 |
| 11 | final-290 | 16:43:15.620–16:44:26.180 | 54 | plaud-1#5880…plaud-1#5933 | insufficient-distinctive-features:42, ambiguous-page-candidates:3, no-direct-source-evidence:3, insufficient-independent-lexical-words:1, below-confidence-threshold:5 |
| 11 | final-290 | 16:44:28.180–16:44:30.210 | 2 | plaud-1#5936…plaud-1#5937 | no-direct-source-evidence:2 |
| 11 | final-290 | 16:44:31.210–16:44:33.210 | 1 | plaud-1#5939…plaud-1#5939 | no-direct-source-evidence:1 |
| 11 | final-290 | 16:44:35.210–16:48:09.630 | 133 | plaud-1#5941…plaud-1#6073 | no-direct-source-evidence:3, insufficient-distinctive-features:87, below-confidence-threshold:37, insufficient-independent-lexical-words:6 |
| 11 | final-290 | 16:48:11.670–16:48:12.730 | 1 | plaud-1#6075…plaud-1#6075 | no-direct-source-evidence:1 |
| 11 | final-290 | 16:48:15.730–16:48:16.760 | 1 | plaud-1#6078…plaud-1#6078 | no-direct-source-evidence:1 |
| 11 | final-290 | 16:48:17.760–16:49:34.330 | 68 | plaud-1#6080…plaud-1#6147 | insufficient-distinctive-features:51, below-confidence-threshold:17 |
| 11 | final-290 | 16:49:36.330–16:49:40.480 | 3 | plaud-1#6150…plaud-1#6152 | no-direct-source-evidence:3 |
| 11 | final-290 | 16:49:42.480–16:49:45.480 | 1 | plaud-1#6155…plaud-1#6155 | no-direct-source-evidence:1 |
| 11 | final-290 | 16:49:48.480–16:51:27.390 | 77 | plaud-1#6158…plaud-1#6234 | no-direct-source-evidence:1, insufficient-independent-lexical-words:11, insufficient-distinctive-features:54, below-confidence-threshold:11 |
| 11 | final-290 | 16:51:28.390–16:51:39.390 | 11 | plaud-1#6236…plaud-1#6246 | no-direct-source-evidence:1, insufficient-distinctive-features:10 |
| 11 | r17-clean-257 | 16:32:45.720–16:32:54.710 | 7 | plaud-1#5394…plaud-1#5400 | below-confidence-threshold:1, insufficient-distinctive-features:6 |
| 11 | r17-clean-257 | 16:32:56.840–16:40:44.300 | 376 | plaud-1#5402…plaud-1#5777 | insufficient-distinctive-features:259, below-confidence-threshold:114, monotonic-conflict:1, no-direct-source-evidence:2 |
| 11 | r17-clean-257 | 16:40:48.300–16:42:44.880 | 81 | plaud-1#5783…plaud-1#5863 | no-direct-source-evidence:8, insufficient-distinctive-features:61, below-confidence-threshold:11, monotonic-conflict:1 |
| 11 | r17-clean-257 | 16:42:49.880–16:42:51.970 | 1 | plaud-1#5866…plaud-1#5866 | no-direct-source-evidence:1 |
| 11 | r17-clean-257 | 16:42:54.350–16:43:08.620 | 7 | plaud-1#5868…plaud-1#5874 | insufficient-independent-lexical-words:1, insufficient-distinctive-features:6 |
| 11 | r17-clean-257 | 16:43:10.620–16:43:13.620 | 3 | plaud-1#5876…plaud-1#5878 | no-direct-source-evidence:3 |
| 11 | r17-clean-257 | 16:43:15.620–16:44:26.180 | 54 | plaud-1#5880…plaud-1#5933 | insufficient-distinctive-features:43, monotonic-conflict:1, no-direct-source-evidence:3, insufficient-independent-lexical-words:2, below-confidence-threshold:5 |
| 11 | r17-clean-257 | 16:44:28.180–16:44:30.210 | 2 | plaud-1#5936…plaud-1#5937 | no-direct-source-evidence:2 |
| 11 | r17-clean-257 | 16:44:31.210–16:44:33.210 | 1 | plaud-1#5939…plaud-1#5939 | no-direct-source-evidence:1 |
| 11 | r17-clean-257 | 16:44:35.210–16:48:12.730 | 135 | plaud-1#5941…plaud-1#6075 | no-direct-source-evidence:4, insufficient-distinctive-features:101, below-confidence-threshold:23, insufficient-independent-lexical-words:6, ambiguous-page-candidates:1 |
| 11 | r17-clean-257 | 16:48:15.730–16:48:16.760 | 1 | plaud-1#6078…plaud-1#6078 | no-direct-source-evidence:1 |
| 11 | r17-clean-257 | 16:48:17.760–16:49:34.330 | 68 | plaud-1#6080…plaud-1#6147 | insufficient-distinctive-features:65, below-confidence-threshold:3 |
| 11 | r17-clean-257 | 16:49:36.330–16:49:40.480 | 3 | plaud-1#6150…plaud-1#6152 | no-direct-source-evidence:3 |
| 11 | r17-clean-257 | 16:49:42.480–16:49:45.480 | 1 | plaud-1#6155…plaud-1#6155 | no-direct-source-evidence:1 |
| 11 | r17-clean-257 | 16:49:48.480–16:51:27.390 | 77 | plaud-1#6158…plaud-1#6234 | no-direct-source-evidence:2, insufficient-independent-lexical-words:5, insufficient-distinctive-features:58, below-confidence-threshold:11, monotonic-conflict:1 |
| 11 | r17-clean-257 | 16:51:28.390–16:51:39.390 | 11 | plaud-1#6236…plaud-1#6246 | no-direct-source-evidence:1, insufficient-distinctive-features:10 |
| 12 | final-290 | 16:51:39.390–16:55:57.490 | 155 | plaud-1#6247…plaud-1#6401 | below-confidence-threshold:68, insufficient-distinctive-features:67, monotonic-conflict:3, no-direct-source-evidence:12, insufficient-independent-lexical-words:5 |
| 12 | final-290 | 16:55:58.490–16:56:10.580 | 9 | plaud-1#6403…plaud-1#6411 | no-direct-source-evidence:2, insufficient-distinctive-features:7 |
| 12 | final-290 | 16:56:11.580–16:56:13.580 | 2 | plaud-1#6413…plaud-1#6414 | no-direct-source-evidence:2 |
| 12 | final-290 | 16:56:21.180–16:57:25.600 | 28 | plaud-1#6417…plaud-1#6444 | no-direct-source-evidence:2, insufficient-distinctive-features:15, below-confidence-threshold:7, insufficient-independent-lexical-words:3, ambiguous-page-candidates:1 |
| 12 | final-290 | 16:57:26.520–16:57:36.030 | 5 | plaud-1#6446…plaud-1#6450 | no-direct-source-evidence:1, below-confidence-threshold:3, monotonic-conflict:1 |
| 12 | final-290 | 16:57:44.090–16:57:48.090 | 3 | plaud-1#6457…plaud-1#6459 | no-direct-source-evidence:3 |
| 12 | final-290 | 16:57:50.790–16:57:51.790 | 1 | plaud-1#6461…plaud-1#6461 | insufficient-independent-lexical-words:1 |
| 12 | final-290 | 16:57:55.130–16:57:56.130 | 1 | plaud-1#6465…plaud-1#6465 | no-direct-source-evidence:1 |
| 12 | final-290 | 16:58:00.290–16:58:16.650 | 11 | plaud-1#6468…plaud-1#6478 | no-direct-source-evidence:5, insufficient-distinctive-features:4, monotonic-conflict:2 |
| 12 | final-290 | 16:58:18.850–16:58:20.020 | 1 | plaud-1#6480…plaud-1#6480 | no-direct-source-evidence:1 |
| 12 | final-290 | 16:58:22.020–16:58:24.110 | 1 | plaud-1#6482…plaud-1#6482 | no-direct-source-evidence:1 |
| 12 | final-290 | 16:58:26.550–16:58:32.060 | 4 | plaud-1#6484…plaud-1#6487 | no-direct-source-evidence:4 |
| 12 | final-290 | 16:58:34.190–16:58:36.090 | 2 | plaud-1#6489…plaud-1#6490 | insufficient-distinctive-features:2 |
| 12 | final-290 | 16:58:37.290–16:58:41.600 | 4 | plaud-1#6492…plaud-1#6495 | no-direct-source-evidence:4 |
| 12 | final-290 | 16:58:42.600–16:58:47.790 | 3 | plaud-1#6497…plaud-1#6499 | no-direct-source-evidence:1, below-confidence-threshold:2 |
| 12 | final-290 | 16:58:49.790–16:59:01.170 | 7 | plaud-1#6501…plaud-1#6507 | ambiguous-page-candidates:4, no-direct-source-evidence:2, below-confidence-threshold:1 |
| 12 | final-290 | 16:59:03.590–16:59:05.780 | 2 | plaud-1#6510…plaud-1#6511 | no-direct-source-evidence:2 |
| 12 | final-290 | 16:59:07.780–16:59:08.780 | 1 | plaud-1#6514…plaud-1#6514 | no-direct-source-evidence:1 |
| 12 | final-290 | 16:59:09.840–17:04:21.520 | 170 | plaud-1#6516…plaud-1#6685 | no-direct-source-evidence:21, ambiguous-page-candidates:11, insufficient-distinctive-features:72, insufficient-independent-lexical-words:9, below-confidence-threshold:57 |
| 12 | final-290 | 17:04:22.810–17:04:26.120 | 3 | plaud-1#6687…plaud-1#6689 | no-direct-source-evidence:3 |
| 12 | final-290 | 17:04:27.120–17:04:30.180 | 3 | plaud-1#6691…plaud-1#6693 | no-direct-source-evidence:1, insufficient-distinctive-features:2 |
| 12 | final-290 | 17:04:33.100–17:04:34.100 | 1 | plaud-1#6695…plaud-1#6695 | no-direct-source-evidence:1 |
| 12 | final-290 | 17:04:35.100–17:05:05.250 | 23 | plaud-1#6697…plaud-1#6719 | below-confidence-threshold:7, insufficient-distinctive-features:6, monotonic-conflict:6, no-direct-source-evidence:4 |
| 12 | final-290 | 17:05:09.760–17:05:24.160 | 8 | plaud-1#6722…plaud-1#6729 | no-direct-source-evidence:2, below-confidence-threshold:6 |
| 12 | final-290 | 17:05:25.150–17:06:21.600 | 50 | plaud-1#6731…plaud-1#6780 | no-direct-source-evidence:9, below-confidence-threshold:21, insufficient-distinctive-features:11, monotonic-conflict:6, insufficient-independent-lexical-words:3 |
| 12 | final-290 | 17:06:23.420–17:06:32.520 | 9 | plaud-1#6783…plaud-1#6791 | no-direct-source-evidence:3, insufficient-independent-lexical-words:3, insufficient-distinctive-features:3 |
| 12 | final-290 | 17:06:33.490–17:06:34.490 | 1 | plaud-1#6793…plaud-1#6793 | no-direct-source-evidence:1 |
| 12 | final-290 | 17:06:36.450–17:06:39.140 | 1 | plaud-1#6796…plaud-1#6796 | no-direct-source-evidence:1 |
| 12 | final-290 | 17:06:40.140–17:10:28.370 | 172 | plaud-1#6798…plaud-1#6969 | no-direct-source-evidence:32, insufficient-independent-lexical-words:18, below-confidence-threshold:63, insufficient-distinctive-features:47, ambiguous-page-candidates:11, monotonic-conflict:1 |
| 12 | final-290 | 17:10:30.140–17:10:40.480 | 9 | plaud-1#6971…plaud-1#6979 | no-direct-source-evidence:1, below-confidence-threshold:2, insufficient-distinctive-features:6 |
| 12 | final-290 | 17:10:42.610–17:10:43.610 | 1 | plaud-1#6981…plaud-1#6981 | no-direct-source-evidence:1 |
| 12 | final-290 | 17:10:45.610–17:11:33.000 | 40 | plaud-1#6984…plaud-1#7023 | no-direct-source-evidence:20, insufficient-distinctive-features:6, below-confidence-threshold:10, ambiguous-page-candidates:4 |
| 12 | final-290 | 17:11:34.000–17:11:38.060 | 4 | plaud-1#7025…plaud-1#7028 | no-direct-source-evidence:4 |
| 12 | final-290 | 17:11:43.440–17:11:44.560 | 1 | plaud-1#7031…plaud-1#7031 | no-direct-source-evidence:1 |
| 12 | final-290 | 17:11:45.560–17:11:46.560 | 1 | plaud-1#7033…plaud-1#7033 | no-direct-source-evidence:1 |
| 12 | final-290 | 17:11:48.520–17:11:51.520 | 2 | plaud-1#7035…plaud-1#7036 | no-direct-source-evidence:2 |
| 12 | final-290 | 17:11:56.830–17:12:19.770 | 11 | plaud-1#7040…plaud-1#7050 | no-direct-source-evidence:5, below-confidence-threshold:2, insufficient-distinctive-features:3, monotonic-conflict:1 |
| 12 | final-290 | 17:12:22.770–17:14:00.640 | 85 | plaud-1#7053…plaud-1#7137 | no-direct-source-evidence:16, insufficient-distinctive-features:43, below-confidence-threshold:22, ambiguous-page-candidates:2, monotonic-conflict:2 |
| 12 | final-290 | 17:14:03.770–17:14:08.190 | 4 | plaud-1#7140…plaud-1#7143 | no-direct-source-evidence:2, below-confidence-threshold:2 |
| 12 | final-290 | 17:14:09.850–17:14:25.100 | 13 | plaud-1#7145…plaud-1#7157 | below-confidence-threshold:12, no-direct-source-evidence:1 |
| 12 | final-290 | 17:14:26.100–17:15:09.880 | 33 | plaud-1#7159…plaud-1#7191 | no-direct-source-evidence:7, insufficient-distinctive-features:19, below-confidence-threshold:6, ambiguous-page-candidates:1 |
| 12 | final-290 | 17:15:10.880–17:15:14.880 | 4 | plaud-1#7193…plaud-1#7196 | insufficient-distinctive-features:3, below-confidence-threshold:1 |
| 12 | final-290 | 17:15:15.880–17:15:18.290 | 2 | plaud-1#7198…plaud-1#7199 | no-direct-source-evidence:1, below-confidence-threshold:1 |
| 12 | final-290 | 17:15:19.290–17:15:49.130 | 23 | plaud-1#7201…plaud-1#7223 | below-confidence-threshold:7, no-direct-source-evidence:6, ambiguous-page-candidates:1, monotonic-conflict:1, insufficient-distinctive-features:8 |
| 12 | final-290 | 17:15:50.130–17:15:55.060 | 6 | plaud-1#7225…plaud-1#7230 | no-direct-source-evidence:4, insufficient-distinctive-features:2 |
| 12 | final-290 | 17:15:55.960–17:16:04.590 | 9 | plaud-1#7232…plaud-1#7240 | no-direct-source-evidence:2, insufficient-distinctive-features:7 |
| 12 | final-290 | 17:16:05.550–17:16:53.570 | 33 | plaud-1#7242…plaud-1#7274 | no-direct-source-evidence:11, below-confidence-threshold:9, insufficient-distinctive-features:10, ambiguous-page-candidates:1, monotonic-conflict:2 |
| 12 | final-290 | 17:16:55.890–17:18:15.450 | 45 | plaud-1#7277…plaud-1#7321 | insufficient-distinctive-features:23, below-confidence-threshold:10, insufficient-independent-lexical-words:3, ambiguous-page-candidates:1, monotonic-conflict:2, no-direct-source-evidence:6 |
| 12 | final-290 | 17:18:17.450–17:18:21.090 | 3 | plaud-1#7323…plaud-1#7325 | no-direct-source-evidence:3 |
| 12 | final-290 | 17:18:23.090–17:18:25.050 | 2 | plaud-1#7327…plaud-1#7328 | no-direct-source-evidence:1, ambiguous-page-candidates:1 |
| 12 | final-290 | 17:18:26.050–17:18:29.500 | 3 | plaud-1#7330…plaud-1#7332 | no-direct-source-evidence:3 |
| 12 | final-290 | 17:18:31.940–17:18:34.940 | 2 | plaud-1#7334…plaud-1#7335 | no-direct-source-evidence:1, insufficient-distinctive-features:1 |
| 12 | final-290 | 17:18:35.910–17:18:42.530 | 2 | plaud-1#7337…plaud-1#7338 | no-direct-source-evidence:2 |
| 12 | final-290 | 17:18:44.620–17:18:45.620 | 1 | plaud-1#7340…plaud-1#7340 | insufficient-distinctive-features:1 |
| 12 | final-290 | 17:18:46.620–17:18:59.090 | 11 | plaud-1#7342…plaud-1#7352 | no-direct-source-evidence:5, below-confidence-threshold:4, insufficient-distinctive-features:2 |
| 12 | final-290 | 17:19:01.090–17:19:13.650 | 10 | plaud-1#7355…plaud-1#7364 | no-direct-source-evidence:5, below-confidence-threshold:5 |
| 12 | final-290 | 17:19:14.650–17:20:06.940 | 47 | plaud-1#7366…plaud-1#7412 | no-direct-source-evidence:12, below-confidence-threshold:6, insufficient-distinctive-features:21, ambiguous-page-candidates:2, insufficient-independent-lexical-words:6 |
| 12 | final-290 | 17:20:09.090–17:20:19.550 | 12 | plaud-1#7414…plaud-1#7425 | no-direct-source-evidence:8, monotonic-conflict:1, insufficient-distinctive-features:1, insufficient-independent-lexical-words:2 |
| 12 | final-290 | 17:20:21.680–17:20:25.680 | 4 | plaud-1#7428…plaud-1#7431 | no-direct-source-evidence:3, below-confidence-threshold:1 |
| 12 | final-290 | 17:20:30.240–17:20:32.610 | 1 | plaud-1#7433…plaud-1#7433 | no-direct-source-evidence:1 |
| 12 | final-290 | 17:20:33.610–17:20:38.730 | 6 | plaud-1#7435…plaud-1#7440 | no-direct-source-evidence:1, insufficient-distinctive-features:5 |
| 12 | final-290 | 17:20:39.730–17:20:42.720 | 3 | plaud-1#7442…plaud-1#7444 | below-confidence-threshold:2, ambiguous-page-candidates:1 |
| 12 | final-290 | 17:20:43.780–17:21:18.070 | 28 | plaud-1#7446…plaud-1#7473 | no-direct-source-evidence:11, insufficient-distinctive-features:5, insufficient-independent-lexical-words:9, monotonic-conflict:1, below-confidence-threshold:2 |
| 12 | final-290 | 17:21:19.070–17:25:41.410 | 189 | plaud-1#7475…plaud-1#7663 | no-direct-source-evidence:27, below-confidence-threshold:75, monotonic-conflict:16, insufficient-distinctive-features:52, insufficient-independent-lexical-words:18, ambiguous-page-candidates:1 |
| 12 | final-290 | 17:25:43.410–17:25:46.630 | 3 | plaud-1#7665…plaud-1#7667 | no-direct-source-evidence:2, below-confidence-threshold:1 |
| 12 | final-290 | 17:25:47.920–17:25:48.890 | 1 | plaud-1#7669…plaud-1#7669 | no-direct-source-evidence:1 |
| 12 | final-290 | 17:25:49.890–17:26:40.820 | 26 | plaud-1#7671…plaud-1#7696 | below-confidence-threshold:8, ambiguous-page-candidates:2, no-direct-source-evidence:5, insufficient-distinctive-features:11 |
| 12 | final-290 | 17:26:41.840–17:28:16.500 | 71 | plaud-1#7698…plaud-1#7768 | no-direct-source-evidence:13, insufficient-distinctive-features:30, below-confidence-threshold:26, ambiguous-page-candidates:1, monotonic-conflict:1 |
| 12 | final-290 | 17:28:18.500–17:29:12.630 | 46 | plaud-1#7770…plaud-1#7815 | no-direct-source-evidence:8, below-confidence-threshold:15, insufficient-distinctive-features:21, ambiguous-page-candidates:2 |
| 12 | final-290 | 17:29:13.630–17:29:19.660 | 7 | plaud-1#7817…plaud-1#7823 | below-confidence-threshold:7 |
| 12 | final-290 | 17:29:20.770–17:29:22.080 | 3 | plaud-1#7825…plaud-1#7827 | below-confidence-threshold:3 |
| 12 | final-290 | 17:29:26.230–17:29:38.990 | 13 | plaud-1#7832…plaud-1#7844 | no-direct-source-evidence:9, below-confidence-threshold:1, insufficient-distinctive-features:3 |
| 12 | final-290 | 17:29:39.990–17:29:41.280 | 1 | plaud-1#7846…plaud-1#7846 | no-direct-source-evidence:1 |
| 12 | final-290 | 17:29:42.280–17:29:44.280 | 2 | plaud-1#7848…plaud-1#7849 | no-direct-source-evidence:2 |
| 12 | final-290 | 17:29:47.280–17:30:25.320 | 29 | plaud-1#7853…plaud-1#7881 | no-direct-source-evidence:11, insufficient-distinctive-features:5, ambiguous-page-candidates:3, below-confidence-threshold:3, insufficient-independent-lexical-words:7 |
| 12 | final-290 | 17:30:26.320–17:30:31.570 | 5 | plaud-1#7883…plaud-1#7887 | no-direct-source-evidence:5 |
| 12 | final-290 | 17:30:32.570–17:30:40.990 | 8 | plaud-1#7889…plaud-1#7896 | below-confidence-threshold:1, insufficient-independent-lexical-words:6, insufficient-distinctive-features:1 |
| 12 | final-290 | 17:30:41.990–17:31:16.090 | 33 | plaud-1#7898…plaud-1#7930 | no-direct-source-evidence:19, ambiguous-page-candidates:13, below-confidence-threshold:1 |
| 12 | final-290 | 17:31:16.990–17:31:18.950 | 2 | plaud-1#7932…plaud-1#7933 | no-direct-source-evidence:2 |
| 12 | final-290 | 17:31:22.000–17:31:23.970 | 2 | plaud-1#7936…plaud-1#7937 | no-direct-source-evidence:2 |
| 12 | final-290 | 17:31:25.280–17:32:16.510 | 43 | plaud-1#7939…plaud-1#7981 | below-confidence-threshold:13, insufficient-distinctive-features:24, ambiguous-page-candidates:1, monotonic-conflict:3, no-direct-source-evidence:2 |
| 12 | r17-clean-257 | 16:51:39.390–16:51:44.390 | 4 | plaud-1#6247…plaud-1#6250 | below-confidence-threshold:1, insufficient-distinctive-features:3 |
| 12 | r17-clean-257 | 16:51:46.350–16:51:49.310 | 3 | plaud-1#6252…plaud-1#6254 | no-direct-source-evidence:3 |
| 12 | r17-clean-257 | 16:51:51.310–16:54:18.820 | 92 | plaud-1#6257…plaud-1#6348 | no-direct-source-evidence:6, below-confidence-threshold:30, insufficient-distinctive-features:51, insufficient-independent-lexical-words:5 |
| 12 | r17-clean-257 | 16:54:20.780–16:54:31.010 | 6 | plaud-1#6350…plaud-1#6355 | no-direct-source-evidence:4, insufficient-distinctive-features:2 |
| 12 | r17-clean-257 | 16:54:33.290–16:54:36.250 | 2 | plaud-1#6357…plaud-1#6358 | no-direct-source-evidence:2 |
| 12 | r17-clean-257 | 16:54:38.250–16:56:10.580 | 52 | plaud-1#6360…plaud-1#6411 | insufficient-independent-lexical-words:3, below-confidence-threshold:28, insufficient-distinctive-features:20, monotonic-conflict:1 |
| 12 | r17-clean-257 | 16:56:11.580–16:56:13.580 | 2 | plaud-1#6413…plaud-1#6414 | no-direct-source-evidence:2 |
| 12 | r17-clean-257 | 16:56:21.180–16:57:36.030 | 34 | plaud-1#6417…plaud-1#6450 | no-direct-source-evidence:8, insufficient-distinctive-features:15, monotonic-conflict:7, below-confidence-threshold:3, ambiguous-page-candidates:1 |
| 12 | r17-clean-257 | 16:57:44.090–16:57:48.090 | 3 | plaud-1#6457…plaud-1#6459 | no-direct-source-evidence:3 |
| 12 | r17-clean-257 | 16:57:50.790–16:57:51.790 | 1 | plaud-1#6461…plaud-1#6461 | insufficient-independent-lexical-words:1 |
| 12 | r17-clean-257 | 16:57:55.130–16:57:56.130 | 1 | plaud-1#6465…plaud-1#6465 | no-direct-source-evidence:1 |
| 12 | r17-clean-257 | 16:58:00.290–16:58:16.650 | 11 | plaud-1#6468…plaud-1#6478 | no-direct-source-evidence:5, insufficient-distinctive-features:4, monotonic-conflict:2 |
| 12 | r17-clean-257 | 16:58:18.850–16:58:20.020 | 1 | plaud-1#6480…plaud-1#6480 | no-direct-source-evidence:1 |
| 12 | r17-clean-257 | 16:58:22.020–16:58:24.110 | 1 | plaud-1#6482…plaud-1#6482 | no-direct-source-evidence:1 |
| 12 | r17-clean-257 | 16:58:26.550–16:58:32.060 | 4 | plaud-1#6484…plaud-1#6487 | no-direct-source-evidence:4 |
| 12 | r17-clean-257 | 16:58:34.190–16:58:36.090 | 2 | plaud-1#6489…plaud-1#6490 | below-confidence-threshold:2 |
| 12 | r17-clean-257 | 16:58:37.290–16:58:41.600 | 4 | plaud-1#6492…plaud-1#6495 | no-direct-source-evidence:4 |
| 12 | r17-clean-257 | 16:58:42.600–16:58:58.170 | 8 | plaud-1#6497…plaud-1#6504 | no-direct-source-evidence:3, insufficient-distinctive-features:2, ambiguous-page-candidates:1, monotonic-conflict:1, below-confidence-threshold:1 |
| 12 | r17-clean-257 | 16:58:59.170–16:59:00.170 | 1 | plaud-1#6506…plaud-1#6506 | no-direct-source-evidence:1 |
| 12 | r17-clean-257 | 16:59:03.590–16:59:05.780 | 2 | plaud-1#6510…plaud-1#6511 | no-direct-source-evidence:2 |
| 12 | r17-clean-257 | 16:59:07.780–16:59:08.780 | 1 | plaud-1#6514…plaud-1#6514 | no-direct-source-evidence:1 |
| 12 | r17-clean-257 | 16:59:09.840–16:59:31.800 | 19 | plaud-1#6516…plaud-1#6534 | no-direct-source-evidence:6, monotonic-conflict:1, below-confidence-threshold:4, insufficient-independent-lexical-words:8 |
| 12 | r17-clean-257 | 16:59:36.220–16:59:40.750 | 4 | plaud-1#6538…plaud-1#6541 | no-direct-source-evidence:4 |
| 12 | r17-clean-257 | 16:59:53.130–17:01:10.700 | 24 | plaud-1#6546…plaud-1#6569 | insufficient-distinctive-features:10, monotonic-conflict:3, no-direct-source-evidence:2, below-confidence-threshold:9 |
| 12 | r17-clean-257 | 17:01:22.310–17:01:39.130 | 9 | plaud-1#6574…plaud-1#6582 | no-direct-source-evidence:4, monotonic-conflict:2, below-confidence-threshold:3 |
| 12 | r17-clean-257 | 17:01:42.130–17:01:56.330 | 9 | plaud-1#6584…plaud-1#6592 | no-direct-source-evidence:3, below-confidence-threshold:3, insufficient-distinctive-features:3 |
| 12 | r17-clean-257 | 17:01:58.970–17:02:01.290 | 1 | plaud-1#6594…plaud-1#6594 | below-confidence-threshold:1 |
| 12 | r17-clean-257 | 17:02:02.290–17:03:08.410 | 36 | plaud-1#6596…plaud-1#6631 | no-direct-source-evidence:11, below-confidence-threshold:14, insufficient-distinctive-features:9, monotonic-conflict:2 |
| 12 | r17-clean-257 | 17:03:10.980–17:03:33.060 | 14 | plaud-1#6633…plaud-1#6646 | below-confidence-threshold:9, no-direct-source-evidence:1, insufficient-distinctive-features:4 |
| 12 | r17-clean-257 | 17:03:34.060–17:03:38.470 | 3 | plaud-1#6648…plaud-1#6650 | no-direct-source-evidence:3 |
| 12 | r17-clean-257 | 17:03:40.790–17:04:19.270 | 33 | plaud-1#6652…plaud-1#6684 | no-direct-source-evidence:1, below-confidence-threshold:11, insufficient-distinctive-features:19, monotonic-conflict:1, insufficient-independent-lexical-words:1 |
| 12 | r17-clean-257 | 17:04:22.810–17:04:23.810 | 1 | plaud-1#6687…plaud-1#6687 | no-direct-source-evidence:1 |
| 12 | r17-clean-257 | 17:04:24.830–17:04:26.120 | 1 | plaud-1#6689…plaud-1#6689 | no-direct-source-evidence:1 |
| 12 | r17-clean-257 | 17:04:27.120–17:05:05.250 | 29 | plaud-1#6691…plaud-1#6719 | no-direct-source-evidence:9, ambiguous-page-candidates:3, below-confidence-threshold:7, insufficient-distinctive-features:8, monotonic-conflict:2 |
| 12 | r17-clean-257 | 17:05:09.760–17:05:52.340 | 33 | plaud-1#6722…plaud-1#6754 | no-direct-source-evidence:5, below-confidence-threshold:13, insufficient-distinctive-features:14, monotonic-conflict:1 |
| 12 | r17-clean-257 | 17:05:53.310–17:05:54.310 | 1 | plaud-1#6756…plaud-1#6756 | no-direct-source-evidence:1 |
| 12 | r17-clean-257 | 17:05:56.310–17:05:58.310 | 2 | plaud-1#6758…plaud-1#6759 | insufficient-distinctive-features:2 |
| 12 | r17-clean-257 | 17:06:00.560–17:06:01.560 | 1 | plaud-1#6761…plaud-1#6761 | insufficient-independent-lexical-words:1 |
| 12 | r17-clean-257 | 17:06:03.560–17:06:06.560 | 2 | plaud-1#6763…plaud-1#6764 | no-direct-source-evidence:2 |
| 12 | r17-clean-257 | 17:06:07.560–17:06:21.600 | 15 | plaud-1#6766…plaud-1#6780 | no-direct-source-evidence:4, insufficient-distinctive-features:10, monotonic-conflict:1 |
| 12 | r17-clean-257 | 17:06:23.420–17:06:32.520 | 9 | plaud-1#6783…plaud-1#6791 | no-direct-source-evidence:3, insufficient-independent-lexical-words:3, insufficient-distinctive-features:3 |
| 12 | r17-clean-257 | 17:06:33.490–17:06:34.490 | 1 | plaud-1#6793…plaud-1#6793 | no-direct-source-evidence:1 |
| 12 | r17-clean-257 | 17:06:36.450–17:06:39.140 | 1 | plaud-1#6796…plaud-1#6796 | no-direct-source-evidence:1 |
| 12 | r17-clean-257 | 17:06:40.140–17:06:46.020 | 5 | plaud-1#6798…plaud-1#6802 | no-direct-source-evidence:3, insufficient-independent-lexical-words:2 |
| 12 | r17-clean-257 | 17:06:47.020–17:07:43.860 | 42 | plaud-1#6804…plaud-1#6845 | no-direct-source-evidence:6, below-confidence-threshold:22, insufficient-distinctive-features:12, ambiguous-page-candidates:2 |
| 12 | r17-clean-257 | 17:07:44.860–17:08:45.220 | 43 | plaud-1#6847…plaud-1#6889 | no-direct-source-evidence:1, below-confidence-threshold:14, insufficient-independent-lexical-words:16, insufficient-distinctive-features:12 |
| 12 | r17-clean-257 | 17:08:48.220–17:10:11.890 | 65 | plaud-1#6893…plaud-1#6957 | no-direct-source-evidence:20, below-confidence-threshold:14, insufficient-distinctive-features:24, ambiguous-page-candidates:2, monotonic-conflict:5 |
| 12 | r17-clean-257 | 17:10:13.370–17:10:14.370 | 1 | plaud-1#6959…plaud-1#6959 | no-direct-source-evidence:1 |
| 12 | r17-clean-257 | 17:10:15.430–17:10:18.650 | 3 | plaud-1#6961…plaud-1#6963 | no-direct-source-evidence:3 |
| 12 | r17-clean-257 | 17:10:19.650–17:10:40.480 | 15 | plaud-1#6965…plaud-1#6979 | no-direct-source-evidence:2, below-confidence-threshold:6, monotonic-conflict:1, insufficient-distinctive-features:6 |
| 12 | r17-clean-257 | 17:10:42.610–17:10:43.610 | 1 | plaud-1#6981…plaud-1#6981 | no-direct-source-evidence:1 |
| 12 | r17-clean-257 | 17:10:45.610–17:11:16.680 | 27 | plaud-1#6984…plaud-1#7010 | no-direct-source-evidence:12, below-confidence-threshold:10, monotonic-conflict:1, insufficient-distinctive-features:4 |
| 12 | r17-clean-257 | 17:11:17.680–17:11:20.830 | 3 | plaud-1#7013…plaud-1#7015 | no-direct-source-evidence:3 |
| 12 | r17-clean-257 | 17:11:21.830–17:11:33.000 | 7 | plaud-1#7017…plaud-1#7023 | no-direct-source-evidence:3, below-confidence-threshold:4 |
| 12 | r17-clean-257 | 17:11:34.000–17:11:38.060 | 4 | plaud-1#7025…plaud-1#7028 | no-direct-source-evidence:4 |
| 12 | r17-clean-257 | 17:11:43.440–17:11:44.560 | 1 | plaud-1#7031…plaud-1#7031 | no-direct-source-evidence:1 |
| 12 | r17-clean-257 | 17:11:45.560–17:11:46.560 | 1 | plaud-1#7033…plaud-1#7033 | no-direct-source-evidence:1 |
| 12 | r17-clean-257 | 17:11:48.520–17:11:51.520 | 2 | plaud-1#7035…plaud-1#7036 | no-direct-source-evidence:2 |
| 12 | r17-clean-257 | 17:11:53.610–17:12:19.770 | 13 | plaud-1#7038…plaud-1#7050 | no-direct-source-evidence:3, below-confidence-threshold:9, monotonic-conflict:1 |
| 12 | r17-clean-257 | 17:12:22.770–17:12:44.930 | 22 | plaud-1#7053…plaud-1#7074 | no-direct-source-evidence:6, insufficient-distinctive-features:16 |
| 12 | r17-clean-257 | 17:12:46.930–17:14:40.420 | 93 | plaud-1#7076…plaud-1#7168 | no-direct-source-evidence:9, insufficient-distinctive-features:55, monotonic-conflict:3, below-confidence-threshold:22, ambiguous-page-candidates:4 |
| 12 | r17-clean-257 | 17:14:41.420–17:15:49.130 | 54 | plaud-1#7170…plaud-1#7223 | no-direct-source-evidence:12, insufficient-distinctive-features:17, below-confidence-threshold:22, monotonic-conflict:2, ambiguous-page-candidates:1 |
| 12 | r17-clean-257 | 17:15:50.130–17:16:04.590 | 16 | plaud-1#7225…plaud-1#7240 | no-direct-source-evidence:6, insufficient-distinctive-features:9, ambiguous-page-candidates:1 |
| 12 | r17-clean-257 | 17:16:05.550–17:16:53.570 | 33 | plaud-1#7242…plaud-1#7274 | no-direct-source-evidence:11, below-confidence-threshold:7, insufficient-distinctive-features:12, ambiguous-page-candidates:3 |
| 12 | r17-clean-257 | 17:16:55.890–17:17:26.140 | 18 | plaud-1#7277…plaud-1#7294 | insufficient-distinctive-features:2, below-confidence-threshold:8, insufficient-independent-lexical-words:2, monotonic-conflict:3, no-direct-source-evidence:3 |
| 12 | r17-clean-257 | 17:17:29.850–17:17:42.130 | 8 | plaud-1#7296…plaud-1#7303 | no-direct-source-evidence:2, insufficient-distinctive-features:6 |
| 12 | r17-clean-257 | 17:17:45.130–17:18:15.450 | 17 | plaud-1#7305…plaud-1#7321 | no-direct-source-evidence:4, monotonic-conflict:1, below-confidence-threshold:1, insufficient-distinctive-features:10, ambiguous-page-candidates:1 |
| 12 | r17-clean-257 | 17:18:17.450–17:18:25.050 | 6 | plaud-1#7323…plaud-1#7328 | no-direct-source-evidence:4, ambiguous-page-candidates:2 |
| 12 | r17-clean-257 | 17:18:26.050–17:18:29.500 | 3 | plaud-1#7330…plaud-1#7332 | no-direct-source-evidence:3 |
| 12 | r17-clean-257 | 17:18:31.940–17:18:42.530 | 5 | plaud-1#7334…plaud-1#7338 | no-direct-source-evidence:3, insufficient-distinctive-features:1, ambiguous-page-candidates:1 |
| 12 | r17-clean-257 | 17:18:44.620–17:18:45.620 | 1 | plaud-1#7340…plaud-1#7340 | insufficient-distinctive-features:1 |
| 12 | r17-clean-257 | 17:18:46.620–17:19:00.090 | 12 | plaud-1#7342…plaud-1#7353 | no-direct-source-evidence:5, insufficient-distinctive-features:4, insufficient-independent-lexical-words:3 |
| 12 | r17-clean-257 | 17:19:01.090–17:19:13.650 | 10 | plaud-1#7355…plaud-1#7364 | no-direct-source-evidence:5, below-confidence-threshold:5 |
| 12 | r17-clean-257 | 17:19:14.650–17:19:21.410 | 6 | plaud-1#7366…plaud-1#7371 | no-direct-source-evidence:6 |
| 12 | r17-clean-257 | 17:19:22.410–17:19:28.980 | 5 | plaud-1#7373…plaud-1#7377 | no-direct-source-evidence:1, insufficient-distinctive-features:4 |
| 12 | r17-clean-257 | 17:19:29.980–17:19:30.980 | 1 | plaud-1#7379…plaud-1#7379 | no-direct-source-evidence:1 |
| 12 | r17-clean-257 | 17:19:31.980–17:19:34.140 | 2 | plaud-1#7381…plaud-1#7382 | no-direct-source-evidence:2 |
| 12 | r17-clean-257 | 17:19:35.140–17:19:36.060 | 1 | plaud-1#7384…plaud-1#7384 | no-direct-source-evidence:1 |
| 12 | r17-clean-257 | 17:19:37.970–17:20:03.810 | 23 | plaud-1#7386…plaud-1#7408 | no-direct-source-evidence:5, insufficient-distinctive-features:9, insufficient-independent-lexical-words:6, monotonic-conflict:2, ambiguous-page-candidates:1 |
| 12 | r17-clean-257 | 17:20:04.810–17:20:05.840 | 1 | plaud-1#7410…plaud-1#7410 | no-direct-source-evidence:1 |
| 12 | r17-clean-257 | 17:20:09.090–17:20:09.190 | 1 | plaud-1#7414…plaud-1#7414 | no-direct-source-evidence:1 |
| 12 | r17-clean-257 | 17:20:11.820–17:20:25.680 | 15 | plaud-1#7417…plaud-1#7431 | no-direct-source-evidence:10, monotonic-conflict:5 |
| 12 | r17-clean-257 | 17:20:30.240–17:20:32.610 | 1 | plaud-1#7433…plaud-1#7433 | no-direct-source-evidence:1 |
| 12 | r17-clean-257 | 17:20:33.610–17:21:12.110 | 34 | plaud-1#7435…plaud-1#7468 | no-direct-source-evidence:11, insufficient-distinctive-features:15, monotonic-conflict:2, below-confidence-threshold:6 |
| 12 | r17-clean-257 | 17:21:13.070–17:21:36.360 | 19 | plaud-1#7470…plaud-1#7488 | no-direct-source-evidence:5, monotonic-conflict:2, below-confidence-threshold:8, insufficient-distinctive-features:4 |
| 12 | r17-clean-257 | 17:21:39.830–17:21:42.960 | 3 | plaud-1#7492…plaud-1#7494 | no-direct-source-evidence:3 |
| 12 | r17-clean-257 | 17:21:44.960–17:21:57.270 | 12 | plaud-1#7496…plaud-1#7507 | insufficient-independent-lexical-words:4, insufficient-distinctive-features:8 |
| 12 | r17-clean-257 | 17:21:58.270–17:21:59.270 | 1 | plaud-1#7509…plaud-1#7509 | no-direct-source-evidence:1 |
| 12 | r17-clean-257 | 17:22:01.200–17:22:03.200 | 2 | plaud-1#7511…plaud-1#7512 | no-direct-source-evidence:1, below-confidence-threshold:1 |
| 12 | r17-clean-257 | 17:22:07.200–17:22:10.190 | 1 | plaud-1#7516…plaud-1#7516 | no-direct-source-evidence:1 |
| 12 | r17-clean-257 | 17:22:12.410–17:22:31.280 | 15 | plaud-1#7518…plaud-1#7532 | no-direct-source-evidence:1, insufficient-distinctive-features:11, below-confidence-threshold:3 |
| 12 | r17-clean-257 | 17:22:32.280–17:22:33.280 | 1 | plaud-1#7534…plaud-1#7534 | no-direct-source-evidence:1 |
| 12 | r17-clean-257 | 17:22:35.280–17:22:37.880 | 3 | plaud-1#7536…plaud-1#7538 | no-direct-source-evidence:3 |
| 12 | r17-clean-257 | 17:22:39.880–17:23:18.370 | 23 | plaud-1#7541…plaud-1#7563 | no-direct-source-evidence:8, insufficient-distinctive-features:11, below-confidence-threshold:1, insufficient-independent-lexical-words:2, monotonic-conflict:1 |
| 12 | r17-clean-257 | 17:23:19.650–17:23:20.650 | 1 | plaud-1#7565…plaud-1#7565 | no-direct-source-evidence:1 |
| 12 | r17-clean-257 | 17:23:22.650–17:23:23.780 | 1 | plaud-1#7567…plaud-1#7567 | no-direct-source-evidence:1 |
| 12 | r17-clean-257 | 17:23:25.770–17:23:30.980 | 4 | plaud-1#7569…plaud-1#7572 | no-direct-source-evidence:1, below-confidence-threshold:2, insufficient-distinctive-features:1 |
| 12 | r17-clean-257 | 17:23:31.980–17:23:35.140 | 3 | plaud-1#7574…plaud-1#7576 | below-confidence-threshold:1, ambiguous-page-candidates:1, no-direct-source-evidence:1 |
| 12 | r17-clean-257 | 17:23:37.140–17:23:41.490 | 4 | plaud-1#7579…plaud-1#7582 | no-direct-source-evidence:4 |
| 12 | r17-clean-257 | 17:23:42.490–17:23:43.490 | 1 | plaud-1#7584…plaud-1#7584 | no-direct-source-evidence:1 |
| 12 | r17-clean-257 | 17:23:45.220–17:23:47.220 | 2 | plaud-1#7586…plaud-1#7587 | no-direct-source-evidence:2 |
| 12 | r17-clean-257 | 17:23:50.640–17:24:21.820 | 18 | plaud-1#7589…plaud-1#7606 | monotonic-conflict:1, no-direct-source-evidence:3, insufficient-distinctive-features:5, insufficient-independent-lexical-words:4, below-confidence-threshold:5 |
| 12 | r17-clean-257 | 17:24:24.820–17:24:43.200 | 10 | plaud-1#7608…plaud-1#7617 | no-direct-source-evidence:5, below-confidence-threshold:2, insufficient-distinctive-features:3 |
| 12 | r17-clean-257 | 17:24:46.200–17:24:49.200 | 2 | plaud-1#7620…plaud-1#7621 | no-direct-source-evidence:2 |
| 12 | r17-clean-257 | 17:24:51.200–17:25:11.970 | 16 | plaud-1#7623…plaud-1#7638 | no-direct-source-evidence:6, below-confidence-threshold:4, ambiguous-page-candidates:2, monotonic-conflict:1, insufficient-independent-lexical-words:3 |
| 12 | r17-clean-257 | 17:25:13.030–17:25:31.610 | 14 | plaud-1#7640…plaud-1#7653 | no-direct-source-evidence:3, insufficient-distinctive-features:7, below-confidence-threshold:2, monotonic-conflict:2 |
| 12 | r17-clean-257 | 17:25:32.610–17:25:37.140 | 4 | plaud-1#7656…plaud-1#7659 | no-direct-source-evidence:4 |
| 12 | r17-clean-257 | 17:25:39.160–17:25:46.630 | 6 | plaud-1#7662…plaud-1#7667 | no-direct-source-evidence:4, monotonic-conflict:1, insufficient-distinctive-features:1 |
| 12 | r17-clean-257 | 17:25:47.920–17:25:48.890 | 1 | plaud-1#7669…plaud-1#7669 | no-direct-source-evidence:1 |
| 12 | r17-clean-257 | 17:25:49.890–17:26:27.590 | 19 | plaud-1#7671…plaud-1#7689 | monotonic-conflict:2, no-direct-source-evidence:7, below-confidence-threshold:3, insufficient-distinctive-features:3, ambiguous-page-candidates:1, insufficient-independent-lexical-words:3 |
| 12 | r17-clean-257 | 17:26:30.710–17:26:31.710 | 1 | plaud-1#7691…plaud-1#7691 | insufficient-distinctive-features:1 |
| 12 | r17-clean-257 | 17:26:33.710–17:27:16.800 | 29 | plaud-1#7693…plaud-1#7721 | no-direct-source-evidence:6, ambiguous-page-candidates:1, monotonic-conflict:3, below-confidence-threshold:15, insufficient-independent-lexical-words:2, insufficient-distinctive-features:2 |
| 12 | r17-clean-257 | 17:27:19.060–17:27:59.510 | 34 | plaud-1#7723…plaud-1#7756 | no-direct-source-evidence:7, insufficient-distinctive-features:16, below-confidence-threshold:10, monotonic-conflict:1 |
| 12 | r17-clean-257 | 17:28:01.200–17:28:02.200 | 1 | plaud-1#7758…plaud-1#7758 | no-direct-source-evidence:1 |
| 12 | r17-clean-257 | 17:28:05.520–17:28:06.520 | 1 | plaud-1#7761…plaud-1#7761 | no-direct-source-evidence:1 |
| 12 | r17-clean-257 | 17:28:07.520–17:28:12.250 | 3 | plaud-1#7763…plaud-1#7765 | no-direct-source-evidence:3 |
| 12 | r17-clean-257 | 17:28:13.250–17:28:52.920 | 35 | plaud-1#7767…plaud-1#7801 | no-direct-source-evidence:5, below-confidence-threshold:8, monotonic-conflict:2, insufficient-distinctive-features:20 |
| 12 | r17-clean-257 | 17:28:53.920–17:29:12.630 | 13 | plaud-1#7803…plaud-1#7815 | no-direct-source-evidence:6, insufficient-distinctive-features:6, monotonic-conflict:1 |
| 12 | r17-clean-257 | 17:29:13.630–17:29:22.080 | 11 | plaud-1#7817…plaud-1#7827 | below-confidence-threshold:11 |
| 12 | r17-clean-257 | 17:29:26.230–17:29:38.990 | 13 | plaud-1#7832…plaud-1#7844 | no-direct-source-evidence:10, below-confidence-threshold:3 |
| 12 | r17-clean-257 | 17:29:39.990–17:29:41.280 | 1 | plaud-1#7846…plaud-1#7846 | no-direct-source-evidence:1 |
| 12 | r17-clean-257 | 17:29:42.280–17:29:44.280 | 2 | plaud-1#7848…plaud-1#7849 | below-confidence-threshold:2 |
| 12 | r17-clean-257 | 17:29:47.280–17:30:05.310 | 12 | plaud-1#7853…plaud-1#7864 | no-direct-source-evidence:8, insufficient-distinctive-features:1, monotonic-conflict:2, below-confidence-threshold:1 |
| 12 | r17-clean-257 | 17:30:07.340–17:30:25.320 | 16 | plaud-1#7866…plaud-1#7881 | no-direct-source-evidence:3, insufficient-independent-lexical-words:9, below-confidence-threshold:3, insufficient-distinctive-features:1 |
| 12 | r17-clean-257 | 17:30:26.320–17:30:31.570 | 5 | plaud-1#7883…plaud-1#7887 | no-direct-source-evidence:5 |
| 12 | r17-clean-257 | 17:30:32.570–17:30:43.990 | 11 | plaud-1#7889…plaud-1#7899 | insufficient-distinctive-features:2, insufficient-independent-lexical-words:6, monotonic-conflict:1, no-direct-source-evidence:2 |
| 12 | r17-clean-257 | 17:30:44.990–17:30:47.750 | 3 | plaud-1#7901…plaud-1#7903 | no-direct-source-evidence:3 |
| 12 | r17-clean-257 | 17:30:50.160–17:30:56.730 | 6 | plaud-1#7906…plaud-1#7911 | no-direct-source-evidence:6 |
| 12 | r17-clean-257 | 17:30:57.730–17:30:58.790 | 1 | plaud-1#7913…plaud-1#7913 | insufficient-distinctive-features:1 |
| 12 | r17-clean-257 | 17:30:59.790–17:31:00.790 | 1 | plaud-1#7915…plaud-1#7915 | ambiguous-page-candidates:1 |
| 12 | r17-clean-257 | 17:31:02.790–17:31:03.880 | 1 | plaud-1#7918…plaud-1#7918 | no-direct-source-evidence:1 |
| 12 | r17-clean-257 | 17:31:05.970–17:31:06.970 | 1 | plaud-1#7920…plaud-1#7920 | no-direct-source-evidence:1 |
| 12 | r17-clean-257 | 17:31:08.990–17:31:11.990 | 4 | plaud-1#7923…plaud-1#7926 | no-direct-source-evidence:4 |
| 12 | r17-clean-257 | 17:31:12.990–17:31:15.990 | 2 | plaud-1#7928…plaud-1#7929 | no-direct-source-evidence:2 |
| 12 | r17-clean-257 | 17:31:15.990–17:32:16.510 | 51 | plaud-1#7931…plaud-1#7981 | monotonic-conflict:5, no-direct-source-evidence:8, below-confidence-threshold:15, insufficient-distinctive-features:21, ambiguous-page-candidates:2 |
| 13 | final-290 | 17:32:16.510–17:32:22.830 | 5 | plaud-1#7982…plaud-1#7986 | below-confidence-threshold:1, insufficient-distinctive-features:3, insufficient-independent-lexical-words:1 |
| 13 | final-290 | 17:32:23.830–17:32:24.830 | 1 | plaud-1#7988…plaud-1#7988 | no-direct-source-evidence:1 |
| 13 | final-290 | 17:32:25.830–17:36:02.380 | 34 | plaud-1#7990…plaud-2#29 | no-direct-source-evidence:5, long-source-segment:2, below-confidence-threshold:8, insufficient-distinctive-features:19 |
| 13 | final-290 | 17:36:17.540–17:41:46.140 | 205 | plaud-2#33…plaud-2#237 | insufficient-independent-lexical-words:19, insufficient-distinctive-features:102, below-confidence-threshold:77, ambiguous-page-candidates:1, no-direct-source-evidence:4, monotonic-conflict:2 |
| 13 | final-290 | 17:41:50.490–17:42:09.950 | 17 | plaud-2#242…plaud-2#258 | no-direct-source-evidence:4, insufficient-distinctive-features:13 |
| 13 | final-290 | 17:42:10.950–17:42:11.950 | 1 | plaud-2#260…plaud-2#260 | no-direct-source-evidence:1 |
| 13 | final-290 | 17:42:12.950–17:42:30.150 | 6 | plaud-2#262…plaud-2#267 | no-direct-source-evidence:6 |
| 13 | final-290 | 17:42:31.430–17:48:03.630 | 258 | plaud-2#269…plaud-2#526 | no-direct-source-evidence:16, insufficient-distinctive-features:134, below-confidence-threshold:101, ambiguous-page-candidates:3, monotonic-conflict:4 |
| 13 | final-290 | 17:48:05.620–17:51:49.110 | 150 | plaud-2#528…plaud-2#677 | no-direct-source-evidence:4, insufficient-distinctive-features:67, below-confidence-threshold:77, insufficient-independent-lexical-words:1, ambiguous-page-candidates:1 |
| 13 | final-290 | 17:51:55.930–18:04:59.030 | 238 | plaud-2#679…plaud-2#916 | no-direct-source-evidence:11, below-confidence-threshold:83, insufficient-distinctive-features:128, insufficient-independent-lexical-words:1, ambiguous-page-candidates:13, monotonic-conflict:2 |
| 13 | final-290 | 18:05:08.790–18:07:02.820 | 27 | plaud-2#919…plaud-2#945 | insufficient-distinctive-features:14, below-confidence-threshold:13 |
| 13 | r17-clean-257 | 17:32:16.510–17:32:22.830 | 5 | plaud-1#7982…plaud-1#7986 | below-confidence-threshold:1, insufficient-distinctive-features:3, insufficient-independent-lexical-words:1 |
| 13 | r17-clean-257 | 17:32:23.830–17:32:24.830 | 1 | plaud-1#7988…plaud-1#7988 | no-direct-source-evidence:1 |
| 13 | r17-clean-257 | 17:32:25.830–17:36:02.380 | 34 | plaud-1#7990…plaud-2#29 | no-direct-source-evidence:5, long-source-segment:2, below-confidence-threshold:6, insufficient-distinctive-features:21 |
| 13 | r17-clean-257 | 17:36:21.720–17:36:33.870 | 5 | plaud-2#34…plaud-2#38 | insufficient-independent-lexical-words:2, insufficient-distinctive-features:3 |
| 13 | r17-clean-257 | 17:36:40.400–17:37:29.970 | 19 | plaud-2#41…plaud-2#59 | no-direct-source-evidence:4, insufficient-independent-lexical-words:9, below-confidence-threshold:2, insufficient-distinctive-features:4 |
| 13 | r17-clean-257 | 17:37:31.970–17:38:17.850 | 28 | plaud-2#61…plaud-2#88 | no-direct-source-evidence:2, insufficient-distinctive-features:10, below-confidence-threshold:16 |
| 13 | r17-clean-257 | 17:38:22.850–17:38:24.850 | 1 | plaud-2#91…plaud-2#91 | no-direct-source-evidence:1 |
| 13 | r17-clean-257 | 17:38:29.850–17:40:45.090 | 92 | plaud-2#93…plaud-2#184 | insufficient-distinctive-features:33, monotonic-conflict:1, no-direct-source-evidence:8, below-confidence-threshold:38, insufficient-independent-lexical-words:12 |
| 13 | r17-clean-257 | 17:40:45.090–17:42:09.950 | 73 | plaud-2#186…plaud-2#258 | no-direct-source-evidence:5, insufficient-distinctive-features:52, below-confidence-threshold:11, ambiguous-page-candidates:5 |
| 13 | r17-clean-257 | 17:42:10.950–17:42:11.950 | 1 | plaud-2#260…plaud-2#260 | no-direct-source-evidence:1 |
| 13 | r17-clean-257 | 17:42:12.950–17:44:32.990 | 104 | plaud-2#262…plaud-2#365 | no-direct-source-evidence:22, monotonic-conflict:1, insufficient-distinctive-features:60, below-confidence-threshold:14, ambiguous-page-candidates:7 |
| 13 | r17-clean-257 | 17:44:38.020–17:44:39.010 | 1 | plaud-2#369…plaud-2#369 | no-direct-source-evidence:1 |
| 13 | r17-clean-257 | 17:44:40.080–17:44:41.420 | 1 | plaud-2#371…plaud-2#371 | no-direct-source-evidence:1 |
| 13 | r17-clean-257 | 17:44:42.420–17:48:03.630 | 154 | plaud-2#373…plaud-2#526 | no-direct-source-evidence:3, ambiguous-page-candidates:2, insufficient-distinctive-features:72, below-confidence-threshold:77 |
| 13 | r17-clean-257 | 17:48:05.620–17:51:11.900 | 146 | plaud-2#528…plaud-2#673 | no-direct-source-evidence:4, insufficient-distinctive-features:64, below-confidence-threshold:78 |
| 13 | r17-clean-257 | 17:51:23.100–17:51:49.110 | 3 | plaud-2#675…plaud-2#677 | below-confidence-threshold:1, insufficient-distinctive-features:2 |
| 13 | r17-clean-257 | 17:51:55.930–17:54:22.140 | 33 | plaud-2#679…plaud-2#711 | no-direct-source-evidence:1, below-confidence-threshold:19, insufficient-distinctive-features:10, insufficient-independent-lexical-words:1, ambiguous-page-candidates:2 |
| 13 | r17-clean-257 | 17:54:30.390–17:56:30.830 | 46 | plaud-2#713…plaud-2#758 | insufficient-distinctive-features:32, below-confidence-threshold:14 |
| 13 | r17-clean-257 | 17:56:35.740–17:56:37.660 | 2 | plaud-2#761…plaud-2#762 | no-direct-source-evidence:2 |
| 13 | r17-clean-257 | 17:56:44.190–17:58:20.890 | 34 | plaud-2#764…plaud-2#797 | insufficient-distinctive-features:17, below-confidence-threshold:17 |
| 13 | r17-clean-257 | 17:58:28.710–17:58:49.930 | 8 | plaud-2#799…plaud-2#806 | no-direct-source-evidence:1, insufficient-distinctive-features:7 |
| 13 | r17-clean-257 | 17:58:51.130–17:58:57.530 | 4 | plaud-2#808…plaud-2#811 | insufficient-distinctive-features:4 |
| 13 | r17-clean-257 | 17:59:00.640–18:00:16.490 | 25 | plaud-2#813…plaud-2#837 | no-direct-source-evidence:3, below-confidence-threshold:5, insufficient-distinctive-features:17 |
| 13 | r17-clean-257 | 18:00:30.230–18:00:39.180 | 2 | plaud-2#841…plaud-2#842 | no-direct-source-evidence:1, insufficient-distinctive-features:1 |
| 13 | r17-clean-257 | 18:00:43.450–18:00:46.570 | 2 | plaud-2#844…plaud-2#845 | no-direct-source-evidence:2 |
| 13 | r17-clean-257 | 18:00:47.830–18:00:50.090 | 1 | plaud-2#847…plaud-2#847 | insufficient-distinctive-features:1 |
| 13 | r17-clean-257 | 18:00:57.170–18:07:02.820 | 96 | plaud-2#850…plaud-2#945 | no-direct-source-evidence:1, below-confidence-threshold:49, insufficient-distinctive-features:46 |
| 14 | final-290 | 18:07:02.820–18:12:56.700 | 229 | plaud-2#946…plaud-2#1174 | non-lecture:229 |
| 14 | r17-clean-257 | 18:07:02.820–18:12:56.700 | 229 | plaud-2#946…plaud-2#1174 | non-lecture:229 |

## 용량과 재현

- timeline.json: 1,044,921 bytes; gzip(level 9) 187,031 bytes; Brotli(quality 11) 135,408 bytes. 압축 수치는 전송 구현을 보증하지 않는 로컬 계산이다.
- 라우트·브라우저 로드 예산은 별도 실측 대상이다. 매핑 JSON의 압축 크기만으로 A-9 4G 2.5초 통과를 선언하지 않는다.
- 생성: `node scripts/build-conference-timeline.mjs`
- 동일 바이트 검증: `node scripts/build-conference-timeline.mjs --check`
- 커버리지: `node scripts/verify-conference-timeline.mjs --timeline dist/conference/timeline.json --sources docs/conference/source-segments.json`
- 입력·생성기 SHA-256/bytes, 입력 원본의 선언된 잠금 해시, 출력 JSON SHA-256은 mapping-quality-20261112.json에 기록한다.

## 남은 검수

- 실제 오디오 청취 0/10. ±0.5초 자막 싱크, 실제 슬라이드 전환 정확도와 장시간 재생은 미검증이다.
- 두 SRT에 누적된 긴 짧은-문장 구간·중첩을 그대로 보존했다. 원음 청취 없이 빠진 발화를 복구하거나 정확한 강연 시작 시각으로 바꾸지 않는다.
- 최종 290쪽 텍스트는 OCR 초안이며 정본이 아니다. 257쪽 PPTX 텍스트도 별도 덱 계보이므로 매핑은 독립 초안이다.
- 547장 WebP 렌더, 오디오 분할·트랜스코딩, 실제 자산을 넣은 수동 매핑 검수는 다음 작업이다.
