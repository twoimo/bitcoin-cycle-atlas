# 모바일·태블릿 크롬

Viewports at or below 1024px use one 48px header and a 56px, five-item bottom bar. The header price is not shown. The fifth item reads 릴레이 콘텐츠 and opens `/?page=relay`.

## Sub-features

- Header price absent: `.atlas-trade-price` has no box
- Bottom labels: 차트, 비교, 시장, 릴레이 콘텐츠, 채팅
- Dashboard title stays whole and `.atlas-dashboard-nav` scrolls to the last link
- Market date labels do not overlap

## How to get to it (user POV)

Open `/` at 390×844. The legend still shows the daily close. Open `/?page=relay` and the relay tab is current. Open `/market-lab/` and the axis dates are separate.

## Driving it with the browser

Read the header children, the five tab labels, and the date-label boxes inside the market frame. A label whose right edge passes the next label's left edge is a failure. Desktop above 1024px keeps compact off, a 38px heading, and the side rails.

## Gotchas

The local server is the existing `127.0.0.1:8765` process. Do not start or stop it. A fresh headless profile can show the archive close instead of the served 2026-11-17 close.
