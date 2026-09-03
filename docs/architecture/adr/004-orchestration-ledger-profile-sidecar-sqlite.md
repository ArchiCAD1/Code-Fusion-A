# ADR-004 — Orchestration Ledger Uses a Profile-Sidecar SQLite Database

Status: Accepted for foundation v1
Date: 2026-09-02

## Context

Code Fusion needs a durable, queryable, append-heavy coordination history for tasks, agent runs, workspaces, builds, tests, runtime checks, evidence and approvals. Orca already persists profile/settings/workspace/session state through a JSON `Store` backed primarily by `orca-data.json`.

The ledger has a different workload: event history can grow continuously and should support transactions, cursors, indexes and later replication without rewriting unrelated UI/session state.

The host targets Electron 43 / Node 24.x and already carries current Node typings. Node's built-in `node:sqlite` is therefore available without adding a native npm database addon or ORM.

## Decision

Code Fusion foundation v1 will:

1. keep the existing Orca `Store` authoritative for its current responsibilities;
2. store orchestration history in a dedicated profile-sidecar `code-fusion-ledger.sqlite3`;
3. use built-in `node:sqlite` in backend/main-process code only;
4. use `PRAGMA user_version` for schema migration;
5. make the event log append-only through the public store contract;
6. use monotonically increasing local sequence numbers as replication/read cursors;
7. preserve project/aggregate/event IDs independently from UI component identity;
8. reuse Orca secure profile-path hardening;
9. keep renderer/startup mounting out of the persistence-foundation PR;
10. decide the worker/background execution boundary before sustained high-volume event emission.

## Consequences

### Positive

- no new native npm dependency or ORM;
- avoids growing and repeatedly rewriting `orca-data.json`;
- atomic batch append and crash-safe transaction semantics;
- efficient project/aggregate/correlation queries;
- clear schema migration/version boundary;
- later projections and sync can consume the same ordered event stream.

### Tradeoffs

- `DatabaseSync` is synchronous; production traffic must not be allowed to introduce unbounded main-thread stalls;
- Electron/Node SQLite compatibility must be included in build/runtime certification;
- database and WAL lifecycle/backup behavior must be treated separately from JSON profile persistence;
- schema evolution now requires explicit migrations.

## Non-goals

This ADR does not authorize renderer database access, network database exposure, live event emission, or replacing Git/runtime/provider authorities with ledger guesses. The ledger records Code Fusion decisions and normalized observations with provenance.
