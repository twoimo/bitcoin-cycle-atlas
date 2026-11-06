# Pinned Hallmark closeout — 2026-11-06

## Result and scope

The unchanged full Hallmark workflow **passes in CI on `6cb6aa5d45bb2b66ef27d578785aa47571278137`**. Its source tree is exactly the local reviewed tree `feddc55e0f7d44fc8cf23e4a9a8311608ba83147` committed as `027d84914a8fb0d1c4034eda70eec8a0c42dd22d`. Both runs check every public CSS/HTML source and all eight exact routes; neither skips rendering. The earlier 19 FAIL / 5 REFLEX findings are absent in both current runs.

The local native run is **not relabeled a pass**: it exits 1 for one dated-source-link `kept` failure. CI exits 0. The evidence below reconciles this network-dependent difference without changing the checker, baseline, protected data, scope, severities or waivers.

| Run | Current static | Current render | Integrity | Complete screenshots |
| --- | --- | --- | --- | --- |
| Prior `143a92c` | 19 FAIL / 3 REFLEX / 42 WARN | 0 FAIL / 2 REFLEX / 11 WARN | pass | 40 before + 40 current |
| Local `027d849` | 0 FAIL / 0 REFLEX / 25 WARN | **1 FAIL** / 0 REFLEX / 18 WARN | pass, zero errors | 40 before + 40 current |
| CI `6cb6aa5` | 0 FAIL / 0 REFLEX / 25 WARN | **0 FAIL / 0 REFLEX** / 10 WARN | pass, zero errors | 40 before + 40 current |

Local runtime was 117.861 seconds. Both phases recorded actual renderer readiness for all eight routes and all eight URLs reached the server. Widths probed: 320, 375, 414, 768, 1024, 1280, 1440, 1920. Five screenshots per route were produced: 1280×800, 375, 1440×900, 1440 full-page and 1920×1080. There is no claim of a separate screenshot at every probed width.

The direct static run also passes with 43 files, 0 FAIL / 0 REFLEX / 25 WARN. The source-scope regression tests pass 4/4 and the wrapper syntax check passes.

## Source and runtime identity

- Current input manifest SHA-256, **identical locally and in CI**: `09e27df3b6c1e183258f7c0a66ed0159a27a87d04d0e57f9be3121bde78f2215` — 945 tracked inputs, 54,242,758 bytes.
- Baseline `0c1ed40e1b9b6c76f5621d087737dc57f174b51e`: manifest `e699074e45fb90811a433199184c2ccdf5a5d0fdc38e5a316df130d167e37a1f` — 721 tracked inputs, 32,087,604 bytes, identical locally and in CI.
- Both before/after source checks match Git blobs and confirm read-only inputs.
- Hallmark upstream `7ec868225c6caa040558c321ee0fefa0e73f83a8`, v2.0.0, app / modern-minimal. Static checker Git blob `9916fa07286e58d319528ad7cfe4ad94318e5796`; SHA-256 `f8ada364c68a9db4b3dd5784bd416a7c412125e887aeae87d627e072d3848289`. The wrapper applies only its already recorded ordered Chrome/readiness patches to its build copy.
- Puppeteer Core 25.16.0 in both runs. Local Chromium 143.0.7499.0 / Node v24.22.1; CI Google Chrome 156.0.8078.79 / Node v24.22.2. Browser differences are retained, not treated as an identical runtime.
- Korean font: official Noto CJK commit `f8d157532fbfaeda587e826d4cd5b21a49186f7c`, font Git blob `dc4a7c65e6f450bf17c10a2405250b620eb78703`, license Git blob `d952d62c065f3f35fb83a173496e90b21525aef3`. Raw HTTPS timed out; an official Git partial fetch obtained the exact bytes. No substitute font was used. The shared font/config stayed unchanged during the native browser suite.

Local command, run from the repository root:

