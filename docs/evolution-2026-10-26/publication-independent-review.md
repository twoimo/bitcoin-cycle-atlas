# Publication and formal-runner independent review — 2026-10-26

## Result and review boundary

**Outcome: updated and verified for the recorded file contents.** The publication contract's baseline and all three intended negative controls reproduce. The four formal runners now reject process crashes and require the exact expected exit code. The code-level source mutations still fail their intended assertions, and restored copies pass. The independent read-only review of the frozen deployment integration found no additional blocker within the documented publication boundary.

This began by following the repository's `verify-publication-state` skill cold, then reading the current upstream pstack `statechart` instructions and help. When actual replay drift appeared, the pstack `maintain-formal-verification-skill` procedure was applied. Verification changes were limited to process-result validation, the isolated replay dependency list and exact mutation selectors, publication model line comments, skill instructions, and generated evidence. No product transition or invariant was weakened by this reviewer.

The evidence is tied to the SHA-256 contents below. The review did not perform Git operations or claim a new committed synchronization point. Final commit synchronization and any required checks after an integration merge belong to the integration owner. A later source change must be compared with these identities before reusing this receipt.

## Findings before repair and verification after repair

| Finding | Classification and reproduction | Repair and result |
| --- | --- | --- |
| Hidden files bypassed the advertised complete local inventory | Product integration bug. A valid temporary artifact containing `index.html` and an additional `.unlisted-public-file` was accepted by the real `checkPublication` entry point; it returned 1. `inventory()` skipped every dot-prefixed entry before file/symlink checks. | The integrating engineer removed the blanket skip and added the hidden-file rejection to the actual manifest regression. The final 12-case contract/manifest run passes, including the previously accepted extra-file case. |
| A terminated verifier process could qualify as an expected negative control | Verifier bug. A temporary `JAVA` wrapper executed the real pinned TLC, let the successful baseline finish, and killed only itself with `SIGKILL` after real negative-control output. The original publication runner printed `PASS` even though the subprocess status was `null`. Expected invariant text and state counts had concealed the abnormal termination. | All four runners now use `scripts/verification-process.mjs`. Launch errors, signals, absent/noninteger statuses and unexpected exit codes are rejected before output is interpreted. The exact wrapper reproduction now exits 1 with `did not exit normally (signal: SIGKILL, status: null)` and produces no passing result. Six Node-only process regressions pass; they include real children that print success/counterexample-looking output before terminating themselves by signal. |
| Publication model guard citations pointed one line before the guards | Verification correspondence drift. The commit guard cited line 18, which was identity-format validation; the actual commit guard was line 19. Other phase and digest/served guards had the same offset. | Corrected only the line-number comments. A comparison with the original copy confirmed that all non-comment TLA text is unchanged. The four chart bundles and publication receipt were regenerated. |
| Equity mutation replay had lost its static dependency closure | Verification harness drift. The isolated initializer failed with `ERR_MODULE_NOT_FOUND` for `treasury-instruments.js`, imported by the current fixture. This was treated as blocked, never as a successful mutation. | Added that module and its leaf dependency `cycle-engine.js` to the isolated copy. No product module was edited. |
| Equity's two exact source selectors no longer described the cache-extended code | Verification harness drift. The post-paint projection guard and old-projection clearing selectors stopped with a selector mismatch. | The post-paint mutation still removes the same `token !== generation` guard, now immediately before `cachedInputs`. The old-projection mutation still removes only the clearing of `projection` and `forecast`, retaining the new cache-reset statements. All 28 original/restored cases and all seven intended mutations pass their required checks. |
| ETH's navigation selector missed the added forecast-bound argument | Verification harness drift. The previous selector expected a three-argument `ethHistoryRange` call, while current code adds `visibleForecast()?.displayEnd`. | Updated the exact selector to the current call. The mutation still replaces the same ownership-preserving branch with unconditional range clearing. All 17 original/restored cases and all nine intended mutations pass their required checks. |
| The default chart font did not contain Korean glyphs | Rendering environment failure. pstack exited 0, but new PNG labels displayed as boxes. Those images were rejected and were not copied into the repository. | Rerendered the verified Mermaid sources using the available Noto Sans KR fontconfig configuration. Inspected the normal graph, all three negative overviews, and all three numbered counterexample PNGs. All seven final PNGs contain readable Korean labels and complete numbered paths. |

The managed execution environment initially blocked Java with `spawnSync java EPERM`. A sandbox-only Node invocation also reported two test-file wrappers instead of the named tests. Neither result was counted as verification. All positive evidence below comes from the authorized execution environment, with actual named cases and tool exits inspected.

