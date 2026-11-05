# Theme comparison performance audit

## Finding and change

`packages/domain/src/themes.ts` rebuilt both price-history Maps inside `themePerformance`. `themeComparison` invoked that function once for each of three reporting horizons, although every invocation already calculated all three horizons. With J judgments, comparison therefore built 6J full-history Maps and evaluated 9J horizons.

The candidate builds two Maps per comparison call and calculates each judgment's three horizons once. Indexes remain local to the call so subsequent calls observe refreshed/replaced price bars. There is no persistent cache. The public `themePerformance` interface, entry/exit dates, missing-price and pending semantics, return formulas, group order, judgment order and summation order remain unchanged. Single-judgment results still validate their evidence and time constraints.

The API also calculates standalone per-judgment performance. That caller was deliberately left unchanged; the benchmark's representative calculation subset includes this remaining work.

## Decision and measurement contract

The pstack `benchmark-checklist` and `principle-explain-the-number` skills were used. Source blobs read were respectively `e901d1fdbc9ffce53e94d6514be7d9a22e771a1a` and `3948ad34092437918f366e2cbb270e9ae31977fb` in `cursor/plugins`.

Before reported timing, the decision threshold was written in the local evidence plan: require exact behavior equivalence and at least a 10% median reduction for the real fixture; treat differences below 5% as noise and overlapping ranges/inconsistent paired direction as inconclusive. The measured differences exceed those thresholds and all four workloads have disjoint baseline/candidate ranges.

- Baseline commit: `94a1b1dda9eb359de70747043808340da369d087`.
- Baseline module SHA256: `78a78374951da917e6e091c8513053f4628f766dde8387253222a544d8b6c021`.
- Candidate module SHA256: `44fae94a1a7f58a297fafa5928891433543e0bf075bdd6a412d93087142ae8fc`.
- Runtime: Node v24.22.1, Linux x64, AMD EPYC 9V74. Shared-host scheduling was uncontrolled. Other agents paused heavy jobs for measurement; end load averages were 0.77/0.32/0.54.
- Real fixture: unmodified `dist/data/themes.json`, 704 asset bars, 732 benchmark bars and 3 judgments. File SHA256: `0446c265f4e7141c348dd406ea1635663c6d005b01b4d77d837a4786c04bad17`.
- Upper-bound fixture: deterministic, schema-valid, 5000 bars per series and 50 judgments. JSON SHA256: `7212be5311f76d487ff53ed596df063469e0ed2feaffdda9c7967dc4228406f9`. This is a synthetic stress case, not a claim about current production traffic.
- Six samples per variant for each workload, ordered A/B repeatedly. Each variant receives 50 warmup calls for the real fixture and 2 for the upper-bound fixture. There is no forced GC or persistent result cache.
- One sample is 400 completed calls for the real fixture or 8 for the upper-bound fixture. Timing includes JSON serialization of calculated results; every result is consumed into a checked length checksum. The table reports wall time per completed call.
- `comparison` runs the complete comparison operation. `api-calculation` runs comparison plus all standalone judgment performances and serialization of those calculated results. It excludes serializing the unchanged source snapshot, loading/validation, database, HTTP and rendering, so it is **not endpoint latency**.

Raw timings, fixture dimensions, exact candidate diff, identities and runtime metadata are in [theme-comparison-benchmark.json](theme-comparison-benchmark.json). Reproduce with `node scripts/benchmark-theme-comparison.mjs /tmp/theme-comparison-benchmark.json`.

## Results

| Fixture and scope | Baseline median (min–max), ms/call | Candidate median (min–max), ms/call | Median reduction |
| --- | ---: | ---: | ---: |
| Real, comparison | 1.2556 (1.1794–1.3298) | 0.2676 (0.2587–0.2735) | 78.69% |
| Real, API calculation subset | 1.6045 (1.5497–1.6625) | 0.6785 (0.6678–0.7250) | 57.71% |
| Upper bound, comparison | 138.8307 (122.9776–157.3165) | 3.0934 (2.8335–4.7312) | 97.77% |
| Upper bound, API calculation subset | 174.7757 (168.3718–178.4333) | 45.9790 (44.1732–49.0837) | 73.69% |

## Why these numbers are plausible

A separate, unreported-for-timing CPU profile ran 80 complete baseline upper-bound comparisons before A/B collection. Approximately 80.06% of sampled self time was in `themePerformance`, 7.58% in its two full-history map callbacks, and 5.45% in garbage collection. Sampling and JIT attribution do not isolate the cost of each individual expression, but this profile supports the source-level diagnosis of repeated allocation/indexing. The raw profile is reproducible with the benchmark script's `--profile` option.

The upper-bound comparison reduces full-history Map constructions from 300 to 2, while the real comparison reduces them from 18 to 2. It also removes two redundant evaluations of every judgment. This explains why the larger fixture improves much more. Each remaining judgment still performs validation, date/path construction and aggregate arithmetic. Those costs and serialization are not removed, so Map-count ratios are not latency predictions. In the representative calculation subset, the unchanged standalone performance calls still rebuild Maps; this explains its smaller reduction. No whole-site, page-render, database-throughput or peak-memory improvement is claimed.

## Correctness and limits

The harness first requires deep equality between baseline and candidate comparison results for both fixtures and standalone performance for every judgment. It additionally checks exact equivalence after a benchmark gap, an asset gap and a same-object price refresh. Floating-point arithmetic is not approximated in these checks.

`tests/web/theme-comparison.test.tsx` independently specifies all 18 mode/status/horizon groups with known up/down/flat returns. It covers missing benchmark versus missing asset paths, missing entry, pending outcomes, empty denominators, replacement-bar freshness and rejection of invalid evidence. Combined with existing theme tests, **12 tests passed, 0 failed, 0 skipped** using `node --import tsx --test tests/web/themes.test.tsx tests/web/theme-comparison.test.tsx`. `npm run typecheck` and scoped `git diff --check` also passed. Existing React SVG title child-array warnings were observed in the older rendering test; they were not changed or represented as a new pass condition.

This scoped change affects the calculation shared by the API and React theme panel, without altering the DOM or controls. Browser rendering and full-service/real-database verification belong to the wider integration audit. The result demonstrates a repeatable local improvement for these fixed workloads; it does not establish performance under production concurrency.
