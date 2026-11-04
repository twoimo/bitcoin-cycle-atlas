---
name: verify-replay-state
description: Verify replay start confirmation, async session ownership, single-use timers, fixed forecasts and explicit rewind in Bitcoin Cycle Atlas. Use when changing chart-replay.js settings or preparation, chart-replay-state.js lifecycle, replay restoration callbacks, or their verification fixtures and diagrams.
---

# Verify replay lifecycle and start confirmation

Preserve this promise: **settings cannot choose an unconfirmed replay start, and obsolete loads or callbacks cannot change the current fixed replay.** A breach can silently choose a cutoff or reveal bars from a different session.

## Coverage and source synchronization

- Cover `dist/chart-replay-state.js`: `checkedSession`, `owns`, `revoke`, `schedule`, `open`, `selectOrigin`, `play`, `pause`, `seek`, `speed`, `exit`, `fail`, `destroy`.
- Cover `dist/chart-replay.js`: mode/model/horizon `onchange`, `open`, `start`, `beginPick`, `requestEntry`, `readStored` and `storageKey`. Preserve pending selection through settings while keeping confirmed sessions usable.
- Execute actual JavaScript using `tests/chart-replay-state.test.mjs` and `tests/chart-replay-ui.test.mjs`; the latter substitutes deterministic DOM, source, forecast and renderer modules. Do not present those doubles as actual forecast or native browser checks.
- Reviewed baseline commit: `94a1b1dda9eb359de70747043808340da369d087`, on 2026-11-04. The baseline predates the selection fix; identify the patched implementation by its hashes, not by the baseline alone.
- Reviewed controller SHA-256: `063e5574b5d442765ad976b7aade4f0039c0c418c414afeaeb1427dd977f3908`.
- Reviewed coordinator SHA-256: `f0fb4cef01d5fe0d3361c0416c56260e3670f442b91528ba3a2743d748f94c56`.
- Keep the authoritative current file identities and results in `docs/replay-state/verification.json`. Read `docs/replay-state/README.md` and `statechart.mmd` for correspondence, bounds and known counterexamples.

## Run the verification

Use Node 24 or newer; the reviewed runtime is v24.22.2. Run from the repository root:

```sh
node verification/replay-state/verify.mjs docs/replay-state/verification.json
```

Require all 16 controller tests to execute without skipped, canceled or todo cases. Require all 10,000 length-four playback traces (40,000 transitions, three bars) and all 259 length-zero-through-three coordinator traces (726 transitions, six actions) to pass. The reviewed observable counts are 52 controller states / 380 edges and 24 coordinator states / 78 edges. These are projections; do not call them the full private state space. Every trace runs a fresh real instance without state merging.

Require **eight detected real-source negative controls**: session owner, timer owner, recursive freeze, archive-end rewind, mode/model confirmation, horizon confirmation, selected-mode reentry and storage-slot/mode isolation. Require the intended assertion, not merely a nonzero process exit. The two settings controls must report the shortest bounded counterexample: open selection, then one mode or horizon change. Require the restored original controller and coordinator to pass again.

The runner creates isolated temporary copies; never edit production files to run a negative control. A selector mismatch, process error, missing import, timeout, missing enumeration or wrong failed invariant means BLOCKED. Fix the verifier's correspondence before accepting a changed guard; do not weaken the invariant.

## Review and maintain

1. Compare current covered sources and fixtures against the receipt hashes. Inspect changed synchronous turns, awaits, notifications, request generations, timers and start confirmation. Reentrant callbacks can revoke ownership before an outer method returns.
2. Keep an unconfirmed picker distinct from a committed paused session. Preserve the settings guard when either `picking` is true or no session exists. Treat a saved-record Continue or explicit date/bar choice as a separate confirmation path.
3. Keep each saved mode in its own storage slot. Fresh entry prefers cutoff and falls back to generic history only when its cutoff slot is absent; later entry retains the selected mode. Preserve malformed or stale bytes and reject cross-mode records instead of borrowing another slot’s hash. Require both focused saved-entry cases and their two negative controls to pass.
4. Preserve the exact engine session identity and fixed forecast through playback. Keep origin, first hidden bar, visible cursor and forecast input date distinct. Never rescore the current orange path as the 2026-10-21 issuance.
5. Reproduce each new counterexample in an actual-source behavior test. Update the statechart only after checking the implementation. Explicitly retain terminal Play as a no-op; rewind requires seek.
6. Run the command above after changes and inspect original, each mutation and restored results. Run the broader replay tests and native browser gate when DOM or chart behavior changes; bounded fixture success cannot replace them.
7. Update source hashes, fixture correspondence, diagram and receipt together. Move a reviewed synchronization commit forward only after verifying the committed code at that SHA; never claim an uncommitted patch belongs to its baseline. Persist this project-local skill with the repository Git change, and validate it with skill-creator `quick_validate.py`.

Use pstack `maintain-formal-verification-skill` to assess drift after changes that did not recheck these paths. If a future version uses TLA+, read every result through pstack `statechart`; do not copy its machine-specific runner into this skill.

## Report honestly

Report PASS, ISSUES or BLOCKED; exact command/runtime/source identities; finite trace and observable state/edge counts; detected/expected controls; shortest counterexample; and any gaps. This is bounded executable verification of actual JavaScript, not an unbounded proof or TLC model check. It excludes exhaustive asynchronous schedules, browser pixels, cutoff-model generation in the coordinator fixture, storage races, market prediction, statistical calibration and network fairness.
