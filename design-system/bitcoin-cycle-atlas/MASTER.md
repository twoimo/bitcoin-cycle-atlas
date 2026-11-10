# Bitcoin Cycle Atlas — chart workbench

## Current direction

v1.36.0, requested on 2026-11-07 (Asia/Seoul). The current user direction
supersedes the v1.33/v1.34 warm editorial palette and the 64px labelled right
rail. Use the observed TradingView chart perimeter, neutral dark surfaces,
compact controls, and a narrow icon rail. Preserve the authored Atlas routes,
actual data, calculations, immutable records, replay and ztd-charts.

The latest follow-up merges every supported instrument into one 가격 차트
destination. The current main retains 가격 차트, 시장 분석, 리서치, 자산 비교
and 공모주 in that order, followed by 릴레이 콘텐츠 at `/?page=relay`.
Symbol search selects BTC, ETH, MSTR, BMNR, the three
ETFs, HYPE and the four housing regions. Returning from another destination
retains the last chart and its source-specific controls. All instruments use
the same four perimeter regions and full-height chart layout. Actual source
capabilities determine intervals, OHLC, units, volume and analysis features;
housing remains monthly and HYPE remains quoted in USDC.

Only these requested design skills supply the design workflow:

- [UI/UX Pro Max](https://github.com/nextlevelbuilder/ui-ux-pro-max-skill/tree/b7d5353e0130feb8c5574ef1251f8a1db1873ccb),
  canonical `.claude/skills/ui-ux-pro-max/SKILL.md`, plus `pro-rules.md` and
  `quick-reference.md`, actually read at the pinned current upstream revision.
- [clone-website](https://github.com/JCodesMore/ai-website-cloner-template/tree/ee3f5a2f31fd549b9593fa4f7cf6d2955ee593bb),
  canonical `.agents/skills/clone-website/SKILL.md` and its
  `references/inspection-guide.md`, actually read. Apply Map → Observe → Build
  → Compare in this existing application. Its Next.js starter is not a
  requirement to replace Atlas or its authored routes.

UI/UX Pro Max's `trading chart terminal dark` system search was an irrelevant
Coding Bootcamp match and was rejected. The single permitted retry, `trading
platform dashboard`, matched Financial Dashboard, but its Enterprise Gateway
sales-page layout was also rejected. Adopt functional alignment, restrained
rendering, legible states and keyboard access. Actual source measurements own
geometry and appearance. `focus not obscured --domain ux`, `financial price
candlestick --domain chart`, and `aria accessibility --stack react` returned
applicable focus, OHLC semantics and accessible-control guidance. Neither a
search recommendation nor a style change can invent real-time observations.
The native/mobile pro-rules are not desktop-web size requirements.

## Observed reference

On 2026-11-07, the live [TradingView chart](https://www.tradingview.com/chart/)
was observed at 1363 × 936 CSS pixels. The closed/open right rail, symbol
search and keyboard dismissal were inspected. Measurements came from visible
DOM rectangles and computed styles, alongside actual screenshots.

| Element | Observed reference | Atlas implementation |
| --- | --- | --- |
| Left tool region | 52px, followed by 4px gutter | 52px tools + 4px gutter |
| Top controls | 38px, followed by 4px gutter | One original outer row, 38px + 4px |
| Right closed rail | 45px; buttons 44 × 44px, 2px gaps | 45px; Korean-labelled icon controls 44 × 44px |
| Bottom range row | 38px, plus 1px chart separator | 38px; original periods, clock and scale actions |
| Symbol trigger | 128 × 28px, 14px radius | Existing real search trigger, same compact shape |
| Symbol search | 840 × 680px maximum, 20px radius, 16px input | Existing native dialog/list, same desktop bounds |
| Toolbar font | system / Trebuchet MS / Roboto / Ubuntu, 14px | Portable system-ui first, followed by the observed stack and Korean Sans fallbacks |
| Chrome | #000000 | #000000 |
| Gutters | #222222 | #222222 |
| Ordinary UI text | #b8b8b8 | #b8b8b8 supporting text, #dbdbdb main text |
| Hover | #303030 | #303030 |

The reference session's chart canvas was a saved white canvas inside dark
chrome. Atlas retains its dark chart canvas and its labelled observed,
conditional, pending and reconstructed series. Atlas-specific models,
research, calendar and ledgers have no identical TradingView feature. They
use the measured shared primitives without inventing trading, account or
subscription controls. Do not claim unmeasured pixel identity.

The available cloud viewport did not expose a resize API. Desktop source
measurement is one documented viewport, not a fabricated mobile reference.
Existing real Chrome mobile/tablet cases cover Atlas responsive behavior.

## Shared visual roles

| Role | Value |
| --- | --- |
| Canvas `--bg` | #0f0f0f |
| Chrome `--sidebar` | #000000 |
| Surface `--surface` | #191919 |
| Raised / gutter | #222222 |
| Hover / current destination | #303030 |
| Main rule / quiet rule | #333333 / #242424 |
| Strong control boundary | #555555 |
| Main / supporting / secondary text | #dbdbdb / #b8b8b8 / #949494 |
| UI action fill `--ui-primary` | #2962ff, white text |
| UI link / focus | #90b2ff |
| Existing financial accent | #d8b56d, preserved independently of UI action blue |

Use 12–14px controls and data, 14–16px panel titles, and 20–24px principal
readings. Use the portable system-ui family first, then the observed platform
stack and Korean Sans families. The first native Chrome screenshots exposed
serif Latin substitution when optional web fonts were unavailable; naming
Noto Sans CJK KR at the end of the stack alone did not change the rendered
glyphs. Prefer the platform's actual UI font before legacy aliases. This uses
existing fonts, without a new request.
Use the system font and tabular figures for financial values; retain
monospace for source identifiers and code. Do not add a font request. Keep
gain/loss and named series colors, numeric definitions and source clocks.

Desktop controls have compact real hit areas; hosted asset actions retain
at least 32 × 32px. Windows up to 760px and coarse-pointer viewports retain
44px primary controls with a 48px outer row, including wide landscape tablets.
The 38px measured desktop density cannot clip those controls.
Only dialogs use larger rounding; the plot, tables and sections use rules.

## Source-to-Atlas map and ownership

| Source region or state | Atlas route/state | Source owner |
| --- | --- | --- |
| Chart perimeter | `/`, every consolidated center workspace | `dist/editorial-system.css`, `atlas-shell.js` |
| Symbol search / interval | Existing shared search and real interval select | Original selector/chrome owners, shared CSS |
| Chart / readouts | Market US/KR, RSI, housing, themes | Existing renderers and `editorial-panels.css` |
| Watchlist / detailed readings | Asset comparison and its source dialogs | `editorial-ledgers.css`, original ledger owners |
| Calendar / lists | IPO table/calendar, research index | `editorial-ledgers.css`, original handlers |
| Reading pane | Research reader, calculation/source disclosures | Existing dialogs, compact shared text hierarchy |

The original icon nodes retain their meaning and Korean accessible names.
Pointer and keyboard focus reveal a body-level tooltip which cannot be clipped
by rail scrolling. Escape, blur and navigation dismiss it. Pointer scrolling
dismisses it; keyboard-induced scrolling keeps it beside the focused control. Preserve
all six destinations, active destination state and mobile navigation.

The interval select already dispatches the same command and synchronizes the
original eight choices and `aria-pressed` states. Use it on desktop as well as
mobile to recover toolbar space. Keep the original button nodes/state for
other workbench consumers. Native verification uses actual keyboard selection
and still requires rejected unavailable intraday requests to restore daily.

## Functional and responsive boundaries

- Keep all four perimeter regions and one actual outer control row. Never
  restore the duplicate inner toolbar.
- Keep each existing scroll owner, sticky identifiers, headers, native wheel,
  touch and keyboard scrolling. Scrollbar paint stays hidden by user request.
- Keep real loading, empty, error and populated states. No sample prices or
  invented financial placeholders. Preserve local Skullet and vendor notices.
- Keep visible close actions, Escape and focus return for dialogs, including
  short viewports. Search options must remain visible during keyboard movement.
- Preserve numeric inputs, calculations, output units, route state, source
  disclosures, stored records, historical bytes and replay boundaries.
- Source observations, finance data and rendered verification evidence are
  separate facts. A source screenshot is not an implementation.

## Verification

Run the existing production build, source/data checks, panel tests and native
Chrome interaction suite. Review rendered desktop, phone, short and landscape
tablet screens for geometry, clipping, focus, actual scrolling and controls.
Record the source commit/tree, viewport/state and failures. A skipped screen,
failed browser or missing image does not count as verified. Keep the existing
model-review and release conditions independent of visual verification.

Compare the actual source and Atlas at the same viewport and state when that
state corresponds. Record Atlas-specific adaptations and any remaining gaps.
The final release record must cite the new source's own checks and deployment;
prior release results remain historical evidence.

## 2026-11-10 launch cleanup — flat shell chrome

Scope: `dist/atlas-shell.css` and `dist/styles.css` only (dashboard shell and
base stylesheet). No application, chart, price-axis or CI file was edited.

Observed defects in the rendered local build, then corrected:

- Dashboard navigation rows inherited `justify-content:center` from the narrow
  icon-rail stylesheet, so every destination label sat in the middle of a
  224px column with a different left edge. Rows now share one left edge
  (`justify-content:flex-start`), 32px height, 1px list gap, 2px corner.
- The destination rows, ledger shells, market cards and score cards used 7–10px
  radii, reading as stacked cards. Tables, sections and cards are now square
  and separated by the existing hairlines; only dialogs keep rounding.
- The dashboard header was a 64px two-line hero (17px tracked title plus a
  second-line sentence). It is now a single 48px row: 13px title and the same
  basis sentence inline at 11px, muted, ellipsised. On phones the sentence is
  dropped and the title alone remains.
- `body :is(#outlook-view,…) p` set `font-size:max(12px,1em)` and was also
  catching the chart page's context block, forcing 13px/20.8px there. That
  selector now excludes `.atlas-page-description`, so page-context chrome keeps
  its 11px/14px while prose keeps its reading size. The 320px context block
  drops from 69px to 55px without losing text.
- Removed the last decorative gradient (`reading-card`), the oversized
  `--shadow` blur is no longer painted anywhere measured, and the brand mark no
  longer rotates.

Preserved and re-verified: four chart perimeter regions, the narrow 44/45px
rail geometry, the 390px two-row disclosure contract (`44px 44px` rows,
`minmax(80px,1fr) 56px repeat(4,44px)` columns), 44px coarse-pointer controls,
semantic gain/loss and 12 series colours, real toolbar handlers, independent
scroll owners and native accessibility names.

Verified by serving this worktree's `dist/` and inspecting real Chrome renders
at 1440×900, 900×800, 390×844 and 320×740 for 가격 차트, 자산 비교, 공모주 and
릴레이 콘텐츠. `tests/shell-flat-chrome.test.mjs` (new, dependency-free) guards
the flattening and the mobile disclosure contract; `tests/daily-data-view`,
`tests/boot-shell`, `tests/ipo-*`, `tests/static-module-references` and
`tests/cloudflare-artifact` pass on this tree.

Not verified here and still open: the market-lab React route needs its API, so
only its error state was reachable from a static server; chart annotation label
collisions at 320–390px and the chart legend/indicator chips belong to
`cycle-milestones.css`, `chart-legend.css` and `analysis-dock.css`; the
production build could not run on this host (rolldown native module blocked by
macOS policy), so no build or deployment claim is made.

## 2026-11-10 launch cleanup — relay, data filters and chart panels

Second unit, same branch, expanded scope granted after the first review:
`dist/relay-room.css`, `dist/daily-data.css`, `dist/ui/chart-legend.css`,
`dist/analysis-dock.css`. Data series, model maths, circular status dots and
semantic price/judgment colours were not touched.

- Relay reader: the message bubble dropped its tailed `12px 12px 12px 4px`
  chat shape, room rows, count badges, refresh button, page chips, edition
  chips, the sticky date chip, the media foot overlay and the paper stage all
  moved to 2px; the media thumbnails keep square frames. The date divider's
  fade gradient was replaced by the pane's own surface colour, so the sticky
  band is invisible against the thread, and the 0 1px 6px drop shadow and the
  2px backdrop blur were removed. Status dots stay circular.
- Data page: the filter row keeps native horizontal scrolling but now owns
  `scroll-snap-type:x proximity` with `scroll-snap-align:start` per control,
  `overscroll-behavior-x:contain`, `touch-action:pan-x pinch-zoom` and
  `scroll-padding-inline`, so a swipe lands on a control edge and the gesture
  cannot chain to the page. Measured at 390px: client 338px, scroll 692px,
  reachable to `scrollLeft 354` with the reset control fully visible.
- Chart legend dock: the chip row and its `+N` affordance moved from 4px to
  2px; line samples, series colours and the entry typography are unchanged.
- Indicator dock: the floating indicator window, the countdown HUD, list rows,
  the template row and the grouped fieldset moved to 2px; controls were
  normalised from 5/6px to the shared 4px control radius; dialogs stay at 8px.

Verification for this unit: every touched file parses with no dropped rules
(CSSOM rule count equals source block count: atlas-shell 328, styles 527,
relay-room 224, daily-data 309, chart-legend 42, analysis-dock 236), and
`tests/shell-flat-chrome.test.mjs` grew to 9 tests covering pills, shadows,
blur, gradients, circular dots and the filter row's scroll contract.

Correction to the previous note: `market-lab` is not API-only. It is a
generated static page under `market-lab/` that boots through
`meta[name=atlas-static-entry]` and needs the deployed root prefix
(`/bitcoin-cycle-atlas/`). Served at that prefix it renders real S&P 500 data
with no failed requests; the earlier "HTTP 404" banner came from serving it at
`/`, where the boot script rewrote the URL to a missing prefixed path.
