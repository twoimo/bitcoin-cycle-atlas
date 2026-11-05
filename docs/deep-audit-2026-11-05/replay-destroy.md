# 2026-11-05 replay destruction follow-up

## Scope and finding

This follow-up starts at `4dc877ad0fdeabf7f01057e7f64ac11f9a8cbedc`, after the November 4 selection and saved-entry repairs. It changes the exported coordinator lifecycle, not forecast computation or the playback reducer. The [November 4 verification receipt at that commit](https://github.com/twoimo/bitcoin-cycle-atlas/blob/4dc877ad0fdeabf7f01057e7f64ac11f9a8cbedc/docs/replay-state/verification.json) remains historical evidence; it is not reclassified as verification of this later patch.

The baseline's `destroy()` called the interactive `exit()`. That method correctly returned early while an explicit save was pending. The destructor then removed the replay UI without releasing its active state, document/SVG markers or unrelated inert controls.

The actual-source counterexample is:

1. Open and explicitly start a current-chart replay.
2. Choose Save/Exit and defer the save-lock callback.
3. Invoke the returned coordinator's `destroy()`.
4. Observe `isActive() === true`, document/SVG replay markers still present and a live control still inert, although the controller is idle and the replay controls have been removed.

The late save completion also failed to repair that state. The original persistence ownership check already prevented a stale storage write; this follow-up preserves that protection. This is a focused counterexample, not a shortest-path result from the finite selection explorer.

No current production caller of the returned coordinator destructor was found at the reviewed baseline. The case demonstrates an exported lifecycle API defect. It is not a claim that the normal native browser save/reopen flow failed, and it does not change the separately retained November 4 native results.

## Repair

`finishExit()` now owns synchronous, idempotent cleanup. Interactive Exit still refuses a competing exit while its explicit save is pending. Destroy first becomes terminal and then calls cleanup directly, restoring markers, renderer ownership and the original inert state once.

`save()` checks its owner before consuming either an asynchronous result or a failure. The awaiting `exit()` checks again before changing control state. Late callbacks therefore cannot publish the pending save or update detached controls. A write already completed before destruction is not retroactively undone.

The ordinary save/exit path, fixed forecast identity, explicit start confirmation, shared generic/cutoff storage separation and the 2026-10-21 initial-commit preserved baseline remain unchanged. The baseline's publication time is unproven. The renderer and controller source files were not edited.

## Actual-source regression and negative controls

The new coordinator case runs two focused schedules: the deferred callback resumes, or it rejects. Each schedule checks that ordinary Exit remains blocked, two destroy calls restore controls only once, later Open/Exit calls cannot reopen the destroyed instance, saved bytes remain unchanged, no write occurs and detached controls do not change after completion.

| Check | Result | Evidence |
| --- | --- | --- |
| New case against baseline production source | Expected assertion failure: destroy left replay active | [Before log](evidence/replay-destroy-before.log) |
| Same case after repair | Both completion schedules pass | [After log](evidence/replay-destroy-after.log) |
| UI, controller and actual snapshot regressions | 60 tests pass; zero failures, skipped, canceled or todo | [Focused suite](evidence/replay-destroy-focused.log) |
| Destruction mutation: call interactive Exit again | Expected ownership-release assertion failure | [Verifier receipt](replay-state-verification.json) |
| Completion mutation: remove post-await Exit ownership check | Expected detached-control assertion failure | [Verifier receipt](replay-state-verification.json) |
| Exact original source restored in temporary copies | Pass | [Verifier output](evidence/replay-state-verifier.log) |

Run with Node 24 or newer; the recorded run uses **Node v24.22.2**:

```sh
node --experimental-vm-modules tests/chart-replay-ui.test.mjs --replay-ui-extra 2
node --experimental-vm-modules --test tests/chart-replay-ui.test.mjs tests/chart-replay-state.test.mjs tests/chart-replay-snapshot.test.mjs
node verification/replay-state/verify.mjs docs/deep-audit-2026-11-05/replay-state-verification.json
```

The verifier validates the selected case's name, so shifting its index without updating the runner cannot silently qualify a different case. Mutations run against isolated copies of actual production source. A syntax/import error, stale selector, unrelated assertion or timeout is not a detected negative control.

## Bounds and source identity

The existing finite alphabets are unchanged: 10,000 length-four playback traces, 40,000 executed transitions and **52 observable states / 380 observable edges**; 259 length-zero-through-three selection traces, 726 transitions and **24 observable states / 78 observable edges**. The follow-up adds two focused save/destruction completion schedules, not a new exhaustive state-space claim. All **ten** intended actual-source negative controls are detected, and the original controller/coordinator cases pass again after restoration.

| Source | SHA-256 |
| --- | --- |
| Baseline coordinator at `4dc877a` | `f0fb4cef01d5fe0d3361c0416c56260e3670f442b91528ba3a2743d748f94c56` |
| Repaired `dist/chart-replay.js` | `96826f3251cc804d3cbca1bf75d0c7b5b51700859af49545144b164743c223c5` |
| `tests/chart-replay-ui.test.mjs` | `d3f658ecf9f942604d263d29103abab9f936a93aed1e986af2383fdacab0ed27` |
| Unchanged `dist/chart-replay-state.js` | `063e5574b5d442765ad976b7aade4f0039c0c418c414afeaeb1427dd977f3908` |

The project-local `verify-replay-state` skill and current `docs/replay-state/verification.json` now describe this follow-up; source hashes identify the new patch without assigning it to its older baseline. The existing 19-arrow diagram remains an explanatory projection and explicitly omits the save substate and repeated terminal-destroy edges.

This remains bounded executable verification with deterministic DOM/source/forecast/renderer doubles and the actual snapshot helpers. It does not prove arbitrary persistence schedules, concurrent-tab behavior, native browser rendering, market predictability or forecast calibration. The broad integration and remote workflow results are recorded separately by the coordinating audit.
