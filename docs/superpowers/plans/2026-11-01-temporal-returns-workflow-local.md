# Temporal Returns Workflow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Demonstrate one synthetic refund workflow using Temporal, with actual worker recovery and saved-history replay.

**Architecture:** One TypeScript worker and CLI use a local Temporal development server with persisted file storage. PostgreSQL stores reservation and receiver records; a separate owned HTTP receiver records synthetic effects atomically. Workflow code performs no ordinary I/O.

**Tech Stack:** Node 24.22.2, TypeScript 7.0.2, Temporal TypeScript SDK 1.25.0, Temporal CLI 1.9.1, PostgreSQL 17.9, Docker Compose, node:test and node:assert/strict.

**Spec:** [Approved design](../specs/2026-11-01-temporal-returns-workflow-design.md). Dmitry approved it on 1 November 2026. Read both documents before executing.

## Global Constraints

- Bounded local portfolio demonstration, no production platform or paid service.
- One repository at `E:/Projects/temporal-returns-workflow`, one workflow type and worker/task queue; no custom durable job queue.
- One synthetic retailer/reviewer, currency AUD, eleven acceptance returns of 1000 cents each.
- Approval deadline: 10 seconds from workflow start; first valid decision processed before the deadline wins.
- Workflow ID: `p28/<capture-id>/<return-id>`; reject reuse while running or closed; no workflow retries/reset/Continue-As-New.
- Reservation/release/finalize/lookup: maximum 3 attempts, initial backoff 1 second, coefficient 2, maximum backoff 2 seconds; Start-to-Close 5 seconds and Schedule-to-Close 20 seconds.
- Payment: 1 activity attempt, Start-to-Close 5 seconds, Schedule-to-Close 15 seconds, total HTTP timeout 2 seconds, no HTTP retry/redirect.
- Ambiguous payment means receipt lookup, never another dispatch; unresolved means held reservation and `uncertain`.
- Non-cancellable cleanup before payment; non-cancellable payment/reconciliation after scheduling payment; no reversal of a committed effect.
- Actual A1-A11 run once per capture; 5-minute deadline excluding image/dependency preparation, including owned cleanup. Report all failures/unrun cases.
- Expected canonical effects: 7 and 7000 cents, across A1/A3/A6/A8/A9/A10/A11. Expectations are not measured results.
- Preserve original histories/failures/private evidence. No model call, cloud, public push, hosted CI or other-project edits.
- Personal Git identity: `Dmitry Lyubaev <Dmitry.Lyubaev@gmail.com>`. No em dashes in prose.

## Review Focus

1. Amount/key coercion: unsafe integers, numeric strings or delimiter-containing IDs cannot alias a valid refund. Task 1 owns validation tests.
2. Cancellation racing a slow reservation: release fences any late acquisition; failure to confirm cleanup cannot be reported cancelled. Tasks 1/3 own tests.
3. Receiver returns malformed/mismatched receipts or redirects: no unsupported success and no redirected payment. Task 2 owns wire tests.
4. Closed workflow inspection/signalling: failed queries cannot hide final results; signal acknowledgement cannot claim acceptance. Task 4 owns CLI tests.
5. Harness stops early or sees the wrong process boundary: failed/unrun cases and cleanup failure survive in the report; no success by absence of errors. Task 5 owns verifier tests.

## Read-only preparation and version pins

Checked 1 November 2026: Windows Node 24.14.0/npm 11.18.0; WSL Ubuntu Docker
client/server 29.7.2 and Compose 5.4.0. Use pinned Linux containers for canonical
builds/runs, not a global runtime update. The Docker read returned successfully
after a slow response. No image was pulled and no application was created.
Observed free resources varied from 4.07 to 4.58 GiB RAM; disk 76.1 GiB. Windows
candidate ports 7288/8288/5488/8388 had no listeners; this is not a permanent lease
or a WSL binding check. Repeat both at execution.

