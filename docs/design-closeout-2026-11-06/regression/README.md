# Regression closeout — 2026-11-06

The completed local regression result is **PASS** for source commit
`027d84914a8fb0d1c4034eda70eec8a0c42dd22d`, tree
`feddc55e0f7d44fc8cf23e4a9a8311608ba83147`, using **Node v24.22.2 on Linux/x64**.
The [machine-readable summary](verification-summary.json) links the commands,
actual counts, source identities, raw logs, earlier failures and scope limits.

The coordinator published the same tree as remote commit
`6cb6aa5d45bb2b66ef27d578785aa47571278137` in
[PR #62](https://github.com/twoimo/bitcoin-cycle-atlas/pull/62). That remote
identity was supplied after the coordinator's GitHub verification; this lane
independently checked the local tree. Local run receipts retain their original
local commit identity. Remote CI and served-publication checks are separate.

## Completed checks

| Gate | Observed result |
| --- | --- |
| Complete model suite | **2,481 / 2,481 pass**, zero failed, skipped, cancelled or todo cases; complete aggregate, one canonical-runtime batch; 476.248 seconds |
| Numerical aggregate | All six commands passed; **317,745 arithmetic assertions**, **34,356 calendar cases**, 325 ordinary and ten rolling-prefix comparisons |
| Cycle classification | 1,089 finite price paths, 81 scoped intervals and all **27 / 27** intended mutation failures; seven actual-controller integration checks pass |
| Asset comparison | 18 assets, **104,095 closes**, 400 annual samples, 360 bounded paths, 262 threshold cases and **16 / 16** intended mutant failures |
| Market request/retry formal check | 2,081 and 15 distinct states in the two current bounded models; 32 actual-source regressions, two intended source-mutation failures and restored-source passes |
| Equity formal check | 46,252 distinct states in the current bounded model; 28 regressions and seven intended source-mutation failures |
| ETH formal check | 2,243 distinct states in the current bounded model; 17 regressions and nine intended source-mutation failures |
| Publication formal check | 20 distinct states in the current bounded model; five regressions and three intended source-mutation failures |
| Replay executable verification | 10,000 playback traces / 40,000 transitions, 259 selection traces / 726 transitions, and all ten intended source-mutation failures, including pending-save destruction |
| Preserved forecast ledger | Five records / one snapshot retained; 15 pending targets / zero scored; latest observations through 2026-11-05; cadence outcome `retained-not-due` |
| Renderer/search work bound | 5,955 observed closes and 5,559 candle/volume rows retained in 100 SVG elements against a budget below 120; 43 reads for a nine-row window in a 131,072-row search fixture, budget 47 |
| Static references | 788 files and 804 local references checked at `/bitcoin-cycle-atlas/` |
| Other required contracts | Research source/catalog generation, 149 ETH events / 407 sources, treasury daily-path identities and current causal-cycle calibration passed |

The full model aggregate is in [full-model-tests.log](full-model-tests.log),
with exact command/runtime timing in [core-execution.json](core-execution.json).
The final complete numerical output is [numerics.log](numerics.log).
[contracts-execution.json](contracts-execution.json) records the eleven-step
contract lane. The market-request gate ran before the final commit against the
same covered source bytes; the final fixture change is outside its scope and
its unchanged source hash is retained in [formal-market.json](formal-market.json).

All TLC checks used the original official **1.7.4** JAR with SHA-256
`936a262061c914694dfd669a543be24573c45d5aa0ff20a8b96b23d01e050e88`.
Correct models completed with no queued states. Broken-model controls violated
their intended invariants; actual-source controls failed their intended
assertions and restored copies passed. Process errors do not count as detected
mutations. Existing models and maintained diagrams were not changed.

## Two fixture corrections exposed by the combined check

The original sticky-header test required the data-table selector to be the last
selector immediately before a rule's opening brace. The UI change moved that
selector into the shared owner list while keeping `position: sticky` and
`top: 0`. The test now identifies the exact selector's membership and verifies
the same declarations. Every previous viewport, scroll, layer and pinned-name
assertion remains. Three controls require rejection when the owner is removed,
the position becomes static, or the top offset moves to 40px. The focused suite
changed from **30/31** to **31/31**. It remains a source-contract check; native
layout evidence belongs to the separate browser lane.

The actual `lab-view` initializer now registers a `MutationObserver` for native
reading regions. `tests/helpers/structure-view-fixture.mjs` deliberately
provides an inert browser boundary for controller/math replay, but had no such
API. The unchanged numerical integration gate therefore threw before reaching
its assertions. The fixture now supplies inert `observe`/`disconnect` methods
beside its existing inert `ResizeObserver`. Production bodies, numerical
assertions, data and source pins were not changed. Inert observers do not verify
native mutation, focus or scroll behavior.

Both test corrections were included in the frozen product commit before the
successful final complete suite. This lane made no production-source changes.

## Source preservation and failed-attempt history

[source-after-verification.json](source-after-verification.json) confirms that
all **1,323** identified code/test/tool files and **20** workflow/skill files
retain their recorded hashes. All **204 protected data, research and IPO
files / 45,453,948 bytes** matched the integrated main baseline
`59ec6f4f708e87d73dad6324d925a9e01383411c` before execution and remained identical
afterward. The two automatic data refreshes already in that baseline are not
attributed to this UI patch. The detailed inventories are
[source-manifest.json](source-manifest.json),
[gate-and-skill-manifest.json](gate-and-skill-manifest.json) and
[source-preservation.json](source-preservation.json).

The earlier records are retained as actual attempts:

- [pre-integration-attempt.json](pre-integration-attempt.json): intentionally
  stopped after remote main advanced; no aggregate; the old sticky-selector
  assertion had failed.
- [integrated-before-fixture-attempt.json](integrated-before-fixture-attempt.json):
  intentionally stopped for the missing VM observer correction; 1,206 reported
  passes and no aggregate do not count as a complete suite pass.
- [daily-data-before.log](daily-data-before.log): the original focused failure.
- [daily-data-mutant-control-initial.log](daily-data-mutant-control-initial.log):
  the first revised check correctly failed because a comment-stripped rule could
  not be substituted into the raw stylesheet during its negative control. The
  checker now normalizes once before both the positive and negative checks;
  [daily-data-after.log](daily-data-after.log) records all 31 passes.
- [numerics-before-fixture.log](numerics-before-fixture.log): the actual missing
  `MutationObserver` error. The successful final aggregate is a distinct file.

Raw failed/incomplete logs were not rewritten to resemble passing runs.

## What the result establishes

The numerical gates exercise actual modules using independent arithmetic,
calendar, coverage and causal-prefix oracles. The optional old-baseline normal
differential was not invoked in this run and remains null/empty in its raw
report. This result does not claim that optional comparison ran.

TLC results apply to their declared finite abstractions. The replay verifier
executes finite actual-JavaScript traces and reports `formalProof: false` and
`modelCheckerRun: false`; it is not a TLC or unbounded theorem. The work-bound
receipt verifies deterministic search, batching and selection, not native paint
time or input latency. Browser layout, PostgreSQL transactions, remote CI and
served publication have their own evidence lanes.

[remaining-conditions.json](remaining-conditions.json) records empirical
conditions without changing model adoption. The retained seed contains three
models at one origin and nine future targets; its earliest observation ends on
**2026-11-26 at 09:00 KST**. The policy still requires the first twelve actual
nonoverlapping mature cases per exact model/source/options/horizon binding,
followed by a distinct freeze and later issuance/evaluation. The economic input
contract requires **26 definition-matched inputs over 28 complete UTC days**,
with actual origin-time availability, reconciled supply and staking accounting,
and sufficient mature labels. The old 25-input acquisition receipt is historical.

Current source contains the daily ETH workflow definition; this local inspection
does not infer its current remote activation or successful execution. Earlier
documentation describing a then-Draft PR or an absent default-branch workflow is
not current remote evidence. Gemini opposition and follow-up reverse review
remain `omitted-by-user`, not passed and not a missing mandatory approval.
No test count, retrospective reconstruction or retained hash proves predictive
superiority, calibrated probabilities, or future market outcomes.
