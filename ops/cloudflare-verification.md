# Cloudflare verification and operational migration

The seven former GitHub Actions definitions are retained byte for byte under
`ops/github-actions-archive/`. They cannot execute from that path. Their hashes,
replacement commands and scheduling obligations are in `ops/ci-migration.json`.
The original shell, immutable archive and publication negative controls still
execute as tests against these preserved contracts. New tests separately check
the actual Cloudflare runner and receipt rejection behavior.

## Required deployment build

Set `NODE_VERSION=24.22.2` and `SKIP_DEPENDENCY_INSTALL=1` in Workers Builds.
The repository's locked install is part of the verification runner. Use:

```sh
npm run verify:cloudflare && npm run build:cloudflare
```

The deployment command is `npm run deploy:cloudflare`. Deployment requires the
successful source-bound receipt created by the complete verification command.
An inspect-only run, partial browser scope, failed step or old source cannot
produce a valid deployment receipt. A local preview is not a verified release.

`node scripts/verify-cloudflare-build.mjs --inspect` reports the actual build
image without installing tools. It invalidates any previous PASS receipt.
`node scripts/bootstrap-cloudflare-build.mjs --inspect` only records runtime
capabilities. Neither inspection proves that Chrome, PostgreSQL or TLC ran.

The complete command retains the following gates:

| Area | Executed checks |
| --- | --- |
| Source and runtime | Clean exact commit/tree; canonical Node24.22.2 Linux/x64; locked npm install; generated pages/domain/Skullet parity |
| Application | TypeScript; every React panel test; production web build; real isolated PostgreSQL17.11 service/API/migration/rollback tests |
| Financial and archived data | Entire model suite, forecast/research/event/treasury/numerical/cycle checks; independent review and arithmetic controls |
| Lifecycle | TLC1.7.4 positive models and their existing negative controls; replay lifecycle verification |
| Native browser | Full ordered53-case inventory, native CDP input, actual full Chrome rendering, source hashes before/after, screenshots and runtime/resource failures |
| Publication | Committed publication manifest, standalone build and static verification; final Cloudflare assets are independently checked by the packager |

The native browser suite serves the checked-out `dist` bytes using a local HTTP
server. It does not require Docker, a browser service or Puppeteer. It retains
all existing case scopes; the deployment runner forces `all`. Failure images
remain logged and every PNG remains in `build/eth-browser`. The runner checks
every PNG's byte length/hash before accepting the browser receipt. Build logs
are not a replacement for long-term research evidence storage.

## Actual build prerequisites

The documented Workers Builds image is Ubuntu24.04 x86_64. The preinstalled
tool list does not promise Chrome, fontconfig, Java, PostgreSQL, Docker or
passwordless sudo. The actual verification-only Build on2026-11-07 confirmed
Ubuntu24.04.2, UID2500, canonical Node,2CPU/8GB, no Java/PostgreSQL and no sudo.
The bootstrap therefore writes only to its own `build/cloudflare-tools` tree.
It never installs system packages, edits system package sources or needs root.

Temurin JRE21.0.13+9 is downloaded from the official Adoptium release with its
committed SHA-256. PostgreSQL server and client executables are pinned to
`17.11-1.pgdg24.04+2`, matching the previous17.11 service contract. The portable
protocol library is separately pinned to libpq18.6. All three exact DEBs are
verified against committed SHA-256 values and extracted without running package
maintainer scripts. Those pins were checked against PGDG's signed Noble
InRelease and authenticated package index on2026-11-07, using fingerprint
`B97B0AFCAA1A47F044F244A07FCC7D46ACCC4CF8`.

After extraction, `ldd` checks Chrome, PostgreSQL tools and its LLVM JIT module.
Only missing libraries are requested through a private APT cache using Ubuntu
archive signatures and package hashes. APT runs in download-only mode; the
verified DEBs are extracted into the same user-owned tree. No Docker is used.
Each full test run starts its own loopback-only disposable database and cleans
it up afterward. It never uses a supplied production database URL.

`node scripts/bootstrap-cloudflare-build.mjs --verify-runtime` performs the
bounded actual-host smoke check: pinned tools, initdb, server start, SQL check
of exact server version170011, shutdown and cleanup. Its `RUNTIME_VERIFIED`
preflight receipt does not qualify as a full verification or deployment PASS.
Scheduled refresh producers can call `bootstrapCloudflareFormal` to obtain the
same canonical Node/Java/TLC tools without downloading Chrome or PostgreSQL;
that receipt is explicitly `FORMAL_TOOLS_READY` and cannot replace UI gates.

Full Chrome for Testing157.0.8103.38 is pinned by the SHA-256 of the actual
official Linux archive. `--headless=new` preserves the full Chrome renderer.
The older `chrome-headless-shell` is not substituted. The same Noto Sans CJK KR
font and license Git blob hashes from the former workflows are retained.
TLC1.7.4 retains its original SHA-256 pin. Runtime receipts record actual
versions, paths and execution duration without exposing environment secrets.

