# Orchestration Ledger — Initial Domain Model

Status: Foundation implementation active
Date: 2026-09-02

The Orchestration Ledger is the durable coordination layer for Code Fusion-owned workflow state. It is not a replacement for Git, the process host, or the native intelligence runtime. Instead it records normalized observations, relationships, evidence and decisions across those systems.

## Core entities

### Project

- stable project ID
- repository/folder identity
- local/SSH/relay execution context
- build/test adapters
- project policy
- created/updated timestamps

### Task

- stable task ID
- project ID
- title and goal
- acceptance criteria
- priority and risk
- status
- parent task/milestone
- created/updated timestamps

### AgentRun

- run ID
- task ID
- agent definition ID
- provider/model identity
- workspace/worktree ID
- prompt/input reference
- lifecycle state
- start/end timestamps
- normalized outcome summary
- provider usage/cost/local-performance metrics where available

### WorkspaceRecord

Supports both Git worktrees and folder workspaces.

- workspace ID
- project ID
- kind: worktree | folder
- execution host identity
- path/reference
- branch/base SHA when applicable
- owning run ID when applicable
- dirty/clean observation
- promotion state

### BuildRecord

- build ID
- project/workspace ID
- commit SHA when applicable
- build adapter and command identity
- platform/host
- result
- warnings/errors summary
- log/artifact references
- timestamps

### TestRun

- test-run ID
- project/workspace/build ID
- suite identity
- pass/fail/skip counts
- failed-case references
- duration
- evidence references

### RuntimeCheck

- runtime-check ID
- scenario ID
- target application/environment
- evidence state
- observed result
- evidence references
- defect references

### Defect

- defect ID
- severity
- title/reproduction
- status
- suspected/confirmed root cause
- owning task/run
- regression-test reference

### Evidence

- evidence ID
- kind: screenshot | video | log | diff | artifact | structured-record
- producer
- timestamp
- immutable hash/reference where practical
- related task/run/build/test/runtime-check

### Approval

- approval ID
- actor identity
- requested action
- scope
- decision
- reason
- timestamp

## Evidence states

The ledger uses these normalized states when recording verification:

- `verified-source`
- `verified-build`
- `verified-automated`
- `verified-runtime`
- `fail`
- `not-tested`
- `deferred`

These states are intentionally non-interchangeable. A later layer may aggregate them for dashboards, but the stored evidence classification must remain explicit.

## Event/history requirements

Every consequential state change should be attributable and ordered. The persistence layer supports an append-only event history with:

- stable event and aggregate IDs;
- monotonically increasing local sequence numbers;
- project and aggregate history queries;
- actor attribution;
- correlation/causation IDs;
- JSON payloads;
- schema migration;
- transactional batch append;
- local crash recovery through SQLite durability;
- later replication cursors through sequence-based reads.

Current entity snapshots/projections are deliberately deferred; they should be derived from the ledger rather than create a second source of truth.

## Persistence decision — foundation v1

Code Fusion uses a dedicated profile-sidecar SQLite database named `code-fusion-ledger.sqlite3` for orchestration history.

Why this is separate from the existing Orca profile JSON store:

- Orca's `Store` owns settings, workspace/session and profile state in `orca-data.json` with scheduled whole-state persistence.
- The ledger is append-heavy and can grow substantially as agents, builds, tests and runtime certification emit evidence.
- Appending audit/event history to the JSON store would cause unrelated multi-megabyte state rewrites and couple ledger retention to UI/session state.
- Electron 43 runs on Node 24.x, where the built-in `node:sqlite` API is available, so Code Fusion can use transactional SQLite without adding a native npm/ORM dependency.

The v1 implementation is backend-only and synchronous. It is intentionally not mounted into renderer state or startup yet. Before high-volume production use, the service boundary must decide whether SQLite work executes on a worker/background host so main-thread latency remains bounded.

### Schema v1

`code_fusion_ledger_events`

- `sequence INTEGER PRIMARY KEY AUTOINCREMENT`
- `event_id TEXT UNIQUE NOT NULL`
- `occurred_at TEXT NOT NULL`
- `project_id TEXT`
- `aggregate_type TEXT NOT NULL`
- `aggregate_id TEXT NOT NULL`
- `event_type TEXT NOT NULL`
- `payload_json TEXT NOT NULL`
- actor kind / actor ID
- source
- correlation ID / causation ID

Indexes cover aggregate history, project history and correlation history. `PRAGMA user_version` owns schema migration versioning.

## Authority boundaries

- Git is authoritative for refs, commits and worktree facts.
- The execution host is authoritative for process liveness.
- The native intelligence runtime is authoritative for loaded-model/runtime state.
- Code Fusion policy is authoritative for workflow approvals and promotion decisions.
- The ledger records the latest normalized observations and Code Fusion decisions with provenance.

Loss of contact with an SSH/relay host must use inherited Orca semantics: `live`, `unverifiable`, or `exited`. The ledger must not treat disconnection as proof of process death.
