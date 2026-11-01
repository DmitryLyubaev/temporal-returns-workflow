# Implementation ledger

Plan: docs/superpowers/plans/2026-11-01-temporal-returns-workflow-local.md
Design and Native execution approved 1 November 2026. Baseline 6adc39f contains
documentation only; there are no pre-existing product tests.

Pre-flight: Task1 contracts/store -> Task2 activities: consistent; Task2 typed
activities -> Task3 workflow: consistent; Task3 signal/query/results -> Task4 CLI:
consistent; Task4 lifecycle -> Task5 harness -> Task6 capture: consistent.

Ruling: Native worktree creation rejected the approved new source directory because
it is outside the chat's registered source folders. Use Git's worktree fallback at
the approved product's ignored `.worktrees/local`; no unrelated source moved. Cost
if wrong: worktree attachment is not managed by the app; Git records its lifecycle.

Ruling: host RAM fell below the 6 GiB preflight after initial repository creation.
Continue file/test preparation; defer service startup until the threshold passes.
No unrelated processes are stopped. Cost if wrong: local runs wait longer.

Task 1: Ruling: narrow database/test phase requires 3 GiB free RAM because its capped containers total 2 GiB; full capture keeps the approved 6 GiB gate. Cost if wrong: extra memory pressure, bounded by container limits.
Task 1: package-lock resolution succeeded with process-scoped NODE_USE_SYSTEM_CA=1 after the first resolver stalled. No global trust change. Linux npm ci passed, 164 packages; two upstream install-script notices retained. Initial premature build failed tsc-not-found during installation, then actual contract RED had three failing tests (validation assertions and missing identity builder).

Task 1: complete. Contract RED 3 failures; real-DB RED 4 failures, including missing rejection behaviors. GREEN npm test: 7 passed, zero failures/skips. Real worker connection denied receiver INSERT with PostgreSQL42501. Isolated Node24.22.2/TypeScript7.0.2 build passed. Raw setup/RED/GREEN logs remain ignored under .local/.
