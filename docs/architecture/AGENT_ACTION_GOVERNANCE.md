# Agent Action Governance

Status: shared contract / not mounted into execution yet

Code Fusion separates **capability grants** from **per-action policy**. This follows the strongest lesson from the OpenBot audit while preserving Code Fusion's existing execution APIs and approval surfaces.

A grant answers:

> May this agent use this class of capability at all?

Policy answers:

> May this particular action happen now?

Both must permit the action before it can execute. Missing information fails closed.

## Decision flow

```text
agent requests action
        |
        v
capability granted? ---- no ----> DENY
        |
       yes
        |
        v
policy evaluated? ------ no ----> DENY
        |
       yes
        |
        +---- deny ----------------> DENY
        |
        +---- require approval ----> WAIT FOR HUMAN
        |
        +---- allow ---------------> FORWARD TO EXISTING EXECUTION HOST
```

The shared `resolveAgentActionGovernance()` helper implements only this combination logic. It is deliberately **not** a policy language and does not execute anything.

## Initial effect vocabulary

The first contract names effects instead of individual tool names so authorization survives transport/tool renames:

- workspace reads and writes
- process execution
- Git reads and writes
- browser reads and mutations
- computer control
- MCP reads and writes
- model reads and mutations
- agent management
- credential management

A future gateway maps concrete Orca/Code Fusion operations to these effects at the execution host. Unknown effects are not treated as permission.

## Security properties

- A grant does not waive policy.
- Policy allow does not manufacture a missing grant.
- Missing policy denies.
- Human approval never forwards before approval is resolved.
- The shared result contains no command, file contents, URL credentials, tokens, or arbitrary tool arguments.
- Skills remain instructions. Enabling a skill does not grant its requested tools.
- External AG-UI agents, local models, cloud agents, mobile clients, and future ChatGPT control clients all pass through the same governance semantics before mutation.

## Integration rule

Do not replace Orca's existing process, browser, terminal, Git, MCP, or computer-use implementations. The eventual host gateway must sit **in front of** those execution paths, reuse their host ownership and cancellation behavior, and emit Ledger evidence around the decision and result.

A production integration must record enough evidence to answer:

1. who requested the action;
2. which effect class was requested;
3. whether the capability was granted;
4. what policy verdict applied;
5. whether human approval was required and resolved;
6. which execution host owned the action;
7. whether execution succeeded, failed, or became unverifiable.

## Deferred policy-engine choice

OpenBot currently uses CEL expressions with deny-before-allow, default-deny, dry-run, and fail-closed evaluation. Code Fusion adopts those **semantics as requirements to evaluate**, not the dependency yet. Before selecting CEL or another expression engine we must audit:

- Orca's existing approval and policy abstractions;
- remote/SSH/relay compatibility;
- expression sandboxing and denial-of-service bounds;
- deterministic serialization for Ledger evidence;
- renderer-safe rule editing;
- migration/versioning requirements.

That prevents a useful governance idea from becoming a second policy subsystem that fights existing Code Fusion behavior.
