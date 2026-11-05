# Synthetic refresh advancement rehearsal

**PASS: 62 tests, 0 failures, 0 skipped, in the eight requested regression files.** Runtime: Node v24.22.2. This was a disposable synthetic-input rehearsal, not an actual provider refresh.

Both mutable BTC daily series were extended from 2026-10-31 through 2026-11-03. The Coin Metrics-shaped series repeated its last positive close. The Bitstamp-shaped series appended flat OHLC at its last positive close and repeated its last positive volume. Acquisition was set to 2026-11-04T06:30:00.000Z, beyond the previously hard-coded evaluation clock. These appended values are test data and do not represent market observations.

The daily refresh validator and append planner accepted three added rows with matching count, last date, source-request completion boundary and acquisition metadata. The candle parser accepted matching coverage and asOf metadata, and still rejected an evaluation clock one millisecond before acquisition. Unsupported original HTTP-response hashes and native-validation claims were removed only from the disposable synthetic payloads. Original repository data and fixed fixtures were verified unchanged by SHA-256.

The initial attempt passed 60 of 62 tests. It exposed two cutoff UI test preconditions left behind by the integrated explicit-entry/start behavior: a malformed saved-slot sentinel now requires an explicit entry decision, and retry returns to unconfirmed selection before the start action. The formal replay audit updated those preconditions while preserving storage, identity and output assertions. No production edits or timeout relaxation were made for this rehearsal. A fresh disposable copy then passed all 62 cases. Only tests/replay-cutoff-ui.test.mjs changed among the eight test files between attempts.

The machine-readable final receipt and complete final log are refresh-advancement.json and refresh-advancement.log. The initial failure receipt and log remain available as refresh-advancement.initial.json and refresh-advancement.initial.log.

This result covers the specified source/date regression areas and schema/clock guards. It does not establish live-network collection, provider authenticity, a full scheduled CI workflow, predictive accuracy, native browser behavior or a performance benchmark.