## Actual commands and results

The following commands were executed from the repository root with Node 24.22.1 and the pinned TLC 1.7.4 JAR. The JAR SHA-256 is `936a262061c914694dfd669a543be24573c45d5aa0ff20a8b96b23d01e050e88`.

```sh
node --test --test-reporter=tap tests/verification-process.test.mjs tests/publication-contract.test.mjs tests/publication-manifest.test.mjs
node scripts/verify-market-state.mjs /tmp/atlas-publication-review-g54amazq/market-state-final.json
node scripts/verify-equity-state.mjs /tmp/atlas-publication-review-g54amazq/equity-state-final.json
node scripts/verify-eth-state.mjs /tmp/atlas-publication-review-g54amazq/eth-state-final.json
node scripts/verify-publication-state.mjs docs/evolution-2026-10-26/publication-state.json
```

The first command executed **18 named tests, all passing**, with zero failures, skips, cancellations or todos. The formal gates executed **27 TLC runs**: eight completed with exit 0 and all 19 expected invariant violations completed with exit 12. All **21 actual-code mutations** completed with Node assertion exit 1 and matched their intended assertion. The same original and restored suites passed: market 32 cases, equity 28, ETH 17, publication 5. Tool errors, missing dependencies and mismatched selectors encountered during the review are recorded above as blocked attempts, not included in these passing results.

| Gate | Current baseline distinct states | Intended model failures | Actual-code mutations | Original/restored cases |
| --- | ---: | ---: | ---: | ---: |
| Market ownership and history retry | 2,081 and 15 | 2 | 2 | 32 / 32 |
| Equity load state | 46,252 | 7 | 7 | 28 / 28 |
| ETH load state | 2,243 | 7 | 9 | 17 / 17 |
| Publication | 20 | 3 | 3 | 5 / 5 |

The publication [machine-readable receipt](publication-state.json) records the current model/configuration/mapping hashes, runtime hash, real model exit statuses, mutation hashes and mutation exit statuses. The temporary market/equity/ETH receipts named above retain the corresponding full results for integration review. The full TLC results are also tabulated below so the temporary paths are not the only surviving record.

### Observed TLC exit statuses

Generated/distinct counts come from each runner's actual completed TLC output. Negative runs stop at their expected invariant violation; their remaining queue does not represent a completed baseline enumeration.

| Gate | Configuration / property | Exit | Generated | Distinct | Result |
| --- | --- | ---: | ---: | ---: | --- |
| market | `MarketRequests` | 0 | 5,955 | 2,081 | pass |
| market | `MarketRequestsBroken` | 12 | 151 | 109 | expected invariant violation |
| market | `HistoryRetry` | 0 | 37 | 15 | pass |
| market | `HistoryRetryBroken` | 12 | 26 | 13 | expected invariant violation |
| equity | `current` | 0 | 303,261 | 46,252 | pass |
| equity | `original-boot-order` | 12 | 68 | 38 | expected invariant violation |
| equity | `unguarded-prices` | 12 | 40 | 25 | expected invariant violation |
| equity | `unguarded-projection` | 12 | 3,383 | 1,147 | expected invariant violation |
| equity | `unguarded-errors` | 12 | 41 | 26 | expected invariant violation |
| equity | `retained-old-projection` | 12 | 7,255 | 2,253 | expected invariant violation |
| equity | `hidden-ready` | 12 | 265 | 115 | expected invariant violation |
| equity | `overwritten-range` | 12 | 2,317 | 806 | expected invariant violation |
| eth | `current` | 0 | 11,109 | 2,243 | pass |
| eth | `baseline/TypeOK` | 0 | 14,969 | 3,503 | pass |
| eth | `baseline/ReadyHasUsableView` | 12 | 36 | 23 | expected invariant violation |
| eth | `baseline/NoHiddenPublication` | 12 | 31 | 21 | expected invariant violation |
| eth | `baseline/NoStalePublication` | 0 | 14,969 | 3,503 | pass |
| eth | `baseline/NavigationSurvivesRefresh` | 12 | 268 | 145 | expected invariant violation |
| eth | `baseline/ReadinessOnce` | 0 | 14,969 | 3,503 | pass |
| eth | `unguarded-response/NoStalePublication` | 12 | 14 | 8 | expected invariant violation |
| eth | `unguarded-error/NoStalePublication` | 12 | 15 | 9 | expected invariant violation |
| eth | `hidden-render/NoHiddenPublication` | 12 | 31 | 21 | expected invariant violation |
| eth | `lost-navigation/NavigationSurvivesRefresh` | 12 | 289 | 160 | expected invariant violation |
| publication | `Publication` | 0 | 25 | 20 | pass |
| publication | `stale-source` | 12 | 18 | 14 | expected invariant violation |
| publication | `changed-files` | 12 | 20 | 15 | expected invariant violation |
| publication | `served-mismatch` | 12 | 22 | 17 | expected invariant violation |

