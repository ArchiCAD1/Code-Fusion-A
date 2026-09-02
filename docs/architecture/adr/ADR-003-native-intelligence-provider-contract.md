# ADR-003 — Native Intelligence Uses a Versioned Provider Contract

Status: Accepted
Date: 2026-09-01

## Context

Code Fusion must use Nativ-derived local model capabilities on macOS without hard-wiring the entire application to one native runtime implementation. The desktop shell also needs to keep working on Windows and Linux where MLX is unavailable.

## Decision

Introduce a small shared `NativeIntelligenceProvider` contract in the Code Fusion host before moving any substantive native implementation into the repository.

The contract must:

- be versioned independently from the application version;
- expose health, capabilities and model inventory;
- distinguish runtime lifecycle from model lifecycle;
- make optional capabilities explicit instead of assuming every runtime supports chat, vision, images, audio and embeddings;
- support cancellation for long-running operations;
- avoid exposing an unrestricted shell or generic privileged command method;
- remain transport-agnostic so loopback HTTP can prove the first bridge and a packaged IPC transport can replace it later;
- degrade safely on platforms with no native intelligence provider.

## Initial capability vocabulary

- `chat`
- `responses`
- `vision`
- `images`
- `audio`
- `embeddings`
- `model-downloads`
- `system-metrics`
- `mcp`

## Compatibility

Adding optional fields/capabilities is backward compatible. Renaming/removing fields or changing the meaning of existing states requires a protocol version change and adapter support where mixed versions can occur.

## Consequences

- The host can build against mocks before the native runtime is packaged.
- Nativ-derived implementation can be replaced or upgraded without rewriting the UI.
- Windows/Linux can provide alternative local runtimes later.
- Contract tests become an explicit release gate.
