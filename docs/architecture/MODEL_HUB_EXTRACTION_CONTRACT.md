# Code Fusion Model Hub — Extraction Audit and Contract Foundation

Date: 2026-09-03  
Status: **VERIFIED-SOURCE / CONTRACT-ONLY / MUTATIONS-NOT-EXPOSED**

## Purpose

Code Fusion is one product, but its model-management implementation must remain separated from the
Electron renderer and from Nativ's SwiftUI application shell. This document maps the current Nativ
donor pipeline into a Code Fusion-owned Model Hub domain contract before any download, load, remove,
or filesystem operation is exposed.

The source audit uses the isolated Code-Fusion-B refresh candidate at Nativ upstream commit
`e7679818e14851e4a9c4c910286e81dc5f3d50bb`.

## Existing Code Fusion foundation

`NativeIntelligenceProvider` already defines optional native-runtime capabilities for model
inventory, download, cancellation, removal, load/unload, and system metrics. The current desktop
integration intentionally exposes only read-only readiness, inventory, renderer state, and bounded
certification.

The new `model-hub-contract.ts` does not widen that IPC surface. It defines a pure domain boundary
that later coordinators can implement behind explicit security and lifecycle gates.

## Nativ donor behavior to preserve

### Catalog and discovery

The current donor:

- searches the Hugging Face model API over HTTPS;
- supports downloads, trending, likes, recently updated, and size ordering;
- supports ascending/descending presentation;
- maps Code Fusion-relevant capabilities to Hub pipeline tags and feature tags;
- expands model metadata for downloads, likes, tags, gating, SafeTensors, and config;
- excludes LM Studio community mirrors and optional GGUF files from MLX snapshots;
- de-duplicates merged capability searches;
- limits visible catalog pagination and concurrent curated-model requests;
- enriches each row once with provider, estimated size, capabilities, memory fit, and drafter kind;
- recognizes language, vision, video, image generation/editing, speech, embeddings, reranking,
  reasoning, tools, and speculative drafters.

### Memory and storage safety

The donor:

- estimates model bytes from SafeTensors metadata;
- requires a second quantization signal for potentially packed weights;
- reserves activation headroom rather than equating file size with safe load size;
- validates external cache references and expected volume identity;
- checks free disk capacity after reserving space for active downloads;
- uses a cache-relative repository directory and lock directory;
- does not rely on raw renderer-provided paths for safe storage ownership.

### Download lifecycle

The donor distinguishes:

- preparing;
- downloading;
- paused;
- retrying;
- finalizing;
- completion/failure/cancellation.

It supports:

- dry-run file/size discovery;
- resumable Hugging Face snapshot downloads;
- pause/resume through controlled subprocess signals;
- cancellation and explicit partial-download removal;
- asynchronous waiters for `downloadIfNeeded`;
- progress coalescing on approximately 100 ms intervals;
- transfer-speed smoothing and stale-speed removal;
- a distinct finishing presentation rather than displaying a false 100 percent;
- three bounded attempts after a stall;
- a 60-second active-transfer stall watchdog;
- a longer 10-minute finalization watchdog;
- bounded captured subprocess output;
- parent-process death detection;
- termination shutdown that cancels subprocesses while preserving resumable `.incomplete` files.

## Code Fusion ownership model

```text
Renderer / Mobile
  └─ Model Hub read state and explicit user intents
       └─ Main-process Model Hub coordinator
            ├─ consent / authorization policy
            ├─ secret broker
            ├─ opaque storage-target broker
            ├─ operation identity / deduplication
            ├─ Orchestration Ledger events
            └─ Native Intelligence provider
                 └─ Code Fusion native runtime helper
                      ├─ Hugging Face catalog/download implementation
                      ├─ local cache discovery
                      ├─ MLX model lifecycle
                      └─ system/memory metrics
```

### Renderer boundary

The renderer may receive:

- catalog/model descriptors;
- opaque storage-target summaries;
- availability and memory-fit assessments;
- download operation IDs and sanitized progress;
- legal actions for a published phase;
- sanitized failure codes/messages;
- runtime summary and model counts.

The renderer must not receive:

