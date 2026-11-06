# Collapsed sidebar label contract

**PASS** for the focused native check. Baseline: `624888270fcb539ab08d505e5affab5f5d435776`.

The legacy screenshots exposed a real navigation defect. Dashboard compact/mobile CSS hides `.atlas-nav-label` and the older button label selector. Added anchor items were constructed with an unclassified label span, so their long Korean labels remained painted in a52px rail and were clipped. The US button happened to follow the older selector while the new KR anchor did not.

The sole product change is in `dist/atlas-shell.js`: every identified navigation label now receives the existing `atlas-nav-label` class before its text is assigned. No navigation label, aria-label, title, href, badge, icon, route or handler was removed or rewritten. Existing CSS now applies the same expanded/compact contract to old buttons and new anchors. `dist/compact.css` and `dist/lab-view.js` retain their previous handed-off hashes.

Native Chromium verified320px automatically collapsed,1440px expanded,1440px after pointer collapse and1440px after Enter expansion. All11full labels and source navigation contracts are retained; labels have0painted rectangles when collapsed and all11are painted when expanded. US and KR badges remain painted, inside the rail and native hit-testable in every state. Tab moves fromUS toKR with visible focus. Native Enter onKR opens `/bitcoin-cycle-atlas/market-lab/kr/`, mounts the Korean market frame and marks the route current. Enter on the collapse control restores the expanded labels and keeps visible focus.

`receipt.json` contains the full native measurements, source hashes and screenshots. `handoff.json` records the final owned-file SHA-256 and preservation of the two earlier files. `verify.mjs` is the focused behavioral verifier; it injects no test CSS or alternate DOM layout. The snapshots include whatever live-data refresh state the local app reports; this check makes no claim about refresh-source availability or forecasting validity.
