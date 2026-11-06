# Hallmark design audit

Pinned source: [Nutlope/hallmark](https://github.com/Nutlope/hallmark/tree/7ec868225c6caa040558c321ee0fefa0e73f83a8) v2.0.0, MIT. The three files in `upstream/` are byte-for-byte copies; `provenance.json` records their upstream Git blob identifiers. The original MIT notice is retained in `upstream/LICENSE`.

This is build/CI tooling, with no production dependency. The GitHub workflow installs `puppeteer-core@25.16.0` and the readiness-test DOM parser `linkedom@0.18.15` into a runner temporary directory using `--ignore-scripts`. It uses the runner's Chrome and records the browser/tool versions. The source-pinned Korean font follows the existing evidence workflow recipe. The DOM fixtures test readiness failure boundaries; they do not stand in for the actual browser runs.

## Audit contract

The wrapper checks every tracked input blob against its commit before and after, including the React source that produces the committed frontend, and never edits source inputs. The workflow runs two independent parallel jobs, each with its own copied baseline/current `dist`, HTTP origin and artifacts:

| Suite / job | Immutable baseline | Static baseline | Rendered routes |
| --- | --- | --- | --- |
| `core` / `audit` | `0c1ed40e1b9b6c76f5621d087737dc57f174b51e` | 24 CSS + 2 HTML | The original eight routes, unchanged |
| `workspaces` / `workspace audit` | `3b6373906dbdd3ef321db31deaf8a8f785da61c3` | 32 CSS + 12 HTML | Ten actual consolidated host routes |

Every stable baseline HTML/CSS owner must remain. New entries are included automatically. The workspace baseline's compiled CSS filename may change with its Vite content hash; a compiled stylesheet must still exist in the same owner, and the browser must load the bundle actually referenced by the page. This exception does not change the core baseline's path-preservation checks. Each suite runs all four original phases: baseline static/render `--before`, then current static/render `--kept`.

The static pass reads the explicit `dist` directory. The core browser pass receives `dist/styles.css` and eight URLs: BTC, ETH, BMNR, MSTR, data, evidence, legacy comparison, and mobile preview. The workspace pass receives the same CSS and these project-root URLs:

| Screen | Path below `/bitcoin-cycle-atlas/` |
| --- | --- |
| US | `market-lab/` |
| KR | `market-lab/?region=kr` |
| Scenario | `market-lab/?view=scenario` |
| Cashflow | `market-lab/?view=cashflow` |
| RSI | `market-lab/charts/?symbol=TQQQ` |
| Housing | `market-lab/charts/?symbol=HOUSING-SEOUL&region=seoul` |
| Themes | `market-lab/charts/?symbol=HYPE` |
| IPO in the chart perimeter | `?page=outlook&center=ipo` |
| Asset board in the chart perimeter | `?page=outlook&center=data` |
| Research in the chart perimeter | `?page=outlook&center=evidence` |

All passes run app scope, modern-minimal genre, with separate baseline snapshots restored for their respective `--kept` runs. No filter, waiver, or severity override is passed. No HTML file is passed to rendering, which keeps module loading on the HTTP origin. The server serves the real `index.html` for directory routes, without an SPA fallback for missing resources. The explicit CSS input makes upstream's `reworded` stamp available to kept checks; it also runs static gates on that one CSS file. Render totals therefore include those static findings and cannot be compared directly with earlier URL-only totals. No regex or severity patch is applied.

Two exact, ordered build-copy patches are recorded in provenance with source, intermediate and final Git blob hashes. The first adds Chrome flags only when `GITHUB_ACTIONS=true` and `HALLMARK_CI_CHROME_ARGS=ephemeral-ci`. The second, enabled by `HALLMARK_ATLAS_READY=1`, requires the actual Hallmark page instance to reach its real observed-content readiness before any probe or screenshot. The wrapper then records the hash of its existing snapshot-identity readiness adapter. Workspace jobs add one further build-copy branch that waits for the exact declared host, active same-origin iframe and its actual content. It records the child URL and content proof in every renderer readiness receipt. The branch leaves the original core readiness path and every upstream probe, gate and severity intact. Missing readiness propagates through the upstream render-error path.

Before each version's audit, a separate browser readiness check requires real chart paths, observed candles, every asset identity from the copied snapshot, research records or the preview iframe's loaded BTC chart. The immutable core baseline remains exactly 18 assets; the immutable workspace baseline has 20. Workspace guards distinguish US/KR and the selected chart instrument. They require observed ztd/RSI/housing/theme content, actual IPO calendar cells and the complete embedded asset/research content. Current workspace pages additionally require their actual outer `atlas-center-toolbar-lab/data/ipo/evidence` mount and rendered controls, bound to the active frame. The pre-change baseline uses an explicit separate contract; an old child toolbar cannot satisfy the current contract. The cashflow route intentionally records its initial empty-input calculator, without filling a hypothetical example. A loading shell is not accepted as a completed screen. BTC and its embedded preview must also have no active forecast `aria-busy` state and no visible transient workspace toast before the actual renderer captures them. Preflight checks are recorded separately from the linter's own route requests. Every declared route also needs a matching `HALLMARK_RENDER_READY` record from the actual captured page instance.

Current FAIL/REFLEX returns exit 1. Missing renderer, missing route/screenshot, internal parse/check errors, or skipped kept comparisons return exit 2. Baseline findings are retained and are not asserted clean. Each job preserves all four JSON reports, stderr, source/readiness receipts and comparison HTML. Core requires 40 baseline + 40 current screenshots; workspaces requires 50 + 50. The renderer probes eight distinct widths and emits five screenshots per route; screenshots are not produced at every probed width. The original `audit` job name and `hallmark-design-<sha>` artifact are retained; the additional job emits `hallmark-workspaces-<sha>`. Neither job cancels the other on failure.

Current findings and 1440 × 900 and 375px full-height actual before/after PNGs for every route are also transported in job logs for review through the GitHub connector. Each PNG has a SHA-256 receipt. The native browser evidence suite separately exercises menus, dialogs, keyboard focus, empty results, mobile navigation, live resizing and replay. Its declared scope and actual executed case count are checked in its receipt; a smaller focused run is not the complete gate. The prior `04d98bfa` native receipt contains 52 cases; that is a historical result, not a pass claim for later changes.

Static Hallmark does not traverse JavaScript ES imports. Upstream DOM probes inspect the top-level document. Workspace screenshots include the iframe, and readiness inspects its actual content, but that does not turn upstream into an iframe DOM auditor. Initial-route rendering also does not exercise every interactive state. Native checks must still verify the single outer toolbar, its transferred controls, hidden scrollbar paint with working native scrolling, sticky identifying columns, keyboard access and focus restoration. Existing model, causality, provenance and data tests remain required. Optional remote application fonts are unchanged and upstream fallback warnings remain visible. A zero-FAIL run is not a claim that all WARNs have been resolved or every visual requirement was reviewed.

Run through the GitHub workflow after committing the exact sources to be checked. Each parallel job retains the original 16-minute job budget and 10-minute wrapper deadline, with at most 60 seconds per static pass and 270 seconds per browser pass. Missing or timed-out execution is always incomplete. No final browser pass is claimed merely by adding a new suite or passing its unit tests.

Manual equivalents, with the two exact baseline checkouts already present:

```sh
node scripts/verify-hallmark-design.mjs --suite core --baseline build/hallmark-baseline --out build/hallmark
node scripts/verify-hallmark-design.mjs --suite workspaces --baseline build/hallmark-workspace-baseline --out build/hallmark-workspaces
```
