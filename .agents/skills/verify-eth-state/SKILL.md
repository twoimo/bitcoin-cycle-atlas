---
name: verify-eth-state
description: Verify Ethereum chart readiness, page suspension and restoration, request ownership, and refresh navigation after changes to eth-view.js or its boot integration. Run the bounded TLA+ checks and complete production-initializer regressions, and prove they catch deliberate real-code mutations.
---

# Verify ETH state

## Promise and scope

An ETH document announces readiness only after it renders observed prices or an
actionable retry error. A suspended or superseded request cannot publish into the
current chart, and refresh cannot reset navigation chosen while it was pending.
Readiness is emitted once for each document.

Covered runtime: dist/eth-view.js — initEthView, load, render (including its
replay and center-tool early return, the interval viewport retarget and the
one-shot URL range), revealReady, schedule, changeInterval, date/price
navigation callbacks, the workbench onChange/onRestore/range actions, pagehide,
and pageshow; undo/redo and go-to in dist/native-chart-workbench.js; the plot
flags written by dist/chart-replay.js and dist/center-workbench.js. The replay also executes the real inline boot script in dist/index.html,
archive parsers, and intraday controller at its actual import boundary.
Review the history-jump availability checks in dist/ethereum-history.js and the
post-await focusHistoricalEvent writer whenever either changes: daily coverage
and cached daily loading establish the current abstraction's focus boundary.

Baseline commit: 64c8207cb044d8990289c5a7d39972e21b74c240.
Last code/model synchronization commit: fe93a5727277d15a934b7472588fb907e30b02b8
(2026-11-16, tree dfae0bceba83415838a1e6d4802c7754dcf608d3).
Previous synchronization: 7261c1807028e1b69bf9cd9be0d269a64f88acc0.
Reviewed SHA-256:
d2839d8522632644a3cd9c7e45a39c11cfe96ca30102ab9ecc8ba001f60e3a42.
That review added obscured and urlRange, SkipRender, Obscure/Reveal and Restore,
and stopped BeginLoad resetting the range on an interval change, as
tests/native-chart-viewport.test.mjs requires. Properties and bounds are
unchanged. Model comments cite current line numbers; docs/formal-eth and
docs/evolution-2026-10-26/eth-state-final.json still describe 7261c180.
The new ETH future-price engine, scenario calculations and future visibility are
outside this finite lifecycle model; their dedicated tests are separate evidence.
See docs/formal-eth/README.md for the committed review revision, every action and
guard's code mapping, actual bug replays, bounds, and result receipts.

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
download, hash check, 60 s process runner and TAP counts.

An optional output argument writes a machine-readable receipt:

    node scripts/verify-eth-state.mjs /tmp/eth-state-receipt.json

The command must report all of the following:

1. Current model passes every invariant within three request generations,
   daily/weekly display, and automatic/custom range choices.
2. The original baseline still fails its three recorded safety properties.
   Deliberately removed response, error, suspension and navigation guards fail
   the corresponding invariant. Do not weaken a property to make a failure pass.
3. All 17 complete-initializer replay cases pass, including intraday refresh
   integration and the information dialog's escaped data link.
4. All nine mutations of a temporary copy of the real production module fail
   their intended assertions. The restored temporary module passes all 17 cases.
   The working runtime is never mutated by the checker.

Read both the exit status and actual test counts. A runner reporting only test
filenames, a Java/tool failure, a missing mutation selector, or a skipped replay
is not a verification pass. The verifier requires an actual 17-case TAP plan,
17 passes, zero failures, skips, cancellations and todos for original/restored
runs. Every mutation must execute all 17 cases with at least one intended failure
and no skipped or cancelled cases.

## Read the statecharts

Read every TLA+ result with the pstack /statechart skill. Use its current
instructions and help rather than copying external script paths or options
into this skill. Keep the original properties, compare the preserved baseline
configuration with the fixed model, render every chart, inspect every PNG, and
replay each counterexample through the real initializer.

The checked-in Mermaid/PNG charts, shortest bug stories and summary.json in
docs/formal-eth/statechart are a receipt for the reviewed model. They are not
independent proof of the current JavaScript. Regenerate them after any action,
guard, configuration or mapping changes.

## Maintain correspondence

Before trusting a previous pass, diff the covered runtime and boot script from
the reviewed revision. Revisit every await and every writer of prices, errors,
readiness, range, request generation and suspension. Confirm that each TLA+
action remains one JavaScript continuation and each model guard maps to a real
check or an explicitly documented bound/environment assumption.

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

The replay fixture stubs chart replay and the workbench, so their paths are
checked by the model only. The model's navigated flag is the code's
navigationRevision mismatch, so a new navigation path that forgets
++navigationRevision is caught by neither layer. ReadinessOnce counts this
view's revealReady; dist/center-workbench.js:250 also dispatches atlas:ready, and
every listener ignores repeats. The boot script's 20 s fail('timeout') is a
wall-clock path outside the model.

## Recover the original local synchronization revision

Native Git push was unavailable in the implementation environment. The GitHub API publication preserves the file tree but creates a different commit object. Read `docs/evolution-2026-10-26/SOURCE_PROVENANCE.md` and verify/fetch its original Git bundle into the separate verification ref before diffing an unavailable synchronization commit. Never substitute the public commit ID for the original recorded identity or rewrite an immutable forecast.
