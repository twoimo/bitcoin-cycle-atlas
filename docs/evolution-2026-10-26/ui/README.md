# Independent evolution UI verification

The later user-requested comparison theme and PR37/data refresh integration have a separate [responsive comparison audit](tradingview-theme/README.md). The 57-group journal report below remains evidence for its precisely identified earlier source. It is not relabeled as a fresh 57-group run of the later CSS.

**Final result: PASS, including the immediate equity close/keyboard probe.** This review runs the actual application in Chromium through its visible controls. It covers both a temporary HTTP server serving `dist` and the standalone document opened through `file://`. The reproducible runner is `scripts/verify-evolution-journal.mjs`; the full result is `final/report.json`.

The final run contains 57 concrete journey/check groups across five layouts: 13 desktop groups and 11 each for narrow phone, tablet, zoom reflow, and offline narrow phone. There are zero failed groups, unhandled page errors, or missing local resources. Each layout exercises five JSON downloads. These counts describe coverage; they do not measure predictive accuracy or prove completeness across all environments.

## Final integrated rerun

The final report and screenshots were regenerated in one complete run beginning **2026-10-26T06:33:42.511Z**, after integration of upstream PR #36, whose upstream merge is `7261c1807028e1b69bf9cd9be0d269a64f88acc0`. This includes the upstream judgment labels, focus handling, CSS, and selected-asset method-dialog title in the tested runtime. The existing 57 groups and `--probe-close-race` were reused unchanged; no runtime or test compatibility changes were required for this rerun.

- Standalone file: `build/Bitcoin_Cycles_Comparison.html`
- Standalone size: **18,097,915 bytes**
- Standalone SHA-256: `1ffd7b9ce84da6840bbdbf3d9d407dba31000fe3cfae3f16e1b1fedc9c25360e`
- Publication manifest identity in all five cases: `812ce1c3b3114c5e4c1860b2bd3f87515d8103b1d5b926d242f3ffbe45526cac`

The publication manifest identifies a `modified-preview` source tree based on that upstream commit. The exact reviewed file identities are recorded separately in `final/report.json`. This integrated run supersedes the earlier pre-PR #36 final UI run. All browser contexts and the temporary HTTP server were closed after completion.

## Scope and environment

| Case | CSS viewport | Input / display setup |
| --- | --- | --- |
| Desktop | 1440 × 900 | Keyboard and pointer |
| Narrow phone | 320 × 740 | Touch emulation, real tap entry, keyboard checks |
| Tablet | 768 × 1024 | Touch emulation, real tap entry, keyboard checks |
| 200% reflow proxy | 720 × 450 | Device pixel ratio 2; half the desktop layout viewport |
| Offline narrow phone | 320 × 740 | Actual `file://` standalone document; touch emulation |

Chromium version: **156.0.8078.47**. Korean text was rendered with the installed Noto Sans KR font. Touch emulation is not a physical phone or tablet test. The zoom case reproduces reduced layout space and increased pixel density; it is not browser chrome zoom. No Safari/iOS result is claimed. Assigning `document.documentElement.style.zoom = 2` was tried during exploration, then excluded because it is not equivalent to browser zoom and does not change media-query or viewport-unit semantics in the same way.

External requests were blocked. HTTP pages attempted only the Google Fonts stylesheet; the offline case made no external request attempts. The script records unhandled page errors, missing local HTTP resources, download filenames, focus destinations, exact selected dates/values, and SHA-256 identities of the reviewed source files and standalone file.

## What the actual journeys verify

- The comparison page retains **18 rows with BTC first**, and the existing asset judgment history still opens and renders all 18 assets.
- The comparison page's reading dialog opens the journal through a genuine tap/click. The command palette opens it through **Ctrl+K → 예측 기록과 누적 평가**. Tests do not import the journal directly.
- All six journal sections load. Five preserved records, 90-day / one-year / full-path ranges, and Home / End / arrow selections are checked against the immutable source JSON. Target-table prices and change-table prices/log changes are compared to independent calculations from those records.
- Five JSON downloads are exercised: record plus snapshot, evaluation, publication, experiments, and local performance diagnostics. The first four must equal their actual served or embedded source payloads; performance diagnostics must download successfully.
- Evaluation shows five records, one unique origin, **15 pending targets and zero matured results**. Publication contains **22 source rows: 4 chart feeds plus 18 comparison entries**, and four rows in the common-cutoff comparison. The three experimental decisions remain not adopted.
- Rapid journal tab changes, close/reopen, Escape, focus restoration, selection preservation during an actual chart resize, and native keyboard changes to the range select are checked.
- ETH's three scenarios and future-visibility switch work. MSTR capital-policy and BMNR withdrawal-delay changes finish and retain the selected value. Their dialogs fit the viewport, and their data-information actions hand off to the journal and restore visible focus.
- Actual `file://` repeats the same journal, upstream history, ETH, and equity journeys using embedded data. The offline publication oracle is read from the file's own embedded manifest, not a later regenerated HTTP manifest.

