# Forecast replay data contract

Replay reveals observations along one fixed forecast path. It does not issue a forecast, change a retained record, calibrate a model, or authorize a release.

## Public functions

`dist/forecast-replay.js` exports three functions.

- `createRecordedReplaySession({record, snapshot, observations, observedAt, observedThrough, source, horizonDays, evaluatedAt})` verifies a BTC or asset record against its exact input snapshot. It restores the saved output once. The default horizon is 180 calendar days. The default evaluation clock is the actual current timestamp.
- `createHistoricalReplaySession({symbol, observations, asOf, horizonDays, modelKey, observedAt, observedThrough, source, generatedAt})` creates a clearly labelled current-model reconstruction. The model receives only prices through `asOf`. Its output is fixed for that session.
- `buildReplayFrame(session, {cursorIndex, cursorDate, cursorAt, clockMode})` returns a read-only frame. A date must belong to the session timeline. `cursorAt` optionally supplies the precise information timestamp for that date.

`dist/forecast-replay-sources.js` exports `loadReplayPriceArchive(symbol, options)` and `parseReplayPriceArchive(symbol, text, options)`. Both return `symbol`, `observations`, `observedAt`, `observedThrough`, and `source`. A caller owns request cancellation and stale-response rejection. The loader rejects redirects, unsafe local paths, invalid UTF-8, HTTP failures, and bodies exceeding 16,000,000 bytes.

## Session shape

The session and all its nested values are frozen. It contains the following fields.

| Field | Meaning |
| --- | --- |
| `identity` | Symbol, record ID, record kind, origin, issuance, snapshot ID, output hash, model version, and retained source identity |
| `mode` | `recorded` or `historical-reconstruction` |
| `timeline` | Daily crypto dates or reviewed equity session dates, from the origin through the earlier of the forecast end and evaluation UTC date |
| `inputPrices` | At most 90 calendar days of frozen context ending at the origin |
| `forecast` | The saved forecast over the selected horizon |
| `observations` | Available source inventory for the forecast horizon, including later information for future seeks |
| `targets` | The original horizon definitions and comparison baselines |
| `observationProvenance` | Source hashes, acquisition clocks, and whether complete information-time receipts are available |
| `historicalModel` | Explicit reconstruction model and interpretation, or null for recorded paths |
| `evaluatedAt` | The actual clock that bounds target maturity and observation availability |

`observations` is engine input. UI exports must contain the frame and identity, not the complete session inventory before those values are revealed.

`identity.pointMeaning`, `pointLabel`, and `bandMeaning` retain the interpretation of the preserved output in both the UI and exports. The original saved ETH path is one seeded random example; the corresponding BMNR path carries that ETH example through the conditional treasury valuation. Comparing that saved trajectory does not turn it into the model's central prediction. Other saved assets and BTC remain conditional paths. Their band meaning is copied from the validated output. Historical BTC carries the shrunken-trend baseline meaning; historical ETH carries the pointwise simulation-median and uncalibrated-quantile meanings. These labels never change the saved prices or output hash.

## Two clocks

`observed-date` reveals current-vintage observations by their market date. This is a visual reconstruction. Even an originally issued forecast receives `retrospective` target comparisons under this clock. It does not establish that the later observation vintage was available on the historical market date.

`information-time` also requires each observation's market close, actual recorded collection, and any known publication timestamp to precede the information cutoff. It reuses `selectPriceVintages`, including revision ambiguity checks. Missing acquisition metadata is rejected, rather than replaced with a guessed clock. A recorded forecast is hidden before its issuance time.

The frozen input snapshot also obeys its acquisition boundary. Asset records use the verified complete input clock's `latestCollectionAt`; the older BTC format conservatively uses issuance because it lacks that complete receipt set. These decisions are retained as `identity.inputAvailableAt` and `identity.inputAvailabilityBasis`. Before that time, `inputVisible` is false, `inputPrices` is empty, no hidden input enters `rows` or the axis, and `selected.flat` is null. If no visible price remains, `priceDomain` and `scale` are null. The UI must render an explicit empty state, rather than fall back to session input prices or invent a price domain.

The effective evaluation time is the earlier of the cursor clock and `evaluatedAt`. An unfinished present-day bar stays hidden. Future forecast dates cannot be replayed as though they already happened. A precise `cursorAt` can disclose a late acquisition for an earlier market date, while still obeying `evaluatedAt`.

Historical model reconstruction supports only `observed-date`. It never adds a prospective scored target.

## Frame shape and metrics

The frame provides `inputPrices`, `forecast`, `actual`, `rows`, `selected`, `dailyComparisons`, `targets`, `metrics`, `priceDomain`, `scale`, `inputVisible`, `forecastVisible`, and both cursor and effective evaluation clocks.

Every actual-price view, hover value, table, metric, and axis must use this frame. The axis includes known frozen forecasts and disclosed actual values. It excludes future actual prices. Moving backward recalculates all disclosed outcomes from the same immutable session.

Target statuses are `not-issued`, `pending`, `missing-observation`, `retrospective`, and `scored`. A missing observation is never zero or a carried-forward price. Only information-time evaluations of an issued record whose target closes after issuance can have `scored` status.

The metrics describe errors along one path from one origin. They are overlapping daily comparisons, not independent prediction trials. Direction compares movement from the fixed origin price. The flat-price comparator uses exactly the same valid log-error rows as the forecast. Zero forecast prices retain absolute price errors and have null log errors. Percentage overflow and undefined baseline denominators remain null with their valid-row counts.

All percentage, accuracy, and skill values are fractions. A value of `0.12` means 12%. Bands remain conditional ranges or uncalibrated simulation quantiles. No probability or coverage calibration claim is produced.

## Historical reconstruction models

BTC uses the existing `buildIndependentBenchmarks` shrunken-trend baseline. The UI must name it as a price-only baseline, not as the site's economic long-horizon model.

ETH supports the existing `pooled` and `adaptive` price models. The fixed simulation uses 256 draws and seed 20261027. The central prediction is the simulation median. The representative simulated trajectory is retained separately as `representativePrice`; its selection does not replace the median used for error comparison. Raw 10th and 90th percentiles are uncalibrated.

Both reconstructions retain a hash of the consumed prefix and fixed output. They report that the current model did not necessarily exist at the historical origin. Current treasury inputs are never applied to historical MSTR or BMNR reconstruction.

## Observation sources

BTC keeps the Coin Metrics end-of-day USD series used by its saved forecast. Coinbase candles are a different venue series and are not substituted or manufactured from those closes. ETH and equity sources preserve their actual OHLC values.

ETH loads `data/replay-eth-ohlc.json`, a separate outcome archive rebuilt from the preserved committed base and a captured raw tail. The original model input archive and immutable records remain unchanged. The parser validates the provenance reference shape. The published-source regression independently rebuilds every observation from the retained snapshot and original HTTP bytes. Neither operation establishes independent provider authenticity.

## Verification

Run the focused behavior and published-source checks with:

```sh
node --test --test-isolation=none --test-reporter=spec tests/forecast-replay.test.mjs tests/forecast-replay-sources.test.mjs tests/forecast-replay-published-source.test.mjs
```

The tests check future-price invariance, reverse seeking, unfinished targets, acquisition boundaries, later revisions, missing observations, original-record tampering, genuine OHLC, equity zero values, historical prefix causality, bounded network reads, and the exact retained ETH acquisition.
