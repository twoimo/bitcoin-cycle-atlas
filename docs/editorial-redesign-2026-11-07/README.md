# v1.33.0 visual redesign record

> 기록 보관 · 2026-11-07(Asia/Seoul): Hallmark는 사용자의 최신 지시로 종료됐다. 아래 계획·검증 범위·판정은 해당 과거 소스의 기록이며 현재 실행 지시나 릴리스 조건이 아니다. 현재 디자인 기준은 저장소의 `AGENTS.md`, `design.md`와 디자인 마스터를 따른다. 원본 결과와 수치는 당시 사실로 보존한다.

## Request and baseline

On 2026-11-07 (Asia/Seoul), the user requested a full redesign with
`nextlevelbuilder/ui-ux-pro-max-skill`. This subsequent request permits a visual
redesign while retaining the single outer toolbar, chart perimeter, financial
data, immutable records, replay and original verification tools.

Implementation starts at main
`5704a96e787e27f53e1ae44288673ee9f1c451eb`, including all 15 files from the
latest automatic data refresh. Its public publication identity was separately
verified as source `5704a96…`, manifest
`87bb7c5c20346ed66fcd04661a9a3fc4c020d79389fd00c2e9fc5149a68d92bd`.
The earlier v1.32.2 release is `bc3cd8c…`; that tag is not the same as the
refreshed public source. The original v1.32.1 handoff commit `0eaa23b…` is also
a document checkpoint, not the current production commit.

The skill's exact upstream revision, searches, rejected off-topic layout,
selected direction and interface contracts are recorded in
[`MASTER.md`](../../design-system/bitcoin-cycle-atlas/MASTER.md).

## Implementation boundary

- `editorial-system.css` defines shared roles, perimeter controls, search and
  floating surfaces. `editorial-panels.css` covers React panels and their
  parent-document portals. `editorial-ledgers.css` covers comparison, IPO,
  research and readers. Both the real host and React entry load the needed
  styles; there is no alternate demo implementation.
- `ObservedResearchChart` measures only its allocated drawing height and
  supplies the real ztd height prop. The model, points, gap splitting, index
  mapping, interpolation and signed contribution baseline are unchanged.
- Package/version queries move to 1.33.0, and `build:pages` regenerates the
  content-hashed assets and route wrappers. Generated files are not hand edited.
- The standalone HTML builder inlines all three new styles in the same order as
  the web entry. Its existing unresolved-resource rejection remains intact.
- The existing review-source inventory includes the three new CSS files. The
  packaging test's explicit stylesheet inventory grows from 33 to 36, checks
  each new stylesheet exactly once, and verifies rejection of a removed new
  stylesheet. The original verifier and its byte-equality rules are unchanged.
- The research focus test now resolves the current package version for the
  reader module instead of a fixed 1.32.2 import. Its behavioral assertions are
  unchanged; this keeps the fixture on the same module instance as the view.
- The original replay verifier was rerun to update its current source receipt
  after cache query changes. Controller, fixtures, negative controls and verifier
  remain unchanged. Earlier dated evidence is preserved.

## Local checks before opening the PR

| Check | Observed result |
| --- | --- |
| TypeScript | Pass |
| React market/panel + ztd tests | 20 passed, 0 failed, 0 skipped |
| Legacy toolbar + release notes + research focus | 15 passed, 0 failed, 0 skipped |
| Original offline replay/standalone tests | 5 passed, 0 failed, 0 skipped after including the new styles in the downloadable HTML |
| Review-source inventory and standalone packaging tests | 37 passed, 0 failed, 0 skipped after extending coverage to the new styles |
| CSS parsing for the three new stylesheets | 0 warnings |
| Pages build and byte-equality verification | Pass, 9 generated routes |
| Static reference verification | Pass, 799 files / 891 references |
| Original bounded replay verification | Pass, original and restored checks; negative controls fail as expected |
| Latest automatic refresh files | All 15 preserve their exact baseline Git blobs |

The new React case exercises empty-to-populated rendering, height reduction,
hidden/short frame handling, unchanged selected date/index and gap geometry,
and observer cleanup on empty replacement and unmount. It does not substitute
for actual CSS layout or native browser input checks.

