# Replay manual-date rejection — issue #50

## Result and boundary

The follow-up fixes the manual-date path identified in [issue #50](https://github.com/twoimo/bitcoin-cycle-atlas/issues/50). Local focused checks pass. **Native keyboard acceptance and the final deployed result still require the exact-head CI and publication receipts.** This pre-publication report does not close the issue or transfer the earlier 49/49 browser result to changed source.

The patch starts from `aca73b74a5128a5466488a0c701e86f5e854af46`. The current coordinator SHA-256 is `4bd6c239ffe783cf5731bdb1dd229ee79956964f8449f3fc9ffc1aba2e461055`; the [machine-readable receipt](replay-date-followup/receipt.json) records the verified follow-up source hashes. These identify the patched bytes, not code already contained in that baseline commit.

## Behavior

`chooseEnteredDate()` is shared by the date button and Enter. It rejects an empty value, malformed or impossible calendar date, zero year, and a date outside the input's current min/max. An exact UTC calendar round trip prevents JavaScript's date normalization from turning February 30 into March. Native validity must also accept a domain-valid value.

Rejection shows the available bounds or required correction through native custom validity. The date editor remains open with the user's rejected draft. No call reaches `chooseStart()`, so the current origin, cursor, frozen forecast, snapshot, chart viewport and durable save remain unchanged. Editing or canceling clears the custom error. The main replay status is preserved throughout, so canceling does not leave a stale date-error announcement. Valid dates still use the existing observation-gap snapping, while pointer scissors, Random and First selection keep their original paths. No new dialog, menu geometry or transport design is introduced.

## Verification

| Check | Result |
| --- | --- |
| Actual coordinator regression | Both new cases pass: button and Enter on resumed captures and unconfirmed selections; invalid inputs preserve session identity, origin/cursor, forecast/capture bytes and durable saved bytes. |
| Focused replay suite | **87/87**, zero failed, skipped, canceled or TODO cases. Covers UI, Atlas renderer, controller, snapshots and cutoff integration. |
| Manual cases alone | **2/2**, including valid min/max, native-only invalidity and clearing an existing custom error during input/cancel. These two cases are included in the 87, not additional tests. |
| Bounded lifecycle verification | Existing 16 controller tests, 10,000 playback traces / 40,000 transitions and 259 selection traces / 726 transitions pass. |
| Source mutations | **11/11** detected by their intended assertions, including the new mutation reconnecting the old unguarded manual-date handlers. Original and restored sources pass. |
| Syntax and skill | Modified JavaScript passes `node --check`; the repository-owned verification skill passes the bundled `quick_validate.py`. |

The runtime is Node **v24.22.1**. Commands and identities are in the [receipt](replay-date-followup/receipt.json), with the [focused log](replay-date-followup/focused-final.log), [manual-case log](replay-date-followup/manual-final.log) and [current formal receipt](../replay-state/verification.json). The current skill, diagram and source hashes correspond to this patch. The exhaustive alphabets and measured state counts are unchanged; invalid-date cases are focused actual-source checks, not additional exhaustive traces or an unbounded proof.

The first added regression revision failed on the unchanged coordinator, as retained in [the original failure](replay-date-followup/initial-regression-failure.log). The expanded focused suite then exposed missing input-validity methods in the deterministic DOM fixture; its [failure](replay-date-followup/fixture-api-failure.log) remains intact. The fixture now supplies that browser boundary. No production feature-detection fallback was added to conceal a missing test API.

## Required native acceptance

The existing native runner now edits the real date spinbuttons with keyboard events. On the desktop BTC saved-session case it tests both upper and lower bound violations through both button and Enter, then compares the actual cursor, origin, forecast signature, snapshot digest and exact stored bytes. It records the rejection state and screenshot before correcting the same still-open field to a valid date and checking that custom validity clears. Separate native min/button and max/Enter cases discard their drafts and Continue the unchanged saved capture afterward.

These checks use no input value setter or application state injection. Their execution remains pending because the local checkout has no usable Chromium plus Korean-font runtime. CI must actually execute the new cases and produce matching source hashes before #50 is closed. Existing pointer selection, weekly daily updates, Random/First, saved restoration and all other native cases remain required; the new source does not inherit their earlier pass automatically.
