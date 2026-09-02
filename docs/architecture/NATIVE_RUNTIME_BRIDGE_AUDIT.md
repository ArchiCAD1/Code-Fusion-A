# Native Runtime Bridge Audit

Status: `VERIFIED-SOURCE`
Date: 2026-09-01
Donor baseline: `ArchiCAD1/Code-Fusion-B@64dadb98ee61c3687044d3cc54eebe3f5b36fbea`

This document records the source-grounded API seam used for the first Code Fusion native-intelligence bridge. It does not claim a macOS runtime pass.

## Donor findings

The frozen Code-Fusion-B donor contains Nativ's integration workflow and native server kit. The donor implementation:

- uses `http://127.0.0.1:8080` as the default local server address;
- supports an optional server API key sent as a Bearer token;
- treats `GET /v1/models` as part of the public inference API and uses it as the listener/readiness check;
- exposes model loading separately through `POST /v1/models/load`;
- exposes `/health`, `/metrics` / `/v1/metrics`, OpenAI-compatible inference endpoints, Anthropic-compatible messages, images, audio and embeddings;
- separates the SwiftUI application shell from `NativServerKit`.

The donor's own `IntegrationsView.swift` explicitly documents that `/v1/models` proves the inference listener is ready and is not itself a management operation.

## Code Fusion bridge v0 scope

The first host adapter is intentionally read-only:

- readiness via `GET /v1/models`;
- model inventory via `GET /v1/models`;
- optional Bearer authorization when configured;
- loopback-only base URL;
- no model load/unload;
- no downloads/deletion;
- no shell execution;
- no process lifecycle mutation;
- no renderer exposure yet.

This keeps the first fusion step reversible and low-risk. Native mutations are gated until the read bridge has automated and macOS runtime evidence.

## Host reuse decisions

### HTTP

The adapter uses Orca's existing `MainHttpClient` port instead of introducing another network stack or a new bare `fetch` call. This preserves Electron/Node host behavior and the repository's network audit boundary.

Every response body is consumed before the adapter returns or throws. Orca explicitly audits unread global-fetch bodies because an unread undici response can terminate a Node process.

### Persistence

No persistence is added by the read bridge. When the Orchestration Ledger begins implementation, the leading reuse target is Orca's existing `src/main/sqlite/sync-database.ts` adapter rather than adding a second SQLite dependency.

## Capability reporting

Bridge v0 reports only source-verified runtime capabilities that are useful through the local inference boundary:

- chat
- responses
- vision
- images
- audio
- embeddings
- system metrics

It deliberately does **not** advertise `model-downloads` or `mcp` through this adapter yet. Those capabilities exist elsewhere in Nativ, but they are not implemented by this Code Fusion bridge increment.

Per-model capability metadata is not manufactured from `/v1/models`. Until the Code Fusion model library is connected to Nativ's richer local-model catalog, returned model descriptors are conservatively marked as local/installed and chat-capable only.

## Security boundary

Bridge v0 accepts only loopback HTTP(S) origins (`localhost`, `127.0.0.1`, or IPv6 loopback) with no embedded credentials, path, query or fragment. This prevents the local provider configuration from becoming a generic server-side request primitive.

Bearer credentials are placed only in the Authorization header and are trimmed before use. They must move to the Code Fusion secret-storage abstraction before a user-facing configuration surface ships.

## Verification state

| Evidence | State |
| --- | --- |
| Donor endpoint behavior inspected | VERIFIED-SOURCE |
| Host HTTP abstraction inspected | VERIFIED-SOURCE |
| Bridge implementation present | VERIFIED-SOURCE after bridge commit |
| Focused unit tests executed | NOT TESTED pending CI/local execution |
| Typecheck | NOT TESTED pending CI/local execution |
| macOS connection to running Nativ | NOT TESTED |
| Packaged one-app native helper | NOT TESTED / later phase |

## Next gate

Do not add model mutation or Model Hub UI until:

1. the bridge contract tests pass;
2. Code Fusion A typechecks;
3. a Mac connects the adapter to a running donor/native runtime and verifies the inventory returned from `/v1/models`;
4. any credentials are routed through an approved secret-storage boundary.
