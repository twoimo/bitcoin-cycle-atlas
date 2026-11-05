# Hallmark result and contextual triage

## Actual result

**The completed remote Hallmark design gate failed: 19 FAIL and 5 REFLEX. Its integrity gate passed with zero errors.** No finding has been waived, suppressed, dismissed or converted to a pass by this review.

The authoritative run is [41793929768](https://github.com/twoimo/bitcoin-cycle-atlas/actions/runs/41793929768), job `126453455284`, artifact `13304791057`, audited commit `c377760f7464c9b6ab274b5b93e97f1ec7d96825`. Its exact materialized receipt and every current finding, including warnings, are preserved in [evidence/hallmark-triage.json](evidence/hallmark-triage.json).

| Phase | Static inputs | Render status | FAIL | REFLEX | WARN |
| --- | ---: | --- | ---: | ---: | ---: |
| Pinned baseline static | 26 | Off | 1214 | 1347 | 37 |
| Pinned baseline render | 1 CSS plus eight URLs | Ran | 53 | 211 | 13 |
| Current static | 43 | Off | 19 | 3 | 42 |
| Current render | 1 CSS plus eight URLs | Ran | 0 | 2 | 11 |

Both versions passed all eight route readiness checks. The successful integrity receipt verifies the required route requests, actual renderer readiness and 40 required screenshots per version. Both committed-source manifests remained byte-identical during the audit. Static preservation recorded links 7/7 and script hooks 11/11; rendered preservation recorded links 30/30 and fields 72/72. Heading/figure differences remain in the original warning records and have not been silently accepted.

The two earlier local attempts are separate failed runs: Chromium launched without the required root-process sandbox flags, rendering did not run, no required screenshots were produced, and each reported 88 integrity errors. Their separate readiness probes do not establish completed rendering. The existing compatibility patch requires `GITHUB_ACTIONS=true` together with `HALLMARK_CI_CHROME_ARGS=ephemeral-ci`; setting `CI=true` alone did not activate it. The completed remote run supplies the actual full audit evidence.

## What changed during this request

The immutable design baseline is `0c1ed40e1b9b6c76f5621d087737dc57f174b51e`. The user's audit request started at `94a1b1dda9eb359de70747043808340da369d087`; these are different comparison points.

**All five files named by the current 19 static FAIL and three static REFLEX findings are byte-identical to the request base.** The source and styles responsible for the two rendered REFLEX findings are also unchanged. The evidence JSON records SHA256 pairs for 14 relevant files. This establishes that the reported conditions predate this request; it does not excuse a defect or change the design gate's failure status.

The earlier verifier bug was separate: it rejected eleven current HTML files because it required exactly two. The corrected source-scope guard preserves all 26 exact baseline HTML/CSS paths while scanning all added files. That correction enabled the audit and did not modify any upstream design criterion.

## Classification of every FAIL and REFLEX

| Gate | Count | Context and conclusion |
| --- | ---: | --- |
| 20, missing leading Hallmark stamp | 2 FAIL | Exact pinned Skullet vendor CSS and its existing minified CSS bundle lack the requested comment. These are unsatisfied scanner metadata requirements. Adding a stamp to the vendor would violate its byte-exact source pin. No interactive defect is established by the missing comments. |
| 26a/26b, focus and active styles | 1 FAIL, 1 REFLEX | The vendor stylesheet contains generic selectors mentioning controls, but Atlas feeds its skeleton adapter noninteractive div/span geometry under `aria-hidden` and `inert`. Real controls receive application-owned focus/active styles. These vendor-only findings do not demonstrate a missing focus ring on an actionable control. |
| 48, color literals outside tokens | 11 FAIL | Neutral values are fallbacks in `var(--skullet-base, ...)`; Atlas supplies `--skullet-base` through its loading-surface tokens. Pink values belong to the unused `skullet-xray` debug selectors. The compiled mirror includes an additional prefixed text-decoration declaration. The source literals remain present and the scanner failures remain recorded. |
| 56, multiple sticky `top:0` elements | 3 FAIL | The pinned scanner collects matching CSS selectors and reports when there are at least two; it does not inspect their DOM ancestry or scroll owners. The cited indicator/symbol dialog headings and RSI/monthly table headers belong to independent containers. Adding a shared offset would misplace a header in its own scroller. |
| 62, script-dependent hidden reveal | 2 FAIL | The flag targets `skullet-reveal[loading]:not(:defined)` in the pinned vendor and compiled mirror. Atlas uses ordinary div/span markup plus `new Reveal(paint)`; no application `<skullet-reveal>` markup was found. The specific custom-element selector is not the application's loading markup. |
| 24b, 18px inset outside 4px spacing scale | 2 REFLEX | The loading placeholder's 18px top inset matches `chartGeometry`'s actual `top=18`. `design.md` explicitly requires this alignment. Changing the placeholder to 16px or 20px solely for the scanner would reduce its geometric accuracy. |
| 49b, two-line link at 320px | 1 REFLEX | The initial scan measures a link inside a closed disclosure. A native probe confirmed that it also wraps onto two lines when opened, while every text rectangle remains within the viewport. This is minor pre-existing presentation polish; no clipping or broken link access was demonstrated. |
| 72, negative bottom padding in details | 1 REFLEX | Confirmed visibility heuristic mismatch. Raw descendant text rectangles exist inside a closed details element even though `checkVisibility()` is false. The scanner compares those hidden rectangles with the small summary-only box and reports a large negative inset. Opening the disclosure produces a positive inset. |

## Exact source evidence

`scripts/sync-skullet.mjs --check` passed against Skullet 0.0.3. The vendor stylesheet SHA256 is `2d5fd47eb1956d1406cb5a6a6abcc8ecb90a7766015ea30425ffe6ce80491243`. Its source pin, license and upstream bytes remain unchanged.

The actual adapter is `dist/loading-surfaces.js`: `skeletonMarkup` creates ordinary elements, marks the paint subtree `aria-hidden="true" inert`, and `enhanceSkeleton` enhances that existing subtree. `dist/loading-surfaces.css` supplies the themed neutral token. `apps/web/src/main.tsx` imports both the vendor and application styles, explaining their compiled mirror in `dist/market-lab/app/assets/index-aLhLaYOa.css`.

Pinned Hallmark `check56` in `tools/hallmark/upstream/sloplint.mjs` tests only whether the merged CSS contains two selectors with sticky positioning and zero top offset. The existing application explicitly defines per-owner sticky headers in `dist/styles.css`, separate `.rsi-ledger-scroll { overflow:auto }` in `dist/atlas-shell.css`, `.monthly-ledger { overflow:auto }` in `dist/monthly-backtest.css`, and an independently scrolling symbol dialog in `dist/symbol-selector.css`.

The RSI loading inset corresponds to `apps/web/src/rsi-chart-model.ts`: `left=12`, right reserve 72/84 depending on width, `top=18`, `bottom=height-28`. The relevant design instruction says that the placeholder's 18px inset follows the actual SVG coordinate.

## Native comparison-page probe

A focused Chromium 143 probe loaded the actual comparison page at widths 320 and 1440, read the default closed disclosure state, and opened the first disclosure through its native summary control. It did not alter product source or invoke hidden actions.

At 1440px, the closed first `details.lab-details` was 52.59px high. Its content had computed `visibility:visible` and nonzero range rectangles, but `checkVisibility()` was **false**. Including those unpainted rectangles gave an apparent bottom inset of **−1079.19px**, matching the mechanism of the remote −1080px finding. After the native summary click, the disclosure opened and `checkVisibility()` became true; the measured bottom inset was **+35.19px**.

The pinned renderer's visibility helpers check display, visibility, opacity and nonzero bounding rectangles. They do not exclude descendants of closed details. Its text walker therefore treats the unpainted range rectangles as visible content. The source of the link is `dist/lab-view.js` in the `#structure-durations` disclosure, not an always-visible primary action.

At 320px, the link's two text rectangles were within horizontal ranges **221–306px** and **65–112px**. It was invisible while the disclosure was closed and visible after opening. Wrapping remains a possible presentation refinement, but forcing a universal no-wrap rule would need a narrow-screen check. No product change was made for this low-severity finding during the audit.

The focused probe's full before/after geometry is embedded in the evidence JSON. It supports the two classifications above and does not replace the remote full audit or establish complete accessibility conformance.

## Disposition

Retain the failed design result and all original findings. This triage identifies pre-existing conditions, measured visibility mismatches and the minor wrapping behavior; it adds no exclusions or waivers. A future design-policy or upstream-tool change should address those conditions explicitly while preserving vendor integrity, independent scroll owners, precise chart geometry and native disclosure semantics. No product edit is justified solely to make these contextual findings disappear.
