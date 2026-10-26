# Atlas app design system

Hallmark v2.0.0 is applied to the complete app surface at upstream commit `7ec868225c6caa040558c321ee0fefa0e73f83a8`. This document records the existing product requirements and the shared design decisions; it does not assert a lint or browser pass.

## Product and scope

This is a Korean financial research workbench. Its primary objects are observed price charts, explicitly conditional forecast paths, an 18-asset comparison table, source evidence and immutable research records. The signature is the full-height chart or ledger in the working viewport. Use Hallmark's **app** scope, with the existing shell and routes.

The active product uses its dark palette. Preserve the Bitcoin accent, gain/loss semantics, distinct labelled cycle series, measured chart coordinates and the difference between observed, assumed, pending, unavailable and reconstructed data. A style change cannot improve a model score or invent a missing observation.

## Shared surfaces and type

Keep the existing `--bg`, `--surface`, `--surface-raised`, `--surface-hover`, `--text`, `--muted`, `--subtle`, `--accent`, `--green`, `--red` and `--font` roles. Secondary text must remain legible against raised and hover surfaces. Use a shared `--focus` ring and `--font-mono` for figures and code. Move component-specific exact colours into named owner/role tokens before consolidating their meaning; do not substitute one theme role merely because its hex happens to match another role.

Read long research prose at a comfortable measure and size. Keep data labels, toolbar labels, numbers and axis geometry distinct from prose. Use tabular numerals and the actual units. BTC's current display name is 비트코인; ticker identities and historical stored source bytes remain immutable.

## Geometry

The chart and comparison workspace fill the available dynamic viewport. One compact toolbar row leaves the remaining space to data. Dense tables own both scroll axes; headers and identifying columns remain sticky. Expand comparison body rows to consume available height, but retain readable and touch-friendly minima on short screens.

Use a consistent four-pixel spacing rhythm for redesigned controls and panels. Do not change the price renderer's coordinate transforms or measured viewport ownership to satisfy a visual checker. Dialogs and text panels scroll inside their bounds; short and mobile viewports must retain their navigation and close actions.

## Interaction and states

Focus appears immediately as a visible two-pixel ring. Pressed state uses surface/ink changes without moving a control. Disabled controls use their actual disabled state and an unavailable cursor; loading is identified by the existing busy state. Preserve reduced motion support, the native keyboard and pointer handlers, URL state, all links and all existing test hooks.

Each existing loading, empty, error and full state is part of the review. A missing state implementation is a documented product gap, not a fake success. Direct mobile navigation into research must have a working return action, and active symbol options must remain visible when keyboard navigation moves them.

## Verification and release

The pinned Hallmark scanner covers every HTML/CSS entry and renders every declared route at its supported widths. It does not traverse this app's dynamic JavaScript import graph or open every dialog. Retain the existing functional and model checks and add explicit browser state checks for those boundaries. Record actual execution, missing targets, source hashes, before/after preservation and failures separately. A missing render, an internal scanner error or a skipped comparison is not a pass.

Design validation does not replace the separately required real Gemini opposition, source verification, mature prospective outcomes or release authorization. This research branch remains subject to those existing gates.
