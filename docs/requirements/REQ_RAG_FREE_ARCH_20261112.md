# 요구사항 — 릴레이 RAG 무료 아키텍처 (Vectorize·D1 없이)

작성 2026-11-12. 상태: **설계 확정·구현 전**. 대상 `twoimo/bitcoin-cycle-atlas`.
사용자 결정: "추천대로" + **Vectorize+D1 생성 없이 무료로**. 기존 `REQ_RELAY_RAG_20261109.md`의 8단계 계약·평가·보안은 유지하고, 저장·검색 계층만 무료 구성으로 바꾼다.

## 1. 왜 바꾸나

WP-B 결정 D1은 Cloudflare Vectorize + D1이었으나, 사용자가 **유료 인프라 생성 없이** 무료로 하라고 지시했다. 릴레이 코퍼스가 작아(현재 `dist/data/relay/index.json` 0.3MB, Telegram 60메시지 + Naver/Hankyung 구조화 자료) **정적 인덱스 + 엣지 검색**으로 충분하다.

## 2. 아키텍처

```
[릴레이 번들] → (빌드) 청크 분할 → Workers AI bge-m3 임베딩
              → int8 양자화 → 정적 인덱스(JSON/JSONL) → dist/data/relay/index/<hash>/
[질문] → Worker(무료) → bge-m3 질의 임베딩 → 코사인 top-k (정적 인덱스)
       → 인용 구절 + (가능하면) Workers AI LLM 답변 → 스트리밍
```

- **임베딩**: Cloudflare Workers AI `@cf/baai/bge-m3` (다국어, 1024d). 가격 1,075 neurons/M tokens, 무료 10,000 neurons/일 → 약 **9.3M tokens/일**까지 무료. 현재 코퍼스(≈0.1M tokens)는 1회 빌드에 **약 108 neurons**.
- **저장**: Vectorize·D1 없이 **정적 자산**으로 배포. 청크 벡터는 int8(1,024B/청크)로 양자화, 메타데이터(방·글 id·시각·구절 범위)는 JSON. 현재 규모에서 인덱스 **< 2MB** 예상.
- **검색**: 두 경로 중 선택.
  (a) **클라이언트 검색**: 인덱스를 1회 내려받아 Web Worker에서 코사인. Worker CPU 0, 오프라인 재검색 가능.
  (b) **Worker 검색**: Worker에서 top-k. 무료 100k 요청/일·10ms CPU/호출. 청크 수백 개 규모에서는 10ms 안쪽으로 예상.
- **생성**: Workers AI 무료 LLM(예: `@cf/meta/llama-3.1-8b-instruct`, 300 req/min) 또는 기존 OpenAI 키. 무료 neurons를 아끼기 위해 **기본은 추출형 답변(상위 구절+인용)** 으로 시작하고, LLM 답변은 무료 잔량이 있을 때만 켠다.
- **캐시**: Worker Cache API(무료) 또는 Workers KV 무료(100k reads/일, 1GB). 별도 DB 없음.
- **신선도**: 릴레이 데이터 갱신 시 인덱스를 다시 만들고 파일명에 content hash를 넣는다. Worker는 manifest의 최신 hash만 읽는다.
- **Vercel/GitHub**: Vercel은 프리뷰·데모 호스팅 선택지, GitHub은 소스·릴리스의 정본. 프로덕션 경로는 Cloudflare Workers Builds(무료)로 유지한다.

## 3. 무료 한도와 폴백

| 자원 | 무료 한도 | 이 설계의 사용 |
|---|---|---|
| Workers AI | 10,000 neurons/일(00:00 UTC 리셋) | 임베딩 빌드 ≈108, 질의 임베딩 소량, LLM 답변은 잔량 내 |
| Workers | 100,000 req/일, 10ms CPU | 질의 API·정적 자산 |
| 정적 자산 | 파일 25MiB·20k 개 | 인덱스 < 2MB |
| KV(선택) | 100k reads/일, 1GB | 답변·질의 캐시 |

- 무료 한도 초과 시: **자동 유료 전환 금지.** LLM 답변을 끄고 추출형 답변+인용으로 폴백하며 화면에 이유를 표시한다.
- 품질 비교: bge-m3 vs `text-embedding-3-small`(유료)을 골든셋 Recall@10·nDCG@10로 비교하되, 유료 전환은 사용자 승인 후에만.

## 4. 수용 기준

| # | 기준 | 측정 |
|---|---|---|
| F-1 | 인덱스 빌드가 원문 100%를 청크로 덮고 누락 0 | 빌드 리포트 |
| F-2 | 질의 top-k에 원문 구절·출처·시각이 붙는다 | 골든셋 30문항 |
| F-3 | 무료 한도 내에서 답변 1건이 5초 안에 온다(캐시 제외) | 실측 |
| F-4 | 한도 초과 시 추출형 폴백·이유 표시, 유료 호출 0 | 강제 소진 테스트 |
| F-5 | Vectorize·D1 리소스 생성 0 | 계정 리소스 목록 |
| F-6 | 인덱스 재빌드가 데이터 갱신 후 1회 실행으로 끝난다 | 빌드 로그 |

## 5. 리스크

- bge-m3 한국어 검색 품질이 유료 모델보다 낮을 수 있다 → 골든셋으로 먼저 측정하고, 미달 시 하이브리드(BM25+벡터)로 보완한다.
- 무료 LLM은 긴 답변에서 품질·지연이 흔들린다 → 답변 길이 상한(≤450 tokens)과 인용 우선.
- 인덱스가 커지면(수만 청크) 정적 검색이 느려진다 → 그때는 R2 무료(10GB) + Worker 샤딩 검색으로 확장, Vectorize는 최후 옵션.
