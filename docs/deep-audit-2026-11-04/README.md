# 2026-11-04 deep engineering audit

## Scope and source

This audit starts at `94a1b1dda9eb359de70747043808340da369d087` on `main`. It reviews numerical and causal claims, expensive computation, replay state ownership, acquisition and atomic publication, and the tests that gate scheduled data refreshes.

The work follows the upstream `cursor/plugins` pstack `swarm`, `create-formal-verification-skill`, `statechart`, `principle-fix-root-causes`, and `benchmark-checklist` guidance. Three concurrent reviewers cover mathematics/data, performance, and replay/formal verification; the coordinating reviewer covers acquisition/publication and integration. The reviewers use the same available model. This is parallel coverage, not independent multi-model certification.

The original/current forecast identity, retrospective cutoff meaning, and the distinction between reconstructed and contemporaneously issued forecasts are constraints. This audit does not establish predictive accuracy or authorize promotion of a held experimental model. The IPO surface and its data are outside the edit scope.

## Confirmed defects and repairs

### Cancellation could publish a supposedly cancelled collection

`runUsCollection` checked its abort signal before reading the accepted snapshot, but database work could then suspend execution. Cancellation while reading the snapshot, waiting for the publication lock, or writing the acceptance receipt did not prevent `publishSnapshot` from committing. The collector could return `published` even though cancellation had already occurred.

The collector now checks cancellation after its snapshot read and passes the signal into the transaction owner. `publishSnapshot` checks it before acquiring resources, after connection acquisition, and immediately before sending `COMMIT`, after any acceptance callback has completed. The revision, channel publication, and success receipt therefore roll back together when cancellation is observed before that commit boundary. Existing reconciliation still handles an uncertain commit response.

This contract cannot retract a `COMMIT` that has already been sent to PostgreSQL. It also does not imply that abort instantly cancels an in-flight PostgreSQL query; the transaction checks cancellation before publication becomes durable.

Evidence:

- Three production-collector regression cases failed before the repair: the actual status was `published`, rather than the required `failed`.
- All five focused regression cases pass after the repair, including a positive publication control and cancellation queued by the acceptance callback.
- Removing only the final pre-commit check from a disposable copy makes three of the five cases fail again. This detects the missing transaction-owner check, including the callback completion gap.
- The focused local cases use an explicit database/transport model and invoke the production collector and repository. They are not PostgreSQL integration evidence.
- The existing real PostgreSQL collector suite now exercises the same three cancellation points and asserts unchanged accepted content, unchanged revision count, and a failed receipt. Its execution status is recorded with the final integration results.

### Historical test clocks were reading a moving data file

The scheduled refresh run `41785104086` failed seven tests after acquiring newer source data. Five historical monthly/cutoff test files loaded mutable `dist/data/btc-volume.json` while evaluating it at the fixed clock `2026-11-04T00:00:00.000Z`. A later, otherwise legitimate acquisition therefore correctly failed the production future-acquisition guard before those historical tests could run.

Those five historical suites now read an immutable, byte-for-byte copy of the baseline archive, with its original acquisition time and content hash checked by `tests/helpers/frozen-replay-fixture.mjs`. This preserves their historical expected values and the real source-time guard. Current-file compatibility remains separately exercised by `tests/refresh-replay-compatibility.test.mjs` using the acquisition-aware evaluation clock.

The frozen archive is `tests/fixtures/btc-replay-2026-10-31.json`, 874,346 bytes, SHA-256 `09ac13fed80490c774b3c597f79882ae2b5ab3038cc968f182d163f49fa2a8b1`, acquired `2026-11-01T22:02:21.330Z`, observed through `2026-10-31`. Its provenance is recorded in the adjacent manifest.

A disposable-copy rehearsal advanced only the current archive's acquisition timestamp to `2026-11-04T22:00:00.000Z`, past the historical test clock. The five historical suites plus current-file compatibility passed all 28 cases. This is a synthetic reproduction of the clock mismatch, not a claim that every remote provider refresh was exercised.

The combined final patch also passed [all 62 cases across the eight affected suites](evidence/refresh-advancement.md) after both mutable BTC series were synthetically extended through November 3 with consistent acquisition, OHLC and coverage metadata. The parser still rejected a clock one millisecond before acquisition. The initial 60/62 result is preserved separately: it exposed two old UI preconditions, which were corrected to explicitly choose Start new and confirm a retry start; identity assertions and timeout limits were retained.

