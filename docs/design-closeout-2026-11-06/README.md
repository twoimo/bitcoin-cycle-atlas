# Design closeout verification, 2026-11-06

## Completed release

**v1.31.3 is merged, released and publicly deployed.** [Final release report](RELEASE.md) records candidate `6011197`, actual merge `f7e97e9`, all four final PR gates, successful main CI/Pages/Release workflows, the served publication identity and completed public-browser checks. The public date rejection and workspace-menu focus restoration passed; issue #50 is closed as completed. The report preserves the release-payload download limitation and remaining Hallmark warnings.

This evidence branch adds completion records to the actual merge without changing the deployed product. The sections below retain the earlier phase's original source identities, test counts, failures and then-pending decisions. Use [RELEASE.md](RELEASE.md) for the final status.

## Scope and source

This continuation completes the pending November 5 workspace and design repairs on the latest validated observations. It preserves the chart perimeter, data/forecast meanings, source disclosures and existing controls.

The product source is local commit `027d84914a8fb0d1c4034eda70eec8a0c42dd22d` and remote commit `6cb6aa5d45bb2b66ef27d578785aa47571278137`. Both have Git tree `feddc55e0f7d44fc8cf23e4a9a8311608ba83147` and parent `59ec6f4f708e87d73dad6324d925a9e01383411c`. The remote commit was created through the authenticated GitHub connector; every uploaded blob and the resulting whole-tree identity were checked against the local commit. [PR #62](https://github.com/twoimo/bitcoin-cycle-atlas/pull/62) contains the change.

Local commit `5ddc2175764b8cad383c04ad9ff2940bab1689e6` then corrects one browser verification deadline, as explained below. Its remote equivalent is [`0bad479675cacabc8ff099030a5962d37fa2d884`](https://github.com/twoimo/bitcoin-cycle-atlas/commit/0bad479675cacabc8ff099030a5962d37fa2d884); both have tree `1d83a6f825e70d7d5386135dc1f01c93a30358ff`. Its product `dist` tree remains exactly `7429c879d54c27ecbac9e2c1f4cdb8cd77ad2dc3`, identical to the product already covered by the model, numerical, service, rendering and focused interaction checks. Subsequent evidence files do not change the executable product or its financial input data. The later packet repair expands one review-inventory metadata file as documented below.

The complete prior binary diff is preserved in the continued product source, and its failed intermediate receipts are retained. The integration includes the two automatic observation refreshes published after the original `6248882` work began.

## Resulting behavior

- Monthly and clock ledgers own their wheel, pointer and keyboard input. Scrolling plain table cells leaves the underlying price path unchanged.
- The shared method reader stays in the viewport on long dashboards and short windows. Opening it preserves the chart dimensions and paths; closing it restores focus to the persistent menu trigger.
- Each table retains its own sticky header and horizontal identity column. Mobile symbol closing is 44 by 44 pixels, and comparison disclosures and horizontally scrolling tables remain reachable by keyboard.
- Resizing the comparison page redraws its SVG without replacing unchanged research text and focused links.
- RSI loading geometry shares the actual renderer coordinates. Placeholder disposal releases its resize observation. The exact original Skullet source/license remains separately preserved behind a reproducible Atlas presentation adapter.
- The normal Vite build preserves the existing design contract before calculating asset hashes. No post-build asset rewriting or checker exclusion is used.

## Completed verification

| Gate | Result | Evidence |
| --- | --- | --- |
| Whole model/data suite | 2,481/2,481, zero failures, skips, cancellations or TODOs | [Regression summary](regression/verification-summary.json) |
| Numerical aggregate | All six scripts passed; 317,745 arithmetic assertions and the recorded finite causal/calendar cases | [Execution](regression/core-execution.json) |
| State and mutation verification | Existing market, equity, ETH, publication and replay checks passed | [Contract execution](regression/contracts-execution.json) |
| Replay enumeration | 10,000 playback traces, 40,000 transitions, 259 selection traces; all 10 intended implementation mutations rejected | [Replay receipt](regression/formal-replay.json) |
| Source/data preservation | 1,323 tested files unchanged after execution; 204 protected data/research/IPO files, 45,453,948 bytes, equal the integrated main | [Preservation](regression/source-after-verification.json) |
| Pages and types | Generated tree rebuilt and byte-compared; TypeScript passed | [Pages](integration/pages.json), [types](integration/types.json) |
| React panels | 65/65 locally and in remote CI | [Local loader run](integration/panels-direct.json), [remote service](integration/service-ci.json) |
| Real PostgreSQL services | 28/28; accompanying market-lab suite 59/59 | [Remote service](integration/service-ci.json) |
| Remote rendered Hallmark | Design and integrity passed; 0 FAIL / 0 REFLEX; 8 routes before and after, 80 screenshots | [Exact receipt](integration/hallmark-ci-receipt.json) |
| Complete native browser gate | 49/49 passed, with all 49 declared cases executed; 98 checked source files unchanged during execution | [Native evidence](browser/final/README.md) |
| Focused native behavior | Loading geometry/lifecycle, rail controls, short/mobile reader, sticky tables, keyboard input and viewport preservation passed | [Native evidence](browser/final/README.md) |

The canonical arithmetic/replay runtime is Node 24.22.2 Linux/x64. The panel CLI could not create its auxiliary Unix IPC listener locally; the unchanged tests passed through Node's `--import tsx` loader, and the original CLI failure is retained. Remote CI also ran the ordinary CLI successfully.

The first general [CI run](https://github.com/twoimo/bitcoin-cycle-atlas/actions/runs/42186238647) also passed all 2,481 tests and all subsequent verification steps. It checked GitHub's PR merge commit `c5284f5404ec249dcda5727b88847b6cf4896184`; that commit's tree is exactly `feddc55e0f7d44fc8cf23e4a9a8311608ba83147`, matching the reviewed product source. Its publication manifest was verified against all 788 emitted files. Final PR checks and deployment refer to their own recorded commit identities.

## Evidence packet closeout

The `aca73b7` PR head passed general CI, service and Hallmark; its ETH workflow also passed all 49 native cases, then failed while packaging evidence above the finite 100 MB aggregate limit. The exact artifact was restored and measured in full before correcting the caller capacity to 128 MB, with the separate 85 MB file limit and all validators unchanged. An additive source-inventory repair and one regression also include ten missing browser stylesheet/Worker payloads. The actual corrected packet replay succeeds at 105,806,852 bytes in 872 entries, preserving all 335 original execution-evidence files exactly. [Full failure, measurement, source mapping and repair evidence](packet/README.md).

This later repair leaves 203 protected financial/research/IPO inputs, 45,414,161 bytes, unchanged; the explicitly expanded review inventory is the sole metadata exception to the historical 204-file receipt above. All 20 recorded workflow and verification-skill files and the complete product tree remain unchanged. Fresh checks for the final head remain required before merge.

## Browser deadline correction

The initial complete native run executed all 49 declared cases: 48 passed, and the desktop BTC replay case reached the fixed 45-second test deadline at 0.3× speed. The committed archive now contains 16 daily transitions after the preserved October 20 replay origin, requiring 48 seconds at the specified 3,000 ms interval. The other three speeds had already visited all 16 dates in order.

The original remote [ETH/browser evidence run](https://github.com/twoimo/bitcoin-cycle-atlas/actions/runs/42186238739) reproduced the same single failure on Chrome 156.0.8078.79, while its other 48 cases passed. That failed CI outcome is retained in the [original native CI receipt](integration/original-native-ci.json). The corrected complete local run on Chromium 143.0.7499.0 then passed all 49 cases on `5ddc2175764b8cad383c04ad9ff2940bab1689e6`; all 98 checked source files stayed unchanged during that execution.

A separate native diagnostic preserved the state at the original deadline: playback was active on November 4, at transition 15 of 16. It subsequently reached November 5 and the ended state near 48 seconds. All 16 dates were observed exactly once, with a mean post-paint interval of 3,000.080 ms; the document stayed visible and focused, with no JavaScript errors or changed product files. The [raw terminal diagnostic](browser/final/cadence-terminal-observation.json) and original failing gate remain intact.

The correction computes one completion deadline from the actual transition count and requested interval, using the unchanged upper cadence ratio of 1.3 plus a named 5,000 ms startup/polling allowance. For this input the budget is 67,400 ms. It does not reset while playback runs. Exact count, full date sequence, minimum samples, all four speeds and the existing 0.85–1.3 mean-cadence assertions remain unchanged. [Source comparison](integration/cadence-fixture.json) and [bounded release review](integration/release-review.md).

## Design judgment and retained warnings

The pinned remote [Hallmark run](https://github.com/twoimo/bitcoin-cycle-atlas/actions/runs/42186238598) completed the original static/rendered baseline and all current kept comparisons. The current static report has **25 WARN**, and the rendered report has **10 WARN**. None is waived, dismissed or relabeled. The raw [static](integration/hallmark-ci-static.json) and [rendered](integration/hallmark-ci-render.json) reports remain available.

The local complete Hallmark run retains **one `kept` FAIL** for a changed Coin Metrics API URL. The network-restricted baseline used its older saved observations and an `end_time=2026-10-26` URL; current saved observations correctly use `end_time=2026-11-06`. The downloaded remote artifact independently shows that its baseline refreshed to `end_time=2026-11-06`, and its current pass retained all 30 links. This is a verified difference in acquisition context. The local failed receipt is not converted to a pass, and neither the checker nor the data is edited to force URL equality. [Remote baseline inventory](integration/hallmark-ci-before.json).

The [advisory review](hallmark/README.md) preserves each remaining warning and its scope. The apparently missing heading is the same `#analysis-heading`, with punctuation changed to natural Korean; its section, tabs and ARIA relationship remain. Figure inventories include changing dates, observations and SVG ticks, so their differing text signatures are not presented as a count of removed financial values.

Computed contrast is 9.638:1 in dark mode and 5.253:1 in a forced light mode for dialog code and formulas. A separate forced-light `.lab-error` diagnostic exposes a real 2.674:1 contrast weakness, versus 6.044:1 in dark mode. The shipped HTML entries declare `data-theme="dark"`, and `dist/app.js` explicitly selects dark mode; no light-mode control is exposed. The dormant light-theme pairing is retained as a specific prerequisite before exposing that theme, not dismissed as a false positive or treated as an active-screen pass. The diagnostic changes only its temporary DOM fixture.

Historical raw TAP output retains its original whitespace. It is not reformatted to manufacture a clean whitespace-check receipt.

## Final-head follow-up

The exact `aca73b74a5128a5466488a0c701e86f5e854af46` PR head passed its complete 49-case native gate, but its evidence-packaging step then exceeded the 100,000,000-byte aggregate budget. Reconstructing the actual failed artifact produced the same overflow and measured the complete required book at 105,721,764 bytes across 862 entries. The [capacity follow-up](release-followup-ci.md) retains that failure, the complete byte reconciliation and the narrowly increased 128,000,000-byte aggregate capacity. The independent 85,000,000-byte per-file ceiling, source inventory, framing and model conditions stay intact.

The separate open [issue #50](https://github.com/twoimo/bitcoin-cycle-atlas/issues/50) was still reproducible in the source: manual dates outside the input bounds reached the nearest-bar snapping path. The [manual-date follow-up](replay-date-followup.md) adds one shared validation boundary for the button and Enter, state-preservation regressions, native keyboard cases and a real-source negative control. Pointer selection, Random and First retain their existing paths. This is a new product delta after the recorded design closeout; its complete CI and public release identities are recorded in the [PR #62 release summary](https://github.com/twoimo/bitcoin-cycle-atlas/pull/62).

## Claims and limits

These checks establish the recorded finite arithmetic, lifecycle, preservation and interaction properties. They do not establish universal mathematical correctness, calibrated forecast probabilities, superior market predictions or investment performance. The deterministic performance receipt checks work bounds and SVG size, not native paint latency.

The retained ETH seed, economic-input contract and first-twelve-nonoverlapping-mature-case policy are inspected in [remaining conditions](regression/remaining-conditions.json). No model activation, new release authority or synthetic maturity is inferred from this UI change. Gemini opposition and the follow-up reverse review remain omitted by the user's earlier instruction.

The complete native browser results are recorded above. The final source/evidence commit still goes through the existing [PR checks](https://github.com/twoimo/bitcoin-cycle-atlas/pull/62/checks); the PR release summary records the final CI, merge and public publication identities after those executions finish. A source-bound pre-deployment report does not assert a future deployment result.
