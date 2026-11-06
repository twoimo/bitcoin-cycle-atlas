# Scroll ownership and readable surfaces

Baseline: `624888270fcb539ab08d505e5affab5f5d435776`.

This partition covers shared sticky headers, the monthly/clock ledgers, the symbol selector, the RSI/housing ledgers and the relevant surface/contrast findings. Product changes and a focused native probe are recorded separately from the coordinator's complete Hallmark, model and publication gates. The exact handoff hashes and requested compiled app asset identities are in [source-handoff.json](source-handoff.json).

## Findings and changes

### A real chart-input ownership bug

At the immutable baseline, the clock ledger had 15 real origin rows and 617px of vertical overflow at 320×900. A native `deltaY:380` wheel event hit a plain identity cell, but the ledger stayed at scrollTop 0. The chart underneath changed its observed-price path. The same failure occurred at 1440×900. The original failing geometry/hit chain is preserved in [pilot-clock-input/report.json](pilot-clock-input/report.json); the completed baseline comparison is [workbench-before/report.json](workbench-before/report.json).

`bindChartNavigation` listens during event capture. Its existing interactive boundary recognized buttons and form controls but omitted dialogs mounted inside the plot. This explains why wheel input over a monthly result button worked while input over plain clock cells did not. Stopping bubbling on the table would be too late for that capture listener.

`dist/chart-navigation.js` now yields an event to a dialog only when the closest dialog is a **distinct descendant of this controller's own chart element**. This protects plain cells, native scrolling, pointer gestures, context menus and keyboard controls. It also allows a chart within an outer dialog, a chart whose own root has `role=dialog`, and an independent chart mounted inside a child dialog to keep their own navigation.

The new five behavioral regression tests failed three cases before the change and passed after it. With the existing navigation, viewport and mobile gesture tests, **69/69 passed**. Receipts: [navigation-before.tap](navigation-before.tap), [navigation-after.tap](navigation-after.tap). These use the repository's event fixture; the separate native browser receipts establish actual browser scroll arbitration.

After the change at 320px, the monthly ledger reached scrollTop 581 and scrollLeft 320; the clock ledger reached scrollTop 380 and scrollLeft 320. The observed-price path hashes stayed identical during each native ledger wheel operation. See [after-workbench-320/report.json](after-workbench-320/report.json).

### One explicit scroll-header contract

Pinned Hallmark gate56 counts selectors with `position:sticky` plus `top:0` across the stylesheet input. It does not resolve their containing scrollports. The baseline findings therefore did not establish that these independent headers overlapped in the app. Native measurements confirm the original sticky geometry already worked when the intended owner actually received scroll input.

Three approaches were considered before editing:

| Structure | Assessment |
|---|---|
| Fixed heading plus separately scrolling body for every surface | Makes ownership explicit but requires wider DOM changes and risks table-column alignment. |
| Different per-component top offsets | Appropriate only for headers sharing a scrollport. These owners are independent; adding another owner's height would misplace them. Property spelling/token tricks were also rejected. |
| One shared scroll-edge contract, scoped to each real owner | Selected. Removes duplicated declarations while retaining the same actual native scroll owners and local paint/layer behavior. |

The existing shared rule in `dist/styles.css` now also covers:

| Header | Actual owner |
|---|---|
| Open symbol-search heading | `.symbol-search-dialog[open]` |
| Monthly and clock table cells | `.monthly-backtest:not([hidden]) .monthly-ledger` |
| RSI history/trade header cells | `.rsi-ledger-scroll` |
| Housing history/backtest header cells | `.housing-table-scroll` |
| Unwrapped housing relation table | Outer `.ml-scroll` |

Local files retain their background, text, stacking and horizontal identity-cell rules. No 1px offsets or alternate property spelling are used. The existing indicator, evidence, IPO and asset-table selectors retain their previous shared behavior. This work did not edit protected HTML/data/IPO sources or the pinned checker.

The probe deliberately removes monthly vertical sticky behavior with a temporary, isolated in-memory style, verifies that its actual header-position oracle rejects the broken result, then removes the style and rechecks the restored header. This negative control is labelled in the receipt and is not part of shipped CSS.

### Mobile symbol close target

The baseline search close target was 36×36px at 320px. Its phone media rule now sets 44×44px. Native pointer opening, three ArrowDown selections, wheel movement, Shift+Tab to a visible focus ring and Enter closing are covered. A 900×430 short viewport also exercises the genuinely overflowing symbol dialog and the retained heading/close action.

### Surface ownership and contrast warnings

The chart card, method/reading cards, data panel and dashboard market card now pair their existing `--surface` background with explicit `--text` foreground. This makes their existing inherited contrast a component contract; it does not introduce a new palette. The measured chart card already had 14.733:1 contrast at baseline.

The gate40 warning was investigated instead of recoloring readable content to satisfy a token-scope artifact. The pinned static scanner flattens token definitions across selectors. For the formula warning, its 3.43:1 result exactly matches dormant light-theme `--accent:#925b15` against the later dark `--bg:#0b0e14`. The app explicitly selects the dark theme.

