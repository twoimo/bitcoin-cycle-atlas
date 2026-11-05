---
name: verify-replay-state
description: Verify replay start confirmation, async session ownership, single-use timers, fixed forecasts, explicit rewind and destruction during pending saves in Bitcoin Cycle Atlas. Use when changing chart-replay.js settings or teardown, chart-replay-state.js lifecycle, replay save/restore callbacks, or their verification fixtures and diagrams.
---

# Verify replay lifecycle and start confirmation

Preserve this promise: **settings cannot choose an unconfirmed replay start, and obsolete loads or callbacks cannot change the current fixed replay.** Also release replay ownership synchronously on terminal destroy, even during an explicit save. A breach can silently choose a cutoff, reveal bars from a different session or leave live controls inert after teardown.

## Coverage and source synchronization

- Cover `dist/chart-replay-state.js`: `checkedSession`, `owns`, `revoke`, `schedule`, `open`, `selectOrigin`, `play`, `pause`, `seek`, `speed`, `exit`, `fail`, `destroy`.
- Cover `dist/chart-replay.js`: mode/model/horizon `onchange`, `open`, `start`, `beginPick`, `requestEntry`, `readStored`, `storageKey`, `save`, `exit`, `finishExit` and `destroy`. Preserve pending selection through settings while keeping confirmed sessions usable.
- Execute actual JavaScript using `tests/chart-replay-state.test.mjs` and `tests/chart-replay-ui.test.mjs`; the latter substitutes deterministic DOM, source, forecast and renderer modules. Do not present those doubles as actual forecast or native browser checks.
- Reviewed follow-up baseline commit: `4dc877ad0fdeabf7f01057e7f64ac11f9a8cbedc`, on 2026-11-05; original audit baseline: `94a1b1dda9eb359de70747043808340da369d087`. The follow-up baseline predates the pending-save destruction fix; identify the new patched implementation by its hashes, not by the baseline alone. Keep the November 4 receipts as historical evidence.
- Reviewed controller SHA-256: `063e5574b5d442765ad976b7aade4f0039c0c418c414afeaeb1427dd977f3908`.
- Reviewed coordinator SHA-256: `96826f3251cc804d3cbca1bf75d0c7b5b51700859af49545144b164743c223c5`.
- Keep the authoritative current file identities and results in `docs/replay-state/verification.json`. Read `docs/replay-state/README.md` and `statechart.mmd` for correspondence, bounds and known counterexamples.

## Run the verification

Use Node 24 or newer; the reviewed runtime is v24.22.2. Run from the repository root:

```sh
node verification/replay-state/verify.mjs docs/replay-state/verification.json
```

Require all 16 controller tests to execute without skipped, canceled or todo cases. Require all 10,000 length-four playback traces (40,000 transitions, three bars) and all 259 length-zero-through-three coordinator traces (726 transitions, six actions) to pass. The reviewed observable counts are 52 controller states / 380 edges and 24 coordinator states / 78 edges. These are projections; do not call them the full private state space. Every trace runs a fresh real instance without state merging.

Require the focused destruction case to execute both completion schedules for one pending explicit save: deferred callback resumption and rejection, with two destroy calls per schedule. Require markers and prior inert state to be restored once, saved bytes to stay unchanged and late completions to leave detached controls unchanged. These schedules do not increase the exhaustive selection alphabet or establish arbitrary persistence ordering.

Require **ten detected real-source negative controls**: session owner, timer owner, recursive freeze, archive-end rewind, mode/model confirmation, horizon confirmation, selected-mode reentry, storage-slot/mode isolation, destruction routed through the interactive save guard, and a revoked exit completion updating detached controls. Require the intended assertion, not merely a nonzero process exit. The two settings controls must report the shortest bounded counterexample: open selection, then one mode or horizon change. The destruction case is a targeted actual-source trace, not a shortest-path claim. Require the restored original controller and coordinator to pass again.

The runner creates isolated temporary copies; never edit production files to run a negative control. A selector mismatch, process error, missing import, timeout, missing enumeration or wrong failed invariant means BLOCKED. Fix the verifier's correspondence before accepting a changed guard; do not weaken the invariant.

## Review and maintain

1. Compare current covered sources and fixtures against the receipt hashes. Inspect changed synchronous turns, awaits, notifications, request generations, timers and start confirmation. Reentrant callbacks can revoke ownership before an outer method returns.
2. Keep an unconfirmed picker distinct from a committed paused session. Preserve the settings guard when either `picking` is true or no session exists. Treat a saved-record Continue or explicit date/bar choice as a separate confirmation path.
3. Keep cutoff history separate from the shared generic replay slot, which holds current-chart, project-baseline, historical or recorded history. Reentry reads the slot selected by the mode family. Fresh entry prefers cutoff and falls back to generic history only when its cutoff slot is absent; later entry retains the selected mode. Preserve malformed or stale bytes and reject records from the other storage family instead of borrowing another slot’s hash. Require both focused saved-entry cases and their two negative controls to pass.
4. Keep interactive save/exit separate from terminal cleanup. Mark destroy terminal before `finishExit`, revoke save ownership, restore markers/inert controls once and ignore both success and failure continuations after revocation. Keep the ordinary pending-save Exit guard. Do not claim that a write already completed before destruction can be undone.
5. Preserve the exact engine session identity and fixed forecast through playback. Keep origin, first hidden bar, visible cursor and forecast input date distinct. Never rescore the current orange path as the 2026-10-21 issuance.
6. Reproduce each new counterexample in an actual-source behavior test. Update the statechart only after checking the implementation. Explicitly retain terminal Play as a no-op; rewind requires seek. The main diagram omits the save substate and repeated terminal-destroy edges; keep that limit explicit.
7. Run the command above after changes and inspect original, each mutation and restored results. Run the broader replay tests and native browser gate when DOM or chart behavior changes; bounded fixture success cannot replace them.
8. Update source hashes, fixture correspondence, diagram and receipt together. Move a reviewed synchronization commit forward only after verifying the committed code at that SHA; never claim an uncommitted patch belongs to its baseline. Persist this project-local skill with the repository Git change, and validate it with skill-creator `quick_validate.py`. Keep dated follow-up evidence in `docs/deep-audit-2026-11-05` without rewriting November 4 results as if they covered later code.

Use pstack `maintain-formal-verification-skill` to assess drift after changes that did not recheck these paths. If a future version uses TLA+, read every result through pstack `statechart`; do not copy its machine-specific runner into this skill.

## Report honestly

Report PASS, ISSUES or BLOCKED; exact command/runtime/source identities; finite trace and observable state/edge counts; detected/expected controls; shortest counterexample where actually enumerated; and any gaps. No current production caller of the returned coordinator destructor was found at the follow-up baseline; describe its repair as an exported lifecycle API case, not a demonstrated native user-flow failure. This is bounded executable verification of actual JavaScript, not an unbounded proof or TLC model check. It excludes exhaustive asynchronous/persistence schedules, browser pixels, cutoff-model generation in the coordinator fixture, market prediction, statistical calibration and network fairness.
