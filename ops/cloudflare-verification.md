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

### Bounded execution inside one Build

After the PostgreSQL service gate, the replay browser first measures the existing
BTC1440 fast-cadence fixture in isolation: weekly candles in the four-year view,
with volume and every genuine daily source observation. The unchanged native
inputs, DOM observations and 85–130ms mean bound establish actual 10× playback.
The original chart state is then restored through native controls. A terminal
phase record bound to this source, suite run and exact case releases the second
browser lane and the canonical model command. The remaining 1×, 0.5× and 0.3×
measurements and every original case still execute. A failed or missing phase
cannot qualify the build, even when other work continues for diagnostics.

The browser and model gates each own a separate raw log; one coordinator writes
both validated results in the declared gate order. A failure or timeout stops
both process groups and drains their logs before recording failure. Running
model tests are never suspended mid-test to reserve a timing window. Publication
packaging fixtures run in isolated copies and cannot change the browser's
served `dist` files.

The disposable PostgreSQL server stops inside the service-test gate, while that
gate's log remains open, before the browser/model group starts. Early failures
use a separate cleanup log. Shutdown never writes to the sealed runtime-startup
log, and public report output is drained before final cleanup or process exit.

Only the model-test command runs at Linux nice 10. Its wrapper lowers priority
before spawning the unchanged `npm test -- --test-concurrency=2` command and
verifies the actual child's inherited value. The outer runner and native-browser
command retain nice 0. The receipt binds the observed values and process IDs to
the managed command and its raw log; inability to apply or verify priority fails
the gate. Replay cadence tolerances and the complete test inventory are unchanged.

The complete browser suite uses two independent Chrome processes and profiles.
The46 non-chart-replay cases retain their original order and shared context in
one lane. The7 chart-replay cases retain their original order and isolated
contexts in the other lane. Separate Chrome processes preserve actual focus,
visibility and playback behavior; focus emulation is not substituted. The final
report requires every original case exactly once, ordered as the original53-case
inventory, with matching source hashes, browser identity and verified PNG bytes.
No partial lane report qualifies as the native-browser gate.

Representative screenshots and exact report bytes are transported through
4096-character base64 chunks in authenticated Build logs. Each chunk repeats
its artifact name, index, total, original byte count and SHA-256. Reconstruction
rejects incomplete, duplicated, mixed or corrupt chunks. The execution-plan
hash includes the overlap and browser-lane strategy; actual Build timing and
container resource measurements determine whether it fits the free limit.

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

The replacement implementations are concrete, but their schedules remain
**inactive until real execution and cost evidence is available**. The command,
environment and credential inventory is
`ops/cloudflare-scheduled-builds.json`; activation remains false in
`ops/ci-migration.json`. A successful UI deployment does not prove either data
schedule ran. Preserve the existing observation clocks and never backfill
missed prospective issuance dates.

The scheduled-only Worker in `ops/cloudflare-scheduler` has two Cron triggers:
market refresh at UTC00:20/06:20/12:20/18:20 and ETH archive at UTC01:17. It makes
one bounded POST per invocation to a secret Deploy Hook, with no public HTTP
trigger, retry loop, database or queue. Its sanitized submission receipt binds
the scheduled time and returned Build UUID; only the authenticated Builds API
can establish the actual branch, source and completed result.

### Completed data: collection Build, then production Build

`scripts/cloudflare-market-refresh.mjs` authenticates its own Cloudflare Build
UUID, configured trigger, main branch and exact checked-out SHA before running
the original seven collectors. BTC and cycle recalculation are required;
optional failures retain previous bytes and observation clocks. Comparison
judgments are captured only after successful comparison acquisition. The
original model, forecast, research, formal, performance and static checks must
pass before an allowlisted ordinary commit and nonforce push. Changed main
aborts publication instead of being overwritten.

The bounded committed `dist/data/refresh-attempts.json` preserves actual
provider outcomes, clocks, source identity, output hashes and gate identities
for the next Build. It does not change the publication source SHA. The normal
production main trigger checks and deploys that new commit independently, with
the complete verification plan and exact public readback. `SOURCE_COMMITTED`
means a source commit was published; it is not a deployment success receipt.

| Build | Build command | Deploy command |
| --- | --- | --- |
| Market collection | `npm ci --ignore-scripts && node scripts/cloudflare-market-refresh.mjs` | `node scripts/cloudflare-market-refresh.mjs --confirm-commit` |
| Production at the new SHA | `npm run verify:cloudflare && npm run build:cloudflare` | `npm run deploy:cloudflare` |
| ETH preparation | `npm ci --ignore-scripts && node scripts/verify-cloudflare-archive.mjs` | `node scripts/cloudflare-ethereum-archive.mjs prepare` |
| ETH publisher | `npm ci --ignore-scripts && node scripts/verify-cloudflare-archive.mjs` | `node scripts/cloudflare-ethereum-archive.mjs publish` |

