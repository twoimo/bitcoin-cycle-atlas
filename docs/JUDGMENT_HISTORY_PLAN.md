# 자산 비교표 헤더·판단 이력 후보 설계

Base: 53f587bf04f45ea7b3caa639ea88268fa7dca918. Scope: the existing 18-asset comparison and its refresh/Pages entry points only. No new financial model, portfolio weighting, trading, provider purchase or unrelated ETH recovery.

## User outcome and acceptance
- Compact, readable headers distinguish analysis-year counts, annual first-close-to-high mean and annual first-close-to-low mean. Existing numbers/current CSV remain identical.
- One history surface groups all 18 constituent histories under the existing 13/4/1 groups, with date selection, all-history range, per-asset drill-down, transition details and untruncated daily CSV.
- Reconstructed history and genuinely saved snapshots are distinct kinds in UI and exports. Reconstructed source-version history never claims contemporaneous availability, publication or profitability.
- Warm-up, prelisting, gaps, Jan rollover, stale days and arithmetic errors are never replaced by neutral.
- Source prefix/query results match the existing snapshot engine at tested dates. No rounded classification or future-price arithmetic leaks into earlier dates.
- Browser rendering is bounded. The full 1980–2026 archive must not create hundreds of thousands of DOM nodes or clone full provenance per day.
- Scheduled saved captures append only after actual successful comparison refresh, with real capturedAt UTC, current asOf, source hash and model/rules hash. The initial manual bootstrap records an actual calculation of the validated archive, not a provider refresh. Neither kind is called a deployed decision.

## Decisions
ADR-1: Keep buildAssetComparison as the oracle. Share existing percentage, ordered-mean and classification primitives. Preserve exact boundaries, precedence, calendar/stale semantics and source-defined uncertainty.
ADR-2: A prepared immutable date/annual/gap index supports arbitrary calendar-date queries. Prior-year means are cached by query year, only completed years count. Activation dates for gaps, missing dates and numeric failures are indexed. Daily labels/runs are compact; detailed snapshots/provenance are computed on demand.
ADR-3: Calendar-day history includes Jan 1 and stale transitions; observation dates remain separate. There is no fabricated exchange-session quote on weekends.
ADR-4: Group views display constituent signals, never a synthetic group buy/sell judgment.
ADR-5: Backfill is current-source-version reconstruction, not an observed log. Saved calculation captures start now, are immutable, and retain original source/model identity.
ADR-6: No change to the existing ETH stage. The comparison-refresh step receives an id; snapshot append explicitly requires its successful outcome. Old-bundle verifier success is insufficient.

## Risks and checks
R01 future leakage: append-future metamorphic tests, year transitions, late gap endpoint and numeric-overflow activation.
R02 numerical drift: exact unrounded boundary cases and native oracle comparisons across seeded dates/real asset samples.
R03 mislabeled history: mandatory kind/source version/asOf/observation/captured timestamp fields; no historical actual-capture generator.
R04 stale archive success: refresh outcome gate, fixture where old bundle passes verifier but failed refresh emits no capture.
R05 UI scale: transition runs, bounded list pages, CSV export preserves every requested day/asset.
R06 concurrency/append: immutable timestamp/hash filenames, manifest reconciliation, no overwrite, retain workflow stale-main guard and both allowlists.
R07 public/private and security: explicit public source files only; escape attributes/content and neutralize CSV formulas. No local account/session data in artifacts.

## Work order and release gates
W1 precise headers and immutable baseline comparison.
W2 history index/shared primitives and adversarial oracle tests.
W3 history dialog/group filtering/date controls/asset drilldown/CSV, native browser and mobile checks.
W4 prospective capture script/manifest/refresh-success gate, failure and duplicate fixtures.
W5 ChatGPT thesis -> Gemini source-backed adversarial review -> ChatGPT reverse, report receipts/adjudication, then final code delta review as required.
W6 only after dependent validation: PR/CI/Pages/release/public readback, preserving existing metadata/footer removals and unrelated work.

## Current external-validation status
Thesis NOT_RUN: shared FIFO has prior owners; no observed current provider readiness/admission for this job.
Gemini NOT_RUN: shared coordination has an unresolved other-owner operation. Preserve ownership; do not force-release, duplicate or infer remote failure. Private coordination/resumption identifiers stay outside Git.
Reverse NOT_RUN: depends on actual thesis and Gemini reports.
Independent reversible candidates and local tests may proceed. The history feature's dependent publication is held until this validation or an explicit current opt-out changes the applicable workflow.

## Verified candidate results (2026-10-26 UTC)
- 1,060 local tests passed, including delayed close/reopen, saved-mode disclosure, explicit-symbol mode/group/date reset, CSV and capture/loader failure behavior.
- Exhaustive native-engine comparison: 16,760 calendar query dates × 18 assets = 301,680 exact comparisons, from 1980-12-12 through 2026-10-31. Dates after the archive endpoint are intentional stale-boundary scenarios, not future observations or forecasts.
- Independent asset verifier: 18 assets, 103,929 closes, 400 annual samples, 360 bounded price paths, 262 threshold cases; 14/14 targeted negative controls rejected.
- Original comparison CSV is byte-identical to base 53f587b at 2026-10-26: 18 rows / 34 fields / 16,454 UTF-8 bytes / SHA-256 78ff52f22e910a34209411dd1f2bec3effa72557057ad5b93deb5691ad442462.
- HTTP and standalone feature journeys passed at 1440×1000, 390×844, 320×700, 700×600, 620×420, and 800×420. Each checks 18/13/4/1 filtering, full range, date moves, saved records, fast close/reopen, symbol jump and focus restoration.
- Browser downloads: original 18-row comparison, 366-day BTC reconstructed history, and 18-row saved capture. No filter silently truncates the stored-record CSV.
- First genuine filesystem capture: 2026-10-26T04:42:47.794Z, 18 rows. It records a calculation, not refresh, deployment, contemporaneous historical availability or a trade.
- Standalone build embeds the index plus exact record text strings for byte-hash verification; 99 modules. Static reference verification passed.
- Internal read-only code review reported no additional concrete regression. It is not the mandatory external thesis/adversarial/reverse audit.

## Remaining delivery
External thesis/adversarial/reverse stages are NOT_RUN. No PR, merge, release, Pages deployment, production workflow run or public acceptance is claimed for this candidate. Existing ETH work and PR #12 are untouched. Before public delivery, complete the applicable external gate or obtain an explicit current opt-out; then update release/cache versions, run CI, merge/deploy and verify the real public files and UI.
