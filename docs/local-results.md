# Local results: Project 28

Measured 1 November 2026, Brisbane. This is a bounded synthetic portfolio study.

## Source and execution

Canonical capture `canonical01` ran once on clean executable `ffeea8e1b807d0089abdf213bbb4719455c8d4da`.
It used an actual local Temporal development server, one worker, an owned HTTP receiver
and PostgreSQL. Time skipping was not used for A1-A11. Each of the eleven frozen
cases ran once. All eleven matched their predeclared outcomes; zero cases were
failed, incomplete or unrun. These are functional acceptance outcomes, not a general
payment reliability or performance estimate.

The wrapper measured **64.941 seconds**, including service startup, replay
and owned cleanup. Manifest finalization occurred afterward. One actual worker was
killed with exit 137/OOM false within **354 ms** of the controlled boundary.
The restarted worker had a new host PID and start time. Temporal kept the same
container ID, PID and start time during that interruption. No server-restart or
storage-loss recovery is claimed.

## Observed outcomes

| Case | Business outcome | Reservation | Receiver effects | Wall time, ms |
|---|---|---|---:|---:|
| A1 | refunded | consumed | 1 | 2574 |
| A2 | expired | open | 0 | 10247 |
| A3 | refunded | consumed | 1 | 980 |
| A4 | cancelled | released | 0 | 447 |
| A5 | cancelled | released | 0 | 637 |
| A6 | refunded | consumed | 1 | 3848 |
| A7 | failed_compensated | released | 0 | 2406 |
| A8 | refunded | consumed | 1 | 1593 |
| A9 | uncertain | held | 1 | 3974 |
| A10 | refunded | consumed | 1 | 16097 |
| A11 | refunded | consumed | 1 | 814 |

**Totals:** six confirmed refund outcomes, one expiry, two cancellations, one
permanent rejection with compensation and one uncertain outcome. Seven actual
synthetic receiver effects total 7000 AUD cents. There are eight durable receiver
outcomes: seven committed and one rejected. No actual money was transferred.

A9 intentionally denies receipt lookup. Its workflow therefore remains uncertain
with the reservation held, even though the independent read-only SQL verifier can
see its committed effect. That knowledge is not relabelled as a successful workflow
refund. Cancellation after dispatch preserves a committed payment; compensation
releases a reservation and never erases payment history. Temporal execution status
is distinct from business outcome: handled cancellation/failure can complete the
workflow with a corresponding business result.

| Activity | Observed attempts |
|---|---:|
| reserveRefund | 11 |
| dispatchPayment | 8 |
| finalizeRefund | 6 |
| releaseRefund | 3 |
| lookupReceipt | 5 |

Total activity attempts: 33. The receiver logged eight POSTs and five GET receipt
lookups. Each payment dispatch had one activity attempt and one POST. These counts
exclude Temporal gRPC polling, Docker control requests and SQL/health traffic.

## Replay and evidence verification

- All eleven real histories replayed successfully on their original bundle.
- The same eleven replayed successfully after a query-only compatible code change.
- The deliberate payment-activity type change failed A1 with `DeterminismViolationError`.
- Receiver/reservation/attempt snapshots were byte-identical before and after replay.
- The final verifier ran without network access, on a read-only checkout and module cache.
- Source bundle verification passed. All owned runtime services were stopped and removed;
  their PostgreSQL and Temporal volumes are retained. No unrelated resource was removed.

Histories, raw logs, SQL rows, source bundle and process-control metadata are ignored
under `.local/captures/canonical01/` (30 manifest-covered files).
An independently hash-verified copy is retained in `.local/archives/canonical01/`.
The hashes bind honest local records to inputs; this is not external attestation.

## Software checks and environment

