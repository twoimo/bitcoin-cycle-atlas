# Market requests and manual history retry: bounded formal verification

Audit base: [`d906df3b42a555c57552f005d25a9fef4cfd4c5e`](https://github.com/twoimo/bitcoin-cycle-atlas/tree/d906df3b42a555c57552f005d25a9fef4cfd4c5e).

The controller at this base is byte-identical to the preceding correspondence review at [`780a33ccdaf5d5eb502249ab47ecf9d660858724`](https://github.com/twoimo/bitcoin-cycle-atlas/tree/780a33ccdaf5d5eb502249ab47ecf9d660858724). Its original ownership model and all 30 existing implementation regressions were rerun before changes. The delivered controller adds a six-line explicit-refresh cooldown reset; its reviewed SHA-256 is `f9c56339c1a5a55908e9680bb28290b46983b005d5770272dd13f048603182fa`. The updated gate runs 31 implementation regressions and two real-code mutations. The synchronized source commit is [`c302fb4f0249d6920536d2da70f58e5426e9f472`](https://github.com/twoimo/bitcoin-cycle-atlas/commit/c302fb4f0249d6920536d2da70f58e5426e9f472). These checks do not cover workspace saving, command search, indicator templates, CSV export, chart rendering, or first-screen initialization.

**The current ownership guard passed this audit.** No existing asynchronous overwrite defect was reproduced. The red/green comparison is a deliberate negative control: remove one guard, observe failure, then compare against the existing correct code. It is not evidence that this audit repaired a production race.

**A separate manual-refresh defect was reproduced and fixed.** After an older-candle request failed, a manual refresh that also failed retained the old 30-second history cooldown while dropping the visible history error. The caller's immediate attempt to refill the viewport did nothing. An explicit refresh now releases that old cooldown even when it keeps the retained candles. Ordinary gestures retain the failure backoff, and the shared request throttle remains in force.

## Property and practical consequence

`NoStaleDisplay`: a request canceled or superseded by another request must never supply a later displayed result. This protects a freshly selected or refreshed chart from an older saved snapshot arriving late. Callback checks in the executable regressions also ensure a revoked request cannot schedule a stale UI update.

The model has two interval caches (`one` = `1m`, `five` = `5m`) and at most three request generations. TLC exhaustively enumerates its allowed interleavings of request start, cancellation/replacement, exchange success/failure, and saved-data success/failure. This is a finite-state verification of request ownership, not a mathematical proof of Bitcoin prices or forecast validity.

## Evidence

| Check | Observed result |
| --- | --- |
| Current TLA+ model | 5,955 generated states; 2,081 distinct states; 0 states left; invariant holds |
| Current complete state graph | 2,081 states; 5,954 transitions |
| Current full chart projection | 6 visible states; 13 transitions |
| Deliberately broken model, first-counterexample run | Invariant fails; 151 generated; 109 distinct; 79 queued when intentionally stopped |
| Actual controller/history/ownership regressions | 30 tests passed, 0 failed |
| Actual-code mutation | Removing the saved-fallback guard causes the expected stale-update assertion to fail |
| Manual-refresh model | 37 generated states; 15 distinct states; 0 states left; `TypeOK` and `RefreshCanRetry` hold |
| Manual-refresh baseline model | `RefreshCanRetry` fails; 26 generated; 13 distinct; 2 queued when intentionally stopped |
| Updated controller/history/ownership regressions | 31 tests passed, 0 failed |
| Actual refresh-code mutation | Removing the cooldown reset causes the exact new retry assertion to fail |

These results come from the checked-in summaries and the runner, not estimates. The broken run stops at its first counterexample; its partial state count is not an exhaustive proof. pstack separately explores its complete graph to draw and classify counterexample paths.

The 30-test row is the unmodified audit baseline. The 31-test row describes the delivered source. Neither counts browser/device tests.

## Model-to-code correspondence

| Model component | Actual code or meaning |
| --- | --- |
| `active` | Controller's currently owning request object, abstracted as a unique generation number |
| `interval`, `selected` | Request interval and selected interval; only two representatives are modeled |
| `phase` | Suspended live-fetch or saved-fallback continuation, including already canceled work that may complete late |
| `cancelled` | Verification monitor recording requests whose ownership was revoked; not a new product data structure |
| `displayed` | Generation of the last publication for each interval, not the age of the underlying price quote |
| `status`, `storedStatus` | Visible loading/ready/snapshot/error state and status restored from retained data on cancellation |
| `Load` | Forced `load` or interval switch: synchronous cancellation and installation of the new owner |
| `Cancel` | `cancel`: revoke owner, abort its signal, restore prior displayed status |
| `LiveSuccess`, `LiveFailure` | Synchronous continuations after `fetchMarketCandles`; ownership checked before publish or fallback |
| `SavedSuccess`, `SavedFailure` | Synchronous continuations after `snapshot`; the post-await ownership guard controls publication |

The model treats each uninterrupted continuation as one step. In this app, `onChange` schedules rendering rather than synchronously starting another controller action. The model permits independent saved-response completions, which overapproximates the shared snapshot promise: extra delivery orders are admitted, not omitted. Cache contents, HTTP parsing, numerical values, snapshot validity, and the exact source of a fallback are abstracted into success/failure. Prefer-snapshot initial loads, history pagination, throttling, wall-clock timeouts, and unbounded liveness are not included in this model; existing executable tests cover selected examples of those behaviors.

## Counterexample replay

The negative control removes only the guard immediately after the saved snapshot is awaited in `load`'s error branch:

1. Open the candle chart; its exchange request fails, so saved candles are requested.
2. Cancel the request, change interval, or force a newer refresh while saved data remains pending.
3. Let the older saved response arrive.
4. With the guard removed, the old response can publish a snapshot or notify the UI. With the existing guard, it is ignored, whether the newer request is still loading or already finished.

`tests/market-request-ownership.test.mjs` exercises both intervals, both old/new completion orders, and old saved-response success/failure: eight deterministic combinations. `scripts/verify-market-state.mjs` copies actual source to a temporary directory, removes that exact guard, verifies the expected assertion failure, and deletes the copy. It fails if the source mutation selector no longer matches, so code drift cannot silently invalidate the negative control.

## Manual refresh and history retry

`RefreshCanRetry`: once a manual refresh finishes, the old failed history attempt cannot prevent another request for the still-unloaded visible window. A subsequent failed request may establish a new cooldown. This property is independent of `NoStaleDisplay`; the two abstractions are checked separately, not claimed as one composed whole-program proof.

For product review, start with the [Korean before/after diagram](history-retry/comparison.png) and its [Mermaid source](history-retry/comparison.mmd). **Red means the reproduced pre-fix outcome; green means the corrected outcome.** It shows failure, the retry wait, explicit refresh, another recent-candle failure, retained candles, and the resulting older-candle retry. A failed new retry sets a new wait. This is an explanatory projection of the verified counterexample and actual controller replay, not an additional model or a separate proof.

`HistoryRetry.tla` starts with existing validated candles for one selected interval. It abstracts `active` to no request, a history stream, or a refresh; `status` and `historyStatus` follow the published entry. `retryBlocked` represents `history.retryAt > Date.now()`, and `refreshDone` is a verification monitor. The model checks the complete finite abstraction, allowing success, failure, refresh replacement, and cooldown expiry. It does not model candle values, actual durations, clock rewinds, retries across several intervals, page coverage, multiple page completions, or revoked response generations. The separate ownership model covers a bounded set of revoked-response interleavings.

| Action | Code correspondence |
| --- | --- |
| `RequestHistory` | `ensureRange`: active-stream and cooldown checks, then loading publication |
| `HistorySuccess`, `HistoryFailure` | Final history continuation and `retryAt` success/failure updates |
| `StartRefresh` | `load(..., { force: true })`: cancel current work, reset old cooldown, publish loading |
| `RefreshSuccess` | Replace history with `createHistoryState`, whose `retryAt` starts at zero |
| `RefreshFailure` | Keep `prior.series` and the existing history object after recent-candle failure |
| `CooldownElapsed` | Environment abstraction for the comparison against `Date.now()`; no timing proof |

Every model guard carries a path/line correspondence comment. `HistoryRetryBroken.tla` models the audited pre-fix source, unlike the intentionally broken ownership model. Its actual-code replay is `explicit refresh releases history backoff when recent candles fall back to retained data` in `tests/intraday-history.test.mjs`:

1. Pan to an unloaded period; the history request fails with HTTP 503.
2. Tap refresh before the old delay expires; the recent-candle request also fails with HTTP 503.
3. Keep the saved candles, then request the same viewport as `refresh-market` does.
4. Before the fix, the request count stays at two. After the fix, the third request loads the older candles. An ordinary gesture before refresh still makes no extra request.

This replay was observed failing on the audited source and passing after the reset. The verification runner independently removes only `if (history) history.retryAt = 0;` in a temporary copy and requires the same assertion to fail. The statechart's numbered path separates the pan from its failed reply, giving four visible steps. See [the counterexample PNG](history-retry/bug-1.png), [Mermaid source](history-retry/bug-1.mmd), [overview](history-retry/chart.png), and [numbered story](history-retry/stories.md). Its complete baseline graph has 18 states and 40 transitions; its overview has 7 states and 7 transitions, as recorded in `history-retry/summary.json`.

The raw pstack comparison uses a different color convention from the reader diagram: **green marks a pre-fix failure prevented by the fix**, not a bad state reachable after the fix. The generated legend now states this explicitly, and its blocked state is named `History blocked after refresh (before fix only)`. `Saved candles; history can retry` stays gray because that valid state also existed before the fix when no prior history failure had established a cooldown. The generated story is consistent: the broken path reaches the blocked state at step 4, while the corrected path reaches `Saved candles; history can retry`. Neither the model nor the color classifier has been reversed.

## Run and reproduce

```sh
node scripts/verify-market-state.mjs
```

Requires Node 24+ and Java 11+. The script downloads and verifies official [TLC 1.7.4](https://github.com/tlaplus/tlaplus/releases/tag/v1.7.4), or accepts `TLA2TOOLS` pointing to the same jar. Its SHA-256 is `936a262061c914694dfd669a543be24573c45d5aa0ff20a8b96b23d01e050e88`. Each TLC run has a separate JVM temporary directory so simultaneous verification jobs cannot overwrite extracted standard modules. The heap is capped at 512 MiB for these small finite models. The controller identity and both mutation identities are recorded in `verification-summary.json`.

## Statecharts

- [User-facing history retry comparison](history-retry/comparison.png) and [Mermaid source](history-retry/comparison.mmd) use red for the old failure and green for the corrected outcome. The generated pstack figures below retain pstack's distinct eliminated-defect convention.
- [Current complete projection](current/full-chart.png) and [Mermaid source](current/full-chart.mmd) show all edges between the six visible states. Distinct hidden request/cache states can share a screen label; an arbitrary path through this projection is not itself proof that the hidden model can take that path.
- [Current pstack overview](current/chart.png) and [Mermaid source](current/chart.mmd) keep selected shortest paths. The overview is intentionally not the complete transition relation.
- [Negative-control counterexample](mutation/bug-1.png), [Mermaid source](mutation/bug-1.mmd), and [numbered story](mutation/stories.md) demonstrate the removed guard. Green denotes the existing guard preventing the mutant's bad state.
- Exact chart counts are in `current/summary.json`, `current/full-summary.json`, and `mutation/summary.json`. `verification-summary.json` records the one-command verification output.

Charts were regenerated with Cursor pstack 0.15.30's [`statechart`](https://github.com/cursor/plugins/tree/8b3326d99fd4b993cb33a24dad8af03175c642c5/pstack/skills/statechart), pinned at `8b3326d99fd4b993cb33a24dad8af03175c642c5`, plus Mermaid CLI 12.0.0. All six generated PNGs and the separate reader comparison were visually inspected. From a scratch copy of `verification/market-state/` outside the repository, with `PSTACK` set to that checkout and `TLA2TOOLS` to the verified jar:

```sh
node "$PSTACK/pstack/skills/statechart/scripts/statechart.mjs" from-spec MarketRequests.tla --title 'Candle request state transitions' --out current
node "$PSTACK/pstack/skills/statechart/scripts/statechart.mjs" from-spec MarketRequestsBroken.tla --fixed MarketRequests.tla --label 'the existing guard' --expect-broken NoStaleDisplay --title 'Negative control: guard removed' --out mutation
node "$PSTACK/pstack/skills/statechart/scripts/statechart.mjs" from-spec HistoryRetryBroken.tla --fixed HistoryRetry.tla --label 'refresh retry fix' --expect-broken RefreshCanRetry --title 'History retry: baseline failure prevented by the fix' --out history-retry
node "$PSTACK/pstack/skills/statechart/scripts/tlc-to-chart.mjs" --dot current/tlc/MarketRequests.dot --map MarketRequests.map.mjs --spec MarketRequests.tla --highlight 0 --full-labels --title 'Candle request transitions: all projected edges' --out current/full-chart.mmd --summary current/full-summary.json
for diagram in current/chart current/full-chart mutation/chart mutation/bug-1 history-retry/chart history-retry/bug-1; do
  npx --yes @mermaid-js/mermaid-cli@12.0.0 -p puppeteer.json -i "$diagram.mmd" -o "$diagram.png" -s 2
done
```

Use a supported local Chromium configuration for PNG rendering. Tool or browser-launch failures are not verification passes; the TLC and image steps have separate failure signals. Keep the source, model, regression replay, and project-local `verify-market-state` skill synchronized after changes.

The explanatory `comparison.mmd` is maintained separately from pstack output. Render it with the same Mermaid CLI command and a Korean-capable font such as Noto Sans KR. It was rendered using the official Google Fonts Noto Sans KR font and a scratch-only fontconfig configuration; no font or browser binaries are included in the product. The raw chart counts in `summary.json` do not describe this explanatory projection.