## Publication code correspondence and chart evidence

The publication runtime remains a set of synchronous pure transitions. The source and file identities are fixed for one candidate; the model has two possible current identities and an unset monitor value. The corrected anchors in `Publication.tla` point to these actual guards:

| Model action | Actual runtime condition |
| --- | --- |
| `Validate`, `Reject` | `validatePublication`: collected-phase guard at line 11 and validation/digest guard at line 13 |
| `Prepare` | `preparePublication`: verified-phase guard at line 17, source identity at line 19, content and validated-digest identity at line 20 |
| `Confirm` | `confirmPublication`: ready-phase guard at line 24 and served source/content identity at line 26 |

The three numbered counterexample stories remain deliberate guard-removal controls:

1. **Source identity:** collect → source changes → validate → prepare an old-source candidate. This breaks `PreparedRevisionMatches` only when its guard is removed. The real source-guard mutation fails the matching behavioral assertion.
2. **Content identity:** collect → validate → files change → prepare the changed content. This breaks `PreparedContentMatches` only when its guard is removed. The real digest-guard mutation fails the matching assertion.
3. **Served identity:** collect → validate → prepare → confirm a different served identity. This breaks `ConfirmedIdentityMatches` only when its guard is removed. The real confirmation-guard mutation fails the matching assertion.

The matching unmodified functions reject these outcomes. These are not claims that three production incidents occurred.

All chart counts below come from the regenerated `summary.json` files. The baseline graph contains 20 model states and 24 model transitions, grouped into 12 visible states and 20 visible transitions. No invariants break in the baseline. Each negative graph has one displayed rule-breaking class; the served mismatch class contains three concrete bad identity combinations.

| Bundle | Model states | Visible states | Visible transitions | Bundle SHA-256 |
| --- | ---: | ---: | ---: | --- |
| `publication-statechart` | 20 | 12 | 20 | `96b7e2bb6cfbb6a1ab5ada357ffa1f4f08e2b445b5138eb08835466a1098bd12` |
| `publication-stale-source` | 24 | 12 | 21 | `731250f94b4efb55e804fa16b1b1e4f4a77eb0a6bd028be43eb0bf42123973f9` |
| `publication-changed-files` | 24 | 13 | 21 | `b52c0f71f8b314574aa4bb0fa2bc3fc16719e54b13c66aef110adf4e149f64c9` |
| `publication-served-mismatch` | 20 | 13 | 20 | `e6aa880abb0a017fbde5f2800ee29d4d38cba2f18e237f1f42c7083b7f19ee2e` |

A bundle digest is the SHA-256 of compact UTF-8 JSON containing its sorted `[{"path": relativePath, "sha256": fileSha256}, ...]` inventory. All 70 generated files in the four bundles were copied after final visual inspection.

- [Normal graph PNG](publication-statechart/chart.png), [Mermaid](publication-statechart/chart.mmd), [summary](publication-statechart/summary.json), [stories](publication-statechart/stories.md).
- [Source guard counterexample PNG](publication-stale-source/bug-1.png), [Mermaid](publication-stale-source/bug-1.mmd), [story](publication-stale-source/stories.md).
- [Content guard counterexample PNG](publication-changed-files/bug-1.png), [Mermaid](publication-changed-files/bug-1.mmd), [story](publication-changed-files/stories.md).
- [Served identity counterexample PNG](publication-served-mismatch/bug-1.png), [Mermaid](publication-served-mismatch/bug-1.mmd), [story](publication-served-mismatch/stories.md).

To reproduce charts, first copy `verification/publication-state/` to a scratch directory outside the repository. Follow the installed pstack `statechart` help to locate its script. Set `ATLAS_PSTACK_STATECHART` to that script, `ATLAS_MODEL_COPY` to the copy, `ATLAS_TLC_JAR` to the verified JAR, and `ATLAS_KOREAN_FONTCONFIG` to a fontconfig file whose `system-ui` resolves to a Hangul-capable font. The review used `/tmp/atlas-statechart-fonts/fonts.conf`, selecting Noto Sans KR.

