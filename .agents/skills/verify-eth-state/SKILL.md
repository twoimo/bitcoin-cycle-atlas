---
name: verify-eth-state
description: Verify Ethereum chart readiness and paint confirmation, page suspension and restoration, request and chart-mount ownership, and refresh navigation after changes to eth-view.js, its chart mount contract or its boot integration. Run the bounded TLA+ checks and complete production-initializer regressions, and prove they catch deliberate real-code mutations.
---

# Verify ETH state

## Promise and scope

An ETH document announces readiness only after its chart confirms painted
observed prices or it records an actionable retry error. A suspended or
superseded request cannot publish into the current chart. Neither can a paint
result or a chart window report that arrives while the page is suspended, nor a
paint result from a destroyed chart. Refresh cannot reset navigation chosen
while it was pending. Readiness is emitted once for each document.

Covered runtime in dist/eth-view.js: initEthView, load, render (its replay and
center-tool early return, the interval viewport retarget, the one-shot URL
range, and the chart mount it creates or hands a new series), watchFunnestPaint,
revealReady, schedule, changeInterval, the mount's onViewport callback, the date
and price navigation callbacks, the workbench onChange, onRestore and range
actions, the refresh retry that destroys a failed chart, pagehide, and pageshow.
Also covered: undo, redo and go-to in dist/native-chart-workbench.js, the plot
flags written by dist/chart-replay.js and dist/center-workbench.js, the range
gate in dist/chart-navigation.js, and the mount contract in
dist/funnest-observed-price-adapter.js and src/charts/funnest-chart-runtime.js
(ready, setData, the visible-range report and destroy). The replay also executes
the real inline boot script in dist/index.html, archive parsers, and intraday
controller at its actual import boundary.
Review the history-jump availability checks in dist/ethereum-history.js and the
post-await focusHistoricalEvent writer whenever either changes: daily coverage
and cached daily loading establish the current abstraction's focus boundary.

Baseline commit: 64c8207cb044d8990289c5a7d39972e21b74c240.
Last code/model synchronization commit: 1722f1fc (2026-11-16). It adds two fixes to
the review at 856e77422e0a43a77470aed2e3f64fa1e522880b (tree
01720549f0a5f4e7fb05129b1c97f80389d993b6). d4f667d2 changed one statement on
dist/eth-view.js:310. 1722f1fc added line 424, so later lines are one higher. The
runtime change in c35f75cf added one line before ready(), so runtime citations from
line 466 on are one higher than at 856e7742.
Previous synchronization: fe93a5727277d15a934b7472588fb907e30b02b8. That commit is
not an ancestor of this history. Its covered files equal those of c92c4871, so
the review read c92c4871..856e7742.
Reviewed SHA-256:

- dist/eth-view.js 67ec77dbed416369cc7f0bcc5898b18a1d60aac1bac8e220e84c07950670bcdf
- dist/index.html 5e0f6b3b72a2c5b7862b1560d90aa74af9ed7cfa8a5f80b5a28cd85455f47dcd
- dist/native-chart-workbench.js 2e3c57fb39748c8ae30e42786d522789f2383c4b9623c5d55f1d70d2a4c5d246
- dist/chart-replay.js de6f2f47d576af65cb6e7dab2c67b2de5b5d694740eb1c626b3f37f18248508d
- dist/center-workbench.js 2decc81ec9db604edb6dd95b6beb92a9582b25e76f60f8c65b2506a6ffaa8f6c
- dist/chart-navigation.js f6a987a9fc14e72f8de01fe0e21d0d142b872939188f8328cf153b7b8f7a03c0
- dist/funnest-observed-price-adapter.js 6b4d25b84f99728987bde5d989cad191bd8059cf9e62b328da53cdef185fa683
- src/charts/funnest-chart-runtime.js cad0f5e2c38a9c2c82dc248eade24b0aea92d3acff61d125f8ac72972471882d
- dist/ethereum-history.js 196e860ce7f4485071ca54685e8b5bf48e62ed9c9d00dc1012f8183de44053a6

