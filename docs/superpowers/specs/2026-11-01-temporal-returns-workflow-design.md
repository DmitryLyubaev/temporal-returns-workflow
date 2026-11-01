# Project 28: local Temporal returns workflow design

Date: 1 November 2026. Status: approved by Dmitry on 1 November 2026.
Approach A and the written design are approved. Business rules below originated
as assistant proposals and are now part of that approved design.
Fresh isolated read-only builder check: "nothing important left". The implementation
plan is prepared separately for owner review. No runtime was exercised.

## Intent and size

Build a bounded personal portfolio demonstration of TypeScript Temporal workflows,
activities, cancellation, recovery and deterministic history replay. One synthetic
retail return requests one simulated AUD refund. This is a small standalone project,
not a production payments platform. Existing projects already demonstrate custom
queues and recovery; Temporal itself must supply the new evidence here.

Success is a reproducible local demonstration with independently checked business
effects, saved histories and an honest dated report. An observed failure is retained;
passing software checks alone cannot establish actual runtime acceptance.

## Approaches

- **A, selected:** official Temporal TypeScript SDK, one worker, a CLI, a local
  Temporal development server with file persistence, one PostgreSQL instance for
  business records and a separate synthetic HTTP receiver process. Docker Compose
  isolates services. Smallest topology for workflow and replay evidence.
- **B, considered:** the same application with a fuller self-hosted Temporal
  deployment and PostgreSQL-backed Temporal persistence. More administration and
  resource use, without necessary additional workflow evidence. Not selected.

Temporal's file store is separate from the business database. No custom durable
job queue, frontend, LLM, cloud account or paid service is needed.

## Boundaries and author decisions

Proposed application location: `E:/Projects/temporal-returns-workflow`. It does not
yet exist. One repository, one worker/task queue, one return workflow type, one
synthetic retailer, one currency and one fixed reviewer ID are sufficient. Integer
minor units only; initial examples use AUD 10.00 (1000 cents). No real customer,
employer schema, actual payment or external receiver is used.

CLI commands: start, approve/reject, cancel, inspect and export history. Inspection
must work for both open and closed runs using queries or stored final results.
Approval identity is a checked fixture value, not production authentication.
The CLI is the local trusted operator boundary. Direct SDK access is not claimed
to be authenticated or authorization-protected.

No Temporal server-restart experiment, hosted CI, public publication, throughput
benchmark, HA, SSO, financial compliance or production SLA is a completion gate.
Worker recovery does not establish server recovery. Persistent-file configuration
does not establish durability across storage loss. No distributed exactly-once
claim is allowed. No edits to other product repositories or frozen studies.

## Architecture and identity

Workflow code uses Temporal primitives only: deterministic state, signals, timers,
queries, cancellation scopes and scheduled activities. HTTP, PostgreSQL, process
inspection, filesystem evidence and ordinary wall clocks stay outside workflow code.

Activities reserve/release/finalize the synthetic refund, dispatch its payment and
look up its receipt. They use ordinary PostgreSQL transactions and bounded HTTP.
The receiver alone writes its payment-effect and receipt tables, atomically.
An acceptance verifier uses separate read-only SQL queries and frozen expectations,
not the workflow's reported result as its effect oracle.

Use `p28/<capture-id>/<return-id>` as the workflow ID and a fixed derived refund key
as the receiver idempotency key. Reuse of a running or closed workflow ID is rejected;
no workflow-level automatic retries, Continue-As-New, reset or manual retry command.
An exact duplicate receiver key returns the original outcome; different return,
currency or amount with the same key is a conflict and creates no extra effect.
Canonical input hashes bind identities to immutable input. Capture IDs separate
test data from retained acceptance evidence; a failed capture is never overwritten.

PostgreSQL needs only small reservation, receiver outcome/effect and fixture-control
tables. Receiver schema writes use a separate connection role from worker business
writes. This is local isolation, not a general database-security study.

## Business transitions and approval

The workflow starts in `awaiting_approval`. A valid approval moves it to `reserving`,
then `reserved`, then `payment_started`, then `reconciling` if necessary. Terminal
business outcomes are `refunded`, `rejected`, `expired`, `cancelled`,
`failed_compensated`, `uncertain` and `reconciliation_required`.

- Approval/rejection signals carry decision ID, return ID and reviewer ID. Invalid
  input or wrong reviewer cannot decide the return. The first valid decision
  processed before the workflow deadline wins; exact duplicates have no new effect,
  and conflicting later decisions are ignored and counted while the run is open.
