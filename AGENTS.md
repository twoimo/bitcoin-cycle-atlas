# Project editing guide

Bitcoin Cycle Atlas is a Korean financial research workbench: observed BTC, ETH, equity, HYPE and Korean real-estate data, conditional forecasts, a 20-asset comparison board, research evidence, an IPO calendar and relay content. It separates observations from assumptions and issuer claims. Node 24 or later; the deployment and canonical test runtime pin Node 24.22.2.

## Commands

```bash
npm test                                    # every tests/*.test.mjs through scripts/test.mjs
node --test tests/<name>.test.mjs           # one test file
npm run test:panels                         # React panels: tests/web/*.test.tsx
npx tsx --test tests/service/<name>.test.ts # one service test (npm run test:service builds the web app first)
npm run typecheck

npm run dev:web      # Vite app on 127.0.0.1:4320, proxying /api and /data to 4319
npm run start:api    # Fastify API on 4319; requires DATABASE_URL (Postgres)
npm run build:web    # verify:domain and verify:skullet, then Vite into build/web
python3 -m http.server 8000 --directory dist   # the static site, no install needed

npm run verify:static
npm run verify:numerics
npm run verify:formal
npm run verify:research
npm run verify:forecast
npm run verify:publication
npm run build:standalone   # build/Bitcoin_Cycles_Comparison.html
```

- `npm test` runs every test that imports `tests/support/linux-x64-replay.mjs` (the frozen ETH archive replays) in a pinned linux/amd64 Node image through Docker unless the host already runs Linux x64 Node 24.22.2. Without Docker that batch fails. Read the final `ATLAS_TEST_TOTAL` line; `complete:false` is not a pass.
- `verify:formal` needs Java 11 or later and downloads a SHA-pinned TLC 1.7.4 on first use; set `TLA2TOOLS=/path/to/tla2tools.jar` to reuse a copy.
- A `build:*` script with a `--check` twin fails when a committed generated file differs from what its generator produces. After changing a generator or its inputs, run the build form and commit the regenerated output.
- `verify:forecast` and `build:forecast` replay the stored forecast experiments bit for bit, and those results were produced on linux/x64 Node 24.22.2. On any other host both run in the pinned Docker image from `scripts/canonical-runtime.mjs`. On arm64 (Apple Silicon included), V8's `Math.exp` and `Math.log` differ from x64 in the last bit, so a direct `node scripts/build-forecast-ledger.mjs --check` fails there even though nothing changed.
- `refresh:*`, `scripts/refresh-ohlc.mjs` and `scripts/refresh-volume.mjs` collect new data over the network. Their `--check` or `--verify` forms revalidate stored data offline.

## Rules and what enforces them

Each rule below fixes a mistake agents have repeated here. When a check fails, its message names the fix; follow it instead of loosening the check.

| Rule | Enforced by |
| --- | --- |
| Adding, renaming or deleting a top-level `dist/*.{js,css,html}` file, or a stylesheet linked from `dist/index.html`, updates `seedPaths` in `research-data/eth-review-scope.json` in the same change. | `scripts/eth-review-inventory.mjs`, run by `npm run verify:static` and `tests/eth-review-packet.test.mjs` |
| A file that an issued ETH prospective record or `dist/data/forecast-ledger/experiments.json` pins keeps its exact bytes, even for an unused export. Put new behavior in a module outside the pinned graph. | `scripts/recorded-source-pins.mjs`, run by `npm run verify:static` and `tests/recorded-source-pins.test.mjs` |
| Run the forecast ledger only through `npm run verify:forecast` or `npm run build:forecast`. Never read a direct off-x64 `build-forecast-ledger.mjs` failure as a regression. | `scripts/run-forecast-ledger.mjs` moves off-x64 runs into Docker. The direct call is unguarded because that file is in the ETH operation graph. |
| Run a frozen replay test only through `npm test`. A new test that replays stored linux/x64 outputs imports `tests/support/linux-x64-replay.mjs` on its first line. | The guard throws at once off linux/x64 Node 24.22.2 and names `npm test`. `scripts/test.mjs` sends every importer to Docker. |
| "Nothing imports it" is not enough to delete a file. Files kept on purpose are listed with the document that keeps them. | `scripts/preserved-files.mjs`, checked by `tests/preserved-files.test.mjs` |
| Derive a list or count of files from the file that defines it, such as `dist/index.html` or `dist/`. Do not add a second hand-kept copy to a script or test. | Judgment, no check. The standalone builder and the inventory checks above already derive theirs. |

## Architecture

