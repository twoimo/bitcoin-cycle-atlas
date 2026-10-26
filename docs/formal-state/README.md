# Market request ownership and manual history retry

## Current audit: 2026-10-26

Audit base: [`1b7c87ce4fe5d44d05560320bb3a270c639e3bbf`](https://github.com/twoimo/bitcoin-cycle-atlas/tree/1b7c87ce4fe5d44d05560320bb3a270c639e3bbf). Current committed synchronization: [`c8f9d985a7a99cdee13a5c74eeda37168f1c7ea8`](https://github.com/twoimo/bitcoin-cycle-atlas/commit/c8f9d985a7a99cdee13a5c74eeda37168f1c7ea8), incorporating main `65182efcb9a833b2be091c552a0291d47d50b32c`. Previous synchronization: `1ad3be543e870e74f10708c266f19572b217d25f`. The controller at the audit base was byte-identical to that earlier ownership review. The committed runtime extends it with the explicit-refresh retry reset; reviewed source SHA-256: `092b77e78d3f430205c2da45d37395ac3f59606391a48f1c07a4f43ee71cb83a`. The exact published runtime was checked against its model and both product mutations, and its complete verification receipt was regenerated before advancing this synchronization record.

**A manual-refresh defect was reproduced and repaired.** After an older-candle request failed, a manual refresh that also failed preserved its 30-second history cooldown while dropping the visible history error. Refilling the same viewport made no request. The explicit refresh now releases the previous failure cooldown, including when it retains existing candles. Normal gestures still respect failure backoff, and the shared request throttle is unchanged.

The fix and retry abstraction were prepared in PR #12 and were adapted to current main's separate BTC/ETH controller instances. The old branch was not substituted for current source. Both product replays failed on the current baseline and passed on the amended code.

**The existing request ownership guard remains valid.** Its model passed unchanged before editing. Removing its saved-response guard in a temporary product copy produces a stale-publication failure. This is a deliberate negative control, not an observed production race repaired by this audit.

Start with the [Korean before/after explanation](review-2026-10-26/comparison.png), [passing retry overview](review-2026-10-26/fixed.png), and [Korean evidence and limitations](review-2026-10-26/stories-ko.md). Both PNGs have adjacent Mermaid source. Older `current/` and `mutation/` files below this directory remain historical receipts; the newly regenerated figures are under `review-2026-10-26/`.

## Properties and evidence

| Check | Scope and observed result |
| --- | --- |
| `NoStaleDisplay` | At most three generations and two interval caches: 5,955 generated, 2,081 distinct states, zero queued; pass |
| Ownership negative model | Deliberately removed guard: intended invariant failure after 151 generated, 109 distinct states |
| `RefreshCanRetry` and `TypeOK` | One interval with retained candles and a boolean cooldown: 37 generated, 15 distinct states, zero queued; pass |
| Retry baseline model | Reproduced pre-fix behavior: intended invariant failure after 26 generated, 13 distinct states |
| Real controller/history/ownership checks | 32 named tests pass, zero failures, cancellations, skips or todos |
| Real-code negative controls | Removing the saved-response guard fails the stale-update assertion; separately removing the refresh reset fails both BTC/ETH retry cases |
| Restored temporary product | All 32 named tests pass again |
| Final equity lifecycle gate at `c8f9d98` | 46,252 distinct states; 28 original and 28 restored initializer replays; seven actual-source mutations rejected |
| Final ETH lifecycle gate at `c8f9d98` | 2,243 distinct states; 17 original and 17 restored initializer replays; nine actual-source mutations rejected |

Read the exact final-commit [market receipt](review-2026-10-26/market-verification.json), [equity receipt](review-2026-10-26/equity-final.json), and [ETH receipt](review-2026-10-26/eth-final.json). The earlier [equity baseline](review-2026-10-26/equity-baseline.json), [ETH baseline](review-2026-10-26/eth-baseline.json), and [before](review-2026-10-26/history-before.tap)/[after](review-2026-10-26/history-after.tap) retry runs remain intact. First-counterexample counts are partial exploration, not exhaustive counts. Chart counts come from each generated `summary.json`, which can describe a full baseline graph rather than the early-stop check.

The existing ETH/equity source and inline boot handshake were reviewed from `1ad3be5` to the audit base. Surrounding information links, asset-table markup, CSS and import URLs did not add a covered state writer or continuation. Final integration changes import query strings and makes optional font failures nonfatal in the boot script. The exact existing ETH and equity gates were therefore rerun on published commit `c8f9d98`, keeping their model bounds and invariants unchanged. Their final receipts contain the new module hashes; older baseline hashes are preserved separately. The full production initializer and boot script execute in these replays with DOM, rendering, HTTP and scheduling boundaries injected. They do not prove real font loading, browser pixels or device behavior.

## Ownership model correspondence

| Model component | Actual code or meaning |
| --- | --- |
| `active` | Currently owning request object, abstracted to a generation number |
| `interval`, `selected` | Requested and selected intervals; two representative values |
| `phase` | Live-fetch or saved-fallback continuation, including canceled work that may complete late |
| `cancelled` | Verification monitor of revoked requests; not product data |
| `displayed` | Generation of the last published result per interval, not quote age |
| `status`, `storedStatus` | Loading, ready, saved or error state and retained-data restoration |
| `Load` | `load`: synchronously cancel old work and install the new owner |
| `Cancel` | `cancel`: revoke ownership, abort the signal and restore displayed status |
| `LiveSuccess`, `LiveFailure` | Continuations after `fetchMarketCandles`; owner checked before publication or fallback |
| `SavedSuccess`, `SavedFailure` | Continuations after `snapshot`; the post-await owner guard controls publication |

Every uninterrupted continuation is one model step. `onChange` schedules rendering rather than synchronously starting a new controller action. The model permits independent saved-response completions, an over-approximation of the shared snapshot promise. Aborting HTTP is not assumed to prevent a late completion. Product ownership and caches remain private to each controller.

The actual replay opens the controller, makes its exchange request fail, starts a new request while the saved response is pending, and delivers the old saved response last. It covers both intervals, both completion orders, and saved success/failure. `MarketRequestsBroken.tla` changes only the publication guard, and the mutation runner removes the corresponding real line in a temporary copy.

## Manual retry model correspondence

`RefreshCanRetry`: when manual refresh completes, an earlier failed history attempt cannot block another request for the still-unloaded viewport. A subsequent failed request may establish a new delay.

| Action or variable | Actual code or meaning |
| --- | --- |
| `retryBlocked` | Boolean abstraction of `history.retryAt > Date.now()` |
| `refreshDone` | Verification monitor for refresh completion; not product state |
| `RequestHistory` | `ensureRange`: requires no active owner, missing coverage and an expired/cleared cooldown, then publishes history loading |
| `HistorySuccess` | Final history continuation resets the cooldown and publishes success |
| `HistoryFailure` | History catch sets a new retry deadline and publishes the error |
| `StartRefresh` | `load(..., { force: true })`: cancel old work, clear the previous delay, publish loading in one synchronous continuation |
| `RefreshSuccess` | Replace history with `createHistoryState`, whose cooldown starts at zero |
| `RefreshFailure` | Retain `prior.series` and the existing history object without a new snapshot await |
| `CooldownElapsed` | Environment step; no proof about real elapsed time or clock monotonicity |

The model starts with validated retained candles and a missing viewport for one interval. It does not represent revoked generations; the separate ownership model covers a bounded set of those interleavings. The two models are not claimed to compose into a whole-program proof.

The real pre-fix trace is: history HTTP 503, ordinary gesture blocked by backoff, manual refresh HTTP 503, same viewport request. Before the fix the request counter stays at two. After the fix a third request supplies the missing period. Both BTC-USD and ETH-USD use the real parser and public controller API. The defect exists in the original history feature commit `8e0dedac78f1d8d34a82b9310ecbb161bad1f9cc`; it is newly integrated from PR #12 here, not presented as a new discovery.

## Run the verification

From the repository root with Node 24+ and Java 11+:

```sh
node scripts/verify-market-state.mjs
```

An optional output argument writes the JSON receipt. The runner pins official [TLC 1.7.4](https://github.com/tlaplus/tlaplus/releases/tag/v1.7.4) to SHA-256 `936a262061c914694dfd669a543be24573c45d5aa0ff20a8b96b23d01e050e88`. Set `TLA2TOOLS` to that same jar for offline use. Each model gets a private Java temporary directory; the heap is capped at 512 MiB. Download, checksum, Java launch, timeout and incomplete TAP results are failures, not verification passes.

The runner requires named TAP test counts, tests two isolated product mutations, restores the actual source and reruns the full 32-case set. It never changes product files in place. It fails closed if exact mutation selectors no longer match.

## Statecharts and tool compatibility

Fresh figures use upstream pstack commit `99b609a72323b70204eab407c622f436e858e112`, `pele@1.8.0`, `@resvg/resvg-js@2.6.2` and the official Noto Sans KR font. The input/tool manifest is [chart-manifest.json](review-2026-10-26/chart-manifest.json). No external tool or font binary is committed.

The old ownership mapping accessed `phase[active - 1]`. Current pstack documents one-based TLA tuples and explicitly rejected `phase[0]`. The mapping now reads `phase[active]`. This is verification-tool drift, not a runtime state change. Current-model action guards have source anchors; the comparison summaries report no uncited conditions.

- [Current ownership overview](review-2026-10-26/current/chart.png): six states and five displayed transitions; `--cover` omits eight of thirteen projected transitions.
- [Ownership negative-control trace](review-2026-10-26/mutation/bug-1.png): the existing guard prevents the deliberate mutant's late update.
- [Retry baseline comparison](review-2026-10-26/history-retry/chart.png): seven projected states and sixteen transitions from eighteen baseline model states. Green means an old error prevented by the fix.
- [Retry counterexample](review-2026-10-26/history-retry/bug-1.png): four numbered visible steps, with the repaired outcome shown separately.
- [Passing retry overview](review-2026-10-26/fixed.png): six states and five shortest-path transitions from fifteen passing model states. Eight omitted projected edges are listed in `fixed-summary.json`.
- [Reader comparison](review-2026-10-26/comparison.png): separate explanatory diagram; red is the old failure and green is the enabled retry. It is not another model or proof.

Work on a scratch copy of `verification/market-state/` outside the repository. Read the installed pstack `/statechart` skill and its `--help` before regenerating. With `PSTACK_DIR` pointing to the pinned upstream checkout, `TLA2TOOLS` to the verified jar, and a Korean-capable system-ui font configured, the commands used were:

```sh
node "$PSTACK_DIR/pstack/skills/statechart/scripts/statechart.mjs" from-spec MarketRequests.tla --title 'Candle request ownership' --out current --cover --png
node "$PSTACK_DIR/pstack/skills/statechart/scripts/statechart.mjs" from-spec MarketRequestsBroken.tla --fixed MarketRequests.tla --label 'the existing guard' --expect-broken NoStaleDisplay --title 'Negative control: stale response guard' --out mutation --cover --png
node "$PSTACK_DIR/pstack/skills/statechart/scripts/statechart.mjs" from-spec HistoryRetryBroken.tla --fixed HistoryRetry.tla --label '수정 후' --expect-broken RefreshCanRetry --title '수동 새로고침과 과거 봉 재시도' --out history-retry --png
node "$PSTACK_DIR/pstack/skills/statechart/scripts/statechart.mjs" from-spec HistoryRetry.tla --title '수정 후 과거 봉 재시도 상태' --out history-fixed --cover --png
node "$PSTACK_DIR/pstack/skills/statechart/scripts/statechart.mjs" render comparison.mmd --theme classic --out comparison.png
```

All seven PNGs were opened and inspected. Initial Korean font-width overflow was corrected and figures were regenerated before delivery. The chart and code-check steps have separate failure signals; a rendered PNG alone is not evidence that a property passed.

## Limits

These are finite-state safety checks. They do not prove unrestricted request counts, actual clock durations, rate limiting, page contents, parser correctness for every input, cross-product controller composition, memory use, browser pixels or scheduling, eventual completion, economic model correctness or forecasting accuracy. Prefer-snapshot and pagination behavior are covered by selected real-code examples, not the ownership TLA abstraction. Refresh replay evidence does not prove that a remote exchange will recover.

Keep the controller, models, mutation selectors, project-local `verify-market-state` skill and receipts synchronized. Use pstack `/maintain-formal-verification-skill` after a covered change that was not checked at the time.
