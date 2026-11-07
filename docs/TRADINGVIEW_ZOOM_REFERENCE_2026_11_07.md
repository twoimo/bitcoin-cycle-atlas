# TradingView interaction reference — 2026-11-07

The user approved publication of the unified price workspace and requested a
deeper clone of TradingView's zoom interactions, followed by a free-tier
Cloudflare Workers Builds deployment. This note records the observed reference
and the implementation boundary; it is not a claim of pixel-perfect equivalence.

## Method and reference

The requested [clone-website workflow](https://github.com/JCodesMore/ai-website-cloner-template/tree/ee3f5a2f31fd549b9593fa4f7cf6d2955ee593bb/.agents/skills/clone-website)
was used to inspect the actual TradingView chart with native pointer input.
The observed chart was BTCUSD, Bitstamp, 1W, at a 1363×936 browser viewport.
The existing reference session used dark chrome and a light chart surface;
this inspection concerns geometry and interactions. Atlas retains its selected
dark financial palette and actual source data.

## Directly observed behavior

| Surface | Input | Result |
| --- | --- | --- |
| Chart | Floating `+` button | The visible time range contracts while the right endpoint remains approximately fixed. Candle spacing changes; outer controls retain their dimensions. |
| Chart | Wheel up | Time range contracts toward the right endpoint. The date under a stationary pointer changes. The automatic price range recomputes from the visible data. |
| Price axis | Drag upward | Only the Y range contracts. Time coordinates remain unchanged, and candles can extend beyond the manual price viewport. |
| Price axis | Wheel up | Only the Y range contracts around the pointed price. |
| Price axis | Double click | Automatic price fitting is restored without resetting the time window. The reference context menu subsequently shows Auto checked. |
| Time axis | Drag 200px right | Time range expands with the right endpoint retained; candle spacing decreases. |
| Outer frame | All the zoom operations above | Plot remains1200×827 at(56,42); right price axis58×827; time axis1200×28. Labels do not scale with the candles. |

The reference tooltip describes holding Ctrl while zooming to maintain chart
position. A Ctrl-button interaction was inspected, but that observation was not
precise enough to establish an independent quantitative anchor measurement.
Plot Y panning, touch pinch, extreme spacing limits and mobile reference behavior
were not established by this session. Atlas tests its own implemented behavior
for those cases without labeling it a reference measurement.

## Atlas implementation

The shared navigation controller defaults to a fixed right time endpoint.
Ctrl-wheel inside the plot uses the pointer position; Meta-wheel and Ctrl-wheel
outside the plot remain available to the browser. Context-menu zoom retains its
explicit clicked-position meaning. Price-axis wheel/drag and reset are distinct
from time-axis zoom. Small trackpad deltas accumulate within a gesture, and a pan
uses the rendered endpoint distance rather than an inclusive observation count.

BTC, ETH, equities, ETFs, HYPE and monthly housing charts use common spacing
limits and candle-body geometry. The0.5–64px spacing and6,000-bar interaction
budget are Atlas rendering guardrails, not measured TradingView constants.
Explicit Fit/date views keep their requested range; the first gesture does not
abruptly normalize a fitted view to a different range.

React charts share the native price-scale and measured axis-label layout, draw
at their actual allocated pixel height and retire gestures when the instrument,
source revision or interval changes. Interval changes preserve the current UTC
window and valid manual price range. Housing remains monthly index data; it
does not acquire fabricated candles or intraday observations.

The actual browser verification covers unchanged perimeter geometry, plot zoom,
price-axis wheel/reset, time-axis drag and source-specific chart capabilities.
Execution status and source identity belong to the generated browser and
Cloudflare verification receipts, not this design note.

## Delivery

The production target is the dedicated free Workers domain
`https://bitcoin-cycle-atlas.twoimo.workers.dev`. The reference website
`bitcoincyclescomparison.com` is not treated as an owned deployment domain.
Cloudflare configuration takes the actual public origin as an explicit input.
GitHub Actions definitions are retained as non-executable migration records;
Workers Builds executes the canonical verification gates before publication.