```sh
TLA2TOOLS="$ATLAS_TLC_JAR" FONTCONFIG_FILE="$ATLAS_KOREAN_FONTCONFIG"   node "$ATLAS_PSTACK_STATECHART" from-spec "$ATLAS_MODEL_COPY/Publication.tla"   --config "$ATLAS_MODEL_COPY/Publication.cfg" --map "$ATLAS_MODEL_COPY/Publication.map.mjs"   --title '검증한 자료 묶음의 발행 상태' --out "$ATLAS_MODEL_COPY/publication-statechart" --png
```

Run the same command for `stale-source.cfg`, `changed-files.cfg`, and `served-mismatch.cfg`, with the separate output folders and `--expect-broken PreparedRevisionMatches`, `--expect-broken PreparedContentMatches`, and `--expect-broken ConfirmedIdentityMatches`, respectively. Inspect every PNG. Source mapping comments were corrected before regeneration; TLA expressions, configurations and mapping functions were not changed.

## Frozen deployment integration review

The final pass read the frozen bytes of all four workflows, `package.json`, `scripts/package-release.mjs`, and `tests/deployment-publication.test.mjs`. The reviewed hashes are recorded below. This was a local code/configuration review; it did not execute GitHub Actions, create a release, deploy Pages, or claim a live HTTP confirmation.

CI and Pages order the test/forecast gates before publication preparation, verify the prepared directory, then build and verify the standalone output. The formal npm command includes publication verification. Pages and refresh pass the prepared commit and manifest hash explicitly between jobs, check current main before upload and again before deployment, check out the exact prepared source in the deploy job, and run a four-attempt public confirmation loop that retains both expected identities.

The refresh workflow records actual provider attempt outcomes separately from provider collection timestamps, preserves the existing judgment-capture success gate, checks its staged-file allowlist, and prepares publication after committing the validated refreshed source. The release path checks source cleanliness and identity, can validate and reuse an already preserved manifest, uploads that manifest before the remaining assets, and refuses differing existing asset bytes. The release-recovery branch distinguishes an actual HTTP 404 from other lookup failures. These correspond to the documented operational protections; they are outside the TLA state model.

## Limits that remain explicit

- The publication model covers one candidate, finite source/content identity choices, and synchronous transition guards. It does not model changes after `ready`, concurrent GitHub jobs, remote deployment atomicity, filesystem transactions, retries, availability, or cryptographic publisher authenticity.
- Current-main checks are observations at specific moments. They are not a lock spanning a remote deployment. The local byte inventory and metadata checks are real-code regressions, not a TLA proof of the filesystem.
- Public confirmation checks the expected manifest identity and the bodies of exactly four critical files: `index.html`, `site-entry.js`, `data/btc-daily.json`, and `data/forecast-ledger/index.json`. It does not fetch or certify every remote file. The returned confirmed result is withheld if any sampled body differs.
- Market, equity and ETH are separate bounded state abstractions and injected-boundary initializer replays. They do not compose into an unrestricted whole-program proof. The new capital-policy, liquidity, projection-cache/recalculation and scenario modules have not acquired a proof of all their state safety merely because the existing ownership gates pass.
- Forecast accuracy, financial-model validity, numerical correctness, visual pixels, browser scheduling and liveness remain outside these formal checks and require their own evidence.
- The new skill text now accurately describes automatic download of a missing default pinned JAR, failure of a missing explicitly supplied JAR or failed download, strict subprocess exit expectations, and the Korean-font requirement. Its frontmatter passed the skill-creator validator. Synchronization commit metadata is left for the final committed-source review.

## Reviewed file identities

These hashes freeze this review's exact contents. They do not silently advance when another integration step edits a file.