- The approval deadline is 10 seconds from workflow start in the frozen runtime
  profile. Use a Temporal timer and workflow clock. A signal processed at or after
  that deadline cannot win even if its sender claims an earlier timestamp.
- Rejection or expiry produces no reservation or payment. Late signals cannot
  restart a closed run. The CLI reports closed status when detected; a signal
  submission acknowledgement alone is not proof that a decision was accepted.
- Terminal results contain the business outcome, accepted decision, refund key,
  known receiver outcome and compensation/bookkeeping disposition. Temporal's
  own Completed/Cancelled/Failed execution status is reported separately.

## Reservation, compensation and cancellation

Each seeded return has one reservation row: `open`, `held`, `released` or `consumed`.
Reservation conditionally moves `open` to `held`; repeating an identical reservation
is harmless. Release atomically moves `open` or `held` to `released`, fencing a late
reserve attempt from acquiring it. Terminal `released`/`consumed` cannot be reopened.
Finalization consumes a held reservation only with a matching committed receipt.
Transactions serialize these transitions; no network call is inside a DB transaction.

The CLI requests native Temporal workflow cancellation. Before payment is scheduled,
catch cancellation and run idempotent release in a non-cancellable cleanup scope.
Only report business `cancelled` after confirmed release/no held reservation. If
cleanup cannot be confirmed within its retry limit, report `reconciliation_required`.
The terminal workflow may complete with that business result rather than show
Temporal execution status Cancelled; the distinction is explicit in CLI/reporting.

Once the workflow schedules the payment activity, payment and reconciliation run
in a non-cancellable scope. Cancellation cannot abort an in-flight request and then
pretend it never committed. Preserve the cancellation request in the history/result;
a confirmed payment stays `refunded`, an unknown payment stays `uncertain`. A
definitive permanent pre-effect rejection permits release and `failed_compensated`.
Do not release on a timeout, connection error, cancellation request or missing receipt.

Compensation means releasing the synthetic reservation, not reversing a payment or
erasing history. If a receipt confirms payment but reservation finalization exhausts
its retries, use `reconciliation_required` with known payment committed, not `uncertain`.

## Retry and uncertain-effect contract

Reservation, release, finalization and receipt lookup activities have at most three
attempts, 1-second initial backoff, coefficient 2 and 2-second maximum backoff.
Each attempt has a 5-second Start-to-Close timeout and 20-second Schedule-to-Close
timeout for the whole activity. SQL operations have shorter statement/lock bounds.
Long-running fixture gates heartbeat and respond to cancellation where applicable.
Invalid input, identity conflicts and permanent business failures are non-retryable.

The payment dispatch activity has **one attempt**, a 5-second Start-to-Close timeout
and a 15-second Schedule-to-Close timeout. HTTP has a shorter 2-second total timeout
and no automatic transport retry or redirect. SDK activity retries are not relied
upon to make payments safe. The bounded-retry demonstration is a reservation activity
that fails twice before a third successful attempt, not repeated ambiguous payment POSTs.

The owned receiver atomically records either committed effect plus receipt, or a
permanent rejected outcome with no effect. Its fault profile can commit and drop
the response or make receipt lookup unavailable. Dispatch timeout, crash or lost
completion enters receipt reconciliation, not a new payment dispatch. A committed
receipt confirms refund; a durable rejected outcome confirms pre-effect failure.
Absent/unavailable outcome after bounded lookup results in terminal business
`uncertain` with reservation held. Absence is not proof that an in-flight request
cannot still commit. A later commit is possible and must not be concealed.

No operator retry/resume of an uncertain refund is implemented in this scope.
Inspect/export provides evidence for investigation; adding resolution is future work.

## Frozen local acceptance

Freeze one fixture before the canonical run: eleven distinct returns, each 1000
AUD cents, with unique workflow/refund identities and independently specified SQL
expectations. Run each scenario once; replay checks do not create payment runs.

| Case | Stimulus | Required observations |
|---|---|---|
| A1 | Approve | Refunded, one effect/receipt, consumed reservation. |
| A2 | No timely approval, then late approve | Real 10-second expiry, no effect/reservation acquisition, closed run stays closed. |
| A3 | Invalid reviewer, valid approve, exact duplicate and conflicting reject | Valid approval wins, one effect, no replacement decision. |
| A4 | Cancel while awaiting approval | Cancelled business result, no effect, no held reservation. |
| A5 | Cancel at held-reservation/pre-dispatch barrier | Release confirmed, no payment dispatch/effect. |
| A6 | Two transient reservation failures | Third activity attempt succeeds, one reservation/effect, refunded. |
| A7 | Permanent receiver rejection | Durable rejection, zero effects, reservation released, failed_compensated. |
| A8 | Commit then drop response | Receipt reconciliation, one effect, refunded, no new payment dispatch. |
| A9 | Drop response and deny receipt lookups | Uncertain after bounded lookup, held reservation, actual committed effect independently disclosed. |
| A10 | Kill worker after receiver commit, before activity completion | Real abnormal process exit, new worker process, timeout/reconciliation, same run/history, one effect. |
| A11 | Cancel after payment dispatch at receiver barrier | Request retained, actual committed effect reconciled, refunded, no release/reversal. |

