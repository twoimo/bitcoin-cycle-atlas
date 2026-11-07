# v1.33.0 visual redesign record

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

## Required PR review evidence

Use the workflow receipts attached to this PR's exact head for the full test
run, all 53 original Chrome cases and Hallmark's core 8 plus integrated 10 routes.
Inspect desktop and narrow screenshots, the market chart/source allocation,
single toolbar, summary columns, sticky ledgers, IPO date hierarchy and reader
focus/close states. Verify the actual source hashes and screenshot receipts.

The inherited Hallmark counts are **static 32, core render 10, integrated render
2**; the shared static set is counted once. They are prior results, not results
of this redesign. Keep new findings with their source/run identity. Do not
change Hallmark rules, baselines, ratings, warning data or route inventories.

The PR body records completed CI findings and screenshot review. The merge,
release and Pages workflows then establish their own source identities. Public
verification must check served publication metadata and actual response bytes;
a successful build or tag alone does not establish the deployed source.
