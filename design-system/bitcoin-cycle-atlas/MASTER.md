# Bitcoin Cycle Atlas — editorial workbench

## Scope and source

This is the v1.33.0 visual system requested on 2026-11-07 (Asia/Seoul).
It applies to the chart shell, unified market and instrument workspaces,
asset comparison, IPO, research and their readers. It does not change the
financial model, published observations, ledgers, replay or chart vendors.

The requested `nextlevelbuilder/ui-ux-pro-max-skill` was read and applied at
upstream commit `b7d5353e0130feb8c5574ef1251f8a1db1873ccb`.
Read: `SKILL.md`, `references/pro-rules.md`, and
`references/quick-reference.md`. The design-system search used
`financial analytics dashboard dense`, then the permitted narrower retry
`trading platform dashboard`, both with density 9 and variance 2.

The React stack query `dashboard data tables` returned no matches. The single
retry `useEffect cleanup` returned effect cleanup and avoiding unnecessary
effects guidance. The viewport observer follows those lifecycle rules; no new
derived-data effect or search behavior was introduced.

Both design-system searches recommend **Minimalism & Swiss Style** for professional
dashboards: a functional grid, clear hierarchy, low-cost rendering, restrained
effects, visible keyboard focus and accessible contrast. These recommendations
fit this product and are adopted. The returned **Enterprise Gateway** layout
(sales CTA, marketing hero, client logos) does not fit an existing financial
workbench and is rejected after the retry. The existing chart perimeter and
single outer toolbar remain the layout source of truth. Generic palette and
Latin font suggestions are adapted to Atlas's Bitcoin identity and Korean UI;
there is no new external font request or animation dependency.

## Character

A quiet, precise financial desk: warm ink, paper-colored text, and a restrained
brass accent. Organize information with alignment, typographic scale and rules.
Charts, ledger rows and article text carry the screen. Avoid marketing headings,
decorative cards, pill collections, gradients, glass effects and visual filler.

### Surfaces and roles

| Role | Value | Use |
| --- | --- | --- |
| Canvas `--bg` | `#111210` | Chart canvas and main work area |
| Navigation `--sidebar` | `#151613` | Perimeter tools and navigation |
| Surface `--surface` | `#191b17` | Tables and ordinary panel surfaces |
| Raised `--surface-raised` | `#22251f` | Menus, controls and dialogs |
| Hover `--surface-hover` | `#2b2f27` | Pointer and keyboard selection |
| Rule `--border` | `#3a3e34` | Structure and control boundaries |
| Quiet rule `--border-soft` | `#2a2e26` | Row and section separators |
| Text `--text` | `#edece5` | Primary readable content |
| Muted `--muted` | `#b9bdb0` | Labels and supporting information |
| Subtle `--subtle` | `#989f8e` | Secondary metadata, never hidden facts |
| Accent `--accent` | `#d8b56d` | Active location and primary emphasis |
| Focus `--focus` | `#e8c990` | A visible, inset keyboard focus ring |

Preserve existing green/red and chart-series semantic mappings. Do not
recalculate, recolor or reclassify a financial signal to fit the palette.
Use real contrast measurements for actual rendered foreground/background pairs.
Status still has text, shape or signed values in addition to color.

### Type and spacing

- Keep the existing Inter / Noto Sans KR stack and system fallback. The existing
  optional font stylesheet remains optional; add no new font network dependency.
  Browser QA uses the repository's source-pinned Korean font. Use tabular
  numerals for data and prices.
- Dense data: 12–13px. Secondary metadata: 11–12px with sufficient contrast.
  Ordinary prose: 14–15px, line-height 1.65–1.8. Numeric readouts: 24–36px.
- Headings use weight and baseline alignment, not oversized uppercase labels.
  Korean prose uses normal letter spacing and sensible line wrapping.
- Follow a 4px rhythm. Rules and deliberate gaps separate sections. The
  ordinary panel radius is 0–3px, input/menu radius 3–4px, dialog radius 6px.
- No ornamental background patterns, decorative drop shadows or fixed-height
  empty hero areas. A restrained shadow is allowed for floating menus/dialogs.

## Layout decisions by workspace

| Area | Treatment | Preserved contract |
| --- | --- | --- |
| Chart perimeter | Flat ink tools, slim active markers, consistent controls | Existing top/left/right/bottom regions and viewport dimensions |
| Outer toolbar | Controls grouped by thin separators; understated selected state | One actual outer row, 44px desktop / 48px mobile; original portaled controls |
| Market US/KR | Three aligned reading columns; values dominate; section rules | Three independent axes, source clocks, observed/forecast/pending meaning |
| Conditions and cash flow | Legible form groups and aligned result columns | Every input, assumption, calculator, scenario and output |
| RSI/housing/themes | Chart-first, flat supporting readings and consistent search | Shared symbol state, lookup placement, native controls and ztd charts |
| Asset comparison | Calm ledger grid, strong identifier column, aligned numerals | All assets, sectors, exact values, sorting, sticky header/first column |
| IPO | Calendar/table with clear date hierarchy and restrained status marks | One toolbar, every filter and view, native scrolling and details |
| Research | A compact index and comfortable document reader | Filters, evidence/source access, full text, reader focus restoration |
| Dialogs/menus | Solid surfaces, clear title/action bands, coherent focus | Escape, close, focus return, resize behavior and scroll containment |

## Responsive and interaction rules

- Keep the complete workbench at one viewport height. Each existing scroll
  region continues to work by mouse, touch and keyboard; scrollbar paint stays
  hidden as requested. Existing wide financial tables may scroll horizontally.
- Never restore an internal toolbar that was moved to the outer shell.
- Use the established narrow-screen breakpoints. Maintain mobile 44px close
  and principal pointer targets; do not apply web pixel values as native units.
- Allow prose and long source identifiers to wrap. Keep data labels available
  through their existing disclosures. Do not hide real data to reduce density.
- Hover, active, disabled and focus states must be distinguishable. Color
  feedback may transition briefly; layout and financial results do not animate.
- Respect reduced motion; preserve the existing loading, error, empty and
  populated state contracts and original local Skullet loader.

## Verification and change boundary

Use original tests and Hallmark without changing rules, baselines, thresholds,
input data or screen inventories. Review actual full shell and standalone pages,
desktop and narrow viewports, charts, tables, readers and menus. Inspect real
screenshots for hierarchy, clipping, focus visibility and control placement.

The inherited warning baseline is static 32, original render 10 and integrated
render 2. The shared static set is counted once. These are inspection findings,
not a target to optimize by weakening a checker. A new result must be described
using its actual run and evidence, not copied from the old release.

Preserve the 2026-11-07 main data refresh at
`5704a96e787e27f53e1ae44288673ee9f1c451eb`. Release metadata, generated
bundles and cache keys may change through the ordinary build. All numeric
sources, immutable ledgers, replay logic and ztd-charts adoption remain intact.