Harness barriers must prove the boundary was reached before cancellation/kill.
Use bounded local fixture controls, not timing guesses or workflow I/O. A10 may use
a receiver response gate long enough for the harness to kill the worker within the
2-second HTTP deadline. The restarted worker keeps the same task queue and code;
the Temporal server stays running throughout. Freeze actual harness deadlines in
the implementation plan. A gate timeout or wrong boundary is a failed/unrun case,
not a successful demonstration. A11's receiver gate must remain within HTTP bounds
or explicitly follow receipt reconciliation on timeout.

Report workflow cases, messages, activity attempts, HTTP requests and committed
effects separately. Expected total effects: seven (A1/A3/A6/A8/A9/A10/A11), 7000 cents.
SQL-verifier expectations include reservation states, receiver outcomes, key/payload
bindings and no extra effects across all eleven returns. Capture actual totals and
duration, not a preclaimed result or performance target. Use an overall 5-minute
acceptance deadline excluding dependency/image preparation; timeout stops new cases,
records unfinished cases and still performs owned cleanup.

## Replay and software checks

Export source-bound histories from the real run, including A10. Replay saved histories
on their original workflow bundle with `Worker.runReplayHistory`. Replay all the same
histories on a controlled compatible workflow change, such as a query-only addition
which changes no recorded workflow commands. Use a separate deliberately incompatible
bundle which changes an activity type at a reached command boundary; its selected
history must fail specifically for nondeterminism, not parsing/import failure.
Preserve both variants and the expected negative output. Offline replay runs no
activities and must leave receiver effects unchanged, checked before/after.
This is replay compatibility evidence, not a rolling-deployment/version-routing study.

Software checks cover validation, decision/deadline rules, transactional idempotency
and conflicts, compensation fencing, cancellation boundaries, bounded retries and
uncertainty/bookkeeping failures. Use actual PostgreSQL for transactional claims.
Temporal time-skipping tests exercise long waits cheaply but are reported separately
from A1-A11's actual development-server/worker processes and wall-clock timeout.
Do not inflate coverage with tests that merely mirror implementation details.

## Evidence, local resources and finish

Use an owned Compose project, namespaced volumes/database/namespace/task queue and
loopback-only published ports. Check port and shared RAM/disk availability before
starting services; choose unused port numbers during planning. Do not stop unrelated
services or change global runtimes, trust policy or Docker settings.

Keep raw histories, process logs, SQL snapshots, fixture-control records, source
bundle and configuration/lock hashes in ignored `.local/` evidence, with a manifest.
Commit only synthetic fixtures, code, instructions and safe dated aggregate reports.
Retain original failed attempts; label any later correction capture separately.
Stop owned services at the end and preserve evidence/volumes until verified archive
and integration closeout. Cleanup does not remove shared images/caches/resources.

Completion needs reproducible setup, software verification, actual A1-A11 report,
replay results, one bounded fresh implementation review/correction pass, evidence
preservation and chosen local integration. Public source/hosted CI remain separate
outward actions under RULES.md. All commits use Dmitry's personal identity.

## Left to the implementation plan

Select compatible maintained Node/Temporal SDK/CLI/PostgreSQL versions and pin exact
packages/images after read-only verification. Choose test runner, tiny HTTP library,
schema details, module names, barrier implementation, unused ports and resource caps.
Prove SDK cancellation/one-attempt semantics with focused tests before acceptance.
These are builder decisions within the behavior above, not an invitation to add
services or broaden business scope. Implementation estimate remains provisional
until this design is approved and the task plan is written.

## References checked 1 November 2026

- [TypeScript SDK guide](https://docs.temporal.io/develop/typescript)
- [Development-server persistence](https://docs.temporal.io/cli/command-reference/server)
- [Cancellation and activities](https://docs.temporal.io/develop/typescript/workflows/cancellation)
- [Testing, time skipping and replay](https://docs.temporal.io/develop/typescript/best-practices/testing-suite)

Documentation review establishes available mechanisms, not installed compatibility
or successful runtime behavior. No product scaffolding, installation or execution
is authorized by selecting approach A alone.
