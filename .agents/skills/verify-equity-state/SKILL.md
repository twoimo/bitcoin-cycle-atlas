---
name: verify-equity-state
description: Verify MSTR and BMNR chart readiness, Funnest paint confirmation, archive request ownership, projection invalidation, page suspension and restoration, and user range preservation. Use when changing dist/equity-view.js load/render/page lifecycle logic, the index.html boot handshake, or the corresponding TLA+ model and regression fixture.
---

# Verify equity chart state

Keep the observed chart usable while its forecast is pending. Never let revoked work overwrite newer prices, projections or errors. A correct calculation can still mislead if the UI pairs it with different inputs.

## Coverage and synchronization

- Covered code: `dist/equity-view.js` functions `load` (including the T3 forecast gate), `render` (including its replay and center-tool early return, the one-shot URL range and the Funnest mount), `watchFunnestPaint`, the mount's `onViewport` callback, `schedule`, `revealReady`, `changeInterval`, `changeSpan`, `resetRange`, range callbacks, the reload action, and `pagehide`/`pageshow`; undo/redo and go-to in `dist/native-chart-workbench.js`; the plot flags written by `dist/chart-replay.js` and `dist/center-workbench.js`; the `dist/index.html` boot-script handshake.
- Last correspondence review: commit `856e77422e0a43a77470aed2e3f64fa1e522880b` (2026-11-16). Previous: `fe93a5727277d15a934b7472588fb907e30b02b8` (2026-11-16). Equity view SHA-256: `a94854ab78b9c1005e5f88baa3cd9c999975e2cbd8e975457e89468f2f2d2c9f`. `fe93a572` is not an ancestor of `856e7742`. Every covered file is byte-identical between `fe93a572` and `c92c4871`, so the review read `c92c4871..856e7742`. The covered changes come from `931ed189`, which draws the chart through `mountObservedPriceChart`.
- That review added `mounted`, `funnestReady`, `chartError`, `orphan`, `discarded` and `rangeLost`, the actions `PaintConfirmed`, `PaintFails`, `OrphanSettles`, `RetryChart` and `NativePan`, the constant `GuardPaint` and the bound `FailureScope`. Model comments cite current line numbers. `docs/formal-equity/README.md` has a dated section for this review. Its older sections and the 2026-10-26 receipts still describe `7261c180`.
- `UsableRenderReleasesBoot` changed on purpose. The old wording was "An observed or actionable-error render releases the loading shell immediately." The new wording is "A render of a chart whose paint Funnest confirmed, or of an actionable error, releases the loading shell immediately." The evidence is in `931ed189`. It calls `revealReady()` from `render` only while `state.funnestReady` is set (line 211), and `tests/funnest-observed-price-adapter.test.mjs` pins `result?.painted===true` and `state.funnestReady=false` in the view source. The formula is unchanged. `painted` now records a render of a confirmed chart. `errorPainted` now records the retry panel, which shows for a price failure without a series or for a chart failure.
- `UserRangePreserved` keeps its wording and gains `~rangeLost`. A pan or zoom now reaches the view through `onViewport`, which does not set `state.rangeTouched`, so the old formula over `customRange` no longer covers it.
- `NoStalePublication` keeps its formula and now also covers a destroyed chart, whose late paint failure must not publish a chart error.
- The model does not count paint confirmations or track which series Funnest holds. A confirmation or a failure may settle whenever a chart is mounted, and a render of a mounted chart may start a watch. Those extra orders include every real one. An exact count explored 13.6 million states and ran past the runner's 60 s limit. `FailureScope` explores a chart failure only while `issued < RequestLimit`, so its retry can still load.
- The replay fixture stubs the T3 gate as always allowed and stubs chart replay, the workbench and the Funnest mount, so those branches are checked by the model only. `manualPaint` leaves each `ready()` pending for the test to settle. `snapshot()` copies the mount record, because every render rewrites the one record that `latest()` returns. The boot script's 20 s `fail('timeout')` and the runtime's 5 s paint limit are wall-clock paths outside the model; `ready` is the view's own `atlas:ready` dispatch.
- Outside the model: the mount's `onError` callback, which the pinned runtime cannot reach because it configures no datafeed or trading adapter; the engine's own viewport reports, including one that lands between a range reset and its render; capital-policy recalculation, cache eviction, dialog focus, instrument valuation and liquidity accounting.
- Two code facts have a replay control and no model rule. The `unconfirmed-readiness` control pins that readiness waits for the paint confirmation. The `interval-range-reset` control pins the interval retarget. The `.then` copy of the paint guard has no control at all. Removing it breaks no replay case.
- Model: `verification/equity-state/EquityLoad.tla`. Bounds: three request generations, daily/weekly displays, automatic/custom range choices, with or without a supplied URL range, chart failures within the first two request generations. Network continuations, the two animation-frame yields and each paint confirmation are separate steps.
- Actual-code replay: `tests/equity-load-ownership.test.mjs`, the two equity interval-switch cases of `tests/native-chart-viewport.test.mjs`, and `tests/helpers/equity-view-fixture.mjs`. The complete production initializer and actual inline boot script execute with HTTP, imports, rendering and DOM boundaries injected. The test does not copy `load` or inspect its hidden locals. `tests/equity-formal-fixture.test.mjs` pins the replay count.
- Read `docs/formal-equity/README.md` for correspondence and scope. Existing `verify-market-state` separately covers the crypto candle controller.

