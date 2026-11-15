export const PRESERVED_FILES = Object.freeze([
  Object.freeze({ path: 'dist/scenario-countdown.js', citedBy: 'README.md',
    reason: 'reproduces the 2026-10-21 D-day snapshot that README.md and docs/MODEL_SCOPE.md still quote' }),
  Object.freeze({ path: 'scripts/chart-checklist', citedBy: 'docs/chart-checklist-20261109/R0.md',
    reason: 'is the run command for the pending R0 browser verification' }),
  Object.freeze({ path: 'scripts/verify-treasury-conservation.mjs', citedBy: 'docs/RECOVERY_2026-10-24.md',
    reason: 'reproduces the treasury conservation result in the recovery guide that package-release.mjs bundles into every release' }),
]);
