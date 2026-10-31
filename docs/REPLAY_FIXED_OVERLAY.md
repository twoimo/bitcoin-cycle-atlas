# Fixed forecast overlay — v1.29.7

## Contract

The current yellow/orange dotted path, brown range and cycle presentation are captured before asynchronous preparation. Replaying and reselecting a start point reveal only genuine observed candles; they do not rerun the forecast engine or backdate the current assumption into an October 21 issued forecast.

Paint order is range, actual candles/close line, fixed forecast. The forecast path does not consume pointer events. Values, dates and sampling are unchanged. Auto-scale may change pixel coordinates when a disclosed actual or a user viewport changes; that is not a recalculation of the forecast.

A pending selection rebuilds actuals only through its safe cutoff. A source failure has no invented actual bars. Pending/error frames have no exportable verified session or stale score. Future actual highs/lows must not enter the displayed axis.

The compact transport, separate exit X, four-action Select bar landing page, scissors selection and weekly candles updated by genuine daily OHLC remain unchanged. Shift+Down and Shift+Right remain; no backward shortcut or trading/order/broker capability is added.

## Persistence boundary

This is the reviewed local fixed-overlay patch applied to main a9e0989135f0e556a57da962e6c3b19df022c943. The separate draft PR #46 adds persistent full snapshots and has unresolved native save/exit failures. It is not part of this release and is not overwritten. Existing hash-checked session resume remains unchanged; this patch does not claim that an unpreserved older path can be restored after the live model changes.

## Repeatable checks

```sh
node --experimental-vm-modules --test --test-concurrency=2 tests/replay-fixed-forecast*.test.mjs tests/chart-replay-ui.test.mjs
npm test
npm run verify:chart-replay
ATLAS_BROWSER_CASE_SCOPE=chart-replay ETH_BROWSER_IMAGE_LOG_MODE=failures-only node scripts/verify-eth-candidate-browser.mjs
```

The new unit tests use the real coordinator, engine, Atlas wrapper and SVG painter with deterministic DOM boundaries. They are not native-browser results. The existing browser harness now verifies the painted forecast is after both individual and batched actuals and cannot intercept chart selection. Remote CI, native browser, deployment and served-artifact verification are separate gates recorded in the PR.