- Hugging Face or server tokens;
- raw filesystem paths;
- volume UUIDs;
- Python executable/script details;
- subprocess IDs/signals;
- arbitrary shell commands;
- unbounded subprocess output;
- direct SQLite or native-runtime handles.

## Contract v1

`src/shared/code-fusion/model-hub-contract.ts` establishes:

- versioned Model Hub domain ownership;
- normalized catalog queries and bounded pagination;
- renderer-safe model descriptors;
- public/gated/private availability;
- recommended/fits/tight/exceeds-memory assessments;
- opaque default/external storage targets;
- explicit download phases;
- bounded progress derived from byte counts;
- sanitized failure codes/messages;
- opaque download requests containing no token or path;
- legal pause/resume/cancel/retry actions by phase;
- runtime summary fields for future UI selectors.

## State machine

```text
available
  └─ download intent
       └─ queued
            └─ preparing
                 └─ downloading
                      ├─ paused ── resume ──> downloading
                      ├─ retrying ──────────> preparing/downloading
                      ├─ finalizing ────────> completed
                      ├─ failed ── retry ───> queued
                      └─ cancelled

completed
  └─ installed
       └─ loading
            └─ loaded
                 └─ unload ──> installed
```

The contract deliberately keeps catalog state, download-operation state, and runtime-loaded state
separate. A model may be discoverable while a previous failed/cancelled operation still has evidence.

## Mutation policy for later phases

Defining a request type does not authorize an operation. Before the first mutation IPC is added:

1. The native provider and Code Fusion A/B live-read bridge must pass Mac certification.
2. Download, load, unload, remove, and storage-target operations must use separate IPC channels.
3. Every request must carry an opaque request/operation ID for deduplication and evidence.
4. Tokens must come from a main/native secret broker, never a renderer payload.
5. Storage must be selected through an opaque registered target, never an arbitrary path.
6. Remove operations require explicit destructive confirmation and must reject loaded/active models.
7. Retry must never duplicate an uncertain active operation.
8. Progress must be monotonic for a stable total and bounded to `[0, 1]`.
9. Errors must use sanitized public codes/messages; raw process output remains diagnostic-only.
10. The Orchestration Ledger must record intent, start, state transitions, completion/failure, actor,
    storage target ID, model ID, and evidence references without storing credentials.

## Nativ features intentionally not copied into this contract

- SwiftUI views and `@MainActor` observable objects;
- Nativ application navigation/control panel;
- MarkdownUI, Highlightr, and SwaTex presentation dependencies;
- raw Python download scripts in shared TypeScript;
- direct POSIX signals from the Electron renderer;
- Nativ-specific global singletons;
- application settings ownership;
- model-removal implementation;
- server-management credentials.

Those behaviors may be reused behind the native helper, adapted independently, or rejected after
runtime testing. Code Fusion A remains the product UI and orchestration authority.

## Verification gates

Before promoting the contract into a live Model Hub:

### Source and automated

- strict TypeScript compile;
- focused contract/normalization tests;
- full repository typecheck and Vitest;
- IPC schema tests proving credentials/paths cannot cross the renderer boundary.

### Native runtime

- Code-Fusion-B Gates A-G from
  `Docs/code-fusion/NATIV_UPSTREAM_COMPATIBILITY_2026-09-03.md`;
- catalog search/filter/pagination against Hugging Face;
- gated/private model behavior;
- external cache disconnect/reconnect and volume mismatch;
- disk-capacity reservation with concurrent downloads;
- pause/resume/cancel/remove and app termination;
- stall/retry/finalization watchdogs;
- load/unload under memory pressure.

### Product integration

- one Code Fusion Model Hub surface;
- no visible Nativ window required;
- Code Fusion restart preserves truthful operation state/evidence;
- mobile sees sanitized progress and can only perform allowed actions;
- ChatGPT/MCP mutation tools remain absent until separately reviewed;
- all consequential actions are attributable in the Orchestration Ledger.

## Current decision

Proceed with the pure contract and source audit only. Keep the visible Model Hub and every mutation
API gated until full repository validation and the refreshed Nativ runtime pass on the Mac.
