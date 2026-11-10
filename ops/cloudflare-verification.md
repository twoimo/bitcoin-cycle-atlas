# Cloudflare verification and operational migration

The seven former GitHub Actions definitions are retained byte for byte under
`ops/github-actions-archive/`. They cannot execute from that path. Their hashes,
replacement commands and scheduling obligations are in `ops/ci-migration.json`.
The original shell, immutable archive and publication negative controls still
execute as tests against these preserved contracts. New tests separately check
the actual Cloudflare runner and receipt rejection behavior.

## Required deployment stages

Set `NODE_VERSION=24.22.2` and `SKIP_DEPENDENCY_INSTALL=1` in Workers Builds.
The repository's locked install is part of each verification stage. Production
uses two source-bound Workers Builds. This separates the full model calculation
from Chrome while preserving every required gate and the canonical test command.

| Stage | Build command | Deploy command |
| --- | --- | --- |
| Model and numerical/formal verification | `npm run verify:cloudflare -- --stage=model --mode=production && npm run build:cloudflare:models -- --mode=production` | `npm run deploy:cloudflare:models -- --mode=production` |
| Browser and publication | `npm run verify:cloudflare -- --stage=browser --mode=production && npm run build:cloudflare` | `npm run deploy:cloudflare` |

The model Worker watches main. After publishing and reading back its bounded
component receipt, it invokes the browser/publication Worker's private Deploy
Hook. The consumer excludes automatic push paths and independently verifies
the model component's actual completed-success provider check before launching
Chrome. Do not rely on an account-wide concurrency or billing-plan assumption
for this ordering.

The model stage runs 13 gates: its own runtime and locked install, the unchanged
complete `npm test -- --test-concurrency=2`, and the ten numerical/research/formal/
replay gates. The browser stage runs 12 gates: its own seven preparation and
service gates, all 53 native browser cases, and the four publication/standalone
gates. The aggregate contains all 23 original required gate identities, with
the two stages' original Build UUIDs and duplicated preparation recorded
separately. A component alone is never a product deployment receipt.

Review uses `--mode=review`, the `bitcoin-cycle-atlas-models-verify` producer and
the existing verification-only consumer. Its consumer deploy command remains
`node --version`; it does not publish the product. Production uses
`bitcoin-cycle-atlas-models` and `bitcoin-cycle-atlas`.

Deployment requires a complete exact-source receipt. An inspect-only run,
partial browser scope, failed component, stale source or modified preview
cannot qualify. The strict single-Build command remains available as
`npm run verify:cloudflare`; it still executes every gate and cannot be used to
turn either staged component into a complete result.

### Component identity and provider evidence

The producer publishes only its bounded machine-readable component and a
per-source index as static assets on its dedicated `workers.dev` host. A receipt
has a source/run-specific path, `/receipts/<commit>/<Build UUID>.json`; the index
is `/sources/<commit>.json`. The product's `dist` and Cloudflare output are not
used for this small receipt site. There is no database, runtime binding or
repository write credential in this handoff.

The consumer resolves the per-source index once, freezes that snapshot and
fetches only the named receipt. Exact bytes, SHA-256, source commit/tree, current
plan, expected Worker, runtime and complete gate identities must agree. Missing,
changed, truncated, redirected or stale objects fail closed; the reader cannot
silently change to a newer index or accept a partial result. Reuse is limited to
the exact source and plan within six hours. It does not claim that a particular
consumer Build was uniquely dispatched by that producer.

The official Cloudflare GitHub App's public check supplies independent terminal
Build status. Acceptance binds the repository and source SHA, Cloudflare App and
owner IDs, Worker check name, exact account/Worker/Build details URL and external
Build UUID. Pending duplicate rows do not constitute success; conflicting
terminal outcomes are rejected. The check's timestamps are provider reporting
metadata, not a substitute for the original Build's execution clocks. Provider
visibility is polled within a bound before the browser's isolated cadence phase.

This design explicitly trusts the project's Cloudflare-controlled static
publisher, which is managed under the same deployment authority as the product.
The receipt hash detects byte corruption and mixups; it is not a Cloudflare
signature over arbitrary JSON. The public provider check, trusted publisher,
exact source/plan and original component evidence are all required. It does not
export connector authentication or infer permission to read private Build logs.
The original complete model logs and browser report/PNG evidence remain in the
authenticated Build logs for review.

The producer's `ATLAS_PUBLICATION_DEPLOY_HOOK` is stored as a Build secret and is
used only after successful receipt publication and exact HTTP readback. Its
bearer URL and UUID must not appear in logs, source files or reports. A hook
selects the current branch, so both stages reject a changed branch head instead
of attaching old evidence to a new commit.

### Source values from Deploy Hooks

On 2026-11-07 the actual Deploy Hook Build supplied its branch name in
`WORKERS_CI_COMMIT_SHA`, while its Git checkout contained the correct full SHA.
The public Hook endpoint documents no commit-pin parameter. The staged browser
path therefore preserves the provider's raw value and distinguishes a commit
from an exact branch reference. A mismatching 40-character SHA never becomes a
branch fallback, and no `WORKERS_CI_*` value is rewritten.