| File | SHA-256 |
| --- | --- |
| `dist/publication-contract.js` | `faa94f8819b6c51bdf7716e2b650f8acf80ee410b6d21e96f3b792dd2ff10cc6` |
| `scripts/build-publication.mjs` | `1db73b230049530cb501c7b8212497f91e6c48978c047766bf3ba17316c9151e` |
| `scripts/verification-process.mjs` | `7e6508b78184e70755df5d9c923ecceefcdcf9921e326fa7b92a431c9b7988be` |
| `scripts/verify-publication-state.mjs` | `9b823b9ce687bbf36fe541c2c9b6a1e3b709018bb92c2a4e74b9cca0d5dfb4fb` |
| `scripts/verify-market-state.mjs` | `6307b4600a7e463083fac2ab7025becbd1246e0f7ee200278f08b4f13db2f4fb` |
| `scripts/verify-equity-state.mjs` | `f45ce6ae61241230423f5aab18089accd059dfc1b70c653219b46e10f234478a` |
| `scripts/verify-eth-state.mjs` | `e024f8d4fd293efd448380a1bc9becff6412cad7705ccb2150d38d9e0c09d7c4` |
| `tests/verification-process.test.mjs` | `2014425ce75a2fd1457bbe746266d6a308237819aa4080f14993f4f33f5e9878` |
| `tests/publication-contract.test.mjs` | `13d5fa7d8e4d5406f8f360f77ae4e298df310eeeeb15c1501a9c6a893c14c08e` |
| `tests/publication-manifest.test.mjs` | `f5d218e5918faf790d6cee75fc8dc53203562ca04d6b5e63df0da2adb1c15829` |
| `tests/deployment-publication.test.mjs` | `e50eada238a98d338fa0702451b480b86d067f579dda56301aca7e0cf7148c94` |
| `verification/publication-state/Publication.tla` | `fbe13fb35f7a7f78e0d075930999b463bdbff7ccf1afbc274c328aaf9e1fc031` |
| `verification/publication-state/Publication.cfg` | `d5d3f5e116276bd7270d037742ec2712fdd78ed35461ae347a46b00917f8118a` |
| `verification/publication-state/stale-source.cfg` | `76e6d43ee6fae636b40c8952249cf6dd885c72c24e0511de0f71a9b589039a28` |
| `verification/publication-state/changed-files.cfg` | `e949f78dbe6fcb188dd94b9ebd73eac81d646c3165d0adf49eefc2a5f7a6bf45` |
| `verification/publication-state/served-mismatch.cfg` | `114f1abf61e830974584df4ab7f44a52a828b66c6b893fc856f5ff44e193339e` |
| `verification/publication-state/Publication.map.mjs` | `2dba2022069d29c3791f3b58b6bf8ed10419c76822716a62686b95e1932f0873` |
| `.agents/skills/verify-publication-state/SKILL.md` | `1be90c5387485adb1637b82bfb7f0e47c2c33991a7d8d10e0a662c082472f6ae` |
| `docs/evolution-2026-10-26/publication-state.json` | `349c4fd59ccc8c4d4d75476ecf3198e3065a5f595538162db3a35151f92922a9` |
| `docs/evolution-2026-10-26/PUBLICATION_VERIFICATION.md` | `5b6ade3a731b1021d929d4d8f06067852f123fa4af87379b9c3ba12b46c16fa6` |
| `dist/market-data-controller.js` | `978ad14a70fdb3011f0761ceb7c6f6ebc0d37bc0b25aa047ad2ef2014eff07d6` |
| `dist/equity-view.js` | `8db93687e160f11298f66e09da035e4eb30e79d7d516526803a941d7603f1ba0` |
| `dist/eth-view.js` | `51202d57377b6da50f4db0d1c3e33745dfcea8b897fe269a2f5f366f82784168` |
| `dist/treasury-instruments.js` | `784b98684b5ffe6c8bb747b1bb6eac6cd658221a3cfa29e5c64c11b6711b102f` |
| `dist/cycle-engine.js` | `f6b88a839f22b96c72306e87bd4760337d259a3190830325b570520472c84346` |
| `tests/helpers/equity-view-fixture.mjs` | `5aa474c045a785a8f050da9f24065bff87bae76978afb005ec5c09466b55fce9` |
| `package.json` | `9cc4e10c53fa38708065266d5ff74b2550be8c90855d11bd82274a9ce28418fe` |
| `scripts/package-release.mjs` | `f904083d1450c605d61e5de04f3d6bd4cd3e84f0e28925bdb99024f18f77ea61` |
| `.github/workflows/refresh-data.yml` | `658b5c305f7df0dda21470db8e90f770e66074b19bb5cae404ac7dee4a249b1c` |
| `.github/workflows/pages.yml` | `bd32e3b286d0b5ba9541b186efbcb90b0882f4c6d5f430f6237bef414dad378a` |
| `.github/workflows/ci.yml` | `81879be3b4507eadf6d7c62840342b189c79fab8adc9517595fa0e28bb92768e` |
| `.github/workflows/release.yml` | `fa45a49ad88cdc34a1532a0748c694d2bb8fd4685ddfeb9b2943bc3f4b00a901` |