Local native Chrome could not start: the execution environment rejected its
process-singleton socket with `Operation not permitted`. The original runner
therefore completed **0 cases and 0 screenshots**. This is recorded as blocked,
not passed. The original harness, flags, inventory and permissions were not
altered to turn that result into success. Actual browser/render verification is
performed by the repository's existing PR workflows before merge.

## Historical PR review scope

This release's review scope used the workflow receipts attached to its exact
head: the full test run, all 53 original Chrome cases and the then-active
Hallmark core 8 plus integrated 10 routes. The recorded review covered desktop
and narrow screenshots, market chart/source allocation, the single toolbar,
summary columns, sticky ledgers, IPO dates and reader focus/close states, with
source identities and screenshot receipts. This is the scope of that release.

The inherited Hallmark counts are **static 32, core render 10, integrated render
2**; the shared static set is counted once. They are prior results, not results
of this redesign. That pass retained source/run identities and the original
Hallmark rules, baselines, ratings, warning data and route inventories.

The PR body records completed CI findings and screenshot review. The merge,
release and Pages workflows then establish their own source identities. Public
verification must check served publication metadata and actual response bytes;
a successful build or tag alone does not establish the deployed source.

## First candidate review and corrections

Candidate `75e4a3c0ea55608bac0d28327fb60843d6a783cf` was inspected with the
unchanged CI workflows. The market service's three native integrated cases
(320/390/1440px) passed, including single outer toolbar, original input owners,
source/frame state and native scrolling. All 27 captured PNG hashes matched
their receipt. The candidate's 14 React workspace desktop/mobile Hallmark
images and asset/research/IPO desktop/mobile images were read directly.

The first candidate is **not** the final passing result. Its standalone builder
omitted the three new stylesheets, causing the original unresolved-resource
check to reject packaging. Adding the styles to the existing inlining list
restores self-contained HTML; all five original offline replay tests then pass.

The original full native run completed 53 cases: 50 passed and three BTC replay
cases failed because the blue start-point preview inherited the new brass
keyboard-focus color. Its actual stroke was `rgb(232, 201, 144)` at 1440×900,
320×568 and 900×430. A separate replay-picker role restores the original
`#8db2ff` for the guide and date label without changing focus, input handling,
replay data or the original blue-color assertion. All 300 candidate PNGs and
113 reported source hashes matched their artifact and commit; a fresh full run
is required because the failed assertion stopped those cases early.

Original Hallmark on that candidate recorded static **6 FAIL / 3 REFLEX / 64
WARN**, core render **0 FAIL / 0 REFLEX / 10 WARN**, and integrated render
**0 FAIL / 0 REFLEX / 3 WARN**. Source integrity, all declared route readiness,
and before/current screenshots were complete; these were real design findings,
not a tool timeout. Corrections in the following source revision are:

- Promote the two repeated overlay/indicator-label paint values into shared
  semantic tokens, preserving the exact paint.
- Remove tracking from small metadata labels and align three new paddings with
  the declared 4px rhythm while retaining mobile 44px controls.
- Give source prose a consistent 72ch reading width.
- Match the direct research search input's remaining blue-gray paint to the
  shared surface/text roles, preserving its geometry and behavior.
- Match the archived comparison route's select and selected timeframe control
  to the shared surface/text roles, retaining its labelled chart-series colors.
- Preserve a readable title-column width in narrow empty research results.
  The existing six-column empty cell previously left the title header squeezed
  when three metadata columns were hidden. The first CSS-only correction in
  `b29fc732` still left extra table tracks in its real 320px screenshot. The
  final correction matches only the empty cell's `colSpan` to the actual visible
  header count during the existing render/resize lifecycle. It introduces no
  duplicate breakpoint policy and retains data and populated-table behavior.

No checker, rating, warning input, immutable baseline or numerical data changed.
Contrast warnings based on unresolved/inherited token combinations and repeated
control recipes require actual rendered review; the count itself is not a
target. The additional integrated `kept` warning concerns the baseline first
route's `11.06` parent-body token, which is absent from that baseline's visible
market screenshot. The current market observation date/value remains explicit.
No date or hidden content was added merely to satisfy that warning.

Final acceptance uses the follow-up head's own full CI and render receipts,
recorded on the PR rather than treating these candidate results as final.
