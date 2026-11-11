# WP-A P1a — conference player skeleton

This increment implements the A-5 layout revised on 2026-11-12 and the A-4
timeline boundary in `docs/requirements/REQ_WP_ABC_20261110.md`. The requested
working branch is `fix/tradingview-responsive-20261110`. It contains the screen
and verification tools; it does not publish conference assets or real mappings.

## Route and ownership

`/?page=conference&t=3725&deck=r17-257` uses the existing Atlas content shell.
The navigation registry and the static navigation each have one new destination.
The shell retains its sole H1, description, source footer and original handlers.
Chart navigation enters the conference through its canonical document URL so a
cached, hidden chart iframe cannot retain the media player.

`dist/conference/route.js` owns lazy mounting and cleanup. Leaving the route
destroys native audio and listeners; a late import or response cannot announce
readiness for a departed visit. Browser history restores the requested time and
deck without autoplay. Page hiding pauses playback, including a BFCache visit.

The player requests `dist/conference/timeline.json`. That file is intentionally
absent in this increment. A 404 gives a clear empty state and a retry action;
network or schema errors give a distinct error state. Synthetic fixtures are
never copied to that production path.

## Screen and controls

The stage owns the main area, with a two-line caption and a solid, centered
bottom control bar. The stage has a 16:9 image area, a 1,120px maximum at desktop
widths, and zoom, fullscreen and page input. Transcript text remains selectable.
Full transcript content opens as a right dock at 1,024px and above and a sheet
below that width; it is closed in the default view.

The 56px play/pause button sits between −10/+10 seconds. Slide and talk controls,
the global event progress range, time, all five prescribed speeds, deck choice,
follow and automatic slide toggles are present. Phone layouts put secondary
settings in a menu while keeping the transport controls centered. Search and
talk selection live in the transcript view. Player targets have a 44px minimum
and visible keyboard focus.

Space, left/right arrows, Shift+arrows, brackets, F and D operate only while the
conference owns the page. Editable fields retain their native keys. A single
polite live region owns the current subtitle; time updates and deck/setting
changes do not repeatedly announce the same source segment.

The native audio element is the clock. Validated audio spans are concatenated in
event time, including a boundary across midnight. Slide mapping is per deck;
`page: null` retains the previous slide and displays an unmapped badge. A deck
change preserves time. Current and nearby images are kept in a bounded cache,
and the next mapped slide is requested ahead of use.

## Timeline verification

The shared browser/CLI validator is `dist/conference/timeline.js`. It checks
schema version, required fields, IDs and references, intervals and ordering,
audio offsets, safe relative asset paths, and per-deck 1-based page bounds.
It accepts a completely unmapped segment (`page: null`) and unmapped individual
decks. The last segment and every other segment must end within total audio
duration.

Coverage requires an **independent subtitle inventory**. Checking a timeline
against a list derived from itself cannot prove that source segments were kept.
The CLI therefore requires `--sources`, rejects missing/extra/duplicate source
IDs and changed text/times, and records SHA-256 hashes of both inputs. The
browser validates structure only and makes no source-coverage claim.

```sh
npm run verify:conference -- \
  --timeline tests/fixtures/conference/timeline.synthetic.json \
  --sources tests/fixtures/conference/sources.synthetic.json \
  --out build/conference-p1a/timeline-verification.json

ATLAS_BROWSER_PATH=/absolute/path/to/chrome-headless-shell \
  npm run verify:conference:browser -- --out build/conference-p1a/browser
```

The fixture has 15 fictional program entries, 23 subtitle segments and two
audio spans totaling 4,000 seconds. Its deck IDs test URL compatibility; the
fictional decks have only 3 and 2 pages. The browser harness serves clearly
labelled generated slides and silent WAV audio from its temporary test server.
It runs actual Chromium input and native media events. The production timeline,
locked PDF/PPTX files and real recordings are not changed or uploaded.

## Acceptance boundary

The evidence receipt for this increment records the exact tested source,
commands, counts, viewport geometry and screenshots. Fixture results establish
the skeleton and validator behavior; they do not establish real conference
transcription, deck mapping or listening accuracy.

Still required with the user's locked local assets: reproducible asset/SRT
conversion, real timeline and page mapping, source coverage for both real SRTs,
program 00–14 playback, ten human listening checks within ±0.5 seconds, real
asset load/transition measurements (A-9), and the one-hour memory run (A-10).
R7 iOS Safari, physical devices and external macOS AppKit are outside this
increment and have no verification claim.
