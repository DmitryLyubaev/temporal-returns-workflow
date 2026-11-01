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

Task 1: bookkeeping correction: committed task range is6adc39f..c3b7d3f; task-done ran before a transient Git denial cleared. Task2BASE is c3b7d3f.
Task 2: complete. Ready-DB RED:8 behavioral failures; GREEN full suite:15 passed/0 failures/0 skips, real HTTP and PostgreSQL. One earlier setup RED had DNS failure after the owned database received an unexplained graceful stop; actual data/volume retained. Service readiness is now explicit, with an owned WSL keepalive session retained for local work. Activity dependency factory preserves the approved signatures and enables real HTTP tests without a fake Temporal runtime.

Task 3: test-server1.40.0 archive SHA-256 verified. Initial test setup used a nonexistent flat binary path; actual archive has a versioned directory. Corrected path without changing the binary/version. Ready test RED:6 failures, including unsupported rejected outcomes and zero expected reservation attempts. Runtime source imports contracts only as types so workflow bundle contains no crypto/DB imports.

Task 3: Ruling: Windows free RAM alone misclassified available WSL cache as unavailable. At the diagnostic read, WSL MemAvailable7130964KiB (6.80GiB), cache~5.4GiB, Windowsfree1.23GiB, owned PostgreSQL55MiB. Use WSL MemAvailable>=6GiB/full or3GiB/narrow plus Windowsfree>=1GiB, with existing container caps. No global memory/cache/security setting changes. Cost if wrong: host pressure, bounded by owned-container memory limits; pause new work if either margin fails.
Task 3: Ruling: persist Temporal in image-owned /home/temporal instead of a new root-owned /data path, avoiding a permission/init service. Business persistence remains a separate named volume; writeability must be observed at startup. Cost if wrong: startup fails before acceptance.

Task 4: Ruling: refine host margin to512MiB alongside WSL MemAvailable>=6GiB/full (3GiB/narrow). The existing owned full dev services use ~165MiB, Linux has6.8GiB available and zero swap, while resident Linux cache depresses Windowsfree. New positive policy test was RED at0.75GiB hostfree and GREEN after the margin refinement; rejection below0.5GiB remains tested. No global settings/cache/process changes. Cost if wrong: host responsiveness pressure; all owned workloads remain capped.
Task 3/4: Ruling: prepare independent CLI tests during the resource diagnostic, so Task3 whole-suite closeout waits for Task4 tests to be GREEN. No Task3 completion claim until the combined full suite passes. Cost if wrong: task boundaries are less isolated; final whole-branch review still covers all changes.

Task 3: complete. Six workflow tests and four time-skipping cancellation checks passed; actual dev-server profile4/4 passed with real PostgreSQL/HTTP. Native cancellation before/after payment, fencing and a real Start-to-Close timeout are observed. Upstream fs.F_OK, test-server heartbeat-capability and intentionally late activity-completion warnings are retained. Temporal file writeability verified under its image-owned home. Exact task source commit recorded below.
Task 4: complete. CLI/preflight RED5 failures became focusedGREEN5, then a new memory-policy positive regression RED->GREEN. Fresh scripts/local.ps1 check:31 full-suite tests passed in50.475681s, plus four real-server profile cases in22.240144s, zero failures/skips. Setup, app build, up, built-worker CLI approval/inspection smoke(one effect, noncanonical), down and unrelated inventory preservation observed. Stable repository-owned module cache introduced; obsolete owned cache retained, no shared deletion. Runtime capture/replay and final review are not yet complete.
