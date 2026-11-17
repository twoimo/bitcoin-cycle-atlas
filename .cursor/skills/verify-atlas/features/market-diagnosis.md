# 시장 진단

The US diagnosis replaces the chart center. The frame is `iframe.atlas-center-frame`.

## Sub-features

- Three axis charts labeled 알파, 베타, 감마
- No `S&P 500 관측 종가` card
- No `출처·시점·모형 한계 · 13개 출처` line on this tab

## How to get to it (user POV)

Open `/market-lab/` and wait until the frame document contains `알파`.

## Driving it with the browser

Read the frame document text and `scrollWidth`. At 390px the frame fits the viewport and the chat sheet is not the top layer. The three axis names are present.

## Gotchas

The published `ed373cd8` frame still served the previous diagnosis bundle: it contained `S&P 500 관측 종가` and `출처·시점·모형 한계 · 13개 출처`, and it did not contain 알파, 베타, 감마. Rebuilding with `node scripts/build-pages.mjs` refreshes `dist/market-lab/app`. After that rebuild, each axis SVG must sit inside its own `.ml-axis-chart` box. A local frame URL prefixed with `/bitcoin-cycle-atlas/` on a root server is a stale `site-paths.js` module, not a missing file, until a reload fetches the current module. The page generator does not emit `/market-lab/kr/`.