931ed189 moved ETH drawing to the Funnest observed-price adapter. This
synchronization added the chart mount, its paint watch, the two chart window
reports and the refresh retry to EthLoad.tla. It also added four constants that
each remove one new guard, and a seventh invariant,
NativeNavigationSurvivesRefresh. d4f667d2 made onViewport increment
navigationRevision, and a fifth constant, TrackNativeNavigation, removes that
increment. 1722f1fc makes the persisted pageshow handler start the paint watch
again for a mount that is not confirmed, and Show in EthLoad.tla rereads a
confirmation dropped while suspended. The readiness promise changed on purpose. It
read "only after it renders observed prices or an actionable retry error".
render now announces only when state.funnestReady holds a painted confirmation
(dist/eth-view.js:253, 337), and
tests/funnest-observed-price-adapter.test.mjs:436-437 pins the source text of
that paint watch. The bounds are unchanged. Model comments cite current line
numbers. docs/formal-eth/verification.json is the receipt of the run at
1722f1fc. The charts in docs/formal-eth/statechart and
docs/evolution-2026-10-26/eth-state-final.json still describe 7261c180.
The new ETH future-price engine, scenario calculations and future visibility are
outside this finite lifecycle model; their dedicated tests are separate evidence.
See docs/formal-eth/README.md for the chart mount's code mapping, the fixed
finding's replay, and the earlier review revisions, bug replays and receipts.

## Finding at 856e7742, fixed in d4f667d2

The command exited 1 on 856e7742 with two failures. Both showed one product defect.

- `current/NativeNavigationSurvivesRefresh` was violated.
- The replay case "ETH refresh preserves a date window chosen on the chart while
  its request was pending" failed.

A zoom or pan on the mounted chart reaches the view only through onViewport
(dist/eth-view.js:310). That callback wrote state.range and did not increment
navigationRevision. onRangeChange (line 109) does increment it, but getRange
(line 108) returns null once a mount exists, so bindChartNavigation never
delivers it. A live response then finds navigationToken===navigationRevision and
clears the range (lines 361 and 368), and the next render pushes the default
window with setAtlasRange (line 316). 931ed189 introduced the path.

d4f667d2 makes onViewport increment navigationRevision when the chart window
changes. NativePan in EthLoad.tla now marks every pending request navigated when
TrackNativeNavigation holds. Two controls remove that increment and must fail:
verification/eth-state/lost-native-navigation.cfg must break
NativeNavigationSurvivesRefresh, and the untracked-native-navigation mutation
must fail the replay case above.

## Run the check

From the repository root:

    node scripts/verify-eth-state.mjs

Requires Node.js and Java 11 or later. The checker pins the official TLC release
1.7.4 jar to SHA-256
936a262061c914694dfd669a543be24573c45d5aa0ff20a8b96b23d01e050e88.
It uses build/formal-tools/tla2tools-1.7.4.jar and downloads that pinned release
only if missing. For an offline installation, set TLA2TOOLS to that exact jar;
JAVA may select a Java binary. A supplied jar with a different hash fails.
TLC 1.7.4 exits 255 with an ArithmeticException after a complete search under
Java 25, so use Java 11 to 21. scripts/verification-process.mjs holds the
download, the hash check and the process-exit rule. This runner gives each
process 180 s. Its largest search is the baseline, at about 5.4 million
generated states.

An optional output argument writes a machine-readable receipt:

    node scripts/verify-eth-state.mjs /tmp/eth-state-receipt.json

A pass exits 0 and reports all of the following:

1. The current model passes all seven invariants within three request
   generations, daily/weekly display, and automatic/custom range choices.
2. The original baseline still fails its three recorded safety properties and
   passes the other three. Each configuration that removes one guard fails its
   named invariant: the response, error, suspension and navigation guards, then
   the paint wait, the paint suspension guard, the paint mount guard, the
   viewport suspension guard and the native navigation revision. Do not weaken a property to make a failure pass.
3. All 25 complete-initializer replay cases pass, including intraday refresh
   integration, the information dialog's escaped data link and the chart mount
   cases.
4. All 16 mutations of a temporary copy of the real production module fail
   their intended assertions. The restored temporary module behaves like the
   working runtime. The working runtime is never mutated by the checker.

The runner finishes every check before it exits. It prints `verdict` and
`failures` in the receipt and exits 1 when any expectation fails. When the
current model breaks an invariant, the runner searches again without that
invariant, so every other invariant still gets a complete search.

Read both the exit status and actual test counts. A runner reporting only test
filenames, a Java/tool failure, a missing mutation selector, or a skipped replay
is not a verification pass. The verifier requires an actual 25-case TAP plan
with zero skips, cancellations and todos for every run, and 25 passes for the
original and restored runs. A mutation counts only when a case that the
unmutated module passes fails with the intended assertion.

## Read the statecharts

Read every TLA+ result with the pstack /statechart skill. Use its current
instructions and help rather than copying external script paths or options
into this skill. Keep the original properties, compare the preserved baseline
configuration with the fixed model, render every chart, inspect every PNG, and
replay each counterexample through the real initializer.