- `dist/` is hand-written source, not build output. It is the static ES-module app (`index.html`, `app.js`, `atlas-shell.*`, `atlas-price-chart.js`, `market-data-controller.js`, `chart-*.js`) and its committed data in `dist/data/`. Some files in it are generated and guarded by a check: `dist/market-lab-math.js` is copied from `packages/domain/src/market-lab-math.js` by `build:domain`, and Skullet assets are synced from `node_modules/skullet` against `tools/skullet/provenance.json`.
- The npm workspaces run TypeScript through `tsx`. `apps/web` is the React/Vite market lab served under `/market-lab/` and imports shared modules from `dist/`. `apps/api` is a Fastify server with Postgres repositories and a US-market collector, with migrations in `db/migrations`. `apps/jobs` holds the CLI jobs. `packages/domain` holds pure models and `packages/contracts` holds shared types.
- `build/` holds generated artifacts (web and Pages builds, Cloudflare staging, replay state, verification receipts). Never treat it as source.
- Deployment is an assets-only Cloudflare Worker (`cloudflare.config.ts`). `build:cloudflare` copies `dist/` and refuses production packaging without a verification receipt bound to the current commit and tree. Production runs two source-bound Workers Builds stages, models first and then browser and publication; see `ops/cloudflare-verification.md`. The former GitHub Actions workflows are archived and do not run (`ops/github-actions-archive/`, mapped in `ops/ci-migration.json`).
- Forecast ledgers, judgment snapshots, ETH prospective archives and the original 18-asset historical records are append-only evidence whose bytes the tests verify. Never rewrite them to make a check pass.

## Design references

Read [design.md](design.md) before changing a user-facing screen. Atlas is a dense Korean financial research workbench with a full-height dark canvas, a single primary toolbar row and independent scroll areas for tables and dialogs.

The current visual direction uses only the user-requested [UI/UX Pro Max](https://github.com/nextlevelbuilder/ui-ux-pro-max-skill) and the [clone-website skill](https://github.com/JCodesMore/ai-website-cloner-template/tree/master/.agents/skills/clone-website). Read the selected revisions and decisions in [the design master](design-system/bitcoin-cycle-atlas/MASTER.md). Observe the real TradingView interface, measure its layout and compare the implementation at the same viewport and state. Restore the narrow right icon rail while retaining accessible names and actual controls. Earlier dated plans, release notes and audit receipts document their own revisions; they do not introduce current design tools or release gates.

## Preserved product contracts

- Reuse the shared type, surface, text, state and focus tokens. Component paint tokens live in `dist/styles.css`; the first-paint boot shell and standalone preview keep the small token sets needed to work independently.
- Keep viewport ownership, dynamic-height behavior, sticky headers and asset identity columns. The current 20-asset board keeps BTC first and displays its current Korean name, 비트코인. ETH is quoted in USD and HYPE in USDC; preserve the original 18-asset historical records.
- Preserve every route, input, event handler and source disclosure. Make link labels describe the actual destination.
- Keep the six navigation destinations in their order: 가격 차트, 시장 분석, 리서치, 자산 비교, 공모주 and 릴레이 콘텐츠. `atlasNavigationPages` in `dist/atlas-navigation.js` defines them. Links to the removed 컨퍼런스 복습 page open the price chart.
- Cover the app's implemented loading, empty, error and populated states. Use native keyboard and pointer behavior when checking menus and dialogs. Visible focus and a visible close action must survive internal scrolling and short viewports.
- Treat chart axes, observed values, forecasts, pending outcomes and source clocks as product data. Style work cannot invent, relabel or silently discard those values, and cannot change the price renderer's coordinate transforms to satisfy a visual check.

## Verification

Inspect the actual full shell and standalone routes, including desktop and narrow viewports, menus, search, dialogs and readers. Capture the real outer toolbar and active child chart or table after their content is ready. Compare reference and implementation geometry, typography, colors and interaction states; record unobserved states and remaining differences without claiming an unchecked exact match.

The ETH/model evidence workflow also runs `scripts/verify-eth-candidate-browser.mjs`, including the additional shared-workspace cases from `scripts/verify-workspace-browser.mjs`. The native-browser checks cover interaction states that a URL-only screenshot cannot reach.

Read the actual test results, source identities and browser receipt. Missing Chrome, a skipped render, an execution exception or an untested target cannot count as a pass. Retain the existing numerical, immutable-record and formal lifecycle checks for changes that affect their covered modules, and verify the production build and generated resources.

Design verification does not replace the separately recorded model-review and release conditions in [docs/ETH_REMAINING_CONDITIONS.md](docs/ETH_REMAINING_CONDITIONS.md).
