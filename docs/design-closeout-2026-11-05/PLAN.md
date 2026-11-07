# Design closeout — 2026-11-05

> 기록 보관 · 2026-11-07(Asia/Seoul): Hallmark는 사용자의 최신 지시로 종료됐다. 아래 계획·검증 범위·판정은 해당 과거 소스의 기록이며 현재 실행 지시나 릴리스 조건이 아니다. 현재 디자인 기준은 저장소의 `AGENTS.md`, `design.md`와 디자인 마스터를 따른다. 원본 결과와 수치는 당시 사실로 보존한다.

Starting commit: `624888270fcb539ab08d505e5affab5f5d435776`.

## Done predicate

Resolve the remaining Hallmark FAIL/REFLEX findings through product/source integration changes while keeping the pinned checker, complete shipped surface, all eight routes, original findings and before/after evidence. Preserve chart/data/forecast semantics, transparent indicator surfaces, independent native scrolling and existing user controls. Execute meaningful native regressions, the complete 49-case browser gate, numerical/formal checks, then merge and verify the served publication. Record any data/model condition that cannot be satisfied by code without inventing observations or release authority.

## Swarm shape

Partitioned coverage; each worker reports all proven issues in its slice. This is not a model race. Reports record the exact baseline and measured source hashes. Shared-source edits are assigned by ownership and generated bundles are integrated by the coordinator.

Applied pstack sources were read from `cursor/plugins` and subsequently compared byte-for-byte with commit `2776ddd2355d6d6c8747d3964600f28daf62f049`: `swarm`, `principle-fix-root-causes`, `principle-test-behavior-not-implementation`, `principle-exhaust-the-design-space`, and the referenced Subagents guidance in `poteto-mode`. The configured default Grok model was unavailable in this environment; three workers used the supported inherited model after the one rejected spawn. This is partitioned same-model work, not independent multi-model certification.

- [x] Frame: current source, previous 19 FAIL / 5 REFLEX and preservation requirements read.
- [x] Fan out: loading integration; sticky/surface ownership; legacy disclosure/link behavior. Three agents are working on disjoint owned files after comparing alternatives.
- [ ] Aggregate: review root causes, compare behavior, preserve raw results and run complete gates.
- [ ] Report: publish exact commit/CI/deployment evidence and remaining empirical conditions.

## Constraints

- Do not change Hallmark gates, severities, scope, baseline, source-protection checks or use waivers/exclusions.
- Preserve the exact upstream vendor source and its license; any app adaptation must be explicit, reproducible and verified against the pinned original.
- Preserve protected input data, immutable forecasts, IPO files and current-vs-reconstructed forecast meaning.
- No cosmetic rewrite of historical failed receipts.

## Integration decisions

- Preserve the exact Skullet 0.0.3 upstream source and license under `tools/skullet`; generate and verify a public adapter restricted to Atlas's actual inert block/Reveal contract. Remove unused interactive/custom-element/x-ray behavior from the public integration, with no linter exclusions.
- Share the existing RSI plot-coordinate function between the renderer and its loading surface. Keep its 18px top coordinate and verify actual panel boundaries at desktop/mobile widths.
- Extend the existing owner-scoped sticky-header contract instead of repeating global sticky declarations or changing offsets to satisfy a checker. Preserve local paint, z-index and first-column ownership.
- Give native disclosure summaries and expanded reading regions their own surfaces. Keep the same content, links and native toggle behavior; avoid replacing content merely because the viewport resized.
- Preserve the existing CSS design-contract comment with esbuild's supported `@preserve`/`legalComments: inline` path before Vite computes asset hashes. Prototypes showed Lightning CSS drops a regular comment, while esbuild preserves the annotated comment and still minifies CSS. The exact already-locked esbuild 0.28.2 becomes an explicit build dependency; no post-build asset rewriting or gate patch is used.

