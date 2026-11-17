# 가격 차트

The default workbench. One outer toolbar, a left tool rail, the price plot, a bottom range bar, and a narrow right rail.

## Sub-features

- Symbol trigger `종목 선택 · 비트코인 / USD · BTCUSD`
- Plot `#lab-chart` inside `.atlas-plot`
- Right rail `.workbench-rail` with 채팅 and 선택 데이터
- Account mark `#auth-account`

## How to get to it (user POV)

Open `/` on the served origin. Wait until the status text includes `비트코인` or the trigger shows `BTCUSD`.

## Driving it with the browser

Resize to 1280×800. Read `#lab-chart` width and `viewBox`. Click `[data-chart-chat]`, wait for a paint, and read the viewBox again. Click it once more and confirm the plot grows back. `documentElement.scrollWidth` stays within the viewport.

## Gotchas

Phone width uses a fixed chat sheet, so the viewBox does not shrink at 390px. Event dots are 20px chart marks, not toolbar targets. Do not treat port 8000 as this journey when that server is serving another checkout.