The free plan provides3,000 build minutes/month, one concurrent build,
2vCPU/8GB memory/20GB disk and a20-minute hard timeout. The runner fails after
19 minutes rather than omitting a slow gate. This limit includes installation
and verification; final packaging/deployment also needs time. Measure the real
target build before claiming it fits. If it does not, split producers into
separate builds and verify same-source, complete, immutable receipts before
deployment; reducing case count or numerical checks is not an alternative.

The separate Browser Run free quota is10 browser minutes/day. It is not the
execution environment for this53-case Builds pipeline. Documented Builds
caching covers package-manager and selected framework directories; do not
assume arbitrary Chrome, PostgreSQL or JDK caches survive another build.

## Data schedules and research evidence

Archiving a schedule disables it. A successful UI deployment does not prove
that either data schedule was replaced. Both remain explicit activation
obligations until the actual Cloudflare trigger, run and published bytes are
observed. Preserve the existing clocks and do not backfill missed prospective
issuance dates.

| Former job | Cloudflare replacement requirement |
| --- | --- |
| Completed market data, UTC00:20/06:20/12:20/18:20 | A short Cron Worker enqueues a dedicated refresh Build. Reuse the seven provider collectors and actual attempt outcomes; optional failure keeps the previous snapshot/clock. Capture a comparison judgment only after a successful comparison refresh. Run model/formal/static gates, stage only the existing allowlist, reject newer main, use an ordinary non-force commit and verify the exact deployed publication. |
| ETH prospective archive, UTC01:17 | A dedicated preparation Build verifies/restores the exact archive, captures only the current tail, replays/readies/checks capacity/appends/verifies and seals the exact source/run/bytes. A separate publisher obtains only that immutable handoff and a scoped repository write credential, checks live archive head, publishes and reads back. A failed acquisition remains a failed daily observation even if its failure evidence was archived. |
| ETH candidate qualification | Separate model acquisition/evaluation producers and full native browser producer, followed by a same-source/run/artifact join. Existing35-minute research job caps exceed the free20-minute per-build limit; bounded sharding and durable artifact transport must be designed and measured. The ordinary verification command does not claim this optional research qualification completed. |
| Release | Keep exact tag/source/version binding, immutable existing assets, manifest-first serial upload and no retagging or overwrite. A production static deployment does not automatically publish a release. |

The current prospective CLI's publication context still explicitly validates
its original event/run identity and handoff. A replacement must add a reviewed
Cloudflare context with equivalent validation; do not spoof GitHub environment
variables to bypass that boundary. A Cloudflare trigger needs a scoped source
write credential and provider-independent artifact identity before activation.
The capacity report intentionally counts only active `.github/workflows`
definitions; archived cron text is never reported as a live scheduled issuer.

Budget scheduled jobs separately from UI builds. For a30-day month, use
`120 × refresh_minutes + 30 × prospective_minutes + deploy_count × verified_build_minutes`
plus research/retry minutes, and keep the measured total at or below3,000.
For example,8-minute refresh jobs,8-minute prospective jobs and60 complete
20-minute verification builds would consume2,400 minutes, leaving600 for
research/retries. These are capacity assumptions, not measured runtimes or a
promise that the20-minute build completes. A queue and same-source deduplication
avoid overlapping scheduled refresh and stale deployments on the single free
build slot.

## Primary runtime sources

- [Workers Builds image](https://developers.cloudflare.com/workers/ci-cd/builds/build-image/)
- [Workers Builds limits and pricing](https://developers.cloudflare.com/workers/ci-cd/builds/limits-and-pricing/)
- [Workers Builds caching](https://developers.cloudflare.com/workers/ci-cd/builds/build-caching/)
- [Browser Run limits](https://developers.cloudflare.com/browser-run/limits/)
- [Chrome headless modes](https://developer.chrome.com/docs/automation-and-testing/headless)
- [Chrome for Testing release inventory](https://googlechromelabs.github.io/chrome-for-testing/last-known-good-versions-with-downloads.json)
- [PostgreSQL Ubuntu packages and signing key](https://www.postgresql.org/download/linux/ubuntu/)
- [PostgreSQL17.11 Noble package index](https://apt.postgresql.org/pub/repos/apt/dists/noble-pgdg/main/binary-amd64/Packages.gz)

Runtime inventory and limits were checked on2026-11-07. Actual Build receipts,
not this document, determine which environment and gates completed.

- [Pinned Temurin21.0.13+9 release](https://github.com/adoptium/temurin21-binaries/releases/tag/jdk-21.0.13%2B9)

- [PGDG signed Noble release metadata](https://apt.postgresql.org/pub/repos/apt/dists/noble-pgdg/InRelease)
