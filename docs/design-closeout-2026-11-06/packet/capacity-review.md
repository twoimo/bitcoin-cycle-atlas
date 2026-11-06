# Packet capacity and scope review — 2026-11-06

**Verdict: PASS_WITH_NOTES. No concrete blocker found in the bounded three-file delta.**

## Source identity

- Base: `aca73b74a5128a5466488a0c701e86f5e854af46`.
- Reviewed commit: `37aeb26814b02d101ca57b1742b21540cfee8bb2`; tree: `1df3a582b23f88f7907926f129e1c21d6e28877d`.
- The `dist` tree is unchanged: `7429c879d54c27ecbac9e2c1f4cdb8cd77ad2dc3`.
- The packet builder/validator is unchanged: Git blob `31d852155c046ae0eaf395a0964255b74371a7cd` at both revisions.

The comparison changes only `scripts/build-eth-review-evidence.mjs`, `research-data/eth-review-scope.json`, and `tests/eth-review-packet.test.mjs`.

## Findings

**Capacity:** the evidence caller changes the finite aggregate budget from 100,000,000 to 128,000,000 bytes while explicitly retaining the 85,000,000-byte file ceiling. Its comment identifies the complete original-artifact measurement of 105,721,764 framed bytes in 862 entries, before the additive inventory correction. It does not mistake the earlier overflowing prefix for the complete size. No evidence selector, archive deduplication rule, framing format, ingestion guard, byte/hash validator, or source-access gate is changed.

**Scope:** the seed list grows monotonically from 483 to 524 entries: 41 additions and no removals. Every other scope field, including all dynamic declarations, remains identical. This makes already-recursed top-level modules explicit and adds the previously missing stylesheets, workers, and linked vendor stylesheet. It preserves the declared browser scope without changing product files.

**Omitted review:** `externalReviewDisposition: 'omitted-by-user'` remains unchanged. The unchanged builder continues to bind omitted stage status, absent recorded model executions, false authentication, and false release authority into its manifest/book/contract semantics. The final `SOURCE_MISSING` rejection remains intact.

**Regression:** one test is appended at EOF. It independently enumerates actual top-level browser JS/CSS/HTML and local stylesheet links in the root index, handles stylesheet query strings, and excludes external stylesheet origins. It tests explicit inventory coverage rather than a copied list or capacity constant. The original 33,579 test bytes remain an exact prefix. All six declaration offsets and fragments are intact: 1732, 1759, 2552, 4501, 16452, and 17117. The only added dynamic import is the recognized Node builtin `node:fs/promises`.

## Preserved verification and limit

The [before receipt](packet-inventory-before.json) records the intended inventory assertion failure against 483 seeds. The [after receipt](packet-inventory-after.json) records 31/31 focused packet tests passing on Node 24.22.1, with zero failures, cancellations, or skips. Its scope/test SHA-256 values match the reviewed committed files.

No tests were rerun and no source was edited during this review. Complete-artifact rebuild and final CI outcomes remain established by their separate execution receipts; this source review does not substitute for them.
