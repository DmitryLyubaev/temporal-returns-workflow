# Temporal returns workflow

A bounded local portfolio demonstration of Temporal workflows, activities,
cancellation, worker recovery and history replay over synthetic AUD refunds.
There are no actual payments, customers, model calls or cloud services.

The workflow waits for approval, holds a reservation and requests one simulated
payment. Ambiguous outcomes are reconciled by receipt lookup. Cancellation cannot
reverse a committed effect. PostgreSQL is an independent business-effect oracle;
Temporal's persisted development-server file is a separate store.

## Local setup

Use PowerShell 7, the existing Windows Node 24 helper, WSL Ubuntu and a working
Linux Docker/Compose daemon. Canonical builds run in pinned Node 24.22.2 containers.
The script checks at least 6 GiB WSL MemAvailable, 512 MiB Windows free RAM and
10 GiB disk, and refuses ports held by another project. No global runtime, Docker
memory/cache setting or trust setting is changed. Preparation downloads pinned
public packages/images and the hash-verified Temporal test server.

```powershell
./scripts/local.ps1 -Action setup
./scripts/local.ps1 -Action check
./scripts/local.ps1 -Action up
```

The script generates an ignored local `.env`. Temporal gRPC/UI, PostgreSQL and the
receiver publish only on loopback ports 7288/8288/5488/8388. Image digests and package
versions are in the [plan](docs/superpowers/plans/2026-11-01-temporal-returns-workflow-local.md).
The development server is deliberately a local lab service, with no authentication claim.

## CLI example

Run from this checkout after `up`. Choose a fresh capture ID because running and
closed workflow IDs cannot be reused. Signals are acknowledged as submitted;
inspection supplies the accepted decision and business result.

```powershell
$p28Path=(wsl -e wslpath -u (Get-Location).Path).Trim()
$p28Compose=@('-e','docker','compose','--project-directory',$p28Path,'--env-file',"$p28Path/.env",'-f',"$p28Path/compose.yaml",'-p','p28-dev','run','--rm','tools','node','build/src/cli.js')
wsl @p28Compose start --capture demo01 --return R01
wsl @p28Compose decide --workflow-id p28/demo01/R01 --decision-id D01 --return R01 --reviewer reviewer-demo --choice approve
wsl @p28Compose inspect --workflow-id p28/demo01/R01
wsl @p28Compose history --workflow-id p28/demo01/R01 --output .local/manual/demo01-history.json
./scripts/local.ps1 -Action down
```

Approval expires after 10 seconds, so an interactive demo can intentionally expire
before the second command. `cancel --workflow-id ...` requests native cancellation.
History exports refuse to overwrite existing files and stay under `.local/`.

## Evidence and limits

The canonical local capture passed **11/11** predeclared scenarios in **64.941s**
including startup/replay/cleanup: seven synthetic effects, 33 activity attempts,
eight receiver POSTs and five receipt lookups. All eleven histories replayed on
original and compatible code; incompatible code failed as expected. Software checks
passed 53 tests plus a separate four-case actual-server profile after the one
review correction pass. Local integration remains pending. One deferred minor can
report a stale reservation disposition after a lost finalization acknowledgement;
see [review closeout](docs/review-closeout.md). See the [dated results](docs/local-results.md). Time-skipping software tests are distinct from actual development-server
checks. Native activity cancellations/timeouts can produce upstream late-completion
warnings; those raw logs are retained rather than hidden.

Payment dispatch has one activity attempt and no HTTP retry. Other idempotent
activities have at most three attempts. A missing receipt does not prove payment
absence: `uncertain` retains its reservation. Compensation releases only a
reservation; it does not reverse a payment or erase history. Direct SDK/DB access
is not a production authorization boundary. No distributed exactly-once, HA, server
restart durability, financial compliance or commercial operation is demonstrated.

Raw captures, credentials and histories stay ignored. `down` stops only the owned
Compose project and retains volumes. Public publication and hosted CI are separate
decisions. See the [design](docs/superpowers/specs/2026-11-01-temporal-returns-workflow-design.md)
and [implementation ledger](docs/implementation-ledger.md).