The current tool reads only `state` and `step` from a view and rejects the other
exports of EthLoad.map.mjs. Give it a scratch view that re-exports those two.

The checked-in Mermaid/PNG charts, shortest bug stories and summary.json in
docs/formal-eth/statechart are a receipt for the reviewed model. They are not
independent proof of the current JavaScript. Regenerate them after any action,
guard, configuration or mapping changes.

## Maintain correspondence

Before trusting a previous pass, diff the covered runtime and boot script from
the reviewed revision. Revisit every await, promise continuation and mount
callback, and every writer of prices, errors, readiness, range, request
generation, the chart mount and suspension. Confirm that each TLA+ action
remains one JavaScript continuation and each model guard maps to a real check or
an explicitly documented bound/environment assumption.

Update these together when behavior changes:

- verification/eth-state/EthLoad.tla and reviewed configurations.
- verification/eth-state/EthLoad.map.mjs and docs/formal-eth/README.md mappings.
- tests/eth-load-ownership.test.mjs and tests/helpers/eth-view-fixture.mjs.
- scripts/verify-eth-state.mjs mutation selectors and expected results.
- Model, replay and statechart receipts, reviewed commit and source hash.

The replay runs the whole initializer; do not replace it with extracted private
load/render functions or a second implementation of ownership logic. If a model
counterexample does not replay, inspect the model's atomicity, environment
assumptions and fixture boundaries before changing runtime behavior.

After a real covered-code change, follow /maintain-formal-verification-skill.
Review this skill from a fresh context and rerun its command before recording a
new sync point.

## Limits

This is bounded safety verification, not an unbounded or whole-program proof.
The model abstracts daily/weekly archive and refresh state; intraday internals
remain under verify-market-state and real ETH integration replays. It assumes
valid parsed prices, allows aborted HTTP to complete late, and deliberately
allows old callbacks to run while suspended. This last over-approximation tests
defensive guards; it does not claim a browser normally renders a frozen BFCache
document. The replay injects DOM, rendering, HTTP, timers, animation frames and
import boundaries. Neither layer proves browser pixels/timing, economic
correctness, historical-event causation, scheduler fairness, eventual completion,
or behavior after arbitrarily many generations.

The replay injects the chart mount. It settles paint confirmations, reports
chart windows and observes teardown at the adapter boundary. The Funnest
engine's own range policy is outside both layers. Measured with the real adapter
under linkedom, the engine restores the earlier window one frame after setData,
and the next layout change returns to the range that setAtlasRange set.

The model's navigated flag is the code's navigationRevision mismatch. The native
flag covers a window chosen on the mounted chart, the path that skipped it until
d4f667d2.
Another navigation path that forgets ++navigationRevision needs its own flag.
Replay cases that call f.pan or f.priceRange invoke the Atlas navigation
callbacks directly, which bindChartNavigation cannot deliver once a chart is
mounted. They still pin the token logic that go-to, span and interval share.
The replay covers the daily refresh for a chart-chosen window. The intraday
branch (line 361) clears the range under the same token.

onError (line 310) writes the chart error and readiness with no suspension
check, and the model has no step for it. The pinned engine emits its error event
only from a datafeed or a trading adapter
(dist/funnest-chart-runtime.bundle.js:1965, 1980, 3093, 3470, 3491, 4191), and
the runtime configures neither (src/charts/funnest-chart-runtime.js:241-243).
Model that callback if either changes. onCrosshair (line 310) writes the readout
and the selected time, which the model does not count as a publication.

The then handler of the paint watch has no mutation. The pinned runtime resolves
only painted results for a mounted series, and render repeats the suspension
check, so removing that guard changes no replayed outcome.

A paint confirmation that arrives while the page is suspended is dropped
(line 253), and nothing asks again after pageshow. A document that had not yet
announced readiness then stays unready until the boot script's timeout. This is
a liveness gap, outside these safety properties.

The replay fixture stubs chart replay and the workbench, so their paths are
checked by the model only. ReadinessOnce counts this view's revealReady;
dist/center-workbench.js:252 also dispatches atlas:ready, and every listener
ignores repeats. The boot script's 20 s fail('timeout') is a wall-clock path
outside the model.

## Recover the original local synchronization revision

Native Git push was unavailable in the implementation environment. The GitHub API publication preserves the file tree but creates a different commit object. Read `docs/evolution-2026-10-26/SOURCE_PROVENANCE.md` and verify/fetch its original Git bundle into the separate verification ref before diffing an unavailable synchronization commit. Never substitute the public commit ID for the original recorded identity or rewrite an immutable forecast.
