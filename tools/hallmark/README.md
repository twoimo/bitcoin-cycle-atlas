# Hallmark design audit

Pinned source: [Nutlope/hallmark](https://github.com/Nutlope/hallmark/tree/7ec868225c6caa040558c321ee0fefa0e73f83a8) v2.0.0, MIT. The three files in `upstream/` are byte-for-byte copies; `provenance.json` records their upstream Git blob identifiers. The original MIT notice is retained in `upstream/LICENSE`.

This is build/CI tooling, with no production dependency. The GitHub workflow installs `puppeteer-core@25.16.0` into a runner temporary directory using `--ignore-scripts`, uses the runner's Chrome, and records both versions. The source-pinned Korean font follows the existing evidence workflow recipe.

## Audit contract

The wrapper checks every tracked input blob against its commit before and after, and never edits source inputs. It copies baseline `0c1ed40e1b9b6c76f5621d087737dc57f174b51e` and current `dist` into the same build path, served by one HTTP origin. Baseline has 24 CSS files and two HTML files; additions are included automatically, while both HTML screens and at least the baseline CSS count remain required.

The static pass reads the explicit `dist` directory. The browser pass receives only eight URLs: BTC, ETH, BMNR, MSTR, data, evidence, legacy comparison, and mobile preview. Both run app scope, modern-minimal genre, with separate baseline snapshots restored for their respective `--kept` runs. No filter, waiver, or severity override is passed. A known upstream query-string shell detection limitation is avoided by URL-only rendering; no regex patch is applied.

Two exact, ordered build-copy patches are recorded in provenance with source, intermediate and final Git blob hashes. The first adds Chrome flags only when `GITHUB_ACTIONS=true` and `HALLMARK_CI_CHROME_ARGS=ephemeral-ci`. The second, enabled by `HALLMARK_ATLAS_READY=1`, requires the actual Hallmark page instance to reach its real observed-content readiness before any probe or screenshot. Missing readiness propagates through the upstream render-error path. Every upstream gate and severity remains unchanged.

Before each version's audit, a separate browser readiness check requires real chart paths, observed candles, the 18 asset rows, research records or the preview iframe's loaded BTC chart. A loading shell is not accepted as a completed screen. The preflight readiness checks are recorded separately from the linter's own route requests. In addition, eight `HALLMARK_RENDER_READY` records must prove that the actual captured page instances passed their guards.

Current FAIL/REFLEX returns exit 1, even on this initial adoption audit. Missing renderer, missing route/screenshot, internal parse/check errors, or skipped kept comparisons return exit 2. Baseline findings are retained and are not asserted clean. The full four JSON reports, stderr, receipts, 40 baseline screenshots, 40 current screenshots and comparison HTML are preserved as artifacts. The renderer probes eight distinct widths and emits five screenshots per route; screenshots are not produced at every probed width.

Current findings and selected actual before/after PNGs are also transported in job logs for review through the GitHub connector. Each PNG has a SHA-256 receipt. The native browser evidence suite separately exercises 34 cases, including menus, dialogs, keyboard focus, empty results, mobile navigation and live resizing.

Static Hallmark does not traverse JavaScript ES imports. URL rendering checks the initial screen, not every interactive state or iframe content. Existing app interaction, model, causality, provenance and data tests remain required. Optional remote application fonts are unchanged and upstream fallback warnings remain visible. This integration does not constitute a model review or proof that every visual gate passes.

Run through the GitHub workflow. It allows 16 minutes for the job; child audit runs share a 10-minute deadline, with at most 60 seconds per static pass and 270 seconds per browser pass. Missing execution is always reported as incomplete.
