# Full Funnest migration: intermediate checkpoint

- Baseline: b6762fd983d176e8ecc88c265aba0e5f2afa77b4; original local P5/R22 worktree remains preserved.
- Current local checkpoint: cd884574bbb1c59ee29c15c7544c4be8e2bd583f (canvas image export + native caller, 14 focused tests pass). No push/merge/deploy.
- Protected inputs: 167/167 byte/hash identical.
- 2026-11-16: the work is committed locally on `work/full-funnest-unslop-20261113` after cd884574, with every gate green on the final tree. See the last section of INTEGRATION_CONTINUATION.md.
- Runtime 0.6.22 pins, source-backed adapters and third-party notices are present. Parent added deterministic --check and negative controls; build-pages now calls it.
- First integration run: 3934 pass / 34 fail / 6 skip, 3974 host tests. This was diagnostic while lanes edited files, not final acceptance. Frozen Linux tests separately pass 41/41 after starting existing Docker.
- Java actually available: /Applications/Android Studio.app/Contents/jbr/Contents/Home/bin/java (25.0.3). Homebrew Java links are broken.

## Live ownership

- dM5g4KZ4KNTiyzGl: BTC/replay adapter and consumer. BTC is active Funnest; boundary/timing support implemented; replay consumer migration in progress.
- kAbNwQbvwxlCJ2hc: ETH/equity/observed adapter, source import/readiness/viewport/browser checks. Parent owns native-chart-workbench export caller.
- GPxzQDg6Y76dNGe8: React charts and plot sizing. Real S&P 4233-point native view exposed ResizeObserver self-height feedback, being fixed.
- RL0NDCsrhXyWKEML: style-contract QA only; retain accessibility/geometry thresholds, update superseded 999px/old-palette assumptions explicitly.
- uMwANW9woYhehepa: dist/styles.css + atlas-shell.css; collapse duplicate visible heading without losing accessible h1; geometry verification.
- Parent: build generators/index/review seeds, integration QA, docs and sole Git owner.

## Parent tools and evidence

- Working tree: /Users/twoimo/.aside/u/0/sessions/2026-11-11_RSR5NcqeBZVwniFE/tmp/atlas-full-funnest-20261113
- Preview port 8197 uses session tmp/serve-atlas-preview.py; supports both root and /bitcoin-cycle-atlas/ (plain http.server caused data 404, not product absence). Server exec session 1463.
- Owned browser target 037C38471C471CDD35634E81C3C5E261, now market analysis. Baseline user tab C0A66F3F027C530F80AF8F55BCAA7398 preserved.
- React native observation before fix: selected S&P 2026-10-30 7580.07, 4233 observations, SVG grew to 1390px then worker measured 2138px inside 800px frame. This is an open actual defect, not accepted UI.
- Parent runtime probe v2 proved actual 120-bar Funnest canvas paint + exact OHLCV + theme/font on its recorded SHA; not whole-app acceptance.
- Final source/style bundles/preloads/Pages must regenerate after lanes freeze, then full test + formal + native full-route/theme/viewport/state QA.
- Existing manual screenreader, 1h replay/memory, media listening and real-device/Safari/AppKit obligations remain; do not mark human review complete.