On the same clean executable, the pinned software check passed **47 tests**, zero
failures/skips, in 31.010916 seconds. A separately executed actual-development-server
cancellation profile passed **four cases** in 19.328949 seconds, zero failures/skips.
The four are an additional profile, not four extra unique test definitions. Software
counts and their framework timings exclude dependency preparation and are separate
from the eleven-case runtime capture.

Pinned runtime: v24.22.2, Temporal TypeScript SDK 1.25.0,
Temporal CLI image 1.9.1 (embedded server 1.32.0), PostgreSQL 17.9,
TypeScript 7.0.2 and hash-verified time-skipping test server 1.40.0. Windows Node
24.14.0 serves only as the local helper; canonical builds/runs are pinned Linux
containers. Docker 29.7.2/Compose 5.4.0 on WSL Ubuntu, one local machine.

Upstream `fs.F_OK`, time-skipping heartbeat-capability and deliberately late activity
completion warnings remain in the raw software logs. They were not counted as failures
or hidden. The original narrow Windows setup race and one transient Git object-write
denial are documented in the implementation ledger.

## Earlier smoke failure and correction

`smoke01` on `6e5847c` completed three selected workflow probes but failed history
replay parsing and final report persistence. Its 37.954-second wrapper, three history
files, snapshots, failed replay output and source bundle are retained unchanged.
Raw timestamp-object JSON was replaced with the pinned SDK history codec. Capture
connections now close before backend shutdown and final reports persist on cleanup
failure; kill metadata is also persisted immediately. Four regressions were observed
failing and then passing.

`smoke02` on `3e0d093` passed A1/A10/A11, with eight explicitly unrun smoke cases,
original/compatible replays and the expected incompatible failure. It recorded three
effects, a 309-ms kill boundary and 41.113 seconds including cleanup. It is not the
canonical study. A final archive-child-path guard regression was fixed before
canonical01; compiled workflow and fixture hashes remained identical. Both original
smoke bundles are hash-archived. No old failed evidence was rewritten or relabelled.

## Review corrections and closeout

One sample per synthetic scenario, one worker interruption and three controlled replay
bundles. There is no real payment, customer data, human approval study, LLM evaluation,
cloud deployment, hosted CI, production authentication, HA, SLA, financial compliance
or distributed exactly-once claim. Uncertain refunds have no operator resend/resolution
feature. Reviewer identity is a local fixture.

One fresh whole-branch review reported zero Critical, two Important and one Minor
findings. Both Important findings were fixed in one RED/GREEN pass on `0c5ca3a`:
inspection now recovers from a query/closure race, and worker-only recovery evidence
requires matching valid Temporal PID/start fields. The fresh full software check
passed **53 tests** in 37.53511773 seconds plus the separate **four-case** actual-server
profile in 18.526349351 seconds, zero failures/skips. The stricter read-only verifier
passed against original canonical01 and its archive. Workflow/fixture hashes are
unchanged; no canonical rerun or second review occurred.

One Minor is deferred: a committed finalization with lost acknowledgements can leave
`reconciliation_required` reporting a stale `held` reservation although SQL shows
consumed. This can confuse investigation. See [review closeout](review-closeout.md).
Owner-selected local integration remains pending. Public publication is separate.

## Identities

- Executed source: `ffeea8e1b807d0089abdf213bbb4719455c8d4da`
- Fixture SHA-256: `4c658ccaed002a19690aaf0bd1dccc9752dffa5db10345ca5023520d043942f9`
- Package lock SHA-256: `0169c02e49e7c8553b90ac6aa6ae98a29eb010a115687a18f81dc38c32bf6299`
- Original workflow bundle SHA-256: `524dc17e3f8f45ba4c034ae7fba61b909811e741553fb1bba4347195f0adb876`
- Equal SQL snapshots SHA-256: `327f44261901cb2ed3f149d5246ccdeff19ea5e107bf64db0587e09d88bf0ab2`
- Source bundle SHA-256: `42a1bdce76d42eb9843c723ca8554fbf9495cb728dc6c18ceec11f6528d4db84`
