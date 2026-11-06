# Native browser closeout — 2026-11-06

**Final required gate: 49/49 PASS, zero failed or skipped cases.** The complete run finished at 2026-11-06T08:49:45.173Z on frozen source `5ddc2175764b8cad383c04ad9ff2940bab1689e6`. All 98 tracked source checks remained unchanged during the run. The original 48/49 failure and the two unsuccessful diagnostic setup attempts remain preserved separately.

## Source and runtime

| Identity | Value |
|---|---|
| Original integrated source | `027d84914a8fb0d1c4034eda70eec8a0c42dd22d` |
| Final source, after the cadence-fixture correction | `5ddc2175764b8cad383c04ad9ff2940bab1689e6` |
| Final source tree | `1d83a6f825e70d7d5386135dc1f01c93a30358ff` |
| Product `dist` tree, identical before and after | `7429c879d54c27ecbac9e2c1f4cdb8cd77ad2dc3` |
| Runtime | Node v24.22.1, Chromium 143.0.7499.0, Playwright 1.62.1 |
| Korean font | Noto Sans CJK KR; verified Git blob `dc4a7c65e6f450bf17c10a2405250b620eb78703` |

Only `scripts/verify-chart-replay-browser.mjs` changed between the two source commits. No product or data bytes changed for the deadline correction. [source-integrity.json](source-integrity.json) independently matches every recorded source hash from the raw receipts to its frozen Git revision, and records the final gate’s own 98-file integrity check. [runtime-ready.json](runtime-ready.json) preserves the font/config/wrapper identities.

## Results

| Check | Observed result | Evidence |
|---|---|---|
| Required complete browser matrix | **49/49 PASS**; 328 native screenshots; 0 runtime exceptions and 0 unexpected resource failures | [Raw final report, gzip](reports/full-49-after-cadence-fix.json.gz) |
| Original complete matrix | **48/49 PASS, 1 FAIL**; sole failure was BTC 1440×900 at the original 45-second cadence deadline | [Raw original report, gzip](reports/full-49-before-cadence-fix.json.gz) |
| Loading surfaces | PASS: 120 original-renderer comparisons, 18 painted geometry checks, 9 skeleton kinds, 5 disposal paths; one native accessibility status, inert keyboard exclusion, reduced motion, and 42 visible calendar cells with scripting disabled | [Loading report](reports/loading.json.gz) |
| Reader viewport | PASS: 1440×900, 1440×360, 320×900 and 320×360; close/pager reachability, body scroll restoration, and retained chart-shell regions | [Reader report](reports/reader.json.gz) |
| Sticky surfaces | PASS: 320×900 and 1440×900 monthly/clock ledgers, legacy reader and embedded RSI/housing surfaces; symbol dialog also checked at 900×430 | [Sticky report](reports/sticky.json.gz) |
| Navigation rail | PASS: 4 native states covering desktop expanded/collapsed/keyboard and mobile 320px collapsed navigation | [Rail report](reports/rail.json.gz) |

The 49-case matrix comprises 25 asset/data cases, 13 workspace cases, 4 forecast-replay cases, and 7 main-chart replay cases. The same complete matrix ran again after the fixture correction. Focused passes were not rerun because the correction changed only the cadence verifier and the product tree remained identical.

## Why the original cadence check failed

The replay origin stays at 2026-10-20 while the preserved source now extends through 2026-11-05. There are 16 genuine daily updates. At 0.3×, each update is specified as 3,000 ms, so reaching the final bar requires 48,000 ms. The original shared wait stopped after 45,000 ms.

The [native terminal observation](cadence-terminal-observation.json) used real pointer/keyboard input and observed public DOM mutations without replacing timers, source data, replay state or styles. At the original deadline, playback was still running at index 15, 2026-11-04. It then ended at index 16, 2026-11-05, with all 16 exact source dates and a mean interval of 3,000.080 ms. The document was visible and focused throughout the recorded phases. Its reported terminal elapsed time begins after native-click settling, approximately 0.15 seconds after playback was started.

The fixture now computes the completion deadline as `ceil(source updates × requested interval × 1.3) + 5000 ms`. The 5,000 ms allowance is named and bounded; the same 0.85–1.3 mean-cadence bounds, exact count, exact date sequence, sufficient interval samples, and actual terminal-state checks remain intact. For the failing case the computed deadline is 67,400 ms. Faster cases receive their own smaller source-derived budgets.

| Speed | Requested interval | Observed mean in final full gate | Exact updates | Computed completion deadline |
|---|---:|---:|---:|---:|
| 10× | 100 ms | 99.307 ms | 16 | 7,080 ms |
| 1× | 1,000 ms | 999.713 ms | 16 | 25,800 ms |
| 0.5× | 2,000 ms | 1998.240 ms | 16 | 46,600 ms |
| 0.3× | 3,000 ms | 2999.533 ms | 16 | 67,400 ms |

The retained [original GitHub CI receipt](../../integration/original-native-ci.json) independently records the same sole 45-second failure on Chrome 156.0.8078.79. The [integration fixture receipt](../../integration/cadence-fixture.json) records the source-only change. Neither original failed result has been relabeled.

The first diagnostic setup attempted a hidden menu target before the original harness’s settling sequence; the second attempted the correctly disabled rewind button while already at the origin. Their [first](reports/cadence-setup-1-failed.json) and [second](reports/cadence-setup-2-failed.json) receipts and exact source snapshots remain in this package. They are diagnostic setup failures and are excluded from all 49-case gate counts.

## Reproduction and retained evidence

Exact arguments, environment variables, exit codes, source dates and measured timing samples are indexed in [receipt.json](receipt.json). The required gate was run with:

```sh
FONTCONFIG_FILE=/workspace/scratch/5579aed69769/hallmark-runtime/fontconfig.conf \
ATLAS_BROWSER_PATH=/workspace/scratch/82e52cfd9693/browser-native/chromium-audit-multiprocess \
ATLAS_BROWSER_OUT=docs/design-closeout-2026-11-06/browser/full-49-corrected \
ETH_BROWSER_IMAGE_LOG_MODE=failures-only \
node scripts/verify-eth-candidate-browser.mjs
```

`failures-only` controls console image logging; it does not skip screenshot capture or cases. The complete run captured 328 PNGs. This compact package includes ten representative images, all visually inspected, alongside losslessly compressed original reports containing every recorded check, source hash, timing sample and screenshot hash. Gzip files decompress to the exact raw bytes identified in [manifest.json](manifest.json). Source snapshots preserve the exact diagnostic code; their original execution paths are recorded in the manifest. Use fresh output directories when reproducing a run.

## Resource and scope notes

Focused probes intentionally blocked external font requests and used the verified local Korean font. The original sticky receipt also retains one local `project-replay-baseline.js` `ERR_ABORTED`; an observation-only repeat of the unchanged 1440px probe passed and did not reproduce that local abort. [Request/navigation events](reports/sticky-request-events.json) and the [raw follow-up report](reports/sticky-resource-diagnostic.json.gz) are preserved. These events were not erased from the original report. The final required gate reported zero unexpected resource failures.

The one-font local runtime paints the decorative Bitcoin currency glyph as a missing-glyph box; Korean text is rendered. No screenshots were retouched. This is native local Chromium evidence, with emulated touch input where declared. It does not certify Safari, physical devices, assistive screen readers or the production deployment. All original raw output directories remain untouched outside this compact staged package.