## Verification interpretation

Each result must identify what was actually run. Finite exploration is bounded state verification, not an unbounded proof. A deliberately broken implementation must fail a meaningful invariant; merely drawing a state diagram is insufficient. Microbenchmark results are local execution measurements, not end-to-end browser latency claims. A modeled database test is not evidence from a real database. Native Chromium observations do not establish Safari or physical-device behavior.

### RSI arithmetic failed on valid empty and subnormal inputs

`calculateRsiSeries` accepted an empty series but immediately dereferenced its first price. It now returns an empty result after validating its period settings. A second defect was the scaling factor `1 / firstPrice`: a positive finite subnormal first price made that reciprocal infinite. Flat changes then evaluated as `0 * Infinity`, producing `NaN`; mixed changes contaminated both Wilder averages.

The repair caps only the overflowing reciprocal and changes the units of **both** gain and loss averages together if a later observed change would overflow. It retains the original recurrence and uses only the observed prefix. A flat subnormal series now yields the documented RSI value of 50. Three new regression cases failed against the original source and passed after the repair. The focused mathematics/calendar suites passed 51 cases. A separate comparison against the exact baseline produced bit-for-bit identical complete RSI rows on 360 ordinary-range series / 108,000 rows across six price scales, twenty patterns, and periods 2, 14 and 250.

This is a defect in the accepted numeric domain, not evidence that the published market forecasts contained those extreme values. IEEE-754 rounding still applies; these checks do not prove exact arithmetic over every real number.

The old service migration check allowed only two instrument-identity additions, so it correctly detected the new RSI source bytes but described the authorized repair as an unexpected formula change. The updated check retains the original migration SHA-256 and requires each of the two instrument additions and three RSI boundary repairs to occur exactly once before normalizing only those reviewed snippets for the original-source comparison. Canonical/published byte equality remains mandatory. An ordinary Wilder-seeding mutation and removal of an approved guard both fail the actual assertion. The [source-compatibility receipt](evidence/math-source-compatibility.json) records this distinction; historical migration receipts were not rewritten.

### Replay settings crossed the explicit-confirmation boundary

Mode/model and horizon changes reopened the coordinator without its `selectOnly` flag. A user could enter start selection, change a setting, and acquire a committed paused session without choosing a candle or date. The production-coordinator regression first failed with `paused` instead of `selecting`. The corrected handlers preserve an open picker or an absent session. Explicitly confirmed sessions remain usable and retain their selected start date across horizon changes.

### The new default mode hid saved current-chart replays

Native Chromium exposed a second replay bug: after saving a current-chart capture, reopening looked only in the default cutoff storage slot. The saved capture existed but Continue never appeared. The correction retains the selected mode on reentry. On a fresh mount the cutoff slot takes precedence; only when that slot is absent can the generic/current capture be offered. Invalid cutoff data does not silently fall through, and cross-mode records are rejected. Start new still uses the default cutoff mode. Both slots, invalid JSON, wrong-slot records, stale hashes, and the save/reopen sequence have focused regressions.

The remaining two scheduled-refresh failures were date assumptions in atlas/cycle-clock tests. An invalid future origin is now relative to the actual forecast origin. Historical cycle-clock cohort expectations declare `2026-10-31`; separate latest-archive assertions follow all completed quarters. A synthetic extension through `2026-12-31` kept the historical 65 origins while expanding the latest cohort to 66. Production origin and cutoff guards are unchanged.

### A rejected fallback replaced the provenance of retained API observations

The React application independently updated its document and delivery metadata. When an older saved fallback arrived, it could retain the newer populated document but replace that document's revision, derive an empty phase from the rejected fallback, and disable the RSI backtest action. Retry also cleared provenance before accepting any replacement.

`snapshotReducer` now accepts the document, revision and display phase together. Loading and failed retries preserve accepted provenance. A rejected older fallback says “연결 실패 · 직전 자료 유지”; an initially accepted saved fallback and static hosting keep their distinct existing labels. A mounted React regression reproduced the false empty-state message before the fix. Native Chromium then verified the real compiled application with synthetic HTTP responses: the observations remained visible, the actual RSI request carried their original revision, and pending/failed replacement requests preserved the available action. The [native receipt](evidence/snapshot-browser.json) and [failure-state screenshot](evidence/snapshot-retained.png) explicitly describe simulated HTTP failures, not a production outage.

