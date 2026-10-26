# Shared chart theme verification

Review date: **2026-10-26**. The comparison workspace now uses the existing chart palette and compact toolbar. The review preserves the existing 18 assets, BTC-first ordering, numerical meanings, reading dialog, judgment explanations, historical reconstruction, and saved snapshots.

## Results

- **36 / 36** comparison and judgment-history Node tests passed: [unit-tests.log](unit-tests.log).
- **23 / 23** existing interface scenarios passed: [interface.json](interface.json).
- **5 / 5** additional comparison journeys passed: [comparison/interface.json](comparison/interface.json).
- No page-level overflow, uncaught browser error, missing local resource, overlapping toolbar item, pinned-column misalignment, or history focus-return failure was observed in these runs.
- Chromium version: **156.0.8078.47**. External requests, including market APIs and remote fonts, were blocked. The project snapshots supplied the data, and the existing local Noto Sans KR font configuration supplied Korean glyphs.

The two existing presentation tests that required the former rail-board HEX colors were updated to require the shared chart tokens, neutral asset symbols, and meaningful return/judgment colors. The tests for numerical data, row order, accessibility labels, minimum mobile control heights, pinned headings, and column geometry remain in place.

## Measured comparison layouts

| Viewport | Input emulation | Heading height | First data-row height | Narrow toolbar button size | Document size |
| --- | --- | ---: | ---: | --- | --- |
| 320 × 740 | Touch | 53 px | 53 px | 32 × 44 px | 320 × 740 |
| 390 × 844 | Touch | 53 px | 53 px | 32 × 44 px | 390 × 844 |
| 768 × 1024 | Touch | 55 px | 53 px | 44 px high; labeled actions retain their content width | 768 × 1024 |
| 1024 × 768 | Touch | 55 px | 53 px | 44 px high; labeled actions retain their content width | 1024 × 768 |
| 1440 × 900 | Pointer | 46 px | 40 px | 32 px high | 1440 × 900 |

The narrow header buttons are **32 × 44 px**, not 44 × 44 px. This keeps the return control, title, and all four actions visible in one line. The touch row's final measured height is **53 px**: its content and padding exceed the stylesheet's nominal 48 px minimum. Desktop rows measure **40 px**.

The internal table scrollport owns both axes. Each dedicated case checks the pinned identity heading against the BTC identity cell at the start, middle, and end of horizontal scrolling, then checks the heading while scrolling vertically. At the horizontal end on phones, the complete identity, year-to-date return, and judgment columns remain visible together. Rows remain accessible through vertical scrolling.

## Judgment-history journeys

Each of the five dedicated cases:

1. Opens the existing judgment-history dialog and verifies 18 reconstructed asset entries with BTC first.
2. Checks that the dialog fits the viewport without internal horizontal overflow.
3. Moves the judgment date from **2026-10-26 to 2026-10-25** through the previous-day control and verifies the displayed date.
4. Opens the actual saved-snapshot tab and verifies 18 saved rows and the explicit distinction from reconstructed history.
5. Closes the dialog and verifies that keyboard focus returns to `#asset-history-open` and that the comparison retains the same 18 rows.

The history dialog retains its explanatory text and controls. At 320 px, inspecting the timeline and saved asset rows requires scrolling within that bounded dialog. No extra summary, page footer, or filtering feature was introduced.

## Captures reviewed

The dedicated directory retains all five widths at the initial table position, horizontal end, reconstructed history, and saved history. Representative reading-dialog captures are included at 320 px and 1440 px. A landscape comparison capture from the full suite is retained as an additional short-viewport check.

Representative files:

- [320 px comparison](comparison/comparison-phone320.png)
- [320 px horizontal end](comparison/comparison-phone320-table-end.png)
- [320 px reconstructed history](comparison/comparison-phone320-history-reconstructed.png)
- [320 px saved history](comparison/comparison-phone320-history-saved.png)
- [320 px reading dialog](comparison/comparison-phone320-reading-method.png)
- [390 px comparison](comparison/comparison-phone390.png)
- [768 px comparison](comparison/comparison-tablet768.png)
- [1024 px horizontal end](comparison/comparison-tablet1024-table-end.png)
- [1440 px comparison](comparison/comparison-desktop1440.png)
- [1440 px reading dialog](comparison/comparison-desktop1440-reading-method.png)
- [844 × 390 landscape comparison](data-landscape.png)

All final captures use the Korean font configuration. The initial exploratory captures without that configuration showed missing Korean glyphs and were replaced; this was an audit-environment issue rather than an application change. Representative retained captures were opened and visually inspected, including every viewport width, the narrow table end, reading dialogs, and both history modes. Duplicate full-suite screenshots are kept as intermediate artifacts in `build/interface-theme-full/`; the full execution JSON remains here.

## Reproduction

Provide Playwright, Chromium, and a Korean fallback font. The environment used here:

```bash
export FONTCONFIG_FILE=/tmp/atlas-statechart-fonts/fonts.conf
export ATLAS_PLAYWRIGHT_MODULE=/opt/codex/runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs
export ATLAS_BROWSER_PATH=/tmp/bca-chrome/chrome-headless-shell-linux64/chrome-headless-shell

node --test tests/daily-data-view.test.mjs tests/asset-judgment-history-view.test.mjs
node scripts/audit-interface.mjs . build/interface-theme-full
node scripts/audit-interface.mjs . docs/evolution-2026-10-26/ui/tradingview-theme/comparison --comparison-theme
```

The dedicated mode uses the user's comparison-page query, including the existing indicator URL parameters. Both JSON receipts include exact source hashes. The runner verifies errors and missing resources both before and after interactions. These are headless Chromium checks with touch emulation; they do not claim physical-device or Safari/iOS verification.