The three job Workers are dedicated Builds identities; their commands do not
upload placeholder Worker code. Use the main branch, disable previews and
exclude `*` from push watch paths for these job triggers. Path filtering is a
cost optimization, not authorization: Cloudflare documents exceptions for
empty and very large pushes. Both job runners independently reject actual
push and pull-request metadata. A hook must be exercised and its real trigger
configuration read back before scheduling it.

### ETH: explicit provider identity and separate publisher

The new context records `provider: cloudflare-workers-builds` and the original
raw Build UUID. It does not convert that UUID into a GitHub run number or spoof
GitHub environment variables. Historical GitHub archive objects, hashes and
identity fields retain their original representation. Each job executes the
complete archive test inventory, writes a log-hashed receipt for its exact
source/tree/Build UUID and fails on missing, skipped or failed tests.

Preparation restores the verified original archive or the explicitly proven
absent-branch seed, captures the current tail, replays, checks readiness and
capacity, appends, verifies and seals the original handoff. It receives no
repository write credential. Only the new immutable delta crosses a dedicated
Free KV namespace: at most192 unique objects,64MiB total,8MiB per object and a
48-hour TTL. The full retained archive stays in GitHub and is not pruned or
flattened to fit KV.

Preparation then calls a secret publisher Deploy Hook and binds its returned
Build UUID in a canonical dispatch. A duplicated pending hook is rejected
instead of replacing another publisher's handoff. The publisher uses a
read-only KV token, authenticates the completed preparation Build and exact
dispatch from Cloudflare logs, reconstructs every original byte and rechecks
the live archive head before passing the repository write token to the existing
nonforce publisher. Exact immutable readback remains mandatory. A capture
failure can preserve failure evidence but still ends the publisher with a
failure status; it never becomes a successful observation.

A Deploy Hook selects a branch, not a pinned commit. If main advances between
preparation and publisher checkout, the source mismatch is rejected. Queued
or superseded jobs do not justify accepting a different source, replacing an
existing dispatch or backdating evidence. Each archive job is bounded by its
actual initialization/execution clock and the19-minute application deadline;
queue waiting time is excluded.

### Required settings and credentials

All Builds use `NODE_VERSION=24.22.2`, `SKIP_DEPENDENCY_INSTALL=1` and
`CF_SEND_TELEMETRY=false`. Production uses only
`ATLAS_PUBLIC_ORIGIN=https://bitcoin-cycle-atlas.twoimo.workers.dev`;
`ATLAS_CUSTOM_DOMAIN` stays unset. The original reference site mentioned in the
repository is not evidence of a domain owned by this project.

| Job | Required nonsecret settings | Required secrets |
| --- | --- | --- |
| Cron coordinator | The two defined UTC Cron schedules | `MARKET_REFRESH_DEPLOY_HOOK`, `ETH_ARCHIVE_DEPLOY_HOOK` |
| Market collection | `CLOUDFLARE_ACCOUNT_ID`, `ATLAS_REFRESH_TRIGGER_UUID` | `ATLAS_BUILDS_READ_TOKEN`, `ATLAS_DATA_GITHUB_TOKEN` |
| ETH preparation | Account ID, `ATLAS_ARCHIVE_KV_NAMESPACE_ID`, `ATLAS_ARCHIVE_PREPARE_TRIGGER_UUID`, `ATLAS_ARCHIVE_STAGE=prepare` | Builds read token, `ATLAS_ARCHIVE_KV_WRITE_TOKEN`, `ATLAS_ARCHIVE_PUBLISH_DEPLOY_HOOK` |
| ETH publisher | Account/KV IDs, both archive trigger UUIDs, `ATLAS_ARCHIVE_STAGE=publish` | Builds read token, `ATLAS_ARCHIVE_KV_READ_TOKEN`, `ETH_ARCHIVE_GITHUB_TOKEN` |

`ETH_ARCHIVE_READ_TOKEN` is optional for public repository reads. Both GitHub
write tokens must be explicitly provisioned for this repository with Contents
write permission, using a suitable GitHub App installation token or a fine
grained token. Workers Builds Git integration does not document an exported
repository write token usable by these scripts; clone authentication is never
reused as an inferred write permission. The producer and publisher must have
separate secret sets. Preparation explicitly rejects either repository write
secret. Cloudflare tokens need only Builds read and the indicated KV read or
edit permission; the fixed namespace and key grammar are checked in code.
Read back actual token/account resource scope instead of assuming KV permission
is limited to a single namespace.

