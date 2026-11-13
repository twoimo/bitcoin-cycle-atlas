# R19 P5 F4 / Q-R16-1 bounded local verification

Base: `513d8183b14a73284d4ce1dacf89bd3ded431bdb` (detached local worktree). No remote, main, deployment, CSS, price-axis, data or protected lifecycle files were changed.

## F4 retry/status finding

The reported duplicate visible retry block was not reproduced in the assigned product surfaces, so no speculative product edit was made. `dist/content-shell.js` and `dist/atlas-shell.js` contain no retry/status blocks. In `dist/conference/player.js`, one `.conference-retry` button is created once, explicitly hidden during loading and after success, and exposed only for the empty/error outcome. The notice text and retry are separate status/action semantics; the only live announcement is one `.conference-live[aria-live="polite"][aria-atomic="true"]`. Source inspection verified these transitions and the regression test exercised loading → empty → retrying/loading → error → retry → ready, asserting one reusable retry node, no visible retry while loading/ready, one visible retry when actionable, and exactly one polite live region.

Chart market-status messages and the BTC archive refresh notice represent different source owners; neither is owned by the requested shell files. That broader chart-source combination was not altered or represented as unified. Relay-room implementation is owned by the parent workstream and was not changed. Thus F4 is **not claimed accepted globally**; current bounded evidence supports no changes in this assigned scope.

## Q-R16-1 harness correction

The four conference supplemental cases timed out because the harness waited only for player `empty`, while the unavailable-manifest fallback legitimately resolves to `ready`. The readiness predicate now accepts `empty` or `ready` only on the conference route; the existing downstream assertions still enforce the single painted H1, expected title, and dashboard-header ownership. A unit contract covers both accepted states and rejects loading/error/mismatched-route states.

Chrome 157.0.8103.79 native run: primary heading cases **15/15**, supplemental **9/9** (including conference **4/4** at 320/390/768/1440), layout shifts **2/2**, failures **0**, exit **0**. The report has source hashes and per-case observations. Screenshots are included for conference at all four widths and BTC at 320/1440. The screenshot set is visual evidence for the rendered route, not a retry-error screenshot.

## Five-axis bounded QA

- Function: `conference-player.test.mjs` + `page-heading-browser-contract.test.mjs` **80/80**, failures 0, skips 0. Existing heading geometry assertions were not weakened.
- Visual: real Chrome screenshots at 320, 390, 768, 1440 for conference; BTC 320 and 1440. The browser report records successful H1/layout checks at all those routes and widths.
- Accessibility: automated regression verifies a single polite atomic live region and exactly one stable named retry button, hidden while loading/ready and reachable when empty/error. Full screen-reader/manual assistive-tech review was not performed.
- Performance: no performance-changing product code was changed; no performance claim or benchmark is made.
- Consistency: source review found one conference retry control and explicit hidden-state toggles, not simultaneous duplicate visible actions. Current browser screenshots show the ready state; failure/recovery state transitions are covered by deterministic unit tests, not screenshot captures.

## Limits

This is a bounded local branch result, not full `npm test`, all-product accessibility audit, relay F4 review, deployment, or release approval. Parent should integrate by cherry-picking the returned commit and retain their own final serialized gate.
