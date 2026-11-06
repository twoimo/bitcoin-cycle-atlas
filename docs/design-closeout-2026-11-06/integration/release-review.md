# PR 62 release review — 2026-11-06

**Verdict: PASS_WITH_NOTES.** No concrete product regression or merge blocker was found within the bounded runtime review. The follow-up replay fixture change corrects a demonstrated completion-budget defect while preserving the observation and cadence assertions.

## Scope and source identities

| Review boundary | Identity |
| --- | --- |
| Product comparison base | `59ec6f4f708e87d73dad6324d925a9e01383411c` |
| Frozen product source reviewed | `027d84914a8fb0d1c4034eda70eec8a0c42dd22d` |
| Equivalent remote source | `6cb6aa5d45bb2b66ef27d578785aa47571278137` |
| Shared tree of the frozen and remote sources | `feddc55e0f7d44fc8cf23e4a9a8311608ba83147` |
| Fixture follow-up reviewed | `027d84914a8fb0d1c4034eda70eec8a0c42dd22d` → `5ddc2175764b8cad383c04ad9ff2940bab1689e6` |
| Follow-up tree | `1d83a6f825e70d7d5386135dc1f01c93a30358ff` |

The product review covered the changed dialog arbitration, analysis-document caching, reader focus restoration, and loading-surface lifecycle/geometry code, using the repository's AGENTS and design constraints. The follow-up delta changes only `scripts/verify-chart-replay-browser.mjs`; product source is unchanged. This was a read-only code review: no product or test edits and no test suites were performed by the reviewer. This document is the review artifact.

## Runtime findings

- [`chart-navigation.js`](../../../dist/chart-navigation.js), `interactive()`: a nested dialog inside the chart owns its input. An ancestor dialog containing the chart, or the chart element itself carrying a dialog role, does not suppress plot interaction. No concrete regression was found in the affected pointer, wheel, double-click, context-menu, or keyboard paths.
- [`lab-view.js`](../../../dist/lab-view.js), `drawStructure()`, `renderPeriods()`, `prepareStructureScrollRegions()`: cached static documents use the analysis identity, and pagination also keys on period, scope, and page. Dataset replacement and threshold changes invalidate analysis. The new observer watches child-list changes while its callback updates attributes, avoiding a mutation feedback loop.
- [`viewport-workspace.js`](../../../dist/viewport-workspace.js), `rememberOpener()` / `restoreOpener()`: an opener inside a transient menu resolves to the persistent menu trigger. Existing restoration fallbacks remain available when that target is unavailable.
- [`loading-surfaces.js`](../../../dist/loading-surfaces.js), `enhanceSkeleton()`, `observeRsiLayout()`, `setLoadingSurface()`: disposal is idempotent, disconnects resize/Reveal resources, cancels descendant animations, and removes the skeleton. The current-root identity guard prevents stale disposal from clearing a newer mount. RSI placeholder measurements use the shared chart geometry.

## Replay fixture follow-up

In [`measureCadence()`](../../../scripts/verify-chart-replay-browser.mjs), each speed now computes its completion budget once, before playback:

```text
ceil(initial.lastIndex × expected interval × 1.3) + 5,000 ms
```

The budget follows the actual source transition count and uses the existing maximum mean-cadence ratio with a fixed scheduling allowance. The unchanged [`until()`](../../../scripts/verify-eth-candidate-browser.mjs) creates one deadline per call; polling does not extend it. With 16 transitions at the 0.3× interval of 3,000 ms, the new budget is **67,400 ms**.

The diff preserves the exact observation-count assertion, the complete ordered source-date comparison, the minimum interval-sample assertion, all four requested speed/interval pairs, and the **0.85–1.3** mean-interval bounds. Extracting those two bounds into `allowedMeanRatio` is semantically unchanged. Measured observations and intervals remain in the receipt; the computed budget and 5,000 ms allowance are now recorded as well. No private replay state, application timers, source data, or clock behavior is modified.

The preserved [terminal diagnostic](../browser/final/cadence-terminal-observation.json) identifies frozen source `027d84914a8fb0d1c4034eda70eec8a0c42dd22d`. At approximately 45.079 seconds it records index 15, **2026-11-04**, still playing; at approximately 47.892 seconds after the post-click snapshot it records index 16, **2026-11-05**, ended. All **16 expected dates match exactly**, and the measured inter-update mean is **3,000.080 ms**. The report records no changed sources or runtime errors. These observations support the deadline diagnosis: the original 45,000 ms limit was shorter than the nominal **16 × 3,000 = 48,000 ms** full playback duration.

## Review limits

This verdict concerns the inspected source and fixture delta. The terminal diagnostic establishes the cause and eventual completion of the preserved replay timeout; it does not replace a required gate rerun. Native, CI, and Hallmark outcomes remain governed by their separate receipts, including any retained local failure. This review makes no claim that every local gate passed.
