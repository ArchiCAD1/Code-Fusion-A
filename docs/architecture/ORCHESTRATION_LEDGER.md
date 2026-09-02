# Orchestration Ledger — Initial Domain Model

Status: Architecture draft
Date: 2026-09-01

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

Every consequential state change should be attributable and ordered. The persistence layer should support:

- entity snapshots/current state;
- appendable change/event history;
- actor attribution;
- schema migration;
- local crash recovery;
- later replication to a paired mobile/remote client without changing local execution authority.

## Initial persistence direction

SQLite is the leading local persistence candidate because it is durable, transactional, queryable and available on every desktop platform. This document does not lock a library or ORM. Before implementation, inspect existing Orca persistence/database abstractions and extend them when they satisfy the requirements.

## Authority boundaries

- Git is authoritative for refs, commits and worktree facts.
- The execution host is authoritative for process liveness.
- The native intelligence runtime is authoritative for loaded-model/runtime state.
- Code Fusion policy is authoritative for workflow approvals and promotion decisions.
- The ledger records the latest normalized observations and Code Fusion decisions with provenance.

Loss of contact with an SSH/relay host must use inherited Orca semantics: `live`, `unverifiable`, or `exited`. The ledger must not treat disconnection as proof of process death.