Direct packages, all exact with lockfile integrity: `@temporalio/client`, `worker`,
`workflow`, `activity`, `common`, `testing` at **1.25.0**; `long` **5.3.2**;
`protobufjs` **8.7.1**; `pg` and `@types/pg` **8.23.1**; `typescript` **7.0.2**;
`@types/node` **24.10.1**. Temporal engines require Node >=20.3.0. Use built-in
Node test/HTTP/argument APIs, avoiding another HTTP framework or test runner.
Install only after plan approval; lock transitive resolution and prove compatibility
with actual import/build tests. Registry availability does not prove runtime support.

Use these verified Docker Hub linux/amd64 child manifests, with `platform: linux/amd64`:

| Image | Immutable manifest digest |
|---|---|
| `node:24.22.2-bookworm-slim` | `sha256:a43f7fc3e52e87d12a905f46eea0275def84ca8f2981a5b53fed44d7fb398ee0` |
| `postgres:17.9-bookworm` | `sha256:3a69b9de644363f30110fbaa78b9e3298ce71bb1aa9124c0b0ceb0a2602c3283` |
| `temporalio/temporal:1.9.1` | `sha256:150d6208d7b24371e4080f49780e6061611f6279cd6908236e9a34ae5746c1b5` |

Temporal image entrypoint is `temporal`, user `temporal`. Its writable data directory
must be verified before starting the service; do not assume mounted-volume ownership.
Node runtime uses Debian/glibc for SDK native modules, no Alpine/musl substitution.
For serial time-skipping tests, download only the pinned official Java SDK test server
1.40.0 linux/amd64 archive, verify SHA-256
`524465a96274831e004326f6e2f2a5f3ef9aaed72c2069cf16c1d64b8b1ec3ca`,
then use `server.executable: {type: 'existing-path', path: ...}`. Hash the extracted
binary in setup evidence. No implicit latest/default test-server downloads.

