# ADR-002 — The Orchestration Ledger Is the Coordination Source of Truth

Status: Accepted
Date: 2026-09-01

## Context

Code Fusion will coordinate desktop sessions, CLI agents, local models, worktrees, builds, tests, runtime checks, mobile clients, and external orchestrators. Those participants cannot safely infer project truth from one another's transient UI state or chat history.

## Decision

Code Fusion will introduce a durable Orchestration Ledger as the authoritative coordination record for Code Fusion-owned workflow state.

The ledger owns records for:

- projects
- tasks
- agent runs
- worktrees/workspaces
- builds
- test runs
- runtime checks
- defects
- evidence
- approvals

The underlying domain systems remain authoritative for their own native facts: Git owns repository state, the process host owns process state, and the native model runtime owns model/runtime state. The ledger records normalized observations and Code Fusion workflow decisions; it does not replace those systems.

## Evidence vocabulary

Runtime and certification records use explicit states:

- `verified-source`
- `verified-build`
- `verified-automated`
- `verified-runtime`
- `fail`
- `not-tested`
- `deferred`

A source-level observation must never be promoted automatically to a build or runtime pass.

## Storage direction

Start local and durable. SQLite is the leading implementation candidate, but the persistence engine is not locked by this ADR. The data model must support ordered history/event records so changes can be audited and synchronized later.

## Consequences

- Desktop and mobile can converge on one task/agent state.
- External orchestrators can query structured state instead of scraping UI.
- Multi-agent comparisons can be evidence-based.
- More explicit migration/versioning work is required for persistent state.