```sh
FONTCONFIG_FILE=/workspace/scratch/5579aed69769/hallmark-runtime/fontconfig.conf \
HALLMARK_FONT_FILE=/workspace/scratch/5579aed69769/hallmark-runtime/fonts/NotoSansCJKkr-Regular.otf \
HALLMARK_PUPPETEER=/workspace/scratch/82e52cfd9693/hallmark-runtime \
CHROME_PATH=/workspace/scratch/82e52cfd9693/browser-native/chromium-audit-multiprocess \
GITHUB_ACTIONS=true \
node scripts/verify-hallmark-design.mjs \
  --baseline /workspace/scratch/82e52cfd9693/bitcoin-cycle-atlas/build/hallmark-baseline \
  --out build/hallmark-20261106-local
```

The existing local launcher adds `--no-zygote --disable-gpu`; its complete source and SHA-256, browser binary hash, font hashes and fontconfig are in `runtime-receipt.json`. The checker files were not changed.

## Why local has one `kept` failure and CI has none

The exact missing baseline link is the Coin Metrics BTC daily API query with `end_time=2026-10-26`. It is present in both the committed baseline metadata and the local baseline's rendered comparison-page inventory. The current committed data source is the same endpoint/query with `end_time=2026-11-06`.

`dist/app.js` initially renders the verified bundle and automatically attempts a provider refresh when its last observation is more than one UTC day old. When that request fails, it keeps the verified prior bundle. The local restricted network preserves the baseline's October 26 source URL; the current bundle already has the November 6 URL. Upstream `kept` compares complete href strings and reports 29/30 retained links. All 72 fields remain.

The actual CI baseline inventory in `../integration/hallmark-ci-before.json` instead contains the **November 6** query. The baseline refreshed successfully during that run, so CI retains 30/30 links against the current page. CI and local still have identical committed-source manifests: the difference is the rendered live source, not changed files. The raw local FAIL is preserved in `current-render.stdout.json` and `local-full-receipt.json`.

This establishes a reproducibility limitation: the existing audit includes automatic live refresh. It does not establish a removed source control. Do not freeze new observations back to October, add a dropped-link waiver, rewrite baseline receipts or relax the gate to make these environments agree. A future deterministic offline audit would need an explicitly reviewed fixture contract separate from this unchanged gate.

## Previous blocker closure

| Prior finding | Count | Current source correction |
| --- | ---: | --- |
| Gate 20, missing first-line stamp | 2 FAIL | App-owned Skullet adapter has its design contract; `@preserve` and esbuild inline legal comments retain the bundled contract before asset hashing. |
| Gate 48, non-token colors | 11 FAIL | The neutral loading adapter uses Atlas tokens; unrelated upstream debug/custom-element styling is not shipped. Original dependency CSS and license remain preserved under `tools/skullet/upstream`. Both public adapter and bundled CSS remain in the full audit. |
| Gates 26a / 26b, inappropriate missing interaction states | 1 FAIL + 1 REFLEX | Only inert, aria-hidden measured blocks enter the loading adapter; unused generic interactive/custom-element rules no longer describe that surface. Live controls retain the app's actual interaction states. |
| Gate 56, duplicate sticky ownership | 3 FAIL | Shared rules name the independent scroll owners; component CSS retains paint/layering rather than redefining a second sticky top. Native scrolling is separately exercised by the browser worker. |
| Gate 62, hidden before enhancement | 2 FAIL | Neutral blocks are visible before scripting; hiding starts only after Reveal has made the measured layer. |
| Gate 24b, skeleton padding | 2 REFLEX | Skeleton and real RSI SVG share measured coordinates. The existing 18px chart inset is preserved as geometry. |
| Gate 49b, narrow source-link wrap | 1 REFLEX | The actual complete source link is an inline-flex 44px target with nowrap. |
| Gate 72, disclosure content beyond a boxed summary | 1 REFLEX | Native disclosure summary owns its boundary; the expanded research body has its own reading region and scrollable tables. |

`comparison.json` preserves every original blocking finding, the three raw summary sets and the CI artifact digest. The original receipts remain untouched.

## Remaining advisories and concrete follow-up

These are retained as warnings; a green blocking gate is not a claim that each advisory disappeared.

