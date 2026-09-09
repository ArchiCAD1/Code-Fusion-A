# AG-UI Adapter Boundary

Status: architecture foundation / source contract only

Code Fusion adopts **AG-UI as an external agent interaction protocol**, not as a replacement for the Code Fusion runtime, Orchestration Ledger, worktree/folder-workspace model, or native-intelligence provider contract.

## Boundary

```text
AG-UI agent endpoint
        |
        v
host-owned AG-UI adapter
        |
        v
Code Fusion agent/session runtime
        |
        +--> renderer / human-in-the-loop UI
        +--> bounded tools / computer use
        +--> Orchestration Ledger evidence
```

The first committed seam is `src/shared/code-fusion/external-agent-endpoint-contract.ts`. It intentionally exposes only renderer-safe endpoint metadata. Endpoint URLs, authorization headers, tokens, cookies, provider credentials, and transport handles remain host-owned and must not cross the preload boundary.

## Why AG-UI

CopilotKit describes AG-UI as the Agent-User Interaction protocol and its current SDK exposes generic HTTP agents through `@ag-ui/client`. OpenBot uses the same boundary to accept agents implemented with different frameworks while keeping governance in the host application. That is the interoperability property Code Fusion needs: an external agent should not require a new UI or a second orchestration system.

## Protocol roles

- **AG-UI**: agent-to-application interaction and streaming user-visible state.
- **MCP**: tools and external context. AG-UI does not replace Code Fusion's MCP/plugin boundaries.
- **A2A or equivalent handoff protocols**: optional future agent-to-agent coordination. They do not become the Code Fusion source of truth.
- **Orchestration Ledger**: authoritative Code Fusion record of tasks, runs, evidence, approvals, and promotion decisions.

## Security rules

1. External endpoints are registered and owned by the main process or execution host. The renderer receives only `ExternalAgentEndpointSummary`.
2. Authentication material is write-only from the UI perspective. The renderer may know that auth is `host-managed`; it must never receive the secret.
3. Endpoint registration must validate scheme, redirects, DNS/address targets, and execution-host policy before connection. A simple string allowlist is insufficient against redirect or DNS-rebinding risks.
4. Unknown protocol capabilities fail closed. Capability discovery must not manufacture permissions.
5. Tool calls remain subject to Code Fusion authorization and execution-host policy even when the AG-UI agent requests them.
6. Human-in-the-loop interruptions map to Code Fusion approval/decision surfaces; the external agent does not get a separate approval authority.
7. Computer-use takeover must have one owner at a time. Agent actions are refused while a human owns the control surface.
8. Generative UI is registry-based. External agents may request known, schema-validated components; arbitrary executable React/JavaScript from an endpoint is not accepted.
9. Remote execution preserves Code Fusion's `live` / `unverifiable` / `exited` vocabulary. Connection loss is not evidence that an external run died.
10. All externally requested mutations must be recordable in the Orchestration Ledger before promotion to a production control path.

## Compatibility rules

Code Fusion clients and execution hosts update independently. New AG-UI adapter capabilities therefore require negotiation. The shared summary contract is versioned independently from the AG-UI wire protocol so Code Fusion can evolve its renderer-safe representation without pretending it owns AG-UI.

The initial adopted capability vocabulary is deliberately bounded:

- streaming
- tool calls
- shared state
- human-in-the-loop
- generative UI
- computer use
- background runs
- subagents
- multimodal input/output

Adding a capability is a Code Fusion review decision because renderer affordances and permissions may depend on it.

## Dependency policy

Do **not** add the full CopilotKit UI/runtime stack merely to speak AG-UI. The first runtime adapter should evaluate the smallest compatible AG-UI packages (`@ag-ui/core` / `@ag-ui/client`) or an independently implemented standards adapter, then measure bundle/runtime impact against Orca's existing transport abstractions.

CopilotKit Intelligence is not a required Code Fusion dependency. Code Fusion must continue to run with its own local/project/session persistence and the Orchestration Ledger.

## Promotion gates

Before an AG-UI endpoint becomes user-configurable:

- choose and pin the minimal protocol dependency, if any;
- audit its license and transitive dependency surface;
- implement host-owned endpoint registration and secret storage;
- add SSRF/redirect/private-address negative tests;
- add capability negotiation tests;
- route requested tools through the existing Code Fusion authorization boundary;
- map interruptions to the existing approval UI;
- record run/tool/approval evidence in the Ledger;
- verify local, SSH, relay, folder-workspace, and mixed-version behavior;
- run mounted Electron tests against at least one real AG-UI endpoint.
