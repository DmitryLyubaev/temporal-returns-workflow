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

Task 5: preparation checkpoint. Original verifier RED7/8 (valid generated packet passed), GREEN8. Three explicit source/bundle binding regressions RED3 then GREEN11. Real SDK bundler prepared all three 1.70MB variants. Full capture/replay not run yet; next clean-source smoke selects A1/A10/A11 only.

Task 5: first actual harness smoke smoke01 on6e5847c completed A1/A10/A11 workflow probes, then failed. Original wrapper37.954s including cleanup,3 history files and SQL snapshots retained; report.json was not written. Original/compatible/negative replay all rejected protobuf timestamp-object JSON before determinism evaluation. PostgreSQL was then stopped while capture pools were open, producing an unhandled idle-client termination. Original failed capture/manifest/source bundle copied and hash-verified at.local/archives/smoke01; no bytes replaced and no canonical A1-A11 run yet.
Task 5: fix regression RED4: timestamp-format/large-ID test, two cleanup-order/report-survival tests, persisted-kill-proof omission. GREEN15 focused tests after SDK1.25 historyToJSON codec, close-before-stop/finally-persist lifecycle, idle error recording and immediate kill.json evidence. CLI history export uses the same canonical codec. One initial test syntax error was corrected before behavioral RED. No SDK/model/fixture version or business outcome change.

Task 5: smoke02 on3e0d093 passed3 selected workflows/effects(A1/A10/A11),8 unrun as declared, original3+compatible3 replay passes and expected DeterminismViolationError for incompatible A1. Actual workerKILL137/OOMfalse at309ms,new PID/start time,same Temporal PID/start time. Recorded wrapper41.113s including cleanup; user-facing post-manifest wall time41.585s. Both SQL snapshots unchanged; report/kill/source/code metadata persisted. Original smoke02 capture copied/hash-verified under.local/archives/smoke02. Full check on3e0d093:46 tests passed in30.089325s plus real-server4 in17.582635s,zero failures/skips.
Task 5: archive destination guard review found child name..nested bypassed a naive parent-prefix test. New regression RED->GREEN13 acceptance tests after comparing actual path-separator parent components. No actual capture was written inside itself; both original smoke archives remain valid. This guard-only correction does not change workflow, SDK, fixture or history bundle inputs; no third smoke is needed. Canonical A1-A11 remains unrun.

Task 5: complete onffeea8e. Final full software47PASS31.010916s, actual-server4PASS19.328949s, zero failures/skips. No new runtime/fixture/protocol changes since successful smoke02 except the guarded archive path; both original smoke manifests retained.
Task 6: canonical01 on cleanffeea8e passed11/11 in64.941s including owned cleanup. Seven effects7000cents, eight durable receiver outcomes,33 activity attempts,8POST/5GET. Original11/compatible11 replay pass; incompatibleA1 expected DeterminismViolationError. WorkerKILL137/OOMfalse at354ms/newPID/start, TemporalPID/start unchanged. Network-disabled read-only verifier PASS and Git source-bundle verification PASS. Final fresh review/integration pending; no public/paid/cloud/provider action.


Final review: one fresh whole-branch review, base6adc39f/reviewed4ed9cc9; 0Critical,
2Important, 1Minor. Both Important grades stand by user effect, fixed in one pass.
Final: fixed inspection query/closure race: three inspection regressions RED3 ->
GREEN3 using real server handles/results with controlled edge failure; bounded
re-description recovers completed/closed state or preserves the still-running error.
Final: fixed missing Temporal process identity enforcement: three new evidence
regressions RED3 -> GREEN16 verifier tests, requiring valid matching PID/start fields.
Final: fixed both findings, suite53/53 in37.53511773s plus actual-server4/4
in18.526349351s on0c5ca3a; no failures/skips. Original canonical and archive both pass
the corrected verifier read-only/network-disabled. Workflow/fixture hashes unchanged;
no measured runtime rerun and no re-review. Raw logs and immutable receipts retained.
Final: minor (deferred): lost finalization acknowledgements can return
reconciliation_required with stale held reservation although SQL is consumed;
non-success remains correct, but an investigator can misread the disposition.
Final: Ruling: production authentication and adversarial direct SDK/privilege access
remain outside trusted local fixtures; this bounded user receives only local identity
checks. Cost if wrong: no production authorization assurance.
Final: Ruling: real payment/compliance/distributed exactly-once remain outside the
synthetic receiver study. Cost if wrong: no financial correctness assurance.
Final: Ruling: HA, server/storage loss, throughput and rolling deployments remain
outside one worker-interruption observation. Cost if wrong: no operational/scaling assurance.
Final: Ruling: operator resend/resolution remains outside the fixed scenarios;
uncertain results stay unresolved. Cost if wrong: manual investigation cannot resolve them in-app.
Final: Ruling: external attestation/malicious fabrication remains outside honest local
hash preservation. Cost if wrong: evidence consistency can be mistaken for external truth.
Final: Ruling: public publishing/hosted CI/cloud remain outside approved local work.
Cost if wrong: no deployed-service or hosted CI proof.
Task 6: capture, review/correction and preservation verified; integration pending.
Outside-worktree checkpoint preserves214 files/146331276bytes and eight stopped
volume exports/26916064bytes. Original volumes and evidence remain retained.
Supplemental review evidence/source/scratch records are hash-verified separately.
