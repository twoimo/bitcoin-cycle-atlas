# Release version follow-up — preserved failed attempt

The release version must identify new source without changing an existing tag or its published assets. The existing [`v1.31.2` tag](https://github.com/twoimo/bitcoin-cycle-atlas/releases/tag/v1.31.2) identifies commit `94a1b1dda9eb359de70747043808340da369d087`. The unchanged [release workflow](../../../.github/workflows/release.yml) rejects a tag whose commit differs from the source being published and refuses to replace existing assets with different bytes.

The first correction updated the package and lockfile to **1.31.3**, while retaining runtime import query strings at **1.31.2**. The existing replay fixtures derive their allowed import identities from `package.json`; their strict module-linking checks therefore rejected that incomplete version synchronization. Those fixture checks remain intact. The required follow-up synchronizes the runtime asset query versions and rebuilds the existing generated wrappers before another exact-head verification.

## Observed failed attempt

| Item | Observed value |
| --- | --- |
| Associated PR head | `ada2f3c645b3023f93b0f0799daf9b57481b57cc` |
| Source tree | `397cf7dd9bd2d78c4c8d9057107c5a9481938b02` |
| Product `dist` tree | `7832034a94a43d2186be6bdf7377499d1ac42edb` |
| Workflow/job | [42202007133 / 127839879462](https://github.com/twoimo/bitcoin-cycle-atlas/actions/runs/42202007133/job/127839879462) |
| Runtime | Node v24.22.2 |
| First failing step | Candidate equations, missing inputs, clocks and future-information boundaries |
| Failing command | `npm run verify:chart-replay` |
| Test counts in that command | **155 total; 125 passed; 30 failed; 0 cancelled, skipped or TODO** |
| Failure signature | Actual `./chart-replay-state.js?v=1.31.2`; expected `./chart-replay-state.js?v=1.31.3` |

Twenty-seven coordinator cases failed at the same strict version comparison in `tests/chart-replay-ui.test.mjs`. Three cutoff cases failed with `ERR_VM_MODULE_NOT_MODULE` because their version-keyed fixture table had no entry for the stale import. These failures occurred before their replay behavior could run. No separate numerical failure was found in this job.

The workflow's subsequent **32 steps were skipped**, including the native browser and review-packet steps. The always-run artifact uploader then failed because no evidence had been generated. **This attempt produced no native result and no ETH evidence artifact.** The prior `c259539` workflow was superseded and cancelled during its native step; that cancellation establishes neither a native pass nor a native failure.

## Complete raw evidence

The [complete original job log](eth-ada2f3c-job-127839879462.log.gz) is compressed with gzip level 9 and **mtime 0**. It preserves all **230,322 raw UTF-8 bytes**, including original timestamps and control sequences. Its decompressed SHA-256 is:

```text
b133e9489461f14d6daa3f2a05f91e73313b3bc986868c85960b98457a153827
```

[receipt.json](receipt.json) records the compressed and raw hashes, exact source identities, original test counts, failure cause and unexecuted stages. Decompression was compared byte for byte with the connector's complete original log. No excerpts replaced the original evidence.

This directory records a failed historical attempt. The corrected final head and its native/evidence verification remain **pending here**; subsequent final status is recorded in [PR #62](https://github.com/twoimo/bitcoin-cycle-atlas/pull/62). An earlier pass, cancelled run or version-only source comparison cannot substitute for the corrected head's required gates.
