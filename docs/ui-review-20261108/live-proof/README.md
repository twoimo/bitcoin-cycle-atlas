# Published UI observations

## Before UI publication

`foreground-before.json` is the original DOM-derived observation from the public site, captured at 2026-11-08 17:52–17:54 UTC. Its publication manifest identifies source `bd5b70a96e1fab466ee6648c2c07db882b02681f`. This is supplementary live evidence and is **not** the `1635f87` baseline used for the six-viewport native comparison.

At 1363×936, the 233740, HYPE, Seoul housing, and Market Analysis screens all retained an 831.0625×14 BTC legend rectangle in the background DOM. In all four cases it had `visibility:hidden` and ancestors marked `inert` and `aria-hidden=true`. Each foreground chart was separately identified through its visible child DOM. The top-level page width was 1363px in all four cases.

The iframe `src` can retain its creation route while the current visible chart is changed through the existing host/child ownership protocol. A retained URL alone is therefore not evidence that a stale chart remains visible. The P0 routing checks use the actual current instrument, painted prices, loading state, and frame ownership.

`market-analysis-before.jpg` is the unmodified viewport screenshot from that public observation. The S&P 500 observed-price chart is visible; the shared BTC price/cycle legend is hidden. `before-file-receipt.json` records the original browser-shared filenames, byte counts, and SHA-256 hashes.

## After UI publication

Pending the same-source production browser gates and public `publication.json` update. The before observations do not claim that the new UI has been deployed.
