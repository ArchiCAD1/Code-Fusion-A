# Code Fusion Architecture

This directory contains architecture records for the Code Fusion product layer added to the Orca-derived host. Existing Orca architecture and reference documentation remains authoritative for inherited behavior unless a Code Fusion ADR explicitly changes that behavior.

## Phase 0 foundation

- `SOURCE_BASELINE.md` — immutable source-level starting point for Code-Fusion-A and Code-Fusion-B.
- `adr/ADR-001-one-product-protected-services.md` — one user-facing application with protected internal services.
- `adr/ADR-002-orchestration-ledger-source-of-truth.md` — durable workflow coordination record.
- `adr/ADR-003-native-intelligence-provider-contract.md` — versioned, transport-agnostic local intelligence seam.

## Architectural boundaries

### Desktop host

The Orca-derived application remains responsible for workspace, editor, terminals, worktrees, source control, remote execution, agent session orchestration, browser, computer use and mobile/relay integration.

### Native intelligence

Apple-Silicon local model workloads are introduced behind `src/shared/code-fusion/native-intelligence-contract.ts`. The first bridge may target the existing Nativ loopback APIs to prove compatibility. The final packaged transport is intentionally not selected yet.

### Orchestration ledger

The ledger coordinates Code Fusion workflow state. It records observations and decisions; it does not replace Git, process-host state, or native-runtime state as the authority for their native facts.

## Change discipline

1. Preserve upstream behavior until a change is explicitly owned by Code Fusion.
2. Add or update an ADR for architectural decisions that change subsystem ownership, persistence, wire compatibility, permissions or provider contracts.
3. Keep cross-platform, SSH, folder-workspace and mixed-version remote-client behavior in scope.
4. Separate `VERIFIED-SOURCE`, `VERIFIED-BUILD`, `VERIFIED-AUTOMATED` and `VERIFIED-RUNTIME` evidence.
5. Record upstream provenance before or with substantive code extraction.
