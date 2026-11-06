# Loading integration closeout

Status: **PASS for this assigned slice**. This is not the complete app Hallmark, 49-case native gate, CI or deployment verdict.

Baseline: `624888270fcb539ab08d505e5affab5f5d435776`, source tree `54dd283f0530047a240b5928421cbf68679bc89d`. Product source hashes are recorded in [the native receipt](evidence/loading/report.json); focused static, package and unit execution records are in [verification.json](evidence/loading/verification.json).

## Root causes and changes

The app fed only neutral inert blocks into Skullet `Reveal`, while shipping the dependency's entire generic stylesheet. That stylesheet installed unused custom-element hiding, interactive/text/media sample rules and x-ray colors. The integration did not have an explicit owned CSS contract. This generated the vendor portions of Hallmark 20, 26a, 26b, 48 and 62; the Vite CSS mirrored the same upstream rules.

The adopted design keeps the exact original runtime and license, archives the complete original CSS with its license and SHA-256, and publishes an app-owned adapter at the existing public URL. `scripts/sync-skullet.mjs --check` verifies both the npm source bytes and the generated adapter. No Hallmark rule, severity, input path, baseline or scope changed. The public adapter remains in the complete `dist` scan. The adapter implements the actually used Reveal pane/loading/layer and boot/inline-bar behavior; live controls retain their own interaction styling. The untouched upstream stylesheet is explicitly identified as original dependency source, not an Atlas design.

The RSI skeleton had two real geometry defects:

| Behavior | Baseline observation | Corrected behavior |
| --- | --- | --- |
| Price/RSI split | Grid fractions used the height remaining after padding/gap; the price panel ended 30.1875–30.421875px above the original actual renderer's boundary | The skeleton and actual SVG share the renderer's coordinate function; observed discrepancy is 0px |
| Right axis | A 620px viewport media query chose the narrow axis while the renderer uses allocated width below 600px; widths 600–620 had 12px too little axis space | The actual allocated panel width chooses the same 72/84px axis as the renderer |
| Top coordinate | 18px was encoded as general panel padding and produced Hallmark 24b | 18px remains the renderer coordinate in the common geometry contract; it is not rounded to a control spacing token |

The real chart's layout calculation was extracted without changing its math. The skeleton measures only its allocated RSI panel, changes two layout values when its size changes, and disconnects its observer on disposal. The animation engine, package version, request ownership and observed/forecast data remain unchanged.

## Executed verification

The native script serves the untouched baseline and current loading integration fixtures from the same local HTTP process as Chromium 143.0.7499.0. It executes the actual baseline TypeScript renderer after stripping type syntax and resolving its existing module URLs. The expected chart coordinates are not recomputed from the new shared helper.

- **120 original-renderer comparisons:** ten widths, six heights and RSI shown/hidden. Chart coordinates, ticks, date/value transforms and price-axis inverse behavior match the original model exactly.
- **18 geometry observations:** seven baseline cases reproduce the defect; seven corresponding current cases and four independently allocated/resized current panels match the original renderer at 0px maximum error. The test also checks the visible rectangles inside Skullet's shadow roots against the source blocks.
- **9 actual loading shapes:** chart, RSI, diagnosis, scenario, cashflow, table, list, detail and calendar. Initial neutral blocks stay visible, actual measured paint exists, normal motion runs, the surface token resolves, and the generic upstream CSS is not automatically injected.
- **Native accessibility and keyboard behavior:** one status role and its loading label appear in Chromium's accessibility tree; neutral paint is inert/hidden; native Tab skips it. This does not claim a screen-reader audit.
- **Reduced motion:** measured blocks remain visible with zero running animations. **Disabled scripting:** all 42 calendar cells stay visible with the status present.
- **5 disposal paths:** explicit clear, hidden host, detached host, closed dialog and pagehide. Each leaves zero skeleton roots, observed resize targets, connected measured bones and running animations. Error/retry preserves the actual button node/handler and cannot invent a success result.
- **8 focused unit cases pass.** The original RSI interaction/model tests remain included.
- **Pinned Hallmark on the two owned public stylesheets:** 0 FAIL, 0 REFLEX, 0 WARN, 0 waivers. The complete app/bundled result is the coordinator's separate gate.
- **Pinned original and adapter byte checks pass.** `git diff --check` passes.

The first native probe incorrectly required an intentionally hidden mobile heading bar to be visible in the disabled-script calendar assertion. Its [failed receipt](evidence/loading/initial-probe-mobile-header-assumption.json) is retained. The final assertion explicitly checks all 42 actual calendar cells; product CSS was not changed to satisfy that probe.

Visual inspection of the [390px](evidence/loading/loading-rsi-390.png) and [900px](evidence/loading/loading-rsi-900.png) fixture captures confirms visible neutral price/RSI blocks and the preserved axis space. These are loading integration fixtures, not screenshots of a complete production page.

## Exact source identities

| Source | SHA-256 |
| --- | --- |
| Original Skullet runtime, unchanged | `159653b71266900bcff7df3403c1e04cf34d1822074431a131716eedda15e71c` |
| Original Skullet CSS, preserved | `2d5fd47eb1956d1406cb5a6a6abcc8ecb90a7766015ea30425ffe6ce80491243` |
| Original MIT license, unchanged/preserved | `352ea4bc404c267caeac26864b5a3fafb9ce9502cb1e1db32ec301ee33b51dbf` |
| App adapter source and public copy | `7763e1565515ea28884d1c97ee88a51055859e1ab7f72d2ac68c98bee04febf1` |
| Shared RSI coordinates | `4ff96f411d896c51c19cbe8909143d856f79b515ac6537aba87ef5728047dffb` |
| Loading JavaScript | `f62d142df3ee3ae00ae10f63373d0421d785c253e7fc71acb8231714340e07cb` |
| Loading CSS | `241d713af90f378d6f927b8c1d29a39d150d26374b8fe3315b05b8b50df041cf` |
| Actual renderer after extraction | `cceea42c2c4d6cca4c7cd360f920d6569f5bc4ac62f51e289751b7b4bf11f31f` |

No protected `dist/index.html`, source data, IPO file, numerical model, generated Pages bundle, branch, commit or remote resource was changed by this slice. Generated bundle metadata, the full scan and app-route checks are integrated by the coordinator.
