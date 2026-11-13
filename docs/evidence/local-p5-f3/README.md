# Local R19 P5 F3 + Q-P1c-B-2

Implementation based on `513d8183b14a73284d4ce1dacf89bd3ded431bdb` in a detached worktree. Scope is typography CSS, its generated stylesheet bundles, the dedicated `r19-p5-f3` verifier/regression test, and this evidence folder. No JS product code, data, the four protected contracts, `dist/price-axis.js`, shared checklist, requirements, remote push, main, or deployment was changed.

## Changes

- Visible page descriptions are 12px with 1.4 line-height and Korean word-boundary wrapping.
- The targeted 9–10px body/metadata declarations were raised to 11px. The only retained 10px declaration in the reviewed stylesheet scan is the RSI crossing axis label; the chart annotation and evidence labels were raised to 11px. Exact small-type declarations remain semantic, not a universal `*` reset.
- Conference page-status badges retain their wording, have a 12px minimum, `word-break: keep-all`, and `overflow-wrap: break-word`. Captions and notices use 1.4 line-height.
- Edited authored CSS sources and regenerated the two corresponding CSS bundles with `scripts/build-site-styles.mjs`; generated check passes.

## Native Chrome results

`native-chrome/report.json` records **24/24** rendered cases: chart, relay, and conference × light/dark × 320/390/768/1440. All have zero horizontal overflow, zero measured visible non-axis text below 11px, zero body/caption text below 12px, and zero body/caption line-height below 1.4. Conference at 320 in both themes records the badge with `splitWord:false`, font >=12px, keep-all and break-word.

Screenshots are in `native-chrome/`. The current chart route's shell boots, but the chart displayed its refresh/loading notice rather than completed candles. The report therefore contains no visible axis samples (`axisContrastStatus.status: unobserved`); axis contrast is **not passed or claimed**, and `qualifiesF3Typography` is false. Keyboard focus was observed in 24/24 cases on a visible 2px ring. The verifier records axis contrast if axis labels render and fails any measured sample under 4.5:1. The report includes SHA-256 hashes for the checked CSS, bundles, test and harness.

The baseline run used the same Chrome/CDP approach at the specified source. `baseline-summary.json` summarizes the 24 successful chart/relay/conference cases; `baseline-native/` retains all 24 screenshots and the single-case report. The separate market route remained blocked before `data-boot=ready`, so it is excluded, not counted as passed.

## Five-axis QA status

| Axis | Status | Evidence / limit |
|---|---|---|
| Functional | Partial pass | 24/24 requested shell routes booted, loaded native theme and completed capture; no product data/action behavior was tested. |
| Visual | Pass for bounded scope | 24 screenshots; horizontal overflow 0 across all sampled widths/themes; typography floors pass. |
| Accessibility | Partial | Keyboard Tab focus ring 2px solid observed in 24/24; prose floors pass. Axis contrast unobserved because the BTC chart was still in refresh/loading state; therefore the axis-contrast criterion is not passed. |
| Performance | Not run | This sweep is not A-9; the 2,500ms threshold was neither measured nor relaxed. |
| Consistency | Pass for CSS scope | 43 source stylesheets; regenerated bundles match `build-site-styles.mjs --check`; no global font reset, typography scope limited to authored classes. |

Focused unit regression and native report are dedicated to F3. They do not qualify F1/F2/F4, media playback, chart data, A-9, P5 overall, release, or deployment.
