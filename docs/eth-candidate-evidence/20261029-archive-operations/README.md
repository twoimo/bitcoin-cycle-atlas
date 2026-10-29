# Archive-backed prospective replay and operations

## Result and verification status

This continuation connects the complete immutable prospective archive to issuance, replay, evaluation, calibration readiness, capacity, and the downstream model-readiness report. A small current-run delta no longer substitutes for all retained history. The implementation and final local gates are complete: **2,080/2,080 tests passed**, zero failed or skipped, on committed source `e41f93f58e59a05d3125f8a614a055c6b721ef88`, tree `acaadcb7c74597533c4126b52606754dc6565da9`. All nine required verification commands and publication/standalone generation checks passed. [Exact receipts and log inventory](local-verification/inventory.json) bind their actual source and bytes. The new remote CI acquisition, native-browser run and full evidence packet still require their own execution; a prior run is never relabeled as this source verification.

Baseline: `1d6f82394aebc9767fad1f41754ab4b4a97fac93`. The existing TradingView-style forecast replay UI and frozen forecasting source graphs remain unchanged. [PR 39](https://github.com/twoimo/bitcoin-cycle-atlas/pull/39) remains Draft. `releaseAuthorized=false` and `productionPromoted=false`. No default-branch activation, archive-branch publication, merge, or deployment is authorized by this continuation. Gemini opposition and reverse review remain `omitted-by-user`; that disposition is neither a pass nor a pending required review.

## What changed

### Complete retained history, bounded current writes

The old operational consumers reconstructed one flat 500-observation / 2,000-record / 1 MiB index. The new explicit entry point, `scripts/ethereum-prospective-archive-operations.mjs`, reads a verified immutable archive plus a separately bounded current-run delta. Its commands are `restore`, `issue`, `replay`, `readiness`, `capacity`, `append`, and `verify`.

Restore verifies the selected remote read, full retained Git inventory, committed seed prefix, every immutable ancestor/page/object, and the complete logical input inventory. An explicit remote failure cannot become a successful seed fallback. The active marker only selects the mode; it does not authenticate anything. Later operations revalidate the bytes, predecessor, seed, and source identities. A legacy flat reader refuses an archive-active workspace rather than silently dropping older retained records. Its original normal flat format and refusal limits remain in place.

The filesystem source holds an opaque verified token and compact descriptors. It visits one raw record or observation at a time and rechecks retained bytes around traversal. Foreign and future observations are validated before selection; filtering is not a way to hide corrupt data. Physical current-delta records omitted from their index, duplicate conflicting run keys, changed aliases, symlinks, replaced directories, missing objects, and inconsistent ancestry are rejected.

The original collector bytes and the archive append preflight are bound to the same pinned inventory. Newly generated record/observation files are published before their mutable indexes. Exact retry is permitted; a detected concurrent replacement fails closed. Failures preserve actual acquisition receipts and available raw bytes without manufacturing a new forecast.

### Prediction and evaluation stay reproducible

Issuance finds reusable runs throughout the whole retained archive. It applies the original model identity, options, consumed-input, clock, and reuse rules to every candidate. Replay actually reexecutes every retained forecast from its own preserved input snapshot and frozen model source graph. It rejects a missing or different graph instead of skipping that record.

Evaluation selects target-price vintages globally, then invokes the unchanged frozen evaluator for each record with the exact winning original snapshots. Full component evaluations are preserved in content-addressed bounded pages. The aggregate is a new versioned format, not a relabeled legacy whole-ledger result. Daily errors, mature target scores, pending cases, and actual source acquisition clocks retain their original meanings.

The issuance receipt now points to its immutable original evaluation checkpoint. A later replay can produce a newer evaluation without overwriting that original. The model-readiness consumer validates both checkpoints, every page and target, full record and observation membership, committed source identities, and actual model/global-vintage reexecution. Merely changing summary counts, recomputing hashes, or replacing pages with a subset cannot establish a positive claim. Receipt-only checkpoints can change the physical inventory identity; semantic equality and immutable manifest ancestry are checked explicitly. A changed record or observation inventory requires a fresh issuance/evaluation run.

### Calibration selection does not change with pagination

The paged reducer chooses the first twelve exact-bound disjoint cases across the entire inventory before inspecting outcomes. A missing selected outcome or an earliest-vintage conflict cannot be replaced by the thirteenth, more favorable case. All older same-clock conflicts remain visible, including conflicts hidden by a later unambiguous vintage or another page.

A freeze is allowed only against an immutable post-append archive with no current overlay. Its verification checks the original ancestor and all additional inputs visible at the frozen cutoff. The radius is never refitted using later outcomes. Synthetic fixtures exercise those contracts; no synthetic case is counted as a real prospective forecast, observation, mature window, or calibration freeze.

### Daily read and write permissions are separated

Preparation uses `contents: read`. Only a separate default-branch schedule/dispatch publication job has `contents: write`. The publication handoff contains one copy of the complete candidate archive and two small metadata files. The predecessor is reconstructed from its verified immutable ancestry, then independently checked against the original read.

The handoff binds source commit/tree, workflow run, run attempt, acquisition outcome, predecessor, and every downloaded byte. The publish job downloads only the preparation artifact ID from that exact run. The original publisher still verifies the live remote head before a non-force append. PR and `workflow_run` events cannot enter this write job. An acquisition failure remains a failed workflow outcome even when its failure evidence is successfully preserved. This is an implemented definition on the Draft branch; scheduled operation has not been activated or observed.

### Review evidence keeps the requested disposition and finite capacity

The review packet explicitly records `omitted-by-user` in its manifest, source book, brief, and contract. It does not invent a thesis execution or count omission as a completed external chain. The default required-review mode preserves its original bytes for unchanged inputs.

Source-book capacity is enforced incrementally, including framing and binary-to-base64 expansion, before an overflowing entry is retained. An overflow describes the examined prefix through the first excess entry; it does not claim to have measured unread files. Every declared source and retained evidence byte still needs to fit the separate candidate review bound.

## Evidence already executed

The final local full suite passed **2,080/2,080 in 237.135 seconds**, with zero failures, cancellations or skipped tests and unchanged tracked source before/after. This includes the 2,001-record paged reducer, strict original/latest summary reexecution, legacy active-mode refusal and omitted-review packet regressions. The nine verification commands and four publication/standalone commands all exited zero. Focused suites below overlap with that full suite and must not be added to its count.

| Scope | Actual result |
| --- | --- |
| Affected baseline before integration | 158 passed; no failures or skips |
| Daily handoff and existing archive compatibility | 137 passed in the broader focused run |
| Filesystem/remote operation IO and inventory bindings | 82 passed; no failures or skips |
| Archive operations and corruption cases | 21 passed, including restore/append/second restore beyond 500 observations |
| Actual frozen-model issuer, reuse, replay, evaluation, and failure preservation | 7 passed; 124.88 seconds |
| Review packet plus archive capacity final focused run | 36 passed; no failures or skips |

The large-inventory fixtures exercise 501 observations / 100,500 projected vintage versions and a 2,001-record source without a global flat index. Growth fixtures are synthetic contract evidence, not multi-year market history or a full 2 GiB transport benchmark. The completed combined gate includes the paged readiness traversal for the 2,001-record fixture.

[source-preservation.json](source-preservation.json) verifies **864 original protected files / 48,956,401 bytes unchanged** against the baseline: every original `dist/` file and original `research-data/` file except the explicitly edited review-routing scope. No original tracked file was changed or removed. The three original ETH forecasts were actually replayed with the same IDs, original `issuedAt`, output hashes, and 731 points each. The older asset records' pre-existing source-hash qualification is retained explicitly. An already present ignored publication manifest is separately inventoried and is not confused with original tracked data.

### Actual local CLI execution and network limit

The isolated committed execution at `5d6a4bcd1668ac0e5c98960fc7470e91663830f3` first attempted the real remote read. DNS returned `EAI_AGAIN api.github.com`; the preserved diagnostic is under `diagnostics/`. It was not treated as a successful remote read.

A separate, explicitly committed-seed-only workspace then ran the real CLI chain. Restore, replay, readiness, capacity, append, and verify exited zero. Issuance exited **1** because its actual request failed; its failure receipt was preserved. All three original records and five seed observations remained, with nine pending targets and zero scored targets. Append created zero forecasts and zero observations. This separate offline execution is not a fallback after a failed remote read, successful new acquisition, or remote publication. Its logs and exact receipts are under [offline-execution](offline-execution/).

## Remaining finite constraints

| Boundary | Contract retained |
| --- | --- |
| Complete filesystem source | 40,000 physical files, 2 GiB; duplicate physical aliases count |
| Remote Git archive | 37,121 files, 37,124 tree entries, 2 GiB, bounded received bytes/requests/deadline |
| Production remote read | Verified depth-one Git pack plus bounded metadata requests; the REST full-blob diagnostic has its own per-blob request budget |
| Immutable metadata | 64 MiB metadata, 4,096 pages, 4,096 retained history entries |
| Current-run flat delta | 500 prospective observations, 2,000 records, 1 MiB index |
| Operation evidence | 8 MiB per file; 64 MiB retained receipt collection; 128 entries per receipt page |
| Calibration report batch | 256 bindings and 100,000 requested target dates; every accepted batch still validates all original raw inputs |
| Candidate review source book | 85,000,000 framed bytes; separate from daily archive retention |
| Single-tail price acquisition | Original 290-day base distance and 300-candle provider request boundary |

The archive builder and parts of transport still use bounded complete byte maps. The whole pipeline does not have constant memory, an accepted archive does not guarantee every report fits, and no capacity date or indefinite retention is promised. Capacity diagnostics now show these different effective limits instead of suggesting that removing one flat index removes all constraints.

Actual uninterrupted future daily acquisition/publication, review and adoption of a replacement operating base, the first twelve real nonoverlapping mature cases, exact economic inputs and UTC supply/staking boundaries, later calibrated issuance/evaluation, and any release decision remain separate conditions. Their evidence cannot be created by pagination, replay, larger limits, historical reconstruction, or synthetic fixtures.

## Engineering and ownership

The requested pstack guidance came from upstream commit `c742dd61706fbacc1b95f1a20b7b988cf096ce6c`, including poteto-mode, architecture, swarm, domain modeling, shared-state separation, verifiable units, and proof by execution. Three isolated worktrees separated archive-source, paged-calibration, and daily-handoff edits. Root integrated operational consumers and gates; peer streams then independently checked packet capacity, source preservation, summary validation, and workflow permissions.

These are same-session agent reviews. No unavailable external Grok, Claude, or Gemini execution is claimed. [decisions.tsv](decisions.tsv) records concrete decisions and observed results. The final local and remote verification receipts identify their own exact source commits, trees, commands, artifacts, and qualifications.
