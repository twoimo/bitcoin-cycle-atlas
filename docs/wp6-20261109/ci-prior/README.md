# Prior production model timeout evidence

This is a historical, read-only CI investigation. It is separate from the WP6 implementation, the new branch's test results, and the currently published commit. The structured receipt is [model-timeout.json](model-timeout.json).

## Observed outcome

| Source commit | Model build | Result |
| --- | --- | --- |
| `f798b21` | `9e5576fd-0c06-47fe-bd81-f6fdcc4477f3` | Baseline succeeded: 3,110/3,110 tests in 694.424s; all 13 model gates passed. Build ran 23:56:26Z–00:10:37Z. |
| `ee22086` | `dfc19c47-cb8e-49bb-9441-7d20c29fb03c` | 3,110/3,110 tests passed in 995.630s; first 12 gates passed; final `chart-replay` gate exceeded the global execution deadline. |
| `8d993b6` | `2acf00fe-543e-47e0-806d-d1d0d6bd8770` | `model-tests` exceeded the deadline after 1,123.448s. No test failure line or full-test receipt. |
| `4d31e07` | `022df3ac-ffe5-40bb-9ff4-00af7a10eefc` | `model-tests` exceeded the deadline after 1,095.538s. Runtime/dependency gates passed. No test failure line or full-test receipt. Build ran 06:15:53Z–06:35:20Z. |

All times above are UTC on November 9, 2026, except the baseline's November 8 start. The repository itself imposes a **19-minute total stage deadline** in `scripts/cloudflare-staged-contract.mjs`. The runner allocates each sequential gate only the remaining time. These logs show that repository deadline firing; they do not show an assertion failure or prove the provider's hard timeout fired.

All paginated logs were read: 13 pages / 21,427 lines for the successful baseline; 14 / 21,341 for `ee22086`; 14 / 17,385 for `8d993b6`; 10 / 11,068 for `4d31e07`. The failed run's last printed top-level ordinal was 1659, but this is not a total completion count: TAP contains nested tests and the runner can buffer output. Only the complete `ATLAS_TEST_TOTAL` receipt establishes the full inventory.

## Why this is inherited

`git diff --name-only f798b21 4d31e07` contains four relay JPEGs and `dist/data/relay/index.json`. It contains no test, model, verification, or gate code change.

The unchanged expensive cases slowed substantially:

| Case | Successful baseline | Failed `4d31e07` | Ratio |
| --- | ---: | ---: | ---: |
| Full 2,001-record synthetic growth | 105.958s | 253.000s | 2.39× |
| Real-model issue/reuse/replay/report/append | 106.618s | 210.099s | 1.97× |
| Seed plus 501 synthetic vintages | 77.366s | 159.852s | 2.07× |
| Independent summary replay and complete component pages | 65.629s | 139.775s | 2.13× |

The evidence supports execution-time variation on unchanged verification work. These logs do not contain sufficient per-gate CPU, throttle, memory, or I/O measurements to identify the resource cause. Increasing the pinned test concurrency from two to four is therefore unsupported; the documented worker has two vCPUs.

## Measured fixture option and decision

The archive-summary tests already prepare a repository once and copy it per scenario. The archive-issuer tests repeat their isolated Git graph setup and seed restoration three times. Preparing that issuer fixture once and giving every scenario a full independent filesystem copy would preserve scenario mutation isolation, fresh clocks/capture functions, and all runtime verification assertions. It would not justify reusing any verification, replay, or scoring result.

A scratch-only benchmark executed the **existing, unchanged** `committedOperationFixture` function with canonical Node 24.22.2:

| Measurement | First sample | Second sample |
| --- | ---: | ---: |
| Exact current fixture preparation | 10.980s | 7.648s |
| Seed restore portion | 10.386s | 7.375s |
| Full independent filesystem copy | 0.226s | 0.209s |

Across three scenarios, this suggests only about **15–21 seconds** of avoided setup, before parallel overlap: roughly 3–5% of the observed 455.7s local suite and 1–2% of the failing 1,095.5s remote test gate. A single expensive scenario still pays one initial preparation. These are setup samples, not a demonstrated whole-suite speedup.

**Decision:** leave fixtures, verification algorithms, precision, gate inventory, runtime pins, timeout, and test concurrency unchanged. Run a new complete model verification after the narrow packaging correction. A larger runtime change needs profiling and a separate proof that every original evidence check and mutation-negative control remains intact.

No Cloudflare configuration was changed and no CI build was triggered by this investigation. The full raw baseline and latest-failure pages and scratch benchmark are outside Git. This directory contains only sanitized receipts and conclusions.