The browser component binds that provenance to its actual Build UUID, CI branch,
clean checkout SHA/tree and the fixed repository's exact remote branch head.
Before Chrome starts, the same source/tree/plan must also have a complete model
component with observed terminal provider success. Native verification,
publication, packaging and deployment revalidate the current Build's evidence.
A different Build, a changed branch head, a modified checkout or missing
acceptance cannot authorize the branch-reference path.

The packaged publication keeps the raw reference in
`workflow.providerSource.rawRef`. For a branch reference, `eventCommit` is null;
`sourceCommit` and `checkedOutCommit` remain the actual full Git SHA. Packaging
and deployment load the current Build's persisted component, model acceptance
and complete aggregate directly, so separate shell processes need no rewritten
provider variables or inherited verifier-only stage hint.

The model producer, retained single-Build runner, manual origin diagnostic and
scheduled data jobs keep their strict SHA guards. The browser-specific handling
does not authorize a scheduled refresh or archive job. Before any schedule is
enabled, its real hook's authenticated source metadata must satisfy that job's
own contract in addition to the credential and monthly-budget requirements.

Public JSON reads measure the decoded Fetch stream. A compressed response's
`Content-Length` describes its encoded representation, so exact stream-length
comparison applies only to identity encoding. Both declared and decoded size
limits remain enforced; component/index bytes, canonical JSON and SHA-256 still
must match exactly. An actual Node Fetch gzip response and a corrupted gzip
stream are covered by the provider-reader regression tests.

The producer explicitly configures the reviewed `CLOUDFLARE_ACCOUNT_ID` as a
nonsecret Build setting and uses the existing provider-managed deployment token.
Actual deployment requires that token in `CLOUDFLARE_API_TOKEN`; no token value
is exported, copied into repository files or printed. This is the existing
Build deployment credential, separate from the user-supplied Builds-read
credential required by the still-inactive scheduled data jobs.

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

### Retained complete single-Build mode

The behavior below describes the retained one-Build runner. The staged browser
runner keeps the same isolated cadence and complete two-lane inventory, but no
model command runs alongside Chrome. Its aggregate records that the separate
model component was provider-verified before native-browser launch; it does not
reuse the one-Build claim that model launch followed the cadence phase.

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

After the isolated fast-cadence phase, the model-test command runs at normal
Linux nice 0 alongside the outer runner and native-browser command. Its wrapper
verifies the inherited value before and after spawning the unchanged
`npm test -- --test-concurrency=2` command. The receipt binds the observed values
and process IDs to the managed command and its raw log; inability to apply or
verify priority fails the gate. A qualifying receipt requires the unchanged
100ms cadence to have passed before model launch. Replay tolerances and the
complete test inventory are unchanged.

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

## Verification cost model

Each gate is a distinct obligation, not a distinct amount of work. Duplicated
work inside a gate is pure cost: it cannot fail without the gate failing, and it
cannot pass something the gate's other checks already reject. Three kinds of
duplication were reviewed on2026-11-10; only the ones with a proven replacement
were changed.

| Work | Before | After | Why the replacement is equivalent |
| --- | --- | --- | --- |
| Public artifact identity (`checkPublication`) | every public file read and hashed twice: once per manifest row, then again by the directory inventory | one inventory pass hashes each file once; manifest rows are matched against it, and path containment plus regular-file identity stay as metadata-only checks before it | for an immutable staged artifact the first pass only proved byte identity and directory membership, both of which the single inventory proves; missing-file, non-regular-file and filesystem-error controls are in `tests/publication-manifest.test.mjs` |
| Publication preparation inventory | the same directory scanned and hashed three times | scanned once, then one confirmation scan; the two must be byte-identical or preparation stops | the second and third scans could only ever return the first scan's digest, because they read the same unchanged directory; the equality is now asserted instead of implied |
| Static syntax checks (`verify-static.mjs`) | one `node --check` process per JavaScript file, strictly sequential | the same commands with a fixed bound of four parallel processes, first failure in sorted path order rethrown | every file still runs the identical parser command; only the wait between independent processes is removed, and the reported failure stays deterministic |

Single-run observations on the committed `dist` artifact (964 files, 211 ES
modules, 76 MiB, warm page cache, one local machine): `verify-static` completed
in 8.4 s before the change and 0.8 s after it, publication preparation in 0.9 s
and 0.8 s, `build-publication --check` in 0.4 s and 0.3 s. These are separate
observations, not a paired measurement: no interleaved A/B on one host has been
run for them, so they do not establish an official speed-up factor. Structurally
the artifact identity pass is O(total bytes) per artifact and the syntax check is
O(files) parser processes, both independent of the number of tests.

Deliberate duplication that was **not** removed, because removing it would
change a contract rather than repeat work:

- Each stage runs its own `npm ci` and runtime bootstrap. They are separate
  Builds with separate receipts; a shared install would be a new cross-Build
  dependency, not a deduplication.
- The static scan runs once per stage (`static` in the model stage,
  `standalone-check` in the browser stage). Collapsing it needs a cross-stage
  artifact receipt; the model stage cannot see the browser stage's `dist`.
