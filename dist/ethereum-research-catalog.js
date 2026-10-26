export const ETH_RESEARCH_SOURCES=Object.freeze([
  {
    "id": "mirae-20260223",
    "date": "2026-02-23",
    "label": "미래에셋 · 올해는 이더리움이다",
    "url": "https://securities.miraeasset.com/bbs/download/2142940.pdf?attachmentId=2142940",
    "finding": "AI 에이전트 투자 논제. 스테이킹 수치는 PDF와 공식 요약이 달라 자동 입력하지 않습니다. 채택과 ETH 가치 귀속은 별도 검증 대상입니다."
  },
  {
    "id": "lee-sec-202509",
    "date": "2025-09",
    "label": "톰 리 · SEC 보존 발표 원문",
    "url": "https://www.sec.gov/Archives/edgar/data/1829311/000149315225012513/ex99-2.htm",
    "finding": "BTC 가격 × ETH/BTC 비율은 조건부 산술입니다. BTC 목표와 비율 복귀의 공동 실현을 증명하지 않습니다. 발표자는 ETH 재무 기업의 회장입니다."
  },
  {
    "id": "vaneck-20240605",
    "date": "2024-06-05",
    "label": "VanEck · 2030 평가 시나리오",
    "url": "https://www.vaneck.com/us/en/blogs/digital-assets/matthew-sigel-eth-2030-price-target/",
    "finding": "$22,000은 미래 현금흐름·배수·공급 가정의 기준 사례입니다. 현재 목표나 적중 확률로 사용하지 않습니다."
  },
  {
    "id": "cme-2025h1",
    "date": "2025 상반기 · 자료 5월까지",
    "label": "CME·Glassnode · Ether 보고서",
    "url": "https://www.cmegroup.com/articles/files/2025/glassnode-ether-report.pdf",
    "finding": "신고가 미갱신 문장은 2025년 5월까지의 자료입니다. 8월 신고가 이후에도 그대로 적용할 수 없습니다."
  },
  {
    "id": "ath-cmc",
    "date": "사건 2025-08-24",
    "label": "CoinMarketCap · ETH 최고가",
    "url": "https://coinmarketcap.com/currencies/ethereum/",
    "finding": "ETH도 2025년 달러 최고가를 경신했습니다. 장중·종가·제공자별 가격 정의를 구분합니다."
  },
  {
    "id": "merge",
    "date": "활성화 2022-09-15",
    "label": "Ethereum · Merge와 발행",
    "url": "https://ethereum.org/roadmap/merge/issuance/",
    "finding": "PoW 발행 종료는 확인됩니다. 발행 감소가 가격 상승이나 하락을 단독으로 결정하지 않습니다."
  },
  {
    "id": "dencun",
    "date": "활성화 2024-03-13",
    "label": "Ethereum · Dencun",
    "url": "https://ethereum.org/roadmap/dencun/",
    "finding": "L2 데이터 비용과 L1 실행 수요의 변화를 PoS 전환과 구분합니다."
  },
  {
    "id": "eip1559",
    "date": "프로토콜 명세",
    "label": "EIP-1559 · 기본 수수료 소각",
    "url": "https://eips.ethereum.org/EIPS/eip-1559",
    "finding": "기본 수수료 소각과 검증자 우선 수수료를 구분합니다. 총 결제액이 소각액은 아닙니다."
  },
  {
    "id": "eip4844",
    "date": "프로토콜 명세",
    "label": "EIP-4844 · blob 수수료 시장",
    "url": "https://eips.ethereum.org/EIPS/eip-4844",
    "finding": "blob gas와 실행 gas는 다른 시장입니다. L2 사용자 수수료 전체를 ETH 소각으로 더하지 않습니다."
  },
  {
    "id": "erc8004",
    "date": "작성 2025-08-13 · Draft",
    "label": "ERC-8004 · 에이전트 신원·평판",
    "url": "https://eips.ethereum.org/EIPS/eip-8004",
    "finding": "등록·평판 기능은 수익성과 안전성을 보장하지 않으며 다른 체인에서의 거래도 가능합니다."
  },
  {
    "id": "x402",
    "date": "확인 2026-10-27",
    "label": "Coinbase · x402 실제 정산 방식",
    "url": "https://docs.cdp.coinbase.com/x402/seller/facilitator",
    "finding": "여러 체인을 지원하며 수천 요청을 한 건으로 묶을 수 있습니다. 요청 증가율과 온체인 정산 증가율은 다릅니다."
  },
  {
    "id": "roughgarden",
    "date": "2021",
    "label": "Roughgarden · EIP-1559 메커니즘 분석",
    "url": "https://arxiv.org/abs/2106.01340",
    "finding": "가정 아래의 인센티브 성질을 분석합니다. ETH의 미래 달러 가격을 증명하는 논문은 아닙니다."
  },
  {
    "id": "eip1559empirical",
    "date": "2022",
    "label": "Liu 외 · EIP-1559 실증 연구",
    "url": "https://arxiv.org/abs/2201.05574",
    "finding": "수수료 분산·대기시간 등 실제 정책 효과를 분석합니다. 이를 가격 목표의 보증으로 확장하지 않습니다."
  },
  {
    "id": "merge-study",
    "date": "2022",
    "label": "Kapengut·Mizrach · Merge 이벤트 연구",
    "url": "https://arxiv.org/abs/2210.13655",
    "finding": "Merge 주변 짧은 창의 네트워크 변화 연구입니다. 2025년 상대가격의 단일 원인 식별이 아닙니다."
  },
  {
    "id": "tokenomics",
    "date": "2021 출판",
    "label": "Cong·Li·Wang · Tokenomics",
    "url": "https://bfi.uchicago.edu/working-paper/tokenomics-dynamic-adoption-and-valuation/",
    "finding": "네트워크 효과와 균형 가치의 이론입니다. 실제 ETH 계수·경쟁 점유율을 별도로 측정해야 합니다."
  },
  {
    "id": "factors",
    "date": "2022 출판",
    "label": "Liu·Tsyvinski·Wu · 공통 위험요인",
    "url": "https://onlinelibrary.wiley.com/doi/abs/10.1111/jofi.13119",
    "finding": "시장·규모·모멘텀 요인을 연구합니다. 고정된 ETH 4년 주기의 증거로 쓰지 않습니다."
  },
  {
    "id": "agent-sok",
    "date": "2026-04-04 · preprint",
    "label": "Blockchain Agent-to-Agent Payments",
    "url": "https://arxiv.org/abs/2604.03733",
    "finding": "에이전트 결제의 신뢰·실행·회계 문제를 정리합니다. 토큰 수익률 예측과는 다른 연구입니다."
  },
  {
    "id": "a402",
    "date": "2026-03 · preprint",
    "label": "A402 · 서비스 실행과 결제 결합",
    "url": "https://arxiv.org/abs/2603.01179",
    "finding": "조건부 보안·정산 설계입니다. 배치 효율이 높아지면 요청당 ETH 수요는 줄 수 있습니다."
  }
]);
