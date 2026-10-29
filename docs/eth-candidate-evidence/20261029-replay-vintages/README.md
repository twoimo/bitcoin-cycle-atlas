# Replay vintage boundaries and safe failure handling

## Why

Continue the fixed-forecast replay so a later correction cannot change an earlier information-time frame, ambiguous source ordering cannot select a convenient result, and a rejected frame cannot leave playback or export running.

Base commit: `04efac0dcc18a792de17afc4ff44266090dd0494`.

## Reproduced defects and corrections

Historical reconstruction selected the last dated price vintage without bounding collection by `generatedAt`. A correction unavailable at reconstruction time could change the fitted prefix. Selection now checks event, collection and publication clocks before choosing a current vintage. Eligible post-origin captures remain explicitly retrospective reconstruction, never historical issuance evidence.

Outcome checks compared equal collection times only with the latest row. An older conflict could hide behind a newer revision in some array orders. Selection now checks every eligible date/time group, handles unorderable undated captures, and resolves equivalent ties deterministically. Price, genuine OHLCV and source hash participate in conflict checks. Future conflicts are deferred until their collection cutoff, so earlier valid information-time frames remain usable.

Frame failures now stop timers, disconnect resize observation, clear stale inspection and keyboard handlers, conceal stale content and invalidate export. Retry creates a new controller. No synthetic candle data, imputed outcome or frozen forecast rewrite is introduced. Replay semantics are versioned as `forecast-replay-2`; frozen prediction model versions are unchanged.

## Local evidence

The actual baseline Actions artifact `12841960830` was recovered. Its 61,492,509-byte ZIP SHA-256 is `13d5aed21249b5902b52fcc2f08060bb6c919612b3403b8fc0aee8aba45920bd`. ZIP CRC and all 677 source-book frames were checked. This is a partial source recovery, not a complete repository checkout.

The first 14 new boundary cases produced 10 failures on the original core. The UI lifecycle check also reproduced an uncaught mid-playback exception against the original view. After correction, the final local partitioned runs on Node v22.16.0 passed:

| Disjoint test partition | Passed | Failed | Skipped |
| --- | ---: | ---: | ---: |
| Replay, controls and source binding | 57 | 0 | 0 |
| Existing model and numeric-range regressions | 46 | 0 | 0 |
| Existing forecast and outcome record contracts | 36 | 0 | 0 |
| Total | 139 | 0 | 0 |

There are 18 added top-level tests: 17 vintage-boundary tests and one view-lifecycle contract. The latter executes the actual view source in a Node VM with DOM, chart and loader doubles. It checks initial-frame failure, mid-playback failure, retry and stale export during loading. It is not native-browser evidence. The helpers are statically imported from the existing controls test so the source-book dependency closure includes them, and root test discovery does not execute them twice.

All 491 recovered committed-source frames were rehashed. Exactly the two replay modules and the controls test changed; the other 488 remained identical. Frozen models, prices and recorded predictions were not changed. Repository publication must use the existing Git tree and only the explicit changed paths, not the partial recovery tree.

Local Chromium navigation was rejected by administrator policy with `ERR_BLOCKED_BY_ADMINISTRATOR` before any browser case ran. No successful local screenshots or native-browser counts are asserted. The project-supported Node 24, full repository suite and native browser require the new commit's remote CI; previous runs are not credited to this change.

## Remaining boundaries

This fixes replay integrity, not predictive accuracy. No new market observation, matured target, calibration freeze or complete economic snapshot is claimed. Actual future target maturity, the required first twelve non-overlapping cases, economic input coverage, reviewed base renewal and operational schedule activation remain separate conditions.

Pstack reproduction and artifact-verification practices were used with separately logged parallel test subprocesses. No independent subagent or external model review was available in this execution. Gemini and reverse review remain `omitted-by-user`.

Draft is preserved. No main merge, deployment, archive publication, schedule activation or default-model promotion is authorized by this patch. `releaseAuthorized=false`; `productionPromoted=false`.