Measured values from [contrast-owner-before/report.json](contrast-owner-before/report.json):

| Sample | Actual foreground / effective background | Contrast | Scope |
|---|---|---:|---|
| Source `dialog code` and `.method-formula` | `#f2a84b` / `#0b0e14` | 9.638:1 | Computed source nodes; not painted because the existing app converts the method dialog to its paginated reader. |
| Painted method-reader code | `#b7c8dc` / `#141c28` | 10.036:1 | Actual visible reader reached by native user actions. |
| `.lab-error` | `#ec8190` / `#351c23` | 6.044:1 | Explicitly labelled temporary CSS fixture using the actual loaded styles, not a reproduced application error state. |
| Chart card | `#e6ebf2` / `#131922` | 14.733:1 | Actual rendered card. |

The `.lab-error` background is overridden by the actual `dist/viewport.css` rule. The scanner's flattened foreground does not describe the computed dark error text. Neither the formula accent nor error-state colors were changed. Original raw WARN40 findings remain intact; they are not waived or relabelled as checker passes.

The only first-comment change is the coordinator-requested `@preserve` marker in `dist/styles.css`, so the existing Hallmark metadata survives the supported CSS minifier. The checker, severity, source scope and fixtures are unchanged.

## Native evidence and limits

The browser is Chromium 143 through the native multiprocess wrapper. The before server reads every requested file directly from the named immutable Git tree. The after server serves current checked-out files and records the SHA256 of every requested byte stream. It rechecks those files at completion. Each receipt lists the actual app index and hashed CSS/JS assets requested by the browser; unreferenced duplicate build outputs do not become evidence.

The probe uses real mouse, wheel and keyboard inputs. It reads DOM geometry and computed styles. It does not populate tables with fabricated rows or programmatically assign scroll positions. The explicitly labelled negative style control and error CSS fixture are removed before subsequent checks. External requests are blocked and listed, so the native app exercises its retained local observations rather than inventing a network success. Runtime errors were zero in the completed cases.

| Evidence | Result |
|---|---|
| [workbench-before](workbench-before/report.json) | Baseline issues reproduced at 320/1440; short dialog passed. |
| [after-workbench-320](after-workbench-320/report.json) | Mobile monthly/clock native scroll, unchanged underlying curve, sticky geometry, close/focus and negative control passed. |
| [final-after](final-after/report.json) | 320px complete focused slice passed, including 4,206 real RSI days and 249 real housing months. 1440px monthly/clock passed, then an additional legacy reader defect stopped the combined run. It is intentionally recorded as failed. |
| [after-apps-desktop](after-apps-desktop/report.json) | 1440px RSI and housing native keyboard/vertical scroll and header geometry passed. No horizontal overflow existed at this width. |
| [after-short](after-short/report.json) | 900×430 symbol dialog native scroll, sticky close, focus and keyboard closing passed. |
| [pilot-apps](pilot-apps/report.json) | Immutable 320px baseline RSI/housing geometry for comparison. |

At 320px, RSI history reached scrollTop 533 and horizontal end 238; housing reached scrollTop 692 and horizontal end 169. Both retained their table header at their own scrollport edge. The app-ledger cases load the real shipped embedded-app entry at the stated viewport size. They do not claim independent parent-perimeter coverage; the coordinator's full native workspace gate covers that integration.

### Additional legacy reader defect handed to a separate owner

Native desktop scrolling down the long comparison page, opening the historical comparison disclosure, then choosing **자료와 도구 → 방법론과 출처** opens the existing paginated reader above the visible viewport. At 1440×900, its next-page control was at top −577px. This was reproduced both on immutable baseline6248882 and on the integration tree. See [legacy-reader-before/report.json](legacy-reader-before/report.json) and the failure in `final-after`.

This is a separate reader/body-scroll ownership defect, not a failure of the shared sticky contract. It was handed to the coordinator's reader worker with the same failing native oracle. Do not count this report as overall design closeout until that fix and the coordinator's final full gates pass.

## Reproduction

Run with Node24 and the same native browser/module paths, or provide `ATLAS_BROWSER_PATH` and `ATLAS_PLAYWRIGHT_MODULE`. The server and browser share one process. The script does not publish, commit or modify production files.

```sh
node docs/design-closeout-2026-11-05/sticky-surfaces/probe.mjs --phase=before --case=workbench --out=build/sticky-before
node docs/design-closeout-2026-11-05/sticky-surfaces/probe.mjs --phase=after --out=build/sticky-after
node docs/design-closeout-2026-11-05/sticky-surfaces/probe.mjs --phase=after --case=contrast --width=1440 --out=build/legacy-reader-after
node --test tests/chart-navigation-dialog-owner.test.mjs tests/chart-navigation.test.mjs tests/chart-viewport-navigation.test.mjs tests/mobile-gestures.test.mjs
```

Calibration runs are retained separately under `pilot-*` and the earlier incomplete probe directories. Their wrong initial assumptions (for example, expecting 20 monthly origins when the preserved dataset has 13, or expecting the superseded native method dialog to remain open) are not reported as product defects. The real clock-input and legacy-reader failures are identified above with completed reproductions and exact source identities.
