---
name: verify-market-state
description: Verify candle request ownership, cancellation, forced refresh, saved-data fallback, and explicit history retry in Bitcoin Cycle Atlas. Use when changing market-data-controller.js, its async guards, history retry cooldowns, callback ordering, or the model and regression checks that protect chart loading.
---

# Verify market request state

Keep this promise: **a canceled or superseded request never replaces or notifies the displayed chart.** A broken guard can overwrite a fresh price view with a late saved response.

Also keep **a completed manual refresh releases the previous failed-history cooldown**, including when recent candles fall back to retained data. Ordinary gestures must still respect a newly failed request's backoff.

## Coverage and synchronization

- Covered implementation: `dist/market-data-controller.js`, `createMarketDataController`, specifically `load`, `cancel`, the ownership checks before publishing results, and `ensureRange`'s history retry status and cooldown.
- Last synchronized source commit: `c302fb4f0249d6920536d2da70f58e5426e9f472`. Compared with baseline `d906df3b42a555c57552f005d25a9fef4cfd4c5e`, the covered controller adds the explicit-refresh cooldown reset. The original ownership guard is unchanged. The checked controller SHA-256 is `f9c56339c1a5a55908e9680bb28290b46983b005d5770272dd13f048603182fa`. The updated gate passes all 31 implementation regressions and rejects both isolated real-code mutations.
- Model: `verification/market-state/MarketRequests.tla`; configuration bounds requests to three generations and two intervals. `MarketRequestsBroken.tla` is a deliberate negative control, not an observed production bug.
- Retry model: `verification/market-state/HistoryRetry.tla`; one interval with retained candles, current request kind, published statuses, a boolean cooldown, and a refresh-completion monitor. `HistoryRetryBroken.tla` models the reproduced pre-fix refresh bug. Neither model proves wall-clock delays or page coverage.
- Actual-code checks: `tests/market-data-controller.test.mjs`, `tests/intraday-history.test.mjs`, and `tests/market-request-ownership.test.mjs`.
- Read `docs/formal-state/README.md` for the model-to-code mapping, assumptions, evidence, and chart commands. The intraday tests cover examples; pagination itself is outside the TLA+ proof.

## Run

From the repository root, with Node 24+ and Java 11+:

```sh
node scripts/verify-market-state.mjs
```

The runner downloads TLC 1.7.4 from its official release into ignored `build/formal-tools/` and checks its SHA-256. For an offline run, set `TLA2TOOLS` to the same verified jar. Do not silently accept another tool version or a download/hash error.

Expect both current models to pass; `MarketRequestsBroken` to violate `NoStaleDisplay`; `HistoryRetryBroken` to violate `RefreshCanRetry`; and all 31 real-code regressions to pass. The runner makes two separate temporary mutations: removing the saved-fallback ownership guard must fail the stale-update assertion, and removing the explicit-refresh cooldown reset must fail the history-retry assertion. A tool error does not qualify as either expected failure. The runner deletes its temporary copies and never mutates product files.

## Review a change

1. Compare covered source with the synchronization commit. Trace each `await`, request replacement, cancellation, and publication against its action in the model.
2. Treat each modeled action as a synchronous continuation. Split an action if new code adds an `await` inside it. Preserve canceled requests as possible late completions; abort is not proof that a response cannot arrive.
3. Run the command and inspect its real exit status. Confirm named tests actually execute; file-level sandbox summaries alone are insufficient evidence. An execution-policy error or incomplete TLC run is blocked, never passed.
4. Reproduce a newly reported counterexample against real code with a deterministic deferred response. If it does not reproduce, repair the model's correspondence; do not weaken the invariant to obtain green output.
5. If an intended behavior changes, update source, model, code regressions, and the negative-control mutation together. The selector intentionally fails closed when the guarded code has changed.
6. Move the synchronization commit forward only after checking the mapping against the committed code and rerunning verification. Update the source hash and evidence together.

## Interpretation

A pass verifies each invariant within its separate finite abstraction. It does not compose the models into a whole-program proof or prove price forecasts, unrestricted request counts, clock timing, rate limiting, page coverage, browser rendering, memory use, or eventual completion. Report the current code result separately from the deliberate ownership mutation and the reproduced pre-fix refresh defect. For later unrelated edits, use pstack `maintain-formal-verification-skill` to check whether this skill has drifted.
