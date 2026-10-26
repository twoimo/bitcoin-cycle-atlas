# Atlas evolution, 2026-10-26

## Authorized outcome

Implement the five stages proposed to the user: immutable forecast/data records and measurements; evaluation/freshness and startup improvements; archived replay/change explanation; treasury instruments/liquidity and ETH scenarios; bounded forecasting/rendering experiments with explicit adoption decisions. Preserve the compact dark workspace, eighteen comparison assets with BTC first, mobile collapsed indicators, exact selections and offline HTML.

Base: `35300332a629ead03f6f365a32fda4669390f72f` (v1.27.1). Branch: `codex/atlas-evolution-20261026`. Separately owned PR #35, #36 and #37 were preserved through merges `db6c0af`, `7261c18` and `fab0e75`. Version/import conflicts were resolved while retaining the upstream archive, labels, focus, lock ownership and refreshed observations. The user's later design request replaces the comparison-only rail palette with the existing compact chart theme while keeping its data and interaction contracts.

## Workflow and todo

- [x] Frame. Read the current implementation, pstack workflow and benchmark requirements, and current remote changes.
- [x] Fan out. Implement disjoint quant, treasury and performance slices, with small explicit interfaces.
- [x] Aggregate. Integrate data/publication contracts and the user-facing archive/evaluation workspace.
- [x] Verify. Run behavioral and numerical checks, finite-state negative controls, actual browser journeys and offline packaging. Cross-review the integrated diff.
- [ ] Report. Preserve raw evidence, conditional experiment verdicts and remaining empirical limits. Publish the verified branch through the repository workflow.

Done requires implemented user-facing behavior and reproducible checks, not only documentation or a test-count claim. Prospective scores remain pending until their real target dates. Retrospective reconstruction is never labeled contemporaneous issuance. A conditional experiment may conclude not adopted; its evidence and decision must be recorded.

## Ownership

| Slice | Files and responsibility |
| --- | --- |
| Quant | New forecast ledger, evaluation and experiment modules/scripts/tests. No app, lab, package, workflow or common HTML edits. |
| Treasury | Treasury instrument/liquidity calculations, ETH scenario UI, equity integration and dedicated tests. No app/lab/workflow/package edits. |
| Performance | Performance diagnostics, BTC app/lab startup and rendering scheduling, measured worker decision, dedicated browser measurements. No ETH/equity/journal/workflow/package edits. |
| Integrator | Publication/freshness contracts, forecast journal UI, formal publication model, common HTML/CSS, offline packaging, versioning, workflows and final verification. |

## Data contract decisions

Use immutable content-addressed snapshots and issued records in static files. A small index locates records, while the browser loads a selected record on demand. Browser-only storage cannot establish a shared public issuance history. Record the source commit, input and output hashes, available/observed/issued times, model version, seed and horizon. Missing historical vintage metadata stays unknown. A corrected record receives a new identity and references its predecessor.

Use pure state transitions for publication and financial instruments. Keep model correctness, finite-state safety and predictive accuracy as separate claims.

## Evidence and decisions

Implementation and verification entries will be added as units pass. All performance claims require actual timed work, correctness/error checks, an identified limiter and at least five alternating samples per side. Browser emulation is not physical-device evidence.