### Narrow and short replay layouts had incorrect scroll ownership

At 320 pixels wide, native focus/entry scrolled the outer chart stage by 18 pixels; the SVG occupied `[-18, 302]` instead of `[0, 320]`. Replay-scoped `overflow: clip` prevents the chart perimeter from becoming a programmatic scroll container while leaving the transport and menu's own scrollers intact. At 900×430, the menu had only 108 pixels of height, of which its sticky heading consumed 61; the full 44-pixel mode control could not be exposed and wheel scrolling oscillated between clipped positions. A short-viewport rule provides the menu its own larger overlay area while keeping the control size and sticky close action.

The focused native comparison verifies zero outer-stage offset through mode changes and eight transport swipes. The short menu grows to 281 pixels and the mode control becomes fully visible without scrolling. The broader replay gate retains its viewport, hit-target, forecast identity and saved-session assertions; its setup now explicitly selects current-chart comparison after asserting the fresh default cutoff mode, uses visible controls, and follows the actual mobile entry action where the desktop button is hidden.

## Performance improvement

`themeComparison` previously constructed six full-history Maps per judgment and evaluated nine horizons per judgment: each of three aggregate horizons recomputed all three individual horizons. It now builds two request-local Maps per comparison and evaluates the three horizons once per judgment. Local indexes avoid a stale cross-request cache. Dates, status/group ordering, formulas and floating-point summation order are preserved.

Six alternating baseline/candidate samples were recorded for each workload after equal warmups, with checksums and exact result equality. Other heavy audit tasks were paused during timing. The real fixture has 704 asset bars, 732 benchmark bars and three judgments; the synthetic upper-bound fixture has 5,000 bars per series and 50 judgments.

| Workload | Baseline median ms/call | Candidate median ms/call | Reduction |
| --- | ---: | ---: | ---: |
| Real comparison | 1.2556 | 0.2676 | 78.69% |
| Real API calculation subset | 1.6045 | 0.6785 | 57.71% |
| Upper-bound comparison | 138.8307 | 3.0934 | 97.77% |
| Upper-bound API calculation subset | 174.7757 | 45.9790 | 73.69% |

All 24 paired samples improved and the four ranges are disjoint. The API subset includes calculated-result serialization and standalone judgment performance; it excludes source-snapshot serialization, database/HTTP work and rendering. Thus these figures do not claim the whole site is 79% faster. The ordinary fixture saves about one millisecond in comparison work; the upper-bound case avoids much larger repeated work. See [full methodology](theme-comparison.md), [raw samples and exact source hashes](theme-comparison-benchmark.json), and `scripts/benchmark-theme-comparison.mjs`.

## Bounded formal verification and statechart

The project-local `verify-replay-state` skill was created using pstack's formal-verification workflow and persisted with the source change. It contains the actual covered functions, synchronization hashes, commands, required failures, finite bounds and drift-maintenance instructions. The [statechart and correspondence](../replay-state/README.md), [Mermaid source](../replay-state/statechart.mmd) and [machine-readable receipt](../replay-state/verification.json) are maintained together.

The actual controller is exercised on all 10,000 length-four traces over ten commands (40,000 transitions; 52 observable states / 380 edges). The actual coordinator is exercised on all 259 length-zero-through-three traces over six actions (726 transitions; 24 observable states / 78 edges). All sixteen controller tests cover targeted ownership, restoration, reentrancy and stale callback cases. The broader focused replay regression set passes 55 cases.

Eight actual-source mutations must fail their intended assertions: missing request ownership, missing timer ownership, missing recursive freeze, automatic rewind at the end, missing mode/model selection preservation, missing horizon selection preservation, reset of the saved mode on reentry, and missing storage-slot validation. Restored sources must pass again. The two shortest selection counterexamples are entry followed by one mode or horizon change. Errors from imports, syntax, missing selectors or timeouts are not accepted as mutation detections.

These are bounded executions of production JavaScript with controlled coordinator dependencies. The observable state counts are projections, not exhaustive private-state counts. The diagram is an explanatory statechart, not TLC output. Existing separate market/equity/ETH/publication TLC checks were also executed successfully with their intended negative controls; they do not extend the replay explorer's scope.

## Mathematical and causal review without further model changes

