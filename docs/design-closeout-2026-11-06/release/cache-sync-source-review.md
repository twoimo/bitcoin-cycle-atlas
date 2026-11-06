# Cache synchronization — committed source review

**PASS_WITH_NOTES. No unintended product change or source-integrity blocker found.** The existing remote repair is valid independently of the alternative fixture-only proposal.

## Source identity and scope

- Base: `ada2f3c645b3023f93b0f0799daf9b57481b57cc`, tree `397cf7dd9bd2d78c4c8d9057107c5a9481938b02`.
- Reviewed head: `601119796df94dc77b213b73838a9d4a840afe14`, tree `aa7ed92e075b897bf5f1c73f58a3d8fceab7449f`.
- New public tree: `33532c2d59d03a5b6f8f582e528edb855badec4f`; previous public tree: `7832034a94a43d2186be6bdf7377499d1ac42edb`.

Review used committed Git objects, byte comparisons and recomputed hashes. No tests, workflow reruns, tracked edits, pushes, or deployment actions were performed. Detailed per-file results are in `cache-sync-source-review.json` beside this report.

## Product and version checks

The complete delta contains 26 files: 18 public files and eight documentation, evidence, or skill files. For **every changed public file**, the new bytes equal the old bytes after only the literal substitution `?v=1.31.2` → `?v=1.31.3`. There are exactly **53 substitutions**, including the eight generated route wrappers. File modes are unchanged. The current public tree contains 53 matching new queries and no remaining old query.

This comparison excludes unrelated changes to algorithms, markup, styles, route structure, source clocks and module paths. No unknown import path or additional query shape is introduced: all dependency paths are retained byte-for-byte. The unchanged strict VM fixtures now expect the same 1.31.3 token requested by the coordinator's state, snapshot and forecast imports. Package version, root lockfile version, and lockfile root-package version all remain 1.31.3.

All files under `tests/`, `scripts/`, `verification/`, `apps/`, `packages/` and `.github/` are unchanged. The original strict fixture assertions and module maps remain intact. Existing generated app-bundle bytes are unchanged.

## Protected inputs

All **203 financial, research and IPO inputs**, totaling **45,414,161 bytes**, in the current protected manifest have unchanged Git blobs across the reviewed delta. Their actual byte counts and SHA-256 hashes also match the manifest's recorded original baseline `59ec6f4f708e87d73dad6324d925a9e01383411c`.

The manifest explicitly excludes the previously expanded review inventory configuration, `research-data/eth-review-scope.json`; that configuration is also unchanged in this delta. Complete `dist/data/`, `research-data/`, `dist/research/`, `dist/research-sources/`, `dist/ipo/` and `dist/ipo-*` scopes are unchanged. This does not misstate the earlier inventory expansion as an unchanged original input.

## Receipt integrity

All five current formal source/test hashes match their committed files. The coordinator hash is `5cc422c910491e4553c72032c3a482547c6733ba0339fe8941cfebf9fcc31d90`; the unchanged coordinator test hash is `61870821827d6a928a568e716ca343ef08f1302abed9c79f45af0795104d6f01`.

All **11 mutant hashes** were independently reconstructed from the unchanged verifier's before/after literals, with each mutation selector occurring exactly once. Every computed hash matches its receipt. This checks source identity without reexecuting mutations. The formal receipt differs from the previous receipt only in **20 source-hash values**; recorded bounds, assertions, statuses, counters, exclusions and test identities are unchanged. The README and repository-owned verification skill reference the correct new coordinator hash.

The preserved failed-run gzip decompresses successfully; both compressed and original byte counts and SHA-256 values match the committed failure receipt. Its pending correction state and historical cancelled-run record do not claim final native success. The native replay harness is unchanged, with SHA-256 `04e419ba8e1858153385d134e9e765b8458a0b763a158f935e7ccd0a4656fcad`.

## Remaining evidence boundary

The committed notes report the restored 155-case replay gate and focused local checks. This review validates the source delta and receipt identities, not those behavioral outcomes independently. The new public bytes require CI, native acceptance and publication evidence bound to `6011197` or the actual equivalent merge tree. Earlier evidence tied to the old public tree remains historical.
