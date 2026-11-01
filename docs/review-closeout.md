# Review closeout: Project 28

1 November 2026. One fresh whole-branch review of `6adc39f..4ed9cc9`
reported zero Critical, two Important and one Minor findings. The findings were
regraded by user impact; both Important findings entered one correction pass.
There was no second independent review or new canonical runtime capture.

## Important findings fixed on 0c5ca3a

- Inspection could lose a completed result if its first description said RUNNING
  and a subsequent query raced closure. Three regression tests failed first, then
  passed using genuine development-server descriptions/results with a controlled
  query failure. Inspection now makes one deadline-bounded re-description, returns
  a completed result or other closed status, and preserves the original query error
  when the workflow is still running.
- Worker-only recovery verification checked the Temporal container ID but omitted
  its process identity. Three regression tests failed first; all sixteen verifier
  tests then passed. Positive integer PIDs and valid UTC start timestamps must be
  present and identical before/after the worker interruption. Matching missing or
  invalid fields cannot pass.

Fresh `scripts/local.ps1 -Action check` on `0c5ca3a` passed 53 software tests
in 37.53511773 seconds and the separate four-case actual-server cancellation
profile in 18.526349351 seconds, zero failures/skips. Raw RED/GREEN/full output
and an immutable log receipt are retained under ignored `.local/`.
The corrected verifier passed on both original canonical01 and its archive in a
network-disabled, read-only container. Compiled workflow and frozen fixture hashes
still match the canonical source `ffeea8e`. The runtime was not repeated.
The reviewer also checked the retained capture/source bundle and ran twenty
isolated evidence tests. These checks are separate from the measured runtime.

## Deferred minor

If finalization commits but its acknowledgement is lost and all retries exhaust,
the workflow can return `reconciliation_required` with reservation `held` although
the database row is consumed. The non-success outcome is appropriate, but this is
a stale last-confirmed disposition that can confuse an investigator. Operator
resolution/resend is outside this demonstration. This minor was recorded, not fixed.

## Boundaries accepted after review

Trusted local reviewer fixtures provide no production authentication assurance.
Synthetic payments provide no real-money or financial-compliance assurance.
One worker interruption provides no HA, server/storage-loss, scaling or rolling
upgrade assurance. Uncertain cases remain unresolved without an operator feature.
Local hashes establish preservation and consistency, not external attestation
against malicious fabrication. Local checks provide no hosted CI or deployment
proof. Costs of these scope decisions are recorded in the implementation ledger.

## Preservation and integration

Original failed smoke01, successful smoke02 and canonical01 remain distinct.
Their immutable captures, source and SQL/history evidence are hash-archived.
An outside-worktree checkpoint is at
`E:/Projects/temporal-returns-workflow/.local/closeout-20261101T085914Z`.
It includes eight stopped data-volume exports, with originals retained; no restore
was claimed. A supplemental checkpoint preserves review corrections and scratch
review records. Credentials and raw captures remain ignored.

The owner selected local merge on 2 November 2026. Main fast-forwarded from
`6adc39f` to `9f18cea`. Fresh primary verification passed 53 software cases in
42.417211872 seconds plus the four-case actual-server profile in 17.92562239 seconds,
zero failures/skips. Current read-only/network-disabled evidence verification passed
for both canonical copies, without repeating runtime or replay execution.
Private evidence/credentials were copied into the primary checkout with verified
hashes. New integration logs and source are preserved in a separate supplemental
checkpoint before retirement of the merged owned worktree/branch. Owned services
are stopped; volumes, shared images/caches and unrelated resources are retained.
Public source, cloud hosting and CI remain separate decisions.
