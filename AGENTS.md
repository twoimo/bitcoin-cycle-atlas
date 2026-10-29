# Project editing guide

Read [design.md](design.md) before changing a user-facing screen. Atlas is a dense Korean financial research workbench with a full-height dark canvas, a single primary toolbar row and independent scroll areas for tables and dialogs.

## Hallmark across the app

The project's design checks are pinned to [Hallmark v2.0.0 at 7ec8682](https://github.com/Nutlope/hallmark/tree/7ec868225c6caa040558c321ee0fefa0e73f83a8). Use its **app** scope for all routes and tools. The existing financial workbench supplies the visual system; retain the price-series semantics and working controls.

- Reuse the shared type, surface, text, state and focus tokens. Component paint tokens live in `dist/styles.css`; the first-paint boot shell and standalone preview keep the small token sets needed to work independently.
- Keep viewport ownership, dynamic-height behavior, sticky headers and asset identity columns. The 18-asset board keeps BTC first and displays its current Korean name, 비트코인.
- Preserve every route, input, event handler and source disclosure. Make link labels describe the actual destination.
- Cover the app's implemented loading, empty, error and populated states. Use native keyboard and pointer behavior when checking menus and dialogs. Visible focus and a visible close action must survive internal scrolling and short viewports.
- Treat chart axes, observed values, forecasts, pending outcomes and source clocks as product data. Style work cannot invent, relabel or silently discard those values.

## Verification

The Hallmark design workflow runs the pinned upstream checker against the complete `dist` surface and the eight declared page routes, with preserved before/after inputs. The explicit `dist` argument matters: the upstream directory walker skips a nested build directory.

The ETH/model evidence workflow also runs `scripts/verify-eth-candidate-browser.mjs`, including the additional shared-workspace cases from `scripts/verify-workspace-browser.mjs`. The native-browser checks cover interaction states that a URL-only screenshot cannot reach.

Read the actual findings, source identities and render receipt. Missing Chrome, a skipped render, an internal checker exception or an untested target cannot count as a pass. Keep upstream findings intact when explaining a context-specific false positive. Retain the existing numerical, immutable-record and formal lifecycle checks for changes that affect their covered modules.

Design verification does not replace the separately recorded model-review and release conditions in [docs/ETH_REMAINING_CONDITIONS.md](docs/ETH_REMAINING_CONDITIONS.md).