- The React app is compiled twice in the browser stage: `build-pages --check`
  builds it with `--base ./` to compare against `dist/market-lab`, and
  `build:web` builds it with the config's `/market-lab/` base. Sharing one
  compile would mean verifying a bundle emitted for the other base, and gate
  identities and order are part of the committed plan hash.
- `publication-check` re-reads the manifest that `publication` just wrote. That
  is a read-after-write check of the persisted bytes, not a repeat of the
  in-memory validation.

### Cadence gate on a shared runner

The isolated cadence phase measures a real end-to-end property: how fast visible
daily bars advance during 10× playback, with a 100 ms period and the unchanged
85–130 ms mean bound. The controller that drives it
(`dist/chart-replay-state.js`) schedules on a deadline: it keeps
`deadline + period` while a tick lands inside the next period, and falls back to
`tickAt + period` once a tick overruns by a whole period. The harness
timestamps the observed `data-replay-cursor` changes with the page clock, so the
mean it reports is the actual period plus whatever per-tick work the renderer
did not absorb.

That makes the earlier133–377 ms samples explainable rather than noisy:
133 ms ≈ 100 ms + 33 ms and 377 ms ≈ 100 ms + 277 ms, i.e. one overrun per tick.
Those samples were observed before the gates were serialised; whether another
CPU-bound process was co-resident during that specific run is not established by
the receipt, and the 2026-11-10 failure at a mean of150 ms occurred with the
cadence phase already running alone. The bound is unchanged, and reducing
per-tick paint cost remains the only legitimate way to widen the margin. A
cadence failure is reportable as a real playback result, not a timing artifact.

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
19 minutes for each stage rather than omitting a slow gate. This limit includes installation
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
main model trigger verifies that new commit, then the browser/publication
stage joins the complete verification plan and performs exact public readback. `SOURCE_COMMITTED`
means a source commit was published; it is not a deployment success receipt.

| Build | Build command | Deploy command |
| --- | --- | --- |
| Market collection | `npm ci --ignore-scripts && node scripts/cloudflare-market-refresh.mjs` | `node scripts/cloudflare-market-refresh.mjs --confirm-commit` |
| Models at the new SHA | `npm run verify:cloudflare -- --stage=model --mode=production && npm run build:cloudflare:models -- --mode=production` | `npm run deploy:cloudflare:models -- --mode=production` |
| Browser/publication at the same SHA | `npm run verify:cloudflare -- --stage=browser --mode=production && npm run build:cloudflare` | `npm run deploy:cloudflare` |
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
| Production model component | Canonical runtime and explicit production stage/mode | `ATLAS_PUBLICATION_DEPLOY_HOOK`; ordinary provider-managed Build deployment credential |
| Production browser/publication | Production origin and explicit browser stage/mode | Ordinary provider-managed Build deployment credential; no new Builds Read or repository write token for the public component join |
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

For a31-day month the schedule can create124 collection Builds,124 model
Builds,124 browser/publication Builds,31 archive preparations and31 publishers. The mandatory
projection is:

`124 × (collection_minutes + model_minutes + browser_publication_minutes) + 31 × (prepare_minutes + publish_minutes) + additional_publications × (model_minutes + browser_publication_minutes) + other_build_minutes + retry_reserve`.

Splitting verification cannot make either stage disappear from this projection.
The budget rejects an inventory that lacks a model-stage measurement. The
existing `additionalProductionBuilds` input counts complete additional
publications, so it adds both stages for every entry. The configured four daily
collection opportunities remain inactive unless the full measured projection,
including archive work and reserves, fits; two individually valid20-minute
stages do not imply the monthly schedule is affordable.

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
input has `schemaVersion:2`, `kind:atlas-cloudflare-schedule-samples`, a concrete
`month` such as `2026-11`, explicit `additionalProductionBuilds`,
`otherBuildMinutes`, `reserveMinutes`, and `samples` with one to four actual
`{buildId,triggerId}` pairs for each of `productionModels`, `production`, `refresh`,
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
- [Workers Builds default environment variables](https://developers.cloudflare.com/workers/ci-cd/builds/configuration/#default-variables)
- [Node Fetch compressed-response headers and decoded bodies](https://github.com/nodejs/undici/issues/2514)
- [GitHub public check-run reads and provider identity](https://docs.github.com/en/rest/checks/runs#list-check-runs-for-a-git-reference)
- [Workers Builds watch-path evaluation and exceptions](https://developers.cloudflare.com/workers/ci-cd/builds/build-watch-paths/)
- [Workers KV free allowances](https://developers.cloudflare.com/kv/platform/pricing/)
- [GitHub reference-write permission and nonforce updates](https://docs.github.com/en/rest/git/refs)
- [Pinned Temurin21.0.13+9 release](https://github.com/adoptium/temurin21-binaries/releases/tag/jdk-21.0.13%2B9)
- [PGDG signed Noble release metadata](https://apt.postgresql.org/pub/repos/apt/dists/noble-pgdg/InRelease)

Runtime inventory and limits were checked on2026-11-07. Actual Build receipts,
not this document, determine which environment and gates completed.