Official sources: [npm registry](https://registry.npmjs.org/@temporalio/worker/1.25.0),
[Node releases](https://nodejs.org/dist/index.json), [CLI 1.9.1](https://github.com/temporalio/cli/releases/tag/v1.9.1),
[Java SDK test server 1.40.0](https://github.com/temporalio/sdk-java/releases/tag/v1.40.0),
[SDK test-server options](https://github.com/temporalio/sdk-typescript/blob/v1.25.0/packages/testing/src/ephemeral-server.ts).
Image metadata was read from Docker Hub registry manifests, not a runtime pull/smoke.

## File Structure

All application paths below are relative to the proposed product repository.

| Files | Responsibility |
|---|---|
| `package.json`, `package-lock.json`, `tsconfig.json`, `.gitignore`, `.gitattributes` | Exact packages, CommonJS build into `build/`, ignored evidence/secrets, LF scripts. |
| `Dockerfile`, `compose.yaml`, `.env.example`, `scripts/local.ps1` | Pinned Linux image, owned services, bounded preflight/check/cleanup. |
| `src/contracts.ts`, `src/config.ts` | Validated inputs, identities, result types and explicit local configuration. |
| `src/db/pool.ts`, `src/db/migrate.ts`, `src/db/001-initial.sql`, `src/db/reservations.ts` | Transactional reservation state and schema/role setup. |
| `src/receiver/store.ts`, `src/receiver/server.ts` | Receiver effect/receipt transaction and bounded HTTP/fault handling. |
| `src/activities/reservations.ts`, `src/activities/payment.ts`, `src/activities/index.ts` | Typed DB and HTTP activities. |
| `src/workflows/returns.ts`, `src/workflows/index.ts`, `src/worker.ts` | Deterministic workflow and one worker entrypoint. |
| `src/client.ts`, `src/cli.ts` | Typed Temporal client and local operator commands. |
| `fixtures/acceptance.json`, `src/acceptance/control.ts`, `src/acceptance/run.ts` | Frozen fixture, bounded scenario/process control and capture. |
| `src/acceptance/verify.ts`, `src/acceptance/replay.ts`, `src/acceptance/archive.ts` | Independent SQL/report verification, offline replay and hash manifest. |
| `tests/*.test.ts`, `tests/helpers.ts`, `tests/replay/*.ts` | Focused unit/real-service checks and controlled replay variants. |
| `README.md`, `docs/architecture.md`, `docs/local-results.md`, `docs/implementation-ledger.md` | Setup, limits, measured results and task/check records. |

## Shared Interfaces

Task 1 owns these definitions in `src/contracts.ts`; later tasks import them rather
than inventing parallel shapes. Explicitly serialize all timestamps as ISO strings
or integer milliseconds and all monetary values as safe integer cents.

```typescript
type ReturnInput = { captureId: string; returnId: string; currency: 'AUD'; amountCents: number };
type RefundRequest = ReturnInput & { refundKey: string; inputHash: string };
type Decision = { decisionId: string; returnId: string; reviewerId: string; choice: 'approve' | 'reject' };
type Receipt = { refundKey: string; inputHash: string; status: 'committed' | 'rejected'; receiptId: string };
type Outcome = 'refunded' | 'rejected' | 'expired' | 'cancelled' | 'failed_compensated' | 'uncertain' | 'reconciliation_required';
type ReturnResult = { outcome: Outcome; request: RefundRequest; decision: Decision | null;
  cancellationRequested: boolean; receiver: Receipt | null;
  reservation: 'open' | 'held' | 'released' | 'consumed' | 'unconfirmed'; ignoredDecisions: number };
```

IDs use `^[A-Za-z0-9_-]{1,48}$`; reject unsafe integers, non-positive amounts, numeric
strings and unrecognized currency. Fixed reviewer ID `reviewer-demo`. Workflow ID is
`p28/${captureId}/${returnId}`; refund key is `refund/${captureId}/${returnId}`.
`inputHash` is SHA-256 of a fixed-order canonical encoding of ReturnInput, computed
outside the workflow and revalidated at I/O boundaries. Terminal workflow status
and ReturnResult remain distinct in inspection/report output.

## Task 1: validated identities and transactional reservation lifecycle

**Files:** package/build/ignore configuration; `src/contracts.ts`, `src/config.ts`,
`src/db/*`; `tests/contracts.test.ts`, `tests/reservations.test.ts`, `tests/helpers.ts`.

**Interfaces:** Produces `parseReturn(value: unknown): ReturnInput`,
`makeRequest(input: ReturnInput): RefundRequest`, `parseDecision(value: unknown): Decision`;
`reserve(pool: Pool, request: RefundRequest): Promise<'held'>`,
`release(pool: Pool, request: RefundRequest): Promise<'released'>`,
`consume(pool: Pool, request: RefundRequest, receipt: Receipt): Promise<'consumed'>`.
Typed permanent errors expose stable codes and are translated to non-retryable
Temporal failures in Task 2. Tables have capture/key/hash bindings and terminal fences.

- [x] Create the product repository only now, set personal Git identity, apply the worktree skill and create `codex/p28-local` in an isolated worktree. Copy the approved design/plan into product docs; do not modify another checkout.
- [x] Add the exact package/build setup and failing tests `reject_unsafe_identity`, `same_key_conflict`, `release_fences_late_reserve`, `consume_requires_committed_matching_receipt`. Include `assert.throws(() => parseReturn({...valid, amountCents: Number.MAX_SAFE_INTEGER + 1}))`, reject string amounts/slashes, and assert late reserve after release rejects while SQL remains `released`.
- [x] Run `npm run build` and `node --test build/tests/contracts.test.js build/tests/reservations.test.js` against an owned real PostgreSQL instance. Record expected missing implementation failures after dependencies resolve; imports/setup errors alone are not behavioral RED evidence.
- [x] Implement the exported signatures with parameterized SQL, unique keys, conditional state transitions and transaction-level conflict handling. Seed one `open` row per return. Use 1-second SQL statement and 500-ms lock timeouts; no DB transaction spans HTTP or fixture waits. Separate worker and receiver write roles.
- [x] Re-run focused tests. Concurrent reserve/release must serialize to a valid terminal state; mismatched input cannot mutate it. Repeated exact release/consume is harmless, conflicting consume/release fails. Verify worker role cannot write receiver effect tables.
- [x] Commit the task and record commands/results in `docs/implementation-ledger.md`.

## Task 2: owned receiver and bounded activities

**Files:** `src/receiver/*`, `src/activities/*`; extend schema with receiver outcomes,
effects, append-only attempts and fixture controls; `tests/receiver.test.ts`,
`tests/activities.test.ts`.

**Interfaces:** Consumes RefundRequest/Receipt and Task 1's store functions. Produces
`reserveRefund(request: RefundRequest): Promise<void>`, `releaseRefund(request: RefundRequest): Promise<void>`,
`finalizeRefund(request: RefundRequest, receipt: Receipt): Promise<void>`,
`dispatchPayment(request: RefundRequest): Promise<Receipt>`,
`lookupReceipt(request: RefundRequest): Promise<Receipt>`.
Absence/unavailable lookup throws a retryable activity failure, so the configured
three-attempt policy applies; it never returns proof of nonpayment. Dispatch transport failures are
ambiguous. Export HTTP `startReceiver(config: ReceiverConfig): Promise<{close(): Promise<void>}>`.

- [x] Write `duplicate_post_one_effect`, `conflicting_post_no_extra_effect`, `lost_response_receipt_readback`, `reject_redirect`, `mismatched_receipt_not_success` and `permanent_failure_not_retryable`. Assert two exact POSTs return the same receipt ID and one SQL effect; malformed/mismatched key/hash never yields a confirmed refund. Use real HTTP and PostgreSQL, not mocked stores.

  Core assertions: `assert.equal(first.receiptId, second.receiptId)` and
  `assert.equal(snapshot.effects.length, 1)` for duplicate delivery;
  `assert.equal(conflict.status, 409)` without another effect for mismatched input.

- [x] Run `npm run build` then `node --test build/tests/receiver.test.js build/tests/activities.test.js`; retain meaningful failing assertions before implementation.
- [x] Implement `POST /refunds` and `GET /refunds/<encoded-key>` with a small body cap (8 KiB), schema checks, immutable outcome bindings and atomic effect/receipt writes. No-effect permanent rejection is durable. Faults select predeclared fixture rows, not arbitrary code or shell input; dropped responses happen after committed SQL.
- [x] Implement the typed activities with injected/configured pools and 2-second AbortSignal HTTP bound, `redirect: 'error'`, no resend loop. Track activity attempt numbers and actual requests separately. Add reserve fault injection for exactly two pre-commit transient failures. Fixture waits poll every 25 ms, heartbeat every 250 ms and end/cancel within 3 seconds; do not hold SQL locks during waits.
- [x] Re-run focused checks, including concurrent duplicates and rejection atomicity. Assert malformed JSON, oversized bodies, redirect responses, unavailable receipt lookup and DB failure cannot produce a supported success or compensation claim.
- [x] Commit and record verification. Leave server-side idempotency intact even with one scheduled dispatch attempt.

## Task 3: deterministic workflow, cancellation and replayable state

**Files:** `src/workflows/returns.ts`, `src/workflows/index.ts`, `src/worker.ts`;
`tests/workflow.test.ts`, `tests/cancellation.test.ts`.

**Interfaces:** Consumes the Task 2 activity signatures. Produces
`returnsWorkflow(request: RefundRequest): Promise<ReturnResult>`, signal `reviewDecision`
with Decision argument and query `returnState` returning the current business snapshot.
Worker registers only those activities on the capture-owned task queue. Bind retry
values from Global Constraints explicitly, not SDK defaults.

- [x] Write serial time-skipping tests `first_valid_before_deadline_wins`, `deadline_rejects_late_signal`, `cancel_reserve_fenced`, `unknown_payment_keeps_reservation`, `cleanup_failure_not_cancelled`, `committed_finalize_failure_is_known_payment`. For uncertain, assert outcome `uncertain`, reservation `held`, dispatch calls 1 and release calls 0. Test exact/conflicting decisions and wrong reviewer.

  Core assertions: `assert.equal(result.outcome, 'uncertain')`,
  `assert.equal(result.reservation, 'held')`, `assert.equal(dispatchCalls, 1)` and
  `assert.equal(releaseCalls, 0)` after lookup exhaustion. A decision processed at
  `startTimeMs + 10000` yields `assert.equal(result.outcome, 'expired')`.

- [x] Build/run `node --test --test-concurrency=1 build/tests/workflow.test.js build/tests/cancellation.test.js` with the pinned test-server executable. Record failing behavior, not only missing APIs.
- [x] Implement `returnsWorkflow` with a timer anchored to workflow start, signal validation/counters and no external I/O. Root cancellation before dispatch enters non-cancellable release; recheck cancellation before entering the payment scope. Once scheduled, dispatch/reconcile/finalize are shielded. Preserve cancellation-request observation even while shielding. Translate terminal bookkeeping errors accurately.
- [x] Add a real-development-server profile of `cancellation.test.ts` proving native `handle.cancel()` at pre/post-dispatch boundaries and actual one-attempt dispatch behavior after activity timeout. A cancelled or failed reservation must not later reopen a released row. This profile is a software integration check in a separate test capture, not canonical A1-A11 evidence.
- [x] Run the serial workflow tests and real-server cancellation profile. Check exact retry policy and separate Temporal execution status from business result. Verify ordinary workflow imports cannot pull in HTTP/DB modules.
- [x] Commit and record the test-server binary identity and test counts separately from actual-server checks.

## Task 4: local CLI and reproducible isolated runtime

**Files:** `src/client.ts`, `src/cli.ts`, `Dockerfile`, `compose.yaml`, `.env.example`,
`scripts/local.ps1`; `tests/cli.test.ts`, `tests/preflight.test.ts`, initial README.

**Interfaces:** Produces `inspectReturn(client: Client, workflowId: string): Promise<Inspection>`
where Inspection includes workflow/run IDs, execution status and snapshot/final result;
`runCli(argv: string[], deps: CliDependencies): Promise<number>` for start/decide/cancel/
inspect/history. CLI JSON includes `submitted` versus business `accepted` explicitly.
`scripts/local.ps1 -Action setup|check|up|down|capture` owns container lifecycle actions;
capture orchestration is completed in Task 5.

- [x] Write `closed_inspection_uses_result`, `closed_signal_not_claimed_accepted`, `workflow_id_reuse_rejected`, `preflight_refuses_busy_port`, `cleanup_does_not_touch_other_project`. Assert signalling acknowledgement is labelled submitted, not accepted, and closed inspection returns its stored ReturnResult even if querying is unavailable.

  Core assertions: `assert.equal(inspection.result.outcome, 'refunded')` after
  query failure, and `assert.equal(signalReply.status, 'submitted')` with
  `assert.equal(signalReply.accepted, null)` for acknowledgement without observation.

- [x] Run focused tests RED. Use real closed/open Temporal handles for client behavior and fake process/port inventories for preflight policy; do not stop existing services to test refusal.
- [x] Implement the CLI, using Reject Duplicate workflow-ID policy and no workflow retry policy. Exact CLI inputs pass through contract validation; terminal history is exported as SDK-compatible JSON with workflow/run IDs and hashes.
- [x] Implement pinned Compose services `temporal`, `postgres`, `receiver`, `worker` and an on-demand tools container. Use ports 127.0.0.1:7288 gRPC, 8288 UI, 5488 PostgreSQL, 8388 receiver. Internal endpoints use service DNS. Development server command: `server start-dev --ip 0.0.0.0 --port 7233 --ui-port 8233 --db-filename /data/temporal.db --namespace p28`. Bind UI/HTTP listeners as needed for container routing while publishing host ports only on loopback.
- [x] Give only the capture tools container access to the local Docker socket for controlled worker kill/restart. Use the Docker HTTP API over that socket, with explicit project/label/container-ID checks before any mutation. Worker/receiver have no socket mount. The host wrapper starts the capture clock before `compose up`, passes the remaining budget into the runner and guarantees owned cleanup if the runner exits or times out. Do not assume a Docker CLI exists inside the Node image.
- [x] Add preflight: require >=6 GiB free host RAM and >=10 GiB free target disk; check Windows/WSL bindings, Docker responsiveness within 15 seconds and image identities. Do not start until prerequisites pass. Container memory limits: Temporal 1536 MiB, PostgreSQL 512 MiB, worker 768 MiB, receiver 256 MiB, tools/build 1536 MiB; serialize build/tests/runtime if needed. Use capture-specific Compose project `p28-<capture-id>`, database/volume names and task queue. Generate local-only demo credentials in ignored config; no shared account/security changes.
- [x] Run `./scripts/local.ps1 -Action setup` then `-Action check` from the product root. Setup verifies the test-server archive and freezes npm lockfile; later checks use `npm ci`. Canonical check builds, runs contract/DB/HTTP/CLI tests and serial time-skipping plus real-server profiles, returning nonzero for any failures or unexpected skips. Record versions and image/bundle hashes. `down` stops owned services without `-v`; prove unrelated resources survive.
- [x] Commit and record setup/import/build evidence. If pinned versions prove incompatible, record the failure and make the smallest verified compatible pin correction, preserving scope and its reason before proceeding.

## Task 5: frozen acceptance harness, independent verifier and replay tooling

**Files:** `fixtures/acceptance.json`, `src/acceptance/*`, `tests/acceptance.test.ts`,
`tests/replay/original.ts`, `tests/replay/compatible.ts`, `tests/replay/incompatible.ts`.

**Interfaces:** Produces `runAcceptance(config: CaptureConfig): Promise<CaptureReport>`,
`verifyCapture(dir: string): Promise<VerificationResult>`,
`replayCapture(dir: string): Promise<ReplayReport>`,
`archiveCapture(dir: string, destination: string): Promise<ArchiveManifest>`.
Define `VerificationResult` as `{pass: boolean; failures: string[]}`; verifier
mutation tests use `assert.equal(result.pass, false)` and
`assert.ok(result.failures.length > 0)` for every independently corrupted capture.
All reports carry capture/source/config/lock/fixture/workflow-bundle identities and
explicit pass/fail/error/unrun counts. Verifier reads retained reports/histories and
real SQL snapshots without mutating evidence or synthesizing missing outcomes.

- [x] Write `missing_history_fails`, `wrong_run_id_fails`, `extra_effect_fails`, `wrong_kill_boundary_fails`, `deadline_marks_unrun`, `cleanup_failure_is_retained`, `archive_hash_mismatch_fails`. Corrupt each fixture independently and assert overall status is not pass. Test verifier assertions remain enforced with production execution settings.
- [x] Run `npm run build` and `node --test build/tests/acceptance.test.js` RED before implementing the verifier/harness.
- [x] Freeze exactly A1-A11 from the design with R01-R11, expected reservation/outcome/effect rows and seven 1000-cent effects. Every barrier has a capture/workflow key. A3 holds a pre-dispatch activity until invalid/valid/duplicate/conflicting signals are processed, making counters observable. A5 holds the reservation activity after its SQL commit; cancellation/terminal release must fence late reserve work.
- [x] Implement runtime control via direct Docker API/CLI argument arrays, fixed container IDs and SQL fixture controls. Never use broad container selection or string-built shell commands. A10 receiver inserts its reached barrier with its committed effect and withholds the response. Harness polls every 25 ms, must observe it and kill the exact worker within 1000 ms, before any dispatch completion/HTTP timeout. Require actual exit 137, OOMKilled false, retained pre-kill log/history proof and a new worker PID/container execution on restart. If any proof is missing, fail A10 rather than widening the payment timeout. A11 cancels at the reached receiver barrier then permits response/reconciliation; late cancellation cannot release/reverse payment. Gate watchdogs finish within 3 seconds.
- [x] Implement the 300-second whole-run deadline, including startup, with case-level budgets (each case <=30 seconds), no new case after 210 seconds, a replay/export reserve before 270 seconds and final 30 seconds for cleanup. Exceptions stop new cases but still export partial evidence and clean up owned processes. Track activities from workflow history plus attempt logs, wire requests from receiver logs, effects/receipts/reservations from read-only SQL. Preserve the Temporal server identity across A10 to establish worker-only recovery. After histories are exported, stop worker/receiver, capture a settled SQL snapshot, perform replay and capture a second SQL snapshot while PostgreSQL alone remains available; then stop the remaining owned services. Persist the two snapshot hashes and cleanup result. This order keeps unfinished effects from racing the replay no-effects check.
- [x] Implement offline replay: all eleven histories on original and query-only compatible bundles pass; selected reached-payment history fails with SDK nondeterminism on an intentionally changed activity type. Prebuild/hash the three workflow bundles during dependency/image preparation, before the acceptance clock. Parsing/import failures do not satisfy the negative. Compare receiver snapshot hashes before/after all replays and assert zero new activity/HTTP attempts. Keep replay variants out of the operational worker entrypoint.
- [x] Verify the harness with a separately labelled disposable smoke and verifier mutation fixtures. Smokes/tests do not count as canonical acceptance. Make fixture/report fields and units explicit; archive source/evidence with per-file SHA-256. Commit tooling and frozen fixture before the canonical capture.

## Task 6: actual capture, one final review and local closeout

**Files:** `docs/local-results.md`, `docs/architecture.md`, README and ledger;
private `.local/captures/<capture-id>/` source/history/report/archive records;
planner tracker and Project 28 handover.

**Interfaces:** Consumes only the built commands/contracts from Tasks 1-5. No new
application interface or study case is introduced by closeout.

- [ ] On clean committed runtime source, run the canonical software check once. Record exact Node/SDK/CLI/test-server versions, build/lock/config/fixture hashes and actual test totals with zero unexplained skips. Resolve genuine failures before acceptance; do not broaden testing after checks pass without a new reason.
- [ ] Run `./scripts/local.ps1 -Action capture -CaptureId <id>` for the frozen capture. The wrapper starts the 5-minute clock before acceptance service startup, then invokes `node build/src/acceptance/run.js --capture <id>` in the tools container with the remaining budget. A1-A11 must use the real dev server, PostgreSQL, receiver and worker, not time skipping. The runner performs saved-history replay and SQL snapshot comparison before final infrastructure cleanup. Keep raw logs/source private and retain any deadline/cleanup failure.
- [ ] Run `node build/src/acceptance/verify.js --capture <directory>` in an isolated tools process to check the retained capture, SQL snapshots, history/replay identities and cleanup receipts read-only after services stop. Do not repeat the replay/runtime merely to write documentation. Verify seven effects/7000 cents only if observed; A9 must still report uncertainty despite the verifier seeing its committed effect. Write a dated report separating actual cases, software counts, activity attempts, HTTP requests, replay outcomes, duration and limits. Retain original failure/unrun evidence; do not turn fixture expectations into measured facts.
- [ ] Request one fresh whole-branch implementation review. Reproduce/fix Critical/Important findings in one bounded pass with focused RED/GREEN checks; document deferred Minor findings and stop the review loop. If a material fix changes acceptance behavior, preserve the original capture and run one separately identified corrected capture under the same fixture/deadlines, explicitly reporting both. No tuning, favourable repeat or second independent review.
- [ ] Re-run only verification justified by fixes, archive source plus raw evidence/volumes with verified hashes outside the worktree, and update the planner/handover with actual results and remaining limits. No public source or hosted CI is implied.
- [ ] Use the finishing skill to obtain/execute the local integration choice. After integration, fresh primary verification and read-only retained-evidence/replay verification must pass; do not repeat the measured runtime merely for merge. Preserve originals until archive/source identity checks pass, then retire only the owned merged worktree/branch and stop owned services. Mark done only after the selected local closeout is complete.

## Self-review and execution handoff

Self-review completed against the approved design: Tasks 1/2 cover identity, SQL
atomicity and external effects; Task 3 covers deterministic decisions/cancellation/
uncertainty; Task 4 covers operator commands and isolated pinned runtime; Task 5
covers frozen A1-A11, independent evidence, actual kill and all replay variants;
Task 6 covers actual measured results, preservation, review/correction and local
integration. The five Review Focus items each have named tests in the owning task.
Shared signatures and amount/key/status values are consistent across tasks.

Planning estimate: about 2-3 focused implementation days plus review/closeout, not
a measured duration or delivery promise. Recommend **Native** execution because
these six tasks share a small set of workflow/activity/evidence contracts; per-task
agent/reviewer contexts would add overhead to this local demonstration. One fresh
whole-branch review remains part of the plan.

Status: design and Native execution approved. Tasks1-5 verified. Canonical A1-A11 and original/compatible/negative replay passed onffeea8e. One fresh final review and local integration remain pending. Execution rulings and exact evidence are in docs/implementation-ledger.md and docs/local-results.md.