The reviewed monthly replay, cycle-clock/calibration, timing and forecast-evaluation paths preserve per-origin prefixes, reference eligibility at the origin, closed-outcome requirements, calendar-month operations followed by integer day correction, target-weighted MAE, unavailable skill for a zero baseline-error denominator, and common-origin comparison boundaries. Overlapping origins remain distinct from independent target samples. Current-vintage reconstruction remains distinct from prospective issuance.

The existing independent numerical gate passed reconciliation of 18 assets, 104,022 closes and 400 annual samples, plus 360 bounded price paths, 262 threshold cases and all sixteen intended mutant failures. No additional production defect was established in these inspected paths. This source review and these finite checks do not establish predictive superiority, calibrated real-world probabilities, arbitrary asynchronous schedules or provider availability.

## Integration evidence

The first combined commit also exposed a pre-existing Hallmark integrity-gate error: it required the current tree to contain exactly two HTML files, although the application now has eleven. The audit stopped before running any design checks. The corrected guard still pins the immutable baseline at 24 CSS / two HTML files and requires **every one of its 26 exact paths** in the current tree, while including all added screens/styles in the static scan. Four regressions cover additions, removal of a baseline HTML or CSS file despite same-count substitutes, and baseline drift. The exact baseline-to-current inventory is 24/2 → 32/11. This correction enables the real audit; it is not itself a passing design result. Final design findings and integrity status remain separately visible in the PR checks.

The completed [Hallmark run on `c377760`](https://github.com/twoimo/bitcoin-cycle-atlas/actions/runs/41793929768) has a passing integrity gate with no errors: all eight routes rendered before and after, all 80 screenshots were captured, and both source trees matched their committed Git blobs. Its **design gate remains failed**: 19 static FAILs, three static REFLEX findings and two rendered REFLEX findings, with zero rendered FAILs. The unchanged vendor/generated CSS and context-sensitive findings are analyzed in the [triage](hallmark-triage.md), with the upstream findings preserved. That context does not convert the checker result into a pass. Local attempts that lacked the renderer's supported root-launch configuration failed integrity and are not substituted for the complete remote rendering.

The initial API/fixture revision `d6e737e68d487652e5bb14e9f4d3289a418749e2` passed the [real PostgreSQL 17.11 service workflow](https://github.com/twoimo/bitcoin-cycle-atlas/actions/runs/41789168142), including all 28 service cases and the new cancellation transaction regression. This is distinct from the focused modeled-database tests. The final combined candidate's source hashes and completed local checks are recorded in `verification.json`; final remote workflow status is attached to [PR #61](https://github.com/twoimo/bitcoin-cycle-atlas/pull/61).

The combined native replay gate passed **all seven scenarios**: BTC at 1440×900, 320×568 and 900×430; ETH at 1440×900 and 320×568; MSTR at 1440×900; BMNR at 390×844. The [summary and source hashes](evidence/replay-browser.json) link the complete losslessly compressed receipt. Representative [mobile](evidence/replay-mobile-320.png) and [short-screen](evidence/replay-short-900.png) screenshots show the preserved chart and reachable controls. The harness deliberately blocks live refresh traffic and classifies its expected offline banner; it does not demonstrate a live provider outage. Separately, all **64 React tests**, **152 chart-replay checks**, static resources and generated-route checks pass.

Two local full-model attempts ended before producing the required aggregate receipt (after 30 and 879 reported passes respectively, without an assertion failure in their logs). Their cause was not established, and neither is counted as a full-suite pass. The initial committed revision completed all 2,462 model tests in GitHub CI. The combined product revision `c377760f7464c9b6ab274b5b93e97f1ec7d96825` then completed **all 2,473 model tests, with zero failures or skips**, in [CI run 41793929798](https://github.com/twoimo/bitcoin-cycle-atlas/actions/runs/41793929798). That run subsequently failed the legacy source-hash service assertion described above; it is not an overall CI pass. Final-head checks verify the corrected assertion and the complete pipeline rather than substituting an earlier result.

The changed source does not include the protected IPO surface, source-data archives, fixed forecast ledger or October 21 issuance. The generated static React bundle is rebuilt from the corrected source. Native evidence is Chromium 143 on Linux; Safari and physical touch devices were not tested. Full-suite completion, failed/incomplete attempts and any remaining gate limitations must be distinguished in the final receipt rather than inferred from a partial log.