The normal daily delta uses at most194 KV writes including its index and
dispatch. Two days of maximum deltas are under129MiB. These bounds fit the
documented Free1,000 writes/day and1GB storage allowances for the intended
single daily preparation; unrestricted manual retries or unrelated account
usage are not included. No paid subscription, paid binding, persistent
database or remote browser service is required by this migration.

### Measured monthly admission

For a31-day month the schedule can create124 collection Builds,124 complete
production Builds,31 archive preparations and31 publishers. The mandatory
projection is:

`124 × (collection_minutes + production_minutes) + 31 × (prepare_minutes + publish_minutes) + additional_production_builds × production_minutes + other_build_minutes + retry_reserve`.

`scripts/measure-cloudflare-schedule-budget.mjs` fetches actual successful
Builds using a read-only token. It verifies the intended trigger/repository,
full commands and execution clocks; an inspection-only run cannot be a timing
sample. It uses the slowest observed sample per role, rounds each up to a whole
minute, includes the full calendar month and requires at least300 minutes of
retry reserve. It refuses an incomplete inventory and returns failure above
3,000 minutes. A budget result still does not prove configured resource scopes,
credentials, Cron activation or publication readback. The connected credential
received HTTP403 from the billing subscriptions API, so the account-wide plan
has not been verified and unrelated existing resources are not classified.
This migration enables no new paid subscriptions or bindings and uses the
documented Free allowances as its admission ceiling regardless of that missing
account-wide billing read permission.

Run it with `--samples build/cloudflare-schedule-samples.json`. The bounded
input has `schemaVersion:1`, `kind:atlas-cloudflare-schedule-samples`, a concrete
`month` such as `2026-11`, explicit `additionalProductionBuilds`,
`otherBuildMinutes`, `reserveMinutes`, and `samples` with one to four actual
`{buildId,triggerId}` pairs for each of `production`, `refresh`,
`archivePrepare`, `archivePublish`. No credential belongs in that file. The
result is written to `build/cloudflare-schedule-budget.json`. Until complete
real samples fit the free budget, keep both Cron schedules inactive.

### Remaining operational boundaries

The former market-lab service workflow verified an isolated PostgreSQL/API
instance; it did not operate a persistent production database. The static site
continues using its reviewed snapshots. A live database-backed collector would
require a separately identified persistent free service, its credentials and
its own actual refresh evidence; disposable test PostgreSQL is not that
service.

ETH candidate research qualification remains a distinct acquisition/evaluation
and full-browser evidence join. Its former35-minute producer limits exceed
the free per-Build cap, so ordinary deployment does not claim qualification
completed. Releases retain exact tag/source/version binding and immutable
assets, with no automatic release publication inferred from a static deploy.
The capacity report continues to treat archived workflow text as inactive; a
local Cron definition does not prove a live scheduled issuer.

## Primary runtime sources

- [Workers Builds image](https://developers.cloudflare.com/workers/ci-cd/builds/build-image/)
- [Workers Builds limits and pricing](https://developers.cloudflare.com/workers/ci-cd/builds/limits-and-pricing/)
- [Workers Builds caching](https://developers.cloudflare.com/workers/ci-cd/builds/build-caching/)
- [Browser Run limits](https://developers.cloudflare.com/browser-run/limits/)
- [Chrome headless modes](https://developer.chrome.com/docs/automation-and-testing/headless)
- [Chrome for Testing release inventory](https://googlechromelabs.github.io/chrome-for-testing/last-known-good-versions-with-downloads.json)
- [PostgreSQL Ubuntu packages and signing key](https://www.postgresql.org/download/linux/ubuntu/)
- [PostgreSQL17.11 Noble package index](https://apt.postgresql.org/pub/repos/apt/dists/noble-pgdg/main/binary-amd64/Packages.gz)
- [Workers Builds Deploy Hooks](https://developers.cloudflare.com/workers/ci-cd/builds/deploy-hooks/)
- [Workers Builds watch-path evaluation and exceptions](https://developers.cloudflare.com/workers/ci-cd/builds/build-watch-paths/)
- [Workers KV free allowances](https://developers.cloudflare.com/kv/platform/pricing/)
- [GitHub reference-write permission and nonforce updates](https://docs.github.com/en/rest/git/refs)
- [Pinned Temurin21.0.13+9 release](https://github.com/adoptium/temurin21-binaries/releases/tag/jdk-21.0.13%2B9)
- [PGDG signed Noble release metadata](https://apt.postgresql.org/pub/repos/apt/dists/noble-pgdg/InRelease)

Runtime inventory and limits were checked on2026-11-07. Actual Build receipts,
not this document, determine which environment and gates completed.
