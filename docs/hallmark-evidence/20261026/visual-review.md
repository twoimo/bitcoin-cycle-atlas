# Independent app visual-finish review

Reviewer: `/root/hallmark_acceptance`. Same model as the implementing assistant; independent reading and visual inspection. Recorded on 2026-10-26. The report below is preserved as returned. It is not Gemini opposition or release authorization.

---

ship

**This verdict applies to the bounded, independent app visual-finish review of `df0bc769b3cb9a65654c2874673e04612c8880df`.** I found no additional blocking visual defect in the supplied before/after route images and selected native-state images. The automated Hallmark design gate remains **failed: 6 FAIL / 3 REFLEX**, with **zero waivers and zero dismissals**. This review does not authorize release or replace the required real Gemini opposition.

## Review scope and evidence

I independently read the pinned [`review-finish.md`](https://github.com/Nutlope/hallmark/blob/7ec868225c6caa040558c321ee0fefa0e73f83a8/skills/hallmark/references/review-finish.md), gates §4, app-screen exceptions in `flow.md`, and the project’s `design.md`. I applied the app criteria: hierarchy, density, legibility, controls, mobile tables, and states. Marketing hero, fold, section rhythm, and word-budget rules were excluded.

I reconstructed and visually inspected:

- **All 32 selected Hallmark PNGs:** baseline and current versions of BTC, ETH, BMNR, MSTR, data, evidence, legacy compare, and mobile preview at 1440 and 375 widths.
- **All 17 selected native-state PNGs:** ETH/BMNR journals, the two large comparison tables, mobile empty states and dialogs, research reader, legacy views, preview pan/loading/error, and the short-screen journal/menu.
- The final native receipt, independently confirming **34/34 passing cases**, **zero failures**, **zero runtime errors**, and **zero resource errors**.

The Hallmark receipt identifies the expected source commit and baseline `0c1ed40e1b9b6c76f5621d087737dc57f174b51e`, reports matched source blobs, and records integrity **PASS with zero errors**. [Hallmark run](https://github.com/twoimo/bitcoin-cycle-atlas/actions/runs/40355131740) · [Native browser run](https://github.com/twoimo/bitcoin-cycle-atlas/actions/runs/40355131704)

## Visual findings

**No new blocking visual finding within the reviewed image set.**

The previously reported indicator collision is resolved in the inspected short-screen state: the expanded indicator manager has an opaque surface, and its text reads independently of underlying event labels.

The legacy chart now uses the available width at desktop and phone sizes. The native receipt confirms both chart and timeline maintain **scale 1** and a minimum **painted text size of 11px**, including same-page **320 → 1440 → 320** and **1440 → 375 → 1440** resizing. The title **“사이클 내부의 구조” is present and visible**; there is no missing-H1 finding.

The asset table visually reaches the viewport bottom at **1620×1008** and **1920×1440**, retaining all **18 rows**. BTC remains first and its display name is **비트코인**. The comparison figures, units, gain/loss colours, and judgment labels remain legible. Mobile horizontal-scroll measurements keep the identifying column stationary and topmost at the beginning, middle, and end.

The mobile research reader has a readable prose measure and reachable close action. Empty research and annotation states explain what is missing. The date dialog and export dialog retain visible actions. The short-screen journal keeps its header and close control accessible while its content scrolls.

The preview’s end-of-pan screenshots visibly expose the bottom controls. The receipt confirms the settled actual state and complete available pan distance: **88px horizontal / 164px vertical at 320**, and **57px vertical at 1440**. Loading and error previews are visibly distinct and identify their simulated status.

## Does the design brief describe the result?

**Yes.** The result reads as a Korean financial research workbench whose principal objects are the full-height chart and asset ledger. The signature continues across chart, comparison, evidence, reader, and dialog surfaces. I found no material gap between that brief and the inspected screens.

## What did the old version do better?

The old phone layouts showed more controls and rows immediately. At 375px, the earlier ETH/equity toolbar exposed more trailing actions without panning, and the research list showed nine initial rows where the current screen shows seven.

That is a visible density tradeoff. The current version provides larger controls and a direct research return action. The native receipt demonstrates successful touch panning to the trailing chart actions, including their **44×44px** targets, so the evidence does not support a lost-control defect.

## Automated findings that remain open

| Phase | Remaining result | Recorded categories |
|---|---:|---|
| Current static | 2 FAIL | Gate 47a: `.analysis-window-controls` chrome-selector match; gate 56: multiple sticky selectors |
| Current render | 4 FAIL | Gate 56: `thead` plus `th.asset-identity-header`, reported on four routes |
| Current render | 3 REFLEX | Gate 49b: wrapped legacy comparison reference links, including a three-line title at 320px |

The reviewed captures and native sticky measurements provide context for these findings; **they do not convert the raw gate to a pass**. Preserve the failed result and its explicit disposition in the final documentation.

## Strongest limitation

This was **same-model independent visual review**. I inspected the **32 selected Hallmark images**, rather than all 80 files produced by the render tiers, and the **17 selected native images**, rather than every per-case capture. The receipts cover additional sizes and interactions, but they are not equivalent to exhaustive visual inspection of every dynamic view or failure path.

**Do not dilute the full-height chart/ledger, readable native-size labels, explicit observed-versus-conditional distinction, or preservation of historical research records while addressing the remaining gate findings.**
