---
name: verify-market-state
description: Verify candle request ownership, cancellation, forced refresh, saved-data fallback, and history retry in Bitcoin Cycle Atlas. Use when changing market-data-controller.js, its async guards, cooldown handling, callback ordering, or the model and regression checks that protect chart loading.
---

# Verify market request state

Keep this promise: **a canceled or superseded request never replaces or notifies the displayed chart.** A broken guard can overwrite a fresh price view with a late saved response.

Also keep **a completed manual refresh releases the previous failed-history cooldown**, including when recent candles fall back to retained data. Ordinary gestures still respect a newly failed request's backoff.

## Coverage and synchronization

- Covered implementation: `dist/market-data-controller.js`, `createMarketDataController`, specifically `load`, `cancel`, the ownership checks before publishing results, and `ensureRange`'s history retry status and cooldown.
- Last committed synchronization: `7261c1807028e1b69bf9cd9be0d269a64f88acc0` (2026-10-26). Previous synchronization: `c8f9d985a7a99cdee13a5c74eeda37168f1c7ea8`. Only module query versions changed in the covered controller; the ownership and explicit-refresh continuations remain unchanged. Both models, 32 original/restored cases and both real-source mutations were rerun with strict normal-exit validation. Reviewed runtime SHA-256: `978ad14a70fdb3011f0761ceb7c6f6ebc0d37bc0b25aa047ad2ef2014eff07d6`. Current receipt: `docs/evolution-2026-10-26/market-state-final.json`.
- Model: `verification/market-state/MarketRequests.tla`; configuration bounds requests to three generations and two intervals. `MarketRequestsBroken.tla` is a deliberate negative control, not an observed production bug.
- Retry model: `verification/market-state/HistoryRetry.tla`; one interval with retained candles, a missing viewport, current request kind, published statuses, a boolean cooldown and a completion monitor. `HistoryRetryBroken.tla` describes the reproduced pre-fix behavior at the audit base. The two models are separate abstractions, not a composed proof.
- Actual-code checks: `tests/market-data-controller.test.mjs`, `tests/intraday-history.test.mjs`, and `tests/market-request-ownership.test.mjs`.
- Read `docs/formal-state/README.md` for the model-to-code mapping, assumptions, evidence, and chart commands. The intraday tests cover examples; pagination itself is outside the TLA+ proof.

## Run

From the repository root, with Node 24+ and Java 11+:

```sh
node scripts/verify-market-state.mjs
```

The runner downloads TLC 1.7.4 from its official release into ignored `build/formal-tools/` and checks its SHA-256. For an offline run, set `TLA2TOOLS` to the same verified jar. Do not silently accept another tool version or a download/hash error.

Expect both current models to pass, `MarketRequestsBroken` to violate `NoStaleDisplay`, and `HistoryRetryBroken` to violate `RefreshCanRetry`. All 32 named real-code cases must pass, including BTC and ETH manual retries. Removing the saved-fallback guard must fail the stale-update assertion; separately removing the refresh cooldown reset must fail the retry assertion. The restored temporary copy must pass all 32 cases again. The runner requires complete TAP counts and zero skipped, cancelled or todo cases; a process/tool error is not an expected mutation failure. It deletes its temporary copy and never mutates product files.

Pass an optional output filename to write the JSON receipt. Read each model result with pstack `/statechart`, following that skill's current instructions and help. The 2026-10-26 Korean diagrams and raw receipts are under `docs/formal-state/review-2026-10-26`. Regenerate charts after model, mapping or configuration changes, inspect each PNG, and replay every new counterexample through real controller entry points.

## Review a change

1. Compare covered source with the synchronization commit. Trace each `await`, request replacement, cancellation, and publication against its action in the model.
2. Treat each modeled action as a synchronous continuation. Split an action if new code adds an `await` inside it. Preserve canceled requests as possible late completions; abort is not proof that a response cannot arrive.
3. Run the command and inspect its real exit status. Confirm named tests actually execute; file-level sandbox summaries alone are insufficient evidence. An execution-policy error or incomplete TLC run is blocked, never passed.
4. Reproduce a newly reported counterexample against real code with a deterministic deferred response. If it does not reproduce, repair the model's correspondence; do not weaken the invariant to obtain green output.
5. If an intended behavior changes, update source, model, code regressions, and the negative-control mutation together. The selector intentionally fails closed when the guarded code has changed.
6. Move the synchronization commit forward only after checking the mapping against the committed code and rerunning verification. Update the source hash and evidence together.

## Interpretation

A pass verifies each invariant within its stated finite abstraction. It does not prove price forecasts, unrestricted request counts, clock timing, rate limiting, page contents, cross-controller composition, browser rendering, memory use, or eventual completion. Report the deliberate ownership mutation separately from the reproduced refresh defect. For later unrelated edits, use pstack `maintain-formal-verification-skill` to check whether this skill has drifted.

## Recover the original local synchronization revision

Native Git push was unavailable in the implementation environment. The GitHub API publication preserves the file tree but creates a different commit object. Read `docs/evolution-2026-10-26/SOURCE_PROVENANCE.md` and verify/fetch its original Git bundle into the separate verification ref before diffing an unavailable synchronization commit. Never substitute the public commit ID for the original recorded identity or rewrite an immutable forecast.
