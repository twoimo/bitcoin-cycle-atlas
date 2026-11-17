# 차트 채팅

A local room opened from the chart rail. Messages stay in this browser under `atlas-chart-chat-v1`. The open preference is `atlas-chart-chat-open`.

## Sub-features

- Rail button `[data-chart-chat]`
- Panel `#atlas-chart-chat`
- Close button `채팅 닫기`

## How to get to it (user POV)

On the price chart, press `채팅`. The panel uses the same column as 선택 데이터 on a wide viewport and a fixed sheet below 620px.

## Driving it with the browser

Set the open preference, open `/market-lab/`, and confirm `#atlas-chart-chat` is hidden while `data-center-tool` is `market-us` and the preference is still `1`. Return to `/?page=outlook` and confirm the panel is visible again. An explicit open while a center page is showing stays open across a later shell sync.

## Gotchas

The published `ed373cd8` build restored the sheet over 시장 분석, so the diagnosis was covered at 390px. Closing the sheet must not be required to see the page the reader just opened. Do not post into another site's chat.
