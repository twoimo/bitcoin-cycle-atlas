# Scrolled dashboard reader closeout

Status: **PASS for the assigned reader behavior and its focused native checks.** The final repository-wide 49-case browser run, rebuilt artifact scan and rendered Hallmark verdict are owned by the integration lane; this report does not claim those runs have completed.

Baseline: `624888270fcb539ab08d505e5affab5f5d435776`.

## Proven failures and earliest wrong decisions

The desktop comparison page is a long document whose scroll owner is `document.body`. The shared reader intercepts the native method dialog, copies its content into `#chart-reader`, closes the original dialog and then applies the chart workspace's docking model. That model is appropriate for the bounded chart grid, but placed the desktop dashboard reader at the workspace's document origin. After native body wheel input, the method reader's next button was at top **−577px**, bottom **−549px**, outside the viewport.

The independent sticky lane reproduced the same failure against both the immutable baseline and the integrated working tree. Its original oracle and receipts were not changed:

- [Immutable baseline desktop failure](../sticky-surfaces/legacy-reader-before/report.json)
- [Integrated pre-fix desktop failure](../sticky-surfaces/final-after/report.json)

A second failure emerged when the new regression asserted the actual chart path hash. On mobile, the existing open-reader workspace rule won over dashboard shell dimensions. It removed the header margin and sidebar width allocation. At 320px, the structure chart width changed from **266 to 318px**, the forecast SVG from **250 to 302px**, and cycle SVGs from **240 to 292px**. This rerendered chart paths even though body scroll position stayed unchanged. The same failure was then reproduced against the immutable baseline: [mobile original receipt](mobile-original/report.json). The diagnostic [candidate receipt](mobile-path-diagnostic/report.json) records each SVG's size, viewBox and path hash.

A third ownership issue affected close behavior: the method menu item is hidden as its export menu closes. Saving that item as the reader's return-focus owner cannot restore visible keyboard focus. The persistent sibling menu trigger is the actual owner.

## Design decision

| Approach | Effect | Decision |
| --- | --- | --- |
| Retain the original native method dialog on dashboard routes | Would require a separate dashboard rendering and pagination path | Rejected because the shared reader behavior would diverge |
| Keep the shared reader and anchor dashboard instances to the viewport | Preserves the original content, pager and long-document scroll, while keeping the chart dock unchanged | **Implemented, approved by integration owner** |
| Rebuild the dashboard workspace into a grid with a sticky reader column | Broadly changes long-document layout, chart width and responsive geometry | Rejected because the fix would expand into unrelated layout |

The dashboard reader now uses the existing header, sidebar and reader-width tokens. Desktop placement leaves a 12px viewport gap and uses the existing independent reader body and pager. On mobile, dashboard workspace dimensions remain equal to their original shell contract while the existing reader overlay opens. The original chart shell retains its relative grid dock and four working perimeter regions.

Focus ownership is explicit: a reader opened from a menu saves the menu's persistent direct-sibling trigger. Pointer close and Escape restore `#export-button` without moving the body. The reader's keyboard ring now uses the existing shared focus token with a visible 2px outline.

Product edits are limited to:

- `dist/chart-details-panel.css`
- `dist/viewport-workspace.js`

The existing `scripts/verify-workspace-browser.mjs` legacy behavior is strengthened. Its case inventory is unchanged. No protected root index, chart data, historical observations, forecasts, replay code, original loading handoff file or generated Pages bundle was edited by this lane.

## Final native evidence

[Final report](final-width-after/report.json) records source hashes, served hashes, native input targets, clipping/hit tests, focus states, real page labels, scroll positions, SVG dimensions and SHA-256 hashes. The standalone [probe](probe.mjs) serves the actual current `dist` and invokes the same exported helper used by the existing 49-case browser gate. Chromium and the local server run in the same process scope; external requests are blocked and recorded.

For each size, native wheel input reaches the comparison section and positions the actual export trigger with space for its menu. Native pointers open export → methods, advance and return the actual pager, and close. A second opening repeats pagination and closes through Escape. Native Shift-Tab reaches the close button and verifies its visible 2px focus ring. The test requires the opener to be visible, unclipped and the topmost hit target.

| Viewport | Original body scrollTop | Close button top–bottom | Next button top–bottom | Actual page transition | Result |
| --- | ---: | ---: | ---: | --- | --- |
| 1440×900 | 2273 | 89–121px | 847–875px | 1/3 → 2/3 → 1/3 | PASS |
| 1440×360 | 2383 | 89–121px | 307–335px | 1/16 → 2/16 → 1/16 | PASS |
| 320×900 | 2391 | 67–111px | 841–881px | 1/4 → 2/4 → 1/4 | PASS |
| 320×360 | 2501 | 19–63px | 301–341px | 1/14 → 2/14 → 1/14 | PASS |

All four cases retain the original document, body, workspace and main widths, the original scrollTop and the SHA-256 of all **24** selected actual SVG paths at open and close, return focus to `export-button`, and report zero browser runtime errors. Desktop path SHA-256 is `dd551456a6471fd1ac931309917ff28cea05e9a0f5414a996d7646fc2cf9c864`; mobile is `206023400f7dae863360bf68532c114098ef2a26968927ade3aa8e1fd11a13cb`.

The same final probe also opens and closes the original chart reader at 1440×360. Its shell remains `chart`, display remains `grid`, and reader position remains `relative`. All four perimeter regions remain connected and in the viewport; after close, their measured rectangles and original grid columns are restored exactly.

The independent sticky oracle also passed after the desktop fix: [unchanged-oracle receipt](sticky-oracle-after/report.json). That run predates the final mobile workspace preservation and percentage-width refinement; the final four-case receipt above identifies the exact final source. The independent oracle itself remains unchanged at SHA-256 `2d2f8ce22fbc09f79e835b27d5c77d29f17b7faf2847d178f2527de0f1a7068b`.

Screenshots were inspected at both short-window sizes:

- [Desktop 1440×360](final-width-after/workspace-legacy-1440x360-legacy-method-reader.png)
- [Mobile 320×360](final-width-after/workspace-legacy-320x360-legacy-method-reader.png)

## Other validation and limitations

`node --test tests/reader-resize.test.mjs`: **4/4 pass**, no skips. This covers release coordinates, ownership by one pointer, cancellation/cleanup and keyboard/overlay resize behavior. `git diff --check` passes.

The complete public-dist static scanner, with the existing scope and gates, reports **1 FAIL / 0 REFLEX / 30 WARN / 44 files** before the integration rebuild. Its sole failure is gate 56 in the stale `dist/market-lab/app/assets/index-79EgkHss.css`. There are no new reader failures or reflexes; the reader file retains two existing F7 finish warnings. [Raw unchanged-scope static receipt](hallmark-current-unbundled.json). No checker rule, severity, exclusion, waiver or runtime target was weakened. This interim scan is not a final repository-wide PASS.

Intermediate receipts are retained: `after-1` exposed a test input placement that opened the export menu below the viewport; the helper now uses native wheel input to make room for the actual menu. `after-2` and `mobile-path-diagnostic` exposed the real mobile geometry failure. `after-3` passed after the mobile fix. `final-after` reran all four cases after the final percentage-width refinement. `final-width-after` is the final run, additionally asserting exact document, body, workspace and main width preservation in the shared regression helper. None of those failed receipts was overwritten.

The final source handoff verifies all 10 native-measured source files and the previous loading lane's **25 frozen files** against their recorded SHA-256 values. Rebuild, remote CI, full 49-case execution, final Hallmark rendering, commit, PR and deployment remain with the integration owner.

