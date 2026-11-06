# Exact CI evidence capacity and browser inventory repair

## Result and source

The actual packet runner passes on local source `37aeb26814b02d101ca57b1742b21540cfee8bb2`, whose remote equivalent is [`05416037845b9dec9b7efbc4068d4b6f676e486e`](https://github.com/twoimo/bitcoin-cycle-atlas/commit/05416037845b9dec9b7efbc4068d4b6f676e486e). Both have tree `1df3a582b23f88f7907926f129e1c21d6e28877d`. The executable `dist` tree remains `7429c879d54c27ecbac9e2c1f4cdb8cd77ad2dc3`.

The rebuilt packet contains **105,806,852 bytes, 872 entries and 588 parts**, with complete declared source access and zero unresolved imports. The book and every part were independently hashed, and concatenating all parts reproduces the exact book hash. This replay used the exact preserved execution-evidence bytes from the failed CI artifact; it is not represented as a fresh CI, browser or mathematical execution. [Machine-readable receipt](rebuild-receipt.json).

## Original failure, preserved

At head `aca73b74a5128a5466488a0c701e86f5e854af46`, [CI](https://github.com/twoimo/bitcoin-cycle-atlas/actions/runs/42191941647), [service](https://github.com/twoimo/bitcoin-cycle-atlas/actions/runs/42191941805) and [Hallmark](https://github.com/twoimo/bitcoin-cycle-atlas/actions/runs/42191941853) passed. The [ETH workflow](https://github.com/twoimo/bitcoin-cycle-atlas/actions/runs/42191941832) passed its complete native **49/49** gate, then failed at evidence packaging. The overall workflow is still recorded as **failure** in [eth-final.json](eth-final.json). Its full native receipt is retained separately, with all 98 source hashes matching the complete corrected local native execution.

The failing capacity error reports 101,070,602 bytes at the first overflowing prefix, **not the complete required size**. The exact artifact (ID `13491063335`) was downloaded and its 70,682,418 ZIP bytes checked against SHA-256 `4b675cb8e9a73a46039929c2950d082cdba3a89829b9cc9d3859262025e3526f`. Every non-PNG file was restored; the original native report binds the screenshot paths and hashes. The [restoration inventory](artifact-restoration.json.gz) records the restored bytes.

An isolated diagnostic used the unchanged packet builder and original scope with a temporary 200,000,000-byte aggregate cap to measure the complete requirement: **105,721,764 bytes in 862 entries**. That temporary cap was never committed as the production setting. [Original complete manifest](original-complete-manifest.json.gz).

## Minimal corrections

The caller now allows a finite **128,000,000-byte aggregate**, leaving 22,193,148 bytes above the complete corrected replay. The independent **85,000,000-byte per-file limit**, packet builder, validation rules and boundary tests are unchanged. This capacity change preserves the full original evidence rather than truncating it, and changes no model, sample-size, review authentication or release conditions.

The declared scope promised all top-level browser JS/CSS/HTML, but ten source payloads were missing from its closure: seven stylesheets (including the locally linked Skullet vendor stylesheet) and three Workers. The additive repair makes every top-level browser source and locally linked root stylesheet an explicit seed. It adds **41 seeds, removes none**, and adds exactly **10 new payloads totaling 79,814 bytes**; the other 31 newly explicit seeds were already reached through imports.

The new single regression independently enumerates all **219 top-level browser JS/CSS/HTML files** and **31 root-index local stylesheet links**. Its [before receipt](packet-inventory-before.json) and [raw failure](packet-inventory-before.log) show the intended missing inventory. The [after receipt](packet-inventory-after.json) and [raw execution](packet-inventory-after.log) show all **31 packet tests passing**, without failures, cancellations or skips, on Node 24.22.1. The original 33,579 test bytes remain an exact prefix, preserving all six existing dynamic-import declaration offsets and fragments. The full suite gains one test; its next CI run records the actual final count.

## Preservation and exact scope

All **335 original execution-evidence files (72,561,957 bytes)** match the original complete measurement byte for byte. No existing source/evidence path was removed. The only changed common source payloads are the caller, review inventory and appended regression. [Corrected complete manifest](corrected-complete-manifest.json.gz).

All **203 protected financial, research and offline IPO inputs (45,414,161 bytes)** still match integrated main `59ec6f4f708e87d73dad6324d925a9e01383411c`. One explicitly recorded metadata exception, `research-data/eth-review-scope.json`, expands the review inventory. The prior 204-file preservation receipt remains an accurate historical record for the original product closeout. [Current protected-input inventory](protected-inputs.json).

All 20 recorded workflow/verification-skill files remain unchanged. Hallmark checker, baseline, severities and eight-route coverage remain unchanged. Adding the existing IPO stylesheet to review evidence does not modify or publish the offline prototype. The ETH candidate remains research-only.

The user-omitted Gemini opposition and reverse review remain `omitted-by-user`; packet generation records no model execution or release authority. [Unchanged disposition contract](review-contract.json).

## Reproduction and subsequent release

Restore the original artifact's non-PNG entries below `build/`. For the complete original measurement, check out `aca73b7`, copy [diagnostic-measurement-runner.mjs](diagnostic-measurement-runner.mjs) to `build/measure-review-packet.mjs`, then run `node build/measure-review-packet.mjs`. The diagnostic differs from the original caller only in its relative helper import, output directory and temporary aggregate cap.

On the corrected committed source, run `node scripts/build-eth-review-evidence.mjs`. The checked-in compressed manifests preserve every source/input identity and all 588 output-part hashes. The full 105.8 MB source book is not duplicated in Git. The existing complete CI artifact preserves the full book on its subsequent successful execution.

The bounded [source review](capacity-review.md) found no concrete blocker in the three-file repair. It was a read-only source review, not an independent model certification.

The final PR head must pass all four existing workflows before merge and publication. These source-bound local receipts make no claim about a future run or a deployed site.
