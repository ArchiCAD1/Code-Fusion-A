# Reference Donor Extraction Audit

Status: source-audited reference plan

This document records how Code Fusion will use three additional open-source references without turning the product into a collection of competing application shells.

## Audited baselines

| Reference | Baseline | License | Code Fusion role |
| --- | --- | --- | --- |
| Templeton Technologies Radiant | `templetongroup/radiant` `master` at `2e8852b4ce91f2ebc05258543bbac75c6b984d9a` | MIT, Copyright (c) 2026 Templeton Technologies | Local coding-harness, agent-loop, provider, tool-safety, mobile, and release reference |
| CopilotKit OpenBot | `CopilotKit/OpenBot` `main` at `06633a4b61c0794d97829c4d856ba4b2da869ab3` | MIT, Copyright (c) 2026 CopilotKit | Governed coworker, per-agent computer, audit, policy, and AG-UI host reference |
| CopilotKit | `CopilotKit/CopilotKit` `main` at `b17e238aa31a7711879042d9e17fa5801bd40e58` | MIT, Copyright (c) Atai Barkai | AG-UI client/frontend, human-in-the-loop, shared-state, and generative-UI reference |

These are reference baselines, not vendored dependencies. Re-audit the current upstream head before substantive source extraction.

## Product decision

Code Fusion remains one application:

- Code-Fusion-A / Orca-derived host remains canonical.
- Code-Fusion-B / Nativ remains the native MLX/model-runtime donor.
- Radiant, OpenBot, and CopilotKit are reference donors.
- No donor application shell becomes a second user-facing Code Fusion product.
- No donor becomes a second source of task/run/project truth beside the Orchestration Ledger.

## ADOPT / ADAPT / REJECT

### Radiant

| Capability / lesson | Decision | Code Fusion action |
| --- | --- | --- |
| Provider-neutral conversation history | ADAPT | Preserve Orca's session model; add provider adapters rather than moving session authority into a provider-specific format. |
| Stable vs volatile prompt content for provider caching | ADAPT | Audit Code Fusion prompt assembly and introduce cache-stable boundaries only where provider semantics support them. |
| Turn token ceiling plus repeated-identical-call detector | ADAPT | Add a bounded runaway guard only after auditing Orca's existing agent runtime budgets/cancellation. Do not copy Radiant's numeric limits blindly. |
| Aging/compaction of old tool results | ADAPT | Measure Code Fusion session payload growth, then compact transport context without deleting durable transcript/evidence. |
| Fetched web content explicitly marked untrusted | ADOPT CONCEPT | Apply at the browser/web-to-agent ingestion boundary; fetched data never gains instruction authority merely because a model can read it. |
| Outside-workspace write detection and approval | ADOPT CONCEPT | Extend Code Fusion's execution-host authorization; preserve legitimate skills/config reads while refusing silent mutation outside the workspace. |
| Background shell jobs | REJECT AS NEW SUBSYSTEM | Orca already owns terminal/process/runtime execution. Reuse and harden it instead of importing Radiant's in-memory job map. |
| Dock-launched PATH repair | AUDIT / ADAPT | Verify Orca's existing environment/execution-host abstraction before changing anything. The problem is real; duplicate PATH logic is not acceptable. |
| Subscription OAuth using public vendor CLI clients | REJECT FOR NOW | Radiant explicitly labels these flows unofficial. Code Fusion will not copy client IDs or rely on vendor-subscription token behavior without provider-policy review. |
| Packaged-app verification and release discipline | ADOPT | Keep source/unit/build/runtime evidence distinct and verify the installed product surface, not only dev-server mechanisms. |

### OpenBot

| Capability / lesson | Decision | Code Fusion action |
| --- | --- | --- |
| Any AG-UI agent becomes a coworker/channel | ADOPT | Add an AG-UI adapter boundary while keeping Code Fusion session/runtime authority. First renderer-safe endpoint contract is committed with this audit. |
| Decide-before-act gateway + record-after audit | ADOPT | Align tool/computer/model mutations with Code Fusion authorization and Ledger evidence. No external agent bypasses host policy. |
| Fail-closed policy | ADOPT | Missing, broken, or ambiguous authorization cannot widen access. |
| Per-agent computer/browser/workspace isolation | ADAPT | Map to Code Fusion worktrees/folder workspaces/execution hosts; evaluate stronger optional sandboxing rather than forcing a container per desktop agent. |
| Human take-the-wheel | ADAPT | Reuse Code Fusion computer-use surfaces with explicit single-owner handoff and Ledger events. |
| Write-only credentials | ADOPT | Renderer may configure/reference a credential but must not read the stored secret back. |
| Governed MCP catalogue and per-tool grants | ADAPT | Extend existing plugin/MCP integration with capability/grant metadata; do not build a parallel MCP stack. |
| Skills are instructions, not implicit capabilities | ADOPT | Skill activation never grants tool permission by itself. |
| Routines with failure caps | ADAPT | Reuse Code Fusion automation/scheduling ownership; add bounded failure suspension rather than a second scheduler. |
| PostgreSQL/CopilotKit Intelligence as durable thread authority | REJECT AS REQUIREMENT | Code Fusion retains local/project/session persistence plus the Ledger. Optional enterprise backends may be adapters later. |
| Kubernetes/one container per bot as desktop default | REJECT AS DEFAULT | Valuable for enterprise deployment, disproportionate for the native desktop default. Keep as future remote-execution mode. |

