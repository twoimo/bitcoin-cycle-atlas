# Judgment archive: reading hierarchy refinement

## Scope and model

Local presentation-only refinement from public v1.28.0 (`26f6941a51281f00a136e96f29ce3796357a40cb`). Model: `openai-codex/gpt-6-astra`, confirmed by parent host spawn receipt; no model substitution or external review. Integration and public verification belong to the parent.

## Brainstorm → explore → plan → critique

Audience: Korean-speaking investor comparing 18 assets and distinguishing reconstructed classification history from genuinely stored calculations. Considered a denser archive, a split detail layout, and a clearer reading hierarchy. Chose hierarchy: the existing board is already compact, while desktop date arrows were separated far from the date and saved percentages had no column meaning. A split panel would introduce new responsive/focus behavior outside this scope.

Plan: preserve black `#0b0f10`, white `#ecf1ef`, cyan `#6bd7ca`, defensive yellow `#f0d36c`, muted text `#a5b0ac`, and fine rules `#394543`. Existing sans-serif labels and monospace ticker/numbers remain. Sequence: archive kind → complete provenance disclosure → filters/date → rows → detail. Signature remains the railway board, not new cards or a hero. No fonts, packages, assets, animation, data or calculations added.

Pre-build critique: stronger hierarchy must not obscure unavailable states or compress away the reconstruction warning. Keep both disclosures/status and all seven legend states. Do not disturb main-table selectors, pinned headings, density, metadata removal or row order.

## Implemented

- More legible mode buttons and an inset selected underline, retaining `aria-pressed`.
- Date field and previous/next controls grouped together; at 320px the date label sits above its field while arrows align with the field, rather than wrapping below it.
- Explicit yellow focus-visible outline on history inputs. Mobile state labels, legend and date endpoints are 12px; tighter toolbar margins offset the larger type without removing provenance or status text.
- Saved rows gain aligned desktop headings and right-aligned tabular percentage values; mobile shows ticker/name on separate lines and a local “연초 대비” label. Percentage accessible names state the complete meaning.
- Reconstructed detail labels explicitly say annual-start → highest/lowest **closing-price** mean rise/fall; no MDD substitution.

## Rendered critique and verification

Owned local preview: ports 54137 (initial Python server), then 54138 (Node static server after a module-fetch failure in the initial QA transport). No public writes. Snapshot-first Aside inspection plus isolated headless Chromium screenshots/assertions.

- Before and after history: 1440×1000, 390×844, 320×700, 700×600, 620×420, 800×420, 768×1024, 1024×768. Both reconstructed and saved modes, 18/13/4/1 filters, 1y/all period/date navigation, AAPL selection, actual two saved records, close/reopen, explicit IEF navigation and return focus passed.
- Final main-board QA at the same eight sizes: all 18 rows visible at 1440×1000, BTC first, no document overflow, removed metadata/footer remain absent, keyboard focus, reduced motion, numeric bounds, sticky headers and last-row reachability pass. Added tablet horizontal-scroll assertion confirms name header/body left and width alignment within 1px at both 768 and 1024 widths.
- History date-input 2px yellow focus, keyboard Tab remaining in dialog, zero mode transition under reduced motion, and sampled disclosure/legend/state/ticker text contrast ≥4.5:1 pass. Not an exhaustive accessibility certification.
- Full suite: 1082/1082 tests passed. Added scoped presentation regression test. `git diff --check` passed.
- Actual downloaded main CSV (18 rows), reconstructed BTC CSV (366 daily rows), and saved CSV (18 rows) are byte-identical before/after. Two stored snapshots and all data/loader/engine files unchanged.

Visual judgment: date controls now read as one operation; saved values are identifiable without guessing; selected archive kind is clearer. The main board remains visually unchanged. Mobile disclosure still occupies significant height by design: provenance is not sacrificed for more rows. The mobile legend, state labels and date endpoints were enlarged to 12px after independent critique; toolbar whitespace was reduced, never the provenance text.

## Evidence and limits

Full evidence is retained in private task-local temporary storage, not in the public source tree.

- Before: `before-1440-all.png`, `before-390-all.png`, `before-320-saved.png`.
- After: `final2-1440-all.png`, `final2-1440-saved.png`, `final2-320-all.png`, `final2-320-saved-rows.png`, `final2-390-saved-rows.png`, `final2-768-saved-rows.png`.
- Main: `main-final-1440.png`, `main-final-768.png`, `main-final-1024.png`.
- Machine evidence: `final2-qa.json`, `main-final-browser-qa.json`, `csv-byte-comparison.json`, `full-tests-final.log`; reproducible task-local `history-qa.mjs` and `base-qa.mjs`.

Independent read-only public audit reported two pre-existing interaction issues: explicit-symbol history opening does not focus/scroll to detail, unlike selecting a board asset; the asset explanation dialog retains the generic help title. These are handed to the parent rather than changing functional open/focus contracts in this presentation-only patch. No push, PR, merge, release or deployment performed.

## Integrator follow-up
The independent Astra review's subject-title and explicit-symbol focus findings are addressed by the integrator with scoped controller regressions. After a requested symbol is rendered, focus moves to the existing detail title, matching board-selection behavior. The explanation dialog names the selected asset and returns to the generic title for ordinary help. No calculations, archive values, CSV or capture logic are changed.

Integrator acceptance: 1,083 tests passed; the two pre-existing interaction defects reproduced on the public baseline at 320/390/768 widths and passed after the fixes, including visible detail title, exact asset heading, Escape return focus and generic-help reset. Eight-size HTTP/standalone history and original-board checks passed. Nine protected engine/data/capture/workflow/snapshot paths match the v1.28.0 base bytes, and the main CSV retains SHA-256 cd92bb9b88cd3881c0280c7856e0267a0a2767eaf7e424e757f16e2cfd9e5f29. CI/public acceptance remain separate downstream checks.
