# 첫 차트

The Bitcoin chart area on a cold outlook load. The boot shell may cover the page, and the first frame after it lifts has to already show the painted chart.

## Sub-features

- Boot shell `#atlas-boot-shell` and `html[data-boot]`
- Plot `.atlas-plot` and the Funnest canvas `.atlas-funnest-canvas canvas`
- Price readout `#lab-metrics`

## How to get to it (user POV)

Open `/?page=outlook` on the served origin with a cold cache. Wait until the boot shell is gone.

## Driving it with the browser

```bash
node scripts/verify-chart-first-paint.mjs http://127.0.0.1:8765/?page=outlook 1440 900
```

The script samples the main canvas while the page boots. The first sample after the shell hides must already contain more than one opaque color. A later sample whose main canvas is fully transparent fails the journey.

## Gotchas

The chart is replaced when a later series arrives. That replacement is drawn before the old canvas is removed; a cleared bitmap there is the flicker. The daily-check bar `#btc-refresh-notice` can still change the plot height by its own height after the first paint. That is the bar closing, and the canvas stays painted. Do not start a second server on port 8765. A missing Chrome, a connection reset that never reaches `data-boot=ready`, or an exception is not a pass.
