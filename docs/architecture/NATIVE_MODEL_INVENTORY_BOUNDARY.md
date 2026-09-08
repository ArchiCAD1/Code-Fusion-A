# Native Model Inventory Trust Boundary

Status: **VERIFIED-SOURCE; focused/full repository/macOS runtime pending**

The first Code Fusion native-intelligence bridge reads the Nativ-compatible OpenAI model-list route. Although the server is loopback-only, its response is still external process input and must not receive unlimited memory or implicit trust.

## Enforced limits

- Base URL must be a clean loopback HTTP(S) origin.
- Requests use GET and optional Bearer authorization only.
- The complete response body is consumed or cancelled.
- Declared or streamed response bodies above 1 MiB are rejected.
- Model-list arrays above 4,096 entries are rejected.
- Model identifiers above 512 characters are ignored.
- Empty, non-string, and duplicate identifiers are ignored.
- Result order follows the first valid occurrence from the server.
- Health errors are limited to 1,000 characters and redact Bearer, token, API-key, and authorization values.

## Deliberately narrow interpretation

The provider consumes only the OpenAI-compatible `data[].id` contract. It does not infer model capabilities, memory requirements, pinning, storage volume, quantization, compatibility, or loaded state from unversioned fields.

Richer Model Hub metadata must come from a separately designed and versioned library/management contract. The public `/v1/models` route remains a readiness and minimal inventory seam.

## Non-goals

This hardening does not add:

- model download, load, unload, pin, delete, or relocation;
- server start/stop;
- arbitrary endpoint access;
- renderer credential access;
- remote hosts;
- a visible Model Hub surface.

## Required verification

1. Full Code Fusion TypeScript and Vitest suites.
2. Live Nativ `/v1/models` response below limits.
3. Oversized declared and chunked-response fault tests against the host HTTP client.
4. Runtime timeout/abort behavior under Electron's Chromium network stack.
5. Confirm current Nativ model lists stay comfortably below the 1 MiB / 4,096-entry limits.
6. Repeat the read-only native-intelligence certification against the audited donor runtime.

No runtime or full-build pass is inferred from source review.
