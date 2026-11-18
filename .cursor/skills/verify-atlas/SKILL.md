---
name: verify-atlas
description: Drive Bitcoin Cycle Atlas the way a reader does and prove the chart shell, dashboard navigation, chart chat, and market diagnosis. Use when a change touches layout, interaction, or a visible route and the existing browser scripts are the control path.
---

# Verify Atlas

The primary surface is the static web workbench. `apps/api` listens on `127.0.0.1` only and is not the reader surface. The published runtime is `https://bitcoin-cycle-atlas.twoimo.workers.dev`. This checkout may be a dirty docs branch whose `dist/` is not that runtime. Do not treat port 8000 as the published site; another session already serves that dirty `dist` there.

## Launch

From a clean checkout of `origin/main`, serve the built `dist` without replacing the existing port 8000 server:

```bash
python3 -m http.server 8765 --directory dist --bind 127.0.0.1
```

Ready means `curl -fsS http://127.0.0.1:8765/` returns the workbench HTML and a later browser load shows `비트코인` or `BTCUSD`, not merely that the process accepts a connection. The published site is ready when `curl -fsS https://bitcoin-cycle-atlas.twoimo.workers.dev/publication.json` returns JSON whose `sourceCommit` equals the commit being judged.

The GitHub Pages root declared in local HTML is `/bitcoin-cycle-atlas/`. `dist/site-paths.js` keeps a root-hosted server on `/` when the document is not actually under that prefix. A stale browser copy of `site-paths.js` can still prefix iframe URLs; reload the module before calling a local market-lab frame a product failure.

## Doctor

Read-only. Run this before trusting a drive:

```bash
curl -fsS https://bitcoin-cycle-atlas.twoimo.workers.dev/publication.json
curl -fsS -o /dev/null -w '%{http_code}\n' http://127.0.0.1:8765/
lsof -nP -iTCP:8765 -sTCP:LISTEN
```

The listener must be the server this run started. A 200 from port 8000 does not identify the published commit. Missing Chrome, a skipped render, or an execution exception is not a pass.

## Drive

Prefer the repo harnesses:

- `node scripts/verify-ui-contract-browser.mjs` for shell geometry across the viewports in that file
- `node scripts/verify-workspace-browser.mjs` for the shared workspace cases
- `node scripts/verify-chart-first-paint.mjs` for the first revealed Bitcoin chart canvas
- `node scripts/verify-published-origin-browser.mjs` only after a deployment, against the published origin

For one journey, use the browser on the served origin. Stable handles:

- Chart: `button[aria-label^="종목 선택"]`, `#lab-chart`, `.atlas-plot`, `.workbench-rail`
- Dashboard nav: `.atlas-nav [data-atlas-page]`, `[aria-current="page"]`, `button[aria-label="다음 페이지 메뉴 보기"]`
- Chat: `[data-chart-chat]`, `#atlas-chart-chat`, `localStorage` key `atlas-chart-chat-open`
- Account: `#auth-account [data-auth-action="menu"]`
- Diagnosis frame: `iframe.atlas-center-frame` inside `/market-lab/`

Open, type, and close through those controls. Do not set internal model state as the proof. After a chat or details toggle, read `#lab-chart` `viewBox` on the next paint; a `ResizeObserver` does not flush inside the same evaluation that only schedules a timeout.

## Evidence

Write `build/verification-evidence/<date>/receipt.json`. It is gitignored and must survive cleanup. Record the commit, the URL, the action, and the resulting state. A screenshot alone is not the proof. Separate a local server result from the published origin. The receipt for 2026-11-18 is `build/verification-evidence/2026-11-18/receipt.json`.

Focused model checks for the two defects fixed that day:

```bash
node --test tests/content-shell-navigation-reveal.test.mjs tests/chart-chat-route.test.mjs
```

## Cleanup

Stop only the server this run started, by its PID. Do not kill the port 8000 server and do not log out an existing account session. Delete scratch servers and temporary ports. Leave `build/verification-evidence/` in place.

## Helpers

`node scripts/verify-chart-first-paint.mjs [url] [width] [height]` opens a throwaway headless Chrome against the already running server. It does not start or stop that server. The default URL is `http://127.0.0.1:8765/?page=outlook` at 1440×900. A module connection reset is a failed load, not a painted chart. The script retries that load and writes `build/verification-evidence/2026-11-18/first-paint.json`.

The feature map is `features/README.md`.