## Known failures on `856e7742`

The current model fails two rules. Both paths replay against the real `dist/equity-view.js` through the fixture, and `931ed189` introduced both. Do not weaken either rule. When the product changes, update the cited action and expect the current model to pass.

1. `UsableRenderReleasesBoot`. Open, prices arrive, `render` mounts the chart, `pagehide`, Funnest confirms the paint, `pageshow`, `render`. Line 166 returns while `suspended` and keeps no record, so line 211 never calls `revealReady()` for that chart. With prices and a projection already loaded, `pageshow` only schedules and the shell stays up. The suspended delivery is this check's standing assumption about late callbacks, the same one that the `hidden-ready` control rests on. No browser run established that order. The model step is the `discarded` branch of `PaintConfirmed`.
2. `UserRangePreserved`. The observed chart is ready, the user pans or zooms it, the coin archive arrives, both yields run, the projection completes. Line 197 `onViewport` stores the start and end but not `state.rangeTouched`, so line 244 clears the range and the next `render` hands Funnest the default one. The model step is `NativePan`, which leaves `customRange` unchanged.

TLC stops at rule 1, the shorter path. To see rule 2, read the model with `/statechart`, or run TLC on a scratch copy of `EquityLoad.cfg` with `INVARIANT UserRangePreserved`.

## Run

From the repository root with Node 24+ and Java 11+:

```sh
node scripts/verify-equity-state.mjs
```

The runner downloads official TLC release 1.7.4 and verifies SHA-256 `936a262061c914694dfd669a543be24573c45d5aa0ff20a8b96b23d01e050e88`. For offline execution, set `TLA2TOOLS` to the same jar. `JAVA` can select a binary. TLC 1.7.4 exits 255 with an `ArithmeticException` after a complete search under Java 25, so use Java 11 to 21. The download, hash check, 60 s process runner and TAP counts live in `scripts/verification-process.mjs`. Launch, download, checksum, timeout or incomplete-enumeration errors are blocked checks, never passes.

The runner replays the code first, then runs the nine model controls, then the current model. Expect 36 actual UI replay cases and the two interval-switch cases to pass, eleven mutations of temporary product copies to fail the intended assertion, and the restored copy to pass. The old boot order and the eight deliberate model mutations must fail their named invariants. Exact mutation selectors fail closed on source drift. Product files are never mutated by this command.

On `856e7742` the command then exits 1, because the current model fails `UsableRenderReleasesBoot`. After both known failures are repaired and the model describes the repair, expect the current model to pass. A scratch copy that models both repairs explored 804,240 distinct states in 22 s.

Read every TLA+ result with pstack `/statechart`, including passing results. Follow that skill's current instructions; do not assume copied options or machine paths remain valid. It shows numbered failure stories and successful state transitions. Pass `EquityLoad.map.mjs` as its view. Use `/maintain-formal-verification-skill` after unrelated changes that did not recheck correspondence.

## Review a change

1. Compare covered source with the synchronization commit. Map every publication and `await`; keep final initialization separate from per-load continuations.
2. Update source references on model conditions. Do not invent guards. Preserve documented extra delivery orders rather than assuming abort prevents late work.
3. Check every readiness writer. `Render`, `InitialFrame` and `PaintConfirmed` release through `RenderBody`. `PaintFails` and an unguarded `OrphanSettles` release directly. Each must update the hidden-readiness monitor whenever it can first make the page ready.
4. Check every paint continuation against both parts of its guard, the mount identity and the suspension.
5. Replay each counterexample through public initializer/callback entry points and observable boot attributes, rendered inputs and status. If it does not reproduce, inspect correspondence before changing code or weakening a rule.
6. Keep price failure separate from forecast failure. Rejected coin inputs or calculations leave the observed chart usable. Fresh prices invalidate an old projection before publishing a new one.
7. Run the command and inspect named tests and expected negative-control failures. A file-level pass summary alone is insufficient.
8. After confirming correspondence on committed code, advance this synchronization commit and source hash, regenerate evidence and review the charts. Verification does not automatically follow changed code.

## Scope

This is finite-state verification, not an unbounded or whole-program proof. The model permits extra callback and input orders, including suspended callbacks. That adversarial trace does not establish a particular browser's scheduling behavior. Forecast accuracy, numerical formulas, pixels, latency, liveness and rendering dependencies are outside this check. A paint failure that reaches a suspended document is dropped the same way as a confirmation. The page then shows neither a chart error nor readiness, which is a liveness gap that no rule here states.

## Recover the original local synchronization revision

Native Git push was unavailable in the implementation environment. The GitHub API publication preserves the file tree but creates a different commit object. Read `docs/evolution-2026-10-26/SOURCE_PROVENANCE.md` and verify/fetch its original Git bundle into the separate verification ref before diffing an unavailable synchronization commit. The current synchronization commit `856e7742` (tree `01720549f0a5f4e7fb05129b1c97f80389d993b6`) merges the funnest-charts 0.6.22 renewal into the 2026-11-16 refactor series. If that commit lands under another commit ID, diff from the landed commit with the same tree. Never substitute the public commit ID for the original recorded identity or rewrite an immutable forecast.