## Explicit integrity and observation fixtures

The desktop integrity checks use temporary Playwright response fixtures; they never modify price or ledger files.

1. **Hash rejection and retry:** one preserved output value is changed in a served record without changing its content address. The journal must show a hash error and no chart. Removing the fixture and pressing retry must recover the verified record.
2. **Later-observation overlay:** two explicitly synthetic later observations are appended only to a test response. The blue overlay must appear, and the selected date must show both the unchanged preserved-path price and the fixture observation exactly. This tests future overlay behavior; it is not a matured forecast result or real observation. The fixture and its limited scope are recorded in the JSON report.

## Defects found during review

| Finding | Evidence and resolution |
| --- | --- |
| Narrow journal chart date labels collided | `first-http/phone320-journal-records.png` preserves the original appearance. The journal now requests a minimum tick spacing; the final narrow screenshots were visually inspected. |
| Resizing reset a selected future date/value to the observation cutoff | `http/report.json` and the phone resize screenshot preserve the failure. The journal now retains `selectedDate`; desktop, phone, tablet, reflow and offline checks pass this assertion. |
| Arrow-key changes to the range select dropped focus to `BODY` | `http/report.json` and the phone focus screenshot preserve the failure. The journal now restores the replaced control's focus without overriding a later user focus change; all final viewport cases pass this assertion. |
| Immediate equity close then End could send End to the forecast button | `equity-close-probe/report.json` captures the original wrong key target. Native dialog close restores focus immediately, and the queued application close handler could then steal newly moved focus. The handler now respects focus already moved to an outside chart/control. The final full run enables `--probe-close-race` and passes both equities in all five layouts, including `file://`. |

Some early failures were test assumptions, not application defects: the mobile command-palette button is intentionally hidden while Ctrl+K still works; native dialog restoration correctly returns to the visible chart; equity forecast readouts say `조건부 일별 경로`; and publication manifests changed during an early concurrent build. Those observations are not presented as unresolved product bugs. The runner now follows genuine keyboard entry, waits for the relevant lifecycle event where appropriate, and compares a download against the payload actually served to that page.

## Reproduction

Provide your installed Playwright module and Chromium executable. In the review environment:

```bash
FONTCONFIG_FILE=/tmp/atlas-statechart-fonts/fonts.conf \
ATLAS_PLAYWRIGHT_MODULE=/opt/codex/runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs \
ATLAS_BROWSER_PATH=/tmp/bca-chrome/chrome-headless-shell-linux64/chrome-headless-shell \
node scripts/verify-evolution-journal.mjs \
  --standalone=build/Bitcoin_Cycles_Comparison.html \
  --probe-close-race \
  --output=docs/evolution-2026-10-26/ui/final
```

`--cases=phone320,tablet768` narrows the viewport set. `--checks=mstr-capital-modal,bmnr-capital-modal` narrows independent equity journeys. `--probe-close-race` deliberately sends the chart key as soon as focus returns, without waiting for the queued native close event, to exercise the immediate handoff risk.

Intermediate directories preserve the original failures and event audits. Duplicate exploratory screenshots were removed; final screenshots and representative original failures remain. JSON reports are evidence of these concrete checks, not a claim that every browser, physical device, or future data situation has been verified.

### Original revision and publication transport

The tested `7261c18` is a local integration commit that includes upstream PR36, not the upstream PR36 commit itself. Its exact Git objects are preserved in [the original-source bundle](../SOURCE_PROVENANCE.md). Subsequent API publication may create a different commit ID with the same file tree. After this full journey, the journal-only source metadata replaced an unresolved GitHub link to a local commit with the full original SHA and source hash; the preserved record values are unchanged.
