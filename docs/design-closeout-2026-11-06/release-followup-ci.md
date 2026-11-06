# CI evidence packaging capacity — 2026-11-06

## Finding and correction

The final-head ETH candidate workflow reached and passed its complete native browser gate, then failed while packaging the required source and execution evidence. The existing 100,000,000-byte aggregate limit was smaller than the actual complete source book. This was a deterministic packaging capacity failure; its refusal was correct and is preserved below.

The correction in [build-eth-review-evidence.mjs](../../scripts/build-eth-review-evidence.mjs) changes only the explicit aggregate capacity to **128,000,000 bytes**. The independent **85,000,000-byte per-file limit**, complete source scope, recursive import discovery, every unique archive payload, browser receipt, framing format, and finite ingestion checks remain intact. No runtime product code, test assertion, sample requirement, empirical maturity condition, omitted review stage, or release authorization is changed by this correction.

## Original CI identity and failure

| Item | Observed value |
| --- | --- |
| PR | [#62](https://github.com/twoimo/bitcoin-cycle-atlas/pull/62) |
| Original head | `aca73b74a5128a5466488a0c701e86f5e854af46` |
| Original Git tree | `1f18486be46dbc8c852fcbadfe844bc78d948fb1` |
| Workflow | [ETH candidate evidence 42191941832](https://github.com/twoimo/bitcoin-cycle-atlas/actions/runs/42191941832) |
| Job | [evaluate 127805831888](https://github.com/twoimo/bitcoin-cycle-atlas/actions/runs/42191941832/job/127805831888) |
| Failed step | Bind exact committed sources inputs and execution evidence for external review |
| Failure time | 2026-11-06T09:27:58Z |
| First overflowing prefix | 101,070,602 bytes, entry 835; 834 entries retained |
| Original aggregate limit | 100,000,000 bytes |
| Retained artifact | [13491063335](https://github.com/twoimo/bitcoin-cycle-atlas/actions/runs/42191941832/artifacts/13491063335) |
| Artifact size | 70,682,418 bytes |
| Independently verified artifact SHA-256 | `4b675cb8e9a73a46039929c2950d082cdba3a89829b9cc9d3859262025e3526f` |

All earlier workflow steps completed successfully. The preceding browser report has `status:passed`, `caseScope:all`, declared/expected case count **49**, zero failures, and exact source `aca73b7`. It ran from 2026-11-06T09:13:39.845Z to 09:27:44.478Z. Its integrity receipt checked **98 files**, with no changed source. This is a browser success at that original head, not a claim that the whole workflow passed or that a later head inherits the same result.

The original 5,519,619-byte `eth-browser/report.json` has SHA-256 `a38c9f65bd7b0337f1f2c8942fe86f232866e87a25e1717c7842c32f671de0d1`.

### Preserved original log excerpt

```text
2026-11-06T09:27:46.0226913Z ##[group]Run node scripts/build-eth-review-evidence.mjs
2026-11-06T09:27:46.0227166Z node scripts/build-eth-review-evidence.mjs
2026-11-06T09:27:46.0269922Z shell: /usr/bin/bash -e {0}
2026-11-06T09:27:46.0270084Z ##[endgroup]
2026-11-06T09:27:58.1337359Z file:///home/runner/work/bitcoin-cycle-atlas/bitcoin-cycle-atlas/scripts/build-eth-review-packet.mjs:149
2026-11-06T09:27:58.1337997Z       const entryCount=records.size+1,error=new RangeError('Source book exceeds byte bound: '+nextBytes+' > '+maximumBundleBytes+' bytes ('+entryCount+' entries)');
2026-11-06T09:27:58.1338400Z                                             ^
2026-11-06T09:27:58.1338529Z 
2026-11-06T09:27:58.1338731Z RangeError: Source book exceeds byte bound: 101070602 > 100000000 bytes (835 entries)
2026-11-06T09:27:58.1339474Z     at retain (file:///home/runner/work/bitcoin-cycle-atlas/bitcoin-cycle-atlas/scripts/build-eth-review-packet.mjs:149:45)
2026-11-06T09:27:58.1340238Z     at buildEthReviewPacket (file:///home/runner/work/bitcoin-cycle-atlas/bitcoin-cycle-atlas/scripts/build-eth-review-packet.mjs:197:5)
2026-11-06T09:27:58.1341031Z     at async file:///home/runner/work/bitcoin-cycle-atlas/bitcoin-cycle-atlas/scripts/build-eth-review-evidence.mjs:66:16 {
2026-11-06T09:27:58.1341378Z   code: 'REVIEW_BUNDLE_TOO_LARGE',
2026-11-06T09:27:58.1341544Z   bundleBytes: 101070602,
2026-11-06T09:27:58.1341707Z   maximumBundleBytes: 100000000,
2026-11-06T09:27:58.1341864Z   entryCount: 835,
2026-11-06T09:27:58.1342003Z   budgetStage: 'ingestion',
2026-11-06T09:27:58.1342397Z   firstExcessPath: 'build/ethereum-prospective-ledger/observations/5fca9b9be01e8c0adabcc529de7e874b0c920da0bd9395c9ea2c4a966a45e801.json',
2026-11-06T09:27:58.1342777Z   retainedEntryCount: 834,
2026-11-06T09:27:58.1342990Z   measurementScope: 'ingested-prefix-through-first-overflow'
2026-11-06T09:27:58.1343206Z }
2026-11-06T09:27:58.1343266Z 
2026-11-06T09:27:58.1343322Z Node.js v24.22.2
2026-11-06T09:27:58.1560325Z ##[error]Process completed with exit code 1.
```

## Complete reconstruction from the actual failed artifact

The artifact was downloaded and its ZIP hash independently matched. An isolated checkout at the exact original head received the original emitted files. The unmodified production command reproduced the same **101,070,602-byte / entry-835** error and same first-excess path.

A separate diagnostic called the unchanged packet builder with the same seed paths, dynamic declarations and generated evidence, but an explicit 128,000,000-byte aggregate budget. This did not change the historical workflow result. It allowed the complete required book to be measured:

| Measurement | Exact value |
| --- | ---: |
| Declared source seeds | 483 |
| Committed files including recursive dependencies | 527 |
| Generated evidence files | 335 |
| Complete framed entries | 862 |
| Complete book bytes | 105,721,764 |
| UTF-8 source parts | 588 |
| Largest single retained file | 10,287,828 bytes |
| Per-file limit retained | 85,000,000 bytes |
| New finite aggregate limit | 128,000,000 bytes |
| Remaining aggregate capacity for this measured book | 22,278,236 bytes |

Complete source-book SHA-256: `3047ea97de86fd08502cce870e68ebd7be172f4922c8c67d334c46e8eef7c29b`.

The diagnostic returned `sourceAccess:complete-for-declared-scope`. An independent Python framing reader then compared **every one of the 527 committed payloads against its Git blob and all 335 evidence payloads against the original artifact files**. It verified all per-entry byte counts and SHA-256 hashes, consumed the exact complete book without trailing bytes, and separately reconciled all 588 parts to the book hash. Every comparison passed.

The measured manifest is 667,600 bytes, SHA-256 `604af173695d7decf64720864393ab205ed268b2dab891a282b55b6a3778bda6`; the unchanged declared scope is 39,787 bytes, SHA-256 `bed85d317b95c2bf09e5d6c0126b7c4bbc256b14cc614e0e0d7f466e003a5f7e`. The full 105 MB book and the ZIP remain generated artifacts rather than duplicated committed evidence.

The largest contributors include:

| Retained entry | Bytes |
| --- | ---: |
| `build/ethereum-model-comparison.json` | 10,287,828 |
| `build/eth-browser/report.json` | 5,519,619 |
| `build/ethereum-economic-ablation.json` | 5,367,334 |
| `dist/data/asset-comparison.json` | 3,425,401 |
| `build/asset-forecast-ledger/snapshots/f438b7bbfefe88f81c0c5644af15080f6f960fb2aad28f817fe665ac6d884812.json` | 2,787,081 |
| `build/asset-forecast-ledger/snapshots/2e8527d1d9f4f40a736431ba77351b29ef1f974bc261fd0f04cb6188b7699b4c.json` | 2,783,432 |

## Alternatives and finite scope

Extending content deduplication to every generated evidence file was measured before implementation. The 483 declared seeds contribute 32,219,604 raw bytes, and the 335 selected evidence files contribute 72,561,957 raw bytes. Deduplicating generated files against seeds and other evidence would save only **3,252,102 bytes**. The remaining **101,529,459 raw bytes** already exceed 100 MB before recursive source dependencies and framing. An additional alias contract would therefore add complexity without solving this failure under the unchanged cap.

Splitting the collection into several books would require a new complete-inventory and cross-book validation contract. That is unnecessary for this observed 105,721,764-byte payload. The chosen correction retains the existing single-book format and all evidence, while providing a measured finite capacity. It does not promise indefinite archive growth: later input sets must still fit both limits, and overflow must continue to fail closed.

## Focused regression

The existing behavioral tests were rerun without weakening or rewriting their assertions:

```sh
node --test tests/eth-review-packet.test.mjs tests/ethereum-prospective-archive-capacity.test.mjs
```

Result on local **Node v24.22.1**: **39 tests passed; 0 failed, cancelled, skipped or TODO**. The original CI used Node v24.22.2; these executions remain distinguished. The existing tests cover exact aggregate acceptance and one-byte overflow, UTF-8 and binary framing, ingestion-time refusal before later files are read or output is written, independent source/evidence per-file ceilings, invalid numeric limits, source binding and honest archive capacity reporting.

| Checked file | SHA-256 |
| --- | --- |
| Modified `scripts/build-eth-review-evidence.mjs` | `3bbf1c688869989fb518edc1df0711946d1dd07cb0c26c92b3fec3dfe0745a8b` |
| Unchanged `scripts/build-eth-review-packet.mjs` | `9e60830aeda0d3f9833f9d1f4bf8e39543a51973c60669c32d936c49cc2b0ae1` |
| Unchanged `tests/eth-review-packet.test.mjs` | `d2bd7d217d03900fec1a768d223e97b7768b4974125c3a94ad4cce7e6e497252` |
| Unchanged `tests/ethereum-prospective-archive-capacity.test.mjs` | `9f3979557e7c3706aa284477b21312cd438bdfa5b13376691d864cc90dd64901` |
| 4,450-byte focused test log | `280db770bf56d9234ae28c2af2ec260d1b0318380626354559228b5b0bfa5231` |

The reconstruction and complete-book hash above identify the original frozen head and original CI inputs. The local focused tests identify the modified script by hash. The final combined commit still needs its own complete CI and publication verification; neither the diagnostic nor the earlier 49-case pass is substituted for that gate.

