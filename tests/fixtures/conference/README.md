# Conference skeleton fixtures

These files are deliberately synthetic. They contain no conference transcript,
recording, deck image, real slide coordinate or real page mapping. The event title,
every subtitle and both deck labels identify the fixture as test content.

`final-290` and `r17-257` are compatibility IDs for URL restoration only. The
fixture decks have **3 and 2 fictional pages**, respectively. These page numbers
must never be promoted to a production timeline or treated as locked-deck maps.

- `timeline.synthetic.json`: 15 fictional program entries, 23 original fixture
  subtitle rows, two fictional audio spans totalling 4,000 seconds.
- `sources.synthetic.json`: a separate expected subtitle inventory. Verification
  compares the candidate timeline with these source IDs, exact text and event
  times. Do not regenerate this inventory from the candidate being checked.
- The second audio begins at event second 3,720. At 3,725 the fixture selects
  page 3 in deck A and page 1 in deck B. Later rows cover a missing deck-B page
  and a completely unmapped interval (`page: null`).

Run the actual schema and coverage check with:

```sh
node scripts/verify-conference-timeline.mjs \
  --timeline tests/fixtures/conference/timeline.synthetic.json \
  --sources tests/fixtures/conference/sources.synthetic.json
```

The source inventory schema is version 1, kind
`atlas-conference-source-segments`, with the same `eventId` as the timeline and
`segments: [{source, t0, t1, text, audioId?}]`. `audioId`, when supplied, must
refer to a declared audio record. This checks coverage and preservation against
the supplied source inventory; it does not claim to verify real recordings,
deck approval or human-reviewed synchronization.

Only the test server may supply generated silent audio and clearly labelled
synthetic slide images for these relative paths. Neither fixture is copied into
`dist/conference/timeline.json`; the ordinary conference route must show its
explicit empty state when the real timeline is absent.
