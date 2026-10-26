---
name: verify-publication-state
description: Verify source and content identity guards before Atlas artifact preparation and after a served response. Use when changing publication-contract.js, build-publication.mjs, its metadata validation, or publication state models and negative controls.
---

# Verify publication state

Keep this promise: **only a validated candidate with the same source commit and file digest can become ready, and only the matching served identities can become confirmed.** A missing guard can label stale code, changed files, or a different public artifact as the checked result.

## Coverage and synchronization

- Covered implementation: `dist/publication-contract.js`, the synchronous `createPublication`, `validatePublication`, `preparePublication`, and `confirmPublication` transitions.
- Last confirmed source commit: `7261c1807028e1b69bf9cd9be0d269a64f88acc0` (2026-10-26; contract unchanged from `ba28c25`). Runtime SHA-256: `faa94f8819b6c51bdf7716e2b650f8acf80ee410b6d21e96f3b792dd2ff10cc6`.
- Model: `verification/publication-state/Publication.tla`. Each action points to its actual implementation guard. One candidate and two source/file identities form a finite abstraction; value2 is an unset monitor.
- Current configuration: `Publication.cfg`. Deliberate negative controls: `stale-source.cfg`, `changed-files.cfg`, and `served-mismatch.cfg`. They remove one guard each, rather than claim three observed production races.
- Real-code assertions: `tests/publication-contract.test.mjs`. Artifact byte checks, metadata state consistency, extra files, paths and provider timestamps also have regressions in `tests/publication-manifest.test.mjs`; these are not part of the TLA proof.
- Read `docs/evolution-2026-10-26/PUBLICATION_VERIFICATION.md` for code correspondence, receipts, the rendered graph and external workflow assumptions.

## Run the check

From the repository root with Node24+ and Java11+:

```sh
node scripts/verify-publication-state.mjs
```

Use the pinned TLC1.7.4 JAR with SHA-256 `936a262061c914694dfd669a543be24573c45d5aa0ff20a8b96b23d01e050e88`. The runner uses `TLA2TOOLS` when supplied or `build/formal-tools/tla2tools-1.7.4.jar`. If the default JAR is missing, it downloads the official pinned release and verifies its checksum. A missing explicitly supplied tool, failed download, checksum mismatch, launch failure, or abnormal process termination is blocked, never a passing proof.

Require the baseline to finish with all invariants holding. Require the three negative configurations to violate `PreparedRevisionMatches`, `PreparedContentMatches`, and `ConfirmedIdentityMatches`, respectively. Then require all five named real-code cases to pass, each actual-source guard mutation to fail its corresponding assertion, and the restored temporary copy to pass again. The shared `scripts/verification-process.mjs` requires normal exits: 0 for successful checks, 12 for a TLC invariant violation, and 1 for a Node assertion failure. Signal termination or missing exit status cannot qualify even after expected output. The runner never mutates product files. It rejects skipped/cancelled/todo tests and incomplete counts. Pass an optional output filename to preserve its JSON receipt, including model/configuration/mapping hashes and observed exit statuses.

Read every TLA result with the pstack `/statechart` skill. Follow that skill's current documentation instead of relying on machine-specific command paths. For Korean labels, use a fontconfig font with Hangul support. Inspect the normal graph and each counterexample PNG before reporting them; a renderer exit of 0 with missing-glyph boxes is not a reviewed diagram.

## Review a change

1. Compare the covered functions with the synchronization commit. Trace each modeled synchronous action to its code guard and returned phase.
2. If a transition gains asynchronous work, separate its continuations and possible intervening source/file changes. Do not describe an asynchronous operation as atomic.
3. Run the command and inspect real named tests, TLC state counts and exit statuses. An execution policy failure or process crash is not a successful negative control.
4. Reproduce a reported counterexample through the actual transition functions. If the implementation cannot produce it, fix the correspondence instead of weakening the invariant.
5. Update the model, assertions and guard-removal selector together when behavior intentionally changes. The selector deliberately stops if the guarded expression no longer matches.
6. Move the synchronization commit only after checking the committed implementation and rerunning baseline, negative models, mutated real code and restored-copy tests. Use `/maintain-formal-verification-skill` after unrelated changes that may have caused drift.

## Interpret the result

The model permits source/file changes before preparation; it checks a sampled served identity afterwards. It does not model changes after ready, concurrent GitHub jobs, atomic remote deployment, filesystem transactions, retries, availability, cryptographic authenticity, browser rendering, or forecast accuracy. Current main checks in workflows and real HTTP body verification are separate operational guards. The three model mutations demonstrate that the guards matter within the stated abstraction; they do not prove the complete deployment system.

## Recover the original local synchronization revision

Native Git push was unavailable in the implementation environment. The GitHub API publication preserves the file tree but creates a different commit object. Read `docs/evolution-2026-10-26/SOURCE_PROVENANCE.md` and verify/fetch its original Git bundle into the separate verification ref before diffing an unavailable synchronization commit. Never substitute the public commit ID for the original recorded identity or rewrite an immutable forecast.
