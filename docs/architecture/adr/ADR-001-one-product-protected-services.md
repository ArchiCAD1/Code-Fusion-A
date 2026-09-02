# ADR-001 — One Product, Protected Internal Services

Status: Accepted
Date: 2026-09-01

## Context

Code Fusion is intended to be one user-facing application that combines Orca-derived engineering orchestration with Nativ-derived native local intelligence. The two upstream products use materially different implementation stacks and runtime assumptions. A direct source-tree mashup would increase crash coupling, memory contention, platform coupling, and maintenance cost.

## Decision

Code Fusion will ship as one product and one application identity while using protected internal services/helpers where isolation is valuable.

- The Orca-derived desktop shell remains the primary application host.
- Native local-intelligence workloads run behind a versioned service boundary.
- A native-runtime crash or model OOM must not terminate the engineering workspace.
- The renderer must not directly own privileged model-process lifecycle or unrestricted native execution.
- Internal service boundaries are implementation details; the user should not need to launch or manage a second Nativ application.

## Consequences

Positive:
- fault isolation
- clean provider abstraction
- independently testable runtime
- future Windows/Linux substitution without redesigning the product shell
- clearer security ownership

Costs:
- IPC/API versioning
- packaging and lifecycle management
- extra integration tests
- explicit crash/restart behavior

## Non-goals

This ADR does not select the final IPC transport. Initial bridge work may use Nativ's existing loopback API to prove the seam before a tighter packaged transport is chosen.
