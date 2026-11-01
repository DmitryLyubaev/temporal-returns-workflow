# Finalization correction and publication implementation plan

> **For agentic workers:** Use the established Native execution method and TDD for the bug fix. Steps use checkbox syntax for tracking.

**Goal:** Correct the previously deferred disposition and publish the bounded demonstration with CI.
**Architecture:** Failed finalization acknowledgement reports reservation unconfirmed. No new database read, retry, payment or operator feature. GitHub-hosted Linux checks use the existing pinned Compose dependencies.
**Tech stack:** Existing TypeScript/Temporal/PostgreSQL/Docker; GitHub Actions.
**Spec:** User approved proceeding with the two optional follow-ups; docs/review-closeout.md identifies the exact minor.

## Constraints and review focus

Keep all existing evidence unchanged, and retain its original source identity. Preserve bounded single-dispatch behavior. Verify before-commit failure and commit-then-lost-acknowledgement both report unconfirmed, while the committed SQL state/effect remain intact. CI must run on hosted runners with read-only repository permission and no deployment. Publish only tracked source/history after checking local secrets and personal identity.

## Task 1: Correct finalization disposition

- [x] Extend the known-payment finalization-failure assertion to unconfirmed.
- [x] Add an integration regression that executes real consume SQL then throws for every acknowledgement, expecting reconciliation_required/unconfirmed, consumed SQL, one effect, three finalization attempts and one dispatch.
- [x] Observe both regressions fail before changing production code.
- [x] Set reservation unconfirmed in the finalization catch; run focused checks and full software/actual-server profiles.
- [x] Replay eleven retained canonical histories using current workflow code, writing a separate supplemental result without modifying original evidence.

## Task 2: Publish with hosted checks

- [x] Add a SHA-pinned checkout and hosted Ubuntu workflow running pinned dependency setup, software and actual-server profiles, with always-run owned cleanup.
- [x] Inspect the small change and CI prerequisites, update source documentation and commit under the personal identity.
- [ ] Merge locally, preserve supplemental logs/source and retire only the owned worktree after verification.
- [ ] Create the personal public GitHub repository, push main, observe CI and correct actual failures if any.
- [ ] Update tracker/handover with public URL and actual CI result. Public deployment is outside scope.

Self-review: every requested follow-up is covered; no new dependency, business case, runtime capture or deployment is introduced. Existing Native execution and the user's proceed instruction authorize this bounded follow-up without another design round.
