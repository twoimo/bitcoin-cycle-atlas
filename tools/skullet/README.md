# Atlas Skullet integration

Atlas uses the pinned Skullet 0.0.3 `Reveal` and `createSkeletonBox` APIs to measure and paint neutral `div`/`span` blocks. The loading adapter is the only entry to those APIs. Its paint is `inert` and `aria-hidden`; a separate concise status announces the pending operation. Actual controls and financial content never enter a skeleton.

The npm runtime and its MIT license remain byte-for-byte copies in `dist/vendor/skullet`. The complete original stylesheet and license are preserved in `upstream/`, with SHA-256 digests in `provenance.json`. These are dependency source records, not additional production stylesheets. `node scripts/sync-skullet.mjs --check` checks the installed package against those pinned digests, checks every original copy, and separately checks the public adapter against its authored source.

`atlas-styles.css` is the app-owned CSS adapter. Its generated public URL remains `dist/vendor/skullet/styles.css`, because the preserved boot HTML and standalone packager already use that URL. The adapter supports the actual Reveal pane/loading/ghost/layer lifecycle and the boot/inline bars. It leaves neutral blocks visible before JavaScript enhancement. Shared Atlas surface tokens supply their paint. The `--skullet` marker is the documented upstream mechanism that prevents duplicate automatic CSS injection when a stylesheet is already loaded.

The app does not load Skullet's custom-element entry point, feed interactive/text/media samples to `Reveal`, or enable x-ray debugging. Consequently, the public adapter does not install those unrelated selectors, undefined-element hiding, generic input styling, synthetic text, or debug colors. Adding one of those capabilities requires an explicit adapter and accessibility review; copying its full upstream CSS back is not the supported integration.

The public adapter and bundled copy use the shared interface tokens. Verify their actual loading geometry, inert paint, accessible status and lifecycle with the existing build and native-browser checks. Historical design audit receipts describe their recorded source revisions only.

RSI skeleton geometry is measured with the same `dist/rsi-chart-layout.js` function used by the real SVG chart. That function preserves the existing 18px top coordinate, integer price/RSI split, width-dependent right axis, and 24px panel gap. The loading layer observes only its allocated panel size and disconnects on disposal. It does not change chart navigation, numerical calculations or data.
