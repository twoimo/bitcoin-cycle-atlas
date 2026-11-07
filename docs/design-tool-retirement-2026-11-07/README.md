# Design tool retirement — 2026-11-07 (Asia/Seoul)

The user explicitly ended Hallmark use and requested removal of its instructions.
The active design workflow now uses the requested UI/UX Pro Max and
`clone-website` skills, with the actual TradingView interface as the reference.
Current visual decisions belong to [`AGENTS.md`](../../AGENTS.md),
[`design.md`](../../design.md) and the
[design master](../../design-system/bitcoin-cycle-atlas/MASTER.md).

This change starts from source
`71e1e86e49c9b14a4cbe0d1d0c0a83317965b02e` (v1.34.0). That released source and
its historical results remain in Git history. This record is not a new design
checker result or a claim that the former warnings were resolved.

## Active integration removed

- The dedicated `.github/workflows/hallmark-design.yml` workflow.
- `scripts/verify-hallmark-design.mjs` and `scripts/hallmark-source-scope.mjs`.
- The two dedicated test files, containing 16 tests of the retired wrapper,
  source inventory and renderer-readiness adapter.
- The five files under `tools/hallmark`, including the upstream checkers and
  their accompanying license/provenance. Their exact former contents and
  license remain in the
  [pre-retirement tree](https://github.com/twoimo/bitcoin-cycle-atlas/tree/71e1e86e49c9b14a4cbe0d1d0c0a83317965b02e/tools/hallmark).
- Active usage and preservation instructions in the project editing guide,
  design document and Skullet integration guide. Prior dated plans and release
  reports that read as current instructions now identify their archival scope.
- Hallmark-specific metadata comments in app-owned styles and templates; the
  supported build regenerates compiled assets and page wrappers from source.

No Hallmark checker was executed for this change. Removing its dedicated tests
does not change the remaining numerical, immutable-record, replay, formal-state,
service or native-browser assertions. Package dependencies and unrelated
workflows do not invoke the removed scripts.

## Historical evidence preserved

Past findings, screenshots, receipts, source manifests, archived financial data
and ledgers retain their historical results. A past PASS, WARN or failure still
describes only its recorded source and run. Those files do not define current
tool usage, workflow requirements or release gates.

The two former `.hallmark` JSON records were moved out of the live configuration
directory without changing their bytes:

| Former path | Archived copy | SHA-256 |
| --- | --- | --- |
| `.hallmark/log.json` | [log.json](previous-config/log.json) | `206eacec230fec8f39e6e86f2e1d1bc23cef8b290a8ccdf25061b42d403fdd58` |
| `.hallmark/preflight.json` | [preflight.json](previous-config/preflight.json) | `036c169c9bb085be39590e37847200e37628a65c72948360d816ddab81016254` |

The Skullet change removes only an app-authored metadata comment from the CSS
adapter and its generated public copy. The two copies remain byte-identical;
the pinned upstream runtime, original stylesheet, provenance and MIT license
are unchanged. No financial calculation or data was changed by this retirement.

## Verification boundary

Source searches check that active workflows, scripts, tests, agent skills and
package manifests have no references to the removed tooling. The ordinary
production build, generated-file verification and the existing functional
browser checks remain the verification path for the interface redesign. Their
actual new-source execution results belong to the redesign release receipt.

## Separate native-input adaptation for the interface redesign

The TradingView-based desktop toolbar exposes the existing synchronized native
timeframe select. Its eight interval buttons retain their state in the DOM but
are no longer the visible control. The existing replay browser test therefore
requires a visible, enabled desktop select with the exact original eight
choices: `1m`, `5m`, `15m`, `30m`, `1h`, `4h`, `daily`, `weekly`. It continues to
check the selected value against the original buttons' pressed state and keeps
the period-button requirement.

Selection uses the existing real pointer and Home/ArrowDown/Enter sequence.
The unavailable-minute case now requests `1m` through that same native control
and expects the app to restore `daily`. All original unavailable-message,
candle, cursor, output-hash, chart identity and saved-session assertions remain.
Only the obsolete visible-button expectation and its direct click were adapted;
the full 53-case inventory and failure propagation are unchanged. This input
adaptation is separate from removing the retired tool and its dedicated tests.