| Advisory | Evidence and interpretation | Follow-up |
| --- | --- | --- |
| Static contrast: dialog code and formula | The same two rules are reported in standalone and bundled CSS (four findings). Temporary DOM fixtures using the actual shipped cascade measure **9.638:1 dark, 5.253:1 light**. The static 3.43:1 result does not represent either active theme. | Preserve the raw warning and scoped measurements. Do not change shared colors based only on a flattened token reading. |
| Static contrast: `.lab-error` | Actual shipped styles measure **6.044:1 dark, 2.674:1 light** in the focused fixture. `viewport.css` gives the error a dark `--viewport-surface-2` background while light theme changes `--red`. This is a real low-contrast combination if the light error state is shown. | Repair the light-theme error surface/ink pair and verify the actual error state. This frozen-source evidence does not claim that repair is already made. |
| `kept` heading | The missing string is `고점 · 저점 · 다음 사이클`; the same `#analysis-heading` is now `고점과 저점, 다음 사이클`. `#analysis-workbench`, its `aria-labelledby` relationship and tab controls remain. | Record this precise copy correspondence in the review. There is no missing section for this one wording change. No additional gate waiver was introduced. |
| `kept` figures | CI reports 145/207 figure signatures retained; local 134/209. Examples include timestamps, updated ETH prices, dollar ticks and concatenated SVG axis labels. Figure signatures are text inventory, not protected numerical arrays. | Keep the raw changed-signature warning. Use numerical regression and native chart/ledger checks to assess data continuity; this report does not certify each changed signature individually. |
| F25, mobile tables and evidence text | CI retains four warnings: 12, 4 and 7 initially off-screen table columns, plus 95 words hidden in the mobile evidence view. Initial viewport visibility is narrower than interactive reachability. | Verify horizontal scrolling with row identity pinned, readable value columns, keyboard access, and mobile evidence selection/reader access. Do not delete columns or research text to reduce the inventory. Native interactive results are separate evidence. |
| F7, repeated container styling | Static has 20 warnings across control rows, dialogs and compact panels; render includes one. Many selectors intentionally share a control family, but this alone does not resolve hierarchy. | Retain consistent controls; inspect primary actions, dialog boundaries and reading surfaces by role. Make any hierarchy change to the real component rather than introducing cosmetic selector differences. |
| F3 and F19 | One unbalanced-heading warning and two four-font-weight warnings remain in CI. | Review meaningful narrow heading wraps and whether 400/500/600/700 all communicate distinct roles; reduce only redundant weights. |
| Local font/asset fallback | Local render adds eight Google Fonts fallback warnings. Exact pinned CJK covers Korean, but `fc-list :charset=20bf` is empty and the rail's Bitcoin glyph appears as a box in both old/current local captures. CI has no corresponding font-load warnings. | Treat local images as fallback-runtime evidence. Do not sign off exact font/glyph fidelity from these images. Use the CI captures and a supported device for the production face. No font mutation was made during tests. |

The focused contrast probe is reproducible with `FONTCONFIG_FILE=... node docs/design-closeout-2026-11-06/hallmark/probe-contrast.mjs`. Its output is `advisory-probe.json`. It uses temporary DOM fixtures with shipped CSS, not artificial financial data. An initial diagnostic attempt waited for a BTC-only selector on the comparison route; that probe timeout was corrected and is disclosed in the diagnostic receipt.

## Evidence files and limits

- `local-full-receipt.json`, the four `*.stdout.json` reports, before inventories, stderr and `wrapper-phase-log.txt` retain the exact local run. Full stdout with image chunks and all 80 PNGs remain in `build/hallmark-20261106-local*`.
- `baseline/` and `current/` each contain five representative PNGs. Each copy was verified against the wrapper's image SHA-256 receipt. Mobile BTC/compare and desktop compare/data were visually inspected: Korean text, plot content and the 18-row ledger are present. No inference about every interactive state is made from initial-route images.
- CI receipts and reports are in `../integration/hallmark-ci-*.json`; [workflow run 42186238598](https://github.com/twoimo/bitcoin-cycle-atlas/actions/runs/42186238598), artifact `13487642177`. `comparison.json` records its ZIP SHA-256.
- `runtime-receipt.json`, `current-static-direct-receipt.json`, `source-scope-tests.tap`, `advisory-probe.json` and `comparison.json` provide reproduction and reconciliation details.
- This worker wrote evidence only. It did not edit product source, tests, the checker, protected data, old receipts or Git history. This is a same-model partitioned review, not independent multi-model certification. Research/model prospective validity remains separate from interface integrity.
