# Fixed prediction persistence — v1.29.8

The current yellow/orange dotted prediction, brown range, full original inputs and cycle context are captured before asynchronous work. Replay does not run the prediction engine again. Actual candles paint **above** that complete fixed path: range → dotted prediction → actual candle bodies and wicks. Dates, prices and sampling are not moved to match outcomes.

## Save and Continue

The existing exit dialog retains its save checkbox. An explicit save prepares a SHA-256-verified snapshot, losslessly compresses its full JSON with gzip, and persists the complete capture. Small envelopes use the existing localStorage session key. Large envelopes use the browser's `atlas-fixed-replay` IndexedDB database, `captures` store, with a separate immutable digest key; localStorage holds only the small reference and playback settings.

A database transaction must complete before the session pointer is replaced. Quota, unavailable storage, blocked transactions, corrupted bytes or missing captures do not replace the previous saved record with a new prediction. Saving disables the dialog's confirmation/cancellation controls until the transaction resolves. The unchanged UI remains small; no new settings form is added.

Continue validates reference identity, bounded decompression, the entire original JSON digest and the replay engine's output hash. It restores the original path, band, presentation and cursor even if today's live model has changed or is not ready. The capture clock stays fixed while the observation-availability clock advances, allowing subsequently acquired real candles to be disclosed. Start new captures the newly displayed model; selecting/cancelling a starting point alone does not overwrite an existing save.

This is browser-local persistence, not cloud synchronization. Browser data deletion or eviction may remove a capture; a missing record is reported rather than silently substituted. Prior immutable records are retained; no quota cleanup deletes older captures automatically. No credentials or prediction inputs are sent to another service.

## Limits and compatibility

The localStorage envelope limit is 2 MiB; the decoded snapshot limit is 64 MiB. Decompression is bounded while reading, not after allocating unlimited output. Browsers without gzip streams can use uncompressed envelopes and the database path; unsupported database storage reports a failure without erasing the previous session.

Older hash-only saves can resume only when the current forecast's output hash still matches. A successful explicit save upgrades them to a full capture. An unpreserved historical curve cannot be reconstructed from a hash alone.

## Meaning and invariants

The replay start date is not a forecast publication date. The capture remains `issuedAt: null`, `publicationTimeProven: false`, and scoring disabled. Hashes detect changed local bytes; they do not prove third-party issuance or forecast accuracy. Public comparison JSON exports contain the disclosed frame and capture identity, not the entire private internal capture.

The compact center transport, external exit X, four starting-point actions, moving blue scissors, disabled Play/Forward/real-time before confirmation, weekly D updates from genuine Bitstamp daily OHLC, and Shift+Down/Right are unchanged. No backward shortcut, fabricated intraday bars, Replay Trading, orders or broker execution is introduced. Unrevealed actual extremes cannot enter the automatic price domain; the fixed prediction may intentionally contribute to it.

## Verification

Run `node --test tests/chart-replay-snapshot.test.mjs tests/chart-replay-ui.test.mjs tests/replay-fixed-forecast*.test.mjs`, `npm test`, and the existing native browser workflow. Fixtures cover the actual engine, coordinator and SVG painter but do not replace real Chrome verification. The native suite checks actual save/exit/Continue and the complete-capture digest. Remote CI and deployed-site evidence are recorded in PR #46; this document is not a claim that an unrun gate passed.
