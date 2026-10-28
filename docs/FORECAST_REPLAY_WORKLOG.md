# Prediction replay engineering record

## Intent and boundaries

The 2026-10-29 KST continuation makes an existing forecast inspectable one market bar at a time. A user can keep the forecast fixed, reveal subsequent actual observations, move backward, and compare errors with an unchanged-price baseline. A separate historical reconstruction helps inspect past behavior without inventing an old issuance date.

The working branch remains the existing Draft PR #39. Release authorization and production promotion remain false. The user's earlier omission of Gemini opposition and reverse review remains `omitted-by-user`; it is neither a passed review nor a newly required gate. No model default, original record, original snapshot, or frozen model source graph is replaced.

## Engineering method

The requested pstack material was read from the `pstack/` package in `cursor/plugins`, commit `c742dd61706fbacc1b95f1a20b7b988cf096ce6c`. The applicable poteto-mode, architect, swarm, feature, domain-modeling, proof, shared-state separation, and evidence-writing guidance informed this work. Independent explorations covered the data contract, chart surface, temporal integrity, and remaining retention capacity before implementation owners were assigned.

Implementation used isolated git worktrees with separate owners for the replay engine, journal UI, and verified base preparation. A fourth engineering stream subsequently owned native browser verification. The engine author also reviewed the UI against the final engine contract. The root integrated changes and ran the final combined checks. These are same-session agent reviews, not external Grok, Claude, or Gemini reviews. No unavailable review provider is represented as having executed.

## Architecture decisions

| Decision | Selected approach | Reason |
| --- | --- | --- |
| Placement | A replay tab inside the existing BTC and asset forecast journals | Reuses the selected immutable record and input snapshot, so the user knows exactly which prediction is being examined. |
| Session | Verified immutable session, with one pure frame projection | Playback, seeking, chart values, errors, exports, and axes use the same disclosure boundary. |
| Clocks | Separate market-date reconstruction and acquisition-time replay | A current archive cannot prove what was available on each historical day. Actual acquisition boundaries remain inspectable. |
| Prediction | Restore the exact saved path once | Playback must never fit a model against newly revealed observations. |
| Historical mode | Current price-only model applied to a prefix ending at the selected origin | Enables past experiments while explicitly denying an actual historical issuance or prospective score. |
| BTC history | Existing shrunken-trend comparison model | Does not silently substitute a price-only baseline for the economic long-horizon model. |
| ETH history | Existing pooled or adaptive median; representative trajectory separate | The model's illustrative trajectory is not misreported as its central estimate. |
| Candles | Source OHLC only | A close-only source cannot produce genuine highs, lows, or opens. BTC retains its original Coin Metrics price series. |
| Performance | Paired daily errors, direction, flat comparator, and explicit target statuses | Correlated daily errors from one origin are not independent samples or interval calibration evidence. |
| Playback ownership | One controller and one request owner per mounted journal | Closing, switching, seeking, and changing speed cannot leave an old timer in control. |
| Offline delivery | Embed and verify the same replay archives and asset records | A downloaded HTML should open the same replay without a silent older-data substitution. |
| ETH base refresh | Rebuild and inspect a content-bound candidate; separate promotion | Resolves candidate preparation while preserving the current operating base and frozen models. |

The alternative of a second global chart playback state was rejected because it would duplicate record selection, request ownership, and disclosure policy. The alternative of recalculating the forecast on each step was rejected because it would no longer measure the original prediction.

## Actual new observation evidence

The existing bounded ETH collector made one failed request and then one successful, separately preserved request. The successful response completed at `2026-10-28T15:15:14.149Z`, contained 588 raw bytes, and rebuilt completed bars through `2026-10-27`. Its raw text, raw bytes, request receipt, and full base-plus-tail snapshot are under `research-data/forecast-replay/20261029/`.

`dist/data/replay-eth-ohlc.json` is a separate replay observation archive. The published-source regression reconstructs all of it from the preserved snapshot and HTTP bytes. The incomplete `2026-10-28` candle is excluded. For the saved ETH origin of `2026-10-25`, two subsequent daily observations can be compared. None of the original 30-, 90-, or 180-day targets has matured at this acquisition time.

The prepared replacement base contains 3,813 completed observations: 3,804 rows retain both values and effective collection clocks, seven unchanged-price overlap rows have new collection clocks, and two rows are new. No historical value revision was observed. Existing historical gaps are retained. This candidate advances the bounded single-tail collection horizon by two days; it does not remove finite storage bounds or prove continuous future operation.

## Verification and retained conditions

The before-change source was `4165f30921d1f4bb981a4f1ada7cb85ede61d7e9`. Its full test suite passed 1,823 tests, and the existing native browser suite passed all 35 cases before replay changes were integrated. Final integrated results and their exact source identities are recorded separately in the continuation evidence directory after execution.

The formal remaining conditions are unchanged: complete exact economic inputs, the required UTC boundary observations, real nonoverlapping matured calibration windows, review of an operating-base replacement, and bounded calibration/retention beyond the active 500-observation, 2,000-record, and 1 MiB-index limits. A local replay screen, a reconstructed historical experiment, and a prepared base are not substitutes for those observations.

## User path

Open a saved forecast record, select **리플레이**, then use **재생**, previous/next bars, the date control, or the slider. The visible disclosure identifies whether market dates or recorded acquisition times determine availability. **과거 재구성** supports a chosen BTC or ETH origin and a 30-, 90-, 180-, or 365-day horizon. **현재 화면 JSON** exports only the disclosed frame and forecast identity. Long-horizon target status remains pending until its actual date and a valid observation are both available.
