# Manual replay date validation — issue #50

The manual Select date editor is an exact calendar selection, not the pointer's nearest-observation snap. `replayDateInputError` checks a canonical UTC calendar day (including leap-year validity), nonempty observed bounds, and both inclusive bounds before a date reaches `chooseStart`. The button and Enter share `submitDateStart`. Native validity is also honored; the existing hint announces a domain error and `reportValidity()` presents it at the input. A missing observed date within the bounds is explicitly rejected rather than silently replaced.

Rejected input never reaches the replay controller, viewport repositioning, forecast capture, or persistence. The entered value remains editable. Editing, cancelling, or reopening clears stale custom validity; normal min/max dates still work. Pointer snapping, Random bar and First available day retain their existing path.

No chart geometry, CSS, forecast engine, price data, playback cadence, bar order, scoring policy or drawing order is changed. Brown band → frozen yellow dotted path → observed candles remains the intended order. A current captured assumption is not a historical issued forecast.

## Checks

- `node --test tests/replay-date-input.test.mjs`: calendar/domain cases.
- `node --experimental-vm-modules --test tests/chart-replay-ui.test.mjs tests/replay-fixed-forecast-ui.test.mjs tests/replay-date-input.test.mjs`: existing UI coordinator checks and new state/persistence invariants.
- `CHROME_BIN=google-chrome ATLAS_QA_URL=http://127.0.0.1:8765/ node scripts/verify-replay-date-browser.mjs`: an already-served candidate with native date segment keyboard events, button/Enter submission, exact boundaries, weekly daily-update OHLC and narrow error/cancel controls.
- `EXPECTED_SOURCE=<deployed-commit> node scripts/verify-replay-date-browser.mjs`: the real public site, cache disabled and hard reloaded, publication identity and nine HTTP bodies verified against that checkout.

The browser acceptance script creates an isolated temporary profile. It never modifies a user's existing local storage. Evidence is written to `build/replay-date-qa/verification.json` and PNGs. A runtime error or failed assertion is a failure; missing browser/setup is not a pass. Browser failure must not be relabelled as a product fault without reproducing the interaction.

The invalid-input UI regression must also fail on the pre-fix controller due to a changed session, not because a newly added helper is absent. Test the old controller with the new test body to keep this negative control inspectable.
