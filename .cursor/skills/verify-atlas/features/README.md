# Atlas feature map

| Feature | File | Proof |
| --- | --- | --- |
| 가격 차트 | [price-chart.md](price-chart.md) | `#lab-chart` viewBox matches the plot after chat opens and closes |
| 첫 차트 | [first-paint.md](first-paint.md) | The first revealed canvas is already painted, and a later replacement is not cleared |
| 대시보드 메뉴 | [dashboard-nav.md](dashboard-nav.md) | On a 390px relay page, `[aria-current=page]` is fully inside `.atlas-nav` |
| 차트 채팅 | [chart-chat.md](chart-chat.md) | A stored open chat is hidden on 시장 분석 and returns on the price chart |
| 시장 진단 | [market-diagnosis.md](market-diagnosis.md) | The diagnosis frame shows 알파, 베타, 감마 and not the removed close chart |
| 모바일 크롬 | [compact-chrome.md](compact-chrome.md) | At 390px the header has no price, the fifth tab is 릴레이 콘텐츠, and market date labels do not overlap |

Drive one feature end to end before claiming the map. A journey that cannot meet its precondition fails and the reason stays in that feature's Gotchas.
