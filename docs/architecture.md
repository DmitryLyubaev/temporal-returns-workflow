# Local architecture

The CLI starts a single returns workflow and submits approval/rejection signals or
native cancellation. Deterministic workflow code owns timers and transitions, and
imports external behavior only through typed activity proxies. Ordinary HTTP,
PostgreSQL, process control, filesystem access and cryptography stay outside it.

Reservation activities serialize state changes using PostgreSQL row locks. Release
fences a later acquisition; finalization requires a matching durable committed
receiver receipt. The receiver uses its own connection role and serializes equal
refund identities before recording an outcome and optional effect in one transaction.
A worker connection cannot INSERT receiver effects.

Before payment, cancellation uses a non-cancellable release scope. After scheduling
payment, a non-cancellable payment/reconciliation scope preserves a known committed
effect or an uncertain outcome. Database and receipt activities retry at most three
times; payment has one activity attempt and one bounded HTTP request. Temporal
execution status and terminal business outcome are reported separately.

The Temporal development server persists to an image-owned file in its named volume;
PostgreSQL stores business records in a different volume. One worker interruption is
in scope; server restart and storage-loss recovery are not measured by this lab.

The acceptance verifier will compare frozen expected business facts with separate
read-only SQL snapshots, real workflow histories and process-control evidence. Replay
uses prebuilt original/compatible/incompatible workflow bundles without activities.
Expected nondeterminism is separate from setup/import/JSON errors. Source identities,
attempts, wire requests, effects, histories and cleanup are different evidence classes.