### CopilotKit

| Capability / lesson | Decision | Code Fusion action |
| --- | --- | --- |
| AG-UI protocol | ADOPT AT BOUNDARY | External interoperability protocol; not Code Fusion's internal source of truth. |
| Generic `HttpAgent` style connection | ADAPT | Implement a host-owned adapter after dependency/transport audit. |
| Human-in-the-loop | ADOPT SEMANTICS | Map interrupts/approval needs onto Code Fusion's approval surfaces and Ledger. |
| Shared agent/UI state | ADAPT | Only schema-bounded shared state; no agent may overwrite arbitrary renderer state. |
| Generative UI | ADAPT | Registry/schema-based components only. No arbitrary executable component payload from an agent. |
| Full CopilotKit UI replacement | REJECT | Code Fusion keeps its native product UX and design system. |
| CopilotKit Intelligence as mandatory persistence | REJECT | May become an optional connector, never a hard dependency for local Code Fusion. |
| Channels SDK | DEFER | Slack/Teams/mobile surfaces are valuable after desktop authority, security, and Ledger integration are stable. |
| Self-learning/CLHF | DEFER | Requires privacy, evidence, rollback, and evaluation design before product adoption. |

## Cross-donor architecture synthesized for Code Fusion

```text
                         Code Fusion UI
                              |
                    renderer-safe contracts
                              |
                 main / execution-host authority
                    /          |          \
                   /           |           \
          native/CLI agents   AG-UI      local MLX
             (Orca)          adapter       (Nativ)
                   \           |           /
                    \      authorization  /
                     \        boundary    /
                      +----------+--------+
                                 |
                      Orchestration Ledger
                                 |
                tasks / runs / tools / approvals / evidence
```

The important synthesis is not to merge three application frameworks. It is to keep Code Fusion's host/runtime authority and adopt the strongest boundaries the references demonstrate.

## Immediate implementation started by this audit

1. `external-agent-endpoint-contract.ts` establishes a versioned, renderer-safe external-agent summary with AG-UI as the first adopted protocol.
2. Endpoint URL and credential material are intentionally absent from that contract.
3. `AG_UI_ADAPTER_BOUNDARY.md` defines the host-only adapter, security, compatibility, generative-UI, and promotion rules.
4. ATTRIBUTIONS records all three reference baselines and license notices.

## Next implementation waves

### Wave A — AG-UI adapter proof

- choose minimal AG-UI dependency (`@ag-ui/core` / `@ag-ui/client`) only after package/transitive audit;
- create main-process adapter with host-owned URL/auth;
- map one read-only AG-UI agent into existing Code Fusion session state;
- expose no tool execution initially;
- add mounted local endpoint smoke and interruption/cancellation tests.

### Wave B — authorization gateway + Ledger evidence

- inventory existing Orca approvals/tool execution before adding policy code;
- normalize action classes without replacing existing execution APIs;
- fail closed on unresolved policy;
- record decision-before-act and result-after-act in the Ledger;
- add one-owner human computer takeover semantics.

### Wave C — runaway/context guard

- measure actual Code Fusion prompt/tool-result growth first;
- add transport-context compaction while preserving durable transcript;
- add repeated-call/stuck detection and token/round backstops with evidence;
- make cancellation interrupt long-running tool/process work through existing execution hosts.

### Wave D — safe generative UI and channels

- allowlist component registry with schemas and versioning;
- treat component rendering as presentation, not execution authority;
- evaluate Slack/Teams/mobile channel adapters only after desktop run authority and Ledger evidence are mounted.

## Explicit non-goals

- copying Radiant's Electron/server shell;
- replacing Orca sessions with CopilotKit threads;
- replacing Nativ MLX with Ollama/LM Studio as the native Code Fusion runtime;
- importing OpenBot's full Docker/Kubernetes topology into the desktop app;
- copying unofficial OAuth client IDs or subscription-token flows;
- allowing AG-UI, MCP, generative UI, or skills to bypass Code Fusion authorization;
- adding another persistent source of task/run truth beside the Ledger.
