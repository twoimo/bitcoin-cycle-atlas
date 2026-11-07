# Project editing guide

Read [design.md](design.md) before changing a user-facing screen. Atlas is a dense Korean financial research workbench with a full-height dark canvas, a single primary toolbar row and independent scroll areas for tables and dialogs.

## Design references

The current visual direction uses only the user-requested [UI/UX Pro Max](https://github.com/nextlevelbuilder/ui-ux-pro-max-skill) and the [clone-website skill](https://github.com/JCodesMore/ai-website-cloner-template/tree/master/.agents/skills/clone-website). Read the selected revisions and decisions in [the design master](design-system/bitcoin-cycle-atlas/MASTER.md). Observe the real TradingView interface, measure its layout and compare the implementation at the same viewport and state. Restore the narrow right icon rail while retaining accessible names and actual controls. Earlier dated plans, release notes and audit receipts document their own revisions; they do not introduce current design tools or release gates.

## Preserved product contracts

- Reuse the shared type, surface, text, state and focus tokens. Component paint tokens live in `dist/styles.css`; the first-paint boot shell and standalone preview keep the small token sets needed to work independently.
- Keep viewport ownership, dynamic-height behavior, sticky headers and asset identity columns. The current 20-asset board keeps BTC first and displays its current Korean name, 비트코인. ETH is quoted in USD and HYPE in USDC; preserve the original 18-asset historical records.
- Preserve every route, input, event handler and source disclosure. Make link labels describe the actual destination.
- Cover the app's implemented loading, empty, error and populated states. Use native keyboard and pointer behavior when checking menus and dialogs. Visible focus and a visible close action must survive internal scrolling and short viewports.
- Treat chart axes, observed values, forecasts, pending outcomes and source clocks as product data. Style work cannot invent, relabel or silently discard those values.

## Verification

Inspect the actual full shell and standalone routes, including desktop and narrow viewports, menus, search, dialogs and readers. Capture the real outer toolbar and active child chart or table after their content is ready. Compare reference and implementation geometry, typography, colors and interaction states; record unobserved states and remaining differences without claiming an unchecked exact match.

The ETH/model evidence workflow also runs `scripts/verify-eth-candidate-browser.mjs`, including the additional shared-workspace cases from `scripts/verify-workspace-browser.mjs`. The native-browser checks cover interaction states that a URL-only screenshot cannot reach.

Read the actual test results, source identities and browser receipt. Missing Chrome, a skipped render, an execution exception or an untested target cannot count as a pass. Retain the existing numerical, immutable-record and formal lifecycle checks for changes that affect their covered modules, and verify the production build and generated resources.

Design verification does not replace the separately recorded model-review and release conditions in [docs/ETH_REMAINING_CONDITIONS.md](docs/ETH_REMAINING_CONDITIONS.md).
